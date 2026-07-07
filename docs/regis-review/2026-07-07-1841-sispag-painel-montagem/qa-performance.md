---
qa: Performance
qa_slug: performance
run_id: 2026-07-07-1841
agent: qa-performance
generated_at: 2026-07-07T18:41:00-03:00
scope: all
score: 4.5
findings_count: 7
cards_count: 7
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista financeiro abre `/sispag` (ou clica "Recarregar") | GET `/sispag/painel` no horário de pico da manhã (janela de pagamentos: −15d/+45d, ~7 filiais ativas) | `SispagPainelService.montarPainel` → `ConexosSispagClient` (fin064/fin015/fin010) + `Promise.allSettled` no fan-out | Produção, Conexos com p99 2–10s, MAX_SESSIONS ~3–5 slots por usuário técnico | Painel renderiza títulos/lotes/borderôs em janela previsível; não estoura sessão Conexos; não excede budget de latência do Vercel/Render | p50 do endpoint ≤ 3 s; p95 ≤ 6 s; taxa de falha por `LOGIN_ERROR_MAX_SESSIONS` = 0; concorrência máx. contra Conexos ≤ 3 |

Cenário complementar (Fatia 2 — Criar Lote): analista seleciona 20 títulos e clica "Criar lote"; frontend faz N chamadas HTTP sequenciais (`incluirTitulo`) e cada uma dispara uma leitura fin064 filtrada por `docCod`. Resposta esperada: lote materializado em ≤ 3 s; hoje escala linearmente com N.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Chamadas Conexos concorrentes por painel | `3 × N_filiais` (ex.: 7 filiais → 21) | ≤ 3 (bound do `BoundedConcurrency`) | ❌ | `SispagPainelService.ts:47-53` (Promise.all de 3 `gather`, cada `gather` = `Promise.allSettled(filCods.map(fn))`) |
| Round-trips Conexos por criação de lote de N títulos | `N` (sequencial, 1 fin064 por include) | 1 fin064 batch em `docCod#IN` + N inserts locais | ❌ | `sispag/page.tsx:191-198` (loop `for` await), `ConexosSispagClient.ts:164-194` (`getTituloAPagar` = 1 chamada por título) |
| `fin064/list` `pageSize` (por filial) | 1000, sem walker de páginas | 1000 com fallback a `paginate()` se `count > 1000` | ⚠️ | `ConexosSispagClient.ts:124` (`this.listBody('fin064', filtered, 1000)`) + `ConexosBaseClient.ts:239` (paginate walker existe mas não é usado aqui) |
| Cache do painel (TTL) | 0 s (sem cache) — cada GET refaz 21 chamadas | 15–60 s in-memory por processo (invalidação manual em write) | ❌ | `SispagPainelService.ts:36` (`montarPainel` puro; nenhum caminho de leitura consulta cache) |
| Payload `titulos` enviado ao FE | até `TITULOS_CAP=400` | ≤ 200 (alinhado ao render máximo do FE) | ⚠️ | `SispagPainelService.ts:17,58`; `sispag/page.tsx:395` (`titulosFiltrados.slice(0, 200)`) |
| Índices Postgres em `lote_pagamento` | `(status)` e `(fil_cod,doc_cod,tit_cod)` no item | + índice em `criado_em DESC` (ou composto `(status,criado_em DESC)`) para `listLotes` | ⚠️ | `migrations/0023_lote_pagamento.sql:48-52`; `LotePagamentoRepository.ts:126-132` (`ORDER BY criado_em DESC` sem índice) |
| `LIMIT` em `listLotes` (Postgres) | inexistente | `LIMIT 200` + paginação por cursor | ⚠️ | `LotePagamentoRepository.ts:124-133` (sem LIMIT/OFFSET) |
| Retry Conexos em cada chamada | 2 retries, 500 ms + jitter 200 ms | mantido | ✅ | `ConexosBaseClient.ts:137-142` |
| Timeout HTTP Conexos | 40 s por request | mantido (já defensivo) | ✅ | `services/conexos.ts:92` (`axios.create({ timeout: 40000 })`) |
| Bootstrap DI por request | idempotente (guard `bootstrapped`) | mantido | ✅ | `domain/appContainer.ts:9,52-68` |
| Filiais cache (in-memory) | cache no `ConexosService` (populado no login) | mantido | ✅ | `services/conexos.ts:77,201-204,303-306` |
| p50/p95 real do endpoint `/sispag/painel` | não medível localmente | p50 ≤ 3s / p95 ≤ 6s | ⚠️ | requer OpenTelemetry / CloudWatch no gateway; hoje só há `LogService.info` no fim do handler |

