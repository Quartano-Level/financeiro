---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-07-07-1841
agent: qa-fault-tolerance
generated_at: 2026-07-07T18:45:00-03:00
scope: backend
score: 7.0
findings_count: 10
cards_count: 10
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Duas analistas concorrentes (montagem paralela) + double-click em botões + retry de proxy + queda momentânea do Conexos durante `getTituloAPagar` | Corrida (same título → 2 lotes) · finalizar/reabrir/cancelar sobre `versao` estáveis · POST duplicado · timeout no ERP mid-include | `LotePagamentoService.incluirTitulo` / `finalizarLote` / `criarLoteComSelecionados` (frontend) | Fatia 2 — LOCAL persist only, ZERO writes ao Conexos (I1 preservado por escopo) | I3 impede título em 2 lotes RASCUNHO · I6 (optimistic lock) rejeita `versao` obsoleta · falha no Conexos aborta antes de qualquer mutação · lote nunca fica em estado indefinido | 0 duplicações do mesmo (filCod,docCod,titCod) em lotes RASCUNHO simultâneos · 0 `finalizado_por/em` inconsistentes · empty-lote não bloqueia gate (`contarItens=0 ⇒ 409`) |

> **Escopo real desta fatia**: só há mutação **do banco Postgres local**. Não há remessa, não há baixa, não há chamada de escrita ao ERP. O bar "no double-execution of financial write" ainda **não aplica em toda a sua força** — o que se defende aqui é a **consistência do agregado local** que a Fatia 3 (remessa) vai usar como fonte de verdade. Uma falha aqui não move dinheiro, mas contamina a Fatia 3.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Endpoints POST/DELETE mutantes com serialização por chave de domínio (advisory lock) | 1 / 5 (só `incluirTitulo`; criar/remover/finalizar/reabrir/cancelar dependem de `versao` optimistic) | ≥ 1 (o crítico é I3) | ✅ | `LotePagamentoService.ts:60-152` |
| Multi-writes (item + `tocarLote`) executados em `withTransaction` | 2 / 2 caminhos (incluir e remover) | 100% | ✅ | `LotePagamentoService.ts:114-140`, `154-174` |
| Chamada externa (Conexos `getTituloAPagar`) **fora** da transação | Sim | Sim (evitar segurar tx durante rede) | ✅ | `LotePagamentoService.ts:87-91` (fora); `114` (transação começa depois) |
| Endpoints POST com `Idempotency-Key` honrado | 0 / 5 | ≥ 1 (criar lote é o mais sensível a double-click) | ⚠️ | `routes/sispag.ts:100-201` — nenhuma leitura de header |
| Auditoria em armazenamento **persistido** (quem, quando, o quê) | 0 tabelas · 4 chamadas a `logService.info` (stdout) | ≥ 1 tabela `audit_log` com FK ao lote | ❌ | `LotePagamentoService.ts:283-293`; `LogService.ts:26` (`process.stdout.write`) |
| Testes cobrindo `transicionarStatus` SQL (repositório) | 0 (só service-level com repo mockado) | ≥ 3 (FINALIZADO happy · RASCUNHO reabrir · CANCELADO preserva `finalizado_por`) | ❌ | ausência em `repository/sispag/` (`ls` só mostra `LotePagamentoRepository.ts`) |
| Testes cobrindo o disambiguation `rowCount=0 ⇒ versão vs. estado` | 1 (só a versão) | 2 (o "estado incompatível" também) | ⚠️ | `LotePagamentoService.test.ts:202-211` |
| Frontend — loop multi-título com "commit-or-nothing" atômico | 0 (loop for/await; falhas parciais permanecem) | atômico OU cleanup automático do lote vazio | ⚠️ | `app/sispag/page.tsx:191-208` |
| Cleanup / reaper de lote RASCUNHO abandonado (empty ou parcialmente montado) | ausente | job/EventBridge N horas | ❌ | não há job/cron em `src/backend/jobs/probe-sispag*.ts` — apenas probes |
| Timeout do `getTituloAPagar` no boundary (isolado) | 40 s (herdado do axios default) | 5–10 s + circuit breaker | ⚠️ | `services/conexos.ts:90-92` (`timeout: 40000`) |
| DB advisory-lock e transação em sessões distintas (2 pooled clients) | Sim (documentado, correto por semântica cooperativa) | seguro se **todos** os writers respeitarem o lock — verificado | ✅ | `PostgreeDatabaseClient.ts:137-158` + `LotePagamentoService.ts:114` |

