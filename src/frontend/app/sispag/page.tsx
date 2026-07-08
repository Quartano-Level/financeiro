'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  Layers,
  Lock,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { KPIGrid, SimpleKPI } from '@/components/ui/kpi-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { formatBRL } from '@/lib/utils'
import {
  cancelarLote,
  criarLote,
  fetchLotes,
  fetchSispagPainel,
  fetchIngestaoRuns,
  finalizarLote,
  formarLotes,
  incluirTitulo,
  IngestaoPagamentosEmAndamentoError,
  type PagamentoIngestaoRun,
  reabrirLote,
  removerItem,
  runIngestaoPagamentos,
  type LotePagamento,
  type SispagPainel,
  type TituloAPagar,
} from '@/lib/sispag'
import { FiltroBarra, Paginacao, useTabelaFiltro } from '@/app/permutas/components/tabela-filtro'
import { AdicionarTituloDialog } from './components/AdicionarTituloDialog'
import { IngestaoDialog } from './components/IngestaoDialog'
import { LoteCard } from './components/LoteCard'

const keyOf = (t: TituloAPagar) => `${t.filCod}:${t.docCod}:${t.titCod}`

type Origem = 'todos' | 'nacional' | 'internacional'
/** Filtra lotes por classe (um lote é internacional se tiver ≥1 item internacional — I7). */
const filtrarClasseLote = (arr: LotePagamento[], origem: Origem): LotePagamento[] =>
  origem === 'nacional'
    ? arr.filter((l) => !l.itens.some((i) => i.internacional))
    : origem === 'internacional'
      ? arr.filter((l) => l.itens.some((i) => i.internacional))
      : arr

const fmtData = (ms?: number) =>
  ms === undefined ? '—' : new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

function VencimentoBadge({ dias }: { dias?: number }) {
  if (dias === undefined) return <span className="text-muted-foreground">—</span>
  if (dias < 0)
    return (
      <Badge variant="outline" className="border-danger/40 text-danger">
        vencido {Math.abs(dias)}d
      </Badge>
    )
  if (dias <= 7)
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        vence em {dias}d
      </Badge>
    )
  return <Badge variant="outline">em {dias}d</Badge>
}


