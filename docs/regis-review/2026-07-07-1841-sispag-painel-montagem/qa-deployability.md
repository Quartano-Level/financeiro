---
qa: Deployability
qa_slug: deployability
run_id: 2026-07-07-1841-sispag-painel-montagem
agent: qa-deployability
generated_at: 2026-07-07T18:41:00-03:00
scope: all
score: 7
findings_count: 6
cards_count: 5
---

# Deployability — Regis-Review (SISPAG Painel + Montagem, Escopo II Fatia 1+2)

> **Escopo desta review:** delta da branch `feat/sispag-painel-montagem` sobre `main@17dae9e` (v0.11.0).
> Foco em: (a) segurança da migration `0023_lote_pagamento.sql` no `preDeployCommand` do Render;
> (b) impacto de deploy do novo router `/sispag`; (c) backward-compat; (d) bump de versão (FE==BE lockstep,
> gate #10 do AutoLoopRunner); (e) feature-flag / rollback do estado local (Postgres) — I1 do ADR-0015
> garante **zero escrita no ERP** nesta fatia, o que remove o principal risco de deploy que Permutas
> tinha (fin010 write). Achados **estruturais** da plataforma (rollback pipeline, staging, smoke test,
> `/ready`, Node pinning, PowerShell-only bump) foram documentados exaustivamente na run
> `2026-06-26-1708` — aqui só são referenciados quando o feature-delta os toca. Nada mudou em
> `render.yaml`, `.github/workflows/`, `scripts/`, `migrations/runMigrations.ts` nesta feature.
>
> **Veredito rápido:** a feature é **deploy-safe por design** — migration idempotente (`IF NOT EXISTS`),
> forward-only sem DROP/ALTER de tabelas pré-existentes, **sem FK para tabelas do domínio Permutas**
> (rollback de código deixa as tabelas novas ociosas, sem dangling refs), **sem novas env vars**
> (reusa `CONEXOS_*` + `databaseConnectionString`), rotas puramente aditivas, sem tocar o `/health`.
> Nenhum P0 novo. Score 7 (acima do platform-wide 6 porque este slice específico é excepcionalmente
> seguro para promover).

## 1. Cenário Geral (Bass General Scenario aplicado à SISPAG Fatia 1+2)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev (merge do PR desta feature em `main`) | Push cria nova migration `0023_lote_pagamento.sql` (2 tabelas + 2 índices) e monta o router `/sispag` (`src/backend/index.ts:98`) + página FE `/sispag` | `src/backend/**` (rebuild Render) + `src/frontend/**` (rebuild Vercel) + banco Supabase (2 novas tabelas via `preDeployCommand`) | Produção single-region (Render `starter` + Vercel + Supabase), 24/7. **I1 do ADR-0015**: zero escrita no ERP nesta fatia — estado do lote vive só no Postgres próprio | `preDeployCommand` (`npm run migrate && npm run seed:admin`) roda `0023` (idempotente, `IF NOT EXISTS`); se falhar, Render mantém container anterior sem servir tráfego. Rotas `/sispag/*` só entram no ar após o novo container passar em `/health`. Rollback de código = redeploy do SHA `main@17dae9e` no Render dashboard (~3–5 min); as tabelas `lote_pagamento*` ficam ociosas (sem FK a Permutas) — **zero risco de esquema órfão** | Tempo de aplicação da migration ≤ 500 ms (só `CREATE TABLE IF NOT EXISTS`); lead-time commit→prd ≤ 10 min BE; zero incompatibilidades com v0.11.0 (só adição). Rollback de estado local do lote = `DELETE FROM lote_pagamento WHERE …` (não exposto na UI, exige DBA) |

> ⚠️ **Não medível localmente:** taxa de sucesso do primeiro deploy em prd (Render API), MTTD real de
> regressão em `/sispag/painel` (sem instrumentação), duração real do `preDeployCommand` com este
> `0023` adicionado. Recomendação: capturar tempo do `[migrate] applied 1 migration(s): 0023_lote_pagamento.sql`
> no log do Render pós-merge para futura baseline.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Idempotência da migration `0023` | **100%** — 2× `CREATE TABLE IF NOT EXISTS` (`L10, L28`) + 2× `CREATE INDEX IF NOT EXISTS` (`L48, L51`). Zero `DROP`/`ALTER` de tabela pré-existente | 100% | ✅ | `src/backend/migrations/0023_lote_pagamento.sql:10,28,48,51` (checado com `grep -n "IF NOT EXISTS\|DROP\|ALTER"`) |
| Forward-safety da migration | ✅ ADDITIVE-ONLY — cria 2 tabelas novas (`lote_pagamento`, `lote_pagamento_item`); **nenhuma FK para tabelas Permutas/existentes** (só FK interno entre as duas tabelas novas, `L30` `REFERENCES lote_pagamento(id) ON DELETE CASCADE`) | additive-only | ✅ | `src/backend/migrations/0023_lote_pagamento.sql` inteiro |
| Rollback de código pós-migration | **Baixo risco** — voltar para `main@17dae9e` (v0.11.0) deixa `lote_pagamento*` órfãs no schema, mas sem app tocando; próximo deploy da feature reencontra idempotência (`IF NOT EXISTS`) e não recria | rollback trivial | ✅ | `src/backend/migrations/runMigrations.ts:38-50` (só INSERT em `schema_migrations` se aplicou; `applied.has(file)` skip → seguro re-executar) |
| Novas env vars introduzidas | **0** — `SispagPainelService` lê `env.getEnvironmentVars()` que já mapeia `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` existentes (`SispagPainelService.ts:59`); `ConexosSispagClient` herda credenciais Conexos existentes; `LotePagamentoRepository` usa `PostgreeDatabaseClient` existente | 0 | ✅ | `grep -n "CONEXOS_\|env\." src/backend/routes/sispag.ts src/backend/domain/service/sispag/*.ts src/backend/domain/client/ConexosSispagClient.ts` (0 novas refs) |
| Backward-compat das rotas | ✅ **puramente aditiva** — `app.use('/sispag', sispagRouter)` (`index.ts:98`); nenhuma rota existente alterada; `/health` intacto (`index.ts:66`) | additive | ✅ | `git status --short` (5 arquivos M, 0 rotas M em `routes/permutas.ts`/`routes/conexos.ts`/`routes/auth.ts`) |
| Rate-limit / surge protection nova rota | ✅ herda `globalLimiter` (100/min) via `index.ts:32`; **não** herda `heavyRouteLimiter` (10/min) — decisão consciente comentada em `index.ts:97` ("como as leituras de Permutas"). Justificável para leitura; **atenção** quando Fatia 3 (escrita) chegar | manter | ✅ | `src/backend/index.ts:97-98`, comparar com `index.ts:83` |
| RBAC nas rotas de escrita local | ✅ 5/5 rotas mutantes gated por `requireRole('admin')` (`sispag.ts:102, 119, 144, 172`); rotas de leitura (`GET /painel`, `GET /lotes`, `GET /lotes/:id`) abertas ao user autenticado | manter | ✅ | `grep -n "requireRole" src/backend/routes/sispag.ts` |
| Version bump aplicado (gate #10 do AutoLoopRunner) | ❌ **ausente** — `src/backend/package.json:3` = `0.11.0`, `src/frontend/package.json:3` = `0.11.0`; feature adiciona `feat` (novo router, novas tabelas) → deve ir para **0.12.0** antes do merge; `CHANGELOG.md` sem entrada | v0.12.0 lockstep + CHANGELOG | ❌ | `grep -n '"version"' src/backend/package.json src/frontend/package.json` + `head -30 CHANGELOG.md` |
| Script de bump multiplataforma | ❌ persiste — `scripts/bump-version.ps1` PowerShell-only (`#!/usr/bin/env pwsh`); nada mudou desde run `2026-06-26-1708` | ver F-deployability-4 daquela run | ❌ (herdado) | `scripts/bump-version.ps1` |
| Dead code compilado em `dist/` (probes) | ⚠️ **3 novos arquivos ad-hoc** (`jobs/probe-sispag.ts` 286 LOC, `probe-sispag-2.ts` 231 LOC, `probe-sispag-painel.ts` 47 LOC — 564 LOC total) commitados em `src/backend/jobs/`; nenhum script em `package.json` os chama, mas `tsc` inclui `jobs/**` e transpila para `dist/jobs/` → ~+564 LOC compiladas em cada deploy sem uso | 0 dead code em `dist/` | ⚠️ | `wc -l src/backend/jobs/probe-*.ts` + `grep -n "probe-sispag" src/backend/package.json` (0 refs) |
| Migration `DOWN` (reversão) | ❌ persiste da run anterior (`F-deployability-6` de `2026-06-26-1708`); porém aqui o risco é **muito baixo** — a migration só CRIA, sem FK de fora; rollback do código não requer reverter schema (tabelas ficam ociosas) | expand-then-contract; `0023` OK | ⚠️ (herdado, baixo impacto neste delta) | `src/backend/migrations/0023_lote_pagamento.sql` (sem par `*_down.sql`), `runMigrations.ts:38-50` |
| Feature flag para esconder `/sispag` em prd | ❌ **ausente** — home (`app/page.tsx:35-50`) já linka `/sispag`; usuário pode criar lote em prd hoje sabendo que a Fatia 3 (execução real) não existe. Marketing text "esboço read-only — nada é executado" mitiga, mas **lote local é criado no Postgres de prd** | flag `NEXT_PUBLIC_SISPAG_ENABLED` ou role-based | ❌ | `src/frontend/app/page.tsx:35-50`, `src/frontend/app/sispag/page.tsx` |
| Smoke test pós-deploy da nova rota | ❌ carry-over — `.github/workflows/ci.yml` não faz `curl $RENDER_URL/sispag/painel` após deploy; F-deployability-2 da run anterior ainda vale, agora com superfície maior | 1 job smoke que assert 200 em `/sispag/painel` (auth-bypass ou skip com 401) | ⚠️ (herdado) | `.github/workflows/ci.yml` (ausência); ver run `2026-06-26-1708` §F-2 |
| Deploy observability para `/sispag` | `/health` continua binário — não distingue "SISPAG router carregado" vs "só Permutas OK"; `SispagPainelService.montarPainel` faz `Promise.allSettled` (`L91`) por filial, ou seja, uma filial caída não derruba o painel — bom para availability, mas para deployability significa que dá para promover um deploy em que 100% das leituras de filial falham silenciosamente | expor `/ready` que valide DB + Conexos (carry-over) | ⚠️ (herdado) | `src/backend/index.ts:66`, `SispagPainelService.ts:91-104` |
| `preDeployCommand` blast-radius | 1 migration nova; comando `npm run migrate && npm run seed:admin` cascateia — se `seed:admin` quebrar por qualquer motivo (env `ADMIN_PASSWORD` faltando após rotação), a migration 0023 **já está aplicada** mas o container não é promovido. Idempotência salvaguarda o retry (schema_migrations já tem 0023 registrada) | manter idempotência | ✅ | `render.yaml:21`, `runMigrations.ts:47-50` |

## 3. Tactics — Cobertura no delta SISPAG

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Scale Rollouts** (canary/blue-green/staged) | Herdado — sem staging permanente; a feature vai direto para prd. Mitigador **específico desta fatia**: I1 (zero escrita ERP) reduz drasticamente o custo de um bug em prd | ❌ (herdado da plataforma) | ver run `2026-06-26-1708` §F-5 |
| **Rollback (pipeline / código)** | Sem mudança na plataforma. Neste delta específico, rollback é **excepcionalmente barato**: voltar SHA na Render deixa as 2 tabelas novas órfãs sem side-effect (nenhum consumer, nenhum FK reverso). Não precisa "down" | ⚠️ (herdado, baixo custo aqui) | `src/backend/migrations/0023_lote_pagamento.sql` (só CREATE), `runMigrations.ts` (schema_migrations skip) |
| **Rollback (data layer)** | Estado do lote vive só no Postgres próprio. Reverter um lote errado = `DELETE FROM lote_pagamento WHERE id=…` (ON DELETE CASCADE limpa itens). **NÃO exposto na UI** desta fatia (só `cancelarLote` existe → transição de status para `CANCELADO`, dados persistem). Analista não consegue apagar histórico | ⚠️ | `LotePagamentoService.ts:216-221` (cancelar = status change), sem endpoint `DELETE /sispag/lotes/:id` |
| **Rollback (state ERP)** | N/A por design (I1) — nenhuma escrita foi feita, nada precisa ser desfeito no Conexos | N/A | `routes/sispag.ts:14-21` (documentado) |
| **Script Deployment Commands** | Herdado — `bump-version.ps1` PowerShell-only. Este delta não muda o script mas depende dele para o bump 0.11.0 → 0.12.0 | ⚠️ (herdado) | `scripts/bump-version.ps1` |
| **Service Interaction Control** (toggles/feature flags) | **Gap novo**: `/sispag` já está linkado na home (`app/page.tsx:35-50`) sem env flag. Analista curioso pode entrar e criar lote em prd; UI marca "esboço read-only" mas dados persistem. Sem flag = sem canary | ❌ | `src/frontend/app/page.tsx:35-50`, sem `NEXT_PUBLIC_SISPAG_ENABLED` em `frontend/lib/sispag.ts` |
| **Logical Grouping** | Manteve — SISPAG entra no MESMO processo Node (Render web service); nenhum job cron novo | ⚠️ (herdado) | `src/backend/index.ts:98` |
| **Physical Grouping** | N/A (herdado) — 1 instância Render | N/A | `render.yaml:8-9` |
| **Package Dependencies** | Sem nova dep runtime (grep em `package.json` BE — mesmas 15 deps de v0.11.0). ✅ | ✅ | `src/backend/package.json` (não modificado) |
| **Surge Protection** | Novo router herda `globalLimiter` (100/min) via `index.ts:32`, adequado p/ leitura (`GET /painel` faz fan-out `Promise.all` para todas as filiais — cada request = N chamadas Conexos). ⚠️ POST/DELETE mutantes (5 rotas) também no `globalLimiter` — quando Fatia 3 (escrita ERP) chegar, revisar para `heavyRouteLimiter` | ⚠️ | `src/backend/index.ts:32,98`, `src/backend/routes/sispag.ts:100-201` |
| **Idempotent deploys** | ✅ `MigrationRunner` skip via `schema_migrations`; `0023` `IF NOT EXISTS`. `SispagPainelService` é 100% leitura — pode ser chamado N vezes | ✅ | `runMigrations.ts:36,44`, `0023_lote_pagamento.sql:10,28,48,51` |
| **Drift detection** | Herdado — `render.yaml` declarativo | ✅ (herdado) | `render.yaml` |
| **Reproducible builds** | Herdado — lockfile ✅, Node não pinado ❌ (F-3 da run anterior). Feature adiciona `LotePagamentoService.test.ts` que roda em `node 24` no CI mas o cron `ingest-permutas.yml` (que hoje não toca SISPAG mas amanhã pode) continua em `node 22` | ⚠️ (herdado) | `ci.yml:20,40`, `ingest-permutas.yml:41` |
| **Per-tenant blast-radius limit** | N/A — single-tenant. Detalhe: lote persiste **sem coluna de tenant** (`lote_pagamento` não tem `client_name`/`tenant_id`) — quando virar SaaSo, requer migration adicional (FK/RLS por tenant). Registrar como forward-warning | N/A hoje | `0023_lote_pagamento.sql:10-26` (sem coluna de tenant) |
| **Deployment observability** | `/health` inalterado; `SispagPainelService` loga `BUSINESS_INFO` "SISPAG painel (read-only) montado" com contadores (bom p/ auditar smoke pós-deploy via log) mas ainda **sem** `/ready` | ⚠️ (herdado) | `SispagPainelService.ts:61-70`, `src/backend/index.ts:66` |

## 4. Findings (achados)

### F-deployability-1: Bump de versão ainda não aplicado — `package.json` FE+BE em `0.11.0` sem CHANGELOG para SISPAG

- **Severidade**: P2 (bloqueante para o merge — gate #10 do AutoLoopRunner; não bloqueia produção porque o PR ainda não foi mergeado)
- **Tactic violada**: Script Deployment Commands (bump lockstep FE+BE)
- **Localização**: `src/backend/package.json:3`, `src/frontend/package.json:3`, `CHANGELOG.md` (sem entrada `v0.12.0`)
- **Evidência (objetiva)**:
  ```
  $ grep -n '"version"' src/backend/package.json src/frontend/package.json
  src/backend/package.json:3:    "version": "0.11.0",
  src/frontend/package.json:3:  "version": "0.11.0",

  $ head -30 CHANGELOG.md  # última entrada = v0.11.0 (2026-06-29)
  # Columbia Financeiro — Changelog
  ## v0.11.0 (2026-06-29) — Sessão Conexos compartilhada …
  ```
  Feature adiciona `feat` (novo router `/sispag`, tabelas `lote_pagamento*`, página FE) → bump minor obrigatório (0.11.0 → **0.12.0**), lockstep FE==BE.
- **Impacto técnico**: se o merge sair sem bump, o job `Tag Release` (`ci.yml:64`) lê `frontend/package.json` e não cria tag nova ("Tag v0.11.0 already exists — nothing to release"), silenciosamente. `/health.version` do container em prd continua reportando `0.11.0` mesmo servindo código de v0.12.0 — auditoria de deploy quebrada.
- **Impacto de negócio**: rastreabilidade de release perdida — quem consultar `/health` para saber "que versão está no ar quando o bug apareceu" recebe a versão errada. CHANGELOG sem entrada = onboarding de novo dev/analista lê a lista de features errada.
- **Métrica de baseline**: 2/2 `package.json` desatualizados; 0 entradas CHANGELOG para SISPAG; `git log --oneline main..HEAD` sem commit `chore(release)`.

### F-deployability-2: 3 scripts de "probe" ad-hoc commitados serão transpilados para `dist/` em cada deploy (564 LOC dead)

- **Severidade**: P3
- **Tactic violada**: Package Dependencies / Reproducible builds (dead code hygiene)
- **Localização**: `src/backend/jobs/probe-sispag.ts` (286 LOC), `src/backend/jobs/probe-sispag-2.ts` (231 LOC), `src/backend/jobs/probe-sispag-painel.ts` (47 LOC)
- **Evidência (objetiva)**:
  ```
  $ wc -l src/backend/jobs/probe-*.ts
       231 probe-sispag-2.ts
        47 probe-sispag-painel.ts
       286 probe-sispag.ts
       564 total

  $ grep -n "probe-sispag" src/backend/package.json → (nada; 0 refs)
  ```
  `tsc` compila todo `src/backend/**/*.ts` para `dist/`; sem entrada no `.gitignore` e sem `exclude` no `tsconfig.json` para `jobs/probe-*.ts`. Cada deploy Render carrega 564 LOC compiladas que nunca serão chamadas por handler nenhum.
- **Impacto técnico**: (a) inflam `dist/` (nunca chegam ao limite de MB, mas viola higiene); (b) `probe-sispag.ts:24` documenta "SEGURANÇA — INVIOLÁVEL: APENAS leitura, ASSERT_PATH bloqueia verbos mutantes" — código sensível/curado que fica listado no `dist/` acessível a `node dist/jobs/probe-sispag.js` se alguém abrir shell no container Render. Baixo risco, mas superfície desnecessária.
- **Impacto de negócio**: baixo hoje; higiene de release e chance de "provider errado invoca o script errado" na próxima frente (SISPAG Fatia 3) crescem com o backlog de probes.
- **Métrica de baseline**: 3 arquivos, 564 LOC totais, 0 npm scripts que os invocam.

### F-deployability-3: `/sispag` já linkado na home sem feature flag — usuários podem criar lote local em prd embora Fatia 3 (execução) não exista

- **Severidade**: P2
- **Tactic violada**: Service Interaction Control (feature flags / staged rollout)
- **Localização**: `src/frontend/app/page.tsx:35-50`, `src/frontend/app/sispag/page.tsx` (685 LOC), `src/frontend/lib/sispag.ts:158-189` (mutações expostas)
- **Evidência (objetiva)**:
  ```
  src/frontend/app/page.tsx:35-50 → Card SISPAG com <Link href="/sispag"> visível
  src/frontend/app/sispag/page.tsx → 685 LOC (fatia 1+2 completa, montagem+gate)
  src/frontend/lib/sispag.ts:158-189 → criarLote, incluirTitulo, removerItem,
                                       finalizarLote, reabrirLote, cancelarLote
  → sem checagem NEXT_PUBLIC_SISPAG_ENABLED; sem role-gating (RouteGate genérico)
  ```
  Marketing text "esboço read-only — nada é executado" (`page.tsx:41-43`) é discurso, não gate. Analista com role `admin` pode criar lote, finalizar, cancelar. Dados persistem em prd Postgres. Sem Fatia 3, esses lotes ficam órfãos (`FINALIZADO` sem processamento).
- **Impacto técnico**: (a) sem toggle não dá para desmontar `/sispag` sem redeploy; (b) rollback fica caro se um bug aparecer só quando lotes reais são criados — dados ficam em prd; (c) impossível fazer "canary" da Fatia 3 (só um subset dos analistas testando escrita ERP) sem duplicar deploy.
- **Impacto de negócio**: risco baixo hoje (analistas sabem que é esboço), mas quando Fatia 3 chegar (`CONEXOS_WRITE_ENABLED` para escrita real de pagamento SISPAG), a UI já existe sem gate — probabilidade de "analista clicou por engano em finalizar/enviar em prd" cresce sem etapa de flag.
- **Métrica de baseline**: 0 flags no código; 1 rota linkada na home; 5 endpoints mutantes locais.

### F-deployability-4: Migration `0023` sem par `*_down.sql`, mas o risco neste delta é excepcionalmente baixo (aditiva pura, zero FK reverso)

- **Severidade**: P3 (**rebaixado** da severidade P1 do carry-over F-6 da run `2026-06-26-1708`, porque neste caso específico o rollback do código NÃO exige reverter o schema — as tabelas ficam ociosas)
- **Tactic violada**: Rollback (data layer)
- **Localização**: `src/backend/migrations/0023_lote_pagamento.sql`, `src/backend/migrations/` (nenhum `*_down.sql`)
- **Evidência (objetiva)**:
  ```
  $ grep -n "DROP\|ALTER" src/backend/migrations/0023_lote_pagamento.sql
  → (nada — só CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS)

  0023 cria: lote_pagamento (PK id UUID), lote_pagamento_item (FK lote_id → lote_pagamento.id).
  FK reverso para tabelas PRÉ-EXISTENTES: 0.
  → Rollback de código para v0.11.0 deixa as 2 tabelas ociosas, sem consumer.
  → Re-deploy de v0.12.0 depois: MigrationRunner (schema_migrations.name=0023_…) skipa,
    IF NOT EXISTS protege se o schema_migrations foi limpo.
  ```
- **Impacto técnico**: nenhum concreto para este delta. Fica como forward-warning: a próxima migration SISPAG que tocar `lote_pagamento*` (Fatia 3: adicionar colunas de execução ERP) precisa seguir política expand-then-contract — porque aí sim, um rename/drop poderá inviabilizar rollback.
- **Impacto de negócio**: hoje zero. Documentar a política nos próximos ADRs SISPAG evita incidente futuro.
- **Métrica de baseline**: 0 tabelas pré-existentes tocadas; 0 FK reverso; 100% aditiva.

### F-deployability-5: Sem endpoint administrativo para purge de lote local — rollback de "estado ruim" exige DBA no Supabase

- **Severidade**: P3
- **Tactic violada**: Rollback (data layer) / Script Deployment Commands
- **Localização**: `src/backend/routes/sispag.ts` (só POST `/cancelar`), `src/backend/domain/service/sispag/LotePagamentoService.ts:216-221` (cancelar = mudança de status, não DELETE)
- **Evidência (objetiva)**:
  ```
  routes/sispag.ts → nenhum DELETE /sispag/lotes/:id
  LotePagamentoService.cancelarLote (L216-221) → transição RASCUNHO|FINALIZADO → CANCELADO
                                                 (persiste no banco, dados não somem)
  ```
  Cenário concreto: bug futuro cria N lotes com credor errado; analista fecha por engano; para "sumir" com eles em prd, precisa `DELETE FROM lote_pagamento WHERE …` direto no Supabase.
- **Impacto técnico**: procedimento operacional dependente de DBA / acesso Supabase (que hoje é do time todo, mas segue sem trilha de auditoria); em contraste, Permutas oferece `excluirBordero`/`excluirBaixa` na UI (`BorderoGestaoService.ts:83-184`) para rollback 1-clique. Fatia 2 SISPAG não replica esse padrão.
- **Impacto de negócio**: baixo hoje (I1: nenhum efeito colateral em ERP). Cresce quando Fatia 3 introduzir side-effects reais.
- **Métrica de baseline**: 0 endpoints DELETE em `routes/sispag.ts`; 1 endpoint `cancelar` (soft-delete via status); 4 endpoints DELETE-equivalent em Permutas (`BorderoGestaoService`).

### F-deployability-6: Carry-overs da run `2026-06-26-1708` que continuam válidos para este delta (nenhum agravado, nenhum resolvido)

- **Severidade**: variada — ver run anterior; **nenhum novo P0/P1** introduzido por este delta
- **Tactic violada**: múltiplas
- **Localização**: `render.yaml`, `.github/workflows/ci.yml`, `scripts/bump-version.ps1`, `src/backend/index.ts:66`
- **Evidência (objetiva)**: nenhum destes arquivos foi tocado em `feat/sispag-painel-montagem`:
  ```
  $ git status --short | grep -E "render.yaml|workflows|scripts/|index.ts:.*/health"
  # → só src/backend/index.ts modificado (apenas import + app.use('/sispag', …))
  # → 0 mudanças em render.yaml, .github/workflows/, scripts/
  ```
  Findings carry-over da run `2026-06-26-1708` que a Fatia 1+2 **não muda**:
  - **F-deployability-1 (P2)** rollback.yml ausente
  - **F-deployability-2 (P1)** smoke test pós-deploy ausente — agora com superfície maior (`/sispag/painel`, `/sispag/lotes/:id`)
  - **F-deployability-3 (P1)** Node não pinado
  - **F-deployability-4 (P1)** `bump-version.ps1` PowerShell-only — **bloqueante para o bump que este PR precisa** (ver F-1 acima)
  - **F-deployability-5 (P1)** staging ausente — este PR foi validado só em dev local
  - **F-deployability-6 (P1)** migrations forward-only — reafirmação: aqui é seguro, mas Fatia 3 precisa expand-then-contract
  - **F-deployability-7 (P2)** FE sem `npm audit`
  - **F-deployability-8 (P2)** `/ready` ausente
- **Impacto técnico**: nenhum novo — mas cada rota nova é uma superfície a mais no smoke test que não existe; cada tabela nova é uma migration a mais no runner sem down.
- **Impacto de negócio**: nenhum agravado por este delta; consolidator deve consumir a lista completa de carry-overs da run `2026-06-26-1708` (não repetimos cards aqui — só os novos).
- **Métrica de baseline**: 8 carry-overs abertos; 0 resolvidos por este delta.

## 5. Cards Kanban

### [deployability-sispag-1] Rodar `bump-version` para 0.12.0 (FE+BE lockstep) e escrever entrada no CHANGELOG antes do merge

- **Problema**
  > Feature `feat/sispag-painel-montagem` adiciona novo router `/sispag`, 2 tabelas via `0023_lote_pagamento.sql` e página FE — é um `feat` semver-minor claro. `src/backend/package.json:3` e `src/frontend/package.json:3` continuam em `0.11.0`; `CHANGELOG.md` sem entrada. Gate #10 do AutoLoopRunner exige bump antes do PR. Sem ele, o job `Tag Release` (`.github/workflows/ci.yml:64`) não cria tag (`Tag v0.11.0 already exists — nothing to release`) e `/health.version` reporta versão errada em prd.
- **Melhoria Proposta**
  > Rodar `scripts/bump-version.ps1 -Execute` (Windows) OU aplicar bump manual em ambos `package.json` (0.11.0 → 0.12.0), commitar `chore(release): v0.12.0` com entrada CHANGELOG descrevendo Escopo II Fatia 1+2 (painel read-only + montagem de lote local + gate de finalização, I1=no-ERP-write, ADR-0015). Cross-linkar `[deployability-4]` da run `2026-06-26-1708` (reescrever bump em Node ESM) — o problema recorrente vem daquele card.
- **Resultado Esperado**
  > Merge do PR cria tag `v0.12.0` automaticamente; `/health.version` em prd reporta `0.12.0`; CHANGELOG registra a Fatia 1+2. Tactic Bass: Script Deployment Commands.
- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P2 (bloqueante para o merge deste PR)
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - `frontend/package.json` version: `0.11.0` → `0.12.0`
  - `backend/package.json` version: `0.11.0` → `0.12.0`
  - Entradas CHANGELOG para SISPAG: 0 → 1
  - Tag `v0.12.0` criada pós-merge: ausente → presente
- **Risco de não fazer**: PR merge silencioso sem tag, sem CHANGELOG, `/health` mente sobre a versão; auditoria de incident fica comprometida.
- **Dependências**: nenhuma para o bump manual; card `deployability-4` (run `2026-06-26-1708`) para tornar o processo cross-platform.

### [deployability-sispag-2] Adicionar feature flag `NEXT_PUBLIC_SISPAG_ENABLED` e/ou role check `sispag_early_adopter` para gatear a rota `/sispag`

- **Problema**
  > Home linka `/sispag` publicamente (`app/page.tsx:35-50`); qualquer analista com role `admin` cria/finaliza lote em prd — dados persistem embora Fatia 3 (execução real) não exista. Sem toggle, "canary" para Fatia 3 (subset de analistas testando escrita ERP) exige duplicar deploy.
- **Melhoria Proposta**
  > 1) Adicionar `NEXT_PUBLIC_SISPAG_ENABLED` (default `false` em prd, `true` em dev/staging) e esconder o Card + `/sispag/*` rotas quando `false`. 2) Alternativa complementar: coluna `sispag_early_adopter` em `app_user` + `requireRole('sispag_early_adopter')` no router BE (`routes/sispag.ts`). 3) Documentar no `docs/runbooks/sispag-cutover.md` (a criar, espelhando `fin010-write-cutover.md`). Tactic Bass: Service Interaction Control.
