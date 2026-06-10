import type { HandlerError } from './HandlerError.js';

/**
 * Caller-facing 4xx error. ApiGatewayHandler maps this to its `statusCode`
 * and surfaces `message` in the response body. Use for validation failures
 * (e.g. Zod parse errors) where the operator can fix the request.
 *
 * Implements `HandlerError` so `ApiGatewayHandler.buildFailure` can echo a
 * structured envelope. `userMessage` is curated (pt-BR) and safe to render.
 */
export default class BadRequestError extends Error implements HandlerError {
    public readonly statusCode: number;
    public readonly details?: unknown;
    public readonly code = 'BAD_REQUEST';
    public readonly userMessage: string;
    public readonly retryable = false;

    constructor(message: string, statusCode = 400, details?: unknown, userMessage?: string) {
        super(message);
        this.name = 'BadRequestError';
        this.statusCode = statusCode;
        this.details = details;
        this.userMessage =
            userMessage ??
            'A requisição contém parâmetros inválidos. Revise os filtros e tente novamente.';
    }
}
