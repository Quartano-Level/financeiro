---
qa: Performance
qa_slug: performance
run_id: 2026-06-24-2011
agent: qa-performance
generated_at: 2026-06-24T20:11:00-03:00
scope: backend
score: 5
findings_count: 7
cards_count: 7
---

# Performance — Regis-Review

Escopo: PR v0.7.0 (`feat(permutas): cliente, universo de invoices, ciclo de borderô e cache`). Foco
nas três mudanças que estressam latência/throughput: (a) hidratação com308+imp021 para o **universo
completo** de invoices na ingestão; (b) cache local `permuta_bordero` para o painel de borderôs;
(c) `GET /permutas/status` lazy + reclassificação manual em memória no `/gestao`.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Cron / botão "Atualizar ingestão" (analista) | Run de ingestão diária precisa hidratar com308+imp021 para ~1.875 invoices finalizadas (universo completo, não só ~126 casadas) | `EleicaoPermutasService.computeCandidatas` + `processFilial` + `BorderoGestaoService.refreshCache` | Express/Render normal; Conexos com `LOGIN_ERROR_MAX_SESSIONS` | Concluir a ingestão sem estourar sessão Conexos e sem exceder o lock manual (`IngestLockBusyError`) | p50 ingestão ≤ 60s, p95 ≤ 120s; 0 falhas `MAX_SESSIONS` em 30 dias; medido HOJE: **~65s** com 1875 invoices |
| Analista (browser) | Abre a aba Borderôs (cold) ou troca de aba (warm) | `GET /permutas/borderos` → `BorderoGestaoService.listarBorderos` → 2 SELECT no Postgres Supabase remoto (`permuta_bordero` + `listComBordero`) | Express/Render normal | Pintar a tela em < 500ms warm / < 1s cold | warm ≤ 500ms (medido **0,47s ✅**), cold ≤ 1000ms (medido **0,83s ⚠️ no limite**) |
| Analista (browser) | Carrega a tela /permutas/gestao | `GET /permutas/gestao` → `GestaoPermutasService.exporGestao` (8 queries paralelas + montagem em memória sobre 515 adtos × 1875 invoices) + payload JSON | Express/Render normal | Resposta + parse front em < 1.5s | p95 ≤ 1.5s; payload ≤ 1.5MB; **NÃO medido nesta sessão — ver F-performance-3** |
| Cron diário | Ingestão repete `refreshCache` (borderôs por filial, pageSize=1000) DEPOIS do compute pesado | `BorderoGestaoService.refreshCache` dentro de `IngestaoPermutasService.executar` | Express/Render normal | Refresh do cache não estende o lock | refresh isolado ≤ 5s; falha aqui não trava ingestão (já é best-effort ✅) |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Latência ingestão (1875 invoices hidratadas) | **~65s** (medido nesta sessão) | p95 ≤ 90s | ⚠️ | Sessão de medição (telemetria local) |
| Número de `listTitulosAPagar` (com308) por run | **≥ 1875** (uma por invoice hidratada) + ~515 adtos = **~2390 chamadas Conexos sequenciais-por-pool** | ≤ 600 (manter só as casadas + adtos) ou batch endpoint | ❌ | `EleicaoPermutasService.ts:494-526, 541-567` |
| Número de `listProcessos` (imp021) por run | **8 filiais × 1** (batched por priCods) — OK na granularidade | manter | ✅ | `EleicaoPermutasService.ts:272-275` |
| Concorrência fan-out (`ADIANTAMENTOS_CONCURRENCY`) | 10 | sintonizado p/ MAX_SESSIONS Conexos | ✅ | `EleicaoPermutasService.ts:88` |
| Concorrência filiais (`FILIAIS_CONCURRENCY`) | 5 | OK | ✅ | `EleicaoPermutasService.ts:87` |
| SELECT cache borderôs Supabase remoto (4008 linhas, sem LIMIT) | **1,26s** | ≤ 300ms | ❌ | medição manual nesta sessão |
| SELECT cache borderôs Supabase remoto (LIMIT 500) | **~0,3s** | ≤ 300ms | ✅ | medição manual nesta sessão |
| `GET /permutas/borderos` (warm, com memo 30s no front) | **0,47s** | ≤ 500ms | ✅ | medição manual nesta sessão |
| `GET /permutas/borderos` (cold, 2 round-trips Supabase × ~250ms RTT) | **0,83s** | ≤ 1000ms | ⚠️ | medição manual nesta sessão |
| `listComBordero` (trilha — sem WHERE em `bor_cod IS NOT NULL` com índice) | **287ms** | ≤ 100ms | ⚠️ | medição manual nesta sessão |
| Round-trips Supabase por carga de /borderos (cold) | **2** (`listBorderoCache` + `listComBordero`) | 1 (consolidar via CTE ou join) | ⚠️ | `BorderoGestaoService.ts:324-332` |
| Memo TTL no front (BorderosPanel) | 30s | OK p/ trocas de aba; falta SWR-style stale-while-revalidate | ✅ | `src/frontend/lib/api.ts:272-292` |
| `GestaoPermutasService.exporGestao` — queries paralelas | 7 (Promise.all) | OK | ✅ | `GestaoPermutasService.ts:46-62` |
| Reclassificação manual em memória (`adtosQueUltrapassamInvoice`) | O(N adtos × M invoices) por GET | O(N+M) já é (1 pass) | ✅ | `GestaoPermutasService.ts:219-251` |
| `autoElegivel` cálculo dentro de `toPendente` | O(invoices do priCod) por adto → **O(N × M_pricod)** | OK em escala atual | ✅ | `GestaoPermutasService.ts:326-335` |
| Payload `/permutas/gestao` (1875 invoices + 515 adtos) | **NÃO MEDIDO** (sem produção) | ≤ 1.5MB gzip | ⚠️ | grep no payload (`pendentes` + `invoicesEmAberto`) |
| Índice em `permuta_alocacao_execucao(bor_cod)` | **AUSENTE** (existe só em `adiantamento_doc_cod`, `status`) | índice parcial `WHERE bor_cod IS NOT NULL` | ❌ | `migrations/0015_*.sql:38-41` |
| Índice em `permuta_bordero(bor_dta_mvto DESC, bor_cod DESC)` | **AUSENTE** (tabela criada sem nenhum índice secundário além do PK) | índice composto p/ o ORDER BY | ❌ | `migrations/0018_permuta_bordero_cache.sql` |
| Cold start budget | N/A (Express monolito no Render — não é Lambda) | — | N/A | CLAUDE.md / arch atual |