export default function SispagPage() {
  const [painel, setPainel] = React.useState<SispagPainel | null>(null)
  const [lotes, setLotes] = React.useState<LotePagamento[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [filtro, setFiltro] = React.useState<'a-vencer' | 'vencidos' | 'todos'>('todos')
  const [origem, setOrigem] = React.useState<'todos' | 'nacional' | 'internacional'>('todos')
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [ingerindo, setIngerindo] = React.useState(false)
  const [formando, setFormando] = React.useState(false)
  const [ingestaoOpen, setIngestaoOpen] = React.useState(false)
  const [runs, setRuns] = React.useState<PagamentoIngestaoRun[] | null>(null)
  const [runsLoading, setRunsLoading] = React.useState(false)

  const carregar = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, ls] = await Promise.all([fetchSispagPainel(), fetchLotes().catch(() => [])])
      setPainel(p)
      setLotes(ls)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o painel.')
    } finally {
      setLoading(false)
    }
  }, [])

  const recarregarLotes = React.useCallback(async () => {
    try {
      setLotes(await fetchLotes())
    } catch {
      /* mantém a lista anterior */
    }
  }, [])

  const carregarRuns = React.useCallback(async () => {
    setRunsLoading(true)
    try {
      setRuns(await fetchIngestaoRuns())
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

  // Rodada manual disparada de DENTRO do modal — mantém o modal aberto e atualiza a trilha.
  const ingerir = async () => {
    setIngerindo(true)
    try {
      const r = await runIngestaoPagamentos()
      toast.success('Ingestão concluída', {
        description: `${r.totalTitulos} título(s) na carteira · ${r.totalInativados} inativado(s).`,
      })
      await Promise.all([carregar(), carregarRuns()])
    } catch (e) {
      if (e instanceof IngestaoPagamentosEmAndamentoError) {
        toast.warning('Ingestão em andamento', { description: e.message })
        void carregarRuns()
      } else {
        toast.error('Falha na ingestão', {
          description: e instanceof Error ? e.message : undefined,
        })
      }
    } finally {
      setIngerindo(false)
    }
  }

  const formar = async () => {
    setFormando(true)
    try {
      const r = await formarLotes()
      await Promise.all([carregar(), recarregarLotes()])
      toast.success('Formação concluída', {
        description: `${r.lotesFormados} lote(s) · ${r.titulosLotados} título(s)${
          r.lotesDesfeitos ? ` · ${r.lotesDesfeitos} desfeito(s)` : ''
        }.`,
      })
    } catch (e) {
      toast.error('Falha ao formar lotes', {
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setFormando(false)
    }
  }

  React.useEffect(() => {
    void carregar()
  }, [carregar])

  const titulos = painel?.titulos ?? []
  const titulosFiltrados = React.useMemo(() => {
    let base = titulos
    if (origem === 'nacional') base = base.filter((t) => !t.internacional)
    else if (origem === 'internacional') base = base.filter((t) => t.internacional)
    if (filtro === 'a-vencer') return base.filter((t) => (t.diasAteVencimento ?? -1) >= 0)
    if (filtro === 'vencidos') return base.filter((t) => (t.diasAteVencimento ?? 0) < 0)
    return base
  }, [titulos, filtro, origem])

  // Filial + busca + paginação — mesmo kit do painel de Permutas (consistência de UX).
  const abaTitulos = useTabelaFiltro(
    titulosFiltrados,
    (t) => t.filCod,
    (t) => `${t.credor ?? ''} ${t.docCod}/${t.titCod} ${t.banco ?? ''}`,
  )
  const abaBorderos = useTabelaFiltro(
    painel?.borderos ?? [],
    (b) => b.filCod,
    (b) => `${b.descricao ?? ''} ${b.borCod}`,
  )

  // Lotes: candidatos (RASCUNHO) vs. finalizados (FINALIZADO/RETORNADO), com filtros + paginação.
  const lotesRascunho = lotes.filter((l) => l.status === 'RASCUNHO')
  const lotesFinalizados = lotes.filter(
    (l) => l.status === 'FINALIZADO' || l.status === 'RETORNADO',
  )
  const [loteOrigemCand, setLoteOrigemCand] = React.useState<Origem>('todos')
  const [loteOrigemFin, setLoteOrigemFin] = React.useState<Origem>('todos')
  const [statusFin, setStatusFin] = React.useState<'todos' | 'aguardando' | 'retornado'>('todos')
  const [adicionarLote, setAdicionarLote] = React.useState<LotePagamento | null>(null)
  const buscaLote = (l: LotePagamento) =>
    `${l.filCod} ${l.criadoPor} ${l.itens.map((i) => i.credor ?? '').join(' ')}`
  const abaCandidatos = useTabelaFiltro(
    filtrarClasseLote(lotesRascunho, loteOrigemCand),
    (l) => l.filCod,
    buscaLote,
    8,
  )
  const finFiltrados = filtrarClasseLote(lotesFinalizados, loteOrigemFin).filter((l) =>
    statusFin === 'aguardando'
      ? l.status === 'FINALIZADO'
      : statusFin === 'retornado'
        ? l.status === 'RETORNADO'
        : true,
  )
  const abaFinalizados = useTabelaFiltro(finFiltrados, (l) => l.filCod, buscaLote, 8)

  const selTitulos = titulos.filter((t) => selecionados.has(keyOf(t)))
  const totalSelecionado = selTitulos.reduce((acc, t) => acc + t.valor, 0)

  const toggle = (t: TituloAPagar) => {
    if (t.emLote) return
    setSelecionados((prev) => {
      const next = new Set(prev)
      const k = keyOf(t)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const criarLoteComSelecionados = async () => {
    if (selTitulos.length === 0) return
    const filiais = new Set(selTitulos.map((t) => t.filCod))
    if (filiais.size > 1) {
      toast.error('Selecione títulos de uma única filial', {
        description: 'Um lote é de uma filial só. Filtre por filial e monte um lote por vez.',
      })
      return
    }
    // I7 — um lote é 100% nacional OU 100% internacional (rails de pagamento distintos).
    if (selTitulos.some((t) => t.internacional) && selTitulos.some((t) => !t.internacional)) {
      toast.error('Não misture nacional com internacional', {
        description:
          'Um lote é 100% nacional ou 100% internacional. Use o filtro acima e monte um lote de cada.',
      })
      return
    }
    setBusy(true)
    try {
      const filCod = selTitulos[0].filCod
      const lote = await criarLote({ filCod })
      let ok = 0
      const falhas: string[] = []
      for (const t of selTitulos) {
        try {
          await incluirTitulo(lote.id, { filCod: t.filCod, docCod: t.docCod, titCod: t.titCod })
          ok += 1
        } catch (e) {
          falhas.push(`${t.docCod}/${t.titCod}: ${e instanceof Error ? e.message : 'erro'}`)
        }
      }
      setSelecionados(new Set())
      await recarregarLotes()
      if (falhas.length === 0) {
        toast.success(`Lote criado com ${ok} título(s)`, {
          description: 'Montagem local — nada foi enviado ao banco/ERP.',
        })
      } else {
        toast.warning(`Lote criado com ${ok} título(s); ${falhas.length} não entraram`, {
          description: falhas.slice(0, 3).join(' · '),
        })
      }
    } catch (e) {
      toast.error('Não foi possível criar o lote', {
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const acaoLote = async (
    fn: () => Promise<unknown>,
    okMsg: string,
  ) => {
    setBusy(true)
    try {
      await fn()
      await recarregarLotes()
      toast.success(okMsg)
    } catch (e) {
      toast.error('Ação não concluída', {
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="SISPAG — Pagamentos"
        subtitle="Escopo II · Frente II. Painel diário + montagem do lote (local). Não envia ao banco."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={abrirIngestao}
              title="Ver as últimas ingestões (cron/manual) e rodar sob demanda"
            >
              <DatabaseZap aria-hidden /> Ingestão de dados
            </Button>
            <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={loading}>
              <RefreshCcw className="size-4" /> Recarregar
            </Button>
          </div>
        }
      />

      <IngestaoDialog
        open={ingestaoOpen}
        setOpen={setIngestaoOpen}
        ingestRunning={ingerindo}
        runs={runs}
        runsLoading={runsLoading}
        rodarIngestao={ingerir}
      />

      <AdicionarTituloDialog
        lote={adicionarLote}
        titulos={titulos}
        onClose={() => setAdicionarLote(null)}
        onAdded={async () => {
          await Promise.all([carregar(), recarregarLotes()])
        }}
      />

      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <span className="font-medium">Montagem local — sem escrita no ERP.</span> A carteira de
          títulos vem do <strong>nosso banco</strong> (última ingestão); lotes nativos e borderôs são
          lidos <strong>ao vivo do Conexos</strong> (contexto). Criar lote, incluir/remover e finalizar
          são <strong>estado local</strong>; a remessa/pagamento ao banco é a próxima fase.
          {painel?.ingestao.ultimaRunEm ? (
            <span className="text-muted-foreground">
              {' '}
              · carteira de {new Date(painel.ingestao.ultimaRunEm).toLocaleString('pt-BR')}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Spinner /> Carregando painel…
        </div>
      ) : error ? (
        <EmptyState
          icon={<AlertTriangle className="size-6" />}
          title="Não foi possível carregar"
          description={error}
        />
      ) : painel ? (
        <>
          <KPIGrid columns={4}>
            <SimpleKPI
              label="A vencer (7 dias)"
              value={painel.kpis.titulosAVencer7d.toLocaleString('pt-BR')}
              color="warning"
              footer="títulos aprovados"
            />
            <SimpleKPI
              label="A vencer (30 dias)"
              value={formatBRL(painel.kpis.valorAVencer30d)}
              color="primary"
              footer={`${painel.kpis.titulosAVencer30d.toLocaleString('pt-BR')} títulos`}
            />
            <SimpleKPI
              label="Vencidos (não pagos)"
              value={painel.kpis.titulosVencidos.toLocaleString('pt-BR')}
              color="danger"
              footer="na janela"
            />
            <SimpleKPI
              label="Lotes candidatos"
              value={lotes.filter((l) => l.status !== 'CANCELADO').length.toLocaleString('pt-BR')}
              color="info"
              footer={`${lotes.filter((l) => l.status === 'FINALIZADO').length} finalizados`}
            />
          </KPIGrid>

          <Tabs defaultValue="titulos">
            <TabsList>
              <TabsTrigger value="titulos">Títulos a pagar</TabsTrigger>
              <TabsTrigger value="lotes-candidatos">
                Lotes candidatos ({lotesRascunho.length})
              </TabsTrigger>
              <TabsTrigger value="lotes-finalizados">
                Finalizados ({lotesFinalizados.length})
              </TabsTrigger>
              <TabsTrigger value="lotes">Lotes SISPAG (nativo)</TabsTrigger>
              <TabsTrigger value="borderos">Borderôs</TabsTrigger>
            </TabsList>

            {/* ---- Títulos a pagar ---- */}
            <TabsContent value="titulos" className="space-y-3">
              <FiltroBarra aba={abaTitulos} buscaPlaceholder="Buscar por credor, documento ou banco…" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex gap-1">
                    {(['todos', 'nacional', 'internacional'] as const).map((o) => (
                      <Button
                        key={o}
                        size="sm"
                        variant={origem === o ? 'default' : 'outline'}
                        onClick={() => setOrigem(o)}
                      >
                        {o === 'todos' ? 'Todas' : o === 'nacional' ? 'Nacionais' : 'Internacionais'}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {(['todos', 'a-vencer', 'vencidos'] as const).map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={filtro === f ? 'default' : 'outline'}
                        onClick={() => setFiltro(f)}
                      >
                        {f === 'todos' ? 'Todos' : f === 'a-vencer' ? 'A vencer' : 'Vencidos'}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selecionados.size > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {selecionados.size} sel. · {formatBRL(totalSelecionado)}
                    </span>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={formar} disabled={formando}>
                    <Layers className="size-4" />{' '}
                    {formando ? 'Formando…' : 'Formar lotes automáticos'}
                  </Button>
                  <Button size="sm" disabled={selecionados.size === 0 || busy} onClick={criarLoteComSelecionados}>
                    <Layers className="size-4" /> Criar lote ({selecionados.size})
                  </Button>
                </div>
              </div>

              {abaTitulos.total === 0 ? (
                <EmptyState
                  icon={titulos.length === 0 ? <DatabaseZap className="size-6" /> : undefined}
                  title={titulos.length === 0 ? 'Carteira vazia' : 'Nenhum título encontrado'}
                  description={
                    titulos.length === 0
                      ? 'Clique em "Ingestão de dados" para carregar os títulos a pagar do Conexos.'
                      : 'Ajuste a faixa, a filial ou a busca acima.'
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Credor</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Filial</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {abaTitulos.slice.map((t) => (
                        <TableRow key={keyOf(t)}>
                          <TableCell>
                            <Checkbox
                              checked={selecionados.has(keyOf(t))}
                              onCheckedChange={() => toggle(t)}
                              disabled={t.emLote}
                              aria-label="selecionar título"
                              title={t.emLote ? 'Já está num lote — não pode ser atachado a outro.' : undefined}
                            />
                          </TableCell>
                          <TableCell className="max-w-[18rem] truncate font-medium">
                            <span className={t.emLote ? 'text-muted-foreground' : undefined}>
                              {t.credor ?? '—'}
                            </span>
                            {t.emLote ? (
                              <Badge
                                variant="outline"
                                className="ml-2 border-muted text-muted-foreground"
                                title="Já está num lote RASCUNHO."
                              >
                                em lote
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {t.docCod}/{t.titCod}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(t.valor)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-muted-foreground">
                                {fmtData(t.vencimento)}
                              </span>
                              <VencimentoBadge dias={t.diasAteVencimento} />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              {t.liberado ? (
                                <Badge variant="outline" className="border-success/40 text-success">
                                  aprovado
                                </Badge>
                              ) : (
                                <Badge variant="outline">bloqueado</Badge>
                              )}
                              {t.internacional ? (
                                <Badge
                                  variant="outline"
                                  className="border-info/40 text-info"
                                  title="Pagamento ao exterior (câmbio) — não entra em lote nacional."
                                >
                                  internacional
                                </Badge>
                              ) : null}
                              {t.prontoParaRemessa === false ? (
                                <Badge
                                  variant="outline"
                                  className="border-warning/40 text-warning"
                                  title="Pode faltar cadastro de pagamento (banco/conta/modalidade). Validação real no envio."
                                >
                                  falta cadastro?
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{t.filCod}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Paginacao aba={abaTitulos} />
              <p className="text-xs text-muted-foreground">
                {painel.ingestao.ultimaRunEm
                  ? `Carteira ingerida em ${new Date(painel.ingestao.ultimaRunEm).toLocaleString('pt-BR')}.`
                  : 'Sem ingestão ainda — clique em "Ingestão de dados".'}{' '}
                Selecione títulos de uma filial e clique em <strong>Criar lote</strong>.
              </p>
            </TabsContent>

            {/* ---- Lotes candidatos (RASCUNHO — falta finalizar) ---- */}
            <TabsContent value="lotes-candidatos" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Lotes a finalizar (rascunho) — manual ou automático. Revise antes de aprovar.
              </p>
              <FiltroBarra
                aba={abaCandidatos}
                buscaPlaceholder="Buscar por filial, quem criou ou credor…"
              />
              <div className="flex gap-1">
                {(['todos', 'nacional', 'internacional'] as const).map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant={loteOrigemCand === o ? 'default' : 'outline'}
                    onClick={() => setLoteOrigemCand(o)}
                  >
                    {o === 'todos' ? 'Todas' : o === 'nacional' ? 'Nacionais' : 'Internacionais'}
                  </Button>
                ))}
              </div>
              {abaCandidatos.total === 0 ? (
                <EmptyState
                  icon={<Layers className="size-6" />}
                  title="Nenhum lote candidato"
                  description='Clique em "Formar lotes automáticos" ou selecione títulos e crie um lote manual.'
                />
              ) : (
                <div className="space-y-3">
                  {abaCandidatos.slice.map((l) => (
                    <LoteCard
                      key={l.id}
                      lote={l}
                      busy={busy}
                      acao={acaoLote}
                      onAdicionar={setAdicionarLote}
                    />
                  ))}
                </div>
              )}
              <Paginacao aba={abaCandidatos} />
            </TabsContent>

            {/* ---- Lotes finalizados (aguardando retorno / de volta do Nexxera) ---- */}
            <TabsContent value="lotes-finalizados" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Lotes finalizados — aguardando o retorno do Nexxera, ou já de volta.
              </p>
              <FiltroBarra
                aba={abaFinalizados}
                buscaPlaceholder="Buscar por filial, quem finalizou ou credor…"
              />
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                <div className="flex gap-1">
                  {(['todos', 'nacional', 'internacional'] as const).map((o) => (
                    <Button
                      key={o}
                      size="sm"
                      variant={loteOrigemFin === o ? 'default' : 'outline'}
                      onClick={() => setLoteOrigemFin(o)}
                    >
                      {o === 'todos' ? 'Todas' : o === 'nacional' ? 'Nacionais' : 'Internacionais'}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {(['todos', 'aguardando', 'retornado'] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={statusFin === s ? 'default' : 'outline'}
                      onClick={() => setStatusFin(s)}
                    >
                      {s === 'todos'
                        ? 'Todos'
                        : s === 'aguardando'
                          ? 'Aguardando retorno'
                          : 'De volta do Nexxera'}
                    </Button>
                  ))}
                </div>
              </div>
              {abaFinalizados.total === 0 ? (
                <EmptyState
                  icon={<Layers className="size-6" />}
                  title="Nenhum lote finalizado"
                  description="Finalize um lote candidato para ele aparecer aqui, aguardando o retorno do Nexxera."
                />
              ) : (
                <div className="space-y-3">
                  {abaFinalizados.slice.map((l) => (
                    <LoteCard key={l.id} lote={l} busy={busy} acao={acaoLote} />
                  ))}
                </div>
              )}
              <Paginacao aba={abaFinalizados} />
            </TabsContent>


            {/* ---- Lotes SISPAG nativos ---- */}
            <TabsContent value="lotes" className="space-y-3">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Banco / conta</TableHead>
                      <TableHead>Layout</TableHead>
                      <TableHead className="text-right">Títulos</TableHead>
                      <TableHead className="text-right">Soma</TableHead>
                      <TableHead>Envio</TableHead>
                      <TableHead>Retorno</TableHead>
                      <TableHead>Finalizado por</TableHead>
                      <TableHead>Filial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {painel.lotes.map((l) => (
                      <TableRow key={`${l.filCod}:${l.flpCod}`}>
                        <TableCell className="font-medium">
                          {l.banco ?? '—'}
                          {l.conta ? <span className="text-muted-foreground"> · {l.conta}</span> : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {l.layoutConta ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{l.titulosCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(l.soma)}</TableCell>
                        <TableCell>
                          {l.envioConfirmado ? (
                            <Badge variant="outline" className="border-success/40 text-success">
                              enviado
                            </Badge>
                          ) : (
                            <Badge variant="outline">aberto</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {l.retornoProcessado ? (
                            <Badge variant="outline" className="border-info/40 text-info">
                              conciliado
                            </Badge>
                          ) : l.itensRetorno > 0 ? (
                            <Badge variant="outline" className="border-warning/40 text-warning">
                              {l.itensRetorno} itens
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{l.finalizadoPor ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{l.filCod}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                {painel.lotes.length} lotes nativos (fin015). O fluxo de remessa SISPAG é pouco usado — a
                maioria das baixas é direta (ver aba Borderôs).
              </p>
            </TabsContent>

            {/* ---- Borderôs ---- */}
            <TabsContent value="borderos" className="space-y-3">
              <FiltroBarra aba={abaBorderos} buscaPlaceholder="Buscar por banco ou nº do borderô…" />
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Borderô</TableHead>
                      <TableHead>Descrição (banco)</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Via remessa?</TableHead>
                      <TableHead>Filial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abaBorderos.slice.map((b) => (
                      <TableRow key={`${b.filCod}:${b.borCod}`}>
                        <TableCell className="tabular-nums">{b.borCod}</TableCell>
                        <TableCell className="max-w-[22rem] truncate">{b.descricao ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(b.valor)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtData(b.data)}</TableCell>
                        <TableCell>
                          {b.temRemessa ? (
                            <Badge variant="outline" className="border-info/40 text-info">
                              sim
                            </Badge>
                          ) : (
                            <Badge variant="outline">baixa direta</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{b.filCod}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Paginacao aba={abaBorderos} />
              <p className="text-xs text-muted-foreground">
                Amostra de {painel.borderos.length}. Via remessa SISPAG:{' '}
                <strong>{painel.kpis.borderosViaRemessa}</strong> de {painel.kpis.borderosTotalAmostra} —
                evidência de que a baixa direta domina.
              </p>
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}
