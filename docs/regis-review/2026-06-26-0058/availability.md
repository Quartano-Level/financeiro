---
qa: Availability
qa_slug: availability
run_id: 2026-06-26-0058
agent: qa-availability
generated_at: 2026-06-26T01:00:00-03:00
scope: all
score: 5
findings_count: 9
cards_count: 7
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao Financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (upstream único) | Indisponibilidade transitória (502/504/timeout) durante uma janela de baixa em lote (admin clica "Baixar todas") | Stack Express (Render starter) → `ConexosClient` → handshake 5 chamadas em `fin010` | Produção single-tenant (Render Web 1 instância, Supabase Postgres, Conexos Cloud externo) | Sistema deve (a) retry transparente nas LEITURAS, (b) NÃO retry em escritas não-idempotentes, (c) persistir intenção write-ahead, (d) marcar `error` e seguir adto a adto (continue-on-error), (e) operador vê fila de "error" para conciliar manualmente. | 0% baixa duplicada; 100% das execuções com falha capturadas em `permuta_alocacao_execucao` com `borCod` e payload; falha de até 1 par adto↔invoice não interrompe o lote; MTTR percebido = tempo do operador re-clicar "Baixar" após Conexos voltar (sem retentativa automática). |

Cenário secundário (cron): falha no run das 09:00 UTC (GitHub Actions) durante a janela de ingestão → próxima rodada em 6h → snapshot de `/painel` defasado em até 6h. Sem alerta automático além de email padrão do GitHub.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Clients externos com `RetryExecutor` aplicado | 3/3 (Conexos via ConexosClient, BCB, Postgres pool) | 100% das leituras; escritas explicitamente sem retry | ✅ | `grep -rl RetryExecutor src/backend` → BcbClient.ts:54, ConexosClient.ts:425, PostgreeDatabaseClient.ts:36 |
| Clients externos com `timeout` explícito | 3/3 (Conexos 40s, BCB 10s, PG connect 5s/idle 10s) | 100% | ✅ | services/conexos.ts:81; BcbClient.ts:57; PostgreeDatabaseClient.ts:27-28 |
| Idempotência write-ahead em escritas ao ERP | Tabela `permuta_alocacao_execucao` + `Idempotency-Key` header em `/eleicao` + advisory lock em `IngestaoPermutasService` | 100% das escritas no fin010 | ✅ | migrations/0015_permuta_alocacao_execucao.sql; PermutaExecucaoRepository.ts:62-78,219-256; routes/permutas.ts:220-225 |
| Implementações de `FallbackExecutor`/`PollExecutor` | 0 (apenas `IExecutor.ts` interface + `RetryExecutor.ts` concreto) | ≥1 fallback rota crítica (ex.: cache `permuta_bordero` stale-while-error) | ❌ | `ls src/backend/domain/libs/executor/` → só RetryExecutor.{ts,test.ts} |
| Handlers de `SIGTERM`/`uncaughtException` | 0 | ≥1 (drenar in-flight reconciliação no shutdown) | ❌ | `grep -rn "process.on\|SIGTERM" src/backend` → 0 ocorrências |
| Dependências de APM/observabilidade externa | 0 declaradas no package.json (sem Sentry, Datadog, OpenTelemetry exporter) | ≥1 (mínimo Sentry para erros do backend + cron) | ❌ | `src/backend/package.json:23-39`; `grep -rn "Sentry\|datadog\|opentelemetry" src` → 0 fora de transitivas do Next |
| Profundidade do `/health` endpoint | Stub estático: `{ status: 'ok', version }` sem probe de DB/Conexos | Liveness real (`SELECT 1`) + readiness (Conexos sid válido OU 503) | ❌ | src/backend/index.ts:65; render.yaml:22 (healthCheckPath aponta pra cá) |
| Circuit breaker em `ConexosClient` | 0 (apenas retry 2× + delay 500ms + jitter 200ms) | ≥1 breaker abrindo após N falhas consecutivas | ❌ | ConexosClient.ts:430-435; `grep -rn "circuit\|breaker\|opossum"` → 0 |
| Self-test no boot do processo | 0 (Postgres `init()` é lazy; Conexos `ensureSid()` é lazy) | ≥1 smoke probe antes de `app.listen` | ❌ | src/backend/index.ts:99-101; PostgreeDatabaseClient.ts:51-73 |
| Catches "silenciosos" no backend | 1 intencional (`withTransaction` ROLLBACK swallow para preservar erro original; documentado) | ≤2 com justificativa | ✅ | PostgreeDatabaseClient.ts:114-118 |
| Guards de state-machine em escrita (`pending → reconciling → settled/error`) | SQL `CASE WHEN status='settled' THEN ... ELSE ...` impede regressão de settled | Guard explícito em toda transição | ✅ | PermutaExecucaoRepository.ts:234-256; ReconciliacaoPermutaService.ts:152-187 |
| Continue-on-error no batch | `reconciliarLote` engole erro por adto, agrega `totalErros` | 100% continue-on-error em lotes | ✅ | ReconciliacaoLotePermutaService.ts:113-149 |
| Tactic "Degradation" — modo dry-run / `error` queue | `dryRun` default = ON; escritas com falha → status `error` + payload + `borCod` na trilha; UX surfacea para conciliação manual | Caminho explícito de degradação | ✅ | ReconciliacaoPermutaService.ts:121-145,203-222 |
| Active Redundancy no app | 0 (Render starter = 1 worker; sem ASG/HA) | N/A (não vetor de Bass diretamente acionável sem mudar plano) | ⚠️ | render.yaml:10 (`plan: starter`) |
| Cron de ingestão — retry em falha do run | 0 (próximo run só em 6h: `0 9,15,21 * * *`) | ≥1 retry com backoff OU alerta automático | ❌ | .github/workflows/ingest-permutas.yml:13 |

