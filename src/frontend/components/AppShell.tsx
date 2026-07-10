'use client'

import { usePathname } from 'next/navigation'
import { ConexosStatusBanner } from '@/components/auth/ConexosStatusBanner'
import { RouteGate } from '@/components/auth/RouteGate'
import { UserMenu } from '@/components/auth/UserMenu'

/**
 * App chrome. On the public `/login` route the top header is hidden so the
 * sign-in screen is a clean full-screen experience; everywhere else it renders
 * the normal sticky header + padded main. Auth gating stays via `RouteGate`.
 */
export function AppShell({ version, children }: { version: string; children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/login') {
    return <RouteGate>{children}</RouteGate>
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <div className="w-2 h-6 rounded-sm bg-primary" />
          <h1 className="text-lg font-bold text-foreground">Columbia Trading</h1>
          <span className="text-sm text-muted-foreground">/</span>
          <span className="text-sm text-muted-foreground">Financeiro</span>
          <div className="ml-auto flex items-center gap-3">
            <span
              className="text-xs font-mono text-muted-foreground border rounded-md px-2 py-0.5"
              data-testid="app-version"
              title={`Versao da aplicacao: ${version}`}
            >
              v{version}
            </span>
            <UserMenu />
          </div>
        </div>
      </header>
      <ConexosStatusBanner />
      {/* Full-bleed main com padding responsivo — escala com a viewport. */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <RouteGate>{children}</RouteGate>
      </main>
    </>
  )
}
