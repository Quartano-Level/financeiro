---
type: regis-review-report
run_id: 2026-07-18-1618-sispag-frente-ii
generated_at: 2026-07-18T18:30:00Z
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
scope: SISPAG (Frente II) — backend + frontend
total_cards_source: 55
total_cards_unique_after_merge: 53
total_p0: 1
total_p1: 19
total_p2: 25
total_p3: 8
overall_score: 6.9
weights: { security: 1.5, fault_tolerance: 1.3, availability: 1.2, modifiability: 1.2, testability: 1.0, performance: 1.0, integrability: 0.9, deployability: 0.9 }
posture_gate: "READ-ONLY em prod (I1). Write toolboxes (fin015 remessa + fin052/carregar RET) DORMENTES. Nenhum risco listado como P0/P1 pressupõe que Fatia 3 já está ativa; vários deles VIRAM P0 no dia da ativação."
---

# Regis-Review — SISPAG (Frente II) — 2026-07-18-1618-sispag-frente-ii

## Contexto operacional (leia antes)

- **SISPAG hoje é READ-ONLY em produção (I1).** O painel monta lotes localmente contra a carteira `titulo_a_pagar` (ingerida do Conexos `fin064`), consulta `fin015` para lotes/borderôs e `fin052` para arquivos `.RET`. **Nada** escreve no ERP em runtime.
- **As ferramentas de escrita EXISTEM e estão testadas em HML mas DORMENTES**: `ConexosSispagWriteClient` (fin015: criar lote, importar títulos, gerar remessa `.REM`) tem **0 callers no request path de prod**; `RetornoOrquestracaoService` (fin052 `carregarArquivoRetorno` + baixa) é um esqueleto com 198 LOC / 0% coverage / 5 TODOs (advisory lock, ledger, status BAIXADO, reader Nexxera). O único gate hoje é **convenção + comentário no código**, não mecânico.
- **Fatia 3 = ativar escrita + retorno automático** após reunião com a analista financeira. Muitos dos P1s deste relatório são **defensivos**: o risco material só materializa quando Fatia 3 acorda. A única exceção — o único **P0 estrutural hoje** — é a migração `0030_remove_internacional.sql`.

O relatório abaixo foi construído com uma única pergunta como bússola: **o que precisa ser verdade antes de a Fatia 3 escrever no fin015/fin010 em produção?**

---

## 1. Executive scorecard

Pesos aplicados (domínio financeiro que move dinheiro, multi-tenant SaaSo em construção): Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 · Testability 1.0 · Performance 1.0 · Integrability 0.9 · Deployability 0.9 (peso total 9.0).

| QA | Score (0–10) | P0 | P1 | P2 | P3 | Top finding |
|---|---:|---:|---:|---:|---:|---|
| Availability | 7.0 | 0 | 0 | 3 | 2 | F-availability-1: 11/11 reads Conexos são single-page (`listGenericPaginated`, sem walker `paginate`); truncagem silenciosa possível em `fin015`/`fin010`/`com298`. |
| Deployability | 6.0 | 0 | 2 | 4 | 1 | F-deployability-1: migração 0030 é forward-only destrutiva (DELETE + DROP COLUMN) sem par de rollback, sem snapshot pré-deploy — MTTR de rollback pós-cutover mede em horas. |
| Integrability | 8.0 | 0 | 2 | 3 | 1 | F-integrability-2: `NexxeraRetornoReader` é `TODO(Ricardo/comercial)` — bloqueia toda a perna de retorno automático da Fatia 3. |
| Modifiability | 7.0 | 0 | 2 | 3 | 2 | F-modifiability-1: `app/sispag/page.tsx` é god-component (832 LOC, 5 tabs, 15 useStates, 0 testes). |
| Performance | 6.0 | 0 | 4 | 1 | 2 | F-performance-4: nenhum timeout explícito em nenhum outbound Conexos — 1 blip de ERP satura o pool DB (max=5) e derruba SISPAG inteiro. |
| Fault Tolerance | 7.5 | 1 | 3 | 4 | 0 | F-fault-tolerance-1 (**P0**): migração 0030 sem env-gate — rodada contra base errada é irrecuperável (sem PITR). |
| Security | 7.0 | 0 | 3 | 4 | 1 | F-security-2: `ConexosSispagWriteClient` e `carregarArquivoRetorno` sem gate mecânico — 1 linha esquecida numa feature futura dispara `.REM` real no banco. |
| Testability | 6.0 | 0 | 3 | 4 | 0 | F-testability-1: frontend SISPAG (~1.834 LOC) sem NENHUM teste. |
| **Overall** | **6.9** | **1** | **19** | **25** | **8** | (contagem única após 2 merges — 55 → 53) |

Interpretação:
- 0–3: risco estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- **7–8: saudável com oportunidades pontuais**
- 9–10: estado-da-arte para o estágio atual

**Leitura executiva.** O 6.9 agregado esconde uma distribuição bimodal saudável: **Integrability 8** e **Fault Tolerance 7.5** refletem que a doutrina "Ferramenta vs. Fluxo" (writes dormentes, `postGenericOnce`/`postMultipartOnce`, Zod nos boundaries dos reads, optimistic + advisory locks, state-machine tipada) foi bem executada. **Testability 6** e **Performance 6** puxam o score para baixo por gaps concentrados nas camadas **frontend** e **outbound Conexos** (timeouts + cache), que são exatamente onde a Fatia 3 vai adicionar carga.

---

## 2. Top 10 risks (cross-QA)

Ranking por severidade × leverage (quantos QAs o risco atinge) × impacto de negócio ao ativar Fatia 3.

### R-1: Migração `0030_remove_internacional.sql` é destrutiva sem gate de ambiente, sem transação atômica, sem snapshot obrigatório

