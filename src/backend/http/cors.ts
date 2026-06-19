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
/**
 * Casa uma origin contra uma entrada da whitelist. Entradas com `*` viram
 * match por SUFIXO (ex.: `https://*.vercel.app` casa `https://app.vercel.app` e
 * `https://app-abc123.vercel.app`) — necessário porque a Vercel gera uma URL
 * nova por deploy. Sem `*`, é match exato.
 */
const originMatches = (origin: string, entry: string): boolean => {
    if (entry.includes('*')) {
        const suffix = entry.slice(entry.indexOf('*') + 1);
        return origin.endsWith(suffix);
    }
    return origin === entry;
};

export const buildCorsOptions = (raw?: string): CorsOptions => {
    const allowed = parseAllowedOrigins(raw);
    return {
        origin: (origin, callback) => {
            if (!origin || allowed.some((entry) => originMatches(origin, entry))) {
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
