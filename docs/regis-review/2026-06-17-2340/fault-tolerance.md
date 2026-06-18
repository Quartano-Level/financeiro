---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-17-2340
agent: qa-fault-tolerance
generated_at: 2026-06-18T00:30:00Z
scope: backend
score: 6
findings_count: 8
cards_count: 8
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| ERP Conexos (legacy) ou Postgres (Supavisor) | Falha parcial no meio de uma run de eleição multi-filial (5xx transitório em filial N, timeout em `getMnyTitPermutar`, ou erro no Nº-ésimo `INSERT` do snapshot) | `EleicaoPermutasService` (orquestrador) + `PermutaSnapshotRepository` (snapshot/auditoria) + `PainelService` (leitura) | Operação normal, READ-ONLY no Conexos; única escrita é o snapshot próprio em Postgres | Run abortada com `status=error` + 0 linhas de snapshot (rollback lógico); painel continua servindo o ÚLTIMO snapshot `success`; analista NÃO vê dado parcial rotulado como completo | 0 candidatas elegíveis falso-positivas no painel; 100% das runs com `status≠success` não chegam à leitura; staleness do snapshot sinalizada explicitamente ao analista |

Fatia 1 é READ-ONLY no `fin010` — blast-radius do "double-execution" é zero. Mas a Fatia 2 vai EXECUTAR baseada nesse snapshot. Toda falsa-elegibilidade ou falsa-bloqueio que se solidifique aqui é munição carregada para a Fatia 2 — por isso a régua de Fault Tolerance é "snapshot consistente OU ausente, nunca parcial-rotulado-de-completo".

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Endpoints state-mutating que aceitam `Idempotency-Key` | 0/1 (`POST /permutas/eleicao`) | 1/1 (defesa contra double-click do analista re-disparando a run) | ⚠️ | `grep -rn "Idempotency-Key\|idempotency" src/backend` → vazio |
| Operações multi-write embrulhadas em transação SQL | 0/1 (run+candidatas) | 1/1 | ❌ | `PermutaSnapshotRepository.ts:65-95` — N+1 `INSERT` sequenciais, sem `BEGIN/COMMIT` |
| `PostgreeDatabaseClient.transaction()` helper | ausente | presente | ❌ | `PostgreeDatabaseClient.ts:60-105` — só `selectMany/insert/update`, nenhum `pool.connect()` |
| Cobertura de status `partial` no state-machine de run | declarado (`RunStatus`) mas nunca escrito | escrito quando filial N falha após filial 1 ter sido lida | ❌ | `EleicaoPermutasService.ts:92,134` — só `'success'` ou `'error'` |
| External calls com timeout explícito | 1/1 (legacy axios `timeout: 40000`) | 1/1 | ✅ | `services/conexos.ts:81` |
| External calls com `RetryExecutor` | 7/8 (`getMnyTitPermutar` fora) | 8/8 | ⚠️ | `ConexosClient.ts:830-858` — `getGeneric` sem `retryExecutor.execute` |
| Sanity-check do filtro `adiantamento` (probe) | 0 (chave wire é placeholder) | 1 (comparação contagem com/sem filtro, ou assert "API retornou só `adiantamento=S`") | ⚠️ | `conexosPermutasConstants.ts:30-33` + `ConexosClient.ts:586-589` |
| Detecção de stuck/stale snapshot | parcial (`snapshotAge` exposto, sem threshold) | flag `stale: boolean` no payload c/ threshold (24h) | ⚠️ | `PainelService.ts:60-68` |
| Persistência de `filCod` por candidata | 0/N (coluna existe, escrita nunca acontece) | N/N | ❌ | `PermutaSnapshotRepository.ts:137-156` (sem `$filCod`) + `Adiantamento.ts:11-21` (sem campo) |
| Reaper job de runs órfãs (started, never finished) | ausente | presente (ou GC por TTL) | ❌ | n/a (Express puro; não há job runner) |