> ⚠️ **Não medível localmente**: P95 do `/gestao` e tamanho real do payload. Requer prod (Render
> metrics + Sentry transactions). Recomendação: adicionar `Server-Timing` + `Content-Length` log no
> `asyncHandler` da rota `/gestao` para colher em uma semana de operação.

## 3. Tactics — Cobertura no nf-projects

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | Ingestão = batch diário (cron) + manual coalescido via `IngestaoCoalescerService` | ✅ presente | `IngestaoPermutasService.ts:67-69`, ADR-0012 |
| Limit Event Response | `heavyRouteLimiter` em todas as rotas que disparam fan-out Conexos (`/eleicao`, `/ingestao`, `/reconciliar`, `/borderos/:borCod/*`) | ✅ presente | `routes/permutas.ts:131,166,400,455,477,499,521,544,567` |
| Prioritize Events | `GET /permutas/status` é LAZY (carrega depois do `/gestao`) — desacopla o status vivo do ERP do payload principal | ✅ presente | `routes/permutas.ts:600-607`; `GestaoPermutasService` não chama Conexos |
| Reduce Overhead | Memo 30s do `/borderos` no front evita re-fetch ao trocar abas; cache `permuta_bordero` evita N filiais × `listBorderos` no ERP por load | ✅ presente (parcial — sem `If-None-Match`/ETag) | `lib/api.ts:272-292`, `BorderoGestaoService.ts:317-378` |
| Bound Execution Times | Conexos client tem `RetryExecutor` + (presumido) timeout no axios — não confirmado nesta seção | ⚠️ parcial | `EleicaoPermutasService.ts:631-652` trata `ConexosError` mas não há timeout explícito por chamada hidratante |
| Increase Resource Efficiency | (a) Fan-out batched (priCods → 1 chamada por filial); (b) **HOJE: regrediu** — universo completo dispara 1 com308/invoice (1875×) sem batching equivalente | ⚠️ parcial (regressão) | `EleicaoPermutasService.ts:265-294` (novo loop), vs. 422-446 (batched antigo) |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | Render plan (vertical scale manual); pool Postgres tamanho default | ⚠️ parcial | sem documentação de pool size + nº instâncias |
| Increase Concurrency | `BoundedConcurrency` com FILIAIS=5, ADTOS=10 | ✅ presente | `EleicaoPermutasService.ts:87-88` |
| Maintain Multiple Copies of Computations | N/A — uma instância Render | N/A | sem clusters |
| Maintain Multiple Copies of Data | Cache `permuta_bordero` (cópia local do ERP); memo 30s no front (cópia front do backend) | ✅ presente | `migrations/0018_*.sql`, `lib/api.ts:272-292` |
| Bound Queue Sizes | `listBorderoCache` aplica `LIMIT 500` por default; `BorderosPanel` pagina 50/página | ✅ presente | `PermutaExecucaoRepository.ts:305-329`, `BorderosPanel.tsx:166-169` |
| Schedule Resources | `BoundedConcurrency.map` faz round-robin; `Promise.all` no `exporGestao` paraleliza as 7 reads | ✅ presente | `GestaoPermutasService.ts:46-62`, `EleicaoPermutasService.ts:249-259` |

