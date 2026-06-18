---
qa: Availability
qa_slug: availability
run_id: 2026-06-18-2039
agent: qa-availability
generated_at: 2026-06-18T20:39:00-03:00
scope: backend
score: 7
findings_count: 7
cards_count: 7
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Scheduler (cron diário/manual) + analista clicando "Atualizar" / "Processar" | Falha de rede ou 5xx do Conexos no meio do fan-out (`listFiliais` / `getDetalheTitulos` / `listFinanceiroAPagar`) durante a ingestão; ou Postgres indisponível na leitura `/gestao` | `IngestaoPermutasService` + `EleicaoPermutasService.computeCandidatas` + `GestaoPermutasService.exporGestao` + tela `/permutas` | Operação normal: 1 run/dia + N requests humanos | A run em curso aborta (ROLLBACK), os FATOS last-good (adiantamentos/invoices/declarações/casamentos do run anterior) permanecem visíveis em `/gestao`; o estado do analista (`permuta_processamento`) sobrevive porque é soft-ref por chave natural; o frontend cai em fixture quando o backend responde vazio/erro | 0 perda do estado do analista; 0 janela em branco na tela (último good ou fixture); MTTR da ingestão ≤ 24h (próximo cron) |

Resumo do desenho Fase B: a ingestão diária é **atômica** (`withTransaction`) e **serializada** (`withAdvisoryLock(INGEST_LOCK_KEY=918273645)`); UPSERT-in-place por chave natural Conexos preserva o `last-good` quando o run atual aborta; `markStale` substitui DELETE para que histórico/estado do analista nunca evapore; `/gestao` lê só `NOT stale`; o frontend tem fallback para fixture quando o backend falha.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Atomicidade da ingestão (ROLLBACK em falha) | ✅ ROLLBACK total + cabeçalho `error` fora da tx | tx + erro auditado | ✅ | `IngestaoPermutasService.ts:64-183`, `PostgreeDatabaseClient.ts:102-123` |
| Serialização concorrente (advisory lock) | `pg_try_advisory_lock(918273645)` + `onBusy` lança erro descritivo | 1 ingest por vez por instância | ✅ | `IngestaoPermutasService.ts:37`, `PermutaRelationalRepository.ts:153-170`, `PostgreeDatabaseClient.ts:137-158` |
| Preservação do last-good em falha parcial | UPSERT-in-place + ROLLBACK preservam fatos do run anterior; `permuta_processamento` é soft-ref (sem FK), sobrevive a re-ingestão | last-good visível em `/gestao` | ✅ | `0003_permuta_relational.sql:28-49,103-120`, `0004_permuta_processamento.sql:11-21` |
| Stale sweep no lugar de DELETE | `markStale` marca `stale=TRUE` sem apagar; índices parciais (`WHERE NOT stale`) na leitura | NUNCA deletar fato Conexos | ✅ | `PermutaRelationalRepository.ts:386-409`, migrações 0003 |
| Fan-out Conexos com retry | `RetryExecutor(retries:2, delay:500ms, jitter:200ms)` em cada chamada Conexos | Tactic: Retry | ✅ | `ConexosClient.ts:341-358` |
| Fault-isolation no fan-out de filiais | `BoundedConcurrency.map` propaga 1ª falha e aborta a run inteira; sem fallback a "filial parcial" | Tactic: Degradation / Ignore Faulty Behavior | ⚠️ | `EleicaoPermutasService.ts:216-220, 239-249` |
| Degradação graciosa por adiantamento (DETAIL_INDISPONIVEL) | Detalhe falho após retry → candidata vai a BLOQUEADA com motivo, não derruba a run | Tactic: Degradation | ✅ | `EleicaoPermutasService.ts:458-480` |
| Frontend fallback de leitura (`/gestao`) | `fetchGestaoPermutas` cai em fixture em erro HTTP / payload vazio | nunca quebrar a tela | ⚠️ (fallback mascara estado vazio legítimo) | `src/frontend/lib/api.ts:38-64` |
| Scheduler do job de ingestão | NÃO configurado (cron documentado em comentário); o job só roda se alguém chamar `npm run job:ingest-permutas` | cron diário ativo (EventBridge alvo) | ❌ | `jobs/ingest-permutas.ts:15-17` |
| Healthcheck / heartbeat do job | Nenhuma sinalização externa de sucesso/última-execução (apenas `console.log`) | Tactic: Heartbeat / Monitor | ❌ | `jobs/ingest-permutas.ts:25-29, 32-40` |
| Timeout no `ConexosClient` (HTTP) | `RetryExecutor` controla retry mas NÃO timeout — depende do legacy axios herdado | timeout explícito por chamada | ⚠️ Não medível neste escopo | `ConexosClient.ts:353-358` (legacy `LegacyConexosShape`) |
| Idempotency-Key na ingestão | `EleicaoPermutasService.executar` suporta (P0-6); o job `ingest-permutas.ts` NÃO envia uma key | replay seguro de cron retentado | ⚠️ | `ingest-permutas.ts:24`, `EleicaoPermutasService.ts:103-163` |
| Concorrência ingest × `POST /permutas/eleicao` | Lock-key distinto (`INGEST_LOCK_KEY` ≠ `advisoryLockKey(idempotencyKey)`); um pode rodar em cima do outro | serializar ingest × eleicao manual | ⚠️ | `IngestaoPermutasService.ts:37`, `EleicaoPermutasService.ts:53-59` |
| Testes da ingestão (verde) | 88 testes Permutas / 13 suites — todos verdes; ROLLBACK + error-header cobertos em `IngestaoPermutasService.test.ts:200-223` | regressão coberta | ✅ | `_shared-metrics.md` |
| MTTR real / SLO de disponibilidade | — | — | ⚠️ Não medível localmente | — |

