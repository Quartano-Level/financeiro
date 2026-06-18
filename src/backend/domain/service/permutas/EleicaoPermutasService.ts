import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import ConexosClient, { type DeclaracaoEntry } from '../../client/ConexosClient.js';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import ConexosError from '../../errors/ConexosError.js';
import BoundedConcurrency from '../../libs/concurrency/BoundedConcurrency.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import type Adiantamento from '../../interface/permutas/Adiantamento.js';
import {
    ESTADO_ELEGIBILIDADE,
    MOTIVO_BLOQUEIO,
} from '../../interface/permutas/EstadoElegibilidade.js';
import { GATE } from '../../interface/permutas/PermutaCandidata.js';
import type Invoice from '../../interface/permutas/Invoice.js';
import type PermutaCandidata from '../../interface/permutas/PermutaCandidata.js';
import LogService from '../LogService.js';
import PermutaSnapshotRepository, {
    type PermutaEleicaoRunInput,
} from '../../repository/permutas/PermutaSnapshotRepository.js';
import AgingService from './AgingService.js';
import ElegibilidadeService from './ElegibilidadeService.js';
import VariacaoCambialPermutaService from './VariacaoCambialPermutaService.js';

export interface EleicaoResult {
    runId: string;
    flowId: string;
    totalCandidatas: number;
    totalElegiveis: number;
    totalBloqueadas: number;
    bloqueadasByMotivo: Record<string, number>;
    status: 'success' | 'error';
    candidatas: PermutaCandidata[];
    /** `true` quando a run foi REAPROVEITADA via Idempotency-Key (P0-6) — não
     * houve novo fan-out Conexos. Ausente/`false` numa run fresca. */
    idempotentReplay?: boolean;
}

export interface EleicaoParams {
    /** Identidade auditável de quem disparou a run (auditoria O6). */
    triggeredBy: string;
    /**
     * `Idempotency-Key` (header HTTP) — P0-6. Quando presente, um segundo
     * request com a mesma key (dentro de 24h, ou concorrente) retorna a run
     * existente em vez de disparar um novo fan-out Conexos.
     */
    idempotencyKey?: string;
}

/**
 * Deriva um lock-key int32 estável a partir da `Idempotency-Key` (string) para
 * `pg_try_advisory_lock` (P0-6). djb2 truncado em 31 bits → cabe em `integer`.
 */
