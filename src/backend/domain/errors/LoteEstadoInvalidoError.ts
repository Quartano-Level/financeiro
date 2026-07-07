import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado quando uma ação é incompatível com o estado atual do lote — finalizar
 * um lote vazio, finalizar/incluir num lote já FINALIZADO/CANCELADO, reabrir um
 * CANCELADO, etc. (ver state-machines/lote-pagamento.md). Rota → HTTP 409.
 */
export default class LoteEstadoInvalidoError extends Error implements HandlerError {
    public readonly code = 'LOTE_ESTADO_INVALIDO';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 409;
    public readonly details?: unknown;

    constructor(params: { loteId: string; statusAtual: string; acao: string; motivo?: string }) {
        super(
            `action "${params.acao}" invalid for lote ${params.loteId} in status ${params.statusAtual}`,
        );
        this.name = 'LoteEstadoInvalidoError';
        this.userMessage =
            params.motivo ?? `Não é possível ${params.acao}: o lote está em ${params.statusAtual}.`;
        this.details = {
            loteId: params.loteId,
            statusAtual: params.statusAtual,
            acao: params.acao,
        };
    }
}
