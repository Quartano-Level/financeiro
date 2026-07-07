---
qa: Availability
qa_slug: availability
run_id: 2026-07-07-1841-sispag-painel-montagem
agent: qa-availability
generated_at: 2026-07-07T18:55:00-03:00
scope: backend
score: 6
findings_count: 8
cards_count: 6
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG Painel+Montagem)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (upstream único) + Postgres Supabase (estado local) + analista concorrente (2ª sessão) | (a) 1 das ~7 filiais responde 5xx/timeout durante o fan-out do painel (leitura live de fin064+fin015+fin010); (b) Conexos rejeita a re-leitura pontual (`getTituloAPagar`) durante `incluirTitulo`; (c) 2 analistas incluem títulos em paralelo no mesmo lote; (d) pool PG saturado por várias inclusões pendentes com Conexos lento | `SispagPainelService.montarPainel` (fan-out 3×N filiais) + `LotePagamentoService.incluirTitulo` (advisory-lock + tx + Conexos re-read) + `ConexosSispagClient` (leituras fin064/fin015/fin010) — TUDO read-only ao ERP; escritas apenas em `lote_pagamento`/`lote_pagamento_item` no Postgres local | Produção single-tenant (Render starter, 1 worker, pool PG max=5, Conexos Cloud externo com timeout 40s). Sem scheduler, sem writeback ao ERP (I1). | (a) painel devolve dados das filiais que responderam, ignorando as que caíram (`Promise.allSettled` per-filial + `logService.warn`); (b) `incluirTitulo` falha 500 e o operador retenta (o lote continua RASCUNHO íntegro); (c) advisory-lock por `(filCod:docCod:titCod)` serializa a inclusão do mesmo título — `LoteVersaoConflitoError` (409) na 2ª tentativa; (d) demais rotas competem por conexão do pool durante os ~40s de espera Conexos por inclusão. | 0% de escrita indevida no ERP (I1 mantido — inexistem writes de Conexos nesta fatia); 0% de estado local corrompido (transação + optimistic version). Falha silenciosa aceitável **apenas** enquanto painel só serve consulta; risco de decisão em cima de dado parcial subvalorizado por não haver flag `partial=true` na resposta. |

Cenário secundário 1 (silent partial data — NOVO nesta feature): 6 das 7 filiais falham na leitura de `fin064` mas 1 responde — o painel retorna 200 OK com uma seleção enviesada de títulos e KPIs subestimados, e o operador não vê nenhum indicador na UI de que ~85% do dataset está faltando. O log `SISPAG: leitura de filial falhou (ignorada no painel)` só chega no stdout do Render.

Cenário secundário 2 (pool starvation): 5 analistas concorrentes clicam "Criar lote (N)" — o `criarLoteComSelecionados` no front dispara N POSTs sequenciais por analista → cada POST segura 1 conexão do pool durante a re-leitura Conexos (~40s worst-case) enquanto detém o advisory lock. Pool max=5 = 5 conexões ocupadas ⇒ próximas requests aguardam `connectionTimeoutMillis=5000ms` e ficam 500. `GET /sispag/painel` (não usa pool) escapa; `GET /sispag/lotes` NÃO escapa.

