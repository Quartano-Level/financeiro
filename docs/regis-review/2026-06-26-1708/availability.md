---
qa: Availability
qa_slug: availability
run_id: 2026-06-26-1708
agent: qa-availability
generated_at: 2026-06-26T17:30:00-03:00
scope: all
score: 5
findings_count: 10
cards_count: 7
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao Financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (upstream único) | Indisponibilidade transitória (502/504/timeout) durante uma janela de baixa em lote — agora MULTI-TÍTULO (uma alocação ⇒ N `gravarBaixaPermuta` no mesmo borderô) | Express (Render starter) → `ConexosBaixaClient` (split CC-2) → handshake 1 (criarBordero) + N×4 chamadas (`validarTituloBaixa` × `validarTituloPermuta` × `atualizarValorLiquido` × `gravarBaixaPermuta`) em `fin010` | Produção single-tenant (Render Web 1 instância, Supabase Postgres, Conexos Cloud externo) | (a) retry transparente nas LEITURAS; (b) NÃO retry em escritas não-idempotentes (`criarBordero`, `gravarBaixaPermuta`, `excluir/finalizar/cancelar/estornar`); (c) persistir intenção write-ahead (`reconciling` + `borCod`); (d) marcar `error` e seguir adto-a-adto (continue-on-error); (e) R-4 fail-closed: `reconciling`+`borCod` órfão NUNCA é re-POSTado (anti super-pagamento). | 0% baixa duplicada; 100% das execuções com falha capturadas em `permuta_alocacao_execucao` com `borCod` e payload; falha de até 1 par adto↔invoice (ou 1 título dentro do par) não interrompe o lote; MTTR percebido = tempo do operador conciliar manualmente no Conexos. |

Cenário secundário 1 (multi-título partial-success — NOVO neste run): handshake morre entre `gravarBaixaPermuta` do título 1 e o do título 2 do MESMO par adto↔invoice. R-4 corretamente protege o re-POST do par, mas a trilha só persiste **um** `bxaCodSeq` (o do índice 0 em `markSettled`) — todos os bxaCodSeqs intermediários do array `bxaCodSeqs` vivem só no `erpResponse` jsonb agregado se o markSettled chegar a rodar; se não chegar (marca `error`), nenhum `bxa_cod_seq` é persistido. A conciliação manual depende do operador olhar `listBaixasErp` no borderô.

Cenário secundário 2 (cron): falha no run das 09:00 UTC (GitHub Actions) durante a janela de ingestão → próxima rodada em 6h → snapshot de `/permutas` defasado em até 6h. Sem alerta automático além de email padrão do GitHub.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Sub-clients Conexos com `RetryExecutor` aplicado em LEITURAS | 4/4 (ConexosBaseClient.runWithRetry usado por ConexosBaixaClient/TitulosClient/CadastroClient/FinanceiroClient) | 100% das leituras críticas | ✅ | `ConexosBaseClient.ts:127-132,166`; `ConexosBaixaClient.ts:156,298,359,393,426`; `ConexosTitulosClient.ts:218,280`; `BcbClient.ts:54`; `PostgreeDatabaseClient.ts:36` |
| Sub-clients Conexos cujas ESCRITAS não-idempotentes ficam SEM retry | 6/6 (criarBordero, gravarBaixaPermuta, excluirBaixa, excluirBordero, finalizarBordero, cancelarBordero, estornarBordero) | 100% (decisão explícita; documentada no doc-comment de cada método) | ✅ | `ConexosBaixaClient.ts:67-92,225-279,464-480`; comentários do tipo "SEM RetryExecutor (Regis 2026-06-23, F-fault-tolerance-1)" |
| Zod no boundary de resposta das ESCRITAS críticas | 2/2 (`BORDERO_CRIADO_SCHEMA` exige `borCod>0`; `BAIXA_GRAVADA_SCHEMA` exige `bxaCodSeq>0`) | 100% das escritas que viram confirmação persistida | ✅ | `ConexosBaixaClient.ts:20-35,88,476` |
| Idempotency guard "in-doubt" (R-4 / fail-closed) em `reconciling`+`borCod` órfão | Presente + coberto por teste (`in-doubt (R-4): execução anterior reconciling+bor_cod NÃO é re-POSTada`) | obrigatório | ✅ | `ReconciliacaoPermutaService.ts:178-212`; `ReconciliacaoPermutaService.test.ts:130-155` |
| Anti-drift "baixa > em-aberto vivo do ERP" (Bass: Sanity Checking em escrita) | Presente; ainda APLICADO POR TÍTULO após split multi-título (`valorBaixaDesejado > emAbertoErp + tolerancia` aborta o handshake) | obrigatório por título | ✅ | `ReconciliacaoPermutaService.ts:418-426` |
| Persistência de TODOS os `bxaCodSeq` em baixa multi-título | Parcial: só `bxaCodSeqs[0]` vai em `markSettled.bxaCodSeq`; o array completo vive só no `erp_response` jsonb (quando markSettled roda) — em `markError` nenhum `bxa_cod_seq` é persistido | 100% rastreável por título (coluna estruturada ou tabela filha `permuta_alocacao_baixa_titulo`) | ❌ | `ReconciliacaoPermutaService.ts:330,346,353-360`; `PermutaExecucaoRepository.ts:281-310` |
| Clients externos com `timeout` explícito | 3/3 (`services/conexos.ts:81` 40s; `BcbClient.ts:57` 10s; `PostgreeDatabaseClient.ts:27-28` connect 5s/idle 10s) | 100% | ✅ | `services/conexos.ts:79-83`; `BcbClient.ts:54-58`; `PostgreeDatabaseClient.ts:23-30` |
| Implementações de `IExecutor` (FallbackExecutor/PollExecutor) | 1/3 — só `RetryExecutor.ts` existe (sem mudança no run pré-CC-1/CC-2; CC-2 reaproveitou retry via `ConexosBaseClient.runWithRetry`) | ≥1 fallback rota crítica (ex.: cache `permuta_bordero` stale-while-error) | ❌ | `ls src/backend/domain/libs/executor/` → `RetryExecutor.{ts,test.ts}`; `grep -rn "FallbackExecutor\|PollExecutor" src/backend` → 0 ocorrências |
| Degradação parcial em `refreshCache` por filial | Presente: `.catch(async (err) → return [])` por filial em `BorderoGestaoService.refreshCache` (1 filial cai → demais seguem) | rota crítica protegida | ✅ | `BorderoGestaoService.ts:386-400` |
| Handlers de `SIGTERM`/`uncaughtException` | 0 (sem alteração após CC-1/CC-2) | ≥1 (drenar in-flight reconciliação no shutdown) | ❌ | `grep -rn "process.on\|SIGTERM" src/backend` → 0 ocorrências; `src/backend/index.ts:99-102` |
| Dependências de APM/observabilidade externa | 0 (sem Sentry, Datadog, OpenTelemetry exporter) | ≥1 (mínimo Sentry para erros do backend + cron) | ❌ | `grep -rn "Sentry\|datadog\|opentelemetry" src/backend` → 0 fora de transitivas |
| Profundidade do `/health` endpoint | Stub estático: `{ status: 'ok', version }` sem probe de DB/Conexos | Liveness real (`SELECT 1`) + readiness | ❌ | `src/backend/index.ts:65`; `render.yaml:21` (healthCheckPath aponta pra cá) |
| Circuit breaker em `ConexosBaseClient` (compartilhado por todos os sub-clients pós-CC-2) | 0 (apenas retry 2× + delay 500ms + jitter 200ms) | ≥1 breaker abrindo após N falhas consecutivas | ❌ | `ConexosBaseClient.ts:127-132`; `grep -rn "circuit\|breaker\|opossum"` → 0 |
| Self-test no boot do processo | 0 (`bootstrapAppContainer` lazy em route + `ensureSid` lazy em sub-client) | ≥1 smoke probe antes de `app.listen` | ❌ | `src/backend/index.ts:100-102`; `ConexosBaseClient.ts:136` |
| Guards de state-machine em escrita (`pending → reconciling → settled/error`) | SQL `CASE WHEN status='settled' THEN preserve ELSE replace` impede regressão de settled (re-aberto retry preserva `settled`) | obrigatório | ✅ | `PermutaExecucaoRepository.ts:223-256` |
| Continue-on-error no lote + cap LOTE_MAX | `reconciliarLote` engole erro por adto, agrega `totalErros`; cap LOTE_MAX=6 | continue-on-error obrigatório | ✅ | `ReconciliacaoLotePermutaService.ts:113-149` |
| Tactic "Degradation" — modo dry-run / `error` queue | `dryRun` default = ON (em falta de flags); escritas com falha → status `error` + `borCod` + payload na trilha; UX surfacea para conciliação manual | Caminho explícito de degradação | ✅ | `ReconciliacaoPermutaService.ts:127-148,243-260`; `EnvironmentProvider.ts:69-70` |
| Reconfiguration via kill-switch | `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` em env (sync:false no render.yaml) — trocar exige redeploy do dashboard | Hot-toggle sem redeploy | ⚠️ | `EnvironmentProvider.ts:69-70`; `render.yaml:30-39` |
| Cron de ingestão — retry em falha do run | 0 (próximo run só em 6h: `0 9,15,21 * * *`); sem `if: failure()` | ≥1 retry com backoff OU alerta automático | ❌ | `.github/workflows/ingest-permutas.yml:11-15` |

