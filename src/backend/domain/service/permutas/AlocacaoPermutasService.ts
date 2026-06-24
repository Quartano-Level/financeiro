import { inject, injectable } from 'tsyringe';
import ConexosClient, { siglaMoedaNegociada } from '../../client/ConexosClient.js';
import AlocacaoSaldoError from '../../errors/AlocacaoSaldoError.js';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import PermutaAlocacaoRepository from '../../repository/permutas/PermutaAlocacaoRepository.js';
import PermutaRelationalRepository from '../../repository/permutas/PermutaRelationalRepository.js';
import LogService from '../LogService.js';
import VariacaoCambialPermutaService from './VariacaoCambialPermutaService.js';

/** Invoice encontrada na busca cross-process (live no Conexos), p/ a alocação manual. */
export interface InvoiceBuscada {
    docCod: string;
    priCod: string;
    filCod: number;
    referencia?: string;
    exportador?: string;
    dataEmissao?: string;
    valorMoedaNegociada?: number;
    moeda?: string;
    taxa?: number;
    /** O processo da invoice tem D.I/DUIMP? (a alocação exige `true`). */
    temDi: boolean;
    /** Data-base da D.I (ISO) — âncora da variação/aging. */
    dataBase?: string;
    /**
     * Σ já alocado nesta invoice por OUTROS adiantamentos (exclui o adiantamento
     * que está alocando, quando informado). É o que o saldo da invoice já consumiu
     * num cenário N:M (invoice compartilhada). `valorMoedaNegociada − jaAlocado` =
     * disponível desta invoice — espelha o teto aplicado no `alocar`.
     */
    jaAlocado: number;
}

export interface AlocarInput {
    adiantamentoDocCod: string;
    invoiceDocCod: string;
    invoicePriCod: string;
    valorAlocado: number;
    criadoPor: string;
    observacao?: string;
}

/** Soma `valorNegociado` de todas as parcelas (com308) de um documento. */
const somaValorNegociado = (
    titulos: ReadonlyArray<{ valorNegociado?: number }>,
): number | undefined => {
    const comValor = titulos.filter((t) => t.valorNegociado !== undefined);
    if (comValor.length === 0) return undefined;
    return comValor.reduce((acc, t) => acc + (t.valorNegociado ?? 0), 0);
};

/**
 * AlocacaoPermutasService — alocação manual N:M CROSS-PROCESS (Fase 2).
 *
 * O analista, a partir de um adiantamento `permuta-manual`, busca invoices de
 * QUALQUER processo (live no Conexos) e distribui valores parciais. READ-ONLY no
 * ERP — a única escrita é a tabela própria `permuta_alocacao` (a baixa em `fin010`
 * é a Fase 3). Invariantes de saldo (em moeda NEGOCIADA): Σ por adto ≤ saldo a
 * permutar; Σ por invoice ≤ valor em aberto. Invoice DEVE ter D.I/DUIMP.
 */
@injectable()
export default class AlocacaoPermutasService {
    constructor(
        @inject(ConexosClient) private conexosClient: ConexosClient,
        @inject(VariacaoCambialPermutaService)
        private variacaoCambialService: VariacaoCambialPermutaService,
        @inject(PermutaAlocacaoRepository)
        private alocacaoRepository: PermutaAlocacaoRepository,
        @inject(PermutaRelationalRepository)
        private relationalRepository: PermutaRelationalRepository,
        @inject(LogService) private logService: LogService,
    ) {}

