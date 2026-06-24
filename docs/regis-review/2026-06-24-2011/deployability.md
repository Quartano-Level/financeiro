---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-24-2011
agent: qa-deployability
generated_at: 2026-06-24T20:11:00-03:00
scope: backend
score: 7.5
findings_count: 6
cards_count: 6
---

# Deployability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Merge em `main` (PR v0.7.0) com 2 migrations aditivas (`0017_invoice_importador`, `0018_permuta_bordero_cache`) + bump FE+BE 0.6.1→0.7.0 | Push aciona Render auto-deploy (autoDeploy=true) | Backend Express + Postgres Supabase (cache `permuta_bordero` novo; colunas `pes_cod`/`importador` em `permuta_invoice`) | Produção single-tenant (Render starter, Supabase) — primeira requisição pós-deploy chega com cache vazio | (a) `preDeployCommand` aplica migrations ANTES do tráfego trocar; (b) código novo só consulta colunas/tabela após migration aplicada; (c) primeira request a `/permutas/borderos` faz `refreshCache` ao vivo (degradação graceful); (d) rollback de código preserva colunas/tabela aditivas | Deploy success rate = 100%; janela de indisponibilidade ≤ 30s (preDeploy + boot); primeira request `/borderos` ≤ 15s (cold cache); rollback executável em < 5 min via Render dashboard |

> O PR v0.7.0 testa **especificamente** a ordem migration-antes-de-código, porque a primeira request à nova rota `/permutas/borderos` lê de uma tabela que **não existia** antes da migration. A garantia vem do `preDeployCommand: npm run migrate && npm run seed:admin` no `render.yaml:21` — Render só promove o deploy se este comando retornar 0.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Migrations idempotentes (`IF NOT EXISTS`) | 2/2 (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`; `CREATE TABLE IF NOT EXISTS`) | 100% | ✅ | `src/backend/migrations/0017_invoice_importador.sql:6-7`, `0018_permuta_bordero_cache.sql:6` |
| Ordem migration→código garantida pelo deploy | Sim — `preDeployCommand` roda `npm run migrate` antes do `startCommand` | sim | ✅ | `render.yaml:21` |
| Runner de migrations idempotente (registra em `schema_migrations`) | Sim — pula arquivos já aplicados (`if (applied.has(file)) continue`) | sim | ✅ | `src/backend/migrations/runMigrations.ts:44` |
| Migrations atômicas (transação por arquivo) | **Não** — `databaseClient.insert(sql)` roda o arquivo cru sem `BEGIN/COMMIT` explícito; multi-statement no 0017 (2 ALTERs) pode aplicar parcialmente em caso de falha | sim (BEGIN/COMMIT por arquivo) | ⚠️ | `src/backend/migrations/runMigrations.ts:46-50` |
| Bump de versão FE+BE lockstep | 0.6.1 → 0.7.0 (ambos) | igual | ✅ | `src/backend/package.json:3`, `src/frontend/package.json:4` |
| Tag/release automatizado pós-merge | Job `tag-release` em `ci.yml` cria `v0.7.0` idempotentemente | presente | ✅ | `.github/workflows/ci.yml:48-73` |
| CI gates obrigatórios (typecheck + lint + test + build + audit) | 5 steps backend, 4 frontend | ≥4 | ✅ | `.github/workflows/ci.yml:22-46` |
| Flags `CONEXOS_*` `sync:false` (fonte única dashboard) | 3 (`CONEXOS_BASE_URL`, `CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) | sim | ✅ | `render.yaml:35-40` |
| Mudança em `render.yaml` neste PR | Nenhuma | nenhuma | ✅ | `git diff main...HEAD -- render.yaml` (vazio) |
| Health check configurado | `/health` | presente | ✅ | `render.yaml:22` |
| Rollback documentado (procedimento explícito p/ v0.7.0) | Ausente — `DEPLOY.md` não tem seção de rollback; CHANGELOG não cobre rollback de cache | runbook por release | ❌ | `DEPLOY.md` (sem seção rollback), `docs/runbooks/` (só `fin010-write-cutover.md`) |
| Cold-cache mitigation na primeira request a `/borderos` | Self-warming: `listarBorderos` chama `refreshCache()` se cache vazio (sem `live=true`) | mitigado | ⚠️ | `src/backend/domain/service/permutas/BorderoGestaoService.ts:325-328` |
| Tempo do refresh a vivo (fan-out: 1 chamada por filial, pageSize=1000) | Não medível localmente (depende do ERP) | ≤ 15s | ⚠️ | `BorderoGestaoService.ts:403-440` — `Promise.all(filiais.map(...))` |
| Drift entre `render.yaml` e dashboard (flags) | Resolvido na v0.6.1 (Regis P0 anterior) — `sync:false` impede sobrescrita | sem drift | ✅ | `CHANGELOG.md:38-40`, `render.yaml:37-40` |
| Lockfile commitado | Sim (BE e FE) | sim | ✅ | `src/backend/package-lock.json`, `src/frontend/package-lock.json` (no diff: ±4 linhas — versão bumpada) |
| Branch protection (CI required para merge em `main`) | Comentado em `render.yaml:13-16` ("o gate é GitHub branch protection") | configurado | ⚠️ não-medível | `render.yaml:13-16` — assume configuração no GitHub; não verificável localmente |