> ⚠️ **Não medível localmente**: MTTR real, uptime mensal, taxa de erro p95, latência p95 das chamadas Conexos em produção, contagem de execuções `error` históricas, frequência de SIGTERM no Render. Requer dashboards externos (Sentry/Render Metrics/Supabase). Recomendação: instrumentar Sentry no backend (captura no `errorMiddleware`) + métrica custom `permuta_execucao_status_count{status}` (Prometheus/Render) + alerta quando `error/min > 0` por 5min consecutivos.

> ⚠️ **Não medível localmente**: número de baixas multi-título com partial-success em produção (titulo 1..N-1 OK + titulo N falha). Requer query manual na trilha cruzando `status='error' AND bor_cod IS NOT NULL` com `fin010/baixas/list/{borCod}` no ERP. Recomendação: novo dashboard "borderôs com baixas parciais não-conciliadas".

> ⚠️ **Não medível localmente**: ocorrência histórica de "borderô órfão" (em-cadastro sem baixa) por SIGTERM no meio do handshake. Requer query manual no ERP cruzando `permuta_alocacao_execucao.status='reconciling'` antigos com `permuta_bordero` no Conexos.

## 3. Tactics — Cobertura no Financeiro

### Detect Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | `/health` retorna 200 estático sem probar Postgres nem Conexos; Render usa para liveness apenas. | ⚠️ parcial | `src/backend/index.ts:65`; `render.yaml:21` |
| Heartbeat | Cron de ingestão (GitHub Actions) é o "heartbeat" de facto, mas o próprio cron não emite heartbeat. Sem heartbeat do backend. | ❌ ausente | `.github/workflows/ingest-permutas.yml` |
| Monitor | Apenas `console.log/error` para Render stdout via `LogService` + `Logger.ts`. Sem agregação, sem alerta, sem dashboard. | ⚠️ parcial | `src/backend/domain/libs/logger/Logger.ts`; `http/errorMiddleware.ts:22-29` |
| Timestamp | `criado_em`/`atualizado_em` em toda escrita; `dataMovto` epoch; `X-Request-Id` middleware echo. | ✅ presente | `PermutaExecucaoRepository.ts:223-241`; `middleware/requestId.ts`; migrations/0015 |
| Sanity Checking | Zod nos boundaries (rotas + ERP responses `BORDERO_CRIADO_SCHEMA`/`BAIXA_GRAVADA_SCHEMA`); anti-drift `valorBaixaDesejado > emAbertoErp + tolerancia` aborta POR TÍTULO no novo loop multi-título; `assertNoErpError` lê envelope `{messages}` no fin010. | ✅ presente | `ConexosBaixaClient.ts:20-35,88,476`; `ReconciliacaoPermutaService.ts:418-426,611-619` |
| Condition Monitoring | `borderoAindaValido(filCod, borCod)` confere estado vivo do ERP antes de re-baixar settled; `getBordero` retorna null em 404. | ✅ presente | `ReconciliacaoPermutaService.ts:626-637`; `ConexosBaixaClient.ts:103-133` |
| Voting | N/A — Conexos é fonte única da verdade financeira; não há réplicas para comparar. | N/A | — |
| Exception Detection | `asyncHandler` + `errorMiddleware`; tipos `ConexosError`, `IngestLockBusyError`, `MissingFilCodError`; `markError` persiste resposta crua + `borCod`. | ✅ presente | `http/asyncHandler.ts`; `http/errorMiddleware.ts`; `domain/errors/` |
| Self-Test | `bootstrapAppContainer` é lazy (chamado por-rota em `routes/permutas.ts`); `ensureSid` lazy. Falha aparece só na 1ª request. | ❌ ausente | `src/backend/index.ts:100-102`; `ConexosBaseClient.ts:136`; `routes/permutas.ts:547` |

