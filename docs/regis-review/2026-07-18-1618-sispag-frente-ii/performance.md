---
qa: Performance
qa_slug: performance
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-performance
generated_at: 2026-07-18T16:45Z
scope: all
score: 6
findings_count: 8
cards_count: 7
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista abrindo `/sispag` no início do expediente (pico ~08h) | `GET /sispag/painel` dispara fan-out ao vivo no Conexos (N filiais) + 3 leituras DB em paralelo, sem cache | `SispagPainelService.montarPainel` + `ConexosSispagClient.listLotes` (fin015) | Render (Express, 1 dyno), pool DB max=5, Conexos com pool de sessões ~10, latência típica 300ms–2s por chamada, `CONEXOS_FANOUT_LIMIT=4` | Painel montado em segundos, sem 504 do Render (~30s) mesmo com Conexos degradado; a segunda visita do mesmo analista deve custar menos que a primeira (cache) | p95 latência `/sispag/painel` ≤ 1500ms com 8 filiais; 0 timeout 504 em Conexos com p99 ≤ 5s por chamada; ≥ 50% dos hits servidos por cache com TTL curto (60s) |

Cenários secundários relevantes:
- Analista expande um card de lote candidato → `GET /sispag/lotes/:id/modalidades-disponiveis` faz **1 chamada Conexos por item do lote** (`getTituloAPagar` via `fin064/list?docCod#EQ`). Lote máximo = 25 itens → 25 chamadas por expansão, sem memoização client-side (`useEffect` reexecuta a cada mount). Alvo: p95 ≤ 1500ms; ideal batch server-side.
- Analista abre a aba "Retorno Lote (RET) - Conexos" → `GET /sispag/retornos` faz fan-out em duas ondas: N `ger015/list` + M `fin052/arquivosRetorno/list` (M = filiais × configs por filial). Sem cache. Alvo: p95 ≤ 2500ms.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Chamadas Conexos por `montarPainel` (N filiais) | `1 (getFiliais, cache) + N (listLotes)` | ≤ `N`, ideal ≤ 1 com cache TTL | ⚠️ | `src/backend/domain/service/sispag/SispagPainelService.ts:55-100` |
| Concorrência máx. do fan-out Conexos | `CONEXOS_FANOUT_LIMIT = 4` | 3–5 (documentado como teto para não estourar `LOGIN_ERROR_MAX_SESSIONS`) | ✅ | `SispagPainelService.ts:28`, `IngestaoPagamentosService.ts:20` |
| Cap de linhas devolvidas ao painel | `TITULOS_CAP = 400` títulos | ≤ 500 (evita payload gigante ao FE) | ✅ | `SispagPainelService.ts:23,105` |
| Chamadas Conexos por `listRetornos` | `N (ger015/list) + Σ (fin052/arquivosRetorno/list)` — sem cap | ≤ N, com cache TTL 60s | ❌ | `SispagPainelService.ts:139-190` |
| Chamadas Conexos por `modalidadesDisponiveisDoLote` (lote com K itens) | `K` chamadas (N+1: 1 por item, bounded=4) | 1 (batch server-side) OU memo client-side | ❌ | `SispagPainelService.ts:198-214`, `LoteCard.tsx:92-106` |
| `getTituloAPagar` — pageSize da consulta pontual | `200` (fin064/list filtrado por `docCod#EQ`) | ≤ 50 (título único ⇒ 1 linha esperada) | ⚠️ | `ConexosSispagClient.ts:231` |
| Cap de leitura `fin064/list` na ingestão | `pageSize = 1000` (por filial, não pagina) | Manter — filtra `vldPago#EQ=0 + titDtaVencimento` na janela; ok para o volume esperado | ✅ | `ConexosSispagClient.ts:188` |
| Cap de leitura `com298/list` na ingestão (exterior) | `pageSize = 5000` | Trocar por `paginate()` (safety cap) se filiais crescerem | ⚠️ | `ConexosSispagClient.ts:260` |
| SQL selectMany sem `LIMIT` em path callable | `LotePagamentoRepository.listLotes` (todos os lotes; JOIN com itens via `ANY($ids)`) + `TituloAPagarRepository.listAtivos` | 0 (todo endpoint precisa cap defensivo) | ❌ | `LotePagamentoRepository.ts:174-199`, `TituloAPagarRepository.ts:133-142` |
| Pool DB max × concorrência potencial | `max=5`, sem cap de concorrência HTTP do dyno | ≤ RDS/Supavisor max_connections (Supavisor mode compat) | ⚠️ | `PostgreeDatabaseClient.ts:26`, `rateLimit.ts:20` (100 req/min global) |
| Timeout outbound Conexos por chamada | `RetryExecutor(retries=2, delayMs=500, jitterMs=200)` — **sem timeout explícito** por request axios | Timeout duro por chamada (≤ 10s) para não empoçar dyno | ❌ | `ConexosBaseClient.ts:143-148`, `services/conexos.ts` (legacy axios) |
| Cache TTL do painel (memo/HTTP) | Nenhum — GET `/painel` sempre reconstrói | Cache in-memory 30–60s por instância (SWR trivial) | ❌ | `routes/sispag.ts:29-37` |
| Índices SQL nas tabelas SISPAG | 6 índices (`titulo_a_pagar (ativo,vencimento)`, `titulo_a_pagar (run)`, `lote_pagamento_item (fil,doc,tit)`, `lote_pagamento (status)`, `lote_pagamento (automatico,status)`, `pagamento_ingestao_run (finished_at)`) | Cobrem hot paths conhecidos; falta `lote_pagamento (fil_cod)` p/ o filtro do `listLotes` | ⚠️ | `migrations/0023..0031_*.sql` |
| Paginação nos endpoints `/sispag/lotes` e `/sispag/retornos` | **Cliente** (browser) — `useTabelaFiltro` filtra + fatia em memória | Server-side (`LIMIT/OFFSET`) para conjuntos que crescem sem cap | ❌ | `frontend/app/permutas/components/tabela-filtro.tsx:34-75`, `frontend/app/sispag/page.tsx:211-239` |
| Ingestion UPSERT chunk | `UPSERT_CHUNK = 200` (multi-row INSERT `ON CONFLICT DO UPDATE`) em uma transação | ✅ 200 é um sweet-spot razoável para pg (< 1000 params) | ✅ | `TituloAPagarRepository.ts:8,63` |
| Manual `setTimeout` / busy-loop em código SISPAG | 0 | 0 | ✅ | `grep -rn "setTimeout\|setInterval" src/backend/domain/**/sispag/*.ts` (nenhum) |
| Cache de `getFiliais` (metadado estático) | ✅ singleton in-memory (`this.filiais` no `services/conexos.ts:95,332`) | in-memory por processo | ✅ | `services/conexos.ts:332-335` |

