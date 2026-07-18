---
qa: Availability
qa_slug: availability
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-availability
generated_at: 2026-07-18T16:18:00Z
scope: backend
score: 7
findings_count: 6
cards_count: 5
---

# Availability — Regis-Review (SISPAG / Frente II)

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (`fin064`/`fin015`/`fin010`/`com298`/`fin052`) | Timeout, HTTP 5xx, 400 filter-rejection, `LOGIN_ERROR_MAX_SESSIONS` no pool de sessões, filial isolada indisponível | Fan-out por filial em `SispagPainelService.montarPainel` + `IngestaoPagamentosService.executar` + `LotePagamentoService.incluirTitulo` (re-leitura autoritativa) | Produção HML — SISPAG read-only por contrato (I1); escrita (`ConexosSispagWriteClient`/`RetornoOrquestracaoService`) DORMENTE gated por `sispagEnabled`+`conexosWriteEnabled` | Retry com backoff (RetryExecutor 2×/500ms/jitter 200ms), fan-out limitado a 4 chamadas simultâneas, degradação parcial (settled per-filial → BUSINESS_WARN + segue), state-machine + optimistic lock + advisory lock protegem o Postgres próprio | 0 lote em estado inválido; 0 título duplicado entre lotes RASCUNHO; painel responde ≤ 60s mesmo com 1 filial em falha; ingestão diária persistente com trilha de auditoria (`pagamento_ingestao_run`) |

> Cenário-guia: "Uma das ~5 filiais da Columbia está com o Conexos lento (fin064 → 504). O painel do analista continua carregando, mostrando os títulos das outras 4 filiais e KPIs derivados; a ingestão diária consegue rodar sem regredir estado; se a filial voltar antes do próximo cron, o próximo painel se completa. Falhas nunca corrompem o `lote_pagamento` (estados/versão), e o mesmo idempotency-key na ingestão nunca cria duas runs."

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| % de reads Conexos SISPAG dentro de `runWithRetry` | 100% (11/11) | 100% | ✅ | `grep -c "runWithRetry" src/backend/domain/client/ConexosSispagClient.ts` (7) + `ConexosSispagRetornoClient.ts` (4) |
| Reads paginados que fazem walk completo vs. só página 1 | 0/11 usam `paginate`, 11/11 chamam `listGenericPaginated` direto (single-page, pageSize entre 100 e 5000) | Walk completo ou cap explícito por endpoint com `onCapHit` telemetrado | ⚠️ | `ConexosSispagClient.ts:186,202,229,253,275,308` / `ConexosSispagRetornoClient.ts:104,157,209,241` |
| Fan-out Conexos limitado (bound de concorrência) | `CONEXOS_FANOUT_LIMIT = 4` em todos os 4 fan-outs do painel + `FANOUT_LIMIT = 4` na ingestão | ≤4 (mitiga `LOGIN_ERROR_MAX_SESSIONS`) | ✅ | `SispagPainelService.ts:28,79,154,170,206` / `IngestaoPagamentosService.ts:20,90` |
| Timeout explícito no client HTTP Conexos | 40 000 ms fixo | ≤ 60 s (Lambda hoje é Express) | ✅ | `src/backend/services/conexos.ts:116-121` |
| Idempotência da ingestão (via `Idempotency-Key`) | Presente, TTL 24h, checa ANTES de adquirir o advisory lock | Presente | ✅ | `IngestaoPagamentosService.ts:46-51` + `PagamentoIngestaoRunRepository.ts:96-104` |
| Advisory locks distintos por processo | 3 chaves distintas (`726354819` ingestão, `615243789` formação, `528417963` retorno — este último ainda dormente) | Chaves não-colidentes por operação de escrita | ✅ | `IngestaoPagamentosService.ts:18` / `FormacaoLotesService.ts:21` / `RetornoOrquestracaoService.ts:11` |
| Optimistic lock nas transições de lote | `WHERE id = $id AND versao = $versaoEsperada AND status = ANY($de)` em `transicionarStatus`, `atualizarContaPagadora`, `atualizarModalidadeItem` | Presente | ✅ | `LotePagamentoRepository.ts:392-419, 369-384, 327-354` |
| State-machine guard nas transições do lote | `LoteEstadoInvalidoError` cobre finalizar/reabrir/cancelar/marcarRetorno/incluir/remover; distingue conflito de versão vs. estado incompatível relendo | Guarda explícita em cada transição | ✅ | `LotePagamentoService.ts:161,249,278-306,309-332,352-366` |
| Degradação parcial per-filial no painel | Settled results per-filial via `BoundedConcurrency.run`; falha vira BUSINESS_WARN e o painel devolve o que colheu | Presente, MAS deve sinalizar ao cliente (flag `filiaisSemDados`) | ⚠️ | `SispagPainelService.ts:76-100,146-190` (não expõe filiais faltantes no `SispagPainelResponse`) |
| Heartbeat / staleness alarm do cron de ingestão | `PagamentoIngestaoRunRepository.findLatestSuccessFinishedAt` grava o carimbo; nenhum consumidor alerta quando `now - ultimaRunEm > 30h` | Alarm se `ultimaRunEm` > 2× período do cron | ❌ | `jobs/ingest-pagamentos.ts:11-14` ("CRON NÃO configurado — documentado") + `SispagPainelService.ts:126` |
| Health check com validação de dependências (Conexos + Postgres) | `/health` retorna apenas `{status: 'ok', version}` — não valida SID Conexos, pool DB, nem `ultimaRunEm` | Health composto | ⚠️ | `src/backend/index.ts:70` |
| Silent catches / exception swallowing em SISPAG | 2 catches best-effort explicitamente documentados (idempotency + logger pós-sucesso na ingestão; listDetalhe filtro-bloqueado no orquestrador dormente); zero silenciamento indevido no path crítico | 0 no path crítico | ✅ | `IngestaoPagamentosService.ts:143-145` / `RetornoOrquestracaoService.ts:153-155` |
| Baseline de estabilidade (typecheck + lint) | typecheck ✅ / lint 0 errors + 28 warnings (backend) | Verde | ✅ | `_shared-metrics.md` (linhas 44-51) |
| Testes automatizados de fault-tolerance (fan-out settled, 5xx propaga, 400 → fallback) | Presentes: `ConexosSispagClient.test.ts:58-80` (propaga 5xx, cai em 400), `SispagPainelService.test.ts` (fan-out settled) | Presente | ✅ | `src/backend/domain/client/ConexosSispagClient.test.ts` |