- **QA(s) afetados**: Fault Tolerance (P0), Deployability (P1), Modifiability
- **Findings de origem**: F-fault-tolerance-1 (`migrations/0030_remove_internacional.sql:15-35`), F-deployability-1 (mesmo arquivo), F-deployability-2 (`runMigrations.ts:44-50`)
- **Evidência sintetizada**: `DELETE FROM titulo_a_pagar/lote_pagamento_item WHERE internacional=TRUE` + `DROP COLUMN internacional` em 2 tabelas. Único guard é `IF EXISTS`; nenhum `IF current_database() IN (...)`; runner não envolve o arquivo em `withTransaction` — se o DDL falhar após o DML, o DB fica meio-migrado sem row em `schema_migrations`. Sem PITR configurado no Supavisor.
- **Impacto técnico**: rollback do binário via Render "Rollback" restaura o código pré-0030, mas o schema continua sem a coluna → SISPAG cai em `column "internacional" does not exist` no primeiro request. Perda irreversível de trilha de auditoria dos títulos internacionais.
- **Impacto de negócio**: incidente pós-0.17.4 força DBA a fazer `pg_restore` + re-ingestão + reconciliação manual com analista. MTTR sai de "5 min (rollback Render)" para **horas**. Se algum dia rodar contra base errada (staging apontando prod), perda é permanente e afeta relatório contábil histórico.
- **Card(s) Kanban relacionados**: fault-tolerance-1 (P0, esforço S), deployability-1 (P1, esforço M), deployability-2 (P1, esforço S)
- **Custo de inação em 6 meses**: assumindo taxa histórica de 1 rollback/6 releases (baseline de release cadence: 6 releases em 8 dias — v0.16.1 → v0.17.6), a probabilidade de um rollback tocar a janela pós-0030 é ~100% dentro do trimestre. Custo esperado por incidente: 4-8h de DBA + 2-4h de analista para reconstruir lotes em rascunho. **Este é o único P0 estrutural HOJE** — todos os outros P0s do relatório são condicionais à ativação da Fatia 3.

### R-2: Toolboxes de escrita SISPAG (`fin015` + `fin052/carregar`) sem gate mecânico — 1 wire distraído dispara pagamento real

- **QA(s) afetados**: Security (P1), Fault Tolerance, Integrability, Availability (F-4 análoga)
- **Findings de origem**: F-security-2 (`ConexosSispagWriteClient.ts:52-56` — o próprio código admite "NÃO é gated internamente"), F-security-3 (`carregarArquivoRetorno` sem validação de tamanho/MIME/CNAB), F-fault-tolerance-3 (retorno service sem ledger/lock/status BAIXADO)
- **Evidência sintetizada**: 0/3 toolboxes têm gate interno; 0 testes ratchet reprovam wire sem checar `env.conexosWriteEnabled`. `postGenericOnce` + `postMultipartOnce` disparam sobre o ERP real assim que qualquer service novo resolver o client via tsyringe. A doutrina "Ferramenta vs. Fluxo" é excelente como convenção mas frágil como controle.
- **Impacto técnico**: `.REM` CNAB 240 disparado para Nexxera sem consentimento; `postMultipartOnce` é não-idempotente — não dá para desfazer chamando de novo.
- **Impacto de negócio**: banco pode debitar a conta corporativa da Columbia antes de qualquer detecção. Risco jurídico de pagamento indevido + reconciliação manual com tesouraria + carta de retratação ao fornecedor. Este é **o risco #1 na hora de acordar a Fatia 3**.
- **Card(s) Kanban relacionados**: security-2 (P1, M), security-3 (P1, S), fault-tolerance-3 (P1 dormant → **P0 no dia do wire**, L), fault-tolerance-6 (P2, S — endurece `SUCESSO_SCHEMA`)
- **Custo de inação em 6 meses**: 0 se a Fatia 3 não acordar. Se acordar sem esses cards: probabilidade não-nula de 1 `.REM` real disparado por wire descuidado. Custo esperado por incidente: R$ dezenas a centenas de milhares (valor de 1 remessa) + horas de tesouraria + risco reputacional.

### R-3: Retorno automático (`RetornoOrquestracaoService`) sem ledger idempotente + advisory lock + status BAIXADO — dupla baixa possível

- **QA(s) afetados**: Fault Tolerance (P1, dormant→P0), Availability, Integrability, Security
- **Findings de origem**: F-fault-tolerance-3 (`RetornoOrquestracaoService.ts:82,121,167` — 4 TODOs explícitos), F-availability-4 (mesma raiz — advisory lock ausente + ledger ausente), F-integrability-1 (`ConexosSispagRetornoClient` sem Zod nos 5 map fns — drift do fin052 vira `NaN` silencioso)
- **Evidência sintetizada**: `carregarArquivoRetorno` já usa `postMultipartOnce` (correto), mas **não há** tabela `retorno_execucao` com `UNIQUE(idempotency_key)` (hash do `.RET`). Reprocessar o mesmo arquivo (reader re-lista após crash pós-upload) executa 2× no ERP → baixa duplicada no `fin010`.
- **Impacto técnico**: duplo processamento de `.RET`; dupla baixa contra o mesmo título; sem forma automática de detectar (sem job de reconciliação — R-8).
- **Impacto de negócio**: baixa duplicada = título aparece 2× no extrato contábil; reconciliação manual semanal com tesouraria + risco de o financeiro pagar em dobro se o banco não deduplicar pelo `seqNum`. Espelhar padrão de `PermutaExecucaoRepository` (que já resolveu o problema análogo em Permutas).
- **Card(s) Kanban relacionados**: fault-tolerance-3 (L) — inclui availability-4 (merged), integrability-1 (S), integrability-2 (M — Nexxera reader, R-9)
- **Custo de inação em 6 meses**: 0 enquanto dormente. Ao acordar sem este trabalho: se poller rodar com 2 réplicas ou 1 restart mid-upload, 1 baixa duplicada por semana é plausível. Reconciliação manual: 2-4h/incidente + risco de crédito de terceiros.

