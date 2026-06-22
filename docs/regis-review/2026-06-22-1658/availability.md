---
qa: Availability
qa_slug: availability
run_id: 2026-06-22-1658
agent: qa-availability
generated_at: 2026-06-22T17:10:00Z
scope: all
score: 6
findings_count: 9
cards_count: 8
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Cron GitHub Actions (3×/dia) e analista (botões "Ingestão de dados" / "Cliente filtro") | Fan-out massivo ao ERP Conexos (listFiliais → listProcessos → listFinanceiroAPagar → getDetalheTitulos por candidato + listTitulosAPagar por invoice) durante a ingestão de Permutas | Pipeline `EleicaoPermutasService.computeCandidatas` + `IngestaoPermutasService.executar` (Express puro em Render, Postgres Supabase) | Operação normal (jornada do analista) ou pico de cron com Conexos sob estresse (5xx / `LOGIN_ERROR_MAX_SESSIONS` / 504) | Mascarar a falha: retry com jitter por chamada, abort-on-fail das filiais em voo, bloqueio individual da candidata em `DETAIL_INDISPONIVEL`, advisory-lock impedindo double-fire, ROLLBACK preservando o last-good. Em última instância, fallback de UI ao fixture para que a tela Gestão nunca quebre | Backlog last-good sempre disponível na UI (`stale` flag, nunca DELETE); zero double-execution da ingestão; 0% de candidatas perdidas silenciosamente; recuperação automática na próxima janela cron (≤ 6h); MTBF do flow > 24h |

Comentário: hoje a única "execução com efeito" é a escrita no Postgres próprio. O write-back ao Conexos `fin010` (Fase 3, não implementado) ampliará o impacto de uma falha do mesmo pipeline para "permuta executada em duplicidade no ERP" — toda dívida P0 abaixo precisa estar paga ANTES da Fase 3.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| % de clients externos com timeout HTTP explícito | 2/2 = 100% (Conexos 40s, BCB 10s) | 100% | ✅ | `src/backend/services/conexos.ts:81` (`timeout: 40000`); `src/backend/domain/client/BcbClient.ts:57` (`timeout: 10_000`) |
| % de chamadas Conexos envolvidas em `RetryExecutor` | 4 arquivos com Executor / 1 caminho HTTP cru externo (legacy ConexosService) → toda chamada de domínio passa por `ConexosClient` (cada método tem `retryExecutor.execute`) | 100% domínio | ✅ | grep `RetryExecutor` em `src/backend/domain/{client,libs}`: `ConexosClient.ts`, `BcbClient.ts`, `PostgreeDatabaseClient.ts` |
| Retries configurados no Conexos | 2 retries, 500ms + jitter 200ms (sem backoff exponencial) | Backoff exp. com cap | ⚠️ | `ConexosClient.ts:384-389` |
| Retries do DB pool | 3 retries, 200ms + jitter 200ms, `shouldRetry` por padrão de erro transitório | OK | ✅ | `PostgreeDatabaseClient.ts:36-42, 204-207` |
| FallbackExecutor / PollExecutor implementados | 0 (só existe `RetryExecutor.ts` em `domain/libs/executor/`) | ≥1 fallback documentado | ❌ | `ls src/backend/domain/libs/executor/` |
| Circuit breaker para Conexos | ausente (nenhuma instância de "circuit"/"breaker" no código) | Presente quando Conexos atingir SLA de degradação | ❌ | grep `circuit\|breaker` no backend = 0 hits |
| Catch silencioso em IO externo (sem re-throw / sem warn estruturado no LogService) | 4 ocorrências (todas best-effort intencionais em hidratação `com308`, comentadas) | <5, todas com nota | ⚠️ | `EleicaoPermutasService.ts:477,721`, `AlocacaoPermutasService.ts` (2x), `IngestaoPermutasService.ts:183` |
| Advisory lock no fluxo de escrita (ingestão) | Presente (`pg_try_advisory_lock(INGEST_LOCK_KEY=918273645)`) | Sempre | ✅ | `PermutaRelationalRepository.ts:188-205`; `IngestaoPermutasService.ts:39,96-98` |
| Idempotência da eleição por `Idempotency-Key` | Implementada (header `Idempotency-Key` → `findRunIdByIdempotencyKey` + advisory-lock por hash djb2) | ≥1 endpoint mutante | ✅ | `EleicaoPermutasService.ts:55-185`; `routes/permutas.ts:82-88` |
| Idempotência da rota POST /permutas/ingestao | Ausente (sem header de idempotency-key; o advisory lock global só evita CONCORRÊNCIA, não double-submit em janelas distintas) | Header dedicado por execução | ⚠️ | `routes/permutas.ts:104-131` |
| State-machine guard (transições do estado de elegibilidade) | Recalculada a cada run; sem CHECK SQL bloqueando transições inválidas — `markStale` e UPSERT por `doc_cod` aceitam qualquer estado | Guarda dura no boundary | ⚠️ | `PermutaRelationalRepository.ts:264-289` (ON CONFLICT sobrescreve estado livremente) |
| Rate-limit Express na rota de ingestão (heavyRouteLimiter) | 10 req/min/IP — protege Conexos, MAS o analista que adiciona um cliente-filtro dispara automaticamente `runIngestaoManual()` (UI), e cada add/remove em sequência pode bater o teto (foi o 429 observado) | Rate-limit semantic (per-user) ou backpressure no botão | ⚠️ | `src/backend/http/rateLimit.ts:20-26`; `src/backend/index.ts:80,87`; `src/frontend/app/permutas/clientes-filtro/page.tsx:99,133` |
| Auto-ingestion fan-out na UI de cliente-filtro | Cada add/remove dispara fan-out completo Conexos (≥1 + N filiais + invoices + detalhes por candidata). Bulk-add de 5 importadores → 5 fan-outs sequenciais full-tenant | Coalescer N operações em 1 ingestão (debounce/queue) | ❌ | `clientes-filtro/page.tsx:92-115, 131-148` |
| DLQ / retentativa fora-de-banda do cron diário | Ausente (GitHub Actions falha silenciosamente nas próximas 6h até o próximo slot; sem alerta) | Retry imediato ou alerta operacional | ❌ | `.github/workflows/ingest-permutas.yml:11-14` (cron 3×/dia sem retry) |
| Health endpoint | Presente (`GET /health` retorna `{ status: 'ok', version }`) — mas não verifica DB nem Conexos (liveness puro, não readiness) | Readiness com check DB + ping Conexos opcional | ⚠️ | `src/backend/index.ts:62-63` |
| Fallback de UI ao fixture | Presente — `fetchGestaoPermutas` cai em `gestaoPermutasFixture` em ERROR ou payload vazio | Documentado como modo demo | ✅ | `src/frontend/lib/api.ts:58-88` |
| Sinalização ao analista de modo "fonte=fixture" | Presente (label "Dados de demonstração (fixture com valores reais)") | Sempre | ✅ | `src/frontend/app/permutas/page.tsx:903-906` |
| Bounded concurrency Conexos | 5 filiais × 10 adiantamentos por filial = teto 50 sessões teóricas; histórico de `LOGIN_ERROR_MAX_SESSIONS` documentado | Limite explícito ✅ | ✅ | `EleicaoPermutasService.ts:85-87`; `BoundedConcurrency.ts` |
| AbortController para corte cooperativo de fan-out | Presente (uma filial falha → demais workers veem `signal.aborted`) | OK | ✅ | `EleicaoPermutasService.ts:230-280, 534-536` |
| Atomicidade da ingestão (transação + rollback) | Presente: `withTransaction` + `withAdvisoryLock`; falha → ROLLBACK; cabeçalho `status=error` gravado FORA da tx | OK | ✅ | `PermutaRelationalRepository.ts:188-205`; `IngestaoPermutasService.ts:157-194` |
| Idempotência da rota POST /permutas/cliente-filtro | UPSERT por `pesCod` (idempotente por chave natural) | OK | ✅ | `routes/permutas.ts:164-182`; `ClienteFiltroRepository.upsertClienteFiltro` |
| Testes verde no escopo de availability paths | 373 OK / 1 falha (EnvironmentProvider, ambiental — `.env` local com `CONEXOS_FIL_COD`; passa no CI) | Verde no CI | ✅ | `npm test` em `src/backend` |

