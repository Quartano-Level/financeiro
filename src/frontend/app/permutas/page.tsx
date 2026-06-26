'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowLeftRight,
  Ban,
  Banknote,
  CheckCircle2,
  ChevronRight,
  DatabaseZap,
  Download,
  Layers,
  Play,
  RefreshCw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlocacaoExcedeSaldoError,
  buscarInvoicesPorProcesso,
  criarAlocacao,
  exportarRelatorio,
  fetchGestaoPermutas,
  fetchPermutaRuns,
  fetchPermutaStatus,
  IngestaoEmAndamentoError,
  reconciliarAdiantamento,
  reconciliarLoteAutomaticas,
  removerAlocacao,
  runIngestaoManual,
} from '@/lib/api'
import type {
  CasamentoSugerido,
  GestaoPermutasResponse,
  InvoiceBuscada,
  InvoiceEmAberto,
  PermutaBorderoVinculo,
  PermutaPendente,
  PermutaRun,
  ProcessamentoStatus,
  ReconciliarLoteResult,
  ReconciliarResult,
  RelatorioTipo,
  StatusElegibilidade,
} from '@/lib/types'
import { RELATORIOS_DISPONIVEIS } from '@/lib/types'
import { cn, formatNumber, ordenarPorEtapaPermuta, progressoPagamento } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { KPIGrid, SimpleKPI } from '@/components/ui/kpi-card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BorderosPanel } from './BorderosPanel'
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

/**
 * Processamento (baixa/lançamento da permuta). LIGADO desde a Fase 3 (write-back no `fin010` vivo):
 * a baixa real é feita pelo fluxo "Baixar" (reconciliação adto→invoice no borderô). Esta flag
 * libera também os botões legados de Processar/Lançar e remove o aviso de indisponibilidade.
 */
const PROCESSAMENTO_HABILITADO = true

/** Tamanho máximo do lote por clique em "Executar" — espelha o cap server-side (LOTE_MAX no backend).
 * Mantém cada execução curta (longe do timeout do proxy) e limita o blast radius; o analista clica
 * de novo para o próximo lote até zerar. */
const LOTE_MAX = 6

/** Uma linha da aba Histórico — permuta JÁ EXECUTADA (tem borderô), normalizada das 4 categorias. */
interface ItemHistorico {
  key: string
  tipo: string
  filCod: number
  priCod: string
  cliente: string
  exportador: string
  adtoDocCod: string
  valor: number | null
  moeda: string
  borCod?: number
  finalizado: boolean
  busca: string
}

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
  'cliente-filtro': 'Cliente filtro (permuta manual)',
}

/**
 * Trilha de auditoria (ADR-0006): "analista simone" para um username, "cron job"
 * para o agendado. O username vem do `triggered_by` gravado server-side a partir
 * do token autenticado — não de input do cliente.
 */
function rotuloQuemRodou(triggeredBy: string): string {
  if (triggeredBy === 'cron') return 'cron job'
  return `analista ${triggeredBy}`
}

/** Carimbo "21/06/2026 · 10h52" (horário de Brasília) a partir de um ISO timestamp. */
function formatRunWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  // Fixa o fuso em BRT (America/Sao_Paulo) — independe do fuso do navegador.
  const tz = 'America/Sao_Paulo'
  const data = d.toLocaleDateString('pt-BR', { timeZone: tz })
  const hora = d
    .toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    .replace(':', 'h')
  return `${data} · ${hora}`
}

/** Badge de status de uma run no histórico do modal de ingestão. */
function RunStatusBadge({ status }: { status: PermutaRun['status'] }) {
  if (status === 'success') {
    return (
      <Badge className="border-transparent bg-success-subtle text-success-foreground">
        <CheckCircle2 aria-hidden /> Sucesso
      </Badge>
    )
  }
  if (status === 'partial') {
    return (
      <Badge className="border-transparent bg-warning-subtle text-warning-foreground">
        <Layers aria-hidden /> Parcial
      </Badge>
    )
  }
  return (
    <Badge className="border-transparent bg-danger-subtle text-danger-foreground">
      <Ban aria-hidden /> Falha
    </Badge>
  )
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
  if (status === 'permuta-manual') {
    return (
      <Badge
        className="border-transparent bg-permuta-subtle text-permuta-foreground"
        title={MOTIVO_LABEL[motivo ?? ''] ?? 'Permuta manual (cross-process)'}
      >
        <ArrowLeftRight aria-hidden /> Permuta manual
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

/**
 * Badge do status PERMUTA→BORDERÔ (Fase 3.1). Sem vínculo → "Pendente" (executável). Borderô EM
 * CADASTRO → "Aguardando finalização" (amarelo). Borderô FINALIZADO → "Finalizado" (verde). Mostra
 * o nº do borderô. (Cancelado/estornado/excluído volta a "pendente" pelo backend → sem vínculo.)
 */
function PermutaBorderoBadge({ vinculo }: { vinculo?: PermutaBorderoVinculo }) {
  if (!vinculo) return <Badge variant="outline">Pendente</Badge>
  if (vinculo.permutaStatus === 'finalizado') {
    return (
      <Badge className="border-transparent bg-success-subtle text-success-foreground">
        <CheckCircle2 aria-hidden /> Finalizado · borderô {vinculo.borCod}
      </Badge>
    )
  }
  return (
    <Badge className="border-transparent bg-warning-subtle text-warning-foreground">
      Aguardando finalização · borderô {vinculo.borCod}
    </Badge>
  )
}

/** Normaliza o nome de moeda do Conexos (`moedaNome`) para um código curto
 * (ISO quando há). O backend já manda USD/BRL; os demais chegam como nome longo
 * (ex.: "EURO/COM.EUROPEIA") — encurtamos aqui para a UI. */
const MOEDA_ALIAS: Record<string, string> = {
  'DOLAR DOS EUA': 'USD',
  'EURO/COM.EUROPEIA': 'EUR',
  'RENMINBI HONG KONG': 'CNH',
  'REAL/BRASIL': 'BRL',
  'DOLAR CANADENSE': 'CAD',
  'LIBRA ESTERLINA': 'GBP',
  'IENE/JAPAO': 'JPY',
  'FRANCO SUICO': 'CHF',
  'DOLAR AUSTRALIANO': 'AUD',
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

/** Máscara monetária pt-BR no estilo "centavos": os dígitos digitados são lidos como
 * centavos e formatados com milhar (.) + decimais (,). Ex.: "4336604" → "43.366,04". */
const maskBrl = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (digits === '') return ''
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Converte um número (ex.: saldo) para a string mascarada pt-BR ("43.366,04"). */
const numToMask = (n: number): string => maskBrl(String(Math.round(n * 100)))

/**
 * Input de valor monetário com máscara pt-BR (milhar `.` / centavos `,`) e botão "Máx"
 * opcional que preenche o valor total disponível. `value`/`onChange` operam na string
 * mascarada (parse com `parseBrl`).
 */
function MoneyInput({
  value,
  onChange,
  max,
  className,
}: {
  value: string
  onChange: (masked: string) => void
  max?: number
  className?: string
}) {
  const temMax = max != null && Number.isFinite(max) && max > 0
  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(maskBrl(e.target.value))}
        placeholder="0,00"
        className={cn('text-right tabular-nums', className)}
      />
      {temMax ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={`Preencher o máximo disponível (${numToMask(max)})`}
          onClick={() => onChange(numToMask(max))}
        >
          Máx
        </Button>
      ) : null}
    </div>
  )
}

/** Campo rótulo/valor do painel de detalhe (expandir linha). `min-w-0` deixa o
 * item do grid encolher e o texto quebrar (evita overflow invadir a coluna ao
 * lado, ex.: nome longo de exportador). `className` permite col-span. */
function Campo({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium tabular-nums break-words">{children}</dd>
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
  'permuta-manual': 'em permuta manual',
  'ja-permutado': 'já permutado',
}

/** Opções do seletor de Status (sincroniza com os KPIs via `filtro`). */
const STATUS_OPCOES: { value: FiltroStatus; label: string }[] = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'elegivel', label: 'Elegível' },
  { value: 'casamento-manual', label: 'Casamento manual (N:M)' },
  { value: 'permuta-manual', label: 'Permuta manual' },
  { value: 'ja-permutado', label: 'Já permutado' },
  { value: 'bloqueada', label: 'Bloqueada' },
]

/** Estado de filtro (filial + busca) + paginação de uma aba. */
interface TabelaFiltro<T> {
  filial: string
  busca: string
  setFilial: (v: string) => void
  setBusca: (v: string) => void
  pagina: number
  setPagina: React.Dispatch<React.SetStateAction<number>>
  filiais: number[]
  slice: T[]
  total: number
  totalPaginas: number
  paginaAtual: number
  pageSize: number
}

/**
 * Hook de filtro (filial + busca textual) + paginação para uma aba — espelha a
 * tabela principal. Trocar filtro volta à 1ª página (sem setState-in-effect).
 */
