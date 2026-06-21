import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Thrown when a permuta ingestion is requested while another ingestion already
 * holds the advisory lock (`INGEST_LOCK_KEY`) — i.e. the daily cron job or
 * another analyst's manual run is in progress.
 *
 * It is NOT a failure: no data moved, nothing was written. The manual-trigger
 * flow (ADR-0006) deliberately BLOCKS a concurrent run instead of double-firing
 * the Conexos fan-out, so the caller (route) maps this to HTTP 409 and the UI
 * shows "já existe uma ingestão rodando". For the same reason it is `retryable`
 * — the analyst can try again once the running ingestion finishes.
 */
export default class IngestLockBusyError extends Error implements HandlerError {
    public readonly code = 'INGESTION_IN_PROGRESS';
    public readonly userMessage =
        'Já existe uma ingestão em andamento (cron ou outro analista). Aguarde terminar e tente novamente.';
    public readonly retryable = true;
    public readonly statusCode = 409;
    public readonly details?: unknown;

    constructor(message?: string) {
        super(message ?? 'permuta ingest advisory lock busy — another ingestion is running');
        this.name = 'IngestLockBusyError';
    }
}
