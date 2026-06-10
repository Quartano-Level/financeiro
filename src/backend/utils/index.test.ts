import {
    DEBUG_VERBOSE,
    boxLog,
    brDayKey,
    formatBrDate,
    isOnOrBeforeBrDay,
    logEvent,
    parseDataBaseInclusiveBR,
} from './index';

describe('isOnOrBeforeBrDay (BR calendar-day cutoff)', () => {
    // dataBase pinned to the inclusive end of 30/04 BR (= 02:59:59.999Z of 01/05).
    const dataBase = parseDataBaseInclusiveBR('2026-04-30');

    it('string-date doc (00:00Z) and numeric-date doc (15:00Z) for 30/04 are BOTH true', () => {
        const stringDoc = new Date('2026-04-30T00:00:00.000Z');
        const numericDoc = new Date('2026-04-30T15:00:00.000Z'); // Conexos +15h shift
        expect(isOnOrBeforeBrDay(stringDoc, dataBase)).toBe(true);
        expect(isOnOrBeforeBrDay(numericDoc, dataBase)).toBe(true);
        // SAME result for both encodings.
        expect(isOnOrBeforeBrDay(stringDoc, dataBase)).toBe(
            isOnOrBeforeBrDay(numericDoc, dataBase),
        );
    });

    it('doc whose intended BR day is 01/05 (string 00:00Z AND numeric 15:00Z) is false for dataBase=30/04', () => {
        const stringDoc = new Date('2026-05-01T00:00:00.000Z');
        const numericDoc = new Date('2026-05-01T15:00:00.000Z');
        expect(isOnOrBeforeBrDay(stringDoc, dataBase)).toBe(false);
        expect(isOnOrBeforeBrDay(numericDoc, dataBase)).toBe(false);
    });

    it('legacy 02:59Z next-day false-positive is fixed: 01/05 00:00Z doc vs pinned dataBase returns false', () => {
        // The pinned dataBase is 02:59:59.999Z of 01/05. A naive getTime() compare
        // would (wrongly) accept a 01/05 00:00Z doc. The BR-day comparator must reject it.
        const doc0105 = new Date('2026-05-01T00:00:00.000Z');
        // Sanity: the naive compare WOULD have passed (proving the bug exists).
        expect(doc0105.getTime() <= dataBase.getTime()).toBe(true);
        // The BR-day comparator correctly rejects it.
        expect(isOnOrBeforeBrDay(doc0105, dataBase)).toBe(false);
    });

    it('a doc on the day before dataBase (29/04) is true', () => {
        expect(isOnOrBeforeBrDay(new Date('2026-04-29T15:00:00.000Z'), dataBase)).toBe(true);
    });

    it('brDayKey returns the intended UTC calendar day as YYYY-MM-DD', () => {
        expect(brDayKey(new Date('2026-04-30T00:00:00.000Z'))).toBe('2026-04-30');
        expect(brDayKey(new Date('2026-04-30T15:00:00.000Z'))).toBe('2026-04-30');
        expect(brDayKey(new Date('2026-05-01T00:00:00.000Z'))).toBe('2026-05-01');
    });

    it('dataBase BR day equals formatBrDate(dataBase)', () => {
        expect(formatBrDate(dataBase)).toBe('2026-04-30');
    });
});

describe('utils smoke', () => {
    it('DEBUG_VERBOSE is boolean', () => {
        expect(typeof DEBUG_VERBOSE).toBe('boolean');
    });

    it('boxLog does not throw', () => {
        expect(() => boxLog('test', { key: 'value' })).not.toThrow();
    });

    it('logEvent does not throw', () => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        expect(() => logEvent('test', { key: 'value' })).not.toThrow();
        jest.restoreAllMocks();
    });
});