> ⚠️ **Não medível localmente**: latência real de Conexos (p50/p95/p99 por endpoint) e taxa de timeout — dependem de instrumentação em produção (Render → CloudWatch/APM). Também não é medível o tempo total real de `/painel` sem stopwatch server-side ou APM. Recomendação: adicionar `logService.info` com `durationMs` no fim de `montarPainel/listRetornos/modalidadesDisponiveisDoLote` para termos baseline observável antes de tunar.

## 3. Tactics — Cobertura no SISPAG

**Control Resource Demand**

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A (não há stream de eventos amostrável no SISPAG) | N/A | — |
| Limit Event Response | `heavyRouteLimiter` (10 req/min/IP) protege `/ingestao` e `/lotes/formar` | ⚠️ parcial | `routes/sispag.ts:318,337`, `http/rateLimit.ts:28-35`. `/painel`, `/retornos`, `/modalidades-disponiveis` ficam apenas no `globalLimiter` (100 req/min/IP), sem cap dedicado apesar do fan-out. |
| Prioritize Events | Ingestão e formação de lotes usam advisory locks distintos (chaves 726354819 e 615243789) — não concorrem entre si nem com Permutas | ✅ presente | `IngestaoPagamentosService.ts:18`, `FormacaoLotesService.ts:21` |
| Reduce Overhead | `getFiliais` cacheado em singleton (evita re-login para cada request); ingestão faz UPSERT em chunks; `paginate` sai cedo em short-page/reachedExpected | ✅ presente | `services/conexos.ts:95,332`; `TituloAPagarRepository.ts:63-111`; `ConexosBaseClient.ts:285-289` |
| Bound Execution Times | `RetryExecutor` limita retries (2 × 500ms + jitter), mas **sem timeout duro por chamada axios**. Ingestão/formação têm advisory lock, mas nenhum `AbortController`/timeout | ❌ ausente | `ConexosBaseClient.ts:143-148`; `services/conexos.ts` (axios legacy sem `timeout`) |
| Increase Resource Efficiency | UPSERT multi-row em vez de N inserts; `paginate` respeita `count` do envelope; anti-fantasma restrito a filiais lidas | ✅ presente | `TituloAPagarRepository.ts:69-112`, `IngestaoPagamentosService.ts:96-120` |