> ⚠️ **Não medível localmente**: MTTR real, uptime mensal, taxa de erro p95, latência p95 das chamadas Conexos em produção, contagem de execuções `error` históricas, frequência de SIGTERM no Render. Requer dashboards externos (Sentry/Render Metrics/Supabase). Recomendação: instrumentar Sentry no backend (captura de exceção via `errorMiddleware`) + métrica custom `permuta_execucao_status_count{status}` (Prometheus/Render) + alerta quando `error/min > 0` por 5min consecutivos.

> ⚠️ **Não medível localmente**: número real de retries disparados por `RetryExecutor` em produção (logado em `console.error` mas não agregado). Requer Sentry/Logflare ingerindo Render stdout.

> ⚠️ **Não medível localmente**: ocorrência histórica de "borderô órfão" (em-cadastro sem baixa) por SIGTERM no meio do handshake. Requer query manual no ERP cruzando `permuta_alocacao_execucao.status='reconciling'` antigos com `permuta_bordero` no Conexos.

## 3. Tactics — Cobertura no Financeiro

### Detect Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | `/health` retorna 200 estático sem probar Postgres nem Conexos; Render usa para liveness apenas. | ⚠️ parcial | src/backend/index.ts:65; render.yaml:22 |
| Heartbeat | Cron de ingestão (GitHub Actions) é o "heartbeat" de facto, mas o próprio cron não emite heartbeat. Sem heartbeat do backend. | ❌ ausente | .github/workflows/ingest-permutas.yml |
| Monitor | Apenas `console.log/error` para Render stdout via `LogService` + `Logger.ts`. Sem agregação, sem alerta, sem dashboard. | ⚠️ parcial | src/backend/domain/libs/logger/Logger.ts:1-11; http/errorMiddleware.ts:22-29 |
| Timestamp | `criado_em`/`atualizado_em` em toda escrita; `dataMovto` epoch; `X-Request-Id` middleware echo. | ✅ presente | PermutaExecucaoRepository.ts (colunas); middleware/requestId.ts; migrations/0015 |
| Sanity Checking | Zod nos boundaries (rotas + ERP responses BORDERO_CRIADO_SCHEMA / BAIXA_GRAVADA_SCHEMA); anti-drift `valorBaixaDesejado > emAbertoErp + tolerancia` aborta. | ✅ presente | routes/permutas.ts:37-46; ConexosClient.ts:1101-1103,1489-1491; ReconciliacaoPermutaService.ts:268-282 |
| Condition Monitoring | `borderoAindaValido(filCod, borCod)` confere estado vivo do ERP antes de re-baixar; `getBordero` retorna null em 404 para refletir "removido". | ✅ presente | ReconciliacaoPermutaService.ts:154-174; ConexosClient.ts:1117-1148 |
| Voting | N/A — Conexos é fonte única da verdade financeira; não há réplicas para comparar. | N/A | — |
| Exception Detection | `asyncHandler` captura rejeições; `errorMiddleware` central; tipos `ConexosError`, `IngestLockBusyError`, `MissingFilCodError`; `markError` persiste resposta crua. | ✅ presente | http/asyncHandler.ts; http/errorMiddleware.ts; domain/errors/ |
| Self-Test | `init()` do pool DB e `ensureSid` do Conexos são lazy — falha aparece só na 1ª request real. | ❌ ausente | PostgreeDatabaseClient.ts:51-73; services/conexos.ts:199-203 |

