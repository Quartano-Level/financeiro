'use client'

import { DatabaseZap } from 'lucide-react'
import type { PermutaRun } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRunWhen, rotuloQuemRodou } from './format'
import { RunStatusBadge } from './ui'

/** Modal de ingestão manual de dados (ADR-0006). */
export function IngestaoDialog({
  open,
  setOpen,
  ingestRunning,
  runs,
  runsLoading,
  rodarIngestao,
}: {
  open: boolean
  setOpen: (open: boolean) => void
  ingestRunning: boolean
  runs: PermutaRun[] | null
  runsLoading: boolean
  rodarIngestao: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Não fecha enquanto a ingestão está rodando (espera no modal).
        if (ingestRunning) return
        setOpen(next)
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Ingestão de dados</DialogTitle>
          <DialogDescription>
            Roda a mesma pipeline do agendamento automático, sob demanda.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="rounded-md border border-warning/40 bg-warning-subtle/40 p-3 text-sm text-warning-foreground">
            <p>
              Esta ação lê os dados do <strong>Conexos</strong> e recalcula o painel
              (adiantamentos, invoices, casamentos e elegibilidade). É somente leitura no
              ERP — <strong>nada é baixado nem lançado</strong>. Pode levar alguns segundos;
              aguarde aqui até concluir.
            </p>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">Últimas rodadas</div>
              {runsLoading ? <Spinner className="text-muted-foreground" /> : null}
            </div>
            {runsLoading && !runs ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : runs && runs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quem rodou</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead className="text-right">Elegíveis</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.runId}>
                      <TableCell className="font-medium">
                        {rotuloQuemRodou(run.triggeredBy)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRunWhen(run.finishedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {run.status === 'success'
                          ? run.totalElegiveis.toLocaleString('pt-BR')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma rodada registrada ainda.</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={ingestRunning}
          >
            Fechar
          </Button>
          <Button onClick={() => void rodarIngestao()} disabled={ingestRunning}>
            {ingestRunning ? (
              <>
                <Spinner /> Rodando…
              </>
            ) : (
              <>
                <DatabaseZap aria-hidden /> Rodar agora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
