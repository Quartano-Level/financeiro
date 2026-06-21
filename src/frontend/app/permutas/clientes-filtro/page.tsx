'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  addClienteFiltro,
  fetchClientesFiltro,
  fetchImportadores,
  removeClienteFiltro,
} from '@/lib/api'
import type { ClienteFiltro, Importador } from '@/lib/types'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * Cadastro de "clientes filtro" (Fase 1): importadores cujos adiantamentos vão
 * para permuta MANUAL cross-process (não há invoice no próprio processo). O
 * analista escolhe um importador do backlog e adiciona; a pipeline passa a
 * rotear os adtos dele ao estado `permuta-manual`.
 */
export default function ClientesFiltroPage() {
  const [clientes, setClientes] = React.useState<ClienteFiltro[]>([])
  const [importadores, setImportadores] = React.useState<Importador[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selecionado, setSelecionado] = React.useState<string>('')
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [c, i] = await Promise.all([fetchClientesFiltro(), fetchImportadores()])
      setClientes(c)
      setImportadores(i)
    } catch {
      toast.error('Falha ao carregar os clientes filtro.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    Promise.all([fetchClientesFiltro(), fetchImportadores()])
      .then(([c, i]) => {
        if (!active) return
        setClientes(c)
        setImportadores(i)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Importadores ainda NÃO cadastrados (não repetir no seletor).
  const jaCadastrados = new Set(clientes.map((c) => c.pesCod))
  const disponiveis = importadores.filter((i) => !jaCadastrados.has(i.pesCod))

  const adicionar = React.useCallback(async () => {
    if (!selecionado) return
    const imp = importadores.find((i) => i.pesCod === selecionado)
    setAdding(true)
    try {
      await addClienteFiltro(selecionado, imp?.importador)
      toast.success(`Cliente filtro adicionado: ${imp?.importador ?? selecionado}`)
      setSelecionado('')
      await load()
    } catch (err) {
      toast.error(`Falha ao adicionar${err instanceof Error ? ` — ${err.message}` : ''}.`)
    } finally {
      setAdding(false)
    }
  }, [selecionado, importadores, load])

  const remover = React.useCallback(
    async (pesCod: string, nome?: string) => {
      setRemoving(pesCod)
      try {
        await removeClienteFiltro(pesCod)
        toast.success(`Cliente filtro removido: ${nome ?? pesCod}`)
        await load()
      } catch (err) {
        toast.error(`Falha ao remover${err instanceof Error ? ` — ${err.message}` : ''}.`)
      } finally {
        setRemoving(null)
      }
    },
    [load],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes filtro"
        subtitle="Importadores cujos adiantamentos vão para permuta manual cross-process (sem invoice no próprio processo)."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/permutas">
              <ArrowLeft aria-hidden /> Voltar ao painel
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Adicionar importador</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Importador</span>
              <Select value={selecionado} onValueChange={setSelecionado}>
                <SelectTrigger className="w-96" aria-label="Selecionar importador">
                  <SelectValue placeholder="Selecione um importador do backlog…" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((i) => (
                    <SelectItem key={i.pesCod} value={i.pesCod}>
                      {i.importador ?? `(sem nome) — ${i.pesCod}`} · {i.qtdAdtos} adto(s)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void adicionar()} disabled={!selecionado || adding}>
              {adding ? <Spinner /> : <Plus aria-hidden />} Adicionar
            </Button>
          </div>
          {!loading && disponiveis.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Todos os importadores do backlog já estão cadastrados (ou o backlog está vazio).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : clientes.length === 0 ? (
            <EmptyState
              title="Nenhum cliente filtro"
              description="Adicione um importador acima para rotear os adiantamentos dele para permuta manual."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Importador</TableHead>
                  <TableHead>Código (pesCod)</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.pesCod}>
                    <TableCell className="font-medium">{c.importador ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.pesCod}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removing === c.pesCod}
                        onClick={() => void remover(c.pesCod, c.importador)}
                        aria-label={`Remover ${c.importador ?? c.pesCod}`}
                      >
                        {removing === c.pesCod ? <Spinner /> : <Trash2 aria-hidden />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
