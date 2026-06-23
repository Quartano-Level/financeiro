---
qa: Deployability
qa_slug: deployability
run_id: 2026-06-23-1518
agent: qa-deployability
generated_at: 2026-06-23T18:18:00-03:00
scope: backend
score: 6.5
findings_count: 6
cards_count: 6
---

# Deployability — Regis-Review

> Escopo desta passada: **Fase 3 — write-back `fin010`** (ADR-0013, branch `feat/permutas-reconciliacao`).
> Foco nos deliverables do delta — migration `0015_permuta_alocacao_execucao.sql`, flags
> `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` (`EnvironmentProvider.ts:69-70,96-97`,
> `EnvironmentVars.ts:30-36`), `config.ts` e a estratégia de rollout (default `write=off`,
> `dry-run=on`; homologação-first via `CONEXOS_BASE_URL`). Análise de pipeline geral
> (CI, autoDeploy, runbooks) já está em `2026-06-22-1658/deployability.md`; aqui se reafirma
> apenas o que o delta da Fase 3 **muda ou agrava**.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Operador (Yuri/admin) precisa ativar a **primeira escrita real** no `fin010` em produção após validação em homologação | `git push origin main` com versão que contém Fase 3 + manual flip de `CONEXOS_WRITE_ENABLED=true` e `CONEXOS_DRY_RUN=false` no painel Render | `src/backend` (Express deployado no Render), migration `0015_permuta_alocacao_execucao.sql`, `EnvironmentProvider`, `ReconciliacaoPermutaService`, `ConexosClient` (5 endpoints de escrita), trilha em tabela `permuta_alocacao_execucao` | Produção single-tenant (Columbia), Conexos prod em `columbiatrading.conexos.cloud`, banco Supabase compartilhado com ambiente de homologação lógico | (a) deploy aplica migration idempotente sem perda de tráfego; (b) o sistema sobe **com escrita desligada por padrão** mesmo após o flip; (c) operador valida em `columbiatrading-hml.conexos.cloud` primeiro (mesmas credenciais); (d) flip pode ser revertido em < 1 min sem redeploy; (e) se a baixa falhar, `permuta_alocacao_execucao` mantém o write-ahead em `reconciling`/`error` permitindo retry idempotente pelo mesmo `idempotency_key` | Lead time de ativação do write-back (commit→primeira baixa real validada) ≤ 1 dia útil; tempo de "freio" (`write=true` → `write=false`) ≤ 60s; 0 baixas duplicadas no `fin010`; 0% migrations adicionadas sem `down` script (regressão da política da Fase 3 em diante) |

> **O que mudou desde 2026-06-22-1658:** o sistema passa da postura "READ-ONLY no Conexos" para
> "ESCRITA-GATED no Conexos". Isso eleva o custo de uma falha de deploy (uma migration suja ou um
> flag mal configurado pode gerar baixa indevida no ERP fiscal), e ao mesmo tempo introduz uma
> **tática nova de deploy** (feature toggle dupla) que precisa ser instrumentada/documentada.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Migrations com script `down` reversível | 0 / 15 (manteve forward-only; `0015` é só `CREATE TABLE IF NOT EXISTS`) | ≥ política documentada para migrations aditivas (DROP TABLE IF EXISTS = down trivial nesse caso) | ❌ | `src/backend/migrations/0015_permuta_alocacao_execucao.sql:11-36`; `runMigrations.ts` sem método `down` |
| Idempotência da migration `0015` | `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` (re-aplicar é no-op); registrada em `schema_migrations` via runner | idempotente | ✅ | `0015_permuta_alocacao_execucao.sql:11,38,40`; `runMigrations.ts:26-50` |
| `permuta_alocacao_execucao` definido com `UNIQUE (idempotency_key)` para idempotência runtime | `UNIQUE (idempotency_key)` + `status IN ('pending','reconciling','settled','error')` | UNIQUE + status finita | ✅ | `0015_permuta_alocacao_execucao.sql:13,35` |
| Feature toggle dupla para a escrita (rollout staged) | `CONEXOS_WRITE_ENABLED` default `false` + `CONEXOS_DRY_RUN` default `true` em **ambos** os modos (local + Lambda) | presente + default seguro | ✅ | `EnvironmentProvider.ts:69-70,96-97`; `EnvironmentVars.ts:30-36` |
| Flags do delta declaradas em `render.yaml` | **0 / 2** — `render.yaml:23-49` lista 12 vars (`environment`, `CONEXOS_BASE_URL`, etc.); **não menciona** `CONEXOS_WRITE_ENABLED` nem `CONEXOS_DRY_RUN` | ambas declaradas (com default explícito ou `sync: false`) | ❌ | `render.yaml:23-49`; `grep` retorna 0 ocorrências |
| Flags do delta documentadas em `DEPLOY.md` / `.env.example` | **0 / 2** — sem menção em `DEPLOY.md:36-50` e `.env.example:1-52` | passos de "ativar a escrita" + "como fazer kill-switch" presentes | ❌ | `DEPLOY.md`; `src/backend/.env.example` |
| Runbook de cutover dry-run → escrita real (homologação-first) | ausente — `ADR-0013` descreve a tática; **não há** `docs/runbooks/permutas-reconciliacao.md` com passo-a-passo (qual URL de hml, como confirmar `bxaCodSeq`, como reverter) | presente | ❌ | `ls docs/runbooks/` → diretório inexistente; ADR-0013 fala de homologação-first sem operacionalizar |
| Separação física hml ↔ prd (mesmo backend, `CONEXOS_BASE_URL`) | mesma instância Render aponta para um único `CONEXOS_BASE_URL` por vez; trocar URL exige redeploy (`render.yaml:31-32` hardcoded em `value:` literal) ou edit manual + restart | dois serviços Render separados OU `CONEXOS_BASE_URL: sync: false` para flip sem deploy | ⚠️ | `render.yaml:31-32` (`value: https://columbiatrading.conexos.cloud/api`, sem `sync: false`) |
| Rollback de 1 comando | ausente — Render Manual Deploy continua sendo o único caminho (sem CLI/runbook documentado); herdado de 2026-06-22-1658 F-deployability-2 | comando único + procedure | ❌ | `DEPLOY.md` (sem seção rollback); `.github/workflows/ci.yml` (sem deploy job) |
| Lead time commit→prd | não medido | ≤ 15 min | ⚠️ | Não medível localmente — depende de Render Deploy Events |