Cenário secundário 3 (truncamento silencioso): `listTitulosAPagar` usa `listGenericPaginated` com pageSize=1000 mas o adapter faz **um único** POST — sem walker. Filial com >1000 títulos na janela [-15d, +45d] tem o excedente descartado sem alerta. Colide com o `TITULOS_CAP=400` do serviço (o corte é anunciado, mas o do wire não).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Leituras SISPAG do Conexos envoltas em `RetryExecutor` / `runWithRetry` | 0/3 (`listTitulosAPagar`, `listLotes`, `listBorderosAPagar` chamam `this.base.listGenericPaginated` direto — sem retry) | 3/3 (paridade com `ConexosTitulosClient`/`ConexosCadastroClient` que envolvem em `runWithRetry` ou `paginate`) | ❌ | `ConexosSispagClient.ts:122-134,169-172,198-201,229-232`; vs. `ConexosTitulosClient.ts:170,280`; `ConexosCadastroClient.ts:74,86,152,170,212` |
| Leitura pontual `getTituloAPagar` (usada no `incluirTitulo`) envolta em retry | 0/1 — chamada direta em `LotePagamentoService.ts:87-91` | 1/1 (transiente Conexos = 500 no include, exigindo retry do operador) | ❌ | `LotePagamentoService.ts:87-91`; `ConexosSispagClient.ts:164-194` |
| Fan-out do painel com tolerância a falha per-filial (`Promise.allSettled`) | ✅ (`gather` no `SispagPainelService`) | continue-on-error obrigatório em fan-out | ✅ | `SispagPainelService.ts:87-105` |
| Sinal para o cliente de "resposta parcial" (X filiais falharam) | 0 (nenhum campo `parcial`/`filiaisAusentes[]`/header `X-Partial`) | ≥1 campo estruturado no `SispagPainelResponse` + banner no front | ❌ | `SispagPainelService.ts:72-83`; `SispagInterface.ts:79-91`; `frontend/lib/sispag.ts:65-76` |
| Paginação real das leituras SISPAG (walker) | 0/3 — todas usam `listGenericPaginated` single-shot (uma página só) | ≥1 walker `paginate` para `fin064` (títulos, maior cardinalidade) | ❌ | `ConexosSispagClient.ts:122-134` (single call); `legacyConexosAdapter.ts:69-82` (não pagina) vs `ConexosBaseClient.paginate` em `TitulosClient.ts:280` |
| Guard de state-machine em transições (rejeita FINALIZAR vazio / reabrir CANCELADO / etc.) | Presente + testado (I5, testes `finalizarLote (gate)` e `reabrir/cancelar`) | obrigatório | ✅ | `LotePagamentoService.ts:183-207,209-221`; `LotePagamentoService.test.ts:176-236` |
| Optimistic concurrency em transições (I6) — 2 analistas concorrentes | Presente + testado (`transicionar` distingue conflito vs. estado inválido relendo) | obrigatório | ✅ | `LotePagamentoService.ts:225-258`; `LotePagamentoRepository.ts:231-258` (UPDATE ... WHERE versao=$versaoEsperada); `LotePagamentoService.test.ts:202-211` |
| Serialização do "mesmo título 2× ao mesmo tempo" via advisory lock (I3) | Presente (`withAdvisoryLock` per `(filCod:docCod:titCod)`) mas o `onBusy` lança `LoteVersaoConflitoError` com `versaoEsperada: -1` — mensagem enganosa ("lote foi alterado por outra pessoa") para uma condição de race no MESMO título | serialização OK; mensagem/erro precisa distinguir race de lock vs. optimistic conflict | ⚠️ | `LotePagamentoService.ts:60-152` (linha 148-150); `LoteVersaoConflitoError.ts:15-22` |
| Conexão pooled PG retida DURANTE a re-leitura Conexos em `incluirTitulo` | ✅ retida — `withAdvisoryLock` segura C1; `getTituloAPagar` (Conexos até ~40s) acontece com o lock preso; `withTransaction` toma C2 depois | não reter conexão fora do que exige serialização (mover a re-leitura para ANTES do lock ou usar advisory-lock **em transação** dedicada só ao insert) | ❌ | `LotePagamentoService.ts:60-152`; `PostgreeDatabaseClient.ts:137-158`; pool `max=5` (`PostgreeDatabaseClient.ts:26`) |
| Snapshot autoritativo do título (anti-drift na inclusão) | Presente — `credor/valor/vencimento` capturados do Conexos no `incluirTitulo` (I2) | obrigatório na fronteira do agregado | ✅ | `LotePagamentoService.ts:86-138`; `LotePagamentoRepository.ts:168-197` |
| Idempotência da inclusão (título já no lote) | Curta-circuita no serviço + `ON CONFLICT DO NOTHING` no repo | dedupe defensivo em dupla camada | ✅ | `LotePagamentoService.ts:81-84`; `LotePagamentoRepository.ts:181-197` (linha 185) |
| Fluxo do front `criarLoteComSelecionados` é atômico (all-or-nothing) | ❌ — loop `for` que chama `POST /itens` por título; se um falha, o lote fica parcialmente preenchido; toast agrega "criado com N; M não entraram" | ≥1 endpoint `POST /lotes/:id/itens:batch` transacional OU fluxo saga documentado | ❌ | `frontend/app/sispag/page.tsx:176-217`; `routes/sispag.ts:117-139` (só singular) |
| Cache/fallback para o painel quando Conexos indisponível | 0 — `montarPainel` só serve dado live; falha de `getFiliais` = 500 do endpoint inteiro | ≥1 fallback (last-good ou stale-while-error) | ❌ | `SispagPainelService.ts:36-84`; nenhum uso de `FallbackExecutor` (ainda não existe no repo — F-availability-8 do run anterior) |
| Job de limpeza de lotes RASCUNHO abandonados (títulos "presos" à UNIQUE de I3) | 0 — nenhum expiration/reaper; RASCUNHO permanece indefinidamente | ≥1 job periódico + endpoint admin de resync | ❌ | `LotePagamentoRepository.ts`; `src/backend/jobs/` (só probes de leitura) |
| Handlers de `SIGTERM`/`SIGINT` (sem regressão desde run anterior — dívida herdada) | 0 | ≥1 | ❌ | `src/backend/index.ts:106-108` |
| Circuit breaker no `ConexosBaseClient` (sem regressão desde run anterior) | 0 | ≥1 | ❌ | `ConexosBaseClient.ts:137-143` |
| `/health` real (probe de DB / prontidão) — sem regressão | Stub estático | Liveness real + `/ready` | ❌ | `src/backend/index.ts:66` |
| APM/telemetria externa (Sentry etc.) — sem regressão | 0 | ≥1 | ❌ | `grep -rn "Sentry" src/backend` → 0 |

> ⚠️ **Não medível localmente**: taxa real de erro por filial em produção (para saber se o cenário "6 de 7 falham" é hipotético ou já aconteceu). Requer stdout do Render agregado por N dias filtrando `SISPAG: leitura de filial falhou`. Recomendação: mover o warn para uma métrica custom (Sentry breadcrumb ou tag `sispag_filial_fallout_rate`) — combina com o card availability-3 do run anterior (Sentry).

> ⚠️ **Não medível localmente**: se algum `fin064` de filial já ultrapassou 1000 títulos na janela (truncamento silencioso). Requer log do `count` retornado pelo `listGenericPaginated` e comparar com `rows.length` — hoje o adapter descarta essa informação (`legacyConexosAdapter.ts:80`). Recomendação: emitir `BUSINESS_WARN` quando `count > rows.length` no path SISPAG.

> ⚠️ **Não medível localmente**: pool PG saturado. O `pg` pool não expõe métrica (`totalCount`/`waitingCount`) em nenhum endpoint. Recomendação: expor `GET /admin/pool-stats` (só admin) OU emitir gauge para o APM.

## 3. Tactics — Cobertura no Financeiro (delta SISPAG)

### Detect Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | Sem regressão (stub `/health`). SISPAG não adiciona probe. | ❌ ausente | `src/backend/index.ts:66` |
| Heartbeat | N/A — SISPAG não tem cron/scheduler nesta fatia (migration-debt O4 documentado). | N/A | `ontology/_inbox/migration-debt.md` |
| Monitor | `SispagPainelService.gather` emite `BUSINESS_WARN` quando uma filial cai; `logService.info` no fim registra contagens. NÃO expõe o WARN ao cliente. Sem agregação externa. | ⚠️ parcial | `SispagPainelService.ts:96-102,61-70` |
| Timestamp | `geradoEm: ISO-8601` no response; `criado_em`/`atualizado_em`/`finalizado_em` na tabela; `X-Request-Id` propagado. | ✅ presente | `SispagPainelService.ts:73`; migrations/0023:24-25,40 |
| Sanity Checking | Zod no boundary do wire (`tituloRowSchema`/`loteRowSchema`/`borderoRowSchema` com `.passthrough()` + coerção tolerante); Zod nos boundaries HTTP (`criarLoteSchema`, `incluirTituloSchema`, `versaoSchema`). Guarda de estado no `finalizarLote` (rejeita lote vazio) e `LoteFilialError` (I4). | ✅ presente | `ConexosSispagClient.ts:26-82`; `routes/sispag.ts:53-67`; `LotePagamentoService.ts:74-79,192-200` |
| Condition Monitoring | Re-leitura autoritativa do título no Conexos antes de gravar (I2 anti-drift, doutrina de Permutas) — o snapshot local nunca é confiável para o gate. | ✅ presente | `LotePagamentoService.ts:86-112` |
| Voting | N/A — Conexos é fonte única. | N/A | — |
| Exception Detection | `respondLoteError` mapeia `HandlerError` (5 tipos: TituloNaoElegivel/TituloEmOutroLote/LoteFilial/LoteVersaoConflito/LoteEstadoInvalido) para 409/422 com `code`/`retryable`/`details`. Sobras caem no `errorMiddleware` central. | ✅ presente | `routes/sispag.ts:41-51,128-138,152-165,189-200`; `domain/errors/Lote*Error.ts`, `Titulo*Error.ts` |
| Self-Test | Sem regressão. `bootstrapAppContainer` é lazy — invocado por-rota via `await bootstrapAppContainer()` em cada handler SISPAG (`routes/sispag.ts:28,73,88,104,121,146,174`). | ❌ ausente | idem run anterior |

