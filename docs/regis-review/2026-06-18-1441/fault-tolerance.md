---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-18-1441
agent: qa-fault-tolerance
generated_at: 2026-06-18T16:48:00-03:00
scope: backend
score: 8.5
findings_count: 2
cards_count: 2
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (`com298/{docCod}` detail) | Blip transiente 5xx / network timeout / 400-VALIDATION exótico em meio à eleição diária de permutas | `ConexosClient.getDetalheTitulos` + `EleicaoPermutasService.buildCandidata` (Gate 2 valorPermutar + Gate 3 pago) | Job de eleição rodando para 1+ filial, várias PROFORMAs candidatas em fan-out | (1) tentar via `RetryExecutor` (≤ 8/8 endpoints), (2) propagar `ConexosError` tipado se exausto, (3) bloquear a candidata com `MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL` (re-avaliável próxima run), (4) NUNCA inferir `pago=true` sem prova — `pago` ausente força `false` (Gate 3 reprova). | 0 candidatas falsamente eleitas como ELEGÍVEIS por leitura parcial; 100% das falhas de detalhe convergem para BLOQUEADA/`detail-indisponivel` (distinto de `falha-gate`); MTTR = 1 ciclo de eleição (24h). |

> Cenário concreto: doc `26471` (filCod=2) — `mnyTitAberto`=384119.95 no detalhe (NÃO pago), `mnyTitAberto`=null na row do `com298/list` (probe real 2026-06-18). Ler `pago` apenas do detalhe e nunca da list é o que sustenta o invariante "no false-positive paid".

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| `getDetalheTitulos` envolto em `RetryExecutor` | sim | sim | ✅ | `ConexosClient.ts:853` |
| Falha exausta de retry → erro tipado (não silent default) | `ConexosError` lançado | erro tipado | ✅ | `ConexosClient.ts:887-893` |
| Inferência de `pago=true` sem `mnyTitAberge` legível | nunca (`mnyTitAberto===0`) | nunca | ✅ | `ConexosClient.ts:907` |
| Distinção `DETAIL_INDISPONIVEL` × `FALHA_GATE` no estado de bloqueio | sim, motivos separados na taxonomia | sim | ✅ | `EstadoElegibilidade.ts:28,38` |
| Conservadorismo no fallback de `pago` (Gate 3) | `detalhe.pago ?? false` | `?? false` (nunca `?? true`) | ✅ | `EleicaoPermutasService.ts:449` |
| Quirk 400-VALIDATION com `responseData` tratado como resposta válida (sem retry) | sim, sem retry | sim | ✅ | `ConexosClient.ts:861-882` |
| Re-avaliabilidade (idempotência forward-recovery) — re-run da eleição reconcilia | sim, candidata BLOQUEADA não persiste estado terminal externo | sim | ✅ | `EleicaoPermutasService.ts:415` (comentário) + ausência de write em ERP nesta fatia |
| Cobertura de testes do caminho degradado (P0-3 path) | 4 cenários: pago=false, pago=true, pago=undefined, retry-then-400-quirk, retry-exhausted→ConexosError | ≥3 cenários | ✅ | `ConexosClient.test.ts:1185-1270`; `EleicaoPermutasService.test.ts:205-237` |
| Log estruturado da degradação (`BUSINESS_WARN` com `motivo=DETAIL_INDISPONIVEL`) | presente | presente | ✅ | `EleicaoPermutasService.ts:424-434` |
| Audit/observabilidade — distinção warn × error preservada (não double-log) | `logService.warn` no service; ConexosError propagado vem do client sem error-log duplicado neste caminho | sim | ✅ | mesmo callsite |
| Reprocess scenario — `DETAIL_INDISPONIVEL` re-elegível na próxima run | sim por design (sem side-effect persistido fora do snapshot da run) | sim | ✅ | shape `PermutaCandidata` (sem persistência terminal) |

