---
qa: Testability
qa_slug: testability
run_id: 2026-06-18-2039
agent: qa-testability
generated_at: 2026-06-18T20:39:00Z
scope: backend
score: 7.5
findings_count: 8
cards_count: 7
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/QA durante PR de Permutas Fase B | Mudança em qualquer regra de ingestão (compute → UPSERT → casamento auto → sweep stale) ou na ação do analista (`POST /permutas/adiantamentos/:docCod/processar`) | `IngestaoPermutasService`, `PermutaRelationalRepository`, `PermutaProcessamentoRepository`, `GestaoPermutasService`, `routes/permutas.ts`, `jobs/ingest-permutas.ts`, `migrations/0003-0004*.sql` | Pre-merge (gates locais), CI (jest --coverage), pré-deploy Render | Testes de unidade verdes em < 30s; falha do compute → ROLLBACK observável; advisory-lock-busy lança erro tipado; ações HTTP autenticadas auditam `triggeredBy` | 88 testes Permutas verdes; cobertura `domain/service` ≥ 88 lines / 60 branches (floor jest.config.cjs); 0 testes integrados sobre as migrations 0003/0004; 0 testes sobre `jobs/ingest-permutas.ts`; 4 sources com `new Date()` direto fora de controle do teste |

> Bass: o pipeline Permutas Fase B já paga a maior parte do imposto de testabilidade no nível de unidade (DB-mock via `TransactionClient` injetado), mas dois acoplamentos críticos (job entrypoint + SQL real das migrations) seguem em modo "confio no deploy". O custo de regressão silenciosa nesses dois pontos é alto porque o caminho de execução em produção (cron + Render `npm run migrate`) não tem nenhum gate antes do tráfego.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| **Cobertura por camada — test-file ratio (Permutas Fase B)** | service/ + repository/permutas: 11 `.test.ts` / 11 `.ts` source = **1.00** | ≥ 0.5 | ✅ | `find src/backend/domain/{service,repository}/permutas -name '*.ts' …` |
| Cobertura por camada — `jobs/` | 0 `.test.ts` / 1 `.ts` source = **0.00** | ≥ 0.5 (smoke test do entrypoint) | ❌ | `ls src/backend/jobs/` (sem `.test.*`) |
| Cobertura por camada — `migrations/*.sql` | 0 testes integrados / 4 SQL migrations | ≥ 1 teste integrado por DDL não-trivial (0003 tem 5 tabelas + UPSERT semantics) | ❌ | `jest.config.cjs:7` ignora `*.integration.test.ts`; nenhum existe |
| Cobertura por camada — `routes/permutas.ts` | 1 `.test.ts` / 1 `.ts` source = **1.00** | ≥ 0.5 | ✅ | `src/backend/routes/` |
| `coverageThreshold` enforcement (CI) | global: lines 72 / branches 54 / functions 78; `./domain/service/`: lines 88 / branches 60 | ≥ 80 / 70 / 80 em `domain/service/` | ⚠️ | `src/backend/jest.config.cjs:34-44` + `.github/workflows/ci.yml:27` |
| Repository — public methods cobertos por `describe`/`it` | 11 / 11 em `PermutaRelationalRepository` (cada método público com ≥1 caso); 5 / 5 em `PermutaProcessamentoRepository` | 100% | ✅ | grep `public ` em `*Repository.ts` × `describe` em `*.test.ts` |
| Service — public methods cobertos | 1 / 1 (`IngestaoPermutasService.executar`); 1 / 1 (`GestaoPermutasService.exporGestao`); `VariacaoCambialPermutaService.calcular` 4 casos cobrindo as 3 classificações + dataBase | 100% | ✅ | grep `public ` × `it()` |
| Controllability — testes que constroem service com mock injetado (estilo DDD/CLAUDE.md) vs `container.resolve` de service real | service/repository tests: 0 `container.resolve`; route tests: 0 `container.resolve` (apenas `container.registerInstance` com stubs) | 100% constructor-injection ou registerInstance(stub) | ✅ | grep `container.resolve\|container.registerInstance` em `*.test.ts` da fatia |
| Determinism — `new Date()` direto em fontes (não testes) na fatia | 7 ocorrências (`IngestaoPermutasService` ×4, `GestaoPermutasService` ×1, `EleicaoPermutasService` ×2, `AgingService` ×1 com default param injetável, `PermutaProcessamentoRepository` ×1) | 0 — passar via clock injetável (`ClockProvider`) ou param explícito | ❌ | grep `new Date()` em `src/backend/domain/service/permutas/ + repository/permutas/` |
| Determinism — `randomUUID` direto em fontes | 3 (`EleicaoPermutasService`, `PermutaRelationalRepository`, `PermutaSnapshotRepository`) | 0 — `IdProvider` injetável | ⚠️ | grep `randomUUID` |
| Network/HTTP em testes unit | route tests usam `fetch` contra loopback (porta 0, mock services) — não é HTTP real externo, mas exige boot de Express por caso | 0 sockets em pure-unit | ⚠️ | `routes/permutas.test.ts:78,98,132,154,182,206,234,253` |
| Test file size (top da fatia) | 652 LOC `EleicaoPermutasService.test.ts`; 272 `PermutaRelationalRepository.test.ts`; 261 `routes/permutas.test.ts`; 224 `IngestaoPermutasService.test.ts` | ≤ 500 LOC por arquivo | ⚠️ | `wc -l` |
| Integration test files (`describe('integration: …')`) na fatia | 0 | ≥ 1 para `PermutaRelationalRepository` (UPSERT + ON CONFLICT + advisory lock + ROLLBACK semântico) | ❌ | grep `describe.*integration:` |
| Branch coverage do happy path da ingestão | happy / advisory-lock-busy / compute-fail+rollback = 3 / 3 cobertos no service+repo | 100% | ✅ | `IngestaoPermutasService.test.ts:140-223` + `PermutaRelationalRepository.test.ts:98-110` |
| Testes assertam que erros são logados | `IngestaoPermutasService.test.ts:222` valida `calls.some(...)`; route tests não asseguram log em 401/422 | service: ✅ / routes: ⚠️ | ⚠️ | `IngestaoPermutasService.test.ts:222`; `routes/permutas.test.ts` (sem assert em logService) |
| CI bloqueia merge em falha de teste | sim (`npm test -- --coverage` em PR + push) | ✅ | ✅ | `.github/workflows/ci.yml:27,46` |

