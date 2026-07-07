import { inject, injectable } from 'tsyringe';
import ConexosBaseClient from '../../client/ConexosBaseClient.js';
import ConexosSispagClient from '../../client/ConexosSispagClient.js';
import BoundedConcurrency from '../../libs/concurrency/BoundedConcurrency.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import type {
    BorderoAPagar,
    LoteSispag,
    SispagKpis,
    SispagPainelResponse,
    TituloAPagar,
} from '../../interface/sispag/SispagInterface.js';
import EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import LogService from '../LogService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Nº máx. de títulos devolvidos ao painel (spike — evita payload gigante). */
const TITULOS_CAP = 400;
/**
 * Teto de chamadas Conexos SIMULTÂNEAS no fan-out do painel. Antes o painel
 * disparava `3 × N_filiais` (~21) de uma vez via `Promise.all`, o que pressiona
 * o pool de sessões do Conexos (`LOGIN_ERROR_MAX_SESSIONS`). Bounded a 4.
 */
const CONEXOS_FANOUT_LIMIT = 4;

type LeituraKind = 'titulo' | 'lote' | 'bordero';
interface LeituraTask {
    kind: LeituraKind;
    filCod: number;
}

/**
 * SispagPainelService — monta o painel READ-ONLY do Escopo II (spike / Fatia 1).
 *
 * Agrega leituras do Conexos (títulos a pagar, lotes SISPAG nativos, borderôs),
 * deriva aging e KPIs, e devolve tudo para a tela. NENHUMA escrita/execução —
 * o "montar/finalizar/enviar" é simulado 100% no front. Ver
 * `ontology/_inbox/sispag-native-vs-nexxera.md` e `sispag-context-map.md`.
 */
@injectable()
export default class SispagPainelService {
    public constructor(
        @inject(ConexosSispagClient) private readonly sispag: ConexosSispagClient,
        @inject(ConexosBaseClient) private readonly base: ConexosBaseClient,
        @inject(BoundedConcurrency) private readonly bounded: BoundedConcurrency,
        @inject(EnvironmentProvider) private readonly env: EnvironmentProvider,
        @inject(LogService) private readonly logService: LogService,
    ) {}