> ⚠️ **Não medível localmente**: latência real do `getMnyTitPermutar` sob jitter de Conexos, percentual de falhas transientes (5xx/timeout). Requer ambiente dev com Conexos real + carga + métricas CloudWatch. Recomendação: instrumentar via `LogService.warn(CONEXOS_RETRY)` quando o `RetryExecutor` re-executa.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | n/a — fatia READ-ONLY, sem hot-failover de write | N/A | sem write em `fin010` nesta fatia |
| Replacement | n/a — sem replicação de Conexos | N/A | tenant único |
| Predictive Model | ausente — sem indicador "Conexos saudável?" | ❌ | nenhum healthcheck periódico |
| Increase Competence Set | parcial — XOR resolve D.I e DUIMP; ambas presentes vira `falha-gate` em vez de explodir | ✅ | `ElegibilidadeService.ts:126-167` |
| Sanity Checking | parcial — Zod nos boundaries do Conexos (`com298RowSchema`, `declaracaoRowSchema`) mas NÃO no filtro `adiantamento` (probe placeholder) | ⚠️ | `conexosPermutasSchemas.ts:28-67` ✅ / `conexosPermutasConstants.ts:30-33` ⚠️ |
| Comparison | ausente — não há checagem "contagem filtrada < contagem total" para detectar filtro ignorado pelo Conexos | ❌ | `ConexosClient.listAdiantamentosProforma` confia no resultado bruto |
| Timestamp | parcial — `snapshotAge` calculado, mas SEM threshold de stale | ⚠️ | `PainelService.ts:60` |
| Timeout | presente em axios (40s) e indireto via `RetryExecutor` | ✅ | `services/conexos.ts:81` |
| Condition Monitoring | parcial — `BUSINESS_WARN` em cap-hit; SEM warn em "filter probe placeholder", SEM warn em "run anterior errored, servindo snapshot N+ horas velho" | ⚠️ | `EleicaoPermutasService.ts:160-165` |
| Self-Test | ausente | ❌ | sem rota `/permutas/health` ou ping de conectividade DB+Conexos |
| Voting | n/a — fonte única (Conexos) | N/A | sem replicação |
| Redundancy | parcial — `RetryExecutor` (2 retries + jitter) em 7/8 endpoints | ⚠️ | `ConexosClient.ts:353-358` ✅ / `getMnyTitPermutar` ❌ |
| Recovery — Backward (Rollback) | parcial — abort lógico (status=error, 0 candidata), mas SEM transação SQL real: se o Postgres cair entre `INSERT permuta_eleicao_run` e o 50º `INSERT permuta_candidata_snapshot`, o snapshot fica parcial e o cabeçalho lê `status='success'` | ❌ | `PermutaSnapshotRepository.ts:65-95` (sem `BEGIN/COMMIT`) |
| Recovery — Forward (Reintroduction) | parcial — reexecutar a rota recomputa do zero (idempotente por design); mas não há mecanismo automático de re-disparo | ⚠️ | `EleicaoPermutasService.ts` comentário linha 44 |
| Reintroduction — Shadow / State Resync | n/a — sem 2º nó | N/A | |
| Idempotent Replay | ✅ no NÍVEL DA RUN (recomputa backlog); ❌ no NÍVEL DO POST (sem `Idempotency-Key` — duplo-clique gera 2 runs duplicadas no Postgres com IDs diferentes, ambas válidas) | ⚠️ | teste `EleicaoPermutasService.test.ts:121-148` ✅ / `routes/permutas.ts:24-40` ❌ |
| Compensating Transaction | n/a Fatia 1 (sem write externo) — relevante na Fatia 2 | N/A | |
| Reconcile | ausente — sem job que compare "última run vs. Conexos" | ❌ | n/a |
| Quarantine | parcial — `bloqueada(motivo)` quarentena candidatas com gate falho; MAS candidata silenciosamente bloqueada por blip transiente em `getMnyTitPermutar` cai no MESMO bucket de `falha-gate` real, sem rótulo distintivo | ⚠️ | `EleicaoPermutasService.ts:179-186` |

## 4. Findings (achados)

### F-fault-tolerance-1: Snapshot multi-write sem transação SQL → run parcial pode ficar rotulada como `success`

