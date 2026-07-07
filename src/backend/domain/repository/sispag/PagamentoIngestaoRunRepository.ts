import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import type { PagamentoIngestaoRun } from '../../interface/sispag/SispagInterface.js';

interface RunRow {
    id: string;
    triggered_by: string;
    status: PagamentoIngestaoRun['status'];
    total_titulos: number;
    total_inativados: number;
    error_message: string | null;
    started_at: Date;
    finished_at: Date | null;
}

/**
 * PagamentoIngestaoRunRepository — trilha de auditoria da ingestão de pagamentos
 * (espelha `permuta_eleicao_run`). SQL parametrizado. NÃO toca o ERP.
 */
@injectable()
export default class PagamentoIngestaoRunRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    private map = (r: RunRow): PagamentoIngestaoRun => ({
        id: r.id,
        triggeredBy: r.triggered_by,
        status: r.status,
        totalTitulos: r.total_titulos,
        totalInativados: r.total_inativados,
        errorMessage: r.error_message ?? undefined,
        startedAt: r.started_at.toISOString(),
        finishedAt: r.finished_at ? r.finished_at.toISOString() : undefined,
    });

    /** Abre uma run (status 'running'); devolve o runId. */
    public createRun = async (input: { triggeredBy: string; flowId?: string }): Promise<string> => {
        const id = randomUUID();
        await this.databaseClient.insert(
            `INSERT INTO pagamento_ingestao_run (id, flow_id, triggered_by, status)
             VALUES ($id, $flowId, $triggeredBy, 'running')`,
            { id, flowId: input.flowId ?? null, triggeredBy: input.triggeredBy },
        );
        return id;
    };

    /** Fecha a run com o resultado. */
    public finishRun = async (input: {
        runId: string;
        status: 'success' | 'error';
        totalTitulos: number;
        totalInativados: number;
        errorMessage?: string;
    }): Promise<void> => {
        await this.databaseClient.update(
            `UPDATE pagamento_ingestao_run
             SET status = $status, total_titulos = $totalTitulos,
                 total_inativados = $totalInativados, error_message = $errorMessage,
                 finished_at = now()
             WHERE id = $runId`,
            {
                runId: input.runId,
                status: input.status,
                totalTitulos: input.totalTitulos,
                totalInativados: input.totalInativados,
                errorMessage: input.errorMessage ?? null,
            },
        );
    };

    public listRecentRuns = async (limit: number): Promise<PagamentoIngestaoRun[]> => {
        const rows = (await this.databaseClient.selectMany(
            `SELECT id, triggered_by, status, total_titulos, total_inativados,
                    error_message, started_at, finished_at
             FROM pagamento_ingestao_run
             ORDER BY started_at DESC
             LIMIT $limit`,
            { limit },
        )) as RunRow[];
        return rows.map(this.map);
    };

    /** finished_at da última ingestão bem-sucedida — carimbo de "idade" da carteira. */
    public findLatestSuccessFinishedAt = async (): Promise<Date | null> => {
        const row = await this.databaseClient.selectFirst<{ finished_at: Date | string }>(
            `SELECT finished_at FROM pagamento_ingestao_run
             WHERE status = 'success' AND finished_at IS NOT NULL
             ORDER BY finished_at DESC LIMIT 1`,
        );
        return row ? new Date(row.finished_at) : null;
    };

    public findRunIdByIdempotencyKey = async (key: string): Promise<string | null> => {
        const row = await this.databaseClient.selectFirst<{ run_id: string }>(
            `SELECT run_id FROM pagamento_ingestao_idempotency
             WHERE idempotency_key = $key AND criado_em > now() - INTERVAL '24 hours'`,
            { key },
        );
        return row ? row.run_id : null;
    };

    public recordIdempotencyKey = async (key: string, runId: string): Promise<void> => {
        await this.databaseClient.insert(
            `INSERT INTO pagamento_ingestao_idempotency (idempotency_key, run_id)
             VALUES ($key, $runId) ON CONFLICT (idempotency_key) DO NOTHING`,
            { key, runId },
        );
    };
}
