---
qa: Deployability
qa_slug: deployability
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-deployability
generated_at: 2026-07-18T16:35Z
scope: SISPAG (Frente II) — backend + frontend
score: 6
findings_count: 7
cards_count: 7
---

# Deployability — Regis-Review (SISPAG / Frente II)

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de engenharia (push em `main`) | Deploy de um bump de versão do SISPAG (novo painel/lote/gate) contendo migração destrutiva (`0030_remove_internacional.sql`) e mudança em ambos os planos (Render backend + Vercel frontend) | `render.yaml` (`preDeployCommand=npm run migrate && npm run seed:admin`) + `SISPAG_ENABLED`/`NEXT_PUBLIC_SISPAG_ENABLED` + rota `/sispag/*` (Express) + rota `/sispag` (Next.js) + workflow `ingest-sispag.yml` (GitHub Actions cron 10:00 UTC) | Produção viva: analistas revisando lotes; cron diário de ingestão SISPAG rodando às 07:00 BRT | Deploy verde entra em produção depois do CI (typecheck/lint/test/build/audit) + migrations aplicadas antes do switch de tráfego; se falhar, tráfego não é promovido; se sair verde e quebrar, operador reverte pelo dashboard Render + Vercel; flags fecham a rota se necessário | Lead time commit→prod ≤ 15 min; deploy success rate ≥ 95%; MTTR (rollback do binário) ≤ 5 min; MTTR (rollback de schema `0030`) = **não automatizável** — precisa restore de backup + re-ingestão |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Steps automatizados commit→prod (backend) | 6 (npm ci, npm audit, typecheck, lint, test --coverage, build) + preDeploy (migrate + seed:admin) | ≥ 5 | ✅ | `.github/workflows/ci.yml` linhas 10-28, `render.yaml` linhas 18-21 |
| Migrations SISPAG-específicas | 7 (0023, 0024, 0025, 0026, 0027, 0030, 0031) | — | ✅ presente | `ls src/backend/migrations/00{23..31}*.sql` |
| Migrations SISPAG destrutivas (DROP/DELETE em massa) | 1 (0030 — `DELETE FROM titulo_a_pagar WHERE internacional=TRUE`, `ALTER TABLE ... DROP COLUMN internacional`) | 0 ou compensada por backup automático + runbook | ⚠️ | `src/backend/migrations/0030_remove_internacional.sql:15-35` |
| Colisão em `NNNN_*.sql` (dois 0031) | **Não confirmada** — só um `0031_sispag_modalidade.sql` presente | 0 | ✅ | `ls src/backend/migrations/003*.sql` |
| Feature flags SISPAG | 2 (backend `SISPAG_ENABLED` + frontend `NEXT_PUBLIC_SISPAG_ENABLED`) | ≥ 1 por frente com fail-safe | ✅ | `src/backend/domain/libs/environment/EnvironmentProvider.ts:35-40`, `src/frontend/lib/features.ts:11-16` |
| Comportamento fail-safe do flag SISPAG | Em prod, sem `SISPAG_ENABLED` set → gate 403 (backend) e tela "indisponível" (frontend). Cobertura de teste no `features.test.ts` para 3 cenários | fail-closed em produção | ✅ | `src/backend/domain/libs/environment/EnvironmentProvider.ts:39`, `src/frontend/lib/features.test.ts:20-26` |
| Acoplamento flag frontend build-time vs. runtime | build-time (`NEXT_PUBLIC_*` é inlineado por Next.js) — flip do flag exige rebuild + redeploy Vercel | flip runtime (ideal) | ⚠️ | `src/frontend/lib/features.ts:12` (`process.env.NEXT_PUBLIC_SISPAG_ENABLED`) |
| Transação por arquivo de migração | ❌ ausente — cada `.sql` roda como `insert(sql)` sem BEGIN/COMMIT explícito, depois insere `schema_migrations` | Cada migração dentro de transação (ou marcador atômico) | ❌ | `src/backend/migrations/runMigrations.ts:44-50` |
| Rollback backend (binário) | Manual via Render dashboard ("Rollback to previous deploy"); tempo estimado ~2-5 min | ≤ 5 min, uma ação | ✅ (com ressalva 1-clique manual) | Render dashboard (não medível localmente) |
| Rollback DB (schema) após 0030 | **Impossível sem restore** — DROP COLUMN + DELETE não têm caminho reverso automatizado | Rollback ≤ 30 min ou forward-only + backup ponto-a-ponto | ❌ | `src/backend/migrations/0030_remove_internacional.sql` (script forward-only) |
| Sequenciamento de rollout (dev → stg → prd) | ❌ — deploy é direto em `main` (branch única); não há env intermediário no Render/Vercel | dev → stg → prd | ⚠️ | `render.yaml:11` (`branch: main` único) |
| Health check probe | ✅ `/health` configurado no Render | presente | ✅ | `render.yaml:22` |
| Concurrency lock no cron de ingestão | ✅ `concurrency.group=ingest-sispag; cancel-in-progress=false` | 1 execução por vez | ✅ | `.github/workflows/ingest-sispag.yml:22-24` |
| Timeout do cron | 20 min | ≤ 30 min (evita GHA de graça travar) | ✅ | `.github/workflows/ingest-sispag.yml:29` |
| Coordenação de deploy FE↔BE | ❌ Render (BE) e Vercel (FE) disparam paralelamente no push em `main`. Janela de skew (BE novo × FE velho) fica aberta em cada deploy | Deploy coordenado ou compatibilidade forçada por versionamento de API | ⚠️ | `render.yaml:11-17`, `DEPLOY.md:63-79` (Vercel Git nativa, sem ordem imposta) |
| Runbook específico SISPAG | ❌ ausente (só há `docs/runbooks/fin010-write-cutover.md` p/ Permutas) | Runbook cobrindo: cutover flag, falha ingestão cron, migração 0030 travada, cutover fin015/fin052 (fatia 3 futura) | ❌ | `ls docs/runbooks/` (só 1 arquivo, não-SISPAG) |
| Canary / blue-green | ❌ N/A no Render (starter plan, single service) | canary para features destrutivas | ⚠️ | `render.yaml:9` (`plan: starter`) |
| Tempo de build backend | Não medido localmente (não roda `npm ci && npm run build` cronometrado no gate atual) | ≤ 90s | ⚠️ **Não medível localmente** | requer log de deploy Render |
| Tempo de build frontend Vercel | Não medido | ≤ 90s | ⚠️ **Não medível localmente** | requer log de deploy Vercel |
| Deploy success rate (últimos 30d) | Não medível localmente | ≥ 95% | ⚠️ **Não medível localmente** | Render/Vercel dashboards |
| Lockfiles commitados | ✅ `src/backend/package-lock.json` + `src/frontend/package-lock.json`; `npm ci` no CI e Render | presente | ✅ | `.github/workflows/ci.yml:22-23` e `render.yaml:18` |