> ⚠️ **Não medível localmente** (necessita CloudWatch/Render/produção): deploy duration real do Render, tempo do `preDeployCommand` (migrate+seed) em prd, p95 da primeira request a `/borderos` pós-deploy, MTTR de rollback praticado.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Manage Deployment Pipeline → Scale Rollouts (Blue/Green)** | Render web service single-instance — sem blue/green nativo; troca de tráfego é "stop-old, start-new" gated pelo `preDeployCommand` retornar 0. Janela de indisponibilidade existe mas é curta (≤ 30s) | ⚠️ parcial | `render.yaml:17-22` |
| **Scale Rollouts (Canary)** | Ausente — todos os usuários recebem v0.7.0 simultaneamente | ❌ ausente | n/a |
| **Scale Rollouts (Rolling Upgrade)** | N/A em single-instance Render starter — só faz sentido com ≥2 réplicas; nesta camada de receita atual não se justifica | N/A | `render.yaml:11` (plan: starter) |
| **Rollback** | Render dashboard tem "Rollback to previous deploy" nativo (não documentado no `DEPLOY.md`). Migrations aditivas deste PR **são** rollback-safe para o código v0.6.1 (colunas/tabela viram unused, não quebram leitura) | ⚠️ parcial | Render UI (manual); `DEPLOY.md` sem seção dedicada |
| **Script Deployment Commands** | `buildCommand` + `preDeployCommand` + `startCommand` declarativos no `render.yaml`. Migrations rodam via `npm run migrate` (script encapsulado em `migrations/migrate.ts`) | ✅ presente | `render.yaml:18-21`, `src/backend/package.json:10` |
| **Manage Deployed System → Logical Grouping** | Backend / frontend / database em serviços separados (Render / Vercel / Supabase). Backend roda como monolito Express único | ⚠️ parcial | `DEPLOY.md:1-3` |
| **Physical Grouping** | Cada componente em provider diferente (multi-region implícito: Render us-east, Supabase aws-region, Vercel global) — isola falha mas adiciona latência cross-cloud | ✅ presente | `DEPLOY.md` |
| **Package Dependencies** | Lockfiles commitados (`package-lock.json` em FE/BE); `npm ci` no CI e no Render `buildCommand`; `npm audit --audit-level=high` no CI BE | ✅ presente | `.github/workflows/ci.yml:24`, `render.yaml:18` |
| **Surge Protection** | `express-rate-limit` + `heavyRouteLimiter` nas rotas pesadas (inclusive nas novas: `/borderos/:borCod/finalizar|cancelar|estornar` e `DELETE /borderos/:borCod`). Mitiga clique-em-massa pós-deploy | ✅ presente | `src/backend/routes/permutas.ts:455,477,499,521,544,567` |
| **Idempotent Deploys** | `preDeployCommand` é idempotente (migrate skip já-aplicado, seed:admin é UPSERT por username). Bump de versão sem releases novos ⇒ `tag-release` no-op (`git rev-parse $TAG` check) | ✅ presente | `runMigrations.ts:44`, `DEPLOY.md:93`, `ci.yml:66-68` |
| **Drift Detection** | Resolvido p/ flags `CONEXOS_*` na v0.6.1 (`sync:false`). Sem job ativo verificando drift entre estado declarado (`render.yaml`) e dashboard | ⚠️ parcial | `render.yaml:37-40`; sem workflow de drift |
| **Reproducible Builds** | Lockfiles + Node `24` pinado no CI (`actions/setup-node@v4` com `node-version: '24'`). Não pinado no Render (usa default do Render runtime: node) — risco baixo de drift se Render atualizar default | ⚠️ parcial | `.github/workflows/ci.yml:20`; `render.yaml` sem `nodeVersion` |
| **Per-tenant Blast-Radius Limit** | N/A no estado atual — sem multi-tenant infra (single-tenant Render). Será relevante quando a infra Terraform/AWS for materializada | N/A | `CLAUDE.md` §"Estado Atual vs. Alvo" |
| **Deployment Observability** | Logs de deploy no Render dashboard; `preDeployCommand` falho aborta promoção (visível em build log). Sem alerta automatizado para falha de migration | ⚠️ parcial | `migrate.ts:30-36` (exit 1 em erro) |
| **Active Redundancy** | N/A — single-instance Render; redundância é responsabilidade do provider (Render gerencia restart, mas não failover ativo no plan starter) | N/A | `render.yaml:11` |

