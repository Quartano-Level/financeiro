'use client'

import { usePathname } from 'next/navigation'
import { AuthGuard } from './AuthGuard'

/**
 * Public routes that bypass the auth gate. `/login` is the sign-in page and
 * `/auth/callback` completes the OAuth code exchange — both must be reachable
 * by unauthenticated visitors.
 */
const PUBLIC_ROUTES = ['/login', '/auth/callback']

/**
 * Applies the `<AuthGuard>` to every route except the explicitly public ones.
 * Mounted once in the root layout so all current and future app pages
 * (`/` and every domain route) are protected by default.
 *
 * Arch-review cards security-1 / security-7.
 */
export function RouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  if (isPublic) {
    return <>{children}</>
  }

  return <AuthGuard>{children}</AuthGuard>
}
