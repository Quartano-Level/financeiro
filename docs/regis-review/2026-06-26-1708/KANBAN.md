---
type: regis-review-kanban
run_id: 2026-06-26-1708
total: 54
counts: { p0: 0, p1: 34, p2: 17, p3: 3 }
dedupe_applied: 8
---

# Kanban — financeiro — 2026-06-26-1708

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado.
> Ordem: P0 (S → XL), depois P1, P2, P3.
> **Dedupes aplicados** (8): cards consolidados usam notação `[a-N + b-M]` preservando rastreabilidade aos QAs de origem.

---

## P0 — Crítico

> **Nenhum P0**. Confirmado por varredura: `grep '^- \*\*Severidade\*\*: P0' docs/regis-review/2026-06-26-1708/*.md` → 0 hits. É a primeira run em 4 sem item bloqueante.

---

## P1 — Alto (ordem: S → M → L → XL)

### P1 — S (≤1 dia útil)

### [security-5 + deployability-7] Adicionar `npm audit --audit-level=high` no job frontend do CI

**QA**: Security + Deployability
**Tactic alvo**: Limit Exposure (supply chain) / Package Dependencies
**Esforço**: S
**Findings**: F-security-5, F-deployability-7
**Consolida**: security-5 (P1) + deployability-7 (P2) — mesma solução, severidade da security (high vuln `ws`)

**Problema**
> `.github/workflows/ci.yml:30-46` (job Frontend) NÃO chama `npm audit`. Hoje há **1 high** (`ws` GHSA-96hv-2xvq-fx4p + GHSA-58qx-3vcg-4xpx, CVSS 7.5) escondido em dep transitiva (`jest-environment-jsdom@30 → jsdom@26.1.0 → ws@8.20.0`) — dev-only, mas qualquer high futuro em dep direta de runtime (Next, React, sonner, zod) entra em prod sem alarme. BE roda audit; FE não.

**Melhoria Proposta**
> Adicionar `- run: npm audit --audit-level=high` no job Frontend, espelhando o BE (`ci.yml:24`). Resolver/justificar o `ws` atual (atualizar `jest-environment-jsdom` ou suprimir via `overrides` se confirmado dev-only). Documentar processo de exceção (issue + label `security:waiver`).

**Resultado Esperado**
> Paridade de gating de vulnerabilidades entre BE e FE. Cobertura `npm audit` no CI: 1/2 jobs → 2/2.

**Métricas de sucesso**
- Frontend high+ vulns no CI: 1 (silencioso) → 0 (bloqueia merge)
- Jobs com `npm audit`: 1 → 2

**Risco de não fazer**: vuln crítica em prod descoberta por notícia, não por CI.

**Dependências**: nenhuma.

---

### [availability-2 + deployability-8] Implementar `/ready` que valida Postgres + Conexos + última migration

**QA**: Availability + Deployability
**Tactic alvo**: Ping/Echo + Self-Test + Deployment observability
**Esforço**: S
**Findings**: F-availability-2, F-availability-6, F-deployability-8, F-deployability-2
**Consolida**: availability-2 (P1) + deployability-8 (P2) — mesma implementação

**Problema**
> `/health` (`src/backend/index.ts:65`) retorna 200 sem checar Postgres, Conexos ou se a última migration aplicou. Render usa esse 200 para promover tráfego — container pode passar a servir mesmo com dependência caída. Janela de degradação invisível no status do Render.

**Melhoria Proposta**
> Separar **liveness** (`/health`, mantém estático = "processo está vivo") de **readiness** (`/ready` novo: (a) `SELECT 1 FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`, (b) `HEAD $CONEXOS_BASE_URL` com timeout 2s sem auth, (c) valida `EnvironmentProvider` lê env críticos). `/ready` retorna 503 em qualquer falha. Render passa a apontar `healthCheckPath: /ready` (mantendo `/health` como liveness).

**Resultado Esperado**
> Em incidente de Supabase/Conexos, Render para de rotear tráfego em ≤30s (ciclo padrão do healthcheck). Deploy "verde" servindo 500 silenciosamente vira impossível.

**Métricas de sucesso**
- Dependências probadas pelo readiness: 0 → 3 (Postgres, Conexos, EnvironmentProvider)
- Janela de tráfego em backend com DB morto: indeterminada → ≤30s
- # probes (liveness/readiness): 1 → 2

**Risco de não fazer**: incidente futuro de Supabase = janela indefinida de 500 visíveis sem reação automatizada.

**Dependências**: pré-requisito do `[availability-4]` graceful shutdown (precisa de `/ready` para o balanceador respeitar).

---

### [availability-3] Adotar Sentry no backend + cron com alerta em incremento de erro

**QA**: Availability
**Tactic alvo**: Monitor + Predictive Model
**Esforço**: S
**Findings**: F-availability-3, F-availability-7

**Problema**
> Toda telemetria de erro vive em `console.error` para stdout do Render. Sem dashboard, sem alerta, sem agregação. `grep -rn "Sentry|datadog|opentelemetry" src/backend → 0`. MTTD depende do operador estar olhando ou de o usuário reclamar. Particularmente grave porque partial-success multi-título (R-5) só é detectado por relato.

**Melhoria Proposta**
> Instalar `@sentry/node` no backend, inicializar no `index.ts` antes de `app.use`, captura no `errorMiddleware` (ponto central). Adicionar `Sentry.captureCheckIn` no `jobs/ingest-permutas.ts` para monitorar o cron. Tag custom `status=error` quando a trilha registra erro. Alertas: "erros 500 > 5/min por 5min", "cron falhou 2× consecutivas", "permuta_execucao status=error subiu".

**Resultado Esperado**
> MTTD para qualquer regressão produzida no backend cai de >30min para <5min (alerta).

**Métricas de sucesso**
- Deps de APM no backend: 0 → 1
- Alertas com regra automática: 0 → ≥3
- Retenção/busca de erros: stdout sem search → 30d+ com search e dedup

**Risco de não fazer**: regressões silenciosas (incl. partial-success multi-título) chegam à retro do mês seguinte sem dado quantitativo.

**Dependências**: nenhuma (Sentry plano free suficiente).

---

### [availability-4] Graceful shutdown (SIGTERM) com drenagem de reconciliações em curso

**QA**: Availability
**Tactic alvo**: Escalating Restart
**Esforço**: S
**Findings**: F-availability-4

**Problema**
> `src/backend/index.ts` não trata `SIGTERM`. Render mata o container em auto-deploy; se chegar entre `criarBordero` e o último `gravarBaixaPermuta` do loop multi-título (1+N×4 chamadas), o borderô fica com baixas parciais e a trilha em `reconciling` órfão.

**Melhoria Proposta**
> Implementar handler de `SIGTERM`/`SIGINT` que: (a) marca `app.locals.shuttingDown = true`, (b) faz `/ready` retornar 503 imediatamente, (c) aguarda in-flight requests por até 25s (Render dá 30s), (d) fecha o pool Postgres limpo, (e) `process.exit(0)`.

**Resultado Esperado**
> Render tira o backend do balanceador antes de matar; reconciliações em curso terminam o handshake (incl. multi-título).

**Métricas de sucesso**
- Handlers de SIGTERM/SIGINT: 0 → 1
- Janela de drain: 0s → ≤25s
- Borderôs órfãos esperados por deploy: indeterminado → ~0

**Risco de não fazer**: cada deploy em horário comercial = potencial de 1–5 borderôs órfãos × N títulos × frequência de deploy (autoDeploy ON).

**Dependências**: `[availability-2 + deployability-8]` (precisa de `/ready` para o balanceador respeitar).

---

### [deployability-2] Smoke test pós-deploy assertando `/health.version`

**QA**: Deployability
**Tactic alvo**: Manage Deployment Pipeline (post-deployment validation)
**Esforço**: S
**Findings**: F-deployability-2

**Problema**
> CI (`.github/workflows/ci.yml`) só roda gates pré-merge. Depois do `autoDeploy` do Render não há job que verifique se a versão promovida é a que o commit esperava. Bug de runtime no `dist/index.js` invisível até 1º usuário reportar.

**Melhoria Proposta**
> Job `smoke` em `ci.yml` (após `Tag Release`, `needs: [tag-release]`): (a) `curl -fsS $RENDER_URL/health` com retry/backoff por até 8min (tempo de rebuild); (b) compara `version` retornado com `node -p "require('./src/frontend/package.json').version"`; (c) falha o run se divergir. Considerar smoke no Vercel preview URL via `vercel pull` + `vercel inspect`.

**Resultado Esperado**
> MTTD de "deploy não promovido" ou "deploy promoveu versão errada" passa de "primeiro usuário reporta" → ≤10min (timeout do job).

**Métricas de sucesso**
- # jobs de smoke pós-deploy: 0 → 1
- Asserção `health.version == tag`: ausente → presente

**Risco de não fazer**: regressão em prd por horas até alguém usar a rota afetada.

**Dependências**: secret `RENDER_PRODUCTION_URL` no GitHub Actions.

---

### [deployability-3] Pinar Node em `.nvmrc` + `engines` e unificar workflows

**QA**: Deployability
**Tactic alvo**: Reproducible builds / Package Dependencies
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> CI roda `node 24` (`ci.yml:20,40`), workflow de ingestão diária roda `node 22` (`ingest-permutas.yml:41`), Render herda o default do plan, sem `.nvmrc` nem `engines` em `package.json`. Cron de ingestão (toca Conexos e Postgres em prod) roda em runtime diferente do CI.

**Melhoria Proposta**
> (1) `.nvmrc` na raiz (ex.: `22.13.0` LTS). (2) `"engines": {"node": ">=22.13 <23"}` em ambos `package.json`. (3) Atualizar `ci.yml` e `ingest-permutas.yml` para usar `node-version-file: .nvmrc`. (4) Documentar no `DEPLOY.md` (e idealmente declarar em `render.yaml` via env `NODE_VERSION`).

**Resultado Esperado**
> 1 versão de Node em todos os pontos (CI BE, CI FE, ingest cron, Render, dev local).

**Métricas de sucesso**
- # versões de Node distintas no repo: 2 (22, 24) → 1
- `.nvmrc` presente: não → sim
- `engines.node` declarado: não → sim (2 pkg.json)

**Risco de não fazer**: bug Node-only no cron de ingestão = painel stale por 24h; analista decide sobre dado velho.

**Dependências**: nenhuma.

---

### [modifiability-5] Encapsular `titCod` da invoice — remover hardcode `titCod: 1` (3 pontos)

**QA**: Modifiability
**Tactic alvo**: Encapsulate · Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-5, F-integrability-3 (parcial)

**Problema**
> 3 lugares em produção (era 5) ainda fixam `titCod: 1` ao montar payloads do fin010 (`ReconciliacaoPermutaService:322,587`; `BorderoGestaoService:113`). Inbox `permuta-multi-titulo-pendente.md` aberto; cenário "vc-multi-titulo" já anotado.

**Melhoria Proposta**
> Encapsulate + Abstract Common Services: introduzir `Invoice.tituloAlvoTitCod()` (ou `resolveTituloBaixa(invoice)`) no domínio — derivar do detalhe quando disponível, fallback explícito a `1` + log de aviso. Substituir os 3 literais; teste de regressão multi-título com fixture sintética. Atualizar `business-rules/fin010-write-contract.md`.

**Resultado Esperado**
> 0 literais `titCod: 1` em production; risco arquitetural #1 sai com invariante explícita.

