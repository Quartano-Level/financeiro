/**
 * Tests for the auth env guard (arch-review card security-1).
 *
 * `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` disables the auth gate entirely, so it
 * must never reach a deployed (non-local) build. `assertAuthEnv()` crosses the
 * bypass flag with `NEXT_PUBLIC_ENV` and throws a specific startup error when
 * the combination would leave the app unauthenticated.
 */

describe('auth/env guard (security-1)', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
    delete process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS
    delete process.env.NEXT_PUBLIC_ENV
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('throws when bypass=true and NEXT_PUBLIC_ENV is a deployed env (prd)', async () => {
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true'
    process.env.NEXT_PUBLIC_ENV = 'prd'
    const { assertAuthEnv } = await import('@/lib/auth/env')
    expect(() => assertAuthEnv()).toThrow(/DEV_AUTH_BYPASS.*must not be enabled.*"prd"/)
  })

  it('throws when bypass=true and NEXT_PUBLIC_ENV is stg', async () => {
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true'
    process.env.NEXT_PUBLIC_ENV = 'stg'
    const { assertAuthEnv } = await import('@/lib/auth/env')
    expect(() => assertAuthEnv()).toThrow(/must not be enabled/)
  })

  it('throws when bypass=true and NEXT_PUBLIC_ENV is unset (treated as non-local)', async () => {
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true'
    const { assertAuthEnv } = await import('@/lib/auth/env')
    expect(() => assertAuthEnv()).toThrow(/must not be enabled/)
  })

  it('does NOT throw when bypass=true and NEXT_PUBLIC_ENV is local', async () => {
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true'
    process.env.NEXT_PUBLIC_ENV = 'local'
    const { assertAuthEnv } = await import('@/lib/auth/env')
    expect(() => assertAuthEnv()).not.toThrow()
  })

  it('does NOT throw when bypass is off in a deployed env', async () => {
    process.env.NEXT_PUBLIC_ENV = 'prd'
    const { assertAuthEnv } = await import('@/lib/auth/env')
    expect(() => assertAuthEnv()).not.toThrow()
  })

  it('does NOT throw when bypass is off and NEXT_PUBLIC_ENV is unset', async () => {
    const { assertAuthEnv } = await import('@/lib/auth/env')
    expect(() => assertAuthEnv()).not.toThrow()
  })
})
