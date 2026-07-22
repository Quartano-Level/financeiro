'use client'

import { ArrowLeftRight, Ban } from 'lucide-react'
import type { InvoiceBuscada, PermutaPendente } from '@/lib/types'
import { formatNumber } from '@/lib/utils'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fmtTaxa, moedaCodigo } from './format'
import { Campo, MoneyInput } from './ui'

/** Modal de alocação manual cross-process (Fase 2). */
export function AlocarDialog({
  alocandoAtual,
  onClose,
  buscaProcesso,
  setBuscaProcesso,
  buscarAloc,
  buscandoInv,
  invoicesBuscadas,
  invoiceAloc,
  setInvoiceAloc,
  valorAloc,
  setValorAloc,
  salvandoAloc,
  adicionarAloc,
  removerAloc,
}: {
  alocandoAtual: PermutaPendente | null
  onClose: () => void
  buscaProcesso: string
  setBuscaProcesso: (v: string) => void
  buscarAloc: () => void
  buscandoInv: boolean
  invoicesBuscadas: InvoiceBuscada[] | null
  invoiceAloc: string
  setInvoiceAloc: (v: string) => void
  valorAloc: string
  setValorAloc: (v: string) => void
  salvandoAloc: boolean
  adicionarAloc: () => void
  removerAloc: (invoiceDocCod: string) => void
}) {
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

  return (
    <Dialog
      open={alocandoAtual !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
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
                <Campo label="Exportador" clamp title={alocandoAtual.exportador}>
                  {alocandoAtual.exportador}
                </Campo>
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
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
