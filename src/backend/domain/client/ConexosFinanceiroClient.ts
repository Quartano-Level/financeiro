import { inject, injectable, singleton } from 'tsyringe';
import type {
    AdiantamentoFinanceiroInterface,
    AdiantamentoTipo,
} from '../interface/closing-reports/AdiantamentoFinanceiro.js';
import type InvoiceLancamento from '../interface/closing-reports/Invoice.js';
import type Proforma from '../interface/closing-reports/Proforma.js';
import type Adiantamento from '../interface/permutas/Adiantamento.js';
import ConexosBaseClient, { chunked } from './ConexosBaseClient.js';
import {
    ADIANTAMENTO_FILTER_KEY,
    ADIANTAMENTO_FILTER_VALUE,
    TPD_PROFORMA as PERMUTA_TPD_PROFORMA,
    VLD_STATUS_FINALIZADO as PERMUTA_VLD_FINALIZADO,
} from './permutas/conexosPermutasConstants.js';
import { com298RowSchema } from './permutas/conexosPermutasSchemas.js';

/**
 * Documento financeiro a-pagar (`com298/list`) emitido pelo novo método
 * `listFinanceiroAPagarByGerNum`. Cobre os planos financeiros consumidos
 * pelo `VariacaoCambialService` (Addendum #9 ADR-0020, 2026-06-01):
 *
 *   - `gerNum=198` → `ADTO FORNECEDOR INTERNACIONAIS` (caminho PROFORMA, conta 1.1.5.1.0002)
 *   - `gerNum=21`  → `FORNECEDORES EXTERIOR - POR ENCOMENDA` (caminho INVOICE, conta 2.1.2.2.0001)
 *   - `gerNum=276` → `EMPRÉSTIMO INTERNACIONAL` (mesma fórmula INVOICE, conta 2.1.1.1.0005)
 *
 * Estrutura "unificada" — caller diferencia pelo `gerNum` (ou pelo
 * `gerDes` literal exibido na UI/XLSX).
 *
 * `mnyTitPermutar` NÃO vem do `com298/list` — validado empiricamente
 * 2026-06-01 que a coluna não é selecionável (`ORA-00904` no Oracle).
 * O caller hidrata via `getDetalheTitulos(docCod)` (detail endpoint
 * `GET /com298/{docCod}`) per documento que precisar do valor (consumido
 * pelo `VariacaoCambialService` para `gerNum=198`). O campo aqui é
 * sempre `undefined` por enquanto, mantido na interface para
 * compatibilidade futura caso o Conexos passe a popular no list.
 * O método antigo `listFinanceiroAPagar` (que filtra por `tpdCod#EQ`)
 * permanece exportado para uso de FM/JVE.
 */
export interface DocFinanceiroAPagar {
    docCod: string;
    priCod: string;
    dataEmissao: Date;
    /** `gerNum` literal do plano financeiro (numérico). */
    gerNum: number;
    /** `gerDes` literal do plano financeiro (string, exibido na UI/XLSX). */
    gerDes: string;
    valor: number;
    moeda: string;
    pago: boolean;
    exportador?: string;
    /**
     * Destino do pagamento do documento (`com298.dpeNomPessoa` literal) —
     * Addendum #10 ADR-0020 (2026-06-05). Campo DEDICADO, distinto de
     * `exportador` (que continua coalescendo `exportador ?? dpeNomPessoa`
     * para FM/JVE). Consumido pelo `VariacaoCambialService` para a coluna
     * "Cliente" (re-fonte D10b). `undefined` quando o `com298/list` omite o
     * campo — a normalização para `''` é responsabilidade do service (D10f).
     */
    dpeNomPessoa?: string;
    /**
     * `com298.pesCod` literal — identificador interno do destino do pagamento
     * ("Cliente"). Consumido pelo `VariacaoCambialService` para a coluna
     * "pesCod" (Addendum 2026-06-08 #2 do ADR-0021), distinta do `pesCod` do
     * importador (`ProcessoListItem.pesCod`). `undefined` quando o
     * `com298/list` (chamado com `fieldList: []`) omite o campo no payload
     * default — normalização para `''` é responsabilidade do service.
     */
    pesCod?: string;
    /**
     * `mnyTitPermutar` literal do `com298/list` quando o Conexos popular o
     * campo. `undefined` quando o list retorna `null` (caso atual em
     * produção 2026-06-01) — caller deve hidratar via `getDetalheTitulos`
     * apenas para os docs `gerNum=198`.
     */
    mnyTitPermutar?: number;
}

