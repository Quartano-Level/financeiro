---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-25-1713
agent: qa-deployability
generated_at: 2026-06-25T17:13:00-03:00
scope: backend,frontend
score: 6
findings_count: 4
cards_count: 4
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Equipe (merge na `main`) | Deploy de feature que expõe **endpoint de ESCRITA financeira em lote** (`POST /permutas/reconciliar-lote`) e botão "Executar todas" no front | `src/backend/routes/permutas.ts` + `ReconciliacaoLotePermutaService` + `src/frontend/app/permutas/page.tsx` | Produção Render (BE) + Vercel (FE), gates `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` no ERP | Deploy aditivo (rota nova, sem migração, sem nova env var); se algo der errado em prd, é possível **desligar a ação sem redeploy** e fazer rollback em ≤1 release | Lead time commit→prd ≤15 min; rollback ≤5 min; kill-switch da ação ≤1 min sem redeploy; 0 borderôs criados em prd com gate desligado |

> Esta feature é **backward-compatible** (rota nova; nenhuma rota existente muda contrato; sem schema change). O risco de deploy não é quebrar o que já existe — é **expor um botão capaz de criar dezenas de borderôs reais no `fin010` em um único clique** antes do gate de escrita estar validado em prd.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Novas dependências runtime no delta | 0 | 0 (aditivo) | ✅ | `git diff src/backend/package.json src/frontend/package.json` (não tocados) |
| Novas env vars exigidas | 0 | 0 (reusa `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`) | ✅ | shared-metrics + grep `CONEXOS_WRITE_ENABLED` no delta |
| Migrações DB no delta | 0 | 0 | ✅ | nenhum `migrations/` tocado no delta |
| Rotas alteradas (breaking) | 0 | 0 | ✅ | `permutas.ts:426` adiciona rota; `/adiantamentos/:docCod/reconciliar` intacto |
| Pipeline CI cobre o delta (typecheck+lint+test+build) | sim, 5 steps BE + 4 FE em `.github/workflows/ci.yml` | ≥4 steps por app | ✅ | `.github/workflows/ci.yml:11-29` |
| Tag/Release automático na main | sim, `tag-release` job idempotente lê `package.json` | presente | ✅ | `.github/workflows/ci.yml:50-78` |
| Gate de aprovação (environment protection rule) antes do deploy prd | não declarado no repo | presente em rota de ESCRITA financeira | ⚠️ | `.github/workflows/ci.yml` (nenhum `environment:` com required reviewers) |
| Kill-switch da ação "Executar todas" sem redeploy | **ausente** — botão habilitado por constante hardcoded `PROCESSAMENTO_HABILITADO = true` | toggle por env var ou remote config | ❌ | `src/frontend/app/permutas/page.tsx:86` |
| Tactic "Rollback" — versão anterior disponível | ⚠️ Render mantém deploy anterior (rollback ~1 click), porém não documentado neste delta | documentado em runbook | ⚠️ | inspeção Render dashboard (fora do repo) |
| Tactic "Scale Rollouts" (canary/blue-green) | ausente — deploy é all-or-nothing (Render) | canary ou feature flag por usuário | ⚠️ | infra atual Render/Vercel |
| Drift detection infra | N/A (sem Terraform/IaC) | — | N/A | CLAUDE.md §"Estado Atual" |
| Build determinístico (lockfile + node version pinada) | ✅ `package-lock.json` commitado + `node-version: '24'` no CI | presente | ✅ | `.github/workflows/ci.yml:18-19` |

