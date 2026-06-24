---
type: regis-review-report
run_id: 2026-06-24-0039
generated_at: 2026-06-24T03:05:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
total_cards: 49
total_p0: 7
total_p1: 22
total_p2: 14
total_p3: 6
overall_score: 5.13
---

# Regis-Review — financeiro — 2026-06-24-0039

> **Escopo da revisão**: Fase 3.1 — "gestão de borderôs" (ciclo de vida completo da baixa/permuta no Conexos `fin010`: criar/aprovar/cancelar/estornar/excluir baixa e borderô) + o deploy que ligou a **primeira escrita irreversível em produção** (`CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`) **sem passar por staging**. Snapshot v0.6.0 live em Render + Vercel.

## 1. Executive scorecard

**Pesos aplicados (perfil "automação financeira que escreve no ERP do cliente"):** Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 · Testability 1.0 · Performance 1.0 · Integrability 0.9 · Deployability 0.9 → total 9.0.

**Cálculo:** (5.0·1.5 + 6.0·1.3 + 6.0·1.2 + 5.0·1.2 + 6.5·1.0 + 5.0·1.0 + 4.0·0.9 + 4.0·0.9) / 9.0 = **5.13/10**.

| QA | Score | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 6.0 | 0 | 3 | 2 | 2 | F-availability-1: sem monitor externo — falhas no `fin010` só aparecem quando o analista reclama (TMTD ≈ 1d) |
| Deployability | 4.0 | 3 | 3 | 2 | 0 | F-deployability-1: `WRITE_ENABLED=true` foi para PRD sem homologação (1 ambiente só) |
| Integrability | 4.0 | 2 | 5 | 1 | 0 | F-integrability-1: envelope `{messages, responseData}` sem Zod — drift no `fin010` quebra escritas em PRD |
| Modifiability | 5.0 | 0 | 5 | 3 | 1 | F-modifiability-1: `ConexosClient` virou God-client (1.855 LOC, 22 públicos, 9 importadores) |
| Performance | 5.0 | 0 | 4 | 2 | 1 | F-performance-5: cold-start Render free tier ≥50s |
| Fault Tolerance | 6.0 | 1 | 2 | 4 | 1 | F-fault-tolerance-1: cutover em PRD sem staging nem canary |
| Security | 5.0 | 2 | 3 | 2 | 0 | F-security-1: confused-deputy — backend muta borderô de TERCEIRO sem checar escopo |
| Testability | 6.5 | 2 | 2 | 2 | 0 | F-testability-1: 8 métodos novos sem contract test — onde o bug `docTip`-vs-`filCod` nasceu |
| **Overall** | **5.13** | **7** | **22** | **14** | **6** | — |

**Interpretação:** 0–3 risco estrutural · 4–6 dívida defensável (aqui) · 7–8 saudável · 9–10 estado-da-arte.

**Leitura curta:** Deployability e Integrability puxam o overall pra baixo justo na janela em que a escrita real foi ligada. Security e Fault Tolerance têm 3 P0 que precisam fechar antes da próxima feature de escrita (SISPAG/GED).

## 2. Top 10 risks (cross-QA)

### R-1: Cutover sem staging — `CONEXOS_WRITE_ENABLED=true` direto em PRD
- **QAs**: Deployability, Fault Tolerance, Security
- **Findings**: F-deployability-1 (P0), F-fault-tolerance-1 (P0), F-deployability-5 (P1)
- **Evidência**: `render.yaml:37-42` + commit `54ad093` ("baixa real direto em PRD, sem homologação"); o próprio runbook diz "Homologação (obrigatória antes de produção)". Tactics violadas: **Scale Rollouts**, **Substitution**.
- **Impacto técnico**: única defesa entre regressão de payload e baixa errada no `fin010` é `requireRole('admin')`; baixa é "irreversível por nós".
- **Impacto de negócio**: 1 regressão = N baixas reais erradas até o analista perceber em D+1; em permuta múltipla (4 pares), blast radius multiplicado.
- **Cards**: `deployability-1`, `fault-tolerance-1`
- **Custo em 6 meses**: ~24h/trimestre de retrabalho contábil + erosão de confiança do cliente.

