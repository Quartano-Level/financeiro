/**
 * INVOICE lançada (financial-side recording) — sourced from Conexos
 * `com298/list` filtered by `tpdCod = 128`. Pairs with Solicitação
 * de Numerário (B1) when both are present.
 *
 * `dataPagamento` source — Phase 1 of `exposure-from-invoice-baixa`:
 *   `POST com308/financeiroAPagar/baixas/list/<docCod>/1/0` → `rows[0].borDtaMvto`.
 * Hydrated by `ConexosClient.listBaixasTitulo` after the initial `com298/list`
 * fetch. `undefined` = no baixa registered yet (FIFO does NOT open a debit
 * camada in that case — invariant I4 of the interview transcript).
 *
 * `pago=true` ↔ Conexos `mnyTitAberto === 0`. Only paid INVOICEs enter the
 * Δ calculation; unpaid ones surface via `documento_emitido_nao_pago` flag.
 *
 * `faturada=true` means the INVOICE has already been billed to the
 * client (linked to a NF saída in com297) — those rows are skipped from
 * the open-stock calculation under the γ partial-billed convention.
 */
export default interface InvoiceLancamento {
    docCod: string;
    priCod: string;
    dataEmissao: Date;
    valor: number;
    moeda: string;
    pago: boolean;
    faturada: boolean;
    /**
     * Discharge date of the INVOICE títuloAPagar (titCod=1).
     * `undefined` ⇒ não pago / sem baixa — não vira camada de débito FIFO.
     */
    dataPagamento?: Date;
    exportador?: string;
    /**
     * Valor residual a permutar (`mnyTitPermutar` no detail endpoint Conexos).
     * Hidratado via fan-out GET `/com298/<docCod>` em `enrichValorPermutar`.
     * Diagnóstico/auditoria; não consumido pelo FIFO.
     */
    valorPermutar?: number;
    /**
     * Valor efetivamente DESEMBOLSADO em INVOICE até `dataBase`, conforme
     * regra `invoice-permutar-via-baixas` (ontology/business-rules/, P0 Active
     * desde 2026-05-19): Σ `bxaMnyValor` das baixas finalizadas com
     * `gerNum ∉ {4, 9}` e `borDtaMvto ≤ dataBase`. Semantic distinto de
     * `valorPermutar` (que mede saldo residual). Hidratado por
     * `LancamentoFinanceiroBaixaService.hidratarInvoice` quando `dataBase`
     * é fornecida. `undefined` em paths legados (testes sem dataBase) — o
     * agregador `FechamentoMensalService.computeTotaisPorOrigem` cai no
     * proforma-offset clássico nesse caso.
     */
    valorDesembolsado?: number;
    /**
     * `true` quando a INVOICE **não possui nenhuma baixa finalizada** em
     * `dataBase` — conforme regra `invoice-permutar-via-baixas`, INVOICEs
     * sem baixa são DESCARTADAS: não somam no Total Desembolsado, não
     * aparecem no drilldown lado-débito. Hidratado pelo
     * `LancamentoFinanceiroBaixaService.hidratarInvoice`.
     */
    discarded?: boolean;
}