### Recover from Faults — Preparation & Repair
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | Render starter = 1 worker; Conexos é único upstream; Supabase managed (HA opaco). | ❌ ausente | render.yaml:10 |
| Passive Redundancy | Cache local `permuta_bordero` reaproveitado quando `live=false`; Supabase PITR (managed). | ⚠️ parcial | routes/permutas.ts:570-579; migrations/0018_permuta_bordero_cache.sql |
| Spare | N/A — single-instance, sem nodes em standby. | N/A | render.yaml |
| Exception Handling | Central `errorMiddleware` + 401-retry em axios + `markError` per-execucao + `try/catch` por adto no lote. | ✅ presente | http/errorMiddleware.ts:12-36; ReconciliacaoLotePermutaService.ts:115-148 |
| Rollback | `withTransaction(BEGIN/COMMIT/ROLLBACK)`; `renameKey` em borderô cancelado libera re-baixa. | ✅ presente | PostgreeDatabaseClient.ts:102-123; ReconciliacaoPermutaService.ts:168-174 |
| Software Upgrade | `preDeployCommand: npm run migrate` no Render antes do tráfego trocar; `autoDeploy: true` gated por branch protection. | ✅ presente | render.yaml:17-22 |
| Retry | `RetryExecutor` em LEITURAS (Conexos: 2 tentativas, 500ms + jitter 200ms; PG: 3, 200ms + jitter 200ms; PG pool init: 5, 2000ms). Escritas no fin010 SEM retry por design (documentado). | ✅ presente | RetryExecutor.ts:31-71; ConexosClient.ts:425-435,1077-1080,1473-1477; PostgreeDatabaseClient.ts:36-43,54-58 |
| Ignore Faulty Behavior | `getBordero` ignora 404 retornando null; `borderoAindaValido` ignora cancelado para liberar re-baixa. | ⚠️ parcial | ConexosClient.ts:1143-1146; ReconciliacaoPermutaService.ts:154-174 |
| Degradation | `dryRun` default ON; `error` queue para conciliação manual; `reconciliar-lote` continue-on-error; `LOTE_MAX=6` cap. | ✅ presente | ReconciliacaoPermutaService.ts:121-145; ReconciliacaoLotePermutaService.ts:14,113-149 |
| Reconfiguration | Kill-switch `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` via env (lido em todo request via `EnvironmentProvider`). Trocar exige redeploy/restart no Render (sync:false). | ⚠️ parcial | EnvironmentProvider.ts:69-70,96-97; render.yaml:37-40 |

### Recover from Faults — Reintroduction
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | `dryRun` é um modo shadow de facto: monta payload + loga, não posta. Usado para validar contra produção. | ✅ presente | ReconciliacaoPermutaService.ts:131-145 |
| State Resynchronization | `?live=true` em `GET /borderos` refresca cache `permuta_bordero` ao vivo do ERP; `borderoAindaValido` resincroniza per-execução. Sem job periódico de resync. | ⚠️ parcial | routes/permutas.ts:570-579; ReconciliacaoPermutaService.ts:154-174 |
| Escalating Restart | Sem `process.on('SIGTERM')` — Render mata o container e in-flight reconciliações terminam abruptas (mitigadas por write-ahead, mas exigem conciliação manual). | ❌ ausente | src/backend/index.ts:99-101 (apenas `app.listen`) |
| Non-Stop Forwarding | N/A — não é router/network device. | N/A | — |

### Prevent Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | Sem blue/green nem instância secundária; remoção = pausar deploy no dashboard Render. | ❌ ausente | render.yaml |
| Transactions | `withTransaction` atômico; `withAdvisoryLock` serializa ingestão; `persistIngestRun` dentro de uma única tx. | ✅ presente | PostgreeDatabaseClient.ts:102-158; PermutaRelationalRepository.ts:187-206 |
| Predictive Model | Sem anomaly detection, sem alerta em retry-rate / latência / fila de error. | ❌ ausente | — |
| Exception Prevention | Zod nos boundaries; anti-drift; `MissingFilCodError`; `LOTE_MAX` cap; mutex de login no Conexos (`loginPromise`) previne `LOGIN_ERROR_MAX_SESSIONS`. | ✅ presente | services/conexos.ts:73-140; ReconciliacaoLotePermutaService.ts:14 |
| Increase Competence Set | `dryRun` preview; runbook `docs/runbooks/fin010-write-cutover.md`; UX surfacea `error/parcial/skipped` por adto. Sem treinamento proativo do operador. | ⚠️ parcial | render.yaml:33-34 (comentário cita runbook); ReconciliacaoLotePermutaService.ts:17 |

## 4. Findings (achados)

### F-availability-1: `/health` é stub estático — Render mantém tráfego em backend com dependências mortas

