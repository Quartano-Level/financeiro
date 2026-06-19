/**
 * Tests for the access-token helper that powers `Authorization: Bearer`
 * injection. The token now lives in `localStorage` (no Supabase) — a simple
 * in-memory mock stands in for the browser store.
 */

import { TOKEN_STORAGE_KEY } from '@/lib/auth/token'

const store: Record<string, string> = {}

const localStorageMock = {
  getItem: (key: string): string | null => (key in store ? store[key] : null),
  setItem: (key: string, value: string): void => {
    store[key] = value
  },
  removeItem: (key: string): void => {
    delete store[key]
  },
  clear: (): void => {
    for (const key of Object.keys(store)) delete store[key]
  },
}

describe('auth/token', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    localStorageMock.clear()
    process.env = { ...ORIGINAL_ENV }
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    })
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('returns the access token from localStorage', async () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'tok-123')
    const { getAccessToken } = await import('@/lib/auth/token')
    expect(getAccessToken()).toBe('tok-123')
  })

  it('returns undefined when there is no token', async () => {
    const { getAccessToken } = await import('@/lib/auth/token')
    expect(getAccessToken()).toBeUndefined()
  })

  it('returns undefined (ignores the stored token) when dev-bypass is on', async () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'tok-123')
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true'
    const { getAccessToken } = await import('@/lib/auth/token')
    expect(getAccessToken()).toBeUndefined()
  })

  it('withAuthHeaders attaches the Authorization header when a token exists', async () => {
    localStorageMock.setItem(TOKEN_STORAGE_KEY, 'tok-abc')
    const { withAuthHeaders } = await import('@/lib/auth/token')
    await expect(withAuthHeaders({ 'Content-Type': 'application/json' })).resolves.toEqual({
      Authorization: 'Bearer tok-abc',
      'Content-Type': 'application/json',
    })
  })

  it('withAuthHeaders omits the Authorization header when there is no token', async () => {
    const { withAuthHeaders } = await import('@/lib/auth/token')
    await expect(withAuthHeaders({ Accept: 'application/json' })).resolves.toEqual({
      Accept: 'application/json',
    })
  })
})
