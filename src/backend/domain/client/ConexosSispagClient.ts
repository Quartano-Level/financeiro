import { inject, injectable, singleton } from 'tsyringe';
import { z } from 'zod';
import type {
    BorderoAPagar,
    LoteSispag,
    TituloAPagar,
} from '../interface/sispag/SispagInterface.js';
import ConexosBaseClient from './ConexosBaseClient.js';

/**
 * ConexosSispagClient — leitura da superfície de PAGAMENTOS do Conexos (Escopo II).
 *
 * READ-ONLY por contrato: só usa `listGenericPaginated` (protocolo de query do
 * Conexos). Nenhuma escrita (`gerarRemessa`/`finalizarLote`/`baixas` ficam FORA
 * deste client — são Fatia 3, gated). Espelha o padrão dos demais Conexos*Client
 * (composição de `ConexosBaseClient`, Zod no boundary).
 *
 * Fontes (confirmadas em produção via probe read-only):
 *   - `fin064/list` → carteira de títulos a pagar
 *   - `fin015/list` → lotes SISPAG nativos
 *   - `fin010/list` (borVldTipo=2) → borderôs a-pagar (baixa)
 */

const PAGE_SIZE = 200;

/** Coerção tolerante de número (aceita string numérica; senão undefined). */
const numOpt = z.coerce.number().optional().catch(undefined);
const strOpt = z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .optional()
    .catch(undefined);
const boolFromFlag = z
    .union([z.number(), z.string(), z.boolean()])
    .transform((v) => v === 1 || v === '1' || v === true)
    .optional()
    .catch(false);

const tituloRowSchema = z
    .object({
        docCod: z.union([z.string(), z.number()]).transform(String),
        titCod: z.union([z.string(), z.number()]).transform(String).optional().catch('1'),
        dpeNomPessoa: strOpt,
        dpeNomPessoaFor: strOpt,
        titMnyValor: numOpt,
        moeEspSigla: strOpt,
        titDtaVencimento: numOpt,
        vldLib: boolFromFlag,
        vldPago: boolFromFlag,
        bncDesNome: strOpt,
        titNumRemessa: strOpt,
        pesCod: strOpt,
        tpdCod: strOpt,
        // sinais de "pronto para remessa" (informativo) — o que o fin064 já traz.
        itsVldModalidade: numOpt,
        pctNumBanco: strOpt,
        pctEspNumContaBanc: strOpt,
        titEspCodbar: strOpt,
        itsDesChavePix: strOpt,
    })
    .passthrough();

type TituloRow = z.infer<typeof tituloRowSchema>;

const loteRowSchema = z
    .object({
        flpCod: z.coerce.number(),
        bncDesNome: strOpt,
        conta: strOpt,
        layoutConta: strOpt,
        flpVldStatus: numOpt,
        flpVldConfEnvio: boolFromFlag,
        flpVldRet: boolFromFlag,
        titulosCount: numOpt,
        soma: numOpt,
        itensRetorno: numOpt,
        usnDesNomeFin: strOpt,
        flpDtaCredito: numOpt,
    })
    .passthrough();

const borderoRowSchema = z
    .object({
        borCod: z.coerce.number(),
        gerDes: strOpt,
        vlrTotalLiquido: numOpt,
        borDtaMvto: numOpt,
        borVldFinalizado: numOpt,
        vldHasRemessaPgto: boolFromFlag,
        vldHasBaixa: boolFromFlag,
    })
    .passthrough();

@singleton()
@injectable()
export default class ConexosSispagClient {
    public constructor(@inject(ConexosBaseClient) private readonly base: ConexosBaseClient) {}

    /** Body de query padrão do Conexos (`/list`). */
    private listBody = (
        serviceName: string,
        filterList: Record<string, unknown> = {},
        pageSize = PAGE_SIZE,
    ): Record<string, unknown> => ({
        fieldList: [],
        filterList,
        serviceName,
        pageNumber: 1,
        pageSize,
    });

