---
qa: Performance
qa_slug: performance
run_id: 2026-06-17-2340
agent: qa-performance
generated_at: 2026-06-18T00:10:00Z
scope: backend
score: 5
findings_count: 8
cards_count: 8
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista dispara `POST /permutas/eleicao` (trigger manual provisório — O4) ou cron diário no estado-alvo | Eleição varre TODAS as PROFORMAs Adiantamento=SIM finalizadas, sem janela incremental (P0-7), multi-filial | `EleicaoPermutasService.processFilial` + `buildCandidata` + `computeVariacao` + `ConexosClient` (`com298/list`, `imp019/list`, `imp223/list`, `com308/...`, `GET /com298/{docCod}`) | Tenant Columbia em produção: 120–200 permutas/mês em regime + backlog histórico, F filiais (Columbia ≥ 2), Conexos com p99 conhecido de 2–10 s por chamada list (não-medido neste run) | Painel disponível em snapshot Postgres consumível em GET sem fan-out; eleição completa sem cap-hit silencioso, sem N+1 escondendo crescimento linear de chamadas Conexos | Total de chamadas Conexos por run ≤ `1 + F × (1 + 2 + ⌈Σadto/CHUNK_SIZE⌉×2)` (após batching) e ≤ 200 no estado de regime; cap-hit (`MAX_PAGES=50` × `PAGE_SIZE=500` = 25k linhas/endpoint) emite `BUSINESS_WARN`; `GET /permutas/painel` p95 ≤ 200 ms (snapshot já materializado) |

> Tradução em uma frase: a eleição é um job de **fan-out alto, sequencial por adiantamento**, com batching desperdiçado (`chunked` recebe arrays de 1 elemento em 2 dos 3 fan-outs). Em ~200 adiantamentos com 1 filial, são >800 chamadas Conexos por run, com cap-hit silencioso possível mesmo sem cap real visível.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Chamadas Conexos por run (formula derivada do código) | `1 (listFiliais) + F × (1 listAdtoProforma + Σadto_filial × (1 getMnyTitPermutar + 1 listDeclaracaoByProcesso + 1 listFinanceiroAPagar) + Σelegivel_filial × 2 listTitulosAPagar)` | `O(F + Σadto/CHUNK + Σelegivel/CHUNK)` (batching) | ❌ | `EleicaoPermutasService.ts:154-244` |
| Chamadas Conexos por run — cenário regime (F=1, A=200, E=100) | `1 + 1 × (1 + 200 × 3 + 100 × 2) = 802` | ≤ 200 | ❌ | derivado de `processFilial`/`buildCandidata`/`computeVariacao` |
| Chamadas Conexos por run — cenário multi-filial (F=5, A=400, E=200) | `1 + 5 + 400×3 + 200×2 = 1606` | ≤ 200 | ❌ | idem |
| Chamadas Conexos por run — cenário backlog inicial (F=2, A=1500 cumulativo, E=600) | `1 + 2 + 1500×3 + 600×2 = 5703` | ≤ 200 (após janela incremental) | ❌ | P0-7 expressamente removeu janela incremental |
| `CHUNK_SIZE` × `PAGE_SIZE` × `MAX_PAGES` (cap teórico por endpoint+filtro) | `50 priCods × 500 rows × 50 pages = 1.25M rows` | N/A — não é cap por chamada, é por (endpoint, chunk) | ⚠️ | `ConexosClient.ts:272,280,289` |
| `MAX_PAGES` cap silencioso vs ruidoso | `BUSINESS_WARN` emitido APENAS para `listAdiantamentosProforma` (`onCapHit` ligado) | Todos os 4 fan-outs paginados emitem `BUSINESS_WARN` | ⚠️ | `ConexosClient.ts:594-596`; `listDeclaracaoByProcesso`, `listFinanceiroAPagar`, `listFinanceiroAPagarByGerNum`, `listBaixasTitulo`, `listAdiantamentoFinanceiroAPagar`, `listAdiantamentoFinanceiroAReceber` chamam `paginate` sem `onCapHit` |
| Sequencialidade do laço de filiais | `for (const filial of filiais) { await processFilial(...) }` — filiais processadas em série | filiais em paralelo (`Promise.all`) com limite de concorrência por tenant | ❌ | `EleicaoPermutasService.ts:74-77` |
| Sequencialidade do laço de adiantamentos | `for (const adiantamento of adiantamentos) { candidatas.push(await buildCandidata(...)) }` — sequencial | `Promise.all` com `p-limit` (concorrência limitada) ou agrupar por priCod para batch | ❌ | `EleicaoPermutasService.ts:168-170` |
| Reaproveitamento de `chunked` em `listDeclaracaoByProcesso` chamado com `priCods=[adto.priCod]` | 1 priCod ⇒ `chunked(...)` produz 1 array de 1 elemento ⇒ batching efetivo = 0 | Coletar `priCods` distintos do lote antes do loop e fazer 1 chamada (batch real) | ❌ | `EleicaoPermutasService.ts:188-191` + `ConexosClient.ts:638` |
| Reaproveitamento de `chunked` em `listFinanceiroAPagar` chamado com `priCods=[adto.priCod]` | idem — chunking efetivo = 0 | idem | ❌ | `EleicaoPermutasService.ts:193-197` + `ConexosClient.ts:486` |
| Cache de `getMnyTitPermutar` por `docCod` na run | Ausente — chama 1× por adiantamento (mesmo docCod nunca aparece 2× nesta fatia, mas a função é classificada como fan-out "cache by docCod per execution" na própria docstring) | Memoização in-run defensiva (não regride se um futuro caller reentrar) | ⚠️ | `ConexosClient.ts:813-825` (docstring promete; implementação não cacheia) |
| Índices no Postgres do snapshot | 2 índices: `idx_permuta_eleicao_run_status_finished (status, finished_at DESC)`, `idx_permuta_candidata_snapshot_run (run_id)` | Suficiente para `findLatestSnapshot` (cobre `WHERE status` + `ORDER BY finished_at DESC LIMIT 1` e `WHERE run_id=$1`) | ✅ | `migrations/0001_permuta_eleicao.sql:23-24,41-42` |
| Pagination/LIMIT em `selectMany` do painel | `SELECT ... FROM permuta_candidata_snapshot WHERE run_id = $runId ORDER BY ... ` — **sem `LIMIT`** | `LIMIT $pageSize OFFSET $pageOffset` ou keyset; cap defensivo (≥ 10k rows = erro de produto, não de tela) | ❌ | `PermutaSnapshotRepository.ts:115-122` |
| Tamanho esperado do snapshot | `total_candidatas` = todas as PROFORMAs Adiantamento=SIM finalizadas multi-filial (sem janela) — pode chegar a >5k linhas em regime após meses | Painel paginado server-side; resposta JSON ≤ 500 KB | ❌ | derivado de P0-7 |
| Inserção de candidatas no snapshot | Loop `for (const candidata of candidatas) { await this.insertCandidata(...) }` — 1 round-trip Postgres por linha | `INSERT ... VALUES ($1,$2,...),($N+1,$N+2,...)` em chunks (multi-row) ou `COPY FROM STDIN`; idealmente em transação | ❌ | `PermutaSnapshotRepository.ts:90-92, 131-157` |
| Atomicidade run + snapshot rows | Insert do cabeçalho + N inserts de candidata **sem `BEGIN`/`COMMIT`** | Transação única (cabeçalho + linhas + commit) — se cair no meio, restará run sem linhas ou linhas órfãs do ON DELETE CASCADE não sendo invocado | ⚠️ | `PermutaSnapshotRepository.ts:59-95` (cross-QA com Fault Tolerance) |
| Pool size do `PostgreeDatabaseClient` × concorrência do worker | Não medível neste run (sem `infra/`, sem benchmark) | — | ⚠️ Não medível | — |
| Latência real de `com298/list`, `imp019/list`, `imp223/list`, `com308/...` | Não medível em `--quick` (sem ambiente Conexos) | p95 ≤ 1.5 s/chamada lista; p95 ≤ 500 ms detail | ⚠️ Não medível | requer dev tenant; recomendar instrumentação no `RetryExecutor` |
| Tempo total da run de eleição | Não medível em `--quick` (sem benchmark) | < 5 min para 200 permutas/mês; alarme se > 15 min | ⚠️ Não medível | requer instrumentação `FLOW_COMPLETE.durationMs` em CloudWatch |

