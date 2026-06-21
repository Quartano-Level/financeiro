import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '\u2014'
  // Date-only ISO strings (YYYY-MM-DD) are parsed by `new Date()` as UTC
  // midnight; formatting in a behind-UTC timezone (e.g. Brazil, UTC-3) then
  // shifts the displayed day back by one. Parse those as a local calendar
  // date so the rendered day is timezone-independent. Strings carrying a
  // time component keep the default parsing.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(dateStr)
  if (isNaN(d.getTime())) return '\u2014'
  return d.toLocaleDateString('pt-BR')
}

export function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`
}

/** Plain pt-BR number with 2 decimals (e.g. 193.720,50) — for "Valor Moeda Negociada". */
export function formatNumber(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
}

/**
 * Progresso de pagamento de um adiantamento parcialmente pago (ADR-0006).
 * `valorTotal`/`valorAberto` vêm em BRL (`mnyTitValor`/`mnyTitAberto`). Retorna
 * `null` quando não há o que mostrar (sem total, total ≤ 0, ou nada em aberto =
 * já totalmente pago). `percentPago` é inteiro com **arredondamento para baixo**
 * (`floor`): como estes itens NÃO estão totalmente pagos, nunca deve ler "100%"
 * enquanto houver saldo em aberto (ex.: falta R$ 0,02 de R$ 20M → 99%, não 100%).
 * `faltaUsd` é `null` quando não há taxa para converter.
 */
export function progressoPagamento(
  valorTotal?: number,
  valorAberto?: number,
  taxa?: number,
): { percentPago: number; faltaBrl: number; faltaUsd: number | null } | null {
  if (valorTotal == null || valorAberto == null || valorTotal <= 0 || valorAberto <= 0) {
    return null
  }
  const percentPago = Math.floor(((valorTotal - valorAberto) / valorTotal) * 100)
  const faltaUsd = taxa != null && taxa > 0 ? valorAberto / taxa : null
  return { percentPago, faltaBrl: valorAberto, faltaUsd }
}
