---
qa: Performance
qa_slug: performance
run_id: 2026-06-25-1713
agent: qa-performance
generated_at: 2026-06-25T17:13:00-03:00
scope: backend,frontend
score: 4
findings_count: 6
cards_count: 6
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Executar todas (N)" na aba Automáticas (N ≈ 26 hoje, tende a crescer com mais filiais/importadores) | 1 request HTTP `POST /permutas/reconciliar-lote` que dispara loop sequencial server-side: para CADA adto → ~5 chamadas síncronas ao Conexos (`criarBordero` + `validarTituloBaixa` + `validarTituloPermuta` + `atualizarValorLiquido` + `gravarBaixaPermuta`) | `ReconciliacaoLotePermutaService.reconciliarLote` (BE/Express, Render free/hobby) + `ConexosClient` (timeout=40s por chamada) + Postgres (Supabase) + browser do analista | Produção (`CONEXOS_WRITE_ENABLED=true`), horário comercial, sem outras escritas concorrentes | Concluir a baixa de todos os adtos automáticos em um único request; retornar agregado (`totalSettled`, `totalErros`, `borderos[]`) sem o proxy fechar a conexão antes do fim | Wall-clock ≤ 60s para N=26 (alvo: o proxy do Render aceita ~100s, mas a UX precisa de feedback contínuo); 0% requests cortados por gateway timeout; 100% adtos com status determinístico (settled/error/skipped) — nenhum "limbo" cliente sem resposta |

> Hoje a execução é **síncrona e sequencial**: ~26 casos × ~5 chamadas ERP = **~130 round-trips Conexos
> em UM request HTTP**. Reusa `ReconciliacaoPermutaService.reconciliar` por adto (continue-on-error +
> idempotência write-ahead já garantidas). O risco principal é **tempo de parede**: latência por chamada
> ao Conexos não é medida no repo, mas é razoável projetar 300ms–1500ms p50 (ERP on-prem + sessão).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Chamadas Conexos por adto (caminho real, não dry-run) | 5 (`criarBordero`+`validarTituloBaixa`+`validarTituloPermuta`+`atualizarValorLiquido`+`gravarBaixaPermuta`) — `criarBordero` ocorre uma vez por adto, demais por par adto↔invoice | n/a (limite do contrato ERP fin010) | ⚠️ medido | `ReconciliacaoPermutaService.ts:182-336` |
| Adtos automáticos esperados por execução (hoje) | ~26 (baseline declarado em `_shared-metrics.md`) | n/a — métrica do domínio | ⚠️ medido | `_shared-metrics.md` linha "≈26 casos hoje" |
| Round-trips Conexos por request `/reconciliar-lote` | ~130 sequenciais (26 × 5) | ≤ 50 por request HTTP (limite informal: cada round-trip ~300–1500ms ⇒ 50 × 1s ≈ 50s, abaixo do timeout do proxy) | ❌ | derivado de `ReconciliacaoLotePermutaService.ts:91-127` + `ReconciliacaoPermutaService.ts:228-336` |
| Latência por chamada Conexos | ⚠️ **Não medível localmente** (depende do ERP on-prem + sessão Conexos). Banda plausível: 300ms p50 / 1500ms p95 (timeout do client = 40s por chamada, `services/conexos.ts:81`) | p95 ≤ 1500ms (suposição defensável) | ⚠️ não medível | `services/conexos.ts:81` (timeout=40000) |
| Wall-clock estimado para N=26 (banda) | 26 × 5 × 300ms ≈ **39s** (p50) ; 26 × 5 × 1500ms ≈ **195s** (p95) | ≤ 60s (UX) ; ≤ 100s (limite do proxy Render para requests "long-running") | ❌ | cálculo a partir das duas métricas anteriores |
| Timeout do servidor Express / proxy Render | ⚠️ **Não medível localmente**. Render free/hobby corta requests inativos em ~100s (regra de plataforma, não codificada no repo); Express padrão sem `server.timeout` explícito | request ≤ 100s ou usar streaming/job assíncrono | ⚠️ não medível | grep `timeout|requestTimeout` em `src/backend/` → 0 hits relevantes |
| Heartbeat/streaming de progresso ao cliente | 0 (resposta JSON única no fim) | ≥ 1 a cada 10s (chunked / SSE / poll) p/ evitar timeout intermediário e dar feedback ao analista | ❌ | `routes/permutas.ts:426-447` retorna `res.json(result)` único |
| Concorrência server-side dentro do lote | 1 (loop `for...of await`) | 2–4 (com pacing) ou 1 + job assíncrono | ❌ | `ReconciliacaoLotePermutaService.ts:91` (`for...of`) |
| Bound de execução (timeout / cancelamento do lote) | nenhum no service; só o timeout-por-chamada do `ConexosClient` (40s) | bound explícito por request (ex.: 90s) + cancellation token | ❌ | nenhum `AbortController` / `Promise.race` no service |
| `heavyRouteLimiter` no endpoint | 10 req/min por IP — adequado para esta ação | n/a (correto) | ✅ | `http/rateLimit.ts:20-26` |
| `exporGestao` carregado UMA vez no início do lote | 1 leitura agregada (não está dentro do loop) | 1 leitura (atual) | ✅ | `ReconciliacaoLotePermutaService.ts:69` |
| Idempotência (segura para retry após timeout) | write-ahead por par + chave determinística — retry NÃO duplica baixa | retry seguro 100% | ✅ | `ReconciliacaoPermutaService.ts:141-181` |
| Bundle size frontend / cold start Lambda | N/A (Express+Render hoje, sem Lambda) | n/a no escopo desta feature | N/A | `CLAUDE.md` "Estado Atual vs. Alvo" |