- **Severidade**: P1
- **Tactic violada**: Ping/Echo, Self-Test
- **Localização**: `src/backend/index.ts:65`; `render.yaml:22`
- **Evidência (objetiva)**:
  ```ts
  // src/backend/index.ts:65
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
  ```yaml
  # render.yaml:22
  healthCheckPath: /health
  ```
- **Impacto técnico**: Render usa `/health` para decidir se o container está vivo e se deve receber tráfego. Pool do Postgres morto, Conexos `/login` rejeitando credenciais, ou cookie `sid` expirado nunca derrubam o healthcheck — o backend continua roteado e devolve 500 a cada request. Não há readiness para sinalizar "fora do balanceador enquanto reinicializo".
- **Impacto de negócio**: Janela de degradação invisível ao operador: durante uma incidência de Supabase, o frontend mostra erros 500 genéricos mas o status do serviço continua "verde" no painel do Render. Operador descobre por queixa do usuário (negativo de SLA percebido).
- **Métrica de baseline**: probe atual valida 0 dependências críticas (DB + Conexos); 1 dependência crítica = DB (sem ela, `bootstrapAppContainer()` e todo `routes/permutas` falham).

### F-availability-2: Zero APM/observabilidade externa — todos os erros morrem no stdout do Render

- **Severidade**: P1
- **Tactic violada**: Monitor, Predictive Model
- **Localização**: `src/backend/domain/libs/logger/Logger.ts:1-11`; `src/backend/index.ts:1-104`; `src/backend/package.json:23-39`
- **Evidência (objetiva)**:
  ```ts
  // Logger.ts — única instrumentação
  export default class Logger {
      static info(...message: unknown[]): void {
          console.log(`[INFO - ${new Date().toISOString()}]:`, ...message);
      }
      static error(...message: unknown[]): void {
          console.error(`[ERROR - ${new Date().toISOString()}]:`, ...message);
      }
  }
  ```
  `grep -rn "Sentry\|datadog\|opentelemetry" src/backend` → 0 ocorrências. package.json (`dependencies`) inclui apenas axios, pg, express, etc.
- **Impacto técnico**: Erros 500 ou `ConexosError` aparecem só em `Render Logs` (rolling, 7 dias no plano starter, sem busca estruturada). Nenhum alerta dispara quando taxa de erro sobe. Tudo é busca manual via `grep` em logs do dashboard.
- **Impacto de negócio**: MTTD (time-to-detect) = tempo do operador notar baixas falhando (provavelmente >30min) + sem trilha histórica para post-mortem. Decisões de capacidade/timeouts feitas sem dados.
- **Métrica de baseline**: 0 dependências de APM/alerting declaradas; 0 alertas configurados; janela de retenção dos logs = padrão Render starter (7d).

### F-availability-3: Sem `SIGTERM` handler — deploy/restart interrompe reconciliação no meio do handshake `fin010`

- **Severidade**: P1
- **Tactic violada**: Escalating Restart (graceful shutdown)
- **Localização**: `src/backend/index.ts:99-101` (apenas `app.listen`, sem `process.on('SIGTERM')`)
- **Evidência (objetiva)**:
  ```bash
  $ grep -rn "process.on\|SIGTERM\|gracefulShutdown" src/backend --include='*.ts'
  # 0 ocorrências
  ```
  `ReconciliacaoPermutaService.executarBaixa` faz 4 POSTs sequenciais ao Conexos após `criarBordero` (já persistido via `setBorCod`). Se Render mandar SIGTERM (auto-deploy on push) entre os passos 2 e 5, o borderô fica criado no ERP mas sem baixa. Conserto = busca manual da linha `status='reconciling'` órfã na trilha + `excluirBordero`/conciliar.
- **Impacto técnico**: O write-ahead salva o `borCod` (mitigação de Regis F-availability-1 anterior, ReconciliacaoPermutaService.ts:246-247), mas não há orchestração que continue/reverta após reboot. Borderô "EM CADASTRO" no ERP fica visível ao analista financeiro do cliente, gerando ruído operacional.
- **Impacto de negócio**: Cada deploy gera potencial de N borderôs órfãos (N = lotes em curso). Em pico de mês, dois deploys em sequência podem gerar 5–10 órfãos para conciliação manual.
- **Métrica de baseline**: 0 handlers de SIGTERM/SIGINT/uncaughtException; 1ª POST que persiste estado externo no ERP = `criarBordero` (ConexosClient.ts:1082-1107).

### F-availability-4: Sem circuit breaker — falha sustentada do Conexos consome 100% do request budget até estourar proxy

- **Severidade**: P2
- **Tactic violada**: Removal from Service (do upstream), Ignore Faulty Behavior
- **Localização**: `src/backend/services/conexos.ts:78-83` (timeout 40s); `src/backend/domain/client/ConexosClient.ts:425-435` (retry 2× delay 500ms jitter 200ms); `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:14,113-149` (LOTE_MAX=6 sequencial)
- **Evidência (objetiva)**:
  ```bash
  $ grep -rn "circuit\|breaker\|opossum" src/backend --include='*.ts'
  # 0 ocorrências
  ```
  Pior caso por baixa quando Conexos não responde: 4 chamadas × (40s timeout + 500ms × 2 retries + 401-retry) ≈ 165s. Lote inteiro: 6 × 165s ≈ 990s. Proxy default do Render mata em ~100s.
- **Impacto técnico**: Sem breaker, todas as N requests concorrentes em curso ficam pinadas até o timeout estourar; pool do Postgres (max 5) também fica retido em queries que dependem do mesmo request. Retries amplificam carga sobre um Conexos já degradado (thundering-herd).
- **Impacto de negócio**: Janela de incidente Conexos = janela em que o backend fica inutilizável para qualquer operação (ler painel, listar borderôs, etc.) por arrastamento.
- **Métrica de baseline**: 0 breakers; tempo máximo de espera por chamada = 40s; multiplicador por retry = até 3 tentativas; sem fail-fast.

### F-availability-5: Sem self-test no boot — credenciais quebradas só aparecem na 1ª request real

- **Severidade**: P2
- **Tactic violada**: Self-Test
- **Localização**: `src/backend/index.ts:99-101`; `src/backend/domain/client/database/PostgreeDatabaseClient.ts:51-73` (lazy init); `src/backend/services/conexos.ts:199-203` (`ensureSid` lazy)
- **Evidência (objetiva)**: `app.listen(PORT)` é chamado sem nenhum `await` em `bootstrapAppContainer` + `PostgreeDatabaseClient.init` + `conexosService.ensureSid`. Render marca o deploy como sucesso assim que `/health` responde 200 — sem garantia de que dependências estejam acessíveis.
- **Impacto técnico**: Configuração errada (ex.: `databaseConnectionString` ou `CONEXOS_PASSWORD`) só aparece quando o primeiro usuário tenta usar. Combina com F-availability-1: healthcheck verde + serviço quebrado.
- **Impacto de negócio**: Deploy noturno aparenta sucesso; operador de manhã descobre que toda a aplicação está com 500 desde a virada. Falha tardia = MTTR + 1 ciclo de deploy.
- **Métrica de baseline**: 0 probes pre-listen; 2 dependências críticas não validadas no boot (Postgres + Conexos).

### F-availability-6: Cron de ingestão (GitHub Actions) sem retry/alerta em falha

- **Severidade**: P2
- **Tactic violada**: Retry (no scheduler), Monitor
- **Localização**: `.github/workflows/ingest-permutas.yml:10-47`
- **Evidência (objetiva)**:
  ```yaml
  on:
    schedule:
      - cron: '0 9,15,21 * * *'   # 3x/dia; sem retry automático ao falhar
  ```
  Sem `if: failure()` step para alerta; sem `continue-on-error` controlado; sem reagendamento. Próxima oportunidade de re-tentar = 6h depois.
- **Impacto técnico**: Falha transitória do Conexos (ex.: janela de manutenção 5min) bloqueia toda a janela de ingestão por 6h. O snapshot que alimenta `/painel` e a regra de "automáticas elegíveis" fica defasado.
- **Impacto de negócio**: Painel financeiro mostra dados de 6–18h atrás (dependendo de qual run falhou e quando o operador acessou). Decisão de baixa em lote em cima de dado stale.
- **Métrica de baseline**: 0 retries no workflow; 0 alertas configurados; intervalo entre runs = 6h.

### F-availability-7: Reconciliar-lote sem heartbeat — risco de proxy timeout em janelas de Conexos lento

- **Severidade**: P2
- **Tactic violada**: Heartbeat (response chunking), Degradation (cancellation)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:78-174`; `src/backend/routes/permutas.ts:542-566`
- **Evidência (objetiva)**: Endpoint síncrono. LOTE_MAX=6; cada `reconciliar` = ≥5 chamadas Conexos. Sem `req.on('close')` (cancelamento), sem `res.flush()`/SSE para manter conexão. Documentado também em `docs/regis-review/2026-06-25-1713/performance.md` (cross-ref).
- **Impacto técnico**: Em janela degradada (Conexos respondendo em 10–20s/call), o lote ultrapassa o tempo padrão de proxy (100s no Render). Cliente recebe 502 enquanto o servidor segue gravando — operador refaz e arrisca duplicar lógica de seleção.
- **Impacto de negócio**: Operador vê erro mas baixas avançam silenciosamente no ERP. Confusão sobre o que foi feito; possível re-clique sobre adtos já em processamento.
- **Métrica de baseline**: tempo máximo teórico = LOTE_MAX × 5 calls × 40s timeout = 1200s; proxy timeout Render = ~100s.