    /** Mapeia uma linha do `fin064` para `TituloAPagar` (compartilhado por list/get). */
    private mapTitulo = (r: TituloRow, filCod: number): TituloAPagar => {
        // heurística informativa de "pronto para remessa" — o que o fin064 já traz.
        const temDestino =
            Boolean(r.pctNumBanco && r.pctEspNumContaBanc) ||
            Boolean(r.titEspCodbar) ||
            Boolean(r.itsDesChavePix);
        const temModalidade = r.itsVldModalidade !== undefined;
        return {
            docCod: r.docCod,
            titCod: r.titCod ?? '1',
            filCod,
            credor: r.dpeNomPessoa ?? r.dpeNomPessoaFor,
            valor: r.titMnyValor ?? 0,
            moeda: r.moeEspSigla,
            vencimento: r.titDtaVencimento,
            liberado: r.vldLib ?? false,
            pago: r.vldPago ?? false,
            banco: r.bncDesNome,
            numRemessa: r.titNumRemessa,
            pesCod: r.pesCod,
            tpdCod: r.tpdCod,
            prontoParaRemessa: temDestino || temModalidade,
        };
    };

    /**
     * Títulos a pagar de uma filial (`fin064/list`). Filtra server-side por
     * NÃO-pago + vencimento numa janela (default: dos últimos 30 dias em diante),
     * para o painel focar no que é relevante (a vencer + vencidos recentes) — sem
     * o filtro, o `fin064` devolve stragglers de anos atrás. Se o Conexos recusar
     * o filtro (400), cai para busca sem filtro (o serviço filtra em memória).
     */
    public listTitulosAPagar = async (
        filCod: number,
        opts: { minVencimento?: number; maxVencimento?: number } = {},
    ): Promise<TituloAPagar[]> => {
        const filtered: Record<string, unknown> = { 'vldPago#EQ': 0 };
        if (opts.minVencimento !== undefined) {
            filtered['titDtaVencimento#GE'] = opts.minVencimento;
        }
        if (opts.maxVencimento !== undefined) {
            filtered['titDtaVencimento#LE'] = opts.maxVencimento;
        }
        let rows: Record<string, unknown>[];
        try {
            const res = await this.base.listGenericPaginated<Record<string, unknown>>(
                'fin064/list',
                this.listBody('fin064', filtered, 1000),
                { filCod },
            );
            rows = res.rows;
        } catch {
            const res = await this.base.listGenericPaginated<Record<string, unknown>>(
                'fin064/list',
                this.listBody('fin064'),
                { filCod },
            );
            rows = res.rows;
        }
        return rows.flatMap((row) => {
            const parsed = tituloRowSchema.safeParse(row);
            if (!parsed.success) return [];
            return [this.mapTitulo(parsed.data, filCod)];
        });
    };

    /**
     * Leitura pontual e AUTORITATIVA de um título a pagar (`fin064/list` filtrado
     * por `docCod`). Usada na inclusão em lote para validar elegibilidade (I2) e
     * capturar o snapshot de valor/venc/credor no instante — espelha a anti-drift
     * de Permutas. Retorna `null` se o título não existir na leitura.
     */
    public getTituloAPagar = async (
        filCod: number,
        docCod: string,
        titCod: string,
    ): Promise<TituloAPagar | null> => {
        const { rows } = await this.base.listGenericPaginated<Record<string, unknown>>(
            'fin064/list',
            this.listBody('fin064', { 'docCod#EQ': docCod }, 200),
            { filCod },
        );
        for (const row of rows) {
            const parsed = tituloRowSchema.safeParse(row);
            if (!parsed.success) continue;
            const r = parsed.data;
            if (r.docCod !== docCod || (r.titCod ?? '1') !== titCod) continue;
            const titulo = this.mapTitulo(r, filCod);
            // Classe (nacional/internacional) é autoritativa via com298 — o fin064 não a traz.
            titulo.internacional = await this.isDocInternacional(filCod, docCod);
            return titulo;
        }
        return null;
    };