> ⚠️ **Não medível localmente**: tempo real de build/deploy no Render, tempo de build Vercel, taxa de sucesso de deploys, tempo médio de rollback. Requerem acesso aos dashboards Render/Vercel + histórico de deploys. Recomendação: instrumentar um dashboard Grafana Cloud (ou planilha operacional simples) com deploy IDs, timestamps e status; ativar "Deploy notifications" para Slack em ambos serviços.

## 3. Tactics — Cobertura no SISPAG

| Tactic (Bass — Manage Deployment Pipeline / Manage Deployed System) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Scale Rollouts (canary) | Nenhum — deploy direto em produção após CI verde | ❌ ausente | `render.yaml:11` branch única `main`, sem etapa canary |
| Scale Rollouts (blue/green) | Render faz *build-then-switch* implícito (traffic só cai no novo container após `preDeployCommand` + healthcheck), mas é atômico all-or-nothing, não gradual | ⚠️ parcial | `render.yaml:21-22` (`preDeployCommand` + `healthCheckPath`) |
| Scale Rollouts (rolling) | N/A no Render starter (1 instância) | N/A | plan starter (`render.yaml:9`) |
| Rollback (binário) | Render dashboard tem botão "Rollback to previous deploy" — manual, 1-clique | ⚠️ parcial (manual, sem automação/gatilho por erro-rate) | Render (não versionado no repo) |
| Rollback (schema) | ❌ ausente para migração 0030 (DROP COLUMN + DELETE — forward-only sem par `down.sql`) | ❌ ausente | `src/backend/migrations/0030_remove_internacional.sql` |
| Script Deployment Commands | `preDeployCommand=npm run migrate && npm run seed:admin` no `render.yaml`; migrate runner idempotente por `schema_migrations`; seed:admin UPSERT | ✅ presente | `render.yaml:21`, `src/backend/migrations/migrate.ts`, `src/backend/migrations/runMigrations.ts` |
| Logical Grouping (agrupar por função) | `/sispag/*` isolado sob o `sispagGate` (`app.use('/sispag', sispagGate, sispagRouter)`); flag SISPAG isolado dos demais serviços; frontend `/sispag` isolado sob `SispagPage` guard | ✅ presente | `src/backend/index.ts:107`, `src/frontend/app/sispag/page.tsx:86-100` |
| Physical Grouping (mesmo processo/host) | Todo SISPAG roda no mesmo processo Express que Permutas; sem separação de deploy — um deploy quebrado derruba os dois | ⚠️ parcial | `src/backend/index.ts` (monolito Express) |
| Package Dependencies (lockfile + versionamento) | `package-lock.json` commitado; `npm ci` no CI e Render; `npm audit --audit-level=high` no CI | ✅ presente | `.github/workflows/ci.yml:22-24`, `src/backend/package-lock.json` |
| Surge Protection | Cron SISPAG tem `concurrency.group=ingest-sispag; cancel-in-progress=false` (impede 2 crons simultâneos); rotas `/sispag/*` não têm rate-limit específico (herdam middleware global se houver) | ⚠️ parcial | `.github/workflows/ingest-sispag.yml:22-24` |
| Idempotent Deploys | Migrations idempotentes por `IF EXISTS/IF NOT EXISTS` + `schema_migrations`; seed:admin UPSERT por username | ✅ presente | `src/backend/migrations/0030_remove_internacional.sql:10-35` (idempotência por `DO $$ IF EXISTS`) |
| Drift Detection (config/schema) | ❌ ausente — nenhum job de drift entre `render.yaml` e o dashboard (comentário do próprio yaml admite conflito passado, e vários envs viraram `sync:false` para não brigar); nenhuma comparação de `schema_migrations` × repo | ❌ ausente | `render.yaml:35-38` (comentário "yaml brigando com dashboard") |
| Reproducible Builds | Lockfiles + Node 24 pinado no CI, Node 22 no cron GHA (**divergência**), Node não pinado no `render.yaml` (usa `runtime: node` sem versão) | ⚠️ parcial | `.github/workflows/ci.yml:20` (24) vs `.github/workflows/ingest-sispag.yml:46` (22) vs `render.yaml:8` (sem pin) |
| Feature Flag (Configuration Management tactic) | 2 flags SISPAG (backend + frontend) com fail-safe defensivo em produção; testes cobrem 3 cenários no frontend | ✅ presente | `EnvironmentProvider.ts:35-40`, `features.ts:11-16`, `features.test.ts` |
| Per-tenant Blast-radius Limit | N/A hoje — nenhum tenant provisionado, cliente único `local` (`render.yaml:27-28`); SISPAG multi-tenant não aplicável | N/A | `render.yaml:27-28`, `CLAUDE.md` §Tenants |
| Deployment Observability | `preDeployCommand` loga migrations aplicadas (`[migrate] applied N migration(s)`); job cron loga `runId`/contagens; sem métrica agregada de deploys | ⚠️ parcial | `src/backend/migrations/migrate.ts:22-25`, `src/backend/jobs/ingest-pagamentos.ts:19-23` |
| Active Redundancy | N/A — Render starter é single-instance; não há hot standby | N/A | plan starter |

