import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async Express route handler so that any rejected promise is
 * forwarded to `next(error)` instead of producing an unhandled rejection
 * that can crash the Node process. Pairs with the central error middleware
 * in `index.ts` (arch-review card fault-tolerance-3 / F-fault-tolerance-3).
 */
export const asyncHandler =
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
