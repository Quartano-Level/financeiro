---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-18-2039
agent: qa-fault-tolerance
generated_at: 2026-06-18T20:39:00-03:00
scope: backend
score: 7.5
findings_count: 4
cards_count: 4
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Job diário de ingestão (`jobs/ingest-permutas.ts`, cron) ou trigger manual concorrente | Falha parcial durante o run: (a) `computeCandidatas` quebra (Conexos 5xx exausto), (b) qualquer passo do `write(tx, runId)` quebra dentro da TX, (c) `snapshotRepository.persistRun` quebra **APÓS** o commit da TX relacional, (d) `insertIngestRunHeader` de erro quebra | `IngestaoPermutasService.executar` (linhas 92–128 + catch 153–183) + `PermutaRelationalRepository.persistIngestRun` + `PermutaSnapshotRepository.persistRun` | Modelo relacional (`permuta_adiantamento`/`_invoice`/`_declaracao_importacao`/`_casamento`) com fatos last-good de runs anteriores + soft-ref `permuta_processamento` (estado do analista) | (1) `withAdvisoryLock(INGEST_LOCK_KEY)` serializa ingestões, (2) `withTransaction` atomiza upserts+casamento+sweep, (3) ROLLBACK preserva fatos last-good (UPSERT-in-place; sweep só marca `stale`, nunca deleta), (4) cabeçalho `error` é gravado FORA da TX (best-effort, `try/catch` engole falha desse próprio insert), (5) `permuta_processamento` é SOFT-REF (sem FK) → estado do analista sobrevive a re-ingestão | 0 perda de last-good (fatos visíveis na próxima leitura `/gestao`); 0 dupla-ingestão concorrente (advisory lock serializa); 100% das falhas a-c re-executáveis no próximo cron (forward recovery por design). **Lacuna conhecida (F-fault-tolerance-1)**: cenário (c) deixa o relacional commitado mas com header de erro adicional pendurado no mesmo `flow_id`, e o snapshot back-compat (`/painel`) divergindo do relacional (`/gestao`). |