### R-4: Nenhum timeout explícito em outbound Conexos — 1 blip de ERP satura o pool DB e derruba o SISPAG inteiro

- **QA(s) afetados**: Availability (P3), Performance (P1), Fault Tolerance (P2)
- **Findings de origem**: F-availability-6 (`services/conexos.ts:116` — timeout hardcoded 40s, sem knob), F-performance-4 (mesma raiz — `RetryExecutor` limita retries, não latência), F-fault-tolerance-7 (POSTs em `ConexosSispagWriteClient` sem timeout, herdam default axios = ∞)
- **Evidência sintetizada**: `axios.create({ timeout: 40000 })` no legacy; POSTs multipart (`.RET`) herdam default (sem timeout). Pior caso: 40s × 3 tentativas = 90s de bloqueio por request; multiplicar por 5 requests concorrentes em `montarPainel` → pool pg (max=5) empatado → starvation. **Idêntico ao P1 já conhecido em Permutas "Executar Lote"**.
- **Impacto técnico**: blip Conexos que dure 30-60s deixa SISPAG "travado" para todos os analistas simultaneamente; Render retorna 504.
- **Impacto de negócio**: durante o pico das 08h, quando o painel é aberto mais vezes, um único blip vira "SISPAG não abre" na percepção do usuário.
- **Card(s) Kanban relacionados**: **xqa-conexos-timeout** (P1, S — merged de performance-3 + fault-tolerance-7), availability-5 (P3, S — inclui timeout parametrizável + `/health/deep`)
- **Custo de inação em 6 meses**: precedente do "Executar Lote" já materializou este risco em Permutas. Prazo esperado até primeira reprise: <90 dias.

### R-5: Trilha de auditoria SISPAG só existe em `stdout` do Render — nem forensics, nem compliance sobrevivem

- **QA(s) afetados**: Security (P1), Fault Tolerance (P2), Integrability, Modifiability
- **Findings de origem**: F-security-1 (2/8 tipos de mutação persistem `ator`), F-security-5 (dados sensíveis `banco`/`conta`/`docCod`/`titCod` em stdout sem redação), F-fault-tolerance-5 (`this.audit(...)` roda **fora** do `withTransaction` das mutações — dual-write não-atômico)
- **Evidência sintetizada**: `LotePagamentoService.audit()` (`ts:394-404`) chama `LogService.info` para 6 tipos de transição (reabrir, cancelar, marcarRetorno, atualizarConta, atualizarModalidade, incluir/remover item). Persistido em tabela: só `criado_por` + `finalizado_por` na raiz do lote. `redactBody` cobre `password/token/secret` no request logger, mas **não** os logs de negócio.
- **Impacto técnico**: perícia forense pós-incidente ("quem trocou a conta pagadora do LT-42 duas horas antes de finalizar?") só existe enquanto o drain estiver quente. Número de conta corporativa em drain externo = superfície de social engineering.
- **Impacto de negócio**: contradiz requisito não-negociável da proposta comercial ("trilha persistida por ação, atribuída ao usuário") e não sobrevive a auditoria externa/SOX-lite. Em multi-tenant, exposição de conta corrente corporativa em drain compartilhado = incidente LGPD.
- **Card(s) Kanban relacionados**: security-1 (P1, M), security-5 (P2, S), fault-tolerance-5 (P2, M — chamar `audit()` dentro da `tx`)
- **Custo de inação em 6 meses**: se auditoria externa acontecer (bem provável no rollout do 2º cliente SaaSo), o gap é blocker de contrato. Custo de retrofit sob pressão = 3-5× o esforço proativo.

### R-6: Painel SISPAG sem cache + expansão de card faz N+1 em `fin064` — pico das 08h castiga UX e ERP

- **QA(s) afetados**: Performance (P1×2), Availability (F-2 relacionado)
- **Findings de origem**: F-performance-1 (`modalidadesDisponiveisDoLote` — K chamadas por expansão, K ≤ 25, sem memo cliente-side), F-performance-2 (`GET /sispag/painel` reconstrói tudo a cada F5 — 1+N chamadas Conexos), F-performance-3 (`listRetornos` — 24 chamadas por hit com 8 filiais × 2 configs)
- **Evidência sintetizada**: 5 analistas abrindo `/sispag` simultaneamente = 40 leituras `fin015/list` em ~10s (perto do teto do pool Conexos `MAX_SESSIONS`). Expansão de UM card = 3-14s no p95 realista.
- **Impacto técnico**: sem cache, saturação linear com número de analistas simultâneos. Cross-liga com R-4.
- **Impacto de negócio**: analista abandona lotes maiores; percepção de "sistema lento" atrasa reconciliação.
- **Card(s) Kanban relacionados**: performance-1 (P1, M — batch/memo), performance-2 (P1, S — cache TTL 30-60s no painel), performance-4 (P1, S — cache 1h em `ger015` + 30s em arquivos retorno)
- **Custo de inação em 6 meses**: baixo hoje (1-2 analistas ativos). Materializa forte no cenário "Fatia 3 + expansão para 5-8 analistas".

### R-7: Frontend SISPAG (~1.834 LOC) sem NENHUM teste + `page.tsx` é god-component de 832 LOC

