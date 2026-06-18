import { inject, injectable } from 'tsyringe';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import type {
    CasamentoSugerido,
    GestaoPermutasResponse,
    InvoiceEmAberto,
    PermutaPendente,
    StatusElegibilidade,
} from '../../interface/permutas/Gestao.js';
import type { ProcessamentoStatus } from '../../interface/permutas/Processamento.js';
import type {
    AdiantamentoAtivo,
    CasamentoRow,
    InvoiceRow,
} from '../../repository/permutas/PermutaRelationalRepository.js';
import PermutaRelationalRepository from '../../repository/permutas/PermutaRelationalRepository.js';
import PermutaProcessamentoRepository from '../../repository/permutas/PermutaProcessamentoRepository.js';
import LogService from '../LogService.js';

/**
 * GestaoPermutasService — monta o payload da tela `GET /permutas/gestao` a
 * partir do modelo relacional (Fase B). Junta adiantamentos ativos + estado de
 * processamento do analista → `pendentes`; invoices em aberto → `invoicesEmAberto`;
 * casamentos automáticos → `casamentos`. `fonte:'banco'`. READ-ONLY.
 */
@injectable()
export default class GestaoPermutasService {
    constructor(
        @inject(PermutaRelationalRepository)
        private relationalRepository: PermutaRelationalRepository,
        @inject(PermutaProcessamentoRepository)
        private processamentoRepository: PermutaProcessamentoRepository,
        @inject(LogService) private logService: LogService,
    ) {}

    public exporGestao = async (requestId: string): Promise<GestaoPermutasResponse> => {
        const [adiantamentos, invoices, casamentos, processamentos] = await Promise.all([
            this.relationalRepository.listAdiantamentosAtivos(),
            this.relationalRepository.listInvoicesEmAberto(),
            this.relationalRepository.listCasamentos(),
            this.processamentoRepository.listProcessamentos(),
        ]);

        const statusByDocCod = new Map<string, ProcessamentoStatus>(
            processamentos.map((p) => [p.adiantamentoDocCod, p.status]),
        );
        const invoiceByDocCod = new Map<string, InvoiceRow>(invoices.map((i) => [i.docCod, i]));

        const pendentes = adiantamentos.map((a) => this.toPendente(a, statusByDocCod));
        const invoicesEmAberto = invoices.map((i) => this.toInvoiceEmAberto(i));
        const casamentosSugeridos = this.toCasamentos(
            casamentos,
            invoiceByDocCod,
            adiantamentos,
            statusByDocCod,
        );

        const elegiveis = pendentes.filter((p) => p.status === 'elegivel').length;
        const bloqueadas = pendentes.filter((p) => p.status === 'bloqueada').length;
        const casamentoManual = pendentes.filter((p) => p.status === 'casamento-manual').length;

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'permuta gestao served',
            data: {
                requestId,
                pendentes: pendentes.length,
                invoicesEmAberto: invoicesEmAberto.length,
                casamentos: casamentosSugeridos.length,
            },
        });

        return {
            geradoEm: new Date().toISOString(),
            fonte: 'banco',
            pendentes,
            invoicesEmAberto,
            casamentos: casamentosSugeridos,
            totais: {
                pendentes: pendentes.length,
                invoicesEmAberto: invoicesEmAberto.length,
                elegiveis,
                bloqueadas,
                casamentoManual,
            },
        };
    };

    private toPendente = (
        a: AdiantamentoAtivo,
        statusByDocCod: Map<string, ProcessamentoStatus>,
    ): PermutaPendente => {
        const status: StatusElegibilidade =
            a.estadoElegibilidade === 'elegivel'
                ? 'elegivel'
                : a.estadoElegibilidade === 'casamento-manual'
                  ? 'casamento-manual'
                  : 'bloqueada';
        const processamentoStatus = statusByDocCod.get(a.docCod);
        return {
            docCod: a.docCod,
            filCod: a.filCod ?? 0,
            referencia: a.referencia ?? a.docCod,
            exportador: a.exportador ?? '',
            valorMoedaNegociada: a.valorMoedaNegociada ?? 0,
            moeda: a.moeda ?? 'USD',
            diasEmAberto: a.agingDays ?? null,
            status,
            ...(a.motivoBloqueio !== undefined ? { motivoBloqueio: a.motivoBloqueio } : {}),
            ...(processamentoStatus !== undefined ? { processamentoStatus } : {}),
        };
    };

    private toInvoiceEmAberto = (i: InvoiceRow): InvoiceEmAberto => ({
        docCod: i.docCod,
        filCod: i.filCod ?? 0,
        referencia: i.referencia ?? i.docCod,
        exportador: i.exportador ?? '',
        valorMoedaNegociada: i.valorMoedaNegociada ?? 0,
        moeda: i.moeda ?? 'USD',
    });

    /**
     * Agrupa os casamentos automáticos por invoice. Cada invoice vira um
     * `CasamentoSugerido` com seus adiantamentos. Resolve o shape da invoice via
     * o map (ou um stub mínimo se a invoice não estiver entre as "em aberto",
     * ex.: já paga mas com casamento histórico). O `valorASerUsado` cai no
     * `valorMoedaNegociada` do adiantamento quando o casamento não o trouxe.
     */
    private toCasamentos = (
        casamentos: CasamentoRow[],
        invoiceByDocCod: Map<string, InvoiceRow>,
        adiantamentos: AdiantamentoAtivo[],
        statusByDocCod: Map<string, ProcessamentoStatus>,
    ): CasamentoSugerido[] => {
        const adiantamentoByDocCod = new Map<string, AdiantamentoAtivo>(
            adiantamentos.map((a) => [a.docCod, a]),
        );
        const grupos = new Map<string, CasamentoSugerido>();
        for (const c of casamentos) {
            let grupo = grupos.get(c.invoiceDocCod);
            if (!grupo) {
                const inv = invoiceByDocCod.get(c.invoiceDocCod);
                grupo = {
                    invoice: inv
                        ? this.toInvoiceEmAberto(inv)
                        : {
                              docCod: c.invoiceDocCod,
                              filCod: 0,
                              referencia: c.invoiceDocCod,
                              exportador: '',
                              valorMoedaNegociada: 0,
                              moeda: c.moeda ?? 'USD',
                          },
                    adiantamentos: [],
                };
                grupos.set(c.invoiceDocCod, grupo);
            }
            const adto = adiantamentoByDocCod.get(c.adiantamentoDocCod);
            const processamentoStatus = statusByDocCod.get(c.adiantamentoDocCod);
            grupo.adiantamentos.push({
                docCod: c.adiantamentoDocCod,
                referencia: adto?.referencia ?? c.adiantamentoDocCod,
                valorASerUsado: c.valorASerUsado ?? adto?.valorMoedaNegociada ?? 0,
                moeda: c.moeda ?? adto?.moeda ?? 'USD',
                ...(processamentoStatus !== undefined ? { processamentoStatus } : {}),
            });
        }
        return [...grupos.values()];
    };
}