- **Resultado Esperado**
  > Rota `/sispag` só aparece para analistas piloto; rollback de "feature errada em prd" = flip de env no Render dashboard, sem redeploy. Prepara terreno para Fatia 3 canary.
- **Tactic alvo**: Service Interaction Control (feature flag)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) toggle simples; M (2–5d) role-based
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - # env flags gatendo `/sispag`: 0 → 1
  - Rollback de UI-só (esconder feature): impossível hoje → 1 flip no dashboard
- **Risco de não fazer**: quando Fatia 3 entrar (escrita ERP real), "analista clicou por engano em finalizar/enviar em prd" tem probabilidade não-zero — a UI já existe sem gate.
- **Dependências**: nenhuma para o env flag.

### [deployability-sispag-3] Excluir scripts `jobs/probe-sispag*.ts` do compile output (mover para `scripts/probes/` fora do `tsconfig` ou `.gitignore`)

- **Problema**
  > 3 arquivos de "probe" ad-hoc commitados em `src/backend/jobs/` (564 LOC total) sem npm script correspondente. `tsc` os inclui em `dist/` a cada deploy. Além de dead code, `probe-sispag.ts:24` documenta helpers de leitura Conexos que ficam acessíveis via `node dist/jobs/probe-sispag.js` em shell no container.
