import type { NextFunction, Request, Response } from 'express';
import { errorMiddleware } from './errorMiddleware.js';

const buildRes = (): Response & { _status?: number; _json?: unknown } => {
    const res = {} as Response & { _status?: number; _json?: unknown };
    res.headersSent = false;
    res.status = ((code: number) => {
        res._status = code;
        return res;
    }) as Response['status'];
    res.json = ((body: unknown) => {
        res._json = body;
        return res;
    }) as Response['json'];
    return res;
};

describe('errorMiddleware', () => {
    const req = { method: 'GET', originalUrl: '/processes' } as Request;
    const next: NextFunction = () => undefined;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        consoleError.mockRestore();
    });

    it('returns a generic HTTP 500 payload, never the raw error message', () => {
        const res = buildRes();
        errorMiddleware(new Error('Conexos imp021 internal failure'), req, res, next);
        expect(res._status).toBe(500);
        expect(res._json).toEqual({ error: 'Internal server error' });
    });

    it('does not leak the Conexos response body to the client', () => {
        const res = buildRes();
        const err = {
            message: 'Request failed',
            response: { status: 502, data: { secret: 'erp internals', stack: 'trace' } },
        };
        errorMiddleware(err, req, res, next);
        expect(res._json).toEqual({ error: 'Internal server error' });
        expect(JSON.stringify(res._json)).not.toMatch(/secret|erp internals|trace/);
    });

    it('logs the full detail server-side', () => {
        const res = buildRes();
        const err = {
            message: 'boom',
            response: { status: 500, data: { detail: 'internal' } },
        };
        errorMiddleware(err, req, res, next);
        expect(consoleError).toHaveBeenCalled();
        const logged = consoleError.mock.calls.flat().join(' ');
        expect(logged).toMatch(/boom/);
        expect(logged).toMatch(/internal/);
    });

    it('does not write a body when headers were already sent', () => {
        const res = buildRes();
        res.headersSent = true;
        errorMiddleware(new Error('late failure'), req, res, next);
        expect(res._status).toBeUndefined();
        expect(res._json).toBeUndefined();
    });
});