> Observação concreta: a ordem em `IngestaoPermutasService.executar` é `persistIngestRun` (TX1, commit em L114) → `snapshotRepository.persistRun` (TX2 separada, L128) → `logService.info`. Como TX1 commitou ANTES de TX2 começar, uma falha de TX2 não roda back para o relacional — o relacional fica `success`, e o catch ainda assim insere um segundo header `status='error'` no mesmo `flow_id` (que NÃO tem UNIQUE em `permuta_eleicao_run.flow_id`, ver migration 0001).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Mutating multi-write atomicidade (TX1 — relacional) | `withTransaction(BEGIN→fn→COMMIT/ROLLBACK)` em torno de upserts+casamento+sweep | atomicidade total | ✅ | `PostgreeDatabaseClient.ts:102-123`; `PermutaRelationalRepository.ts:153-170` |
| Serialização concorrente de ingestões | `pg_try_advisory_lock(INGEST_LOCK_KEY=918273645)` na sessão wrapper, throw em busy | 0 ingestões paralelas | ✅ | `PermutaRelationalRepository.ts:158-169`; `PostgreeDatabaseClient.ts:137-158` |
| Sweep nunca deleta | `UPDATE … SET stale=TRUE` (nunca DELETE) | nunca deletar fato | ✅ | `PermutaRelationalRepository.ts:390-409` |
| UPSERT-in-place preserva last-good | `ON CONFLICT (doc_cod) DO UPDATE` em adto/invoice/declaração | manter chave natural | ✅ | `PermutaRelationalRepository.ts:218-237,280-295,325-332` |
| Soft-ref `permuta_processamento` (analista sobrevive a re-ingestão) | PK = `adiantamento_doc_cod`, sem FK ao fato; UPSERT-in-place; sweep não toca | analista persiste através de N ingestões | ✅ | `migrations/0004_permuta_processamento.sql:11-21`; `PermutaProcessamentoRepository.ts:33-60` |
| Dual-write atomicidade relacional × snapshot back-compat | TX1 commita; TX2 (`snapshotRepository.persistRun`) começa **DEPOIS** | 1 TX cobrindo ambos, ou compensação documentada | ❌ | `IngestaoPermutasService.ts:92-128` |
| Cabeçalho `error` no catch — atomicidade do INSERT vs. erro original | `try { insertIngestRunHeader(...) } catch { /* engole */ }` | engole OK (preserva erro original) **mas** pode duplicar `flow_id` quando TX1 já commitou | ⚠️ | `IngestaoPermutasService.ts:159-174` |
| `permuta_eleicao_run.flow_id` único por run | `TEXT NOT NULL` (sem UNIQUE, sem PK composta com `kind`) | `UNIQUE(flow_id, kind)` ou semelhante para impedir duplo-header | ❌ | `migrations/0001_permuta_eleicao.sql:9-21`; `migrations/0003_permuta_relational.sql:13-23` |
| Idempotência da ingestão sob re-entrega (cron + manual) | advisory lock impede paralelismo; **não** há `Idempotency-Key` para a ingestão (só para `/eleicao`) | rerun seguro (UPSERT é idempotente em valor; advisory lock serializa) | ✅ | `IngestaoPermutasService.ts:64-114`; `PermutaRelationalRepository.ts:153-170` |
| Recompute do casamento (DELETE+INSERT) é idempotente por run e dentro da TX | `tx.update('DELETE FROM permuta_casamento')` + bulk INSERT na mesma TX | full atomicidade | ✅ | `PermutaRelationalRepository.ts:340-383` |
| Fail-fast no job runner (cron) | `process.exit(1)` no catch do `main()` | exit non-zero em falha | ✅ | `jobs/ingest-permutas.ts:32-40` |
| Stuck-state detection (run iniciada → nunca finalizada) | nenhum reaper observa `permuta_eleicao_run` com `started_at` velho e `status` ainda intermediário (no caso, `kind='ingest'` órfão) | reaper periódico ou alerta | ❌ | nenhum job de varredura no scope |
| Reconciliation `/gestao` (relacional) × `/painel` (snapshot) | nenhum job que compare contagens entre os dois modelos | reconciliador ou aceitação documentada do drift permitido | ❌ | nenhum job no scope |
| Log estruturado `FLOW_ERROR` no catch | `logService.error({ type: LOG_TYPE.FLOW_ERROR, … data: { flowId, ingestRunId, error } })` | erro estruturado + propaga `throw` | ✅ | `IngestaoPermutasService.ts:176-182` |
| Cobertura de testes do caminho degradado | 1 cenário coberto (compute failure → no relational write + error header + rethrow). Cenário (c) — TX1 commitou + TX2 falha — **NÃO** está coberto | ≥3 cenários (a,b,c) | ⚠️ | `IngestaoPermutasService.test.ts:200-223` |

> ⚠️ **Não medível localmente**: frequência real de falha em `snapshotRepository.persistRun` após commit do relacional (cenário (c)) — requer CloudWatch/Render logs após primeiro tenancing. Recomendação: emitir métrica `permutas.ingest.snapshot_after_commit_failure.count` para detectar regime degradado.

