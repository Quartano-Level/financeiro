import 'reflect-metadata';
import PermutaSnapshotRepository, {
    type PermutaEleicaoRunInput,
} from './PermutaSnapshotRepository.js';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import {
    ESTADO_ELEGIBILIDADE,
    MOTIVO_BLOQUEIO,
} from '../../interface/permutas/EstadoElegibilidade.js';
import type PermutaCandidata from '../../interface/permutas/PermutaCandidata.js';

/**
 * Captures the calls issued INSIDE `withTransaction(fn)` so the tests can assert
 * that persistRun runs exactly one transaction and batches the candidata INSERTs.
 */
const buildDb = () => {
    const txInsert = jest.fn().mockResolvedValue(1);
    const tx = {
        insert: txInsert,
        selectMany: jest.fn().mockResolvedValue([]),
        selectFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(0),
    };
    const withTransaction = jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
    return Object.assign(
        {
            insert: jest.fn().mockResolvedValue(1),
            selectMany: jest.fn().mockResolvedValue([]),
            selectFirst: jest.fn().mockResolvedValue(null),
            withTransaction,
        },
        { __tx: tx, __txInsert: txInsert, __withTransaction: withTransaction },
    ) as unknown as jest.Mocked<PostgreeDatabaseClient> & {
        __tx: typeof tx;
        __txInsert: jest.Mock;
        __withTransaction: jest.Mock;
    };
};

const baseRun = (over: Partial<PermutaEleicaoRunInput> = {}): PermutaEleicaoRunInput => ({
    flowId: 'flow-1',
    startedAt: new Date('2026-06-17T10:00:00Z'),
    finishedAt: new Date('2026-06-17T10:01:00Z'),
    status: 'success',
    triggeredBy: 'user-x',
    totalCandidatas: 1,
    totalElegiveis: 1,
    totalBloqueadas: 0,
    bloqueadasByMotivo: {},
    ...over,
});

const elegivelCandidata: PermutaCandidata = {
    priCod: '2048',
    adiantamento: {
        docCod: 'A1',
        priCod: '2048',
        filCod: 2,
        dataEmissao: new Date('2026-03-01'),
        valor: 1000,
        moeda: 'USD',
        pago: true,
        valorPermutar: 1000,
    },
    invoiceCasada: {
        docCod: 'I1',
        priCod: '2048',
        dataEmissao: new Date('2026-04-01'),
        valor: 1000,
        moeda: 'USD',
        pago: false,
    },
    estadoElegibilidade: ESTADO_ELEGIBILIDADE.ELEGIVEL,
    gatesAvaliados: [],
};