    /**
     * Busca LIVE as INVOICEs FINALIZADAS de um processo NA FILIAL dada, enriquece com
     * valor/taxa negociada (com308) e marca se o processo tem D.I/DUIMP.
     *
     * IMPORTANTE: o `priCod` NÃO é único entre filiais (cada filial numera seus
     * processos) — ex.: "523" na filial 4 = ZHEJIANG VOB, "523" na filial 6 = THE
     * ABSOLUT COMPANY. Por isso a busca é SEMPRE escopada à filial do adiantamento.
     *
     * `excludeAdtoDocCod` (opcional): ao buscar para um adiantamento específico,
     * o `jaAlocado` de cada invoice soma o que OUTROS adiantamentos já alocaram
     * nela (excluindo este) — assim a UI mostra o disponível real da invoice
     * compartilhada (N:M), idêntico ao teto que o `alocar` aplica.
     */
    public buscarInvoices = async (
        priCod: string,
        filCod: number,
        excludeAdtoDocCod?: string,
    ): Promise<InvoiceBuscada[]> => {
        const { invoices: todas } = await this.conexosClient.listFinanceiroAPagar({
            priCods: [priCod],
            docTip: 'INVOICE',
            filCod,
        });
        if (todas.length === 0) return [];
        // D.I do processo nesta filial (a alocação exige; é a âncora da variação).
        const declaracoes = await this.conexosClient.listDeclaracaoByProcesso({
            priCods: [priCod],
            filCod,
        });
        const decl = declaracoes[0];
        const dataBase = decl?.dataBase;
        const mapeadas = await Promise.all(
            todas.map(async (i): Promise<InvoiceBuscada | null> => {
                // EM ABERTO vem do DETALHE — o `pago`/`aberto` da lista vem null
                // (inconfiável, mesmo motivo do gate-3). Uma invoice já liquidada
                // (pago) não tem crédito a abater → fora da permuta.
                let aberta = true;
                try {
                    const det = await this.conexosClient.getDetalheTitulos({
                        docCod: i.docCod,
                        filCod,
                    });
                    aberta = det.pago !== true;
                } catch {
                    // detalhe indisponível — conservador: mantém (não esconde possível em-aberto).
                }
                if (!aberta) return null;
                let valorMoedaNegociada: number | undefined;
                let moeda: string | undefined = i.moeda;
                let taxa: number | undefined;
                try {
                    const tit = await this.conexosClient.listTitulosAPagar({
                        docCod: i.docCod,
                        filCod,
                    });
                    valorMoedaNegociada = somaValorNegociado(tit);
                    moeda = (tit[0] ? siglaMoedaNegociada(tit[0]) : undefined) ?? i.moeda;
                    taxa = tit[0]?.taxa;
                } catch {
                    // com308 indisponível — segue sem valor/taxa negociada.
                }
                // Quanto OUTROS adiantamentos já alocaram nesta invoice (N:M): o
                // disponível mostrado na UI = valorMoedaNegociada − jaAlocado.
                const jaAlocado = await this.alocacaoRepository.sumByInvoice(
                    i.docCod,
                    excludeAdtoDocCod,
                );
                return {
                    docCod: i.docCod,
                    priCod: i.priCod,
                    filCod,
                    ...(i.referencia !== undefined ? { referencia: i.referencia } : {}),
                    ...(i.exportador !== undefined ? { exportador: i.exportador } : {}),
                    ...(i.dataEmissao !== undefined
                        ? { dataEmissao: i.dataEmissao.toISOString() }
                        : {}),
                    ...(valorMoedaNegociada !== undefined ? { valorMoedaNegociada } : {}),
                    ...(moeda !== undefined ? { moeda } : {}),
                    ...(taxa !== undefined ? { taxa } : {}),
                    temDi: decl !== undefined,
                    ...(dataBase !== undefined ? { dataBase: dataBase.toISOString() } : {}),
                    jaAlocado,
                };
            }),
        );
        return mapeadas.filter((x): x is InvoiceBuscada => x !== null);
    };

