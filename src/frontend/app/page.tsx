import { LayoutDashboard } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Home (`/`) — skeleton landing for the Financeiro app. Authenticated by the
 * `RouteGate` in `app/layout.tsx`. Domain features (built via the `/feature-new`
 * pipeline) replace this placeholder with the real dashboard / report flows.
 */
export default function HomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Template inicial — sem features de domínio ainda."
      />
      <EmptyState
        icon={<LayoutDashboard className="h-8 w-8" aria-hidden />}
        title="Nenhuma análise disponível"
        description="O domínio financeiro ainda não foi modelado. Use o pipeline (/feature-new) para criar a primeira feature; ela substituirá esta tela."
      />
    </div>
  )
}
