'use client'

import { usePathname } from 'next/navigation'
import { AuthGuard } from './AuthGuard'

/**
 * Public routes that bypass the auth gate. `/login` is the sign-in page and
 * must be reachable by unauthenticated visitors; `/docs` holds the architecture
 * documentation, deliberately published without a session.
 */
const PUBLIC_ROUTES = ['/login', '/docs']

/**
 * Applies the `<AuthGuard>` to every route except the explicitly public ones.
 * Mounted once in the root layout so all current and future app pages
 * (`/` and every domain route) are protected by default.
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
