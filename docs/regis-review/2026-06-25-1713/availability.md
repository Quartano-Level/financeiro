---
qa: Availability
qa_slug: availability
run_id: 2026-06-25-1713
agent: qa-availability
generated_at: 2026-06-25T17:13:00-03:00
scope: backend,frontend
score: 6
findings_count: 5
cards_count: 5
---

# Availability — Regis-Review

Escopo desta seção: delta da feature `permutas-executar-automaticas` — botão **Executar todas** que dispara um único `POST /permutas/reconciliar-lote` para baixar N adiantamentos em LOTE no `fin010`. O `ReconciliacaoLotePermutaService` roda **síncrono** server-side, sequencial, continue-on-error, e devolve o agregado quando termina. O `ReconciliacaoPermutaService` por adto NÃO é alterado pelo PR — esta seção só olha a casca do lote (request longo + ausência de progresso + heavyRouteLimiter + handler do front).

## 1. Cenário Geral (Bass General Scenario aplicado ao botão "Executar todas")

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Executar todas as automáticas" (26 adtos hoje, tendência a crescer com a base de elegíveis diários) | `POST /permutas/reconciliar-lote` executa N×~5 chamadas ao Conexos (`criarBordero` → 4 passos de baixa) em sequência, sem stream de progresso | `ReconciliacaoLotePermutaService.reconciliarLote` (`src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:65-152`) + handler do front `executarLote` (`src/frontend/app/permutas/page.tsx:751-776`) sob proxy do Render | Janela diária de execução do analista, escrita financeira real (`CONEXOS_WRITE_ENABLED=true` em prod) | Backend itera continue-on-error (a falha de 1 adto não interrompe os demais — `ReconciliacaoLotePermutaService.ts:115-127`); idempotência write-ahead (`ReconciliacaoPermutaService.ts:145-167`) permite re-firing do lote (já-settled vira `skipped`); o front exibe spinner em `executandoLote` enquanto aguarda 1 resposta única | 0 baixas duplicadas em retry; ≥ 90% dos adtos processados em um único lote; latência observável p99 ≤ `min(timeout do Render, 15min)` |
| Conexos ERP fica lento ou pendura UMA chamada do handshake no meio do lote | Sem timeout por-item (`Bound Execution Times`): a request inteira fica refém do timeout do client axios (`services/conexos.ts:81` → 40s por chamada) — N chamadas × 40s no pior caso | `ReconciliacaoLotePermutaService.reconciliarLote` (laço `for` sem cap de tempo agregado), `ConexosClient` legacy (`timeout: 40000`) | Pico ERP (`MAX_SESSIONS`/lentidão upstream) | A request mantém recursos do Express (1 socket + memória) por tempo arbitrário; o proxy do Render corta o socket antes do backend terminar; o lote DENTRO do Node continua até o fim — o front fica órfão da resposta | 0 timeouts de proxy em lote ≤ 50 adtos; tempo total da request ≤ janela de proxy do Render (a confirmar — Render free tier corta 100s em planos `starter` HTTP) |
| Network/proxy corta o socket cliente mid-batch (Render 524 / browser timeout / aba fechada) | O front recebe `Error: API <status>` ou simplesmente fica preso no spinner até o usuário cancelar | `executarLote` (`page.tsx:751-776`) — sem `AbortController`, sem stream, sem job-id para reattach | Operação normal | Toast de erro; o usuário **retry o botão** → o lote re-roda; pares já-settled são pulados pelo `findByIdempotencyKey` (`ReconciliacaoPermutaService.ts:150-160`) — sem dupla baixa, MAS o usuário não sabe quantos foram concluídos antes do corte | Recuperação semântica garantida (idempotência); recuperação informacional ausente (sem MTTR observável da retomada) |