> ⚠️ **Não medível localmente**: lead time real commit→prd (depende de Render webhook + Vercel build), taxa de sucesso de deploy histórica, MTTR de rollback. Requer logs do Render/Vercel e histórico de releases. Recomendação: adicionar coleta básica via `gh release list --limit 20` + tempos do Render dashboard ao runbook.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Scale Rollouts** (canary / blue-green / rolling) | Deploy Render/Vercel é all-or-nothing; sem canary. Para esta feature de escrita em lote, a única "canary" viável hoje é manter `CONEXOS_DRY_RUN=true` por algumas horas após deploy. | ⚠️ parcial | `CLAUDE.md` §Estado Atual; ausência de `environment:` no `ci.yml` |
| **Rollback** | Render guarda histórico de deploys (1-click rollback); rota é aditiva → revert do PR também é seguro. Não documentado em runbook. | ⚠️ parcial | Render dashboard (fora do repo); `git revert` aditivo |
| **Script Deployment Commands** | CI executa `npm ci → audit → typecheck → lint → test → build` por app; tag/release idempotente. Sem step explícito de deploy (delegado ao webhook Render/Vercel). | ✅ presente | `.github/workflows/ci.yml:11-78` |
| **Logical Grouping** | Frontend e backend deployam separados (mesmo commit, jobs paralelos no CI). Risco baixo de drift FE↔BE neste delta (rota é aditiva e tipos compartilhados via `lib/types.ts`). | ✅ presente | `ci.yml` jobs `backend` e `frontend` separados |
| **Physical Grouping** | Render = backend único, Vercel = frontend único. Sem segregação física por cliente (ainda não há multi-tenant). | N/A (alvo) | CLAUDE.md §Tenants — vazio |
| **Package Dependencies** | Lockfiles commitados (`package-lock.json` BE+FE), node 24 pinado no CI, `npm ci` (não `npm install`). Delta não adiciona dependência. | ✅ presente | `.github/workflows/ci.yml:18-25,40-47` |
| **Surge Protection** | `heavyRouteLimiter` (10 req/min/IP) aplicado na rota `/permutas/reconciliar-lote`. Protege ERP de fan-out. Justamente o motivo de o lote ser server-side (1 request) em vez de loop no front (26+). | ✅ presente | `routes/permutas.ts:429`, `http/rateLimit.ts:20-26` |
| **Idempotent deploys** | Tag/release idempotente (`git rev-parse "$TAG" >/dev/null` antes de criar). Rota é aditiva (idempotência do deploy ≠ idempotência da ação — esta última está coberta no `permuta_alocacao_execucao`). | ✅ presente | `ci.yml:63-72` |
| **Reproducible builds** | Lockfile + node version pinada + `npm ci`. Sem cache busting não-determinístico observado no delta. | ✅ presente | `ci.yml` |
| **Drift detection** | N/A — sem IaC. | N/A | CLAUDE.md §Estado Atual |
| **Per-tenant blast-radius limit** | N/A (single-tenant hoje). Quando vier multi-tenant, esta ação merece flag por tenant. | N/A (alvo) | — |
| **Deployment observability** | Logs estruturados do `LogService` cobrem a rota; sem métrica/alerta dedicado a "borderôs criados por lote" pós-deploy. | ⚠️ parcial | `ReconciliacaoLotePermutaService` agrega resultado mas não emite métrica externa |
| **Feature flag (kill-switch da ação)** | Hardcoded `const PROCESSAMENTO_HABILITADO = true` no `page.tsx:86`. Desligar exige redeploy (FE) → lead time de minutos quando incidente. Os gates `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` existem no BE e podem servir de kill-switch de emergência, mas desligam **toda** escrita do ERP (martelo), não só o botão "Executar todas". | ❌ ausente para a ação específica | `src/frontend/app/permutas/page.tsx:86`; `EnvironmentProvider.ts:69-70` |

## 4. Findings (achados)

### F-deployability-1: Botão "Executar todas" não tem kill-switch sem redeploy

- **Severidade**: P1 (alto — degrada QA mensurável: MTTR de incidente desta ação)
- **Tactic violada**: Feature flag / Surge Protection (controle granular sem redeploy)
- **Localização**: `src/frontend/app/permutas/page.tsx:86`, `:1841`, `:2158`
- **Evidência (objetiva)**:
  ```ts
  // page.tsx:86
  const PROCESSAMENTO_HABILITADO = true
  // ...
  disabled={!PROCESSAMENTO_HABILITADO || executandoLote || loteResumo.adtos === 0}
  ```
  O único toggle que governa o botão é uma constante hardcoded no bundle Next.js. Desligar o botão em incidente exige: editar arquivo → PR → CI → deploy Vercel (vários minutos).
