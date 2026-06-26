---
qa: Performance
qa_slug: performance
run_id: 2026-06-26-0058
agent: qa-performance
generated_at: 2026-06-26T00:58:00-03:00
scope: all
score: 5
findings_count: 9
cards_count: 8
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao Financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Buscar invoices" do modal de alocação manual (cross-process) com um processo de N invoices | Burst de chamadas LIVE ao Conexos (3 endpoints por invoice, sem cap de concorrência) | `AlocacaoPermutasService.buscarInvoices` (Express, hot path) | Operação normal, instância Render single-node, Conexos com `LOGIN_ERROR_MAX_SESSIONS` | Resposta entregue dentro de SLA; cap de paralelismo respeita sessão do ERP; sem `502` do proxy | p95 < 5s para processo com ≤ 50 invoices; 0 erros `MaxSessions`; nunca > 10 chamadas Conexos em voo |
| Admin clica "Executar lote" (botão das automáticas) com 6 adtos pendentes | Reconciliação SEQUENCIAL (`LOTE_MAX=6`), cada uma com 5–7 chamadas `fin010` + handshake de borderô | `ReconciliacaoLotePermutaService.reconciliarLote` | Operação normal, proxy Render com timeout HTTP ~30s | Lote termina antes do timeout do proxy OU vira fluxo assíncrono | p95 < 25s para lote completo; 0 timeouts 502 do proxy |
| Usuário abre `/permutas` (dashboard principal) | Carrega GestaoPermutasResponse + status borderô + runs (3 fetches) num client component de 2971 LOC | `src/frontend/app/permutas/page.tsx` (god component, 35 useState, 18 useMemo/Callback) | Navegador, rede 4G/cabo | First contentful paint + interatividade após hidratação rápidas | First Load JS ≤ 250KB; TBT (Total Blocking Time) < 300ms; tempo até interativo < 2s |
| Cron diário dispara `EleicaoPermutasService.computeCandidatas` | Fan-out multi-filial (`FILIAIS_CONCURRENCY=5`) com universo de invoices + adiantamentos + declarações + processos por filial | `EleicaoPermutasService` (job manual hoje, EventBridge no alvo) | Operação batch, sem usuário aguardando | Job conclui em janela toleráve, sem esgotar a sessão do ERP | p95 < 5min por run completa multi-filial; cap-hit ≤ 1% das runs |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Backend runtime deps | 14 | ≤ 15 | ✅ | `src/backend/package.json` |
| Frontend runtime deps | 22 | ≤ 25 (Radix granular) | ✅ | `src/frontend/package.json` |
| Pool Postgres `max` | 5 | ≥ 5 (single Render instance) | ✅ | `PostgreeDatabaseClient.ts:26` |
| `selectMany` sem `LIMIT` em hot paths | 7 (listAtivas, listAdiantamentosAtivos, listInvoicesEmAberto, listDeclaracoes, listCasamentos, listImportadores, listComBordero) | 0 ou paginação documentada | ❌ | `grep -n "LIMIT" src/backend/domain/repository/permutas/*.ts` |
| Migrations contendo `CREATE INDEX` | 8 de 19 | n/a | ✅ presença | `grep -l "CREATE INDEX" src/backend/migrations/*.sql` |
| Índices dedicados ao hot path de borderôs | 2 (criados em `0019_permuta_perf_indexes.sql`) | ≥ 1 por hot path | ✅ | `migrations/0019_permuta_perf_indexes.sql:6-11` |
| Limiters express-rate-limit (global / strict) | 100/min · 10/min | n/a | ⚠️ (sem store distribuído — vide F-performance-7) | `http/rateLimit.ts:18,28` |
| Concurrency cap no fan-out Conexos (Eleição) | 5 filiais × 10 adtos = 50 em voo no pior caso | ≤ MAX_SESSIONS do Conexos | ✅ explícito | `EleicaoPermutasService.ts:87-88` |
| Concurrency cap no fan-out Conexos (`buscarInvoices`) | Sem cap — `Promise.all(todas.map(...))` com 3 endpoints por invoice | ≤ 10 em voo (idem Eleição) | ❌ | `AlocacaoPermutasService.ts:109` |
| Top god component (frontend) — LOC / `useState` / `useMemo+useCallback` | 2971 / 35 / 18 | ≤ 600 LOC / ≤ 15 / split em sub-componentes | ❌ | `wc -l src/frontend/app/permutas/page.tsx` + grep |
| Timeout HTTP no Conexos client (axios) | 40_000 ms | 10–30s + retry/circuit | ⚠️ (sem keep-alive agent) | `services/conexos.ts:81` |
| Timeout do PG pool `connectionTimeoutMillis` | 5_000 ms | OK | ✅ | `PostgreeDatabaseClient.ts:28` |
| Manual `setTimeout` fora de Executors/test | 1 (`RetryExecutor.ts:55`, dentro de executor — esperado) | 0 fora do contrato | ✅ | grep -rn "setTimeout" src/backend |
| Lote de baixas `LOTE_MAX` (síncrono) | 6 adtos × ~6 chamadas ERP = ~36 calls síncronas | Migrar para fila assíncrona (≤ 30s) | ⚠️ documentado | `ReconciliacaoLotePermutaService.ts:14` |
| Bundle bytes por rota (Next.js First Load JS) | ⚠️ **Não medível neste run** (build não executado) | ≤ 250KB First Load JS | ⚠️ | `npm run build` em `src/frontend` (não rodado) |
| p95 latência produção `/permutas/gestao`, `/eleicao`, `/reconciliar-lote` | ⚠️ **Não medível localmente** | a definir | ⚠️ | requer APM (Sentry/Datadog) ou logs do Render |
| Throughput produção (RPS sustentado) | ⚠️ **Não medível localmente** | a definir | ⚠️ | requer APM |