> ⚠️ **Não medível localmente**: MTTR real do job e da tela `/gestao`. Requer telemetria de produção (Render logs + Postgres `permuta_eleicao_run` agregado). Recomendação: instrumentar uma métrica `permuta_ingest_last_success_at` (gauge) e expô-la num endpoint `/health/ingest` que o monitor externo (UptimeRobot/Cronitor) acompanhe — disparar alerta quando `now() - last_success_at > 26h`.

> ⚠️ **Não medível localmente**: timeout efetivo das chamadas Conexos. O `RetryExecutor` controla retries mas o axios subjacente vive em `LegacyConexosShape` (não inspecionado neste escopo). Sem timeout explícito, uma chamada pendurada pode prender o processo inteiro do job até o keep-alive do servidor cair.

## 3. Tactics — Cobertura no nf-projects

### Detect Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | nenhum ping ativo no job | ❌ ausente | — |
| Heartbeat | nenhuma escrita "estou vivo" (só log no fim) | ❌ ausente | `jobs/ingest-permutas.ts:25-40` |
| Monitor | Render logs capturam stdout/exit code; nenhum alarme | ⚠️ parcial | infra Render (sem dashboard) |
| Timestamp | `permuta_eleicao_run.started_at/finished_at` + `last_seen_at`/`last_ingest_run_id` por fato | ✅ presente | `0003_permuta_relational.sql:44-46,69-71,89-91` |
| Sanity Checking | CHECK constraints em `estado_elegibilidade` e `status` do processamento; XOR DI/DUIMP avaliado em compute | ✅ presente | `0003_permuta_relational.sql:41,87`, `0004_permuta_processamento.sql:13-14` |
| Condition Monitoring | nenhum gauge de "stale ratio" ou "casamentos por run" exposto | ❌ ausente | — |
| Voting | N/A — single source of truth (Conexos) | N/A | — |
| Exception Detection | `try/catch` em `executar` + `processFilial`/`buildCandidata` com tipo `ConexosError` | ✅ presente | `IngestaoPermutasService.ts:153-183`, `EleicaoPermutasService.ts:464-480` |
| Self-Test | nenhum smoke-test pós-deploy do job | ❌ ausente | — |

