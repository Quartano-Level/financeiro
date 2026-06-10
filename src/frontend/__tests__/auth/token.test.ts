/**
 * Tests for the access-token helper that powers `Authorization: Bearer`
 * injection. Supabase is mocked — no network calls.
 */

const getSessionMock = jest.fn()

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: getSessionMock },
  }),
}))

describe('auth/token', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    getSessionMock.mockReset()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('returns the access token from the active session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
    const { getAccessToken } = await import('@/lib/auth/token')
    await expect(getAccessToken()).resolves.toBe('tok-123')
  })

  it('returns undefined when there is no session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    const { getAccessToken } = await import('@/lib/auth/token')
    await expect(getAccessToken()).resolves.toBeUndefined()
  })

  it('returns undefined (no Supabase call) when dev-bypass is on', async () => {
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true'
    const { getAccessToken } = await import('@/lib/auth/token')
    await expect(getAccessToken()).resolves.toBeUndefined()
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it('withAuthHeaders attaches the Authorization header when a token exists', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok-abc' } } })
    const { withAuthHeaders } = await import('@/lib/auth/token')
    await expect(withAuthHeaders({ 'Content-Type': 'application/json' })).resolves.toEqual({
      Authorization: 'Bearer tok-abc',
      'Content-Type': 'application/json',
    })
  })

  it('withAuthHeaders omits the Authorization header when there is no token', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } })
    const { withAuthHeaders } = await import('@/lib/auth/token')
    await expect(withAuthHeaders({ Accept: 'application/json' })).resolves.toEqual({
      Accept: 'application/json',
    })
  })
})
