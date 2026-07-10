import 'reflect-metadata';
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { buildAuthMiddleware } from './http/auth.js';
import { loadAuthEnv } from './http/authEnv.js';
import { conexosIdentityMiddleware } from './http/conexosIdentity.js';
import { buildCorsOptions } from './http/cors.js';
import { errorMiddleware } from './http/errorMiddleware.js';
import { globalLimiter, heavyRouteLimiter } from './http/rateLimit.js';
import { redactBody } from './http/redact.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import authRouter from './routes/auth.js';
import conexosRouter from './routes/conexos.js';
import permutasRouter from './routes/permutas.js';
import meRouter from './routes/me.js';
import sispagRouter from './routes/sispag.js';
import usuariosRouter from './routes/usuarios.js';

const app = express();

// Atrás do proxy do Render/Vercel/etc. — confia no 1º hop para que o
// `X-Forwarded-For` (IP real do cliente) seja usado pelo rate-limit e logs em
// vez do IP do load balancer (corrige ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set('trust proxy', 1);

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
        console.log(`[REQ] ${requestId} body=${JSON.stringify(redactBody(body))}`);

    const origJson = res.json.bind(res);
    res.json = (data: any) => {
        const ms = Date.now() - start;
        console.log(`[RES] ${requestId} ${method} ${url} → ${res.statusCode} (${ms}ms)`);
        if (res.statusCode >= 400)
            console.log(`[RES] ${requestId} body=${JSON.stringify(redactBody(data))}`);
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

// Login route — PUBLIC, mounted BEFORE the auth middleware so unauthenticated
// users can obtain a token. `POST /auth/login` validates username/password
// against `app_user` and returns a self-signed HS256 JWT.
app.use('/auth', authRouter);

// JWT validation — applied after CORS/rate-limit, before every API route below.
// Unauthenticated requests are rejected with HTTP 401. Validated env (Zod) at
// boundary; `DEV_AUTH_BYPASS=true` skips it for local development. Tokens are
// the app's own HS256 JWTs (signed by AuthService with AUTH_JWT_SECRET).
// Arch-review cards security-1 / security-7.
app.use(buildAuthMiddleware(loadAuthEnv()));

// Identidade Conexos (Fatia B): coloca o usuário logado no contexto da request
// (AsyncLocalStorage) para que as chamadas ao ERP usem a sessão dele (a baixa sai
// no nome do usuário); sem vínculo válido, cai no robô. Depois do auth, antes das rotas.
app.use(conexosIdentityMiddleware);

// Stricter limiter on the Conexos-backed routes — their fan-out to the
// Conexos ERP can exhaust its session pool (security-6 / F-security-9).
// Domain feature routers (financeiro) mount here and inherit the limiter.
app.use('/conexos', heavyRouteLimiter);

// Example route proving the Conexos ERP integration is live in the skeleton.
app.use('/conexos', conexosRouter);

// Permutas Frente I. O `heavyRouteLimiter` (10/min) NÃO cobre o router inteiro —
// só as rotas de fan-out pesado (`POST /eleicao` e `/ingestao`) o aplicam por-rota
// (ver routes/permutas.ts). As LEITURAS (gestao/painel/cliente-filtro/importadores)
// ficam no `globalLimiter` (100/min) — antes o limiter estrito cobria tudo e o
// fluxo de cliente-filtro (load + ingestão) estourava 429 (card cc-auto-ingest-coalesce).
app.use('/permutas', permutasRouter);

// SISPAG Frente II — SPIKE READ-ONLY (semente da Fatia 1). Só leituras (painel
// de pagamentos); nenhuma escrita/execução. Fica no `globalLimiter` como as
// leituras de Permutas. Ver ontology/_inbox/sispag-*.md.
app.use('/sispag', sispagRouter);

// Gestão de usuários da plataforma — só `admin` (guard no próprio router). Fica
// no `globalLimiter`; substitui o cadastro manual de usuários @kavex no banco.
app.use('/usuarios', usuariosRouter);

// Rotas do próprio usuário (status do vínculo Conexos p/ o aviso no login).
app.use('/me', meRouter);

// Central error-handling middleware — logs full detail server-side, returns
// a generic payload to the client (arch-review cards security-3 /
// F-security-5 and fault-tolerance-3 / F-fault-tolerance-3).
app.use(errorMiddleware);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Financeiro backend on port ${PORT}`);
});
