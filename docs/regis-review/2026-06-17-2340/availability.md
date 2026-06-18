---
qa: Availability
qa_slug: availability
run_id: 2026-06-17-2340
agent: qa-availability
generated_at: 2026-06-18T00:10:00Z
scope: backend
score: 5
findings_count: 7
cards_count: 7
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado a Permutas Frente I — Fatia 1)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (lado servidor) e Postgres da própria aplicação | Falha intermitente (5xx/timeout no `com298`/`imp019`/`imp223`) ou queda do pool de conexão durante a eleição de candidatas | `EleicaoPermutasService.executar` → `ConexosClient.list*` (fan-out paginado) + `PermutaSnapshotRepository.persistRun` (1 INSERT cabeçalho + N INSERTs snapshot) | Trigger manual via `POST /permutas/eleicao` (operacional, sem cron); painel de leitura em `GET /permutas/painel` | Job aborta com erro tipado, persiste run com `status='error'` e zero linhas em `permuta_candidata_snapshot`; painel anterior continua servível; analista pode re-disparar de imediato (job idempotente, recomputa do zero) | 0% snapshot parcial visível ao painel; 100% das runs (sucesso/erro) auditadas na tabela `permuta_eleicao_run`; MTTR ≤ 1 re-trigger manual (≤ 5 min) para falhas transientes |

