---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-fault-tolerance
generated_at: 2026-07-18T16:18:00Z
scope: backend
score: 7.5
findings_count: 8
cards_count: 7
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Cron/analista (ingestão), API (transições de lote), poller `.RET` (dormant) | Falha parcial mid-run: pod reiniciado entre `upsertMany` e `finishRun`; timeout do Conexos entre `criarLote(fin015)` e `importarTitulos`; duplo POST de finalizar; re-execução do mesmo `.RET`; migration 0030 rodada contra base errada | `IngestaoPagamentosService`, `LotePagamentoService` (optimistic lock via `versao`), `ConexosSispagWriteClient` (dormant), `RetornoOrquestracaoService` (dormant), `PagamentoIngestaoRunRepository`, migração 0030 | Produção (SISPAG_ENABLED=true, mas fluxo `.RET` DRY-RUN por CONEXOS_DRY_RUN=true default; escrita fin015 sem caller ativo) | Não duplicar escritas irreversíveis; transições de lote atômicas com rollback DB; corridas resolvidas por optimistic lock + advisory lock; a run de auditoria reflete o estado real | 0 lotes finalizados 2× para o mesmo `flpCod`; 0 remessas `.REM` duplicadas; 0 `pagamento_ingestao_run` com `status='running'` órfão por >2× duração média; 0 baixa dupla via `.RET` reprocessado |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Serviços SISPAG com advisory lock para mutação cross-processo | 3/4 (`IngestaoPagamentos`, `FormacaoLotes`, `LotePagamento.incluirTitulo`; `RetornoOrquestracao` = TODO) | 4/4 (quando `RetornoOrquestracao` ativar) | ⚠️ | `grep -rn "withAdvisoryLock" src/backend/domain/service/sispag` |
| Transições de status com optimistic lock (versao) | 4/4 (finalizar/reabrir/cancelar/marcarRetorno) | 100% | ✅ | `LotePagamentoRepository.ts:392-419` |
| Multi-write atômico (`withTransaction`) em fluxos com ≥2 writes | 4/5: `incluirTitulo` (add+marcarManual+tocar), `removerItem` (del+marcarManual+tocar), `atualizarModalidadeItem` (upd+tocar), `montarGrupo` (criar+adicionarItens+tocar), `upsertMany` (chunks). Ausente: `criarLote`→`getLoteComItens` (2 statements, insert+select, mas 2ª leitura tolera perda) | 100% em paths de mutação | ✅ | `LotePagamentoService.ts:112-146,204-234,256-269`; `FormacaoLotesService.ts:81-109` |
| Escritas irreversíveis Conexos usando `postGenericOnce` / `postMultipartOnce` (sem retry cego) | 5/5 (`criarLote`, `importarTitulos`, `finalizarLote` [GET], `gerarRemessa`, `carregarArquivoRetorno`) | 100% | ✅ | `ConexosSispagWriteClient.ts:109,193,214,231`; `ConexosSispagRetornoClient.ts:277` |
| Idempotency-Key honrado em POST mutativo com efeitos duráveis | Backend: 1/2 (`/sispag/ingestao` sim; `/sispag/lotes/formar` não, só advisory lock) — Frontend: **0/2** (não emite header em nenhum caller) | Backend ≥1; Frontend deve emitir para o único endpoint que aceita | ⚠️ | `routes/sispag.ts:322`; `frontend/lib/sispag.ts` (nenhuma referência a Idempotency-Key) |
| Ledger write-ahead para escrita externa não-idempotente (retorno `.RET`) | 0 (TODO explícito em `RetornoOrquestracaoService.ts:121-123`) | 1 (`retorno_execucao` com idempotency_key UNIQUE) — bloqueante para sair do DRY-RUN | ❌ (dormant → P1) | `RetornoOrquestracaoService.ts:121-171` |
| Reaper de `pagamento_ingestao_run` órfão em `status='running'` | 0 (não existe) | 1 job/cron + timeout | ❌ | `grep -rn "reaper\|stuck\|orphan" src/backend` = 0 hits |
| Reconciliação periódica DB↔Conexos (títulos, lotes fin015) | 0 automática; a re-leitura em `incluirTitulo` (I2 autoritativa) é a única sanity check | 1 job periódico ou dashboard de drift | ⚠️ | `LotePagamentoService.ts:177-198` |
| Response-shape validation (Zod) em `ConexosSispagWriteClient` | 2/5 métodos (`criarLote` = LOTE_CRIADO_SCHEMA exige flpCod; `gerarRemessa` = SUCESSO_SCHEMA fraco `.optional().optional()`); demais confiam no shape cru | 5/5 mínimo em escritas | ⚠️ | `ConexosSispagWriteClient.ts:20-35,236` |
| Retry+jitter em queries DB transientes | Sim: `RetryExecutor` (3 tent., 200ms delay, 200ms jitter) em `PostgreeDatabaseClient.query` só para pool (transientes: MaxClientsInSessionMode, Connection terminated, too many clients, ECONNRESET) | Presente | ✅ | `PostgreeDatabaseClient.ts:36-42,196-201` |
| Cobertura de testes fault-tolerance SISPAG (versão conflict, lock busy, filial parcialmente falha, idempotency-key repetido) | 3/4 cenários testados (LotePagamento conflict/busy; Ingestao Promise.allSettled parcial). Falta: idempotency-key repetida com run em curso, migração 0030 idempotência re-run | ≥4/4 | ⚠️ | `LotePagamentoService.test.ts:359-360`; `IngestaoPagamentosService.test.ts` |
| Migrações destrutivas com política de rollback documentada / gating por env | 0/1 (0030 DELETE+DROP COLUMN sem gate de env, só guard de existência de coluna) | 1/1 (dry-run/env-gate/backup obrigatório) | ⚠️ | `migrations/0030_remove_internacional.sql:1-36` |