- **Impacto técnico**: Se em prd a primeira execução do lote produzir efeito colateral inesperado (e.g., borderô em filial errada, fan-out estrangulando Conexos), a única forma de impedir cliques subsequentes é (a) derrubar `CONEXOS_WRITE_ENABLED` no BE — martelo que paralisa **toda** escrita, inclusive a baixa individual já validada — ou (b) reverter o PR e esperar o pipeline.
- **Impacto de negócio**: Em uma feature que cria ~26 borderôs no `fin010` por clique, lead time de mitigação ≥5min vira retrabalho contábil (estorno manual de borderôs criados sob alerta). Stakeholder operacional bloqueado durante o intervalo.
- **Métrica de baseline**: MTTR para desligar a ação hoje = **tempo de redeploy FE** (estimado 3–8 min Vercel) **OU** matar `CONEXOS_WRITE_ENABLED` (impacta também a baixa individual em uso). Alvo: ≤1 min, sem redeploy, sem impactar a baixa individual.

### F-deployability-2: Sem gate de aprovação manual no deploy para prd da rota de escrita em lote

- **Severidade**: P2 (médio — débito defensável: rota é admin-only + rate-limited, mas é a primeira ESCRITA em lote)
- **Tactic violada**: Scale Rollouts (deploy gating)
- **Localização**: `.github/workflows/ci.yml` (todo o arquivo) — nenhum `environment:` com `required_reviewers`; deploy real é via webhook Render/Vercel disparado por push em `main`.
- **Evidência (objetiva)**:
  ```yaml
  # ci.yml — só faz CI + tag idempotente; não há job "deploy" com gate manual
  on:
    push:
      branches: [main, dev]
  ```
- **Impacto técnico**: Merge em `main` → Render/Vercel buildam e promovem automaticamente. Não há etapa "human approval" antes de a rota de escrita em lote ir ao ar.
- **Impacto de negócio**: Para a primeira release de uma capability de write-em-lote, ausência de gate aumenta probabilidade de "rolou em prd sem o ops perceber". Acoplado a F-deployability-1, fecha o ciclo: deploy automático + kill-switch lento = janela de exposição maior.
- **Métrica de baseline**: # de aprovações humanas exigidas entre `git push origin main` e endpoint vivo em prd = **0**. Alvo (para rotas de escrita financeira): ≥1 (`environment: production` no Render hook, ou GitHub Environment com reviewer).

### F-deployability-3: Runbook de rollback/desligamento da ação ausente

- **Severidade**: P2 (médio — sem documento de incidente para a ação mais poderosa do módulo)
- **Tactic violada**: Rollback (procedimento explícito) + Deployment observability
- **Localização**: `docs/` — sem `runbook-executar-lote.md` neste delta; nenhum item em `ontology/_inbox/permutas-executar-automaticas-tasks.md` cobre o procedimento de "matar a ação em prd".
- **Evidência (objetiva)**: `find docs -name "runbook*"` retorna 0 arquivos relevantes para esta ação.
- **Impacto técnico**: On-call em incidente precisa derivar do código: "qual env var desligo?", "rollback é em Render ou Vercel?", "consigo só desabilitar o botão?". Tempo cognitivo durante o pior momento.
- **Impacto de negócio**: MTTR depende do conhecimento individual do plantonista. Sem runbook, primeira pessoa de plantão a pegar isso vai improvisar.
- **Métrica de baseline**: # de runbooks da feature = **0**. Alvo: 1 runbook (≤1 página) listando: (a) desligar via toggle FE (depende de F-deployability-1), (b) desligar via `CONEXOS_WRITE_ENABLED=false` (martelo), (c) reverter PR, (d) como verificar quantos borderôs foram criados durante a janela.

### F-deployability-4: Sem sinal pós-deploy dedicado para "primeira execução em lote em prd"

