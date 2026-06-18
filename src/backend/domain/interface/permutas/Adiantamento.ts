/**
 * Adiantamento (PROFORMA) — lado-débito da permuta.
 *
 * Ontology: `ontology/entities/adiantamento.md`. Documento financeiro a-pagar
 * do tipo PROFORMA (`com298` `tpdCod=99`), vinculado a um processo de importação
 * (`priCod`). Esta fatia (Fatia 1, READ-ONLY) apenas lê e avalia adiantamentos.
 *
 * `valorPermutar` é hidratado no detail (`getMnyTitPermutar`) — `null` no list,
 * por isso opcional. `pago` é derivado (`isPago` no `ConexosClient`).
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
    /** Saldo a permutar (detail `getMnyTitPermutar`). Gate 2 (`> 0`). */
    valorPermutar?: number;
    exportador?: string;
}