## 4. Findings (achados)

### F-deployability-1: Migração 0030 é forward-only destrutiva sem par de rollback nem backup automatizado

- **Severidade**: P1 (alto — degrada MTTR de rollback SISPAG de "5 min" para "restore de backup + re-ingestão", medido em horas)
- **Tactic violada**: Rollback (Manage Deployment Pipeline)
- **Localização**: `src/backend/migrations/0030_remove_internacional.sql:15-35`
- **Evidência (objetiva)**:
  ```
  DELETE FROM lote_pagamento_item WHERE internacional = TRUE;
  DELETE FROM titulo_a_pagar     WHERE internacional = TRUE;
  DELETE FROM lote_pagamento l WHERE NOT EXISTS (SELECT 1 FROM lote_pagamento_item i WHERE i.lote_id = l.id);
  DROP INDEX IF EXISTS idx_titulo_a_pagar_internacional;
  ALTER TABLE titulo_a_pagar        DROP COLUMN IF EXISTS internacional;
  ALTER TABLE lote_pagamento_item   DROP COLUMN IF EXISTS internacional;
  ```
- **Impacto técnico**: se v0.17.4 (que introduz 0030) precisar ser revertida — por bug funcional pós-cutover — o rollback do binário via Render "Rollback" restaura o código pré-0030 (que lê/escreve a coluna `internacional`), **mas o schema já está mutilado**. Todo o SISPAG cai em erro `column "internacional" does not exist` no primeiro request. A trilha de auditoria (linhas com `internacional=TRUE` já deletadas) foi perdida.
- **Impacto de negócio**: incidente de SISPAG após v0.17.4 exige DBA fazendo `pg_restore` do último backup Supabase + re-ingestão + telefonema com a analista para reconstruir manualmente qualquer lote em `RASCUNHO` no momento do restore. MTTR sai de minutos para horas. O ADR-0021 documenta que "internacional saiu do escopo" e a purga é intencional; a decisão de **produto** é aceitável, o gap é a **ausência de checkpoint operacional**.
- **Métrica de baseline**: MTTR rollback SISPAG = **manual restore + reingestão** (não instrumentado). Deploy que introduz 0030 foi v0.17.4 (2026-07-18); janela de risco = enquanto qualquer bug regressivo dessa versão for descoberto.

