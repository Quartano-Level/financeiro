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
