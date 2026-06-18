import { inject, injectable, singleton } from 'tsyringe';
import ConexosError from '../errors/ConexosError.js';
import RetryExecutor from '../libs/executor/RetryExecutor.js';
import type Adiantamento from '../interface/permutas/Adiantamento.js';
import type { VarianteDeclaracao } from '../interface/permutas/DeclaracaoImportacao.js';
import {
    ADIANTAMENTO_FILTER_KEY,
    ADIANTAMENTO_FILTER_VALUE,
    ENDPOINT_DI_LIST,
    ENDPOINT_DUIMP_LIST,
    TPD_PROFORMA as PERMUTA_TPD_PROFORMA,
    VLD_STATUS_FINALIZADO as PERMUTA_VLD_FINALIZADO,
} from './permutas/conexosPermutasConstants.js';
import { com298RowSchema, declaracaoRowSchema } from './permutas/conexosPermutasSchemas.js';

/**
 * Existência de declaração aduaneira por processo (`imp019`/`imp223`),
 * escopo restrito ao Gate 4 (XOR) + data-base. `dataBase` é ⏸ GATED-P0-4 —
 * só popula quando o probe capturar o campo wire (não chutar).
 */
export interface DeclaracaoEntry {
    variante: VarianteDeclaracao;
    priCod: string;
    dataBase?: Date;
}

export const LEGACY_CONEXOS_TOKEN = Symbol('LegacyConexosShape');

/**
 * Conexos numeric timestamps are encoded as midnight UTC of the calendar
 * day in BR. Naively parsing them lands on 00:00 UTC, which renders as
 * the previous day in BR (UTC-3). Shifting +15h snaps to 12:00 BRT
 * (15:00 UTC) so the wall-clock day is preserved across any formatter
 * within UTC ± 12h. See `parseDate` for the full rationale.
 */
const BR_NOON_SHIFT_MS = 15 * 60 * 60 * 1000;
import type {
    AdiantamentoFinanceiroInterface,
    AdiantamentoTipo,
} from '../interface/closing-reports/AdiantamentoFinanceiro.js';
import type InvoiceLancamento from '../interface/closing-reports/Invoice.js';
import type Proforma from '../interface/closing-reports/Proforma.js';

/**
 * Shape of the legacy ConexosService (services/conexos.ts) that we depend
 * on. Keeping it as an `interface` rather than a concrete import lets the
 * unit tests inject a mock without hitting the legacy auth/cookie code.
 *
 * v0.2 will replace this adapter with native HTTP calls and ssm-backed
 * auth, at which point services/conexos.ts can be deleted.
 */
export interface Filial {
    filCod: number;
    filDesNome: string;
    filDocFederalFmt: string;
    ufEspSigla?: string;
    filVldStatus?: number;
}

export interface PagedResponse<Row> {
    count: number;
    rows: Row[];
}

export interface LegacyConexosShape {
    ensureSid: () => Promise<void>;
    listGeneric: <T>(
        serviceName: string,
        body: Record<string, unknown>,
        opts?: { filCod?: number },
    ) => Promise<T>;
    listGenericPaginated: <Row>(
        serviceName: string,
        body: Record<string, unknown>,
        opts?: { filCod?: number },
    ) => Promise<PagedResponse<Row>>;
    /**
     * GET-style passthrough used by `com311/baixas/list`.
     * Returns the raw envelope (Conexos shape varies per endpoint).
     */
    getGeneric: <T>(path: string, opts?: { filCod?: number }) => Promise<T>;
    getFiliais: () => Promise<Filial[]>;
    getFilCodDefault: () => Promise<number | null>;
}