/** Conexos `tpdCod` discriminators for the financial document types we consume. */
const TPD_PROFORMA = 99;
const TPD_INVOICE = 128;

/**
 * Conexos `vldStatus` enum:
 *   1 = rascunho, 2 = aberto, 3 = finalizado, 7 = baixado/encerrado.
 * Closing-report queries (com297/com298/com299) must restrict to
 * FINALIZADO so unfinished docs cannot leak into Faturado / Δ Aberto /
 * Juros calculations (Yuri 2026-05-07).
 */
const VLD_STATUS_FINALIZADO = ['3'] as const;

/**
 * `IMPLANTAÇÃO DE SALDO FINANCEIRO (EFEITO CONTÁBIL)` — tpdCod that drives the
 * AdiantamentoFinanceiro flow (v0.4, ADR-0013). Single doc-type used on both
 * com298 (lado-débito ADTO_FORN_INT) and com299 (lado-crédito ADTO_CLIENTE_*).
 *
 * Resolved empirically via priCod=1153 probe (2026-05-11). Evidence:
 * `ontology/_inbox/implantacao-saldo-financeiro-conexos-ids.md`.
 */
const TPD_IMPLANTACAO_SALDO = 143;

/**
 * Plano financeiro (`gerNum` — NOT `gerCod`; `FinDocCab` does NOT expose
 * `gerCod` and filtering by it returns HTTP 500). Discriminates the 3
 * sub-types of AdiantamentoFinanceiro inside `tpdCod=TPD_IMPLANTACAO_SALDO`.
 *
 *   - `GER_ADTO_FORN_INT`    (198) → `ADTO FORNECEDOR INTERNACIONAIS` (débito)
 *   - `GER_ADTO_CLIENTE_EXT` (210) → `ADTO. CLIENTE - EXT.`            (crédito)
 *   - `GER_ADTO_CLIENTE_NAC` (233) → `ADTO. CLIENTE - NAC.`            (crédito)
 */
const GER_ADTO_FORN_INT = 198;
const GER_ADTO_CLIENTE_EXT = 210;
const GER_ADTO_CLIENTE_NAC = 233;

/**
 * IDs numéricos do plano financeiro que caracterizam o evento de permuta cambial
 * em cada lado do FIFO. Usados pela regra `valor-permutar-ponto-no-tempo`
 * (ontology/business-rules/) para distinguir permutas das demais baixas
 * (bancárias, conta transitória, etc).
 *
 * Wire-string equivalente (uso permitido apenas em diagnóstico, NÃO em filtros
 * de produção — vide `exposicao-fifo-saldo-aberto` linha 75-78):
 *   - 9  → "CLIENTES DIVERSOS - POR ENCOMENDA"     (com309 — a-receber)
 *   - 21 → "FORNECEDORES EXTERIOR - POR ENCOMENDA" (com308 — a-pagar)
 *
 * Confirmados empiricamente Yuri 2026-05-12 contra docCods 2733 / 9094 / 17093
 * (priCod=1153 da Columbia Trading filCod=2).
 */
export const GER_PERMUTA_ARECEBER = 9;
export const GER_PERMUTA_APAGAR = 21;

/**
 * Plano financeiro "CLIENTES DIVERSOS - OP PROPRIA" (gerNum=4 no Conexos).
 * Movimento de reclassificação contábil entre contas-correntes da Trading;
 * NÃO representa desembolso real a fornecedor. Usado pela regra
 * `invoice-permutar-via-baixas` (ontology/business-rules/) para EXCLUIR
 * baixas desse plano da soma de desembolso em INVOICE, junto com `gerNum=9`
 * (PERMUTA_ARECEBER, lado-credor incorretamente lançado em a-pagar).
 */
export const GER_CLIENTES_DIVERSOS_OP_PROPRIA = 4;

/**
 * Conexos ERP financeiro a-pagar/receber family (`com298`/`com299`):
 * PROFORMA/INVOICE listing, adiantamentos PROFORMA, invoices finalizadas,
 * docs por `gerNum`, and the AdiantamentoFinanceiro débito/crédito sides.
 * Owns the shared `mapDocPagar` mapper. Shares auth + pagination via
 * `ConexosBaseClient`.
 *
 * Behaviour is IDENTICAL to the former `ConexosClient` methods of the same
 * name — only the owning class changed (CC-2 split by endpoint family).
 */