> ⚠️ **Não medível localmente**: latência real, throughput Conexos, p95 do `POST /permutas/eleicao`. Requer execução em dev tenant Columbia + instrumentação no `RetryExecutor` (já loga, falta agregar). Recomendação: ligar `EMF`/`CloudWatch metric filter` em cima do log `FLOW_COMPLETE.durationMs` e adicionar 1 métrica por endpoint Conexos (`conexos.endpoint.latency.p95`).

## 3. Tactics — Cobertura no nf-projects

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | Nenhuma — eleição varre 100% das PROFORMAs todas as runs (P0-7 expressamente removeu janela incremental) | ❌ ausente | `EleicaoPermutasService.ts:60-77` |
| Limit Event Response | Não há throttling/rate-limit aplicado às chamadas Conexos (RetryExecutor só faz backoff em erro, não cap de RPS) | ❌ ausente | `ConexosClient.ts:353-358` (retries=2, delay=500ms, jitter=200ms) |
| Prioritize Events | N/A — única classe de evento (eleição diária); painel já é READ-ONLY com latência desprezível | N/A | — |
| Reduce Overhead | `chunked(priCods, CHUNK_SIZE=50)` existe nos métodos do client, mas o caller `EleicaoPermutasService.buildCandidata` chama com `priCods=[1]`, anulando o batching | ⚠️ parcial | `EleicaoPermutasService.ts:188-197` |
| Bound Execution Times | `MAX_PAGES=50` cap por endpoint; nenhum cap por run inteira (run pode rodar minutos sem timeout) | ⚠️ parcial | `ConexosClient.ts:289`; `EleicaoPermutasService.ts:60` sem `AbortController`/timeout total |
| Increase Resource Efficiency | `Promise.all` usado em `computeVariacao` (titAdto + titInv em paralelo) e dentro de cada client method que chuncka; **NÃO** usado entre filiais nem entre adiantamentos | ⚠️ parcial | `EleicaoPermutasService.ts:252-255` ok; `74-77` e `168-170` sequenciais |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | Tenant em Express (estado atual) — sem horizontal scale automático; alvo Lambda concurrency depende de tfvars que ainda não existem | ⚠️ parcial | bootstrap doc; `infra/` vazio |
| Increase Concurrency | Filiais e adiantamentos **rodam em série** (`for...of` com `await`) — 0 ganho de paralelismo | ❌ ausente | `EleicaoPermutasService.ts:74-77, 168-170` |
| Maintain Multiple Copies of Computations | Snapshot Postgres = cópia materializada do cômputo (✅) — `GET /permutas/painel` é puramente leitura do snapshot, sem refazer fan-out | ✅ presente | `PainelService.ts:45-69` |
| Maintain Multiple Copies of Data | Snapshot + auditoria por run; sem cache memcached/redis (apropriado para o estágio) | ✅ presente (suficiente p/ Fatia 1) | `PermutaSnapshotRepository.ts` |
| Bound Queue Sizes | N/A — sem SQS na Fatia 1 (eleição é síncrona pelo Express) | N/A — vira P0 quando migrar para Lambda+EventBridge (Fatia futura) | — |
| Schedule Resources | `RetryExecutor` (backoff + jitter) ✅; `PollExecutor` para retorno Nexxera/GED é fora desta fatia | ✅ presente (parcial p/ a fatia) | `ConexosClient.ts:353-358` |

