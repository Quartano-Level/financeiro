import 'reflect-metadata';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import PermutaExecucaoRepository from './PermutaExecucaoRepository.js';

const buildDb = () =>
    ({
        insert: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue(1),
        selectMany: jest.fn().mockResolvedValue([]),
        selectFirst: jest.fn().mockResolvedValue(null),
    }) as unknown as jest.Mocked<PostgreeDatabaseClient>;

describe('PermutaExecucaoRepository', () => {
    it('beginExecution: UPSERT que PRESERVA settled (idempotência) e é parametrizado', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({ status: 'reconciling' });
        const repo = new PermutaExecucaoRepository(db);

        const out = await repo.beginExecution({
            idempotencyKey: 'permuta:A:I',
            adiantamentoDocCod: 'A',
            invoiceDocCod: 'I',
            filCod: 4,
            dryRun: false,
            executadoPor: 'yuri',
        });

        const [sql, params] = (db.selectFirst as jest.Mock).mock.calls[0];
        expect(sql).toContain('INSERT INTO permuta_alocacao_execucao');
        expect(sql).toContain('ON CONFLICT (idempotency_key) DO UPDATE');
        // O CASE preserva o status quando já é 'settled' (não regride).
        expect(sql).toContain("permuta_alocacao_execucao.status = 'settled'");
        expect(sql).toContain('$newStatus');
        expect(sql).not.toMatch(/'\s*\+|\$\{/);
        expect(params).toMatchObject({
            key: 'permuta:A:I',
            newStatus: 'reconciling',
            dryRun: false,
        });
        expect(out).toEqual({ status: 'reconciling', alreadySettled: false });
    });

    it('borderoDoPar: SÓ execução REAL com bor_cod (dry_run=false, bor_cod NOT NULL), parametrizado', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({ bor_cod: 2039 });
        const repo = new PermutaExecucaoRepository(db);

        const out = await repo.borderoDoPar('4061', '4117');

        const [sql, params] = (db.selectFirst as jest.Mock).mock.calls[0];
        expect(sql).toContain('FROM permuta_alocacao_execucao');
        expect(sql).toContain('dry_run = false');
        expect(sql).toContain('bor_cod IS NOT NULL');
        // IGNORA borderô CANCELADO (bor_vld_finalizado = 2) — baixa estornada no ERP → não trava.
        expect(sql).toContain('NOT EXISTS');
        expect(sql).toContain('permuta_bordero');
        expect(sql).toContain('bor_vld_finalizado = 2');
        expect(sql).toContain('$adtoDocCod');
        expect(sql).toContain('$invoiceDocCod');
        expect(sql).not.toMatch(/'\s*\+|\$\{/); // sem interpolação
        expect(params).toEqual({ adtoDocCod: '4061', invoiceDocCod: '4117' });
        expect(out).toBe(2039);
    });

    it('borderoDoPar: sem linha → null (par sem borderô vivo: nunca baixou OU borderô cancelado/excluído)', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue(null);
        const repo = new PermutaExecucaoRepository(db);
        expect(await repo.borderoDoPar('4061', '4117')).toBeNull();
    });

    it('beginExecution: dry-run abre como pending; settled retornado vira alreadySettled', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({ status: 'settled' });
        const repo = new PermutaExecucaoRepository(db);

        const out = await repo.beginExecution({
            idempotencyKey: 'permuta:A:I',
            adiantamentoDocCod: 'A',
            invoiceDocCod: 'I',
            filCod: 4,
            dryRun: true,
            executadoPor: 'yuri',
        });

        const [, params] = (db.selectFirst as jest.Mock).mock.calls[0];
        expect(params).toMatchObject({ newStatus: 'pending', dryRun: true });
        expect(out).toEqual({ status: 'settled', alreadySettled: true });
    });

    it('markSettled: UPDATE para settled com bxaCodSeq, JSONB e parametrizado', async () => {
        const db = buildDb();
        const repo = new PermutaExecucaoRepository(db);

        await repo.markSettled('permuta:A:I', {
            borCod: 1999,
            bxaCodSeq: 1,
            valorBaixado: 40879.9,
            juros: 220,
            contaJuros: 131,
            erpResponse: { ok: true },
        });

        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain("status = 'settled'");
        expect(sql).toContain('$erpResponse::jsonb');
        expect(sql).not.toMatch(/'\s*\+|\$\{/);
        expect(params).toMatchObject({ key: 'permuta:A:I', bxaCodSeq: 1, contaJuros: 131 });
        expect(params.erpResponse).toBe(JSON.stringify({ ok: true }));
    });

    it('markError: UPDATE para error com mensagem + erpResponse', async () => {
        const db = buildDb();
        const repo = new PermutaExecucaoRepository(db);

        await repo.markError('permuta:A:I', {
            erroMensagem: 'ERP 500',
            erpResponse: { type: 'VALIDATION' },
        });

        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain("status = 'error'");
        expect(params).toMatchObject({ key: 'permuta:A:I', erroMensagem: 'ERP 500' });
        expect(params.erpResponse).toBe(JSON.stringify({ type: 'VALIDATION' }));
    });

    it('setBorCod: UPDATE parametrizado do bor_cod', async () => {
        const db = buildDb();
        const repo = new PermutaExecucaoRepository(db);

        await repo.setBorCod('permuta:A:I', 1999);

        const [sql, params] = (db.update as jest.Mock).mock.calls[0];
        expect(sql).toContain('SET bor_cod = $borCod');
        expect(params).toEqual({ key: 'permuta:A:I', borCod: 1999 });
    });

    it('findByIdempotencyKey: mapeia a linha (camelCase + tipos)', async () => {
        const db = buildDb();
        (db.selectFirst as jest.Mock).mockResolvedValue({
            idempotency_key: 'permuta:A:I',
            adiantamento_doc_cod: 'A',
            invoice_doc_cod: 'I',
            fil_cod: 4,
            status: 'settled',
            dry_run: false,
            bor_cod: 1999,
            bxa_cod_seq: 1,
            valor_baixado: '40879.9',
            criado_em: '2026-06-23T00:00:00Z',
            atualizado_em: '2026-06-23T00:00:00Z',
        });
        const repo = new PermutaExecucaoRepository(db);

        const row = await repo.findByIdempotencyKey('permuta:A:I');

        expect(row).toMatchObject({
            idempotencyKey: 'permuta:A:I',
            adiantamentoDocCod: 'A',
            filCod: 4,
            status: 'settled',
            dryRun: false,
            borCod: 1999,
            bxaCodSeq: 1,
            valorBaixado: 40879.9,
        });
    });

    it('findByIdempotencyKey: null quando não existe', async () => {
        const db = buildDb();
        const repo = new PermutaExecucaoRepository(db);
        expect(await repo.findByIdempotencyKey('nope')).toBeNull();
    });
});