**Métricas de sucesso**
- Literais `titCod: 1` em production: 3 → 0
- Inbox `permuta-multi-titulo-pendente.md`: aberto → fechado (com teste canônico)

**Risco de não fazer**: baixa em título errado no fin010 quando 1ª invoice multi-título nova aparecer em produção.

**Dependências**: alinhamento com `qa-integrability` (mesma fronteira).

---

### [modifiability-6] Externalizar contas gerenciais (130/131) via `EnvironmentProvider`

**QA**: Modifiability
**Tactic alvo**: Defer Binding — configuration files · Use an Intermediary
**Esforço**: S
**Findings**: F-modifiability-6

**Problema**
> `CONTA_GER_JUROS = 131` e `CONTA_GER_DESCONTO = 130` vivem como `const` em `ReconciliacaoPermutaService.ts:17,24`. Decisão Columbia (P1-2 no `_coverage.json`). Se a Columbia reclassificar contas ou se um 2º cliente entrar (alvo SaaSo), exige redeploy.

**Melhoria Proposta**
> Defer Binding: mover para `EnvironmentVars` (`columbiaContasGerenciais: { juros, desconto }`) via `EnvironmentProvider`. Em SSM (alvo) ficam por-tenant; localmente via `.env`. Para `INGEST_LOCK_KEY` e `PAGE_SIZE`, manter como constantes técnicas, mas documentar.

**Resultado Esperado**
> Trocar plano de contas vira mudança de configuração; SaaSo multi-tenant viável sem fork de código.

**Métricas de sucesso**
- Regras de negócio numéricas hardcoded em service: 2 → 0
- Override por tenant: impossível → suportado

**Risco de não fazer**: cada release que altera o plano queima ciclo de deploy completo.

**Dependências**: nenhuma.

---

### [performance-1] Substituir `listAtivas` por `findByAdiantamento(docCod)` + LIMIT

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: S
**Findings**: F-performance-1

**Problema**
> `PermutaAlocacaoRepository.listAtivas()` carrega a tabela inteira para o caller filtrar 1 adto em memória. Chamada em `ReconciliacaoPermutaService.reconciliar` (linhas 100 e 115) — dentro do loop do `reconciliar-lote` (LOTE_MAX=6). Custo cresce linearmente com a trilha histórica.

**Melhoria Proposta**
> Adicionar `findByAdiantamento(adtoDocCod: string): Promise<AlocacaoRow[]>` ao repo, com `WHERE adiantamento_doc_cod = $docCod` (usa `idx_permuta_alocacao_adto` já existente da migration 0014). Substituir os 4 call-sites. Manter `listAtivas` só para `GestaoPermutasService.exporGestao` (lê tudo de propósito).

**Resultado Esperado**
> Bandwidth Postgres por lote completo: O(|alocacoes_total| × 6) → O(N × 6). Para 1000 alocações: 12000 rows → ≤60.

**Métricas de sucesso**
- rows lidas por `reconciliar-lote` (n=6, trilha 1000): 12000 → ≤60
- Latência p95 do `reconciliar-lote` em ambiente sintético: medir antes/depois

**Risco de não fazer**: P1 hoje (volume baixo), vira P0 quando a trilha passar de ~10k linhas.

**Dependências**: nenhuma.

---

### [testability-6] Bumpar threshold FE para `lines 28 / branches 14 / functions 23` imediato + plano 90d

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-7, F-testability-1

**Problema**
> `src/frontend/jest.config.js:35-44` em `lines 20 / branches 9 / functions 14` apesar de o real ser `28.83 / 14.44 / 23.22` pós-CC-1. Gate hoje está **mais frouxo que a realidade** — regressão de até 8pp de lines passa. CC-1 não atualizou o threshold no mesmo PR.

**Melhoria Proposta**
> (1) PR imediato: bumpar para `lines 28 / branches 14 / functions 23` (trava o real). (2) Em 30d (junto com testability-1): `lines 40 / branches 20 / functions 30`. (3) Em 60d: `lines 55 / branches 30 / functions 45`. (4) Em 90d: `lines 60 / branches 40 / functions 50`. Cada bump comentado com a justificativa da run de Regis correspondente.

**Resultado Esperado**
> Threshold lines FE em 90 dias: 20 → 60. CI passa a flagar regressão de cobertura.

**Métricas de sucesso**
- Threshold lines FE: 20 → 28 (imediato) → 60 (90d)
- Threshold branches FE: 9 → 14 (imediato) → 40 (90d)
- Threshold functions FE: 14 → 23 (imediato) → 50 (90d)

**Risco de não fazer**: ganho da CC-1 evapora; time confia em verde falso.

**Dependências**: bumps acima de 40/20/30 dependem de `[testability-1]`.

---

### P1 — M (2–5 dias úteis)

### [integrability-1 + modifiability-7] Eliminar `services/conexos.ts` legado — mover sessão para `ConexosBaseClient`

**QA**: Integrability + Modifiability + Security
**Tactic alvo**: Use an Intermediary · Manage Resource Coupling · Encapsulate
**Esforço**: M
**Findings**: F-integrability-2, F-integrability-7, F-modifiability-7
**Consolida**: integrability-1 (P1) + modifiability-7 (P2) — mesmo offender

**Problema**
> Com o CC-2 feito, sobra um único bottleneck estrutural: `services/conexos.ts` (341 LOC, singleton solto) ainda detém a sessão Conexos (login mutex, cookie, retry-401, redaction) e lê `process.env.CONEXOS_USERNAME/PASSWORD/BASE_URL` direto (`:80,144-145`), violando Inviolable Rule #8. O `legacyConexosAdapter.ts` (120 LOC) é um pass-through dynamic-import que só existe para essa dupla camada. Hardcode tenant `https://columbiatrading.conexos.cloud/api`. Migração para Lambda+SSM esbarra aqui.

**Melhoria Proposta**
> Mover axios + sid + mutex + 401-retry para dentro do `ConexosBaseClient`, consumindo `EnvironmentProvider` via `@inject`. Apagar `services/conexos.ts` e `legacyConexosAdapter.ts`. `appContainer.ts` registra `ConexosBaseClient` direto, sem `LEGACY_CONEXOS_TOKEN`. Os 4 sub-clients seguem intocados (a interface `getGeneric/postGeneric/…` do base permanece).

**Resultado Esperado**
> 1 caminho de auth Conexos. `process.env.CONEXOS_*` deixa de ser lido fora de `EnvironmentProvider`. ~461 LOC removidas. Migration debt B3 sai de PARTIAL para CLOSED.

**Métricas de sucesso**
- Camadas de auth Conexos: 2 → 1
- `process.env.CONEXOS_*` fora do EnvironmentProvider: 3 → 0
- LOC de legado eliminadas: ~461 (`services/conexos.ts` + `legacyConexosAdapter.ts`)
- `LEGACY_CONEXOS_TOKEN`: presente → removido

**Risco de não fazer**: ao migrar para Lambda + SSM, o legado lê env vazio → quebra em produção; 2 mutexes paralelos podem reaparecer; redaction divergir; pipe `/feature-new Nexxera` copia o padrão sujo.

**Dependências**: ordem inversa do CC-2 (que cuidou da família; este cuida da fonte da sessão).

---

### [integrability-2] Zod no boundary para 100% das respostas dos sub-clients (passos 2/3/4 do `fin010`)

**QA**: Integrability + Security + Fault Tolerance
**Tactic alvo**: Tailor Interface / Contract Testing (Validate Input)
**Esforço**: M
**Findings**: F-integrability-3, F-integrability-6

**Problema**
> 5 de 26 métodos de domínio dos sub-clients validam a resposta com Zod (19%; era 14% pré-CC-2). Os passos 2/3/4 do handshake `fin010` (`validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido` — `ConexosBaixaClient.ts:351-462`) usam `cast` sem `.parse`. Mudança silenciosa de shape no ERP (ex.: `bxaMnyValor` virar string) propaga como `NaN`.

**Melhoria Proposta**
> Criar `client/permutas/conexosFin010Schemas.ts` com `FIN010_VALIDACAO_TITULO_BAIXA`, `FIN010_VALIDACAO_TITULO_PERMUTA`, `FIN010_ATUALIZA_LIQUIDO` (todos coercivos + `.passthrough()`). Estender `conexosPermutasSchemas.ts` com `com308RowSchema` real. Aplicar `.parse()` em todo retorno `postGeneric/getGeneric/listGenericPaginated`. Falha de parse vira `ConexosError({code: 'CONEXOS_UPSTREAM_ERROR', message: 'schema_mismatch'})`.

**Resultado Esperado**
> 100% das respostas write-side validadas + ≥80% das read-side.

**Métricas de sucesso**
- Métodos de domínio com Zod no boundary: 5/26 → ≥21/26 (≥80%)
- Passos write-side `fin010` validados: 2/5 → 5/5
- Schemas centralizados em `client/permutas/`: 3 → ≥8

**Risco de não fazer**: silent corruption no write path (over-payment, baixa fantasma) nos 3 passos intermediários; primeira `/feature-new` de SISPAG copia o padrão `cast`.

**Dependências**: complementa `[testability-5 + integrability-3]` (fixtures). Pode rodar paralelo ao `[integrability-1 + modifiability-7]`.

---

### [deployability-4] Reescrever `bump-version.ps1` em Node/bash + mover bump para o CI

**QA**: Deployability
**Tactic alvo**: Script Deployment Commands
**Esforço**: M
**Findings**: F-deployability-4

**Problema**
> `scripts/bump-version.ps1` é PowerShell-only — não roda em mac (sem `pwsh`), não roda em Linux, não roda no CI Ubuntu. Gate #10 do AutoLoopRunner exige bump lockstep; devs em mac rodam manualmente ou pulam, gerando deriva entre `package.json`, tag git e CHANGELOG.

**Melhoria Proposta**
> Reimplementar em Node ESM (`scripts/bump-version.mjs`) — `simple-git` + `semver` + parse de conventional-commits; mesma semântica (minor para feat, patch para fix/perf; lockstep FE+BE). Job opcional `bump` no CI (`workflow_dispatch`) que roda o bump + abre PR `chore(release): vX.Y.Z`. Manter `.ps1` como wrapper que chama o `.mjs` para compatibilidade Windows.

**Resultado Esperado**
> Bump funciona em mac/Linux/Windows/CI; tags GitHub deixam de depender de dev em Windows.

**Métricas de sucesso**
- Plataformas suportadas pelo bump: 1 (Windows) → 3
- # PRs com bump manual via `.ps1` no histórico: ~todos os recentes → 0 (passa a ser CI)

**Risco de não fazer**: tags faltando para releases shipados de mac; auditoria histórica degradada.

**Dependências**: nenhuma.

---

### [deployability-5] Criar Render service de staging apontando para Supabase de staging

**QA**: Deployability + Testability + Security
**Tactic alvo**: Scale Rollouts
**Esforço**: M
**Findings**: F-deployability-5

**Problema**
> Não há ambiente de staging — `render.yaml` declara um único service (`financeiro-backend`, branch `main`). "Homologação" do fin010 é flip manual de `CONEXOS_BASE_URL` no MESMO container de produção. Para SISPAG/Popula GED com a mesma prática vira inviável.

**Melhoria Proposta**
> (1) Acrescentar `financeiro-backend-staging` no `render.yaml` (branch `staging` ou `develop`), `CONEXOS_BASE_URL` apontando para homologação, banco Supabase separado. (2) Vercel deploy preview já gera URL por PR — encadear `NEXT_PUBLIC_API_URL` do preview com a URL de staging via `vercel.json`. (3) Workflow `promote.yml` (`workflow_dispatch`): merge `staging`→`main`.

