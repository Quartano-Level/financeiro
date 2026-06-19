/**
 * Authentication-related environment flags, read once from the
 * `NEXT_PUBLIC_*` vars. Centralised so the dev-bypass behaviour is defined
 * in exactly one place.
 */

/**
 * When `NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'` the auth gate is skipped so
 * local development can run without logging in. Default off — must never be
 * `'true'` in a deployed build.
 */
export const isDevAuthBypass = (): boolean =>
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true'

/**
 * The single environment where dev-bypass is permitted. Any other value of
 * `NEXT_PUBLIC_ENV` — including unset — is treated as a deployed build, so the
 * guard fails safe.
 */
const LOCAL_ENV = 'local'

/**
 * Fail-fast guard. `isDevAuthBypass()` disables the auth gate entirely, so it
 * must never ship in a non-local build. Throws a specific startup error when
 * bypass is on and `NEXT_PUBLIC_ENV` is anything other than `'local'`, turning
 * a silent unauthenticated deploy into a crash.
 *
 * Call once at app startup (e.g. in the root layout / providers).
 */
export const assertAuthEnv = (): void => {
  if (isDevAuthBypass() && process.env.NEXT_PUBLIC_ENV !== LOCAL_ENV) {
    const env = process.env.NEXT_PUBLIC_ENV ?? '(unset)'
    throw new Error(
      `NEXT_PUBLIC_DEV_AUTH_BYPASS must not be enabled outside local ` +
        `(NEXT_PUBLIC_ENV="${env}"). It disables the auth gate and would ship ` +
        `an unauthenticated build. Set NEXT_PUBLIC_ENV=local for dev-bypass, ` +
        `or unset NEXT_PUBLIC_DEV_AUTH_BYPASS for deployed builds.`,
    )
  }
}