### Recover from Faults — Preparation & Repair
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | Render starter = 1 worker; Conexos é único upstream; Supabase managed (HA opaco). | ❌ ausente | `render.yaml:10` |
| Passive Redundancy | Cache local `permuta_bordero` reaproveitado quando refresh cai (per-filial via `.catch → []`); Supabase PITR (managed). | ⚠️ parcial | `BorderoGestaoService.ts:386-400`; migrations/0018 + 0020 |
| Spare | N/A — single-instance, sem nodes em standby. | N/A | `render.yaml` |
| Exception Handling | Central `errorMiddleware` + 401-retry em axios + `markError` per-execução + `try/catch` por adto no lote + `try/catch` por título no multi-título (via `executarBaixa` → `baixarTitulo`). | ✅ presente | `http/errorMiddleware.ts:12-36`; `ReconciliacaoLotePermutaService.ts:115-148`; `ReconciliacaoPermutaService.ts:228-260` |
| Rollback | `withTransaction(BEGIN/COMMIT/ROLLBACK)`; `renameKey` em borderô cancelado libera re-baixa; multi-título NÃO faz rollback intra-borderô (parcial fica no ERP). | ⚠️ parcial | `PostgreeDatabaseClient.ts:102-123`; `ReconciliacaoPermutaService.ts:170-176`; `ReconciliacaoPermutaService.ts:332-351` |
| Software Upgrade | `preDeployCommand: npm run migrate` no Render antes do tráfego trocar; `autoDeploy: true` gated por branch protection. | ✅ presente | `render.yaml:17-22` |
| Retry | `RetryExecutor` em LEITURAS (sub-clients compartilham `ConexosBaseClient.runWithRetry`: 2 tentativas, 500ms + jitter 200ms; PG: 3, 200ms + jitter 200ms; PG pool init: 5, 2000ms). ESCRITAS no fin010 SEM retry por design (documentado em cada método de `ConexosBaixaClient`). | ✅ presente | `ConexosBaseClient.ts:127-132,166`; `RetryExecutor.ts:31-71`; `PostgreeDatabaseClient.ts:36-43,54-58` |
| Ignore Faulty Behavior | `getBordero` ignora 404 → null; `borderoAindaValido` ignora cancelado/estornado/removido para liberar re-baixa; multi-título engole erro de `listTitulosAPagar` e cai para fallback "1 título com valor cheio". | ⚠️ parcial | `ConexosBaixaClient.ts:128-132`; `ReconciliacaoPermutaService.ts:302-323,626-637` |
| Degradation | `dryRun` default ON; `error` queue para conciliação manual; `reconciliar-lote` continue-on-error; `LOTE_MAX=6` cap; `refreshCache` per-filial best-effort. | ✅ presente | `ReconciliacaoPermutaService.ts:127-148`; `ReconciliacaoLotePermutaService.ts:14,113-149`; `BorderoGestaoService.ts:386-400` |
| Reconfiguration | Kill-switch `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` via env (lido em todo request via `EnvironmentProvider`). Trocar exige redeploy/restart no Render (sync:false). | ⚠️ parcial | `EnvironmentProvider.ts:69-70,96-97`; `render.yaml:30-39` |

### Recover from Faults — Reintroduction
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | `dryRun` é um modo shadow de facto: monta payload + loga, não posta. | ✅ presente | `ReconciliacaoPermutaService.ts:134-148` |
| State Resynchronization | `?live=true` em `GET /borderos` refresca cache `permuta_bordero` ao vivo do ERP; `borderoAindaValido` resincroniza per-execução; ingestão diária regrava cache. Sem job periódico de resync explícito da trilha (`reconciling` antigo). | ⚠️ parcial | `routes/permutas.ts:570-580`; `BorderoGestaoService.ts:297-358`; `ReconciliacaoPermutaService.ts:626-637` |
| Escalating Restart | Sem `process.on('SIGTERM')` — Render mata o container e in-flight reconciliações terminam abruptas. Sob multi-título o intervalo de risco aumenta (N×4 chamadas por par em vez de 4). | ❌ ausente | `src/backend/index.ts:99-102` (apenas `app.listen`) |
| Non-Stop Forwarding | N/A — não é router/network device. | N/A | — |