- **Severidade**: P0
- **Tactic violada**: Recovery — Backward (Rollback) / Idempotent Replay
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:59-95` + `src/backend/domain/client/database/PostgreeDatabaseClient.ts:60-105`
- **Evidência (objetiva)**:
  ```typescript
  // PermutaSnapshotRepository.ts:65-94 — N+1 INSERTs INDEPENDENTES
  await this.databaseClient.insert(
      `INSERT INTO permuta_eleicao_run (id, ..., status, ...) VALUES (..., $status, ...)`,
      { ..., status: run.status, ... }, // status='success' já gravado AQUI
  );
  for (const candidata of candidatas) {
      await this.insertCandidata(runId, candidata); // pode falhar no 1º, 50º, etc.
  }
  ```
  ```typescript
  // PostgreeDatabaseClient.ts — NÃO expõe transaction() helper
  // Métodos públicos: init, selectMany, selectFirst, update, insert. Nenhum BEGIN/COMMIT.
  ```
- **Impacto técnico**: Se o Postgres reset connection (`ECONNRESET`) OU o Lambda for terminado entre o `INSERT` da run e o `INSERT` da k-ésima candidata, o cabeçalho `permuta_eleicao_run` fica com `status='success'` e `total_elegiveis=N` enquanto `permuta_candidata_snapshot` tem `k-1 < N` linhas. O `PainelService.findLatestSnapshot` (filtra `status='success'`) vai servir esse snapshot truncado como verdade. O analista vê 3 elegíveis quando deveria ver 10.
- **Impacto de negócio**: Painel mente sobre o backlog real. Na Fatia 2 (execução em `fin010`), elegíveis ocultos NÃO vão ser executados — backlog de permutas trava silenciosamente, expondo a Trading a variação cambial extra. Auditoria (O6) registra um total que diverge da realidade — perde valor probatório.
- **Métrica de baseline**: 0/1 operação multi-write em transação. `RetryExecutor` na query (`PostgreeDatabaseClient.ts:21-27`) retenta a query individual transiente, mas NÃO recupera de "alguma das N queries falhou após M sucessos".

### F-fault-tolerance-2: `getMnyTitPermutar` swallowa toda exceção não-400 → falso `BLOQUEADA(falha-gate)` em blip transiente

- **Severidade**: P0
- **Tactic violada**: Redundancy (sem retry) + Quarantine (mistura falha real com falha transiente)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:830-858`
- **Evidência (objetiva)**:
  ```typescript
  try {
      detail = await this.legacy.getGeneric<...>(`com298/${docCod}`, { filCod });
  } catch (err) {
      // ... trata 400 com responseData ...
      return undefined;  // ← TODA outra falha (5xx, ETIMEDOUT, ECONNRESET) silenciosa
  }
  ```
  Cadeia downstream:
  ```typescript
  // EleicaoPermutasService.ts:179-186 — valorPermutar nasce undefined
  // ElegibilidadeService.ts:64-68
  { gate: GATE.VALOR_PERMUTAR, passed: (adiantamento.valorPermutar ?? 0) > 0, ... }
  // → Gate 2 reprova → BLOQUEADA(falha-gate), sem nenhum sinal de "houve um erro de I/O"
  ```
- **Impacto técnico**: Diferente de TODOS os outros endpoints do `ConexosClient` (que rodam em `this.retryExecutor.execute(...)` com 2 retries + jitter), o `getMnyTitPermutar` faz 1 chamada bruta e qualquer erro vira `undefined`. Um único 502 transitório → PROFORMA elegível vira `BLOQUEADA(falha-gate)` no snapshot, indistinguível de uma reprovação legítima de regra de negócio.
- **Impacto de negócio**: Analista lê o painel, vê "PROFORMA X bloqueada por falha-gate" e não vai investigar (motivo é determinístico, parece regra de negócio). Permuta válida fica engavetada. Na Fatia 2, esse adiantamento não entra na execução — exposição cambial não-fechada acumula juros (resultado conta 131) ou perde desconto (conta 130).
- **Métrica de baseline**: 7/8 endpoints do `ConexosClient` com `retryExecutor`; `getMnyTitPermutar` é 1/8 sem retry. Comentário do próprio método ("caller skips the candidate without taking down the report") confirma que o trade-off foi resiliência > correção de classificação — escolha errada para um snapshot que vai ancorar execução financeira.

### F-fault-tolerance-3: `filCod` perdido entre `EleicaoPermutasService` e o snapshot — coluna `fil_cod` sempre NULL

- **Severidade**: P1
- **Tactic violada**: Sanity Checking / Repair State
- **Localização**: `src/backend/migrations/0001_permuta_eleicao.sql:30` (coluna existe) ↔ `src/backend/domain/interface/permutas/Adiantamento.ts:11-21` (sem campo) ↔ `src/backend/domain/interface/permutas/PermutaCandidata.ts:43-55` (sem campo) ↔ `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:131-156` (`INSERT` sem `$filCod`)
- **Evidência (objetiva)**:
  ```sql
  -- 0001_permuta_eleicao.sql:30
  fil_cod INTEGER,  -- nullable, sem default
  ```
  ```typescript
  // PermutaSnapshotRepository.ts:137-145 — INSERT SEM fil_cod
  `INSERT INTO permuta_candidata_snapshot (
      run_id, doc_cod, pri_cod, status, motivo_bloqueio,
      aging_days, invoice_doc_cod, variacao_classificacao, variacao_resultado
  ) VALUES (...)`,  // ← fil_cod nunca aparece
  ```
  ```typescript
  // EleicaoPermutasService.ts:154-172 — processFilial conhece filCod mas
  // ele nunca chega ao PermutaCandidata (interface não tem o campo).
  ```
- **Impacto técnico**: Em ambiente multi-filial (I6), TODOS os snapshots vão ter `fil_cod=NULL`. O `findLatestSnapshot` map de leitura (`mapSnapshotRow.filCod`) sempre devolve `undefined`. Painel não consegue distinguir adiantamento da filial 2 vs filial 9. Auditoria (O6) perde a dimensão.
- **Impacto de negócio**: Filiais com volume distinto entram no mesmo bucket. Quando dois `docCod` colidirem entre filiais (improvável mas possível em Conexos com escopo per-filCod), o painel vai mostrar como se fossem o mesmo documento. Bloqueia rastreabilidade exigida pela auditoria interna.
- **Métrica de baseline**: 0/N candidatas com filCod persistido (coluna definida na migration; escrita nunca executada).

