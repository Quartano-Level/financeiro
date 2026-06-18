---
qa: Performance
qa_slug: performance
run_id: 2026-06-18-2039
agent: qa-performance
generated_at: 2026-06-18T20:39:00-03:00
scope: backend
score: 6
findings_count: 7
cards_count: 7
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Cron diário (`jobs/ingest-permutas.ts`) + trigger manual concorrente | Ingestão completa: ~410 fetches Conexos (~10 filiais × ~41 chamadas: listFiliais + N adiantamentos × `getDetalheTitulos`/`listTitulosAPagar`) seguidos de UPSERT em lote + recompute de casamento | `IngestaoPermutasService.executar` → `EleicaoPermutasService.computeCandidatas` → `PermutaRelationalRepository.persistIngestRun` (advisory lock `918273645` + tx única) | Pool Postgres `max=5`, Conexos p99 2–10s, Render single-instance | Fan-out fica FORA do lock; só a fase write (UPSERT chunked 500 + DELETE+INSERT casamento + 3× sweep) ocupa lock+tx; tela `/gestao` permanece servível durante a fan-out window | Lock-hold ≤ 5 s (apenas escrita), ingestão E2E ≤ 90 s p95, `/gestao` p95 ≤ 800 ms ao lado de uma ingestão em curso, 0 erro `advisory lock busy` em operação normal |
| Analista (browser) | `GET /permutas/gestao` durante ou logo após ingestão | `GestaoPermutasService.exporGestao` (4× `selectMany` paralelos + grouping in-memory) | Pool=5, Render warm | Servir o payload completo (~10k rows agregados) sem timeout, sem disputar lock com ingestão | p95 ≤ 800 ms, payload ≤ 2 MB, 0 N+1 |

