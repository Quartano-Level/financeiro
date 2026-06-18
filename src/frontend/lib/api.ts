import { withAuthHeaders } from './auth/token'
import type { FiliaisResponse, GestaoPermutasResponse } from './types'
import { gestaoPermutasFixture } from './permutas-fixture'

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

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
      },
    }
  } catch {
    return gestaoPermutasFixture
  }
}
