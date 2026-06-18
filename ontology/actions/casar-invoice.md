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
  - "PermutaCandidata recebe invoiceCasada quando há exatamente 1 INVOICE FINALIZADA; 0 → bloqueada (sem-invoice); >1 → casamento-manual (composto-nm, ADR-0005)."
  - "Nenhuma escrita no ERP (I4)."
side_effects:
  - "Leitura com298 (INVOICE FINALIZADA) por processo."
resolved-by:
  - "P0-6 — 'casada' = exatamente 1 INVOICE FINALIZADA no processo (Yuri, 2026-06-17)"
  - "P0-5 — Fatia 1 só 1:1; N:M existe/frequente (Yuri, 2026-06-17)"
  - "ADR-0005 — N:M deixa de ser bloqueada e vira estado CASAMENTO_MANUAL (4 gates ok, falta escolher invoice); escrita final = Fatia 2 (Yuri, 2026-06-18)"
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
| **exatamente 1** | casamento auto 1:1 | `invoiceCasada` preenchida → candidata segue para `ELEGIVEL` | — |
| **0** | sem invoice | `BLOQUEADA` | `sem-invoice` (aguardando emissão) |
| **múltiplas (>1)** | caso N:M (composto) | `CASAMENTO_MANUAL` (ADR-0005) | `composto-nm` / `multiplas-invoices` (informativo) |

- **Fatia 1 executa o auto 1:1** — 1 adiantamento PROFORMA ↔ 1 invoice finalizada no processo.
- Casos **N:M** (várias proformas/invoices no mesmo processo) **EXISTEM e são FREQUENTES**.
  **ADR-0005:** passaram os 4 gates, então **não são mais `bloqueada`** — vão para
  `CASAMENTO_MANUAL` (prontos para o analista escolher a invoice). A **alocação/escrita final é
  Fatia 2**.
- **Não** modelar a alocação N:M agora — `PermutaCandidata` mantém shape **1:1** no relacional; a
  invoice do N:M é resolvida na escolha do analista (Fatia 2).

## Postcondição

- 1 invoice → `invoiceCasada` preenchida (candidata pode ficar elegível, invariante I3).
- 0 → candidata **bloqueada** (`sem-invoice`); reportada, não conta como elegível.
- >1 (N:M) → candidata **`casamento-manual`** (`composto-nm` / `multiplas-invoices` informativo);
  passou os 4 gates, aguarda escolha do analista (ADR-0005). Ver
  `business-rules/elegibilidade-permuta.md` e
  `state-machines/elegibilidade-permuta-candidata.md` (taxonomia de motivos).