**Manage Resources**

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | Pool DB `max=5` (subiu de 1 explicitamente para P0-6 do gate anterior). Sem menção a bump de dyno Render, mas fora do escopo desta review | ⚠️ parcial | `PostgreeDatabaseClient.ts:26` |
| Increase Concurrency | `BoundedConcurrency` executa fan-out com limite (default 3, SISPAG usa 4). Não bloqueia thread, não usa `setTimeout` | ✅ presente | `libs/concurrency/BoundedConcurrency.ts:41-61`, `SispagPainelService.ts:76-79` |
| Maintain Multiple Copies of Computations | Nenhuma cópia/replica secundária do painel (nem Redis, nem KV, nem SWR client) | ❌ ausente | `routes/sispag.ts:29-37` (sempre rebuilda) |
| Maintain Multiple Copies of Data | Carteira `titulo_a_pagar` **É** a cópia local dos títulos (evita bater fin064 a cada abertura do painel) — cadência via ingestão manual/cron. Excelente. | ✅ presente | `IngestaoPagamentosService.ts` + `migrations/0024_pagamento_ingestao.sql` |
| Bound Queue Sizes | N/A (arquitetura atual é síncrona, sem SQS/DLQ). Advisory lock funciona como serialização, não como fila; concurrent duplicate short-circuita para 409 | N/A | `IngestaoPagamentosService.ts:52-61`, `errors/IngestLockBusyError.ts` |
| Schedule Resources | Nenhum scheduler nativo para ingestão/formação — cron externo documentado como manual (`jobs/ingest-pagamentos.ts:11-13`). Runs manuais rate-limitadas | ⚠️ parcial | `jobs/ingest-pagamentos.ts`, cron não amarrado no repo |

**Facetas modernas**

| Faceta | Implementação atual | Status | Evidência |
|---|---|---|---|
| Cold start budget (Lambda) | N/A no runtime atual (Express/Render — dyno warm) | N/A | Estado atual vs. alvo — CLAUDE.md |
| Cache strategy | `getFiliais` in-memory. Zero HTTP-level ou service-level para `/painel`, `/retornos`, `/modalidades-disponiveis` | ❌ ausente | `services/conexos.ts:332` |
| Index discipline | Índices explícitos em migrations 0023/0024/0026, cobrem `listAtivos`, `listElegiveisParaFormacao`, `loteRascunhoComTitulo`, `desfazerAutomaticosVencidos`. Falta `lote_pagamento (fil_cod)` p/ `listLotes` filtro. | ⚠️ parcial | `migrations/0023_lote_pagamento.sql:48-52`, `0024_pagamento_ingestao.sql:60-63`, `0026_lote_automatico.sql:9` |
| Bundle leanness (frontend) | Página `/sispag/page.tsx` = 832 LOC num único bundle client. `LoteCard` importa `lucide-react` + `sonner`. Nada dramaticamente pesado (não achei xlsx/etc.) | ✅ (out-of-scope aqui — ver qa-deployability) | `frontend/app/sispag/page.tsx` |

## 4. Findings

### F-performance-1: `modalidadesDisponiveisDoLote` faz N+1 no Conexos, sem cache e sem batch

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead + Maintain Multiple Copies of Computations
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:198-214` e `src/frontend/app/sispag/components/LoteCard.tsx:92-106`
- **Evidência**:
  ```typescript
  // SispagPainelService.ts:203-207
  const settled = await this.bounded.run(
      lote.itens,
      (it) => this.sispag.getTituloAPagar(it.filCod, it.docCod, it.titCod),
      CONEXOS_FANOUT_LIMIT,
  );
  ```
  Cada expansão de card em `LoteCard.tsx:92-106` chama `fetchModalidadesDisponiveis(l.id)` num `useEffect` sem cache: cada vez que o analista fecha e reabre → K novas chamadas Conexos. K ≤ `MAX_TITULOS_POR_LOTE = 25`.
- **Impacto técnico**: para um lote de 25 títulos = 25 chamadas `fin064/list?docCod#EQ` em fan-out limit=4 ⇒ ~7 ondas × latência Conexos (300ms–2s) ⇒ 2s–14s de espera. Duas expansões simultâneas de analistas diferentes começam a saturar o pool de sessões do Conexos.
- **Impacto de negócio**: revisão do lote (etapa crítica antes do gate) fica lenta e "flaky" quando o ERP está degradado. Analista perde ~10s por expansão de card no p95 realista.
- **Métrica de baseline**: `K = |lote.itens|` chamadas por expansão, K ≤ 25; latência estimada p95 = 3–5s hoje, alvo ≤ 1500ms.

