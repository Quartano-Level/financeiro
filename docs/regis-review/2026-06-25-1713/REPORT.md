---
type: regis-review-report
run_id: 2026-06-25-1713
generated_at: 2026-06-25T19:35:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
total_cards: 35
total_p0: 0
total_p1: 9
total_p2: 19
total_p3: 7
overall_score: 6.9
---

# Regis-Review — financeiro — 2026-06-25-1713

Feature: `permutas-executar-automaticas` — botão **"Executar todas"** que dispara `POST /permutas/reconciliar-lote` para baixar em LOTE todas as automáticas elegíveis (~26 hoje) no `fin010` do Conexos. Worktree: `permutas-executar-wt`. Branch: `feat/permutas-executar-automaticas`.

**Veredito do gate:** NENHUM achado P0. A feature é aprovada para merge/deploy nas condições atuais (N≈26, dry-run gateável, admin-only, checkpoint EM CADASTRO). 9 achados P1 vão para follow-up estruturado — apenas dois deles requerem atenção pré-deploy: kill-switch e cap server-side. O restante é hardening proporcional ao crescimento previsto do volume.

## 1. Executive scorecard

Pesos aplicados (domínio financeiro multi-tenant com escrita real no ERP):
Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 · Testability 1.0 · Performance 1.0 · Integrability 0.9 · Deployability 0.9 (total = 9.0)

| QA | Score (0–10) | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 6.0 | 0 | 1 | 3 | 1 | F-availability-1: request síncrona N×~5 chamadas ERP sem `Bound Execution Times`; proxy do Render corta antes do fim |
| Deployability | 6.0 | 0 | 1 | 2 | 1 | F-deployability-1: botão hardcoded `PROCESSAMENTO_HABILITADO=true`; sem kill-switch sem redeploy |
| Integrability | 8.0 | 0 | 0 | 3 | 1 | F-integrability-1: tipos `ReconciliarLoteResult` duplicados manualmente FE↔BE, sem contract test |
| Modifiability | 7.5 | 0 | 2 | 1 | 1 | F-modifiability-1: drift FE↔BE no shape do lote (recorrente, 4ª iteração de Permutas com a mesma observação) |
| Performance | 4.0 | 0 | 1 | 4 | 1 | F-performance-1: ~130 round-trips Conexos em UMA request HTTP, banda projetada 39s p50 / 195s p95 |
| Fault Tolerance | 8.2 | 0 | 3 | 1 | 0 | F-fault-tolerance-1: re-fire pós-timeout pode re-POSTar baixa em par órfão `reconciling` (pré-existente, amplificado pelo lote) |
| Security | 7.0 | 0 | 1 | 3 | 0 | F-security-1: lote sem cap server-side (`MAX_LOTE` ausente); 1 admin clica = todo o `gestao.casamentos` |
| Testability | 8.0 | 0 | 0 | 2 | 2 | F-testability-1: handler `executarLote` e diálogo de confirmação sem teste no front |
| **Overall** | **6.9** | **0** | **9** | **19** | **7** | — |

Score interpretation:
- 0–3: risco estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais
- 9–10: estado-da-arte para o estágio atual

Performance (4.0) é o outlier negativo claro: a estratégia "request síncrona sequencial" é exatamente o anti-pattern que a tactic `Bound Execution Times` da Bass alerta. A nota não vira P0 porque (a) idempotência write-ahead torna o retry seguro, (b) o checkpoint EM CADASTRO preserva o controle humano, e (c) N=26 ainda cabe na janela operacional. Vira P0 funcional quando N passar de ~50.

## 2. Top 10 risks (cross-QA)

Ranking por severidade × leverage × business impact. P0 ausente — todos abaixo são P1 ou P2 com leverage cross-QA.

