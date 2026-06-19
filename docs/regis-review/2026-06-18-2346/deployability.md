---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-18-2346
agent: qa-deployability
generated_at: 2026-06-19T00:00:00-03:00
scope: backend
score: 7
findings_count: 3
cards_count: 3
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev mergeia PR com nova taxonomia de bloqueio (`JA_PERMUTADO`) e campo opcional `moedaNegociada` em `Adiantamento` | `push` em `main` dispara `.github/workflows/ci.yml` (jobs `backend`, `frontend`, `tag-release`, `deploy-backend`) | Express backend em Render (`src/backend/`) + Next.js Vercel (`src/frontend/`); fronteira de wire entre BE→FE é o JSON de `GestaoPermutasResponse` | Produção single-tenant (Columbia), sem multi-conta AWS — alvo Lambda/Terraform ainda inexistente | Backend redeployado idempotentemente; FE servindo build estático compatível com BE antigo durante a janela de ~2min de troca de revisão Render; nenhum cliente lê string indefinida nem KPI ausente | Deploy success rate 100%, lead time `commit → /health 200` ≤ 5 min, rollback ≤ 1 redeploy do SHA anterior, zero quebra de contrato BE→FE no intervalo de skew |

> Esta mudança é pure-code (sem migration, sem novo SSM, sem novo endpoint). O risco de deploy reduz a (a) ordem BE-antes-FE para os novos discriminantes (`'ja-permutado'`, `'casamento-manual'`) e (b) compatibilidade reversa do tipo união `StatusElegibilidade` enquanto Render e Vercel sobem em janelas independentes.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Steps automatizados commit→prd (backend) | 7 (`checkout`, `setup-node`, `npm ci`, `npm audit --audit-level=high`, `typecheck`, `lint`, `test --coverage`, `build`, `migrate`, `Render hook`, `smoke /health`) | ≥ 5 | ✅ | `.github/workflows/ci.yml:9-132` |
| Pre-deploy gate (typecheck + lint + tests) bloqueia deploy | Sim (`needs: backend` em `deploy-backend`) | Presente | ✅ | `.github/workflows/ci.yml:75-78` |
| Smoke test pós-deploy | `curl --retry 12 --retry-delay 10 /health` (skip quando secret faltar) | Presente e obrigatório | ⚠️ | `.github/workflows/ci.yml:118-132` (skip ao invés de fail quando `RENDER_BACKEND_URL` ausente) |
| Migrations idempotentes antes do deploy | Sim (`npm run migrate`, `schema_migrations`) | Presente | ✅ | `.github/workflows/ci.yml:96-100` |
| Reprodutibilidade do build | `package-lock.json` commitado; `npm ci`; `node 24` pinado; deps do diff: zero (apenas TS) | Lockfile + Node pinado + sem deps novas | ✅ | `src/backend/package-lock.json`, `ci.yml:18-22` |
| Build size (Render runtime) | n/a (Render roda `npm start` em `dist/` — sem zip Lambda) | n/a no alvo atual | N/A | `package.json:scripts.start` |
| Reversibilidade do contrato BE→FE para esta mudança | Campo `moedaNegociada?: string` opcional; novo motivo `'ja-permutado'` adicionado à união (FE precisa renderizar o motivo desconhecido sem crash); novo estado `'casamento-manual'` em `StatusElegibilidade` exige FE atualizado para KPI/badge | Forward+backward compatible | ⚠️ | `Adiantamento.ts:42-49`, `EstadoElegibilidade.ts:35-43`, `Gestao.ts:8` |
| Rollback path | 1-click no Render dashboard (manual) + tag git `vX.Y.Z` por release | Rollback ≤ 1 comando / ≤ 5 min | ⚠️ | `ci.yml:48-73` (tag-release idempotente); nenhum script `rollback.sh` |
| Drift detection (infra) | N/A — não existe `infra/` | N/A no estado atual | N/A | repo root |
| `terraform plan` gating | N/A — não existe Terraform | N/A no estado atual | N/A | repo root |
| Lambda bundle p50/p95 | N/A — não há Lambda; Express direto | N/A no estado atual | N/A | `package.json:main` |
| Lead time commit → /health (estimado) | ~3–5 min (npm ci + tests + build + Render boot + 12×10s retry máx) | ≤ 10 min | ✅ | `ci.yml` workflow shape |
| Frontend deploy gating | FE em `tag-release`/Vercel sem `needs: frontend`-tests para o deploy; `frontend` job só roda em PR/push (typecheck+lint+tests sem gate explícito de deploy) | FE gating simétrico ao BE | ⚠️ | `ci.yml:30-46` (sem job `deploy-frontend` no repo; Vercel auto-deploya `main`) |

