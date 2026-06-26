import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado ao tentar REMOVER uma alocação (par adto↔invoice) que JÁ foi usada para abrir um borderô no
 * ERP (existe uma execução real — não dry-run — com `bor_cod`). Remover a alocação descasaria a nossa
 * trilha do que já foi baixado no `fin010` (o saldo do adiantamento voltaria integral) e abriria porta
 * para DUPLA baixa. Integridade financeira inviolável: a remoção é recusada. Para reverter, o caminho é
 * cancelar/excluir o borderô na aba Borderôs (que estorna no ERP), não apagar a alocação.
 *
 * A rota mapeia para HTTP 409 (Conflict); a UI mostra a mensagem e NÃO remove.
 */
export default class AlocacaoEmBorderoError extends Error implements HandlerError {
    public readonly code = 'ALOCACAO_EM_BORDERO';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 409;
    public readonly details?: unknown;

    constructor(params: { adiantamentoDocCod: string; invoiceDocCod: string; borCod: number }) {
        super(
            `cannot remove allocation ${params.adiantamentoDocCod}->${params.invoiceDocCod}: ` +
                `already used in borderô ${params.borCod}`,
        );
        this.name = 'AlocacaoEmBorderoError';
        this.userMessage =
            `Não dá para remover esta alocação: ela já foi usada para abrir o borderô ${params.borCod}. ` +
            `Para reverter, cancele ou exclua o borderô na aba Borderôs (estorna no ERP).`;
        this.details = {
            adiantamentoDocCod: params.adiantamentoDocCod,
            invoiceDocCod: params.invoiceDocCod,
            borCod: params.borCod,
        };
    }
}
