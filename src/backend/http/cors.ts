import type { CorsOptions } from 'cors';

const DEFAULT_ORIGIN = 'http://localhost:3000';

/**
 * Parses the `ALLOWED_ORIGINS` env var (comma-separated) into a whitelist.
 * Falls back to `http://localhost:3000` when unset/empty.
 */
export const parseAllowedOrigins = (raw?: string): string[] => {
    const list = (raw ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
    return list.length > 0 ? list : [DEFAULT_ORIGIN];
};

/**
 * Builds a CORS config that only reflects whitelisted origins, replacing the
 * previous `origin: true` (any origin) setting. Requests with no `Origin`
 * header (curl, server-to-server, health checks) are allowed; cross-origin
 * browser requests from non-whitelisted origins are rejected.
 *
 * Arch-review card security-3 / F-security-3.
 */
export const buildCorsOptions = (raw?: string): CorsOptions => {
    const allowed = parseAllowedOrigins(raw);
    return {
        origin: (origin, callback) => {
            if (!origin || allowed.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`Origin not allowed by CORS: ${origin}`));
        },
        credentials: true,
        // Expose correlation + download headers so the browser can read them:
        //   X-Request-Id     → frontend-observability ApiErrorBanner / log trail
        //   Content-Disposition → XLSX export filename
        exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    };
};
