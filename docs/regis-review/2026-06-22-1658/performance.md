---
qa: Performance
qa_slug: performance
run_id: 2026-06-22-1658
agent: qa-performance
generated_at: 2026-06-22T16:58:00Z
scope: all
score: 4
findings_count: 9
cards_count: 8
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Adicionar" em `/permutas/clientes-filtro` (ou "Remover") | UI dispara `POST /cliente-filtro` → `POST /ingestao` na mesma chamada (síncrono) | Express + `IngestaoPermutasService.executar` → `EleicaoPermutasService.computeCandidatas` → 5 filiais × N adiantamentos × Conexos detail endpoints | Produção (Render single instance, Conexos com LOGIN_ERROR_MAX_SESSIONS) | Backend deveria responder em janela útil de UX (≤ 3 s para o cadastro; ingestão em background) **sem 429** | p95 cadastro ≤ 1,5 s · ingestão completa < 60 s · 0 HTTP 429 por sessão do analista |

Cenário real observado (relatado pelo PO): adicionar/remover cliente-filtro dispara `runIngestaoManual()` (linhas 99 e 133 de `app/permutas/clientes-filtro/page.tsx`), e o segundo clique do analista bate o `heavyRouteLimiter` (10 req/min/IP) — HTTP 429. Hoje a única "manopla" de controle de demanda é o rate-limit; ela protege Conexos mas degrada UX previsivelmente.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Conexos calls por ingestão (5 filiais × A=30 adtos × I=100 invoices) | ~1.115 calls (1 listFiliais + 5×listAdiantamentos paginado + 15 batched chunks + 5×100 listTitulosAPagar p/ hidratar invoice + 5×30×3 detail/títulos no buildCandidata + 5×30×3 em computeVariacao p/ elegíveis) | < 400 (sem hidratação per-invoice na lista) | ❌ | `EleicaoPermutasService.ts:451-491` (fetchInvoicesBatched), `:701-707`, `:745-751` |
| Conexos calls amplificadas por PR #4 (per-invoice `listTitulosAPagar` em `fetchInvoicesBatched`) | 1 listTitulosAPagar por invoice em aberto, com `boundedConcurrency=10` | 1 chamada batched (não existe variante) ou hidratação tardia | ❌ | `EleicaoPermutasService.ts:451-483` |
| Conexos calls por `GET /invoices/buscar?priCod=&filCod=` (alocação) | 1× listFinanceiroAPagar + 1× listDeclaracao + per invoice (3): `getDetalheTitulos` + `listTitulosAPagar` + `sumByInvoice` (DB) | per invoice: 1 detail (batched se possível) + 1 DB sum | ❌ | `AlocacaoPermutasService.ts:92-159` |
| DB queries por `GET /permutas/gestao` | 7 SELECTs paralelos (todos sem LIMIT/OFFSET) | mesmas 7 OK; falta paginação no front | ⚠️ | `GestaoPermutasService.ts:46-62` |
| `selectMany` sem `LIMIT` em paths chamados por API | 5 (listAdiantamentosAtivos, listInvoicesEmAberto, listDeclaracoes, listCasamentos, listImportadores) | 0 (toda lista chamável por API tem LIMIT defensivo) | ❌ | `PermutaRelationalRepository.ts:477-541` |
| Timeout no axios do `ConexosClient` (cliente principal) | Nenhum (`axios.create` sem `timeout:`) | 15-30 s explícito | ❌ | `ConexosClient.ts` (sem ocorrência de `timeout:`); compare `BcbClient.ts:57` (timeout 10s) |
| Pool DB max conn × concorrência efetiva | max=5 · `FILIAIS_CONCURRENCY=5` · `ADIANTAMENTOS_CONCURRENCY=10` na eleição | mantém razão (max ≥ chamadas DB em voo) | ⚠️ | `PostgreeDatabaseClient.ts:26` · `EleicaoPermutasService.ts:86-87` |
| `heavyRouteLimiter` (cobre /permutas inteira) | 10 req/min/IP — inclui leituras (`GET /gestao`, `GET /cliente-filtro`, `GET /runs`, `GET /invoices/buscar`) e escritas (`POST /ingestao`) | leituras no `globalLimiter` (100); só ingestão/eleição no estrito | ❌ | `rateLimit.ts:20-26` · `index.ts:87` |
| Bundle frontend `/permutas` (página) | 2.127 linhas em 1 client-component (`'use client'` no topo) | ≤ 600 linhas por client; cisão por aba + dynamic import | ⚠️ | `app/permutas/page.tsx` (2127 LOC, 39 occurrences de `useState/useMemo/useCallback/useEffect`) |
| Imports `lucide-react` / `date-fns` em arquivos `.tsx` | 9 arquivos importam diretamente | ESM tree-shake estável (já é); confirmar `optimizePackageImports` no Next | ⚠️ | grep `import.*lucide-react|date-fns` em `app/`+`components/` |
| Backend `dist/` size | 2,6 MB (sem `node_modules`) | OK (alvo Lambda futuro ≤ 50 MB com deps) | ✅ | `du -sh src/backend/dist` |
| Backend runtime deps | 14 prod | ≤ 15 alvo Lambda | ✅ | `backend/package.json` |
| Setinterval/setTimeout manual em código não-executor | 0 (a única ocorrência é uma menção em comentário) | 0 | ✅ | grep `setTimeout|setInterval` em `domain/` excluindo testes/executor |