> ⚠️ **Não medível localmente**: MTTR real, MTBF, taxa de erro 5xx do Conexos em produção, duração média do ciclo `candidato → reflexão na UI`. Requer instrumentação em Render (logs export → Datadog/Logtail) ou um endpoint `/metrics` Prometheus. Recomendação: instrumentar (a) duração do flow `IngestaoPermutasService.executar` (já há `durationMs` no log `FLOW_COMPLETE` — só falta export), (b) contador de runs `status=error` em `permuta_eleicao_run`, (c) alerta sobre 2 cron-runs consecutivos sem `FLOW_COMPLETE`.

> ⚠️ **Não medível localmente**: cobertura de write-back ao Conexos `fin010` (Fase 3 não implementada). A Frente I hoje é READ-ONLY no ERP — a maior fonte de risco de availability ainda não está no código. Recomendação: a Fase 3 deve nascer com idempotency-key, two-phase commit lógico (gravar intent → confirmar) e DLQ explícita ANTES de qualquer release.

## 3. Tactics — Cobertura no financeiro

### Detect Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | `GET /health` retorna 200; nenhum probe ativo para Conexos | ⚠️ parcial | `src/backend/index.ts:62-63` |
| Heartbeat | Ausente — não há heartbeat agendado para verificar o pipeline entre runs do cron | ❌ ausente | grep `heartbeat` = 0 hits |
| Monitor | `LogService` estruturado com `FLOW_START / FLOW_COMPLETE / FLOW_ERROR / BUSINESS_WARN`, `flowId` correlacionado; logs vão para stdout (Render) — sem dashboard CloudWatch (infra-alvo) | ⚠️ parcial | `EleicaoPermutasService.ts:224-228, 273-280`; `IngestaoPermutasService.ts:134-194` |
| Timestamp | `startedAt/finishedAt/last_seen_at/updated_at` em todas as tabelas relacionais; `data_emissao` carimbada | ✅ presente | `PermutaRelationalRepository.ts:254, 449-466`; migration `0003_permuta_relational.sql` |
| Sanity Checking | Zod nos boundaries (`com298RowSchema`, `processarBodySchema`, `alocacaoBodySchema`, `runsQuerySchema`); `parseOptionalNumber`/`isPago` defensivos | ✅ presente | `ConexosClient.ts:632, 699, 1293-1297`; `routes/permutas.ts:21-56` |
| Condition Monitoring | `stale` flag + `last_ingest_run_id` permitem detectar fatos não-vistos no run atual; `BUSINESS_WARN` `pagination cap hit` | ✅ presente | `PermutaRelationalRepository.ts:449-467`; `EleicaoPermutasService.ts:367-373` |
| Voting | N/A — sem replicação ativa nem múltiplas fontes para o mesmo fato | N/A | sistema single-writer multi-tenant por conta AWS (alvo); hoje single-write Postgres |
| Exception Detection | `ConexosError` tipado (`UPSTREAM_TIMEOUT`/`UPSTREAM_ERROR`) com `statusCode=504`; `IngestLockBusyError` (409); `AlocacaoSaldoError`; `errorMiddleware` central | ✅ presente | `src/backend/domain/errors/ConexosError.ts:14-43`; `errorMiddleware.ts:12-36` |
| Self-Test | Ausente — `/health` não exercita DB nem Conexos | ❌ ausente | `index.ts:62-63` |