- **QA(s) afetados**: Testability (P1), Modifiability (P1), Availability (indireto — regressão UX)
- **Findings de origem**: F-testability-1 (0 test files / 5 sources), F-modifiability-1 (`page.tsx` — 832 LOC, 15 useStates, 5 tabs, 4 `useTabelaFiltro`, imports=20), F-modifiability-5 (mesma dor), F-testability-8 (mesma dor)
- **Evidência sintetizada**: `SispagPanel` orquestra ingestão, formação, montagem, transições, leitura de retornos, 3 sistemas de filtro paralelos e 5 tabs — tudo num único componente client. Sem testes, qualquer refactor é 100% manual em dev tenant.
- **Impacto técnico**: cada `/feature-tweak` SISPAG-frontend gasta ~30-40% do tempo neste arquivo; PRs conflitam; ~1d de release cycle a mais por mudança.
- **Impacto de negócio**: Fatia 3 vai adicionar UI de "baixa manual" + "edição de modalidade inline" + tela de RET; sem split + testes o arquivo cresce para 1.100+ LOC e vira intratável.
- **Card(s) Kanban relacionados**: testability-1 (P1, M — split + smoke tests + floor de cobertura), modifiability-1 (P1, L — split completo por tab), modifiability-5 (P2, M — habilitador de tests), modifiability-6 (P3, S — setState-in-effect warnings)
- **Custo de inação em 6 meses**: bloqueio efetivo do throughput da Fatia 3 UI.

### R-8: Reconciliação DB↔Conexos ausente + reaper de `pagamento_ingestao_run` órfã ausente = drift silencioso na carteira

- **QA(s) afetados**: Fault Tolerance (P1×2), Availability, Integrability
- **Findings de origem**: F-fault-tolerance-8 (nenhum job de reconciliação — janela de drift até 24h), F-fault-tolerance-2 (`pagamento_ingestao_run` fica "running" para sempre se container cai mid-run), F-availability-3 (cron ainda não amarrado + sem heartbeat de staleness)
- **Evidência sintetizada**: única sanity DB↔ERP é a re-leitura em `LotePagamentoService.incluirTitulo` (I2 autoritativa — bom, mas só no momento da inclusão). Título pago externamente (fin010 manual) fica na carteira `pago=false` até próxima ingestão bem-sucedida por filial.
- **Impacto técnico**: analista pode montar lote com título já pago fora do SISPAG; I2 pega no `incluirTitulo`, mas KPIs/relatório mentem até a próxima ingestão.
- **Impacto de negócio**: percepção de "carteira desatualizada" corrói confiança no produto.
- **Card(s) Kanban relacionados**: fault-tolerance-8 (P1, M — job reconcile horário), fault-tolerance-2 (P1, S — reaper), availability-3 (P2, S — wire cron + `/health/sispag`)
- **Custo de inação em 6 meses**: enquanto base é 1 analista + baixa cadência, custo é reputacional. Ao entrar em regime, torna-se blocker de adoção.

### R-9: `NexxeraRetornoReader` (SharePoint / pasta) é `TODO(Ricardo/comercial)` — bloqueio material da perna de retorno automático

- **QA(s) afetados**: Integrability (P1)
- **Findings de origem**: F-integrability-2 (`RetornoOrquestracaoService.ts:195 → listarRetNaPasta returns []`, 0 clients Nexxera, 0 SSM path)
- **Evidência sintetizada**: toda a doutrina de irreversible-write, `postMultipartOnce`, ledger idempotente (quando existir — R-3) e advisory lock (`RETORNO_POLLER_LOCK_KEY`) já está montada, **mas o input não chega**. Path, protocolo (SMB / MS Graph / HTTP), credenciais — tudo pendente de descoberta pelo Ricardo (comercial).
- **Impacto técnico**: perna de retorno automático não sai do dormant. Baixa continua manual pelo analista no fin052.
- **Impacto de negócio**: ROI da automação diferido até descoberta do transporte.
- **Card(s) Kanban relacionados**: integrability-2 (P1, M — `/feature-new nexxera` + client + fixture HML)
- **Custo de inação em 6 meses**: 100% do valor da Fatia 3 retorno indefinidamente adiado.

### R-10: Reads Conexos SISPAG são single-page (`listGenericPaginated`) + paginação client-side ilimitada — degradação silenciosa em 6-12 meses

- **QA(s) afetados**: Availability (P2), Performance (P2×2)
- **Findings de origem**: F-availability-1 (11/11 reads single-page — 0/11 usam walker `paginate`), F-performance-5 (`LotePagamentoRepository.listLotes` sem `LIMIT`), F-performance-6 (FE pagina em memória via `useTabelaFiltro`), F-performance-8 (`com298 pageSize=5000` sem `paginate()` — cap silencioso)
- **Evidência sintetizada**: `pageSize` varia de 100 (`listLotes`) a 5000 (`listExteriorDocCods`) sem walker completo; `ConexosBaseClient.paginate` (linhas 238-296) existe e é usado por Permutas, mas SISPAG nunca o adotou. Payload do `/sispag/lotes` cresce monotonicamente com histórico.
- **Impacto técnico**: filial com >100 lotes históricos em `fin015` tem rows silenciosamente descartadas — sem `onCapHit`, sem WARN, sem métrica.
- **Impacto de negócio**: analista pode julgar "não há mais lotes pendentes" quando existem. Baixo hoje (base pequena), mas **bloqueia Fatia 3** (baixa/remessa vai depender de `listLotes` retornar tudo).
- **Card(s) Kanban relacionados**: availability-1 (P2, M — trocar 5 reads críticos por `paginate` com `onCapHit`), performance-5 (P2, M — LIMIT/OFFSET server-side), performance-7 (P3, S — trocar `com298` por `paginate` com log)
- **Custo de inação em 6 meses**: crescimento linear silencioso. Materializa em 12-18 meses.

---

## 3. Cross-cutting findings

