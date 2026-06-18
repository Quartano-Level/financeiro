import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient, {
    type TransactionClient,
} from '../../client/database/PostgreeDatabaseClient.js';
import {
    ESTADO_ELEGIBILIDADE,
    type MotivoBloqueio,
} from '../../interface/permutas/EstadoElegibilidade.js';
import type PermutaCandidata from '../../interface/permutas/PermutaCandidata.js';

export type RunStatus = 'success' | 'partial' | 'error';

/** Cabeçalho da run de eleição (auditoria O6 + correlação flowId). */
export interface PermutaEleicaoRunInput {
    flowId: string;
    startedAt: Date;
    finishedAt: Date;
    status: RunStatus;
    triggeredBy: string;
    totalCandidatas: number;
    totalElegiveis: number;
    totalBloqueadas: number;
    bloqueadasByMotivo: Record<string, number>;
    errorMessage?: string;
}

/** Linha do snapshot de uma candidata, como persistida para leitura no painel. */
export interface PermutaCandidataSnapshotRow {
    runId: string;
    docCod: string;
    filCod?: number;
    priCod: string;
    status: 'elegivel' | 'bloqueada';
    motivoBloqueio?: MotivoBloqueio;
    agingDays?: number;
    invoiceDocCod?: string;
    variacaoClassificacao?: string;
    variacaoResultado?: number;
}

/**
 * PermutaSnapshotRepository — fecha O5 (Postgres sem uso) e O6 (auditoria).
 * Persiste a run + o snapshot de candidatas por execução, com SQL PARAMETRIZADO
 * (`$nome` via SqlBuilder — Rule #5, zero interpolação) e atomicidade.
 *
 * Atomicidade (Task 9 AC): run completa ⇒ 1 row em `permuta_eleicao_run` + 1
 * row por candidata; run abortada ⇒ status='error' + 0 snapshot rows.
 */
/** Máx. de candidatas por INSERT multi-row (mantém o nº de placeholders sob o
 * teto do protocolo wire do Postgres; 500 × 10 cols ≈ 5k placeholders). */
const SNAPSHOT_INSERT_CHUNK = 500;

