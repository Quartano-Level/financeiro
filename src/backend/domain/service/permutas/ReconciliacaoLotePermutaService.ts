import { inject, injectable } from 'tsyringe';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import GestaoPermutasService from './GestaoPermutasService.js';
import ReconciliacaoPermutaService, {
    type ReconciliarResult,
} from './ReconciliacaoPermutaService.js';
import LogService from '../LogService.js';

/**
 * Teto de adiantamentos por requisição de lote. Cap server-side (autoritativo): bound execution time
 * (mantém o request curto, longe do timeout do proxy) E blast radius (limita a escrita por clique). O
 * analista clica de novo para o próximo lote (até zerar). Mude aqui = muda o tamanho do lote.
 */
export const LOTE_MAX = 6;

/** Status agregado de UM adiantamento dentro do lote. */
export type LoteAdiantamentoStatus = 'settled' | 'parcial' | 'error' | 'dry-run' | 'skipped';

/** Resultado por adiantamento processado no lote. */
export interface ReconciliarLoteItem {
    adiantamentoDocCod: string;
    /** Processo (priCod) do casamento — para o relatório/toast. */
    priCod?: string;
    status: LoteAdiantamentoStatus;
    borCod?: number;
    /** Mensagem do 1º erro (quando status `error`/`parcial`). */
    erro?: string;
}

/** Resultado agregado do lote de automáticas. */
export interface ReconciliarLoteResult {
    dryRun: boolean;
    writeEnabled: boolean;
    /** Adiantamentos tentados (automáticas não-processadas). */
    totalCasos: number;
    /** Baixas (par adto↔invoice) liquidadas com sucesso. */
    totalSettled: number;
    /** Baixas com erro + adtos que lançaram antes de qualquer baixa. */
    totalErros: number;
    /** Borderôs distintos criados no ERP. */
    borderos: number[];
    resultados: ReconciliarLoteItem[];
}

/** Entrada do lote. */
export interface ReconciliarLoteInput {
    executadoPor: string;
    /** Data de movimento do borderô em epoch-ms (default no boundary). */
    dataMovto: number;
    /** Força dry-run mesmo com escrita habilitada (preview sem POST). */
    dryRunOverride?: boolean;
    /**
     * Subconjunto de adiantamentos a executar (os "próximos N" que a tela escolheu). Quando presente,
     * é interseccionado com o conjunto das automáticas (só executa o que é de fato automática) e capado
     * em LOTE_MAX. Ausente → todas as automáticas, também capadas em LOTE_MAX.
     */
    adiantamentoDocCods?: string[];
    requestId: string;
}

/**
 * ReconciliacaoLotePermutaService — executa em LOTE a baixa/permuta de TODAS as automáticas
 * (aba "Automáticas" = `gestao.casamentos`), reusando `ReconciliacaoPermutaService.reconciliar`
 * adto a adto. Server-side e SEQUENCIAL (um request só → não estoura o `heavyRouteLimiter`; pacing
 * controlado sobre o Conexos). **Continue-on-error**: a falha de um adto não interrompe os demais
 * (cada baixa é idempotente write-ahead e atômica por par). Herda integralmente o gating de escrita
 * (`CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`) — o lote NÃO afrouxa nada. READ do conjunto via Gestão.
 */
@injectable()
export default class ReconciliacaoLotePermutaService {
    constructor(
        @inject(GestaoPermutasService) private gestaoService: GestaoPermutasService,
        @inject(ReconciliacaoPermutaService)
        private reconciliacaoService: ReconciliacaoPermutaService,
        @inject(LogService) private logService: LogService,
    ) {}