### F-availability-8: `FallbackExecutor` declarado como primitiva mas nunca implementado/usado

- **Severidade**: P2
- **Tactic violada**: Passive Redundancy, Fallback
- **Localização**: `src/backend/domain/libs/executor/` (apenas `RetryExecutor.ts` + `IExecutor.ts`); `CLAUDE.md` (linhas que listam `FallbackExecutor`/`PollExecutor` como primitivas alvo)
- **Evidência (objetiva)**:
  ```bash
  $ ls src/backend/domain/libs/executor/
  RetryExecutor.test.ts  RetryExecutor.ts  domain
  $ ls src/backend/domain/libs/executor/domain
  IExecutor.ts
  $ grep -rn "FallbackExecutor\|PollExecutor" src/backend --include='*.ts'
  # 0 ocorrências
  ```
- **Impacto técnico**: `GET /permutas/borderos` quando Conexos cai retorna 500 mesmo havendo cache local `permuta_bordero` em Postgres atualizado. Não há caminho "stale-while-error" — fallback ao cache com warning.
- **Impacto de negócio**: Tela de gestão de borderôs fica completamente indisponível durante falha do Conexos, mesmo que o dado em cache seja "bom o suficiente" (poucos minutos de atraso).
- **Métrica de baseline**: 0 rotas com fallback configurado; 1 cache local maduro (`permuta_bordero`) disponível para servir como fonte secundária.

