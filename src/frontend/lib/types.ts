/**
 * Frontend domain types. The skeleton ships only the Conexos `Filial` shape
 * (mirrors the backend `GET /conexos/filiais` response). Financeiro feature
 * types are added here as the domain is modelled via the pipeline.
 */
export interface Filial {
  filCod: number
  filDesNome: string
  filDocFederalFmt: string
  ufEspSigla?: string
  filVldStatus?: number
}

export interface FiliaisResponse {
  filiais: Filial[]
  filCodDefault: number | null
}

/**
 * Permutas — "Gestão de Permutas" shapes. Mirror the (enriched) backend
 * snapshot the painel endpoint will expose (Fase B). Until then the page is
 * fed by `lib/permutas-fixture.ts` (real probed data) as a demo safety-net.
 */

export type StatusElegibilidade =
  | 'elegivel'
  | 'bloqueada'
  | 'casamento-manual'
  | 'permuta-manual'
  | 'ja-permutado'

/**
 * Tipo de permuta — classificação DERIVADA (apresentação) p/ as abas:
 *  - `simples`       — 1:1 ou 1 invoice → N adiantamentos (auto-casável).
 *  - `multiplas`     — 1 adiantamento → N invoices (mesmo processo).
 *  - `cross-over`    — N adiantamentos ↔ M invoices (mesmo processo).
 *  - `cross-process` — cliente-filtro: a invoice está em OUTRO processo.
 */
export type TipoPermuta = 'simples' | 'multiplas' | 'cross-over' | 'cross-process'

/** Importador (cliente) cadastrado como "filtro" — permuta manual cross-process. */
export interface ClienteFiltro {
  pesCod: string
  importador?: string
  criadoEm: string
}

/** Importador distinto do backlog (seletor do cadastro de cliente-filtro). */
export interface Importador {
  pesCod: string
  importador?: string
  qtdAdtos: number
}

/** Invoice encontrada na busca cross-process (live), para a alocação manual (Fase 2). */
export interface InvoiceBuscada {
  docCod: string
  priCod: string
  filCod: number
  referencia?: string
  exportador?: string
  dataEmissao?: string
  valorMoedaNegociada?: number
  moeda?: string
  taxa?: number
  /** O processo da invoice tem D.I/DUIMP? (a alocação exige `true`). */
  temDi: boolean
  dataBase?: string
}

/** Uma alocação manual adto↔invoice (Fase 2), exibida na linha do permuta-manual. */
export interface AlocacaoDetalhe {
  invoiceDocCod: string
  invoicePriCod?: string
  valorAlocado: number
  moeda?: string
  variacaoClassificacao?: string
  variacaoResultado?: number
  criadoPor?: string
  criadoEm: string
}

/** Status do analista sobre um adiantamento (botão "Processar"). */
export type ProcessamentoStatus = 'pendente' | 'processando' | 'processado' | 'erro'

/**
 * Micro-informações de um adiantamento (exibidas ao expandir a linha, qualquer
 * status). `declaracao` existe se o processo tem D.I/DUIMP; `taxa*`/`variacao*`
 * só para casos COM casamento — bloqueados/já-permutados não têm.
 */
export interface PermutaDetalhe {
  priCod: string
  pago: boolean
  dataEmissao?: string
  valorPermutar?: number
  /** Valor de FACE do título em BRL (`mnyTitValor`) — progresso de pagamento. */
  valorTotal?: number
  /** Saldo em aberto do título em BRL (`mnyTitAberto`) — quanto falta pagar (Gate 3). */
  valorAberto?: number
  declaracao?: { variante: 'DI' | 'DUIMP'; dataBase?: string }
  taxaAdiantamento?: number
  taxaInvoice?: number
  variacaoClassificacao?: string
  variacaoResultado?: number
  variacaoDelta?: number
}