## 4. Findings (achados)

### F-performance-1: regressão de N+1 na hidratação do universo completo de invoices (com308 × 1875)

- **Severidade**: P1 (alto — degrada o SLA da janela de ingestão diária e flerta com `MAX_SESSIONS` do Conexos)
- **Tactic violada**: Increase Resource Efficiency · Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:265-294, 541-567` (novo bloco) e `:481-534` (variante batched ainda existente para invoices CASADAS)
- **Evidência (objetiva)**:
  ```ts
  // EleicaoPermutasService.ts:265-294 — UMA invoice por chamada com308
  const hidratadas = await this.boundedConcurrency.map(
      invoices,                                   // 1875 invoices
      (inv) => this.hidratarInvoiceNegociada(inv, filial.filCod),
      ADIANTAMENTOS_CONCURRENCY,                  // 10 em paralelo
  );
  // hidratarInvoiceNegociada (:556) → 1× listTitulosAPagar({ docCod, filCod }) por invoice
  ```
  Antes deste PR: hidratação só das ~126 casadas + adtos (~ 250 chamadas). Agora: ~1875 invoices +
  ~515 adtos = **~2390 chamadas com308**, todas estritamente serializadas pelo pool de 10. Medido:
  **~65s** de ingestão. Comparativo: 250 chamadas × ~250ms / 10 ≈ 6s; 2390 × ~250ms / 10 ≈ 60s ✅
  bate o que a telemetria viu.
- **Impacto técnico**: cada invoice adicionada cresce linearmente o tempo da ingestão e o risco
  de bater o `LOGIN_ERROR_MAX_SESSIONS`. A semente cresce com o backlog histórico (Columbia gera N
  invoices/dia que NÃO viram permuta — ficam para sempre no universo). Em 6 meses, 3000 invoices
  é plausível → ~100s + maior chance de retry storm.
- **Impacto de negócio**: ingestão estoura janela de 1min reservada no cron; analista vê o modal
  "ingestão em andamento" mais tempo; pior caso aborta com `MAX_SESSIONS` e a tela `/gestao` serve
  dado stale. Cliente reclamou ANTES desse PR sobre demora similar (cenário Adriana).
- **Métrica de baseline**: **65s** com 1875 invoices · ~2390 chamadas Conexos · pool=10.

### F-performance-2: `permuta_bordero` recém-criada sem índice secundário para o ORDER BY do hot path

- **Severidade**: P1 (alto — cresce conforme borderôs históricos; já a 4008 linhas demora 1,26s sem LIMIT, e o LIMIT 500 NÃO usa índice no ORDER BY)
- **Tactic violada**: Increase Resource Efficiency (índices)
- **Localização**: `src/backend/migrations/0018_permuta_bordero_cache.sql:6-15` (tabela sem índice secundário)
  + `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:305-329` (`listBorderoCache`)
- **Evidência (objetiva)**:
  ```sql
  -- migration 0018 (toda)
  CREATE TABLE IF NOT EXISTS permuta_bordero (
      bor_cod  INTEGER PRIMARY KEY,
      ...
      bor_dta_mvto BIGINT,
      ...
  );
  -- ZERO índice secundário criado.
  -- E a query principal faz:
  --   ORDER BY bor_dta_mvto DESC NULLS LAST, bor_cod DESC LIMIT 500
  -- → table scan + sort em RAM (4008 rows hoje).
  ```
  Medido: **SELECT (sem LIMIT) = 1,26s; com LIMIT 500 = ~0,3s** (Postgres usa heap scan + top-K em
  memória; sort cabe nos 4008 rows; quando dobrar a 8k, dobra o tempo).
- **Impacto técnico**: o LIMIT 500 mascarou o problema HOJE, mas a query continua fazendo seq scan
  + sort. Em 10k–20k linhas (1 ano de operação), o LIMIT 500 vai começar a degradar para 600–800ms
  só na query, sem contar RTT.
- **Impacto de negócio**: aba Borderôs hoje carrega em 0,83s cold (já no teto do alvo); sem o índice,
  vira ≥ 1,5s em 6–12 meses. Analista pinga "tá lento" → erosão de confiança.
- **Métrica de baseline**: `permuta_bordero` = 4008 rows, ORDER BY sem índice = 0 seeks; query atual
  varre tudo e ordena.

### F-performance-3: payload do `/permutas/gestao` cresceu silenciosamente — ~2.4k itens sem compressão/instrumentação medida

- **Severidade**: P2 (médio — não medível agora, mas a porta de entrada multiplicou ~15× o universo de invoices)
- **Tactic violada**: Reduce Overhead · Limit Event Response
- **Localização**: `src/backend/domain/service/permutas/GestaoPermutasService.ts:138-142, 192-209`
  + `src/backend/routes/permutas.ts:355-363`
- **Evidência (objetiva)**:
  ```ts
  // GestaoPermutasService.ts:138-142 — toda invoice em aberto vira linha no payload
  const invoicesEmAberto = invoices.map((i) =>
      this.toInvoiceEmAberto(i, i.importador ?? importadorByPriCod.get(i.priCod)),
  );
  // antes do PR: ~126 invoices; agora: ~1875 (universo completo)
  ```
  Cada `InvoiceEmAberto` carrega ~12 campos string/number + 2 datas. Estimativa conservadora:
  500–700 bytes JSON por item → **~1.0–1.3 MB** para 1875 invoices + ~300KB para 515 pendentes.
  Sem `compression` middleware confirmado na rota, e SEM `Server-Timing`/`Content-Length` instrumentado
  para acompanhar.
- **Impacto técnico**: payload grande aumenta TTFB + parse no navegador; transit Render→Vercel
  passa por borda Cloudflare (já gzip) mas a CPU do parse no cliente é linear no tamanho.
- **Impacto de negócio**: tela fica visivelmente mais pesada em conexões 3G/4G de analista em
  mobilidade (não é o caso hoje — Columbia é desktop — mas é a defesa futura).
- **Métrica de baseline**: payload **não medido** — declarada falta de instrumentação como dívida.

### F-performance-4: `/permutas/borderos` faz 2 round-trips Supabase remotos em série (cold path)

- **Severidade**: P2 (médio — 250ms RTT × 2 = 500ms só de rede; explica a diferença warm/cold)
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:317-378`
- **Evidência (objetiva)**:
  ```ts
  // BorderoGestaoService.ts:324 e :332 — SEQUENCIAIS (await/await)
  let cache = await this.execucaoRepository.listBorderoCache(limit);
  // ...
  for (const r of await this.execucaoRepository.listComBordero()) { ... }
  ```
  As duas leituras são independentes — poderiam ser `Promise.all`. Hoje cold = 0,83s; warm = 0,47s
  (a diferença de ~360ms = 1 RTT a mais).
