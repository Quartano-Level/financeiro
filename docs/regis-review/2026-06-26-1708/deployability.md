---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-26-1708
agent: qa-deployability
generated_at: 2026-06-26T17:08:00-03:00
scope: all
score: 6
findings_count: 8
cards_count: 8
---

# Deployability — Regis-Review

> **Contexto real (lido em `render.yaml`, `DEPLOY.md`, `.github/workflows/`):** o "alvo" Lambda + Terraform descrito em `CLAUDE.md` **não existe** — `infra/` não existe, sem AWS, sem SSM em prod. Deploy de produção é **Render** (`render.yaml`, backend Express, `autoDeploy: true` na `main`) + **Vercel** (frontend Next.js, integração Git ou `npx vercel --prod`) + **Supabase** (Postgres). CI (`.github/workflows/ci.yml`) só roda **gates** (typecheck/lint/test/`npm audit`/build) — NÃO existe job de deploy. Versionamento FE+BE em lockstep via `scripts/bump-version.ps1` (PowerShell-only). Métricas de runtime (MTTR, lead-time real, success-rate de deploy) **não medíveis localmente**; tudo abaixo deriva de evidências estáticas no repo @ `7d853fd` (v0.9.2).
>
> **Delta vs. run anterior `2026-06-26-0058`:** o achado P0 **F-deployability-1 ("Sem rollback automatizado para o fin010")** foi **revisitado**. O rollback do estado financeiro no `fin010` **JÁ É 1 CLIQUE na UI** (`BorderosPanel.tsx`): botão **Cancelar** para borderô finalizado (`cancelarBordero` → `BorderoGestaoService.cancelarBordero` → `conexosBaixaClient.cancelarBordero`, `routes/permutas.ts:629`), **Excluir** para borderô em cadastro (`excluirBordero`, `routes/permutas.ts:696`), **Excluir baixa** individual (`excluirBaixa`), **Estornar** finalizado (`estornarBordero`, `service:240`). Todas gated por `CONEXOS_WRITE_ENABLED`. Rollback de **código** vem do Render/Vercel via redeploy da versão anterior (Render dashboard → "Deploy hash X" / Vercel → "Promote to Production"). A tactic Bass **Rollback** está, portanto, **coberta** (✅ aplicação · ⚠️ parcial no pipeline — manual via dashboard). Findings rebatizados; score 4 → 6.

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev (push em `main` aprovado em PR) | Merge de fix em `fin010` write-path (escrita financeira no Conexos) | `src/backend/**` (rebuild Render) + `src/frontend/**` (rebuild Vercel) | Produção single-region (Render `starter` + Vercel + Supabase), 24/7, escrita ERP gated por `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` (`docs/runbooks/fin010-write-cutover.md:7-17`) | Build + `preDeployCommand` (`migrate && seed:admin`) + healthCheck `/health` → Render promove novo container; se falhar, mantém versão anterior; rollback de migration = manual (sem `down`); rollback de baixa financeira gravada = **1 clique no app** (Cancelar/Excluir/Estornar) + manual no fin010 só se a UI cair | Lead-time commit→prd ≤ 10 min para BE; deploy success rate desconhecido (sem telemetria); rollback de **estado** = 1 clique na UI (~2s/baixa); rollback de **código** = redeploy do SHA anterior via Render dashboard (~3–5 min); MTTR P95 estimado ≤ 10 min (rollback + propagação) |

