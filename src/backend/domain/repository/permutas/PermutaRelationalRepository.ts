import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient, {
    type TransactionClient,
} from '../../client/database/PostgreeDatabaseClient.js';

/** Linha de Adiantamento persistida no modelo relacional (Fase B). */
export interface AdiantamentoRow {
    docCod: string;
    priCod: string;
    filCod?: number;
    referencia?: string;
    exportador?: string;
    dataEmissao?: Date;
    valor?: number;
    valorMoedaNegociada?: number;
    moeda?: string;
    pago: boolean;
    valorPermutar?: number;
    estadoElegibilidade: 'descoberta' | 'elegivel' | 'bloqueada' | 'casamento-manual';
    motivoBloqueio?: string;
    agingDays?: number;
}

/** Linha de Invoice persistida no modelo relacional (Fase B). */
export interface InvoiceRow {
    docCod: string;
    priCod: string;
    filCod?: number;
    referencia?: string;
    exportador?: string;
    dataEmissao?: Date;
    valor?: number;
    valorMoedaNegociada?: number;
    moeda?: string;
    pago: boolean;
}

/** Linha de Declaração de importação (D.I / DUIMP). */
export interface DeclaracaoRow {
    priCod: string;
    variante: 'DI' | 'DUIMP';
    dataBase?: Date;
}

/** Linha de casamento automático 1:1 (recomputada a cada run). */
export interface CasamentoRow {
    invoiceDocCod: string;
    adiantamentoDocCod: string;
    priCod: string;
    valorASerUsado?: number;
    moeda?: string;
    variacaoClassificacao?: string;
    variacaoResultado?: number;
    variacaoDelta?: number;
    taxaAdiantamento?: number;
    taxaInvoice?: number;
}

/** Cabeçalho da run de ingestão (espelha o de eleição + totais relacionais). */
export interface IngestRunHeader {
    flowId: string;
    startedAt: Date;
    finishedAt: Date;
    status: 'success' | 'partial' | 'error';
    triggeredBy: string;
    totalAdiantamentos: number;
    totalInvoices: number;
    totalCasamentos: number;
    totalStale: number;
    errorMessage?: string;
}

/** Adiantamento ATIVO (não-stale) lido para a tela Gestão. */
export interface AdiantamentoAtivo extends AdiantamentoRow {
    stale: boolean;
}

/** Máx. de rows por INSERT multi-row (teto de placeholders do wire Postgres). */
const UPSERT_CHUNK = 500;

