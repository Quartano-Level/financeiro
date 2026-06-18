---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-18-2039
agent: qa-deployability
generated_at: 2026-06-18T20:39:00-03:00
scope: backend
score: 6
findings_count: 6
cards_count: 6
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev merge para `main` (Permutas Fase B) | Push dispara `ci.yml` → `Deploy Backend (Render)` aplica `npm run migrate` (0003+0004) e dispara o deploy hook do Render; backend ao subir também executa `MigrationRunner` em `bootstrapAppContainer` | `src/backend/migrations/000{3,4}_*.sql`, `runMigrations.ts`, `appContainer.ts`, `jobs/ingest-permutas.ts`, `.github/workflows/ci.yml` | Produção Render single-instance + Postgres compartilhado (sem multi-tenant — tabela `tenants` vazia, infra/Terraform não existe) | Migrations idempotentes (`IF NOT EXISTS`, `schema_migrations`) aplicadas antes de servir tráfego; cron diário de ingestão NÃO agendado (apenas linha documentada no header do job); smoke `/health` opcional valida que o deploy subiu | Migrations P0-1 fecham antes do tráfego (✅ comprovado no workflow); cron-job blast-radius isolado por advisory lock; rollback = redeploy da revisão anterior no Render + ausência de migrations de DOWN (single-direction) |

