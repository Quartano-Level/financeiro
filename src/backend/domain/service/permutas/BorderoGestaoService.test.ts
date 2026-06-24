import 'reflect-metadata';
import BorderoGestaoService from './BorderoGestaoService.js';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
    idempotencyKey: 'k',
    adiantamentoDocCod: '9027',
    invoiceDocCod: '18779',
    filCod: 2,
    status: 'settled',
    dryRun: false,
    borCod: 14699,
    bxaCodSeq: 1,
    valorBaixado: 99.61,
    juros: 6.16,
    contaJuros: 131,
    executadoPor: 'yuri',
    criadoEm: new Date('2026-06-23T19:39:17Z'),
    atualizadoEm: new Date('2026-06-23T19:39:17Z'),
    ...over,
});

const build = (getBorderoImpl: jest.Mock) => {
    const conexosClient = {
        getBordero: getBorderoImpl,
        listBorderos: jest.fn().mockResolvedValue([]),
        listBaixas: jest.fn().mockResolvedValue([]),
        excluirBaixa: jest.fn(),
        excluirBordero: jest.fn(),
        finalizarBordero: jest.fn(),
        cancelarBordero: jest.fn(),
        estornarBordero: jest.fn(),
    };
    const environmentProvider = {
        getEnvironmentVars: jest
            .fn()
            .mockResolvedValue({ conexosWriteEnabled: true, conexosFilCod: 2 }),
    };
    const execucaoRepository = {
        listComBordero: jest.fn(),
        findByBorCodInvoice: jest.fn(),
        deleteByBorCodInvoice: jest.fn().mockResolvedValue(1),
        countByBorCod: jest.fn().mockResolvedValue(1),
        listByBorCod: jest.fn(),
        deleteByBorCod: jest.fn().mockResolvedValue(1),
    };
    const logService = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const service = new BorderoGestaoService(
        conexosClient as never,
        environmentProvider as never,
        execucaoRepository as never,
        logService as never,
    );
    return { service, conexosClient, environmentProvider, execucaoRepository };
};