**Resultado Esperado**
> Validação de escrita ERP em staging permanente, sem flip de flag em prd.

**Métricas de sucesso**
- # ambientes permanentes: 1 (prd) → 2 (staging + prd)
- # incidentes "esqueceu de flipar a flag em prd" registrados: hoje não rastreado → 0/trimestre

**Risco de não fazer**: à medida que SISPAG (escrita em `com298` + Nexxera) e Popula GED entram, o risco de regressão escalável triplica sem leito de testes.

**Dependências**: novo banco Supabase de staging; revisão de envs Render `sync:false` para o novo service.

---

### [deployability-6] Política expand-then-contract + migrations down (ou `node-pg-migrate`)

**QA**: Deployability + Modifiability
**Tactic alvo**: Rollback (data layer)
**Esforço**: M (política) + L (se trocar runner)
**Findings**: F-deployability-6

**Problema**
> Runner forward-only (`runMigrations.ts:25-54`); 21 migrations UP, 0 DOWN. Qualquer rename/drop futuro inviabiliza rollback do código (schema já mudou). Com rollback de estado ERP coberto pela UI (F-1 reavaliado), este passa a ser o gargalo principal.

**Melhoria Proposta**
> (1) Curto prazo: documentar política **expand-then-contract** no `CLAUDE.md` (toda mudança breaking = ADD coluna nova → backfill → cutover do código → DROP coluna velha em PR separado, pelo menos 1 release depois). (2) Médio prazo: migrar para `node-pg-migrate` ou `drizzle-kit` (suporta `down` nativo). (3) Adicionar `npm run migrate:dry-run` que mostra SQL pendente sem aplicar.

**Resultado Esperado**
> Rollback de código continua possível mesmo após release com schema delta.

**Métricas de sucesso**
- Política expand-then-contract documentada: não → sim
- # migrations com pair UP/DOWN: 0/21 → 100% das novas

**Risco de não fazer**: rename/drop futuro vira incidente; reconciliar com dados em produção = horas.

**Dependências**: nenhuma para a política; runner pode trocar gradualmente.

---

### [availability-1 + fault-tolerance-1] Multi-título: persistir TODOS `bxa_cod_seq` + `request_payloads[]` (tabela filha ou JSONB)

**QA**: Availability + Fault Tolerance + Modifiability (schema)
**Tactic alvo**: State Resynchronization + Exception Detection (granularidade) + Idempotent Replay
**Esforço**: M
**Findings**: F-availability-1, F-fault-tolerance-1, F-availability-10
**Consolida**: availability-1 (P1) + fault-tolerance-1 (P2) — mesma migração

**Problema**
> Após a baixa multi-título, apenas `bxaCodSeqs[0]` é persistido na coluna escalar `bxa_cod_seq` em `markSettled`; em `markError` nenhum dos bxaCodSeqs já confirmados pelo ERP vai para a trilha. `setRequestPayload` (`:480`) sobrescreve por título — só o payload do último sobrevive. R-4 fail-closed evita super-pagamento, mas a auditoria de partial-success é manual (cruzar com `listBaixasErp` no ERP).

**Melhoria Proposta**
> (1) Migração `0022_permuta_alocacao_execucao_multi_titulo.sql`: adicionar `bxa_cod_seqs JSONB DEFAULT '[]'::jsonb` (todos os bxaCodSeq do par) e `request_payloads JSONB DEFAULT '[]'::jsonb` (payloads na ordem do loop). Manter `bxa_cod_seq` escalar como compatibilidade (1ª parcela). (2) `PermutaExecucaoRepository.appendBxaSeq(key, bxaSeq, payload)` chamado após CADA `baixarTitulo` (write-ahead por parcela). (3) `markError` agregado preserva as linhas-filhas já gravadas; `markSettled` agregado idem. (4) Teste novo: cenário "crash entre baixarTitulo 1 e 2 → trilha contém bxa1+payload1, R-4 reconhece estado parcial".

**Resultado Esperado**
> Trilha responde "quais parcelas da invoice X caíram no borderô Y e quais payloads foram enviados" via SQL direto, sem precisar abrir o Conexos.

**Métricas de sucesso**
- Parcelas representadas na trilha: 1/N → N/N
- Payloads preservados: 1/N → N/N
- Cobertura de teste "crash mid-loop multi-título": 0 → ≥1

**Risco de não fazer**: cada incidente em invoice multi-título exige cross-reference manual com o ERP; tempo de conciliação cresce com a fração de multi-título no portfólio.

**Dependências**: melhor antes de `[fault-tolerance-3 + availability-6]` (reaper amplifica o valor da rastreabilidade).

---

### [fault-tolerance-2] Honrar `Idempotency-Key` em `/reconciliar-lote` + `/adiantamentos/:docCod/reconciliar`

**QA**: Fault Tolerance + Security + Availability
**Tactic alvo**: Idempotent Replay (boundary)
**Esforço**: M
**Findings**: F-fault-tolerance-2

**Problema**
> 1/3 rotas de escrita financeira aceita `Idempotency-Key` hoje (`/eleicao` linha 222); `/reconciliar-lote` (linha 542) e `/adiantamentos/:docCod/reconciliar` (linha 514) NÃO leem o header. Duplo-fetch (retry HTTP, F5, dois tabs) dispara dois lotes para os mesmos adtos. Com multi-título, blast radius aumenta — cada borderô paralelo pode incluir N parcelas distribuídas conforme corrida de `validarTituloBaixa`. R-4 fail-closed protege par em `reconciling`, mas dois POST simultâneos podem AMBOS chegar ao `beginExecution` sem ver o conflito.

**Melhoria Proposta**
> Replicar o padrão de `/eleicao` (`routes/permutas.ts:222-228`) nas duas rotas. Persistir `(idempotency_key, payload_hash, response_json, created_at)` em tabela curta com TTL 24h; em re-request com a MESMA key + payload, devolver a resposta cacheada. Frontend gera key com `crypto.randomUUID()` por clique no modal.

**Resultado Esperado**
> 3/3 rotas de escrita financeira honram `Idempotency-Key`; duplo-clique cross-tab não dispara dois lotes.

**Métricas de sucesso**
- % rotas state-mutating de escrita fin010 com `Idempotency-Key`: 33% → 100%
- Teste e2e cobrindo "duplo POST mesma key responde idem-cache": 0 → 1
- # de borderôs vazios criados por re-request: medir antes/depois (alvo 0)

**Risco de não fazer**: incidentes recorrentes de "executei 2× sem querer"; com multi-título, blast radius cresce.

**Dependências**: nenhuma.

---

### [fault-tolerance-3 + availability-6] Stuck-state reaper para execuções `reconciling` órfãs

**QA**: Fault Tolerance + Availability
**Tactic alvo**: Condition Monitoring + Reconcile + State Resynchronization
**Esforço**: M
**Findings**: F-fault-tolerance-3, F-availability-10
**Consolida**: availability-6 (P2) + fault-tolerance-3 (P1) — mesmo job, mesma instrumentação
**Status**: **aberto há 4 runs** (`2026-06-23-1518:ft-2`, `2026-06-24-2011:F-7`, `2026-06-25-1713:F-3`, `2026-06-26-0058:F-fault-tolerance-3`)

**Problema**
> R-4 fail-closed (`ReconciliacaoPermutaService.ts:178-212`) AGORA protege contra super-pagamento, mas sem reaper os pares IN-DOUBT (`status='reconciling' AND bor_cod IS NOT NULL AND bxa_cod_seq IS NULL AND atualizado_em < now()-30 min`) continuam invisíveis. Citado explicitamente no prompt como follow-up ABERTO do R-4.

**Melhoria Proposta**
> (1) `PermutaExecucaoRepository.listReconcilingStale(maxAgeMin: number)`. (2) `StuckReconciliacaoReaperService` — para cada órfão, consultar `getBordero` + `listBaixas`; (a) `markSettled` se a baixa caiu (com `bxaCodSeq` real e, sob multi-título, `bxa_cod_seqs[]`); (b) `markError("órfão >30 min — provável timeout/crash; conferir no Conexos")` se não caiu, com `request_payload` preservado; (c) IN-DOUBT (R-4 já marcou error) → reconfirmar via `listBaixas` e enriquecer mensagem. (3) Provisório: rota admin `POST /permutas/reconciliar-orfaos`. (4) Alvo Lambda: EventBridge a cada 10min. (5) Métrica para Sentry: `reconciling_orfans_gauge`.

**Resultado Esperado**
> MTTD de par órfão cai de "indefinido" para ≤10min (com cron) ou ≤1 clique admin (provisório). 0 órfãos invisíveis após o run.

**Métricas de sucesso**
- Jobs/rotas detectores: 0 → 1
- MTTD: indefinido → ≤10min (cron) ou ≤1 clique admin (provisório)
- Alerta em `reconciling > 30min`: 0 → 1

**Risco de não fazer**: 5ª re-priorização na próxima run; backlog de IN-DOUBTs silenciosos cresce; com multi-título, universo de pares precisando inspeção forense aumenta.

**Dependências**: melhor após `[availability-1 + fault-tolerance-1]` (multi-título amplia o que o reaper precisa diagnosticar) e `[availability-3]` (Sentry para alertar).

---

### [fault-tolerance-4] Persistir audit-trail DB das ações de borderô

**QA**: Fault Tolerance + Security
**Tactic alvo**: Condition Monitoring + Quarantine (forense)
**Esforço**: M
**Findings**: F-fault-tolerance-4

**Problema**
> As 5 ações de gestão de borderô em `BorderoGestaoService` (finalizar, cancelar, estornar, excluir borderô, excluir baixa) só escrevem via `LogService.info → process.stdout.write` (`LogService.ts:26`). Sem tabela DB-persistida. Render rotaciona logs por TTL (~7d); "quem aprovou o borderô 14918 e quando" não é consultável via SQL após o ciclo de logs.

**Melhoria Proposta**
> Migration nova: `0023_bordero_acao_log.sql` com `(id, bor_cod, fil_cod, acao TEXT CHECK IN ('finalizar','cancelar','estornar','excluir','excluir-baixa'), invoice_doc_cod NULL, executado_por, payload_request JSONB, erp_response JSONB, erro_mensagem NULL, criado_em)`. Cada método de `BorderoGestaoService` registra a ação ANTES de chamar o ERP (write-ahead) e atualiza com o resultado após. Espelhar o padrão de `permuta_alocacao_execucao`.

**Resultado Esperado**
> 5/5 ações de borderô têm trilha DB consultável (vs. 0/5 hoje).

**Métricas de sucesso**
- Ações de borderô com trilha DB: 0/5 → 5/5
- Cobertura de testes asserindo a gravação da trilha: 0 → 5 (1 por ação)

**Risco de não fazer**: compliance fraca em contestação; auditor pede e o time só pode mostrar logs voláteis do Render.

**Dependências**: nenhuma.

---

### [fault-tolerance-5] Reconciliação periódica trilha ↔ fin010 (drift detection)

**QA**: Fault Tolerance
**Tactic alvo**: Reconcile
**Esforço**: M (provisório, rota admin) + L (incluindo cron alvo)
**Findings**: F-fault-tolerance-5