### R-2: Sem monitor externo — falhas só aparecem se o analista reclamar
- **QAs**: Availability, Fault Tolerance, Deployability
- **Findings**: F-availability-1 (P1), F-fault-tolerance-2 (P1), F-deployability-1 (P0 sob observabilidade)
- **Evidência**: `grep sentry/alarm src/backend → 0`; linhas `reconciling > 10min` ou `error > 24h` não disparam nada. TMTD = ciclo do analista (~1 dia útil).
- **Impacto técnico**: regressão silenciosa convive até alguém olhar; write-ahead registra `bor_cod` mas sem cron alertando.
- **Impacto de negócio**: SLA implícito "baixas do dia, mesmo dia"; 1 dia de baixas pode ficar `error` e só ser percebido em D+1.
- **Cards**: `availability-1`, `fault-tolerance-2`, `availability-4`, `availability-5`
- **Custo em 6 meses**: ~16h/semestre de SLA percebido perdido + erosão de confiança proporcional.

### R-3: Confused-deputy — qualquer admin muta borderô de TERCEIRO sem rastro
- **QAs**: Security, Fault Tolerance, Integrability
- **Findings**: F-security-1 (P0), F-security-6 (P1), F-security-7 (P2), F-integrability-6 (P1)
- **Evidência**: `GET /permutas/borderos` lista 200 borderôs do ERP marcando `daTrilha`; FE desabilita botão, mas backend (`BorderoGestaoService.resolveFilCod:250-257`) aceita `filCodParam` cru. `curl -X POST .../estornar -d '{"filCod":2}'` executa com `MPS_FRANCINEI` e ZERO linha de auditoria.
- **Impacto técnico**: 0/5 rotas validam escopo server-side; auditoria do ERP imputa toda ação a `MPS_FRANCINEI`.
- **Impacto de negócio**: fraude por admin malicioso plausível em < 1min; perícia financeira inviável; risco de compliance (SOX-equivalente).
- **Cards**: `security-1`, `security-5`, `security-6`
- **Custo em 6 meses**: probabilidade baixa × impacto altíssimo; materializa em auditoria externa ou rotação de pessoal.

### R-4: Contrato `fin010` reverse-engineered de HAR sem Zod nem contract tests
- **QAs**: Integrability, Testability, Fault Tolerance
- **Findings**: F-integrability-1/2/4/5/7 + F-testability-1/2/4/5 + F-fault-tolerance-4 + F-modifiability-5
- **Evidência**: 12 sites com `responseData?.bxaMnyValor` sem validação; 0/11 endpoints versionados; 5/12 métodos `fin010` cobertos por fixture. Bug `docTip`-vs-`filCod` (`ConexosClient.ts:1131-1135`) descoberto só porque filial 2 coincidia com `docTip=2`.
- **Impacto técnico**: renomeio silencioso quebra `> 0` guard; `valid='AVISO'` passa batido; `null` vai no passo 5 e ERP grava lixo.
- **Impacto de negócio**: cada filial nova é sítio de regressão silenciosa; SISPAG e GED multiplicam o problema.
- **Cards**: `integrability-1`, `integrability-2`, `integrability-6`, `testability-1`, `testability-2`, `testability-4`
- **Custo em 6 meses**: ~1-2 dias-Yuri por trimestre + risco de baixa errada em PRD.

### R-5: Mutex `MAX_SESSIONS=3` + `loginPromise` por instância — vira P0 ao escalar
- **QAs**: Availability, Performance, Integrability
- **Findings**: F-availability-3 (P2→P0 ao escalar), F-availability-2 (P1), F-integrability-6 (P1)
- **Evidência**: `services/conexos.ts:73-197` mantém `loginPromise` em memória; card `availability-2` (saída do free) DEPENDE de `availability-3`.
- **Impacto técnico**: 2+ instâncias → ping-pong cruzado matando sessões alheias.
- **Impacto de negócio**: bloqueio cruzado no pico de fechamento mensal; materializa no dia exato do upgrade.
- **Cards**: `availability-3` (pré-requisito de) `availability-2`
- **Custo em 6 meses**: nulo enquanto 1 instância; P0 imediato no dia do scale-out.

