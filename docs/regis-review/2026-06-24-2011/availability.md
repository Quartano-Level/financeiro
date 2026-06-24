---
qa: Availability
qa_slug: availability
run_id: 2026-06-24-2011
agent: qa-availability
generated_at: 2026-06-24T20:11:00-03:00
scope: backend
score: 7
findings_count: 6
cards_count: 6
---

# Availability — Regis-Review

Escopo desta seção: diff `main...HEAD` do PR v0.7.0 (cache de borderôs, hidratação ampliada do universo de invoices, GET /permutas/status lazy, auto-alocação no reconciliar, memo de 30s no front). O sistema completo já foi avaliado em runs anteriores — aqui só os deltas.

## 1. Cenário Geral (Bass General Scenario aplicado ao PR v0.7.0)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista abre aba Borderôs / ingestão diária | Conexos ERP `fin010/list` indisponível ou lento em UMA filial | `BorderoGestaoService.refreshCache` (Promise.all sobre N filiais) + `replaceBorderoCache` | Operação normal, ingestão tri-diária (06h/12h/18h BRT) | Filial que falhou loga warn e segue com `[]` — outras filiais continuam alimentando o cache; cache pré-existente é preservado se TODAS falharem | 0 stale-write no cache em fetch vazio; ≥1 filial OK ⇒ tela carrega; falha de 1 filial em N não derruba refresh |
| Analista clica Baixar num adto sem alocação prévia (regra 2026-06-24) | `ReconciliacaoPermutaService.reconciliar` invoca `autoAlocarSeElegivel` / `autoAlocarDeCasamento` ANTES da baixa real | `AlocacaoPermutasService` (re-busca live N invoices do processo no Conexos) + `PermutaAlocacaoRepository` | UI síncrona, analista esperando o modal | Cada `alocar` re-bate o Conexos (buscarInvoices: list+detail+com308 por invoice); falha parcial deveria abortar (NÃO há `Promise.allSettled` — for-loop sequencial com throw) | MTTR não medível localmente; latência observável = ~N × (1 list + N × (detalhe + com308)) chamadas Conexos por adto antes do borderô existir |
| Analista executa ação de escrita (aprovar/cancelar/excluir borderô) | UI invalida memo `borderosMemo` no front e rebusca `fetchBorderos(false)` (cache server) | `lib/api.ts:fetchBorderos` (memo 30s) + cache-DB `permuta_bordero` | Operação normal multi-usuário | Memo invalidado por usuário-A NÃO é visto pelos demais (escopo módulo) — outros podem ver dado de até 30s atrás após ação remota | Janela de inconsistência: ≤30s entre usuários; 0s para o usuário que executou a ação |