Sete causas-raiz recorrem em múltiplos QAs. Endereçá-las tem alavanca desproporcional.

### CC-1: **Timeout ausente em outbound Conexos** (mesmo card sob 3 ângulos)

- **Aparece em**: Availability (F-6), Performance (F-4), Fault Tolerance (F-7)
- **Diagnóstico unificado**: `services/conexos.ts` tem `timeout: 40000` fixo; `postGenericOnce`/`postMultipartOnce` herdam o default do axios (∞) porque o adapter legacy roda numa `axios.create` diferente. O `RetryExecutor` limita tentativas mas não latência total. Consequência: pool DB (max=5) empata em qualquer blip Conexos.
- **Recomendação consolidada**: **1 card único** (`performance-3` + `fault-tolerance-7` são o MESMO card → merged como `xqa-conexos-timeout`) — adicionar `timeout: 10_000` no `axios.create` do `services/conexos.ts` (afeta tudo) + parametrizar via `CONEXOS_HTTP_TIMEOUT_MS` no `EnvironmentProvider`. Complementa `availability-5` (que adiciona `/health/deep`). Esforço S, mata R-4 inteiro.

### CC-2: **Migração 0030 destrutiva** (compõe Rollback + Recovery)

- **Aparece em**: Deployability (F-1, F-2), Fault Tolerance (F-1, P0)
- **Diagnóstico unificado**: 3 fatores compostos — (i) forward-only sem par de rollback, (ii) runner (`runMigrations.ts:44-50`) não usa `withTransaction`, (iii) sem env-gate protegendo contra rodar na base errada.
- **Recomendação consolidada**: **3 cards complementares que devem entrar juntos**: fault-tolerance-1 (env-gate `IF current_database() IN (...)`), deployability-2 (envolver runner em `withTransaction`), deployability-1 (política de snapshot pré-deploy + runbook `migracao-destrutiva-recuperacao.md`). Total: S + S + M. Este é o **único P0 estrutural** — deveria ser sprint 1 pós-aprovação.

### CC-3: **Write-toolbox activation readiness — "o que precisa ser verdade antes de Fatia 3 escrever"**

- **Aparece em**: Security (F-2, F-3), Fault Tolerance (F-3, F-6), Integrability (F-1, F-2), Availability (F-4)
- **Diagnóstico unificado**: SISPAG hoje é I1 (read-only). A doutrina "Ferramenta vs. Fluxo" isolou bem os writes dormentes, mas o gate é *convenção* — não mecânico. Ao acordar Fatia 3, 7 findings viram materiais simultaneamente: (a) sem gate interno nas toolboxes (security-2), (b) sem validação do `.RET` antes do upload (security-3), (c) sem ledger `retorno_execucao` (fault-tolerance-3), (d) `SUCESSO_SCHEMA` aceita `{}` como válido (fault-tolerance-6), (e) `ConexosSispagRetornoClient` sem Zod nos 5 map fns (integrability-1), (f) sem Nexxera reader (integrability-2), (g) sem advisory lock no poller (availability-4 → merged).
- **Recomendação consolidada**: **checklist Fatia 3** — antes de qualquer `CONEXOS_WRITE_ENABLED=true`, todos os 7 cards acima verdes. Publicar em `docs/runbooks/sispag/fatia-3-fin015-cutover.md` (parte do card deployability-6). Ordem sugerida: security-2 (gate mecânico) → integrability-1 (Zod retorno) → fault-tolerance-3 (ledger + lock + BAIXADO) → security-3 (validação upload) → fault-tolerance-6 (SUCESSO_SCHEMA duro) → integrability-2 (Nexxera reader) → wire.

### CC-4: **Trilha de auditoria só em `stdout`** (Security + Fault Tolerance + observabilidade financeira)

- **Aparece em**: Security (F-1, F-5), Fault Tolerance (F-5)
- **Diagnóstico unificado**: A mesma raiz — `LotePagamentoService.audit()` grava `LogService.info` (stdout) em vez de `sispag_audit_log`; o call site roda FORA da `withTransaction` da mutação; e o payload leva `banco`/`conta`/`docCod`/`titCod` sem redação.
- **Recomendação consolidada**: **1 card unificado** (security-1 é o pai) — criar migration `sispag_audit_log(id, lote_id, acao, ator, ocorrido_em, detalhes JSONB, request_id)`, refatorar `audit()` para aceitar `tx?: TransactionClient` e ser chamado DENTRO do `withTransaction`, aplicar `redactBusinessLog` no `data:{}`. Resolve os 3 findings de uma vez. Esforço M.

### CC-5: **Frontend SISPAG god-component sem testes** (Testability + Modifiability)

- **Aparece em**: Testability (F-1, F-8), Modifiability (F-1, F-5, F-6)
- **Diagnóstico unificado**: `page.tsx` (832 LOC, 15 useStates, 5 tabs) + `lib/sispag.ts` (339 LOC, 9 fetches sem Zod) + 0 testes = refactor às cegas + PR-hotspot. Todos os 5 findings apontam para a mesma pilha.
- **Recomendação consolidada**: sequência obrigatória — (1) testability-1 primeiro (smoke tests + split em 3 subcomponentes) → (2) modifiability-1 (split completo por tab) → (3) modifiability-6 cai naturalmente. Sem (1), (2) é reversão às cegas. Cross-cutting bonus: integrability-5 (Zod no `lib/sispag.ts`) fecha o loop.

### CC-6: **Client-side pagination + reads unbounded** (dívida de escala)

