'use client'

import { Play } from 'lucide-react'
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
import { Spinner } from '@/components/ui/spinner'
import { LOTE_MAX, type LoteResumo, PROCESSAMENTO_HABILITADO } from './format'
import { Campo, Moeda } from './ui'

/** Confirmação do lote — "Executar" as próximas N automáticas de uma vez. */
export function ConfirmarLoteDialog({
  open,
  onOpenChange,
  loteResumo,
  executandoLote,
  executarLote,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  loteResumo: LoteResumo
  executandoLote: boolean
  executarLote: (docCods: string[], totalPendentes: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Executar próximas {loteResumo.proximosN} automáticas</DialogTitle>
          <DialogDescription>
            Cria os borderôs deste lote (baixa real no ERP). A execução é em lotes de até{' '}
            {LOTE_MAX} — clique de novo para os próximos. Esta ação é irreversível e ignora os
            filtros da tela.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Campo label="Neste lote">{loteResumo.proximosN}</Campo>
            <Campo label="Automáticas pendentes (total)">{loteResumo.adtos}</Campo>
            <Campo label="Total a ser usado (lote)">
              <Moeda valor={loteResumo.totalUsd} moeda={loteResumo.moeda} />
            </Campo>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Cada adiantamento deste lote vira um borderô <strong>EM CADASTRO</strong> no fin010.
            Os que falharem seguem pendentes para nova tentativa; os já processados são
            ignorados. Revise e aprove na aba <strong>Borderôs</strong>.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!PROCESSAMENTO_HABILITADO || executandoLote || loteResumo.proximosN === 0}
            onClick={() => void executarLote(loteResumo.proximosDocCods, loteResumo.adtos)}
          >
            {executandoLote ? <Spinner aria-hidden /> : <Play aria-hidden />}
            Executar {loteResumo.proximosN} adiantamento(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
