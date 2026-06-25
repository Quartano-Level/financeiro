---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-25-1555
agent: qa-deployability
generated_at: 2026-06-25T15:55:00-03:00
scope: backend,frontend
score: 8
findings_count: 2
cards_count: 2
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev (PR merge em `main`) | Commit incluindo nova rota `GET /permutas/relatorios/:tipo` + assets de front | Backend (Render service) + Frontend (Vercel build) + cliente browser (cache de `lib/api.ts`) | Produção single-tenant Columbia (Render + Vercel + Supabase) — sem Terraform | Pipeline GH Actions verde (lint/typecheck/test/build/audit) → tag idempotente → Render hook + Vercel build redeploy automático; rota existente `/gestao` continua respondendo durante a janela | Lead-time commit→prd ≤ 10 min; zero downtime na rota `/gestao`; rollback via `git revert` + redeploy ≤ 10 min; nenhuma migração de schema necessária |

> A feature é **read-only** (reusa `GestaoPermutasService.exporGestao()`), **não adiciona dependência nova** (`exceljs ^4.4.0` já está no `package.json`), **não cria env var** e **não introduz migração**. O perfil de risco de deploy é baixo: a rota nova é aditiva e não toca rotas existentes.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Dependências novas adicionadas pela feature | 0 (exceljs `^4.4.0` já presente) | 0 | ✅ | `grep -n exceljs src/backend/package.json` |
| Env vars novas / SSM novos | 0 | 0 | ✅ | inspeção de `RelatorioExportService.ts` (sem `EnvironmentProvider` novo) |
| Migrations de banco | 0 (feature read-only) | 0 | ✅ | `_shared-metrics.md` + `RelatorioExportService` reusa `GestaoPermutasService` |
| Backward-compat da API | Rota nova aditiva (`GET /permutas/relatorios/:tipo`); `/gestao` intocada | sem breaking change | ✅ | `src/backend/routes/permutas.ts:367-386` |
| Lockfiles presentes (FE+BE) | sim, ambos commitados (≈397kB BE / ≈498kB FE) | presentes | ✅ | `ls src/backend/package-lock.json src/frontend/package-lock.json` |
| Steps automatizados commit→main (backend) | 6 (checkout, setup-node+cache, `npm ci`, `npm audit`, `typecheck`, `lint`, `test --coverage`, `build`) | ≥5 | ✅ | `.github/workflows/ci.yml:9-29` |
| Steps automatizados commit→main (frontend) | 5 (checkout, setup-node+cache, `npm ci`, `typecheck`, `lint`, `test --coverage`) | ≥4 | ✅ | `.github/workflows/ci.yml:31-46` |
| Idempotência da tag de release | tag `v${version}` só criada se inexistente | idempotente | ✅ | `.github/workflows/ci.yml:48-75` |
| Drift detection de infra | N/A (Render/Vercel — sem IaC) | N/A | — | `_shared-metrics.md` |
| Lead-time commit→prd (deploy Render+Vercel) | ⚠️ Não medível localmente | ≤10 min | — | Requer logs Render/Vercel |
| Tamanho do artefato de build BE delta | ⚠️ Não medido (quick mode) | — | — | `npm run build` não rodado para o delta |
| Feature flag gating do botão "Exportar" | ausente (sempre visível) | flag opcional | ⚠️ | `src/frontend/app/permutas/page.tsx` (popover sempre renderizado) |
| Rollback documentado da rota nova | implícito (`git revert` + redeploy) — sem runbook | runbook ≥1 linha | ⚠️ | ausência em `docs/` |

