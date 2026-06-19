---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-18-2346
agent: qa-fault-tolerance
generated_at: 2026-06-19T00:00:00Z
scope: backend
score: 8.5
findings_count: 3
cards_count: 3
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos `com298` (endpoint detalhe) | Falha transiente ou payload parcial em que `mnyTitPermuta` está ausente / null durante a eleição | `ConexosClient.mapDetalheTitulos` → `EleicaoPermutasService.buildCandidata` → `ElegibilidadeService.motivoDoGateFalho` | Run de eleição em fan-out multi-filial, leitura-only (sem write para Conexos) | Classificação conservadora: detalhe ausente totalmente → `DETAIL_INDISPONIVEL` (re-avaliável na próxima run); `mnyTitPermuta` ausente / null → `valorPermutado=undefined` → fallback `SEM_SALDO_PERMUTAR` (nunca mislabel como `JA_PERMUTADO`) | 0 candidatas mislabeladas como `JA_PERMUTADO` por dado ausente; 0 runs travadas por blip transiente; reprocess automático na próxima run (idempotente) |

A feature é **read-only** (Fatia 1) — não há write financeiro a Conexos / Nexxera / GED. O bar de fault-tolerance se reduz a (a) defaults seguros em ausência de dado, (b) preservação da idempotência da eleição já existente (P0-6), (c) não silenciar erros transientes que mudem o estado classificado.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| `mnyTitPermuta` ausente → `valorPermutado` permanece `undefined` (sem inferência) | sim — `parseOptionalNumber` + spread condicional | sim | ✅ | `ConexosClient.ts:944-952` |
| Fallback de classificação quando `valorPermutado` ausente | `SEM_SALDO_PERMUTAR` (conservador) | nunca `JA_PERMUTADO` por dado ausente | ✅ | `ElegibilidadeService.ts:151-155` |
| Detail-fetch falhou após retries → motivo dedicado | `DETAIL_INDISPONIVEL` (distinto de `FALHA_GATE`) | candidata reavaliável | ✅ | `EleicaoPermutasService.ts:424-436, 467-483` |
| Idempotência da run (preservada) | `Idempotency-Key` + `pg_try_advisory_lock` + double-check | preservada | ✅ | `EleicaoPermutasService.ts:106-166` |
| Erro silencioso em catch (financial-write surrogate) | nenhum no caminho `já permutado`; um `catch {}` legítimo na hidratação de `valorMoedaNegociada` (linha cosmética) | nenhum no caminho classificatório | ✅ | `EleicaoPermutasService.ts:586-588` |
| Tests cobrindo `JA_PERMUTADO` vs `SEM_SALDO_PERMUTAR` | suites afetadas verde (91 pass) | passar | ✅ | `_shared-metrics.md` linha 28 |
| Audit-trail do estado classificado | `persistRun` grava run + snapshot rows; falha → run com status=error, ZERO snapshot rows (atomicidade) | persistir | ✅ | `EleicaoPermutasService.ts:266-326` |
| Test cobrindo explicitamente `mnyTitPermuta=null` → fallback `SEM_SALDO_PERMUTAR` | não verificável pontualmente em `--quick` (suite passa globalmente) | caso de borda coberto | ⚠️ | suites `ConexosClient.test`, `ElegibilidadeService.test` |
| Reconciliação periódica contra Conexos | N/A nesta fatia (read-only) | N/A | N/A | — |
| DLQ / SQS consumer idempotency | N/A — não há SQS nesta fatia | N/A | N/A | — |