### R-1: Re-fire pós-timeout pode duplicar baixa no `fin010` (janela cinza em pares `reconciling` órfãos)
- **QA(s) afetados**: Fault Tolerance (primário), Availability, Performance
- **Findings de origem**: F-fault-tolerance-1 (`fault-tolerance.md` §4), F-fault-tolerance-3 (mesmo arquivo), F-availability-1 (`availability.md` §4)
- **Evidência sintetizada**: o lote reusa `ReconciliacaoPermutaService.reconciliar` cuja idempotência write-ahead bloqueia apenas pares `settled`; pares que crasham entre `setBorCod` (passo 3) e `markSettled` (passo 8) ficam órfãos em `status='reconciling'` com `bor_cod` mas sem `bxa_cod_seq`. Re-clique do analista pós-timeout → `beginExecution` faz UPSERT mantendo `reconciling` → serviço segue para `executarBaixa` → RE-POST de `gravarBaixaPermuta` cria segunda baixa no mesmo título (e/ou em borderô novo, pois `borCod` é local da função). Pré-existente; o lote amplifica o blast radius de 1 par para N pares por request.
- **Impacto técnico**: borderô duplicado + baixa duplicada no mesmo `bxaCodSeq`, exigindo estorno manual e conciliação reversa.
- **Impacto de negócio**: super-pagamento contábil — uma invoice baixada 2× no fin010. Em horário de pico, 1 timeout = N pares potencialmente afetados (hoje N≈26).
- **Card(s) Kanban relacionados**: fault-tolerance-1, fault-tolerance-3, availability-1
- **Custo de inação em 6 meses**: assumindo 1 timeout do proxy por mês em prod e 5% dos pares no estado-cinza, projeta-se ~1–2 super-pagamentos/mês exigindo estorno manual. Premissa: volume cresce de 26 para ~80/dia. Sem o reaper + sem o guard de re-POST, o problema escala linearmente.

### R-2: Botão "Executar todas" sem kill-switch sem redeploy
- **QA(s) afetados**: Deployability (primário), Security, Availability
- **Findings de origem**: F-deployability-1 (`deployability.md` §4)
- **Evidência sintetizada**: `src/frontend/app/permutas/page.tsx:86` tem `const PROCESSAMENTO_HABILITADO = true` hardcoded. Desligar em incidente exige: editar arquivo → PR → CI → deploy Vercel (3–8 min) OU derrubar `CONEXOS_WRITE_ENABLED` (martelo: paralisa também a baixa individual). Sem caminho granular.
- **Impacto técnico**: MTTR para desligar a ação = 3–8 min (redeploy FE) ou impacto colateral em toda a escrita do ERP.
- **Impacto de negócio**: em uma feature que cria ~26 borderôs por clique, lead time de mitigação ≥5min vira retrabalho contábil (estorno manual de borderôs criados sob alerta).
- **Card(s) Kanban relacionados**: deployability-1, deployability-3
- **Custo de inação em 6 meses**: ~1 incidente que exige derrubar o lote estimado por trimestre. Sem kill-switch granular, cada um custa ~30–60min de paralisação do ERP inteiro OU ~15min de retrabalho contábil sobre borderôs criados sob alerta.

### R-3: Request síncrona longa pode estourar timeout do proxy Render
- **QA(s) afetados**: Performance (primário), Availability, Fault Tolerance
- **Findings de origem**: F-performance-1, F-performance-2 (`performance.md` §4), F-availability-1, F-fault-tolerance-4 (`fault-tolerance.md` §4)
- **Evidência sintetizada**: 26 adtos × 5 chamadas ERP = ~130 round-trips síncronos em UMA request. Banda projetada 39s p50 / 195s p95 (literatura — latência real Conexos não medida). Proxy Render corta ~100s; sem `Bound Execution Times`, `AbortController` ou heartbeat — analista vê "Falha" enquanto backend ainda processa.
- **Impacto técnico**: cliente perde a resposta sobre N borderôs já criados; backend continua iterando sem saber que o cliente desistiu.
- **Impacto de negócio**: feature percebida como "frágil" → re-cliques humanos → amplifica R-1. Quando N=80 (projeção 6 meses), a feature **falha visualmente em quase 100% dos casos** mesmo executando com sucesso parcial.
- **Card(s) Kanban relacionados**: performance-1, availability-1, fault-tolerance-4, performance-4
- **Custo de inação em 6 meses**: a partir de N≈40 (projeção Q3), suporte vira gargalo recebendo "executei mas não vi nada" e re-cliques disparando R-1. Estimativa: 2–3 h de suporte/semana.