### Prevent Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | Sem blue/green nem instância secundária; remoção = pausar deploy no dashboard Render. | ❌ ausente | `render.yaml` |
| Transactions | `withTransaction` atômico; `withAdvisoryLock` serializa ingestão; `persistIngestRun` dentro de uma única tx; `beginExecution` ON CONFLICT + CASE preserva `settled`. | ✅ presente | `PostgreeDatabaseClient.ts:102-158`; `PermutaRelationalRepository.ts:187-206`; `PermutaExecucaoRepository.ts:223-256` |
| Predictive Model | Sem anomaly detection, sem alerta em retry-rate / latência / fila de error. | ❌ ausente | — |
| Exception Prevention | Zod nos boundaries; anti-drift por título; `MissingFilCodError`; `LOTE_MAX` cap; mutex de login no Conexos (`loginPromise`) previne `LOGIN_ERROR_MAX_SESSIONS`; `criadoEm.toISOString().sort()[0]` evita NaN no borCod via guard de identidade em `listBorderos`/`listBaixas`. | ✅ presente | `services/conexos.ts:73-140`; `ReconciliacaoLotePermutaService.ts:14`; `ConexosBaixaClient.ts:184-186,340-342`; `ReconciliacaoPermutaService.ts:418-426` |
| Increase Competence Set | `dryRun` preview; runbook `docs/runbooks/fin010-write-cutover.md` (referenciado em `render.yaml`); UX surfacea `error/parcial/skipped` por adto. Sem treinamento proativo do operador para o caso novo multi-título partial-success. | ⚠️ parcial | `render.yaml:32-33`; `ReconciliacaoLotePermutaService.ts:17` |

## 4. Findings (achados)

### F-availability-1: Multi-título sem rastreamento granular de `bxa_cod_seq` por título (partial-success cego)

- **Severidade**: P1
- **Tactic violada**: State Resynchronization, Exception Detection (granularidade), Rollback
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:279-382`; `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:277-331`
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:330,346,353-360
  const bxaCodSeqs: number[] = [];
  for (const t of titulos) {
      ...
      const r = await this.baixarTitulo({...});
      bxaCodSeqs.push(r.bxaCodSeq);
      ...
  }
  await this.execucaoRepository.markSettled(key, {
      borCod,
      bxaCodSeq: bxaCodSeqs[0],                        // SÓ O PRIMEIRO
      ...
      erpResponse: { bxaCodSeqs, totalBaixadoBrl, titulos: bxaCodSeqs.length },
  });
  ```
  `markError` em falha intra-loop NÃO recebe os `bxaCodSeqs` já gravados — só `borCod`. Coluna `bxa_cod_seq` permanece `NULL`.
- **Impacto técnico**: Se o handshake morre entre o `gravarBaixaPermuta` do título k e o do título k+1 (k≥1), o ERP fica com k baixas committadas; a trilha grava `status='error'` + `borCod` mas sem os `bxaCodSeqs` que JÁ existem no ERP. A guard R-4 (reconciling+borCod) impede o re-POST (✅), mas o operador precisa abrir o borderô no Conexos e usar `listBaixasErp` para descobrir o que está lá. Não há reconciliação automatizada por título.
- **Impacto de negócio**: Em invoices multi-parcela (comum em D.I. parcelada/MARFRIG), cada incidência de partial-success gera trabalho manual: comparar lista do ERP com `request_payload` jsonb, decidir se excluir as k baixas committadas ou completar as N-k restantes. Em janela de degradação Conexos com lote de 6 adtos × 3 títulos médios = 18 oportunidades de partial-success.
- **Métrica de baseline**: 1 coluna `bxa_cod_seq` (singular) na trilha; 0 tabelas filhas; nº esperado de baixas por par em multi-título: até `LIMIT 100` (em `listTitulosAPagar` `pageSize: 100`); colunas estruturadas para `partial_success_count` / `baixas_no_erp[]`: 0.

### F-availability-2: `/health` é stub estático — Render mantém tráfego em backend com dependências mortas

