---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-22-1658
agent: qa-fault-tolerance
generated_at: 2026-06-22T17:05:00Z
scope: all
score: 6.5
findings_count: 8
cards_count: 8
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

O QA "Safety" do framework Bass & Clements foi substituído por **Fault Tolerance** porque o
domínio (automação financeira multi-filial, sem aspecto cyber-físico) tem como concern primário
**consistência de estado sob falha parcial**: o sistema lê do ERP Conexos (Fase 2 ainda READ-ONLY),
casa adiantamentos × invoices localmente (greedy 1:1 + manual N:M cross-process) e, na **Fase 3
ainda não implementada**, executará as PERMUTAS no `fin010` (escrita financeira real). A barra
hoje: `nenhum adto/invoice roteado ao estado errado por falha transitória; nenhum cadastro de
cliente-filtro divergir do painel de gestão; nenhuma run de ingestão deixar o banco num estado
parcial onde apenas alguns fatos foram atualizados`. A barra alvo (Fase 3): zero permuta executada
duas vezes no `fin010` por retry/redelivery; toda divergência local↔ERP detectada por
reconciliação periódica.

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Cron GitHub Actions (3×/dia) ou analista (UI) | `POST /permutas/ingestao` enquanto outra run está em voo, OU compute Conexos falha no meio do fan-out | `IngestaoPermutasService` + `PermutaRelationalRepository.persistIngestRun` (transação + advisory lock) | Operação normal (Render+Supabase) ou ERP intermitente | Lock-busy → 409 sem efeito colateral; falha mid-run → ROLLBACK + cabeçalho `error` fora da tx; fatos last-good sobrevivem | 0 linhas órfãs em qualquer estado parcial; cabeçalho de run com `status='success'` ⇔ 100% dos UPSERTs ocorreram |
| Analista clica "Adicionar" e depois "Remover" no cadastro de cliente-filtro | Ingestão automática disparada após cada mutação (`POST /cliente-filtro` + `POST /ingestao`) falha (429/timeout/lock-busy) | `ClientesFiltroPage.remover/adicionar` (compensação client-side) | UI em produção (Vercel) | Em DELETE+ingest-falha: re-ADD client-side restaura o filtro (best-effort, sem transação) | Cadastro coerente com painel ≥99% dos casos; 0 fila de "filtro órfão" persistente |
| Duplo-clique / replay de `POST /permutas/eleicao` (Idempotency-Key) | Mesma key chega ao backend antes do 1º request gravar | `EleicaoPermutasService` (advisory lock por hash da key + replay) | Pico de concorrência | 2º request reusa o `runId` da run em curso ou retorna replay vazio — ZERO fan-out duplicado | 0 fan-outs Conexos duplicados; 0 runs duplicadas no `permuta_eleicao_run` |
| Cron Conexos retorna 5xx no detalhe de UMA proforma | `getDetalheTitulos` (axios) falha após retries | `EleicaoPermutasService.buildCandidata` | ERP intermitente | Candidata bloqueada com `motivoBloqueio='DETAIL_INDISPONIVEL'` — re-avaliável na próxima run, run continua | 100% dos adtos cujo detalhe falhou caem em estado quarentenado nomeado; 0 run abortada por 1 detalhe indisponível |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Mutações financeiras executadas no ERP (Fase 3) | 0 (Fase 3 não iniciada — READ-ONLY hoje) | N/A nesta run | N/A | `_shared-metrics.md`, escopo PR #4 |
| Endpoints `POST` state-mutating com Idempotency-Key honrada | 1/5 (`POST /permutas/eleicao`) — `routes/permutas.ts:73-97` | 5/5 (incluir `/ingestao`, `/cliente-filtro` POST/DELETE, `/adiantamentos/:docCod/alocacoes`, `/processar`) antes da Fase 3 | ⚠️ | `routes/permutas.ts:82-87` (único callsite que lê `Idempotency-Key`) |
| Trabalho multi-write em transação atômica | 2/3 fluxos críticos cobertos (`persistIngestRun` + `persistRun` do snapshot); `alocar` faz 4 writes/reads sem `withTransaction` | 3/3 | ⚠️ | `PermutaRelationalRepository.ts:188-205`, `PermutaSnapshotRepository.ts:98`, `AlocacaoPermutasService.ts:177-284` (sem `withTransaction`) |
| Serialização por advisory lock em path mutativo | 2/2 (ingestão `INGEST_LOCK_KEY=918273645` + eleição por hash da Idempotency-Key) | 2/2 | ✅ | `IngestaoPermutasService.ts:39`, `EleicaoPermutasService.ts:140-184` |
| Compensação manual cross-call (DELETE→ingest→re-ADD) | 1 (client-side, best-effort, sem persistência server-side) | 0 ou ≥1 com fila durável server-side | ⚠️ | `clientes-filtro/page.tsx:128-158` |
| Snapshot back-compat: 2ª linha de run gravada por ingestão | 1 a cada ingestão (`runId` do ingest + `runId` do snapshot — entidades distintas, sem chave de correlação além do `flowId`) | 1 (consolidar em uma única tx ou correlacionar via `flow_id`) | ⚠️ | `IngestaoPermutasService.ts:96-132` |
| Estados "quarentena" nomeados (substituem `falha-gate`) | 1 (`DETAIL_INDISPONIVEL`) | ≥1 por classe de falha externa (Conexos invoice, com308 títulos, com308 taxa) | ⚠️ | `EleicaoPermutasService.ts:498-510` |
| Clients externos com timeout configurado | 2/2 axios (`ConexosService:81` → 40s, `BcbClient:57` → 10s); cron `ingest-permutas` SEM timeout-watchdog | 2/2 + watchdog na job CLI | ⚠️ | `services/conexos.ts:81`, `BcbClient.ts:57`, `jobs/ingest-permutas.ts` |
| Validação de SHAPE da resposta Conexos (Zod no boundary) | Parcial (`com298RowSchema`, `declaracaoRowSchema` aplicados nas leituras de proforma/declaração; várias rotas de detalhe consomem `any` sem parse) | 100% das respostas Conexos | ⚠️ | `domain/client/permutas/conexosPermutasSchemas.ts`, vs. `services/conexos.ts:106-114` (`err.response?.data` consumido cru) |
| Job de reaper para runs/ingestões "stuck" | 0 | ≥1 (varrer runs `started_at > 15min ago` sem `finished_at`, alertar) | ❌ | `jobs/` (apenas `ingest-permutas.ts`, `seed-admin.ts`) |
| Job de reconciliação local ↔ ERP Conexos | 0 (fora de escopo da Fase READ-ONLY; bloqueador para Fase 3) | 1 antes da Fase 3 entrar em prod | ❌ | inexistente |
| Bloco `catch {}` totalmente vazio (swallow silencioso) em path mutativo | 5: `AlocacaoPermutasService.ts:117-119, 132-134`, `EleicaoPermutasService.ts:478, 721`, `IngestaoPermutasService.ts:183-185`, `clientes-filtro/page.tsx:145-147` | 0 em path mutativo (manter só em getters de hidratação opcional) | ⚠️ | `grep -cn "catch\\s*{" src/backend/domain/service/permutas/*.ts` |
| `notify.error` / `toast.error` em mutações que falharam | 100% das mutações do PR #4 (cliente-filtro × ingestão × alocação × processar) | 100% | ✅ | `clientes-filtro/page.tsx:59,117,160`; `permutas/page.tsx:560,563,610,681,696` |

