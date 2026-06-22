---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-22-1658
agent: qa-deployability
generated_at: 2026-06-22T16:58:00-03:00
scope: all
score: 6.0
findings_count: 9
cards_count: 9
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor faz `git push origin main` (ou merge de PR) após CI verde | Backend Render auto-deploy é disparado pelo deploy hook, e o cron `ingest-permutas` passa a rodar a NOVA versão de `main` na próxima janela (09/15/21 UTC) contra o MESMO Supabase compartilhado com dev | `src/backend/` (Express em Render), `src/frontend/` (Next.js em Vercel), migrations `0001..0014_*.sql`, GitHub Actions cron 3×/dia | Produção, single-tenant (Columbia), 1 banco Supabase | preDeploy do Render aplica migrations idempotentes (`schema_migrations` + advisory lock no ingest), `/health` responde com `version` igual a `package.json`, traffic só comuta se build+migrate sobreviverem | Lead time commit→prd ≤ 15 min, deploy success ≥ 95%, MTTR rollback ≤ 5 min, 0 ingestões concorrentes via `concurrency.group: ingest-permutas` |

> Realidade hoje: lead time não medido; rollback é "Render → Manual Deploy → versão anterior" no painel (sem comando documentado); migrations são forward-only (sem `down`); o cron compartilha banco com dev e roda só a partir do branch `main` — coupling explícito documentado em `ingest-permutas.yml:7-9`.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Passos automatizados commit→prd (BE) | 6 (checkout, setup-node, `npm ci`, `npm audit`, typecheck, lint, test --coverage, build) — deploy é gatilho nativo do Render no push em `main`, fora do workflow | ≥ 5 com plan-before-apply ou equivalente | ✅ | `.github/workflows/ci.yml:17-28` |
| Passos automatizados commit→prd (FE) | 5 (checkout, setup-node, `npm ci`, typecheck, lint, test --coverage) — deploy via Vercel nativo | ≥ 5 | ✅ | `.github/workflows/ci.yml:37-46` |
| Job de deploy formal no CI (com gate plan-then-apply) | ausente — `render.yaml` confia em "GitHub branch protection" como gate (`render.yaml:13-16`); não há job `terraform plan` nem dry-run de migration | presente | ⚠️ | `.github/workflows/ci.yml` (sem job `deploy`) |
| Rollback de 1 comando documentado | ausente — `grep -rn "rollback" .github/ DEPLOY.md` → 0 hits | presente + runbook | ❌ | `DEPLOY.md` (não menciona rollback) |
| Migrations reversíveis (`down`) | 0/14 — todos os arquivos são forward-only DDL | ≥ política documentada (ex.: expand-contract) | ❌ | `src/backend/migrations/0001..0014_*.sql` |
| Drift detection (cron `terraform plan` ou equivalente para schema) | ausente — não há job de drift; o que existe é `concurrency.group: ingest-permutas` para evitar overlap, e advisory lock no ingest | presente | ❌ | `.github/workflows/ingest-permutas.yml:17-19` |
| Reprodutibilidade do build (lockfile) | `package-lock.json` BE+FE commitados; `npm ci` usado em CI e Render (`render.yaml:18`) | lockfile presente, `npm ci` em CI/CD | ✅ | `src/backend/package-lock.json`, `ci.yml:23`, `render.yaml:18` |
| Determinismo do bundle | `tsc && tsc-esm-fix dist` — sem timestamp/`Date.now` no bundle; SourceMap habilitado (`sourceMap: true`, `tsconfig.json:18`) | bundle determinístico | ✅ | `src/backend/package.json:9`, `tsconfig.json` |
| Build duration (BE) | 1,73 s (`time npm run build` local, dist `2.6M`) | ≤ 60 s | ✅ | `time cd src/backend && npm run build` |
| Idempotência das migrations | runner sequencial com `schema_migrations` (PRIMARY KEY no nome) + `INSERT` por arquivo — re-execução pula aplicados | idempotente | ✅ | `src/backend/migrations/runMigrations.ts:42-53` |
| Gate de pré-deploy de migration no Render | `preDeployCommand: npm run migrate && npm run seed:admin` (corta tráfego se falhar) | presente, com fail-fast | ✅ | `render.yaml:21` |
| Isolamento de DB por ambiente (dev vs prd) | ❌ DEV e cron de PRD apontam para o MESMO Supabase (Inviolable rule item: cron roda em main contra o banco compartilhado — gotcha documentada na MEMORY do dev) | dev/prd isolados | ❌ | `ingest-permutas.yml:30` lê `secrets.DATABASE_CONNECTION_STRING` (única) |
| Cobertura como gate (BE) | Floor: lines 72 / branches 54 / functions 78 (global), service: lines 88 / branches 60 | floor estável; raise quando coberto | ✅ | `src/backend/jest.config.cjs` (coverageThreshold) |
| Cobertura como gate (FE) | Floor: lines 75 / branches 40 / functions 55 (rebaixado em commit `cdb34f3`) | manter ou subir | ⚠️ | `src/frontend/jest.config.js:30-32` |
| Versionamento app FE+BE (lockstep) | `v0.4.0` ambos (cf. `package.json` FE+BE) — bump via `scripts/bump-version.ps1` (PowerShell **darwin/Linux precisam de `pwsh` instalado**) | bump portátil | ⚠️ | `scripts/bump-version.ps1:1` (shebang `#!/usr/bin/env pwsh`) |
| Endpoint de versão deployada | `GET /health → { status, version }` reflete `npm_package_version` | presente | ✅ | `src/backend/index.ts:62-63` |
| Tag/Release automatizado | `tag-release` job lê `frontend/package.json` em push para `main`, idempotente, cria tag `vX.Y.Z` + GitHub Release | presente | ✅ | `ci.yml:48-73` |
| Cron coupling com branch `main` | Comentário explícito: `Schedules do GitHub Actions só disparam a partir do BRANCH PADRÃO (main)` — significa que **toda janela 09/15/21 UTC executa o HEAD de `main`**, sem stage intermediário | dev/stg/prd separados | ❌ | `.github/workflows/ingest-permutas.yml:7-9` |
| Concurrency-control no cron | `concurrency.group: ingest-permutas, cancel-in-progress: false` + advisory lock (`IngestLockBusyError`) | presente | ✅ | `ingest-permutas.yml:17-19`, `domain/errors/IngestLockBusyError.ts` |
| Runbook de incidente de deploy | ausente — `docs/onboarding/pipeline-bpmn/` cobre pipeline de feature, não incident response; `DEPLOY.md` é checklist de setup | presente p/ DB down, Conexos down, deploy failed, migration travada | ❌ | inexistente |
| Surge protection (rate-limit ainda durante deploy) | `globalLimiter` + `heavyRouteLimiter` em `/conexos` e `/permutas` aplicados sempre | presente | ✅ | `src/backend/index.ts:30,80,87` |