### Recover from Faults — Preparation & Repair
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A — Render single-instance, sem hot-standby | N/A | — |
| Passive Redundancy | snapshot `/painel` (0001) sobrevive em paralelo ao modelo relacional como "leitura back-compat" se `/gestao` falhar | ✅ presente | `IngestaoPermutasService.ts:117-128`, `routes/permutas.ts:101-109` |
| Spare | N/A — sem instância stand-by | N/A | — |
| Exception Handling | `try/catch` propaga via `ConexosError` típico; cabeçalho de erro persistido fora da tx | ✅ presente | `IngestaoPermutasService.ts:153-183` |
| Rollback | `withTransaction` faz ROLLBACK em qualquer falha do `write` callback | ✅ presente | `PostgreeDatabaseClient.ts:113-119`, `PermutaRelationalRepository.ts:153-170` |
| Software Upgrade | N/A para este QA | N/A | — |
| Retry | `RetryExecutor(retries:2, delayMs:500, jitterMs:200)` envolvendo cada chamada Conexos | ✅ presente | `ConexosClient.ts:341-358` |
| Ignore Faulty Behavior | `DETAIL_INDISPONIVEL` — adiantamento individual que falha no detail vira BLOQUEADA, o restante continua | ✅ presente | `EleicaoPermutasService.ts:458-480` |
| Degradation | UPSERT-in-place + ROLLBACK ⇒ tela `/gestao` segue mostrando o último-good; frontend cai em fixture quando backend falha | ✅ presente | `0003_permuta_relational.sql:28-49`, `src/frontend/lib/api.ts:38-64` |
| Reconfiguration | N/A — sem reroteamento dinâmico | N/A | — |

### Recover from Faults — Reintroduction
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | N/A | N/A | — |
| State Resynchronization | a próxima run re-computa do zero a partir do Conexos (idempotência por chave natural + `last_ingest_run_id` + sweep) | ✅ presente | `IngestaoPermutasService.ts:64-152`, `PermutaRelationalRepository.ts:386-409` |
| Escalating Restart | N/A (sem orchestrador de instância) | N/A | — |
| Non-Stop Forwarding | N/A | N/A | — |

### Prevent Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | N/A — sem rolling deploy do job | N/A | — |
| Transactions | `withTransaction` + advisory lock garantem atomicidade da ingestão (BEGIN → upserts → recompute casamento → sweep → COMMIT) | ✅ presente | `PermutaRelationalRepository.ts:153-170`, `PostgreeDatabaseClient.ts:102-123` |
| Predictive Model | nenhum (sem detecção de "Conexos vai cair") | ❌ ausente | — |
| Exception Prevention | Zod no boundary do POST `processar`; constraints CHECK em `estado_elegibilidade`/`status` | ✅ presente | `routes/permutas.ts:14-17`, migrations 0003/0004 |
| Increase Competence Set | `RetryExecutor` cobre transientes de rede; advisory lock cobre disputa de cron + trigger manual da mesma ingestão | ✅ presente | `IngestaoPermutasService.ts:64-114` |

## 4. Findings (achados)

### F-availability-1: Job de ingestão sem scheduler ativo — única fonte de atualização do `/gestao` depende de chamada manual

- **Severidade**: P0
- **Tactic violada**: Heartbeat / Monitor / Removal from Service
- **Localização**: `src/backend/jobs/ingest-permutas.ts:15-17` (comentário "CRON (NÃO configurado)")
- **Evidência (objetiva)**:
  ```
  // CRON (NÃO configurado — entrada documentada apenas):
  //   0 6 * * *  cd /caminho/do/repo/src/backend && npm run job:ingest-permutas
  ```
  E `_shared-metrics.md`: "Job `jobs/ingest-permutas.ts` (cron-ready, not scheduled)".
- **Impacto técnico**: o modelo relacional só é populado se alguém roda `npm run job:ingest-permutas` na mão; em produção, sem cron ativo, os fatos congelam no último run manual. `markStale` nunca corre, então os índices `WHERE NOT stale` continuam apontando para registros velhos sem nenhum sinal.
- **Impacto de negócio**: a tela `/gestao` mostra adiantamentos/invoices/casamentos do dia em que alguém lembrou de rodar o job. O analista pode tomar decisão sobre dado obsoleto e executar permuta sobre um adiantamento já baixado no ERP.
- **Métrica de baseline**: 0 schedulers configurados; 0 alarmes; janela máxima de obsolescência ilimitada.

### F-availability-2: Heartbeat / sinal externo de última execução bem-sucedida ausente

- **Severidade**: P0
- **Tactic violada**: Heartbeat / Monitor / Condition Monitoring
- **Localização**: `src/backend/jobs/ingest-permutas.ts:25-40`
- **Evidência (objetiva)**:
  ```
  console.log(`[ingest-permutas] run ${result.runId} status=${result.status} …`);
  …
  .catch((error) => { console.error(…); process.exit(1); });
  ```
  Não há gravação de "last_success_at" reutilizável por monitor externo, nem endpoint `/health/ingest`, nem POST a um dead-man-switch (Cronitor/Healthchecks.io).
