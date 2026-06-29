/**
 * `apiFetch` centralises 401 handling for the whole API layer: on 401 it fires
 * the session-expired bus and throws `SessionExpiredError`; every other status
 * (including the 409/422 cases callers special-case) is returned verbatim.
 */
const emitMock = jest.fn()
jest.mock('@/lib/auth/session-events', () => ({
  emitSessionExpired: () => emitMock(),
}))

import { apiFetch, isSessionExpiredError, SessionExpiredError } from '@/lib/http'

describe('apiFetch', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    emitMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('throws SessionExpiredError and emits on 401', async () => {
    fetchMock.mockResolvedValue({ status: 401 })
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(SessionExpiredError)
    expect(emitMock).toHaveBeenCalledTimes(1)
  })

  it('returns the response unchanged on 200 (no emit)', async () => {
    const res = { status: 200, ok: true }
    fetchMock.mockResolvedValue(res)
    await expect(apiFetch('/x')).resolves.toBe(res)
    expect(emitMock).not.toHaveBeenCalled()
  })

  it('returns 409 verbatim so callers can still special-case it (no emit)', async () => {
    const res = { status: 409, ok: false }
    fetchMock.mockResolvedValue(res)
    await expect(apiFetch('/x')).resolves.toBe(res)
    expect(emitMock).not.toHaveBeenCalled()
  })

  it('isSessionExpiredError narrows only its own error type', () => {
    expect(isSessionExpiredError(new SessionExpiredError())).toBe(true)
    expect(isSessionExpiredError(new Error('boom'))).toBe(false)
    expect(isSessionExpiredError(null)).toBe(false)
  })
})
