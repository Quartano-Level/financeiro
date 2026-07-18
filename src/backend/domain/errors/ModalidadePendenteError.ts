import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado ao tentar FINALIZAR um lote com item(ns) sem forma de pagamento definida
 * ("a definir") — A2: a revisão do analista é obrigatória (boleto auto-detectado passa;
 * sem forma de pagamento, o analista precisa escolher). Rota → HTTP 422.
 */
export default class ModalidadePendenteError extends Error implements HandlerError {
    public readonly code = 'MODALIDADE_PENDENTE';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 422;
    public readonly details?: unknown;

    constructor(params: { loteId: string; pendentes: number }) {
        super(`lote ${params.loteId} has ${params.pendentes} item(s) without modalidade`);
        this.name = 'ModalidadePendenteError';
        this.userMessage = `Defina a forma de pagamento de ${params.pendentes} título(s) antes de finalizar.`;
        this.details = { loteId: params.loteId, pendentes: params.pendentes };
    }
}