> ⚠️ **Não medível localmente**: lead time, deploy success rate e MTTR. Requer Render Deploy
> Events API (ou scraping do painel). Recomendação: instrumentar como parte do card
> `deployability-runbook-fin010-cutover` (ver seção 5).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Deployment Pipeline — **Scale Rollouts (canary / blue-green / rolling)** | Implementado **logicamente** via feature toggle: `dry-run=true` é o canary do payload (monta+loga sem POST); `writeEnabled=false` é o blue-green do código (deploy do código sem ativar). Hoje **não há** dois serviços Render separados (hml vs prd), então o canary é por flag e por `CONEXOS_BASE_URL` — não por infra. | ⚠️ parcial | `EnvironmentProvider.ts:68-70,95-97`; `ReconciliacaoPermutaService.ts:51-91` (`writeEnabled` E `!dryRun` exigidos); `render.yaml:31-32` (uma única URL hard-coded) |
| Manage Deployment Pipeline — **Rollback** | Sem mudança vs. 2026-06-22-1658 F-deployability-2: rollback do **código** é Render→Manual Deploy (sem runbook); rollback da **escrita** é o flip de flag (instantâneo, sem redeploy — esse SIM é forte). Migration `0015` não tem `down`, mas é aditiva (DROP TABLE IF EXISTS bastaria). | ⚠️ parcial | `0015_permuta_alocacao_execucao.sql` (sem `down`); `DEPLOY.md` (sem seção rollback) |
| Manage Deployment Pipeline — **Script Deployment Commands** | `render.yaml:21` mantém `preDeployCommand: npm run migrate && npm run seed:admin` (fail-fast por design); o delta da Fase 3 **não** adiciona um script de smoke pós-deploy que confirme `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` carregaram com o valor pretendido. | ⚠️ parcial | `render.yaml:21`; sem `/health` exposto-flag ou comando "verify-flags" |
| Manage Deployed System — **Logical Grouping** (feature toggle) | **Tática introduzida pela Fase 3** — par `CONEXOS_WRITE_ENABLED`+`CONEXOS_DRY_RUN` agrupa toda a escrita `fin010` sob duas chaves binárias com defaults seguros. Lidas no boot (`EnvironmentProvider` é `@singleton`, cacheia em `generateEnvironmentVars`). | ✅ presente (**novo, créditar**) | `EnvironmentVars.ts:30-36`; `EnvironmentProvider.ts:69-70,96-97`; `ReconciliacaoPermutaService.ts:89-91` |
| Manage Deployed System — **Physical Grouping** | N/A para o delta — Express monolítico em um único serviço Render; a Fase 3 não cria novo runtime. |  N/A | — |
| Manage Deployed System — **Package Dependencies** | Sem mudança no delta (não acrescentou deps de runtime — só `pg` + `axios` já existentes). | ✅ presente | `src/backend/package-lock.json` |
| Manage Deployed System — **Surge Protection** | `heavyRouteLimiter` aplicado ao novo `POST /permutas/adiantamentos/:docCod/reconciliar` (rate limit por handler); herdado, não introduzido pela Fase 3. | ✅ presente | `src/backend/routes/permutas.ts:357-` (referenciado pelo grep do `CONEXOS_WRITE_ENABLED`) |
| Idempotent deploys | Migration `0015` idempotente (`IF NOT EXISTS`); runner registra em `schema_migrations` (PK por nome); seed admin segue UPSERT. Re-deploy não duplica. | ✅ presente | `0015_permuta_alocacao_execucao.sql:11,38,40`; `runMigrations.ts:42-53` |
| Drift detection | Sem mudança — nenhuma rotina compara `pg_catalog` com migrations aplicadas; herdado de 2026-06-22-1658 F-deployability-6. A Fase 3 **amplia o impacto da drift**: drift em `permuta_alocacao_execucao` quebra o write-ahead e pode liberar baixa duplicada. | ❌ ausente | sem workflow; `0015` idêntico-em-superfície ao restante do dir |
| Reproducible builds | `package-lock.json` versionado, `npm ci` no `buildCommand`; sem mudança no delta. | ✅ presente | `render.yaml:18`; `package-lock.json` |
| Per-tenant blast-radius limit | N/A — single-tenant hoje (Columbia). O delta **piora** o blast radius porque introduz escrita real no ERP fiscal compartilhado. | N/A (mas vide F-deployability-3-fase3) | — |
| Deployment observability | `/health` retorna `version`; **não** expõe `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`. Sem isso o operador não tem como **confirmar pós-deploy** que o flip pegou — depende de ler logs. | ❌ ausente | `src/backend/services` (não há endpoint de "status de flags") |