@singleton()
@injectable()
export default class ConexosFinanceiroClient {
    private base: ConexosBaseClient;

    constructor(@inject(ConexosBaseClient) base: ConexosBaseClient) {
        this.base = base;
    }

    public listFinanceiroAPagar = async (params: {
        priCods: string[];
        docTip: 'PROFORMA' | 'INVOICE';
        filCod: number;
    }): Promise<{ proformas: Proforma[]; invoices: InvoiceLancamento[] }> => {
        const { priCods, docTip, filCod } = params;
        const chunks = chunked(priCods);
        const tpdCod = docTip === 'PROFORMA' ? TPD_PROFORMA : TPD_INVOICE;

        const rows = (
            await Promise.all(
                chunks.map((batch) =>
                    this.base.paginate<Record<string, unknown>>({
                        endpoint: 'com298/list',
                        bodyBase: {
                            fieldList: [],
                            filterList: {
                                'priCod#IN': batch,
                                'tpdCod#EQ': tpdCod,
                                'vldStatus#IN': VLD_STATUS_FINALIZADO,
                            },
                            serviceName: 'com298',
                        },
                        priCodsBatch: batch,
                        opts: { filCod },
                    }),
                ),
            )
        ).flat();

        const proformas: Proforma[] = [];
        const invoices: InvoiceLancamento[] = [];
        for (const row of rows) {
            const mapped = this.mapDocPagar(row);
            if (docTip === 'PROFORMA') {
                const proforma: Proforma = {
                    docCod: mapped.docCod,
                    priCod: mapped.priCod,
                    dataEmissao: mapped.dataEmissao,
                    valor: mapped.valor,
                    moeda: mapped.moeda,
                    pago: mapped.pago,
                    exportador: mapped.exportador,
                };
                // Addendum #8 ADR-0020 (2026-06-01): `valorPermutar` é
                // propagado quando o `com298/list` retorna `mnyTitPermutar`
                // (validated empirically em produção via curl real). FM/JVE
                // sobrescrevem este valor downstream via
                // `LancamentoFinanceiroBaixaService.hidratar` (residual FIFO
                // ponto-no-tempo). VariacaoCambialService consome literal.
                if (mapped.valorPermutar !== undefined) {
                    proforma.valorPermutar = mapped.valorPermutar;
                }
                proformas.push(proforma);
            } else {
                const invoice: InvoiceLancamento = {
                    docCod: mapped.docCod,
                    priCod: mapped.priCod,
                    dataEmissao: mapped.dataEmissao,
                    valor: mapped.valor,
                    moeda: mapped.moeda,
                    pago: mapped.pago,
                    exportador: mapped.exportador,
                    faturada: Boolean(row.faturada ?? row.flagFaturada ?? false),
                    ...(mapped.referencia !== undefined ? { referencia: mapped.referencia } : {}),
                    ...(mapped.referenciaExterna !== undefined
                        ? { referenciaExterna: mapped.referenciaExterna }
                        : {}),
                };
                if (mapped.valorPermutar !== undefined) {
                    invoice.valorPermutar = mapped.valorPermutar;
                }
                invoices.push(invoice);
            }
        }
        // Nota: o `mnyTitPermutar` LITERAL do Conexos (saldo a permutar
        // disponível, mirror da UI) NÃO é retornado pelo `com298/list`
        // (campo `null` no list, validado empiricamente 2026-06-01). Para
        // obter o valor real, use `getDetalheTitulos(docCod, filCod)` que
        // bate em `GET /com298/{docCod}` per documento. Esse fan-out é
        // consumido apenas por `VariacaoCambialService` (PROFORMA, Addendum
        // #8 ADR-0020). `FechamentoMensalService` / `JurosEsperadoService`
        // sobrescrevem `valorPermutar` via `LancamentoFinanceiroBaixaService.
        // hidratar` (residual ponto-no-tempo, regra `valor-permutar-ponto-
        // no-tempo`) — caminho independente do list/detail.
        return { proformas, invoices };
    };