> ⚠️ **Não medível localmente**: MTTR real, TTR do cron após falha, taxa observada de `LOGIN_ERROR_MAX_SESSIONS`, latência p95 do painel sob carga real. Requer instrumentar CloudWatch/Render logs + métrica de tempo entre `pagamento_ingestao_run.started_at` sucessivas. Recomendação: coletar histogramas `sispag_painel_duracao_ms`, `conexos_sispag_5xx_total`, `sispag_ingest_stale_horas` via LogService (já singleton) e um dashboard mínimo (F-availability-3).

## 3. Tactics — Cobertura no SISPAG

### Detect Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | Não aplicável — sistema single-process; sem cluster interno | N/A | — |
| Heartbeat | `pagamento_ingestao_run` grava início/fim de cada ingestão, mas **nada** consome `findLatestSuccessFinishedAt` como alarme externo | ❌ | `PagamentoIngestaoRunRepository.ts:87-94` |
| Monitor | `LogService` (singleton) grava BUSINESS_INFO/BUSINESS_WARN nos pontos de falha; sem dashboard | ⚠️ | `SispagPainelService.ts:86-95,178-186` / `IngestaoPagamentosService.ts:108-116,132-142` |
| Timestamp | `started_at`/`finished_at` na run; `ultimaRunEm` no `SispagPainelResponse`; `criado_em`/`atualizado_em`/`finalizado_em` no `lote_pagamento` | ✅ | `PagamentoIngestaoRunRepository.ts:12-14` / `LotePagamentoRepository.ts:22-30` |
| Sanity Checking | State-machine do lote enforcada em serviço + SQL (`WHERE status = ANY($de)`); I4 (uma filial), I3 (não-duplicação), I5 (gate finalizar) | ✅ | `LotePagamentoService.ts:161-172,278-306` / `LotePagamentoRepository.ts:392-419` |
| Condition Monitoring | Contadores em auditoria (`total_titulos`, `total_inativados`); NENHUM threshold/alerta configurado | ⚠️ | `PagamentoIngestaoRunRepository.ts:51-72` |
| Voting | N/A — leitura single-source (Conexos autoritativo) | N/A | — |
| Exception Detection | `ConexosSispagClient.isFilterRejected` distingue 400 (filter drift) de 5xx transiente e só cai em fallback no 400 legítimo; typed errors (`LoteEstadoInvalidoError`, `LoteVersaoConflitoError`, `TituloNaoElegivelError`, `TituloEmOutroLoteError`, `LoteFilialError`, `ModalidadePendenteError`, `IngestLockBusyError`) | ✅ | `ConexosSispagClient.ts:105-112,193-209` / `LotePagamentoService.ts` errors |
| Self-Test | `/health` responde 200 mas não valida Conexos/DB | ⚠️ | `src/backend/index.ts:70` |

