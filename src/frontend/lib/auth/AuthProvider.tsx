'use client'

import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from '../supabase'
import { assertAuthEnv, isDevAuthBypass } from './env'

// Fail-fast (arch-review card security-1): crash on import if dev-bypass is on
// in a non-local build, instead of silently rendering an unauthenticated app.
assertAuthEnv()

/**
 * Authentication context for the app. Wraps the Supabase session and exposes
 * the current user, a loading flag, and sign-in / sign-out actions.
 *
 * When `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` the provider reports a synthetic
 * authenticated state and never touches Supabase, so local development works
 * without the Azure AD round-trip.
 *
 * Arch-review cards security-1 / security-7.
 */
export interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** True when bypass mode is active (no real Supabase session). */
  devBypass: boolean
  signInWithMicrosoft: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** Resolves the OAuth callback URL for the running origin. */
const callbackUrl = (): string =>
  typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const devBypass = isDevAuthBypass()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!devBypass)

  useEffect(() => {
    if (devBypass) return

    const supabase = getSupabaseClient()
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [devBypass])

  const signInWithMicrosoft = useCallback(async () => {
    if (devBypass) return
    const supabase = getSupabaseClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email',
        redirectTo: callbackUrl(),
      },
    })
    if (error) throw error
  }, [devBypass])

  const signOut = useCallback(async () => {
    if (devBypass) return
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    setSession(null)
  }, [devBypass])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      devBypass,
      signInWithMicrosoft,
      signOut,
    }),
    [session, loading, devBypass, signInWithMicrosoft, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Hook exposing the current auth context. Must be used under `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}

/**
 * Returns whether the current visitor is allowed past the auth gate:
 * true when dev-bypass is on OR a Supabase session exists.
 */
export function useIsAuthenticated(): { authenticated: boolean; loading: boolean } {
  const { session, loading, devBypass } = useAuth()
  if (devBypass) return { authenticated: true, loading: false }
  return { authenticated: session != null, loading }
}
