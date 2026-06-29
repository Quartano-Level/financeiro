import { isDevAuthBypass } from './env'

/**
 * Module-level bridge between the non-React API layer (`lib/http.ts`) and the
 * React auth state (`AuthProvider`). `apiFetch` cannot call hooks, so when it
 * sees a 401 it emits through this single-subscriber bus; `AuthProvider`
 * registers the handler on mount and opens the session-expired modal.
 *
 * Single subscriber by design — there is exactly one `AuthProvider` mounted in
 * the app. Registering again replaces the previous handler.
 */
let handler: (() => void) | null = null

/**
 * Registers the session-expired handler (called by `AuthProvider`). Returns an
 * unregister function for the effect cleanup.
 */
export const registerSessionExpiredHandler = (fn: () => void): (() => void) => {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

/**
 * Notifies that the session expired (a request came back 401). No-op under
 * dev-bypass (the auth gate is off) and when no handler is registered yet
 * (SSR / early boot).
 */
export const emitSessionExpired = (): void => {
  if (isDevAuthBypass()) return
  handler?.()
}