### Cold start budget / Bundle leanness

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Cold start budget (alvo: Lambda) | Atualmente Express (sem cold start). Migration-debt declarado. Nenhuma decisão tomada nesta fatia | N/A nesta fatia | bootstrap doc |
| Bundle leanness | Não aplicável até migração para Lambda | N/A | — |

### Cache strategy

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Cache de configuração (SSM, etc.) | Fora do escopo desta fatia | N/A | — |
| Cache de fan-out (`getMnyTitPermutar` per `docCod` per run) | Docstring promete ("Caller is expected to cache by docCod per execution"); implementação NÃO cacheia | ⚠️ parcial | `ConexosClient.ts:823-825` |
| Snapshot do painel (cache materializado) | ✅ — exatamente o ponto da fatia | ✅ presente | `PermutaSnapshotRepository.findLatestSnapshot` |

### Index discipline em SQL

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Índice cobrindo `findLatestSnapshot` (WHERE status + ORDER BY finished_at DESC) | `idx_permuta_eleicao_run_status_finished (status, finished_at DESC)` ✅ | ✅ presente | `0001_permuta_eleicao.sql:23-24` |
| Índice cobrindo busca de candidatas por run | `idx_permuta_candidata_snapshot_run (run_id)` ✅ | ✅ presente | `0001_permuta_eleicao.sql:41-42` |
| Índice para futuro filtro por `status='elegivel'`/aging desc | Ausente — `ORDER BY (aging_days IS NULL), aging_days DESC` faz table-scan dentro da partição `run_id` | ⚠️ parcial (aceitável p/ snapshot de <10k rows; degrada quando snapshot crescer) | `PermutaSnapshotRepository.ts:115-122` |

## 4. Findings (achados)

### F-performance-1: Fan-out Conexos linear por adiantamento, sem batching real (`chunked` recebe arrays de 1)

