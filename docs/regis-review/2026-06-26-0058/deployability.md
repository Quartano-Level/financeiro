---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-26-0058
agent: qa-deployability
generated_at: 2026-06-26T00:58:00-03:00
scope: all
score: 4
findings_count: 9
cards_count: 9
---

# Deployability — Regis-Review

> **Contexto real (lido em `render.yaml`, `DEPLOY.md`, `.github/workflows/`):** o "alvo" Lambda + Terraform descrito em `CLAUDE.md` **não existe** — `infra/` não existe, sem AWS, sem SSM em prod. Deploy de produção é **Render** (`render.yaml`, backend Express, `autoDeploy: true` na `main`) + **Vercel** (frontend Next.js, manual via `npx vercel --prod` ou integração Git) + **Supabase** (Postgres). CI (`.github/workflows/ci.yml`) só roda **gates** (typecheck/lint/test/`npm audit`/build) — NÃO existe job de deploy. Versionamento FE+BE em lockstep via `scripts/bump-version.ps1` (PowerShell-only). Métricas de runtime (MTTR, lead-time real, success-rate de deploy) **não medíveis localmente**; tudo abaixo deriva de evidências estáticas no repo.

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev (push em `main` aprovado em PR) | Merge de fix urgente em `fin010` write-path (escrita financeira no Conexos) | `src/backend/**` (rebuild Render) + `src/frontend/**` (rebuild Vercel, manual) | Produção single-region (Render+Vercel+Supabase), 24/7, escrita ERP gated por `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` (`docs/runbooks/fin010-write-cutover.md:7-17`) | Build + `preDeployCommand` (migrate + seed-admin) + healthCheck `/health` → Render promove novo container; se falhar, mantém versão anterior; rollback de migration = manual (sem `down`); rollback de baixa financeira gravada = **manual no UI do `fin010`** (`docs/runbooks/fin010-write-cutover.md:36-40`) | Lead-time commit→prd ≤ 10 min para BE; **deploy success rate** desconhecido (sem telemetria); rollback automático: **não** (apenas re-push do commit anterior, sem rota one-click); MTTR P95 estimado **>30 min** se a regressão tocar escrita ERP (cancelar borderô caso a caso na UI do Conexos) |