### Recover from Faults — Preparation & Repair
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | Sem regressão. Render starter = 1 worker. | ❌ ausente | `render.yaml:10` |
| Passive Redundancy | Sem cache local para o painel SISPAG (contraste: `permuta_bordero` tem cache-refresh em Permutas). Painel fica 100% acoplado ao Conexos live. | ❌ ausente | `SispagPainelService.ts:36-84` |
| Spare | N/A — single-instance. | N/A | — |
| Exception Handling | `asyncHandler` + `errorMiddleware`; `respondLoteError` com códigos tipados; `gather` per-filial engole erro; `criarLoteComSelecionados` no front engole erro por título com toast agregado. | ✅ presente | `routes/sispag.ts:41-51`; `SispagPainelService.ts:91-104`; `frontend/app/sispag/page.tsx:191-217` |
| Rollback | `withTransaction` no `incluirTitulo` cobre insert + `tocarLote` atomicamente. O batch de inclusão vindo do front NÃO é transacional entre chamadas (partial-fill visível no lote). | ⚠️ parcial | `LotePagamentoService.ts:114-140`; `frontend/app/sispag/page.tsx:191-198` |
| Software Upgrade | `preDeployCommand: npm run migrate && npm run seed:admin` cobre a migration 0023 antes do tráfego trocar. | ✅ presente | `render.yaml:21` |
| Retry | `RetryExecutor` está no `PostgreeDatabaseClient` (3× 200ms + jitter, transient patterns) — cobre incidentes do pool. **NÃO** cobre as 3 leituras SISPAG do Conexos nem o `getTituloAPagar` do include: `ConexosSispagClient` chama `this.base.listGenericPaginated` sem `runWithRetry` (paridade perdida com `ConexosTitulosClient`/`ConexosCadastroClient`). | ⚠️ parcial | `PostgreeDatabaseClient.ts:36-43`; `ConexosSispagClient.ts:122,169,198,229`; contraste: `ConexosTitulosClient.ts:170`; `ConexosCadastroClient.ts:74,86` |
| Ignore Faulty Behavior | `gather` ignora falha per-filial (bom); `getTituloAPagar` retorna `null` se não achar (mapeado para `TituloNaoElegivelError`) — não confunde 404 com transitório. | ✅ presente | `SispagPainelService.ts:87-105`; `ConexosSispagClient.ts:164-194` |
| Degradation | Painel NÃO tem modo degradado explícito — sem cache stale, sem banner "sem dados de M filiais", sem TTL configurável. O batch do front avisa "N ok / M falhou" — degradação aceita mas silenciosa no lado do painel. | ⚠️ parcial | `SispagPainelService.ts:36-84`; `frontend/app/sispag/page.tsx:191-217` |
| Reconfiguration | Kill-switch `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` propagados para o response (`modo.conexosWriteEnabled`/`conexosDryRun`) — sem write nesta fatia, o kill-switch NÃO desabilita as leituras (esperado). | ⚠️ parcial | `SispagPainelService.ts:75-78`; `render.yaml:37-40` |

### Recover from Faults — Reintroduction
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | I1 = SISPAG inteiro é shadow de facto (nenhuma escrita no ERP); painel `modo.somenteLeitura: true` é o marcador. | ✅ presente | `SispagPainelService.ts:74-78`; `routes/sispag.ts:13-21` |
| State Resynchronization | O `incluirTitulo` re-lê o título no Conexos toda vez (não confia no snapshot) — resincroniza antes de gravar. Sem job periódico para varrer RASCUNHO velho (cf. F-availability-10 do run anterior generalizado para SISPAG). | ⚠️ parcial | `LotePagamentoService.ts:86-112` |
| Escalating Restart | Sem regressão. Ainda não há `process.on('SIGTERM')` → deploy em `incluirTitulo` derruba a tx (rollback OK) mas o operador vê 500. | ❌ ausente | `src/backend/index.ts:106-108` |
| Non-Stop Forwarding | N/A. | N/A | — |

### Prevent Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | Nenhum breaker (sem regressão). Painel expõe TODAS as filiais mesmo se uma tem histórico de instabilidade — não há blacklist por filial. | ❌ ausente | `SispagPainelService.ts:36-53` |
| Transactions | `withTransaction` no include cobre insert + `tocarLote` atomicamente; `transicionarStatus` é UPDATE atômico com WHERE optimistic. | ✅ presente | `LotePagamentoService.ts:114-140`; `LotePagamentoRepository.ts:231-258` |
| Predictive Model | 0 (sem regressão). | ❌ ausente | — |
| Exception Prevention | Zod no wire, guards de estado no serviço, `LoteFilialError` na fronteira do agregado, `TituloEmOutroLoteError` antes do insert, UNIQUE `(lote_id, fil_cod, doc_cod, tit_cod)` no DB como cinto-e-suspensório da idempotência. | ✅ presente | `ConexosSispagClient.ts:26-82`; `LotePagamentoService.ts:73-125`; migrations/0023:42 |
| Increase Competence Set | Documentação ADR-0015, state-machine em `ontology/state-machines/lote-pagamento.md`, banner UI "Montagem local — sem escrita no ERP" (`frontend/app/sispag/page.tsx:249-263`). Sem runbook para o cenário "painel mostrando parcial". | ⚠️ parcial | `ontology/decisions/0015-sispag-painel-montagem.md`; `frontend/app/sispag/page.tsx:249-263` |

## 4. Findings (achados)

### F-availability-sispag-1: Leituras SISPAG do Conexos SEM retry (paridade perdida com os outros sub-clients)