### F-availability-9: errorMiddleware devolve 500 genérico sem categorizar falhas retryable vs. permanentes

- **Severidade**: P3
- **Tactic violada**: Exception Detection (granularidade)
- **Localização**: `src/backend/http/errorMiddleware.ts:12-36`
- **Evidência (objetiva)**:
  ```ts
  res.status(500).json({ error: 'Internal server error' });
  ```
  Frontend trata todo 500 como permanente — não há discriminação entre "Conexos transitoriamente fora" (retryable do cliente) vs. "bug aplicacional" (não retryable).
- **Impacto técnico**: Cliente sempre força refresh manual; sem hint para retry exponencial automático do frontend; falha em uma operação parece falha em "todo o sistema".
- **Impacto de negócio**: UX degradada em janelas curtas de Conexos lento; operador pode interpretar como "sistema quebrado" quando é só janela transitória.
- **Métrica de baseline**: 1 código de status (500) para todos os erros do servidor.

## 5. Cards Kanban

### [availability-1] Hardenizar `/health` com probe real de DB e prontidão (`/ready` separado)

- **Problema**
  > `/health` é um stub estático que sempre retorna 200, mas Render usa esse endpoint como liveness probe (render.yaml:22). Backend com pool Postgres morto, cookie Conexos expirado ou bootstrap falho continua roteando tráfego — operador só descobre por queixa do usuário.

- **Melhoria Proposta**
  > Separar **liveness** (`/health`, mantém estático = "processo está vivo") de **readiness** (`/ready` novo, faz `SELECT 1` no pool + valida `EnvironmentProvider` lê env críticos). `/ready` retorna 503 em qualquer falha; Render passa a apontar `healthCheckPath: /ready`. Tactic Bass: **Ping/Echo** + **Self-Test**.

- **Resultado Esperado**
  > Em incidente de Supabase, Render para de rotear tráfego ao backend em ≤ 30s (ciclo padrão do healthcheck). Métrica observável: número de deps probadas no readiness = 0 → 2 (DB + EnvironmentProvider). Após telemetria, alarme "ready=503 por >2min" sobe para o Slack.

- **Tactic alvo**: Ping/Echo + Self-Test
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-1, F-availability-5
- **Métricas de sucesso**:
  - Dependências probadas pelo healthcheck: 0 → 2 (Postgres pool + EnvironmentProvider)
  - Janela de tráfego em backend com DB morto: indeterminada → ≤ 30s
- **Risco de não fazer**: incidente futuro de Supabase = janela indefinida de 500 visíveis sem reação automatizada.
- **Dependências**: nenhuma.

### [availability-2] Adotar Sentry (ou equivalente) no backend + cron com alerta em incremento de erro

- **Problema**
  > Toda telemetria de erro vive em `console.error` para stdout do Render (Logger.ts). Sem dashboard, sem alerta, sem agregação. MTTD depende do operador estar olhando ou de o usuário reclamar.

- **Melhoria Proposta**
  > Instalar `@sentry/node` no backend, inicializar no `index.ts` antes de `app.use`, configurar captura no `errorMiddleware` (já é o ponto central de erros) e adicionar `Sentry.captureCheckIn` no `jobs/ingest-permutas.ts` para monitorar o cron. Criar alerta "erros 500 > 5/min por 5min" + "cron falhou 2× consecutivas". Tactic Bass: **Monitor**.

- **Resultado Esperado**
  > MTTD para qualquer regressão produzida no backend cai de >30min (heurístico, depende do operador) para <5min (alerta Slack). Métrica observável: dependências de APM no package.json = 0 → 1; alertas configurados ≥ 2.