> ⚠️ **Não medível localmente**: deploy success rate, lead time real, MTTR. Requer telemetria do Render (Deploy Events API) e Vercel (Deployments API). Recomendação: scrape periódico via cron Action que emita os números para um README badge ou observability storage.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Deployment Pipeline — Scale Rollouts (canary / blue-green / rolling) | Render auto-deploy é **all-at-once em um único service** (`plan: starter`, single instance); Vercel faz atomic switch (preview/prod), mas sem canary explícito | ❌ ausente | `render.yaml:11` (`autoDeploy: true`), sem `strategy` |
| Manage Deployment Pipeline — Rollback | Render mantém histórico e permite "Manual Deploy → previous"; **não há comando/runbook** nem migration `down`; lockstep FE/BE força revisitar 2 paineis | ⚠️ parcial | Console-driven; `0/14` migrations reversíveis; `DEPLOY.md` silencia |
| Manage Deployment Pipeline — Script Deployment Commands | `render.yaml` declara build/pre-deploy/start commands; `ci.yml` declara checks; `bump-version.ps1` automatiza semver | ⚠️ parcial (PowerShell num projeto darwin/Linux quebra portabilidade) | `render.yaml:18-22`, `ci.yml`, `scripts/bump-version.ps1:1` |
| Manage Deployment Pipeline — Deployment Pipeline (CI) | CI obrigatório com `npm ci` + audit + typecheck + lint + test --coverage + build em ambos os apps; tag idempotente em push para main | ✅ presente | `.github/workflows/ci.yml` |
| Manage Deployment Pipeline — Test Harness (pre-deploy) | `coverageThreshold` ativos como gate (BE: lines 72 / branches 54 / functions 78; FE: lines 75 / branches 40 / functions 55) | ✅ presente, ⚠️ FE floor baixo | `src/backend/jest.config.cjs`, `src/frontend/jest.config.js` |
| Manage Deployed System — Logical Grouping | FE (Vercel) e BE (Render) e DB (Supabase) são serviços distintos com fronteira clara; um `service` por `render.yaml` | ✅ presente | `render.yaml:5-9` |
| Manage Deployed System — Physical Grouping | N/A na prática — single instance no Render (`plan: starter`); o "alvo" (Lambda por tenant) não existe ainda | N/A | `render.yaml:10` (`plan: starter`) |
| Manage Deployed System — Package Dependencies | `package-lock.json` commitado em ambos; `npm ci` em CI e em `render.yaml`; `npm audit --audit-level=high` como gate | ✅ presente | `ci.yml:23-24`, `render.yaml:18` |
| Manage Deployed System — Surge Protection | `globalLimiter` + `heavyRouteLimiter` em `/conexos`, `/permutas`; advisory lock no ingest; `concurrency` no workflow | ✅ presente | `src/backend/index.ts:30,80,87`, `ingest-permutas.yml:17-19` |
| Manage Deployed System — Service Mesh / Circuit Breaker (Configuration) | N/A no estado atual — Express monolítico, sem mesh; integrações externas (Conexos) usam `RetryExecutor`/`FallbackExecutor`, tactic mapeada em fault-tolerance | N/A | — |
| Idempotent deploys | Render `preDeployCommand: npm run migrate` (idempotente por `schema_migrations`); `tag-release` job é "tag exists? exit 0"; `seed:admin` é UPSERT por `username` | ✅ presente | `runMigrations.ts:42-53`, `ci.yml:66-69`, `DEPLOY.md:93` |
| Drift detection (schema/infra) | ausente — nenhuma rotina compara `pg_catalog` com migrations aplicadas; nenhuma rotina detecta secret rotation | ❌ ausente | sem workflow |
| Reproducible builds | lockfile + `npm ci` + `tsc` (sem timestamp em output); `tsc-esm-fix` é função pura sobre AST | ✅ presente | `src/backend/package.json:9`, `tsconfig.json` |
| Per-tenant blast-radius limit | N/A — Columbia é o único tenant; "isolar por conta AWS" é estado-alvo (`CLAUDE.md §Tenants`: vazio) | N/A | `CLAUDE.md` |
| Deployment observability | `/health` retorna versão deployada; logs estruturados em stdout do Render (`[REQ]`/`[RES]` com `requestId`); SEM SLO de deploy, SEM alarme de failed deploy → Slack/email | ⚠️ parcial | `src/backend/index.ts:38-56,63` |
| Versioning de artefato | Tag git `vX.Y.Z` automática + Release; `/health` espelha; FE+BE lockstep | ✅ presente | `ci.yml:48-73`, `bump-version.ps1` |

