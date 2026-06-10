import { buildCorsOptions, parseAllowedOrigins } from './cors.js';

describe('parseAllowedOrigins', () => {
    it('defaults to localhost:3000 when unset', () => {
        expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
    });

    it('defaults to localhost:3000 when empty', () => {
        expect(parseAllowedOrigins('   ')).toEqual(['http://localhost:3000']);
    });

    it('parses a comma-separated list and trims entries', () => {
        expect(parseAllowedOrigins('https://a.com, https://b.com ')).toEqual([
            'https://a.com',
            'https://b.com',
        ]);
    });
});

describe('buildCorsOptions', () => {
    const resolve = (raw: string | undefined, origin: string | undefined) =>
        new Promise<{ allowed: boolean; error?: Error }>((res) => {
            const opts = buildCorsOptions(raw);
            const originFn = opts.origin as (
                o: string | undefined,
                cb: (err: Error | null, allow?: boolean) => void,
            ) => void;
            originFn(origin, (err, allow) =>
                res({ allowed: !err && allow === true, error: err ?? undefined }),
            );
        });

    it('allows a whitelisted origin', async () => {
        const r = await resolve('https://app.columbia.com', 'https://app.columbia.com');
        expect(r.allowed).toBe(true);
    });

    it('allows requests with no Origin header (curl, server-to-server)', async () => {
        const r = await resolve('https://app.columbia.com', undefined);
        expect(r.allowed).toBe(true);
    });

    it('rejects a non-whitelisted origin', async () => {
        const r = await resolve('https://app.columbia.com', 'https://evil.example');
        expect(r.allowed).toBe(false);
        expect(r.error).toBeInstanceOf(Error);
    });

    it('allows the localhost default when ALLOWED_ORIGINS is unset', async () => {
        const r = await resolve(undefined, 'http://localhost:3000');
        expect(r.allowed).toBe(true);
    });
});
