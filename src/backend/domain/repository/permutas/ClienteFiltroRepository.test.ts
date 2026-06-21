import 'reflect-metadata';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import ClienteFiltroRepository from './ClienteFiltroRepository.js';

const buildDb = () =>
    ({
        insert: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(1),
        selectMany: jest.fn().mockResolvedValue([]),
        selectFirst: jest.fn().mockResolvedValue(null),
    }) as unknown as jest.Mocked<PostgreeDatabaseClient>;

describe('ClienteFiltroRepository', () => {
    it('upsertClienteFiltro: INSERT ... ON CONFLICT DO UPDATE, parametrizado', async () => {
        const db = buildDb();
        const repo = new ClienteFiltroRepository(db);

        await repo.upsertClienteFiltro({
            pesCod: '191',
            importador: 'INOX-TECH',
            criadoPor: 'simone',
        });

        const [sql, params] = (db.insert as jest.Mock).mock.calls[0];
        expect(sql).toContain('INSERT INTO cliente_filtro');
        expect(sql).toContain('ON CONFLICT (pes_cod) DO UPDATE');
        // Parametrizado (Rule #5) — sem interpolação.
        expect(sql).toContain('$pesCod');
        expect(sql).not.toMatch(/'\s*\+|\$\{/);
        expect(params).toMatchObject({
            pesCod: '191',
            importador: 'INOX-TECH',
            criadoPor: 'simone',
        });
    });

    it('upsertClienteFiltro: importador ausente vira null', async () => {
        const db = buildDb();
        const repo = new ClienteFiltroRepository(db);
        await repo.upsertClienteFiltro({ pesCod: '191', criadoPor: 'u' });
        const params = (db.insert as jest.Mock).mock.calls[0][1];
        expect(params.importador).toBeNull();
    });

    it('listAtivos: filtra ativo=true e mapeia as linhas', async () => {
        const db = buildDb();
        (db.selectMany as jest.Mock).mockResolvedValue([
            { pes_cod: '191', importador: 'INOX-TECH', criado_em: '2026-06-20T10:00:00Z' },
        ]);
        const repo = new ClienteFiltroRepository(db);

        const list = await repo.listAtivos();

        const sql = (db.selectMany as jest.Mock).mock.calls[0][0] as string;
        expect(sql).toContain('FROM cliente_filtro');
        expect(sql).toContain('ativo = true');
        expect(list[0]).toMatchObject({ pesCod: '191', importador: 'INOX-TECH' });
        expect(list[0].criadoEm).toBeInstanceOf(Date);
    });

    it('listPesCodsAtivos: devolve um Set de pesCods', async () => {
        const db = buildDb();
        (db.selectMany as jest.Mock).mockResolvedValue([{ pes_cod: '191' }, { pes_cod: '202' }]);
        const repo = new ClienteFiltroRepository(db);

        const set = await repo.listPesCodsAtivos();

        expect(set).toBeInstanceOf(Set);
        expect(set.has('191')).toBe(true);
        expect(set.has('202')).toBe(true);
        expect(set.size).toBe(2);
    });

    it('deleteByPesCod: DELETE parametrizado', async () => {
        const db = buildDb();
        const repo = new ClienteFiltroRepository(db);

        await repo.deleteByPesCod('191');

        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain('DELETE FROM cliente_filtro');
        expect(sql).toContain('$pesCod');
        expect(params).toEqual({ pesCod: '191' });
    });
});