    /**
     * Eleição de Permutas (Fatia 1, ação `elegerAdiantamentos`): lista TODAS as
     * PROFORMA finalizadas marcadas como Adiantamento (3 filtros: Tipo=PROFORMA,
     * Situação=FINALIZADO, Adiantamento=SIM), SEM filtro de `priCod` (P0-7: lista
     * todas, multi-filial, sem janela incremental). Reusa `paginate`.
     *
     * 🔬 BUILD-PROBE (P0-3): o LITERAL da chave wire `adiantamento` está isolado
     * em `ADIANTAMENTO_FILTER_KEY` (ponto único). O método/teste fecham verde com
     * o placeholder — o teste assere a PRESENÇA da chave, não o valor de produção.
     *
     * `valorPermutar` NÃO vem do list (`mnyTitPermutar` é null no list) — o caller
     * hidrata via `getDetalheTitulos(docCod)` por candidato (Gate 2).
     */
    public listAdiantamentosProforma = async (params: {
        filCod: number;
    }): Promise<{ adiantamentos: Adiantamento[]; capHit: boolean }> => {
        const { filCod } = params;
        let capHit = false;
        const rows = await this.base.paginate<Record<string, unknown>>({
            endpoint: 'com298/list',
            bodyBase: {
                fieldList: [],
                filterList: {
                    'tpdCod#EQ': PERMUTA_TPD_PROFORMA,
                    'vldStatus#IN': PERMUTA_VLD_FINALIZADO,
                    [ADIANTAMENTO_FILTER_KEY]: ADIANTAMENTO_FILTER_VALUE,
                },
                serviceName: 'com298',
            },
            opts: { filCod },
            onCapHit: () => {
                capHit = true;
            },
        });

        const adiantamentos = rows.map<Adiantamento>((row) => {
            // Zod no boundary — rejeita rows sem identidade; coage ids p/ string.
            const validated = com298RowSchema.parse(row);
            const mapped = this.mapDocPagar(row);
            const adiantamento: Adiantamento = {
                docCod: validated.docCod,
                priCod: validated.priCod,
                // P0-2 — invariante multi-filial I6. Preferimos o `filCod` da
                // ROW do Conexos quando presente; caso contrário usamos a filial
                // sob a qual a página foi consultada (param `filCod`). Nunca NULL.
                filCod: this.base.parseOptionalNumber(row.filCod) ?? filCod,
                dataEmissao: mapped.dataEmissao,
                valor: mapped.valor,
                moeda: mapped.moeda,
                pago: mapped.pago,
                ...(mapped.exportador !== undefined ? { exportador: mapped.exportador } : {}),
                ...(mapped.referencia !== undefined ? { referencia: mapped.referencia } : {}),
                ...(mapped.referenciaExterna !== undefined
                    ? { referenciaExterna: mapped.referenciaExterna }
                    : {}),
                ...(mapped.valorPermutar !== undefined
                    ? { valorPermutar: mapped.valorPermutar }
                    : {}),
            };
            return adiantamento;
        });
        return { adiantamentos, capHit };
    };

    /**
     * Lista TODAS as INVOICEs finalizadas da filial (tpdCod=INVOICE, situacao=FINALIZADO), SEM
     * filtro de `priCod` — espelha a busca com298 do analista (não só as casadas com adiantamento).
     * Básico (sem com308): docCod/priCod/exportador/valor/pago. Alimenta a vista "Invoices em aberto"
     * com o universo completo (a ingestão filtra `pago` depois). Reusa `paginate`.
     */
    public listInvoicesFinalizadas = async (params: {
        filCod: number;
    }): Promise<{ invoices: InvoiceLancamento[]; capHit: boolean }> => {
        const { filCod } = params;
        let capHit = false;
        const rows = await this.base.paginate<Record<string, unknown>>({
            endpoint: 'com298/list',
            bodyBase: {
                fieldList: [],
                filterList: {
                    'tpdCod#EQ': TPD_INVOICE,
                    'vldStatus#IN': VLD_STATUS_FINALIZADO,
                },
                serviceName: 'com298',
            },
            opts: { filCod },
            onCapHit: () => {
                capHit = true;
            },
        });

        // Zod no boundary (Regis P1 integrability): pula rows SEM identidade (docCod/priCod) — evita
        // doc/pri inválidos contaminando o cache/ingestão. Coerência com `listAdiantamentosProforma`.
        const invoices = rows.flatMap<InvoiceLancamento>((row) => {
            if (!com298RowSchema.safeParse(row).success) return [];
            const mapped = this.mapDocPagar(row);
            const invoice: InvoiceLancamento = {
                docCod: mapped.docCod,
                priCod: mapped.priCod,
                dataEmissao: mapped.dataEmissao,
                valor: mapped.valor,
                moeda: mapped.moeda,
                pago: mapped.pago,
                exportador: mapped.exportador,
                faturada: Boolean(row.faturada ?? row.flagFaturada ?? false),
                ...(mapped.referencia !== undefined ? { referencia: mapped.referencia } : {}),
                ...(mapped.referenciaExterna !== undefined
                    ? { referenciaExterna: mapped.referenciaExterna }
                    : {}),
            };
            return [invoice];
        });
        return { invoices, capHit };
    };