- **Severidade**: P0 (crítico — quebra o orçamento de chamadas Conexos quando A cresce, escondido por código que parece batched)
- **Tactic violada**: Reduce Overhead + Increase Resource Efficiency
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:168-244`
- **Evidência (objetiva)**:
  ```ts
  // EleicaoPermutasService.ts:168-170 — laço sequencial sobre adto da filial
  for (const adiantamento of adiantamentos) {
      candidatas.push(await this.buildCandidata(adiantamento, filCod));
  }

  // buildCandidata (179-197) — 3 chamadas Conexos por adto, todas com priCods=[1]:
  const valorPermutar = await this.conexosClient.getMnyTitPermutar({ docCod, filCod });          // (1)
  const declaracoes   = await this.conexosClient.listDeclaracaoByProcesso({ priCods: [adto.priCod], filCod }); // (2) — interno chama 2 endpoints (imp019+imp223), cada um chunked com batch=[1]
  const { invoices }  = await this.conexosClient.listFinanceiroAPagar({ priCods: [adto.priCod], docTip: 'INVOICE', filCod }); // (3) — chunked com batch=[1]

  // computeVariacao (252-255) — para elegíveis, +2 chamadas:
  const [titAdto, titInv] = await Promise.all([
      this.conexosClient.listTitulosAPagar({ docCod: adto.docCod, filCod }),
      this.conexosClient.listTitulosAPagar({ docCod: inv.docCod, filCod }),
  ]);
  ```
  `chunked(priCods, CHUNK_SIZE=50)` em `ConexosClient.ts:638` e `:486` recebe `[adto.priCod]` ⇒ produz 1 array de 1 elemento ⇒ batching efetivo zero.
- **Impacto técnico**: chamadas Conexos por run crescem como `O(A)` em vez de `O(A/CHUNK_SIZE)`. Em 200 adiantamentos/mês + 100 elegíveis ⇒ **~800 chamadas Conexos por run**. Como o laço de adiantamentos é sequencial (`await` dentro de `for`), `duracao_run ≈ Σ latencia_conexos` ⇒ se p50=1s por chamada, eleição leva >13 min por run; p95=3s ⇒ ~40 min. Acaba o orçamento de timeout do Express (default 2 min) e qualquer Lambda padrão (15 min).
- **Impacto de negócio**: painel de elegíveis pode chegar **horas** atrasado, ou pior, **não chegar** (timeout); analista vê painel vazio ou stale, retrabalho manual. Tenant Conexos é compartilhado com `fechamento-processos` (mesmo SID/cookie) ⇒ eleição pode rate-limitar/saturar Conexos para o outro produto.
- **Métrica de baseline**:
  - Regime (F=1, A=200, E=100): **802 chamadas Conexos por run**.
  - Multi-filial (F=5, A=400, E=200): **1606 chamadas Conexos por run**.
  - Backlog inicial (F=2, A=1500, E=600): **5703 chamadas Conexos por run** (Yuri precisa rodar o primeiro mês contra todo o histórico, P0-7).

### F-performance-2: Laço de filiais e de adiantamentos sequencial (`await` em `for...of`)

- **Severidade**: P0 (crítico — multiplica latência total pela cardinalidade)
- **Tactic violada**: Increase Concurrency
- **Localização**: `EleicaoPermutasService.ts:74-77, 168-170`
- **Evidência**:
  ```ts
  // 74-77 — F filiais em série
  for (const filial of filiais) {
      const candidatasFilial = await this.processFilial(filial.filCod, flowId);
      candidatas.push(...candidatasFilial);
  }
  // 168-170 — A adiantamentos em série dentro da filial
  for (const adiantamento of adiantamentos) {
      candidatas.push(await this.buildCandidata(adiantamento, filCod));
  }
  ```
- **Impacto técnico**: `duracao_run = F × Σ_filial (latencia_listAdto + A_filial × latencia_buildCandidata)`. Zero paralelismo CPU-bound (Node single-thread, OK), mas zero paralelismo I/O-bound também (que é o gargalo aqui — todas as chamadas são HTTP wait). Bass: classic Increase Concurrency violation.
- **Impacto de negócio**: mesmo arrumando o batching (F-performance-1), sem paralelismo I/O a janela de execução continua linear em A. Eleição de 5 filiais com 40 adto cada NÃO escala em proporção ao número de filiais — escala em proporção ao TOTAL de adtos.
- **Métrica de baseline**: para 200 adto + p50=1s/chamada Conexos, duração serializada ≈ 200 × 4 × 1s = **~13 min**; com `Promise.all` + concorrência=10, ≈ **~80 s**.

### F-performance-3: Cap-hit silencioso em 5 dos 6 fan-outs paginados (`onCapHit` só ligado em `listAdiantamentosProforma`)

- **Severidade**: P1 (alto — truncamento de dados sem sinal observável; afeta correctness + telemetria)
- **Tactic violada**: Bound Execution Times (precisa do flag) + observabilidade da fronteira do cap
- **Localização**: `ConexosClient.ts:1084-1142` (`paginate`), `:594-596` (único `onCapHit` ligado), todos os outros callers (`listFinanceiroAPagar`, `listDeclaracaoByProcesso`, `listFinanceiroAPagarByGerNum`, `listBaixasTitulo`, `listAdiantamentoFinanceiroAPagar`, `listAdiantamentoFinanceiroAReceber`)
- **Evidência**:
  ```ts
  // ConexosClient.ts:1140 — paginate aciona onCapHit?.() apenas se passado
  if (!exhausted) onCapHit?.();
  // ConexosClient.ts:594-596 — listAdiantamentosProforma é o ÚNICO que passa onCapHit:
  onCapHit: () => { capHit = true; }
  ```
- **Impacto técnico**: se um processo Columbia tiver >25k linhas de invoice/D.I (`PAGE_SIZE=500 × MAX_PAGES=50`), o resultado é **silenciosamente truncado**; o caller nunca sabe que há mais. Em listas pequenas (1 priCod por vez, problema raro hoje), risco baixo; com batching real (F-performance-1), 50 priCods × N rows pode encostar no cap em integrações antigas. Sem `BUSINESS_WARN`, fica impossível detectar.
- **Impacto de negócio**: candidata bloqueada por "sem-invoice" quando na verdade o cap cortou a invoice que casava — falso bloqueio, retrabalho manual + perda de confiança no painel.
- **Métrica de baseline**: **5 endpoints** com cap silencioso vs. 1 com `BUSINESS_WARN` ⇒ cobertura 1/6 ≈ 17%.

### F-performance-4: Insert de snapshot 1 round-trip por linha + sem transação

- **Severidade**: P1 (alto — degrada throughput + risco de inconsistência)
- **Tactic violada**: Reduce Overhead + Increase Resource Efficiency (e cross-QA com Fault Tolerance: atomicidade)
- **Localização**: `PermutaSnapshotRepository.ts:90-92, 131-157`
- **Evidência**:
  ```ts
  // 90-92 — N inserts sequenciais
  for (const candidata of candidatas) {
      await this.insertCandidata(runId, candidata);
  }
  ```
  Cada `insertCandidata` é 1 `INSERT ... VALUES ($runId, $docCod, ...)` ⇒ 1 round-trip Postgres por linha. Não há `BEGIN`/`COMMIT` envolvendo cabeçalho + linhas.
- **Impacto técnico**: 200 candidatas ⇒ 201 round-trips Postgres por run. Se pool tem 2 conexões por instância, fica em fila. Mais grave: se o processo cair entre a linha 95 do cabeçalho e o último `insertCandidata`, fica uma run com status='success' mas N linhas vazias — viola a invariante "run completa = 1 cabeçalho + N linhas; run abortada = cabeçalho + 0 linhas" descrita na própria docstring (`PermutaSnapshotRepository.ts:46-47`).
- **Impacto de negócio**: snapshot corrompido ⇒ painel mostra contagem inconsistente; debug retroativo difícil (auditoria O6 perde valor). Throughput de eleição reduzido em ordem de magnitude vs multi-row insert.
- **Métrica de baseline**: **N+1 round-trips** por run de N candidatas. Multi-row insert reduz a `⌈N/M⌉ + 1` (M=500 → 1+1=2 round-trips para N=200).

### F-performance-5: `SELECT ... FROM permuta_candidata_snapshot WHERE run_id` sem `LIMIT` + sem paginação

- **Severidade**: P1 (alto — payload de resposta cresce sem cota)
- **Tactic violada**: Bound Execution Times + Limit Event Response
- **Localização**: `PermutaSnapshotRepository.ts:115-122`, `PainelService.ts:45-69`, `routes/permutas.ts:44-50`
- **Evidência**:
  ```sql
  SELECT run_id, doc_cod, fil_cod, pri_cod, status, motivo_bloqueio,
         aging_days, invoice_doc_cod, variacao_classificacao, variacao_resultado
  FROM permuta_candidata_snapshot
  WHERE run_id = $runId
  ORDER BY (aging_days IS NULL), aging_days DESC, doc_cod ASC
  ```
  Sem `LIMIT $pageSize OFFSET $pageOffset`. `GET /permutas/painel` retorna **todos os items** num único JSON.
- **Impacto técnico**: para snapshot de 5k+ linhas (regime + meses), JSON ≥ 2 MB; serialização Node + parse no browser bloqueiam thread. Express ainda guenta, Lambda API Gateway tem cap de payload de 6 MB e p95 sobe.
- **Impacto de negócio**: painel demora a renderizar; analista trava UI. Quando migrar para Lambda, payload >6 MB **quebra** o endpoint.
- **Métrica de baseline**: para 200 itens, JSON ≈ 80 KB; para 5k itens, ≈ **2 MB** (P95 timeline render ≥ 1s no front).

### F-performance-6: `getMnyTitPermutar` não memoiza por `docCod` na run

- **Severidade**: P2 (médio — débito técnico defensável; baixo impacto nesta fatia mas docstring promete)
- **Tactic violada**: Maintain Multiple Copies of Computations (cache de fan-out)
- **Localização**: `ConexosClient.ts:813-825` (docstring), `:830-858` (implementação)
- **Evidência**:
  ```ts
  // docstring linha 825:
  // "Caller is expected to cache by docCod per execution to avoid redundant calls when the same document is hit multiple times."
  // implementação 830-858: nenhuma memoização — sempre bate o endpoint
  ```
  Nesta fatia, cada adiantamento tem `docCod` único, então o ganho prático é 0. Mas a promessa documental cria uma armadilha: se outro caller (Fatia 2 — execução) reentrar pelo mesmo `docCod`, vai fan-out duplicado.
- **Impacto técnico**: nenhuma redundância hoje; risco quando Fatia 2 reentrar.
- **Impacto de negócio**: baixo hoje; previsível depois.
- **Métrica de baseline**: 0 chamadas duplicadas hoje (medido por construção do laço); risco crescente sem cache.

### F-performance-7: Run de eleição sem timeout total (`AbortController` ausente)

- **Severidade**: P1 (alto — uma run em produção pode prender o processo por minutos)
- **Tactic violada**: Bound Execution Times
- **Localização**: `EleicaoPermutasService.ts:60-152`
- **Evidência**: o método `executar` não recebe `AbortSignal`, não tem `Promise.race` com timer, e o Express monta a rota sem `req.setTimeout`. Único limite efetivo é o cap por endpoint (`MAX_PAGES`). Em Conexos lento + 200 adiantamentos sequenciais, run pode ultrapassar 15 min sem nenhum corte.
- **Impacto técnico**: Express default não interrompe handler em curso; client (browser) recebe 504 do reverse proxy, mas a run continua rodando, eventualmente persiste e o painel "magicamente" atualiza muito depois. Pior na migração p/ Lambda: invocação API Gateway tem timeout de 29s (hard).
- **Impacto de negócio**: usuário aperta "eleição" 2 vezes ⇒ 2 runs concorrentes ⇒ painel pisca/inverte ordem ⇒ analista perde confiança.
- **Métrica de baseline**: timeout total = **∞** hoje (sem AbortController, sem `req.setTimeout`). Alvo: ≤ 10 min total para job, ≤ 25 s para API Gateway endpoint (fanout assíncrono via job + 202 imediato).

### F-performance-8: `listFiliais` resolvido a cada run em vez de uma vez (gap menor, mas latência fixa)

- **Severidade**: P3 (baixo — 1 chamada Conexos por run; trivial)
- **Tactic violada**: Maintain Multiple Copies of Data (cache de configuração)
- **Localização**: `EleicaoPermutasService.ts:72`
- **Evidência**: `listFiliais()` é chamado no início de cada `executar()`. Como filiais mudam raramente, faria sentido cachear (TTL=1h) no singleton `ConexosClient` ou injetar via `EnvironmentProvider`.
- **Impacto técnico**: +1 chamada Conexos por run; +~500 ms se Conexos lento.
- **Impacto de negócio**: marginal; vira P2 se a frequência da eleição subir.
- **Métrica de baseline**: 1 chamada Conexos por run = ~500 ms (p50 estimado, não medido).

## 5. Cards Kanban

### [performance-1] Eliminar N+1 Conexos: batchar lookups por priCod no nível da filial

- **Problema**
  > A eleição faz `getMnyTitPermutar`, `listDeclaracaoByProcesso` e `listFinanceiroAPagar` **por adiantamento** (`for (const adto of adiantamentos)` em `EleicaoPermutasService.ts:168-244`). Os métodos do client já são `chunked(priCods, 50)`, mas o caller passa `priCods=[adto.priCod]`, anulando o batching. Em regime de 200 adto/mês ⇒ ~800 chamadas Conexos por run; com backlog histórico de P0-7 (lista todos sem janela), >5k chamadas no primeiro mês.

- **Melhoria Proposta**
  > Refatorar `processFilial` para coletar `priCodsUnicos` da lista de adiantamentos e fazer **3 chamadas batched por filial** (`listDeclaracaoByProcesso({ priCods, filCod })`, `listFinanceiroAPagar({ priCods, docTip: 'INVOICE', filCod })` e `listFinanceiroAPagarByGerNum` — ou similar — para o detail de `valorPermutar`). Indexar resultados por `priCod` / `docCod` em `Map<string, ...>` antes do laço de `buildCandidata`, que então só lê em memória. Para `getMnyTitPermutar` que é por `docCod` (1 detail per documento), aplicar `Promise.all` com `p-limit(10)`. Tactic Bass: **Reduce Overhead + Increase Resource Efficiency**.

- **Resultado Esperado**
  > Chamadas Conexos por run reduzidas de `1 + F + 4×A + 2×E` (≈ **802 para A=200, F=1, E=100**) para `1 + F × (1 + 2 + 1 + ⌈A/10⌉ × 2)` com concorrência 10 (≈ **~50 chamadas** para A=200). Duração da run de ~13 min para **< 90 s** (com paralelismo + batching).

- **Tactic alvo**: Reduce Overhead, Increase Resource Efficiency
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-performance-1, F-performance-2
- **Métricas de sucesso**:
  - Chamadas Conexos por run (regime A=200, F=1): 802 → ≤ 80
  - Duração da run (assumindo p50=1s/chamada Conexos): ~13 min → ≤ 2 min
  - Cobertura de batching efetivo (priCods.length > 1 em ≥ 80% dos fan-outs): 0% → ≥ 80%
- **Risco de não fazer**: eleição passa de 15 min/run em produção ⇒ timeout Express/Lambda; backlog inicial (P0-7 sem janela) pode literalmente nunca completar.
- **Dependências**: nenhuma técnica; precisa coordenar com Conexos quanto a rate-limit de `com298/list` com `priCod#IN` de 50 elementos (Yuri valida).

