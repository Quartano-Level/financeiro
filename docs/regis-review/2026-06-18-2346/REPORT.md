---
type: regis-review-report
run_id: 2026-06-18-2346
generated_at: 2026-06-19T02:00:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
mode: --quick (scoped to "já permutado" feature)
total_cards: 23
total_p0: 0
total_p1: 3
total_p2: 11
total_p3: 9
overall_score: 7.96
---

# Regis-Review — financeiro — 2026-06-18-2346

> Escopo: feature "já permutado" — distinguir `JA_PERMUTADO` de `SEM_SALDO_PERMUTAR` na eleição de permutas via leitura de `mnyTitPermuta` no detail Conexos (`com298/{docCod}`). Arquivos no escopo: `ConexosClient.ts`, `EleicaoPermutasService.ts`, `ElegibilidadeService.ts`, `Adiantamento.ts`, `EstadoElegibilidade.ts`, `app/permutas/page.tsx`.

> **P0 (Crítico) = 0.** Nenhum finding ou card de severidade Crítica nesta review. O loop de remediação não re-entra. Os 23 cards descem para `ontology/_inbox/<feature>-regis-followups.md` conforme política. Mesmo assim, há três P1 que sugerimos endereçar na primeira sprint pós-feature (não bloqueia merge, mas o custo de inação é mensurável e cresce com cada nova frente).

## 1. Executive scorecard

Pesos por QA (perfil financeiro multi-tenant SaaSo, write-back em Conexos/Nexxera/GED): Security 1.5, Fault Tolerance 1.3, Availability 1.2, Modifiability 1.2, Testability 1.0, Performance 1.0, Integrability 0.9, Deployability 0.9. Soma de pesos = 9.0.

| QA | Score (0–10) | Peso | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|---|
| Availability | 8.5 | 1.2 | 0 | 0 | 2 | 0 | F-availability-1: `valorPermutado` ausente cai silenciosamente em `SEM_SALDO_PERMUTAR` sem trilha observável |
| Deployability | 7.0 | 0.9 | 0 | 1 | 2 | 0 | F-deployability-1: Skew BE↔FE no deploy do novo `'casamento-manual'` (até ~5min de janela) |
| Integrability | 8.0 | 0.9 | 0 | 0 | 1 | 2 | F-integrability-1: Detail `com298/{docCod}` consumido como `Record<string, unknown>` sem Zod schema |
| Modifiability | 7.0 | 1.2 | 0 | 1 | 3 | 0 | F-modifiability-1: Enum `MOTIVO_BLOQUEIO` duplicado em 10 strings cruas no frontend; DTO usa `motivoBloqueio?: string` |
| Performance | 9.0 | 1.0 | 0 | 0 | 0 | 2 | F-performance-1: Reuso integral do payload `getDetalheTitulos` — zero round-trip novo (POSITIVO) |
| Fault Tolerance | 8.5 | 1.3 | 0 | 0 | 1 | 2 | F-fault-tolerance-2: Falta teste de borda dedicado `valorPermutado=undefined → SEM_SALDO_PERMUTAR` |
| Security | 8.0 | 1.5 | 0 | 0 | 0 | 1 | F-security-1: Detail Conexos sem schema Zod (list tem, detail não) — degradação silenciosa em mudança upstream |
| Testability | 7.5 | 1.0 | 0 | 1 | 2 | 2 | F-testability-1: Branch `ja-permutado` do `StatusBadge` sem teste unitário no frontend |
| **Overall** | **7.96** | **9.0** | **0** | **3** | **11** | **9** | — |

Score interpretation:
- 0–3: risco estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- **7–8: saudável com oportunidades pontuais ← onde a feature está**
- 9–10: estado-da-arte para o estágio atual