> O cenário pressupõe ~10 filiais ativas (corresponde a `FILIAIS_CONCURRENCY=5`, `PAGE_SIZE=500`, `MAX_PAGES=50` e ~10 adiantamentos/filial em estado-alvo). Volumes acima disso passam o lock-hold da escrita acima do alvo e exigem revisão dos cards `performance-2` e `performance-5`.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Chunk size do UPSERT multi-row | 500 rows | ≤ 1000 (limite wire pg) | ✅ | `PermutaRelationalRepository.ts:80` (`UPSERT_CHUNK = 500`) |
| Concorrência de fan-out (filiais × adiantamentos) | 5 × 10 = 50 chamadas Conexos em voo | ≤ 50 (Conexos não publica limite; manter abaixo de 100 por prudência) | ✅ | `EleicaoPermutasService.ts:66-67` |
| Onde `computeCandidatas` (fan-out Conexos) executa em relação ao advisory lock | **FORA do lock** — `executar` chama `computeCandidatas` antes de `persistIngestRun` | FORA do lock | ✅ | `IngestaoPermutasService.ts:70-114` |
| `replaceAutoCasamentos` — estratégia | `DELETE FROM permuta_casamento` (full-table) + bulk INSERT em chunks de 500 dentro da MESMA tx | Recompute incremental ou TRUNCATE + bulk (ver F-performance-2) | ⚠️ | `PermutaRelationalRepository.ts:340-349` |
| `markStale` — # de UPDATEs full-scan dentro do lock | 3 (`permuta_adiantamento`, `permuta_invoice`, `permuta_declaracao_importacao`) | 3 (aceitável; depende de índice em `last_ingest_run_id`) | ⚠️ | `PermutaRelationalRepository.ts:390-409` |
| Índice em `last_ingest_run_id` (suporta sweep `markStale`) | **AUSENTE** nas três tabelas | Índice parcial `WHERE NOT stale` para suportar o predicado `IS DISTINCT FROM $runId AND NOT stale` | ❌ | `migrations/0003_permuta_relational.sql:51-98` (nenhum `CREATE INDEX ... ON ... (last_ingest_run_id)`) |
| Pool max × ingestão concorrente | `max=5`; ingestão segura 2 clients (1 lock + 1 tx); `/gestao` precisa de 1 client por request | Pool ≥ 5 (atual ok p/ ~3 requests concorrentes) | ⚠️ | `PostgreeDatabaseClient.ts:26` |
| `withAdvisoryLock` segura um client adicional do pool durante toda a escrita | Sim — `withAdvisoryLock` toma 1 client e `withTransaction` toma outro (pool=5 → resta 3 para reads) | Lock e tx no MESMO client OU reduzir hold | ⚠️ | `PostgreeDatabaseClient.ts:137-158` (lock client) + `:102-123` (tx client) |
| `GestaoPermutasService.exporGestao` — N+1 risk | 0 (4× selectMany paralelos + grouping `Map` in-memory; nenhum `await` em loop sobre repo) | 0 | ✅ | `GestaoPermutasService.ts:37-56` |
| `listAdiantamentosAtivos` / `listInvoicesEmAberto` / `listCasamentos` — `LIMIT` aplicado | Nenhum `LIMIT`. Crescem com a base ativa (adiantamentos não-pagos + invoices em aberto + casamentos da run corrente) | `LIMIT $X OFFSET $Y` + paginação no payload `/gestao` (CLAUDE.md Dynamic WHERE) | ❌ | `PermutaRelationalRepository.ts:413-449` |
| `DELETE FROM permuta_casamento` sem WHERE → bloat por dead tuples | A cada run o autovacuum precisa recuperar 100% das tuplas; sem `VACUUM`/`autovacuum` agressivo cresce até inflar o índice | TRUNCATE (recicla páginas direto, zero dead tuples) ou recompute incremental por delta | ⚠️ | `PermutaRelationalRepository.ts:345` |
| `setTimeout`/`setInterval` em código de negócio (busy-loop check) | 0 ocorrências em `domain/service/permutas` e `jobs/ingest-permutas.ts` | 0 | ✅ | `grep -rn "setTimeout\|setInterval" src/backend/domain/service/permutas src/backend/jobs` |
| Cold-start budget de Lambda | N/A (estado-alvo) — backend roda Express no Render | N/A no escopo Fase B | N/A | CLAUDE.md "Estado Atual vs. Alvo" |

