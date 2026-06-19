'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { assertAuthEnv, isDevAuthBypass } from './env'
import { TOKEN_STORAGE_KEY, USERNAME_STORAGE_KEY } from './token'

// Fail-fast: crash on import if dev-bypass is on in a non-local build, instead
// of silently rendering an unauthenticated app.
assertAuthEnv()

/** Backend API base URL (same default as `lib/api.ts`). */
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

/**
 * Authentication context for the app. Holds a backend-issued JWT in
 * `localStorage` and exposes the current username, a loading flag, and
 * sign-in / sign-out actions.
 *
 * When `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` the provider reports a synthetic
 * authenticated state and never calls the backend, so local development works
 * without logging in.
 */
export interface AuthContextValue {
  token: string | null
  username: string | null
  loading: boolean
  /** True when bypass mode is active (no real token). */
  devBypass: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const devBypass = isDevAuthBypass()
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(!devBypass)

  useEffect(() => {
    if (devBypass) return
    if (typeof window !== 'undefined') {
      setToken(window.localStorage.getItem(TOKEN_STORAGE_KEY))
      setUsername(window.localStorage.getItem(USERNAME_STORAGE_KEY))
    }
    setLoading(false)
  }, [devBypass])

  const signIn = useCallback(
    async (user: string, password: string) => {
      if (devBypass) return
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password }),
      })
      if (!res.ok) {
        let message = 'Falha ao entrar.'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {}
        throw new Error(message)
      }
      const body = (await res.json()) as { token: string; username: string }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, body.token)
        window.localStorage.setItem(USERNAME_STORAGE_KEY, body.username)
      }
      setToken(body.token)
      setUsername(body.username)
    },
    [devBypass],
  )

  const signOut = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
      window.localStorage.removeItem(USERNAME_STORAGE_KEY)
    }
    setToken(null)
    setUsername(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ token, username, loading, devBypass, signIn, signOut }),
    [token, username, loading, devBypass, signIn, signOut],
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
 * true when dev-bypass is on OR a token exists.
 */
export function useIsAuthenticated(): { authenticated: boolean; loading: boolean } {
  const { token, loading, devBypass } = useAuth()
  if (devBypass) return { authenticated: true, loading: false }
  return { authenticated: token != null, loading }
}
