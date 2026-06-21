import 'reflect-metadata';
import type {
    AdiantamentoAtivo,
    CasamentoRow,
    DeclaracaoRow,
    InvoiceRow,
} from '../../repository/permutas/PermutaRelationalRepository.js';
import type PermutaRelationalRepository from '../../repository/permutas/PermutaRelationalRepository.js';
import type PermutaProcessamentoRepository from '../../repository/permutas/PermutaProcessamentoRepository.js';
import type PermutaAlocacaoRepository from '../../repository/permutas/PermutaAlocacaoRepository.js';
import type { AlocacaoRow } from '../../repository/permutas/PermutaAlocacaoRepository.js';
import type { Processamento } from '../../interface/permutas/Processamento.js';
import GestaoPermutasService from './GestaoPermutasService.js';
import type LogService from '../LogService.js';

const buildLog = () => ({ info: jest.fn().mockResolvedValue(undefined) }) as unknown as LogService;

const buildAlocacao = (rows: AlocacaoRow[] = []) =>
    ({
        listAtivas: jest.fn().mockResolvedValue(rows),
    }) as unknown as jest.Mocked<PermutaAlocacaoRepository>;

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
        valorTotal: 1000,
        valorAberto: 400,
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

const permutaManualAdto: AdiantamentoAtivo = {
    docCod: 'A9',
    priCod: '1153',
    filCod: 2,
    referencia: 'CT199/25',
    exportador: 'VE STAAL',
    valorMoedaNegociada: 50000,
    moeda: 'USD',
    pago: true,
    estadoElegibilidade: 'permuta-manual',
    motivoBloqueio: 'cliente-filtro',
    pesCod: '191',
    importador: 'INOX-TECH',
    stale: false,
};

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
        taxaAdiantamento: 5.31,
        taxaInvoice: 5.19,
    },
];

const declaracoes: DeclaracaoRow[] = [
    { priCod: '2048', variante: 'DI', dataBase: new Date('2026-03-15') },
];