## 4. Findings (achados)

### F-deployability-fase3-1: Flags `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` ausentes do `render.yaml`, `DEPLOY.md` e `.env.example`

- **Severidade**: **P0**
- **Tactic violada**: Manage Deployment Pipeline — Script Deployment Commands; Manage Deployed System — Logical Grouping (feature toggle)
- **Localização**:
  - `render.yaml:23-49` (lista de envVars sem as duas chaves)
  - `DEPLOY.md:36-50` (tabela de envs sem as duas chaves)
  - `src/backend/.env.example:1-52` (sem as duas chaves)
  - código que **as consome**: `src/backend/domain/libs/environment/EnvironmentProvider.ts:69-70,96-97`
- **Evidência (objetiva)**:
  ```
  $ grep -n "CONEXOS_WRITE_ENABLED\|CONEXOS_DRY_RUN" render.yaml DEPLOY.md src/backend/.env.example
  # 0 hits

  EnvironmentProvider.ts:69-70:
      conexosWriteEnabled: this.readEnv('CONEXOS_WRITE_ENABLED') === 'true',
      conexosDryRun: this.readEnv('CONEXOS_DRY_RUN') !== 'false',
  ```
- **Impacto técnico**: o operador não tem como saber, a partir dos artefatos de deploy, que essas
  chaves existem nem qual valor configurar. Pior: o default de `CONEXOS_DRY_RUN` é `!== 'false'`
  (qualquer valor diferente de `'false'` cai em dry-run), o que protege contra typos para ligar a
  escrita acidentalmente — mas torna **silencioso** o caso em que o operador ACHA que ativou e não
  ativou (ex.: digitou `False` capitalizado). Sem documentação, esse erro só aparece no log do
  serviço, não no painel.