### [performance-2] Paralelizar laço de adiantamentos e filiais com `p-limit`

- **Problema**
  > Mesmo após batching (`performance-1`), os laços `for (const filial of filiais)` (linhas 74-77) e `for (const adiantamento of adiantamentos)` (linhas 168-170) usam `await` sequencial dentro do `for...of` ⇒ todas as I/O esperam linearmente. Zero paralelismo apesar de o trabalho ser I/O-bound.

- **Melhoria Proposta**
  > Substituir os dois laços por `Promise.all` com `p-limit` (concorrência 5 para filiais; 10 para adiantamentos dentro da filial — ajustar contra rate-limit Conexos). Manter ordem determinística dos `candidatas` ordenando pós-coleta. Aplicar `AbortController` global p/ não orfanar requests quando o caller (Express/Lambda) cancela. Tactic Bass: **Increase Concurrency**.

- **Resultado Esperado**
  > Duração da run multi-filial cai de `Σ_filial (T_filial)` para `max_filial(T_filial)`; dentro da filial, `A_filial × T_buildCandidata` cai para `T_buildCandidata × ⌈A_filial / 10⌉`. Para F=5, A=200: ~65 min → ~2 min (combinado com `performance-1`).

- **Tactic alvo**: Increase Concurrency
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-2, F-performance-1
- **Métricas de sucesso**:
  - Speedup paralelismo de filiais (F=5): 5× (de Σ → max)
  - Speedup paralelismo de adiantamentos (concorrência 10): 10× no I/O
  - Concorrência efetiva por filial: 1 → 10