### R-4: Lote sem cap server-side (`MAX_LOTE`)
- **QA(s) afetados**: Security (primário), Availability, Fault Tolerance
- **Findings de origem**: F-security-1 (`security.md` §4)
- **Evidência sintetizada**: `ReconciliacaoLotePermutaService.ts:65-127` itera tudo o que `gestaoService.exporGestao` retornar. Sem `MAX_LOTE`/`batchSize`. Um admin (legítimo, comprometido ou em erro) dispara N escritas em 1 chamada; `heavyRouteLimiter` (10/min) não bloqueia porque é 1 request só.
- **Impacto técnico**: blast radius = `gestao.casamentos` inteiro da janela.
- **Impacto de negócio**: financeiro recebe enxurrada de borderôs inesperados; reverso (cancelar/estornar) é manual e N×; janela de auditoria pesada.
- **Card(s) Kanban relacionados**: security-1, security-2
- **Custo de inação em 6 meses**: probabilidade baixa de incidente (admin disciplined) mas custo alto se ocorrer. Compliance financeiro tipicamente exige defesa em profundidade explícita.

### R-5: Drift silencioso de contrato `ReconciliarLoteResult` entre FE e BE
- **QA(s) afetados**: Modifiability (primário), Integrability, Testability
- **Findings de origem**: F-modifiability-1 (`modifiability.md` §4), F-integrability-1 (`integrability.md` §4), F-integrability-2 (mesmo arquivo)
- **Evidência sintetizada**: tipos `LoteAdiantamentoStatus`/`ReconciliarLoteItem`/`ReconciliarLoteResult` definidos manualmente em 2 lugares (`ReconciliacaoLotePermutaService.ts:10-36` ↔ `lib/types.ts:274-295`). 0 contract test. **4ª iteração de Permutas com o mesmo achado** — drift FE↔BE foi raiz de bugs em v0.6 e v0.7.
- **Impacto técnico**: TS compila em ambos os lados com tipos divergentes; novo `status='partial-retry'` no BE → FE renderiza `undefined` no toast/diálogo.
- **Impacto de negócio**: em ação de escrita financeira, status divergente pode ocultar erro parcial como sucesso. Recorrência indica problema sistêmico de processo, não de feature.
- **Card(s) Kanban relacionados**: modifiability-1, integrability-1, integrability-2
- **Custo de inação em 6 meses**: ~1 bug de drift FE↔BE por trimestre em Permutas; cada SISPAG/GED nova frente vai herdar o mesmo padrão. Resolver agora previne 3+ recorrências.

### R-6: Sem stuck-state reaper para execuções `reconciling` órfãs
- **QA(s) afetados**: Fault Tolerance (primário), Availability, Testability
- **Findings de origem**: F-fault-tolerance-3 (`fault-tolerance.md` §4) — **herdado de `2026-06-24-2011`, ainda aberto no inbox**
- **Evidência sintetizada**: 0 jobs/queries varrendo `status='reconciling' AND atualizado_em < now()-interval '30 min'`. Sem o sweep, divergência entre trilha local e ERP é silenciosa. Pré-existente; o lote eleva a probabilidade de criação de órfãos (N por request vs. 1).
- **Impacto técnico**: drift permanente entre `permuta_alocacao_execucao` e o ERP que só vira incidente se um humano comparar manualmente.
- **Impacto de negócio**: o controle "tudo o que tentamos foi confirmado" é ilusório. MTTD de órfão = indefinido (depende de inspeção humana).
- **Card(s) Kanban relacionados**: fault-tolerance-3, fault-tolerance-1
- **Custo de inação em 6 meses**: o reaper já estava pendente em junho/2026; com o lote, a probabilidade de surgir um órfão por request sobe ~Nx. Sem ele, R-1 fica latente.

