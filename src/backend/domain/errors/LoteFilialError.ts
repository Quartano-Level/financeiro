import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado ao tentar incluir num lote um título de filial DIFERENTE da do lote
 * (I4 — uma filial por lote, compatível com o `fin015` nativo). Rota → HTTP 422.
 * Ver business-rules/lote-uma-filial.md.
 */
export default class LoteFilialError extends Error implements HandlerError {
    public readonly code = 'LOTE_FILIAL_DIVERGENTE';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 422;
    public readonly details?: unknown;

    constructor(params: { loteFilCod: number; tituloFilCod: number }) {
        super(
            `titulo filCod=${params.tituloFilCod} does not match lote filCod=${params.loteFilCod}`,
        );
        this.name = 'LoteFilialError';
        this.userMessage = `Este lote é da filial ${params.loteFilCod}; o título é da filial ${params.tituloFilCod}. Um lote é de uma filial só.`;
        this.details = { loteFilCod: params.loteFilCod, tituloFilCod: params.tituloFilCod };
    }
}