- **Impacto técnico**: a única forma de saber que o job morreu é alguém abrir os logs do Render. Cron pode estar quebrado por dias.
- **Impacto de negócio**: incidente silencioso — área financeira vê dados velhos e não sabe.
- **Métrica de baseline**: 0 heartbeats externos; 0 alarmes ligados ao job.

### F-availability-3: Job não envia `Idempotency-Key` ao `EleicaoPermutasService` reusado pela ingestão

- **Severidade**: P1
- **Tactic violada**: Increase Competence Set / Exception Prevention
- **Localização**: `src/backend/jobs/ingest-permutas.ts:24` chamando `service.executar({ triggeredBy: 'cron' })`
- **Evidência (objetiva)**:
  ```
  const result = await service.executar({ triggeredBy: 'cron' });
  ```
  `IngestaoPermutasService.executar` (`IngestaoPermutasService.ts:64-72`) chama `eleicaoService.computeCandidatas()` direto — NÃO existe a hipótese de replay por key como em `EleicaoPermutasService.executar` (`EleicaoPermutasService.ts:103-163`). O lock `INGEST_LOCK_KEY` (`918273645`) cobre a serialização do WRITE, mas o `compute` (fan-out Conexos) NÃO é dedup quando o cron é retentado pelo scheduler (Render retry-on-fail, supervisor que reagenda).
- **Impacto técnico**: um retry do cron logo após uma falha de gravação dispara novo fan-out Conexos completo (centenas de chamadas) que estoura o limite de sessões do ERP (LOGIN_ERROR_MAX_SESSIONS).
- **Impacto de negócio**: pressão duplicada sobre o ERP em manhã de incidente; risco de o ERP rejeitar a aplicação inteira por sessões esgotadas.
- **Métrica de baseline**: 0 dedup do `compute` entre runs de ingestão; potencial de 2× fan-out por retry.

### F-availability-4: Frontend mascara backend vazio como "fixture" — incidente silencioso na tela `/gestao`

- **Severidade**: P1
- **Tactic violada**: Detect Faults — Exception Detection
- **Localização**: `src/frontend/lib/api.ts:38-64`
- **Evidência (objetiva)**:
  ```
  if (!json?.pendentes?.length && !json?.invoicesEmAberto?.length) {
      return gestaoPermutasFixture
  }
  ```
  Quando o backend responde 200 com payload vazio (caso real: ingestão nunca rodou ou markStale derrubou tudo), o frontend troca para fixture e mostra dados *demo* como se fossem reais.
- **Impacto técnico**: a tela exibe um badge "fonte: fixture", mas o usuário pode ignorar; estado vazio legítimo (zero pendências) também é mascarado pelo fixture.
- **Impacto de negócio**: analista trabalha em cima de dados de demonstração. Risco de processar adiantamentos inexistentes.
- **Métrica de baseline**: 1 caminho que confunde "vazio" com "indisponível"; nenhum alerta UI.

### F-availability-5: Concorrência ingest × `POST /permutas/eleicao` não serializa — locks distintos podem co-rodar

