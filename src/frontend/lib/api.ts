import { withAuthHeaders } from './auth/token'
import type { FiliaisResponse } from './types'

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