### Recover from Faults — Preparation & Repair

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A — Render single instance | N/A | — |
| Passive Redundancy | `ConexosSessionRegistry`/`sessionStore` compartilha o SID entre processos (evita re-login e economiza slots MAX_SESSIONS) | ✅ | `src/backend/services/conexos.ts:191-211,296-299` |
| Spare | N/A | N/A | — |
| Exception Handling | Errors de domínio tipados e mapeados a HTTP via `respondLoteError` (retorna `code`, `retryable`, `details`); Fallback de filtro em `listTitulosAPagar` com WARN não-silencioso | ✅ | `routes/sispag.ts:67-78` / `ConexosSispagClient.ts:193-209` |
| Rollback | `db.withTransaction` em `incluirTitulo`/`removerTitulo`/`atualizarModalidadeItem`/`montarGrupo` (formação); ingest marca `run status='error'` no catch top-level (Postgres upsert é atômico per-título via `ON CONFLICT`) | ✅ | `LotePagamentoService.ts:112-140,256-269` / `IngestaoPagamentosService.ts:152-161` |
| Software Upgrade | N/A — deploy Render em cold start | N/A | — |
| Retry | `RetryExecutor` (2 retries, 500 ms delay, jitter 200 ms) em 100% dos reads SISPAG via `runWithRetry`; write path irreversível corretamente usa `postGenericOnce`/`postMultipartOnce` (SEM retry — dormente hoje) | ✅ | `ConexosBaseClient.ts:143-149,199` / `ConexosSispagClient.ts:185,201,228,252,274,307` |
| Ignore Faulty Behavior | Fan-out settled + WARN per filial: painel não morre pela pior filial | ✅ | `SispagPainelService.ts:76-100` / `IngestaoPagamentosService.ts:81-117` |
| Degradation | Painel devolve dados parciais + `LogService.warn`, MAS **não sinaliza** ao frontend quais filiais faltaram → analista pode agir sobre KPI incompleto sem perceber | ⚠️ | `SispagPainelService.ts:118-131` (resposta sem `filiaisSemDados`) |
| Reconfiguration | `sispagGate` remove SISPAG do runtime em produção via `SISPAG_ENABLED=false` (403 na rota); `conexosWriteEnabled` gata a escrita quando existir | ✅ | `src/backend/http/sispagGate.ts:13-21` |

### Recover from Faults — Reintroduction

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | N/A — não há canary de leitura | N/A | — |
| State Resynchronization | `incluirTitulo` re-lê o Conexos (I2 autoritativa) antes de aceitar; ingestão marca "fora-da-run" como `inativo` **só** entre as filiais lidas com sucesso (não perde títulos de filial que falhou) | ✅ | `LotePagamentoService.ts:176-198` / `IngestaoPagamentosService.ts:94-100,120` |
| Escalating Restart | N/A — process supervisor externo (Render) | N/A | — |
| Non-Stop Forwarding | N/A | N/A | — |