### Recover from Faults — Preparation & Repair

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A — Express single-instance no Render. Sem hot-standby | N/A | infraestrutura ATUAL não-alvo |
| Passive Redundancy | N/A — sem follower DB controlado pelo app; Supabase oferece read-replica, não usada | N/A | mesma razão |
| Spare | N/A — Render autoscaling não está configurado neste serviço | N/A | sem `render.yaml` versionado |
| Exception Handling | `try/catch` em todos os boundaries críticos: rotas (`asyncHandler`), `ConexosClient` por método, `EleicaoPermutasService.computeCandidatas` (abort), `buildCandidata` (bloqueia 1 candidata sem matar run) | ✅ presente | `EleicaoPermutasService.ts:498-510, 555-576` |
| Rollback | `withTransaction` faz BEGIN→fn→COMMIT/ROLLBACK; ROLLBACK preserva last-good de `permuta_adiantamento/invoice/declaracao` | ✅ presente | `PostgreeDatabaseClient.ts:102-123`; `IngestaoPermutasService.ts:166-194` |
| Software Upgrade | Deploy Render via webhook + bump lockstep (`scripts/bump-version.ps1`). Sem blue/green; janela curta de downtime no restart | ⚠️ parcial | `.github/workflows/ci.yml`, `CHANGELOG.md` |
| Retry | `RetryExecutor` em ConexosClient (2×, 500ms+jitter), no DB (3×, 200ms+jitter) com `shouldRetry` por padrão transitório | ✅ presente | `RetryExecutor.ts:31-71`; `PostgreeDatabaseClient.ts:30-42` |
| Ignore Faulty Behavior | `getDetalheTitulos` quirk HTTP 400 com `responseData` válido → tratado como legítimo, sem retry; `com308` indisponível por linha → omite o campo, candidata permanece | ✅ presente | `ConexosClient.ts:903-925`; `EleicaoPermutasService.ts:477-479, 721-723` |
| Degradation | `DETAIL_INDISPONIVEL` bloqueia candidata individual mantendo o resto do lote; UI fallback ao `gestaoPermutasFixture` quando backend cai | ✅ presente | `EleicaoPermutasService.ts:498-510, 560-575`; `src/frontend/lib/api.ts:58-88` |
| Reconfiguration | Ausente — não há feature flag para "desligar a auto-ingestão" no cliente-filtro nem para abaixar `FILIAIS_CONCURRENCY` em produção sem deploy | ❌ ausente | `EleicaoPermutasService.ts:86-87` (constantes hard-coded) |

### Recover from Faults — Reintroduction

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | N/A — sem ambiente sombra para validar antes de re-entrar | N/A | escopo do projeto |
| State Resynchronization | A ingestão recomputa o backlog do zero a cada run; `markStale` re-sincroniza fatos antigos; idempotência por `Idempotency-Key` permite replay sem re-fan-out | ✅ presente | `IngestaoPermutasService.ts:95-118`; `EleicaoPermutasService.ts:125-185` |
| Escalating Restart | N/A — Express single-process; Render restart é todo-ou-nada | N/A | infra atual |
| Non-Stop Forwarding | N/A — não há routing layer próprio | N/A | API Gateway é alvo, não atual |

