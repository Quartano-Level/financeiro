---
qa: Availability
qa_slug: availability
run_id: 2026-06-25-1555
agent: qa-availability
generated_at: 2026-06-25T15:55:00-03:00
scope: backend,frontend
score: 7
findings_count: 4
cards_count: 4
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Exportar" no popover do painel de Permutas | `GET /permutas/relatorios/:tipo` reusa `GestaoPermutasService.exporGestao()` (uma leitura), projeta em memória e serializa via exceljs num único `Buffer` | Rota Express `routes/permutas.ts:371-386` → `RelatorioExportService` → `workbook.xlsx.writeBuffer()` | Operação normal (Render single-process), backlog típico de pendências do dia + invoices em aberto | Endpoint devolve 200 com `.xlsx`; em falha (leitura `/gestao` lança, exceljs estoura, snapshot gigante) `asyncHandler`→`errorMiddleware` devolve `500 {error:"Internal server error"}` sem vazar detalhe; FE captura no `try/catch` e dispara `toast.error("Falha ao exportar …")` mantendo o painel utilizável | Disponibilidade do **painel** preservada (endpoint isolado, sem efeito colateral em ERP/DB); export individual com fallback humano (clicar de novo); SEM impacto cross-tenant (single-tenant Render hoje) |

> **Escopo (quick):** apenas o delta da feature de export. As tactics do estado-alvo
> AWS (DLQ, EventBridge, multi-conta) seguem **N/A — alvo não presente** (CLAUDE.md).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Endpoint de export envolto em `asyncHandler` (erro async → middleware central) | Sim | 100% | ✅ | `routes/permutas.ts:373` + `http/asyncHandler.ts:11` |
| `errorMiddleware` central monta resposta genérica sem vazar `err.message` em 500 | Sim | Sim | ✅ | `http/errorMiddleware.ts:35` |
| Rate-limit aplicado à rota de export (defesa contra abuso/clique repetido) | **Não** (sem `heavyRouteLimiter`, sem `globalLimiter` local) | rate-limit alinhado ao custo (export reusa `/gestao` inteiro) | ⚠️ | `routes/permutas.ts:371-386` (compare com `/eleicao`, `/ingestao`, `/reconciliar` que usam `heavyRouteLimiter`) |
| Timeout explícito no handler do export (corta export que trava em `writeBuffer` ou em `exporGestao`) | **Não** (depende do timeout default do server Render — não declarado no código) | timeout explícito (ex.: 30s) com 504 controlado | ❌ | `routes/permutas.ts:371-386` + `grep timeout RelatorioExportService.ts → vazio` |
| Streaming/`workbook.xlsx.write(stream)` em vez de buffer único em memória | **Não** — `Buffer.from(await workbook.xlsx.writeBuffer())` retém tudo | streaming para snapshots grandes | ❌ | `RelatorioExportService.ts:395-396` |
| Idempotência / deduplicação de cliques (FE) | Sim — botões `disabled={exportando !== null}` impedem 2º clique enquanto exporta | guard de re-entrada | ✅ | `app/permutas/page.tsx:680, 1185, 1202` |
| Toast de erro no FE quando download falha (Detect Faults visível ao usuário) | Sim — `toast.error("Falha ao exportar …")` no `catch` | sim | ✅ | `app/permutas/page.tsx:687-690` + `lib/api.ts:433-440` |
| Reuso de Executors (`RetryExecutor`/`FallbackExecutor`) no caminho do export | Não — leitura única de `/gestao`, sem retry. (6 arquivos do repo usam executors; este service não.) | retry só se a leitura for cara/flaky; aqui leitura é local (Postgres) — opcional | N/A | `grep RetryExecutor` em `RelatorioExportService.ts` → vazio |
| Endpoint READ-ONLY (sem write em ERP/DB) — falha não corrompe estado | Sim (reusa `exporGestao`, só projeta) | Sim | ✅ | `RelatorioExportService.ts:51-61` |
| Cobertura de testes do delta (suítes verdes) | 463/463 BE + 51/51 FE | tudo verde | ✅ | `_shared-metrics.md` |
| Validação de `:tipo` no boundary (Exception Prevention) | Sim — `isRelatorioTipo` antes de resolver o service; 400 explícito | sim | ✅ | `routes/permutas.ts:376-379` + `interface/permutas/Relatorio.ts:45-46` |