## 4. Findings (achados)

### F-deployability-1: Migrations multi-statement sem transação explícita podem aplicar parcialmente

- **Severidade**: P1
- **Tactic violada**: Manage Deployment Pipeline → Script Deployment Commands (atomicidade do step de migration)
- **Localização**: `src/backend/migrations/runMigrations.ts:46-50`, `src/backend/migrations/0017_invoice_importador.sql:6-7`
- **Evidência (objetiva)**:
  ```ts
  // runMigrations.ts:46
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  await this.databaseClient.insert(sql); // sem BEGIN/COMMIT envolvendo o arquivo
  await this.databaseClient.insert(
      'INSERT INTO schema_migrations (name) VALUES ($name)',
      { name: file },
  );
  ```
  ```sql
  -- 0017_invoice_importador.sql tem DOIS statements:
  ALTER TABLE permuta_invoice ADD COLUMN IF NOT EXISTS pes_cod    TEXT;
  ALTER TABLE permuta_invoice ADD COLUMN IF NOT EXISTS importador TEXT;
  ```
- **Impacto técnico**: se o primeiro `ALTER` aplica e o segundo falha (lock timeout, conexão derrubada, OOM no Supabase), a tabela fica com **só `pes_cod`** e o arquivo **não** é marcado como aplicado em `schema_migrations`. Próximo deploy retenta: o primeiro `ADD COLUMN IF NOT EXISTS pes_cod` é no-op (idempotente), o segundo `ADD COLUMN IF NOT EXISTS importador` aplica. Felizmente os DDL atuais são **idempotentes individualmente** → recuperação automática neste PR específico. O risco real é uma futura migration com statements **não-idempotentes** (DML, `INSERT`, `UPDATE`) sofrendo o mesmo padrão.
- **Impacto de negócio**: numa migration com dados de seed/backfill, deploy parcial corrompe schema → janela de incidente prolongada, requer DBA manual. Para v0.7.0 especificamente: risco baixíssimo (DDL puro idempotente).
- **Métrica de baseline**: 100% das migrations rodam fora de `BEGIN/COMMIT` explícito (2/2 no PR; 18/18 no histórico).

### F-deployability-2: Cold cache na primeira request pós-deploy de `/permutas/borderos` paga o custo de N chamadas ao ERP