### F-deployability-2: Runner de migrations não envolve cada arquivo `.sql` em transação

- **Severidade**: P1 (alto — falha parcial numa migração destrutiva deixa DB inconsistente)
- **Tactic violada**: Idempotent Deploys / Script Deployment Commands
- **Localização**: `src/backend/migrations/runMigrations.ts:42-52`
- **Evidência (objetiva)**:
  ```typescript
  for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await this.databaseClient.insert(sql);
      await this.databaseClient.insert(
          'INSERT INTO schema_migrations (name) VALUES ($name)',
          { name: file },
      );
      newlyApplied.push(file);
  }
  ```
- **Impacto técnico**: `insert(sql)` chama `pool.query(sql)` sem BEGIN/COMMIT explícito. Postgres executa multi-statement como *implicit transaction* apenas quando enviados como único simple-query — mas se a conexão do pool for reciclada entre statements internos, ou se a migração 0030 falhar no `DROP COLUMN` **depois** que os `DELETE` já rodaram, o schema fica meio-migrado **sem** entrada em `schema_migrations`. Re-run passa nos `IF EXISTS`, mas as linhas já deletadas não voltam. Sem um `withTransaction` explícito wrappando cada arquivo, não há garantia de atomicidade.
- **Impacto de negócio**: em produção, o `preDeployCommand` para o deploy se `npm run migrate` sair não-zero (bom — fail-fast). Mas na próxima tentativa de deploy o DB já está com dados parcialmente removidos. Recuperar exige a mesma jornada do F-1 (restore).
- **Métrica de baseline**: 0 migrações SISPAG envolvidas em transação explícita (0/7). `PostgreeDatabaseClient` **tem** `withTransaction` (linhas 105-120) — o runner simplesmente não o usa.

### F-deployability-3: Flag `NEXT_PUBLIC_SISPAG_ENABLED` é build-time — desligar SISPAG do frontend exige rebuild Vercel

- **Severidade**: P2 (médio — cutover reativo do frontend é minutos, não segundos)
- **Tactic violada**: Feature Flag (Manage Deployed System / Configuration Management)
- **Localização**: `src/frontend/lib/features.ts:11-16`
- **Evidência (objetiva)**:
  ```typescript
  export const isSispagEnabled = (): boolean => {
    const flag = process.env.NEXT_PUBLIC_SISPAG_ENABLED
    if (flag === 'true') return true
    if (flag === 'false') return false
    return process.env.NEXT_PUBLIC_ENV === 'local'
  }
  ```
- **Impacto técnico**: Next.js inlineia `NEXT_PUBLIC_*` no bundle no momento do `next build`. Trocar o env var na Vercel **não desliga o SISPAG no browser** dos clientes até que uma nova build seja publicada. O backend gate (`sispagGate`, runtime via `EnvironmentProvider`) protege corretamente — a rota `/sispag/*` responde 403 assim que a env for trocada + o serviço reiniciado — mas o front continua exibindo a UI e disparando calls que falham 403 até o próximo deploy Vercel.
- **Impacto de negócio**: se aparecer um bug crítico no painel SISPAG em produção e o operador tentar "desligar o botão", a UX degrada para "erro 403 em toda ação" até o rebuild Vercel completar (típico ~1-3 min + propagação CDN). Backend está seguro; frontend sinaliza mal.
- **Métrica de baseline**: tempo mínimo p/ fechar o front do SISPAG = tempo de build Vercel + propagação (~1-3 min típicos, não medido). Alvo: ≤ 30s runtime flip.

### F-deployability-4: Sem estratégia canary / blue-green — deploy é all-or-nothing em single instance

- **Severidade**: P2 (médio — todo bug pós-deploy afeta 100% dos usuários simultaneamente)
- **Tactic violada**: Scale Rollouts (canary/blue-green)
- **Localização**: `render.yaml:9` (`plan: starter`)
- **Evidência (objetiva)**:
  ```yaml
  plan: starter
  branch: main
  autoDeploy: true
  ```
- **Impacto técnico**: Render plan `starter` roda uma única instância. O `preDeployCommand` + `healthCheckPath` dá **atomic switch** (fail-fast se migrate falhar ou /health não subir), mas não há rollout gradual: se o SISPAG novo tiver bug funcional que passa no /health mas quebra a UX de finalizar lote, toda a base sente ao mesmo tempo.
- **Impacto de negócio**: SISPAG hoje tem 1 analista principal usando ativamente — o impacto é limitado. Fica P2 (não P1) por causa da baixa base. Quando SISPAG for liberado para mais analistas ou entrar em outro cliente, escala para P1.
- **Métrica de baseline**: 100% dos usuários SISPAG expostos simultaneamente em cada deploy; 0 tráfego de canary.