**Problema**
> Sem job/rota que confronte `permuta_alocacao_execucao` (linhas `settled`) e `permuta_bordero` (cache) com o `fin010` real. Aberto desde `2026-06-23-1518` (`ft-3`). Um borderô estornado externamente só é "visto" quando alguém abre a tela com `live=true`. `borderoAindaValido` cobre só no *próximo* relançamento.

**Melhoria Proposta**
> `DriftReconciliacaoService` que, em loop (ou rota admin provisória `POST /permutas/conferir-drift`), para cada `settled` da trilha consulta o estado vivo do borderô no ERP: (a) se foi CANCELADO/ESTORNADO/REMOVIDO no Conexos sem passar pelo nosso fluxo, marca o `settled` como `error` com mensagem "divergência detectada" e libera o relançamento; (b) sob multi-título, comparar `bxa_cod_seqs[]` (array) com `listBaixas({borCod})` para detectar parcela estornada individualmente; (c) gera relatório de drift do dia para o analista revisar.

**Resultado Esperado**
> Divergência cross-system detectada em ≤24h (vs. "próximo refresh humano da tela").

**Métricas de sucesso**
- Jobs/rotas de drift: 0 → 1
- Tempo máximo de detecção: humano → ≤24h (cron) ou ≤1 clique admin (provisório)

**Risco de não fazer**: dashboard "mente passivamente"; descoberta tardia atrasa fechamento contábil mensal; volta como `ft-3` na próxima run.

**Dependências**: idealmente reaproveita a infra de varredura do `[fault-tolerance-3 + availability-6]` e o array `bxa_cod_seqs[]` do `[availability-1 + fault-tolerance-1]`.

---

### [modifiability-3] Reduzir as 22 funções acima de cognitive-complexity 15 — top-6 primeiro

**QA**: Modifiability + Testability
**Tactic alvo**: Refactor
**Esforço**: M (top-6) / L (todos os 22)
**Findings**: F-modifiability-3

**Problema**
> `npm run lint` reporta 22 warnings (era 20 — drift de +2 na semana). Seis estão acima de 30: 65 (`buildCandidata`), 59 (`toPendente`), 43 (`toCasamentoRows`), 35, 31 (nova em `ReconciliacaoPermutaService:90`), 30. Sem ratchet, o número só cresce.

**Melhoria Proposta**
> Refactor: extrair funções puras (`buildCandidataGate1/2/3` — o código já fala em gates); aplicar early-return; mover branches de apresentação (`toPendente`) para `selectors/permutaPresenter.ts`. Adicionar ratchet no CI (`[modifiability-9]`): PR só passa se contagem ≤ atual.

**Resultado Esperado**
> Warnings: 22 → ≤5; pior complexity: 65 → ≤15; tempo de review dessas funções cai pela metade.

**Métricas de sucesso**
- `noExcessiveCognitiveComplexity` warnings: 22 → ≤5
- Pior complexity: 65 → ≤15

**Risco de não fazer**: regressões em elegibilidade-permuta e reconciliação fin010 — exatamente o nó onde Columbia depende de precisão.

**Dependências**: sinérgico com `[modifiability-9]` (ratchet) e `[modifiability-10]` (refactor ReconciliacaoPermutaService).

---

### [modifiability-4] Bloquear cross-layer imports no Biome (`noRestrictedImports`)

**QA**: Modifiability + Deployability
**Tactic alvo**: Restrict Dependencies · Use an Intermediary · Encapsulate
**Esforço**: M
**Findings**: F-modifiability-4, F-modifiability-9

**Problema**
> `routes/permutas.ts:13-17` importa 5 repositórios e `routes/conexos.ts:4` importa `ConexosCadastroClient` — burlando a regra DDD do CLAUDE.md. PatternGuardian não bloqueou; Biome não tem `noRestrictedImports`. **Inalterado** vs. run anterior — sem gate, debt persiste.

**Melhoria Proposta**
> Restrict Dependencies: ativar `lint.style.noRestrictedImports` no `biome.json` raiz com regras `src/backend/routes/** !-> src/backend/domain/repository/**` e `src/backend/routes/** !-> src/backend/domain/client/**` (preparando alvo Lambda). Encapsular os 6 usos atuais em `PermutaTrilhaService` (wrap dos 5 repos) e `ConexosHealthService` (wrap do client em `routes/conexos.ts`).

**Resultado Esperado**
> 0 cross-layer imports; PatternGuardian + Biome convergem; preparação para o alvo Lambda — handlers só sabem de services.

**Métricas de sucesso**
- Cross-layer imports rota→repo/client: 6 → 0
- Regras `noRestrictedImports`: 0 → ≥2

**Risco de não fazer**: drift compounding; cada `/feature-new` pode adicionar mais imports proibidos.

**Dependências**: nenhuma.

---

### [modifiability-10] Refatorar `ReconciliacaoPermutaService` (+22% LOC, complexity-31 nova)

**QA**: Modifiability + Fault Tolerance + Testability
**Tactic alvo**: Refactor · Split Module · Encapsulate
**Esforço**: M
**Findings**: F-modifiability-3, F-modifiability-5, F-modifiability-6

**Problema**
> `ReconciliacaoPermutaService.ts` cresceu 542 → 662 LOC (+22%) pós-write-back fin010 e ganhou uma função complexity-31 em `:90` (nova). Concentra 2 dos 3 hardcodes `titCod: 1` e as 2 constantes `CONTA_GER_*`. É o nó central do risco arquitetural #1 — e está se concentrando ali em vez de se distribuir.

**Melhoria Proposta**
> Refactor + Split Module: extrair `Fin010BaixaBuilder` (pure function: monta payload completo a partir de invoice+alocação) e `Fin010TituloResolver` (encapsula a regra `titCod`). Mover a função complexity-31 (`:90`) para helper privado fatorado em early-returns. Re-rodar o `qa-fault-tolerance` depois — o `gravarBaixaPermuta` deve receber sempre payload validado.

**Resultado Esperado**
> LOC `ReconciliacaoPermutaService.ts` ≤ 500; 0 funções > complexity 15 no arquivo; `titCod: 1` removido junto com `[modifiability-5]`; `Fin010BaixaBuilder` testável isoladamente.

**Métricas de sucesso**
- LOC: 662 → ≤500
- Funções > complexity 15: 2 → 0 no arquivo
- Hardcodes (titCod + CONTA_GER): 4 → 0 no arquivo

**Risco de não fazer**: o serviço mais crítico do write-back fin010 está em rota de crescimento; próxima feature SISPAG vai puxá-lo acima de 800 LOC e estabilizar a complexidade.

**Dependências**: sinérgico com `[modifiability-5]` (titCod) e `[modifiability-6]` (CONTA_GER).

---

### [security-1] Revogação server-side de JWT (denylist por `jti`) + reduzir TTL para ≤4h

**QA**: Security
**Tactic alvo**: Revoke Access
**Esforço**: M
**Findings**: F-security-1

**Problema**
> JWT (HS256, 12h, `AuthService.ts:24`) vive em `localStorage` (`lib/auth/token.ts:5`), logout só `localStorage.removeItem`, backend não sabe que o token foi revogado. Token roubado por XSS / dump de localStorage / laptop comprometido permanece válido por até 12h — janela suficiente para finalizar dezenas de borderôs no `fin010`. Confused-deputy fix limita a borderôs DA TRILHA, mas é exatamente onde o sistema atua.

**Melhoria Proposta**
> Adicionar `jti` no `signToken` (`AuthService.ts:59-75`); migration `app_token_revoked (jti, revoked_at)`. `signOut()` chama `POST /auth/logout` que insere o `jti`. `buildAuthMiddleware` (`http/auth.ts:155-173`) consulta a denylist (cache em memória 60s) antes de aceitar. Reduzir `TOKEN_EXPIRATION` para `'4h'`.

**Resultado Esperado**
> Logout efetivo server-side; revogação manual de sessão suspeita; trilha forense de "quem estava logado quando".

**Métricas de sucesso**
- TTL de token: 12h → 4h
- Latência de revogação: ∞ → ≤60s
- % requests com check de denylist: 0% → 100%

**Risco de não fazer**: JWT comprometido = 12h de baixa autorizada no `fin010`. Em ataque dirigido, dezenas de borderôs finalizados antes da expiração natural.

**Dependências**: idealmente vem depois de `[security-3]` (audit trail) para enriquecer "quem revogou".

---

### [security-3] Tabela de audit trail de auth (login OK/falha, logout, revogação)

**QA**: Security + Fault Tolerance
**Tactic alvo**: Audit Trail / Detect Intrusion
**Esforço**: M
**Findings**: F-security-3, F-security-4

**Problema**
> Eventos de auth não persistem (`routes/auth.ts:25-43` sem `LogService`, `http/auth.ts:167-170` só `console.warn`). Drain do Render tem retenção ~7d — impossível responder forense ("quem tentou logar com `admin` nas últimas 24h?"). Compliance LGPD/financeiro exige trilha persistida.

**Melhoria Proposta**
> Migration `app_audit_auth (id, ts, event_type, username, ip, user_agent, request_id, success, reason)`. `AuthService.login` grava `LOGIN_OK`/`LOGIN_FAIL` (motivo: `user_not_found`/`bad_password`). Middleware `http/auth.ts` grava `TOKEN_REJECTED`. `signOut()` (após `[security-1]`) grava `LOGOUT`. Índices por `(username, ts)` e `(ts)`.

**Resultado Esperado**
> Forense de incidente em SQL (não em logs de drain).

**Métricas de sucesso**
- Tabela `app_audit_auth` existente: 0 → 1
- Cobertura de eventos: 0% → 100% (login/logout/token_rejected/revoked)
- Retenção de auditoria: ~7d (drain Render) → ≥365d (Supabase)

**Risco de não fazer**: investigação de incidente vira reconstrução de log esfumaçado. Compliance falha.

**Dependências**: nenhuma. Espelha `[fault-tolerance-4]` em escopo de auth.

---

### [security-4] Lockout por conta + alerting de burst de falha de login

**QA**: Security
**Tactic alvo**: Lock Computer + Detect Intrusion
**Esforço**: M
**Findings**: F-security-4, F-security-11

**Problema**
> `AuthService.login` (`AuthService.ts:48-57`) aceita tentativas ilimitadas no mesmo username desde que cada IP fique abaixo de 100/min. bcrypt rounds=12 retarda mas não trava. Credential stuffing distribuído viável; sem alarme, ninguém detecta.

**Melhoria Proposta**
> Colunas `app_user.failed_attempts` + `locked_until`. 5 falhas consecutivas no mesmo username → bloqueio temporário (backoff exponencial: 1min → 5min → 30min). Métrica/alarme: "N falhas em M min" agregado. Adicionar dummy bcrypt no caminho `user not found` para fechar o timing-attack (F-security-11) na MESMA feature.

**Resultado Esperado**
> Brute-force distribuído fica inviável; analyst recebe alerta de tentativa anômala.

**Métricas de sucesso**
- Tentativas máximas antes de lock: ∞ → 5
- Tempo de lock após 5 falhas: 0s → 1min (exponencial)
- Diferença de timing user-exists vs not-exists: ~100× → ≤1.2×

**Risco de não fazer**: credential stuffing dirigido contra `admin`/usuários conhecidos. Combinado com F-security-1 (12h JWT) = mover dinheiro.

**Dependências**: `[security-3]` (audit trail) para alimentar o counter.

---

### [testability-4] Introduzir `ClockProvider` + `RandomProvider` injetáveis; banir `new Date()`/`Math.random()` em código-fonte