> ⚠️ **Não medível localmente**: latência real por chamada ao Conexos (precisa de produção/staging com
> APM ou `pino-http`+timings). Recomendação: instrumentar `ConexosClient.postGeneric` para registrar
> `duration_ms` por chamada (já há logger no client) e somar por `requestId` p/ produzir o wall-clock real.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — não há streaming/eventos amostráveis nesta ação (escrita financeira é all-or-each, não amostrável) | N/A | — |
| Limit Event Response | `heavyRouteLimiter` 10/min por IP no endpoint do lote — evita re-disparo em duplo-clique e protege o fan-out ao ERP | ✅ presente | `routes/permutas.ts:426-431` + `http/rateLimit.ts:20-26` |
| Prioritize Events | Lote processa na ORDEM declarada (insert order do Map dedupe) — não há priorização (ex.: filial menos ocupada primeiro). Para N=26 atual não é problema | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:73-82` |
| Reduce Overhead | `exporGestao()` chamado UMA vez no início (não dentro do loop) — boa redução de overhead. Borderô criado UMA vez por adto e reusado para todos os pares (não 1 borderô por par) | ✅ presente | `ReconciliacaoLotePermutaService.ts:69` + `ReconciliacaoPermutaService.ts:184-193` |
| Bound Execution Times | ❌ **AUSENTE** — não há bound de wall-clock no request; só timeout-por-chamada (40s) no `ConexosClient`. Lote pode rodar minutos enquanto o proxy do Render eventualmente corta a conexão | ❌ ausente | `ReconciliacaoLotePermutaService.ts:91-127` (sem `AbortController` / `Promise.race` / deadline) |
| Increase Resource Efficiency | Reuso de `borCod` evita criar borderô por par. Idempotência pula adto já settled (`skipped` cheap). Falta: paralelismo controlado e short-circuit em dry-run (não chama o ERP — já correto) | ⚠️ parcial | `ReconciliacaoPermutaService.ts:184-193` (reuso borCod) + `:125-138` (dry-run sem POST) |
| Increase Resources | N/A — Render free/hobby de single-worker; escalar verticalmente não muda o gargalo (sequência síncrona Conexos) | N/A | — |
| Increase Concurrency | ❌ **AUSENTE** — loop `for...of await` totalmente sequencial. Não há `Promise.all` com pool/p-limit. Poderia rodar 2–4 adtos em paralelo respeitando o limite de sessão do ERP | ❌ ausente | `ReconciliacaoLotePermutaService.ts:91` |
| Maintain Multiple Copies of Computations | N/A — escrita única; não há cache replicável | N/A | — |
| Maintain Multiple Copies of Data | N/A — fonte da verdade é o ERP `fin010`; não cabe replicação na escrita | N/A | — |
| Bound Queue Sizes | ❌ **AUSENTE** — não há fila (mecanismo é request síncrono). Em arquitetura alvo (Lambda+SQS) isso vira `SQS batch_size` + `visibility_timeout` | ❌ ausente | `routes/permutas.ts:426-447` |
| Schedule Resources | ⚠️ Loop FIFO simples. Não há scheduling por filial/sessão Conexos. Para N pequeno é aceitável | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:91` |
| Cache strategy | `exporGestao` (snapshot relacional) é o cache implícito do conjunto de automáticas — read único antes do loop. ✅ Não há re-fetch dentro do loop | ✅ presente | `ReconciliacaoLotePermutaService.ts:69` |
| Bundle leanness / cold start | N/A — Express+Render, não Lambda. Reaplicar quando migrar | N/A | `CLAUDE.md` "Estado Atual vs. Alvo" |

