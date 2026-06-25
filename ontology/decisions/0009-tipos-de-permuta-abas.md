---
adr_number: 0009
title: Classificação de tipos de permuta (abas) — simples / múltiplas / cross-over / cross-process
date: 2026-06-21
status: accepted
type: refinement
related_entities: [Permuta, PermutaCandidata, Adiantamento, Invoice]
related_actions: []
supersedes_decisions: []
---

# ADR 0009: Tipos de permuta na área de trabalho (abas), topo só resumo

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/permutas-multiplas`
**Relacionado:** ADR-0005 (casamento manual N:M), ADR-0007 (permuta-manual cross-process), ADR-0008 (alocação).

## Contexto

Os KPIs do topo misturavam **resumo** (pendentes, invoices, bloqueadas) com **filas de trabalho por
tipo** (Elegíveis, Casamento manual, Permuta manual). E o cross-process (cliente-filtro) aparecia como KPI
no topo + ação na tabela principal, longe das outras filas. O analista (Yuri) pediu para consolidar os
**tipos de permuta** numa única área de trabalho em abas, deixando o topo apenas como resumo.

## Decisão

### 1. Classificação DERIVADA `tipoPermuta` (não é estado no banco)
Calculada em `GestaoPermutasService` a partir do estado + cardinalidade do processo — **sem migration,
sem novo estado** (continua elegivel/casamento-manual/permuta-manual). Dois eixos colapsados em 4 rótulos:
- **`simples`** — 1:1 ou 1 invoice → N adiantamentos (auto-casável). = "casamento sugerido".
- **`multiplas`** — 1 adiantamento → N invoices (mesmo processo). [casamento-manual, 1 adto no priCod]
- **`cross-over`** — N adiantamentos ↔ M invoices (mesmo processo). [casamento-manual, >1 adto no priCod]
- **`cross-process`** — cliente-filtro: a invoice está em OUTRO processo. = `permuta-manual`.

Regra de corte (casamento-manual): `nº de adtos casamento-manual no priCod > 1 → cross-over, senão multiplas`.

### 2. Topo = só RESUMO (4 KPIs)
`Adiantamentos pendentes · Invoices em aberto · Já permutado · Bloqueadas`. Os contadores por tipo saem
do topo e viram as **abas** (com contagem no rótulo).

### 3. Área de trabalho = 4 abas
**Simples · Múltiplas · Cross-over · Cross-process**. Cross-process é aba **própria** (não dobrada em
cross-over) por ser operacionalmente diferente (busca manual por nº de processo, adto sem D.I,
importador-filtro) — a ação "Alocar" (ADR-0008) vive aqui.

## Consequências

- Eixo cardinalidade (quantos de cada lado) fica explícito e separado do eixo escopo (mesmo vs outro
  processo). O analista vê cada fila de trabalho isolada, com texto-guia próprio.
- `tipoPermuta` é só apresentação — se a regra de cardinalidade mudar, é um ajuste de derivação, sem
  reseed. READ-ONLY no ERP preservado.

## Adendo (2026-06-21): alocação N:M unificada para todos os tipos manuais

`Múltiplas` e `Cross-over` passaram a usar o MESMO mecanismo de alocação do `Cross-process`
(`permuta_alocacao` + `AlocacaoPermutasService`, ADR-0008): o analista **distribui o saldo a permutar de
um adiantamento em VÁRIAS invoices** (parcial), com saldo restante e validação dos dois lados. O fluxo
antigo de invoice ÚNICA ("Resolver" → `permuta_casamento`/processamento) foi **removido** — era
insuficiente para 1 adto → N invoices. Diferença entre os tipos: `Múltiplas`/`Cross-over` pré-preenchem e
buscam o PRÓPRIO processo (mesmo processo); `Cross-process` busca OUTRO processo. Backend:
`GestaoPermutasService` calcula `saldoRestante`/`alocacoes` também para `casamento-manual` (antes só
`permuta-manual`). A entidade `Permuta` consumada (alocação) é agora a base ÚNICA de toda permuta manual.

**Trava de escopo (correção):** `Múltiplas`/`Cross-over` (`casamento-manual`) só alocam em invoices do
PRÓPRIO processo — o modal não deixa pesquisar outro processo (mostra "Invoices do processo X"); só
`Cross-process` (`permuta-manual`/cliente-filtro) busca outro processo. Rede de segurança no backend:
`AlocacaoPermutasService.alocar` rejeita `casamento-manual` com `invoicePriCod ≠ priCod do adiantamento`.

**Escopo por filial (correção crítica):** o `priCod` **não é único entre filiais** (cada filial numera
seus processos) — ex.: "523" na filial 4 = ZHEJIANG VOB (USD), "523" na filial 6 = THE ABSOLUT COMPANY
(BRL). A busca de invoices (`buscarInvoices`) varria TODAS as filiais e misturava invoices de processos
diferentes que só compartilham o número. Agora a busca é **sempre escopada à filial do adiantamento**
(`buscarInvoices(priCod, filCod)`; rota exige `filCod`; o front passa `alocando.filCod`).

**Trava de moeda (correção):** a permuta exige MESMA moeda negociada nos dois lados — não se aloca um
adiantamento em USD contra uma invoice em BRL (o saldo e a variação cambial não fariam sentido). O modal
filtra o dropdown para invoices na moeda do adiantamento (D.I + mesma moeda); invoices em outra moeda são
omitidas (com aviso). Rede de segurança no backend: `alocar` rejeita `adto.moedaNegociada ≠ invoice.moeda`.

## Adendo (2026-06-24, ADR-0014): aba "Simples" → "Automáticas"

A aba **Simples** foi renomeada para **Automáticas** e passou a englobar dois casos auto-executáveis:
(1) o casamento simples 1:1 / greedy N:1 (ADR-0010) e (2) a **múltipla AUTOMÁTICA** — `casamento-manual`
único do processo cujo adto cobre todas as invoices (`saldoNeg + 1 ≥ Σ invoices`), exposto como
**casamentos sintéticos pré-distribuídos** (`GestaoPermutasService.ts:144-173`). Nos dois, "Processar"
dispara a baixa real **auto-alocada** (atômica). Em sentido inverso, um casamento simples que
**ultrapassa** o em-aberto da invoice é **reclassificado** para `cross-over`/`multiplas` (sai das
Automáticas para revisão manual; `GestaoPermutasService.ts:219-251, 309-320`). Ver
`business-rules/multipla-automatica.md`, `business-rules/reclassificacao-ultrapassa-invoice.md`,
`business-rules/auto-alocacao-atomica.md`. Continua tudo **DERIVADO** (sem novo estado no banco).

## Alternativas descartadas

- **3 abas (cross-process dentro de cross-over):** rejeitado — misturaria mesmo-processo com cross-process
  e esconderia o fluxo do cliente-filtro.
- **Manter KPIs por tipo no topo + abas:** rejeitado — duplicava contagem e poluía o resumo.
- **Persistir `tipoPermuta` no banco:** desnecessário — é derivável do estado + cardinalidade a cada leitura.
