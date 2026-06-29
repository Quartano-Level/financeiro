import { ConexosSessionStore, type SessionStoreDb } from './conexosSessionStore.js';

const makeDb = (
    impl: (
        sql: string,
        params?: unknown[],
    ) => { rows: Array<Record<string, unknown>>; rowCount: number | null },
): { db: SessionStoreDb; calls: Array<{ sql: string; params?: unknown[] }> } => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const db: SessionStoreDb = {
        query: async (sql, params) => {
            calls.push({ sql, params });
            return impl(sql, params);
        },
    };
    return { db, calls };
};

const ROW = {
    sid: 'SID-123',
    usn_cod: '31',
    expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    version: 4,
    login_payload: { filiais: [], filCodDefault: 2 },
};

describe('ConexosSessionStore', () => {
    describe('disabled (no db)', () => {
        const store = new ConexosSessionStore({ db: null });
        it('reports disabled and never touches the DB', async () => {
            expect(store.enabled).toBe(false);
            expect(await store.acquire()).toBeNull();
            expect(await store.persist({ sid: 's', usnCod: '1', expiresAt: Date.now() })).toEqual({
                outcome: 'disabled',
            });
            await expect(store.invalidate('s')).resolves.toBeUndefined();
        });
    });

    describe('acquire', () => {
        it('maps a row to a record', async () => {
            const { db } = makeDb(() => ({ rows: [ROW], rowCount: 1 }));
            const store = new ConexosSessionStore({ db });
            const rec = await store.acquire();
            expect(rec).toMatchObject({ sid: 'SID-123', usnCod: '31', version: 4 });
            expect(rec?.expiresAt).toBeGreaterThan(Date.now());
        });

        it('returns null on miss', async () => {
            const { db } = makeDb(() => ({ rows: [], rowCount: 0 }));
            expect(await new ConexosSessionStore({ db }).acquire()).toBeNull();
        });

        it('degrades to null on DB error (never throws)', async () => {
            const db: SessionStoreDb = {
                query: async () => {
                    throw new Error('connection terminated');
                },
            };
            expect(await new ConexosSessionStore({ db }).acquire()).toBeNull();
        });
    });

    describe('persist — insert path (expectedVersion null)', () => {
        it('won when the INSERT returns a version', async () => {
            const { db, calls } = makeDb((sql) =>
                sql.includes('INSERT')
                    ? { rows: [{ version: 1 }], rowCount: 1 }
                    : { rows: [], rowCount: 0 },
            );
            const store = new ConexosSessionStore({ db });
            const res = await store.persist({ sid: 's', usnCod: '1', expiresAt: Date.now() + 1e6 });
            expect(res).toEqual({ outcome: 'won', version: 1 });
            expect(calls[0].sql).toContain('INSERT');
        });

        it('lost when INSERT conflicts (no row) and re-acquires the winner', async () => {
            const { db } = makeDb(
                (sql) =>
                    sql.includes('INSERT')
                        ? { rows: [], rowCount: 0 } // ON CONFLICT DO NOTHING → no row
                        : { rows: [ROW], rowCount: 1 }, // re-acquire
            );
            const res = await new ConexosSessionStore({ db }).persist({
                sid: 's',
                usnCod: '1',
                expiresAt: Date.now() + 1e6,
            });
            expect(res.outcome).toBe('lost');
            if (res.outcome === 'lost') expect(res.current?.sid).toBe('SID-123');
        });
    });

    describe('persist — update path (optimistic CAS)', () => {
        it('won when the UPDATE affects the row (version matched)', async () => {
            const { db, calls } = makeDb(() => ({ rows: [], rowCount: 1 }));
            const res = await new ConexosSessionStore({ db }).persist({
                sid: 's',
                usnCod: '1',
                expiresAt: Date.now() + 1e6,
                expectedVersion: 4,
            });
            expect(res).toEqual({ outcome: 'won', version: 5 });
            expect(calls[0].sql).toContain('UPDATE');
        });

        it('lost when the UPDATE matches 0 rows (someone rotated the sid)', async () => {
            const { db } = makeDb((sql) =>
                sql.includes('UPDATE') ? { rows: [], rowCount: 0 } : { rows: [ROW], rowCount: 1 },
            );
            const res = await new ConexosSessionStore({ db }).persist({
                sid: 's',
                usnCod: '1',
                expiresAt: Date.now() + 1e6,
                expectedVersion: 4,
            });
            expect(res.outcome).toBe('lost');
            if (res.outcome === 'lost') expect(res.current?.sid).toBe('SID-123');
        });
    });

    describe('invalidate', () => {
        it('deletes conditionally by key + dead sid', async () => {
            const { db, calls } = makeDb(() => ({ rows: [], rowCount: 1 }));
            await new ConexosSessionStore({ db }).invalidate('DEAD');
            expect(calls[0].sql).toContain('DELETE');
            expect(calls[0].params).toEqual(['columbia-default', 'DEAD']);
        });
    });
});