### R-7: Idempotency-Key HTTP ausente no `/reconciliar-lote`
- **QA(s) afetados**: Fault Tolerance (primário), Availability, Security, Performance
- **Findings de origem**: F-fault-tolerance-2 (`fault-tolerance.md` §4), F-availability-2 (`availability.md` §4), F-performance-5 (`performance.md` §4)
- **Evidência sintetizada**: rota não lê `Idempotency-Key`, embora o padrão JÁ exista em `POST /permutas/eleicao` (`routes/permutas.ts:138-147`). Frontend mitiga via `setExecutandoLote(true)` + `disabled` mas isso só cobre duplo-clique no mesmo browser tab; não cobre retry interno do fetch, F5 no meio, dois browser tabs.
- **Impacto técnico**: dois lotes paralelos do mesmo usuário disputam os mesmos adtos. Idempotência por-par protege baixas duplicadas; **dois `criarBordero` paralelos para o mesmo adto criam DOIS borderôs distintos** — um deles fica vazio EM CADASTRO precisando ser excluído.
- **Impacto de negócio**: ruído operacional (borderôs vazios); risco real de aprovar o errado. Combinado com R-1, agrava o re-fire pós-timeout.
- **Card(s) Kanban relacionados**: fault-tolerance-2, availability-2, performance-5
- **Custo de inação em 6 meses**: invisível hoje (1 analista); vira P0 quando 3+ analistas operarem em paralelo no fim do mês.

### R-8: `page.tsx` (2669 LOC) — god-component pré-existente agravado pelo delta
- **QA(s) afetados**: Modifiability (primário), Testability
- **Findings de origem**: F-modifiability-2 (`modifiability.md` §4), F-testability-1 (`testability.md` §4)
- **Evidência sintetizada**: `wc -l src/frontend/app/permutas/page.tsx` = 2669 (alvo p95 ≤ 600). Delta adiciona +30 LOC (estado + handler + dialog). 0 testes do front em `permutas/page.tsx`. Cada nova ação (cliente-filtro, alocação, ingestão, executar-lote) sedimenta no mesmo arquivo.
- **Impacto técnico**: hot-reload lento, conflitos de merge em paralelo, testes E2E grossos.
- **Impacto de negócio**: tempo crescente para adicionar novas ações. Próximas frentes (SISPAG, Popula GED) tendem a inflar igual.
- **Card(s) Kanban relacionados**: modifiability-2, testability-1
- **Custo de inação em 6 meses**: cada feature de UI de Permutas vira tarefa de 3d em vez de 1d. SISPAG/GED reusam o padrão → god-component multiplica.

### R-9: Sem audit trail tabular do lote (vive só em log estruturado)
- **QA(s) afetados**: Security (primário), Fault Tolerance, Availability
- **Findings de origem**: F-security-4 (`security.md` §4), F-availability-3 (`availability.md` §4)
- **Evidência sintetizada**: trilha agregada "qual lote agrupou estes 4 borderôs?" só existe em `LogService.info` (BUSINESS_INFO `'permuta batch reconciliation'`). Por-par há `permuta_alocacao_execucao`, mas sem coluna `lote_id`. Re-firing pode produzir lote diferente em composição (concorrência com nova ingestão).
- **Impacto técnico**: auditoria "qual lote disparou X borderôs?" depende de retenção/parsing de log; se rotacionar, perde-se.
- **Impacto de negócio**: dificulta auditoria financeira ("liste lotes executados por Maria em junho") e disputa de responsabilidade. Compliance financeiro fica vulnerável.
- **Card(s) Kanban relacionados**: security-4, availability-3
- **Custo de inação em 6 meses**: aceitável agora (volume baixo); degrada quando passar de 50 lotes/mês com 3+ analistas.

### R-10: Política do lote 100% hardcoded — nenhum knob configurável
- **QA(s) afetados**: Modifiability (primário), Performance, Fault Tolerance, Deployability
- **Findings de origem**: F-modifiability-3 (`modifiability.md` §4), F-performance-2 (paralelismo)
- **Evidência sintetizada**: `for (const docCod of ordem) { ... }` — sequencial, sem cap, sem early-abort, sem delay, sem paralelismo. 0 leituras de `EnvironmentProvider` no serviço do lote. Mudança operacional típica ("abortar após 5 erros", "limitar a 50 por chamada") exige PR + deploy.
- **Impacto técnico**: incidente operacional vira correção via redeploy em vez de env flip.
- **Impacto de negócio**: cada ajuste de cadência = 1 deploy = janela de 15min.
- **Card(s) Kanban relacionados**: modifiability-3, performance-2
- **Custo de inação em 6 meses**: incidente operacional pontual; aceitável por enquanto.

## 3. Cross-cutting findings

Pontos onde a mesma causa-raiz aparece em múltiplos QAs.