- **Severidade**: P1
- **Tactic violada**: Retry, Exception Prevention
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:122,169,198,229`; `src/backend/domain/service/sispag/LotePagamentoService.ts:87-91`
- **Evidência (objetiva)**:
  ```ts
  // ConexosSispagClient.ts:122 (listTitulosAPagar) — chamada direta, sem runWithRetry
  const res = await this.base.listGenericPaginated<Record<string, unknown>>(
      'fin064/list',
      this.listBody('fin064', filtered, 1000),
      { filCod },
  );

  // Contraste — ConexosTitulosClient.ts:170 (com298/financeiroAPagar/list)
  return await this.base.runWithRetry(async () => {
      await this.base.ensureSid();
      return this.base.listGeneric<Envelope>(serviceName, body, { filCod });
  });
  ```
  Comando: `grep -n "runWithRetry" src/backend/domain/client/ConexosSispagClient.ts` → **0 ocorrências**.
- **Impacto técnico**: Um 502/504 transiente do Conexos em qualquer das 3 leituras do painel (fin064/fin015/fin010) OU no `getTituloAPagar` do include falha imediatamente sem retry. Como o painel fan-outs 3×N filiais em paralelo (`Promise.all` + `Promise.allSettled`), a probabilidade de ao menos uma filial falhar cresce linearmente com N — o painel entrega dados parciais silenciosos (F-2 abaixo). No include, cada 5xx transiente vira 500 no navegador do operador e retrabalho manual.
- **Impacto de negócio**: Painel SISPAG (Fatia 1) é a base para a decisão de montagem do lote (o que a analista SELECIONA sai daqui). Um transiente aumenta a chance de decisão baseada em subset silencioso. Custo estimado: 1 janela de instabilidade Conexos de 5min pode fazer o painel omitir de 1 a 6 filiais → analista monta lote sem ver X títulos que estavam a vencer nas outras filiais.
- **Métrica de baseline**: 0/3 leituras SISPAG envoltas em retry; contraste: 2/2 leituras críticas de `ConexosTitulosClient` envoltas; 3/3 leituras de `ConexosCadastroClient`; 4/4 leituras de `ConexosFinanceiroClient` (via `paginate` que já embute retry).

### F-availability-sispag-2: Painel entrega "parcial silencioso" — sem sinal ao cliente de quais filiais faltam

- **Severidade**: P1
- **Tactic violada**: Monitor, Degradation (feedback ao usuário), Exception Detection (granularidade cliente-visível)
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:36-105`; `src/backend/domain/interface/sispag/SispagInterface.ts:79-91`; `src/frontend/app/sispag/page.tsx:302-339`
- **Evidência (objetiva)**:
  ```ts
  // SispagPainelService.ts:96-102 — WARN só vai para o stdout
  await this.logService.warn({
      type: LOG_TYPE.BUSINESS_WARN,
      message: 'SISPAG: leitura de filial falhou (ignorada no painel)',
      data: { reason: ... },
  });
  ```
  ```ts
  // SispagInterface.ts:79-91 — o response NÃO carrega nenhum indicador de parcial
  export interface SispagPainelResponse {
      geradoEm: string;
      modo: { somenteLeitura: true; conexosWriteEnabled: boolean; conexosDryRun: boolean };
      kpis: SispagKpis;
      titulos: TituloAPagar[];
      lotes: LoteSispag[];
      borderos: BorderoAPagar[];
  }
  ```
  O front (`page.tsx:302-339`) só distingue `loading` × `error` × `painel` — não há caminho de renderização de "painel com N filiais ausentes".
- **Impacto técnico**: MTTD (Mean Time To Detect) de "6 de 7 filiais estão fora" ≈ tempo que o operador leva para desconfiar que os KPIs estão baixos demais. O log fica no stdout do Render (sem search, sem alerta — herda F-availability-3 do run anterior). O painel devolve 200 OK indistinguível de "tudo OK".
- **Impacto de negócio**: A analista pode montar um lote SEM ver que 6 filiais não carregaram, subestimando o volume a pagar. Como o lote é RASCUNHO (I1, sem write ao ERP), o dano é reversível — mas a decisão sobre em QUE filiais focar a rodada do dia usa o painel como fonte, e KPIs errados por falta de filial distorcem essa decisão.
- **Métrica de baseline**: 0 campos no `SispagPainelResponse` que sinalizem parcial; 0 renders de banner de degradação no front; 3 fan-outs × N filiais = 21 chances de "queda silenciosa" por request (para N=7).

### F-availability-sispag-3: `incluirTitulo` segura conexão do pool PG durante a re-leitura Conexos (~40s worst-case)

- **Severidade**: P1
- **Tactic violada**: Ignore Faulty Behavior (contenção de recurso), Removal from Service (do pool sob backpressure)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:60-152`; `src/backend/domain/client/database/PostgreeDatabaseClient.ts:137-158,26`
- **Evidência (objetiva)**:
  ```ts
  // LotePagamentoService.ts:60-112 — advisory lock segura conexão do pool durante Conexos read
  return this.db.withAdvisoryLock(
      lockKey,
      async () => {
          const lote = await this.exigirLote(input.loteId);    // usa pool (C2 rápido)
          if (lote.status !== LOTE_STATUS.RASCUNHO) { ... }
          if (lote.filCod !== input.filCod) { ... }
          if (lote.itens.some(...)) return lote;
          // A LINHA ABAIXO SEGURA C1 DURANTE ATÉ 40s+ (timeout do axios Conexos)
          const titulo = await this.conexos.getTituloAPagar(
              input.filCod, input.docCod, input.titCod,
          );
          ...
          await this.db.withTransaction(async (tx) => { /* insert */ });
      },
      async () => { throw new LoteVersaoConflitoError(...); },
  );
  ```
  Pool config: `PostgreeDatabaseClient.ts:26` → `poolMaxConnections = 5`. `withAdvisoryLock` (`:145-157`) segura o `PoolClient` até o `onAcquired` retornar.
- **Impacto técnico**: 5 analistas concorrentes clicando "Criar lote (N)" no front (`page.tsx:191-217` faz loop sequencial de N POSTs por analista) ⇒ até 5 conexões do pool ocupadas por 40s cada em Conexos lento. `GET /sispag/lotes`, `POST /sispag/lotes/:id/finalizar` e QUALQUER outra rota que use pool aguarda `connectionTimeoutMillis=5000ms` e retorna 500. Painel escapa (não usa pool). Pior caso teórico: `5 × 40s = 200s` de janela em que o resto do backend pisca 500 para outros usuários.
- **Impacto de negócio**: Reunião de fechamento diário do financeiro (2–4 analistas trabalhando em paralelo) fica frágil a slowdown do Conexos — uma inclusão lenta trava todas as outras rotas SISPAG e (potencialmente) rotas Permutas que compartilham o pool.
- **Métrica de baseline**: pool max=5; timeout Conexos=40s; timeout de aquisição=5s; janela teórica de starvation por include = ~40s por conexão retida; N concurrent includes → todos os outros PG-callers ficam 5s pendurados antes de 500.

### F-availability-sispag-4: `onBusy` do advisory lock lança `LoteVersaoConflitoError` com mensagem enganosa

- **Severidade**: P2
- **Tactic violada**: Exception Detection (mensagem errada de erro), Increase Competence Set (mensagem confunde o operador)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:147-151`; `src/backend/domain/errors/LoteVersaoConflitoError.ts:15-22`
- **Evidência (objetiva)**:
  ```ts
  // LotePagamentoService.ts:147-151 — onBusy do advisory lock (2 analistas incluindo o MESMO título)
  async () => {
      // Outro processo inclui o MESMO título agora — peça retry.
      throw new LoteVersaoConflitoError({ loteId: input.loteId, versaoEsperada: -1 });
  },
  ```
  ```ts
  // LoteVersaoConflitoError.ts:22 — userMessage genérica
  this.userMessage = 'Este lote foi alterado por outra pessoa. Recarregue e tente de novo.';
  ```
  A condição real é "outra requisição está incluindo o MESMO título AGORA — o advisory lock está ocupado". O erro sugere `versao` conflitante (a versão realmente enviada pelo cliente pode estar correta) e diz "recarregue" quando bastaria "aguarde 1s e retente".
