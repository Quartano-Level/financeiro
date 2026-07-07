import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado ao tentar incluir um título que já está em OUTRO lote RASCUNHO (I3 —
 * não-duplicação). Evita a mesma parcela em dois lotes candidatos abertos. Rota →
 * HTTP 409. Ver business-rules/nao-duplicacao-titulo-lote.md.
 */
export default class TituloEmOutroLoteError extends Error implements HandlerError {
    public readonly code = 'TITULO_EM_OUTRO_LOTE';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 409;
    public readonly details?: unknown;

    constructor(params: { docCod: string; titCod: string; loteId: string }) {
        super(`titulo ${params.docCod}/${params.titCod} already in draft lote ${params.loteId}`);
        this.name = 'TituloEmOutroLoteError';
        this.userMessage =
            'Este título já está em outro lote em rascunho. Remova-o de lá primeiro.';
        this.details = { docCod: params.docCod, titCod: params.titCod, loteId: params.loteId };
    }
}