> ⚠️ **Não medível localmente** em `--quick`: tempo real de `commit→/health` em produção (requer histórico GitHub Actions); taxa de sucesso de deploy histórica (requer GitHub API); duração do `npm run build` no runner CI (skipped por `--quick`).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Scale Rollouts (canary / blue-green / rolling) | Render redeploya em revisão única; sem canary para esta mudança. Aceitável porque o feature é puramente backwards-additive (campo opcional + novo literal de enum), mas FE/BE sobem em janelas separadas (Render hook + Vercel auto-deploy) sem coordenação | ⚠️ parcial | `ci.yml:75-132` (Render hook único); ausência de `deploy-frontend` job |
| Rollback | Tag git por versão (`tag-release` idempotente), redeploy manual no Render do SHA anterior. Sem script automatizado, sem alias `previous` | ⚠️ parcial | `ci.yml:48-73` |
| Script Deployment Commands | CI workflow é o script de deploy (declarativo, versionado). `npm run migrate` idempotente. Smoke step com retry | ✅ presente | `ci.yml` integral |
| Logical Grouping | BE e FE separados em jobs com `defaults.run.working-directory` distintos; `tag-release` agrega versão FE+BE em lockstep | ✅ presente | `ci.yml:10-46,48-73` |
| Physical Grouping | BE = Render Web Service; FE = Vercel. Separação física limita blast radius (queda do FE não derruba BE e vice-versa) | ✅ presente | `ci.yml` (Render hook), CLAUDE.md "Estado Atual" |
| Package Dependencies | `npm ci` + lockfile + `npm audit --audit-level=high` no CI. Mudança desta feature: zero dependências novas (puro TS) | ✅ presente | `ci.yml:23-24`, diff vazio em `package.json` |
| Surge Protection | `express-rate-limit` no backend (já instalado); irrelevante para esta mudança que não muda rota nem custo de IO | N/A | `package.json:dependencies` |
| Idempotent deploys | `npm run migrate` idempotente via `schema_migrations`; `tag-release` checa tag existente antes de criar; esta mudança não muda schema | ✅ presente | `ci.yml:65-72,96-100` |
| Drift detection | N/A — não há infra declarativa (sem Terraform, sem ECS task def); Render gerencia runtime fora do repo | N/A | repo root (sem `infra/`) |
| Reproducible builds | Lockfile commitado, `npm ci`, Node `24` pinado, sem `Date.now()` em build, deps pinadas com `^` (range padrão) | ✅ presente | `package.json`, `package-lock.json`, `ci.yml:18-22` |
| Per-tenant blast-radius limit | N/A — single-tenant hoje (Columbia). Alvo multi-tenant ainda não materializado | N/A | CLAUDE.md §Tenants ("vazio") |
| Deployment observability | Smoke test bate `/health`; falha do `migrate` aborta deploy; sem dashboard de deploy success rate, sem alerta de regressão de SLO pós-deploy | ⚠️ parcial | `ci.yml:118-132` |
| Configure Behavior (feature flag por front) | Esta mudança é additive: novo motivo `'ja-permutado'` aparece sem flag; FE renderiza ou ignora. Sem feature flag dedicado, mas o `EstadoElegibilidade` opera como discriminante natural | ⚠️ parcial | `EstadoElegibilidade.ts:35-43` |

## 4. Findings (achados)

### F-deployability-1: Skew BE↔FE no deploy do novo estado `'casamento-manual'` (`StatusElegibilidade`)

- **Severidade**: P1 (alto — degrada Deployability mensurável)
- **Tactic violada**: Scale Rollouts (deploy coordenado FE/BE), Configure Behavior (sem flag para esconder o novo discriminante até FE estar atualizado)
- **Localização**: `src/backend/domain/interface/permutas/Gestao.ts:8`, `src/backend/domain/interface/permutas/EstadoElegibilidade.ts:12-18`, `src/frontend/lib/types.ts`, `src/frontend/app/permutas/page.tsx`
- **Evidência (objetiva)**:
  ```ts
  // Backend (novo):
  export type StatusElegibilidade = 'elegivel' | 'bloqueada' | 'casamento-manual';
  resumo: { ...; casamentoManual: number; }
  ```
  ```yaml
  # CI: backend deploya via Render hook; frontend deploya via Vercel (auto-deploy on push to main),
  # sem dependency entre eles. Janela de skew = Δ(Vercel build) - Δ(Render redeploy).
  ```