- **Severidade**: P1
- **Tactic violada**: Transactions / Prevent Faults
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:37` (`INGEST_LOCK_KEY = 918273645`) vs. `EleicaoPermutasService.ts:53-59` (`advisoryLockKey(idempotencyKey)`)
- **Evidência (objetiva)**:
  ```
  // IngestaoPermutasService
  export const INGEST_LOCK_KEY = 918273645;
  // EleicaoPermutasService
  const advisoryLockKey = (key: string): number => { …djb2… }
  ```
  Os dois caminhos disputam recursos Conexos idênticos mas com lock-keys diferentes. Um cron de ingestão e um analista clicando "POST /permutas/eleicao" podem disparar fan-outs paralelos contra o mesmo Conexos.
- **Impacto técnico**: o pool de sessões Conexos pode ser duplamente consumido; testes provam isolamento individual mas não a coexistência. O snapshot da Eleição e o modelo relacional da ingestão podem ficar de gerações Conexos diferentes.
- **Impacto de negócio**: risco operacional baixo (Render single-instance ameniza), mas o desenho não veta o cenário.
- **Métrica de baseline**: 0 lock compartilhado; tempo médio de uma run completa = N pgs × 500ms (≥ minutos), janela ampla para concorrência.

### F-availability-6: Sem timeout explícito no `ConexosClient`/legacy axios — risco de hang infinito no job

- **Severidade**: P1
- **Tactic violada**: Detect Faults — Monitor (Timestamp); Retry sem Timeout não é Retry
- **Localização**: `src/backend/domain/client/ConexosClient.ts:341-358` (`RetryExecutor` herda timeout do `LegacyConexosShape`)
- **Evidência (objetiva)**:
  ```
  this.retryExecutor = new RetryExecutor({ retries: 2, delayMs: 500, jitterMs: 200 });
  ```
  Nenhuma configuração de `timeout` na criação do executor nem no contrato `LegacyConexosShape`. Se o Conexos pendurar a conexão (TCP keep-alive falho), o `Promise` do `legacy.getX()` nunca resolve e o RetryExecutor nunca dispara o retry.
- **Impacto técnico**: o processo do job pode ficar travado por horas até o supervisor matar. Durante esse hang, a próxima execução do cron acumula e dispara em sequência (se o scheduler chegar a existir).
- **Impacto de negócio**: nenhuma escrita acontece, mas nenhum alarme dispara (ver F-availability-2). Erosão silenciosa do SLA.
- **Métrica de baseline**: 0 timeouts declarados nos paths em escopo.

### F-availability-7: `DELETE FROM permuta_casamento` recompute total é frágil se a ingestão for parcialmente interrompida fora da tx

- **Severidade**: P2
- **Tactic violada**: State Resynchronization / Atomicity
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:340-349`
- **Evidência (objetiva)**:
  ```
  public replaceAutoCasamentos = async (tx, runId, rows) => {
      await tx.update('DELETE FROM permuta_casamento', {});
      for (const chunk of chunked(rows, UPSERT_CHUNK)) {
          await this.insertCasamentoChunk(tx, runId, chunk);
      }
  };
  ```
  Roda dentro de `withTransaction`, então ROLLBACK protege. Mas: se o pool/conexão cair entre o DELETE e o INSERT (raro, não impossível em Supavisor transaction mode), o COMMIT falha e o ROLLBACK depende do Postgres terminar a sessão antes de outra sessão ver "0 casamentos". Sem `RetryExecutor` no path da tx (vide `PostgreeDatabaseClient.ts:196`, `queryRetryExecutor` só envolve `query` — não `withTransaction`).
- **Impacto técnico**: numa falha de conexão DURANTE a tx, o ROLLBACK acontece (correto), mas a operação inteira precisa ser refeita do zero — sem retry da tx, isso depende do supervisor reagendar o job. Em condições normais é ok; em incidente prolongado de Postgres, sem cron, simplesmente para.
- **Impacto de negócio**: baixo — last-good preservado e re-processo no próximo run resolve.
- **Métrica de baseline**: 0 retries de transação; depende 100% do reagendamento externo (que não existe — ver F-1).

## 5. Cards Kanban

### [availability-1] Ativar scheduler do job `ingest-permutas` e expor heartbeat externo

- **Problema**
  > O job `jobs/ingest-permutas.ts` está implementado e testado, mas não tem nenhum agendador ativo em produção (Render). A linha de cron está apenas em comentário. Sem isso, a tela `/gestao` mostra fatos congelados do último disparo manual e `markStale` nunca corre.
- **Melhoria Proposta**
  > Adicionar um Render Cron Job (ou alternativa equivalente no Render) executando `npm run job:ingest-permutas` em `0 6 * * *`. Em paralelo, gravar `permuta_eleicao_run` mais recente (kind='ingest', status='success') como heartbeat e expor `GET /health/ingest` retornando `last_success_at` para um dead-man-switch externo (Cronitor / Healthchecks.io). Tactic Bass: **Heartbeat + Monitor**.
- **Resultado Esperado**
  > Ingestão diária automatizada com sinal externo. Janela de obsolescência ≤ 24h, alerta em < 26h sem sucesso.
- **Tactic alvo**: Heartbeat
- **Severidade**: P0
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-1, F-availability-2
- **Métricas de sucesso**:
  - `# cron agendado para o job`: 0 → 1
  - `# alarmes ativos sobre last_success_at`: 0 → 1
  - janela máxima sem refresh do `/gestao`: ∞ → 26h