> Cenário concorrente: duas instâncias subindo em paralelo (ex.: blue/green futuro do Render) tentariam aplicar migrations simultaneamente — `MigrationRunner` NÃO usa advisory lock no `schema_migrations` (somente o `IngestaoPermutasService` usa lock no ingest). Risco de corrida em provisionamento concorrente — ver F-deployability-2.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Passos automatizados commit→prd | 8 (checkout, setup-node, ci, audit, typecheck, lint, test+cov, build, migrate, deploy hook, smoke) | ≥5 | ✅ | `.github/workflows/ci.yml:9-132` |
| `terraform plan` gating `apply` | N/A (sem infra Terraform — alvo, não atual) | presente quando infra existir | ⚠️ N/A | `CLAUDE.md` §Estado Atual; `infra/` ausente |
| Migrations idempotentes (Fase B) | 100% (`IF NOT EXISTS` em 0003 e 0004; `ADD COLUMN IF NOT EXISTS` 5/5) | 100% | ✅ | `migrations/0003_permuta_relational.sql:13-126`, `0004_permuta_processamento.sql:11-25` |
| Migrations registradas em `schema_migrations` | sim (skip por `applied.has(file)`) | sim | ✅ | `runMigrations.ts:36,44` |
| Ordering das migrations | lexicográfica (`.sort()`) | determinística | ✅ | `runMigrations.ts:40` |
| Pontos onde migrate roda em produção | 2 — passo `npm run migrate` no CI + `bootstrapAppContainer` no boot do Express | 1 preferencialmente (single source of truth) | ⚠️ | `ci.yml:96-100`, `appContainer.ts:32-43` |
| Advisory lock no MigrationRunner | ausente | presente p/ proteger boot concorrente | ❌ | `runMigrations.ts:25-54` (sem `pg_try_advisory_lock`) |
| Cron `job:ingest-permutas` agendado | NÃO — só linha de exemplo no header | agendado em produção (EventBridge/Render cron) | ❌ | `jobs/ingest-permutas.ts:16-17` |
| Rollback documentado para mudanças DDL | ausente (0003/0004 são forward-only, sem DOWN/scripts compensatórios) | runbook + script de compensação | ❌ | `migrations/*.sql` (todas one-way) |
| Lockfile committed (backend) | sim (`package-lock.json` referenciado no cache do CI) | sim | ✅ | `ci.yml:22, 42` |
| Build pinned (TypeScript) | `typescript: ^5.3.3` no `dependencies` (caret, não pin) | pin exato em dependências de build | ⚠️ | `src/backend/package.json:34` |
| Versão exposta no `/health` | sim — `npm_package_version` (lockstep FE/BE) | sim | ✅ | `index.ts:56-57`; `CHANGELOG.md` rodapé |
| Smoke test pós-deploy | presente porém **skipa silenciosamente** se `RENDER_BACKEND_URL` faltar | sempre roda; falha CI se ausente | ⚠️ | `ci.yml:118-132` |
| Bump de versão (Fase B) | esta feature é `feat` em `src/` → exige bump v0.2.x → v0.3.0 (ver Inviolable Rule §green-criteria #10) | bump aplicado + CHANGELOG | ⚠️ Não medível neste run | `package.json` FE/BE ambos em 0.2.0; CHANGELOG sem entrada Fase B |

> ⚠️ **Não medível localmente**: tempo real commit→prd, lead-time de smoke, taxa de sucesso de deploy. Requer histórico GitHub Actions + dashboard Render. Recomendação: instrumentar `gh run list` ou exportar métricas para o `_inbox`.
> ⚠️ **Não medível neste run**: bundle size do backend (modo quick — pulamos `npm run build`); o tsc compila in-place sem bundling, então o tamanho relevante é `node_modules` no Render (pouco controlável aqui).

## 3. Tactics — Cobertura no nf-projects

### Manage Deployment Pipeline

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Scale Rollouts (canary, blue/green, rolling) | Render entrega um deploy single-revision; não há canary nem blue/green; nenhum feature flag protege as rotas novas (`/permutas/gestao`, `/permutas/adiantamentos/:docCod/processar`) | ❌ ausente | `ci.yml:102-116`; `routes/permutas.ts` (rotas montadas sem flag) |
| Rollback | Implícito = redeploy do commit anterior no Render; migrations **forward-only** (sem DOWN). Para 0003/0004 a Fase B é aditiva (puro `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN`), então redeploy do app antigo **não exige reverter o schema** (compat preservado pelo back-compat `/painel`) — mas nada está documentado | ⚠️ parcial | `migrations/0003_*.sql:1-9` (cabeçalho diz "aditivo"); `CHANGELOG.md` sem runbook de rollback |
| Script Deployment Commands | `npm run migrate`, `npm run build`, `npm run job:ingest-permutas` todos no `package.json` + workflow declarativo | ✅ presente | `package.json:10-12`; `ci.yml:23-132` |

### Manage Deployed System

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Logical Grouping | Backend único (Express) — migrations, rotas e job ingestão coexistem no mesmo processo. Job tem entrypoint dedicado (`jobs/ingest-permutas.ts`) mas reusa `bootstrapAppContainer()` (mesma DI). Bom limite lógico, sem isolamento físico | ⚠️ parcial | `jobs/ingest-permutas.ts:22-29` |
| Physical Grouping | Tudo no mesmo serviço Render; cron job rodaria no MESMO container do API (já que não há scheduler) → competição por CPU/conexões durante a ingestão diária | ❌ ausente | `index.ts:84-86` (single listener); `jobs/ingest-permutas.ts` sem deployment dedicado |
| Package Dependencies | `package-lock.json` versionado; cache no CI por hash; `npm audit --audit-level=high` bloqueia merge | ✅ presente | `ci.yml:22-24` |
| Surge Protection | `globalLimiter` + `heavyRouteLimiter` no Express; cron diário implica spike controlado por advisory lock no `IngestaoPermutasService` (impede ingestão concorrente) | ✅ presente | `index.ts:23,68,75`; `PermutaRelationalRepository.ts:151-167` |

### Supporting concerns

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Idempotent deploys | Migrations 0003/0004 idempotentes; `schema_migrations` evita re-aplicar; `bootstrapAppContainer` tem flag `bootstrapped` (não roda 2x no mesmo processo) | ✅ presente | `runMigrations.ts:36,44`; `appContainer.ts:9,53` |
| Drift detection | Ausente — nada compara o schema Postgres com `migrations/*.sql` periodicamente; idem para infra (Terraform não existe) | ❌ ausente | — |
| Reproducible builds | Lockfile commitado + `npm ci`; TypeScript em caret (`^5.3.3`); `tsc-esm-fix` em caret também — não 100% pinado | ⚠️ parcial | `package.json:34, 48` |
| Per-tenant blast-radius limit | N/A — não há tenants provisionados (CLAUDE.md §Tenants explícito); banco é um Postgres único (Supabase). Quando o multi-tenant chegar, este card precisa ser reaberto | N/A | `CLAUDE.md` §Tenants ("vazio") |
| Deployment observability | `/health` retorna versão (lockstep FE/BE); smoke test pós-deploy existe mas SKIPA silenciosamente se `RENDER_BACKEND_URL` faltar; nenhum tracing de deploy duration | ⚠️ parcial | `index.ts:56-57`; `ci.yml:118-132` |

## 4. Findings (achados)

### F-deployability-1: Migrations rodam em DOIS lugares (CI `npm run migrate` + boot do Express) sem coordenação

- **Severidade**: P1
- **Tactic violada**: Idempotent deploys / Logical Grouping
- **Localização**: `.github/workflows/ci.yml:96-100`; `src/backend/domain/appContainer.ts:23-43`
- **Evidência (objetiva)**:
  ```
  ci.yml:96    - name: Run database migrations
  ci.yml:100      run: npm run migrate
  ...
  appContainer.ts:33    const applied = await container.resolve(MigrationRunner).run();
  appContainer.ts:39    } catch (error) {
  appContainer.ts:40        if (isProduction) throw error;
  ```
  Em produção, o passo CI aplica 0003+0004 ANTES do deploy hook, e o app re-invoca `MigrationRunner.run()` no boot. Salvado pela checagem `applied.has(file)`, mas qualquer instância nova reabre a conexão e re-executa o `CREATE TABLE IF NOT EXISTS schema_migrations`, varrendo `migrations/` no disco.
- **Impacto técnico**: Em multi-instância (futuro Render scaling ou blue/green), N boots simultâneos disparam `MigrationRunner.run()` em paralelo; o `INSERT INTO schema_migrations` pode ter race (chave duplicada) e abortar boot. Sem advisory lock, garantia é apenas pela PK em `schema_migrations`.
- **Impacto de negócio**: indisponibilidade de N-1 instâncias durante o primeiro boot pós-deploy de uma nova migração; janela de erro percebida pelo cliente Columbia.
- **Métrica de baseline**: 2 caminhos de execução de migrations em produção; 0 advisory locks protegendo a corrida.

### F-deployability-2: Cron `job:ingest-permutas` documentado mas NÃO agendado em lugar nenhum

- **Severidade**: P1
- **Tactic violada**: Script Deployment Commands / Physical Grouping
- **Localização**: `src/backend/jobs/ingest-permutas.ts:16-17`; `.github/workflows/ci.yml` (sem schedule)
- **Evidência (objetiva)**:
  ```
  ingest-permutas.ts:16    *   CRON (NÃO configurado — entrada documentada apenas):
  ingest-permutas.ts:17    *     0 6 * * *  cd /caminho/do/repo/src/backend && npm run job:ingest-permutas
  ```
  A tela `/permutas/gestao` lê fatos relacionais persistidos por esta ingestão. Sem agendamento, o relacional NUNCA é alimentado em produção — apenas se um humano rodar `npm run migrate && npm run job:ingest-permutas` na máquina dele.
- **Impacto técnico**: a Fase B entrega DDL + serviço + endpoint mas a tela `/gestao` mostra dados vazios/stale enquanto ninguém disparar manualmente.
- **Impacto de negócio**: a feature parece quebrada em produção até alguém puxar o gatilho diariamente; risco direto ao SLA do analista Columbia (que conta com dado de até D-1).
- **Métrica de baseline**: 0 agendadores configurados; 1 cron line comentada no header.

### F-deployability-3: Rollback DDL não documentado; redeploy do app anterior não tem runbook

- **Severidade**: P2
- **Tactic violada**: Rollback
- **Localização**: `migrations/0003_permuta_relational.sql:1-9`; `migrations/0004_permuta_processamento.sql:1-9`
- **Evidência (objetiva)**:
  ```
  0003: ALTER TABLE permuta_eleicao_run ADD COLUMN IF NOT EXISTS kind ... CHECK (kind IN ('eleicao', 'ingest'))
  ```
  0003 e 0004 são forward-only (sem DOWN). 0003 é aditivo, então o app v0.2.0 (Fase A) continua funcional após aplicar 0003+0004 — mas isso não está escrito. Em caso de bug grave na Fase B exigindo rollback do app, o operador precisa saber que **não precisa** reverter o schema.
- **Impacto técnico**: operador inexperiente pode tentar `DROP TABLE permuta_casamento` / `DROP COLUMN kind` e quebrar idempotência do próximo deploy (não há `IF EXISTS` simétrico para isso documentado).
- **Impacto de negócio**: MTTR alongado em incidente; risco de queda prolongada da Frente I.
- **Métrica de baseline**: 0 runbooks de rollback; 0 scripts de compensação.

### F-deployability-4: Versão de app não bumpada para Fase B (Inviolable Rule #10 do CLAUDE.md)

- **Severidade**: P2
- **Tactic violada**: Reproducible builds / Deployment observability
- **Localização**: `src/backend/package.json:3`; `src/frontend/package.json:4`; `CHANGELOG.md:1-9`
- **Evidência (objetiva)**:
  ```
  src/backend/package.json:   "version": "0.2.0",
  src/frontend/package.json:  "version": "0.2.0",
  CHANGELOG.md:               ## v0.2.0 (2026-06-18) — permutas: painel de elegíveis (Frente I, Fatia 1)
  ```
  A Fatia 1 (Fase A) é v0.2.0. Esta Fase B adiciona `feat(permutas): modelo relacional + ingestão + processamento`, o que pela regra `green-criteria #10` exige bump (`feat` → minor → v0.3.0) + entrada no `CHANGELOG.md` antes do PR.
- **Impacto técnico**: `/health` reporta `0.2.0` em prod para um binário que serve a Fase B → impossível bisectar incidentes ("é a release que adicionou /gestao?"). Tag `v0.2.0` no GitHub Releases já existe; CI step `tag-release` (ci.yml:48-73) será no-op no push, mascarando a omissão.
- **Impacto de negócio**: rollback ambíguo (qual commit corresponde a qual versão?); audit trail quebrado.
- **Métrica de baseline**: versão `/health` (0.2.0) ≠ versão lógica do código deployado (deveria ser 0.3.0).

### F-deployability-5: Smoke test pós-deploy skipa silenciosamente se segredo ausente

- **Severidade**: P2
- **Tactic violada**: Deployment observability
- **Localização**: `.github/workflows/ci.yml:118-132`
- **Evidência (objetiva)**:
  ```
  ci.yml:124    if [ -z "$RENDER_BACKEND_URL" ]; then
  ci.yml:125      echo "::warning::RENDER_BACKEND_URL secret is not set — skipping smoke test"
  ci.yml:126      exit 0
  ```
  Com a Fase B introduzindo mudanças de schema (0003/0004), o smoke `/health` é o único guard pós-deploy. Hoje ele pode estar pulando sem ninguém notar.
- **Impacto técnico**: deploy verde com app quebrado (falha de boot por migration error não capturada porque `appContainer.ts:40` faz `throw` só se `ENVIRONMENT=production` for setado E o Render reportar erro).
- **Impacto de negócio**: cliente é o primeiro a descobrir que `/permutas/gestao` retorna 500.
- **Métrica de baseline**: 1 step opcional silencioso vs. 0 steps mandatórios de smoke.

### F-deployability-6: Sem feature flag para isolar a nova rota `/permutas/gestao` e `POST /adiantamentos/:docCod/processar`

- **Severidade**: P3
- **Tactic violada**: Scale Rollouts (canary)
- **Localização**: `src/backend/routes/permutas.ts` (rotas montadas incondicionalmente); `src/backend/index.ts:75-76`
- **Evidência (objetiva)**:
  ```
  index.ts:75    app.use('/permutas', heavyRouteLimiter);
  index.ts:76    app.use('/permutas', permutasRouter);
  ```
  As rotas novas (`GET /gestao`, `POST /adiantamentos/:docCod/processar`) ficam visíveis na hora do deploy para 100% dos usuários, sem `has_permutas_fase_b` ou similar.
- **Impacto técnico**: blast radius = todos os analistas; nenhum mecanismo de "ligar para um piloto antes". Para um deploy single-instance Render isso é aceitável, mas é o gap explicito a fechar quando a infra-alvo (Terraform multi-tenant) entrar.
- **Impacto de negócio**: rollback = redeploy + esperar Render (~2 min) em vez de toggle instantâneo.
- **Métrica de baseline**: 0 feature flags governando a Fase B.

## 5. Cards Kanban

### [deployability-1] Adicionar advisory lock ao MigrationRunner e consolidar UMA origem de migrações em produção

- **Problema**
  > Migrations rodam tanto no passo CI `npm run migrate` quanto no `bootstrapAppContainer` do Express. O runner não usa `pg_advisory_lock` — duas instâncias subindo em paralelo (cenário blue/green ou autoscale futuro) podem disparar `MigrationRunner.run()` simultâneo e abortar boot por PK duplicada em `schema_migrations`.
- **Melhoria Proposta**
  > 1) Envolver `MigrationRunner.run()` em `pg_try_advisory_lock(<hash>)` + `pg_advisory_unlock` (mesmo padrão usado em `PermutaRelationalRepository.persistIngestRun`). 2) Decidir UM caminho oficial: ou só CI (`appContainer.ts` apenas `init()` o pool) ou só boot. Recomendado: manter o passo CI como gate (fail-fast pré-deploy) e remover o `MigrationRunner.run()` de `appContainer.ts` (deixando apenas o `init()` do pool) — passo CI já bloqueia o deploy hook em caso de erro.
