'use client'

import Link from 'next/link'
import { Banknote } from 'lucide-react'
import type { PermutaPendente, ReconciliarResult } from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** Baixa no ERP fin010 (Fase 3) — preview (dry-run) → executar. */
export function ReconciliarDialog({
  reconcilAdto,
  onClose,
  reconcilResult,
  reconcilLoading,
  reconcilData,
  setReconcilData,
  executarReconciliar,
}: {
  reconcilAdto: PermutaPendente | null
  onClose: () => void
  reconcilResult: ReconciliarResult | null
  reconcilLoading: boolean
  reconcilData: string
  setReconcilData: (v: string) => void
  executarReconciliar: () => void
}) {
  return (
    <Dialog
      open={reconcilAdto != null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Baixar permuta no ERP (fin010)</DialogTitle>
          <DialogDescription>
            Adiantamento {reconcilAdto?.docCod} · {reconcilAdto?.exportador}. A baixa é
            executada par a par (adiantamento → invoice) no borderô do Conexos.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Data do borderô</span>
            <Input
              type="date"
              value={reconcilData}
              onChange={(e) => setReconcilData(e.target.value)}
              className="w-48"
              disabled={reconcilLoading}
            />
            <span className="text-xs text-muted-foreground">
              Sugerida a data da D.I/DUIMP. Ajuste se o período contábil estiver fechado.
            </span>
          </label>

          {reconcilLoading && !reconcilResult ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Montando o preview do borderô…
            </div>
          ) : null}

          {reconcilResult ? (
            <>
              {(() => {
                const settled = reconcilResult.resultados.filter(
                  (r) => r.status === 'settled',
                ).length
                const skipped = reconcilResult.resultados.filter(
                  (r) => r.status === 'skipped',
                ).length
                const errors = reconcilResult.resultados.filter(
                  (r) => r.status === 'error',
                ).length
                // Tom: dry-run = warning; sucesso = success; só-skipped = neutro; erro = destructive.
                const tone = reconcilResult.dryRun
                  ? 'border-warning/40 bg-warning-subtle text-warning-foreground'
                  : settled > 0
                    ? 'border-success/40 bg-success-subtle text-success-foreground'
                    : errors > 0
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-border bg-muted text-muted-foreground'
                return (
                  <div className={cn('rounded-md border p-3 text-sm', tone)}>
                    {reconcilResult.dryRun ? (
                      <>
                        <strong>Pré-visualização (dry-run).</strong> Nenhuma baixa foi
                        gravada no ERP.{' '}
                        {!reconcilResult.writeEnabled
                          ? 'A escrita está DESABILITADA no servidor (CONEXOS_WRITE_ENABLED=false).'
                          : 'Confira os campos abaixo antes de executar.'}
                      </>
                    ) : settled > 0 ? (
                      <>
                        <strong>Baixa executada.</strong> Borderô {reconcilResult.borCod} no
                        fin010 — situação <strong>EM CADASTRO</strong>. Para concluir, revise e{' '}
                        <strong>aprove</strong> em{' '}
                        <Link
                          href="/permutas/borderos"
                          className="font-medium underline underline-offset-2"
                        >
                          Borderôs
                        </Link>
                        .
                      </>
                    ) : skipped > 0 && errors === 0 ? (
                      <>
                        <strong>Nada a baixar.</strong> Par(es) já baixado(s) anteriormente
                        (idempotência) — nenhum borderô novo criado.
                      </>
                    ) : (
                      <>
                        <strong>Falha na baixa.</strong> Veja o detalhe por invoice abaixo.
                      </>
                    )}
                  </div>
                )
              })()}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor baixado</TableHead>
                    <TableHead className="text-right">Juros (variação)</TableHead>
                    <TableHead className="text-right">Conta</TableHead>
                    <TableHead className="text-right">bxaCodSeq</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconcilResult.resultados.map((r) => {
                    const juros = r.payload?.bxaMnyJuros
                    const conta = r.payload?.bxaCodGerJuros
                    return (
                      <TableRow key={r.invoiceDocCod}>
                        <TableCell className="font-medium">{r.invoiceDocCod}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.status === 'settled'
                                ? 'default'
                                : r.status === 'error'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {r.status}
                          </Badge>
                          {r.erro ? (
                            <span className="ml-2 text-xs text-destructive">{r.erro}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {typeof r.valorBaixado === 'number'
                            ? `${formatNumber(r.valorBaixado)} BRL`
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {typeof juros === 'number' ? formatNumber(juros) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {typeof conta === 'number' ? conta : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.bxaCodSeq ?? '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            disabled={reconcilLoading || reconcilResult == null}
            onClick={executarReconciliar}
          >
            {reconcilLoading ? <Spinner /> : <Banknote aria-hidden />} Executar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
