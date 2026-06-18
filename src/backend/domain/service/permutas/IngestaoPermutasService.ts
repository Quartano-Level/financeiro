import { inject, injectable } from 'tsyringe';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import { ESTADO_ELEGIBILIDADE } from '../../interface/permutas/EstadoElegibilidade.js';
import type PermutaCandidata from '../../interface/permutas/PermutaCandidata.js';
import PermutaRelationalRepository, {
    type AdiantamentoRow,
    type CasamentoRow,
    type DeclaracaoRow,
    type IngestRunHeader,
    type InvoiceRow,
} from '../../repository/permutas/PermutaRelationalRepository.js';
import type { PermutaEleicaoRunInput } from '../../repository/permutas/PermutaSnapshotRepository.js';
import PermutaSnapshotRepository from '../../repository/permutas/PermutaSnapshotRepository.js';
import LogService from '../LogService.js';
import EleicaoPermutasService from './EleicaoPermutasService.js';

export interface IngestaoParams {
    /** Identidade auditável de quem disparou a ingestão (auditoria O6). */
    triggeredBy: string;
}

export interface IngestaoResult {
    runId: string;
    flowId: string;
    status: 'success' | 'error';
    totalAdiantamentos: number;
    totalInvoices: number;
    totalCasamentos: number;
    totalStale: number;
}

/**
 * Lock-key int32 estável da ingestão diária. Serializa o job × um eventual
 * trigger manual concorrente — só uma ingestão escreve o modelo relacional por
 * vez (os fatos last-good sobrevivem a um ROLLBACK).
 */
export const INGEST_LOCK_KEY = 918273645;

/**
 * IngestaoPermutasService — alimenta o modelo relacional (Fase B) a partir do
 * MESMO compute da eleição (`EleicaoPermutasService.computeCandidatas`).
 *
 * Fluxo (atômico, `withTransaction` + `withAdvisoryLock(INGEST_LOCK_KEY)`):
 *   1. cabeçalho de run `kind='ingest'`;
 *   2. UPSERT por chave natural dos fatos (adiantamento/invoice/declaração),
 *      carimbando `last_ingest_run_id`/`last_seen_at`/`stale=false`;
 *   3. recompute do casamento automático 1:1 (DELETE + INSERT);
 *   4. staleness sweep (`stale=true` no que não foi visto neste run);
 *   5. finaliza o cabeçalho com os totais.
 * Falha → ROLLBACK + cabeçalho `error` FORA da transação. Também grava o
 * snapshot (back-compat `/painel`) via `PermutaSnapshotRepository.persistRun`.
 */
@injectable()
export default class IngestaoPermutasService {
    constructor(
        @inject(EleicaoPermutasService) private eleicaoService: EleicaoPermutasService,
        @inject(PermutaRelationalRepository)
        private relationalRepository: PermutaRelationalRepository,
        @inject(PermutaSnapshotRepository)
        private snapshotRepository: PermutaSnapshotRepository,
        @inject(LogService) private logService: LogService,
    ) {}