> ⚠️ **Não medível localmente**: tempo-médio-de-detecção de inconsistência cliente-filtro ↔ painel
> (depende de telemetria em prod — Render logs); taxa de re-ADD compensação observada (depende de
> sentry/logging). Recomendação: instrumentar contador `clienteFiltro.removeFailed.reAddSucceeded`
> e `clienteFiltro.removeFailed.reAddFailed` quando a Fase 3 chegar.

## 3. Tactics — Cobertura no nf-projects

Categorias da literatura de fault-tolerance (Garcia-Molina, Gray & Reuter, ACID/idempotência) +
tactics-pretendidas adaptadas de Bass & Clements onde transferem.

| Tactic | Implementação atual | Status | Evidência |
|---|---|---|---|
| Idempotent Replay (request-level) | `Idempotency-Key` header → advisory lock por hash djb2 + TTL 24h em `permuta_eleicao_idempotency`; replay devolve o `runId` existente sem refan-out | ✅ presente (apenas `/permutas/eleicao`) | `EleicaoPermutasService.ts:55-64,118-185`, `PermutaSnapshotRepository.ts:140-166`, migration `0002_permuta_eleicao_idempotency.sql` |
| Idempotent Replay (entity-level, UPSERT por chave natural) | UPSERT por `doc_cod` (adto/invoice), `(pri_cod, variante)` (declaração), `adiantamento_doc_cod` (processamento), `(adto, invoice)` (alocação) — toda re-ingestão é idempotente por design | ✅ presente | `PermutaRelationalRepository.ts:264, 335, 383, 404`, `PermutaProcessamentoRepository.ts:44`, `PermutaAlocacaoRepository.ts:61` |
| Atomic Transaction (multi-write) | `PostgreeDatabaseClient.withTransaction` envelopa BEGIN/COMMIT/ROLLBACK; usado por `persistIngestRun` e `persistRun` do snapshot | ✅ presente (parcial — alocação ainda fora) | `PostgreeDatabaseClient.ts:102-123`, `PermutaRelationalRepository.ts:193-205`, `PermutaSnapshotRepository.ts:98` |
| Mutual Exclusion (Advisory Lock) | `pg_try_advisory_lock` (não-bloqueante) — `INGEST_LOCK_KEY` fixo serializa ingestão cron×manual; key derivada do hash da Idempotency-Key serializa eleição | ✅ presente | `PostgreeDatabaseClient.ts:137-158`, `IngestaoPermutasService.ts:39` |
| Timeout (external call) | axios `timeout: 40_000` (Conexos), `timeout: 10_000` (BCB); HTTP-level apenas — sem watchdog em jobs CLI | ⚠️ parcial | `services/conexos.ts:81`, `BcbClient.ts:57` |
| Retry with Backoff | `RetryExecutor` com delay + jitter; aplicado no init do pool (`retries: 5, delay 2s`) e nas queries via `queryRetryExecutor` (`retries: 3, delay 200ms, jitter 200ms`); padrão `shouldRetry` = sempre | ✅ presente | `RetryExecutor.ts:31-69`, `PostgreeDatabaseClient.ts:36-42, 54-58` |
| Bounded Concurrency (bulkhead) | `BoundedConcurrency.map` limita o fan-out Conexos: `FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10` | ✅ presente | `EleicaoPermutasService.ts:86-87, 241, 390-403`, `BoundedConcurrency.ts` |
| Cooperative Cancellation (AbortController) | `AbortController` cancela o fan-out remanescente quando uma filial falha fatalmente | ✅ presente | `EleicaoPermutasService.ts:230-281, 534-536` |
| Sanity Checking (response shape) | Zod nas linhas wire mais críticas (`com298RowSchema`, `declaracaoRowSchema`); rotas de detalhe ainda consomem `any` em vários pontos | ⚠️ parcial | `domain/client/permutas/conexosPermutasSchemas.ts`, `services/conexos.ts:106-114` (errores consumidos cru) |
| Quarantine / Named Failure State | `DETAIL_INDISPONIVEL` (proforma sem detalhe) — candidata vai pra "bloqueada por motivo nomeado", re-avaliável na próxima run sem manchar a run inteira | ✅ presente (1 caso) | `EleicaoPermutasService.ts:498-510, 555-575` |
| Last-Good Snapshot (read-time degradation) | `replaceAutoCasamentos` (DELETE+INSERT por run) + `markStale=TRUE` no que sumiu — leituras filtram `WHERE NOT stale`; fatos passados sobrevivem a ROLLBACK | ✅ presente | `PermutaRelationalRepository.ts:398-468` |
| Forward Recovery (re-evaluate next run) | Ingestão é recomputada do zero por run; um adto que falhou hoje (sem ser DELETED do banco) é reavaliado amanhã automaticamente | ✅ presente | `EleicaoPermutasService.ts:212-281`, `IngestaoPermutasService.ts:68-156` |
| Compensating Transaction (Saga) | Implementação client-side ÚNICA: DELETE cliente-filtro → ingest → on-fail re-ADD; sem persistência server-side da compensação | ⚠️ parcial (frágil) | `clientes-filtro/page.tsx:128-158` |
| Backward Recovery (ROLLBACK) | Ingestão e snapshot revertem totalmente em falha (BEGIN/COMMIT/ROLLBACK); cabeçalho `error` gravado FORA da tx | ✅ presente | `IngestaoPermutasService.ts:157-194`, `EleicaoPermutasService.ts:328-355`, `PostgreeDatabaseClient.ts:113-122` |
| Audit Trail (who/when/what) | `triggered_by`, `criado_por`, `processado_por`, `last_ingest_run_id`, `last_seen_at` carimbados em cada UPSERT; trilha de runs em `permuta_eleicao_run` | ⚠️ parcial — não há tabela `audit_event` cross-entidade (cada mutação grava só o "quem" embedded; sem timeline unificada) | migrations `0001`, `0013`, `0014`; `PermutaProcessamentoRepository.ts:33-60`; vs. ausência de tabela `audit_event` no `grep` |
| Stuck-State Reaper | Inexistente — nada varre `permuta_eleicao_run.started_at > Nh AND finished_at IS NULL` | ❌ ausente | `jobs/` (só `ingest-permutas.ts`, `seed-admin.ts`) |
| External↔Local Reconciliation | Inexistente — Fase READ-ONLY ainda não precisa, MAS é P0 antes da Fase 3 sair do papel | ❌ ausente (bloqueador da Fase 3) | inexistente |
| Voting (N-version) | N/A — uma única fonte de verdade (Conexos `fin010`); nenhuma redundância de cálculo a ser comparada | N/A | — |
| Self-Test | `/health` Express devolve só `{status:'ok', version}`; sem deep-health (Postgres reachable? Conexos sid válido? cron rodou nas últimas 24h?) | ⚠️ parcial | `index.ts:62-63` |
| Substitution / Replacement | N/A — não há componentes redundantes a ativar; falha do Render = degradação total visível | N/A | — |
| Predictive Model | N/A nesta fase | N/A | — |
| Shadow / Rolling Upgrade | N/A — deploy Render é blue-green do PaaS, sem shadow-mode próprio | N/A | — |