> ⚠️ **Não medível localmente**: latência real do endpoint no Conexos PRD. Requer instrumentar `montarPainel` com `console.time`/`performance.now()` (já parcialmente feito nos probes `jobs/probe-sispag-painel.ts` — reaproveitar) e persistir p50/p95 por janela. Recomendação: emitir uma métrica `sispag.painel.duration_ms` no `logService.info` final e agregar no Render/Vercel logs (grep + histograma).

## 3. Tactics — Cobertura no financeiro (Bass ch.9)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | painel só recarrega no botão manual (sem polling) | ✅ presente | `sispag/page.tsx:243-246` (só `onClick={() => void carregar()}`) |
| Limit Event Response | `TITULOS_CAP=400` no serviço, `slice(0,200)` no FE | ⚠️ parcial | `SispagPainelService.ts:17,58`; FE renderiza no máximo 200 mas backend envia 400 — desperdício |
| Prioritize Events | ordenação por vencimento (mais urgente 1º); KPIs calculados sobre janela completa antes do cap | ✅ presente | `SispagPainelService.ts:118` (`sort` por `vencimento`), `56-58` (KPIs antes do slice) |
| Reduce Overhead | filiais em cache (in-memory); DI bootstrap idempotente; retry único delay+jitter | ✅ presente | `services/conexos.ts:305`, `appContainer.ts:53`, `ConexosBaseClient.ts:137-142` |
| Bound Execution Times | timeout axios Conexos = 40s; sem timeout no endpoint HTTP express | ⚠️ parcial | `services/conexos.ts:92`; nenhum guard no `router.get('/painel')` — 21 chamadas × p99 10s podem estourar timeout do Vercel/Render (30–60s) |
| Increase Resource Efficiency | walker de paginação existe (`ConexosBaseClient.paginate`) mas o SispagClient **não usa**, só pega 1ª página com `pageSize=1000` | ⚠️ parcial | `ConexosSispagClient.ts:122-134` (chama `listGenericPaginated` diretamente, não `paginate`) |
| Increase Resources | N/A — infra atual é Render/Vercel single-region; sem knobs de "escalar" ainda | N/A | roadmap Lambda multi-conta (CLAUDE.md) |
| Increase Concurrency | `Promise.all` + `Promise.allSettled` no fan-out multi-filial (21 chamadas simultâneas) | ❌ **excesso, não falta** | `SispagPainelService.ts:47-53,91` — bate no MAX_SESSIONS do Conexos |
| Maintain Multiple Copies of Computations | KPIs derivados no backend (uma vez), FE não recalcula | ✅ presente | `SispagPainelService.ts:123-143` |
| Maintain Multiple Copies of Data (cache) | **ausente** para o painel; frontend chama backend a cada montagem; backend chama Conexos ao vivo | ❌ ausente | grep `cache\|memo` em `SispagPainelService.ts` → 0 hits |
| Bound Queue Sizes | N/A (não há fila SQS nesta feature; painel é síncrono API GW-like) | N/A | — |
| Schedule Resources | fan-out com `Promise.allSettled` = "spawn tudo e reza" (sem pool de workers) | ❌ ausente | `SispagPainelService.ts:91` (não usa `BoundedConcurrency`, que **já existe** em `libs/concurrency/BoundedConcurrency.ts` e é usado por `AlocacaoPermutasService.ts:121`) |

## 4. Findings (achados)

### F-performance-1: Fan-out não-bounded no painel dispara ~3× N_filiais chamadas Conexos simultâneas

