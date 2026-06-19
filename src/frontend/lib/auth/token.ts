'use client'

import { isDevAuthBypass } from './env'

/** localStorage key holding the backend-issued JWT. */
export const TOKEN_STORAGE_KEY = 'auth_token'
/** localStorage key holding the signed-in username (for the header menu). */
export const USERNAME_STORAGE_KEY = 'auth_username'

/**
 * Returns the current access token from `localStorage`, or `undefined` when
 * there is none (or on the server, or when dev-bypass is on). Synchronous —
 * the token lives in `localStorage` (no async session lookup). Used by the API
 * client to attach `Authorization: Bearer <token>` to backend requests.
 */
export const getAccessToken = (): string | undefined => {
  if (isDevAuthBypass()) return undefined
  if (typeof window === 'undefined') return undefined
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined
}

/**
 * Builds request headers with the bearer token attached when available.
 * Kept `async` so callers (`lib/api.ts`) need no change. Merges any
 * caller-supplied headers (caller values take precedence).
 */
export const withAuthHeaders = async (
  base: Record<string, string> = {},
): Promise<Record<string, string>> => {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}`, ...base } : { ...base }
}
