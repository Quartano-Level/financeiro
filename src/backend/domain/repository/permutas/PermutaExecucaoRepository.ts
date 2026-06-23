import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';

export type ExecucaoStatus = 'pending' | 'reconciling' | 'settled' | 'error';

/** Linha de execução da baixa/permuta no ERP (Fase 3 — auditoria/idempotência). */
export interface ExecucaoRow {
    idempotencyKey: string;
    adiantamentoDocCod: string;
    invoiceDocCod: string;
    filCod: number;
    status: ExecucaoStatus;
    dryRun: boolean;
    borCod?: number;
    bxaCodSeq?: number;
    valorBaixado?: number;
    juros?: number;
    contaJuros?: number;
    erpResponse?: unknown;
    erroMensagem?: string;
    executadoPor?: string;
    criadoEm: Date;
    atualizadoEm: Date;
}

export interface BeginExecutionInput {
    idempotencyKey: string;
    adiantamentoDocCod: string;
    invoiceDocCod: string;
    filCod: number;
    dryRun: boolean;
    executadoPor: string;
}

export interface BeginExecutionResult {
    /** Status APÓS o upsert. `settled` ⇒ já estava executada (idempotência) — pular. */
    status: ExecucaoStatus;
    /** TRUE quando a linha já estava `settled` antes desta chamada. */
    alreadySettled: boolean;
}

/**
 * PermutaExecucaoRepository — trilha de execução da baixa/permuta no `fin010` (Fase 3).
 *
 * Write-ahead: `insertIntent` grava a intenção (status `reconciling`) ANTES do POST; só
 * `markSettled` (após confirmação do ERP) a torna `settled`; `markError` registra a falha
 * com a resposta crua para reconciliação manual. `findByIdempotencyKey` dá a idempotência
 * (re-execução com a mesma chave curto-circuita). SQL 100% parametrizado (Rule #5).
 */