> Stimulus relevante NÃO coberto pelo PR (já mitigado em runs anteriores): queda do Conexos NO MEIO do handshake de 5 chamadas por adto — endereçado pelo `setBorCod` write-ahead + `markError` no `ReconciliacaoPermutaService` (não alterado pelo lote, herdado). O lote NÃO degrada essas garantias por par; degrada a observabilidade do CONJUNTO.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Continue-on-error no laço do lote (1 adto falha não interrompe os demais) | Presente — `try/catch` por adto, `totalErros++` e segue (linhas 91-127) | Presente | ✅ | `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:91-127` |
| Idempotência write-ahead por par adto↔invoice (retry seguro do lote) | Presente — chave inclui `atualizadoEm` da alocação; settled + borderô vivo ⇒ `skipped` | Presente | ✅ | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:141-167` |
| Bound Execution Time POR ITEM dentro do lote (cap de tempo por adto) | **Ausente** — só há timeout do axios legacy por CHAMADA HTTP (40s), não por adto/lote. Pior caso de 1 adto: ~5×40s=200s; 26 adtos travados: ~86min antes de exaurir | Cap por adto ≤ 60s; cap agregado ≤ janela do proxy | ❌ | `src/backend/services/conexos.ts:81` (único timeout existente); `ReconciliacaoLotePermutaService.ts:91-127` (sem `Promise.race` / `AbortSignal`) |
| Bound Execution Time TOTAL da request (cap agregado) | **Ausente** — `asyncHandler` chama o serviço sem `setTimeout`/`AbortController`; `express` server sem `server.setTimeout` configurado | Cap agregado < janela de proxy do Render | ❌ | `src/backend/http/asyncHandler.ts` (sem timeout); `src/backend/index.ts:99-102` (sem `server.setTimeout`) |
| Janela máxima de proxy do Render para HTTP síncrono (cliente espera resposta) | **Não medível localmente** — depende do plano Render; documentação indica cortes em ~100–300s em planos de baixa tier para conexões IDLE; um POST de longa duração com TCP ativo costuma cair em ~5–10min. Sem fonte verificada NESTE repositório | ≤ tempo médio do lote × 2 | ⚠️ | Inferência; não há `render.yaml` declarando `httpTimeout`. Recomendação: medir via 1 run real cronometrada em prod e olhar log Render |
| Streaming de progresso (SSE / chunked) na rota de lote | **Ausente** — `POST /permutas/reconciliar-lote` devolve JSON único no fim. Já existe `SseProgressReporter` no repo (`src/backend/domain/libs/progress/SseProgressReporter.ts`) — NÃO usado aqui | SSE com `event: progress` por adto | ❌ | `src/backend/routes/permutas.ts:426-447`; reporter pronto e ocioso: `src/backend/domain/libs/progress/SseProgressReporter.ts:24-60` |
| Idempotency-Key na rota de lote (deduplicação de duplo-clique no front) | **Ausente** no lote (mesmo padrão JÁ aplicado em `POST /permutas/eleicao` linhas 138-147). O lote depende SÓ da idempotência por-par dentro do serviço | Idempotency-Key opcional no header (caminho rápido) + idempotência por-par (caminho fundo) | ⚠️ | `src/backend/routes/permutas.ts:426-447` (não lê header `Idempotency-Key`); comparar com `routes/permutas.ts:138-147` (eleição) |
| AbortController no `fetch` do front | **Ausente** — `reconciliarLoteAutomaticas` faz `fetch` sem `signal`. Aba fechada / cancelamento do usuário não cancela a request; reload da página não cancela o trabalho no backend | `AbortController` exposto via botão "Cancelar lote" no diálogo | ❌ | `src/frontend/lib/api.ts:276-296`; `src/frontend/app/permutas/page.tsx:751-776` |
| heavyRouteLimiter (10 req/min/IP) na rota de lote | Presente — `routes/permutas.ts:428-430` | Presente | ✅ | `src/backend/routes/permutas.ts:428-430`; limites em `src/backend/http/rateLimit.ts:20-26` |
| RetryExecutor (2 retries, 500ms, jitter 200ms) por chamada Conexos | Presente em todos os métodos de leitura. ESCRITAS (`criarBordero`, `gravarBaixaPermuta`) **deliberadamente** sem retry para evitar dupla baixa em timeout-pós-sucesso (Regis F-fault-tolerance-1 anterior) | Mantido | ✅ | `src/backend/domain/client/ConexosClient.ts:418-435, 1077-1078, 1473-1474` |
| Health check exposto ao proxy | Presente — `GET /health` retorna `{status,version}` (linha 65 do `index.ts`); `render.yaml:22` aponta `healthCheckPath: /health` | Presente | ✅ | `src/backend/index.ts:64-65`; `render.yaml:22` |
| Logging agregado do lote (Detect Faults — Monitor) | Presente — 1 `LogService.info` ao fim do lote com `totalCasos/totalSettled/totalErros/borderos.size/dryRun` | Presente | ✅ | `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:129-141` |
| Logging granular **durante** o lote (heartbeat de progresso) | **Ausente** — só há log por par dentro do `ReconciliacaoPermutaService` (`SETTLED`/`FALHOU`). Não há um log agregado por adto no nível do lote permitindo correlacionar "lote X parou na linha N" | 1 linha estruturada por adto no nível do lote | ⚠️ | `ReconciliacaoLotePermutaService.ts:108-126` (resultado push, sem log por iteração) |
| Persistência de resultado do lote (re-attach por job-id após queda de socket) | **Ausente** — o agregado vive em memória da request; se a request morrer, o front perde o relatório agregado. Os pares individuais sobrevivem no `permuta_alocacao_execucao` (settled/error), mas o "qual lote agrupou" não é gravado | Tabela `permuta_lote_run` com `id, requestedBy, startedAt, finishedAt, summaryJson` para re-attach | ❌ | Sem migration de `permuta_lote_run`; o serviço só retorna o `ReconciliarLoteResult` |
| Concorrência configurável (limitar fan-out ao Conexos durante o lote) | Hard-coded sequencial (`for` linear). Suficiente p/ 26 casos hoje; vira gargalo a partir de ~50 casos quando o tempo total > janela do proxy | Sequencial ou paralelismo bounded por `Semaphore` (já existe em `src/backend/domain/libs/concurrency/`) | ⚠️ | `ReconciliacaoLotePermutaService.ts:91-127`; bounded primitive ociosa em `src/backend/domain/libs/concurrency/` |

> ⚠️ **Não medível localmente**: duração real (p50/p95/p99) do lote em prod (26 adtos × 5 chamadas ERP). Requer cronometragem de 1 run real em prod (ou query CloudWatch-equivalente no log do Render filtrando o `[REQ]…/permutas/reconciliar-lote` correspondente ao `[RES]` no `src/backend/index.ts:39-58`). Recomendação: instrumentar `LogService.info` com `durationMs` no fim do lote (`ReconciliacaoLotePermutaService.ts:129-141`) — campo já implícito mas não emitido — e listar o p95 da última semana.

> ⚠️ **Não medível localmente**: janela exata de corte do proxy Render para conexões HTTP de longa duração. Requer reproduzir 1 lote sintético longo em prod e ler o log de origem do 502/504. Sem este dado, o cap agregado da request (`Bound Execution Times`) é um chute.

## 3. Tactics — Cobertura no PR `permutas-executar-automaticas`

### Detect Faults

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | N/A no caminho de lote (front só "pinga" o backend via o próprio POST) | N/A | — |
| Heartbeat | **Ausente** — sem progress event durante o lote; o front só descobre que algo aconteceu no `await` final | ❌ | `page.tsx:751-776` (sem `onProgress` / EventSource) |
| Monitor | 1 log estruturado ao FIM do lote (totais) + logs por-par no serviço por-adto | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:129-141`; `ReconciliacaoPermutaService.ts:345-349, 203-207` |
| Timestamp | `permuta_alocacao_execucao.criado_em/atualizado_em` permite reconstruir o lote ex-post — mas o lote NÃO grava o próprio `lote_id`, então a correlação "qual lote" é por janela de tempo (frágil) | ⚠️ parcial | `migrations/00xx_permuta_alocacao_execucao.sql` (tabela existe); ausente `lote_id` na escrita |
| Sanity Checking | `statusDoAdto` valida invariante (sem settled e sem erro ⇒ `skipped` por idempotência) | ✅ | `ReconciliacaoLotePermutaService.ts:155-165` |
| Condition Monitoring | **Ausente** — sem leitura de `process.cpuUsage()`/`memoryUsage()` ou contagem de chamadas/min no laço; sem detecção de "Conexos retornando >X% erros, abortar lote" | ❌ | `ReconciliacaoLotePermutaService.ts:91-127` |
| Voting | N/A (single Conexos tenant) | N/A | — |
| Exception Detection | `try/catch` por adto captura `Error` lançado antes/durante a `reconciliar`; `ConexosError` normalizado upstream | ✅ | `ReconciliacaoLotePermutaService.ts:115-126` |
| Self-Test | N/A no caminho de lote | N/A | — |

