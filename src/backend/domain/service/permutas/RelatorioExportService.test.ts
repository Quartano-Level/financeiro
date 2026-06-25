import 'reflect-metadata';
import ExcelJS from 'exceljs';
import type { GestaoPermutasResponse } from '../../interface/permutas/Gestao.js';
import type GestaoPermutasService from './GestaoPermutasService.js';
import type LogService from '../LogService.js';
import RelatorioExportService from './RelatorioExportService.js';

const buildLog = () => ({ info: jest.fn().mockResolvedValue(undefined) }) as unknown as LogService;

/** GestaoPermutasResponse de teste: 1 elegível, 1 bloqueada, 1 já-permutado, 1 manual + 2 invoices. */
const gestao: GestaoPermutasResponse = {
    geradoEm: '2026-06-24T09:00:00.000Z',
    fonte: 'banco',
    pendentes: [
        {
            docCod: 'A1',
            filCod: 2,
            referencia: 'CT/1',
            exportador: 'DBP',
            importador: 'ACME',
            valorMoedaNegociada: 1000,
            valorBrl: 5000,
            moeda: 'USD',
            diasEmAberto: 30,
            status: 'elegivel',
            tipoPermuta: 'simples',
            detalhe: {
                priCod: '2048',
                pago: true,
                dataEmissao: '2026-05-01T00:00:00.000Z',
                valorPermutar: 5000,
                valorTotal: 5000,
                valorAberto: 0,
                declaracao: { variante: 'DI', dataBase: '2026-05-10T00:00:00.000Z' },
                taxaAdiantamento: 5.1,
                taxaInvoice: 5.0,
                variacaoClassificacao: 'JUROS',
                variacaoResultado: 100,
                variacaoDelta: 0.1,
            },
        },
        {
            docCod: 'A2',
            filCod: 7,
            referencia: 'CT/2',
            exportador: 'JINDAL',
            importador: 'ACME',
            valorMoedaNegociada: null,
            valorBrl: 1000,
            moeda: 'USD',
            diasEmAberto: 90,
            status: 'bloqueada',
            motivoBloqueio: 'sem-invoice',
            detalhe: { priCod: '3000', pago: true, valorTotal: 1000, valorAberto: 400 },
        },
        {
            docCod: 'A3',
            filCod: 2,
            referencia: 'CT/3',
            exportador: 'DBP',
            importador: 'GLOBEX',
            valorMoedaNegociada: 2000,
            valorBrl: 10000,
            moeda: 'USD',
            diasEmAberto: 10,
            status: 'ja-permutado',
            motivoBloqueio: 'ja-permutado',
            detalhe: { priCod: '2048', pago: true },
        },
        {
            docCod: 'A4',
            filCod: 2,
            referencia: 'CT/4',
            exportador: 'VE STAAL',
            importador: 'GLOBEX',
            valorMoedaNegociada: 3000,
            valorBrl: 15000,
            moeda: 'USD',
            diasEmAberto: null,
            status: 'permuta-manual',
            tipoPermuta: 'cross-process',
            saldoRestante: 1500,
            detalhe: { priCod: '4000', pago: true },
        },
    ],
    invoicesEmAberto: [
        {
            docCod: 'I1',
            filCod: 2,
            priCod: '2048',
            dataEmissao: '2026-05-02T00:00:00.000Z',
            referencia: 'INV/1',
            exportador: 'DBP',
            importador: 'ACME',
            valorMoedaNegociada: 800,
            valorBrl: 4000,
            moeda: 'USD',
            taxa: 5.0,
        },
        {
            docCod: 'I2',
            filCod: 7,
            priCod: '3000',
            referencia: 'INV/2',
            exportador: 'JINDAL',
            valorMoedaNegociada: 1200,
            valorBrl: 6000,
            moeda: 'USD',
        },
    ],
    casamentos: [],
    totais: {
        pendentes: 4,
        invoicesEmAberto: 2,
        elegiveis: 1,
        bloqueadas: 1,
        casamentoManual: 0,
        permutaManual: 1,
        jaPermutado: 1,
    },
};

const buildService = () => {
    const gestaoService = {
        exporGestao: jest.fn().mockResolvedValue(gestao),
    } as unknown as jest.Mocked<GestaoPermutasService>;
    const service = new RelatorioExportService(gestaoService, buildLog());
    return { service, gestaoService };
};

/** Acha a linha (record) cujo `docCod` bate. */
const linhaPorDoc = (def: ReturnType<RelatorioExportService['montarDefinicao']>, doc: string) =>
    def.linhas.find((l) => l.docCod === doc);