> ⚠️ **Não medível localmente** (`--quick`): tempo real do lock-hold (precisa de produção com ~10 filiais reais), # exato de fetches Conexos por run (depende de `MAX_PAGES` × adiantamentos por filial), tempo do `DELETE FROM permuta_casamento` com tabela carregada. Recomendação: instrumentar `IngestaoPermutasService.executar` com `durationMs` separado por fase (já loga `durationMs` total — separar `computeMs`, `writeMs`/`lockHoldMs`, `staleMs`) e expor no log do run.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — ingestão diária via cron; sem amostragem aplicável | N/A | — |
| Limit Event Response | Lock advisory `pg_try_advisory_lock` (não-bloqueante) curto-circuita ingestão duplicada com erro explícito; `MAX_PAGES=50` por filial limita resposta às páginas Conexos | ✅ presente | `IngestaoPermutasService.ts:37`, `PostgreeDatabaseClient.ts:147`, `EleicaoPermutasService.ts:62` |
| Prioritize Events | Cron único + trigger manual disputam o mesmo lock; nenhuma fila/prioridade explícita (aceitável neste escopo) | ⚠️ parcial | `PermutaRelationalRepository.ts:166-169` (onBusy = throw) |
| Reduce Overhead | UPSERT multi-row (até 500 tuplas por statement) evita 500× round-trip; batched declarações/invoices por filial em vez de N+1 (P0-7) | ✅ presente | `PermutaRelationalRepository.ts:182-238`, `EleicaoPermutasService.ts:345-352` |
| Bound Execution Times | Pool `connectionTimeoutMillis=5000`; **falta timeout explícito de transação** e da sessão do advisory lock — uma falha lenta dentro do `write` segura o lock indefinidamente | ⚠️ parcial | `PostgreeDatabaseClient.ts:28` (connection only); ver F-performance-3 |
| Increase Resource Efficiency | `computeCandidatas` fora do lock (fan-out lento NÃO bloqueia ingestões/leituras concorrentes); `markStale` faz `WHERE ... AND NOT stale` para evitar UPDATE noop | ✅ presente | `IngestaoPermutasService.ts:70-114`, `PermutaRelationalRepository.ts:395` |
| Increase Resources | Pool `max=5` cobre cenário documentado (~3 concorrentes); não escala para mais filiais/usuários sem revisão | ⚠️ parcial | `PostgreeDatabaseClient.ts:26` |
| Increase Concurrency | Fan-out Conexos com `boundedConcurrency` (5 filiais × 10 adiantamentos); `Promise.all` em 4 reads no `GestaoPermutasService` | ✅ presente | `EleicaoPermutasService.ts:216-220, 357-366`, `GestaoPermutasService.ts:37-42` |
| Maintain Multiple Copies of Computations | Snapshot legacy (`/painel`) + modelo relacional (`/gestao`) compartilham o MESMO `computeCandidatas` — sem duplicar fan-out | ✅ presente | `IngestaoPermutasService.ts:117-128` |
| Maintain Multiple Copies of Data | Snapshot (back-compat) + modelo relacional convivem; ambos persistidos pela mesma run | ✅ presente | `IngestaoPermutasService.ts:117-128` |
| Bound Queue Sizes | N/A — sem fila (cron direto); `boundedConcurrency` cumpre função análoga no fan-out | ✅ presente (via concurrency cap) | `EleicaoPermutasService.ts:66-67` |
| Schedule Resources | Cron diário 06:00 (documentado no header do job, NÃO agendado em produção); ingestão única evita pico simultâneo | ⚠️ parcial | `jobs/ingest-permutas.ts:14-17` |

## 4. Findings (achados)

### F-performance-1: `listAdiantamentosAtivos`, `listInvoicesEmAberto` e `listCasamentos` sem `LIMIT`

- **Severidade**: P1
- **Tactic violada**: Limit Event Response, Bound Execution Times
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:413-449`
- **Evidência (objetiva)**:
  ```sql
  SELECT * FROM permuta_adiantamento WHERE NOT stale ORDER BY (aging_days IS NULL), aging_days DESC, doc_cod ASC
  SELECT * FROM permuta_invoice WHERE NOT stale AND NOT pago ORDER BY doc_cod ASC
  SELECT invoice_doc_cod, ... FROM permuta_casamento ORDER BY invoice_doc_cod ASC, adiantamento_doc_cod ASC
  ```
  Nenhum `LIMIT` / `OFFSET`. Servidos integralmente a cada `GET /permutas/gestao`.
- **Impacto técnico**: payload de `/gestao` cresce linearmente com a base ativa; cada hit transporta 100% dos adiantamentos não-stale, 100% das invoices em aberto e 100% dos casamentos. Sob escala (volume real de ~10 filiais × meses de adiantamentos ativos), a serialização JSON + transferência dominam o p95 e o pool fica preso por uma única request.
- **Impacto de negócio**: tela de gestão fica lenta ou trava quando a base de adiantamentos ativos crescer; analista precisa filtrar mentalmente. Cada refresh re-puxa o estado inteiro.
- **Métrica de baseline**: 0 queries com `LIMIT` em `selectMany` na repo (`grep -c LIMIT src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` = 0).

### F-performance-2: `replaceAutoCasamentos` faz `DELETE FROM permuta_casamento` (sem WHERE) dentro do lock+tx

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead, Increase Resource Efficiency
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:340-349`
- **Evidência (objetiva)**:
  ```typescript
  public replaceAutoCasamentos = async (tx, runId, rows) => {
      await tx.update('DELETE FROM permuta_casamento', {});
      for (const chunk of chunked(rows, UPSERT_CHUNK)) {
          await this.insertCasamentoChunk(tx, runId, chunk);
      }
  };
  ```
