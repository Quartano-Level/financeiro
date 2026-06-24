---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-24-0039
agent: qa-deployability
generated_at: 2026-06-24T00:39:00-03:00
scope: all
score: 4
findings_count: 8
cards_count: 8
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor (Yuri/Marco) | Merge para `main` com `feat`/`fix` que altera contrato com Conexos (escrita `fin010`) e schema (`0015`,`0016`) | Backend (Render web service `financeiro-backend`), Frontend (Vercel `kavex-financeiro`), DB (Supabase `app_user`, `permuta_alocacao*`, `schema_migrations`) | Produção *única* (PRD), free tier Render com spin-down, sem staging/homologação | CI verde → `npm ci && npm run build` → `npm run migrate && npm run seed:admin` → switch de tráfego só se `/health` 200 → frontend redeploy manual via `npx vercel --prod` → atualizar `ALLOWED_ORIGINS` p/ casar alias | Lead time commit→PRD ≤ 15 min · deploy success rate ≥ 95 % · 0 incidentes de CORS/origin · 0 migrations aplicadas fora do `MigrationRunner` · rollback em ≤ 5 min |

> Cenário concreto vivido na sessão: o commit `54ad093` virou `CONEXOS_WRITE_ENABLED=true`/`CONEXOS_DRY_RUN=false` no `render.yaml`, mas **a flag não propagou** (esses envs ficaram “colados” na primeira leitura do dashboard) → Yuri precisou setar manualmente no painel; em paralelo, o `npx vercel --prod` gerou um alias diferente do whitelistado em `ALLOWED_ORIGINS` → login quebrou por CORS. Métrica observada: 1 incidente de origin + 1 incidente de flag não-aplicada em 1 sessão de release.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| # ambientes (dev/stg/prd) | 1 (só PRD) | ≥ 2 (PRD + HML) | ❌ | `render.yaml:5-22` + `DEPLOY.md` (não menciona staging) |
| Escrita real no ERP gated por staging | Não — `WRITE_ENABLED=true` direto em PRD | Sim — provar em HML antes | ❌ | `render.yaml:36-39`, commit `54ad093` |
| Auto-deploy backend (push main) | Sim, nativo Render | Sim | ✅ | `render.yaml:17` (`autoDeploy: true`) |
| Auto-deploy frontend (push main) | **Não** — `npx vercel --prod` manual | Sim, automático por push | ❌ | `DEPLOY.md:67-79` + ausência de step em `.github/workflows/ci.yml` |
| Drift FE↔BE de versão na PRD | 0.6.0 == 0.6.0 (lockstep manual) | Lockstep automatizado | ⚠️ | `src/backend/package.json:3`, `src/frontend/package.json:3` |
| Migrations gated antes do tráfego | Sim, `preDeployCommand` | Sim | ✅ | `render.yaml:21` |
| Migrations aplicadas fora do runner (drift) | Sim — sessão admitiu migrations corridas “à mão” em PRD; `0015`/`0016` reconstruídas idempotentes | 0 | ❌ | `_shared-metrics.md` (sessão) + `0015_*.sql:11,38,40` (`IF NOT EXISTS`) e `0016_*.sql:6` (`ADD COLUMN IF NOT EXISTS`) |
| Idempotência das migrations recentes | Sim (`IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`) | Sim | ✅ | `0015_permuta_alocacao_execucao.sql:11,38-41` · `0016_permuta_alocacao_data_base.sql:6` |
| Health check pós-deploy | Sim, `/health` | Sim, com timeout < 60 s | ✅ | `render.yaml:22` |
| Rollback automatizado (1 comando) | **Não documentado** — runbook só descreve “flip flag + restart” p/ a *escrita*, não p/ código | 1 comando ou 1 botão (Render “Rollback to previous deploy”) + runbook | ⚠️ | `docs/runbooks/fin010-write-cutover.md` cobre só flags; sem runbook git-revert/redeploy |
| Script de bump de versão cross-platform | **Não** — `scripts/bump-version.ps1` é PowerShell-only; quebra em macOS/Linux do dev (host atual = Darwin) | Script `.sh`/`.js`/`.ts` portável OU pwsh disponível em CI | ❌ | `scripts/` (só `.ps1`); host = Darwin 25.5.0 |
| Steps automáticos commit→PRD | 7 backend (checkout, setup-node, ci, audit, typecheck, lint, test+coverage, build) + 1 release tag · **0 steps p/ frontend deploy** · **0 steps de promote/approve** | ≥ 8 com gate manual antes do PRD | ⚠️ | `.github/workflows/ci.yml:10-46` |
| Mistura `value:` vs `sync:false` no blueprint | `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` como `value:` (governadas pelo yaml) **e** observadas como “coladas” pelo dashboard durante a sessão → confusão | Toda flag de risco operacional num único locus (dashboard) com auditoria, *ou* SSM/ParameterStore | ❌ | `render.yaml:36-39` vs sessão (override manual no painel) |
| Drift detection scheduled job | Nenhum job que diferencie `render.yaml` vs envs reais do dashboard | Diário (workflow `gh api` que dumpa envs e diffa) | ❌ | `.github/workflows/*` — ausente |
| CORS whitelist suporta aliases Vercel | Sim, wildcard por sufixo (`https://*.vercel.app`) | Sim, e `ALLOWED_ORIGINS` já configurado com wildcard em PRD | ⚠️ | `src/backend/http/cors.ts:31-37`; sessão revelou que o env real em PRD não tinha o wildcard, só o alias fixo → quebrou login no novo deploy |
| # migrations totais | 16 arquivos `.sql` · 395 linhas | n/a | ℹ️ | `src/backend/migrations/*.sql` |
| Build time backend (CI) | ⚠️ **Não medível localmente** sem `act` ou sem rodar CI; declarado como gate baseline `426/426 jest`, mas não cronometrado | ≤ 3 min | ⚠️ | `_shared-metrics.md` (gates verdes, sem tempo) |
| Cold-start Render free tier | ⚠️ **Não medível localmente** (URL retornou `Not Found` durante a coleta — serviço pode estar dormindo) | ≤ 30 s na primeira request | ⚠️ | `curl https://financeiro-backend.onrender.com/health` → vazio/`Not Found` no momento da coleta |