### Prevent Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | `sispagGate` retira o SISPAG em produção; `SispagPainelResponse.modo.somenteLeitura` sempre `true` (write dormente); `conexosWriteEnabled` também gated | ✅ | `sispagGate.ts:13-21` / `SispagPainelService.ts:118-124` |
| Transactions | `withTransaction` + `withAdvisoryLock` combinados; advisory lock POR TÍTULO em `incluirTitulo` (`lockKey(filCod, docCod, titCod)`) evita starvation do pool | ✅ | `LotePagamentoService.ts:199-239` |
| Predictive Model | Ausente — sem modelo preditivo de falha de Conexos ou de staleness de ingest | ❌ | — |
| Exception Prevention | (a) I2 re-leitura antes de aceitar título; (b) I3 lock+check anti-duplicação; (c) I4 mesma-filial; (d) I5 gate `contarItens > 0` + `contarItensSemModalidade == 0`; (e) I6 optimistic lock em toda mutação; (f) rate-limit `heavyRouteLimiter` nas rotas de fan-out (`/sispag/ingestao`, `/sispag/lotes/formar`) | ✅ | `LotePagamentoService.ts:159-244,287-300` / `routes/sispag.ts:318,337` |
| Increase Competence Set | Zod em todos os boundaries (rotas + parsing de rows Conexos com `safeParse` + `passthrough`); ingest ignora rows que não passam de schema em vez de derrubar a run | ✅ | `routes/sispag.ts:80-103,110-115,141-146,158-162` / `ConexosSispagClient.ts:210-214` |

## 4. Findings (achados)

### F-availability-1: Reads SISPAG usam paginação single-page — silent truncation possível em `fin015`/`fin010`

- **Severidade**: P2 (débito técnico defensável — SISPAG hoje é read-only e o painel não é fonte-de-verdade; a régua sobe para P1 quando a Fatia 3 escrever com base em `listLotes`)
- **Tactic violada**: Detect Faults (Condition Monitoring) + Sanity Checking
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:186-208, 228-232, 273-280, 306-313, 251-263` / `src/backend/domain/client/ConexosSispagRetornoClient.ts:104-110, 157-163, 209-214, 241-247`
- **Evidência (objetiva)**:
  ```
  ConexosSispagClient.ts:275
      const { rows } = await this.base.runWithRetry(() =>
          this.base.listGenericPaginated<...>('fin015/list', this.listBody('fin015', {}, 100), { filCod }),
      );
  # 11/11 reads SISPAG chamam listGenericPaginated (single-page); 0/11 usam ConexosBaseClient.paginate (walker)
  ```
  `listGenericPaginated` em `legacyConexosAdapter.ts:37-51` retorna somente a página 1 do `{count, rows}`. `ConexosBaseClient.paginate` (linhas 238-296) existe, walka até `MAX_PAGES` e chama `onCapHit` — nenhum consumidor SISPAG o usa.
- **Impacto técnico**: uma filial com >100 lotes históricos em `fin015`, >100 borderôs abertos em `fin010`, ou >5 000 docs `EX` em `com298`, tem rows silenciosamente descartadas. Não há telemetria (não há `onCapHit`) — a falha vira "dados sumiram" sem sinal.
- **Impacto de negócio**: painel mostra KPI `lotesAbertos`/`lotesEnviados` subestimado; analista pode julgar que "não há mais lotes pendentes" quando existem. Baixa hoje (I1 read-only), mas bloqueia o roll-out da Fatia 3 (baixa/remessa depende do `listLotes` retornar tudo).
- **Métrica de baseline**: 11/11 reads = 100% de single-page usage; page size máximo 5 000 (`listExteriorDocCods`), mínimo 100 (`listLotes`, `listBorderosAPagar`).

### F-availability-2: Painel não sinaliza degradação parcial quando uma filial falha

- **Severidade**: P2 (visibilidade — funcionalidade não é errada, mas o usuário não sabe que os dados estão incompletos)
- **Tactic violada**: Degradation (visibilidade da degradação); Monitor
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:76-100, 118-131` / `src/backend/domain/interface/sispag/SispagInterface.ts` (`SispagPainelResponse`)
- **Evidência (objetiva)**:
  ```
  SispagPainelService.ts:85-97
      if (result.status === 'rejected') {
          await this.logService.warn({ type: LOG_TYPE.BUSINESS_WARN, ...filCod });
          continue;
      }
  # A resposta SispagPainelResponse (modo/ingestao/kpis/titulos/lotes) NÃO carrega
  # a lista de filiais cujos reads falharam. O frontend não tem como avisar o analista.
  ```
