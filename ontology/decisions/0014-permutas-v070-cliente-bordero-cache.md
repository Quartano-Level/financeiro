---
adr_number: 0014
title: Permutas v0.7.0 — múltipla automática + reclassificação, status permuta→borderô, remoção do estorno/Liberar, cliente em invoice + universo completo, cache de borderôs
date: 2026-06-24
status: accepted
type: addition
related_entities: [Permuta, PermutaCandidata, Invoice]
related_actions: [reconciliarPermuta, alocarPermuta]
supersedes_decisions: []
---

# ADR 0014: Permutas v0.7.0 — classificação automática, ciclo de borderô, cliente e cache

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/permutas-multiplas`
**PR:** #7 (mergeado em `main`, deployado 2026-06-24) · **CHANGELOG:** entrada v0.7.0
**Relacionado:** ADR-0009 (tipos de permuta/abas), ADR-0010 (greedy N:1), ADR-0013 (write-back fin010 Fase 3).

> Este ADR é **documentação retroativa** de funcionalidade já em produção. Não há decisão de domínio
> a negociar — registra o que o código deployado faz e por quê, com `file:line`.

## Contexto

A v0.7.0 fechou a malha das Permutas em torno de três frentes: (1) reduzir o trabalho manual
classificando automaticamente os casos que não precisam de decisão humana; (2) dar visibilidade do
**ciclo de vida do borderô** que efetiva a baixa; (3) tornar a busca por **cliente (importador)** e o
**universo de invoices** completos e rápidos. O Regis-Review 2026-06-24-2011 bloqueou o merge com 3 P0
+ 2 P1 críticos (dupla-baixa via `removerDaTrilha`; auto-alocação sem teste/atomicidade; reads sem
RBAC/Zod) — todos remediados antes do merge.

## Decisões

### D1 — Múltipla AUTOMÁTICA (adto cobre todas as invoices do processo)
Um `casamento-manual` que é o único do processo (`tipoPermuta = multiplas`) e cujo `saldoNeg` cobre
`Σ invoices` do processo (`saldoNeg + 1 ≥ Σ`, USD) vira **AUTOMÁTICA**: aparece na aba "Automáticas"
como **casamentos sintéticos pré-distribuídos**; "Processar" = baixa real auto-alocada. A aba "simples"
passou a se chamar **"Automáticas"** (engloba o 1:1/greedy simples + as múltiplas automáticas).
→ `business-rules/multipla-automatica.md`. Código: `GestaoPermutasService.ts:322-335` (autoElegivel),
`:144-173` (synth casamentos), `AlocacaoPermutasService.ts:300-349` (defesa server-side).

### D2 — Reclassificação "ultrapassa invoice" (simples → manual)
Casamento simples cujos adtos ultrapassam o em-aberto da invoice (`Σ saldoNeg − Σ valorASerUsado > 1`)
cai para manual: N adtos → `cross-over`; 1 adto → `multiplas`.
→ `business-rules/reclassificacao-ultrapassa-invoice.md`. Código:
`GestaoPermutasService.adtosQueUltrapassamInvoice` (`:219-251`), aplicado em `:269-281` e `:309-320`.

### D3 — Auto-alocação no Baixar, ATÔMICA
"Processar"/Baixar de caso automático sem rascunho cria as alocações sozinho (do casamento simples OU
do processo na múltipla) antes da baixa, all-or-nothing (reverte na falha parcial — sem meia-permuta).
→ `business-rules/auto-alocacao-atomica.md`. Código: `AlocacaoPermutasService.criarRascunhosAtomico`
(`:357-391`), gatilho em `ReconciliacaoPermutaService.ts:97-109`. **Remedia Regis R-2 (P0/P1).**

### D4 — Status PERMUTA → BORDERÔ (ciclo de vida, lazy)
Por adiantamento com baixa `settled`: borderô EM CADASTRO → `aguardando-finalizacao`; FINALIZADO →
`finalizado`; CANCELADO/ESTORNADO/REMOVIDO → a permuta **reabre** (volta a `pendente`).
→ `state-machines/status-permuta-bordero.md`. Código:
`BorderoGestaoService.statusPorAdiantamento` (`:429-487`) + `GET /permutas/status`
(`routes/permutas.ts:579-587`, `requireRole('admin')`).

### D5 — Estorno e "Liberar" REMOVIDOS da UI
Sem estorno na UI não há borderô travado; o endpoint/trilha `removerDaTrilha`
(`DELETE /borderos/:borCod/trilha`) foi **removido** — era código morto + risco de **dupla-baixa**.
**Remedia Regis R-1 (Fault-Tolerance P0 + Security P1).** O método `estornarBordero` e a rota
`/estornar` (Fase 3.1, v0.6.0) seguem no backend; só a exposição na UI + o `removerDaTrilha` saíram.

### D6 — Cliente (importador) em TODAS as invoices + universo completo
A ingestão hidrata o importador via `imp021` para **todas** as invoices (não só as casadas) e lista
**todas as invoices finalizadas** (com308 hidratado), não só as de processos com adiantamento.
Habilita busca/contagem por cliente no universo todo. Código:
`EleicaoPermutasService.computeCandidatas` (`todasInvoices`, `:213-313`),
`IngestaoPermutasService.toInvoiceRows` (`:282-347`), `ConexosClient.listInvoicesFinalizadas`
(`:709+`), migration `0017_invoice_importador.sql` (`pes_cod`/`importador`).

### D7 — Cache de borderôs (`permuta_bordero`)
Tabela cache (migration `0018`) populada na ingestão (`BorderoGestaoService.refreshCache`, `:381-418`),
lida pela tela do banco (LIMIT 500 recentes, `GET /permutas/borderos`; `?live=true` = refresh ao vivo).
As ações de borderô atualizam o cache na hora; índices em migration `0019`.

## Consequências

- Menos trabalho manual: casos cobertos pelo adto fluem sem alocação à mão; só os excedentes/N:M
  exigem decisão humana (D1/D2).
- A tela de permutas mostra o status real do borderô (D4) e a de borderôs carrega do banco, rápida
  (D7), com refresh sob demanda.
- Busca por cliente funciona no universo completo de invoices (D6).
- **Risco de dupla-baixa eliminado** (D5) e auto-alocação **sem meia-permuta** (D3) — os dois maiores
  riscos do Regis-Review fechados antes do merge.
- `tipoPermuta` e os status de borderô seguem **DERIVADOS** (apresentação/leitura viva), sem novo
  estado persistido na candidata — mudar a regra de corte é ajuste de derivação, sem reseed.

## Regis-Review 2026-06-24-2011 — findings remediados (pré-merge)

- **R-1 / Fault-Tolerance P0 + Security P1:** removido `DELETE /borderos/:borCod/trilha`
  (`removerDaTrilha`) — sem estorno na UI não há borderô travado; era código morto + dupla-baixa (D5).
- **R-2 / Testability P0 + Availability/Fault-Tolerance P1:** testes diretos de
  `autoAlocarSeElegivel`/`autoAlocarDeCasamento`/`GestaoPermutas.autoElegivel` + auto-alocação
  **ATÔMICA** (reverte falha parcial) (D3).
- **Security P1:** `requireRole('admin')` nos GETs `/borderos`, `/borderos/:borCod/baixas`, `/status`
  (`routes/permutas.ts:425, 439, 581`).
- **Integrability P1:** Zod/guard de identidade nas reads do ERP
  (`listInvoicesFinalizadas`/`listBorderos`/`listBaixas`) + log de cap-hit (truncamento de paginação).
- **Performance P1:** índices (migration `0019_permuta_perf_indexes.sql`) para o hot path de borderôs.

## Gaps remanescentes (não-bloqueantes)

- Validação em produção do 1º caso real de baixa `fin010` (herdado do ADR-0013) — `reconciliarPermuta`
  segue `partial`.
- Regressão N+1 na ingestão (Regis Performance P1, ~2390 chamadas com308/run) → follow-up de
  performance, não modela domínio.
- `business-rules/multipla-automatica`, `reclassificacao-ultrapassa-invoice` e `auto-alocacao-atomica`
  têm testes de serviço; ainda sem teste canônico de business-rule dedicado.