> ⚠️ **Não medível localmente**: taxa real de rollback por conflito de `versao` em produção (só via Postgres slow-query log + métricas do LogService `BUSINESS_WARN`). Recomendação: emitir counter `sispag.lote.versao_conflict.total` no LogService e alertar quando >5%/hora.
> ⚠️ **Não medível localmente**: MTTR real após crash de container mid-ingestão. Recomendação: rodar chaos test `SIGKILL -9` no processo entre `upsertMany` e `finishRun`.

## 3. Tactics — Cobertura no SISPAG

### Avoid Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A no domínio SISPAG (não há hot-standby de processo — cron é single-run) | N/A | — |
| Replacement | Pool de conexões pg (max=5) recriado no `on('error')` do pool | ✅ | `PostgreeDatabaseClient.ts:69-71` |
| Predictive Model | Ausente — sem instrumentação preditiva de exhaustão do pool | ❌ | `grep pool_stats` = 0 |
| Increase Competence Set | Doctrine documentada nos comentários: "escritas não-idempotentes → postGenericOnce, tentativa única" (invariante irreversible-write), gates explícitos `conexosWriteEnabled`/`conexosDryRun` | ✅ | `ConexosSispagWriteClient.ts:38-56` |

### Detect Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Sanity Checking | Zod parcial (LOTE_CRIADO exige flpCod positivo; SUCESSO fraco em gerarRemessa); re-leitura autoritativa Conexos em incluirTitulo (I2); anti-fantasma restrito a filiais lidas | ⚠️ parcial | `LotePagamentoService.ts:177-198`; `IngestaoPagamentosService.ts:94-117`; `ConexosSispagWriteClient.ts:20-35` |
| Comparison | `versao` esperada vs. atual (optimistic lock) — 100% das transições de lote | ✅ | `LotePagamentoRepository.ts:392-419` |
| Timestamp | `finished_at` e `atualizado_em` em todas as tabelas de estado; `finishRun` carimba resultado | ✅ | `PagamentoIngestaoRunRepository.ts:58-72` |
| Timeout | Pool `connectionTimeoutMillis=5000`, `idleTimeoutMillis=10000`. **Não há timeout por request Conexos exposto no client SISPAG** — herda o default do `axios` (sem timeout) via ConexosBaseClient | ⚠️ parcial | `PostgreeDatabaseClient.ts:27-29` |
| Condition Monitoring | LogService `BUSINESS_WARN`/`BUSINESS_INFO` em pontos críticos (filial falhou, lote conflict, retorno erro) | ⚠️ parcial (sem counters/alertas) | `IngestaoPagamentosService.ts:108-116`; `LotePagamentoService.ts:394-404` |
| Self-Test | Ausente para SISPAG (não há healthcheck que exercite fin015/fin052) | ❌ | — |
| Voting | N/A (single source of truth = Conexos) | N/A | — |

### Contain Faults
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Redundancy | N/A (single Postgres, single ERP Conexos) | N/A | — |
| Recovery — Backward (Rollback) | `withTransaction` faz `ROLLBACK` em qualquer throw dentro do `fn`; transação escopo-cliente atômica | ✅ | `PostgreeDatabaseClient.ts:102-123` |
| Recovery — Forward | Doutrina explícita: reconciliação manual quando Conexos não permite undo; frontal `LoteVersaoConflitoError` peça re-fetch e retry pelo cliente | ✅ | `LotePagamentoService.ts:236-238`; `ConexosSispagWriteClient.ts:38-56` |
| Reintroduction — Shadow / State Resync | Ausente para SISPAG (não há shadow write). O `.RET` DRY-RUN é preview, não shadow | ⚠️ | `RetornoOrquestracaoService.ts:112-119` |
| Reintroduction — Escalating Restart | Ausente (não há hierarquia de restart; cada job é fail-fast `process.exit(1)`) | ⚠️ | `jobs/ingest-pagamentos.ts:28-34` |