> ⚠️ **Não medíveis localmente**: cold-start real do Render, tempo total commit→tráfego, taxa histórica de deploy success. Requerem Render API + métricas de janela ≥ 30 dias. Recomendação: instrumentar um workflow `gh actions` que consulte `GET /v1/services/{id}/deploys` e exporte `lead_time_p95` + `failure_rate_30d` para o `/health` ou um endpoint admin.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Scale Rollouts** (canary, blue/green, rolling) | Render faz switch atômico só após `/health` 200, mas é **all-at-once** num único serviço; 1 % canary não existe. Frontend = `npx vercel --prod` manual (alias atômico, mas sem canary). | ⚠️ parcial | `render.yaml:17,22` |
| **Roll Back** | Render UI tem botão “Rollback to previous deploy”, mas **não documentado** nos runbooks; rollback de DB não existe (migrations são forward-only sem `down`); flip de feature-flag (`CONEXOS_WRITE_ENABLED=false`) é o único rollback descrito — e exige restart porque o `EnvironmentProvider` é `@singleton` cacheado. | ⚠️ parcial | `docs/runbooks/fin010-write-cutover.md:37-40`; ausência de `down` em `runMigrations.ts` |
| **Script Deployment Commands** | `render.yaml` ✅, `ci.yml` ✅ (gates), mas **frontend deploy é manual** (`npx vercel --prod`), **bump de versão é PowerShell-only** num host Darwin, **sem step de promote** PR→PRD. | ⚠️ parcial | `.github/workflows/ci.yml`, `scripts/bump-version.ps1`, `DEPLOY.md:63-79` |
| **Logical Grouping** (Manage Deployed System) | 1 web service backend + 1 site Vercel + 1 Postgres Supabase = 3 unidades lógicas isoladas. Para a primeira escrita no ERP, o domínio “permuta” inteiro vive no mesmo deploy (não há split p/ blast-radius). | ⚠️ parcial | `render.yaml:5-22` + topologia |
| **Physical Grouping** | Backend e DB em provedores distintos (Render IAD vs Supabase AWS) — boa separação de falha. Frontend (Vercel edge) idem. | ✅ presente | `DEPLOY.md:9-22, 22-60, 63-79` |
| **Package Dependencies** | `package-lock.json` no FE+BE; `npm ci` no CI e no Render build; `npm audit --audit-level=high` no CI (gate). Bom isolamento. Sem Renovate/Dependabot configurado para janelas predizíveis. | ✅ presente | `ci.yml:24`, `render.yaml:18`, presença de lockfiles |
| **Surge Protection** | `express-rate-limit` no app (não no edge); Render free tier sem auto-scaling. Nenhum buffer/queue entre frontend e a escrita no ERP — POST `reconciliar` vai direto. | ⚠️ parcial | `src/backend/package.json` (deps), routes `/reconciliar` síncrono |
| **Idempotent deploys** | `preDeployCommand` aplica só pendentes (`MigrationRunner` filtra por `schema_migrations`); `0015`/`0016` usam `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`; mas migrations aplicadas FORA do runner em PRD nesta semana ⇒ idempotência rompida em re-execução fria. | ⚠️ parcial | `runMigrations.ts:25-54`; sessão admite manual SQL |
| **Drift detection** | Nenhuma. Não há job que compare `render.yaml` ↔ envs reais no painel, nem schema vs migrations aplicadas. A confusão da sessão (`value:` vs dashboard override) provou que o drift é silencioso. | ❌ ausente | `.github/workflows/*` (ausente) |
| **Reproducible builds** | `package-lock.json` ✅, `npm ci` ✅, Node 24 pinado na CI; **mas** Render usa o Node default da plataforma (não declara `engines` em `package.json`), então versão pode divergir CI↔PRD. | ⚠️ parcial | `ci.yml:20`, `package.json` sem `engines` |
| **Per-tenant blast-radius limit** | N/A neste runtime — não há multi-tenant Terraform ainda (CLAUDE.md §Tenants vazio). Tenant único `local`. | N/A | `render.yaml:28` (`client_name=local`) |
| **Deployment observability** | `/health` ✅ retorna `version` (`v0.6.0` declarado em `_shared-metrics.md`). Sem export de métricas de deploy (lead time, MTTR, failure rate) p/ um lugar consultável. Logs do deploy vivem só no painel Render. | ⚠️ parcial | `_shared-metrics.md` (l. 44) |

