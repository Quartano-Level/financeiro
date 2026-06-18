import 'reflect-metadata';
import CasamentoInvoiceService from './CasamentoInvoiceService.js';
import { MOTIVO_BLOQUEIO } from '../../interface/permutas/EstadoElegibilidade.js';
import type Invoice from '../../interface/permutas/Invoice.js';

const buildInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    docCod: 'I1',
    priCod: '2048',
    dataEmissao: new Date('2026-04-01'),
    valor: 1000,
    moeda: 'USD',
    pago: false,
    ...overrides,
});

describe('CasamentoInvoiceService.casarInvoice (P0-6: exatamente 1 finalizada)', () => {
    const service = new CasamentoInvoiceService();

    it('matches exactly 1 finalized invoice → invoiceCasada, no motivo', () => {
        const invoice = buildInvoice();
        const result = service.casarInvoice([invoice]);
        expect(result.invoiceCasada).toEqual(invoice);
        expect(result.motivoBloqueio).toBeUndefined();
    });

    it('0 invoices → BLOQUEADA(sem-invoice)', () => {
        const result = service.casarInvoice([]);
        expect(result.invoiceCasada).toBeUndefined();
        expect(result.motivoBloqueio).toBe(MOTIVO_BLOQUEIO.SEM_INVOICE);
    });

    it('>1 invoices → BLOQUEADA(composto-nm)', () => {
        const result = service.casarInvoice([
            buildInvoice({ docCod: 'I1' }),
            buildInvoice({ docCod: 'I2' }),
        ]);
        expect(result.invoiceCasada).toBeUndefined();
        expect(result.motivoBloqueio).toBe(MOTIVO_BLOQUEIO.COMPOSTO_NM);
    });
});