- **Melhoria Proposta**
  > Escolher UMA: (a) mover para `src/backend/scripts/probes/` fora do `include` do `tsconfig.json` — probes viram scratch pad local; (b) adicionar `exclude` em `tsconfig.json` para `jobs/probe-*.ts`; (c) `.gitignore` `jobs/probe-*.ts` e apagá-los do repo (se foram só investigação). Documentar padrão em `CLAUDE.md` na seção Development Pipeline.
- **Resultado Esperado**
  > `dist/` do backend sem os 564 LOC de probes; hygiene consistente entre features futuras. Tactic Bass: Package Dependencies.
- **Tactic alvo**: Package Dependencies (dead code)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - LOC dead em `dist/backend/jobs/`: 564 → 0
  - Padrão documentado em CLAUDE.md: não → sim
- **Risco de não fazer**: probes acumulam por feature (Fatia 3 SISPAG, Popula GED provavelmente também terão), inflating `dist/` e superfície de arquivos "não devem ser rodados por acaso".
- **Dependências**: nenhuma.

### [deployability-sispag-4] Adicionar endpoint `DELETE /sispag/lotes/:id` (admin) que apaga lote local antes de Fatia 3 chegar

- **Problema**
  > `cancelarLote` (transição de status) preserva o lote em prd — corretamente para auditoria de decisões da analista. Mas não há forma UI de "sumir" com um lote criado por bug (ex.: bug de credor errado no snapshot). Rollback exige DBA no Supabase, sem trilha na aplicação. Permutas resolveu isso com `excluirBordero`/`excluirBaixa` (`BorderoGestaoService.ts:83-184`) — SISPAG não replicou.