/** Adiantamento PROFORMA pendente de permuta (linha da visão geral). */
export interface PermutaPendente {
  docCod: string
  filCod: number
  referencia: string
  exportador: string
  valorMoedaNegociada: number | null
  /** Valor de FACE do documento em BRL (`docMnyValor`) — base da consolidação em reais. */
  valorBrl?: number | null
  moeda: string
  diasEmAberto: number | null
  status: StatusElegibilidade
  motivoBloqueio?: string
  /** Status do processamento do analista, quando registrado no banco. */
  processamentoStatus?: ProcessamentoStatus
  /** Tipo de permuta (classificação derivada p/ as abas) — ver `TipoPermuta`. */
  tipoPermuta?: TipoPermuta
  /**
   * Invoices candidatas para o casamento manual (N:M) — invoices em aberto do
   * mesmo processo (`priCod`). Preenchido só quando `status === 'casamento-manual'`;
   * o analista escolhe UMA e processa (ADR-0005).
   */
  candidatas?: InvoiceEmAberto[]
  /** Alocações manuais N:M cross-process (Fase 2) — só p/ `permuta-manual`. */
  alocacoes?: AlocacaoDetalhe[]
  /** Saldo a permutar ainda não alocado (moeda negociada) — `permuta-manual`. */
  saldoRestante?: number
  /** Micro-informações exibidas ao expandir a linha (qualquer status). */
  detalhe?: PermutaDetalhe
}

/** INVOICE finalizada em aberto (lado-crédito do casamento). */
export interface InvoiceEmAberto {
  docCod: string
  filCod: number
  /** Processo (Conexos priCod) — código em comum com o adiantamento. */
  priCod?: string
  /** Data de emissão da invoice (ISO). */
  dataEmissao?: string
  referencia: string
  exportador: string
  valorMoedaNegociada: number | null
  /** Valor de FACE do documento em BRL (`docMnyValor`) — base da consolidação em reais. */
  valorBrl?: number | null
  moeda: string
  /** Taxa de câmbio negociada da invoice (`com308` `titFltTaxaMneg`). */
  taxa?: number
}

/** Adiantamento sugerido para abater uma invoice, com o valor parcial a usar. */
export interface CasamentoAdiantamento {
  docCod: string
  referencia: string
  valorASerUsado: number
  moeda: string
  /** Status do processamento do analista, quando registrado no banco. */
  processamentoStatus?: ProcessamentoStatus
}

/** Uma invoice em aberto e os adiantamentos sugeridos para casá-la (N:M). */
export interface CasamentoSugerido {
  /**
   * Código do PROCESSO (Conexos `priCod`) — o número em comum entre a invoice e
   * o adiantamento. É a chave que o analista usa pra confirmar a relação batendo
   * manualmente no Conexos. Exibido na coluna no lugar do código da invoice.
   */
  priCod: string
  invoice: InvoiceEmAberto
  adiantamentos: CasamentoAdiantamento[]
}

/**
 * Resumo de uma rodada de ingestão para a trilha de auditoria do modal de
 * ingestão manual (ADR-0006). Espelha `GET /permutas/runs`. `triggeredBy` é o
 * username do analista que rodou, ou `'cron'` para o job agendado.
 */
export interface PermutaRun {
  runId: string
  triggeredBy: string
  startedAt: string
  finishedAt: string
  status: 'success' | 'partial' | 'error'
  totalCandidatas: number
  totalElegiveis: number
  totalBloqueadas: number
  errorMessage?: string
}

export interface PermutaRunsResponse {
  runs: PermutaRun[]
}

/** Resultado de uma ingestão manual disparada com sucesso (`POST /permutas/ingestao`). */
export interface IngestaoResult {
  runId: string
  status: 'success' | 'error'
  totalAdiantamentos: number
  totalInvoices: number
  totalCasamentos: number
  totalStale: number
}

export interface GestaoPermutasResponse {
  /** ISO timestamp de quando o snapshot/eleição foi gerado. */
  geradoEm?: string
  /** Origem dos dados exibidos — usado no badge da tela. */
  fonte: 'banco' | 'fixture'
  pendentes: PermutaPendente[]
  invoicesEmAberto: InvoiceEmAberto[]
  casamentos: CasamentoSugerido[]
  totais: {
    pendentes: number
    invoicesEmAberto: number
    elegiveis: number
    bloqueadas: number
    /** N:M que passaram os 4 gates, aguardando escolha de invoice (ADR-0005). */
    casamentoManual: number
    /** Adtos de clientes-filtro (pago + saldo) p/ permuta manual cross-process. */
    permutaManual: number
    /** Já permutados (pago + 100% consumido antes) — estado CONCLUÍDO, fora de bloqueadas. */
    jaPermutado: number
  }
}