## 4. Findings (achados)

### F-fault-tolerance-1: Compensação cliente-filtro DELETE→ingest é frágil (client-side, sem ponto de truth durável)

- **Severidade**: P1 (alto — divergência cadastro × painel durável quando o re-ADD falha)
- **Tactic violada**: Compensating Transaction (Saga); Atomic Transaction
- **Localização**: `src/frontend/app/permutas/clientes-filtro/page.tsx:128-158`, `src/backend/routes/permutas.ts:185-194` (DELETE) + `:104-131` (ingestão)
- **Evidência (objetiva)**:
  ```ts
  // page.tsx:131-148
  await removeClienteFiltro(pesCod)           // 1. DELETE no BE
  try {
    const r = await runIngestaoManual()        // 2. POST ingestão (compensação esperada)
    await load()
  } catch (ingErr) {
    try {
      await addClienteFiltro(pesCod, nome)    // 3. compensação: re-ADD client-side
    } catch {
      // best-effort: se o re-add falhar, o load() abaixo mostra o estado real.
    }
  }
  ```
  O fluxo é uma saga client-side de 3 passos sem nenhuma persistência durável: se o operador
  fecha a aba entre (1) e (2), ou se (3) também falha (rede caiu), o cadastro fica num estado
  divergente do painel — o filtro foi removido no BE mas os adiantamentos ainda estão roteados
  pelo último snapshot relacional, ou vice-versa. Não há fila de "compensação pendente" no servidor
  para reconciliar mais tarde.
- **Impacto técnico**: A invariante "cadastro de cliente-filtro ↔ roteamento dos adiantamentos no
  painel" pode ser quebrada por: aba fechada, rede instável, lock-busy persistente, sessão expirada.
  Não há reaper que detecte "filtros marcados removidos mas ainda com adtos roteados a permuta-manual".
- **Impacto de negócio**: Analista vê um filtro que "voltou" inexplicavelmente, ou um filtro que sumiu
  enquanto os adtos continuam no estado errado — perda de confiança no cadastro; quando a Fase 3 chegar,
  isso vira potencial permuta executada com o roteamento errado.