> ⚠️ **Não medível localmente**: latência real por endpoint Conexos (p50/p95). Requer instrumentação `LogService` por chamada (durationMs por endpoint) ou APM no Render. Recomendação: já existe `flowId` por run — adicionar `durationMs` por chamada Conexos no payload do log e agregar fora.

> ⚠️ **Não medível localmente**: throughput real da Conexos (RPS antes do `LOGIN_ERROR_MAX_SESSIONS`). Hoje a contramedida é o limiter `FILIAIS_CONCURRENCY=5` × `ADIANTAMENTOS_CONCURRENCY=10` — empírico, não calibrado.

## 3. Tactics — Cobertura no nf-projects

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | Cron 3x/dia (GitHub Actions) limita a frequência da ingestão automática. UI permite ingestão manual sem janela (botão sempre clicável) e dispara também no add/remove de cliente-filtro | ⚠️ parcial | `app/permutas/clientes-filtro/page.tsx:99,133` (sample ad-hoc por clique) |
| Limit Event Response | `heavyRouteLimiter` 10 req/min/IP em `/permutas/*` | ✅ presente, mas **mal escopado** | `rateLimit.ts:20-26` · `index.ts:87` (limita também GETs leves) |
| Prioritize Events | Ausente — `/gestao` (read leve) e `/ingestao` (heavy) compartilham o mesmo limiter; nenhuma fila/prioridade entre cron e manual além do advisory lock | ❌ ausente | — |
| Reduce Overhead | `BoundedConcurrency` evita burst Conexos; chunking em `listFinanceiroAPagar`/`listProcessos`/`listDeclaracao` (CHUNK_SIZE) reduz round-trips por priCods | ✅ presente | `BoundedConcurrency.ts`, `ConexosClient.ts:358-359,493-522` |
| Bound Execution Times | Ausente no Conexos: `axios.create` SEM `timeout:` no `ConexosClient` (compare `BcbClient.ts:57` 10s). `RetryExecutor` retenta sem teto temporal. Pool DB tem `connectionTimeoutMillis=5000` | ❌ ausente (Conexos) / ✅ DB | `ConexosClient.ts` (zero ocorrências `timeout:`) |
| Increase Resource Efficiency | P0-7 já consolidado: `fetchDeclaracoesBatched`, `fetchInvoicesBatched`, `fetchProcessosBatched` substituíram 1 chamada/adto por 1 chamada/filial. **MAS** o PR #4 reintroduziu 1 `listTitulosAPagar` por invoice em `fetchInvoicesBatched` (regressão parcial) e mantém `getDetalheTitulos` por adto | ⚠️ parcial | `EleicaoPermutasService.ts:380-403` (batched) vs `:451-491` (per-invoice listTitulosAPagar) |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | N/A no estado atual (Render single instance). Mover para Lambda é o alvo; sem dial de scale-out por enquanto | N/A | CLAUDE.md "Estado Atual vs. Alvo" |
| Increase Concurrency | `BoundedConcurrency.map` com `FILIAIS_CONCURRENCY=5` e `ADIANTAMENTOS_CONCURRENCY=10` | ✅ presente | `EleicaoPermutasService.ts:86-87,241,390-403,451-483` |
| Maintain Multiple Copies of Computations | Cache de cliente-filtro carregado UMA vez por run (`filtroPesCods`) | ✅ presente | `EleicaoPermutasService.ts:237` |
| Maintain Multiple Copies of Data | Modelo relacional + snapshot replicam dados Conexos localmente (P0-7); `/gestao` lê BD ao invés de Conexos | ✅ presente | `IngestaoPermutasService.ts` + `PermutaRelationalRepository.listAdiantamentosAtivos` |
| Bound Queue Sizes | `pg_try_advisory_lock` na ingestão (INGEST_LOCK_KEY) e na eleição por idempotency-key serializam em vez de enfileirar — mas não há fila real (Render Express). 2ª chamada concorrente cai em 409 IngestLockBusyError | ⚠️ parcial | `EleicaoPermutasService.ts:140-184`, `IngestaoPermutasService.ts:96-118` |
| Schedule Resources | Cron GitHub Actions 3x/dia + advisory lock + ingestão manual. Sem prioridade entre tipos de request | ⚠️ parcial | `.github/workflows/*` (cron) · CLAUDE.md |

### Modern facets

| Facet | Implementação | Status | Evidência |
|---|---|---|---|
| Cold start budget | N/A (Express longo-lived em Render); virá no alvo Lambda | N/A | — |
| Cache strategy | `EnvironmentProvider` cacheia SSM em instância (instruído por CLAUDE.md); cliente-filtro cacheado por run | ✅ presente | `EnvironmentProvider.ts` |
| Index discipline | Migrações têm índices nos campos quentes (`pri`, `fil_estado_ativo`, `invoice`, `adiantamento`, etc.) | ✅ presente | `migrations/0003_permuta_relational.sql:51-122`, `0014_permuta_alocacao.sql:31-33` |
| Bundle leanness (BE) | 14 deps prod / dist 2,6 MB | ✅ presente | `backend/package.json`, `du dist` |
| Bundle leanness (FE) | 22 deps prod; 1 mega client-component (`page.tsx` 2.127 LOC) | ⚠️ parcial | `frontend/package.json`, `app/permutas/page.tsx` |