- **Melhoria Proposta**
  > Adicionar `DELETE /sispag/lotes/:id` gated por `requireRole('admin')` + validação (`status IN (RASCUNHO, CANCELADO)` — não permite DELETE de `FINALIZADO` para preservar auditoria). Cascata natural (`ON DELETE CASCADE` já existe em `0023_lote_pagamento.sql:30`). Registrar auditoria via `LogService.info` (`BUSINESS_INFO`). Tactic Bass: Rollback (data layer).
- **Resultado Esperado**
  > Rollback de "estado ruim" 1-clique na UI (via botão Excluir no card do lote em RASCUNHO/CANCELADO). Paridade com Permutas.
- **Tactic alvo**: Rollback (data layer)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - # endpoints DELETE em `/sispag`: 0 → 1
  - Tempo para "sumir com lote errado": DBA Supabase (~10 min) → 1 clique UI (~2s)
- **Risco de não fazer**: quando Fatia 3 chegar com efeitos colaterais reais (remessa gerada), a ausência de rollback de estado local vira débito duro; Permutas já demonstra que isso vira P0 pós-fato (ver F-1 da run `2026-06-26-1708`).
- **Dependências**: nenhuma.

### [deployability-sispag-5] Estender smoke test pós-deploy (card `deployability-2` da run `2026-06-26-1708`) para incluir `GET /sispag/painel` além de `/health`

