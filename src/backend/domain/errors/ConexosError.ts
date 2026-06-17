import type { HandlerError } from '../libs/handler/HandlerError.js';

export type ConexosErrorCode = 'CONEXOS_UPSTREAM_TIMEOUT' | 'CONEXOS_UPSTREAM_ERROR';

/**
 * Thrown by `ConexosClient` when an upstream Conexos call fails. Two flavours,
 * picked at the throw site:
 *   - `CONEXOS_UPSTREAM_TIMEOUT` — request exceeded its deadline / socket idle
 *   - `CONEXOS_UPSTREAM_ERROR`   — 5xx, unexpected payload, network reset, etc.
 *
 * Both are retryable from the user's POV. They map to HTTP 504 (gateway timeout
 * semantics — we are gating a slow upstream).
 */
export default class ConexosError extends Error implements HandlerError {
    public readonly endpoint: string;
    public readonly priCod?: string;
    public readonly cause?: unknown;
    public readonly code: ConexosErrorCode;
    public readonly userMessage: string;
    public readonly retryable = true;
    public readonly statusCode = 504;
    public readonly details?: unknown;

    constructor(params: {
        endpoint: string;
        priCod?: string;
        message?: string;
        cause?: unknown;
        code?: ConexosErrorCode;
    }) {
        super(params.message ?? `Conexos call to ${params.endpoint} failed`);
        this.name = 'ConexosError';
        this.endpoint = params.endpoint;
        this.priCod = params.priCod;
        this.cause = params.cause;
        this.code = params.code ?? 'CONEXOS_UPSTREAM_ERROR';
        this.userMessage =
            this.code === 'CONEXOS_UPSTREAM_TIMEOUT'
                ? 'O ERP Conexos demorou demais para responder. Tente novamente em alguns minutos.'
                : 'O ERP Conexos retornou um erro. Tente novamente em alguns minutos.';
        this.details = { endpoint: params.endpoint, priCod: params.priCod };
    }
}