> ⚠️ **Não medível localmente:** lead-time real (precisa Render API), taxa de sucesso de deploy (Render dashboard), MTTR observado, frequência de rollback (não há histórico instrumentado). Recomendação: instrumentar webhook de deploy Render → tabela `deploy_event` para baseline.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| # de etapas automatizadas commit→prd (BE) | **8** (checkout · setup-node · `npm ci` · `npm audit` · typecheck · lint · test · build) + Render `autoDeploy` + `preDeployCommand` (`migrate && seed:admin`) | ≥6 com smoke pós-deploy | ⚠️ | `.github/workflows/ci.yml:9-28`, `render.yaml:17-21` |
| Job de deploy no CI | **0** (CI só roda gates; deploy é responsabilidade do Render via webhook) | 1 (controlado por CI com rollback explícito) | ⚠️ | `.github/workflows/ci.yml` (ausência de job deploy) |
| Verificação pós-deploy (smoke test) | **ausente** — `healthCheckPath: /health` é do Render; nenhum job CI chama `GET /health` após o deploy nem assert no `version` retornado | smoke `GET /health` + asserção de `version == TAG` no CI | ❌ | `render.yaml:22`, `src/backend/index.ts:64-65` |
| Tactic **Rollback** — camada de aplicação (estado ERP) | **Cobertura ✅** — 4 ações 1-clique gated: `cancelarBordero` (`routes/permutas.ts:629`), `excluirBordero` (`routes/permutas.ts:696`), `excluirBaixa`, `estornarBordero` (`BorderoGestaoService:83-245`). UI confirma com diálogo (`BorderosPanel.tsx:670-703`) | manter | ✅ | `src/backend/domain/service/permutas/BorderoGestaoService.ts:83-245`, `src/frontend/app/permutas/BorderosPanel.tsx:227-253` |
| Tactic **Rollback** — camada de pipeline (código) | **Parcial** — Render mantém versão anterior se build/preDeploy falhar (bom); rollback ativo = redeploy do SHA anterior pelo Render dashboard ou re-push (~3–5 min de rebuild). Sem script `rollback.yml` `workflow_dispatch` | One-command rollback no CI (`workflow_dispatch` → Render Deploy Hook) | ⚠️ | `render.yaml:14-22` (sem deploy-hook script no `.github/workflows`) |
| Tactic **Scale Rollouts** (canary/blue-green/staged) | **ausente** — single Render service, single Vercel project, sem env staging permanente; "homologação" do fin010 é flip manual de `CONEXOS_BASE_URL` no MESMO container (`docs/runbooks/fin010-write-cutover.md:21-26`) | Staging permanente + flip canary | ❌ | `render.yaml:5-22`, `docs/runbooks/fin010-write-cutover.md` |
| Tactic **Script Deployment Commands** cross-platform | **PowerShell-only** — `scripts/bump-version.ps1` (require `pwsh`) e `scripts/cleanup-worktrees.ps1` | bash-compatível ou rodar via CI | ❌ | `scripts/bump-version.ps1:1`, `scripts/cleanup-worktrees.ps1:1` |
| **Idempotent deploy** (migrations + seed) | ✅ idempotente — `MigrationRunner` consulta `schema_migrations` antes de aplicar; `seed:admin` é UPSERT | manter | ✅ | `src/backend/migrations/runMigrations.ts:25-54`, `src/backend/jobs/seed-admin.ts` |
| **Reproducible builds** (lockfile + `npm ci`) | ✅ lockfile commitado, CI usa `npm ci` com cache | manter | ✅ | `src/backend/package-lock.json` (presente), `.github/workflows/ci.yml:21-23` |
| **Pinned runtime** (Node version) | ❌ **DRIFT** — CI usa `node 24` (`ci.yml:20,40`), workflow de ingestão usa `node 22` (`ingest-permutas.yml:41`), Render herda o default do plan, sem `.nvmrc` nem `engines` em `package.json` | Único Node em CI + Render + dev, declarado em `.nvmrc`/`engines` | ❌ | `.github/workflows/ci.yml:20,40`, `.github/workflows/ingest-permutas.yml:41`, `src/backend/package.json` (sem `engines`) |
| Tempo de build BE (`tsc && tsc-esm-fix`) | **~2.1 s** (medido local na run anterior; código não regrediu) | ≤30 s | ✅ | `time npm run build` em `src/backend` (run `2026-06-26-0058`) |
| Tamanho do `dist/` BE | **3.3 MB** (131 arquivos JS) | ≤50 MB | ✅ | `du -sh src/backend/dist` |
| Tactic **Logical Grouping** (separar cron de API) | ✅ ingestão de Permutas roda em **GitHub Actions cron** (3×/dia BRT, `cron: '0 9,15,21 * * *'`), não no Render web service | manter | ✅ | `.github/workflows/ingest-permutas.yml:10-14` |
| Tactic **Physical Grouping** (instâncias dedicadas) | N/A — Render `starter` = 1 instância única; SaaSo "multi-tenant" é alvo, não realidade | (alvo) | N/A | `render.yaml:8-9` |
| Tactic **Package Dependencies** (lockfile + audit) | ✅ BE roda `npm audit --audit-level=high`; ❌ FE **não** roda audit | rodar audit nos dois | ⚠️ | `.github/workflows/ci.yml:24` (BE), `ci.yml:30-46` (FE sem audit) |
| Tactic **Surge Protection** (auto-deploy gate) | ⚠️ parcial — gate = branch protection (CI verde para merge); sem rate de deploy nem cooldown | manter (gate é razoável) | ⚠️ | `render.yaml:14-17` |
| Drift detection (config/infra) | N/A para Terraform (não há); ✅ **`render.yaml` declarativo** + nota explícita "FONTE ÚNICA = dashboard do Render (`sync:false`)" para flags de escrita ERP — evita yaml brigando com dashboard | manter; documentar quais chaves são dashboard-only | ✅ | `render.yaml:31-40` |
| Tag/Release automático na `main` | ✅ job `Tag Release` cria tag + GitHub release a partir de `frontend/package.json` se nova versão | manter | ✅ | `.github/workflows/ci.yml:48-73` |
| Bump de versão (lockstep FE+BE) | ⚠️ existe, mas só roda em Windows (script `.ps1`); commit `chore(release)` depende de o dev rodar manualmente | bump no CI multiplataforma | ⚠️ | `scripts/bump-version.ps1` |
| Migration rollback (`down`) | ❌ **ausente** — runner só aplica forward; nenhum arquivo `*_down.sql` ou coluna `rollback_sql` em `schema_migrations` | adotar tooling com down ou política expand-then-contract documentada | ❌ | `src/backend/migrations/runMigrations.ts:25-54` (só `INSERT` no diretório `migrations/*.sql`) |
| Deployment observability (`/health`, `/ready`, version) | ⚠️ `/health` retorna `{status, version}` (BE) mas: (a) sem endpoint `/ready` que valide migrations/Conexos; (b) frontend não expõe rota equivalente | adicionar `/ready` + asserts | ⚠️ | `src/backend/index.ts:64-65` |

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Manage Deployment Pipeline → Scale Rollouts** (canary/blue-green/rolling) | Ausente. Single Render service, deploy "big-bang" na `main`. "Homologação" do fin010 é flip de env no MESMO container, não staged rollout | ❌ | `render.yaml:5-22`, `docs/runbooks/fin010-write-cutover.md:21-26` |
| **Manage Deployment Pipeline → Rollback** (código) | Parcial. Render retém a versão anterior quando build/preDeploy falha (rollback automático em caso de falha do deploy). Rollback ativo pós-promotion = redeploy do SHA anterior pelo Render dashboard (~3–5 min) ou re-push de `git revert`; **não há workflow `rollback.yml` `workflow_dispatch`** que faça one-command via Deploy Hook | ⚠️ | `render.yaml:14-22`, ausência de `.github/workflows/rollback.yml` |
| **Manage Deployment Pipeline → Rollback** (estado ERP — aplicação) | **Presente.** `BorderoGestaoService` expõe `cancelarBordero` (reabre permuta), `excluirBordero` (em cadastro), `excluirBaixa` (individual), `estornarBordero` (finalizado) — todos gated por `CONEXOS_WRITE_ENABLED` e expostos no `BorderosPanel.tsx` com confirmação. Rollback de baixa errada = **1 clique** | ✅ | `src/backend/domain/service/permutas/BorderoGestaoService.ts:83-245`, `src/backend/routes/permutas.ts:629,696`, `src/frontend/app/permutas/BorderosPanel.tsx:227-253,670-703` |
| **Manage Deployment Pipeline → Script Deployment Commands** | Parcial. `render.yaml` declarativo (bom), CI declarativo (bom); porém `scripts/bump-version.ps1` é PowerShell — não roda em mac/Linux/CI Ubuntu, criando deriva no CHANGELOG e nas tags quando devs em mac fazem release | ⚠️ | `scripts/bump-version.ps1` (`#!/usr/bin/env pwsh`, `[CmdletBinding()]`, `ValidateSet`) |
| **Manage Deployment Pipeline → Service Interaction Control** (toggles/feature flags) | Presente para o caminho crítico de escrita ERP — `CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN` + `CONEXOS_BASE_URL` viviam no `render.yaml` mas foram **migrados para dashboard-only** (`sync:false`) após Regis-P0 anterior | ✅ | `render.yaml:31-40` |
| **Manage Deployed System → Logical Grouping** | Parcial. Cron de ingestão isolado em GitHub Actions (excelente — não compete CPU com API requests no Render); admin seed roda no preDeploy. Mas escrita ERP + leitura ERP + auth + API permutas vivem no MESMO processo Node | ⚠️ | `.github/workflows/ingest-permutas.yml`, `src/backend/index.ts:65-92` |
| **Manage Deployed System → Physical Grouping** | N/A — 1 instância Render starter; sem multi-tenant. Volta a ser relevante quando virar SaaSo (alvo) | N/A | `render.yaml:8-9` |
| **Manage Deployed System → Package Dependencies** | Parcial. BE roda `npm audit --audit-level=high` no CI; FE **não** roda audit. Lockfiles versionados, `npm ci` no CI | ⚠️ | `.github/workflows/ci.yml:24` (BE), 30-46 (FE sem audit) |
| **Manage Deployed System → Surge Protection** | Parcial. Branch protection + CI verde gateia merges; rate-limit de deploys do Render aceitável para a frequência atual; não há cooldown/canary | ⚠️ | `render.yaml:14-17` |
| **Idempotent deploys** | Presente. Migrations idempotentes (`schema_migrations`), `seed-admin` UPSERT, `preDeployCommand: migrate && seed:admin` | ✅ | `src/backend/migrations/runMigrations.ts:25-54`, `render.yaml:21` |
| **Drift detection** | N/A para Terraform (não há). Documentação explicita "FONTE ÚNICA = dashboard do Render" para flags `sync:false` — boa prática para evitar drift yaml↔dashboard, mas não há auditoria periódica (`render diff`) | ⚠️ | `render.yaml:31-40` |
| **Reproducible builds** | Parcial. Lockfiles ✅, `npm ci` ✅, **runtime Node não pinado** (CI=24, ingest=22, sem `.nvmrc`/`engines`) ❌ | ⚠️ | `.github/workflows/ci.yml:20,40`, `ingest-permutas.yml:41`, `package.json` (sem `engines`) |
| **Per-tenant blast-radius limit** | N/A — não há multi-tenant em produção; SaaSo é alvo. Hoje, blast radius de deploy = 100% dos usuários | N/A | `CLAUDE.md` §"Estado Atual vs. Alvo" |
| **Deployment observability** | Parcial. `/health` retorna `version` (bom para auditar deploys), sem `/ready` que valide migrations/Conexos; sem assertion no CI de que o `version` retornado bate com a tag | ⚠️ | `src/backend/index.ts:64-65` |

