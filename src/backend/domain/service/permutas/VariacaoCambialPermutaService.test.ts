import 'reflect-metadata';
import VariacaoCambialPermutaService from './VariacaoCambialPermutaService.js';

describe('VariacaoCambialPermutaService.calcular (P0-1: classificação por TAXA)', () => {
    const service = new VariacaoCambialPermutaService();

    it('taxaAdiantamento > taxaInvoice → JUROS, resultado=delta, conta 131 (caso real 5,31/5,19)', () => {
        const vc = service.calcular({
            moeda: 'USD',
            principalMoeda: 1000,
            taxaAdiantamento: 5.31,
            taxaInvoice: 5.19,
        });
        // delta = 1000 × (5.31 − 5.19) = 120 → JUROS (taxa do adiantamento maior).
        expect(vc.delta).toBeCloseTo(120);
        expect(vc.classificacao).toBe('JUROS');
        expect(vc.resultado).toBeCloseTo(120);
        expect(vc.contaContabil).toBe('131');
    });

    it('taxaAdiantamento < taxaInvoice → DESCONTO, resultado=|delta|, conta 130', () => {
        const vc = service.calcular({
            moeda: 'USD',
            principalMoeda: 1000,
            taxaAdiantamento: 5.0,
            taxaInvoice: 5.2,
        });
        // delta = 1000 × (5.0 − 5.2) = −200 → DESCONTO.
        expect(vc.delta).toBeCloseTo(-200);
        expect(vc.classificacao).toBe('DESCONTO');
        expect(vc.resultado).toBeCloseTo(200);
        expect(vc.contaContabil).toBe('130');
    });

    it('equal rates → no juros/desconto (neutral)', () => {
        const vc = service.calcular({
            moeda: 'USD',
            principalMoeda: 1000,
            taxaAdiantamento: 5.0,
            taxaInvoice: 5.0,
        });
        expect(vc.delta).toBeCloseTo(0);
        expect(vc.resultado).toBeCloseTo(0);
        expect(vc.classificacao).toBeUndefined();
        expect(vc.contaContabil).toBeUndefined();
    });

    it('dataBase does NOT affect classification (only exhibition/aging)', () => {
        const withDate = service.calcular({
            moeda: 'USD',
            principalMoeda: 1000,
            taxaAdiantamento: 5.0,
            taxaInvoice: 5.2,
            dataBase: new Date('2026-06-07'),
        });
        const withoutDate = service.calcular({
            moeda: 'USD',
            principalMoeda: 1000,
            taxaAdiantamento: 5.0,
            taxaInvoice: 5.2,
        });
        expect(withDate.classificacao).toBe(withoutDate.classificacao);
        expect(withDate.delta).toBeCloseTo(withoutDate.delta);
        expect(withDate.dataBase).toEqual(new Date('2026-06-07'));
        expect(withoutDate.dataBase).toBeUndefined();
    });
});
