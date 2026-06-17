import axios, { type AxiosInstance } from 'axios';
import { boxLog, DEBUG_VERBOSE } from '../utils/index.js';
import { config } from '../config.js';
import MissingFilCodError from '../domain/errors/MissingFilCodError.js';

export interface Filial {
    filCod: number;
    filDesNome: string;
    filDocFederalFmt: string;
    ufEspSigla?: string;
    filVldStatus?: number;
}

/** Keys whose values must never reach the logs in plain text. */
const SENSITIVE_KEYS = [
    'password',
    'senha',
    'pwd',
    'secret',
    'token',
    'authorization',
    'sid',
    'username',
    'usuario',
];

const REDACTED = '<REDACTED>';

const isSensitiveKey = (key: string): boolean => SENSITIVE_KEYS.includes(key.toLowerCase());

/**
 * Returns a log-safe copy of an HTTP request body with the values of any
 * sensitive keys (`password`, `username`, `token`, …) replaced by
 * `'<REDACTED>'`. Accepts either an object or a JSON string; non-JSON
 * strings and non-sensitive payloads are returned unchanged.
 *
 * arch-review card `security-2` / finding `F-security-4`: the Conexos
 * `/login` request body carries the production ERP password — it must
 * never be logged in clear text.
 */
export const redactSensitive = (body: unknown): string => {
    const redactValue = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(redactValue);
        if (value !== null && typeof value === 'object') {
            const out: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(value)) {
                out[key] = isSensitiveKey(key) ? REDACTED : redactValue(val);
            }
            return out;
        }
        return value;
    };

    if (typeof body === 'string') {
        try {
            return JSON.stringify(redactValue(JSON.parse(body)));
        } catch {
            // Not JSON — return as-is; nothing structured to redact.
            return body;
        }
    }
    return JSON.stringify(redactValue(body));
};

class ConexosService {
    private sid: string | null = null;
    private sidExpiresAt: number | null = null;
    private client: AxiosInstance;
    private filiais: Filial[] = [];
    private filCodDefault: number | null = null;
    /** `usnCod` captured from `/login` response — single source of truth for `cnx-usncod`. */
    private usnCod: string | null = null;
    /** Mutex de login: evita logins paralelos em requests concorrentes
     * (sem ele, 2+ chamadas simultâneas a `login()` disparam 2+ POST /login
     * → o segundo retorna LOGIN_ERROR_MAX_SESSIONS). */
    private loginPromise: Promise<void> | null = null;

    constructor() {
        this.client = axios.create({
            baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api',
            timeout: 40000,
        });

        // ── Axios request/response interceptors ──────────────────────────────
        this.client.interceptors.request.use((config) => {
            const { method, url, data } = config;
            console.log(`[CONEXOS →] ${(method ?? 'GET').toUpperCase()} ${url}`);
            if (data) console.log(`[CONEXOS →] body=${redactSensitive(data)}`);
            return config;
        });

        this.client.interceptors.response.use(
            (resp) => {
                const { method, url } = resp.config;
                const count =
                    resp.data?.count ??
                    resp.data?.rows?.length ??
                    (Array.isArray(resp.data) ? resp.data.length : undefined);
                const countStr = count !== undefined ? ` count=${count}` : '';
                console.log(
                    `[CONEXOS ←] ${(method ?? 'GET').toUpperCase()} ${url} → ${resp.status}${countStr}`,
                );
                if (DEBUG_VERBOSE) console.log(`[CONEXOS ←] data=${JSON.stringify(resp.data)}`);
                return resp;
            },
            (err) => {
                const { method, url } = err.config ?? {};
                const status = err.response?.status ?? 'ERR';
                const body = err.response?.data;
                console.error(`[CONEXOS ✗] ${(method ?? '?').toUpperCase()} ${url} → ${status}`);
                if (body) console.error(`[CONEXOS ✗] body=${JSON.stringify(body)}`);
                return Promise.reject(err);
            },
        );
        // ─────────────────────────────────────────────────────────────────────
    }

