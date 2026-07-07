import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado ao tentar incluir num lote um título que NÃO está elegível — não
 * `liberado` (alçada) ou já `pago` (I2). Reprovação de regra de negócio, não
 * falha de sistema. Rota → HTTP 422. Ver business-rules/elegibilidade-titulo-lote.md.
 */
export default class TituloNaoElegivelError extends Error implements HandlerError {
    public readonly code = 'TITULO_NAO_ELEGIVEL';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 422;
    public readonly details?: unknown;

    constructor(params: {
        docCod: string;
        titCod: string;
        motivo: 'nao-liberado' | 'ja-pago' | 'nao-encontrado';
    }) {
        super(`titulo ${params.docCod}/${params.titCod} not eligible: ${params.motivo}`);
        this.name = 'TituloNaoElegivelError';
        this.userMessage =
            params.motivo === 'ja-pago'
                ? 'Este título já está pago — não pode entrar no lote.'
                : params.motivo === 'nao-encontrado'
                  ? 'Título não encontrado no Conexos (pode ter mudado). Recarregue o painel.'
                  : 'Este título não está liberado para pagamento (alçada) — não pode entrar no lote.';
        this.details = { docCod: params.docCod, titCod: params.titCod, motivo: params.motivo };
    }
}
