'use client'

import * as React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ItemHistorico } from './format'
import { FiltroBarra, Paginacao, type TabelaFiltro } from './tabela-filtro'
import { BotaoAtualizar, Moeda } from './ui'

/** Tabela read-only do HISTÓRICO (permutas já executadas, com borderô). As ações ficam em Borderôs. */
function renderHistoricoTable(list: ItemHistorico[]) {
  return list.length === 0 ? (
    <EmptyState
      title="Nada no histórico ainda"
      description="Permutas executadas (com borderô criado) aparecem aqui — saem das abas de trabalho."
    />
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Filial</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Processo / Cliente</TableHead>
          <TableHead>Adiantamento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Borderô</TableHead>
          <TableHead className="text-right">Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map((h) => (
          <TableRow key={h.key}>
            <TableCell>{h.filCod}</TableCell>
            <TableCell>{h.tipo}</TableCell>
            <TableCell className="font-medium">
              {h.priCod}
              <div className="text-xs font-normal text-muted-foreground">
                {h.cliente || h.exportador}
              </div>
            </TableCell>
            <TableCell>{h.adtoDocCod}</TableCell>
            <TableCell className="text-right">
              <Moeda valor={h.valor} moeda={h.moeda} />
            </TableCell>
            <TableCell>{h.borCod ?? '—'}</TableCell>
            <TableCell className="text-right">
              {h.finalizado ? (
                <Badge className="border-transparent bg-success-subtle text-success-foreground">
                  <CheckCircle2 aria-hidden /> Finalizado
                </Badge>
              ) : (
                <Badge className="border-transparent bg-warning-subtle text-warning-foreground">
                  Aguardando finalização
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Aba "Histórico": permutas já executadas (borderô criado) — read-only. */
export const AbaHistorico = React.memo(function AbaHistorico({
  aba,
  loading,
  onAtualizar,
}: {
  aba: TabelaFiltro<ItemHistorico>
  loading: boolean
  onAtualizar: () => void
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <strong>Histórico</strong>: permutas já executadas (borderô criado) — saíram das
        abas de trabalho para não poluir. Read-only; aprovar/cancelar é na aba{' '}
        <strong>Borderôs</strong>. Aguardando finalização no topo, finalizadas no fundo.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltroBarra aba={aba} buscaPlaceholder="Buscar processo, cliente ou borderô…" />
        <BotaoAtualizar loading={loading} onClick={onAtualizar} />
      </div>
      {renderHistoricoTable(aba.slice)}
      <Paginacao aba={aba} />
    </>
  )
})
