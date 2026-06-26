---
type: regis-review-report
run_id: 2026-06-26-1708
generated_at: 2026-06-26T19:30:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
prior_run: 2026-06-26-0058
app_version: v0.9.2
branch: main @ 7d853fd
total_cards_pre_dedupe: 62
total_cards_post_dedupe: 54
total_p0: 0
total_p1: 34
total_p2: 17
total_p3: 3
overall_score: 6.6
overall_score_prior: 5.4
overall_score_delta: +1.2
---

# Regis-Review — financeiro — 2026-06-26-1708

> Run pós-trabalho do dia (app v0.9.2, branch `main` @ 7d853fd, mesmo dia de `2026-06-26-0058`). Síntese de 8 QAs Bass & Clements para defesa técnica de investimento em qualidade de código. **Evidência primeiro, sem floreio.**

## 1. Executive scorecard

Pesos aplicados (justificativa: SaaSo multi-tenant de automação financeira que executa escritas que movem dinheiro — permuta/baixa em `fin010`, remessa SISPAG via Nexxera, upload no GED):

| QA | Peso |
|---|---|
| Security | 1.5 |
| Fault Tolerance | 1.3 |
| Availability | 1.2 |
| Modifiability | 1.2 |
| Testability | 1.0 |
| Performance | 1.0 |
| Integrability | 0.9 |
| Deployability | 0.9 |
| **Total** | **9.0** |

### Scorecard 0–10 com delta vs. run da manhã (`2026-06-26-0058`)

| QA | Score | Δ vs. 0058 | P0 | P1 | P2 | P3 | Top finding |
|---|---:|---:|---:|---:|---:|---:|---|
| Security | **6** | +1 | 0 | 6 | 2 | 1 | F-security-1: JWT 12h em localStorage sem revogação server-side |
| Fault Tolerance | **8.6** | +0.5 | 0 | 4 | 2 | 0 | F-fault-tolerance-3: stuck-state reaper aberto na 4ª run (follow-up R-4) |
| Availability | **5** | 0 | 0 | 4 | 3 | 0 | F-availability-3: zero APM externo — todos os erros morrem no stdout do Render |
| Modifiability | **7** | +2 | 0 | 5 | 5 | 0 | F-modifiability-3: 22 warnings de cognitive-complexity (era 20; nova função complexity-31) |
| Testability | **6** | +1 | 0 | 5 | 2 | 2 | F-testability-1: 10/14 componentes da CC-1 sem teste; threshold FE inerte (20<28 real) |
| Performance | **7** | +2 | 0 | 2 | 4 | 0 | F-performance-2: `reconciliar-lote` síncrono em HTTP com risco de 502 do proxy Render |
| Integrability | **7** | +2 | 0 | 3 | 4 | 0 | F-integrability-2: dupla camada de auth Conexos (services/conexos.ts 461 LOC vive) |
| Deployability | **6** | +2 | 0 | 5 | 3 | 0 | F-deployability-6: 21 migrations forward-only sem `down` nem expand-then-contract |
| **Overall ponderado** | **6.6** | **+1.2** | **0** | **34** | **17** | **3** | — |

**Score interpretation**:
- 0–3: estrutural risk — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais
- 9–10: estado-da-arte para o estágio atual

**Leituras do scorecard**:
1. **Sete dos oito QAs subiram** entre o run da manhã (overall 5.4) e o de fim de tarde (overall 6.6). Apenas **Availability ficou estagnada em 5** — o substrato operacional (APM, `/ready`, SIGTERM, breaker, self-test) **não foi tocado**; o que mudou em Availability foi a superfície de risco (multi-título adicionou janela maior de partial-success — F-availability-1).
2. **Zero P0** em todos os 8 QAs. Pela primeira vez em 4 runs consecutivas, o re-loop pós-Regis não tem item bloqueante de crítico. **Isto é mensurável e defensável** — não é "tudo OK", é "nenhum item exige re-loop antes de feature nova".
3. **Pior QA absoluto** é Availability (5/10) — agravado pelo crescimento do fan-out (multi-título: 1+4×N POSTs por par em vez de 1+4); sem APM, sem SIGTERM, sem breaker, esse delta vai aparecer no operador, não no dashboard.
4. **Melhor QA absoluto** é Fault Tolerance (8.6/10) — R-4 fail-closed + multi-título com anti-drift por título + idempotência write-ahead UNIQUE compõem rede defensável; o que sobra é instrumentação (reaper, drift, audit borderô).

## 2. O que MELHOROU hoje (evidência objetiva)

Antes de listar riscos, ancorar credibilidade: **estes são os ganhos do dia de trabalho**, mensuráveis em diff de código vs. run da manhã.