### Recover State
| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Rollback | `withTransaction` (BEGIN/COMMIT/ROLLBACK) + swallow silencioso do ROLLBACK-fail para expor o erro original | ✅ | `PostgreeDatabaseClient.ts:113-119` |
| Repair State | `desfazerAutomaticosVencidos` (cron rebuild dos lotes automáticos após título vencer); `marcarInativosForaDaRun` (anti-fantasma) | ✅ | `LotePagamentoRepository.ts:145-152`; `TituloAPagarRepository.ts:119-130` |
| Idempotent Replay | Ingestão: `Idempotency-Key` opcional + advisory lock. `upsertMany` = ON CONFLICT DO UPDATE. `adicionarItem` = ON CONFLICT DO NOTHING. **Ausente no `.RET`** (TODO ledger) | ⚠️ parcial | `IngestaoPagamentosService.ts:46-51`; `LotePagamentoRepository.ts:236,286`; `RetornoOrquestracaoService.ts:121` |
| Compensating Transaction | Ausente por escolha (Conexos não expõe undo limpo de fin015/fin052) — a doutrina é forward-recovery + reconciliação manual, coerente com a literatura (Garcia-Molina). Falta runbook | ⚠️ P3 doc gap | `ConexosSispagWriteClient.ts:38-56` |
| Reconcile | Re-leitura autoritativa Conexos no `incluirTitulo` (I2). Sem job periódico de reconciliação carteira↔ERP | ⚠️ parcial | `LotePagamentoService.ts:177-198` |
| Quarantine | Ausente — não há fila/estado "PENDENTE_REVISAO" para lote em drift | ❌ | `grep -rn "quarantine\|pendente_revisao"` = 0 |

## 4. Findings

### F-fault-tolerance-1: Migração 0030 destrói dados sem gate de ambiente nem política de rollback

- **Severidade**: P0
- **Tactic violada**: Increase Competence Set / Recovery — Backward
- **Localização**: `src/backend/migrations/0030_remove_internacional.sql:1-36`
- **Evidência (objetiva)**:
  ```sql
  -- 0030_remove_internacional.sql
  -- ⚠️ Destrutivo (apaga títulos/itens/lotes internacionais já ingeridos, dado dormente).
  DELETE FROM lote_pagamento_item WHERE internacional = TRUE;
  DELETE FROM titulo_a_pagar WHERE internacional = TRUE;
  DELETE FROM lote_pagamento l WHERE NOT EXISTS (SELECT 1 FROM lote_pagamento_item i WHERE i.lote_id = l.id);
  ALTER TABLE titulo_a_pagar DROP COLUMN IF EXISTS internacional;
  ALTER TABLE lote_pagamento_item DROP COLUMN IF EXISTS internacional;
  ```
  Único gate é a `IF EXISTS` sobre `information_schema.columns` (idempotência entre re-runs). Nenhum gate por env (ex.: `IF current_database() = 'financeiro_hml'`), nenhum snapshot obrigatório, nenhum `pg_dump` sinalizado. Se executada contra o Postgres errado (staging apontando para prod), destrói lotes órfãos silenciosamente e derruba colunas — irrecuperável sem PITR.
- **Impacto técnico**: DROP COLUMN é irreversível dentro da mesma migration; DELETE cascateia via FK. Sem PITR configurado no Supavisor pooler, não há rollback prático.
- **Impacto de negócio**: Perda de rastro contábil de títulos internacionais (dormentes, mas usados em relatórios históricos); se cair em prod errada, também apaga lotes vazios inclusive os que virariam vazios só temporariamente numa re-ingestão.
- **Métrica de baseline**: 0/1 migração destrutiva com env-gate; DROP COLUMN em 2 tabelas de estado (`titulo_a_pagar`, `lote_pagamento_item`) sem coluna preservada em audit-history.

### F-fault-tolerance-2: `pagamento_ingestao_run` fica órfão em `status='running'` se o processo cai mid-run (sem reaper)

