'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/lib/auth/AuthProvider'

/**
 * Sign-in page. Offers a single "Entrar com Microsoft" action that starts
 * the Azure AD OAuth flow via Supabase. Already-authenticated visitors (or
 * dev-bypass mode) are bounced straight to the app root.
 *
 * This route is public — it is excluded from the `RouteGate` guard.
 *
 * Arch-review cards security-1 / security-7.
 */
export default function LoginPage() {
  const { signInWithMicrosoft, session, devBypass, loading } = useAuth()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (devBypass || session) {
      router.replace('/')
    }
  }, [devBypass, session, router])

  async function handleSignIn() {
    setError(null)
    setSubmitting(true)
    try {
      await signInWithMicrosoft()
      // On success the browser is redirected to Azure AD; nothing else to do.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar o login.')
      setSubmitting(false)
    }
  }

  if (loading || devBypass || session) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-24">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use sua conta Microsoft corporativa para acessar o Financeiro.
          </p>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm">
              {error}
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleSignIn}
            disabled={submitting}
            data-testid="microsoft-signin"
          >
            {submitting ? <Spinner className="size-4" /> : 'Entrar com Microsoft'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
