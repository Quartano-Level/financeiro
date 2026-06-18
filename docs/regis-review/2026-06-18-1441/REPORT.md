---
type: regis-review-report
run_id: 2026-06-18-1441
generated_at: 2026-06-18T17:05:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (scoped to Integrability, Fault Tolerance, Modifiability, Testability — feature-tweak gate, --quick mode)
mode: --quick (scoped)
scope: feature-tweak gate — Permutas Frente I, Fatia 1 (gate-3-pago-via-detail)
delta: ConexosClient.getMnyTitPermutar → getDetalheTitulos reshape + EleicaoPermutasService Gate 3 hydration from com298 detail
total_cards: 7
total_p0: 0
total_p1: 6
total_p2: 0
total_p3: 1
overall_score_scoped: 8.4
gate_result: PASS — 0 P0 introduced by the delta; no re-loop required
followups_route: ontology/_inbox/permutas-painel-elegiveis-regis-followups.md
---

# Regis-Review — financeiro — 2026-06-18-1441 (scoped, --quick)

## 0. Escopo e modo desta revisão (leitura obrigatória)

Esta NÃO é uma `/regis-review` completa de 8 QAs. É um **gate scoped de `--quick`** sobre o delta de
`/feature-tweak permutas "gate-3-pago-via-detail"` (Frente I — Permutas, Fatia 1).

### O que foi revisado (4 QAs)

| QA Bass | Por que está em escopo |
|---|---|
| **Integrability** | O delta muda a superfície do boundary `ConexosClient` (rename + reshape de retorno) e adiciona um mapper privado (`mapDetalheTitulos`). É exatamente onde a tactic Encapsulate / Tailor Interface vive. |
| **Fault Tolerance** | O Gate 3 (TOTALMENTE PAGO) depende de um GET adicional ao Conexos por candidata. Qualquer blip no `com298/{docCod}` precisa convergir conservadoramente (NUNCA inferir `pago=true` sem prova). Tactic Sanity Checking + Comparison + Recovery-Forward. |
| **Modifiability** | Rename + reshape de retorno toca cohesion (split module / increase semantic coherence) e ripple (restrict dependencies). |
| **Testability** | Há código de teste novo (4 cenários no client + 3+1 no service); o gate avalia se o oráculo defende a invariante. |

### O que NÃO foi revisado (e por quê)

| QA Bass | Justificativa do skip |
|---|---|
| **Availability** | O delta é read-only no Conexos; não introduz scheduler/heartbeat/replica. A política de retry/timeout já existente foi herdada sem alteração. |
| **Deployability** | Sem mudança em `infra/`, sem nova variável de ambiente, sem mudança de pipeline de release. O target Lambda/Terraform ainda não existe no runtime atual (Express/Render). |
| **Performance** | O delta **reduz** chamadas externas por design (uma chamada hidrata 2 gates em vez de 2 chamadas distintas). Não introduz N+1; o fan-out por PROFORMA é o mesmo de antes. Latência real de prod é "não medível localmente" e ficou registrada em `_shared-metrics.md`. |
| **Security** | Delta read-only, sem SQL (não toca repository), sem novo input de boundary HTTP (handlers Express não foram tocados), sem nova credencial/SSM, sem mudança em auth. O findings F-integrability-1 (validar payload Zod) toca cross-QA Security/Validate Input — está marcado e roteado pelo mesmo card. |

Política do gate `--quick`: revisa apenas os QAs cuja superfície foi efetivamente mexida pelo delta.
Débitos arquiteturais pré-existentes nesses 4 QAs (e nos 4 QAs out-of-scope) ficam para a próxima
`/regis-review` full quando a infra alvo materializar — não são responsabilidade deste gate.

### Veredito do gate

**PASS — 0 P0 introduzidos pelo delta. Nenhum re-loop necessário.**