    /**
     * Classe do documento (`com298`): `ufEspSigla='EX'` = pagamento ao EXTERIOR
     * (internacional); qualquer UF brasileira = nacional. Leitura AUTORITATIVA
     * (anti-drift) usada no invariante I7 (lote uniforme). O `fin064` não traz `ufEspSigla`.
     */
    public isDocInternacional = async (filCod: number, docCod: string): Promise<boolean> => {
        const { rows } = await this.base.listGenericPaginated<Record<string, unknown>>(
            'com298/list',
            {
                fieldList: ['docCod', 'ufEspSigla'],
                filterList: { 'docCod#EQ': docCod },
                serviceName: 'com298',
                pageNumber: 1,
                pageSize: 50,
            },
            { filCod },
        );
        for (const r of rows) {
            if (String(r.docCod) === docCod) {
                return String(r.ufEspSigla ?? '').toUpperCase() === 'EX';
            }
        }
        return false;
    };

    /**
     * Conjunto de `docCod` INTERNACIONAIS (exterior) de uma filial — `com298` filtrado
     * por `ufEspSigla='EX'`. Usado na ingestão para classificar a carteira em massa.
     */
    public listExteriorDocCods = async (filCod: number): Promise<Set<string>> => {
        const { rows } = await this.base.listGenericPaginated<Record<string, unknown>>(
            'com298/list',
            {
                fieldList: ['docCod', 'ufEspSigla'],
                filterList: { 'vldStatus#IN': ['1', '3'], 'ufEspSigla#LIKE': 'EX' },
                serviceName: 'com298',
                pageNumber: 1,
                pageSize: 5000,
            },
            { filCod },
        );
        const set = new Set<string>();
        for (const r of rows) {
            if (r.docCod !== null && r.docCod !== undefined) set.add(String(r.docCod));
        }
        return set;
    };

    /** Lotes SISPAG nativos de uma filial (`fin015/list`). */
    public listLotes = async (filCod: number): Promise<LoteSispag[]> => {
        const { rows } = await this.base.listGenericPaginated<Record<string, unknown>>(
            'fin015/list',
            this.listBody('fin015', {}, 100),
            { filCod },
        );
        return rows.flatMap((row) => {
            const parsed = loteRowSchema.safeParse(row);
            if (!parsed.success) return [];
            const r = parsed.data;
            return [
                {
                    filCod,
                    flpCod: r.flpCod,
                    banco: r.bncDesNome,
                    conta: r.conta,
                    layoutConta: r.layoutConta,
                    status: r.flpVldStatus ?? 0,
                    envioConfirmado: r.flpVldConfEnvio ?? false,
                    retornoProcessado: r.flpVldRet ?? false,
                    titulosCount: r.titulosCount ?? 0,
                    soma: r.soma ?? 0,
                    itensRetorno: r.itensRetorno ?? 0,
                    finalizadoPor: r.usnDesNomeFin,
                    dataCredito: r.flpDtaCredito,
                } satisfies LoteSispag,
            ];
        });
    };

    /** Borderôs a-pagar (baixa) de uma filial (`fin010/list`, borVldTipo=2). */
    public listBorderosAPagar = async (filCod: number): Promise<BorderoAPagar[]> => {
        const { rows } = await this.base.listGenericPaginated<Record<string, unknown>>(
            'fin010/list',
            this.listBody('fin010', { 'borVldTipo#EQ': 2 }, 100),
            { filCod },
        );
        return rows.flatMap((row) => {
            const parsed = borderoRowSchema.safeParse(row);
            if (!parsed.success) return [];
            const r = parsed.data;
            return [
                {
                    borCod: r.borCod,
                    filCod,
                    descricao: r.gerDes,
                    valor: r.vlrTotalLiquido ?? 0,
                    data: r.borDtaMvto,
                    finalizado: r.borVldFinalizado ?? 0,
                    temRemessa: r.vldHasRemessaPgto ?? false,
                    temBaixa: r.vldHasBaixa ?? false,
                } satisfies BorderoAPagar,
            ];
        });
    };
}
