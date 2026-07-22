---
qa: Deployability
qa_slug: deployability
run_id: 2026-07-22-1953
agent: qa-deployability
generated_at: 2026-07-22T19:55:53Z
scope: frontend
score: 7
findings_count: 3
cards_count: 2
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor da Kavex faz merge em `main` de tweak presentacional (clamp+tooltip) da frente Permutas | Push em `main` dispara CI (`.github/workflows/ci.yml`) + deploy Vercel do frontend | `src/frontend/app/permutas/components/{ui,AbaAutomaticas,VisaoGeralTable,AlocarDialog}.tsx` | Produção Columbia (Vercel), analistas financeiros ativos usando a UI de Permutas | CI verde (typecheck/lint/test) → Vercel builda e publica novo bundle; usuários veem clamp/tooltip sem regressão visual e sem downtime perceptível | Lead time commit→prd ≤ 10 min; 0 rollback necessário; 0 erros de build; nenhum tenant afetado além do target (não há tenants provisionados) |

Nota: como o delta é 100% presentacional (CSS `line-clamp-2` + atributo `title`), o cenário de
deploy não estressa integrações, DB ou lambdas. O risco de deployability aqui é
**quase inteiramente do próprio pipeline padrão**, não da mudança.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Passos automatizados commit→CI verde (frontend) | 4 (checkout, setup-node+cache, `npm ci`, typecheck/lint/test) | ≥5 (incluir `npm run build` no job frontend) | ⚠️ | `.github/workflows/ci.yml:30-46` |
| `npm run build` executado no CI do frontend | ❌ ausente no job `frontend` (presente no `backend`) | Presente | ❌ | `.github/workflows/ci.yml:44-46` (não há step `npm run build`) |
| Lockfile do frontend commitado | ✅ presente | Presente | ✅ | `src/frontend/package-lock.json` |
| `npm audit` no frontend | ❌ ausente (backend tem `--audit-level=high`) | Presente | ⚠️ | `.github/workflows/ci.yml:24` vs `44-46` |
| Reprodutibilidade do build (Node pinado) | ✅ Node 24 + `cache: npm` + `cache-dependency-path` | Pinado | ✅ | `ci.yml:19-22, 39-42` |
| Idempotência do release/tag | ✅ Tag `vX.Y.Z` só criada se não existir (`git rev-parse`) | Idempotente | ✅ | `ci.yml:59-73` |
| Rollback: revert por Git + redeploy Vercel | ✅ possível via `git revert` + auto-redeploy Vercel (padrão da plataforma) | 1 comando ou promoção de deploy anterior | ✅ | Vercel dashboard (não versionado no repo) |
| Blast radius do delta | 4 arquivos frontend, 0 backend, 0 infra, 0 SQL, 0 env | Mínimo | ✅ | `git diff --stat main` |
| Bundle size / cold start impacto do delta | ~+19 linhas em `ui.tsx`, sem novas deps | Neutro | ✅ | `git diff` de `ui.tsx` (+2 props, `line-clamp-2`) |
| Existência de `infra/`, Terraform, tenants | ausente | N/A no estado atual (Vercel/Render) | ⚠️ Não medível | `ls /tmp/permutas-clamp-wt/infra` → NO_INFRA |
| Drift detection Terraform | N/A | N/A | ⚠️ Não medível | Sem `infra/` |
| Lambda bundle p50/p95 | N/A | N/A | ⚠️ Não medível | Backend fora de escopo + ainda Express (não Lambda) |
| Lead time real commit→prd (Vercel) | ⚠️ Não medível localmente | ≤10 min | ⚠️ | Requer telemetria Vercel |