- **Aparece em**: Availability (F-1), Performance (F-5, F-6, F-8)
- **Diagnóstico unificado**: nenhum read SISPAG usa o walker `paginate()`; nenhum endpoint tem `LIMIT/OFFSET`; FE pagina 100% em memória. Custo O(histórico total) por hit — hoje pequeno, cauda longa.
- **Recomendação consolidada**: 2 cards que aterrissam juntos — availability-1 (adotar `paginate()` com `onCapHit` nos 5 reads críticos) + performance-5 (LIMIT/OFFSET server-side em `listLotes` e `listArquivosRetorno`). Índice `lote_pagamento (fil_cod)` (performance-6) fica de brinde.

### CC-7: **Reads Conexos sem cache + fan-out ao vivo** (UX + carga no ERP)

- **Aparece em**: Performance (F-1, F-2, F-3), Availability (indireto — degradação percebida)
- **Diagnóstico unificado**: 3 endpoints (`/painel`, `/retornos`, `/modalidades-disponiveis`) fazem fan-out ao vivo sem qualquer camada de cache. `getFiliais` é o único cached (bom exemplo). `ger015` (metadado de layout) muda raríssimo — perfeitamente cacheável por 1h.
- **Recomendação consolidada**: 3 cards que compõem cascata — performance-2 (cache do painel TTL 30s, invalidar em mutações) + performance-4 (cache do listRetornos: 1h em `ger015` + 30s em arquivos) + performance-1 (batch/memo do N+1 modalidades). Esforço S + S + M. Junto com CC-1 (timeout) formam o pacote "Conexos-friendly" pré-Fatia 3.

---

## 4. Quick wins (≤5 dias úteis, esforço S, severidade ≥ P2)

Cards para defender como "sprint 1 pós-aprovação" — alta razão impacto/esforço.

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---:|---:|---|
| **fault-tolerance-1** | Fault Tolerance | S | **P0** | Env-gate em migrations destrutivas: 0/1 → 1/1. Rodar 0030 contra base errada vira exceção, não silêncio. |
| **deployability-2** | Deployability | S | P1 | `withTransaction` wrappando cada `.sql` no runner: 0/7 SISPAG → 7/7. Falha parcial deixa DB no estado pré-migração. |
| **integrability-1** | Integrability | S | P1 | Zod nos 5 map fns do `ConexosSispagRetornoClient` (fin052). Drift vira `undefined` (mapeamento gracioso), não `NaN` silencioso. Pré-requisito de Fatia 3. |
| **xqa-conexos-timeout** (merge performance-3 + fault-tolerance-7) | Performance / Fault Tolerance | S | P1 | `axios.create({ timeout: 10_000 })` no `services/conexos.ts` + parametrizar via env. Mata R-4 inteiro. |
| **performance-2** | Performance | S | P1 | Cache in-memory TTL 30-60s no `SispagPainelService.montarPainel` + invalidar em mutações. p95 painel de 3-5s → ≤ 200ms em cache warm. |
| **performance-4** | Performance | S | P1 | Cache do `listRetornos` (`ger015` TTL 1h; arquivos TTL 30s). 24 chamadas/hit → 0 em warm. |
| **security-3** | Security | S | P1 | Validação `.RET` antes do multipart upload: tamanho ≤5MB, `fileName` regex, header CNAB240 checado. Pré-requisito de Fatia 3. |
| **fault-tolerance-2** | Fault Tolerance | S | P1 | Reaper de `pagamento_ingestao_run` órfã (>30 min em `running` → `error`). Auditoria limpa; advisory lock zumbi tratado. |
| **testability-3** | Testability | S | P1 | `ClockProvider` + `IdProvider` injetáveis (@singleton). Testa fronteira "pagar hoje" (janela A5) com clock pinado. |
| **security-5** | Security | S | P2 | Estender `redactBody` com chaves financeiras (banco, conta, cnpj, cpf, pix, barCode). 6+ pontos com sensíveis em stdout → 0. |
| **security-6** | Security | S | P2 | `DEV_AUTH_BYPASS` crasha se `environment` vazio. Fecha janela de missetup do primeiro tenant multi. |
| **modifiability-3** | Modifiability | S | P2 | Refatorar `ConexosSispagRetornoClient.listDetalhe` (complexidade 36→≤15) + extrair `describeConexosValidation`. Antes de wire Fatia 3. |
| **availability-2** | Availability | S | P2 | `SispagPainelResponse.degradacao: { filiaisSemDados[] }` + banner no FE. Analista deixa de operar sobre KPI incompleto sem saber. |
| **availability-3** | Availability | S | P2 | Cron ingestão amarrado no `render.yaml` + `/health/sispag` que retorna 503 quando `ultimaRunEm > 30h`. |
| **integrability-3** | Integrability | S | P2 | Extrair `describeConexosValidation` para `ConexosBaseClient` — 27 LOC × 2 → 1 fonte de verdade. (Pode ser feito junto de modifiability-3.) |
| **testability-4** | Testability | S | P2 | `it.todo(...)` + esqueleto de teste para `RetornoOrquestracaoService`. Ao acordar Fatia 3, os `todo` aparecem no verbose e forçam cobertura. |
| **testability-6** | Testability | S | P2 | Capturar 6 fixtures HAR (fin064/fin015/fin052) e alimentar client tests. Drift do Conexos passa a quebrar CI, não prod. |
| **fault-tolerance-4** | Fault Tolerance | S | P2 | Frontend passa a emitir `Idempotency-Key` em `POST /sispag/ingestao`. |
| **fault-tolerance-6** | Fault Tolerance | S | P2 | Endurecer `SUCESSO_SCHEMA` (`valid` required + `.refine(o => o.valid === 'SUCESSO')`). Blocker Fatia 3. |

**Total do bloco quick-wins**: 19 cards, todos S, cobrem o **P0** + 10 dos 19 P1s + 8 dos P2s de maior alavanca. **Este é o pacote de defesa da reunião**.