- **Severidade**: P1
- **Tactic violada**: Condition Monitoring / Repair State
- **Localização**: `src/backend/domain/service/sispag/IngestaoPagamentosService.ts:67-161`; `src/backend/domain/repository/sispag/PagamentoIngestaoRunRepository.ts:40-72`
- **Evidência (objetiva)**:
  ```typescript
  // IngestaoPagamentosService.ts:67
  const runId = await this.runRepo.createRun({ triggeredBy: input.triggeredBy });  // insert status='running'
  try {
      // fan-out Conexos, upsertMany, marcarInativos...
      await this.runRepo.finishRun({ runId, status: 'success', ... });
  } catch (error) {
      await this.runRepo.finishRun({ runId, status: 'error', ... });
      throw error;
  }
  ```
  Se o container morre (SIGKILL, OOM, deploy) entre `createRun` e `finishRun`, o catch nunca roda e a row fica `status='running'` para sempre. `findLatestSuccessFinishedAt` filtra por `status='success'`, então o painel não mente sobre a carteira, mas: (a) a métrica de auditoria fica poluída; (b) uma tentativa de disparar `POST /sispag/ingestao` seguinte competirá pelo advisory lock — se o lock foi liberado (session-level, cai com a conexão morta) roda ok; se não caiu (transaction pooler mode + zombie), próximas 24h ficam em 409.
- **Impacto técnico**: Runs zumbis; painel de auditoria mostra ingestão fantasma "em andamento".
- **Impacto de negócio**: Analista não confia no timestamp de "carteira ingerida em"; troubleshoot manual sempre que houver deploy no meio de uma janela cron.
- **Métrica de baseline**: 0 jobs de reaper; TTL da idempotency = 24h mas `pagamento_ingestao_run` sem TTL de sanity.

### F-fault-tolerance-3: `RetornoOrquestracaoService` (dormant) não tem ledger write-ahead, advisory lock nem transição de status

- **Severidade**: P1 (dormant; P0 no dia do ativar)
- **Tactic violada**: Idempotent Replay / Recovery — Forward
- **Localização**: `src/backend/domain/service/sispag/RetornoOrquestracaoService.ts:60-198`
- **Evidência (objetiva)**:
  ```typescript
  // RetornoOrquestracaoService.ts:82
  // TODO(advisory-lock): envolver o corpo em `db.withAdvisoryLock(RETORNO_POLLER_LOCK_KEY, ...)`
  // ...
  // RetornoOrquestracaoService.ts:121
  // TODO(ledger): idempotência write-ahead — pular se este arquivo (hash/nome) já foi
  //   processado (tabela `retorno_execucao` com idempotency_key UNIQUE, espelhar
  //   PermutaExecucaoRepository). Gravar a intenção ANTES do upload.
  // ...
  // RetornoOrquestracaoService.ts:167
  // TODO(status): transicionar o lote `RETORNADO`→`BAIXADO`
  ```
  `carregarArquivoRetorno` já usa `postMultipartOnce` (bom), mas não há tabela `retorno_execucao` com `UNIQUE(idempotency_key)`. Reprocessar o mesmo `.RET` (nome/hash idêntico), ex. reader re-lista pasta após crash pós-upload, executaria 2× no ERP → baixa duplicada no fin010 → dashboard divergente.
- **Impacto técnico**: Duplo processamento de `.RET`; dupla baixa contra o mesmo título; sem forma automática de detectar (sem reconcile job).
- **Impacto de negócio**: Baixa duplicada = título aparece 2× no extrato contábil da Columbia; reconciliação manual toda semana.
- **Métrica de baseline**: 0/1 ledger write-ahead; 0/1 lock; 0/1 audit run repo (`retorno_execucao` inexistente). Cross-ref: `PermutaExecucaoRepository.findByIdempotencyKey` é o padrão a espelhar.

### F-fault-tolerance-4: `Idempotency-Key` aceito no backend mas nenhum caller frontend emite

- **Severidade**: P2
- **Tactic violada**: Idempotent Replay
- **Localização**: `src/backend/routes/sispag.ts:322` (backend aceita); `src/frontend/lib/sispag.ts:167-297` (frontend não envia)
- **Evidência (objetiva)**:
  ```typescript
  // routes/sispag.ts:322
  const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
  const result = await service.executar({ triggeredBy: ator(req), idempotencyKey });

  // frontend/lib/sispag.ts — grep "Idempotency" = 0 hits
  ```
  Advisory lock protege contra duplo POST simultâneo (retorna 409), mas duplo click com >run_duration entre eles (runs completam em segundos) dispara duas runs distintas. O ingest é read-only (só puxa e faz upsert), então o dano é limitado a duplicar trabalho e criar duas rows de auditoria — mas o mesmo endpoint no futuro pode virar a porta de entrada para operações mais críticas.
- **Impacto técnico**: 2 rows em `pagamento_ingestao_run` para o mesmo clique; duplicação de custo Conexos.
- **Impacto de negócio**: Baixo hoje (ingestão idempotente por UPSERT); mitigado pelo botão FE `disabled={loading}`.
- **Métrica de baseline**: 1/2 endpoints backend com Idempotency-Key; 0/1 frontend emitindo.