function useTabelaFiltro<T>(
  items: T[],
  getFilCod: (x: T) => number,
  getBuscaTexto: (x: T) => string,
  pageSize = 20,
): TabelaFiltro<T> {
  const [filial, setFilialState] = React.useState('todas')
  const [busca, setBuscaState] = React.useState('')
  const [pagina, setPagina] = React.useState(1)
  const b = busca.trim().toLowerCase()
  const filtrados = items.filter(
    (x) =>
      (filial === 'todas' || String(getFilCod(x)) === filial) &&
      (b === '' || getBuscaTexto(x).toLowerCase().includes(b)),
  )
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const slice = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize)
  const filiais = [...new Set(items.map(getFilCod))].sort((a, c) => a - c)
  const setFilial = (v: string) => {
    setFilialState(v)
    setPagina(1)
  }
  const setBusca = (v: string) => {
    setBuscaState(v)
    setPagina(1)
  }
  return {
    filial,
    busca,
    setFilial,
    setBusca,
    pagina,
    setPagina,
    filiais,
    slice,
    total: filtrados.length,
    totalPaginas,
    paginaAtual,
    pageSize,
  }
}

/** Barra de filtro de uma aba: filial + busca por exportador/processo. */
function FiltroBarra<T>({
  aba,
  buscaPlaceholder,
}: {
  aba: TabelaFiltro<T>
  buscaPlaceholder: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Filial</span>
        <Select value={aba.filial} onValueChange={aba.setFilial}>
          <SelectTrigger className="w-44" aria-label="Filtrar por filial">
            <SelectValue placeholder="Todas as filiais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as filiais</SelectItem>
            {aba.filiais.map((f) => (
              <SelectItem key={f} value={String(f)}>
                Filial {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-xs text-muted-foreground">Buscar</span>
        <Input
          value={aba.busca}
          onChange={(e) => aba.setBusca(e.target.value)}
          placeholder={buscaPlaceholder}
          aria-label={buscaPlaceholder}
        />
      </div>
    </div>
  )
}

/** Rodapé de paginação de uma aba (igual ao da tabela principal). */
function Paginacao<T>({ aba }: { aba: TabelaFiltro<T> }) {
  if (aba.total === 0) return null
  return (
    <div className="flex flex-col gap-2 pt-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Mostrando {(aba.paginaAtual - 1) * aba.pageSize + 1}–
        {Math.min(aba.paginaAtual * aba.pageSize, aba.total)} de {aba.total}
      </span>
      {aba.totalPaginas > 1 ? (
        <div className="flex items-center gap-2">
          <span>
            Página {aba.paginaAtual} de {aba.totalPaginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={aba.paginaAtual <= 1}
            onClick={() => aba.setPagina((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={aba.paginaAtual >= aba.totalPaginas}
            onClick={() => aba.setPagina((p) => Math.min(aba.totalPaginas, p + 1))}
          >
            Próxima
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default function GestaoPermutasPage() {
  const [data, setData] = React.useState<GestaoPermutasResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [filtro, setFiltro] = React.useState<FiltroStatus>('todos')
  // Filtro de filial (busca no Conexos é por filial — facilita conferir lá).
  const [filtroFilial, setFiltroFilial] = React.useState<string>('todas')
  // Filtro de exportador (busca por trecho do nome, case-insensitive).
  const [filtroExportador, setFiltroExportador] = React.useState<string>('')
  // Vista de invoices: todas as finalizadas vs. só as "casadas" (processo com adiantamento).
  const [filtroInvoiceTipo, setFiltroInvoiceTipo] = React.useState<'todas' | 'casadas'>('todas')
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

  // Modal de ingestão manual (ADR-0006): trigger entre os cron jobs + trilha de
  // auditoria das últimas rodadas.
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

  // Exportação de relatórios (.xlsx). Guarda o `tipo` em andamento para o
  // spinner por item; um clique baixa o arquivo (snapshot completo no backend).
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

  const [processando, setProcessando] = React.useState<string | null>(null)

  // Execução em LOTE das automáticas (botão "Executar"): diálogo de confirmação + estado de execução.
  const [confirmLoteOpen, setConfirmLoteOpen] = React.useState(false)
  const [executandoLote, setExecutandoLote] = React.useState(false)

  // Alocação manual cross-process (Fase 2): adto + busca de invoice por processo.
  const [alocando, setAlocando] = React.useState<PermutaPendente | null>(null)
  const [buscaProcesso, setBuscaProcesso] = React.useState<string>('')
  const [invoicesBuscadas, setInvoicesBuscadas] = React.useState<InvoiceBuscada[] | null>(null)
  const [buscandoInv, setBuscandoInv] = React.useState(false)
  const [invoiceAloc, setInvoiceAloc] = React.useState<string>('')
  const [valorAloc, setValorAloc] = React.useState<string>('')
  const [salvandoAloc, setSalvandoAloc] = React.useState(false)

  // Processa o casamento confirmado = BAIXA REAL no fin010 (cria borderô), igual aos manuais.
  // Para cada adiantamento do grupo, chama o reconciliar (que AUTO-ALOCA a partir do casamento) →
  // borderô em CADASTRO. Os já processados são ignorados. (Regra 2026-06-24: Automáticas baixam.)
  const confirmarProcessamento = React.useCallback(async () => {
    if (!confirmacao) return
    const c = confirmacao
    const pendentes = c.adiantamentos.filter((a) => a.processamentoStatus !== 'processado')
    setConfirmacao(null)
    setProcessando(c.invoice.docCod)
    try {
      let settled = 0
      let erros = 0
      let dryRun = false
      const borderos = new Set<number>()
      for (const adto of pendentes) {
        const r = await reconciliarAdiantamento(adto.docCod, { dryRun: false })
        if (r.dryRun) dryRun = true
        settled += r.resultados.filter((x) => x.status === 'settled').length
        erros += r.resultados.filter((x) => x.status === 'error').length
        if (r.borCod !== undefined) borderos.add(r.borCod)
      }
      if (dryRun) {
        toast.info('Escrita desabilitada no servidor (dry-run). Payload validado, sem baixa real.')
      } else {
        if (erros > 0) toast.error(`${erros} baixa(s) falharam — veja a aba Borderôs.`)
        if (settled > 0)
          toast.success(
            `Processo ${c.priCod}: ${settled} baixa(s) no fin010 (borderô${
              borderos.size === 1 ? ` ${[...borderos][0]}` : 's'
            }, EM CADASTRO). Revise e aprove em Borderôs.`,
          )
      }
      await load()
    } catch (err) {
      toast.error(
        `Falha ao processar o processo ${c.priCod}${err instanceof Error ? `: ${err.message}` : ''}`,
      )
    } finally {
      setProcessando(null)
    }
  }, [confirmacao, load])

  // Executa o PRÓXIMO LOTE de automáticas (até LOTE_MAX) — um request ao backend (`/reconciliar-lote`),
  // que itera server-side com continue-on-error e capa em LOTE_MAX. Manda os "próximos N" pendentes; ao
  // recarregar, os baixados ganham borderô e somem da contagem → o analista clica de novo até zerar. O
  // "Processar" individual segue intacto. Decisão 2026-06-25: ignora filtros; lotes de 10 em 10.
  const executarLote = React.useCallback(
    async (docCods: string[], totalPendentes: number) => {
      setConfirmLoteOpen(false)
      setExecutandoLote(true)
      try {
        const r = await reconciliarLoteAutomaticas({ dryRun: false, adiantamentoDocCods: docCods })
        const restantes = Math.max(0, totalPendentes - r.totalCasos)
        const sufixoRestante = restantes > 0 ? ` Restam ${restantes} — clique em Executar de novo.` : ''
        if (r.dryRun) {
          toast.info('Escrita desabilitada no servidor (dry-run). Payloads validados, sem baixa real.')
        } else {
          if (r.totalSettled > 0)
            toast.success(
              `${r.totalSettled} baixa(s) no fin010 em ${r.borderos.length} borderô(s) (EM CADASTRO).${sufixoRestante}`,
            )
          if (r.totalErros > 0)
            toast.error(`${r.totalErros} baixa(s) falharam — os casos seguem pendentes para retry.`)
          if (r.totalSettled === 0 && r.totalErros === 0)
            toast.info('Nada a executar — as automáticas já estavam processadas.')
        }
        await load()
      } catch (err) {
        toast.error(`Falha ao executar o lote${err instanceof Error ? `: ${err.message}` : ''}`)
      } finally {
        setExecutandoLote(false)
      }
    },
    [load],
  )

  // --- Alocação manual (Fase 2) ---
  // A busca é SEMPRE escopada à filial do adiantamento — o priCod não é único entre
  // filiais (ex.: "523" filial 4 = ZHEJIANG VOB, "523" filial 6 = outra empresa).
  const buscarAloc = React.useCallback(
    async (priCodArg?: string, filCodArg?: number) => {
      const priCod = (priCodArg ?? buscaProcesso).trim()
      const filCod = filCodArg ?? alocando?.filCod
      if (!priCod || filCod == null) return
      setBuscandoInv(true)
      try {
        // Passa o docCod do adiantamento → o `jaAlocado` de cada invoice exclui
        // este adto, refletindo o disponível real da invoice compartilhada (N:M).
        setInvoicesBuscadas(await buscarInvoicesPorProcesso(priCod, filCod, alocando?.docCod))
        setInvoiceAloc('')
      } catch {
        setInvoicesBuscadas([])
        toast.error('Falha ao buscar invoices no Conexos.')
      } finally {
        setBuscandoInv(false)
      }
    },
    [buscaProcesso, alocando],
  )

  const abrirAlocar = React.useCallback(
    (p: PermutaPendente) => {
      setAlocando(p)
      setInvoiceAloc('')
      setValorAloc('')
      setInvoicesBuscadas(null)
      // Múltiplas/cross-over = MESMO processo → pré-preenche e já busca o próprio
      // processo. Cross-process casa com OUTRO processo → deixa em branco.
      const priProprio = p.tipoPermuta !== 'cross-process' ? p.detalhe?.priCod : undefined
      setBuscaProcesso(priProprio ?? '')
      if (priProprio) void buscarAloc(priProprio, p.filCod)
    },
    [buscarAloc],
  )

  const adicionarAloc = React.useCallback(async () => {
    if (!alocando || !invoiceAloc) return
    const inv = invoicesBuscadas?.find((i) => i.docCod === invoiceAloc)
    if (!inv) return
    const valor = parseBrl(valorAloc)
    if (!(Number.isFinite(valor) && valor > 0)) {
      toast.error('Informe um valor a alocar válido.')
      return
    }
    setSalvandoAloc(true)
    try {
      await criarAlocacao(alocando.docCod, {
        invoiceDocCod: inv.docCod,
        invoicePriCod: inv.priCod,
        valorAlocado: valor,
      })
      toast.success(`Alocado ${formatNumber(valor)} na invoice ${inv.docCod}.`)
      setInvoiceAloc('')
      setValorAloc('')
      await load()
    } catch (err) {
      if (err instanceof AlocacaoExcedeSaldoError) {
        toast.warning(err.message)
      } else {
        toast.error(`Falha ao alocar${err instanceof Error ? ` — ${err.message}` : ''}.`)
      }
    } finally {
      setSalvandoAloc(false)
    }
  }, [alocando, invoiceAloc, invoicesBuscadas, valorAloc, load])

  const removerAloc = React.useCallback(
    async (invoiceDocCod: string) => {
      if (!alocando) return
      try {
        await removerAlocacao(alocando.docCod, invoiceDocCod)
        toast.success(`Alocação da invoice ${invoiceDocCod} removida.`)
        await load()
      } catch (err) {
        toast.error(`Falha ao remover${err instanceof Error ? ` — ${err.message}` : ''}.`)
      }
    },
    [alocando, load],
  )

  // --- Reconciliação / baixa no ERP fin010 (Fase 3, ADR-0013) ---
  // Abre o modal SEMPRE em dry-run primeiro: o backend monta/loga o payload sem POST
  // (preview do borderô). A execução real é gated server-side (CONEXOS_WRITE_ENABLED +
  // CONEXOS_DRY_RUN) — o botão "Executar baixa" só age de verdade quando o backend permite.
  const [reconcilAdto, setReconcilAdto] = React.useState<PermutaPendente | null>(null)
  const [reconcilResult, setReconcilResult] = React.useState<ReconciliarResult | null>(null)
  const [reconcilLoading, setReconcilLoading] = React.useState(false)
  // Data do borderô (YYYY-MM-DD). Default = data da D.I/DUIMP; o analista ajusta quando o período
  // contábil da D.I está fechado (ERP recusa com DATA_BLOQUEADA_PELA_CONTABILIDADE).
  const [reconcilData, setReconcilData] = React.useState('')

  const abrirReconciliar = React.useCallback(async (p: PermutaPendente) => {
    setReconcilAdto(p)
    setReconcilResult(null)
    setReconcilData(
      p.detalhe?.declaracao?.dataBase?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    )
    setReconcilLoading(true)
    try {
      const result = await reconciliarAdiantamento(p.docCod, { dryRun: true })
      setReconcilResult(result)
    } catch (err) {
      toast.error(`Falha no preview da baixa${err instanceof Error ? ` — ${err.message}` : ''}.`)
      setReconcilAdto(null)
    } finally {
      setReconcilLoading(false)
    }
  }, [])

  const executarReconciliar = React.useCallback(async () => {
    if (!reconcilAdto) return
    setReconcilLoading(true)
    try {
      // Data do borderô escolhida pelo analista (UTC midnight epoch-ms).
      const [y, m, d] = reconcilData.split('-').map(Number)
      const dataMovto =
        y && m && d ? Date.UTC(y, m - 1, d) : undefined
      // Idempotência é POR ESTADO DA ALOCAÇÃO (server-side, via atualizado_em): a mesma alocação
      // já baixada NÃO relança; re-alocar (ou adicionar nova) habilita um novo lançamento.
      const result = await reconciliarAdiantamento(reconcilAdto.docCod, {
        dryRun: false,
        ...(dataMovto !== undefined ? { dataMovto } : {}),
      })
      setReconcilResult(result)
      if (result.dryRun) {
        toast.info('Escrita desabilitada no servidor (dry-run). Payload validado, sem baixa real.')
      } else {
        const ok = result.resultados.filter((r) => r.status === 'settled').length
        const erros = result.resultados.filter((r) => r.status === 'error').length
        if (erros > 0) toast.error(`${erros} baixa(s) falharam — veja o detalhe.`)
        if (ok > 0)
          toast.success(
            `${ok} baixa(s) no borderô ${result.borCod} (EM CADASTRO). Revise e aprove em Borderôs.`,
          )
        await load()
      }
    } catch (err) {
      toast.error(`Falha ao executar a baixa${err instanceof Error ? ` — ${err.message}` : ''}.`)
    } finally {
      setReconcilLoading(false)
    }
  }, [reconcilAdto, reconcilData, load])

  // Reflete os dados frescos no modal de alocação após cada load().
  const alocandoAtual =
    alocando != null
      ? ((data?.pendentes ?? []).find((p) => p.docCod === alocando.docCod) ?? alocando)
      : null

  // Invoices elegíveis p/ alocação: precisam ter D.I E a MESMA moeda negociada do
  // adiantamento (não dá pra permutar USD contra invoice em BRL — moedas distintas).
  const moedaAdtoAloc = alocandoAtual ? moedaCodigo(alocandoAtual.moeda) : ''
  const invoicesElegiveis = (invoicesBuscadas ?? []).filter(
    (i) => i.temDi && moedaCodigo(i.moeda ?? 'USD') === moedaAdtoAloc,
  )
  const invoicesOcultadas = (invoicesBuscadas?.length ?? 0) - invoicesElegiveis.length

  // Invoice selecionada no modal → aviso de quanto OUTROS adiantamentos já
  // consumiram dela (N:M) e o disponível restante (espelha o teto do backend).
  const invoiceSelecionada = invoicesElegiveis.find((i) => i.docCod === invoiceAloc)
  const jaAlocadoInvoice = invoiceSelecionada?.jaAlocado ?? 0
  const dispInvoice =
    invoiceSelecionada?.valorMoedaNegociada != null
      ? invoiceSelecionada.valorMoedaNegociada - jaAlocadoInvoice
      : null
  // Máximo alocável NESTA invoice = menor entre o saldo do adto e o disponível da invoice.
  const maxAlocavel = Math.min(
    alocandoAtual?.saldoRestante ?? Number.POSITIVE_INFINITY,
    dispInvoice ?? Number.POSITIVE_INFINITY,
  )

  // Filiais distintas presentes nos dados (para o seletor de filial). UNIÃO de adiantamentos E
  // invoices: filiais que só têm invoice (sem adiantamento PROFORMA) — ex.: filial 6 — também precisam
  // ser selecionáveis, senão suas invoices ficam visíveis em "Todas as filiais" mas impossíveis de filtrar.
  const filiais = React.useMemo(() => {
    const s = new Set<number>()
    for (const p of data?.pendentes ?? []) s.add(p.filCod)
    for (const i of data?.invoicesEmAberto ?? []) s.add(i.filCod)
    return [...s].sort((a, b) => a - b)
  }, [data])

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

  // Busca por CLIENTE (importador) — preferência dos analistas; também casa exportador como fallback.
  const expBusca = filtroExportador.trim().toLowerCase()
  const casaBusca = (cliente?: string, exportador?: string) =>
    expBusca === '' ||
    (cliente ?? '').toLowerCase().includes(expBusca) ||
    (exportador ?? '').toLowerCase().includes(expBusca)
  const pendentesFiltrados = (data?.pendentes ?? []).filter(
    (p) =>
      (filtro === 'todos' || p.status === filtro) &&
      (filtroFilial === 'todas' || String(p.filCod) === filtroFilial) &&
      casaBusca(p.importador, p.exportador),
  )
  // "Casada" = invoice cujo processo (priCod) tem adiantamento pendente — a visão pré-universo.
  const priCodsComAdto = new Set(
    (data?.pendentes ?? []).map((p) => p.detalhe?.priCod).filter(Boolean) as string[],
  )
  // Invoices em aberto (vista 'invoices') — filtros de filial/cliente + Todas vs. Só casadas.
  const invoicesFiltradas = (data?.invoicesEmAberto ?? []).filter(
    (i) =>
      (filtroFilial === 'todas' || String(i.filCod) === filtroFilial) &&
      casaBusca(i.importador, i.exportador) &&
      (filtroInvoiceTipo === 'todas' || (i.priCod != null && priCodsComAdto.has(i.priCod))),
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

  // Listas-base por tipo de permuta (sem filtro de filial — cada aba tem o SEU
  // próprio filtro + paginação via useTabelaFiltro). Os contadores das abas usam
  // estas listas completas.
  const casamentoManualBase = (data?.pendentes ?? []).filter(
    (p) => p.status === 'casamento-manual',
  )
  //  - múltiplas  = 1 adiantamento → N invoices (mesmo processo).
  //  - cross-over = N adiantamentos ↔ M invoices (mesmo processo).
  const multiplas = casamentoManualBase.filter((p) => p.tipoPermuta === 'multiplas')
  const crossOver = casamentoManualBase.filter((p) => p.tipoPermuta === 'cross-over')
  // Cross-process = cliente-filtro (invoice em OUTRO processo) — alocação manual.
  const crossProcess = (data?.pendentes ?? []).filter((p) => p.status === 'permuta-manual')
  // Casamentos automáticos (sugeridos).
  const casamentosSugeridos = data?.casamentos ?? []

  // Resumo do lote de automáticas (para o diálogo de confirmação do botão "Executar"):
  // adiantamentos ainda SEM borderô vinculado (executáveis) + total a ser usado. Cobre TODAS as
  // automáticas (ignora filtros da tela) — o backend reconcilia o mesmo conjunto.
  const loteResumo = React.useMemo(() => {
    // Pendentes = adtos das automáticas SEM borderô vinculado e não-processados. Dedup por docCod.
    const vistos = new Set<string>()
    const pendentes: { docCod: string; valorASerUsado?: number; moeda?: string }[] = []
    for (const c of casamentosSugeridos) {
      for (const a of c.adiantamentos) {
        if (statusPorAdto[a.docCod] || a.processamentoStatus === 'processado') continue
        if (vistos.has(a.docCod)) continue
        vistos.add(a.docCod)
        pendentes.push(a)
      }
    }
    // Próximo lote = os primeiros LOTE_MAX pendentes (o backend capa no mesmo número).
    const proximos = pendentes.slice(0, LOTE_MAX)
    const totalUsd = proximos.reduce((s, a) => s + (a.valorASerUsado ?? 0), 0)
    return {
      casos: casamentosSugeridos.length,
      adtos: pendentes.length,
      proximosN: proximos.length,
      proximosDocCods: proximos.map((a) => a.docCod),
      totalUsd,
      moeda: proximos[0]?.moeda ?? 'USD',
    }
  }, [casamentosSugeridos, statusPorAdto])

  // Regra 2026-06-24 — múltiplas AUTOMÁTICAS (adto cobre todas as invoices, Σ ≤ adto) já vêm como
  // CASAMENTOS sintéticos do backend (pré-distribuídos) → aparecem na tabela de casamentos da aba
  // Automáticas, com "Processar", como um caso simples. Aqui só tiramos elas da aba Múltiplas
  // (manuais = Σ invoices > adto). Cross-over e cross-process continuam separados.
  const multiplasManuais = multiplas.filter((p) => p.autoElegivel !== true)

  // EXECUTADO = adiantamento já tem borderô vinculado (aguardando finalização OU finalizado). Estes
  // SAEM das abas de trabalho e vão para a aba "Histórico" — as abas de trabalho mostram só o que falta
  // processar/alocar/baixar (deixa de poluir com o que já foi permutado).
  const adtoExecutado = (docCod: string): boolean => statusPorAdto[docCod] !== undefined
  // Um casamento (Automáticas) ainda é "de trabalho" enquanto tiver ALGUM adiantamento sem borderô.
  const casamentoTrabalho = (c: CasamentoSugerido): boolean =>
    c.adiantamentos.some((a) => !adtoExecutado(a.docCod))

  // Manual (Múltipla/Cross-over/Cross-process): só SAI da aba de trabalho quando TOTALMENTE permutado —
  // tem borderô E não sobra saldo a permutar (saldoRestante ≈ 0). Baixa PARCIAL (sobrou saldo p/ alocar
  // mais invoices) CONTINUA na aba; o que foi lançado vai pra Borderôs + Histórico. Cancelar remove o
  // vínculo → reaparece (igual às automáticas). saldoRestante = saldo negociado − Σ alocações (as
  // alocações persistem após a baixa; o saldo do adto só zera de fato quando tudo é alocado).
  const SALDO_TOL = 1 // tolerância (moeda negociada) p/ ruído de centavos
  const permutaManualCompleta = (p: PermutaPendente): boolean =>
    adtoExecutado(p.docCod) && p.saldoRestante !== undefined && p.saldoRestante <= SALDO_TOL

  const casamentosTrabalho = casamentosSugeridos.filter(casamentoTrabalho)
  const multiplasTrabalho = multiplasManuais.filter((p) => !permutaManualCompleta(p))
  const crossOverTrabalho = crossOver.filter((p) => !permutaManualCompleta(p))
  const crossProcessTrabalho = crossProcess.filter((p) => !permutaManualCompleta(p))

  // Filtro (filial + busca) + paginação por aba — só as NÃO executadas.
  const abaSimples = useTabelaFiltro(
    casamentosTrabalho,
    (c) => c.invoice.filCod,
    (c) => `${c.priCod} ${c.invoice.importador ?? ''} ${c.invoice.exportador} ${c.invoice.referencia ?? ''}`,
  )
  const abaMultiplas = useTabelaFiltro(
    multiplasTrabalho,
    (p) => p.filCod,
    (p) => `${p.docCod} ${p.importador ?? ''} ${p.exportador}`,
  )
  const abaCrossOver = useTabelaFiltro(
    crossOverTrabalho,
    (p) => p.filCod,
    (p) => `${p.docCod} ${p.importador ?? ''} ${p.exportador}`,
  )
  const abaCrossProcess = useTabelaFiltro(
    crossProcessTrabalho,
    (p) => p.filCod,
    (p) => `${p.docCod} ${p.importador ?? ''} ${p.exportador}`,
  )

  // HISTÓRICO — tudo que já foi executado (tem borderô), unificado das 4 categorias. Read-only: as
  // ações (aprovar/cancelar/estornar) ficam na aba Borderôs. Ordem: aguardando aprovação no topo,
  // finalizadas no fundo; dentro de cada grupo, borderô mais recente primeiro.
  const historico: ItemHistorico[] = []
  for (const c of casamentosSugeridos) {
    for (const a of c.adiantamentos) {
      const v = statusPorAdto[a.docCod]
      if (!v) continue
      historico.push({
        key: `auto-${a.docCod}-${v.borCod}`,
        tipo: 'Automática',
        filCod: c.invoice.filCod,
        priCod: c.priCod,
        cliente: c.invoice.importador ?? '',
        exportador: c.invoice.exportador,
        adtoDocCod: a.docCod,
        // `valorASerUsado` zera quando a automática FINALIZA (a invoice foi abatida). Nesse caso usa o
        // valor negociado do PRÓPRIO adiantamento (estável), pra não mostrar 0 no histórico.
        valor:
          (a.valorASerUsado ?? 0) > 0
            ? a.valorASerUsado
            : (pendenteByDocCod.get(a.docCod)?.valorMoedaNegociada ?? a.valorASerUsado ?? null),
        moeda: a.moeda ?? c.invoice.moeda,
        borCod: v.borCod,
        finalizado: v.permutaStatus === 'finalizado',
        busca: `${c.priCod} ${c.invoice.importador ?? ''} ${a.docCod} ${v.borCod}`,
      })
    }
  }
  const pushPendentesHistorico = (lista: PermutaPendente[], tipo: string) => {
    for (const p of lista) {
      const v = statusPorAdto[p.docCod]
      if (!v) continue
      historico.push({
        key: `${tipo}-${p.docCod}-${v.borCod}`,
        tipo,
        filCod: p.filCod,
        priCod: p.detalhe?.priCod ?? '',
        cliente: p.importador ?? '',
        exportador: p.exportador,
        adtoDocCod: p.docCod,
        // "Só o que foi lançado": soma das alocações (o que entrou no borderô), não o adto inteiro.
        // Sem alocações detalhadas, cai no valor negociado do adto.
        valor:
          p.alocacoes && p.alocacoes.length > 0
            ? p.alocacoes.reduce((s, al) => s + al.valorAlocado, 0)
            : p.valorMoedaNegociada,
        moeda: p.moeda,
        borCod: v.borCod,
        finalizado: v.permutaStatus === 'finalizado',
        busca: `${p.docCod} ${p.importador ?? ''} ${v.borCod}`,
      })
    }
  }
  pushPendentesHistorico(multiplasManuais, 'Múltipla')
  pushPendentesHistorico(crossOver, 'Cross-over')
  pushPendentesHistorico(crossProcess, 'Cross-process')
  historico.sort((a, b) => (b.borCod ?? 0) - (a.borCod ?? 0)) // borderô mais recente primeiro
  const historicoOrdenado = ordenarPorEtapaPermuta(historico, (h) => [
    h.finalizado ? 'finalizada' : 'aguardando-aprovacao',
  ])
  const abaHistorico = useTabelaFiltro(
    historicoOrdenado,
    (h) => h.filCod,
    (h) => h.busca,
  )

  // Consolidação por MOEDA NEGOCIADA por card: USD como valor principal, demais
  // moedas (EUR, …) menores embaixo. Soma `valorMoedaNegociada`; itens sem
  // detalhe de moeda (ex.: não-pagos → null) não entram na soma.
  const pend = data?.pendentes ?? []
  const moedaTotais = {
    pendentes: somaPorMoeda(pend),
    elegiveis: somaPorMoeda(pend.filter((p) => p.status === 'elegivel')),
    casamentoManual: somaPorMoeda(pend.filter((p) => p.status === 'casamento-manual')),
    permutaManual: somaPorMoeda(pend.filter((p) => p.status === 'permuta-manual')),
    jaPermutado: somaPorMoeda(pend.filter((p) => p.status === 'ja-permutado')),
    bloqueadas: somaPorMoeda(pend.filter((p) => p.status === 'bloqueada')),
    invoicesEmAberto: somaPorMoeda(data?.invoicesEmAberto ?? []),
  }

  // Tabela de alocação manual (1 adto → N invoices) — compartilhada pelas abas
  // Múltiplas, Cross-over e Cross-process. Mostra saldo restante + nº de
  // alocações + ação "Alocar" (distribui o saldo em várias invoices).
  // Botão "Atualizar" por aba — rebusca gestão + status do nosso banco (mesmo `load` do header).
  const botaoAtualizar = () => (
    <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
      <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Atualizar
    </Button>
  )

  // Tabela read-only do HISTÓRICO (permutas já executadas, com borderô). As ações ficam em Borderôs.
  const renderHistoricoTable = (list: ItemHistorico[]) =>
    list.length === 0 ? (
      <EmptyState
        title="Nada no histórico ainda"
        description="Permutas executadas (com borderô criado) aparecem aqui — saem das abas de trabalho."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filial</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Processo / Cliente</TableHead>
            <TableHead>Adiantamento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Borderô</TableHead>
            <TableHead className="text-right">Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((h) => (
            <TableRow key={h.key}>
              <TableCell>{h.filCod}</TableCell>
              <TableCell>{h.tipo}</TableCell>
              <TableCell className="font-medium">
                {h.priCod}
                <div className="text-xs font-normal text-muted-foreground">
                  {h.cliente || h.exportador}
                </div>
              </TableCell>
              <TableCell>{h.adtoDocCod}</TableCell>
              <TableCell className="text-right">
                <Moeda valor={h.valor} moeda={h.moeda} />
              </TableCell>
              <TableCell>{h.borCod ?? '—'}</TableCell>
              <TableCell className="text-right">
                {h.finalizado ? (
                  <Badge className="border-transparent bg-success-subtle text-success-foreground">
                    <CheckCircle2 aria-hidden /> Finalizado
                  </Badge>
                ) : (
                  <Badge className="border-transparent bg-warning-subtle text-warning-foreground">
                    Aguardando finalização
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )

  const renderCrossProcessTable = (list: PermutaPendente[]) =>
    list.length === 0 ? (
      <EmptyState
        title="Nenhuma permuta cross-process"
        description="Não há adiantamentos de clientes-filtro aguardando alocação."
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filial</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Exportador</TableHead>
            <TableHead className="text-right">Valor Moeda Negociada</TableHead>
            <TableHead className="text-right">Saldo restante</TableHead>
            <TableHead className="text-right">Alocações</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((p) => {
            const vinculo = statusPorAdto[p.docCod]
            // Sem saldo a permutar = totalmente alocado. PARCIAL = já tem borderô MAS ainda sobra saldo
            // (baixa parcial) → Alocar/Baixar continuam liberados pra lançar o resto.
            const semSaldo = p.saldoRestante !== undefined && p.saldoRestante <= SALDO_TOL
            const parcial = vinculo !== undefined && !semSaldo
            const temAlocacoes = (p.alocacoes?.length ?? 0) > 0
            return (
              <TableRow key={p.docCod}>
                <TableCell>{p.filCod}</TableCell>
                <TableCell className="font-medium">{p.docCod}</TableCell>
                <TableCell>{p.exportador}</TableCell>
                <TableCell className="text-right">
                  <Moeda valor={p.valorMoedaNegociada} moeda={p.moeda} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.saldoRestante != null
                    ? `${formatNumber(p.saldoRestante)} ${moedaCodigo(p.moeda)}`
                    : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.alocacoes?.length ?? 0}
                </TableCell>
                <TableCell>
                  {parcial ? (
                    <Badge className="border-transparent bg-warning-subtle text-warning-foreground">
                      Parcial · borderô {vinculo?.borCod}
                    </Badge>
                  ) : (
                    <PermutaBorderoBadge vinculo={vinculo} />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      // Só desabilita quando NÃO há saldo a alocar E NÃO há alocação pra gerenciar.
                      // Totalmente alocado mas com alocações → ABRE pra poder REMOVER (o "remover" vive
                      // dentro deste modal); senão a alocação ficava presa.
                      disabled={semSaldo && !temAlocacoes}
                      title={
                        semSaldo
                          ? temAlocacoes
                            ? 'Totalmente alocado — abra para ver/remover as alocações'
                            : 'Adiantamento totalmente alocado — sem saldo a permutar'
                          : parcial
                            ? 'Alocar o saldo restante em mais invoices'
                            : 'Alocar saldo em invoices'
                      }
                      onClick={() => abrirAlocar(p)}
                    >
                      <ArrowLeftRight aria-hidden /> Alocar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(p.alocacoes?.length ?? 0) === 0}
                      title={
                        (p.alocacoes?.length ?? 0) === 0
                          ? 'Aloque ao menos uma invoice antes de baixar'
                          : parcial
                            ? `Parcial: borderô ${vinculo?.borCod} já lançado — aloque o restante e baixe de novo (o que já foi baixado é ignorado)`
                            : 'Pré-visualizar e baixar no ERP (fin010)'
                      }
                      onClick={() => abrirReconciliar(p)}
                    >
                      <Banknote aria-hidden /> Baixar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Permutas"
        subtitle="Adiantamentos PROFORMA pendentes de permuta e invoices em aberto — casamento e baixa assistidos (Frente I)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data?.geradoEm ? (
              <span
                className="mr-1 whitespace-nowrap text-xs text-muted-foreground"
                title="Conclusão da última ingestão bem-sucedida"
              >
                últ. ingestão: {formatRunWhen(data.geradoEm)}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Atualizar
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/permutas/clientes-filtro" title="Cadastrar clientes para permuta manual">
                <Users aria-hidden /> Clientes filtro
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/permutas/borderos" title="Gestão de borderôs (revisão / status no ERP)">
                <Banknote aria-hidden /> Borderôs
              </Link>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  title="Exportar os relatórios do painel para Excel (.xlsx)"
                  disabled={exportando !== null}
                >
                  <Download aria-hidden /> Exportar
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" aria-labelledby="exportar-titulo" className="w-72 p-1">
                <p
                  id="exportar-titulo"
                  className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  Exportar para Excel (.xlsx)
                </p>
                {RELATORIOS_DISPONIVEIS.map((r) => (
                  <button
                    key={r.tipo}
                    type="button"
                    onClick={() => void exportar(r.tipo, r.label)}
                    disabled={exportando !== null}
                    title={r.descricao}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {exportando === r.tipo ? (
                      <Spinner className="size-4 shrink-0" aria-hidden />
                    ) : (
                      <Download className="size-4 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{r.label}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              onClick={abrirIngestao}
              title="Rodar a ingestão de dados do Conexos agora (entre os horários do cron)"
            >
              <DatabaseZap aria-hidden /> Ingestão de dados
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
          {/* Topo = RESUMO (contadores). Os tipos de permuta (simples/múltiplas/
              cross-over/cross-process) viram abas na área de trabalho abaixo. */}
          <KPIGrid columns={4}>
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
              color="info"
              label="Invoices em aberto"
              value={data.totais.invoicesEmAberto}
              footer={<KpiFooter totais={moedaTotais.invoicesEmAberto}>finalizadas, a casar</KpiFooter>}
              tooltip="Ver as invoices em aberto (com detalhes)"
              active={vista === 'invoices'}
              onClick={verInvoices}
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
              color="danger"
              label="Bloqueadas"
              value={data.totais.bloqueadas}
              footer={<KpiFooter totais={moedaTotais.bloqueadas}>pendência de gate</KpiFooter>}
              tooltip="Filtrar a tabela pelas bloqueadas"
              active={vista === 'adiantamentos' && filtro === 'bloqueada'}
              onClick={() => mudarFiltro('bloqueada')}
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
            {vista === 'invoices' ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Invoices</span>
                <Select
                  value={filtroInvoiceTipo}
                  onValueChange={(v) => setFiltroInvoiceTipo(v as 'todas' | 'casadas')}
                >
                  <SelectTrigger className="w-56" aria-label="Filtrar invoices">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as invoices</SelectItem>
                    <SelectItem value="casadas">Só casadas (com adiantamento)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
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
            )}
            <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">Cliente</span>
              <Input
                value={filtroExportador}
                onChange={(e) => mudarExportador(e.target.value)}
                placeholder="Buscar cliente…"
                aria-label="Filtrar por cliente"
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
                      <TableHead>Referência Externa</TableHead>
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
                            <TableCell className="font-medium">{inv.referencia}</TableCell>
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
                                  <Campo label="Data de emissão">{fmtData(inv.dataEmissao)}</Campo>
                                  <Campo label="Cliente" className="sm:col-span-2">
                                    {inv.importador ?? '—'}
                                  </Campo>
                                  <Campo label="Exportador" className="sm:col-span-2">
                                    {inv.exportador}
                                  </Campo>
                                  <Campo label="Filial">{inv.filCod}</Campo>
                                  <Campo label="Valor (face)">
                                    {inv.valorBrl != null
                                      ? `R$ ${formatNumber(inv.valorBrl)}`
                                      : '—'}
                                  </Campo>
                                  <Campo label="Valor moeda negociada">
                                    <Moeda valor={inv.valorMoedaNegociada} moeda={inv.moeda} />
                                  </Campo>
                                  <Campo label="Taxa">
                                    {inv.taxa != null ? fmtTaxa(inv.taxa) : '—'}
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
                      <TableHead>Referência Externa</TableHead>
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
                      // Progresso de pagamento (ADR-0006): % pago + quanto falta —
                      // exibido nos bloqueados por pagamento parcial (`nao-pago`).
                      const prog = progressoPagamento(d?.valorTotal, d?.valorAberto, taxa)
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
                            <TableCell className="font-medium">{p.referencia}</TableCell>
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
                                  <Campo label="Cliente">{p.importador ?? '—'}</Campo>
                                  <Campo label="Exportador">{p.exportador}</Campo>
                                  <Campo label="Data de emissão">{fmtData(d?.dataEmissao)}</Campo>
                                  <Campo label="Pago">{d?.pago ? 'Sim' : 'Não'}</Campo>
                                  {prog ? (
                                    <Campo label="Progresso de pagamento">
                                      {prog.percentPago}% pago
                                      <div className="text-xs font-normal text-muted-foreground">
                                        falta R$ {formatNumber(prog.faltaBrl)}
                                        {prog.faltaUsd != null
                                          ? ` (≈ ${formatNumber(prog.faltaUsd)} ${moedaCodigo(p.moeda)})`
                                          : ''}
                                      </div>
                                    </Campo>
                                  ) : null}
                                  <Campo label="Valor (face)">
                                    {p.valorBrl != null ? `R$ ${formatNumber(p.valorBrl)}` : '—'}
                                  </Campo>
                                  <Campo label="Valor moeda negociada">
                                    <Moeda valor={p.valorMoedaNegociada} moeda={p.moeda} />
                                  </Campo>
                                  <Campo
                                    label={
                                      !invCasada && p.candidatas && p.candidatas.length > 0
                                        ? 'Invoices candidatas (N:M)'
                                        : 'Invoice casada'
                                    }
                                    className={
                                      !invCasada && p.candidatas && p.candidatas.length > 0
                                        ? 'sm:col-span-2'
                                        : undefined
                                    }
                                  >
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
                                    ) : p.candidatas && p.candidatas.length > 0 ? (
                                      <div className="space-y-0.5">
                                        {p.candidatas.map((cand) => (
                                          <div key={cand.docCod}>
                                            <span className="text-muted-foreground">
                                              {cand.docCod}
                                            </span>{' '}
                                            ·{' '}
                                            <Moeda
                                              valor={cand.valorMoedaNegociada}
                                              moeda={cand.moeda}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      '—'
                                    )}
                                  </Campo>
                                  <Campo label="Saldo a permutar">
                                    {saldoNeg != null ? (
                                      <>
                                        {formatNumber(saldoNeg)} {moedaCodigo(p.moeda)}
                                        {saldoBrl != null ? (
                                          <div className="text-xs font-normal text-muted-foreground">
                                            R$ {formatNumber(saldoBrl)}
                                          </div>
                                        ) : null}
                                      </>
                                    ) : saldoBrl != null ? (
                                      `R$ ${formatNumber(saldoBrl)}`
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
                                {/* Alocação manual cross-process (Fase 2) — só permuta-manual. */}
                                {p.status === 'permuta-manual' ? (
                                  <div className="mt-3 rounded-md border bg-background/60 px-3 py-2">
                                    <div className="mb-1 flex items-center justify-between">
                                      <span className="text-xs font-medium text-foreground">
                                        Alocação manual (cross-process)
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        Saldo restante:{' '}
                                        {p.saldoRestante != null
                                          ? `${formatNumber(p.saldoRestante)} ${moedaCodigo(p.moeda)}`
                                          : '—'}
                                      </span>
                                    </div>
                                    {p.alocacoes && p.alocacoes.length > 0 ? (
                                      <ul className="mb-2 space-y-0.5 text-xs text-muted-foreground">
                                        {p.alocacoes.map((al) => (
                                          <li key={al.invoiceDocCod}>
                                            invoice {al.invoiceDocCod}
                                            {al.invoicePriCod ? ` (proc ${al.invoicePriCod})` : ''} ·{' '}
                                            {formatNumber(al.valorAlocado)} {moedaCodigo(al.moeda ?? p.moeda)}
                                            {al.variacaoClassificacao && al.variacaoResultado != null
                                              ? ` · ${al.variacaoClassificacao} R$ ${formatNumber(al.variacaoResultado)}`
                                              : ''}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="mb-2 text-xs text-muted-foreground">
                                        Nenhuma alocação ainda.
                                      </p>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => abrirAlocar(p)}
                                    >
                                      <ArrowLeftRight aria-hidden /> Alocar invoice
                                    </Button>
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

          {/* Aviso: processamento bloqueado até o write-back no Conexos. */}
          {!PROCESSAMENTO_HABILITADO ? (
            <div className="rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-foreground">
              <strong>Processamento temporariamente indisponível.</strong> A baixa/lançamento das
              permutas está bloqueado até a integração de publicação (write-back) no Conexos. Você
              pode revisar os casamentos, valores e a variação cambial — o lançamento será
              habilitado quando a escrita dos dados no Conexos estiver pronta.
            </div>
          ) : null}

          {/* Casamento — sugerido (auto 1:N) × manual (N:M), alternados por aba */}
          <Card>
            <Tabs
              defaultValue="automaticas"
              onValueChange={(v) => {
                // Auto-reload ao abrir uma aba de trabalho/histórico: rebusca os vínculos (status) do
                // NOSSO banco — é o que move as linhas entre trabalho/histórico e atualiza os badges.
                // (A aba Borderôs já se recarrega sozinha ao montar.)
                if (v !== 'borderos') void carregarStatus()
              }}
            >
              <CardHeader>
                <TabsList>
                  <TabsTrigger value="automaticas">
                    <ArrowLeftRight className="size-4" aria-hidden /> Automáticas (
                    {casamentosTrabalho.length})
                  </TabsTrigger>
                  <TabsTrigger value="multiplas">
                    <Layers className="size-4" aria-hidden /> Múltiplas ({multiplasTrabalho.length})
                  </TabsTrigger>
                  <TabsTrigger value="cross-over">
                    <Layers className="size-4" aria-hidden /> Cross-over ({crossOverTrabalho.length})
                  </TabsTrigger>
                  <TabsTrigger value="cross-process">
                    <ArrowLeftRight className="size-4" aria-hidden /> Cross-process (
                    {crossProcessTrabalho.length})
                  </TabsTrigger>
                  <TabsTrigger value="borderos">
                    <Banknote className="size-4" aria-hidden /> Borderôs
                  </TabsTrigger>
                  <TabsTrigger value="historico">
                    <CheckCircle2 className="size-4" aria-hidden /> Histórico ({historico.length})
                  </TabsTrigger>
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="multiplas" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>1 adiantamento → N invoices</strong> (mesmo processo) onde a soma das
                    invoices <strong>ultrapassa</strong> o saldo do adiantamento — exige o analista
                    decidir a distribuição. Escolha a invoice e o valor a abater.
                  </p>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <FiltroBarra aba={abaMultiplas} buscaPlaceholder="Buscar código ou cliente…" />
                    {botaoAtualizar()}
                  </div>
                  {renderCrossProcessTable(abaMultiplas.slice)}
                  <Paginacao aba={abaMultiplas} />
                </TabsContent>

                <TabsContent value="cross-over" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>N adiantamentos ↔ M invoices</strong> (mesmo processo): vários
                    adiantamentos e várias invoices se cruzam. Você decide cada ligação e o valor.
                  </p>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <FiltroBarra aba={abaCrossOver} buscaPlaceholder="Buscar código ou cliente…" />
                    {botaoAtualizar()}
                  </div>
                  {renderCrossProcessTable(abaCrossOver.slice)}
                  <Paginacao aba={abaCrossOver} />
                </TabsContent>

                <TabsContent value="cross-process" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Cliente-filtro</strong>: o adiantamento casa com invoices de{' '}
                    <strong>outro processo</strong>. Busque a invoice pelo número do processo e
                    distribua o valor (a invoice precisa ter D.I/DUIMP).
                  </p>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <FiltroBarra
                      aba={abaCrossProcess}
                      buscaPlaceholder="Buscar código ou cliente…"
                    />
                    {botaoAtualizar()}
                  </div>
                  {renderCrossProcessTable(abaCrossProcess.slice)}
                  <Paginacao aba={abaCrossProcess} />
                </TabsContent>

                <TabsContent value="automaticas" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Automáticas</strong>: casamento direto (1 invoice ← N adiantamentos) e
                    múltiplas onde o adiantamento <strong>cobre todas as invoices</strong> do processo
                    (adto ≥ Σ invoices) — já vêm distribuídas (adto → cada invoice). Use o Processar
                    para uma a uma, ou <strong>Executar</strong> para criar todos os borderôs de uma vez.
                  </p>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <FiltroBarra aba={abaSimples} buscaPlaceholder="Buscar processo ou cliente…" />
                    <div className="flex items-end gap-2">
                      {botaoAtualizar()}
                      <Button
                        onClick={() => setConfirmLoteOpen(true)}
                        disabled={
                          !PROCESSAMENTO_HABILITADO || executandoLote || loteResumo.adtos === 0
                        }
                        title={`Executar as próximas ${loteResumo.proximosN} automáticas (lotes de até ${LOTE_MAX}; cria os borderôs no ERP)`}
                      >
                        {executandoLote ? <Spinner aria-hidden /> : <Play aria-hidden />}
                        Executar próximas {loteResumo.proximosN}
                        {loteResumo.adtos > loteResumo.proximosN ? ` de ${loteResumo.adtos}` : ''}
                      </Button>
                    </div>
                  </div>
                  {abaSimples.total === 0 ? (
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
                      <TableHead className="text-right">Saldo restante</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {abaSimples.slice.map((c, g) => {
                      const abertaInv = invoiceExpandida === c.invoice.docCod
                      const totalUsado = c.adiantamentos.reduce(
                        (s, a) => s + (a.valorASerUsado ?? 0),
                        0,
                      )
                      const moedaGrupo = c.adiantamentos[0]?.moeda ?? c.invoice.moeda
                      const sep = g > 0 ? 'border-t-2 border-border' : ''
                      // "Processado" = já tem borderô vinculado (aguardando finalização ou finalizado).
                      // Sem vínculo no statusPorAdto → ainda pendente (executável).
                      const pendentesGrupo = c.adiantamentos.filter((a) => !statusPorAdto[a.docCod])
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
                              colSpan={3}
                              className="text-right text-xs text-muted-foreground"
                            >
                              {c.adiantamentos.length} adiantamento
                              {c.adiantamentos.length !== 1 ? 's' : ''} · usa{' '}
                              {formatNumber(totalUsado)} {moedaCodigo(moedaGrupo)}
                            </TableCell>
                            <TableCell className="text-right">
                              {todosProcessados ? (
                                <PermutaBorderoBadge
                                  vinculo={statusPorAdto[c.adiantamentos[0]?.docCod ?? '']}
                                />
                              ) : c.adiantamentos.length > 0 ? (
                                <Button
                                  size="sm"
                                  disabled={
                                    !PROCESSAMENTO_HABILITADO ||
                                    processando === c.invoice.docCod
                                  }
                                  title={
                                    !PROCESSAMENTO_HABILITADO
                                      ? 'Indisponível — aguardando write-back no Conexos'
                                      : undefined
                                  }
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
                              <TableCell colSpan={7} className="py-4">
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                                  <Campo label="Invoice (código)">{c.invoice.docCod}</Campo>
                                  <Campo label="Referência">{c.invoice.referencia}</Campo>
                                  <Campo label="Cliente">{c.invoice.importador ?? '—'}</Campo>
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
                              <TableCell colSpan={7} className="text-sm text-muted-foreground">
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
                                <TableCell className="text-right text-muted-foreground">
                                  {adto.saldoRestante != null
                                    ? `${formatNumber(adto.saldoRestante)} ${moedaCodigo(adto.moeda)}`
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <PermutaBorderoBadge vinculo={statusPorAdto[adto.docCod]} />
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
                  <Paginacao aba={abaSimples} />
                </TabsContent>

                {/* Borderôs in-place (lazy: o Radix só monta o conteúdo da aba ativa). */}
                <TabsContent value="borderos">
                  <BorderosPanel embedded />
                </TabsContent>

                <TabsContent value="historico" className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    <strong>Histórico</strong>: permutas já executadas (borderô criado) — saíram das
                    abas de trabalho para não poluir. Read-only; aprovar/cancelar é na aba{' '}
                    <strong>Borderôs</strong>. Aguardando finalização no topo, finalizadas no fundo.
                  </p>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <FiltroBarra aba={abaHistorico} buscaPlaceholder="Buscar processo, cliente ou borderô…" />
                    {botaoAtualizar()}
                  </div>
                  {renderHistoricoTable(abaHistorico.slice)}
                  <Paginacao aba={abaHistorico} />
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
                <Button
                  disabled={!PROCESSAMENTO_HABILITADO}
                  title={
                    !PROCESSAMENTO_HABILITADO
                      ? 'Indisponível — aguardando write-back no Conexos'
                      : undefined
                  }
                  onClick={() => void confirmarProcessamento()}
                >
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

          {/* Confirmação do lote — "Executar todas" as automáticas de uma vez */}
          <Dialog open={confirmLoteOpen} onOpenChange={setConfirmLoteOpen}>
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
                <Button variant="outline" onClick={() => setConfirmLoteOpen(false)}>
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

          {/* Modal de ingestão manual de dados (ADR-0006) */}
          <Dialog
            open={ingestaoOpen}
            onOpenChange={(open) => {
              // Não fecha enquanto a ingestão está rodando (espera no modal).
              if (ingestRunning) return
              setIngestaoOpen(open)
            }}
          >
            <DialogContent size="md">
              <DialogHeader>
                <DialogTitle>Ingestão de dados</DialogTitle>
                <DialogDescription>
                  Roda a mesma pipeline do agendamento automático, sob demanda.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="rounded-md border border-warning/40 bg-warning-subtle/40 p-3 text-sm text-warning-foreground">
                  <p>
                    Esta ação lê os dados do <strong>Conexos</strong> e recalcula o painel
                    (adiantamentos, invoices, casamentos e elegibilidade). É somente leitura no
                    ERP — <strong>nada é baixado nem lançado</strong>. Pode levar alguns segundos;
                    aguarde aqui até concluir.
                  </p>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">Últimas rodadas</div>
                    {runsLoading ? <Spinner className="text-muted-foreground" /> : null}
                  </div>
                  {runsLoading && !runs ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : runs && runs.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Quem rodou</TableHead>
                          <TableHead>Quando</TableHead>
                          <TableHead className="text-right">Elegíveis</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((run) => (
                          <TableRow key={run.runId}>
                            <TableCell className="font-medium">
                              {rotuloQuemRodou(run.triggeredBy)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatRunWhen(run.finishedAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              {run.status === 'success'
                                ? run.totalElegiveis.toLocaleString('pt-BR')
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <RunStatusBadge status={run.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma rodada registrada ainda.</p>
                  )}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIngestaoOpen(false)}
                  disabled={ingestRunning}
                >
                  Fechar
                </Button>
                <Button onClick={() => void rodarIngestao()} disabled={ingestRunning}>
                  {ingestRunning ? (
                    <>
                      <Spinner /> Rodando…
                    </>
                  ) : (
                    <>
                      <DatabaseZap aria-hidden /> Rodar agora
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal de alocação manual cross-process (Fase 2) */}
          <Dialog
            open={alocando !== null}
            onOpenChange={(open) => {
              if (!open) setAlocando(null)
            }}
          >
            <DialogContent size="lg">
              <DialogHeader>
                <DialogTitle>Alocar adiantamento</DialogTitle>
                <DialogDescription>
                  Distribua o saldo a permutar em uma ou mais invoices (busque pelo número do
                  processo). A invoice precisa ter D.I/DUIMP. Rascunho — a baixa no ERP é um passo
                  posterior.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                {alocandoAtual ? (
                  <>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                      <Campo label="Adiantamento">{alocandoAtual.docCod}</Campo>
                      <Campo label="Exportador">{alocandoAtual.exportador}</Campo>
                      <Campo label="Saldo restante">
                        {alocandoAtual.saldoRestante != null
                          ? `${formatNumber(alocandoAtual.saldoRestante)} ${moedaCodigo(alocandoAtual.moeda)}`
                          : '—'}
                      </Campo>
                    </dl>

                    {alocandoAtual.alocacoes && alocandoAtual.alocacoes.length > 0 ? (
                      <div className="mt-4">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          Alocações
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Processo</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                              <TableHead className="text-right">Variação</TableHead>
                              <TableHead className="text-right">Ação</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {alocandoAtual.alocacoes.map((al) => (
                              <TableRow key={al.invoiceDocCod}>
                                <TableCell className="font-medium">{al.invoiceDocCod}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {al.invoicePriCod ?? '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatNumber(al.valorAlocado)} {moedaCodigo(al.moeda ?? alocandoAtual.moeda)}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {al.variacaoClassificacao && al.variacaoResultado != null ? (
                                    <div className="flex flex-col items-end">
                                      <span>
                                        {al.variacaoClassificacao} · R${' '}
                                        {formatNumber(al.variacaoResultado)}
                                      </span>
                                      {al.taxaAdiantamento != null && al.taxaInvoice != null ? (
                                        <span className="text-muted-foreground">
                                          {formatNumber(al.valorAlocado)} ×{' '}
                                          ({fmtTaxa(al.taxaAdiantamento)} − {fmtTaxa(al.taxaInvoice)})
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    '—'
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void removerAloc(al.invoiceDocCod)}
                                    aria-label={`Remover alocação da invoice ${al.invoiceDocCod}`}
                                  >
                                    <Ban aria-hidden />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : null}

                    <div className="mt-4 space-y-3 rounded-md border bg-background/60 px-3 py-3">
                      <div className="text-xs font-medium text-foreground">Nova alocação</div>
                      {/* Cross-process busca QUALQUER processo; múltiplas/cross-over
                          ficam TRAVADAS no próprio processo do adiantamento. */}
                      {alocandoAtual.tipoPermuta === 'cross-process' ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">Número do processo</span>
                            <Input
                              aria-label="Número do processo"
                              value={buscaProcesso}
                              onChange={(e) => setBuscaProcesso(e.target.value)}
                              placeholder="ex.: 510"
                              className="w-40"
                            />
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => void buscarAloc()}
                            disabled={buscandoInv || !buscaProcesso.trim()}
                            aria-busy={buscandoInv}
                          >
                            {buscandoInv ? <Spinner /> : null} Buscar
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Invoices do processo{' '}
                          <strong className="text-foreground">
                            {alocandoAtual.detalhe?.priCod ?? buscaProcesso}
                          </strong>{' '}
                          (mesmo processo do adiantamento).
                          {buscandoInv ? ' Carregando…' : ''}
                        </p>
                      )}

                      {invoicesBuscadas != null ? (
                        invoicesElegiveis.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {invoicesBuscadas.length === 0
                              ? 'Nenhuma invoice encontrada para esse processo.'
                              : `Nenhuma invoice elegível (em ${moedaAdtoAloc} e com D.I/DUIMP) para esse processo.`}
                          </p>
                        ) : (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">Invoice</span>
                              <Select
                                value={invoiceAloc}
                                onValueChange={setInvoiceAloc}
                                aria-label={`Selecionar invoice (em ${moedaAdtoAloc}, com D.I)`}
                              >
                                <SelectTrigger className="w-96" aria-label="Selecionar invoice">
                                  <SelectValue placeholder="Escolha uma invoice…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {invoicesElegiveis.map((i) => {
                                    const cur = moedaCodigo(i.moeda ?? 'USD')
                                    const ja = i.jaAlocado ?? 0
                                    const disp =
                                      i.valorMoedaNegociada != null
                                        ? i.valorMoedaNegociada - ja
                                        : null
                                    return (
                                      <SelectItem key={i.docCod} value={i.docCod}>
                                        {i.docCod} ·{' '}
                                        {i.valorMoedaNegociada == null
                                          ? 's/ valor'
                                          : ja > 0
                                            ? `resta ${formatNumber(disp ?? 0)} de ${formatNumber(i.valorMoedaNegociada)} ${cur}`
                                            : `${formatNumber(i.valorMoedaNegociada)} ${cur}`}
                                        {i.taxa != null ? ` · taxa ${fmtTaxa(i.taxa)}` : ''}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs text-muted-foreground">
                                Valor a alocar ({moedaCodigo(alocandoAtual.moeda)})
                              </span>
                              <MoneyInput
                                value={valorAloc}
                                onChange={setValorAloc}
                                max={maxAlocavel}
                                className="w-40"
                              />
                            </div>
                            <Button
                              onClick={() => void adicionarAloc()}
                              disabled={salvandoAloc || !invoiceAloc || !valorAloc}
                              aria-busy={salvandoAloc}
                            >
                              {salvandoAloc ? <Spinner /> : <ArrowLeftRight aria-hidden />} Adicionar
                            </Button>
                          </div>
                        )
                      ) : null}
                      {invoiceSelecionada && jaAlocadoInvoice > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Invoice {invoiceSelecionada.docCod}:{' '}
                          {formatNumber(jaAlocadoInvoice)}{' '}
                          {moedaCodigo(invoiceSelecionada.moeda ?? 'USD')} já alocado(s) por
                          outro(s) adiantamento(s)
                          {dispInvoice != null
                            ? ` · disponível ${formatNumber(dispInvoice)} ${moedaCodigo(invoiceSelecionada.moeda ?? 'USD')}`
                            : ''}
                          .
                        </p>
                      ) : null}
                      {invoicesBuscadas != null && invoicesOcultadas > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {invoicesOcultadas} invoice(s) omitida(s): sem D.I/DUIMP ou em outra moeda
                          (≠ {moedaAdtoAloc}).
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAlocando(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Baixa no ERP fin010 (Fase 3) — preview (dry-run) → executar */}
          <Dialog
            open={reconcilAdto != null}
            onOpenChange={(open) => {
              if (!open) {
                setReconcilAdto(null)
                setReconcilResult(null)
              }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Baixar permuta no ERP (fin010)</DialogTitle>
                <DialogDescription>
                  Adiantamento {reconcilAdto?.docCod} · {reconcilAdto?.exportador}. A baixa é
                  executada par a par (adiantamento → invoice) no borderô do Conexos.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Data do borderô</span>
                  <Input
                    type="date"
                    value={reconcilData}
                    onChange={(e) => setReconcilData(e.target.value)}
                    className="w-48"
                    disabled={reconcilLoading}
                  />
                  <span className="text-xs text-muted-foreground">
                    Sugerida a data da D.I/DUIMP. Ajuste se o período contábil estiver fechado.
                  </span>
                </label>

                {reconcilLoading && !reconcilResult ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Montando o preview do borderô…
                  </div>
                ) : null}

                {reconcilResult ? (
                  <>
                    {(() => {
                      const settled = reconcilResult.resultados.filter(
                        (r) => r.status === 'settled',
                      ).length
                      const skipped = reconcilResult.resultados.filter(
                        (r) => r.status === 'skipped',
                      ).length
                      const errors = reconcilResult.resultados.filter(
                        (r) => r.status === 'error',
                      ).length
                      // Tom: dry-run = warning; sucesso = success; só-skipped = neutro; erro = destructive.
                      const tone = reconcilResult.dryRun
                        ? 'border-warning/40 bg-warning-subtle text-warning-foreground'
                        : settled > 0
                          ? 'border-success/40 bg-success-subtle text-success-foreground'
                          : errors > 0
                            ? 'border-destructive/40 bg-destructive/10 text-destructive'
                            : 'border-border bg-muted text-muted-foreground'
                      return (
                        <div className={cn('rounded-md border p-3 text-sm', tone)}>
                          {reconcilResult.dryRun ? (
                            <>
                              <strong>Pré-visualização (dry-run).</strong> Nenhuma baixa foi
                              gravada no ERP.{' '}
                              {!reconcilResult.writeEnabled
                                ? 'A escrita está DESABILITADA no servidor (CONEXOS_WRITE_ENABLED=false).'
                                : 'Confira os campos abaixo antes de executar.'}
                            </>
                          ) : settled > 0 ? (
                            <>
                              <strong>Baixa executada.</strong> Borderô {reconcilResult.borCod} no
                              fin010 — situação <strong>EM CADASTRO</strong>. Para concluir, revise e{' '}
                              <strong>aprove</strong> em{' '}
                              <Link
                                href="/permutas/borderos"
                                className="font-medium underline underline-offset-2"
                              >
                                Borderôs
                              </Link>
                              .
                            </>
                          ) : skipped > 0 && errors === 0 ? (
                            <>
                              <strong>Nada a baixar.</strong> Par(es) já baixado(s) anteriormente
                              (idempotência) — nenhum borderô novo criado.
                            </>
                          ) : (
                            <>
                              <strong>Falha na baixa.</strong> Veja o detalhe por invoice abaixo.
                            </>
                          )}
                        </div>
                      )
                    })()}

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor baixado</TableHead>
                          <TableHead className="text-right">Juros (variação)</TableHead>
                          <TableHead className="text-right">Conta</TableHead>
                          <TableHead className="text-right">bxaCodSeq</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reconcilResult.resultados.map((r) => {
                          const juros = r.payload?.bxaMnyJuros
                          const conta = r.payload?.bxaCodGerJuros
                          return (
                            <TableRow key={r.invoiceDocCod}>
                              <TableCell className="font-medium">{r.invoiceDocCod}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    r.status === 'settled'
                                      ? 'default'
                                      : r.status === 'error'
                                        ? 'destructive'
                                        : 'secondary'
                                  }
                                >
                                  {r.status}
                                </Badge>
                                {r.erro ? (
                                  <span className="ml-2 text-xs text-destructive">{r.erro}</span>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {typeof r.valorBaixado === 'number'
                                  ? `${formatNumber(r.valorBaixado)} BRL`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {typeof juros === 'number' ? formatNumber(juros) : '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {typeof conta === 'number' ? conta : '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {r.bxaCodSeq ?? '—'}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </>
                ) : null}
              </DialogBody>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setReconcilAdto(null)
                    setReconcilResult(null)
                  }}
                >
                  Fechar
                </Button>
                <Button
                  disabled={reconcilLoading || reconcilResult == null}
                  onClick={executarReconciliar}
                >
                  {reconcilLoading ? <Spinner /> : <Banknote aria-hidden />} Executar baixa
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
      <KPIGrid columns={4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </KPIGrid>
      <Skeleton className="h-64" />
    </div>
  )
}
