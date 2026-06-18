import 'reflect-metadata';
import AgingService from './AgingService.js';

describe('AgingService.compute (P0-8: aging = hoje − dataBase)', () => {
    const service = new AgingService();

    it('computes whole-day aging from a past dataBase', () => {
        const now = new Date('2026-06-17T12:00:00.000Z');
        const dataBase = new Date('2026-06-07T12:00:00.000Z');
        expect(service.compute(dataBase, now)).toBe(10);
    });

    it('returns 0 for same-day dataBase', () => {
        const now = new Date('2026-06-17T18:00:00.000Z');
        const dataBase = new Date('2026-06-17T06:00:00.000Z');
        expect(service.compute(dataBase, now)).toBe(0);
    });

    it('⏸ GATED-P0-4: undefined dataBase → undefined aging, NO throw', () => {
        expect(() => service.compute(undefined)).not.toThrow();
        expect(service.compute(undefined)).toBeUndefined();
    });
});