- **Métrica de baseline**: 1 fluxo crítico hoje sem proteção server-side (DELETE+ingest); 0 jobs
  de reconciliação periódica.

### F-fault-tolerance-2: `AlocacaoPermutasService.alocar` faz múltiplos reads+1 write SEM `withTransaction`

- **Severidade**: P1 (alto — race condition entre validação de saldo e UPSERT)
- **Tactic violada**: Atomic Transaction; Mutual Exclusion
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:167-284`
- **Evidência (objetiva)**:
  ```
  alocar() faz, NESTA ordem, sem nenhuma transação englobando o conjunto:
   1. relationalRepository.findAdiantamento(...)               (SELECT)
   2. conexosClient.listFinanceiroAPagar / getDetalheTitulos / listTitulosAPagar (várias chamadas HTTP)
   3. alocacaoRepository.sumByAdiantamento(...)                 (SELECT)
   4. alocacaoRepository.sumByInvoice(...)                      (SELECT)
   5. alocacaoRepository.upsertAlocacao(...)                    (INSERT/UPDATE)
  ```
  Duas requisições simultâneas alocando contra a MESMA invoice (cenário N:M onde dois analistas
  abrem o modal ao mesmo tempo) podem ambas ler `sumByInvoice=X`, validar `X+pedido ≤ saldo`, e
  ambas gravar — totalizando `2×pedido` (over-allocation silenciosa). Não há `SELECT ... FOR
  UPDATE`, advisory lock por invoice, ou constraint de soma.
- **Impacto técnico**: Σ alocações de uma invoice pode exceder o valor em aberto da invoice na
  janela de concorrência (entre passos 4 e 5). A invariante de saldo só é checada em memória.
- **Impacto de negócio**: Fase 2 (rascunho) é tolerável porque o write-back não acontece — analista
  vê totais inconsistentes na tela e ajusta. Fase 3 (write-back `fin010`) torna isso P0: alocação
  sobrescrita = permuta executada com valor inválido no ERP.
- **Métrica de baseline**: 5 chamadas DB+HTTP sequenciais em `alocar` sem nenhuma proteção transacional
  ou de lock.

### F-fault-tolerance-3: `IngestaoPermutasService.executar` faz `persistIngestRun` E `snapshotRepository.persistRun` em transações SEPARADAS

- **Severidade**: P1 (alto — divergência `/gestao` × `/painel` em falha mid-execução)
- **Tactic violada**: Atomic Transaction (saga em duas etapas, mid-state visível)
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:96-132`
- **Evidência (objetiva)**:
  ```ts
  // IngestaoPermutasService.ts:96-118 — primeiro tx: relacional (Fase B, /gestao)
  const runId = await this.relationalRepository.persistIngestRun(header, INGEST_LOCK_KEY, async (tx, currentRunId) => {
      await this.relationalRepository.upsertAdiantamentos(tx, currentRunId, adiantamentos);
      await this.relationalRepository.upsertInvoices(tx, currentRunId, invoices);
      await this.relationalRepository.upsertDeclaracoes(tx, currentRunId, declaracoes);
      await this.relationalRepository.replaceAutoCasamentos(tx, currentRunId, casamentos);
      totalStale = await this.relationalRepository.markStale(tx, currentRunId);
  });
  // (commit do tx-relacional já aconteceu aqui)

  // IngestaoPermutasService.ts:121-132 — segundo tx: snapshot (back-compat, /painel)
  await this.snapshotRepository.persistRun(snapshotInput, candidatas);
  ```
  Se o processo crashar (Render OOM, deploy mid-run, query timeout) ENTRE o commit do tx-relacional
  e o início do `snapshotRepository.persistRun`, `/gestao` mostra dados frescos do run novo enquanto
  `/painel` mostra dados antigos do run anterior — sem cabeçalho `error` correlato no snapshot, e o
  retry da próxima ingestão NÃO recompõe automaticamente o snapshot sob o mesmo `runId` (são entidades
  com IDs distintos, correlatas só por `flow_id`).
- **Impacto técnico**: Duas leituras (`/gestao` e `/painel`) podem divergir por uma janela de 1+
  ingestão até a próxima rodada bem-sucedida. A run "metade-feita" não é detectável por reaper
  porque AMBAS as gravações têm cabeçalho `status='success'` no `permuta_eleicao_run` — só com
  IDs/timestamps distintos.
- **Impacto de negócio**: Em produção (cron 3×/dia) a janela é curta; em falha sustentada (Conexos
  fora por 1 dia, deploy travado), as duas telas mostram realidades diferentes — analista decide com
  base em `/gestao` enquanto `/painel` ainda mostra estado pré-ingestão.
- **Métrica de baseline**: 2 transações em vez de 1 por ingestão; sem chave de correlação obrigatória
  (`flow_id` é UUID, não rastreado pra ordenação na trilha).

### F-fault-tolerance-4: Ausência de Idempotency-Key em endpoints state-mutating além de `/eleicao`