**Veredito sintético**: a feature "já permutado" é **higiênica por desenho** (P0=0, Performance 9.0, Fault Tolerance 8.5, Availability 8.5). Os pontos fracos são todos de **superfície de contrato BE↔FE** (Modifiability 7.0, Deployability 7.0) e **observabilidade do delta na UI** (Testability 7.5) — débitos que não nasceram nesta feature, mas que ela amplifica ao introduzir 1 campo opcional + 4 literais novos em uniões discriminadas.

## 2. Top 10 risks (cross-QA)

Ranking por composição **severidade × impacto de negócio × leverage** (quantas QAs o mesmo card resolve). Como não há P0, esta seção lista os P1 e os P2 de maior leverage primeiro.

### R-1: Slugs de `MOTIVO_BLOQUEIO` duplicados como string crua no frontend, DTO `motivoBloqueio?: string` (cardinalidade infinita)
- **QA(s) afetados**: Modifiability (P1), Testability (P2), Integrability (P3 implícito)
- **Findings de origem**: F-modifiability-1 (page.tsx:38-49, types.ts:40), F-modifiability-4 (Record<string,string>), F-testability-2 (sem assert de bijeção motivo↔label)
- **Evidência sintetizada**: 10/10 chaves do const enum backend (`MOTIVO_BLOQUEIO` em `EstadoElegibilidade.ts:27-59`) duplicadas como literais em `page.tsx:38-49`; literal `'ja-permutado'` reaparece em `page.tsx:73,77`; `PermutaPendente.motivoBloqueio` é `string` no FE (vs. union literal de 10 no BE). Fallback `?? motivo` em `StatusBadge` mascara slug cru.
- **Impacto técnico**: adicionar/renomear motivo no backend não causa erro de compilação no frontend. Próxima taxonomia (SISPAG, Popula GED) repete o custo em escala maior.
- **Impacto de negócio**: rótulo errado/ausente no painel da Frente I → operador interpreta "Já permutado" (CONCLUÍDO benigno) como "Bloqueada" (ERRO vermelho) → ruído operacional, retrabalho, perda de confiança no painel. Custo por nova taxonomia ≈ 1.5× (3 sítios editados manualmente em vez de 1).
- **Cards Kanban relacionados**: modifiability-1, modifiability-4, testability-2
- **Custo de inação em 6 meses**: assumindo 3 novos motivos entre Permutas Fatia 2/3 e SISPAG MVP, ~3 incidentes potenciais de "slug cru na tela" em produção até alguém notar visualmente; ~1h por incidente de diagnóstico + correção + redeploy.

### R-2: Skew BE↔FE na publicação do novo `StatusElegibilidade = 'casamento-manual'`
- **QA(s) afetados**: Deployability (P1), Modifiability (via união discriminada), Availability (MTTD de deploy quebrado)
- **Findings de origem**: F-deployability-1 (sem job `deploy-frontend` no `ci.yml`, Vercel auto-deploy assíncrono ao Render hook)
- **Evidência sintetizada**: nova união discriminada `'elegivel' | 'bloqueada' | 'casamento-manual'` e novo KPI `resumo.casamentoManual` viajam em janelas independentes: Render hook (~60–180s) + Vercel build (~60–120s) sem `needs:` entre eles. Janela total estimada: até ~5min de skew sem coordenação.
- **Impacto técnico**: FE antigo recebe `status: 'casamento-manual'` em discriminante desconhecido → badge vazia ou cai no `default`; FE novo apontado para BE antigo mostra KPI ausente.
- **Impacto de negócio**: operador vê uma fração das candidatas N:M sem badge nem KPI por minutos, causando confusão e potencial retrabalho ("sumiu da tela"). Não há perda de dado, mas mina a confiança no rollout sequencial das três Frentes (Permutas → SISPAG → Popula GED previstos para 90d).
- **Cards Kanban relacionados**: deployability-1
- **Custo de inação em 6 meses**: cada deploy com mudança de union discriminada (estimado 2–3 nos próximos 90 dias) gera janela de ~5min de UI inconsistente; primeira reclamação vem via suporte, MTTR depende de observação humana.