## 4. Findings (achados)

### F-performance-1: Lote de ~130 round-trips Conexos em UMA request HTTP síncrona → risco P95 acima do timeout de proxy

- **Severidade**: P1 (alto — degrada QA mensurável; ainda não P0 porque a idempotência write-ahead torna o retry seguro, mas degrada UX e pode mascarar sucesso parcial como falha)
- **Tactic violada**: Bound Execution Times + Increase Concurrency
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:91-127` + `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:228-336`
- **Evidência (objetiva)**:
  ```
  // Loop 100% sequencial, sem bound, sem concorrência, sem heartbeat:
  for (const docCod of ordem) {           // ordem.length ≈ 26 hoje
      const r = await this.reconciliacaoService.reconciliar({ ... });
      // dentro de reconciliar(): handshake fin010 de 5 chamadas Conexos por par
  }
  ```
  Cálculo: 26 adtos × 5 chamadas × banda [300ms p50, 1500ms p95] = **39s p50 / 195s p95**.
- **Impacto técnico**: o proxy do Render (e qualquer reverse-proxy razoável) cortará uma resposta HTTP que demore mais que ~100s. Quando isso ocorrer, o cliente recebe erro de rede ENQUANTO o backend ainda está processando — o analista não saberá quais adtos foram baixados e quais não. A idempotência protege contra duplicação no retry, mas o sintoma percebido é "falha total" mesmo com sucesso parcial real.
- **Impacto de negócio**: analista vê "Falha ao executar o lote" e não tem visibilidade de quantos borderôs foram criados. Aciona suporte / refaz manualmente o que já está feito. Em uma run com 26 adtos, perda potencial de ~5–10min de trabalho do analista + ruído operacional. Quando N crescer (mais filiais/importadores em onboarding), vira P0.
- **Métrica de baseline**: ~130 round-trips síncronos por request, sem bound de wall-clock; banda estimada **39–195s** (P50–P95). Alvo: ≤ 60s ou execução assíncrona com progresso.

### F-performance-2: Sem feedback de progresso ao cliente durante o lote (resposta única no fim)

- **Severidade**: P1 (alto — UX e diagnóstico de incidente)
- **Tactic violada**: Limit Event Response (do lado UX) + Bound Execution Times
- **Localização**: `src/backend/routes/permutas.ts:426-447` + `src/frontend/app/permutas/page.tsx:748-776`
- **Evidência (objetiva)**:
  ```
  // Backend: res.json(result) único no fim, sem chunked/SSE.
  // Frontend: await reconciliarLoteAutomaticas({ dryRun: false }) — bloqueia
  // o handler até voltar; spinner único sem % nem "X de N".
  ```
- **Impacto técnico**: o cliente não pode distinguir "ainda processando" de "travou". Sem heartbeat o connection pool intermediário pode considerar a conexão idle e fechá-la mesmo antes de ~100s.
- **Impacto de negócio**: analista fica observando spinner por dezenas de segundos sem confirmação; tende a recarregar a página (que neste fluxo é seguro — idempotência — mas confunde e atrasa).
- **Métrica de baseline**: 0 eventos de progresso emitidos pelo backend durante uma run de ~30–200s; alvo: ≥ 1 evento (chunk/SSE/poll) a cada 10s.

### F-performance-3: Loop estritamente sequencial — concorrência potencial entre adtos não explorada

- **Severidade**: P2 (médio — reduz a banda P95 pela metade ou mais sem mudar a arquitetura)
- **Tactic violada**: Increase Concurrency
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:91`
- **Evidência (objetiva)**:
  ```
  for (const docCod of ordem) {
      const r = await this.reconciliacaoService.reconciliar({ ... });
  }
  ```
