import BoundedConcurrency from './BoundedConcurrency.js';

describe('BoundedConcurrency', () => {
    it('never runs more than `limit` workers concurrently and returns all results in order', async () => {
        const helper = new BoundedConcurrency();
        let active = 0;
        let maxObserved = 0;

        const items = [1, 2, 3, 4, 5];
        const results = await helper.run(
            items,
            async (item) => {
                active += 1;
                maxObserved = Math.max(maxObserved, active);
                await new Promise((res) => setTimeout(res, 10));
                active -= 1;
                return item * 10;
            },
            2,
        );

        expect(maxObserved).toBeLessThanOrEqual(2);
        expect(results).toHaveLength(5);
        expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
            10, 20, 30, 40, 50,
        ]);
    });

    it('captures a worker rejection as a failure entry; other items still resolve', async () => {
        const helper = new BoundedConcurrency();
        const items = ['a', 'b', 'c'];

        const results = await helper.run(
            items,
            async (item) => {
                if (item === 'b') throw new Error('boom on b');
                return item.toUpperCase();
            },
            2,
        );

        expect(results[0]).toEqual({ status: 'fulfilled', value: 'A' });
        expect(results[1].status).toBe('rejected');
        if (results[1].status === 'rejected') {
            expect((results[1].reason as Error).message).toBe('boom on b');
        }
        expect(results[2]).toEqual({ status: 'fulfilled', value: 'C' });
    });

    it('preserves index mapping so a rejection maps back to its source item', async () => {
        const helper = new BoundedConcurrency();
        const items = [10, 20, 30, 40];

        const results = await helper.run(
            items,
            async (item, index) => {
                if (index === 2) throw new Error(`failed item ${item}`);
                return item;
            },
            3,
        );

        expect(results[2].status).toBe('rejected');
        if (results[2].status === 'rejected') {
            expect((results[2].reason as Error).message).toBe('failed item 30');
        }
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    });

    it('handles an empty input array without error', async () => {
        const helper = new BoundedConcurrency();
        const results = await helper.run([], async (item) => item, 2);
        expect(results).toEqual([]);
    });
});

describe('BoundedConcurrency.map', () => {
    it('returns plain values in input order even when completion order is inverted', async () => {
        const helper = new BoundedConcurrency();
        // Item 0 is the slowest, last item is the fastest — completion order
        // is the reverse of input order; output must still be indexed.
        const items = [0, 1, 2, 3, 4];
        const out = await helper.map(
            items,
            async (item) => {
                await new Promise((res) => setTimeout(res, (items.length - item) * 10));
                return item * 10;
            },
            5,
        );
        expect(out).toEqual([0, 10, 20, 30, 40]);
    });

    it('never runs more than `limit` workers concurrently', async () => {
        const helper = new BoundedConcurrency();
        let active = 0;
        let maxObserved = 0;

        const items = Array.from({ length: 9 }, (_, i) => i);
        await helper.map(
            items,
            async (item) => {
                active += 1;
                maxObserved = Math.max(maxObserved, active);
                await new Promise((res) => setTimeout(res, 5));
                active -= 1;
                return item;
            },
            3,
        );

        expect(maxObserved).toBeLessThanOrEqual(3);
        expect(maxObserved).toBeGreaterThan(1);
    });

    it('propagates the first rejection reason (does not settle, does not swallow)', async () => {
        const helper = new BoundedConcurrency();
        const boom = new Error('boom on index 2');
        await expect(
            helper.map(
                ['a', 'b', 'c', 'd'],
                async (_item, index) => {
                    if (index === 2) throw boom;
                    return index;
                },
                2,
            ),
        ).rejects.toBe(boom);
    });

    it('passes (item, index) to the worker', async () => {
        const helper = new BoundedConcurrency();
        const seen: Array<[string, number]> = [];
        await helper.map(
            ['x', 'y'],
            async (item, index) => {
                seen.push([item, index]);
                return item;
            },
            2,
        );
        expect(seen.sort((a, b) => a[1] - b[1])).toEqual([
            ['x', 0],
            ['y', 1],
        ]);
    });

    it('resolves [] for an empty input without invoking the worker', async () => {
        const helper = new BoundedConcurrency();
        const worker = jest.fn(async (item: number) => item);
        const out = await helper.map([], worker, 4);
        expect(out).toEqual([]);
        expect(worker).not.toHaveBeenCalled();
    });
});
