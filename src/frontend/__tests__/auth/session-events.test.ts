/**
 * The session-events bus bridges the non-React API layer to the React auth
 * state: register a handler, emit fires it, unregister stops it, and dev-bypass
 * makes emit a no-op.
 */
const isDevAuthBypassMock = jest.fn()
jest.mock('@/lib/auth/env', () => ({
  isDevAuthBypass: () => isDevAuthBypassMock(),
}))

import { emitSessionExpired, registerSessionExpiredHandler } from '@/lib/auth/session-events'

describe('session-events bus', () => {
  beforeEach(() => {
    isDevAuthBypassMock.mockReset()
    isDevAuthBypassMock.mockReturnValue(false)
  })

  it('emit calls the registered handler', () => {
    const handler = jest.fn()
    const unregister = registerSessionExpiredHandler(handler)
    emitSessionExpired()
    expect(handler).toHaveBeenCalledTimes(1)
    unregister()
  })

  it('unregister stops the handler from firing', () => {
    const handler = jest.fn()
    const unregister = registerSessionExpiredHandler(handler)
    unregister()
    emitSessionExpired()
    expect(handler).not.toHaveBeenCalled()
  })

  it('is a no-op under dev-bypass', () => {
    const handler = jest.fn()
    registerSessionExpiredHandler(handler)
    isDevAuthBypassMock.mockReturnValue(true)
    emitSessionExpired()
    expect(handler).not.toHaveBeenCalled()
  })
})