describe('PermutaSnapshotRepository', () => {
    it('persists run + snapshot inside ONE transaction (atomicity, success)', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);

        const runId = await repo.persistRun(baseRun(), [elegivelCandidata]);

        expect(typeof runId).toBe('string');
        // Whole persist is wrapped in a single transaction (BEGIN/COMMIT 0→1).
        expect(db.__withTransaction).toHaveBeenCalledTimes(1);
        // 1 run insert + 1 multi-row candidata insert = 2 round-trips for N=1.
        expect(db.__txInsert).toHaveBeenCalledTimes(2);
        // The pool-level insert is NEVER used (everything goes through the tx).
        expect(db.insert as jest.Mock).not.toHaveBeenCalled();

        const runSql = db.__txInsert.mock.calls[0][0] as string;
        expect(runSql).toContain('INSERT INTO permuta_eleicao_run');
        // Parameterized — named params only (Rule #5), no string interpolation.
        expect(runSql).toContain('$flowId');
        expect(runSql).not.toMatch(/'\s*\+|\$\{/);

        const candidataSql = db.__txInsert.mock.calls[1][0] as string;
        const candidataParams = db.__txInsert.mock.calls[1][1] as Record<string, unknown>;
        expect(candidataSql).toContain('INSERT INTO permuta_candidata_snapshot');
        // Multi-row insert is fully parameterized (no interpolation).
        expect(candidataSql).not.toMatch(/'\s*\+|\$\{/);
        expect(candidataParams.runId).toBe(runId);
        expect(candidataParams.status_0).toBe('elegivel');
        expect(candidataParams.invoiceDocCod_0).toBe('I1');
        expect(candidataParams.agingDays_0).toBeNull(); // ⏸ GATED-P0-4
    });

    it('round-trips for N=200 candidatas stay ≤ 2 (1 run + 1 batch ≤500)', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);
        const candidatas: PermutaCandidata[] = Array.from({ length: 200 }, (_, i) => ({
            ...elegivelCandidata,
            priCod: String(i),
            adiantamento: { ...elegivelCandidata.adiantamento, docCod: `A${i}`, priCod: String(i) },
        }));

        await repo.persistRun(baseRun({ totalCandidatas: 200, totalElegiveis: 200 }), candidatas);

        expect(db.__withTransaction).toHaveBeenCalledTimes(1);
        // 1 run header + 1 multi-row chunk (200 ≤ 500) = 2 inserts (was 201).
        expect(db.__txInsert).toHaveBeenCalledTimes(2);
    });

    it('chunks candidatas into multi-row inserts of 500', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);
        const candidatas: PermutaCandidata[] = Array.from({ length: 1100 }, (_, i) => ({
            ...elegivelCandidata,
            priCod: String(i),
            adiantamento: { ...elegivelCandidata.adiantamento, docCod: `A${i}`, priCod: String(i) },
        }));

        await repo.persistRun(baseRun({ totalCandidatas: 1100, totalElegiveis: 1100 }), candidatas);

        // 1 run header + 3 chunks (500 + 500 + 100) = 4 inserts.
        expect(db.__txInsert).toHaveBeenCalledTimes(4);
    });

    it('rolls back: when a chunk insert fails mid-transaction, persistRun rejects', async () => {
        const db = buildDb();
        // Run header ok, candidata batch throws → withTransaction rolls back.
        db.__txInsert.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('insert exploded'));

        const repo = new PermutaSnapshotRepository(db);
        await expect(repo.persistRun(baseRun(), [elegivelCandidata])).rejects.toThrow(
            'insert exploded',
        );
        // The transaction body threw — the real withTransaction would ROLLBACK,
        // so NOTHING is committed (header + candidatas all aborted together).
        expect(db.__withTransaction).toHaveBeenCalledTimes(1);
    });

    it('aborted run → status=error + error_message, ZERO snapshot rows', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);

        await repo.persistRun(
            baseRun({ status: 'error', errorMessage: 'boom', totalCandidatas: 0 }),
            [],
        );

        // Only the run header insert — no candidata rows.
        expect(db.__txInsert).toHaveBeenCalledTimes(1);
        const runParams = db.__txInsert.mock.calls[0][1] as Record<string, unknown>;
        expect(runParams.status).toBe('error');
        expect(runParams.errorMessage).toBe('boom');
    });

    it('persists blocked candidata with motivo, null invoice and fil_cod', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);
        const bloqueada: PermutaCandidata = {
            priCod: '3000',
            adiantamento: {
                ...elegivelCandidata.adiantamento,
                docCod: 'A2',
                priCod: '3000',
                filCod: 7,
            },
            estadoElegibilidade: ESTADO_ELEGIBILIDADE.BLOQUEADA,
            motivoBloqueio: MOTIVO_BLOQUEIO.SEM_INVOICE,
            gatesAvaliados: [],
        };

        await repo.persistRun(baseRun({ totalElegiveis: 0, totalBloqueadas: 1 }), [bloqueada]);

        const candidataParams = db.__txInsert.mock.calls[1][1] as Record<string, unknown>;
        expect(candidataParams.status_0).toBe('bloqueada');
        expect(candidataParams.motivoBloqueio_0).toBe(MOTIVO_BLOQUEIO.SEM_INVOICE);
        expect(candidataParams.invoiceDocCod_0).toBeNull();
        // P0-2 — fil_cod propagated end-to-end, NOT null.
        expect(candidataParams.filCod_0).toBe(7);
    });

    it('findRunIdByIdempotencyKey returns the run_id within TTL, null otherwise (P0-6)', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValueOnce({ run_id: 'run-7' });
        const repo = new PermutaSnapshotRepository(db);

        const found = await repo.findRunIdByIdempotencyKey('idem-key');
        expect(found).toBe('run-7');

        const sql = (db.selectFirst as jest.Mock).mock.calls[0][0] as string;
        // Parameterized + TTL window enforced in SQL.
        expect(sql).toContain('$key');
        expect(sql).toContain("INTERVAL '24 hours'");
        expect(sql).not.toMatch(/'\s*\+|\$\{/);

        (db.selectFirst as jest.Mock).mockResolvedValueOnce(null);
        expect(await repo.findRunIdByIdempotencyKey('absent')).toBeNull();
    });

    it('recordIdempotencyKey inserts the key→runId mapping (ON CONFLICT DO NOTHING)', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);

        await repo.recordIdempotencyKey('idem-key', 'run-9');

        const [sql, params] = (db.insert as jest.Mock).mock.calls[0];
        expect(sql).toContain('INSERT INTO permuta_eleicao_idempotency');
        expect(sql).toContain('ON CONFLICT (idempotency_key) DO NOTHING');
        expect(params).toMatchObject({ key: 'idem-key', runId: 'run-9' });
    });

    it('findLatestSnapshot returns null when no successful run exists', async () => {
        const db = buildDb();
        const repo = new PermutaSnapshotRepository(db);
        const result = await repo.findLatestSnapshot();
        expect(result).toBeNull();
    });

    it('findLatestSnapshot maps rows of the latest successful run', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({
            id: 'run-9',
            finished_at: '2026-06-17T10:01:00Z',
        });
        (db.selectMany as jest.Mock).mockResolvedValue([
            {
                run_id: 'run-9',
                doc_cod: 'A1',
                fil_cod: 2,
                pri_cod: '2048',
                status: 'elegivel',
                motivo_bloqueio: null,
                aging_days: null,
                invoice_doc_cod: 'I1',
                variacao_classificacao: 'JUROS',
                variacao_resultado: 200,
            },
        ]);
        const repo = new PermutaSnapshotRepository(db);

        const result = await repo.findLatestSnapshot();

        expect(result?.runId).toBe('run-9');
        expect(result?.rows[0]).toMatchObject({
            docCod: 'A1',
            status: 'elegivel',
            invoiceDocCod: 'I1',
            variacaoClassificacao: 'JUROS',
            variacaoResultado: 200,
        });
        expect(result?.rows[0].agingDays).toBeUndefined();
    });
});
