import 'reflect-metadata';
import PainelService from './PainelService.js';
import type PermutaSnapshotRepository from '../../repository/permutas/PermutaSnapshotRepository.js';
import type { PermutaCandidataSnapshotRow } from '../../repository/permutas/PermutaSnapshotRepository.js';
import type LogService from '../LogService.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';

const buildLog = () => {
    const calls: Array<{ type: string; message: string }> = [];
    const capture = jest.fn(async (p: { type: string; message: string }) => {
        calls.push(p);
    });
    return {
        logService: {
            info: capture,
            warn: capture,
            error: capture,
            success: capture,
        } as unknown as LogService,
        calls,
    };
};

const row = (over: Partial<PermutaCandidataSnapshotRow>): PermutaCandidataSnapshotRow => ({
    runId: 'run-1',
    docCod: 'A1',
    priCod: '2048',
    status: 'elegivel',
    ...over,
});

describe('PainelService.exporNoPainel', () => {
    it('returns empty payload + BUSINESS_WARN when no snapshot exists', async () => {
        const repo = {
            findLatestSnapshot: jest.fn().mockResolvedValue(null),
        } as unknown as PermutaSnapshotRepository;
        const { logService, calls } = buildLog();
        const service = new PainelService(repo, logService);

        const result = await service.exporNoPainel('req-1');

        expect(result.items).toEqual([]);
        expect(result.totalElegiveis).toBe(0);
        expect(calls.some((c) => c.type === LOG_TYPE.BUSINESS_WARN)).toBe(true);
    });

    it('exposes elegiveis AND bloqueadas (with motivo), sorted by aging (oldest first)', async () => {
        const repo = {
            findLatestSnapshot: jest.fn().mockResolvedValue({
                runId: 'run-1',
                finishedAt: new Date('2026-06-17T10:00:00Z'),
                rows: [
                    row({ docCod: 'A1', agingDays: 5 }),
                    row({ docCod: 'A2', agingDays: 30 }),
                    row({
                        docCod: 'A3',
                        status: 'bloqueada',
                        motivoBloqueio: 'sem-invoice',
                    }),
                ],
            }),
        } as unknown as PermutaSnapshotRepository;
        const { logService, calls } = buildLog();
        const service = new PainelService(repo, logService);

        const result = await service.exporNoPainel('req-2');

        expect(result.totalElegiveis).toBe(2);
        expect(result.totalBloqueadas).toBe(1);
        // oldest aging first; the null-aging blocked item goes to the stable tail.
        expect(result.items.map((i) => i.docCod)).toEqual(['A2', 'A1', 'A3']);
        expect(result.items[2].motivoBloqueio).toBe('sem-invoice');
        // ⏸ GATED-P0-4: missing aging surfaces as null (pendente), item still listed.
        expect(result.items[2].aging).toBeNull();
        expect(calls.some((c) => c.type === LOG_TYPE.BUSINESS_INFO)).toBe(true);
    });
});