### R-3: Branch `'ja-permutado'` do `StatusBadge` sem teste unitário no frontend
- **QA(s) afetados**: Testability (P1), Modifiability (componente embedded em page.tsx 680 LOC), Availability (regressão silenciosa)
- **Findings de origem**: F-testability-1 (zero hits em `__tests__/` para `ja-permutado` ou `StatusBadge`)
- **Evidência sintetizada**: branch é variante visual distinta (`bg-info-subtle`, `CheckCircle2`) deliberadamente diferente do vermelho de bloqueada. Documentação no componente reforça que confundir o badge engana o operador. Nenhum teste em `src/frontend/__tests__/**` toca o componente.
- **Impacto técnico**: refactor do `StatusBadge` (troca de tokens do design system, reordenação dos `if`s) pode silenciosamente cair na cláusula `return` final e renderizar como bloqueada vermelha sem alarme.
- **Impacto de negócio**: analista pode reabrir como erro um adiantamento em estado terminal correto → risco de reconciliação dupla de uma permuta já consumida.
- **Cards Kanban relacionados**: testability-1, modifiability-2 (refactor para tabela `motivo → variante`)
- **Custo de inação em 6 meses**: 1 incidente plausível de regressão visual no `StatusBadge` quando `modifiability-3` (split de page.tsx) ou design system update entrar; descoberta via print do suporte.