    public executar = async (params: IngestaoParams): Promise<IngestaoResult> => {
        const { triggeredBy } = params;
        const startedAt = new Date();
        let flowId = '';

        try {
            const computed = await this.eleicaoService.computeCandidatas();
            flowId = computed.flowId;
            const { candidatas, totals } = computed;

            const adiantamentos = candidatas.map((c) => this.toAdiantamentoRow(c));
            const invoices = this.toInvoiceRows(candidatas);
            const declaracoes = this.toDeclaracaoRows(candidatas);
            const casamentos = this.toCasamentoRows(candidatas);

            const header: IngestRunHeader = {
                flowId,
                startedAt,
                finishedAt: new Date(),
                status: 'success',
                triggeredBy,
                totalAdiantamentos: adiantamentos.length,
                totalInvoices: invoices.length,
                totalCasamentos: casamentos.length,
                totalStale: 0,
            };

            let totalStale = 0;
            const runId = await this.relationalRepository.persistIngestRun(
                header,
                INGEST_LOCK_KEY,
                async (tx, currentRunId) => {
                    await this.relationalRepository.upsertAdiantamentos(
                        tx,
                        currentRunId,
                        adiantamentos,
                    );
                    await this.relationalRepository.upsertInvoices(tx, currentRunId, invoices);
                    await this.relationalRepository.upsertDeclaracoes(
                        tx,
                        currentRunId,
                        declaracoes,
                    );
                    await this.relationalRepository.replaceAutoCasamentos(
                        tx,
                        currentRunId,
                        casamentos,
                    );
                    totalStale = await this.relationalRepository.markStale(tx, currentRunId);
                },
            );

            // Back-compat `/painel`: mantém o snapshot de candidatas vivo.
            const snapshotInput: PermutaEleicaoRunInput = {
                flowId,
                startedAt,
                finishedAt: new Date(),
                status: 'success',
                triggeredBy,
                totalCandidatas: totals.totalCandidatas,
                totalElegiveis: totals.totalElegiveis,
                totalBloqueadas: totals.totalBloqueadas,
                bloqueadasByMotivo: totals.bloqueadasByMotivo,
            };
            await this.snapshotRepository.persistRun(snapshotInput, candidatas);

            await this.logService.info({
                type: LOG_TYPE.FLOW_COMPLETE,
                message: 'permuta ingest complete',
                data: {
                    flowId,
                    ingestRunId: runId,
                    totalAdiantamentos: adiantamentos.length,
                    totalInvoices: invoices.length,
                    totalCasamentos: casamentos.length,
                    totalStale,
                    durationMs: Date.now() - startedAt.getTime(),
                },
            });

            return {
                runId,
                flowId,
                status: 'success',
                totalAdiantamentos: adiantamentos.length,
                totalInvoices: invoices.length,
                totalCasamentos: casamentos.length,
                totalStale,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Cabeçalho de erro FORA da transação (a tx foi revertida — os fatos
            // last-good sobrevivem). Best-effort: uma falha aqui não mascara o
            // erro original.
            let runId = '';
            try {
                runId = await this.relationalRepository.insertIngestRunHeader({
                    flowId,
                    startedAt,
                    finishedAt: new Date(),
                    status: 'error',
                    triggeredBy,
                    totalAdiantamentos: 0,
                    totalInvoices: 0,
                    totalCasamentos: 0,
                    totalStale: 0,
                    errorMessage: message,
                });
            } catch {
                // engole — o erro original é re-lançado abaixo.
            }

            await this.logService.error({
                type: LOG_TYPE.FLOW_ERROR,
                message: 'permuta ingest aborted',
                error,
                data: { flowId, ingestRunId: runId, error: message },
            });
            throw error;
        }
    };

    private toAdiantamentoRow = (c: PermutaCandidata): AdiantamentoRow => ({
        docCod: c.adiantamento.docCod,
        priCod: c.priCod,
        ...(c.adiantamento.filCod != null ? { filCod: c.adiantamento.filCod } : {}),
        ...(c.adiantamento.referencia !== undefined
            ? { referencia: c.adiantamento.referencia }
            : {}),
        ...(c.adiantamento.exportador !== undefined
            ? { exportador: c.adiantamento.exportador }
            : {}),
        ...(c.adiantamento.dataEmissao !== undefined
            ? { dataEmissao: c.adiantamento.dataEmissao }
            : {}),
        ...(c.adiantamento.valor !== undefined ? { valor: c.adiantamento.valor } : {}),
        ...(c.adiantamento.valorMoedaNegociada !== undefined
            ? { valorMoedaNegociada: c.adiantamento.valorMoedaNegociada }
            : {}),
        ...(c.adiantamento.moeda !== undefined ? { moeda: c.adiantamento.moeda } : {}),
        pago: c.adiantamento.pago,
        ...(c.adiantamento.valorPermutar !== undefined
            ? { valorPermutar: c.adiantamento.valorPermutar }
            : {}),
        estadoElegibilidade: this.toEstadoRow(c.estadoElegibilidade),
        ...(c.motivoBloqueio !== undefined ? { motivoBloqueio: c.motivoBloqueio } : {}),
        ...(c.aging !== undefined ? { agingDays: c.aging } : {}),
    });

    /**
     * Mapeia o estado de elegibilidade do domínio para o valor da coluna
     * `permuta_adiantamento.estado_elegibilidade` (migration 0005 inclui
     * `casamento-manual` — ADR-0005). 1:1, sem normalização: o relacional carrega
     * o estado real (≠ snapshot, que colapsa N:M → bloqueada para o `/painel`).
     */
    private toEstadoRow = (
        estado: PermutaCandidata['estadoElegibilidade'],
    ): AdiantamentoRow['estadoElegibilidade'] => {
        switch (estado) {
            case ESTADO_ELEGIBILIDADE.ELEGIVEL:
                return 'elegivel';
            case ESTADO_ELEGIBILIDADE.CASAMENTO_MANUAL:
                return 'casamento-manual';
            case ESTADO_ELEGIBILIDADE.BLOQUEADA:
                return 'bloqueada';
            default:
                return 'descoberta';
        }
    };

    /** Invoices casadas, deduplicadas por `docCod` (uma invoice pode reaparecer). */
    private toInvoiceRows = (candidatas: PermutaCandidata[]): InvoiceRow[] => {
        const byDocCod = new Map<string, InvoiceRow>();
        for (const c of candidatas) {
            const inv = c.invoiceCasada;
            if (!inv) continue;
            byDocCod.set(inv.docCod, {
                docCod: inv.docCod,
                priCod: inv.priCod,
                ...(c.adiantamento.filCod != null ? { filCod: c.adiantamento.filCod } : {}),
                ...(inv.referencia !== undefined ? { referencia: inv.referencia } : {}),
                ...(inv.exportador !== undefined ? { exportador: inv.exportador } : {}),
                ...(inv.dataEmissao !== undefined ? { dataEmissao: inv.dataEmissao } : {}),
                ...(inv.valor !== undefined ? { valor: inv.valor } : {}),
                ...(inv.valorMoedaNegociada !== undefined
                    ? { valorMoedaNegociada: inv.valorMoedaNegociada }
                    : {}),
                ...(inv.moeda !== undefined ? { moeda: inv.moeda } : {}),
                pago: inv.pago,
            });
        }
        return [...byDocCod.values()];
    };

    /** Declarações, deduplicadas por `(priCod, variante)`. */
    private toDeclaracaoRows = (candidatas: PermutaCandidata[]): DeclaracaoRow[] => {
        const byKey = new Map<string, DeclaracaoRow>();
        for (const c of candidatas) {
            const d = c.declaracaoImportacao;
            if (!d) continue;
            const key = `${d.priCod}|${d.variante}`;
            byKey.set(key, {
                priCod: d.priCod,
                variante: d.variante,
                ...(d.dataBase !== undefined ? { dataBase: d.dataBase } : {}),
            });
        }
        return [...byKey.values()];
    };

    /** Casamentos automáticos 1:1 — só candidatas elegíveis com invoice casada. */
    private toCasamentoRows = (candidatas: PermutaCandidata[]): CasamentoRow[] => {
        const rows: CasamentoRow[] = [];
        for (const c of candidatas) {
            if (c.estadoElegibilidade !== ESTADO_ELEGIBILIDADE.ELEGIVEL || !c.invoiceCasada) {
                continue;
            }
            const vc = c.variacaoCambial;
            rows.push({
                invoiceDocCod: c.invoiceCasada.docCod,
                adiantamentoDocCod: c.adiantamento.docCod,
                priCod: c.priCod,
                ...(c.adiantamento.valorMoedaNegociada !== undefined
                    ? { valorASerUsado: c.adiantamento.valorMoedaNegociada }
                    : {}),
                ...(c.invoiceCasada.moeda !== undefined ? { moeda: c.invoiceCasada.moeda } : {}),
                ...(vc?.classificacao !== undefined
                    ? { variacaoClassificacao: vc.classificacao }
                    : {}),
                ...(vc?.resultado !== undefined ? { variacaoResultado: vc.resultado } : {}),
                ...(vc?.delta !== undefined ? { variacaoDelta: vc.delta } : {}),
                ...(vc?.taxaAdiantamento !== undefined
                    ? { taxaAdiantamento: vc.taxaAdiantamento }
                    : {}),
                ...(vc?.taxaInvoice !== undefined ? { taxaInvoice: vc.taxaInvoice } : {}),
            });
        }
        return rows;
    };
}