## 4. Findings (achados)

### F-deployability-1: Escrita real no ERP foi para PRD sem passar por homologação

- **Severidade**: P0
- **Tactic violada**: Scale Rollouts (sem canary/staging), Logical Grouping
- **Localização**: `render.yaml:31-39`, commit `54ad093`, `docs/runbooks/fin010-write-cutover.md:21-30` (Fase 1 = HML obrigatória, ignorada)
- **Evidência (objetiva)**:
  ```yaml
  # render.yaml:36-39 (PRD)
  - key: CONEXOS_WRITE_ENABLED
    value: 'true'
  - key: CONEXOS_DRY_RUN
    value: 'false'
  ```
  Mensagem do commit: *“liga escrita real no fin010 em produção (WRITE_ENABLED=true, DRY_RUN=false) … decisão do Yuri 2026-06-24: baixa real direto em PRD, sem homologação”*. A própria Fase 1 do runbook (`fin010-write-cutover.md:21`) diz: *“Homologação (obrigatória antes de produção)”*.
- **Impacto técnico**: A baixa no `fin010` é descrita como “irreversível por nós” (runbook l. 4); um payload mal-formado ou um drift de contrato Conexos gera lançamento contábil que precisa ser estornado **manualmente** na UI do ERP. Sem HML, qualquer regressão entra direto na contabilidade da Columbia.
- **Impacto de negócio**: Estorno contábil manual em janela de fechamento mensal = retrabalho da analista + risco de divergência de saldo na conciliação bancária. Em primeira execução real, expõe o cliente à primeira chance de erro do sistema sem rede.
- **Métrica de baseline**: 0 deploys validados em HML antes do flip; 1 ambiente de execução (PRD) vs alvo ≥ 2.

