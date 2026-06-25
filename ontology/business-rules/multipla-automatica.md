---
name: multipla-automatica
type: business-rule
ontology_version: "0.4"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
  - src/backend/domain/service/permutas/AlocacaoPermutasService.ts
  - src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts
last_review: 2026-06-24
invariant: I-Permuta-6
has_canonical_test: true
---

# Business rule: múltipla AUTOMÁTICA (adto cobre todas as invoices do processo)

> **Vigência:** 2026-06-24 (v0.7.0, ADR-0014). DERIVADA na apresentação — **não persiste**
> estado novo no banco.

## Regra

Um adiantamento em `casamento-manual` que é o **ÚNICO** casamento-manual do seu processo
(`priCod`) — portanto `tipoPermuta = multiplas`, **não** `cross-over` — e cujo **saldo negociado
COBRE todas as invoices** em aberto do processo é promovido a **AUTOMÁTICA**:

```
autoElegivel ⟺
    a.estadoElegibilidade === 'casamento-manual'
    ∧ tipoPermuta === 'multiplas'            (1 adto casamento-manual no priCod)
    ∧ saldoNeg (USD) é conhecido
    ∧ Σ invoices do processo (USD) > 0
    ∧ saldoNeg + 1 ≥ Σ invoices do processo  (tolerância de 1 USD p/ centavos)
```

onde `saldoNeg = valorPermutar(BRL) / taxa` do adiantamento (moeda negociada).

- `Σ invoices > saldoNeg` (adto **não** cobre) → segue **manual** (aba Múltiplas, alocação à mão).
- A regra **não** se aplica a `cross-over` (>1 adto casamento-manual no processo) nem aos casamentos
  **reclassificados** por ultrapassar a invoice (ver `business-rules/reclassificacao-ultrapassa-invoice.md`).

## Onde é avaliada (file:line)

- `GestaoPermutasService.toPendente` — flag `autoElegivel`:
  `src/backend/domain/service/permutas/GestaoPermutasService.ts:322-335` (cálculo de
  `somaInvoicesProcesso` + condição `saldoNeg + 1 >= somaInvoicesProcesso`).
- `GestaoPermutasService.exporGestao` — os auto-elegíveis viram **casamentos sintéticos**
  pré-distribuídos (adto → cada invoice do processo, `valorASerUsado = valorMoedaNegociada` da
  invoice) e são expostos na aba **Automáticas** como caso simples (com "Processar"):
  `src/backend/domain/service/permutas/GestaoPermutasService.ts:144-164` (`autoCasamentos`) +
  `:167-173` (concatenados aos casamentos simples antes do `toCasamentos`).
- Defesa server-side equivalente no momento da baixa:
  `AlocacaoPermutasService.autoAlocarSeElegivel`
  (`src/backend/domain/service/permutas/AlocacaoPermutasService.ts:300-349`) — recomputa a
  elegibilidade ao vivo (único casamento-manual do processo `:321-326`; invoices com D.I `:328-332`;
  cobertura `saldoNeg + 1 >= somaInvoices` `:334-337`) antes de criar os rascunhos.

## Efeito do "Processar" (baixa real auto-alocada)

Na aba Automáticas, "Processar"/Baixar **não** é apenas um carimbo de estado: dispara a baixa real
no `fin010`, mas antes **auto-aloca** sozinho. Ver
`business-rules/auto-alocacao-atomica.md` e a ação `reconciliarPermuta`. O gatilho está em
`ReconciliacaoPermutaService.reconciliar`:
`src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:97-109` (se não há rascunho,
chama `autoAlocarSeElegivel` e, em fallback, `autoAlocarDeCasamento`).

## Por que está na ontologia (universalidade)

Universal no domínio de comex: um adiantamento (PROFORMA) cujo saldo cobre integralmente as faturas
(INVOICE) do mesmo processo é a forma mais limpa de permuta múltipla — não exige decisão humana de
distribuição, só confirmação. A estrutura (1 adto cobre N invoices do processo ⇒ auto-distribuível) é
do domínio; os **valores** (taxas, saldos) são do tenant.

## Invariante

- **I-Permuta-6 (cobertura total ⇒ automática):** quando 1 adiantamento cobre Σ das invoices do
  próprio processo, a distribuição é determinística (cada invoice recebe seu em-aberto) — sem
  alocação manual. Senão, permanece manual.

## Cobertura de teste

`GestaoPermutasService.test.ts` (`autoElegivel`) e `AlocacaoPermutasService.test.ts`
(`autoAlocarSeElegivel`) — testes diretos adicionados na remediação do Regis-Review 2026-06-24-2011
(Testability P0, R-2).