---

## 5. Strategic moves (M / L / XL)

Cada linha "Por que vale" amarrada em número do `_shared-metrics.md` ou de métrica QA-específica.

| Card | QA(s) | Esforço | Tactic alvo (Bass) | Por que vale (métrica) |
|---|---|---:|---|---|
| **fault-tolerance-3** (inclui availability-4) | Fault Tolerance + Availability + Security | L | Idempotent Replay + Recovery Forward | Bloqueia Fatia 3 sem esta peça. Migration `retorno_execucao(UNIQUE idempotency_key)` + advisory lock + status BAIXADO. Sem isso, poller com 2 réplicas ou 1 restart mid-upload = **dupla baixa no fin010** (irreversível sem reconciliação manual). Baseline: 0 tabela ledger; alvo: 100% dos `.RET` protegidos por hash. |
| **modifiability-1** | Modifiability + Testability | L | Split Module + Increase Semantic Coherence | `page.tsx`: 832 LOC / 15 useStates / 5 tabs → ≤200 LOC shell + 5 tabs ≤250 LOC cada. Base para adicionar UI de baixa manual (Fatia 3) sem virar 1.100 LOC. Cada `/feature-tweak` gasta 30-40% do tempo neste arquivo hoje. |
| **security-1 + fault-tolerance-5** | Security + Fault Tolerance | M | Audit Trail (dentro de tx) | Persistir `sispag_audit_log` (2/8 → 8/8 transições rastreadas) chamando dentro do `withTransaction`. **Blocker de compliance** para 2º cliente SaaSo. Custo de retrofit sob auditoria = 3-5×. |
| **security-2** | Security + Fault Tolerance + Availability | M | Limit Exposure | Gate interno mecânico + teste ratchet PatternGuardian para os 3 write toolboxes. Toolboxes com gate: 0/3 → 3/3. Elimina a única linha de defesa contra "1 wire distraído dispara `.REM` real". |
| **performance-1** | Performance | M | Reduce Overhead + Multiple Copies of Computations | N+1 modalidades: `K` chamadas por expansão (K≤25) → 1 (batch `docCod#IN`) ou 0 (cache warm). p95 de expansão 3-5s → ≤1500ms. |
| **testability-1** | Testability + Modifiability | M | Specialized Interfaces + Limit Structural Complexity | Frontend SISPAG: 0 test files → ≥3; cobertura `app/sispag/` 0% → ≥40%. Habilitador OBRIGATÓRIO de modifiability-1. |
| **testability-2** | Testability | M | Specialized Interfaces (adapter HTTP) | `routes/sispag.ts` (14 endpoints, 361 LOC): 0 route tests → ≥14 smoke + 8 mapping. Cobertura ~0% → ≥70%. Regressão de mapping erro→HTTP (409 vs 500) deixa de ser silenciosa. |
| **modifiability-2** | Modifiability + Deployability | M | Defer Binding (config file) | 8 constantes de política hardcoded → `SispagPolicyProvider` em SSM. Cada ajuste hoje = release lockstep FE+BE. Alvo: 0 deploys por mudança de política. |
| **fault-tolerance-8** | Fault Tolerance + Integrability | M | Reconcile | Job horário `reconcile-carteira`. Janela de drift p95: até 24h → <1h. |
| **integrability-2** | Integrability | M | Discover Service | `/feature-new nexxera` — client + SSM path + fixture HML. **Bloqueio material** de ROI da automação. |
| **security-4** | Security | M | Limit Access + Authorize Actors | RBAC granular (`sispag:read`) + preparação multi-tenant. 0/6 rotas de leitura com RBAC → 6/6. Blocker de LGPD para 2º cliente SaaSo. |
| **security-8** | Security | M | Revoke Access | Denylist `revoked_tokens(jti)` server-side. Janela de exposição pós-revogação: TTL do JWT (horas) → <1min. |
| **deployability-1** | Deployability + Fault Tolerance | M | Rollback | Política snapshot pré-deploy + runbook. MTTR pós-destrutiva: horas → ≤30min. |
| **deployability-3** | Deployability | M | Feature Flag / Configuration Management | Flag runtime em vez de build-time. Cutover FE do SISPAG: 1-3min → ≤30s. |
| **deployability-4** | Deployability | M | Scale Rollouts (canary) | Preview environment para o analista validar mudanças SISPAG antes de prod. |
| **deployability-6** | Deployability | M | Script Deployment Commands | 4 runbooks SISPAG. Bus factor: 1 → 2+. |
| **testability-5** | Testability + Fault Tolerance | M | Sandbox | Integration tests contra Postgres real. Cobertura `LotePagamentoRepository` 70.66% → ≥88%. |

---

## 6. O que está bem (e por quê) — âncoras de credibilidade