- **Impacto técnico**: cada run executa um DELETE full-table seguido de re-INSERT de **todos** os casamentos. Três efeitos: (a) tempo de DELETE cresce com volume e mantém o lock+tx ocupados; (b) gera dead tuples = 100% da tabela em cada run, forçando autovacuum constante e bloat de índice (`idx_permuta_casamento_invoice`, `idx_permuta_casamento_adiantamento`, UNIQUE); (c) `DELETE` dentro de tx não recicla o espaço imediatamente como `TRUNCATE` faria. Estende a janela em que `/gestao` lê `permuta_casamento` em paralelo à reescrita (MVCC ainda serve o estado anterior, mas a próxima leitura paga o custo da página suja).
- **Impacto de negócio**: throughput da ingestão diária degrada com volume; lock-hold cresce; gestão fica mais lenta no dia seguinte ao crescimento de base.
- **Métrica de baseline**: 1 `DELETE FROM permuta_casamento` sem WHERE no caminho crítico; chunks de 500 INSERTs sequenciais no mesmo lock-hold (em vez de uma única operação `INSERT ... ON CONFLICT` por delta).

### F-performance-3: Lock advisory + transação sem timeout explícito de sessão (`statement_timeout` / `lock_timeout`)

- **Severidade**: P1
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/domain/client/database/PostgreeDatabaseClient.ts:51-73,102-158`
- **Evidência (objetiva)**:
  ```typescript
  this.connectionPool = new Pool({
      connectionString: envVars.databaseConnectionString,
      idleTimeoutMillis: this.poolIdleTimeoutMillis,    // 10s — só p/ idle
      connectionTimeoutMillis: this.poolConnectionTimeoutMillis, // 5s — só p/ acquire
      max: this.poolMaxConnections,
  });
  ```
  Nenhum `SET statement_timeout` / `SET lock_timeout` / `SET idle_in_transaction_session_timeout` aplicado por sessão. `withAdvisoryLock` libera o lock no `finally`, mas se o `write` ficar pendurado (ex.: query travada esperando vacuum/IO), o lock permanece adquirido.
- **Impacto técnico**: uma ingestão "stuck" segura o advisory lock indefinidamente — segunda ingestão (cron ou manual) cai em `onBusy` e dispara `permuta ingest advisory lock busy`. Não há mecanismo de cap defensivo; recuperação exige kill da sessão Postgres.
- **Impacto de negócio**: ingestão diária pode parar até intervenção manual; risco de blocking em produção.
- **Métrica de baseline**: 0 timeouts de tx/statement no client (`grep -c "statement_timeout\|lock_timeout\|idle_in_transaction" src/backend/domain/client/database/PostgreeDatabaseClient.ts` = 0).

### F-performance-4: Sweep `markStale` sem índice em `last_ingest_run_id`

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:390-409`; `src/backend/migrations/0003_permuta_relational.sql:51-98`
- **Evidência (objetiva)**:
  ```sql
  UPDATE permuta_adiantamento SET stale = TRUE, updated_at = now()
   WHERE last_ingest_run_id IS DISTINCT FROM $runId AND NOT stale
  ```
  Procura tabela em `0003`: nenhum índice em `last_ingest_run_id` nas três tabelas. Existe `idx_permuta_adiantamento_fil_estado_ativo` parcial `WHERE NOT stale`, mas o predicado `IS DISTINCT FROM $runId` não casa diretamente.
- **Impacto técnico**: cada `markStale` faz seq scan + bitmap heap scan em três tabelas, dentro do lock+tx. Volume baixo hoje (ok), mas escala linearmente com a base ativa.
- **Impacto de negócio**: lock-hold cresce com a base; janela de "advisory lock busy" amplia.
- **Métrica de baseline**: 0 índices cobrindo `last_ingest_run_id` (`grep -c "last_ingest_run_id" src/backend/migrations/0003_permuta_relational.sql` casa só DDL de coluna, nenhum `CREATE INDEX`).