> ⚠️ **Não medível localmente** em `--quick`: cobertura linha-a-linha do branch `mnyTitPermuta=null → SEM_SALDO_PERMUTAR`. Requer execução de cobertura por arquivo (skipped per `--quick`). Recomendação: rodar `npm run test:coverage` apontando para `ElegibilidadeService.test.ts` para confirmar o branch coberto.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A (read-only; sem failover de fonte) | N/A | — |
| Replacement | N/A | N/A | — |
| Predictive Model | N/A | N/A | — |
| Increase Competence Set | Mais um motivo de bloqueio distinto (`JA_PERMUTADO`) — o sistema reconhece um estado de mundo que antes caía no balde genérico `SEM_SALDO_PERMUTAR`, aumentando o domínio de entradas tratadas com precisão | ✅ presente | `ElegibilidadeService.ts:144-158` |
| Sanity Checking | `parseOptionalNumber` valida `mnyTitPermutar` / `mnyTitPermuta` / `mnyTitAberto` — não-numérico → `undefined`, nunca `NaN` propagado | ✅ presente | `ConexosClient.ts:944-947` |
| Comparison | N/A (sem replicação ativa nessa fatia) | N/A | — |
| Timestamp | `startedAt` / `finishedAt` em `persistRun`; `dataBase` da declaração para aging | ✅ presente | `EleicaoPermutasService.ts:257, 264, 269` |
| Timeout | Herdado dos clients (`RetryExecutor` + `ConexosClient`) — não tocado por esta fatia | ✅ presente (herdado) | `ConexosClient.ts:929` (typed `ConexosError` após retries) |
| Condition Monitoring | `LOG_TYPE.FLOW_START / FLOW_COMPLETE / FLOW_ERROR / BUSINESS_WARN` (incluindo `cap-hit` e `DETAIL_INDISPONIVEL`) | ✅ presente | `EleicaoPermutasService.ts:205-209, 279-288, 319-325, 339-344, 467-479` |
| Self-Test | N/A | N/A | — |
| Voting | N/A (fonte única Conexos) | N/A | — |
| Redundancy | N/A nesta fatia | N/A | — |
| Recovery — Forward | Detail indisponível → marca candidata como `DETAIL_INDISPONIVEL` (forward recovery: re-avaliável na próxima run, sem travar run inteira) | ✅ presente | `EleicaoPermutasService.ts:420-436, 467-483` |
| Recovery — Backward (Rollback) | Falha global da run → `persistRun` com `status=error` e **zero** snapshot rows (atomicidade transacional) | ✅ presente | `EleicaoPermutasService.ts:300-326` |
| Reintroduction (Shadow / State Resync / Escalating Restart) | Próxima run reprocessa do zero (idempotente P0-7); replay via `Idempotency-Key` reaproveita run existente | ✅ presente | `EleicaoPermutasService.ts:106-166` |
| Rollback | Atomicidade da run (status=error, 0 rows) — ver Recovery Backward | ✅ presente | `EleicaoPermutasService.ts:300-326` |
| Repair State | N/A (sem write externo nesta fatia) | N/A | — |
| Idempotent Replay | `findRunIdByIdempotencyKey` + advisory lock + double-check sob lock | ✅ presente | `EleicaoPermutasService.ts:112-166` |
| Compensating Transaction | N/A (read-only — sem write a desfazer) | N/A | — |
| Reconcile | N/A nesta fatia (read-only); cada run recomputa do zero, o que é uma "reconciliação implícita" frente ao Conexos | N/A (parcialmente endereçado) | `EleicaoPermutasService.ts:78-82` |
| Quarantine | Candidata bloqueada com motivo específico (`JA_PERMUTADO` / `SEM_SALDO_PERMUTAR` / `DETAIL_INDISPONIVEL`) → quarentena por motivo no snapshot, sem contaminar elegíveis | ✅ presente | `ElegibilidadeService.ts:95-101`; `EleicaoPermutasService.ts:226-241` |

## 4. Findings (achados)

### F-fault-tolerance-1: `mnyTitAberto` ausente → `pago` é forçado a `false` no fan-out (já documentado, mas conviver com `valorPermutado` ausente reforça o ponto de auditoria)