> ⚠️ **Não medível localmente:** lead-time real (precisa Render API), taxa de sucesso de deploy (Render dashboard), MTTR, frequência de rollback (não há histórico instrumentado). Recomendação: instrumentar webhook de deploy Render → tabela `deploy_event` para baseline.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| # de etapas automatizadas commit→prd (BE) | **6** (checkout · setup-node · `npm ci` · audit · typecheck · lint · test · build) + Render autoDeploy + preDeploy migrate | ≥6 com smoke-test pós-deploy | ⚠️ | `.github/workflows/ci.yml:9-28`, `render.yaml:17-21` |
| Job de deploy no CI | **0** (CI só roda gates; deploy é responsabilidade do Render via webhook) | 1 (controlado por CI com rollback explícito) | ⚠️ | `.github/workflows/ci.yml` (ausência de job deploy) |
| Verificação pós-deploy (smoke test) | **ausente** — `healthCheckPath: /health` é do Render; nenhum job CI chama `GET /health` após o deploy nem assert no `version` retornado | smoke `GET /health` + asserção de `version == TAG` no CI | ❌ | `render.yaml:22`, `src/backend/index.ts:65` |
| Tactic **Rollback** automatizado | **ausente** — Render não tem alias/versioning; rollback = re-push do SHA anterior + esperar ~3–5 min de rebuild; escrita `fin010` não tem rollback programático (estorno manual no ERP) | One-command rollback < 2 min | ❌ | `render.yaml`, `docs/runbooks/fin010-write-cutover.md:36-40` |
| Tactic **Scale Rollouts** (canary/blue-green/staged) | **ausente** — single Render service, single Vercel project, sem env staging permanente; "homologação" do fin010 é flip manual de flag no MESMO container (`docs/runbooks/fin010-write-cutover.md:21-26`) | Staging permanente + flip canary | ❌ | `render.yaml:5-22`, `docs/runbooks/fin010-write-cutover.md` |
| **Script Deployment Commands** cross-platform | **PowerShell-only** — `scripts/bump-version.ps1` (require `pwsh`) e `scripts/cleanup-worktrees.ps1` | bash-compatível ou rodar via CI | ❌ | `scripts/bump-version.ps1:1`, `scripts/cleanup-worktrees.ps1:1` |
| **Idempotent deploy** (migrations + seed) | ✅ idempotente — `MigrationRunner` consulta `schema_migrations` antes de aplicar; `seed:admin` é UPSERT | manter | ✅ | `src/backend/migrations/runMigrations.ts:34-55`, `src/backend/jobs/seed-admin.ts:18-31` |
| **Reproducible builds** (lockfile + `npm ci`) | ✅ lockfile commitado, CI usa `npm ci` com cache | manter | ✅ | `src/backend/package-lock.json` (presente), `.github/workflows/ci.yml:23` |
| **Pinned runtime** (Node version) | ❌ **DRIFT** — CI usa `node 24` (`ci.yml:20,40`), workflow de ingestão usa `node 22` (`ingest-permutas.yml:41`), Render herda o default do plan, sem `.nvmrc` nem `engines` em `package.json` | Único Node em CI + Render + dev, declarado em `.nvmrc`/`engines` | ❌ | `.github/workflows/ci.yml:20`, `.github/workflows/ingest-permutas.yml:41`, `src/backend/package.json` (sem `engines`) |
| Tempo de build BE (`tsc && tsc-esm-fix`) | **~2.1 s real** (medido local `time npm run build` → 2.073 total) | ≤30 s | ✅ | `time npm run build` em `src/backend` |
| Tamanho do `dist/` BE | **3.3 MB** (131 arquivos JS) | ≤50 MB | ✅ | `du -sh src/backend/dist` |
| Tamanho do build FE (`.next`) | **793 MB** (inclui cache de build do Next) | <1 GB local OK | ⚠️ | `du -sh src/frontend/.next` |
| Tactic **Logical Grouping** (separar cron de API) | ✅ ingestão de Permutas roda em **GitHub Actions cron** (3×/dia BRT), não no Render web service | manter | ✅ | `.github/workflows/ingest-permutas.yml:10-14` |
| Tactic **Physical Grouping** (instâncias dedicadas) | N/A — Render starter = 1 instância única; SaaSo "multi-tenant" é alvo, não realidade | (alvo) | N/A | `render.yaml:8-9` |
| Tactic **Package Dependencies** (lockfile + audit) | ✅ BE roda `npm audit --audit-level=high`; ❌ FE **não** roda audit | rodar audit nos dois | ⚠️ | `.github/workflows/ci.yml:24` (BE), `ci.yml:30-46` (FE sem audit) |
| Tactic **Surge Protection** (auto-deploy gate) | ⚠️ parcial — gate = branch protection (CI verde para merge); sem rate de deploy nem cooldown | manter (gate é razoável) | ⚠️ | `render.yaml:14-17` |
| Drift detection (config/infra) | N/A para Terraform (não há); ✅ **`render.yaml` declarativo** + nota explícita "FONTE ÚNICA = dashboard do Render (`sync:false`)" para flags de escrita ERP — evita yaml brigando com dashboard | manter; documentar quais chaves são dashboard-only | ✅ | `render.yaml:32-40` |
| Tag/Release automático na `main` | ✅ job `Tag Release` cria tag + GitHub release a partir de `frontend/package.json` se nova versão | manter | ✅ | `.github/workflows/ci.yml:48-73` |
| Bump de versão (lockstep FE+BE) | ⚠️ existe, mas só roda em Windows (script `.ps1`); commit `chore(release)` depende de o dev rodar manualmente | bump no CI multiplataforma | ⚠️ | `scripts/bump-version.ps1:54-63` |
| Migration rollback (`down`) | ❌ **ausente** — runner só aplica forward; nenhum arquivo `*_down.sql` ou coluna `rollback_sql` em `schema_migrations` | adotar tooling com down ou política de migrations expand-then-contract | ❌ | `src/backend/migrations/runMigrations.ts` (só `INSERT` no diretório `migrations/*.sql`) |
| Deployment observability (`/health`, `/ready`, version) | ⚠️ `/health` retorna `{status, version}` (BE) mas: (a) sem endpoint `/ready` que valide migrations/Conexos; (b) frontend não expõe rota equivalente | adicionar `/ready` + asserts | ⚠️ | `src/backend/index.ts:64-65` |

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Manage Deployment Pipeline → Scale Rollouts** (canary/blue-green/rolling) | Ausente. Single Render service, deploy "big-bang" na `main`. "Homologação" do fin010 é flip de env no MESMO container, não staged rollout | ❌ | `render.yaml:5-22`, `docs/runbooks/fin010-write-cutover.md:21-26` |
| **Manage Deployment Pipeline → Rollback** | Ausente como botão automatizado. Estratégia atual: `git revert` + re-push para `main` → Render rebuild (3–5 min). Render mantém versão anterior se build/preDeploy falhar (bom), mas após "settled" no Conexos não há rollback programático (estorno manual na UI do `fin010`) | ❌ | `render.yaml:14-22`, `docs/runbooks/fin010-write-cutover.md:36-40` |
| **Manage Deployment Pipeline → Script Deployment Commands** | Parcial. `render.yaml` declarativo (bom), CI declarativo (bom); porém `scripts/bump-version.ps1` é PowerShell — não roda em mac/Linux/CI Ubuntu, criando deriva no CHANGELOG e nas tags quando devs em mac fazem release | ⚠️ | `scripts/bump-version.ps1:1,54-63` (`#!/usr/bin/env pwsh`, ValidateSet PowerShell) |
| **Manage Deployment Pipeline → Service Interaction Control** (toggles/feature flags) | Presente para o caminho crítico de escrita ERP — `CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN` + `CONEXOS_BASE_URL` viviam no `render.yaml` mas foram **migrados para dashboard-only** (`sync:false`) após Regis-P0 anterior (v0.6.1) | ✅ | `render.yaml:32-40`, `CHANGELOG.md:109-112` |
| **Manage Deployed System → Logical Grouping** | Parcial. Cron de ingestão isolado em GitHub Actions (excelente — não compete CPU com API requests no Render); admin seed roda no preDeploy. Mas escrita ERP + leitura ERP + auth + API permutas vivem no MESMO processo Node | ⚠️ | `.github/workflows/ingest-permutas.yml`, `src/backend/index.ts:65-92` |
| **Manage Deployed System → Physical Grouping** | N/A para o estado atual (1 instância Render starter; sem multi-tenant). Volta a ser relevante quando virar SaaSo (alvo) | N/A | `render.yaml:8-9` |
| **Manage Deployed System → Package Dependencies** | Parcial. BE roda `npm audit --audit-level=high` no CI; FE **não** roda audit. Lockfiles versionados, `npm ci` no CI | ⚠️ | `.github/workflows/ci.yml:24` (BE), 30-46 (FE sem audit) |
| **Manage Deployed System → Surge Protection** | Parcial. Branch protection + CI verde gateia merges; rate-limit de deploys do Render aceitável para a frequência atual; não há cooldown/canary | ⚠️ | `render.yaml:14-17` |
| **Idempotent deploys** | Presente. Migrations idempotentes (`schema_migrations`), `seed-admin` UPSERT, `preDeployCommand: migrate && seed:admin` | ✅ | `src/backend/migrations/runMigrations.ts:23-55`, `src/backend/jobs/seed-admin.ts:18-31` |
| **Drift detection** | N/A para Terraform (não há). Documentação explicita "FONTE ÚNICA = dashboard do Render" para flags `sync:false` — boa prática para evitar drift yaml↔dashboard, mas não há auditoria periódica (`render diff`) | ⚠️ | `render.yaml:32-40` |
| **Reproducible builds** | Parcial. Lockfiles ✅, `npm ci` ✅, **runtime Node não pinado** (CI=24, ingest=22, sem `.nvmrc`/`engines`) ❌ | ⚠️ | `.github/workflows/ci.yml:20`, `ingest-permutas.yml:41`, `package.json` (sem `engines`) |
| **Per-tenant blast-radius limit** | N/A — não há multi-tenant em produção; SaaSo é alvo. Hoje, blast radius de deploy = 100% dos usuários | N/A | `CLAUDE.md` §"Estado Atual vs. Alvo" |
| **Deployment observability** | Parcial. `/health` retorna `version` (bom para auditar deploys), sem `/ready` que valide migrations/Conexos; sem assertion no CI de que o `version` retornado bate com a tag | ⚠️ | `src/backend/index.ts:64-65` |