> ⚠️ **Não medível localmente**: taxa real de retries do RetryExecutor no `getTituloAPagar` sob carga, latência p95 do include, tempo médio de posse do advisory lock. Requer CloudWatch/produção. Recomendação: emitir métrica `lote_incluir_lock_held_ms` (histograma) no finally do `withAdvisoryLock`.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Substitution** (Avoid) | Fatia por design não substitui o ERP em nada de escrita — I1 preservado por escopo | ✅ | `routes/sispag.ts:15-20` (contrato READ-ONLY) |
| **Replacement** | N/A — sem componente ativo/passivo para trocar | N/A | — |
| **Predictive Model** | Ausente — não há previsão de fila crítica | ⚠️ parcial | — |
| **Increase Competence Set** | I2 (elegibilidade autoritativa por re-leitura Conexos) — expande o conjunto de estados "aceitáveis" antes de gravar; captura snapshot anti-drift | ✅ | `LotePagamentoService.ts:87-112` |
| **Sanity Checking** (Detect) | Zod nos DTOs Conexos (`tituloRowSchema`) + validação prévia de `pago`/`liberado` | ✅ | `ConexosSispagClient.ts:39-53`, `165-193` |
| **Comparison** | Optimistic lock por `versao` = comparação da cópia otimista da analista contra a autoritativa do DB | ✅ | `LotePagamentoRepository.ts:231-258` |
| **Timestamp** | `criado_em`, `atualizado_em`, `finalizado_em` na tabela; ausente em auditoria (só stdout) | ⚠️ parcial | `migrations/0023_lote_pagamento.sql:24-25` |
| **Timeout** | 40 s no axios Conexos legacy — herdado, não específico do `getTituloAPagar`; sem circuit breaker | ⚠️ parcial | `services/conexos.ts:92` |
| **Condition Monitoring** | Ausente — nenhum reaper detecta lote RASCUNHO abandonado / com Conexos hang | ❌ | `jobs/probe-sispag*.ts` são probes one-shot, não daemons |
| **Self-Test** | Ausente | ❌ | — |
| **Voting** | N/A — não há redundância ativa | N/A | — |
| **Redundancy** (Contain) | Pool de 5 conexões PG + `RetryExecutor` no query path (Postgres) | ✅ | `PostgreeDatabaseClient.ts:26-42` |
| **Recovery — Forward** | Falha durante include → estado local intocado → analista repete (o comportamento é "forward via retry manual") | ✅ | `LotePagamentoService.ts:87-140` (Conexos read ANTES da tx; nada é gravado até I2+I3 passarem) |
| **Recovery — Backward** | `withTransaction` faz ROLLBACK do INSERT + `tocarLote` como unidade atômica | ✅ | `PostgreeDatabaseClient.ts:102-123` |
| **Reintroduction — Shadow / State Resync / Escalating Restart** | N/A (sem worker recuperável) | N/A | — |
| **Rollback** (Recover) | Backward recovery via BEGIN/ROLLBACK; `versao` não é incrementado se a tx aborta | ✅ | `PostgreeDatabaseClient.ts:113-119` |
| **Repair State** | Ausente — não há rota administrativa para "purgar lotes RASCUNHO abandonados" | ❌ | — |
| **Idempotent Replay** | `incluirTitulo` é idempotente (2 caminhos: memory-check `lote.itens.some` + `ON CONFLICT DO NOTHING`) | ✅ | `LotePagamentoService.ts:82-84`; `LotePagamentoRepository.ts:181-197` |
| **Idempotent Replay — criarLote** | ❌ Ausente. `POST /lotes` sem Idempotency-Key: double-click cria 2 lotes vazios | ❌ | `routes/sispag.ts:100-114` |
| **Compensating Transaction** | N/A (sem escrita externa nesta fatia — a Fatia 3 herda o problema) | N/A | — |
| **Reconcile** | N/A nesta fatia (nada foi gravado no ERP para reconciliar); a base para reconcile futura EXISTE (snapshot `credor/valor/vencimento` no item) | ✅ (parcial) | `migrations/0023_lote_pagamento.sql:34-37` |
| **Quarantine** | Fila de exceção / blocked-items para lote "preso" ainda não existe | ❌ | — |

## 4. Findings (achados)

### F-fault-tolerance-1: Auditoria não persistida — `this.audit()` grava em stdout, não em tabela

- **Severidade**: P1
- **Tactic violada**: Timestamp / Repair State (audit é a base do Repair). Invariante transversal da proposta ("who/when/what persistido em cada mutação de estado").
- **Localização**:
  - `src/backend/domain/service/sispag/LotePagamentoService.ts:283-293` (chama `this.logService.info`)
  - `src/backend/domain/service/LogService.ts:26` (`process.stdout.write(...)`)
- **Evidência (objetiva)**:
  ```ts
  // LotePagamentoService.ts:283-293
  private audit = (
      acao: string, loteId: string, ator: string, extra: Record<string, unknown>,
  ): Promise<void> =>
      this.logService.info({ type: LOG_TYPE.BUSINESS_INFO, message: `SISPAG lote: ${acao}`, ... });

  // LogService.ts:26
  process.stdout.write(`${JSON.stringify(logBody)}\n`);
  ```
- **Impacto técnico**: nenhum registro persistido na tabela de quem finalizou/reabriu/cancelou/incluiu além do último-writer stamp (`finalizado_por`, `incluido_por`). Não é possível reconstruir a trilha (ex.: analista A finalizou, B reabriu, A finalizou de novo — só sobra o último). Além disso, o `await this.audit(...)` acontece **depois** do COMMIT (`LotePagamentoService.ts:141-144`, `256`) — é dual-write não-atômico: se o processo cai entre COMMIT e stdout, a mutação ocorreu sem áudio.
- **Impacto de negócio**: quando a Fatia 3 (write ao ERP) chegar, este gap vira P0 — "quem executou a remessa" precisa ser incontestável para SOX/auditoria financeira.
- **Métrica de baseline**: `# tabelas audit_log = 0`; `# state-mutating callsites sem write persistido pareado = 4` (criar, incluir, remover, transicionar).

### F-fault-tolerance-2: SQL do `transicionarStatus` sem cobertura de teste