    public montarPainel = async (): Promise<SispagPainelResponse> => {
        const filiais = await this.base.getFiliais();
        const filCods = filiais
            .map((f) => f.filCod)
            .filter((n): n is number => typeof n === 'number');

        const now = Date.now();
        // Janela relevante: vencidos recentes (-15d) até a vencer (+45d). Fechada
        // (GE..LE) para capturar a janela inteira independente da ordem do ERP.
        const minVencimento = now - 15 * DAY_MS;
        const maxVencimento = now + 45 * DAY_MS;

        // Fan-out LIMITADO: um pool único de 3×N leituras (título/lote/borderô por
        // filial) com no máx. CONEXOS_FANOUT_LIMIT em voo — evita o burst que
        // pressiona o pool de sessões do Conexos. Tolerante a falha per-leitura.
        const tasks: LeituraTask[] = filCods.flatMap((filCod) => [
            { kind: 'titulo', filCod },
            { kind: 'lote', filCod },
            { kind: 'bordero', filCod },
        ]);
        const settled = await this.bounded.run(
            tasks,
            (task) => this.executarLeitura(task, minVencimento, maxVencimento),
            CONEXOS_FANOUT_LIMIT,
        );

        const titulosRaw: TituloAPagar[] = [];
        const lotesRaw: LoteSispag[] = [];
        const borderosRaw: BorderoAPagar[] = [];
        for (let i = 0; i < settled.length; i += 1) {
            const result = settled[i];
            const task = tasks[i];
            if (result.status === 'rejected') {
                await this.logService.warn({
                    type: LOG_TYPE.BUSINESS_WARN,
                    message: 'SISPAG: leitura de filial falhou (ignorada no painel)',
                    data: {
                        kind: task.kind,
                        filCod: task.filCod,
                        reason:
                            result.reason instanceof Error
                                ? result.reason.message
                                : String(result.reason),
                    },
                });
                continue;
            }
            if (task.kind === 'titulo') titulosRaw.push(...(result.value as TituloAPagar[]));
            else if (task.kind === 'lote') lotesRaw.push(...(result.value as LoteSispag[]));
            else borderosRaw.push(...(result.value as BorderoAPagar[]));
        }

        // Lista COMPLETA da janela (KPIs calculam sobre ela); a resposta corta em CAP.
        const titulosPreparados = this.prepararTitulos(titulosRaw, now);
        const kpis = this.calcularKpis(titulosPreparados, lotesRaw, borderosRaw);
        const titulos = titulosPreparados.slice(0, TITULOS_CAP);
        const envVars = await this.env.getEnvironmentVars();

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'SISPAG painel (read-only) montado',
            data: {
                filiais: filCods.length,
                titulos: titulos.length,
                lotes: lotesRaw.length,
                borderos: borderosRaw.length,
            },
        });

        return {
            geradoEm: new Date(now).toISOString(),
            modo: {
                somenteLeitura: true,
                conexosWriteEnabled: envVars.conexosWriteEnabled,
                conexosDryRun: envVars.conexosDryRun,
            },
            kpis,
            titulos,
            lotes: this.ordenarLotes(lotesRaw),
            borderos: borderosRaw.slice(0, 100),
        };
    };

    /** Worker do pool limitado: UMA leitura (título/lote/borderô de uma filial). */
    private executarLeitura = (
        task: LeituraTask,
        minVencimento: number,
        maxVencimento: number,
    ): Promise<TituloAPagar[] | LoteSispag[] | BorderoAPagar[]> => {
        if (task.kind === 'titulo')
            return this.sispag.listTitulosAPagar(task.filCod, { minVencimento, maxVencimento });
        if (task.kind === 'lote') return this.sispag.listLotes(task.filCod);
        return this.sispag.listBorderosAPagar(task.filCod);
    };

    /** Filtra não-pagos, deriva aging e ordena por vencimento (mais urgente 1º). */
    private prepararTitulos = (titulos: TituloAPagar[], now: number): TituloAPagar[] =>
        titulos
            .filter((t) => !t.pago)
            .map((t) => ({
                ...t,
                diasAteVencimento:
                    t.vencimento !== undefined
                        ? Math.round((t.vencimento - now) / DAY_MS)
                        : undefined,
            }))
            .sort((a, b) => (a.vencimento ?? Infinity) - (b.vencimento ?? Infinity));

    private ordenarLotes = (lotes: LoteSispag[]): LoteSispag[] =>
        [...lotes].sort((a, b) => (b.dataCredito ?? 0) - (a.dataCredito ?? 0));

    private calcularKpis = (
        titulos: TituloAPagar[],
        lotes: LoteSispag[],
        borderos: BorderoAPagar[],
    ): SispagKpis => {
        const aprovado = (t: TituloAPagar): boolean => t.liberado && !t.pago;
        const dias = (t: TituloAPagar): number => t.diasAteVencimento ?? Infinity;
        const aVencer7d = titulos.filter((t) => aprovado(t) && dias(t) >= 0 && dias(t) <= 7);
        const aVencer30d = titulos.filter((t) => aprovado(t) && dias(t) >= 0 && dias(t) <= 30);
        const vencidos = titulos.filter((t) => aprovado(t) && dias(t) < 0);
        return {
            titulosAVencer7d: aVencer7d.length,
            titulosAVencer30d: aVencer30d.length,
            titulosVencidos: vencidos.length,
            valorAVencer30d: aVencer30d.reduce((acc, t) => acc + t.valor, 0),
            lotesAbertos: lotes.filter((l) => !l.envioConfirmado).length,
            lotesEnviados: lotes.filter((l) => l.envioConfirmado).length,
            borderosViaRemessa: borderos.filter((b) => b.temRemessa).length,
            borderosTotalAmostra: borderos.length,
        };
    };
}