### F-fault-tolerance-4: Status `partial` declarado mas nunca emitido — falha em uma filial joga fora as outras

- **Severidade**: P1
- **Tactic violada**: Recovery — Forward / Reintroduction
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:10` + `src/backend/migrations/0001_permuta_eleicao.sql:14` + `src/backend/domain/service/permutas/EleicaoPermutasService.ts:71-152`
- **Evidência (objetiva)**:
  ```typescript
  // PermutaSnapshotRepository.ts:10
  export type RunStatus = 'success' | 'partial' | 'error';
  ```
  ```sql
  -- 0001_permuta_eleicao.sql:14
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  ```
  ```typescript
  // EleicaoPermutasService.ts:71-152 — só 'success' (linha 92) ou 'error' (linha 134)
  // O loop "for (const filial of filiais)" (linha 74-77) é serial; primeira filial
  // que joga exception aborta TUDO e cai no catch → status='error', 0 candidatas.
  ```
- **Impacto técnico**: A filial 1 já fez 12 chamadas Conexos, processou 200 PROFORMAs corretamente; filial 2 retorna 502 → toda essa computação é descartada e o snapshot fica vazio. Não há registro de "filial 1 OK / filial 2 falhou" — só `error_message` global. Reexecução não tem hint de "começa da filial 2".
- **Impacto de negócio**: Tempo de Conexos desperdiçado (filial 1 refeita do zero). Em ambiente com 5+ filiais, MTTR cresce linearmente com o N. Risco de cap de rate-limit do Conexos esgotar antes da próxima tentativa completa.
- **Métrica de baseline**: 0 caminho de código escreve `status='partial'`. O domínio admite, a regra de negócio não emite.

### F-fault-tolerance-5: `POST /permutas/eleicao` sem `Idempotency-Key` → duplo-clique gera 2 runs paralelas pesadas

- **Severidade**: P1
- **Tactic violada**: Idempotent Replay (no nível do request)
- **Localização**: `src/backend/routes/permutas.ts:24-40`
- **Evidência (objetiva)**:
  ```typescript
  // routes/permutas.ts:24-40 — handler aceita qualquer POST, sem dedup
  router.post('/eleicao', asyncHandler(async (req, res) => {
      await bootstrapAppContainer();
      const service = container.resolve(EleicaoPermutasService);
      const triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown';
      const result = await service.executar({ triggeredBy });
      // ...
  }));
  ```
  Grep:
  ```
  grep -rn "Idempotency-Key\|idempotency" src/backend → vazio
  ```
- **Impacto técnico**: Cada chamada gera um `flowId` (`randomUUID`) novo e roda toda a cadeia. Duplo-clique do analista (rota mounted em `heavyRouteLimiter` 10/min, mas isso não bloqueia 2 cliques imediatos no mesmo IP) dispara 2 runs paralelas — cada uma faz dezenas de chamadas Conexos. Resultado: 2 linhas em `permuta_eleicao_run` com `status='success'` e mesmos totais, mesmo `triggered_by`, IDs diferentes.
- **Impacto de negócio**: Stress duplo no Conexos (já com pool de sessão limitado). Pode disparar `MaxClientsInSessionMode` (padrão transient do `PostgreeDatabaseClient.ts:16-20`). Mistura no histórico de auditoria — analistas perdem a noção de "essa foi a re-tentativa após cair".
- **Métrica de baseline**: 0/1 endpoint state-mutating honra `Idempotency-Key`.

### F-fault-tolerance-6: Painel não sinaliza staleness — analista vê dado antigo como se fosse atual

- **Severidade**: P1
- **Tactic violada**: Timestamp / Condition Monitoring
- **Localização**: `src/backend/domain/service/permutas/PainelService.ts:45-69`
- **Evidência (objetiva)**:
  ```typescript
  // PainelService.ts:60-68 — snapshotAge calculado mas sem threshold/flag
  const snapshotAge = Date.now() - snapshot.finishedAt.getTime();
  // ...
  return { runId: snapshot.runId, snapshotAge, totalElegiveis, totalBloqueadas, items };
  // ← snapshotAge devolvido como number cru; sem boolean `stale`, sem warn
  ```
  Combinando com F-fault-tolerance-1/4: se a última run abortou, a anterior (24/48h velha) continua sendo servida — `findLatestSnapshot` SÓ filtra `status='success'`, ignora idade.
- **Impacto técnico**: Frontend (fora do escopo desta fatia) pode ou não exibir o `snapshotAge` em formato humano. Não há sinal "isso aqui é velho, pode haver coisa nova". Eleição diária prevista (O4) ainda não roda automaticamente; até a Fatia 2 acoplar EventBridge, o disparo manual pode passar dias sem rodar e ninguém percebe.
- **Impacto de negócio**: Analista toma decisão (Fatia 2: executar permuta no `fin010`) baseado em backlog desatualizado. Adiantamentos novos não aparecem; INVOICEs recém-emitidas não casam ainda. Risco aumenta com cada hora de staleness.
- **Métrica de baseline**: 0 threshold/flag de staleness; `snapshotAge` exposto cru.

### F-fault-tolerance-7: Filtro `adiantamento` é placeholder — sem sanity-check Conexos pode ignorar e devolver universo errado

- **Severidade**: P2
- **Tactic violada**: Sanity Checking / Comparison
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasConstants.ts:18-33` + `src/backend/domain/client/ConexosClient.ts:577-618`
- **Evidência (objetiva)**:
  ```typescript
  // conexosPermutasConstants.ts:30-33
  // TODO 🔬 PROBE: confirmar `ADIANTAMENTO_FILTER_KEY` e `ADIANTAMENTO_FILTER_VALUE`
  export const ADIANTAMENTO_FILTER_KEY = 'adiantamento#EQ' as const;
  export const ADIANTAMENTO_FILTER_VALUE = 'S' as const;
  ```
  ```typescript
  // ConexosClient.ts:586-589 — filterList contém a chave provisória
  filterList: {
      'tpdCod#EQ': PERMUTA_TPD_PROFORMA,
      'vldStatus#IN': PERMUTA_VLD_FINALIZADO,
      [ADIANTAMENTO_FILTER_KEY]: ADIANTAMENTO_FILTER_VALUE,
  },
  ```