- **Impacto técnico**: Analista recebe 409 com mensagem "lote foi alterado" e recarrega — o retry manual demora e ainda pode dar novo 409 se a outra sessão ainda estiver segurando o lock. O código HTTP 409 + `retryable: true` está OK; a mensagem/`code` misturam dois casos diferentes (optimistic conflict × lock race no mesmo título).
- **Impacto de negócio**: UX confusa em cenário de 2 analistas cooperando. Não corrompe estado.
- **Métrica de baseline**: 1 tipo de erro (`LoteVersaoConflitoError`) para 2 condições distintas (optimistic conflict + lock-busy race); 0 códigos de erro específicos para "lock ocupado".

### F-availability-sispag-5: Fluxo `criarLoteComSelecionados` não é atômico — partial-fill do lote sem sinalização

- **Severidade**: P2
- **Tactic violada**: Rollback (entre chamadas), Degradation
- **Localização**: `src/frontend/app/sispag/page.tsx:176-217`; `src/backend/routes/sispag.ts:100-139` (só singular)
- **Evidência (objetiva)**:
  ```ts
  // page.tsx:191-198
  const lote = await criarLote({ filCod })
  let ok = 0
  const falhas: string[] = []
  for (const t of selTitulos) {
      try {
          await incluirTitulo(lote.id, { filCod: t.filCod, docCod: t.docCod, titCod: t.titCod })
          ok += 1
      } catch (e) {
          falhas.push(`${t.docCod}/${t.titCod}: ${e instanceof Error ? e.message : 'erro'}`)
      }
  }
  ```
  Loop **sequencial**, não transacional. Se a analista seleciona 40 títulos e o 5º falha por Conexos slow (F-1), o lote fica com 4 títulos e 36 pendentes; o toast diz "criado com 4; 36 não entraram" — as 36 tentativas seguintes ainda vão rodar depois do primeiro fail? Sim, pois o `try/catch` está DENTRO do loop — cada uma tenta. Mas as 36 acessam Conexos sequencialmente (F-1 amplifica) e podem levar >1min.
- **Impacto técnico**: (a) tempo total do include batch = N × latência-per-include (série). Sem paralelismo. Para N=40 títulos e Conexos p50 de 500ms = 20s de UX de "loading"; p95 de 3s = 2min. (b) `LoteVersaoConflitoError` no include Nº k+1 é razoavelmente comum se outro analista tocou o mesmo lote — o versão que o front tem já está velha; nada rehidrata a versão entre inclusões porque o include NÃO usa versão (só o gate finalizar/reabrir/cancelar usa).
- **Impacto de negócio**: 30% de chance de N=40 títulos ficar parcial em janela de Conexos lento — a analista fica ambígua sobre o que sobrou. Pior no fim do dia (última rodada, mais pressão).
- **Métrica de baseline**: 0 endpoints batch (`POST /lotes/:id/itens:batch`); latência esperada para batch N=40 = N × 500ms = 20s p50; 0% rollback em partial-fail (títulos incluídos ficam).

### F-availability-sispag-6: Sem cache/fallback para o painel — falha do Conexos = tela 500 completa

- **Severidade**: P2
- **Tactic violada**: Passive Redundancy, Degradation (last-good), Fallback
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:36-84`; `src/frontend/app/sispag/page.tsx:302-339`
- **Evidência (objetiva)**: `montarPainel` chama `getFiliais()` primeiro; se essa chamada lança (Conexos totalmente fora), o handler devolve 500 (via `errorMiddleware`), o front renderiza `EmptyState` "Não foi possível carregar". Nenhum cache local em `permuta_bordero`-style; nenhum "stale-while-error"; nenhum `FallbackExecutor` (a primitiva ainda não existe no repo — F-availability-8 do run anterior).
- **Impacto técnico**: Painel indisponível pelo tempo inteiro em que Conexos estiver fora. Como painel também é o entrypoint para "ver lotes candidatos" (aba "Lotes candidatos" na mesma página), a inteira UI de SISPAG fica dark durante incidente Conexos, mesmo o lote sendo local.
- **Impacto de negócio**: Analista não consegue nem revisar lotes RASCUNHO já montados (que estão no Postgres local, não dependem do Conexos) porque a página inteira monta em cima do painel live.
- **Métrica de baseline**: 0 fallbacks configurados para `/sispag/painel`; 0 rotas separadas para "aba lotes candidatos apenas Postgres".

### F-availability-sispag-7: Truncamento silencioso em `listGenericPaginated` (single-page) — filial com >1000 títulos perde stragglers

- **Severidade**: P2
- **Tactic violada**: Sanity Checking (não valida `count` vs. `rows.length`), Monitor
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:122-134,198-201,229-232`; `src/backend/domain/client/legacyConexosAdapter.ts:69-82`
- **Evidência (objetiva)**:
  ```ts
  // ConexosSispagClient.ts:122-134 (listTitulosAPagar) — 1 página só; se count > 1000, dropa o excedente
  const res = await this.base.listGenericPaginated<...>(
      'fin064/list',
      this.listBody('fin064', filtered, 1000),   // pageSize=1000
      { filCod },
  );
  rows = res.rows;   // não usa res.count, não pagina
  ```
  ```ts
  // legacyConexosAdapter.ts:69-82 — pega UMA página só, retorna { count, rows } mas caller ignora count
  const listGenericPaginated = async <Row>(...) => {
      const data = await conexosService.authenticatedPost<{ count?: number; rows?: Row[] }>(...);
      const rows = ...;
      const count = ...;
      return { count, rows };
  };
  ```
  Contraste: `ConexosBaseClient.paginate` (linha 222-280) faz walker até `pageSize > rows` ou `count`.