    private extractSidFromSetCookie(setCookie: string[] | undefined): string | null {
        if (!setCookie) return null;
        const sidCookie = setCookie.find((c) => c.startsWith('sid='));
        if (!sidCookie) return null;
        return sidCookie.split(';')[0].replace('sid=', '');
    }

    async login(sessionToKill?: string): Promise<void> {
        // Mutex: se já existe um login em andamento e este não é um retry de
        // sessionToKill, espera o promise compartilhado em vez de abrir uma 2ª
        // sessão paralela (Conexos rejeita com LOGIN_ERROR_MAX_SESSIONS).
        if (this.loginPromise && !sessionToKill) {
            if (DEBUG_VERBOSE) console.log('[Conexos] Login já em andamento — aguardando');
            return this.loginPromise;
        }
        this.loginPromise = this._doLogin(sessionToKill).finally(() => {
            // Limpa o mutex apenas no login "principal"; retries por
            // sessionToKill não devem liberar o mutex porque ainda fazem parte
            // do mesmo fluxo de login que iniciou.
            if (!sessionToKill) this.loginPromise = null;
        });
        return this.loginPromise;
    }

    private async _doLogin(sessionToKill?: string): Promise<void> {
        boxLog('Conexos: login attempt', { sessionToKill });
        const username = process.env.CONEXOS_USERNAME;
        const password = process.env.CONEXOS_PASSWORD;
        if (!username || !password)
            throw new Error('CONEXOS_USERNAME e CONEXOS_PASSWORD sao obrigatorios');

        const body: { username: string; password: string; sessionToKill?: string } = {
            username,
            password,
        };
        if (sessionToKill) body.sessionToKill = sessionToKill;

        try {
            const resp = await this.client.post('/login', body);
            const sid = this.extractSidFromSetCookie(resp.headers['set-cookie']);
            if (!sid) throw new Error('Falha ao obter sid do login Conexos');
            this.sid = sid;
            this.sidExpiresAt = Date.now() + 25 * 60 * 1000;
            if (Array.isArray(resp.data?.filiais)) {
                this.filiais = resp.data.filiais as Filial[];
                if (DEBUG_VERBOSE)
                    console.log(`[Conexos] ${this.filiais.length} filiais capturadas do login`);
            }
            if (typeof resp.data?.filCodDefault === 'number') {
                this.filCodDefault = resp.data.filCodDefault;
            }
            if (typeof resp.data?.usnCod === 'number') {
                this.usnCod = String(resp.data.usnCod);
            }
            if (DEBUG_VERBOSE) console.log('[Conexos] Login bem sucedido');
        } catch (err: any) {
            const errorData = err.response?.data;
            if (
                errorData?.type === 'LOGIN_ERROR_MAX_SESSIONS' &&
                Array.isArray(errorData.sessions) &&
                !sessionToKill
            ) {
                const sessions = errorData.sessions as Array<{
                    sessionId: string;
                    sessionLastAccessedTime: number;
                }>;
                const oldestSession = sessions.reduce((oldest, current) =>
                    current.sessionLastAccessedTime < oldest.sessionLastAccessedTime
                        ? current
                        : oldest,
                );
                if (DEBUG_VERBOSE)
                    console.log(
                        `[Conexos] Limite de sessões atingido — encerrando ${oldestSession.sessionId.substring(0, 8)}...`,
                    );
                return this.login(oldestSession.sessionId);
            }
            throw err;
        }
    }

    async ensureSid() {
        if (!this.sid || (this.sidExpiresAt && Date.now() > this.sidExpiresAt)) {
            await this.login();
        }
    }

    /** Returns filiais captured from the last successful login. */
    async getFiliais(): Promise<Filial[]> {
        await this.ensureSid();
        return this.filiais;
    }