- **Severidade**: P1 hoje (Fase 2 read-only no ERP, mas grava localmente); **P0 quando Fase 3 entrar**
- **Tactic violada**: Idempotent Replay (request-level)
- **Localização**: `src/backend/routes/permutas.ts:104-131` (`/ingestao`), `:164-182` (`POST /cliente-filtro`), `:232-270` (`POST /adiantamentos/:docCod/alocacoes`), `:302-324` (`/processar`)
- **Evidência (objetiva)**:
  ```
  Idempotency-Key header é lido SÓ em /permutas/eleicao (routes/permutas.ts:82-87).
  Os outros endpoints state-mutating (que persistem no Postgres próprio) não consultam o header
  nem têm tabela de dedupe equivalente a permuta_eleicao_idempotency.
  Mitigação atual: cada operação tem UPSERT por chave natural (idempotência entity-level),
  então um retry "puro" do mesmo payload não duplica linhas. MAS:
   - POST /processar com observacao distinta no retry sobrescreve a anterior.
   - POST /alocacoes com valorAlocado distinto no retry sobrescreve a anterior.
   - DELETE /cliente-filtro + retry após o DELETE ter sucesso (mas timeout no cliente) é no-op
     no BE; o frontend ainda dispara o fluxo de "compensação" (F-fault-tolerance-1).
  ```
- **Impacto técnico**: O safety-net de "duplo-clique não escreve duas vezes" é parcial; depende da
  UI desabilitar botão durante `setAdding/setRemoving` (`aria-busy`), o que pode ser contornado por
  retry de rede / tab refresh / replay de Service Worker / curl.
- **Impacto de negócio**: Hoje, no máximo cria observação duplicada ou estado de processamento
  inconsistente. Quando a Fase 3 ligar o write-back `fin010`, ausência de Idempotency-Key em
  `/alocacoes` ou `/processar` = potencial baixa dupla.
- **Métrica de baseline**: 1/5 POST mutativos honram Idempotency-Key (`/eleicao`). Alvo: 5/5.

### F-fault-tolerance-5: Catch silencioso em path mutativo (`AlocacaoPermutasService` e `IngestaoPermutasService`)

