import 'reflect-metadata';

/**
 * ADR-0009: the legacy ConexosService used to silently fall back to
 * `config.conexos.filCod = 2` whenever a caller omitted `filCod`. After
 * the multi-filial refactor (Phase 0 of `exposure-from-invoice-baixa`),
 * absent `CONEXOS_FIL_COD` env + missing arg must throw a typed error.
 */
describe('ConexosService — ADR-0009 missing filCod guard', () => {
    const originalFilCod = process.env.CONEXOS_FIL_COD;

    afterEach(() => {
        if (originalFilCod === undefined) {
            delete process.env.CONEXOS_FIL_COD;
        } else {
            process.env.CONEXOS_FIL_COD = originalFilCod;
        }
        jest.resetModules();
    });

    it('throws MissingFilCodError when filCod is undefined and no env override', async () => {
        delete process.env.CONEXOS_FIL_COD;
        jest.resetModules();
        // Reimport both so the same MissingFilCodError class identity is
        // used by the service and by the assertion (jest.resetModules
        // would otherwise leave us with two copies of the class).
        const { default: MissingFilCodErrorReloaded } = await import(
            '../domain/errors/MissingFilCodError.js'
        );
        const { conexosService } = await import('./conexos.js');

        // Bypass the real /login flow; the throw happens in defaultHeaders()
        // before any HTTP call.
        (conexosService as any).ensureSid = async () => undefined;
        (conexosService as any).sid = 'test-sid';
        // PR #19: usnCod is captured from /login at runtime; bypass that
        // here by setting it directly so the guard in defaultHeaders /
        // getEncargosGeraisByInvoice does not short-circuit before the
        // MissingFilCodError path is exercised.
        (conexosService as any).usnCod = '97';

        await expect(
            conexosService.getEncargosGeraisByInvoice(1, 100 /* no filCod */),
        ).rejects.toBeInstanceOf(MissingFilCodErrorReloaded);
    });

    it('does not throw when CONEXOS_FIL_COD env is set as fallback', async () => {
        process.env.CONEXOS_FIL_COD = '7';
        jest.resetModules();
        const { conexosService } = await import('./conexos.js');

        (conexosService as any).ensureSid = async () => undefined;
        (conexosService as any).sid = 'test-sid';
        // PR #19: usnCod is captured from /login at runtime; bypass that
        // here by setting it directly so the guard in defaultHeaders /
        // getEncargosGeraisByInvoice does not short-circuit before the
        // MissingFilCodError path is exercised.
        (conexosService as any).usnCod = '97';
        // Stub axios get so we don't make a real call but still execute
        // defaultHeaders() and the URL build path.
        (conexosService as any).client = {
            get: async () => ({ data: { despesas: [] } }),
        };

        const out = await conexosService.getEncargosGeraisByInvoice(1, 100 /* no filCod */);
        expect(out).toEqual({ despesas: [] });
    });
});

/**
 * arch-review card `security-2` / finding `F-security-4`: the Conexos
 * Axios request interceptor used to log every request body verbatim,
 * leaking the production `/login` password to stdout. `redactSensitive`
 * masks sensitive keys before they reach the log.
 */
describe('ConexosService — redactSensitive (security-2 / F-security-4)', () => {
    it('masks password and username on an object body', async () => {
        const { redactSensitive } = await import('./conexos.js');
        const out = JSON.parse(
            redactSensitive({ username: 'columbia-prod', password: 'super-secret' }),
        );
        expect(out.username).toBe('<REDACTED>');
        expect(out.password).toBe('<REDACTED>');
    });

    it('masks password and username on a JSON string body', async () => {
        const { redactSensitive } = await import('./conexos.js');
        const out = JSON.parse(
            redactSensitive('{"username":"columbia-prod","password":"super-secret"}'),
        );
        expect(out.username).toBe('<REDACTED>');
        expect(out.password).toBe('<REDACTED>');
    });

    it('redacts assorted sensitive keys case-insensitively, nested and in arrays', async () => {
        const { redactSensitive } = await import('./conexos.js');
        const out = JSON.parse(
            redactSensitive({
                Authorization: 'Bearer abc',
                senha: 'x',
                pwd: 'y',
                secret: 'z',
                token: 't',
                sid: 's',
                usuario: 'u',
                nested: { password: 'deep' },
                items: [{ token: 'arr-token' }],
            }),
        );
        expect(out.Authorization).toBe('<REDACTED>');
        expect(out.senha).toBe('<REDACTED>');
        expect(out.pwd).toBe('<REDACTED>');
        expect(out.secret).toBe('<REDACTED>');
        expect(out.token).toBe('<REDACTED>');
        expect(out.sid).toBe('<REDACTED>');
        expect(out.usuario).toBe('<REDACTED>');
        expect(out.nested.password).toBe('<REDACTED>');
        expect(out.items[0].token).toBe('<REDACTED>');
    });

    it('leaves non-sensitive fields intact', async () => {
        const { redactSensitive } = await import('./conexos.js');
        const out = JSON.parse(
            redactSensitive({
                fieldList: [],
                pageNumber: 1,
                serviceName: 'imp021',
                sessionToKill: 'abc-123',
            }),
        );
        expect(out.pageNumber).toBe(1);
        expect(out.serviceName).toBe('imp021');
        expect(out.sessionToKill).toBe('abc-123');
        expect(out.fieldList).toEqual([]);
    });

    it('returns non-JSON strings unchanged', async () => {
        const { redactSensitive } = await import('./conexos.js');
        expect(redactSensitive('plain text body')).toBe('plain text body');
    });
});
