import RetryExecutor from './RetryExecutor.js';

describe('RetryExecutor', () => {
    it('retries until success within the attempt budget', async () => {
        const executor = new RetryExecutor({ retries: 3, delayMs: 0, shouldLog: false });
        let calls = 0;
        const fn = jest.fn(async () => {
            calls += 1;
            if (calls < 2) throw new Error('transient');
            return 'ok';
        });

        const result = await executor.execute(fn);

        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries always when shouldRetry is not provided', async () => {
        const executor = new RetryExecutor({ retries: 3, delayMs: 0, shouldLog: false });
        const fn = jest.fn(async () => {
            throw new Error('any error');
        });

        await expect(executor.execute(fn)).rejects.toThrow('any error');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry when shouldRetry returns false', async () => {
        const shouldRetry = jest.fn(() => false);
        const executor = new RetryExecutor({
            retries: 5,
            delayMs: 0,
            shouldLog: false,
            shouldRetry,
        });
        const fn = jest.fn(async () => {
            throw new Error('permanent');
        });

        await expect(executor.execute(fn)).rejects.toThrow('permanent');
        expect(fn).toHaveBeenCalledTimes(1);
        expect(shouldRetry).toHaveBeenCalledTimes(1);
    });

    it('retries only while shouldRetry returns true', async () => {
        const executor = new RetryExecutor({
            retries: 5,
            delayMs: 0,
            shouldLog: false,
            shouldRetry: (error) => (error as Error).message === 'retryable',
        });
        let calls = 0;
        const fn = jest.fn(async () => {
            calls += 1;
            if (calls < 3) throw new Error('retryable');
            throw new Error('permanent');
        });

        await expect(executor.execute(fn)).rejects.toThrow('permanent');
        expect(fn).toHaveBeenCalledTimes(3);
    });
});