describe('RelatorioExportService.montarDefinicao', () => {
    it('adiantamentos: 1 linha por pendente, com detalhe achatado', () => {
        const { service } = buildService();
        const def = service.montarDefinicao('adiantamentos', gestao);
        expect(def.tipo).toBe('adiantamentos');
        expect(def.linhas).toHaveLength(4);
        const a1 = linhaPorDoc(def, 'A1');
        expect(a1).toMatchObject({
            filCod: 2,
            priCod: '2048',
            importador: 'ACME',
            status: 'elegivel',
            tipoPermuta: 'simples',
            valorMoedaNegociada: 1000,
            valorBrl: 5000,
            pago: true,
            dataEmissao: '2026-05-01',
            declaracao: 'DI',
            declaracaoDataBase: '2026-05-10',
            taxaAdiantamento: 5.1,
            variacaoClassificacao: 'JUROS',
            autoElegivel: false,
        });
        // Campos ausentes viram null (não undefined) — célula em branco no Excel.
        const a2 = linhaPorDoc(def, 'A2');
        expect(a2?.valorMoedaNegociada).toBeNull();
        expect(a2?.declaracao).toBeNull();
        expect(a2?.motivoBloqueio).toBe('sem-invoice');
    });

    it('ja-permutado: filtra só os status ja-permutado', () => {
        const { service } = buildService();
        const def = service.montarDefinicao('ja-permutado', gestao);
        expect(def.linhas).toHaveLength(1);
        expect(def.linhas[0]?.docCod).toBe('A3');
    });

    it('bloqueadas: filtra só os status bloqueada', () => {
        const { service } = buildService();
        const def = service.montarDefinicao('bloqueadas', gestao);
        expect(def.linhas).toHaveLength(1);
        expect(def.linhas[0]?.docCod).toBe('A2');
    });

    it('invoices: 1 linha por invoice em aberto', () => {
        const { service } = buildService();
        const def = service.montarDefinicao('invoices', gestao);
        expect(def.linhas).toHaveLength(2);
        expect(linhaPorDoc(def, 'I1')).toMatchObject({
            priCod: '2048',
            dataEmissao: '2026-05-02',
            importador: 'ACME',
            valorMoedaNegociada: 800,
            taxa: 5.0,
        });
        // Invoice sem importador/taxa → null.
        const i2 = linhaPorDoc(def, 'I2');
        expect(i2?.importador).toBeNull();
        expect(i2?.taxa).toBeNull();
    });

    it('reconciliacao-processo: agrega por priCod com cardinalidade e cobertura', () => {
        const { service } = buildService();
        const def = service.montarDefinicao('reconciliacao-processo', gestao);
        // Processos: 2048 (A1+A3, I1), 3000 (A2, I2), 4000 (A4, sem invoice).
        const p2048 = def.linhas.find((l) => l.priCod === '2048');
        expect(p2048).toMatchObject({
            numAdtos: 2,
            numInvoices: 1,
            cardinalidade: 'N:1',
            saldoAdtosUsd: 3000, // 1000 (A1) + 2000 (A3)
            somaInvoicesUsd: 800,
            elegiveis: 1,
            jaPermutado: 1,
        });
        const p4000 = def.linhas.find((l) => l.priCod === '4000');
        expect(p4000).toMatchObject({
            numInvoices: 0,
            cardinalidade: 'sem-invoice',
            coberturaPct: null, // sem invoice → sem cobertura
            manual: 1,
            agingMedio: null, // A4 tem diasEmAberto null
        });
    });

    it('clientes: agrega por importador com totais e contagens', () => {
        const { service } = buildService();
        const def = service.montarDefinicao('clientes', gestao);
        const acme = def.linhas.find((l) => l.importador === 'ACME');
        expect(acme).toMatchObject({
            numAdtos: 2, // A1, A2
            numInvoices: 1, // I1
            valorAdtosUsd: 1000, // A1=1000, A2=null
            valorAdtosBrl: 6000, // 5000 + 1000
            elegiveis: 1,
            bloqueadas: 1,
        });
        const globex = def.linhas.find((l) => l.importador === 'GLOBEX');
        expect(globex).toMatchObject({ numAdtos: 2, jaPermutado: 1, permutaManual: 1 });
        // Invoice I2 não tem importador → bucket "(sem importador)".
        expect(def.linhas.some((l) => l.importador === '(sem importador)')).toBe(true);
    });
});

describe('RelatorioExportService.exportar', () => {
    it('devolve filename derivado da data de ingestão + buffer xlsx legível', async () => {
        const { service, gestaoService } = buildService();
        const { filename, buffer } = await service.exportar('adiantamentos', 'req-1');
        expect(gestaoService.exporGestao).toHaveBeenCalledWith('req-1');
        expect(filename).toBe('permutas-adiantamentos-2026-06-24.xlsx');
        expect(buffer.length).toBeGreaterThan(0);

        // Relê o buffer no exceljs: a aba e o header devem bater com a definição.
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer as unknown as ArrayBuffer);
        const sheet = wb.getWorksheet('Adiantamentos pendentes');
        expect(sheet).toBeDefined();
        expect(sheet?.getRow(1).getCell(1).value).toBe('Documento');
        // header + 4 linhas de dados.
        expect(sheet?.rowCount).toBe(5);
    });

    it('usa "snapshot" no filename quando não há data de ingestão', async () => {
        const gestaoSemData: GestaoPermutasResponse = { ...gestao };
        delete (gestaoSemData as { geradoEm?: string }).geradoEm;
        const gestaoService = {
            exporGestao: jest.fn().mockResolvedValue(gestaoSemData),
        } as unknown as jest.Mocked<GestaoPermutasService>;
        const service = new RelatorioExportService(gestaoService, buildLog());
        const { filename } = await service.exportar('clientes', 'req-2');
        expect(filename).toBe('permutas-clientes-snapshot.xlsx');
    });
});