### F-deployability-5: Deploy Render (BE) e Vercel (FE) são paralelos e não coordenados — janela de skew de contrato aberta

- **Severidade**: P2 (médio — bugs de contrato aparecem apenas em janelas de segundos-minutos, mas são reais)
- **Tactic violada**: Logical Grouping / Script Deployment Commands
- **Localização**: `render.yaml:11-17`, `DEPLOY.md:63-79`
- **Evidência (objetiva)**:
  ```
  Render:  push em main → build (npm ci + build) → preDeploy (migrate + seed) → healthcheck → switch
  Vercel:  push em main → build Next.js → deploy
  ```
  Os dois pipelines não se conhecem. Ordem de conclusão depende de qual build termina primeiro.
- **Impacto técnico**: SISPAG hoje tem features acopladas cross-layer (modalidade A2, adotar-lote A3, aba retorno A4 — todas em `v0.17.5` bump lockstep FE+BE). Se Render terminar 30s antes da Vercel (comum quando FE reinstala mais), há uma janela onde o backend serve o novo contrato e o FE ainda pede o antigo — usuários ativos veem erros esporádicos. O CHANGELOG lockstep resolve versionamento, mas não resolve **ordem de deploy**.
- **Impacto de negócio**: para SISPAG, com poucos usuários simultâneos, isso vira 1-2 toasts de erro no dia do deploy — perceptível mas não custoso. Vira P1 quando a base crescer, ou quando entrar uma release SISPAG com breaking change de resposta HTTP.
- **Métrica de baseline**: 0 coordenação forçada entre pipelines; janela de skew empírica não medida.

### F-deployability-6: Falta runbook operacional específico do SISPAG

- **Severidade**: P2 (médio — MTTR alto quando incidente aparece; conhecimento fica só na cabeça)
- **Tactic violada**: Script Deployment Commands (playbook operacional)
- **Localização**: `docs/runbooks/` (só `fin010-write-cutover.md`, específico de Permutas)
- **Evidência (objetiva)**:
  ```
  $ ls docs/runbooks/
  fin010-write-cutover.md
  ```
- **Impacto técnico**: cenários SISPAG sem playbook:
  1. Falha da ingestão cron GH Actions (job zera em erro — quem investiga? Onde é o log? Como re-rodar? Precisa de flag?)
  2. Cutover do flag `SISPAG_ENABLED` em produção (redeploy Render + rebuild Vercel — em que ordem? Qual o efeito no cron que ignora o flag?)
  3. Migração 0030 travada / meia-aplicada (F-1 e F-2 acima — como reagir?)
  4. Cutover futuro `fin015`/`fin052` (fatia 3): não há runbook análogo ao de fin010.
  5. Cron rodou e detectou 0 títulos onde deveria ter N (drift ERP): como diagnosticar?
- **Impacto de negócio**: operação depende do desenvolvedor primário. Bus factor = 1. Onboarding de outro desenvolvedor ou hand-off para squad ops = semanas.
- **Métrica de baseline**: 0 runbooks SISPAG (deveriam existir ao menos 3 — cron, flag, cutover-fatia-3).

### F-deployability-7: Divergência de versão do Node entre CI (24), cron (22) e Render (sem pin)

- **Severidade**: P3 (baixo — reprodutibilidade de build fica em xeque, mas não bloqueia)
- **Tactic violada**: Reproducible Builds
- **Localização**: `.github/workflows/ci.yml:20` (24), `.github/workflows/ingest-sispag.yml:46` (22), `render.yaml:8` (`runtime: node` sem versão)
- **Evidência (objetiva)**:
  ```
  ci.yml            → node-version: '24'
  ingest-sispag.yml → node-version: 22
  render.yaml       → runtime: node   (sem field version)
  ```
- **Impacto técnico**: um teste que passa em Node 24 (CI) pode falhar em Node 22 (cron) ou em qualquer que o Render escolher (default varia). No SISPAG isso é especialmente arriscado no cron — a formação automática de lotes roda num runtime diferente do que passou pelo CI. Sem `engines` no `package.json` (não verificado, mas relevante).
- **Impacto de negócio**: silent bug no cron não capturado no CI = ingestão fantasma / lote formado errado, detectado só quando a analista reclama.
- **Métrica de baseline**: 3 pins de Node divergentes / 0 pin único.

## 5. Cards Kanban

### [deployability-1] Adicionar par down/backup automático à migração destrutiva 0030 e todas as próximas destrutivas