## 4. Findings (achados)

### F-deployability-1: Sem rollback automatizado para o caminho de escrita financeira no `fin010`

- **Severidade**: P0
- **Tactic violada**: Rollback
- **Localização**: `render.yaml:14-22`, `docs/runbooks/fin010-write-cutover.md:36-40`, `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` (escrita gated)
- **Evidência (objetiva)**:
  ```
  render.yaml:17 → autoDeploy: true     # promove main automaticamente
  render.yaml (todo o arquivo) — sem rollback hook, sem alias, sem versioning
  docs/runbooks/fin010-write-cutover.md:36-40:
    "Imediato: CONEXOS_DRY_RUN=true (ou CONEXOS_WRITE_ENABLED=false) + restart"
    "Baixa já gravada: não há rollback automático — estornar manualmente no fin010 (UI)"
  ```
- **Impacto técnico**: regressão no caminho `reconciliarPermuta` (v0.5.0+) que grave borderô errado no `fin010` não tem reversão programática; rollback do código exige `git revert`+push (~5 min de rebuild Render), e cada baixa já efetivada precisa ser estornada na UI do Conexos uma a uma pelo analista.
- **Impacto de negócio**: para um sistema que **acabou de habilitar escrita financeira em produção** (`v0.6.0` 2026-06-24, `v0.8.0` 2026-06-25 com "Executar lote"), a janela MTTR de uma regressão pode atingir horas (analista financeiro + suporte) e exige reconciliação manual no ERP — exposição direta a dupla baixa e descasamento contábil.
- **Métrica de baseline**: rollback de código ~5 min (rebuild Render); rollback de baixa errada **>30 min/par** (estorno manual no fin010); 0 testes de rollback automatizados no CI.

### F-deployability-2: Sem smoke test pós-deploy nem verificação de version no CI

