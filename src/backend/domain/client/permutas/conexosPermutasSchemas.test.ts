import { com298RowSchema, com308RowSchema, declaracaoRowSchema } from './conexosPermutasSchemas.js';
import {
    ADIANTAMENTO_FILTER_KEY,
    ADIANTAMENTO_FILTER_VALUE,
    TPD_INVOICE,
    TPD_PROFORMA,
    VLD_STATUS_FINALIZADO,
} from './conexosPermutasConstants.js';

describe('conexosPermutasConstants', () => {
    it('exposes Columbia tenant ids as typed constants', () => {
        expect(TPD_PROFORMA).toBe(99);
        expect(TPD_INVOICE).toBe(128);
        expect(VLD_STATUS_FINALIZADO).toEqual(['3']);
    });

    it('isolates the adiantamento filter build-probe in a single constant', () => {
        // 🔬 PROBE — provisional literal; assert it is defined & non-empty.
        expect(typeof ADIANTAMENTO_FILTER_KEY).toBe('string');
        expect(ADIANTAMENTO_FILTER_KEY.length).toBeGreaterThan(0);
        expect(ADIANTAMENTO_FILTER_VALUE.length).toBeGreaterThan(0);
    });
});

describe('com298RowSchema', () => {
    it('accepts a valid row and stringifies numeric ids', () => {
        const parsed = com298RowSchema.parse({
            docCod: 5974,
            priCod: 1153,
            docMnyValor: 723094.81,
        });
        expect(parsed.docCod).toBe('5974');
        expect(parsed.priCod).toBe('1153');
    });

    it('rejects a row missing docCod', () => {
        expect(() => com298RowSchema.parse({ priCod: 1153 })).toThrow();
    });

    it('rejects a row missing priCod', () => {
        expect(() => com298RowSchema.parse({ docCod: 1 })).toThrow();
    });
});

describe('com308RowSchema', () => {
    it('coerces optional numeric fields and keeps undefined as undefined', () => {
        const parsed = com308RowSchema.parse({
            titCod: 24107,
            titFltTaxaMneg: '5.0211',
            titMnyValorMneg: 1000,
        });
        expect(parsed.titCod).toBe('24107');
        expect(parsed.titFltTaxaMneg).toBeCloseTo(5.0211);
        expect(parsed.titMnyValorMneg).toBe(1000);
        expect(parsed.moeCodMneg).toBeUndefined();
    });

    it('rejects a non-numeric taxa', () => {
        expect(() =>
            com308RowSchema.parse({ titCod: 1, titFltTaxaMneg: 'not-a-number' }),
        ).toThrow();
    });
});

describe('declaracaoRowSchema', () => {
    it('validates priCod (existence is enough for the XOR gate)', () => {
        const parsed = declaracaoRowSchema.parse({ priCod: 2048 });
        expect(parsed.priCod).toBe('2048');
    });

    it('rejects a row without priCod', () => {
        expect(() => declaracaoRowSchema.parse({})).toThrow();
    });
});
