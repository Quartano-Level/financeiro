'use client'

import { isDevAuthBypass } from './env'
import { getSupabaseClient } from '../supabase'

/**
 * Returns the current Supabase access token, or `undefined` when there is no
 * session (or when dev-bypass is on — no token exists then). Used by the API
 * client to attach `Authorization: Bearer <token>` to backend requests.
 *
 * Arch-review cards security-1 / security-7.
 */
export const getAccessToken = async (): Promise<string | undefined> => {
  if (isDevAuthBypass()) return undefined
  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  } catch {
    // Supabase not configured — treat as no token.
    return undefined
  }
}

/**
 * Builds request headers with the bearer token attached when available.
 * Merges any caller-supplied headers (caller values take precedence).
 */
export const withAuthHeaders = async (
  base: Record<string, string> = {},
): Promise<Record<string, string>> => {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}`, ...base } : { ...base }
}
