/**
 * Adiantamento (PROFORMA) — lado-débito da permuta.
 *
 * Ontology: `ontology/entities/adiantamento.md`. Documento financeiro a-pagar
 * do tipo PROFORMA (`com298` `tpdCod=99`), vinculado a um processo de importação
 * (`priCod`). Esta fatia (Fatia 1, READ-ONLY) apenas lê e avalia adiantamentos.
 *
 * `valorPermutar` é hidratado no detail (`getDetalheTitulos`) — `null` no list,
 * por isso opcional. `pago` também é hidratado no detail (`mnyTitAberto === 0`):
 * o list devolve `mnyTitAberto`/`mnyTitPago` NULL em produção, então o valor da
 * row do list é sempre `false` e é sobrescrito pelo detalhe na eleição.
 */
export default interface Adiantamento {
    docCod: string;
    priCod: string;
    /**
     * Filial (branch) que originou o adiantamento — invariante multi-filial I6.
     * Propagado ponta-a-ponta (eleição → snapshot row → INSERT `fil_cod`) para
     * que o painel/auditoria O6 saiba a filial de cada candidata (P0-2).
     */
    filCod: number;
    dataEmissao: Date;
    valor: number;
    moeda: string;
    pago: boolean;
    /** Saldo a permutar (detail `getDetalheTitulos`). Gate 2 (`> 0`). */
    valorPermutar?: number;
    /** Nome do exportador/destino do pagamento (`com298.dpeNomPessoa`). */
    exportador?: string;
    /**
     * Referência humana do documento — `docEspNumero` (fallback
     * `priEspRefcliente`). Exibida na coluna "Referência" da tela Gestão.
     * Opcional: ausente quando o `com298/list` não traz o campo.
     */
    referencia?: string;
    /**
     * Valor do documento em moeda estrangeira negociada (`titMnyValorMneg` /
     * `TituloAPagar.valorNegociado`). Distinto de `valor` (face). Exibido na
     * coluna "Valor Moeda Negociada". Opcional — depende do detalhe do título.
     */
    valorMoedaNegociada?: number;
}