- **Problema**
  > Nova rota `/sispag/painel` faz fan-out para TODAS as filiais no Conexos (`SispagPainelService.montarPainel`, `L37-53`). Falha silenciosa em prd (ex.: Conexos rejeita sessão, filial sem permissão) só é detectada pelo primeiro usuário que abre a página SISPAG — MTTD alto. `Promise.allSettled` no service (`L91`) mascara falhas parciais, então o painel volta 200 mesmo com 0 títulos por bug.
- **Melhoria Proposta**
  > Quando `[deployability-2]` da run `2026-06-26-1708` for implementado (smoke test pós-deploy no `ci.yml`), incluir asserção `GET $RENDER_URL/sispag/painel` retorna 200 (auth via service token / auth-bypass em preview) E `kpis.borderosTotalAmostra >= 0` (número, não `null`). Considerar log de warning se `kpis.borderosTotalAmostra == 0 && titulos.length == 0` — indica "todas as filiais falharam" silenciosamente.
- **Resultado Esperado**
  > MTTD de regressão em `/sispag/painel` cai de "1º usuário reporta" → ≤ 10 min. Tactic Bass: Manage Deployment Pipeline (post-deployment validation).
- **Tactic alvo**: Manage Deployment Pipeline
- **Severidade**: P2 (deriva do P1 `deployability-2` da run anterior — mesmo trabalho, superfície +1)
- **Esforço estimado**: S (≤1d) somado ao card raiz
- **Findings relacionados**: F-deployability-6 (item smoke test)
- **Métricas de sucesso**:
  - # rotas com smoke pós-deploy: 0 → 2 (`/health`, `/sispag/painel`)
  - Sinal para "todas as filiais falharam silenciosamente": ausente → alerta no log