### R-6: Senha bootstrap idêntica para 4 admins + login sem rate-limit dedicado
- **QAs**: Security, Availability
- **Findings**: F-security-2 (P0), F-security-4 (P1), F-security-8 (P2)
- **Evidência**: 4 contas com `bcrypt('Admin@user2406', cost=10)`; `/auth/login` herda só `globalLimiter` (100/min/IP). 100 tentativas/min × cost 10 ≈ suficiente para dicionário.
- **Impacto técnico**: comprometer 1 = comprometer 4; phishing abre 100% do sistema incl. escrita `fin010`.
- **Impacto de negócio**: comprovação "foi o usuário X" cai; combinado com R-3, vira ação indistinguível do operador legítimo.
- **Cards**: `security-2`, `security-3`, `security-7`
- **Custo em 6 meses**: probabilidade média × impacto alto.

### R-7: Frontend deploy manual + bump-version PowerShell — drift de release recorrente
- **QAs**: Deployability, Modifiability
- **Findings**: F-deployability-3 (P0), F-deployability-7 (P2), F-deployability-2 (P0)
- **Evidência**: 1 incidente CORS/sessão (`ALLOWED_ORIGINS` sem wildcard que `cors.ts:31-37` suporta); `bump-version.ps1` exige pwsh em host Darwin → bumps manuais, FE/BE drift por sorte.
- **Impacto técnico**: cada release pode quebrar login; `/health` reporta versão mentirosa.
- **Impacto de negócio**: confiança do operador sangra a cada deploy.
- **Cards**: `deployability-3`, `deployability-6`, `deployability-2`
- **Custo em 6 meses**: ~3h/semestre de SPA fora do ar visível.

### R-8: God-modules — `ConexosClient` (1.855 LOC), `permutas/page.tsx` (2.385 LOC), `routes/permutas.ts` (582 LOC + 5 violações DDD)
- **QAs**: Modifiability, Testability, Integrability
- **Findings**: F-modifiability-1/2/4/7, F-integrability-8, F-testability-6
- **Evidência**: `ConexosClient` 22 métodos / 4 sub-domínios / 9 importadores; `routes/permutas.ts` 5 imports `route→repository`; `permutas/page.tsx` 4 tabs + 4 modais + 133 keywords de fluxo. Sessão adicionou +2.348 LOC sem refatorar.
- **Impacto técnico**: cada mudança recompila/retesta 7 services; test file espelhou (1.490 LOC).
- **Impacto de negócio**: lead time cresce com superfície; onboarding lento.
- **Cards**: `modifiability-1`, `modifiability-2`, `modifiability-4`, `modifiability-7`, `testability-5`
- **Custo em 6 meses**: ~20-30% a mais de tempo por feature já na 3ª iteração.

### R-9: Magic numbers + duplicação de tradução de erros `fin010`
- **QAs**: Modifiability, Integrability, Fault Tolerance
- **Findings**: F-modifiability-3/5, F-integrability-3/5, F-fault-tolerance-4
- **Evidência**: `docTip=2`, `borVldTipo=2`, `titCod=1` em 18+ sites; 2 mapas paralelos PT-BR (`ERP_MESSAGE_PT` com `FIN_014.*` em route, `friendlyErpMessage` com `FIN_010.*` em service) com 1 verbo duplicado (`FIN_IMPOSSIVEL_ALTERAR_REGISTRO`).
- **Impacto técnico**: bug `docTip`-vs-`filCod` (R-4) é exatamente o resultado do alias; mensagens técnicas vazam.
- **Impacto de negócio**: cada novo código = 2 edits coordenados que drift'am.
- **Cards**: `integrability-3`, `integrability-5`, `modifiability-3`, `modifiability-5`, `fault-tolerance-4`
- **Custo em 6 meses**: +1 dia-Yuri por código novo + bug latente de path por filial.