- **Severidade**: P1
- **Tactic violada**: Manage Deployment Pipeline (post-deployment validation)
- **Localização**: `.github/workflows/ci.yml` (ausência), `render.yaml:22` (healthCheckPath é só do load-balancer interno do Render)
- **Evidência (objetiva)**:
  ```
  .github/workflows/ci.yml → 3 jobs: Backend, Frontend, Tag Release.
  Nenhum job faz `curl -fs https://<backend>.onrender.com/health` após o deploy.
  Tag Release (ci.yml:48-73) cria tag mas NÃO valida que `version` em /health == tag.
  render.yaml:22 → healthCheckPath: /health (usado pelo Render para roteamento,
                   não para gating de promotion; falha do /health não dispara alerta CI).
  ```
- **Impacto técnico**: se o deploy "subir" mas estiver servindo a versão antiga (cache, build deu fast-path), ou o `dist/index.js` quebrar em runtime após `preDeployCommand`, ninguém detecta exceto pelo primeiro usuário 401/500.
- **Impacto de negócio**: lead time de detecção de regressão = tempo até o 1º usuário reportar (analista financeiro, durante horário comercial). Para um deploy fora do horário, pode demorar horas.
- **Métrica de baseline**: 0 jobs de smoke test no CI; `/health` retorna `{status, version}` mas não há assertion. MTTD (mean time to detect) atual = não instrumentado.

### F-deployability-3: Versão do Node não pinada e divergente entre workflows

- **Severidade**: P1
- **Tactic violada**: Reproducible builds / Package Dependencies
- **Localização**: `.github/workflows/ci.yml:20,40`, `.github/workflows/ingest-permutas.yml:41`, `src/backend/package.json` (sem `engines`), `src/frontend/package.json` (sem `engines`), ausência de `.nvmrc`
- **Evidência (objetiva)**:
  ```
  .github/workflows/ci.yml:20  → node-version: '24'  (Backend job)
  .github/workflows/ci.yml:40  → node-version: '24'  (Frontend job)
  .github/workflows/ingest-permutas.yml:41 → node-version: 22   (cron de ingestão diária)
  src/backend/package.json — sem campo "engines"
  Nenhum .nvmrc no repo (verificado com `ls .nvmrc src/backend/.nvmrc src/frontend/.nvmrc`).
  ```
- **Impacto técnico**: o cron de ingestão (que toca o Conexos e o Postgres em produção) roda em runtime diferente do CI que validou os testes. Mudança de comportamento do Node (ex.: `fetch` API, `experimental-vm-modules`, ESM resolver) entre 22 e 24 pode produzir bug que não foi visto em PR. Render runtime também não está pinado em `render.yaml` (segue default do plan, que pode mudar).
- **Impacto de negócio**: ingestão diária quebrar por diferença de runtime = painel de Permutas desatualizado por até 24h, decisão financeira sobre dado stale.
- **Métrica de baseline**: 3 alvos (CI BE, CI FE, ingest), 2 versões diferentes (22 e 24), 0 declarações em `engines`.

### F-deployability-4: Script de bump de versão é PowerShell-only — não roda em mac/Linux/CI

- **Severidade**: P1
- **Tactic violada**: Script Deployment Commands
- **Localização**: `scripts/bump-version.ps1:1-63` (shebang `#!/usr/bin/env pwsh`, `[CmdletBinding()]`, `ValidateSet`)
- **Evidência (objetiva)**:
  ```
  scripts/bump-version.ps1:1   → #!/usr/bin/env pwsh
  scripts/bump-version.ps1:54  → [CmdletBinding()]
  scripts/bump-version.ps1:55-63 → param([string]$Base...)   # sintaxe exclusiva PowerShell
  Listing scripts/: bump-version.ps1, cleanup-worktrees.ps1   # 0 equivalentes .sh/.js
  ```
