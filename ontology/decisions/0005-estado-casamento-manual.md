---
adr_number: 0005
title: Estado `casamento-manual` para N:M (deixa de ser `bloqueada`)
date: 2026-06-18
status: accepted
type: modification
related_entities: [PermutaCandidata, Invoice]
supersedes_decisions: ["0004 §cardinalidade (N:M → backlog bloqueado)"]
---

# ADR 0005: Estado `casamento-manual` para N:M (Permutas, Frente I)

**Cliente:** Columbia Trading (`priCod=1153`) · **Entrega:** Kavex (created by Clonex)
**Relacionado:** ADR-0004 (modelagem Fatia 1), regra `elegibilidade-permuta`,
state-machine `elegibilidade-permuta-candidata`, ação `casar-invoice`
**Branch:** `feat/permutas-painel-elegiveis`

## Contexto

Na Fatia 1 (ADR-0004 §Cardinalidade), os casos **N:M** (>1 INVOICE FINALIZADA no mesmo processo —
motivos `composto-nm` / `multiplas-invoices`) foram mandados para **backlog** como `BLOQUEADA`,
no mesmo balde de uma reprovação de gate. Mas o N:M **passa nos 4 gates de elegibilidade**: o
adiantamento é PROFORMA, tem `valorPermutar > 0`, está TOTALMENTE PAGO e tem D.I XOR DUIMP. A
única coisa que falta é **o analista escolher a invoice** (o auto 1:1 não consegue decidir entre
várias). Tratá-lo como `bloqueada` confunde "reprovado por mérito" com "pronto, aguardando uma
decisão humana" — e infla o KPI de bloqueadas com casos que na verdade estão a um clique do
casamento.

## Decisão

### 1. Novo estado `CASAMENTO_MANUAL` (`'casamento-manual'`)
Adicionar um quarto estado à máquina de elegibilidade da `PermutaCandidata`:
`descoberta | elegivel | casamento-manual | bloqueada`. Significado: **passou os 4 gates, mas o
casamento é N:M** — falta só a escolha da invoice pelo analista.

### 2. Escopo restrito aos motivos N:M
SÓ os motivos `composto-nm` e `multiplas-invoices` (saída de `casarInvoice` para >1 invoice)
mapeiam para `casamento-manual`. Os demais — `sem-invoice`, `data-base-indisponivel`,
`falha-gate`, `detail-indisponivel` — **continuam `bloqueada`**. O `motivoBloqueio` do N:M passa a
ser **informativo** (qual sabor de N:M), não um bloqueio.

### 3. Escrita final é Fatia 2
Esta decisão apenas **sinaliza** o N:M como pronto-para-casamento-manual. A **escolha da invoice +
a baixa** (escrita no ERP) pertencem à **Fatia 2** — coerente com ADR-0004 §1 (não modelar a
`Permuta` consumada sem caminho de escrita validado). `PermutaCandidata` mantém **shape 1:1** no
relacional; a invoice do N:M é resolvida na escolha do analista.

### 4. Back-compat do snapshot (`/painel` do PR#2)
A coluna `permuta_candidata_snapshot.status` (migration 0001) aceita só `elegivel | bloqueada` e
**não é alterada**. O `casamento-manual` é **mapeado para `bloqueada`** ao gravar o snapshot — o
`/painel` legado segue funcionando sem mudança de CHECK. O modelo **relacional** (`/gestao`)
carrega o estado real: migration `0005` estende a CHECK de
`permuta_adiantamento.estado_elegibilidade` para incluir `casamento-manual`.

## Consequências

- **KPI honesto:** a tela `/gestao` ganha o cartão "Casamento manual" (âmbar/warning) e os N:M
  **saem** da contagem de `bloqueadas`. `elegiveis` continua só o auto 1:1.
- **UI:** badge âmbar "Casamento manual (N:M)" + KPI clicável que filtra a tabela.
- **Migração proporcional:** migration 0005 (idempotente) estende a CHECK do relacional; a 0001
  fica intacta.
- **Não recursivo na Fatia 1:** nenhuma escrita nova no ERP; a baixa do N:M continua fora de escopo.

## Alternativas descartadas

- **Manter N:M como `bloqueada` com motivo:** rejeitado — mistura reprovação com pendência de
  decisão humana e polui o KPI de bloqueadas.
- **Promover N:M direto a `elegivel`:** rejeitado — `elegivel` implica casamento 1:1 resolvido e
  pronto para baixa automática; o N:M ainda exige a escolha do analista.
- **Alterar a CHECK da migration 0001:** rejeitado — quebraria a back-compat do `/painel` (PR#2)
  sem ganho; o mapeamento `casamento-manual → bloqueada` no snapshot é suficiente.
