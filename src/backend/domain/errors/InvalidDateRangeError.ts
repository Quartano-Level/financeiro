import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Thrown when the requested date range is invalid (e.g. `dataBase` in the
 * future, or `dataInicio > dataFim`). HTTP 400 — the operator must fix
 * the request.
 */
export default class InvalidDateRangeError extends Error implements HandlerError {
    public readonly code = 'INVALID_DATE_RANGE';
    public readonly userMessage =
        'O intervalo de datas informado é inválido. Verifique a data-base e tente novamente.';
    public readonly retryable = false;
    public readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = 'InvalidDateRangeError';
    }
}