### F-performance-2: `GET /sispag/painel` sem cache — reconstrói fan-out a cada abertura/refresh

- **Severidade**: P1
- **Tactic violada**: Maintain Multiple Copies of Computations
- **Localização**: `src/backend/routes/sispag.ts:29-37`, `src/backend/domain/service/sispag/SispagPainelService.ts:54-132`
- **Evidência**: `montarPainel` sempre dispara `bounded.run(filCods, listLotes, 4)`. Nenhuma memoização — nem instância (in-memory por processo), nem HTTP (`Cache-Control`), nem SWR no client (o botão "Recarregar" e o `useEffect` batem sempre). Analista F5-a a tela → mesma latência.
- **Impacto técnico**: 8 filiais ⇒ 2 waves × latência p95 Conexos (~2s) + 3 leituras DB em paralelo (~50ms) ⇒ p95 estimado 3–5s por hit. Se 5 analistas abrirem simultaneamente → 40 leituras `fin015/list` em ~10s (perto do teto do pool Conexos).
- **Impacto de negócio**: pico das 08h é justamente quando o painel é aberto mais vezes. Latência percebida alta afeta adoção do produto.
- **Métrica de baseline**: chamadas Conexos por render = `1 + N` (N = filiais). Alvo: ≥ 50% dos hits servidos por cache TTL 30–60s ⇒ 0 chamadas Conexos.

### F-performance-3: `listRetornos` faz fan-out em duas ondas × filiais × configs, sem cache e sem cap

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead + Maintain Multiple Copies of Computations
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:139-190`
- **Evidência**: onda 1 = `N` chamadas `ger015/list` (uma por filial); onda 2 = `Σ configs_i` chamadas `fin052/arquivosRetorno/list` (uma por par filial × config). Sem cache; `ger015` (metadado de layout) muda raríssimo.
- **Impacto técnico**: 8 filiais × ~2 configs cada = 16 chamadas na onda 2 + 8 na onda 1 = 24 chamadas Conexos. Fan-out=4 ⇒ 6 waves ⇒ 3–12s p95. Cada visita à aba "Retorno Lote (RET)" reexecuta.
- **Impacto de negócio**: aba usada só para verificar retornos (~diária), mas cada visita custa muito. Payload retorna todos os arquivos históricos (sem `LIMIT`/janela) — cresce indefinidamente.
- **Métrica de baseline**: 24 chamadas Conexos por hit (com 8 filiais × 2 configs). Alvo: onda 1 cacheada por ≥ 1h (metadado) ⇒ 16 chamadas; onda 2 com TTL 30s ⇒ ~1 chamada por hit quando o cache está warm.

### F-performance-4: Sem timeout duro por chamada outbound Conexos — risco de esgotar o dyno

- **Severidade**: P1
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/domain/client/ConexosBaseClient.ts:143-148` (só configura retry), `src/backend/services/conexos.ts` (axios legacy sem `timeout` global visível)
- **Evidência**: `RetryExecutor({ retries: 2, delayMs: 500, jitterMs: 200 })` — se Conexos travar em 30s, cada tentativa espera 30s × 3 = potencial 90s de bloqueio por request, muito além do timeout HTTP do Render (~30s → 504) e além do tempo em que o pool DB do Postgres (max=5) fica saudável.
- **Impacto técnico**: uma janela de degradação Conexos empoça o dyno: 5–10 requests em `montarPainel` ⇒ 5 conexões pg presas aguardando ⇒ starvation. Idêntico ao "P1 timeout síncrono na Executar Lote" já registrado em Permutas — mesmo padrão, mesma consequência.
- **Impacto de negócio**: um blip Conexos deixa o SISPAG inteiro indisponível durante o retry; analista vê "Não foi possível carregar" sem explicação.
- **Métrica de baseline**: timeout efetivo por chamada = ∞ (do lado do client HTTP). Alvo: `timeout: 10_000ms` em `axios.create` do `services/conexos.ts` (cross-QA com qa-availability F-availability).

