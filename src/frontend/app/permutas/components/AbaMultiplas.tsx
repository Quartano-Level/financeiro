'use client'

import * as React from 'react'
import type { PermutaBorderoVinculo, PermutaPendente } from '@/lib/types'
import { PermutaPendenteTable } from './PermutaPendenteTable'
import { FiltroBarra, Paginacao, type TabelaFiltro } from './tabela-filtro'
import { BotaoAtualizar } from './ui'

/** Aba "Múltiplas": 1 adiantamento → N invoices (mesmo processo), Σ > saldo do adto. */
export const AbaMultiplas = React.memo(function AbaMultiplas({
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
        <strong>1 adiantamento → N invoices</strong> (mesmo processo) onde a soma das
        invoices <strong>ultrapassa</strong> o saldo do adiantamento — exige o analista
        decidir a distribuição. Escolha a invoice e o valor a abater.
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