    public reconciliarLote = async (
        input: ReconciliarLoteInput,
    ): Promise<ReconciliarLoteResult> => {
        const { executadoPor, dataMovto, dryRunOverride, adiantamentoDocCods, requestId } = input;
        const gestao = await this.gestaoService.exporGestao(requestId);

        // Conjunto das automáticas: cada adiantamento dos casamentos sugeridos cujo analista ainda
        // não processou. Dedup por docCod (1 adto → 1 borderô), mantendo o priCod p/ o relatório.
        const priCodPorAdto = new Map<string, string>();
        const ordem: string[] = [];
        for (const c of gestao.casamentos) {
            for (const a of c.adiantamentos) {
                if (a.processamentoStatus === 'processado') continue;
                if (priCodPorAdto.has(a.docCod)) continue;
                priCodPorAdto.set(a.docCod, c.priCod);
                ordem.push(a.docCod);
            }
        }

        // Seleção do lote: se a tela mandou os "próximos N", interseccciona com as automáticas (só
        // executa o que é de fato automática — não confia cegamente no cliente) preservando a ordem;
        // senão, todas. Sempre capado em LOTE_MAX (bound execution time + blast radius).
        const filtro = adiantamentoDocCods !== undefined ? new Set(adiantamentoDocCods) : undefined;
        const selecionados = (filtro ? ordem.filter((d) => filtro.has(d)) : ordem).slice(
            0,
            LOTE_MAX,
        );

        const resultados: ReconciliarLoteItem[] = [];
        const borderos = new Set<number>();
        let totalSettled = 0;
        let totalErros = 0;
        let dryRun = false;
        let writeEnabled = false;

        for (const docCod of selecionados) {
            const priCod = priCodPorAdto.get(docCod);
            try {
                const r = await this.reconciliacaoService.reconciliar({
                    adiantamentoDocCod: docCod,
                    executadoPor,
                    dataMovto,
                    ...(dryRunOverride !== undefined ? { dryRunOverride } : {}),
                });
                // Flags de ambiente são consistentes entre adtos — refletem a última leitura.
                dryRun = r.dryRun;
                writeEnabled = r.writeEnabled;
                if (r.borCod !== undefined) borderos.add(r.borCod);
                const settled = r.resultados.filter((x) => x.status === 'settled').length;
                const erros = r.resultados.filter((x) => x.status === 'error');
                totalSettled += settled;
                totalErros += erros.length;
                resultados.push({
                    adiantamentoDocCod: docCod,
                    ...(priCod !== undefined ? { priCod } : {}),
                    status: this.statusDoAdto(r, settled, erros.length),
                    ...(r.borCod !== undefined ? { borCod: r.borCod } : {}),
                    ...(erros[0]?.erro !== undefined ? { erro: erros[0].erro } : {}),
                });
            } catch (err) {
                // Falha ANTES de qualquer baixa (sem alocação, sem filial, erro de leitura): conta como
                // 1 erro e segue para o próximo adto (continue-on-error).
                totalErros += 1;
                const mensagem = err instanceof Error ? err.message : String(err);
                resultados.push({
                    adiantamentoDocCod: docCod,
                    ...(priCod !== undefined ? { priCod } : {}),
                    status: 'error',
                    erro: mensagem,
                });
            }
        }

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'permuta batch reconciliation',
            data: {
                requestId,
                executadoPor,
                totalCasos: selecionados.length,
                totalSettled,
                totalErros,
                borderos: borderos.size,
                dryRun,
            },
        });

        return {
            dryRun,
            writeEnabled,
            totalCasos: selecionados.length,
            totalSettled,
            totalErros,
            borderos: [...borderos],
            resultados,
        };
    };

    /** Deriva o status agregado de um adto a partir do seu ReconciliarResult. */
    private statusDoAdto = (
        r: ReconciliarResult,
        settled: number,
        erros: number,
    ): LoteAdiantamentoStatus => {
        if (r.dryRun) return 'dry-run';
        if (erros > 0) return settled > 0 ? 'parcial' : 'error';
        if (settled > 0) return 'settled';
        // Sem settled e sem erro → tudo já estava liquidado (idempotência: `skipped`).
        return 'skipped';
    };
}