- **Resultado Esperado**
  > Migrations rodam exatamente 1x por deploy, com lock impedindo corrida. 2 caminhos → 1 caminho oficial; advisory lock presente.
- **Tactic alvo**: Idempotent deploys / Logical Grouping
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - caminhos de execução de migrate em produção: 2 → 1
  - advisory locks protegendo migrate: 0 → 1
- **Risco de não fazer**: incidente de boot quando o Render mover para multi-instância ou quando rodarmos blue/green (alvo Terraform já prevê isso)
- **Dependências**: nenhuma

### [deployability-2] Agendar o cron `job:ingest-permutas` em produção (Render Cron ou GitHub Actions `schedule`)

- **Problema**
  > A Fase B persiste fatos relacionais (`permuta_adiantamento`, `permuta_invoice`, `permuta_casamento`) consumidos por `GET /permutas/gestao`. A ingestão é executada apenas via `npm run job:ingest-permutas`, sem scheduler. O CRON line no header do job é só documentação; nenhum agendamento ativo significa que `/gestao` mostra vazio ou stale em prod.
- **Melhoria Proposta**
  > Curto prazo (estado atual Render): criar um **Render Cron Job** apontando para `npm run job:ingest-permutas` (`0 6 * * *` UTC) — outra opção é GitHub Actions `schedule` invocando a mesma rota via webhook protegido. Alvo (Lambda): EventBridge Rule + Lambda dedicado em `src/backend/lambda/job/ingestPermutas.ts` (já alinhado ao roadmap do CLAUDE.md). Atualizar `CHANGELOG.md` documentando o cron ativo.
