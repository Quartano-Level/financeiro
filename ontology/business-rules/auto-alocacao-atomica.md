---
name: auto-alocacao-atomica
type: business-rule
ontology_version: "0.4"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/AlocacaoPermutasService.ts
  - src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts
last_review: 2026-06-24
invariant: I-Permuta-8
has_canonical_test: true
---

# Business rule: auto-alocação no Baixar (atômica, all-or-nothing)

> **Vigência:** 2026-06-24 (v0.7.0, ADR-0014). Remedia o Regis-Review 2026-06-24-2011 R-2
> (Availability/Fault-Tolerance P1: meia-permuta).

## Regra

"Processar"/Baixar de um caso **automático** (múltipla automática **ou** casamento simples/elegível)
que **ainda não tem rascunho** de alocação cria os rascunhos de `permuta_alocacao` **sozinho**, antes
da baixa real no `fin010`. A criação é **ATÔMICA** (all-or-nothing): se um `alocar` falhar no meio
(ex.: queda do Conexos), os rascunhos já criados **nesta chamada são revertidos** — nunca fica uma
permuta parcial ("meia-permuta") que viraria baixa parcial errada no ERP.

## Dois caminhos de origem dos rascunhos

| Origem | Método | Como deriva os itens |
|--------|--------|----------------------|
| Múltipla **automática** (adto cobre todas as invoices do processo) | `autoAlocarSeElegivel` | re-busca invoices vivas com D.I do processo; cada invoice recebe `valorMoedaNegociada − jaAlocado` |
| Casamento **simples**/elegível (greedy) | `autoAlocarDeCasamento` | usa os casamentos calculados na eleição (`valorASerUsado` do greedy) |

Ambos delegam a `criarRascunhosAtomico`, idempotentes (se já houver alocação, devolvem `true` sem
recriar).

## Onde está (file:line)

- `AlocacaoPermutasService.criarRascunhosAtomico` —
  `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:357-391`: loop de `alocar`
  acumulando `criadas` `:363-368`; no `catch`, reverte cada `remover(adto, invoice)` `:372-378`,
  loga `BUSINESS_WARN` "auto-alocação revertida" `:379-387` e **re-lança** o erro original `:388`.
- `autoAlocarSeElegivel` — `:300-349` (elegibilidade da múltipla automática + montagem dos itens).
- `autoAlocarDeCasamento` — `:399-421` (itens a partir do casamento simples).
- Gatilho na ação de baixa: `ReconciliacaoPermutaService.reconciliar`
  `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:97-109` — só auto-aloca quando
  `alocacoes.length === 0`; depois relê as alocações e segue para a baixa gated.

## Natureza da atomicidade (compensação, não transação distribuída)

O rollback é **compensação** sobre a tabela própria `permuta_alocacao` (rascunhos locais, **sem
efeito no ERP ainda**) — não é transação 2PC com o Conexos. É seguro porque a baixa real subsequente
relê o em-aberto vivo do ERP e capa por invoice (anti-super-pagamento, ver
`business-rules/fin010-write-contract.md`).

## Por que está na ontologia (universalidade)

Universal: a montagem automática de uma permuta de N pares deve ser tudo-ou-nada — uma permuta
parcial silenciosa é um defeito de domínio (o adiantamento ficaria "meio baixado"). A estrutura
(criação de alocação multi-par é atômica) é do domínio.

## Invariante

- **I-Permuta-8 (atomicidade da alocação automática):** a auto-alocação de um adiantamento cria
  **todos** os pares ou **nenhum**; falha parcial reverte os rascunhos da própria chamada.

## Cobertura de teste

`AlocacaoPermutasService.test.ts` — `autoAlocarSeElegivel`/`autoAlocarDeCasamento` + caminho de
reversão (Regis-Review 2026-06-24-2011, Testability P0 / Availability P1).