> ⚠️ **Não medível em quick mode**: cobertura de linhas/branches por arquivo (coverage report). Requer `npm test -- --coverage` (não rodado por `--quick`). O `coverageThreshold` no jest.config dá o piso defendido; o valor exato dos novos arquivos da Fase B só é confirmável fora do `--quick`.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | `TransactionClient` e `PostgreeDatabaseClient` expõem `insert/update/selectMany/selectFirst/withTransaction/withAdvisoryLock` exatamente para ser mockáveis em `jest.Mocked<…>`. Tests da fatia montam `buildTx()` + `buildDb()` em todas as suites de repository/service. | ✅ presente | `PermutaRelationalRepository.test.ts:12-30`; `IngestaoPermutasService.test.ts:107-133` |
| Recordable Test Cases | Nenhum fixture gravado de Conexos/Postgres na fatia. `EleicaoPermutasService.computeCandidatas` é mockado a cada teste; não há `__fixtures__/` de respostas reais para reusar entre suites. | ⚠️ parcial | grep `__fixtures__` em `src/backend/domain/service/permutas/`: vazio |
| Sandbox | Sem docker-compose de Postgres de teste; `jest.config.cjs:7` exclui `*.integration.test.ts` (jamais executados em CI). O entrypoint do job (`jobs/ingest-permutas.ts:32-40`) chama `bootstrapAppContainer` real — não há sandbox que rode o cron localmente sem dependências externas. | ❌ ausente | `jest.config.cjs:7`; `scripts/` sem `docker-compose.test.yml` |
| Executable Assertions | Asserts explícitos sobre forma do SQL (`expect(sql).toContain('ON CONFLICT (doc_cod) DO UPDATE')`, `expect(sql).not.toMatch(/'\s*\+\|\$\{/)`) defendem Inviolable Rule #5 dentro da unit. Não há precondições/postcondições em runtime (Zod só nos boundaries HTTP). | ✅ presente | `PermutaRelationalRepository.test.ts:91-93,122-123,210-213` |
| Abstract Data Sources | DI tsyringe + tipagem `TransactionClient` permite trocar pool real por mock sem mudar o service. `routes/permutas.test.ts` aproveita `container.registerInstance` para isolar a borda HTTP da camada de domínio. | ✅ presente | `IngestaoPermutasService.test.ts:115-133`; `routes/permutas.test.ts:74,128,178,200` |
| Limit Structural Complexity | Repositórios da Fase B respeitam separação service↔repo↔client. Mas `IngestaoPermutasService.executar` mistura compute, mapeamento (3 helpers `to*Row`), orquestração transacional, snapshot back-compat e logging num único método de 120 LOC — o teste cobre, mas o mock setup precisa de 4 colaboradores. | ⚠️ parcial | `IngestaoPermutasService.ts:64-184` (120 LOC, 4 deps) |
| Limit Non-Determinism | `new Date()` é chamado direto 4× em `IngestaoPermutasService` (startedAt + 3 finishedAt) e 1× em `GestaoPermutasService.exporGestao` (`geradoEm`). `randomUUID()` é chamado direto em 3 repositories/services. Sem clock/id provider injetável: testes que quisessem afirmar igualdade de timestamp (ex: snapshot do header de erro) precisam de `expect.any(Date)` ou normalização. | ❌ ausente | `IngestaoPermutasService.ts:66,82,120,163`; `GestaoPermutasService.ts:73`; `PermutaRelationalRepository.ts:1,116` |