### CC-1: Request síncrona long-running sem `Bound Execution Times` (3 camadas faltando)
- **Aparece em**: Performance, Availability, Fault Tolerance, Deployability
- **Findings**: F-performance-1, F-performance-2, F-performance-4 (Performance); F-availability-1, F-availability-4, F-availability-5 (Availability); F-fault-tolerance-4 (Fault Tolerance)
- **Diagnóstico unificado**: o lote é uma única request HTTP de 39–195s estimados, sem `Bound Execution Times` por-item, por-request OU server-wide; sem `AbortController` no front; sem `req.on('close')` no back; sem heartbeat/progress. O proxy Render corta antes do fim; o backend continua executando órfão; o front vê "Falha" enquanto sucessos parciais reais ocorreram. Quando o analista re-clica, dispara R-1 (re-POST de baixa).
- **Recomendação consolidada**: **performance-1** (job assíncrono + endpoint de progresso) é o card consolidador — resolve simultaneamente os 3 QAs. Pode coexistir com **availability-1** (SSE) como solução de transição; performance-1 é o destino arquitetural. Cards menores (availability-4 AbortController, fault-tolerance-4 timeout + listener) viram quick wins de transição.

### CC-2: Idempotência defendida em-profundidade ainda tem gap no boundary HTTP
- **Aparece em**: Fault Tolerance, Security, Availability, Performance
- **Findings**: F-fault-tolerance-2 (Fault Tolerance); F-availability-2 (Availability); F-security (implícito em Limit Exposure); F-performance-5 (Performance)
- **Diagnóstico unificado**: o serviço tem idempotência write-ahead robusta por-par (a defesa fundo). O boundary HTTP NÃO honra `Idempotency-Key` (a defesa rasa, anti-duplo-clique cross-tab). O padrão já existe no próprio repo em `POST /permutas/eleicao`. Sem essa defesa rasa, duplo-fetch (retry browser, F5, dois tabs) cria fan-out 2× e dois borderôs distintos para o mesmo adto.
- **Recomendação consolidada**: **fault-tolerance-2** (espelhar padrão de `/eleicao` em `/reconciliar-lote` e em `/adiantamentos/:docCod/reconciliar`) — 1 card, fecha o gap nos 4 QAs simultaneamente. Custo M (cache + tabela curta `request_idempotency` + tests).

### CC-3: Drift FE↔BE de contratos — problema sistêmico (4ª iteração)
- **Aparece em**: Modifiability, Integrability, Testability
- **Findings**: F-modifiability-1 (Modifiability); F-integrability-1, F-integrability-2 (Integrability); F-testability-1 implicitamente
- **Diagnóstico unificado**: tipos espelhados manualmente em 2 lugares para CADA rota nova. 0 contract test. Reviews anteriores (v0.6, v0.7, ingestão manual, alocação) marcaram a mesma observação. É processo, não feature.
- **Recomendação consolidada**: **modifiability-1** (path alias `src/contracts/permutas.ts` OU Zod-derived `z.infer` no FE) **+ integrability-2** (contract test mínimo) — 1 decisão arquitetural (Yuri) + 1 dia de implementação fecha o problema para Permutas e cria template para SISPAG/GED.

### CC-4: Audit trail rico por-par, pobre no agregado do lote
- **Aparece em**: Security, Availability, Fault Tolerance
- **Findings**: F-security-4, F-availability-3, F-fault-tolerance-3 (correlação por timestamp em vez de `lote_id`)
- **Diagnóstico unificado**: `permuta_alocacao_execucao` é uma trilha por-par excelente, mas o **agrupamento** "este lote criou esta lista de borderôs" só vive em log estruturado. Re-firing rebusca a gestão e pode produzir composição diferente. Para auditoria financeira, isso é frágil.
- **Recomendação consolidada**: **security-4** (tabela `permuta_lote_execucao` + `permuta_lote_item` com FK) + adicionar coluna `lote_id` em `permuta_alocacao_execucao` — fecha simultaneamente o re-attach (availability-3) e a auditoria forense (security-4).