- **Severidade**: P1
- **Tactic violada**: Sanity Checking / Self-Test (na camada de dados)
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:231-258` — nenhum arquivo `LotePagamentoRepository.test.ts`.
- **Evidência (objetiva)**:
  ```ts
  // LotePagamentoRepository.ts:242-249 — SQL com interpolação condicional de string
  `UPDATE lote_pagamento
   SET status = $para, versao = versao + 1, atualizado_em = now(),
       finalizado_por = ${setFinal ? '$finalizadoPor' : "CASE WHEN $para = 'RASCUNHO' THEN NULL ELSE finalizado_por END"},
       finalizado_em  = ${setFinal ? 'now()' : "CASE WHEN $para = 'RASCUNHO' THEN NULL ELSE finalizado_em END"}
   WHERE id = $id AND versao = $versaoEsperada AND status = ANY($de)`
  ```
  O `$para` é referenciado **três vezes**; o `SqlBuilder` precisa lidar com repetição de nome. Testes de serviço (`LotePagamentoService.test.ts`) mockam o repositório e nunca executam este SQL.
- **Impacto técnico**: uma regressão silenciosa no path "cancelar um lote FINALIZADO" que apagasse `finalizado_por` (perdendo o histórico de quem finalizou) não seria pega. Idem para o path reabrir — se o CASE quebrar, `finalizado_por` fica preservado indevidamente, contaminando a próxima finalização.
- **Impacto de negócio**: dado apagado silenciosamente = perda de trilha para auditoria financeira; contaminação cruzada de "finalizadoPor" entre analistas = disputa de responsabilidade.
- **Métrica de baseline**: `# testes que exercitam transicionarStatus contra Postgres = 0`; `# variantes de status na função = 3 (finalizar, reabrir, cancelar)`; alvo `= 3`.

### F-fault-tolerance-3: Loop multi-título no frontend deixa lote parcial/vazio se interrompido

- **Severidade**: P1
- **Tactic violada**: Rollback (nível de UX / operação de negócio) / Repair State
- **Localização**: `src/frontend/app/sispag/page.tsx:176-217` (função `criarLoteComSelecionados`).
- **Evidência (objetiva)**:
  ```ts
  // page.tsx:186-198
  const lote = await criarLote({ filCod });
  let ok = 0;
  const falhas: string[] = [];
  for (const t of selTitulos) {
      try { await incluirTitulo(lote.id, { ... }); ok += 1; }
      catch (e) { falhas.push(`${t.docCod}/${t.titCod}: ...`); }
  }
  ```
  Não há transação de negócio. Se a aba fechar entre `criarLote` e o primeiro `incluirTitulo`, ou se a rede cair mid-loop, o lote RASCUNHO **fica vazio ou parcialmente montado** no banco. Não há reaper nem TTL — o lote fica ali para sempre até que uma analista o cancele manualmente.
- **Impacto técnico**: gate `finalizarLote` protege o downstream (`contarItens=0 ⇒ 409`), então um lote vazio não vira remessa. Mas: (a) polui a lista de "lotes candidatos" (KPI e aba), (b) engorda a tabela `lote_pagamento` sem valor, (c) confunde a analista ("de onde veio esse lote vazio?"). Um lote parcialmente montado (ex.: 3 de 8 títulos) é ainda pior — a analista pode finalizá-lo achando que está completo.
- **Impacto de negócio**: pagamento incompleto — analista finaliza + envia remessa (Fatia 3) achando "todos os 8 títulos entraram", mas só 3 seguem para o banco. Os outros 5 ficam vencidos.
- **Métrica de baseline**: `# transações de negócio "criar-lote-com-N-titulos" = 0 backend, apenas loop no cliente`; `# reapers/TTL para lote RASCUNHO abandonado = 0`.

### F-fault-tolerance-4: `LoteVersaoConflitoError(versaoEsperada: -1)` no `onBusy` mistura semânticas

- **Severidade**: P2
- **Tactic violada**: Sanity Checking / Comparison (via detecção mais fina)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:147-150`
- **Evidência (objetiva)**:
  ```ts
  async () => {
      // Outro processo inclui o MESMO título agora — peça retry.
      throw new LoteVersaoConflitoError({ loteId: input.loteId, versaoEsperada: -1 });
  },
  ```
  `LoteVersaoConflitoError.userMessage = 'Este lote foi alterado por outra pessoa. Recarregue e tente de novo.'`. Mas o cenário real é: **o mesmo título está sendo incluído concorrentemente** (double-click, retry cego). A mensagem induz a analista a pensar que outra pessoa mexeu no LOTE dela.
- **Impacto técnico**: código de erro sobreposto complica telemetria (você não distingue "conflito de versão" real de "advisory-lock busy"). O `versaoEsperada: -1` é sentinela mágica.
- **Impacto de negócio**: analista confusa faz F5 sem necessidade, ou pior — reinicia o fluxo achando que perdeu o trabalho.
- **Métrica de baseline**: `# códigos de erro distintos para casos distintos = 1 (mesmo LOTE_VERSAO_CONFLITO)`; alvo `= 2` (adicionar `TITULO_INCLUSAO_CONCORRENTE`).

### F-fault-tolerance-5: Disambiguation `rowCount=0` versão-vs-estado é best-effort, sem re-leitura em transação

