---
adr_number: 0008
title: Alocação manual N:M cross-process (entidade Permuta consumada — Fase 2)
date: 2026-06-20
status: accepted
type: addition
related_entities: [Permuta, PermutaCandidata, Adiantamento, Invoice]
related_actions: [alocarPermuta, buscarInvoiceCrossProcess]
supersedes_decisions: []
---

# ADR 0008: Alocação manual N:M cross-process (Permutas, Frente I — Fase 2)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex)
**Relacionado:** ADR-0004 (a `Permuta` consumada era backlog da Fatia 2), ADR-0007 (cliente-filtro +
estado `permuta-manual`), exploração `ontology/_inbox/permutas-nm-exploracao.md`
**Branch:** `feat/permutas-multiplas`

## Contexto

A Fase 1 (ADR-0007) roteou os adtos de clientes-filtro ao estado `permuta-manual`, mas eles ficavam
apenas enfileirados. Validado com o time: a reconciliação desses casos é **manual e CROSS-PROCESS** —
o analista pega um adiantamento e o casa com invoices de **qualquer outro processo** (a invoice do 1153
não existe no próprio processo). É N:M com **valores parciais**: um adto abate parte de várias invoices;
uma invoice é composta por vários adtos. A invoice escolhida **DEVE ter D.I/DUIMP** (a data-base/variação
vem dela, já que o adto do filtro não tem D.I).

## Decisão

### 1. Entidade `Permuta` consumada nasce como ALOCAÇÃO (`permuta_alocacao`)
Tabela própria `(adiantamento_doc, invoice_doc, valor_alocado, moeda, variacao*, taxas, criado_por…)`,
**links livres** adto↔invoice (NÃO assume `priCod` igual). UNIQUE por par. **Sobrevive à re-ingestão**
(≠ `permuta_casamento`, recomputada por run). É a semente da `Permuta` consumada do ADR-0004 — sem a
escrita no ERP ainda.

### 2. Alocação incremental com sobra permitida
Única trava: **não exceder o saldo de cada lado** — `Σ(alocado por adto) ≤ saldo a permutar` e
`Σ(alocado por invoice) ≤ valor em aberto`. O saldo pode ficar parcialmente em aberto (alocação
incremental). Valor em **moeda negociada** (USD). Saldo do adto em moeda negociada = `saldoPermutar(BRL) /
taxa`. Excesso → `AlocacaoSaldoError` (HTTP 422).

### 3. Busca de invoice LIVE cross-process
`buscarInvoices(priCod)` consulta o Conexos ao vivo (todas as filiais), enriquece valor/taxa negociada
(`com308`) e valida D.I (`imp019`/`imp223`). Não pré-ingere a base — saldo confiável; re-valida ao vivo
no momento de alocar. A invoice **sem D.I é omitida** (não pode ser permutada).

### 4. Variação cambial pela taxa da INVOICE
`delta = valorAlocado × (taxaAdiantamento − taxaInvoice)`; data-base = D.I da invoice. Reusa
`VariacaoCambialPermutaService` (ADR-0004 / classificacao-juros-desconto) com o valor PARCIAL.

### 5. Rascunho — escrita no ERP é a Fase 3
A alocação é **editável** (adicionar/remover/ajustar); sem passo "confirmar". A **baixa em `fin010`**
(execução da permuta no Conexos) é a **Fase 3** — risco arquitetural #1, intocado aqui. I4 preservado
(a única escrita é a tabela própria).

## Consequências

- O analista monta a permuta completa (quem casa com quem, quanto) e vê saldo restante + variação por
  alocação. KPI/filtro `permuta-manual` (ADR-0007) ganha ação "Alocar invoice" + modal.
- A `Permuta` consumada está modelada (alocação) mas **não executada** — a Fase 3 adiciona a ação
  `reconciliarPermuta` (write-back) sobre estas alocações.

## Alternativas descartadas

- **Reusar `permuta_casamento`:** rejeitado — é recomputada (DELETE+INSERT) a cada ingestão; perderia as
  alocações manuais. Daí a tabela própria que sobrevive.
- **Pré-ingerir todas as invoices da base p/ busca offline:** rejeitado — pesado e com risco de saldo
  defasado (a permuta movimenta dinheiro). Busca live por processo + re-validação.
- **Exigir fechamento exato (Σ = saldo):** rejeitado — o time confirmou alocação parcial/incremental.