### Recover from Faults — Preparation & Repair

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A (single backend / single Conexos tenant) | N/A | — |
| Passive Redundancy | Idempotência write-ahead (`permuta_alocacao_execucao`) atua como passive copy do estado de baixa — o front pode re-firing o lote sem efeito colateral | ✅ | `ReconciliacaoPermutaService.ts:141-167` |
| Spare | N/A | N/A | — |
| Exception Handling | `try/catch` por adto no lote; `try/catch` por chamada ERP no serviço por-adto (`markError`); `errorMiddleware` global no Express | ✅ | `ReconciliacaoLotePermutaService.ts:115-126`; `ReconciliacaoPermutaService.ts:196-215`; `src/backend/http/errorMiddleware.ts` |
| Rollback | Cada par adto↔invoice é atômico no ERP (1 baixa); rollback INTRA-borderô não é possível (decisão de produto: borderô fica `EM CADASTRO` aguardando aprovação manual, que age como rollback discricionário) | ✅ | comentário do route `permutas.ts:422-425`; semântica do fin010 |
| Software Upgrade | N/A no escopo do PR | N/A | — |
| Retry | RetryExecutor em LEITURAS do Conexos; ESCRITAS sem retry POR DESIGN (anti-dupla baixa, Regis anterior); retry de LOTE inteiro é seguro (idempotência write-ahead permite re-fire) | ✅ | `ConexosClient.ts:418-435, 1077-1078, 1473-1474`; `ReconciliacaoPermutaService.ts:145-167` |
| Ignore Faulty Behavior | Adto que lança no `reconciliar` é registrado como `error` e o lote segue (linhas 115-127) | ✅ | `ReconciliacaoLotePermutaService.ts:115-127` |
| Degradation | Sem mecanismo explícito de degradação (ex.: "Conexos lento → executa só 5 adtos do lote e devolve, com cursor para continuação"); o lote vai do início ao fim | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:91-127` |
| Reconfiguration | N/A (sem failover automático) | N/A | — |

### Recover from Faults — Reintroduction

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | N/A no caminho de lote (`dryRunOverride` poderia ser usado como shadow, mas o front sempre envia `dryRun: false`) | N/A | `page.tsx:755`; gate `CONEXOS_DRY_RUN` no serviço por-adto |
| State Resynchronization | Re-firing do lote re-sincroniza: pares já `settled` viram `skipped`; pares em `error` são re-tentados | ✅ | `ReconciliacaoPermutaService.ts:141-167` |
| Escalating Restart | N/A (request única; sem hierarquia de processos para reiniciar) | N/A | — |
| Non-Stop Forwarding | N/A (Express stateless) | N/A | — |

### Prevent Faults

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | **Ausente** — não há kill-switch específico do lote (apenas o gate global `CONEXOS_WRITE_ENABLED`); se o lote começar a falhar em cascata, o único freio é o operador desabilitar a escrita inteira no Render dashboard | ⚠️ parcial | `render.yaml:35-40`; sem flag `PERMUTAS_LOTE_ENABLED` |
| Transactions | Cada par é uma "mini-transação" no fin010; o LOTE NÃO é transacional (atomicidade desejada está no par, não no lote — decisão correta de produto) | ✅ | semântica do fin010 + `ReconciliacaoPermutaService.executarBaixa` |
| Predictive Model | N/A | N/A | — |
| Exception Prevention | Pré-validação (`statusDoAdto`, filtro de `processamentoStatus === 'processado'`, dedup por `docCod`) evita execução redundante | ✅ | `ReconciliacaoLotePermutaService.ts:73-82, 155-165` |
| Increase Competence Set | Continue-on-error amplia o conjunto de cenários toleráveis (um adto sem alocação não derruba os 25 demais) | ✅ | `ReconciliacaoLotePermutaService.ts:115-126` |

## 4. Findings (achados)

### F-availability-1: Request síncrona de longa duração sem cap agregado nem streaming de progresso

- **Severidade**: P1 (alto — degrada UX e Availability observável em prod; risco de proxy cortar a request)
- **Tactic violada**: `Bound Execution Times` (Prevent Faults) + `Heartbeat` (Detect Faults)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:91-127` (laço sem cap); `src/backend/routes/permutas.ts:426-447` (rota devolve 1 JSON único); `src/frontend/app/permutas/page.tsx:751-776` (front aguarda 1 await sem AbortController nem progress)
- **Evidência (objetiva)**:
  ```
  // ReconciliacaoLotePermutaService.ts (laço sem cap):
  for (const docCod of ordem) {
      try {
          const r = await this.reconciliacaoService.reconciliar({...});  // ~5 chamadas ERP por iteração
          ...
      } catch (err) { ... continue-on-error ... }
  }
  // services/conexos.ts:81 — único timeout existente é POR chamada HTTP:
  this.client = axios.create({ ..., timeout: 40000 });
  // src/backend/index.ts:99-102 — server sem setTimeout, sem requestTimeout
  // src/backend/http/asyncHandler.ts — sem Promise.race / AbortController
  ```
