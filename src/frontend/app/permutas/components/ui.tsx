'use client'

import * as React from 'react'
import { ArrowLeftRight, Ban, CheckCircle2, Layers, RefreshCw } from 'lucide-react'
import type {
  PermutaBorderoVinculo,
  PermutaRun,
  ProcessamentoStatus,
  StatusElegibilidade,
} from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MoedaTotal, MOTIVO_LABEL, PROCESSAMENTO_LABEL, fmtMoeda, maskBrl, moedaCodigo, numToMask } from './format'

/** Badge de status de uma run no histórico do modal de ingestão. */
export function RunStatusBadge({ status }: { status: PermutaRun['status'] }) {
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

export function StatusBadge({ status, motivo }: { status: StatusElegibilidade; motivo?: string }) {
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

/** Badge do status de processamento (botão "Processar"). */
export function ProcessamentoBadge({ status }: { status: ProcessamentoStatus }) {
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
export function PermutaBorderoBadge({ vinculo }: { vinculo?: PermutaBorderoVinculo }) {
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

/** Valor em moeda negociada (número pt-BR) + código da moeda em tom suave.
 * `null` (valor não buscado — ex.: adiantamento não totalmente pago) → "—". */
export function Moeda({ valor, moeda }: { valor: number | null; moeda: string }) {
  if (valor == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="tabular-nums">
      {formatNumber(valor)}{' '}
      <span className="text-xs text-muted-foreground">{moedaCodigo(moeda)}</span>
    </span>
  )
}

/**
 * Input de valor monetário com máscara pt-BR (milhar `.` / centavos `,`) e botão "Máx"
 * opcional que preenche o valor total disponível. `value`/`onChange` operam na string
 * mascarada (parse com `parseBrl`).
 */
export function MoneyInput({
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
 * lado, ex.: nome longo de exportador). `className` permite col-span.
 *
 * `clamp` limita o valor a 2 linhas (`line-clamp-2`), cortando o excesso com
 * reticências — para textos livres longos (Cliente/Exportador) que senão
 * empurrariam a altura da célula. `title` expõe o texto completo no hover
 * (tooltip nativo do browser). Números/valores NÃO usam clamp (nunca estouram),
 * então a prop é opt-in por campo. */
export function Campo({
  label,
  className,
  children,
  clamp,
  title,
}: {
  label: string
  className?: string
  children: React.ReactNode
  clamp?: boolean
  title?: string
}) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        title={clamp ? title : undefined}
        className={cn('text-sm font-medium tabular-nums break-words', clamp && 'line-clamp-2')}
      >
        {children}
      </dd>
    </div>
  )
}

/** Footer de KPI: valor principal na moeda negociada (USD na frente, fonte
 * maior) + as demais moedas menores embaixo (ex.: EUR) + descrição. */
export function KpiFooter({ totais, children }: { totais: MoedaTotal[]; children: React.ReactNode }) {
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

/** Botão "Atualizar" por aba — rebusca gestão + status do nosso banco (mesmo `load` do header). */
export function BotaoAtualizar({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <RefreshCw className={cn(loading && 'animate-spin')} aria-hidden /> Atualizar
    </Button>
  )
}