- **Risco de não fazer**: combinado com `performance-1` parcial, a eleição continua passando do timeout do API Gateway (29s) quando migrar para Lambda.
- **Dependências**: `performance-1` (faz pouco sentido paralelizar laço que ainda emite N+1).

### [performance-3] Ligar `onCapHit` em todos os fan-outs paginados do `ConexosClient`

- **Problema**
  > `paginate` em `ConexosClient.ts:1084-1142` aceita `onCapHit` mas só `listAdiantamentosProforma` passa (`:594-596`). Outros 5 fan-outs (`listFinanceiroAPagar`, `listDeclaracaoByProcesso`, `listFinanceiroAPagarByGerNum`, `listBaixasTitulo`, `listAdiantamentoFinanceiroAPagar`, `listAdiantamentoFinanceiroAReceber`) podem truncar silenciosamente em `MAX_PAGES × PAGE_SIZE = 25k linhas` sem nenhum log/alarme.

- **Melhoria Proposta**
  > Em vez de propagar `onCapHit` em todos os callers (que poluem cada método), mover a emissão do `BUSINESS_WARN` para dentro do próprio `paginate` (resolver via injetando `LogService` ou retornando `{ rows, capHit, endpoint }` num envelope). Cada caller que LIGA com a possibilidade de cap (i.e., não chamadas detail) recebe o sinal. Tactic Bass: **Bound Execution Times** + telemetria de fronteira.

