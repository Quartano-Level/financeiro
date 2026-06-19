import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/AppShell'
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
          <AppShell version={APP_VERSION}>{children}</AppShell>
          <Toaster position="bottom-right" richColors />
        </AuthProvider>
      </body>
    </html>
  )
}
