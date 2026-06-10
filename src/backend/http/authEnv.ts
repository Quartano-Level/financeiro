import { z } from 'zod';

/**
 * Zod schema for the authentication-related environment variables. Validated
 * once at boundary (per repo convention: external inputs — including
 * `process.env` — are parsed with Zod, never read raw).
 *
 * Arch-review cards security-1 (Microsoft/Azure AD auth via Supabase) and
 * security-7 (backend JWT validation on every API route).
 *
 * The middleware picks the verifier PER TOKEN by its `alg` header, so BOTH
 * vars may be set at once — the project can sign HS256 today and ES256
 * tomorrow (a Supabase signing-key rotation) without a redeploy:
 * - `SUPABASE_URL` — the Supabase project URL (e.g. `https://<ref>.supabase.co`).
 *   Enables ASYMMETRIC (ES256/RS256) verification against the project's JWKS
 *   (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), with issuer
 *   `${SUPABASE_URL}/auth/v1`. Also supplies the issuer enforced on the HS256
 *   path. Required for projects whose current signing key is asymmetric.
 * - `SUPABASE_JWT_SECRET` — the HS256 shared signing secret (Supabase →
 *   Settings → API → JWT Keys / Legacy JWT Secret). Enables SYMMETRIC (HS256)
 *   verification. HS256 keys are never published in a JWKS, so this is the only
 *   way to verify HS256 login tokens. Can be set ALONGSIDE `SUPABASE_URL`.
 * - `DEV_AUTH_BYPASS` — when `'true'`, the JWT middleware is skipped. Default
 *   off; must never be `'true'` in a deployed environment.
 *
 * At least one of `SUPABASE_URL` or `SUPABASE_JWT_SECRET` is required UNLESS
 * `DEV_AUTH_BYPASS` is on, so local dev can run before credentials are
 * provisioned. Set BOTH to accept either signing scheme.
 */
const RawAuthEnvSchema = z.object({
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_JWT_SECRET: z.string().min(1).optional(),
    DEV_AUTH_BYPASS: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
    // `environment` mirrors `EnvironmentVars.environment` (read raw from
    // `process.env.environment` across the codebase). Free-form string —
    // unset defaults to local, matching EnvironmentProvider.
    environment: z.string().optional(),
});

/**
 * Deployed (non-local) environments where authentication must always be
 * enforced. If `DEV_AUTH_BYPASS=true` reaches any of these, startup must fail
 * loudly instead of booting an unauthenticated API. Arch-review card security-1.
 */
const DEPLOYED_ENVIRONMENTS = ['prd', 'stg', 'hml'] as const;

export interface AuthEnv {
    /**
     * Supabase project URL used to derive the JWKS URI and issuer for
     * asymmetric (ES256) verification. Preferred over `jwtSecret`.
     */
    supabaseUrl?: string;
    /** Legacy HS256 secret used to verify Supabase-issued JWTs. */
    jwtSecret?: string;
    /** When true, JWT validation is skipped entirely (local dev only). */
    devBypass: boolean;
}

/**
 * Parses and validates the auth env vars. Throws (fail-fast at startup) when
 * the configuration is incoherent — e.g. JWT validation is enabled but neither
 * a JWKS URL nor a legacy secret was provided.
 */
export const loadAuthEnv = (env: NodeJS.ProcessEnv = process.env): AuthEnv => {
    const parsed = RawAuthEnvSchema.parse({
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_JWT_SECRET: env.SUPABASE_JWT_SECRET,
        DEV_AUTH_BYPASS: env.DEV_AUTH_BYPASS,
        environment: env.environment,
    });

    // Fail-fast: DEV_AUTH_BYPASS disables JWT validation entirely, so it must
    // never reach a deployed environment. Crossing the bypass flag with the
    // running environment turns a silent unauthenticated boot into a startup
    // crash. Arch-review card security-1.
    const isDeployedEnvironment = DEPLOYED_ENVIRONMENTS.includes(
        parsed.environment as (typeof DEPLOYED_ENVIRONMENTS)[number],
    );
    if (parsed.DEV_AUTH_BYPASS && isDeployedEnvironment) {
        throw new Error(
            `DEV_AUTH_BYPASS must not be enabled in a deployed environment ` +
                `(environment "${parsed.environment}"). It disables all JWT ` +
                `validation and would leave the API open. Unset DEV_AUTH_BYPASS ` +
                `(or set it to false) for ${DEPLOYED_ENVIRONMENTS.join('/')} deployments.`,
        );
    }

    if (!parsed.DEV_AUTH_BYPASS && !parsed.SUPABASE_URL && !parsed.SUPABASE_JWT_SECRET) {
        throw new Error(
            'SUPABASE_URL (preferred, JWKS/ES256) or SUPABASE_JWT_SECRET (legacy HS256) ' +
                'is required unless DEV_AUTH_BYPASS=true.',
        );
    }

    return {
        supabaseUrl: parsed.SUPABASE_URL,
        jwtSecret: parsed.SUPABASE_JWT_SECRET,
        devBypass: parsed.DEV_AUTH_BYPASS,
    };
};