- **Impacto técnico**: cada adto é independente do outro (borderô diferente, par adto↔invoice diferente). Rodar 2–4 em paralelo (com p-limit) reduziria o wall-clock proporcionalmente, dentro do limite de sessão do ERP.
- **Impacto de negócio**: tempo de execução do lote 2–4× maior do que o necessário. Para N=26 é a diferença entre 40s e 10s p50.
- **Métrica de baseline**: paralelismo = 1; alvo factível: 2–4 com pacing (precisa validar com o Yuri que o Conexos aceita sessões simultâneas — sonda real).

### F-performance-4: Sem bound de execução / cancellation no lote

- **Severidade**: P2 (médio — relacionado a F-performance-1; principalmente higiene de robustez)
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:91-127`
- **Evidência (objetiva)**: nenhum `AbortController`, `Promise.race` com `setTimeout`, deadline `req.on('close')`, nem checagem de tempo decorrido no loop.
- **Impacto técnico**: se o cliente cancelar (fechar aba) ou o proxy cortar, o loop continua até o fim consumindo sessão do Conexos. Sem deadline, um adto patológico (5 chamadas no timeout máximo de 40s = 200s sozinho) pode estender a request muito além do esperado.
- **Impacto de negócio**: desperdício de recursos do ERP e do backend após o cliente desistir; falta de previsibilidade de SLA. Não é P0 porque a idempotência torna seguro.
- **Métrica de baseline**: 0 mecanismos de bound; alvo: 1 deadline duro (ex.: 90s) + checagem de `req.aborted` antes de cada adto.

### F-performance-5: Latência por chamada Conexos não instrumentada (cego para o gargalo real)

- **Severidade**: P2 (médio — sem o número real, qualquer decisão de paralelismo/timeout é palpite)
- **Tactic violada**: (meta-tactic) Manage Sampling Rate — telemetria
- **Localização**: `src/backend/domain/client/ConexosClient.ts` + `src/backend/services/conexos.ts:79-81`
- **Evidência (objetiva)**: o `LogService` registra eventos de negócio (SETTLED/DRY-RUN/FALHOU) mas não há histograma/duration por chamada Conexos. Banda assumida nesta avaliação (300ms p50 / 1500ms p95) é literatura, não medição.
- **Impacto técnico**: sem o p50/p95 real, é impossível dimensionar paralelismo, deadline, ou justificar migração para job assíncrono numericamente.
- **Impacto de negócio**: cada análise de incidente vira investigação ad-hoc.
- **Métrica de baseline**: 0% das chamadas Conexos com `duration_ms` no log; alvo: 100% (campo `duration_ms` em todo log de chamada do `ConexosClient`).

### F-performance-6: Sem paginação/limite no payload de resposta do lote

- **Severidade**: P3 (baixo — só vira problema com N grande)
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:143-151`
- **Evidência (objetiva)**: `resultados: ReconciliarLoteItem[]` cresce O(N adtos). Hoje N=26, payload <10KB. Em onboarding de novas filiais (N=200+), payload chega a ~80KB+ por response.
- **Impacto técnico**: bytes na resposta + render no frontend (toast/log). Não é problema agora.
- **Impacto de negócio**: nenhum no curto prazo.
- **Métrica de baseline**: ~26 itens × ~200B = ~5KB; alvo: avaliar quando N > 100.