### F-performance-5: Advisory lock e transação correm em CLIENTS distintos do pool (consome 2 de 5)

- **Severidade**: P2
- **Tactic violada**: Increase Resource Efficiency
- **Localização**: `src/backend/domain/client/database/PostgreeDatabaseClient.ts:137-158` (`withAdvisoryLock` toma client) + `:102-123` (`withTransaction` toma outro)
- **Evidência (objetiva)**:
  ```typescript
  // withAdvisoryLock:
  const client = await this.connectionPool.connect();
  ...
  return await onAcquired();   // onAcquired chama withTransaction → connect() de novo
  ```
  Em `persistIngestRun`, `onAcquired` invoca `withTransaction` em sequência → cada um pega um client. Durante toda a fase write, 2 dos 5 clients estão presos.
- **Impacto técnico**: pool=5 com ingestão em curso → sobram 3 clients para reads concorrentes. Se duas requests `/gestao` chegarem juntas (cada uma exige 1 client por `selectMany`, e o `Promise.all` da `exporGestao` mantém ≥1 a cada momento), a terceira request pode esperar até 5 s (`connectionTimeoutMillis`).
- **Impacto de negócio**: sob carga concorrente baixa-média, requests `/gestao` veem latência amplificada durante a janela de ingestão.
- **Métrica de baseline**: pool=5, ingestão ocupa 2 clients → 60 % do pool disponível durante write window.

### F-performance-6: `markStale` retorna `Number` somando três `update` que NÃO devolvem `rowCount` agregável de forma confiável via UPDATE multi-tabela