- **Resultado Esperado**
  > Cobertura de `BUSINESS_WARN` em cap-hit por endpoint paginado: **1/6 → 6/6**. Truncamento silencioso eliminado; alarme CloudWatch (ou agregação de log) consegue ser configurado em cima de `LOG_TYPE.BUSINESS_WARN` + `data.capHit=true`.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Endpoints paginados com `onCapHit` observável: 1/6 → 6/6
  - `# BUSINESS_WARN` esperados por run: hoje 0 (silencioso) → "0 ou 1 com causa rastreável"
- **Risco de não fazer**: dados podem aparecer truncados no painel; analista vê "sem invoice" quando o cap cortou a invoice ⇒ falso positivo de bloqueio.
- **Dependências**: nenhuma.

### [performance-4] Multi-row insert + transação única no `PermutaSnapshotRepository.persistRun`

- **Problema**
  > `persistRun` faz 1 round-trip Postgres por candidata (`for (const candidata of candidatas) { await this.insertCandidata(...) }` em `:90-92`), totalizando `N+1` round-trips por run. Não há `BEGIN`/`COMMIT` cobrindo cabeçalho + linhas ⇒ se cair entre `INSERT permuta_eleicao_run` e o último `insertCandidata`, viola a invariante "run completa = cabeçalho + N linhas" descrita na própria docstring.

- **Melhoria Proposta**
  > Refatorar `persistRun` para abrir uma transação (`databaseClient.transaction(async (tx) => { ... })` se já existir; caso contrário, expor `BEGIN`/`COMMIT` no client) e fazer um `INSERT ... VALUES ($1...$10), ($11...$20), ...` multi-row em chunks de 500. Manter idempotência via `ON CONFLICT (id) DO NOTHING` no cabeçalho. Tactic Bass: **Reduce Overhead** (round-trips) + **Maintain Multiple Copies of Data** (consistência cross-row).

- **Resultado Esperado**
  > Round-trips Postgres por run com N candidatas: `N+1` → `⌈N/500⌉ + 1` (para N=200, 201 → 2). Atomicidade garantida: status='success' ⇔ N linhas presentes.

- **Tactic alvo**: Reduce Overhead, Increase Resource Efficiency
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - Round-trips Postgres por run de N=200: 201 → ≤ 2
  - Tempo de persistência por 200 candidatas (estimado, p50 1ms/round-trip): 200ms → 2ms
  - % de runs com inconsistência cabeçalho/linhas: indeterminado (sem transação) → 0% mensurável
- **Risco de não fazer**: snapshot fica corrompido em falhas parciais; auditoria O6 perde valor probatório; throughput degrada conforme N cresce.
- **Dependências**: cross-QA com Fault Tolerance (atomicidade da run).

### [performance-5] Paginar `GET /permutas/painel` server-side + `LIMIT/OFFSET` no `selectMany`

- **Problema**
  > `findLatestSnapshot` em `PermutaSnapshotRepository.ts:115-122` faz `SELECT ... FROM permuta_candidata_snapshot WHERE run_id = $runId ORDER BY (aging_days IS NULL), aging_days DESC, doc_cod ASC` **sem `LIMIT`**. `PainelService.exporNoPainel` retorna todos os items num único JSON. Em regime + meses, snapshot pode ter 5k+ linhas; payload >2 MB.

- **Melhoria Proposta**
  > Adicionar `page` + `pageSize` (default 100, máx 500) ao `GET /permutas/painel`; aplicar `LIMIT $pageSize OFFSET $offset` no SQL. Retornar `{ totalElegiveis, totalBloqueadas, page, pageSize, items[] }`. Front consome em scroll/paginação. Aplicar o filtro `?status=elegivel` no SQL (não em memória) — exige índice composto `(run_id, status, aging_days DESC)`. Tactic Bass: **Limit Event Response** + **Bound Execution Times**.

- **Resultado Esperado**
  > Tamanho do payload do painel: O(N=5k) → O(pageSize=100) ⇒ JSON de ~2 MB → **~80 KB**. p95 de `GET /permutas/painel` em snapshot de 5k linhas: estimado ~1.5s → **< 200ms**.

- **Tactic alvo**: Limit Event Response, Bound Execution Times
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — inclui mexer no front
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - Payload do `GET /permutas/painel` em snapshot de 5k itens: ~2 MB → ≤ 200 KB (p95)
  - Linhas retornadas por requisição: 5000 → ≤ 500
  - Índice cobrindo `WHERE run_id + ORDER BY aging_days DESC`: ausente → presente
- **Risco de não fazer**: em produção Lambda, payload >6 MB **quebra** API Gateway; em Express, render do front trava UI.
- **Dependências**: cross-QA com Modifiability (frontend deve refletir paginação).

### [performance-6] Timeout total na run de eleição (`AbortController` + Promise.race com timer)

- **Problema**
  > `EleicaoPermutasService.executar` não tem timeout total. Em Conexos lento + N=200 sequencial, run roda >15 min sem corte. Express libera 504 do reverse proxy mas o handler continua, potencialmente persistindo run muito depois.