> Stimulus relevante NÃO coberto pelo PR: queda do Conexos durante o handshake de 5 chamadas da baixa real (`criarBordero` → `validarTituloBaixa` → `validarTituloPermuta` → `atualizaValorLiquido` → `gravarBaixaPermuta`). Já endereçado em runs anteriores via `setBorCod` write-ahead (Regis F-availability-1/3) + `markError` (referenciado em `ReconciliacaoPermutaService.ts:198-215`); o PR v0.7.0 não altera esse caminho.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| `replaceBorderoCache` guard contra fetch vazio (não limpa cache se ERP devolveu zero) | Presente (`if (items.length === 0) return`) | Presente | ✅ | `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:333` |
| `refreshCache` por-filial em paralelo com `.catch()` por filial | Presente — falha de 1 filial vira warn + `[]`, demais seguem | Falha isolada por filial | ✅ | `src/backend/domain/service/permutas/BorderoGestaoService.ts:405-420` |
| Best-effort no `IngestaoPermutasService` → `refreshCache` (`try/catch + warn`) | Presente, não derruba a ingestão | Best-effort com log | ✅ | `src/backend/domain/service/permutas/IngestaoPermutasService.ts:139-147` |
| Timeout HTTP explícito no `ConexosClient` para os novos endpoints (`listInvoicesFinalizadas`, `listBorderos` com `borCods#IN`) | **Ausente** — herda do `legacy.listGeneric` (sem timeout configurado no PR; reusa o adapter legado, pageSize=1000) | Timeout < 60s por chamada | ❌ | `src/backend/domain/client/ConexosClient.ts:1292-1340` |
| `RetryExecutor` em volta dos novos métodos de leitura | Presente (`listInvoicesFinalizadas` usa `paginate` → `retryExecutor` por página; `listBorderos` envolto em retry) | Sim | ✅ | `src/backend/domain/client/ConexosClient.ts:1304, 1731` |
| Hidratação de TODAS as invoices da filial (com308 + imp021) com falha-por-linha tolerada | Presente — `hidratarInvoiceNegociada` faz `try/catch` por invoice, omite valor negociado em falha | Falha em 1 linha ≠ falha do lote | ✅ | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:543-567` |
| Bounded concurrency no fan-out de hidratação (`ADIANTAMENTOS_CONCURRENCY=10`, `FILIAIS_CONCURRENCY=5`) | Presente | ≤10 (proteção MAX_SESSIONS) | ✅ | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:86-88, 265-293` |
| Volume estimado de chamadas Conexos por ingestão APÓS o PR | NÃO medível localmente (depende do nº real de invoices finalizadas por filial) — pelo código: 1 list (com298) + 1 list (imp021) + **N×(listTitulosAPagar)** por filial, onde N = invoices finalizadas. O PR adiciona `N×(com308)` para o universo completo (antes só as casadas) | < 2000 chamadas/run | ⚠️ | Estimativa estática `EleicaoPermutasService.ts:265-293` |
| `GET /permutas/status` (lazy, statusPorAdiantamento) — best-effort por filial | Presente — `Promise.all` com `try/catch` por filial; falha 1 filial vira warn + omissão (permuta volta a "pendente") | Falha de filial não trava endpoint | ✅ | `src/backend/domain/service/permutas/BorderoGestaoService.ts:470-486` |
| `GET /permutas/status` — timeout do endpoint inteiro / circuit breaker no Express | Ausente (sem `requestTimeout` nem `timeout()` middleware no router permutas) | Timeout HTTP < 60s | ❌ | `src/backend/routes/permutas.ts:600-607` (nenhum middleware de timeout) |
| Memo 30s no front (`fetchBorderos`) com invalidação após ação de escrita | Presente — `invalidarBorderosMemo()` chamado após confirmar/cancelar/aprovar/excluir | Invalidação na ação | ⚠️ (escopo MÓDULO — não inter-usuário) | `src/frontend/lib/api.ts:272-292`; `src/frontend/app/permutas/BorderosPanel.tsx:225` |
| Auto-alocação no Baixar com fallback `||` em sequência (`autoAlocarSeElegivel \|\| autoAlocarDeCasamento`) | Presente; cada um devolve `bool` (idempotente — re-uso se já tem alocação) | Fallback sem efeito colateral em falha | ⚠️ | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:96-109` |
| `AlocacaoPermutasService.autoAlocar*` — atomicidade do for-loop de `alocar()` parcial | **Ausente** — for-loop sequencial sem transação. Se 5 invoices, e a 3ª falhar (Conexos 504 / saldo race), os 2 já gravados ficam "rascunho" parcial; o método retorna `true` se `listAtivas()` achar ALGUMA alocação (`some()`) | All-or-nothing (transação) ou rollback explícito | ❌ | `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:341-355, 378-389` |
| Cache `permuta_bordero` — staleness signal exposto para detectar dados velhos | **Ausente** — coluna `atualizado_em` existe na tabela mas NÃO é lida em `listBorderoCache` nem propagada para a UI ou para um circuit breaker | Idade do cache exposta | ❌ | `src/backend/migrations/0018_permuta_bordero_cache.sql:14`; `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:305-329` |
| `replaceBorderoCache` — DELETE em massa pós-INSERT (`WHERE bor_cod NOT IN (...)`) | Presente, mas SEM `WITH ... AS` / transação — INSERT e DELETE rodam em chamadas separadas no client (`databaseClient.update` × 2). Falha entre os dois ⇒ cache duplicado/órfão | Atômico (1 tx) | ⚠️ | `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:345-364` |

> ⚠️ **Não medível localmente**: MTTR real da baixa interrompida (queda Conexos entre `criarBordero` e `gravarBaixaPermuta`). Requer CloudWatch / produção. Recomendação: instrumentar dashboard com duração das transições `pending → reconciling → settled / error` no `permuta_alocacao_execucao` (já há `criado_em` / `atualizado_em` por linha — falta a query agregadora).

> ⚠️ **Não medível localmente**: latência observada da auto-alocação no Baixar (a UI agora bate Conexos N+1 vezes antes do borderô). Requer CloudWatch Logs Insights filtrando `LOG_TYPE.BUSINESS_INFO` com `'permuta alocacao manual gravada'` e correlacionando ao request inicial.

## 3. Tactics — Cobertura no PR v0.7.0

### Detect Faults

| Tactic | Implementação | Status | Evidência |
|---|---|---|---|
| Ping/Echo | N/A (não há heartbeat ativo para o ERP) | N/A | — |
| Heartbeat | N/A | N/A | — |
| Monitor | `LogService.warn/error` em todos os caminhos best-effort; sem CloudWatch/dashboard nas mudanças do PR | ⚠️ parcial | `BorderoGestaoService.ts:410-419, 479-485` |
| Timestamp | `permuta_bordero.atualizado_em` GRAVADO mas **não consumido** para sinalizar idade | ⚠️ parcial | `migrations/0018_permuta_bordero_cache.sql:14`; ausente em `listBorderoCache` |
| Sanity Checking | `replaceBorderoCache` rejeita fetch vazio (`items.length === 0 ⇒ no-op`); `borderoAindaValido` valida estado vivo antes de skip idempotente; `assertNoErpError` lê envelope `{messages}` | ✅ | `PermutaExecucaoRepository.ts:333`; `ReconciliacaoPermutaService.ts:496-507, 481-489` |
| Condition Monitoring | `capHit` em `listInvoicesFinalizadas` (logado mas não exposto na resposta REST) | ⚠️ parcial | `ConexosClient.ts:701-745` |
| Voting | N/A | N/A | — |
| Exception Detection | Conexos errors normalizados em `ConexosError`; `assertNoErpError` flagra `valid='ERRO'` em HTTP 200 | ✅ | `ReconciliacaoPermutaService.ts:481-489` |
| Self-Test | N/A | N/A | — |

### Recover from Faults — Preparation & Repair

| Tactic | Implementação | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A (single Conexos tenant) | N/A | — |
| Passive Redundancy | Cache `permuta_bordero` como "passive copy" do `fin010/list` — leitura preferencial do cache, refresh assíncrono | ✅ | `BorderoGestaoService.ts:320-328` |
| Spare | N/A | N/A | — |
| Exception Handling | Try/catch por filial no `refreshCache`; try/catch por invoice no `hidratarInvoiceNegociada`; try/catch best-effort no IngestaoPermutasService → `refreshCache` | ✅ | `BorderoGestaoService.ts:409-419`; `EleicaoPermutasService.ts:555-565`; `IngestaoPermutasService.ts:140-147` |
| Rollback | Ingestão atômica via `withTransaction`; `replaceBorderoCache` **NÃO** é atômico (INSERT + DELETE separados) | ⚠️ parcial | `IngestaoPermutasService.ts:99-121` (ok); `PermutaExecucaoRepository.ts:345-364` (gap) |
| Software Upgrade | N/A | N/A | — |
| Retry | `RetryExecutor(2 retries, 500ms, jitter 200ms)` em todos os métodos de leitura novos (`listInvoicesFinalizadas`, `listBorderos`) | ✅ | `ConexosClient.ts:430-435, 1304, 1731` |
| Ignore Faulty Behavior | Falha de filial no `refreshCache` → `[]`; falha de com308 numa invoice → omite valor (best-effort) | ✅ | `BorderoGestaoService.ts:417-418`; `EleicaoPermutasService.ts:563-565` |
| Degradation | Cache pré-existente preservado quando o ERP devolve zero (`replaceBorderoCache` no-op); memo de 30s na UI dá fallback enquanto rede oscila | ✅ | `PermutaExecucaoRepository.ts:333`; `lib/api.ts:276-287` |
| Reconfiguration | N/A (não há failover automático) | N/A | — |

### Recover from Faults — Reintroduction

| Tactic | Implementação | Status | Evidência |
|---|---|---|---|
| Shadow | N/A | N/A | — |
| State Resynchronization | `refreshCache` é re-runnable a qualquer momento (`?live=true`); ingestão tri-diária reconcilia o relacional | ✅ | `routes/permutas.ts:421-432`; `BorderoGestaoService.ts:403-440` |
| Escalating Restart | N/A | N/A | — |
| Non-Stop Forwarding | N/A | N/A | — |

### Prevent Faults

| Tactic | Implementação | Status | Evidência |
|---|---|---|---|
| Removal from Service | N/A no PR | N/A | — |
| Transactions | Ingestão usa `withTransaction` + advisory lock; auto-alocação `autoAlocarSeElegivel`/`autoAlocarDeCasamento` faz N `alocar()` em **for-loop NÃO transacional** | ⚠️ parcial | `AlocacaoPermutasService.ts:341-355` (gap) |
| Predictive Model | N/A | N/A | — |
| Exception Prevention | `borderoAindaValido` antes de skip idempotente evita re-baixa duplicada; `Math.min(valorBaixaDesejado, emAbertoErp)` evita super-pagamento | ✅ | `ReconciliacaoPermutaService.ts:496-507, 269-277` |
| Increase Competence Set | N/A | N/A | — |

## 4. Findings

### F-availability-1: `replaceBorderoCache` não é atômico (INSERT + DELETE em chamadas separadas)

- **Severidade**: P2 (médio — débito técnico defensável; janela curta)
- **Tactic violada**: Transactions / Rollback
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:345-364`
- **Evidência (objetiva)**:
  ```ts
  await this.databaseClient.update(`INSERT INTO permuta_bordero ... ON CONFLICT ... DO UPDATE ...`, params);
  // <— SEM transação. Se o processo morrer aqui, o cache fica com os novos + os antigos órfãos.
  const inList = items.map((_, i) => `$bor_${i}`).join(', ');
  await this.databaseClient.update(`DELETE FROM permuta_bordero WHERE bor_cod NOT IN (${inList})`, params);
  ```
