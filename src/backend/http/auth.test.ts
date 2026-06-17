import type { NextFunction, Request, Response } from 'express';
import { type JWTVerifyGetKey, type KeyLike, SignJWT, generateKeyPair } from 'jose';
import { buildAuthMiddleware, extractBearerToken } from './auth.js';

const SUPABASE_URL = 'https://uvfcziscjpapjzpzlzuk.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const HS_SECRET = 'test-supabase-jwt-secret';

const mockRes = (): Response => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
    res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
    return res as Response;
};

const runMiddleware = async (
    middleware: ReturnType<typeof buildAuthMiddleware>,
    req: Partial<Request>,
): Promise<{ res: Response; next: jest.Mock }> => {
    const res = mockRes();
    const next = jest.fn();
    await middleware(req as Request, res, next as unknown as NextFunction);
    return { res, next };
};

describe('extractBearerToken', () => {
    it('returns the token for a well-formed header', () => {
        expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('returns undefined for a missing header', () => {
        expect(extractBearerToken(undefined)).toBeUndefined();
    });

    it('returns undefined when the scheme is not Bearer', () => {
        expect(extractBearerToken('Basic abc')).toBeUndefined();
    });

    it('returns undefined for an empty token', () => {
        expect(extractBearerToken('Bearer    ')).toBeUndefined();
    });
});

describe('buildAuthMiddleware — ES256 / JWKS path', () => {
    let privateKey: KeyLike;
    let publicKey: KeyLike;
    let keyResolver: JWTVerifyGetKey;

    const signEs256 = (
        claims: Record<string, unknown>,
        opts: {
            issuer?: string;
            audience?: string;
            subject?: string;
            expiresIn?: string;
            key?: KeyLike;
        } = {},
    ): Promise<string> =>
        new SignJWT(claims)
            .setProtectedHeader({ alg: 'ES256', kid: 'test' })
            .setIssuer(opts.issuer ?? ISSUER)
            .setAudience(opts.audience ?? 'authenticated')
            .setSubject(opts.subject ?? 'user-123')
            .setExpirationTime(opts.expiresIn ?? '1h')
            .sign(opts.key ?? privateKey);

    beforeAll(async () => {
        const pair = await generateKeyPair('ES256');
        privateKey = pair.privateKey;
        publicKey = pair.publicKey;
        // Inject the public key as the resolver so no network fetch happens.
        keyResolver = (() => publicKey) as unknown as JWTVerifyGetKey;
    });

    it('accepts a valid token and attaches the user', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await signEs256({ email: 'a@b.com', role: 'authenticated' });
        const req: Partial<Request> = { headers: { authorization: `Bearer ${token}` } };

        const { res, next } = await runMiddleware(middleware, req);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.user).toEqual({ sub: 'user-123', email: 'a@b.com', role: 'authenticated' });
    });

    it('rejects a missing Authorization header with 401', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const { res, next } = await runMiddleware(middleware, { headers: {} });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Missing or malformed Authorization header',
        });
    });

    it('rejects a tampered / wrong-signature token with 401', async () => {
        const other = await generateKeyPair('ES256');
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await signEs256({ role: 'authenticated' }, { key: other.privateKey });
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('rejects a token with the wrong issuer with 401', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await signEs256(
            { role: 'authenticated' },
            { issuer: 'https://evil.example.com/auth/v1' },
        );
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('rejects a token with the wrong audience with 401', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await signEs256({ role: 'authenticated' }, { audience: 'anon' });
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('rejects an expired token with 401 and "Token expired"', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'ES256', kid: 'test' })
            .setIssuer(ISSUER)
            .setAudience('authenticated')
            .setSubject('user-123')
            .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
            .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
            .sign(privateKey);
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('rejects a token missing the sub claim with 401', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'ES256', kid: 'test' })
            .setIssuer(ISSUER)
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(privateKey);
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });
});