> ⚠️ **Não medível localmente — peak memory do `writeBuffer` em produção.**
> Não temos o tamanho real do snapshot diário (`gestao.pendentes.length` + `invoicesEmAberto.length`)
> de produção Columbia, e o `Buffer` xlsx fica todo em RAM. Recomendação: instrumentar
> `logService.info` já existente (`linhas: definicao.linhas.length`, `RelatorioExportService.ts:58`)
> com `process.memoryUsage().heapUsed` antes/depois do `writeBuffer` e cruzar com o heap do Render.
>
> ⚠️ **Não medível localmente — duração p95 do export.** Requer log estruturado de duração
> (timer no `asyncHandler` do export) e/ou métrica no Render dashboard. Sem isso não dá
> para defender SLO de "export ≤ Xs" com número.

## 3. Tactics — Cobertura no delta da feature

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | N/A — endpoint síncrono request/response, sem dependência externa async | N/A | — |
| Heartbeat | N/A — sem worker/job neste delta (a feature é uma rota HTTP) | N/A | — |
| Monitor | Apenas `logService.info` ao final do export. Sem timer/duração, sem alarme em Render | ⚠️ parcial | `RelatorioExportService.ts:55-59` |
| Timestamp | Snapshot timbrado por `gestao.geradoEm` (no nome do arquivo) | ✅ presente | `RelatorioExportService.ts:376-379` |
| Sanity Checking | Validação do `:tipo` com type-guard antes de resolver o service | ✅ presente | `routes/permutas.ts:376-379` |
| Condition Monitoring | N/A — single-instance Express (Render); nada a monitorar entre réplicas | N/A | — |
| Voting | N/A — sem redundância ativa neste caminho | N/A | — |
| Exception Detection | `asyncHandler` captura promise rejeitada e roteia ao `errorMiddleware` central; FE captura no `try/catch` e mostra toast | ✅ presente | `http/asyncHandler.ts:11`, `app/permutas/page.tsx:687-690` |
| Self-Test | Ausente (sem rota de health específica para o pipeline de export) | ❌ ausente | — |
| Active Redundancy | N/A — sem réplicas no Render single-process | N/A | — |
| Passive Redundancy | N/A — idem | N/A | — |
| Spare | N/A — idem | N/A | — |
| Exception Handling | `errorMiddleware` devolve 500 genérico, loga server-side, não vaza interno; FE não derruba UI (toast + `finally setExportando(null)`) | ✅ presente | `http/errorMiddleware.ts:12-35`, `app/permutas/page.tsx:691-693` |
| Rollback | N/A — read-only, sem estado a desfazer | N/A | — |
| Software Upgrade | N/A — fora de escopo do delta | N/A | — |
| Retry | Ausente no service (snapshot é leitura local de Postgres, custo baixo). FE também não reexecuta automaticamente — usuário clica de novo. Aceitável neste contexto, mas sem rede de segurança | ⚠️ parcial | `RelatorioExportService.ts:51` (sem `RetryExecutor`) |
| Ignore Faulty Behavior | N/A — não há sinal externo a ignorar | N/A | — |
| Degradation | Parcial: se export falha, **painel continua funcionando** (export é feature lateral). Não há, porém, fallback do tipo "export reduzido" / "primeiras N linhas" quando snapshot fica grande demais | ⚠️ parcial | Análise estática do delta |
| Reconfiguration | N/A — single-process | N/A | — |
| Shadow | N/A | N/A | — |
| State Resynchronization | N/A — sem estado próprio do export | N/A | — |
| Escalating Restart | N/A — Render gerencia restart do processo, fora do delta | N/A | — |
| Non-Stop Forwarding | N/A | N/A | — |
| Removal from Service | Parcial — sem feature-flag para desligar `/relatorios/:tipo` se ele virar um problema (ex.: travando event-loop). Hoje desligar requer revert/deploy | ⚠️ parcial | `routes/permutas.ts:371-386` (sem flag/env) |
| Transactions | N/A — read-only, sem commit | N/A | — |
| Predictive Model | Ausente — não há predição de tamanho do export antes de serializar (poderia abortar com 413 se `linhas > N`) | ❌ ausente | — |
| Exception Prevention | Validação de `:tipo` no boundary previne crash por enum inválido; type-guard `isRelatorioTipo` | ✅ presente | `routes/permutas.ts:376-379`, `interface/permutas/Relatorio.ts:45-46` |
| Increase Competence Set | N/A — fora de escopo do delta | N/A | — |

