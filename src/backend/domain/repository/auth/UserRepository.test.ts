import 'reflect-metadata';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import UserRepository, { UsernameAlreadyExistsError } from './UserRepository.js';

const buildDb = () =>
    ({
        insert: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(1),
        selectMany: jest.fn().mockResolvedValue([]),
        selectFirst: jest.fn().mockResolvedValue(null),
    }) as unknown as jest.Mocked<PostgreeDatabaseClient>;

describe('UserRepository', () => {
    it('findByUsername: mapeia ativo e é parametrizado', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({
            id: 6,
            username: 'marilyn.mutafci@kavex.com',
            password_hash: 'h',
            role: 'admin',
            ativo: true,
        });
        const out = await new UserRepository(db).findByUsername('marilyn.mutafci@kavex.com');
        const [sql, params] = (db.selectFirst as jest.Mock).mock.calls[0];
        expect(sql).toContain('SELECT id, username, password_hash, role, ativo');
        expect(sql).toContain('WHERE username = $username');
        expect(params).toEqual({ username: 'marilyn.mutafci@kavex.com' });
        expect(out).toEqual({
            id: 6,
            username: 'marilyn.mutafci@kavex.com',
            passwordHash: 'h',
            role: 'admin',
            ativo: true,
        });
    });

    it('create: INSERT ... ON CONFLICT DO NOTHING RETURNING; devolve o público (sem hash)', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({
            id: 8,
            username: 'novo@kavex.com',
            role: 'operador',
            ativo: true,
            created_by: 'simone@kavex.com',
            created_at: '2026-07-10T12:00:00.000Z',
        });
        const out = await new UserRepository(db).create({
            username: 'novo@kavex.com',
            passwordHash: 'hash',
            role: 'operador',
            createdBy: 'simone@kavex.com',
        });
        const [sql, params] = (db.selectFirst as jest.Mock).mock.calls[0];
        expect(sql).toContain('INSERT INTO app_user');
        expect(sql).toContain('ON CONFLICT (username) DO NOTHING');
        expect(sql).toContain('RETURNING');
        // O RETURNING (o que sai do banco) nunca expõe o hash de senha.
        expect(sql.split('RETURNING')[1]).not.toContain('password_hash');
        expect(params).toMatchObject({ username: 'novo@kavex.com', role: 'operador' });
        expect(out).toMatchObject({
            id: 8,
            username: 'novo@kavex.com',
            createdBy: 'simone@kavex.com',
        });
        expect(out).not.toHaveProperty('passwordHash');
    });

    it('create: username duplicado (RETURNING vazio) lança UsernameAlreadyExistsError', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue(null);
        await expect(
            new UserRepository(db).create({
                username: 'marilyn.mutafci@kavex.com',
                passwordHash: 'h',
                role: 'operador',
            }),
        ).rejects.toBeInstanceOf(UsernameAlreadyExistsError);
    });

    it('getVinculoConexos: só devolve quando ativo e ambas as colunas preenchidas', async () => {
        const db = buildDb();
        const repo = new UserRepository(db);
        (db.selectFirst as jest.Mock)
            .mockResolvedValueOnce({
                conexos_username: 'MARILYN_MUTAFCI',
                conexos_password_enc: 'enc',
            })
            .mockResolvedValueOnce({ conexos_username: null, conexos_password_enc: null });
        expect(await repo.getVinculoConexos('marilyn@kavex.com')).toEqual({
            conexosUsername: 'MARILYN_MUTAFCI',
            conexosPasswordEnc: 'enc',
        });
        const [sql] = (db.selectFirst as jest.Mock).mock.calls[0];
        expect(sql).toContain('ativo = true'); // inativo nunca opera no ERP
        expect(await repo.getVinculoConexos('sem@kavex.com')).toBeNull(); // colunas nulas
    });

    it('setVinculoConexos: grava cifrado; null limpa as duas colunas', async () => {
        const db = buildDb();
        const repo = new UserRepository(db);
        await repo.setVinculoConexos(6, { conexosUsername: 'X', conexosPasswordEnc: 'enc' });
        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain('SET conexos_username = $conexosUsername');
        expect(params).toEqual({ id: 6, conexosUsername: 'X', conexosPasswordEnc: 'enc' });
        await repo.setVinculoConexos(6, null);
        expect((db.update as jest.Mock).mock.calls[1][1]).toEqual({
            id: 6,
            conexosUsername: null,
            conexosPasswordEnc: null,
        });
    });

    it('setAtivo/updatePassword: parametrizados; false quando nenhuma linha afetada', async () => {
        const db = buildDb();
        (db.update as jest.Mock).mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        const repo = new UserRepository(db);
        expect(await repo.setAtivo(6, false)).toBe(true);
        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain('UPDATE app_user SET ativo = $ativo WHERE id = $id');
        expect(params).toEqual({ id: 6, ativo: false });
        expect(await repo.updatePassword(999, 'h')).toBe(false); // id inexistente
    });
});