const buildRelational = (over?: {
    adiantamentos?: AdiantamentoAtivo[];
    invoices?: InvoiceRow[];
    casamentos?: CasamentoRow[];
    declaracoes?: DeclaracaoRow[];
}) =>
    ({
        listAdiantamentosAtivos: jest.fn().mockResolvedValue(over?.adiantamentos ?? adiantamentos),
        listInvoicesEmAberto: jest.fn().mockResolvedValue(over?.invoices ?? invoices),
        listCasamentos: jest.fn().mockResolvedValue(over?.casamentos ?? casamentos),
        listDeclaracoes: jest.fn().mockResolvedValue(over?.declaracoes ?? declaracoes),
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
            buildAlocacao(),
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
            permutaManual: 0,
            jaPermutado: 0,
        });
    });

    it('maps casamento-manual estado → status casamento-manual (ADR-0005)', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildAlocacao(),
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

    it('classifica tipoPermuta: simples (elegível), multiplas (1 adto N:M), cross-process', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');
        // A1 elegível → simples; A3 casamento-manual sozinho no priCod 4000 → multiplas.
        expect(res.pendentes.find((p) => p.docCod === 'A1')?.tipoPermuta).toBe('simples');
        expect(res.pendentes.find((p) => p.docCod === 'A3')?.tipoPermuta).toBe('multiplas');
        // A2 bloqueada → sem tipo.
        expect(res.pendentes.find((p) => p.docCod === 'A2')?.tipoPermuta).toBeUndefined();
    });

    it('classifica cross-over quando o processo tem >1 adiantamento casamento-manual', async () => {
        // Dois adtos casamento-manual no MESMO priCod (5000) → cross-over (N:M).
        const nm1: AdiantamentoAtivo = {
            docCod: 'X1',
            priCod: '5000',
            filCod: 2,
            valorMoedaNegociada: 100,
            moeda: 'USD',
            pago: true,
            estadoElegibilidade: 'casamento-manual',
            stale: false,
        };
        const nm2: AdiantamentoAtivo = { ...nm1, docCod: 'X2' };
        const service = new GestaoPermutasService(
            buildRelational({ adiantamentos: [nm1, nm2] }),
            buildProcessamento(),
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');
        expect(res.pendentes.find((p) => p.docCod === 'X1')?.tipoPermuta).toBe('cross-over');
        expect(res.pendentes.find((p) => p.docCod === 'X2')?.tipoPermuta).toBe('cross-over');
    });

    it('anexa saldoRestante + alocações também a casamento-manual (múltiplas/cross-over)', async () => {
        // casamento-manual com saldo 4400 BRL / taxa 5.5 = 800 USD; alocado 300 → resta 500.
        const nm: AdiantamentoAtivo = {
            docCod: 'M1',
            priCod: '6000',
            filCod: 2,
            valorMoedaNegociada: 800,
            moeda: 'USD',
            pago: true,
            estadoElegibilidade: 'casamento-manual',
            valorPermutar: 4400,
            taxa: 5.5,
            stale: false,
        };
        const service = new GestaoPermutasService(
            buildRelational({ adiantamentos: [nm] }),
            buildProcessamento(),
            buildAlocacao([
                {
                    adiantamentoDocCod: 'M1',
                    invoiceDocCod: 'INV-X',
                    valorAlocado: 300,
                    moeda: 'USD',
                    criadoEm: new Date('2026-06-21T10:00:00Z'),
                },
            ]),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');
        const pm = res.pendentes.find((p) => p.docCod === 'M1');
        expect(pm?.alocacoes).toHaveLength(1);
        expect(pm?.saldoRestante).toBeCloseTo(500, 5);
    });

    it('classifica cross-process para permuta-manual (cliente-filtro)', async () => {
        const service = new GestaoPermutasService(
            buildRelational({ adiantamentos: [...adiantamentos, permutaManualAdto] }),
            buildProcessamento(),
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');
        expect(res.pendentes.find((p) => p.docCod === 'A9')?.tipoPermuta).toBe('cross-process');
    });

    it('maps aging_days→diasEmAberto and defaults missing fields', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildAlocacao(),
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
            buildAlocacao(),
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
            buildAlocacao(),
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
            buildAlocacao(),
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
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const nm = res.pendentes.find((p) => p.docCod === 'A3');
        expect(nm?.candidatas?.map((c) => c.docCod)).toEqual(['I3a', 'I3b']);
        // Elegível e bloqueada NÃO carregam candidatas.
        expect(res.pendentes.find((p) => p.docCod === 'A1')?.candidatas).toBeUndefined();
        expect(res.pendentes.find((p) => p.docCod === 'A2')?.candidatas).toBeUndefined();
    });

    it('anexa alocações + saldoRestante ao permuta-manual', async () => {
        // adto A9: saldo a permutar 5500 BRL / taxa 5.5 = 1000 USD; alocado 600 → resta 400.
        const adto = { ...permutaManualAdto, valorPermutar: 5500, taxa: 5.5 };
        const service = new GestaoPermutasService(
            buildRelational({ adiantamentos: [...adiantamentos, adto] }),
            buildProcessamento(),
            buildAlocacao([
                {
                    adiantamentoDocCod: 'A9',
                    invoiceDocCod: 'I7',
                    invoicePriCod: '510',
                    valorAlocado: 600,
                    moeda: 'USD',
                    variacaoClassificacao: 'JUROS',
                    variacaoResultado: 120,
                    criadoEm: new Date('2026-06-20T10:00:00Z'),
                },
            ]),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const pm = res.pendentes.find((p) => p.docCod === 'A9');
        expect(pm?.alocacoes).toHaveLength(1);
        expect(pm?.alocacoes?.[0]).toMatchObject({ invoiceDocCod: 'I7', valorAlocado: 600 });
        expect(pm?.saldoRestante).toBeCloseTo(400, 5);
    });

    it('mapeia estado permuta-manual para status próprio + conta no total', async () => {
        const service = new GestaoPermutasService(
            buildRelational({ adiantamentos: [...adiantamentos, permutaManualAdto] }),
            buildProcessamento(),
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const pm = res.pendentes.find((p) => p.docCod === 'A9');
        expect(pm?.status).toBe('permuta-manual');
        expect(pm?.motivoBloqueio).toBe('cliente-filtro');
        expect(res.totais.permutaManual).toBe(1);
    });

    it('builds detalhe: priCod/pago + declaracao (DI) + taxa/variacao for matched (A1)', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento(),
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        const a1 = res.pendentes.find((p) => p.docCod === 'A1');
        expect(a1?.detalhe?.priCod).toBe('2048');
        expect(a1?.detalhe?.pago).toBe(true);
        expect(a1?.detalhe?.declaracao?.variante).toBe('DI');
        expect(typeof a1?.detalhe?.declaracao?.dataBase).toBe('string');
        expect(a1?.detalhe?.taxaAdiantamento).toBe(5.31);
        expect(a1?.detalhe?.taxaInvoice).toBe(5.19);
        expect(a1?.detalhe?.variacaoClassificacao).toBe('JUROS');

        // A2 (bloqueada, processo 3000 sem declaração e sem casamento): detalhe
        // existe mas sem declaracao/taxa.
        const a2 = res.pendentes.find((p) => p.docCod === 'A2');
        expect(a2?.detalhe?.priCod).toBe('3000');
        expect(a2?.detalhe?.declaracao).toBeUndefined();
        expect(a2?.detalhe?.taxaAdiantamento).toBeUndefined();
        // Progresso de pagamento (face + saldo em aberto) flui ao detalhe.
        expect(a2?.detalhe?.valorTotal).toBe(1000);
        expect(a2?.detalhe?.valorAberto).toBe(400);
    });

    it('surfaces processamentoStatus on pendentes and casamento adiantamentos', async () => {
        const service = new GestaoPermutasService(
            buildRelational(),
            buildProcessamento([
                { adiantamentoDocCod: 'A1', status: 'processado', processadoPor: 'u' },
            ]),
            buildAlocacao(),
            buildLog(),
        );
        const res = await service.exporGestao('req-1');

        expect(res.pendentes.find((p) => p.docCod === 'A1')?.processamentoStatus).toBe(
            'processado',
        );
        expect(res.casamentos[0].adiantamentos[0].processamentoStatus).toBe('processado');
    });
});