- **Problema**
  > A migração `0030_remove_internacional.sql` faz `DELETE FROM titulo_a_pagar/lote_pagamento_item WHERE internacional=TRUE` + `DROP COLUMN internacional` — forward-only. Se v0.17.4 precisar ser revertida, o `Rollback` do Render restaura o binário mas o schema já perdeu a coluna: SISPAG cai em `column does not exist` no primeiro request e a trilha de auditoria dos títulos internacionais está perdida.
- **Melhoria Proposta**
  > (Bass: Rollback tactic.) Definir política "toda migração destrutiva é acompanhada por (a) um snapshot Supabase automatizado imediatamente antes do deploy [pg_dump ou snapshot manual documentado em runbook] e (b) um script `NNNN_reverse_*.sql` ou instrução PT-BR de como reconstruir, colocada no cabeçalho do arquivo destrutivo". Migrar `runMigrations.ts` para logar `[migrate] DESTRUCTIVE MIGRATION APPLIED: 0030` em nível `warn` quando o arquivo contém `DROP` / `DELETE` sem `WHERE FALSE`. Adicionar checkbox operacional no runbook (Card `deployability-6`) forçando snapshot pré-deploy.
- **Resultado Esperado**
  > MTTR de rollback SISPAG após migração destrutiva cai de "horas (restore + reingestão manual)" para ≤ 30 min (restore de snapshot + re-ingestão automatizada via cron). Migrações destrutivas ficam visíveis no log de deploy.

- **Tactic alvo**: Rollback
- **Severidade**: P1
- **Esforço estimado**: M (2-5d — política + runbook + snapshot cron + adjust `runMigrations.ts`)
- **Findings relacionados**: F-deployability-1, F-deployability-2
- **Métricas de sucesso**:
  - Migrações destrutivas SISPAG com snapshot pré-deploy: 0/1 → 1/1 (100%)
  - MTTR rollback pós-destrutiva: não instrumentado → ≤ 30 min documentado
- **Risco de não fazer**: próximo bug regressivo em v0.17.x força restore manual sem checkpoint conhecido; analista perde lotes em construção.
- **Dependências**: `deployability-6` (runbook)

### [deployability-2] Envolver cada arquivo de migração em transação atômica no runner

- **Problema**
  > `runMigrations.ts` chama `insert(sql)` sem `withTransaction`. Se a migração 0030 falhar entre o `DELETE FROM titulo_a_pagar` e o `DROP COLUMN`, o DB fica meio-migrado sem entrada em `schema_migrations`; próxima re-run passa nos guards `IF EXISTS` mas os dados já deletados não voltam. `PostgreeDatabaseClient` já tem `withTransaction` (linhas 105-120) — o runner só não usa.
- **Melhoria Proposta**
  > (Bass: Idempotent Deploys.) Refatorar `runMigrations.ts:44-50` para envolver cada arquivo em `databaseClient.withTransaction(async (tx) => { await tx.insert(sql); await tx.insert('INSERT INTO schema_migrations ...') })`. Assim `schema_migrations` é gravado no MESMO commit dos DDLs/DMLs — ou tudo ou nada. Adicionar teste que simula um erro DDL no meio de um arquivo e verifica que `schema_migrations` não foi gravado.
- **Resultado Esperado**
  > Falha parcial numa migração destrutiva deixa DB no estado pré-migração + falha do deploy no `preDeployCommand`. Operador pode simplesmente re-deployar (sem restore). Cobertura de teste do runner: 0 → 1 caso de falha atômica.

- **Tactic alvo**: Idempotent Deploys
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2
- **Métricas de sucesso**:
  - Migrações executadas em transação: 0/7 (SISPAG) → 7/7 (100%)
  - Testes do runner cobrindo falha parcial: 0 → 1
- **Risco de não fazer**: se 0030 tivesse falhado no `DROP COLUMN` real (por lock, por exemplo), o operador estaria com dados internacionais deletados sem trilha e sem forma de re-rodar limpo.
- **Dependências**: nenhuma

### [deployability-3] Trocar `NEXT_PUBLIC_SISPAG_ENABLED` por flag runtime lida do backend

- **Problema**
  > `NEXT_PUBLIC_SISPAG_ENABLED` é inlineado no bundle Next.js em `next build`. Trocar a env na Vercel **não desliga** o SISPAG no browser dos usuários até o próximo rebuild. Backend fica seguro (403 imediato após redeploy Render), mas o FE segue exibindo a UI e batendo com 403 até o novo build propagar.
- **Melhoria Proposta**
  > (Bass: Feature Flag / Configuration Management.) Expor um endpoint público `GET /features` no backend (respondendo `{ sispagEnabled: boolean }` a partir do `EnvironmentProvider`). Frontend faz fetch no bootstrap (server component / provider React) e propaga por context. Vercel deixa de precisar de `NEXT_PUBLIC_SISPAG_ENABLED` — flag vira runtime, cutover em segundos após um restart do serviço Render. Manter fallback build-time (default `false`) para o caso do `/features` falhar (fail-safe).
