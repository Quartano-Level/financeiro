import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Thrown when BCB (Banco Central) is unreachable or returns 5xx — used by
 * the CDI snapshot fetch path. Implements `HandlerError` so the API layer
 * returns a structured 502 with `code: 'BCB_UPSTREAM_UNAVAILABLE'`.
 */
export class BcbUnavailableError extends Error implements HandlerError {
    public readonly cause?: unknown;
    public readonly code = 'BCB_UPSTREAM_UNAVAILABLE';
    public readonly userMessage =
        'O Banco Central não respondeu. Tente novamente em alguns minutos.';
    public readonly retryable = true;
    public readonly statusCode = 502;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'BcbUnavailableError';
        this.cause = cause;
    }
}

export class CdiNaoDisponivelError extends Error implements HandlerError {
    public readonly code = 'CDI_NOT_AVAILABLE';
    public readonly userMessage =
        'O CDI para a data-base solicitada ainda não foi publicado. Aguarde a divulgação do BCB.';
    public readonly retryable = false;
    public readonly statusCode = 422;

    constructor(message: string) {
        super(message);
        this.name = 'CdiNaoDisponivelError';
    }
}
