'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { IngestaoEmAndamentoError, fetchPermutaRuns, runIngestaoManual } from '@/lib/api'
import type { PermutaRun } from '@/lib/types'

/**
 * Modal de ingestão manual (ADR-0006): trigger entre os cron jobs + trilha de
 * auditoria das últimas rodadas. `load` (passado de fora) recarrega o painel após
 * uma ingestão bem-sucedida.
 */
export function useIngestao(load: () => Promise<void>) {
  const [ingestaoOpen, setIngestaoOpen] = React.useState(false)
  const [runs, setRuns] = React.useState<PermutaRun[] | null>(null)
  const [runsLoading, setRunsLoading] = React.useState(false)
  const [ingestRunning, setIngestRunning] = React.useState(false)

  const carregarRuns = React.useCallback(async () => {
    setRunsLoading(true)
    try {
      setRuns(await fetchPermutaRuns())
    } catch {
      setRuns([])
    } finally {
      setRunsLoading(false)
    }
  }, [])

  const abrirIngestao = React.useCallback(() => {
    setIngestaoOpen(true)
    void carregarRuns()
  }, [carregarRuns])

  const rodarIngestao = React.useCallback(async () => {
    setIngestRunning(true)
    try {
      const result = await runIngestaoManual()
      toast.success(
        `Ingestão concluída — ${result.totalAdiantamentos} adiantamentos, ${result.totalCasamentos} casamentos.`,
      )
      // Atualiza o painel com os dados recém-ingeridos + a trilha de auditoria.
      await Promise.all([load(), carregarRuns()])
    } catch (err) {
      if (err instanceof IngestaoEmAndamentoError) {
        toast.warning(err.message)
        void carregarRuns()
      } else {
        toast.error(`Falha ao rodar a ingestão${err instanceof Error ? ` — ${err.message}` : ''}.`)
      }
    } finally {
      setIngestRunning(false)
    }
  }, [load, carregarRuns])

  return {
    ingestaoOpen,
    setIngestaoOpen,
    runs,
    runsLoading,
    ingestRunning,
    abrirIngestao,
    rodarIngestao,
  }
}
