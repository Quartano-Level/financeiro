---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-17-2340
agent: qa-deployability
generated_at: 2026-06-18T00:00:00-03:00
scope: backend
score: 4
findings_count: 8
cards_count: 8
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Engenheiro merga PR Permutas Fatia 1 em `main` | GitHub Actions dispara `deploy-backend` → Render redeploy hook | Backend Express em Render (`/permutas/eleicao`, `/permutas/painel`) + Postgres (Supabase pooler) | Produção single-region, sem staging intermediário, 1 instância Render | Schema novo (`permuta_eleicao_run`, `permuta_candidata_snapshot`, `schema_migrations`) materializado antes do 1º POST; rota nova retorna 2xx; rollback < 5 min se quebrar | Tempo entre merge e `/health` 200 com schema aplicado; nº de runs de `eleicao` órfãs por crash; taxa de deploy bem-sucedido |

Particularidade desta fatia: é a **1ª migration do repo**. Toda convenção de versionamento + execução nasce aqui. O endpoint `POST /permutas/eleicao` substitui o cron diário ausente (gap O4 da migration-debt), o que move a cadência para gatilho manual — risco operacional explícito.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Migration runner cabeado no boot/deploy | ❌ não cabeado | cabeado (npm script ou hook de boot) | ❌ | `src/backend/index.ts`, `src/backend/package.json:6-16`, `src/backend/domain/appContainer.ts` (grep `runMigrations\|MigrationRunner` → 0 chamadas) |
| Migrations idempotentes (re-rodar é seguro) | ✅ `IF NOT EXISTS` + `schema_migrations` | idempotente | ✅ | `migrations/0001_permuta_eleicao.sql:9,23,26,41` + `migrations/runMigrations.ts:25-53` |
| Atomicidade de migration (lock/transação) | ❌ sem `BEGIN`, sem `pg_advisory_lock` | wrap em transação + lock global | ❌ | `migrations/runMigrations.ts:42-52` (loop de `insert` independentes) |
| Rollback SQL (down migration) | ❌ ausente | `.down.sql` ou política documentada | ❌ | `migrations/` (só `0001_permuta_eleicao.sql`, sem par) |
| Atomicidade da run de eleição | ❌ N+1 inserts sem transação | tudo em 1 transação | ❌ | `PermutaSnapshotRepository.ts:65-95`; `PostgreeDatabaseClient.ts:90-104` (sem método `transaction`) |
| Idempotência da rota trigger (`POST /permutas/eleicao`) | ❌ sem chave de idempotência / advisory lock | bloquear runs simultâneas; deduplicar dispara repetido | ❌ | `routes/permutas.ts:24-40`; `EleicaoPermutasService.executar` cria `randomUUID()` por chamada |
| Smoke test pós-deploy cobre DB/migration | ❌ só `GET /health` (status + version) | health profundo (DB ping + `schema_migrations` count) | ❌ | `.github/workflows/ci.yml:96-110`, `index.ts:56-57` |
| Bootstrap derruba app se Postgres falhar | ❌ swallow + warn | fail-fast em prod | ❌ | `appContainer.ts:35-42` (try/catch silencioso) |
| Staging entre main e prod | ❌ deploy direto ao Render no push de `main` | staging → smoke → promote | ❌ | `.github/workflows/ci.yml:75-94` |
| CI: typecheck + lint + test + build + audit | ✅ 5 steps automáticos | ≥5 steps | ✅ | `.github/workflows/ci.yml:17-28` |
| Lockfile commitado / versão Node pinada | ✅ `package-lock.json` + `node-version: '24'` | presente | ✅ | `.github/workflows/ci.yml:19-23` |
| Version lockstep FE/BE + tag automática | ✅ `tag-release` job | tag por release | ✅ | `.github/workflows/ci.yml:48-73` |
| Bump de versão no delta da feature | ❌ continua `0.1.0` (BE+FE) sem `chore(release)` | bump semver após `feat` | ⚠️ | `src/backend/package.json:3`, `src/frontend/package.json:3` |
| LOC novo / LOC teste da fatia | 1163 / 944 | proxy de cobertura razoável | ✅ | `_shared-metrics.md` |

