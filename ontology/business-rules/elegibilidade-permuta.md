---
name: elegibilidade-permuta
type: business-rule
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
invariant: I3
related_files: []
last_review: 2026-06-18
has_canonical_test: false
resolved-by:
  - "P0-6 — 'INVOICE casada' = exatamente 1 invoice FINALIZADA no processo (Yuri, 2026-06-17)"
  - "P0-5 — Fatia 1 só 1:1; N:M → backlog bloqueado (composto-nm) (Yuri, 2026-06-17)"
  - "P0-4 — Gate 4 data-base RESOLVIDA (cdiDtaCi imp019 / dioDtaDesembaraco imp223); probe de rede 2026-06-18, filCod=2, 410 adiantamentos reais"
open-gap:
  - "gate-3-pago-via-detail (P1) — Gate 3 (TOTALMENTE PAGO) vem null no com298/list; fonte provável = endpoint de detalhe (probe 2026-06-18). Bloqueante p/ a eleição produzir ALGUMA candidata elegível."
---

# Regra: elegibilidade-permuta (4 gates + INVOICE casada)

> **Invariante I3 — Elegibilidade estrita.** Uma `PermutaCandidata` só é **elegível** quando
> passa nos **4 gates** **E** tem **INVOICE casada**. Caso contrário, é **bloqueada**.

## Enunciado

```
elegivel(candidata) ⇔
    gate1(tipo = PROFORMA)               ∧
    gate2(valorPermutar > 0)             ∧
    gate3(TOTALMENTE PAGO)               ∧
    gate4(D.I XOR DUIMP atrelada)        ∧
    invoiceCasada(candidata) presente
```

Falha em qualquer conjunto → `BLOQUEADA` (reportada, NÃO contada como falha do job).

## Gates (referência)

| Gate | Fonte | Detalhe |
|------|-------|---------|
| 1 — PROFORMA | `com298` `tpdCod=99` + filtro `docVldTipoAdto=1` (FinDocCab) | P0-3 RESOLVIDO (chave wire confirmada por probe 2026-06-18). |
| 2 — `valorPermutar > 0` | `getMnyTitPermutar(docCod)` | Saldo a permutar disponível. |
| 3 — TOTALMENTE PAGO | `isPago` (`mnyTitAberto===0`/`pago===1`) | **NOVO GAP `gate-3-pago-via-detail`:** `mnyTitAberto`/`mnyTitPago`=`null` no `com298/list` (410 reais); fonte provável = endpoint de detalhe. |
| 4 — D.I XOR DUIMP | `imp019.cdiDtaCi`/`imp223.dioDtaDesembaraco` por `priCod` | Ver `di-xor-duimp`; data-base RESOLVIDA (P0-4, probe 2026-06-18). |

## Definição de "INVOICE casada" (P0-6 + P0-5 — RESOLVIDO)

- **"INVOICE casada" = exatamente 1 invoice FINALIZADA no processo.** Por contagem:
  - **1** → casamento 1:1 → satisfaz a condição.
  - **0** → `BLOQUEADA` (motivo `sem-invoice`, aguardando emissão).
  - **>1** → `BLOQUEADA` (motivo `composto-nm` — caso N:M, backlog).
- **Fatia 1 só executa 1:1.** N:M existe e é frequente, mas vai para **backlog** (bloqueada,
  reportada, não processada). `PermutaCandidata` mantém shape **1:1**. Ver `actions/casar-invoice.md`
  e a taxonomia de motivos em `state-machines/elegibilidade-permuta-candidata.md`.

## Teste canônico (a escrever no TDD)

- `has_canonical_test: false` — caso canônico: 1 adiantamento + 1 invoice + D.I, 4 gates
  verdes → ELEGIVEL; mesma candidata sem invoice → BLOQUEADA (`sem-invoice`); com múltiplas
  invoices → BLOQUEADA (`composto-nm`). Fixado pelo TaskScoper/TDD. Âncora real: PDF processo
  `2048` (priCod=1153).
