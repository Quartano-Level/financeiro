import { inject, injectable } from 'tsyringe';
import { chunked } from '../../client/ConexosBaseClient.js';
import PostgreeDatabaseClient, {
    type TransactionClient,
} from '../../client/database/PostgreeDatabaseClient.js';
import type { TituloAPagar } from '../../interface/sispag/SispagInterface.js';

const UPSERT_CHUNK = 200;

interface TituloRow {
    fil_cod: number;
    doc_cod: string;
    tit_cod: string;
    credor: string | null;
    pes_cod: string | null;
    valor: string | null;
    moeda: string | null;
    vencimento: Date | null;
    aprovado: boolean;
    pago: boolean;
    banco: string | null;
    num_remessa: string | null;
    tpd_cod: string | null;
    pronto_para_remessa: boolean;
}

/**
 * TituloAPagarRepository — carteira PERSISTIDA de títulos a pagar (ingestão).
 * UPSERT por chave natural (fil_cod, doc_cod, tit_cod); anti-fantasma via `ativo`.
 * SQL 100% parametrizado (`$name`). NÃO toca o ERP — só o Postgres próprio.
 */
@injectable()
export default class TituloAPagarRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    private map = (r: TituloRow): TituloAPagar => ({
        docCod: r.doc_cod,
        titCod: r.tit_cod,
        filCod: r.fil_cod,
        credor: r.credor ?? undefined,
        pesCod: r.pes_cod ?? undefined,
        valor: r.valor != null ? Number(r.valor) : 0,
        moeda: r.moeda ?? undefined,
        vencimento: r.vencimento ? r.vencimento.getTime() : undefined,
        liberado: r.aprovado,
        pago: r.pago,
        banco: r.banco ?? undefined,
        numRemessa: r.num_remessa ?? undefined,
        tpdCod: r.tpd_cod ?? undefined,
        prontoParaRemessa: r.pronto_para_remessa,
        ativo: true,
    });

    /** UPSERT em chunks: marca os títulos vistos como ativos, com o run atual. */
    public upsertMany = async (titulos: TituloAPagar[], runId: string): Promise<void> => {
        if (titulos.length === 0) return;
        await this.databaseClient.withTransaction(async (tx) => {
            for (const chunk of chunked(titulos, UPSERT_CHUNK)) {
                await this.upsertChunk(tx, runId, chunk);
            }
        });
    };

    private upsertChunk = async (
        tx: TransactionClient,
        runId: string,
        chunk: TituloAPagar[],
    ): Promise<void> => {
        const tuples: string[] = [];
        const params: Record<string, unknown> = { runId };
        chunk.forEach((t, i) => {
            tuples.push(
                `($f${i}, $d${i}, $t${i}, $cr${i}, $pe${i}, $v${i}, $mo${i}, $ve${i}, ` +
                    `$ap${i}, $pa${i}, $ba${i}, $nr${i}, $tp${i}, $pr${i}, TRUE, $runId, now())`,
            );
            params[`f${i}`] = t.filCod;
            params[`d${i}`] = t.docCod;
            params[`t${i}`] = t.titCod;
            params[`cr${i}`] = t.credor ?? null;
            params[`pe${i}`] = t.pesCod ?? null;
            params[`v${i}`] = t.valor ?? null;
            params[`mo${i}`] = t.moeda ?? null;
            params[`ve${i}`] = t.vencimento != null ? new Date(t.vencimento) : null;
            params[`ap${i}`] = t.liberado;
            params[`pa${i}`] = t.pago;
            params[`ba${i}`] = t.banco ?? null;
            params[`nr${i}`] = t.numRemessa ?? null;
            params[`tp${i}`] = t.tpdCod ?? null;
            params[`pr${i}`] = t.prontoParaRemessa ?? false;
        });
        await tx.insert(
            `INSERT INTO titulo_a_pagar (
                fil_cod, doc_cod, tit_cod, credor, pes_cod, valor, moeda, vencimento,
                aprovado, pago, banco, num_remessa, tpd_cod, pronto_para_remessa,
                ativo, ingestao_run_id, atualizado_em
             ) VALUES ${tuples.join(', ')}
             ON CONFLICT (fil_cod, doc_cod, tit_cod) DO UPDATE SET
                credor = EXCLUDED.credor, pes_cod = EXCLUDED.pes_cod, valor = EXCLUDED.valor,
                moeda = EXCLUDED.moeda, vencimento = EXCLUDED.vencimento, aprovado = EXCLUDED.aprovado,
                pago = EXCLUDED.pago, banco = EXCLUDED.banco, num_remessa = EXCLUDED.num_remessa,
                tpd_cod = EXCLUDED.tpd_cod, pronto_para_remessa = EXCLUDED.pronto_para_remessa,
                ativo = TRUE, ingestao_run_id = EXCLUDED.ingestao_run_id, atualizado_em = now()`,
            params,
        );
    };

    /**
     * Anti-fantasma: inativa os títulos que NÃO vieram na run atual — restrito às
     * filiais LIDAS com sucesso (`filCodsLidas`). Assim, se a leitura de uma filial
     * falhou, seus títulos NÃO são inativados por engano (fault-tolerance). Retorna a contagem.
     */
    public marcarInativosForaDaRun = async (
        runId: string,
        filCodsLidas: number[],
    ): Promise<number> => {
        if (filCodsLidas.length === 0) return 0;
        return this.databaseClient.update(
            `UPDATE titulo_a_pagar SET ativo = FALSE, atualizado_em = now()
             WHERE ativo = TRUE AND ingestao_run_id IS DISTINCT FROM $runId
               AND fil_cod = ANY($filCodsLidas)`,
            { runId, filCodsLidas },
        );
    };

    /** Carteira ativa para o painel (não-pagos ficam por conta do filtro de ingestão). */
    public listAtivos = async (): Promise<TituloAPagar[]> => {
        const rows = (await this.databaseClient.selectMany(
            `SELECT fil_cod, doc_cod, tit_cod, credor, pes_cod, valor, moeda, vencimento,
                    aprovado, pago, banco, num_remessa, tpd_cod, pronto_para_remessa
             FROM titulo_a_pagar
             WHERE ativo = TRUE
             ORDER BY vencimento ASC NULLS LAST`,
        )) as TituloRow[];
        return rows.map(this.map);
    };
}