## 4. Findings (achados)

### F-testability-1: Job entrypoint `jobs/ingest-permutas.ts` não tem teste

- **Severidade**: P1 (alto — caminho de execução em produção sem nenhum gate de teste)
- **Tactic violada**: Specialized Interfaces / Abstract Data Sources
- **Localização**: `src/backend/jobs/ingest-permutas.ts:1-41`
- **Evidência (objetiva)**:
  ```
  $ ls src/backend/jobs/*.test.*
  zsh: no matches found
  ```
  O entrypoint chama `bootstrapAppContainer()` real, depois `container.resolve(IngestaoPermutasService)`, e termina o processo com `process.exit(0|1)`. Não há separação entre `main()` (testável) e o `process.exit` (não-testável). A pessoa que mexer no log line, no exit code, ou no `triggeredBy: 'cron'` constante não recebe nenhum sinal verde/vermelho.
- **Impacto técnico**: regressão silenciosa no entrypoint (ex: trocar `triggeredBy: 'cron'` por outro literal, esquecer de `await`, retorno errado) só é detectada quando o cron já estiver no ar — e mesmo assim, só se alguém ler logs.
- **Impacto de negócio**: o cron é o único acionador da ingestão diária em produção; uma falha de entrypoint significa fatos last-good congelando, tela `/gestao` ficando defasada, analista decidindo permuta com dado velho.
- **Métrica de baseline**: 0 testes / 1 arquivo de job = ratio 0.00 (alvo ≥ 0.5).

### F-testability-2: Migrations SQL 0003/0004 sem teste integrado