## 4. Findings (achados)

### F-availability-1: rota de export sem rate-limit nem guard de concorrência por usuário

- **Severidade**: P2 (médio — débito técnico defensável, sem baseline de abuso real medida)
- **Tactic violada**: Removal from Service / Exception Prevention (defesa contra clique-em-rajada que satura o servidor)
- **Localização**: `src/backend/routes/permutas.ts:371-386`
- **Evidência (objetiva)**:
  ```ts
  router.get(
      '/relatorios/:tipo',
      asyncHandler(async (req, res) => {
          // sem heavyRouteLimiter, sem globalLimiter local
          ...
          const { filename, buffer } = await service.exportar(tipo, req.requestId);
  ```
  Comparar com `/eleicao` (`:131`), `/ingestao` (`:166`), `/reconciliar` (`:420`) — todos com `heavyRouteLimiter`. Export reusa o **mesmo custo computacional** de `/gestao` + serialização exceljs (que é CPU-intensiva), mas roda sem limitador local.
- **Impacto técnico**: usuário (ou bot logado) clicando 6 abas × N vezes pode disparar 6+ `exporGestao()` paralelos + 6+ workbooks em memória num único processo Express. O FE bloqueia re-clique do mesmo `tipo`, mas **não bloqueia tipos diferentes simultâneos** (`disabled={exportando !== null}` é o flag global do estado — confirmado em `page.tsx:1185, 1202` — então mitiga, mas só na UI; um cliente fora do navegador não respeita).
- **Impacto de negócio**: latência elevada no painel para todos os analistas durante o pico de uso (Render single-process). Sem incidente registrado ainda, mas é uma classe de falha já conhecida no projeto (motivo pelo qual `heavyRouteLimiter` existe).
- **Métrica de baseline**: hoje `heavyRouteLimiter` é usado em **4** rotas de Permutas; a de export **não está** entre elas. Cobertura de rate-limit em rotas pesadas: 4/5 = 80%.

### F-availability-2: workbook xlsx inteiro carregado em RAM (`writeBuffer`) sem streaming