> ⚠️ **Não medível localmente**: latência p95/p99, throughput, MTTR. Render Free/Starter expõe apenas logs textuais; não há APM/X-Ray/CloudWatch (não há AWS). Recomendação: instrumentar com OpenTelemetry exporter para Honeycomb/Datadog ou ativar o `Render Metrics` premium e expor histogramas `request_duration_seconds` via `prom-client`.
> ⚠️ **Não medível neste run**: First Load JS por rota. Próximo run com Next 16 build (`cd src/frontend && npm run build`) deve capturar a tabela "Route Size" do output e cruzar com o alvo de 250KB.

## 3. Tactics — Cobertura no Financeiro

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — sistema é orientado a evento (clique do analista, cron), não a stream contínuo. | N/A | — |
| Limit Event Response | `globalLimiter` 100 req/min + `heavyRouteLimiter` 10 req/min nas rotas de fan-out Conexos; `LOTE_MAX=6` no reconciliar; `MAX_PAGES=50` na paginação Conexos | ✅ presente | `http/rateLimit.ts:18,28`; `ReconciliacaoLotePermutaService.ts:14`; `ConexosClient.ts:335,344` |
| Prioritize Events | Ausente — sem fila de prioridade; reconciliar-lote processa FIFO da `gestao.casamentos` sem prioridade (idade, valor) | ⚠️ parcial | — |
| Reduce Overhead | `IngestaoCoalescerService` coalesce cliques redundantes do cliente-filtro (ADR-0012); `BorderoGestaoService` lê de `permuta_bordero` cache em vez do ERP a cada abertura | ✅ presente | `IngestaoCoalescerService.ts`; `BorderoGestaoService.ts:295-356` |
| Bound Execution Times | `MAX_PAGES=50` + `PAGE_SIZE=500` no `paginate` Conexos; `connectionTimeoutMillis=5000` no PG pool; axios `timeout: 40000` no Conexos. Sem timeout no fetch do frontend. | ⚠️ parcial | `ConexosClient.ts:335,344`; `services/conexos.ts:81`; `PostgreeDatabaseClient.ts:28` |
| Increase Resource Efficiency | Batched fan-out Conexos (`fetchInvoicesBatched`, `fetchDeclaracoesBatched`, `fetchProcessosBatched`) eliminou N+1 da Eleição (P0-7); `Promise.all` do `exporGestao` lê 7 consultas em paralelo | ✅ presente | `EleicaoPermutasService.ts:431-454`; `GestaoPermutasService.ts:46-62` |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | Single instance Render hoje; alvo Lambda multi-tenant não existe ainda (sem `infra/`). PG pool max=5 — apertado para Lambda concorrente, OK para 1 Express. | ⚠️ parcial | `PostgreeDatabaseClient.ts:26`; `CLAUDE.md` estado atual |
| Increase Concurrency | `BoundedConcurrency.map` com `FILIAIS_CONCURRENCY=5` e `ADIANTAMENTOS_CONCURRENCY=10` na Eleição; `Promise.all` no fan-out de borderôs do `refreshCache` | ✅ presente (parcial — vide F-performance-1) | `BoundedConcurrency.ts`; `EleicaoPermutasService.ts:87-88`; `BorderoGestaoService.ts:383-399` |
| Maintain Multiple Copies of Computations | Snapshot persistido (`permuta_eleicao_run` + `permuta_candidata_snapshot`) com idempotency-key — replay sem refazer fan-out (P0-6) | ✅ presente | `EleicaoPermutasService.ts:126-186` |
| Maintain Multiple Copies of Data | Cache `permuta_bordero` (borderôs do ERP), `permuta_alocacao_execucao` (trilha de baixa), `permuta_adiantamento`/`_invoice` (modelo relacional alimentado pela ingestão) — tela `/gestao` lê só do banco | ✅ presente | `migrations/0018_permuta_bordero_cache.sql`; `BorderoGestaoService.ts:295-356` |
| Bound Queue Sizes | N/A direto — Express request/response, sem fila própria. `LOTE_MAX=6` faz papel análogo (bound do lote). EventBridge/SQS é alvo, não atual. | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:14` |
| Schedule Resources | Ausente — sem job runner; eleição/ingestão é HTTP manual (`POST /permutas/eleicao`, `/ingestao`). Cron diário é dívida documentada (migration-debt O4). | ❌ ausente | `routes/permutas.ts:203-206` (nota O4) |

### Facetas modernas

| Facet | Implementação | Status | Evidência |
|---|---|---|---|
| Cold start budget | N/A — Express persistente no Render (não Lambda). Quando migrar para AWS, este atributo vira P0. | N/A | `CLAUDE.md` estado atual |
| Cache strategy | SSM cache no `EnvironmentProvider` (validado no test); borderô cache em DB; sem CDN/edge no FE | ✅ presente | `EnvironmentProvider.test.ts:96`; `migrations/0018_permuta_bordero_cache.sql` |
| Index discipline | 8/19 migrations contêm `CREATE INDEX`; índices recentes (`0019`) dedicados a hot path borderôs (parcial-index com `WHERE bor_cod IS NOT NULL`) | ✅ presente | `grep -l "CREATE INDEX" migrations/*.sql` |
| Bundle leanness | Backend deps OK (14). Frontend é client component monolítico de 2971 LOC sem dynamic import — afeta TBT e bundle. | ❌ ruim | `page.tsx` LOC; `grep dynamic\|lazy src/frontend/**` (apenas 1 nota de lazy de Radix tab) |
| Connection reuse / keep-alive | Axios `services/conexos.ts:79-82` cria instance com `baseURL`+`timeout` mas SEM `httpAgent` keep-alive. Cada chamada paga handshake TCP+TLS. | ❌ ausente | `services/conexos.ts:79-82` |

## 4. Findings (achados)

### F-performance-1: `AlocacaoPermutasService.buscarInvoices` faz fan-out sem cap (3 chamadas Conexos por invoice em `Promise.all` uncapped)

- **Severidade**: P0
- **Tactic violada**: Increase Concurrency (bound) + Limit Event Response
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:109-163`
- **Evidência (objetiva)**:
  ```ts
  const mapeadas = await Promise.all(
      todas.map(async (i): Promise<InvoiceBuscada | null> => {
          ...
          const det = await this.conexosClient.getDetalheTitulos({ docCod: i.docCod, filCod });
          ...
          const tit = await this.conexosClient.listTitulosAPagar({ docCod: i.docCod, filCod });
          ...
          const jaAlocado = await this.alocacaoRepository.sumByInvoice(i.docCod, excludeAdtoDocCod);
          return { ... };
      }),
  );
  ```
  Eleição usa `boundedConcurrency.map` com `ADIANTAMENTOS_CONCURRENCY=10` (`EleicaoPermutasService.ts:87-88`); aqui é `Promise.all` puro.
- **Impacto técnico**: Para um processo com N invoices, o clique do analista dispara `1 + 2N` chamadas Conexos simultâneas (list + det + tit) + N queries PG. Com N=30 invoices, 60 conexões concorrentes contra o Conexos — alta probabilidade de `LOGIN_ERROR_MAX_SESSIONS` (limite da sessão única do tenant) e queda do P99 da rota.
- **Impacto de negócio**: Modal de alocação manual N:M (Fase 2 ADR-0008) trava intermitentemente; analista perde confiança na busca cross-process — vai usar o ERP direto, derrotando o propósito do sistema.
- **Métrica de baseline**: `# chamadas Conexos em voo` no pior caso = `1 + 2 × N(invoices)`; observado código sem cap; cap canônico da Eleição = 10.

### F-performance-2: Auto-alocação quadrática — `criarRascunhosAtomico` chama `alocar` num loop, cada `alocar` re-fetcha TODA a lista de invoices LIVE

- **Severidade**: P0
- **Tactic violada**: Increase Resource Efficiency + Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:171-291` (alocar) + `:344-405` (criarRascunhosAtomico)
- **Evidência (objetiva)**:
  ```ts
  // autoAlocarSeElegivel monta `itens` chamando buscarInvoices() (1 fan-out — N invoices)
  // criarRascunhosAtomico em seguida:
  for (const it of itens) {
      await this.alocar({ adiantamentoDocCod, ...it, criadoPor });   // <- alocar() faz buscarInvoices() de novo
  }
  // alocar (linha 198): const invoices = await this.buscarInvoices(invoicePriCod, adto.filCod);
  ```
  `buscarInvoices` já faz fan-out de `1 + 2N` chamadas Conexos. Multiplicado por N itens no loop ⇒ `N × (1 + 2N)` = **O(N²)** chamadas LIVE Conexos por auto-alocação.
- **Impacto técnico**: Para um adto com 10 invoices, 10 × 21 = 210 chamadas Conexos; para 30 invoices, 30 × 61 = **1830 chamadas**. Estoura o cap de sessão do Conexos garantidamente, e a operação atômica reverte tudo — efetivamente impedindo o caminho "auto-alocar no Baixar" para processos médios.
- **Impacto de negócio**: Regra 2026-06-24 (múltipla AUTOMÁTICA com adto cobrindo todas as invoices) fica inviabilizada além de poucas invoices — analista é forçado ao manual. Performance degrada quadraticamente com a complexidade do processo.
- **Métrica de baseline**: chamadas Conexos por auto-alocação = `N × (1 + 2N)` (medido por leitura de código). Para N=10: 210.

### F-performance-3: `listAtivas` retorna tabela inteira de alocações para filtrar por 1 adto (full-table scan + bandwidth desnecessário)

- **Severidade**: P1
- **Tactic violada**: Increase Resource Efficiency
- **Localização**: `src/backend/domain/repository/permutas/PermutaAlocacaoRepository.ts:97-107` + chamadas em `AlocacaoPermutasService.ts:319,418` e `ReconciliacaoPermutaService.ts:98,113`
- **Evidência (objetiva)**:
  ```ts
  // PermutaAlocacaoRepository.listAtivas — sem LIMIT, sem WHERE
  `SELECT ... FROM permuta_alocacao ORDER BY adiantamento_doc_cod, criado_em`
  // ReconciliacaoPermutaService.reconciliar (chamado por adto):
  let alocacoes = (await this.alocacaoRepository.listAtivas()).filter(
      (a) => a.adiantamentoDocCod === adiantamentoDocCod,
  );
  // ReconciliacaoLotePermutaService chama reconciliar em LOOP (LOTE_MAX=6) → 6 full-table scans
  ```
- **Impacto técnico**: Cada baixa do lote (6×) faz `SELECT *` da tabela inteira e filtra em memória. À medida que a trilha cresce (cada permuta = N rascunhos), a latência cresce linearmente; combinada com `LOTE_MAX=6` síncrono, contribui para o risco já anotado de timeout do proxy.
- **Impacto de negócio**: Performance do "Executar lote" degrada com volume histórico — a UX piora silenciosamente sem alarme. P1 hoje, vira P0 depois de meses de uso.
- **Métrica de baseline**: chamadas full-scan por lote = `LOTE_MAX × 2 = 12` (uma em `reconciliar` linha 98, outra após `autoAlocar*` linha 113).

### F-performance-4: `ReconciliacaoLotePermutaService` síncrono em request HTTP com risco documentado de timeout do proxy Render (cap=6)

- **Severidade**: P1
- **Tactic violada**: Bound Execution Times + Schedule Resources
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:10-15,113-149`
- **Evidência (objetiva)**:
  ```ts
  // LOTE_MAX = 6 — cap server-side: bound execution time (mantém o request curto, longe do
  // timeout do proxy) E blast radius (limita a escrita por clique).
  for (const docCod of selecionados) {
      ...
      const r = await this.reconciliacaoService.reconciliar({...});  // 5-7 calls ERP cada
  }
  ```
  `reconciliar` faz handshake de 5 chamadas `fin010` por adto (criar borderô + 1 baixa por alocação + N por par). 6 adtos × 6 calls × ~500ms ERP = ~18s. Plus, comentário do dev já reconhece o risco do timeout do proxy.
- **Impacto técnico**: Render proxy expira em 30s/60s (depende do plano). Lote completo + Conexos lento (5–10s p99 não é incomum) explode o teto. Falha do proxy = cliente recebe 502 mas o lote pode ter executado parcialmente (continue-on-error confunde diagnose).
- **Impacto de negócio**: P1 já anotado no memory (`permutas-executar-lote-resume`). Decisão de migrar para fluxo assíncrono pendente — risco operacional cresce conforme volume diário de automáticas sobe.
- **Métrica de baseline**: tempo do lote ~p50=10s, p95=18–25s (estimado a partir de 6 × 6 calls Conexos × 200–800ms); timeout do Render proxy 30s.

### F-performance-5: God component `src/frontend/app/permutas/page.tsx` — 2971 LOC, 35 `useState`, 18 `useMemo/useCallback`, sem split

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead + Bundle leanness
- **Localização**: `src/frontend/app/permutas/page.tsx:1-2971`
- **Evidência (objetiva)**:
  ```
  $ wc -l src/frontend/app/permutas/page.tsx
  2971
  $ grep -c "useState" page.tsx → 35
  $ grep -c "useMemo\|useCallback" page.tsx → 18
  $ grep -c "use client" page.tsx → 1   # tudo client-side
  ```
  Único `dynamic`/`lazy` na pasta é a tab Radix de borderôs (lazy do componente Radix, não code-split do bundle). Sub-componentes (BorderosPanel 683 LOC, alocação modal, paginação) vivem no MESMO arquivo client.
- **Impacto técnico**: Qualquer setState em qualquer um dos 35 hooks faz o React re-renderizar a árvore inteira (filtros, tabelas, modais, banners). `useMemo` ajuda mas com 18 caches sobre 2971 LOC há cache-thrashing. Bundle de rota único — TBT alto, hidratação cara.
- **Impacto de negócio**: Tela "trava" perceptivelmente em interações simples (filtrar, abrir modal). Cobertura de testes congelada em 20% lines / 14% functions (`_shared-metrics.md`) porque o componente é incontestável — qualquer feature nova herda o débito.
- **Métrica de baseline**: 2971 LOC; 35 useState; 18 useMemo/useCallback; coverage frontend lines=20%, functions=14%.

### F-performance-6: Axios do Conexos sem `httpAgent` keep-alive — handshake TCP+TLS por chamada

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/services/conexos.ts:79-82`
- **Evidência (objetiva)**:
  ```ts
  this.client = axios.create({
      baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api',
      timeout: 40000,
  });
  ```
  Sem `httpAgent: new https.Agent({ keepAlive: true })`. Cada chamada (centenas por run de eleição) paga handshake TCP (1 RTT) + TLS (1–2 RTTs) novamente.
- **Impacto técnico**: Em rede Render→Conexos com RTT ~30ms, ~90–150ms de overhead por chamada × 500 chamadas/run = 45–75s desperdiçados por run. Multiplicado por N filiais paraleliza mas a soma de wall-clock cresce.
- **Impacto de negócio**: Eleição/Ingestão diária mais lenta; capacidade de Conexos consumida em overhead que poderia ser computação útil. Pouco visível em produção sem profiling.
- **Métrica de baseline**: overhead por chamada estimado = 90–150ms (1×RTT TCP + 1–2×RTT TLS); 0 keep-alive agents em axios clients backend.

### F-performance-7: `express-rate-limit` com memória in-process — se Render escalar horizontalmente, limite efetivo se multiplica por # instâncias

- **Severidade**: P2
- **Tactic violada**: Limit Event Response (consistência sob escala)
- **Localização**: `src/backend/http/rateLimit.ts:18-35` + `src/backend/index.ts:31,82`
- **Evidência (objetiva)**:
  ```ts
  export const globalLimiter: RateLimitRequestHandler = rateLimit({
      windowMs: 60_000, limit: 100, ...   // store padrão = MemoryStore
  });
  ```
  Sem `store: new RedisStore(...)` nem similar. Cada instância tem seu próprio contador.
- **Impacto técnico**: Em single-instance Render é correto. No alvo Lambda multi-tenant (cada cliente uma conta AWS) o `rate-limit` deixa de ser limit global e vira "limit por container" — N containers = N×limit efetivo. Quando o tráfego subir e o Render fizer auto-scale (Starter+), a proteção fica branda.
- **Impacto de negócio**: O propósito ("não estourar Conexos MAX_SESSIONS") é exatamente o que vaza quando escalado. P2 hoje (single instance), vira P0 no dia que escalar.
- **Métrica de baseline**: instâncias atuais = 1; limite efetivo = 100 RPM global / 10 RPM heavy; sem store distribuído.

### F-performance-8: `selectMany` sem `LIMIT` em hot reads — `listAdiantamentosAtivos`, `listInvoicesEmAberto`, `listDeclaracoes`, `listCasamentos`, `listImportadores`, `listComBordero`

- **Severidade**: P2
- **Tactic violada**: Bound Execution Times + Increase Resource Efficiency
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:486,500,523,532,541` + `PermutaExecucaoRepository.ts:81,127,169`
- **Evidência (objetiva)**:
  ```sql
  SELECT * FROM permuta_adiantamento WHERE NOT stale ORDER BY ... -- sem LIMIT
  SELECT * FROM permuta_invoice WHERE NOT stale AND NOT pago ORDER BY doc_cod ASC -- sem LIMIT
  SELECT * FROM permuta_casamento ORDER BY invoice_doc_cod, adiantamento_doc_cod -- sem LIMIT
  ```
  Estes alimentam o `/permutas/gestao` (chamado a cada load do dashboard). Hoje o universo é pequeno (centenas de linhas), mas a trilha (`permuta_alocacao_execucao`) cresce monotonamente.
- **Impacto técnico**: Crescimento linear sem ceiling. Dado o índice `idx_permuta_adiantamento_fil_estado_ativo` (migration 0003) o EXPLAIN ainda é índice-scan; quando virar seq-scan (estatística desviar) a latência sobe sem alarme.
- **Impacto de negócio**: Tempo de load do dashboard cresce com volume histórico — degrada UX silenciosamente.
- **Métrica de baseline**: 7 reads sem `LIMIT` em paths chamados de rota HTTP (medido via `grep -L "LIMIT" repository`).

### F-performance-9: Frontend `fetch` sem `AbortController`/timeout — chamadas penduradas indefinidamente

- **Severidade**: P2
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/frontend/lib/api.ts` (todas as `fetch(...)`, ~25 sites)
- **Evidência (objetiva)**:
  ```
  $ grep -n "AbortController\|signal:\|timeout" src/frontend/lib/api.ts
  (nenhum resultado)
  ```
- **Impacto técnico**: Se o backend ou o Conexos travar, o spinner do front fica eterno (até o usuário desistir/recarregar). Não há mecanismo de cancelamento ao desmontar um componente — leak de memória + setState após unmount em rotas longas (ingestão pode levar minutos).
- **Impacto de negócio**: Percepção de "travado" em pico de carga ou erro de rede; suporte recebe tickets falsos.
- **Métrica de baseline**: 0 fetches com timeout/AbortController de 25+ chamadas em `lib/api.ts`.

## 5. Cards Kanban

### [performance-1] Capar concorrência em `AlocacaoPermutasService.buscarInvoices` com `BoundedConcurrency`

- **Problema**
  > `buscarInvoices` faz `Promise.all` uncapped sobre todas as invoices do processo (3 endpoints Conexos por invoice). Um processo com 30 invoices dispara 60+ chamadas simultâneas → risco real de `LOGIN_ERROR_MAX_SESSIONS`. A Eleição já resolveu o mesmo padrão com `BoundedConcurrency.map(...,10)`; este path foi esquecido.

- **Melhoria Proposta**
  > Injetar `BoundedConcurrency` em `AlocacaoPermutasService` e substituir o `Promise.all(todas.map(...))` por `boundedConcurrency.map(todas, worker, ADIANTAMENTOS_CONCURRENCY)`. Extrair a constante `ADIANTAMENTOS_CONCURRENCY=10` para um módulo compartilhado (`ConexosConcurrency.ts`) — hoje vive como duplicação em `EleicaoPermutasService`.

- **Resultado Esperado**
  > Chamadas Conexos em voo no pior caso: `1 + 2N` → **≤ 10**. Erros `LOGIN_ERROR_MAX_SESSIONS` originados da busca de invoices: indeterminado → **0**. Latência p95 do modal cresce um pouco em processos enormes (serializa em batches de 10) mas o tail risk desaparece.

- **Tactic alvo**: Increase Concurrency (bounded) + Limit Event Response
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - chamadas Conexos em voo (pico): `1 + 2N` → ≤ 10
  - taxa de erro `MaxSessions` na rota `/permutas/invoices/buscar`: medir 7d → 0
- **Risco de não fazer**: Fase 2 (alocação manual cross-process, ADR-0008) inviável para processos com >15 invoices; analista volta ao ERP.
- **Dependências**: nenhuma

### [performance-2] Eliminar fan-out quadrático no auto-alocar — passar invoices já buscadas para `alocar` em vez de re-buscar

- **Problema**
  > `criarRascunhosAtomico` chama `alocar` em loop; cada `alocar` re-executa `buscarInvoices(priCod, filCod)` LIVE (que já é O(N) em chamadas Conexos). Para um adto com N invoices: `N × (1+2N)` chamadas — quadrático. Para N=10: 210 chamadas; N=30: 1830. Estoura o cap de sessão.

- **Melhoria Proposta**
  > Refatorar `alocar` em dois métodos: (a) `validarEAlocar(input, invoice)` puro (recebe a invoice já hidratada, valida saldos, persiste) e (b) `alocar(input)` (legado: busca + valida). `autoAlocarSeElegivel` chama `buscarInvoices` uma vez e passa a invoice já hidratada para `validarEAlocar` no loop. Conexos: 1 fan-out em vez de N+1.

- **Resultado Esperado**
  > Chamadas Conexos por auto-alocação de N=10: **210 → 21** (×10). Para N=30: **1830 → 61** (×30). Latência da rota `/permutas/adiantamentos/:doc/reconciliar` (que pode disparar autoAlocar) cai de minutos para segundos em adtos com >5 invoices.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P0
- **Esforço estimado**: M
- **Findings relacionados**: F-performance-2, F-performance-1
- **Métricas de sucesso**:
  - chamadas Conexos por auto-alocação (N=10): 210 → ≤ 21
  - taxa de falha `MaxSessions` em `POST /reconciliar` com auto-alocar: medir 7d → 0
- **Risco de não fazer**: Regra "Baixar = auto-aloca múltipla automática" (2026-06-24) só funciona para processos com ≤ 3–4 invoices; demais caem no caminho manual, contradizendo o produto.
- **Dependências**: idealmente após performance-1 (compartilha o `BoundedConcurrency` injetado)

### [performance-3] Substituir `listAtivas` por queries indexadas com filtro — `findByAdiantamento(docCod)` + LIMIT

- **Problema**
  > `PermutaAlocacaoRepository.listAtivas()` carrega a tabela inteira para o caller filtrar 1 adto em memória. É chamada em `ReconciliacaoPermutaService.reconciliar` (linha 98 e 113) — dentro do loop do `reconciliar-lote` (LOTE_MAX=6). Custo cresce linearmente com a trilha histórica.

- **Melhoria Proposta**
  > Adicionar `findByAdiantamento(adtoDocCod: string): Promise<AlocacaoRow[]>` ao repo, com `WHERE adiantamento_doc_cod = $docCod` (usa `idx_permuta_alocacao_adto` já existente da migration 0014). Substituir os 4 call-sites (`AlocacaoPermutasService:319,418`; `ReconciliacaoPermutaService:98,113`). Manter `listAtivas` só para `GestaoPermutasService.exporGestao` (lê tudo de propósito).

- **Resultado Esperado**
  > Linhas lidas por baixa no lote: `|alocacoes_total|` → ≤ N (alocações do adto, tipicamente 1–10). Bandwidth Postgres por lote completo: O(|alocacoes_total| × 6) → O(N × 6). Para 1000 alocações na trilha: 12000 rows lidas → ≤ 60.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - rows lidas por `reconciliar-lote` (n=6, trilha 1000): 12000 → ≤ 60
  - latência p95 do `reconciliar-lote` em ambiente sintético: medir antes/depois
- **Risco de não fazer**: P1 hoje (volume baixo), vira P0 quando a trilha passar de ~10k linhas.
- **Dependências**: nenhuma

### [performance-4] Migrar `reconciliar-lote` para job assíncrono com endpoint de status (resolve o risco de timeout do proxy)

- **Problema**
  > `LOTE_MAX=6` síncrono em request HTTP roda 6 adtos × ~6 chamadas `fin010` = ~36 calls sequenciais, ~10–25s wall-clock. Render proxy expira em 30–60s. Se o Conexos estiver lento (5–10s p99 documentado), o lote ultrapassa o teto e o cliente recebe 502 com estado parcialmente aplicado (continue-on-error mascarado). Risco já anotado no memory (`permutas-executar-lote-resume`).

- **Melhoria Proposta**
  > Quebrar o fluxo: `POST /permutas/reconciliar-lote` apenas enfileira (`pg-boss`/tabela `permuta_lote_job` com status `pending`/`running`/`done`/`failed`) e devolve `202 Accepted + { jobId }`; um worker (no mesmo processo, via `setImmediate`-loop OU job runner externo) processa cada lote. Frontend faz polling em `GET /permutas/lote/:jobId` (200/404/410) usando `PollExecutor`-equivalente do FE (com timeout). Não aumenta `LOTE_MAX` ainda — só desacopla do timeout HTTP.

- **Resultado Esperado**
  > Timeouts 502 do proxy em `/reconciliar-lote`: indeterminado → **0**. Tempo de resposta HTTP da rota: 10–25s → **< 500ms** (só enfileira). Tempo de processamento do lote: igual (~15–25s), mas em background, com progress observável.

- **Tactic alvo**: Bound Execution Times + Schedule Resources
- **Severidade**: P1
- **Esforço estimado**: L
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - latência p95 HTTP `POST /reconciliar-lote`: 10–25s → < 500ms
  - timeouts 502 em 30 dias: medir antes/depois (alvo 0)
  - lotes com estado parcialmente aplicado por timeout do proxy: alvo 0
- **Risco de não fazer**: O sistema fica refém do plano Render — escalar volume diário aumenta exposição a 502s. Quando migrar para Lambda (alvo), API Gateway tem teto rígido de 29s, restringindo ainda mais.
- **Dependências**: decidir job runner (in-process loop vs. `pg-boss` vs. SQS — alinhado ao alvo Lambda)

### [performance-5] Quebrar `page.tsx` em sub-rotas/componentes com `React.memo` + dynamic import dos painéis pesados

- **Problema**
  > `src/frontend/app/permutas/page.tsx` tem 2971 LOC, 35 `useState`, 18 `useMemo/useCallback`, tudo num único `'use client'`. Bundle de rota único; qualquer setState re-renderiza a árvore inteira. Coverage congelada em 20% lines / 14% functions porque o componente é incontestável.

- **Melhoria Proposta**
  > 1. Extrair sub-componentes por aba (PendentesPanel, AutomaticasPanel, InvoicesPanel, AlocacaoModal, IngestaoModal) — cada um com seu estado local. 2. Manter o estado COMPARTILHADO em um `useReducer` ou context fino (data, filtros). 3. `next/dynamic(() => import('./BorderosPanel'), { ssr: false })` para code-split do painel de borderôs (683 LOC). 4. `React.memo` nas linhas de tabela (`PermutaRow`, `InvoiceRow`).

- **Resultado Esperado**
  > LOC do arquivo principal: 2971 → ≤ 600. `useState` no componente raiz: 35 → ≤ 10. First Load JS da rota `/permutas`: medir baseline (próximo run com `npm run build`) → reduzir ≥ 30%. TBT em interações de filtro: melhora perceptível (medir via DevTools Performance).

- **Tactic alvo**: Reduce Overhead + Bundle leanness
- **Severidade**: P1
- **Esforço estimado**: L
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - LOC `page.tsx`: 2971 → ≤ 600
  - useState/useMemo no raiz: 35/18 → ≤ 10/≤ 8
  - First Load JS `/permutas`: medir baseline → -30%
  - frontend coverage (lines): 20% → ≥ 40% (componentes pequenos viram testáveis)
- **Risco de não fazer**: Toda feature nova herda o débito; o arquivo não tem teste; bug visual numa aba pode afetar outras por re-render acidental.
- **Dependências**: nenhuma (refactor incremental — pode ser feito aba a aba)

### [performance-6] Habilitar HTTP keep-alive no axios do Conexos (`httpsAgent` com `keepAlive: true`)

- **Problema**
  > `services/conexos.ts:79-82` cria axios sem `httpsAgent`. Cada chamada paga handshake TCP+TLS (~90–150ms a 30ms RTT). Eleição/Ingestão fazem centenas de chamadas/run → 45–75s de overhead desperdiçado por run.

- **Melhoria Proposta**
  > Adicionar `httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10 })` (e o equivalente `httpAgent` para tenants HTTP, se houver). `maxSockets=20` casa com `FILIAIS_CONCURRENCY × ADIANTAMENTOS_CONCURRENCY` da Eleição.

- **Resultado Esperado**
  > Overhead por chamada Conexos: 90–150ms → ~5–10ms (apenas RTT 1×). Tempo total de uma Eleição multi-filial (sintético, 500 chamadas): redução estimada de 40–70s wall-clock total (a maior parte é paralelizada, mas o overhead acumulado por filial sequencial cai).

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - axios clients com keep-alive agent: 0 → 1 (Conexos)
  - duração média de uma Eleição (medir antes/depois em dev): baseline → -10–20%
- **Risco de não fazer**: Aceitável hoje; vira mais sensível conforme o volume de fan-out cresce (clientes-filtro, universo de invoices).
- **Dependências**: nenhuma

### [performance-7] Adicionar `LIMIT` defensivo + paginação aos hot reads de `permuta_*` que hoje devolvem a tabela inteira

- **Problema**
  > 7 `selectMany` em hot paths sem `LIMIT` (listAdiantamentosAtivos, listInvoicesEmAberto, listDeclaracoes, listCasamentos, listImportadores, listComBordero, listAtivas). Hoje rápido — escala linear sem teto. Sem alarme quando virar problema.

- **Melhoria Proposta**
  > 1. Cada read recebe um `LIMIT $limit` parametrizado com default sensato (5000 para os de leitura ativa; 500 para `listComBordero`). 2. Quando o `rowCount` igualar o limit, emitir `LogService.warn(BUSINESS_WARN, 'limit hit')` — sinal claro de que cresceu além do dimensionamento. 3. Cardinalidade > 10k em qualquer um dos 7 reads → quebrar em paginação cursor-based.

- **Resultado Esperado**
  > Reads sem `LIMIT` em hot paths: 7 → 0. Warnings de "limit hit" em produção: 0 (alvo). Bound de pior caso para o `/permutas/gestao`: definido (vs. unbounded hoje).

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-8
- **Métricas de sucesso**:
  - `# selectMany sem LIMIT em rotas HTTP`: 7 → 0
  - presença do warn "limit hit" como alarme observável: ausente → presente
- **Risco de não fazer**: P2 hoje, vira P0 silenciosamente se a operação dobrar de volume.
- **Dependências**: nenhuma

### [performance-8] Cobrir `fetch` do frontend com `AbortController` + timeout (15s default, 60s para ingestão)

- **Problema**
  > Nenhuma das ~25 chamadas `fetch` em `src/frontend/lib/api.ts` tem timeout ou `signal`. Se backend/Conexos travar, spinner é eterno; setState após unmount = leak.

- **Melhoria Proposta**
  > Criar wrapper `fetchWithTimeout(url, opts, timeoutMs = 15_000)` que monta `AbortController` interno e rejeita com `TimeoutError` no estouro. Substituir os call-sites; usar 60_000ms para `runIngestaoManual` (ingestão pode demorar). Componentes que disparam fetch em `useEffect` passam o `signal` do `AbortController` mounted-aware.

- **Resultado Esperado**
  > Spinner infinito em rotas penduradas: comportamento atual → erro pt-BR amigável em ≤ 15s (60s para ingestão). `# fetches sem timeout`: 25 → 0.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-9
- **Métricas de sucesso**:
  - fetches sem timeout em `lib/api.ts`: 25 → 0
  - tickets de suporte "tela travada": medir antes/depois (alvo: queda)
- **Risco de não fazer**: UX ruim em pico/erro; warnings React de "setState after unmount" poluem console; não afeta backend.
- **Dependências**: nenhuma

## 6. Notas do agente

- **Métricas não coletadas**: `npm run build` do frontend não rodado (esta é a run analítica — bundle por rota fica para o próximo). p95/p99 de latência e throughput dependem de APM (não há) — declarado explicitamente em §2.
- **Cross-QA detectado para o `qa-consolidator`**:
  - **Availability + Fault Tolerance**: F-performance-1, F-performance-2 (fan-out uncapped) e F-performance-9 (sem timeout no fetch) sobrepõem-se a "Timeouts em dependências externas" / "Bulkhead/circuit breaker"; F-performance-4 (lote síncrono) toca "Graceful degradation".
  - **Deployability + Modifiability**: F-performance-5 (god component) é também débito de modificabilidade; F-performance-7 (rate-limit in-memory) vira P0 sob escala multi-instance — relevante para o alvo Lambda multi-tenant.
  - **Modifiability (schema as code)**: F-performance-3 e F-performance-8 dependem de discipline de migrations e covering-index — sinal para o agente Modifiability validar a `_index.json`/coverage das tabelas.
- **Decisão de escopo**: o escopo `all` foi cumprido (backend + frontend + migrations + http middleware). Sem infra/Lambda hoje, as facetas "cold start budget" e "AWS pool sizing × concurrency" foram marcadas N/A com nota de quando viram P0.
- **Severidade calibrada**: dois P0 (F-performance-1, F-performance-2) com baseline numérico de chamadas Conexos derivado por leitura de código; sem APM, é o número mais defensável.