- **Severidade**: P1 (alto — DDL não-trivial executada em produção sem gate)
- **Tactic violada**: Sandbox / Executable Assertions
- **Localização**: `src/backend/migrations/0003_permuta_relational.sql`, `src/backend/migrations/0004_permuta_processamento.sql`, `.github/workflows/ci.yml:96-100`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "describe.*integration:" src/backend --include="*.test.ts"
  (vazio)
  $ grep testPathIgnorePatterns src/backend/jest.config.cjs
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  ```
  As migrations definem (a) UPSERT semantics que o repository assume (`ON CONFLICT (doc_cod) DO UPDATE`), (b) `CHECK (status IN (…))`/`CHECK (kind IN (…))`, (c) índices `idx_*_status`, (d) `ALTER TABLE … ADD COLUMN IF NOT EXISTS kind` retroativo. Toda a verdade SQL é testada apenas em produção pelo passo `npm run migrate` do CI (`ci.yml:96-100`) — que aplica e deploya, não verifica.
- **Impacto técnico**: uma migration quebrada (ex: `CHECK` rejeitando status que o código grava, ou index ausente) bloqueia o deploy em produção em vez de em PR; rollback de schema é manual.
- **Impacto de negócio**: deploy bloqueado = janela de manutenção; rollback de DDL aplicado = risco de perda de processamento manual do analista (PK `adiantamento_doc_cod` da `permuta_processamento`).
- **Métrica de baseline**: 0 testes integrados / 4 SQL migrations (alvo: ≥ 1 por DDL não-trivial = 2).

### F-testability-3: Não-determinismo de tempo (`new Date()`) em 5 sites na fatia

- **Severidade**: P1 (alto — afeta defensividade de assertions sobre auditoria/logs)
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `IngestaoPermutasService.ts:66,82,120,163`; `GestaoPermutasService.ts:73`; `PermutaProcessamentoRepository.ts:35`
- **Evidência (objetiva)**:
  ```
  IngestaoPermutasService.ts:66:        const startedAt = new Date();
  IngestaoPermutasService.ts:82:                finishedAt: new Date(),
  IngestaoPermutasService.ts:120:                finishedAt: new Date(),
  IngestaoPermutasService.ts:163:                    finishedAt: new Date(),
  GestaoPermutasService.ts:73:            geradoEm: new Date().toISOString(),
  PermutaProcessamentoRepository.ts:35: … new Date().toISOString() : null;
  ```
  Os testes contornam afirmando apenas `typeof res.geradoEm === 'string'` e `expect(params.processadoEm).not.toBeNull()` — perdem precisão sobre o conteúdo. Para auditoria O6 (`triggeredBy` + `processadoEm`), qualquer regressão no carimbo (ex: gravar `Date.now()` em vez de ISO) passa em verde.
- **Impacto técnico**: bug em formato/timezone só é pego em produção; impossível asserir invariante "`processadoEm` é exatamente o instante do request" sem `jest.useFakeTimers` global (que esses testes não usam).
- **Impacto de negócio**: divergência de carimbo de auditoria em ingestão x analista quebra a reconciliação entre `permuta_eleicao_run.finished_at` e `permuta_processamento.processado_em`.
- **Métrica de baseline**: 7 `new Date()` em sources não-test da fatia (alvo: 0 — todos via `ClockProvider`).

### F-testability-4: Não-determinismo de id (`randomUUID`) sem provider injetável

- **Severidade**: P2 (médio — débito técnico que aparece quando precisar afirmar o id gerado)
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `PermutaRelationalRepository.ts:1,116`; `PermutaSnapshotRepository.ts:1,79`; `EleicaoPermutasService.ts:1,200`
- **Evidência (objetiva)**: `randomUUID()` é chamado direto; testes precisam de `expect(typeof runId).toBe('string')` (PermutaRelationalRepository.test.ts:86) em vez de comparar com um valor conhecido.
- **Impacto técnico**: cada teste que envolve `runId` precisa "ler" o que foi gerado e propagar — barulho que multiplica conforme o fluxo cresce (já visível no `persistIngestRun(_, _, write)` callback).
- **Impacto de negócio**: nenhum imediato; risco de drift caso `runId` precise virar determinístico por tenant (ex: idempotência cross-execução).
- **Métrica de baseline**: 3 sources usando `randomUUID()` direto (alvo: 0 — via `IdProvider`).

### F-testability-5: Suite `EleicaoPermutasService.test.ts` com 652 LOC sinaliza service inchado

- **Severidade**: P2 (médio — afeta velocidade de manutenção, não correção)
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.test.ts` (652 LOC); `IngestaoPermutasService.test.ts` (224 LOC) reusa o mesmo compute.
- **Evidência (objetiva)**: `wc -l` (ver §2). Top-4 da fatia ultrapassam o teto recomendado de 500.
- **Impacto técnico**: arquivos de teste densos atrasam a leitura de quem diagnostica regressão; a "duplicação de fixture" entre `EleicaoPermutasService.test.ts` e `IngestaoPermutasService.test.ts` (mesmo `PermutaCandidata`) é convite a drift.
- **Impacto de negócio**: marginal — atinge produtividade, não corretude.
- **Métrica de baseline**: 4 arquivos > 200 LOC na fatia; 1 arquivo > 600 LOC (alvo: ≤ 500 LOC/arquivo, fixtures em helper compartilhado).

### F-testability-6: `coverageThreshold` em `./domain/service/` (lines 88 / branches 60) abaixo do alvo Bass para hot path financeiro

- **Severidade**: P2 (médio — CI passa, mas defende um piso histórico, não um alvo)
- **Tactic violada**: Executable Assertions / Specialized Interfaces (gate enforcement)
- **Localização**: `src/backend/jest.config.cjs:34-44`
- **Evidência (objetiva)**:
  ```
  global:    { lines: 72, branches: 54, functions: 78 }
  service/:  { lines: 88, branches: 60 }
  ```
  Os comentários no arquivo declaram explicitamente que o piso é calibrado "just below current". 60% de branches num service que decide auto-casamento (1:1, classifica JUROS/DESCONTO, marca stale) deixa ~40% de ramos não auditáveis pelo gate.
