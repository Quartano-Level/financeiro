---
qa: Availability
qa_slug: availability
run_id: 2026-06-18-2346
agent: qa-availability
generated_at: 2026-06-19T00:00:00Z
scope: backend
score: 8.5
findings_count: 3
cards_count: 2
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (`/com298/{docCod}`) | Blip transiente (5xx/timeout) OU resposta 400 com quirk `responseData` durante a hidratação do detalhe de uma PROFORMA candidata a permuta | `ConexosClient.getDetalheTitulos` (ler `mnyTitPermutar` + `mnyTitAberto` + `mnyTitPermuta`) acionado por `EleicaoPermutasService.buildCandidata` na rotina de eleição | Eleição diária read-only (sem write-back nesta fatia); uma falha de detalhe NÃO deve abortar a run da filial nem reprovar a PROFORMA por mérito | `RetryExecutor` esgota → `ConexosError` tipado → caller marca `MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL` (estado distinto de `falha-gate`, re-avaliável na próxima run); 400+`responseData` é tratado como sucesso (não retry); o novo `valorPermutado` segue *optional* e o caller não infere `JA_PERMUTADO` sem prova | 0% de candidatas elegíveis enterradas como `falha-gate` por blip; 1 PROFORMA pago E sem saldo classificada `JA_PERMUTADO` ⟺ `valorPermutado>0` foi efetivamente lido; nenhuma propagação cross-filial (P0-4 abort cooperativo já existente). |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Cobertura do detail fetch pelo `RetryExecutor` | 1/1 (`getDetalheTitulos` envolto em `this.retryExecutor.execute`) | 1/1 | ✅ | `ConexosClient.ts:890` |
| Tratamento explícito da falha exaurida → tipo dedicado (sem `return {}` silencioso) | `throw new ConexosError(...)` | typed-throw | ✅ | `ConexosClient.ts:929` |
| Default conservador para `valorPermutado` ausente/non-numeric | `undefined` → caller cai em `SEM_SALDO_PERMUTAR` (não em `JA_PERMUTADO`) | nunca inferir conclusão | ✅ | `ConexosClient.ts:945-952`, `ElegibilidadeService.ts:151-155` |
| Default conservador para `pago` ausente | `pago = false` (caller força no hydrate) → Gate 3 reprova | nunca inferir pago | ✅ | `EleicaoPermutasService.ts:499` |
| Prioridade `NAO_PAGO` > `JA_PERMUTADO` quando ambos os gates falham | Implementada (causa-raiz primeiro) | causa-raiz primeiro | ✅ | `ElegibilidadeService.ts:150-155` |
| Cobertura de teste do caminho `DETAIL_INDISPONIVEL` no caller | Coberto por `EleicaoPermutasService.test.ts` (referenciado em baseline; 91 passed) | ≥1 caso | ✅ | `_shared-metrics.md` linha 28 |
| Cobertura de teste do novo `valorPermutado` (doc 8266: pago + 100% permutado) | 3 casos: ausente, =0, >0 + prioridade `NAO_PAGO` | ≥3 casos | ✅ | `ElegibilidadeService.test.ts:80-129`, `ConexosClient.test.ts:1280-1312` |
| Quirk 400+`responseData` tratado sem retry (não escala blip) | Sucesso sem retry; usa `mapDetalheTitulos` direto | tratamento explícito | ✅ | `ConexosClient.ts:897-919` |
| Abort cooperativo cross-filial em uma falha | `signal.aborted` checado antes do detail fetch | check explícito | ✅ | `EleicaoPermutasService.ts:447-449` |
| Alarme CloudWatch de taxa de `DETAIL_INDISPONIVEL` / `JA_PERMUTADO` por filial | Não existe (no-op no estado-atual Render/Express) | Dashboard com taxa por motivo | ⚠️ | n/a — vide nota abaixo |

