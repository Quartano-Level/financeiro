'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { exportarRelatorio } from '@/lib/api'
import type { RelatorioTipo } from '@/lib/types'

/**
 * Exportação de relatórios (.xlsx). Guarda o `tipo` em andamento para o spinner por
 * item; um clique baixa o arquivo (snapshot completo no backend).
 */
export function useExportRelatorios() {
  const [exportando, setExportando] = React.useState<RelatorioTipo | null>(null)

  const exportar = React.useCallback(async (tipo: RelatorioTipo, label: string) => {
    setExportando(tipo)
    try {
      await exportarRelatorio(tipo)
      toast.success(`Relatório "${label}" exportado.`)
    } catch (err) {
      toast.error(
        `Falha ao exportar "${label}"${err instanceof Error ? ` — ${err.message}` : ''}.`,
      )
    } finally {
      setExportando(null)
    }
  }, [])

  return { exportando, exportar }
}
