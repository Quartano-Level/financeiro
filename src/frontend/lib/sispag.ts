import { withAuthHeaders } from './auth/token'
import { apiFetch } from './http'

/**
 * SISPAG (Escopo II) — cliente da API do painel READ-ONLY (spike / Fatia 1).
 * Bate em `GET /sispag/painel` (dados ao vivo do Conexos, só leitura). Os tipos
 * espelham `backend/domain/interface/sispag/SispagInterface.ts`.
 */

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

export interface TituloAPagar {
  docCod: string
  titCod: string
  filCod: number
  credor?: string
  valor: number
  moeda?: string
  vencimento?: number
  diasAteVencimento?: number
  liberado: boolean
  pago: boolean
  banco?: string
  numRemessa?: string
  pesCod?: string
  tpdCod?: string
  prontoParaRemessa?: boolean
  ativo?: boolean
  /** Pagamento ao exterior (ufEspSigla='EX') vs. nacional. Rails distintos (I7). */
  internacional?: boolean
  /** Já está num lote RASCUNHO — não pode ser atachado a outro (bloqueia a seleção). */
  emLote?: boolean
}

export interface LoteSispag {
  filCod: number
  flpCod: number
  banco?: string
  conta?: string
  layoutConta?: string
  status: number
  envioConfirmado: boolean
  retornoProcessado: boolean
  titulosCount: number
  soma: number
  itensRetorno: number
  finalizadoPor?: string
  dataCredito?: number
}

export interface SispagKpis {
  titulosAVencer7d: number
  titulosAVencer30d: number
  titulosVencidos: number
  valorAVencer30d: number
  lotesAbertos: number
  lotesEnviados: number
}

export interface SispagPainel {
  geradoEm: string
  modo: {
    somenteLeitura: true
    conexosWriteEnabled: boolean
    conexosDryRun: boolean
  }
  ingestao: {
    ultimaRunEm?: string
  }
  kpis: SispagKpis
  titulos: TituloAPagar[]
  lotes: LoteSispag[]
}

export interface PagamentoIngestaoRun {
  id: string
  triggeredBy: string
  status: 'running' | 'success' | 'error'
  totalTitulos: number
  totalInativados: number
  startedAt: string
  finishedAt?: string
  errorMessage?: string
}

export interface IngestaoPagamentosResult {
  runId: string
  status: 'success' | 'error'
  totalTitulos: number
  totalInativados: number
}

/** Lançado quando a ingestão devolve 409 — já existe uma rodando. */
export class IngestaoPagamentosEmAndamentoError extends Error {
  constructor(message = 'Já existe uma ingestão de pagamentos em andamento. Aguarde e tente de novo.') {
    super(message)
    this.name = 'IngestaoPagamentosEmAndamentoError'
  }
}

/** Busca o painel SISPAG (read-only). Lança em erro de rede/HTTP. */
export async function fetchSispagPainel(): Promise<SispagPainel> {
  const res = await apiFetch(`${API}/sispag/painel`, {
    headers: await withAuthHeaders(),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error ? ` — ${j.error}` : ''
    } catch {}
    throw new Error(`API ${res.status}${detail}`)
  }
  return (await res.json()) as SispagPainel
}

// ============================================================ Fatia 2 — Lote candidato
// Montagem local (sem escrita no ERP). Espelha backend/interface/sispag/SispagInterface.ts.

export type LotePagamentoStatus = 'RASCUNHO' | 'FINALIZADO' | 'CANCELADO' | 'RETORNADO'

export interface ItemLote {
  loteId: string
  filCod: number
  docCod: string
  titCod: string
  credor?: string
  valor?: number
  vencimento?: number
  internacional?: boolean
  incluidoPor: string
  incluidoEm?: string
}

export interface LotePagamento {
  id: string
  filCod: number
  banco?: string
  conta?: string
  status: LotePagamentoStatus
  criadoPor: string
  finalizadoPor?: string
  finalizadoEm?: string
  versao: number
  criadoEm?: string
  /** Formado pelo cron de formação automática (vs. montado manualmente). */
  automatico?: boolean
  itens: ItemLote[]
}

export interface FormacaoLotesResult {
  lotesFormados: number
  titulosLotados: number
  lotesDesfeitos: number
}