### CC-5: Observabilidade de operações pesadas é mínima — sem `duration_ms`, sem alertas
- **Aparece em**: Performance, Security, Deployability, Integrability
- **Findings**: F-performance-5 (telemetria); F-security-3 (alertas auth); F-deployability-4 (sinal pós-deploy); F-integrability-4 (taxonomia de erros)
- **Diagnóstico unificado**: nenhuma chamada Conexos é instrumentada com `duration_ms`; nenhum alarme agregado para 401/403/429; sem log estruturado por adto falho com kind=transient/validation/lock; sem evento `permutas.lote.executado` dedicado para alerta pós-deploy. Análise reativa de qualquer incidente vira investigação ad-hoc.
- **Recomendação consolidada**: **performance-3** (instrumentar `duration_ms` no `ConexosClient`) + **deployability-4** (log estruturado `permutas.lote.executado` com 5 campos) + **integrability-4** (log per-adto falho com `kind`). 3 cards S = 1–2 dias totais. Cria a base mínima para qualquer decisão futura ser baseada em número.

## 4. Quick wins (≤5 dias úteis)

Cards de esforço S, severidade ≥ P2, alta razão impacto/esforço — recomendados como primeira sprint pós-aprovação.

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| security-1 | Security | S | P1 | Cap `MAX_LOTE` server-side (default 200); rejeita com 413 se estourado. Defesa em profundidade contra blast radius. |
| deployability-1 | Deployability | S | P1 | Kill-switch via env var (lido em `GET /permutas/config`); MTTR de desligar a ação 3–8min → ≤1min sem redeploy. |
| availability-2 | Availability | S | P2 | `Idempotency-Key` no `/reconciliar-lote` (espelho do `/eleicao`); duplo-clique cross-tab não dobra fan-out Conexos. |
| availability-4 | Availability | S | P2 | `AbortController` no front + `req.on('close')` no back; operador cancela em ≤5s vs. espera o timeout do browser. |
| performance-3 | Performance | S | P2 | Instrumentar `duration_ms` em `ConexosClient`; 100% das chamadas com telemetria. Pré-requisito para qualquer outra decisão. |
| performance-4 | Performance | S | P2 | Deadline duro (90s) + cancellation via `req.on('close')`; nenhuma chamada Conexos após cliente desistir. |
| security-2 | Security | S | P2 | Typed-text "EXECUTAR" no diálogo quando `adtos > 10`; previne mouse-slip em ação irreversível. |
| integrability-1 | Integrability | S | P2 | Schema Zod canônico ou snapshot test; drift FE↔BE 2 defs → 1 def OU teste verde de paridade. |
| integrability-2 | Integrability | S | P2 | 1 contract test do wire-shape `/reconciliar-lote` (cenário 2 adtos: 1 settled + 1 erro). |
| integrability-4 | Integrability | S | P2 | Log per-adto falho com `{kind, requestId, docCod}` taxonomizado; observabilidade de integração 0% → 100%. |
| deployability-3 | Deployability | S | P2 | Runbook `runbook-permutas-executar-lote.md` ≤1 página; MTTR independente do plantonista. |
| modifiability-3 | Modifiability | S | P2 | Knobs `batchMax`/`abortAfterConsecutiveErrors` no input; ajustes operacionais sem redeploy. |
| testability-1 | Testability | S | P2 | 4 testes do handler `executarLote` + diálogo; cobertura 0 → 100% linhas. |
| testability-2 | Testability | S | P2 | 2 casos extras na rota (500 do service + 400 do Zod); status cobertos {200,401,403} → {200,400,401,403,500}. |

## 5. Strategic moves (M / L / XL)

