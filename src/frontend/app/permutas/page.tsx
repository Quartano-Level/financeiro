'use client'

import * as React from 'react'
import { ArrowLeftRight, Ban, CheckCircle2, ChevronRight, Layers, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { fetchGestaoPermutas, processarAdiantamento } from '@/lib/api'
import type {
  CasamentoSugerido,
  GestaoPermutasResponse,
  InvoiceEmAberto,
  PermutaPendente,
  ProcessamentoStatus,
  StatusElegibilidade,
} from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { KPIGrid, SimpleKPI } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Rótulos legíveis para os motivos de bloqueio do snapshot. */
const MOTIVO_LABEL: Record<string, string> = {
  'nao-pago': 'Não totalmente pago',
  'sem-saldo-permutar': 'Sem saldo a permutar',
  'ja-permutado': 'Já permutado',
  'di-duimp-ambos': 'D.I e DUIMP (anomalia)',
  'data-base-indisponivel': 'Sem D.I / DUIMP',
  'sem-invoice': 'Sem invoice',
  'composto-nm': 'Múltiplas invoices (N:M)',
  'multiplas-invoices': 'Múltiplas invoices',
  'falha-gate': 'Falha em gate',
  'detail-indisponivel': 'Detalhe indisponível',
}

function StatusBadge({ status, motivo }: { status: StatusElegibilidade; motivo?: string }) {
  if (status === 'elegivel') {
    return (
      <Badge className="border-transparent bg-success-subtle text-success-foreground">
        <CheckCircle2 aria-hidden /> Elegível
      </Badge>
    )
  }
  if (status === 'casamento-manual') {
    return (
      <Badge
        className="border-transparent bg-warning-subtle text-warning-foreground"
        title={MOTIVO_LABEL[motivo ?? ''] ?? 'Casamento manual (N:M)'}
      >
        <Layers aria-hidden /> Casamento manual (N:M)
      </Badge>
    )
  }
  // "Já permutado": estado CONCLUÍDO (pago + 100% consumido em permuta anterior)
  // — não é um erro. Status próprio (fora de bloqueadas), badge em tom info com
  // ícone de check, distinto do vermelho das bloqueadas.
  if (status === 'ja-permutado') {
    return (
      <Badge
        className="border-transparent bg-info-subtle text-info-foreground"
        title={MOTIVO_LABEL['ja-permutado']}
      >
        <CheckCircle2 aria-hidden /> Já permutado
      </Badge>
    )
  }
  return (
    <Badge
      className="border-transparent bg-danger-subtle text-danger-foreground"
      title={motivo ? MOTIVO_LABEL[motivo] ?? motivo : undefined}
    >
      <Ban aria-hidden /> {motivo ? MOTIVO_LABEL[motivo] ?? motivo : 'Bloqueada'}
    </Badge>
  )
}

/** Rótulos do status de processamento do analista. */
const PROCESSAMENTO_LABEL: Record<ProcessamentoStatus, string> = {
  pendente: 'Pendente',
  processando: 'Processando',
  processado: 'Processado',
  erro: 'Erro',
}

/** Badge do status de processamento (botão "Processar"). */
function ProcessamentoBadge({ status }: { status: ProcessamentoStatus }) {
  if (status === 'processado') {
    return (
      <Badge className="border-transparent bg-success-subtle text-success-foreground">
        <CheckCircle2 aria-hidden /> Processado
      </Badge>
    )
  }
  if (status === 'erro') {
    return (
      <Badge className="border-transparent bg-danger-subtle text-danger-foreground">
        <Ban aria-hidden /> Erro
      </Badge>
    )
  }
  return <Badge variant="outline">{PROCESSAMENTO_LABEL[status]}</Badge>
}

/** Normaliza o nome de moeda do Conexos (`moedaNome`) para um código curto
 * (ISO quando há). O backend já manda USD/BRL; os demais chegam como nome longo
 * (ex.: "EURO/COM.EUROPEIA") — encurtamos aqui para a UI. */
const MOEDA_ALIAS: Record<string, string> = {
  'DOLAR DOS EUA': 'USD',
  'EURO/COM.EUROPEIA': 'EUR',
  'RENMINBI HONG KONG': 'CNH',
}
const moedaCodigo = (moeda: string) => MOEDA_ALIAS[moeda] ?? moeda

/** Valor em moeda negociada (número pt-BR) + código da moeda em tom suave.
 * `null` (valor não buscado — ex.: adiantamento não totalmente pago) → "—". */
function Moeda({ valor, moeda }: { valor: number | null; moeda: string }) {
  if (valor == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="tabular-nums">
      {formatNumber(valor)}{' '}
      <span className="text-xs text-muted-foreground">{moedaCodigo(moeda)}</span>
    </span>
  )
}

/** Data ISO → dd/mm/aaaa (pt-BR); "—" quando ausente. */
const fmtData = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'

/** Taxa de câmbio (pt-BR, até 4 casas — preserva a precisão p/ conferência). */
const fmtTaxa = (t: number) =>
  t.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** Parse de valor digitado em pt-BR ("5.557,42" → 5557.42). Ponto = milhar,
 * vírgula = decimal. Sem vírgula, aceita o número como veio (ex.: "5000"). */
const parseBrl = (s: string): number => {
  const t = s.trim()
  return t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
}

/** Campo rótulo/valor do painel de detalhe (expandir linha). */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  )
}

/** Total por moeda negociada (um item = `valorMoedaNegociada` na sua `moeda`). */
type MoedaTotal = { moeda: string; total: number }

/** Agrupa `valorMoedaNegociada` por `moeda` (nulls — itens sem detalhe, ex.:
 * não-pagos — são ignorados). Ordena USD na frente (moeda principal das
 * permutas) e as demais por valor decrescente. */
const somaPorMoeda = (
  items: { valorMoedaNegociada: number | null; moeda: string }[],
): MoedaTotal[] => {
  const map = new Map<string, number>()
  for (const it of items) {
    if (it.valorMoedaNegociada == null) continue
    const moeda = moedaCodigo(it.moeda)
    map.set(moeda, (map.get(moeda) ?? 0) + it.valorMoedaNegociada)
  }
  return [...map.entries()]
    .map(([moeda, total]) => ({ moeda, total }))
    .sort((a, b) => (a.moeda === 'USD' ? -1 : b.moeda === 'USD' ? 1 : b.total - a.total))
}

