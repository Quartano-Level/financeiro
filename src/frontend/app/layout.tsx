import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { RouteGate } from '@/components/auth/RouteGate'
import { UserMenu } from '@/components/auth/UserMenu'
import { AuthProvider } from '@/lib/auth/AuthProvider'
import pkg from '../package.json'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'] })

const APP_VERSION = pkg.version

export const metadata: Metadata = {
  title: `Financeiro · v${APP_VERSION}`,
  description: 'Plataforma financeira — Columbia Trading',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${dmSans.className} antialiased min-h-screen`}>
        <AuthProvider>
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
                  title={`Versao da aplicacao: ${APP_VERSION}`}
                >
                  v{APP_VERSION}
                </span>
                <UserMenu />
              </div>
            </div>
          </header>
          {/* Full-bleed main com padding responsivo — escala com a viewport. */}
          <main className="w-full px-4 sm:px-6 lg:px-8 py-6">
            <RouteGate>{children}</RouteGate>
          </main>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </body>
    </html>
  )
}