- **Severidade**: P2 (médio — sem baseline de tamanho de snapshot em produção; rebaixado de P1 por falta de número defensável)
- **Tactic violada**: Predictive Model / Degradation
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:382-397`
- **Evidência (objetiva)**:
  ```ts
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
  ```
  Toda a planilha (linhas projetadas + estilo do header + larguras) fica em RAM como `ArrayBuffer` e depois é copiada para um `Buffer` (peak de memória ≈ 2× o tamanho do .xlsx serializado durante a cópia).
- **Impacto técnico**: snapshot grande (ex.: backlog acumulado de adiantamentos + invoices num mês fechado) pode estourar o heap do processo Render single-instance. Como **não há timeout** no handler e a serialização é síncrona no event-loop em vários trechos do exceljs, um snapshot de N linhas alto pode travar o painel inteiro (não só o export).
- **Impacto de negócio**: degradação do painel durante o export. Em caso de OOM, o processo Render reinicia e qualquer sessão ativa (incluindo ingestão manual em curso) é interrompida.
- **Métrica de baseline**: ⚠️ **Não medível localmente** — `gestao.pendentes.length` real em produção não é conhecido nesta sessão. O log do service registra `linhas: definicao.linhas.length` (`RelatorioExportService.ts:58`), mas a duração e o pico de heap não são medidos. Defesa do P2 (vs. P1) está exatamente na ausência desse número. Cobertura de streaming: 0% (1/1 export usa buffer).

### F-availability-3: sem timeout explícito no handler; export pode pinar o event-loop indefinidamente

- **Severidade**: P2 (médio — sem incidente medido; depende do timeout default do Render, não controlado no código)
- **Tactic violada**: Exception Prevention (timeout como "circuit breaker" de operação cara)
- **Localização**: `src/backend/routes/permutas.ts:371-386` + `src/backend/domain/service/permutas/RelatorioExportService.ts:51-61`
- **Evidência (objetiva)**: `grep -n "timeout" RelatorioExportService.ts routes/permutas.ts → vazio`. Nenhum `AbortController`, `Promise.race(timer)`, nem `req.setTimeout`. Se `exporGestao()` travar (ex.: contenção em pool Postgres) ou `writeBuffer()` ficar muito longo, o handler espera indefinidamente até o timeout do upstream (Render/CDN).
- **Impacto técnico**: handler "pendurado" segura uma conexão HTTP do worker do Express + um lock implícito no pool de DB. Em single-process, isso reduz a concorrência efetiva de TODA a aplicação.
- **Impacto de negócio**: indisponibilidade silenciosa do painel; usuário não recebe feedback (até o navegador desistir) e backend não loga "timeout" — só vê a 502/504 do Render, sem causa raiz.
- **Métrica de baseline**: 0 endpoints no `routes/permutas.ts` declaram timeout explícito (todos confiam no default da infra). Para a rota de export, a operação é a **mais cara da família READ** porque combina `exporGestao` + serialização CPU-bound.

### F-availability-4: erro do exceljs vira 500 genérico sem distinção de causa (sem retriabilidade no FE)

- **Severidade**: P3 (baixo — UX, sem perda de dado)
- **Tactic violada**: Exception Detection (granularidade) / Retry
- **Localização**: `src/backend/http/errorMiddleware.ts:35` + `src/frontend/lib/api.ts:433-440` + `src/frontend/app/permutas/page.tsx:687-690`
- **Evidência (objetiva)**:
  ```ts
  // BE — qualquer falha vira:
  res.status(500).json({ error: 'Internal server error' });
  // FE — toast genérico:
  toast.error(`Falha ao exportar "${label}" — API 500`);
  ```
  Qualquer exceção (Postgres caiu, `writeBuffer` estourou, projeção bugou) chega ao analista como "Internal server error". Não há classificação de "transitório vs. permanente" para o FE decidir entre "tente de novo" e "abra um chamado".
- **Impacto técnico**: zero discriminação entre causas → impossível instrumentar alarme específico ("export OOM" vs. "export DB-timeout").
- **Impacto de negócio**: analista perde tempo tentando re-exportar erros permanentes (ex.: bug de projeção) ou desiste de erros transitórios (ex.: lock momentâneo de DB) que iam funcionar no 2º clique.
- **Métrica de baseline**: 1 código de erro genérico (500) cobre 100% das falhas do export hoje. Categorias úteis: ≥3 (4xx-invalid, 503-transient, 500-permanent).

## 5. Cards Kanban

### [availability-1] Aplicar rate-limit dedicado na rota de export de relatórios

- **Problema**
  > A rota `GET /permutas/relatorios/:tipo` (`routes/permutas.ts:371-386`) é a única operação READ pesada de Permutas que **não** está protegida por `heavyRouteLimiter`. Cada chamada reusa todo o custo de `/gestao` mais serialização xlsx (CPU-bound). 4 de 5 rotas pesadas do arquivo já usam o limiter; esta ficou de fora. O guard de UI (`disabled={exportando !== null}` em `page.tsx:1185`) só protege via navegador.
- **Melhoria Proposta**
  > Adicionar `heavyRouteLimiter` (ou um limiter dedicado de "exports" com janela mais curta — ex.: 6 req/min/usuário, equivalente ao número de tipos disponíveis) na rota `/relatorios/:tipo`. Tactic Bass: **Removal from Service** (limitar entrada para preservar o resto do serviço). Arquivos: `routes/permutas.ts`, `http/rateLimit.ts`.
- **Resultado Esperado**
  > Cobertura de rate-limit nas rotas pesadas de Permutas: **4/5 (80%) → 5/5 (100%)**. Clique-em-rajada (manual ou script) é cortado com 429 antes de gerar workbook na memória.
- **Tactic alvo**: Removal from Service
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-1
- **Métricas de sucesso**:
  - rotas Permutas pesadas com limiter: 4/5 → 5/5
  - 429 no log quando 7+ requests/min do mesmo usuário (smoke test): 0 → ≥1
- **Risco de não fazer**: durante o fechamento mensal (pico de uso do painel), um analista que abre o popover e clica nos 6 relatórios em sequência pode degradar o tempo de resposta do painel para todos.
- **Dependências**: nenhuma

### [availability-2] Streamar o workbook xlsx (`workbook.xlsx.write(stream)`) em vez de buffer único

- **Problema**
  > `RelatorioExportService.ts:395-396` materializa o `.xlsx` inteiro em memória (`writeBuffer` → `Buffer.from`). Em Render single-process, snapshot grande de Permutas pode levar o heap perto do limite; combinado com a ausência de timeout (card availability-3), o handler pode travar o event-loop durante a serialização.
- **Melhoria Proposta**
  > Trocar `writeBuffer()` por `workbook.xlsx.write(res)` (exceljs suporta WritableStream) e setar `Content-Disposition`/`Content-Type` antes do `write`. Tactic Bass: **Degradation** (mantém o resto do servidor responsivo durante o export). Arquivo: `RelatorioExportService.ts` (assinatura passa a aceitar um `Writable` em vez de devolver `Buffer`) e `routes/permutas.ts` (passa `res` ao service).
- **Resultado Esperado**
  > Pico de heap por export: **~2× tamanho-do-arquivo → ~constante** (chunks). Tempo até o 1º byte chegar no browser: **fim-da-serialização → quase imediato** (UX percebida).
- **Tactic alvo**: Degradation / Predictive Model
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-2
- **Métricas de sucesso**:
  - peak `process.memoryUsage().heapUsed` durante export (instrumentar antes/depois): coletar baseline → reduzir ≥40% em snapshot de 10k linhas (teste sintético)
  - TTFB do download no FE: medir baseline → reduzir ≥50%
- **Risco de não fazer**: snapshot grande inesperado (backlog acumulado) causa OOM no processo Render; reinício derruba sessões em curso (incluindo ingestão manual via `IngestaoCoalescerService`).
- **Dependências**: nenhuma — porém faz par com availability-3 (timeout) para defesa completa.

### [availability-3] Timeout explícito + log de duração no handler de export

- **Problema**
  > Não há timeout no handler `GET /permutas/relatorios/:tipo` nem no `RelatorioExportService.exportar`. Se `exporGestao()` ou `writeBuffer` travarem, o handler aguarda o timeout default do Render sem logar "deadline excedido", consumindo uma conexão do worker e potencialmente um cursor de DB.
- **Melhoria Proposta**
  > Envolver `service.exportar(...)` em `Promise.race([fn(), deadline(30_000)])` (ou usar `AbortController` se exceljs/pg suportar) e responder `504 {error:"export deadline exceeded"}` quando exceder. Instrumentar `logService.info({duracaoMs, linhas, heapUsed})` ao final (o log atual já tem `linhas`, falta tempo e memória). Tactic Bass: **Exception Prevention** (timeout = circuit breaker de operação cara) + **Monitor**. Arquivos: `RelatorioExportService.ts`, opcional helper em `domain/libs/executor/`.
- **Resultado Esperado**
  > Endpoints Permutas com timeout explícito declarado: **0/14 → 1/14** (estabelece o padrão). Surgem logs com `duracaoMs` por export para sustentar SLO futuro.
- **Tactic alvo**: Exception Prevention / Monitor
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-3, F-availability-2
- **Métricas de sucesso**:
  - rotas com timeout declarado em código: 0 → 1 (e adota como padrão para próximas)
  - métrica `duracaoMs` no log do export: ausente → presente em 100% das execuções
  - 504 explícito visível no FE quando teste sintético atrasa `exporGestao` por 31s: ausente → presente
- **Risco de não fazer**: falha "pendurada" continua silenciosa; defesa de SLO de export na reunião é palpite, sem número.
- **Dependências**: nenhuma; emparelha bem com availability-2 (streaming).

### [availability-4] Classificar erros do export (4xx-input / 503-transient / 500-permanent) com toast acionável

- **Problema**
  > Hoje qualquer falha do export vira `500 {error:"Internal server error"}` no BE (`errorMiddleware.ts:35`) e `toast.error("Falha ao exportar … API 500")` no FE (`api.ts:439`, `page.tsx:688`). Analista não tem como saber se vale clicar de novo ou abrir chamado — e o time não consegue plotar alarme específico por causa raiz.
- **Melhoria Proposta**
  > No handler do export, capturar explicitamente:
  > - `ZodError`/validação → `400 {code:"INVALID_TYPE"}` (já feito);
  > - erros transitórios do pool pg (`ECONNRESET`/`timeout`) → `503 {code:"TRANSIENT", retryable:true}`;
  > - exceções do exceljs / projeção → `500 {code:"EXPORT_FAILURE", retryable:false}`.
  >
  > FE diferencia toast: `retryable=true` mostra `toast.error(... , { action: { label: "Tentar de novo", onClick } })`. Tactic Bass: **Exception Detection** (granularidade) + **Retry** (opt-in pelo usuário, sem retry implícito que mascara causa).
- **Resultado Esperado**
  > Categorias de erro visíveis ao operador: **1 (500 genérico) → 3+ (400/503/500 com `code`)**. Métrica plotável por categoria.
- **Tactic alvo**: Exception Detection / Retry
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - códigos de erro distintos retornados pelo export: 1 → ≥3
  - toast com ação "Tentar de novo" em erros `retryable=true`: 0 → presente
- **Risco de não fazer**: analista perde tempo (e arquivos) em erros não retriáveis; time perde sinal de monitoração quando o export começar a falhar consistentemente.
- **Dependências**: card availability-3 ajuda (timeout dedicado classifica como 504/transient).

## 6. Notas do agente

- Quick mode + delta read-only: não rastreei tactics do estado-alvo (DLQ, EventBridge, multi-tenant blast radius) — tudo fora do delta e marcado N/A. CLAUDE.md trata `infra/`/AWS como alvo, não presente.
- Tentei medir peak-memory e p95 do export, mas snapshot de produção e telemetria do Render não estão disponíveis nesta sessão → declarado explicitamente como "não medível localmente". Por isso, F-availability-2 ficou P2 (não P1) — defender P1 sem número seria palpite.
- Cross-QA: F-availability-2 (memória) toca **performance** (latência de painel sob export); F-availability-4 (categorização de erro) toca **fault-tolerance** (sinal para alarme). Alertar o consolidator.
