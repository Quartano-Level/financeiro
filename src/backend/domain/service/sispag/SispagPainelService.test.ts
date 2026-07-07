import 'reflect-metadata';
import type ConexosBaseClient from '../../client/ConexosBaseClient.js';
import type ConexosSispagClient from '../../client/ConexosSispagClient.js';
import BoundedConcurrency from '../../libs/concurrency/BoundedConcurrency.js';
import type EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import type {
    BorderoAPagar,
    LoteSispag,
    TituloAPagar,
} from '../../interface/sispag/SispagInterface.js';
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

const bordero = (): BorderoAPagar => ({
    borCod: 1,
    filCod: 2,
    valor: 100,
    finalizado: 3,
    temRemessa: false,
    temBaixa: true,
});

const buildLog = () =>
    ({
        info: jest.fn().mockResolvedValue(undefined),
        warn: jest.fn().mockResolvedValue(undefined),
    }) as unknown as LogService & { warn: jest.Mock; info: jest.Mock };

const make = (
    over: {
        listTitulosAPagar?: jest.Mock;
        listLotes?: jest.Mock;
        listBorderosAPagar?: jest.Mock;
        log?: LogService;
    } = {},
) => {
    const sispag = {
        listTitulosAPagar: over.listTitulosAPagar ?? jest.fn().mockResolvedValue([titulo()]),
        listLotes: over.listLotes ?? jest.fn().mockResolvedValue([loteNativo()]),
        listBorderosAPagar: over.listBorderosAPagar ?? jest.fn().mockResolvedValue([bordero()]),
    } as unknown as ConexosSispagClient;
    const base = {
        getFiliais: jest.fn().mockResolvedValue([{ filCod: 2 }, { filCod: 4 }]),
    } as unknown as ConexosBaseClient;
    const env = {
        getEnvironmentVars: jest
            .fn()
            .mockResolvedValue({ conexosWriteEnabled: false, conexosDryRun: true }),
    } as unknown as EnvironmentProvider;
    const log = over.log ?? buildLog();
    const service = new SispagPainelService(sispag, base, new BoundedConcurrency(), env, log);
    return { service, log };
};

describe('SispagPainelService.montarPainel', () => {
    it('agrega leituras, calcula KPIs e marca somente-leitura', async () => {
        const { service } = make();
        const painel = await service.montarPainel();
        expect(painel.modo.somenteLeitura).toBe(true);
        expect(painel.modo.conexosWriteEnabled).toBe(false);
        // 2 filiais × 1 título liberado vencendo em 3d
        expect(painel.kpis.titulosAVencer7d).toBe(2);
        expect(painel.titulos.length).toBe(2);
        expect(painel.lotes.length).toBe(2);
        expect(painel.borderos.length).toBe(2);
        expect(painel.kpis.lotesEnviados).toBe(2);
        expect(painel.kpis.borderosViaRemessa).toBe(0);
    });

    it('tolera falha de UMA leitura (loga warn e segue)', async () => {
        const listTitulosAPagar = jest
            .fn()
            .mockResolvedValueOnce([titulo()]) // filial 2 ok
            .mockRejectedValueOnce(new Error('conexos 504')); // filial 4 falha
        const { service, log } = make({ listTitulosAPagar });
        const painel = await service.montarPainel();
        expect(painel.titulos.length).toBe(1);
        expect((log as unknown as { warn: jest.Mock }).warn).toHaveBeenCalled();
    });

    it('não conta títulos pagos nos KPIs', async () => {
        const listTitulosAPagar = jest.fn().mockResolvedValue([titulo({ pago: true })]);
        const { service } = make({ listTitulosAPagar });
        const painel = await service.montarPainel();
        expect(painel.titulos.length).toBe(0);
        expect(painel.kpis.titulosAVencer7d).toBe(0);
    });
});