export interface ProcessoListItem {
    priCod: string;
    /**
     * Conexos `pesCod` — internal identifier of the importador (cliente).
     * Mapped explicitly in the imp021 fieldList for v0.5; canonical key used by
     * `nf-saida-mesmo-pescod-do-processo` to validate that any NF Saída
     * issued by the process belongs to the same cliente.
     */
    pesCod: string;
    /**
     * Conexos `priEspRefcliente` — external "Ref. Externa" of the process
     * (per-importador human reference). Optional defensively because legacy
     * processes may have no value. Surfaces in the canonical 8-column
     * Fechamento Mensal table as the "Ref. Externa" column. No alias —
     * keep the wire field name across the stack (ADR-0011).
     */
    priEspRefcliente?: string;
    importador?: string;
    exportador?: string;
    /**
     * Conexos `imp021.priVldTipo` — código da Unidade de Negócio do processo.
     * Mapeado para o rótulo da coluna "Und. Negócio" do relatório de Variação
     * Cambial (`1 → PRÓPRIA`, `2 → CONTA E ORDEM`, `3 → POR ENCOMENDA`;
     * Addendum 2026-06-08 #2 do ADR-0021). Adicionado explicitamente ao
     * fieldList do imp021. Optional defensivamente (processos legados podem
     * omitir); coerção `Number(...)` no mapper.
     */
    priVldTipo?: number;
}

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
 * O caller hidrata via `getMnyTitPermutar(docCod)` (detail endpoint
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
     * produção 2026-06-01) — caller deve hidratar via `getMnyTitPermutar`
     * apenas para os docs `gerNum=198`.
     */
    mnyTitPermutar?: number;
}

export interface TituloAPagar {
    titCod: string;
    /**
     * Valor da INVOICE em moeda estrangeira (`titMnyValorMneg` no wire).
     * Source: Conexos `com308/financeiroAPagar/list/{docCod}`. Entrada do
     * cálculo de Variação Cambial — `ValorTotal = valorNegociado × taxa`.
     * Optional defensively; in v0.5 the variacao-cambial path requires this
     * for the SOURCE TRUTH, and `VariacaoCambialService` throws
     * `TaxaAusenteError` if `taxa` is null but `valorNegociado` exists.
     * Added by `variacao-cambial` (2026-05-28, ADR-0020).
     */
    valorNegociado?: number;
    /**
     * Taxa de câmbio travada na contratação (`titFltTaxaMneg` no wire).
     * Source: Conexos `com308/financeiroAPagar/list/{docCod}`. NÃO vem de
     * `ContratoCambio` (ADR-0020 D1). Sample (interview docCod=24107):
     * `5.0211`. Added by `variacao-cambial` (2026-05-28).
     */
    taxa?: number;
    /**
     * Código numérico da moeda (`moeCodMneg` no wire). Sample: 220 = USD,
     * 1 = BRL. v0.5 só suporta 220 (USD). Added by `variacao-cambial`.
     */
    moedaCod?: number;
    /**
     * Nome amigável da moeda (`moeEspNome` no wire). Sample: "DOLAR DOS EUA".
     * Exibido na coluna "Moeda" do XLSX de Variação Cambial.
     */
    moedaNome?: string;
    /**
     * Valor de face do título em BRL (`titMnyValor` no wire). Usado pela
     * linha Real/null do relatório de Variação Cambial (moeCodMneg=790 ou
     * null), onde `valorNegociado = valorTotal = valorAtual = titMnyValor` e
     * `variacao = 0` (ADR-0020 Addendum #12 / `vc-moedas-cmn156`,
     * 2026-06-07). Documentos em moeda estrangeira usam `valorNegociado`
     * (`titMnyValorMneg`) — este campo é o face doméstico.
     */
    valorBrl?: number;
}

export interface BaixaTitulo {
    borDtaMvto: Date;
    valor: number;
    /**
     * Principal liquidado da baixa em BRL ao câmbio de CONTRATO
     * (`bxaMnyValor` no wire) — mesma base de `face × taxa` do título. NÃO
     * inclui juros/multa/desconto (esses entram em `bxaMnyLiquido`, que é
     * `bxaMnyValor + juros + multa − desconto`). É o insumo correto do saldo
     * residual sobre o principal do relatório de Variação Cambial
     * (`pagoBRL = Σ bxaMnyValor das baixas ≤ dataBase`,
     * `residualMneg = face − pagoBRL / taxa`) — ADR-0021 Addendum 2026-06-08 #1 /
     * `vc-multi-titulo`. Distinto de `valor` (coalesce que prioriza o líquido).
     * Defensivo: `Number(r.bxaMnyValor ?? 0)` — uma baixa com `bxaMnyValor`
     * null/ausente (permuta exótica) NUNCA soma `null` em `pagoBRL` (default 0;
     * watchlist: principal-pago=0, título permanece no relatório — mais seguro
     * p/ exposição cambial).
     */
    bxaMnyValor: number;
    /**
     * Plano financeiro da baixa (`gerNum` no wire). Identifica o tipo da baixa:
     * banco vs. permuta vs. conta transitória. Capturado para que a regra
     * `valor-permutar-ponto-no-tempo` possa filtrar permutas (`gerNum=21`
     * "FORNECEDORES EXTERIOR - POR ENCOMENDA" no lado a-pagar) das baixas
     * bancárias normais. Defaulta para 0 quando ausente.
     */
    gerNum: number;
}

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