## 5. Cards Kanban

### [performance-1] Quebrar o lote em job assíncrono + endpoint de progresso (poll/SSE)

- **Problema**
  > Um único `POST /permutas/reconciliar-lote` faz ~130 chamadas síncronas ao Conexos (26 adtos × 5) em uma só request HTTP. Banda projetada 39s (p50) a 195s (p95) — acima do que o proxy do Render aceita sem cortar (~100s). Hoje a idempotência write-ahead torna o sintoma "falha aparente, sucesso parcial real": o analista não sabe quais borderôs ficaram prontos.

- **Melhoria Proposta**
  > Manter o endpoint atual como **modo síncrono** apenas para `dryRun=true` (rápido — sem chamadas ERP) e introduzir um modo **assíncrono** para a baixa real:
  > 1. `POST /permutas/reconciliar-lote` retorna `202 Accepted` com `{ runId }` e dispara o loop em background (no estado-alvo será EventBridge+Lambda; **no atual Express**, usar processo background com persistência em `permuta_execucao` que já existe + um novo `permuta_lote_run` para o agregado).
  > 2. `GET /permutas/reconciliar-lote/:runId` devolve `{ status: 'running'|'done'|'error', processados, total, resultados[] }` — o frontend faz polling a cada 2s.
  > 3. Frontend mostra "X de N processados" + lista parcial à medida que avança.
  > Reusar `ReconciliacaoPermutaService.reconciliar` por adto, exatamente como hoje (continue-on-error + idempotência intactas).

- **Resultado Esperado**
  > Wall-clock percebido pelo cliente HTTP: 200–400ms (ack do job). Tempo total da execução não muda, mas deixa de bloquear conexão; o analista vê progresso contínuo e nunca recebe "falha de rede" em sucesso parcial real.

- **Tactic alvo**: Bound Execution Times + Limit Event Response
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-performance-1, F-performance-2, F-performance-4
- **Métricas de sucesso**:
  - Wall-clock do request HTTP do cliente: ~40–200s (atual) → ≤ 1s (ack)
  - % de runs em que o cliente perde a resposta após sucesso parcial: hoje ⚠️ não medido (mas > 0 esperado a partir de N≈40) → 0%
  - Feedback de progresso ao usuário: 0 eventos → ≥ 1 a cada 2s
- **Risco de não fazer**: quando N crescer (onboarding de novas filiais/importadores — roadmap declarado nos resumes), a feature passa a falhar visualmente de forma rotineira; suporte vira gargalo.
- **Dependências**: alinhar com qa-availability (mesma raiz: long-running request em proxy com timeout) — coordenar com o card de availability sobre timeout.

### [performance-2] Paralelizar o lote com pool controlado (p-limit) entre adtos

- **Problema**
  > Loop `for...of await` em `ReconciliacaoLotePermutaService.reconciliarLote` processa um adto por vez. Como cada adto é independente (borderô e par adto↔invoice próprios), há oportunidade de rodar 2–4 em paralelo, dividindo o wall-clock proporcionalmente sem mudar a arquitetura.

- **Melhoria Proposta**
  > Aplicar concorrência limitada (ex.: lib leve `p-limit` ou um pequeno pool manual) no laço de adtos do `reconciliarLote`. Validar **primeiro** com o time/Yuri o nº máximo de sessões simultâneas que o Conexos tolera (sonda real, não chute) — começar conservador (2) e medir. Manter a ordem de logs / agregação determinística por requestId.

