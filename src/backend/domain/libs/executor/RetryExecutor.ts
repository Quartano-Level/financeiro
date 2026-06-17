import Logger from '../logger/Logger.js';
import type IExecutor from './domain/IExecutor.js';

export default class RetryExecutor implements IExecutor {
    private retries: number;
    private delayMs: number;
    private shouldLog: boolean;
    private shouldRetry: (error: unknown) => boolean;
    private jitterMs: number;

    constructor({
        retries,
        delayMs,
        shouldLog,
        shouldRetry,
        jitterMs,
    }: {
        retries: number;
        delayMs: number;
        shouldLog: boolean;
        shouldRetry?: (error: unknown) => boolean;
        jitterMs?: number;
    }) {
        this.retries = retries;
        this.delayMs = delayMs;
        this.shouldLog = shouldLog;
        this.shouldRetry = shouldRetry ?? (() => true);
        this.jitterMs = jitterMs ?? 0;
    }

    public execute = async <T>(fn: () => Promise<T>): Promise<T> => {
        let executedSuccessfully = false;
        let counter = 1;

        let result: T | null = null;
        let lastExecutionRrror: any = null;

        while (!executedSuccessfully && counter <= this.retries) {
            try {
                result = await fn();
                executedSuccessfully = true;
            } catch (error) {
                lastExecutionRrror = error;

                if (!this.shouldRetry(error)) {
                    throw error;
                }

                if (this.shouldLog) {
                    Logger.error(`Attempt ${counter} of ${fn.name} failed:`, error);
                }

                const wait = this.delayMs + (this.jitterMs > 0 ? Math.random() * this.jitterMs : 0);
                if (wait > 0) {
                    await new Promise((res) => setTimeout(res, wait));
                }
            } finally {
                counter++;
            }
        }

        if (!executedSuccessfully) {
            if (this.shouldLog) {
                Logger.error(`All ${this.retries} of ${fn.name} attempts failed.`);
            }

            throw lastExecutionRrror;
        }

        return result as T;
    };
}