    /**
     * Lista documentos a-pagar do `com298/list` filtrando por um conjunto de
     * `gerNum` (plano financeiro), em vez do filtro `tpdCod#EQ` usado pelo
     * método antigo `listFinanceiroAPagar`. Introduzido pela refatoração da
     * Variação Cambial (Addendum #9 ADR-0020, 2026-06-01) — universo
     * canônico passa a ser `gerNum#IN: [198, 21, 276]`:
     *
     *   - `198` → ADTO FORNECEDOR INTERNACIONAIS (caminho PROFORMA)
     *   - `21`  → FORNECEDORES EXTERIOR - POR ENCOMENDA (caminho INVOICE)
     *   - `276` → EMPRÉSTIMO INTERNACIONAL (mesma fórmula INVOICE)
     *
     * Retorna uma lista única `DocFinanceiroAPagar[]` — caller diferencia
     * pelo `gerNum` (ou pelo `gerDes` literal). O `fieldList` inclui
     * `gerNum`, `gerDes` explicitamente para garantir que o Conexos
     * devolva esses campos (defaults variam por instalação).
     *
     * Implementação espelha a paginação + chunking de `listFinanceiroAPagar`.
     * Filtros estáticos: `vldStatus#IN: ['3']` (FINALIZADO).
     *
     * **`mnyTitPermutar` é fetch'd no detail.** Validado empiricamente
     * 2026-06-01 que `mnyTitPermutar` NÃO é coluna selecionável no list
     * (Oracle dispara `ORA-00904`). Caller hidrata via `getDetalheTitulos`
     * (1 chamada por candidato) — feito pelo `VariacaoCambialService`
     * apenas para docs `gerNum=198` (PROFORMA path).
     */
    public listFinanceiroAPagarByGerNum = async (params: {
        priCods: string[];
        gerNums: number[];
        filCod: number;
    }): Promise<DocFinanceiroAPagar[]> => {
        const { priCods, gerNums, filCod } = params;
        if (priCods.length === 0 || gerNums.length === 0) return [];
        const chunks = chunked(priCods);

        const rows = (
            await Promise.all(
                chunks.map((batch) =>
                    this.base.paginate<Record<string, unknown>>({
                        endpoint: 'com298/list',
                        bodyBase: {
                            // `fieldList: []` — segue o padrão do método antigo
                            // `listFinanceiroAPagar`. O `com298/list` rejeita
                            // várias colunas via Oracle `ORA-00904 invalid
                            // identifier` quando explicitamente listadas (campos
                            // de joins/agregados como `mnyTitAberto`,
                            // `mnyTitPermutar`, `moeEspSigla`) e via HTTP 500
                            // `Field 'pago' not found on model` (virtuais). O
                            // payload default já carrega tudo que precisamos:
                            // `docCod`, `priCod`, `docDtaEmissao`, `docMnyValor`,
                            // `gerNum`, `gerDes`, `dpeNomPessoa`, `mnyTitAberto`,
                            // `pago` etc. Validado empiricamente 2026-06-01.
                            // `mnyTitPermutar` fica exclusivamente no detail
                            // endpoint — caller hidrata via `getDetalheTitulos`
                            // (consumido pelo VC para `gerNum=198`).
                            fieldList: [],
                            filterList: {
                                'priCod#IN': batch,
                                'gerNum#IN': gerNums,
                                'vldStatus#IN': VLD_STATUS_FINALIZADO,
                            },
                            serviceName: 'com298',
                        },
                        priCodsBatch: batch,
                        opts: { filCod },
                    }),
                ),
            )
        ).flat();

        return rows.map<DocFinanceiroAPagar>((row) => {
            const docCod = String(row.docCod ?? '');
            const priCod = String(row.priCod ?? '');
            const dataEmissao = this.base.parseDate(row.dataEmissao ?? row.docDtaEmissao);
            const gerNum = Number(row.gerNum ?? 0);
            const gerDes = String(row.gerDes ?? '');
            const valor = Number(row.valor ?? row.docMnyValor ?? 0);
            const moeda = String(row.moeda ?? row.moeEspSigla ?? 'BRL');
            const pago = this.base.isPago(row);
            const exportador = row.exportador
                ? String(row.exportador)
                : row.dpeNomPessoa
                  ? String(row.dpeNomPessoa)
                  : undefined;
            // Addendum #10: campo dedicado `dpeNomPessoa` (destino do
            // pagamento). Lê a MESMA fonte `row.dpeNomPessoa`, mas
            // independente do coalesce de `exportador` acima — ambos
            // coexistem (D10c).
            const dpeNomPessoa = row.dpeNomPessoa ? String(row.dpeNomPessoa) : undefined;
            // `com298.pesCod` — id interno do destino do pagamento ("Cliente").
            // Lido do payload default (fieldList: []); o legacy
            // `getDocumentosAPagar` listava `pesCod` explicitamente, então o
            // campo existe no shape do com298. Defensivo: `undefined` se ausente.
            const pesCod = row.pesCod ? String(row.pesCod) : undefined;
            const mnyTitPermutar = this.base.parseOptionalNumber(row.mnyTitPermutar);
            const doc: DocFinanceiroAPagar = {
                docCod,
                priCod,
                dataEmissao,
                gerNum,
                gerDes,
                valor,
                moeda,
                pago,
                ...(exportador !== undefined ? { exportador } : {}),
                ...(dpeNomPessoa !== undefined ? { dpeNomPessoa } : {}),
                ...(pesCod !== undefined ? { pesCod } : {}),
                ...(mnyTitPermutar !== undefined ? { mnyTitPermutar } : {}),
            };
            return doc;
        });
    };