> ⚠️ **Não medível localmente**: latência real de deploy Vercel e sucesso por ambiente. Requer
> integração de webhook Vercel → observabilidade (ou consulta manual ao dashboard). Recomendação:
> logar o `deployment.succeeded` do Vercel em um canal do Slack para instrumentar lead time.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Scale Rollouts (canary / blue-green / rolling) | Vercel promove por commit em `main`; preview deployments em PR funcionam como canary informal | ⚠️ parcial | Vercel default (não versionado); nenhum gate no `ci.yml` restringe rollout por percentual |
| Rollback | `git revert` + redeploy automático Vercel; promoção de deploy anterior via UI Vercel | ✅ presente | Padrão da plataforma; delta não introduz stateful migration |
| Script Deployment Commands | `npm run build` no `package.json`; Vercel usa isso automaticamente | ✅ presente | `src/frontend/package.json:7` |
| Logical Grouping | Frente Permutas isolada em `app/permutas/`; delta contido em `components/` | ✅ presente | `app/permutas/components/ui.tsx` etc. |
| Physical Grouping | Frontend estático servido pela Vercel edge; backend/infra separados | ✅ presente | Monorepo `src/frontend` vs `src/backend` |
| Package Dependencies | `package-lock.json` commitado; sem nova dependência no delta | ✅ presente | `src/frontend/package-lock.json`; `git diff` mostra 0 mudanças em `package.json` |
| Surge Protection | CDN Vercel absorve pico de tráfego frontend estático | ✅ presente (herdado da plataforma) | N/A no repo |
| Idempotent Deploys | Vercel deploys são por commit-sha; tag release idempotente (`git rev-parse "$TAG"`) | ✅ presente | `ci.yml:66-69` |
| Reproducible Builds | Node 24 pinado; lockfile; sem timestamps embutidos no bundle Next | ✅ presente | `ci.yml:19-22, 39-42` |
| Drift Detection | N/A — não há Terraform/infra estado atual | N/A | `docs-contexto` + CLAUDE.md §Estado Atual vs. Alvo |
| Per-tenant blast-radius limit | N/A — não há tenants provisionados ainda | N/A | CLAUDE.md §Tenants (tabela vazia) |
| Deployment observability | ⚠️ parcial — CI reporta status via GitHub; Vercel deploy status apenas no dashboard | ⚠️ parcial | `ci.yml` não posta em Slack/observabilidade |
| Build step no CI (frontend) | ❌ ausente — CI do frontend não roda `npm run build`, só typecheck/lint/test | ❌ ausente | `ci.yml:30-46` (compare com backend `ci.yml:10-28`) |

## 4. Findings (achados)

### F-deployability-1: CI do frontend não executa `npm run build`

- **Severidade**: P2 (débito técnico defensável — Vercel builda no seu lado, mas divergência FE↔BE cria janela cega)
- **Tactic violada**: Script Deployment Commands + Reproducible Builds (parcial)
- **Localização**: `.github/workflows/ci.yml:30-46`
- **Evidência (objetiva)**:
  ```yaml
  frontend:
    steps:
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --coverage
      # <-- SEM `npm run build`, enquanto o job `backend` tem `- run: npm run build`
  ```
- **Impacto técnico**: erros de build específicos do Next (ex.: SSR/edge, tree-shaking, dynamic
  imports, incompatibilidade React 19 x lib) só aparecem quando Vercel builda. Se Vercel falhar
  o deploy, o feedback é fora do PR — o merge foi feito com CI verde.
- **Impacto de negócio**: falhas de build só descobertas pós-merge geram rollback manual e atrasam
  entregas para a Columbia. Baixa frequência esperada (Next é estável), mas custo alto quando ocorre.
- **Métrica de baseline**: 0 de 3 workflows do frontend rodam `npm run build`. Backend roda 1 de 1.
  Delta atual (clamp+tooltip): risco desprezível — sem novas deps, sem SSR, sem lógica.

### F-deployability-2: Ausência de `npm audit` no job frontend

- **Severidade**: P2 (débito de higiene — não bloqueia este delta, que não muda `package.json`)
- **Tactic violada**: Package Dependencies (verificação passiva)
- **Localização**: `.github/workflows/ci.yml:44` (falta o step)
- **Evidência (objetiva)**:
  ```yaml
  # backend tem:
  - run: npm audit --audit-level=high
  # frontend não tem equivalente
  ```
- **Impacto técnico**: vulnerabilidades `high` em deps do frontend (React 19, Next 16, Radix) passam
  em silêncio até auditoria manual.
- **Impacto de negócio**: exposição de front (que serve o Financeiro da Columbia) a CVEs de dependências
  transitivas sem alerta de pipeline.
- **Métrica de baseline**: 40 deps totais no frontend (23 dep + 17 devDep). 0 auditadas no CI.

### F-deployability-3: Observabilidade de deploy Vercel não integrada ao pipeline

