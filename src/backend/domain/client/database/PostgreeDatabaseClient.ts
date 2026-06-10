import { Pool } from 'pg';
import { inject, injectable, singleton } from 'tsyringe';
import type IClient from '../../core/client/IClient.js';
import EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import RetryExecutor from '../../libs/executor/RetryExecutor.js';
import SqlBuilder from '../../libs/sql/SqlBuilder.js';

@singleton()
@injectable()
export default class PostgreeDatabaseClient implements IClient {
    private readonly poolMaxConnections = 1;
    private readonly poolIdleTimeoutMillis = 10000;
    private readonly poolConnectionTimeoutMillis = 5000;
    private readonly sqlBuilder = new SqlBuilder();
    private readonly transientErrorPatterns = [
        'MaxClientsInSessionMode',
        'Connection terminated',
        'too many clients',
        'ECONNRESET',
    ];
    private readonly queryRetryExecutor = new RetryExecutor({
        retries: 3,
        delayMs: 200,
        jitterMs: 200,
        shouldLog: true,
        shouldRetry: (error) => this.isTransientConnectionError(error),
    });

    private connectionPool?: Pool;

    constructor(
        @inject(EnvironmentProvider)
        private environmentProvider: EnvironmentProvider,
    ) {}

    public init = async (): Promise<void> => {
        if (this.connectionPool) return;

        const retryExecutor = new RetryExecutor({
            retries: 5,
            delayMs: 2000,
            shouldLog: true,
        });

        await retryExecutor.execute(async () => {
            const envVars = await this.environmentProvider.getEnvironmentVars();
            this.connectionPool = new Pool({
                connectionString: envVars.databaseConnectionString,
                idleTimeoutMillis: this.poolIdleTimeoutMillis,
                connectionTimeoutMillis: this.poolConnectionTimeoutMillis,
                max: this.poolMaxConnections,
            });

            this.connectionPool.on('error', (_err) => {
                this.connectionPool = undefined;
            });
        });
    };

    public selectMany = async (query: string, params?: Record<string, unknown>): Promise<any[]> => {
        return (await this.query(query, params)).rows;
    };

    public selectFirst = async <T>(
        query: string,
        params?: Record<string, unknown>,
    ): Promise<T | null> => {
        const rows = await this.selectMany(query, params);
        return (rows[0] as T) ?? null;
    };

    public update = async (query: string, params?: Record<string, unknown>): Promise<number> => {
        return (await this.query(query, params)).rowCount ?? 0;
    };

    public insert = async (query: string, params?: Record<string, unknown>): Promise<number> => {
        return (await this.query(query, params)).rowCount ?? 0;
    };

    /**
     * Executes a parameterized query against the pool.
     *
     * IMPORTANT (transaction-mode pooler compatibility): never call
     * `pool.query({ name: '...', text, values })`. Named prepared statements are
     * session-scoped, but Supavisor transaction mode may route each transaction
     * to a different Postgres session, which would throw
     * `prepared statement "X" does not exist`. Always pass query as a string
     * (optionally via SqlBuilder for named params like `$name`).
     */
    private query = async (rawQuery: string, rawParams?: Record<string, unknown>): Promise<any> => {
        await this.init();
        if (!this.connectionPool) throw new Error('Database connection pool not initialized');

        const pool = this.connectionPool;
        const { query, params } = rawParams
            ? this.sqlBuilder.build(rawQuery, rawParams)
            : { query: rawQuery, params: undefined };

        return this.queryRetryExecutor.execute(async () => {
            if (params) {
                return pool.query(query, params as any[]);
            }
            return pool.query(query);
        });
    };

    private isTransientConnectionError = (error: unknown): boolean => {
        const message = error instanceof Error ? error.message : String(error);
        return this.transientErrorPatterns.some((pattern) => message.includes(pattern));
    };
}