- **Impacto técnico**: latência somada desnecessariamente.
- **Impacto de negócio**: limita capacidade de espremer `/borderos` para < 500ms cold.
- **Métrica de baseline**: 0,83s cold vs 0,47s warm = +360ms só de serialização das 2 queries.

### F-performance-5: `listComBordero` sem índice em `bor_cod IS NOT NULL`

- **Severidade**: P2 (médio — 287ms HOJE com poucas centenas de linhas na trilha; cresce com volume de execuções)
- **Tactic violada**: Increase Resource Efficiency (índices)
- **Localização**: `src/backend/migrations/0015_permuta_alocacao_execucao.sql:38-41`
  + `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:94-104`
- **Evidência (objetiva)**:
  ```sql
  -- migration 0015 cria índices em (adiantamento_doc_cod) e (status), mas NÃO em bor_cod.
  -- A query nova chamada por /borderos e /status:
  --   SELECT ... FROM permuta_alocacao_execucao WHERE bor_cod IS NOT NULL ORDER BY bor_cod DESC, criado_em
  ```
  Plano executado: seq scan + filter + sort. Medido: **287ms** — chamado DUAS vezes por
  `listarBorderos` (uma direta + uma para o map por borCod). Quase 600ms acumulados no cold path.
- **Impacto técnico**: `/status` (lazy) também consome essa query → atrasa o badge "aguardando
  finalização" que aparece DEPOIS do `/gestao`.