> ⚠️ **Não medível localmente**: lead-time efetivo do deploy Render hook + Vercel build. Requer instrumentação no provedor (Render deploy logs / Vercel deployments API).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Scale Rollouts (canary / blue-green / rolling) | Render+Vercel fazem rolling automático no redeploy; sem canary explícito. Feature read-only minimiza risco; ainda assim, **sem feature flag** para esconder o botão "Exportar" se a rota falhar em prd | ⚠️ parcial | `src/frontend/app/permutas/page.tsx` (popover sempre visível); ausência de `NEXT_PUBLIC_FEATURE_*` no delta |
| Rollback | `git revert` + redeploy automático via CI; nenhuma migração a desfazer (feature read-only) — janela ≤10 min | ✅ presente | `.github/workflows/ci.yml` (rebuild a cada push em `main`) |
| Script Deployment Commands | CI uniforme (`npm ci`, `typecheck`, `lint`, `test --coverage`, `build`) — mesmo pipeline aplicado à feature | ✅ presente | `.github/workflows/ci.yml:18-29` |
| Logical Grouping | Service novo isolado em `domain/service/permutas/RelatorioExportService.ts`, rota agrupada sob `routes/permutas.ts` (módulo Permutas coeso) | ✅ presente | `src/backend/domain/service/permutas/RelatorioExportService.ts:1-398` |
| Physical Grouping | Backend Render = um único serviço (monolito Express); deploy do delta segue o mesmo serviço — não há split a fazer | N/A | Render single-service (estado atual, não-alvo) |
| Package Dependencies | `exceljs` já estava no `package.json`; lockfile commitado; `npm audit --audit-level=high` no pipeline | ✅ presente | `src/backend/package.json:29`; `.github/workflows/ci.yml:24` |
| Surge Protection | Sem rate-limit/quota na rota nova; o endpoint serializa snapshot completo do painel em memória — ver `qa-performance` para o risco operacional. Do ponto de vista de deploy, ausência de surge protection eleva o blast-radius se a rota for chamada em loop logo após o release | ⚠️ parcial | `src/backend/routes/permutas.ts:371-386` (sem middleware de throttle) |
| Idempotent deploys | Tag `v${version}` só publica se ainda não existir; build determinístico via `npm ci` + lockfile | ✅ presente | `.github/workflows/ci.yml:60-75` |
| Drift Detection | N/A — sem IaC (Render/Vercel) | N/A | `_shared-metrics.md` (estado atual sem Terraform) |
| Reproducible Builds | `npm ci` + lockfile pinado + node 24 pinado no setup-node; nenhuma dependência floating no delta | ✅ presente | `.github/workflows/ci.yml:13-23` |
| Per-tenant blast-radius limit | N/A — Columbia é o único tenant em prd; multi-tenant ainda não provisionado | N/A | `CLAUDE.md §Tenants` (lista vazia) |
| Deployment Observability | CI faz coverage; deploy Render/Vercel emitem logs próprios. Não há checagem post-deploy automatizada da rota nova (health/smoke) | ⚠️ parcial | ausência de smoke test em `.github/workflows/ci.yml` |

## 4. Findings (achados)

### F-deployability-1: Rota "Exportar" não tem feature flag para desligamento rápido

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Scale Rollouts (canary)
- **Localização**: `src/frontend/app/permutas/page.tsx` (popover sempre visível); `src/backend/routes/permutas.ts:371-386` (rota sempre registrada)
- **Evidência (objetiva)**:
  ```
  // routes/permutas.ts:371-386 — rota sempre montada, sem gate por env
  router.get('/relatorios/:tipo', asyncHandler(async (req, res) => { ... }));
  ```
  ```
  // app/permutas/page.tsx — popover "Exportar" renderizado incondicionalmente
  ```
- **Impacto técnico**: se o `RelatorioExportService` falhar em prd (ex.: OOM no `exceljs` para um snapshot grande), a única forma de "desligar" é `git revert` + redeploy (≤10 min). Não há kill-switch em runtime.
- **Impacto de negócio**: 10 min de exposição a um botão quebrado para o time financeiro durante o horário comercial. Como a feature é nova, o custo de revert é baixo, mas a falta de flag impede um canary parcial (ex.: ativar só para um usuário-piloto).
- **Métrica de baseline**: 0 feature flags governando a feature (vs. alvo ≥1 quando a rota retorna binário gerado em memória).

### F-deployability-2: Ausência de smoke test post-deploy para a rota nova