- **Risco de não fazer**: painel SISPAG em prd volta 200 com dados vazios quando Conexos derruba a sessão; analista pensa "não tem título a pagar" quando na verdade tem — decisão de negócio sobre dado errado.
- **Dependências**: [deployability-2] da run `2026-06-26-1708` (card mãe).

## 6. Notas do agente

- Scope `all`. Delta review — não repeti os 8 findings da run `2026-06-26-1708` (agrupados em `F-deployability-6` como carry-over). Consolidator deve **manter aqueles cards vivos**; este arquivo só adiciona 5 novos cards específicos deste PR.
- **Nenhum P0 novo introduzido.** A feature é excepcionalmente deploy-safe por design: migration `IF NOT EXISTS` sem FK reverso, rotas puramente aditivas, zero novas env vars, I1 (no-ERP-write) elimina o principal risco que Permutas Fatia 1 introduziu. Por isso score 7 (vs. platform-wide 6 da run anterior). O gap remanescente concentra em higiene (probes commitados) e prontidão para Fatia 3 (feature flag + delete endpoint).
- **Métricas de runtime** (tempo real do `preDeployCommand` com 0023, latência do primeiro `GET /sispag/painel` em prd) só medíveis após merge. Registrar `[migrate] applied 1 migration(s): 0023_lote_pagamento.sql` do log do Render como baseline.
- **Cross-QA**:
  - **Modifiability** — F-deployability-3 (feature flag) e F-deployability-5 (delete endpoint) refletem falta de padrão consistente entre Permutas e SISPAG; sugerir consolidator elevar isso a debate arquitetural (padrão de "rollback affordances por feature vertical").
  - **Availability** — `Promise.allSettled` em `SispagPainelService.gather` (`L91-104`) é boa tactic de availability mas mascara falhas parciais para observabilidade de deploy; F-5 aqui conversa com availability lá.
  - **Security** — F-deployability-2 (probes commitados) tem componente de security (`probe-sispag.ts` exercita rotas Conexos; ficar em `dist/` prd é superfície desnecessária).
  - **Testability** — `LotePagamentoService.test.ts` (237 LOC) existe, mas Node não pinado (herdado F-3 da run anterior); testes rodam em Node 24, prd Render em Node default.
- Version bump ainda **não aplicado** — este PR **não pode mergear** sem `chore(release): v0.12.0` (gate #10). Sinalizar ao consolidator para incluir no top-of-mind do owner do PR.