- **Impacto de negócio**: badges de status vivos aparecem com delay perceptível; cresce com volume
  de execuções históricas (cada permuta executada acrescenta linha que não será purgada).
- **Métrica de baseline**: 287ms hoje; expectativa com índice parcial: ≤ 30ms.

### F-performance-6: ausência de instrumentação `Server-Timing` na rota `/gestao` impede observabilidade da janela quente

- **Severidade**: P2 (médio — necessário para defender SLOs em prod sem refazer medições manuais)
- **Tactic violada**: Bound Execution Times (sem trace, não há como provar bound)
- **Localização**: `src/backend/routes/permutas.ts:355-363`
- **Evidência (objetiva)**:
  ```ts
  router.get('/gestao', asyncHandler(async (req, res) => {
      ...
      const gestao = await service.exporGestao(req.requestId);
      res.json(gestao);  // sem Server-Timing, sem Content-Length log
  }));
  ```
- **Impacto técnico**: para validar Cards 1/2/3 em prod, vamos depender de Sentry traces ad-hoc.
- **Impacto de negócio**: cada otimização vira "acho que melhorou" em vez de "p95 caiu de X para Y".
- **Métrica de baseline**: 0% das rotas /permutas/* têm `Server-Timing`.

### F-performance-7: `refreshCache` chamado dentro da ingestão DEPOIS do compute já estendeu lock (best-effort, mas oportuno)

- **Severidade**: P3 (baixo — já é best-effort; oportunidade de paralelizar antes do COMMIT)
- **Tactic violada**: Schedule Resources (sequenciação subótima)
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:138-147`
- **Evidência (objetiva)**:
  ```ts
  // IngestaoPermutasService.ts:139-147 — DEPOIS do persistRun
  try {
      await this.borderoGestaoService.refreshCache();
  } catch (err) { ... }  // best-effort ✅
  ```
  `refreshCache` faz N filiais × `listBorderos pageSize=1000` em paralelo — mais um round-trip ao
  ERP somado ao tempo total da ingestão. Como o lock `INGEST_LOCK_KEY` já foi LIBERADO (estamos
  fora do `withTransaction`), o impacto é menor — mas o usuário no modal aguarda o response final.
- **Impacto técnico**: alonga em 2–5s o tempo total observado pelo analista que clicou "Atualizar".
- **Impacto de negócio**: percepção de lentidão "ingestão demorou X, mas ainda fica girando".
- **Métrica de baseline**: refresh não isolado da medição — sugiro instrumentar separado.

## 5. Cards Kanban

### [performance-1] Reduzir o fan-out com308 do universo completo (~1875 → ≤ 600 chamadas/run)

- **Problema**
  > A ingestão agora hidrata `valorMoedaNegociada/moedaNegociada/taxa` (com308) para TODAS as invoices
  > finalizadas do ERP (~1875), não só as ~126 casadas. Mede em ~65s, e cresce linear no backlog.
  > Em 6 meses (>3k invoices) a ingestão estoura a janela do cron e arrisca `MAX_SESSIONS` Conexos.

- **Melhoria Proposta**
  > Três caminhos, em ordem de menor → maior esforço:
  > 1. **Hidratar só o delta**: só chamar `listTitulosAPagar` para invoices NOVAS (não vistas no run
  >    anterior — comparar `last_seen_at`/hash) ou QUE MUDARAM. As já hidratadas reusam o valor do
  >    banco. Implementar em `EleicaoPermutasService.hidratarInvoiceNegociada` + nova query no
  >    `PermutaRelationalRepository.findInvoicesByDocCods`.
  > 2. **Hidratar lazy** (preferido se Conexos não der batch): a tela `/gestao` mostra "—" para
  >    moeda negociada das invoices NÃO casadas + botão "Buscar valor" on-demand; o universo
  >    completo segue na lista, mas o hidratante só roda no clique.
  > 3. **Batch endpoint**: investigar se o Conexos tem variante `com308/list` que aceita N docCods
  >    de uma vez (já existe pelo menos para `com298` via priCods).
  > Tactics: Reduce Overhead, Increase Resource Efficiency.

- **Resultado Esperado**
  > Ingestão p95 cai para ≤ 25s; nº de `listTitulosAPagar` por run cai de ~2390 para ≤ 600 em
  > regime estacionário (só novas + as casadas + os adtos).

- **Tactic alvo**: Increase Resource Efficiency · Reduce Overhead
- **Severidade**: P1
- **Esforço estimado**: M (2–5d, opção 1) · L (1–2sem, opção 2 com UI)
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - Duração ingestão p95: 65s → ≤ 25s
  - Chamadas com308/run em regime estacionário: ~2390 → ≤ 600
  - Falhas `MAX_SESSIONS` em 30d: 0 → 0 (manter)
- **Risco de não fazer**: em ≤ 6 meses, ingestão > 2min, modal "girando" perceptível, e potencial
  retry storm Conexos em pico (ex.: 10 analistas clicam "Atualizar" simultâneo).
- **Dependências**: opção 3 requer descoberta no Conexos (1h de tentativa).

### [performance-2] Criar índice em `permuta_bordero(bor_dta_mvto DESC, bor_cod DESC)` (migration 0019)

- **Problema**
  > A tabela `permuta_bordero` (recém-criada em 0018) NÃO tem índice secundário e a única query
  > de leitura faz `ORDER BY bor_dta_mvto DESC, bor_cod DESC LIMIT 500`. HOJE: 4008 rows = ~0,3s
  > (seq scan + top-K em memória). Em 12 meses (~15k rows): degrada para ≥ 800ms só na query.

- **Melhoria Proposta**
  > Adicionar `migrations/0019_permuta_bordero_index.sql`:
  > ```sql
  > CREATE INDEX IF NOT EXISTS idx_permuta_bordero_recentes
  >     ON permuta_bordero (bor_dta_mvto DESC NULLS LAST, bor_cod DESC);
  > ```
  > Postgres pode usar index-only scan + LIMIT 500 → retorna sem ler heap.

- **Resultado Esperado**
  > `listBorderoCache(500)` cai de ~0,3s para ≤ 30ms. `/permutas/borderos` cold cai de 0,83s para
  > ≤ 500ms.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d — migration + EXPLAIN)
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - `listBorderoCache(500)` Supabase remoto: ~300ms → ≤ 50ms
  - `/permutas/borderos` cold: 0,83s → ≤ 500ms
- **Risco de não fazer**: degradação linear no volume; "aba lenta" recorrente em 6–12 meses.
- **Dependências**: nenhuma.

### [performance-3] Paralelizar as 2 leituras do `BorderoGestaoService.listarBorderos`

- **Problema**
  > `listarBorderos` faz `listBorderoCache` e `listComBordero` SEQUENCIAIS no Postgres remoto (RTT
  > ~250ms × 2 = 500ms a mais que o mínimo). Medido: 0,83s cold vs 0,47s warm — o delta bate o RTT
  > extra.

- **Melhoria Proposta**
  > Trocar para `Promise.all([listBorderoCache, listComBordero])` em `BorderoGestaoService.ts:324-332`.
  > Pequeno cuidado: o `if (cache.length === 0 && !opts?.live)` precisa virar uma reavaliação após
  > as duas resolverem (manter o refresh-on-empty).

- **Resultado Esperado**
  > `/permutas/borderos` cold cai de 0,83s para ~580ms (1 RTT + 1 max(query)). Combinado com Card 2,
  > cai para ≤ 400ms.

- **Tactic alvo**: Reduce Overhead · Schedule Resources
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1h)
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - `/permutas/borderos` cold: 0,83s → ≤ 580ms (sem Card 2) ou ≤ 400ms (com Card 2)
- **Risco de não fazer**: usuário sente delay desnecessário ao trocar de aba pela primeira vez.
- **Dependências**: nenhuma (mas combina bem com Card 2).

### [performance-4] Índice parcial em `permuta_alocacao_execucao(bor_cod) WHERE bor_cod IS NOT NULL`

- **Problema**
  > `PermutaExecucaoRepository.listComBordero` faz `WHERE bor_cod IS NOT NULL ORDER BY bor_cod DESC,
  > criado_em` sem índice. Medido: 287ms hoje; chamado DUAS vezes em `/borderos` + uma em `/status`.

- **Melhoria Proposta**
  > Adicionar à migration 0019 (ou nova 0020):
  > ```sql
  > CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_borcod_partial
  >     ON permuta_alocacao_execucao (bor_cod DESC, criado_em)
  >     WHERE bor_cod IS NOT NULL;
  > ```
  > Bonus: avaliar memo no `BorderoGestaoService` para que `listarBorderos` e `statusPorAdiantamento`
  > chamadas no mesmo request reusem o resultado (escopo de request).

- **Resultado Esperado**
  > `listComBordero` cai de 287ms para ≤ 30ms. `/permutas/status` (lazy) responde em < 100ms.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d com EXPLAIN antes/depois)
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - `listComBordero` Supabase remoto: 287ms → ≤ 30ms
  - `/permutas/status` total: NÃO medido → ≤ 200ms (com Card 5)
- **Risco de não fazer**: cresce linear com histórico de execuções; em 1 ano (~10k linhas) chega
  a > 1s a query.
- **Dependências**: nenhuma.

### [performance-5] Instrumentar `Server-Timing` + log de payload size nas rotas `/permutas/*`

- **Problema**
  > Não há instrumentação de latência por sub-fase (DB vs Conexos vs serialização) nem do tamanho
  > do payload de `/gestao` (~1.0–1.3MB estimado). Otimizações futuras viram chute.

- **Melhoria Proposta**
  > Em `src/backend/http/asyncHandler.ts` (ou middleware dedicado), envolver com `performance.now()`
  > antes/depois e gravar `Server-Timing: db;dur=X, conexos;dur=Y, total;dur=Z`. Também logar
  > `res.getHeader('content-length')` ao final. Subir para Sentry como tag/measurement.

- **Resultado Esperado**
  > Visibilidade p50/p95 por rota em produção; cada card seguinte tem baseline objetivo.

- **Tactic alvo**: Bound Execution Times (observabilidade habilita)
- **Severidade**: P2
- **Esforço estimado**: S (1d — instrumentação + ajuste no Sentry)
- **Findings relacionados**: F-performance-3, F-performance-6, F-performance-7
- **Métricas de sucesso**:
  - % rotas /permutas com Server-Timing: 0 → 100%
  - Existe dashboard com p95 por rota em 30 dias.
- **Risco de não fazer**: cada nova otimização vira anedota.
- **Dependências**: combina com qa-availability (mesma infra de observabilidade).

### [performance-6] Paginar/streamar `invoicesEmAberto` no `/permutas/gestao`

- **Problema**
  > Payload de `/gestao` carrega TODAS as 1875 invoices em aberto a cada GET. A tela só renderiza
  > o que cabe na viewport + filtros do usuário. Estimativa: 1.0–1.3MB → parse na CPU do cliente.

- **Melhoria Proposta**
  > Curto prazo: adicionar query param `?invoiceLimit=N` (default 500) ao endpoint, devolver
  > `invoicesEmAberto` paginadas + `totalInvoices` total. Front pede mais ao filtrar/buscar.
  > Médio prazo: endpoint dedicado `/permutas/invoices?search=...&priCod=...` lazy, removendo
  > `invoicesEmAberto` do payload principal.
  > Tactic: Limit Event Response.

- **Resultado Esperado**
  > Payload `/gestao` cai de ~1.2MB para ~400KB; parse front cai de ~50ms para ~15ms (estimativa).

- **Tactic alvo**: Limit Event Response · Reduce Overhead
- **Severidade**: P2
- **Esforço estimado**: M (2–4d incluindo refactor do front)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Tamanho do payload /gestao p95: ~1.2MB → ≤ 400KB
  - TTFB /gestao p95: NÃO MEDIDO → ≤ 800ms (após Card 5 instrumentar)
- **Risco de não fazer**: payload cresce linearmente com o backlog; em 1 ano arrisca ≥ 2.5MB.
- **Dependências**: Card 5 (instrumentação) — não bloqueia, mas valida.

### [performance-7] Stale-while-revalidate para `/permutas/borderos` (memo curto → SWR)

- **Problema**
  > Memo simples de 30s no front: depois de 30s, ao trocar de aba o usuário aguarda fresh fetch
  > (~0,83s cold). UX poderia mostrar imediatamente o stale e revalidar em background.

- **Melhoria Proposta**
  > Substituir o memo no `src/frontend/lib/api.ts:272-292` por padrão SWR (`useSWR` ou similar
  > caseiro): retornar `borderosMemo.data` mesmo expirado, disparar fetch em background, atualizar
  > o estado quando voltar. Ou plugar `swr`/`@tanstack/react-query` (já é grande para introduzir
  > só por isso — preferir manual).

- **Resultado Esperado**
  > Reabertura de aba percebida sempre instantânea (< 50ms) mesmo após o memo expirar; freshness
  > mantida pela revalidação em background.

- **Tactic alvo**: Maintain Multiple Copies of Data · Reduce Overhead
- **Severidade**: P3
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-4 (complementar)
- **Métricas de sucesso**:
  - Latência percebida ao reabrir aba: 0,47s → ≤ 50ms (paint imediato com stale)
- **Risco de não fazer**: micro-UX. Sem impacto operacional.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Cross-QA: **F-performance-2** (índice ausente em `permuta_bordero`) e **F-performance-5** (índice
  parcial em `permuta_alocacao_execucao(bor_cod)`) também caem em **Modifiability** — "schema as
  code" em migrations é o canal certo, mas o gate de PR não exigiu EXPLAIN. **F-performance-3 e
  F-performance-6** dialogam com **qa-availability** (payload grande + ausência de Server-Timing
  dificulta SLOs e detecção precoce de regressão). **F-performance-1** dialoga com **qa-fault-tolerance**:
  fan-out maior aumenta a probabilidade de bater `MAX_SESSIONS` Conexos.
- Não medi cold start (não aplicável — Express/Render, não Lambda); não medi bundle do front
  (`--quick`-style por escopo focado no diff de backend).
- O memo de 30s no `BorderosPanel` foi um acerto barato — mantém score 5; sem ele a aba ficaria
  bem pior. Os cards 1, 2 e 6 elevam o score para ~8 se executados.
