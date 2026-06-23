---
name: distribuicao-simples-greedy
type: business-rule
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: implemented
status: draft
owners: [yuri]
invariant: I-Permuta-2
related_files:
  - src/backend/domain/interface/permutas/Invoice.ts
  - src/backend/domain/interface/permutas/Gestao.ts
  - src/backend/domain/service/permutas/EleicaoPermutasService.ts
  - src/backend/domain/service/permutas/IngestaoPermutasService.ts
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
  - src/frontend/app/permutas/page.tsx
last_review: 2026-06-22
has_canonical_test: true
resolved-by:
  - "ADR-0010 — distribuição greedy N:1 com teto na permuta Simples (auto-casamento parcial)"
  - "Caso real 1408 (ZNSHINE) — INVOICE 260.064, adtos 11566/5751; validado com o time (2026-06-22)"
open-gap:
  - "Residual grande num único adto (1408: 408.672) — validar com o time se vira revisão manual (ADR-0010, ponto aberto)."
---

# Regra: distribuição greedy N:1 na permuta Simples (auto-casamento parcial)

> **Invariante I-Permuta-2 (saldo da invoice) aplicada ao auto-casamento.** No casamento automático
> **1 invoice : N adiantamentos** (`tipoPermuta = simples`), a soma do valor usado pelos adiantamentos
> **nunca** pode exceder o **em-aberto vivo da invoice**. A distribuição é **greedy com teto** e o
> auto-casamento é **parcial** (residual fica em aberto). **READ-ONLY no ERP.**

## Enunciado

```
Para cada invoice casada com N adiantamentos elegíveis:
  teto      = invoice.valorAbertoNegociado ?? invoice.valorMoedaNegociada    (undefined ⇒ sem teto)
  ordem     = adiantamentos por saldoDisponivelNeg DESC,
              desempate: aging DESC, fallback dataEmissao ASC
  restante  = teto
  para cada adto em ordem:
      usado     = (restante === undefined) ? saldo : min(saldo, max(0, restante))
      restante -= usado            (quando há teto)
      variação  = calcular sobre o valor PARCIAL (usado), data-base = D.I da invoice
```

- `saldoDisponivelNeg(adto) = valorPermutar(BRL) / taxa` (fallback `valorMoedaNegociada`).
- `valorAbertoNegociado = mnyTitAberto / taxaInvoice` (via `getDetalheTitulos`); fallback
  `valorMoedaNegociada` da invoice.

## Componentes (as 4 decisões travadas — ADR-0010)

| # | Componente | Regra |
|---|------------|-------|
| 1 | **Ordenação** | Maior saldo disponível primeiro (DESC). Fecha o maior adiantamento primeiro. |
| 2 | **Desempate** | Mais antigo primeiro: `aging` DESC; fallback `dataEmissao` ASC. |
| 3 | **Teto (cap)** | Em-aberto vivo da invoice em moeda negociada (`valorAbertoNegociado`); fallback `valorMoedaNegociada`; ambos ausentes ⇒ **sem teto** (comportamento legado: saldo cheio). |
| 4 | **Residual / parcial** | Adto consumido em parte mantém `valorASerUsado` parcial; o restante fica **em aberto**. Variação recalculada sobre o **valor parcial**. |

## Casos canônicos

- **1408 (super-permuta corrigida):** INVOICE 260.064; adtos `11566`=668.736, `5751`=74.304.
  - `11566` (maior) usa **260.064** (consome o teto), residual **408.672** em aberto.
  - `5751` usa **0** (não tocado). Total = **260.064** (antes: 743.040).
- **Teto via em-aberto vivo:** com `valorAbertoNegociado` presente, o teto é o em-aberto (não o valor de
  face); sem ele, cai no fallback `valorMoedaNegociada`.
- **Desempate por aging:** dois adtos com mesmo saldo → o de **maior aging** consome primeiro.
- **Σ adiantamentos < invoice:** todos os adtos usados por inteiro; **invoice** fica parcialmente
  permutada (em-aberto remanescente).

## Fora de escopo

- **READ-ONLY no Conexos.** Corrige só o snapshot/cálculo (`permuta_casamento`, recomputado por run). A
  **baixa efetiva** no `fin010` (`reconciliarPermuta`) é a **Fase 3** (risco arquitetural #1) — não
  implementada.
- Moeda diferente continua **bloqueada** (regra existente; não se distribui USD contra invoice BRL).

## Teste canônico

`has_canonical_test: true` — cobertos em:
- `IngestaoPermutasService.test.ts`: greedy 1408; teto via em-aberto vivo; desempate por aging; Σ<invoice.
- `EleicaoPermutasService.test.ts`: `valorAbertoNegociado` + fallback.
- `GestaoPermutasService.test.ts`: `saldoRestante`.