### F-fault-tolerance-5: Auditoria (`LogService.info`) fora da transação de mudança de estado

- **Severidade**: P2
- **Tactic violada**: Increase Competence Set / cross-QA Security (auditabilidade)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:112-146,239-274,336-368`
- **Evidência (objetiva)**:
  ```typescript
  // LotePagamentoService.ts:112
  await this.db.withTransaction(async (tx) => {
      const afetadas = await this.repo.atualizarModalidadeItem(...);
      // ...
      await this.repo.tocarLote(input.loteId, tx);
  });
  // Fora da transação — se logService falhar, estado já foi commited SEM audit.
  await this.audit('atualizarModalidadeItem', input.loteId, input.ator, {...});
  ```
  `LogService` hoje escreve em console/appender (não em tabela relacional), então "falhar" é raro. Mas quando a proposta de audit_log persistido chegar (invariante cross-cutting), este padrão viola dual-write: a transição commita, o audit falha, e o rastro contábil fica ausente.
- **Impacto técnico**: Gap no rastro who/when/what quando o audit passar a persistir.
- **Impacto de negócio**: Auditoria contábil incompleta = risco de compliance/SOX-lite quando SISPAG virar fonte financeira.
- **Métrica de baseline**: 6 pontos onde `this.audit(...)` roda fora do `withTransaction`.

### F-fault-tolerance-6: `SUCESSO_SCHEMA` de `gerarRemessa` aceita silenciosamente resposta sem `valid`

- **Severidade**: P2
- **Tactic violada**: Sanity Checking
- **Localização**: `src/backend/domain/client/ConexosSispagWriteClient.ts:32-35,226-244`
- **Evidência (objetiva)**:
  ```typescript
  const SUCESSO_SCHEMA = z.object({
      valid: z.string().optional(),
      message: z.string().optional(),
  });
  // ...
  const parsed = SUCESSO_SCHEMA.parse(raw ?? {});
  return { sucesso: (parsed.valid ?? '').toUpperCase() === 'SUCESSO', ... };
  ```
  Ambos os campos `.optional()`. Se o ERP responder `{}` (ex.: 200 vazio, edge do Nexxera), `parsed.valid = undefined` → `sucesso: false` **sem throw** — o caller precisa checar o boolean, mas nada obriga. Escrita irreversível já rolou (`.REM` gerado), e o serviço orquestrador chamador acha que "não gerou" e re-tenta → potencial duplo `.REM`.
- **Impacto técnico**: Silent false-negative em resposta ambígua → risco de retry manual duplicando a remessa CNAB.
- **Impacto de negócio**: Duas remessas para o Nexxera com o mesmo lote = duplo pagamento se o banco não deduplica pelo `seqNum`.
- **Métrica de baseline**: 1/1 schema com todos os campos opcionais em endpoint de escrita irreversível.

### F-fault-tolerance-7: Sem timeout explícito nos POSTs Conexos (SISPAG herda default axios = sem timeout)

- **Severidade**: P2
- **Tactic violada**: Timeout
- **Localização**: `src/backend/domain/client/ConexosSispagWriteClient.ts` (todos os métodos) via `ConexosBaseClient.postGenericOnce`
- **Evidência (objetiva)**: `grep -rn "timeout" src/backend/domain/client/Conexos*.ts` — nenhum retorno para `postGenericOnce`/`postMultipartOnce`; o `axios` sem `timeout` explícito espera indefinidamente. Um Conexos que aceita a request mas fica pendurado no COMMIT interno pode segurar o worker Express por minutos, sem forma de dizer "assume fail e re-tenta" (que aqui é proibido, single-shot).
- **Impacto técnico**: Pool de conexões DB pode empatar (max=5) atrás de um POST pendurado; requests concorrentes falham em `connectionTimeoutMillis=5s`.
- **Impacto de negócio**: SISPAG "trava" 100% até restart do processo.
- **Métrica de baseline**: 0/5 métodos com timeout explícito < 60s.

### F-fault-tolerance-8: Reconciliação DB↔Conexos ausente (drift silencioso)

- **Severidade**: P1
- **Tactic violada**: Reconcile
- **Localização**: nenhum arquivo — `grep -rn "reconciliation\|reconcile\|drift" src/backend/domain/service/sispag` = 0 hits
- **Evidência (objetiva)**: A única sanity é a re-leitura autoritativa em `LotePagamentoService.incluirTitulo` (I2, por título selecionado). Não há job periódico que peça ao Conexos "quais títulos você acha que estão pagos?" e compare com nossa carteira. Um título marcado `pago=true` no ERP por outro caminho (SISPAG antigo, ajuste manual) fica na carteira até a próxima ingestão diária — janela de até 24h. E `titulo_a_pagar.pago` é filtrado no upsert (`if (t.pago) continue;`), mas se uma filial falhou na ingestão, seus títulos ficam `ativo=true, pago=false` mesmo se foram pagos externamente.
- **Impacto técnico**: Drift local vs. ERP até janela seguinte de ingestão bem-sucedida por filial. Sem alerta.
- **Impacto de negócio**: Analista pode incluir num lote SISPAG um título que já foi pago manualmente → I2 pega no momento da inclusão (bom), mas painel/relatório mente até lá.
- **Métrica de baseline**: janela de drift = tempo_desde_última_ingestão_com_sucesso_por_filial (não medido); alvo <2h.

## 5. Cards Kanban

### [fault-tolerance-1] Blindar migração 0030 (e futuras destrutivas) com env-gate e política de snapshot

- **Problema**
  > `0030_remove_internacional.sql` faz `DELETE` em 3 tabelas + `DROP COLUMN` em 2, protegido apenas por `IF EXISTS` (idempotência entre re-runs), sem gate de ambiente nem exigência de snapshot. Se rodada contra a base errada em deploy misconfigured, a perda é irrecuperável (sem PITR configurado no Supavisor).

- **Melhoria Proposta**
  > Adicionar preambulo `DO $$ ... IF current_database() NOT IN ('financeiro_hml','financeiro_prod') THEN RAISE EXCEPTION ... END IF; END $$` em toda migração com DELETE massivo/DROP COLUMN. Instituir política: PR de migração destrutiva exige (a) `pg_dump` linkado no PR, (b) rodada em HML primeiro com diff quantitativo, (c) revisor humano diferente do autor. Documentar em `docs/migrations-runbook.md`. Tactic Bass = *Increase Competence Set*.

- **Resultado Esperado**
  > Migrações destrutivas param se rodadas fora do allowlist. Runbook publicado. Métrica: 0 → 100% das migrations com `DELETE`/`DROP` protegidas por env-gate.

- **Tactic alvo**: Increase Competence Set
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - Migrations destrutivas com env-gate: 0/1 → 1/1
  - Runbook publicado: não → sim
- **Risco de não fazer**: 1 deploy misconfigured = perda irreversível de rastro histórico + retrabalho contábil semanas.
- **Dependências**: nenhuma

### [fault-tolerance-2] Reaper de `pagamento_ingestao_run` órfão em `status='running'`

- **Problema**
  > Se o processo cai entre `createRun` (status='running') e `finishRun`, a row fica running para sempre. `findLatestSuccessFinishedAt` mascara o problema no painel, mas polui a auditoria e pode fazer confusão em troubleshoot pós-deploy.

- **Melhoria Proposta**
  > Adicionar coluna `runtime_expected_at` (started_at + 15min p.ex.) ou query de reaper `UPDATE pagamento_ingestao_run SET status='error', error_message='reaped: no heartbeat', finished_at=now() WHERE status='running' AND started_at < now() - INTERVAL '30 minutes'`. Rodar como cron leve pré-`POST /sispag/ingestao` (self-healing) e no boot do processo. Tactic Bass = *Condition Monitoring* + *Repair State*.

- **Resultado Esperado**
  > Nenhuma run zumbi >30min. Métrica: `pagamento_ingestao_run WHERE status='running' AND started_at < now() - INTERVAL '30 minutes'` = 0.

- **Tactic alvo**: Condition Monitoring / Repair State
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - Runs órfãs (>30min em 'running'): não medido → 0
  - Advisory lock zombie após crash: variável → sempre liberado (pré-check no boot)
- **Risco de não fazer**: Auditoria poluída degrada confiança do analista; janela de 24h de idempotency-key preso caso lock não caia com a conexão.
- **Dependências**: nenhuma

### [fault-tolerance-3] Construir ledger `retorno_execucao` + advisory lock + status BAIXADO antes de ativar RetornoOrquestracaoService

- **Problema**
  > `RetornoOrquestracaoService` está pronto no formato (client `postMultipartOnce`, dry-run default) mas com 4 TODOs de correção obrigatória: ledger write-ahead por idempotency_key (hash do `.RET`), advisory lock do poller, run de auditoria persistida, e o status `BAIXADO` + correlação lote↔arquivo_retorno. Sair do DRY-RUN sem essas peças = risco de dupla baixa no fin010.

- **Melhoria Proposta**
  > Antes de ligar `CONEXOS_WRITE_ENABLED=true` para o poller: (1) migration `0032_retorno_execucao` com `UNIQUE(idempotency_key)` espelhando `PermutaExecucaoRepository`; (2) `withAdvisoryLock(RETORNO_POLLER_LOCK_KEY)` no corpo; (3) `RetornoIngestaoRunRepository` espelhando `PagamentoIngestaoRunRepository`; (4) migration `0033_lote_baixado` adicionando o status + FK lote↔arquivo. Tactic Bass = *Idempotent Replay* + *Repair State*.

- **Resultado Esperado**
  > Reprocessar o mesmo `.RET` = no-op (retorna a execução prévia); poller nunca roda 2× simultâneo; audit trail persistido. Métrica: 0 `.RET` processados 2× por hash.

- **Tactic alvo**: Idempotent Replay / Recovery — Forward
- **Severidade**: P1 (dormant) → P0 no dia de ativar
- **Esforço estimado**: L
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - Ledger `retorno_execucao` existe: não → sim
  - Advisory lock do poller: TODO → implementado
  - Baixa dupla por `.RET` reprocessado: potencial → 0
- **Risco de não fazer**: Fatia 3 sai para produção com dupla baixa possível → reconciliação contábil manual pesada.
- **Dependências**: HAR do `arquivosRetorno/processar` (ver `ontology/_inbox/sispag-fin052-exploration.md`)

### [fault-tolerance-4] Frontend passa a emitir Idempotency-Key em POST /sispag/ingestao

- **Problema**
  > Backend aceita `Idempotency-Key` em `/sispag/ingestao`, mas nenhum caller frontend emite. Duplo click com >run_duration entre eles dispara duas runs distintas (o advisory lock só protege contra concorrência simultânea).

- **Melhoria Proposta**
  > No `frontend/lib/sispag.ts`, gerar `crypto.randomUUID()` por clique da ação (guardar no state até resolve/erro) e passar no header. Espelhar padrão que Permutas já tem no `runEleicao` (se houver) ou o mesmo padrão do ledger de execução. Tactic Bass = *Idempotent Replay*.

- **Resultado Esperado**
  > 2 cliques no mesmo botão resultam em 1 run + 1 resposta idempotente (mesmo runId). Métrica: rows `pagamento_ingestao_run` por sessão de clique = 1.

- **Tactic alvo**: Idempotent Replay
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - Callers frontend com Idempotency-Key: 0/1 → 1/1
- **Risco de não fazer**: Baixo hoje (ingestão idempotente por UPSERT); dívida arma armadilha quando `/formar` virar mutativo.
- **Dependências**: nenhuma

### [fault-tolerance-5] Auditoria persistida no mesmo `withTransaction` da mudança de estado

- **Problema**
  > `LotePagamentoService` chama `this.audit(...)` (LogService.info) FORA do `withTransaction` de todas as transições. Hoje LogService escreve em console e falhar é raro; quando a proposta de `audit_log` persistido chegar (invariante cross-cutting), o dual-write não-atômico deixa o rastro contábil incompleto ao menor blip.

- **Melhoria Proposta**
  > Modelar `audit_log` via `/feature-new`, e refatorar `LotePagamentoService.audit` para aceitar um `tx?: TransactionClient` e ser chamado DENTRO do `withTransaction` das transições. Tactic Bass = *Increase Competence Set*.

- **Resultado Esperado**
  > Toda mudança de estado gera ≥1 row em `audit_log` na mesma transação (commit-together ou rollback-together). Métrica: 6/6 callsites `this.audit` migrados para dentro da tx.

- **Tactic alvo**: Increase Competence Set
- **Severidade**: P2 (P1 assim que audit for persistido)
- **Esforço estimado**: M (depende do modelo audit_log)
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - Callsites `audit()` dentro de `withTransaction`: 0/6 → 6/6
- **Risco de não fazer**: Auditoria contábil com furos → compliance falha em SOX-lite quando SISPAG virar fonte de verdade.
- **Dependências**: `/feature-new audit_log` (invariante cross-cutting da proposta)

### [fault-tolerance-6] Endurecer `SUCESSO_SCHEMA` do `gerarRemessa` para exigir `valid='SUCESSO'`

- **Problema**
  > O schema Zod atual aceita `{}` como resposta válida e devolve `sucesso: false` sem lançar. Escrita irreversível já rolou (`.REM` gerado); um caller ingênuo re-tenta e gera outro `.REM` → risco de duplo pagamento se o banco não deduplica pelo `seqNum`.

- **Melhoria Proposta**
  > `SUCESSO_SCHEMA = z.object({ valid: z.string() /*required*/, message: z.string().optional() }).refine(o => o.valid.toUpperCase() === 'SUCESSO', 'gerarRemessa não retornou SUCESSO')`. Falha do parse vira `ConexosError` com "resposta inesperada", que o orquestrador trata como *reconciliação manual obrigatória* (não retry). Tactic Bass = *Sanity Checking*.

- **Resultado Esperado**
  > Resposta ambígua do fin015/gerarRemessa vira erro explícito, não silent-false. Métrica: 1/1 endpoint de escrita com resposta obrigatoriamente validada.

- **Tactic alvo**: Sanity Checking
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - Schemas de resposta em escritas com todos os campos required: 1/2 → 2/2 (incluir também `LOTE_CRIADO_SCHEMA` que já está bom)
- **Risco de não fazer**: Duplo `.REM` em prod quando Fatia 3 ativar; duplo pagamento no Nexxera.
- **Dependências**: F-fault-tolerance-3 (o orquestrador chamador tem que existir)

### [fault-tolerance-7] Timeout explícito nos POSTs Conexos SISPAG (≤60s)

- **Problema**
  > Nenhum método do `ConexosSispagWriteClient` nem `ConexosSispagRetornoClient` passa `timeout` no axios; herdam default (sem timeout). Um Conexos pendurado empata o pool de conexões DB (max=5) e trava SISPAG inteiro até restart.

- **Melhoria Proposta**
  > Padronizar `timeout: 60_000` (60s) para `postGenericOnce` e `postMultipartOnce` no `legacyConexosAdapter`; expor via param opcional para o caller sobrescrever. Escrever teste que valida o timeout com um servidor mock que não responde. Tactic Bass = *Timeout*.

- **Resultado Esperado**
  > POST pendurado é abortado em 60s → escrita irreversível fica em "estado desconhecido" (ledger `pending`, reconciliação manual) mas não empata processo. Métrica: % chamadas Conexos com timeout explícito = 100%.

- **Tactic alvo**: Timeout
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - Métodos Conexos SISPAG com timeout: 0/5 → 5/5
- **Risco de não fazer**: 1 blip Conexos = SISPAG parado até restart do container. Cross-ref qa-availability e qa-performance.
- **Dependências**: nenhuma

### [fault-tolerance-8] Job de reconciliação diária DB↔Conexos (drift detector)

- **Problema**
  > A única sanity DB↔ERP é a re-leitura no `incluirTitulo`. Sem job periódico que verifique se títulos marcados `pago=false` local ainda estão a pagar no ERP → drift silencioso na janela até a próxima ingestão bem-sucedida por filial.

- **Melhoria Proposta**
  > Novo job `reconcile-carteira.ts` (cron horário) que amostra N títulos aleatórios `ativo=true, pago=false` e re-checa via `ConexosSispagClient.getTituloAPagar`. Divergências → grava em `titulo_a_pagar_drift` (nova tabela) + alerta LogService `BUSINESS_WARN`. Métrica no painel. Tactic Bass = *Reconcile*.

- **Resultado Esperado**
  > Drift detectado em <1h após ocorrer no ERP. Métrica: janela de drift p95 < 1h.

- **Tactic alvo**: Reconcile
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-8
- **Métricas de sucesso**:
  - Job de reconciliação: 0 → 1
  - Janela de drift p95: até 24h → <1h
- **Risco de não fazer**: Painel/relatório mentindo silenciosamente sobre "títulos a pagar"; analista pode montar lote com título já pago fora.
- **Dependências**: nenhuma (I2 no `incluirTitulo` continua sendo o gate autoritativo em runtime)

## 6. Notas do agente

- **Escopo**: SISPAG (Frente II) apenas — write path fin015 (`ConexosSispagWriteClient`) e retorno fin052 (`RetornoOrquestracaoService` + `carregarArquivoRetorno`) tratados como DORMENTES conforme SCOPE NOTES do `_shared-metrics.md`; achados sobre eles são "quando ativar", não "quebrado agora". A doutrina de escrita irreversível (`postGenericOnce`, Zod exigindo id confirmado, tentativa única) está BEM aplicada — o gap é infraestrutural (ledger + status + advisory lock no retorno).
- **Não medível localmente**: MTTR real após SIGKILL mid-ingestão; taxa de conflitos `LoteVersaoConflitoError` em produção; janela real de drift DB↔Conexos. Todas precisam de instrumentação (CloudWatch/Prometheus counters no LogService) — recomendo emitir counters nomeados por evento (F-fault-tolerance-2/8).
- **Cross-QA**:
  - Timeouts ausentes (F7) → **qa-availability** e **qa-performance**.
  - Auditoria fora da transação (F5) → **qa-security** (auditabilidade / não-repúdio).
  - Idempotency-Key não emitida pelo FE (F4) e testes fault-tolerance parciais → **qa-testability**.
  - Migração destrutiva sem env-gate (F1) → **qa-deployability**.
  - Reconciliação ausente (F8) → **qa-integrability** (drift de fonte de verdade).
