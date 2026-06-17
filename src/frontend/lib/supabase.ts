'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseUrl } from './auth/env'

/**
 * Lazily-created Supabase browser client. Reads `NEXT_PUBLIC_SUPABASE_URL`
 * and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The client persists the session in
 * browser storage and auto-refreshes the access token.
 *
 * Created lazily (not at module load) so that a build / test without
 * Supabase env vars — e.g. when `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` — does
 * not throw. Callers that need the client when bypass is on should guard
 * with `isDevAuthBypass()` first.
 *
 * Arch-review cards security-1 / security-7.
 */
let client: SupabaseClient | undefined

export const getSupabaseClient = (): SupabaseClient => {
  if (!client) {
    const url = supabaseUrl()
    const key = supabaseAnonKey()
    if (!url || !key) {
      throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
          'NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_DEV_AUTH_BYPASS=true for local dev).',
      )
    }
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