- **Severidade**: P1
- **Tactic violada**: Ping/Echo, Self-Test
- **Localização**: `src/backend/index.ts:65`; `render.yaml:21`
- **Evidência (objetiva)**:
  ```ts
  // src/backend/index.ts:65
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
- **Impacto técnico**: Render usa `/health` para liveness. Pool Postgres morto, Conexos rejeitando login ou `bootstrapAppContainer` falho continuam roteando 500 a cada request. Sem readiness para sinalizar "fora do balanceador enquanto reinicializo".
- **Impacto de negócio**: Janela de degradação invisível no status do Render; operador descobre por queixa do usuário.
- **Métrica de baseline**: deps probadas pelo `/health` = 0; deps críticas reais = 2 (Postgres + Conexos).

### F-availability-3: Zero APM/observabilidade externa — todos os erros morrem no stdout do Render

- **Severidade**: P1
- **Tactic violada**: Monitor, Predictive Model
- **Localização**: `src/backend/domain/libs/logger/Logger.ts`; `src/backend/index.ts:1-103`; `src/backend/package.json`
- **Evidência (objetiva)**:
  ```bash
  $ grep -rn "Sentry\|datadog\|opentelemetry" src/backend --include='*.ts' --include='*.json'
  # 0 ocorrências (fora de transitivas)
  ```
  Único transporte de erro = `console.error` para stdout do Render (retenção padrão do plano starter, sem search estruturado).
- **Impacto técnico**: MTTD ≈ tempo do operador notar baixas falhando (>30min). Sem dado histórico para post-mortem; decisões de timeout/capacidade sem métrica.
- **Impacto de negócio**: A janela atual de risco (multi-título partial-success, F-1) só é detectada por relato do analista financeiro do cliente.
- **Métrica de baseline**: 0 deps de APM; 0 alertas configurados; 0 sinks externos.

### F-availability-4: Sem `SIGTERM` handler — deploy/restart interrompe reconciliação multi-título no meio do handshake

- **Severidade**: P1
- **Tactic violada**: Escalating Restart (graceful shutdown)
- **Localização**: `src/backend/index.ts:99-102` (apenas `app.listen`, sem `process.on('SIGTERM')`)
- **Evidência (objetiva)**:
  ```bash
  $ grep -rn "process.on\|SIGTERM\|gracefulShutdown" src/backend --include='*.ts'
  # 0 ocorrências
  ```
  Sob multi-título o handshake passa de 5 chamadas (1 borderô + 4 da baixa única) para 1 + N×4. Para N=3 títulos = 13 POSTs sequenciais; janela de risco do SIGTERM aumenta.
- **Impacto técnico**: O write-ahead (Regis F-availability-1 anterior) garante o `borCod` rastreado, mas não há orquestração que continue/reverta após reboot. Cresceu o risco do borderô "EM CADASTRO" + baixas parciais não-rastreadas (combinação F-1 + F-4).
- **Impacto de negócio**: Cada deploy em horário comercial = potencial de 1–5 borderôs órfãos × N títulos médios.
- **Métrica de baseline**: 0 handlers de SIGTERM/SIGINT/uncaughtException; nº de POSTs sequenciais sob risco por par adto↔invoice = `1 + 4×N` (era `1 + 4` pré-multi-título).

### F-availability-5: Sem circuit breaker no `ConexosBaseClient` (shared) — falha sustentada do Conexos pina worker

- **Severidade**: P2
- **Tactic violada**: Removal from Service (do upstream), Ignore Faulty Behavior
- **Localização**: `src/backend/domain/client/ConexosBaseClient.ts:127-132` (retry 2× delay 500ms jitter 200ms); `src/backend/services/conexos.ts:79-83` (timeout 40s); `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:14` (LOTE_MAX=6)
- **Evidência (objetiva)**:
  ```bash
  $ grep -rn "circuit\|breaker\|opossum" src/backend --include='*.ts'
  # 0 ocorrências
  ```
  Pós-CC-2 o retry vive em `ConexosBaseClient.runWithRetry` e é compartilhado pelos 4 sub-clients — facilita interceptar com um breaker num único ponto, mas isso ainda não foi feito. Pior caso por baixa multi-título quando Conexos não responde: `(1 + 4×N) × (40s timeout + 500ms × 2 retries)` ≈ 13 × 41s = ~533s para N=3 (era ~165s pré-multi-título).
- **Impacto técnico**: Sem breaker, todas as requests concorrentes ficam pinadas até o timeout estourar; pool Postgres (max 5) também fica retido. Retries amplificam carga (thundering-herd).
- **Impacto de negócio**: Janela de incidente Conexos = janela em que o backend fica inutilizável por arrastamento; agora pior por causa do fan-out multi-título.
- **Métrica de baseline**: 0 breakers; tempo máximo teórico por par adto↔invoice em Conexos lento = ~533s (N=3) vs ~165s pré-CC-2.

### F-availability-6: Sem self-test no boot — credenciais quebradas só aparecem na 1ª request real

- **Severidade**: P2
- **Tactic violada**: Self-Test
- **Localização**: `src/backend/index.ts:100-102`; `src/backend/domain/client/database/PostgreeDatabaseClient.ts` (lazy init via `bootstrapAppContainer`); `src/backend/domain/client/ConexosBaseClient.ts:136` (`ensureSid` lazy)
- **Evidência (objetiva)**: `app.listen(PORT)` é chamado sem nenhum `await` em `bootstrapAppContainer` + `PostgreeDatabaseClient.init` + `ensureSid`. Combina com F-availability-2: healthcheck verde + serviço quebrado.
- **Impacto técnico**: Configuração errada (ex.: `databaseConnectionString` ou `CONEXOS_PASSWORD`) só aparece quando o primeiro usuário tenta usar.
- **Impacto de negócio**: Deploy noturno aparenta sucesso; operador de manhã descobre que toda a aplicação está com 500 desde a virada.
- **Métrica de baseline**: 0 probes pre-listen; 2 dependências críticas não validadas no boot.

### F-availability-7: Cron de ingestão (GitHub Actions) sem retry/alerta em falha

- **Severidade**: P2
- **Tactic violada**: Retry (no scheduler), Monitor
- **Localização**: `.github/workflows/ingest-permutas.yml:11-15,46-49`
- **Evidência (objetiva)**:
  ```yaml
  on:
    schedule:
      - cron: '0 9,15,21 * * *'   # 3x/dia; sem retry automático ao falhar
  ```
  Sem `if: failure()` step para alerta; sem `continue-on-error` controlado; sem reagendamento. Próxima oportunidade de re-tentar = 6h depois.
- **Impacto técnico**: Falha transitória do Conexos (ex.: janela de manutenção 5min) bloqueia toda a janela de ingestão por 6h. O snapshot que alimenta `/permutas` fica defasado.
- **Impacto de negócio**: Painel financeiro mostra dados de 6–18h atrás. Decisão de baixa em lote em cima de dado stale.
- **Métrica de baseline**: 0 retries no workflow; 0 alertas configurados; intervalo entre runs = 6h.

### F-availability-8: `FallbackExecutor` declarado como primitiva mas nunca implementado/usado

- **Severidade**: P2
- **Tactic violada**: Passive Redundancy, Degradation (em rota de leitura crítica)
- **Localização**: `src/backend/domain/libs/executor/` (apenas `RetryExecutor.ts` + `IExecutor.ts`); `CLAUDE.md` (linhas que listam `FallbackExecutor`/`PollExecutor` como primitivas alvo)
- **Evidência (objetiva)**:
  ```bash
  $ ls src/backend/domain/libs/executor/
  RetryExecutor.test.ts  RetryExecutor.ts  domain
  $ grep -rn "FallbackExecutor\|PollExecutor" src/backend --include='*.ts'
  # 0 ocorrências
  ```
  `BorderoGestaoService.refreshCache` JÁ tem degradação per-filial (`.catch → []`), mas o caminho `live=true → 500` se TODAS as filiais falharem não cai para o cache local; o stale-while-error explícito não está padronizado.
- **Impacto técnico**: Há cache local maduro (`permuta_bordero`) que poderia servir como fonte secundária quando o ERP cai, com header `X-Cache-Stale: true`. Hoje o caller não tem essa primitiva.
- **Impacto de negócio**: Tela de gestão de borderôs fica completamente indisponível durante falha do Conexos, mesmo que o dado em cache seja "bom o suficiente" (poucos minutos de atraso).
- **Métrica de baseline**: 0 rotas com fallback configurado; 1 implementação de `IExecutor` (RetryExecutor) em 3 declaradas (Retry/Fallback/Poll).

### F-availability-9: `errorMiddleware` devolve 500 genérico sem categorizar falhas retryable vs. permanentes

- **Severidade**: P3
- **Tactic violada**: Exception Detection (granularidade)
- **Localização**: `src/backend/http/errorMiddleware.ts:12-36`
- **Evidência (objetiva)**:
  ```ts
  res.status(500).json({ error: 'Internal server error' });
  ```
  Frontend trata todo 500 como permanente — não há discriminação entre "Conexos transitoriamente fora" (retryable do cliente) vs. "bug aplicacional" (não retryable).
- **Impacto técnico**: Cliente sempre força refresh manual; sem hint para retry exponencial automático do frontend.
- **Impacto de negócio**: UX degradada em janelas curtas de Conexos lento.
- **Métrica de baseline**: 1 código de status (500) para todos os erros do servidor.

### F-availability-10: Sem job de varredura de `reconciling` órfãos antigos (R-4 não tem auto-resync periódico)

- **Severidade**: P2
- **Tactic violada**: State Resynchronization, Monitor
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts` (sem método `listReconcilingOrfaos` / `findStale`); `src/backend/jobs/` (sem job dedicado)
- **Evidência (objetiva)**: A R-4 fail-closed protege contra re-POST (✅), mas uma linha `status='reconciling'+borCod` órfã fica indefinidamente nessa situação até alguém manualmente abrir o adto na UI e ver o erro (ou consultar o banco). Sem alerta automático "há linha reconciling há mais de Xmin" e sem job que reconcilie via `listBaixasErp(borCod)` → se a baixa existe lá, `markSettled` automatizado; se não, `markError` automatizado.
- **Impacto técnico**: A trilha cresce com linhas zumbi; a guard só funciona quando o operador re-clica no mesmo par. Linhas antigas em `reconciling` poluem queries de health/relatório.
- **Impacto de negócio**: O operador precisa lembrar de re-tentar o par que estava em curso quando o restart aconteceu — caso contrário a permuta "some" do fluxo automático até alguém olhar.
- **Métrica de baseline**: 0 jobs de resync; 0 dashboards de "reconciling > Xmin"; tempo de resolução = tempo até o operador notar.