- **Impacto técnico**: Se o Conexos silenciosamente ignorar uma chave de filtro desconhecida (`adiantamento#EQ` errado), a query degrada para "todas PROFORMAs finalizadas, com ou sem adiantamento" — gerando candidatas a montão que falham em Gate 2 (valorPermutar=0). Snapshot vira lixo (centenas de `bloqueada(falha-gate)`). Sem comparison (contagem com filtro vs sem) ou assertion ("toda row tem mnyTitPermutar>0 OU adiantamento=S no row"), o defeito passa.
- **Impacto de negócio**: Painel poluído, analista perde confiança ("por que tem 400 itens bloqueados?"). Risco de Yuri achar que o filtro funciona em DEV (que pode ter regra diferente) e essa premissa quebrar em produção.
- **Métrica de baseline**: 0 sanity-check post-filter. Já documentado como gated/probe — esta seção registra que o GATING não vem com defesa em profundidade (nenhum log warn "filter is placeholder" quando o método é invocado).

### F-fault-tolerance-8: Sem reaper de runs órfãs; sem reconciliação contra Conexos

- **Severidade**: P2
- **Tactic violada**: Condition Monitoring / Reconcile
- **Localização**: arquitetural — nenhum job/cron no Express atual
- **Evidência (objetiva)**:
  ```
  grep -rn "stuck\|reaper\|reconcile" src/backend → vazio
  ```
  ```typescript
  // EleicaoPermutasService.executar — só PROVISÓRIO via POST manual.
  // Comentário routes/permutas.ts:13-19 admite: "EventBridge/cron diário é DÍVIDA DO ALVO"
  ```
- **Impacto técnico**: Se a Fatia 2 abrir o status `started → running` (sem `finished_at`), nada captura "run penderada há > 1h, marca como zombi". Nesta Fatia 1, a transição é síncrona (try/catch grava `status='error'` mesmo no abort), então a janela é pequena — mas se o processo Node morrer (OOM, SIGKILL) entre `INSERT permuta_eleicao_run` e o último candidata, sobra um cabeçalho sem `finished_at` correto e sem ninguém para limpar.
- **Impacto de negócio**: Acumula linhas órfãs no Postgres com o tempo. Não bloqueia funcionalmente hoje, mas vira passivo na Fatia 2 (quando `EXECUTADA` for status e dependencia de "última run válida" for crítica para escolher o que executar).
- **Métrica de baseline**: 0 reaper / 0 reconciliação Conexos⇄snapshot.

## 5. Cards Kanban

### [fault-tolerance-1] Embrulhar `persistRun` em transação SQL real

- **Problema**
  > `PermutaSnapshotRepository.persistRun` faz N+1 `INSERT` independentes sem `BEGIN/COMMIT`. Se o Postgres dropar conexão entre o cabeçalho da run (já com `status='success'`) e o k-ésimo candidato, o painel passa a servir um snapshot truncado como se fosse completo. `PostgreeDatabaseClient` nem expõe `transaction()` helper — toda escrita usa `pool.query` sem `pool.connect`.