### R-10: Cold-start ≥50s + sem cache `GET /borderos` — UX da manhã quebrada
- **QAs**: Performance, Availability, Deployability
- **Findings**: F-performance-5 (P1), F-performance-4 (P1), F-availability-2 (P1)
- **Evidência**: `_shared-metrics.md:46` confirma free tier; sem `Cache-Control`/`ETag`; analista que clica "Atualizar" 5× consome 5× a carga ERP.
- **Impacto técnico**: 1ª request da manhã espera ≥50s; axios interno 40s timeouta antes.
- **Impacto de negócio**: confiança erode a cada manhã; ERP compartilhado com `fechamento-processos` em horário de pico.
- **Cards**: `performance-4`, `performance-3`, `availability-2`
- **Custo em 6 meses**: ~7 USD/mês vs. confiança erodida — trade-off econômico óbvio.

## 3. Cross-cutting findings

### CC-1: Contrato `fin010` HAR + sem Zod + contract tests parciais + magic numbers
- **Aparece em**: Integrability, Testability, Fault Tolerance, Modifiability
- **Findings**: F-integrability-1/2/4/5/7, F-testability-1/2/4/5, F-fault-tolerance-4, F-modifiability-5
- **Diagnóstico**: contrato 100% reverse-engineered de HAR convive sem versionamento, sem detector de drift, sem Zod no boundary, sem fixtures versionadas e com magic numbers que coincidem (o `2` de `docTip = borVldTipo = filCod=2`). O bug desta sessão é arquetípico.
- **Recomendação consolidada**: combo `integrability-1` (Zod) + `integrability-5` (constantes) + `testability-1`+`testability-4` (contract tests + fixtures) + `integrability-2` (drift probe). Mesma sprint.

### CC-2: Cutover de produção sem rede de segurança
- **Aparece em**: Deployability, Fault Tolerance, Availability, Security
- **Findings**: F-deployability-1/5/6, F-fault-tolerance-1, F-availability-1, F-security-6
- **Diagnóstico**: Fase 3.1 ligou `WRITE_ENABLED=true` em PRD sem HML + sem monitor + sem audit persistido + sem runbook de rollback. As 4 lacunas se reforçam: regressão entra sem ser vista → quebra silenciosa → sem alarme → log no Render free rotaciona → recuperação é improviso.
- **Recomendação consolidada**: combo `deployability-1` (HML) + `fault-tolerance-1` (allow-list por filial, quick-win imediato) + `availability-1` (Sentry+Logtail) + `security-5` (audit trail). `fault-tolerance-1` é o quick-win que comprime blast radius enquanto HML+monitor sobem.

### CC-3: God-modules em 3 hot-spots concentram complexidade
- **Aparece em**: Modifiability, Testability, Integrability
- **Findings**: F-modifiability-1/2/4/7, F-integrability-8, F-testability-5/6
- **Diagnóstico**: 3 arquivos absorveram desproporcionalmente. Test file espelhou (1.490 LOC).
- **Recomendação consolidada**: `modifiability-1` (split client) + `modifiability-7` (split page.tsx) + `modifiability-4` (reintroduzir invariante DDD) + `testability-5`. Ordem obrigatória: contract tests (`testability-1`) ANTES de splits.

### CC-4: Audit-trail incompleto + observabilidade ausente
- **Aparece em**: Security, Fault Tolerance, Availability
- **Findings**: F-security-6, F-fault-tolerance-5/8, F-availability-1/6
- **Diagnóstico**: sistema mexe em dinheiro real sem tabela de auditoria, sem histórico append-only, sem monitor externo, sem reaper. LogService grava em stdout que rotaciona. Pós-incidente, evidência some.
- **Recomendação consolidada**: combo `security-5` + `fault-tolerance-5` + `availability-1` + `availability-5`. Endereçam mesma deficiência sob ângulos diferentes; entregar em 60 dias.

### CC-5: Mutex + identidade global — bottleneck que vira P0 ao escalar
- **Aparece em**: Availability, Security, Integrability
- **Findings**: F-availability-3, F-security-5, F-integrability-6
- **Diagnóstico**: 1 conta `MPS_FRANCINEI` + mutex em memória. Apaga identidade no ERP, bloqueia scale-out.
- **Recomendação consolidada**: `availability-3` (mutex via advisory lock) + `integrability-7` (entrevistar fornecedor sobre `actAs` — decisão de produto antes de implementar).