### F-performance-5: `LotePagamentoRepository.listLotes` sem `LIMIT` — cresce sem cap com o histórico

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:174-199`
- **Evidência**:
  ```sql
  SELECT ... FROM lote_pagamento
  WHERE ($status::text IS NULL OR status = $status)
    AND ($filCod::int IS NULL OR fil_cod = $filCod)
  ORDER BY criado_em DESC
  ```
  Nenhum `LIMIT`. Depois disso, `SELECT ... FROM lote_pagamento_item WHERE lote_id = ANY($ids)` — quanto mais lotes, maior o array. FE ainda pagina em memória via `useTabelaFiltro`.
- **Impacto técnico**: após 6 meses de operação com ~10 lotes/dia = 1800 lotes acumulados, `listLotes` devolve todos + todos os itens (média 10/lote = 18k linhas no JOIN). Payload ~2–5MB. Latência DB ainda tolerável, mas payload FE e serialização crescem monotonicamente.
- **Impacto de negócio**: degradação silenciosa. Analista não vê problema até que a página fique visivelmente lenta em 12 meses.
- **Métrica de baseline**: linhas devolvidas hoje = todos os lotes (< 100 provavelmente). Alvo: `LIMIT 100` server-side + paginação server-side (`?offset`), com "carregar mais" ou datepicker.

### F-performance-6: Paginação de listas grandes é 100% client-side (`useTabelaFiltro`)

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead (envelope + JSON parse cliente cresce com o dataset inteiro)
- **Localização**: `src/frontend/app/permutas/components/tabela-filtro.tsx:34-75` (reusado pelo SISPAG); consumido em `src/frontend/app/sispag/page.tsx:211-239`
- **Evidência**:
  ```typescript
  // tabela-filtro.tsx:44-51
  const filtrados = items.filter(...)
  const slice = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize)
  ```
  Todos os `items` já chegaram do backend. Aplica-se a `abaTitulos` (`titulos` cap=400 → OK), `abaCandidatos` / `abaFinalizados` (todos os lotes — ver F-5), `abaRetornos` (todos os `.RET` do fin052 — sem cap).
- **Impacto técnico**: retornos crescem indefinidamente. Bandwidth por visita = O(histórico total). Parse JSON no browser bloqueia main thread quando o dataset passar de alguns MB.
- **Impacto de negócio**: mesmo perfil de degradação silenciosa da F-5. Também consome cota de rede de analistas em redes ruins.
- **Métrica de baseline**: bytes por hit crescem monotonicamente. Alvo: paginação server-side (`LIMIT/OFFSET` no repo + `?limit&offset` na rota), payload constante em O(pageSize).

### F-performance-7: Falta índice `lote_pagamento (fil_cod)` para o filtro do `listLotes`

- **Severidade**: P3
- **Tactic violada**: Increase Resource Efficiency (index discipline)
- **Localização**: `src/backend/migrations/0023_lote_pagamento.sql:51-52` (só `status` está indexado); consulta em `LotePagamentoRepository.ts:174-183`
- **Evidência**: o filtro `($filCod::int IS NULL OR fil_cod = $filCod)` degrada para sequential scan quando `filCod` é fornecido, pois `idx_lote_pagamento_status` cobre só o status. Não é catastrófico hoje (poucas centenas de linhas) mas conforme o histórico cresce (F-5) o custo aumenta linearmente.
- **Impacto técnico**: seq scan em `lote_pagamento` quando o painel filtra por filial. Volume atual pequeno, mas junta com F-5.
- **Impacto de negócio**: baixa hoje; débito para escala.
- **Métrica de baseline**: n/a hoje (< 100 lotes). Alvo: `CREATE INDEX idx_lote_pagamento_fil_cod ON lote_pagamento (fil_cod)` em uma migration nova.

### F-performance-8: `com298/list` (exterior/EX) usa `pageSize=5000` sem `paginate()` — cap silencioso

- **Severidade**: P3
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:251-270`
- **Evidência**: a leitura de docCods do exterior faz uma única chamada com `pageSize: 5000`. Se uma filial tiver > 5000 processos EX ativos, a exclusão de internacionais deixa alguns passarem para a carteira SISPAG — falha silenciosa. Não usa `paginate()` (que teria safety-cap explícito e log de "cap-hit").
- **Impacto técnico**: risco baixo hoje (volumes muito abaixo), mas cresce com adoção. Sem alerta se o cap for atingido.
- **Impacto de negócio**: títulos internacionais aparecendo indevidamente no SISPAG (contradiz ADR-0021).
- **Métrica de baseline**: cap silencioso = 5000 linhas. Alvo: `paginate()` com `onCapHit` gerando `logService.warn`.