- **Impacto técnico**: regressão de cobertura branch (ex: alguém apaga o `if (!c.invoiceCasada)` em `toCasamentoRows`) não trip o CI até derrubar até abaixo de 60%.
- **Impacto de negócio**: caminho de erro (compute fail / advisory lock busy) deixar de ser coberto sem ninguém perceber até o próximo incidente.
- **Métrica de baseline**: branches floor 60 em `domain/service/` (alvo Bass: ≥ 70 para hot path; ≥ 80 para `service/permutas/`).

### F-testability-7: Route tests sobem Express real por caso, sem reaproveitamento

- **Severidade**: P2 (médio — flake risk + tempo de execução em CI)
- **Tactic violada**: Limit Non-Determinism / Limit Structural Complexity
- **Localização**: `src/backend/routes/permutas.test.ts:47-56` (`listen` cria server em porta 0 por `it`)
- **Evidência (objetiva)**: cada `it()` faz `await listen(buildApp(...))` + `await server.close()`. 7 cenários × `app.listen(0)` = 7 binds de socket loopback. Em CI compartilhado (GitHub-hosted runner), porta 0 + close assíncrono pode interagir com retentativas. Os testes funcionam, mas o padrão é caro frente a um supertest (`supertest(app)`) sem socket.
- **Impacto técnico**: 7 abrir/fechar por arquivo; ao escalar para os novos endpoints SISPAG/GED a soma fica perceptível; nenhum teste afirma audit-log do `triggeredBy` no path de erro 401.
- **Impacto de negócio**: tempo de CI cresce linearmente com novas rotas; flakiness eventual em runners lentos.
- **Métrica de baseline**: 7 binds de socket em `routes/permutas.test.ts` (alvo: 0 — usar `supertest(app)` direto).

### F-testability-8: Sem assert de log no path de erro 401 das rotas

- **Severidade**: P3 (baixo — observabilidade fina, mas alinhada com auditoria O6)
- **Tactic violada**: Executable Assertions
- **Localização**: `routes/permutas.test.ts:95-103,250-260`
- **Evidência (objetiva)**: os casos de 401 só asserem `expect(res.status).toBe(401)`. Não verificam se `logService.warn`/`error` foi chamado — então uma regressão que silenciasse o log de auditoria de tentativa não-autenticada passa verde.
- **Impacto técnico**: auditoria de tentativa de processar adiantamento sem auth pode regredir silenciosamente.
- **Impacto de negócio**: postura de auditoria fica menor do que a documentada na ontologia (O6).
- **Métrica de baseline**: 0/2 casos 401 com assert de log (alvo: 2/2).

## 5. Cards Kanban

### [testability-1] Adicionar teste de unidade para `jobs/ingest-permutas.ts`

- **Problema**
  > O entrypoint do cron diário (`jobs/ingest-permutas.ts`) é o único caminho de ingestão em produção e não tem nenhum teste. Mudanças no `triggeredBy: 'cron'`, no log line, ou no `process.exit` só são detectadas via observação de logs.

- **Melhoria Proposta**
  > Extrair `main()` para função exportada (sem `process.exit`) e testar com `IngestaoPermutasService` mockado via `container.registerInstance` (mesmo padrão de `routes/permutas.test.ts`). Validar: (a) chama `executar({ triggeredBy: 'cron' })`; (b) loga `[ingest-permutas] run …` com os totais; (c) re-lança erro do service (deixa o wrapper decidir o exit code). Tactic Bass alvo: **Specialized Interfaces**.

- **Resultado Esperado**
  > `jobs/ingest-permutas.test.ts` com ≥ 3 casos (happy / compute fail / advisory-lock-busy). Test ratio `jobs/`: **0.00 → 1.00**.

- **Tactic alvo**: Specialized Interfaces
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Testes em `jobs/`: 0 → ≥ 3
  - Test-file ratio `jobs/`: 0.00 → 1.00
- **Risco de não fazer**: regressão no cron daily só descoberta via fatos relacionais defasados; analista decide permuta com snapshot velho.
- **Dependências**: nenhuma.

### [testability-2] Suite de integração SQL para `PermutaRelationalRepository` (Postgres efêmero)

- **Problema**
  > As migrations 0003/0004 só são exercidas em produção via `npm run migrate` do CI. UPSERT semantics, `ON CONFLICT (doc_cod) DO UPDATE`, `CHECK (kind IN ('eleicao','ingest'))`, advisory lock e ROLLBACK do `withTransaction` são fé — não verificação. Uma DDL incompatível com o SQL do repository quebra o deploy, não o PR.