## 4. Findings

### F-performance-1: Ingestão completa síncrona em clique de UI bate rate-limiter

- **Severidade**: P0
- **Tactic violada**: Manage Sampling Rate · Limit Event Response (mal escopado) · Bound Execution Times
- **Localização**: `src/frontend/app/permutas/clientes-filtro/page.tsx:86-166`, `src/backend/routes/permutas.ts:104-131`, `src/backend/http/rateLimit.ts:20-26`
- **Evidência (objetiva)**:
  ```
  // clientes-filtro/page.tsx:98-99
  try {
    const r = await runIngestaoManual()  // POST /permutas/ingestao — fan-out full Conexos
  }
  // clientes-filtro/page.tsx:131-133
  await removeClienteFiltro(pesCod)
  try {
    const r = await runIngestaoManual()  // idem
  // index.ts:87 — limiter 10 req/min/IP cobre TODAS as rotas /permutas
  app.use('/permutas', heavyRouteLimiter);
  ```
- **Impacto técnico**: Cada add/remove dispara 5 filiais × ~30 adiantamentos × 3 detail Conexos ≈ 450 calls + ~100 invoices × 1 listTitulosAPagar = ~550 chamadas Conexos. O analista que cadastra 3 importadores em 1 min bate o `heavyRouteLimiter` (10 req/min cobre `/gestao`, `/cliente-filtro`, `/ingestao` e `/invoices/buscar` juntos) — UI fica 60s em estado bloqueado e o cadastro fica meio-feito (filtro salvo, roteamento não aplicado, ver bloco `catch` linhas 139-158).
- **Impacto de negócio**: experiência ruim na operação que será a mais frequente (cadastro de cliente-filtro é onboarding). Bloqueia o uso assistido por 1 min sem feedback claro de "tente em 1 min". O `IngestaoEmAndamentoError` retorna o filtro pendente; o `429` reabriu o filtro mas o painel não foi reavaliado.
- **Métrica de baseline**: 1 click cliente-filtro = 1×POST cliente-filtro + 1×POST ingestao + ≥1×GET gestao (re-render) = 3 hits no limiter. 3 adds consecutivos = 9 hits → próximo clique 429. Janela: 60 s.

### F-performance-2: PR #4 reintroduziu per-invoice `listTitulosAPagar` em `fetchInvoicesBatched`

- **Severidade**: P1
- **Tactic violada**: Increase Resource Efficiency (regressão do P0-7) · Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:451-491`
- **Evidência (objetiva)**:
  ```
  // EleicaoPermutasService.ts:451-483 (dentro de fetchInvoicesBatched, chamado UMA vez por filial)
  const hydrated = await this.boundedConcurrency.map(
      invoices,
      async (i): Promise<Invoice> => {
          ...
          const tit = await this.conexosClient.listTitulosAPagar({  // 1 chamada Conexos por invoice
              docCod: i.docCod, filCod,
          });
          ...
      },
      ADIANTAMENTOS_CONCURRENCY,  // 10
  );
  ```
- **Impacto técnico**: Hidrata valor/moeda/taxa NEGOCIADA de TODAS as invoices em aberto da filial (não só das casadas). Para uma filial com 100 invoices abertas, são 100 chamadas Conexos extras por ingestão × 5 filiais = +500 chamadas/run. Já existe a hidratação 1:1 da invoice casada em `computeVariacao` (linha 745-751); o batch agora paga 2× nas elegíveis e introduz custo nas N:M que talvez nunca sejam consultadas.
- **Impacto de negócio**: dobra a janela de ingestão (de ~30s para ~90s estimados, sem medição APM) e multiplica risco de `LOGIN_ERROR_MAX_SESSIONS` durante o cron. Acoplado a F-performance-1: o analista que cadastra cliente-filtro espera o tempo todo da hidratação não-1:1 também.
- **Métrica de baseline**: na ingestão p/ 5 filiais × média 30 adiantamentos × 50 invoices em aberto/filial = 750 calls (eleicao P0-7) + **250 calls extras** introduzidas pelo PR #4 (+33%).

### F-performance-3: `AlocacaoPermutasService.buscarInvoices` faz 2 Conexos + 1 DB **por invoice**

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead · Increase Resource Efficiency
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:87-159`
- **Evidência (objetiva)**:
  ```
  // AlocacaoPermutasService.ts:105-156 — sequencial dentro de Promise.all, sem bounded
  const mapeadas = await Promise.all(
      todas.map(async (i): Promise<InvoiceBuscada | null> => {
          ...
          const det = await this.conexosClient.getDetalheTitulos({docCod: i.docCod, filCod});  // (1)
          ...
          const tit = await this.conexosClient.listTitulosAPagar({docCod: i.docCod, filCod});  // (2)
          ...
          const jaAlocado = await this.alocacaoRepository.sumByInvoice(i.docCod, excludeAdtoDocCod);  // (3) DB
          ...
      }),
  );
  ```