## 4. Quick wins (≤5 dias úteis)

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| `fault-tolerance-1` | Fault Tolerance | S | **P0** | Allow-list por filial (`CONEXOS_WRITE_FIL_CODS`), fail-closed. Blast radius limitado nas 72h pós-cutover. |
| `deployability-2` | Deployability | S | **P0** | Flags `WRITE_ENABLED`/`DRY_RUN` para `sync:false` + drift detection noturno via Render API. |
| `deployability-3` | Deployability | S | **P0** | Job `frontend-deploy` automatizado + `ALLOWED_ORIGINS` padronizado com wildcard `https://*.vercel.app`. |
| `security-2` | Security | S | **P0** | `must_change_password BOOLEAN` + reset das 4 contas com senhas distintas + bcrypt cost 10→12. |
| `testability-1` | Testability | S | **P0** | Contract tests dos 8 métodos novos do `ConexosClient` (assert do path literal). Protege contra regressão `docTip`. |
| `availability-1` | Availability | M (subset S) | P1 | Sentry + Logtail + keep-alive cron. TMTD: 1d → ≤15min. |
| `deployability-5` | Deployability | S | P1 | Runbook `rollback.md` (Render + Vercel + política schema). MTTR: improviso → ≤5min. |
| `integrability-3` | Integrability | S | P1 | `fin010ErrorMessages.ts` unifica os 2 mapas de tradução. 1 fonte da verdade. |
| `integrability-4` | Integrability | S | P1 | `assertNoErpError` captura `valid='AVISO'` em `BUSINESS_WARN` + catálogo. |
| `integrability-5` | Integrability | S | P1 | Constantes nomeadas (`FIN010_DOC_TIP_INVOICE=2`...). Tipos nominais bloqueiam alias. |
| `modifiability-2` | Modifiability | S | P1 | `borderoActionRoute` helper — 4 handlers de 28 LOC viram 4 linhas. |
| `modifiability-3` | Modifiability | S | P1 | `ConexosErpMessageTranslator` (mesma causa-raiz de `integrability-3`). |
| `availability-4` | Availability | S | P1 | Dashboard "Borderôs com erro/dia" + notificação Slack 19h. |
| `performance-1` | Performance | S | P1 | Memoizar `borderoAindaValido` por request. K=5 settled: 4-8s → ≤1.5s. |
| `performance-3` | Performance | S | P1 | Cache TTL 10s + `Cache-Control` + ETag em `GET /borderos`. ~80% economia ERP. |
| `performance-4` | Performance | S | P1 | Render Starter (~7 USD/mês) OU keep-alive cron 8min. Cold-start 50s→5s. |
| `fault-tolerance-4` | Fault Tolerance | S | P2 | `errorRef` (requestId) na resposta de `Generic.ERROR_MESSAGE`. MTTR: 30min → <2min. |
| `fault-tolerance-6` | Fault Tolerance | S | P2 | Checkpoint + WARN log per-item em `excluirBordero`. Estado parcial vira explícito. |
| `security-4` | Security | S | P1 | Whitelist literal em `ALLOWED_ORIGINS` (sem wildcard) com `credentials:true`. |
| `security-6` | Security | S | P2 | `borderoAcaoBodySchema` Zod nas 5 rotas novas. 13/13 com Zod completo. |

**Total quick wins**: 20 cards (5 P0 + 11 P1 + 4 P2). Esforço agregado: ~3-4 sprints/1 dev; comprimível para 2 sprints/2 devs paralelos.