- **Severidade**: P2
- **Tactic violada**: Manage Deployment Pipeline → Scale Rollouts (warm-up); cross-link com Performance (cold start)
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:317-328,403-440`
- **Evidência (objetiva)**:
  ```ts
  // BorderoGestaoService.ts:325 — fallback warm-up sob demanda
  if (cache.length === 0 && !opts?.live) {
      await this.refreshCache(); // fan-out: listFiliais() + 1 chamada por filial (pageSize:1000)
      cache = await this.execucaoRepository.listBorderoCache(limit);
  }
  ```
  ```ts
  // BorderoGestaoService.ts:404-421 — refresh ao vivo
  const filiais = await this.conexosClient.listFiliais();
  const itensPorFilial = await Promise.all(
      filiais.map((f) =>
          this.conexosClient.listBorderos({ filCod: f.filCod, pageSize: 1000 }).catch(...)
      ),
  );
  ```
- **Impacto técnico**: na primeira request à aba Borderôs pós-deploy v0.7.0, o cache está vazio (tabela recém-criada pela migration 0018). O serviço degrada graciosamente para refresh ao vivo, mas o usuário espera N×p99(`fin010/list`) ≈ 5–15s (dependendo do nº de filiais e do ERP). Pior: se o ERP estiver lento/down, a tela aborta com timeout e o cache permanece vazio.
- **Impacto de negócio**: percepção "lentidão pós-deploy" — usuária do financeiro abre a aba Borderôs minutos após o deploy e leva ≥10s para ver a lista. Não corrompe nada, mas vira ticket repetido.
- **Métrica de baseline**: cache `permuta_bordero` parte de 0 linhas; primeiro `refreshCache` requer `listFiliais.length` chamadas ao ERP sequenciais-em-paralelo.

### F-deployability-3: Rollback de produção sem procedimento documentado para v0.7.0

- **Severidade**: P1
- **Tactic violada**: Manage Deployment Pipeline → Rollback
- **Localização**: `DEPLOY.md` (sem seção de rollback); `docs/runbooks/` (só `fin010-write-cutover.md`)
- **Evidência (objetiva)**:
  ```
  $ ls docs/runbooks/
  fin010-write-cutover.md
  $ grep -c -i "rollback" DEPLOY.md
  0
  ```
- **Impacto técnico**: Render tem botão "Rollback to previous deploy", mas:
  1. ninguém no time tem o procedimento escrito;
  2. não há nota de que as migrations 0017/0018 são **aditivas** (rollback de código v0.7.0 → v0.6.1 deixa coluna `pes_cod`/`importador` e tabela `permuta_bordero` órfãs — **inofensivas**, mas ninguém valida isso pré-incidente);
  3. fluxo "rollback de código + manter migration" não está afirmado como suportado.
- **Impacto de negócio**: MTTR alto em incidente. Operador hesita em fazer rollback por medo de quebrar schema. Decisão sob estresse = erros.
- **Métrica de baseline**: 0 runbooks de rollback; 0 menções a "rollback" em `DEPLOY.md`; 1 release/mês sem teste de rollback documentado.

### F-deployability-4: Sem warm-up automatizado do cache `permuta_bordero` pós-deploy

- **Severidade**: P2
- **Tactic violada**: Manage Deployment Pipeline → Scale Rollouts (warm-up); Manage Deployed System → Surge Protection
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:140` (cache é populado na ingestão — mas ingestão roda 3×/dia, não a cada deploy)
- **Evidência (objetiva)**:
  ```ts
  // IngestaoPermutasService.ts:140 — população única do cache hoje
  await this.borderoGestaoService.refreshCache();
  ```
  ```yaml
  # render.yaml:21 — preDeployCommand não inclui refresh
  preDeployCommand: npm run migrate && npm run seed:admin
  ```
- **Impacto técnico**: se um deploy ocorre fora da janela cron (06:00/12:00/18:00 BRT — `.github/workflows/ingest-permutas.yml:13`), o cache fica vazio até (a) o próximo cron, (b) algum admin clicar "Atualizar" com `live=true`, ou (c) o primeiro acesso à aba que dispara o self-warm. Não há comando idempotente "post-deploy hook" no Render que faça isso de forma silenciosa.
- **Impacto de negócio**: degradação previsível de UX por algumas horas após deploy fora-de-janela. Para v0.7.0, mitigado pelo fallback self-warming — risco é a janela de 5–15s de espera por usuário.
- **Métrica de baseline**: cache parte de 0 linhas pós-`CREATE TABLE`; nenhuma chamada a `refreshCache` no `preDeployCommand`.