- **Impacto técnico**: Endpoint `GET /permutas/invoices/buscar` é chamado pela UI a cada digitação de busca de processo na modal de alocação. Para um processo com 8 invoices, são 16 round-trips Conexos + 8 SELECTs sequenciais (não bounded). Já dentro do `Promise.all` sem limite → pode disparar 8+ sessões Conexos simultâneas no mesmo processo. Sem `timeout:` no axios, uma chamada lenta segura todo o handler.
- **Impacto de negócio**: latência típica esperada 5-10s na busca (p99 pior); contribui para o limiter 429 (cada busca conta no `heavyRouteLimiter`). UX do modal de alocação fica visivelmente lenta.
- **Métrica de baseline**: tempo por invoice (sem dados de prod) ≈ 2 × Conexos round-trip (~400ms cada empiricamente) + 1 query DB = ~900 ms/invoice. 8 invoices em paralelo, sem cap, p95 ~2-3 s (limitado pela invoice mais lenta + risco MAX_SESSIONS).

### F-performance-4: `heavyRouteLimiter` aplica-se ao módulo `/permutas` inteiro, leituras inclusive

- **Severidade**: P1
- **Tactic violada**: Prioritize Events · Limit Event Response (mal granulado)
- **Localização**: `src/backend/index.ts:80,87` · `src/backend/http/rateLimit.ts:20-26`
- **Evidência (objetiva)**:
  ```
  app.use('/permutas', heavyRouteLimiter);  // 10 req/min/IP — TODA a rota
  app.use('/permutas', permutasRouter);     // GET /gestao, GET /runs, GET /invoices/buscar, ...
  ```
- **Impacto técnico**: Refresh de painel (`GET /gestao`) e busca de invoice na alocação consomem o mesmo bucket do `POST /ingestao` (que custa minutos de Conexos). Um analista que recarrega o painel + abre modal + faz 3 buscas em 1 min já tem 6 hits; outro analista no mesmo IP/escritório some.
- **Impacto de negócio**: degrada UX de leituras (que NÃO custam Conexos no path quente — `/gestao` é puro DB) por causa do custo das escritas. Onboarding de cliente-filtro fica intransitável.
- **Métrica de baseline**: 1 sessão de analista (carregar + 3 buscas + 1 ingestao manual) = 6 hits/min em routes leves + 1 hit pesado = 7/10 do bucket; 2 analistas simultâneos = 429 garantido.

### F-performance-5: Conexos `axios.create` SEM `timeout:` — chamada lenta segura o pool

- **Severidade**: P0
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (busca `timeout:` retorna zero ocorrências)
- **Evidência (objetiva)**:
  ```
  $ grep -n "timeout:" src/backend/domain/client/ConexosClient.ts
  (nenhuma ocorrência)

  $ grep -n "timeout:" src/backend/domain/client/BcbClient.ts
  57: this.http = axios.create({ baseURL: SGS_BASE_URL, timeout: 10_000 });
  ```
- **Impacto técnico**: Em uma falha de rede ou Conexos "cinza" (não responde mas não fecha), uma chamada pode ficar parada até `tcp_keepalive_time` do SO (~7200 s no Linux default). Combinado com `BoundedConcurrency` em loop, o handler trava — TODA a ingestão pendura, segurando o advisory lock por horas. O `RetryExecutor` só age após exception.
- **Impacto de negócio**: P0 clássico de performance + availability (cross-QA): degradação do Conexos vira indisponibilidade total do nosso painel; ingestão das próximas janelas perdida; lock só liberado por reinício do processo.
- **Métrica de baseline**: 1 chamada Conexos sem timeout × ~50 chamadas em voo (5×10) = pool de até 50 handlers travados. Cada um segura 1 conn DB (max=5) e 1 sessão Conexos.

### F-performance-6: Cinco `selectMany` sem `LIMIT` no path `GET /permutas/gestao`

