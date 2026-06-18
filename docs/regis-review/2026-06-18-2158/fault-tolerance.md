---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-18-2158
agent: qa-fault-tolerance
generated_at: 2026-06-19T00:00:00Z
scope: backend
score: 6
findings_count: 4
cards_count: 4
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| `IngestaoPermutasService` (run diária) | Candidata N:M (passou 4 gates, `composto-nm` / `multiplas-invoices`) entra em `CASAMENTO_MANUAL` (ADR-0005) | Dois sinks divergentes: `permuta_adiantamento` (relacional, /gestao) e `permuta_candidata_snapshot` (snapshot, /painel) + cabeçalho `permuta_eleicao_run` | Run normal — sem falha de rede/Conexos | Estado real preservado no relacional; mapeamento `casamento-manual→bloqueada` no snapshot é uma DECISÃO de back-compat documentada (ADR-0005 §4); contagens internas do run-header coerentes entre si | (a) Zero divergência audit/realidade ≥ aceitável por ADR; (b) Zero divergência intra-run (run-header vs snapshot rows): **VIOLADA** — F-fault-tolerance-1 |

Cenário secundário (operacional): `npm run migrate` aplica `0005` sobre um banco onde a CHECK inline de `0003` foi renomeada manualmente (ou pré-existia sob outro nome). A migration assume o nome default `permuta_adiantamento_estado_elegibilidade_check`; se não bater, `DROP IF EXISTS` é no-op e `ADD CONSTRAINT` falha com `duplicate object`. Sem rollback automático e sem verificação do nome real.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Estados domínio vs CHECK relacional (`permuta_adiantamento.estado_elegibilidade`) | 4/4 alinhados (`descoberta`, `elegivel`, `bloqueada`, `casamento-manual`) | 4/4 | ✅ | `0005_estado_casamento_manual.sql:24` + `EstadoElegibilidade.ts:8-19` |
| Estados domínio vs CHECK snapshot (`permuta_candidata_snapshot.status`) | 2/4 representáveis (`elegivel`, `bloqueada`) — N:M colapsa em `bloqueada` | 2/4 (by-design ADR-0005 §4) | ⚠️ aceitável c/ ressalva | `0001_permuta_eleicao.sql:32` + `PermutaSnapshotRepository.ts:247-250` |
| Coerência intra-run: `permuta_eleicao_run.total_bloqueadas` vs `COUNT(snapshot WHERE status='bloqueada')` | divergente quando há N:M (`total_bloqueadas` exclui N:M; rows snapshot incluem) | == | ❌ | `EleicaoPermutasService.ts:226-228, 232-236, 274` + `PermutaSnapshotRepository.ts:247-250` |
| Coerência intra-run: `bloqueadas_by_motivo` cobre os motivos presentes nas rows | parcial — N:M (`composto-nm` / `multiplas-invoices`) ausente no JSONB, presente em `motivo_bloqueio` das rows | total | ❌ | `EleicaoPermutasService.ts:226-228, 591-598` |
| Idempotência da migration 0005 sob constraint-name custom | DROP IF EXISTS no-op + ADD falha (`duplicate object`) | re-aplicável sem corrida ao nome real | ⚠️ | `0005_estado_casamento_manual.sql:19-24` (assume `permuta_adiantamento_estado_elegibilidade_check`) |
| Cobertura de teste do mapeamento N:M no snapshot (`PermutaSnapshotRepository.insertCandidataChunk`) | 0 testes | ≥1 (verifica `CASAMENTO_MANUAL → status='bloqueada'`) | ❌ | `grep "CASAMENTO_MANUAL\|casamento-manual" PermutaSnapshotRepository.test.ts` = ∅ |
| Cobertura de teste para totals do run-header com N:M na run (`EleicaoPermutasService`) | 0 testes | ≥1 (run mista elegível + bloqueada + casamento-manual) | ❌ | `grep "casamento-manual\|CASAMENTO_MANUAL" EleicaoPermutasService.test.ts` = ∅ |

