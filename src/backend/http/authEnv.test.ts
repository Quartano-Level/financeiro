import { loadAuthEnv } from './authEnv.js';

const URL = 'https://uvfcziscjpapjzpzlzuk.supabase.co';

describe('loadAuthEnv', () => {
    it('parses SUPABASE_URL (preferred, JWKS/ES256) with bypass off', () => {
        const env = loadAuthEnv({ SUPABASE_URL: URL } as NodeJS.ProcessEnv);
        expect(env).toEqual({ supabaseUrl: URL, jwtSecret: undefined, devBypass: false });
    });

    it('parses AUTH_JWT_SECRET (app login HS256) with bypass off', () => {
        const env = loadAuthEnv({ AUTH_JWT_SECRET: 'app-secret' } as NodeJS.ProcessEnv);
        expect(env).toEqual({ supabaseUrl: undefined, jwtSecret: 'app-secret', devBypass: false });
    });

    it('prefers AUTH_JWT_SECRET over SUPABASE_JWT_SECRET', () => {
        const env = loadAuthEnv({
            AUTH_JWT_SECRET: 'app-secret',
            SUPABASE_JWT_SECRET: 'legacy',
        } as NodeJS.ProcessEnv);
        expect(env.jwtSecret).toBe('app-secret');
    });

    it('parses a legacy HS256 secret with bypass off', () => {
        const env = loadAuthEnv({ SUPABASE_JWT_SECRET: 'shhh' } as NodeJS.ProcessEnv);
        expect(env).toEqual({ supabaseUrl: undefined, jwtSecret: 'shhh', devBypass: false });
    });

    it('keeps both when SUPABASE_URL and SUPABASE_JWT_SECRET are set', () => {
        const env = loadAuthEnv({
            SUPABASE_URL: URL,
            SUPABASE_JWT_SECRET: 'shhh',
        } as NodeJS.ProcessEnv);
        expect(env).toEqual({ supabaseUrl: URL, jwtSecret: 'shhh', devBypass: false });
    });

    it('allows missing url/secret when DEV_AUTH_BYPASS=true', () => {
        const env = loadAuthEnv({ DEV_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv);
        expect(env).toEqual({ supabaseUrl: undefined, jwtSecret: undefined, devBypass: true });
    });

    it('throws when neither url nor secret and bypass off', () => {
        expect(() => loadAuthEnv({} as NodeJS.ProcessEnv)).toThrow(
            /SUPABASE_URL .* or SUPABASE_JWT_SECRET/,
        );
    });

    it('throws when SUPABASE_URL is not a valid URL', () => {
        expect(() => loadAuthEnv({ SUPABASE_URL: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow();
    });

    it('throws when DEV_AUTH_BYPASS has an invalid value', () => {
        expect(() =>
            loadAuthEnv({ DEV_AUTH_BYPASS: 'yes', SUPABASE_URL: URL } as NodeJS.ProcessEnv),
        ).toThrow();
    });

    it('treats DEV_AUTH_BYPASS=false as bypass off', () => {
        const env = loadAuthEnv({
            SUPABASE_URL: URL,
            DEV_AUTH_BYPASS: 'false',
        } as NodeJS.ProcessEnv);
        expect(env.devBypass).toBe(false);
    });

    describe('DEV_AUTH_BYPASS × environment guard (security-1)', () => {
        // 'production' é o nome que o Render seta (render.yaml) — a allow-list antiga o deixava ESCAPAR.
        // Deny-by-default: qualquer nome não-local crasha. (security-1/R-5)
        for (const environment of ['prd', 'stg', 'hml', 'production', 'prod', 'Production']) {
            it(`throws at startup when DEV_AUTH_BYPASS=true in ${environment}`, () => {
                expect(() =>
                    loadAuthEnv({
                        DEV_AUTH_BYPASS: 'true',
                        environment,
                    } as NodeJS.ProcessEnv),
                ).toThrow(
                    new RegExp(
                        `DEV_AUTH_BYPASS.*must not be enabled.*environment "${environment}"`,
                    ),
                );
            });
        }

        it('lists the exact deployed environment in the error message', () => {
            expect(() =>
                loadAuthEnv({ DEV_AUTH_BYPASS: 'true', environment: 'prd' } as NodeJS.ProcessEnv),
            ).toThrow(/environment "prd"/);
        });

        it('does NOT throw when DEV_AUTH_BYPASS=true in local', () => {
            const env = loadAuthEnv({
                DEV_AUTH_BYPASS: 'true',
                environment: 'local',
            } as NodeJS.ProcessEnv);
            expect(env.devBypass).toBe(true);
        });

        it('does NOT throw when DEV_AUTH_BYPASS=true and environment is unset (defaults to local)', () => {
            const env = loadAuthEnv({ DEV_AUTH_BYPASS: 'true' } as NodeJS.ProcessEnv);
            expect(env.devBypass).toBe(true);
        });

        it('does NOT throw when DEV_AUTH_BYPASS=true in dev', () => {
            const env = loadAuthEnv({
                DEV_AUTH_BYPASS: 'true',
                environment: 'dev',
            } as NodeJS.ProcessEnv);
            expect(env.devBypass).toBe(true);
        });

        it('does NOT throw in prd when bypass is off and credentials are present', () => {
            const env = loadAuthEnv({
                SUPABASE_URL: URL,
                environment: 'prd',
            } as NodeJS.ProcessEnv);
            expect(env.devBypass).toBe(false);
        });
    });
});