- **Resultado Esperado**
  > Job dispara diariamente sem intervenção humana; `/gestao` reflete dados de D-1 ao começar o expediente Columbia.
- **Tactic alvo**: Script Deployment Commands / Physical Grouping
- **Severidade**: P1
- **Esforço estimado**: S (Render Cron) / M (EventBridge no alvo)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - cron agendado em prod: 0 → 1
  - latência de "mudança no Conexos" → "visível em /gestao": indefinida → ≤ 24h
- **Risco de não fazer**: a Fase B fica visualmente quebrada em produção; defeito percebido pelo cliente em vez da equipe
- **Dependências**: secret de conexão Postgres já existir no scheduler (já existe no Render para o web service)

### [deployability-3] Escrever runbook de rollback da Fase B no CHANGELOG/docs

- **Problema**
  > 0003 e 0004 são forward-only e aditivas. O app v0.2.0 (Fase A) ainda funciona após aplicar essas migrations porque o `/painel` segue lendo o snapshot legado. Mas isso não está documentado em lugar nenhum, então em incidente o operador pode reagir mal (ex.: `DROP TABLE permuta_casamento` durante pânico → quebra o próximo deploy).
- **Melhoria Proposta**
  > Adicionar seção "Rollback" em `CHANGELOG.md` para v0.3.0 da Fase B descrevendo: (a) redeploy do app anterior é seguro sem reverter schema; (b) se reversão de schema for exigida por compliance/limpeza, fornecer script `migrations/down/0003_permuta_relational_down.sql` (DROP em ordem inversa, com `IF EXISTS`). Adicionar `docs/runbooks/permutas-rollback.md` com passo-a-passo Render.