- **Resultado Esperado**
  > Wall-clock do lote: ~40–200s (p50/p95 atual) → ~10–50s (p50/p95) com paralelismo 4. Combinado com performance-1, o tempo de espera percebido pelo analista cai 4× ainda mais.

- **Tactic alvo**: Increase Concurrency + Schedule Resources
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) — depois de confirmado o limite de sessões do Conexos
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Paralelismo dentro do lote: 1 → 2–4 (configurável)
  - Wall-clock p50 (N=26): ~39s → ~10–20s
- **Risco de não fazer**: à medida que N cresce, o tempo de execução do lote vira linearmente proporcional a N (vs. ~N/4 com paralelismo).
- **Dependências**: confirmar com o Yuri / sonda Conexos o limite de sessões simultâneas. Vale combinar com performance-1 (paralelismo dentro do job assíncrono).

### [performance-3] Instrumentar duração por chamada Conexos (`duration_ms` + p50/p95 por endpoint)

- **Problema**
  > Toda a análise desta seção está chutando a latência por chamada Conexos com base em literatura (300ms p50 / 1500ms p95) porque o `ConexosClient` não loga `duration_ms`. Sem o número real, qualquer decisão (deadline, paralelismo, alarme) é palpite.

- **Melhoria Proposta**
  > Envolver `ConexosClient.postGeneric` / `getGeneric` / `deleteGeneric` em um wrapper que mede `performance.now()` por chamada e loga `{ path, duration_ms, status, requestId }` via `LogService`. Em uma fase 2, agregar p50/p95 por endpoint em CloudWatch/Logflare/qualquer destino que já receba os logs.

- **Resultado Esperado**
  > 100% das chamadas Conexos com `duration_ms` no log. Dashboard simples mostrando p50/p95 por endpoint do fin010 — input para dimensionar o card performance-2 e para alertar quando p95 degrada.

- **Tactic alvo**: (meta) telemetria — pré-requisito para qualquer outra tactic de Performance
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - Cobertura de telemetria de duração nas chamadas ao Conexos: 0% → 100%
  - p50/p95 por endpoint do fin010: indefinido → conhecido (publicado no log estruturado)
- **Risco de não fazer**: continuamos cegos ao gargalo real; qualquer regressão de latência no Conexos passa despercebida até o usuário reclamar.
- **Dependências**: nenhuma.

### [performance-4] Bound de execução duro no lote (deadline + cancellation no `req.on('close')`)

- **Problema**
  > O loop do lote não tem deadline próprio. Um adto patológico (5 chamadas no timeout máximo de 40s do `ConexosClient` = 200s sozinho) ou um cliente que fechou a aba não interrompem o processamento. Sem bound, o request gasta sessão do Conexos depois do cliente ter desistido.

- **Melhoria Proposta**
  > Combinar duas guardas:
  > 1. **Deadline duro** por request (ex.: 90s no modo síncrono atual; deixa de fazer sentido se performance-1 for adotado — neste caso, deadline vira do job em si, ex.: 30min).
  > 2. **Cancellation** — escutar `req.on('close')` (Express) e marcar uma flag `aborted` no loop; checar a flag antes de cada `await reconciliacaoService.reconciliar(...)` e abortar com graceful "interrompido pelo cliente — N adtos processados".

- **Resultado Esperado**
  > Nenhuma chamada Conexos ocorre após o cliente fechar a aba. Wall-clock máximo por request limitado e previsível.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - Chamadas Conexos após `req.on('close')`: indefinido → 0
  - Wall-clock máximo por request: ilimitado → ≤ 90s (síncrono) / ≤ 30min (job)
- **Risco de não fazer**: desperdício de recursos do ERP em runs canceladas; runs patológicas sem teto de tempo.
- **Dependências**: idealmente posterior a performance-1 (se virar job, o desenho do deadline muda).

### [performance-5] Aplicar `heavyRouteLimiter` também no modo "job" (anti-duplo-clique no startJob)

