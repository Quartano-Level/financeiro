import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
    interface Request {
        /**
         * Per-request correlation ID. Read from `X-Request-Id` header if the
         * client supplied one, otherwise server-generated. Echoed back via
         * `X-Request-Id` response header. Always present on `req` after this
         * middleware runs.
         */
        requestId: string;
    }
}

/**
 * Express middleware that ensures every request has a correlation ID:
 *   1. If the client sent `X-Request-Id`, honor it (allows chaining across
 *      services / log aggregators).
 *   2. Otherwise generate a UUID.
 *   3. Stash on `req.requestId` and set on the response header so the client
 *      can quote it in a support ticket.
 *
 * Powered by the frontend-observability feature. Ontology refs:
 *   - ontology/integrations/api-error-contract.md (invariant I2)
 *   - ontology/ui-flows/frontend-observability.md
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const supplied = req.header('X-Request-Id');
    const requestId =
        typeof supplied === 'string' && supplied.trim().length > 0 ? supplied.trim() : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
};