- **Melhoria Proposta**
  > Adicionar `PostgreeDatabaseClient.transaction(fn)` que faz `pool.connect()` → `BEGIN` → executa `fn(client)` → `COMMIT` (ou `ROLLBACK` no catch). Refatorar `PermutaSnapshotRepository.persistRun` para abrir UMA transação que cobre o `INSERT permuta_eleicao_run` + todos os `INSERT permuta_candidata_snapshot`. Tactic Bass: **Recovery — Backward (Rollback)**.

- **Resultado Esperado**
  > Run que falha no meio da escrita não deixa cabeçalho `status='success'` órfão. Painel só serve snapshot que tem run+candidatas íntegras (atomicidade real, não apenas declarada).

- **Tactic alvo**: Rollback (backward recovery)
- **Severidade**: P0
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-4
- **Métricas de sucesso**:
  - Operações multi-write transacionadas: 0/1 → 1/1
  - Teste novo cobrindo "DB throws no 2º candidata insert → 0 linhas em ambas as tabelas": presente
- **Risco de não fazer**: Em 6 meses, com a Fatia 2 já executando em `fin010` baseado no snapshot, um snapshot truncado pode levar o analista a re-executar permutas que ele acreditou estarem "ocultas" — duplicando a permuta no ERP.
- **Dependências**: nenhuma; isolado.

### [fault-tolerance-2] Embrulhar `getMnyTitPermutar` em `RetryExecutor` e classificar erros transientes como `bloqueada(detail-indisponivel)`

- **Problema**
  > `ConexosClient.getMnyTitPermutar` é o ÚNICO método público do client sem `retryExecutor` e com catch silencioso em qualquer erro não-400. Blip transiente vira `valorPermutar=undefined` → Gate 2 reprova → `BLOQUEADA(falha-gate)` indistinguível de reprovação legítima. Snapshot mistura "regra de negócio falhou" com "rede falhou".

- **Melhoria Proposta**
  > 1) Embrulhar a chamada `getGeneric` em `this.retryExecutor.execute(...)` igual aos demais métodos. 2) Após retries, em vez de devolver `undefined` silencioso, lançar `ConexosError({ endpoint: 'com298/<docCod>', cause })`. 3) `EleicaoPermutasService.buildCandidata` captura, e cria candidata em estado `BLOQUEADA` com novo `MotivoBloqueio.DETAIL_INDISPONIVEL` (motivo dedicado). Tactic Bass: **Redundancy + Quarantine** (separar falha técnica de falha de regra).

- **Resultado Esperado**
  > Falhas transientes do detail endpoint NÃO geram falso negativo de Gate 2. Quando ocorrem, viram bucket dedicado no painel ("X candidatas com detail Conexos indisponível — reexecutar"), distinguível de reprovação legítima.

- **Tactic alvo**: Redundancy / Quarantine
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - Endpoints com `RetryExecutor`: 7/8 → 8/8
  - Motivos de bloqueio distinguindo erro técnico vs regra: 0 → 1 (`detail-indisponivel`)
- **Risco de não fazer**: Quando Fatia 2 começar a executar permutas elegíveis, candidatas falsamente bloqueadas ficam fora da execução. Backlog cambial real cresce; análise post-mortem é cega ("estava `falha-gate`, devia estar `elegivel`").
- **Dependências**: ontology — adicionar `detail-indisponivel` em `MOTIVO_BLOQUEIO` (constants + state-machine).

### [fault-tolerance-3] Persistir `filCod` no snapshot por candidata

- **Problema**
  > Coluna `fil_cod INTEGER` existe na migration `0001_permuta_eleicao.sql:30`, mas nenhum caminho de código a popula. `Adiantamento` e `PermutaCandidata` não carregam `filCod`; `PermutaSnapshotRepository.insertCandidata` não inclui `$filCod` no `INSERT`. Resultado: todos os snapshots têm `fil_cod=NULL` mesmo em ambiente multi-filial.

- **Melhoria Proposta**
  > 1) Adicionar `filCod: number` em `Adiantamento.ts` (ou em `PermutaCandidata.ts` como campo de auditoria). 2) Propagar `filCod` em `EleicaoPermutasService.processFilial → buildCandidata`. 3) Incluir `fil_cod` no `INSERT` e no `mapSnapshotRow`. Tactic Bass: **Repair State** (estado persistido reflete dimensão correta).

- **Resultado Esperado**
  > `fil_cod` populado em 100% das linhas do snapshot. Painel passa a distinguir filial. Auditoria O6 ganha a dimensão multi-filial.

