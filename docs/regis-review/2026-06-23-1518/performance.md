---
qa: Performance
qa_slug: performance
run_id: 2026-06-23-1518
agent: qa-performance
generated_at: 2026-06-23T15:18:00-03:00
scope: backend
score: 5
findings_count: 7
cards_count: 7
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista admin | POST /permutas/adiantamentos/:docCod/reconciliar (1 adto × N alocações, write real) | `ReconciliacaoPermutaService.reconciliar` + `ConexosClient.{criarBordero,validar*,atualizar*,gravarBaixaPermuta}` + tabela `permuta_alocacao` (cresce sem retenção) | Produção em Render (Express puro hoje), Conexos `fin010` autenticado, write-enabled | (a) carregar N alocações do adto sem varrer o universo; (b) executar handshake de 5 chamadas por par de forma sequencial+ordenada (serial é intencional), mas dentro de um budget; (c) responder ao analista antes do timeout do load balancer (Render: 60s no caminho de proxy) | p95 latência por par adto↔invoice ≤ 8s (handshake feliz); p95 latência total da rota com N=5 alocações ≤ 45s; consultas DB sem full-scan (Σ rows lidos ≤ N + log) |

> **Resumo do risco** — a reconciliação é *interativa* (admin aguardando resposta) mas (a) lê toda a tabela `permuta_alocacao` para depois filtrar `where adto = X` em memória; (b) serializa 5 chamadas Conexos × N alocações sob o RetryExecutor (3 tentativas cada) sem timeout no HTTP de saída do Express; (c) cai dentro de um `heavyRouteLimiter` de 10/min por IP. O caminho FELIZ é aceitável; o caminho com 2-3 alocações + jitter de Conexos furam o tempo limite do balanceador.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Queries SQL para carregar alocações de UM adto na reconciliação | 1 SELECT sem WHERE (full scan) + filter JS | 1 SELECT WHERE adiantamento_doc_cod = $1 | ❌ | `ReconciliacaoPermutaService.ts:81-82`, `PermutaAlocacaoRepository.ts:89-98` |
| Linhas lidas por reconciliar (rows scanned) | O(total alocações ativas no tenant) | O(N alocações do adto) ~ 1–10 | ❌ | `PermutaAlocacaoRepository.ts:89-98` |
| Índices em `permuta_alocacao_execucao` (UNIQUE `idempotency_key`, `adiantamento_doc_cod`, `status`) | UNIQUE + 2 BTREEs presentes | mesmo | ✅ | `migrations/0015_permuta_alocacao_execucao.sql:35-41` |
| Índice de cobertura para `listAtivas` filtrado por adto | `idx_permuta_alocacao_adto` existe mas `listAtivas` ignora (não há `WHERE`) | método dedicado `listByAdiantamento` usando o índice | ❌ | `migrations/0014_permuta_alocacao.sql:31-34` vs `PermutaAlocacaoRepository.ts:89` |
| Chamadas Conexos por par adto↔invoice (passos 1-5) | 5 sequenciais (1 borderô compartilhado entre pares + 4 por par) | 5 sequenciais é OK (ordering obrigatório do fin010) | ✅ | `ReconciliacaoPermutaService.ts:129-247`, `ConexosClient.ts:999-1147` |
| Latência best-case por par (handshake feliz, sem retry) | ~5 × 1–3s ≈ **5–15s** | ≤ 8s p95 | ⚠️ | `ConexosClient.ts:80` (timeout=40000), handshake em `ReconciliacaoPermutaService.ts:178-247` |
| Latência worst-case por par (4 passos × 3 tentativas com timeout 40s + jitter 200ms × delay 500ms) | até **4 × 3 × 40s ≈ 480s = 8min** | bounded por algum budget global | ❌ | `ConexosClient.ts:402-408` (RetryExecutor: retries 2, delayMs 500, jitter 200), `services/conexos.ts:80` |
| Concorrência cross-allocation | 0 — serial obrigatória (mesmo borderô, baixas ordenadas) | mantém serial | ✅ (intencional) | `ReconciliacaoPermutaService.ts:96` (`for`-of) |
| Express HTTP server timeout | nenhum (default Node = 0/inf) | ≤ 60s alinhado com proxy do Render | ❌ | grep `server.timeout` em `src/backend/index.ts` → 0 hits |
| `heavyRouteLimiter` (rate) | 10 req/min/IP | adequado para fan-out admin | ✅ | `http/rateLimit.ts:20-26` |
| Retry behaviour entre passos 1-5 | Cada passo retenta isoladamente (cumulativo: até 15 HTTP/par) | retry ok no passo 1; passos 2-5 já no meio de uma transação lógica deveriam ter retry **muito conservador** ou OFF (evitar dupla-baixa) | ⚠️ | `ConexosClient.ts:402-408` aplicado em todos `criarBordero`/`validar*`/`gravarBaixaPermuta` |

