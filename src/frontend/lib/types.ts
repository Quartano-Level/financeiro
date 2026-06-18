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

export type StatusElegibilidade = 'elegivel' | 'bloqueada' | 'casamento-manual'

/** Status do analista sobre um adiantamento (botão "Processar"). */
export type ProcessamentoStatus = 'pendente' | 'processando' | 'processado' | 'erro'

/** Adiantamento PROFORMA pendente de permuta (linha da visão geral). */
export interface PermutaPendente {
  docCod: string
  filCod: number
  referencia: string
  exportador: string
  valorMoedaNegociada: number
  moeda: string
  diasEmAberto: number | null
  status: StatusElegibilidade
  motivoBloqueio?: string
  /** Status do processamento do analista, quando registrado no banco. */
  processamentoStatus?: ProcessamentoStatus
}

/** INVOICE finalizada em aberto (lado-crédito do casamento). */
export interface InvoiceEmAberto {
  docCod: string
  filCod: number
  referencia: string
  exportador: string
  valorMoedaNegociada: number
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
  }
}