- **Impacto técnico**: Falha entre o INSERT (upsert) e o DELETE deixa borderôs órfãos no cache (já removidos no ERP, mas presentes na tabela). A próxima leitura mostra borderôs zumbis até o próximo refresh bem-sucedido.
- **Impacto de negócio**: Analista vê borderô que não existe mais no ERP → tenta ação → erro do ERP → confusão / abertura de chamado.
- **Métrica de baseline**: Sem instrumentação de "borderôs órfãos detectados pós-refresh". Janela de risco = duração entre os 2 statements (subsegundos), mas não-zero.

### F-availability-2: `autoAlocar*` faz N escritas sequenciais sem transação — retorno `true` engana o caller

- **Severidade**: P1 (alto — pode persistir alocação parcial silenciosa em fluxo de escrita)
- **Tactic violada**: Transactions / Rollback
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:341-355` e `378-389`
- **Evidência (objetiva)**:
  ```ts
  for (const inv of invoices) {
      const disponivel = (inv.valorMoedaNegociada ?? 0) - inv.jaAlocado;
      if (disponivel > 0) {
          await this.alocar({ ... });  // throws se Conexos cair → ABORTA o for-loop, deixando i-1 alocações persistidas.
      }
  }
  return (await this.alocacaoRepository.listAtivas()).some(...);  // ⇒ true se AO MENOS UMA foi gravada
  ```
  E o caller (`ReconciliacaoPermutaService.ts:96-109`) reusa `alocacoes` sem distinguir "todas alocadas" de "parcialmente alocadas".
- **Impacto técnico**: Adto com 5 invoices, falha de Conexos na 3ª chamada `alocar()` → 2 alocações persistidas + 0 borderô + retorno `true` para `autoAlocarSeElegivel` (porque `some()` acha as 2 primeiras). O `ReconciliacaoPermutaService` então continua e tenta baixar APENAS as 2 — a múltipla automática viraria meia-permuta no ERP.
- **Impacto de negócio**: Reconciliação parcial = adto fica com saldo residual incorreto no Conexos. Operação financeira inconsistente que requer revisão manual.
- **Métrica de baseline**: 0 testes para o cenário "falha do Conexos no meio do for-loop de auto-alocação" (verificado em `AlocacaoPermutasService` — sem teste cobrindo falha parcial).

### F-availability-3: `GET /permutas/status` faz fan-out Conexos lazy sem timeout no endpoint

- **Severidade**: P2 (médio — pode comer worker do Express por minutos)
- **Tactic violada**: Detect Faults — Monitor (timeout); Exception Prevention
- **Localização**: `src/backend/routes/permutas.ts:600-607`; `src/backend/domain/service/permutas/BorderoGestaoService.ts:470-486`
- **Evidência (objetiva)**: O endpoint dispara `Promise.all` sobre N filiais. Cada filial usa `RetryExecutor(2, 500ms, jitter 200ms)` no `listBorderos`. Se o Conexos ficar lento (10s/chamada × 3 tentativas) em todas as filiais ⇒ 30s × paralelismo. Não há `req.setTimeout()`, nem `connect-timeout`/`express-timeout`, nem `AbortController` no route.
- **Impacto técnico**: Render dyno pode estourar timeout default (30s) com a conexão pendurada; worker Express bloqueia outras requests. Replicado em N analistas abrindo a tela em rajada.
- **Impacto de negócio**: Tela de permutas trava para todos durante incidente Conexos; analistas não conseguem operar.
- **Métrica de baseline**: timeout Express atual: default Node (sem limite). Render dyno: 30s. Conexos retry-budget atual: até ~3s por chamada × 3 retries × N filiais.

### F-availability-4: `permuta_bordero.atualizado_em` gravado mas não exposto como sinal de staleness

- **Severidade**: P3 (baixo — melhoria de observabilidade)
- **Tactic violada**: Detect Faults — Timestamp
- **Localização**: `src/backend/migrations/0018_permuta_bordero_cache.sql:14`; `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:305-329` (`listBorderoCache` não seleciona `atualizado_em`)
- **Evidência (objetiva)**: Migration cria a coluna; `replaceBorderoCache` mantém via `now()`; `listBorderoCache` ignora.
- **Impacto técnico**: Se o cron de ingestão falhar 24h consecutivas (3 runs perdidas), o cache fica obsoleto e o analista não sabe — a tela mostra dado como "fresco".
- **Impacto de negócio**: Decisão tomada em cima de cache stale (borderô que foi excluído no ERP fora do sistema fica visível por dias).
- **Métrica de baseline**: 0 indicador de idade no payload de `GET /permutas/borderos`.

### F-availability-5: `ConexosClient.listInvoicesFinalizadas` + hidratação N×com308 sem cap-hit visível no payload

- **Severidade**: P2 (médio — risco de silent truncation)
- **Tactic violada**: Condition Monitoring
- **Localização**: `src/backend/domain/client/ConexosClient.ts:701-745`; `src/backend/domain/service/permutas/EleicaoPermutasService.ts:265-294`
- **Evidência (objetiva)**: `capHit` é capturado pelo `paginate` (MAX_PAGES=50, PAGE_SIZE=500 ⇒ ceiling 25 000 invoices/filial), mas o `EleicaoPermutasService.computeCandidatas` não propaga `capHit` para `IngestaoResult` nem dispara `BUSINESS_WARN` (só o caminho de adiantamentos loga). Ingestão pode silenciosamente truncar o universo de invoices.
- **Impacto técnico**: Invoices além do teto somem do `invoicesEmAberto` da tela Gestão.
- **Impacto de negócio**: Permutas elegíveis NÃO aparecem para o analista; oportunidade de baixa perdida sem aviso.
- **Métrica de baseline**: ceiling teórico 25 000 invoices finalizadas / filial; comportamento ao bater = silêncio. Logs locais não rodam contra produção, então 0 evidência de quão perto do teto a Columbia opera.

### F-availability-6: Memo de 30s no front é per-tab, não inter-usuário

- **Severidade**: P3 (baixo — janela curta e bem-conhecida)
- **Tactic violada**: State Resynchronization (parcial)
- **Localização**: `src/frontend/lib/api.ts:272-292`; `src/frontend/app/permutas/BorderosPanel.tsx:225`
- **Evidência (objetiva)**:
  ```ts
  let borderosMemo: { at: number; data: BorderoResumo[] } | null = null   // module-scoped
  const BORDEROS_MEMO_TTL = 30_000
  ```
- **Impacto técnico**: Usuário-A exclui um borderô → cache server invalidado + memo do A invalidado; Usuário-B ainda vê o borderô por até 30s (memo local não foi tocado).
- **Impacto de negócio**: Janela de 30s onde dois analistas podem disputar o mesmo borderô (B tenta ação → 403/404 do server; UX confusa). Mitigado pelo `requireOwnBorderoFilCod` no backend que recusa.
- **Métrica de baseline**: TTL = 30s = janela máxima de inconsistência inter-usuário em ações de escrita.

## 5. Cards Kanban

### [availability-1] Tornar `replaceBorderoCache` atômico (single transaction)

- **Problema**
  > O `replaceBorderoCache` faz INSERT...ON CONFLICT e DELETE em chamadas separadas no `databaseClient`. Se o processo cair entre as duas, o cache fica com órfãos (borderôs já apagados no ERP visíveis na UI). Janela curta mas não-zero, e cresce com latência Postgres.

- **Melhoria Proposta**
  > Envolver as duas statements em `databaseClient.withTransaction(...)`. Alternativa mínima: usar um único `WITH inserted AS (INSERT ... RETURNING bor_cod) DELETE FROM permuta_bordero WHERE bor_cod NOT IN (SELECT bor_cod FROM inserted)` num único `update`.

- **Resultado Esperado**
  > Cache de borderôs sempre consistente após `refreshCache`. Janela de inconsistência: 0s.

- **Tactic alvo**: Transactions / Rollback
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-1
- **Métricas de sucesso**:
  - Borderôs órfãos pós-crash de refresh: indeterminado → 0
  - Statements por refresh: 2 → 1
- **Risco de não fazer**: incidente recorrente (1×/mês) onde analista reporta "borderô que não existe mais aparece na tela"; tempo médio de investigação ~30min por ocorrência.
- **Dependências**: nenhuma

### [availability-2] Tornar `autoAlocarSeElegivel`/`autoAlocarDeCasamento` all-or-nothing

- **Problema**
  > A auto-alocação faz N escritas sequenciais em `permuta_alocacao` via `alocar()`. Se Conexos derrubar a 3ª chamada de 5, o método retorna `true` (porque `some()` acha as 2 anteriores) e a baixa real prossegue com alocação parcial — meia-permuta no ERP, saldo residual no adto.

- **Melhoria Proposta**
  > Envolver o for-loop em transação (`databaseClient.withTransaction`), ou pré-validar TODAS as N invoices (buscar live + cap-check) antes de gravar QUALQUER linha, e gravar tudo em um único `INSERT INTO ... VALUES (...), (...), ...`. Adicionalmente, distinguir o retorno: `'all' | 'partial' | 'none'` em vez de `boolean`, e o caller (`ReconciliacaoPermutaService`) deve abortar a baixa em `'partial'`.

- **Resultado Esperado**
  > 0 cenários de auto-alocação parcial persistida. Falha de Conexos no meio ⇒ rollback completo, analista vê erro claro e re-tenta.

- **Tactic alvo**: Transactions; Rollback
- **Severidade**: P1
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-availability-2
- **Métricas de sucesso**:
  - Alocações órfãs (sem borderô) após falha: indeterminado → 0
  - Cobertura de teste para "falha de Conexos no meio do for-loop": 0 → ≥1 teste por método
- **Risco de não fazer**: meia-permuta gravada no ERP em incidente Conexos = chamada manual da Yuri para conciliar; risco financeiro real (saldo residual de adto vira "perdido" no fluxo).
- **Dependências**: nenhuma; toca código novo do PR.

### [availability-3] Adicionar timeout HTTP no `GET /permutas/status` e demais rotas que fazem fan-out Conexos

- **Problema**
  > O `GET /permutas/status` dispara `Promise.all` sobre N filiais com `RetryExecutor(2, 500ms, jitter 200ms)` cada. Sem timeout do request Express, uma queda Conexos pendura workers por 30+ segundos × N filiais × N analistas. Render dyno tem timeout default de 30s e pode reiniciar com filas penduradas.

- **Melhoria Proposta**
  > Adicionar middleware `express-timeout` (10s) nas rotas que fazem fan-out Conexos LAZY (`/status`, `/borderos?live=true`, `/invoices/buscar`). No serviço, passar um `AbortSignal` com timeout para `listBorderos`/`listFinanceiroAPagar` e usar `Promise.allSettled` em vez de `Promise.all` para o fan-out por filial (já é parcialmente feito via `.catch` por filial, mas não há ceiling de tempo total).

- **Resultado Esperado**
  > Endpoint responde em ≤10s mesmo com Conexos lento. Falha de uma filial não bloqueia as outras nem trava o dyno.

- **Tactic alvo**: Detect Faults — Monitor (timeout); Exception Prevention
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - p95 latência `/permutas/status` em incidente Conexos: > 30s → ≤ 10s
  - Workers Express pendurados em incidente: indeterminado → 0
- **Risco de não fazer**: 1 incidente Conexos = tela inteira de permutas indisponível para todos; dyno reiniciado pelo Render = sessões perdidas.
- **Dependências**: nenhuma

### [availability-4] Expor idade do cache `permuta_bordero` na resposta REST e na UI

- **Problema**
  > A coluna `atualizado_em` existe na `permuta_bordero` mas não é selecionada no `listBorderoCache`, nem propagada para o payload de `GET /permutas/borderos`. Se o cron falhar por 24h, o cache vira fóssil silencioso — analista não sabe que está olhando dado obsoleto.

- **Melhoria Proposta**
  > Selecionar `MAX(atualizado_em)` no `listBorderoCache` e devolver no payload (`{ borderos, cacheUpdatedAt, geradoEm, requestId }`). Frontend mostra badge "Atualizado há Xmin" no header; se > 1h, badge fica laranja e botão "Atualizar" pulsa.

- **Resultado Esperado**
  > Staleness explícito. Operador detecta cache podre antes de tomar decisão.

- **Tactic alvo**: Detect Faults — Timestamp
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - Tempo até detectar cron parado: 24h+ → ≤ 1h (visualmente)
- **Risco de não fazer**: decisão financeira tomada em cima de cache de dias atrás = baixa duplicada ou perdida.
- **Dependências**: nenhuma; coluna já existe.

### [availability-5] Propagar `capHit` de `listInvoicesFinalizadas` para `IngestaoResult` + alarme

- **Problema**
  > `listInvoicesFinalizadas` captura `capHit=true` quando bate `MAX_PAGES=50` (teto teórico 25 000 invoices/filial), mas o `EleicaoPermutasService.computeCandidatas` descarta o sinal. Ingestão pode truncar silenciosamente o universo de invoices, escondendo oportunidades de permuta do analista.

- **Melhoria Proposta**
  > Estender `EleicaoResult` e `IngestaoResult` com `truncatedFiliais: number[]`. Logar `BUSINESS_WARN` por filial truncada com `LOG_TYPE.BUSINESS_WARN`. UI da aba "Ingestão Manual" mostra alerta no modal quando truncatedFiliais ≠ [].

- **Resultado Esperado**
  > Truncamento visível em ≤ 1 run. Analista sabe quando ampliar o filtro ou quando solicitar bump no `MAX_PAGES`.

- **Tactic alvo**: Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - Runs truncadas detectadas: 0 → 100% das que ocorrerem
- **Risco de não fazer**: à medida que o backlog Columbia cresce, ingestão começa a perder invoices; ninguém detecta até auditoria contábil acusar diferença.
- **Dependências**: nenhuma

### [availability-6] Trocar memo per-tab por broadcast (BroadcastChannel) ou polling curto após write

- **Problema**
  > `borderosMemo` é module-scoped no browser: após Usuário-A excluir um borderô, o cache server volta limpo, mas Usuário-B só vê quando o memo TTL (30s) expirar. Janela de 30s onde B vê dado morto e tenta ação que vai 403/404.

- **Melhoria Proposta**
  > Para mitigar simples: usar `BroadcastChannel('permutas-borderos')` no `invalidarBorderosMemo` para informar outras abas/usuários conectados. Para mitigação completa: WebSocket (Supabase Realtime já está no stack — escutar `permuta_bordero` ou um canal de evento). Curto-prazo: reduzir TTL para 10s em telas de ação ativa.

- **Resultado Esperado**
  > Janela de inconsistência inter-usuário: 30s → ≤ 5s.

- **Tactic alvo**: State Resynchronization
- **Severidade**: P3
- **Esforço estimado**: S (≤1d) para BroadcastChannel; M (2-5d) para Realtime
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - Janela máx. de inconsistência inter-aba: 30s → ≤ 1s (mesma aba via BroadcastChannel)
- **Risco de não fazer**: erro 403/404 ocasional na UX durante operações em paralelo; mitigado pelo guard `requireOwnBorderoFilCod` no backend (não vira inconsistência financeira).
- **Dependências**: nenhuma

## 6. Notas do agente

- Escopo estritamente PR v0.7.0; tactics já bem cobertas no resto do sistema (RetryExecutor universal, `setBorCod` write-ahead, idempotency-key no handshake fin010) não foram re-inventariadas.
- O PR melhorou Availability em 3 pontos relevantes (cache local de borderôs + fallback fixture-like via `replaceBorderoCache` no-op em fetch vazio + best-effort em ingestão) e introduziu 1 risco P1 (auto-alocação não-transacional). Score 7/10 reflete progresso líquido positivo com gap acionável.
- Cross-QA: F-availability-2 toca Fault-Tolerance (alocação parcial) e Modifiability (assinatura de retorno boolean ambígua); o `qa-consolidator` deve costurar.
- Não foi possível medir latência real do `GET /permutas/status` nem MTTR da reconciliação — depende de CloudWatch/produção Render (já está nas "Não medíveis").
