---
qa: Performance
qa_slug: performance
run_id: 2026-06-26-1708
agent: qa-performance
generated_at: 2026-06-26T17:30:00-03:00
scope: all
score: 7
findings_count: 7
cards_count: 6
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao Financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Buscar invoices" do modal de alocação manual (cross-process) com um processo de N invoices | Burst de fan-out LIVE ao Conexos (3 endpoints por invoice) | `AlocacaoPermutasService.buscarInvoices` (hot path) | Operação normal, instância Render single-node, Conexos com `LOGIN_ERROR_MAX_SESSIONS` | Resposta entregue dentro de SLA; cap de paralelismo respeita sessão do ERP; sem `502` do proxy | p95 < 5s para processo com ≤ 50 invoices; 0 erros `MaxSessions`; nunca > 8 chamadas Conexos em voo (INVOICES_CONCURRENCY=8) |
| Admin clica "Executar lote" (botão das automáticas) com 6 adtos pendentes | Reconciliação SEQUENCIAL (`LOTE_MAX=6`), cada uma com 5–7 chamadas `fin010` + handshake de borderô | `ReconciliacaoLotePermutaService.reconciliarLote` | Operação normal, proxy Render com timeout HTTP ~30s | Lote termina antes do timeout do proxy OU vira fluxo assíncrono | p95 < 25s para lote completo; 0 timeouts 502 do proxy |
| Usuário abre `/permutas` (dashboard principal) | Carrega GestaoPermutasResponse + status borderô + runs (3 fetches) num client component de 1026 LOC | `src/frontend/app/permutas/page.tsx` (page raiz, 24 useState, 12 useMemo/Callback, abas em `React.memo`, modais em `next/dynamic`) | Navegador, rede 4G/cabo | First contentful paint + interatividade após hidratação rápidas | First Load JS ≤ 250KB; TBT < 300ms; tempo até interativo < 2s |
| Usuário abre a aba **Borderôs** (in-place ou rota dedicada) | Stale-while-revalidate: lê cache `permuta_bordero` → mostra na hora → revalida ERP (10 filiais) em background | `BorderosPanel.tsx` (mount com cache-first + chip "atualizando…") | Operação normal, ERP pode estar lento (5–10s p99) | Lista visível em < 1s; refresh ao vivo sem bloquear a UI | TTFB do painel ≤ 500ms (cache); refresh background concluído em ≤ 5s (10 filiais em paralelo) |
| Cron diário dispara `EleicaoPermutasService.computeCandidatas` | Fan-out multi-filial (`FILIAIS_CONCURRENCY=5`) com universo de invoices + adiantamentos + declarações + processos por filial | `EleicaoPermutasService` (job manual hoje, EventBridge no alvo) | Operação batch, sem usuário aguardando | Job conclui em janela toleráve, sem esgotar a sessão do ERP | p95 < 5min por run completa multi-filial; cap-hit ≤ 1% das runs |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Backend runtime deps | 14 | ≤ 15 | ✅ | `_shared-metrics.md` (run 1708) |
| Frontend runtime deps | 22 | ≤ 25 (Radix granular) | ✅ | `_shared-metrics.md` (run 1708) |
| Pool Postgres `max` | 5 | ≥ 5 (single Render instance) | ✅ | `PostgreeDatabaseClient.ts` |
| `selectMany` sem `LIMIT` em hot paths | 7 (listAtivas, listAdiantamentosAtivos, listInvoicesEmAberto, listDeclaracoes, listCasamentos, listImportadores, listComBordero) | 0 ou paginação documentada | ❌ (sem mudança vs. run anterior) | `grep -n "LIMIT" src/backend/domain/repository/permutas/*.ts` |
| Concurrency cap no fan-out Conexos (`buscarInvoices`) | `INVOICES_CONCURRENCY=8`, via `boundedConcurrency.map` | ≤ MAX_SESSIONS do Conexos | ✅ **NOVO (closed F-performance-1)** | `AlocacaoPermutasService.ts:11,121-176` |
| Auto-alocação: re-fetch quadrático Conexos | **eliminado** — `alocar(prefetchedInvoices?)` reusa a lista já buscada | sem re-fetch O(N²) | ✅ **NOVO (closed F-performance-2)** | `AlocacaoPermutasService.ts:185-220,385` |
| LOC `app/permutas/page.tsx` (god component) | **1026** (era 2971 pré-CC-1, **−65%**) | ≤ 600 | ⚠️ parcial (CC-1 reduziu, ainda acima do alvo) | `wc -l src/frontend/app/permutas/page.tsx` |
| `useState` no raiz `page.tsx` | **24** (era 35) | ≤ 10 | ⚠️ parcial | `grep -c 'useState\b' page.tsx` |
| `useMemo + useCallback` no raiz `page.tsx` | **12** (era 18) | ≤ 8 | ⚠️ parcial | `grep -c 'useMemo\|useCallback' page.tsx` |
| Abas em `React.memo` (re-render isolado) | **5/5** (Automáticas, Múltiplas, Cross-over, Cross-process, Histórico) | 5/5 | ✅ **NOVO (parcial-closes F-performance-5 — re-render)** | `grep -n "React.memo" components/Aba*.tsx` |
| Modais code-split via `next/dynamic` | **5/5** (ConfirmarProcessamento, ConfirmarLote, Ingestao, Alocar, Reconciliar) | code-split p/ ≥ 4 modais pesados | ✅ **NOVO (parcial-closes F-performance-5 — bundle)** | `page.tsx:78-92` |
| Painel Borderôs com stale-while-revalidate | **Sim** (cache-first via `fetchBorderos(false)` → revalida em background via `fetchBorderos(true)`) | TTFB ≤ 500ms na abertura | ✅ **NOVO** | `BorderosPanel.tsx:117-144` |
| `ConexosClient` monolito | **REMOVIDO** — split em base + 4 sub-clients (`Cadastro`, `Financeiro`, `Titulos`, `Baixa`) | leanness / lazy-load por domínio | ✅ **NOVO** | `_shared-metrics.md` (run 1708) |
| Timeout HTTP no Conexos client (axios) | 40_000 ms | 10–30s + retry/circuit | ⚠️ (sem keep-alive agent — F-performance-3 herdada) | `services/conexos.ts:79-82` |
| Timeout do PG pool `connectionTimeoutMillis` | 5_000 ms | OK | ✅ | `PostgreeDatabaseClient.ts:28` |
| Lote de baixas `LOTE_MAX` (síncrono) | 6 adtos × ~6 chamadas ERP = ~36 calls síncronas | Migrar para fila assíncrona (≤ 30s) | ⚠️ documentado (F-performance-2 herdada) | `ReconciliacaoLotePermutaService.ts:14` |
| Concurrency cap em `BorderoGestaoService.refreshCache` (fan-out filiais) | `Promise.all(filiais.map(...))` — N=10 filiais em voo | ≤ 10 (limit canônico) | ⚠️ aceitável hoje (cap implícito = #filiais) | `BorderoGestaoService.ts:385-401` |
| Manual `setTimeout` fora de Executors/test | 1 (`RetryExecutor.ts`, dentro de executor — esperado) | 0 fora do contrato | ✅ | grep -rn "setTimeout" src/backend |
| `# fetches sem timeout` em `src/frontend/lib/api.ts` | ~25 (`grep -n "AbortController\|signal:\|timeout"` → 0 hits) | 0 | ⚠️ herdada (F-performance-5) | `grep` em `lib/api.ts` |
| Bundle bytes por rota (Next.js First Load JS) | ⚠️ **Não medível neste run** (build não executado) | ≤ 250KB First Load JS | ⚠️ | `npm run build` em `src/frontend` (não rodado) |
| p95 latência produção `/permutas/gestao`, `/eleicao`, `/reconciliar-lote` | ⚠️ **Não medível localmente** | a definir | ⚠️ | requer APM (Sentry/Datadog) ou logs do Render |
| Throughput produção (RPS sustentado) | ⚠️ **Não medível localmente** | a definir | ⚠️ | requer APM |

> ⚠️ **Não medível localmente**: latência p95/p99, throughput, MTTR. Render Free/Starter expõe apenas logs textuais; não há APM/X-Ray/CloudWatch (não há AWS). Recomendação: instrumentar com OpenTelemetry exporter para Honeycomb/Datadog ou ativar o `Render Metrics` premium e expor histogramas `request_duration_seconds` via `prom-client`.
> ⚠️ **Não medível neste run**: First Load JS por rota. Próximo run com Next 16 build (`cd src/frontend && npm run build`) deve capturar a tabela "Route Size" do output — a expectativa é que CC-1 (dynamic imports + memos + split do `ConexosClient` server-side) tenha reduzido a rota `/permutas` em 30–50KB.

## 3. Tactics — Cobertura no Financeiro

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — sistema é orientado a evento (clique do analista, cron), não a stream contínuo. | N/A | — |
| Limit Event Response | `globalLimiter` 100 req/min + `heavyRouteLimiter` 10 req/min; `LOTE_MAX=6`; `MAX_PAGES=50` na paginação Conexos; `INVOICES_CONCURRENCY=8` no fan-out por invoice | ✅ presente (reforçado) | `http/rateLimit.ts`; `ReconciliacaoLotePermutaService.ts:14`; `ConexosBaseClient.ts:80,89`; `AlocacaoPermutasService.ts:11` |
| Prioritize Events | Ausente — sem fila de prioridade; reconciliar-lote processa FIFO da `gestao.casamentos` sem prioridade (idade, valor) | ⚠️ parcial | — |
| Reduce Overhead | `IngestaoCoalescerService` coalesce cliques redundantes; `BorderoGestaoService` lê cache; **CC-1 (NOVO):** `React.memo` em 5 abas, `next/dynamic` em 5 modais, `ConexosClient` split (lazy-load por sub-domínio); **SWR (NOVO):** Borderôs abre do cache, revalida em background | ✅ presente (reforçado) | `BorderoGestaoService.ts:295-356`; `page.tsx:78-92`; `components/AbaAutomaticas.tsx:26`; `BorderosPanel.tsx:117-144` |
| Bound Execution Times | `MAX_PAGES=50` + `PAGE_SIZE=500` no `paginate` Conexos; `connectionTimeoutMillis=5000` no PG pool; axios `timeout: 40000` no Conexos. Sem timeout no fetch do frontend. | ⚠️ parcial (herdada) | `ConexosBaseClient.ts:80,89`; `services/conexos.ts:81`; `PostgreeDatabaseClient.ts:28` |
| Increase Resource Efficiency | Batched fan-out Conexos eliminou N+1 da Eleição (P0-7); `Promise.all` do `exporGestao` lê 7 consultas em paralelo; **CC-1 (NOVO):** auto-alocação reusa `prefetchedInvoices` — quadrático → linear | ✅ presente (reforçado) | `EleicaoPermutasService.ts:431-454`; `AlocacaoPermutasService.ts:185-220,385` |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | Single instance Render hoje; alvo Lambda multi-tenant não existe ainda (sem `infra/`). PG pool max=5 — apertado para Lambda concorrente, OK para 1 Express. | ⚠️ parcial | `PostgreeDatabaseClient.ts:26`; `CLAUDE.md` estado atual |
| Increase Concurrency | `BoundedConcurrency.map` com `FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10` na Eleição; `INVOICES_CONCURRENCY=8` em `AlocacaoPermutasService.buscarInvoices`; `Promise.all` no fan-out de borderôs do `refreshCache` (cap implícito = #filiais ~10) | ✅ presente (cobertura cresceu vs. run anterior) | `BoundedConcurrency.ts`; `EleicaoPermutasService.ts:87-88`; `AlocacaoPermutasService.ts:121`; `BorderoGestaoService.ts:383-399` |
| Maintain Multiple Copies of Computations | Snapshot persistido (`permuta_eleicao_run` + `permuta_candidata_snapshot`) com idempotency-key — replay sem refazer fan-out (P0-6); **CC-1 (NOVO):** `prefetchedInvoices` é cache transitório de chamada que evita refazer fan-out por item | ✅ presente | `EleicaoPermutasService.ts:126-186`; `AlocacaoPermutasService.ts:189` |
| Maintain Multiple Copies of Data | Cache `permuta_bordero` (borderôs do ERP), `permuta_alocacao_execucao` (trilha de baixa), `permuta_adiantamento`/`_invoice`; **SWR (NOVO):** tela `/permutas` aba Borderôs serve cache imediato e revalida em background — não bloqueia a UI no refresh multi-filial | ✅ presente (reforçado) | `migrations/0018_permuta_bordero_cache.sql`; `BorderoGestaoService.ts:295-356`; `BorderosPanel.tsx:117-144` |
| Bound Queue Sizes | N/A direto — Express request/response, sem fila própria. `LOTE_MAX=6` faz papel análogo (bound do lote). EventBridge/SQS é alvo, não atual. | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:14` |
| Schedule Resources | Ausente — sem job runner; eleição/ingestão é HTTP manual (`POST /permutas/eleicao`, `/ingestao`). Cron diário é dívida documentada (migration-debt O4). | ❌ ausente | `routes/permutas.ts:203-206` (nota O4) |

### Facetas modernas

| Facet | Implementação | Status | Evidência |
|---|---|---|---|
| Cold start budget | N/A — Express persistente no Render (não Lambda). Quando migrar para AWS, este atributo vira P0. | N/A | `CLAUDE.md` estado atual |
| Cache strategy | SSM cache no `EnvironmentProvider`; borderô cache em DB; **NOVO:** `BorderosPanel` faz stale-while-revalidate (cache-first + revalida em background); `invalidarBorderosMemo()` no FE para invalidação após mutação; sem CDN/edge no FE | ✅ presente (reforçado) | `EnvironmentProvider.test.ts:96`; `BorderosPanel.tsx:117-144,247`; `lib/api.ts:308,322` |
| Index discipline | 8/19 migrations contêm `CREATE INDEX`; índices recentes (`0019`) dedicados a hot path borderôs | ✅ presente | `grep -l "CREATE INDEX" migrations/*.sql` |
| Bundle leanness | Backend deps OK (14); **CC-1 (NOVO):** `ConexosClient` (1972 LOC monolito) → base (300) + 4 sub-clients lazy-resolvidos pelo container — só os métodos usados por handler entram no warm; `page.tsx` 2971→1026 LOC com 5 modais em `next/dynamic` | ✅ melhorado (parcial — ainda > 600 alvo no page.tsx) | `_shared-metrics.md`; `page.tsx:78-92` |
| Connection reuse / keep-alive | Axios `services/conexos.ts:79-82` cria instance com `baseURL`+`timeout` mas SEM `httpAgent` keep-alive. Cada chamada paga handshake TCP+TLS. | ❌ ausente (herdada) | `services/conexos.ts:79-82` |

## 4. Findings (achados)

### F-performance-1: `PermutaAlocacaoRepository.listAtivas` retorna tabela inteira para filtrar por 1 adto (herdada da run 0058)

- **Severidade**: P1
- **Tactic violada**: Increase Resource Efficiency
- **Localização**: `src/backend/domain/repository/permutas/PermutaAlocacaoRepository.ts:97-105` + chamadas em `AlocacaoPermutasService.ts:341,443` e `ReconciliacaoPermutaService.ts:100,115`
- **Evidência (objetiva)**:
  ```ts
  // PermutaAlocacaoRepository.listAtivas — sem LIMIT, sem WHERE (inalterado vs. run 0058)
  `SELECT ... FROM permuta_alocacao ORDER BY adiantamento_doc_cod, criado_em`
  // ReconciliacaoPermutaService.reconciliar (chamado por adto):
  let alocacoes = (await this.alocacaoRepository.listAtivas()).filter(
      (a) => a.adiantamentoDocCod === adiantamentoDocCod,
  );
  // ReconciliacaoLotePermutaService chama reconciliar em LOOP (LOTE_MAX=6) → 6 full-table scans
  ```
- **Impacto técnico**: Cada baixa do lote (6×) faz `SELECT *` da tabela inteira e filtra em memória. À medida que a trilha cresce (cada permuta = N rascunhos), a latência cresce linearmente; combinada com `LOTE_MAX=6` síncrono, contribui para o risco já anotado de timeout do proxy.
- **Impacto de negócio**: Performance do "Executar lote" degrada com volume histórico — a UX piora silenciosamente sem alarme. P1 hoje, vira P0 depois de meses de uso.
- **Métrica de baseline**: chamadas full-scan por lote = `LOTE_MAX × 2 = 12` (uma em `reconciliar` linha 100, outra após `autoAlocar*` linha 115).

### F-performance-2: `ReconciliacaoLotePermutaService` síncrono em request HTTP com risco documentado de timeout do proxy Render (cap=6) (herdada da run 0058)

- **Severidade**: P1
- **Tactic violada**: Bound Execution Times + Schedule Resources
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:10-15,78-103`
- **Evidência (objetiva)**:
  ```ts
  export const LOTE_MAX = 6; // inalterado vs. run 0058
  // for (const docCod of selecionados) { ... reconciliar(...) ... } — sequencial
  ```
  `reconciliar` faz handshake de 5 chamadas `fin010` por adto (criar borderô + 1 baixa por alocação + N por par). 6 adtos × 6 calls × ~500ms ERP = ~18s.
- **Impacto técnico**: Render proxy expira em 30s/60s (depende do plano). Lote completo + Conexos lento (5–10s p99 não é incomum) explode o teto. Falha do proxy = cliente recebe 502 mas o lote pode ter executado parcialmente (continue-on-error confunde diagnose).
- **Impacto de negócio**: P1 já anotado no memory (`permutas-executar-lote-resume`). Decisão de migrar para fluxo assíncrono pendente — risco operacional cresce conforme volume diário de automáticas sobe.
- **Métrica de baseline**: tempo do lote ~p50=10s, p95=18–25s (estimado a partir de 6 × 6 calls Conexos × 200–800ms); timeout do Render proxy 30s.

### F-performance-3: Axios do Conexos sem `httpAgent` keep-alive — handshake TCP+TLS por chamada (herdada da run 0058)

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
  Sem `httpsAgent: new https.Agent({ keepAlive: true })`. Inalterado vs. run 0058. O split em sub-clients (CC-1) **não tocou** este construtor — todos os sub-clients usam o mesmo `LegacyConexosShape` (`legacyConexosAdapter.ts`) → herdam o handshake-por-chamada.
- **Impacto técnico**: Em rede Render→Conexos com RTT ~30ms, ~90–150ms de overhead por chamada × 500 chamadas/run = 45–75s desperdiçados por run. Multiplicado por N filiais paraleliza mas a soma de wall-clock cresce. Com SWR ativo em Borderôs, **cada mount do painel** dispara `refreshCache` em background = 10 filiais × handshake completo.
- **Impacto de negócio**: Eleição/Ingestão diária mais lenta; SWR de borderôs gasta mais que poderia. Pouco visível em produção sem profiling.
- **Métrica de baseline**: overhead por chamada estimado = 90–150ms (1×RTT TCP + 1–2×RTT TLS); 0 keep-alive agents em axios clients backend.

### F-performance-4: `express-rate-limit` com memória in-process — se Render escalar horizontalmente, limite efetivo se multiplica por # instâncias (herdada da run 0058)

- **Severidade**: P2
- **Tactic violada**: Limit Event Response (consistência sob escala)
- **Localização**: `src/backend/http/rateLimit.ts:18-35` + `src/backend/index.ts:31,82`
- **Evidência (objetiva)**:
  ```ts
  export const globalLimiter: RateLimitRequestHandler = rateLimit({
      windowMs: 60_000, limit: 100, ...   // store padrão = MemoryStore
  });
  ```
- **Impacto técnico**: Em single-instance Render é correto. No alvo Lambda multi-tenant (cada cliente uma conta AWS) o `rate-limit` deixa de ser limit global e vira "limit por container" — N containers = N×limit efetivo.
- **Impacto de negócio**: O propósito ("não estourar Conexos MAX_SESSIONS") é exatamente o que vaza quando escalado. P2 hoje (single instance), vira P0 no dia que escalar.
- **Métrica de baseline**: instâncias atuais = 1; limite efetivo = 100 RPM global / 10 RPM heavy; sem store distribuído.

### F-performance-5: `selectMany` sem `LIMIT` em hot reads — 7 sites (herdada da run 0058)

- **Severidade**: P2
- **Tactic violada**: Bound Execution Times + Increase Resource Efficiency
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:514-554` + `PermutaExecucaoRepository.ts:81,127,169` + `PermutaAlocacaoRepository.ts:97`
- **Evidência (objetiva)**:
  ```sql
  SELECT * FROM permuta_adiantamento WHERE NOT stale ORDER BY ... -- sem LIMIT
  SELECT * FROM permuta_invoice WHERE NOT stale AND NOT pago ORDER BY doc_cod ASC -- sem LIMIT
  SELECT * FROM permuta_casamento ORDER BY invoice_doc_cod, adiantamento_doc_cod -- sem LIMIT
  ```
  Estes alimentam o `/permutas/gestao` (chamado a cada load do dashboard). Inalterado vs. run 0058. NOTA: `permuta_bordero` agora tem `LIMIT 50` parametrizado (`PermutaExecucaoRepository.ts:346`) — esse foi tampado.
- **Impacto técnico**: Crescimento linear sem ceiling. Dado os índices presentes o EXPLAIN ainda é índice-scan; quando virar seq-scan (estatística desviar) a latência sobe sem alarme.
- **Impacto de negócio**: Tempo de load do dashboard cresce com volume histórico — degrada UX silenciosamente.
- **Métrica de baseline**: 7 reads sem `LIMIT` em paths chamados de rota HTTP (medido via `grep -L "LIMIT" repository`).

### F-performance-6: Frontend `fetch` sem `AbortController`/timeout — chamadas penduradas indefinidamente (herdada da run 0058)

- **Severidade**: P2
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/frontend/lib/api.ts` (todas as `fetch(...)`, ~25 sites)
- **Evidência (objetiva)**:
  ```
  $ grep -n "AbortController\|signal:\|timeout" src/frontend/lib/api.ts
  (nenhum resultado — inalterado vs. run 0058)
  ```
  **NOTA:** o `BorderosPanel` agora dispara duas chamadas no mount (cache + revalidação) — sem `signal`, ambas continuam pendentes ao desmontar (a flag `active` evita o `setState` mas não cancela a request HTTP).
- **Impacto técnico**: Se o backend ou o Conexos travar, o spinner do front fica eterno. Não há mecanismo de cancelamento ao desmontar — leak de memória; com SWR, a revalidação background continua mesmo após o usuário navegar para outra aba.
- **Impacto de negócio**: Percepção de "travado" em pico de carga ou erro de rede; suporte recebe tickets falsos; com SWR, é particularmente irritante quando o usuário sai do painel — a aba continua segurando uma conexão até o ERP responder.
- **Métrica de baseline**: 0 fetches com timeout/AbortController de 25+ chamadas em `lib/api.ts`.

### F-performance-7: `page.tsx` ainda 1026 LOC (alvo ≤ 600) — split do god component está parcial (parcial-fix da F-performance-5 da run 0058)

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead + Bundle leanness
- **Localização**: `src/frontend/app/permutas/page.tsx:1-1026`
- **Evidência (objetiva)**:
  ```
  $ wc -l src/frontend/app/permutas/page.tsx
  1026                    # era 2971 pré-CC-1 (−65%) — meta ≤ 600
  $ grep -c 'useState\b' page.tsx → 24      # era 35; meta ≤ 10
  $ grep -c 'useMemo\|useCallback' page.tsx → 12  # era 18; meta ≤ 8
  $ grep -n "React.memo" components/Aba*.tsx
  AbaAutomaticas.tsx:26: export const AbaAutomaticas = React.memo(...)
  AbaMultiplas.tsx:10
  AbaCrossOver.tsx:10
  AbaCrossProcess.tsx:10
  AbaHistorico.tsx:74
  $ grep -n "dynamic(" page.tsx → 5         # ConfirmarProcessamento, ConfirmarLote, Ingestao, Alocar, Reconciliar
  ```
- **Impacto técnico**: O re-render acidental cross-aba foi mitigado (abas memoizadas + props estáveis via `useCallback`), mas o raiz ainda concentra: dados (`data`, `statusPorAdto`), filtros (`filtro`, `filtroFilial`, `filtroExportador`, `filtroInvoiceTipo`, `vista`, `pagina`), 6 handlers de mutação (`executarLote`, `executarReconciliar`, `adicionarAloc`, ...) e a derivação `historico` montada inline a cada render. Bundle do shell ainda paga TODO o JSX da árvore principal (modais foram code-split, mas as 6 abas — embora memoizadas — vão no chunk principal).
- **Impacto de negócio**: A UX melhorou em ações que mexem só na aba ativa (memo evita repintar Borderôs ao filtrar Automáticas), mas qualquer setState no raiz ainda repinta todos os filtros + KPIs. Coverage frontend cresceu de ~baixo para 12 arquivos de teste — sinal de que a quebra está habilitando teste. Para fechar o ciclo, falta extrair filtros + estado de paginação (~200 LOC) e os 6 handlers de mutação (~300 LOC) para hooks.
- **Métrica de baseline**: 1026 LOC; 24 useState; 12 useMemo/useCallback; 5/5 abas em `React.memo`; 5 modais em `next/dynamic`.

## 5. Cards Kanban

### [performance-1] Substituir `listAtivas` por queries indexadas com filtro — `findByAdiantamento(docCod)` + LIMIT

- **Problema**
  > `PermutaAlocacaoRepository.listAtivas()` carrega a tabela inteira para o caller filtrar 1 adto em memória. É chamada em `ReconciliacaoPermutaService.reconciliar` (linha 100 e 115) — dentro do loop do `reconciliar-lote` (LOTE_MAX=6). Custo cresce linearmente com a trilha histórica. Inalterado em relação à run 0058.

- **Melhoria Proposta**
  > Adicionar `findByAdiantamento(adtoDocCod: string): Promise<AlocacaoRow[]>` ao repo, com `WHERE adiantamento_doc_cod = $docCod` (usa `idx_permuta_alocacao_adto` já existente da migration 0014). Substituir os 4 call-sites em serviço. Manter `listAtivas` só para `GestaoPermutasService.exporGestao` (lê tudo de propósito).

- **Resultado Esperado**
  > Linhas lidas por baixa no lote: `|alocacoes_total|` → ≤ N (alocações do adto, tipicamente 1–10). Bandwidth Postgres por lote completo: O(|alocacoes_total| × 6) → O(N × 6). Para 1000 alocações na trilha: 12000 rows lidas → ≤ 60.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - rows lidas por `reconciliar-lote` (n=6, trilha 1000): 12000 → ≤ 60
  - latência p95 do `reconciliar-lote` em ambiente sintético: medir antes/depois
- **Risco de não fazer**: P1 hoje (volume baixo), vira P0 quando a trilha passar de ~10k linhas.
- **Dependências**: nenhuma

### [performance-2] Migrar `reconciliar-lote` para job assíncrono com endpoint de status (resolve o risco de timeout do proxy)

- **Problema**
  > `LOTE_MAX=6` síncrono em request HTTP roda 6 adtos × ~6 chamadas `fin010` = ~36 calls sequenciais, ~10–25s wall-clock. Render proxy expira em 30–60s. Se o Conexos estiver lento (5–10s p99 documentado), o lote ultrapassa o teto e o cliente recebe 502 com estado parcialmente aplicado. Risco já anotado no memory (`permutas-executar-lote-resume`). Inalterado vs. run 0058.

- **Melhoria Proposta**
  > Quebrar o fluxo: `POST /permutas/reconciliar-lote` apenas enfileira (`pg-boss`/tabela `permuta_lote_job` com status `pending`/`running`/`done`/`failed`) e devolve `202 Accepted + { jobId }`; um worker (no mesmo processo, via `setImmediate`-loop OU job runner externo) processa cada lote. Frontend faz polling em `GET /permutas/lote/:jobId` (200/404/410) usando `PollExecutor`-equivalente do FE (com timeout — depende do [performance-4]).

- **Resultado Esperado**
  > Timeouts 502 do proxy em `/reconciliar-lote`: indeterminado → **0**. Tempo de resposta HTTP da rota: 10–25s → **< 500ms** (só enfileira). Tempo de processamento do lote: igual (~15–25s), mas em background, com progress observável.

- **Tactic alvo**: Bound Execution Times + Schedule Resources
- **Severidade**: P1
- **Esforço estimado**: L
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - latência p95 HTTP `POST /reconciliar-lote`: 10–25s → < 500ms
  - timeouts 502 em 30 dias: medir antes/depois (alvo 0)
  - lotes com estado parcialmente aplicado por timeout do proxy: alvo 0
- **Risco de não fazer**: O sistema fica refém do plano Render — escalar volume diário aumenta exposição a 502s. Quando migrar para Lambda (alvo), API Gateway tem teto rígido de 29s.
- **Dependências**: decidir job runner (in-process loop vs. `pg-boss` vs. SQS — alinhado ao alvo Lambda); coordenar com [performance-4] para o `fetchWithTimeout` no polling

### [performance-3] Habilitar HTTP keep-alive no axios do Conexos — virou hot path agora que Borderôs faz SWR a cada mount

- **Problema**
  > `services/conexos.ts:79-82` cria axios sem `httpsAgent`. Cada chamada paga handshake TCP+TLS (~90–150ms a 30ms RTT). Inalterado vs. run 0058. **Agravante NOVO desta run:** com a SWR de `BorderosPanel` (cache-first → revalida ERP em background), cada mount da aba Borderôs dispara `refreshCache` = 10 filiais × handshake → 0.9–1.5s de overhead que poderia ser ~50–100ms.

- **Melhoria Proposta**
  > Adicionar `httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10 })` (e o equivalente `httpAgent` para tenants HTTP, se houver). `maxSockets=20` casa com `FILIAIS_CONCURRENCY × ADIANTAMENTOS_CONCURRENCY` da Eleição. Por estar no `services/conexos.ts` (LegacyConexosShape), o ganho propaga para os 4 sub-clients de uma só vez.

- **Resultado Esperado**
  > Overhead por chamada Conexos: 90–150ms → ~5–10ms (apenas RTT 1×). Tempo da revalidação SWR de Borderôs (10 filiais): ~1.0s → ~200ms. Tempo total de uma Eleição multi-filial (sintético, 500 chamadas): redução estimada de 40–70s wall-clock total.

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P2 (sobe para P1 quando volume de mounts Borderôs subir — analista abre o painel várias vezes por dia)
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - axios clients com keep-alive agent: 0 → 1 (Conexos, herdado pelos 4 sub-clients)
  - duração da revalidação SWR Borderôs em dev (10 filiais): ~1.0s → ≤ 300ms
- **Risco de não fazer**: A SWR de Borderôs entregou TTFB rápido (cache) mas a revalidação background fica visivelmente custosa — o chip "atualizando…" demora a sair, contradizendo a UX prometida.
- **Dependências**: nenhuma

### [performance-4] Cobrir `fetch` do frontend com `AbortController` + timeout (15s default, 60s para ingestão) — virou mais urgente com SWR

- **Problema**
  > Nenhuma das ~25 chamadas `fetch` em `src/frontend/lib/api.ts` tem timeout ou `signal`. Se backend/Conexos travar, spinner é eterno; setState após unmount = leak. **Agravante NOVO desta run:** o SWR de `BorderosPanel` (`useEffect` em `BorderosPanel.tsx:117-144`) dispara DUAS chamadas no mount — a flag `active` evita o `setState`, mas a request HTTP em si não é abortada. Usuário que sai da aba mantém uma conexão aberta até o ERP responder.

- **Melhoria Proposta**
  > Criar wrapper `fetchWithTimeout(url, opts, timeoutMs = 15_000)` que monta `AbortController` interno e rejeita com `TimeoutError` no estouro. Substituir os call-sites; usar 60_000ms para `runIngestaoManual`. Reescrever o cleanup do `useEffect` de `BorderosPanel` para usar `AbortController` no lugar da flag `active` — request HTTP é cancelada de fato no unmount.

- **Resultado Esperado**
  > Spinner infinito em rotas penduradas: comportamento atual → erro pt-BR amigável em ≤ 15s (60s para ingestão). `# fetches sem timeout`: 25 → 0. Requisições órfãs após unmount do BorderosPanel: indeterminado → 0 (abortadas via `signal`).

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - fetches sem timeout em `lib/api.ts`: 25 → 0
  - requisições órfãs por sessão de uso (medir em DevTools Network → "leftover" pending requests após navegação): N → 0
  - tickets de suporte "tela travada": medir antes/depois (alvo: queda)
- **Risco de não fazer**: UX ruim em pico/erro; com SWR ativo, é particularmente visível porque o "atualizando…" pode girar para sempre se o ERP timeout silenciosamente.
- **Dependências**: nenhuma; pré-requisito recomendado para [performance-2] (polling do job lote precisa de timeout)

### [performance-5] Adicionar `LIMIT` defensivo + paginação aos hot reads de `permuta_*`

- **Problema**
  > 7 `selectMany` em hot paths sem `LIMIT` (listAtivas, listAdiantamentosAtivos, listInvoicesEmAberto, listDeclaracoes, listCasamentos, listImportadores, listComBordero). Hoje rápido — escala linear sem teto. Sem alarme quando virar problema. Inalterado vs. run 0058 (`listBorderoCache` já foi tampado com `LIMIT $limit`).

- **Melhoria Proposta**
  > 1. Cada read recebe um `LIMIT $limit` parametrizado com default sensato (5000 para os de leitura ativa; 500 para `listComBordero`). 2. Quando o `rowCount` igualar o limit, emitir `LogService.warn(BUSINESS_WARN, 'limit hit')` — sinal claro de que cresceu além do dimensionamento. 3. Cardinalidade > 10k em qualquer um dos 7 reads → quebrar em paginação cursor-based.

- **Resultado Esperado**
  > Reads sem `LIMIT` em hot paths: 7 → 0. Warnings de "limit hit" em produção: 0 (alvo). Bound de pior caso para o `/permutas/gestao`: definido (vs. unbounded hoje).

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - `# selectMany sem LIMIT em rotas HTTP`: 7 → 0
  - presença do warn "limit hit" como alarme observável: ausente → presente
- **Risco de não fazer**: P2 hoje, vira P0 silenciosamente se a operação dobrar de volume.
- **Dependências**: nenhuma

### [performance-6] Continuar o split de `page.tsx` — extrair filtros + handlers de mutação para hooks; meta ≤ 600 LOC

- **Problema**
  > Pós-CC-1, `page.tsx` caiu de 2971 → 1026 LOC com `React.memo` em 5 abas e `next/dynamic` em 5 modais — re-render cross-aba e bundle dos modais resolvidos. Mas o raiz ainda concentra 24 `useState`, 12 `useMemo/useCallback` e 6 handlers de mutação (`executarLote`, `executarReconciliar`, `adicionarAloc`, `removerAloc`, `buscarAloc`, `confirmarProcessamento`) — qualquer setState do raiz ainda repinta filtros + KPIs.

- **Melhoria Proposta**
  > 1. Extrair `useFiltros()` (filtro/filial/exportador/paginação/vista) — ~200 LOC. 2. Extrair `useAlocacaoManual()` (estado + handlers `abrirAlocar`/`buscarAloc`/`adicionarAloc`/`removerAloc`) — ~150 LOC. 3. Extrair `useReconciliar()` (estado + `abrirReconciliar`/`executarReconciliar`) — ~80 LOC. 4. Extrair `useLote()` (`executarLote` + `loteResumo`) — ~70 LOC. 5. Manter o JSX no `page.tsx`, hooks importados de `./hooks/`.

- **Resultado Esperado**
  > LOC `page.tsx`: 1026 → ≤ 600. `useState` no raiz: 24 → ≤ 10. `useMemo/useCallback` no raiz: 12 → ≤ 8. Re-render do raiz em mudança de filtro: vira re-render de `useFiltros` only (já está isolado pelas abas memo, mas KPIs ainda re-pintam). Coverage do FE: cresce conforme hooks ficam testáveis em isolamento.

- **Tactic alvo**: Reduce Overhead + Bundle leanness
- **Severidade**: P2 (era P1 na run 0058 — rebaixado porque CC-1 já entregou as wins mais visíveis)
- **Esforço estimado**: M
- **Findings relacionados**: F-performance-7
- **Métricas de sucesso**:
  - LOC `page.tsx`: 1026 → ≤ 600
  - useState/useMemo+useCallback no raiz: 24/12 → ≤ 10/≤ 8
  - First Load JS `/permutas`: medir baseline (próximo run com `npm run build`) → ≤ 200KB
  - frontend coverage (lines): medir baseline → +10pp
- **Risco de não fazer**: O re-render do raiz continua impactando KPIs/filtros em cada interação; coverage para um arquivo de 1026 LOC permanece baixa porque hooks de mutação não são testáveis em isolamento.
- **Dependências**: nenhuma (refactor incremental — pode ser feito hook a hook)

## 6. Notas do agente

- **Re-pontuação solicitada para F-performance-5 (run 0058):** as evidências confirmam que CC-1 entregou as duas wins canônicas — `React.memo` em 5/5 abas (`AbaAutomaticas.tsx:26`, `AbaMultiplas.tsx:10`, `AbaCrossOver.tsx:10`, `AbaCrossProcess.tsx:10`, `AbaHistorico.tsx:74`) e `next/dynamic` em 5/5 modais (`page.tsx:78-92`). LOC do raiz caiu 65% (2971→1026). Re-pontuado: a parte "re-render acidental cross-aba" e "bundle dos modais" está fechada; sobrou apenas "estado/handlers concentrados no raiz" → reclassificado como F-performance-7 (P2, era P1).
- **SWR validado:** `BorderosPanel.tsx:117-144` faz cache-first (`fetchBorderos(false)`) seguido de revalidação em background (`fetchBorderos(true)`); o chip "atualizando…" (linhas 263-266 e 279-282) é ligado a `setAtualizando(true)` — UX consistente. A flag `active` no cleanup evita `setState` após unmount, **mas não cancela a request HTTP** — daí o agravante NOVO em F-performance-6/card performance-4.
- **Dois P0 da run 0058 fechados:** F-performance-1 (`buscarInvoices` agora usa `boundedConcurrency.map(...,INVOICES_CONCURRENCY=8)` — `AlocacaoPermutasService.ts:121,175`); F-performance-2 (`alocar` aceita `prefetchedInvoices?` — linha 189; `criarRascunhosAtomico` passa `invoicesAll` — linha 385). Quadrático O(N²) → linear.
- **Score subiu 5 → 7:** dois P0 fechados, um P1 (god component) virou parcial-P2, SWR adicionado, split do `ConexosClient` melhora bundle leanness do backend (alvo Lambda). Restam 4 herdadas (P1/P2) + 1 nova classificação (performance-6 sucessor).
- **Cross-QA detectado para o `qa-consolidator`**:
  - **Availability + Fault Tolerance**: F-performance-3 (sem keep-alive) e F-performance-6 (fetch sem AbortController) sobrepõem-se a "Timeouts em dependências externas"; F-performance-2 (lote síncrono) toca "Graceful degradation".
  - **Deployability + Modifiability**: F-performance-7 (split incremental de page.tsx) é também débito de modificabilidade; F-performance-4 (rate-limit in-memory) vira P0 sob escala multi-instance — relevante para o alvo Lambda multi-tenant.
  - **Modifiability (schema as code)**: F-performance-1 e F-performance-5 dependem de discipline de migrations e covering-index.