> ⚠️ **Não medível localmente** sem rodar contra um banco real: o nome efetivo da CHECK constraint pós-`0003` em ambientes onde a migração foi aplicada por uma versão pré-`0005`. Recomendação: instrumentar o runner para dump de `pg_constraint` por tabela quando aplicar `0005` (log de pre-condition).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A — sem unidades redundantes hot-swap nesta tweak | N/A | — |
| Replacement | N/A | N/A | — |
| Predictive Model | N/A (operacional só, sem ML) | N/A | — |
| Increase Competence Set | Novo estado `CASAMENTO_MANUAL` amplia a faixa de outcomes — N:M deixa de ser "reprovado por mérito" e vira "pronto para escolha humana" | ✅ | `ElegibilidadeService.ts:100-117` + ADR-0005 |
| Sanity Checking | CHECK do Postgres como sanity de estado escrito | ✅ relacional / ⚠️ snapshot (back-compat) | `0005_estado_casamento_manual.sql:23-24`, `0001_permuta_eleicao.sql:32` |
| Comparison | Cabeçalho da run (`permuta_eleicao_run.total_bloqueadas` + `bloqueadas_by_motivo`) deveria comparar 1:1 com `COUNT(snapshot WHERE status='bloqueada')` da mesma run — não compara | ❌ | `EleicaoPermutasService.ts:226-228` vs `PermutaSnapshotRepository.ts:247-250` |
| Timestamp | `started_at` / `finished_at` na run-header; `created_at` / `updated_at` nos fatos relacionais | ✅ | `0001_permuta_eleicao.sql:13-14`, `0003_permuta_relational.sql:47-48` |
| Timeout | Fora de escopo desta tweak (RetryExecutor / fan-out Conexos cobertos em qa-availability) | N/A | — |
| Condition Monitoring | Run-header como "snapshot de saúde" da eleição. Quebrado para N:M (ver Comparison) | ⚠️ | mesmas linhas |
| Self-Test | Ausente — não há um job que, após a run, recompute `COUNT(snapshot WHERE status=X) GROUP BY status` e confronte com o cabeçalho | ❌ | grep `reconcile\|self.?test` em `src/backend/lambda/job/` (alvo) = ∅ |
| Voting | N/A | N/A | — |
| Redundancy | Snapshot é réplica de leitura denormalizada do estado de eleição; back-compat mantém os dois sinks ativos em paralelo (ADR-0005 §4) | ✅ (cópia denormalizada por design) | `0001` + `0003` |
| Recovery (forward) | N:M pendente é resolvido por **escolha do analista** (forward) — não há undo necessário; `casamento-manual` é o estado que sinaliza esse forward path | ✅ | ADR-0005 §3, `Gestao.ts:8-22` |
| Recovery (backward) | A run é idempotente — recomputa do zero a cada execução (P0-7), descartando estado N:M anterior | ✅ | `EleicaoPermutasService.ts:80-93` + `0004` |
| Reintroduction (Shadow / State Resync) | Cada nova run reescreve `permuta_adiantamento` (UPSERT) e re-emite snapshot — equivalente a state resync com o ERP | ✅ | `IngestaoPermutasService.ts:200-232` |
| Rollback | Migration 0005 não tem `down`. Em caso de erro, é necessário um DDL manual reverso | ⚠️ | `0005_estado_casamento_manual.sql` (sem bloco DOWN) |
| Repair State | Idempotência da run "repara" o relacional a cada execução; o snapshot é regenerado | ✅ | `EleicaoPermutasService.ts:252-323` |
| Idempotent Replay | `Idempotency-Key` + `pg_advisory_lock` na eleição (P0-6) cobrem retry duplicado do endpoint — preservado | ✅ | `EleicaoPermutasService.ts:103-163` |
| Compensating Transaction | N/A — `/painel` e `/gestao` são read-only; baixa do N:M é Fatia 2 | N/A | ADR-0005 §3 |
| Reconcile | Ausente — nenhum job confronta o run-header com as snapshot rows da mesma run, nem o relacional com Conexos | ❌ | grep em jobs = ∅ |
| Quarantine | `CASAMENTO_MANUAL` funciona como uma forma de quarentena tipada (N:M sai do balde `bloqueada` e ganha um KPI próprio âmbar) | ✅ | `Gestao.ts:58-60`, `GestaoPermutasService.ts:60-98` |

## 4. Findings (achados)

### F-fault-tolerance-1: Divergência intra-run entre `permuta_eleicao_run.total_bloqueadas` e as rows do snapshot

