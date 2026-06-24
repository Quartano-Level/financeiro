import 'reflect-metadata';
import ReconciliacaoPermutaService from './ReconciliacaoPermutaService.js';

// Guard-rails de escrita via EnvironmentProvider mockado (Rule #8). Mutável por teste.
const envFlags = { conexosWriteEnabled: false, conexosDryRun: true };

// `atualizado_em` da alocação entra na chave de idempotência (por estado da alocação).
const ATUALIZADO = new Date('2026-06-23T00:00:00Z');
const KEY = `permuta:2767:5078:${ATUALIZADO.getTime()}`;

const buildAloc = (over: Partial<Record<string, unknown>> = {}) => ({
    adiantamentoDocCod: '2767',
    invoiceDocCod: '5078',
    invoicePriCod: '1408',
    valorAlocado: 1000,
    moeda: 'USD',
    variacaoClassificacao: 'JUROS',
    variacaoResultado: 220,
    variacaoDelta: 220,
    taxaAdiantamento: 5.31,
    // 1000 × 5.0 = 5000 BRL = valor da baixa PARCIAL (≤ em-aberto 40 879,9 do mock).
    taxaInvoice: 5.0,
    criadoEm: new Date('2026-06-20'),
    atualizadoEm: ATUALIZADO,
    dataBase: new Date('2026-03-15T00:00:00Z'),
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
        getBordero: jest.fn().mockResolvedValue({ borVldFinalizado: 0, borCodEstornado: null }),
    };
    const alocacaoRepository = { listAtivas: jest.fn().mockResolvedValue([buildAloc()]) };
    const execucaoRepository = {
        findByIdempotencyKey: jest.fn().mockResolvedValue(null),
        deleteByKey: jest.fn().mockResolvedValue(1),
        renameKey: jest.fn().mockResolvedValue(1),
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
    // auto-alocação no Baixar (múltipla automática) — default: não elegível (não cria nada).
    const alocacaoService = {
        autoAlocarSeElegivel: jest.fn().mockResolvedValue(false),
        autoAlocarDeCasamento: jest.fn().mockResolvedValue(false),
    };
    const service = new ReconciliacaoPermutaService(
        conexosClient as never,
        environmentProvider as never,
        alocacaoRepository as never,
        execucaoRepository as never,
        relationalRepository as never,
        alocacaoService as never,
        logService as never,
    );
    return {
        service,
        conexosClient,
        alocacaoRepository,
        execucaoRepository,
        relationalRepository,
        alocacaoService,
    };
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
        // dry-run NÃO tem efeito no banco (I-Recon-4): nada de beginExecution/setRequestPayload.
        expect(execucaoRepository.beginExecution).not.toHaveBeenCalled();
        expect(execucaoRepository.setRequestPayload).not.toHaveBeenCalled();
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
        // Data do borderô = a data ESCOLHIDA pelo analista (dataMovto do request).
        expect(conexosClient.criarBordero).toHaveBeenCalledWith({
            filCod: 4,
            dataMovto: 1782172800000,
        });
        expect(conexosClient.validarTituloBaixa).toHaveBeenCalledTimes(1);
        expect(conexosClient.validarTituloPermuta).toHaveBeenCalledTimes(1);
        expect(conexosClient.atualizarValorLiquido).toHaveBeenCalledTimes(1);
        expect(conexosClient.gravarBaixaPermuta).toHaveBeenCalledTimes(1);

        // payload final do passo 5: baixa PARCIAL (valor alocado × taxa = 5000), não o título cheio.
        const payload = conexosClient.gravarBaixaPermuta.mock.calls[0][0].payload;
        expect(payload).toMatchObject({
            docCod: 5078,
            bxaDocCod: 2767,
            bxaMnyValor: 5000,
            bxaMnyJuros: 220,
            bxaCodGerJuros: 131,
            gerNumPermuta: 198,
            bxaVldAdto: 1,
        });

        // comentário do borderô (spec): conta da variação + duas taxas + conta de juros, em MAIÚSCULAS
        // (o ERP exige uppercase — CnxValidatorDescr / not_in_uppercase).
        expect(payload.bxaEspComplemento).toBe(String(payload.bxaEspComplemento).toUpperCase());
        expect(payload.bxaEspComplemento).toContain('VARIACAO CAMBIAL');
        expect(payload.bxaEspComplemento).toContain('TAXA ADTO 5.31');
        expect(payload.bxaEspComplemento).toContain('TAXA INVOICE 5');
        expect(payload.bxaEspComplemento).toContain('131');

        expect(execucaoRepository.markSettled).toHaveBeenCalledWith(
            KEY,
            expect.objectContaining({ borCod: 1999, bxaCodSeq: 1, valorBaixado: 5000 }),
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

    it('idempotency: settled + borderô AINDA VÁLIDO no ERP → skipped (no write)', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        // já existe baixa settled, e o borderô segue válido (em cadastro) no ERP.
        execucaoRepository.findByIdempotencyKey.mockResolvedValue({
            status: 'settled',
            borCod: 14707,
        });
        conexosClient.getBordero.mockResolvedValue({ borVldFinalizado: 0, borCodEstornado: null });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(conexosClient.criarBordero).not.toHaveBeenCalled();
        expect(execucaoRepository.renameKey).not.toHaveBeenCalled();
        expect(out.resultados[0].status).toBe('skipped');
    });

    it('idempotência viva: settled MAS borderô CANCELADO → libera re-baixa', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        execucaoRepository.findByIdempotencyKey.mockResolvedValue({
            status: 'settled',
            borCod: 14707,
        });
        // borderô da baixa anterior foi CANCELADO (borVldFinalizado=2) → baixa nula.
        conexosClient.getBordero.mockResolvedValue({ borVldFinalizado: 2, borCodEstornado: null });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        // libera: PRESERVA a linha do cancelado (renomeia a chave) e executa uma baixa NOVA.
        expect(execucaoRepository.renameKey).toHaveBeenCalled();
        expect(conexosClient.criarBordero).toHaveBeenCalledTimes(1);
        expect(conexosClient.gravarBaixaPermuta).toHaveBeenCalledTimes(1);
        expect(out.resultados[0].status).toBe('settled');
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
            KEY,
            expect.objectContaining({ erroMensagem: 'ERP 500' }),
        );
        expect(out.resultados[0].status).toBe('error');
    });

    it('throws when adiantamento has no alocacoes', async () => {
        const { service, alocacaoRepository } = buildDeps();
        alocacaoRepository.listAtivas.mockResolvedValue([]);

        await expect(
            service.reconciliar({
                adiantamentoDocCod: '2767',
                executadoPor: 'yuri',
                dataMovto: 1,
            }),
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

    it('anti-drift (I-Write-1): aborts when the baixa exceeds the ERP em-aberto (over-pay)', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, execucaoRepository } = buildDeps();
        // baixa desejada = 1000 × 5.0 = 5000; em-aberto do ERP só 3000 → 5000 > 3000 → abort.
        conexosClient.validarTituloBaixa.mockResolvedValue({
            responseData: { bxaMnyValor: 3000 },
        });

        const out = await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        expect(conexosClient.gravarBaixaPermuta).not.toHaveBeenCalled();
        expect(execucaoRepository.markError).toHaveBeenCalledWith(
            KEY,
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

    it('rounds money to 2 decimals before the ERP (CnxValidatorMny precision_not_supported)', async () => {
        envFlags.conexosWriteEnabled = true;
        envFlags.conexosDryRun = false;
        const { service, conexosClient, alocacaoRepository } = buildDeps();
        // variação com ruído de ponto flutuante (caso real: 1000×(5.2887−4.9806)).
        alocacaoRepository.listAtivas.mockResolvedValue([
            buildAloc({ variacaoResultado: 308.1000000000005 }),
        ]);
        conexosClient.atualizarValorLiquido.mockResolvedValue({
            responseData: { bxaMnyLiquido: 5288.700000000001 },
        });

        await service.reconciliar({
            adiantamentoDocCod: '2767',
            executadoPor: 'yuri',
            dataMovto: 1,
        });

        // step 4 recebe o juros já arredondado
        expect(conexosClient.atualizarValorLiquido.mock.calls[0][0].juros).toBe(308.1);
        // payload final do step 5 sem ruído de FP
        const payload = conexosClient.gravarBaixaPermuta.mock.calls[0][0].payload;
        expect(payload.bxaMnyJuros).toBe(308.1);
        expect(payload.bxaMnyLiquido).toBe(5288.7);
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

        expect(execucaoRepository.setBorCod).toHaveBeenCalledWith(KEY, 1999);
    });
});