- **Impacto técnico**: durante a janela de skew (Render finaliza ~2min antes/depois de Vercel) o FE antigo recebe `status: 'casamento-manual'` num discriminante que não conhece e pode renderizar badge vazia ou cair em `default`-branch sem badge; o KPI `casamentoManual` aparece zerado num FE antigo, ou ausente num FE novo apontado para BE antigo.
- **Impacto de negócio**: operador vê uma fração das candidatas N:M sem badge nem KPI até a janela fechar (minutos), causando confusão e potencial retrabalho ("sumiu da tela"). Não há perda de dado, mas a percepção de bug mina a confiança no rollout da Fatia 1.
- **Métrica de baseline**: janela de skew estimada = 1× ciclo de Vercel (~60–120s) + 1× ciclo Render (~60–180s) = **até ~5min** sem coordenação; KPIs ausentes em até **1× polling do dashboard** (depende do refetch do FE).

### F-deployability-2: Smoke test pós-deploy só verifica `/health`, não a forma do contrato

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Deployment observability (regressão de contrato passa silenciosa)
- **Localização**: `.github/workflows/ci.yml:118-132`
- **Evidência (objetiva)**:
  ```yaml
  curl --retry 12 --retry-delay 10 --retry-all-errors -f \
    "${RENDER_BACKEND_URL%/}/health"
  ```
- **Impacto técnico**: um deploy que sobe mas devolve `GestaoPermutasResponse` malformado (ex.: `resumo.casamentoManual` ausente, motivo `'ja-permutado'` typo) passa pelo smoke (HTTP 200 em `/health`) e atinge o FE. A mudança desta review aumenta a superfície de contrato (1 novo campo + 4 novos literais de enum) sem assert correspondente.
- **Impacto de negócio**: regressão de contrato chega ao operador antes do CI detectar; MTTR depende de alguém abrir a tela.
- **Métrica de baseline**: cobertura do smoke = **1 endpoint** (`/health`); endpoints do domínio Permutas tocados por esta mudança = **3** (gestão, processar, eleição). 1/3 = **33% de superfície coberta**, alvo razoável ≥ 1 endpoint crítico de Permutas (≥ 50%).

### F-deployability-3: Skip do smoke quando `RENDER_BACKEND_URL` ausente vira green sem cobertura

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Deployment observability, Rollback (sem trigger automático)
- **Localização**: `.github/workflows/ci.yml:122-132`
- **Evidência (objetiva)**:
  ```yaml
  if [ -z "$RENDER_BACKEND_URL" ]; then
    echo "::warning::RENDER_BACKEND_URL secret is not set — skipping smoke test"
    exit 0
  fi
  ```
- **Impacto técnico**: enquanto o secret não estiver provisionado, todo deploy é declarado verde sem nenhuma verificação pós-boot. Não houve mudança no secret nesta feature, mas a janela de exposição abrange esta release.
- **Impacto de negócio**: deploy quebrado pode chegar à produção sem sinal; rollback exige observação humana.
- **Métrica de baseline**: smoke executado = **0% das releases** enquanto secret ausente; alvo = **100%**.

## 5. Cards Kanban

### [deployability-1] Coordenar deploy BE/FE para o novo `'casamento-manual'` (Render → Vercel)

- **Problema**
  > A nova união `StatusElegibilidade = ... | 'casamento-manual'` e o KPI `resumo.casamentoManual` viajam em janelas independentes de deploy (Render hook + Vercel auto-deploy on push). Durante a janela de skew o FE antigo recebe um literal desconhecido e o FE novo pode chegar antes do BE, mostrando KPI vazio.

- **Melhoria Proposta**
  > Adicionar job `deploy-frontend` no `ci.yml` com `needs: [backend, deploy-backend]` e usar Vercel CLI (`vercel deploy --prod`) com token, ao invés do auto-deploy do Vercel. Como mitigação adicional, defender o FE com fallback de render para `status` desconhecido (`default → 'bloqueada'` ou badge neutra) e KPI `casamentoManual ?? 0`. Tactic: Scale Rollouts (rolling coordenado) + Configure Behavior (fallback defensivo).

- **Resultado Esperado**
  > Deploy BE termina e smoke `/health` passa antes do FE começar a publicar. Janela de skew BE→FE: **~5 min → ≤ 30s** (apenas swap atomic do Vercel). FE antigo nunca recebe `'casamento-manual'`. Skew oposto (FE novo + BE antigo) trata KPI ausente sem crash.