- **Risco de não fazer**: analista decide sobre dados de dias atrás sem perceber; permuta executada sobre adiantamento que já foi baixado fora do sistema.
- **Dependências**: nenhum bloqueio — o serviço já está pronto.

### [availability-2] Fechar a janela de retries do cron com `Idempotency-Key` na ingestão

- **Problema**
  > O job chama `IngestaoPermutasService.executar({ triggeredBy: 'cron' })` sem `Idempotency-Key`. Um retry do scheduler ou um supervisor que dispara duas execuções em sequência causa fan-out duplicado contra o Conexos.
- **Melhoria Proposta**
  > Derivar uma `idempotencyKey` por janela de tempo (ex.: `ingest:${YYYY-MM-DD}`) no `jobs/ingest-permutas.ts` e propagar até o `computeCandidatas` ou usar a versão `EleicaoPermutasService.executar({ idempotencyKey })` com replay quando a key já produziu uma run válida. Tactic Bass: **Increase Competence Set**.
- **Resultado Esperado**
  > Cron retentado no mesmo dia reaproveita a run anterior em vez de re-disparar Conexos.
- **Tactic alvo**: Increase Competence Set
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - `# fan-outs duplicados em retry do cron`: 1 por retry → 0
- **Risco de não fazer**: pressão em sessões Conexos em incidente; ERP rejeita login do tenant.
- **Dependências**: F-availability-1 (sem cron, retry de cron não acontece).

### [availability-3] Distinguir "indisponível" de "vazio" no fallback do `/gestao` no frontend

- **Problema**
  > `fetchGestaoPermutas` em `src/frontend/lib/api.ts:45-47` substitui um payload vazio do backend por um fixture de demonstração. Estado vazio legítimo (ingestão rodou e não há pendências) também é coberto pela fixture, e o usuário só percebe pelo badge "fonte: fixture".
- **Melhoria Proposta**
  > Separar os caminhos: (a) erro HTTP / `throw` → fixture, com toast `info` "modo demonstração"; (b) 200 vazio → renderizar EmptyState real ("Nenhuma pendência hoje"); (c) qualquer fixture exibida deve mostrar banner persistente, não apenas o badge `fonte`. Tactic Bass: **Exception Detection**.
- **Resultado Esperado**
  > Vazio legítimo ≠ falha; usuário não confunde fixture com banco. Eventos de fallback observáveis no console (e idealmente em uma métrica frontend).
- **Tactic alvo**: Exception Detection
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - `# caminhos onde vazio == fallback`: 1 → 0
- **Risco de não fazer**: analista opera sobre fixture acreditando ser produção (compliance / auditoria).
- **Dependências**: nenhuma.

### [availability-4] Compartilhar o advisory lock entre ingest e eleicao para evitar fan-out Conexos paralelo

- **Problema**
  > A ingestão (`INGEST_LOCK_KEY=918273645`) e a eleição manual (`advisoryLockKey(idempotencyKey)`) usam keys diferentes; nada impede que cron e analista disparem fan-outs simultâneos contra o mesmo Conexos.
- **Melhoria Proposta**
  > Introduzir um lock-key adicional `CONEXOS_FANOUT_LOCK` adquirido por AMBOS os caminhos (ingest e eleicao) ANTES de chamar `computeCandidatas`. Em "lock busy", o segundo caminho retorna a última run como replay. Tactic Bass: **Transactions / Prevent Faults**.
- **Resultado Esperado**
  > No máximo 1 fan-out Conexos em voo por tenant; pool de sessões Conexos protegido em coexistência cron × botão.
- **Tactic alvo**: Transactions
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - `# fan-outs simultâneos possíveis`: 2 → 1
- **Risco de não fazer**: incidente cumulativo se Conexos rate-limit reduzir; baixa probabilidade enquanto Render é single-instance.
- **Dependências**: F-availability-1 (cron precisa existir para o cenário concreto).

### [availability-5] Timeout explícito em todas as chamadas Conexos antes do RetryExecutor

- **Problema**
  > O `ConexosClient` envolve cada chamada em `RetryExecutor`, mas não declara timeout; o axios subjacente em `LegacyConexosShape` pode pendurar a conexão indefinidamente e o retry nunca dispara.