> ⚠️ **Não medível localmente**: contagem real de `permuta_eleicao_run` com dois headers para o mesmo `flow_id` (`kind='ingest'` + status `success` E `error`) em produção — requer query no Postgres do tenant.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass / FT canon) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A — não há componente substituível neste delta (Postgres é fonte única) | N/A | — |
| Replacement | N/A — não há réplica/standby no escopo | N/A | — |
| Predictive Model | N/A — sem sinal preditivo de falha de TX | N/A | — |
| Increase Competence Set | UPSERT com `ON CONFLICT DO UPDATE` aceita re-entrega como condição normal (não exceção); soft-ref aceita "fato sumiu do ERP" como `stale`, não como erro | ✅ | `PermutaRelationalRepository.ts:218-237`; `migrations/0003_permuta_relational.sql:44-46` |
| Sanity Checking | Zod só no boundary HTTP (`processarBodySchema` em `/processar`); na ingestão, o compute já validou estrutura via `EleicaoPermutasService` | ✅ | `routes/permutas.ts:14-17`; `IngestaoPermutasService.ts:70` |
| Comparison | `last_ingest_run_id IS DISTINCT FROM $runId` no sweep — comparação explícita por run | ✅ | `PermutaRelationalRepository.ts:393-407` |
| Timestamp | `last_seen_at`/`updated_at`/`finished_at` carimbados em todos os UPSERTs e no cabeçalho | ✅ | `PermutaRelationalRepository.ts:208-235`; `migrations/0003_permuta_relational.sql:45-48` |
| Timeout | herdado do client de Postgres (pool) e do `RetryExecutor` no caminho de compute (cross-ref Availability) | ✅ (transferido) | `EleicaoPermutasService.ts:274` (chama persistRun); `PostgreeDatabaseClient.ts:102-123` |
| Condition Monitoring | `logService.info({type: FLOW_COMPLETE, data: {flowId, ingestRunId, totalStale, durationMs}})` e `logService.error({type: FLOW_ERROR, …})` | ✅ | `IngestaoPermutasService.ts:130-142,176-182` |
| Self-Test | N/A no delta (sem heartbeat introduzido) | N/A | — |
| Voting | N/A — fonte única (Conexos + Postgres próprio) | N/A | — |
| Redundancy (data) | last-good preservado por UPSERT-in-place + sweep que apenas marca `stale` (cada fato carrega seu próprio "estado anterior à ingestão atual" implicitamente até o próximo UPSERT) | ✅ | `PermutaRelationalRepository.ts:218-237,390-409` |
| Recovery — Backward (rollback DB) | `withTransaction` faz `ROLLBACK` na TX1 em qualquer falha de upsert/sweep/recompute → fatos last-good intactos | ✅ | `PostgreeDatabaseClient.ts:108-123` |
| Recovery — Forward (idempotent replay) | Próximo cron repete o run — UPSERTs convergem ao mesmo estado (idempotência em valor) | ✅ | `IngestaoPermutasService.ts:91-114` + `PermutaRelationalRepository.ts:218-235` |
| Reintroduction — State Resync | re-ingestão a partir do compute reconcilia o relacional; soft-ref do `permuta_processamento` sobrevive | ✅ | `migrations/0004_permuta_processamento.sql:1-21`; `IngestaoPermutasService.ts:92-114` |
| Reintroduction — Shadow | N/A — não há shadow run | N/A | — |
| Reintroduction — Escalating Restart | N/A — processo é one-shot por cron (exit 1 em falha → restart manual/agendador) | N/A | `jobs/ingest-permutas.ts:32-40` |
| Rollback | TX1 com ROLLBACK explícito | ✅ | `PostgreeDatabaseClient.ts:113-119` |
| Repair State | sweep `stale=TRUE` no que sumiu do ERP — repara a visibilidade sem destruir o fato | ✅ | `PermutaRelationalRepository.ts:390-409` |
| Idempotent Replay | UPSERT por chave natural; `DELETE+INSERT` do casamento dentro da MESMA TX | ✅ | `PermutaRelationalRepository.ts:340-383` |
| Compensating Transaction | **AUSENTE** para o cenário (c): se TX2 (snapshot back-compat) falha após TX1 commitou, NÃO há compensação no relacional nem reversão lógica do cabeçalho `success` da ingestão | ❌ | `IngestaoPermutasService.ts:114-128,153-183` |
| Reconcile | nenhum job que compare relacional × snapshot (`/gestao` × `/painel`) nem que detecte runs com dois headers por `flow_id` | ❌ | nenhum job no scope |
| Quarantine | N/A — não há fila de exceção do analista na Fase B (modelado para fases futuras) | N/A | — |

## 4. Findings (achados)

### F-fault-tolerance-1: `snapshotRepository.persistRun` é uma SEGUNDA transação executada APÓS o commit do relacional — sem compensação no caminho de erro

