'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, CheckCircle2, ChevronRight, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  cancelarBordero,
  estornarBordero,
  excluirBaixaBordero,
  excluirBorderoInteiro,
  fetchBorderos,
  finalizarBordero,
} from '@/lib/api'
import type { BorderoResumo, BorderoSituacao } from '@/lib/types'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { cn, formatNumber } from '@/lib/utils'

type FiltroSituacao = 'todos' | 'abertos' | 'finalizados' | 'cancelados'

const SITUACAO_LABEL: Record<BorderoSituacao, string> = {
  EM_CADASTRO: 'Em aberto',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
  ESTORNADO: 'Estornado',
  REMOVIDO: 'Removido',
  INDISPONIVEL: 'Indisponível',
}

const situacaoBadge = (s: BorderoSituacao) => {
  const cls =
    s === 'FINALIZADO'
      ? 'border-success/40 bg-success-subtle text-success-foreground'
      : s === 'EM_CADASTRO'
        ? 'border-warning/40 bg-warning-subtle text-warning-foreground'
        : s === 'ESTORNADO' || s === 'REMOVIDO' || s === 'CANCELADO'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border bg-muted text-muted-foreground'
  return <Badge className={cn('border-transparent', cls)}>{SITUACAO_LABEL[s]}</Badge>
}

const formatWhen = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  } catch {
    return iso
  }
}

/**
 * Gestão de borderôs (Fase 3.1) — revisão/aprovação dos borderôs de permuta que o sistema
 * criou no `fin010`. Lista a trilha local enriquecida com o STATUS VIVO do ERP (em aberto /
 * finalizado / estornado / removido). As ações de escrita (finalizar / excluir / estornar)
 * são uma fatia seguinte — por ora são READ-ONLY (botões desabilitados, feito no ERP).
 */