- **Melhoria Proposta**
  > Criar `PermutaRelationalRepository.integration.test.ts` usando `Testcontainers` ou um `docker-compose.test.yml` minimal (postgres:16-alpine). Rodar `runMigrations.ts` no `beforeAll`, exercer: (1) `persistIngestRun` happy → `permuta_adiantamento.stale=false`; (2) segundo `persistIngestRun` com `withAdvisoryLock` ocupado → erro tipado; (3) `markStale` muda apenas linhas com `last_ingest_run_id` distinto; (4) ROLLBACK em falha do `write` deixa fatos last-good intactos. Habilitar via job CI separado (`backend-integration`). Tactic Bass: **Sandbox + Executable Assertions**.

- **Resultado Esperado**
  > 0 → ≥ 5 casos integrados; CI passa a falhar em PR quando a migration diverge do SQL do repository.

- **Tactic alvo**: Sandbox
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - Testes integrados na fatia: 0 → ≥ 5
  - Migrations cobertas por execução em CI (não-prod): 0/4 → 4/4
- **Risco de não fazer**: deploy bloqueado por erro de DDL pego apenas pelo `npm run migrate` antes do Render redeploy.
- **Dependências**: image Docker Postgres no runner CI.

### [testability-3] Introduzir `ClockProvider` injetável para zerar `new Date()` em services

- **Problema**
  > 7 chamadas a `new Date()` em sources da fatia (4 só em `IngestaoPermutasService.executar`) impedem que testes afirmem invariantes exatas sobre `startedAt`/`finishedAt`/`geradoEm`/`processadoEm`. Os testes hoje contornam com `typeof === 'string'` e `expect.any(Date)` — auditoria O6 fica fora de gate.

- **Melhoria Proposta**
  > Criar `domain/libs/ClockProvider.ts` (`@singleton @injectable`) com `now(): Date`. Injetar em `IngestaoPermutasService`, `GestaoPermutasService`, `EleicaoPermutasService`, `PermutaProcessamentoRepository`. Testes passam a usar `{ now: () => new Date('2026-06-18T12:00Z') }` como mock. Tactic Bass: **Limit Non-Determinism**. Cross-QA: alinha com **Modifiability** (clock como seam).

- **Resultado Esperado**
  > `new Date()` direto em sources da fatia: **7 → 0**. Testes asseguram igualdade exata de timestamps em `IngestRunHeader` e `geradoEm`.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - `new Date()` em `src/backend/domain/{service,repository}/permutas/`: 7 → 0
  - Casos com assert exato de timestamp em `IngestaoPermutasService.test.ts`: 0 → ≥ 2
- **Risco de não fazer**: bug de timezone/format chegando em produção; reconciliação `permuta_eleicao_run.finished_at` × `permuta_processamento.processado_em` divergente.
- **Dependências**: nenhuma.

### [testability-4] Introduzir `IdProvider` injetável (`randomUUID` via DI)

- **Problema**
  > `randomUUID()` é chamado direto em 3 sources (`PermutaRelationalRepository.insertIngestRunHeader`, `PermutaSnapshotRepository.persistRun`, `EleicaoPermutasService.executar`). Testes que cobrem `persistIngestRun` precisam consumir o `runId` gerado para depois afirmar — barulho que multiplica.

- **Melhoria Proposta**
  > `domain/libs/IdProvider.ts` (`@singleton @injectable`) com `uuid(): string`. Mockar nos testes para retornar `'run-1'` previsível. Tactic Bass: **Limit Non-Determinism**.

- **Resultado Esperado**
  > Sources com `randomUUID()` direto na fatia: **3 → 0**. Testes afirmam `runId === 'run-1'` diretamente em vez de via callback capture.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - `randomUUID()` direto em fontes da fatia: 3 → 0
- **Risco de não fazer**: persistência de teste fica mais ruidosa conforme novas runs são adicionadas (SISPAG).
- **Dependências**: card testability-3 (mesmo padrão de seam).

### [testability-5] Elevar `coverageThreshold` em `domain/service/` (branches 60 → 75; lines 88 → 92)

- **Problema**
  > O piso de cobertura no `jest.config.cjs` é calibrado por comentário como "just below current". Defende contra regressão maior, mas não força progressão — e 60% de branches em um service que decide auto-casamento financeiro é frouxo.