## 4. Findings (achados)

### F-deployability-1: Cron `ingest-permutas` em `main` compartilha banco com dev (gotcha documentada, não mitigada)

- **Severidade**: P0
- **Tactic violada**: Manage Deployed System — Logical Grouping (dev/prd não isolados)
- **Localização**: `.github/workflows/ingest-permutas.yml:7-9,30`; `DEPLOY.md` (sem isolamento de DB documentado)
- **Evidência (objetiva)**:
  ```yaml
  # ingest-permutas.yml:7-9
  # ⚠️ Schedules do GitHub Actions só disparam a partir do BRANCH PADRÃO (main).
  # Enquanto este arquivo não estiver em `main`, use o "Run workflow" manual

  # ingest-permutas.yml:30
  databaseConnectionString: ${{ secrets.DATABASE_CONNECTION_STRING }}
  ```
  Não existe `DATABASE_CONNECTION_STRING_DEV`/`_PRD`; o `.env` local (dev) e o secret do GitHub Actions (cron de prd) podem apontar para o mesmo Supabase (a MEMORY do dev e o resumo do reviewer confirmam o coupling).
- **Impacto técnico**: ingestão 3×/dia escreve em `permuta_eleicao_run`, `adiantamento`, `invoice`, `permuta_alocacao` enquanto o desenvolvedor testa local; advisory lock evita corrida, mas dados de teste podem mascarar fatos reais (e vice-versa). Migration nova em dev exposta antes do merge altera schema usado em prd.
- **Impacto de negócio**: comprometimento da auditoria (campo `triggered_by='cron'` x manual fica indistinguível por instância), risco de incidente "achei que era dev mas era prd" — exatamente o cenário que justifica a tactic. Em compliance financeiro, contaminação de ambiente é P0.
- **Métrica de baseline**: 1 conexão de DB declarada em `ingest-permutas.yml` para 2 ambientes lógicos (dev + cron prd); 14 migrations forward-only aplicadas no mesmo schema.