> ⚠️ **Não medível localmente**: taxa real de blips do Conexos em `com298/{docCod}` em produção (frequência de retry-exhaustion) — requer CloudWatch após a primeira tenancia. Recomendação: emitir métrica `permutas.eleicao.detail_indisponivel.count` por run para detectar regime degradado prolongado de uma filial.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass / FT canon) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Sanity Checking | `mapDetalheTitulos` valida tipo do `detail` (`!detail \|\| typeof detail !== 'object' → {}`) e usa `parseOptionalNumber` antes de derivar `pago` | ✅ | `ConexosClient.ts:884,902-912` |
| Comparison (response shape) | `mnyTitAberto === 0` como predicado explícito (TOTALMENTE PAGO); `===` estrito; nunca `truthy`-check | ✅ | `ConexosClient.ts:907` |
| Timeout | `RetryExecutor` herda timeout do client legacy axios (cross-ref Availability/Performance) | ✅ | `ConexosClient.ts:853` |
| Condition Monitoring | `BUSINESS_WARN` estruturado no callsite degradado, com `motivo`, `flowId`, `filCod`, `docCod` | ✅ | `EleicaoPermutasService.ts:424-434` |
| Voting | N/A — fonte única (Conexos); voto cross-source faz sentido só se houvesse 2nd source para `pago` | N/A | — |
| Self-Test | N/A no escopo do delta (não há heartbeat introduzido aqui) | N/A | — |
| Substitution / Replacement | N/A — não há replica/backup de Conexos | N/A | — |
| Predictive Model | N/A neste escopo | N/A | — |
| Increase Competence Set | quirk-handling do 400-VALIDATION com `responseData` é exatamente "ampliar o conjunto de respostas legítimas que o cliente sabe interpretar" — não trata o 400 como falha | ✅ | `ConexosClient.ts:861-882` |
| Redundancy (Retry) | `RetryExecutor` envolve a chamada inteira; retentativa cobre 5xx/network blip e re-emite o GET (idempotente) | ✅ | `ConexosClient.ts:853` |
| Recovery — Forward | Falha terminal → candidata BLOQUEADA com motivo dedicado; próxima run re-tenta (read-only, sem side effect a desfazer no ERP) | ✅ | `EleicaoPermutasService.ts:415,435` |
| Recovery — Backward (Rollback / Compensating Tx) | N/A no delta — a eleição é read-only (não executa permuta no `fin010`). Compensação só é exigível em fatia 2 (execução). | N/A | confirma `score` do delta; não há write externo aqui |
| Reintroduction (State Resync) | `DETAIL_INDISPONIVEL` é re-avaliada na próxima run sem migração de estado; o snapshot da run anterior expira | ✅ | comentário `EleicaoPermutasService.ts:415` |
| Rollback | N/A (sem write) | N/A | — |
| Repair State / Quarantine | `BLOQUEADA(DETAIL_INDISPONIVEL)` cumpre o papel de quarentena por execução (candidata fica visível como bloqueada mas distinta de reprovação por mérito) | ✅ | `EleicaoPermutasService.ts:379-391` |
| Idempotent Replay | `GET com298/{docCod}` é naturalmente idempotente; re-execução do retry é segura | ✅ | semântica HTTP GET; nenhum side effect local persistido nesta fatia |
| Reconcile | Implícito — re-run diária reconcilia uma candidata BLOQUEADA por detail indisponível (passa a ELEGÍVEL/BLOQUEADA-por-mérito assim que o detalhe responde) | ✅ parcial | depende de cadência (EventBridge alvo, ainda não cabeada em runtime atual) |

## 4. Findings (achados)

### F-fault-tolerance-1: `detalhe.pago ?? false` é seguro mas perde a distinção "detalhe respondeu, mas `mnyTitAberto` ausente" no estado da candidata