## 4. Findings (achados)

### F-deployability-1: Rollback de código no pipeline é manual (Render dashboard) — sem `rollback.yml` no CI

- **Severidade**: P2 (rebaixado de P0 da run `2026-06-26-0058` — rollback do **estado ERP** já é 1-clique via UI; o que sobra é a falta de **script** explícito de rollback do **código**)
- **Tactic violada**: Rollback (pipeline) / Script Deployment Commands
- **Localização**: ausência de `.github/workflows/rollback.yml`; `render.yaml:14-22`
- **Evidência (objetiva)**:
  ```
  ls .github/workflows/ → ci.yml, ingest-permutas.yml      (nenhum rollback.yml)
  render.yaml:17 → autoDeploy: true            # promove main automaticamente
  render.yaml (todo o arquivo) — sem rollback hook publicado, sem alias
  ```
  Rollback do **estado** (baixas financeiras) é coberto pela UI: `BorderoGestaoService` expõe `cancelarBordero` (`L218-225`), `excluirBordero` (`L156-184`), `excluirBaixa` (`L83-129`), `estornarBordero` (`L240-246`); `BorderosPanel.tsx:227-253,670-703` apresenta os botões com confirmação.
- **Impacto técnico**: rollback de **código** depende de o operador (a) ir no Render dashboard e clicar em "Redeploy" no SHA anterior, ou (b) `git revert` + push e esperar ~3–5 min de rebuild. Não há `workflow_dispatch` parametrizado por SHA com asserção pós-rollback de `/health.version`.
- **Impacto de negócio**: para o caminho de escrita ERP — onde o **estado** já é reversível em 1 clique — o gap remanescente é o tempo de promover um SHA bom em incidente de runtime puro (ex.: 500 em rota não-ERP). Janela operacional aceitável hoje, mas escala mal quando mais frentes (SISPAG, Popula GED) entrarem.
- **Métrica de baseline**: rollback de código via Render dashboard = ~3–5 min + operador disponível; 0 workflows automatizados. Rollback de **estado** ERP = 1 clique (~2s/baixa) ✅.

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
  src/frontend/package.json — sem campo "engines"
  Nenhum .nvmrc no repo.
  ```
- **Impacto técnico**: o cron de ingestão (que toca o Conexos e o Postgres em produção) roda em runtime diferente do CI que validou os testes. Mudança de comportamento do Node (`fetch`, `experimental-vm-modules`, ESM resolver) entre 22 e 24 pode produzir bug que não foi visto em PR. Render runtime também não está pinado em `render.yaml` (segue default do plan, que pode mudar).
- **Impacto de negócio**: ingestão diária quebrar por diferença de runtime = painel de Permutas desatualizado por até 24h, decisão financeira sobre dado stale.
- **Métrica de baseline**: 3 alvos (CI BE, CI FE, ingest), 2 versões diferentes (22 e 24), 0 declarações em `engines`.

### F-deployability-4: Script de bump de versão é PowerShell-only — não roda em mac/Linux/CI

- **Severidade**: P1
- **Tactic violada**: Script Deployment Commands
- **Localização**: `scripts/bump-version.ps1` (shebang `#!/usr/bin/env pwsh`, `[CmdletBinding()]`, `ValidateSet`)
- **Evidência (objetiva)**:
  ```
  scripts/bump-version.ps1:1   → #!/usr/bin/env pwsh
  scripts/ → bump-version.ps1, cleanup-worktrees.ps1   (0 equivalentes .sh/.mjs)
  ```
