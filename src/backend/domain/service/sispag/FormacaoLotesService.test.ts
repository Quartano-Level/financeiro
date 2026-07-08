import 'reflect-metadata';
import type PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import IngestLockBusyError from '../../errors/IngestLockBusyError.js';
import type { TituloAPagar } from '../../interface/sispag/SispagInterface.js';
import type LotePagamentoRepository from '../../repository/sispag/LotePagamentoRepository.js';
import type TituloAPagarRepository from '../../repository/sispag/TituloAPagarRepository.js';
import type LogService from '../LogService.js';
import FormacaoLotesService from './FormacaoLotesService.js';

const titulo = (over: Partial<TituloAPagar> = {}): TituloAPagar => ({
    docCod: '100',
    titCod: '1',
    filCod: 2,
    valor: 1000,
    liberado: true,
    pago: false,
    banco: 'ITAÚ',
    internacional: false,
    ...over,
});

const buildLog = () => ({ info: jest.fn().mockResolvedValue(undefined) }) as unknown as LogService;

const make = (over: { elegiveis?: TituloAPagar[]; desfeitos?: number; acquire?: boolean } = {}) => {
    const tituloRepo = {
        listElegiveisParaFormacao: jest.fn().mockResolvedValue(over.elegiveis ?? []),
    };
    const loteRepo = {
        desfazerAutomaticosVencidos: jest.fn().mockResolvedValue(over.desfeitos ?? 0),
        criarLote: jest.fn().mockResolvedValue({ id: 'L1' }),
        adicionarItens: jest.fn().mockResolvedValue(undefined),
        tocarLote: jest.fn().mockResolvedValue(undefined),
    };
    const acquire = over.acquire ?? true;
    const db = {
        withAdvisoryLock: jest.fn(
            (_k: number, onAcquired: () => Promise<unknown>, onBusy: () => Promise<unknown>) =>
                acquire ? onAcquired() : onBusy(),
        ),
        withTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    } as unknown as PostgreeDatabaseClient;
    const service = new FormacaoLotesService(
        tituloRepo as unknown as TituloAPagarRepository,
        loteRepo as unknown as LotePagamentoRepository,
        db,
        buildLog(),
    );
    return { service, tituloRepo, loteRepo };
};

describe('FormacaoLotesService', () => {
    it('agrupa por filial × classe (banco não conta) e forma um lote por grupo (automatico=true)', async () => {
        const elegiveis = [
            titulo({ docCod: '1', filCod: 2, banco: 'ITAÚ', internacional: false }),
            titulo({ docCod: '2', filCod: 2, banco: 'ITAÚ', internacional: false }), // mesmo grupo
            titulo({ docCod: '3', filCod: 2, banco: 'ITAÚ', internacional: true }), // classe difere
            titulo({ docCod: '4', filCod: 4, banco: 'ITAÚ', internacional: false }), // filial difere
            titulo({ docCod: '5', filCod: 2, banco: 'C6', internacional: false }), // banco NÃO separa
        ];
        const { service, loteRepo } = make({ elegiveis });
        const r = await service.formar({ triggeredBy: 'cron' });
        // grupos: (2,N)={1,2,5}, (2,I)={3}, (4,N)={4} = 3 lotes
        expect(r).toMatchObject({ lotesFormados: 3, titulosLotados: 5, lotesDesfeitos: 0 });
        expect(loteRepo.criarLote).toHaveBeenCalledTimes(3);
        expect(loteRepo.adicionarItens).toHaveBeenCalledTimes(3);
        // total de itens inseridos = 5 (soma dos itens por lote)
        const totalItens = loteRepo.adicionarItens.mock.calls.reduce(
            (acc: number, call: unknown[]) => acc + (call[1] as unknown[]).length,
            0,
        );
        expect(totalItens).toBe(5);
        for (const call of loteRepo.criarLote.mock.calls) {
            expect(call[0]).toMatchObject({ automatico: true });
        }
    });

    it('fatia grupos grandes em lotes de no máx. 25 títulos (revisão humana)', async () => {
        const elegiveis = Array.from({ length: 30 }, (_, i) =>
            titulo({ docCod: String(i + 1), filCod: 2, internacional: false }),
        );
        const { service, loteRepo } = make({ elegiveis });
        const r = await service.formar({ triggeredBy: 'cron' });
        // 30 no mesmo grupo → 25 + 5 = 2 lotes
        expect(r.lotesFormados).toBe(2);
        expect(r.titulosLotados).toBe(30);
        expect(loteRepo.criarLote).toHaveBeenCalledTimes(2);
    });

    it('desfaz os lotes automáticos vencidos antes de formar (conta no resultado)', async () => {
        const { service, loteRepo } = make({ elegiveis: [titulo()], desfeitos: 3 });
        const r = await service.formar({ triggeredBy: 'cron' });
        expect(loteRepo.desfazerAutomaticosVencidos).toHaveBeenCalled();
        expect(r.lotesDesfeitos).toBe(3);
        expect(r.lotesFormados).toBe(1);
    });

    it('sem elegíveis: nenhum lote formado', async () => {
        const { service, loteRepo } = make({ elegiveis: [] });
        const r = await service.formar({ triggeredBy: 'cron' });
        expect(r.lotesFormados).toBe(0);
        expect(loteRepo.criarLote).not.toHaveBeenCalled();
    });

    it('lock ocupado — outra formação rodando vira IngestLockBusyError', async () => {
        const { service } = make({ acquire: false });
        await expect(service.formar({ triggeredBy: 'cron' })).rejects.toBeInstanceOf(
            IngestLockBusyError,
        );
    });
});