- **Resultado Esperado**
  > Tempo de cutover do front SISPAG: ~1-3 min (rebuild Vercel) → ≤ 30s (restart Render + próximo request do usuário). Uma fonte de verdade única para a flag.

- **Tactic alvo**: Feature Flag
- **Severidade**: P2
- **Esforço estimado**: M (2-5d — endpoint + provider React + fallback SSR)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - Tempo de cutover FE SISPAG: ~1-3 min → ≤ 30s
  - Fontes de verdade da flag SISPAG: 2 (BE runtime + FE build-time) → 1 (BE runtime)
- **Risco de não fazer**: incidente em SISPAG com push do produto para "desligar já" leva minutos onde o front bate 403 em cada ação — UX ruim justo no momento crítico.
- **Dependências**: nenhuma

### [deployability-4] Introduzir preview environment para features SISPAG (canary de fato)

- **Problema**
  > Deploy é atômico em produção — todo bug pós-deploy expõe 100% dos usuários. Hoje a base é 1 analista principal (mitiga), mas cada bump que toca SISPAG (foram 6 releases em 8 dias: v0.16.1 → v0.17.6) vai direto para prod sem testar num ambiente que **ela** possa validar antes.
- **Melhoria Proposta**
  > (Bass: Scale Rollouts / canary.) Ativar preview deploys da Vercel + criar um Render preview service (`plan: starter` também, `autoDeploy: true` em branch `staging`). Convencionar: features SISPAG grandes (nova fatia, migração destrutiva, cutover de escrita) passam por branch `staging` primeiro; PR aponta URL de preview; analista valida; merge em `main` promove. Pequenos fixes seguem direto.
- **Resultado Esperado**
  > Bugs de UX/regressão SISPAG são pegos por 1 par (dev + analista) antes de expor 100% dos usuários. Deploy success rate percebida (sem revert) sobe.

- **Tactic alvo**: Scale Rollouts
- **Severidade**: P2
- **Esforço estimado**: M (2-5d — segundo serviço Render + Supabase branch/database staging + ajuste CI)
- **Findings relacionados**: F-deployability-4
- **Métricas de sucesso**:
  - Deploys SISPAG que passam por staging antes de prod: 0/6 (última semana) → ≥ 4/6 (para changes que tocam schema ou UI)
  - Revertes por bug funcional pós-deploy: (baseline não medido — instrumentar)
- **Risco de não fazer**: com SISPAG entrando em fatia 3 (escrita fin015 + retorno fin052), a próxima release destrutiva vai direto para o analista sem homologação.
- **Dependências**: `deployability-6` (runbook para uso do staging), `deployability-1` (snapshot pré-deploy fica mais fácil se houver um staging para validar a migração antes)

### [deployability-5] Coordenar deploy backend↔frontend (ordem determinística no push em main)

- **Problema**
  > Push em `main` dispara Render (BE) e Vercel (FE) em paralelo. Features SISPAG lockstep (ex.: v0.17.5 A2 modalidade — contrato /sispag muda tanto no BE quanto no FE) ficam num contrato skewed por segundos-minutos até os dois deploys terminarem, gerando toasts esporádicos de erro na janela de skew.
- **Melhoria Proposta**
  > (Bass: Logical Grouping / Script Deployment Commands.) Opção mínima: adicionar ao workflow `ci.yml` um job `deploy-orchestrator` que aguarda o backend Render responder `/health` com a nova build (poll HTTP) e SÓ ENTÃO chama a Vercel deploy hook para o frontend. Alternativa mais barata: documentar convenção "toda mudança de contrato /sispag/* aumenta o número da MINOR — o FE novo tolera resposta velha por 1 minor". Ambas mitigam o skew.
- **Resultado Esperado**
  > Janela de skew reduzida de segundos-minutos para ~0 (opção A) ou eliminada por contrato (opção B). 0 toasts de erro em release lockstep SISPAG.

- **Tactic alvo**: Logical Grouping
- **Severidade**: P2
- **Esforço estimado**: S (opção B: documentação + convenção) até M (opção A: orchestrator)
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - Janela de skew FE↔BE em deploys lockstep: N/A (não medida) → ≤ 30s (opção A) ou tolerância contratual (opção B)
- **Risco de não fazer**: com mais usuários simultâneos ou breaking changes no `/sispag/*` (fatia 3 previsivelmente), os toasts viram incidentes reportados.
- **Dependências**: nenhuma

### [deployability-6] Escrever runbook operacional SISPAG (cron, flag, migração, cutover fatia 3)