- **Tactic alvo**: Scale Rollouts, Configure Behavior
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - Janela de skew BE→FE: ~5min → ≤30s
  - % de deploys com FE/BE coordenados: hoje 0% → 100%
- **Risco de não fazer**: a cada nova união discriminada (motivos, estados) o operador vê glitch visual por minutos pós-deploy; mina confiança no rollout sequencial (Permutas → SISPAG → Popula GED previstos para 90d).
- **Dependências**: secret `VERCEL_TOKEN` provisionado.

### [deployability-2] Smoke test de contrato Permutas pós-deploy (`/permutas/gestao?dry-run`)

- **Problema**
  > O smoke pós-deploy só toca `/health`. Esta mudança adiciona 1 campo opcional e 4 literais de enum à `GestaoPermutasResponse`. Um deploy que sobe mas devolve payload com typo (`'ja-permutado'` vs. `'já-permutado'`) ou `resumo.casamentoManual` faltando passa pelo CI e atinge o operador.

- **Melhoria Proposta**
  > Acrescentar passo após `/health` que bate `GET /permutas/gestao?filial=<dev>&dryRun=1` e valida o payload com Zod (mesmo schema usado em runtime). Idealmente reusar o `gestaoPermutasResponseSchema` (criar se não existir). Tactic: Deployment observability (contract smoke).

- **Resultado Esperado**
  > Smoke cobre **≥ 50% dos endpoints críticos de Permutas** (1/3 → 2/3 com gestão). Regressão de contrato detectada no CI antes do FE consumir.

- **Tactic alvo**: Deployment observability, Script Deployment Commands
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - Endpoints do domínio Permutas no smoke: 0 → 1 (gestão)
  - Detecção de contrato quebrado: pós-deploy via observação humana → pré-tráfego no CI
- **Risco de não fazer**: a próxima mudança de enum (`SISPAG`, `Popula GED`) repete a mesma exposição em escala maior.
- **Dependências**: necessita rota `gestao` aceitar `dryRun=1` (ou um tenant `dev` no Render acessível à action).

### [deployability-3] Falhar (não pular) o smoke quando `RENDER_BACKEND_URL` ausente

- **Problema**
  > Quando o secret `RENDER_BACKEND_URL` não está setado o smoke devolve `exit 0` com warning, declarando deploy verde sem nenhuma verificação. Esta release é deployada nesse regime.

- **Melhoria Proposta**
  > Provisionar o secret `RENDER_BACKEND_URL` no repositório (one-time) e trocar `exit 0` por `exit 1` no branch sem secret. Tactic: Deployment observability, Rollback (sinaliza quando reverter).

- **Resultado Esperado**
  > 100% dos deploys executam smoke. Deploy quebrado falha CI e dispara revert manual antes do tráfego real chegar.

- **Tactic alvo**: Deployment observability
- **Severidade**: P2
- **Esforço estimado**: S (≤1d, basicamente setar secret + 2-linha edit)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - % releases com smoke executado: 0% (enquanto secret faltar) → 100%
- **Risco de não fazer**: deploy quebrado chega ao operador sem sinal; MTTR explode pela latência humana.
- **Dependências**: acesso ao Settings → Secrets do repo (Yuri).

## 6. Notas do agente

- Escopo: mudança é pure-code (1 campo opcional + literais novos de enum). Sem migration, sem novo SSM/env, sem nova rota — Deployability raw da mudança é boa; o débito real está na **coordenação BE↔FE** e na **observabilidade pós-deploy**, ambas pré-existentes mas amplificadas por esta union-type-driven feature.
- Não medi tempos reais de pipeline (`--quick`); estimativas em §2 vêm de leitura estática do workflow e shape de Render free tier (~60–180s boot). O consolidator pode descontar se tiver dados históricos de Actions.
- Cross-QA links: **Modifiability** — adicionar literal a `StatusElegibilidade` é uma união discriminada; deveria coexistir com type-narrowing exaustivo no FE (cross-link com qa-modifiability). **Testability** — `[deployability-2]` reusa schema Zod compartilhado, cruza com testabilidade do contrato. **Availability** — smoke pulado (F-deployability-3) afeta diretamente MTTD de deploy quebrado.
- Findings P0/P1: F-deployability-1 tem baseline numérico (~5min skew), sustenta P1. Demais são P2.
