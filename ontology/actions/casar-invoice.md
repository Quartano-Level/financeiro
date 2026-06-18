---
name: casarInvoice
type: action
entity: Invoice
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-17
preconditions:
  - "Adiantamento passou (ou está sendo avaliado n)os 4 gates."
  - "Sessão Conexos ativa."
postconditions:
  - "PermutaCandidata recebe invoiceCasada quando há exatamente 1 INVOICE FINALIZADA; 0 → bloqueada (sem-invoice); >1 → bloqueada (composto-nm)."
  - "Nenhuma escrita no ERP (I4)."
side_effects:
  - "Leitura com298 (INVOICE FINALIZADA) por processo."
resolved-by:
  - "P0-6 — 'casada' = exatamente 1 INVOICE FINALIZADA no processo (Yuri, 2026-06-17)"
  - "P0-5 — Fatia 1 só 1:1; N:M existe/frequente mas vai para BACKLOG como bloqueada/composto-nm (Yuri, 2026-06-17)"
---

# casarInvoice

> **Etapa 3.** Encontra a **INVOICE finalizada** do mesmo processo (`priCod`) do
> `Adiantamento` e a vincula como lado-crédito da `PermutaCandidata`.

## Reuso do ConexosClient

- `ConexosClient.listFinanceiroAPagar({ docTip: 'INVOICE', priCods: [proc], filCod })`
  → `tpdCod=128`, `vldStatus FINALIZADO`.

## Definição de "casada" (P0-6 + P0-5 — RESOLVIDO)

**"INVOICE casada" = exatamente 1 invoice FINALIZADA no processo.** Por contagem de invoices
finalizadas no processo:

| # invoices FINALIZADAS | Resultado | Estado | Motivo |
|------------------------|-----------|--------|--------|
| **exatamente 1** | casamento 1:1 | `invoiceCasada` preenchida → candidata segue para elegível | — |
| **0** | sem invoice | `BLOQUEADA` | `sem-invoice` (aguardando emissão) |
| **múltiplas (>1)** | caso N:M (composto) | `BLOQUEADA` | `composto-nm` |

- **Fatia 1 executa SOMENTE permutas SIMPLES (1:1)** — 1 adiantamento PROFORMA ↔ 1 invoice
  finalizada no processo.
- Casos **N:M** (várias proformas/invoices no mesmo processo) **EXISTEM e são FREQUENTES**, mas
  nesta feature vão para **BACKLOG**: estado `bloqueada`, motivo `composto-nm` — **reportados,
  não processados** (glossary "Pendência bloqueada").
- **Não** modelar alocação N:M agora — `PermutaCandidata` mantém shape **1:1**.

## Postcondição

- 1 invoice → `invoiceCasada` preenchida (candidata pode ficar elegível, invariante I3).
- 0 ou >1 → candidata **bloqueada** com motivo (`sem-invoice` / `composto-nm`); não conta como
  elegível, é reportada. Ver `business-rules/elegibilidade-permuta.md` e
  `state-machines/elegibilidade-permuta-candidata.md` (taxonomia de motivos).