1. **Doutrina "Ferramenta vs. Fluxo" (Bass: Limit Exposure)** — `ConexosSispagWriteClient` tem 0 callers no request path de prod; `RetornoOrquestracaoService.listarRetNaPasta` retorna `[]`. SISPAG é READ-ONLY por I1. Fatia 3 vai ligar switches, não desenhar arquitetura.
2. **Retry universal + fan-out limitado (Bass: Retry + Manage Resources)** — 11/11 reads via `runWithRetry`; `CONEXOS_FANOUT_LIMIT=4`. Escritas usam `postGenericOnce`/`postMultipartOnce` (sem retry cego) — 5/5 escritas irreversíveis Conexos aplicando a doutrina correta.
3. **State-machine tipada + optimistic lock (Bass: Sanity Checking + Comparison)** — `LotePagamentoService` implementa 6+ transições com `WHERE id=$id AND versao=$v AND status=ANY($de)`; 8 classes de erro tipadas.
4. **DI limpa + zero cross-layer violations (Bass: Restrict Dependencies)** — 47 anotações `@injectable/@singleton/@inject`; 0 imports cruzando `domain → routes/http`; 0 `process.env` cru em services; 0 uso de `axios/fetch` fora dos clients.
5. **Cobertura backend serviços/repos sólida (Bass: Executable Assertions)** — SISPAG isolado: 97 tests / **89.02% lines** / 3.22s de execução. `LotePagamentoService` 97.52%; `SispagPainelService` 98.94%; `IngestaoPagamentosService` 98.41%.
6. **Anti-drift na ingestão (Bass: Manage Resource Coupling)** — ingestão persiste apenas BÁSICO; DETAIL hidratado ao vivo no `getTituloAPagar` (I2 autoritativa).
7. **Rate limiting + advisory locks distintos (Bass: Limit Event Response)** — `heavyRouteLimiter` 10 req/min/IP em `/sispag/ingestao` e `/sispag/lotes/formar`; 3 chaves de advisory lock não-colidentes por processo.
8. **Zod nos boundaries dos reads (Bass: Adhere to Standards)** — 3 schemas em `ConexosSispagClient` com `passthrough()` + `.catch(default)` por campo — drift vira `undefined` gracioso, não crash.

---

## 7. Limitações da análise

**Métricas não medíveis localmente:**
- MTTR real (rollback, ingestão pós-crash, revogação JWT)
- Taxa de `LOGIN_ERROR_MAX_SESSIONS` no pool Conexos
- p50/p95/p99 real de `/sispag/painel`, `/sispag/lotes`, `/sispag/retornos`
- Taxa de conflitos `LoteVersaoConflitoError` em produção
- Cobertura efetiva de `routes/`, `jobs/`, `http/`, `app/sispag/` (floors ausentes)
- Janela real de drift DB↔Conexos por filial
- Tempo real de skew FE↔BE em release lockstep

**O que este pipe NÃO cobre:**
- Chaos engineering (SIGKILL, network partition) — recomendado pós-Fatia 3
- Threat modeling formal (STRIDE)
- Custo cloud (billing)
- UX / acessibilidade
- Contratos formais Nexxera (SLAs, layouts CNAB por banco)

**Discrepância detectada:** `fault-tolerance.md` frontmatter declara `cards_count: 7` mas §5 contém 8 cards (fault-tolerance-1 a fault-tolerance-8). Usei a contagem real (8). Total original: 55.

**Merges no KANBAN (transparência):**
- `performance-3` + `fault-tolerance-7` → **xqa-conexos-timeout** (mesmo card literal: adicionar timeout no axios). Baixa contagem de 55 para 54.
- `availability-4` ⊂ `fault-tolerance-3` (fault-tolerance-3 é superset — inclui advisory lock + ledger + status BAIXADO). Baixa contagem de 54 para 53.

**Janela temporal**: snapshot do dia 2026-07-18. Código é vivo — refazer trimestralmente, ou logo após ativação da Fatia 3.

---

## 8. Ações recomendadas — próximos 30 dias

1. **Sprint 1 (semana 1) — remediar o único P0 estrutural.** Entregar em uma única PR: fault-tolerance-1 (env-gate) + deployability-2 (transação no runner) + deployability-1 (política snapshot + runbook `migracao-destrutiva-recuperacao.md`). Bloqueia próxima migration destrutiva de sair sem gate. Esforço: S + S + M ≈ 3-4 dias.
2. **Sprint 1-2 — pacote "Conexos-friendly" pré-Fatia 3 (19 quick-wins da §4).** Ondas paralelizáveis: (i) **xqa-conexos-timeout** + performance-2 (cache painel) + performance-4 (cache retornos); (ii) fault-tolerance-2 (reaper) + availability-2 (sinalizar degradação) + availability-3 (wire cron + `/health/sispag`); (iii) security-3 (validação `.RET`) + security-5 (redação) + security-6 (fechar `DEV_AUTH_BYPASS`); (iv) testability-3 (Clock/IdProvider) + testability-4 (esqueleto RetornoOrquestracao) + testability-6 (fixtures HAR); (v) modifiability-3 + integrability-3 (refactors gêmeos). ~10-12 dias com 2 devs em paralelo.
3. **Sprint 3-4 — "checklist Fatia 3" (CC-3).** Antes de qualquer `CONEXOS_WRITE_ENABLED=true`: security-2 (gate mecânico + PatternGuardian ratchet, M) → integrability-1 (Zod retorno, S) → fault-tolerance-3 (ledger + lock + BAIXADO, L) → integrability-2 (`/feature-new nexxera`, M) → fault-tolerance-6 (SUCESSO_SCHEMA duro, S). Publicar `docs/runbooks/sispag/fatia-3-fin015-cutover.md`.
4. **Sprint 4-6 — habilitadores estruturais para escala.** testability-1 (frontend split + smoke tests, M) → modifiability-1 (split completo por tab, L) → security-1 + fault-tolerance-5 (audit log persistido, M) → testability-2 (route tests, M). Prepara terreno para 2º analista + 2º cliente SaaSo.
5. **Trilhas em background durante o trimestre**: fault-tolerance-8 (reconciliação, M), modifiability-2 (política em SSM, M), performance-5 (LIMIT/OFFSET, M), security-4 (RBAC granular, M), security-8 (denylist JWT, M), deployability-4 (canary, M).

**Nota executiva.** Dos 55 cards, **19 são S e cobrem o P0 + 10 dos 19 P1s** — o custo de "concordar em investir em code quality nesta janela" é mensurável em 2-3 semanas de esforço concentrado. **A resposta defensável para "vale a pena?" é: sim, e não é caro — o que é caro é fazer sob incidente de Fatia 3.**