## 5. Cards Kanban

### [availability-1] Persistir TODOS os `bxa_cod_seq` da baixa multi-título (tabela filha por título)

- **Problema**
  > Após a baixa multi-título (uma alocação ⇒ N `gravarBaixaPermuta` no mesmo borderô), apenas `bxaCodSeqs[0]` é persistido na coluna `bxa_cod_seq` em `markSettled`; em `markError` nenhum dos bxaCodSeqs já confirmados pelo ERP vai para a trilha. Em partial-success (título 1..k OK + título k+1 falha), o operador precisa abrir o borderô no Conexos para descobrir o que existe lá — a R-4 fail-closed bloqueia corretamente o re-POST, mas a auditoria/reconciliação é manual.

- **Melhoria Proposta**
  > (a) Criar tabela `permuta_alocacao_baixa_titulo` (FK para `permuta_alocacao_execucao` por `idempotency_key`, colunas `tit_cod`, `bxa_cod_seq`, `valor_baixado`, `juros`, `desconto`, `criado_em`). (b) Em `ReconciliacaoPermutaService.baixarTitulo`, após o `gravarBaixaPermuta` de cada título, inserir uma linha imediatamente (write-ahead por título). (c) `markError` agregado preserva as linhas-filhas já gravadas; `markSettled` agregado idem. Tactic Bass: **State Resynchronization** + **Exception Detection** (granularidade) + **Rollback** (suporte a desfazer baixas parciais via `excluirBaixa`).

- **Resultado Esperado**
  > Em qualquer partial-success multi-título, a trilha sabe exatamente quais bxaCodSeqs vivem no ERP. Métrica observável: colunas/linhas com `bxa_cod_seq` rastreáveis por título = 1 (escalar `bxa_cod_seq`) → N por execução (linha-filha por título); operações manuais de reconciliação após partial-success ≥ 1/mês → ≤ 0,2/mês (assistidas por endpoint que sugere "completar restantes" ou "estornar k baixas").

- **Tactic alvo**: State Resynchronization + Exception Detection + Rollback
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-1, F-availability-10
- **Métricas de sucesso**:
  - bxaCodSeqs persistidos por execução multi-título: 1 → N
  - Tempo manual de reconciliação após partial-success: variável → procedimento documentado e assistido por dado da trilha
- **Risco de não fazer**: cada incidência de Conexos lento durante baixa em lote vira ticket manual ambíguo ("o que foi gravado?"); R-4 fail-closed bloqueia corretamente o re-POST, mas exige investigação manual.
- **Dependências**: nenhuma; idealmente antes de availability-4 (SIGTERM) porque amplifica o valor da rastreabilidade.

### [availability-2] Hardenizar `/health` com probe real de DB e prontidão (`/ready` separado)

- **Problema**
  > `/health` é um stub estático que sempre retorna 200, mas Render usa esse endpoint como liveness probe (render.yaml:21). Backend com pool Postgres morto, cookie Conexos expirado ou bootstrap falho continua roteando tráfego — operador só descobre por queixa do usuário.

- **Melhoria Proposta**
  > Separar **liveness** (`/health`, mantém estático = "processo está vivo") de **readiness** (`/ready` novo, faz `SELECT 1` no pool + valida `EnvironmentProvider` lê env críticos). `/ready` retorna 503 em qualquer falha; Render passa a apontar `healthCheckPath: /ready`. Tactic Bass: **Ping/Echo** + **Self-Test**.

