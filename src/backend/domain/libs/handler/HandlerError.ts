/**
 * Structured error contract every error class understood by ApiGatewayHandler
 * MUST implement. Powered by the frontend-observability feature (2026-05-12).
 *
 * Ontology reference: `ontology/integrations/api-error-contract.md`.
 *
 * Fields:
 *   - `code`        — stable machine-readable identifier (closed set). Clients
 *                     branch on this; never on `message`.
 *   - `userMessage` — human, pt-BR, curated. Safe to render in a banner.
 *   - `retryable`   — true ⇢ the UI MAY surface a "Tentar novamente" affordance.
 *   - `statusCode`  — HTTP status code the handler should emit.
 *   - `details`     — optional, whitelisted, no PII / secrets.
 *
 * `message` from `Error` is preserved as the technical/operator-facing message;
 * `userMessage` is what the user sees. They are NOT the same string.
 */
export interface HandlerError {
    readonly code: string;
    readonly userMessage: string;
    readonly retryable: boolean;
    readonly statusCode: number;
    readonly details?: unknown;
}

/**
 * Type guard. Useful in `ApiGatewayHandler.buildFailure` to branch between
 * a structured error (echo the envelope) and an unknown throw (opaque INTERNAL).
 */
export const isHandlerError = (error: unknown): error is HandlerError & Error => {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as Partial<HandlerError>;
    return (
        typeof candidate.code === 'string' &&
        typeof candidate.userMessage === 'string' &&
        typeof candidate.retryable === 'boolean' &&
        typeof candidate.statusCode === 'number'
    );
};