- **Problema**
  > `docs/runbooks/` só tem `fin010-write-cutover.md` (Permutas). Não há playbook para incidentes SISPAG: falha do cron `ingest-sispag.yml`, cutover do flag `SISPAG_ENABLED`, migração destrutiva travada, cutover futuro fin015/fin052. Bus factor = 1.
- **Melhoria Proposta**
  > (Bass: Script Deployment Commands.) Criar 4 arquivos em `docs/runbooks/sispag/`: `cron-ingestao-falhou.md` (como consultar log GH Actions, como re-rodar via workflow_dispatch, como verificar advisory lock preso), `flag-sispag-cutover.md` (ordem: Render restart → aguardar → Vercel rebuild → validar 403 + tela bloqueio), `migracao-destrutiva-recuperacao.md` (snapshot Supabase, restore, re-ingestão, referência ao card `deployability-1`), `fatia-3-fin015-cutover.md` (análogo ao de fin010 — WRITE_ENABLED + DRY_RUN em HML antes de prod). Cada runbook: sintomas → diagnóstico → ação → validação.
- **Resultado Esperado**
  > Bus factor sobe para 2+; on-call de outro dev consegue mitigar sem escalation.

- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P2
- **Esforço estimado**: M (2-5d — 4 runbooks)
- **Findings relacionados**: F-deployability-6, F-deployability-1, F-deployability-3
- **Métricas de sucesso**:
  - Runbooks SISPAG: 0 → 4
  - Bus factor operacional SISPAG: 1 → 2+
- **Risco de não fazer**: primeiro incidente SISPAG durante férias do dev primário = trabalho parado da analista até o retorno.
- **Dependências**: nenhuma (embora `deployability-1` e `deployability-3` façam mais sentido depois deste)

### [deployability-7] Uniformizar versão do Node em CI, cron GH Actions e Render

- **Problema**
  > `ci.yml` fixa Node 24, `ingest-sispag.yml` fixa Node 22, `render.yaml` usa `runtime: node` sem `version` (default do provider muda). Cron SISPAG e produção rodam em runtimes diferentes dos que passaram no CI.
- **Melhoria Proposta**
  > (Bass: Reproducible Builds.) Definir versão canônica (Node 22 LTS ou 24 — decisão do time). Setar em: (a) `src/backend/package.json` → campo `engines.node`; (b) `.github/workflows/ci.yml` e `ingest-sispag.yml` → mesma versão; (c) `render.yaml` → `runtime: node` + criar arquivo `.node-version` OU `.nvmrc` na raiz `src/backend/` (Render lê); (d) Vercel Node version via `NODE_VERSION` env or `engines`. Um único ponto de verdade + `preinstall` script checando `process.version`.
- **Resultado Esperado**
  > 1 versão de Node em toda a pipeline. Bugs relacionados a runtime deixam de existir.

- **Tactic alvo**: Reproducible Builds
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-7
- **Métricas de sucesso**:
  - Versões de Node distintas na pipeline: 3 → 1
- **Risco de não fazer**: quando o Render mudar o default, algum comportamento silente da API HTTP/timers/AbortController quebra em produção sem aviso.
- **Dependências**: nenhuma

## 6. Notas do agente

- **Sobre a "colisão em 0031" mencionada no briefing**: verifiquei duas vezes (`ls src/backend/migrations/003*.sql` e `_shared-metrics.md`) — só existe **um** `0031_sispag_modalidade.sql`. Se havia colisão em algum worktree paralelo (`/tmp/sispag-fin015-tools-wt/` ou `/tmp/sispag-read-harden-wt/`), ela não chegou ao `main`. Marcado como ✅ no quadro de métricas.
- **Métricas não coletadas**: tempo real de build/deploy Render/Vercel, taxa de sucesso de deploys, tempo real de rollback. Todas exigem os dashboards Render/Vercel + histórico. Recomendei instrumentação simples (planilha operacional + Slack notif) no card `deployability-6`.
- **Cross-QA links para o consolidator**:
  - `F-deployability-1` (migração destrutiva) toca **Fault-Tolerance** (recovery pós-falha) e **Modifiability** (política de destrutivas).
  - `F-deployability-3` (flag build-time) toca **Modifiability** (fonte única de verdade) e **Security** (superfície de resposta 403).
  - `F-deployability-5` (skew FE↔BE) toca **Integrability** (contratos versionados) e **Availability** (toasts esporádicos = degradação percebida).
  - `F-deployability-6` (falta de runbook) toca **Availability** (MTTR) e **Testability** (o runbook explícita como validar o cutover).
- **Escopo respeitado**: só SISPAG. Ignorei achados de deploy de Permutas exceto quando SISPAG herda o mecanismo (runner de migrations, `render.yaml`, CI gates — compartilhados). O `fin010-write-cutover.md` foi referenciado só como *contraste* (existe para Permutas, não para SISPAG).
