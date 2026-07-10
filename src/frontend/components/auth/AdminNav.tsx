'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/lib/auth/AuthProvider'

/**
 * Header link to the user-management screen. Rendered only for admins — the
 * real gate is server-side (`requireRole('admin')`); this just hides the entry
 * point for operators.
 */
export function AdminNav() {
  const isAdmin = useIsAdmin()
  const pathname = usePathname()
  if (!isAdmin) return null

  return (
    <Button
      asChild
      variant={pathname?.startsWith('/usuarios') ? 'secondary' : 'ghost'}
      size="sm"
    >
      <Link href="/usuarios">
        <Users className="size-4" aria-hidden /> Usuários
      </Link>
    </Button>
  )
}
