import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado ao tentar incluir num lote um título de CLASSE diferente da do lote
 * (I7 — lote uniforme: 100% nacional OU 100% internacional/exterior, nunca misto;
 * rails de pagamento distintos — boleto/PIX nacional vs. câmbio/exterior). Rota → HTTP 422.
 * Ver business-rules/lote-uniforme-nacional-internacional.md.
 */
export default class LoteTipoConflitoError extends Error implements HandlerError {
    public readonly code = 'LOTE_TIPO_DIVERGENTE';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 422;
    public readonly details?: unknown;

    constructor(params: { loteInternacional: boolean; tituloInternacional: boolean }) {
        super(
            `titulo internacional=${params.tituloInternacional} does not match lote internacional=${params.loteInternacional}`,
        );
        this.name = 'LoteTipoConflitoError';
        const loteTipo = params.loteInternacional ? 'internacional' : 'nacional';
        const tituloTipo = params.tituloInternacional ? 'internacional' : 'nacional';
        this.userMessage = `Este lote é ${loteTipo}; o título é ${tituloTipo}. Um lote é 100% nacional ou 100% internacional — nunca misto.`;
        this.details = {
            loteInternacional: params.loteInternacional,
            tituloInternacional: params.tituloInternacional,
        };
    }
}