## 5. Strategic moves (M / L / XL)

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| `deployability-1` | Dep/FT/Av | M | Scale Rollouts | 0/N features de escrita validadas antes de PRD; cada regressão custa ~8h-Yuri. Pré-requisito não-negociável para SISPAG (com298 = remessa Nexxera). |
| `availability-1` | Av/Dep/FT | M | Monitor + Ping/Echo | TMTD: 1d → ≤15min. Sem este, 100% dos outros cards de observabilidade operam às cegas. |
| `availability-2`+`availability-3` | Av/Perf/Integ | M (combo) | Active Redundancy + Reconfiguration | **NÃO fazer -2 sem -3 antes** — cap MAX_SESSIONS=3 vira ping-pong cruzado. Cold-start 0 + 2 instâncias com failover. |
| `security-1`+`security-5` | Sec/FT | M (combo) | Authorize Actors + Audit Trail | 0/5 rotas validam escopo → 5/5 + audit persistido. Fecha R-3. |
| `fault-tolerance-2` | FT/Av | M | Timestamp + Repair State | Reaper `reconciling > 10min`. P95 detecção: ∞ → 10min. |
| `fault-tolerance-3` | FT/Integ | M | Comparison + Reconcile | Job diário confronta `settled` local com baixas vivas no ERP. Divergência conhecida em ≤24h. |
| `fault-tolerance-5` | FT/Sec/Test | M | Audit-trail | Tabela append-only `permuta_alocacao_execucao_evento`. Forense: indefinido → ≤5min via SQL. |
| `integrability-1` | Integ/FT/Sec | M | Adhere to Standards (boundary) | Zod nos 4 envelopes write `fin010`. Drift detectado no boundary, não na contabilidade. |
| `integrability-2` | Integ/Test/FT | L | Versioning + Discover Service | Fixtures HAR + drift probe semanal em sandbox. Detecção: ∞ → ≤7 dias. **Pré-requisito**: sandbox provisionada pelo Yuri. |
| `modifiability-1` | Mod/Test/Integ | M | Split Module + Coherence | `ConexosClient` 1.855 LOC → 3 sub-clients ≤700 LOC. **Pré-requisito**: `testability-1`. |
| `modifiability-4` | Mod/Sec | M | Restrict Dependencies | Eliminar 5 imports `route→repository`. PatternGuardian volta a ter credibilidade. |
| `modifiability-7` | Mod/Test | L | Split Module | `permutas/page.tsx` 2.385 LOC → composição. Velocidade de feature dobra. |
| `performance-2` | Perf/Mod | M | Limit Event Response | Paginação real em `listBorderos` (sair de `pageSize=200`). Borderôs invisíveis: ≥0 silencioso → 0. |
| `performance-5` | Perf/FT | M | Introduce Concurrency | Probe + `pLimit(2-3)` em `reconciliar`. K=5: 20-40s → 8-16s. **Pré**: probe ERP. |
| `security-7` | Sec | M | Limit Exposure | JWT em cookie `HttpOnly`. Elimina XSS-to-takeover. |
| `testability-2` | Test/Sec | M | Executable Assertions + Sandbox | 6 rotas novas com supertest. Cobertura routes: 33% → 50%+. |
| `testability-3` | Test/Mod | M | Executable Assertions | Tests FE `borderos/page.tsx`. **Pré facilitador**: `modifiability-7`. |
| `testability-5` | Test/Mod | L | Limit Structural Complexity | Mesma decisão de `modifiability-1` (perspectiva test-driven). |

## 6. O que está bem (e por quê)

1. **Writes single-attempt + idempotência viva** — decisão arquitetural explícita (`ConexosClient.ts:1006-1010,1375-1380` + `ReconciliacaoPermutaService.ts:121-147`); chave `permuta:adto:invoice:atualizadoEm` + `borderoAindaValido` (check vivo). Tactic: **Idempotent Replay** + **State Resynchronization**.
2. **Write-ahead de `bor_cod`** — persistido antes dos demais POSTs (`ReconciliacaoPermutaService.ts:219-220`); recuperação testada em `ReconciliacaoPermutaService.test.ts:362-373`. Tactic: **Repair State**.
3. **Anti-drift "baixa ≤ em-aberto vivo"** (`ReconciliacaoPermutaService.ts:243-257`) — cap `Math.min(desejado, em-aberto)` + tolerância. Aborta em vez de super-pagar. Tactic: **Sanity Checking** + **Increase Competence Set**.
4. **Degradação por filial** (`BorderoGestaoService.ts:296-307`) — falha de 1 filial não derruba a tela. Tactic: **Ignore Faulty Behavior**.
5. **DI rigoroso + mockabilidade** — `@injectable()`/`@singleton()` em todo o domínio; `LegacyConexosShape` abstrai legacy. Cobertura `domain/service` 93%, `domain/repository` 86%.
6. **Kill-switch real e testado** — `CONEXOS_WRITE_ENABLED=false` + `CONEXOS_DRY_RUN=true` via env-var sem deploy. Teste `'bloqueia quando escrita desabilitada'` em `BorderoGestaoService.test.ts:277-287`. Tactic: **Reconfiguration** + **Removal from Service**.
7. **CI gates fortes** — `npm ci` + `npm audit --audit-level=high` + typecheck + lint + test+coverage + build. BE: 426/426 em 7.4s. Migrations gated por `preDeployCommand`.
8. **Redação de campos sensíveis no logger HTTP** + teste (`http/redact.ts:10-21` + `redact.test.ts`); 0 hardcoded secrets em código versionado; `.env` ignorado.