describe('buildAuthMiddleware — HS256 legacy fallback', () => {
    const signHs256 = (
        claims: Record<string, unknown>,
        opts: {
            secret?: string;
            expiresIn?: string | number;
            issuer?: string;
            audience?: string;
        } = {},
    ): Promise<string> => {
        const jwt = new SignJWT(claims)
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('user-123')
            .setAudience(opts.audience ?? 'authenticated')
            .setExpirationTime(opts.expiresIn ?? '1h');
        if (opts.issuer) jwt.setIssuer(opts.issuer);
        return jwt.sign(new TextEncoder().encode(opts.secret ?? HS_SECRET));
    };

    it('accepts a valid HS256 token and attaches the user', async () => {
        const middleware = buildAuthMiddleware({ jwtSecret: HS_SECRET, devBypass: false });
        const token = await signHs256({ email: 'a@b.com', role: 'authenticated' });
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
        });

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('rejects a wrong-secret HS256 token with 401', async () => {
        const middleware = buildAuthMiddleware({ jwtSecret: HS_SECRET, devBypass: false });
        const token = await signHs256({ role: 'authenticated' }, { secret: 'a-different-secret' });
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('rejects an expired HS256 token with "Token expired"', async () => {
        const middleware = buildAuthMiddleware({ jwtSecret: HS_SECRET, devBypass: false });
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('user-123')
            .setAudience('authenticated')
            .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
            .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
            .sign(new TextEncoder().encode(HS_SECRET));
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });
});

describe('buildAuthMiddleware — alg-aware (both schemes configured)', () => {
    // Mirrors production: SUPABASE_URL (JWKS/ES256) AND SUPABASE_JWT_SECRET
    // (HS256) both set. The verifier is chosen per token by its `alg` header,
    // so a project that signs HS256 today and ES256 tomorrow both work without
    // redeploying. Regression guard for the real bug: a real Supabase HS256
    // login token was rejected because SUPABASE_URL forced the JWKS path.
    let privateKey: KeyLike;
    let publicKey: KeyLike;
    let keyResolver: JWTVerifyGetKey;

    beforeAll(async () => {
        const pair = await generateKeyPair('ES256');
        privateKey = pair.privateKey;
        publicKey = pair.publicKey;
        keyResolver = (() => publicKey) as unknown as JWTVerifyGetKey;
    });

    const dualEnv = { supabaseUrl: SUPABASE_URL, jwtSecret: HS_SECRET, devBypass: false };

    it('accepts an HS256 token via the shared secret even when SUPABASE_URL is set', async () => {
        const middleware = buildAuthMiddleware(dualEnv, keyResolver);
        const token = await new SignJWT({ email: 'a@b.com', role: 'authenticated' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer(ISSUER)
            .setAudience('authenticated')
            .setSubject('user-hs')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(HS_SECRET));
        const req: Partial<Request> = { headers: { authorization: `Bearer ${token}` } };

        const { res, next } = await runMiddleware(middleware, req);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(req.user).toEqual({ sub: 'user-hs', email: 'a@b.com', role: 'authenticated' });
    });

    it('accepts an ES256 token via JWKS even when a secret is set', async () => {
        const middleware = buildAuthMiddleware(dualEnv, keyResolver);
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'ES256', kid: 'test' })
            .setIssuer(ISSUER)
            .setAudience('authenticated')
            .setSubject('user-es')
            .setExpirationTime('1h')
            .sign(privateKey);
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
        });

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects an HS256 token when only SUPABASE_URL is configured (no secret)', async () => {
        const middleware = buildAuthMiddleware(
            { supabaseUrl: SUPABASE_URL, devBypass: false },
            keyResolver,
        );
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer(ISSUER)
            .setAudience('authenticated')
            .setSubject('user-hs')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(HS_SECRET));
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('rejects an ES256 token when only the HS256 secret is configured (no JWKS)', async () => {
        const middleware = buildAuthMiddleware({ jwtSecret: HS_SECRET, devBypass: false });
        const token = await new SignJWT({ role: 'authenticated' })
            .setProtectedHeader({ alg: 'ES256', kid: 'test' })
            .setAudience('authenticated')
            .setSubject('user-es')
            .setExpirationTime('1h')
            .sign(privateKey);
        const { res, next } = await runMiddleware(middleware, {
            headers: { authorization: `Bearer ${token}` },
            method: 'GET',
            originalUrl: '/processes',
        });

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });
});

describe('buildAuthMiddleware — devBypass and config guards', () => {
    it('skips validation entirely when devBypass is on', async () => {
        const middleware = buildAuthMiddleware({ devBypass: true });
        const { res, next } = await runMiddleware(middleware, { headers: {} });

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('throws if built without supabaseUrl/secret and without devBypass', () => {
        expect(() => buildAuthMiddleware({ devBypass: false })).toThrow(
            /SUPABASE_URL.*SUPABASE_JWT_SECRET/,
        );
    });
});