- **Severidade**: P1 (alto — divergência silenciosa entre `/gestao` e `/painel` + duplo cabeçalho no mesmo `flow_id`)
- **Tactic violada**: Compensating Transaction; Recovery — Backward (apenas parcial)
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:92-128` (linhas que importam: 114 = commit TX1; 128 = início TX2); catch em 153-183
- **Evidência (objetiva)**:
  ```
  // L92-114 — TX1 (relacional) commita aqui
  const runId = await this.relationalRepository.persistIngestRun(header, INGEST_LOCK_KEY, ...);
  // L116-128 — TX2 (snapshot back-compat) começa AGORA, fora do escopo da TX1
  const snapshotInput: PermutaEleicaoRunInput = { flowId, ..., status: 'success', ... };
  await this.snapshotRepository.persistRun(snapshotInput, candidatas);
  // L153-183 — catch
  } catch (error) {
      // Insere SEGUNDO header com mesmo flowId, status='error' (TX1 já commitou success)
      runId = await this.relationalRepository.insertIngestRunHeader({ flowId, status: 'error', errorMessage: message, ... });
  ```
- **Impacto técnico**: se `persistRun` (TX2) falha após TX1 ter commitado (ex.: connection pool exhaustion entre as duas TX, falha do INSERT no `permuta_candidata_snapshot` por wire-protocol limit em runs gigantes, ou exceção em `JSON.stringify(bloqueadasByMotivo)`), o relacional fica `success` com fatos atualizados, MAS:
  1. o catch insere um SEGUNDO row em `permuta_eleicao_run` com o MESMO `flow_id`, `kind='ingest'`, `status='error'` (a tabela não tem UNIQUE em `flow_id` — ver `migrations/0001:11`);
  2. `/gestao` (lê o relacional) mostra os novos dados; `/painel` (lê `findLatestSnapshot`, `WHERE status='success'`) mostra o snapshot ANTERIOR — divergência silenciosa entre as duas telas que afirmam a mesma verdade financeira;
  3. o `console.error` do job registra "ingestion FAILED" embora a ingestão tenha de fato persistido o relacional → operador é levado a re-disparar manualmente, o que (graças à idempotência) converge, mas reforça o duplo-header.
- **Impacto de negócio**: dashboard `/painel` mostrando candidatas obsoletas enquanto `/gestao` mostra as novas — analista atua sobre versão errada do casamento sugerido (1:1 de invoice já paga, p.ex.). Em um sistema financeiro o sintoma é "a tela mente sobre dinheiro".
- **Métrica de baseline**: 0% de cenários de teste cobrindo "TX1 commitou + TX2 falha" (`IngestaoPermutasService.test.ts:200-223` só cobre falha de `computeCandidatas`). Alvo: ≥1 cenário.

### F-fault-tolerance-2: ausência de UNIQUE/PK composta em `permuta_eleicao_run.flow_id` permite múltiplos cabeçalhos para o mesmo run lógico

- **Severidade**: P1 (alto — invariante de auditoria O6 violável)
- **Tactic violada**: Sanity Checking (constraint-side); Reconcile
- **Localização**: `src/backend/migrations/0001_permuta_eleicao.sql:11`; `src/backend/migrations/0003_permuta_relational.sql:13-23`
- **Evidência (objetiva)**:
  ```sql
  -- 0001
  flow_id             TEXT NOT NULL,  -- sem UNIQUE
  -- 0003
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'eleicao' CHECK (kind IN ('eleicao', 'ingest'));
  -- nenhuma UNIQUE(flow_id, kind) foi adicionada
  ```
- **Impacto técnico**: o fluxo descrito em F-1 (TX1 success + catch grava erro com mesmo `flow_id`) — e também o caso de `IngestaoPermutasService` × `EleicaoPermutasService` ambos persistirem com `kind='ingest'` E `kind='eleicao'` derivando do mesmo `flow_id` da eleição — todos passam silenciosamente. Consultas que dão `SELECT … WHERE flow_id=$x` retornam N rows quando deveriam retornar 1.
- **Impacto de negócio**: relatórios de auditoria (quem/quando/o-quê) sobre uma run específica viram ambíguos; suporte ao analista (`"esse run rodou ou não?"`) não tem fonte de verdade no DB.
- **Métrica de baseline**: 0 constraint de unicidade no nível DB para o par lógico que identifica um run. Alvo: `UNIQUE (flow_id, kind)` ou normalização equivalente.

### F-fault-tolerance-3: falha do `insertIngestRunHeader` no catch é engolida silenciosamente (`try { … } catch { }`) sem nenhum sinal além do erro original

- **Severidade**: P2 (médio — perda silenciosa de auditoria do próprio erro)
- **Tactic violada**: Condition Monitoring; Sanity Checking (do próprio caminho de recuperação)
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:159-174`
- **Evidência (objetiva)**:
  ```
  try {
      runId = await this.relationalRepository.insertIngestRunHeader({
          flowId, startedAt, finishedAt: new Date(), status: 'error', triggeredBy, ...,
          errorMessage: message,
      });
  } catch {
      // engole — o erro original é re-lançado abaixo.
  }
  ```
- **Impacto técnico**: o erro original é preservado (correto), mas se o INSERT do header falhar (ex.: Postgres indisponível) NENHUM rastro estruturado adicional é emitido. O `logService.error` subsequente loga o erro de compute, NÃO o erro do header. Operador investigando a run lê apenas "permuta ingest aborted" e procura por `runId=''` na tabela — nada. Diagnóstico perde tempo.
- **Impacto de negócio**: MTTR de incidente onde DB ficou momentaneamente indisponível é maior — o analista/SRE precisa adivinhar que houve duas falhas (a do compute E a do header).
- **Métrica de baseline**: 0 logs estruturados secundários no catch interno; o catch externo loga apenas o erro original. Alvo: pelo menos 1 `logService.warn` com `type=BUSINESS_WARN` indicando "audit header write failed" quando o catch interno disparar.

### F-fault-tolerance-4: ausência de reaper/reconciliador para detectar drift entre relacional (`/gestao`) e snapshot (`/painel`)

- **Severidade**: P1 (alto — para a fase em que ambas as telas coexistem)
- **Tactic violada**: Reconcile
- **Localização**: ausente; não há job equivalente em `src/backend/jobs/`
- **Evidência (objetiva)**:
  ```
  $ ls /Users/rizzi26/Documents/GitHub/pessoal/clonex/financeiro/src/backend/jobs/
  ingest-permutas.ts        # único job na fase
  ```
- **Impacto técnico**: enquanto `/painel` (back-compat PR#2) e `/gestao` (Fase B) coexistirem, qualquer cenário de F-1 produz drift entre os dois sem detecção automática. Não há nenhum mecanismo que, no próximo ciclo, observe `count(*) WHERE NOT stale` no relacional ≠ `count(*) WHERE run_id = ultimo_success_snapshot`, ou alerte sobre `permuta_eleicao_run` com dois headers por `flow_id`.
- **Impacto de negócio**: divergência silenciosa entre dashboards sobre o mesmo conjunto de fatos (PROFORMAs candidatas) — exatamente o "the dashboard lies about money" descrito no template do agent.
- **Métrica de baseline**: 0 jobs de reconciliação. Alvo: 1 job diário/horário que (a) detecta `flow_id` com >1 header e (b) compara contagens de candidatas entre `permuta_adiantamento WHERE NOT stale` e `permuta_candidata_snapshot WHERE run_id = ULTIMA_SUCCESS`.

## 5. Cards Kanban

### [fault-tolerance-1] Unir TX relacional + snapshot back-compat na mesma transação (ou registrar compensação documentada)

- **Problema**
  > Hoje, `IngestaoPermutasService.executar` commita o relacional (TX1, L114) e depois inicia `snapshotRepository.persistRun` (TX2, L128). Se TX2 falhar, o relacional fica `success` mas o catch grava um SEGUNDO header `error` no mesmo `flow_id`, e o `/painel` continua servindo a versão anterior — divergência silenciosa entre `/gestao` e `/painel` sobre o mesmo conjunto financeiro.

- **Melhoria Proposta**
  > Opção A (preferida): expor `withTransaction` reentrante ou um `persistRunInTx` em `PermutaSnapshotRepository` para que `IngestaoPermutasService` chame ambos os repos dentro do mesmo `persistIngestRun` (uma única TX cobre o cabeçalho + fatos relacionais + casamento + sweep + snapshot back-compat). Opção B (interina): tratar a falha do snapshot como cenário aceito de forward-recovery — não emitir `throw`, logar `BUSINESS_WARN` estruturado com `flowId`/`ingestRunId` e NÃO inserir cabeçalho `error` (o relacional está consistente). Em ambos os casos, esclarecer no docstring que o snapshot é back-compat e tem semântica de eventual consistency. Tactic alvo: **Compensating Transaction** / **Recovery — Backward**.

- **Resultado Esperado**
  > Após uma falha de TX2 (ou TX combinada), o estado do DB é binário: ou ambos os modelos refletem o run, ou nenhum. `permuta_eleicao_run` não terá `flow_id` com headers `success` E `error` simultâneos.

- **Tactic alvo**: Compensating Transaction; Recovery — Backward
- **Severidade**: P1
- **Esforço estimado**: M (2–4d) para Opção A (refator do `persistIngestRun` para aceitar callbacks plugáveis de outros repositórios); S (≤1d) para Opção B.
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-2
- **Métricas de sucesso**:
  - Cenários de teste cobrindo "TX1 commitou + TX2 falha": 0 → ≥1
  - Drift `count(/gestao) ≠ count(/painel)` observado em produção: indefinido (sem instrumentação) → 0
- **Risco de não fazer**: em 6 meses, com volume aumentando, a probabilidade de uma falha intermediária entre TX1 e TX2 acumula — analista pega case na tela errada e executa permuta sobre invoice obsoleta.
- **Dependências**: nenhuma — refator local a `IngestaoPermutasService` + `PermutaSnapshotRepository`.

### [fault-tolerance-2] Adicionar `UNIQUE(flow_id, kind)` em `permuta_eleicao_run` (migration 0005)

- **Problema**
  > `permuta_eleicao_run.flow_id` é `TEXT NOT NULL` sem unicidade. O catch da ingestão (e simetricamente o catch da eleição) podem produzir 2 headers para o mesmo run lógico (`success` + `error`), e a invariante O6 "1 run = 1 registro auditável" é violável sem que o DB se oponha.

- **Melhoria Proposta**
  > Criar `migrations/0005_permuta_eleicao_run_unique.sql` adicionando `ALTER TABLE permuta_eleicao_run ADD CONSTRAINT uq_run_flow_kind UNIQUE (flow_id, kind);`. Antes, executar uma query de auditoria/saneamento manual para deduplicar headers órfãos pré-existentes (estratégia: manter o mais recente por `finished_at`, mover os antigos para tabela de quarentena). Tactic alvo: **Sanity Checking** (no nível de constraint DB).

- **Resultado Esperado**
  > Qualquer caminho de código que tentar persistir um header duplicado falha com erro Postgres de violação de UNIQUE, surfaceando o bug em vez de mascará-lo. Auditoria O6 ganha garantia formal de unicidade.

- **Tactic alvo**: Sanity Checking
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) — migration + script de saneamento + ajustar catch da ingestão e da eleição para detectar `unique_violation` e degradar para `WARN` em vez de quebrar.
- **Findings relacionados**: F-fault-tolerance-2, F-fault-tolerance-1
- **Métricas de sucesso**:
  - Rows com `flow_id, kind` duplicado em `permuta_eleicao_run`: indefinido (sem query) → 0 (constraint impede)
  - Falhas de catch que mascarariam o segundo header agora explícitas no log: → 100%
- **Risco de não fazer**: auditoria sobre runs específicas vira ambígua; consultas `WHERE flow_id=$x` retornam N rows sem aviso.
- **Dependências**: depende do levantamento prévio de duplicados existentes (one-shot, idempotente).

### [fault-tolerance-3] Logar a falha do header de erro engolido pelo `catch` interno

- **Problema**
  > No catch externo de `IngestaoPermutasService.executar`, o `insertIngestRunHeader` está envolto em `try { … } catch { /* engole */ }` (linhas 159-174). Se o INSERT do header falhar, NENHUM sinal estruturado é emitido — o log subsequente cobre só o erro original. Operador investigando perde tempo procurando por um runId vazio.

- **Melhoria Proposta**
  > Substituir o `catch {}` por um catch que chama `logService.warn({ type: LOG_TYPE.BUSINESS_WARN, message: 'permuta ingest audit header write failed', data: { flowId, originalError: message, headerError: ... } })`. Não re-lançar — preservar o comportamento de "o erro original ganha prioridade". Tactic alvo: **Condition Monitoring**.

- **Resultado Esperado**
  > Falhas duplas (compute falhou + audit header falhou) deixam dois logs estruturados correlacionados pelo `flowId`, encurtando o MTTR de incidentes onde o DB ficou indisponível.

- **Tactic alvo**: Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - % de cenários de falha dupla com 2 logs correlacionados: 0% → 100%
  - Linhas perdidas (`catch {}` vazio) no `IngestaoPermutasService`: 1 → 0
- **Risco de não fazer**: em incidente real de DB indisponível, troubleshooting depende de adivinhar — debt de observabilidade.
- **Dependências**: nenhuma.

### [fault-tolerance-4] Adicionar job de reconciliação relacional × snapshot + detector de duplo header

- **Problema**
  > Enquanto `/painel` (back-compat) e `/gestao` (Fase B) coexistirem, qualquer falha intermediária entre as duas escritas produz drift silencioso. Não há job que (a) compare contagem de candidatas ativas no relacional × snapshot do último `success`, ou (b) detecte `permuta_eleicao_run` com >1 header por `flow_id`.

- **Melhoria Proposta**
  > Criar `src/backend/jobs/reconcile-permutas.ts` rodando após `ingest-permutas` (cron defasado): (a) `SELECT flow_id, COUNT(*) FROM permuta_eleicao_run GROUP BY flow_id, kind HAVING COUNT(*) > 1` → se >0, `logService.error` com `type=BUSINESS_ERROR` e listar `flow_id`s; (b) comparar `count(*) FROM permuta_adiantamento WHERE NOT stale` com a contagem do último snapshot `success` — se delta > tolerância documentada, `logService.warn`. Job é READ-ONLY. Tactic alvo: **Reconcile**.

- **Resultado Esperado**
  > Drift entre `/gestao` e `/painel` deixa de ser silencioso: vira log estruturado consumível por alerta (CloudWatch após primeira tenancia, ou Render logs no atual). MTTR de "a tela mente" cai de "quando o analista notar" para "no próximo ciclo do job".

- **Tactic alvo**: Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–4d) — job + 1 query saneamento + 2 cenários de teste + cron documentation.
- **Findings relacionados**: F-fault-tolerance-4, F-fault-tolerance-1, F-fault-tolerance-2
- **Métricas de sucesso**:
  - Jobs de reconciliação ativos: 0 → 1
  - Drift médio detectado e alertado: indefinido → instrumentado