- **Severidade**: P2
- **Tactic violada**: Comparison (a comparação é feita fora da transação que falhou)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:241-255`
- **Evidência (objetiva)**:
  ```ts
  if (afetadas === 0) {
      const atual = await this.exigirLote(input.loteId);   // ← leitura no pool, SEM tx
      if (atual.versao !== input.versao) throw new LoteVersaoConflitoError(...);
      throw new LoteEstadoInvalidoError(...);
  }
  ```
  Entre o `UPDATE` (que retornou 0) e o `exigirLote` (que relê), outra transação pode ter avançado `versao`. O falso positivo mais provável: T1 finalizar falha por estado (não era RASCUNHO); T2 reabrir bumpa `versao` entre o falha do T1 e a re-leitura → T1 recebe `LoteVersaoConflitoError` embora a causa raiz fosse "estado incompatível".
- **Impacto técnico**: mensagem de erro incorreta para a analista; telemetria de "quantos conflitos de versão vs. estado" fica enviesada.
- **Impacto de negócio**: baixo — em ambos os casos a UX recomendada é a mesma (recarregar). Mas o dashboard de saúde do sistema perde precisão.
- **Métrica de baseline**: `# testes cobrindo o caminho "estado inválido" pós-`rowCount=0` = 0`; alvo `≥ 1`.

### F-fault-tolerance-6: I3 (título não em 2 lotes RASCUNHO) sem constraint DB

- **Severidade**: P2
- **Tactic violada**: Redundancy / Sanity Checking (falta defense-in-depth no schema)
- **Localização**:
  - Migração: `src/backend/migrations/0023_lote_pagamento.sql:44-49` (comentário assumindo cooperação)
  - Enforcement único: `LotePagamentoService.ts:114-125` (via advisory lock)
- **Evidência (objetiva)**:
  ```sql
  -- 0023_lote_pagamento.sql:45-47
  -- Apoio ao I3 (título não pode estar em 2 lotes RASCUNHO): busca por identidade do título.
  -- A unicidade entre lotes RASCUNHO é garantida no serviço (transação + advisory lock), pois o
  -- `status` vive na raiz (lote), não no item — um UNIQUE parcial exigiria denormalizar o status.
  ```
- **Impacto técnico**: qualquer writer alheio ao `LotePagamentoService` (script SQL de correção, admin migration, futuro Lambda de batch) que insira em `lote_pagamento_item` sem passar por `withAdvisoryLock` viola I3 silenciosamente. Postgres não impede.
- **Impacto de negócio**: título aparecendo em 2 remessas na Fatia 3 = pagamento em dobro. É EXATAMENTE o "double-execution of a financial write" do enunciado — só que a bomba está armada localmente e detona quando a Fatia 3 puxar da tabela.
- **Métrica de baseline**: `# writers que respeitam o advisory lock = 1 (service)`; `# constraints DB = 0`; alvo `≥ 1` (UNIQUE INDEX parcial via denormalização OU trigger DEFERRABLE).

### F-fault-tolerance-7: `POST /sispag/lotes` sem Idempotency-Key — double-click cria 2 lotes vazios

- **Severidade**: P2
- **Tactic violada**: Idempotent Replay
- **Localização**: `src/backend/routes/sispag.ts:100-114`; `LotePagamentoService.ts:43-52` (usa `randomUUID()` interno)
- **Evidência (objetiva)**:
  ```ts
  // routes/sispag.ts:100-114 — nenhum header lido
  router.post('/lotes', requireRole('admin'), asyncHandler(async (req, res) => {
      ...
      const lote = await service.criarLote({ ...parsed.data, ator: ator(req) });
      res.status(201).json({ lote });
  }));

  // LotePagamentoService.ts:43-52 — cada chamada gera novo UUID
  public criarLote = async (input: CriarLoteInput): Promise<LotePagamento> => {
      const lote = await this.repo.criarLote({...});
  ```
- **Impacto técnico**: double-click, retry de proxy, retry cego do frontend produzem N lotes vazios idênticos (mesmo `filCod`, `criadoPor`). Mitigação atual = frontend disable-durante-submit (`page.tsx:185 setBusy(true)`), mas isso é UX, não protocolo.
- **Impacto de negócio**: mínimo hoje (lote vazio é inócuo). Cresce com a Fatia 3: `POST /lotes/:id/enviar-remessa` sem Idempotency-Key = enviar duas remessas iguais ao banco. Estabelecer o padrão agora é barato; retrofitar em toda API depois é caro.
- **Métrica de baseline**: `# endpoints POST mutantes com Idempotency-Key = 0/5`; alvo Fatia 2 `≥ 1` (o `criarLote`), Fatia 3 `= 100%` para caminhos que tocam o ERP.

### F-fault-tolerance-8: `getTituloAPagar` sem timeout dedicado — advisory lock preso pelo axios default (40 s)

- **Severidade**: P2
- **Tactic violada**: Timeout
- **Localização**:
  - `src/backend/services/conexos.ts:90-92` (`axios.create({ timeout: 40000 })`)
  - `src/backend/domain/service/sispag/LotePagamentoService.ts:62-91` (advisory lock adquirido antes da chamada, liberado só no `finally`)
- **Evidência (objetiva)**:
  ```ts
  // services/conexos.ts:90-92
  this.client = axios.create({ ..., timeout: 40000 });
  ```