- **Severidade**: P3 (melhoria opcional — não afeta o delta em revisão)
- **Tactic violada**: Deployment Observability
- **Localização**: `.github/workflows/ci.yml` (não há step pós-merge que consulte Vercel)
- **Evidência (objetiva)**:
  ```
  CI termina em `tag-release` (linha 48-73). Nenhuma verificação de que o deploy Vercel
  correspondente ao commit ficou saudável, nem post no Slack, nem smoke test.
  ```
- **Impacto técnico**: lead time real commit→prd não é medível pelo time sem entrar no dashboard Vercel.
  Nenhum alerta automático se o build Vercel falhar.
- **Impacto de negócio**: MTTR de incidentes de deploy depende de alguém notar visualmente ou de o
  cliente reportar. Aceitável enquanto não há SLA formal, mas atrita quando começarem a existir tenants.
- **Métrica de baseline**: 0 hooks Vercel→Slack/observabilidade configurados no repo.

## 5. Cards Kanban

### [deployability-1] Adicionar `npm run build` ao job frontend do CI

- **Problema**
  > O job `frontend` no `.github/workflows/ci.yml` roda typecheck/lint/test mas **não** roda
  > `npm run build`. Erros específicos do Next (SSR, edge runtime, tree-shaking, incompat de libs)
  > só aparecem no build da Vercel, após o merge — feedback tardio, fora do PR.

- **Melhoria Proposta**
  > Adicionar `- run: npm run build` ao job `frontend` do `ci.yml`, espelhando o job `backend`.
  > Manter o `cache: npm` já configurado para não regredir lead time do CI. Tactic Bass alvo:
  > **Script Deployment Commands** + reforço de **Reproducible Builds**.

- **Resultado Esperado**
  > CI pega falhas de build Next antes do merge. Divergência entre "CI verde" e "Vercel deploy"
  > eliminada.

- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P2
- **Esforço estimado**: S (≤1d — 1 linha de YAML + validação)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - Steps automatizados no job frontend: 4 → 5
  - Cobertura de build no CI (jobs FE+BE): 1/2 → 2/2
- **Risco de não fazer**: quando o delta for maior que presentacional (rota nova, dynamic import,
  server component), erro de build só será descoberto em produção Vercel; rollback manual.
- **Dependências**: nenhuma

### [deployability-2] Adicionar `npm audit --audit-level=high` ao job frontend

- **Problema**
  > O job `backend` do CI executa `npm audit --audit-level=high`; o job `frontend` não tem
  > equivalente. 40 dependências FE (Next 16, React 19, Radix, Zod, etc.) sem gate automático
  > para CVEs `high`+.

- **Melhoria Proposta**
  > Adicionar `- run: npm audit --audit-level=high` após `npm ci` no job `frontend`. Se houver
  > falso-positivo persistente, documentar exceção via `npm audit --production` ou allowlist
  > (`.npmrc`), não remover o gate. Tactic Bass alvo: **Package Dependencies**.

- **Resultado Esperado**
  > CVEs high+ em deps do frontend viram falha de PR, não descoberta manual.

- **Tactic alvo**: Package Dependencies
- **Severidade**: P2
- **Esforço estimado**: S (≤1d — 1 linha + eventual triagem)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - Jobs com `npm audit` no CI: 1/2 → 2/2
  - CVEs `high` detectadas em PR: 0 (via processo) → gate automático
- **Risco de não fazer**: CVEs high de deps FE em produção sem sinal, expondo o painel Financeiro
  da Columbia; auditoria manual só quando alguém lembrar.
- **Dependências**: nenhuma

## 6. Notas do agente

- Delta é presentacional (`line-clamp-2` + `title=`), sem novas deps, sem infra tocada — deployability
  do próprio delta é P3/N/A. Findings são do **pipeline padrão**, não da mudança.
- Não medi Terraform/tenants/Lambda bundle porque **não existem** hoje (Estado Atual = Express/Render + Vercel);
  declarei N/A com justificativa em vez de inflar métricas.
- Lead time real Vercel e sucesso de deploy exigem telemetria externa; não é medível apenas via repo.
- Cross-QA para o consolidator: F-deployability-1 (build no CI) sobrepõe potencialmente com
  **testability** (build como gate de qualidade) e F-deployability-2 com **security** (SCA). Consolidator
  pode fundir os cards se preferir single-owner.
- Não rebaixei nada para P0/P1 por falta de baseline numérico de impacto em prd — respeitando a regra 7 do template.
