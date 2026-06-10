'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { isDevAuthBypass } from '@/lib/auth/env'
import { getSupabaseClient } from '@/lib/supabase'

/**
 * OAuth callback route. Supabase redirects here after the Azure AD round-trip.
 * `detectSessionInUrl: true` (set on the browser client) makes the SDK
 * exchange the auth code in the URL for a session automatically; this page
 * just waits for that to settle and then forwards to the app root.
 *
 * Public route — excluded from the `RouteGate` guard.
 *
 * Arch-review cards security-1 / security-7.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isDevAuthBypass()) {
      router.replace('/')
      return
    }

    let active = true
    const supabase = getSupabaseClient()

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return
        if (sessionError) {
          setError(sessionError.message)
          return
        }
        router.replace(data.session ? '/' : '/login')
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Falha ao concluir o login.')
      })

    return () => {
      active = false
    }
  }, [router])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <p className="text-destructive text-sm">Erro ao concluir o login: {error}</p>
        <a href="/login" className="text-sm underline">
          Voltar ao login
        </a>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-24" data-testid="auth-callback-loading">
      <Spinner className="size-6" />
    </div>
  )
}