- **Impacto técnico**: Conexos hang → cada `incluirTitulo` para o mesmo (filCod,docCod,titCod) segura o advisory lock por até 40 s. Todo double-click ou concorrente sobre O MESMO TÍTULO fica esperando (na verdade, cai em `onBusy` e joga `LoteVersaoConflitoError` — vide F-4). Piora com o pool de 5 conexões: 5 hangs simultâneos = pool esgotado.
- **Impacto de negócio**: janela de "montagem parou" durante incidente Conexos. Fatia 3 herda o mesmo problema em rota mais crítica (`postGenericOnce` para remessa).
- **Métrica de baseline**: `timeout do getTituloAPagar = 40 s` (default axios legacy); alvo `≤ 10 s` + circuit breaker.

### F-fault-tolerance-9: Advisory lock em sessão PG distinta da transação — semântica correta, mas sem timeout de posse

- **Severidade**: P3
- **Tactic violada**: Timeout / Recovery
- **Localização**: `src/backend/domain/client/database/PostgreeDatabaseClient.ts:137-158`
- **Evidência (objetiva)**:
  ```ts
  // PostgreeDatabaseClient.ts:145-157 — lock adquirido em client A; onAcquired abre client B (via withTransaction)
  const client = await this.connectionPool.connect();
  try {
      const res = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockKey]);
      const acquired = res.rows[0]?.locked === true;
      if (!acquired) return onBusy();
      try {
          return await onAcquired();
      } finally {
          await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
      }
  } finally {
      client.release();
  }
  ```
  A abordagem é **correta**: `pg_try_advisory_lock` é session-level e serializa todos os `incluirTitulo` do mesmo título cooperativamente. Porém: se `onAcquired` **hang** (ex.: uma transação nunca liberada por bug futuro, ou o `getTituloAPagar` demorando 40 s), o lock fica preso pelo mesmo período. Não há `statement_timeout` nem TTL cooperativo.
- **Impacto técnico**: lock nunca-timeout = incidente Conexos escala para incidente na montagem SISPAG. Também: se o processo Node morrer entre o acquire e o unlock, o lock é liberado pela morte da sessão TCP — depende do TCP keepalive do Postgres/Supavisor; pode ficar preso minutos.
- **Impacto de negócio**: janela de indisponibilidade parcial durante incidente.
- **Métrica de baseline**: `# advisory-lock com timeout de posse = 0`; alvo `= 1` (via `SET LOCAL statement_timeout` ou wrapper `Promise.race`).

### F-fault-tolerance-10: Zod `.catch(undefined)` mascara erro de contrato como "não encontrado"

- **Severidade**: P3
- **Tactic violada**: Sanity Checking / Detect
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:27-37`, `164-193`
- **Evidência (objetiva)**:
  ```ts
  // ConexosSispagClient.ts:27-37
  const numOpt = z.coerce.number().optional().catch(undefined);
  const strOpt = z.union([z.string(), z.number()]).transform(String).optional().catch(undefined);

  // 174-193 — parse failure é silenciosamente ignorada (continue), depois retorna null
  for (const row of rows) {
      const parsed = tituloRowSchema.safeParse(row);
      if (!parsed.success) continue;
      ...
  }
  return null;
  ```
- **Impacto técnico**: se o Conexos mudar o shape do row (`titMnyValor` vira string vazia, `docCod` vira `null`), o parse falha → `continue` → o loop termina sem match → retorno `null` → `TituloNaoElegivelError('nao-encontrado')` para a analista. **Detecção degradada de fault do parceiro**: parece "título não existe" quando é "contrato de API quebrou".
- **Impacto de negócio**: analista trata erro como problema do dado (procura no ERP, contesta com quem cadastrou) em vez de escalar para o time. Tempo perdido.
- **Métrica de baseline**: `# de código de erro para "conexos response shape unexpected" = 0`; alvo `≥ 1` (distinto de `nao-encontrado`).

## 5. Cards Kanban

### [fault-tolerance-1] Persistir a trilha de auditoria do lote em tabela dedicada

- **Problema**
  > Cada mutação do lote (`criarLote`/`incluirTitulo`/`removerTitulo`/`finalizarLote`/`reabrirLote`/`cancelarLote`) chama `this.audit()`, que roteia para `LogService.info` → `process.stdout.write`. Não há tabela `audit_log`. Além disso, o `await this.audit()` ocorre **depois** do `COMMIT` — é dual-write não-atômico: crash entre COMMIT e stdout produz mutação sem áudio. Enquanto Fatia 2 é local, o gap é P1; na Fatia 3 (remessa ao banco) vira P0.
- **Melhoria Proposta**
  > Criar `audit_log` (id, entity, entity_id, action, actor, payload_json, occurred_at, request_id) com FK `entity_id → lote_pagamento.id`. Estender `withTransaction` da service para receber uma lista de `AuditEntry` e inserir dentro da mesma tx (dual-write atômico). Alternativa mais barata: usar `LISTEN/NOTIFY` + outbox pattern (`audit_outbox` na mesma tx, dispatcher async). Tactic: **Timestamp + Repair State** (invariante transversal da proposta).
- **Resultado Esperado**
  > Todo COMMIT de lote acompanhado por ≥1 linha em `audit_log` na MESMA transação. Consulta `SELECT actor, action, occurred_at FROM audit_log WHERE entity_id = $lote` reconstitui histórico completo.
- **Tactic alvo**: Timestamp / Repair State
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - # tabelas audit persistidas: 0 → 1
  - # state-mutating callsites sem write pareado: 4 → 0
  - # linhas de `audit_log` por lote criado: 0 → ≥1
