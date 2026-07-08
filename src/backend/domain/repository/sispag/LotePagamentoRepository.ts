import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient, {
    type TransactionClient,
} from '../../client/database/PostgreeDatabaseClient.js';
import {
    type ItemLote,
    type LotePagamento,
    type LotePagamentoStatus,
    LOTE_STATUS,
    type ListarLotesFiltro,
} from '../../interface/sispag/SispagInterface.js';

/** Superfície de query comum ao pool e ao cliente transacional (mesmos 4 métodos). */
type QueryRunner = Pick<PostgreeDatabaseClient, 'selectMany' | 'selectFirst' | 'insert' | 'update'>;

interface LoteHeaderRow {
    id: string;
    fil_cod: number;
    banco: string | null;
    conta: string | null;
    status: LotePagamentoStatus;
    criado_por: string;
    finalizado_por: string | null;
    finalizado_em: Date | null;
    versao: number;
    criado_em: Date;
}

interface ItemRow {
    lote_id: string;
    fil_cod: number;
    doc_cod: string;
    tit_cod: string;
    credor: string | null;
    valor: string | null;
    vencimento: Date | null;
    internacional: boolean;
    incluido_por: string;
    incluido_em: Date | null;
}

/**
 * LotePagamentoRepository — persistência do lote candidato SISPAG (Fatia 2).
 * SQL 100% parametrizado (`$name`, Rule #5). Cada método aceita um `tx` opcional
 * (`TransactionClient`) para o serviço compor operações atômicas (`withTransaction`);
 * sem `tx`, roda no pool. NENHUMA escrita no ERP — só o Postgres próprio.
 */