## 5. Cards Kanban

### [performance-1] Batch server-side de `modalidadesDisponiveisDoLote` + memo client

- **Problema**
  > Ao expandir um card de lote em rascunho, o backend faz uma chamada `fin064/list?docCod#EQ` por título do lote (N+1 clássico, até 25 chamadas). O `useEffect` do `LoteCard.tsx` refaz o fetch a cada abrir/fechar. Em Conexos degradado, a expansão de UM card demora 5–14s.

- **Melhoria Proposta**
  > Aplicar Bass **Reduce Overhead** + **Maintain Multiple Copies of Computations**. Opção A (barata): memoizar por `loteId` no client com `React.useRef`/`useSWR` (revalidar apenas ao mudar `l.versao`). Opção B (mais correta): trocar `getTituloAPagar` por uma leitura em lote usando `fin064/list` filtrado por `docCod#IN [...]` (uma chamada por lote), se o Conexos aceitar; se não aceitar, cachear no service com TTL 60s por `(filCod, docCod, titCod)`. Arquivos: `SispagPainelService.modalidadesDisponiveisDoLote`, `ConexosSispagClient.getTituloAPagar`, `LoteCard.tsx`.

- **Resultado Esperado**
  > Chamadas Conexos por expansão de card: de `K` (K ≤ 25) → 1 (batch) ou 0 (cache warm). p95 expansão de card ≤ 1500ms (baseline estimado 3–5s).

- **Tactic alvo**: Reduce Overhead + Maintain Multiple Copies of Computations
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - Chamadas Conexos por expansão: `K` → 1 (Opção B) ou 0 (cache warm)
  - p95 latência `/modalidades-disponiveis`: ~4000ms (estimado) → ≤ 1500ms
- **Risco de não fazer**: revisão do lote (etapa crítica antes do gate) sente cada blip Conexos; analista abandona lotes maiores.
- **Dependências**: nenhuma

### [performance-2] Cache in-memory por instância para `GET /sispag/painel` (TTL 30–60s)

- **Problema**
  > Cada abertura/refresh de `/sispag` reconstrói o painel do zero: fan-out `listLotes` por filial (N chamadas Conexos) + 3 leituras DB. Não há memoização em nenhuma camada. Cinco analistas abrindo simultaneamente = 5×N chamadas Conexos em ~10s.

- **Melhoria Proposta**
  > Aplicar Bass **Maintain Multiple Copies of Computations**. Cachear o `SispagPainelResponse` em `SispagPainelService` por chave `latestRunFinishedAt` (ou timestamp de round(now/60s)) com TTL de 30s. Invalidar imediatamente após `POST /sispag/ingestao`, `POST /sispag/lotes/*` e `POST /sispag/lotes/formar`. Cross-QA com qa-availability (aumenta MTBF durante blip Conexos).

- **Resultado Esperado**
  > Hits com cache warm respondem sem tocar Conexos. p95 `/sispag/painel` cai de estimados 3–5s para ≤ 200ms quando cached; miss rate ≤ 50% em horário de pico.

- **Tactic alvo**: Maintain Multiple Copies of Computations
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - Cache hit-rate ≥ 50% em horário de pico
  - p95 latência `/sispag/painel` (cache hit): → ≤ 200ms
  - Chamadas Conexos por hit cached: N → 0
- **Risco de não fazer**: pico das 08h continua a punir o Conexos e o analista.
- **Dependências**: card `performance-2` isoladamente vale; melhora ainda mais se combinado com `performance-3`.

### [performance-3] Timeout duro por chamada axios no `services/conexos.ts` (+ orçamento total no service)

