import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Thrown when a Conexos call is made without a `filCod` and no fallback is
 * configured (per ADR-0009). Multi-tenant safety: in v0.1.x the legacy
 * `ConexosService.defaultHeaders` used to fall back to a hardcoded
 * `config.conexos.filCod = 2`, which silently leaked Columbia's branch
 * code into requests made under any other tenant context.
 *
 * Treated as a caller bug (HTTP 400). Not retryable: the request needs to
 * change before re-issuing.
 */
export default class MissingFilCodError extends Error implements HandlerError {
    public readonly endpoint?: string;
    public readonly code = 'MISSING_FIL_COD';
    public readonly userMessage =
        'Filial não informada na requisição. Reabra o relatório a partir do modal de exportação.';
    public readonly retryable = false;
    public readonly statusCode = 400;
    public readonly details?: unknown;

    constructor(params: { endpoint?: string; message?: string } = {}) {
        super(
            params.message ??
                `Conexos call missing filCod${params.endpoint ? ` (endpoint=${params.endpoint})` : ''}; pass filCod explicitly per ADR-0009`,
        );
        this.name = 'MissingFilCodError';
        this.endpoint = params.endpoint;
        this.details = params.endpoint ? { endpoint: params.endpoint } : undefined;
    }
}