- **Severidade**: **P0** (crítico — risco de `LOGIN_ERROR_MAX_SESSIONS` sob concorrência de analistas + degradação de latência tail-heavy)
- **Tactic violada**: **Schedule Resources** / **Increase Concurrency** (concorrência mal-dimensionada) / **Bound Execution Times**
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:47-53` e o helper `gather` em `:87-105`
- **Evidência (objetiva)**:
  ```ts
  // SispagPainelService.ts:47-53
  const [titulosRaw, lotesRaw, borderosRaw] = await Promise.all([
      this.gather(filCods, (fc) => this.sispag.listTitulosAPagar(fc, {...})),
      this.gather(filCods, (fc) => this.sispag.listLotes(fc)),
      this.gather(filCods, (fc) => this.sispag.listBorderosAPagar(fc)),
  ]);
  // gather (:91) — sem bound:
  const settled = await Promise.allSettled(filCods.map(fn));
  ```
  Com 7 filCods → 3 × 7 = **21 requisições Conexos concorrentes** por page-load. Comentário do próprio `BoundedConcurrency.ts:20-22`: *"Substitui o burst `Promise.all` de N filiais de uma vez (que ele próprio contribui para as falhas Conexos 504/LOGIN_ERROR_MAX_SESSIONS)"* — a doutrina interna já reconhece o padrão como bug; a nova feature reintroduziu.
- **Impacto técnico**: (i) Conexos rejeita a partir de N sessões paralelas com `LOGIN_ERROR_MAX_SESSIONS` (`services/conexos.ts:139,158,219`); (ii) latência do painel = `max(21 chamadas)` — com p99 Conexos 10s + 2 retries × 500ms delay, cauda >12s; (iii) 2 analistas abrindo o painel ao mesmo tempo levam a frota a 42 chamadas simultâneas ao Conexos.
- **Impacto de negócio**: painel "não abre" no primeiro clique quando alguém já está usando; analista dá reload → duplica carga → cascata. Perde a janela de execução SISPAG diária.
- **Métrica de baseline**: concorrência = `3 × N_filiais` = **21** (para 7 filiais); alvo = `≤ 3`. p95 estimado 5–8s → alvo 2–3s.

### F-performance-2: `getTituloAPagar` faz 1 chamada Conexos por título; FE inclui em loop sequencial

- **Severidade**: **P0** (crítico — escala linear no N do lote; UX inaceitável ≥ 15 títulos)
- **Tactic violada**: **Reduce Overhead** / **Increase Resource Efficiency**
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:164-194` (função `getTituloAPagar`) + `src/frontend/app/sispag/page.tsx:191-198` (loop sequencial no `criarLoteComSelecionados`)
- **Evidência (objetiva)**:
  ```ts
  // sispag/page.tsx:191-198
  for (const t of selTitulos) {
      try {
          await incluirTitulo(lote.id, { filCod: t.filCod, docCod: t.docCod, titCod: t.titCod });
          ok += 1;
      } catch (e) { ... }
  }
  ```
  Cada `incluirTitulo` bate em `POST /sispag/lotes/:id/itens` → `LotePagamentoService.incluirTitulo` → `getTituloAPagar` → 1 `fin064/list` filtrado por `docCod`. **Para N=20 títulos = 20 round-trips FE↔BE + 20 chamadas Conexos, em série.** Assumindo 500ms FE↔BE + 800ms Conexos = **~26s** para um lote de 20 títulos.
- **Impacto técnico**: escala **O(N)** com latência linear; qualquer erro no meio deixa o lote parcial (comportamento já tratado no FE mas UX é ruim). Além disso, `getTituloAPagar` faz `pageSize=200` e itera em Node para achar o `titCod` — se um `docCod` tem múltiplas parcelas, transfere as 200 e descarta 199.
- **Impacto de negócio**: analista monta lote pequeno para não esperar → SISPAG do dia fica fragmentado em muitos lotes candidatos → gate humano se transforma em "aprova cada" (perde a alavanca de automação).
- **Métrica de baseline**: latência de criar lote com **20 títulos ≈ 26 s** (estimativa 500ms round-trip + 800ms Conexos); Chamadas Conexos = **N (=20)**; alvo: **≤ 3s** e **≤ 3 chamadas Conexos** (via `docCod#IN` em batch + BoundedConcurrency, ou re-uso do snapshot já retornado pelo painel).

### F-performance-3: Ausência de cache do painel — cada GET reexecuta 21 chamadas Conexos

