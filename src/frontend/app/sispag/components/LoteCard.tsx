'use client'

import { CheckCircle2, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  cancelarLote,
  finalizarLote,
  type LotePagamento,
  marcarRetorno,
  reabrirLote,
  removerItem,
} from '@/lib/sispag'
import { formatBRL } from '@/lib/utils'

const fmtData = (ms?: number) =>
  ms != null ? new Date(ms).toLocaleDateString('pt-BR') : '—'

function StatusLoteBadge({ status }: { status: LotePagamento['status'] }) {
  if (status === 'FINALIZADO')
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        aguardando retorno
      </Badge>
    )
  if (status === 'RETORNADO')
    return (
      <Badge variant="outline" className="border-success/40 text-success">
        de volta do Nexxera
      </Badge>
    )
  if (status === 'CANCELADO')
    return (
      <Badge variant="outline" className="text-muted-foreground">
        cancelado
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-info/40 text-info">
      rascunho
    </Badge>
  )
}

type Acao = (fn: () => Promise<unknown>, okMsg: string) => void

/** Um card de lote candidato/finalizado, com as ações da fase. */
export function LoteCard({
  lote: l,
  busy,
  acao,
}: {
  lote: LotePagamento
  busy: boolean
  acao: Acao
}) {
  const total = l.itens.reduce((acc, i) => acc + (i.valor ?? 0), 0)
  const isRascunho = l.status === 'RASCUNHO'
  const isFinalizado = l.status === 'FINALIZADO'
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusLoteBadge status={l.status} />
          {l.automatico ? (
            <Badge
              variant="outline"
              className="border-info/40 text-info"
              title="Formado automaticamente pelo cron — revise antes de aprovar."
            >
              automático
            </Badge>
          ) : null}
          {l.itens.some((i) => i.internacional) ? (
            <Badge variant="outline" className="border-info/40 text-info">
              internacional
            </Badge>
          ) : null}
          <CardTitle className="text-sm">
            Filial {l.filCod} · {l.itens.length} título(s) · {formatBRL(total)}
          </CardTitle>
        </div>
        <div className="flex flex-wrap gap-1">
          {isRascunho ? (
            <>
              <Button
                size="sm"
                disabled={busy || l.itens.length === 0}
                onClick={() => acao(() => finalizarLote(l.id, l.versao), 'Lote finalizado')}
              >
                <CheckCircle2 className="size-4" /> Finalizar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => acao(() => cancelarLote(l.id, l.versao), 'Lote cancelado')}
              >
                Cancelar
              </Button>
            </>
          ) : null}
          {isFinalizado ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                title="Simula o retorno do Nexxera (o gatilho real é o robô-poller da Fatia 3)."
                onClick={() => acao(() => marcarRetorno(l.id, l.versao), 'Retorno do Nexxera registrado')}
              >
                <CheckCircle2 className="size-4" /> Marcar retorno recebido
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => acao(() => reabrirLote(l.id, l.versao), 'Lote reaberto')}
              >
                Reabrir
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {l.itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Lote vazio.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Credor</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  {isRascunho ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {l.itens.map((i) => (
                  <TableRow key={`${i.docCod}:${i.titCod}`}>
                    <TableCell className="max-w-[16rem] truncate">{i.credor ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.docCod}/{i.titCod}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.valor != null ? formatBRL(i.valor) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtData(i.vencimento)}
                    </TableCell>
                    {isRascunho ? (
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label="remover título"
                          onClick={() =>
                            acao(
                              () =>
                                removerItem(l.id, {
                                  filCod: i.filCod,
                                  docCod: i.docCod,
                                  titCod: i.titCod,
                                }),
                              'Título removido',
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {l.finalizadoPor ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Finalizado por {l.finalizadoPor}
            {l.finalizadoEm ? ` em ${new Date(l.finalizadoEm).toLocaleString('pt-BR')}` : ''}.
            {isFinalizado ? ' Aguardando retorno do Nexxera.' : ''}
            {l.status === 'RETORNADO' ? ' Retorno do Nexxera recebido.' : ''}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