- **Risco de não fazer**: Fatia 3 (remessa) sobe sem trilha auditável — SOX/compliance quebra. Analistas perdem histórico de quem finalizou/reabriu → disputa de responsabilidade sobre pagamentos errados.
- **Dependências**: modelagem da entidade `audit_log` via `/feature-new` (ver ontology `_inbox/`).

### [fault-tolerance-2] Testes de integração para `transicionarStatus` SQL

- **Problema**
  > O SQL de `transicionarStatus` (`LotePagamentoRepository.ts:242-249`) interpola condicionalmente o CASE de `finalizado_por`/`finalizado_em` e referencia `$para` três vezes. Os testes existentes (`LotePagamentoService.test.ts`) mockam o repositório inteiro — o SQL nunca é executado contra Postgres. Um bug de regressão (ex.: quebrar o preservar-finalizado_por no cancelar) passa despercebido.
- **Melhoria Proposta**
  > Adicionar `LotePagamentoRepository.integration.test.ts` usando Testcontainers/pg-mem contra um schema real. Cobrir os 3 caminhos: RASCUNHO→FINALIZADO (grava `finalizado_por/em`), FINALIZADO→RASCUNHO (limpa `finalizado_por/em`), FINALIZADO→CANCELADO (preserva `finalizado_por/em`). Assert `rowCount=0` para `versao` inválido E para `de` incompatível. Tactic: **Sanity Checking / Self-Test**.
- **Resultado Esperado**
  > 100% dos ramos condicionais do SQL exercitados. Regressão no CASE gera teste vermelho.
- **Tactic alvo**: Sanity Checking / Self-Test
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) (pg-mem já usado no repo? ver PermutaRelationalRepository tests)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - # testes exercitando `transicionarStatus` contra DB: 0 → ≥6 (3 caminhos × 2 desfechos)
  - # variantes de status cobertas por integração: 0 → 3
- **Risco de não fazer**: regressão silenciosa apaga `finalizado_por` em um cancelar, e ninguém percebe até auditoria financeira reclamar. Trilha perdida = risco jurídico na Fatia 3.
- **Dependências**: nenhuma.

### [fault-tolerance-3] Reaper de lote RASCUNHO abandonado / multi-título transacional no backend

- **Problema**
  > `criarLoteComSelecionados` (`app/sispag/page.tsx:176-217`) chama `criarLote` e depois faz `for await` sobre os títulos. Se interrompido (aba fechada, rede caiu, backend crashou), um lote vazio ou parcial persiste no banco sem TTL nem cleanup. Analista pode finalizar um lote parcial achando "estava completo".
- **Melhoria Proposta**
  > Duas ações complementares:
  > 1. **Backend transacional**: `POST /sispag/lotes/criar-com-titulos` — recebe `{filCod, titulos:[{docCod,titCod},...]}`; abre `withTransaction`, cria header, chama `incluirTitulo` internamente para cada (mantendo o advisory lock por título), e retorna o lote pronto ou erro global.
  > 2. **Reaper**: EventBridge job diário `sispag-lote-rascunho-reaper` que fecha (status=CANCELADO com `motivo='abandonado_por_ttl'`) todos os RASCUNHO com `atualizado_em < now() - INTERVAL '48h'`.
  > Tactic: **Rollback + Repair State**.
- **Resultado Esperado**
  > Criar-lote-com-N-títulos é atômico do ponto de vista do usuário. Lotes abandonados > 48h somem automaticamente. Tabela `lote_pagamento` estável em volume.
- **Tactic alvo**: Rollback / Repair State
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — o job é S, a rota transacional é M
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - # transações de negócio "criar-com-titulos" atômicas: 0 → 1
  - # lotes RASCUNHO com idade > 48h: (medir baseline) → 0
  - # falhas parciais silenciosas: (medir) → 0
- **Risco de não fazer**: analista finaliza lote parcial na Fatia 3 → remessa incompleta ao banco → títulos vencem sem pagamento → contas em atraso.
- **Dependências**: Fatia 3 (para justificar plenamente o atomic path).

### [fault-tolerance-4] Erro dedicado para "título em inclusão concorrente"

- **Problema**
  > `LotePagamentoService.ts:147-150` reusa `LoteVersaoConflitoError({versaoEsperada: -1})` para o caminho `onBusy` do advisory lock. A mensagem "Este lote foi alterado por outra pessoa" mente — o cenário real é "o mesmo (filCod,docCod,titCod) está sendo incluído concorrentemente por outra sessão / double-click".
- **Melhoria Proposta**
  > Criar `TituloInclusaoConcorrenteError` (statusCode 409, retryable true, userMessage "Este título já está sendo incluído em outro lote agora. Recarregue a lista e tente novamente."). Tactic: **Sanity Checking** (detecção mais fina).
- **Resultado Esperado**
  > Telemetria distingue "conflito de versão de lote" de "inclusão concorrente de título". UX guia a analista para a ação correta.
- **Tactic alvo**: Sanity Checking / Comparison
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - # códigos de erro distintos para cenários distintos: 1 → 2
  - # sentinelas mágicas (`versaoEsperada: -1`): 1 → 0
- **Risco de não fazer**: telemetria enviesada; analista confusa recarrega tela sem necessidade.
- **Dependências**: nenhuma.

### [fault-tolerance-5] Disambiguation `rowCount=0` dentro da mesma transação