- **Resultado Esperado**
  > Em incidente de Supabase, Render para de rotear tráfego ao backend em ≤ 30s (ciclo padrão do healthcheck). Métrica observável: número de deps probadas no readiness = 0 → 2 (DB + EnvironmentProvider).

- **Tactic alvo**: Ping/Echo + Self-Test
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-2, F-availability-6
- **Métricas de sucesso**:
  - Dependências probadas pelo healthcheck: 0 → 2 (Postgres pool + EnvironmentProvider)
  - Janela de tráfego em backend com DB morto: indeterminada → ≤ 30s
- **Risco de não fazer**: incidente futuro de Supabase = janela indefinida de 500 visíveis sem reação automatizada.
- **Dependências**: nenhuma.

### [availability-3] Adotar Sentry (ou equivalente) no backend + cron com alerta em incremento de erro

- **Problema**
  > Toda telemetria de erro vive em `console.error` para stdout do Render. Sem dashboard, sem alerta, sem agregação. MTTD depende do operador estar olhando ou de o usuário reclamar. Particularmente grave agora que o partial-success multi-título (F-availability-1) só é detectado por relato.

- **Melhoria Proposta**
  > Instalar `@sentry/node` no backend, inicializar no `index.ts` antes de `app.use`, configurar captura no `errorMiddleware` (ponto central) e adicionar `Sentry.captureCheckIn` no `jobs/ingest-permutas.ts` para monitorar o cron. Adicionar tag custom `status=error` quando a trilha registra erro de reconciliação. Alertas: "erros 500 > 5/min por 5min", "cron falhou 2× consecutivas", "permuta_execucao status=error subiu". Tactic Bass: **Monitor** + **Predictive Model**.

- **Resultado Esperado**
  > MTTD para qualquer regressão produzida no backend cai de >30min para <5min (alerta). Métrica observável: deps de APM no package.json = 0 → 1; alertas configurados ≥ 3.

- **Tactic alvo**: Monitor + Predictive Model
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-3, F-availability-7
- **Métricas de sucesso**:
  - Deps de APM no backend: 0 → 1
  - Alertas com regra automática: 0 → ≥ 3
  - Retenção/busca de erros: stdout sem search → 30d+ com search e dedup
- **Risco de não fazer**: regressões silenciosas (incl. partial-success multi-título) chegam à reunião de retro do mês seguinte sem dado quantitativo.
- **Dependências**: nenhuma (Sentry tem plano free suficiente).

### [availability-4] Graceful shutdown (SIGTERM) com drenagem de reconciliações em curso

- **Problema**
  > `src/backend/index.ts` não trata `SIGTERM`. Render mata o container em auto-deploy; se chegar entre `criarBordero` e o último `gravarBaixaPermuta` do loop multi-título (1 + N×4 chamadas), o borderô fica com baixas parciais e a trilha em `reconciling` órfão — exige conciliação manual.

- **Melhoria Proposta**
  > Implementar handler de `SIGTERM`/`SIGINT` que: (a) marca `app.locals.shuttingDown = true`, (b) faz `/ready` (novo, card availability-2) retornar 503 imediatamente, (c) aguarda in-flight requests por até 25s (Render dá 30s), (d) fecha o pool Postgres limpo, (e) `process.exit(0)`. Tactic Bass: **Escalating Restart**.

- **Resultado Esperado**
  > Render tira o backend do balanceador antes de matar; reconciliações em curso terminam o handshake (incl. multi-título). Métrica observável: handlers de SIGTERM = 0 → 1; janela de drain = 0s → ≤ 25s.

- **Tactic alvo**: Escalating Restart
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - Handlers de SIGTERM/SIGINT: 0 → 1
  - Borderôs órfãos esperados por deploy: indeterminado → ~0 (proporcional ao tempo do handshake N×4 vs. 25s)
- **Risco de não fazer**: cada deploy em horário comercial = potencial de 1–5 borderôs órfãos × N títulos médios × frequência de deploy (alta — autoDeploy ON).
- **Dependências**: availability-2 (precisa de `/ready` para o balanceador respeitar).

### [availability-5] Circuit breaker no `ConexosBaseClient` (fail-fast quando Conexos cai)

- **Problema**
  > Sem breaker, falha sustentada do Conexos = cada chamada espera 40s × 2 retries × `1 + 4×N` chamadas do handshake × LOTE_MAX adtos. Para N=3 e LOTE_MAX=6 isso é ~6× ~533s. Render proxy mata em ~100s, gerando 502 com side-effects parciais. O fan-out cresceu com multi-título.

- **Melhoria Proposta**
  > Envolver `ConexosBaseClient.runWithRetry` (compartilhado pelos 4 sub-clients pós-CC-2) em um breaker tipo Opossum (`npm install opossum`): abre após 5 falhas consecutivas em 30s, half-open após 60s. Quando aberto, lança `ConexosUnavailableError` imediatamente. ESCRITAS (que não passam por `runWithRetry`) podem optar por consultar o estado do breaker antes de tentar. Tactic Bass: **Removal from Service** (do upstream) + **Ignore Faulty Behavior**.

- **Resultado Esperado**
  > Tempo máximo de espera durante incidente Conexos cai de ~533s/par para ~5s (1 falha) + breaker aberto. Métrica observável: breakers ativos = 0 → 1; tempo p99 de request durante incidente Conexos = >100s → <5s.

- **Tactic alvo**: Removal from Service + Ignore Faulty Behavior
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - Breakers configurados: 0 → 1 (`ConexosBaseClient.runWithRetry`)
  - Tempo máximo de hold em incidente upstream: ~533s (N=3) → ~5s
- **Risco de não fazer**: incidente longo do Conexos = inutilização total do backend por arrastamento; cresceu por multi-título.
- **Dependências**: idealmente após availability-3 (Sentry) para visualizar abertura/fechamento do breaker.

### [availability-6] Job/endpoint de varredura e auto-resync de `reconciling` órfãos antigos

