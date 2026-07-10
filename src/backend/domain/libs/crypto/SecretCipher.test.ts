import 'reflect-metadata';
import type EnvironmentProvider from '../environment/EnvironmentProvider.js';
import SecretCipher, { MissingEncryptionKeyError } from './SecretCipher.js';

/** Chave de teste (32 bytes base64). */
const KEY = Buffer.alloc(32, 7).toString('base64');

const buildProvider = (key?: string) =>
    ({
        getEnvironmentVars: jest.fn().mockResolvedValue({ conexosCredEncKey: key }),
    }) as unknown as EnvironmentProvider;

describe('SecretCipher', () => {
    it('round-trip: decrypt(encrypt(x)) === x', async () => {
        const cipher = new SecretCipher(buildProvider(KEY));
        const secret = 'senha-conexos-Marilyn#2026';
        const enc = await cipher.encrypt(secret);
        expect(enc).not.toContain(secret); // não vaza o texto puro
        expect(await cipher.decrypt(enc)).toBe(secret);
    });

    it('IV aleatório: duas cifragens do mesmo texto diferem', async () => {
        const cipher = new SecretCipher(buildProvider(KEY));
        const a = await cipher.encrypt('mesma');
        const b = await cipher.encrypt('mesma');
        expect(a).not.toBe(b);
        expect(await cipher.decrypt(a)).toBe('mesma');
        expect(await cipher.decrypt(b)).toBe('mesma');
    });

    it('GCM detecta adulteração (tag inválida) → lança', async () => {
        const cipher = new SecretCipher(buildProvider(KEY));
        const enc = await cipher.encrypt('intacto');
        const raw = Buffer.from(enc, 'base64');
        raw[raw.length - 1] ^= 0xff; // corrompe o último byte do ciphertext
        await expect(cipher.decrypt(raw.toString('base64'))).rejects.toThrow();
    });

    it('sem chave: isEnabled=false e encrypt lança MissingEncryptionKeyError', async () => {
        const cipher = new SecretCipher(buildProvider(undefined));
        expect(await cipher.isEnabled()).toBe(false);
        await expect(cipher.encrypt('x')).rejects.toBeInstanceOf(MissingEncryptionKeyError);
    });

    it('chave com tamanho errado → lança', async () => {
        const cipher = new SecretCipher(buildProvider(Buffer.alloc(16, 1).toString('base64')));
        await expect(cipher.encrypt('x')).rejects.toThrow(/32 bytes/);
    });
});
