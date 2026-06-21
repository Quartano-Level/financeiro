import 'reflect-metadata';
import type { TransactionClient } from '../../client/database/PostgreeDatabaseClient.js';
import IngestLockBusyError from '../../errors/IngestLockBusyError.js';
import {
    ESTADO_ELEGIBILIDADE,
    MOTIVO_BLOQUEIO,
} from '../../interface/permutas/EstadoElegibilidade.js';
import type PermutaCandidata from '../../interface/permutas/PermutaCandidata.js';
import type PermutaRelationalRepository from '../../repository/permutas/PermutaRelationalRepository.js';
import type PermutaSnapshotRepository from '../../repository/permutas/PermutaSnapshotRepository.js';
import type EleicaoPermutasService from './EleicaoPermutasService.js';
import IngestaoPermutasService, { INGEST_LOCK_KEY } from './IngestaoPermutasService.js';
import type LogService from '../LogService.js';

type LogCall = { type: string; data?: Record<string, unknown> };

const buildLogService = () => {
    const calls: LogCall[] = [];
    const capture = jest.fn(async (p: LogCall) => {
        calls.push(p);
    });
    return {
        logService: {
            info: capture,
            warn: capture,
            error: capture,
            success: capture,
        } as unknown as LogService,
        calls,
    };
};

const elegivel: PermutaCandidata = {
    priCod: '2048',
    adiantamento: {
        docCod: 'A1',
        priCod: '2048',
        filCod: 2,
        dataEmissao: new Date('2026-03-01'),
        valor: 1000,
        moeda: 'BRL',
        moedaNegociada: 'USD',
        pago: true,
        valorPermutar: 1000,
        referencia: 'CT/1',
        exportador: 'DBP',
        valorMoedaNegociada: 1000,
    },
    invoiceCasada: {
        docCod: 'I1',
        priCod: '2048',
        dataEmissao: new Date('2026-04-01'),
        valor: 1000,
        moeda: 'BRL',
        moedaNegociada: 'USD',
        pago: false,
        referencia: 'INV/1',
        valorMoedaNegociada: 1000,
    },
    declaracaoImportacao: { priCod: '2048', variante: 'DI' },
    variacaoCambial: {
        moeda: 'USD',
        principalMoeda: 1000,
        taxaAdiantamento: 5.31,
        taxaInvoice: 5.19,
        delta: 120,
        resultado: 120,
        classificacao: 'JUROS',
        contaContabil: '131',
    },
    estadoElegibilidade: ESTADO_ELEGIBILIDADE.ELEGIVEL,
    aging: 30,
    gatesAvaliados: [],
};

const bloqueada: PermutaCandidata = {
    priCod: '3000',
    adiantamento: {
        docCod: 'A2',
        priCod: '3000',
        filCod: 7,
        dataEmissao: new Date('2026-03-01'),
        valor: 500,
        moeda: 'USD',
        pago: true,
    },
    estadoElegibilidade: ESTADO_ELEGIBILIDADE.BLOQUEADA,
    motivoBloqueio: MOTIVO_BLOQUEIO.SEM_INVOICE,
    gatesAvaliados: [],
};

const casamentoManual: PermutaCandidata = {
    priCod: '4000',
    adiantamento: {
        docCod: 'A3',
        priCod: '4000',
        filCod: 2,
        dataEmissao: new Date('2026-03-01'),
        valor: 2000,
        moeda: 'USD',
        pago: true,
        valorPermutar: 2000,
    },
    estadoElegibilidade: ESTADO_ELEGIBILIDADE.CASAMENTO_MANUAL,
    motivoBloqueio: MOTIVO_BLOQUEIO.COMPOSTO_NM,
    gatesAvaliados: [],
};

const permutaManual: PermutaCandidata = {
    priCod: '1153',
    adiantamento: {
        docCod: 'A9',
        priCod: '1153',
        filCod: 2,
        dataEmissao: new Date('2026-02-23'),
        valor: 5910,
        moeda: 'USD',
        pago: true,
        valorPermutar: 1100,
        pesCod: '191',
        importador: 'INOX-TECH',
    },
    estadoElegibilidade: ESTADO_ELEGIBILIDADE.PERMUTA_MANUAL,
    motivoBloqueio: MOTIVO_BLOQUEIO.CLIENTE_FILTRO,
    gatesAvaliados: [],
};