- **Severidade**: P3 (baixo — melhoria de observabilidade de deploy)
- **Tactic violada**: Deployment observability
- **Localização**: `ReconciliacaoLotePermutaService.ts` (agrega resultado, mas não emite métrica externa); sem alerta configurado.
- **Evidência (objetiva)**: Service retorna `{ totalAdtos, sucesso, falhas, items[] }` por response, mas não há log estruturado de alto nível ("LOTE_EXECUTADO") emitindo `n_borderos_criados`, `duracao_ms`, `executado_por` para fácil filtro/alerta no dashboard de log.
- **Impacto técnico**: Após o deploy, descobrir "alguém clicou? quantos borderôs? quanto tempo?" exige varrer logs do request inteiro.
- **Impacto de negócio**: Sem sinal, fica difícil decidir "está estável, libera o gate" depois de N horas pós-deploy.
- **Métrica de baseline**: # de campos estruturados emitidos por execução de lote para coleta = 0 dedicados. Alvo: 1 log line com tag `event=permutas.lote.executado` + 4 campos (`adtos`, `sucesso`, `falhas`, `duracao_ms`).

## 5. Cards Kanban

### [deployability-1] Introduzir kill-switch sem redeploy para o botão "Executar todas"

- **Problema**
  > O botão que cria borderôs em lote no ERP é governado por `const PROCESSAMENTO_HABILITADO = true` hardcoded no `page.tsx`. Em incidente, a única alternativa é redeploy do FE (minutos) ou desligar `CONEXOS_WRITE_ENABLED` (martelo que paralisa também a baixa individual). MTTR alto para o pior cenário (ação de escrita em lote).

- **Melhoria Proposta**
  > Adicionar feature flag por env var lida pelo endpoint `GET /permutas/config` (ou similar já existente) e consumida pelo FE no carregamento: e.g., `PERMUTAS_LOTE_ENABLED` (default `true`). Frontend lê na inicialização e desabilita o botão se `false`. Operação de emergência: setar a env var no Render e disparar reload — sem redeploy. Manter `PROCESSAMENTO_HABILITADO` como salvaguarda local para casos em que o backend está fora.

- **Resultado Esperado**
  > Desligar a ação em prd em ≤1 min, sem redeploy, sem impactar a baixa individual. Botão fica desabilitado com tooltip "Temporariamente indisponível".

- **Tactic alvo**: Feature flag / Surge Protection
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - MTTR para desligar botão: ~5 min (redeploy FE) → ≤1 min (toggle env var)
  - Impacto colateral em baixa individual ao desligar lote: alto (hoje, via `CONEXOS_WRITE_ENABLED`) → nulo
- **Risco de não fazer**: No primeiro incidente de produção desta ação, o plantonista é forçado a escolher entre "esperar redeploy" e "paralisar toda a escrita do ERP" — ambas custosas.
- **Dependências**: nenhuma

### [deployability-2] Exigir aprovação humana no deploy para prd quando a rota é de escrita financeira em lote

- **Problema**
  > `ci.yml` faz CI + tag idempotente, e o deploy real ocorre via webhook Render/Vercel disparado pelo push em `main`. Sem gate humano para uma feature que expõe escrita em lote no `fin010`. Probabilidade de "subiu sem o ops perceber" não é zero.

- **Melhoria Proposta**
  > Configurar **GitHub Environment "production"** com `required_reviewers` e usar `environment: production` em um job final (`deploy-trigger`) que dispara o webhook do Render/Vercel via `curl`. Manter `dev`/`stg` automáticos. Documentar quem são os reviewers (1 pessoa basta para começar). Alternativa de menor esforço: ativar "Manual Deploy" no Render para o serviço prd (revoga o auto-deploy do webhook).

- **Resultado Esperado**
  > Releases em prd exigem 1 clique humano. Lead time aceitável (≤15 min de aprovação) trocado por janela de "última chance" de revisão.

- **Tactic alvo**: Scale Rollouts (deploy gating)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - # de aprovações humanas entre `push main` e rota viva em prd: 0 → 1
  - # de deploys prd "involuntários" (mergeado sem intenção de release): mensurar baseline com histórico