    /**
     * Lists IMPLANTAÇÃO DE SALDO FINANCEIRO documents on the débito side
     * (`com298/list`) filtered to the FORN_INT plano financeiro. These docs
     * enter the FIFO as full-face debit camadas (`ADTO_FORN_INT`, per
     * ADR-0013 and `exposicao-fifo-saldo-aberto` v0.4).
     *
     * Wire filters:
     *   - `tpdCod#EQ TPD_IMPLANTACAO_SALDO (=143)`
     *   - `gerNum#EQ GER_ADTO_FORN_INT (=198)`    ← NOT `gerCod`
     *   - `vldStatus#IN ['3']` (FINALIZADO)
     *
     * Empirical evidence (Yuri 2026-05-11, sonda priCod=1153):
     * `ontology/_inbox/implantacao-saldo-financeiro-conexos-ids.md`.
     */
    public listAdiantamentoFinanceiroAPagar = async (params: {
        priCods: string[];
        filCod: number;
    }): Promise<AdiantamentoFinanceiroInterface[]> => {
        const { filCod, priCods } = params;
        if (priCods.length === 0) return [];
        const chunks = chunked(priCods);
        const rows = (
            await Promise.all(
                chunks.map((batch) =>
                    this.base.paginate<Record<string, unknown>>({
                        endpoint: 'com298/list',
                        bodyBase: {
                            fieldList: [],
                            filterList: {
                                'priCod#IN': batch,
                                'tpdCod#EQ': TPD_IMPLANTACAO_SALDO,
                                // Yuri 2026-05-12: com298 tem DOIS planos financeiros
                                // possíveis na implantação de saldo financeiro —
                                // ADTO FORN INT (198) e ADTO CLIENTE NAC (233 débito).
                                // Use #IN ao invés de #EQ para cobrir os dois.
                                'gerNum#IN': [GER_ADTO_FORN_INT, GER_ADTO_CLIENTE_NAC],
                                'vldStatus#IN': VLD_STATUS_FINALIZADO,
                            },
                            serviceName: 'com298',
                        },
                        priCodsBatch: batch,
                        opts: { filCod },
                    }),
                ),
            )
        ).flat();

        return rows
            .map((row) => this.mapAdiantamentoDebito(row, filCod))
            .filter((d): d is AdiantamentoFinanceiroInterface => d !== null);
    };