- **Severidade**: P3
- **Tactic violada**: Sanity Checking (parcial — a inferência é conservadora, mas obscurece "indisponível" vs "não-pago real")
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:494-500`
- **Evidência (objetiva)**:
  ```
  // Quando o detalhe não traz `mnyTitAberto` (campo ausente/null), `detalhe.pago`
  // é undefined → forçamos `false` (conservador: Gate 3 reprova; NUNCA inferimos
  // pago=true sem prova).
  pago: detalhe.pago ?? false,
  ```
- **Impacto técnico**: Indistinguível "não pago" de "dado ausente no detalhe" — a candidata cai em `NAO_PAGO` mesmo quando o estado de pagamento é desconhecido. Para a fatia `já permutado`, isso é benigno porque `gate 3` falha primeiro e a lógica nem chega a inspecionar `valorPermutado`. Anotação de telemetria, não bug.
- **Impacto de negócio**: Eventual ruído de bloqueio com motivo `NAO_PAGO` quando o motivo real seria `DETAIL_INDISPONIVEL` — analistas podem perder algum tempo verificando manualmente.
- **Métrica de baseline**: 0 candidatas conhecidas com este padrão na fatia atual; tests verdes.

### F-fault-tolerance-2: Falta teste de borda explícito para `mnyTitPermuta` ausente → fallback `SEM_SALDO_PERMUTAR`

- **Severidade**: P2
- **Tactic violada**: Sanity Checking (validação de input boundary não totalmente coberta por test de regressão dedicado)
- **Localização**: `src/backend/domain/service/permutas/ElegibilidadeService.ts:151-155`; suites `ElegibilidadeService.test.ts` / `ConexosClient.test.ts`
- **Evidência (objetiva)**:
  ```
  if (falhou(GATE.VALOR_PERMUTAR)) {
      return (adiantamento.valorPermutado ?? 0) > 0
          ? MOTIVO_BLOQUEIO.JA_PERMUTADO
          : MOTIVO_BLOQUEIO.SEM_SALDO_PERMUTAR;
  }
  ```
  Suíte global passa (91 passed conforme `_shared-metrics.md`), mas a presença de um caso dedicado `valorPermutado===undefined → SEM_SALDO_PERMUTAR` não é verificada pontualmente em `--quick`.
- **Impacto técnico**: Se uma refator futura inverter o operador `> 0` para `>= 0` ou trocar `??` por `??=`, o fallback silenciosamente passa a classificar `undefined` como `JA_PERMUTADO`. Risco de regressão é P2 — afeta UX, mas não financial write.
- **Impacto de negócio**: Candidata mislabelada na coluna do painel — analista recebe sinal incorreto ("já permutado" quando nunca houve permuta).
- **Métrica de baseline**: cobertura de branch específica não medida em `--quick`. Não é P1 porque a fatia é read-only e a UX é a única superfície afetada.

### F-fault-tolerance-3: `JA_PERMUTADO` é estado terminal — sem reprocess path documentado para "voltar atrás"

- **Severidade**: P3
- **Tactic violada**: Reintroduction (Shadow / State Resync)
- **Localização**: `src/backend/domain/service/permutas/ElegibilidadeService.ts:144-158`; ontologia (`ontology/state-machines/`)
- **Evidência (objetiva)**: A fatia não modela um caminho de "des-permutado" — se o Conexos cancelar a permuta executada, a próxima run lê `mnyTitPermuta=0` e a candidata volta a ser elegível. Isso é o comportamento desejado (idempotência da run resolve), mas não há teste explícito do giro `JA_PERMUTADO → ELEGIVEL`.
- **Impacto técnico**: Nenhum bug; só lacuna de cobertura intencional. A ontologia da state-machine de permuta ainda não modela explicitamente este loop.
- **Impacto de negócio**: Confiança operacional menor — em um cenário "Conexos estornou a permuta", a re-classificação correta acontece, mas o time não tem garantia explícita.
- **Métrica de baseline**: Não medível em `--quick`. Marcado para retroespectiva.

## 5. Cards Kanban

### [fault-tolerance-1] Logar `DETAIL_AUSENTE` quando `mnyTitAberto` for `undefined` (em vez de cair como `NAO_PAGO`)

- **Problema**
  > Quando o detalhe Conexos não devolve `mnyTitAberto`, o serviço força `pago=false` e o `ElegibilidadeService` classifica como `NAO_PAGO`. Indistinguível de um adiantamento legitimamente não pago — o analista perde tempo investigando. Cenário: blip parcial de payload em `com298/{docCod}`.

- **Melhoria Proposta**
  > Em `EleicaoPermutasService.buildCandidata`, quando `detalhe.pago === undefined` E `detalhe.valorPermutar === undefined` E `detalhe.valorPermutado === undefined`, emitir `BUSINESS_WARN` com tag `detalhe-vazio` e considerar classificar como `DETAIL_INDISPONIVEL` (em vez do fallback `pago=false`). Manter o default conservador, só melhorar o sinal de telemetria.

- **Resultado Esperado**
  > Telemetria distingue "candidata não paga de verdade" de "candidata cujo detalhe veio vazio". Sem mudança no comportamento de classificação.

- **Tactic alvo**: Sanity Checking + Condition Monitoring
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - Linhas de log com tag `detalhe-vazio`: 0 (não instrumentado) → contagem rastreável
  - Falsos `NAO_PAGO` por payload vazio: indistinguível hoje → identificável
- **Risco de não fazer**: Ruído operacional baixo. Em 6 meses, possivelmente 0 incidentes — é higiene de telemetria.
- **Dependências**: nenhuma.

### [fault-tolerance-2] Test de borda dedicado: `valorPermutado` ausente → `SEM_SALDO_PERMUTAR`

- **Problema**
  > A regra `(adiantamento.valorPermutado ?? 0) > 0 ? JA_PERMUTADO : SEM_SALDO_PERMUTAR` em `ElegibilidadeService.motivoDoGateFalho` é uma defesa crítica contra mislabel da UX. Não há teste explícito que falhe se alguém inverter `> 0` para `>= 0` ou trocar `??` por `||`.

- **Melhoria Proposta**
  > Adicionar caso em `ElegibilidadeService.test.ts` (e/ou `EleicaoPermutasService.test.ts`) que monte um adiantamento com `valorPermutar=0`, `pago=true`, `valorPermutado=undefined` e exija `motivoBloqueio === SEM_SALDO_PERMUTAR`. Espelhar com `valorPermutado=0` (mesmo resultado) e `valorPermutado=undefined`/`null` no client (`ConexosClient.test.ts`).

- **Resultado Esperado**
  > Branch coverage explícito sobre o fallback conservador; refator futura quebra o teste antes de chegar a produção.

- **Tactic alvo**: Sanity Checking
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - Testes cobrindo `valorPermutado=undefined → SEM_SALDO_PERMUTAR`: ausente (não verificável em `--quick`) → ≥1 caso dedicado
  - Mutation-test survivors para essa linha: não medido → 0
- **Risco de não fazer**: Em 6 meses, alguma refator de tipos pode trocar `??` por `||` e mislabel "novo adiantamento sem permuta" como "já permutado" — analista perde tempo, mas nenhum write financeiro é executado por engano (fatia read-only).
- **Dependências**: nenhuma.

### [fault-tolerance-3] Documentar o ciclo `JA_PERMUTADO → ELEGIVEL` na state-machine + 1 teste de regressão

- **Problema**
  > A classificação `JA_PERMUTADO` é derivada do estado atual do Conexos (`mnyTitPermuta>0`). Se o Conexos estornar a permuta (`mnyTitPermuta` volta a 0 / null), a próxima run reclassifica corretamente — mas isso não está documentado na ontologia da state-machine nem coberto por teste explícito.

- **Melhoria Proposta**
  > (1) Adicionar nota na state-machine de PermutaCandidata na ontologia explicitando que `JA_PERMUTADO` é derivado, não persistido, e que cada run recomputa do zero. (2) Adicionar teste que simula run-1 com `mnyTitPermuta>0` → `JA_PERMUTADO`, depois run-2 com `mnyTitPermuta=0` → `SEM_SALDO_PERMUTAR` (ou `ELEGIVEL` se demais gates passarem).

- **Resultado Esperado**
  > Garantia operacional explícita do giro reverso. Ontologia atualizada com a invariante "classificação derivada, idempotente por run".

- **Tactic alvo**: Reintroduction (State Resync) + Idempotent Replay
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - Documentação da invariante na state-machine: ausente → presente
  - Testes do giro reverso: ausente → ≥1
- **Risco de não fazer**: Confusão operacional rara, mas possível. Sem write financeiro envolvido.
- **Dependências**: ontologia da state-machine de PermutaCandidata.

## 6. Notas do agente

- Escopo `--quick` + feature read-only justifica score alto (8.5): os defaults conservadores (`pago ?? false`, `valorPermutado ?? 0`, `DETAIL_INDISPONIVEL`) cobrem os modos de falha relevantes. Não há write financeiro → nenhum risco de double-execution.
- Cross-QA: idempotência da run (linhas 106-166 de `EleicaoPermutasService.ts`) já foi considerada para qa-availability/qa-performance; aqui só registramos que ela **preserva** o fallback `SEM_SALDO_PERMUTAR` em replays. Cobertura de testes de borda (Card 2) sobrepõe com qa-testability. Audit-trail (`persistRun` linhas 266-326) sobrepõe com qa-security (auditabilidade).
- Cards são todos P2/P3: não bloqueiam merge nem entram no loop P0. Vão para `ontology/_inbox/<feature>-regis-followups.md`.
- Não houve achado de "silent catch" no caminho classificatório; o único `catch {}` (linhas 586-588) é em hidratação cosmética de `valorMoedaNegociada`, fora do path da fatia "já permutado".