- **Impacto técnico**: o warn está só no backend log; o front recebe KPIs computados sobre um subconjunto de filiais como se fossem completos.
- **Impacto de negócio**: analista aprova/finaliza lotes com base em `titulosAVencer7d` subestimado; incidente de "esqueci de pagar" que na verdade é falha silenciosa de uma filial. Difícil de auditar depois (log já rolou).
- **Métrica de baseline**: `SispagPainelResponse` tem 5 campos top-level (`geradoEm`, `modo`, `ingestao`, `kpis`, `titulos`, `lotes`); 0 sinaliza degradação parcial. Log de WARN emitido em `logService.warn` ficando só nos logs Render.

### F-availability-3: Cron de ingestão sem heartbeat/alarme de staleness (e sem estar wired)

- **Severidade**: P2 (o cron **ainda não está agendado** — comentário `NÃO configurado — documentado`; risco só materializa quando ativado)
- **Tactic violada**: Heartbeat + Monitor
- **Localização**: `src/backend/jobs/ingest-pagamentos.ts:11-14` / `src/backend/jobs/formar-lotes.ts:11-13` / `src/backend/domain/service/sispag/SispagPainelService.ts:126`
- **Evidência (objetiva)**:
  ```
  jobs/ingest-pagamentos.ts:11-14
   * CRON (NÃO configurado — entrada documentada apenas):
   *   0 6 * * *  cd /caminho/do/repo/src/backend && npm run job:ingest-pagamentos
  # PagamentoIngestaoRunRepository.findLatestSuccessFinishedAt() existe e é lido pelo painel,
  # mas nenhum consumer alerta se now - ultimaRunEm > 30h.
  ```
- **Impacto técnico**: se a ingestão silenciosamente parar de rodar (cron não disparado, dep quebrada, lock preso), o painel serve dados velhos indefinidamente. Frontend exibe `ultimaRunEm` cru, sem alerta de "carteira desatualizada".
- **Impacto de negócio**: analista opera com carteira defasada — títulos vencidos podem sumir do painel se `titulo_a_pagar` não é atualizado; risco de pagamento em atraso ou perdido.
- **Métrica de baseline**: 0 scheduler wired; 0 alarme sobre `pagamento_ingestao_run.finished_at`; 0 endpoint `/health/sispag`.

### F-availability-4: `RetornoOrquestracaoService` sem advisory lock e sem ledger idempotente

- **Severidade**: P3 (o serviço é DORMENTE — `listarRetNaPasta` retorna `[]` e nenhuma rota/cron o invoca; risco é para o roll-out, não para hoje)
- **Tactic violada**: Transactions / Exception Prevention (write-ahead idempotency)
- **Localização**: `src/backend/domain/service/sispag/RetornoOrquestracaoService.ts:82-92, 121-124, 191-198`
- **Evidência (objetiva)**:
  ```
  RetornoOrquestracaoService.ts:82-83
   // TODO(advisory-lock): envolver o corpo em `db.withAdvisoryLock(RETORNO_POLLER_LOCK_KEY, ...)`
   //   (igual IngestaoPagamentosService) quando houver o PostgreeDatabaseClient injetado.
  RetornoOrquestracaoService.ts:121-124
   // TODO(ledger): idempotência write-ahead — pular se este arquivo (hash/nome) já foi processado
  ```