- **Problema**
  > Hoje o endpoint do lote já tem `heavyRouteLimiter` (10/min por IP) — correto. Ao adotar performance-1 (modo assíncrono), o `POST /reconciliar-lote` vira "leve" (retorna 202 em ms) e pode tentar-se afrouxar o limiter. **Não afrouxar** — manter o limiter porque cada start dispara fan-out pesado no Conexos. Adicionalmente, derivar uma `Idempotency-Key` (mesmo padrão de `/permutas/ingestao` já presente em `routes/permutas.ts:140-147`) para coalescer duplo-cliques no startJob.

- **Melhoria Proposta**
  > No endpoint `POST /reconciliar-lote` (modo assíncrono) aceitar o header `Idempotency-Key`; se o mesmo `runId` já existe e está `running`, devolver o `runId` existente em vez de iniciar outro lote. Manter o `heavyRouteLimiter` 10/min mesmo no modo assíncrono.

- **Resultado Esperado**
  > Duplo-clique no botão "Executar todas" reaproveita a run existente — 0 fan-outs Conexos duplicados.

- **Tactic alvo**: Limit Event Response
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) — já há padrão no próprio repositório (Eleição usa Idempotency-Key)
- **Findings relacionados**: F-performance-1 (pré-requisito para o modo assíncrono ser robusto)
- **Métricas de sucesso**:
  - Runs duplicadas por duplo-clique no botão: indefinido → 0
- **Risco de não fazer**: 2 lotes simultâneos consumindo 2× sessão do Conexos sem necessidade.
- **Dependências**: depois de performance-1.

### [performance-6] Padrão de batch-paginated para `resultados[]` quando N for grande

- **Problema**
  > A resposta do lote agrega `resultados[]` (1 item por adto). Hoje N=26 e o payload é pequeno (~5KB). Em onboarding de novas filiais/importadores (roadmap declarado), N pode crescer a 200+ — payload de ~80KB e render pesado no toast/log do frontend.

- **Melhoria Proposta**
  > Quando o modo assíncrono (performance-1) estiver no ar, o `GET /reconciliar-lote/:runId` deve aceitar `?offset=&limit=` para `resultados[]`. O agregado (`totalSettled`, `totalErros`, `borderos[]`) continua small; só a lista detalhada é paginada.

- **Resultado Esperado**
  > Payload máximo de qualquer response do progresso ≤ 20KB independente de N.

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - Tamanho máximo do payload do progresso: O(N) → O(página)
- **Risco de não fazer**: somente vira problema com N > 100.
- **Dependências**: performance-1.

## 6. Notas do agente

- Decisão de escopo: foco total no delta (`ReconciliacaoLotePermutaService` + reuso de `ReconciliacaoPermutaService`); não revisitei tactics de cold start / bundle / DB pool porque a infra atual é Express+Render+Supabase (estado **atual** em `CLAUDE.md`) e a feature não introduz Lambda nem N+1 SQL — `exporGestao` é UMA leitura agregada antes do loop.
- Métricas que tentei coletar e falharam: latência real por chamada Conexos (precisa de produção; nenhum log de `duration_ms` no `ConexosClient`). Toda a banda 300ms–1500ms p95 é literatura defensável, não medição — declarada explicitamente em §2.
- Cross-QA: F-performance-1 e F-performance-2 são **a mesma raiz** da preocupação de Availability ("request longo em proxy com timeout") declarada no `_shared-metrics.md` — pedir ao qa-consolidator p/ unificar os cards de availability e performance-1 se a recomendação for a mesma (job assíncrono + poll). F-performance-5 (telemetria de duração) é cross com qa-fault-tolerance (sem `duration_ms` é difícil distinguir lentidão de erro).
- Score 4/10: a feature tem fundamentos sólidos (idempotência, gating, continue-on-error, exporGestao único) MAS a estratégia de execução (síncrona+sequencial em request HTTP) é exatamente a anti-pattern que a Bass tactic "Bound Execution Times" alerta. Score sobe a 7+ depois de performance-1; a 8+ com performance-2+3.