- **Severidade**: P1 (alto — viola o invariante de auditoria/Comparison da própria run)
- **Tactic violada**: Comparison · Condition Monitoring
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:226-238` e `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:238-274`
- **Evidência (objetiva)**:
  ```ts
  // EleicaoPermutasService.computeCandidatas — totals do run-header
  const bloqueadas = candidatas.filter(
      (c) => c.estadoElegibilidade === ESTADO_ELEGIBILIDADE.BLOQUEADA,
  );
  // ...
  totalBloqueadas: bloqueadas.length,
  bloqueadasByMotivo: this.countByMotivo(bloqueadas),

  // PermutaSnapshotRepository.insertCandidataChunk — rows do snapshot
  const status =
      candidata.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL
          ? 'elegivel'
          : 'bloqueada';                           // N:M cai aqui também
  params[`motivoBloqueio_${i}`] = candidata.motivoBloqueio ?? null;  // 'composto-nm' / 'multiplas-invoices'
  ```
  O cabeçalho exclui N:M; cada row N:M é gravada como `status='bloqueada'` com `motivo_bloqueio='composto-nm'`/`'multiplas-invoices'`. Para uma run com `E` elegíveis, `B` bloqueadas e `N` N:M: `run.total_bloqueadas = B` mas `COUNT(snapshot WHERE run_id=R AND status='bloqueada') = B + N`. `run.bloqueadas_by_motivo` perde inteiramente as chaves `composto-nm` / `multiplas-invoices`.
- **Impacto técnico**: o run-header (linha-resumo de auditoria, lida por dashboards e pelos tests `EleicaoPermutasService.test.ts:122-144,232,540-585`) deixa de bater com a fonte de verdade que ele referencia (`permuta_candidata_snapshot.run_id = run.id`). `PainelService.exporNoPainel` (linha 59) calcula `totalBloqueadas` re-contando o snapshot e ignora `run.total_bloqueadas` — então o `/painel` reporta `B+N`, enquanto a tabela `permuta_eleicao_run` reporta `B`. Mesma run, dois números diferentes para "bloqueadas".
- **Impacto de negócio**: relatórios construídos sobre `permuta_eleicao_run` (audit/KPI) divergem silenciosamente do `/painel` quando há N:M na frota — o N:M sempre vai existir (é a motivação do ADR-0005). Confiança no número de "bloqueadas" cai; análise histórica de elegibilidade fica enviesada porque os motivos N:M somem do JSONB `bloqueadas_by_motivo`.
- **Métrica de baseline**: 0 testes cobrem `total_bloqueadas` numa run mista com N:M (grep `casamento-manual\|CASAMENTO_MANUAL` em `EleicaoPermutasService.test.ts` = ∅). Para uma carteira realista de Columbia (estimativa do ADR: vários N:M por mês), o gap absoluto entre run-header e snapshot tende a `N`/run.

### F-fault-tolerance-2: Migration 0005 fragiliza-se se o nome da CHECK `0003` não bater com o default

- **Severidade**: P2 (médio — mitigado porque o usuário declarou que NÃO vai rodar a 0005 contra DB real agora; alta probabilidade de não ser acionado no curto prazo, mas é uma armadilha latente)
- **Tactic violada**: Sanity Checking · Repair State
- **Localização**: `src/backend/migrations/0005_estado_casamento_manual.sql:19-24`
- **Evidência (objetiva)**:
  ```sql
  ALTER TABLE permuta_adiantamento
      DROP CONSTRAINT IF EXISTS permuta_adiantamento_estado_elegibilidade_check;
  ALTER TABLE permuta_adiantamento
      ADD CONSTRAINT permuta_adiantamento_estado_elegibilidade_check
          CHECK (estado_elegibilidade IN ('descoberta', 'elegivel', 'bloqueada', 'casamento-manual'));
  ```
  A CHECK foi criada inline em `0003_permuta_relational.sql:40-41` — sem `CONSTRAINT <nome>`. O Postgres aceita o default `<table>_<column>_check`, então o caminho **happy path** funciona; mas se algum DBA renomeou manualmente, ou se o ambiente herdou um nome diferente, o `DROP IF EXISTS` vira no-op silencioso e o `ADD` falha com `duplicate constraint definition` (a CHECK antiga ainda recusa `'casamento-manual'`).
- **Impacto técnico**: o `MigrationRunner` (`runMigrations.ts:42-52`) não tem `try/rollback` interno — a falha abortaria a transação implícita do statement e deixaria `schema_migrations` SEM o registro de `0005_estado_casamento_manual.sql`. Retries subsequentes baterão no mesmo `duplicate` indefinidamente.
- **Impacto de negócio**: dor operacional na primeira aplicação em ambientes existentes (deploy manual / Render); zero perda de dados, mas requer intervenção manual para resolver. Para os tenants ainda não provisionados, `0003 + 0005` rodam juntos e o nome bate.
- **Métrica de baseline**: probabilidade não-medível sem inventário de tenants existentes — pelo CLAUDE.md (`Tenants: vazio`), nenhum tenant produtivo está sob a 0003 hoje, o que rebaixa a severidade para P2.

### F-fault-tolerance-3: Ausência de auto-verificação (Self-Test / Reconcile) pós-run

- **Severidade**: P2 (médio — débito defensável; era latente desde a Fatia 1 e foi exposto pela divergência F-1)
- **Tactic violada**: Self-Test · Reconcile
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:252-323` (não há fase pós-`persistRun` que verifique consistência) + ausência de job em `src/backend/lambda/job/` (alvo)
- **Evidência (objetiva)**:
  ```ts
  // Após persistRun, o serviço só emite FLOW_COMPLETE com os totals em memória.
  // Não há nenhuma query do tipo:
  //   SELECT status, COUNT(*) FROM permuta_candidata_snapshot
  //   WHERE run_id = $runId GROUP BY status
  // confrontando com run.total_elegiveis / run.total_bloqueadas.
  ```