const advisoryLockKey = (key: string): number => {
    let hash = 5381;
    for (let i = 0; i < key.length; i += 1) {
        hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 2147483647;
};

const PAGE_SIZE = 500;
const MAX_PAGES = 50;

/** Limites de concorrência do fan-out Conexos (P0-4). Mantêm o paralelismo sob
 * controle para não estourar a sessão do ERP (LOGIN_ERROR_MAX_SESSIONS). */
const FILIAIS_CONCURRENCY = 5;
const ADIANTAMENTOS_CONCURRENCY = 10;

/**
 * EleicaoPermutasService — orquestrador da cadeia (o "job", sem scheduler — O4):
 *   elegerAdiantamentos → avaliarElegibilidade → casarInvoice
 *   → calcularVariacaoCambial → aging → snapshot/auditoria.
 *
 * Ontology: `ontology/actions/eleger-adiantamentos.md` + state-machine.
 * Idempotente (P0-7): recomputa o backlog do zero a cada run. Multi-filial (I6).
 * Observabilidade (ObservabilityAdvisor): `flowId` por execução em TODA linha de
 * log e propagado ao snapshot; FLOW_START / FLOW_COMPLETE (uma linha-resumo) /
 * FLOW_ERROR; BUSINESS_WARN cap-hit. Atomicidade: abort → 0 snapshot rows.
 */
@injectable()
export default class EleicaoPermutasService {
    constructor(
        @inject(ConexosClient) private conexosClient: ConexosClient,
        @inject(ElegibilidadeService) private elegibilidadeService: ElegibilidadeService,
        @inject(VariacaoCambialPermutaService)
        private variacaoCambialService: VariacaoCambialPermutaService,
        @inject(AgingService) private agingService: AgingService,
        @inject(PermutaSnapshotRepository)
        private snapshotRepository: PermutaSnapshotRepository,
        @inject(LogService) private logService: LogService,
        @inject(BoundedConcurrency) private boundedConcurrency: BoundedConcurrency,
        @inject(PostgreeDatabaseClient) private databaseClient: PostgreeDatabaseClient,
    ) {}

    /**
     * Ponto de entrada do job. Idempotente por `Idempotency-Key` (P0-6):
     *   1. Sem key → roda direto (comportamento legado).
     *   2. Com key já vista (TTL 24h) → retorna a run existente, ZERO fan-out.
     *   3. Com key nova → adquire `pg_try_advisory_lock(hash(key))`. Se OUTRO
     *      request concorrente segura o lock, NÃO dispara novo fan-out: aguarda
     *      e retorna a run que o vencedor produziu (ou um replay vazio).
     */
    public executar = async (params: EleicaoParams): Promise<EleicaoResult> => {
        const { idempotencyKey } = params;
        if (!idempotencyKey) {
            return this.runEleicao(params);
        }

        // (2) key já produziu uma run dentro do TTL → replay direto.
        const existingRunId =
            await this.snapshotRepository.findRunIdByIdempotencyKey(idempotencyKey);
        if (existingRunId) {
            const replay = await this.loadRunAsResult(existingRunId);
            if (replay) return replay;
        }

        // (3) serializa por key via advisory lock.
        return this.databaseClient.withAdvisoryLock(
            advisoryLockKey(idempotencyKey),
            async () => {
                // Double-check sob o lock: outra run pode ter gravado a key entre
                // a checagem (2) e a aquisição do lock.
                const racedRunId =
                    await this.snapshotRepository.findRunIdByIdempotencyKey(idempotencyKey);
                if (racedRunId) {
                    const replay = await this.loadRunAsResult(racedRunId);
                    if (replay) return replay;
                }
                const result = await this.runEleicao(params);
                await this.snapshotRepository.recordIdempotencyKey(idempotencyKey, result.runId);
                return result;
            },
            async () => {
                // Lock ocupado → um request concorrente com a MESMA key está
                // rodando o fan-out. NÃO disparamos outro. Retornamos a run
                // existente quando o vencedor terminar de gravá-la.
                await this.logService.warn({
                    type: LOG_TYPE.BUSINESS_WARN,
                    message: 'permuta eleicao idempotency lock busy — reusing concurrent run',
                    data: { idempotencyKey },
                });
                const concurrentRunId =
                    await this.snapshotRepository.findRunIdByIdempotencyKey(idempotencyKey);
                if (concurrentRunId) {
                    const replay = await this.loadRunAsResult(concurrentRunId);
                    if (replay) return replay;
                }
                // O vencedor ainda não gravou a key — devolve um replay vazio
                // marcado, sem disparar um novo fan-out Conexos.
                return {
                    runId: '',
                    flowId: '',
                    totalCandidatas: 0,
                    totalElegiveis: 0,
                    totalBloqueadas: 0,
                    bloqueadasByMotivo: {},
                    status: 'success',
                    candidatas: [],
                    idempotentReplay: true,
                };
            },
        );
    };

    /** Carrega uma run existente como `EleicaoResult` (replay idempotente). */
    private loadRunAsResult = async (runId: string): Promise<EleicaoResult | null> => {
        const summary = await this.snapshotRepository.findRunSummaryById(runId);
        if (!summary) return null;
        return {
            runId: summary.runId,
            flowId: summary.flowId,
            totalCandidatas: summary.totalCandidatas,
            totalElegiveis: summary.totalElegiveis,
            totalBloqueadas: summary.totalBloqueadas,
            bloqueadasByMotivo: summary.bloqueadasByMotivo,
            status: summary.status === 'error' ? 'error' : 'success',
            candidatas: [],
            idempotentReplay: true,
        };
    };

    private runEleicao = async (params: EleicaoParams): Promise<EleicaoResult> => {
        const { triggeredBy } = params;
        const flowId = randomUUID();
        const startedAt = new Date();

        await this.logService.info({
            type: LOG_TYPE.FLOW_START,
            message: 'permuta eleicao started',
            data: { flowId, pageSize: PAGE_SIZE, maxPages: MAX_PAGES },
        });

        // AbortController (P0-4) — cancela o restante do fan-out assim que uma
        // filial falha de forma fatal, em vez de continuar disparando chamadas
        // Conexos para os demais workers em voo.
        const abortController = new AbortController();
        try {
            const filiais = await this.conexosClient.listFiliais();
            // Filiais em paralelo com limite (P0-4) — speedup de I/O ≥5× vs. o
            // laço sequencial anterior. `map` propaga a 1ª falha → run aborta.
            const perFilial = await this.boundedConcurrency.map(
                filiais,
                (filial) => this.processFilial(filial.filCod, flowId, abortController.signal),
                FILIAIS_CONCURRENCY,
            );
            const candidatas: PermutaCandidata[] = perFilial.flat();

            const elegiveis = candidatas.filter(
                (c) => c.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL,
            );
            const bloqueadas = candidatas.filter(
                (c) => c.estadoElegibilidade === ESTADO_ELEGIBILIDADE.BLOQUEADA,
            );
            const bloqueadasByMotivo = this.countByMotivo(bloqueadas);
            const finishedAt = new Date();

            const runInput: PermutaEleicaoRunInput = {
                flowId,
                startedAt,
                finishedAt,
                status: 'success',
                triggeredBy,
                totalCandidatas: candidatas.length,
                totalElegiveis: elegiveis.length,
                totalBloqueadas: bloqueadas.length,
                bloqueadasByMotivo,
            };
            const runId = await this.snapshotRepository.persistRun(runInput, candidatas);

            await this.logService.info({
                type: LOG_TYPE.FLOW_COMPLETE,
                message: 'permuta eleicao complete',
                data: {
                    flowId,
                    snapshotId: runId,
                    totalCandidatas: candidatas.length,
                    totalElegiveis: elegiveis.length,
                    totalBloqueadas: bloqueadas.length,
                    bloqueadasByMotivo,
                    durationMs: finishedAt.getTime() - startedAt.getTime(),
                },
            });

            return {
                runId,
                flowId,
                totalCandidatas: candidatas.length,
                totalElegiveis: elegiveis.length,
                totalBloqueadas: bloqueadas.length,
                bloqueadasByMotivo,
                status: 'success',
                candidatas,
            };
        } catch (error) {
            // P0-4 — corta os workers de fan-out ainda em voo (best-effort).
            abortController.abort();
            const message = error instanceof Error ? error.message : String(error);
            // Atomicidade: persiste a run com status=error e ZERO snapshot rows.
            const runId = await this.snapshotRepository.persistRun(
                {
                    flowId,
                    startedAt,
                    finishedAt: new Date(),
                    status: 'error',
                    triggeredBy,
                    totalCandidatas: 0,
                    totalElegiveis: 0,
                    totalBloqueadas: 0,
                    bloqueadasByMotivo: {},
                    errorMessage: message,
                },
                [],
            );

            await this.logService.error({
                type: LOG_TYPE.FLOW_ERROR,
                message: 'permuta eleicao aborted',
                error,
                data: { flowId, snapshotId: runId, error: message },
            });
            throw error;
        }
    };

    private processFilial = async (
        filCod: number,
        flowId: string,
        signal: AbortSignal,
    ): Promise<PermutaCandidata[]> => {
        const { adiantamentos, capHit } = await this.conexosClient.listAdiantamentosProforma({
            filCod,
        });

        if (capHit) {
            await this.logService.warn({
                type: LOG_TYPE.BUSINESS_WARN,
                message: 'permuta eleicao pagination cap hit — results may be truncated',
                data: { flowId, filCod, capHit: true, maxPages: MAX_PAGES },
            });
        }

        if (adiantamentos.length === 0) return [];

        // P0-7 — elimina o N+1: coleta os priCods ÚNICOS da filial e faz as
        // chamadas Conexos BATCHED (uma só, internamente chunked em 50) em vez de
        // 1 chamada por adiantamento. Resultados indexados em `Map` por priCod.
        const priCodsUnicos = [...new Set(adiantamentos.map((a) => a.priCod))];
        const [declaracoesByPriCod, invoicesByPriCod] = await Promise.all([
            this.fetchDeclaracoesBatched(priCodsUnicos, filCod),
            this.fetchInvoicesBatched(priCodsUnicos, filCod),
        ]);

        // Adiantamentos em paralelo com limite (P0-4). Só o detail por-documento
        // (`getDetalheTitulos` / `listTitulosAPagar`) permanece per-candidata —
        // são detail endpoints sem variante batched no Conexos.
        return this.boundedConcurrency.map(
            adiantamentos,
            (adiantamento) =>
                this.buildCandidata(adiantamento, filCod, flowId, {
                    declaracoes: declaracoesByPriCod.get(adiantamento.priCod) ?? [],
                    invoices: invoicesByPriCod.get(adiantamento.priCod) ?? [],
                    signal,
                }),
            ADIANTAMENTOS_CONCURRENCY,
        );
    };

    /** Batch das declarações (D.I/DUIMP) de TODOS os priCods da filial → Map. */
    private fetchDeclaracoesBatched = async (
        priCods: string[],
        filCod: number,
    ): Promise<Map<string, DeclaracaoEntry[]>> => {
        const declaracoes = await this.conexosClient.listDeclaracaoByProcesso({
            priCods,
            filCod,
        });
        const byPriCod = new Map<string, DeclaracaoEntry[]>();
        for (const entry of declaracoes) {
            const list = byPriCod.get(entry.priCod) ?? [];
            list.push(entry);
            byPriCod.set(entry.priCod, list);
        }
        return byPriCod;
    };

    /** Batch das INVOICEs de TODOS os priCods da filial → Map por priCod. */
    private fetchInvoicesBatched = async (
        priCods: string[],
        filCod: number,
    ): Promise<Map<string, Invoice[]>> => {
        const { invoices } = await this.conexosClient.listFinanceiroAPagar({
            priCods,
            docTip: 'INVOICE',
            filCod,
        });
        const byPriCod = new Map<string, Invoice[]>();
        for (const i of invoices) {
            const mapped: Invoice = {
                docCod: i.docCod,
                priCod: i.priCod,
                dataEmissao: i.dataEmissao,
                valor: i.valor,
                moeda: i.moeda,
                pago: i.pago,
                ...(i.exportador !== undefined ? { exportador: i.exportador } : {}),
            };
            const list = byPriCod.get(i.priCod) ?? [];
            list.push(mapped);
            byPriCod.set(i.priCod, list);
        }
        return byPriCod;
    };

    /**
     * Candidata BLOQUEADA por `DETAIL_INDISPONIVEL` (P0-3) — a leitura do detalhe
     * (`getDetalheTitulos`) falhou após retries. Marca o Gate 2 como não avaliado
     * (detalhe ausente) sem inventar `valorPermutar`. Não é `falha-gate`.
     */
    private buildDetailIndisponivelCandidata = (adiantamento: Adiantamento): PermutaCandidata => ({
        priCod: adiantamento.priCod,
        adiantamento,
        estadoElegibilidade: ESTADO_ELEGIBILIDADE.BLOQUEADA,
        motivoBloqueio: MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL,
        gatesAvaliados: [
            {
                gate: GATE.VALOR_PERMUTAR,
                passed: false,
                detail: 'detalhe da PROFORMA indisponivel (getDetalheTitulos falhou apos retries)',
            },
        ],
    });

    private buildCandidata = async (
        adiantamento: Adiantamento,
        filCod: number,
        flowId: string,
        context: { declaracoes: DeclaracaoEntry[]; invoices: Invoice[]; signal: AbortSignal },
    ): Promise<PermutaCandidata> => {
        const { declaracoes, invoices, signal } = context;
        // P0-4 — corte cooperativo: se a run já abortou (outra filial falhou),
        // não dispara o detail fetch deste adiantamento.
        if (signal.aborted) {
            throw new ConexosError({ endpoint: 'aborted', priCod: adiantamento.docCod });
        }

        // Gate 2 + Gate 3 — hidrata valorPermutar E pago via detail. Ambos os
        // campos voltam null no `com298/list` em produção (mnyTitPermutar e
        // mnyTitAberto/mnyTitPago), só são populados em GET /com298/{docCod}.
        // Por isso o `pago` da row do list é sempre false (gate-3-pago-via-detail):
        // sobrescrevemos com o status real derivado de `mnyTitAberto` ANTES de
        // avaliar os gates.
        // P0-3: se a leitura do detalhe falhar após retries (blip transiente do
        // Conexos), o `getDetalheTitulos` lança `ConexosError` — NÃO travamos a
        // run inteira nem reprovamos a candidata por mérito (`falha-gate`).
        // Bloqueamos com `DETAIL_INDISPONIVEL` (re-avaliável na próxima run).
        let detalhe: { valorPermutar?: number; pago?: boolean };
        try {
            detalhe = await this.conexosClient.getDetalheTitulos({
                docCod: adiantamento.docCod,
                filCod,
            });
        } catch (error) {
            if (error instanceof ConexosError) {
                await this.logService.warn({
                    type: LOG_TYPE.BUSINESS_WARN,
                    message:
                        'permuta eleicao detalhe da PROFORMA indisponivel — candidata bloqueada',
                    data: {
                        flowId,
                        filCod,
                        docCod: adiantamento.docCod,
                        motivo: MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL,
                    },
                });
                return this.buildDetailIndisponivelCandidata(adiantamento);
            }
            throw error;
        }
        const hydrated: Adiantamento = {
            ...adiantamento,
            ...(detalhe.valorPermutar !== undefined
                ? { valorPermutar: detalhe.valorPermutar }
                : {}),
            // Gate 3 — `pago` SEMPRE vem do detalhe (mnyTitAberto === 0): o list
            // devolve mnyTitAberto/mnyTitPago NULL em produção, então o `pago` da
            // row do list é inservível. Quando o detalhe não traz `mnyTitAberto`
            // (campo ausente/null), `detalhe.pago` é undefined → forçamos `false`
            // (conservador: Gate 3 reprova; NUNCA inferimos pago=true sem prova).
            pago: detalhe.pago ?? false,
        };

        const result = this.elegibilidadeService.avaliarElegibilidade({
            adiantamento: hydrated,
            declaracoes,
            invoices,
        });

        const dataBase = result.declaracaoImportacao?.dataBase;
        const aging = this.agingService.compute(dataBase);

        const candidata: PermutaCandidata = {
            priCod: result.priCod,
            adiantamento: result.adiantamento,
            estadoElegibilidade: result.estadoElegibilidade,
            gatesAvaliados: result.gatesAvaliados,
            ...(result.invoiceCasada !== undefined ? { invoiceCasada: result.invoiceCasada } : {}),
            ...(result.declaracaoImportacao !== undefined
                ? { declaracaoImportacao: result.declaracaoImportacao }
                : {}),
            ...(result.motivoBloqueio !== undefined
                ? { motivoBloqueio: result.motivoBloqueio }
                : {}),
            ...(aging !== undefined ? { aging } : {}),
        };

        // Variação cambial só para elegíveis com título a-pagar legível (P0-1).
        if (result.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL && result.invoiceCasada) {
            const variacao = await this.computeVariacao(
                hydrated,
                result.invoiceCasada,
                dataBase,
                filCod,
            );
            if (variacao !== undefined) candidata.variacaoCambial = variacao;
        }

        return candidata;
    };

    private computeVariacao = async (
        adiantamento: Adiantamento,
        invoice: Invoice,
        dataBase: Date | undefined,
        filCod: number,
    ): Promise<PermutaCandidata['variacaoCambial']> => {
        const [titAdto, titInv] = await Promise.all([
            this.conexosClient.listTitulosAPagar({ docCod: adiantamento.docCod, filCod }),
            this.conexosClient.listTitulosAPagar({ docCod: invoice.docCod, filCod }),
        ]);
        const taxaAdiantamento = titAdto[0]?.taxa;
        const taxaInvoice = titInv[0]?.taxa;
        const principalMoeda = titInv[0]?.valorNegociado ?? titAdto[0]?.valorNegociado;
        if (
            taxaAdiantamento === undefined ||
            taxaInvoice === undefined ||
            principalMoeda === undefined
        ) {
            return undefined;
        }
        return this.variacaoCambialService.calcular({
            moeda: titInv[0]?.moedaNome ?? invoice.moeda,
            principalMoeda,
            taxaAdiantamento,
            taxaInvoice,
            ...(dataBase !== undefined ? { dataBase } : {}),
        });
    };

    private countByMotivo = (bloqueadas: PermutaCandidata[]): Record<string, number> => {
        const acc: Record<string, number> = {};
        for (const c of bloqueadas) {
            const motivo = c.motivoBloqueio ?? 'desconhecido';
            acc[motivo] = (acc[motivo] ?? 0) + 1;
        }
        return acc;
    };
}
