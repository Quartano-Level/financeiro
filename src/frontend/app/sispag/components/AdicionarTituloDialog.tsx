'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { incluirTitulo, type LotePagamento, type TituloAPagar } from '@/lib/sispag'
import { formatBRL } from '@/lib/utils'

const keyOf = (t: TituloAPagar) => `${t.filCod}:${t.docCod}:${t.titCod}`

/** Modal para incrementar um lote RASCUNHO com títulos elegíveis (mesma filial/classe, sem lote). */
export function AdicionarTituloDialog({
  lote,
  titulos,
  onClose,
  onAdded,
}: {
  lote: LotePagamento | null
  titulos: TituloAPagar[]
  onClose: () => void
  onAdded: () => Promise<void> | void
}) {
  const [busca, setBusca] = React.useState('')
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [salvando, setSalvando] = React.useState(false)

  // Reseta a seleção/busca quando abre para outro lote.
  React.useEffect(() => {
    setSel(new Set())
    setBusca('')
  }, [lote?.id])

  const loteInternacional = lote ? lote.itens.some((i) => i.internacional) : false
  const loteVazio = lote ? lote.itens.length === 0 : true

  const elegiveis = React.useMemo(() => {
    if (!lote) return []
    const b = busca.trim().toLowerCase()
    return titulos
      .filter(
        (t) =>
          t.filCod === lote.filCod &&
          !t.emLote &&
          !t.pago &&
          t.liberado &&
          (loteVazio || Boolean(t.internacional) === loteInternacional) &&
          (b === '' || `${t.credor ?? ''} ${t.docCod}/${t.titCod}`.toLowerCase().includes(b)),
      )
      .slice(0, 300)
  }, [lote, titulos, busca, loteVazio, loteInternacional])

  const toggle = (t: TituloAPagar) =>
    setSel((prev) => {
      const next = new Set(prev)
      const k = keyOf(t)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const adicionar = async () => {
    if (!lote || sel.size === 0) return
    setSalvando(true)
    let ok = 0
    const falhas: string[] = []
    for (const t of elegiveis.filter((t) => sel.has(keyOf(t)))) {
      try {
        await incluirTitulo(lote.id, { filCod: t.filCod, docCod: t.docCod, titCod: t.titCod })
        ok += 1
      } catch (e) {
        falhas.push(`${t.docCod}/${t.titCod}${e instanceof Error ? `: ${e.message}` : ''}`)
      }
    }
    setSalvando(false)
    if (falhas.length === 0) {
      toast.success(`${ok} título(s) adicionado(s) ao lote.`)
    } else {
      toast.warning(`${ok} adicionado(s); ${falhas.length} não entraram`, {
        description: falhas.slice(0, 3).join(' · '),
      })
    }
    await onAdded()
    onClose()
  }

  return (
    <Dialog
      open={lote != null}
      onOpenChange={(next) => {
        if (!next && !salvando) onClose()
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Adicionar títulos ao lote</DialogTitle>
          <DialogDescription>
            {lote
              ? `Filial ${lote.filCod} · ${loteInternacional ? 'internacional' : 'nacional'} · ${lote.itens.length} título(s) no lote. `
              : ''}
            Apenas títulos elegíveis da mesma filial e classe, ainda sem lote.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por credor ou documento…"
            aria-label="Buscar títulos"
          />
          <div className="mt-3 max-h-[50vh] overflow-auto rounded-lg border">
            {elegiveis.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Nenhum título elegível para este lote (mesma filial/classe, sem lote).
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Credor</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {elegiveis.map((t) => (
                    <TableRow key={keyOf(t)}>
                      <TableCell>
                        <Checkbox
                          checked={sel.has(keyOf(t))}
                          onCheckedChange={() => toggle(t)}
                          aria-label="selecionar título"
                        />
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate">{t.credor ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.docCod}/{t.titCod}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(t.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Fechar
          </Button>
          <Button onClick={() => void adicionar()} disabled={salvando || sel.size === 0}>
            {salvando ? 'Adicionando…' : `Adicionar (${sel.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
