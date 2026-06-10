/**
 * PROFORMA — non-fiscal commercial document issued before the actual INVOICE.
 * Sourced from Conexos `com298/list` filtered by `tpdCod = 99`.
 *
 * `pago=true` ↔ Conexos `mnyTitAberto === 0`. Only paid PROFORMAs enter the
 * Δ calculation; unpaid ones surface via `documento_emitido_nao_pago` flag.
 *
 * `dataBaixa` source — Phase 1 of `exposure-from-invoice-baixa`:
 *   `POST com308/financeiroAPagar/baixas/list/<docCod>/1/0` → `rows[0].borDtaMvto`.
 * Same endpoint as INVOICE (both são lado-débito). `undefined` ⇒ não pago.
 *
 * Per the FIFO ontology (`exposicao-fifo-saldo-aberto`), Proforma is a
 * **diagnostic/UI fallback**: it appears in the drilldown for visibility
 * but does NOT enter the FIFO debit stack — INVOICE residual is the only
 * debit camada source. Keep `dataBaixa` for timeline rendering.
 */
export default interface Proforma {
    docCod: string;
    priCod: string;
    dataEmissao: Date;
    valor: number;
    moeda: string;
    pago: boolean;
    /**
     * Discharge date of the Proforma. Used for UI/timeline only — Proforma
     * is NOT a FIFO debit camada in v0.2.
     */
    dataBaixa?: Date;
    exportador?: string;
    /**
     * Valor residual a permutar (`mnyTitPermutar` no detail endpoint Conexos).
     * Hidratado via fan-out GET `/com298/<docCod>` em `enrichValorPermutar`.
     */
    valorPermutar?: number;
}
