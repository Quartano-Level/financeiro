import 'reflect-metadata';

const poolQuery = jest.fn();

jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({
        query: (...args: unknown[]) => poolQuery(...args),
        on: jest.fn(),
    })),
}));

import PostgreeDatabaseClient from './PostgreeDatabaseClient.js';

describe('PostgreeDatabaseClient', () => {
    const environmentProvider = {
        getEnvironmentVars: jest.fn().mockResolvedValue({
            databaseConnectionString: 'postgresql://user:pass@host:6543/postgres?pgbouncer=true',
        }),
    };

    beforeEach(() => {
        poolQuery.mockReset();
        environmentProvider.getEnvironmentVars.mockClear();
    });

    it('retries query on transient MaxClientsInSessionMode error', async () => {
        poolQuery
            .mockRejectedValueOnce(new Error('MaxClientsInSessionMode exceeded'))
            .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        const rows = await client.selectMany('SELECT 1');

        expect(rows).toEqual([{ id: 1 }]);
        expect(poolQuery).toHaveBeenCalledTimes(2);
    });

    it('retries query on Connection terminated error', async () => {
        poolQuery
            .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
            .mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        const rows = await client.selectMany('SELECT 1');

        expect(rows).toEqual([]);
        expect(poolQuery).toHaveBeenCalledTimes(2);
    });

    it('does not retry on non-transient errors', async () => {
        poolQuery.mockRejectedValue(new Error('syntax error at or near "FROM"'));

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        await expect(client.selectMany('SELECT broken')).rejects.toThrow('syntax error');
        expect(poolQuery).toHaveBeenCalledTimes(1);
    });

    it('gives up after exhausting retries on persistent transient error', async () => {
        poolQuery.mockRejectedValue(new Error('too many clients already'));

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        await expect(client.selectMany('SELECT 1')).rejects.toThrow('too many clients');
        expect(poolQuery).toHaveBeenCalledTimes(3);
    });

    it('selectFirst returns first row or null', async () => {
        poolQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        const row = await client.selectFirst<{ id: number }>('SELECT 1');

        expect(row).toEqual({ id: 1 });
    });

    it('selectFirst returns null when no rows', async () => {
        poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        const row = await client.selectFirst<{ id: number }>('SELECT 1');

        expect(row).toBeNull();
    });

    it('insert returns rowCount', async () => {
        poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        const count = await client.insert('INSERT INTO t VALUES (1), (2), (3)');

        expect(count).toBe(3);
    });

    it('update returns rowCount', async () => {
        poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

        const client = new PostgreeDatabaseClient(environmentProvider as any);
        const count = await client.update('UPDATE t SET x = $1 WHERE y = $2', {
            x: 'new',
            y: 'old',
        });

        expect(count).toBe(5);
    });
});