- **Severidade**: **P1** (alto — desperdício de recurso escasso + risco de rate-limit em Nexxera/Conexos)
- **Tactic violada**: **Maintain Multiple Copies of Data** (cache) / **Reduce Overhead**
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:36` (nenhum campo/estrutura de cache); `src/backend/routes/sispag.ts:25-33` (rota `/sispag/painel` sem headers Cache-Control)
- **Evidência (objetiva)**:
  ```
  $ grep -n "cache\|memo\|ttl" src/backend/domain/service/sispag/SispagPainelService.ts
  <sem resultados>
  ```
  Padrão análogo em Permutas — comentário no MEMORY do repo `permutas-v070-resume` já lista *"backlog: P1 cache"* como pendência antiga. A dor é conhecida.
- **Impacto técnico**: 2 analistas alternando abas ou uma sessão de 30 min com 20 recarregadas manuais → 20 × 21 = 420 chamadas Conexos por sessão para dados que **variam pouco durante o dia** (títulos a pagar mudam por escrita fora do fluxo do painel).
- **Impacto de negócio**: latência acumulada perceptível; risco de bloqueio Conexos por volume de sessão; custo escondido para quando a AWS Lambda (roadmap) trocar por egress cobrado.
- **Métrica de baseline**: 100% de cache miss; alvo = TTL 15–60 s → hit rate ≥ 60% em uso típico; painel warm ≤ 200 ms.

### F-performance-4: `listLotes` sem `LIMIT` e sem índice para `ORDER BY criado_em DESC`

- **Severidade**: **P2** (médio — hoje volume baixo, mas o crescimento é linear com uso)
- **Tactic violada**: **Bound Execution Times** / **Increase Resource Efficiency**
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:124-149`; migração `src/backend/migrations/0023_lote_pagamento.sql:48-52`
- **Evidência (objetiva)**:
  ```sql
  -- LotePagamentoRepository.ts:126-132
  SELECT id, fil_cod, banco, conta, status, criado_por, ...
   FROM lote_pagamento
   WHERE ($status::text IS NULL OR status = $status)
     AND ($filCod::int IS NULL OR fil_cod = $filCod)
   ORDER BY criado_em DESC
  -- (sem LIMIT)
  ```
  Índices existentes (0023):
  ```sql
  CREATE INDEX ... idx_lote_pagamento_item_titulo ON lote_pagamento_item (fil_cod, doc_cod, tit_cod);
  CREATE INDEX ... idx_lote_pagamento_status ON lote_pagamento (status);
  ```
  **Falta**: índice em `criado_em DESC` (ou composto `(status, criado_em DESC)`), que é o predicado+ORDER do único read path público.
- **Impacto técnico**: quando `lote_pagamento` passar de ~10k linhas, o plano será **seq scan + sort em memória**. Como o segundo query (`ANY($ids)`) hidrata todos os itens de todos os headers retornados, uma tabela grande explode payload + latência.
- **Impacto de negócio**: aba "Lotes candidatos" degrada silenciosamente; sem alarme (não há SLA sobre listagens Postgres).
- **Métrica de baseline**: `EXPLAIN ANALYZE` não capturável (schema não no repo em produção — só migração). Alvo: **latência p95 `listLotes` < 100 ms com 10k lotes**, plano com `Index Scan` + `LIMIT 200`.

### F-performance-5: `TITULOS_CAP=400` no backend enquanto FE renderiza no máximo 200 → payload 2× o necessário

