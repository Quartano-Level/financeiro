import { inject, injectable } from 'tsyringe';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import type {
    CasamentoSugerido,
    GestaoPermutasResponse,
    InvoiceEmAberto,
    PermutaDetalhe,
    PermutaPendente,
    StatusElegibilidade,
} from '../../interface/permutas/Gestao.js';
import type { ProcessamentoStatus } from '../../interface/permutas/Processamento.js';
import type {
    AdiantamentoAtivo,
    CasamentoRow,
    DeclaracaoRow,
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
        const [adiantamentos, invoices, casamentos, processamentos, declaracoes] =
            await Promise.all([
                this.relationalRepository.listAdiantamentosAtivos(),
                this.relationalRepository.listInvoicesEmAberto(),
                this.relationalRepository.listCasamentos(),
                this.processamentoRepository.listProcessamentos(),
                this.relationalRepository.listDeclaracoes(),
            ]);

        const statusByDocCod = new Map<string, ProcessamentoStatus>(
            processamentos.map((p) => [p.adiantamentoDocCod, p.status]),
        );
        const invoiceByDocCod = new Map<string, InvoiceRow>(invoices.map((i) => [i.docCod, i]));
        // Detalhe: declaração por processo (1ª variante DI/DUIMP) + casamento por
        // adiantamento (taxa/variação só existem para os casos casados).
        const declaracaoByPriCod = new Map<string, DeclaracaoRow>();
        for (const d of declaracoes) {
            if (!declaracaoByPriCod.has(d.priCod)) declaracaoByPriCod.set(d.priCod, d);
        }
        const casamentoByAdtoDocCod = new Map<string, CasamentoRow>(
            casamentos.map((c) => [c.adiantamentoDocCod, c]),
        );

        // Invoices em aberto agrupadas por processo (priCod) — base das candidatas
        // do casamento manual N:M (o analista escolhe UMA do mesmo processo).
        const invoicesByPriCod = new Map<string, InvoiceRow[]>();
        for (const i of invoices) {
            const lista = invoicesByPriCod.get(i.priCod) ?? [];
            lista.push(i);
            invoicesByPriCod.set(i.priCod, lista);
        }

        const pendentes = adiantamentos.map((a) =>
            this.toPendente(
                a,
                statusByDocCod,
                invoicesByPriCod,
                declaracaoByPriCod,
                casamentoByAdtoDocCod,
            ),
        );
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
        const jaPermutado = pendentes.filter((p) => p.status === 'ja-permutado').length;

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
                jaPermutado,
            },
        };
    };

    private toPendente = (
        a: AdiantamentoAtivo,
        statusByDocCod: Map<string, ProcessamentoStatus>,
        invoicesByPriCod: Map<string, InvoiceRow[]>,
        declaracaoByPriCod: Map<string, DeclaracaoRow>,
        casamentoByAdtoDocCod: Map<string, CasamentoRow>,
    ): PermutaPendente => {
        // "Já permutado" é gravado como BLOQUEADA+motivo `ja-permutado` (estado
        // concluído, não erro). Aqui na apresentação é promovido a status próprio,
        // pra sair do balde de bloqueadas e virar filtro/KPI separado — sem novo
        // estado no banco (zero migration/reseed).
        const status: StatusElegibilidade =
            a.estadoElegibilidade === 'elegivel'
                ? 'elegivel'
                : a.estadoElegibilidade === 'casamento-manual'
                  ? 'casamento-manual'
                  : a.motivoBloqueio === 'ja-permutado'
                    ? 'ja-permutado'
                    : 'bloqueada';
        const processamentoStatus = statusByDocCod.get(a.docCod);
        // Casamento manual (N:M): candidatas = invoices em aberto do MESMO processo.
        const candidatas =
            status === 'casamento-manual'
                ? (invoicesByPriCod.get(a.priCod) ?? []).map((i) => this.toInvoiceEmAberto(i))
                : undefined;
        const detalhe = this.toDetalhe(a, declaracaoByPriCod, casamentoByAdtoDocCod);
        return {
            docCod: a.docCod,
            filCod: a.filCod ?? 0,
            referencia: a.referencia ?? a.docCod,
            exportador: a.exportador ?? '',
            // `null` quando não buscado (não-pago) → a tela mostra "-".
            valorMoedaNegociada: a.valorMoedaNegociada ?? null,
            // Valor de face em BRL (vem do list — presente até em não-pagos).
            valorBrl: a.valor ?? null,
            // A coluna exibe `valorMoedaNegociada` (moeda ESTRANGEIRA do título):
            // o rótulo deve ser a moeda NEGOCIADA (USD), não a do documento (BRL).
            moeda: a.moedaNegociada ?? a.moeda ?? 'USD',
            diasEmAberto: a.agingDays ?? null,
            status,
            ...(a.motivoBloqueio !== undefined ? { motivoBloqueio: a.motivoBloqueio } : {}),
            ...(processamentoStatus !== undefined ? { processamentoStatus } : {}),
            ...(candidatas !== undefined ? { candidatas } : {}),
            detalhe,
        };
    };

    /**
     * Monta as micro-informações do adiantamento (exibidas ao expandir a linha).
     * `declaracao` vem do processo (priCod); taxa/variação só existem quando há
     * casamento (elegíveis/casamento) — bloqueados/já-permutados não têm.
     */
    private toDetalhe = (
        a: AdiantamentoAtivo,
        declaracaoByPriCod: Map<string, DeclaracaoRow>,
        casamentoByAdtoDocCod: Map<string, CasamentoRow>,
    ): PermutaDetalhe => {
        const variacao = this.variacaoDetalhe(casamentoByAdtoDocCod.get(a.docCod));
        return {
            priCod: a.priCod,
            pago: a.pago,
            ...(a.dataEmissao !== undefined ? { dataEmissao: a.dataEmissao.toISOString() } : {}),
            ...(a.valorPermutar !== undefined ? { valorPermutar: a.valorPermutar } : {}),
            ...this.declaracaoDetalhe(declaracaoByPriCod.get(a.priCod)),
            ...variacao,
            // Não-casados não têm `permuta_casamento`, mas a taxa do PRÓPRIO título
            // existe (com308 → coluna `taxa`): usa como fallback p/ "Taxa adiantamento".
            ...(variacao.taxaAdiantamento === undefined && a.taxa !== undefined
                ? { taxaAdiantamento: a.taxa }
                : {}),
        };
    };

    /** Parte do detalhe vinda da declaração do processo (D.I/DUIMP). */
    private declaracaoDetalhe = (decl?: DeclaracaoRow): Pick<PermutaDetalhe, 'declaracao'> => {
        if (decl === undefined) return {};
        return {
            declaracao: {
                variante: decl.variante,
                ...(decl.dataBase !== undefined ? { dataBase: decl.dataBase.toISOString() } : {}),
            },
        };
    };

    /** Parte do detalhe vinda do casamento (taxa/variação) — só p/ casados. */
    private variacaoDetalhe = (
        cas?: CasamentoRow,
    ): Pick<
        PermutaDetalhe,
        | 'taxaAdiantamento'
        | 'taxaInvoice'
        | 'variacaoClassificacao'
        | 'variacaoResultado'
        | 'variacaoDelta'
    > => {
        if (cas === undefined) return {};
        return {
            ...(cas.taxaAdiantamento !== undefined
                ? { taxaAdiantamento: cas.taxaAdiantamento }
                : {}),
            ...(cas.taxaInvoice !== undefined ? { taxaInvoice: cas.taxaInvoice } : {}),
            ...(cas.variacaoClassificacao !== undefined
                ? { variacaoClassificacao: cas.variacaoClassificacao }
                : {}),
            ...(cas.variacaoResultado !== undefined
                ? { variacaoResultado: cas.variacaoResultado }
                : {}),
            ...(cas.variacaoDelta !== undefined ? { variacaoDelta: cas.variacaoDelta } : {}),
        };
    };

    private toInvoiceEmAberto = (i: InvoiceRow): InvoiceEmAberto => ({
        docCod: i.docCod,
        filCod: i.filCod ?? 0,
        priCod: i.priCod,
        referencia: i.referencia ?? i.docCod,
        exportador: i.exportador ?? '',
        valorMoedaNegociada: i.valorMoedaNegociada ?? null,
        // Valor de face em BRL — base da consolidação em reais.
        valorBrl: i.valor ?? null,
        // Rótulo da moeda NEGOCIADA (USD), não a do documento (BRL).
        moeda: i.moedaNegociada ?? i.moeda ?? 'USD',
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
                    // Processo (priCod) — número em comum invoice×adiantamento,
                    // chave de reconciliação manual no Conexos.
                    priCod: c.priCod,
                    invoice: inv
                        ? this.toInvoiceEmAberto(inv)
                        : {
                              docCod: c.invoiceDocCod,
                              filCod: 0,
                              referencia: c.invoiceDocCod,
                              exportador: '',
                              valorMoedaNegociada: 0,
                              valorBrl: null,
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
                // Moeda NEGOCIADA do adiantamento (USD). `c.moeda` já é a sigla
                // negociada (ingestão), mas o `adto` lido é a fonte mais fresca.
                moeda: adto?.moedaNegociada ?? c.moeda ?? adto?.moeda ?? 'USD',
                ...(processamentoStatus !== undefined ? { processamentoStatus } : {}),
            });
        }
        return [...grupos.values()];
    };
}