### F-deployability-2: Sem rollback de 1 comando nem migration reversível

- **Severidade**: P0
- **Tactic violada**: Manage Deployment Pipeline — Rollback
- **Localização**: `DEPLOY.md` (silente); `src/backend/migrations/0001..0014_*.sql` (todos forward-only); `src/backend/migrations/runMigrations.ts` (sem método `down`)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "rollback\|previous_version\|redeploy" .github/ DEPLOY.md
  (zero matches)
  ```
  `MigrationRunner.run` aplica `.sql` na ordem; não existe contraparte `0014_down.sql` nem coluna `reversible` em `schema_migrations`.
- **Impacto técnico**: rollback em incidente exige: (a) operador entrar no painel Render → "Manual Deploy → previous"; (b) reverter manualmente DDL aplicado (sem script). Se uma migration adicionar coluna `NOT NULL`, retornar à versão anterior em produção quebra (binding incompatível).
- **Impacto de negócio**: MTTR de rollback subentendido em **dezenas de minutos** (operador localiza painel + reverte DDL manual). Para Permutas, janela maior = mais decisões manuais retidas no analista.
- **Métrica de baseline**: 0/14 migrations com `down`; 0 hits para "rollback" em `.github/` ou `DEPLOY.md`; tempo de rollback estimado > 15 min.

### F-deployability-3: `bump-version.ps1` é PowerShell em projeto darwin/Linux

- **Severidade**: P1
- **Tactic violada**: Manage Deployment Pipeline — Script Deployment Commands (portabilidade)
- **Localização**: `scripts/bump-version.ps1:1` (`#!/usr/bin/env pwsh`)
- **Evidência (objetiva)**:
  ```
  #!/usr/bin/env pwsh
  ```
  O reviewer roda em darwin 25.5.0; `pwsh` não é dependência de runtime declarada em `package.json` nem em CI. `CLAUDE.md §Green criteria item 10` exige bump por semver — mas o script só roda se o dev tiver `pwsh` instalado, criando barreira **e** rota silenciosa (skip do bump).
