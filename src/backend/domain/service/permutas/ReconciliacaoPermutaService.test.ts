import 'reflect-metadata';
import ReconciliacaoPermutaService from './ReconciliacaoPermutaService.js';

// Guard-rails de escrita via EnvironmentProvider mockado (Rule #8). Mutável por teste.
const envFlags = { conexosWriteEnabled: false, conexosDryRun: true };

const buildAloc = (over: Partial<Record<string, unknown>> = {}) => ({
    adiantamentoDocCod: '2767',
    invoiceDocCod: '5078',
    invoicePriCod: '1408',
    valorAlocado: 7800,
    moeda: 'USD',
    variacaoClassificacao: 'JUROS',
    variacaoResultado: 220,
    variacaoDelta: 220,
    taxaAdiantamento: 5.31,
    // 7800 × 5.241 = 40 879,8 ≈ bxaMnyValor 40 879,9 do mock → passa o guard anti-drift (I-Write-1).
    taxaInvoice: 5.241,
    criadoEm: new Date('2026-06-20'),
    ...over,
});

const buildDeps = () => {
    const conexosClient = {
        criarBordero: jest.fn().mockResolvedValue({ borCod: 1999, filCod: 4 }),
        validarTituloBaixa: jest
            .fn()
            .mockResolvedValue({ responseData: { bxaMnyValor: 40879.9, bxaCodGerDesconto: 94 } }),
        validarTituloPermuta: jest.fn().mockResolvedValue({
            responseData: {
                gerNumPermuta: 198,
                gerDesPermuta: 'ADTO FORNECEDOR INTERNACIONAIS',
                gerNum: 198,
                pesCod: 2658,
                dpeNomPessoa: 'TOP GLOBAL PARTS CO LTD',
                bxaMnyValorPermuta: 41175.97,
            },
        }),
        atualizarValorLiquido: jest
            .fn()
            .mockResolvedValue({ responseData: { bxaMnyLiquido: 41099.9 } }),
        gravarBaixaPermuta: jest.fn().mockResolvedValue({ bxaCodSeq: 1, borCod: 1999 }),
    };
    const alocacaoRepository = { listAtivas: jest.fn().mockResolvedValue([buildAloc()]) };
    const execucaoRepository = {
        beginExecution: jest
            .fn()
            .mockResolvedValue({ status: 'reconciling', alreadySettled: false }),
        setBorCod: jest.fn().mockResolvedValue(undefined),
        setRequestPayload: jest.fn().mockResolvedValue(undefined),
        markSettled: jest.fn().mockResolvedValue(undefined),
        markError: jest.fn().mockResolvedValue(undefined),
        listByAdiantamento: jest.fn().mockResolvedValue([]),
    };
    const relationalRepository = {
        findAdiantamento: jest
            .fn()
            .mockResolvedValue({ docCod: '2767', priCod: '1408', filCod: 4 }),
    };
    const logService = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const environmentProvider = {
        getEnvironmentVars: jest.fn().mockResolvedValue({
            conexosWriteEnabled: envFlags.conexosWriteEnabled,
            conexosDryRun: envFlags.conexosDryRun,
        }),
    };
    const service = new ReconciliacaoPermutaService(
        conexosClient as never,
        environmentProvider as never,
        alocacaoRepository as never,
        execucaoRepository as never,
        relationalRepository as never,
        logService as never,
    );
    return { service, conexosClient, alocacaoRepository, execucaoRepository, relationalRepository };
};