- **Tactic alvo**: Monitor + Predictive Model
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-2, F-availability-6
- **Métricas de sucesso**:
  - Deps de APM no backend: 0 → 1
  - Alertas com regra automática: 0 → ≥ 2
  - Retenção/busca de erros: 7d stdout sem search → 30d+ com search e dedup
- **Risco de não fazer**: regressões silenciosas chegam à reunião de retro do mês seguinte sem dado quantitativo para defender investimento de resiliência.
- **Dependências**: nenhuma (Sentry tem plano free suficiente).

### [availability-3] Graceful shutdown (SIGTERM) com drenagem de reconciliações em curso

- **Problema**
  > `src/backend/index.ts` não trata `SIGTERM`. Render mata o container em auto-deploy; se chegar entre `criarBordero` e `gravarBaixaPermuta` (handshake de 5 passos do `fin010`), o borderô fica órfão "EM CADASTRO" no ERP — exige conciliação manual no Conexos.

- **Melhoria Proposta**
  > Implementar handler de `SIGTERM`/`SIGINT` que: (a) marca `app.locals.shuttingDown = true`, (b) faz `/ready` (novo, card availability-1) retornar 503 imediatamente, (c) aguarda in-flight requests por até 25s (Render dá 30s), (d) fecha o pool Postgres limpo, (e) `process.exit(0)`. Tactic Bass: **Escalating Restart**.

- **Resultado Esperado**
  > Render tira o backend do balanceador antes de matar; reconciliações em curso terminam o handshake. Métrica observável: handlers de SIGTERM = 0 → 1; janela de drain = 0s → ≤ 25s.

- **Tactic alvo**: Escalating Restart
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - Handlers de SIGTERM/SIGINT: 0 → 1
  - Borderôs órfãos esperados por deploy: indeterminado → ~0 (proporcional ao tempo do handshake vs. 25s)
- **Risco de não fazer**: cada deploy em horário comercial = potencial de 1–5 borderôs órfãos × frequência de deploy (alta — autoDeploy ON).
- **Dependências**: availability-1 (precisa de `/ready` para o balanceador respeitar).

### [availability-4] Circuit breaker no ConexosClient (fail-fast quando Conexos cai)

- **Problema**
  > Sem breaker, falha sustentada do Conexos = cada chamada espera 40s × 2 retries × 4 chamadas de handshake × 6 adtos no lote = até ~990s travando Lambda/Express worker e pool Postgres. Render proxy mata em ~100s, gerando 502 com side-effects parciais.

- **Melhoria Proposta**
  > Envolver `ConexosClient` (ou `legacy.postGeneric`/`getGeneric`/`listGeneric`) em um breaker tipo Opossum (`npm install opossum`): abre após 5 falhas consecutivas em 30s, half-open após 60s. Quando aberto, lança `ConexosUnavailableError` imediatamente, sem hit no Conexos. Tactic Bass: **Removal from Service** (do upstream) + **Ignore Faulty Behavior**.

- **Resultado Esperado**
  > Tempo máximo de espera durante incidente Conexos cai de ~990s/lote para ~5s (1 falha) + breaker aberto. Métrica observável: breakers ativos = 0 → 1; tempo p99 de request durante incidente Conexos = >100s → <5s.

- **Tactic alvo**: Removal from Service + Ignore Faulty Behavior
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - Breakers configurados: 0 → 1 (Conexos)
  - Tempo máximo de hold em incidente upstream: ~990s → ~5s
- **Risco de não fazer**: incidente longo do Conexos = inutilização total do backend por arrastamento.
- **Dependências**: idealmente após availability-2 (Sentry) para visualizar abertura/fechamento do breaker.

### [availability-5] Self-test no boot — validar Postgres e Conexos antes de `app.listen`

- **Problema**
  > `init()` do pool Postgres e `ensureSid()` do Conexos são lazy. Configuração errada (credencial Conexos, connection string) só aparece quando a 1ª request real chega. Render marca deploy como sucesso indevidamente.

- **Melhoria Proposta**
  > No `index.ts`, antes do `app.listen`, fazer `await bootstrapAppContainer(); await postgreeDatabaseClient.init(); await conexosService.ensureSid()` em um try/catch que loga e `process.exit(1)` em falha. Render detecta `exit 1` e mantém o deploy anterior (rollback automático). Tactic Bass: **Self-Test**.

- **Resultado Esperado**
  > Deploy com credencial quebrada falha em ≤ 10s sem promover ao tráfego. Métrica observável: deps validadas pre-listen = 0 → 2.

- **Tactic alvo**: Self-Test
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - Dependências probadas no boot: 0 → 2 (Postgres + Conexos)
  - Deploy com config inválida promovido: possível → 0