/** Formata um total na sua moeda (US$ / € / …); fallback para "1.234 XXX" se a
 * moeda não for um código ISO reconhecido pelo Intl. */
const fmtMoeda = (valor: number, moeda: string) => {
  try {
    return valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: moeda,
      maximumFractionDigits: 0,
    })
  } catch {
    return `${formatNumber(valor)} ${moeda}`
  }
}

/** Footer de KPI: valor principal na moeda negociada (USD na frente, fonte
 * maior) + as demais moedas menores embaixo (ex.: EUR) + descrição. */
function KpiFooter({ totais, children }: { totais: MoedaTotal[]; children: React.ReactNode }) {
  const [principal, ...resto] = totais
  return (
    <>
      {principal ? (
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {fmtMoeda(principal.total, principal.moeda)}
        </div>
      ) : null}
      {resto.length > 0 ? (
        <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums">
          {resto.map((t) => (
            <span key={t.moeda}>{fmtMoeda(t.total, t.moeda)}</span>
          ))}
        </div>
      ) : null}
      <div>{children}</div>
    </>
  )
}

/** Filtro de status aplicado à tabela de pendentes (dirigido pelos KPIs). */
type FiltroStatus = 'todos' | StatusElegibilidade

/** Rótulo do estado-vazio por filtro de status. */
const FILTRO_VAZIO_LABEL: Record<StatusElegibilidade, string> = {
  elegivel: 'elegível',
  bloqueada: 'bloqueado',
  'casamento-manual': 'em casamento manual',
  'ja-permutado': 'já permutado',
}

/** Opções do seletor de Status (sincroniza com os KPIs via `filtro`). */
const STATUS_OPCOES: { value: FiltroStatus; label: string }[] = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'elegivel', label: 'Elegível' },
  { value: 'casamento-manual', label: 'Casamento manual (N:M)' },
  { value: 'ja-permutado', label: 'Já permutado' },
  { value: 'bloqueada', label: 'Bloqueada' },
]

