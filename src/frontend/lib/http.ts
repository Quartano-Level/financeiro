import { emitSessionExpired } from './auth/session-events'

/**
 * Thrown by `apiFetch` when the backend answers HTTP 401 — the app JWT (12h)
 * expired (or is otherwise invalid). Callers should let it bubble; the
 * `SessionExpiredModal` (driven by `emitSessionExpired`) owns the UX, so
 * mutation `catch` blocks swallow it via `isSessionExpiredError` instead of
 * showing their generic error toast.
 */
export class SessionExpiredError extends Error {
  constructor(message = 'Sua sessão expirou.') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

/** Type guard so `catch` blocks can distinguish session expiry from real errors. */
export const isSessionExpiredError = (err: unknown): err is SessionExpiredError =>
  err instanceof SessionExpiredError

/**
 * Thin `fetch` wrapper that centralises 401 handling for the whole API layer.
 * On 401 it fires the session-expired bus (opens the modal) and throws
 * `SessionExpiredError`; every other status (including the 409/422 special
 * cases the callers inspect) is returned verbatim, so existing per-call
 * handling is untouched.
 */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const res = await fetch(input, init)
  if (res.status === 401) {
    emitSessionExpired()
    throw new SessionExpiredError()
  }
  return res
}
