import 'reflect-metadata';
import type SecretCipher from '../libs/crypto/SecretCipher.js';
import { conexosRequestContext } from '../libs/requestContext/ConexosRequestContext.js';
import type UserRepository from '../repository/auth/UserRepository.js';
import type ConexosSessionRegistry from './ConexosSessionRegistry.js';
import ConexosSessionResolver from './ConexosSessionResolver.js';

const ROBOT = { tag: 'robot', ensureSid: jest.fn() } as never;

const build = (over: {
    vinculo?: { conexosUsername: string; conexosPasswordEnc: string } | null;
    decrypt?: () => Promise<string>;
    userEnsureSid?: () => Promise<void>;
}) => {
    const userSession = { tag: 'user', ensureSid: jest.fn(over.userEnsureSid ?? (async () => {})) };
    const repo = {
        getVinculoConexos: jest.fn().mockResolvedValue(over.vinculo ?? null),
    } as unknown as UserRepository;
    const cipher = {
        decrypt: jest.fn(over.decrypt ?? (async () => 'senha-clara')),
    } as unknown as SecretCipher;
    const registry = {
        robot: jest.fn().mockReturnValue(ROBOT),
        forUser: jest.fn().mockReturnValue(userSession),
    } as unknown as ConexosSessionRegistry;
    return { resolver: new ConexosSessionResolver(repo, cipher, registry), userSession, registry };
};

describe('ConexosSessionResolver.resolve', () => {
    it('sem request/contexto → robô', async () => {
        const { resolver } = build({});
        expect(await resolver.resolve()).toBe(ROBOT);
    });

    it('usuário com vínculo válido → sessão dele', async () => {
        const { resolver, userSession } = build({
            vinculo: { conexosUsername: 'MARILYN_MUTAFCI', conexosPasswordEnc: 'enc' },
        });
        const out = await conexosRequestContext.run({ platformUsername: 'marilyn@kavex.com' }, () =>
            resolver.resolve(),
        );
        expect(out).toBe(userSession);
    });

    it('usuário sem vínculo → robô', async () => {
        const { resolver } = build({ vinculo: null });
        const out = await conexosRequestContext.run({ platformUsername: 'novato@kavex.com' }, () =>
            resolver.resolve(),
        );
        expect(out).toBe(ROBOT);
    });

    it('login Conexos do usuário falha (credencial inválida) → robô', async () => {
        const { resolver } = build({
            vinculo: { conexosUsername: 'X', conexosPasswordEnc: 'enc' },
            userEnsureSid: async () => {
                throw new Error('LOGIN_ERROR');
            },
        });
        const out = await conexosRequestContext.run({ platformUsername: 'x@kavex.com' }, () =>
            resolver.resolve(),
        );
        expect(out).toBe(ROBOT);
    });

    it('senha não decifra (chave trocada) → robô', async () => {
        const { resolver } = build({
            vinculo: { conexosUsername: 'X', conexosPasswordEnc: 'enc' },
            decrypt: async () => {
                throw new Error('bad tag');
            },
        });
        const out = await conexosRequestContext.run({ platformUsername: 'x@kavex.com' }, () =>
            resolver.resolve(),
        );
        expect(out).toBe(ROBOT);
    });

    it('cacheia a resolução no contexto da request (1 lookup só)', async () => {
        const { resolver, registry } = build({
            vinculo: { conexosUsername: 'X', conexosPasswordEnc: 'enc' },
        });
        await conexosRequestContext.run({ platformUsername: 'x@kavex.com' }, async () => {
            await resolver.resolve();
            await resolver.resolve();
        });
        expect((registry.forUser as jest.Mock).mock.calls.length).toBe(1);
    });
});

describe('ConexosSessionResolver.testarVinculo', () => {
    it('ausente quando não há vínculo', async () => {
        const { resolver } = build({ vinculo: null });
        expect(await resolver.testarVinculo('x@kavex.com')).toBe('ausente');
    });
    it('ok quando o login de teste passa', async () => {
        const { resolver } = build({
            vinculo: { conexosUsername: 'X', conexosPasswordEnc: 'enc' },
        });
        expect(await resolver.testarVinculo('x@kavex.com')).toBe('ok');
    });
    it('falha quando o login de teste erra', async () => {
        const { resolver } = build({
            vinculo: { conexosUsername: 'X', conexosPasswordEnc: 'enc' },
            userEnsureSid: async () => {
                throw new Error('nope');
            },
        });
        expect(await resolver.testarVinculo('x@kavex.com')).toBe('falha');
    });
});
