'use client'

import * as React from 'react'
import type { PermutaBorderoVinculo, PermutaPendente } from '@/lib/types'
import { PermutaPendenteTable } from './PermutaPendenteTable'
import { FiltroBarra, Paginacao, type TabelaFiltro } from './tabela-filtro'
import { BotaoAtualizar } from './ui'

/** Aba "Cross-process": cliente-filtro — o adiantamento casa com invoices de OUTRO processo. */
export const AbaCrossProcess = React.memo(function AbaCrossProcess({
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
        <strong>Cliente-filtro</strong>: o adiantamento casa com invoices de{' '}
        <strong>outro processo</strong>. Busque a invoice pelo número do processo e
        distribua o valor (a invoice precisa ter D.I/DUIMP).
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