> ⚠️ **Não medível neste run (`--quick`):**
> - Tempo real merge→`/health` 200 (sem acesso ao Render dashboard).
> - Taxa histórica de deploys bem-sucedidos (sem produção provisionada ainda).
> - Bundle size / cold start (alvo Lambda; estado atual Express + `tsc` simples — não aplicável agora).
> - `terraform plan` (sem `infra/` — gap I1 da migration-debt).
> - Coverage % (skip `jest --coverage`).

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Scale Rollouts (canary / blue-green / rolling) | Render redeploy substitui a instância única; sem canary, sem blue-green | ❌ ausente | `.github/workflows/ci.yml:75-94` |
| Rollback | Sem rollback automático; sem `*.down.sql`; deploy hook só dispara forward | ❌ ausente | `migrations/0001_permuta_eleicao.sql` (sem par down); `ci.yml:80-94` |
| Script Deployment Commands | CI roda `npm ci → audit → typecheck → lint → test → build → deploy hook → smoke /health`; **migration runner não está no script** | ⚠️ parcial | `.github/workflows/ci.yml:17-28,75-110`; `runMigrations.ts` órfão |
| Logical Grouping | Único processo Express; rotas separadas (`/conexos`, `/permutas`) sob mesmo binário | ⚠️ parcial | `index.ts:67-76` |
| Physical Grouping | Render single instance + Supabase Postgres compartilhado | ⚠️ parcial | `appContainer.ts:35-42` (1 pool); `PostgreeDatabaseClient.ts:11` (`poolMaxConnections=1`) |
| Package Dependencies | `package-lock.json` commitado; `npm ci`; `npm audit --audit-level=high` no CI | ✅ presente | `.github/workflows/ci.yml:23-24` |
| Surge Protection | `globalLimiter` + `heavyRouteLimiter` no router; mas trigger `POST /eleicao` não tem dedupe por usuário | ⚠️ parcial | `index.ts:23,68,75`; `routes/permutas.ts:24-40` |
| Idempotent Deploys | Migrations são idempotentes (`IF NOT EXISTS` + `schema_migrations`); deploy hook é idempotente (Render); **run de eleição NÃO** | ⚠️ parcial | `0001_permuta_eleicao.sql:9,23,26,41`; `routes/permutas.ts:24-40` |
| Drift Detection | Inexistente — nenhum scheduled job verifica schema vs. expected | ❌ ausente | grep `terraform plan\|drift` → 0 hits |
| Reproducible Builds | TypeScript compilado deterministicamente; lockfile; Node pinado em `24`; sem `Date.now()` em metadados | ✅ presente | `.github/workflows/ci.yml:19-23`; `package.json:8` |
| Per-tenant blast-radius limit | N/A — nenhum tenant provisionado ainda (gap I1/I2 da migration-debt); skeleton single-tenant | N/A | `CLAUDE.md §Tenants` (vazio) |
| Deployment Observability | Smoke shallow (só `/health` status+version); zero métrica de "migration aplicada", zero `flowId` propagado ao deploy log | ⚠️ parcial | `index.ts:56-57`; `ci.yml:96-110` |

## 4. Findings (achados)

### F-deployability-1: Migration runner existe mas não roda no deploy — primeiro POST /permutas/eleicao em prod resulta em erro de tabela inexistente

