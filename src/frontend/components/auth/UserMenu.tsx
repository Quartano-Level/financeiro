'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth/AuthProvider'

/**
 * Header user menu: shows the signed-in identity and a sign-out action.
 * Renders nothing when there is no session (e.g. on the `/login` page) and
 * in dev-bypass mode there is no real session to sign out of.
 *
 * Arch-review cards security-1 / security-7.
 */
export function UserMenu() {
  const { user, devBypass, signOut } = useAuth()
  const router = useRouter()

  if (devBypass || !user) {
    return null
  }

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  const label = user.email ?? user.user_metadata?.name ?? 'Conta'

  return (
    <div className="flex items-center gap-2" data-testid="user-menu">
      <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
      <Button variant="ghost" size="sm" onClick={handleSignOut} data-testid="signout-button">
        <LogOut className="size-4" />
        Sair
      </Button>
    </div>
  )
}