### Prevent Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | Ausente — não existe "drenar Lambda/instância" porque é Express single-instance. Não há kill-switch da auto-ingestão (ver `Reconfiguration`) | ❌ ausente | sem flag de modo manutenção |
| Transactions | `withTransaction` + `withAdvisoryLock`; SQL 100% parametrizado (Rule #5); UPSERT por chave natural | ✅ presente | `PostgreeDatabaseClient.ts:102-158`; `PermutaRelationalRepository.ts:188-205` |
| Predictive Model | Ausente — não há modelo preditivo de falha do Conexos (taxa de 5xx por janela, etc.) | ❌ ausente | nenhuma série temporal armazenada |
| Exception Prevention | Mutex de login Conexos (impede 2× POST /login → `LOGIN_ERROR_MAX_SESSIONS`); MAX_SESSIONS auto-recovery encerra sessão mais antiga; bounded concurrency teto 5×10 | ✅ presente | `src/backend/services/conexos.ts:125-197`; `BoundedConcurrency.ts` |
| Increase Competence Set | Conexos quirk HTTP 400-com-payload-válido tratado; `parseDate` resolve quirk de fuso horário; `mapDeclaracaoDataBase` lida com 2 variantes wire (DI vs DUIMP) | ✅ presente | `ConexosClient.ts:903-925, 1257-1284, 718-734` |

## 4. Findings

### F-availability-1: Auto-ingestão disparada por clique de UI esgota o `heavyRouteLimiter` e expõe fan-out Conexos não-coalescido

- **Severidade**: P1
- **Tactic violada**: Exception Prevention + Reconfiguration
- **Localização**:
  - `src/frontend/app/permutas/clientes-filtro/page.tsx:92-115` (add) e `:131-148` (remove) — cada operação chama `runIngestaoManual()` imediatamente após `addClienteFiltro/removeClienteFiltro`.
  - `src/backend/http/rateLimit.ts:20-26` — `heavyRouteLimiter` 10 req/min/IP cobre tanto `/permutas/ingestao` quanto qualquer outra rota `/permutas/*` (instalado em `index.ts:87` antes do `permutasRouter`).
- **Evidência (objetiva)**:
  ```
  // frontend (clientes-filtro/page.tsx)
  await addClienteFiltro(selecionado, imp?.importador)
  await load()
  // Roteia AUTOMATICAMENTE os adtos do novo importador para cross-process [...]
  const r = await runIngestaoManual()   // ← fan-out Conexos completo
  ```
  Bulk de N adições sequenciais = N fan-outs full-tenant (`listFiliais` × `listProcessos` × `listFinanceiroAPagar` × `getDetalheTitulos` por candidato + `listTitulosAPagar` por invoice — após v0.4.0, eleição faz +1 `getDetalheTitulos` por invoice casável). O 429 observado pelo usuário veio justamente do `heavyRouteLimiter` saturar com adds/removes consecutivos.
- **Impacto técnico**: cada clique do analista (add/remove/reorder) dispara um fan-out que custa minutos e ocupa o advisory lock; concorrentemente, o cron 3×/dia compete pelo mesmo recurso. Excesso → 429 → analista vê estado "limbo" (cadastro salvo, painel não realinhado).
- **Impacto de negócio**: o analista perde confiança ("adicionei o cliente-filtro e a tela não atualizou") e tende a clicar de novo, agravando o cenário. Re-add automático no caminho de falha (`page.tsx:144`) já mostra que o time sentiu o problema, mas é band-aid.
- **Métrica de baseline**: 429 reproduzido durante a sessão; `heavyRouteLimiter` = 10 req/min, fan-out médio (eleição + ingestão) ≥ 30s. Cap teórico = 10 cliente-filtro touches/min antes do 429. Após PR #4 (`getDetalheTitulos` adicional por invoice casável), latência por fan-out cresceu sem instrumentação publicada.

### F-availability-2: PR #4 introduziu fan-out extra de `getDetalheTitulos` por invoice casável sem revisão de timeout cumulativo

- **Severidade**: P1
- **Tactic violada**: Predictive Model + Monitor
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:745-751` (live-balance fetch da invoice em `computeVariacao`).
- **Evidência (objetiva)**:
  ```typescript
  const [titAdto, titInv, detInv] = await Promise.all([
      this.conexosClient.listTitulosAPagar({ docCod: adiantamento.docCod, filCod }),
      this.conexosClient.listTitulosAPagar({ docCod: invoice.docCod, filCod }),
      this.conexosClient
          .getDetalheTitulos({ docCod: invoice.docCod, filCod })
          .catch(() => undefined),
  ]);
  ```
  Esse `getDetalheTitulos` da invoice é NOVO em v0.4.0 (greedy distribution + invoice live-balance). Cada candidata elegível com `invoiceCasada` agora soma +1 GET ao Conexos.
- **Impacto técnico**: para um tenant com K candidatas elegíveis, o número de chamadas detail passou de `K` (só adiantamentos) para `K + K_casados`. Timeout absoluto é 40s por chamada (`services/conexos.ts:81`), com 2 retries → 120s worst-case por candidata bloqueia 1 dos 10 slots da `ADIANTAMENTOS_CONCURRENCY`.
- **Impacto de negócio**: aumento da janela em que o lock de ingestão fica retido → mais 409 ao analista. Sem dashboard, ninguém percebe quando o p95 da run sobe.
- **Métrica de baseline**: durante a revisão, `durationMs` é logado mas não exportado. Sem série histórica para comparar pré-/pós-PR #4. Comparativo aproximado: invoice live-balance adiciona 1 GET por casável; se 100 candidatas elegíveis ⇒ +100 GETs/run × 3 runs/dia = 300 GETs/dia extras no Conexos.

### F-availability-3: Retry sem backoff exponencial nem classificação por código HTTP no Conexos

- **Severidade**: P2
- **Tactic violada**: Retry (Bass)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:384-389`; `src/backend/domain/libs/executor/RetryExecutor.ts:31-71`.
- **Evidência (objetiva)**:
  ```typescript
  this.retryExecutor = new RetryExecutor({
      retries: 2,
      delayMs: 500,
      shouldLog: true,
      jitterMs: 200,
  });
  ```
  `shouldRetry` é o default (`() => true`): retenta qualquer erro, inclusive 4xx semânticos. Sem backoff exponencial — duas tentativas a 500ms + jitter 200ms colidem com o próximo retry de outro worker (thundering-herd light, agravado por 5×10 slots).
- **Impacto técnico**: um pico de 504 Conexos faz 50 workers retentarem em janela de ~700ms, voltando a bater o ERP no mesmo segundo. Para 401 (sessão expirada), o retry imediato sem `login()` desperdiça os 2 retries antes de surfaceear o erro.
- **Impacto de negócio**: amplifica falhas transientes ao invés de aliviá-las. O Conexos historicamente já responde com `LOGIN_ERROR_MAX_SESSIONS` em pico — o pattern atual ataca esse modo.
- **Métrica de baseline**: 2 retries, 500ms base; sem `shouldRetry` específico (default `() => true`). DB usa o caminho correto (`isTransientConnectionError`).

### F-availability-4: Ausência de circuit-breaker para o Conexos

- **Severidade**: P2
- **Tactic violada**: Removal from Service / Reconfiguration
- **Localização**: ausente — `grep "circuit\|breaker"` em `src/backend` = 0 hits.
- **Evidência (objetiva)**: nenhum módulo monitora taxa de erro por janela e abre/fecha um circuito. Se o Conexos cair por 30 minutos, cada cron + cada clique de UI dispara fan-out completo e falha após retries, alocando conexões + lock ociosamente.
- **Impacto técnico**: durante outage Conexos prolongado, o backlog de ingestões falhadas se acumula no GitHub Actions (3 runs/dia falham silenciosamente) e cada analista que clica gera lixo no log.
- **Impacto de negócio**: percepção de instabilidade ("a tela demorou 2 min e deu erro"). Aumenta o suporte.
- **Métrica de baseline**: 0 circuit breakers implementados; ConexosError é o único feedback. Sem janela de cooldown.

### F-availability-5: GitHub Actions cron sem retry/alerta em caso de falha

- **Severidade**: P1
- **Tactic violada**: Heartbeat + Monitor
- **Localização**: `.github/workflows/ingest-permutas.yml:11-14`.
- **Evidência (objetiva)**:
  ```yaml
  on:
    schedule:
      - cron: '0 9,15,21 * * *'
    workflow_dispatch: {}
  concurrency:
    group: ingest-permutas
    cancel-in-progress: false
  ```
  Se a run das 09:00 UTC falha (Conexos 5xx no momento, segredo expirado, migration error), a próxima tentativa é só às 15:00 UTC (6h depois). O `concurrency` não cancela, mas também não retenta. Não há `if: failure()` notification step.
- **Impacto técnico**: backlog cresce stale por 6h; analista descobre que o painel está desatualizado no meio do dia. SLA da ingestão = "best-effort".
- **Impacto de negócio**: decisão tomada com dados de 6h+ atrás. Em janela de fechamento, isso é inaceitável.
- **Métrica de baseline**: 3 cron-runs/dia, intervalo médio entre tentativas = 6h. Sem `notifications:` ou `gh issue create` em failure → MTTD da falha do cron = "quando o analista percebe", potencialmente 24h.

### F-availability-6: Health endpoint não verifica dependências (DB + Conexos)

- **Severidade**: P2
- **Tactic violada**: Self-Test + Ping/Echo
- **Localização**: `src/backend/index.ts:62-63`.
- **Evidência (objetiva)**:
  ```typescript
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
  Retorna OK mesmo se: (a) o pool Postgres não inicializa, (b) o Conexos está fora, (c) migrations pendentes. Render usa esse endpoint como readiness probe; sob falha de dependência, o serviço continua "saudável" externamente.
- **Impacto técnico**: orquestrador (Render) não tira o serviço de rotação quando o DB cai. Auto-recovery não acontece.
- **Impacto de negócio**: degradação invisível — usuários veem 500s prolongados em vez de o orquestrador reiniciar/marcar unhealthy.
- **Métrica de baseline**: 1 endpoint `/health` retornando estático; 0 checks de dependência.

### F-availability-7: POST /permutas/ingestao sem `Idempotency-Key` (diferente da rota /eleicao)

- **Severidade**: P2
- **Tactic violada**: Transactions / State Resynchronization
- **Localização**: `src/backend/routes/permutas.ts:104-131` (vs. `:73-97` em `/eleicao` que aceita `Idempotency-Key`).
- **Evidência (objetiva)**: a rota `/eleicao` lê `req.header('Idempotency-Key')`, mas `/ingestao` não. Hoje o advisory lock global (`INGEST_LOCK_KEY=918273645`) só impede CONCORRÊNCIA. Um analista que dispara o botão, troca de aba, vê 504 e dispara de novo após o lock ser liberado, faz 2 fan-outs reais (não houve replay).
- **Impacto técnico**: dois fan-outs Conexos full-tenant para o mesmo "intent" do usuário. Custo: minutos de ERP + 2× ocupação do lock.
- **Impacto de negócio**: ampliação do consumo do quota Conexos; lentidão percebida pelo analista. No futuro (Fase 3 com write-back fin010), isso vira double-execution P0.
- **Métrica de baseline**: idempotência presente em 1/2 rotas mutantes do domínio permutas (50%).

### F-availability-8: Catch silencioso em hidratação `com308` mascara perda parcial de dados sem `LogService.warn`

- **Severidade**: P3
- **Tactic violada**: Monitor / Exception Detection
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:477-479` e `:721-723`; `AlocacaoPermutasService.ts` (2 ocorrências similares).
- **Evidência (objetiva)**:
  ```typescript
  try {
      const tit = await this.conexosClient.listTitulosAPagar({ docCod: i.docCod, filCod });
      // ...
  } catch {
      // com308 indisponível p/ esta invoice — segue sem valor negociado.
  }
  ```
  Decisão intencional documentada — `ConexosError` já foi logado por `RetryExecutor`. Mas: não há `BUSINESS_WARN` agregado contando quantas linhas perderam hidratação na run. A trilha de auditoria `permuta_eleicao_run` não armazena esse N.
- **Impacto técnico**: silently-degraded runs aparecem como `status=success` na trilha. Operador não sabe se "10% das invoices vieram sem moeda negociada" foi rotina ou outage parcial.
- **Impacto de negócio**: relatórios subestimam Variação Cambial sem que ninguém perceba.
- **Métrica de baseline**: 4 catches silenciosos em IO Conexos; 0 contadores agregados de "hidratação parcial".

### F-availability-9: Ausência de feature flag / kill-switch para auto-ingestão em cliente-filtro

- **Severidade**: P2
- **Tactic violada**: Reconfiguration / Removal from Service
- **Localização**: `src/frontend/app/permutas/clientes-filtro/page.tsx:99,133` chama `runIngestaoManual()` sempre.
- **Evidência (objetiva)**: não há env var ou setting que permita ao operador "desligar" a re-ingestão automática durante um pico de uso ou outage Conexos. A única alternativa é deploy.
- **Impacto técnico**: durante outage Conexos, cada add/remove cria 1 fan-out garantido a falhar.
- **Impacto de negócio**: degradação cascateia (UI fica lenta, analista tenta de novo, mais carga).
- **Métrica de baseline**: 0 feature flags no caminho de auto-ingestão; deploy é o único reconfigurador.

## 5. Cards Kanban

### [availability-1] Coalescer auto-ingestão de cliente-filtro em uma única run debounced

- **Problema**
  > Cada add/remove de cliente-filtro dispara um fan-out Conexos full-tenant via `runIngestaoManual()` (`clientes-filtro/page.tsx:99,133`). Bulk de N operações = N fan-outs sequenciais; o `heavyRouteLimiter` (10 req/min) satura e o analista recebe 429 (reproduzido na sessão). Cada fan-out custa minutos e prende o `INGEST_LOCK_KEY`.

- **Melhoria Proposta**
  > Aplicar **Exception Prevention** + **Reconfiguration**: (1) no frontend, debounce/queue de 5–10s acumulando operações antes de chamar `runIngestaoManual` uma única vez; (2) no backend, expor `POST /permutas/ingestao` aceitando `Idempotency-Key` para fundir disparos idênticos (ver card availability-3); (3) feature flag `PERMUTAS_AUTO_INGEST_ON_FILTRO` para o operador desligar a auto-ingestão sob incidente. Tocar: `src/frontend/app/permutas/clientes-filtro/page.tsx`, `src/backend/routes/permutas.ts`, `src/backend/http/rateLimit.ts` (limit per-user, não per-IP global).

- **Resultado Esperado**
  > 1 fan-out por sessão de cadastro (batch), independente de quantos importadores o analista adicione. Zero 429 em fluxos de cadastro normais. Operador pode desligar auto-ingestão em produção sem deploy.
- **Tactic alvo**: Exception Prevention / Reconfiguration
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-1, F-availability-9
- **Métricas de sucesso**:
  - Fan-outs Conexos por sessão de N adds: N → 1
  - 429 em /permutas/ingestao após bulk: presente → 0
- **Risco de não fazer**: cada release de tenants novos amplifica o problema; auto-ingestão acaba sendo desativada por desespero (perdendo o roteamento permuta-manual automático).
- **Dependências**: card availability-3 (idempotency na rota /ingestao)

### [availability-2] Instrumentar dashboard de runs (duração, taxa de erro, hidratação parcial)

- **Problema**
  > `durationMs`, `status`, `totalCandidatas/Elegiveis/Bloqueadas/Stale` são logados via `LogService` mas não há export para Datadog/Logtail/Prometheus. Após PR #4 introduzir +1 `getDetalheTitulos` por invoice casável (F-availability-2), não há série temporal para comparar latência pré-/pós. Catches silenciosos em hidratação `com308` (F-availability-8) também não contam para a trilha.

- **Melhoria Proposta**
  > Aplicar **Monitor**: (1) adicionar export estruturado via `pino` ou JSON line + sidecar para a plataforma escolhida (Logtail é o caminho mais barato em Render); (2) gravar contador `hidratacaoParcialCount` no cabeçalho `permuta_eleicao_run` (nova coluna ou jsonb `metrics`); (3) alerta quando 2 runs consecutivas têm `status=error` OU `durationMs > p95_baseline × 2`.

- **Resultado Esperado**
  > p95/p99 da run e taxa de erro visíveis em dashboard; alerta dispara antes que o analista perceba. Comparativo PR-a-PR de performance da ingestão fica viável.
- **Tactic alvo**: Monitor / Predictive Model
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-2, F-availability-5, F-availability-8
- **Métricas de sucesso**:
  - Métricas exportadas (duração, erro, hidratação parcial): 0 → 3
  - MTTD de cron failure: ~24h → < 1h
- **Risco de não fazer**: regressões de performance só aparecem em outage; impossível defender investimento sem números.
- **Dependências**: nenhuma

### [availability-3] Adotar Idempotency-Key em POST /permutas/ingestao (paridade com /eleicao)

- **Problema**
  > `/permutas/ingestao` não aceita `Idempotency-Key`. O advisory lock (`INGEST_LOCK_KEY`) só evita concorrência; um duplo-clique após o lock liberar dispara dois fan-outs reais. A rota irmã `/eleicao` já implementa o pattern (`EleicaoPermutasService.executar` com hash djb2 do header).

- **Melhoria Proposta**
  > Aplicar **State Resynchronization** + **Transactions**: replicar o pattern de `EleicaoPermutasService` em `IngestaoPermutasService`. Header `Idempotency-Key` → lookup em `permuta_eleicao_run` por jsonb `idempotency_key` (ou nova tabela) → replay se TTL 24h. Tocar: `src/backend/domain/service/permutas/IngestaoPermutasService.ts`, `routes/permutas.ts:104-131`, migration nova para índice.

- **Resultado Esperado**
  > Replay seguro (zero fan-out adicional) em duplo-click ou retry de cliente. Pré-requisito para a Fase 3 (write-back fin010) ser P0-safe.
- **Tactic alvo**: Transactions / State Resynchronization
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-7
- **Métricas de sucesso**:
  - Idempotência em rotas mutantes: 1/2 (50%) → 2/2 (100%)
  - Fan-outs Conexos em duplo-click: 2 → 1 (replay)
- **Risco de não fazer**: na Fase 3, duplo-click vira double-permuta no Conexos `fin010` — irreversível.
- **Dependências**: nenhuma (mesmo pattern já existe em `/eleicao`)

### [availability-4] Configurar retry no GitHub Actions cron + alerta em falha

- **Problema**
  > `.github/workflows/ingest-permutas.yml` agenda 3 cron-runs/dia. Se uma falha (Conexos 5xx, segredo expirado), a próxima é 6h depois. Sem `if: failure()` notification, ninguém é avisado — MTTD pode chegar a 24h.

- **Melhoria Proposta**
  > Aplicar **Heartbeat** + **Monitor**: (1) adicionar `continue-on-error: false` + step `if: failure()` que abre uma issue (`gh issue create`) ou dispara webhook para Slack/Discord; (2) retry imediato no MESMO workflow via `nick-fields/retry@v3` (3 tentativas, 15min back-off); (3) cron auxiliar `0 */1 * * *` que executa um "ping" leve em `/health` (com check de DB) e abre issue se 3 falhas consecutivas.

- **Resultado Esperado**
  > Falha de cron é descoberta em ≤ 1h; retry automático cobre falhas transientes; backlog stale fica limitado a 1 janela perdida.
- **Tactic alvo**: Heartbeat / Monitor
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - MTTD cron failure: ~24h → < 1h
  - Janelas perdidas consecutivas: até 4 (24h) → ≤ 1 (6h, aceitável)
- **Risco de não fazer**: em fim de mês, analista descobre que o painel está com dados de ontem na manhã do fechamento.
- **Dependências**: card availability-2 (para reaproveitar o sink de alerta)

### [availability-5] Health endpoint readiness com check DB + (opcional) Conexos

- **Problema**
  > `GET /health` retorna 200 mesmo com pool Postgres morto, migrations pendentes ou Conexos fora. Render usa isso como readiness probe → não tira o serviço de rotação na falha de dependência.

- **Melhoria Proposta**
  > Aplicar **Self-Test** + **Ping/Echo**: split em `/health` (liveness — só `{ status: 'ok' }`) e `/ready` (readiness — `SELECT 1` no pool + opcional probe leve no Conexos com timeout curto e cache de 30s para não bater no ERP a cada poll). `/ready` retorna 503 quando dependência crítica falha. Configurar Render para usar `/ready` como readiness e `/health` como liveness.

- **Resultado Esperado**
  > Render reinicia/desmarca o serviço automaticamente em falha de DB; analista nunca vê 500 prolongado sem auto-recovery.
- **Tactic alvo**: Self-Test
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - Endpoints de health: 1 (liveness apenas) → 2 (liveness + readiness)
  - Auto-recovery em falha de DB: manual (deploy) → automático (Render restart)
- **Risco de não fazer**: outage de DB vira ticket de suporte em vez de auto-cura.
- **Dependências**: nenhuma

### [availability-6] Classificar retry por tipo de erro + backoff exponencial para Conexos

- **Problema**
  > `ConexosClient` usa `RetryExecutor` com `shouldRetry` default (`() => true`) — retenta 4xx semânticos (e.g. validation error). Delay fixo 500ms + jitter 200ms causa thundering-herd light em 50 workers concorrentes (`5 × 10`). Para 401 (sessão expirada), o retry imediato sem `login()` desperdiça as 2 tentativas.

- **Melhoria Proposta**
  > Aplicar **Retry** (Bass) com classificação: (1) `shouldRetry` específico para Conexos — só retenta 5xx, ECONNRESET, ETIMEDOUT; 4xx propaga imediatamente (exceção: 401 → forçar `legacy.ensureSid()` com `sessionToKill` antes do retry). (2) Backoff exponencial com cap: 500ms, 2s, cap 5s + jitter. Tocar: `src/backend/domain/libs/executor/RetryExecutor.ts` (adicionar opção `backoffMultiplier`) ou refatorar `ConexosClient.retryExecutor` para receber a função.

- **Resultado Esperado**
  > Picos de 504 no Conexos não amplificam; 401 recupera sessão na 1ª tentativa; ataques de thundering-herd reduzidos.
- **Tactic alvo**: Retry
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - Retries gastos em 4xx semânticos: 2 por erro → 0
  - Janela de pico de retry: 700ms → 500ms + 2s + 5s (espalhado)
- **Risco de não fazer**: cada outage do Conexos é amplificado pelo nosso próprio retry pattern.
- **Dependências**: card availability-2 (para medir o ganho)

### [availability-7] Introduzir circuit-breaker para o Conexos com half-open + métricas

- **Problema**
  > Não há nenhum mecanismo para parar de bater no Conexos quando ele está claramente fora. Outage de 30min ⇒ 3 cron-runs falhando + N cliques de UI gerando lixo no log e ocupando o lock.

- **Melhoria Proposta**
  > Aplicar **Removal from Service** + **Reconfiguration**: implementar um `CircuitBreakerExecutor` (irmão de `RetryExecutor`/`FallbackExecutor`) que abre após X falhas em janela Y, fica aberto Z segundos, half-open com 1 tentativa. Quando aberto, `EleicaoPermutasService.computeCandidatas` aborta cedo com `ConexosError` informativo e a UI mostra "ERP indisponível, próxima tentativa em Zs" em vez de timeout silencioso. Tocar: `src/backend/domain/libs/executor/CircuitBreakerExecutor.ts` (novo); integrar em `ConexosClient`.

- **Resultado Esperado**
  > Durante outage Conexos, fan-outs param em < 5s em vez de em ≥ 30s (timeout cumulativo). Métrica de "circuito aberto por X minutos" alimenta o dashboard.
- **Tactic alvo**: Removal from Service / Reconfiguration
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - Latência da chamada Conexos durante outage: ~120s (3 timeouts × 40s) → < 5s
  - Cron-runs falhados durante outage prolongado: 3 ineficazes → 0–1 + 1 alerta
- **Risco de não fazer**: outage do Conexos vira outage compartilhado (nosso serviço fica indistinguivelmente lento).
- **Dependências**: card availability-2 (sink de métricas)

### [availability-8] Contar e expor hidratação parcial (`com308`) por run

- **Problema**
  > 4 catches silenciosos em hidratação Conexos (`EleicaoPermutasService.ts:477,721`, `AlocacaoPermutasService.ts` ×2) seguem com a candidata mas SEM `valorMoedaNegociada/moedaNegociada/taxa`. Trilha de auditoria não diferencia "10% das linhas perderam dado" de "outage Conexos parcial".

- **Melhoria Proposta**
  > Aplicar **Monitor**: contador local na execução, incrementado em cada catch; gravado no cabeçalho `permuta_eleicao_run` (coluna nova `hidratacao_parcial_count INT` ou dentro de um jsonb `metrics`). `LogService.warn` ao final da run quando o contador > threshold (e.g. > 5% das candidatas). Tocar: `EleicaoPermutasService.ts`, `IngestaoPermutasService.ts`, nova migration `0015_hidratacao_parcial.sql`.

- **Resultado Esperado**
  > Toda run carrega `hidratacaoParcialCount`; operador detecta degradação parcial sem precisar correlacionar logs manualmente.
- **Tactic alvo**: Monitor / Exception Detection
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-8
- **Métricas de sucesso**:
  - Runs com hidratação parcial visíveis na trilha: 0 → 100%
  - Tempo p/ identificar outage parcial do Conexos: "nunca" → < 30min
- **Risco de não fazer**: relatórios financeiros subestimam variação cambial silenciosamente.
- **Dependências**: card availability-2 (sink)

## 6. Notas do agente

- Decisão de escopo: tratei `availability` no recorte permuta (Frente I), READ-ONLY no Conexos. Quando a Fase 3 (write-back `fin010`) entrar, todos os P2/P3 desta seção sobem para P1 e o card availability-3 (idempotency-key) vira P0.
- Métricas não medíveis localmente declaradas: MTTR/MTBF reais (sem export de logs) e ganho do PR #4 em latência (sem baseline armazenado).
- Cross-QA: F-availability-1 cruza com `performance` (heavyRouteLimiter saturando) e `fault-tolerance` (auto-ingestão sem coalescing); F-availability-7 cruza com `modifiability` (CircuitBreakerExecutor expande a família de Executors). F-availability-5 (cron sem alerta) cruza com `deployability`/`observability` — alertar o consolidator.
- 4 catches silenciosos em hidratação `com308` são intencionais e estão documentados como degradation tactic; downgrade para P3 com card para visibilizar a contagem em vez de exigir refactor.
- Tests verde no escopo (1 falha ambiental conhecida em `EnvironmentProvider` — `.env` local com `CONEXOS_FIL_COD` definido; passa no CI).