const buildEleicao = (candidatas: PermutaCandidata[]) =>
    ({
        computeCandidatas: jest.fn().mockResolvedValue({
            candidatas,
            flowId: 'flow-1',
            totals: {
                totalCandidatas: candidatas.length,
                totalElegiveis: candidatas.filter(
                    (c) => c.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL,
                ).length,
                totalBloqueadas: candidatas.filter(
                    (c) => c.estadoElegibilidade === ESTADO_ELEGIBILIDADE.BLOQUEADA,
                ).length,
                bloqueadasByMotivo: {},
            },
        }),
    }) as unknown as jest.Mocked<EleicaoPermutasService>;

const buildRelational = () => {
    const tx = {
        insert: jest.fn(),
        update: jest.fn(),
        selectMany: jest.fn(),
        selectFirst: jest.fn(),
    } as unknown as TransactionClient;
    const repo = {
        persistIngestRun: jest.fn(
            async (
                _header: unknown,
                _lockKey: number,
                write: (t: TransactionClient, runId: string) => Promise<void>,
            ) => {
                await write(tx, 'ingest-run-1');
                return 'ingest-run-1';
            },
        ),
        insertIngestRunHeader: jest.fn().mockResolvedValue('error-run-1'),
        upsertAdiantamentos: jest.fn().mockResolvedValue(undefined),
        upsertInvoices: jest.fn().mockResolvedValue(undefined),
        upsertDeclaracoes: jest.fn().mockResolvedValue(undefined),
        replaceAutoCasamentos: jest.fn().mockResolvedValue(undefined),
        markStale: jest.fn().mockResolvedValue(3),
    } as unknown as jest.Mocked<PermutaRelationalRepository>;
    return { repo, tx };
};

const buildSnapshot = () =>
    ({
        persistRun: jest.fn().mockResolvedValue('snap-1'),
    }) as unknown as jest.Mocked<PermutaSnapshotRepository>;