- **Risco de não fazer**: se F-1/F-2 não forem corrigidos ANTES, o drift acumula silenciosamente. Job é o salvo-conduto de detecção mesmo se as causas-raiz demorarem.
- **Dependências**: melhor após F-2 (UNIQUE constraint reduz superfície), mas independente — pode rodar antes como detector puro.

## 6. Notas do agente

- Escopo restrito ao delta Permutas Fase B (ingestão + relacional + processamento + back-compat snapshot), conforme dirigido pelo `_shared-metrics.md`. Não revisei `SISPAG`/`GED` (fora do scope da Fase B).
- O `_shared-metrics.md` no path `_template/` referido no prompt não existe; usei o `_shared-metrics.md` do próprio run dir (`2026-06-18-2039/_shared-metrics.md`) que já estava preenchido.
- A `Idempotency-Key` formal é só para `/eleicao` (ver `EleicaoPermutasService.ts:104-130`). Para a ingestão, o advisory lock + UPSERT-in-place cobre re-entrega — válido, registrado em métricas (linha "Idempotência da ingestão").
- Cross-QA: F-1 e F-2 também tocam **Security (auditability)** — invariante O6 "1 run = 1 registro auditável" é violável; alertar `qa-security` e `qa-testability` (cobertura de testes do cenário c). F-4 toca **Modifiability** (introduz um padrão de reconciliação reutilizável por outras frentes — SISPAG/GED).
- Quick mode: não rodei nenhuma query no DB (sem `psql`/Supabase MCP usado); todas as métricas são por inspeção de código + SQL das migrations.