### F-deployability-2: Render Blueprint `value:` foi sobrescrito no dashboard sem rastro

- **Severidade**: P0
- **Tactic violada**: Drift Detection, Script Deployment Commands
- **Localização**: `render.yaml:36-39` vs dashboard (override observado na sessão)
- **Evidência (objetiva)**:
  Commit `54ad093` mudou os dois envs como `value:` no yaml. A sessão relatou que os flags **acabaram sendo setados no dashboard** porque o push do yaml não disparou redeploy/efeito visível. Render trata envs `value:` como “managed by blueprint” na criação, mas qualquer edição manual no painel quebra a paridade — e não há job comparando.
- **Impacto técnico**: Próximo `git revert` do `render.yaml` não desliga a escrita real (porque o dashboard tem o valor sticky). Operador acredita estar em dry-run; ainda escreve.
- **Impacto de negócio**: Confusão de qual é a fonte da verdade → mais 1 incidente possível na próxima alteração de flag de risco. Exatamente o vetor que materializou o problema da sessão.
- **Métrica de baseline**: 2 flags críticas (`CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) em dois lugares simultâneos; 0 jobs de drift; 1 incidente observado nesta sessão.

### F-deployability-3: Frontend deploy é manual (`npx vercel --prod`) e gera mismatch de alias × CORS

- **Severidade**: P0
- **Tactic violada**: Script Deployment Commands, Scale Rollouts
- **Localização**: `DEPLOY.md:63-79` (instruções) + `.github/workflows/ci.yml` (ausência de job FE deploy) + `src/backend/http/cors.ts:31-37` (whitelist suporta wildcard, mas a `ALLOWED_ORIGINS` em PRD não usava)
- **Evidência (objetiva)**:
  Sessão: *“alias vs preview URL → mismatch de CORS (ALLOWED_ORIGINS só tinha o alias) quebrou o login”*. `ci.yml` tem `tag-release` (linhas 48-73) mas zero passo de `vercel deploy`. `cors.ts:31-37` suporta `https://*.vercel.app`, então a correção é só configurar; mas o operador hoje precisa lembrar de duas coisas a cada push.
- **Impacto técnico**: Cada deploy FE pode quebrar o login dependendo de qual alias a Vercel devolveu. Tempo de detecção = humano clicando, sem alarme.
- **Impacto de negócio**: Janela de indisponibilidade total da SPA (login bloqueado) por ~minutos até alguém perceber e atualizar o env no Render + esperar restart. Já aconteceu 1× nesta sessão.
- **Métrica de baseline**: 1 incidente de CORS / 1 sessão de release; 0 etapas automatizadas para FE em `ci.yml`.

### F-deployability-4: Migrations aplicadas manualmente em PRD criam drift com `schema_migrations`

- **Severidade**: P1
- **Tactic violada**: Idempotent deploys, Drift detection
- **Localização**: `src/backend/migrations/runMigrations.ts:25-54` (runner) · `_shared-metrics.md` (sessão admite) · `0015_*.sql:11`, `0016_*.sql:6` (já idempotentes)
- **Evidência (objetiva)**:
  O `MigrationRunner` controla por `schema_migrations`. Quando o SQL roda fora dele, a tabela não é atualizada → numa máquina nova / restore de backup, o runner tentará reaplicar e o `IF NOT EXISTS` salva por sorte. As migrations `0015` e `0016` da sessão foram **deliberadamente** escritas idempotentes — confissão de que sabiam que iam rodar à mão antes.
- **Impacto técnico**: Numa migration futura que NÃO seja `IF NOT EXISTS` (ex.: `INSERT` de seed, `BACKFILL`, `ALTER TYPE`), o caminho “rodei manualmente” causará erro no próximo deploy ou aplicará duas vezes.
- **Impacto de negócio**: Risco de corrupção/duplicação de dados em backfill — diretamente em cima da feature que escreve no ERP (Fase 3). Tempo de incidente = duração do backfill.
- **Métrica de baseline**: 2 migrations na sessão fora do runner; 16 migrations totais; 100 % das recentes precisaram ser `IF NOT EXISTS` defensivo.

### F-deployability-5: Sem ambiente de staging/homologação

- **Severidade**: P1
- **Tactic violada**: Scale Rollouts
- **Localização**: `render.yaml:5-22` (único serviço); `DEPLOY.md` (não menciona HML)
- **Evidência (objetiva)**:
  Há 1 service Render. `branch: main`. CI roda gates mas não promove. Conexos hml existe (`columbiatrading-hml.conexos.cloud` no runbook) mas não há serviço apontando para lá.
- **Impacto técnico**: Toda regressão é uma regressão em PRD. Sem segundo ambiente, o cenário Bass “canary 5 %” é inviável.
- **Impacto de negócio**: A organização ganha velocidade hoje, mas paga em risco a cada feature de escrita. Numa segunda frente (SISPAG, GED), o problema multiplica.
- **Métrica de baseline**: 0 ambientes de não-produção; alvo ≥ 1 HML.

### F-deployability-6: Procedimento de rollback de código não está documentado

- **Severidade**: P1
- **Tactic violada**: Roll Back
- **Localização**: `docs/runbooks/fin010-write-cutover.md` (só cobre flag); ausência de outro runbook em `docs/runbooks/`
- **Evidência (objetiva)**:
  `ls docs/runbooks/` → único arquivo é `fin010-write-cutover.md`. Não há descrição de “revert a versão N-1” via Render UI ou via `git revert + push`. O `MigrationRunner` não tem `down`/`reverse`.
- **Impacto técnico**: MTTR para “v0.6.0 introduziu bug crítico, voltar para v0.5.0” é função de quem está de plantão decifrar o painel Render sob estresse, com pegadinha extra: a migration nova já está aplicada → revert do código pode bater em coluna que o app antigo não conhece.
- **Impacto de negócio**: Janela de indisponibilidade alongada na próxima regressão. P50 esperado de rollback sobe de “5 min” (botão pronto + runbook) para “20–40 min” (descobrir + decidir + executar).
- **Métrica de baseline**: 0 runbooks de rollback de código; 1 runbook (só flag) hoje.

### F-deployability-7: `bump-version.ps1` é PowerShell-only num host Darwin

- **Severidade**: P2
- **Tactic violada**: Script Deployment Commands
- **Localização**: `scripts/bump-version.ps1` (linha 1: `#!/usr/bin/env pwsh`)
- **Evidência (objetiva)**:
  Host atual reportado pela `env`: `darwin / Darwin 25.5.0`. `pwsh` não é default no macOS; o gate 10 do pipeline (`bump-version.ps1 -Execute`) só roda se o dev instalar PowerShell. Resultado: bumps de versão acabam sendo feitos manualmente (editar `package.json` x2 + `CHANGELOG.md`) → risco de drift FE↔BE.
- **Impacto técnico**: Pipeline “verde” mas com etapa humana opcional silenciosa. FE/BE podem sair de lockstep (já hoje estão alinhados por sorte/atenção).
- **Impacto de negócio**: Versão na UI / no `/health` pode mentir → análise pós-incidente atrapalhada.
- **Métrica de baseline**: 1 script de release, 0 portabilidade Darwin; 100 % das máquinas dev no time atual = Darwin.

### F-deployability-8: Versão do Node não pinada no runtime Render (CI = 24, Render = default)

- **Severidade**: P2
- **Tactic violada**: Reproducible builds, Package Dependencies
- **Localização**: `.github/workflows/ci.yml:20` (`node-version: '24'`) · `src/backend/package.json` (sem `engines.node`)
- **Evidência (objetiva)**:
  `grep -n "engines" src/backend/package.json` → ausente. Render escolhe sua default Node (atualmente 22.x), CI usa 24. ESM + `tsc-esm-fix` é sensível a versão.
- **Impacto técnico**: “Funciona no CI, quebra no Render” em features que tocam APIs novas do Node 24 (ex.: WHATWG URL, `node:test`). Já houve precedente de divergência ESM em projetos similares.
- **Impacto de negócio**: Falha pós-merge entra em PRD sem ter sido vista no CI; aumenta failure rate de deploy.
- **Métrica de baseline**: `engines.node` = ausente em FE e BE; `node-version: '24'` no CI; diferença efetiva ≥ 1 major.

## 5. Cards Kanban

### [deployability-1] Subir ambiente de homologação antes da próxima feature de escrita

- **Problema**
  > Não existe HML; `WRITE_ENABLED=true` foi para PRD sem validação intermediária. A baixa `fin010` é irreversível por nós (runbook). Primeira regressão = estorno contábil manual na Columbia.
- **Melhoria Proposta**
  > Duplicar o serviço Render como `financeiro-backend-hml` (`branch: hml`, `CONEXOS_BASE_URL=...columbiatrading-hml...`, `CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`). Criar projeto Vercel paralelo com `NEXT_PUBLIC_API_URL` para o HML. Adicionar passo no pipeline: `main` só recebe merge se `hml` rodou a feature de escrita pelo menos 1× verde. Bass: **Scale Rollouts** (manual staging gate, precursor de canary).
- **Resultado Esperado**
  > 100 % das features que tocam `ConexosClient.postGeneric/authenticatedPost` rodam em HML antes da PRD. # ambientes: 1 → 2.
- **Tactic alvo**: Scale Rollouts
- **Severidade**: P0
- **Esforço estimado**: M
- **Findings relacionados**: F-deployability-1, F-deployability-5
- **Métricas de sucesso**:
  - # ambientes não-PRD: 0 → ≥ 1
  - # features de escrita validadas em HML antes do flip de PRD: 0 % → 100 %
- **Risco de não fazer**: Primeiro bug de write em PRD = estorno manual no `fin010` em produção real; em SISPAG/GED, o blast-radius aumenta (remessa bancária falsa, GED poluído).
- **Dependências**: Acesso ao ambiente hml Conexos (já existe URL no runbook).

### [deployability-2] Mover flags de risco para única fonte da verdade (dashboard + drift check)

- **Problema**
  > `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` em `render.yaml` como `value:` + dashboard sobrescreveu → operador não soube qual valor vence; o push do yaml deveria ter desligado/ligado e não teve efeito visível (sessão).
- **Melhoria Proposta**
  > Trocar essas duas chaves para `sync: false` (gerenciadas só pelo dashboard) **e** criar workflow noturno `gh actions` que (a) consulta Render API `GET /v1/services/{id}/env-vars`, (b) compara com um snapshot versionado em `infra/expected-envs.json`, (c) abre issue se divergir. Bass: **Drift detection** + **Script Deployment Commands**.
- **Resultado Esperado**
  > Apenas 1 lugar para configurar a flag (dashboard, com auditoria do painel). Drift detectável em ≤ 24 h.
- **Tactic alvo**: Drift detection
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - # flags em dois lugares: 2 → 0
  - Tempo até detectar drift: ∞ → ≤ 24 h
- **Risco de não fazer**: Próximo flip de flag falha em silêncio → escrita continua quando deveria parar.
- **Dependências**: Token Render API com escopo read-only, salvo em GitHub Secrets.

### [deployability-3] Automatizar deploy do frontend e fixar wildcard em `ALLOWED_ORIGINS`

- **Problema**
  > `npx vercel --prod` é manual; alias gerado nem sempre bate com o `ALLOWED_ORIGINS` cravado no Render → CORS quebra login. Custo: 1 incidente / sessão.
- **Melhoria Proposta**
  > Adicionar job `frontend-deploy` no `ci.yml` (`needs: [frontend]`, `if: ref == main`) usando `vercel-action` com `--prod`. Em paralelo, normalizar `ALLOWED_ORIGINS` em PRD para `https://kavex-financeiro.vercel.app,https://*.vercel.app` (o suporte a wildcard já existe em `cors.ts:31-37`). Bass: **Script Deployment Commands**.
- **Resultado Esperado**
  > Push para `main` ⇒ FE em PRD com alias estável; nenhum alias da Vercel é capaz de bypassar a CORS allow-list.
- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - Steps automáticos commit→FE PRD: 0 → ≥ 3 (build, deploy, verify)
  - Incidentes de CORS por release: 1 → 0
- **Risco de não fazer**: Toda release implica risco de login quebrado por minutos.
- **Dependências**: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (já presente em `src/frontend/.vercel/project.json`) como GitHub Secrets.

### [deployability-4] Proibir migrations “à mão” em PRD — só `MigrationRunner`

- **Problema**
  > Sessão admitiu rodar SQL direto no Supabase; `0015`/`0016` foram escritas idempotentes para sobreviver à próxima reaplicação. Risco real na primeira migration *não* idempotente (`INSERT seed`, `BACKFILL`).
- **Melhoria Proposta**
  > (a) Política escrita no `DEPLOY.md`: “qualquer SQL em PRD passa pelo runner; emergências exigem `INSERT INTO schema_migrations` retroativo + ADR”. (b) Validação no CI: workflow que aplica todas as migrations num Postgres efêmero e compara checksum (hash do arquivo) com o que está em `schema_migrations` em PRD via Supabase API. Bass: **Idempotent deploys**.
- **Resultado Esperado**
  > 100 % das migrations passam pelo runner; drift checksum → alerta.
- **Tactic alvo**: Idempotent deploys
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - Migrations fora do runner por mês: 2 (sessão) → 0
  - Coluna `applied_at`/checksum auditável: ausente → presente
- **Risco de não fazer**: Backfill futuro duplica/corrompe dado de permuta — em cima de write-back real para o ERP.
- **Dependências**: Adicionar coluna `checksum TEXT` em `schema_migrations` (migration aditiva).

### [deployability-5] Runbook + botão de rollback de código (Render “Previous deploy”)

- **Problema**
  > Não há runbook descrevendo como reverter v0.6.0 → v0.5.0; o único runbook (`fin010-write-cutover.md`) cobre a flag, não o código. MTTR esperado num rollback de pânico = improvisação.
- **Melhoria Proposta**
  > Criar `docs/runbooks/rollback.md` cobrindo: (i) Render → service → Manual Deploy → “Deploy previous commit”; (ii) Vercel → “Promote previous deployment”; (iii) DB → política: migrations forward-only, rollback de schema **só com migration aditiva** (nunca DROP) + ADR. Treinar 1× por trimestre (game day). Bass: **Roll Back**.
- **Resultado Esperado**
  > Rollback executável em ≤ 5 min por qualquer pessoa do time, com passos numerados.
- **Tactic alvo**: Roll Back
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-6
- **Métricas de sucesso**:
  - # runbooks de rollback: 0 → 1
  - MTTR estimado (auto-reportado em game day): ? → ≤ 5 min
- **Risco de não fazer**: Próxima regressão prolonga a janela de incidente proporcional à improvisação.
- **Dependências**: Nenhuma.

### [deployability-6] Portar `bump-version.ps1` para Node/TS (executável em Darwin/Linux)

- **Problema**
  > Host atual = Darwin; `pwsh` não é default no macOS. Bumps acabam sendo manuais ⇒ FE/BE podem divergir de versão sem detecção.
- **Melhoria Proposta**
  > Reescrever em `scripts/bump-version.ts` (executado por `tsx`), reaproveitando a lógica conventional-commit → semver. Adicionar step `node scripts/bump-version.ts --check` no CI que falha se FE.version ≠ BE.version. Bass: **Script Deployment Commands** + **Logical Grouping** (lockstep enforcement).
- **Resultado Esperado**
  > Bump rodável em qualquer dev/CI; lockstep FE↔BE garantido por CI.
- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-7
- **Métricas de sucesso**:
  - Plataformas suportadas: 1 (Windows) → 3 (Win/macOS/Linux)
  - # PRs que entraram com versão divergente FE↔BE: ? → 0 (gate CI)
- **Risco de não fazer**: `/health` reporta versão fora de sincronia com a UI; análise de incidente atrapalhada.
- **Dependências**: Nenhuma.

### [deployability-7] Pinar Node 24 no `engines` + Render

- **Problema**
  > CI roda Node 24, Render default = 22.x. Build “verde” não garante runtime.
- **Melhoria Proposta**
  > Adicionar `"engines": { "node": ">=24.0.0 <25" }` em `src/backend/package.json` e `src/frontend/package.json`. Render lê `engines` e instala a versão compatível. Bass: **Reproducible builds**.
- **Resultado Esperado**
  > CI e PRD rodam o mesmo major do Node.
- **Tactic alvo**: Reproducible builds
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-deployability-8
- **Métricas de sucesso**:
  - Major Node CI vs PRD: 24 vs 22 → 24 vs 24
- **Risco de não fazer**: Bug “funciona no CI, falha em PRD” cedo ou tarde — particularmente em features ESM/TLA novas.
- **Dependências**: Confirmar que Render suporta Node 24 no plano starter (suporta desde 2025).

### [deployability-8] Endpoint `/admin/deployments` com lead time, MTTR e failure rate (deployment observability)

- **Problema**
  > Métricas “quão bem deploya” vivem só no painel Render. Pós-incidente, fica difícil responder “qual foi o lead time desta release?”, “qual foi a taxa de falha do último mês?”.
- **Melhoria Proposta**
  > Workflow noturno consulta Render API + `gh api repos/.../actions/runs`, calcula DORA básicas (deploy frequency, lead time, change failure rate) e escreve num JSON commitado em `docs/dora.json` *ou* num endpoint admin do backend. Bass: **Deployment observability**.
- **Resultado Esperado**
  > DORA do mês corrente consultável sem login no painel Render.
- **Tactic alvo**: Deployment observability
- **Severidade**: P3
- **Esforço estimado**: M
- **Findings relacionados**: F-deployability-1 (sem baseline numérico), F-deployability-3
- **Métricas de sucesso**:
  - DORA reportada automaticamente: não → sim (4 métricas)
- **Risco de não fazer**: Discussão de maturidade fica anedótica; sem dado para defender investir mais em pipeline.
- **Dependências**: Render API token, GitHub Actions API token (já é `github.token`).

## 6. Notas do agente

- Escopo aceito: foquei na sessão (Fase 3.1 + flip do write em PRD), mas tratei `render.yaml`/`ci.yml` como parte do escopo `all`. Tactics Bass cobertas em totalidade; “per-tenant blast-radius” marcado N/A justificado.
- Não consegui medir cold-start nem deploy lead time reais — `curl https://financeiro-backend.onrender.com/health` retornou vazio na coleta (free tier dormindo / domínio gerenciado); recomendação em F-deployability-1 e card 8.
- **Cross-QA**: F-deployability-1 e -3 conversam com **Availability** (sem HML/canary = SPOF de feature) e **Fault-Tolerance** (irreversibilidade da escrita `fin010` agrava). F-deployability-4 conversa com **Modifiability/Testability** (drift de schema mascarado por `IF NOT EXISTS` defensivo). F-deployability-2 toca **Security** (flag crítica em dois lugares = risco de configuração).
- O score 4/10 reflete: bons primitivos (CI + lockfile + preDeploy migrate + health check), mas 3 P0 ativos exatamente na release que **liga a primeira escrita irreversível em PRD** sem rede de segurança.
