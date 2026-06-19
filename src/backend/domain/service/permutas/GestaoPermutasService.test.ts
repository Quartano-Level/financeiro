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
    {
        // N:M — passou os 4 gates, aguarda escolha de invoice (ADR-0005).
        docCod: 'A3',
        priCod: '4000',
        filCod: 2,
        referencia: 'CT/3',
        exportador: 'JINDAL',
        valorMoedaNegociada: 2000,
        moeda: 'USD',
        pago: true,
        estadoElegibilidade: 'casamento-manual',
        motivoBloqueio: 'composto-nm',
        agingDays: 12,
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
        expect(res.pendentes).toHaveLength(3);
        expect(res.invoicesEmAberto).toHaveLength(1);
        expect(res.casamentos).toHaveLength(1);
        // ADR-0005: N:M (A3) conta em casamentoManual, NÃO em bloqueadas.
        expect(res.totais).toEqual({
            pendentes: 3,
            invoicesEmAberto: 1,
            elegiveis: 1,
            bloqueadas: 1,
            casamentoManual: 1,
            jaPermutado: 0,
        });
    });

    it('maps casamento-manual estado → status casamento-manual (ADR-0005)', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const nm = res.pendentes.find((p) => p.docCod === 'A3');
        expect(nm?.status).toBe('casamento-manual');
        expect(nm?.motivoBloqueio).toBe('composto-nm');
        // Não vaza para bloqueada nem elegível.
        expect(res.pendentes.find((p) => p.docCod === 'A2')?.status).toBe('bloqueada');
        expect(res.pendentes.find((p) => p.docCod === 'A1')?.status).toBe('elegivel');
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

    it('labels valorMoedaNegociada with the NEGOCIADA currency (USD), not the doc currency (BRL)', async () => {
        // Bug fix: the column shows the value in the foreign (negotiated) currency,
        // so its label must be the negotiated sigla (USD), never the doc moeda (BRL).
        const adtoBrlDocUsdNeg: AdiantamentoAtivo = {
            docCod: 'A9',
            priCod: '9000',
            filCod: 2,
            referencia: 'CT/9',
            valorMoedaNegociada: 1100,
            moeda: 'BRL',
            moedaNegociada: 'USD',
            pago: true,
            estadoElegibilidade: 'elegivel',
            stale: false,
        };
        const invBrlDocUsdNeg: InvoiceRow = {
            docCod: 'I9',
            priCod: '9000',
            filCod: 2,
            referencia: 'INV/9',
            valorMoedaNegociada: 1100,
            moeda: 'BRL',
            moedaNegociada: 'USD',
            pago: false,
        };
        const casamentoUsdNeg: CasamentoRow = {
            invoiceDocCod: 'I9',
            adiantamentoDocCod: 'A9',
            priCod: '9000',
            valorASerUsado: 1100,
            // even if the casamento row carried BRL, the read adiantamento wins.
            moeda: 'BRL',
        };
        const service = new GestaoPermutasService(
            buildRelational({
                adiantamentos: [adtoBrlDocUsdNeg],
                invoices: [invBrlDocUsdNeg],
                casamentos: [casamentoUsdNeg],
            }),
            buildProcessamento(),
            buildLog(),
        );

        const res = await service.exporGestao('req-1');

        expect(res.pendentes.find((p) => p.docCod === 'A9')?.moeda).toBe('USD');
        expect(res.invoicesEmAberto.find((i) => i.docCod === 'I9')?.moeda).toBe('USD');
        expect(res.casamentos[0].invoice.moeda).toBe('USD');
        expect(res.casamentos[0].adiantamentos[0].moeda).toBe('USD');
    });

    it('groups casamentos by invoice and attaches adiantamento referencia', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        // priCod (processo) — número em comum invoice×adiantamento, exibido na tela.
        expect(res.casamentos[0].priCod).toBe('2048');
        expect(res.casamentos[0].invoice).toMatchObject({ docCod: 'I1', referencia: 'INV/1' });
        expect(res.casamentos[0].adiantamentos[0]).toMatchObject({
            docCod: 'A1',
            referencia: 'CT/1',
            valorASerUsado: 1000,
        });
    });

    it('promotes BLOQUEADA+motivo ja-permutado to its OWN status (out of bloqueadas)', async () => {
        // Doc pago + 100% consumido em permuta anterior: gravado como bloqueada
        // com motivo `ja-permutado`. Na tela vira status próprio `ja-permutado`,
        // NÃO conta em bloqueadas (estado concluído, não erro).
        const jaPermutado: AdiantamentoAtivo = {
            docCod: '8266',
            priCod: '5000',
            filCod: 2,
            referencia: 'CT/8266',
            exportador: 'HUAIAN HAOYANG',
            valorMoedaNegociada: 70570,
            moeda: 'USD',
            pago: true,
            estadoElegibilidade: 'bloqueada',
            motivoBloqueio: 'ja-permutado',
            agingDays: 156,
            stale: false,
        };
        const service = new GestaoPermutasService(
            buildRelational({ adiantamentos: [...adiantamentos, jaPermutado] }),
            buildProcessamento(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        expect(res.pendentes.find((p) => p.docCod === '8266')?.status).toBe('ja-permutado');
        expect(res.totais.jaPermutado).toBe(1);
        // A2 segue bloqueada; o já-permutado NÃO entra na contagem de bloqueadas.
        expect(res.totais.bloqueadas).toBe(1);
    });

    it('attaches candidatas (invoices em aberto do mesmo priCod) ONLY to casamento-manual', async () => {
        // A3 é N:M (priCod 4000) com 2 invoices em aberto no processo → candidatas.
        const candidatasInvoices: InvoiceRow[] = [
            ...invoices,
            {
                docCod: 'I3a',
                priCod: '4000',
                filCod: 2,
                referencia: 'INV/3a',
                exportador: 'JINDAL',
                valorMoedaNegociada: 1200,
                moeda: 'USD',
                pago: false,
            },
            {
                docCod: 'I3b',
                priCod: '4000',
                filCod: 2,
                referencia: 'INV/3b',
                exportador: 'JINDAL',
                valorMoedaNegociada: 800,
                moeda: 'USD',
                pago: false,
            },
        ];
        const service = new GestaoPermutasService(
            buildRelational({ invoices: candidatasInvoices }),
            buildProcessamento(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const nm = res.pendentes.find((p) => p.docCod === 'A3');
        expect(nm?.candidatas?.map((c) => c.docCod)).toEqual(['I3a', 'I3b']);
        // Elegível e bloqueada NÃO carregam candidatas.
        expect(res.pendentes.find((p) => p.docCod === 'A1')?.candidatas).toBeUndefined();
        expect(res.pendentes.find((p) => p.docCod === 'A2')?.candidatas).toBeUndefined();
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