- **Impacto técnico**: o `CLAUDE.md` exige bump lockstep de versão (gate #10 do AutoLoopRunner). Em mac/Linux, o dev precisa instalar `pwsh` (`brew install --cask powershell`) ou pular o gate. CI Ubuntu também não roda `pwsh` por default. Resultado: tags GitHub e CHANGELOG dependem de o dev rodar manualmente no Windows.
- **Impacto de negócio**: deriva entre `package.json` versão e tag git; possível tag "v0.9.X" sem CHANGELOG sincronizado se um fix urgente for shipado em mac; auditoria de release degradada. `Tag Release` no CI (`ci.yml:64`) lê `frontend/package.json` — se o bump não rodou, tag não é criada **silenciosamente**.
- **Métrica de baseline**: 1 script de release, 0 plataformas suportadas além de Windows; bumps recentes (v0.8.x → v0.9.2) saíram porque o dev é Windows-first.

### F-deployability-5: Sem ambiente de staging — main vai direto para produção

- **Severidade**: P1
- **Tactic violada**: Scale Rollouts (staged rollout)
- **Localização**: `render.yaml:13-17`, `DEPLOY.md` inteiro (só descreve produção)
- **Evidência (objetiva)**:
  ```
  render.yaml:11 → branch: main
  render.yaml:17 → autoDeploy: true       # push em main → deploy em prd
  DEPLOY.md (94 linhas) descreve UM ambiente (production)
  docs/runbooks/fin010-write-cutover.md:21-26 chama "homologação" mas é
    flip manual de CONEXOS_BASE_URL no MESMO Render service de produção
    (restart no Render, não outro service).
  ```
- **Impacto técnico**: validar o caminho de escrita ERP em condições semelhantes à produção exige flipar a flag de URL no Render de produção (procedimento descrito no runbook). Não há um Render service `financeiro-backend-staging` apontando para banco de homologação onde times rodem QA antes do merge.
- **Impacto de negócio**: para um sistema com escrita financeira, validar um fix do `fin010` em produção implica risco real (operador esqueceu de inverter a flag, dry-run termina sem perceber). Para evoluir SISPAG/Popula GED com a mesma cadência, staging é pré-requisito.
- **Métrica de baseline**: 1 ambiente em `render.yaml`, 0 ambientes de staging permanentes; "homologação" = flip de env no MESMO container.

### F-deployability-6: Migrations forward-only sem `down` nem expand-then-contract documentado

- **Severidade**: P1
- **Tactic violada**: Rollback (data layer)
- **Localização**: `src/backend/migrations/runMigrations.ts:25-54`, `src/backend/migrations/00*.sql` (21 arquivos, todos UP)
- **Evidência (objetiva)**:
  ```
  runMigrations.ts:38-50 → só lê *.sql, aplica, registra em schema_migrations.
                           Sem coluna `rollback_sql`, sem suporte a *_down.sql.
  ls src/backend/migrations/*.sql → 0001..0021, nenhum *_down.sql
  ```
- **Impacto técnico**: se a versão N+1 dropa coluna `X` (ou altera tipo), rollback do código para versão N não funciona — schema já está incompatível. Render mantém container antigo se o build falhar, mas se o build passou e a migration foi aplicada, voltar exige hand-written DDL.
- **Impacto de negócio**: cenário concreto — `0021_referencia_externa.sql` (ADD coluna, seguro) é diferente de uma migration futura que renomear coluna no `permuta_alocacao_execucao` (write-ahead crítico). Sem política expand-then-contract documentada, qualquer rename ou drop futuro vira um incidente. Como o rollback de **estado ERP** já é coberto pela UI (F-1), o gargalo passa a ser exatamente este.
- **Métrica de baseline**: 21 migrations UP, 0 DOWN, 0 política expand-then-contract escrita; janela de incompatibilidade = duração total da migration (sem aviso).

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

### F-deployability-8: Sem `/ready` (readiness) que valide migrations + Conexos antes de receber tráfego

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

### [deployability-1] Publicar workflow `rollback.yml` que dispara redeploy via Render Deploy Hook e valida `/health.version`

- **Problema**
  > Após a confirmação de que o rollback do **estado ERP** já é 1-clique na UI (Cancelar/Excluir/Estornar borderô em `BorderosPanel.tsx` + `BorderoGestaoService`), o gargalo de Rollback que sobra é o **código**: hoje, voltar um SHA exige operador entrar no Render dashboard e clicar "Redeploy" no commit anterior (~3–5 min) ou re-push de `git revert`. Não há `workflow_dispatch` parametrizado por SHA com asserção pós-rollback.

- **Melhoria Proposta**
  > Criar `.github/workflows/rollback.yml` (`workflow_dispatch` com input `commit_sha`) que: (a) dispara `curl -X POST $RENDER_DEPLOY_HOOK_URL?ref=$commit_sha`; (b) faz polling de `GET $RENDER_URL/health` por até 8 min (tempo de rebuild) verificando `version == package.json@$commit_sha`; (c) registra no log do run o SHA anterior, o SHA-alvo e o `version` final. Tactic Bass: Rollback (pipeline). Manter o caminho UI (`BorderoGestaoService.cancelarBordero/excluirBordero/excluirBaixa/estornarBordero`) como rollback de estado — não duplicar.

- **Resultado Esperado**
  > Rollback de código one-command, auditável no histórico do GitHub Actions. Tactic Bass: Rollback + Script Deployment Commands.

- **Tactic alvo**: Rollback (pipeline)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - # workflows de rollback no `.github/workflows/`: 0 → 1
  - MTTR rollback de código (operador sem acesso ao dashboard): ~5–10 min → ≤ 3 min
- **Risco de não fazer**: baixa — rollback de estado já é 1 clique (F-1 reavaliado). Risco residual: incidente fora do horário em que o operador não tem acesso ao Render dashboard.
- **Dependências**: secret `RENDER_DEPLOY_HOOK_URL` no GitHub Actions; documentar runbook curto.

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
- **Findings relacionados**: F-deployability-2, F-deployability-8
- **Métricas de sucesso**:
  - # jobs de smoke pós-deploy: 0 → 1
  - Asserção `health.version == tag`: ausente → presente
- **Risco de não fazer**: regressão fica em prd por horas até alguém usar a rota afetada.
- **Dependências**: secret `RENDER_PRODUCTION_URL` no GitHub Actions.

### [deployability-3] Pinar Node em `.nvmrc` + `engines` e unificar workflows em 1 versão

- **Problema**
  > CI roda `node 24` (`ci.yml:20,40`), workflow de ingestão diária roda `node 22` (`ingest-permutas.yml:41`), Render herda o default do plan, e não há `.nvmrc` nem `engines` em `package.json`. Reproducibilidade quebrada — bug Node-22-only não é visto no PR.

- **Melhoria Proposta**
  > 1) Adicionar `.nvmrc` na raiz (ex.: `22.13.0` LTS). 2) Adicionar `"engines": {"node": ">=22.13 <23"}` em `src/backend/package.json` e `src/frontend/package.json`. 3) Atualizar `ci.yml` e `ingest-permutas.yml` para usar `node-version-file: .nvmrc`. 4) Documentar a versão no `DEPLOY.md` (e idealmente declarar em `render.yaml` via env custom `NODE_VERSION`).

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
  > Runner forward-only (`runMigrations.ts:25-54`); 21 migrations UP, 0 DOWN. Qualquer rename/drop futuro inviabiliza rollback do código (schema já mudou). Com o rollback de estado ERP coberto pela UI (F-1 reavaliado), este passa a ser o gargalo principal de Rollback.