> ⚠️ **Não medível localmente**: latências reais p50/p95 do `fin010/*` no Conexos. Requer instrumentação produção (CloudWatch / `LogService` + métricas p95 por endpoint) ou execução assistida no dev-tenant. Recomendação: emitir um log estruturado por passo com `durationMs` e plotar via dashboard.

## 3. Tactics — Cobertura no escopo Fase 3

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A (write side, não há sampling) | N/A | escopo write |
| Limit Event Response | `heavyRouteLimiter` 10/min protege o ERP de carga abusiva | ✅ | `rateLimit.ts:20-26`, `permutas.ts:362` |
| Prioritize Events | N/A — todas as reconciliações têm a mesma prioridade | N/A | — |
| Reduce Overhead | `listAtivas()` puxa o universo de alocações pra memória só pra filtrar 1 adto. Overhead direto: scan + filter | ❌ | `ReconciliacaoPermutaService.ts:81-82` |
| Bound Execution Times | NENHUM bound no caminho de escrita: timeout HTTP de saída 40s × 3 retries × 5 passos × N pares, sem deadline global e sem `server.timeout` no Express | ❌ | `services/conexos.ts:80`, `ConexosClient.ts:402-408` |
| Increase Resource Efficiency | Borderô criado uma vez por reconciliação (passo 1 fora do loop) — uma otimização correta | ✅ | `ReconciliacaoPermutaService.ts:130-133` |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | N/A — Render single-instance; escalar verticalmente não resolve o gargalo (ERP-bound) | N/A | — |
| Increase Concurrency | Sequencial por par é INTENCIONAL (ordering do borderô) — não há ganho em paralelizar | ✅ (intencional) | `ReconciliacaoPermutaService.ts:96` |
| Maintain Multiple Copies of Computations | N/A — write idempotente por `idempotency_key` evita dupla execução, não há cache de computação | N/A | `PermutaExecucaoRepository.ts:88-121` |
| Maintain Multiple Copies of Data | N/A — write side single-source-of-truth (ERP `fin010`) | N/A | — |
| Bound Queue Sizes | N/A — não há fila SQS (síncrono); a fila implícita é o `for`-of em memória, sem cap | ⚠️ | `ReconciliacaoPermutaService.ts:96-156` |
| Schedule Resources | Borderô compartilhado entre pares = scheduling do recurso "borCod" — único caso aplicado | ✅ | `ReconciliacaoPermutaService.ts:130-133` |

> **Tactics modernos relevantes**:
> - **Index discipline**: `permuta_alocacao_execucao` indexa `idempotency_key` (UNIQUE), `adiantamento_doc_cod`, `status` — adequado para `findByIdempotencyKey` (PK), `listByAdiantamento` (idx), `markError`/`markSettled` por PK. ✅
> - **Cache strategy**: nenhum cache aplicável no caminho de write (intencional — escrita é one-shot por par).

## 4. Findings (achados)

### F-performance-1: `listAtivas()` faz full scan + filter em memória para resolver 1 adiantamento

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:81-82`; `src/backend/domain/repository/permutas/PermutaAlocacaoRepository.ts:89-98`
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:81-82
  const todas = await this.alocacaoRepository.listAtivas();
  const alocacoes = todas.filter((a) => a.adiantamentoDocCod === adiantamentoDocCod);
  ```
  ```ts
  // PermutaAlocacaoRepository.ts:89-98 — selectMany SEM WHERE, SEM LIMIT
  public listAtivas = async (): Promise<AlocacaoRow[]> => {
      const rows = await this.databaseClient.selectMany(
          `SELECT ... FROM permuta_alocacao ORDER BY adiantamento_doc_cod, criado_em`,
      );
      ...
  };
  ```
  Existe um índice `idx_permuta_alocacao_adto` em `(adiantamento_doc_cod)` (`migrations/0014_permuta_alocacao.sql:31-32`) que esta query **não usa** porque não tem `WHERE`.