- **Problema**
  > A guard R-4 fail-closed (F-fault-tolerance) impede o re-POST de uma linha `reconciling`+`borCod` órfã, mas não há job que varra a trilha e (a) chame `listBaixasErp(borCod)` para descobrir se a baixa existe lá; (b) marque `settled` se sim ou `error` se não; (c) alerte o operador. Linhas zumbi acumulam e o operador precisa lembrar do par interrompido.

- **Melhoria Proposta**
  > (a) Repository: `listReconcilingStale(maxAgeMin: number): ExecucaoRow[]`. (b) Job dedicado em `jobs/resync-reconciling.ts` (cron 10min ou disparado no boot): para cada órfão, cruza `bxaCodSeqs` da trilha (após card availability-1) ou `listBaixasErp(borCod)` (até lá) e decide settled vs error. (c) Endpoint admin `POST /permutas/admin/resync-orfans` que dispara on-demand. (d) Métrica para o Sentry (card availability-3): `reconciling_orfans_gauge`. Tactic Bass: **State Resynchronization** + **Monitor**.

- **Resultado Esperado**
  > Linhas `reconciling` antigas convergem automaticamente para `settled`/`error`; operador é notificado quando a tarefa não consegue decidir. Métrica observável: jobs de resync = 0 → 1; alerta em `reconciling > 30min` = 0 → 1.

- **Tactic alvo**: State Resynchronization + Monitor
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-10, F-availability-4, F-availability-1
- **Métricas de sucesso**:
  - Jobs de resync configurados: 0 → 1
  - Tempo médio de resolução de linha `reconciling` órfã: indeterminado → ≤ 10min
- **Risco de não fazer**: a trilha vira inferno de zumbis; a R-4 fica como muro inerte sem caminho automático de saída.
- **Dependências**: melhor após availability-1 (rastreabilidade por título) e availability-3 (Sentry para alertar).

### [availability-7] Implementar `FallbackExecutor` e aplicar em `GET /permutas/borderos` (stale-while-error)

- **Problema**
  > `FallbackExecutor` é citado como primitiva alvo no CLAUDE.md mas não existe no código. `BorderoGestaoService.refreshCache` já tem `.catch → []` per-filial (✅), mas se TODAS as filiais falharem o cache pode ficar vazio numa carga inicial; e o endpoint não distingue dado fresco vs. dado stale na resposta.

- **Melhoria Proposta**
  > (a) Implementar `FallbackExecutor implements IExecutor` em `src/backend/domain/libs/executor/`: tenta `primary`, se lança usa `fallback`, retorna o resultado + marca `stale=true`. (b) Aplicar no `BorderoGestaoService.listarBorderos({ live: true })` — se refreshCache falhar completamente, ler do cache + adicionar header `X-Cache-Stale: true` + campo `geradoEm` indicando idade do cache para o frontend mostrar aviso. Tactic Bass: **Passive Redundancy** + **Degradation**.

- **Resultado Esperado**
  > Em incidente Conexos, tela de gestão continua mostrando borderôs (com aviso) em vez de 500. Métrica observável: rotas com fallback = 0 → 1; implementações de `IExecutor` = 1 → 2.

- **Tactic alvo**: Passive Redundancy + Degradation
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-8, F-availability-5
- **Métricas de sucesso**:
  - Rotas com fallback configurado: 0 → 1 (`GET /permutas/borderos`)
  - Implementações de `IExecutor`: 1 → 2 (`RetryExecutor`, `FallbackExecutor`)
- **Risco de não fazer**: cada minuto de Conexos fora = minuto sem gestão visível, mesmo com cache disponível.
- **Dependências**: ideal após availability-5 (breaker), para o fallback disparar imediato quando breaker está open.

> **Findings sem card explícito**:
> - F-availability-7 (cron sem retry/alerta): coberto colateralmente pelo card availability-3 (Sentry checkIn no cron) + adicionar `nick-fields/retry@v3` no workflow é trivial após o canal de alerta estar pronto; sem card separado nesta rodada.
> - F-availability-9 (errorMiddleware genérico): nice-to-have de UX; backlog inbox sem card dedicado nesta rodada.

## 6. Notas do agente

- Delta vs run anterior (`2026-06-26-0058`): CC-2 split do `ConexosClient` (1.972 LOC) em `ConexosBaseClient` + 4 sub-clients **PRESERVOU** as políticas de retry (centralizadas em `ConexosBaseClient.runWithRetry`), timeout (40s no `services/conexos.ts`), Zod boundary (`BORDERO_CRIADO_SCHEMA`/`BAIXA_GRAVADA_SCHEMA`), R-4 in-doubt fail-closed e anti-drift. Nenhuma regressão de availability introduzida pelo split.
- O **novo risco** é a baixa multi-título (`executarBaixa` itera `baixarTitulo` por parcela) — F-availability-1 — que cria janela de partial-success cujo rastreamento granular ainda não existe (`bxaCodSeqs[0]` salvo em `markSettled`). Card availability-1 é P1 porque combina com F-availability-4 (SIGTERM) para amplificar o intervalo de risco (1 + 4×N POSTs sequenciais).
- Score mantido em 5/10 (era 5 no run anterior): nenhuma melhoria estrutural entre runs no substrato operacional (sem APM, sem SIGTERM, sem breaker, sem self-test); o domínio segue protegido por R-4 fail-closed + Zod + anti-drift por título.
- Cross-QA: F-availability-1 (rastreabilidade multi-título) tem cross-ref com `qa-fault-tolerance` (R-4 segue P0 mesmo com a nova janela); F-availability-3 (APM) afeta `qa-performance` (sem percentis) e `qa-fault-tolerance` (sem retry-rate); F-availability-4 (SIGTERM) tem cross-ref com `qa-deployability` (deploy interrompe trabalho). Avisar o consolidator.
- Métricas de runtime (uptime, MTTR, latência) seguem não-medíveis localmente — toda recomendação de SLO espera o card availability-3 ser implementado primeiro.
