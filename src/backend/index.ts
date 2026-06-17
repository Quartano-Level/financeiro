import 'reflect-metadata';
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { buildAuthMiddleware } from './http/auth.js';
import { loadAuthEnv } from './http/authEnv.js';
import { buildCorsOptions } from './http/cors.js';
import { errorMiddleware } from './http/errorMiddleware.js';
import { globalLimiter, heavyRouteLimiter } from './http/rateLimit.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import conexosRouter from './routes/conexos.js';

const app = express();

// CORS — whitelist driven by ALLOWED_ORIGINS (comma-separated env var).
// Replaces the previous `origin: true` which accepted any origin
// (arch-review card security-3 / F-security-3). `exposedHeaders`
// (X-Request-Id, Content-Disposition) live in `buildCorsOptions`.
app.use(cors(buildCorsOptions(process.env.ALLOWED_ORIGINS)));
app.use(express.json());

// Global rate limiter (arch-review card security-6 / F-security-9).
app.use(globalLimiter);

// ── X-Request-Id (correlation) ────────────────────────────────────────────────
// Always attach a requestId to req / res. Echoed back on every response so the
// client (or a user reporting a bug) can grep backend logs for the trail.
app.use(requestIdMiddleware);

// ── Request/Response Logger ──────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const { method, url, query, body, requestId } = req;
    console.log(
        `[REQ] ${requestId} ${method} ${url}${Object.keys(query).length ? ` query=${JSON.stringify(query)}` : ''}`,
    );
    if (body && Object.keys(body).length)
        console.log(`[REQ] ${requestId} body=${JSON.stringify(body)}`);

    const origJson = res.json.bind(res);
    res.json = (data: any) => {
        const ms = Date.now() - start;
        console.log(`[RES] ${requestId} ${method} ${url} → ${res.statusCode} (${ms}ms)`);
        if (res.statusCode >= 400) console.log(`[RES] ${requestId} body=${JSON.stringify(data)}`);
        return origJson(data);
    };

    next();
});
// ────────────────────────────────────────────────────────────────────────────

// Bare health probe stays public — no auth, no rate-limit dependency.
// `version` mirrors package.json (FE+BE lockstep, see CHANGELOG.md) so prod
// deploys are verifiable; `npm start`/`npm run dev` populate npm_package_version.
const APP_VERSION = process.env.npm_package_version ?? 'unknown';
app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));

// Supabase JWT validation — applied after CORS/rate-limit, before every API
// route. Unauthenticated requests are rejected with HTTP 401. Validated env
// (Zod) at boundary; `DEV_AUTH_BYPASS=true` skips it for local development.
// Arch-review cards security-1 (Microsoft/Azure AD auth) / security-7.
app.use(buildAuthMiddleware(loadAuthEnv()));

// Stricter limiter on the Conexos-backed routes — their fan-out to the
// Conexos ERP can exhaust its session pool (security-6 / F-security-9).
// Domain feature routers (financeiro) mount here and inherit the limiter.
app.use('/conexos', heavyRouteLimiter);

// Example route proving the Conexos ERP integration is live in the skeleton.
app.use('/conexos', conexosRouter);

// Central error-handling middleware — logs full detail server-side, returns
// a generic payload to the client (arch-review cards security-3 /
// F-security-5 and fault-tolerance-3 / F-fault-tolerance-3).
app.use(errorMiddleware);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Financeiro backend on port ${PORT}`);
});