- **Melhoria Proposta**
  > Garantir `timeout: 30_000ms` (ou outro acordado) no axios do legacy client, e adicionar `Promise.race` defensivo no `RetryExecutor.execute` no `ConexosClient` (não nos paths Postgres). Cobrir com teste fake-timer. Tactic Bass: **Retry pressupõe Timestamp/Timeout**.
- **Resultado Esperado**
  > Hang no Conexos = falha em ≤ 30s, virando retry e em seguida `ConexosError`, deixando o `BoundedConcurrency` abortar o resto.
- **Tactic alvo**: Retry + Timestamp
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - `# clients externos com timeout explícito`: 0 → 1
- **Risco de não fazer**: job preso por horas sem alarme (composto com F-availability-2).
- **Dependências**: requer leitura do `LegacyConexosShape` (fora do escopo deste review).

### [availability-6] Retry transacional para a ingestão em falha transitória de conexão Postgres

- **Problema**
  > `withTransaction` no `PostgreeDatabaseClient` não tem `RetryExecutor` — só o `query` plano (linhas `196-201`) tem. Uma queda de conexão durante a tx de ingestão (Supavisor transaction mode) força o operador a reagendar manualmente.
- **Melhoria Proposta**
  > Envolver `IngestaoPermutasService.executar` (ou o `persistIngestRun` no repositório) num `RetryExecutor` com 1 tentativa adicional e backoff, **mas só** para erros transientes (`isTransientConnectionError`). NÃO retentar `ConexosError` originado fora da tx — isso já é função da run seguinte. Tactic Bass: **Retry + State Resynchronization**.
- **Resultado Esperado**
  > Falha transitória de Postgres não desperdiça o fan-out Conexos já executado nesta run.
- **Tactic alvo**: Retry
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-7
- **Métricas de sucesso**:
  - `# falhas de Postgres transientes que viram fan-out perdido`: 100% → 0
- **Risco de não fazer**: depende muito da estabilidade do Supavisor; aceitar por enquanto e revisar pós-monitoramento.
- **Dependências**: F-availability-1 (sem cron, o tema é teórico).

### [availability-7] Métrica de saúde: stale-ratio e idade do último run em painel operacional

- **Problema**
  > Não há gauge externo que mostre quantos fatos estão `stale=true` nem quando foi o último `permuta_eleicao_run` com `kind='ingest'` e `status='success'`. A saúde do sistema é hoje inferida lendo o banco direto.
- **Melhoria Proposta**
  > Endpoint `GET /health/ingest` (read-only) devolvendo: `lastRunId`, `lastRunFinishedAt`, `stalePercentByEntity`, `totalAdiantamentosAtivos`. Plugar no fixture de monitor (UptimeRobot/Cronitor) e no header da tela `/gestao` (badge "atualizado em…"). Tactic Bass: **Condition Monitoring**.
- **Resultado Esperado**
  > Operador e analista veem a frescura do dado sem abrir o banco; alerta automático quando stale > X% ou idade > 26h.
- **Tactic alvo**: Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-1, F-availability-2
- **Métricas de sucesso**:
  - `# painéis de saúde do job`: 0 → 1
  - `# campos de frescura na tela`: 0 → 1
- **Risco de não fazer**: incidente prolongado descoberto pelo usuário em vez de pelo time.
- **Dependências**: nenhuma (o `permuta_eleicao_run` já guarda os timestamps).

## 6. Notas do agente

- Quick mode: não rodei comandos de DLQ/Terraform — o repo é Render+Express (estado atual), portanto SQS/DLQ/EventBridge são alvos. Os achados acima são todos sobre o caminho que executa hoje.
- Pontos fortes do desenho Fase B foram explicitamente preservados na nota (atomicidade da tx, UPSERT-in-place por chave natural, `markStale` em vez de DELETE, soft-ref do `permuta_processamento`) — isso é o que sustenta a nota 7.
- Cross-QA: F-availability-5 (lock-key isolado) e F-availability-6 (timeout) tocam Fault-Tolerance — alertar o consolidator. F-availability-3 conversa com Security (retry de cron sem dedup pode escalar para amplificação de chamadas autenticadas no Conexos).
- MTTR real e SLO foram declarados não-medíveis localmente; recomendação concreta está no card availability-7.