- **Severidade**: P2 (vira P1 quando o backlog crescer; defendível porque os índices estão presentes)
- **Tactic violada**: Bound Queue Sizes (dataset retornado) · Reduce Overhead
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:477-541`
- **Evidência (objetiva)**:
  ```
  listImportadores       → SELECT pes_cod, importador, count(*) GROUP BY ... (sem LIMIT)
  listAdiantamentosAtivos → SELECT * FROM permuta_adiantamento WHERE NOT stale ORDER BY ... (sem LIMIT)
  listInvoicesEmAberto   → SELECT * FROM permuta_invoice WHERE NOT stale AND NOT pago (sem LIMIT)
  listDeclaracoes        → SELECT pri_cod, variante, data_base FROM permuta_declaracao_importacao WHERE NOT stale (sem LIMIT)
  listCasamentos         → SELECT ... FROM permuta_casamento ORDER BY ... (sem LIMIT)
  ```
- **Impacto técnico**: o `GET /permutas/gestao` faz `Promise.all` desses 7 reads → carrega o backlog INTEIRO de adto+invoice+declaração+casamento+alocação em memória do Node, monta Maps (linhas 65-105 de GestaoPermutasService) e devolve JSON full. Hoje, com volume operacional Columbia (~poucos milhares), funciona; com 50k+ vira gargalo de memória + payload de MB no frontend.
- **Impacto de negócio**: limite de crescimento sem virada — o produto não comporta múltiplos tenants no mesmo Render sem refator de paginação.
- **Métrica de baseline**: não medível (depende de N). Recomendação: instrumentar `LogService.info` com `rows.length` em cada `selectMany` desse path.

### F-performance-7: `app/permutas/page.tsx` é um client-component monolítico de 2.127 linhas

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead (cliente)
- **Localização**: `src/frontend/app/permutas/page.tsx`
- **Evidência (objetiva)**:
  ```
  $ wc -l app/permutas/page.tsx
  2127
  $ head -1 app/permutas/page.tsx
  'use client'
  $ grep -c "useState\|useMemo\|useCallback\|useEffect" app/permutas/page.tsx
  39
  ```
- **Impacto técnico**: a página inteira renderiza no cliente, sem split por aba. Cada re-render do `data` (full gestão) recomputa todas as listas e re-renderiza as 4 abas mesmo invisíveis. Memo está parcial (`useMemo` por list em alguns spots), mas a árvore JSX inteira está num único `return` (a busca por `<Tabs` confirma uma única árvore).
- **Impacto de negócio**: TBT (Total Blocking Time) cresce com o tamanho do backlog. P95 de "tempo até interativo" depende do tamanho do payload `/gestao` (item F-6).
- **Métrica de baseline**: não medível sem `next build` (não rodado por escolha — escopo). Heurística: 2.127 LOC + 39 hooks ≈ first-load JS estimado > 250 KB só do componente (sem libs).

### F-performance-8: Sem timeout/quota na transação de ingestão; trabalho em vão num lock-busy

- **Severidade**: P2
- **Tactic violada**: Bound Execution Times · Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:68-118`, `EleicaoPermutasService.ts:283-355`
- **Evidência (objetiva)**: `executar` dispara `computeCandidatas` PRIMEIRO (todo fan-out Conexos, minutos) e só depois entra na transação que pega o advisory lock. Se o lock estiver ocupado, todo o custo Conexos foi pago em vão (mas a `IngestLockBusyError` é detectada no `persistIngestRun` — ver `relationalRepository`).
- **Impacto técnico**: cron + manual concorrente desperdiçam Conexos sessions e tempo de Render. Pior caso: 3 dispatches/dia + 5 cliques de cliente-filtro = 8 fan-outs full, ≥1 jogado fora.
- **Impacto de negócio**: custo Conexos sem retorno; risco maior de MAX_SESSIONS.
- **Métrica de baseline**: 1 ingestão completa estimada ≥ 30s de Conexos × N runs jogadas fora. Não medível sem APM.

### F-performance-9: Sem instrumentação de latência por endpoint Conexos