- **Severidade**: P3 (baixo — melhoria opcional)
- **Tactic violada**: Deployment Observability
- **Localização**: `.github/workflows/ci.yml` (sem job post-deploy)
- **Evidência (objetiva)**:
  ```
  # ci.yml termina em build + tag-release; não há job que faça
  # `curl -fI https://<prd>/permutas/relatorios/<tipo>` após o redeploy.
  ```
- **Impacto técnico**: regressão de runtime (ex.: dependência transitiva quebrada, env var faltando no Render) só é detectada quando um usuário clica em "Exportar". Lead-time-to-detect = manual.
- **Impacto de negócio**: usuários financeiros descobrindo a falha antes do time de eng. é experiência ruim — especialmente para uma feature pequena e visível.
- **Métrica de baseline**: 0 smoke tests automatizados pós-deploy vs. alvo ≥1 (HEAD/OPTIONS na rota nova com auth de service account).

## 5. Cards Kanban

### [deployability-1] Adicionar feature flag para o botão "Exportar"

- **Problema**
  > A rota `GET /permutas/relatorios/:tipo` e o popover "Exportar" são sempre ativos. Em caso de falha em prd (ex.: snapshot grande estourando memória do `exceljs`), a única recuperação é `git revert` + redeploy (≤10 min). Não há kill-switch em runtime nem mecanismo de canary parcial.

- **Melhoria Proposta**
  > Introduzir uma flag (env var `EXPORT_RELATORIOS_ENABLED` no backend + `NEXT_PUBLIC_EXPORT_RELATORIOS_ENABLED` no frontend, lidos via `EnvironmentProvider` no BE) que esconda o popover e devolva 404 na rota quando `false`. Tactic alvo: **Scale Rollouts**. Arquivos: `src/backend/routes/permutas.ts`, `src/frontend/app/permutas/page.tsx`, `src/frontend/lib/api.ts` (já checa flag para esconder UI).

- **Resultado Esperado**
  > Operador consegue desativar a feature em ≤1 min sem redeploy de código (apenas redeploy de env), reduzindo MTTR de 10 min → 1 min em incidente runtime.

- **Tactic alvo**: Scale Rollouts
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - Feature flags ativos sobre a rota: 0 → 1
  - MTTR esperado em incidente runtime: ~10 min (revert) → ≤1 min (flag)
- **Risco de não fazer**: durante a estabilização da v0.8 a feature será exercitada por usuários reais; uma falha de geração de XLSX expõe o botão a todos até que um revert seja feito.
- **Dependências**: nenhuma

### [deployability-2] Smoke test post-deploy da rota de export

- **Problema**
  > O CI termina em build/tag; não há verificação automatizada pós-redeploy (Render/Vercel) de que a nova rota `GET /permutas/relatorios/:tipo` responde 200 com `Content-Type` correto. Regressões de runtime (env, dependência transitiva, build do Render) só aparecem quando o time financeiro tenta usar.

- **Melhoria Proposta**
  > Adicionar job opcional `post-deploy-smoke` no `.github/workflows/ci.yml` (ou um cron leve) que, com credencial de service account, faça `HEAD /permutas/relatorios/<tipo>` em prd após o redeploy e abra issue automática em caso de falha. Alternativa low-cost: um check do tipo `curl -fI` no `health` endpoint existente como bare-minimum. Tactic alvo: **Deployment Observability**.

- **Resultado Esperado**
  > Falha de runtime na rota nova detectada em ≤5 min após deploy, sem depender de usuário-relatador.

- **Tactic alvo**: Deployment Observability
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - Smoke tests post-deploy executados: 0 → 1
  - Lead-time-to-detect regressão de runtime: manual (horas/dias) → ≤5 min
- **Risco de não fazer**: regressões silenciosas continuam descobertas por usuário; baixo impacto enquanto o produto é único-tenant, cresce quando multi-tenant chegar.
- **Dependências**: requer um endpoint/credencial de service account válido em prd (pode usar o token estável usado pelo Yuri).

## 6. Notas do agente

- Escopo intencionalmente enxuto (quick mode + feature read-only sem deps/env novos). Não rodei `npm run build` (não exigido em --quick) — tamanho de artefato declarado não medido.
- Cross-QA: o risco de `exceljs` gerar XLSX grande em memória é problema de **Performance** (cold-snapshot) e **Availability** (pressão no Render); aqui só registro o ângulo de deploy (ausência de flag/kill-switch).
- Cross-QA: a ausência de smoke post-deploy também aparece em **Testability** (testes pós-prd) — sinalizar ao consolidator para evitar card duplicado.
- Tactics N/A devidamente justificadas: Physical Grouping (monolito Render), Drift Detection (sem IaC), Per-tenant blast-radius (único tenant).