- **Impacto técnico**: o CLAUDE.md exige bump lockstep de versão (gate #10 do AutoLoopRunner). Em mac/Linux, o dev precisa instalar `pwsh` (`brew install --cask powershell`) ou pular o gate. CI Ubuntu também não roda `pwsh` por default. Resultado: tags GitHub e CHANGELOG dependem de o dev rodar manualmente no Windows.
- **Impacto de negócio**: deriva entre `package.json` versão e tag git; possível tag "v0.8.3" sem CHANGELOG sincronizado se um fix urgente for shipado em mac; auditoria de release degradada.
- **Métrica de baseline**: 1 script de release, 0 plataformas suportadas além de Windows (mac/Linux exigem `pwsh` instalado); `Tag Release` no CI lê `frontend/package.json` (`ci.yml:65`) — se o bump não rodou, tag não é criada (silenciosamente).

### F-deployability-5: Sem ambiente de staging — main vai direto para produção

- **Severidade**: P1
- **Tactic violada**: Scale Rollouts (staged rollout)
- **Localização**: `render.yaml:13-17`, `DEPLOY.md` inteiro (só descreve produção)
- **Evidência (objetiva)**:
  ```
  render.yaml:13  → branch: main
  render.yaml:17  → autoDeploy: true       # push em main → deploy em prd
  DEPLOY.md (260 linhas) descreve UM ambiente (production)
  docs/runbooks/fin010-write-cutover.md:21-26 chama "homologação" mas é
    flip manual de CONEXOS_BASE_URL no MESMO Render service de produção
    (`Restart` no Render, não outro service).
  ```
- **Impacto técnico**: validar o caminho de escrita ERP em condições semelhantes à produção exige flipar a flag de URL no Render de produção (procedimento descrito no runbook). Não há um Render service `financeiro-backend-staging` apontando para banco de homologação onde times rodem QA antes do merge.
- **Impacto de negócio**: para um sistema com escrita financeira, validar um fix do `fin010` em produção implica risco real (operador esqueceu de inverter a flag, dry-run termina sem perceber). Para evoluir SISPAG/Popula GED com a mesma cadência (roadmap das 3 frentes), staging é pré-requisito.
- **Métrica de baseline**: 1 ambiente em `render.yaml`, 0 ambientes de staging permanentes; "homologação" = flip de env no MESMO container.

### F-deployability-6: Migrations forward-only sem `down` nem expand-then-contract documentado

- **Severidade**: P1
- **Tactic violada**: Rollback (data-layer)
- **Localização**: `src/backend/migrations/runMigrations.ts:23-55`, `src/backend/migrations/00*.sql` (19 arquivos, todos UP)
- **Evidência (objetiva)**:
  ```
  runMigrations.ts:39-50 → só lê *.sql, aplica, registra em schema_migrations.
                           Sem coluna `rollback_sql`, sem suporte a *_down.sql.
  ls src/backend/migrations/*.sql → 0001..0019, nenhum *_down.sql
  ```
- **Impacto técnico**: se a versão N+1 dropa coluna `X` (ou altera tipo), rollback do código para versão N não funciona — schema já está incompatível. Render mantém container antigo se o build falhar, mas se o build passou e a migration foi aplicada, voltar exige hand-written DDL.
- **Impacto de negócio**: cenário concreto — `0019_permuta_perf_indexes.sql` (índices, seguro) é diferente de uma migration futura que renomear coluna no `permuta_alocacao_execucao` (write-ahead crítico). Sem política expand-then-contract documentada, qualquer rename ou drop futuro vira um incidente.
- **Métrica de baseline**: 19 migrations UP, 0 DOWN, 0 política expand-then-contract escrita; janela de incompatibilidade = duração total da migration (sem aviso).

### F-deployability-7: Frontend sem `npm audit` no CI

- **Severidade**: P2
- **Tactic violada**: Package Dependencies
- **Localização**: `.github/workflows/ci.yml:30-46` (job Frontend)
- **Evidência (objetiva)**:
  ```
  .github/workflows/ci.yml:24    backend → npm audit --audit-level=high
  .github/workflows/ci.yml:30-46 frontend → typecheck, lint, test (SEM npm audit)
  src/frontend/package.json → 22 deps + 17 devDeps (next 16, react 19, radix, etc.)
  ```
- **Impacto técnico**: vulnerabilidades em dependências de UI (radix, next, react-hook-form) entram em produção sem alerta no CI; janela de exposição = tempo até `npm audit` ser rodado manualmente.
- **Impacto de negócio**: o frontend serve a UI de operação financeira (login + permutas + borderôs com escrita ERP). XSS ou prototype-pollution em dep transitiva tem impacto direto na confidencialidade dos dados financeiros.
- **Métrica de baseline**: 1 dos 2 jobs roda audit; 39 (22+17) deps frontend sem auditoria periódica no CI.

### F-deployability-8: Deploy do frontend é manual e divorciado do tag/release

- **Severidade**: P2
- **Tactic violada**: Script Deployment Commands / Scale Rollouts
- **Localização**: `DEPLOY.md:63-79`, ausência de job de deploy Vercel no CI
- **Evidência (objetiva)**:
  ```
  DEPLOY.md:63-79 — descreve "Importe o repositório como um projeto Vercel"
                     (integração git padrão da Vercel) ou `npx vercel --prod` manual.
  .github/workflows/ci.yml — NENHUM step `vercel deploy` ou `vercel pull`.
  CHANGELOG.md (linha 1, v0.8.3) + memory permutas-v070-resume:
                     "deployada 2026-06-24 (Render+Vercel)" — descrição manual.
  ```
- **Impacto técnico**: FE e BE são versionados em lockstep (`bump-version.ps1`), mas o canal de deploy é diferente: BE = autoDeploy Render na main; FE = integração Vercel automática OU `npx vercel --prod` manual. Não há garantia atômica de que a versão Y do BE foi promovida AO MESMO TEMPO que Y do FE.
- **Impacto de negócio**: janela de inconsistência FE/BE entre o deploy do Render (auto) e o do Vercel (manual ou integração com latência diferente) pode quebrar a UI (campo novo na API, FE antigo não sabe ler).
- **Métrica de baseline**: 1 deploy automatizado (BE), 1 deploy manual ou semi-auto (FE), 0 verificação de version-skew entre `/health` BE e `NEXT_PUBLIC_*` FE.

### F-deployability-9: Sem `/ready` (readiness) que valide migrations + Conexos antes de receber tráfego

- **Severidade**: P2
- **Tactic violada**: Deployment observability
- **Localização**: `src/backend/index.ts:64-65`
- **Evidência (objetiva)**:
  ```
  src/backend/index.ts:64-65
    const APP_VERSION = process.env.npm_package_version ?? 'unknown';
    app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
- **Impacto técnico**: `/health` retorna 200 mesmo se o Postgres estiver indisponível, ou se a última migration tiver falhado parcialmente (não há "stop the world" no `schema_migrations`), ou se o Conexos estiver inalcançável. Render promove o container para tráfego baseado nesse 200.
- **Impacto de negócio**: deploy "verde" servindo 500 em todas as rotas reais por 30s–2min até alguém perceber; degradação silenciosa do MTTR.
- **Métrica de baseline**: 1 probe (`/health`), 0 probes de readiness, 0 verificação de dependências externas no probe.

## 5. Cards Kanban

### [deployability-1] Programar rollback one-command para o pipeline de escrita ERP (`fin010`)

- **Problema**
  > Após `v0.5.0`/`v0.6.0`/`v0.8.0`, o sistema escreve no `fin010` em produção. Não existe rollback programático: regressão de código exige `git revert` + rebuild Render (~5 min), e baixa errada exige estorno manual na UI do Conexos. Para um deploy ruim que percorra "Executar lote" (até 6 baixas por clique), o blast radius é proporcional à frequência de uso e à hora da detecção. `docs/runbooks/fin010-write-cutover.md:36-40` reconhece "não há rollback automático".

- **Melhoria Proposta**
  > 1) Adicionar workflow `rollback.yml` (`workflow_dispatch`) que aceita `commit_sha` e dispara Render Deploy Hook apontando para esse SHA + verifica `/health.version`. 2) Para a camada ERP, criar serviço `EstornoLoteService` (`@injectable`) que itera `permuta_alocacao_execucao` por `bor_cod` recente e dispara `POST /fin010/estornar/{borCod}` (já implementado via `BorderoGestaoService` — reusar). 3) Documentar runbook "Rollback de janela" (BE + estornos do período).

- **Resultado Esperado**
  > Rollback de código ≤ 2 min (one-command); rollback de baixas em lote ≤ 5 min/borderô (programático em vez de 30 min/par manual). Tactic Bass: Rollback.

- **Tactic alvo**: Rollback
- **Severidade**: P0
- **Esforço estimado**: L (1–2 sem)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - MTTR rollback de código: ~5 min → ≤ 2 min
  - MTTR rollback de baixa errada: >30 min/par → ≤ 5 min/borderô (lote)
  - # de runbooks de rollback no `docs/runbooks/`: 0 → 1 (rollback de janela)
- **Risco de não fazer**: incidente de dupla baixa ou borderô errado custa horas de operação do financeiro + reconciliação manual + possível exposição contábil (período fechado).
- **Dependências**: nenhuma — `BorderoGestaoService` (v0.6.0) já implementa o estorno individual.

### [deployability-2] Adicionar smoke test pós-deploy no CI assertando `/health.version`

- **Problema**
  > CI atual (`.github/workflows/ci.yml`) só roda gates pré-merge. Depois do `autoDeploy` do Render não há job que verifique se a versão promovida é a que o commit esperava. Bug de runtime no `dist/index.js` pode ficar invisível até o 1º usuário reportar — MTTD não instrumentado.

- **Melhoria Proposta**
  > Acrescentar job `smoke` em `.github/workflows/ci.yml` (após `Tag Release`, com `needs: [tag-release]`) que: (a) faz `curl -fsS $RENDER_URL/health` com retry/backoff por até 8 min (tempo de rebuild); (b) compara `version` retornado com `node -p "require('./src/frontend/package.json').version"`; (c) falha o run se divergir. Considerar também smoke no Vercel preview URL via `vercel pull` + `vercel inspect`.

- **Resultado Esperado**
  > MTTD de "deploy não promovido" ou "deploy promoveu versão errada" passa de "primeiro usuário reporta" → ≤ 10 min (timeout do job). Tactic Bass: Manage Deployment Pipeline.

- **Tactic alvo**: Manage Deployment Pipeline (post-deployment validation)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2, F-deployability-9
- **Métricas de sucesso**:
  - # jobs de smoke pós-deploy: 0 → 1
  - Asserção `health.version == tag`: ausente → presente
- **Risco de não fazer**: regressão fica em prd por horas até alguém usar a rota afetada; reputação interna do time.
- **Dependências**: secret `RENDER_PRODUCTION_URL` no GitHub Actions.

### [deployability-3] Pinar Node em `.nvmrc` + `engines` e unificar workflows em 1 versão

- **Problema**
  > CI roda `node 24` (`ci.yml:20,40`), workflow de ingestão diária roda `node 22` (`ingest-permutas.yml:41`), Render herda o default do plan, e não há `.nvmrc` nem `engines` em `package.json`. Reproducibilidade quebrada — bug Node-22-only não é visto no PR.

- **Melhoria Proposta**
  > 1) Adicionar `.nvmrc` na raiz (ex.: `22.13.0` LTS). 2) Adicionar `"engines": {"node": ">=22.13 <23"}` em `src/backend/package.json` e `src/frontend/package.json`. 3) Atualizar `ci.yml` e `ingest-permutas.yml` para usar `node-version-file: .nvmrc`. 4) Documentar a versão no `DEPLOY.md` (e idealmente declarar em `render.yaml` via `runtime: node` + custom env `NODE_VERSION`).

- **Resultado Esperado**
  > 1 versão de Node em todos os pontos (CI BE, CI FE, ingest cron, Render, dev local). Tactic Bass: Reproducible builds.

- **Tactic alvo**: Reproducible builds / Package Dependencies
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - # versões de Node distintas no repo: 2 (22, 24) → 1
  - `.nvmrc` presente: não → sim
  - `engines.node` declarado: não → sim (2 pkg.json)
- **Risco de não fazer**: bug Node-only em cron de ingestão = painel stale por 24h; analista decide sobre dado velho.
- **Dependências**: nenhuma.

### [deployability-4] Reescrever `bump-version.ps1` em Node/bash e mover bump para o CI

- **Problema**
  > `scripts/bump-version.ps1` é PowerShell-only — não roda em mac (sem `pwsh`), não roda em Linux, não roda no CI Ubuntu. Como o gate #10 do AutoLoopRunner exige bump lockstep, devs em mac rodam manualmente um substituto (ou pulam o gate), gerando deriva entre `package.json`, tag git e CHANGELOG.

- **Melhoria Proposta**
  > Reimplementar em Node ESM (`scripts/bump-version.mjs`) — `simple-git` + `semver` + parse de conventional-commits; mesma semântica (minor para feat, patch para fix/perf, none caso contrário; lockstep FE+BE). Adicionar job opcional `bump` no CI (`workflow_dispatch`) que roda o bump + abre PR `chore(release): vX.Y.Z`. Manter `.ps1` como wrapper que chama o `.mjs` para compatibilidade Windows.

- **Resultado Esperado**
  > Bump funciona em mac/Linux/Windows/CI; tags GitHub deixam de depender de dev em Windows. Tactic Bass: Script Deployment Commands.

- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - Plataformas suportadas pelo bump: 1 (Windows) → 3 (Windows, mac, Linux/CI)
  - # PRs com bump manual via `.ps1` no histórico: ~todos os recentes → 0 (passa a ser CI)
- **Risco de não fazer**: tags faltando para releases shipados de mac; auditoria histórica degradada.
- **Dependências**: nenhuma.

### [deployability-5] Criar Render service de staging apontando para banco Supabase de staging

- **Problema**
  > Não há ambiente de staging — `render.yaml` declara um único service (`financeiro-backend`, branch `main`). "Homologação" do fin010 é flip manual de `CONEXOS_BASE_URL` no MESMO container de produção (`docs/runbooks/fin010-write-cutover.md:21-26`). Para SISPAG/Popula GED (próximas frentes) escalar com a mesma prática vira inviável.

- **Melhoria Proposta**
  > 1) Acrescentar `financeiro-backend-staging` no `render.yaml` (branch `staging` ou `develop`), `CONEXOS_BASE_URL` apontando para homologação, banco Supabase separado, mesmas envs com prefixo. 2) Vercel deploy preview já gera URL por PR — encadear `NEXT_PUBLIC_API_URL` do preview com a URL de staging do Render via `vercel.json` ou env conditional. 3) Workflow `promote.yml` (`workflow_dispatch`): merge `staging`→`main`.

- **Resultado Esperado**
  > Validação de escrita ERP em staging permanente, sem flip de flag em prd. Tactic Bass: Scale Rollouts (staged rollout).

- **Tactic alvo**: Scale Rollouts
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - # ambientes permanentes: 1 (prd) → 2 (staging + prd)
  - # incidentes "esqueceu de flipar a flag em prd" registrados: hoje não rastreado → 0/trimestre
- **Risco de não fazer**: à medida que SISPAG (escrita em `com298` + Nexxera) e Popula GED entram, o risco de regressão escalável triplica sem leito de testes; QA fica refém de produção.
- **Dependências**: novo banco Supabase de staging; revisão de envs Render `sync:false` para o novo service.

### [deployability-6] Adotar política expand-then-contract + migrations down ou versionar via `node-pg-migrate`

- **Problema**
  > Runner forward-only (`runMigrations.ts:39-50`); 19 migrations UP, 0 DOWN. Qualquer rename/drop futuro inviabiliza rollback do código (schema já mudou).

- **Melhoria Proposta**
  > 1) Curto prazo: documentar política **expand-then-contract** no `CLAUDE.md` (toda mudança breaking = ADD coluna nova → backfill → cutover do código → DROP coluna velha em PR separado, pelo menos 1 release depois). 2) Médio prazo: migrar para `node-pg-migrate` ou `drizzle-kit` que suporta `down` nativo. 3) Adicionar `npm run migrate:dry-run` que mostra o SQL pendente sem aplicar.

- **Resultado Esperado**
  > Rollback de código continua possível mesmo após release com schema delta. Tactic Bass: Rollback (data-layer).

- **Tactic alvo**: Rollback (data layer)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) política + L (1–2sem) se migrar runner
- **Findings relacionados**: F-deployability-6
- **Métricas de sucesso**:
  - Política expand-then-contract documentada: não → sim
  - # migrations com pair UP/DOWN: 0/19 → 100% das novas
- **Risco de não fazer**: rename/drop futuro vira incidente; reconciliar com dados em produção = horas.
- **Dependências**: nenhuma para a política; runner pode trocar gradualmente.

### [deployability-7] Adicionar `npm audit --audit-level=high` no job Frontend do CI

- **Problema**
  > `ci.yml:24` roda audit no BE; `ci.yml:30-46` (Frontend) NÃO roda. 39 deps de FE (next 16, react 19, radix, react-hook-form) entram em prd sem alerta de vulnerabilidade.

- **Melhoria Proposta**
  > Acrescentar `- run: npm audit --audit-level=high` após `npm ci` no job Frontend, espelhando o BE. Considerar também `npm audit --omit=dev` se houver muito noise de dev-dep.

- **Resultado Esperado**
  > Paridade de gating de vulnerabilidades entre BE e FE. Tactic Bass: Package Dependencies.

- **Tactic alvo**: Package Dependencies
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-7
- **Métricas de sucesso**:
  - # jobs com `npm audit`: 1 → 2
- **Risco de não fazer**: CVE em radix/next entra em prd sem alarme.
- **Dependências**: nenhuma.

### [deployability-8] Sincronizar deploy FE+BE (sem version-skew) via promote workflow

- **Problema**
  > BE deploya automaticamente no Render quando `main` é atualizada; FE deploya pela integração Vercel (independente) ou via `npx vercel --prod` manual. Versão lockstep no `package.json` não garante deploy lockstep — janela onde FE@N+1 chama BE@N (ou vice-versa) é possível, especialmente em fix urgente em só uma das pontas.

- **Melhoria Proposta**
  > 1) Mover o deploy do FE para o CI: novo job `deploy-frontend` que roda `vercel deploy --prod --token=$VERCEL_TOKEN` somente após `Tag Release` E após o smoke test do BE passar. 2) Smoke test cross-version: além de `/health.version` do BE, GET na URL Vercel `/` e checar meta tag com a versão; se divergir, falha o run e abre alerta.

- **Resultado Esperado**
  > FE e BE sobem em sequência controlada, com asserção de version-match. Tactic Bass: Scale Rollouts (coordinated rollout).

- **Tactic alvo**: Scale Rollouts
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-8
- **Métricas de sucesso**:
  - Janela de version-skew FE/BE pós-merge: indeterminada → ≤ 2 min
  - # de deploys FE no CI: 0 → 100% dos pós-merge em main
- **Risco de não fazer**: bug FE-BE "API mudou contrato" toda vez que o FE for redeployado fora de ordem.
- **Dependências**: `VERCEL_TOKEN` como secret no GitHub Actions; consentimento do operador para mover o deploy do FE do Vercel-integration para CI.

### [deployability-9] Implementar `/ready` no backend que valide Postgres + Conexos + última migration

- **Problema**
  > `/health` (`src/backend/index.ts:64-65`) retorna 200 sem checar Postgres, Conexos ou se a última migration aplicou. Render usa esse 200 para promover tráfego, então o container pode passar a servir mesmo com dependência caída.

- **Melhoria Proposta**
  > Adicionar `app.get('/ready', ...)` que faz: (a) `SELECT 1 FROM schema_migrations ORDER BY applied_at DESC LIMIT 1` (Postgres + última migration), (b) `HEAD $CONEXOS_BASE_URL` com timeout 2s (sem auth), (c) retorna 503 se qualquer falhar. Apontar `healthCheckPath: /ready` no `render.yaml` (mantendo `/health` como liveness).

- **Resultado Esperado**
  > Promoção de tráfego só ocorre quando o container realmente serve. Tactic Bass: Deployment observability + Surge Protection.

- **Tactic alvo**: Deployment observability
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-9, F-deployability-2
- **Métricas de sucesso**:
  - # probes (liveness/readiness): 1 → 2
  - Tempo médio de promoção com dependência caída: agora "imediato" → 0 (não promove)
- **Risco de não fazer**: deploys "verdes" servindo 500 silenciosamente.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo `all`, NÃO usei `--quick`. Backend buildado localmente (2.1s, 3.3 MB em `dist/`) — bom indicador de velocidade. Frontend NÃO buildei para não custar I/O (793MB de `.next` cache local).
- "Métricas de runtime" (taxa de deploy success, MTTR real, lead-time real) **não são medíveis localmente**; precisaria do Render API + Vercel API + telemetria de deploy events. Marquei explicitamente.
- **Cross-QA**: F-deployability-1 (rollback de baixa ERP) conversa com **fault-tolerance** (precisa de detect+recover automatizado) e **performance** (estorno manual é a fronteira); F-deployability-6 (expand-then-contract) é input direto para **modifiability**; F-deployability-3 (Node mismatch) interage com **testability** (testes rodam em runtime diferente do prd). Sinalizar ao consolidator.
- Tactics `Physical Grouping` e `Per-tenant blast-radius limit` marcadas N/A com justificativa — single Render service hoje, multi-tenant é alvo, não realidade.
- Score 4/10 é a média ponderada: CI gates sólidos (+) + `render.yaml` declarativo e bem comentado (+) + idempotência ✅ contra rollback ausente, sem staging, Node não pinado, bump Windows-only, sem smoke test, FE sem audit (todos achados acima). Para um sistema que **acabou** de habilitar escrita financeira em prd, o `P0` de rollback puxa o score para baixo.