export default function BorderosPage() {
  const [borderos, setBorderos] = React.useState<BorderoResumo[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [filtro, setFiltro] = React.useState<FiltroSituacao>('todos')
  const [borderoBusca, setBorderoBusca] = React.useState('')
  const [usuarioFiltro, setUsuarioFiltro] = React.useState('todos')
  const [filialFiltro, setFilialFiltro] = React.useState('todos')
  const [dataFiltro, setDataFiltro] = React.useState('')
  const [expandido, setExpandido] = React.useState<number | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setBorderos(await fetchBorderos())
    } catch {
      toast.error('Falha ao carregar os borderôs.')
      setBorderos([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    fetchBorderos()
      .then((b) => {
        if (active) setBorderos(b)
      })
      .catch(() => {
        if (active) setBorderos([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Opções dinâmicas (distintas) para os selects de usuário e filial.
  const usuarios = [...new Set((borderos ?? []).map((b) => b.criadoPor).filter(Boolean))].sort() as string[]
  const filiais = [...new Set((borderos ?? []).map((b) => b.filCod))].sort((a, b) => a - b)

  const borderoNorm = borderoBusca.trim()
  const lista = (borderos ?? [])
    .filter((b) =>
      filtro === 'todos'
        ? true
        : filtro === 'finalizados'
          ? b.situacao === 'FINALIZADO'
          : filtro === 'cancelados'
            ? b.situacao === 'CANCELADO'
            : b.situacao === 'EM_CADASTRO',
    )
    .filter((b) => borderoNorm === '' || String(b.borCod).includes(borderoNorm))
    .filter((b) => usuarioFiltro === 'todos' || b.criadoPor === usuarioFiltro)
    .filter((b) => filialFiltro === 'todos' || String(b.filCod) === filialFiltro)
    .filter((b) => dataFiltro === '' || (b.criadoEm ?? '').slice(0, 10) === dataFiltro)

  const filtroAtivo =
    filtro !== 'todos' ||
    borderoBusca !== '' ||
    usuarioFiltro !== 'todos' ||
    filialFiltro !== 'todos' ||
    dataFiltro !== ''
  const limparFiltros = () => {
    setFiltro('todos')
    setBorderoBusca('')
    setUsuarioFiltro('todos')
    setFilialFiltro('todos')
    setDataFiltro('')
  }

  const totais = {
    todos: borderos?.length ?? 0,
    abertos: (borderos ?? []).filter((b) => b.situacao === 'EM_CADASTRO').length,
    finalizados: (borderos ?? []).filter((b) => b.situacao === 'FINALIZADO').length,
    cancelados: (borderos ?? []).filter((b) => b.situacao === 'CANCELADO').length,
  }

  // Ação com confirmação via modal (excluir baixa / excluir borderô / aprovar / cancelar / estornar).
  const [executando, setExecutando] = React.useState(false)
  const [confirmaAcao, setConfirmaAcao] = React.useState<
    | { tipo: 'baixa'; borCod: number; invoiceDocCod: string }
    | { tipo: 'bordero'; borCod: number; filCod: number }
    | { tipo: 'finalizar'; borCod: number; filCod: number }
    | { tipo: 'cancelar'; borCod: number; filCod: number }
    | { tipo: 'estornar'; borCod: number; filCod: number }
    | null
  >(null)

  const confirmarAcao = async () => {
    if (!confirmaAcao) return
    setExecutando(true)
    try {
      if (confirmaAcao.tipo === 'baixa') {
        await excluirBaixaBordero(confirmaAcao.borCod, confirmaAcao.invoiceDocCod)
        toast.success(`Baixa da invoice ${confirmaAcao.invoiceDocCod} excluída.`)
      } else if (confirmaAcao.tipo === 'bordero') {
        await excluirBorderoInteiro(confirmaAcao.borCod, confirmaAcao.filCod)
        toast.success(`Borderô ${confirmaAcao.borCod} excluído (com todas as baixas).`)
      } else if (confirmaAcao.tipo === 'finalizar') {
        await finalizarBordero(confirmaAcao.borCod, confirmaAcao.filCod)
        toast.success(`Borderô ${confirmaAcao.borCod} finalizado/aprovado.`)
      } else if (confirmaAcao.tipo === 'estornar') {
        await estornarBordero(confirmaAcao.borCod, confirmaAcao.filCod)
        toast.success(`Borderô ${confirmaAcao.borCod} estornado — voltou para em cadastro.`)
      } else {
        await cancelarBordero(confirmaAcao.borCod, confirmaAcao.filCod)
        toast.success(`Borderô ${confirmaAcao.borCod} cancelado.`)
      }
      setConfirmaAcao(null)
      await load()
    } catch (err) {
      toast.error(`Falha${err instanceof Error ? ` — ${err.message}` : ''}.`)
    } finally {
      setExecutando(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Borderôs"
        subtitle="Revisão dos borderôs de permuta criados no fin010 — status ao vivo do Conexos (em aberto / finalizado / estornado)."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw aria-hidden /> Atualizar
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/permutas">
                <ArrowLeft aria-hidden /> Voltar ao painel
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Borderô
          <Input
            value={borderoBusca}
            onChange={(e) => setBorderoBusca(e.target.value)}
            placeholder="Nº do borderô"
            inputMode="numeric"
            aria-label="Filtrar por borderô"
            className="w-40"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Usuário
          <Select value={usuarioFiltro} onValueChange={setUsuarioFiltro}>
            <SelectTrigger className="w-52" aria-label="Filtrar por usuário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {usuarios.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Filial
          <Select value={filialFiltro} onValueChange={setFilialFiltro}>
            <SelectTrigger className="w-32" aria-label="Filtrar por filial">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={f} value={String(f)}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Situação
          <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroSituacao)}>
            <SelectTrigger className="w-48" aria-label="Filtrar por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas ({totais.todos})</SelectItem>
              <SelectItem value="abertos">Em aberto ({totais.abertos})</SelectItem>
              <SelectItem value="finalizados">Finalizados ({totais.finalizados})</SelectItem>
              <SelectItem value="cancelados">Cancelados ({totais.cancelados})</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Data
          <Input
            type="date"
            value={dataFiltro}
            onChange={(e) => setDataFiltro(e.target.value)}
            aria-label="Filtrar por data"
            className="w-44"
          />
        </label>

        {filtroAtivo && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>
            Limpar
          </Button>
        )}
        <span className="pb-2 text-sm text-muted-foreground">
          {lista.length} de {totais.todos}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <EmptyState
          title="Nenhum borderô"
          description="Ainda não há borderôs de permuta criados por aqui (ou nenhum bate o filtro)."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Borderô</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Baixas</TableHead>
              <TableHead className="text-right">Total baixado</TableHead>
              <TableHead>Criado por</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.map((b) => {
              const aberto = expandido === b.borCod
              return (
                <React.Fragment key={b.borCod}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpandido(aberto ? null : b.borCod)}
                  >
                    <TableCell>
                      <ChevronRight
                        aria-hidden
                        className={cn('size-4 transition-transform', aberto && 'rotate-90')}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{b.borCod}</TableCell>
                    <TableCell>{b.filCod}</TableCell>
                    <TableCell>{situacaoBadge(b.situacao)}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.baixas.length}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(b.totalBaixado)} BRL
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.criadoPor ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatWhen(b.criadoEm)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        // Ações só nos borderôs criados por ESTE sistema (têm trilha). Os demais
                        // (criados direto no ERP por outros usuários) ficam só p/ visualização.
                        const noso = b.daTrilha === true
                        const foraTip = 'Criado fora deste sistema — apenas visualização'
                        return (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!noso || b.situacao !== 'EM_CADASTRO'}
                              title={
                                !noso
                                  ? foraTip
                                  : b.situacao !== 'EM_CADASTRO'
                                    ? 'Só dá para aprovar borderô em aberto'
                                    : 'Finalizar/aprovar o borderô no fin010'
                              }
                              onClick={() =>
                                setConfirmaAcao({ tipo: 'finalizar', borCod: b.borCod, filCod: b.filCod })
                              }
                            >
                              <CheckCircle2 aria-hidden /> Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!noso || b.situacao !== 'EM_CADASTRO'}
                              title={
                                !noso
                                  ? foraTip
                                  : b.situacao !== 'EM_CADASTRO'
                                    ? 'Só dá para cancelar borderô em aberto'
                                    : 'Cancelar o borderô no fin010'
                              }
                              onClick={() =>
                                setConfirmaAcao({ tipo: 'cancelar', borCod: b.borCod, filCod: b.filCod })
                              }
                            >
                              <Undo2 aria-hidden /> Cancelar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!noso || b.situacao !== 'FINALIZADO'}
                              title={
                                !noso
                                  ? foraTip
                                  : b.situacao !== 'FINALIZADO'
                                    ? 'Estorno só de borderô finalizado'
                                    : 'Estornar o borderô (volta para em cadastro) no fin010'
                              }
                              onClick={() =>
                                setConfirmaAcao({ tipo: 'estornar', borCod: b.borCod, filCod: b.filCod })
                              }
                            >
                              <Undo2 aria-hidden /> Estornar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!noso || b.situacao !== 'EM_CADASTRO'}
                              title={
                                !noso
                                  ? foraTip
                                  : b.situacao !== 'EM_CADASTRO'
                                    ? 'Só dá para excluir borderô em aberto'
                                    : 'Excluir o borderô inteiro (todas as baixas) no fin010'
                              }
                              onClick={() =>
                                setConfirmaAcao({ tipo: 'bordero', borCod: b.borCod, filCod: b.filCod })
                              }
                            >
                              <Trash2 aria-hidden /> Excluir
                            </Button>
                          </div>
                        )
                      })()}
                    </TableCell>
                  </TableRow>
                  {aberto ? (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={8}>
                        <div className="py-2">
                          <p className="mb-2 text-sm font-medium text-muted-foreground">
                            Baixas do borderô
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Invoice</TableHead>
                                <TableHead>Adiantamento</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Valor baixado</TableHead>
                                <TableHead className="text-right">Juros</TableHead>
                                <TableHead className="text-right">Conta</TableHead>
                                <TableHead className="text-right">bxaCodSeq</TableHead>
                                <TableHead className="text-right">Ação</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {b.baixas.map((x) => (
                                <TableRow key={`${b.borCod}-${x.invoiceDocCod}-${x.adiantamentoDocCod}`}>
                                  <TableCell className="font-medium">{x.invoiceDocCod}</TableCell>
                                  <TableCell>{x.adiantamentoDocCod}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        x.status === 'settled'
                                          ? 'default'
                                          : x.status === 'error'
                                            ? 'destructive'
                                            : 'secondary'
                                      }
                                    >
                                      {x.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {typeof x.valorBaixado === 'number'
                                      ? `${formatNumber(x.valorBaixado)} BRL`
                                      : '—'}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {typeof x.juros === 'number' ? formatNumber(x.juros) : '—'}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {x.contaJuros ?? '—'}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {x.bxaCodSeq ?? '—'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={b.situacao !== 'EM_CADASTRO'}
                                      title={
                                        b.situacao !== 'EM_CADASTRO'
                                          ? 'Só dá para excluir baixa de borderô em aberto'
                                          : 'Excluir esta baixa do borderô (fin010)'
                                      }
                                      onClick={() =>
                                        setConfirmaAcao({
                                          tipo: 'baixa',
                                          borCod: b.borCod,
                                          invoiceDocCod: x.invoiceDocCod,
                                        })
                                      }
                                    >
                                      <Trash2 aria-hidden /> Excluir
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Ban aria-hidden className="size-3.5" />
        Aprovar (finalizar), Cancelar, Excluir baixa, Excluir borderô (em aberto) e Estornar (finalizado
        → volta p/ em cadastro) são automatizados aqui. Status puxado ao vivo do ERP.
      </p>

      {/* Confirmação de ação (modal do design system) */}
      <Dialog
        open={confirmaAcao != null}
        onOpenChange={(open) => {
          if (!open && !executando) setConfirmaAcao(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmaAcao?.tipo === 'finalizar'
                ? 'Finalizar / aprovar borderô'
                : confirmaAcao?.tipo === 'cancelar'
                  ? 'Cancelar borderô'
                  : confirmaAcao?.tipo === 'estornar'
                    ? 'Estornar borderô'
                    : confirmaAcao?.tipo === 'bordero'
                      ? 'Excluir borderô inteiro'
                      : 'Excluir baixa'}
            </DialogTitle>
            <DialogDescription>
              {confirmaAcao?.tipo === 'finalizar'
                ? `Finalizar/aprovar o borderô ${confirmaAcao.borCod} no fin010? Isso confirma a baixa da permuta — depois de finalizado, só por estorno.`
                : confirmaAcao?.tipo === 'cancelar'
                  ? `Cancelar o borderô ${confirmaAcao.borCod} no fin010? Ele deixa de ficar em cadastro (não é excluído).`
                  : confirmaAcao?.tipo === 'estornar'
                    ? `Estornar o borderô ${confirmaAcao.borCod} no fin010? A finalização é desfeita e o borderô VOLTA para em cadastro (pode ser aprovado de novo).`
                    : confirmaAcao?.tipo === 'bordero'
                      ? `Excluir o borderô ${confirmaAcao.borCod} INTEIRO — todas as baixas e o próprio borderô serão removidos no fin010. Não pode ser desfeito por aqui.`
                      : confirmaAcao?.tipo === 'baixa'
                        ? `Excluir a baixa da invoice ${confirmaAcao.invoiceDocCod} do borderô ${confirmaAcao.borCod}? Se for a última baixa, o borderô também é apagado. Removido no fin010 e na trilha.`
                        : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmaAcao(null)} disabled={executando}>
              Voltar
            </Button>
            {confirmaAcao?.tipo === 'finalizar' ? (
              <Button onClick={confirmarAcao} disabled={executando}>
                {executando ? <Spinner /> : <CheckCircle2 aria-hidden />} Aprovar
              </Button>
            ) : confirmaAcao?.tipo === 'estornar' ? (
              <Button onClick={confirmarAcao} disabled={executando}>
                {executando ? <Spinner /> : <Undo2 aria-hidden />} Estornar
              </Button>
            ) : (
              <Button variant="destructive" onClick={confirmarAcao} disabled={executando}>
                {executando ? <Spinner /> : <Trash2 aria-hidden />}{' '}
                {confirmaAcao?.tipo === 'cancelar'
                  ? 'Cancelar borderô'
                  : confirmaAcao?.tipo === 'bordero'
                    ? 'Excluir borderô'
                    : 'Excluir baixa'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