- **Melhoria Proposta**
  > 1) Curto prazo: documentar política **expand-then-contract** no `CLAUDE.md` (toda mudança breaking = ADD coluna nova → backfill → cutover do código → DROP coluna velha em PR separado, pelo menos 1 release depois). 2) Médio prazo: migrar para `node-pg-migrate` ou `drizzle-kit` que suporta `down` nativo. 3) Adicionar `npm run migrate:dry-run` que mostra o SQL pendente sem aplicar.

- **Resultado Esperado**
  > Rollback de código continua possível mesmo após release com schema delta. Tactic Bass: Rollback (data layer).

- **Tactic alvo**: Rollback (data layer)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) política + L (1–2sem) se migrar runner
- **Findings relacionados**: F-deployability-6
- **Métricas de sucesso**:
  - Política expand-then-contract documentada: não → sim
  - # migrations com pair UP/DOWN: 0/21 → 100% das novas
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

### [deployability-8] Implementar `/ready` no backend que valide Postgres + Conexos + última migration

- **Problema**
  > `/health` (`src/backend/index.ts:64-65`) retorna 200 sem checar Postgres, Conexos ou se a última migration aplicou. Render usa esse 200 para promover tráfego, então o container pode passar a servir mesmo com dependência caída.

- **Melhoria Proposta**
  > Adicionar `app.get('/ready', ...)` que faz: (a) `SELECT 1 FROM schema_migrations ORDER BY applied_at DESC LIMIT 1` (Postgres + última migration), (b) `HEAD $CONEXOS_BASE_URL` com timeout 2s (sem auth), (c) retorna 503 se qualquer falhar. Apontar `healthCheckPath: /ready` no `render.yaml` (mantendo `/health` como liveness).