- **Impacto técnico**: para N adtos, a janela teórica de request é N × ~5 × 40s = 200s × N no pior caso. Para os 26 adtos atuais ⇒ até ~86min antes do cliente desistir. O proxy do Render cortará bem antes (janela presumida 5–10min, não medível neste repo). O laço continua no Node mesmo após o socket cortado (nenhum `req.on('close')` propagado para o serviço); o cliente perde o agregado da resposta.
- **Impacto de negócio**: o analista vê "Falha ao executar o lote" e não sabe quantas baixas foram concluídas; tem que abrir a aba Borderôs para descobrir. Em horário de pico do Conexos (lote ficaria mais perto do teto), o lote de fim-de-mês não fecharia em uma única tentativa.
- **Métrica de baseline**: 0 caps configurados (`Bound Execution Times` ausente em 3 camadas: por-item, por-request, server-wide). Duração real do lote em prod = NÃO medível localmente (ver `## 2`).

### F-availability-2: Sem Idempotency-Key no header do lote (Exception Prevention — duplo-clique)

- **Severidade**: P2 (médio — semanticamente seguro pela idempotência por-par, mas duplica fan-out ao Conexos sob duplo-clique e desperdiça `heavyRouteLimiter` quota)
- **Tactic violada**: `Exception Prevention` (Prevent Faults)
- **Localização**: `src/backend/routes/permutas.ts:426-447` (não lê `Idempotency-Key`); contrastar com `POST /permutas/eleicao` em `permutas.ts:138-147` (já implementa)
- **Evidência (objetiva)**:
  ```
  // permutas.ts:426-447 — lote SEM Idempotency-Key:
  router.post('/reconciliar-lote', requireRole('admin'), heavyRouteLimiter,
      asyncHandler(async (req, res) => {
          ...
          const result = await service.reconciliarLote({ ... });
          res.json(result);
      }));
  // permutas.ts:138-147 — eleição JÁ tem o padrão:
  const rawKey = req.header('Idempotency-Key');
  const idempotencyKey = typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : undefined;
  ```