- **Impacto técnico**: a reconciliação cresce em latência O(total de alocações ativas do tenant) em vez de O(N do adto). Cada chamada move toda a tabela `permuta_alocacao` pela rede DB→Node, serializa, mapeia em objetos JS, e descarta tudo exceto N (~1–10) linhas. Em ~12 meses, com Σ de alocações na ordem de 10⁴–10⁵, o overhead é mensurável (centenas de ms só pra preparar o handshake).
- **Impacto de negócio**: latência percebida pelo analista cresce silenciosamente conforme o produto amadurece; a regressão NÃO é visível em testes (com poucas linhas). Quando se notar, está em produção.
- **Métrica de baseline**: 1 SELECT sem WHERE, lendo **todas** as linhas da tabela; alvo: 1 SELECT WHERE `adiantamento_doc_cod = $1` lendo ≤ 10 linhas via `idx_permuta_alocacao_adto`.

### F-performance-2: Caminho de escrita sem bound de execução (sem deadline global, sem Express timeout)

- **Severidade**: P0
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:96-156`; `src/backend/services/conexos.ts:80`; `src/backend/index.ts` (server.timeout ausente)
- **Evidência (objetiva)**:
  - Axios cliente Conexos: `timeout: 40000` por chamada (`services/conexos.ts:80`).
  - RetryExecutor: `retries: 2, delayMs: 500, jitterMs: 200` aplicado em CADA passo do handshake (`ConexosClient.ts:402-408`).
  - Express server: nenhum `server.timeout`/`setTimeout` configurado (grep retornou 0 hits em `src/backend/index.ts` e `http/`).
  - Worst-case por par adto↔invoice: `4 passos × 3 tentativas × 40s + 2 × (500ms + jitter)` ≈ **480s/par**. Para N=5 pares: até **40min** — muito além do timeout default do proxy do Render (Render Web Service: 60s para uma resposta HTTP).
- **Impacto técnico**: (a) o load balancer pode cortar a conexão TCP enquanto o serviço continua escrevendo no ERP — o cliente recebe 504/erro de socket e fica sem retorno autoritativo. (b) o `for`-of em memória continua executando borderôs / baixas reais no ERP após o cliente desistir; rollback parcial fica dependente da auditoria manual em `permuta_alocacao_execucao`. (c) o `heavyRouteLimiter` de 10/min/IP não protege o ERP de um único request lento que segura uma conexão por minutos.
- **Impacto de negócio**: risco direto de dupla-baixa (analista vê erro, refaz a operação enquanto a primeira ainda está em voo) e perda de confiança do controller — uma operação financeira "que ficou no ar" é incidente. SLA do analista (≤ 2min de resposta) impossível de garantir.
- **Métrica de baseline**: worst-case sem bound ≈ **480s/par × N pares**; nenhum timeout do Express; alvo: deadline global da rota ≤ **45s** (ou rota fica assíncrona — ver F-performance-7).

### F-performance-3: Retry agressivo dentro do handshake transacional (risco de dupla-baixa)

- **Severidade**: P1
- **Tactic violada**: Bound Execution Times / Limit Event Response
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1134-1147` (`gravarBaixaPermuta`) e demais writes (`criarBordero`, `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`)
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:402-408 — mesmo RetryExecutor aplicado em todos os writes
  this.retryExecutor = new RetryExecutor({
      retries: 2,
      delayMs: 500,
      shouldLog: true,
      jitterMs: 200,
  });
  ```
  ```ts
  // ConexosClient.ts:1134-1147 — gravarBaixaPermuta (passo 5) também envolve em retry
  return this.retryExecutor.execute(async () => {
      await this.legacy.ensureSid();
      return this.legacy.postGeneric<BaixaGravada>('fin010/baixas', payload, { filCod });
  });
  ```
- **Impacto técnico**: o passo 5 (`gravarBaixaPermuta`) é o write efetivo. Um timeout de 40s no cliente que o ERP processou com sucesso (resposta atrasada por carga) DISPARA um retry → dupla baixa. O `RetryExecutor` aplica a mesma política de read e write — não distingue idempotência. A idempotência local (`permuta_alocacao_execucao`) protege contra *re-invocações da rota*; não protege contra retry interno após sucesso silencioso no ERP.
- **Impacto de negócio**: dupla-baixa = inconsistência contábil que precisa de estorno manual no ERP, e o `permuta_alocacao_execucao` registra apenas o último `bxa_cod_seq` retornado.
- **Métrica de baseline**: 3 tentativas × 40s para `gravarBaixaPermuta`; alvo: 0 retries no passo 5 (ou retry só em falhas de transporte pré-resposta, ex: 5xx imediato/ECONNREFUSED).

### F-performance-4: `executarBaixa` re-busca via DB a cada par (`setRequestPayload` UPDATE 2x)

- **Severidade**: P3
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:113, 237`
- **Evidência (objetiva)**:
  No dry-run: 1 `beginExecution` + 1 `setRequestPayload` por par. No write real: 1 `beginExecution` + 1 `setRequestPayload` + 1 `markSettled` (ou `markError`) = **3 UPDATEs por par**, mais a auditoria sequencial. Não há batch para casos com N ≥ 5.