**QA**: Testability + Modifiability
**Tactic alvo**: Limit Non-Determinism
**Esforço**: M
**Findings**: F-testability-4

**Problema**
> 22 `new Date()/Date.now()` em código-fonte BE; 1 `Math.random()` em `RetryExecutor.ts:53`; **zero** `jest.useFakeTimers()` no repo inteiro. Testes precisam usar `expect.any(Date)`; coalescer de ingestão (janela de tempo) não-testável.

**Melhoria Proposta**
> Criar `domain/libs/clock/ClockProvider.ts` (`@singleton() @injectable()`) com `now(): Date` e `nowMillis(): number`. Criar `domain/libs/random/RandomProvider.ts` com `next(): number`. Refatorar todos os 22 sites + jitter para injetar. Em testes, registrar `FakeClock`/`FixedRandom` no container ou injetar via construtor (padrão `AgingService` já mostra o caminho).

**Resultado Esperado**
> Sites de `new Date()` em código-fonte BE: 22 → 0. `Math.random()` em código-fonte: 1 → 0.

**Métricas de sucesso**
- `new Date()/Date.now()` em código-fonte (não-teste): 22 → 0
- `Math.random()` em código-fonte: 1 → 0
- Testes usando `FakeClock`/`useFakeTimers`: 0 → ≥5

**Risco de não fazer**: bug de timezone em relatórios; idempotência por janela de tempo não-testável; flake em CI por jitter.

**Dependências**: overlap em Modifiability (Encapsulate / Use an Intermediary).

---

### [testability-5 + integrability-3] Fixtures HAR Conexos + contract tests dos endpoints write-side `fin010`

**QA**: Testability + Integrability
**Tactic alvo**: Recordable Test Cases / Contract Testing
**Esforço**: M
**Findings**: F-testability-6, F-integrability-3, F-integrability-6
**Consolida**: testability-5 (P1) + integrability-3 (P2) — mesma entrega

**Problema**
> CC-2 decompôs `ConexosClient` em 5 sub-clients mas o teste `ConexosSubClients.test.ts` (1657 LOC) continua inventando o shape com `mockResolvedValue({...})` em cada `it()`. Zero fixtures gravadas. As HARs reais (probes 2026-06-18/-23/-25/-26) ficaram em `ontology/_inbox/` em prosa. Quando o ERP mudar campo (`docCod → docCodigo`), testes seguem verdes; só prod falha.

**Melhoria Proposta**
> Durante sessão QaCoach no dev da Columbia, capturar 1 JSON real por endpoint usado por cada sub-client e gravar em `src/backend/domain/client/__fixtures__/conexos/<endpoint>.json` (sanitize CNPJ/valores): `com298-list-proforma.json`, `com298-detail.json`, `fin010-bordero-criado.json`, `fin010-baixas-validacao-tituloBaixa.json`, `fin010-baixas-validacao-tituloPermuta.json`, `fin010-baixas-atualizaLiquido.json`, `fin010-baixa-gravada.json`. Adicionar 1 teste por fixture que valida via Zod schemas (do `[integrability-2]`).

**Resultado Esperado**
> Fixtures gravadas: 0 → ≥10 (5 passos do fin010 + 5 reads core). Schemas Zod cobertos contra payload real. Detecção de breaking change Conexos via CI ao invés de prod.

**Métricas de sucesso**
- Fixtures gravadas: 0 → ≥10
- Testes que validam shape ERP real: 0 → ≥10
- Probes de `ontology/_inbox/` materializadas em fixture: 0 → ≥4

**Risco de não fazer**: probe nova = re-derivar tudo na cabeça; comentários inline envelhecem; o ganho do CC-2 (sub-clients pequenos) é desperdiçado sem rede de segurança no contrato.

**Dependências**: melhor após `[integrability-2]` (Zod schemas) e durante sessão QaCoach com acesso ao dev Conexos.

---

### P1 — L (1–2 semanas)

### [performance-2] Migrar `reconciliar-lote` para job assíncrono com endpoint de status

**QA**: Performance + Availability + Fault Tolerance
**Tactic alvo**: Bound Execution Times + Schedule Resources
**Esforço**: L
**Findings**: F-performance-2

**Problema**
> `LOTE_MAX=6` síncrono em request HTTP roda 6 adtos × ~6 chamadas `fin010` = ~36 calls sequenciais, ~10–25s wall-clock. Render proxy expira em 30–60s. Sob multi-título (3 parcelas), pior caso ~72s. Se o Conexos estiver lento, o lote ultrapassa o teto e o cliente recebe 502 com estado parcialmente aplicado. Lambda (alvo) tem teto rígido API Gateway 29s.

**Melhoria Proposta**
> Quebrar o fluxo: `POST /permutas/reconciliar-lote` apenas enfileira (`pg-boss`/tabela `permuta_lote_job` com status `pending`/`running`/`done`/`failed`) e devolve `202 Accepted + { jobId }`; worker (no mesmo processo via `setImmediate`-loop OU job runner externo) processa cada lote. Frontend faz polling em `GET /permutas/lote/:jobId` usando `PollExecutor`-equivalente do FE.

**Resultado Esperado**
> Timeouts 502 do proxy em `/reconciliar-lote`: indeterminado → 0. Tempo de resposta HTTP da rota: 10–25s → <500ms.

**Métricas de sucesso**
- Latência p95 HTTP `POST /reconciliar-lote`: 10–25s → <500ms
- Timeouts 502 em 30 dias: medir antes/depois (alvo 0)
- Lotes com estado parcialmente aplicado por timeout do proxy: alvo 0

**Risco de não fazer**: sistema refém do plano Render; escalar volume diário aumenta exposição a 502s. Lambda tem teto rígido 29s.

**Dependências**: decidir job runner (in-process loop vs. `pg-boss` vs. SQS); coordenar com `[performance-4]` (fetchWithTimeout no polling).

---

### [security-2] Granularidade RBAC: `analyst`, `approver`, `viewer` + 4-eyes em ações destrutivas

**QA**: Security
**Tactic alvo**: Authorize Actors (granularidade)
**Esforço**: L
**Findings**: F-security-2

**Problema**
> Único role `admin` (`migrations/0007_app_user.sql:8`) — toda mutação (finalizar borderô, executar lote, estornar, excluir baixa) está autorizada pelo mesmo nível. Sem maker/checker. Confused-deputy fix impede mexer em borderô de terceiro, mas dentro da trilha **uma única credencial fecha o ciclo**, contradizendo o pitch de compliance.

**Melhoria Proposta**
> Modelo de roles: `viewer` (só `/gestao`, `/painel`, `/runs`), `analyst` (cria/edita alocação, processa, executa baixa individual), `approver` (finaliza borderô, executa lote, estorna), `admin` (gerência de usuários). Exigir 2 pessoas distintas em `POST /permutas/borderos/:b/finalizar` e `POST /permutas/reconciliar-lote` (analyst cria, approver finaliza). Atualizar 17 `requireRole` em `routes/permutas.ts`.

**Resultado Esperado**
> Credencial comprometida fica isolada por papel; nenhuma única conta capaz de fechar o ciclo financeiro.

**Métricas de sucesso**
- Roles distintas: 1 → ≥3
- Endpoints com aprovação independente: 0 → 2 (finalizar borderô, reconciliar-lote)
- Auditoria de "quem aprovou X criado por Y": ausente → presente

**Risco de não fazer**: única credencial vazada = dano máximo dentro do universo da trilha. Bloqueia compliance financeiro (SOX-like, ISO27001 SoD).

**Dependências**: `[security-3]` (audit) para registrar pares maker/checker.

---

### [testability-1] Cobrir os dialogs e hooks extraídos pela CC-1 + atacar `page.tsx`/`BorderosPanel.tsx` residuais

**QA**: Testability + Modifiability + Performance
**Tactic alvo**: Limit Structural Complexity + Specialized Interfaces + Executable Assertions
**Esforço**: L
**Findings**: F-testability-1, F-testability-7

**Problema**
> CC-1 extraiu 18 arquivos em `app/permutas/components/` mas só 4 receberam teste (`AbaHistorico` 100%, `PermutaPendenteTable` 88%, `format.ts` 80%, `tabela-filtro.tsx` 77%). Dialogs críticos (`AlocarDialog` para alocação N:M cross-process, `IngestaoDialog` para upload PROFORMA, `ReconciliarDialog`, `ConfirmarLoteDialog`, `ConfirmarProcessamentoDialog`, `VisaoGeralTable`, `AbaAutomaticas`) e os 3 hooks (`useExportRelatorios`, `useIngestao`, `usePermutasData`) continuam em 0%. `page.tsx` (1026 LOC) e `BorderosPanel.tsx` (711 LOC) também seguem em 0%.

**Melhoria Proposta**
> (1) Escrever um `<componente>.test.tsx` para cada dialog/aba/hook em `app/permutas/components/` cobrindo: renderização vazia, renderização com dados, click → callback chamado com payload certo, erro toast — usar Testing Library + `userEvent`. (2) Iniciar quebra de `BorderosPanel.tsx` (extrair `BorderoRow`, `BorderoActionsModal`, hooks `useBorderoActions`). (3) Bumpar `jest.config.js` para `lines 28 / branches 14 / functions 23` IMEDIATAMENTE; depois progressivamente.

**Resultado Esperado**
> Cobertura `app/permutas/components/` 27.36% → ≥60% lines; `app/permutas/page.tsx` 0% → ≥30% lines; `BorderosPanel.tsx` 0% → ≥50% lines. Testes de componente novos: 4 → ≥14.

**Métricas de sucesso**
- Componentes/hooks novos em `app/permutas/components/` com teste: 4 → 14
- Cobertura lines `app/permutas/components/`: 27.36% → ≥60%
- Cobertura lines `app/permutas/BorderosPanel.tsx`: 0% → ≥50%

**Risco de não fazer**: regressão silenciosa em alocação N:M / ingestão manual / reconciliação; bug chega ao analista da Columbia antes do dev (vide `borderô-finalizar` Stage B aberto).

**Dependências**: nenhuma — CC-1 já entregou a quebra; falta cobertura.

---

### [testability-3] Integration tests contra Postgres real (docker-compose.test.yml)

**QA**: Testability + Deployability
**Tactic alvo**: Sandbox
**Esforço**: L
**Findings**: F-testability-5

**Problema**
> Zero `describe('integration:')` em todo o backend. Nenhum `docker-compose.test.yml`. Mesmo após CC-2 levar `PermutaExecucaoRepository` a 100% lines, **nenhum byte de SQL roda contra Postgres** — repos seguem mockando `db.query` literal. `PermutaRelationalRepository.ts` (629 LOC, 48.21% branches: CTE/JOIN/CASE), `PermutaExecucaoRepository.ts` (UPSERT/RETURNING/CASCADE) podem ter SQL inválido que só estoura no Render.

**Melhoria Proposta**
> Criar `src/backend/docker-compose.test.yml` (Postgres 16 + script de schema). Adicionar `npm run test:integration` que sobe container, roda só `*.integration.test.ts` e tira no fim. Escrever ≥5 integration tests por repo complexo (foco: query principal, edge case de UPSERT, CASCADE, `ORDER BY NULLS LAST`, JOIN ambíguo).

**Resultado Esperado**
> Integration tests: 0 → ≥15. `docker-compose.test.yml` presente e documentado. Job separado no CI.

