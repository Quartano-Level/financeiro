import { injectable } from 'tsyringe';
import type VariacaoCambial from '../../interface/permutas/VariacaoCambial.js';

export interface CalcularVariacaoInput {
    moeda: string;
    principalMoeda: number;
    taxaAdiantamento: number;
    taxaInvoice: number;
    /** ⏸ GATED-P0-4 — só exibição/aging; NÃO entra na fórmula de classificação. */
    dataBase?: Date;
}

/**
 * VariacaoCambialPermutaService — ação `calcularVariacaoCambial` (P0-1 RESOLVIDO).
 *
 * Ontology: `ontology/business-rules/classificacao-juros-desconto.md`.
 * Classificação por comparação de TAXA de câmbio:
 *   delta = principalMoeda × (taxaInvoice − taxaAdiantamento)
 *   delta > 0 → JUROS    = delta   → conta 131 (passiva)
 *   delta < 0 → DESCONTO = |delta| → conta 130 (ativa)
 *   delta = 0 → neutro (sem juros/desconto)
 */
@injectable()
export default class VariacaoCambialPermutaService {
    public calcular = (input: CalcularVariacaoInput): VariacaoCambial => {
        const { moeda, principalMoeda, taxaAdiantamento, taxaInvoice, dataBase } = input;
        const delta = principalMoeda * (taxaInvoice - taxaAdiantamento);

        const base: VariacaoCambial = {
            moeda,
            principalMoeda,
            taxaAdiantamento,
            taxaInvoice,
            delta,
            resultado: 0,
            ...(dataBase !== undefined ? { dataBase } : {}),
        };

        if (delta > 0) {
            return { ...base, resultado: delta, classificacao: 'JUROS', contaContabil: '131' };
        }
        if (delta < 0) {
            return {
                ...base,
                resultado: Math.abs(delta),
                classificacao: 'DESCONTO',
                contaContabil: '130',
            };
        }
        // delta === 0 → neutro: sem classificacao/contaContabil.
        return base;
    };
}