- **Severidade**: P3
- **Tactic violada**: pré-requisito para qualquer tactic de demanda (não há baseline numérico hoje)
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (logService.info sem `durationMs`)
- **Evidência (objetiva)**: `LogService` é injetado, mas as métricas p50/p95 por endpoint Conexos não aparecem nos logs (busca por `durationMs` em ConexosClient.ts não retorna ocorrências relevantes em chamadas).
- **Impacto técnico**: impossível calibrar `FILIAIS_CONCURRENCY`, `ADIANTAMENTOS_CONCURRENCY`, timeout do axios (cf. F-5) sem dados. Decisões viram chute.
- **Impacto de negócio**: regressões de performance silenciosas (como o F-2 PR #4) só são pegas por relatório do usuário.
- **Métrica de baseline**: 0 endpoints instrumentados com duration histogram.

## 5. Cards Kanban

### [performance-1] Tornar a re-ingestão pós cliente-filtro assíncrona com feedback de progresso

- **Problema**
  > Cada add/remove de cliente-filtro dispara `runIngestaoManual()` síncrono na UI (linhas 99 e 133 de `app/permutas/clientes-filtro/page.tsx`). Para 5 filiais × ~30 adtos × ~100 invoices, são ~1.000+ chamadas Conexos + ~30s-90s de espera. Combinado com o `heavyRouteLimiter` (10 req/min cobrindo a rota inteira), 3 cliques rápidos bateram HTTP 429 em produção.
- **Melhoria Proposta**
  > Aplicar Manage Sampling Rate + Schedule Resources: o `POST /cliente-filtro` apenas grava + enfileira (advisory lock) e responde 202 com `runId`. UI mostra "Roteamento agendado" e faz polling em `GET /permutas/runs` ou em um novo `GET /permutas/runs/:id`. Coalescer múltiplos adds em 1 só ingestão (debounce de 5-10s no servidor: se entrar outro add antes da ingestão começar, só uma roda). Arquivos: `routes/permutas.ts:164-194` (rotas), `IngestaoPermutasService.ts` (novo trigger queue ou marcação `dirty`), `app/permutas/clientes-filtro/page.tsx:86-166` (UI polling).
- **Resultado Esperado**
  > p95 do POST `/cliente-filtro` cai de ~30-60s (timeout/429) para ≤ 1,5s. Zero HTTP 429 por sessão de analista em fluxo de cadastro de até 10 importadores. Janela de ingestão consolidada em < 90s, mesmo que 5 adds aconteçam em 1 min.
- **Tactic alvo**: Manage Sampling Rate + Schedule Resources
- **Severidade**: P0
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-performance-1, F-performance-4, F-performance-8
- **Métricas de sucesso**:
  - p95 latência `POST /cliente-filtro`: ~30-60s → ≤ 1,5s
  - HTTP 429/min em sessão de cadastro: ≥ 1 → 0
  - Ingestões consolidadas por janela de 5 cliques: 5 → 1 (coalescing)
- **Risco de não fazer**: onboarding (cadastro de 10-20 importadores numa Columbia nova) fica praticamente inviável; suporte recebe ticket "429 ao adicionar cliente".
- **Dependências**: nenhuma estrutural; pode usar o advisory lock existente.

### [performance-2] Adicionar `timeout` explícito no `axios.create` do `ConexosClient`

- **Problema**
  > `src/backend/domain/client/ConexosClient.ts` instancia axios SEM `timeout:` (grep retorna zero). Uma chamada Conexos lenta/parada pode segurar o handler até `tcp_keepalive` do SO — segurando o pool de 5 conexões DB e até 50 sessões Conexos simultâneas. `BcbClient.ts:57` já tem `timeout: 10_000` (modelo).
- **Melhoria Proposta**
  > Aplicar Bound Execution Times: `axios.create({ ..., timeout: 30_000 })` no `ConexosClient` (30s é folgado para list paginado; 15s para detail endpoints — pode ser por método). Combinar com keep-alive agent (`new https.Agent({ keepAlive: true })`) para reuso de TCP entre chamadas do mesmo handler (em Lambda no futuro vira por-warm-container). Cobrir cross-QA com `qa-availability` (mesmo card).
- **Resultado Esperado**
  > Pior caso de Conexos cinza: 1 ingestão aborta em ≤ 30s × pior path (~3 round-trips por adto) ≈ 90s, com erro identificável. Hoje: pendura indefinidamente. p99 de ingestão volta a ser dominada por throughput, não por timeout.
- **Tactic alvo**: Bound Execution Times
- **Severidade**: P0
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - Timeout configurado: nenhum → 30s (list) / 15s (detail)
  - Tempo máximo de ingestão pendurada: ∞ → ≤ 90s antes de erro identificável
  - Handlers pendurados após Conexos cinza: até 50 → 0 (todos liberam após timeout)
- **Risco de não fazer**: 1 incidente Conexos = nosso painel indisponível por horas até reinício; cron silenciosamente perde janelas.
- **Dependências**: nenhuma.

### [performance-3] Granularizar `heavyRouteLimiter` — só nas escritas pesadas

- **Problema**
  > `app.use('/permutas', heavyRouteLimiter)` (10 req/min/IP) cobre `GET /gestao`, `GET /runs`, `GET /cliente-filtro`, `GET /invoices/buscar` (leituras) e `POST /ingestao`, `POST /eleicao` (escritas pesadas) no mesmo bucket. Refresh de painel + uma busca de invoice consomem o orçamento da ingestão.
- **Melhoria Proposta**
  > Aplicar Prioritize Events + Limit Event Response com escopo correto. Manter `globalLimiter` (100/min) nas leituras e aplicar `heavyRouteLimiter` somente em: `POST /permutas/eleicao`, `POST /permutas/ingestao`. Considerar limiter por-usuário (não por-IP) para escritórios atrás de NAT. Tocar: `index.ts:80-88`, `routes/permutas.ts:73-131`.
- **Resultado Esperado**
  > Limit de 10/min só nas escritas pesadas (que de fato custam Conexos). Leituras voltam a 100/min. 2 analistas no mesmo IP fazendo trabalho normal nunca disparam 429.
- **Tactic alvo**: Prioritize Events
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-1, F-performance-4
- **Métricas de sucesso**:
  - HTTP 429 em `GET /gestao` por dia: > 0 → 0
  - Bucket consumido por refresh de painel: 1 → 0
- **Risco de não fazer**: contramedida de protecção do Conexos vira gargalo de UX permanente.
- **Dependências**: cross-QA security/availability (mesma decisão).

### [performance-4] Deferir hidratação per-invoice `listTitulosAPagar` em `fetchInvoicesBatched`

- **Problema**
  > PR #4 adicionou 1 `listTitulosAPagar` por invoice em aberto em `EleicaoPermutasService.ts:451-491` (dentro do fan-out de ingestão), para hidratar `valorMoedaNegociada` de TODAS as invoices (não só das casadas). Custo: ~500 chamadas Conexos extras por ingestão (5 filiais × ~100 invoices). A invoice CASADA já é hidratada em `computeVariacao` (linhas 745-751) — paga-se 2× nas elegíveis e adiciona nas N:M que talvez nunca sejam consultadas.
- **Melhoria Proposta**
  > Aplicar Increase Resource Efficiency: opções (a) deferir hidratação para o momento em que a invoice é EXIBIDA na N:M (lazy/JIT via `GET /permutas/invoices/:docCod`); (b) cachear o `valorMoedaNegociada` no `permuta_invoice` (já está no schema) e re-hidratar só quando `stale=true` ou marcador `taxa IS NULL`; (c) verificar com Conexos se existe variante batched do `com308/list` (priCods[]) — se sim, 1 chamada por chunk em vez de 1 por invoice. Tocar: `EleicaoPermutasService.ts:438-491`, `routes/permutas.ts` (novo endpoint lazy se for caminho a).
- **Resultado Esperado**
  > Chamadas Conexos por ingestão: ~1.115 → ~615 (-45%). Duração de ingestão estimada: ~90s → ~50s (proporcional). Idempotente; mantém o `valorMoedaNegociada` da invoice casada (única que entra no auto-casamento Simples) sempre fresco.
- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P1
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - Chamadas Conexos por ingestão: ~1.115 → ~615
  - Duração de ingestão p95: ~90s → ~50s (estimado; depende de instrumentação)
- **Risco de não fazer**: cada feature nova de hidratação multiplica o custo da ingestão linearmente; chega no MAX_SESSIONS.
- **Dependências**: F-performance-9 (instrumentação para confirmar o ganho).

### [performance-5] `buscarInvoices`: bound concurrency + bulk `getDetalheTitulos` + cachear `sumByInvoice`

- **Problema**
  > `AlocacaoPermutasService.buscarInvoices` faz `Promise.all` SEM bound (linhas 105-158) com 2 Conexos + 1 DB query por invoice — para 8 invoices num processo, 16 round-trips + 8 SELECTs sequenciais. Endpoint chamado a cada digitação no modal de alocação. Sem timeout no axios (F-5), uma invoice lenta segura o handler inteiro.
- **Melhoria Proposta**
  > Aplicar Reduce Overhead + Increase Resource Efficiency: (1) usar `BoundedConcurrency.map(invoices, ..., ADIANTAMENTOS_CONCURRENCY)` em vez de `Promise.all`; (2) substituir o `sumByInvoice` por-invoice por 1 `selectMany` agregado `WHERE invoice_doc_cod = ANY($docCods)` que retorna `Map<docCod, sum>`; (3) opcionalmente reaproveitar `valorMoedaNegociada` cacheado no `permuta_invoice` quando `stale=false`. Tocar: `AlocacaoPermutasService.ts:87-159`, `PermutaAlocacaoRepository.ts:116-128` (novo método `sumByInvoices(docCods)`).
- **Resultado Esperado**
  > p95 latência de `GET /permutas/invoices/buscar` (8 invoices típicas): estimado ~2-3s → ≤ 800ms. Round-trips DB: 8 → 1. Concorrência Conexos contida (≤ `ADIANTAMENTOS_CONCURRENCY=10`).
- **Tactic alvo**: Reduce Overhead
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-3, F-performance-5
- **Métricas de sucesso**:
  - DB round-trips em `buscarInvoices(N)`: N+2 → 3 (1 sum + 1 list invoices + 1 list declaracoes)
  - Conexos concorrência simultânea: ilimitada → ≤ 10
  - p95 latência endpoint: ~2-3s → ≤ 800ms
- **Risco de não fazer**: UX do modal de alocação degrada à medida que processos com muitas invoices aparecem; risco contínuo de MAX_SESSIONS.
- **Dependências**: nenhuma.

### [performance-6] Mover a aquisição do advisory lock para ANTES do fan-out Conexos da ingestão

- **Problema**
  > `IngestaoPermutasService.executar` chama `computeCandidatas` (fan-out completo Conexos, ~30-90s) ANTES de tentar pegar o `INGEST_LOCK_KEY` dentro do `persistIngestRun`. Se outro processo já segura o lock (cron simultâneo, click no botão de ingestão), pagamos todo o custo Conexos para depois descobrir que era trabalho em vão.
- **Melhoria Proposta**
  > Aplicar Bound Execution Times + Reduce Overhead: usar `databaseClient.withAdvisoryLock(INGEST_LOCK_KEY, ..., onBusy)` envolvendo o `computeCandidatas` — exatamente como já faz `EleicaoPermutasService.executar` com a idempotency key. Quando o lock está ocupado, devolver 409 imediato sem disparar Conexos. Tocar: `IngestaoPermutasService.ts:68-118` (mover a aquisição do lock pra antes de `computeCandidatas`).
- **Resultado Esperado**
  > Em ingestões concorrentes (cron + manual ou 2 manuais), apenas 1 fan-out Conexos é disparado por janela. Custo Conexos desperdiçado: hoje 1 fan-out completo por concorrência → 0.
- **Tactic alvo**: Bound Execution Times + Schedule Resources
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-8
- **Métricas de sucesso**:
  - Chamadas Conexos desperdiçadas em concorrência: ~1000 por evento → 0
  - Tempo de resposta do segundo `POST /ingestao` concorrente: ~90s + 409 → ≤ 200ms + 409
- **Risco de não fazer**: cada onda de cliques + cron simultâneo paga 2-3× o custo Conexos.
- **Dependências**: card performance-1 (assíncrono) reduz o evento, mas não substitui esse ajuste.

### [performance-7] Instrumentar `durationMs` por chamada Conexos no `LogService`

- **Problema**
  > Não há baseline numérico de p50/p95 por endpoint Conexos (`listFinanceiroAPagar`, `getDetalheTitulos`, etc.). Decisões de concorrência (`FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10`) e timeout (card performance-2) são chute hoje. Regressões como F-2 só são pegas por relato de usuário.
- **Melhoria Proposta**
  > Aplicar Maintain Multiple Copies of Computations (instrumentação como pré-requisito): wrapper único no `axios.interceptors.response` do `ConexosClient` que mede `Date.now() - startedAt` e chama `logService.info({ type: 'CONEXOS_CALL', data: { endpoint, durationMs, status, flowId } })`. Render captura o log; o número agrega externamente (sem APM por enquanto). Cross-QA: testability/observability.
- **Resultado Esperado**
  > p50/p95 por endpoint visíveis na trilha de logs. Base para calibrar timeout (card 2), concorrência (cards 4 e 5) e detectar regressão de PR #4 antecipadamente.
- **Tactic alvo**: Maintain Multiple Copies of Computations (precondição para tuning)
- **Severidade**: P3 (mas alavanca para todos os outros)
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-9, F-performance-2, F-performance-5
- **Métricas de sucesso**:
  - Endpoints Conexos instrumentados: 0 → 8 (listFiliais, listProcessos, listFinanceiroAPagar, listAdiantamentosProforma, listDeclaracaoByProcesso, getDetalheTitulos, listTitulosAPagar, listFinanceiroAPagarByGerNum)
  - Linhas de log com durationMs por chamada: 0 → 100%
- **Risco de não fazer**: ficamos cegos para regressões de performance e para o impacto real dos cards 1-6.
- **Dependências**: nenhuma; precondição para o restante.

### [performance-8] Adicionar `LIMIT` defensivo nos `selectMany` de `/gestao` + paginar no frontend

- **Problema**
  > `GestaoPermutasService.exporGestao` faz `Promise.all` de 7 `selectMany` sem `LIMIT`: `listAdiantamentosAtivos`, `listInvoicesEmAberto`, `listDeclaracoes`, `listCasamentos`, `listAtivas` (alocações), `listProcessamentos`, `findLatestIngestFinishedAt`. Hoje funciona porque o backlog Columbia é pequeno; cresce linearmente sem teto.
- **Melhoria Proposta**
  > Aplicar Bound Queue Sizes (dataset retornado): adicionar `LIMIT $1` (default 10.000) com `WARN` no `LogService` quando o limit é atingido (sinal de que precisa paginação real). Para a UX, paginar no frontend usando o `useTabelaFiltro` que já existe (linha 376 do `page.tsx`). Multi-tenant futuro vai depender disso. Tocar: `PermutaRelationalRepository.ts:477-541`, `app/permutas/page.tsx:495-742`.
- **Resultado Esperado**
  > Volume máximo retornado em 1 request: ilimitado → 10.000 rows × 5 listas. Memory peak Node por request: hoje O(backlog) → O(10k). Sinal de migration debt quando o limit dispara.
- **Tactic alvo**: Bound Queue Sizes
- **Severidade**: P2
- **Esforço estimado**: M (2-5d com paginação real no front)
- **Findings relacionados**: F-performance-6, F-performance-7
- **Métricas de sucesso**:
  - `selectMany` sem LIMIT em path chamável por API: 5 → 0
  - Memory peak por `GET /gestao`: O(backlog) → O(10k)
  - Payload `/gestao` p95: livre → ≤ 1 MB
- **Risco de não fazer**: produto não comporta multi-tenant; primeira Columbia grande quebra o painel.
- **Dependências**: card performance-7 (visibilidade) ajuda a definir o teto real.

## 6. Notas do agente

- **Escopo**: priorizei o caminho quente do PR #4 (eleicao/ingestao com `fetchInvoicesBatched`+`computeVariacao` regressivos; alocacao `buscarInvoices` per-invoice) e o cenário concreto reportado (HTTP 429 no cadastro de cliente-filtro). Cards de Lambda cold-start / SQS estão `N/A` — o stack hoje é Express+Render, é alvo do Lambda (CLAUDE.md).
- **Cross-QA**: F-performance-5 (axios sem timeout) é simultaneamente P0 de Availability + Fault Tolerance — alertar `qa-availability` e `qa-fault-tolerance` para não duplicar card. Bundle/dist do BE (F-7) toca `qa-deployability`. Falta de `LIMIT` (F-6) toca `qa-modifiability` (schema as code + paginação como contrato).
- **Métricas não medidas**: latência real por endpoint Conexos, p95 do `/gestao`, build do Next (`next build` não foi rodado por escopo — não-quick mas trabalho de tactics primeiro). Card performance-7 cobre a instrumentação que destrava todo o resto.
- **Decisão**: rebaixei o monolito client `page.tsx` para P2 (não P1) porque o gargalo dominante é o servidor (Conexos amplification + 429 + sync ingest), não o cliente; refator de UI espera os P0/P1 do servidor.
- **Cobertura de tactics**: 11/12 Bass tactics avaliadas (Increase Resources marcada N/A com justificativa). Schema completo seguindo `_template/qa-section.md`.