- **Severidade**: P2 (médio — débito técnico defensável; documentado por comentário, mas ainda mascara)
- **Tactic violada**: Sanity Checking; Detect Faults
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:117-119, 132-134`; `IngestaoPermutasService.ts:183-185`; `EleicaoPermutasService.ts:478, 721-723`
- **Evidência (objetiva)**:
  ```ts
  // AlocacaoPermutasService.ts:117-119
  } catch {
      // detalhe indisponível — conservador: mantém (não esconde possível em-aberto).
  }
  // IngestaoPermutasService.ts:183-185 — engole erro na escrita do cabeçalho de erro
  } catch {
      // engole — o erro original é re-lançado abaixo.
  }
  ```
  Os comentários documentam a intenção (graceful degradation: falha de detail → mantém invoice;
  falha gravando o cabeçalho-de-erro → não mascara o erro original), MAS nenhum desses pontos
  emite contador/telemetria, então uma cascata silenciosa de Conexos retornando 500 em
  `getDetalheTitulos` da invoice resulta em todas as invoices aparecerem "abertas" sem nenhum
  alerta.
- **Impacto técnico**: Detecção tardia de degradação de upstream (Conexos). O Quarantine para
  PROFORMA (`DETAIL_INDISPONIVEL`) existe, mas para INVOICE não — silencia.
- **Impacto de negócio**: Em produção, taxas Conexos retornadas como `undefined` em sequência ficam
  invisíveis; quando o analista percebe (telas com "—" em colunas que deveriam ter valor), o
  problema já foi parcialmente roteado.
- **Métrica de baseline**: 5 catch-vazios em path de fluxo financeiro.

### F-fault-tolerance-6: Sem job reaper para runs de ingestão "stuck" (started_at sem finished_at)

- **Severidade**: P1 (alto — falha do cron travado deixa lock advisory teoricamente liberado mas a run "abandonada" no banco)
- **Tactic violada**: Stuck-State Reaper; Condition Monitoring
- **Localização**: `src/backend/jobs/` (apenas `ingest-permutas.ts`, `seed-admin.ts` — nenhum reaper)
- **Evidência (objetiva)**:
  ```
  # find /src/backend/jobs -type f -name "*.ts"
  src/backend/jobs/ingest-permutas.ts
  src/backend/jobs/seed-admin.ts
  ```
  Não há job que execute periodicamente `SELECT id FROM permuta_eleicao_run WHERE started_at <
  now() - interval '30 minutes' AND finished_at IS NULL`. Em teoria o advisory lock é
  session-scoped (libera quando o processo morre), mas o cabeçalho de run com status sucesso/error
  fica órfão — e a próxima ingestão UPSERTa fatos com `last_ingest_run_id` apontando para uma run
  sem `finished_at`, dificultando auditoria.
- **Impacto técnico**: A trilha de auditoria do modal (`GET /permutas/runs`) começa a mostrar runs
  com "em andamento há 2 horas" depois de um crash silencioso — sem mecanismo de fechar
  automaticamente como `error`.
- **Impacto de negócio**: Suporte/analista não tem sinal claro de "ingestão de ontem nunca terminou"
  — vê os dados velhos no painel e assume que o cron rodou. Em Render, deploys overlapping podem
  causar isso.
- **Métrica de baseline**: 0 jobs reaper.

### F-fault-tolerance-7: Sem reconciliação local↔Conexos — bloqueador da Fase 3

- **Severidade**: P1 hoje (READ-ONLY mitiga), **P0 quando Fase 3 entrar**
- **Tactic violada**: External↔Local Reconciliation
- **Localização**: arquitetura — nenhum job equivalente
- **Evidência (objetiva)**: Não há job/serviço que diariamente leia `permuta_alocacao` ou
  `permuta_casamento` e compare com o estado real no `fin010` (Conexos). A relação atual é
  estritamente direcional: Conexos→nós. Quando a Fase 3 abrir o write-back, divergências
  (permuta executada no `fin010` por outro caminho — analista entrando manual no ERP, por
  exemplo) ficam invisíveis até quem-sabe-quando.
- **Impacto técnico**: Sem reconciliação, não há detecção de drift entre a verdade do ERP e a
  verdade local. O sistema acumula divergência silenciosa.
- **Impacto de negócio**: Dashboard mente: mostra "X permutas executadas" enquanto o ERP tem Y; analista
  toma decisão sobre invoice/adto que já foi baixado por outro caminho — risco de baixa dupla quando
  o write-back chegar.
- **Métrica de baseline**: 0 jobs de reconciliação; Fase 3 não pode entrar sem isso.

### F-fault-tolerance-8: Sem tabela `audit_event` cross-entidade — trilha embutida só nas tabelas de domínio

- **Severidade**: P2 (médio — auditoria existe, mas não é unificada)
- **Tactic violada**: Audit Trail (timeline cross-cutting)
- **Localização**: migrations `0001-0014` (nenhuma cria tabela `audit_event` / `domain_event_log`)
- **Evidência (objetiva)**:
  ```
  # grep -rn "audit_event\|domain_event" src/backend/migrations/*.sql
  (sem matches — só "audit" aparece em comentário)
  ```
  Cada entidade carrega seu próprio campo de "quem" (`triggered_by`, `criado_por`, `processado_por`)
  e timestamp, mas não há tabela única que liste em ordem cronológica TODAS as mutações financeiras
  para uma dada chave (ex.: "tudo que aconteceu com o adto X" exige UNION ALL de várias tabelas).
- **Impacto técnico**: Investigar incidente (analista reporta "esta permuta foi feita errada") exige
  varrer 3-4 tabelas em ordem temporal. Sem ordem causal explícita (cada tabela tem seu próprio
  `updated_at` baseado em `now()`), reconstruir o que aconteceu é heurístico.
- **Impacto de negócio**: Auditoria de compliance / Cosec demanda trilha unificada; quando a Fase 3
  chegar e o write-back falhar, "o que aconteceu por onde" é insumo obrigatório.
- **Métrica de baseline**: 0 tabelas cross-entidade; ~5 tabelas com campo de auditoria embutido.

## 5. Cards Kanban

### [fault-tolerance-1] Mover compensação cliente-filtro para o servidor (saga durável)

- **Problema**
  > A remoção de cliente-filtro com auto-ingest é uma saga client-side de 3 passos sem persistência
  > durável: se o operador fecha a aba ou o re-ADD client-side falha, cadastro e painel divergem
  > sem ninguém para reconciliar. Não há fila server-side de "compensação pendente".

- **Melhoria Proposta**
  > Substituir a sequência DELETE→ingest→on-fail-re-ADD do `clientes-filtro/page.tsx` por um
  > endpoint server-side único `POST /permutas/cliente-filtro/:pesCod/remover-com-reroteamento`
  > que, dentro de uma única transação no servidor (tactic: Atomic Transaction +
  > Compensating Transaction), faz: `SOFT-DELETE` (marca `ativo=false` em vez de hard-delete) →
  > dispara ingest síncrono → em falha, marca `pending_compensation=true` em vez de re-ativar
  > client-side. Um job reaper varre `pending_compensation=true` e retenta.

- **Resultado Esperado**
  > Compensação durável: 1 fonte de verdade no servidor; UI passa a apenas refletir o estado.
  > Métrica: divergências cadastro × painel observadas → 0; tempo médio de reconciliação após
  > falha de ingest → minutos (job reaper) vs. "depende do operador" hoje.

- **Tactic alvo**: Compensating Transaction; Atomic Transaction
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-6
- **Métricas de sucesso**:
  - Saga client-side em `clientes-filtro/page.tsx`: 1 (atual) → 0 (alvo)
  - Endpoints servidor com compensação durável: 0 → 1
  - Tabela / coluna `pending_compensation`: ausente → presente em `cliente_filtro`
- **Risco de não fazer**: Em Fase 3, mesma topologia client-side aplicada a fluxos de baixa real
  vira P0 — permuta executada com roteamento que o cadastro acha que removeu.
- **Dependências**: card `fault-tolerance-3` (reaper) deve existir antes para fechar o loop.

### [fault-tolerance-2] Envelopar `AlocacaoPermutasService.alocar` em transação + lock por invoice

- **Problema**
  > `alocar` faz 4 reads (1 SELECT + 3 chamadas Conexos + 2 SUMs) seguidos de 1 UPSERT, tudo sem
  > `withTransaction`. Dois analistas alocando contra a mesma invoice ao mesmo tempo podem
  > exceder o saldo (race-condition entre `sumByInvoice` e `upsertAlocacao`).

- **Melhoria Proposta**
  > Envelopar a fase "validar saldo + upsert" em `withTransaction` (tactic: Atomic Transaction) +
  > advisory lock por `invoiceDocCod` derivado de hash djb2 (mesma técnica já usada para
  > Idempotency-Key da eleição) para serializar alocações concorrentes na MESMA invoice.
  > Tocar `AlocacaoPermutasService.ts:167-284` e talvez adicionar
  > `PermutaAlocacaoRepository.upsertAlocacaoTx(tx, ...)`.

- **Resultado Esperado**
  > Σ por invoice nunca excede saldo, mesmo sob concorrência. Teste de carga com 10 requests
  > paralelos na mesma invoice → no máximo 1 sucesso, demais retornam 422 ou esperam.

- **Tactic alvo**: Atomic Transaction; Mutual Exclusion
- **Severidade**: P1 hoje, P0 quando Fase 3 ligar write-back
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - Caminhos mutativos sem `withTransaction`: 1 (atual) → 0
  - Testes de concorrência: 0 → 1 (10 paralelos contra mesma invoice)
- **Risco de não fazer**: Over-allocation silenciosa; quando Fase 3 chegar = baixa dupla.
- **Dependências**: nenhuma.

### [fault-tolerance-3] Job reaper para runs de ingestão "stuck"

- **Problema**
  > Nenhum job varre `permuta_eleicao_run.started_at < now() - 30min AND finished_at IS NULL`
  > para marcar runs órfãs como `error`. Em deploy mid-run / OOM, a trilha de auditoria mostra
  > "em andamento" indefinidamente.

- **Melhoria Proposta**
  > Adicionar `src/backend/jobs/reap-stuck-runs.ts` que executa
  > `UPDATE permuta_eleicao_run SET status='error', finished_at=now(), error_message='reaped: stuck > 30min' WHERE finished_at IS NULL AND started_at < now() - interval '30 minutes'`.
  > Agendar no GitHub Actions cron a cada 15min. Tactic: Stuck-State Reaper / Condition Monitoring.

- **Resultado Esperado**
  > Runs órfãs detectadas e fechadas dentro de ≤45 min do crash. Trilha de auditoria (`GET /permutas/runs`) consistente: status final sempre `success` ou `error`.

- **Tactic alvo**: Stuck-State Reaper; Condition Monitoring
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - Jobs reaper existentes: 0 → 1
  - Runs com `finished_at IS NULL AND started_at < now() - 1h`: tendência observável → 0
- **Risco de não fazer**: Auditoria suja; suspeita acumulativa nos logs de prod.
- **Dependências**: nenhuma.

### [fault-tolerance-4] Estender Idempotency-Key aos demais POSTs mutativos (`/ingestao`, `/cliente-filtro`, `/alocacoes`, `/processar`)

- **Problema**
  > Só `/permutas/eleicao` honra Idempotency-Key. Duplo-clique / retry de fetch / replay de
  > Service Worker em `/ingestao`, `/alocacoes` ou `/processar` pode sobrescrever observação ou
  > valorAlocado já gravado. Hoje a invariante é entity-level (UPSERT por chave natural), o que
  > basta para "mesmo payload" mas não para "mesma intenção, payload mudou no retry".

- **Melhoria Proposta**
  > Generalizar `permuta_eleicao_idempotency` para uma tabela `idempotency_request` (chave: `key + endpoint`, TTL 24h) e adicionar middleware Express que: 1) lê `Idempotency-Key`; 2) se já existe, devolve a resposta gravada; 3) senão, executa handler e GRAVA a resposta antes de retornar. Aplicar nos 4 endpoints. Tactic: Idempotent Replay request-level.

- **Resultado Esperado**
  > Todos os POST/DELETE mutativos do PR #4 são request-idempotentes. Retry de uma requisição que já foi processada devolve a MESMA resposta, sem efeito colateral.

- **Tactic alvo**: Idempotent Replay
- **Severidade**: P1 hoje, P0 antes da Fase 3
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - Endpoints com Idempotency-Key honrada: 1/5 (20%) → 5/5 (100%)
  - Tabela `idempotency_request`: ausente → presente
- **Risco de não fazer**: Bloqueia a Fase 3 (write-back `fin010`); double-execution é P0 nesse contexto.
- **Dependências**: nenhuma (mas precede a Fase 3).

### [fault-tolerance-5] Consolidar `IngestaoPermutasService.executar` em UMA transação OU correlacionar runs explicitamente

- **Problema**
  > `persistIngestRun` (relacional) e `snapshotRepository.persistRun` (snapshot back-compat) rodam
  > em transações distintas — sem chave de correlação obrigatória entre os dois `runId`s além do
  > `flow_id`. Janela de tempo entre os dois commits gera divergência `/gestao` vs. `/painel` em
  > caso de crash.

- **Melhoria Proposta**
  > Opção A (preferida): mover o snapshot pra DENTRO da mesma transação do `persistIngestRun`,
  > reusando o `runId` (escreve dois cabeçalhos `permuta_eleicao_run` com `kind in ('ingest','snapshot')`
  > apontando ao mesmo `flow_id`/UUID). Opção B: gravar `snapshot_run_id` no cabeçalho do `ingest`
  > como FK referenciando o cabeçalho snapshot, e validar invariante "tem snapshot ⇔ ingest
  > commitado" via reaper. Preferir A — mais simples e atômica.

- **Resultado Esperado**
  > Crash mid-execução nunca deixa `/gestao` fresco com `/painel` stale. Métrica observável:
  > entre runs consecutivas, `MAX(snapshot.finished_at) - MAX(ingest.finished_at)` é zero (mesma
  > tx) ou ≤ 1s.

- **Tactic alvo**: Atomic Transaction
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - Transações por ingestão: 2 → 1
  - Drift `/gestao` vs. `/painel` em crash test: observado → 0
- **Risco de não fazer**: Telas divergentes em incidente; analista decide com base na tela errada.
- **Dependências**: nenhuma.

### [fault-tolerance-6] Adicionar reconciliação periódica local ↔ Conexos `fin010` (gate da Fase 3)

- **Problema**
  > Não há job que confronte o que está em `permuta_alocacao` / `permuta_casamento` com a verdade
  > do `fin010` (Conexos). Hoje (READ-ONLY) o impacto é nulo, mas a Fase 3 (write-back) não pode
  > entrar em produção sem isso — divergência silenciosa = baixa dupla, dashboard mentiroso.

- **Melhoria Proposta**
  > Criar `src/backend/jobs/reconcile-permutas.ts` executado diariamente: para cada alocação
  > com `executada_em IS NOT NULL` (campo a criar na Fase 3), reler o `fin010` da invoice e do
  > adto e verificar se há registro de baixa correspondente; divergência → criar linha em
  > `divergencia_reconciliacao` (a criar) com `tipo in ('local_sem_erp', 'erp_sem_local',
  > 'valor_divergente')` para o analista resolver. Tactic: External↔Local Reconciliation.

- **Resultado Esperado**
  > Toda divergência permanente entre local e ERP é visível em ≤24h. Job exit code = nº divergências
  > para alertas. Pré-requisito de produção para Fase 3.

- **Tactic alvo**: External↔Local Reconciliation
- **Severidade**: P1 hoje, P0 antes da Fase 3
- **Esforço estimado**: L (1–2sem)
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - Jobs de reconciliação: 0 → 1
  - Tabela `divergencia_reconciliacao`: ausente → presente
- **Risco de não fazer**: Fase 3 não pode subir; quando subir sem isso, expõe Columbia a baixas
  duplas silenciosas e auditoria fica cega.
- **Dependências**: Definição das chaves canônicas no `fin010` (modelar via `/feature-new`).

### [fault-tolerance-7] Quarentenar invoices com falha de detalhe (espelhar `DETAIL_INDISPONIVEL`)

- **Problema**
  > Em `EleicaoPermutasService.ts:478` e `:721-723`, falha no `listTitulosAPagar` da INVOICE é
  > silenciada com `catch {}` — sem motivo nomeado, sem telemetria, invoice aparece sem valor
  > negociado. A PROFORMA tem tratamento explícito (`DETAIL_INDISPONIVEL`); a invoice não.

- **Melhoria Proposta**
  > Adicionar `MOTIVO_BLOQUEIO.INVOICE_DETAIL_INDISPONIVEL` e roteamento equivalente ao da
  > proforma: invoice cuja com308 falhar fica num estado "quarentenado nomeado" em vez de
  > silenciada. Emitir contador `business_warn` no `logService`. Tactic: Quarantine; Detect
  > Faults.

- **Resultado Esperado**
  > Cascata Conexos→com308 fora do ar fica visível em logs e na tela. Analista vê motivo claro;
  > não confunde "valor undefined porque com308 fora" com "valor undefined porque a invoice é
  > nova".

- **Tactic alvo**: Quarantine; Sanity Checking
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - Catch silencioso em path de hidratação financeira: 5 → ≤2 (manter só onde o impacto é estético)
  - Motivos de bloqueio nomeados para falha externa: 1 → ≥2
- **Risco de não fazer**: Incidente "tudo aparece vazio" demora pra ser detectado em produção.
- **Dependências**: nenhuma.

### [fault-tolerance-8] Tabela `audit_event` cross-entidade

- **Problema**
  > Cada entidade carrega seu campo de "quem" + `updated_at`, mas não há trilha unificada que
  > responda "tudo que aconteceu com o adto X em ordem cronológica" sem UNION ALL de 4 tabelas.
  > Investigar incidente vira arqueologia.

- **Melhoria Proposta**
  > Criar migration `0015_audit_event` com (id uuid, entity_type, entity_key, actor, action,
  > payload jsonb, occurred_at) e helper `AuditService.record({entityType, key, actor, action,
  > payload})` chamado em CADA mutação (UPSERT cliente-filtro, upsert alocação, upsert
  > processamento, executar ingestão, executar eleição). Gravar dentro da mesma transação da
  > mutação. Tactic: Audit Trail.

- **Resultado Esperado**
  > Query única `SELECT * FROM audit_event WHERE entity_key = $1 ORDER BY occurred_at`
  > reconstitui história completa de qualquer adto/invoice/cliente-filtro. Insumo obrigatório
  > para compliance e diagnóstico de Fase 3.

- **Tactic alvo**: Audit Trail
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-8
- **Métricas de sucesso**:
  - Tabela `audit_event`: ausente → presente
  - Callsites mutativos com record audit: 0 → 100% (5+ pontos)
- **Risco de não fazer**: Investigação de incidente em prod fica lenta; compliance demanda trilha
  unificada quando a Fase 3 entrar.
- **Dependências**: nenhuma; preferencialmente antes da Fase 3.

## 6. Notas do agente

- Score 6.5 reflete a postura defensiva já MUITO mais madura que a média de PRs iniciais: idempotência
  request-level + advisory lock + UPSERT-por-chave-natural + ROLLBACK em ingestão + AbortController
  cooperativo + Quarantine nomeado para proforma. O ponto fraco está concentrado em (a) compensação
  cliente-side frágil para cliente-filtro, (b) `AlocacaoPermutasService.alocar` sem `withTransaction`,
  e (c) ausência de reaper/reconciliação — todos resolvíveis antes da Fase 3.
- Cross-QA: Idempotency-Key + timeout overlap com **availability** e **performance**; audit-trail
  overlap com **security**; reaper/reconciliação overlap com **testability** (cobertura de cenários
  de reprocesso). Alertar consolidator para deduplicar cards `fault-tolerance-3` / `fault-tolerance-4`
  / `fault-tolerance-8` se houver equivalentes em outros QAs.
- Métrica `notify.error` (item F das instruções) atingida em 100% das mutações do PR #4 — único QA
  desta run em que o frontend não tem gap.
- "Permuta executada duas vezes no `fin010`" é zero-por-construção hoje (Fase 3 ainda não existe),
  mas explicitar como gate-de-prod da Fase 3 nos cards 4 e 6 é a forma de transformar esse "zero por
  inação" em "zero por design".