- **Impacto técnico**: divergências como a de F-1 passam despercebidas em produção. Bugs futuros que alterem o mapeamento de status no snapshot (ou no run-header) só vão aparecer via reclamação do analista vendo número estranho no `/painel`.
- **Impacto de negócio**: MTTD (tempo para detectar) inconsistência audit/snapshot tende ao infinito sem instrumentação ativa — em domínio financeiro, "o dashboard mente sobre quantos itens estão bloqueados" é um custo de credibilidade alto.
- **Métrica de baseline**: 0 jobs de reconciliação (`grep -rn "reconcile" src/backend` = ∅). MTTD esperado: O(reclamação humana).

### F-fault-tolerance-4: Mapeamento `casamento-manual → bloqueada` no snapshot é correto por design (ADR-0005) mas não tem teste-guard

- **Severidade**: P3 (baixo — comportamento correto, mas regressão é possível e silenciosa)
- **Tactic violada**: Sanity Checking (test-level)
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:238-274` + `PermutaSnapshotRepository.test.ts`
- **Evidência (objetiva)**:
  ```bash
  grep "CASAMENTO_MANUAL\|casamento-manual" PermutaSnapshotRepository.test.ts
  # (no matches)
  ```
  O teste do `IngestaoPermutasService` cobre o lado RELACIONAL do mapeamento (`IngestaoPermutasService.test.ts:217-233`: "persists estado_elegibilidade=casamento-manual for N:M candidatas"), mas NÃO há um teste paralelo provando que esse mesmo N:M cai em `status='bloqueada'` ao ir para o snapshot — exatamente o invariante de back-compat do ADR-0005 §4.
- **Impacto técnico**: alguém remove o ramo `? 'elegivel' : 'bloqueada'` por engano ao introduzir um terceiro estado no snapshot e nada quebra — a CHECK de `0001` impediria escrever `'casamento-manual'`, mas o tipo TS `'elegivel' | 'bloqueada'` em `PermutaCandidataSnapshotRow.status` permite a falha de cobertura.
- **Impacto de negócio**: regressão difícil de pegar em code review; possível 500 na ingestão quando algum dia alguém tentar persistir o N:M cru no snapshot.
- **Métrica de baseline**: cobertura desse mapeamento N:M no `PermutaSnapshotRepository.test.ts` = 0%.

## 5. Cards Kanban

### [fault-tolerance-1] Alinhar `permuta_eleicao_run.total_bloqueadas` + `bloqueadas_by_motivo` com a regra do snapshot (incluir N:M) OU adicionar contagem própria para casamento-manual

- **Problema**
  > Para qualquer run com N:M, `permuta_eleicao_run.total_bloqueadas` (cabeçalho de auditoria) é estritamente menor que `COUNT(permuta_candidata_snapshot.status='bloqueada' WHERE run_id=...)` — mesma run, dois números. `bloqueadas_by_motivo` perde `composto-nm`/`multiplas-invoices`. `/painel` re-conta as rows e ignora o cabeçalho — então a UI mostra `B+N` enquanto o BI lê `B`.

- **Melhoria Proposta**
  > Decisão de design entre duas opções equivalentes — ambas resolvem F-1:
  > **Opção A (recomendada)**: estender `PermutaEleicaoRunInput` com `totalCasamentoManual` + estender `casamento_manual_by_motivo` JSONB (ou unificar `bloqueadas_by_motivo` para cobrir os 5 motivos incluindo N:M); manter `total_bloqueadas` com a regra atual (estado real). Migration `0006` adiciona as colunas. `/painel` continua re-contando; o run-header passa a refletir as 3 baldes (elegível/bloqueada/casamento-manual).
  > **Opção B**: alinhar o `total_bloqueadas` do cabeçalho à regra do snapshot — i.e., contar `bloqueada OR casamento-manual` no `computeCandidatas`. Não exige migration mas perde a granularidade casamento-manual no cabeçalho.
  > Editar `EleicaoPermutasService.ts:223-237, 274, 591-598` e estender `PermutaEleicaoRunInput` / `findRunSummaryById` no `PermutaSnapshotRepository.ts`. Tactic alvo: **Comparison** (run-header reflete fielmente o snapshot ao qual aponta via FK).

- **Resultado Esperado**
  > Para toda run, `run.total_bloqueadas + run.total_casamento_manual = COUNT(snapshot WHERE run_id=R AND status='bloqueada')` (opção A) **ou** `run.total_bloqueadas = COUNT(...)` (opção B). Métrica observável: novo teste em `EleicaoPermutasService.test.ts` com run mista (≥1 N:M) prova a igualdade.

- **Tactic alvo**: Comparison · Condition Monitoring
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - divergência intra-run cabeçalho vs snapshot: `B+N - B = N` → `0`
  - cobertura de motivos N:M em `bloqueadas_by_motivo` (ou `casamento_manual_by_motivo`): `0/2` → `2/2`
- **Risco de não fazer**: relatórios e dashboards baseados em `permuta_eleicao_run` divergem silenciosamente do que o analista vê no `/painel` para sempre — incidente de confiança de KPI quando alguém comparar os dois.
- **Dependências**: ADR-0005 §4 (back-compat) — a opção A respeita o §4; a opção B requer nota no ADR.

### [fault-tolerance-2] Robustecer migration 0005 quanto ao nome real da CHECK constraint

- **Problema**
  > A migration assume que a CHECK de `permuta_adiantamento.estado_elegibilidade` (criada inline em `0003`) tem o nome default `permuta_adiantamento_estado_elegibilidade_check`. Se algum ambiente herdou outro nome, `DROP IF EXISTS` é no-op silencioso e o `ADD` falha com `duplicate constraint`. O `MigrationRunner` não tem retry/repair e a migration fica órfã em `schema_migrations`.

- **Melhoria Proposta**
  > Refatorar `0005_estado_casamento_manual.sql` para descobrir o nome real via `pg_constraint`/`information_schema.check_constraints` e dropar pelo nome encontrado (bloco `DO $$ ... $$` com lookup) **ou** acrescentar uma migration `0003a` que renomeia a CHECK para o nome canônico e só então a `0005` corre limpa. Tactic alvo: **Repair State**.

- **Resultado Esperado**
  > Aplicar `0005` é seguro em qualquer ambiente onde `0003` foi aplicada, independente do nome efetivo da constraint. Métrica observável: teste de migration (quando houver runner de teste integrado) rodando em DB seed onde a CHECK tem nome custom — deve passar.

- **Tactic alvo**: Repair State · Sanity Checking
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - migrations idempotentes sob nome custom: `frágil` → `robusto`
- **Risco de não fazer**: na primeira aplicação a um tenant Columbia existente com schema pré-existente, deploy pode quebrar e exigir intervenção manual de DBA.
- **Dependências**: nenhuma. Tenants atuais = vazio (CLAUDE.md), então cabe fazer agora antes do primeiro provisionamento.

### [fault-tolerance-3] Adicionar self-test pós-run que confronta run-header com snapshot rows

- **Problema**
  > Após `persistRun`, o serviço nunca confere se os totais que ele acabou de gravar no cabeçalho batem com `GROUP BY status` no snapshot da mesma run. Qualquer divergência (presente — F-1 — ou futura por refactor) passa em silêncio até o analista reclamar.

- **Melhoria Proposta**
  > Em `EleicaoPermutasService.runEleicao`, após `persistRun`, rodar:
  > ```sql
  > SELECT status, COUNT(*) FROM permuta_candidata_snapshot
  > WHERE run_id = $runId GROUP BY status
  > ```
  > comparar com os totals em memória e emitir `BUSINESS_WARN` (ou subir para `FLOW_ERROR` se `--strict`) em caso de divergência. Tactic alvo: **Self-Test**.

- **Resultado Esperado**
  > MTTD (cabeçalho vs snapshot inconsistentes) cai de O(reclamação humana) para 1 run. Métrica observável: log linha `BUSINESS_WARN type=audit-divergence` quando a regra de F-1 for violada.

- **Tactic alvo**: Self-Test · Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-3
- **Métricas de sucesso**:
  - jobs de auto-verificação por run: `0` → `1`
  - MTTD divergência audit/snapshot: `∞` → `1 run`
- **Risco de não fazer**: bugs como F-1 só serão descobertos por reclamação do usuário; em domínio financeiro, isso é caro.
- **Dependências**: melhor depois de fault-tolerance-1 (com run-header já alinhado, o self-test passa a defender o invariante).

### [fault-tolerance-4] Cobrir o mapeamento N:M→snapshot com teste explícito em `PermutaSnapshotRepository.test.ts`

- **Problema**
  > O ADR-0005 §4 estabelece que `casamento-manual` é mapeado para `status='bloqueada'` no snapshot (back-compat `/painel`). Esse mapeamento existe em código (`insertCandidataChunk`, l.247-250) mas NENHUM teste o protege — regressão silenciosa possível.

- **Melhoria Proposta**
  > Adicionar 1 caso em `PermutaSnapshotRepository.test.ts`: persist um `PermutaCandidata` com `estadoElegibilidade=CASAMENTO_MANUAL` + `motivoBloqueio='composto-nm'`, ler o `status` gravado, assertar `'bloqueada'`. Asserir também que `motivo_bloqueio` foi gravado como `'composto-nm'` (consumido na UI do `/painel`). Tactic alvo: **Sanity Checking** (test-level).

- **Resultado Esperado**
  > Cobertura do mapeamento N:M→snapshot: 0% → 100%. PR review consegue pegar regressão imediatamente.

- **Tactic alvo**: Sanity Checking
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - testes que protegem o mapeamento ADR-0005 §4: `0` → `≥1`
- **Risco de não fazer**: alguém remove o ramo de mapeamento ao mexer no snapshot futuramente, e o `/painel` quebra (CHECK constraint do banco rejeita `'casamento-manual'` → 500 na ingestão).
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo limitado por instrução do usuário ao delta `casamento-manual` da branch `feat/permutas-painel-elegiveis` — NÃO foram auditados outros caminhos de fault-tolerance do repo (timeouts Conexos, DLQ, Lambda jobs alvo, etc.). Esses caminhos vivem em qa-availability/qa-performance.
- A análise tratou ADR-0005 §4 (mapeamento `casamento-manual → bloqueada` no snapshot) como decisão consciente, não bug — daí F-fault-tolerance-4 é P3 (cobertura de teste), e o achado P1 (F-1) é a SEGUNDA consequência: o cabeçalho da run não foi reajustado em paralelo, criando a divergência intra-run.
- F-fault-tolerance-2 foi rebaixado para P2 porque o usuário declarou que não rodará 0005 contra DB real agora e o `Tenants` está vazio no CLAUDE.md — armadilha latente, não dor imediata.
- Cross-QA: F-1 (Comparison/auditoria) toca **Security** (auditabilidade do cabeçalho de run) e **Testability** (cobertura ausente para runs mistas com N:M). F-3 (self-test) toca **Modifiability** (qualquer mudança futura no shape de status no snapshot fica protegida). Alertar o `qa-consolidator` para correlacionar.