**Métricas de sucesso**
- Integration test files: 0 → ≥3
- Integration test cases: 0 → ≥15
- `docker-compose.test.yml`: não → sim

**Risco de não fazer**: SQL quebrado mergea verde; bug aparece no analista.

**Dependências**: nenhuma.

---

### P1 — XL (>2 semanas)

### [security-6] Endurecer tenant isolation — coluna `tenant_id` no DB + EnvironmentProvider via SSM

**QA**: Security
**Tactic alvo**: Separate Entities
**Esforço**: XL
**Findings**: F-security-7, F-security-8

**Problema**
> Promessa central da proposta SaaSo ("compromisso em A não vaza para B") **não está cumprida**. Hoje 1 Supabase + 1 Render + 1 conjunto de credenciais Conexos atende `client_name=local`. Adicionar 2º cliente vira P0 de imediato — sem isolamento criptográfico, de rede ou de IAM. `.env` local aponta para Supabase e Conexos de produção; roubo de laptop = vetor de PROD.

**Melhoria Proposta**
> Roadmap em 3 passos: (1) coluna `tenant_id` em toda tabela de domínio (`permuta_*`, `app_user`, `permuta_alocacao_execucao`) + filtro `WHERE tenant_id = $tenant` em toda query (validar via `PatternGuardian`); (2) ativar `EnvironmentProvider.GetLambdaEnvironmentVars` (já existe; ativar via `client_name != local`) lendo SSM `/tenants/{env}/{client}/...`; (3) primeiro tenant real provisionado via Terraform (`infra/tenants/`).

**Resultado Esperado**
> Cada cliente isolado por env/SSM/DB schema; compromisso em A não atinge B.

**Métricas de sucesso**
- Contas/projetos isolados por cliente: 1 (compartilhado) → N (1 por cliente)
- Queries com filtro tenant explícito: 0/N → 100%
- PatternGuardian gate "query sem tenant_id": ausente → presente

**Risco de não fazer**: bloqueia onboarding do 2º cliente; qualquer incidente em tenant A vaza para B. **Bloqueio comercial da SaaSo.**

**Dependências**: ADR estratégico (compra de migração agora vs ao 2º cliente) — chamar Yuri.

---

### [integrability-4] Modelar Nexxera/GED/SharePoint via `/feature-new` + template `ontology/integrations/_template.md`

**QA**: Integrability
**Tactic alvo**: Encapsulate / Discover Service / Abstract Common Services
**Esforço**: XL (este card = template + ordenação; cada provedor é XL próprio)
**Findings**: F-integrability-4, F-integrability-5

**Problema**
> Frente II (SISPAG/Nexxera — remessa/retorno CNAB) e Frente III (Popula GED — SharePoint→GED) seguem com 0 código / 0 doc / 0 config. Pós-CC-2 o padrão a copiar é claro mas não está documentado em template oficial — cada `/feature-new` vai reaprender do código.

**Melhoria Proposta**
> (1) Criar `ontology/integrations/_template.md` cristalizando o padrão CC-2. (2) Atualizar `ontology/integrations/conexos.md` referenciando o template (resolve F-integrability-5). (3) Para cada provedor, rodar `/feature-new` distinto que produz `NexxeraRemessaClient`/`NexxeraRetornoClient` (CNAB), `GedClient` (upload), `SharePointClient` (PDF source) + entradas SSM/`EnvironmentVars.ts`. (4) `PatternGuardian` bloqueia merge sem doc `ontology/integrations/<name>.md`.

**Resultado Esperado**
> 3 novas integrações nasceram seguindo o padrão; marginal cost para a 4ª = 1 doc + 1 client + 1 schema.

**Métricas de sucesso**
- Integrações com client + ontology doc: 1 → 4
- Template oficial: 0 → 1 (`ontology/integrations/_template.md`)
- Referência ao padrão no `PatternGuardian`: não → sim

**Risco de não fazer**: SISPAG e Popula GED entram sem padrão referenciável; débito multiplica; o ganho do CC-2 evapora na próxima frente.

**Dependências**: ortogonal a `[integrability-1+modifiability-7]`/`[integrability-2]`/`[testability-5+integrability-3]`.

---

## P2 — Médio (ordem: S → M → L)

### P2 — S

### [integrability-5] Atualizar `ontology/integrations/conexos.md` para refletir os 5 arquivos pós-CC-2

**QA**: Integrability
**Tactic alvo**: Adhere to Standards
**Esforço**: S
**Findings**: F-integrability-5

**Problema**
> A doc `ontology/integrations/conexos.md` tem 7 menções ao `ConexosClient.ts` (REMOVIDO) e zero menção aos novos `ConexosBaseClient`/`…BaixaClient`/`…FinanceiroClient`/`…TitulosClient`/`…CadastroClient`. Próximo `/feature-new` que ler a doc vai bater em link morto — anula a melhoria estrutural do CC-2.

**Melhoria Proposta**
> Reescrever a tabela de endpoints amarrando cada wire endpoint ao novo sub-client + método + faixa de linhas. Acrescentar seção "Arquitetura CC-2". Sincronizar `ontology/_index.json` e `ontology/_coverage.json`. Atualizar `ontology/_inbox/migration-debt.md:42` (O3) removendo a referência ao "ConexosClient".

**Resultado Esperado**
> Doc reflete o código; novo integrador encontra o padrão sem precisar ler 5 arquivos.

**Métricas de sucesso**
- Menções a `ConexosClient.ts` (arquivo morto) na doc: 7 → 0
- Menções aos novos sub-clients: 0 → ≥5 (1 por arquivo)
- `_index.json` aponta para arquivos existentes: ?? → 100%

**Risco de não fazer**: `/feature-new` para Nexxera lê `conexos.md`, encontra padrão morto, replica god-client por engano.

**Dependências**: ortogonal; pode ser feito imediatamente.

---

### [integrability-6] Banir `process.env.X` em service/client (BcbClient + 4 demais) + lint

**QA**: Integrability
**Tactic alvo**: Configure Behavior / Discover Service
**Esforço**: S
**Findings**: F-integrability-7

**Problema**
> 5 leituras de `process.env.X` fora do `EnvironmentProvider` em service/client: `BcbClient.ts:123` (`BCB_CDI_FALLBACK`), `services/conexos.ts:80,144-145` (`BASE_URL/USERNAME/PASSWORD`), `config.ts:9` (`CONEXOS_FIL_COD`). Viola Inviolable Rule #8; deixa o caminho Lambda+SSM impraticável.

**Melhoria Proposta**
> Estender `EnvironmentVars` com `bcbCdiFallback` (e mover `CONEXOS_FIL_COD` para lá). Lint custom (`PatternGuardian` ou Biome rule) bloqueia `process\.env\.` em `src/backend/domain/client/**` e `src/backend/domain/service/**`. Exceções aceitáveis (bootstrap/handler) declaradas em `appContainer.ts`, `index.ts`, handlers.

**Resultado Esperado**
> 0 leituras de `process.env` em client/service.

**Métricas de sucesso**
- `process.env.X` em client/service: 5 → 0
- Regra ativa no PatternGuardian: não → sim
- Hardcode tenant URL: presente → ausente (resolvido em sub-card `[integrability-1 + modifiability-7]`)

**Risco de não fazer**: cresce com cada `/feature-new`; debugging "por que a env não pegou em SSM?" vira recorrente.

**Dependências**: complementa `[integrability-1 + modifiability-7]` (mata a maior fonte hoje em uma tacada só).

---

### [integrability-7] Versionamento + back-compat shim doc para integrações

**QA**: Integrability
**Tactic alvo**: Versioning Strategy / Backward-compatibility Shims
**Esforço**: S
**Findings**: F-integrability-6

**Problema**
> Conexos `/api` sem versão; BCB SGS idem. Quirks (HTTP 400 com `responseData` válido) já estão sendo silenciosamente compensados sem rastro formal. Quando trocar provedor (Nexxera→outro banco) não há cláusula declarada.

**Melhoria Proposta**
> (1) Adicionar campo `wire_contract_observed_at` em cada `ontology/integrations/<name>.md` (frontmatter) — referência à HAR/probe. (2) Para cada quirk-handler no sub-client, exigir comentário `// QUIRK: <provider>@<observed-at>` + link para fixture. (3) Doc curto `docs/integrations/upgrade-playbook.md` com passos para "provedor mudou shape".

**Resultado Esperado**
> Quirks rastreáveis; upgrade do Conexos vira playbook executável.

**Métricas de sucesso**
- Endpoints com `wire_contract_observed_at`: 0 → 100% dos documentados
- Quirks anotados: 0 → 100%

**Risco de não fazer**: quirk-creep silencioso continua; o próximo `/feature-new` reaprende do zero.

**Dependências**: nenhuma; ortogonal.

---

### [deployability-1] Publicar workflow `rollback.yml` que dispara redeploy via Render Deploy Hook e valida `/health.version`

**QA**: Deployability
**Tactic alvo**: Rollback (pipeline)
**Esforço**: S
**Findings**: F-deployability-1

**Problema**
> Após a confirmação de que o rollback do **estado ERP** já é 1-clique na UI (Cancelar/Excluir/Estornar borderô em `BorderosPanel.tsx` + `BorderoGestaoService`), o gargalo de Rollback que sobra é o **código**: hoje, voltar um SHA exige operador entrar no Render dashboard e clicar "Redeploy" (~3–5min) ou re-push de `git revert`. Não há `workflow_dispatch` parametrizado por SHA com asserção pós-rollback.

**Melhoria Proposta**
> Criar `.github/workflows/rollback.yml` (`workflow_dispatch` com input `commit_sha`): (a) `curl -X POST $RENDER_DEPLOY_HOOK_URL?ref=$commit_sha`; (b) polling de `GET $RENDER_URL/health` por até 8min verificando `version == package.json@$commit_sha`; (c) registra no log do run o SHA anterior, o SHA-alvo e o `version` final. Manter o caminho UI como rollback de estado — não duplicar.

**Resultado Esperado**
> Rollback de código one-command, auditável no histórico do GitHub Actions.

**Métricas de sucesso**
- # workflows de rollback no `.github/workflows/`: 0 → 1
- MTTR rollback de código (operador sem acesso ao dashboard): ~5–10min → ≤3min

**Risco de não fazer**: baixa — rollback de estado já é 1 clique (F-1 reavaliado). Risco residual: incidente fora do horário em que o operador não tem acesso ao Render dashboard.

**Dependências**: secret `RENDER_DEPLOY_HOOK_URL` no GitHub Actions; documentar runbook curto.

---

### [security-7] Helmet + security headers no Express

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: S
**Findings**: F-security-6