> Observação de escopo: a Fatia 1 é **READ-ONLY** no ERP — não há risco de escrita duplicada no `fin010`. O dano de disponibilidade se concretiza no painel (snapshot ausente, vazio ou inconsistente), não no negócio do cliente. Mesmo assim, snapshot truncado silenciosamente induz decisão errada do analista, então o critério de "0% snapshot parcial" é load-bearing.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Migration runner invocado em algum ponto do boot/CI/CLI | **0 referências** (definido em `migrations/runMigrations.ts` mas nunca chamado) | ≥1 (boot ou script `npm run migrate`) | ❌ | `grep -rn "MigrationRunner" src/backend` → só a própria definição |
| `% chamadas externas ao Conexos no delta envolvidas em `RetryExecutor` | **100%** (todos os métodos públicos passam por `paginate`/`callList`/`retryExecutor.execute`) | 100% | ✅ | `src/backend/domain/client/ConexosClient.ts:353-359, 1059-1071, 1108-1124` |
| Total de tentativas do `RetryExecutor` do Conexos | `retries: 2` (loop `counter <= retries` ⇒ **2 tentativas TOTAIS**, não 1+2) | ≥3 tentativas para 5xx transitório de ERP | ⚠️ | `src/backend/domain/client/ConexosClient.ts:354`; `src/backend/domain/libs/executor/RetryExecutor.ts:38` |
| Cobertura de `shouldRetry` no `RetryExecutor` do Conexos | `shouldRetry` ausente → **retenta TODA exceção** (inclusive `ConexosError` por 4xx VALIDATION) | filtrar por status 5xx/timeout/ECONNRESET | ⚠️ | `src/backend/domain/client/ConexosClient.ts:353-359` |
| Pool Postgres `max` connections | **1** | ≥ N onde N = tamanho de um snapshot de candidatas serializado (ver finding #2) | ❌ | `src/backend/domain/client/database/PostgreeDatabaseClient.ts:11` |
| `persistRun` envolto em `BEGIN/COMMIT` (transação atômica) | **0** (1 INSERT da run + N INSERTs em loop, cada um vai pelo pool separadamente) | persistência completa em 1 transação | ❌ | `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:65-94`; `grep "BEGIN\|COMMIT" repository/permutas/*` → 0 hits |
| Sanity check de transição de estado da run (`success` ⇒ snapshot rows > 0, `error` ⇒ rows == 0) | **Não enforced no schema**: `permuta_eleicao_run` aceita qualquer combinação | CHECK no schema OU constraint na inserção | ❌ | `src/backend/migrations/0001_permuta_eleicao.sql:9-21` |
| Timeout HTTP da camada legacy do Conexos | **40 s** (`services/conexos.ts:81`) | mantido | ✅ | `src/backend/services/conexos.ts:81` |
| Cap de paginação (silent truncation handling) | `MAX_PAGES=50` × `PAGE_SIZE=500` = **25k rows**; cap-hit dispara `BUSINESS_WARN` mas o snapshot é persistido como `success` mesmo truncado | persistir como `partial` quando `capHit=true` (status já existe no DB!) | ⚠️ | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:155-165, 92-99`; `migrations/0001_permuta_eleicao.sql:14` |
| Job idempotente (re-execução não corrompe) | Implementado em design (cada run gera novo `runId`; painel lê `ORDER BY finished_at DESC LIMIT 1`) | mantido | ✅ | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:62-99`; `repository/permutas/PermutaSnapshotRepository.ts:107-110` |
| Health-check endpoint cobre dependência Postgres | `/health` retorna `status:'ok'` sem testar pool DB nem Conexos | health probe semântico (testa pool + ping legacy) | ❌ | `src/backend/index.ts:57` |
| Concorrência da run (lock anti-overlap em runs paralelas) | **Ausente** — `POST /permutas/eleicao` aceita disparos paralelos; cada um cria seu próprio `runId` e dispara fan-out concorrente ao Conexos | advisory lock (`pg_try_advisory_lock`) ou flag em `permuta_eleicao_run.status='running'` | ❌ | `src/backend/routes/permutas.ts:24-40`; `repository/permutas/PermutaSnapshotRepository.ts:59-95` |
| Catch-blocks silenciosos no caminho da eleição | 1 swallow defensivo em `getMnyTitPermutar` (HTTP 400 VALIDATION → `return undefined`; doc/intencional) + 1 swallow no `appContainer` (init Postgres falha → `console.warn`) | swallow OK em `getMnyTitPermutar`; em `appContainer.init` deveria escalar pelo menos a um log estruturado | ⚠️ | `src/backend/domain/client/ConexosClient.ts:840-854`; `domain/appContainer.ts:35-42` |

> ⚠️ **Não medível neste run (`--quick`)**: MTTR real, % de runs com `capHit=true` em produção, tempo médio de execução da run, taxa de 5xx do Conexos. Requerem CloudWatch (ou equivalente) com instrumentação de duração de FLOW_START → FLOW_COMPLETE/FLOW_ERROR. Recomendação: incluir `durationMs` (já presente no FLOW_COMPLETE em `EleicaoPermutasService.ts:111`) num dashboard, mais um contador `permuta_eleicao_runs{status}` derivado da tabela `permuta_eleicao_run`.

> ⚠️ **Não medível neste run**: latência ponta-a-ponta do fan-out por filial (N PROFORMAs × 1 detail `getMnyTitPermutar` + 2 listDeclaracao + 1 listFinanceiroAPagar + 2 listTitulosAPagar). Requer execução contra Conexos real. Recomendação: smoke-test em dev com `filCod=2` da Columbia (referência usada em ADR-0020/0021).

## 3. Tactics — Cobertura na feature Permutas Fatia 1

### Detect Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | `legacy.ensureSid()` no início de cada chamada Conexos faz ping de sessão implícito; sem ping ativo do Postgres | ⚠️ parcial | `ConexosClient.ts:370, 382, 1061, 1111` |
| Heartbeat | Ausente — sem batimento periódico do serviço | ❌ | — |
| Monitor | `LogService` estruturado (FLOW_START/COMPLETE/ERROR + BUSINESS_WARN/INFO); sem métrica externa (CloudWatch/Prom) | ⚠️ parcial | `EleicaoPermutasService.ts:65-69, 101-113, 144-149, 160-165` |
| Timestamp | `started_at`/`finished_at` na run (TIMESTAMPTZ); `borDtaMvto` e `parseDate` com fix `BR_NOON_SHIFT_MS` para fuso BR | ✅ presente | `migrations/0001_permuta_eleicao.sql:12-13`; `ConexosClient.ts:36, 1160-1171` |
| Sanity Checking | Zod nos boundaries (`com298RowSchema`, `declaracaoRowSchema`); CHECK só no `status` da run e `status` do snapshot (não cruzado entre run.status e contagem de rows) | ⚠️ parcial | `client/permutas/conexosPermutasSchemas.ts`; `migrations/0001_permuta_eleicao.sql:14, 32` |
| Condition Monitoring | `capHit` (truncation) é monitorado via `BUSINESS_WARN`, mas não classifica a run como `partial` no DB | ⚠️ parcial | `EleicaoPermutasService.ts:159-165, 92` |
| Voting | N/A — sem replicação ou fonte de verdade duplicada | N/A | — |
| Exception Detection | `ConexosError` tipado encapsula falhas; `try/catch` no orquestrador captura tudo e persiste `status='error'` | ✅ presente | `ConexosClient.ts:373-376, 1063-1071, 1118-1124`; `EleicaoPermutasService.ts:125-150` |
| Self-Test | `/health` é estático (`status:'ok'`), sem self-test do pool DB nem da sessão Conexos | ❌ | `index.ts:57` |

### Recover from Faults — Preparation & Repair

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A nesta fatia (1 Express, 1 pool DB) | N/A | — |
| Passive Redundancy | N/A | N/A | — |
| Spare | N/A | N/A | — |
| Exception Handling | Try/catch no orquestrador; `errorMiddleware` central no Express; `asyncHandler` evita unhandled rejection | ✅ presente | `EleicaoPermutasService.ts:125-150`; `http/asyncHandler.ts`; `http/errorMiddleware.ts` |
| Rollback | **Ausente** — não há `BEGIN/COMMIT/ROLLBACK` no `persistRun`. Múltiplos INSERTs em loop, cada um via `pool.query` separado | ❌ | `PermutaSnapshotRepository.ts:65-94`; `PostgreeDatabaseClient.ts:90-105` |
| Software Upgrade | Migrations versionadas (`schema_migrations`) — runner idempotente, mas **nunca invocado** (P0) | ❌ | `migrations/runMigrations.ts`; `grep -rn MigrationRunner src/backend` → só a definição |
| Retry | `RetryExecutor` envolve todas as chamadas Conexos (2 tentativas, 500ms + jitter 200ms); Postgres tem retry transiente próprio (3 tentativas, 200ms + 200ms jitter) | ⚠️ parcial (Conexos só 2 tentativas, sem `shouldRetry` filtrado) | `ConexosClient.ts:353-359, 1108-1117`; `PostgreeDatabaseClient.ts:21-27` |
| Ignore Faulty Behavior | `getMnyTitPermutar` ignora HTTP 400 VALIDATION do Conexos (documentado, extrai do `responseData`) — controlado e local | ✅ presente | `ConexosClient.ts:840-857` |
| Degradation | Painel responde 200 com `items: []` quando não há snapshot (não 500); `dataBase`/`aging` undefined sem quebrar elegibilidade (GATED-P0-4) | ✅ presente | `PainelService.ts:48-55`; `ConexosClient.ts:690-696` |
| Reconfiguration | N/A — sem feature flag / circuit breaker no caminho da eleição | ❌ | — |

### Recover from Faults — Reintroduction

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | N/A | N/A | — |
| State Resynchronization | Job é idempotente por design — re-disparar recomputa o backlog do zero; painel lê o último `success` | ✅ presente | `EleicaoPermutasService.ts:38-46, 65-99`; `PermutaSnapshotRepository.ts:106-112` |
| Escalating Restart | N/A (1 processo Express) | N/A | — |
| Non-Stop Forwarding | N/A | N/A | — |

### Prevent Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | Ausente — não existe modo de drenar o serviço antes de uma deploy | ❌ | — |
| Transactions | **Ausente** no `persistRun` (ver Rollback). Loop de N INSERTs sem `BEGIN/COMMIT` | ❌ | `PermutaSnapshotRepository.ts:65-94` |
| Predictive Model | Ausente | ❌ | — |
| Exception Prevention | Zod nos boundaries previne strings cruas → ParseError no `com298RowSchema`/`declaracaoRowSchema`; `asyncHandler` evita unhandled rejection; `parseOptionalNumber` evita NaN | ✅ presente | `client/permutas/conexosPermutasSchemas.ts`; `http/asyncHandler.ts`; `ConexosClient.ts:1180-1184` |
| Increase Competence Set | `mapDeclaracaoDataBase` é plugável (mapper isolado para evolução de gates) — ⏸ GATED-P0-4 documentado | ✅ presente | `ConexosClient.ts:680-696` |

## 4. Findings (achados)

### F-availability-1: `MigrationRunner` é código órfão — primeiro `POST /permutas/eleicao` em prod estoura porque as tabelas `permuta_eleicao_run` e `permuta_candidata_snapshot` não existem

- **Severidade**: P0 (crítico — risco de incidente em primeira execução em qualquer ambiente novo)
- **Tactic violada**: Software Upgrade
- **Localização**: `src/backend/migrations/runMigrations.ts:19-55`; `src/backend/index.ts:1-87`; `src/backend/domain/appContainer.ts:17-45`; `src/backend/package.json` (scripts)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "MigrationRunner" /private/tmp/permutas-painel-wt/src/backend
  src/backend/migrations/runMigrations.ts:19:export default class MigrationRunner {
  # ← única ocorrência. Nada chama `new MigrationRunner(...)`, `container.resolve(MigrationRunner)`, nem `npm run migrate`.
  ```
  O `bootstrapAppContainer` (linha 35-42) só inicializa o pool, não roda migrations. `index.ts` não menciona migration. Não há script `migrate` em `package.json` (`scripts` listados: `dev`/`build`/`start`/`test`/`lint`/`typecheck`).
- **Impacto técnico**: a primeira chamada a `PermutaSnapshotRepository.persistRun` em qualquer ambiente novo (CI, dev, prod) falha com `relation "permuta_eleicao_run" does not exist`. O `try/catch` do orquestrador captura, **e o catch também tenta persistir uma row de erro** (`persistRun` linha 128-142) — então o catch também explode, gera um `throw` da camada de DB e o Express devolve 500 ao analista. Não há registro de auditoria do que aconteceu (a tabela não existe).
- **Impacto de negócio**: feature totalmente inutilizável até alguém rodar SQL à mão. Em SaaSo multi-tenant cada cliente novo precisará de intervenção manual no Postgres, contradiz o propósito de provisionamento automatizado.
- **Métrica de baseline**: 0 referências ao `MigrationRunner` fora da definição; 0 scripts `migrate` em `package.json`; 1ª migration do repo (não há precedente operacional).

### F-availability-2: `PermutaSnapshotRepository.persistRun` não é transacional — falha do pool entre o INSERT de cabeçalho e os N INSERTs de candidatas deixa snapshot parcial visível ao painel

- **Severidade**: P0 (crítico — viola a invariante "atomicidade" que o próprio código comenta em `EleicaoPermutasService.ts:45-46`)
- **Tactic violada**: Transactions, Rollback
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:65-94`; `src/backend/domain/client/database/PostgreeDatabaseClient.ts:90-105`
- **Evidência (objetiva)**:
  ```typescript
  // persistRun
  await this.databaseClient.insert(`INSERT INTO permuta_eleicao_run ...`, {...});
  for (const candidata of candidatas) {
      await this.insertCandidata(runId, candidata); // pool.query separado por candidata
  }
  ```
  `PostgreeDatabaseClient` não expõe `BEGIN/COMMIT`; cada `insert` é `pool.query(...)` independente. `grep "BEGIN\|COMMIT\|ROLLBACK\|withTransaction\|pool.connect" repository/permutas/* client/database/*` → 0 hits.

  O teste `PermutaSnapshotRepository.test.ts:56-77` valida `"atomicity, success"` mas só conta `db.insert.mock.calls` — o nome "atomicity" descreve a INTENÇÃO, não a IMPLEMENTAÇÃO (não há `BEGIN/COMMIT`).
- **Impacto técnico**: cenários reais que produzem snapshot parcial:
  1. Pool é resetado pelo handler `connectionPool.on('error', ...)` (PostgreeDatabaseClient.ts:54-56) entre INSERTs;
  2. Crash do processo Express durante o loop;
  3. Timeout do `connectionTimeoutMillis=5000` no meio da batelada;
  4. Erro em uma única candidata (ex.: Postgres rejeita por CHECK ou por estouro de TEXT) — sem rollback, as anteriores ficam gravadas.
  
  `findLatestSnapshot` retorna a run mais recente com `status='success'` (linha 107-110). Se o crash ocorrer ANTES de gravar o cabeçalho, ok (tudo perdido). Se ocorrer DEPOIS de gravar o cabeçalho mas durante os snapshot inserts, o cabeçalho fica como `success` (porque o orquestrador só insere o cabeçalho **depois** do loop terminar — `EleicaoPermutasService.ts:88-99`). **Mas o orquestrador insere primeiro o cabeçalho da run e depois faz `for candidata` — vou reler.**

  Releitura: em `EleicaoPermutasService.executar` (linha 99) e em `PermutaSnapshotRepository.persistRun` (linha 65 e 90-92), o cabeçalho é gravado PRIMEIRO, depois o loop de candidatas. Se o pool morrer entre os INSERTs, a run aparece como `success` com snapshot truncado — pior caso (analista vê painel parcial sem warning).
- **Impacto de negócio**: analista decide com base em snapshot incompleto (faltam candidatas elegíveis) → permutas elegíveis ficam paradas, aging cresce silenciosamente, e a feature deixa de cumprir o propósito de "produzir o backlog completo de pendências". Truncamento silencioso é exatamente o que o BUSINESS_WARN de `capHit` quis prevenir do lado Conexos — mas falta a mesma proteção do lado DB.
- **Métrica de baseline**: 0 ocorrências de `BEGIN/COMMIT` em `PermutaSnapshotRepository.ts` e `PostgreeDatabaseClient.ts`; 1 INSERT cabeçalho + N INSERTs separados por run (N pode chegar a `MAX_PAGES × PAGE_SIZE × |filiais| = 25k × |filiais|` no pior caso por filial).

### F-availability-3: `RetryExecutor` do `ConexosClient` configurado com `retries: 2` total e sem filtro `shouldRetry` — `ConexosError` por 4xx VALIDATION é retentado em vão e gasta budget

- **Severidade**: P1 (degrada disponibilidade efetiva — 2 tentativas total para um endpoint que historicamente retorna 5xx intermitente no Conexos, conforme comentários em ADR-0020/0021)
- **Tactic violada**: Retry
- **Localização**: `src/backend/domain/client/ConexosClient.ts:353-359`; `src/backend/domain/libs/executor/RetryExecutor.ts:24-71`
- **Evidência (objetiva)**:
  ```typescript
  // ConexosClient construtor
  this.retryExecutor = new RetryExecutor({
      retries: 2,        // ← loop é `counter <= retries` ⇒ 2 attempts TOTAIS, não 1+2
      delayMs: 500,
      shouldLog: true,
      jitterMs: 200,
      // shouldRetry: undefined ⇒ default é `() => true` (RetryExecutor.ts:27)
  });
  ```
  Comparativo: o `PostgreeDatabaseClient` declara `retries: 3` E `shouldRetry: (e) => this.isTransientConnectionError(e)` (PostgreeDatabaseClient.ts:21-27) — padrão correto que o Conexos não segue.
- **Impacto técnico**: (i) falhas 4xx (VALIDATION, 401/403) são retentadas como se fossem 5xx, atrasando o erro em 500ms+jitter sem ganho; (ii) `retries: 2` significa que se a 1ª chamada falha por 503 transitório e a 2ª também falha, a `paginate` aborta toda a filial — uma falha pequena tira o snapshot inteiro do ar.
- **Impacto de negócio**: a fan-out por filial multiplica o risco — com `|filiais| = N` e probabilidade `p` de falha transitória em ≥1 página, a probabilidade da run abortar inteira é `1 - (1 - p²)^N` aproximadamente. Com `p = 5%` e `N = 10` filiais, ~22% das runs abortam por causa de uma falha transitória do Conexos.
- **Métrica de baseline**: `retries: 2` (linha 354); `shouldRetry` ausente. Comparar com PostgreeDatabaseClient.ts:21-27 (`retries: 3` + `shouldRetry` filtrado).

### F-availability-4: `capHit` (truncamento por `MAX_PAGES=50`) marca a run como `status='success'` no painel — analista não distingue snapshot completo de snapshot truncado

- **Severidade**: P1 (alto — truncamento silencioso a partir de 25k linhas por filial, com falsa sinalização de sucesso)
- **Tactic violada**: Condition Monitoring, Sanity Checking
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:155-165, 86-99`; `src/backend/migrations/0001_permuta_eleicao.sql:14`
- **Evidência (objetiva)**:
  ```typescript
  // processFilial
  if (capHit) {
      await this.logService.warn({ type: LOG_TYPE.BUSINESS_WARN, ... });
  }
  // ... mais adiante (linha 86-99) ...
  const runInput: PermutaEleicaoRunInput = {
      ...
      status: 'success', // ← capHit NÃO promove para 'partial', apesar do schema aceitar
  };
  ```
  O schema da run JÁ tem `CHECK (status IN ('success', 'partial', 'error'))` (migration 0001 linha 14). O status `partial` existe no tipo `RunStatus` (PermutaSnapshotRepository.ts:10) mas **nunca é atribuído** em `EleicaoPermutasService`.
- **Impacto técnico**: o painel lê apenas runs `status='success'` (`PermutaSnapshotRepository.ts:107-110`). Uma run truncada vai para o painel indistinguível de uma run completa. O `BUSINESS_WARN` mora apenas no log — analista não tem visibilidade.
- **Impacto de negócio**: pior cenário em produção quando 1 filial grande ultrapassa 25k PROFORMAs adiantamento ativas. Decisão do analista é tomada sobre subconjunto não declarado dos dados. Como a feature é exatamente sobre "encontrar pendências esquecidas", esconder pendências é o anti-padrão central do produto.
- **Métrica de baseline**: cap = `MAX_PAGES × PAGE_SIZE` = `50 × 500` = **25.000 linhas/filial** (ConexosClient.ts:280, 289); 0 caminhos no orquestrador que atribuem `status='partial'`; `partial` declarado em `PermutaSnapshotRepository.ts:10` (tipo unused).

### F-availability-5: Pool Postgres `max: 1` + ausência de transação = qualquer overlap de runs concorrentes ou request paralelo derruba a outra

- **Severidade**: P1 (alto — `POST /permutas/eleicao` é manual, mas nada bloqueia 2 disparos simultâneos; e `/permutas/painel` compete pela mesma conexão)
- **Tactic violada**: Reconfiguration, Removal from Service
- **Localização**: `src/backend/domain/client/database/PostgreeDatabaseClient.ts:11`; `src/backend/routes/permutas.ts:24-50`
- **Evidência (objetiva)**:
  ```typescript
  // PostgreeDatabaseClient
  private readonly poolMaxConnections = 1;
  private readonly poolConnectionTimeoutMillis = 5000;
  ```
  Não existe lock (`pg_try_advisory_lock`) nem estado `running` na tabela de runs (apenas `success|partial|error` no CHECK). Duas chamadas concorrentes a `POST /permutas/eleicao` resultam em duas runs paralelas competindo por 1 conexão, com queue de `connectionTimeoutMillis=5000`.
- **Impacto técnico**: (i) durante uma run em curso (que faz vários INSERTs em loop), uma chamada paralela a `/permutas/painel` espera até 5s e pode falhar; (ii) duas runs disparadas em paralelo geram duas runs `success` no mesmo segundo — comportamento indefinido em quem ganha o `ORDER BY finished_at DESC LIMIT 1`; (iii) fan-out concorrente ao Conexos potencializa o cap-hit e session pool do ERP (já protegido por `heavyRouteLimiter` 10rpm em `index.ts:75` — mitigação parcial).
- **Impacto de negócio**: instabilidade durante o uso normal (analista clica "executar" + abre painel em paralelo → painel trava); na pior hipótese, snapshot do painel reflete uma run "perdida" em vez da última disparada conscientemente.
- **Métrica de baseline**: `poolMaxConnections = 1` (linha 11); rate-limit do `heavyRouteLimiter` = 10 req/min (rateLimit.ts:21); sem advisory lock no caminho.

### F-availability-6: `/health` é estático — não detecta perda do pool Postgres nem da sessão Conexos

- **Severidade**: P2 (médio — débito de observabilidade; operação descobre tarde)
- **Tactic violada**: Self-Test, Monitor
- **Localização**: `src/backend/index.ts:57`
- **Evidência (objetiva)**:
  ```typescript
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
  Não chama `PostgreeDatabaseClient.selectFirst('SELECT 1')` nem `legacy.ensureSid()`. Um pool com `connectionPool = undefined` (após `pool.on('error')` em PostgreeDatabaseClient.ts:54) ainda responde `/health` como `'ok'`.
- **Impacto técnico**: load balancer / orquestrador externo (ALB target group, ECS service health, etc.) não consegue tirar a instância do air quando o DB caiu. Tráfego continua sendo enviado a uma instância que vai 500.
- **Impacto de negócio**: MTTR aumenta — só detecta quando o analista clica e recebe erro.
- **Métrica de baseline**: `/health` faz 0 calls a dependências externas (linha 57 é puramente síncrona).

### F-availability-7: `appContainer.bootstrapAppContainer` engole falha de `PostgreeDatabaseClient.init()` apenas com `console.warn` — bootstrap "verdinha" segue com pool ausente

- **Severidade**: P2 (médio — degrada detect-faults; falha silenciosa só aparece no primeiro `query`)
- **Tactic violada**: Exception Detection, Fail-Fast
- **Localização**: `src/backend/domain/appContainer.ts:35-42`
- **Evidência (objetiva)**:
  ```typescript
  try {
      await container.resolve(PostgreeDatabaseClient).init();
  } catch (error) {
      console.warn(
          '[appContainer] PostgreeDatabaseClient.init() skipped:',
          error instanceof Error ? error.message : String(error),
      );
  }
  ```
  O comentário diz "Best-effort: o skeleton pode rodar sem DB (rotas Conexos puras), então não derruba o bootstrap." Esse contrato deixou de valer com a Fatia 1 — Permutas EXIGE Postgres.
- **Impacto técnico**: a primeira requisição que toca o DB recebe um `Error('Database connection pool not initialized')` (PostgreeDatabaseClient.ts:92). Em prod, isso volta como HTTP 500 genérico (errorMiddleware mascara) e o operador não tem trace claro de "DB nunca foi conectado".
- **Impacto de negócio**: descoberta tardia de credenciais erradas / DB indisponível na hora do deploy; potencial para deploy "verde" que está quebrado para o caminho Permutas.
- **Métrica de baseline**: 1 `console.warn` sem `LogService` estruturado; `bootstrapped = true` é setado mesmo após init falhar (linha 44).

## 5. Cards Kanban

### [availability-1] Wirear o MigrationRunner no boot do Express (ou expor `npm run migrate`) e bloquear deploy sem migration aplicada

- **Problema**
  > `MigrationRunner` em `migrations/runMigrations.ts` está implementado e testado, porém **nenhum código o invoca**. A primeira chamada a `POST /permutas/eleicao` em qualquer ambiente novo falha com `relation "permuta_eleicao_run" does not exist`, e o caminho de catch tenta gravar `status='error'` na mesma tabela inexistente — o operador recebe 500 sem auditoria.

- **Melhoria Proposta**
  > Software Upgrade tactic. Adicionar `await container.resolve(MigrationRunner).run()` em `bootstrapAppContainer` (logo após `PostgreeDatabaseClient.init()`), com falha **propagando para o caller** (não swallow). Em paralelo, expor `npm run migrate` em `package.json` para CI/CD aplicar migrations antes do deploy. Arquivos: `domain/appContainer.ts:35-44`, `package.json` (scripts), `migrations/runMigrations.ts` (sem mudança).

- **Resultado Esperado**
  > Em todo bootstrap, `schema_migrations` é populado e `permuta_eleicao_run`/`permuta_candidata_snapshot` existem antes do primeiro request. Métrica: `# referências ao MigrationRunner fora de sua definição`: **0 → ≥2** (boot + script CI); cold-start endpoint `/permutas/eleicao` em ambiente novo: **falha imediata → sucesso**.

- **Tactic alvo**: Software Upgrade
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-1
- **Métricas de sucesso**:
  - Cobertura de invocação: 0 → ≥2 chamadas (bootstrap + CI script)
  - Cold-start em ambiente novo sem rodar SQL manual: quebra → sucesso
- **Risco de não fazer**: feature inutilizável em produção em D+0 do primeiro deploy. Custo operacional permanente (DBA precisa rodar SQL à mão por tenant em SaaSo multi-tenant).
- **Dependências**: nenhuma (MigrationRunner já existe).

### [availability-2] Envolver `PermutaSnapshotRepository.persistRun` em transação atômica (BEGIN/COMMIT)

- **Problema**
  > O comentário em `EleicaoPermutasService.ts:45-46` declara "Atomicidade: abort → 0 snapshot rows" mas a implementação não é transacional. `persistRun` faz 1 INSERT cabeçalho + N INSERTs em loop, cada um via `pool.query` independente. Uma falha de pool no meio do loop deixa cabeçalho `status='success'` com snapshot truncado, que vira o "último snapshot bom" que o painel exibe.

- **Melhoria Proposta**
  > Transactions tactic. Estender `PostgreeDatabaseClient` com `withTransaction(fn)` que pega um `client` do pool, faz `BEGIN`/`COMMIT`/`ROLLBACK` no try/catch/finally + `client.release()`. Refatorar `PermutaSnapshotRepository.persistRun` para usar `withTransaction` envolvendo o INSERT do cabeçalho e o loop de candidatas. Sub-task: ampliar o teste `"atomicity, success"` para mockar uma falha no N-ésimo insert e assertar que **nenhuma** linha foi gravada (incluindo o cabeçalho).

- **Resultado Esperado**
  > Falha em qualquer INSERT durante a persistência reverte todas as gravações dessa run. Painel nunca vê snapshot parcial marcado como `success`. Métrica: ocorrências de `BEGIN/COMMIT` em `PermutaSnapshotRepository.ts`: **0 → 1**; testes cobrindo rollback parcial: **0 → 1**.

- **Tactic alvo**: Transactions, Rollback
- **Severidade**: P0
- **Esforço estimado**: M (2–5d) — inclui ampliar API do `PostgreeDatabaseClient` e revisitar testes
- **Findings relacionados**: F-availability-2
- **Métricas de sucesso**:
  - `BEGIN/COMMIT` em `PermutaSnapshotRepository`: 0 → 1
  - Caso de teste de rollback parcial coberto: 0 → 1
  - % runs `status='success'` com `total_candidatas != count(snapshot rows)`: alvo 0%
- **Risco de não fazer**: analista decide com snapshot mutilado, pendências reais ficam invisíveis, propósito da feature é quebrado silenciosamente. Multi-tenant amplifica.
- **Dependências**: pool `max=1` (card availability-5) — quando usar `client = pool.connect()`, transação não compete com outras queries pela única conexão.

### [availability-3] Promover run truncada por `capHit` para `status='partial'` e expor flag no `PainelResponse`

- **Problema**
  > Quando `paginate` atinge `MAX_PAGES=50` (cap em 25k linhas por filial), `EleicaoPermutasService` emite um `BUSINESS_WARN` mas grava a run como `status='success'`. O painel lê apenas runs success e não distingue snapshot completo de truncado. O tipo `RunStatus = 'success' | 'partial' | 'error'` já existe — só não é usado.

- **Melhoria Proposta**
  > Condition Monitoring tactic. Acumular flag `capHit` no escopo do `executar` (ao longo de `processFilial`) e, ao montar o `runInput`, gravar `status: capHit ? 'partial' : 'success'`. Em `PainelService`, incluir `truncated: boolean` em `PainelResponse` derivado de `run.status === 'partial'`. Atualizar `findLatestSnapshot` para aceitar `status IN ('success', 'partial')` (ainda priorizando o mais recente). Frontend deve exibir banner amarelo "snapshot truncado em N filiais".

- **Resultado Esperado**
  > Truncamento é visível no painel. Métrica: % runs `partial` em prod (a instrumentar) reportadas vs. ocultas: **100% ocultas → 100% sinalizadas**.

- **Tactic alvo**: Condition Monitoring, Sanity Checking
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) — backend; frontend é fora do escopo deste run
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - Caminhos no orquestrador que atribuem `status='partial'`: 0 → 1
  - `PainelResponse` expõe `truncated`/`partialFiliais`: ausente → presente
- **Risco de não fazer**: feature de "encontrar pendências esquecidas" esconde justamente as pendências em tenants grandes — anti-padrão central do produto.
- **Dependências**: nenhuma.

### [availability-4] Ajustar `RetryExecutor` do `ConexosClient` para 3 tentativas + `shouldRetry` filtrando 4xx VALIDATION e erros não-transientes

- **Problema**
  > O retry do Conexos está configurado com `retries: 2` (loop `counter <= retries` → apenas 2 tentativas totais) e sem `shouldRetry`, então retenta **toda** exceção — inclusive 4xx VALIDATION e erros lógicos como `ConexosError`. Resultado: budget gasto à toa em falhas determinísticas e budget insuficiente para falhas transitórias reais (p=5% × 2 tentativas × |filiais|=10 → ~22% de runs abortando inteiras).

- **Melhoria Proposta**
  > Retry tactic. Subir para `retries: 3` (3 tentativas totais, mantendo o jitter de 200ms) e adicionar `shouldRetry: (err) => isTransientHttpError(err)` que retorna `false` para HTTP 4xx (≠ 429), `ConexosError` por VALIDATION, e `true` para 5xx / `ECONNRESET` / timeout. Espelhar o padrão já usado por `PostgreeDatabaseClient` (PostgreeDatabaseClient.ts:21-27). Centralizar `isTransientHttpError` em `libs/executor/retryPolicies.ts` para reuso.

- **Resultado Esperado**
  > Probabilidade de uma run abortar por causa de 1 falha transitória passageira cai significativamente; 4xx retornam imediatamente (sem desperdiçar 500ms+jitter). Métrica: `retries` Conexos 2 → 3; presença de `shouldRetry`: ausente → presente.

- **Tactic alvo**: Retry
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - `retries` em `ConexosClient` constructor: 2 → 3
  - `shouldRetry` definido: 0 → 1
  - Latência em caminhos 4xx (não retentados): -500ms a -700ms por chamada determinística
- **Risco de não fazer**: instabilidade percebida pelo analista (rodar 3× para o snapshot completar); custo amplificado em tenants com muitas filiais.
- **Dependências**: nenhuma.

### [availability-5] Adicionar advisory lock `pg_try_advisory_lock` no início de `POST /permutas/eleicao` para evitar runs concorrentes

- **Problema**
  > `POST /permutas/eleicao` é manual e sem proteção contra duplo-disparo. Pool Postgres `max=1` + ausência de lock + leitura "última run success" pelo painel ⇒ duas runs paralelas geram comportamento indefinido (quem ganha `ORDER BY finished_at DESC LIMIT 1`?) e competem pela única conexão, podendo derrubar o `/permutas/painel` em paralelo.

- **Melhoria Proposta**
  > Reconfiguration + Removal from Service tactic. Antes de `executar`, tentar `SELECT pg_try_advisory_lock(<hash do tenant>)`; se `false`, devolver HTTP 409 `{ error: 'eleicao em andamento' }`. Liberar com `pg_advisory_unlock` no `finally`. Em paralelo, subir `poolMaxConnections` para `≥ 3` (pool atual de 1 conexão obriga `/painel` a esperar 5s pelo `connectionTimeoutMillis` quando a run roda).

- **Resultado Esperado**
  > Disparo paralelo retorna 409 imediato em vez de gerar runs fantasma. Painel responde em ms mesmo durante run em curso. Métrica: pool max 1 → ≥3; status do lock em log da run: ausente → presente.

- **Tactic alvo**: Reconfiguration, Removal from Service
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) para o advisory lock; M para reavaliar pool size com base em workload
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - Duplo disparo bloqueado com HTTP 409: 0 → 1 (validar em teste)
  - `poolMaxConnections`: 1 → ≥3
- **Risco de não fazer**: instabilidade durante uso normal (analista clica executar + painel paralelo trava); runs fantasma mascaram o snapshot escolhido.
- **Dependências**: card availability-2 (uso de transações com `client.connect()` exige pool > 1 em workload concorrente).

### [availability-6] Implementar `/health` semântico que pinga Postgres e (opcionalmente) sessão Conexos

- **Problema**
  > `/health` retorna `status: 'ok'` independentemente do estado do pool DB ou da sessão Conexos. O handler `connectionPool.on('error')` em `PostgreeDatabaseClient.ts:54` zera `connectionPool = undefined` em runtime, mas o `/health` continua respondendo OK até a próxima requisição "real" descobrir o problema.

- **Melhoria Proposta**
  > Self-Test tactic. `/health` chama `await db.selectFirst('SELECT 1')` (com timeout curto, ex.: 1s) e marca `db: 'ok'|'down'`. Tornar a sessão Conexos opcional (`ensureSid` com timeout configurável) para evitar acoplar o liveness probe a um sistema externo. Resposta agregada: HTTP 200 com `db:'ok'` ⇒ usa para readiness; HTTP 503 com `db:'down'` ⇒ load balancer drena.

- **Resultado Esperado**
  > LB / orquestrador detecta perda de DB em ≤ N segundos e tira a instância do air. Métrica: dependências testadas pelo `/health`: 0 → 1 (Postgres).

- **Tactic alvo**: Self-Test, Monitor
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - Endpoint `/health` chama dependência externa: 0 → 1
  - Probabilidade de tráfego cair em instância com DB perdido (qualitativa): alta → baixa
- **Risco de não fazer**: MTTR depende do analista relatar; degradação silenciosa.
- **Dependências**: nenhuma.

### [availability-7] Trocar `console.warn` por erro propagado em `appContainer.bootstrapAppContainer` quando `PostgreeDatabaseClient.init` falhar

- **Problema**
  > O bootstrap engole falha de `init()` com `console.warn`. O contrato "best-effort: skeleton pode rodar sem DB" valia antes da Fatia 1; agora Permutas exige Postgres. Deploy pode subir "verde" e quebrar no primeiro request.

- **Melhoria Proposta**
  > Exception Detection tactic. Remover o `try/catch` ao redor de `PostgreeDatabaseClient.init()` (deixar propagar) ou — se quisermos manter rotas que não dependem do DB — registrar um log estruturado via `LogService` com `LOG_TYPE.SYSTEM_ERROR` e marcar `bootstrapped` como `false` para tentar novamente no próximo request. Preferir propagar: melhor falhar o deploy do que aceitar um estado degradado silencioso.

- **Resultado Esperado**
  > Falha de DB no bootstrap derruba o processo imediatamente em vez de virar 500 difuso em runtime. Métrica: `console.warn` no bootstrap → `LogService.error` ou throw propagado.

- **Tactic alvo**: Exception Detection
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-7
- **Métricas de sucesso**:
  - `console.warn` no caminho de bootstrap DB: 1 → 0
  - Tempo entre deploy quebrado e detecção: minutos → segundos
- **Risco de não fazer**: deploy verde com DB quebrado, descoberta tardia.
- **Dependências**: card availability-1 (depois de wirear migrations, fail-fast é trivial).

## 6. Notas do agente

- Escopo respeitado: somente o delta de Permutas Frente I Fatia 1; não revi flujos Express puro fora desse caminho.
- Não rodei coverage/audit (`--quick`); todas as métricas são estruturais (`grep`/leitura). Métricas dinâmicas (MTTR real, % capHit, latência fan-out, p50/p99 de runs) ficaram como "não medível neste run" — recomendado instrumentar via FLOW_COMPLETE.durationMs (já presente no log) + agregação periódica de `permuta_eleicao_run.status`.
- Cross-QA: o pool `max=1` e a ausência de transação encostam em **Performance** (card availability-5 sobre pool size é compartilhado), e a ausência de advisory lock encosta em **Fault-Tolerance** (concorrência de runs). Sinalizo ao consolidator para não duplicar cards.
- Card `availability-2` (transação) depende parcialmente do `availability-5` (pool > 1) — anotei em "Dependências" para a ordem ficar explícita.
- O finding sobre `MigrationRunner` órfão (F-availability-1) é o achado mais consequente do run inteiro deste QA: P0 com baseline numérico irrefutável (0 referências fora da definição).