- **Problema**
  > O axios legacy do `services/conexos.ts` não tem `timeout` configurado; o `RetryExecutor` só limita tentativas. Um Conexos travado em 30s por chamada, com 2 retries, pode segurar um request por 90s — muito além do timeout HTTP do Render (~30s) e do pool DB (max=5). Mesmo padrão do P1 já conhecido de Permutas "Executar Lote".

- **Melhoria Proposta**
  > Aplicar Bass **Bound Execution Times**. Adicionar `axios.create({ timeout: 10_000 })` no `services/conexos.ts` (afeta tudo, não só SISPAG). No `SispagPainelService.montarPainel/listRetornos`, adicionar orçamento total (ex.: `AbortSignal.timeout(15_000)`) e degradar para o cache stale se estourar (compõe com card `performance-2`).

- **Resultado Esperado**
  > Tempo máximo de bloqueio por chamada outbound Conexos: ∞ → 10s. Zero 504 no Render em janela de degradação Conexos com p99 ≤ 5s.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - Timeout por chamada: ∞ → 10s
  - Latência máxima real (com 2 retries): ∞ → ~32s (10s × 3 + jitter), mas com fallback do cache stale ≤ 500ms
- **Risco de não fazer**: um blip Conexos derruba o SISPAG inteiro por saturação do dyno. Já observado em Permutas.
- **Dependências**: cross-QA com `qa-availability` (mesmo card lá).

### [performance-4] Cache do `listRetornos` (metadado ger015 + arquivos por (fil, cfg))

- **Problema**
  > `listRetornos` faz N + Σ configs chamadas Conexos por hit (24 chamadas com 8 filiais × 2 configs), sem cache. `ger015` (metadado de layout de retorno) muda raríssimo — cachear por hora traria enorme redução.

- **Melhoria Proposta**
  > Aplicar Bass **Reduce Overhead**. Cachear `listConfigsRetorno` no `ConexosSispagRetornoClient` in-memory por `filCod` com TTL 1h; cachear `listArquivosRetorno` por chave `(filCod, bncCod, gtbCodSeq)` com TTL 30s. Alternativa: mover parte do listing para uma ingestão periódica (mesma doutrina do `titulo_a_pagar`).

- **Resultado Esperado**
  > Cache warm: 24 chamadas → 0. Cache cold: 24 → mesmo, mas com `AbortSignal.timeout` (card `performance-3`) evita horrores.

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Chamadas Conexos por hit `/sispag/retornos` (warm): 24 → 0
  - p95 latência `/sispag/retornos` (warm): estimado 3–8s → ≤ 300ms
- **Risco de não fazer**: aba fica desconfortável de usar; empurra analista a evitar verificar retornos.
- **Dependências**: nenhuma; combina bem com `performance-2`.

### [performance-5] Paginação server-side em `/sispag/lotes` e `/sispag/retornos`

- **Problema**
  > O backend devolve TODA a lista de lotes (com todos os itens JOIN) e TODOS os arquivos `.RET`. O FE pagina em memória via `useTabelaFiltro`. Como o histórico só cresce, payload e parse crescem monotonicamente — hoje pequeno, débito para 6–12 meses.

- **Melhoria Proposta**
  > Aplicar Bass **Reduce Overhead**. Adicionar `LIMIT $limit OFFSET $offset` em `LotePagamentoRepository.listLotes` (default 50, cap 200) e em `listArquivosRetorno` (via cursor por `garCodSeq`). Rotas aceitam `?limit&offset`. FE troca `useTabelaFiltro.slice` por chamadas paginadas. Compatível com o "Dynamic WHERE Pattern" do CLAUDE.md.

- **Resultado Esperado**
  > Payload por hit constante em O(pageSize) em vez de O(histórico total). Bandwidth ≤ 200KB por página (baseline crescente até MBs em 12 meses).

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-performance-5, F-performance-6
- **Métricas de sucesso**:
  - Payload `/sispag/lotes` por hit: O(N_lotes × itens) → O(pageSize=50 × itens_médio)
  - `SELECT ... FROM lote_pagamento`: sem LIMIT → `LIMIT 50`
- **Risco de não fazer**: degradação silenciosa em 6–12 meses conforme o histórico acumula.
- **Dependências**: nenhuma