- **Severidade**: **P2** (médio — payload desnecessário; degrada TTFB em conexões ruins)
- **Tactic violada**: **Limit Event Response** / **Reduce Overhead**
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:17,58`; `src/frontend/app/sispag/page.tsx:395,436`
- **Evidência (objetiva)**:
  ```ts
  // backend
  const TITULOS_CAP = 400;
  const titulos = titulosPreparados.slice(0, TITULOS_CAP);
  // frontend
  {titulosFiltrados.slice(0, 200).map((t) => (...))}
  ```
  Backend envia até 400 títulos; FE só renderiza 200. Cada título ~15 campos, ~250 B JSON → **~50 KB desperdiçados** no p95.
- **Impacto técnico**: payload 100 KB → 50 KB é secundário; o problema real é a **assimetria** de acertos: KPI usa a lista completa (bom), mas o cap sinaliza que a modelagem *"quantos títulos entregar"* nunca foi decidida.
- **Impacto de negócio**: baixo hoje; se o volume real subir para milhares de títulos na janela, a decisão vira dívida.
- **Métrica de baseline**: payload atual estimado 100 KB p95; alvo com paginação server-side + `TITULOS_CAP=200` = **~50 KB p95** e semântica clara (page-based).

### F-performance-6: `fin064/list` no painel usa 1 página com `pageSize=1000`, sem walker → truncamento silencioso

- **Severidade**: **P2** (médio — hoje protege performance, mas quebra correção quando janela ampliar)
- **Tactic violada**: **Bound Execution Times** (com trade-off consciente) — falta o guard "quando `count > 1000` emitir warn / paginar"
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:120-135`
- **Evidência (objetiva)**:
  ```ts
  const res = await this.base.listGenericPaginated<Record<string, unknown>>(
      'fin064/list', this.listBody('fin064', filtered, 1000), { filCod },
  );
  rows = res.rows;   // ← `res.count` é ignorado
  ```
  O walker `ConexosBaseClient.paginate` já existe (`ConexosBaseClient.ts:222-280`) e é o padrão dos demais clients (com Family em Permutas). Aqui foi optado por 1 página grande, mas **sem alarme se `count > pageSize`**.
- **Impacto técnico**: se uma filial > 1000 títulos na janela (−15d/+45d), silenciosamente perde os últimos. KPIs ficam errados; painel mostra dados parciais sem indicativo.
- **Impacto de negócio**: analista pode aprovar/finalizar lote acreditando ter visto todo o pool; risco de pagamentos esquecidos.
- **Métrica de baseline**: cap fixo em 1000 rows/filial × 7 filiais = 7000 títulos máx.; alvo: instrumentar `count > pageSize` como `BUSINESS_WARN` + fallback para `paginate()`.

### F-performance-7: Endpoint HTTP `/sispag/painel` sem timeout de request-level e sem hedge → 21 chamadas em série de retries

- **Severidade**: **P2** (médio — cauda tail-latency amplifica a F-performance-1)
- **Tactic violada**: **Bound Execution Times**
- **Localização**: `src/backend/routes/sispag.ts:25-33`
- **Evidência (objetiva)**: rota Express sem `req.setTimeout` nem AbortController; `Promise.allSettled` no service tolera falhas de filial mas espera 40s (timeout axios) × 2 retries = **até 120s por filial "penca"** antes de logar o warn. O gateway (Render/Vercel) mata o request antes; cliente vê 502/504.
- **Impacto técnico**: worst-case: 1 filial lenta bloqueia o painel inteiro por até 2 min. `Promise.allSettled` não faz "primeiro-que-chega ganha"; ele espera todos.
- **Impacto de negócio**: painel intermitente em manhãs de latência Conexos ruim — sem sinal claro na tela do que falhou.
- **Métrica de baseline**: worst-case atual ~2 min por request; alvo: **budget total 8s** com hedge/timeout parcial por filial (5s) + degradação graciosa mostrando "N filiais offline".

## 5. Cards Kanban

### [performance-1] Aplicar `BoundedConcurrency` (limite=3) ao fan-out do painel

- **Problema**
  > `SispagPainelService.montarPainel` dispara `3 × N_filiais` chamadas Conexos simultâneas (~21 para 7 filiais) via `Promise.all` + `Promise.allSettled(filCods.map(fn))`. Já existe `BoundedConcurrency` no repo, e o próprio comentário do lib (`libs/concurrency/BoundedConcurrency.ts:20-22`) documenta que esse padrão causa `LOGIN_ERROR_MAX_SESSIONS` no Conexos.
- **Melhoria Proposta**
  > Injetar `BoundedConcurrency` no `SispagPainelService` e substituir `gather` por `bounded.run(filCods, fn, 3)`; agregar os 3 gathers em um único pool (`filCods × 3 endpoints` = 21 tarefas → 3 workers). Alternativa: manter os 3 gathers mas colapsar em serialização por endpoint (`for (fc of filCods) await ...`), o que é mais lento porém elimina spike. Preferir o pool.
