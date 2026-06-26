'use client'

import * as React from 'react'
import type { PermutaBorderoVinculo, PermutaPendente } from '@/lib/types'
import { PermutaPendenteTable } from './PermutaPendenteTable'
import { FiltroBarra, Paginacao, type TabelaFiltro } from './tabela-filtro'
import { BotaoAtualizar } from './ui'

/** Aba "Cross-over": N adiantamentos ↔ M invoices (mesmo processo). */
export const AbaCrossOver = React.memo(function AbaCrossOver({
  aba,
  statusPorAdto,
  abrirAlocar,
  abrirReconciliar,
  loading,
  onAtualizar,
}: {
  aba: TabelaFiltro<PermutaPendente>
  statusPorAdto: Record<string, PermutaBorderoVinculo>
  abrirAlocar: (p: PermutaPendente) => void
  abrirReconciliar: (p: PermutaPendente) => void
  loading: boolean
  onAtualizar: () => void
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        <strong>N adiantamentos ↔ M invoices</strong> (mesmo processo): vários
        adiantamentos e várias invoices se cruzam. Você decide cada ligação e o valor.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FiltroBarra aba={aba} buscaPlaceholder="Buscar código ou cliente…" />
        <BotaoAtualizar loading={loading} onClick={onAtualizar} />
      </div>
      <PermutaPendenteTable
        list={aba.slice}
        statusPorAdto={statusPorAdto}
        abrirAlocar={abrirAlocar}
        abrirReconciliar={abrirReconciliar}
      />
      <Paginacao aba={aba} />
    </>
  )
})
