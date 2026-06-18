'use client'

import * as React from 'react'
import { ArrowLeftRight, Ban, CheckCircle2, Layers, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { fetchGestaoPermutas, processarAdiantamento } from '@/lib/api'
import type {
  GestaoPermutasResponse,
  ProcessamentoStatus,
  StatusElegibilidade,
} from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { KPIGrid, SimpleKPI } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** Rótulos legíveis para os motivos de bloqueio do snapshot. */
const MOTIVO_LABEL: Record<string, string> = {
  'nao-pago': 'Não totalmente pago',
  'sem-saldo-permutar': 'Sem saldo a permutar',
  'di-duimp-ambos': 'D.I e DUIMP (anomalia)',
  'data-base-indisponivel': 'Sem D.I / DUIMP',
  'sem-invoice': 'Sem invoice',
  'composto-nm': 'Múltiplas invoices (N:M)',
  'multiplas-invoices': 'Múltiplas invoices',
  'falha-gate': 'Falha em gate',
  'detail-indisponivel': 'Detalhe indisponível',
}

function StatusBadge({ status, motivo }: { status: StatusElegibilidade; motivo?: string }) {
  if (status === 'elegivel') {
    return (
      <Badge className="border-transparent bg-success-subtle text-success-foreground">
        <CheckCircle2 aria-hidden /> Elegível
      </Badge>
    )
  }
  if (status === 'casamento-manual') {
    return (
      <Badge
        className="border-transparent bg-warning-subtle text-warning-foreground"
        title={MOTIVO_LABEL[motivo ?? ''] ?? 'Casamento manual (N:M)'}
      >
        <Layers aria-hidden /> Casamento manual (N:M)
      </Badge>
    )
  }
  return (
    <Badge
      className="border-transparent bg-danger-subtle text-danger-foreground"
      title={motivo ? MOTIVO_LABEL[motivo] ?? motivo : undefined}
    >
      <Ban aria-hidden /> {motivo ? MOTIVO_LABEL[motivo] ?? motivo : 'Bloqueada'}
    </Badge>
  )
}

/** Rótulos do status de processamento do analista. */
const PROCESSAMENTO_LABEL: Record<ProcessamentoStatus, string> = {
  pendente: 'Pendente',
  processando: 'Processando',
  processado: 'Processado',
  erro: 'Erro',
}

/** Badge do status de processamento (botão "Processar"). */
function ProcessamentoBadge({ status }: { status: ProcessamentoStatus }) {
  if (status === 'processado') {
    return (
      <Badge className="border-transparent bg-success-subtle text-success-foreground">
        <CheckCircle2 aria-hidden /> Processado
      </Badge>
    )
  }
  if (status === 'erro') {
    return (
      <Badge className="border-transparent bg-danger-subtle text-danger-foreground">
        <Ban aria-hidden /> Erro
      </Badge>
    )
  }
  return <Badge variant="outline">{PROCESSAMENTO_LABEL[status]}</Badge>
}

/** Valor em moeda negociada (número pt-BR) + código da moeda em tom suave. */
function Moeda({ valor, moeda }: { valor: number; moeda: string }) {
  return (
    <span className="tabular-nums">
      {formatNumber(valor)} <span className="text-xs text-muted-foreground">{moeda}</span>
    </span>
  )
}

/** Filtro de status aplicado à tabela de pendentes (dirigido pelos KPIs). */
type FiltroStatus = 'todos' | StatusElegibilidade

/** Rótulo do estado-vazio por filtro de status. */
const FILTRO_VAZIO_LABEL: Record<StatusElegibilidade, string> = {
  elegivel: 'elegível',
  bloqueada: 'bloqueado',
  'casamento-manual': 'em casamento manual',
}

export default function GestaoPermutasPage() {
  const [data, setData] = React.useState<GestaoPermutasResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [filtro, setFiltro] = React.useState<FiltroStatus>('todos')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchGestaoPermutas())
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial: resolve a promise num callback (sem setState síncrono no
  // corpo do effect) e ignora o resultado se o componente desmontar.
  React.useEffect(() => {
    let active = true
    fetchGestaoPermutas().then((d) => {
      if (!active) return
      setData(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const [processando, setProcessando] = React.useState<string | null>(null)

  const processar = React.useCallback(
    async (adtoDocCod: string, adtoRef: string, invoiceDocCod: string) => {
      setProcessando(adtoDocCod)
      try {
        await processarAdiantamento(adtoDocCod, invoiceDocCod)
        toast.success(`Adiantamento ${adtoRef} processado`)
        await load()
      } catch (err) {
        toast.error(
          `Falha ao processar ${adtoRef}${err instanceof Error ? `: ${err.message}` : ''}`,
        )
      } finally {
        setProcessando(null)
      }
    },
    [load],
  )

  const pendentesFiltrados =
    data && filtro !== 'todos'
      ? data.pendentes.filter((p) => p.status === filtro)
      : (data?.pendentes ?? [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Permutas"
        subtitle="Adiantamentos PROFORMA pendentes de permuta e invoices em aberto — casamento e baixa assistidos (Frente I)."
        actions={
          <div className="flex items-center gap-2">
            {data ? (
              <Badge
                variant="outline"
                title={
                  data.fonte === 'banco'
                    ? 'Dados do Postgres local (eleição semeada)'
                    : 'Dados de demonstração (fixture com valores reais)'
                }
              >
                fonte: {data.fonte === 'banco' ? 'banco local' : 'fixture'}
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Atualizar
            </Button>
          </div>
        }
      />

      {loading && !data ? (
        <LoadingSkeleton />
      ) : !data ? (
        <EmptyState title="Não foi possível carregar a gestão de permutas" />
      ) : (
        <>
          <KPIGrid columns={5}>
            <SimpleKPI
              color="info"
              label="Adiantamentos pendentes"
              value={data.totais.pendentes}
              footer="PROFORMA aguardando permuta"
              tooltip="Mostrar todos os adiantamentos pendentes"
              active={filtro === 'todos'}
              onClick={() => setFiltro('todos')}
            />
            <SimpleKPI
              color="success"
              label="Elegíveis"
              value={data.totais.elegiveis}
              footer="passaram os 4 gates"
              tooltip="Filtrar a tabela pelos elegíveis"
              active={filtro === 'elegivel'}
              onClick={() => setFiltro('elegivel')}
            />
            <SimpleKPI
              color="warning"
              label="Casamento manual"
              value={data.totais.casamentoManual}
              footer="N:M, falta escolher invoice"
              tooltip="Filtrar a tabela pelos casamentos manuais (N:M)"
              active={filtro === 'casamento-manual'}
              onClick={() => setFiltro('casamento-manual')}
            />
            <SimpleKPI
              color="danger"
              label="Bloqueadas"
              value={data.totais.bloqueadas}
              footer="pendência de gate"
              tooltip="Filtrar a tabela pelas bloqueadas"
              active={filtro === 'bloqueada'}
              onClick={() => setFiltro('bloqueada')}
            />
            <SimpleKPI
              color="info"
              label="Invoices em aberto"
              value={data.totais.invoicesEmAberto}
              footer="finalizadas, a casar"
            />
          </KPIGrid>

          {/* Visão geral — adiantamentos pendentes de permuta */}
          <Card>
            <CardHeader>
              <CardTitle>Adiantamentos pendentes de permuta</CardTitle>
            </CardHeader>
            <CardContent>
              {pendentesFiltrados.length === 0 ? (
                <EmptyState
                  title={
                    filtro === 'todos'
                      ? 'Nenhum adiantamento pendente'
                      : `Nenhum adiantamento ${FILTRO_VAZIO_LABEL[filtro]}`
                  }
                  description={
                    filtro === 'todos'
                      ? 'Não há PROFORMA aguardando permuta na última eleição.'
                      : 'Ajuste o filtro nos cartões acima para ver os demais.'
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>Referência</TableHead>
                      <TableHead>Exportador</TableHead>
                      <TableHead className="text-right">Valor Moeda Negociada</TableHead>
                      <TableHead className="text-right">Dias em Aberto</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentesFiltrados.map((p) => (
                      <TableRow key={p.docCod}>
                        <TableCell>{p.filCod}</TableCell>
                        <TableCell className="font-medium">{p.referencia}</TableCell>
                        <TableCell>{p.exportador}</TableCell>
                        <TableCell className="text-right">
                          <Moeda valor={p.valorMoedaNegociada} moeda={p.moeda} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.diasEmAberto ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={p.status} motivo={p.motivoBloqueio} />
                            {p.processamentoStatus ? (
                              <ProcessamentoBadge status={p.processamentoStatus} />
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Casamento sugerido — invoice em aberto ↔ adiantamentos (N:M, parcial) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="size-4" aria-hidden /> Casamento sugerido
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.casamentos.length === 0 ? (
                <EmptyState
                  title="Nenhum casamento sugerido"
                  description="Não há invoices em aberto casáveis na última eleição."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>Invoice em aberto</TableHead>
                      <TableHead className="text-right">Valor Moeda Negociada</TableHead>
                      <TableHead>Adiantamento</TableHead>
                      <TableHead className="text-right">Valor a ser Usado</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.casamentos.flatMap((c, g) => {
                      const linhas = c.adiantamentos.length > 0 ? c.adiantamentos : [null]
                      // Banding por GRUPO (invoice): cada grupo é um bloco de cor
                      // uniforme — evita o hover pintar a célula esticada (rowSpan)
                      // e as bordas só-do-lado-direito que davam aspecto "bugado".
                      const groupBg = g % 2 === 1 ? 'bg-muted/40' : 'bg-card'
                      return linhas.map((adto, i) => (
                        <TableRow
                          key={`${c.invoice.docCod}-${adto?.docCod ?? 'none'}`}
                          className={cn('border-b-0 hover:bg-transparent', groupBg)}
                        >
                          {i === 0 ? (
                            <>
                              <TableCell rowSpan={linhas.length} className="align-top">
                                {c.invoice.filCod}
                              </TableCell>
                              <TableCell
                                rowSpan={linhas.length}
                                className="align-top font-medium"
                              >
                                {c.invoice.referencia}
                                <div className="text-xs font-normal text-muted-foreground">
                                  {c.invoice.exportador}
                                </div>
                              </TableCell>
                              <TableCell
                                rowSpan={linhas.length}
                                className="align-top text-right"
                              >
                                <Moeda
                                  valor={c.invoice.valorMoedaNegociada}
                                  moeda={c.invoice.moeda}
                                />
                              </TableCell>
                            </>
                          ) : null}
                          {adto ? (
                            <>
                              <TableCell
                                className={cn(
                                  'font-medium',
                                  i > 0 && 'border-t border-border/40',
                                )}
                              >
                                {adto.referencia}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-right',
                                  i > 0 && 'border-t border-border/40',
                                )}
                              >
                                <Moeda valor={adto.valorASerUsado} moeda={adto.moeda} />
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-right',
                                  i > 0 && 'border-t border-border/40',
                                )}
                              >
                                {adto.processamentoStatus === 'processado' ? (
                                  <ProcessamentoBadge status="processado" />
                                ) : (
                                  <Button
                                    size="sm"
                                    disabled={processando === adto.docCod}
                                    onClick={() =>
                                      void processar(
                                        adto.docCod,
                                        adto.referencia,
                                        c.invoice.docCod,
                                      )
                                    }
                                  >
                                    {processando === adto.docCod ? 'Processando…' : 'Processar'}
                                  </Button>
                                )}
                              </TableCell>
                            </>
                          ) : (
                            <TableCell colSpan={3} className="text-sm text-muted-foreground">
                              Sem adiantamento sugerido ainda.
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <KPIGrid columns={5}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </KPIGrid>
      <Skeleton className="h-64" />
    </div>
  )
}