- **Resultado Esperado**
  > Operador tem instruções em 1 clique; MTTR de incidente reduzido.
- **Tactic alvo**: Rollback
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - runbooks Permutas Fase B: 0 → 1
- **Risco de não fazer**: incidente prolongado por hesitação do operador (ou pior: dano colateral por DDL improvisada)
- **Dependências**: nenhuma

### [deployability-4] Aplicar bump de versão lockstep (v0.2.0 → v0.3.0) + entrada no CHANGELOG antes de mergear a Fase B

- **Problema**
  > Esta Fase B é `feat` em `src/` (novo serviço, novas rotas, novas migrations). Pelas green-criteria #10 do CLAUDE.md, o pipe exige bump lockstep FE/BE para v0.3.0 + entrada no CHANGELOG no commit `chore(release): v0.3.0`. Hoje ambos `package.json` ainda estão em 0.2.0; o `/health` reportará versão errada em prod.
- **Melhoria Proposta**
  > Rodar `scripts/bump-version.ps1 -Execute -Bump minor` (ou equivalente), gerar commit `chore(release): v0.3.0` + atualizar `CHANGELOG.md` com a seção da Fase B (modelo relacional + ingestão + processamento + cron documentado). Garantir `ci.yml:tag-release` crie tag `v0.3.0` no push para main.