const chunked = <T>(items: readonly T[], size: number): T[][] => {
    if (items.length === 0) return [];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

/**
 * Deduplica linhas pela chave natural do UPSERT (último vence). Necessário
 * porque o mesmo `doc_cod` pode vir repetido no fan-out multi-filial: um
 * `INSERT ... ON CONFLICT` não pode afetar a mesma linha-alvo duas vezes no
 * mesmo comando (Postgres: "ON CONFLICT DO UPDATE command cannot affect row a
 * second time").
 */
const dedupeByKey = <T>(rows: readonly T[], keyFn: (row: T) => string): T[] => {
    const byKey = new Map<string, T>();
    for (const row of rows) byKey.set(keyFn(row), row);
    return [...byKey.values()];
};

/**
 * PermutaRelationalRepository — escreve/lê o modelo relacional da Fase B.
 *
 * SQL 100% parametrizado (`$nome` via SqlBuilder — Rule #5, zero interpolação).
 * UPSERTs por chave natural (`ON CONFLICT (doc_cod) DO UPDATE`) em chunks de 500
 * (espelha `PermutaSnapshotRepository`), carimbando `last_ingest_run_id`,
 * `last_seen_at`, `stale=false`. O casamento automático é recomputado por run
 * (DELETE + INSERT). `markStale` marca tudo que não foi tocado pela run atual.
 * `persistIngestRun` abre a transação + advisory lock para o caller escrever
 * tudo de forma atômica.
 */
@injectable()
export default class PermutaRelationalRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    /**
     * Insere o cabeçalho da run de ingestão (`kind='ingest'`) e devolve o `runId`
     * gerado. Usado DENTRO da transação (sucesso) ou FORA dela (erro), por isso
     * recebe o `tx` opcional — quando ausente, escreve via pool.
     */
    public insertIngestRunHeader = async (
        header: IngestRunHeader,
        tx?: TransactionClient,
    ): Promise<string> => {
        const runId = randomUUID();
        const sink = tx ?? this.databaseClient;
        await sink.insert(
            `INSERT INTO permuta_eleicao_run (
                id, flow_id, started_at, finished_at, status, kind,
                total_candidatas, total_elegiveis, total_bloqueadas,
                total_adiantamentos, total_invoices, total_casamentos, total_stale,
                bloqueadas_by_motivo, triggered_by, error_message
            ) VALUES (
                $id, $flowId, $startedAt, $finishedAt, $status, 'ingest',
                0, 0, 0,
                $totalAdiantamentos, $totalInvoices, $totalCasamentos, $totalStale,
                '{}'::jsonb, $triggeredBy, $errorMessage
            )`,
            {
                id: runId,
                flowId: header.flowId,
                startedAt: header.startedAt.toISOString(),
                finishedAt: header.finishedAt.toISOString(),
                status: header.status,
                totalAdiantamentos: header.totalAdiantamentos,
                totalInvoices: header.totalInvoices,
                totalCasamentos: header.totalCasamentos,
                totalStale: header.totalStale,
                triggeredBy: header.triggeredBy,
                errorMessage: header.errorMessage ?? null,
            },
        );
        return runId;
    };

    /**
     * Executa `write(tx, runId)` numa ÚNICA transação atômica serializada por
     * `withAdvisoryLock(lockKey)`: insere o cabeçalho `kind='ingest'`, chama o
     * `write` (upserts + recompute casamento + sweep), e commita junto. Qualquer
     * falha → ROLLBACK total (os fatos last-good sobrevivem). Retorna o `runId`.
     */
    public persistIngestRun = async (
        header: IngestRunHeader,
        lockKey: number,
        write: (tx: TransactionClient, runId: string) => Promise<void>,
    ): Promise<string> => {
        return this.databaseClient.withAdvisoryLock(
            lockKey,
            async () =>
                this.databaseClient.withTransaction(async (tx) => {
                    const runId = await this.insertIngestRunHeader(header, tx);
                    await write(tx, runId);
                    return runId;
                }),
            async () => {
                throw new Error('permuta ingest advisory lock busy — another ingestion is running');
            },
        );
    };

    public upsertAdiantamentos = async (
        tx: TransactionClient,
        runId: string,
        rows: AdiantamentoRow[],
    ): Promise<void> => {
        const unique = dedupeByKey(rows, (r) => r.docCod);
        for (const chunk of chunked(unique, UPSERT_CHUNK)) {
            await this.upsertAdiantamentoChunk(tx, runId, chunk);
        }
    };

    private upsertAdiantamentoChunk = async (
        tx: TransactionClient,
        runId: string,
        rows: AdiantamentoRow[],
    ): Promise<void> => {
        if (rows.length === 0) return;
        const params: Record<string, unknown> = { runId };
        const tuples = rows.map((r, i) => {
            params[`docCod_${i}`] = r.docCod;
            params[`priCod_${i}`] = r.priCod;
            params[`filCod_${i}`] = r.filCod ?? null;
            params[`referencia_${i}`] = r.referencia ?? null;
            params[`exportador_${i}`] = r.exportador ?? null;
            params[`dataEmissao_${i}`] = r.dataEmissao ? r.dataEmissao.toISOString() : null;
            params[`valor_${i}`] = r.valor ?? null;
            params[`valorMoedaNegociada_${i}`] = r.valorMoedaNegociada ?? null;
            params[`moeda_${i}`] = r.moeda ?? null;
            params[`pago_${i}`] = r.pago;
            params[`valorPermutar_${i}`] = r.valorPermutar ?? null;
            params[`estado_${i}`] = r.estadoElegibilidade;
            params[`motivo_${i}`] = r.motivoBloqueio ?? null;
            params[`aging_${i}`] = r.agingDays ?? null;
            return (
                `($docCod_${i}, $priCod_${i}, $filCod_${i}, $referencia_${i}, ` +
                `$exportador_${i}, $dataEmissao_${i}, $valor_${i}, $valorMoedaNegociada_${i}, ` +
                `$moeda_${i}, $pago_${i}, $valorPermutar_${i}, $estado_${i}, $motivo_${i}, ` +
                `$aging_${i}, $runId, now(), FALSE, now())`
            );
        });
        await tx.insert(
            `INSERT INTO permuta_adiantamento (
                doc_cod, pri_cod, fil_cod, referencia, exportador, data_emissao,
                valor, valor_moeda_negociada, moeda, pago, valor_permutar,
                estado_elegibilidade, motivo_bloqueio, aging_days,
                last_ingest_run_id, last_seen_at, stale, updated_at
            ) VALUES ${tuples.join(', ')}
            ON CONFLICT (doc_cod) DO UPDATE SET
                pri_cod = EXCLUDED.pri_cod,
                fil_cod = EXCLUDED.fil_cod,
                referencia = EXCLUDED.referencia,
                exportador = EXCLUDED.exportador,
                data_emissao = EXCLUDED.data_emissao,
                valor = EXCLUDED.valor,
                valor_moeda_negociada = EXCLUDED.valor_moeda_negociada,
                moeda = EXCLUDED.moeda,
                pago = EXCLUDED.pago,
                valor_permutar = EXCLUDED.valor_permutar,
                estado_elegibilidade = EXCLUDED.estado_elegibilidade,
                motivo_bloqueio = EXCLUDED.motivo_bloqueio,
                aging_days = EXCLUDED.aging_days,
                last_ingest_run_id = EXCLUDED.last_ingest_run_id,
                last_seen_at = EXCLUDED.last_seen_at,
                stale = FALSE,
                updated_at = now()`,
            params,
        );
    };

    public upsertInvoices = async (
        tx: TransactionClient,
        runId: string,
        rows: InvoiceRow[],
    ): Promise<void> => {
        const unique = dedupeByKey(rows, (r) => r.docCod);
        for (const chunk of chunked(unique, UPSERT_CHUNK)) {
            await this.upsertInvoiceChunk(tx, runId, chunk);
        }
    };

    private upsertInvoiceChunk = async (
        tx: TransactionClient,
        runId: string,
        rows: InvoiceRow[],
    ): Promise<void> => {
        if (rows.length === 0) return;
        const params: Record<string, unknown> = { runId };
        const tuples = rows.map((r, i) => {
            params[`docCod_${i}`] = r.docCod;
            params[`priCod_${i}`] = r.priCod;
            params[`filCod_${i}`] = r.filCod ?? null;
            params[`referencia_${i}`] = r.referencia ?? null;
            params[`exportador_${i}`] = r.exportador ?? null;
            params[`dataEmissao_${i}`] = r.dataEmissao ? r.dataEmissao.toISOString() : null;
            params[`valor_${i}`] = r.valor ?? null;
            params[`valorMoedaNegociada_${i}`] = r.valorMoedaNegociada ?? null;
            params[`moeda_${i}`] = r.moeda ?? null;
            params[`pago_${i}`] = r.pago;
            return (
                `($docCod_${i}, $priCod_${i}, $filCod_${i}, $referencia_${i}, ` +
                `$exportador_${i}, $dataEmissao_${i}, $valor_${i}, $valorMoedaNegociada_${i}, ` +
                `$moeda_${i}, $pago_${i}, $runId, now(), FALSE, now())`
            );
        });
        await tx.insert(
            `INSERT INTO permuta_invoice (
                doc_cod, pri_cod, fil_cod, referencia, exportador, data_emissao,
                valor, valor_moeda_negociada, moeda, pago,
                last_ingest_run_id, last_seen_at, stale, updated_at
            ) VALUES ${tuples.join(', ')}
            ON CONFLICT (doc_cod) DO UPDATE SET
                pri_cod = EXCLUDED.pri_cod,
                fil_cod = EXCLUDED.fil_cod,
                referencia = EXCLUDED.referencia,
                exportador = EXCLUDED.exportador,
                data_emissao = EXCLUDED.data_emissao,
                valor = EXCLUDED.valor,
                valor_moeda_negociada = EXCLUDED.valor_moeda_negociada,
                moeda = EXCLUDED.moeda,
                pago = EXCLUDED.pago,
                last_ingest_run_id = EXCLUDED.last_ingest_run_id,
                last_seen_at = EXCLUDED.last_seen_at,
                stale = FALSE,
                updated_at = now()`,
            params,
        );
    };

    public upsertDeclaracoes = async (
        tx: TransactionClient,
        runId: string,
        rows: DeclaracaoRow[],
    ): Promise<void> => {
        const unique = dedupeByKey(rows, (r) => `${r.priCod}|${r.variante}`);
        for (const chunk of chunked(unique, UPSERT_CHUNK)) {
            await this.upsertDeclaracaoChunk(tx, runId, chunk);
        }
    };

    private upsertDeclaracaoChunk = async (
        tx: TransactionClient,
        runId: string,
        rows: DeclaracaoRow[],
    ): Promise<void> => {
        if (rows.length === 0) return;
        const params: Record<string, unknown> = { runId };
        const tuples = rows.map((r, i) => {
            params[`priCod_${i}`] = r.priCod;
            params[`variante_${i}`] = r.variante;
            params[`dataBase_${i}`] = r.dataBase ? r.dataBase.toISOString() : null;
            return `($priCod_${i}, $variante_${i}, $dataBase_${i}, $runId, now(), FALSE, now())`;
        });
        await tx.insert(
            `INSERT INTO permuta_declaracao_importacao (
                pri_cod, variante, data_base, last_ingest_run_id, last_seen_at, stale, updated_at
            ) VALUES ${tuples.join(', ')}
            ON CONFLICT (pri_cod, variante) DO UPDATE SET
                data_base = EXCLUDED.data_base,
                last_ingest_run_id = EXCLUDED.last_ingest_run_id,
                last_seen_at = EXCLUDED.last_seen_at,
                stale = FALSE,
                updated_at = now()`,
            params,
        );
    };

    /**
     * Recompute do casamento automático 1:1: DELETE total + bulk INSERT dos
     * casamentos do run. Idempotente por run (o estado do casamento é sempre o
     * recomputado pela ingestão atual).
     */
    public replaceAutoCasamentos = async (
        tx: TransactionClient,
        runId: string,
        rows: CasamentoRow[],
    ): Promise<void> => {
        await tx.update('DELETE FROM permuta_casamento', {});
        const unique = dedupeByKey(rows, (r) => `${r.invoiceDocCod}|${r.adiantamentoDocCod}`);
        for (const chunk of chunked(unique, UPSERT_CHUNK)) {
            await this.insertCasamentoChunk(tx, runId, chunk);
        }
    };

    private insertCasamentoChunk = async (
        tx: TransactionClient,
        runId: string,
        rows: CasamentoRow[],
    ): Promise<void> => {
        if (rows.length === 0) return;
        const params: Record<string, unknown> = { runId };
        const tuples = rows.map((r, i) => {
            params[`invoiceDocCod_${i}`] = r.invoiceDocCod;
            params[`adiantamentoDocCod_${i}`] = r.adiantamentoDocCod;
            params[`priCod_${i}`] = r.priCod;
            params[`valorASerUsado_${i}`] = r.valorASerUsado ?? null;
            params[`moeda_${i}`] = r.moeda ?? null;
            params[`varClass_${i}`] = r.variacaoClassificacao ?? null;
            params[`varResultado_${i}`] = r.variacaoResultado ?? null;
            params[`varDelta_${i}`] = r.variacaoDelta ?? null;
            params[`taxaAdto_${i}`] = r.taxaAdiantamento ?? null;
            params[`taxaInvoice_${i}`] = r.taxaInvoice ?? null;
            return (
                `($invoiceDocCod_${i}, $adiantamentoDocCod_${i}, $priCod_${i}, ` +
                `$valorASerUsado_${i}, $moeda_${i}, $varClass_${i}, $varResultado_${i}, ` +
                `$varDelta_${i}, $taxaAdto_${i}, $taxaInvoice_${i}, $runId)`
            );
        });
        await tx.insert(
            `INSERT INTO permuta_casamento (
                invoice_doc_cod, adiantamento_doc_cod, pri_cod, valor_a_ser_usado,
                moeda, variacao_classificacao, variacao_resultado, variacao_delta,
                taxa_adiantamento, taxa_invoice, last_ingest_run_id
            ) VALUES ${tuples.join(', ')}`,
            params,
        );
    };

    /**
     * Staleness sweep: marca como `stale` todo fato cujo `last_ingest_run_id`
     * difere do run atual (não foi visto nesta ingestão). NUNCA deleta — o
     * histórico/estado do analista sobrevive.
     */
    public markStale = async (tx: TransactionClient, runId: string): Promise<number> => {
        // Statements com NOMES DE TABELA LITERAIS (não há interpolação de input
        // externo — Rule #5: os valores `$runId` são parametrizados).
        const staleAdiantamentos = await tx.update(
            `UPDATE permuta_adiantamento SET stale = TRUE, updated_at = now()
             WHERE last_ingest_run_id IS DISTINCT FROM $runId AND NOT stale`,
            { runId },
        );
        const staleInvoices = await tx.update(
            `UPDATE permuta_invoice SET stale = TRUE, updated_at = now()
             WHERE last_ingest_run_id IS DISTINCT FROM $runId AND NOT stale`,
            { runId },
        );
        const staleDeclaracoes = await tx.update(
            `UPDATE permuta_declaracao_importacao SET stale = TRUE, updated_at = now()
             WHERE last_ingest_run_id IS DISTINCT FROM $runId AND NOT stale`,
            { runId },
        );
        return staleAdiantamentos + staleInvoices + staleDeclaracoes;
    };

    // ---- Reads (tela Gestão) ----

    public listAdiantamentosAtivos = async (filtro?: {
        estadoElegibilidade?: 'descoberta' | 'elegivel' | 'bloqueada' | 'casamento-manual';
    }): Promise<AdiantamentoAtivo[]> => {
        const rows = filtro?.estadoElegibilidade
            ? await this.databaseClient.selectMany(
                  `SELECT * FROM permuta_adiantamento
                   WHERE NOT stale AND estado_elegibilidade = $estado
                   ORDER BY (aging_days IS NULL), aging_days DESC, doc_cod ASC`,
                  { estado: filtro.estadoElegibilidade },
              )
            : await this.databaseClient.selectMany(
                  `SELECT * FROM permuta_adiantamento
                   WHERE NOT stale
                   ORDER BY (aging_days IS NULL), aging_days DESC, doc_cod ASC`,
              );
        return rows.map((r) => this.mapAdiantamentoRow(r));
    };

    public listInvoicesEmAberto = async (): Promise<InvoiceRow[]> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT * FROM permuta_invoice
             WHERE NOT stale AND NOT pago
             ORDER BY doc_cod ASC`,
        );
        return rows.map((r) => this.mapInvoiceRow(r));
    };

    public listCasamentos = async (): Promise<CasamentoRow[]> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT invoice_doc_cod, adiantamento_doc_cod, pri_cod, valor_a_ser_usado,
                    moeda, variacao_classificacao, variacao_resultado, variacao_delta,
                    taxa_adiantamento, taxa_invoice
             FROM permuta_casamento
             ORDER BY invoice_doc_cod ASC, adiantamento_doc_cod ASC`,
        );
        return rows.map((r) => this.mapCasamentoRow(r));
    };

    public findAdiantamento = async (docCod: string): Promise<AdiantamentoAtivo | null> => {
        const row = await this.databaseClient.selectFirst<Record<string, unknown>>(
            'SELECT * FROM permuta_adiantamento WHERE doc_cod = $docCod',
            { docCod },
        );
        return row ? this.mapAdiantamentoRow(row) : null;
    };

    private mapAdiantamentoRow = (r: Record<string, unknown>): AdiantamentoAtivo => ({
        docCod: String(r.doc_cod),
        priCod: String(r.pri_cod),
        ...(r.fil_cod != null ? { filCod: Number(r.fil_cod) } : {}),
        ...(r.referencia != null ? { referencia: String(r.referencia) } : {}),
        ...(r.exportador != null ? { exportador: String(r.exportador) } : {}),
        ...(r.data_emissao != null ? { dataEmissao: new Date(String(r.data_emissao)) } : {}),
        ...(r.valor != null ? { valor: Number(r.valor) } : {}),
        ...(r.valor_moeda_negociada != null
            ? { valorMoedaNegociada: Number(r.valor_moeda_negociada) }
            : {}),
        ...(r.moeda != null ? { moeda: String(r.moeda) } : {}),
        pago: Boolean(r.pago),
        ...(r.valor_permutar != null ? { valorPermutar: Number(r.valor_permutar) } : {}),
        estadoElegibilidade: String(
            r.estado_elegibilidade,
        ) as AdiantamentoRow['estadoElegibilidade'],
        ...(r.motivo_bloqueio != null ? { motivoBloqueio: String(r.motivo_bloqueio) } : {}),
        ...(r.aging_days != null ? { agingDays: Number(r.aging_days) } : {}),
        stale: Boolean(r.stale),
    });

    private mapInvoiceRow = (r: Record<string, unknown>): InvoiceRow => ({
        docCod: String(r.doc_cod),
        priCod: String(r.pri_cod),
        ...(r.fil_cod != null ? { filCod: Number(r.fil_cod) } : {}),
        ...(r.referencia != null ? { referencia: String(r.referencia) } : {}),
        ...(r.exportador != null ? { exportador: String(r.exportador) } : {}),
        ...(r.data_emissao != null ? { dataEmissao: new Date(String(r.data_emissao)) } : {}),
        ...(r.valor != null ? { valor: Number(r.valor) } : {}),
        ...(r.valor_moeda_negociada != null
            ? { valorMoedaNegociada: Number(r.valor_moeda_negociada) }
            : {}),
        ...(r.moeda != null ? { moeda: String(r.moeda) } : {}),
        pago: Boolean(r.pago),
    });

    private mapCasamentoRow = (r: Record<string, unknown>): CasamentoRow => ({
        invoiceDocCod: String(r.invoice_doc_cod),
        adiantamentoDocCod: String(r.adiantamento_doc_cod),
        priCod: String(r.pri_cod),
        ...(r.valor_a_ser_usado != null ? { valorASerUsado: Number(r.valor_a_ser_usado) } : {}),
        ...(r.moeda != null ? { moeda: String(r.moeda) } : {}),
        ...(r.variacao_classificacao != null
            ? { variacaoClassificacao: String(r.variacao_classificacao) }
            : {}),
        ...(r.variacao_resultado != null
            ? { variacaoResultado: Number(r.variacao_resultado) }
            : {}),
        ...(r.variacao_delta != null ? { variacaoDelta: Number(r.variacao_delta) } : {}),
        ...(r.taxa_adiantamento != null ? { taxaAdiantamento: Number(r.taxa_adiantamento) } : {}),
        ...(r.taxa_invoice != null ? { taxaInvoice: Number(r.taxa_invoice) } : {}),
    });
}