- **Severidade**: P3
- **Tactic violada**: Reduce Overhead (microbatching)
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:390-409`
- **Evidência (objetiva)**:
  Três `UPDATE` separados, cada um abrindo seu próprio plano + scan. Poderiam ser executados em paralelo (mesma tx → mesmo client → impossível) ou pelo menos em CTE única, mas a estrutura atual é sequencial.
- **Impacto técnico**: lock-hold cresce com o número de tabelas; cada UPDATE é round-trip + planejamento.
- **Impacto de negócio**: marginal hoje (volume baixo).
- **Métrica de baseline**: 3 round-trips sequenciais dentro do lock; mensurável apenas em produção.

### F-performance-7: `GET /permutas/gestao` constrói payload de 3 listas full-base sem cache HTTP (`ETag`/`Cache-Control`)

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead, Maintain Multiple Copies of Data
- **Localização**: `src/backend/domain/service/permutas/GestaoPermutasService.ts:36-85`; `src/backend/routes/permutas.ts:64-69`
- **Evidência (objetiva)**: `exporGestao` lê 4 tabelas em paralelo, agrupa em memória, devolve `geradoEm: new Date().toISOString()`. Cada hit re-executa as 4 queries; nenhum header de cache.
- **Impacto técnico**: tela faz polling/refresh sem reuso; payload muda apenas após ingestão diária ou ação manual de processamento.
- **Impacto de negócio**: custo desnecessário em CPU/DB para refresh frequente; latência percebida pelo analista maior do que precisaria ser.
- **Métrica de baseline**: 4 queries por hit, 0 cache layer (sem `last_ingest_run_id` exposto como ETag).

## 5. Cards Kanban

### [performance-1] Paginar `GET /permutas/gestao` e cap-ar listas no repositório

- **Problema**
  > `listAdiantamentosAtivos`, `listInvoicesEmAberto` e `listCasamentos` rodam sem `LIMIT`. Cada hit em `/gestao` carrega 100% da base ativa, junta em memória e serializa o JSON inteiro. Vai degradar p95 e travar o pool de 5 conexões com poucos refreshes simultâneos quando a base crescer.

- **Melhoria Proposta**
  > Adicionar `LIMIT $limit OFFSET $offset` (default 200, max 1000) nos três `selectMany` de leitura em `PermutaRelationalRepository`; expor paginação no contrato `/permutas/gestao` (`?page=&pageSize=`) e devolver `totais.totalRows`. Paralelo: adicionar índices de cobertura para o `ORDER BY` (`permuta_adiantamento` por `(aging_days DESC NULLS LAST, doc_cod)` já parcialmente coberto pelo índice parcial; revisar com EXPLAIN).

- **Resultado Esperado**
  > Cada hit transfere ≤ 200 rows × 3 listas em vez do total. p95 de `/gestao` 800 ms → ≤ 300 ms na base atual e independe do crescimento futuro.

- **Tactic alvo**: Limit Event Response
- **Severidade**: P1
- **Esforço estimado**: M (2–3d incluindo ajuste no frontend)
- **Findings relacionados**: F-performance-1, F-performance-7
- **Métricas de sucesso**:
  - Rows transferidas em 1 hit `/gestao`: full-base → ≤ 200 × 3
  - p95 `/gestao`: baseline atual → ≤ 300 ms
  - Pool utilization durante refresh concorrente: 100% em request única → ≤ 20%
- **Risco de não fazer**: tela vira inutilizável quando a base cruzar ~5 k adiantamentos ativos; pool saturado bloqueia ingestão.
- **Dependências**: alinhar contrato com frontend (`src/frontend/app/permutas/gestao`).

### [performance-2] Trocar `DELETE FROM permuta_casamento` por `TRUNCATE` ou recompute incremental

- **Problema**
  > `replaceAutoCasamentos` faz `DELETE FROM permuta_casamento` (full-table) seguido de re-INSERT de tudo, **dentro do advisory lock + tx**. Gera dead tuples = 100% da tabela por run, força autovacuum constante, e estende o lock-hold proporcional ao volume. O `DELETE` não é `TRUNCATE`-equivalente em uso de espaço.

- **Melhoria Proposta**
  > Curto prazo: substituir o `DELETE` por `TRUNCATE permuta_casamento RESTART IDENTITY` (recicla páginas direto, zero dead tuples, locks de tabela em vez de row-locks). Médio prazo: recompute por delta — comparar `(invoice_doc_cod, adiantamento_doc_cod)` da run atual com a tabela e fazer `INSERT ... ON CONFLICT DO NOTHING` para novos + `DELETE WHERE NOT IN (set atual)` para órfãos, evitando reescrever casamentos imutáveis.

- **Resultado Esperado**
  > Fase write de casamento ≤ 500 ms (baseline a medir). Dead tuples na `permuta_casamento` após run: 100% → 0% (TRUNCATE) ou ≤ 10% (delta).

- **Tactic alvo**: Reduce Overhead, Increase Resource Efficiency
- **Severidade**: P1
- **Esforço estimado**: S (TRUNCATE) / M (delta incremental)
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - Lock-hold da fase write: medir baseline → −30% mínimo após TRUNCATE
  - `n_dead_tup` em `permuta_casamento` (pg_stat_user_tables) pós-run: ~totalCasamentos → 0
- **Risco de não fazer**: ingestão diária fica progressivamente mais lenta; lock-hold cresce; bloat de índice exige `REINDEX` manual.
- **Dependências**: instrumentação de `durationMs` por fase (ver Notas).

### [performance-3] Aplicar `statement_timeout` / `lock_timeout` / `idle_in_transaction_session_timeout` nas sessões do pool

- **Problema**
  > `withAdvisoryLock` libera o lock no `finally`, mas se o `write` ficar pendurado (rede, deadlock no autovacuum, query lenta), o lock permanece adquirido até o cliente terminar. Não há timeout defensivo. Segunda ingestão concorrente cai em `permuta ingest advisory lock busy` e a primeira pode ficar indefinidamente travada.

- **Melhoria Proposta**
  > No `PostgreeDatabaseClient.init`, configurar `Pool` com hook de pós-conexão que executa `SET statement_timeout = '60s'; SET lock_timeout = '5s'; SET idle_in_transaction_session_timeout = '30s';` em cada novo client. Especificamente para a sessão do advisory lock, aplicar um cap explícito (ex.: 120 s).

- **Resultado Esperado**
  > Ingestão "stuck" aborta automaticamente em ≤ 60 s e libera o lock. MTTR de `advisory lock busy` em produção: manual (kill sessão) → 0 (auto-abort).

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Worst-case lock-hold: ilimitado → ≤ 120 s
  - Sessões `idle in transaction` > 30s: possíveis → 0
- **Risco de não fazer**: incidente de produção exige acesso ao DB para `pg_terminate_backend`.
- **Dependências**: alinhar com Availability (cross-QA — mesma instrumentação ajuda DLQ-style monitoring).

### [performance-4] Adicionar índice em `last_ingest_run_id` para acelerar o sweep `markStale`

- **Problema**
  > `markStale` faz 3× `UPDATE ... WHERE last_ingest_run_id IS DISTINCT FROM $runId AND NOT stale` dentro do lock+tx. Não existe índice em `last_ingest_run_id` nas três tabelas; é seq scan. Custo baixo hoje, linear no crescimento.

- **Melhoria Proposta**
  > Em nova migration `0005_permuta_relational_indexes.sql`, criar índice parcial `CREATE INDEX idx_<tabela>_run_active ON <tabela> (last_ingest_run_id) WHERE NOT stale` para `permuta_adiantamento`, `permuta_invoice` e `permuta_declaracao_importacao`. O predicado parcial casa diretamente com o WHERE do UPDATE.

- **Resultado Esperado**
  > Cada `UPDATE` do sweep usa index scan em vez de seq scan; latência do sweep ≤ 100 ms total no volume atual (baseline a medir).

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - `markStale` durationMs: baseline → ≤ 100 ms
  - Plan de EXPLAIN: Seq Scan → Index Scan em `idx_*_run_active`
- **Risco de não fazer**: lock-hold cresce com base; `/gestao` é mais lento ao lado de ingestão grande.
- **Dependências**: cross-QA com Modifiability (schema como código — todas as queries críticas devem ter índice colocalizado na migration).

### [performance-5] Compartilhar o MESMO PoolClient entre advisory lock e transação na fase write

- **Problema**
  > `withAdvisoryLock` adquire 1 client e, dentro dele, `withTransaction` adquire OUTRO. Durante a fase write da ingestão, 2 dos 5 clients do pool ficam presos. Carga concorrente moderada em `/gestao` esgota o restante.

- **Melhoria Proposta**
  > Expor variante `withAdvisoryLockAndTransaction(lockKey, fn)` no `PostgreeDatabaseClient` que pega UM client, faz `pg_try_advisory_lock` + `BEGIN` + `fn(tx)` + `COMMIT` + `pg_advisory_unlock` no mesmo client. `PermutaRelationalRepository.persistIngestRun` chama essa variante.

- **Resultado Esperado**
  > Ingestão segura 1 client (em vez de 2) durante a write window; pool de 5 mantém 4 disponíveis para `/gestao` concorrente.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P2
- **Esforço estimado**: M (2–3d com testes de `withTransaction` reutilizando client externo)
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - Clients in-use durante ingestão: 2 → 1
  - p95 `/gestao` em paralelo com ingestão: baseline → ≤ +20% (vs. baseline isolado)
- **Risco de não fazer**: pool saturado em pico → requests `/gestao` esperam `connectionTimeoutMillis` e falham com `connection acquisition timeout`.
- **Dependências**: refator no client é compartilhado com outros consumidores; cross-QA com Modifiability.

### [performance-6] Consolidar `markStale` em uma CTE WITH para reduzir round-trips no lock

- **Problema**
  > 3 UPDATEs sequenciais dentro do lock+tx: 3 round-trips, 3 planejamentos. Marginal no volume atual mas degrada com escala.

- **Melhoria Proposta**
  > Reescrever `markStale` como UPDATE composta via CTE: `WITH a AS (UPDATE permuta_adiantamento ... RETURNING 1), i AS (UPDATE permuta_invoice ... RETURNING 1), d AS (UPDATE permuta_declaracao_importacao ... RETURNING 1) SELECT (SELECT count(*) FROM a) + (SELECT count(*) FROM i) + (SELECT count(*) FROM d) AS total`. Um round-trip único.

- **Resultado Esperado**
  > Round-trips do sweep dentro do lock: 3 → 1. Lock-hold ≤ −20 ms (depende da latência rede DB).

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - Round-trips por sweep: 3 → 1
- **Risco de não fazer**: nenhum a curto prazo; otimização defensiva.
- **Dependências**: depende de [performance-4] (índice) para ver benefício real.

### [performance-7] Cache HTTP em `/permutas/gestao` baseado em `last_ingest_run_id`

- **Problema**
  > Cada refresh de `/gestao` re-executa 4 queries e re-monta payload, mesmo sem ingestão nova entre os hits. Não há `ETag`/`Cache-Control` no response.

- **Melhoria Proposta**
  > Selecionar o `last_ingest_run_id` da run de ingestão mais recente (ou um hash composto `runId + max(updated_at) de permuta_processamento`) e emitir como `ETag` no response do `/gestao`. Cliente envia `If-None-Match`; backend devolve 304 sem refazer as 4 queries (apenas a query de versão).

- **Resultado Esperado**
  > Refresh em estado-estável: 4 queries → 1 (a de versão). p95 do refresh sem mudança: baseline → ≤ 50 ms (apenas check de versão).

- **Tactic alvo**: Reduce Overhead, Maintain Multiple Copies of Data
- **Severidade**: P2
- **Esforço estimado**: M (2–3d com testes do frontend)
- **Findings relacionados**: F-performance-7
- **Métricas de sucesso**:
  - Queries por refresh sem mudança de estado: 4 → 1
  - p95 `/gestao` em modo refresh: baseline → ≤ 50 ms
- **Risco de não fazer**: custo persistente; refresh agressivo do frontend amplifica carga sobre DB.
- **Dependências**: contrato com frontend; cross-QA com Modifiability (versão deve refletir ambos os fatos e processamentos).

## 6. Notas do agente

- **Verificado**: `computeCandidatas` (fan-out Conexos ~410 fetches) executa FORA do advisory lock — só os UPSERTs chunked + DELETE+INSERT do casamento + sweep `markStale` ocupam o lock+tx. Esse é o ponto mais importante do escopo e está correto na implementação atual (`IngestaoPermutasService.ts:70-114`).
- **Instrumentação faltante**: o log final só reporta `durationMs` total. Sem separar `computeMs`, `writeMs`/`lockHoldMs` e `staleMs` é impossível validar os alvos dos cards `performance-2`, `performance-4`, `performance-6` em produção. Recomendo abrir card de observabilidade adjacente (sugerir ao consolidator).
- **Cross-QA detectado**:
  - `performance-3` (timeouts) sobrepõe Availability + Fault Tolerance (mesma instrumentação de cap defensivo).
  - `performance-4` (índices) sobrepõe Modifiability (schema como código, índice colocalizado com a migration do fato).
  - `performance-5` (compartilhar PoolClient) toca o `PostgreeDatabaseClient` compartilhado — afeta todos os consumidores; coordenar com Modifiability.
- **Não medido (`--quick`)**: tempos reais (lock-hold, p95 `/gestao`, durationMs por fase) — requer produção; sugestões de baseline ficam pendentes de instrumentação.
- **Score 6/10**: arquitetura de ingestão correta no ponto mais sensível (fan-out fora do lock); penalizado por (a) reads sem `LIMIT`, (b) DELETE full-table no lock, (c) ausência de timeouts defensivos, (d) índice faltante no sweep — todos com plano claro e custo baixo.