### R-4: Detail endpoint `com298/{docCod}` sem schema Zod no boundary
- **QA(s) afetados**: Integrability (P2), Security (P3), Fault Tolerance (cross-link)
- **Findings de origem**: F-integrability-1, F-security-1 — mesma causa-raiz, leitura diferente
- **Evidência sintetizada**: `legacy.getGeneric<Record<string, unknown>>` no detail, 3 campos lidos via `parseOptionalNumber` (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`) sem schema. O list (`com298RowSchema`) já tem schema Zod; o detail não. Precedente prova esforço trivial.
- **Impacto técnico**: se Conexos renomear `mnyTitPermuta` → `mny_tit_permuta`, `parseOptionalNumber(undefined) → undefined`, degradação silenciosa para `SEM_SALDO_PERMUTAR`. Sem log de schema, sem alarme.
- **Impacto de negócio**: candidatas que deveriam ser `JA_PERMUTADO` viram `SEM_SALDO_PERMUTAR` no painel — analista reabre tentativa de permuta indevida e descobre só no Gate 3 (custo: ~2h por incidente, sem mover dinheiro).
- **Cards Kanban relacionados**: integrability-1, security-1 (mesma implementação resolve ambos)
- **Custo de inação em 6 meses**: probabilidade baixa por janela individual; cresce com SISPAG/GED introduzindo mais campos da família `mny*`. Estimativa: 1 detecção tardia de mudança upstream Conexos em 12 meses = ~4–6h de investigação.

### R-5: Smoke test pós-deploy só verifica `/health` (não cobre contrato Permutas)
- **QA(s) afetados**: Deployability (P2), Integrability (P3), Availability (MTTD)
- **Findings de origem**: F-deployability-2, F-deployability-3 (skip silencioso quando secret ausente)
- **Evidência sintetizada**: `curl --retry 12 --retry-delay 10 /health` é o único pós-deploy. Esta feature aumenta a superfície de contrato em 1 campo opcional + 4 literais de enum sem assert correspondente. Quando `RENDER_BACKEND_URL` não está setado, smoke devolve `exit 0` com warning.
- **Impacto técnico**: deploy que sobe mas devolve payload com typo (`'ja-permutado'` vs `'já-permutado'`) ou KPI ausente passa pelo CI e atinge o FE.
- **Impacto de negócio**: regressão de contrato chega ao operador antes do CI detectar; MTTR depende de alguém abrir a tela.
- **Cards Kanban relacionados**: deployability-2, deployability-3
- **Custo de inação em 6 meses**: 1 deploy quebrado por ano alcança produção sem sinal automático; MTTD humano = horas.

### R-6: `page.tsx` em 680 LOC concentra render, paginação, filtros e tabelas N:M
- **QA(s) afetados**: Modifiability (P2), Testability (mais difícil cobrir por componente)
- **Findings de origem**: F-modifiability-3 (680 LOC vs. alvo p95 400; 8 símbolos top-level)
- **Evidência sintetizada**: arquivo único contém `MOTIVO_LABEL`, `StatusBadge`, `PROCESSAMENTO_LABEL`, `ProcessamentoBadge`, `Moeda`, `FILTRO_VAZIO_LABEL`, `STATUS_OPCOES`, `GestaoPermutasPage` (3 useStates + paginação + 3 tabelas em JSX) e `LoadingSkeleton`. Pré-existente; a feature mantém o arquivo crescendo (+12 linhas em `MOTIVO_LABEL` + nova branch em `StatusBadge`).
- **Impacto técnico**: cada mudança no painel exige ler o arquivo inteiro. P95 alvo de 400 LOC ultrapassado em 70%.
- **Impacto de negócio**: PRs no painel demoram review mais longa; alto risco de conflito de merge entre PRs paralelos (provável nas Fatias 2/3).
- **Cards Kanban relacionados**: modifiability-3 (esforço M)
- **Custo de inação em 6 meses**: Fatias 2/3 empurram para ~900–1100 LOC; conflitos de merge ficam frequentes.

### R-7: Falta teste de borda dedicado para `valorPermutado=undefined → SEM_SALDO_PERMUTAR`
- **QA(s) afetados**: Fault Tolerance (P2), Testability (cobertura de branch)
- **Findings de origem**: F-fault-tolerance-2
- **Evidência sintetizada**: a regra `(adiantamento.valorPermutado ?? 0) > 0 ? JA_PERMUTADO : SEM_SALDO_PERMUTAR` em `ElegibilidadeService.ts:151-155` é defesa crítica contra mislabel. Não há teste explícito que falhe se alguém inverter `> 0` para `>= 0` ou trocar `??` por `||`.
- **Impacto técnico**: refator futura silenciosamente classifica `undefined` como `JA_PERMUTADO` — mesmo modo de falha de F-security-1 visto pelo lado interno.
- **Impacto de negócio**: candidata mislabelada no painel; analista recebe sinal incorreto. Mitigado pela natureza read-only desta fatia (sem write financeiro).
- **Cards Kanban relacionados**: fault-tolerance-2
- **Custo de inação em 6 meses**: probabilidade baixa, mas mutation-test survivors hoje desconhecidos.

### R-8: Sem alarme/contador sobre taxa de `DETAIL_INDISPONIVEL` por filial
- **QA(s) afetados**: Availability (P2)
- **Findings de origem**: F-availability-2
- **Evidência sintetizada**: log por candidata existe (`LogService.warn({ motivo: DETAIL_INDISPONIVEL })`) mas não há agregação por run/filial nem alarme. Degradação parcial Conexos esvazia eleição inteira sem disparar sinal acionável.
- **Impacto técnico**: degradação Conexos > N% por 2 runs invisível até reclamação do analista.
- **Impacto de negócio**: D0 de operação financeira passa sem candidatas elegíveis; time só descobre via reclamação.
- **Cards Kanban relacionados**: availability-1, availability-2
- **Custo de inação em 6 meses**: 1–2 incidentes de degradação Conexos por trimestre se tornam invisíveis ao time até o operador reportar.

### R-9: `StatusBadge` mistura mapping por status com regra de exceção por motivo
- **QA(s) afetados**: Modifiability (P2), Testability (cobertura de branch)
- **Findings de origem**: F-modifiability-2
- **Evidência sintetizada**: 3 ramos heterogêneos (`if (status === 'elegivel')`, `if (status === 'casamento-manual')`, `if (motivo === 'ja-permutado')`) misturam mapping por status com exceção por motivo. Cada novo motivo "estado-concluído-não-erro" empilha mais um `if`.
- **Impacto técnico**: O(n) em ifs aninhados; vira a próxima warning de `noExcessiveCognitiveComplexity` em ~5 motivos benignos.
- **Impacto de negócio**: dificulta evoluir a linguagem visual do painel.
- **Cards Kanban relacionados**: modifiability-2 (depende de modifiability-1 para a union tipada)

### R-10: `ConexosClient.test.ts` chegou a 1333 LOC (file-level structural complexity)
- **QA(s) afetados**: Testability (P2), Modifiability (manutenção)
- **Findings de origem**: F-testability-3, F-testability-4 (fixtures inline)
- **Evidência sintetizada**: 1333 LOC sobre source de 1414 LOC (1:1). Describe `getDetalheTitulos` agrega retry, ConexosError, 400-quirk, `valorPermutar`, `pago`, `valorPermutado` em 8 it's — 5 facetas.
- **Impacto técnico**: file size > 500 LOC degrada `time-to-locate` em falhas. Em 3 sprints com Nexxera/GED tende a explodir.
- **Impacto de negócio**: custo crescente por mudança no client Conexos.
- **Cards Kanban relacionados**: testability-3 (M), testability-4 (S)

## 3. Cross-cutting findings

### CC-1: Falta de SSOT (Single Source of Truth) tipada para a taxonomia `MotivoBloqueio` entre BE e FE
- **Aparece em**: Modifiability (P1), Testability (P2), Deployability (skew de union discriminada), Integrability (contrato BE↔FE)
- **Findings**: F-modifiability-1, F-modifiability-4, F-testability-2, F-deployability-1 (parcial — uniões discriminadas viajam sem type compartilhado)
- **Diagnóstico unificado**: o backend define `MOTIVO_BLOQUEIO`/`ESTADO_ELEGIBILIDADE`/`StatusElegibilidade` como const enums tipados rigorosamente, mas o frontend duplica os literais como strings cruas com `Record<string, string>` e DTOs tipados como `string`. O `tsc` não detecta drift; o fallback `?? motivo` mascara erros até o operador notar visualmente. **Esta é a causa-raiz comum** dos 3 P1 da review (modifiability-1, testability-1, deployability-1 indireto).
- **Recomendação consolidada**: card **modifiability-1** sozinho resolve modifiability-1, modifiability-4 e testability-2 (e habilita modifiability-2/3). É o card de maior leverage da revisão. Esforço S, retorno em 3 QAs.

### CC-2: Boundary defensivo via `parseOptionalNumber` no detail Conexos sem schema Zod (paridade com o list)
- **Aparece em**: Integrability (P2), Security (P3), Fault Tolerance (cross-link), Availability (cross-link)
- **Findings**: F-integrability-1, F-security-1
- **Diagnóstico unificado**: o list já tem `com298RowSchema.parse(row)`; o detail consome `Record<string, unknown>` direto. A defesa `parseOptionalNumber` rejeita não-finito mas não detecta mudança estrutural do payload (renomeação de campo, aninhamento). Degradação silenciosa para `SEM_SALDO_PERMUTAR` sem warn.
- **Recomendação consolidada**: card **integrability-1** (criar `com298DetailSchema`) entrega Security e Integrability em um único trabalho. Esforço S. Bônus: combinado com integrability-2, vira fonte de tipos via `z.infer`.

### CC-3: Observabilidade do delta (rótulo/estado) por agregação cross-run ausente
- **Aparece em**: Availability (P2), Fault Tolerance (P3), Performance (P3 deferred — Lambda/CloudWatch)
- **Findings**: F-availability-1, F-availability-2, F-fault-tolerance-1, F-performance-1/3
- **Diagnóstico unificado**: o pipe tem logs por candidata (`BUSINESS_WARN`) mas não há agregação `por (flowId, filCod, motivo)` que permita detectar derivas de `DETAIL_INDISPONIVEL` ou drift de `JA_PERMUTADO`. Sintoma do estado-atual (Render sem CloudWatch); endereçar parcialmente já no atual via log de resumo no fim da run.
- **Recomendação consolidada**: card **availability-2** (resumo por run/filial) + carry-over do card **performance-2** para a migração Lambda/CloudWatch. Esforço S no atual, M no alvo.

### CC-4: Testes de fixture do Conexos crescem inline (sem `__fixtures__/`) e o arquivo cresce monoliticamente
- **Aparece em**: Testability (P2/P3), Modifiability (manutenção do client), Integrability (fixtures = contrato implícito)
- **Findings**: F-testability-3, F-testability-4
- **Recomendação consolidada**: cards **testability-3** (split por capability) + **testability-4** (fixtures em `__fixtures__/`) devem ir juntos; sozinhos perdem leverage. Bloqueio antes de SISPAG/GED entrarem.

## 4. Quick wins (≤5 dias úteis)

Cards com esforço S e severidade ≥ P2, alta razão impacto/esforço. **Estes são os cards para defender em reunião como "primeira sprint pós-aprovação".**

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| modifiability-1 | Modifiability | S | P1 | 10 slugs duplicados FE↔BE → 0; DTO `motivoBloqueio` cardinalidade ∞ → 10; compile-time error ao adicionar motivo sem label |
| testability-1 | Testability | S | P1 | Testes cobrindo branch `ja-permutado`: 0 → ≥1; componentes da rota `app/permutas` com teste: 0 → 1 |
| deployability-1 | Deployability | S | P1 | Janela de skew BE→FE: ~5min → ≤30s; deploys com FE/BE coordenados: 0% → 100% |
| integrability-1 | Integrability | S | P2 | Schemas Zod cobrindo detail Conexos: 0 → 1; campos pinados: 0 → 3. **Bônus**: resolve também F-security-1. |
| modifiability-4 | Modifiability | S | P2 | `MOTIVO_LABEL` tipado `Record<MotivoBloqueio, string>`; detecção de label faltando: runtime → compile-time. Trivial após modifiability-1. |
| testability-2 | Testability | S | P2 | Chaves `MOTIVO_LABEL` cobertas por enum tipado: 0/10 → 10/10; teste de bijeção motivo↔label: 0 → 1. Sinergia com modifiability-1. |
| deployability-2 | Deployability | S | P2 | Endpoints Permutas no smoke: 0 → 1 (gestão); detecção de contrato quebrado: pós-deploy humano → pré-tráfego no CI |
| deployability-3 | Deployability | S | P2 | % releases com smoke executado: 0% (quando secret ausente) → 100% |
| availability-1 | Availability | S | P2 | Logs com flag `valorPermutadoAusente`: 0 → 1 por candidata Gate-2-reprovada |
| availability-2 | Availability | S | P2 | Log de resumo por (`flowId`, `filCod`): 0 → 1 por run |
| fault-tolerance-2 | Fault Tolerance | S | P2 | Testes cobrindo `valorPermutado=undefined → SEM_SALDO_PERMUTAR`: 0 → ≥1; mutation-test survivors → 0 |

**11 quick wins, todos esforço S, ≥ P2.** Empilhando-os numa sprint, fecham CC-1 (taxonomia tipada), CC-2 (schema Zod do detail), CC-3 (resumo por run), e duas regressões silenciosas no FE.

## 5. Strategic moves (M / L / XL)

Cards de maior fôlego — justificativa amarrada a métrica.

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| modifiability-3 | Modifiability + Testability | M | Split Module + Reduce Size of Module | `page.tsx` está 70% acima do alvo p95 (680 vs 400 LOC); Fatias 2/3 projetam ~900–1100 LOC, alta probabilidade de conflito de merge entre PRs paralelos. Quebra o monolito antes de o problema acontecer. Depende de modifiability-1. |
| testability-3 | Testability + Modifiability | M | Limit Structural Complexity | `ConexosClient.test.ts` está em 1333 LOC sobre source de 1414 (relação 1:1); describe `getDetalheTitulos` agrega 5 facetas em 8 `it`'s. Bloqueio antes de Nexxera/GED entrarem com o mesmo padrão monolítico. |
| testability-5 | Testability + Modifiability + Fault Tolerance | M | Limit Non-Determinism | 8 leituras de `new Date()` em `EleicaoPermutasService`/`IngestaoPermutasService`. SISPAG (Frente II) terá janelas temporais (lote do dia, retorno D+1) — flake risk concreto se entrar sem `ClockProvider`. `AgingService` já demonstrou o padrão correto. |
| performance-2 | Performance + Availability + Deployability | M | Bound Execution Times | Diferido até a migração Lambda+CloudWatch. p95 `com298_detail` hoje não-medível; alvo ≤ 1500ms com alarme em +30%. Consolida com cards de observabilidade dos outros QAs em um único item de "observability foundations". |

## 6. O que está bem (e por quê)

1. **Backend da feature é exemplar em Reduce Overhead (Performance 9.0)**: lê `mnyTitPermuta` do **mesmo payload** já fetched por `getDetalheTitulos`. Zero novo I/O, zero novo round-trip, zero nova dep em `package.json`. `ConexosClient.ts:944-952`.
2. **Defaults conservadores (Fault Tolerance 8.5)**: `valorPermutado=undefined → SEM_SALDO_PERMUTAR` (nunca infere `JA_PERMUTADO` sem prova); `pago=false` quando `mnyTitAberto` ausente. Sanity Checking + Exception Prevention aplicados corretamente.
3. **Degradação tipada (Availability 8.5)**: detail-fetch falhado após retries → `ConexosError` typed → candidata vira `DETAIL_INDISPONIVEL` (distinto de `falha-gate`, re-avaliável). Tactic Degradation + Forward Recovery. `EleicaoPermutasService.ts:419-436`.
4. **Quirk 400 com `responseData` tratado explicitamente (Integrability 8.0)**: Conexos legitimamente embute payload em status de erro; detectado e usado sem retry. Tactic Increase Competence Set, com ADR inline.
5. **`motivoDoGateFalho` encapsula prioridade de gates (Modifiability — exemplar no backend)**: causa-raiz primeiro (NAO_PAGO > JA_PERMUTADO/SEM_SALDO_PERMUTAR > DI_DUIMP_AMBOS > FALHA_GATE). 14 LOC, JSDoc explicativo, 4 ramos, complexidade cognitiva baixa. `ElegibilidadeService.ts:144-158`.
6. **Boundary Validate Input bem aplicada (Security 8.0)**: 0 hardcoded secrets, 0 SQL string-interpolated, 0 `dangerouslySetInnerHTML`. `parseOptionalNumber` rejeita `null`/`''`/`NaN`/`Infinity`. Renderização do valor numérico via React + `formatNumber()` (sem sink HTML).
7. **CI tem 7 steps automatizados commit→prd + gate pre-deploy + migração idempotente + smoke retry (Deployability 7.0)**: `npm ci` + lockfile + Node 24 pinado + `npm audit --audit-level=high`. Esta feature não adiciona dependência; reduz risco de deploy a coordenação BE↔FE.
8. **Cobertura de teste do backend para a nova branch (Testability 7.5)**: 2 casos dedicados para `JA_PERMUTADO` (positivo + prioridade `NAO_PAGO > JA_PERMUTADO`), 2 casos para o mapper. 91/91 testes verdes no escopo, 0 chamadas reais de rede, 0 `new Date()` introduzidos no diff.

## 7. Limitações da análise

- **Modo `--quick`**: cobertura % por linha/branch **não foi medida** em nenhum QA. Recomendação: rodar `cd src/backend && npm test -- --coverage --collectCoverageFrom='src/domain/service/permutas/**' --collectCoverageFrom='src/domain/client/ConexosClient.ts'` em um run não-quick e gravar baseline em `_shared-metrics.md`.
- **Métricas não-medíveis localmente**: p95 latência do job de eleição (Performance, Availability), taxa real de `DETAIL_INDISPONIVEL` em produção (Availability, Integrability), histórico de deploy success rate / lead time real `commit→/health` (Deployability), MTTR pós-incidente (Availability, Fault Tolerance). Todas dependem de CloudWatch/observabilidade do estado-alvo (Lambda) ou de agregação manual no estado-atual (Render).
- **Não medido**: `npm audit` profundo (skipped por `--quick`), `terraform plan` (sem `infra/` no repo, estado-alvo), chaos engineering, threat modeling formal, custo cloud, UX/acessibilidade, p99 de latência em produção.
- **Escopo cirúrgico**: revisão limitada aos arquivos da feature "já permutado" (`_shared-metrics.md` linha 5). Não auditei o resto de `EleicaoPermutasService` (656 LOC fora do delta), `ConexosClient` (1414 LOC, idem), nem o resto de `app/permutas/page.tsx` além das mudanças. Algumas observações de débito pré-existente (ex.: page.tsx 680 LOC) foram registradas porque a feature **amplifica** o problema, mas não os criou.
- **Janela temporal**: snapshot do dia 2026-06-18/19. Código é vivo. Recomendado refazer Regis-Review trimestral em `--full` e a cada feature em `--quick`.
- **Pesos da média ponderada**: definidos para perfil financeiro multi-tenant SaaSo (Security 1.5, Fault Tolerance 1.3, Availability 1.2, Modifiability 1.2, Testability 1.0, Performance 1.0, Integrability 0.9, Deployability 0.9). Ajustar se o perfil de negócio mudar (ex.: se a migração Lambda virar prioridade, Deployability sobe).
- **Decisão de severidade**: nenhum finding atingiu P0. Critério usado: P0 exige risco de corrupção de dado, perda financeira ou bloqueio operacional. A fatia é **read-only** (sem write-back), o que rebaixa naturalmente a severidade máxima. Quando a Fatia 2 entrar (write-back em `fin010`), esperamos que F-availability-3, F-fault-tolerance-2 e F-security-1 subam para P1.

## 8. Ações recomendadas (30 dias)

Em ordem de execução. **P0=0; o loop não re-entra automaticamente. Os P1 abaixo são execução defensiva voluntária, não bloqueio de merge.**

1. **Sprint 1 (semana 1)** — fechar CC-1 com 1 card de leverage máximo: **modifiability-1** (compartilhar `MotivoBloqueio` BE↔FE como SSOT). Em ≤1d, resolve 1 P1 + 2 P2 em 3 QAs (Modifiability, Testability, Integrability indireto). Pré-requisito para modifiability-2, modifiability-4 e testability-2.
2. **Sprint 1 (semana 1)** — em paralelo: **testability-1** (teste do `StatusBadge` para branch `'ja-permutado'`) + **deployability-1** (coordenar Render→Vercel via `needs:` + fallback defensivo no FE). Os 3 P1 fecham na primeira sprint.
3. **Sprint 1 (semana 2)** — empilhar quick wins de CC-2 e CC-3: **integrability-1** (Zod no detail — fecha também F-security-1), **availability-1** + **availability-2** (instrumentação de motivo por run/filial), **fault-tolerance-2** (teste de borda dedicado), **deployability-2** + **deployability-3** (smoke de contrato + secret obrigatório).
4. **Sprint 2** — **modifiability-2** + **modifiability-4** (tabela `motivo → variante` no `StatusBadge`, tipagem exhaustiva de `MOTIVO_LABEL`). Liberam modifiability-3 (M) sem migrar literais durante o split.
5. **Sprint 3+ / pré-SISPAG** — **modifiability-3** (split de `page.tsx`), **testability-3** (split de `ConexosClient.test.ts`), **testability-5** (`ClockProvider` antes da Frente II que terá janelas temporais). Strategic moves M antes de SISPAG/GED entrarem.
