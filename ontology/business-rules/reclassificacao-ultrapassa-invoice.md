---
name: reclassificacao-ultrapassa-invoice
type: business-rule
ontology_version: "0.4"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
last_review: 2026-06-24
invariant: I-Permuta-7
has_canonical_test: true
---

# Business rule: reclassificação "ultrapassa invoice" (simples → manual)

> **Vigência:** 2026-06-24 (v0.7.0, ADR-0014). DERIVADA na apresentação — **não persiste**.

## Regra

Um casamento **simples** (candidata `elegivel`, auto-sugerida) cujos adiantamentos **ultrapassam** o
em-aberto da invoice **cai para manual** — sai da aba Simples/Automáticas e vai para uma fila de
revisão manual. O sinal já está nos dados pós-distribuição greedy (que capa o usado no em-aberto vivo
da invoice):

```
ultrapassa(invoice) ⟺ Σ(saldoNeg dos adtos do grupo) − Σ(valorASerUsado) > 1   (tolerância 1 USD)
```

onde `saldoNeg = valorPermutar(BRL) / taxa` do adto (fallback = `valorASerUsado` quando taxa ausente).
Se `Σ saldoNeg ≤ em-aberto` (tudo consumido), segue **simples** e a invoice pode ficar parcialmente
em aberto (comportamento da distribuição greedy, `business-rules/distribuicao-simples-greedy.md`).

## Tipo resultante (cardinalidade)

| Grupo da invoice | tipoPermuta reclassificado |
|------------------|----------------------------|
| **>1 adto** para a mesma invoice (N adtos ↔ 1 invoice) | `cross-over` |
| **1 adto** que sozinho ultrapassa a invoice (1 adto → N invoices) | `multiplas` |

Quando um adto cai em mais de um grupo, **`cross-over` vence** (prioriza N:M).

## Onde é avaliada (file:line)

- `GestaoPermutasService.adtosQueUltrapassamInvoice` —
  `src/backend/domain/service/permutas/GestaoPermutasService.ts:219-251` (agrega `usado`/`saldo` por
  invoice `:226-239`; corte `g.saldo - g.usado <= 1` ignora `:243`; tipo por nº de adtos `:244`).
- Aplicação ao status/tipo da pendente em `toPendente`:
  `:269-281` (`ultrapassaInvoice` força `status = 'casamento-manual'`) e
  `:309-320` (tipoPermuta = `cross-over`/`multiplas` reclassificado).
- Os casamentos reclassificados saem da lista de auto-sugeridos:
  `:167-173` (`.filter(... !adtosReclassificadosManual.has(...))`).

## Interação com a múltipla automática

Reclassificados por ultrapassar a invoice **NÃO** são elegíveis a automática
(`business-rules/multipla-automatica.md`): a auto-elegibilidade exige
`a.estadoElegibilidade === 'casamento-manual'` **original** (`GestaoPermutasService.ts:330-331`), e o
reclassificado tem `estadoElegibilidade === 'elegivel'` (só o status de apresentação vira
`casamento-manual`). São fluxos disjuntos.

## Por que está na ontologia (universalidade)

Universal: quando o crédito do(s) adiantamento(s) excede o débito da fatura, a sobra precisa de
decisão humana (em qual outra invoice aplicar o excedente). Não é seguro auto-baixar contra uma
invoice que não comporta todo o saldo. A estrutura (excedente ⇒ revisão manual) é do domínio.

## Invariante

- **I-Permuta-7 (excedente ⇒ manual):** se Σ saldo do(s) adto(s) > em-aberto da invoice no casamento
  auto-sugerido, a permuta deixa de ser auto-executável e exige alocação manual do excedente.

## Cobertura de teste

`GestaoPermutasService.test.ts` cobre a reclassificação (`adtosQueUltrapassamInvoice`) — exercitada
junto com os testes de `autoElegivel`.