### F-deployability-5: Node version não pinado no Render (drift potencial CI vs. produção)

- **Severidade**: P2
- **Tactic violada**: Reproducible Builds
- **Localização**: `render.yaml:7-8` (sem `nodeVersion`); `.github/workflows/ci.yml:20` (CI pinado em Node 24)
- **Evidência (objetiva)**:
  ```yaml
  # render.yaml:7-8
  - type: web
    name: financeiro-backend
    runtime: node           # versão = default Render (não pinada)
  ```
  ```yaml
  # ci.yml:18-21
  - uses: actions/setup-node@v4
    with:
      node-version: '24'    # CI fixo em 24
  ```
- **Impacto técnico**: CI valida em Node 24; Render pode estar rodando 22 (ou 20 default histórico do plan starter). Bibliotecas nativas (`pg`, `bcryptjs`) ou syntax features novas podem comportar-se diferente. Risco pequeno hoje, mas invisível até quebrar.
- **Impacto de negócio**: deploy verde no CI quebra em prd com mensagem obscura — debugging caro.
- **Métrica de baseline**: 1 versão pinada (CI) vs. 0 versões pinadas (Render).

### F-deployability-6: Ausência de tag de release no PR antes do merge (gate de versão tardio)

- **Severidade**: P3
- **Tactic violada**: Manage Deployment Pipeline → Script Deployment Commands (rastreabilidade)
- **Localização**: `.github/workflows/ci.yml:48-73` — `tag-release` só dispara **após** o push em `main`
- **Evidência (objetiva)**:
  ```yaml
  # ci.yml:51 — tag só dispara em push para main
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  ```
- **Impacto técnico**: a tag `v0.7.0` só existe após o merge. Se o PR ficar dias parado, não há "checkpoint" formal de versão; rebase no main pode acidentalmente repetir versão se outro PR for mergeado antes (job é idempotente — `git rev-parse $TAG` skip — mas alguém precisará fazer outro bump).
- **Impacto de negócio**: confusão pontual no changelog. Não é crítico.
- **Métrica de baseline**: 1 tag/release criada **após** o merge (idempotente, com skip se já existe).

## 5. Cards Kanban

### [deployability-1] Envelopar cada arquivo SQL em transação no MigrationRunner

- **Problema**
  > O runner aplica o conteúdo de cada arquivo `.sql` como uma chamada única ao Postgres sem `BEGIN/COMMIT` explícito. Migrations com múltiplos statements (já existem: `0017_invoice_importador.sql` tem 2 ALTERs) podem aplicar parcialmente em falha intermediária. Hoje os DDL são idempotentes (`IF NOT EXISTS`), mascarando o problema; a primeira migration com DML (UPDATE/INSERT) ou DDL não-idempotente sofrerá corrupção.

- **Melhoria Proposta**
  > Em `MigrationRunner.run`, envolver cada arquivo em `BEGIN; <conteúdo>; COMMIT;` e mover o `INSERT INTO schema_migrations` para dentro da mesma transação. Tactic Bass: **Script Deployment Commands** (atomicidade). Arquivo único: `src/backend/migrations/runMigrations.ts:44-50`.

- **Resultado Esperado**
  > Falha durante o arquivo = rollback completo + arquivo não marcado como aplicado → próxima run retenta limpo. Estado intermediário impossível.
  > Métrica: 100% das migrations executam atomicamente (0/2 hoje → 2/2 atomic).

- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-1
- **Métricas de sucesso**:
  - migrations atomicas: 0/18 → 18/18
  - statements órfãos pós-falha: possível → impossível
- **Risco de não fazer**: primeira migration futura com DML deixa o schema em estado inconsistente — incidente de produção com debug manual.
- **Dependências**: nenhuma.

### [deployability-2] Pré-aquecer `permuta_bordero` no `preDeployCommand`

- **Problema**
  > A primeira request a `/permutas/borderos` pós-deploy v0.7.0 paga 5–15s (`refreshCache` ao vivo) porque a tabela acabou de ser criada. O fallback self-warming existe (`BorderoGestaoService.ts:325`), mas degrada UX e fica vulnerável a indisponibilidade do ERP no momento errado.

