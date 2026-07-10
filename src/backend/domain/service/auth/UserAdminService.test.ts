import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import type SecretCipher from '../../libs/crypto/SecretCipher.js';
import type UserRepository from '../../repository/auth/UserRepository.js';
import UserAdminService, { createUserSchema } from './UserAdminService.js';

const buildRepo = () =>
    ({
        listAll: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async (i) => ({
            id: 9,
            username: i.username,
            role: i.role,
            ativo: true,
            createdAt: '2026-07-10T00:00:00.000Z',
        })),
        setAtivo: jest.fn().mockResolvedValue(true),
        updatePassword: jest.fn().mockResolvedValue(true),
        setVinculoConexos: jest.fn().mockResolvedValue(true),
    }) as unknown as jest.Mocked<UserRepository>;

const buildCipher = () =>
    ({
        encrypt: jest.fn().mockImplementation(async (p: string) => `enc(${p})`),
        isEnabled: jest.fn().mockResolvedValue(true),
    }) as unknown as jest.Mocked<SecretCipher>;

describe('createUserSchema', () => {
    it('normaliza email (trim/lowercase) e default role=operador', () => {
        const out = createUserSchema.parse({
            username: '  NOVO@Kavex.com ',
            password: 'segredo12',
        });
        expect(out).toMatchObject({ username: 'novo@kavex.com', role: 'operador' });
    });
    it('rejeita email inválido, senha curta e role desconhecida', () => {
        expect(createUserSchema.safeParse({ username: 'x', password: 'segredo12' }).success).toBe(
            false,
        );
        expect(createUserSchema.safeParse({ username: 'a@b.com', password: 'curta' }).success).toBe(
            false,
        );
        expect(
            createUserSchema.safeParse({ username: 'a@b.com', password: 'segredo12', role: 'root' })
                .success,
        ).toBe(false);
    });
});

describe('UserAdminService', () => {
    it('create: gera hash bcrypt (nunca senha em claro) e propaga createdBy', async () => {
        const repo = buildRepo();
        const service = new UserAdminService(repo, buildCipher());
        await service.create(
            { username: 'novo@kavex.com', password: 'segredo12', role: 'operador' },
            'simone@kavex.com',
        );
        const arg = (repo.create as jest.Mock).mock.calls[0][0];
        expect(arg.passwordHash).not.toBe('segredo12');
        expect(await bcrypt.compare('segredo12', arg.passwordHash)).toBe(true);
        expect(arg.createdBy).toBe('simone@kavex.com');
    });

    it('create com vínculo: cifra a senha Conexos e grava o vínculo', async () => {
        const repo = buildRepo();
        const cipher = buildCipher();
        const service = new UserAdminService(repo, cipher);
        const out = await service.create(
            {
                username: 'marilyn@kavex.com',
                password: 'segredo12',
                role: 'operador',
                conexosUsername: 'MARILYN_MUTAFCI',
                conexosPassword: 'senha-erp',
            },
            'simone@kavex.com',
        );
        expect(cipher.encrypt).toHaveBeenCalledWith('senha-erp');
        expect(repo.setVinculoConexos).toHaveBeenCalledWith(9, {
            conexosUsername: 'MARILYN_MUTAFCI',
            conexosPasswordEnc: 'enc(senha-erp)',
        });
        expect(out.conexosUsername).toBe('MARILYN_MUTAFCI');
    });

    it('setVinculo(null): limpa sem cifrar; NOT_FOUND se id não existe', async () => {
        const repo = buildRepo();
        const cipher = buildCipher();
        const service = new UserAdminService(repo, cipher);
        await service.setVinculo(6, null);
        expect(repo.setVinculoConexos).toHaveBeenCalledWith(6, null);
        expect(cipher.encrypt).not.toHaveBeenCalled();
        (repo.setVinculoConexos as jest.Mock).mockResolvedValue(false);
        await expect(service.setVinculo(999, null)).rejects.toThrow(/NOT_FOUND/);
    });

    it('setAtivo/resetPassword: lançam NOT_FOUND quando o id não existe', async () => {
        const repo = buildRepo();
        (repo.setAtivo as jest.Mock).mockResolvedValue(false);
        (repo.updatePassword as jest.Mock).mockResolvedValue(false);
        const service = new UserAdminService(repo, buildCipher());
        await expect(service.setAtivo(999, false)).rejects.toThrow(/NOT_FOUND/);
        await expect(service.resetPassword(999, 'segredo12')).rejects.toThrow(/NOT_FOUND/);
    });
});