- **Resultado Esperado**
  > Promoção de tráfego só ocorre quando o container realmente serve. Tactic Bass: Deployment observability + Surge Protection.

- **Tactic alvo**: Deployment observability
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-8, F-deployability-2
- **Métricas de sucesso**:
  - # probes (liveness/readiness): 1 → 2
  - Tempo médio de promoção com dependência caída: agora "imediato" → 0 (não promove)
- **Risco de não fazer**: deploys "verdes" servindo 500 silenciosamente.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo `all`. Re-rodada da `2026-06-26-0058` após confirmação de que o rollback do **estado ERP** já é 1 clique na UI (`BorderoGestaoService.{cancelarBordero,excluirBordero,excluirBaixa,estornarBordero}` + `BorderosPanel.tsx:227-253,670-703`) — o P0 anterior foi rebaixado para P2 (gap residual = `rollback.yml` no CI, não a operação em si). Score 4 → 6.
- Nada mudou em `.github/workflows/`, `render.yaml`, `scripts/`, `migrations/runMigrations.ts` desde a run anterior; deltas do app são CC-1 (split de `page.tsx`) e CC-2 (split de `ConexosClient`) — não afetam deployability diretamente, exceto positivo: superfície de cada deploy diminuiu (PRs menores).
- **Métricas de runtime** (taxa de deploy success, MTTR real, lead-time real) **não são medíveis localmente**; precisaria do Render API + Vercel API + telemetria de deploy events. Marcadas explicitamente.
- **Cross-QA**: F-deployability-6 (expand-then-contract) é input direto para **modifiability**; F-deployability-3 (Node mismatch) interage com **testability** (testes rodam em runtime diferente do prd); F-deployability-2/8 (smoke + `/ready`) conversam com **availability** (gating de promoção); F-deployability-5 (staging) conversa com **security** (testar escrita ERP fora de prd). Sinalizar ao consolidator.
- Tactics `Physical Grouping` e `Per-tenant blast-radius limit` mantidas N/A — single Render service, multi-tenant é alvo.
