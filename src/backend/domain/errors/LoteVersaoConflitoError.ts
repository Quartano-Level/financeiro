import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado quando uma transição do lote falha o optimistic lock (I6): a `versao`
 * esperada não bate com a atual — outro analista mexeu no lote em paralelo. Rota →
 * HTTP 409. A UI recarrega o lote e o usuário reaplica a ação.
 */
export default class LoteVersaoConflitoError extends Error implements HandlerError {
    public readonly code = 'LOTE_VERSAO_CONFLITO';
    public readonly userMessage: string;
    public readonly retryable = true;
    public readonly statusCode = 409;
    public readonly details?: unknown;

    constructor(params: { loteId: string; versaoEsperada: number }) {
        super(
            `optimistic lock failed for lote ${params.loteId} (expected versao=${params.versaoEsperada})`,
        );
        this.name = 'LoteVersaoConflitoError';
        this.userMessage = 'Este lote foi alterado por outra pessoa. Recarregue e tente de novo.';
        this.details = { loteId: params.loteId, versaoEsperada: params.versaoEsperada };
    }
}