- **Impacto técnico**: round-trips DB amplificam a latência total. Em N=10 pares = 30 round-trips DB no caminho síncrono.
- **Impacto de negócio**: marginal — DB local é barato. Vira mensurável só com latência DB ≥ 50ms ou se a rota virar async em SQS.
- **Métrica de baseline**: 3 UPDATEs por par × N pares; alvo: 2 UPDATEs por par (consolidar `setRequestPayload` em `markSettled` quando a auditoria atômica permitir — write-ahead atual é correto, esse é só pruning de quem se importar).

### F-performance-5: `listAtivas()` exposto a outros chamadores (GestaoPermutasService) — risco de degradação solidária

- **Severidade**: P2
- **Tactic violada**: Reduce Overhead
- **Localização**: `src/backend/domain/service/permutas/GestaoPermutasService.ts:60` (mesmo método consumido)
- **Evidência (objetiva)**:
  ```
  grep -n "listAtivas" → GestaoPermutasService.ts:60: this.alocacaoRepository.listAtivas()
                       → ReconciliacaoPermutaService.ts:81: await this.alocacaoRepository.listAtivas()
  ```
- **Impacto técnico**: a Gestão precisa de tudo (justificável), mas a Reconciliação NÃO. Manter o nome `listAtivas` sem variante `listByAdiantamento` cria pressão para chamadores mal-escolherem o método (e o pattern já contagiou). Card F-performance-1 deve extrair o método dedicado SEM remover o atual.
- **Impacto de negócio**: dívida arquitetural; degradação solidária se um chamador adicionar `listAtivas` em um hot path.
- **Métrica de baseline**: 2 chamadores hoje; alvo: 1 chamador (`GestaoPermutasService`) consciente do scan; reconciliação usa um método dedicado.

### F-performance-6: Ausência de instrumentação de latência por passo do handshake

