'use client'

import * as React from 'react'
import { fetchGestaoPermutas, fetchPermutaStatus } from '@/lib/api'
import type { GestaoPermutasResponse, PermutaBorderoVinculo } from '@/lib/types'

/**
 * Estado compartilhado da tela de permutas: o snapshot da gestão (`/gestao`) + o
 * status vivo PERMUTA→BORDERÔ por adiantamento (carga LAZY do nosso banco). `load`
 * rebusca ambos; é o gatilho usado por todos os fluxos de baixa/processamento.
 */
export function usePermutasData() {
  const [data, setData] = React.useState<GestaoPermutasResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  // Status PERMUTA→BORDERÔ por adiantamento (carga LAZY, status vivo do fin010). Mantém o painel
  // rápido (o /gestao não bate no ERP) e enriquece os badges depois. {} = sem vínculo (pendente).
  const [statusPorAdto, setStatusPorAdto] = React.useState<Record<string, PermutaBorderoVinculo>>(
    {},
  )

  const carregarStatus = React.useCallback(async () => {
    try {
      const r = await fetchPermutaStatus()
      setStatusPorAdto(r.porAdiantamento ?? {})
    } catch {
      // best-effort: badge cai pra "pendente" se o status não vier.
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchGestaoPermutas())
    } finally {
      setLoading(false)
    }
    void carregarStatus()
  }, [carregarStatus])

  // Carga inicial: resolve a promise num callback (sem setState síncrono no
  // corpo do effect) e ignora o resultado se o componente desmontar.
  React.useEffect(() => {
    let active = true
    fetchGestaoPermutas().then((d) => {
      if (!active) return
      setData(d)
      setLoading(false)
    })
    void carregarStatus()
    return () => {
      active = false
    }
  }, [carregarStatus])

  return { data, loading, statusPorAdto, carregarStatus, load }
}