    /**
     * Lists IMPLANTAÇÃO DE SALDO FINANCEIRO documents on the crédito side
     * (`com299/list`) filtered to the CLIENTE EXT/NAC planos financeiros.
     * These docs consume FIFO débito camadas alongside SolNum (per ADR-0013
     * and `exposicao-fifo-saldo-aberto` v0.4 AC adto-2 / adto-3).
     *
     * Wire filters:
     *   - `tpdCod#EQ TPD_IMPLANTACAO_SALDO (=143)`
     *   - `gerNum#IN [GER_ADTO_CLIENTE_EXT, GER_ADTO_CLIENTE_NAC]`   ← NOT `gerCod`
     *   - `vldStatus#IN ['3']` (FINALIZADO)
     *
     * The `gerNum#IN` filter must use a **numeric array** (`[210, 233]`,
     * not `['210', '233']`) — Conexos rejects string IDs on numeric columns.
     */
    public listAdiantamentoFinanceiroAReceber = async (params: {
        priCods: string[];
        filCod: number;
    }): Promise<AdiantamentoFinanceiroInterface[]> => {
        const { filCod, priCods } = params;
        if (priCods.length === 0) return [];
        const chunks = chunked(priCods);
        const rows = (
            await Promise.all(
                chunks.map((batch) =>
                    this.base.paginate<Record<string, unknown>>({
                        endpoint: 'com299/list',
                        bodyBase: {
                            fieldList: [],
                            filterList: {
                                'priCod#IN': batch,
                                'tpdCod#EQ': TPD_IMPLANTACAO_SALDO,
                                'gerNum#IN': [GER_ADTO_CLIENTE_EXT, GER_ADTO_CLIENTE_NAC],
                                'vldStatus#IN': VLD_STATUS_FINALIZADO,
                            },
                            serviceName: 'com299',
                        },
                        priCodsBatch: batch,
                        opts: { filCod },
                    }),
                ),
            )
        ).flat();

        return rows
            .map((row) => this.mapAdiantamentoCredito(row, filCod))
            .filter((d): d is AdiantamentoFinanceiroInterface => d !== null);
    };

    private mapDocPagar = (row: Record<string, unknown>) => ({
        docCod: String(row.docCod ?? ''),
        priCod: String(row.priCod ?? ''),
        dataEmissao: this.base.parseDate(row.dataEmissao ?? row.docDtaEmissao),
        valor: Number(row.valor ?? row.docMnyValor ?? 0),
        moeda: String(row.moeda ?? 'BRL'),
        pago: this.base.isPago(row),
        exportador: row.exportador
            ? String(row.exportador)
            : row.dpeNomPessoa
              ? String(row.dpeNomPessoa)
              : undefined,
        /**
         * Referência humana do documento. Vem de `docEspNumero` (nº/série do
         * doc), com fallback para `priEspRefcliente` (ref. externa do processo)
         * quando o doc não traz nº. Ambos já viajam no payload default do
         * `com298/list`. `undefined` quando nenhum dos dois existe.
         */
        referencia:
            row.docEspNumero != null && row.docEspNumero !== ''
                ? String(row.docEspNumero)
                : row.priEspRefcliente != null && row.priEspRefcliente !== ''
                  ? String(row.priEspRefcliente)
                  : undefined,
        // Referência EXTERNA do PROCESSO (cliente) — `priEspRefcliente` (ex.: "0052INX/26"), igual p/
        // todos os docs do processo. Distinta do nº do documento (`referencia`/docEspNumero). É a coluna
        // que a tela mostra. Separada porque o `referencia` acima prefere o nº do doc quando existe.
        referenciaExterna:
            row.priEspRefcliente != null && row.priEspRefcliente !== ''
                ? String(row.priEspRefcliente)
                : undefined,
        /**
         * `mnyTitPermutar` no `com298/list` (saldo a permutar disponível
         * conforme exibido na UI Conexos). **IMPORTANTE:** validado
         * empiricamente em 2026-06-01 que esse campo retorna `null` em
         * `com298/list`; só é populado em `GET /com298/{docCod}` (detail
         * endpoint). Mantemos o mapeamento aqui como no-op defensivo
         * (sempre `undefined` em produção) para compatibilidade futura
         * caso o Conexos passe a popular no list. O caminho real para
         * obter o `mnyTitPermutar` literal é via
         * `ConexosTitulosClient.getDetalheTitulos(docCod, filCod)` — fan-out
         * GET por documento, consumido por `VariacaoCambialService`.
         *
         * FM/JVE NÃO consomem este campo do list — chamam
         * `LancamentoFinanceiroBaixaService.hidratar` que sobrescreve
         * `valorPermutar` com o residual FIFO ponto-no-tempo conforme
         * regra `valor-permutar-ponto-no-tempo`. Semântica preservada.
         */
        valorPermutar: this.base.parseOptionalNumber(row.mnyTitPermutar),
    });