@injectable()
export default class PermutaExecucaoRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    public findByIdempotencyKey = async (key: string): Promise<ExecucaoRow | null> => {
        const row = await this.databaseClient.selectFirst<Record<string, unknown>>(
            `SELECT idempotency_key, adiantamento_doc_cod, invoice_doc_cod, fil_cod, status, dry_run,
                    bor_cod, bxa_cod_seq, valor_baixado, juros, conta_juros, erp_response,
                    erro_mensagem, executado_por, criado_em, atualizado_em
             FROM permuta_alocacao_execucao
             WHERE idempotency_key = $key`,
            { key },
        );
        return row ? this.mapRow(row) : null;
    };

    public listByAdiantamento = async (adiantamentoDocCod: string): Promise<ExecucaoRow[]> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT idempotency_key, adiantamento_doc_cod, invoice_doc_cod, fil_cod, status, dry_run,
                    bor_cod, bxa_cod_seq, valor_baixado, juros, conta_juros, erp_response,
                    erro_mensagem, executado_por, criado_em, atualizado_em
             FROM permuta_alocacao_execucao
             WHERE adiantamento_doc_cod = $adtoDocCod
             ORDER BY criado_em`,
            { adtoDocCod: adiantamentoDocCod },
        );
        return rows.map((r) => this.mapRow(r));
    };

    /**
     * Write-ahead: abre (ou reabre) a execução de um par adto↔invoice.
     * - Linha nova → status `reconciling` (real) ou `pending` (dry-run).
     * - Linha existente NÃO-settled → reaberta (retry) com o novo status.
     * - Linha `settled` → PRESERVADA (idempotência): não regride. `alreadySettled=true`.
     */
    public beginExecution = async (input: BeginExecutionInput): Promise<BeginExecutionResult> => {
        const newStatus: ExecucaoStatus = input.dryRun ? 'pending' : 'reconciling';
        const row = await this.databaseClient.selectFirst<{ status: string }>(
            `INSERT INTO permuta_alocacao_execucao (
                idempotency_key, adiantamento_doc_cod, invoice_doc_cod, fil_cod,
                status, dry_run, executado_por, atualizado_em
            ) VALUES (
                $key, $adtoDocCod, $invoiceDocCod, $filCod,
                $newStatus, $dryRun, $executadoPor, now()
            )
            ON CONFLICT (idempotency_key) DO UPDATE SET
                status = CASE WHEN permuta_alocacao_execucao.status = 'settled'
                              THEN permuta_alocacao_execucao.status ELSE EXCLUDED.status END,
                dry_run = CASE WHEN permuta_alocacao_execucao.status = 'settled'
                               THEN permuta_alocacao_execucao.dry_run ELSE EXCLUDED.dry_run END,
                executado_por = CASE WHEN permuta_alocacao_execucao.status = 'settled'
                               THEN permuta_alocacao_execucao.executado_por ELSE EXCLUDED.executado_por END,
                atualizado_em = now()
            RETURNING status`,
            {
                key: input.idempotencyKey,
                adtoDocCod: input.adiantamentoDocCod,
                invoiceDocCod: input.invoiceDocCod,
                filCod: input.filCod,
                newStatus,
                dryRun: input.dryRun,
                executadoPor: input.executadoPor,
            },
        );
        const status = (row?.status ?? newStatus) as ExecucaoStatus;
        // `newStatus` nunca é 'settled' (só markSettled grava isso). Logo, um status
        // 'settled' retornado = a linha JÁ estava settled e foi preservada (idempotência).
        return { status, alreadySettled: status === 'settled' };
    };

    public setRequestPayload = async (key: string, payload: unknown): Promise<void> => {
        await this.databaseClient.update(
            `UPDATE permuta_alocacao_execucao
             SET request_payload = $payload::jsonb, atualizado_em = now()
             WHERE idempotency_key = $key`,
            { key, payload: JSON.stringify(payload ?? null) },
        );
    };

    public markSettled = async (
        key: string,
        data: {
            borCod?: number;
            bxaCodSeq?: number;
            valorBaixado?: number;
            juros?: number;
            contaJuros?: number;
            erpResponse?: unknown;
        },
    ): Promise<void> => {
        await this.databaseClient.update(
            `UPDATE permuta_alocacao_execucao SET
                status = 'settled',
                bor_cod = $borCod,
                bxa_cod_seq = $bxaCodSeq,
                valor_baixado = $valorBaixado,
                juros = $juros,
                conta_juros = $contaJuros,
                erp_response = $erpResponse::jsonb,
                erro_mensagem = NULL,
                atualizado_em = now()
             WHERE idempotency_key = $key`,
            {
                key,
                borCod: data.borCod ?? null,
                bxaCodSeq: data.bxaCodSeq ?? null,
                valorBaixado: data.valorBaixado ?? null,
                juros: data.juros ?? null,
                contaJuros: data.contaJuros ?? null,
                erpResponse: JSON.stringify(data.erpResponse ?? null),
            },
        );
    };

    public markError = async (
        key: string,
        data: { erroMensagem: string; erpResponse?: unknown; borCod?: number },
    ): Promise<void> => {
        await this.databaseClient.update(
            `UPDATE permuta_alocacao_execucao SET
                status = 'error',
                erro_mensagem = $erroMensagem,
                erp_response = $erpResponse::jsonb,
                bor_cod = COALESCE($borCod, bor_cod),
                atualizado_em = now()
             WHERE idempotency_key = $key`,
            {
                key,
                erroMensagem: data.erroMensagem,
                erpResponse: JSON.stringify(data.erpResponse ?? null),
                borCod: data.borCod ?? null,
            },
        );
    };

    private mapRow = (r: Record<string, unknown>): ExecucaoRow => ({
        idempotencyKey: String(r.idempotency_key),
        adiantamentoDocCod: String(r.adiantamento_doc_cod),
        invoiceDocCod: String(r.invoice_doc_cod),
        filCod: Number(r.fil_cod),
        status: r.status as ExecucaoStatus,
        dryRun: Boolean(r.dry_run),
        ...(r.bor_cod != null ? { borCod: Number(r.bor_cod) } : {}),
        ...(r.bxa_cod_seq != null ? { bxaCodSeq: Number(r.bxa_cod_seq) } : {}),
        ...(r.valor_baixado != null ? { valorBaixado: Number(r.valor_baixado) } : {}),
        ...(r.juros != null ? { juros: Number(r.juros) } : {}),
        ...(r.conta_juros != null ? { contaJuros: Number(r.conta_juros) } : {}),
        ...(r.erp_response != null ? { erpResponse: r.erp_response } : {}),
        ...(r.erro_mensagem != null ? { erroMensagem: String(r.erro_mensagem) } : {}),
        ...(r.executado_por != null ? { executadoPor: String(r.executado_por) } : {}),
        criadoEm: new Date(r.criado_em as string | Date),
        atualizadoEm: new Date(r.atualizado_em as string | Date),
    });
}