- **Impacto técnico**: duplo-clique no botão (front desativa após `setExecutandoLote(true)`, mas o estado SÓ entra no clique → click em flight é possível antes do React aplicar o disabled) dispara 2 lotes paralelos. A idempotência por-par evita dupla baixa, MAS ambos os lotes rebatem o Conexos N vezes (fan-out 2×) e consomem 2/10 da quota do `heavyRouteLimiter` do minuto.
- **Impacto de negócio**: sob a fila pequena (26), invisível; sob 100+ adtos no fim do mês, duplo-clique inadvertido pode estourar `MAX_SESSIONS` no Conexos e degradar TODAS as operações financeiras concorrentes.
- **Métrica de baseline**: 0 leituras de `Idempotency-Key` na rota de lote (`grep "Idempotency-Key" routes/permutas.ts` → 1 ocorrência, na rota de eleição).

### F-availability-3: Ausência de re-attach por job-id após queda de socket

- **Severidade**: P2 (médio — não impede o trabalho, apenas o relatório agregado é perdido)
- **Tactic violada**: `State Resynchronization` (Recover — Reintroduction); `Timestamp` (Detect Faults)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:24-152` (sem `lote_id` persistido); ausência de migration `permuta_lote_run`
- **Evidência (objetiva)**:
  ```
  // ReconciliacaoLotePermutaService.reconciliarLote — agregado vive na request:
  return { dryRun, writeEnabled, totalCasos, totalSettled, totalErros, borderos, resultados };
  // permuta_alocacao_execucao (por-par) tem timestamp, mas NÃO tem coluna lote_id
  ```
- **Impacto técnico**: se a request morre (proxy / aba fechada / OOM), os pares persistidos sobrevivem mas o agregado "lote X executado às 14:32 por user Y, 22/26 OK" é perdido. Re-firing rebusca a gestão e refaz o filtro, então pode produzir um lote ligeiramente diferente em composição (concorrência com outra ingestão).
- **Impacto de negócio**: auditoria "qual lote executou estes 4 borderôs juntos?" é imprecisa — só dá para responder por janela de timestamp. Para um sistema de escrita financeira, é tolerável agora (volume baixo) mas degrada a explicabilidade conforme o volume cresce.
- **Métrica de baseline**: 0 tabelas/colunas de `lote_id` na trilha (`find src/backend/migrations -name "*permuta_lote*"` → vazio).

### F-availability-4: Sem AbortController no `fetch` do front, sem botão de cancelamento

- **Severidade**: P2 (médio — combinado com F-availability-1, o operador não tem como abortar uma run que travou)
- **Tactic violada**: `Removal from Service` (Prevent Faults)
- **Localização**: `src/frontend/lib/api.ts:276-296`; `src/frontend/app/permutas/page.tsx:751-776, 2152-2164`
- **Evidência (objetiva)**:
  ```
  // api.ts:279 — fetch sem signal:
  const res = await fetch(`${API}/permutas/reconciliar-lote`, {
      method: 'POST',
      headers: await withAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ ... }),
  })
  // page.tsx:751-776 — handler sem AbortController; diálogo sem botão "Cancelar lote" após início
  ```
- **Impacto técnico**: usuário não consegue cancelar a request em execução. Fechar a aba/recarregar a página NÃO cancela o trabalho no backend (sem `req.on('close')` propagado para o serviço). Em caso de "Conexos travado", a única ação do operador é esperar o timeout do browser (~5min default).
- **Impacto de negócio**: ferramenta percebida como "frágil" se o analista clicar por engano com filtro errado ou volume errado — ele não tem como pausar.
- **Métrica de baseline**: 0 ocorrências de `AbortController` ou `signal:` em `src/frontend/lib/api.ts` no caminho do lote.

### F-availability-5: `SseProgressReporter` existente e ocioso (oportunidade desperdiçada)

- **Severidade**: P2 (médio — primitive já no repo, custo de adoção é baixo)
- **Tactic violada**: `Heartbeat` (Detect Faults); `Degradation` (Recover — Preparation)
- **Localização**: `src/backend/domain/libs/progress/SseProgressReporter.ts:1-61` (implementado e testado); `src/backend/routes/permutas.ts:426-447` (rota POST JSON que poderia ter um irmão `GET /reconciliar-lote/stream` SSE)
- **Evidência (objetiva)**:
  ```
  // SseProgressReporter.ts pronto, com writeResult/writeError/writeEnd:
  public emit = (event: ProgressEvent): void => { ... write('progress', event) }
  public writeResult = <T>(payload: T): void => { ... write('result', payload) }
  // grep "SseProgressReporter" routes/ → 0 ocorrências
  ```
- **Impacto técnico**: o time já investiu na primitive de streaming (61 LOC + 79 LOC de teste) mas a feature mais cara em tempo síncrono não a usa. SSE resolveria de uma só vez F-availability-1 (heartbeat mantém o socket vivo no proxy → menos chance de corte) e parte de F-availability-3 (cada par emitido é gravável no front em real-time, sem depender do agregado final).
- **Impacto de negócio**: experiência percebida muito superior (barra de progresso "12/26") com baixo investimento (o serviço aceita um `ProgressReporter` opcional via injeção de constructor).
- **Métrica de baseline**: 0 rotas usando `SseProgressReporter` (`grep -rn "SseProgressReporter" src/backend/routes` → 0 ocorrências).

## 5. Cards Kanban

### [availability-1] Capar tempo da request de lote (Bound Execution Times) + streaming de progresso via SSE

- **Problema**
  > A rota `POST /permutas/reconciliar-lote` executa N×~5 chamadas Conexos síncronas, sem cap de tempo agregado nem `Bound Execution Times` por item — o pior caso são 200s por adto. O proxy do Render corta o socket antes do backend terminar (janela não documentada localmente; estimativa 5–10min), e o front fica órfão da resposta. Sem progresso visível, o analista não sabe quantos adtos foram concluídos e re-clica, dobrando o fan-out ao Conexos.

- **Melhoria Proposta**
  > (1) Adicionar `AbortController` no handler com `setTimeout` baseado em `LOTE_DEADLINE_MS` (env, default 240_000) — quando estourar, parar de iterar, gravar resumo parcial e devolver `{ truncated: true, ... }`. (2) Adicionar uma rota irmã `GET /permutas/reconciliar-lote/stream` que use o `SseProgressReporter` (`src/backend/domain/libs/progress/SseProgressReporter.ts`) já implementado: emitir `event: progress` por adto, `event: result` no fim com o agregado, `event: end` para fechar. O front consome via `EventSource`. Heartbeat de progresso mantém o socket vivo no proxy.

- **Resultado Esperado**
  > Lote de 26 adtos termina em ≤ deadline declarado (default 4min) OU devolve resumo parcial com `truncated=true`. Front mostra barra "X/N processados" em real-time. Proxy não corta o socket. Métrica: 0 `502/504` em lotes de até 50 adtos.

- **Tactic alvo**: `Bound Execution Times` + `Heartbeat` + `Degradation`
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — SSE reporter pronto; handler/route + reattach do front são o trabalho real
- **Findings relacionados**: F-availability-1, F-availability-5
- **Métricas de sucesso**:
  - Cap agregado da request: ausente → ≤ 240s (configurável)
  - Eventos de progresso por adto: 0/lote → 1/adto
  - Taxa de timeout do proxy em lote ≥ 30 adtos: não medível hoje → 0%
- **Risco de não fazer**: à medida que o volume cresce (Permutas atinge regime estável em 50–100 adtos/dia projetado), a feature vira inutilizável em prod no Render — analista vai voltar a clicar adto-a-adto.
- **Dependências**: medir 1 run real cronometrada em prod para fixar o `LOTE_DEADLINE_MS` (sem isso, é chute).

### [availability-2] Suportar Idempotency-Key na rota de lote (espelho do `/eleicao`)

- **Problema**
  > `POST /permutas/reconciliar-lote` não lê o header `Idempotency-Key`, embora o padrão JÁ exista no repositório em `POST /permutas/eleicao` (`routes/permutas.ts:138-147`). Duplo-clique no botão "Executar todas" dispara dois lotes paralelos. A idempotência por-par dentro do serviço evita dupla baixa, mas ambos os lotes fazem N chamadas Conexos cada um e consomem 2/10 da quota do `heavyRouteLimiter` por minuto.

- **Melhoria Proposta**
  > Replicar em `POST /permutas/reconciliar-lote` o trecho idêntico ao de `/eleicao`: ler header, normalizar, passar para o serviço como `idempotencyKey?: string`. Manter um cache `Map<key, Promise<ReconciliarLoteResult>>` em memória do `ReconciliacaoLotePermutaService` (escopo singleton tsyringe) que reaproveite a Promise em vôo da mesma key. Frontend envia `Idempotency-Key: crypto.randomUUID()` por clique.

- **Resultado Esperado**
  > Duplo-clique não dobra fan-out Conexos. Métrica observável: chamadas Conexos por clique = N (não 2N).

- **Tactic alvo**: `Exception Prevention`
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-2
- **Métricas de sucesso**:
  - Leituras de `Idempotency-Key` em `routes/permutas.ts` reconciliar-lote: 0 → 1
  - Fan-out Conexos sob duplo-clique: 2N → N
- **Risco de não fazer**: invisível hoje (26 adtos, 1 analista); vira P1 quando 3+ analistas operarem em paralelo no fim do mês.
- **Dependências**: nenhuma.

### [availability-3] Persistir `permuta_lote_run` com `lote_id` na trilha (State Resynchronization)

- **Problema**
  > O `ReconciliacaoLotePermutaService` devolve o agregado in-memory; nem o `lote_id` nem o resumo são gravados. Se a request morre (proxy/aba fechada/OOM), os pares individuais sobrevivem em `permuta_alocacao_execucao` mas o conjunto "lote X executado às 14:32 por user Y" é irrecuperável — auditoria só responde por janela de tempo. Re-firing pode rebuscar a gestão e produzir um lote diferente em composição.

- **Melhoria Proposta**
  > Nova migration `permuta_lote_run` (`id uuid pk, requested_by text, requested_at timestamptz, finished_at timestamptz nullable, summary_json jsonb nullable, status text check in 'running','done','error'`). `ReconciliacaoLotePermutaService.reconciliarLote` insere `running` no início, faz `update finished_at, summary_json, status='done'` no fim. Adicionar coluna `lote_id` em `permuta_alocacao_execucao` (nullable, preenchida pelo lote; null em chamadas avulsas). Novo `GET /permutas/reconciliar-lote/:id` para re-attach.

- **Resultado Esperado**
  > Auditoria "qual lote agrupou estes 4 borderôs?" responde por `lote_id` (1 query). Re-attach após queda de socket: front pega o último `running` do user no header da página e oferece "Continuar visualizando o lote em andamento".

- **Tactic alvo**: `State Resynchronization` + `Timestamp`
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) — migration + serviço + endpoint + UI de re-attach
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - Auditoria "lote → borderôs": impossível → 1 query SQL
  - Re-attach: impossível → suportado em ≤ 1 request
- **Risco de não fazer**: explicabilidade frágil hoje, problema real quando o volume passar de 50 lotes/mês com 3+ analistas.
- **Dependências**: combina bem com [availability-1] (o `lote_id` é a chave natural do SSE stream).

### [availability-4] `AbortController` no front + botão "Cancelar lote" no diálogo

- **Problema**
  > `reconciliarLoteAutomaticas` em `src/frontend/lib/api.ts:276-296` faz `fetch` sem `signal`, e o diálogo de confirmação não oferece "Cancelar" depois que o lote inicia. Fechar a aba/recarregar NÃO cancela o trabalho no backend. Em caso de "Conexos travado", a única ação do operador é esperar o timeout do browser (~5min default).

- **Melhoria Proposta**
  > Adicionar `signal?: AbortSignal` no `reconciliarLoteAutomaticas`. No `executarLote` (`page.tsx:751-776`), criar um `AbortController` por execução, propagar para o fetch, e expor um botão "Cancelar lote" enquanto `executandoLote=true`. Backend: adicionar `req.on('close', () => abortFlag = true)` no handler e checar `abortFlag` no início de cada iteração do laço (`ReconciliacaoLotePermutaService.ts:91`) — termina o lote no próximo limite de adto (não corta a baixa em curso, para preservar atomicidade por par).

- **Resultado Esperado**
  > Operador pode cancelar uma run que travou em ≤ 1 clique. Métrica: tempo para "abortar lote travado" do operador = ~Inf → ≤ 5s.

- **Tactic alvo**: `Removal from Service`
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - `AbortController` em `lib/api.ts` reconciliar-lote: 0 → 1
  - Botão "Cancelar lote" disponível no diálogo durante execução: ausente → presente
- **Risco de não fazer**: ferramenta percebida como "frágil" — analista evita usar com filtro errado por medo de não conseguir abortar.
- **Dependências**: combina com [availability-1] (no SSE, o `EventSource.close()` é o canal natural de aborto).

### [availability-5] Heartbeat estruturado por-iteração no log do lote (Monitor melhorado)

- **Problema**
  > O lote emite 1 log estruturado no FIM (`ReconciliacaoLotePermutaService.ts:129-141`) e logs por-par dentro do serviço por-adto. Não há log por-iteração no nível do lote — quando uma run trava ou é cortada pelo proxy, não dá para responder "parou em qual adto?" sem cruzar manualmente os logs do `ReconciliacaoPermutaService`.

- **Melhoria Proposta**
  > Adicionar `LogService.info({ type: LOG_TYPE.BUSINESS_INFO, message: 'permuta batch iter', data: { requestId, lote_id, i, n, docCod, status } })` no fim de cada iteração do `for` em `ReconciliacaoLotePermutaService.ts:91-127`. Pareia naturalmente com [availability-3] (mesmo `lote_id`).

- **Resultado Esperado**
  > Operador responde "qual adto travou o lote X?" via 1 grep no log do Render. Métrica: linhas estruturadas de progresso por lote = 1 (final) → N+1 (1 por adto + 1 final).

- **Tactic alvo**: `Monitor` + `Heartbeat`
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-1 (parcial — observabilidade complementar)
- **Métricas de sucesso**:
  - Logs por adto no nível do lote: 0 → 1
  - Tempo para diagnosticar "parou em qual adto": grep cruzado → grep simples
- **Risco de não fazer**: investigação reativa fica cara conforme o volume cresce.
- **Dependências**: melhora muito com [availability-3] (`lote_id` na chave).

## 6. Notas do agente

- O delta é ESCRITA financeira em lote, mas a feature usa primitives de Availability EXISTENTES no repo (idempotência write-ahead, continue-on-error, dry-run gate herdado). Não há regressão de Availability — há omissões de hardening esperáveis numa primeira fatia.
- Score 6 reflete: continue-on-error e idempotência write-ahead estão sólidos (esses são os P0 reais para escrita financeira e ESTÃO bem); `Bound Execution Times` ausente em 3 camadas é o vetor de risco real e foi escalado P1. Comparar com a run anterior (`2026-06-24-2011`, score 7) — o lote ADICIONA superfície sem ainda hardenar a superfície adicionada.
- Métricas declaradas não-medíveis: (a) duração real do lote em prod e (b) janela exata do proxy Render para HTTP longo. Ambas requerem 1 run cronometrada — recomendado fazer antes de aceitar o P1 como P2.
- Cross-QA: F-availability-1 (Bound Execution Times) tem irmãos diretos em `qa-performance` (latência) e `qa-fault-tolerance` (timeout-pós-sucesso). F-availability-3 (lote_id) tem irmão em `qa-testability` (rastreabilidade de execução).