describe('IngestaoPermutasService', () => {
    it('persists facts + auto casamento + sweep under the ingest lock, plus snapshot back-compat', async () => {
        const eleicao = buildEleicao([elegivel, bloqueada]);
        const { repo } = buildRelational();
        const snapshot = buildSnapshot();
        const { logService } = buildLogService();
        const service = new IngestaoPermutasService(eleicao, repo, snapshot, logService);

        const result = await service.executar({ triggeredBy: 'cron' });

        expect(result.status).toBe('success');
        expect(result.runId).toBe('ingest-run-1');
        // 2 adiantamentos, 1 invoice (only elegivel had one), 1 casamento.
        expect(result.totalAdiantamentos).toBe(2);
        expect(result.totalInvoices).toBe(1);
        expect(result.totalCasamentos).toBe(1);
        expect(result.totalStale).toBe(3);

        // Persisted under the ingest advisory lock.
        expect(repo.persistIngestRun).toHaveBeenCalledTimes(1);
        expect(repo.persistIngestRun.mock.calls[0][1]).toBe(INGEST_LOCK_KEY);

        // Write phase: upserts → recompute casamento → sweep, in order.
        expect(repo.upsertAdiantamentos).toHaveBeenCalledTimes(1);
        expect(repo.upsertInvoices).toHaveBeenCalledTimes(1);
        expect(repo.upsertDeclaracoes).toHaveBeenCalledTimes(1);
        expect(repo.replaceAutoCasamentos).toHaveBeenCalledTimes(1);
        expect(repo.markStale).toHaveBeenCalledTimes(1);

        // Casamento carries the VC sign-fixed classification (JUROS) and the
        // NEGOCIADA currency (USD) — not the doc currency (BRL).
        const casamentoRows = repo.replaceAutoCasamentos.mock.calls[0][2];
        expect(casamentoRows).toHaveLength(1);
        expect(casamentoRows[0]).toMatchObject({
            invoiceDocCod: 'I1',
            adiantamentoDocCod: 'A1',
            variacaoClassificacao: 'JUROS',
            variacaoResultado: 120,
            moeda: 'USD',
        });

        // moeda NEGOCIADA (USD) maps onto the fact rows distinctly from the doc
        // moeda (BRL), so the Gestão column labels the value as USD.
        const adiantamentoRows = repo.upsertAdiantamentos.mock.calls[0][2];
        expect(adiantamentoRows[0]).toMatchObject({ moeda: 'BRL', moedaNegociada: 'USD' });
        const invoiceRows = repo.upsertInvoices.mock.calls[0][2];
        expect(invoiceRows[0]).toMatchObject({ moeda: 'BRL', moedaNegociada: 'USD' });

        // Back-compat: snapshot persisted too.
        expect(snapshot.persistRun).toHaveBeenCalledTimes(1);
    });

    it('only elegivel-with-invoice candidatas become auto casamentos', async () => {
        const eleicao = buildEleicao([elegivel, bloqueada]);
        const { repo } = buildRelational();
        const service = new IngestaoPermutasService(
            eleicao,
            repo,
            buildSnapshot(),
            buildLogService().logService,
        );

        await service.executar({ triggeredBy: 'cron' });
        const adiantamentoRows = repo.upsertAdiantamentos.mock.calls[0][2];
        expect(adiantamentoRows.map((r) => r.docCod).sort()).toEqual(['A1', 'A2']);
        const invoiceRows = repo.upsertInvoices.mock.calls[0][2];
        expect(invoiceRows.map((r) => r.docCod)).toEqual(['I1']);
    });

    it('persists estado_elegibilidade=casamento-manual for N:M candidatas (ADR-0005)', async () => {
        const eleicao = buildEleicao([elegivel, casamentoManual]);
        const { repo } = buildRelational();
        const service = new IngestaoPermutasService(
            eleicao,
            repo,
            buildSnapshot(),
            buildLogService().logService,
        );

        await service.executar({ triggeredBy: 'cron' });

        const adiantamentoRows = repo.upsertAdiantamentos.mock.calls[0][2];
        const nmRow = adiantamentoRows.find((r) => r.docCod === 'A3');
        expect(nmRow?.estadoElegibilidade).toBe('casamento-manual');
        expect(nmRow?.motivoBloqueio).toBe('composto-nm');
        // N:M não vira casamento automático (só elegível com invoice casada).
        expect(repo.replaceAutoCasamentos.mock.calls[0][2]).toHaveLength(1);
    });

    it('lock busy: rethrows IngestLockBusyError WITHOUT writing an error run (ADR-0006)', async () => {
        const eleicao = buildEleicao([elegivel]);
        const { repo } = buildRelational();
        // Advisory lock held by another ingestion → persistIngestRun rejects.
        (repo.persistIngestRun as jest.Mock).mockRejectedValue(new IngestLockBusyError());
        const snapshot = buildSnapshot();
        const { logService, calls } = buildLogService();
        const service = new IngestaoPermutasService(eleicao, repo, snapshot, logService);

        await expect(service.executar({ triggeredBy: 'simone' })).rejects.toBeInstanceOf(
            IngestLockBusyError,
        );

        // Lock contention is NOT a failure: no error run header, no snapshot, no
        // error log polluting the audit trail.
        expect(repo.insertIngestRunHeader).not.toHaveBeenCalled();
        expect(snapshot.persistRun).not.toHaveBeenCalled();
        expect(calls.some((c) => c.type === 'FLOW_ERROR')).toBe(false);
    });

    it('persiste estado permuta-manual + pesCod/importador na row (cliente-filtro)', async () => {
        const eleicao = buildEleicao([permutaManual]);
        const { repo } = buildRelational();
        const service = new IngestaoPermutasService(
            eleicao,
            repo,
            buildSnapshot(),
            buildLogService().logService,
        );

        await service.executar({ triggeredBy: 'cron' });

        const rows = repo.upsertAdiantamentos.mock.calls[0][2];
        const row = rows.find((r) => r.docCod === 'A9');
        expect(row?.estadoElegibilidade).toBe('permuta-manual');
        expect(row?.pesCod).toBe('191');
        expect(row?.importador).toBe('INOX-TECH');
    });

    it('on compute failure: ROLLBACK (no write) + error header outside tx, rethrows', async () => {
        const boom = new Error('conexos down');
        const eleicao = {
            computeCandidatas: jest.fn().mockRejectedValue(boom),
        } as unknown as jest.Mocked<EleicaoPermutasService>;
        const { repo } = buildRelational();
        const snapshot = buildSnapshot();
        const { logService, calls } = buildLogService();
        const service = new IngestaoPermutasService(eleicao, repo, snapshot, logService);

        await expect(service.executar({ triggeredBy: 'cron' })).rejects.toThrow('conexos down');

        // No relational write happened.
        expect(repo.persistIngestRun).not.toHaveBeenCalled();
        // Error header written OUTSIDE the tx.
        expect(repo.insertIngestRunHeader).toHaveBeenCalledTimes(1);
        expect(repo.insertIngestRunHeader.mock.calls[0][0]).toMatchObject({
            status: 'error',
            errorMessage: 'conexos down',
        });
        // No snapshot on failure.
        expect(snapshot.persistRun).not.toHaveBeenCalled();
        expect(calls.some((c) => c.type !== undefined)).toBe(true);
    });
});