- **Problema**
  > `transicionar()` (`LotePagamentoService.ts:225-258`) detecta `afetadas === 0` e faz uma **segunda** leitura via `exigirLote()` para distinguir "versão bateu, estado não bateu" de "versão não bateu". Entre os dois SELECTs, outra transação pode ter mudado `versao` — falso positivo de `LoteVersaoConflitoError` quando a causa raiz era estado.
- **Melhoria Proposta**
  > Fazer o UPDATE com `RETURNING id, status, versao`. Se `rowCount=0`, executar `SELECT status, versao FROM lote_pagamento WHERE id = $id FOR SHARE` dentro de um `withTransaction` que agrupe UPDATE + SELECT, garantindo snapshot consistente. Alternativa: usar Postgres 15+ `MERGE` com WHEN NOT MATCHED. Tactic: **Comparison** (dentro de uma boundary consistente).
- **Resultado Esperado**
  > `LoteVersaoConflitoError` só quando de fato houve mudança de versão desde a leitura da analista.
- **Tactic alvo**: Comparison
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - # testes cobrindo o disambiguation (versão vs. estado): 1 → 3
  - # falsos positivos "LOTE_VERSAO_CONFLITO" quando causa era estado: (métrica pós-deploy) → ≈0
- **Risco de não fazer**: baixo — a UX resultante é aceitável. Custo de precisão de telemetria e clareza para o time.
- **Dependências**: F-fault-tolerance-2 (testes de repo).

### [fault-tolerance-6] Defense-in-depth para I3 no schema — impedir dois lotes RASCUNHO com o mesmo título

- **Problema**
  > A invariante I3 (título só pode estar em UM lote RASCUNHO por vez) é enforçada exclusivamente pelo `LotePagamentoService` via advisory lock. O comentário em `0023_lote_pagamento.sql:45-47` admite: "A unicidade entre lotes RASCUNHO é garantida no serviço". Qualquer writer alheio (script SQL, futuro Lambda, correção manual) viola I3 silenciosamente. Consequência downstream (Fatia 3): título pago em duplicidade.
- **Melhoria Proposta**
  > Denormalizar `lote_status` na tabela `lote_pagamento_item` (redundante com `lote_pagamento.status`), atualizada por trigger AFTER UPDATE ON `lote_pagamento`. Criar `UNIQUE INDEX ... (fil_cod, doc_cod, tit_cod) WHERE lote_status = 'RASCUNHO'`. Alternativa: constraint deferrável via EXCLUDE USING gist. Tactic: **Redundancy** (schema-level).
- **Resultado Esperado**
  > Postgres rejeita, com `unique_violation`, qualquer INSERT/UPDATE que colocaria o mesmo título em 2 lotes RASCUNHO simultâneos — INCLUSIVE writers que não passem pelo `LotePagamentoService`.
- **Tactic alvo**: Redundancy / Sanity Checking (schema)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) — trigger + migração + backfill + testes
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - # writers que enforçam I3: 1 (service) → ∞ (schema)
  - # constraints DB para I3: 0 → 1
- **Risco de não fazer**: Fatia 3 herda uma bomba armada — script de correção admin insere item bypassando service = pagamento em dobro no banco. Este é o "double-execution of financial write" do próprio enunciado do QA.
- **Dependências**: nenhuma (self-contained na camada de dados).

### [fault-tolerance-7] Idempotency-Key em `POST /sispag/lotes` (piloto do padrão)

- **Problema**
  > `POST /sispag/lotes` (`routes/sispag.ts:100-114`) gera novo UUID a cada chamada. Sem header `Idempotency-Key`, double-click ou retry de proxy cria N lotes vazios. Estabelecer o padrão agora (fatia mais barata: criar lote) evita retrofit sob pressão na Fatia 3.
- **Melhoria Proposta**
  > Ler `Idempotency-Key` (obrigatório em POST mutantes). Tabela `idempotency_key(key, endpoint, actor, response_body, created_at, expires_at)` com UNIQUE `(key, endpoint, actor)`. Se a chave existir, devolver o `response_body` salvo (mesmo status HTTP). Tactic: **Idempotent Replay**. Aplicar depois em Fatia 3 (`enviar-remessa`, `baixar-titulo`).
- **Resultado Esperado**
  > Double-click no botão "Criar lote" produz sempre 1 lote (independente de N cliques). Mesma chave replayed devolve o mesmo `lote.id`.
- **Tactic alvo**: Idempotent Replay
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) — infra + retrofit inicial
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - # endpoints POST mutantes com Idempotency-Key: 0 → 1 (Fatia 2) → 100% (Fatia 3)
  - # lotes vazios criados em janela de 5 min pelo mesmo actor: (medir) → ≤1
- **Risco de não fazer**: Fatia 3 (`enviar-remessa`) sem idempotency = duas remessas iguais enviadas ao banco em retry cego. **P0 na Fatia 3.**
- **Dependências**: precede Fatia 3.

### [fault-tolerance-8] Timeout dedicado + circuit breaker em `getTituloAPagar`

- **Problema**
  > `getTituloAPagar` (`ConexosSispagClient.ts:164-193`) herda o `timeout: 40000` do axios legacy (`services/conexos.ts:92`). O advisory lock só é liberado quando `onAcquired` termina — se Conexos travar 40 s, o lock por (filCod,docCod,titCod) fica preso 40 s, e cada concorrente cai em `onBusy` → `LoteVersaoConflitoError`.