describe('BorderoGestaoService', () => {
    it('lista a partir do ERP (fonte), enriquece baixas da trilha e soma o total', async () => {
        const { service, conexosClient, execucaoRepository } = build(jest.fn());
        conexosClient.listBorderos.mockResolvedValue([
            { borCod: 14699, filCod: 2, borVldFinalizado: 1, borCodEstornado: null },
        ]);
        execucaoRepository.listComBordero.mockResolvedValue([
            row({ borCod: 14699, invoiceDocCod: '18779', valorBaixado: 99.61 }),
            row({ borCod: 14699, invoiceDocCod: '18780', valorBaixado: 99.61 }),
        ]);

        const out = await service.listarBorderos();

        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            borCod: 14699,
            filCod: 2,
            situacao: 'FINALIZADO',
            finalizado: true,
            estornado: false,
            totalBaixado: 199.22,
        });
        expect(out[0].baixas).toHaveLength(2);
    });

    it('situação vem de borVldFinalizado; estorno (borCodEstornado) REABRE p/ em cadastro', async () => {
        const { service, conexosClient, execucaoRepository } = build(jest.fn());
        conexosClient.listBorderos.mockResolvedValue([
            { borCod: 14699, filCod: 2, borVldFinalizado: 1, borCodEstornado: null }, // finalizado
            { borCod: 14676, filCod: 2, borVldFinalizado: 2, borCodEstornado: null }, // cancelado
            { borCod: 14674, filCod: 2, borVldFinalizado: 0, borCodEstornado: 555 }, // estornado → em cadastro
        ]);
        execucaoRepository.listComBordero.mockResolvedValue([]);

        const out = await service.listarBorderos();
        const byCod = Object.fromEntries(out.map((b) => [b.borCod, b.situacao]));
        expect(byCod[14699]).toBe('FINALIZADO');
        expect(byCod[14676]).toBe('CANCELADO');
        expect(byCod[14674]).toBe('EM_CADASTRO'); // estorno reabre — finalizável de novo
        // ordenado por borCod desc
        expect(out.map((b) => b.borCod)).toEqual([14699, 14676, 14674]);
    });

    it('mostra borderô CANCELADO do ERP mesmo SEM trilha local (divergência)', async () => {
        const { service, conexosClient, execucaoRepository } = build(jest.fn());
        conexosClient.listBorderos.mockResolvedValue([
            {
                borCod: 14707,
                filCod: 2,
                borVldFinalizado: 2,
                borCodEstornado: null,
                vlrTotalLiquido: 199.22,
            },
        ]);
        execucaoRepository.listComBordero.mockResolvedValue([]); // trilha apagada

        const out = await service.listarBorderos();

        expect(out).toHaveLength(1);
        expect(out[0]).toMatchObject({
            borCod: 14707,
            situacao: 'CANCELADO',
            totalBaixado: 199.22,
        });
        expect(out[0].baixas).toHaveLength(0);
    });

    it('best-effort: falha ao listar no ERP → lista vazia (não quebra)', async () => {
        const { service, conexosClient, execucaoRepository } = build(jest.fn());
        conexosClient.listBorderos.mockRejectedValue(new Error('ERP down'));
        execucaoRepository.listComBordero.mockResolvedValue([row({ borCod: 14699 })]);

        const out = await service.listarBorderos();

        expect(out).toEqual([]);
    });

    describe('excluirBaixa', () => {
        it('exclui no ERP (filCod/bxaCodSeq da trilha) e remove a linha local', async () => {
            const { service, conexosClient, execucaoRepository } = build(jest.fn());
            execucaoRepository.findByBorCodInvoice.mockResolvedValue(
                row({ borCod: 14707, invoiceDocCod: '18780', filCod: 2, bxaCodSeq: 1 }),
            );

            const out = await service.excluirBaixa({
                borCod: 14707,
                invoiceDocCod: '18780',
                executadoPor: 'yuri',
            });

            expect(conexosClient.excluirBaixa).toHaveBeenCalledWith({
                filCod: 2,
                borCod: 14707,
                invoiceDocCod: 18780,
                titCod: 1,
                bxaCodSeq: 1,
            });
            expect(execucaoRepository.deleteByBorCodInvoice).toHaveBeenCalledWith(14707, '18780');
            expect(out).toMatchObject({ excluido: true });
        });

        it('apaga o borderô no ERP quando a baixa removida era a última (count=0)', async () => {
            const { service, conexosClient, execucaoRepository } = build(jest.fn());
            execucaoRepository.findByBorCodInvoice.mockResolvedValue(
                row({ borCod: 14707, invoiceDocCod: '18780', filCod: 2, bxaCodSeq: 1 }),
            );
            execucaoRepository.countByBorCod.mockResolvedValue(0);

            const out = await service.excluirBaixa({
                borCod: 14707,
                invoiceDocCod: '18780',
                executadoPor: 'yuri',
            });

            expect(conexosClient.excluirBordero).toHaveBeenCalledWith({ filCod: 2, borCod: 14707 });
            expect(out).toMatchObject({ borderoExcluido: true });
        });

        it('NÃO apaga o borderô quando ainda há baixas (count>0)', async () => {
            const { service, conexosClient, execucaoRepository } = build(jest.fn());
            execucaoRepository.findByBorCodInvoice.mockResolvedValue(
                row({ borCod: 14707, invoiceDocCod: '18780', filCod: 2, bxaCodSeq: 1 }),
            );
            execucaoRepository.countByBorCod.mockResolvedValue(1);

            const out = await service.excluirBaixa({
                borCod: 14707,
                invoiceDocCod: '18780',
                executadoPor: 'yuri',
            });

            expect(conexosClient.excluirBordero).not.toHaveBeenCalled();
            expect(out).toMatchObject({ borderoExcluido: false });
        });

        it('excluirBordero: enumera baixas do ERP, remove cada uma + o borderô e limpa a trilha', async () => {
            const { service, conexosClient, execucaoRepository } = build(
                jest.fn().mockResolvedValue({ borVldFinalizado: 0, borCodEstornado: null }),
            );
            conexosClient.listBaixas.mockResolvedValue([
                { filCod: 2, docCod: 18779, titCod: 1, bxaCodSeq: 1 },
                { filCod: 2, docCod: 18780, titCod: 1, bxaCodSeq: 1 },
            ]);

            const out = await service.excluirBordero({
                borCod: 14707,
                executadoPor: 'yuri',
                filCod: 2,
            });

            expect(conexosClient.excluirBaixa).toHaveBeenCalledTimes(2);
            expect(conexosClient.excluirBordero).toHaveBeenCalledWith({ filCod: 2, borCod: 14707 });
            expect(execucaoRepository.deleteByBorCod).toHaveBeenCalledWith(14707);
            expect(out).toMatchObject({ excluido: true, baixasExcluidas: 2 });
        });

        it('excluirBordero: funciona p/ borderô FORA da trilha (filCod do request)', async () => {
            const { service, conexosClient, execucaoRepository } = build(
                jest.fn().mockResolvedValue({ borVldFinalizado: 0, borCodEstornado: null }),
            );
            execucaoRepository.listByBorCod.mockResolvedValue([]); // sem trilha
            conexosClient.listBaixas.mockResolvedValue([
                { filCod: 2, docCod: 18779, titCod: 1, bxaCodSeq: 1 },
            ]);

            const out = await service.excluirBordero({
                borCod: 14709,
                executadoPor: 'admin',
                filCod: 2,
            });

            expect(conexosClient.excluirBaixa).toHaveBeenCalledTimes(1);
            expect(conexosClient.excluirBordero).toHaveBeenCalledWith({ filCod: 2, borCod: 14709 });
            expect(out).toMatchObject({ excluido: true, baixasExcluidas: 1 });
        });

        it('finalizarBordero: aprova no ERP quando em cadastro', async () => {
            const { service, conexosClient, execucaoRepository } = build(
                jest.fn().mockResolvedValue({ borVldFinalizado: 0, borCodEstornado: null }),
            );
            execucaoRepository.listByBorCod.mockResolvedValue([row({ borCod: 14707, filCod: 2 })]);

            const out = await service.finalizarBordero({ borCod: 14707, executadoPor: 'yuri' });

            expect(conexosClient.finalizarBordero).toHaveBeenCalledWith({
                filCod: 2,
                borCod: 14707,
            });
            expect(out).toMatchObject({ finalizado: true });
        });

        it('cancelarBordero: cancela no ERP quando em cadastro', async () => {
            const { service, conexosClient, execucaoRepository } = build(
                jest.fn().mockResolvedValue({ borVldFinalizado: 0, borCodEstornado: null }),
            );
            execucaoRepository.listByBorCod.mockResolvedValue([row({ borCod: 14707, filCod: 2 })]);

            const out = await service.cancelarBordero({ borCod: 14707, executadoPor: 'yuri' });

            expect(conexosClient.cancelarBordero).toHaveBeenCalledWith({
                filCod: 2,
                borCod: 14707,
            });
            expect(out).toMatchObject({ cancelado: true });
        });

        it('estornarBordero: estorna no ERP quando finalizado', async () => {
            const { service, conexosClient, execucaoRepository } = build(
                jest.fn().mockResolvedValue({ borVldFinalizado: 1, borCodEstornado: null }),
            );
            execucaoRepository.listByBorCod.mockResolvedValue([row({ borCod: 14708, filCod: 2 })]);

            const out = await service.estornarBordero({ borCod: 14708, executadoPor: 'yuri' });

            expect(conexosClient.estornarBordero).toHaveBeenCalledWith({
                filCod: 2,
                borCod: 14708,
            });
            expect(out).toMatchObject({ estornado: true });
        });

        it('bloqueia quando a escrita está desabilitada', async () => {
            const { service, conexosClient, environmentProvider } = build(jest.fn());
            environmentProvider.getEnvironmentVars.mockResolvedValue({
                conexosWriteEnabled: false,
            });

            await expect(
                service.excluirBaixa({ borCod: 1, invoiceDocCod: '2', executadoPor: 'y' }),
            ).rejects.toThrow(/desabilitada/);
            expect(conexosClient.excluirBaixa).not.toHaveBeenCalled();
        });

        it('erro quando a baixa não está na trilha', async () => {
            const { service, execucaoRepository } = build(jest.fn());
            execucaoRepository.findByBorCodInvoice.mockResolvedValue(null);

            await expect(
                service.excluirBaixa({ borCod: 9, invoiceDocCod: '9', executadoPor: 'y' }),
            ).rejects.toThrow(/não encontrada/);
        });
    });
});
