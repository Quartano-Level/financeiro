import 'reflect-metadata';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import { PROCESSAMENTO_STATUS } from '../../interface/permutas/Processamento.js';
import PermutaProcessamentoRepository from './PermutaProcessamentoRepository.js';

const buildDb = () =>
    ({
        insert: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(0),
        selectMany: jest.fn().mockResolvedValue([]),
        selectFirst: jest.fn().mockResolvedValue(null),
    }) as unknown as jest.Mocked<PostgreeDatabaseClient>;

describe('PermutaProcessamentoRepository', () => {
    it('upserts with ON CONFLICT DO UPDATE, parameterized, stamping processado_em', async () => {
        const db = buildDb();
        const repo = new PermutaProcessamentoRepository(db);

        await repo.upsertProcessamento({
            adiantamentoDocCod: 'A1',
            status: PROCESSAMENTO_STATUS.PROCESSADO,
            invoiceDocCod: 'I1',
            observacao: 'ok',
            processadoPor: 'user-1',
        });

        const [sql, params] = (db.insert as jest.Mock).mock.calls[0];
        expect(sql).toContain('INSERT INTO permuta_processamento');
        expect(sql).toContain('ON CONFLICT (adiantamento_doc_cod) DO UPDATE');
        // Parameterized — named params only (Rule #5), no interpolation.
        expect(sql).toContain('$adiantamentoDocCod');
        expect(sql).not.toMatch(/'\s*\+|\$\{/);
        expect(params).toMatchObject({
            adiantamentoDocCod: 'A1',
            status: 'processado',
            invoiceDocCod: 'I1',
            observacao: 'ok',
            processadoPor: 'user-1',
        });
        // processado_em stamped when status=processado.
        expect(params.processadoEm).not.toBeNull();
    });

    it('leaves processado_em null for non-processado status, nulls optional fields', async () => {
        const db = buildDb();
        const repo = new PermutaProcessamentoRepository(db);

        await repo.upsertProcessamento({
            adiantamentoDocCod: 'A2',
            status: PROCESSAMENTO_STATUS.PENDENTE,
            processadoPor: 'user-2',
        });

        const params = (db.insert as jest.Mock).mock.calls[0][1] as Record<string, unknown>;
        expect(params.processadoEm).toBeNull();
        expect(params.invoiceDocCod).toBeNull();
        expect(params.observacao).toBeNull();
    });

    it('findProcessamento maps a row to the domain shape', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({
            adiantamento_doc_cod: 'A1',
            status: 'processado',
            invoice_doc_cod: 'I1',
            observacao: null,
            processado_por: 'user-1',
            processado_em: '2026-06-18T12:00:00Z',
        });
        const repo = new PermutaProcessamentoRepository(db);

        const found = await repo.findProcessamento('A1');
        expect(found).toMatchObject({
            adiantamentoDocCod: 'A1',
            status: 'processado',
            invoiceDocCod: 'I1',
            processadoPor: 'user-1',
        });
        expect(found?.observacao).toBeUndefined();
        expect(found?.processadoEm).toBeInstanceOf(Date);
    });

    it('findProcessamento returns null when absent', async () => {
        const db = buildDb();
        const repo = new PermutaProcessamentoRepository(db);
        expect(await repo.findProcessamento('absent')).toBeNull();
    });

    it('listProcessamentos filters by status when provided', async () => {
        const db = buildDb();
        (db.selectMany as jest.Mock).mockResolvedValue([
            { adiantamento_doc_cod: 'A1', status: 'processado' },
        ]);
        const repo = new PermutaProcessamentoRepository(db);

        const list = await repo.listProcessamentos(PROCESSAMENTO_STATUS.PROCESSADO);
        expect(list).toHaveLength(1);
        const [sql, params] = (db.selectMany as jest.Mock).mock.calls[0];
        expect(sql).toContain('WHERE status = $status');
        expect(params).toMatchObject({ status: 'processado' });
    });

    it('listProcessamentos without status omits the WHERE clause', async () => {
        const db = buildDb();
        const repo = new PermutaProcessamentoRepository(db);
        await repo.listProcessamentos();
        const sql = (db.selectMany as jest.Mock).mock.calls[0][0] as string;
        expect(sql).not.toContain('WHERE status');
    });
});