### [performance-6] Índice `lote_pagamento (fil_cod)` + revisão de índices SISPAG

- **Problema**
  > `LotePagamentoRepository.listLotes` filtra por `fil_cod` mas não há índice — hoje irrelevante (< 100 lotes), mas quando combinado com `LIMIT/OFFSET` (`performance-5`) e histórico crescente, evita seq scan.

- **Melhoria Proposta**
  > Aplicar Bass **Increase Resource Efficiency**. Nova migration `00xx_sispag_indexes.sql` adicionando `CREATE INDEX IF NOT EXISTS idx_lote_pagamento_fil_cod ON lote_pagamento (fil_cod)`. Revisar EXPLAIN de `listAtivos` e `listElegiveisParaFormacao` (parcial index `WHERE ativo AND aprovado AND NOT pago` pode valer a pena quando o volume crescer). Cross-QA com qa-modifiability (schema-as-code).

- **Resultado Esperado**
  > `listLotes(filCod=X)` deixa de fazer seq scan. Custo do plan ≈ constante conforme o histórico cresce.

- **Tactic alvo**: Increase Resource Efficiency
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-7
- **Métricas de sucesso**:
  - Plano de `SELECT ... FROM lote_pagamento WHERE fil_cod = X`: Seq Scan → Index Scan
- **Risco de não fazer**: baixa hoje; multiplica-se se `performance-5` ficar solto.
- **Dependências**: idealmente aterrissa junto com `performance-5`.

### [performance-7] Trocar `com298/list pageSize=5000` por `paginate()` com log de cap-hit

- **Problema**
  > `listExteriorDocCods` faz uma única chamada com `pageSize=5000`. Se algum dia uma filial passar disso, o cap é silencioso e títulos internacionais vazam para a carteira SISPAG (contradiz ADR-0021).

- **Melhoria Proposta**
  > Aplicar Bass **Bound Execution Times** + observabilidade. Trocar por `base.paginate({ endpoint: 'com298/list', bodyBase: {...}, opts: { filCod }, onCapHit: () => logService.warn(...) })`. Ou, no mínimo, adicionar `logService.warn` se `rows.length === pageSize`.

- **Resultado Esperado**
  > Sem falha silenciosa. Se algum dia o cap for atingido, aparece nos logs como `BUSINESS_WARN` com filCod → dá tempo de subir o cap ou pesquisar por que subiu.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-8
- **Métricas de sucesso**:
  - Cap-hits silenciosos: possíveis → 0 (todos viram log)
- **Risco de não fazer**: baixo hoje; sinaliza descuido quando o volume subir.
- **Dependências**: nenhuma

## 6. Notas do agente

- **Escopo**: só SISPAG (Frente II). Não avaliei Permutas nem clients dormentes (`ConexosSispagWriteClient`, `RetornoOrquestracaoService`) — se o toggle `CONEXOS_WRITE_ENABLED` for ligado, o `carregar` do `.RET` e a escrita `fin015` viram hot paths e precisam de review dedicado.
- **Métricas não colhidas** (não medíveis localmente): latência real de Conexos por endpoint, taxa de 504 do Render, tamanho médio real dos payloads em produção. Recomendação: adicionar `durationMs` nos `logService.info` de `montarPainel/listRetornos/modalidadesDisponiveisDoLote` para termos baseline antes de tunar; correlacionar com métricas do Render.
- **Cross-QA detectado (alertar consolidator)**:
  - `performance-3` (timeout Conexos) sobrepõe direto com qa-availability + qa-fault-tolerance — é o mesmo card sob 3 ângulos. Consolidar para não duplicar esforço.
  - `performance-6` (índices como código) sobrepõe com qa-modifiability (schema-as-code, dependência de migration).
  - `performance-2` (cache do painel) é também melhoria de qa-availability (degrade-to-stale mantém a UI viva durante blip Conexos).
  - Já existe um "P1 conhecido" documentado em Permutas ("síncrono timeout no Executar Lote") — F-performance-4 é o análogo direto no SISPAG.
- **Score justificado**: 6/10 — engenharia razoável (BoundedConcurrency, `TITULOS_CAP`, índices explícitos, filiais cacheadas, ingestão persistida evita bater fin064 a cada painel), mas 3 P1s reais (N+1 modalidades, painel sem cache, timeout Conexos ausente) puxam o score para baixo. Sem os P1s, virava 8.