- **Impacto técnico**: Se em algum ambiente Columbia uma filial acumular >1000 títulos abertos na janela [-15d, +45d], o excedente é silenciosamente omitido do painel. Nenhum log de cap-hit. Compõe com F-2 (silent partial).
- **Impacto de negócio**: Baixa probabilidade hoje (Columbia tem ~7 filiais e o funil sispag no probe indicou dezenas por filial, não milhares). Vira alto quando escalar cliente (mesma app rodando em cliente maior). Debt tem que ser rastreável.
- **Métrica de baseline**: `count` retornado pelo adapter está disponível (`legacyConexosAdapter.ts:80`) mas descartado pelo caller SISPAG; 0 warns emitidos quando `count > rows.length`.

### F-availability-sispag-8: Sem reaper de lotes RASCUNHO abandonados — títulos "presos" à UNIQUE I3

- **Severidade**: P3
- **Tactic violada**: State Resynchronization, Monitor
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts` (sem método de listagem por idade / status stale); `src/backend/jobs/` (só probes de leitura, nada periódico)
- **Evidência (objetiva)**:
  ```bash
  $ grep -rn "listReconciling\|findStale\|reaper\|expiration" src/backend --include='*.ts'
  # 0 ocorrências no path SISPAG
  ```
  A UNIQUE de I3 (`loteRascunhoComTitulo` em `LotePagamentoRepository.ts:152-166`) impede o mesmo título entrar em 2 RASCUNHOS. Se a analista abandona um RASCUNHO (fecha o browser, muda de rodada, esquece), aqueles títulos ficam bloqueados até alguém `cancelarLote` explicitamente ou eles serem removidos. Sem reaper automático.
- **Impacto técnico**: Baixo — o operador só percebe quando tenta incluir um título em um novo lote e leva `TituloEmOutroLoteError` (`422`) com mensagem clara ("já está no lote X"). A recuperação é manual: abrir X, remover ou cancelar.
- **Impacto de negócio**: Ruído operacional. Vira P2 se o time crescer para 4+ analistas concorrentes (chance maior de RASCUNHO abandonado).
- **Métrica de baseline**: 0 jobs de reaper; 0 endpoints admin `POST /sispag/lotes/gc`; TTL implícito = infinito.

## 5. Cards Kanban

### [availability-sispag-1] Envolver leituras SISPAG em `runWithRetry` (paridade com Titulos/Cadastro/Financeiro sub-clients)

- **Problema**
  > As 3 leituras do painel SISPAG (`listTitulosAPagar`/`listLotes`/`listBorderosAPagar`) e a re-leitura pontual `getTituloAPagar` chamam `this.base.listGenericPaginated` direto — sem `runWithRetry`. Todos os outros sub-clients Conexos (Titulos/Cadastro/Financeiro) envolvem leituras em retry via `runWithRetry`/`paginate`. Um 502/504 transiente vira 500 no painel e no include, e o fan-out multi-filial amplifica a chance de "queda silenciosa".

- **Melhoria Proposta**
  > Adicionar `this.base.runWithRetry(async () => { await this.base.ensureSid(); return this.base.listGenericPaginated(...); })` em torno de cada uma das 4 chamadas no `ConexosSispagClient` (`:122,169,198,229`). Alternativa mais idiomática: consumir o `paginate` do `ConexosBaseClient` (já embute retry + walker de páginas), matando dois findings juntos (F-1 + F-7). Tactic Bass: **Retry** + **Exception Prevention**.

- **Resultado Esperado**
  > Leituras SISPAG passam a tolerar 1 transiente do Conexos sem falhar o painel. Métrica observável: leituras SISPAG envoltas em retry = 0/4 → 4/4; queda silenciosa por filial durante `logService.warn` em `gather` cai proporcionalmente à taxa de erro transiente atual.

- **Tactic alvo**: Retry + Exception Prevention
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-sispag-1, F-availability-sispag-7 (se optar por `paginate`)
- **Métricas de sucesso**:
  - Leituras SISPAG envoltas em retry: 0/4 → 4/4
  - Taxa de 500 no `GET /sispag/painel` durante Conexos flaky: reduzir em ≥50% (medível após card availability-3 do run anterior — Sentry)
- **Risco de não fazer**: cada janela de Conexos flaky derruba o painel; F-2 (silent partial) amplifica o impacto pois nem sinaliza que houve queda.
- **Dependências**: nenhuma; ideal antes de availability-sispag-2 (sinalização de parcial fica menos ruidosa se houver retry).

### [availability-sispag-2] Sinalizar "resposta parcial" no `SispagPainelResponse` + banner no front

- **Problema**
  > `gather` no `SispagPainelService` engole falha per-filial e loga `BUSINESS_WARN` no stdout, mas o `SispagPainelResponse` não carrega nenhum sinal disso — o cliente recebe 200 OK indistinguível de "tudo OK", KPIs subestimados, e a analista pode montar lote baseado em subset. F-2 (silent partial).

- **Melhoria Proposta**
  > (a) Estender `SispagPainelResponse` com um campo estruturado `parcial?: { filiaisComFalha: number[]; motivo?: string }` OU tag por bloco (`titulos.completude`, `lotes.completude`, `borderos.completude` cada um com `filiaisOk`/`filiaisFalha`). (b) Refatorar `gather` para acumular filiais em falha (hoje só loga). (c) No frontend, exibir banner amarelo "Painel incompleto: N filial(is) não respondeu(am) — dados de X estão faltando" sobre o KPIGrid quando `parcial` estiver setado. Tactic Bass: **Monitor** + **Degradation** (feedback explícito) + **Exception Detection** (granular no cliente).

- **Resultado Esperado**
  > Analista sabe imediatamente que o painel está parcial. Métrica observável: campos no response que sinalizam parcial = 0 → 1 (`parcial`); renders de banner de degradação no front = 0 → 1.

- **Tactic alvo**: Monitor + Degradation + Exception Detection
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-sispag-2, F-availability-sispag-1 (o retry reduz FREQUÊNCIA, este card resolve VISIBILIDADE)
- **Métricas de sucesso**:
  - Campos que sinalizam parcial no `SispagPainelResponse`: 0 → 1
  - Casos de decisão-em-cima-de-parcial-silencioso: variável → 0 (auto-report)
- **Risco de não fazer**: cada janela de Conexos flaky derruba silenciosamente parte do painel; decisão de negócio distorcida sem que o operador saiba.
- **Dependências**: idealmente junto com availability-sispag-1 (retry reduz a frequência do parcial); recomenda-se conectar ao card availability-3 do run anterior (Sentry) para alertar quando `parcial=true` chega em produção.

### [availability-sispag-3] Não segurar conexão do pool PG durante a re-leitura Conexos em `incluirTitulo`

- **Problema**
  > `LotePagamentoService.incluirTitulo` chama `withAdvisoryLock` — que segura um `PoolClient` — e DENTRO dele chama `conexos.getTituloAPagar` (até ~40s de timeout). Com pool max=5, cinco analistas concorrentes clicando "Criar lote" saturam o pool por até 40s cada; `GET /sispag/lotes` e outras rotas PG-bound ficam 5s pendurados e caem em 500.

- **Melhoria Proposta**
  > Reordenar: (a) fazer a re-leitura Conexos ANTES do `withAdvisoryLock` (o snapshot fica velho por poucos ms — aceitável, é anti-drift, não hard-realtime); (b) o `withAdvisoryLock` cerca APENAS a checagem de I3 (`loteRascunhoComTitulo`) + `withTransaction` (insert + `tocarLote`). Nova sequência: `Conexos read → advisory lock → tx (I3 check + insert)`. Preserva I2 (elegibilidade autoritativa) + I3 (advisory lock + tx) + I4 (checagem no lote lido). Alternativa: aumentar `poolMaxConnections` de 5 para 10 (paliativo, não resolve amplificação). Tactic Bass: **Ignore Faulty Behavior** (não amplificar starvation) + **Removal from Service** (do recurso escasso durante espera).

- **Resultado Esperado**
  > Tempo máximo que uma conexão do pool fica retida em `incluirTitulo` cai de ~40s (worst-case Conexos) para <100ms (transação local). Pool aguenta N×10 includes concorrentes em janelas de Conexos lento. Métrica observável: tempo médio de aquisição de conexão do pool sob carga: variável → estável em <50ms.

- **Tactic alvo**: Ignore Faulty Behavior + Removal from Service
- **Severidade**: P1
- **Esforço estimado**: S (≤1d — refactor localizado)
- **Findings relacionados**: F-availability-sispag-3
- **Métricas de sucesso**:
  - Tempo máximo de retenção de `PoolClient` em include: ~40s → <100ms (transação Postgres)
  - Nº de conexões PG ocupadas simultâneamente com N analistas incluindo: N → 0 (só durante os ms da tx)
- **Risco de não fazer**: reunião de fechamento com 3–4 analistas em paralelo fica frágil a slowdown do Conexos; uma inclusão lenta trava rotas SISPAG e Permutas que compartilham o mesmo pool.
- **Dependências**: nenhuma; regressão de teste sugere estender `LotePagamentoService.test.ts` com um mock de `conexos.getTituloAPagar` lento (delay) medindo que o advisory-lock é adquirido só DEPOIS.

### [availability-sispag-4] Erro dedicado para "advisory lock ocupado no MESMO título" (não misturar com optimistic conflict)

- **Problema**
  > O `onBusy` do `withAdvisoryLock` em `incluirTitulo` lança `LoteVersaoConflitoError({ versaoEsperada: -1 })` — mas a condição real é "outro processo está incluindo O MESMO título agora". Mensagem enganosa ("lote foi alterado por outra pessoa") + sentinela feio (`versaoEsperada: -1`). Confunde o operador e polui logs.

- **Melhoria Proposta**
  > Criar `TituloIncluindoConcorrenteError` (HTTP 409, `code: 'TITULO_INCLUINDO_CONCORRENTE'`, `retryable: true`, `userMessage: 'Este título está sendo incluído por outra pessoa agora — aguarde e retente'`). Instrumentar `LotePagamentoService.ts:147-150` para lançar esse novo tipo em vez do genérico. Preservar `LoteVersaoConflitoError` para o cenário legítimo (transição com `versao` errada). Tactic Bass: **Exception Detection** (granularidade) + **Increase Competence Set** (mensagem correta ajuda o operador).

- **Resultado Esperado**
  > Operador que enfrenta race no mesmo título vê mensagem correta e retenta rápido; log distingue as 2 condições. Métrica observável: tipos de erro do include = 5 → 6 (+ TituloIncluindoConcorrenteError).

- **Tactic alvo**: Exception Detection + Increase Competence Set
- **Severidade**: P2
- **Esforço estimado**: S (≤0.5d)
- **Findings relacionados**: F-availability-sispag-4
- **Métricas de sucesso**:
  - Tipos de erro dedicados no include: 5 → 6
  - Ambiguidade de mensagem: 1 mensagem para 2 condições → 1:1
- **Risco de não fazer**: ruído de UX em cenário de 2 analistas cooperando; log difícil de analisar.
- **Dependências**: nenhuma.

### [availability-sispag-5] Endpoint batch atômico `POST /sispag/lotes/:id/itens:batch` (transacional, com relatório item-a-item)

- **Problema**
  > O front `criarLoteComSelecionados` faz loop sequencial de `POST /itens` — para N=40 títulos e Conexos p50 500ms = 20s de "loading"; em Conexos flaky vira partial-fill silencioso (analista sabe pelo toast, mas o lote fica ambíguo entre "incluídos" e "faltando"). Sem rollback entre chamadas.

- **Melhoria Proposta**
  > (a) Novo endpoint `POST /sispag/lotes/:id/itens:batch` recebendo `{ items: [{filCod, docCod, titCod}, ...] }`. (b) No serviço, re-ler os N títulos em paralelo (com concorrência limitada, ex. 5) + envolver em `runWithRetry` (card availability-sispag-1). (c) Insert de todos os N num único `withTransaction` — `ON CONFLICT DO NOTHING` já cobre idempotência. (d) Resposta: `{ lote, resumo: { ok: N, falhas: [{tituloId, motivo}] } }` (mantém a granularidade que o front espera hoje). (e) Frontend passa a chamar o batch em vez do loop. Tactic Bass: **Rollback** + **Degradation** (falhas item-a-item com sinalização).

- **Resultado Esperado**
  > Batch N=40 em 1–3s (paralelismo 5 + tx única) vs. 20s hoje. Partial-fail vira contrato explícito no shape do response. Métrica observável: latência p50 para batch N=40 = 20s → <3s; endpoints batch atômicos = 0 → 1.

- **Tactic alvo**: Rollback + Degradation
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-availability-sispag-5, F-availability-sispag-3 (o batch também tira o gargalo de pool)
- **Métricas de sucesso**:
  - Latência p50 de batch N=40: ~20s → <3s
  - Endpoints batch atômicos no SISPAG: 0 → 1
- **Risco de não fazer**: UX degradada em batchs grandes; partial-fail visível ao operador mas com semântica ambígua.
- **Dependências**: idealmente após availability-sispag-1 (retry) + availability-sispag-3 (pool).

### [availability-sispag-6] Cache local + fallback stale-while-error no painel (`SispagPainelService`)

- **Problema**
  > Painel 100% acoplado ao Conexos live. Falha de `getFiliais` = 500 do endpoint inteiro; falha total de `fin064/fin015/fin010` = KPIs zerados. Como a aba "Lotes candidatos" (dados 100% Postgres, sem dependência de Conexos) mora na mesma página, ficam ambas dark em incidente Conexos — a analista perde acesso até aos lotes RASCUNHO locais.

- **Melhoria Proposta**
  > (a) Materializar `permuta_bordero`-style: uma tabela `sispag_painel_snapshot` com `filCod, endpoint, rows_jsonb, capturado_em`; refresca oportunisticamente a cada request bem-sucedido. (b) Se `getFiliais` OU `gather` falharem completamente, usar o snapshot mais recente + adicionar `parcial.origem: 'cache'` + `capturadoEm` no response (integra com card availability-sispag-2). (c) Alternativa mais leve: separar a rota `GET /sispag/lotes-candidatos` do painel — a UI carrega a aba de lotes candidatos independente e só o painel de KPIs fica com erro. Tactic Bass: **Passive Redundancy** + **Degradation** (last-good).

- **Resultado Esperado**
  > Painel mostra dado antigo com aviso durante incidente Conexos; aba "Lotes candidatos" funciona sempre (é 100% local). Métrica observável: rotas SISPAG com fallback = 0 → 1; rotas SISPAG completamente dark durante Conexos-fora = 4 → 1.

- **Tactic alvo**: Passive Redundancy + Degradation
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) para (a) + (b); S (≤1d) para (c) sozinho
- **Findings relacionados**: F-availability-sispag-6
- **Métricas de sucesso**:
  - Rotas SISPAG com fallback de cache: 0 → 1
  - Acessos à aba "Lotes candidatos" durante incidente Conexos: 0% → 100%
- **Risco de não fazer**: tela SISPAG inteira dark durante Conexos-fora, incluindo o que é 100% local.
- **Dependências**: (c) sozinho não depende de nada; (a)+(b) idealmente após implementar `FallbackExecutor` (card availability-7 do run anterior).

> **Findings sem card explícito**:
> - F-availability-sispag-7 (truncamento silencioso `count > rows.length`): o card availability-sispag-1 (se optar por `paginate` em vez de `runWithRetry` puro) resolve por reuso. Alternativa mínima e barata (sem card separado): emitir `BUSINESS_WARN` no `ConexosSispagClient` quando `count > rows.length` (~5 linhas).
> - F-availability-sispag-8 (reaper de RASCUNHO abandonado): P3, backlog inbox — reavaliar quando o time crescer para 3+ analistas ou quando aparecer o primeiro caso reportado de "título preso".

## 6. Notas do agente

- Feature SISPAG Painel+Montagem é **I1-safe** (nenhuma escrita ao ERP), então blast radius e severidade máxima ficam em **P1** — nada aqui pode causar `super-pagamento`/`baixa duplicada` no fin010. Score sobe de 5 → 6 vs. run anterior porque a Fatia 2 traz padrões defensivos NOVOS que estavam ausentes fora do domínio Permutas: guards tipados de state-machine (I5), optimistic concurrency (I6), advisory lock explícito por identidade do título (I3), snapshot anti-drift (I2) — e vários testes cobrindo cada um.
- Delta puro de availability (o que NÃO existia antes): (a) `SispagPainelService.gather` com `Promise.allSettled` per-filial (padrão consistente com `BorderoGestaoService.refreshCache`); (b) máquina de estados local `RASCUNHO→FINALIZADO→CANCELADO` com optimistic lock estruturado (I6 escrito em SQL parametrizado — clean); (c) hierarquia dedicada de HandlerError SISPAG (`respondLoteError`) que dá códigos tipados 409/422 ao cliente com `retryable: true/false` — GRANDE vitória sobre o `errorMiddleware` genérico F-availability-9 do run anterior (SÓ para SISPAG; Permutas não migrou).
- **Débito herdado (sem regressão, mas amplificado para SISPAG):** F-availability-2 (health), F-availability-3 (APM), F-availability-4 (SIGTERM), F-availability-5 (breaker), F-availability-6 (self-test) do run 2026-06-26-1708 seguem PENDENTES e passam a valer também para o SISPAG. Não listei eles como findings novos — o consolidator deve unificar contra o backlog dos runs anteriores.
- Cross-QA: F-availability-sispag-3 (pool retido) tem cross-ref com `qa-performance` (starvation) e `qa-fault-tolerance` (contention amplifica falha); F-availability-sispag-1 (retry) tem cross-ref com `qa-fault-tolerance` (paridade dos sub-clients); F-availability-sispag-2 (parcial silencioso) tem cross-ref com `qa-integrability` (contrato do response) e `qa-testability` (não testável hoje sem uma fault-injection). Avisar o consolidator.
- **Nenhum P0 identificado.** A combinação I1 (read-only ao Conexos) + local state atômico + optimistic lock + advisory lock + snapshot anti-drift + Zod nas fronteiras + testes cobrindo os invariantes faz o pior caso ser "painel parcialmente vazio e operador confuso" — recuperável, não catastrófico.