- **Resultado Esperado**
  > `/health.version` = `0.3.0` ≠ `0.2.0`; tag GitHub Releases `v0.3.0` criada; bisect e audit-trail viáveis.
- **Tactic alvo**: Reproducible builds / Deployment observability
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - versão FE/BE: 0.2.0 → 0.3.0
  - entradas no CHANGELOG.md: 2 → 3
  - tags publicadas: `v0.2.0` → `v0.2.0` + `v0.3.0`
- **Risco de não fazer**: a Inviolable Rule é violada; futuras releases ficam com numeração esticada/ambígua
- **Dependências**: nenhuma — é gate de PR

### [deployability-5] Tornar o smoke test pós-deploy mandatório (falhar o job se `RENDER_BACKEND_URL` ausente)

- **Problema**
  > O step "Smoke test deployed backend (/health)" usa `exit 0` quando o segredo está vazio, gerando apenas warning. Em uma feature como a Fase B que altera schema, smoke é o único sentinela pós-deploy — se for skipado, um erro de boot por migration pode passar batido até o cliente.
- **Melhoria Proposta**
  > Trocar o `exit 0` por `exit 1` quando o segredo faltar (no mínimo `::error::`). Documentar no `README.md` ou `docs/deploy.md` qual o nome do segredo. Opcionalmente, adicionar smoke test específico de Fase B: `GET /permutas/gestao` retornando 200/401 (não 500) — para confirmar que a query do novo repositório casa com o schema 0003.