export default function GestaoPermutasPage() {
  const [data, setData] = React.useState<GestaoPermutasResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [filtro, setFiltro] = React.useState<FiltroStatus>('todos')
  // Filtro de filial (busca no Conexos é por filial — facilita conferir lá).
  const [filtroFilial, setFiltroFilial] = React.useState<string>('todas')
  // Filtro de exportador (busca por trecho do nome, case-insensitive).
  const [filtroExportador, setFiltroExportador] = React.useState<string>('')
  // Paginação da tabela de pendentes (50 por página).
  const [pagina, setPagina] = React.useState(1)
  // Vista da tabela principal: adiantamentos pendentes ou invoices em aberto
  // (dirigida pelos KPIs). 'invoices' é ativada pelo KPI "Invoices em aberto".
  const [vista, setVista] = React.useState<'adiantamentos' | 'invoices'>('adiantamentos')
  // Linha expandida (docCod) — mostra as micro-informações do adiantamento.
  const [expandido, setExpandido] = React.useState<string | null>(null)
  // Invoice expandida (docCod) na LISTA de invoices em aberto — micro-info.
  const [invoiceListExpandida, setInvoiceListExpandida] = React.useState<string | null>(null)
  // Invoice expandida (docCod) na aba de casamento sugerido — micro-info da invoice.
  const [invoiceExpandida, setInvoiceExpandida] = React.useState<string | null>(null)
  // Confirmação de processamento (modal) — o casamento inteiro (invoice + todos
  // os adiantamentos a abater). null = fechado.
  const [confirmacao, setConfirmacao] = React.useState<CasamentoSugerido | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchGestaoPermutas())
    } finally {
      setLoading(false)
    }
  }, [])

  // Carga inicial: resolve a promise num callback (sem setState síncrono no
  // corpo do effect) e ignora o resultado se o componente desmontar.
  React.useEffect(() => {
    let active = true
    fetchGestaoPermutas().then((d) => {
      if (!active) return
      setData(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const [processando, setProcessando] = React.useState<string | null>(null)
  // Resolução do casamento manual N:M (modal): adiantamento em questão + invoice
  // escolhida + valor a abater. null = modal fechado.
  const [resolverManual, setResolverManual] = React.useState<PermutaPendente | null>(null)
  const [invoiceManual, setInvoiceManual] = React.useState<string>('')
  const [valorManual, setValorManual] = React.useState<string>('')

  const processar = React.useCallback(
    async (adtoDocCod: string, adtoRef: string, invoiceDocCod: string, observacao?: string) => {
      setProcessando(adtoDocCod)
      try {
        await processarAdiantamento(adtoDocCod, invoiceDocCod, observacao)
        toast.success(`Adiantamento ${adtoRef} processado`)
        await load()
      } catch (err) {
        toast.error(
          `Falha ao processar ${adtoRef}${err instanceof Error ? `: ${err.message}` : ''}`,
        )
      } finally {
        setProcessando(null)
      }
    },
    [load],
  )

  // Processa em LOTE todos os adiantamentos pendentes do casamento confirmado no
  // modal (1 invoice : N adiantamentos). Os já processados são ignorados.
  const confirmarProcessamento = React.useCallback(async () => {
    if (!confirmacao) return
    const c = confirmacao
    const pendentes = c.adiantamentos.filter((a) => a.processamentoStatus !== 'processado')
    setConfirmacao(null)
    setProcessando(c.invoice.docCod)
    try {
      for (const adto of pendentes) {
        await processarAdiantamento(adto.docCod, c.invoice.docCod)
      }
      toast.success(`Processo ${c.priCod}: ${pendentes.length} adiantamento(s) processado(s)`)
      await load()
    } catch (err) {
      toast.error(
        `Falha ao processar o processo ${c.priCod}${err instanceof Error ? `: ${err.message}` : ''}`,
      )
    } finally {
      setProcessando(null)
    }
  }, [confirmacao, load])

  // Abre o modal de resolução manual já preenchendo o valor a abater com o valor
  // negociado do adiantamento (editável pelo analista).
  const abrirResolverManual = React.useCallback((p: PermutaPendente) => {
    setResolverManual(p)
    setInvoiceManual('')
    // Valor a abater em USD (principal). O saldo a permutar é nativo em R$ no
    // Conexos → convertido p/ USD pela taxa. Default = saldo em USD; teto = saldo.
    const saldoBrl = p.detalhe?.valorPermutar
    const taxa = p.detalhe?.taxaAdiantamento
    const saldoUSD = saldoBrl != null && taxa != null && taxa > 0 ? saldoBrl / taxa : undefined
    setValorManual(saldoUSD != null ? formatNumber(saldoUSD) : '')
  }, [])

  // Lança o casamento manual: registra a invoice escolhida + o valor a abater
  // (na observação) e processa o adiantamento.
  const lancarManual = React.useCallback(async () => {
    if (!resolverManual || !invoiceManual) return
    const p = resolverManual
    const obs = `Casamento manual N:M · invoice ${invoiceManual}${
      valorManual ? ` · valor a abater ${valorManual} ${moedaCodigo(p.moeda)}` : ''
    }`
    setResolverManual(null)
    await processar(p.docCod, p.docCod, invoiceManual, obs)
  }, [resolverManual, invoiceManual, valorManual, processar])

  // Filiais distintas presentes nos pendentes (para o seletor de filial).
  const filiais = React.useMemo(
    () => [...new Set((data?.pendentes ?? []).map((p) => p.filCod))].sort((a, b) => a - b),
    [data],
  )

  // Invoice casada de cada adiantamento (a partir dos casamentos automáticos) —
  // usado no detalhe p/ o analista ver a cobertura (adto × invoice).
  const invoiceByAdto = React.useMemo(() => {
    const m = new Map<string, InvoiceEmAberto>()
    for (const c of data?.casamentos ?? []) {
      for (const a of c.adiantamentos) m.set(a.docCod, c.invoice)
    }
    return m
  }, [data])

  // Pendente por docCod — usado no modal de confirmação p/ puxar a variação.
  const pendenteByDocCod = React.useMemo(() => {
    const m = new Map<string, PermutaPendente>()
    for (const p of data?.pendentes ?? []) m.set(p.docCod, p)
    return m
  }, [data])

  const expBusca = filtroExportador.trim().toLowerCase()
  const pendentesFiltrados = (data?.pendentes ?? []).filter(
    (p) =>
      (filtro === 'todos' || p.status === filtro) &&
      (filtroFilial === 'todas' || String(p.filCod) === filtroFilial) &&
      (expBusca === '' || p.exportador.toLowerCase().includes(expBusca)),
  )
  // Invoices em aberto (vista 'invoices') — mesmos filtros de filial/exportador.
  const invoicesFiltradas = (data?.invoicesEmAberto ?? []).filter(
    (i) =>
      (filtroFilial === 'todas' || String(i.filCod) === filtroFilial) &&
      (expBusca === '' || i.exportador.toLowerCase().includes(expBusca)),
  )

  // Paginação: 50 linhas por página. Base muda conforme a vista ativa.
  const PAGE_SIZE = 50
  const listaFiltrada = vista === 'invoices' ? invoicesFiltradas : pendentesFiltrados
  const totalPaginas = Math.max(1, Math.ceil(listaFiltrada.length / PAGE_SIZE))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const sliceInicio = (paginaAtual - 1) * PAGE_SIZE
  const pendentesPagina = pendentesFiltrados.slice(sliceInicio, sliceInicio + PAGE_SIZE)
  const invoicesPagina = invoicesFiltradas.slice(sliceInicio, sliceInicio + PAGE_SIZE)
  // Trocar filtro/filial volta à 1ª página (nos handlers → evita setState-in-effect).
  const mudarFiltro = (f: FiltroStatus) => {
    setFiltro(f)
    setVista('adiantamentos')
    setPagina(1)
  }
  const verInvoices = () => {
    setVista('invoices')
    setPagina(1)
  }
  const mudarFilial = (v: string) => {
    setFiltroFilial(v)
    setPagina(1)
  }
  const mudarExportador = (v: string) => {
    setFiltroExportador(v)
    setPagina(1)
  }

  // Filtro de filial reaproveitado nos dois cards de casamento (mesmo seletor do topo).
  const passaFilial = (filCod: number) =>
    filtroFilial === 'todas' || String(filCod) === filtroFilial

  // Adiantamentos N:M aguardando o analista escolher a invoice (ADR-0005).
  const casamentoManual = (data?.pendentes ?? []).filter(
    (p) => p.status === 'casamento-manual' && passaFilial(p.filCod),
  )

  // Casamentos automáticos (sugeridos), filtrados por filial da invoice/processo.
  const casamentosSugeridos = (data?.casamentos ?? []).filter((c) =>
    passaFilial(c.invoice.filCod),
  )

  // Validação do valor a abater (modal manual): em R$, limitado ao saldo a
  // permutar (BRL nativo do Conexos). USD é só referência (valor ÷ taxa).
  const detManual = resolverManual?.detalhe
  const saldoManualBrl = detManual?.valorPermutar
  const taxaManual = detManual?.taxaAdiantamento
  // USD é o principal; o saldo (nativo R$) é convertido p/ USD pela taxa.
  const saldoManualUSD =
    saldoManualBrl != null && taxaManual != null && taxaManual > 0
      ? saldoManualBrl / taxaManual
      : null
  const valorManualNum = parseBrl(valorManual) // em USD
  const valorManualExcede = saldoManualUSD != null && valorManualNum > saldoManualUSD + 0.005
  const valorManualValido =
    Number.isFinite(valorManualNum) && valorManualNum > 0 && !valorManualExcede
  // R$ equivalente do que será abatido (secundário) = USD × taxa.
  const valorManualBRL =
    taxaManual != null && taxaManual > 0 && Number.isFinite(valorManualNum) && valorManualNum > 0
      ? valorManualNum * taxaManual
      : null

  // Consolidação por MOEDA NEGOCIADA por card: USD como valor principal, demais
  // moedas (EUR, …) menores embaixo. Soma `valorMoedaNegociada`; itens sem
  // detalhe de moeda (ex.: não-pagos → null) não entram na soma.
  const pend = data?.pendentes ?? []
  const moedaTotais = {
    pendentes: somaPorMoeda(pend),
    elegiveis: somaPorMoeda(pend.filter((p) => p.status === 'elegivel')),
    casamentoManual: somaPorMoeda(pend.filter((p) => p.status === 'casamento-manual')),
    jaPermutado: somaPorMoeda(pend.filter((p) => p.status === 'ja-permutado')),
    bloqueadas: somaPorMoeda(pend.filter((p) => p.status === 'bloqueada')),
    invoicesEmAberto: somaPorMoeda(data?.invoicesEmAberto ?? []),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Permutas"
        subtitle="Adiantamentos PROFORMA pendentes de permuta e invoices em aberto — casamento e baixa assistidos (Frente I)."
        actions={
          <div className="flex items-center gap-2">
            {data ? (
              <Badge
                variant="outline"
                title={
                  data.fonte === 'banco'
                    ? 'Dados do Postgres local (eleição semeada)'
                    : 'Dados de demonstração (fixture com valores reais)'
                }
              >
                fonte: {data.fonte === 'banco' ? 'banco local' : 'fixture'}
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Atualizar
            </Button>
          </div>
        }
      />

      {loading && !data ? (
        <LoadingSkeleton />
      ) : !data ? (
        <EmptyState title="Não foi possível carregar a gestão de permutas" />
      ) : (
        <>
          <KPIGrid columns={6}>
            <SimpleKPI
              color="info"
              label="Adiantamentos pendentes"
              value={data.totais.pendentes}
              footer={<KpiFooter totais={moedaTotais.pendentes}>PROFORMA aguardando permuta</KpiFooter>}
              tooltip="Mostrar todos os adiantamentos pendentes"
              active={vista === 'adiantamentos' && filtro === 'todos'}
              onClick={() => mudarFiltro('todos')}
            />
            <SimpleKPI
              color="danger"
              label="Bloqueadas"
              value={data.totais.bloqueadas}
              footer={<KpiFooter totais={moedaTotais.bloqueadas}>pendência de gate</KpiFooter>}
              tooltip="Filtrar a tabela pelas bloqueadas"
              active={vista === 'adiantamentos' && filtro === 'bloqueada'}
              onClick={() => mudarFiltro('bloqueada')}
            />
            <SimpleKPI
              color="info"
              label="Já permutado"
              value={data.totais.jaPermutado}
              footer={<KpiFooter totais={moedaTotais.jaPermutado}>concluído (permuta anterior)</KpiFooter>}
              tooltip="Filtrar a tabela pelos já permutados"
              active={vista === 'adiantamentos' && filtro === 'ja-permutado'}
              onClick={() => mudarFiltro('ja-permutado')}
            />
            <SimpleKPI
              color="info"
              label="Invoices em aberto"
              value={data.totais.invoicesEmAberto}
              footer={<KpiFooter totais={moedaTotais.invoicesEmAberto}>finalizadas, a casar</KpiFooter>}
              tooltip="Ver as invoices em aberto (com detalhes)"
              active={vista === 'invoices'}
              onClick={verInvoices}
            />
            <SimpleKPI
              color="success"
              label="Elegíveis"
              value={data.totais.elegiveis}
              footer={<KpiFooter totais={moedaTotais.elegiveis}>passaram os 4 gates</KpiFooter>}
              tooltip="Filtrar a tabela pelos elegíveis"
              active={vista === 'adiantamentos' && filtro === 'elegivel'}
              onClick={() => mudarFiltro('elegivel')}
            />
            <SimpleKPI
              color="warning"
              label="Casamento manual"
              value={data.totais.casamentoManual}
              footer={<KpiFooter totais={moedaTotais.casamentoManual}>N:M, falta escolher invoice</KpiFooter>}
              tooltip="Filtrar a tabela pelos casamentos manuais (N:M)"
              active={vista === 'adiantamentos' && filtro === 'casamento-manual'}
              onClick={() => mudarFiltro('casamento-manual')}
            />
          </KPIGrid>

          {/* Filtros — filial (busca no Conexos é por filial), status e exportador. */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Filial</span>
              <Select value={filtroFilial} onValueChange={mudarFilial}>
                <SelectTrigger className="w-44" aria-label="Filtrar por filial">
                  <SelectValue placeholder="Todas as filiais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as filiais</SelectItem>
                  {filiais.map((f) => (
                    <SelectItem key={f} value={String(f)}>
                      Filial {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <Select value={filtro} onValueChange={(v) => mudarFiltro(v as FiltroStatus)}>
                <SelectTrigger className="w-56" aria-label="Filtrar por status">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Exportador</span>
              <Input
                value={filtroExportador}
                onChange={(e) => mudarExportador(e.target.value)}
                placeholder="Buscar exportador…"
                aria-label="Filtrar por exportador"
              />
            </div>
          </div>

          {/* Visão geral — adiantamentos pendentes OU invoices em aberto (vista) */}
          <Card>
            <CardHeader>
              <CardTitle>
                {vista === 'invoices'
                  ? 'Invoices em aberto'
                  : 'Adiantamentos pendentes de permuta'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {listaFiltrada.length === 0 ? (
                <EmptyState
                  title={
                    vista === 'invoices'
                      ? 'Nenhuma invoice em aberto'
                      : filtro === 'todos'
                        ? 'Nenhum adiantamento pendente'
                        : `Nenhum adiantamento ${FILTRO_VAZIO_LABEL[filtro]}`
                  }
                  description={
                    vista === 'invoices'
                      ? 'Não há invoices finalizadas em aberto para casar.'
                      : filtro === 'todos'
                        ? 'Não há PROFORMA aguardando permuta na última eleição.'
                        : 'Ajuste o filtro nos cartões acima para ver os demais.'
                  }
                />
              ) : (
                <>
                {vista === 'invoices' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Processo</TableHead>
                      <TableHead>Exportador</TableHead>
                      <TableHead className="text-right">Valor Moeda Negociada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesPagina.map((inv) => {
                      const aberto = invoiceListExpandida === inv.docCod
                      return (
                        <React.Fragment key={inv.docCod}>
                          <TableRow
                            className="cursor-pointer"
                            aria-expanded={aberto}
                            onClick={() =>
                              setInvoiceListExpandida((cur) =>
                                cur === inv.docCod ? null : inv.docCod,
                              )
                            }
                          >
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronRight
                                  className={cn(
                                    'size-4 text-muted-foreground transition-transform',
                                    aberto && 'rotate-90',
                                  )}
                                  aria-hidden
                                />
                                {inv.filCod}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{inv.docCod}</TableCell>
                            <TableCell>{inv.priCod ?? '—'}</TableCell>
                            <TableCell>{inv.exportador}</TableCell>
                            <TableCell className="text-right">
                              <Moeda valor={inv.valorMoedaNegociada} moeda={inv.moeda} />
                            </TableCell>
                          </TableRow>
                          {aberto ? (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={5} className="py-4">
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                                  <Campo label="Código">{inv.docCod}</Campo>
                                  <Campo label="Processo">{inv.priCod ?? '—'}</Campo>
                                  <Campo label="Referência">{inv.referencia}</Campo>
                                  <Campo label="Exportador">{inv.exportador}</Campo>
                                  <Campo label="Filial">{inv.filCod}</Campo>
                                  <Campo label="Valor (face)">
                                    {inv.valorBrl != null
                                      ? `R$ ${formatNumber(inv.valorBrl)}`
                                      : '—'}
                                  </Campo>
                                  <Campo label="Valor moeda negociada">
                                    <Moeda valor={inv.valorMoedaNegociada} moeda={inv.moeda} />
                                  </Campo>
                                </dl>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
                ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Exportador</TableHead>
                      <TableHead className="text-right">Valor Moeda Negociada</TableHead>
                      <TableHead className="text-right">Dias em Aberto</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentesPagina.map((p) => {
                      const aberto = expandido === p.docCod
                      const d = p.detalhe
                      // Saldo a permutar (mnyTitPermutar) vem em BRL; convertendo
                      // pela taxa negociada dá o saldo na moeda negociada (USD/…).
                      const saldoBrl = d?.valorPermutar
                      const taxa = d?.taxaAdiantamento
                      const saldoNeg =
                        saldoBrl != null && taxa != null && taxa > 0 ? saldoBrl / taxa : null
                      // Conta da variação cambial (só p/ casados): a classificação
                      // sai de delta = principalMoeda × (taxaAdto − taxaInvoice).
                      // O principalMoeda (valor negociado da invoice) é recuperado
                      // exatamente de delta ÷ Δtaxa — o delta foi calculado assim.
                      const taxaInv = d?.taxaInvoice
                      const delta = d?.variacaoDelta
                      const principalVar =
                        delta != null && taxa != null && taxaInv != null && taxa !== taxaInv
                          ? delta / (taxa - taxaInv)
                          : null
                      // Invoice casada + cobertura (adto / invoice) — quando parcial,
                      // mostra que o adiantamento não supre a invoice inteira.
                      const invCasada = invoiceByAdto.get(p.docCod)
                      const cobertura =
                        invCasada?.valorMoedaNegociada != null &&
                        invCasada.valorMoedaNegociada > 0 &&
                        p.valorMoedaNegociada != null &&
                        p.valorMoedaNegociada < invCasada.valorMoedaNegociada
                          ? (p.valorMoedaNegociada / invCasada.valorMoedaNegociada) * 100
                          : null
                      return (
                        <React.Fragment key={p.docCod}>
                          <TableRow
                            className="cursor-pointer"
                            aria-expanded={aberto}
                            onClick={() =>
                              setExpandido((cur) => (cur === p.docCod ? null : p.docCod))
                            }
                          >
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronRight
                                  className={cn(
                                    'size-4 text-muted-foreground transition-transform',
                                    aberto && 'rotate-90',
                                  )}
                                  aria-hidden
                                />
                                {p.filCod}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">{p.docCod}</TableCell>
                            <TableCell>{p.exportador}</TableCell>
                            <TableCell className="text-right">
                              <Moeda valor={p.valorMoedaNegociada} moeda={p.moeda} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.diasEmAberto ?? '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <StatusBadge status={p.status} motivo={p.motivoBloqueio} />
                                {p.processamentoStatus ? (
                                  <ProcessamentoBadge status={p.processamentoStatus} />
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                          {aberto ? (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={6} className="py-4">
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                                  <Campo label="Processo">{d?.priCod ?? '—'}</Campo>
                                  <Campo label="Referência">{p.referencia}</Campo>
                                  <Campo label="Data de emissão">{fmtData(d?.dataEmissao)}</Campo>
                                  <Campo label="Pago">{d?.pago ? 'Sim' : 'Não'}</Campo>
                                  <Campo label="Valor (face)">
                                    {p.valorBrl != null ? `R$ ${formatNumber(p.valorBrl)}` : '—'}
                                  </Campo>
                                  <Campo label="Valor moeda negociada">
                                    <Moeda valor={p.valorMoedaNegociada} moeda={p.moeda} />
                                  </Campo>
                                  <Campo label="Invoice casada">
                                    {invCasada ? (
                                      <>
                                        <span className="text-muted-foreground">
                                          {invCasada.docCod}
                                        </span>{' '}
                                        ·{' '}
                                        <Moeda
                                          valor={invCasada.valorMoedaNegociada}
                                          moeda={invCasada.moeda}
                                        />
                                        {cobertura != null ? (
                                          <div className="text-xs font-normal text-warning-foreground">
                                            parcial — adto cobre {formatNumber(cobertura)}%
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      '—'
                                    )}
                                  </Campo>
                                  <Campo label="Saldo a permutar">
                                    {saldoBrl != null ? (
                                      <>
                                        R$ {formatNumber(saldoBrl)}
                                        {saldoNeg != null ? (
                                          <div className="text-xs font-normal text-muted-foreground">
                                            ≈ {formatNumber(saldoNeg)} {moedaCodigo(p.moeda)}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      '—'
                                    )}
                                  </Campo>
                                  <Campo label="D.I / DUIMP">{d?.declaracao?.variante ?? '—'}</Campo>
                                  <Campo label="Data-base (D.I/DUIMP)">
                                    {fmtData(d?.declaracao?.dataBase)}
                                  </Campo>
                                  <Campo label="Taxa adiantamento">
                                    {d?.taxaAdiantamento != null
                                      ? fmtTaxa(d.taxaAdiantamento)
                                      : '—'}
                                  </Campo>
                                  <Campo label="Taxa invoice">
                                    {d?.taxaInvoice != null ? fmtTaxa(d.taxaInvoice) : '—'}
                                  </Campo>
                                  <Campo label="Variação cambial">
                                    {d?.variacaoClassificacao ?? '—'}
                                    {d?.variacaoResultado != null
                                      ? ` · R$ ${formatNumber(d.variacaoResultado)}`
                                      : ''}
                                  </Campo>
                                  {/* Motivo só aparece quando há bloqueio — elegíveis
                                      não têm motivo (evita o "—" inútil). */}
                                  {p.motivoBloqueio ? (
                                    <Campo label="Motivo">
                                      {MOTIVO_LABEL[p.motivoBloqueio] ?? p.motivoBloqueio}
                                    </Campo>
                                  ) : null}
                                </dl>
                                {/* Conta da variação cambial — converte o valor permutado
                                    pelas 2 taxas e tira a diferença EM REAIS (igual à
                                    planilha do analista). Só p/ casados (tem as 2 taxas). */}
                                {d?.variacaoClassificacao != null &&
                                principalVar != null &&
                                taxa != null &&
                                taxaInv != null &&
                                delta != null ? (
                                  <div className="mt-3 space-y-0.5 rounded-md border bg-background/60 px-3 py-2 text-xs text-muted-foreground tabular-nums">
                                    <div className="font-medium text-foreground">
                                      Cálculo da variação cambial (em R$):
                                    </div>
                                    <div>
                                      Adiantamento: {formatNumber(principalVar)}{' '}
                                      {moedaCodigo(p.moeda)} × {fmtTaxa(taxa)} ={' '}
                                      <span className="text-foreground">
                                        R$ {formatNumber(principalVar * taxa)}
                                      </span>
                                    </div>
                                    <div>
                                      Invoice: {formatNumber(principalVar)} {moedaCodigo(p.moeda)} ×{' '}
                                      {fmtTaxa(taxaInv)} ={' '}
                                      <span className="text-foreground">
                                        R$ {formatNumber(principalVar * taxaInv)}
                                      </span>
                                    </div>
                                    <div>
                                      Diferença ={' '}
                                      <span className="font-medium text-foreground">
                                        R$ {formatNumber(Math.abs(delta))}
                                      </span>{' '}
                                      →{' '}
                                      <span className="font-medium text-foreground">
                                        {d.variacaoClassificacao}
                                      </span>{' '}
                                      (variação{' '}
                                      {d.variacaoClassificacao === 'JUROS' ? 'passiva' : 'ativa'})
                                    </div>
                                  </div>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
                )}
                <div className="flex flex-col gap-2 pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Mostrando {(paginaAtual - 1) * PAGE_SIZE + 1}–
                    {Math.min(paginaAtual * PAGE_SIZE, listaFiltrada.length)} de{' '}
                    {listaFiltrada.length}
                  </span>
                  {totalPaginas > 1 ? (
                    <div className="flex items-center gap-2">
                      <span>
                        Página {paginaAtual} de {totalPaginas}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paginaAtual <= 1}
                        onClick={() => setPagina((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={paginaAtual >= totalPaginas}
                        onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                      >
                        Próxima
                      </Button>
                    </div>
                  ) : null}
                </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Casamento — sugerido (auto 1:N) × manual (N:M), alternados por aba */}
          <Card>
            <Tabs defaultValue="sugerido">
              <CardHeader>
                <TabsList>
                  <TabsTrigger value="sugerido">
                    <ArrowLeftRight className="size-4" aria-hidden /> Casamento sugerido (
                    {casamentosSugeridos.length})
                  </TabsTrigger>
                  <TabsTrigger value="manual">
                    <Layers className="size-4" aria-hidden /> Casamento manual N:M (
                    {casamentoManual.length})
                  </TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="manual" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Escolha qual <strong>invoice (fatura)</strong> do mesmo processo este{' '}
                    <strong>adiantamento (PROFORMA já pago)</strong> vai abater. O processo tem
                    vários adiantamentos e várias invoices, então o casamento 1:1 automático não se
                    aplica — você decide a ligação.
                  </p>
                  {casamentoManual.length === 0 ? (
                    <EmptyState
                      title="Nenhum casamento manual"
                      description="Não há adiantamentos N:M aguardando escolha de invoice."
                    />
                  ) : (
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Exportador</TableHead>
                      <TableHead className="text-right">Valor Moeda Negociada</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {casamentoManual.map((p) => {
                      const candidatas = p.candidatas ?? []
                      return (
                        <TableRow key={p.docCod}>
                          <TableCell>{p.filCod}</TableCell>
                          <TableCell className="font-medium">{p.docCod}</TableCell>
                          <TableCell>{p.exportador}</TableCell>
                          <TableCell className="text-right">
                            <Moeda valor={p.valorMoedaNegociada} moeda={p.moeda} />
                            {p.valorBrl != null ? (
                              <div className="text-xs text-muted-foreground tabular-nums">
                                ≈ R$ {formatNumber(p.valorBrl)}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.processamentoStatus === 'processado' ? (
                              <ProcessamentoBadge status="processado" />
                            ) : candidatas.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                Sem invoices candidatas
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={processando === p.docCod}
                                onClick={() => abrirResolverManual(p)}
                              >
                                {processando === p.docCod ? 'Processando…' : 'Resolver'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="sugerido" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Casamento automático: processos com <strong>exatamente 1 invoice</strong>. Cada
                    adiantamento abate essa invoice (1:1); se o processo tiver vários adiantamentos,
                    todos aparecem agrupados sob a mesma invoice (1 invoice : N adiantamentos).
                  </p>
                  {casamentosSugeridos.length === 0 ? (
                <EmptyState
                  title="Nenhum casamento sugerido"
                  description="Não há invoices em aberto casáveis na última eleição."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead>Processo / Invoice</TableHead>
                      <TableHead className="text-right">Valor Moeda Negociada</TableHead>
                      <TableHead>Adiantamento</TableHead>
                      <TableHead className="text-right">Valor a ser Usado</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {casamentosSugeridos.map((c, g) => {
                      const abertaInv = invoiceExpandida === c.invoice.docCod
                      const totalUsado = c.adiantamentos.reduce(
                        (s, a) => s + (a.valorASerUsado ?? 0),
                        0,
                      )
                      const moedaGrupo = c.adiantamentos[0]?.moeda ?? c.invoice.moeda
                      const sep = g > 0 ? 'border-t-2 border-border' : ''
                      const pendentesGrupo = c.adiantamentos.filter(
                        (a) => a.processamentoStatus !== 'processado',
                      )
                      const todosProcessados =
                        c.adiantamentos.length > 0 && pendentesGrupo.length === 0
                      return (
                        <React.Fragment key={c.invoice.docCod}>
                          {/* Header da invoice — clicável, expande a micro-info dela */}
                          <TableRow
                            className={cn('cursor-pointer bg-muted/20', sep)}
                            aria-expanded={abertaInv}
                            onClick={() =>
                              setInvoiceExpandida((cur) =>
                                cur === c.invoice.docCod ? null : c.invoice.docCod,
                              )
                            }
                          >
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5">
                                <ChevronRight
                                  className={cn(
                                    'size-4 text-muted-foreground transition-transform',
                                    abertaInv && 'rotate-90',
                                  )}
                                  aria-hidden
                                />
                                {c.invoice.filCod}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">
                              {c.priCod}
                              <div className="text-xs font-normal text-muted-foreground">
                                {c.invoice.exportador}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Moeda valor={c.invoice.valorMoedaNegociada} moeda={c.invoice.moeda} />
                            </TableCell>
                            <TableCell
                              colSpan={2}
                              className="text-right text-xs text-muted-foreground"
                            >
                              {c.adiantamentos.length} adiantamento
                              {c.adiantamentos.length !== 1 ? 's' : ''} · usa{' '}
                              {formatNumber(totalUsado)} {moedaCodigo(moedaGrupo)}
                            </TableCell>
                            <TableCell className="text-right">
                              {todosProcessados ? (
                                <ProcessamentoBadge status="processado" />
                              ) : c.adiantamentos.length > 0 ? (
                                <Button
                                  size="sm"
                                  disabled={processando === c.invoice.docCod}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmacao(c)
                                  }}
                                >
                                  {processando === c.invoice.docCod ? 'Processando…' : 'Processar'}
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>

                          {/* Micro-info da invoice (expandido) */}
                          {abertaInv ? (
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={6} className="py-4">
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                                  <Campo label="Invoice (código)">{c.invoice.docCod}</Campo>
                                  <Campo label="Referência">{c.invoice.referencia}</Campo>
                                  <Campo label="Exportador">{c.invoice.exportador}</Campo>
                                  <Campo label="Filial">{c.invoice.filCod}</Campo>
                                  <Campo label="Processo">{c.priCod}</Campo>
                                  <Campo label="Valor (face)">
                                    {c.invoice.valorBrl != null
                                      ? `R$ ${formatNumber(c.invoice.valorBrl)}`
                                      : '—'}
                                  </Campo>
                                  <Campo label="Valor moeda negociada">
                                    <Moeda
                                      valor={c.invoice.valorMoedaNegociada}
                                      moeda={c.invoice.moeda}
                                    />
                                  </Campo>
                                  <Campo label="Adiantamentos casados">
                                    {c.adiantamentos.length} · usa {formatNumber(totalUsado)}{' '}
                                    {moedaCodigo(moedaGrupo)}
                                  </Campo>
                                </dl>
                              </TableCell>
                            </TableRow>
                          ) : null}

                          {/* Adiantamentos (filhos da invoice) */}
                          {c.adiantamentos.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-sm text-muted-foreground">
                                Sem adiantamento sugerido ainda.
                              </TableCell>
                            </TableRow>
                          ) : (
                            c.adiantamentos.map((adto) => (
                              <TableRow key={adto.docCod}>
                                <TableCell />
                                <TableCell />
                                <TableCell />
                                <TableCell className="font-medium">{adto.docCod}</TableCell>
                                <TableCell className="text-right">
                                  <Moeda valor={adto.valorASerUsado} moeda={adto.moeda} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <ProcessamentoBadge
                                    status={adto.processamentoStatus ?? 'pendente'}
                                  />
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
                  )}
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Modal de confirmação do processamento (checkout) */}
          <Dialog
            open={confirmacao !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmacao(null)
            }}
          >
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>Confirmar processamento</DialogTitle>
                <DialogDescription>
                  Revise os adiantamentos que vão abater esta invoice antes de processar.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                {confirmacao ? (
                  <>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <Campo label="Processo">{confirmacao.priCod}</Campo>
                      <Campo label="Invoice a abater">
                        <span className="text-muted-foreground">{confirmacao.invoice.docCod}</span>{' '}
                        ·{' '}
                        <Moeda
                          valor={confirmacao.invoice.valorMoedaNegociada}
                          moeda={confirmacao.invoice.moeda}
                        />
                      </Campo>
                    </dl>
                    <div className="mt-4">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        Adiantamentos a abater
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Adiantamento</TableHead>
                            <TableHead className="text-right">Valor a ser usado</TableHead>
                            <TableHead className="text-right">Variação cambial</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {confirmacao.adiantamentos.map((adto) => {
                            const det = pendenteByDocCod.get(adto.docCod)?.detalhe
                            return (
                              <TableRow key={adto.docCod}>
                                <TableCell className="font-medium">{adto.docCod}</TableCell>
                                <TableCell className="text-right">
                                  <Moeda valor={adto.valorASerUsado} moeda={adto.moeda} />
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {det?.variacaoClassificacao != null &&
                                  det.variacaoResultado != null
                                    ? `${det.variacaoClassificacao} · R$ ${formatNumber(det.variacaoResultado)}`
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <ProcessamentoBadge
                                    status={adto.processamentoStatus ?? 'pendente'}
                                  />
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Os adiantamentos pendentes acima vão abater a invoice{' '}
                      <strong>{confirmacao.invoice.docCod}</strong>. Os já processados são ignorados.
                    </p>
                  </>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmacao(null)}>
                  Cancelar
                </Button>
                <Button onClick={() => void confirmarProcessamento()}>
                  Processar{' '}
                  {confirmacao
                    ? confirmacao.adiantamentos.filter(
                        (a) => a.processamentoStatus !== 'processado',
                      ).length
                    : 0}{' '}
                  adiantamento(s)
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal de resolução do casamento manual N:M */}
          <Dialog
            open={resolverManual !== null}
            onOpenChange={(open) => {
              if (!open) setResolverManual(null)
            }}
          >
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>
                  Resolver casamento manual — Adiantamento {resolverManual?.docCod}
                </DialogTitle>
                <DialogDescription>
                  Escolha a invoice do mesmo processo e o valor a abater, e lance a permuta.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                {resolverManual ? (
                  <>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                      <Campo label="Processo">{resolverManual.detalhe?.priCod ?? '—'}</Campo>
                      <Campo label="Exportador">{resolverManual.exportador}</Campo>
                      <Campo label="Valor moeda negociada">
                        <Moeda
                          valor={resolverManual.valorMoedaNegociada}
                          moeda={resolverManual.moeda}
                        />
                      </Campo>
                      <Campo label="Taxa adiantamento">
                        {resolverManual.detalhe?.taxaAdiantamento != null
                          ? fmtTaxa(resolverManual.detalhe.taxaAdiantamento)
                          : '—'}
                      </Campo>
                      <Campo label="Saldo a permutar">
                        {saldoManualUSD != null ? (
                          <>
                            {formatNumber(saldoManualUSD)} {moedaCodigo(resolverManual.moeda)}
                            {saldoManualBrl != null ? (
                              <div className="text-xs font-normal text-muted-foreground">
                                R$ {formatNumber(saldoManualBrl)}
                              </div>
                            ) : null}
                          </>
                        ) : saldoManualBrl != null ? (
                          `R$ ${formatNumber(saldoManualBrl)}`
                        ) : (
                          '—'
                        )}
                      </Campo>
                      <Campo label="D.I / DUIMP">
                        {resolverManual.detalhe?.declaracao?.variante ?? '—'}
                      </Campo>
                      <Campo label="Data D.I / DUIMP">
                        {fmtData(resolverManual.detalhe?.declaracao?.dataBase)}
                      </Campo>
                    </dl>
                    <div className="mt-4 space-y-3">
                      <div className="space-y-1">
                        <label htmlFor="manual-invoice" className="text-sm font-medium">
                          Invoice a casar
                        </label>
                        <Select value={invoiceManual} onValueChange={setInvoiceManual}>
                          <SelectTrigger id="manual-invoice">
                            <SelectValue placeholder="Escolher invoice…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(resolverManual.candidatas ?? []).map((inv) => (
                              <SelectItem key={inv.docCod} value={inv.docCod}>
                                Processo {resolverManual.detalhe?.priCod ?? '—'} · Invoice{' '}
                                {inv.docCod} ·{' '}
                                {inv.valorMoedaNegociada != null
                                  ? `${formatNumber(inv.valorMoedaNegociada)} ${moedaCodigo(inv.moeda)}`
                                  : '—'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          O Processo ({resolverManual.detalhe?.priCod ?? '—'}) é o código em comum
                          entre o adiantamento e a invoice.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="manual-valor" className="text-sm font-medium">
                          Valor a abater ({moedaCodigo(resolverManual.moeda)})
                        </label>
                        <Input
                          id="manual-valor"
                          type="text"
                          inputMode="decimal"
                          value={valorManual}
                          onChange={(e) => setValorManual(e.target.value)}
                          onBlur={() =>
                            setValorManual((v) => {
                              const n = parseBrl(v)
                              return Number.isFinite(n) && v.trim() !== '' ? formatNumber(n) : v
                            })
                          }
                          aria-invalid={valorManualExcede}
                        />
                        <p className="text-xs text-muted-foreground">
                          Saldo a permutar:{' '}
                          {saldoManualUSD != null
                            ? `${formatNumber(saldoManualUSD)} ${moedaCodigo(resolverManual.moeda)}`
                            : '—'}
                          {saldoManualBrl != null ? ` · R$ ${formatNumber(saldoManualBrl)}` : ''}
                        </p>
                        {/* "Abate" só quando PARCIAL (< saldo) — no padrão é o saldo inteiro. */}
                        {valorManualBRL != null &&
                        saldoManualUSD != null &&
                        valorManualNum < saldoManualUSD - 0.005 ? (
                          <p className="text-xs text-muted-foreground">
                            Você vai abater {formatNumber(valorManualNum)}{' '}
                            {moedaCodigo(resolverManual.moeda)} ≈ R$ {formatNumber(valorManualBRL)}
                          </p>
                        ) : null}
                        {valorManualExcede ? (
                          <p className="text-xs text-danger-foreground">
                            Não pode exceder o saldo a permutar (
                            {formatNumber(saldoManualUSD ?? 0)}{' '}
                            {moedaCodigo(resolverManual.moeda)}).
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResolverManual(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!invoiceManual || !valorManualValido}
                  onClick={() => void lancarManual()}
                >
                  Lançar permuta
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <KPIGrid columns={6}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </KPIGrid>
      <Skeleton className="h-64" />
    </div>
  )
}