- **Resultado Esperado**
  > Concorrência máxima contra Conexos cai de 21 → 3; sem `LOGIN_ERROR_MAX_SESSIONS`; latência p95 do painel 5–8s → 2–3s (ordenação sequencial de 7 grupos de 3 vs. rajada única).
- **Tactic alvo**: Schedule Resources
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-1, F-performance-7
- **Métricas de sucesso**:
  - Concorrência Conexos por painel: 21 → **≤ 3**
  - p95 `/sispag/painel`: ~5–8s → **≤ 3s**
  - Erros `LOGIN_ERROR_MAX_SESSIONS` por hora sob 2 analistas: >0 → **0**
- **Risco de não fazer**: analistas percebem painel "quebrado" ao mesmo tempo em que rodam Permutas; culpam Conexos; degrada confiança na Fatia 3 (write) antes de sair.
- **Dependências**: nenhuma (lib já existe e está testada).

### [performance-2] Batch da inclusão de títulos: 1 chamada `docCod#IN` + persistência em transação

- **Problema**
  > FE (`sispag/page.tsx:191-198`) chama `incluirTitulo` em loop `for..await`; cada request refaz `getTituloAPagar` (`ConexosSispagClient.ts:164`) que é 1 `fin064/list` filtrado por `docCod`. Lote de 20 títulos ≈ 20 round-trips e 20 chamadas Conexos, ~26s no p50.
- **Melhoria Proposta**
  > Duas frentes complementares:
  > 1. Backend: novo endpoint `POST /sispag/lotes/:id/itens/batch` recebendo `{ titulos: [{filCod,docCod,titCod}] }`. Uma leitura Conexos com `docCod#IN` (agrupada por filCod) valida elegibilidade de todos os títulos; insere em **uma transação** (mesmo advisory lock por título continua, mas paralelizado no bounded pool).
  > 2. FE: substituir loop por chamada única ao endpoint batch (reaproveitando snapshot que o painel já entregou — `titulo.credor/valor/vencimento/liberado/pago`), com fallback ao caminho antigo se backend não expuser batch (feature flag).
  > Enquanto o batch não existir, no mínimo trocar o loop por `Promise.all` no FE (dupla-guarda contra concorrência via advisory lock no service).
- **Resultado Esperado**
  > Criar lote de 20 títulos: 26s → **≤ 3s**; chamadas Conexos por lote: 20 → **1** (ou 0, se aproveitar snapshot do painel + revalidar só na finalização).
- **Tactic alvo**: Reduce Overhead / Increase Resource Efficiency
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - Tempo criar-lote(20 títulos): 26s → **≤ 3s**
  - Round-trips FE↔BE: N → **1**
  - Chamadas Conexos por lote: N → **1** (mesmo `docCod#IN` cobre todos)
- **Risco de não fazer**: analistas fragmentam SISPAG do dia em lotes pequenos para não esperar → gate humano perde alavanca de aprovação em bloco; Fatia 3 (write-back / remessa) herda a mesma lentidão.
- **Dependências**: revisar a doutrina "elegibilidade autoritativa via re-leitura" (`LotePagamentoService.ts:86-112`) — o serviço deve continuar re-lendo, mas com 1 chamada agregada; validação por título continua na fronteira.

### [performance-3] Cache in-memory do painel com TTL 30s + invalidação em transição de lote

- **Problema**
  > `/sispag/painel` não tem cache: toda montagem refaz 21 chamadas Conexos. Comportamento do usuário (recarregar botão + alternar aba) leva a dezenas de reexecuções por sessão.
- **Melhoria Proposta**
  > Cache in-memory por processo dentro do `SispagPainelService`: `Map<string, { at: number; value: SispagPainelResponse }>`, TTL 30s (parametrizável via `EnvironmentProvider`). Chave = "singleton" nesta fatia (não há dimensão por-usuário; o painel é do tenant). Invalidar (`this.cache = null`) em qualquer transição de lote (`criar/incluir/remover/finalizar/reabrir/cancelar` do `LotePagamentoService`) — expor um `cacheBuster` injetado no service. **Não** cachear em Postgres/Redis nesta fase — TTL curto + processo único (Render single instance hoje) resolve. Documentar que quando migrar para Lambda multi-conta, virar Redis.