    /**
     * Maps a raw com298 row of `tpdCod=TPD_IMPLANTACAO_SALDO` into a
     * débito-side AdiantamentoFinanceiro. Always returns `direcao='debito'`
     * + `tipo='ADTO_FORN_INT'` because the caller already filtered by
     * `gerNum#EQ GER_ADTO_FORN_INT`.
     *
     * `dataBaixa` is left undefined here — hydrated post-fetch by
     * `LancamentoFinanceiroBaixaService.hidratarBaixaForAdiantamentos`.
     */
    private mapAdiantamentoDebito = (
        row: Record<string, unknown>,
        filCod: number,
    ): AdiantamentoFinanceiroInterface | null => {
        // Discriminate per gerNum:
        //   198 → ADTO_FORN_INT      (Adiantamento Fornecedor Internacional)
        //   233 → ADTO_CLIENTE_NAC   (Adiantamento Cliente Nacional, lado-débito)
        // Any other gerNum returns null — defensive (filter `gerNum#IN [198,233]`
        // already guarantees this, but the guard avoids polluting the FIFO).
        const gerNum = Number(row.gerNum ?? 0);
        let tipo: 'ADTO_FORN_INT' | 'ADTO_CLIENTE_NAC';
        if (gerNum === GER_ADTO_FORN_INT) {
            tipo = 'ADTO_FORN_INT';
        } else if (gerNum === GER_ADTO_CLIENTE_NAC) {
            tipo = 'ADTO_CLIENTE_NAC';
        } else {
            return null;
        }
        return {
            direcao: 'debito',
            tipo,
            docCod: String(row.docCod ?? ''),
            priCod: String(row.priCod ?? ''),
            dataEmissao: this.base.parseDate(row.dataEmissao ?? row.docDtaEmissao),
            dataBaixa: undefined,
            valor: Number(row.valor ?? row.docMnyValor ?? 0),
            moeda: String(row.moeda ?? row.moeEspSigla ?? 'BRL'),
            filCod: Number(row.filCod ?? filCod),
            vldStatus: '3',
            pessoa: row.dpeNomPessoa ? String(row.dpeNomPessoa) : undefined,
        };
    };

    /**
     * Maps a raw com299 row of `tpdCod=TPD_IMPLANTACAO_SALDO` into a
     * crédito-side AdiantamentoFinanceiro. The `tipo` is discriminated per
     * `gerNum`: 210→ADTO_CLIENTE_EXT, 233→ADTO_CLIENTE_NAC. Any other
     * `gerNum` returns `null` (row should not have been returned by Conexos
     * given our filter, but defensive guard avoids polluting the FIFO).
     */
    private mapAdiantamentoCredito = (
        row: Record<string, unknown>,
        filCod: number,
    ): AdiantamentoFinanceiroInterface | null => {
        const gerNum = Number(row.gerNum ?? 0);
        let tipo: Extract<AdiantamentoTipo, 'ADTO_CLIENTE_EXT' | 'ADTO_CLIENTE_NAC'>;
        if (gerNum === GER_ADTO_CLIENTE_EXT) {
            tipo = 'ADTO_CLIENTE_EXT';
        } else if (gerNum === GER_ADTO_CLIENTE_NAC) {
            tipo = 'ADTO_CLIENTE_NAC';
        } else {
            return null;
        }
        return {
            direcao: 'credito',
            tipo,
            docCod: String(row.docCod ?? ''),
            priCod: String(row.priCod ?? ''),
            dataEmissao: this.base.parseDate(row.dataEmissao ?? row.docDtaEmissao),
            dataBaixa: undefined,
            valor: Number(row.valor ?? row.docMnyValor ?? 0),
            moeda: String(row.moeda ?? row.moeEspSigla ?? 'BRL'),
            filCod: Number(row.filCod ?? filCod),
            vldStatus: '3',
            pessoa: row.dpeNomPessoa ? String(row.dpeNomPessoa) : undefined,
        };
    };
}