Cards de maior fôlego com justificativa numérica.

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| performance-1 | Performance + Availability + FT | M | Bound Execution Times + Limit Event Response | Resolve CC-1 inteiro (3 QAs). Wall-clock HTTP percebido: ~40–200s → ≤1s (ack). Quando N≈80 (projeção Q3), é a única forma realista da feature funcionar — hoje a banda 195s p95 já passa do teto Render (~100s). |
| fault-tolerance-1 | FT + Availability | M | Idempotent Replay + Reconcile | Fecha R-1 (super-pagamento contábil). Cenário "reconciling órfão" hoje é detectável apenas por inspeção humana. Custo de cada incidente = estorno manual + conciliação reversa. Premissa: 1 timeout proxy/mês × ~5% pares cinza × N=80 = ~4 órfãos/mês potenciais. |
| fault-tolerance-2 | FT + Sec + Avail + Perf | M | Idempotent Replay (boundary) | Resolve CC-2. Espelha padrão JÁ existente em `/eleicao` (custo baixo). Sem isso, R-7 fica latente; quando 3+ analistas usarem em paralelo, vira P0 funcional. |
| fault-tolerance-3 | FT + Avail + Test | M | Condition Monitoring + Reconcile | Reaper de órfãos. MTTD indefinido → ≤10min (cron) ou ≤1 clique admin (provisório). Pré-requisito para reduzir a probabilidade de R-1; já era pendente em junho/2026 (carry-over). |
| modifiability-1 | Mod + Integ + Test | M | Abstract Common Services | Resolve CC-3 (drift FE↔BE). Métrica: tipos duplicados 3 → 0 OU contract test verde. Bug latente recorrente — 4ª iteração de Permutas. Resolver agora cria template para SISPAG/GED. |
| modifiability-2 | Mod + Test | L | Split Module | Quebrar `page.tsx` (2669 LOC) em sub-componentes por aba. Investimento alto, mas SISPAG/GED tendem a herdar o padrão. Métrica: LOC página 2669 → ≤400. Pode esperar até as duas próximas features ficarem prontas para amortizar. |
| security-3 | Sec | M | Detect Intrusion / Detect Service Denial | Alarmes 401/403/429 agregados — MTTD probing indefinido → <15min. Depende de decisão de sink de log (fora do escopo desta feature). |
| security-4 | Sec + FT + Avail | M | Audit Trail | Resolve CC-4. Tabela `permuta_lote_execucao` + `permuta_lote_item`. Para compliance financeiro futuro (LGPD/auditoria interna), evidência tabular é não-negociável. Métrica: % execuções persistidas 0% → 100%. |
| availability-3 | Avail + Sec + FT | M | State Resynchronization | Sobrepõe parcialmente a security-4 (tabela `permuta_lote_run` ≈ `permuta_lote_execucao`). Sugestão: implementar como UM card único conjunto, não dois. |

## 6. O que está bem (e por quê)

Reunião defensiva merece ancoragem honesta — a feature acerta MUITO.

1. **Idempotência write-ahead por par (`permuta_alocacao_execucao`)** — chave `permuta:{adto}:{invoice}:{atualizadoEm}` + `beginExecution` UPSERT preserva `settled`; retry de lote é seguro (já-settled vira `skipped`). Tactic Bass: **Idempotent Replay**. Score Fault Tolerance 8.2 ancora nisso.
2. **Continue-on-error no laço do lote** — falha de 1 adto não interrompe os 25 demais; agregação determinística. Tactic Bass: **Ignore Faulty Behavior**.
3. **Gate de escrita NÃO afrouxado pelo lote** — `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` herdados integralmente do serviço por-adto; lote nasce safe-by-default em produção. Tactic Bass: **Change Default Settings**.
4. **Checkpoint EM CADASTRO obrigatório** — nenhum borderô criado pelo lote vai para `finalizado` sem aprovação manual em `/borderos`. Anteparo humano contra QUALQUER um dos findings. Tactic Bass: **Quarantine** (soft).
5. **Composição pura sobre serviços existentes** — 0 mudanças em `ConexosClient`, 0 reimplementação de handshake ERP, 0 novas escritas. Lote service = 166 LOC, fan-out 5, fan-in 2, 0 magic numbers. Tactic Bass: **Encapsulate** + **Use an Intermediary**. Score Integrability 8.0 e Modifiability 7.5 ancoram nisso.
6. **Testabilidade exemplar do serviço** — 100% linhas, 80.76% branches, DI por constructor, deps mockados como objetos planos, clock injetado, 0 não-determinismo. 5/5 cenários do `statusDoAdto` exercidos. Suite verde em 1.3s. Tactic Bass: **Specialized Interfaces** + **Limit Non-Determinism**.
7. **Authz e rate-limit corretos por padrão** — `requireRole('admin')` + `heavyRouteLimiter` (10/min/IP) + Zod no body + `executadoPor` derivado do JWT (não do corpo). Testes de rota cobrem 401/403. Tactic Bass: **Authorize Actors** + **Limit Access**.
8. **Deploy aditivo e backward-compatible** — rota nova, sem env var nova, sem migração, sem alteração de contrato existente. Risco de deploy ≈ 0. Tactic Bass: **Idempotent deploys**.

## 7. Limitações da análise

