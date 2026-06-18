---
name: Invoice
type: entity
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
properties:
  - docCod
  - priCod
  - dataEmissao
  - valor
  - moeda
  - pago
  - exportador
relationships:
  - "Invoice N—1 Adiantamento (mesmo priCod; casamento via casarInvoice)"
  - "Invoice 1—1 PermutaCandidata (lado-crédito da candidata, quando casada)"
last_review: 2026-06-17
universality_evidence:
  - "docs/proposta/Proposta_Kavex_Columbia_Financeiro.md — Frente I (adiantamento ↔ invoice)"
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I"
  - "ontology/glossary.md — 'Invoice / Fatura'"
  - "Columbia (priCod=1153): com298 tpdCod=128"
  - "Conceito universal de comex: fatura definitiva do exportador (lado-crédito)"
---

# Invoice (Fatura)

> **Lado-crédito** da permuta: a fatura definitiva emitida pelo exportador, contra a
> qual o `Adiantamento` é reconciliado. É o documento INVOICE finalizado no Conexos.

## Definição de domínio

Uma `Invoice` é o documento financeiro definitivo do mesmo **processo** (`priCod`) do
`Adiantamento`. A permuta consiste em casar um adiantamento (débito) com sua invoice
(crédito). Nesta Fatia 1 só **lemos** a invoice e verificamos se há uma "casada" para o
processo — não há baixa/reconciliação.

## Propriedades

| Propriedade | Tipo | Imutável | Origem (wire) | Notas |
|-------------|------|----------|---------------|-------|
| `docCod` | string | sim | `com298.docCod` | Identidade do documento. |
| `priCod` | string | sim | `com298.priCod` | Código do processo — chave de casamento com o Adiantamento. |
| `dataEmissao` | Date | sim | `com298.docDtaEmissao` | Data de emissão. |
| `valor` | number | não | `com298.docMnyValor` | Valor de face (entrada do cálculo de variação cambial). |
| `moeda` | string | sim | `com298.moeEspSigla` | Moeda. |
| `pago` | boolean | não | derivado | Estado de pagamento (informativo nesta fatia). |
| `exportador` | string? | não | `com298.dpeNomPessoa` | Exibição. |

## Discriminador de tipo (INVOICE)

- `tpdCod = 128` (`TPD_INVOICE`) + `vldStatus = '3'` (FINALIZADO).

## Definição de "INVOICE casada" (P0-6 + P0-5 — RESOLVIDO)

- **"casada" = exatamente 1 INVOICE FINALIZADA no processo.**
  - **0** invoices → `PermutaCandidata` **bloqueada** (motivo `sem-invoice`, aguardando emissão).
  - **>1** invoices → caso **N:M** → **bloqueada** (motivo `composto-nm`); N:M é frequente mas
    vai para **backlog** nesta fatia (não processado). Ver `actions/casar-invoice.md`,
    `business-rules/elegibilidade-permuta.md` e a taxonomia de motivos na state-machine.

## Fonte de leitura (Conexos)

- `ConexosClient.listFinanceiroAPagar({ docTip: 'INVOICE', priCods: [proc], filCod })` → `tpdCod=128`, FINALIZADO.

## Fora de escopo (Fatia 1)

- Sem escrita. O casamento aqui é apenas para **expor** a candidata; a reconciliação é a Fatia 2.