- **Risco de não fazer**: deploy noturno aparenta sucesso; falha vira incidente do dia seguinte.
- **Dependências**: nenhuma.

### [availability-6] Alerta de falha do cron de ingestão (workflow_run + Sentry/Discord)

- **Problema**
  > `.github/workflows/ingest-permutas.yml` falha silenciosamente: sem `if: failure()`, sem retry, sem reagendamento. Próxima oportunidade só em 6h. Painel `/permutas` exibe dados defasados sem aviso.

- **Melhoria Proposta**
  > Adicionar step `if: failure()` com `actions/github-script` postando para um webhook (Slack/Discord) ou `sentry-cli send-event`. Adicionar um retry interno via `nick-fields/retry@v3` (2 tentativas, 5min entre elas) para falhas transitórias. Tactic Bass: **Monitor** + **Retry**.

- **Resultado Esperado**
  > MTTD do cron quebrado cai de "próximo operador acessar painel" para ≤ 5min após falha. Janela de defasagem do snapshot reduz nos casos de falha transitória. Métrica observável: alertas no workflow = 0 → 1; retries internos = 0 → 2.

- **Tactic alvo**: Monitor + Retry
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - Alertas automáticos em falha do cron: 0 → 1
  - Tentativas por janela: 1 → 3 (1 + 2 retries internos)
- **Risco de não fazer**: snapshot defasado vira norma silenciosa; decisões de baixa em cima de dado stale.
- **Dependências**: idealmente compartilha canal com availability-2.

### [availability-7] Implementar `FallbackExecutor` e aplicar em `GET /permutas/borderos` (stale-while-error)

- **Problema**
  > `FallbackExecutor` é citado como primitiva alvo no CLAUDE.md mas não existe no código. `GET /permutas/borderos` (rota crítica de gestão) cai junto quando o Conexos cai, mesmo havendo cache local `permuta_bordero` maduro em Postgres que cobriria o caso.

- **Melhoria Proposta**
  > (a) Implementar `FallbackExecutor implements IExecutor` em `src/backend/domain/libs/executor/`: tenta `primary`, se lança usa `fallback`, retorna o resultado + marca `stale=true`. (b) Aplicar no `BorderoGestaoService.listarBorderos({ live: true })` — se `refreshCache` falhar, ler do cache + adicionar header `X-Cache-Stale: true` para o frontend mostrar aviso. Tactic Bass: **Passive Redundancy** + **Degradation**.

- **Resultado Esperado**
  > Em incidente Conexos, tela de gestão continua mostrando borderôs (com aviso) em vez de 500. Métrica observável: rotas com fallback = 0 → 1; disponibilidade percebida da tela de borderôs em incidente Conexos = 0% → ~100% (com aviso de staleness).

- **Tactic alvo**: Passive Redundancy + Degradation
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-8, F-availability-4
- **Métricas de sucesso**:
  - Rotas com fallback configurado: 0 → 1 (`GET /permutas/borderos`)
  - Implementações de `IExecutor`: 1 → 2 (`RetryExecutor`, `FallbackExecutor`)
- **Risco de não fazer**: cada minuto de Conexos fora = minuto sem gestão visível, mesmo com cache disponível.
- **Dependências**: ideal após availability-4 (breaker), para o fallback disparar imediato quando breaker está open.

> **Findings sem card explícito**:
> - F-availability-7 (lote sem heartbeat): cross-ref para `docs/regis-review/2026-06-25-1713/performance.md` que já tem card próprio (`performance-N` com `req.on('close')`). Não duplicar; o consolidator deve agrupar.
> - F-availability-9 (errorMiddleware genérico): nice-to-have de UX; backlog inbox sem card dedicado nesta rodada.

## 6. Notas do agente

- Pontos fortes do código atual: idempotência write-ahead em `permuta_alocacao_execucao` + advisory lock + state-machine guard SQL + `dryRun` default são bem acima da média; o **domínio** está protegido. O **substrato operacional** (single Render instance, sem APM, sem SIGTERM, sem breaker, healthcheck stub) é onde a nota cai.
- Métricas de runtime (uptime, MTTR, latência) declaradas como não-medíveis localmente — toda recomendação de SLO espera o card availability-2 ser implementado primeiro.
- Cross-QA: F-availability-2 (APM ausente) afeta diretamente `qa-performance` (sem percentis) e `qa-fault-tolerance` (sem visibilidade de retry-rate). F-availability-3 (SIGTERM) tem cross-ref com `qa-deployability` (deploy interrompe trabalho). F-availability-7 já está coberto em `qa-performance` (`reconciliar-lote` sem heartbeat).
- O cron via GitHub Actions é uma decisão pragmática (Render Cron é pago) mas reforça a dependência de UM disparo a cada 6h — alerta (card availability-6) é a maneira mais barata de mitigar.
