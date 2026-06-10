import type { NextFunction, Request, Response } from 'express';

/**
 * Central Express error-handling middleware. Logs the full error detail
 * server-side (including any Conexos response status/body) and returns a
 * generic, non-leaking payload to the client.
 *
 * Arch-review cards security-3 (F-security-5: HTTP 500 leaked `err.message`
 * and the raw Conexos response body) and fault-tolerance-3
 * (F-fault-tolerance-3: unhandled async errors must reach a central handler).
 */
export const errorMiddleware = (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
): void => {
    const error = err as { message?: string; response?: { status?: number; data?: unknown } };
    const conexosStatus = error?.response?.status;
    const conexosBody = error?.response?.data;

    console.error(
        `[error] ${req.method} ${req.originalUrl} →`,
        error?.message ?? String(err),
        conexosStatus ? `(Conexos HTTP ${conexosStatus})` : '',
    );
    if (conexosBody !== undefined) {
        console.error('[error] Conexos body:', JSON.stringify(conexosBody));
    }

    if (res.headersSent) {
        return;
    }

    res.status(500).json({ error: 'Internal server error' });
};