describe('ReconciliacaoPermutaService', () => {
    beforeEach(() => {
        envFlags.conexosWriteEnabled = false;
        envFlags.conexosDryRun = true;
    });

    it('dry-run (default): builds preview, persists payload, NEVER calls the ERP', async () => {
        const { service, conexosClient, execucaoRepository } = buildDeps();

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1782172800000,
        });

        expect(out.dryRun).toBe(true);
        expect(out.resultados[0].status).toBe('dry-run');
        expect(conexosClient.criarBordero).not.toHaveBeenCalled();
        expect(conexosClient.gravarBaixaPermuta).not.toHaveBeenCalled();
        expect(execucaoRepository.setRequestPayload).toHaveBeenCalledTimes(1);
        // preview tem o juros local, sem valor do ERP
        expect(out.resultados[0].payload?.bxaMnyJuros).toBe(220);
    });

    it('forces dry-run when writeEnabled=false even if dryRun flag off', async () => {
        envFlags.conexosWriteEnabled = false;
        envFlags.conexosDryRun = false;
        const { service, conexosClient } = buildDeps();

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(out.dryRun).toBe(true);
        expect(conexosClient.gravarBaixaPermuta).not.toHaveBeenCalled();
    });

    it('real run: full 5-step handshake, marks settled with bxaCodSeq', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1782172800000,
        });

        expect(conexosClient.criarBordero).toHaveBeenCalledTimes(1);
        expect(conexosClient.validarTituloBaixa).toHaveBeenCalledTimes(1);
        expect(conexosClient.validarTituloPermuta).toHaveBeenCalledTimes(1);
        expect(conexosClient.atualizarValorLiquido).toHaveBeenCalledTimes(1);
        expect(conexosClient.gravarBaixaPermuta).toHaveBeenCalledTimes(1);

        // payload final do passo 5 combina invoice + permuta + conta 131
        const payload = conexosClient.gravarBaixaPermuta.mock.calls[0][0].payload;
        expect(payload).toMatchObject({
            docCod: 5078,
            bxaDocCod: 2767,
            bxaMnyValor: 40879.9,
            bxaMnyJuros: 220,
            bxaCodGerJuros: 131,
            gerNumPermuta: 198,
            bxaVldAdto: 1,
        });

        expect(execucaoRepository.markSettled).toHaveBeenCalledWith(
            'permuta:2767:5078',
            expect.objectContaining({ borCod: 1999, bxaCodSeq: 1, valorBaixado: 40879.9 }),
        );
        expect(out.resultados[0].status).toBe('settled');
        expect(out.resultados[0].bxaCodSeq).toBe(1);
    });

    it('aborts (no write) when ERP reports zero em-aberto — anti-super-pagamento', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        conexosClient.validarTituloBaixa.mockResolvedValue({ responseData: { bxaMnyValor: 0 } });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(conexosClient.gravarBaixaPermuta).not.toHaveBeenCalled();
        expect(execucaoRepository.markError).toHaveBeenCalledTimes(1);
        expect(out.resultados[0].status).toBe('error');
    });

    it('idempotency: already-settled par is skipped (no ERP write)', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        execucaoRepository.beginExecution.mockResolvedValue({
            status: 'settled',
            alreadySettled: true,
        });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(conexosClient.criarBordero).not.toHaveBeenCalled();
        expect(out.resultados[0].status).toBe('skipped');
    });

    it('records error (not settled) when the final POST throws', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        conexosClient.gravarBaixaPermuta.mockRejectedValue(new Error('ERP 500'));

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(execucaoRepository.markSettled).not.toHaveBeenCalled();
        expect(execucaoRepository.markError).toHaveBeenCalledWith(
            'permuta:2767:5078',
            expect.objectContaining({ erroMensagem: 'ERP 500' }),
        );
        expect(out.resultados[0].status).toBe('error');
    });

    it('throws when adiantamento has no alocacoes', async () => {
        const { service, alocacaoRepository } = buildDeps();
        alocacaoRepository.listAtivas.mockResolvedValue([]);

        await expect(
            service.reconciliar({ adiantamentoDocCod: '2767', executadoPor: 'yuri', dataMovto: 1 }),
        ).rejects.toThrow(/no alocacoes/);
    });

    it('DESCONTO classification routes the value to bxaMnyDesconto (juros=0)', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, alocacaoRepository } = buildDeps();
        alocacaoRepository.listAtivas.mockResolvedValue([
            buildAloc({ variacaoClassificacao: 'DESCONTO', variacaoResultado: 150 }),
        ]);

        await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        const payload = conexosClient.gravarBaixaPermuta.mock.calls[0][0].payload;
        expect(payload.bxaMnyJuros).toBe(0);
        expect(payload.bxaMnyDesconto).toBe(150);
    });

    it('anti-drift (I-Write-1): aborts when ERP value exceeds allocated expectation', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        // alocado 7800 × 5.241 = 40 879,8 esperado; ERP quer baixar 99 999 (>> esperado) → abort.
        conexosClient.validarTituloBaixa.mockResolvedValue({
            responseData: { bxaMnyValor: 99999 },
        });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(conexosClient.gravarBaixaPermuta).not.toHaveBeenCalled();
        expect(execucaoRepository.markError).toHaveBeenCalledWith(
            'permuta:2767:5078',
            expect.objectContaining({ erroMensagem: expect.stringContaining('anti-drift') }),
        );
        expect(out.resultados[0].status).toBe('error');
    });

    it('aborts when a validacao step returns ERRO in the messages envelope', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient } = buildDeps();
        conexosClient.validarTituloBaixa.mockResolvedValue({
            messages: [{ valid: 'ERRO', message: 'FIN_XXX.TITULO_BLOQUEADO' }],
            responseData: { bxaMnyValor: 40879.9 },
        });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(conexosClient.gravarBaixaPermuta).not.toHaveBeenCalled();
        expect(out.resultados[0].status).toBe('error');
    });

    it('persists borCod before the handshake POSTs (orphan recovery)', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, execucaoRepository } = buildDeps();

        await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(execucaoRepository.setBorCod).toHaveBeenCalledWith('permuta:2767:5078', 1999);
    });
});
