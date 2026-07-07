import 'reflect-metadata';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import PagamentoIngestaoRunRepository from './PagamentoIngestaoRunRepository.js';

const buildDb = () =>
    ({
        insert: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(1),
        selectMany: jest.fn().mockResolvedValue([]),
        selectFirst: jest.fn().mockResolvedValue(null),
    }) as unknown as PostgreeDatabaseClient;

describe('PagamentoIngestaoRunRepository', () => {
    it('createRun insere status running e devolve um id', async () => {
        const db = buildDb();
        const id = await new PagamentoIngestaoRunRepository(db).createRun({ triggeredBy: 'cron' });
        expect(typeof id).toBe('string');
        const [sql, params] = (db.insert as jest.Mock).mock.calls[0];
        expect(sql).toContain("'running'");
        expect(params).toMatchObject({ triggeredBy: 'cron' });
    });

    it('finishRun atualiza status/contagens/finished_at', async () => {
        const db = buildDb();
        await new PagamentoIngestaoRunRepository(db).finishRun({
            runId: 'RUN1',
            status: 'success',
            totalTitulos: 10,
            totalInativados: 2,
        });
        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain('finished_at = now()');
        expect(params).toMatchObject({ status: 'success', totalTitulos: 10, totalInativados: 2 });
    });

    it('listRecentRuns mapeia as runs', async () => {
        const db = buildDb();
        (db.selectMany as jest.Mock).mockResolvedValue([
            {
                id: 'RUN1',
                triggered_by: 'admin',
                status: 'success',
                total_titulos: 5,
                total_inativados: 1,
                error_message: null,
                started_at: new Date('2026-07-08T06:00:00Z'),
                finished_at: new Date('2026-07-08T06:00:05Z'),
            },
        ]);
        const runs = await new PagamentoIngestaoRunRepository(db).listRecentRuns(10);
        expect(runs[0]).toMatchObject({ id: 'RUN1', triggeredBy: 'admin', totalTitulos: 5 });
        expect(runs[0].finishedAt).toBe('2026-07-08T06:00:05.000Z');
    });

    it('findLatestSuccessFinishedAt devolve Date ou null', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValueOnce({
            finished_at: new Date('2026-07-08T06:00:00Z'),
        });
        expect(
            await new PagamentoIngestaoRunRepository(db).findLatestSuccessFinishedAt(),
        ).toBeInstanceOf(Date);
        (db.selectFirst as jest.Mock).mockResolvedValueOnce(null);
        expect(
            await new PagamentoIngestaoRunRepository(db).findLatestSuccessFinishedAt(),
        ).toBeNull();
    });

    it('idempotência: find + record', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValueOnce({ run_id: 'RUN9' });
        expect(await new PagamentoIngestaoRunRepository(db).findRunIdByIdempotencyKey('k')).toBe(
            'RUN9',
        );
        await new PagamentoIngestaoRunRepository(db).recordIdempotencyKey('k', 'RUN1');
        const [sql] = (db.insert as jest.Mock).mock.calls[0];
        expect(sql).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
    });
});