- **Severidade**: P1
- **Tactic violada**: Condition Monitoring (sub-óptimo — não viola, mas degrada observabilidade)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:449`
- **Evidência (objetiva)**:
  ```ts
  // EleicaoPermutasService.ts:439-450
  const hydrated: Adiantamento = {
      ...adiantamento,
      ...(detalhe.valorPermutar !== undefined
          ? { valorPermutar: detalhe.valorPermutar }
          : {}),
      pago: detalhe.pago ?? false,   // ← caso (A) pago=false real e (B) pago=undefined indistinguíveis após este ponto
  };
  ```
  ```ts
  // ElegibilidadeService.ts:69 — Gate 3 reprova em ambos os casos
  { gate: GATE.TOTALMENTE_PAGO, passed: adiantamento.pago === true }
  ```
- **Impacto técnico**: o caminho conservador é correto (Gate 3 reprova, NUNCA infere pago=true sem prova — exatamente o invariante "no false-positive paid"). MAS após o `??`, o estado downstream perde a capacidade de distinguir "Conexos respondeu o detalhe e o documento de fato NÃO está pago" de "Conexos respondeu o detalhe mas `mnyTitAberto` veio ausente/non-numeric". Ambos viram `pago=false` → ambos saem como `BLOQUEADA(FALHA_GATE)` com `detail=pago: false`. A diferença interessa porque o primeiro é estado terminal natural (esperar pagar), o segundo é sinal de regressão de schema do Conexos (campo desaparecendo) — operacionalmente diferentes.
- **Impacto de negócio**: nenhuma elegibilidade incorreta (zero false-positives — invariante mantido). Custo é em observabilidade: uma regressão de schema "mnyTitAberto sumiu" só se manifestaria como aumento súbito de `BLOQUEADA(FALHA_GATE)` sem causa óbvia, sem alarme dedicado.
- **Métrica de baseline**: 0 alertas/contadores hoje para `pago=undefined` após detail-success; 100% dos casos `?? false` colapsados em um único bucket no audit log.

### F-fault-tolerance-2: ausência de métrica/contador agregado de `DETAIL_INDISPONIVEL` por run impede detectar regime degradado prolongado

- **Severidade**: P1
- **Tactic violada**: Condition Monitoring (parcial)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:422-435`
- **Evidência (objetiva)**:
  ```ts
  // log per-candidata é emitido (BUSINESS_WARN), mas não há sumário "X de Y candidatas
  // bloqueadas por DETAIL_INDISPONIVEL nesta run" no final do flow
  await this.logService.warn({
      type: LOG_TYPE.BUSINESS_WARN,
      message: 'permuta eleicao detalhe da PROFORMA indisponivel — candidata bloqueada',
      data: { flowId, filCod, docCod: adiantamento.docCod, motivo: MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL },
  });
  ```
- **Impacto técnico**: se o Conexos ficar degradado por horas (e.g., 70% das PROFORMAs voltam blip), o sinal está nos logs per-candidata, mas o operador só percebe somando warnings manualmente. Cross-ref Availability: a estratégia conservadora (re-avalia próxima run) só funciona se a próxima run efetivamente roda — se o regime degradado persistir por vários ciclos, a frota de candidatas presas em `DETAIL_INDISPONIVEL` cresce sem alarme.
- **Impacto de negócio**: regime degradado prolongado se manifesta como atraso silencioso na eleição de permutas (work item stuck mid-flow indefinidamente — cumpre exatamente a definição da barra no preâmbulo desta seção). Em janela de fechamento mensal, isso pode mascarar 1+ dia de elegibilidade pendente.
- **Métrica de baseline**: 0 contadores agregados emitidos; observabilidade depende de query manual no log estruturado por `motivo=detail-indisponivel`.

## 5. Cards Kanban

### [fault-tolerance-1] Preservar distinção `pago=false` × `pago=undefined` no estado de bloqueio

- **Problema**
  > Após `pago: detalhe.pago ?? false` em `EleicaoPermutasService.ts:449`, a candidata que cai em `BLOQUEADA(FALHA_GATE)` por Gate 3 não distingue "detalhe disse explicitamente NÃO pago" de "detalhe respondeu mas `mnyTitAberto` veio ausente". A elegibilidade está correta (zero false-positives), mas uma regressão de schema do Conexos (`mnyTitAberto` sumindo) só se manifestaria como aumento silencioso de FALHA_GATE.
- **Melhoria Proposta**
  > Adicionar um motivo adicional ou um `gatesAvaliados[].detail` enriquecido quando `detalhe.pago === undefined` (e.g., `detail='pago=undefined: mnyTitAberto ausente no detalhe'` no GATE.TOTALMENTE_PAGO, ou ainda um sub-flag `pagoSource: 'mnyTitAberto-zero' | 'mnyTitAberto-absent-defaulted-false'`). Mantém a tactic conservadora (sem inferir pago=true), adiciona condition-monitoring sobre regressão do schema. Tocar: `EleicaoPermutasService.ts:449`, possivelmente `ElegibilidadeService.ts:69` (detail field).