> ⚠️ **Não medível localmente**: taxa real de `DETAIL_INDISPONIVEL` em produção. Requer CloudWatch (alvo) ou — no estado-atual Render — agregação por `LogService.warn({ motivo })` em log destination. Recomendação: instrumentar contador por `motivoBloqueio` no snapshot da eleição (`flowId`, `filCod`) para detectar derivas de `DETAIL_INDISPONIVEL > X%` (sintoma de instabilidade Conexos) e derivas de `JA_PERMUTADO` (sintoma de drift na carga real do detalhe).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | N/A | N/A | sem health-check síncrono no escopo da feature |
| Heartbeat | N/A | N/A | nada do escopo emite heartbeat |
| Monitor | `LogService.warn({ type: BUSINESS_WARN, motivo: DETAIL_INDISPONIVEL })` por candidata bloqueada | ⚠️ parcial | `EleicaoPermutasService.ts:469-479` (log existe; alarme/dashboard sobre o sinal não — ver F-availability-3) |
| Timestamp | `flowId` propagado + state-machine `descoberta→bloqueada` | ✅ presente | `EstadoElegibilidade.ts:8-19` |
| Sanity Checking | `parseOptionalNumber` em `mnyTitPermutar`/`mnyTitAberto`/`mnyTitPermuta`; `pago` só é `true` quando `mnyTitAberto===0`; `valorPermutado` ausente NÃO infere `JA_PERMUTADO` | ✅ presente | `ConexosClient.ts:941-952`, `ElegibilidadeService.ts:151-155` |
| Condition Monitoring | `gatesAvaliados[]` registra cada gate com `passed`+`detail` para auditoria post-mortem | ✅ presente | `ElegibilidadeService.ts:58-72` |
| Voting | N/A | N/A | sem replicação ativa nesta feature |
| Exception Detection | `try/catch` separa quirk 400+`responseData` (legítimo) de outros erros (propaga p/ retry) e da exaustão (typed `ConexosError`) | ✅ presente | `ConexosClient.ts:892-929` |
| Self-Test | N/A | N/A | feature read-only sem self-test runtime |
| Active Redundancy | N/A | N/A | sem fonte alternativa para o detalhe Conexos |
| Passive Redundancy | N/A | N/A | idem |
| Spare | N/A | N/A | idem |
| Exception Handling | `ConexosError` tipado no caller (`EleicaoPermutasService.ts:467-483`) com fallback NÃO-silencioso → `buildDetailIndisponivelCandidata` | ✅ presente | `EleicaoPermutasService.ts:419-436, 467-483` |
| Rollback | N/A | N/A | fatia read-only (sem write-back) |
| Software Upgrade | N/A | N/A | fora do escopo da feature |
| Retry | `getDetalheTitulos` envolto em `RetryExecutor` (`this.retryExecutor.execute`) | ✅ presente | `ConexosClient.ts:890` |
| Ignore Faulty Behavior | Quirk 400+`responseData`: detecta e usa o payload, sem reciclar erro nem retry | ✅ presente | `ConexosClient.ts:897-919` |
| Degradation | Falha de detalhe NÃO aborta a run da filial nem reprova a PROFORMA como `falha-gate` — vira candidata `BLOQUEADA(DETAIL_INDISPONIVEL)`, re-avaliável | ✅ presente | `EleicaoPermutasService.ts:419-436, 467-483` + `EstadoElegibilidade.ts:51-58` |
| Reconfiguration | N/A | N/A | sem reroute dinâmico |
| Shadow | N/A | N/A | sem leitura paralela |
| State Resynchronization | Re-avaliação implícita na próxima run da eleição (estado `DETAIL_INDISPONIVEL` é transiente) | ✅ presente | `EstadoElegibilidade.ts:55-58` (comentário "Re-avaliável na próxima run") |
| Escalating Restart | N/A | N/A | fora do escopo |
| Non-Stop Forwarding | N/A | N/A | fora do escopo |
| Removal from Service | N/A | N/A | sem hot-swap por filial |
| Transactions | N/A | N/A | fatia read-only |
| Predictive Model | ⚠️ ausente — taxa de `DETAIL_INDISPONIVEL` por filial poderia antecipar incidentes Conexos | ⚠️ parcial | ver F-availability-3 |
| Exception Prevention | `parseOptionalNumber` evita NaN/string crua quebrar gate; defaults conservadores (`pago=false`, `valorPermutado=undefined`) evitam classificar `JA_PERMUTADO` sem prova | ✅ presente | `ConexosClient.ts:941-952`, `EleicaoPermutasService.ts:499` |
| Increase Competence Set | Quirk 400+`responseData` documentado e tratado (Conexos legitimamente embute payload em status de erro) | ✅ presente | `ConexosClient.ts:898-920` (ADR/Addendum #8 citado inline) |

## 4. Findings (achados)

### F-availability-1: `valorPermutado` ausente cai silenciosamente em `SEM_SALDO_PERMUTAR` (sem trilha de "não-medível")

- **Severidade**: P2
- **Tactic violada**: Monitor / Condition Monitoring (parcial)
- **Localização**: `src/backend/domain/service/permutas/ElegibilidadeService.ts:151-155`
- **Evidência (objetiva)**:
  ```ts
  if (falhou(GATE.VALOR_PERMUTAR)) {
      return (adiantamento.valorPermutado ?? 0) > 0
          ? MOTIVO_BLOQUEIO.JA_PERMUTADO
          : MOTIVO_BLOQUEIO.SEM_SALDO_PERMUTAR;
  }
  ```
  Quando `valorPermutado` é `undefined` (mnyTitPermuta ausente do payload de detalhe), o ramo cai em `SEM_SALDO_PERMUTAR` indistinguível de um `mnyTitPermuta=0` legítimo. Não há log/contador que sinalize "não foi possível avaliar — campo ausente".
- **Impacto técnico**: se o Conexos passar a omitir `mnyTitPermuta` em uma classe de docs (mudança silenciosa de wire), o sistema *exibirá* `SEM_SALDO_PERMUTAR` em massa sem disparar nada. O operador continua confiando no rótulo. Métrica de fidelidade some.
- **Impacto de negócio**: rótulo incorreto na UI (operador acredita que a PROFORMA "nunca teve saldo" quando na verdade pode ter sido permutada). Baixo risco operacional na Fatia 1 (read-only, sem write-back), mas degrada a confiabilidade do dashboard.
- **Métrica de baseline**: 0 logs/contadores hoje distinguem `valorPermutado=undefined` de `valorPermutado=0`. Cobertura de teste prova as duas pernas (`ElegibilidadeService.test.ts:80, 94, 104`), mas o teste do "ausente" passa porque o produto é o mesmo — não porque foi *observado* como ausente.

### F-availability-2: Sem alarme/contador sobre taxa de `DETAIL_INDISPONIVEL` por filial

- **Severidade**: P2
- **Tactic violada**: Monitor / Predictive Model
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:469-479` (log existe; consumidor de alarme não)
- **Evidência (objetiva)**:
  ```ts
  await this.logService.warn({
      type: LOG_TYPE.BUSINESS_WARN,
      message: 'permuta eleicao detalhe da PROFORMA indisponivel — candidata bloqueada',
      data: { flowId, filCod, docCod: adiantamento.docCod, motivo: MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL },
  });
  ```
  O sinal é registrado por candidata, mas não agregado por run/filial em uma métrica observável. Se Conexos degradar (cenário de SLA) o impacto só será visto via amostragem manual de logs.
- **Impacto técnico**: degradação parcial do Conexos pode esvaziar uma eleição inteira sem alarme (toda PROFORMA vira `DETAIL_INDISPONIVEL`). O `RetryExecutor` mascara blips curtos; uma degradação prolongada permanece invisível.
- **Impacto de negócio**: D0 de operação financeira passa sem candidatas elegíveis e o time só descobre pela reclamação do analista.
- **Métrica de baseline**: 0 alarmes / 0 dashboards no escopo da feature observam essa taxa. Estado-atual (Render) também não tem dashboard equivalente — gap herdado, não introduzido pela feature.

### F-availability-3: Caminho `DETAIL_INDISPONIVEL` testado em unit, não em integration (per pacote em --quick)

- **Severidade**: P3
- **Tactic violada**: Self-Test (parcial)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:467-483` + suite associada
- **Evidência (objetiva)**: o caminho do `catch (error instanceof ConexosError)` está coberto em unit (mock), mas o cenário composto "retry esgotado → `ConexosError` → candidata `DETAIL_INDISPONIVEL` → snapshot persistido com motivo correto" não foi inspecionado em --quick (sem run de coverage). 311/312 unit passam; o caminho continua exclusivo a um cenário de exceção.
- **Impacto técnico**: regressão futura no `RetryExecutor` ou na detecção de `ConexosError` pode rebaixar `DETAIL_INDISPONIVEL` a `falha-gate` sem ser pega.
- **Impacto de negócio**: baixo nesta fatia (read-only). Vira P1 quando a Fatia 2 (write-back de permuta em `fin010`) entrar — aí mascarar `DETAIL_INDISPONIVEL` como `falha-gate` pode bloquear permanentemente uma candidata reprocessável.
- **Métrica de baseline**: cobertura % não medida em `--quick` (declarado em `_shared-metrics.md`). 1 teste de mock cobre o ramo; 0 testes de cenário integrado.

## 5. Cards Kanban

### [availability-1] Diferenciar `valorPermutado` ausente de `valorPermutado=0` no rótulo e no log

- **Problema**
  > Quando `mnyTitPermuta` está ausente no payload do detalhe, `valorPermutado` chega `undefined` e o `ElegibilidadeService` classifica a candidata como `SEM_SALDO_PERMUTAR`, indistinguível de um caso em que o campo veio explicitamente `0`. Não há sinal observável dessa indistinguibilidade — se o Conexos parar de retornar o campo, o produto vira silenciosamente "sem saldo" para o operador.

- **Melhoria Proposta**
  > Aplicar a tactic **Condition Monitoring**: no `EleicaoPermutasService.buildCandidata` (após `getDetalheTitulos`), emitir `LogService.info` com flag `valorPermutadoAusente: detalhe.valorPermutado === undefined` quando o Gate 2 reprovar; opcionalmente expor um sub-motivo informativo (`SEM_SALDO_PERMUTAR` + `subdetalhe: 'campo ausente'` no `gatesAvaliados[].detail`) sem criar novo motivo na taxonomia. Não muda a UX — só amplia a observabilidade.

- **Resultado Esperado**
  > Operador continua vendo "Sem saldo a permutar" na UI, mas o time consegue medir `% candidatas bloqueadas com mnyTitPermuta ausente` por run.
  > Métrica: presença de log com `valorPermutadoAusente` flag: 0% → 100% das candidatas Gate 2-reprovadas instrumentadas.

- **Tactic alvo**: Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-1
- **Métricas de sucesso**:
  - logs com flag `valorPermutadoAusente`: 0 → 1 por candidata Gate-2-reprovada
  - sinal observável para drift de wire Conexos: ausente → presente
- **Risco de não fazer**: mudança silenciosa no payload do Conexos vira regressão de rótulo invisível na UI por semanas.
- **Dependências**: nenhuma

### [availability-2] Agregar contagem de `DETAIL_INDISPONIVEL` e `JA_PERMUTADO` por run/filial

- **Problema**
  > Hoje cada candidata `DETAIL_INDISPONIVEL` emite um `BUSINESS_WARN`, mas o sinal não é agregado nem comparado entre runs. Degradação parcial do Conexos pode esvaziar a eleição de uma filial sem disparar nenhum sinal acionável; e drift de `JA_PERMUTADO` (que indica saúde do detalhe real) não é monitorado.

- **Melhoria Proposta**
  > Aplicar a tactic **Monitor** + degrau para **Predictive Model**: no fim do `EleicaoPermutasService.elegerCandidatas` (por filial), emitir um log de resumo `{ flowId, filCod, totalAvaliadas, porMotivo: { DETAIL_INDISPONIVEL, JA_PERMUTADO, SEM_SALDO_PERMUTAR, ... } }`. Estado-atual (Render): consumível pela ferramenta de log do destino. Estado-alvo: vira métrica CloudWatch + alarme `DETAIL_INDISPONIVEL > 30% por 2 runs consecutivas`.

- **Resultado Esperado**
  > Detecção de degradação Conexos < 1 run após o incidente. Drift de `JA_PERMUTADO` (queda abrupta = Conexos parou de popular o campo) visível em série temporal.
  > Métrica: dashboards de motivo por run: 0 → 1; alarme acionável: 0 → 1.

- **Tactic alvo**: Monitor (+ Predictive Model)
- **Severidade**: P2
- **Esforço estimado**: S (resumo no log) / M (alarme + dashboard no alvo CloudWatch)
- **Findings relacionados**: F-availability-2, F-availability-1
- **Métricas de sucesso**:
  - log de resumo por (`flowId`, `filCod`): 0 → 1 por run
  - alarme sobre taxa de `DETAIL_INDISPONIVEL`: 0 → 1 (post-migração para CloudWatch)
- **Risco de não fazer**: incidente Conexos passa um dia inteiro de operação sem ser detectado; recuperação só na próxima run, mas time descobre via reclamação.
- **Dependências**: ObservabilityAdvisor (cross-QA) para fechar o loop com dashboard.

> Nota: F-availability-3 (cobertura de cenário integrado de `DETAIL_INDISPONIVEL`) **não vira card** — fica como follow-up no inbox por ser P3 e estar fora do critério acionável imediato; sobe para P1 quando Fatia 2 (write-back) entrar.

## 6. Notas do agente

- Escopo restrito aos arquivos da feature "já permutado" — não revisei tactics fora do caminho `getDetalheTitulos → buildCandidata → avaliarElegibilidade`.
- Métrica de MTTR/CloudWatch declarada como não-medível localmente; alinhada com `_shared-metrics.md` (estado-atual Render, sem CloudWatch).
- Cross-QA para `qa-fault-tolerance` (mesma cadeia já tem `RetryExecutor` + typed-throw → `DETAIL_INDISPONIVEL`; provavelmente convergem nas mesmas cards) e `qa-testability` (cobertura do ramo integrado `DETAIL_INDISPONIVEL`).
- Severidade máxima desta feature: P2. Não há P0/P1 — o desenho de degradação (`DETAIL_INDISPONIVEL` + retry + defaults conservadores) é o destaque positivo; os gaps são de observabilidade do sinal, não da recuperação em si.