| Ganho | Evidência | QAs afetados | Cards/findings fechados |
|---|---|---|---|
| **Split CC-1 (frontend god-page)** | `page.tsx` 2971 → **1026 LOC** (−65%); 5 abas em `React.memo`; 5 modais em `next/dynamic` (lazy-load); 4 hooks extraídos; 14 testes FE novos (57→71) | Modifiability, Performance, Testability | modifiability-1 P0→P2; performance-5 (re-render+bundle) P1→P2; testability-1 P0→P1 |
| **Split CC-2 (backend god-client)** | `ConexosClient` 1972 LOC → **REMOVIDO**; substituído por `ConexosBaseClient` (319) + 4 sub-clients (`Cadastro` 263 / `Titulos` 338 / `Baixa` 481 / `Financeiro` 703); 1ª aparição real de `tsyringe` token (`LEGACY_CONEXOS_TOKEN`); `PermutaExecucaoRepository` 51.42% → **100% lines**, +16 testes BE (480→496) | Modifiability, Integrability, Testability | modifiability-2 P0→P2; integrability-1 (god-client) P1→P3; testability-2 **RESOLVIDO** |
| **Baixa multi-título (PR #22, v0.9.0)** | `executarBaixa` itera `titCod 1..N` via `listTitulosAPagar` no MESMO borderô; anti-drift POR título; `titCod: 1` hardcode 5 → 3 sites; teste novo `'titCod 1+2 no mesmo borderô'` | Fault Tolerance, Integrability, Modifiability | fault-tolerance F-5 (multi-título bloqueado) **fechado**; integrability F-5 (`titCod=1` caminho principal) **fechado** |
| **Referência externa (PR #21)** | Coluna nova `referencia_externa` em `permuta_alocacao_execucao` (migration 0021); analista correlaciona baixa com nota externa | Modifiability (Defer Binding) | follow-up `_inbox/permuta-referencia-externa-resume.md` fechado |
| **SWR em `BorderosPanel.tsx`** | Cache-first via `fetchBorderos(false)` → revalida ERP em background via `fetchBorderos(true)`; chip "atualizando…" não bloqueia a UI | Performance, Availability (perceived) | F-performance-5 novo positivo |
| **`deployability-1` reavaliado** | Rollback de **estado ERP** já é 1-clique na UI (`BorderosPanel.tsx:670-703` + `BorderoGestaoService.{cancelarBordero, excluirBordero, excluirBaixa, estornarBordero}`); P0 anterior **rebaixado a P2** (gargalo residual = `rollback.yml` no CI) | Deployability | F-deployability-1 P0 → P2 |
| **`DEV_AUTH_BYPASS` deny-by-default** | `http/authEnv.ts:56,93-101` virou allow-list `['local','dev','development','test']`; `'production'` **CRASHA o boot** com `DEV_AUTH_BYPASS=true`; testes em `authEnv.test.ts:66-118` cobrem 6 nomes deployed | Security | F-security-1 (run 0058) **RESOLVIDO** |
| **Confused-deputy fechado em borderô** | `BorderoGestaoService.requireOwnBorderoFilCod`; `filCod` SEMPRE da trilha (`permuta_alocacao_execucao`), nunca do request; aplicado em 5 ações de borderô | Security | risco "admin manipula borderô de terceiro via filCod arbitrário" **fechado** |
| **R-4 fail-closed (in-doubt)** | `ReconciliacaoPermutaService.ts:178-212` — re-fire de par com `status='reconciling' AND bor_cod IS NOT NULL` aborta SEM re-POSTar; teste cobre | Fault Tolerance, Availability | fault-tolerance F-1 (janela cinza pós-crash) **fechado**; super-pagamento por re-fire = inviável |

> **Tradução para a reunião**: nove itens estruturais entregues em uma jornada de trabalho. Os dois P0 de Fault Tolerance (R-4 + multi-título) abertos há ~3 runs estão **fechados em código verificável**; os dois P0 de Modifiability (god-page + god-client) foram **decompostos e rebaixados a P2** com follow-ups específicos.

## 3. P0/P1 que RESTAM

**Zero P0**. Confirmação cruzada: `grep '^- \*\*Severidade\*\*: P0' docs/regis-review/2026-06-26-1708/*.md` → 0 hits.

**34 P1**, distribuídos:
- **Security (6 P1)**: revogação JWT, RBAC granular, audit auth, lockout, npm audit FE, tenant isolation
- **Fault Tolerance (4 P1)**: Idempotency-Key, reaper, audit borderô DB, drift trilha↔ERP
- **Availability (4 P1)**: multi-título forensic, `/ready`, Sentry, SIGTERM
- **Modifiability (5 P1)**: complexidade-22, route→repo skip, `titCod` hardcode, CONTA_GER, ReconciliacaoPermutaService refactor
- **Testability (5 P1)**: dialogs/hooks CC-1, integration Postgres, ClockProvider, fixtures Conexos, threshold FE
- **Deployability (5 P1)**: smoke pós-deploy, pin Node, bump cross-platform, staging, expand-then-contract
- **Integrability (3 P1)**: services/conexos.ts legado, Zod boundary 100%, template Nexxera/GED/SharePoint
- **Performance (2 P1)**: `listAtivas` sem filtro, `reconciliar-lote` síncrono

## 4. Top 10 risks (cross-QA)

Ranking por composite = severidade × leverage × business impact (money-safety + compliance + SaaSo scale).

### R-1: Audit-trail das ações de borderô (e de auth) sem persistência DB — compliance financeiro frágil
- **QA(s)**: Fault Tolerance, Security
- **Findings**: F-fault-tolerance-4 (`BorderoGestaoService.ts:137-147, 186-191, 208-213, 228-233, 246-249` — só `LogService.info → stdout`); F-security-3 (`routes/auth.ts:25-43` sem persistência)
- **Evidência**: 0/5 ações de borderô em tabela DB; `grep -rn "app_audit\|auth_audit\|login_event"` → 0; `ls migrations | grep -i 'acao_log\|audit'` → vazio. Render rotaciona logs ~7d. Em contraste, **a baixa em si TEM trilha completa** (`permuta_alocacao_execucao`).
- **Impacto técnico**: forense de "quem aprovou o borderô X em 12/06?" depende de `grep` em log volátil; após 7 dias, impossível.
- **Impacto de negócio**: contestação de baixa ("não fui eu que aprovei") sem prova durável; LGPD trilha de acesso ausente; SOX-like SoD frágil. Onboarding do 2º cliente exige auditoria.
- **Cards**: fault-tolerance-4 (P1, M), security-3 (P1, M)
- **Custo de inação em 6 meses**: 1 incidente de contestação sem prova → escalada jurídica; 1 due-diligence de cliente recusada. Esforço hoje: ~3–5d. Adiar → vira P0 no primeiro audit externo.

### R-2: Follow-ups explícitos do R-4 (Idempotency-Key + Reaper) abertos há 4 runs — IN-DOUBTs silenciosos
- **QA(s)**: Fault Tolerance, Security, Availability
- **Findings**: F-fault-tolerance-2 (`/reconciliar-lote` + `/adiantamentos/:docCod/reconciliar` não honram `Idempotency-Key`, vs. `/eleicao` que honra); F-fault-tolerance-3 (sem reaper); F-availability-10 (`reconciling` órfãos sem auto-resync)
- **Evidência**: 1/3 rotas de escrita financeira lê o header. Sem reaper, R-4 fail-closed protege contra super-pagamento mas pares IN-DOUBT continuam invisíveis indefinidamente. `grep stuck|reaper|listStuckReconciling src/backend → 0`. **Aberto desde `2026-06-23-1518` (4ª run).**
- **Impacto técnico**: duplo-clique cross-tab cria 2 borderôs paralelos no `fin010`. Sob multi-título o blast radius aumenta. Pares IN-DOUBT poluem a trilha.
- **Impacto de negócio**: ruído operacional crescente; MTTD de IN-DOUBT = "quando alguém olhar". Compounding com CC-2 multi-título.
- **Cards**: fault-tolerance-2 (P1, M), fault-tolerance-3 + availability-6 (consolidados P1, M)
- **Custo de inação em 6 meses**: 5ª run consecutiva sem fechamento; ~3 IN-DOUBTs/semana invisíveis (premissa: 10 lotes/dia × 1% partial).

### R-3: Legado `services/conexos.ts` (461 LOC) bloqueia migração Lambda + SaaSo
- **QA(s)**: Integrability, Modifiability, Security
- **Findings**: F-integrability-2, F-modifiability-7, F-integrability-7
- **Evidência**: pós-CC-2 a tubulação é `service → sub-client → ConexosBaseClient → LegacyConexosShape (DI) → services/conexos.ts singleton solto`. Legado carrega sessão + lê `process.env.CONEXOS_USERNAME/PASSWORD/BASE_URL` direto (`services/conexos.ts:80,144-145`). 461 LOC vivos. Hardcode tenant `https://columbiatrading.conexos.cloud/api`.
- **Impacto técnico**: 2 caminhos para mudar timeout/headers/retry/login mutex/redaction. Inviolable Rule #8 violada. Alvo Lambda+SSM impraticável.
- **Impacto de negócio**: cliente B (próximo SaaSo) inviável — editar URL em 2 lugares, secret rotation em 2 lugares. Bloqueia "1 conta AWS por cliente".
- **Cards**: integrability-1 + modifiability-7 (consolidados P1, M); modifiability-9 (P2, S)
- **Custo de inação em 6 meses**: ~3–5d para resolver hoje; ~3 semanas para resolver depois com 3 clients usando o padrão.

### R-4: JWT 12h em localStorage + único role `admin` + sem audit/lockout = blast radius máximo
- **QA(s)**: Security (4 P1 no cluster), Fault Tolerance (audit overlap)
- **Findings**: F-security-1, F-security-2, F-security-3, F-security-4
- **Evidência**: `TOKEN_EXPIRATION='12h'` (`AuthService.ts:24`); `localStorage` (`lib/auth/token.ts:5,19`); `signOut()` só `localStorage.removeItem`; sem `jti`; sem `app_token_revoked`. 17× `requireRole('admin')` em `routes/permutas.ts` — única role. `AuthService.login` aceita tentativas ilimitadas no mesmo username.
- **Impacto técnico**: token roubado permanece válido por até 12h. Logout NÃO invalida server-side. Sem maker/checker, 1 credencial fecha o ciclo.
- **Impacto de negócio**: janela de 12h para ataque dirigido executar `POST /permutas/borderos/:b/finalizar` / `/reconciliar-lote`. Incompatível com SOX-like SoD; bloqueia SaaSo financeira de cliente regulado.
- **Cards**: security-1 (P1, M), security-2 (P1, L), security-3 (P1, M), security-4 (P1, M)
- **Custo de inação em 6 meses**: ~3 semanas para o cluster. Adiar até pós-onboarding cliente 2 = retrofit 3× mais caro.

### R-5: Multi-título sem rastreabilidade granular (`bxa_cod_seq` escalar; `request_payload` sobrescreve)
- **QA(s)**: Availability, Fault Tolerance, Modifiability
- **Findings**: F-availability-1 (partial-success cego); F-fault-tolerance-1 (forense degradado)
- **Evidência**: `ReconciliacaoPermutaService.ts:330,346,353-360` — em invoice 3-parcelas, `markSettled` grava só `bxaCodSeqs[0]`; array completo em `erp_response` jsonb. `setRequestPayload` (`:480`) sobrescreve por título — só o payload do último sobrevive. Crash entre `baixarTitulo` k e k+1: ERP tem k baixas; trilha não distingue.
- **Impacto técnico**: R-4 fail-closed impede re-POST (✅); anti-drift por título impede over-pay (✅); **forense é manual** — operador abre Conexos e cruza com `listBaixasErp(borCod)`. Multi-título amplificou intervalo de risco do SIGTERM (F-availability-4) de 1+4 para 1+4×N POSTs.
- **Impacto de negócio**: 5% de baixas multi-título com partial-success por Conexos lento = 5–10 reconciliações manuais/mês no 2º trimestre. Risco contábil **contido** (R-4 + anti-drift); risco operacional **crescente**.
- **Cards**: availability-1 + fault-tolerance-1 (consolidados P1, M)

### R-6: Zero observabilidade externa (sem Sentry, `/health` stub, sem smoke pós-deploy, sem reaper)
- **QA(s)**: Availability, Deployability, Fault Tolerance, Performance
- **Findings**: F-availability-3 (zero APM), F-availability-2 (`/health` stub), F-deployability-2 (sem smoke), F-deployability-8 (sem `/ready`), F-fault-tolerance-3
- **Evidência**: `grep -rn "Sentry|datadog|opentelemetry" src/backend → 0`; `src/backend/index.ts:65 app.get('/health', (_req, res) => res.json({ status: 'ok', version }))` — sem probe de Postgres nem Conexos. MTTD para regressão silenciosa = "primeiro usuário reclama".
- **Impacto técnico**: deploy "verde" pode estar servindo 500 silenciosamente. Render mantém tráfego em backend com pool morto. Multi-título partial-success só é detectado por relato.
- **Impacto de negócio**: MTTD > 30min típico em sistemas sem APM. Em janela de venda do SaaSo, qualquer down-time longo sem dado pós-mortem mina credibilidade.
- **Cards**: availability-3 (P1, S), availability-2 + deployability-8 (P1, S), deployability-2 (P1, S), fault-tolerance-3 + availability-6 (P1, M)

### R-7: Cobertura FE desbloqueada por CC-1 mas threshold inerte + 10/14 sub-componentes sem teste
- **QA(s)**: Testability, Modifiability, Deployability
- **Findings**: F-testability-1, F-testability-7
- **Evidência**: `jest.config.js` em `lines 20 / branches 9 / functions 14`; real pós-CC-1 = `28.83 / 14.44 / 23.22`. **Gate hoje mais frouxo que a realidade**. `AlocarDialog.tsx`, `IngestaoDialog.tsx`, `ReconciliarDialog.tsx`, `useExportRelatorios`, `useIngestao`, `usePermutasData` etc. em **0%**.
- **Impacto técnico**: CC-1 funcionou — padrão de extração provou eficácia (4 componentes ≥80% lines). Disciplina de escrever teste durante extração não.
- **Impacto de negócio**: bug `borderô-finalizar` Stage B aberto (MEMORY) é sintoma direto. Próxima extração (SISPAG aba) replica o anti-padrão.
- **Cards**: testability-1 (P1, L), testability-6 (P1, S — imediato)

### R-8: Drift de cognitive complexity acelerou (20→22 warnings; nova função complexity-31 em `ReconciliacaoPermutaService`)
- **QA(s)**: Modifiability, Testability
- **Findings**: F-modifiability-3, F-modifiability-9
- **Evidência**: `npm run lint --max-diagnostics=200` reporta 22 warnings (era 20). 6 funções >30. `ReconciliacaoPermutaService.ts` cresceu +120 LOC (+22%) pós-write-back e ganhou complexity-31 nova em `:90`. **Sem ratchet no CI**.
- **Impacto técnico**: 22 superfícies onde cada `if` novo multiplica caminhos não-testados. 6 funções > 30 intratáveis por teste unitário 100%.
- **Impacto de negócio**: regressões silenciosas em elegibilidade-permuta e reconciliação — nó de precisão fin010. ReconciliacaoPermutaService é o nó central do risco #1 e está se concentrando.
- **Cards**: modifiability-3 (P1, M), modifiability-9 (P2, S), modifiability-10 (P1, M)

### R-9: `reconciliar-lote` síncrono em HTTP — risco de timeout 502 do proxy Render
- **QA(s)**: Performance, Availability, Fault Tolerance
- **Findings**: F-performance-2
- **Evidência**: `LOTE_MAX=6` síncrono; 6 adtos × ~6 calls × ~500ms ERP = ~18s. Sob multi-título (3 parcelas) = ~72s — dentro do default Render (100s), mas janela cinza de timeout-pós-sucesso cresce.
- **Impacto técnico**: cliente recebe 502 do proxy mas o lote pode ter executado parcialmente. Lambda (alvo) tem teto rígido API Gateway 29s.
- **Impacto de negócio**: P1 anotado no memory; risco operacional cresce com volume.
- **Cards**: performance-2 (P1, L)
- **Custo de inação em 6 meses**: vira P0 a partir de ~30 automáticas/dia.

### R-10: Migrations forward-only (21 UP, 0 DOWN) + sem staging
- **QA(s)**: Deployability, Modifiability
- **Findings**: F-deployability-6, F-deployability-5
- **Evidência**: `src/backend/migrations/runMigrations.ts:25-54` só UP; `ls migrations/*.sql` = 21 UP, 0 DOWN. `render.yaml:11 branch: main` + `autoDeploy: true`. "Homologação" = flip de `CONEXOS_BASE_URL` no MESMO container.
- **Impacto técnico**: rollback de **estado ERP** coberto (1-clique UI). Gargalo é schema: rename/drop futuro inviabiliza rollback do código.
- **Impacto de negócio**: SISPAG/Popula GED com mesma prática inviável. Sem expand-then-contract, refatoração de schema vira incidente.
- **Cards**: deployability-5 (P1, M), deployability-6 (P1, M-L)

## 5. Cross-cutting findings (causa-raiz repetida)

### CC-1: `services/conexos.ts` legado é o offender singular de 3 QAs
- **Aparece em**: Integrability (F-2, F-7), Modifiability (F-7), Security (parcial — Rule #8)
- **Findings**: F-integrability-2, F-integrability-7, F-modifiability-7
- **Diagnóstico unificado**: pós-CC-2, todos os 4 sub-clients Conexos são DI puros e atravessam `ConexosBaseClient` — mas o último elo (`LegacyConexosShape`) ainda passa pelo singleton solto `services/conexos.ts` que lê `process.env.CONEXOS_*` direto. Toda a sessão Conexos vive nesse legado.
- **Recomendação consolidada**: 1 card único — `[integrability-1 + modifiability-7]`. Mover sessão + axios + mutex + 401-retry para dentro do `ConexosBaseClient`, consumindo `EnvironmentProvider` via `@inject`. Apagar `services/conexos.ts` e `legacyConexosAdapter.ts` (~461 LOC). `LEGACY_CONEXOS_TOKEN` removido.

### CC-2: ontology desatualizado pós-CC-2 (doc-of-record divergiu)
- **Aparece em**: Integrability (F-5), Modifiability (impacto navegação), Testability (impacto `_index.json`)
- **Findings**: F-integrability-5 (`ontology/integrations/conexos.md` com 7 menções a `ConexosClient.ts` REMOVIDO)
- **Diagnóstico unificado**: CC-2 entregou estrutura de código; ontologia continua apontando para arquivo morto. `_index.json` / `_coverage.json` podem estar referenciando `ConexosClient.ts` que não existe.
- **Recomendação consolidada**: 1 card — `[integrability-5]` (S, ≤1d).

### CC-3: Audit-trail DB ausente (borderô + auth) — compliance financeiro
- **Aparece em**: Fault Tolerance (F-4), Security (F-3)
- **Findings**: F-fault-tolerance-4, F-security-3
- **Diagnóstico unificado**: a baixa em si tem trilha completa em `permuta_alocacao_execucao`; gap em (a) gestão do ciclo de vida do borderô após a baixa, e (b) auth. Padrão write-ahead → resultado da `permuta_alocacao_execucao` é o template a copiar.
- **Recomendação consolidada**: 2 cards espelhados — `[fault-tolerance-4]` (`bordero_acao_log`) e `[security-3]` (`app_audit_auth`).

### CC-4: Follow-ups do R-4 (Idempotency-Key + Reaper + drift) — invariante R-4 vira hard-stop com instrumentação
- **Aparece em**: Fault Tolerance (F-2, F-3, F-5), Availability (F-10, F-6), Security (anti-replay)
- **Findings**: F-fault-tolerance-2, F-fault-tolerance-3, F-fault-tolerance-5, F-availability-10
- **Diagnóstico unificado**: R-4 fail-closed bloqueia super-pagamento. **Muro inerte** sem (a) detecção do estado IN-DOUBT (reaper), (b) defesa no boundary contra duplo-fan-out (Idempotency-Key), (c) detecção de divergência cross-system (drift). Os 3 são instrumentação ao redor da mesma invariante.
- **Recomendação consolidada**: 3 cards — `[fault-tolerance-2]` (M, defesa entrada), `[fault-tolerance-3 + availability-6]` (M, detecção saída), `[fault-tolerance-5]` (M-L, comparação cross-system). Compartilham repo (`permuta_alocacao_execucao`).

### CC-5: `page.tsx` 1026 LOC + 10/14 sub-componentes da CC-1 sem teste
- **Aparece em**: Modifiability (F-1), Performance (F-7), Testability (F-1)
- **Findings**: F-modifiability-1, F-performance-7, F-testability-1
- **Diagnóstico unificado**: CC-1 entregou a quebra estrutural; padrão de extração funcionou. Em 10 dos 14 sub-componentes novos, **teste não foi escrito**. Threshold FE não foi bumpado, gate ficou frouxo.
- **Recomendação consolidada**: 2 cards — `[testability-1]` (L, cobrir dialogs+hooks), `[modifiability-1 + performance-6]` (M, continuar split: extrair `useFiltros`/`useAlocacaoManual`/`useReconciliar`/`useLote`).

### CC-6: Defer-binding ausente em regras numéricas (CONTA_GER + titCod) — bloqueio SaaSo
- **Aparece em**: Modifiability (F-5, F-6), Integrability (F-3 — Zod)
- **Findings**: F-modifiability-5, F-modifiability-6, F-integrability-3
- **Diagnóstico unificado**: 5 valores numéricos do plano de contas Columbia vivem como `const` em service. Trocar plano = redeploy; multi-tenant = fork de code-path. Zod ainda 2/5 passos no `fin010`.
- **Recomendação consolidada**: 2 cards — `[modifiability-6]` (S) e `[integrability-2]` (M).

## 6. Quick wins (≤5 dias úteis, esforço S, severidade ≥ P2)

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| **security-5 + deployability-7** | Security + Deployability | S | P1 | `npm audit --audit-level=high` no FE; vuln `ws` HIGH deixa de passar; paridade BE/FE |
| **availability-2 + deployability-8** | Availability + Deployability | S | P1 | `/ready` real probra Postgres + Conexos + última migration; Render aponta para ele; janela "deploy verde / serviço quebrado" → ≤30s |
| **availability-3** Sentry/APM + cron checkIn | Availability | S | P1 | MTTD para regressão BE cai de >30min → <5min; ≥3 alertas |
| **availability-4** Graceful shutdown SIGTERM | Availability | S | P1 | Reconciliações em curso terminam handshake; borderôs órfãos por deploy → ~0 |
| **deployability-2** Smoke test pós-deploy `/health.version` | Deployability | S | P1 | MTTD de "deploy promoveu versão errada" → ≤10min |
| **deployability-3** Pinar Node (`.nvmrc` + `engines`) | Deployability | S | P1 | Node distintos no repo 2 → 1; cron de ingestão deixa de divergir do CI |
| **modifiability-5** Encapsular `titCod` invoice | Modifiability | S | P1 | 3 hardcodes `titCod: 1` → 0; `Invoice.tituloAlvoTitCod()` testável |
| **modifiability-6** Externalizar CONTA_GER via `EnvironmentVars` | Modifiability | S | P1 | 2 constantes hardcoded → 0; override por tenant viável |
| **performance-1** `listAtivas` → `findByAdiantamento(docCod)` + LIMIT | Performance | S | P1 | rows lidas por `reconciliar-lote` (n=6, trilha 1000): 12000 → ≤60 |
| **testability-6** Bumpar threshold FE 20→28 imediato | Testability | S | P1 | gate deixa de ser mais frouxo que o real |
| **integrability-5** Atualizar `ontology/integrations/conexos.md` pós-CC-2 | Integrability | S | P2 | 7 menções a `ConexosClient.ts` morto → 0; 5 sub-clients novos documentados |
| **integrability-6** Banir `process.env.X` em service/client + lint | Integrability | S | P2 | 5 leituras → 0; PatternGuardian gate ativo |
| **deployability-1** `rollback.yml` (`workflow_dispatch` por SHA) | Deployability | S | P2 | MTTR rollback de código: ~10min → ≤3min (estado já é 1-clique UI) |
| **security-7** Helmet + security headers | Security | S | P2 | headers backend: 0 → ≥5; securityheaders.com F → A |
| **security-8** Remover `credentials: true` do CORS | Security | S | P2 | armadilha CSRF latente removida |
| **fault-tolerance-6** Trocar silent catch de `listTitulosAPagar` por log explícito | Fault Tolerance | S | P2 | diagnóstico claro ("ERP não devolveu títulos" vs. "anti-drift") |

**Total quick wins**: 16 cards S, 10 P1 + 6 P2. Cabe em 1 sprint. Fecha 3 cross-cutting (CC-1 parcial, CC-2, CC-6) e atinge 6 dos 10 top-risks.

## 7. Strategic moves (M / L / XL)

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| **integrability-1 + modifiability-7** Eliminar `services/conexos.ts` | Integrability + Modifiability + Security | M | Use an Intermediary / Manage Resource Coupling | Remove 461 LOC de legado, 3 `process.env.CONEXOS_*`, 1 hardcode de tenant URL. **Bloqueia Lambda+SaaSo hoje**. |
| **fault-tolerance-2** Idempotency-Key em `/reconciliar-lote` + `/reconciliar` | Fault Tolerance + Security + Availability | M | Idempotent Replay (boundary) | 1/3 → 100%. Sob multi-título, blast radius de duplo-clique aumenta. Follow-up explícito do R-4 (4ª run). |
| **fault-tolerance-3 + availability-6** Stuck-state reaper | Fault Tolerance + Availability | M | Condition Monitoring + Reconcile | MTTD órfão: "indefinido" → ≤10min. Sem isto, R-4 é muro inerte. **4ª run pedindo.** |
| **fault-tolerance-4** Audit-trail DB das ações de borderô | Fault Tolerance + Security | M | Condition Monitoring + Quarantine | 5/5 ações só stdout; Render rotaciona ~7d. Compliance LGPD/SOX-like ausente. |
| **fault-tolerance-5** Drift detection trilha↔fin010 | Fault Tolerance | M-L | Reconcile | Tempo de detecção cross-system: humano → ≤24h. |
| **availability-1 + fault-tolerance-1** Multi-título `bxa_cod_seqs[]` array | Availability + Fault Tolerance | M | State Resynchronization + Idempotent Replay | Parcelas representadas 1/N → N/N. Sem isto, forense de partial-success é 100% manual. |
| **integrability-2** Zod 100% no write-side `fin010` | Integrability + Security + Fault Tolerance | M | Tailor Interface / Validate Input | 5/26 (19%) → ≥21/26; write-side 2/5 → 5/5. Mudança silenciosa de shape vira `NaN`. |
| **security-1** Revogação JWT + TTL 4h | Security | M | Revoke Access | TTL 12h → 4h; revogação ∞ → ≤60s. |
| **security-2** RBAC granular + 4-eyes | Security | L | Authorize Actors | 1 role → ≥3; endpoints 4-eyes 0 → 2. |
| **security-3** Audit trail de auth | Security + Fault Tolerance | M | Audit Trail / Detect Intrusion | Retenção ~7d (Render) → ≥365d (Supabase). |
| **security-4** Lockout por conta + alerting | Security | M | Lock Computer / Detect Intrusion | Tentativas/min ∞ → ≤5 antes do lock. |
| **security-6** Tenant isolation (`tenant_id` + SSM) | Security | XL | Separate Entities | **Bloqueio comercial da SaaSo no 2º cliente**. |
| **modifiability-3** Reduzir 22 warnings de cognitive-complexity (top-6) | Modifiability + Testability | M | Refactor | 6 funções > 30; pior = 65. Regressões em elegibilidade-permuta/reconciliação. |
| **modifiability-4** Biome `noRestrictedImports` (routes !→ repo/client) | Modifiability + Deployability | M | Restrict Dependencies | 6 cross-layer imports persistem. Preparação direta para Lambda alvo. |
| **modifiability-10** Refatorar `ReconciliacaoPermutaService` | Modifiability + Fault Tolerance + Testability | M | Refactor + Split Module | Serviço mais crítico cresceu 542→662 LOC (+22%); complexity-31 nova. |
| **performance-2** `reconciliar-lote` async com job | Performance + Availability + Fault Tolerance | L | Bound Execution Times + Schedule Resources | 502 do proxy iminente. Lambda alvo: teto rígido API Gateway 29s. Latência HTTP 10–25s → <500ms. |
| **deployability-5** Render service de staging | Deployability + Testability + Security | M | Scale Rollouts | Sem staging, validar escrita ERP exige flip em prd. # ambientes 1 → 2. |
| **deployability-6** Política expand-then-contract + migrations down | Deployability + Modifiability | M-L | Rollback (data layer) | 21 UP, 0 DOWN. Rollback de **estado** já 1-clique; gargalo é schema. |
| **testability-1** Cobrir dialogs+hooks CC-1 + `page.tsx`/`BorderosPanel.tsx` | Testability + Modifiability + Performance | L | Limit Structural Complexity + Specialized Interfaces | 10/14 da CC-1 em 0%. Bug `borderô-finalizar` Stage B é sintoma direto. |
| **testability-3** Integration tests Postgres | Testability + Deployability | L | Sandbox | 0 integration tests; SQL real nunca executado contra Postgres. |
| **testability-4** ClockProvider + RandomProvider injetáveis | Testability + Modifiability | M | Limit Non-Determinism | 22 `new Date()` em código-fonte BE; flake em CI. |
| **testability-5 + integrability-3** Fixtures HAR Conexos | Testability + Integrability | M | Recordable Test Cases / Contract Testing | 0 fixtures; mudança de shape ERP só detectada em prod. |
| **integrability-4** Template `ontology/integrations/_template.md` + Nexxera/GED/SharePoint | Integrability | XL (escopo deste card = template + ordenação) | Encapsulate / Discover Service | Frente II e III bloqueadas. |

## 8. O que está bem (e por quê)

1. **Idempotência write-ahead** — `idempotency_key UNIQUE`; `beginExecution` UPSERT preserva `settled` (`PermutaExecucaoRepository.ts:223-256`). Cobertura 100% com teste.
2. **R-4 fail-closed** — `ReconciliacaoPermutaService.ts:178-212` aborta re-fire órfão SEM re-POSTar. **Super-pagamento por re-fire = inviável.**
3. **Anti-drift por título** — aplicado POR TÍTULO no loop multi-título (`:418-426`). Over-pay numa parcela detectado.
4. **DEV_AUTH_BYPASS deny-by-default** — `http/authEnv.ts:56`; `'production'` CRASHA o boot. Defesa em profundidade fechada.
5. **Confused-deputy fechado** — `requireOwnBorderoFilCod`; `filCod` da TRILHA, nunca do request.
6. **Rollback de estado ERP 1-clique** — `BorderosPanel.tsx:670-703` + 4 ações gated por `CONEXOS_WRITE_ENABLED`. Nenhuma ação destrutiva sem caminho reverso na UI.
7. **DDD layering preservado** — services injetam só sub-clients pós-CC-2. `grep '@inject(ConexosBaseClient)' src/backend/domain/service` → 0.
8. **SQL 100% parametrizado** — única interpolação em `PermutaExecucaoRepository.ts:394` gera nomes de placeholder, não valores.

> Estes 8 pontos são o núcleo da rede de proteção. O Top-10 é sobre instrumentação e granularidade, **não sobre money-safety primária**.

## 9. Limitações da análise

- **Não medível localmente**: MTTR real, uptime mensal, latência p95 Conexos em prd, # de execuções `error` históricas, frequência de SIGTERM, # de IN-DOUBTs em prod, # de multi-título partial-success, taxa de timeout 502 do proxy, flake rate, MTTD de credencial vazada. Sem APM (sem AWS/CloudWatch/X-Ray). Toda recomendação de SLO depende do card `availability-3`.
- **Bundle bytes por rota (Next.js First Load JS)**: não medível (build não executado).
- **Cobertura runtime do fluxo Conexos real**: sem sandbox ERP em CI. `testability-5` (fixtures HAR) cobre parcial.
- **NÃO cobertos pelo pipe**: chaos engineering, threat modeling formal, custo cloud, UX (DesignReviewer parcial), acessibilidade, performance de carga 100+ users, secret rotation, DR (RTO/RPO).
- **Janela**: snapshot de 2026-06-26 17:08 (run 1708). Refazer trimestralmente; próximo run sugerido pós-SISPAG MVP.
- **Edição de cards no consolidator**: 8 dedupes aplicados no KANBAN, documentados na seção 5. Nenhum ID original alterado; consolidados usam notação `[a-N + b-M]`.

## 10. Ações recomendadas (próximos 30 dias)

1. **Sprint quick wins (1ª semana)**: 16 cards S da seção 6 em paralelo. Resolve 3 cross-cutting e atinge cabeças de 6 dos 10 top-risks. Não exige decisão estratégica.
2. **Cluster R-4 follow-ups (2ª-3ª semana)**: `fault-tolerance-2` + `fault-tolerance-3+availability-6` + `fault-tolerance-4` + `fault-tolerance-5`. Todos M; paralelos (compartilham `permuta_alocacao_execucao`). **Fecha o cluster R-4 anotado há 4 runs.**
3. **Eliminar legado Conexos (3ª-4ª semana)**: `integrability-1 + modifiability-7` (M, 3–5d). Sinérgico com `integrability-6` no quick-wins. **Desbloqueia Lambda+SaaSo.**
4. **Cobertura FE (4ª semana)**: `testability-1` (L). Sequência: `testability-6` (no quick-wins) libera threshold; `testability-1` ataca os 10 sub-componentes da CC-1.
5. **Discussão estratégica com Yuri (paralela)**: `security-6` (XL, tenant isolation) e `security-2` (L, RBAC + 4-eyes). Janela de retrofit se fecha rápido após onboarding cliente 2. Recomendação: começar `security-6` agora; `security-2` aceitar como dependente.