- **Tactic alvo**: Repair State
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - `% candidatas com fil_cod NOT NULL`: 0% → 100%
- **Risco de não fazer**: Colisão de `docCod` entre filiais (possível em Conexos com escopo per-filCod) leva a leituras erradas no painel. Quando a Trading expandir filiais, o dado vira lixo.
- **Dependências**: nenhuma.

### [fault-tolerance-4] Emitir `status='partial'` quando uma filial falha após outra ter sucesso

- **Problema**
  > `RunStatus` admite `'partial'` e a `CHECK` constraint permite, mas `EleicaoPermutasService` só escreve `'success'` ou `'error'`. Falha na filial N descarta trabalho da filial 1..N-1, sem possibilidade de "reexecuta SÓ a filial 2 que faltou".

- **Melhoria Proposta**
  > Refatorar o loop `for (const filial of filiais)` para `Promise.allSettled` + tracking por filial. Em caso de mix `fulfilled/rejected`: persistir candidatas das filiais OK + 1 linha de auditoria por filial falha (nova tabela `permuta_eleicao_run_filial` ou JSONB extra) + `status='partial'`. Reexecução pode então ler o último `partial` e refazer só as filiais que faltaram. Tactic Bass: **Recovery — Forward (Reintroduction parcial)**.

- **Resultado Esperado**
  > Falha em uma filial não invalida o trabalho de todas; reexecução tem hint do escopo restante; painel pode opcionalmente sinalizar "X filiais não foram processadas neste snapshot".

- **Tactic alvo**: Forward recovery
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - Caminhos de código que escrevem `status='partial'`: 0 → 1
  - Tempo de retentativa após falha (filiais reprocessadas redundantemente): N filiais → só as que falharam
- **Risco de não fazer**: Quando a Fatia 2 plugar EventBridge diário (dívida O4), uma falha intermitente vira "snapshot atrasado em 1 dia inteiro" porque a nova run também precisa recomeçar do zero.
- **Dependências**: ADR de mudança na semântica de `partial`; alinhamento com `OntologyCurator`.

### [fault-tolerance-5] Aceitar `Idempotency-Key` em `POST /permutas/eleicao` e dedupe por hash

- **Problema**
  > A rota `POST /permutas/eleicao` aceita qualquer chamada sem dedup. Duplo-clique do analista (`heavyRouteLimiter` 10/min/IP não bloqueia 2 cliques imediatos) dispara 2 runs paralelas pesadas no Conexos. Resultado: 2 linhas de auditoria iguais com `flowId` diferente; sessão Conexos sob estresse duplo; SqlBuilder do Postgres pode atingir `MaxClientsInSessionMode`.

- **Melhoria Proposta**
  > 1) Aceitar header `Idempotency-Key` (RFC draft-ietf-httpapi-idempotency). 2) Persistir tabela `permuta_eleicao_idempotency (key TEXT PK, run_id UUID, created_at TIMESTAMPTZ)`. 3) Antes de executar, lookup; se a key já existe, devolver a run anterior. TTL 24h. Tactic Bass: **Idempotent Replay (a nível de request)**.

- **Resultado Esperado**
  > Duplo-clique = 1 run. Reexecução intencional precisa de key diferente. Auditoria mais limpa, Conexos menos estressado.

- **Tactic alvo**: Idempotent Replay
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - % endpoints state-mutating financeiros com idempotency: 0 → 100%
  - Runs duplicadas/dia por duplo-clique: TBD → 0
- **Risco de não fazer**: Em Fatia 2 (escrita no `fin010`), a MESMA brecha leva a execução dupla de permuta — esse padrão tem que estar provado e disseminado ANTES da Fatia 2 mexer no `fin010`. Atrasar aqui é se atirar no pé depois.
- **Dependências**: ontology — `Idempotency` decision; padrão a ser reusado por SISPAG/GED.

### [fault-tolerance-6] Sinalizar staleness do snapshot no `GET /permutas/painel`

- **Problema**
  > `PainelService` expõe `snapshotAge` cru (ms), sem flag de stale, sem threshold. Se a última run errored, a anterior (1, 2, 10 dias) continua sendo servida como "última success". Sem disparo automático (O4 dívida), gap pode crescer silenciosamente.

- **Melhoria Proposta**
  > 1) Adicionar `stale: boolean` no `PainelResponse`, calculado com threshold configurável (sugestão inicial: 24h, alinhado com o cron diário do estado-alvo). 2) `BUSINESS_WARN` quando `stale=true`. 3) Opcional: incluir `lastSuccessAt` + `lastAttemptAt` (se a última tentativa errou). Tactic Bass: **Timestamp + Condition Monitoring**.