- **Resultado Esperado**
  > Painel morno (< 30s desde última chamada) retorna em ≤ 200ms sem chamada Conexos; painel frio mantém p95 alvo ≤ 3s (após card #1). Reload rápido do analista deixa de estressar Conexos.
- **Tactic alvo**: Maintain Multiple Copies of Data (cache)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Cache hit ratio em sessão típica: 0% → **≥ 60%**
  - Chamadas Conexos por sessão de 30 min com 20 reloads: 420 → **≤ 42**
  - Latência painel warm: 5s → **≤ 200 ms**
- **Risco de não fazer**: dor persistente + custo desnecessário quando migrar para Lambda (cada cold-invoke = cache miss + 21 chamadas Conexos).
- **Dependências**: card #1 (primeiro corrige o burst; depois o cache reduz a frequência).

### [performance-4] Adicionar `LIMIT 200` e índice `(status, criado_em DESC)` em `lote_pagamento`

- **Problema**
  > `listLotes` faz `SELECT ... ORDER BY criado_em DESC` sem `LIMIT` e sem índice suportando o ORDER; 0023_lote_pagamento.sql só criou índice em `status`. Postgres fará seq scan + sort. Segundo query hidrata `ANY($ids)` de todos os headers retornados → volume cresce O(k).
- **Melhoria Proposta**
  > Nova migração `0024_lote_pagamento_perf.sql`:
  > ```sql
  > CREATE INDEX IF NOT EXISTS idx_lote_pagamento_criado
  >   ON lote_pagamento (status, criado_em DESC);
  > ```
  > Atualizar `LotePagamentoRepository.listLotes` para aceitar `{ limit?: number, cursor?: string }` (cursor = `criado_em` do último). FE já pagina implicitamente pela aba "Lotes candidatos"; expor `?limit=100` como default.
- **Resultado Esperado**
  > `EXPLAIN ANALYZE` de `listLotes` com 10k lotes: seq scan → **Index Scan**; latência p95: ~200ms → **< 30 ms**; payload por request bounded pelo `limit`.
- **Tactic alvo**: Bound Execution Times / Increase Resource Efficiency
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - `EXPLAIN`: Seq Scan → **Index Scan**
  - `listLotes` p95 com 10k linhas: N/A → **< 30 ms**
  - Payload máximo `/sispag/lotes`: unbounded → **bounded por `limit` (default 100)**
- **Risco de não fazer**: degradação silenciosa 3–6 meses adiante; sem alarme.
- **Dependências**: nenhuma; migração pura + repo update.

### [performance-5] Reduzir `TITULOS_CAP` para 200 e alinhar contrato com o FE

- **Problema**
  > Backend envia `TITULOS_CAP=400` mas FE renderiza `slice(0, 200)` — 100% de acréscimo de payload sem uso. Também não há paginação clara: KPIs cobrem 400, tela cobre 200, e a mensagem no FE diz "de {titulos.length}" (`sispag/page.tsx:436`) sem indicar a truncagem do backend.
- **Melhoria Proposta**
  > Backend: reduzir `TITULOS_CAP` para 200 (alinhar com o render máximo) **OU** implementar paginação server-side (`?offset=&limit=`) mantendo KPIs sobre a lista completa. Preferir opção paginada, pois "200 títulos" é apenas o hoje — evitar re-visitar quando volume subir. Documentar no `SispagPainelResponse` que `titulos` é uma amostra ordenada; adicionar campo `titulosTotal` (número da lista completa).
- **Resultado Esperado**
  > Payload `/sispag/painel` p95: ~100 KB → **~50 KB** (ou paginação zero-copy p/ FE); mensagem "Mostrando X de Y" reflete truncagem real.
- **Tactic alvo**: Limit Event Response
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - Payload p95 `/sispag/painel`: ~100 KB → **~50 KB**
  - Semântica de "mostrando N de M": correta e testada
- **Risco de não fazer**: dívida acumulada quando volume real subir; usuário perde confiança na contagem exibida.
- **Dependências**: nenhuma.

### [performance-6] Guard "count > pageSize" no `listTitulosAPagar` + walker `paginate`

- **Problema**
  > `ConexosSispagClient.listTitulosAPagar` chama `listGenericPaginated` uma única vez com `pageSize=1000` e ignora `res.count`. Se uma filial tiver > 1000 títulos na janela, painel silenciosamente entrega dados parciais. Trade-off deliberado (evitar walker por perf) sem monitor.
- **Melhoria Proposta**
  > Após a chamada de 1 página, comparar `res.count` contra `res.rows.length`: se maior, emitir `logService.warn({ type: BUSINESS_WARN, message: 'sispag: fin064 truncado por pageSize', filCod, count })` e (opcional) delegar ao walker `ConexosBaseClient.paginate` com o mesmo body. Alternativamente, marcar o `SispagPainelResponse` com uma flag `truncado: { filCod, restante }[]` para o FE mostrar aviso "dados parciais para filial X".
- **Resultado Esperado**
  > Nunca perder títulos silenciosamente; observabilidade via warn + UX honesta quando cap for atingido.
- **Tactic alvo**: Bound Execution Times (com fallback) + Reduce Overhead (walker só quando necessário)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - Ocorrências não-observadas de truncamento: N (desconhecido) → **0** (tudo emite warn)
  - Flag `truncado` na resposta = fonte de verdade para o FE renderizar banner
- **Risco de não fazer**: incidente silencioso (pagamentos esquecidos) sem trilha de auditoria.
- **Dependências**: card #1 (para não amplificar chamada com walker sem bound).

### [performance-7] Timeout de request-level + hedge por filial no fan-out

- **Problema**
  > Rota `/sispag/painel` não define `req.setTimeout`; `Promise.allSettled` espera a filial mais lenta (até 40s × 2 retries = 120s de axios). Gateway mata o request antes; cliente vê 502.
- **Melhoria Proposta**
  > (i) Aplicar `req.setTimeout(20_000)` na rota do painel; (ii) no `SispagPainelService.gather` (ou no `BoundedConcurrency` bounded do card #1), envolver cada tarefa em `Promise.race([task, timeout(5000)])` — filial que não responder em 5s vira `warn` + aparece na resposta como filial offline (novo campo `filiaisOffline: number[]`); (iii) FE exibe banner "Painel parcial: N filiais offline". Compor com o retry existente para não retentar quando o timeout externo dispara (idempotência: warn + drop).
- **Resultado Esperado**
  > Worst-case latência do painel: até 2 min → **≤ 8s garantido**; UX honesta em degradação parcial.
- **Tactic alvo**: Bound Execution Times / Reduce Overhead (fail-fast)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d — inclui contrato do response para filiais offline)
- **Findings relacionados**: F-performance-7, F-performance-1
- **Métricas de sucesso**:
  - p99 `/sispag/painel`: até 120s → **≤ 8s**
  - Latência-mediana com 1 filial lenta: idem sem filial lenta (não bloqueia)
  - Campo `filiaisOffline` presente no contrato
- **Risco de não fazer**: manhãs com Conexos degradado viram outage completo do painel em vez de degradação graciosa.
- **Dependências**: card #1 (fan-out já boundado facilita o wrap em `Promise.race`).

## 6. Notas do agente

- Escopo: só o delta desta feature (`SispagPainelService`, `ConexosSispagClient`, `LotePagamentoRepository`, `app/sispag/page.tsx`). O caminho de escrita (Fatia 3 — remessa/baixa) não existe e não foi avaliado.
- Métricas não coletadas por falta de acesso ao Conexos PRD e ao banco produção: latências reais (p50/p95), plano de execução Postgres, `count` real dos endpoints fin064 por filial. Todos assumidos por heurística/comentários existentes no repo.
- **Cross-QA** para o consolidator:
  - F-performance-1 e F-performance-7 **overlap com Availability + Fault Tolerance** (concorrência excessiva → cascata de falhas Conexos; falta de hedge → outage completo).
  - F-performance-4 **overlap com Modifiability**: índice é schema-as-code — ver se qa-modifiability sugere colocalizar migração + repository (padrão do repo já faz isso, mas o alerta é sobre disciplina futura).
  - F-performance-3 (cache) **overlap com Integrability**: o cache limita a superfície de contato com Conexos (mesmo tratamento útil para Nexxera/GED futuros).
- O `BoundedConcurrency` já existe e está testado (`libs/concurrency/BoundedConcurrency.test.ts`) — cards #1 e #2 são drop-ins de baixo risco.
