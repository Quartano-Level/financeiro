/**
 * VariacaoCambial — resultado derivado do cálculo cambial sobre o par
 * Adiantamento × Invoice (comparação de TAXA de câmbio, P0-1 RESOLVIDO).
 *
 * Ontology: `ontology/entities/variacao-cambial.md` e
 * `ontology/business-rules/classificacao-juros-desconto.md`.
 *
 * Fórmula canônica:
 *   delta = principalMoeda × (taxaAdiantamento − taxaInvoice)
 *   delta > 0 (taxaAdiantamento > taxaInvoice) → JUROS    = delta   → conta 131
 *   delta < 0 (taxaAdiantamento < taxaInvoice) → DESCONTO = |delta| → conta 130
 *   delta = 0 → sem juros/desconto (classificacao indefinida)
 *
 * Âncora real (Yuri 2026-06-18): taxa_adiantamento=5,31 > taxa_invoice=5,19 → JUROS.
 */
export type ClassificacaoVariacao = 'JUROS' | 'DESCONTO';
export type ContaContabilVariacao = '130' | '131';

export default interface VariacaoCambial {
    moeda: string;
    principalMoeda: number;
    taxaAdiantamento: number;
    taxaInvoice: number;
    /** ⏸ GATED-P0-4 — vem de `DeclaracaoImportacao.dataBase` (probe pendente). */
    dataBase?: Date;
    delta: number;
    /** JUROS → delta; DESCONTO → |delta|; neutro → 0. */
    resultado: number;
    /** `undefined` quando taxas iguais (sem juros/desconto). */
    classificacao?: ClassificacaoVariacao;
    /** JUROS → '131' (passiva); DESCONTO → '130' (ativa); neutro → undefined. */
    contaContabil?: ContaContabilVariacao;
}
