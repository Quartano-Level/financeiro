import { injectable } from 'tsyringe';
import {
    MOTIVO_BLOQUEIO,
    type MotivoBloqueio,
} from '../../interface/permutas/EstadoElegibilidade.js';
import type Invoice from '../../interface/permutas/Invoice.js';

export interface CasamentoResult {
    invoiceCasada?: Invoice;
    motivoBloqueio?: MotivoBloqueio;
}

/**
 * CasamentoInvoiceService — ação `casarInvoice` (P0-6 RESOLVIDO).
 *
 * Ontology: `ontology/actions/casar-invoice.md`. "Casada" = exatamente 1
 * INVOICE FINALIZADA no processo. 0 → bloqueada(`sem-invoice`); >1 → caso N:M
 * → bloqueada(`composto-nm`) (backlog nesta fatia). Shape 1:1.
 */
@injectable()
export default class CasamentoInvoiceService {
    public casarInvoice = (invoices: Invoice[]): CasamentoResult => {
        if (invoices.length === 0) {
            return { motivoBloqueio: MOTIVO_BLOQUEIO.SEM_INVOICE };
        }
        if (invoices.length > 1) {
            return { motivoBloqueio: MOTIVO_BLOQUEIO.COMPOSTO_NM };
        }
        return { invoiceCasada: invoices[0] };
    };
}