**Problema**
> `src/backend/index.ts:16-97` não monta `helmet()` — respostas backend saem sem `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. Frontend Vercel adiciona alguns, mas o backend (alvo direto de XHR) não.

**Melhoria Proposta**
> `npm i helmet`; `app.use(helmet())` antes do CORS em `index.ts`. CSP provavelmente desnecessária porque o backend só serve JSON.

**Resultado Esperado**
> Hardening browser-level via header.

**Métricas de sucesso**
- Security headers presentes (medido com `curl -I`): 0 → ≥5

**Risco de não fazer**: hardening fraco em browser; securityheaders.com dá nota F.

**Dependências**: nenhuma.

---

### [security-8] Limpar `credentials: true` do CORS enquanto não houver cookie real

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: S
**Findings**: F-security-9, F-security-1

**Problema**
> `http/cors.ts:49` libera `credentials: true` sem que o sistema use cookie — Bearer no header. Armadilha: refactor futuro que adicione cookie de sessão (e.g. para mitigar F-security-1 via httpOnly cookie) herda essa flag e abre CSRF sem proteção.

**Melhoria Proposta**
> Remover `credentials: true` agora (validar que nada quebra). Comentário forte: "se voltar a usar cookie de sessão, RE-LIGAR e implementar CSRF token + SameSite=strict". Alternativa: implementar já o esquema cookie httpOnly + SameSite + CSRF token e migrar o JWT para lá (resolve F-security-1 também).

**Resultado Esperado**
> Sem superfície CSRF latente.

**Métricas de sucesso**
- `Access-Control-Allow-Credentials` no response: `true` → (removido)

**Risco de não fazer**: armadilha para próximo refactor.

**Dependências**: coordenar com `[security-1]` (decisão sobre cookie httpOnly).

---

### [fault-tolerance-6] Trocar silent catch de `listTitulosAPagar` por fallback explícito com `logService.warn` + flag de origem

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking + Condition Monitoring
**Esforço**: S
**Findings**: F-fault-tolerance-6

**Problema**
> `ReconciliacaoPermutaService.executarBaixa` (linhas 318-320) tem `try { … } catch { /* segue no fallback */ }` ao listar títulos da invoice. Falha do ERP (5xx, timeout, Zod) cai silenciosamente para `titCod=1` com valor cheio. Se a invoice for de fato multi-título, anti-drift do passo 2 (linha 421) aborta com "anti-drift > em-aberto" — diagnóstico errado.

**Melhoria Proposta**
> (1) `logService.warn` no catch com `LOG_TYPE.BUSINESS_WARN`, mensagem `'listTitulosAPagar falhou — usando fallback titCod=1; conferir invoice'`, data `{ invoiceDocCod, filCod, error }`. (2) Flag local `titulosOrigem: 'erp' | 'fallback'` propagada no `markError` da baixa. (3) Teste: mockar `listTitulosAPagar` lançando → asserir que o warn é gravado e a flag aparece quando anti-drift dispara.

**Resultado Esperado**
> Diagnóstico claro em incidente: o analista enxerga "ERP não devolveu títulos (fallback)" ao invés de "anti-drift".

**Métricas de sucesso**
- Logs explícitos de fallback: 0 → todo catch
- Cobertura de teste do caminho fallback: 0 → 1

**Risco de não fazer**: incidentes de leitura do ERP confundidos com erros de alocação; tempo de incidente cresce; relevante porque multi-título acabou de entrar em produção.

**Dependências**: nenhuma.

---

### P2 — M

### [modifiability-1 + performance-6] Continuar split de `page.tsx` (1026 LOC) — extrair `useFiltros`/`useAlocacaoManual`/`useReconciliar`/`useLote`

**QA**: Modifiability + Performance
**Tactic alvo**: Split Module · Increase Semantic Coherence · Reduce Overhead + Bundle leanness
**Esforço**: M
**Findings**: F-modifiability-1, F-performance-7
**Consolida**: modifiability-1 (P2) + performance-6 (P2) — mesma melhoria

**Problema**
> Pós-CC-1, `page.tsx` caiu de 2971 → 1026 LOC com `React.memo` em 5 abas e `next/dynamic` em 5 modais — re-render cross-aba e bundle dos modais resolvidos. Mas o raiz ainda concentra 24 `useState`, 12 `useMemo/useCallback` e 6 handlers de mutação. Qualquer setState do raiz ainda repinta filtros + KPIs. `VisaoGeralTable.tsx` (486 LOC) é o maior leaf component.

**Melhoria Proposta**
> (1) Extrair `useFiltros()` (filtro/filial/exportador/paginação/vista) — ~200 LOC. (2) Extrair `useAlocacaoManual()` (estado + handlers `abrirAlocar`/`buscarAloc`/`adicionarAloc`/`removerAloc`) — ~150 LOC. (3) Extrair `useReconciliar()` (estado + `abrirReconciliar`/`executarReconciliar`) — ~80 LOC. (4) Extrair `useLote()` (`executarLote` + `loteResumo`) — ~70 LOC. (5) Particionar `VisaoGeralTable` em `VisaoGeralHeader` + `VisaoGeralRow` + `VisaoGeralFooter`. Considerar mover cada aba para `app/permutas/<tab>/page.tsx` (Next.js route segments).

**Resultado Esperado**
> LOC `page.tsx`: 1026 → ≤600. useState ≤ 10. Dialog refs ≤ 5. Cobertura por componente continua subindo. First Load JS /permutas: medir baseline → ≤200KB.

**Métricas de sucesso**
- LOC `page.tsx`: 1026 → ≤500
- useState count: 24 → ≤10
- Dialog/Modal refs: 19 → ≤5
- LOC `VisaoGeralTable.tsx`: 486 → ≤300

**Risco de não fazer**: SISPAG aba nova vai estabilizar `page.tsx` em ~1200 LOC; conflito de merge entre frentes volta.

**Dependências**: nenhuma.

---

### [modifiability-2] Extrair `ConexosTituloValidationClient` de `ConexosBaixaClient` (split residual CC-2)

**QA**: Modifiability
**Tactic alvo**: Increase Semantic Coherence · Split Module
**Esforço**: M
**Findings**: F-modifiability-2, F-modifiability-10

**Problema**
> Pós-split CC-2, `ConexosBaixaClient.ts` (481 LOC, 13 publics) é o **único** sub-client que mistura 3 áreas-entidade (7 publics de borderô + 3 de baixa + 3 de título-validate). `ConexosFinanceiroClient.ts` segue acima do alvo (703 LOC > 600), embora coeso.

**Melhoria Proposta**
> Extrair `ConexosTituloValidationClient` (`validarTituloBaixa`, `validarTituloPermuta`, `gravarBaixaPermuta`) — 3 publics centrais para o risco #1 (write-back fin010), testável e auditável em isolamento. Considerar separar `ConexosBorderoClient` (7 publics) de `ConexosBaixaPagamentoClient` (3 publics). Para `ConexosFinanceiroClient`, refatorar a função complexity-24 (linha 433) reduzindo em ~80 LOC.

**Resultado Esperado**
> Cada sub-client = 1 área-entidade; max LOC por sub-client ≤ 400; risco #1 isolado em `ConexosTituloValidationClient`.

**Métricas de sucesso**
- Áreas-entidade por sub-client: 3 (Baixa) → 1
- Public methods por sub-client: max 13 → ≤8
- LOC `ConexosFinanceiroClient.ts`: 703 → ≤600
- LOC `ConexosBaixaClient.ts`: 481 → ≤300

**Risco de não fazer**: o sub-client Baixa vira novo god-client à medida que a frente Reconciliação amadurece.

**Dependências**: nenhuma (DI tokens já existem).

---

### [modifiability-8] Quebrar `routes/permutas.ts` (25 rotas) por área de domínio

**QA**: Modifiability
**Tactic alvo**: Split Module
**Esforço**: M
**Findings**: F-modifiability-8

**Problema**
> 25 rotas e 29 imports em um único `routes/permutas.ts:1-772`. Mistura eleição, gestão, alocação, borderô, reconciliação, ingestão, status, relatórios. **Inalterado** vs. run anterior.

**Melhoria Proposta**
> Criar `routes/permutas/index.ts` (composer) + sub-routers `eleicao.ts`, `gestao.ts`, `alocacao.ts`, `bordero.ts`, `reconciliacao.ts`, `ingestao.ts`, `relatorios.ts`. Cada sub-router ≤ 10 rotas, ≤ 300 LOC. Reaproveita services existentes.

**Resultado Esperado**
> Maior arquivo de rota cai para ≤300 LOC; conflito por merge entre frentes some; preparação para `lambda/api/permutas/*` do alvo.

**Métricas de sucesso**
- LOC maior `routes/*.ts`: 772 → ≤300
- Rotas por arquivo: 25 → ≤10

**Risco de não fazer**: ramo permanente de conflito ao ligar SISPAG/GED.

**Dependências**: rodar depois do `[modifiability-4]` (assim os repos saem da rota antes do split).

---

### [modifiability-9 + integrability-6] Ratchet de qualidade no CI — congelar warnings, exigir queda

**QA**: Modifiability + Integrability
**Tactic alvo**: Refactor · Restrict Dependencies (como gate)
**Esforço**: S
**Findings**: F-modifiability-3, F-modifiability-4, F-modifiability-5, F-modifiability-7, F-modifiability-9, F-integrability-7

**Problema**
> Lint roda mas warnings não bloqueiam merge. Cognitive-complexity warnings subiram 20→22 sem aviso (drift confirmado); cross-layer imports (F-modifiability-4) seguem; `process.env` debt caiu organicamente mas não por gate.

**Melhoria Proposta**
> Adicionar `scripts/lint-ratchet.ts` que conta: (a) warnings `noExcessiveCognitiveComplexity`; (b) ocorrências de `process.env` fora do EnvironmentProvider; (c) imports cross-layer; (d) ocorrências de `titCod: 1`. PR falha se qualquer contagem **subir**. Rodar no GitHub Actions junto com `npm test`.

**Resultado Esperado**
> Não-aumento monotônico de débito; cada feature paga ou mantém.

**Métricas de sucesso**
- Warnings em ratchet: livres → monotonicamente não-crescentes
- Cross-layer violations detectadas no PR: 0 → 100%
- Hardcode `titCod: 1` em PR: livre → bloqueado se crescer

**Risco de não fazer**: drift silencioso continua; Regis-Review vira a única defesa, atuando depois do merge.

**Dependências**: nenhuma.

---

### [availability-5] Circuit breaker no `ConexosBaseClient` (fail-fast quando Conexos cai)

**QA**: Availability
**Tactic alvo**: Removal from Service + Ignore Faulty Behavior
**Esforço**: M
**Findings**: F-availability-5

**Problema**
> Sem breaker, falha sustentada do Conexos = cada chamada espera 40s × 2 retries × `1 + 4×N` chamadas do handshake × LOTE_MAX adtos. Para N=3 e LOTE_MAX=6 isso é ~6× ~533s. Render proxy mata em ~100s, gerando 502 com side-effects parciais.

**Melhoria Proposta**
> Envolver `ConexosBaseClient.runWithRetry` (compartilhado pelos 4 sub-clients pós-CC-2) em um breaker tipo Opossum (`npm install opossum`): abre após 5 falhas consecutivas em 30s, half-open após 60s. Quando aberto, lança `ConexosUnavailableError` imediatamente.

**Resultado Esperado**
> Tempo máximo de espera durante incidente Conexos cai de ~533s/par para ~5s.

**Métricas de sucesso**
- Breakers configurados: 0 → 1
- Tempo máximo de hold em incidente upstream: ~533s (N=3) → ~5s

**Risco de não fazer**: incidente longo do Conexos = inutilização total do backend por arrastamento.

**Dependências**: idealmente após `[availability-3]` (Sentry) para visualizar abertura/fechamento.

---

### [availability-7] Implementar `FallbackExecutor` e aplicar em `GET /permutas/borderos` (stale-while-error)

**QA**: Availability
**Tactic alvo**: Passive Redundancy + Degradation
**Esforço**: M
**Findings**: F-availability-8, F-availability-5

**Problema**
> `FallbackExecutor` é citado como primitiva alvo no CLAUDE.md mas não existe no código. `BorderoGestaoService.refreshCache` já tem `.catch → []` per-filial (✅), mas se TODAS as filiais falharem o cache pode ficar vazio numa carga inicial; e o endpoint não distingue dado fresco vs. dado stale.

**Melhoria Proposta**
> (1) Implementar `FallbackExecutor implements IExecutor`: tenta `primary`, se lança usa `fallback`, retorna o resultado + marca `stale=true`. (2) Aplicar no `BorderoGestaoService.listarBorderos({ live: true })` — se refreshCache falhar completamente, ler do cache + adicionar header `X-Cache-Stale: true` + campo `geradoEm` indicando idade.

**Resultado Esperado**
> Em incidente Conexos, tela de gestão continua mostrando borderôs (com aviso) em vez de 500.

**Métricas de sucesso**
- Rotas com fallback configurado: 0 → 1
- Implementações de `IExecutor`: 1 → 2 (RetryExecutor, FallbackExecutor)

**Risco de não fazer**: cada minuto de Conexos fora = minuto sem gestão visível, mesmo com cache disponível.

**Dependências**: ideal após `[availability-5]` (breaker).

---

### [performance-3] Habilitar HTTP keep-alive no axios do Conexos

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-3

**Problema**
> `services/conexos.ts:79-82` cria axios sem `httpsAgent`. Cada chamada paga handshake TCP+TLS (~90–150ms a 30ms RTT). **Agravante NOVO:** com SWR de `BorderosPanel`, cada mount da aba Borderôs dispara `refreshCache` = 10 filiais × handshake → 0.9–1.5s de overhead.

**Melhoria Proposta**
> Adicionar `httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10 })`. `maxSockets=20` casa com `FILIAIS_CONCURRENCY × ADIANTAMENTOS_CONCURRENCY` da Eleição.

**Resultado Esperado**
> Overhead por chamada Conexos: 90–150ms → ~5–10ms. Tempo da revalidação SWR Borderôs (10 filiais): ~1.0s → ~200ms.

**Métricas de sucesso**
- axios clients com keep-alive agent: 0 → 1
- duração da revalidação SWR Borderôs em dev (10 filiais): ~1.0s → ≤300ms

**Risco de não fazer**: SWR de Borderôs entrega TTFB rápido (cache) mas revalidação fica visivelmente custosa.

**Dependências**: nenhuma. Será resolvido naturalmente como parte de `[integrability-1 + modifiability-7]` se a migração levar o axios para o `ConexosBaseClient` com keep-alive embutido.

---

### [performance-4] Cobrir `fetch` do frontend com `AbortController` + timeout (15s default, 60s para ingestão)

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-6

**Problema**
> Nenhuma das ~25 chamadas `fetch` em `src/frontend/lib/api.ts` tem timeout ou `signal`. Se backend/Conexos travar, spinner é eterno; setState após unmount = leak. **Agravante NOVO:** SWR de `BorderosPanel` dispara DUAS chamadas no mount — a flag `active` evita `setState` mas não cancela a request.

**Melhoria Proposta**
> Criar wrapper `fetchWithTimeout(url, opts, timeoutMs = 15_000)` que monta `AbortController` interno. Substituir os call-sites; usar 60_000ms para `runIngestaoManual`. Reescrever cleanup do `useEffect` de `BorderosPanel` para usar `AbortController` no lugar da flag `active`.

**Resultado Esperado**
> Spinner infinito em rotas penduradas: comportamento atual → erro pt-BR amigável em ≤15s.

**Métricas de sucesso**
- fetches sem timeout em `lib/api.ts`: 25 → 0
- requisições órfãs por sessão (DevTools Network): N → 0

**Risco de não fazer**: UX ruim em pico/erro; com SWR ativo, "atualizando…" pode girar para sempre.

**Dependências**: pré-requisito recomendado para `[performance-2]` (polling do job lote precisa de timeout).

---

### [performance-5] Adicionar `LIMIT` defensivo + paginação aos hot reads de `permuta_*`

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-5

**Problema**
> 7 `selectMany` em hot paths sem `LIMIT` (listAtivas, listAdiantamentosAtivos, listInvoicesEmAberto, listDeclaracoes, listCasamentos, listImportadores, listComBordero). Hoje rápido — escala linear sem teto.

**Melhoria Proposta**
> (1) Cada read recebe um `LIMIT $limit` parametrizado com default sensato (5000 para os de leitura ativa; 500 para `listComBordero`). (2) Quando o `rowCount` igualar o limit, emitir `LogService.warn(BUSINESS_WARN, 'limit hit')`. (3) Cardinalidade > 10k em qualquer um dos 7 → quebrar em paginação cursor-based.

**Resultado Esperado**
> Reads sem `LIMIT` em hot paths: 7 → 0. Bound de pior caso para `/permutas/gestao`: definido.

**Métricas de sucesso**
- `# selectMany sem LIMIT em rotas HTTP`: 7 → 0
- presença do warn "limit hit" como alarme observável: ausente → presente

**Risco de não fazer**: P2 hoje, vira P0 silenciosamente se a operação dobrar de volume.

**Dependências**: nenhuma.

---

### [testability-2] Adicionar threshold `./domain/repository/` no `jest.config.cjs` para defender o ganho da CC-2

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-2b

**Problema**
> CC-2 levou `PermutaExecucaoRepository` de 51.42% → 100% lines e o agregado `domain/repository/permutas` para 96.91% lines. Mas o `jest.config.cjs` **não tem chave** para esse diretório. Uma regressão para 75% lines no repo crítico passaria silenciosamente.

**Melhoria Proposta**
> Adicionar em `src/backend/jest.config.cjs:34-44`:
> ```js
> './domain/repository/': { lines: 90, branches: 60, functions: 85 },
> ```
> Comentar a justificativa.

**Resultado Esperado**
> Threshold `domain/repository/` definido. CI passa a falhar se cobertura cair abaixo.

**Métricas de sucesso**
- Chave `./domain/repository/` no `jest.config.cjs`: ausente → presente
- Branches `PermutaExecucaoRepository`: 65.38% → ≥70%

**Risco de não fazer**: dupla-baixa em `fin010` reintroduzida sem alarme; ganho da CC-2 evapora.

**Dependências**: nenhuma.

---

### [testability-7] Padronizar log assertions em paths de erro (helper `buildLogService()` em `tests/utils/`)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: M
**Findings**: F-testability-8

**Problema**
> 12/44 arquivos de teste BE referenciam `LogService`; quase todos só para mocá-lo e ignorar. Apenas `EleicaoPermutasService.test.ts:23-32` captura calls via `buildLogService()`. Erros em produção chegam sem `LOG_TYPE` correto e sem contexto (`borCod`, `priCod`).

**Melhoria Proposta**
> Extrair `buildLogService()` para `src/backend/tests/utils/buildLogService.ts`. Em cada `.rejects.toThrow(...)`, adicionar `expect(logCalls).toContainEqual({ type: LOG_TYPE.<algo>, data: expect.objectContaining({ requestId, ... }) })`.

**Resultado Esperado**
> Arquivos de teste com log assertion em paths de erro: ~2 → ≥20.

**Métricas de sucesso**
- Testes assertando log shape: ~2 → ≥20
- Helper compartilhado: não → sim

**Risco de não fazer**: MTTR de investigação cresce.

**Dependências**: nenhuma.

---

## P3 — Baixo

### [security-9] `requestId` em todo response 4xx/5xx do `errorMiddleware` + validações Zod

**QA**: Security
**Tactic alvo**: Audit Trail (correlação)
**Esforço**: S
**Findings**: F-security-10

**Problema**
> `http/errorMiddleware.ts:35` devolve `{error: 'Internal server error'}` sem `requestId`. As validações Zod (`routes/permutas.ts:284,315,362,385,491,522,550`) idem. O header `X-Request-Id` está presente, mas usuário relatando bug copia o body — suporte demora para correlacionar.

**Melhoria Proposta**
> `res.status(500).json({ error: 'Internal server error', requestId: req.requestId });` (padrão já adotado em `respondActionError` em `routes/permutas.ts:117-155`). Helper `respondZodError(res, parsed.error, req.requestId)` para Zod.

**Resultado Esperado**
> Triagem de incidente mais rápida.

**Métricas de sucesso**
- % respostas 4xx/5xx com `requestId`: ~50% → 100%

**Risco de não fazer**: tempo de suporte aumenta; baixa prioridade.

**Dependências**: nenhuma.

---

### [testability-8] Quebrar `ConexosSubClients.test.ts` (1657 LOC) em um arquivo por sub-client

**QA**: Testability
**Tactic alvo**: Limit Structural Complexity + Executable Assertions
**Esforço**: M
**Findings**: F-testability-9, F-testability-2b

**Problema**
> CC-2 decompôs `ConexosClient` em 5 sub-clients — bom. Mas os testes ficaram concentrados num único `ConexosSubClients.test.ts` de 1657 LOC. Adicionalmente, `ConexosBaixaClient.ts` (write `fin010`) está em **40.9% branches**.

**Melhoria Proposta**
> Quebrar `ConexosSubClients.test.ts` em 5 arquivos co-localizados (`ConexosBaseClient.test.ts`, `ConexosBaixaClient.test.ts`, `ConexosCadastroClient.test.ts`, `ConexosFinanceiroClient.test.ts`, `ConexosTitulosClient.test.ts`). Aproveitar para adicionar 5+ testes de path de erro no `ConexosBaixaClient` para subir branches 40.9 → 70+.

**Resultado Esperado**
> `ConexosSubClients.test.ts` deletado; 5 arquivos novos ≤500 LOC cada. `ConexosBaixaClient.ts` branches 40.9% → ≥70%.

**Métricas de sucesso**
- Maior teste BE: 1657 → <600 LOC
- Arquivos de teste co-localizados por sub-client: 0 → 5
- `ConexosBaixaClient.ts` branches: 40.9% → ≥70%

**Risco de não fazer**: onboarding alto; refactor de um sub-client carrega risco percebido do teste enorme.

**Dependências**: combinar com `[testability-5 + integrability-3]` (fixtures) faz sentido.

---

### [testability-9] Adicionar `fast-check` e ≥4 properties cobrindo lógica numérica de Permutas

**QA**: Testability
**Tactic alvo**: Limit Non-Determinism
**Esforço**: S
**Findings**: F-testability-10

**Problema**
> `fast-check` nem é dep direta. `progressoPagamento` (câmbio), `ordenarBorderosPainel`, `bucketEtapaPermuta`, `AlocacaoPermutasService.alocar` testados com 3-5 example-based cases. Edge-cases de arredondamento, ordenação instável, alocação somando errado escapam.

**Melhoria Proposta**
> `npm i -D fast-check` em BE e FE. Properties: (1) `progressoPagamento(face, aberto, taxa)` ⇒ `percentPago ∈ [0,99]`; (2) `bucketEtapaPermuta(etapas)` ⇒ resultado em `{0,1,2}`; (3) `ordenarBorderosPainel(rows)` ⇒ idempotente, estável, não-mutante; (4) `AlocacaoPermutasService.alocar(invoice, adiantamentos)` ⇒ soma das alocações == valor invoice.

**Resultado Esperado**
> `fast-check` dep direta: ausente → presente (BE+FE). Properties: 0 → ≥4.

**Métricas de sucesso**
- `fast-check` em `package.json` (BE+FE): não → sim
- Properties no repo: 0 → ≥4

**Risco de não fazer**: bug sutil de arredondamento em valor financeiro.

**Dependências**: nenhuma.
