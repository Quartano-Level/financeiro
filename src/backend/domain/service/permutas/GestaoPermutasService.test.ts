import 'reflect-metadata';
import type {
    AdiantamentoAtivo,
    CasamentoRow,
    InvoiceRow,
} from '../../repository/permutas/PermutaRelationalRepository.js';
import type PermutaRelationalRepository from '../../repository/permutas/PermutaRelationalRepository.js';
import type PermutaProcessamentoRepository from '../../repository/permutas/PermutaProcessamentoRepository.js';
import type { Processamento } from '../../interface/permutas/Processamento.js';
import GestaoPermutasService from './GestaoPermutasService.js';
import type LogService from '../LogService.js';

const buildLog = () => ({ info: jest.fn().mockResolvedValue(undefined) }) as unknown as LogService;

const adiantamentos: AdiantamentoAtivo[] = [
    {
        docCod: 'A1',
        priCod: '2048',
        filCod: 2,
        referencia: 'CT/1',
        exportador: 'DBP',
        valorMoedaNegociada: 1000,
        moeda: 'USD',
        pago: true,
        estadoElegibilidade: 'elegivel',
        agingDays: 31,
        stale: false,
    },
    {
        docCod: 'A2',
        priCod: '3000',
        filCod: 7,
        valorMoedaNegociada: 0,
        pago: true,
        estadoElegibilidade: 'bloqueada',
        motivoBloqueio: 'sem-invoice',
        stale: false,
    },
];

const invoices: InvoiceRow[] = [
    {
        docCod: 'I1',
        priCod: '2048',
        filCod: 2,
        referencia: 'INV/1',
        exportador: 'DBP',
        valorMoedaNegociada: 1000,
        moeda: 'USD',
        pago: false,
    },
];

const casamentos: CasamentoRow[] = [
    {
        invoiceDocCod: 'I1',
        adiantamentoDocCod: 'A1',
        priCod: '2048',
        valorASerUsado: 1000,
        moeda: 'USD',
        variacaoClassificacao: 'JUROS',
    },
];

const buildRelational = (over?: {
    adiantamentos?: AdiantamentoAtivo[];
    invoices?: InvoiceRow[];
    casamentos?: CasamentoRow[];
}) =>
    ({
        listAdiantamentosAtivos: jest.fn().mockResolvedValue(over?.adiantamentos ?? adiantamentos),
        listInvoicesEmAberto: jest.fn().mockResolvedValue(over?.invoices ?? invoices),
        listCasamentos: jest.fn().mockResolvedValue(over?.casamentos ?? casamentos),
    }) as unknown as jest.Mocked<PermutaRelationalRepository>;

const buildProcessamento = (rows: Processamento[] = []) =>
    ({
        listProcessamentos: jest.fn().mockResolvedValue(rows),
    }) as unknown as jest.Mocked<PermutaProcessamentoRepository>;

describe('GestaoPermutasService.exporGestao', () => {
    it('builds the exact GestaoPermutasResponse shape, fonte=banco', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildLog(),
        );

        const res = await service.exporGestao('req-1');

        expect(res.fonte).toBe('banco');
        expect(typeof res.geradoEm).toBe('string');
        expect(res.pendentes).toHaveLength(2);
        expect(res.invoicesEmAberto).toHaveLength(1);
        expect(res.casamentos).toHaveLength(1);
        expect(res.totais).toEqual({
            pendentes: 2,
            invoicesEmAberto: 1,
            elegiveis: 1,
            bloqueadas: 1,
        });
    });

    it('maps aging_days→diasEmAberto and defaults missing fields', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const elegivel = res.pendentes.find((p) => p.docCod === 'A1');
        expect(elegivel).toMatchObject({
            referencia: 'CT/1',
            exportador: 'DBP',
            valorMoedaNegociada: 1000,
            diasEmAberto: 31,
            status: 'elegivel',
        });
        const bloqueada = res.pendentes.find((p) => p.docCod === 'A2');
        // No aging → null; missing referencia falls back to docCod.
        expect(bloqueada?.diasEmAberto).toBeNull();
        expect(bloqueada?.referencia).toBe('A2');
        expect(bloqueada?.motivoBloqueio).toBe('sem-invoice');
    });

    it('groups casamentos by invoice and attaches adiantamento referencia', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        expect(res.casamentos[0].invoice).toMatchObject({ docCod: 'I1', referencia: 'INV/1' });
        expect(res.casamentos[0].adiantamentos[0]).toMatchObject({
            docCod: 'A1',
            referencia: 'CT/1',
            valorASerUsado: 1000,
        });
    });

    it('surfaces processamentoStatus on pendentes and casamento adiantamentos', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento([
                { adiantamentoDocCod: 'A1', status: 'processado', processadoPor: 'u' },
            ]),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        expect(res.pendentes.find((p) => p.docCod === 'A1')?.processamentoStatus).toBe(
            'processado',
        );
        expect(res.casamentos[0].adiantamentos[0].processamentoStatus).toBe('processado');
    });
});
