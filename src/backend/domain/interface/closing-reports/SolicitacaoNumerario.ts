/**
 * Solicitação de Numerário — financial advance request from the importing
 * client to the trading company. Sourced from Conexos `com299/list`
 * filtered by `tpdCod = 3`.
 *
 * `pago=true` ↔ Conexos `mnyTitAberto === 0`. Only paid SolNums enter the
 * Δ calculation; unpaid ones surface via `documento_emitido_nao_pago` flag.
 *
 * `dataBaixa` source — Phase 1 of `exposure-from-invoice-baixa`:
 *   `POST com308/financeiroAReceber/baixas/list/<docCod>/1/0` → `rows[0].borDtaMvto`.
 * Note the `financeiroAReceber` path — distinct from INVOICE/Proforma which
 * go through `financeiroAPagar`. Hydrated by
 * `ConexosClient.listBaixasSolNum`.
 *
 * `undefined` ⇒ não pago / sem baixa — not eligible to enter the FIFO
 * credit stack (invariant I4 of the interview).
 */
export default interface SolicitacaoNumerario {
    docCod: string;
    priCod: string;
    dataEmissao: Date;
    valor: number;
    moeda: string;
    pago: boolean;
    /**
     * Discharge date of the SolNum (when the importer has actually paid the
     * advance). `undefined` ⇒ não baixado — FIFO does NOT open a credit
     * camada in that case.
     */
    dataBaixa?: Date;
    importador?: string;
    /**
     * Valor residual a permutar (`mnyTitPermutar` no detail endpoint Conexos).
     * Hidratado via fan-out GET `/com299/<docCod>` em `enrichValorPermutar`.
     */
    valorPermutar?: number;
}