- **Impacto técnico**: pipeline `AutoLoopRunner` no fase Ship não bumpa versão em macOS/Linux sem `pwsh`; risco de PRs sem `chore(release):` e tags fora de `/health`.
- **Impacto de negócio**: desalinhamento entre versão deployada e `package.json` quebra a observabilidade de deploy (operador não consegue dizer "estou na v0.4.1 ou v0.4.0?" pelo `/health`).
- **Métrica de baseline**: 1 dependência externa não-declarada (`pwsh`) para um gate obrigatório do pipeline (Green criteria #10).

### F-deployability-4: Sem job formal de deploy no CI — gate é "branch protection"

- **Severidade**: P1
- **Tactic violada**: Manage Deployment Pipeline — Deployment Pipeline (orquestração)
- **Localização**: `.github/workflows/ci.yml` (sem job `deploy`); `render.yaml:13-16` (autoDeploy via push)
- **Evidência (objetiva)**:
  ```yaml
  # render.yaml:13-16
  # Native auto-deploy on push to `main`. The gate is GitHub branch protection
  # (CI `Backend`/`Frontend` checks required to merge), so only tested code
  # reaches `main` and gets deployed.
  ```
  O deploy é disparado pelo Render quando o push chega em `main`, **fora** do GitHub Actions. Não há etapa "promote dev → stg → prd"; CI e deploy são processos paralelos sem barreira de promoção.
- **Impacto técnico**: se branch protection for desabilitada inadvertidamente (ou se admin force-push), código não testado vai a prd. Sem job `deploy`, não há audit log em GitHub Actions; histórico de "quando foi deployado o quê" mora só no Render.
- **Impacto de negócio**: dependência total de configuração externa (settings do GitHub) para garantia de qualidade; quebra a heurística "CI artifact == deploy artifact". Auditoria fiscal pede esse rastro.
- **Métrica de baseline**: 0 jobs de deploy no CI; 1 ponto de configuração fora-do-repo (branch protection) governa a deployability.

### F-deployability-5: Sem drift detection (schema, secrets, infra)

- **Severidade**: P1
- **Tactic violada**: Drift detection
- **Localização**: ausência em `.github/workflows/`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "drift\|terraform plan\|schema diff" .github/
  (zero matches)
  ```
- **Impacto técnico**: se DBA roda DDL ad-hoc no Supabase (ou o painel Supabase aplica migrations próprias do Auth), `migrations/*.sql` deixa de descrever o estado real. Nenhuma rotina detecta divergência.
- **Impacto de negócio**: deploy futuro pode falhar com `relation already exists` ou pior — sucesso silencioso com schema deformado. Em integração financeira, schema drift gera relatórios inconsistentes.
- **Métrica de baseline**: 0 rotinas de drift; 1 banco compartilhado dev/prd (ver F-deployability-1) amplifica o risco.

### F-deployability-6: Cobertura FE como gate está baixa (branches 40, functions 55)

- **Severidade**: P2
- **Tactic violada**: Manage Deployment Pipeline — Test Harness (rigor)
- **Localização**: `src/frontend/jest.config.js:30-32` (commit `cdb34f3` rebaixou floors)
- **Evidência (objetiva)**:
  ```js
  // jest.config.js:30-32
  lines: 75,
  branches: 40,
  functions: 55,
  ```
- **Impacto técnico**: lógica condicional do frontend (filtros de cliente, decisões de UI de alocação) pode mergear sem cobertura — bug de render ou estado escapa para prd e só aparece quando o analista usa.
- **Impacto de negócio**: regressões silenciosas em telas de Permutas (frente única operacional hoje) — analista perde confiança na ferramenta, retorna ao manual.
- **Métrica de baseline**: branches 40% (vs. 54% no backend; comum no setor: ≥ 70% para FE com lógica de negócio).

### F-deployability-7: Sem runbook de incidente / DB down / Conexos down

- **Severidade**: P2
- **Tactic violada**: Deployment observability (resposta operacional)
- **Localização**: `docs/onboarding/` cobre só pipeline-bpmn; `DEPLOY.md` é checklist de setup
- **Evidência (objetiva)**:
  ```
  $ find docs/ -iname "runbook*" -o -iname "incident*"
  (zero matches)
  ```
- **Impacto técnico**: quando o `/health` retornar 500 ou o cron `ingest-permutas` falhar 3×, não há documento dizendo "verifique Supabase status, verifique Conexos, verifique advisory lock". MTTR depende de memória institucional.
- **Impacto de negócio**: ingestão de Permutas é diária e bloqueia decisões do analista; sem runbook, recuperação é ad-hoc.
- **Métrica de baseline**: 0 runbooks documentados; 4 modos de falha óbvios (DB down, Conexos down, advisory lock travado, migration falhou no preDeploy).

### F-deployability-8: Single-tenant fixo, sem feature flags para evitar all-or-nothing

- **Severidade**: P2
- **Tactic violada**: Manage Deployment Pipeline — Scale Rollouts (canary capability)
- **Localização**: `src/backend/index.ts:81-88` (todas as rotas Permutas montadas; sem flag); `src/backend/jobs/ingest-permutas.ts` (sem `if (FEATURE_INGEST_ENABLED)`)
- **Evidência (objetiva)**: `grep -rn "FEATURE_\|FLAG_\|has_" src/backend/` retorna apenas variáveis de domínio, não toggles de release.
- **Impacto técnico**: roadmap das 3 frentes (Permutas / SISPAG / Popula GED) terá que entrar em prd "tudo ou nada" — não dá para deployar SISPAG inativo e habilitar via flag por analista.
- **Impacto de negócio**: bloqueia o plano sequencial de 90 dias descrito na proposta. Cada frente futura precisará de janela de deploy dedicada.
- **Métrica de baseline**: 0 feature flags governando ativação de rotas/jobs.

### F-deployability-9: Cron prd está acoplado ao branch `main` (sem stage)

- **Severidade**: P1
- **Tactic violada**: Manage Deployment Pipeline — Scale Rollouts (sem ambiente stg)
- **Localização**: `.github/workflows/ingest-permutas.yml:7-9` (comentário explícito)
- **Evidência (objetiva)**:
  ```yaml
  # ⚠️ Schedules do GitHub Actions só disparam a partir do BRANCH PADRÃO (main).
  ```
  Não há `ingest-permutas-dev.yml` em branch `dev`; merge em `main` significa "o próximo cron 09/15/21 UTC executa este código contra prd-Supabase".
- **Impacto técnico**: change em `IngestaoPermutasService` que passe nos unit tests mas falhe contra dados Conexos reais só é detectada após primeiro cron pós-merge. Sem stage para validar contra dados de produção sem afetar prd.
- **Impacto de negócio**: bug em distribuição greedy ou cliente-filtro afeta dados reais antes de validação — analista descobre na próxima manhã.
- **Métrica de baseline**: 1 ambiente (main → prd); 0 ambientes intermediários; 3 execuções diárias automáticas como blast radius.

## 5. Cards Kanban

### [deployability-1] Isolar Supabase por ambiente (dev vs prd) e quebrar o coupling do cron

- **Problema**
  > O cron `ingest-permutas` roda 3×/dia o HEAD de `main` contra o MESMO Supabase que o dev usa em `.env`. Advisory lock evita corrida, mas dados de teste/manual e dados de cron ficam misturados; auditoria perde a fronteira; mudança de schema em dev expõe prd a estado inconsistente.

- **Melhoria Proposta**
  > Criar projeto Supabase `financeiro-dev` separado do `financeiro-prd`. Trocar o secret `DATABASE_CONNECTION_STRING` no GitHub Actions para apontar **só** ao prd; documentar em `DEPLOY.md` que `.env` local usa `financeiro-dev`. Adicionar `vars.ENVIRONMENT_LABEL` (dev/prd) que o backend exibe no `/health` para fechar o loop de verificação. Tactic alvo: **Logical Grouping**.

- **Resultado Esperado**
  > Dev e prd isolados; `/health` indica em qual ambiente está; auditoria por `triggered_by='cron'` volta a representar só execuções reais. Métrica: 1 banco compartilhado → 2 bancos isolados.

- **Tactic alvo**: Manage Deployed System — Logical Grouping
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-1, F-deployability-5, F-deployability-9
- **Métricas de sucesso**:
  - DBs compartilhados dev/prd: 1 → 0
  - `/health` expõe ambiente: ausente → presente
- **Risco de não fazer**: contaminação dev↔prd em incidente de auditoria fiscal; rollback de schema em prd reverte dado de dev junto.
- **Dependências**: nenhuma (custo Supabase de um projeto extra é trivial).

### [deployability-2] Implementar rollback de 1 comando + política de migration reversível

- **Problema**
  > Não há rollback documentado (`grep` por "rollback" em `.github/`/`DEPLOY.md` retorna 0); todas as 14 migrations são forward-only. Em incidente, operador precisa entrar no painel Render manualmente e reverter DDL na mão.

- **Melhoria Proposta**
  > Adicionar `scripts/rollback.sh` que: (a) chama Render API para promover deploy anterior; (b) opcionalmente aplica `migrations/*_down.sql` correspondente. Estabelecer política **expand-contract** documentada (toda DDL nova é additive; remoção vem em deploy posterior). Tactic alvo: **Rollback**.

- **Resultado Esperado**
  > MTTR de rollback ≤ 5 min; runbook descreve o comando único. Métrica: 0 migrations reversíveis → política aplicada às próximas (sem retroatividade obrigatória).

- **Tactic alvo**: Manage Deployment Pipeline — Rollback
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-2, F-deployability-7
- **Métricas de sucesso**:
  - Rollback de 1 comando: ausente → presente
  - Política expand-contract documentada: ausente → presente em `DEPLOY.md`
- **Risco de não fazer**: incidente fora-de-horário leva > 30 min para mitigar; equipe noturna sem playbook.
- **Dependências**: deployability-1 (rollback de schema só faz sentido com ambientes isolados).

### [deployability-3] Portar `bump-version.ps1` para Node ou shell POSIX

- **Problema**
  > `scripts/bump-version.ps1` é PowerShell num projeto que roda em darwin/Linux; reviewer (darwin 25.5.0) precisa de `pwsh` instalado, não declarado em `package.json`. Quebra a portabilidade do gate obrigatório do `AutoLoopRunner` (Green criteria #10).

- **Melhoria Proposta**
  > Reescrever como `scripts/bump-version.mjs` (Node nativo, já é a runtime do repo) — mesma lógica: lê commits, deriva semver, atualiza FE+BE+CHANGELOG. Atualizar referências em `CLAUDE.md` e pipeline. Tactic alvo: **Script Deployment Commands**.

- **Resultado Esperado**
  > Bump roda em qualquer dev sem dependência externa; `node scripts/bump-version.mjs` é a invocação canônica.

- **Tactic alvo**: Manage Deployment Pipeline — Script Deployment Commands
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - Deps externas não-declaradas para bump: 1 (pwsh) → 0
  - Dev `npm ci` && roda bump: hoje quebra → roda
- **Risco de não fazer**: PRs sem `chore(release):` virarem norma em macOS/Linux; `/health` deixa de refletir versão.
- **Dependências**: nenhuma.

### [deployability-4] Criar job `deploy` formal no CI (audit trail dentro do repo)

- **Problema**
  > `render.yaml` confia em "GitHub branch protection" como gate; CI não tem job `deploy`. Histórico de "quando foi deployado o quê" vive apenas no painel do Render — fora do GitHub Actions e fora de auditoria do repo.

- **Melhoria Proposta**
  > Acrescentar job `deploy-backend` em `ci.yml` que, em push para `main` (após `backend`/`frontend` verdes), chama a Render Deploy Hook API e aguarda o status. Análogo para `deploy-frontend` via Vercel API. Resultado: `gh run list` mostra deploy junto com tests. Tactic alvo: **Deployment Pipeline**.

- **Resultado Esperado**
  > Cada deploy tem um GitHub Actions run vinculado; `tag-release` passa a usar o `run_id` desse job na release notes.

- **Tactic alvo**: Manage Deployment Pipeline — Deployment Pipeline
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - Jobs de deploy no CI: 0 → 2 (BE + FE)
  - Audit trail no repo: ausente → presente
- **Risco de não fazer**: desconfig de branch protection (humano) destrava deploy direto; nenhuma trilha no repo.
- **Dependências**: deployability-1 (deploy precisa saber em qual ambiente está atuando).

### [deployability-5] Drift detection diária: comparar `schema_migrations` × `information_schema`

- **Problema**
  > Não há rotina que detecte schema drift; DDL ad-hoc no Supabase (ou Supabase Auth aplicando suas próprias migrations) deixa o repo descrevendo um estado fictício.

- **Melhoria Proposta**
  > Workflow `drift-detect.yml` cron diário (06:00 UTC) que (a) `SELECT name FROM schema_migrations` e compara com `migrations/*.sql`; (b) usa `pg_dump --schema-only` e diff contra um snapshot commitado em `migrations/_schema-snapshot.sql`. Falha do job abre issue automaticamente. Tactic alvo: **Drift detection**.

- **Resultado Esperado**
  > Drift detectado em ≤ 24h; alerta GitHub Issue automático com diff.

- **Tactic alvo**: Drift detection
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - Rotinas de drift: 0 → 1
  - Schema snapshot commitado: ausente → presente
- **Risco de não fazer**: surpresa em deploy futuro com `relation already exists` ou pior — sucesso com schema fora do controle.
- **Dependências**: deployability-1.

### [deployability-6] Subir floor de cobertura FE (branches 40 → 60, functions 55 → 70)

- **Problema**
  > FE jest floor está em branches 40 / functions 55 — abaixo do que a literatura considera defensável para um app com lógica de filtro/alocação. Foi rebaixado em commit `cdb34f3`.

- **Melhoria Proposta**
  > Identificar componentes de menor cobertura via `coverage/lcov-report`; testar fluxos de alocação manual (Fase 2 de Permutas) e cliente-filtro. Subir floor progressivamente. Tactic alvo: **Test Harness**.

- **Resultado Esperado**
  > Floor FE: branches 40 → 60, functions 55 → 70 em 2 sprints.

- **Tactic alvo**: Manage Deployment Pipeline — Test Harness
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-6
- **Métricas de sucesso**:
  - FE branches floor: 40 → 60
  - FE functions floor: 55 → 70
- **Risco de não fazer**: regressões silenciosas em UI de Permutas erodem confiança do analista — única frente operacional.
- **Dependências**: nenhuma.

### [deployability-7] Escrever runbook em `docs/runbooks/` para top-4 modos de falha

- **Problema**
  > Não há runbook (`find docs -iname "runbook*"` retorna 0). Os 4 modos óbvios — DB down, Conexos down, advisory lock travado, migration falhou no preDeploy — não têm playbook documentado.

- **Melhoria Proposta**
  > Criar `docs/runbooks/{db-down.md,conexos-down.md,ingest-stuck.md,migration-failed.md}` com: sintoma, diagnóstico (queries/curl), mitigação, comando de rollback (referencia card deployability-2). Tactic alvo: **Deployment observability**.

- **Resultado Esperado**
  > MTTR para os 4 cenários reduz para ≤ 15 min; operador noturno autossuficiente.

- **Tactic alvo**: Deployment observability
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-7
- **Métricas de sucesso**:
  - Runbooks publicados: 0 → 4
  - Cobertura de modos de falha conhecidos: 0% → 100% dos 4 principais
- **Risco de não fazer**: cada incidente vira investigação ad-hoc; conhecimento fica em mensagens de Slack.
- **Dependências**: deployability-2 (runbook referencia rollback).

### [deployability-8] Introduzir feature flags para ativação de frentes (SISPAG, Popula GED)

- **Problema**
  > Hoje todas as rotas Permutas estão montadas em `index.ts:81-88`; sem flag. Roadmap de 3 frentes (Permutas, SISPAG, Popula GED) precisa deployar uma de cada vez. Sem flag, ou se deploya tudo, ou se gerencia branches longos.

- **Melhoria Proposta**
  > `EnvironmentProvider.featureFlags()` lê `FEATURE_SISPAG`, `FEATURE_POPULA_GED` de env. `index.ts` monta routers condicionalmente; `ingest-*` jobs verificam flag antes de rodar. Tactic alvo: **Scale Rollouts** (canary capability).

- **Resultado Esperado**
  > Cada frente futura pode estar em `main` em estado "dark"; operador habilita por env var sem novo deploy.

- **Tactic alvo**: Manage Deployment Pipeline — Scale Rollouts
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-8
- **Métricas de sucesso**:
  - Feature flags ativos: 0 → ≥ 2 (sispag, popula_ged)
  - Deploys de frente sem flag intermediário: hoje N/A → 0 após adoção
- **Risco de não fazer**: SISPAG e Popula GED competem com Permutas pelo mesmo deploy window — atrapalham roadmap sequencial.
- **Dependências**: nenhuma.

### [deployability-9] Criar branch/ambiente `stg` para o cron antes do `main`

- **Problema**
  > Cron `ingest-permutas` só executa a partir de `main`; toda mudança em `IngestaoPermutasService` que sobreviva ao unit test vai a prd no próximo 09/15/21 UTC sem validação contra Conexos real intermediária.

- **Melhoria Proposta**
  > Duplicar workflow para `ingest-permutas-stg.yml` no branch `stg` apontando ao Supabase `financeiro-stg`. Promotion `stg → main` requer 1 ciclo completo (24h ou manual aprovação). Tactic alvo: **Scale Rollouts** (stage gating).

- **Resultado Esperado**
  > Bug em greedy/cliente-filtro pego em stg antes de prd.

- **Tactic alvo**: Manage Deployment Pipeline — Scale Rollouts
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-9
- **Métricas de sucesso**:
  - Ambientes de cron: 1 (main→prd) → 2 (stg + prd)
  - Bugs de ingestão pegos em stg: 0 → ≥ 1/trimestre
- **Risco de não fazer**: regressão de cron afeta auditoria do dia seguinte; analista descobre pelo dado errado.
- **Dependências**: deployability-1 (ambientes isolados).

## 6. Notas do agente

- Cross-QA detectado: F-deployability-1 (banco compartilhado) deve ressoar em **Security** (segregação de dados sensíveis) e **Fault-Tolerance** (blast radius de bug). F-deployability-2 (rollback ausente) é primo de **Availability** (MTTR). F-deployability-8 (sem feature flag) também impacta **Modifiability**.
- "Infra" Terraform do template foi tratada como estado-alvo (CLAUDE.md confirma); a avaliação aqui foca no real (Render + Vercel + Supabase + GitHub Actions). Tactics que não fazem sentido sem Terraform (Per-tenant blast-radius, Physical Grouping) ficaram `N/A` com justificativa.
- Não foi possível medir lead time, deploy success rate ou MTTR localmente — depende de Render Deploy Events / Vercel Deployments API. Recomendado scrape periódico documentado no card de runbook.
- Score 6.0: gates de CI sólidos e `preDeployCommand` idempotente puxam para cima; ausência de rollback documentado, banco compartilhado e cron-on-main puxam para baixo.