    /** Default filCod for the authenticated user, captured from `/login` response. */
    async getFilCodDefault(): Promise<number | null> {
        await this.ensureSid();
        return this.filCodDefault;
    }

    /**
     * Public sid accessor — pattern from nf-projects `ConexosClient.getSid`.
     * Used by `legacyConexosAdapter` to consume the already-authenticated
     * session instead of opening a parallel one (ADR-0007).
     */
    async getSid(): Promise<{ sid: string; usnCod: string }> {
        await this.ensureSid();
        if (!this.sid) throw new Error('Conexos session not available');
        if (!this.usnCod) throw new Error('Conexos usnCod not captured from /login response');
        return { sid: this.sid, usnCod: this.usnCod };
    }

    /**
     * Generic authenticated POST helper. Used by closing-reports endpoints
     * (com298, com299, com308, com017) that the legacy methods don't wrap.
     * Single point for 401 retry — re-issues a `login()` (which has the
     * MAX_SESSIONS retry built in) on first 401.
     */
    async authenticatedPost<T = unknown>(
        path: string,
        body: unknown,
        opts: { filCod?: number } = {},
    ): Promise<T> {
        await this.ensureSid();
        const url = path.startsWith('/') ? path : `/${path}`;
        const headers = this.defaultHeaders(opts.filCod);
        try {
            const resp = await this.client.post<T>(url, body, { headers });
            return resp.data;
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } }).response?.status;
            if (status !== 401) throw err;
            await this.login();
            const resp = await this.client.post<T>(url, body, {
                headers: this.defaultHeaders(opts.filCod),
            });
            return resp.data;
        }
    }

    /**
     * Generic authenticated GET helper. Mirrors `authenticatedPost` but for
     * Conexos endpoints that expose data via GET — currently the NF Saída
     * `com311/list/<docCod>` and `com311/baixas/list/<docCod>/<titCod>/<vldCheck>`
     * routes (Phase 1, exposure-from-invoice-baixa).
     *
     * Same 401-retry semantics as `authenticatedPost`. `filCod` is required
     * by ADR-0009 — the caller MUST pass `opts.filCod` so the multi-filial
     * header is set correctly; absence will throw `MissingFilCodError`.
     */
    async authenticatedGet<T = unknown>(path: string, opts: { filCod?: number } = {}): Promise<T> {
        await this.ensureSid();
        const url = path.startsWith('/') ? path : `/${path}`;
        const headers = this.defaultHeaders(opts.filCod);
        try {
            const resp = await this.client.get<T>(url, { headers });
            return resp.data;
        } catch (err: unknown) {
            const status = (err as { response?: { status?: number } }).response?.status;
            if (status !== 401) throw err;
            await this.login();
            const resp = await this.client.get<T>(url, {
                headers: this.defaultHeaders(opts.filCod),
            });
            return resp.data;
        }
    }

    private getAuthHeaders() {
        return this.sid ? { Cookie: `sid=${this.sid}` } : {};
    }

    private defaultHeaders(filCod?: number) {
        // ADR-0009: filCod must be provided explicitly OR via CONEXOS_FIL_COD
        // env override. The previous silent fallback to the literal `2`
        // leaked Columbia's branch into multi-filial requests. When neither
        // source supplies a number, throw MissingFilCodError loudly.
        const resolved = filCod ?? config.conexos.filCod;
        if (!Number.isFinite(resolved)) {
            throw new MissingFilCodError({});
        }
        if (!this.usnCod) {
            throw new Error(
                'Conexos usnCod not captured — call ensureSid() before defaultHeaders()',
            );
        }
        return {
            ...this.getAuthHeaders(),
            'content-type': 'application/json;charset=UTF-8',
            'cnx-filcod': String(resolved),
            // PR #19: usnCod is captured at runtime from /login response.
            'cnx-usncod': this.usnCod,
            'cnx-datalanguage': 'pt',
            accept: 'application/json, text/plain, */*',
        };
    }
}

export const conexosService = new ConexosService();