P1/P2/P3 são roteados para
`ontology/_inbox/permutas-painel-elegiveis-regis-followups.md` (não bloqueiam merge), conforme política
do pipeline (Inviolable Rule #11): só P0 reentra no AutoLoopRunner; demais severidades viram backlog
versionado.

## 1. Executive scorecard

> **Pesos aplicados** (escopo `--quick`, 4 QAs): Fault Tolerance 1.3, Modifiability 1.2, Testability 1.0, Integrability 0.9. Soma = 4.4. Os 4 QAs out-of-scope (Availability, Deployability, Performance, Security) não entram no cálculo.

| QA | Score (0–10) | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Integrability | 8.0 | 0 | 2 | 0 | 0 | F-integrability-1: payload `com298/{docCod}` consumido como `Record<string, unknown>` cru — schema drift do Conexos vira reprovação silenciosa em massa do Gate 3 |
| Fault Tolerance | 8.5 | 0 | 2 | 0 | 0 | F-fault-tolerance-1: `pago ?? false` colapsa "Conexos disse NÃO pago" e "Conexos respondeu mas `mnyTitAberto` ausente" em um único bucket — invariante mantido, observabilidade degradada |
| Modifiability | 8.0 | 0 | 0 | 0 | 1 | F-modifiability-1: comentário stale com nome antigo `getMnyTitPermutar` em `EleicaoPermutasService.test.ts:441` |
| Testability | 9.0 | 0 | 2 | 0 | 0 | F-testability-1: override silencioso list→detail não emite/asserta sinal de divergência — bug-shape do incidente original não tem alarme |
| Availability | out-of-scope | — | — | — | — | revisão full requer scheduler/EventBridge cabeado |
| Deployability | out-of-scope | — | — | — | — | sem `infra/`, sem Terraform tocado pelo delta |
| Performance | out-of-scope | — | — | — | — | sem N+1 introduzido; latência real só medível em prod |
| Security | out-of-scope | — | — | — | — | sem SQL, sem credencial, sem input boundary HTTP novo |
| **Overall (scoped, 4 QAs)** | **8.4** | **0** | **6** | **0** | **1** | — |

Score interpretation:
- 0–3: estrutural risk — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais
- **8.4: saudável com follow-ups pontuais — gate APROVADO** (consistente com 0 P0)
- 9–10: estado-da-arte para o estágio atual

## 2. Top 5 risks (cross-QA, escopados ao delta)

> Ranqueamento por composite score = severidade × business impact × leverage. Como não há P0,
> a ordenação respeita: (a) blast-radius da invariante (Gate 3 → eleição financeira),
> (b) opacidade do modo de falha (silencioso vs alarmável), (c) leverage de fixar agora vs depois.

### R-1: Schema drift do Conexos vira reprovação silenciosa em massa do Gate 3
- **QA(s) afetados**: Integrability, Fault Tolerance, Security (cross-QA Validate Input)
- **Findings de origem**: F-integrability-1 (`ConexosClient.ts:844-912`), F-fault-tolerance-1 (`EleicaoPermutasService.ts:449`)
- **Evidência sintetizada**: payload Conexos é consumido como `Record<string, unknown>` cru. `parseOptionalNumber` colapsa "campo ausente" e "campo presente com tipo inesperado" em `undefined` → `pago: detalhe.pago ?? false` → Gate 3 reprova. Probe real 2026-06-18 confirmou o shape **hoje**; nenhum mecanismo automático detecta quando mudar.
- **Impacto técnico**: primeira mudança de schema no Conexos (renome de `mnyTitAberto`, troca para string localizada `"0,00"`, etc.) zera elegibilidades **sem logar drift**. Indistinguível, no audit log, de "nenhuma proforma paga neste mês".
- **Impacto de negócio**: snapshot mensal pode passar a marcar 0 candidatas elegíveis sem qualquer alerta. Analista descobre por ausência, dias depois. Janela de fechamento mensal da Columbia comprime essa detecção tardia.
- **Card(s) Kanban relacionados**: integrability-1 (Zod no boundary), fault-tolerance-1 (preservar distinção `pago=false` × `pago=undefined`)
- **Custo de inação em 6 meses**: 1 incidente esperado de "snapshot zerado" sob qualquer evolução do Conexos (premissa: Conexos teve histórico de mudar shape de campos legacy `mny*` no último ano — mesmo padrão que motivou este feature-tweak). Custo direto = re-execução manual de elegibilidade + reconciliação cruzada com `fin010`.

### R-2: Regime degradado prolongado do Conexos detectável apenas por inspeção manual de log
- **QA(s) afetados**: Fault Tolerance, Availability (cross-QA — condition monitoring aggregate)
- **Findings de origem**: F-fault-tolerance-2 (`EleicaoPermutasService.ts:422-435`)
- **Evidência sintetizada**: log per-candidata é emitido (`BUSINESS_WARN` com `motivo=DETAIL_INDISPONIVEL`), mas não há sumário "X de Y candidatas bloqueadas por DETAIL_INDISPONIVEL nesta run" no fim do flow. Detecção depende de query manual no log estruturado.
- **Impacto técnico**: se o Conexos ficar degradado por horas, o sinal está nos logs, mas o operador só percebe somando warnings manualmente. Tactic Recovery-Forward depende de que a próxima run aconteça e seja saudável — sem agregação, o time não percebe o regime degradado.
- **Impacto de negócio**: candidatas presas em `DETAIL_INDISPONIVEL` ao longo de várias runs constituem exatamente "work item stuck mid-flow". Janela de fechamento mensal pode mascarar 1+ dia de elegibilidade pendente.
- **Card(s) Kanban relacionados**: fault-tolerance-2 (contador agregado por run)
- **Custo de inação em 6 meses**: 1–2 ciclos esperados de Conexos degradado por janelas > 24h (premissa: histórico de instabilidade do ERP terceiro, sem SLA contratual conhecido). Custo = atraso de detecção × volume de candidatas presas.

### R-3: Override list→detail é silencioso — o bug-shape do incidente original perpetua-se sem alarme
- **QA(s) afetados**: Testability, Fault Tolerance (cross-QA — internal monitoring)
- **Findings de origem**: F-testability-1 (`EleicaoPermutasService.test.ts:250-284`)
- **Evidência sintetizada**: o bug que motivou a feature em prod era invisível porque ninguém olhava o log: lista mentia, sistema acreditava, ninguém sabia. O fix corrige a verdade, mas **não cria observabilidade sobre o quão frequentemente a lista mente**. Nenhum dos 3 novos testes do `describe` de Gate 3 afirma sinal de divergência.
- **Impacto técnico**: se o Conexos consertar `com298/list` no futuro (devolver `mnyTitAberto` correto), a chamada extra ao detail (uma per candidata) continua paga sem evidência para defender remoção. Se Conexos quebrar a semântica de novo, time descobre via auditoria financeira do `fin010`, não via alerta.
- **Impacto de negócio**: time fica cego para (a) decidir quando remover a hidratação extra (custo de latência permanente) e (b) detectar regressão se Conexos mudar a semântica de novo (financeiro errado chega ao ERP).
- **Card(s) Kanban relacionados**: testability-1 (assertion de divergência), fault-tolerance-1 (sub-flag de origem de `pago`)
- **Custo de inação em 6 meses**: opacidade permanente sobre `pago_list_vs_detail_divergence_rate`. Custo = decisão de roadmap (manter ou remover fan-out) tomada sem dado, e MTTR de regressão futura = janela inteira de elegibilidade.

### R-4: `valorPermutar` hidratado do detail não está pinado pelo teste — núcleo monetário desprotegido
- **QA(s) afetados**: Testability, Modifiability (cross-QA — executable assertions)
- **Findings de origem**: F-testability-2 (`EleicaoPermutasService.test.ts:262-264, 298-300, 333-335`)
- **Evidência sintetizada**: `buildCandidata` foi alterado para hidratar **dois** campos do detail (`pago` e `valorPermutar`). Os 3 novos testes asseguram só `pago`. `valorPermutar` é o número que entra no `fin010` — núcleo monetário da Frente I.
- **Impacto técnico**: futura refatoração que coalesça `valorPermutar` da lista por engano não falhará nenhum dos novos testes. Regression test pinou só uma das duas variáveis hidratadas.
- **Impacto de negócio**: o delta nasceu para corrigir Gate 3 que pisava em dado errado; o mesmo padrão (lista mente, detalhe é a verdade) aplica-se a `valorPermutar`. Se o teste não defende a fonte de verdade, próximo PR pode regredir sem CI vermelho — erro chega ao fechamento `fin010` no ERP.
- **Card(s) Kanban relacionados**: testability-2 (pinar `valorPermutar`)
- **Custo de inação em 6 meses**: 1 regressão silenciosa esperada por entropia normal de manutenção (premissa: `buildCandidata` será tocado em Fatia 2 — execução — e em features futuras que mudam o shape de `Adiantamento`). Custo = reconciliação manual `painel ↔ fin010` quando um valor diverge.

### R-5: Fixtures inline em vez de payload real gravado para o detail endpoint
- **QA(s) afetados**: Integrability, Testability (cross-QA — contract testing, recordable test cases)
- **Findings de origem**: F-integrability-2 (`ConexosClient.test.ts:1185-1270`)
- **Evidência sintetizada**: 5 cenários do `getDetalheTitulos` usam objetos literais inline. A sonda real de 2026-06-18 (`filCod=2`, docs `26471` e `24166`) foi descartada (throwaway probe, não comitada). Conhecimento do shape real sobrevive na memória institucional + comentários, não em código versionado. **Atenuante parcial**: os **números** dos cenários espelham o wire-probe real (Testability §3 marca como Recordable Test Cases) — o gap é a forma JSON pura, não os números.
- **Impacto técnico**: se um campo novo aparecer (ex.: `mnyTitAbertoStatus` substitui `mnyTitAberto`), os 5 testes continuam verdes porque o mock controla o input — o mapper nunca é confrontado com a forma real do payload.
- **Impacto de negócio**: primeira regressão por schema drift vira incidente em produção, não em CI. Tempo de detecção depende de monitoria de business outcome, não de unit test.
- **Card(s) Kanban relacionados**: integrability-2 (gravar fixtures JSON reais)
- **Custo de inação em 6 meses**: complementar ao R-1. Custo = mesmo cenário de schema drift, só que detectado por humano em vez de CI.

## 3. Cross-cutting findings

Pontos onde a mesma causa-raiz aparece em múltiplos QAs.

### CC-1: Boundary do Conexos é tratado como contrato confiável quando deveria ser tratado como wire-format hostil
- **Aparece em**: Integrability (F-integrability-1, F-integrability-2), Fault Tolerance (F-fault-tolerance-1), Testability (atenuantes parciais via Recordable Test Cases)
- **Findings**: F-integrability-1 (Zod ausente), F-integrability-2 (fixtures inline), F-fault-tolerance-1 (`?? false` mascara `undefined`)
- **Diagnóstico unificado**: o delta encapsulou bem os wire-fields (zero leakage fora do client — Encapsulate OK), mas a **validação de forma** do payload externo nunca foi formalizada. `parseOptionalNumber` é defensivo o suficiente para não quebrar, mas perde informação no caminho — `undefined` por campo ausente é indistinguível de `undefined` por tipo inesperado, e isso propaga até o estado da candidata. O bug-shape do incidente original (lista mente, sistema acredita) é exatamente esta classe de problema: confiar no formato do upstream sem instrumentação.
- **Recomendação consolidada**: cards integrability-1 (Zod no boundary com `INTEGRATION_WARN` em drift) + fault-tolerance-1 (preservar distinção `pago=false` × `pago=undefined` no estado) resolvem **simultaneamente** integrability + fault tolerance + testability. Investir aqui é o ponto de maior alavancagem do delta.

### CC-2: Observabilidade da invariante é ausente — invariante está correto, mas inauditável
- **Aparece em**: Fault Tolerance (F-fault-tolerance-1, F-fault-tolerance-2), Testability (F-testability-1)
- **Findings**: F-fault-tolerance-1 (sub-flag origem `pago`), F-fault-tolerance-2 (contador agregado por run), F-testability-1 (assertion de divergência)
- **Diagnóstico unificado**: o delta acerta a invariante (`pago=true` requer prova explícita — zero false-positive paid). Onde ele falha é em **provar a si mesmo em produção** que a invariante segue funcionando: não há contador de divergência list↔detail, não há sumário per-run de `DETAIL_INDISPONIVEL`, não há sub-flag de origem de `pago`. O time tem que confiar no log per-candidata, somando warnings na cabeça.
- **Recomendação consolidada**: cards fault-tolerance-2 (sumário per-run) + testability-1 (assertion de divergência) resolvem para os 3 findings. fault-tolerance-1 (sub-flag) é o complemento natural — todos os três funcionam como um único feixe de condition monitoring sobre o boundary Conexos.

### CC-3: Recordable Test Cases aplicada parcialmente — números reais sim, fixture JSON não
- **Aparece em**: Integrability (F-integrability-2), Testability (atenuante parcial reconhecida)
- **Findings**: F-integrability-2 (fixtures inline)
- **Diagnóstico unificado**: a tactic "Recordable Test Cases" está parcialmente aplicada — os números reais do wire-probe 2026-06-18 estão nos testes com comentários ancorando à origem (`ConexosClient.test.ts:1188-1217`, `// Wire real 2026-06-18, filCod=2`). Isso é melhor que fixtures fabricadas. O gap específico é não ter o **JSON cru** versionado como `__fixtures__/conexos/com298_detail_*.json` — sem ele, qualquer campo novo no payload (que o mapper hoje ignora) é invisível para o teste.
- **Recomendação consolidada**: card integrability-2 (gravar JSON real) — completa a tactic. Cross-QA cura também o gap apontado em `2026-06-17-2340/testability.md` para outros endpoints do mesmo client.

## 4. Quick wins (≤5 dias úteis, esforço S, severidade ≥ P2)

> Critério: esforço S **e** severidade ≥ P2 **e** alta razão impacto/esforço. P3 (modifiability-1)
> ficou de fora — é cosmético e o agente já marcou explicitamente que está fora do filtro.

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| [testability-2] Pinar `valorPermutar` do detail nos 3 testes de Gate 3 | Testability | S (≤1d, mecânico) | P1 | 0/3 → 3/3 testes asseguram que `valorPermutar` final vem do detail; defende o núcleo monetário contra regressão silenciosa |
| [testability-1] Adicionar assertion de divergência list↔detail | Testability | S (≤1d) | P1 | Sinal estruturado de divergência (`divergencia: 'pago_list_vs_detail'`) presente em testes e em log de produção |
| [fault-tolerance-2] Contador agregado de `DETAIL_INDISPONIVEL` por run | Fault Tolerance | S (≤1d) | P1 | Latência de detecção de Conexos degradado: manual / N horas → 1 run |
| [fault-tolerance-1] Sub-flag de origem de `pago` (`mnyTitAberto-zero` vs `defaulted-false`) | Fault Tolerance | S (≤1d) | P1 | 0% → 100% candidatas BLOQUEADA(FALHA_GATE) com origem de `pago` explícita em `gatesAvaliados[].detail` |
| [integrability-1] Validar payload `com298/{docCod}` com Zod (`.passthrough()`) | Integrability | S (≤1d) | P1 | 0% → 100% validação Zod no boundary; `INTEGRATION_WARN` por drift instrumentado |
| [integrability-2] Gravar fixtures JSON reais (`com298_detail_{pago,nao_pago}.json`) | Integrability | S (≤1d, requer Conexos dev) | P1 | 0 → 2 fixtures versionadas; 5/5 testes do mapper ancorados em JSON real |

**Defesa em reunião**: os 6 P1 são todos S. Cabe em **uma sprint pós-merge** se priorizados. O retorno é
desproporcional ao custo — invariante crítico do negócio (eleição de permutas que movimenta `fin010`)
deixa de depender de memória institucional do dev e passa a ser auditável por log.

## 5. Strategic moves (M / L / XL)

> **Nenhum card M/L/XL emergiu deste gate.** Isso é uma assinatura saudável do delta: a feature foi
> entregue com superfície bem encapsulada (Encapsulate OK, Use Intermediary OK, Restrict Communication
> Paths OK) e os follow-ups são todos pontuais (S). Movimentos estratégicos pré-existentes
> (Split Module de `ConexosClient.ts` 1361 LOC, Split Module de `EleicaoPermutasService.ts` 527 LOC,
> infra Lambda + Terraform, audit-trail invariant cross-cutting) **continuam relevantes mas estão
> fora do escopo deste gate** — virão na próxima `/regis-review` full quando a infra alvo materializar.

## 6. O que está bem (e por quê)

Reuniões defensivas frequentemente caem na armadilha de "tudo está ruim". Os pontos onde este delta
**acerta** sustentam o veredito de PASS:

1. **Encapsulação do wire-format** (Integrability §3, Tactic Encapsulate): `grep` confirma 0 ocorrências de `mnyTitAberto` / `mnyTitPermutar` em código de produção fora de `ConexosClient.ts`. O domínio recebe `{ valorPermutar?, pago? }` opaco — não sabe quais campos do ERP existem por trás.
2. **Tailor Interface bem aplicada** (Integrability §3): renomear de `getMnyTitPermutar` (nome ligado a um **campo**) para `getDetalheTitulos` (nome ligado ao **recurso**) suporta a 2ª responsabilidade `pago` sem mentir, e abre espaço para futuras extensões sem novo rename.
3. **Single consumer in-repo** (Modifiability §2): `grep getDetalheTitulos src/backend/domain/service` → 1 hit (`EleicaoPermutasService.buildCandidata`). Fan-in = 1 justifica fazer o rename sem shim/alias deprecated. Decisão consciente, documentada no docstring (`"Consumers:"`).
4. **Cohesion preservada** (Modifiability §3): ambas as derivações (`valorPermutar` e `pago`) vêm do **mesmo** payload `com298/{docCod}`, com a **mesma** janela de consistência e a **mesma** RetryExecutor. Separar em dois métodos forçaria 2 round-trips por candidata (regressão de Performance) sem ganho de modifiabilidade.
5. **Invariante "no false-positive paid" preservado** (Fault Tolerance §2, §4 veredito): `pago ?? false` nunca infere `true` sem prova. Gate 3 (`adiantamento.pago === true`) reprova tanto `false` real quanto `undefined`-defaulted. O custo é em observabilidade (F-fault-tolerance-1), não em correctness.
6. **Increase Competence Set aplicada ao quirk HTTP-400** (Fault Tolerance §3): o quirk `400 VALIDATION` com `responseData` no Conexos é tratado como resposta legítima dentro do client (sem retry adicional), não como falha. Tactic Bass em estado puro.
7. **Re-avaliabilidade / Recovery-Forward** (Fault Tolerance §3, Tactic Reintroduction): `DETAIL_INDISPONIVEL` é re-avaliável na próxima run sem migração de estado. Sem write em `fin010` nesta fatia → não há compensação a fazer; `MOTIVO_BLOQUEIO` distingue degradação operacional de reprovação de mérito.
8. **Recordable Test Cases — números reais do wire** (Testability §3): fixtures com `mnyTitValor / mnyTitPago / mnyTitAberto / mnyTitPermutar` dos docs 26471 (NÃO pago) e 24166 (PAGO), com comentários ancorando à origem (`// Wire real 2026-06-18, filCod=2`). Tactic Bass aplicada parcialmente (números sim, JSON cru não — vide R-5).
9. **Determinismo dos testes**: 0 fontes não-determinísticas introduzidas pelo delta (sem `Date.now`, sem `Math.random`, sem `setTimeout` real). 118/118 testes verdes nos diretórios tocados, 266/266 na suíte completa.
10. **Distinção de motivos no estado da candidata** (Fault Tolerance §3, Tactic Repair State / Quarantine): `MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL` × `MOTIVO_BLOQUEIO.FALHA_GATE` separados na taxonomia. Operador downstream consegue distinguir blip de Conexos de reprovação de mérito.

## 7. Limitações da análise

Liste explicitamente o que este gate **NÃO** cobre, para evitar leitura otimista do resultado:

### Métricas declaradas como "não medíveis localmente" pelos agentes
- Forma real do payload `GET /com298/{docCod}` sob NULL/missing field de produção (Conexos prod): só a sonda real de 2026-06-18 (`filCod=2`, docs `26471` e `24166`) confirma — não foi gravada como fixture JSON (Integrability §2 / F-integrability-2).
- Latência real do `com298/{docCod}` em produção e taxa de fallback pelo branch `400 VALIDATION → responseData` (Modifiability §2): só CloudWatch após primeira tenancia.
- Taxa real de blips do Conexos em `com298/{docCod}` (frequência de retry-exhaustion) (Fault Tolerance §2): requer CloudWatch após primeira tenancia.
- Cobertura por arquivo/branch (`npm test -- --coverage`): explicitamente pulado no modo `--quick` (Testability §2). Recomenda-se rodar no merge.

### O que o gate `--quick` NÃO cobre (out-of-scope explícito)
- **Availability** — sem scheduler/heartbeat tocado pelo delta.
- **Deployability** — sem `infra/`, sem Terraform, sem mudança de pipeline de release.
- **Performance** — análise de capacidade real (latência p99, throughput de fan-out) só em prod.
- **Security** — sem SQL, sem credencial, sem input boundary HTTP novo. Validate Input está cross-marcado em integrability-1.

### O que **nenhuma** `/regis-review` cobre (limites do método)
- Chaos engineering / fault injection real contra Conexos.
- Threat modeling formal.
- Análise de custo cloud.
- UX / acessibilidade.

### Janela temporal
Este é um snapshot do dia **2026-06-18** sobre o delta de `gate-3-pago-via-detail`. Código é vivo;
para Frente I como um todo, refazer `/regis-review` full (8 QAs) quando: (a) Fatia 2 (execução de permuta no `fin010`) começar — entra Security/SQL/audit-trail; (b) infra Lambda/Terraform materializar — entram Availability/Deployability de verdade.

### Cards copiados verbatim
Os cards no `KANBAN.md` foram copiados **verbatim** das seções dos agentes, sem edição de conteúdo.
IDs preservados (`integrability-1`, `fault-tolerance-1`, etc.). Nenhum renomeio foi necessário.

## 8. Ações recomendadas

3 ações em ordem de execução para os 30 dias seguintes.

1. **Roteie os 6 P1 para `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md`** (não bloqueia merge desta fatia, política do gate `--quick`). Cards: integrability-1, integrability-2, fault-tolerance-1, fault-tolerance-2, testability-1, testability-2.
2. **Em sprint pós-merge**, atacar os 6 P1 em uma única passada — todos são S e dois (integrability-1 + fault-tolerance-1) resolvem CC-1 e CC-2 simultaneamente. Ordem sugerida: testability-2 (defende monetário) → testability-1 + fault-tolerance-2 (observabilidade) → integrability-1 + fault-tolerance-1 (Zod + sub-flag) → integrability-2 (fixtures reais, depende de acesso Conexos dev).
3. **No próximo `/feature-tweak` que tocar `EleicaoPermutasService.test.ts`**, limpar o comentário stale `getMnyTitPermutar` na linha 441 (card modifiability-1, P3, ≤ 5 min). Não merece sprint dedicada.

Veredito final: **gate APROVADO**. O delta entrega a invariante correta com superfície bem encapsulada;
os 6 P1 são oportunidades de melhoria de observabilidade, não defeitos de correctness. P3 é cosmético.
**Nenhum re-loop AutoLoopRunner necessário.**