- **Severidade**: P0
- **Tactic violada**: Script Deployment Commands · Idempotent Deploys
- **Localização**: `src/backend/migrations/runMigrations.ts:1-55`, `src/backend/index.ts:1-87`, `src/backend/domain/appContainer.ts:17-45`, `src/backend/package.json:6-16`, `.github/workflows/ci.yml:75-110`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "runMigrations\|MigrationRunner" \
      src/backend/index.ts src/backend/package.json \
      src/backend/domain/appContainer.ts .github/workflows/
  # (zero matches — runner é código órfão)
  ```
  O hook do Render dispara `npm start` → `node dist/index.js` → sobe Express. Nenhum passo intermediário aplica `migrations/0001_permuta_eleicao.sql`. O smoke (`ci.yml:96-110`) só checa `GET /health`, que não toca DB.
- **Impacto técnico**: A 1ª chamada a `POST /permutas/eleicao` em produção vai falhar em `INSERT INTO permuta_eleicao_run (...)` com `relation "permuta_eleicao_run" does not exist`. O catch em `EleicaoPermutasService.executar` (linha 125) tenta gravar `status='error'`… na mesma tabela inexistente → throw secundário, response 500 sem auditoria persistida.
- **Impacto de negócio**: Frente I não funciona em prod no dia D do deploy. Analista financeiro disparou o pedido de eleição diária, recebeu erro genérico, abriu chamado. Quebra a promessa "Frente I — Fatia 1: painel READ-ONLY" antes do 1º uso.
- **Métrica de baseline**: 0 chamadas a `runMigrations` em todo o repo / 100% dos endpoints `/permutas/*` dependentes de schema que **não existe** no momento do deploy.

### F-deployability-2: POST /permutas/eleicao substitui o cron sem idempotência nem lock — duas chamadas paralelas geram dois snapshots concorrentes

- **Severidade**: P0
- **Tactic violada**: Surge Protection · Idempotent Deploys (no eixo "operação repetível")
- **Localização**: `src/backend/routes/permutas.ts:24-40`, `src/backend/domain/service/permutas/EleicaoPermutasService.ts:60-152`
- **Evidência (objetiva)**:
  ```typescript
  // routes/permutas.ts:24-40
  router.post('/eleicao', asyncHandler(async (req, res) => {
      await bootstrapAppContainer();
      const service = container.resolve(EleicaoPermutasService);
      const triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown';
      const result = await service.executar({ triggeredBy });   // novo flowId/runId a cada call
      res.json({...});
  }));
  ```
  Cada chamada cria `flowId = randomUUID()` (EleicaoPermutasService.ts:62) e `runId = randomUUID()` (PermutaSnapshotRepository.ts:63). Nenhum `pg_advisory_lock`, nenhum `INSERT ... ON CONFLICT`, nenhuma janela "uma run por dia".
- **Impacto técnico**: O `PainelService.exporNoPainel` lê o snapshot mais recente com `status='success'`. Se duas runs simultâneas terminam em ordem inversa do esperado, o painel pode exibir resultados de uma run mais antiga vencida por race. Pior: a run lenta gasta paginação Conexos pesada (capHit a `MAX_PAGES=50`) dobrada → quota stress.
- **Impacto de negócio**: Cada run de eleição faz fan-out à API Conexos (gate `heavyRouteLimiter` no nível de IP, não no nível de operação). Analista clica duas vezes "Atualizar" → API Conexos é martelada por 2 backlogs em paralelo. Em pior caso, sessão Conexos esgota cota / rejeita → painel fica "stuck" em status partial e o time precisa esperar 1h pra repetir.
- **Métrica de baseline**: 0 mecanismos de dedupe entre `POST /permutas/eleicao` em flight; nº máximo teórico de runs simultâneas = nº de clients × `heavyRouteLimiter.max`.

### F-deployability-3: Atomicidade da run é afirmada em docstring mas não existe — N+1 INSERTs sem BEGIN/COMMIT

- **Severidade**: P1
- **Tactic violada**: Rollback (nível aplicação) · Idempotent Deploys
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:59-95`, `src/backend/domain/client/database/PostgreeDatabaseClient.ts:60-104`
- **Evidência (objetiva)**:
  ```typescript
  // PermutaSnapshotRepository.ts:59-95
  public persistRun = async (run, candidatas) => {
      const runId = randomUUID();
      await this.databaseClient.insert(`INSERT INTO permuta_eleicao_run (...) VALUES (...)`, {...});
      for (const candidata of candidatas) {
          await this.insertCandidata(runId, candidata);   // N inserts independentes
      }
      return runId;
  };
  ```
  `PostgreeDatabaseClient` (linhas 60-104) expõe `insert`/`update`/`selectMany` que cada um faz `pool.query(text, params)` — sem `BEGIN`/`COMMIT`, sem `transaction()` API. O comentário em EleicaoPermutasService.ts:45 afirma: "Atomicidade: abort → 0 snapshot rows", mas isso só vale para o caminho `catch` (que insere 0 candidatas); **não vale para crash mid-loop**.
- **Impacto técnico**: SIGTERM do Render (deploy em curso) entre a INSERT da run e a INSERT da candidata 73 de 200 → `permuta_eleicao_run` com `status='success' total_candidatas=200`, mas só 73 linhas em `permuta_candidata_snapshot`. Painel mostra dados parciais como se fossem completos.
- **Impacto de negócio**: A auditoria O6 (justamente o que essa fatia entrega) fica corrompida silenciosamente. Analista vê backlog "limpo" porque 127 candidatas não chegaram ao snapshot — risco de invoice antiga passar despercebida.
- **Métrica de baseline**: 0 transações em uso no repo (grep `BEGIN\|COMMIT\|transaction` em repository/database → 0 hits); janela de exposição = duração de uma run completa (paginação 50 × 500 = até 25 mil candidatas serializadas em loop).

### F-deployability-4: Migration sem down script — rollback de schema é manual e indocumentado

- **Severidade**: P1
- **Tactic violada**: Rollback
- **Localização**: `src/backend/migrations/0001_permuta_eleicao.sql`, `src/backend/migrations/runMigrations.ts`
- **Evidência (objetiva)**:
  ```
  $ ls src/backend/migrations/
  0001_permuta_eleicao.sql
  runMigrations.ts
  # nenhum 0001_permuta_eleicao.down.sql, nenhuma convenção documentada
  ```
  `runMigrations.ts:25-53` só implementa `up`. Nenhum README em `migrations/`.
- **Impacto técnico**: Se o schema sair errado em prod (ex.: tipo `aging_days INTEGER` deveria ser `NUMERIC`), a única saída é `DROP TABLE` manual via console Supabase + apagar a linha de `schema_migrations`. Procedimento não documentado = passos errados em momento de incidente.
- **Impacto de negócio**: MTTR (mean time to recovery) inflado em incidente de schema. Engenheiro descobre o "como reverter" no meio da madrugada.
- **Métrica de baseline**: 0 arquivos `*.down.sql`; 0 menções a "rollback" no diretório `migrations/`.

### F-deployability-5: Drift schema↔código — `fil_cod` existe na tabela mas nunca é gravado pelo repositório

- **Severidade**: P1
- **Tactic violada**: Drift Detection · Reproducible Builds (nível semântico)
- **Localização**: `src/backend/migrations/0001_permuta_eleicao.sql:32`, `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:131-156`
- **Evidência (objetiva)**:
  ```sql
  -- 0001_permuta_eleicao.sql:26-39 declara:
  CREATE TABLE IF NOT EXISTS permuta_candidata_snapshot (
      id BIGSERIAL PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES permuta_eleicao_run (id) ON DELETE CASCADE,
      doc_cod TEXT NOT NULL,
      fil_cod INTEGER,                                     -- <- declarada
      pri_cod TEXT NOT NULL,
      ...
  );
  ```
  ```typescript
  // PermutaSnapshotRepository.ts:137-156 omite fil_cod no INSERT:
  await this.databaseClient.insert(
      `INSERT INTO permuta_candidata_snapshot (
          run_id, doc_cod, pri_cod, status, motivo_bloqueio,
          aging_days, invoice_doc_cod, variacao_classificacao, variacao_resultado
      ) VALUES (...)`,    // fil_cod ausente
      { runId, docCod, priCod, status, ... }
  );
  ```
  O mapeamento de leitura (linha 162) lê `fil_cod` mas SEMPRE será null.
- **Impacto técnico**: Multi-filial (I6 — afirmado como atendido pelo EleicaoPermutasService.ts:44) NÃO chega ao snapshot. O painel não distingue por filial; relatórios futuros que filtrarem por `fil_cod` retornam vazio.
- **Impacto de negócio**: Promessa multi-filial quebrada silenciosamente. Quando a área financeira pedir "me mostre só a filial Itajaí", terá de re-rodar e ainda assim não conseguirá.
- **Métrica de baseline**: 100% das linhas de `permuta_candidata_snapshot` terão `fil_cod IS NULL`.

### F-deployability-6: Smoke test pós-deploy não cobre DB nem migration — health green com schema ausente

- **Severidade**: P1
- **Tactic violada**: Deployment Observability
- **Localização**: `.github/workflows/ci.yml:96-110`, `src/backend/index.ts:53-57`
- **Evidência (objetiva)**:
  ```typescript
  // index.ts:53-57
  const APP_VERSION = process.env.npm_package_version ?? 'unknown';
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
  ```yaml
  # ci.yml:96-110
  curl --retry 12 --retry-delay 10 --retry-all-errors -f \
    "${RENDER_BACKEND_URL%/}/health"
  ```
  `/health` é estático — não pinga Postgres, não conta `schema_migrations`, não verifica versão de migration esperada.
- **Impacto técnico**: Deploy passa verde no CI mesmo com schema desatualizado, DB unreachable, ou migration falhada. O F-deployability-1 (migration não roda) é invisível ao smoke.
- **Impacto de negócio**: Falha só aparece quando o analista clica "Eleger permutas" — minutos a horas depois do deploy. Detecção tardia inviabiliza rollback "fresh" (commits novos já no ar).
- **Métrica de baseline**: 0 dependências externas verificadas em `/health`; 0 segundos entre deploy "ok" e potencial 500 silencioso.

### F-deployability-7: Bootstrap engole falha de Postgres — app sobe quebrado e fail-fast acontece só na 1ª query

- **Severidade**: P1
- **Tactic violada**: Deployment Observability · Surge Protection
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
  Connection string inválida em prod (typo em SSM/env) = warn no log + `bootstrapped = true`. Express atende `/health` 200, mas `/permutas/eleicao` falha no 1º INSERT.
- **Impacto técnico**: Readiness probe não detecta erro. Smoke test (já fraco) passa. Detectabilidade do problema cai para "tempo até o primeiro POST do usuário".
- **Impacto de negócio**: Falsa segurança no deploy. Combinado com F-deployability-1 e F-deployability-6, um deploy errado pode ficar ~horas sem detecção.
- **Métrica de baseline**: Tempo deploy→detecção em cenário "DB down": atual = N/A (nenhuma checagem). Alvo ≤ 2 min via health profundo.

### F-deployability-8: Deploy direto a produção sem staging — push em main → Render redeploy hook imediato

- **Severidade**: P2
- **Tactic violada**: Scale Rollouts (canary / blue-green)
- **Localização**: `.github/workflows/ci.yml:75-94`
- **Evidência (objetiva)**:
  ```yaml
  deploy-backend:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    # Trigger Render deploy hook → prd direto
  ```
  Sem job `deploy-staging` antes; sem step manual de aprovação.
- **Impacto técnico**: Qualquer regressão que escape ao CI (tipicamente: integração Conexos/Postgres real) vai direto a prd. Pior cenário para a 1ª migration: F-deployability-1 + sem staging = bug 100% in-the-wild.
- **Impacto de negócio**: Custo de cada release sobe — engenheiro precisa estar disponível pós-merge pra "olhar o painel" porque não há ambiente intermediário. Frena o ritmo de entrega futuro (Fatia 2/3/SISPAG/GED).
- **Métrica de baseline**: 0 ambientes intermediários; 100% dos deploys vão direto a prd; janela de detecção pré-prd = 0 minuto.

## 5. Cards Kanban

### [deployability-1] Cabeie o `MigrationRunner` no boot/CI antes do 1º deploy de Permutas

- **Problema**
  > `runMigrations.ts` está implementado e idempotente, mas nenhum lugar do código (index/appContainer/package.json/CI) o chama. O hook do Render sobe `npm start` direto; a 1ª chamada a `POST /permutas/eleicao` em prod falha com tabela inexistente.

- **Melhoria Proposta**
  > Adicionar `npm run migrate` no `package.json` que invoca o runner (via tsx + container) e plugá-lo em `ci.yml` como step pré-`deploy-backend` (ou disparar no `prestart` do Render). Alternativa: bootar e rodar migrations no `index.ts` antes do `app.listen`, com fail-fast se quebrar. Tactic Bass: **Script Deployment Commands** + **Idempotent Deploys**.

- **Resultado Esperado**
  > Deploy aplica a migration automaticamente; smoke test (deployability-6) confirma. Métrica: chamadas a `runMigrations` no caminho de deploy: 0 → 1 (e idempotente em redeploys).

- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - Step de migration no CI: ausente → presente
  - `SELECT count(*) FROM schema_migrations`: erro de "relação inexistente" → `1`
- **Risco de não fazer**: Frente I não funciona no 1º deploy em prod; analista financeiro recebe 500 silencioso.
- **Dependências**: nenhuma

### [deployability-2] Idempotência + lock no `POST /permutas/eleicao` — uma run em vôo por vez

- **Problema**
  > A rota substitui o cron diário (gap O4) mas não tem dedupe nem advisory lock. Dois cliques (ou dois jobs externos) disparam duas runs paralelas, dobram o fan-out à API Conexos e produzem snapshots concorrentes.

- **Melhoria Proposta**
  > Wrapping da run em `SELECT pg_try_advisory_lock(<hash>)` no início e `pg_advisory_unlock(...)` no fim. Em paralelo, aceitar um header/`X-Idempotency-Key` opcional (data-base ou `YYYY-MM-DD`) que faça `INSERT ... ON CONFLICT DO NOTHING` na `permuta_eleicao_run`. Tactic Bass: **Surge Protection** + **Idempotent Deploys**.

- **Resultado Esperado**
  > Duas chamadas simultâneas → uma roda, a outra retorna 409 (ou o resultado da run em vôo). Métrica observável: número máximo de runs simultâneas: ∞ → 1.

- **Tactic alvo**: Surge Protection
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - Runs concorrentes possíveis: ∞ → 1
  - Linhas órfãs em `permuta_eleicao_run` por clique repetido do mesmo usuário: N → 0
- **Risco de não fazer**: stress duplicado na API Conexos (sessão pode bloquear); painel mostrando dados de run perdedora de race; auditoria O6 com runs duplicadas.
- **Dependências**: deployability-1 (schema precisa existir)

### [deployability-3] Envolver `persistRun` em transação Postgres (BEGIN/COMMIT)

- **Problema**
  > A docstring de `EleicaoPermutasService` afirma atomicidade ("run completa ⇒ 1 row + 1 row por candidata"), mas `PermutaSnapshotRepository.persistRun` faz N+1 INSERTs independentes. Crash mid-loop (SIGTERM de deploy, OOM, pool error) deixa snapshot parcial e auditoria mentindo.

- **Melhoria Proposta**
  > Expor `transaction(fn)` no `PostgreeDatabaseClient` (`BEGIN`/`COMMIT`/`ROLLBACK` em torno de uma única conexão do pool) e usá-lo em `persistRun`. Atenção ao comentário de pooler em modo transação (linha 83 do client) — usar `BEGIN; ...; COMMIT;` cru, não prepared. Tactic Bass: **Rollback** (a nível aplicação).

- **Resultado Esperado**
  > Crash mid-loop = `ROLLBACK` automático; tabela fica consistente. Métrica: linhas órfãs em `permuta_candidata_snapshot` por crash simulado: N>0 → 0.

- **Tactic alvo**: Rollback
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - Testes de "kill mid-persistRun" mostram tabela limpa: ausente → presente
  - `SELECT total_candidatas FROM permuta_eleicao_run` ≡ `COUNT(*) FROM permuta_candidata_snapshot WHERE run_id = ?`: nem sempre → sempre
- **Risco de não fazer**: auditoria corrompida silenciosamente; F-deployability-3 vira incidente real assim que o Render fizer deploy mid-run.
- **Dependências**: nenhuma

### [deployability-4] Convenção + arquivo `down.sql` por migration, documentada no README de `migrations/`

- **Problema**
  > Esta é a 1ª migration do repo. Não existe convenção de rollback, não existe `0001_permuta_eleicao.down.sql`, não existe README explicando como reverter. Em incidente, único caminho é console manual no Supabase.

- **Melhoria Proposta**
  > Estabelecer convenção: cada `NNNN_*.sql` deve ter par `NNNN_*.down.sql`. Adicionar `npm run migrate:rollback` que aplica o down e deleta a linha em `schema_migrations`. Documentar em `src/backend/migrations/README.md`. Tactic Bass: **Rollback**.

- **Resultado Esperado**
  > Reverter última migration vira `npm run migrate:rollback` em até 2 min. Métrica: tempo de rollback "fresco" (sem console manual): N/A → ≤2 min.

- **Tactic alvo**: Rollback
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - Arquivos `*.down.sql`: 0 → 1 (par para 0001)
  - README em `migrations/`: ausente → presente
- **Risco de não fazer**: MTTR alto em incidente de schema; o "como reverter" só é descoberto no momento crítico.
- **Dependências**: deployability-1

### [deployability-5] Incluir `fil_cod` no INSERT do snapshot (fechar drift schema↔código)

- **Problema**
  > Migration declara `fil_cod INTEGER` em `permuta_candidata_snapshot` (linha 32). `PermutaSnapshotRepository.insertCandidata` (linhas 137-156) não inclui a coluna no INSERT. Multi-filial (I6) prometido na docstring NÃO chega à auditoria.

- **Melhoria Proposta**
  > Propagar `filCod` de `processFilial` → `buildCandidata` → snapshot. Adicionar coluna no INSERT e teste verificando que `fil_cod` é gravado. Tactic Bass: **Drift Detection** (manual neste caso) + **Reproducible Builds** (consistência semântica).

- **Resultado Esperado**
  > Linhas de snapshot têm `fil_cod` populado; consultas por filial funcionam. Métrica: `COUNT(*) FROM permuta_candidata_snapshot WHERE fil_cod IS NULL` em runs futuras: 100% → 0%.

- **Tactic alvo**: Drift Detection
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - Cobertura de teste do INSERT com `fil_cod`: 0 → 1
  - Linhas com `fil_cod IS NULL` em prod: 100% → ≈0% (só nulls "legítimos")
- **Risco de não fazer**: relatórios futuros por filial vazios; promessa multi-filial quebrada.
- **Dependências**: nenhuma

### [deployability-6] Health profundo `/health/ready` checa DB + `schema_migrations`

- **Problema**
  > `/health` é estático (status+version). Smoke test do CI (`ci.yml:96-110`) só fala que o processo subiu. Deploy fica verde mesmo com schema desatualizado, Postgres unreachable ou migration falhada.

- **Melhoria Proposta**
  > Adicionar `GET /health/ready` que (1) faz `SELECT 1` no Postgres, (2) lê `MAX(name) FROM schema_migrations` e compara com `EXPECTED_MIGRATION` (env ou constante derivada do build). Apontar o smoke test do CI para `/health/ready`. Manter `/health` raso para liveness. Tactic Bass: **Deployment Observability**.

- **Resultado Esperado**
  > Deploy quebra no CI se DB/migration estiver fora. Métrica: tempo deploy→detecção em cenário "DB down": ~horas → ≤2 min.

- **Tactic alvo**: Deployment Observability
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1, F-deployability-6, F-deployability-7
- **Métricas de sucesso**:
  - Dependências verificadas em `/health/ready`: 0 → ≥2 (DB ping + migration check)
  - Smoke test detecta migration ausente: 0% → 100%
- **Risco de não fazer**: F-deployability-1 fica invisível ao CI; deploys quebrados ficam verdes.
- **Dependências**: deployability-1

### [deployability-7] Fail-fast em `bootstrapAppContainer` se Postgres não inicializa em prod

- **Problema**
  > `appContainer.ts:35-42` engole erro de `PostgreeDatabaseClient.init()` com `console.warn` e marca `bootstrapped=true`. App sobe quebrado; readiness probe não percebe.

- **Melhoria Proposta**
  > Em ambiente `prd`/`stg`, propagar o erro (fail-fast) — Render derruba o deploy. Em `local`/`dev` (sem DB), manter o warn como conveniência. Detectar ambiente via `EnvironmentProvider`. Tactic Bass: **Deployment Observability**.

- **Resultado Esperado**
  > Deploy em prod com Postgres inacessível falha no boot, hook do Render marca redeploy como `failed`. Métrica: probabilidade de "app up com DB down" em prd: 100% → 0%.

- **Tactic alvo**: Deployment Observability
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-7
- **Métricas de sucesso**:
  - Tentativas de boot com DB inacessível em prd: silencioso → fail-fast com exit ≠0
- **Risco de não fazer**: combinação tóxica com F-deployability-6 — deploy quebrado fica indetectável.
- **Dependências**: deployability-6 (sinergia)

### [deployability-8] Etapa de staging entre `main` e Render prd

- **Problema**
  > Push em `main` → CI verde → Render prd em segundos. Sem ambiente intermediário para validar integração Conexos/Postgres real. Pior cenário pra estreia da 1ª migration: sem rede de segurança nenhuma.

- **Melhoria Proposta**
  > Criar `deploy-staging` (ambiente Render staging gratuito + Supabase project staging) que roda no push de `main`; smoke `/health/ready` + 1 chamada a `POST /permutas/eleicao` (dry-run). Promover a prd via tag manual ou approval gate. Tactic Bass: **Scale Rollouts** (blue/green simplificado).

- **Resultado Esperado**
  > Releases passam por staging; canários de smoke real antes de prd. Métrica: deploys que vão direto a prd: 100% → ≤10% (só hotfix com flag).

- **Tactic alvo**: Scale Rollouts
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-8
- **Métricas de sucesso**:
  - Ambientes pré-prd: 0 → 1
  - Taxa de rollback em prd: baseline → reduzida
- **Risco de não fazer**: cada Fatia/Frente nova carrega risco operacional crescente. Permutas Fatia 2 (escrita em `fin010`) sem staging = risco arquitetural #1 da migration-debt em produção sem ensaio.
- **Dependências**: deployability-6 (health profundo é o que o smoke de staging consulta)

## 6. Notas do agente

- Escopo `--quick`: skipei terraform plan (sem `infra/`), coverage e bench de runtime — alvo Lambda ainda é estado-futuro, deploy real hoje é Render+Supabase.
- Score 4/10: 5 dos 8 findings são P0/P1 e atacam o caminho crítico do 1º deploy. CI base é sólido (lockfile, audit, tag-release lockstep) mas o delta da Fatia 1 não fecha o anel.
- Cross-QA: F-deployability-3 (atomicidade sem BEGIN/COMMIT) conversa com **Fault-Tolerance** (recovery state) e **Testability** (testes de crash); F-deployability-2 (lock em rota) conversa com **Performance** (fan-out Conexos duplo) e **Security** (DoS por trigger sem dedupe); F-deployability-5 (drift schema/código) conversa com **Modifiability** (1ª migration estabelece convenção). Sinalizar ao consolidator.
- F-deployability-1 é o achado mais urgente: deploy hoje + 1ª chamada à rota = 500 garantido. Bloqueia a entrega da Fatia 1 em prod independentemente de tudo o mais.