- **Impacto técnico**: quando ligado, dois pollers concorrentes podem uploadar o mesmo `.RET` duas vezes (o `postMultipartOnce` só evita retry do MESMO POST, não duplicação por outra instância). E sem ledger `retorno_execucao`, a re-execução do poller reprocessaria o arquivo.
- **Impacto de negócio**: baixa duplicada no `fin010` (financeiro pago duas vezes no ERP) — irreversível sem reconciliação manual. Alto risco POR PROJETO — quando a Fatia 3 acordar o poller.
- **Métrica de baseline**: 2 TODOs abertos no serviço; 0 tabela `retorno_execucao`; `RETORNO_POLLER_LOCK_KEY` declarada mas nunca adquirida.

### F-availability-5: `/health` genérico não valida dependências do SISPAG

- **Severidade**: P3 (nice-to-have — cobertura de liveness × readiness)
- **Tactic violada**: Self-Test
- **Localização**: `src/backend/index.ts:70`
- **Evidência (objetiva)**:
  ```
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
- **Impacto técnico**: Render pode reportar app "up" mesmo com Postgres inacessível ou Conexos SID negado; um probe SISPAG (SID válido + `SELECT 1` no Postgres + `ultimaRunEm` fresco) daria sinal cedo.
- **Impacto de negócio**: incidentes descobertos pelo analista em vez do monitor — MTTR sobe.
- **Métrica de baseline**: 1 endpoint `/health` sem validação de dependência; 0 `/health/sispag` específico.

### F-availability-6: Timeout do axios Conexos hard-coded a 40 s em `src/backend/services/conexos.ts`

- **Severidade**: P3 (dentro do razoável para leituras Conexos, mas magic number sem knob por endpoint)
- **Tactic violada**: Exception Prevention (bounded resource)
- **Localização**: `src/backend/services/conexos.ts:116-122`
- **Evidência (objetiva)**:
  ```
  this.client = axios.create({
      baseURL: opts.baseUrl || ... ,
      timeout: 40000,
  });
  ```
- **Impacto técnico**: uma leitura lenta prende um worker por 40 s; com fan-out 4× por filial × ~5 filiais, o pool de sessão do Conexos pode ficar preso enquanto o retry rola. Sem knob por env (SSM) para reduzir em produção sob incidente.
- **Impacto de negócio**: painel demora até (40 s × 3 tentativas = 2 min) na pior fatia; usuário reload → mais burst → mais MAX_SESSIONS. Já mitigado por `BoundedConcurrency=4` + shared session store, mas o número mereceria ficar em env.
- **Métrica de baseline**: 40 000 ms fixo; 0 override por env; 1 único timeout para reads + writes.

## 5. Cards Kanban

### [availability-1] Introduzir walk paginado (ou cap telemetrado) nos reads SISPAG

- **Problema**
  > Todos os 11 reads Conexos do SISPAG (`ConexosSispagClient` + `ConexosSispagRetornoClient`) chamam `listGenericPaginated` (página 1), com `pageSize` variando de 100 a 5 000. Se uma filial exceder o page size, rows são descartadas silenciosamente — sem `onCapHit`, sem WARN, sem métrica. `ConexosBaseClient.paginate` já existe com essa telemetria e é usado por Permutas; SISPAG não o adotou.

- **Melhoria Proposta**
  > Trocar os cinco reads mais críticos (`listLotes`, `listBorderosAPagar`, `listTitulosAPagar`, `listExteriorDocCods`, `listArquivosRetorno`) por `base.paginate` com `onCapHit` emitindo BUSINESS_WARN e um counter (`sispag_paginate_cap_hit_total{endpoint}`). Onde o cap for legítimo por design (ex.: painel só quer top-N), documentar explicitamente com `TITULOS_CAP`-style e sinalizar via LogService. Tactic Bass: **Sanity Checking + Condition Monitoring**.

- **Resultado Esperado**
  > 0 rows silenciosamente descartadas em produção; WARN observável quando algum endpoint hoje truncado atinge o teto real. Base preparada para Fatia 3 (baixa/remessa) confiar em `listLotes`.

- **Tactic alvo**: Sanity Checking / Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-1
- **Métricas de sucesso**:
  - reads SISPAG usando `paginate`: 0/11 → ≥5/11
  - `sispag_paginate_cap_hit_total` observado em dashboard: N/A → ≥1 métrica exposta
- **Risco de não fazer**: quando Fatia 3 sair (baixa/remessa a partir de `listLotes`), lote antigo pode não aparecer para reconciliação → baixa perdida ou duplicada.
- **Dependências**: nenhuma — `paginate` já existe em `ConexosBaseClient.ts:238-296`

### [availability-2] Sinalizar degradação parcial no `SispagPainelResponse`

- **Problema**
  > Quando uma das ~5 filiais falha no fan-out do painel, `SispagPainelService.montarPainel` continua e devolve KPIs/lista de títulos/lotes calculados **sobre o subconjunto** que respondeu, sem informar o frontend. O BUSINESS_WARN fica só nos logs Render; o analista vê números completos.

- **Melhoria Proposta**
  > Adicionar `SispagPainelResponse.degradacao: { filiaisSemDados: number[], reasons?: string[] }` (não-vazio ⇒ painel degradado). Frontend exibe banner "Dados parciais — filial X não respondeu". Tactic Bass: **Degradation** (com sinalização) + **Monitor**. Arquivo `src/frontend/app/sispag/page.tsx` renderiza o banner.

- **Resultado Esperado**
  > 100% das degradações do painel visíveis ao analista sem depender do log-back-end. KPIs continuam sendo computados, mas com contexto.

- **Tactic alvo**: Degradation
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-2
- **Métricas de sucesso**:
  - Cobertura de sinalização parcial no `SispagPainelResponse`: 0% → 100%
  - Testes que asseguram `degradacao.filiaisSemDados` populado quando `bounded.run` devolve `rejected`: 0 → ≥2
- **Risco de não fazer**: incidente de "aprovei lote errado / esqueci de pagar" difícil de reconstituir; suporte precisa correr atrás do log Render.
- **Dependências**: nenhuma

### [availability-3] Wire do cron + heartbeat/alarm da ingestão SISPAG

- **Problema**
  > Os jobs `ingest-pagamentos` e `formar-lotes` estão implementados e testados, mas o cron **não está agendado** (comentário `NÃO configurado — documentado`). Além disso, nenhum consumidor externo alerta quando `pagamento_ingestao_run.finished_at` fica velho — o `SispagPainelResponse` só devolve o carimbo cru.

- **Melhoria Proposta**
  > (a) Configurar o cron no Render (`render.yaml` cron worker) para `0 6 * * *` (ingest) e `10 6 * * *` (formação); (b) expor `/health/sispag` que retorna 503 se `now - ultimaRunEm > 30h`; (c) documentar o alarme em `docs/regis-review/*` referenciando o endpoint. Tactic Bass: **Heartbeat + Monitor**.

- **Resultado Esperado**
  > Cron rodando diariamente; probe externo (UptimeRobot / cron-monitor) alerta em ≤ 6h após uma ingestão perdida.

- **Tactic alvo**: Heartbeat / Monitor
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - Cron agendado (render.yaml crons): 0 → 2
  - Endpoint `/health/sispag` implementado + testado: ausente → presente
  - Tempo entre `ultimaRunEm > 30h` e alerta: ∞ → ≤ 6h (probe externo)
- **Risco de não fazer**: painel serve carteira defasada por dias; analista opera às cegas.
- **Dependências**: decisão sobre monitor externo (UptimeRobot já existe no stack? confirmar com o Yuri)

### [availability-4] Blindar o RetornoOrquestracaoService antes de acordá-lo

- **Problema**
  > `RetornoOrquestracaoService` está dormente (poller vazio), mas contém dois TODOs críticos: sem advisory lock (dois pollers uploadariam o mesmo `.RET`) e sem ledger idempotente (`retorno_execucao` write-ahead). Ligar sem estes seria um risco de baixa duplicada no `fin010` — que é escrita **irreversível** no ERP.

- **Melhoria Proposta**
  > Antes de wired: (a) envolver o corpo em `db.withAdvisoryLock(RETORNO_POLLER_LOCK_KEY, ...)`; (b) criar migration `retorno_execucao` com `UNIQUE(idempotency_key)` (hash de `bnc:gtb:garCodSeq` ou hash do conteúdo); (c) gravar `pending → settled|error` write-ahead antes do `carregarArquivoRetorno`. Espelhar `PermutaExecucaoRepository`. Tactic Bass: **Transactions + Exception Prevention**.

- **Resultado Esperado**
  > 0 baixas duplicadas possíveis quando o poller for wired. Gate técnico documentado no ADR-0022 antes do `SISPAG_ENABLED=true` em produção.

- **Tactic alvo**: Transactions / Exception Prevention
- **Severidade**: P3 (P0 no dia em que for wired sem isso)
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - TODOs abertos no `RetornoOrquestracaoService`: 2 → 0
  - Cobertura de teste do lock + ledger: 0 → ≥3 casos (lock busy, duplicate key, retry pós-crash)
- **Risco de não fazer**: se o poller for ativado sem esse trabalho, um único deploy com 2 réplicas ou 1 restart mid-upload causa baixa duplicada no `fin010` — reconciliação manual custa horas de tesouraria por incidente.
- **Dependências**: `PostgreeDatabaseClient` já injetável; falta só a decisão pelo Yuri sobre a chave de idempotência

### [availability-5] Health check composto e timeout Conexos parametrizável

- **Problema**
  > `/health` retorna 200 sem validar Conexos (SID / MAX_SESSIONS) nem Postgres (pool). O timeout do axios Conexos é hardcoded 40 000 ms em `services/conexos.ts` — sem override por env, mesmo timeout para reads e writes.

- **Melhoria Proposta**
  > (a) Endpoint `/health/deep` que faz `SELECT 1` no Postgres + `base.ensureSid()` no Conexos com timeout curto (2 s); (b) tornar o `axios.create({ timeout })` parametrizável via `CONEXOS_HTTP_TIMEOUT_MS` no `EnvironmentProvider`, com default 40 000. Tactic Bass: **Self-Test + Exception Prevention (bounded resource)**.

- **Resultado Esperado**
  > Render/monitor detecta indisponibilidade de Conexos/DB em segundos, não pela reclamação do usuário. Operador consegue baixar o timeout sob incidente sem redeploy de código.

- **Tactic alvo**: Self-Test / Exception Prevention
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-5, F-availability-6
- **Métricas de sucesso**:
  - Endpoint `/health/deep` implementado: ausente → presente
  - Timeout Conexos configurável via env: hardcoded → env-driven
  - Tempo de deteção de dep down: n/a → ≤ 60 s
- **Risco de não fazer**: MTTR extra em incidente de Conexos/DB — usuário reporta antes do monitor.
- **Dependências**: nenhuma

## 6. Notas do agente

- Escopo respeitado: só SISPAG (Frente II) — não avaliei permutas/auth exceto `ConexosBaseClient` (dependência compartilhada) e `services/conexos.ts` (timeout único no stack).
- I1 respeitada: nenhum finding trata write-path como ativo — `ConexosSispagWriteClient` e `RetornoOrquestracaoService` são flagados como risco futuro (F-availability-4) e não como incidente atual.
- Postura geral do SISPAG em availability é sólida: retry universal (`runWithRetry` em 11/11 reads), fan-out limitado (`CONEXOS_FANOUT_LIMIT=4`), degradação per-filial que não derruba o painel, state-machine + optimistic + advisory locks bem-costurados. Gaps são de visibilidade (F-1/2/3/5) e defesa futura (F-4). Score 7 reflete: excelente cobertura de tactics de recovery/prevention, gaps concentrados em Monitor/Heartbeat/Self-Test — categoria que é o próximo passo natural pré-Fatia 3.
- Cross-QA: F-availability-2 (sinalizar degradação) casa com fault-tolerance e integrability (contrato de resposta); F-availability-4 é P0 sob a ótica de fault-tolerance no dia em que o poller for wired — sinalizei ao consolidator via severidade condicional na descrição do card.
- Não medível localmente: MTTR real, taxa de `LOGIN_ERROR_MAX_SESSIONS`, p95 do painel. Declarado explicitamente na tabela §2.
