import Link from 'next/link'
import { ArrowLeftRight, Banknote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Home (`/`) — landing do Financeiro. Autenticada pelo `RouteGate` em
 * `app/layout.tsx`. Lista as frentes de domínio disponíveis; a primeira
 * (Permutas — Frente I) já tem tela própria.
 */
export default function HomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Automação assistida da área Financeira da Columbia Trading."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="size-4" aria-hidden /> Permutas
            </CardTitle>
            <CardDescription>
              Adiantamentos PROFORMA ↔ invoices: elegibilidade, casamento e baixa assistida (Frente I).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/permutas">Abrir Gestão de Permutas</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-4" aria-hidden /> SISPAG — Pagamentos
            </CardTitle>
            <CardDescription>
              Títulos a pagar, montagem do lote e conciliação (Frente II). Esboço read-only — nada é
              executado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/sispag">Abrir Painel SISPAG (esboço)</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