Métricas declaradas explicitamente como não-medíveis localmente pelos agents:

- **Latência real por chamada Conexos** (qa-performance): nenhum `duration_ms` instrumentado no `ConexosClient`. Banda 300ms p50 / 1500ms p95 usada nas projeções é literatura defensável, não medição. Pré-requisito para qualquer decisão de paralelismo/deadline ser baseada em número (resolver com performance-3).
- **Janela exata do proxy Render para HTTP de longa duração** (qa-availability, qa-performance): nenhum `render.yaml` declarando `httpTimeout`. Estimativa 100–300s baseada em documentação genérica. Sem 1 run real cronometrada em prod, o `LOTE_DEADLINE_MS` (availability-1) e a banda projetada (performance-1) são chutes.
- **Duração real do lote em prod (p50/p95/p99)** (qa-availability, qa-performance): requer cronometragem real ou query CloudWatch-equivalente no log do Render.
- **Presença/ausência de execuções `reconciling` órfãs em prod** (qa-fault-tolerance): requer query ad-hoc no Postgres prod (`SELECT count(*) FROM permuta_alocacao_execucao WHERE status='reconciling' AND atualizado_em < now()-interval '30 min'`).
- **Lead time real commit→prd, taxa de sucesso de deploy histórica, MTTR de rollback** (qa-deployability): depende de logs Render/Vercel.
- **Alertas no sink de log, contagem real de borderôs criados por execução em prd** (qa-security): não há sink agregador hoje.

O que o pipe **não** cobre:
- Chaos engineering (Conexos derrubado em vários pontos da iteração).
- Threat modeling formal (STRIDE/DREAD) para a ação "Executar todas".
- Custo cloud detalhado (Render/Vercel/Supabase atual; impacto financeiro do estado-alvo AWS).
- UX/Acessibilidade do diálogo de confirmação além das duas notas DesignSystemReviewer não-bloqueantes.
- Carga real com N=80, 200 — projeções aqui são extrapolação linear.

Janela temporal: este é um snapshot do dia 2026-06-25. Recomendado refazer o gate quando:
- N de automáticas elegíveis passar de ~50 (banda projetada começa a quebrar);
- Volume de uso passar de ~30 lotes/mês (audit trail tabular vira essencial);
- 3+ analistas operarem em paralelo (Idempotency-Key vira P0 funcional);
- Frente SISPAG ou GED nascer (revalida CC-3 drift FE↔BE com SISPAGRemessaResult, etc.).

Cards copiados verbatim no KANBAN.md — sem renomeações ou edições de coerência.

## 8. Ações recomendadas

Em ordem de execução para os próximos 30 dias:

1. **Pré-deploy (sprint 0, ≤2 dias):** `security-1` (cap server-side) + `deployability-1` (kill-switch via env var) + `deployability-3` (runbook). São os 2 controles que precisam estar em prd antes da primeira execução real do lote. O resto pode esperar a primeira semana de operação.

2. **Sprint 1 — Quick wins de hardening (≤5 dias):** `performance-3` (telemetria `duration_ms` — pré-requisito de tudo), `availability-2` + `fault-tolerance-2` (Idempotency-Key — espelhar `/eleicao`), `availability-4` (AbortController), `performance-4` (deadline + listener), `security-2` (typed-text), `integrability-1` + `integrability-2` (contract test — fecha CC-3 minimamente).

3. **Sprint 2 — Cross-cutting findings (≤10 dias):** `fault-tolerance-1` + `fault-tolerance-3` (guard de re-POST + reaper — fecha R-1/R-6), `security-4` (audit trail tabular, combinar com `availability-3` em um único card), `integrability-4` (log per-adto taxonomizado), `deployability-4` (evento `permutas.lote.executado`).

4. **Sprint 3 (após primeira run real cronometrada em prd):** decidir entre `availability-1` (SSE como transição) e `performance-1` (job assíncrono completo). A decisão depende da banda real medida — se p95 < 60s, SSE basta por 3–6 meses; se > 100s, vai direto para o job assíncrono.

5. **Backlog de longo prazo:** `modifiability-2` (quebrar `page.tsx`) — esperar até SISPAG ou GED estarem prontas para amortizar o refactor. `security-3` (alertas 401/403/429) — depende da decisão do sink de log (fora do escopo desta feature).