- **Resultado Esperado**
  > Operador consegue separar `pago=false real` (~99% dos casos esperados) de `pago=undefined defaulted` (sinal de regressão Conexos). Métrica `pago_undefined_rate_per_run` rastreável.
- **Tactic alvo**: Condition Monitoring (Bass)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - `% candidatas BLOQUEADA(FALHA_GATE) com gatesAvaliados[GATE.TOTALMENTE_PAGO].detail explícito sobre origem do pago`: 0% → 100%
  - Taxa de detectabilidade de regressão de schema Conexos: manual → automática via contador
- **Risco de não fazer**: regressão silenciosa do payload Conexos (`mnyTitAberto` removido/renomeado) trava a elegibilidade real por janelas inteiras sem alarme.
- **Dependências**: nenhuma.

### [fault-tolerance-2] Emitir contador agregado por run para `DETAIL_INDISPONIVEL`

- **Problema**
  > A degradação cumulativa (várias PROFORMAs presas em `DETAIL_INDISPONIVEL` ao longo de runs sucessivas) não dispara alarme. Cada candidata gera um `BUSINESS_WARN`, mas o regime degradado em si fica invisível sem agregação. Cross-ref Availability/Performance: se a próxima run não acontecer ou se o Conexos ficar degradado por > N ciclos, work items ficam stuck mid-flow indefinidamente (definição da barra de "no work item stuck mid-flow").
- **Melhoria Proposta**
  > No final do `EleicaoPermutasService` run, emitir um `BUSINESS_INFO` (ou métrica CloudWatch quando a infra alvo existir) com `{ flowId, filCod, total, elegiveis, bloqueadas_por_motivo: { 'detail-indisponivel': N, 'falha-gate': M, ... } }`. Tactic: Condition Monitoring agregado. Não cria estado novo — apenas sumariza o que já foi computado.
- **Resultado Esperado**
  > Alarme acionável quando `detail-indisponivel / total > X%` em uma única run (sinal de regime degradado de Conexos), independente da inspeção per-candidata.
- **Tactic alvo**: Condition Monitoring (Bass)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - Latência de detecção de degradação prolongada do Conexos: manual / N horas → 1 run
  - Cobertura de teste do sumário agregado: 0 → ≥1 cenário com mix de motivos
- **Risco de não fazer**: regime degradado do Conexos por > 24h passa despercebido; cresce backlog de candidatas em `DETAIL_INDISPONIVEL` sem ninguém ver.
- **Dependências**: nenhuma (puro log estruturado hoje; vira métrica nativa quando a infra alvo existir).

## 6. Notas do agente

- **Escopo respeitado**: review restrito ao delta do feature-tweak (`getDetalheTitulos` + `buildCandidata`). Débitos pré-existentes (audit-trail invariant cross-cutting, idempotency em consumers SQS, reconciliation jobs vs Conexos) NÃO inspecionados — corretamente fora de escopo do feature-tweak gate, ficam para uma `/regis-review` full quando a infra alvo materializar.
- **Veredito sobre as perguntas do prompt**:
  - (1) **A degradação conservadora mantém estado consistente?** Sim. A eleição é read-only nesta fatia (sem write em `fin010`), `DETAIL_INDISPONIVEL` é re-avaliável na próxima run, snapshot anterior expira — não há divergência local-vs-ERP a reconciliar.
  - (2) **`pago ?? false` é seguro?** Sim — invariante "no false-positive paid" preservado. Gate 3 (`adiantamento.pago === true`) reprova tanto `false` real quanto `undefined`-defaulted. Custo é em observabilidade (F-fault-tolerance-1), não em correctness.
  - (3) **`DETAIL_INDISPONIVEL` vs `pago=false` confundem downstream?** Não. São motivos distintos na taxonomia (`MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL` × `MOTIVO_BLOQUEIO.FALHA_GATE`), com warn estruturado separado. Distinção propaga corretamente até o consumidor.
- **Cross-QA flagged ao consolidator**:
  - Availability/Performance — `RetryExecutor` + timeout (item 6/10 do plano);
  - Testability — cobertura de cenários de reprocess (item E.13); 4 cenários cobertos no delta.
  - Security/Auditability — `BUSINESS_WARN` estruturado contribui mas o invariante audit-trail completo é cross-cutting (fora de escopo deste delta).
