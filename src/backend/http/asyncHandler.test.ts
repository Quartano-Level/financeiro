import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from './asyncHandler.js';

describe('asyncHandler', () => {
    const req = {} as Request;
    const res = {} as Response;

    it('forwards a rejected promise to next(error)', async () => {
        const boom = new Error('async failure');
        let received: unknown;
        const next: NextFunction = (err) => {
            received = err;
        };
        const wrapped = asyncHandler(async () => {
            throw boom;
        });
        wrapped(req, res, next);
        await new Promise((r) => setImmediate(r));
        expect(received).toBe(boom);
    });

    it('does not call next when the handler resolves', async () => {
        let nextCalled = false;
        const next: NextFunction = () => {
            nextCalled = true;
        };
        const wrapped = asyncHandler(async () => undefined);
        wrapped(req, res, next);
        await new Promise((r) => setImmediate(r));
        expect(nextCalled).toBe(false);
    });
});