- **Melhoria Proposta**
  > Wrap `getTituloAPagar` num `Promise.race` com timeout de 8 s. Combinar com circuit breaker (Opossum ou implementação leve) na base do `ConexosBaseClient`: N falhas seguidas em 1 min → abre por 30 s, retorna `ConexosCircuitOpenError` (statusCode 503, retryable). Tactic: **Timeout / Recovery Forward**.
- **Resultado Esperado**
  > Advisory lock nunca preso > 10 s por causa de Conexos. Incidente Conexos degrada gracefully (analista vê "ERP indisponível, tente em 30 s") em vez de "conflito de versão".
- **Tactic alvo**: Timeout
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-8, F-fault-tolerance-9
- **Métricas de sucesso**:
  - Timeout específico: 40 s → ≤10 s
  - % de includes que atingem timeout: (medir) → alerta se >1%
- **Risco de não fazer**: incidente Conexos escala para incidente na montagem SISPAG, pool PG esgota (5 conexões), lista de lotes fica inacessível.
- **Dependências**: cross-QA com Availability e Performance.

### [fault-tolerance-9] TTL de posse no advisory lock + `statement_timeout` local

- **Problema**
  > `withAdvisoryLock` (`PostgreeDatabaseClient.ts:137-158`) mantém a sessão até `onAcquired` retornar. Se `onAcquired` **hang** (bug futuro, rede lenta, `getTituloAPagar` sem timeout), o lock fica preso indefinidamente. Se o processo Node morrer, a liberação depende do TCP keepalive do Postgres/Supavisor.
- **Melhoria Proposta**
  > Antes de `pg_try_advisory_lock`, executar `SET LOCAL statement_timeout = '15s'` no cliente A, e envolver `onAcquired()` num `Promise.race([onAcquired(), timeout(20s)])`. Se o timeout dispara, forçar `pg_advisory_unlock` + release client + throw. Tactic: **Timeout / Recovery Forward**.
- **Resultado Esperado**
  > Nenhum lock preso além de 20 s por causa de bug/hang em `onAcquired`. Postgres também não vira "session frozen" — statement_timeout força erro.
- **Tactic alvo**: Timeout
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-9
- **Métricas de sucesso**:
  - # locks presos > 20 s: (medir com CloudWatch p99) → 0
- **Risco de não fazer**: incidente raro, mas afeta o mesmo blast radius do F-8.
- **Dependências**: F-8 (timeout do getTituloAPagar reduz drasticamente a probabilidade).

### [fault-tolerance-10] Distinguir erro de contrato Conexos de "título não encontrado"

- **Problema**
  > Em `getTituloAPagar` (`ConexosSispagClient.ts:174-193`), Zod parse failure → `continue` → loop termina sem match → retorna `null` → service lança `TituloNaoElegivelError('nao-encontrado')`. Contrato quebrado se confunde com dado ausente. Analista trata como problema do dado, escala tarde.
- **Melhoria Proposta**
  > Se Zod falhar, logar `LogService.warn` com `type: BUSINESS_WARN` incluindo o campo que quebrou, E lançar `ConexosContractError` (novo, statusCode 502, non-retryable). O service pode capturar e mapear para `TituloNaoElegivelError({motivo: 'contrato-invalido'})` OU deixar propagar. Tactic: **Sanity Checking**.
- **Resultado Esperado**
  > Detecção separada: parse-failure vs. row-missing. Alerta CloudWatch em `BUSINESS_WARN`+`type=conexos-contract` sobe para o time; analista vê mensagem correta.
- **Tactic alvo**: Sanity Checking
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-10
- **Métricas de sucesso**:
  - # erros de parse silenciados como "nao-encontrado": (baseline via inspeção de logs) → 0 (todos viram alerta)
- **Risco de não fazer**: mudança de shape no Conexos passa despercebida até volume alto de "não elegível" (Detecção degradada).
- **Dependências**: nenhuma.

## 6. Notas do agente

- Zero P0 nesta fatia: Fatia 2 é LOCAL-only (I1 preservado por escopo — o service não escreve no ERP). O bar "no double-execution of financial write" ainda não se aplica em toda sua força. **O padrão está bom** para uma fatia read-only-para-o-ERP; a preocupação é herdar dívida técnica para a Fatia 3.
- A pergunta específica sobre "advisory lock em sessão pooled distinta da transação" é **segura** neste desenho porque `pg_try_advisory_lock` é um mutex cooperativo entre sessões — todo caller do `incluirTitulo` passa pelo mesmo `withAdvisoryLock(lockKey)`, então a serialização acontece antes de qualquer SQL de dados. Documentado em `PostgreeDatabaseClient.ts:130-136`. Único caveat: I3 é enforçada só cooperativamente (F-6) — qualquer writer alheio ao service viola sem barreira DB.
- Cross-QA para o consolidator:
  - **Availability / Performance**: F-8 (timeout Conexos) e F-9 (TTL do lock) impactam pool PG e MTTR de incidente ERP — evidência dupla, mesma causa.
  - **Security / Auditability**: F-1 (audit trail persistido) é invariante transversal da proposta; overlaps com qa-security (SOX/compliance) e ganha peso na Fatia 3.
  - **Testability**: F-2 (testes SQL do repositório) — o gap "service tests + repo mockado" é padrão neste repo (também vale para `PermutaRelationalRepository`).
  - **Modifiability / Integrability**: F-7 (Idempotency-Key) precisa ser estabelecido como padrão de API agora (barato aqui, caro na Fatia 3).