const CHUNK_SIZE = 50;

/**
 * Per-page row limit used when fan-out paginating Conexos list endpoints.
 * Larger than the legacy 100 to keep round-trip count low — the backend
 * found that a single filCod=2 (no priCod filter) returns ~2.5k processes,
 * and a single priCod can have hundreds of PROFORMAs/SolNums.
 */
const PAGE_SIZE = 500;

/**
 * Safety cap on total pages walked by `paginate`. At PAGE_SIZE=500 this
 * caps any single endpoint+filter combo at 25k rows. If a real query ever
 * blows past this, the loop returns what it has and a warning is logged
 * upstream — it does NOT throw, so a single oversize tenant can't take
 * down the whole closing report.
 */
const MAX_PAGES = 50;

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

const chunked = <T>(items: readonly T[], size = CHUNK_SIZE): T[][] => {
    if (items.length === 0) return [];
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size) as T[]);
    }
    return out;
};

/**
 * Domain-shaped Conexos adapter. v0.1 wraps the legacy `ConexosService`
 * exported from `services/conexos.ts` so we don't duplicate the cookie
 * session handling. v0.2 will own the HTTP layer directly.
 *
 * Each public method runs inside a RetryExecutor (1 retry, 500 ms delay,
 * jitter 200 ms). Failures are wrapped into `ConexosError` so callers can
 * surface a typed error in their per-process best-effort handling.
 */
@singleton()
@injectable()
export default class ConexosClient {
    private retryExecutor: RetryExecutor;
    private legacy: LegacyConexosShape;

    constructor(@inject(LEGACY_CONEXOS_TOKEN) legacy: LegacyConexosShape) {
        this.legacy = legacy;
        this.retryExecutor = new RetryExecutor({
            retries: 2,
            delayMs: 500,
            shouldLog: true,
            jitterMs: 200,
        });
    }

    /**
     * Returns the filiais captured from the last successful Conexos login.
     * Used by the multi-filial toggle in the report modal — when the user
     * checks "Todas filiais", the frontend asks for this list and the
     * report aggregates across every entry returned here.
     */
    public listFiliais = async (): Promise<Filial[]> => {
        try {
            return await this.retryExecutor.execute(async () => {
                await this.legacy.ensureSid();
                return this.legacy.getFiliais();
            });
        } catch (cause) {
            throw new ConexosError({ endpoint: 'getFiliais', cause });
        }
    };

    /** Default filCod captured from the Conexos `/login` response. */
    public getFilCodDefault = async (): Promise<number | null> => {
        try {
            return await this.retryExecutor.execute(async () => {
                await this.legacy.ensureSid();
                return this.legacy.getFilCodDefault();
            });
        } catch (cause) {
            throw new ConexosError({ endpoint: 'getFilCodDefault', cause });
        }
    };

