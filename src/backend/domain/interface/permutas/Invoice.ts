/**
 * Invoice (Fatura) — lado-crédito da permuta.
 *
 * Ontology: `ontology/entities/invoice.md`. Documento INVOICE finalizado no
 * Conexos (`com298` `tpdCod=128`), do mesmo processo (`priCod`) do Adiantamento.
 * Nesta Fatia 1 só lemos a invoice e verificamos se há uma "casada" para o
 * processo — não há baixa/reconciliação (Fatia 2).
 */
export default interface Invoice {
    docCod: string;
    priCod: string;
    dataEmissao: Date;
    valor: number;
    moeda: string;
    pago: boolean;
    exportador?: string;
}