@injectable()
export default class LotePagamentoRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    private db = (tx?: TransactionClient): QueryRunner => tx ?? this.databaseClient;

    private mapItem = (r: ItemRow): ItemLote => ({
        loteId: r.lote_id,
        filCod: r.fil_cod,
        docCod: r.doc_cod,
        titCod: r.tit_cod,
        credor: r.credor ?? undefined,
        valor: r.valor != null ? Number(r.valor) : undefined,
        vencimento: r.vencimento ? r.vencimento.getTime() : undefined,
        internacional: r.internacional,
        incluidoPor: r.incluido_por,
        incluidoEm: r.incluido_em ? r.incluido_em.toISOString() : undefined,
    });

    private mapLote = (h: LoteHeaderRow, itens: ItemLote[]): LotePagamento => ({
        id: h.id,
        filCod: h.fil_cod,
        banco: h.banco ?? undefined,
        conta: h.conta ?? undefined,
        status: h.status,
        criadoPor: h.criado_por,
        finalizadoPor: h.finalizado_por ?? undefined,
        finalizadoEm: h.finalizado_em ? h.finalizado_em.toISOString() : undefined,
        versao: h.versao,
        criadoEm: h.criado_em ? h.criado_em.toISOString() : undefined,
        itens,
    });

    public criarLote = async (
        input: { filCod: number; banco?: string; conta?: string; criadoPor: string },
        tx?: TransactionClient,
    ): Promise<LotePagamento> => {
        const id = randomUUID();
        await this.db(tx).insert(
            `INSERT INTO lote_pagamento (id, fil_cod, banco, conta, status, criado_por)
             VALUES ($id, $filCod, $banco, $conta, 'RASCUNHO', $criadoPor)`,
            {
                id,
                filCod: input.filCod,
                banco: input.banco ?? null,
                conta: input.conta ?? null,
                criadoPor: input.criadoPor,
            },
        );
        const lote = await this.getLoteComItens(id, tx);
        if (!lote) throw new Error('lote_pagamento insert did not persist');
        return lote;
    };

    public getLoteComItens = async (
        id: string,
        tx?: TransactionClient,
    ): Promise<LotePagamento | null> => {
        const header = await this.db(tx).selectFirst<LoteHeaderRow>(
            `SELECT id, fil_cod, banco, conta, status, criado_por, finalizado_por,
                    finalizado_em, versao, criado_em
             FROM lote_pagamento WHERE id = $id`,
            { id },
        );
        if (!header) return null;
        const itens = await this.db(tx).selectMany(
            `SELECT lote_id, fil_cod, doc_cod, tit_cod, credor, valor, vencimento,
                    internacional, incluido_por, incluido_em
             FROM lote_pagamento_item WHERE lote_id = $id ORDER BY incluido_em ASC, id ASC`,
            { id },
        );
        return this.mapLote(header, (itens as ItemRow[]).map(this.mapItem));
    };

    public listLotes = async (filtro: ListarLotesFiltro): Promise<LotePagamento[]> => {
        const headers = (await this.databaseClient.selectMany(
            `SELECT id, fil_cod, banco, conta, status, criado_por, finalizado_por,
                    finalizado_em, versao, criado_em
             FROM lote_pagamento
             WHERE ($status::text IS NULL OR status = $status)
               AND ($filCod::int IS NULL OR fil_cod = $filCod)
             ORDER BY criado_em DESC`,
            { status: filtro.status ?? null, filCod: filtro.filCod ?? null },
        )) as LoteHeaderRow[];
        if (headers.length === 0) return [];
        const ids = headers.map((h) => h.id);
        const itens = (await this.databaseClient.selectMany(
            `SELECT lote_id, fil_cod, doc_cod, tit_cod, credor, valor, vencimento,
                    internacional, incluido_por, incluido_em
             FROM lote_pagamento_item WHERE lote_id = ANY($ids) ORDER BY incluido_em ASC, id ASC`,
            { ids },
        )) as ItemRow[];
        const porLote = new Map<string, ItemLote[]>();
        for (const row of itens) {
            const arr = porLote.get(row.lote_id) ?? [];
            arr.push(this.mapItem(row));
            porLote.set(row.lote_id, arr);
        }
        return headers.map((h) => this.mapLote(h, porLote.get(h.id) ?? []));
    };

    /** Título já presente em ALGUM lote RASCUNHO? (I3). Retorna o loteId ou null. */
    public loteRascunhoComTitulo = async (
        params: { filCod: number; docCod: string; titCod: string },
        tx?: TransactionClient,
    ): Promise<string | null> => {
        const row = await this.db(tx).selectFirst<{ lote_id: string }>(
            `SELECT i.lote_id
             FROM lote_pagamento_item i
             JOIN lote_pagamento l ON l.id = i.lote_id
             WHERE l.status = 'RASCUNHO'
               AND i.fil_cod = $filCod AND i.doc_cod = $docCod AND i.tit_cod = $titCod
             LIMIT 1`,
            params,
        );
        return row?.lote_id ?? null;
    };

    public adicionarItem = async (
        item: {
            loteId: string;
            filCod: number;
            docCod: string;
            titCod: string;
            credor?: string;
            valor?: number;
            vencimento?: number;
            internacional?: boolean;
            incluidoPor: string;
        },
        tx?: TransactionClient,
    ): Promise<void> => {
        await this.db(tx).insert(
            `INSERT INTO lote_pagamento_item
                (lote_id, fil_cod, doc_cod, tit_cod, credor, valor, vencimento, internacional, incluido_por)
             VALUES ($loteId, $filCod, $docCod, $titCod, $credor, $valor, $vencimento, $internacional, $incluidoPor)
             ON CONFLICT (lote_id, fil_cod, doc_cod, tit_cod) DO NOTHING`,
            {
                loteId: item.loteId,
                filCod: item.filCod,
                docCod: item.docCod,
                titCod: item.titCod,
                credor: item.credor ?? null,
                valor: item.valor ?? null,
                vencimento: item.vencimento != null ? new Date(item.vencimento) : null,
                internacional: item.internacional ?? false,
                incluidoPor: item.incluidoPor,
            },
        );
    };

    public removerItem = async (
        params: { loteId: string; filCod: number; docCod: string; titCod: string },
        tx?: TransactionClient,
    ): Promise<number> =>
        this.db(tx).update(
            `DELETE FROM lote_pagamento_item
             WHERE lote_id = $loteId AND fil_cod = $filCod AND doc_cod = $docCod AND tit_cod = $titCod`,
            params,
        );

    public contarItens = async (loteId: string, tx?: TransactionClient): Promise<number> => {
        const row = await this.db(tx).selectFirst<{ n: string }>(
            `SELECT COUNT(*)::text AS n FROM lote_pagamento_item WHERE lote_id = $loteId`,
            { loteId },
        );
        return row ? Number(row.n) : 0;
    };

    /** Marca o lote como "tocado" (bump de versão) — usado em incluir/remover item. */
    public tocarLote = async (loteId: string, tx?: TransactionClient): Promise<void> => {
        await this.db(tx).update(
            `UPDATE lote_pagamento SET versao = versao + 1, atualizado_em = now() WHERE id = $loteId`,
            { loteId },
        );
    };

    /**
     * Transição de status com optimistic lock (I6): só aplica se `status` estiver
     * em `de` E `versao = versaoEsperada`. Retorna rowCount (0 = conflito de versão
     * OU estado incompatível — o serviço distingue relendo). `finalizadoPor` só no
     * caminho para FINALIZADO.
     */
    public transicionarStatus = async (
        params: {
            id: string;
            de: LotePagamentoStatus[];
            para: LotePagamentoStatus;
            versaoEsperada: number;
            finalizadoPor?: string;
        },
        tx?: TransactionClient,
    ): Promise<number> => {
        const setFinal = params.para === LOTE_STATUS.FINALIZADO;
        return this.db(tx).update(
            `UPDATE lote_pagamento
             SET status = $para,
                 versao = versao + 1,
                 atualizado_em = now(),
                 finalizado_por = ${setFinal ? '$finalizadoPor' : "CASE WHEN $para = 'RASCUNHO' THEN NULL ELSE finalizado_por END"},
                 finalizado_em  = ${setFinal ? 'now()' : "CASE WHEN $para = 'RASCUNHO' THEN NULL ELSE finalizado_em END"}
             WHERE id = $id AND versao = $versaoEsperada AND status = ANY($de)`,
            {
                id: params.id,
                para: params.para,
                de: params.de,
                versaoEsperada: params.versaoEsperada,
                ...(setFinal ? { finalizadoPor: params.finalizadoPor ?? null } : {}),
            },
        );
    };
}