const chunked = <T>(items: readonly T[], size: number): T[][] => {
    if (items.length === 0) return [];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

@injectable()
export default class PermutaSnapshotRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    /**
     * Persiste a run e o snapshot das candidatas numa ÚNICA transação atômica
     * (P0-5): cabeçalho + INSERT multi-row das candidatas (chunks de 500) commit
     * juntos, ou ROLLBACK total em qualquer falha — nunca um cabeçalho
     * `status='success'` com snapshot truncado. `candidatas` vazio (abort) → só
     * o cabeçalho. Retorna o `runId` (uuid). SQL 100% parametrizado (Rule #5).
     */
    public persistRun = async (
        run: PermutaEleicaoRunInput,
        candidatas: PermutaCandidata[],
    ): Promise<string> => {
        const runId = randomUUID();

        await this.databaseClient.withTransaction(async (tx) => {
            await this.insertRunHeader(tx, runId, run);
            for (const chunk of chunked(candidatas, SNAPSHOT_INSERT_CHUNK)) {
                await this.insertCandidataChunk(tx, runId, chunk);
            }
        });

        return runId;
    };

    private insertRunHeader = async (
        tx: TransactionClient,
        runId: string,
        run: PermutaEleicaoRunInput,
    ): Promise<void> => {
        await tx.insert(
            `INSERT INTO permuta_eleicao_run (
                id, flow_id, started_at, finished_at, status,
                total_candidatas, total_elegiveis, total_bloqueadas,
                bloqueadas_by_motivo, triggered_by, error_message
            ) VALUES (
                $id, $flowId, $startedAt, $finishedAt, $status,
                $totalCandidatas, $totalElegiveis, $totalBloqueadas,
                $bloqueadasByMotivo, $triggeredBy, $errorMessage
            )`,
            {
                id: runId,
                flowId: run.flowId,
                startedAt: run.startedAt.toISOString(),
                finishedAt: run.finishedAt.toISOString(),
                status: run.status,
                totalCandidatas: run.totalCandidatas,
                totalElegiveis: run.totalElegiveis,
                totalBloqueadas: run.totalBloqueadas,
                bloqueadasByMotivo: JSON.stringify(run.bloqueadasByMotivo),
                triggeredBy: run.triggeredBy,
                errorMessage: run.errorMessage ?? null,
            },
        );
    };

    /**
     * Idempotência (P0-6): resolve o `runId` já produzido por uma
     * `Idempotency-Key`, se existir e estiver dentro do TTL de 24h. `null` se a
     * key é nova/expirada → o caller pode disparar uma nova run. SQL parametrizado.
     */
    public findRunIdByIdempotencyKey = async (key: string): Promise<string | null> => {
        const row = await this.databaseClient.selectFirst<{ run_id: string }>(
            `SELECT run_id FROM permuta_eleicao_idempotency
             WHERE idempotency_key = $key
               AND created_at > now() - INTERVAL '24 hours'`,
            { key },
        );
        return row ? row.run_id : null;
    };

    /**
     * Registra o mapeamento `Idempotency-Key → runId` após uma run bem-sucedida
     * (P0-6). `ON CONFLICT DO NOTHING` — a primeira run a gravar vence; um retry
     * concorrente que perdeu a corrida não sobrescreve. SQL parametrizado.
     */
    public recordIdempotencyKey = async (key: string, runId: string): Promise<void> => {
        await this.databaseClient.insert(
            `INSERT INTO permuta_eleicao_idempotency (idempotency_key, run_id)
             VALUES ($key, $runId)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            { key, runId },
        );
    };

    /**
     * Lê o resumo (cabeçalho) de uma run pelo `id`. Usado pelo retorno
     * idempotente (P0-6) — devolve os totais da run já existente sem re-executar
     * o fan-out. `null` se a run não existe. SQL parametrizado.
     */
    public findRunSummaryById = async (
        runId: string,
    ): Promise<{
        runId: string;
        flowId: string;
        status: RunStatus;
        totalCandidatas: number;
        totalElegiveis: number;
        totalBloqueadas: number;
        bloqueadasByMotivo: Record<string, number>;
    } | null> => {
        const row = await this.databaseClient.selectFirst<{
            id: string;
            flow_id: string;
            status: RunStatus;
            total_candidatas: number;
            total_elegiveis: number;
            total_bloqueadas: number;
            bloqueadas_by_motivo: Record<string, number> | string;
        }>(
            `SELECT id, flow_id, status, total_candidatas, total_elegiveis,
                    total_bloqueadas, bloqueadas_by_motivo
             FROM permuta_eleicao_run
             WHERE id = $runId`,
            { runId },
        );
        if (!row) return null;
        const bloqueadasByMotivo =
            typeof row.bloqueadas_by_motivo === 'string'
                ? (JSON.parse(row.bloqueadas_by_motivo) as Record<string, number>)
                : row.bloqueadas_by_motivo;
        return {
            runId: row.id,
            flowId: row.flow_id,
            status: row.status,
            totalCandidatas: Number(row.total_candidatas),
            totalElegiveis: Number(row.total_elegiveis),
            totalBloqueadas: Number(row.total_bloqueadas),
            bloqueadasByMotivo: bloqueadasByMotivo ?? {},
        };
    };

    /** Lê o snapshot de candidatas do último run com status 'success'. */
    public findLatestSnapshot = async (): Promise<{
        runId: string;
        finishedAt: Date;
        rows: PermutaCandidataSnapshotRow[];
    } | null> => {
        const run = await this.databaseClient.selectFirst<{
            id: string;
            finished_at: string | Date;
        }>(
            `SELECT id, finished_at FROM permuta_eleicao_run
             WHERE status = $status
             ORDER BY finished_at DESC
             LIMIT 1`,
            { status: 'success' },
        );
        if (!run) return null;

        const rows = await this.databaseClient.selectMany(
            `SELECT run_id, doc_cod, fil_cod, pri_cod, status, motivo_bloqueio,
                    aging_days, invoice_doc_cod, variacao_classificacao, variacao_resultado
             FROM permuta_candidata_snapshot
             WHERE run_id = $runId
             ORDER BY (aging_days IS NULL), aging_days DESC, doc_cod ASC`,
            { runId: run.id },
        );

        return {
            runId: run.id,
            finishedAt: new Date(run.finished_at),
            rows: rows.map((r) => this.mapSnapshotRow(r)),
        };
    };

    /**
     * INSERT multi-row de um chunk de candidatas — 1 round-trip por chunk em vez
     * de 1 por candidata (P0-5: round-trips N=200 de 201→2). SQL parametrizado
     * (`$nome_i` via SqlBuilder, Rule #5 — zero interpolação de valores). Inclui
     * `fil_cod` (P0-2 — invariante multi-filial I6, antes sempre NULL).
     */
    private insertCandidataChunk = async (
        tx: TransactionClient,
        runId: string,
        candidatas: PermutaCandidata[],
    ): Promise<void> => {
        if (candidatas.length === 0) return;

        const params: Record<string, unknown> = { runId };
        const valuesTuples = candidatas.map((candidata, i) => {
            const status =
                candidata.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL
                    ? 'elegivel'
                    : 'bloqueada';
            params[`docCod_${i}`] = candidata.adiantamento.docCod;
            params[`filCod_${i}`] = candidata.adiantamento.filCod ?? null;
            params[`priCod_${i}`] = candidata.priCod;
            params[`status_${i}`] = status;
            params[`motivoBloqueio_${i}`] = candidata.motivoBloqueio ?? null;
            params[`agingDays_${i}`] = candidata.aging ?? null;
            params[`invoiceDocCod_${i}`] = candidata.invoiceCasada?.docCod ?? null;
            params[`variacaoClassificacao_${i}`] = candidata.variacaoCambial?.classificacao ?? null;
            params[`variacaoResultado_${i}`] = candidata.variacaoCambial?.resultado ?? null;
            return (
                `($runId, $docCod_${i}, $filCod_${i}, $priCod_${i}, $status_${i}, ` +
                `$motivoBloqueio_${i}, $agingDays_${i}, $invoiceDocCod_${i}, ` +
                `$variacaoClassificacao_${i}, $variacaoResultado_${i})`
            );
        });

        await tx.insert(
            `INSERT INTO permuta_candidata_snapshot (
                run_id, doc_cod, fil_cod, pri_cod, status, motivo_bloqueio,
                aging_days, invoice_doc_cod, variacao_classificacao, variacao_resultado
            ) VALUES ${valuesTuples.join(', ')}`,
            params,
        );
    };

    private mapSnapshotRow = (r: Record<string, unknown>): PermutaCandidataSnapshotRow => ({
        runId: String(r.run_id),
        docCod: String(r.doc_cod),
        ...(r.fil_cod != null ? { filCod: Number(r.fil_cod) } : {}),
        priCod: String(r.pri_cod),
        status: r.status === 'elegivel' ? 'elegivel' : 'bloqueada',
        ...(r.motivo_bloqueio != null
            ? { motivoBloqueio: String(r.motivo_bloqueio) as MotivoBloqueio }
            : {}),
        ...(r.aging_days != null ? { agingDays: Number(r.aging_days) } : {}),
        ...(r.invoice_doc_cod != null ? { invoiceDocCod: String(r.invoice_doc_cod) } : {}),
        ...(r.variacao_classificacao != null
            ? { variacaoClassificacao: String(r.variacao_classificacao) }
            : {}),
        ...(r.variacao_resultado != null
            ? { variacaoResultado: Number(r.variacao_resultado) }
            : {}),
    });
}
