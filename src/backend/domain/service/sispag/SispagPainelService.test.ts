import 'reflect-metadata';
import type ConexosBaseClient from '../../client/ConexosBaseClient.js';
import type ConexosSispagClient from '../../client/ConexosSispagClient.js';
import BoundedConcurrency from '../../libs/concurrency/BoundedConcurrency.js';
import type EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import type { LoteSispag, TituloAPagar } from '../../interface/sispag/SispagInterface.js';
import type LotePagamentoRepository from '../../repository/sispag/LotePagamentoRepository.js';
import type PagamentoIngestaoRunRepository from '../../repository/sispag/PagamentoIngestaoRunRepository.js';
import type TituloAPagarRepository from '../../repository/sispag/TituloAPagarRepository.js';
import type LogService from '../LogService.js';
import SispagPainelService from './SispagPainelService.js';

const DAY = 24 * 60 * 60 * 1000;

const titulo = (over: Partial<TituloAPagar> = {}): TituloAPagar => ({
    docCod: '100',
    titCod: '1',
    filCod: 2,
    valor: 1000,
    vencimento: Date.now() + 3 * DAY,
    liberado: true,
    pago: false,
    ...over,
});

const loteNativo = (): LoteSispag => ({
    filCod: 2,
    flpCod: 1,
    status: 1,
    envioConfirmado: true,
    retornoProcessado: false,
    titulosCount: 1,
    soma: 100,
    itensRetorno: 0,
});

const buildLog = () =>
    ({
        info: jest.fn().mockResolvedValue(undefined),
        warn: jest.fn().mockResolvedValue(undefined),
    }) as unknown as LogService & { warn: jest.Mock; info: jest.Mock };

const make = (
    over: {
        titulosAtivos?: TituloAPagar[];
        listLotes?: jest.Mock;
        ultimaRun?: Date | null;
        emRascunho?: Array<{ filCod: number; docCod: string; titCod: string }>;
        log?: LogService;
    } = {},
) => {
    const sispag = {
        listLotes: over.listLotes ?? jest.fn().mockResolvedValue([loteNativo()]),
    } as unknown as ConexosSispagClient;
    const base = {
        getFiliais: jest.fn().mockResolvedValue([{ filCod: 2 }, { filCod: 4 }]),
    } as unknown as ConexosBaseClient;
    const tituloRepo = {
        listAtivos: jest.fn().mockResolvedValue(over.titulosAtivos ?? [titulo()]),
    } as unknown as TituloAPagarRepository;
    const runRepo = {
        findLatestSuccessFinishedAt: jest
            .fn()
            .mockResolvedValue(over.ultimaRun ?? new Date('2026-07-08T06:00:00Z')),
    } as unknown as PagamentoIngestaoRunRepository;
    const loteRepo = {
        listTitulosEmRascunho: jest.fn().mockResolvedValue(over.emRascunho ?? []),
    } as unknown as LotePagamentoRepository;
    const env = {
        getEnvironmentVars: jest
            .fn()
            .mockResolvedValue({ conexosWriteEnabled: false, conexosDryRun: true }),
    } as unknown as EnvironmentProvider;
    const log = over.log ?? buildLog();
    const service = new SispagPainelService(
        sispag,
        base,
        new BoundedConcurrency(),
        tituloRepo,
        runRepo,
        loteRepo,
        env,
        log,
    );
    return { service, log };
};

describe('SispagPainelService.montarPainel', () => {
    it('lê títulos do banco (carteira), agrega contexto e marca somente-leitura', async () => {
        const { service } = make();
        const painel = await service.montarPainel();
        expect(painel.modo.somenteLeitura).toBe(true);
        expect(painel.modo.conexosWriteEnabled).toBe(false);
        // títulos vêm da carteira persistida (lista plana), não ×filiais
        expect(painel.titulos.length).toBe(1);
        expect(painel.kpis.titulosAVencer7d).toBe(1);
        // contexto ao vivo: 2 filiais × 1
        expect(painel.lotes.length).toBe(2);
        expect(painel.kpis.lotesEnviados).toBe(2);
        // proveniência da ingestão
        expect(painel.ingestao.ultimaRunEm).toBe('2026-07-08T06:00:00.000Z');
    });

    it('marca emLote nos títulos já num lote RASCUNHO', async () => {
        const { service } = make({
            titulosAtivos: [
                titulo({ docCod: '100', titCod: '1' }),
                titulo({ docCod: '200', titCod: '1' }),
            ],
            emRascunho: [{ filCod: 2, docCod: '100', titCod: '1' }],
        });
        const painel = await service.montarPainel();
        expect(painel.titulos.find((t) => t.docCod === '100')?.emLote).toBe(true);
        expect(painel.titulos.find((t) => t.docCod === '200')?.emLote).toBe(false);
    });

    it('tolera falha de UMA leitura de contexto (loga warn e segue)', async () => {
        const listLotes = jest
            .fn()
            .mockRejectedValueOnce(new Error('conexos 504'))
            .mockResolvedValue([loteNativo()]);
        const { service, log } = make({ listLotes });
        const painel = await service.montarPainel();
        expect(painel.titulos.length).toBe(1); // títulos do banco intactos
        expect((log as unknown as { warn: jest.Mock }).warn).toHaveBeenCalled();
    });

    it('não conta títulos pagos nos KPIs', async () => {
        const { service } = make({ titulosAtivos: [titulo({ pago: true })] });
        const painel = await service.montarPainel();
        expect(painel.titulos.length).toBe(0);
        expect(painel.kpis.titulosAVencer7d).toBe(0);
    });
});