- **Risco de não fazer**: Em uma equipe pequena, merge precipitado vira release precipitado; a rota de escrita em lote vai pra prd sem que ops esteja monitorando.
- **Dependências**: nenhuma

### [deployability-3] Escrever runbook de incidente para "Executar todas as automáticas"

- **Problema**
  > Não há documento de incidente para a ação mais arriscada do módulo. On-call vai improvisar no pior momento.

- **Melhoria Proposta**
  > Criar `docs/runbooks/permutas-executar-lote.md` (≤1 página) cobrindo: (1) como desligar o botão (via card 1 quando pronto; via `CONEXOS_WRITE_ENABLED=false` antes); (2) como reverter o PR no Render/Vercel (passos clicáveis); (3) consulta SQL para listar borderôs criados na janela suspeita (`permuta_alocacao_execucao` + `borderos_cache`); (4) critério de re-abertura ("DRY_RUN por 24h após rollback antes de re-habilitar").

- **Resultado Esperado**
  > MTTR independente do plantonista individual. Qualquer dev do time consegue mitigar em ≤5min seguindo o passo a passo.

- **Tactic alvo**: Rollback + Deployment observability
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - # de runbooks da feature: 0 → 1
  - Tempo para localizar procedimento de desligamento: "depende da pessoa" → ≤2min (busca no docs)
- **Risco de não fazer**: Primeiro incidente real vira retrospectiva com "ninguém sabia o procedimento".
- **Dependências**: ideal após [deployability-1] (assim o runbook já cita o toggle do botão)

### [deployability-4] Emitir log estruturado de alto nível para cada execução de lote

- **Problema**
  > Service retorna agregado por response, mas não emite log estruturado dedicado (event tag + métricas) para alerta/filtro no dashboard. Difícil responder "alguém usou em prd? quanto foi criado?" pós-deploy.

- **Melhoria Proposta**
  > No fim de `ReconciliacaoLotePermutaService.reconciliarLote`, adicionar `logService.info('permutas.lote.executado', { totalAdtos, sucesso, falhas, duracaoMs, executadoPor, dryRun })`. Configurar (em separado) um alerta simples no Render/Sentry: "se `event=permutas.lote.executado` com `dryRun=false` aparecer fora do horário comercial, notificar". Custo zero adicional, observabilidade alta.

- **Resultado Esperado**
  > Pós-deploy, dá pra responder em segundos: "quantas execuções de lote rodaram nas últimas 24h, com qual taxa de sucesso, quem disparou".

- **Tactic alvo**: Deployment observability
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - # de campos estruturados emitidos por execução de lote: 0 → 5
  - Tempo para descobrir "rodou em prd?": "varrer logs do request" → consulta filtrada por tag (≤30s)
- **Risco de não fazer**: Decisão "está estável, libera o gate" continua sendo gut-feel.
- **Dependências**: nenhuma

## 6. Notas do agente

- Delta é **aditivo e seguro de deployar** (rota nova, sem env var nova, sem migração, sem alteração de contrato existente). O CI cobre bem o pipeline. A fragilidade real é operacional pós-deploy: ação poderosa sem kill-switch granular e sem runbook.
- Infra Terraform/IaC = N/A (Render/Vercel/Supabase — ver `CLAUDE.md` §Estado Atual). Tactics correspondentes (Drift detection, Per-tenant blast-radius) marcadas N/A com justificativa.
- **Cross-QA para o consolidator**: (a) **Performance/Availability** — request síncrono longo no lote pode bater proxy timeout (shared-metrics §Performance); deploy de uma feature já frágil em latência aumenta o valor do kill-switch. (b) **Security** — admin-only + rate-limit cobrem acesso, mas kill-switch é controle de mitigação que complementa. (c) **Fault Tolerance** — continue-on-error + idempotência write-ahead reduzem necessidade de rollback transacional; **deploy rollback** continua sendo a rede de proteção macro.
- Métricas de lead time/MTTR históricos: não medíveis localmente (precisam de Render/Vercel/GitHub Releases). Recomendado adicionar ao runbook do card 3.
