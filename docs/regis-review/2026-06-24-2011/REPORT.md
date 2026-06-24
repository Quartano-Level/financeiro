```markdown
---
type: regis-review-report
run_id: 2026-06-24-2011
generated_at: 2026-06-24T22:30:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
pr_under_review: v0.7.0 (feat permutas — sessão 2026-06-24) — PR #7, ainda NÃO mergeado em main
total_cards: 52
total_p0: 3
total_p1: 20
total_p2: 21
total_p3: 8
overall_score: 6.5
merge_readiness: BLOQUEADO — 3 P0 + 2 P1 críticos requerem remediação antes do merge
---

# Regis-Review — financeiro — PR v0.7.0 (run 2026-06-24-2011)

> Escopo: diff `main...HEAD` do PR #7 (v0.7.0) — feature Permutas: cliente-filtro, alocação N:M
> cross-process, auto-alocação no Baixar, reclassificação ultrapassa-invoice, universo completo de
> invoices na ingestão, cache local `permuta_bordero`, gestão viva de borderôs (ciclo finalizar/
> cancelar/estornar/excluir + `DELETE /trilha`), `GET /permutas/status` lazy.

## 1. Executive scorecard

Pesos aplicados (perfil financeiro / movimento de dinheiro multi-tenant SaaSo):
Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 · Testability 1.0 ·
Performance 1.0 · Integrability 0.9 · Deployability 0.9 (total = 9.0).

| QA | Score | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 7.0 | 0 | 1 | 3 | 2 | F-availability-2: `autoAlocar*` N writes sem transação, retorno `true` engana caller (meia-permuta) |
| Deployability | 7.5 | 0 | 2 | 2 | 2 | F-deployability-1: migrations multi-statement sem `BEGIN/COMMIT` — risco latente em DML |
| Integrability | 7.0 | 0 | 2 | 2 | 2 | F-integrability-1: Zod ausente nas 3 reads novas → NaN no cache |
| Modifiability | 5.5 | 0 | 3 | 3 | 1 | F-modifiability-1: `toPendente` complexidade 58 (max 15) |
| Performance | 5.0 | 0 | 2 | 4 | 1 | F-performance-1: regressão N+1 — 2390 chamadas com308/run (~65s ingestão) |
| Fault Tolerance | 6.5 | 1 | 5 | 1 | 0 | F-fault-tolerance-1: `removerDaTrilha` permite dupla-baixa se borderô segue válido |
| Security | 7.5 | 0 | 2 | 4 | 0 | F-security-1: 3 leituras novas sem `requireRole` → backlog financeiro vaza |
| Testability | 6.0 | 2 | 3 | 2 | 0 | F-testability-1: `autoAlocar*` (escrita real fin010) sem 1 teste direto |
| **Overall** | **6.5** | **3** | **20** | **21** | **8** | **52 cards** |

**Interpretação**: Performance 5.0 e Modifiability 5.5 caem em "dívida defensável — endereçar nesta
janela de planejamento". Overall 6.5 = saudável-com-gaps, mas riscos pontuais de severidade alta
concentrados em Fault Tolerance e Testability — exatamente os QAs com maior peso em sistema que
executa escritas que movem dinheiro.

## 2. Top 10 risks (cross-QA)

### R-1: Dupla-baixa real no `fin010` via `DELETE /borderos/:borCod/trilha`
- **QA(s) afetados**: Fault Tolerance (P0), Security (P1)
- **Findings de origem**: F-fault-tolerance-1 (`BorderoGestaoService.ts:199-212`), F-security-6 (`PermutaExecucaoRepository.ts:159-164`)
- **Evidência sintetizada**: `removerDaTrilha` faz `DELETE FROM permuta_alocacao_execucao WHERE bor_cod = $borCod` sem checar `borderoAindaValido` no ERP. Chave de idempotência é deletada (não renomeada) → próxima baixa do mesmo par cria CHAVE NOVA → novo borderô + nova baixa real no fin010 contra a mesma invoice.
- **Impacto técnico**: dupla-baixa concretizada no ERP. Borderô antigo continua válido. Lançamentos contábeis espelhados. NB: o BOTÃO FE foi removido nesta sessão; o ENDPOINT segue vivo (admin com curl ainda dispara).
- **Impacto de negócio**: distorção contábil direta, super-pagamento, retrabalho no Conexos pelo time financeiro. Material para constatação de fraude (sem audit trail durável após DELETE — F-security-6).
- **Cards**: `fault-tolerance-1` (S, P0), `security-2` (M, P1)
- **Custo de inação em 6 meses**: ≥1 incidente real (premissa: rota viva, admin/JWT vazado).

### R-2: Auto-alocação no Baixar grava meia-permuta sem teste de regressão
- **QA(s) afetados**: Testability (P0), Availability (P1), Fault Tolerance (P1)
- **Findings de origem**: F-testability-1, F-availability-2, F-fault-tolerance-3, F-fault-tolerance-4
- **Evidência sintetizada**: `AlocacaoPermutasService.autoAlocarSeElegivel` e `autoAlocarDeCasamento` (300-393, ~100 LOC) fazem for-loop sequencial SEM transação e SEM try/catch interno. Falha na 3ª de 5 = 2 alocações persistidas; método retorna `true` (`listAtivas().some()` acha alguma). `ReconciliacaoPermutaService` prossegue com baixa parcial. **Zero teste direto** — só mockados como `false`.
- **Impacto técnico**: alocação parcial silenciosa → baixa parcial real no fin010 → adto fica com saldo residual incorreto.
- **Impacto de negócio**: meia-permuta = ajuste contábil errado; conferência manual semanal detecta dias depois. Regra 2026-06-24 (Processar 1-click) será exercitada em volume.
- **Cards**: `testability-1` (S, P0), `availability-2` (M, P1), `fault-tolerance-3` (M, P1), `fault-tolerance-4` (M, P1)
- **Custo de inação em 6 meses**: 3–5 incidentes de meia-permuta (premissa: 1 hiccup Conexos/mês).

### R-3: Vazamento do backlog financeiro a qualquer JWT autenticado
- **QA(s) afetados**: Security (P1)
- **Findings de origem**: F-security-1
- **Evidência sintetizada**: `GET /permutas/borderos`, `GET /permutas/borderos/:borCod/baixas`, `GET /permutas/status` — 3 rotas novas sem `requireRole`. Devolvem `borCod`, `filCod`, `totalBaixado`, `criadoPor`, lista de baixas (`invoiceDocCod`, `adiantamentoDocCod`, `valorBaixado`, `juros`). Qualquer JWT Supabase default (`authenticated`) lê o backlog inteiro. Mutações vizinhas usam `requireRole('admin')` — leituras regrediram.
- **Impacto técnico**: read-only, mas exposição em 2 curls.
- **Impacto de negócio**: falha "least privilege" da proposta. Credencial vazada (estagiário, ex-funcionário) → extrai backlog sem rastro de privilégio escalado.
- **Cards**: `security-1` (S, P1)
- **Custo de inação em 6 meses**: 1 evento de credencial vazada/ano = baseline da indústria.

### R-4: Regressão de performance da ingestão (~65s) + índices ausentes
- **QA(s) afetados**: Performance (P1×2), Integrability (P3), Availability (P2)
- **Findings**: F-performance-1, F-performance-2, F-performance-5, F-integrability-6, F-availability-5
- **Evidência sintetizada**: Regra "universo COMPLETO" faz `EleicaoPermutasService.computeCandidatas` hidratar 1875 invoices via com308 — ~2390 chamadas/run, **~65s** (antes: ~250 chamadas, ~6s). `permuta_bordero` criada sem índice (ORDER BY = seq scan + sort). `permuta_alocacao_execucao(bor_cod)` sem índice parcial (287ms, cresce linear).
- **Impacto técnico**: ingestão estoura janela do cron; flerta `MAX_SESSIONS`. `/borderos` cold 0,83s (teto) → ≥1,5s em 6–12 meses.
- **Impacto de negócio**: percepção "tá lento" já apareceu (cenário Adriana pré-PR).
- **Cards**: `performance-1` (M, P1), `performance-2` (S, P1), `performance-4` (S, P2), `integrability-6` (M, P3)
- **Custo de inação em 6 meses**: ingestão a 100s+; retry storm na próxima vez que Conexos der hiccup em pico.

### R-5: Cache local de borderôs sem Zod (NaN cascade)
- **QA(s) afetados**: Integrability (P1×2), Security (P2), Fault Tolerance (P2)
- **Findings**: F-integrability-1, F-integrability-2, F-security-3
- **Evidência sintetizada**: `listBorderos`/`listBaixas`/`listInvoicesFinalizadas` mapeiam `Number(r.borCod)` sem Zod. `Number(null)` = 0; `Number(undefined)` = NaN. Writes irmãs já usam `BORDERO_CRIADO_SCHEMA` — incoerência simétrica. Truncamento silencioso em pageSize 200/1000 (sem `onCapHit`).
- **Impacto técnico**: NaN contamina `statusPorAdiantamento` (`Map.get(NaN)` → permuta nunca finalizada). `listBaixas` corrompido tenta DELETE de baixa inexistente. Truncamento esconde borderôs antigos >1000.
- **Impacto de negócio**: borderô "perdido" → analista lança duplicada → super-pagamento.
- **Cards**: `integrability-1` (S, P1), `integrability-2` (S, P1), `security-4` (S, P2), `availability-5` (S, P2)
- **Custo de inação em 6 meses**: cresce com volume; estimativa 6–12 meses para o teto de 1000.

### R-6: Modificabilidade dos serviços de permutas em queda livre
- **QA(s) afetados**: Modifiability (P1×3), Testability (herdado)
- **Findings**: F-modifiability-1, 2, 5, 7
- **Evidência sintetizada**: `toPendente` complexidade cognitiva **58** (4× o teto). `exporGestao` 28. `BorderoGestaoService` virou deus-painel: 527 LOC, 9 métodos, 4 responsabilidades. `page.tsx` **2562 LOC** (+404 no PR, 4× o teto). 5 novas funções acima do limiar de complexidade neste PR sem refactor compensatório.
- **Impacto técnico**: cada ajuste de regra obriga editar 5 sítios literais (`+ 1`/`+ 0.005` em 3 arquivos). Próximo `/feature-tweak` será forçado a refatorar (Biome warn).
- **Impacto de negócio**: 3 regras de classificação novas no backlog do Yuri; cada uma vira 1–2 dias a mais.
- **Cards**: `modifiability-1` (M, P1), `modifiability-2` (M, P1), `modifiability-5` (L, P1), `modifiability-4` (S, P2)
- **Custo de inação em 6 meses**: 1 sprint perdida/trimestre revertendo regressão.

### R-7: `excluirBordero` sem compensação — borderô esvaziado parcial
- **QA(s) afetados**: Fault Tolerance (P1)
- **Findings**: F-fault-tolerance-5
- **Evidência**: for-loop sem try/catch interno; falha mid-loop deixa borderô parcial no ERP + trilha local intacta. Retry repete chamadas → ERP responde "não existe" → throw.
- **Impacto técnico**: lixo contábil no ERP requer intervenção manual via Conexos.
- **Impacto de negócio**: ticket de suporte recorrente.
- **Cards**: `fault-tolerance-5` (M, P1)
- **Custo de inação em 6 meses**: 2–3 incidentes; cada um requer Yuri reconciliar.

### R-8: Ausência de stuck-state reaper para `status='reconciling'` órfão
- **QA(s) afetados**: Fault Tolerance (P1), Availability (cross)
- **Findings**: F-fault-tolerance-7
- **Evidência**: processo morto entre `beginExecution` e `markSettled` deixa linha `reconciling` indefinida. Retry UPSERT regrava `reconciling` (não pula) → risco de dupla-baixa se `gravarBaixaPermuta` original completou mas resposta perdida.
- **Impacto técnico**: cenário "resposta perdida no passo 5" não coberto pelo write-ahead. Anti-drift mitiga parcial.
- **Impacto de negócio**: incidente silencioso só aparece na conferência semanal.
- **Cards**: `fault-tolerance-7` (M, P1)
- **Custo de inação em 6 meses**: 1–2 ocorrências; cada uma = sessão forense Yuri+dev.

### R-9: Loop `confirmarProcessamento` (FE) aborta no 1º erro
- **QA(s) afetados**: Fault Tolerance (P1)
- **Findings**: F-fault-tolerance-2
- **Evidência**: `page.tsx:702-739` for-loop com try/catch único externo. 1ª falha aborta; toast genérico não diferencia processados/pendentes.
- **Impacto técnico**: estado parcial no fin010; analista cruza manualmente.
- **Impacto de negócio**: 30+ min de reconciliação por hiccup.
- **Cards**: `fault-tolerance-2` (S, P1)
- **Custo de inação em 6 meses**: cada hiccup vira 30+ min de retrabalho.

### R-10: Migrations multi-statement sem `BEGIN/COMMIT` (latente)
- **QA(s) afetados**: Deployability (P1)
- **Findings**: F-deployability-1
- **Evidência**: `runMigrations.ts:46` aplica SQL sem transação. `0017_invoice_importador.sql` tem 2 ALTERs — DDL atual idempotente mascara o problema. Primeira migration futura com DML não-idempotente sofre aplicação parcial.
- **Impacto técnico**: hoje risco baixíssimo; médio prazo, alto e silencioso.
- **Impacto de negócio**: incidente com debug manual.
- **Cards**: `deployability-1` (S, P1)
- **Custo de inação em 6 meses**: 0 incidentes neste PR; 1 quase certo na primeira migration com DML.

## 3. Cross-cutting findings

### CC-1: Zod no boundary das leituras Conexos (reads ↔ writes incoerentes)
- **Aparece em**: Integrability, Security, Fault Tolerance
- **Findings**: F-integrability-1, F-security-3
- **Diagnóstico**: writes usam `BORDERO_CRIADO_SCHEMA`/`BAIXA_GRAVADA_SCHEMA`; reads novas regrediram para `Number(...)` cru. NaN no cache + identidade vazia em `permuta_invoice`.
- **Recomendação**: `integrability-1` + `security-4` num único PR.

### CC-2: Auto-alocação sem rede de proteção (transação + teste + live re-read)
- **Aparece em**: Testability, Availability, Fault Tolerance, Modifiability
- **Findings**: F-testability-1, F-availability-2, F-fault-tolerance-3, F-fault-tolerance-4
- **Diagnóstico**: A regra 2026-06-24 entregou o único caminho que CRIA alocações antes de baixa real sem revisão humana, e o fez (a) sem teste, (b) sem transação, (c) sem try/catch interno, (d) com snapshot stale, (e) com retorno boolean ambíguo. Quatro problemas, uma causa-raiz: tratada como "atalho de conveniência", não como write financeira.
- **Recomendação**: pacote único `testability-1` + `availability-2` + `fault-tolerance-4`, 1 sprint.

### CC-3: RBAC granular + audit trail durável ausentes
- **Aparece em**: Security, Fault Tolerance
- **Findings**: F-security-1, F-security-5, F-security-6, F-fault-tolerance-1
- **Diagnóstico**: 2 níveis efetivos (`anon`/`auth`); mutações destrutivas sem evidência além de stdout (Render rotaciona ~7d). Insider com JWT válido faz dupla-baixa + zero rastro forense.
- **Recomendação**: sequência `security-1` → `fault-tolerance-1` → `security-2`.

### CC-4: Crescimento descontrolado dos serviços de permutas
- **Aparece em**: Modifiability, Testability, Performance (indireto)
- **Findings**: F-modifiability-1, 2, 5, 7
- **Diagnóstico**: sem refactor compensatório, mesmas 3 artefatos engordam. `GestaoPermutasService` +172 LOC (+47%), `BorderoGestaoService` +297 (+130%), `page.tsx` +404 (+18%). 5 novas funções >15 complexidade neste PR.
- **Recomendação**: `modifiability-1` → `modifiability-2` → `modifiability-5`, cada um habilita testes mais finos.

### CC-5: Índices ausentes em tabelas novas / hot paths
- **Aparece em**: Performance, Modifiability
- **Findings**: F-performance-2, F-performance-5, F-modifiability-3
- **Diagnóstico**: 0015 e 0018 criaram tabelas com PK adequada para escrita, sem índices para ORDER BY/WHERE dominante. Gate do PR não exigiu EXPLAIN. Cache numa repo errada (PermutaExecucaoRepository) esconde a presença em buscas de hotspot.
- **Recomendação**: `performance-2` + `performance-4` num PR de schema; `modifiability-3` em PR separado.

## 4. Quick wins (≤5 dias úteis, severidade ≥ P2)

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| **fault-tolerance-1** | Fault Tolerance | S | **P0** | Dupla-baixa via `removerDaTrilha` → impossível |
| **testability-1** | Testability | S | **P0** | `autoAlocar*` ganha 8 it cobrindo branches críticos |
| **testability-2** | Testability | S | **P0** | `autoElegivel` + `autoCasamentos` ganham 4 it |
| **security-1** | Security | S | P1 | 3 leituras novas com `requireRole` |
| **integrability-1** | Integrability | S | P1 | Zod nas 3 reads novas — 0 NaN no cache |
| **integrability-2** | Integrability | S | P1 | Paginação completa + `onCapHit` |
| **performance-2** | Performance | S | P1 | Índice em `permuta_bordero` — query 300ms→50ms |
| **deployability-1** | Deployability | S | P1 | `BEGIN/COMMIT` por migration |
| **deployability-3** | Deployability | S | P1 | Runbook de rollback v0.7.0 |
| **fault-tolerance-2** | Fault Tolerance | S | P1 | `confirmarProcessamento` per-item try/catch |
| **fault-tolerance-6** | Fault Tolerance | S | P2 | `estornarBordero` atualiza cache |
| **performance-3** | Performance | S | P2 | `listarBorderos` paraleliza 2 reads — 0,83s→580ms |
| **performance-4** | Performance | S | P2 | Índice parcial `permuta_alocacao_execucao(bor_cod)` |
| **performance-5** | Performance | S | P2 | `Server-Timing` nas rotas `/permutas/*` |
| **availability-1** | Availability | S | P2 | `replaceBorderoCache` atômico |
| **availability-5** | Availability | S | P2 | `capHit` propagado do `listInvoicesFinalizadas` |
| **security-3** | Security | S | P2 | 4 rotas novas com Zod |
| **security-4** | Security | S | P2 | `com298RowSchema.parse` nos novos mappers |
| **modifiability-3** | Modifiability | S | P2 | `PermutaBorderoCacheRepository` extraído |

**19 quick wins, 5 deles P0/P1 bloqueantes.** Sprint 1: 5 P0/P1 (3–4 dias úteis).

## 5. Strategic moves (M / L / XL)

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| **availability-2** | Avail+FT | M | Transactions / Rollback | 0 testes de "falha Conexos mid-loop"; meia-permuta = ajuste contábil errado |
| **fault-tolerance-3** | FT+Test | M | Sanity Checking | `autoAlocar*` cobertura 0→≥8; documenta magic-number `+ 1` |
| **fault-tolerance-4** | FT | M | Increase Competence Set | `autoAlocarDeCasamento` usa snapshot stale; live re-read |
| **fault-tolerance-5** | FT | M | Compensating Transaction | `excluirBordero` hoje deixa estado parcial |
| **fault-tolerance-7** | FT | M | Condition Monitoring | MTTR `reconciling` órfão: indef.→≤30min |
| **security-2** | Sec | M | Audit Trail | DELETEs em `permuta_alocacao_execucao` com retenção 2 anos (SOX) |
| **performance-1** | Perf | M | Reduce Overhead | Ingestão 65s→≤25s; com308 2390→≤600 |
| **performance-6** | Perf | M | Limit Event Response | Payload `/gestao` ~1.2MB→≤400KB |
| **modifiability-1** | Mod+Test | M | Encapsulate / Polymorphism | `toPendente` 58→≤15; 5º tipo = 1 arquivo novo |
| **modifiability-2** | Mod+Test | M | Split Module | `BorderoGestaoService` 527 LOC→3×≤250 |
| **modifiability-6** | Mod | M | Use an Intermediary | `routes/permutas.ts` 620→≤400; 9 cópias `executadoPor`→1 |
| **testability-3** | Test | M | Specialized Interfaces | `PermutaExecucaoRepository` 5/18 testados→18/18 |
| **testability-4** | Test+Sec+FT | M | Executable Assertions | 9 endpoints novos com 0 teste→≥12 it |
| **testability-5** | Test | M | Specialized Interfaces | FE 13 superfícies novas com 0 teste; `maskBrl` errado=baixa errada |
| **modifiability-5** | Mod | L | Split Module | `page.tsx` 2562→≤600; remove 3 setState-in-effect |
| **integrability-4** | Integ | L | Versioning strategy | OpenAPI/shared types — drift FE↔BE pego no typecheck |
| **security-5** | Sec | M | Limit Exposure | `tenant_id` em `permuta_bordero` — pré-req SaaSo |

## 6. O que está bem (e por quê)

1. **DDD/tsyringe íntegros nos services novos**: 100% `@injectable`/`@inject`, arrow methods, modificadores explícitos. PatternGuardian ✅. (Tactic: Restrict Dependencies.)
2. **Conexos como único client domain-shaped**: 24 métodos públicos; zero `axios`/`fetch` vazando para service/repo. (Tactic: Encapsulate — `ConexosClient.ts:37`.)
3. **Write-ahead + `setBorCod` antes do handshake**: cobre 100% do caminho feliz contra crash. (Tactic: Idempotent Replay — `PermutaExecucaoRepository.ts:191-224`.)
4. **Anti-super-pagamento (`valorBaixaDesejado > emAbertoErp + tol ⇒ abort`)**: gate de última linha. (Tactic: Predictive Model — `ReconciliacaoPermutaService.ts:269-275`.)
5. **`requireOwnBorderoFilCod` bloqueia confused-deputy mesmo com JWT admin**: `filCod` sempre da trilha local. (Tactic: Limit Access — `BorderoGestaoService.ts:282-297`.)
6. **Cache `permuta_bordero` com fallback graceful**: `replaceBorderoCache` no-op em fetch vazio + self-warming. (Tactic: Passive Redundancy + Degradation.)
7. **`refreshCache` por-filial com `.catch` isolado**: 1 filial offline ≠ refresh derrubado. (Tactic: Ignore Faulty Behavior — `BorderoGestaoService.ts:409-421`.)
8. **`BorderosPanel.tsx` extraído (594→678 LOC reusáveis)**: ÚNICO refactor compensatório do PR. (Tactic: Split Module.)
9. **`ConexosClient.test.ts` com fixtures wire-real**: 81 it com payloads probados. (Tactic: Recordable Test Cases.)
10. **`heavyRouteLimiter` em todas as rotas fan-out Conexos**: protege contra clique-em-massa pós-deploy. (Tactic: Surge Protection.)

## 7. Limitações da análise

**Não medíveis localmente**: MTTR real de baixa interrompida (CloudWatch/Render), p95 do `/gestao` em prd (falta `Server-Timing` — card `performance-5`), payload `/gestao` real (falta `Content-Length` log), latência por endpoint Conexos (sem APM Render), deploy duration real e MTTR de rollback praticado, `npm audit` por sessão, cobertura % real (não rodou `--coverage`).

**Não coberto pelo pipe**: chaos engineering, threat modeling formal (STRIDE/DREAD), custo cloud, UX, acessibilidade.

**Janela temporal**: snapshot do PR v0.7.0 em 2026-06-24. Refazer trimestralmente.

**Edição editorial**: cards copiados verbatim das 8 seções. Nenhum ID renomeado.

## 8. Veredito de merge-readiness

**Decisão: BLOQUEADO para merge em main no estado atual.**

3 P0 (`fault-tolerance-1`, `testability-1`, `testability-2`) + 2 P1 críticos (`availability-2`, `fault-tolerance-3`) requerem remediação antes do merge.

**Justificativa**:
1. **`fault-tolerance-1` (P0)** — endpoint `DELETE /borderos/:borCod/trilha` segue vivo (botão FE removido, rota não). Admin com curl/JWT vazado dispara cenário de dupla-baixa real. Mitigação: guard `borderoAindaValido` + rename de chave. Esforço S.
2. **`testability-1` + `testability-2` (P0)** — duas regras de saldo automático que geram baixa real no fin010 entraram sem 1 teste direto. Regra 2026-06-24 (Processar 1-click) será exercitada em volume. Esforço S × 2.
3. **`availability-2` (P1)** — `autoAlocar*` N writes sem transação, retorno `true` ambíguo. Combinado com 1+2 = core do risco financeiro do PR. Esforço M.
4. **`fault-tolerance-3` (P1)** — mesma família; cobertura + magic-number `+ 1` documentado. Mergear junto com 2 e 3. Esforço M.

**Caminho recomendado para desbloquear merge** (1 sprint, ~5 dias úteis para 1 dev):
- Dia 1: `fault-tolerance-1` (S) — guard + rename + 3 testes.
- Dia 2: `testability-1` + `testability-2` (S+S) — 12 it.
- Dias 3–5: `availability-2` + `fault-tolerance-3` (M+M) — transação, retorno `'all'|'partial'|'none'`, magic-number, cenários de falha mid-loop.

**NÃO bloqueia merge mas precisa entrar no backlog**:
- Modifiability P1×3 (toPendente, BorderoGestao, page.tsx) — próximo PR que tocar deve refatorar.
- Performance P1×2 (regressão N+1 + índice ausente) — antes do backlog crescer.
- Security P1×2 (RBAC + audit trail) — antes do SaaSo.

**Reafirmação**: o PR não é de qualidade indefensável — 10 acertos claros (seção 6). Mas movimenta dinheiro com 3 P0 + 2 P1 críticos numa janela de 1 sprint. Mergear sem isso é assumir que o primeiro hiccup Conexos vira incidente financeiro real.

## 9. Ações recomendadas (30 dias)

1. **Semana 1** (desbloqueio): `fault-tolerance-1` + `testability-1` + `testability-2` + `availability-2` + `fault-tolerance-3`.
2. **Semana 2** (Security + Integrability quick wins): `security-1`, `integrability-1`, `integrability-2`, `security-3`, `security-4`. Fecha CC-1 e parte de CC-3.
3. **Semana 3** (Performance + Deployability): `performance-2`, `performance-4`, `performance-3`, `performance-5`, `deployability-1`, `deployability-3`. Fecha CC-5.
4. **Semana 4** (Fault Tolerance restante + Audit): `fault-tolerance-2`, `fault-tolerance-5`, `fault-tolerance-6`, `fault-tolerance-7`, `security-2`. Fecha CC-3.
5. **Sprint 2 (mês 2)** — strategic: `modifiability-1`, `modifiability-2`, `performance-1`, `performance-6`. Endereçam CC-2 e CC-4.
```

---

##
