import { withAuthHeaders } from './auth/token'
import type {
  ClienteFiltro,
  FiliaisResponse,
  GestaoPermutasResponse,
  Importador,
  IngestaoResult,
  InvoiceBuscada,
  PermutaRun,
} from './types'
import { gestaoPermutasFixture } from './permutas-fixture'

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

/**
 * Lançado por `runIngestaoManual()` quando o backend responde 409 — já existe
 * uma ingestão em andamento (cron ou outro analista). A UI mostra um aviso e
 * NÃO trata como erro genérico (ADR-0006).
 */
export class IngestaoEmAndamentoError extends Error {
  constructor(message = 'Já existe uma ingestão em andamento. Aguarde terminar e tente novamente.') {
    super(message)
    this.name = 'IngestaoEmAndamentoError'
  }
}

/**
 * HTTP client for the backend. Every request attaches the Supabase bearer
 * token via `withAuthHeaders()`. The skeleton ships one example call
 * (`fetchFiliais`); financeiro features add their own here.
 */
export async function fetchFiliais(): Promise<FiliaisResponse> {
  const res = await fetch(`${API}/conexos/filiais`, {
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
  const json = await res.json()
  return {
    filiais: json?.filiais ?? [],
    filCodDefault: json?.filCodDefault ?? null,
  }
}

/**
 * Gestão de Permutas — tenta o backend (`GET /permutas/gestao`) e cai no
 * fixture de dados reais quando o backend não responde, erra ou devolve vazio.
 * Esse fallback é a REDE DE SEGURANÇA do demo: a tela nunca quebra na review,
 * mesmo sem Postgres semeado / backend de pé. Quando o banco local estiver
 * populado (Fase B), o backend assume e o fixture só entra como contingência.
 */
export async function fetchGestaoPermutas(): Promise<GestaoPermutasResponse> {
  try {
    const res = await fetch(`${API}/permutas/gestao`, {
      headers: await withAuthHeaders(),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const json = (await res.json()) as Partial<GestaoPermutasResponse>
    if (!json?.pendentes?.length && !json?.invoicesEmAberto?.length) {
      return gestaoPermutasFixture
    }
    return {
      fonte: 'banco',
      geradoEm: json.geradoEm,
      pendentes: json.pendentes ?? [],
      invoicesEmAberto: json.invoicesEmAberto ?? [],
      casamentos: json.casamentos ?? [],
      totais: json.totais ?? {
        pendentes: json.pendentes?.length ?? 0,
        invoicesEmAberto: json.invoicesEmAberto?.length ?? 0,
        elegiveis: (json.pendentes ?? []).filter((p) => p.status === 'elegivel').length,
        bloqueadas: (json.pendentes ?? []).filter((p) => p.status === 'bloqueada').length,
        casamentoManual: (json.pendentes ?? []).filter((p) => p.status === 'casamento-manual')
          .length,
        permutaManual: (json.pendentes ?? []).filter((p) => p.status === 'permuta-manual').length,
        jaPermutado: (json.pendentes ?? []).filter((p) => p.status === 'ja-permutado').length,
      },
    }
  } catch {
    return gestaoPermutasFixture
  }
}

/**
 * Lista as últimas rodadas de ingestão (cron + manuais) para a trilha de
 * auditoria do modal (ADR-0006). Bate em `GET /permutas/runs`. Lança em erro de
 * rede / HTTP para o caller exibir o estado de falha do histórico.
 */
export async function fetchPermutaRuns(limit?: number): Promise<PermutaRun[]> {
  const qs = limit ? `?limit=${encodeURIComponent(limit)}` : ''
  const res = await fetch(`${API}/permutas/runs${qs}`, {
    headers: await withAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}`)
  }
  const json = (await res.json()) as { runs?: PermutaRun[] }
  return json.runs ?? []
}

/**
 * Dispara a ingestão MANUAL e ESPERA terminar (`POST /permutas/ingestao`). O
 * `triggered_by` é derivado server-side do token autenticado. Em 409 lança
 * `IngestaoEmAndamentoError` (já há uma rodada em andamento); demais erros de
 * rede/HTTP viram `Error` genérico para o caller exibir um toast.
 */
export async function runIngestaoManual(): Promise<IngestaoResult> {
  const res = await fetch(`${API}/permutas/ingestao`, {
    method: 'POST',
    headers: await withAuthHeaders(),
  })
  if (res.status === 409) {
    let message: string | undefined
    try {
      const j = await res.json()
      message = j?.message
    } catch {}
    throw new IngestaoEmAndamentoError(message)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error ? ` — ${j.error}` : ''
    } catch {}
    throw new Error(`API ${res.status}${detail}`)
  }
  return (await res.json()) as IngestaoResult
}

/**
 * Cliente-filtro (Fase 1): importadores cujos adtos vão para permuta manual
 * cross-process. CRUD em `/permutas/cliente-filtro`. Token de auth em toda chamada.
 */
export async function fetchClientesFiltro(): Promise<ClienteFiltro[]> {
  const res = await fetch(`${API}/permutas/cliente-filtro`, {
    headers: await withAuthHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = (await res.json()) as { clientes?: ClienteFiltro[] }
  return json.clientes ?? []
}

export async function addClienteFiltro(pesCod: string, importador?: string): Promise<void> {
  const res = await fetch(`${API}/permutas/cliente-filtro`, {
    method: 'POST',
    headers: await withAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ pesCod, ...(importador ? { importador } : {}) }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error ? ` — ${j.error}` : ''
    } catch {}
    throw new Error(`API ${res.status}${detail}`)
  }
}

export async function removeClienteFiltro(pesCod: string): Promise<void> {
  const res = await fetch(`${API}/permutas/cliente-filtro/${encodeURIComponent(pesCod)}`, {
    method: 'DELETE',
    headers: await withAuthHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
}

/**
 * Lançado por `criarAlocacao()` no HTTP 422 — a alocação excederia o saldo de um
 * dos lados (adto ou invoice). A UI mostra a mensagem e NÃO grava (Fase 2).
 */
export class AlocacaoExcedeSaldoError extends Error {
  constructor(message = 'Valor excede o saldo disponível.') {
    super(message)
    this.name = 'AlocacaoExcedeSaldoError'
  }
}

/**
 * Busca LIVE as invoices de um processo NA FILIAL dada, para a alocação manual.
 * `filCod` é obrigatório — o `priCod` não é único entre filiais.
 */
export async function buscarInvoicesPorProcesso(
  priCod: string,
  filCod: number,
): Promise<InvoiceBuscada[]> {
  const res = await fetch(
    `${API}/permutas/invoices/buscar?priCod=${encodeURIComponent(priCod)}&filCod=${encodeURIComponent(filCod)}`,
    { headers: await withAuthHeaders() },
  )
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = (await res.json()) as { invoices?: InvoiceBuscada[] }
  return json.invoices ?? []
}

/** Cria/atualiza uma alocação manual (rascunho). 422 → `AlocacaoExcedeSaldoError`. */
export async function criarAlocacao(
  adiantamentoDocCod: string,
  payload: { invoiceDocCod: string; invoicePriCod: string; valorAlocado: number; observacao?: string },
): Promise<void> {
  const res = await fetch(
    `${API}/permutas/adiantamentos/${encodeURIComponent(adiantamentoDocCod)}/alocacoes`,
    {
      method: 'POST',
      headers: await withAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(payload),
    },
  )
  if (res.status === 422) {
    let message: string | undefined
    try {
      const j = await res.json()
      message = j?.message
    } catch {}
    throw new AlocacaoExcedeSaldoError(message)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error ? ` — ${j.error}` : ''
    } catch {}
    throw new Error(`API ${res.status}${detail}`)
  }
}

/** Remove uma alocação manual (par adto↔invoice). */
export async function removerAlocacao(
  adiantamentoDocCod: string,
  invoiceDocCod: string,
): Promise<void> {
  const res = await fetch(
    `${API}/permutas/adiantamentos/${encodeURIComponent(adiantamentoDocCod)}/alocacoes/${encodeURIComponent(invoiceDocCod)}`,
    { method: 'DELETE', headers: await withAuthHeaders() },
  )
  if (!res.ok) throw new Error(`API ${res.status}`)
}

/** Importadores distintos do backlog — alimenta o seletor do cadastro de filtro. */
export async function fetchImportadores(): Promise<Importador[]> {
  const res = await fetch(`${API}/permutas/importadores`, {
    headers: await withAuthHeaders(),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const json = (await res.json()) as { importadores?: Importador[] }
  return json.importadores ?? []
}

/**
 * Registra o processamento de um adiantamento (botão "Processar"). Bate em
 * `POST /permutas/adiantamentos/:docCod/processar` com o token de auth. O status
 * gravado (`processado`) sobrevive à re-ingestão diária. Lança em erro de rede /
 * HTTP para o caller exibir um toast e NÃO atualizar a tela como sucesso.
 */
export async function processarAdiantamento(
  docCod: string,
  invoiceDocCod?: string,
  observacao?: string,
): Promise<void> {
  const res = await fetch(
    `${API}/permutas/adiantamentos/${encodeURIComponent(docCod)}/processar`,
    {
      method: 'POST',
      headers: await withAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        ...(invoiceDocCod ? { invoiceDocCod } : {}),
        ...(observacao ? { observacao } : {}),
      }),
    },
  )
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error ? ` — ${j.error}` : ''
    } catch {}
    throw new Error(`API ${res.status}${detail}`)
  }
}
