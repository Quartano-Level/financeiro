'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useIsAuthenticated } from '@/lib/auth/AuthProvider'
import { Spinner } from '@/components/ui/spinner'

/**
 * Client-side route guard. Renders its children only for authenticated
 * visitors; unauthenticated visitors are redirected to `/login`. While the
 * session is still resolving a spinner is shown.
 *
 * When `NEXT_PUBLIC_DEV_AUTH_BYPASS=true`, `useIsAuthenticated()` reports
 * `authenticated: true` immediately, so the gate is effectively disabled.
 *
 * Wraps the protected app layout; the `/login` route is NOT wrapped and
 * stays public.
 *
 * Arch-review cards security-1 / security-7.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useIsAuthenticated()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login')
    }
  }, [loading, authenticated, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="auth-loading">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!authenticated) {
    // Redirect is in flight — render nothing to avoid flashing protected UI.
    return null
  }

  return <>{children}</>
}