- **Melhoria Proposta**
  > Após implementar cards testability-1/2/3, recalibrar `coverageThreshold['./domain/service/']` para `{ lines: 92, branches: 75 }`. Adicionar chave dedicada para `./domain/service/permutas/` em `{ lines: 95, branches: 80 }`. Tactic Bass: **Executable Assertions** (gate).

- **Resultado Esperado**
  > Branch floor em `domain/service/permutas/`: **60% → 80%**. CI bloqueia PR em qualquer remoção de ramo do hot path.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - Branch threshold `./domain/service/permutas/`: indefinido → 80
  - Lines threshold `./domain/service/permutas/`: indefinido → 95
- **Risco de não fazer**: ramo de erro / advisory-lock-busy / compute-fail sai do gate sem ninguém notar.
- **Dependências**: cards 1-4 que primeiro elevam a cobertura real.

### [testability-6] Extrair fixtures Permutas para helper compartilhado e trocar `app.listen(0)` por `supertest(app)`

- **Problema**
  > `EleicaoPermutasService.test.ts` (652 LOC) e `IngestaoPermutasService.test.ts` (224 LOC) duplicam fixtures `PermutaCandidata`. `routes/permutas.test.ts` abre/fecha socket por caso (`app.listen(0)` × 7) — caro e suscetível a flake em runner lento.

- **Melhoria Proposta**
  > (a) Criar `domain/service/permutas/__fixtures__/candidatas.ts` exportando `elegivelFixture`, `bloqueadaFixture`, `casamentoFixture`. (b) Migrar `routes/permutas.test.ts` para `supertest(app).get('/permutas/painel')` — sem socket. Tactic Bass: **Limit Structural Complexity**.

- **Resultado Esperado**
  > LOC do maior arquivo de teste da fatia: **652 → ≤ 500**. Sockets abertos em `routes/permutas.test.ts`: **7 → 0**.

- **Tactic alvo**: Limit Structural Complexity
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-5, F-testability-7
- **Métricas de sucesso**:
  - Top test file LOC na fatia: 652 → ≤ 500
  - Sockets bound em route tests: 7 → 0
- **Risco de não fazer**: drift de fixture entre eleição e ingestão; tempo de CI cresce com cada nova rota.
- **Dependências**: nenhuma.

### [testability-7] Assert de audit-log em 401/422 nas rotas Permutas

- **Problema**
  > Os casos 401 em `routes/permutas.test.ts:95-103,250-260` só verificam status code. Nenhum assert de que tentativa não-autenticada foi auditada (`logService.warn`/`error`). Auditoria O6 fica abaixo do declarado na ontologia.

- **Melhoria Proposta**
  > Mockar `LogService` via `container.registerInstance(LogService, { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as never)` e asserir `warn`/`error` foi chamado com `requestId` + path no caso 401. Idem para 422 (Zod fail no body do `POST /processar`). Tactic Bass: **Executable Assertions**.

- **Resultado Esperado**
  > Casos 401/422 com assert de log: **0 → ≥ 4** (2 endpoints × {401, 422}).

- **Tactic alvo**: Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-8
- **Métricas de sucesso**:
  - Asserts de log em paths de erro nas rotas Permutas: 0 → ≥ 4
- **Risco de não fazer**: auditoria de tentativa de processar adiantamento sem auth pode silenciosamente parar de logar.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Quick mode: cobertura de linhas/branches não rodada — análise apoia-se em `coverageThreshold` declarado, contagem de `describe`/`it` por método público e leitura do source.
- Cross-QA: **testability-2** (sandbox SQL) acopla com **Integrability** (migration = contrato com schema) e **Deployability** (gate antes do `npm run migrate` em CI). **testability-3** (ClockProvider) acopla com **Modifiability** (seam reutilizável por SISPAG/GED). **testability-7** (audit-log assert) acopla com **Security** (auditoria O6).
- Pontos fortes a preservar: (1) 100% dos métodos públicos da fatia têm `describe` correspondente; (2) padrão DB-mock via `TransactionClient` é exemplar — replicar em SISPAG/GED; (3) cobertura de happy / advisory-lock-busy / compute-fail+rollback nos 3 lugares certos (repo + service + route); (4) Inviolable Rule #5 é defendida por assert literal `expect(sql).not.toMatch(/'\s*\+\|\$\{/)`.