- **Resultado Esperado**
  > Smoke test sempre roda; CI falha se segredo estiver ausente; opcionalmente endpoint Fase B é validado.
- **Tactic alvo**: Deployment observability
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - smoke obrigatório: ⚠️ skipa → ✅ mandatório
- **Risco de não fazer**: deploy verde com app quebrado; cliente reporta antes do dashboard
- **Dependências**: provisionar `RENDER_BACKEND_URL` (operação)

### [deployability-6] Proteger rotas Fase B com feature flag (`enable_permutas_fase_b`)

- **Problema**
  > `GET /permutas/gestao` e `POST /permutas/adiantamentos/:docCod/processar` são exibidas para 100% dos usuários no deploy. Não há toggle para liberar para um piloto antes — rollback exige redeploy do Render (~2 min).
- **Melhoria Proposta**
  > Adicionar flag `ENABLE_PERMUTAS_FASE_B` ao `EnvironmentProvider` e gatear o mount no `routes/permutas.ts`. Default = `true` em prd quando a feature for sancionada; ligar para 1 analista por vez no piloto. Quando a infra alvo (Terraform multi-tenant) chegar, esta flag vira `has_permutas_fase_b` por tenant — alinhado ao roadmap de 90 dias e ao padrão "Configure Behavior" do Bass.
- **Resultado Esperado**
  > Rollback de minutos → segundos; canary explicitamente possível por tenant/usuário.
- **Tactic alvo**: Scale Rollouts (canary)
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-6
- **Métricas de sucesso**:
  - feature flags governando módulos novos: 0 → 1
  - tempo de rollback de feature: ~2min (redeploy) → segundos (toggle)
- **Risco de não fazer**: zero canary; cada release vira "tudo ou nada" para a Columbia
- **Dependências**: idealmente aguardar [deployability-2] para evitar agendar cron contra schema desligado

## 6. Notas do agente

- Modo `--quick`: não rodei `npm run build`, então não há números de bundle (irrelevante hoje — tsc puro, sem esbuild bundling no backend; `npm install` no Render domina o tempo de deploy).
- **Cross-QA**: F-deployability-2 (cron não agendado) deve aparecer no relatório de Availability como gap de freshness; F-deployability-1 (race no MigrationRunner) é gêmeo de uma finding provável em Fault-Tolerance. F-deployability-4 (bump não feito) reflete em Testability/Modifiability — versão errada quebra rastreamento de issue→commit.
- Escopo limitado ao alvo do prompt (migrations 0003/0004, job ingestão, package.json, CI). Não cobri o RBAC nem a estrutura de routes Fase B — outro QA deve fazer.
- O `appContainer.ts` declara "fail-loud em produção" no comentário, mas a checagem é `env.environment === 'production'` (não `NODE_ENV`); confirmar que `EnvironmentProvider` retorna `production` no Render para que o `throw` não vire warn silencioso.
- A regra "Lambda only (alvo)" do CLAUDE.md está bem honrada: o job em `jobs/ingest-permutas.ts` foi escrito como entrypoint puro (não Express), reusando DI — pronto para virar Lambda handler quando a infra alvo existir. Bom sinal de Deployability "future-proof".
