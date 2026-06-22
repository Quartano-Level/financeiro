import { redactBody } from './redact.js';

describe('redactBody', () => {
    it('masks sensitive top-level keys (case-insensitive)', () => {
        const out = redactBody({ username: 'simone', password: 'segredo', Token: 'abc' }) as Record<
            string,
            unknown
        >;
        expect(out.username).toBe('simone');
        expect(out.password).toBe('[REDACTED]');
        expect(out.Token).toBe('[REDACTED]');
    });

    it('masks nested sensitive keys (objects and arrays)', () => {
        const out = redactBody({
            user: { name: 'x', secret: 's' },
            items: [{ apiKey: 'k1' }, { apiKey: 'k2' }],
        }) as Record<string, unknown>;
        expect((out.user as Record<string, unknown>).name).toBe('x');
        expect((out.user as Record<string, unknown>).secret).toBe('[REDACTED]');
        const items = out.items as Array<Record<string, unknown>>;
        expect(items[0].apiKey).toBe('[REDACTED]');
        expect(items[1].apiKey).toBe('[REDACTED]');
    });

    it('does not mutate the original object', () => {
        const original = { password: 'p' };
        redactBody(original);
        expect(original.password).toBe('p');
    });

    it('leaves non-sensitive payloads untouched', () => {
        const out = redactBody({ docCod: '2731', valorAlocado: 1000 });
        expect(out).toEqual({ docCod: '2731', valorAlocado: 1000 });
    });

    it('passes through primitives and null', () => {
        expect(redactBody('hello')).toBe('hello');
        expect(redactBody(42)).toBe(42);
        expect(redactBody(null)).toBe(null);
    });

    it('accepts custom key list', () => {
        const out = redactBody({ cpf: '123', nome: 'x' }, ['cpf']) as Record<string, unknown>;
        expect(out.cpf).toBe('[REDACTED]');
        expect(out.nome).toBe('x');
    });
});