## 7. Limitações da análise

**Métricas declaradas "não medíveis localmente"**:
- MTTR real e taxa de falha por endpoint `fin010` (precisa PRD instrumentado)
- SLO real de uptime (free tier dorme)
- P95 fim-a-fim em PRD
- Bundle First-Load-JS por rota Next.js (modo `--quick`)
- Latência ERP por chamada (rede VPN-style)
- Cold-start real no momento da coleta (`/health` retornou vazio)
- Rate histórico de drift `fin010` em 12 meses
- Falhas de auth/min (só `console.warn`)
- Cobertura de mutantes (Stryker não instalado)
- DORA metrics (só painel Render)

**Fora do escopo do pipe**: chaos engineering, threat modeling STRIDE/LINDDUN, custo cloud detalhado, UX research, WCAG, licenças OSS, pentest externo.

**Janela temporal**: snapshot do dia **2026-06-24** (diff `30d5700..HEAD`). Refazer trimestralmente ou após cada flip de escrita irreversível nova.

**Dedup explícito**:
- `integrability-3` e `modifiability-3` mantidos separados no KANBAN (mesma solução sob 2 perspectivas legítimas). Implementador escolhe um e fecha o outro com referência.
- `cross-cutover-prd` (CC-2) mantém `deployability-1` (HML, M) e `fault-tolerance-1` (allow-list, S) separados porque custos diferem.
- Identificadores de cards preservados verbatim das seções QA.

## 8. Ações recomendadas (30 dias)

1. **Sprint 1 (sem 1-2) — Defesa do cutover.** P0 que limitam blast radius sem exigir HML: `fault-tolerance-1`, `security-1`, `security-2`, `security-5` + `deployability-2`, `deployability-3`. **Resultado**: regressão não escreve fora do allow-list; confused-deputy fecha; auditoria persistida.
2. **Sprint 2 (sem 3-4) — Observabilidade.** `availability-1`, `availability-4`, `fault-tolerance-4`, `fault-tolerance-2`. **Resultado**: TMTD 1d → ≤15min.
3. **Sprint 3 (sem 5-6) — Rede de regressão do contrato `fin010`.** `testability-1`, `testability-2`, `testability-4`, `integrability-1`, `integrability-3`/`modifiability-3` (escolher 1), `integrability-5`. **Resultado**: bug arquetípico fica protegido por compilador + teste.
4. **Sprint 4 (sem 7-8) — HML + rollback.** `deployability-1`, `deployability-5`. **Resultado**: próxima feature de escrita irreversível (SISPAG/GED) entra com rede de segurança. **Pré**: sandbox Conexos pelo Yuri.
5. **Sprint 5+ (sem 9+) — Refactor estrutural.** `modifiability-1`, `modifiability-4`, `modifiability-7`. **Ordem obrigatória**: contract tests da sprint 3 ANTES dos splits. `availability-2`+`availability-3` nesta janela ou na próxima.

> **Trigger explícito**: NÃO habilitar `com298` write (SISPAG) ou GED upload enquanto Sprints 1+2 não tiverem entregue. Sem isso, R-1, R-2 e R-3 se compõem na próxima frente.