- **Severidade**: P2
- **Tactic violada**: Bound Execution Times (precondição: medir antes de bound)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:178-247`, `LogService` em `domain/service/LogService.ts`
- **Evidência (objetiva)**: nenhum `Date.now()`/`performance.now()` envolvendo as chamadas `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`. Logs informam apenas `dry-run` / `SETTLED` / `FALHOU` (sem `durationMs`).
- **Impacto técnico**: impossível dimensionar onde gastar o budget de F-performance-2 (qual passo é o mais lento?). A defesa contra timeout vira chute.
- **Impacto de negócio**: cego para regressão (Conexos pode degradar 2x sem nenhum alerta).
- **Métrica de baseline**: 0 métricas de duração emitidas hoje; alvo: 1 log estruturado por passo com `durationMs` e contador de retries.

### F-performance-7: Operação síncrona sem opção assíncrona — escala com N pode quebrar UX

- **Severidade**: P1
- **Tactic violada**: Bound Queue Sizes / Limit Event Response
- **Localização**: `src/backend/routes/permutas.ts:359-381` (rota síncrona); `ReconciliacaoPermutaService.ts:96-156` (laço serial em memória)
- **Evidência (objetiva)**: a rota POST `/reconciliar` é síncrona — o analista mantém a conexão HTTP aberta enquanto o handshake roda N vezes. Não há fila/job. Não há cap em N (uma alocação manual pode ter dezenas de pares).
- **Impacto técnico**: combinado com F-performance-2, qualquer N ≥ 3 fura o timeout do proxy. O analista vê erro mas a operação continua. Não há um "retomar de onde parou" do lado UX (precisa abrir outra tela e olhar `execucoes`).
- **Impacto de negócio**: experiência ruim para o admin em casos legítimos N:M cross-process (Fase 2 cria precisamente esses cenários). Limite implícito = "operações pequenas só".
- **Métrica de baseline**: rota síncrona, sem cap de N; alvo (curto-prazo): cap explícito de N por request + 202+job-id para N > limite (ver card performance-7).

## 5. Cards Kanban

### [performance-1] Substituir `listAtivas()` + filter por método dedicado `listByAdiantamento`

- **Problema**
  > A reconciliação carrega TODAS as alocações ativas do tenant para depois filtrar em JS por `adiantamentoDocCod`. O índice `idx_permuta_alocacao_adto` já existe (`migrations/0014:31-32`) mas não é usado. Em ~12 meses isso é overhead silencioso O(total alocações ativas) por reconciliar.

- **Melhoria Proposta**
  > Adicionar `listByAdiantamento(adiantamentoDocCod: string)` em `PermutaAlocacaoRepository` com `WHERE adiantamento_doc_cod = $1 ORDER BY criado_em`. Refatorar `ReconciliacaoPermutaService:81-82` para usá-lo. NÃO remover `listAtivas` (consumido por `GestaoPermutasService:60`); deixar como método explicitamente "panoramic". Tactic: Reduce Overhead.

- **Resultado Esperado**
  > Linhas lidas por reconciliar: **O(total ativas) → O(N do adto) (~1–10)**. Latência de preparação da reconciliação (DB step): de ~ scan + map (cresce no tempo) → ~ index lookup constante (≤ 20ms).

- **Tactic alvo**: Reduce Overhead
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-1, F-performance-5
- **Métricas de sucesso**:
  - Rows lidas por reconciliar: total ativas → ≤ 10
  - Latência DB-prep: depende-do-tamanho → ≤ 20ms p95
- **Risco de não fazer**: regressão linear silenciosa conforme o produto amadurece; descoberta só em incidente.
- **Dependências**: nenhuma

### [performance-2] Aplicar deadline global na rota `/reconciliar` (cap superior do tempo de resposta)

- **Problema**
  > Não há `server.timeout` no Express e o cliente Conexos tem timeout 40s × 3 retries × 5 passos × N pares — worst-case ~480s/par. O proxy Render corta a conexão TCP em ~60s, mas o serviço CONTINUA escrevendo no ERP. O analista pode refazer a operação e gerar dupla execução.

- **Melhoria Proposta**
  > (a) Configurar `server.setTimeout(60_000)` no `index.ts` para alinhar com o proxy; (b) acoplar um `AbortController` com deadline configurável (`PERMUTA_RECONCILIAR_DEADLINE_MS`, default 45000) ao `reconciliar`. Antes de cada par, checar `deadlineRemaining`; se < (TempoEstimadoUmPar) → encerrar laço, registrar `error` na `permuta_alocacao_execucao` dos pares remanescentes com motivo `deadline-exceeded`, retornar 207 (multi-status) com os pares já processados. Tactic: Bound Execution Times.

- **Resultado Esperado**
  > Worst-case do request: **480s × N → ≤ 45s**. Cliente nunca recebe socket-cut sem saber o estado final dos pares já tocados. Pares não tocados ficam `pending`/`error` auditável.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-performance-2, F-performance-7
- **Métricas de sucesso**:
  - Latência p95 da rota: ilimitada → ≤ 45s
  - % de requests cortados pelo proxy sem estado autoritativo: indeterminado → 0%
- **Risco de não fazer**: dupla-baixa em produção quando Conexos degradar, ou quando N ≥ 3.
- **Dependências**: cross-QA com Availability (F-availability-*) e Fault Tolerance (idempotência cliente↔Conexos).

### [performance-3] Desligar retry no passo 5 (`gravarBaixaPermuta`) ou restringir a falhas pré-resposta

- **Problema**
  > `RetryExecutor` aplicado em `gravarBaixaPermuta` aceita timeout(40s) como erro retentável, mas o ERP pode TER processado a baixa antes do socket fechar — o retry vira dupla-baixa. A idempotência local (`permuta_alocacao_execucao`) protege contra re-invocações da rota; não protege contra retry interno após sucesso silencioso do ERP.

- **Melhoria Proposta**
  > Criar variante `NoRetryExecutor` (ou flag `retries: 0`) para `gravarBaixaPermuta`. Alternativa mais sofisticada: retry só em erros de TRANSPORTE pré-resposta (`ECONNREFUSED`/`ENOTFOUND`/`ECONNRESET` antes do request começar — Axios `code` set, `response` ausente, `timeout=false`). Tactic: Limit Event Response.

- **Resultado Esperado**
  > Tentativas no passo 5: **3 → 1** (ou 1+pré-handshake guard). Janela de dupla-baixa: minutos → impossível por retry interno.

- **Tactic alvo**: Limit Event Response
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Retries observados em `gravarBaixaPermuta` (logs): atual → 0 em caminho feliz, e nunca após HTTP 5xx pós-resposta
  - Casos de dupla-baixa por retry interno: indeterminado → 0
- **Risco de não fazer**: estorno contábil manual em incidente; perda de confiança do controller.
- **Dependências**: cross-QA com Fault Tolerance (auditoria precisa registrar a tentativa "abortada por política").

### [performance-4] Instrumentar duração por passo do handshake (precondição de qualquer SLO)

- **Problema**
  > Não há medida de latência por passo (`validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`, `criarBordero`). Sem isso, dimensionar a deadline em performance-2 é chute, e regressões no Conexos passam despercebidas.

- **Melhoria Proposta**
  > Em `ReconciliacaoPermutaService.executarBaixa`, embrulhar cada chamada Conexos com `const t0 = performance.now(); ...; logService.info({ type: BUSINESS_INFO, message: 'permuta passo X', data: { passo, durationMs, retries } })`. Adicionar um `summary` no fim da reconciliação com `totalMs` e `perPairMs[]`. Tactic: Bound Execution Times (precondição).

- **Resultado Esperado**
  > Visibilidade p50/p95 por passo em produção. Permite calibrar a deadline da performance-2 baseado em dados reais.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - Métricas emitidas por passo: 0 → 5 (uma por passo + total)
  - Capacidade de detectar regressão > 30%: nenhuma → alerta no log structured
- **Risco de não fazer**: as deadlines viram folclore; SLO não tem base.
- **Dependências**: nenhuma (precondição do performance-2 ser bem calibrado, mas pode ir em paralelo).

### [performance-5] Cap explícito de N pares por reconciliação síncrona + caminho 202+job para N grande

- **Problema**
  > A rota é síncrona sem cap. Fase 2 (alocação N:M cross-process) habilita reconciliações com dezenas de pares; combinado com F-performance-2, qualquer N > ~3 fura o proxy. O analista vê erro mas o serviço continua escrevendo no ERP.

- **Melhoria Proposta**
  > (a) Validar no Zod do `reconciliarBodySchema` (ou no serviço) que `N = alocacoes.length ≤ MAX_SYNC_PAIRS` (env, default 5). Acima disso, responder 202 com `executionId` e mover o handshake para uma execução em background (worker/cron interno por enquanto; futuro: SQS Lambda no estado-alvo). O analista acompanha via `GET /execucoes`. Tactic: Limit Event Response + Bound Queue Sizes.

- **Resultado Esperado**
  > Rota síncrona limitada a casos onde p95 ≤ 45s é atingível. Casos grandes têm caminho explícito async com observabilidade da `permuta_alocacao_execucao`.

- **Tactic alvo**: Limit Event Response, Bound Queue Sizes
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — exige um worker mínimo (BullMQ/setTimeout-job ou polling existente)
- **Findings relacionados**: F-performance-7, F-performance-2
- **Métricas de sucesso**:
  - p95 do POST `/reconciliar` síncrono: ilimitado → ≤ 45s
  - % reconciliações que terminam dentro do request: depende-de-N → 100% para N ≤ 5
- **Risco de não fazer**: a feature funciona em demo (1 par) e quebra em uso real cross-process (N:M).
- **Dependências**: melhor com performance-2 (deadline) já em pé.

### [performance-6] Adicionar `LIMIT` aos `selectMany` do escopo (defesa em profundidade)

- **Problema**
  > `listAtivas` e `listByAdiantamento` (a criar) usam `selectMany` SEM `LIMIT`. Em quaisquer dos dois, uma regressão (dado órfão, bug de inserção em loop, esquecimento de delete) pode degradar a reconciliação rapidamente. Defesa em profundidade.

- **Melhoria Proposta**
  > `listByAdiantamento` (do card performance-1): adicionar `LIMIT 200` (a alocação N:M cross-process realista cabe muito abaixo disso — 200 é guard-rail, não business rule). `listAtivas`: adicionar `LIMIT 50000` e logar warning se atingir. Tactic: Bound Execution Times.

- **Resultado Esperado**
  > Worst-case rows lidas por chamada bounded. Comportamento degrada graciosamente em caso de dados inesperados (warning) em vez de OOM/timeout silencioso.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - SELECTs no escopo sem LIMIT: 1 → 0
  - Alertas de cap-hit em produção: instrumentado
- **Risco de não fazer**: regressão sem cap = degradação do tenant.
- **Dependências**: nasce junto com performance-1.

### [performance-7] Validar plano de execução do `idx_permuta_alocacao_execucao_adto` (índice composto opcional)

- **Problema**
  > `listByAdiantamento` (idempotency repo) ordena por `criado_em` mas o índice é só em `(adiantamento_doc_cod)`. Para N pequeno é OK (10 rows, sort em memória), mas é a única consulta da Fase 3 que cresce com retentativas. Para a UI de `/execucoes` em casos de adto muito retentado, o sort vira O(M log M).

- **Melhoria Proposta**
  > Avaliar trocar o índice para composto `(adiantamento_doc_cod, criado_em)`. Custo: 1 migration `0016`. Benefício: `ORDER BY criado_em` servido pelo índice. Tactic: Schedule Resources (index strategy).

- **Resultado Esperado**
  > `listByAdiantamento` da execucao: sort em memória → index scan ordenado. P95 ≤ 10ms até M = 10⁴.

- **Tactic alvo**: Schedule Resources
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-1 (irmão da indexação adto-lookup)
- **Métricas de sucesso**:
  - `EXPLAIN ANALYZE` da query: `Sort` step → ausente (Index Scan ordenado)
- **Risco de não fazer**: nulo a curto prazo; vira P2 se a auditoria de retentativas crescer.
- **Dependências**: nenhuma; pode ir junto com a próxima migration de qualquer modo.

## 6. Notas do agente

- Decisão de escopo: **a seriação dos passos 1→5 é correta** (a ordem é exigida pelo `fin010`) e **a seriação dos N pares também é correta** (1 borderô compartilhado, baixas registradas em ordem de criação). Não há card propondo paralelizar — isso seria errado.
- Cross-QA: F-performance-2 (deadline) e F-performance-3 (retry no write) tocam **Availability** (cliente desistir sem estado) e **Fault Tolerance** (idempotência cliente↔Conexos sem registro autoritativo do ERP); o `qa-consolidator` deve cruzar com os respectivos cards.
- Não medível localmente: latências reais de `fin010/*` (depende do tenant Conexos); a calibração da deadline da performance-2 deve ser feita após a instrumentação da performance-4. Ambos podem ir em paralelo.
- F-performance-4 e performance-6 são pequenos e baratos; bons candidatos para fazer junto com performance-1 na mesma PR.