    public listProcessos = async (params: {
        filCod: number;
        priCods?: string[];
    }): Promise<ProcessoListItem[]> => {
        const { filCod, priCods } = params;

        // Conexos returns `priCod` as a number; downstream methods (and the
        // financial-doc list endpoints) treat it as string. We normalise here
        // so equality comparisons against `i.priCod === proc.priCod` work
        // across the pipeline (without this, every linha gets filtered out
        // because "1153" !== 1153).
        // imp021 rows: the cliente importador name lives under the canonical
        // Conexos `dpeNomPessoa` column (same convention used by com298 and
        // com299). A literal `importador` field does not exist in the
        // imp021 response shape, so the previous mapping resolved to
        // undefined for every row. Fallback to dpeNomPessoa keeps the
        // explicit-importador path for any future fielded variant.
        const normalise = (rows: Array<Record<string, unknown>>): ProcessoListItem[] =>
            rows.map((row) => ({
                ...row,
                priCod: String(row.priCod ?? ''),
                pesCod: String(row.pesCod ?? ''),
                priEspRefcliente:
                    row.priEspRefcliente !== undefined && row.priEspRefcliente !== null
                        ? String(row.priEspRefcliente)
                        : undefined,
                importador: row.importador
                    ? String(row.importador)
                    : row.dpeNomPessoa
                      ? String(row.dpeNomPessoa)
                      : undefined,
                exportador: row.exportador ? String(row.exportador) : undefined,
                priVldTipo:
                    row.priVldTipo !== undefined && row.priVldTipo !== null
                        ? Number(row.priVldTipo)
                        : undefined,
            })) as ProcessoListItem[];

        // v0.5: explicit fieldList ensures `pesCod` and `priEspRefcliente`
        // come back from imp021 (default `[]` returns a Conexos-defined set
        // that may omit `priEspRefcliente`). Canonical fields:
        //   - priCod, pesCod (FK to importador/cliente),
        //   - priEspRefcliente (external client reference),
        //   - dpeNomPessoa (cliente name fallback),
        //   - priDtaAbertura (process opening date),
        //   - filCod (branch).
        const FIELD_LIST = [
            'priCod',
            'pesCod',
            'priEspRefcliente',
            'priVldTipo',
            'dpeNomPessoa',
            'priDtaAbertura',
            'filCod',
        ];

        if (!priCods || priCods.length === 0) {
            const rows = await this.paginate<Record<string, unknown>>({
                endpoint: 'imp021/list',
                bodyBase: {
                    fieldList: FIELD_LIST,
                    filterList: { 'priVldStatus#IN': ['1'] },
                    serviceName: 'imp021',
                    orderList: {
                        orderList: [{ propertyName: 'priCod', order: 'asc' }],
                    },
                },
                opts: { filCod },
            });
            return normalise(rows);
        }

        const chunks = chunked(priCods);
        const results = await Promise.all(
            chunks.map((batch) =>
                this.paginate<Record<string, unknown>>({
                    endpoint: 'imp021/list',
                    bodyBase: {
                        fieldList: FIELD_LIST,
                        filterList: { 'priCod#IN': batch },
                        serviceName: 'imp021',
                    },
                    priCodsBatch: batch,
                    opts: { filCod },
                }),
            ),
        );
        return normalise(results.flat());
    };

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
                    this.paginate<Record<string, unknown>>({
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
        // obter o valor real, use `getMnyTitPermutar(docCod, filCod)` que
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
     * hidrata via `getMnyTitPermutar(docCod)` por candidato (Gate 2).
     */
    public listAdiantamentosProforma = async (params: {
        filCod: number;
    }): Promise<{ adiantamentos: Adiantamento[]; capHit: boolean }> => {
        const { filCod } = params;
        let capHit = false;
        const rows = await this.paginate<Record<string, unknown>>({
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
                filCod: this.parseOptionalNumber(row.filCod) ?? filCod,
                dataEmissao: mapped.dataEmissao,
                valor: mapped.valor,
                moeda: mapped.moeda,
                pago: mapped.pago,
                ...(mapped.exportador !== undefined ? { exportador: mapped.exportador } : {}),
                ...(mapped.valorPermutar !== undefined
                    ? { valorPermutar: mapped.valorPermutar }
                    : {}),
            };
            return adiantamento;
        });
        return { adiantamentos, capHit };
    };

    /**
     * Re-introduz o lado-leitura de declaração aduaneira podado no ADR-0003
     * (migration-debt O3), escopo restrito a EXISTÊNCIA (XOR) + data-base
     * (Gate 4 + aging). Lê `imp019/list` (D.I) e `imp223/list` (DUIMP) por
     * `priCod`, retornando uma entrada por declaração encontrada (o XOR é
     * decidido no service `ElegibilidadeService`).
     *
     * ⏸ GATED-P0-4: `dataBase` é extraída pelo mapper plugável
     * `mapDeclaracaoDataBase`. Enquanto o probe não capturar o NOME do campo
     * wire (`imp019`/`imp223`), o mapper devolve `undefined` — a existência/XOR
     * funciona hoje sem o probe.
     */
    public listDeclaracaoByProcesso = async (params: {
        priCods: string[];
        filCod: number;
    }): Promise<DeclaracaoEntry[]> => {
        const { priCods, filCod } = params;
        if (priCods.length === 0) return [];
        const chunks = chunked(priCods);

        const readVariante = async (
            endpoint: string,
            variante: VarianteDeclaracao,
        ): Promise<DeclaracaoEntry[]> => {
            const rows = (
                await Promise.all(
                    chunks.map((batch) =>
                        this.paginate<Record<string, unknown>>({
                            endpoint,
                            bodyBase: {
                                fieldList: [],
                                filterList: { 'priCod#IN': batch },
                                serviceName: endpoint.split('/')[0],
                            },
                            priCodsBatch: batch,
                            opts: { filCod },
                        }),
                    ),
                )
            ).flat();

            return rows.map<DeclaracaoEntry>((row) => {
                const validated = declaracaoRowSchema.parse(row);
                const dataBase = this.mapDeclaracaoDataBase(row, variante);
                return {
                    variante,
                    priCod: validated.priCod,
                    ...(dataBase !== undefined ? { dataBase } : {}),
                };
            });
        };

        const [di, duimp] = await Promise.all([
            readVariante(ENDPOINT_DI_LIST, 'DI'),
            readVariante(ENDPOINT_DUIMP_LIST, 'DUIMP'),
        ]);
        return [...di, ...duimp];
    };

    /**
     * Mapper ISOLADO da extração da data-base wire (P0-4 RESOLVIDO).
     *
     * Campos confirmados empiricamente no dev tenant Columbia (probe 2026-06-18):
     *   - D.I (`imp019`)   → `cdiDtaCi` (data "CI"; cf. PDF "DI = CI"). Acompanha
     *     `cdiEspNumci` (nº da CI). Sample: `1768521600000`.
     *   - DUIMP (`imp223`) → `dioDtaDesembaraco` (data de desembaraço).
     *     Sample: `1769040000000`.
     * Ambos epoch-ms; `parseDate` aplica o shift BR-noon. Ausência → `undefined`
     * (a coluna aging fica nula para aquela declaração, sem quebrar a cadeia).
     */
    private mapDeclaracaoDataBase = (
        row: Record<string, unknown>,
        variante: VarianteDeclaracao,
    ): Date | undefined => {
        const raw = variante === 'DI' ? row.cdiDtaCi : row.dioDtaDesembaraco;
        const ms = this.parseOptionalNumber(raw);
        return ms !== undefined ? this.parseDate(ms) : undefined;
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
     * (Oracle dispara `ORA-00904`). Caller hidrata via `getMnyTitPermutar`
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
                    this.paginate<Record<string, unknown>>({
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
                            // endpoint — caller hidrata via `getMnyTitPermutar`
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
            const dataEmissao = this.parseDate(row.dataEmissao ?? row.docDtaEmissao);
            const gerNum = Number(row.gerNum ?? 0);
            const gerDes = String(row.gerDes ?? '');
            const valor = Number(row.valor ?? row.docMnyValor ?? 0);
            const moeda = String(row.moeda ?? row.moeEspSigla ?? 'BRL');
            const pago = this.isPago(row);
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
            const mnyTitPermutar = this.parseOptionalNumber(row.mnyTitPermutar);
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
     * Fetches the LITERAL `mnyTitPermutar` value for a single document via
     * `GET /com298/{docCod}` (detail endpoint). This is the "saldo a permutar
     * disponível" displayed in the Conexos UI — NOT the residual FIFO
     * computed by `LancamentoFinanceiroBaixaService.computeValorPermutar`
     * (that one belongs to FM/JVE; see regra `valor-permutar-ponto-no-tempo`).
     *
     * **Why fan-out (Addendum #8 ADR-0020, 2026-06-01):** the list endpoint
     * `com298/list` returns `mnyTitPermutar: null` in production (validated
     * via curl real 2026-06-01 vs `GET /com298/21841` which returns 44917.24).
     * Conexos populates this aggregated value only at the detail-fetch path.
     *
     * **Consumer:** exclusively `VariacaoCambialService` for PROFORMA
     * predicate (`valorPermutar > 0`). One call per PROFORMA candidate.
     * Caller is expected to cache by `docCod` per execution to avoid
     * redundant calls when the same document is hit multiple times.
     *
     * @returns `undefined` when the detail endpoint omits the field or
     *          returns null; finite number otherwise (including `0`).
     */
    public getMnyTitPermutar = async (params: {
        docCod: string;
        filCod: number;
    }): Promise<number | undefined> => {
        const { docCod, filCod } = params;
        try {
            // P0-3 — wrapped in the same RetryExecutor as every other Conexos
            // call (7/8→8/8 endpoints retried). A transient 5xx/network blip on
            // the detail fetch no longer silently drops the candidate.
            return await this.retryExecutor.execute(async () => {
                let detail: Record<string, unknown> | undefined;
                try {
                    detail = await this.legacy.getGeneric<Record<string, unknown>>(
                        `com298/${docCod}`,
                        { filCod },
                    );
                } catch (err) {
                    // Conexos quirk (observed 2026-06-01 on docCod=10649): the
                    // detail endpoint can answer HTTP 400 `type=VALIDATION`
                    // while still returning the document inside
                    // `error.response.data.responseData`. That is a LEGITIMATE
                    // response (not a blip) — extract `mnyTitPermutar` and
                    // succeed WITHOUT retrying. Any other error propagates to
                    // the RetryExecutor (retry → ConexosError if exhausted).
                    const ax = err as {
                        response?: {
                            status?: number;
                            data?: { responseData?: Record<string, unknown> };
                        };
                    };
                    const responseData = ax.response?.data?.responseData;
                    if (
                        ax.response?.status === 400 &&
                        responseData &&
                        typeof responseData === 'object'
                    ) {
                        return this.parseOptionalNumber(responseData.mnyTitPermutar);
                    }
                    throw err;
                }
                if (!detail || typeof detail !== 'object') return undefined;
                return this.parseOptionalNumber(detail.mnyTitPermutar);
            });
        } catch (cause) {
            // Retries exhausted on a transient failure — surface a TYPED error
            // (NÃO `return undefined` silencioso). The caller (EleicaoPermutas)
            // maps this to `MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL`, distinto de
            // uma reprovação de gate legítima (`falha-gate`).
            throw new ConexosError({ endpoint: `com298/${docCod}`, priCod: docCod, cause });
        }
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
                    this.paginate<Record<string, unknown>>({
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
                    this.paginate<Record<string, unknown>>({
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

    public listTitulosAPagar = async (params: {
        docCod: string;
        filCod: number;
    }): Promise<TituloAPagar[]> => {
        const { docCod, filCod } = params;
        const rows = await this.callList<Array<Record<string, unknown>>>(
            `com308/financeiroAPagar/list/${docCod}`,
            {
                // v0.5 (variacao-cambial, 2026-05-28 — bug-fix 2026-05-29):
                // Conexos `com308/financeiroAPagar/list/<docCod>` requires the
                // full boilerplate body — `serviceName: "com308.finTituloFin"`
                // (NOT plain `"com308"` → 400 VALIDATION), `pageNumber`,
                // `pageSize`, `orderList`. Same shape as the working com311
                // call above. Confirmed against Yuri's curl fixture (interview
                // 2026-05-28, docCod=24107).
                fieldList: [
                    'titCod',
                    'titFltTaxaMneg',
                    'titMnyValorMneg',
                    'titMnyValor',
                    'moeCodMneg',
                    'moeEspNome',
                ],
                filterList: { 'titVldStatus#EQ': '1' },
                serviceName: 'com308.finTituloFin',
                pageNumber: 1,
                pageSize: 100,
                orderList: {
                    orderList: [{ propertyName: 'titCod', order: 'asc' }],
                },
            },
            `com308/financeiroAPagar/list/${docCod}`,
            undefined,
            { filCod },
        );
        return rows.map<TituloAPagar>((r) => {
            const valorNegociado = this.parseOptionalNumber(r.titMnyValorMneg);
            const taxa = this.parseOptionalNumber(r.titFltTaxaMneg);
            const moedaCod = this.parseOptionalNumber(r.moeCodMneg);
            const moedaNome = r.moeEspNome != null ? String(r.moeEspNome) : undefined;
            const valorBrl = this.parseOptionalNumber(r.titMnyValor);
            return {
                titCod: String(r.titCod),
                ...(valorNegociado !== undefined ? { valorNegociado } : {}),
                ...(taxa !== undefined ? { taxa } : {}),
                ...(moedaCod !== undefined ? { moedaCod } : {}),
                ...(moedaNome !== undefined ? { moedaNome } : {}),
                ...(valorBrl !== undefined ? { valorBrl } : {}),
            };
        });
    };

    /**
     * Lists baixas (discharge events) of an Invoice/Proforma título via
     * `POST com308/financeiroAPagar/baixas/list/<docCod>/<titCod>/<vldCheck>`
     * with the canonical Conexos filter body. Empty bodies trigger HTTP 400
     * `NotNull` (Hibernate validation); the request must always include the
     * `borVldFinalizado` filter and an `orderList`. Mirrors the contract of
     * the sibling com311 endpoint discovered on 2026-05-08.
     */
    public listBaixasTitulo = async (params: {
        docCod: string;
        titCod: string;
        vldCheck?: number;
        filCod: number;
    }): Promise<BaixaTitulo[]> => {
        const { docCod, titCod, vldCheck = 0, filCod } = params;
        const rows = await this.paginate<Record<string, unknown>>({
            endpoint: `com308/financeiroAPagar/baixas/list/${docCod}/${titCod}/${vldCheck}`,
            bodyBase: {
                fieldList: [],
                filterList: {
                    'borVldFinalizado#IN': [1],
                },
                orderList: {
                    orderList: [{ propertyName: 'borCod', order: 'asc' }],
                },
            },
            opts: { filCod },
        });
        return rows.map<BaixaTitulo>((r) => ({
            borDtaMvto: this.parseDate(r.borDtaMvto),
            valor: Number(r.valor ?? r.borVlrMvto ?? r.bxaMnyLiquido ?? r.bxaMnyValor ?? 0),
            // Principal puro (BRL @ câmbio de contrato) como campo dedicado,
            // independente do coalesce de `valor` (que prioriza o líquido).
            // Insumo do saldo residual sobre o principal (Addendum 2026-06-08 #1).
            // Default defensivo 0 — nunca soma null em pagoBRL.
            bxaMnyValor: Number(r.bxaMnyValor ?? 0),
            gerNum: Number(r.gerNum ?? 0),
        }));
    };

    private callList = async <T>(
        endpoint: string,
        body: Record<string, unknown>,
        serviceName: string,
        priCodsBatch?: string[],
        opts?: { filCod?: number },
    ): Promise<T> => {
        try {
            return await this.retryExecutor.execute(async () => {
                await this.legacy.ensureSid();
                return this.legacy.listGeneric<T>(serviceName, body, opts);
            });
        } catch (cause) {
            throw new ConexosError({
                endpoint,
                priCod: priCodsBatch?.[0],
                cause,
            });
        }
    };

    /**
     * Walk a Conexos list endpoint until exhausted. Stops when one of:
     *   - server returns < `pageSize` rows (last page reached);
     *   - accumulated rows >= reported `count` (envelope honoured);
     *   - safety cap `MAX_PAGES` reached (logs upstream via accumulator).
     *
     * Each page is wrapped in the same `RetryExecutor` as `callList` so
     * a transient 5xx on page N doesn't kill the whole loop. On any
     * exhausted retry the failure surfaces as `ConexosError` carrying
     * `endpoint` (and the first `priCod` of the batch when applicable).
     */
    private paginate = async <Row>(params: {
        endpoint: string;
        bodyBase: Record<string, unknown>;
        priCodsBatch?: string[];
        opts?: { filCod?: number };
        /**
         * Invoked once with `true` when the loop exits because it hit `MAX_PAGES`
         * (silent truncation) rather than a short/exhausted page. Lets callers
         * emit a `BUSINESS_WARN` cap-hit without leaking pagination internals.
         */
        onCapHit?: () => void;
    }): Promise<Row[]> => {
        const { endpoint, bodyBase, priCodsBatch, opts, onCapHit } = params;
        const accumulated: Row[] = [];
        let expectedTotal: number | undefined;
        let exhausted = false;

        for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
            const body: Record<string, unknown> = {
                ...bodyBase,
                pageNumber,
                pageSize: PAGE_SIZE,
            };

            let page: PagedResponse<Row>;
            try {
                page = await this.retryExecutor.execute(async () => {
                    await this.legacy.ensureSid();
                    // `endpoint` is the URL path (e.g. `imp021/list`); the
                    // adapter prepends `/`. The body-field `serviceName` is
                    // a distinct request payload field and is already inside
                    // `bodyBase` — never use it as the URL.
                    return this.legacy.listGenericPaginated<Row>(endpoint, body, opts);
                });
            } catch (cause) {
                throw new ConexosError({
                    endpoint,
                    priCod: priCodsBatch?.[0],
                    cause,
                });
            }

            accumulated.push(...page.rows);
            if (expectedTotal === undefined && Number.isFinite(page.count)) {
                expectedTotal = page.count;
            }

            const pageWasShort = page.rows.length < PAGE_SIZE;
            const reachedExpected =
                expectedTotal !== undefined && accumulated.length >= expectedTotal;
            if (pageWasShort || reachedExpected) {
                exhausted = true;
                break;
            }
        }

        if (!exhausted) onCapHit?.();
        return accumulated;
    };

    /**
     * Conexos encodes dates as "midnight UTC of the calendar day in BR".
     * A naive `new Date(ms)` lands on 00:00 UTC, which renders as the
     * PREVIOUS day in BR (UTC-3) — bug visible in the portal: "19/01"
     * shows up as "18/01" in our UI.
     *
     * Fix: when the input is a numeric timestamp, shift forward 15h
     * (i.e. snap to 12:00 BRT = 15:00 UTC). Any formatter in UTC ± 12h
     * then reports the same wall-clock day.
     *
     * String inputs (e.g. ISO `'2026-04-15'`) are NOT shifted — they are
     * already anchored at UTC midnight by spec, and shifting would break
     * downstream `toISOString().slice(0,10)` round-trips.
     *
     * Date instances pass through untouched (caller already chose).
     */
    private parseDate = (raw: unknown): Date => {
        if (raw instanceof Date) return raw;
        if (typeof raw === 'number') {
            const d = new Date(raw + BR_NOON_SHIFT_MS);
            if (!Number.isNaN(d.getTime())) return d;
        }
        if (typeof raw === 'string') {
            const d = new Date(raw);
            if (!Number.isNaN(d.getTime())) return d;
        }
        return new Date(0);
    };

    /**
     * Coerce a raw Conexos value to a finite number, returning `undefined`
     * for null/missing/non-numeric values. Used by `listTitulosAPagar`
     * (v0.5 variacao-cambial) for the optional foreign-currency fields:
     * absent fields stay `undefined`, distinguishing "field not requested"
     * from "field is 0".
     */
    private parseOptionalNumber = (raw: unknown): number | undefined => {
        if (raw === null || raw === undefined || raw === '') return undefined;
        const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
        return Number.isFinite(n) ? n : undefined;
    };

    private mapDocPagar = (row: Record<string, unknown>) => ({
        docCod: String(row.docCod ?? ''),
        priCod: String(row.priCod ?? ''),
        dataEmissao: this.parseDate(row.dataEmissao ?? row.docDtaEmissao),
        valor: Number(row.valor ?? row.docMnyValor ?? 0),
        moeda: String(row.moeda ?? 'BRL'),
        pago: this.isPago(row),
        exportador: row.exportador
            ? String(row.exportador)
            : row.dpeNomPessoa
              ? String(row.dpeNomPessoa)
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
         * `ConexosClient.getMnyTitPermutar(docCod, filCod)` — fan-out
         * GET por documento, consumido por `VariacaoCambialService`.
         *
         * FM/JVE NÃO consomem este campo do list — chamam
         * `LancamentoFinanceiroBaixaService.hidratar` que sobrescreve
         * `valorPermutar` com o residual FIFO ponto-no-tempo conforme
         * regra `valor-permutar-ponto-no-tempo`. Semântica preservada.
         */
        valorPermutar: this.parseOptionalNumber(row.mnyTitPermutar),
    });

    /**
     * Conexos paid-status convention:
     *   - `mnyTitAberto === 0` ⇒ fully paid;
     *   - `pago === 1` (com298/financeiroAPagar/list shape) ⇒ paid;
     *   - fallback to false when neither is present.
     */
    private isPago = (row: Record<string, unknown>): boolean => {
        if (typeof row.mnyTitAberto === 'number') return row.mnyTitAberto === 0;
        if (typeof row.pago === 'number') return row.pago === 1;
        if (typeof row.pago === 'boolean') return row.pago;
        return false;
    };

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
            dataEmissao: this.parseDate(row.dataEmissao ?? row.docDtaEmissao),
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
            dataEmissao: this.parseDate(row.dataEmissao ?? row.docDtaEmissao),
            dataBaixa: undefined,
            valor: Number(row.valor ?? row.docMnyValor ?? 0),
            moeda: String(row.moeda ?? row.moeEspSigla ?? 'BRL'),
            filCod: Number(row.filCod ?? filCod),
            vldStatus: '3',
            pessoa: row.dpeNomPessoa ? String(row.dpeNomPessoa) : undefined,
        };
    };
}