- **Impacto de negócio**: o ativo central da Fase 3 (a tática de feature toggle dupla, que é o que
  permite a entrega da `reconciliarPermuta` sem risco arquitetural #1 explodir) **não é
  operacionalizável** pelo time. O resultado prático: ou o flip nunca é feito (a feature é entregue
  mas nunca usada), ou é feito errado (a escrita "real" continua em dry-run e o operador não
  percebe, ou pior, é ligada sem passar por homologação porque a sequência de passos não está
  escrita).
- **Métrica de baseline**: 0 / 2 flags do delta da Fase 3 declaradas em `render.yaml`; 0 / 2 em
  `DEPLOY.md`; 0 / 2 em `.env.example`. ADR-0013 menciona as flags 6 vezes; nenhum artefato de
  deploy referencia.

### F-deployability-fase3-2: Migration `0015` segue forward-only — política não corrigida apesar do risco subir na Fase 3

- **Severidade**: **P1** (P0 derivado fica em F-deployability-fase3-3)
- **Tactic violada**: Manage Deployment Pipeline — Rollback
- **Localização**: `src/backend/migrations/0015_permuta_alocacao_execucao.sql` (única declaração CREATE; sem `0015_down.sql` nem coluna `reversible` em `schema_migrations`); `src/backend/migrations/runMigrations.ts` (sem método `down`)
- **Evidência (objetiva)**:
  ```
  $ ls src/backend/migrations | grep -c down
  0
  $ grep -n "^CREATE\|^DROP" src/backend/migrations/0015_permuta_alocacao_execucao.sql
  11:CREATE TABLE IF NOT EXISTS permuta_alocacao_execucao (
  38:CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_adto
  40:CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_status
  ```
- **Impacto técnico**: a migration `0015` é **trivialmente reversível** (tabela aditiva, nova,
  sem FK entrando — `DROP TABLE IF EXISTS permuta_alocacao_execucao` resolveria). O problema não
  é técnico — é **político** (project-wide: 0/15 migrations têm down). Consistente com o estado
  pré-existente (já flagueado em `2026-06-22-1658/deployability.md` F-deployability-2 como P1),
  mas a Fase 3 muda o cálculo: agora a tabela é o write-ahead que protege contra baixa duplicada.
  Se for preciso recriá-la (corrupção, schema-divergence), o operador precisa do DDL — que está só
  em `.sql` mas sem procedure documentado.
- **Impacto de negócio**: tempo de recuperação em incidente de schema sobe. Continua sendo P1
  (não P0) porque a tabela em si é **append-only de auditoria** — perdê-la não corrompe valor
  financeiro, só perde rastro. Diferente de uma migration de Permuta core, onde a perda quebraria
  o casamento.
- **Métrica de baseline**: 0 / 15 migrations com `down` script; `0015` mantém o padrão; ADR-0013
  silente sobre rollback de schema.

### F-deployability-fase3-3: Sem runbook de cutover para "ativar a escrita real no `fin010`"

- **Severidade**: **P0**
- **Tactic violada**: Manage Deployment Pipeline — Scale Rollouts (canary); Deployment observability
- **Localização**: `docs/runbooks/` (diretório inexistente); ADR-0013 menciona "homologação-first" mas não operacionaliza; `DEPLOY.md` é silente sobre Fase 3
- **Evidência (objetiva)**:
  ```
  $ ls docs/runbooks/ 2>&1
  ls: cannot access 'docs/runbooks/': No such file or directory

  $ grep -in "homologa\|hml\|cutover\|flip" DEPLOY.md
  # 0 hits
  ```
- **Impacto técnico**: a sequência de 5 passos descrita conceitualmente em ADR-0013 (apontar
  `CONEXOS_BASE_URL` para hml → flipar `CONEXOS_DRY_RUN=false` em hml → validar uma baixa real →
  trocar para prd com `CONEXOS_WRITE_ENABLED=false` → flipar para `true`) **não existe como
  procedure executável**. O operador depende de ler 3 documentos cruzados (ADR-0013,
  `fin010-write-contract.md`, `idempotencia-reconciliacao.md`) e inferir a ordem. Pior: o flip de
  `CONEXOS_BASE_URL` em `render.yaml:31-32` está **hard-coded em `value:` literal** (não
  `sync: false`), então alternar entre hml e prd exige edição de arquivo + push + redeploy — não
  é flip de painel.
- **Impacto de negócio**: a Fase 3 entrega a primeira **escrita** do sistema no Conexos — o risco
  arquitetural #1 (ADR-0002/0003 O3). Sem runbook, a operação que destrava esse risco vira
  conhecimento tácito de uma pessoa. Se essa pessoa for indisponível, o destravamento atrasa; se
  ela errar a ordem (ex.: subir `WRITE_ENABLED=true` antes de validar hml), gera baixa real em
  produção sem ter sido validada. Esse é o **cenário-fim** do risco #1.
- **Métrica de baseline**: 0 runbooks em `docs/runbooks/`; 5 passos de cutover descritos
  conceitualmente em ADR-0013 + nenhum operacionalizado; `CONEXOS_BASE_URL` em `render.yaml`
  hard-coded em `value:` (não `sync: false`), exigindo PR para alternar hml↔prd.

### F-deployability-fase3-4: `CONEXOS_BASE_URL` hard-coded em `render.yaml` impede flip homologação↔produção sem redeploy

- **Severidade**: **P1**
- **Tactic violada**: Manage Deployment Pipeline — Scale Rollouts (blue/green entre hml e prd)
- **Localização**: `render.yaml:31-32`
- **Evidência (objetiva)**:
  ```
  render.yaml:31-32:
        - key: CONEXOS_BASE_URL
          value: https://columbiatrading.conexos.cloud/api
  ```
- **Impacto técnico**: para validar em `columbiatrading-hml.conexos.cloud` o operador precisa:
  (a) editar `render.yaml`, abrir PR, mergar → autoDeploy → testar; (b) editar de volta, novo PR,
  novo autoDeploy. Ciclo de 2 deploys por validação. Alternativa atual: editar manualmente no
  painel Render (override do `render.yaml`), o que **diverge** o estado real do declarado e abre
  drift. ADR-0013 diz explicitamente "`CONEXOS_BASE_URL` aponta o ambiente; o resto do código não
  muda" — mas o `render.yaml` **não permite** apontar o ambiente sem redeploy.
- **Impacto de negócio**: ciclo de validação em hml fica caro (2 deploys + janela). A tática de
  "homologação-first" perde força — se for caro, é tentador pular.
- **Métrica de baseline**: 1 / 12 envVars do `render.yaml` mudaria com `sync: false`
  (`CONEXOS_BASE_URL`); 2 deploys necessários para 1 ciclo de teste em hml.

### F-deployability-fase3-5: `/health` não expõe estado das flags — operador não confirma pós-deploy se o flip pegou

- **Severidade**: **P1**
- **Tactic violada**: Deployment observability
- **Localização**: ausência — `render.yaml:22` configura `healthCheckPath: /health`, mas o
  endpoint não foi estendido para reportar `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "CONEXOS_WRITE_ENABLED\|conexosWriteEnabled" src/backend/routes src/backend/http 2>&1 | grep -v test
  src/backend/routes/permutas.ts:357 — só comentário; não há endpoint expondo estado
  ```
- **Impacto técnico**: depois do flip de flag + restart, o único sinal de que o serviço subiu com
  o valor desejado vive nos logs do startup. Sem um endpoint que devolva
  `{ writeEnabled: true, dryRun: false }`, a confirmação é manual e propensa a erro. Combina mal
  com F-deployability-fase3-1 (defaults silenciosos): se o operador erra a string `'false'`, a
  flag fica em `true` e ele não percebe.
- **Impacto de negócio**: a janela entre "flipei a flag" e "confirmei que ela está ativa" é
  inobservável. Em sistema financeiro com escrita no ERP, isso é débito de governança — o
  auditor não tem como atestar que em determinado timestamp a escrita estava ligada.
- **Métrica de baseline**: 0 endpoints expõem o estado das flags da Fase 3; `/health` devolve só
  `version` (herdado).

### F-deployability-fase3-6: Sem rotina de drift detection sobre `permuta_alocacao_execucao` (eleva o impacto vs. herdado)

- **Severidade**: **P2** (P1 herdado em 2026-06-22-1658 F-deployability-6, mantido aqui como P2 porque o impacto cresce mas a ausência é a mesma)
- **Tactic violada**: Drift detection
- **Localização**: ausência — nenhum workflow compara `pg_catalog` com `migrations/`; `0015_permuta_alocacao_execucao.sql` é a 15ª camada nesse padrão
- **Evidência (objetiva)**:
  ```
  $ ls .github/workflows
  ci.yml  ingest-permutas.yml
  $ grep -rn "pg_catalog\|drift\|schema_migrations" .github/workflows
  # 0 hits
  ```
- **Impacto técnico**: se um DBA dropa/alterar `permuta_alocacao_execucao` no Supabase (ou um
  índice é removido por housekeeping), o write-ahead deixa de proteger e abre janela para baixa
  duplicada (`UNIQUE (idempotency_key)` removido → o serviço grava `reconciling` duas vezes em
  retry e potencialmente POSTa duas vezes).
- **Impacto de negócio**: o invariante de idempotência da Fase 3 vira "verbal" — depende do
  schema estar como declarado, sem rotina para confirmar.
- **Métrica de baseline**: 0 rotinas de drift detection; 1 nova tabela crítica adicionada (`0015`);
  invariante de idempotência depende de 1 constraint `UNIQUE` sem verificação automatizada.

## 5. Cards Kanban

### [deployability-fase3-1] Declarar `CONEXOS_WRITE_ENABLED` e `CONEXOS_DRY_RUN` em `render.yaml`, `DEPLOY.md` e `.env.example`

- **Problema**
  > As duas flags que controlam a ESCRITA real no ERP existem só no código (`EnvironmentProvider.ts:69-70,96-97`). Nem `render.yaml`, nem `DEPLOY.md`, nem `.env.example` mencionam. Operador não tem como configurar o flip sem ler o source.

- **Melhoria Proposta**
  > 1. Em `render.yaml` adicionar `- key: CONEXOS_WRITE_ENABLED` (`value: 'false'` explícito) e `- key: CONEXOS_DRY_RUN` (`value: 'true'` explícito). Defaults vivem no IaC — flip é override no painel.
  > 2. Em `DEPLOY.md` (passo 2, tabela de envs) acrescentar as duas linhas com a semântica
  > (`write=false` E `dry=true` = bloqueio total; `write=true` E `dry=true` = canary/payload-only;
  > `write=true` E `dry=false` = escrita real).
  > 3. Em `.env.example` acrescentar bloco "Fase 3 — write-back fin010" comentado com os defaults
  > seguros. Tactic alvo: **Logical Grouping** (toggle visível) + **Script Deployment Commands**.

- **Resultado Esperado**
  > Operador configura o flip lendo apenas artefatos de deploy. Métrica: 2/2 flags declaradas em
  > cada artefato (atual 0/2 nos três); zero ambiguidade sobre a string aceita (`'true'`/`'false'`
  > explícitos).

- **Tactic alvo**: Manage Deployed System — Logical Grouping (feature toggle visível); Script Deployment Commands
- **Severidade**: P0
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-deployability-fase3-1, F-deployability-fase3-5
- **Métricas de sucesso**:
  - Flags em `render.yaml`: 0/2 → 2/2
  - Flags em `DEPLOY.md`: 0/2 → 2/2
  - Flags em `.env.example`: 0/2 → 2/2
- **Risco de não fazer**: feature da Fase 3 entregue mas inoperável; ou pior, flip feito errado por
  typo silencioso e operador não percebe.
- **Dependências**: nenhuma

### [deployability-fase3-2] Escrever runbook `docs/runbooks/permutas-fin010-cutover.md`

- **Problema**
  > ADR-0013 descreve a estratégia "homologação-first + dry-run-default" mas não há procedure
  > executável. Operador precisa cruzar 3 documentos (ADR-0013, `fin010-write-contract.md`,
  > `idempotencia-reconciliacao.md`) e inferir a ordem dos 5 passos. Sem runbook, a operação que
  > destrava o risco arquitetural #1 é conhecimento tácito.

- **Melhoria Proposta**
  > Criar `docs/runbooks/permutas-fin010-cutover.md` com:
  > 1. **Pré-condição** — versão deployada contém Fase 3; verificar em `/health` (depende do card
  > deployability-fase3-3).
  > 2. **Etapa hml** — apontar `CONEXOS_BASE_URL` para `https://columbiatrading-hml.conexos.cloud/api`;
  > setar `CONEXOS_WRITE_ENABLED=true` + `CONEXOS_DRY_RUN=false`; executar 1 baixa real conhecida;
  > validar `bxaCodSeq` no log + linha em `permuta_alocacao_execucao` com `status=settled`.
  > 3. **Etapa prd canary** — voltar `CONEXOS_BASE_URL` para prd; manter `CONEXOS_WRITE_ENABLED=false`
  > E `CONEXOS_DRY_RUN=true`; executar baixa e confirmar que o payload é logado sem POST.
  > 4. **Etapa prd ativação** — flipar `CONEXOS_WRITE_ENABLED=true`; manter `CONEXOS_DRY_RUN=false`;
  > executar 1 baixa pequena (valor < R$ 1k) supervisionada.
  > 5. **Kill-switch** — flipar `CONEXOS_DRY_RUN=true` no painel Render → o `EnvironmentProvider`
  > **cacheia** (`@singleton`), então **exigir restart** do serviço (Render Manual Deploy → "Clear
  > build cache and deploy"). **Documentar essa pegadinha de cache** — ou criar card pra invalidar.

- **Resultado Esperado**
  > Cutover executável por qualquer operador autorizado em ≤ 30 min sem leitura prévia de ADR.
  > Métrica: 0 runbooks → 1 runbook; tempo de "freio" (`dry=true` aplicado) ≤ 60s alvo (depende
  > de invalidação de cache, ver card deployability-fase3-4).

- **Tactic alvo**: Manage Deployment Pipeline — Scale Rollouts (canary); Deployment observability
- **Severidade**: P0
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-deployability-fase3-3, F-deployability-fase3-4
- **Métricas de sucesso**:
  - Runbooks em `docs/runbooks/`: 0 → ≥ 1
  - Passos de cutover documentados: 0 / 5 (ADR conceitual) → 5 / 5 (procedure)
- **Risco de não fazer**: o destravamento do risco arquitetural #1 vira ato heroico; baixa real
  feita sem hml por pressa = baixa incorreta no ERP fiscal.
- **Dependências**: deployability-fase3-1 (precisa das flags visíveis); deployability-fase3-3
  (precisa do `/health` ampliado para confirmação pós-flip)

### [deployability-fase3-3] Expor estado das flags em `/health` (ou `/health/flags`)

- **Problema**
  > Pós-flip de `CONEXOS_WRITE_ENABLED` o operador só sabe se pegou olhando o log de startup. Sem
  > endpoint que devolva o estado das flags, a confirmação é manual e propensa a erro.

- **Melhoria Proposta**
  > Estender `/health` (ou criar `/health/flags`) para devolver
  > `{ version, conexosWriteEnabled, conexosDryRun, conexosBaseUrl }`. Garantir que esse endpoint
  > **lê** do `EnvironmentProvider` (mesma fonte que o serviço usa) — não de `process.env` direto,
  > para refletir cache. Cobrir com 1 teste que confirma o JSON shape. Tactic alvo: **Deployment
  > observability**.

- **Resultado Esperado**
  > Operador confirma o flip em 1 curl. Auditor consegue carimbar timestamp do estado da flag.
  > Métrica: 0 → 4 chaves de estado no `/health`; latência ≤ 50ms (read de singleton cacheado).

- **Tactic alvo**: Deployment observability
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-deployability-fase3-5, F-deployability-fase3-1
- **Métricas de sucesso**:
  - Chaves de flag expostas em `/health`: 0 → 4
  - Teste de contrato do `/health`: ausente → presente
- **Risco de não fazer**: confirmação do flip permanece em log; auditoria de "quando ligamos a
  escrita" depende de log retention do Render.
- **Dependências**: nenhuma

### [deployability-fase3-4] Permitir flip de `CONEXOS_BASE_URL` sem redeploy (`sync: false` + invalidação de cache do `EnvironmentProvider`)

- **Problema**
  > `render.yaml:31-32` declara `CONEXOS_BASE_URL` com `value:` literal — alternar hml↔prd exige
  > PR + autoDeploy (2 deploys por ciclo de validação). Além disso, `EnvironmentProvider`
  > `@singleton` cacheia a leitura, então mesmo override no painel Render sem restart **não pega**.

- **Melhoria Proposta**
  > 1. Em `render.yaml:31-32` mudar para `sync: false` (vira segredo de painel, com o operador
  > setando o default em prd no primeiro deploy).
  > 2. Garantir que `EnvironmentProvider` lê `CONEXOS_BASE_URL` no boot (já faz) **e** que
  > qualquer mudança exige restart Render → documentar isso no runbook
  > (deployability-fase3-2). Tactic alvo: **Scale Rollouts** (blue/green).

- **Resultado Esperado**
  > Ciclo de validação em hml cai de 2 deploys para 1 restart de painel. Métrica:
  > 2 deploys/ciclo → 1 restart/ciclo.

- **Tactic alvo**: Manage Deployment Pipeline — Scale Rollouts (blue/green entre hml e prd)
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-deployability-fase3-4
- **Métricas de sucesso**:
  - `CONEXOS_BASE_URL` em `render.yaml`: `value: hard-coded` → `sync: false`
  - Ciclo de validação em hml: 2 deploys → 1 restart
- **Risco de não fazer**: validação em hml fica cara → tentação de pular e ligar a escrita em prd
  direto.
- **Dependências**: nenhuma

### [deployability-fase3-5] Política de migration reversível — começar pela `0015` (DROP TABLE IF EXISTS) e estabelecer convenção

- **Problema**
  > 0/15 migrations têm `down` script. A `0015` é **trivialmente reversível** (tabela aditiva nova
  > sem FK entrando — `DROP TABLE IF EXISTS permuta_alocacao_execucao;` resolve). Manter o padrão
  > forward-only nessa migration desperdiça a oportunidade barata de instaurar a política.

- **Melhoria Proposta**
  > 1. Criar `src/backend/migrations/down/0015_permuta_alocacao_execucao_down.sql` com
  > `DROP TABLE IF EXISTS permuta_alocacao_execucao;` (drop dos índices é implícito).
  > 2. Documentar no ADR-0013 (seção Consequências) a política: **migrations aditivas a partir da
  > `0015` ganham contraparte `down` em `migrations/down/`**.
  > 3. Estender `MigrationRunner` com método `down(name)` opcional (sem expor via CLI hoje;
  > stub que lê o `down/` e executa via `databaseClient.insert`).
  > Tactic alvo: **Rollback**.

- **Resultado Esperado**
  > Política instaurada com custo S. Métrica: migrations com `down` 0/15 → 1/15; convenção
  > documentada para que toda migration aditiva nova seja ≥ 1/N.

- **Tactic alvo**: Manage Deployment Pipeline — Rollback
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-deployability-fase3-2
- **Métricas de sucesso**:
  - Migrations com `down`: 0/15 → 1/15
  - Política documentada no ADR-0013: 0 → 1 menção
- **Risco de não fazer**: a regressão da política da Fase 3 em diante; pressão futura para
  reverter `permuta_alocacao_execucao` em incidente exige operador escrever SQL ad-hoc.
- **Dependências**: nenhuma

### [deployability-fase3-6] Adicionar smoke test pós-deploy que valida flags + tabela `permuta_alocacao_execucao`

- **Problema**
  > Nada no pipeline confirma pós-deploy que (a) `permuta_alocacao_execucao` existe com a constraint
  > `UNIQUE (idempotency_key)` (drift detection) e (b) `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`
  > carregaram com os valores esperados. Combina com a ausência de drift detection herdada
  > (F-deployability-6 da run 2026-06-22-1658).

- **Melhoria Proposta**
  > Adicionar step `postDeploy` (ou pós-`preDeploy`) em `render.yaml` (ou script `npm run smoke`)
  > que: (1) consulta `information_schema.table_constraints` p/ confirmar `UNIQUE` em
  > `permuta_alocacao_execucao(idempotency_key)`; (2) chama `/health/flags` (depende do card
  > deployability-fase3-3) e abre alerta se `writeEnabled=true` E `dryRun=false` em ambiente
  > diferente do previsto (canary inválido). Tactic alvo: **Drift detection** + **Deployment
  > observability**.

- **Resultado Esperado**
  > Drift de schema na tabela crítica do write-ahead vira alerta em ≤ 1 deploy. Métrica:
  > 0 verificações automatizadas → 2 (constraint + flags).

- **Tactic alvo**: Drift detection; Deployment observability
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-deployability-fase3-6, F-deployability-fase3-5
- **Métricas de sucesso**:
  - Verificações automatizadas pós-deploy: 0 → 2
  - Tempo até detecção de drift na tabela: indefinido → ≤ 1 deploy
- **Risco de não fazer**: invariante de idempotência da Fase 3 depende de constraint não-verificada
  → janela de baixa duplicada em retry após drift acidental.
- **Dependências**: deployability-fase3-3 (precisa do `/health` ampliado)

## 6. Notas do agente

- Escopo desta run: **delta da Fase 3** (`0015`, flags, `config.ts`, rollout). Achados
  pré-existentes de pipeline geral (CI sem deploy job, lockstep FE/BE, console-driven rollback,
  ausência de runbooks) foram **mantidos** mas não re-listados — referência canônica:
  `docs/regis-review/2026-06-22-1658/deployability.md`.
- A migration `0015` é **idempotente OK** (`IF NOT EXISTS` em CREATE TABLE + dois `CREATE INDEX`) e
  **não tem down** — consistente com as 14 anteriores, portanto **não é um P0 novo** isoladamente,
  fica P1 (card `deployability-fase3-5` aproveita a oportunidade barata para instaurar política).
- A tática nova **feature toggle dupla** (`CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN`) é o ponto
  forte da Fase 3 — defaults seguros, leitura em ambos os modos (`local` e Lambda),
  comportamento dual ("write E !dry" = escrita real) bem implementado e testado
  (`ReconciliacaoPermutaService.test.ts:5,61-62,78-219`). Os P0 desta run são **falhas de
  operacionalização** dessa tática (flags invisíveis em deploy artifacts; sem runbook), não de
  design.
- **Cross-QA**:
  - **Security**: o flag `CONEXOS_WRITE_ENABLED` é o primeiro autorizador binário de escrita
    fiscal — qa-security deve avaliar se ele merece dupla-chave (ex.: dois admins) ou se o atual
    "1 admin no painel Render" é suficiente.
  - **Fault-Tolerance**: o write-ahead (`permuta_alocacao_execucao`) e o `idempotency_key`
    UNIQUE são forte tática de FT — qa-fault-tolerance deve creditar e avaliar o tratamento
    do estado `reconciling` órfão (POST em voo + crash do processo).
  - **Modifiability / ADR-0013**: o cache singleton do `EnvironmentProvider` (`generateEnvironmentVars`
    roda 1x) é um trade-off — favorece performance, mas exige restart para flip pegar.
    qa-modifiability deve avaliar se isso é deliberado ou deve mudar para leitura por-request.
  - **Performance**: irrelevante para o delta (escrita é rota baixa-frequência, gated por
    `heavyRouteLimiter`).
- Métricas de produção (lead time, deploy success, MTTR) não medíveis localmente — herdado da
  run anterior, recomendação igual: instrumentar via Render Deploy Events.