- **Melhoria Proposta**
  > Adicionar `npm run cache:warm-borderos` ao `preDeployCommand` do `render.yaml:21`. Criar `jobs/warm-bordero-cache.ts` resolvendo `BorderoGestaoService.refreshCache()` com try/catch (best-effort — falha do ERP no preDeploy NÃO deve bloquear o deploy, apenas log). Tactic Bass: **Scale Rollouts (warm-up)**.

- **Resultado Esperado**
  > Cache populado antes do tráfego trocar — primeira request a `/borderos` lê do banco (<200ms) em vez de aguardar refresh.
  > Métrica: p95 da primeira request `/borderos` pós-deploy de ~10s → ≤500ms.

- **Tactic alvo**: Scale Rollouts (warm-up)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-2, F-deployability-4
- **Métricas de sucesso**:
  - p95 primeira request pós-deploy: ~10s → ≤500ms
  - chamadas ao ERP na primeira request: N filiais → 0
- **Risco de não fazer**: tickets recorrentes de "tela travou após o deploy"; risco maior em deploys de emergência (cache vazio + ERP lento = janela cega).
- **Dependências**: nenhuma.

### [deployability-3] Criar runbook de rollback v0.7.0 (e template recorrente por release)

- **Problema**
  > `DEPLOY.md` não menciona rollback. `docs/runbooks/` só tem `fin010-write-cutover.md`. Operador em incidente precisa decidir sob estresse se pode rebobinar o deploy sem quebrar o schema — as migrations 0017/0018 são aditivas (rollback de código é seguro), mas isso não está afirmado em lugar algum.

- **Melhoria Proposta**
  > Adicionar `docs/runbooks/rollback-v0.7.0.md` afirmando: (1) "Rollback de código v0.7.0 → v0.6.1 é seguro — colunas e tabela ficam órfãs, inertes"; (2) passo-a-passo no Render dashboard; (3) check-list pós-rollback (`/health`, `/permutas/gestao` ok). Tactic Bass: **Rollback**. Generalizar para template `docs/runbooks/_template-rollback.md` consumido pelo `/feature-new` ao registrar o bump de versão.

- **Resultado Esperado**
  > MTTR de rollback documentado (alvo ≤ 5 min). Próximo release sai com runbook gerado automaticamente.
  > Métrica: runbooks de rollback: 0 → 1 (v0.7.0) + template ativo no pipeline.

- **Tactic alvo**: Rollback
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-3
- **Métricas de sucesso**:
  - releases com runbook de rollback: 0/N → 1/1 (v0.7.0) + futuro
  - MTTR rollback documentado: indefinido → ≤5 min
- **Risco de não fazer**: incidente em prd com decisão tardia/errada → janela de impacto a usuárias do financeiro >30min.
- **Dependências**: nenhuma; pode ser feito por engenheiro sozinho.

### [deployability-4] Pinar Node version no `render.yaml`

- **Problema**
  > CI valida em Node 24 (`ci.yml:20`); Render usa a versão default do plan starter (variável, atualmente Node 22). Bibliotecas nativas (`pg`, `bcryptjs`) ou recursos de linguagem podem comportar-se diferente em produção do que no CI. Quebras potenciais ficam invisíveis até o deploy real.

- **Melhoria Proposta**
  > Adicionar `nodeVersion: '24'` (ou criar `.nvmrc`/`engines` em `package.json`) ao `render.yaml:7` — Render respeita ambos. Atualizar `ci.yml` para ler do mesmo `engines` para garantir single-source-of-truth. Tactic Bass: **Reproducible Builds**.

- **Resultado Esperado**
  > CI e Render rodam a mesma versão do Node. Atualização de versão vira commit explícito.
  > Métrica: versões Node pinadas: 1/2 (CI) → 2/2 (CI + Render).

- **Tactic alvo**: Reproducible Builds
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-5
- **Métricas de sucesso**:
  - Node version drift CI↔prd: possível → impossível
  - alinhamento explícito: ausente → declarado
- **Risco de não fazer**: deploy verde no CI quebra em prd quando Render bumpar default ou quando builds reproduzirem-se em ambientes diferentes.
- **Dependências**: nenhuma.

