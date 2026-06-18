/**
 * DeclaracaoImportacao (D.I XOR DUIMP) — carrega a data-base do borderô.
 *
 * Ontology: `ontology/entities/declaracao-importacao.md`. Duas variantes
 * mutuamente exclusivas: D.I (`imp019`, data CI) XOR DUIMP (`imp223`, data de
 * desembaraço). Vínculo ao processo via `priCod`. Re-introduz o lado-leitura
 * podado no ADR-0003 (escopo: existência/XOR + data-base).
 *
 * ⏸ GATED-P0-4: `dataBase` é declarada porém só populável após o probe de rede
 * capturar o NOME do campo wire em `imp019`/`imp223`. Enquanto isso, nasce
 * `undefined` (não chutar o nome do campo). O Gate 4 valida só existência/XOR —
 * NÃO depende de P0-4.
 */
export type VarianteDeclaracao = 'DI' | 'DUIMP';

export default interface DeclaracaoImportacao {
    variante: VarianteDeclaracao;
    priCod: string;
    /** ⏸ GATED-P0-4 — campo wire não confirmado; `undefined` até o probe. */
    dataBase?: Date;
}
