import type { HandlerError } from '../libs/handler/HandlerError.js';

/**
 * Lançado quando uma alocação manual (Fase 2) excederia o saldo de um dos lados:
 * o saldo a permutar do adiantamento OU o valor em aberto da invoice. Não é falha
 * de sistema — é uma reprovação de regra de negócio (o analista pediu mais do que
 * cabe). A rota mapeia para HTTP 422; a UI mostra a mensagem e NÃO grava.
 */
export default class AlocacaoSaldoError extends Error implements HandlerError {
    public readonly code = 'ALOCACAO_EXCEDE_SALDO';
    public readonly userMessage: string;
    public readonly retryable = false;
    public readonly statusCode = 422;
    public readonly details?: unknown;

    constructor(params: { lado: 'adiantamento' | 'invoice'; disponivel: number; pedido: number }) {
        super(
            `allocation exceeds ${params.lado} balance: requested=${params.pedido} available=${params.disponivel}`,
        );
        this.name = 'AlocacaoSaldoError';
        this.userMessage =
            params.lado === 'adiantamento'
                ? `Valor excede o saldo a permutar do adiantamento (disponível: ${params.disponivel}).`
                : `Valor excede o saldo em aberto da invoice (disponível: ${params.disponivel}).`;
        this.details = { lado: params.lado, disponivel: params.disponivel, pedido: params.pedido };
    }
}