- **Melhoria Proposta**
  > Passar `AbortSignal` opcional para `executar({ triggeredBy, signal? })`. Encadear `signal.aborted` nos `await` (`fetch`/axios já honram `AbortSignal`). Quando rodando via Express, `req.setTimeout(10 * 60 * 1000)`; quando alvo Lambda, alinhado ao timeout da função. Persist run com `status='partial'` ao abortar. Tactic Bass: **Bound Execution Times**.

- **Resultado Esperado**
  > Eleição NUNCA roda além de 10 min (configurável); ao cancelar, run fica `status='partial'` com snapshot dos candidatos já processados e `BUSINESS_WARN`. p99 da run: ∞ → ≤ 10 min.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-7
- **Métricas de sucesso**:
  - Timeout total da run: ∞ → 600 s (configurável)
  - % de runs órfãs (status='success' mas tempo > timeout): indeterminado → 0
- **Risco de não fazer**: quando migrar para Lambda API Gateway (timeout 29 s), eleição **nunca completa via síncrono** ⇒ obriga refator emergencial.
- **Dependências**: parcialmente coberto por `performance-1` + `performance-2` (que cortam o tempo a < 2 min em primeiro lugar).

### [performance-7] Memoizar `getMnyTitPermutar` por `docCod` no escopo da run

- **Problema**
  > A docstring de `getMnyTitPermutar` em `ConexosClient.ts:813-825` explicitamente promete "Caller is expected to cache by docCod per execution to avoid redundant calls when the same document is hit multiple times". A implementação NÃO cacheia. Nesta fatia, cada adiantamento tem `docCod` único ⇒ ganho prático 0. Mas Fatia 2 (execução de permutas) reentrará pelos mesmos `docCod` e essa promessa não cumprida vira fan-out duplicado.

- **Melhoria Proposta**
  > Adicionar cache leve in-memory por `docCod` dentro do `ConexosClient` (singleton) com TTL=60s (run típica < 5 min ⇒ TTL curto suficiente; defesa anti-stampede). Alternativa: passar `cache: Map<string, number | undefined>` opcional como parâmetro (deixa explícito). Tactic Bass: **Maintain Multiple Copies of Computations**.

- **Resultado Esperado**
  > Promessa documental honrada; chamadas duplicadas eliminadas quando Fatia 2 reentrar. Nesta fatia: 0 chamadas duplicadas (já é o caso); risco zerado para Fatia 2.

- **Tactic alvo**: Maintain Multiple Copies of Computations
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - Cache hit rate em cenário Fatia 2 (reentrância): 0% → ≥ 80%
  - Promessa docstring vs implementação: divergente → alinhada
- **Risco de não fazer**: Fatia 2 paga 2× o custo de detail Conexos; debug confuso (docstring engana).
- **Dependências**: nenhuma; pode ir junto com `performance-1`.

### [performance-8] Cachear `listFiliais` no `ConexosClient` (TTL 1h)

- **Problema**
  > `EleicaoPermutasService.ts:72` chama `this.conexosClient.listFiliais()` a cada `executar`. Filiais raramente mudam (semanas/meses) ⇒ chamada Conexos paga por run desnecessariamente.

- **Melhoria Proposta**
  > Cachear `listFiliais()` no singleton `ConexosClient` com TTL 1h (in-memory `Map<empty,{rows, ts}>`). Tactic Bass: **Maintain Multiple Copies of Data**.

- **Resultado Esperado**
  > 1 chamada Conexos a menos por run (de ~801 → ~800 sem outras melhorias; combinada com `performance-1`, mais relevante: ~50 → ~49). Latência percebida no painel não muda; cumulativo importa quando runs ficam frequentes (cron diário).

- **Tactic alvo**: Maintain Multiple Copies of Data
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-8
- **Métricas de sucesso**:
  - Chamadas Conexos a `getFiliais` por run: 1 → 0 (≥ 99% das runs após primeiro warm-up)
- **Risco de não fazer**: marginal; sobe quando frequência da eleição sobe.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Em modo `--quick` (sem benchmark real) optei por **derivar fan-out por análise estática de `EleicaoPermutasService` + `ConexosClient`** e produzir uma **fórmula contável** (não estimativa de runtime). Marquei latência real e p95 como **não-medíveis** — recomendo, no Fatia 2 ou no primeiro deploy em dev, instrumentar `RetryExecutor` para emitir EMF metrics por endpoint Conexos e ligar alarme em `conexos.endpoint.latency.p95`.
- O cap silencioso (`MAX_PAGES=50 × PAGE_SIZE=500`) é a interseção mais óbvia com **Fault Tolerance** (truncamento ≈ falha silenciosa) e com **Modifiability** (a refatoração do `paginate` para emitir `BUSINESS_WARN` é pequena mas afeta todos os callers — coordenar com qa-modifiability).
- A ausência de transação em `persistRun` é prioritariamente **Fault Tolerance** (atomicidade), mas afeta Performance no mesmo loop (round-trip por linha) ⇒ tratei no card `performance-4` para evitar bifurcar.
- Cross-QA com **Availability/Fault Tolerance**: F-performance-7 (timeout total) e F-performance-3 (cap silencioso) precisam aparecer também no qa-availability — sinalizar para o consolidator.
- Cross-QA com **Modifiability**: F-performance-5 (paginação no painel) impacta o contrato HTTP do `GET /permutas/painel` ⇒ schema deve ser versionado antes de mudar; coordenar com Integrability.
