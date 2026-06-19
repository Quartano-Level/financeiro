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
  | 'ja-permutado'

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
  /**
   * Invoices candidatas para o casamento manual (N:M) — invoices em aberto do
   * mesmo processo (`priCod`). Preenchido só quando `status === 'casamento-manual'`;
   * o analista escolhe UMA e processa (ADR-0005).
   */
  candidatas?: InvoiceEmAberto[]
  /** Micro-informações exibidas ao expandir a linha (qualquer status). */
  detalhe?: PermutaDetalhe
}

/** INVOICE finalizada em aberto (lado-crédito do casamento). */
export interface InvoiceEmAberto {
  docCod: string
  filCod: number
  referencia: string
  exportador: string
  valorMoedaNegociada: number | null
  /** Valor de FACE do documento em BRL (`docMnyValor`) — base da consolidação em reais. */
  valorBrl?: number | null
  moeda: string
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
    /** Já permutados (pago + 100% consumido antes) — estado CONCLUÍDO, fora de bloqueadas. */
    jaPermutado: number
  }
}