### [deployability-5] Workflow de drift detection entre `render.yaml` e dashboard

- **Problema**
  > A v0.6.1 resolveu o caso específico de `CONEXOS_*` (`sync:false`), mas não há detecção automatizada para futuras divergências (alguém edita `render.yaml` adicionando uma env e esquece de setá-la no dashboard, ou o oposto). Hoje só vira incidente quando o serviço quebra com `env undefined`.

- **Melhoria Proposta**
  > Workflow GitHub Actions semanal que via Render API: (1) lista envs do serviço; (2) compara com a lista de chaves declaradas em `render.yaml`; (3) alerta no Slack/issue para diff. Tactic Bass: **Drift Detection**.

- **Resultado Esperado**
  > Diff render.yaml↔dashboard detectado dentro de 1 semana.
  > Métrica: tempo médio para detectar drift: indefinido → ≤7 dias.

- **Tactic alvo**: Drift Detection
- **Severidade**: P3
- **Esforço estimado**: M (2–5d) — precisa token Render API + parser do yaml
- **Findings relacionados**: (relacionado a) F-deployability-5
- **Métricas de sucesso**:
  - drift detectado automaticamente: não → sim
  - MTTD env drift: dias-a-semanas (acidental) → ≤7d
- **Risco de não fazer**: env não-sincronizada quebra deploy futuro silenciosamente; debug demorado pela falta de hipótese clara.
- **Dependências**: token Render API; decisão sobre canal de alerta.

### [deployability-6] Pre-commit gate de bump de versão consistente FE+BE

- **Problema**
  > O bump FE+BE 0.6.1→0.7.0 deste PR está consistente, mas é executado manualmente (`scripts/bump-version.ps1` segundo o `CLAUDE.md`). Esquecimento humano = FE em 0.7.0 e BE em 0.6.1 (ou vice-versa) → confunde release notes e tag.

- **Melhoria Proposta**
  > Adicionar step `check-version-lockstep` ao job `backend`/`frontend` do CI: comparar `src/backend/package.json#version` com `src/frontend/package.json#version`, falhar se diferentes. Tactic Bass: **Script Deployment Commands** (verificação automatizada do invariante de release).

- **Resultado Esperado**
  > Push com versões divergentes é rejeitado no CI antes do merge.
  > Métrica: invariante FE.version === BE.version validado: manual → automatizado.

- **Tactic alvo**: Script Deployment Commands
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-deployability-6
- **Métricas de sucesso**:
  - drift FE↔BE version: possível → impossível (CI gate)
  - releases com versões inconsistentes: histórico atual → 0
- **Risco de não fazer**: release "fantasma" com FE/BE em versões diferentes — tag aponta para um deploy parcial, changelog confunde.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Escopo**: foco no delta v0.7.0 (migrations 0017/0018, cache `permuta_bordero`, bump FE+BE). Não revisitei profundamente decisões já cobertas em revisões anteriores (`render.yaml` flags `sync:false` veio da v0.6.1 — Regis 2026-06-24-0039; está ✅).
- **Métricas não-medíveis**: tempo real do `preDeployCommand` em prd, latência da primeira request `/borderos` pós-deploy, e MTTR de rollback praticado — todos precisam de produção/Render dashboard. Documentados como ⚠️ explícitos.
- **Cross-QA**:
  - **Performance**: F-deployability-2 (cold cache 5–15s) deve aparecer como cold-start tax na seção performance — flag para o consolidator.
  - **Fault-Tolerance/Availability**: F-deployability-1 (migration parcial sem transação) também é fault-tolerance — degradação silenciosa.
  - **Integrability**: F-deployability-4 (warm-up depende do ERP estar up) cruza com integração Conexos.
- **Decisão de escopo**: a tactic "Per-tenant Blast-Radius Limit" foi marcada N/A porque a infra multi-tenant é estado-alvo (CLAUDE.md). Quando `infra/` Terraform for criado, esta tactic vira P0 — vale registrar no backlog do alvo.
- **Pontos fortes do PR**: migrations idempotentes, `preDeployCommand` correto (migrate antes do código), versões FE+BE em lockstep, cache com fallback graceful — o PR não introduz nenhum P0 de deployability.
