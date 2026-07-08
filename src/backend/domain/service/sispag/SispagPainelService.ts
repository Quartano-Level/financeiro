import { inject, injectable } from 'tsyringe';
import ConexosBaseClient from '../../client/ConexosBaseClient.js';
import ConexosSispagClient from '../../client/ConexosSispagClient.js';
import BoundedConcurrency from '../../libs/concurrency/BoundedConcurrency.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import type {
    LoteSispag,
    SispagKpis,
    SispagPainelResponse,
    TituloAPagar,
} from '../../interface/sispag/SispagInterface.js';
import EnvironmentProvider from '../../libs/environment/EnvironmentProvider.js';
import LotePagamentoRepository from '../../repository/sispag/LotePagamentoRepository.js';
import PagamentoIngestaoRunRepository from '../../repository/sispag/PagamentoIngestaoRunRepository.js';
import TituloAPagarRepository from '../../repository/sispag/TituloAPagarRepository.js';
import LogService from '../LogService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Nº máx. de títulos devolvidos ao painel (evita payload gigante). */
const TITULOS_CAP = 400;
/**
 * Teto de chamadas Conexos SIMULTÂNEAS no fan-out do painel (lotes nativos).
 * Evita o burst que pressiona o pool de sessões do Conexos (`LOGIN_ERROR_MAX_SESSIONS`).
 */
const CONEXOS_FANOUT_LIMIT = 4;

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
        @inject(TituloAPagarRepository) private readonly tituloRepo: TituloAPagarRepository,
        @inject(PagamentoIngestaoRunRepository)
        private readonly runRepo: PagamentoIngestaoRunRepository,
        @inject(LotePagamentoRepository) private readonly loteRepo: LotePagamentoRepository,
        @inject(EnvironmentProvider) private readonly env: EnvironmentProvider,
        @inject(LogService) private readonly logService: LogService,
    ) {}

    public montarPainel = async (): Promise<SispagPainelResponse> => {
        const filiais = await this.base.getFiliais();
        const filCods = filiais
            .map((f) => f.filCod)
            .filter((n): n is number => typeof n === 'number');

        const now = Date.now();

        // TÍTULOS: vêm da carteira PERSISTIDA (ingestão), não mais ao vivo do Conexos.
        const [titulosRaw, ultimaRun, emRascunho] = await Promise.all([
            this.tituloRepo.listAtivos(),
            this.runRepo.findLatestSuccessFinishedAt(),
            this.loteRepo.listTitulosEmRascunho(),
        ]);
        // Marca os títulos já num lote RASCUNHO — o painel bloqueia a seleção (I3, anti-reatache).
        const emLote = new Set(emRascunho.map((t) => `${t.filCod}:${t.docCod}:${t.titCod}`));
        for (const t of titulosRaw) {
            t.emLote = emLote.has(`${t.filCod}:${t.docCod}:${t.titCod}`);
        }

        // Contexto AO VIVO (lotes SISPAG nativos): fan-out LIMITADO (1 leitura/filial),
        // tolerante a falha per-leitura.
        const settled = await this.bounded.run(
            filCods,
            (filCod) => this.sispag.listLotes(filCod),
            CONEXOS_FANOUT_LIMIT,
        );

        const lotesRaw: LoteSispag[] = [];
        for (let i = 0; i < settled.length; i += 1) {
            const result = settled[i];
            if (result.status === 'rejected') {
                await this.logService.warn({
                    type: LOG_TYPE.BUSINESS_WARN,
                    message: 'SISPAG: leitura de lotes nativos falhou (ignorada no painel)',
                    data: {
                        filCod: filCods[i],
                        reason:
                            result.reason instanceof Error
                                ? result.reason.message
                                : String(result.reason),
                    },
                });
                continue;
            }
            lotesRaw.push(...result.value);
        }

        // Carteira completa (KPIs calculam sobre ela); a resposta corta em CAP.
        const titulosPreparados = this.prepararTitulos(titulosRaw, now);
        const kpis = this.calcularKpis(titulosPreparados, lotesRaw);
        const titulos = titulosPreparados.slice(0, TITULOS_CAP);
        const envVars = await this.env.getEnvironmentVars();

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'SISPAG painel (read-only) montado',
            data: {
                filiais: filCods.length,
                titulos: titulos.length,
                lotes: lotesRaw.length,
            },
        });

        return {
            geradoEm: new Date(now).toISOString(),
            modo: {
                somenteLeitura: true,
                conexosWriteEnabled: envVars.conexosWriteEnabled,
                conexosDryRun: envVars.conexosDryRun,
            },
            ingestao: {
                ultimaRunEm: ultimaRun ? ultimaRun.toISOString() : undefined,
            },
            kpis,
            titulos,
            lotes: this.ordenarLotes(lotesRaw),
        };
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

    private calcularKpis = (titulos: TituloAPagar[], lotes: LoteSispag[]): SispagKpis => {
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
        };
    };
}
