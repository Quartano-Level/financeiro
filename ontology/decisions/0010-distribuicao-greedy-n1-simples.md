---
adr_number: 0010
title: Distribuição greedy N:1 com teto na permuta Simples (auto-casamento parcial), READ-ONLY no ERP
date: 2026-06-22
status: accepted
type: change
related_entities: [PermutaCandidata, Invoice, Adiantamento, VariacaoCambial]
related_actions: [casarInvoice, calcularVariacaoCambial]
supersedes_decisions: []
---

# ADR 0010: Distribuição greedy N:1 com teto na permuta Simples (auto-casamento parcial)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/permutas-multiplas`
**Relacionado:** ADR-0008 (alocação manual N:M — parcial), ADR-0009 (tipo `simples` = 1:1 ou 1 invoice → N adtos).

## Contexto

A permuta **Simples** (aba `simples`, ADR-0009) cobre tanto o 1:1 quanto o caso **1 invoice : N
adiantamentos** (`toCasamentoRows`, auto-casamento). Até aqui, cada adiantamento do grupo recebia o
seu **valor cheio** negociado (`valorASerUsado = adiantamento.valorMoedaNegociada`), **sem teto**.

No caso real **1408** (ZNSHINE, INVOICE 260.064 USD; adiantamentos `11566`=668.736 e `5751`=74.304),
isso somava **"usa 743.040"** — uma **super-permuta de ~483 k** acima do valor da própria invoice. O
auto-casamento estava produzindo um snapshot incoerente com o em-aberto da fatura.

A causa: o auto-casamento tratava o lado-crédito como ilimitado. A invoice tem um **em-aberto vivo**
finito (o que ainda falta abater), e a soma das alocações nunca pode ultrapassá-lo — exatamente a
invariante de saldo da invoice que o lado **manual** (ADR-0008, `I-Permuta-2`) já respeitava. O
auto-casamento precisava do mesmo teto e do mesmo suporte a **parcial**.

## Decisão

O auto-casamento Simples passa a **distribuir o em-aberto vivo da invoice** entre os adiantamentos
casados, com 4 decisões travadas:

1. **Ordenação — maior saldo disponível primeiro (desc).** Saldo do adto em moeda negociada =
   `valorPermutar(BRL) / taxa` (fallback `valorMoedaNegociada`). O maior saldo consome o teto primeiro.
2. **Desempate — mais antigo primeiro** (aging desc; fallback `dataEmissao` asc). Consistente com a
   âncora de aging (`business-rules/aging-anchor`).
3. **Teto (cap) — em-aberto vivo da invoice.** `mnyTitAberto` (via `getDetalheTitulos`), convertido para
   moeda negociada (`valorAberto / taxaInvoice`) e persistido como `Invoice.valorAbertoNegociado`.
   **Fallback** = `valorMoedaNegociada` quando o detalhe não está disponível. Se ambos ausentes →
   `teto = undefined` → **mantém o comportamento antigo** (cada adto usa o saldo cheio, sem capar).
4. **Saldo residual — auto-casamento agora é PARCIAL.** Um adiantamento consumido em parte mantém o
   `valorASerUsado` no valor parcial; o restante do adto fica **em aberto** (como já era no manual). A
   **variação cambial é recalculada sobre o valor PARCIAL** (`usado`), não sobre o valor cheio.

### Resultado no caso 1408
- `11566` usa **260.064** (consome todo o teto); saldo residual **408.672** fica em aberto.
- `5751` usa **0** (não tocado).
- Total = **"usa 260.064"** = em-aberto da invoice (antes era 743.040).

### Caso inverso (Σ adiantamentos < invoice)
- Todos os adiantamentos usados por **inteiro**; a **invoice** fica parcialmente permutada (em-aberto
  remanescente na fatura). Simétrico ao caso acima.

### Regras preservadas
- **Mesma moeda** continua bloqueada (regra existente — não se permuta USD × BRL).
- **READ-ONLY no Conexos.** Isto corrige apenas o **nosso snapshot/cálculo** (`permuta_casamento`,
  recomputado por run). A **baixa efetiva** no `fin010` (ação `reconciliarPermuta`) é a **Fase 3**
  (risco arquitetural #1) e segue **não implementada**.

## Consequências

- O auto-casamento Simples produz um snapshot **coerente com o em-aberto** da invoice; não há mais
  super-permuta. As linhas Simples ganham coluna **"Saldo restante"** (parcial visível ao analista).
- Auto e manual agora compartilham a mesma semântica de **parcial + teto da invoice** — a divergência
  conceitual entre os dois fluxos some.
- `Invoice` ganha `valorAbertoNegociado` como o **teto** do lado-crédito (em moeda negociada).
  `PermutaCandidata`/casamento ganha `saldoRestante`.

## Ponto aberto (validação com o time)

- **Residual grande em um único adto (1408: 408.672 sobra no `11566`).** Quando o teto da invoice é
  muito menor que o saldo do maior adiantamento, sobra um residual expressivo num único adto. A
  pergunta para o time: **um residual muito grande deveria virar caso de revisão manual** (sair do
  auto e cair numa fila assistida) em vez de ser auto-distribuído? Hoje é **auto** (greedy). Decisão
  adiada — registrar em watchlist; revisitar se o time sinalizar ruído operacional. Não bloqueia a
  entrega (READ-ONLY; o analista enxerga o saldo restante).

## Alternativas descartadas

- **Manter valor cheio por adto (sem teto):** rejeitado — é o bug do 1408 (super-permuta).
- **Distribuição proporcional (pro-rata) em vez de greedy:** rejeitado por ora — greedy "maior primeiro"
  reflete a intenção operacional de **fechar o maior adiantamento primeiro**; pro-rata fragmentaria
  todos os adtos. Revisitável se o time preferir.
- **Bloquear o grupo N:1 e jogar tudo para manual:** rejeitado — o `simples` é exatamente a fila que
  deve ser auto-resolvida; só o residual grande (ponto aberto acima) é candidato a manual.