- **Resultado Esperado**
  > Frontend (fora do escopo) recebe flag boolean clara para badge "DESATUALIZADO". Analista deixa de tomar decisão baseado em snapshot velho sem saber.

- **Tactic alvo**: Timestamp / Condition Monitoring
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-6, F-fault-tolerance-1, F-fault-tolerance-4
- **Métricas de sucesso**:
  - Flag `stale` no payload: ausente → presente
  - Threshold documentado (ADR): 0 → 1
- **Risco de não fazer**: Quando a Fatia 2 acoplar execução, decisão de executar permuta vai ser tomada com base no painel. Snapshot velho = execução em PROFORMA já alterada no Conexos = dor.
- **Dependências**: nenhuma; isolado.

### [fault-tolerance-7] Sanity-check do filtro `adiantamento` enquanto o probe não fecha

- **Problema**
  > `ADIANTAMENTO_FILTER_KEY/_VALUE` em `conexosPermutasConstants.ts` são placeholders TODO. Se o Conexos ignorar uma chave de filtro desconhecida, o universo retornado pelo `listAdiantamentosProforma` vira "todas PROFORMAs finalizadas", e o snapshot vira lixo (centenas de bloqueadas em Gate 2). Sem nenhum guard contra esse modo silencioso.

- **Melhoria Proposta**
  > Enquanto o probe não fecha: 1) Emitir `BUSINESS_WARN` em `listAdiantamentosProforma` toda vez que executado, mencionando "filtro adiantamento é placeholder". 2) Sanity-check: contar `mnyTitPermutar>0` no batch retornado — se < X% dos rows passam Gate 2, log `BUSINESS_WARN cap "filter-likely-ignored"`. Tactic Bass: **Sanity Checking / Comparison**.

- **Resultado Esperado**
  > Telemetria detecta degradação do filtro antes do analista se confundir com 400 falsas-bloqueadas.

- **Tactic alvo**: Sanity Checking / Comparison
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - Warn count emitido quando filtro placeholder em uso: TBD → 1/run enquanto não fecha probe
- **Risco de não fazer**: Probe pode demorar; durante a demora, ambiente DEV pode ter regra de "ignorar chave desconhecida" diferente de PROD — risco de descobrir só em produção.
- **Dependências**: depende do probe P0-3 fechar (`ontology/_inbox`).

### [fault-tolerance-8] Reaper + reconciliação contra Conexos

- **Problema**
  > Sem job de "limpa runs órfãs" ou "compara contagem do último snapshot com Conexos". Em Fatia 1 a janela é pequena (síncrono), mas vira passivo na Fatia 2 quando run pode ficar `running` por minutos.

- **Melhoria Proposta**
  > 1) Adicionar coluna `permuta_eleicao_run.heartbeat_at` atualizada a cada filial processada. 2) Job (EventBridge/cron a definir) marca como `status='error'` toda run com `heartbeat_at < now() - INTERVAL '15 min'` e `status NOT IN ('success','error','partial')`. 3) Job de reconciliação diário: comparar `total_elegiveis` da última `success` com contagem direta no Conexos; divergência > X% → alerta. Tactic Bass: **Condition Monitoring + Reconcile**.

- **Resultado Esperado**
  > Runs zumbi têm prazo de validade; divergência silenciosa Conexos⇄snapshot é detectada.

- **Tactic alvo**: Condition Monitoring / Reconcile
- **Severidade**: P2
- **Esforço estimado**: L
- **Findings relacionados**: F-fault-tolerance-8
- **Métricas de sucesso**:
  - Reaper de runs órfãs: ausente → presente
  - Job de reconciliação: ausente → presente
- **Risco de não fazer**: Acumula passivo silencioso. Em 6 meses com Fatia 2 rodando, dimensão "quantas runs zumbi temos?" não tem resposta.
- **Dependências**: dívida O4 (scheduler/cron). Depende do estado-alvo Lambda + EventBridge entrar.

## 6. Notas do agente

- O cenário de Fault Tolerance da Fatia 1 é mais brando que será a Fatia 2 (sem write em `fin010`), mas o snapshot já é "money-adjacent": decisões da Fatia 2 vão se ancorar nele. Tratei snapshot consistente como o equivalente local de "sem double-execution".
- Não rodei `npm test`/`npm run typecheck` (modo `--quick` + apenas leitura); todas as métricas vêm de `grep`+`Read`.
- Cross-QA: F-fault-tolerance-5 (Idempotency-Key) reaparece em **Security** (anti-replay) e **Availability** (proteção do Conexos). F-fault-tolerance-6 (staleness) toca **Modifiability** (contract `PainelResponse` precisa evoluir junto com o frontend, fora desta fatia). F-fault-tolerance-2 (retry `getMnyTitPermutar`) também é finding de **Integrability** (consistência de tratamento de erro entre métodos do mesmo client).