    /**
     * Cria/atualiza uma alocação adto↔invoice (rascunho). Re-busca a invoice LIVE
     * (saldo/taxa/D.I atuais), valida os invariantes de saldo dos dois lados,
     * recalcula a variação cambial pela taxa da invoice + valor alocado e persiste.
     */
    public alocar = async (input: AlocarInput): Promise<void> => {
        const { adiantamentoDocCod, invoiceDocCod, invoicePriCod, valorAlocado } = input;
        if (!(valorAlocado > 0)) {
            throw new AlocacaoSaldoError({
                lado: 'adiantamento',
                disponivel: 0,
                pedido: valorAlocado,
            });
        }

        const adto = await this.relationalRepository.findAdiantamento(adiantamentoDocCod);
        if (!adto) throw new Error(`adiantamento ${adiantamentoDocCod} not found`);

        // Múltiplas/cross-over (casamento-manual) só permutam no MESMO processo do
        // adiantamento; só cross-process (permuta-manual = cliente-filtro) casa com
        // invoice de OUTRO processo. Rede de segurança contra alocação cross-process indevida.
        if (adto.estadoElegibilidade === 'casamento-manual' && invoicePriCod !== adto.priCod) {
            throw new Error(
                `same-process allocation required: invoice process ${invoicePriCod} != adiantamento process ${adto.priCod}`,
            );
        }

        // Invoice ao vivo — fonte confiável de saldo/taxa/D.I. Escopada à filial do
        // adiantamento (priCod não é único entre filiais).
        if (adto.filCod === undefined) {
            throw new Error(`adiantamento ${adiantamentoDocCod} without filial`);
        }
        const invoices = await this.buscarInvoices(invoicePriCod, adto.filCod);
        const invoice = invoices.find((i) => i.docCod === invoiceDocCod);
        if (!invoice)
            throw new Error(`invoice ${invoiceDocCod} not found in process ${invoicePriCod}`);
        if (!invoice.temDi) {
            throw new Error(`invoice ${invoiceDocCod} without D.I/DUIMP — cannot be permuted`);
        }

        // Moeda negociada do adto e da invoice DEVEM coincidir — não se permuta um
        // adiantamento em USD contra uma invoice em BRL (moedas distintas; o saldo e a
        // variação cambial não fariam sentido). Compara só quando ambas são conhecidas.
        if (
            adto.moedaNegociada !== undefined &&
            invoice.moeda !== undefined &&
            adto.moedaNegociada !== invoice.moeda
        ) {
            throw new Error(
                `currency mismatch: adiantamento ${adto.moedaNegociada} != invoice ${invoice.moeda}`,
            );
        }

        // Saldo do ADIANTAMENTO (em moeda negociada): saldoPermutar(BRL) / taxaAdto.
        const taxaAdto = adto.taxa;
        const saldoAdtoNeg =
            adto.valorPermutar !== undefined && taxaAdto !== undefined && taxaAdto > 0
                ? adto.valorPermutar / taxaAdto
                : undefined;
        const jaAdto = await this.alocacaoRepository.sumByAdiantamento(
            adiantamentoDocCod,
            invoiceDocCod,
        );
        if (saldoAdtoNeg !== undefined && valorAlocado > saldoAdtoNeg - jaAdto + 0.005) {
            throw new AlocacaoSaldoError({
                lado: 'adiantamento',
                disponivel: Math.max(0, saldoAdtoNeg - jaAdto),
                pedido: valorAlocado,
            });
        }

        // Saldo da INVOICE (valor em aberto, moeda negociada).
        const saldoInvoiceNeg = invoice.valorMoedaNegociada;
        const jaInvoice = await this.alocacaoRepository.sumByInvoice(
            invoiceDocCod,
            adiantamentoDocCod,
        );
        if (saldoInvoiceNeg !== undefined && valorAlocado > saldoInvoiceNeg - jaInvoice + 0.005) {
            throw new AlocacaoSaldoError({
                lado: 'invoice',
                disponivel: Math.max(0, saldoInvoiceNeg - jaInvoice),
                pedido: valorAlocado,
            });
        }

        // Variação cambial pela taxa da INVOICE escolhida + valor alocado (parcial).
        const moeda = adto.moedaNegociada ?? invoice.moeda ?? 'USD';
        const variacao =
            taxaAdto !== undefined && invoice.taxa !== undefined
                ? this.variacaoCambialService.calcular({
                      moeda,
                      principalMoeda: valorAlocado,
                      taxaAdiantamento: taxaAdto,
                      taxaInvoice: invoice.taxa,
                      ...(invoice.dataBase !== undefined
                          ? { dataBase: new Date(invoice.dataBase) }
                          : {}),
                  })
                : undefined;

        await this.alocacaoRepository.upsertAlocacao({
            adiantamentoDocCod,
            invoiceDocCod,
            invoicePriCod,
            valorAlocado,
            moeda,
            ...(variacao?.classificacao !== undefined
                ? { variacaoClassificacao: variacao.classificacao }
                : {}),
            ...(variacao?.resultado !== undefined ? { variacaoResultado: variacao.resultado } : {}),
            ...(variacao?.delta !== undefined ? { variacaoDelta: variacao.delta } : {}),
            ...(taxaAdto !== undefined ? { taxaAdiantamento: taxaAdto } : {}),
            ...(invoice.taxa !== undefined ? { taxaInvoice: invoice.taxa } : {}),
            // Data-base da D.I/DUIMP → vira a Data do borderô (borDtaMvto) na baixa fin010.
            ...(invoice.dataBase !== undefined ? { dataBase: new Date(invoice.dataBase) } : {}),
            criadoPor: input.criadoPor,
            ...(input.observacao !== undefined ? { observacao: input.observacao } : {}),
        });

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'permuta alocacao manual gravada',
            data: { adiantamentoDocCod, invoiceDocCod, invoicePriCod, valorAlocado },
        });
    };

    public remover = async (adiantamentoDocCod: string, invoiceDocCod: string): Promise<void> => {
        await this.alocacaoRepository.deleteAlocacao(adiantamentoDocCod, invoiceDocCod);
    };
}