/** Chamada que devolve `{ lote }` — lança Error com a mensagem do backend (409/422). */
async function loteRequest(path: string, init?: RequestInit): Promise<LotePagamento> {
  const res = await apiFetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(await withAuthHeaders()) },
  })
  if (!res.ok) {
    let msg = `API ${res.status}`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {}
    throw new Error(msg)
  }
  const j = (await res.json()) as { lote: LotePagamento }
  return j.lote
}

export async function fetchLotes(
  filtro: { status?: LotePagamentoStatus; filCod?: number } = {},
): Promise<LotePagamento[]> {
  const qs = new URLSearchParams()
  if (filtro.status) qs.set('status', filtro.status)
  if (filtro.filCod != null) qs.set('filCod', String(filtro.filCod))
  const q = qs.toString()
  const res = await apiFetch(`${API}/sispag/lotes${q ? `?${q}` : ''}`, {
    headers: await withAuthHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const j = (await res.json()) as { lotes: LotePagamento[] }
  return j.lotes ?? []
}

export const criarLote = (input: { filCod: number; banco?: string; conta?: string }) =>
  loteRequest('/sispag/lotes', { method: 'POST', body: JSON.stringify(input) })

export const incluirTitulo = (
  loteId: string,
  input: { filCod: number; docCod: string; titCod: string },
) =>
  loteRequest(`/sispag/lotes/${loteId}/itens`, { method: 'POST', body: JSON.stringify(input) })

export const removerItem = (
  loteId: string,
  input: { filCod: number; docCod: string; titCod: string },
) =>
  loteRequest(
    `/sispag/lotes/${loteId}/itens/${input.filCod}/${encodeURIComponent(input.docCod)}/${encodeURIComponent(input.titCod)}`,
    { method: 'DELETE' },
  )

export const finalizarLote = (loteId: string, versao: number) =>
  loteRequest(`/sispag/lotes/${loteId}/finalizar`, {
    method: 'POST',
    body: JSON.stringify({ versao }),
  })

export const reabrirLote = (loteId: string, versao: number) =>
  loteRequest(`/sispag/lotes/${loteId}/reabrir`, { method: 'POST', body: JSON.stringify({ versao }) })

export const cancelarLote = (loteId: string, versao: number) =>
  loteRequest(`/sispag/lotes/${loteId}/cancelar`, {
    method: 'POST',
    body: JSON.stringify({ versao }),
  })

/** FINALIZADO → RETORNADO ("de volta do Nexxera"). Hoje manual; futuro = robô-poller. */
export const marcarRetorno = (loteId: string, versao: number) =>
  loteRequest(`/sispag/lotes/${loteId}/retorno`, {
    method: 'POST',
    body: JSON.stringify({ versao }),
  })

// ============================================================ Ingestão de pagamentos

/** Dispara a ingestão manual da carteira. 409 → IngestaoPagamentosEmAndamentoError. */
export async function runIngestaoPagamentos(): Promise<IngestaoPagamentosResult> {
  const res = await apiFetch(`${API}/sispag/ingestao`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await withAuthHeaders()) },
  })
  if (res.status === 409) throw new IngestaoPagamentosEmAndamentoError()
  if (!res.ok) throw new Error(`API ${res.status}`)
  return (await res.json()) as IngestaoPagamentosResult
}

export async function fetchIngestaoRuns(limit = 10): Promise<PagamentoIngestaoRun[]> {
  const res = await apiFetch(`${API}/sispag/ingestao/runs?limit=${limit}`, {
    headers: await withAuthHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const j = (await res.json()) as { runs: PagamentoIngestaoRun[] }
  return j.runs ?? []
}

/** Dispara a formação automática de lotes candidatos (mesmo motor do cron). */
export async function formarLotes(): Promise<FormacaoLotesResult> {
  const res = await apiFetch(`${API}/sispag/lotes/formar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await withAuthHeaders()) },
  })
  if (res.status === 409)
    throw new Error('Já existe uma formação de lotes em andamento. Aguarde e tente de novo.')
  if (!res.ok) throw new Error(`API ${res.status}`)
  return (await res.json()) as FormacaoLotesResult
}
