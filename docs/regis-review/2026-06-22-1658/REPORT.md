---
type: regis-review-report
run_id: 2026-06-22-1658
generated_at: 2026-06-22T19:25:00Z
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
total_cards: 59
total_p0: 9
total_p1: 28
total_p2: 17
total_p3: 5
overall_score: 5.7
---

# Regis-Review — financeiro — 2026-06-22-1658

> Snapshot do app v0.4.0 (Frente I — Permutas, READ-ONLY no Conexos). PR #4 (`feat/permutas-multiplas`)
> introduziu distribuição greedy Simples, eleição, ingestão, gestão, cliente-filtro com auto-ingest e
> alocação manual N:M cross-process. SISPAG e Popula GED ainda não existem.
> Backend: Express puro em Render. Frontend: Next.js em Vercel. DB: Supabase (Postgres + Auth).
> O alvo (Lambda multi-tenant via Terraform) ainda **não** está no código.

## 1. Executive scorecard

**Pesos aplicados** (domínio financeiro multi-tenant que executa escritas que movem dinheiro):
Security 1.5, Fault Tolerance 1.3, Availability 1.2, Modifiability 1.2, Testability 1.0, Performance 1.0, Integrability 0.9, Deployability 0.9 (Σ = 9.0).
Cálculo: **(5.5×1.5 + 6.5×1.3 + 6×1.2 + 5×1.2 + 6.5×1.0 + 4×1.0 + 6×0.9 + 6×0.9) / 9 = 51.20 / 9.0 = 5.69 → 5.7**.

| QA | Score (0–10) | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 6.0 | 0 | 4 | 4 | 1 | F-availability-1: auto-ingest UI esgota `heavyRouteLimiter` e dispara fan-out Conexos não-coalescido (429 reproduzido em produção) |
| Deployability | 6.0 | 2 | 4 | 3 | 0 | F-deployability-1: cron `ingest-permutas` em `main` compartilha Supabase com `.env` dev (contaminação dev↔prd) |
| Integrability | 6.0 | 1 | 2 | 4 | 1 | F-integrability-8: write-side `fin010` inexiste — risco arquitetural #1 sem prova de conceito |
| Modifiability | 5.0 | 0 | 6 | 2 | 1 | F-modifiability-4: `EleicaoPermutasService.computeCandidatas` cogn. complexity 65 (4.3× o limite) |
| Performance | 4.0 | 2 | 4 | 3 | 1 | F-performance-5: `ConexosClient` `axios.create` SEM `timeout:` → chamada lenta segura pool e advisory lock indefinidamente |
| Fault Tolerance | 6.5 | 0 | 6 | 2 | 0 | F-fault-tolerance-2: `AlocacaoPermutasService.alocar` faz 5 reads/writes sem `withTransaction` (over-allocation possível) |
| Security | 5.5 | 3 | 5 | 1 | 0 | F-security-1: 0/12 rotas `/permutas` checam papel — qualquer JWT válido dispara CRUD financeiro e fan-out Conexos |
| Testability | 6.5 | 3 | 3 | 2 | 1 | F-testability-3: FE `collectCoverageFrom` ausente — 82.19% reportado é falso (cobertura efetiva ≈ 16%) |
| **Overall** | **5.7** | **11** | **34** | **21** | **5** | — |

> Os contadores por QA acima somam **71** (com duplicatas entre QAs). Após deduplicação cross-cutting (ver §3), o Kanban consolidado tem **59 cards** distintos: 9 P0, 28 P1, 17 P2, 5 P3.

**Score interpretation:**
- 0–3: risco estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais
- 9–10: estado-da-arte para o estágio atual

Conclusão da escala: **5.7 = dívida defensável**, com Performance (4.0) em zona de risco estrutural e Security/Modifiability puxando para baixo nos QAs de maior peso. A bagagem positiva (DDD a partir do service, idempotency-key no /eleicao, `BoundedConcurrency`, `withTransaction` no `persistIngestRun`, advisory lock, Zod em 6/6 endpoints novos) garante que o salto para 7+ é **trabalho proporcional**, não reescrita.

## 2. Top 10 risks (cross-QA)

Ranking por severidade × business impact × leverage. Cada item amarra a um número objetivo.

### R-1: `ConexosClient` sem timeout HTTP — 1 outage Conexos = paralisia total
- **QA(s) afetados**: Performance (P0), Availability, Fault Tolerance
- **Findings de origem**: F-performance-5, F-availability-4, F-fault-tolerance-5
- **Evidência sintetizada**: `grep -n "timeout:" src/backend/domain/client/ConexosClient.ts` retorna ZERO; o `BcbClient.ts:57` tem `timeout: 10_000`. Uma chamada Conexos "cinza" fica viva até `tcp_keepalive_time` do SO (~7200s). `BoundedConcurrency` em loop → handler trava → advisory lock segurado por horas.
- **Impacto técnico**: até 50 handlers (5 filiais × 10 adto) presos, cada um segurando 1 das 5 conexões do pool DB + 1 sessão Conexos. Ingestão das próximas janelas perdida; lock só liberado por reinício do processo.
- **Impacto de negócio**: 1 incidente Conexos = outage compartilhado do nosso painel. Em dia de fechamento, bloqueia decisões do analista por horas. Aparece como "o sistema de vocês caiu" embora a causa-raiz seja upstream.
- **Card(s) Kanban relacionados**: performance-2 (S, ≤1d) — card mais barato com maior alavancagem do relatório
- **Custo de inação em 6 meses**: 1–2 incidentes Conexos prolongados/ano × 4–8h de painel inutilizado × valor de uma janela de fechamento = ticket recorrente. Na Fase 3 ligada, lock segurado vira janela em que write-back fica retido — incidente pior.

### R-2: Auto-ingestão por clique de UI esgota `heavyRouteLimiter` (429 reproduzido em produção)
- **QA(s) afetados**: Performance (P0), Availability (P1), Security (P1), Fault Tolerance (P1)
- **Findings de origem**: F-performance-1, F-availability-1, F-security-5, F-fault-tolerance-1
- **Evidência sintetizada**: `src/frontend/app/permutas/clientes-filtro/page.tsx:99,133` chama `runIngestaoManual()` automaticamente. `heavyRouteLimiter` = 10 req/min/IP cobre TODAS as rotas `/permutas/*`. 3 adições rápidas atrás de NAT batem 429.
- **Impacto técnico**: cada clique = fan-out completo (~1.000 chamadas Conexos). Bulk de 5 importadores = 5 fan-outs sequenciais. Lock advisory monopolizado.
- **Impacto de negócio**: onboarding de cliente-filtro é a operação mais frequente; "tente em 1 min" mata UX. Empurra analista de volta para o portal Conexos.
- **Card(s) Kanban relacionados**: cc-auto-ingest-coalesce (M, 2–5d, merge de performance-1+availability-1+parte de security-5+fault-tolerance-1); availability-3 (S)
- **Custo de inação em 6 meses**: cada novo tenant inflaciona o problema. Em ≥2 clientes, `LOGIN_ERROR_MAX_SESSIONS` regular.

### R-3: Sem RBAC server-side — qualquer JWT válido dispara CRUD financeiro
- **QA(s) afetados**: Security (P0), Fault Tolerance, Availability (DoS lateral)
- **Findings de origem**: F-security-1
- **Evidência sintetizada**: `grep -rn "role !==\|requireRole" src/backend/routes` = 0 hits. `AuthService.signToken` insere `role` no JWT, nenhuma das 12 rotas `/permutas/*` consome. Audit trail usa `sub` sem garantia de papel.
- **Impacto técnico**: analista de teste cria/sobrescreve `cliente-filtro` alheio, dispara ingestão, cria alocações em adto que não são seus (UPSERT por `(adto, invoice)`).
- **Impacto de negócio**: na Fase 3 ou SISPAG, mesmo gap = autorização indevida de pagamento. Multi-tenant SaaSo cai por terra mesmo dentro do mesmo cliente.
- **Card(s) Kanban relacionados**: security-1 (M, 2–5d)
- **Custo de inação em 6 meses**: audit trail vira ficção. Em compliance LGPD/Cosec = parecer adverso.

### R-4: Credenciais de produção em `.env` local dev (Conexos + DB + JWT secret HS256)
- **QA(s) afetados**: Security (P0), Integrability (P1)
- **Findings de origem**: F-security-2, F-integrability-1
- **Evidência sintetizada**: `src/backend/.env:1-10` contém `CONEXOS_USERNAME=MPS_FRANCINEI`, senha, DB connstring Supabase e `AUTH_JWT_SECRET`. HS256 simétrico = mesmo segredo assina E verifica → máquina dev comprometida forja JWTs com qualquer `sub`/`role`.
- **Impacto técnico**: bypass total do login. Auditoria gravada com `sub` escolhido. Mesma senha de serviço (sem MFA) loga no portal Conexos.
- **Impacto de negócio**: única defesa SaaSo é segredo único por tenant + rotação. Sem isso, comprometer **um** dev compromete **todos** os tenants.
- **Card(s) Kanban relacionados**: security-2 (M, 2–5d); integrability-1 (M)
- **Custo de inação em 6 meses**: probabilidade baixa, impacto catastrófico. Na Fase 3 ligada, leak = baixa fraudulenta auditada como terceiro.

### R-5: Request logger imprime `req.body` cru → senha de `/auth/login` em log (LGPD)
- **QA(s) afetados**: Security (P0)
- **Findings de origem**: F-security-3
- **Evidência sintetizada**: `src/backend/index.ts:44-45` faz `console.log(\`[REQ] ${requestId} body=${JSON.stringify(body)}\`)`. `routes/auth.ts` recebe `{username, password}` em JSON. Stdout do Render → log drain → senhas em texto plano.
- **Impacto técnico**: senhas dos analistas vazam para qualquer agregador. Invalida toda auditoria pós-vazamento.
- **Impacto de negócio**: violação LGPD direta. Em SaaSo "senha nunca toca disco em texto plano nem em log".
- **Card(s) Kanban relacionados**: security-3 (S, ≤1d) — `redactBody`. **Quick-win obrigatório**.
- **Custo de inação em 6 meses**: 1 leak = ticket público + obrigatoriedade de comunicar titulares. Custo desproporcional ao tamanho do fix.

### R-6: Idempotency-Key ausente em 4/5 POSTs mutativos (`/ingestao`, `/cliente-filtro`, `/alocacoes`, `/processar`)
- **QA(s) afetados**: Fault Tolerance (P1 hoje, P0 na Fase 3), Availability (P2), Performance (P1)
- **Findings de origem**: F-fault-tolerance-4, F-availability-7
- **Evidência sintetizada**: `/permutas/eleicao` implementa pattern; outras rotas dependem **só** de UPSERT por chave natural — basta payload mudar no retry para sobrescrever.
- **Impacto técnico**: duplo-click ou retry de Service Worker em `/ingestao` paga 2 fan-outs full-tenant. Em `/processar`/`/alocacoes`, observação ou `valorAlocado` distinto sobrescreve sem rastro.
- **Impacto de negócio**: hoje custa minutos de Conexos; na Fase 3 vira baixa dupla irreversível.
- **Card(s) Kanban relacionados**: fault-tolerance-4 (M, 2–5d); availability-3 (S)
- **Custo de inação em 6 meses**: trava a Fase 3.

### R-7: Cron `ingest-permutas` em `main` compartilha Supabase com dev (contaminação)
- **QA(s) afetados**: Deployability (P0), Security, Fault Tolerance
- **Findings de origem**: F-deployability-1, F-deployability-5, F-deployability-9
- **Evidência sintetizada**: `.github/workflows/ingest-permutas.yml:7-9,30` usa `secrets.DATABASE_CONNECTION_STRING` ÚNICA. `.env` dev usa a mesma. Cron 3×/dia grava enquanto dev testa local.
- **Impacto técnico**: dados teste mascaram fatos reais e vice-versa; migration em dev altera schema usado em prd. `triggered_by='cron'` × manual indistinguível por instância.
- **Impacto de negócio**: clássico "achei que era dev, era prd". Em compliance financeiro, contaminação de ambiente é P0.
- **Card(s) Kanban relacionados**: deployability-1 (M); deployability-9 (M); security-8 (L)
- **Custo de inação em 6 meses**: 1 incidente "DDL ad-hoc quebrou prd" por trimestre é realista.

### R-8: `page.tsx` 2127 LOC com 0% de cobertura efetiva
- **QA(s) afetados**: Modifiability (P1), Testability (P0), Performance (P2)
- **Findings de origem**: F-modifiability-1, F-testability-2, F-testability-3, F-performance-7
- **Evidência sintetizada**: 2127 LOC, 10 componentes, 26 useState, 9 useCallback. `jest.config.js` sem `collectCoverageFrom` — Jest mede só ~10 dos 196 `.tsx`. 82.19% reportado é falso; cobertura efetiva ~16%.
- **Impacto técnico**: cada `/feature-tweak` reedita o mesmo arquivo, conflito de merge entre branches paralelas (já vivido). Quando SISPAG ganhar página análoga, padrão é replicado.
- **Impacto de negócio**: gerência crê em 82%, realidade é 16%. Decisão de risco com métrica falsa.
- **Card(s) Kanban relacionados**: testability-3 (S), testability-2 (M), modifiability-1 (M)
- **Custo de inação em 6 meses**: cada feature custa 1.5–2× o tempo esperado.

### R-9: Fase 3 (write-back `fin010`) sem gates pré-prod — risco arquitetural #1
- **QA(s) afetados**: Integrability (P0), Fault Tolerance (P1, P0 na Fase 3), Modifiability (P1)
- **Findings de origem**: F-integrability-8, F-fault-tolerance-7, F-fault-tolerance-6, F-modifiability-6
- **Evidência sintetizada**: `ConexosClient` 100% read-only (13/13 métodos). `migration-debt.md:42` declara Risco #1. Faltam: contrato wire, erro tipado de write, idempotência de escrita, rollback shim, reconciliação local↔ERP. `alocar` em cogn. 26 — Fase 3 adiciona passo aí dentro.
- **Impacto técnico**: ligar write-back sem 5 gates = double-execution + dashboard mentiroso + auditoria impossível.
- **Impacto de negócio**: ROI da Frente I parado no painel read-only. Sem write-side, automação não fecha o loop.
- **Card(s) Kanban relacionados**: integrability-8 (L), fault-tolerance-6 (L), fault-tolerance-4 (M), modifiability-6 (M), modifiability-5 (L)
- **Custo de inação em 6 meses**: Frente I trava no painel read-only. Sem ROI, contrato pode não renovar.

### R-10: 14 warnings de cognitive complexity em services (max 65 em `EleicaoPermutasService:523`)
- **QA(s) afetados**: Modifiability (P1, múltiplos), Testability, Fault Tolerance
- **Findings de origem**: F-modifiability-2, F-modifiability-4, F-modifiability-5, F-modifiability-6
- **Evidência sintetizada**: Biome reporta 14 warnings: `computeCandidatas` 65, `toCasamentoRows` 43 (greedy PR #4 — ADR-0010), `toPendente` 42, `alocar` 26, `buscarInvoices` 23, `mapDocPagar` 24, `_doLogin` 20. Limite 15. PR #4 introduziu 3 novas.
- **Impacto técnico**: regressão silenciosa na regra greedy (ADR-0010 fix do bug 1408 ZNSHINE R$ 743k → R$ 260k) custa caro. Cada ajuste toca corpo de 70+ linhas.
- **Impacto de negócio**: MTTR de bug no caminho crítico cresce. Onboarding lento.
- **Card(s) Kanban relacionados**: modifiability-3 (S), modifiability-4 (M), modifiability-5 (L), modifiability-6 (M), modifiability-2 (S)
- **Custo de inação em 6 meses**: Fase 3 entra com dívida no caminho crítico; cogn. 26 vira 30+ no `alocar`.

## 3. Cross-cutting findings

### CC-1: Caminho cliente-filtro → auto-ingestão → fan-out Conexos não-coalescido
- **Aparece em**: Performance (F-performance-1, F-performance-4), Availability (F-availability-1, F-availability-9), Security (F-security-5), Fault Tolerance (F-fault-tolerance-1)
- **Diagnóstico unificado**: o frontend (`clientes-filtro/page.tsx`) acopla-se ao backend violando simultaneamente: sem coalescing (Manage Sampling Rate), sem cota per-user (Limit Exposure), sem feature flag para desligar (Reconfiguration), com compensação client-side (Compensating Transaction). É um único defeito de design em 4 QAs.
- **Recomendação consolidada**: **cc-auto-ingest-coalesce** (P0, M) substitui performance-1+availability-1 e cobre parte de fault-tolerance-1+security-5.

### CC-2: `ConexosClient` axios sem timeout
- **Aparece em**: Performance (F-performance-5, P0), Availability (F-availability-4), Fault Tolerance (F-fault-tolerance-5)
- **Diagnóstico unificado**: ausência de `timeout:` no `axios.create` viola Bound Execution Times (Perf), Removal from Service (Avail), Timeout (FT) simultaneamente.
- **Recomendação consolidada**: **performance-2** (S, ≤1d) — `axios.create({timeout: 30_000})` + `keepAlive`. Card mais barato com maior alavancagem do relatório.

### CC-3: Secrets em `.env` + HS256 + sem RBAC + sem revogação + token em `localStorage`
- **Aparece em**: Security (F-security-1, F-security-2, F-security-3, F-security-4, F-security-7), Integrability (F-integrability-1)
- **Diagnóstico unificado**: vertical de auth com 5 vulnerabilidades que se reforçam. Fechar um buraco sem fechar os outros é fingir.
- **Recomendação consolidada**: pacote de 30 dias: security-3 (S) → security-1 (M) → security-2 (M) → security-7 (M) → security-4 (M) → integrability-1 (M).

### CC-4: `page.tsx` god-component + Coverage FE falso + Magic numbers em services
- **Aparece em**: Modifiability (F-modifiability-1, F-modifiability-8), Testability (F-testability-2, F-testability-3), Performance (F-performance-7), Deployability (F-deployability-6)
- **Diagnóstico unificado**: ausência de Split Module no FE + ausência de `collectCoverageFrom` + magic numbers em services — sintomas do mesmo descuido: testes/observabilidade não acompanharam o crescimento da feature.
- **Recomendação consolidada**: testability-3 (S — destravar medição) → testability-2 + modifiability-1 em paralelo. modifiability-8 (S) como pré-requisito de tuning.

### CC-5: Fase 3 (write-back `fin010`) sem gates pré-prod
- **Aparece em**: Integrability (F-integrability-8, P0), Fault Tolerance (F-fault-tolerance-6/7/4), Modifiability (F-modifiability-5/6), Availability (Notas)
- **Diagnóstico unificado**: Fase 3 bloqueada por 5 ausências: contrato wire não probed, sem idempotência genérica, sem reconciliação local↔ERP, `ConexosClient` monolítico, `alocar` em cogn. 26.
- **Recomendação consolidada**: bloquear merge da Fase 3 enquanto não estiverem verdes: integrability-8 (L) + fault-tolerance-4 (M) + fault-tolerance-6 (L) + modifiability-5 (L) + modifiability-6 (M).

### CC-6: Observabilidade ausente cross-QA
- **Aparece em**: Availability (F-availability-2/5/8), Performance (F-performance-9), Integrability (F-integrability-6), Security (F-security-6), Deployability (F-deployability-7), Fault Tolerance (F-fault-tolerance-6/8)
- **Diagnóstico unificado**: sem instrumentação, todo card que promete "p95 cai X%" ou "MTTD em minutos" é fé. `LogService` vai para stdout do Render sem export.
- **Recomendação consolidada**: performance-7 (S) + availability-2 (M) + integrability-6 (M) + security-6 (M) + deployability-7 (M). Sem dashboard, ganhos inverificáveis.

## 4. Quick wins (≤5 dias úteis)

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| performance-2 | Perf+Avail+FT (CC-2) | S | P0 | Ingestão aborta em ≤90s em vez de pendurar indefinidamente; pool DB e advisory lock liberados |
| security-3 | Security | S | P0 | Senhas dos analistas saem dos logs Render; gate LGPD atendido |
| testability-1 | Testability | S | P0 | `EnvironmentProvider.test.ts` para de depender do `.env` dev; sinal "verde local = verde CI" restaurado |
| testability-3 | Test+Deploy | S | P0 | `collectCoverageFrom` no FE; cobertura reportada deixa de ser ficção (82% → ~16% real) |
| availability-3 | Avail+FT | S | P1 | `Idempotency-Key` em `POST /permutas/ingestao` (replica `/eleicao`); duplo-click vira replay |
| availability-4 | Avail+Deploy | S | P1 | GH Actions cron com `if: failure()`; MTTD: ~24h → <1h |
| availability-6 | Avail | S | P2 | Retry classificado por código HTTP + backoff exponencial |
| performance-3 | Perf+Sec | S | P1 | `heavyRouteLimiter` só nas escritas; refresh de painel volta a 100/min |
| performance-5 | Perf | S | P1 | `buscarInvoices` bound concurrency + `sumByInvoices` agregado; p95 ~2-3s → ≤800ms |
| performance-6 | Perf | S | P2 | Advisory lock ANTES do fan-out; concorrência desperdiça ≤200ms em vez de ~90s |
| modifiability-2 | Mod | S | P1 | `AdiantamentoSaldoCalculator` elimina as 4 cópias de `valorPermutar/taxa` |
| modifiability-3 | Mod | S | P1 | `toCasamentoRows` decomposto: cogn. 43 → ≤15 |
| modifiability-7 | Mod | S | P2 | `routes/permutas.ts` para de resolver 4 repositórios direto |
| modifiability-8 | Mod+Deploy | S | P2 | Magic numbers viram env vars; tuning sem deploy |
| deployability-3 | Deploy | S | P1 | `bump-version.ps1` portado para Node |
| integrability-4 | Integ | S | P2 | Zod boundary em todos os 9 readers Conexos |
| integrability-7 | Integ | S | P3 | `AuthProvider.tsx:53` consolidado em `lib/api.ts` |
| performance-7 | Perf+Integ | S | P3 | `durationMs` por chamada Conexos no `LogService` |
| fault-tolerance-3 | FT+Deploy | S | P1 | Job reaper para runs "stuck" |
| fault-tolerance-2 | FT | S | P1 | `alocar` envelopado em `withTransaction` + advisory lock por invoice |
| fault-tolerance-7 | FT | S | P2 | `INVOICE_DETAIL_INDISPONIVEL` espelha PROFORMA; 5 catches → ≤2 |
| availability-5 | Avail | S | P2 | `/ready` separado de `/health` com `SELECT 1` |
| availability-8 | Avail | S | P3 | `hidratacaoParcialCount` na trilha |
| security-9 | Sec | S | P2 | `npm audit --audit-level=high` no CI |
| testability-8 | Test | S | P3 | `fast-check` + 3 properties para invariantes monetários |

**Total quick wins**: 25 cards. Sprint de 2 semanas com 2 devs entrega 15–18 desses.

## 5. Strategic moves (M / L / XL)

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| **cc-auto-ingest-coalesce** | Perf+Avail+Sec+FT (CC-1) | M | Manage Sampling Rate + Schedule Resources | Resolve 429 reproduzido em produção (R-2). p95 de `POST /cliente-filtro`: ~30–60s → ≤1,5s; 5 adds = 1 fan-out (não 5) |
| **security-1** (RBAC) | Sec+FT+Avail | M | Authorize Actors | 0/12 → ≥5/12 rotas com check de papel. Pré-requisito da Fase 3 |
| **security-2** (secret manager + ES256) | Sec+Integ | M | Limit Access + Encrypt Data | Elimina 4 segredos prod em texto plano + remove vetor "forjar JWT com `sub` qualquer" |
| **security-4** (cookie HttpOnly) | Sec | M | Limit Exposure | XSS direto vira XSS indireto |
| **security-7** (revogação server-side) | Sec | M | Revoke Access | TTL 12h → 2h + refresh; demissão revoga em ≤1min |
| **security-5** (cota por usuário) | Sec+Avail+Perf (CC-1) | M | Limit Exposure + Detect Service Denial | 429 deixa de ser DoS lateral entre analistas |
| **deployability-1** (Supabase isolado) | Deploy+Sec+FT | M | Logical Grouping | 1 banco compartilhado → 2 isolados (resolve R-7) |
| **deployability-2** (rollback 1 comando) | Deploy+Avail | M | Rollback | MTTR de rollback: dezenas de min → ≤5min |
| **deployability-4** (job `deploy` formal no CI) | Deploy | M | Deployment Pipeline | Audit trail dentro do repo |
| **deployability-5** (drift detection diária) | Deploy | M | Drift detection | Schema drift em ≤24h |
| **deployability-7** (runbooks top-4 falhas) | Deploy+Avail | M | Deployment observability | MTTR dos 4 cenários: ad-hoc → ≤15min |
| **deployability-9** (branch `stg` para cron) | Deploy | M | Scale Rollouts | Bug em greedy/cliente-filtro pego em stg antes de prd |
| **integrability-1** (internalizar transporte Conexos) | Integ+Sec+Mod | M | Encapsulate + Restrict Communication Paths | Elimina `process.env.CONEXOS_*` cru. Pré-requisito do write-side `fin010` |
| **integrability-2** (contract probe + drift alert) | Integ+Test | M | Versioning strategy + Contract testing | MTTD de quebra de contrato Conexos: dias → minutos |
| **integrability-3** (decompor EleicaoPermutasService.executar) | Integ+Mod | M | Orchestrate + Manage Resource Coupling | 10 hits de `conexosClient.*` em 1 service → 0 (3 fetchers) |
| **integrability-5** (`AbstractAuthenticatedHttpClient`) | Integ+Mod | M | Abstract Common Services | SISPAG+GED economizam 5–8 dias por integração; ~450 LOC evitadas |
| **integrability-6** (métricas integration health) | Integ+Perf+Avail | M | Observability of integration failures | 13 endpoints com counter Prometheus; MTTD horas → minutos |
| **modifiability-1** (split `page.tsx`) | Mod+Perf+Test | M | Split Module | 2127 → ≤400 LOC + 10 componentes em `_components/` |
| **modifiability-4** (decompor computeCandidatas) | Mod+Test | M | Split Module + Increase Semantic Coherence | LOC 813 → ≤250; cogn. 65 → ≤15 |
| **modifiability-6** (decompor `alocar`) | Mod+FT | M | Refactor + Split Module | cogn. 26 → ≤15 ANTES da Fase 3 |
| **fault-tolerance-1** (saga server-side cliente-filtro) | FT+Perf (CC-1) | M | Compensating Transaction + Atomic Transaction | Divergências cadastro × painel → 0 |
| **fault-tolerance-4** (Idempotency-Key genérica) | FT+Avail+Perf | M | Idempotent Replay | 1/5 → 5/5 POSTs honram replay. Pré-requisito da Fase 3 |
| **fault-tolerance-5** (1 tx para `IngestaoPermutasService`) | FT | M | Atomic Transaction | Drift `/gestao` × `/painel` em crash test: observado → 0 |
| **fault-tolerance-8** (`audit_event` cross-entidade) | FT+Sec | M | Audit Trail | Query única reconstitui história. Compliance Fase 3 |
| **testability-2** (extrair hooks/utils do page.tsx) | Test+Mod | M | Limit Structural Complexity + Specialized Interfaces | `page.tsx` 2127 → ≤1400 LOC; cobertura efetiva FE 16% → ≥50% |
| **testability-4** (`ClockProvider` injetável) | Test+Mod | M | Limit Non-Determinism | 10 `new Date()` → 0; ≥5 testes assertando `durationMs` exato |
| **testability-5** (fixtures Conexos gravadas) | Test+Integ | M | Recordable Test Cases | `ConexosClient.test.ts` 1342 → ≤800 LOC |
| **testability-6** (integration tests Postgres real) | Test+FT | M | Sandbox | SQL bugs em `UPDATE` da alocação pegos no CI |
| **deployability-6** (subir floor cobertura FE) | Deploy | M | Test Harness | branches 40 → 60, functions 55 → 70 em 2 sprints |
| **deployability-8** (feature flags SISPAG/GED) | Deploy+Mod | M | Scale Rollouts | Frentes futuras em "dark" sem novo deploy |
| **testability-7** (split test files > 500 LOC) | Test | M | Limit Structural Complexity | 5 → 0 test files > 500 LOC |
| **modifiability-5** (split `ConexosClient` 1432 LOC) | Mod+Integ | L | Split Module | Pré-requisito do write-side Fase 3 |
| **security-8** (`tenantId` no JWT + escopo nos repos) | Sec+Deploy | L | Separate Entities | Multi-tenant-safe ANTES do 2º cliente |
| **integrability-8** (write-side `fin010`) | Integ+FT | L | Tailor Interface (lado-escrita) | Risco arquitetural #1 destrava |
| **fault-tolerance-6** (reconciliação local↔Conexos) | FT | L | External↔Local Reconciliation | Gate de produção da Fase 3 |

## 6. O que está bem (e por quê)

1. **DDD a partir do service + tsyringe** (`appContainer.ts`). PatternGuardian policia `handler→service→repository→client`. Mocks em 192 sítios via `container.registerInstance` — tactic **Specialized Interfaces** plenamente aplicada. (BE service+repo coverage: 96/79.)
2. **SQL 100% parametrizado** (Rule #5). 0 hits para string interpolation nos repos novos do PR #4. Em domínio financeiro, elimina toda classe de bug.
3. **Idempotency-Key + advisory lock + replay** em `POST /permutas/eleicao`. Pattern certo existe e tem ADR — só falta replicar nos outros 4 endpoints.
4. **`withTransaction` + `withAdvisoryLock` + ROLLBACK preservando last-good** em `persistIngestRun`. Tactics **Rollback** + **Transactions** + **Mutual Exclusion** alinhadas.
5. **`BoundedConcurrency` + `RetryExecutor` + `AbortController` cooperativo** no fan-out Conexos. Bounded Concurrency calibrada com base no `LOGIN_ERROR_MAX_SESSIONS` documentado.
6. **Zod nos boundaries**: 6/6 endpoints novos PR #4; 2/9 readers Conexos. Única linha de defesa contra drift silencioso de upstream sem versioning.
7. **`Quarantine` nomeado** (`DETAIL_INDISPONIVEL`) bloqueia 1 candidata sem matar o run. Forward Recovery: reavalia na próxima janela cron.
8. **`notify.error` / `toast.error` em 100% das mutações do PR #4**. Único QA sem gap no frontend.
9. **Versionamento FE+BE lockstep** (`v0.4.0`) + tag-release idempotente + `/health` expõe `version`. Higiene básica que muitos projetos ignoram.
10. **`preDeployCommand` idempotente no Render** + `schema_migrations` PRIMARY KEY. Migrations re-rodadas pulam aplicadas.

## 7. Limitações da análise

- **Métricas não medíveis localmente**: MTTR real, MTBF, taxa de 5xx Conexos em prod, p95/p99 por endpoint (cards `availability-2`, `performance-7`, `integrability-6`); deploy success rate, lead time real; tempo de flake em CI; CloudTrail/GuardDuty/WAF (sem AWS); brute-force agregado (sem Sentry/Datadog).
- **O que o pipe NÃO cobre**: chaos engineering, threat modeling formal (STRIDE/PASTA), análise de custo cloud, UX/acessibilidade, `next build` analyzer.
- **Janela temporal**: snapshot de 2026-06-22 sobre PR #4. Refazer trimestralmente, ou antes de Fase 3 entrar em prod.
- **Write-side `fin010` ausente**: a maior fonte de risco ainda não está no código. Quando entrar, TODOS os P2/P3 sobem 1 nível; P1s viram P0.
- **Score weighting**: pesos são juízo do consolidador. Com pesos uniformes, overall = 5.69 (igual coincidência); com Performance 1.5, cai para 5.5.
- **Dedup de cards**: 67 originais → 59 após dedup. Cards mergeados (`cc-auto-ingest-coalesce`, `performance-2` cross-QA) marcados no Kanban com `merged_from`. Numeração `<slug>-N` mantida para rastreabilidade.

## 8. Ações recomendadas

1. **Semana 1 — quick wins de segurança e estabilidade**: security-3 (HOJE) + security-2 (rotacionar segredo + migração faseada) + performance-2 + testability-1 + testability-3. Resultado: 3 P0 de Security desativados + paralisia por outage Conexos eliminada + cobertura FE deixa de mentir.
2. **Semana 2 — matar o 429 + idempotência**: cc-auto-ingest-coalesce + availability-3 + availability-4 + performance-3 + performance-5. Resultado: 429 erradicado; UX do cadastro recuperada; MTTD de cron failure cai de ~24h para <1h.
3. **Semana 3 — RBAC + audit + reaper**: security-1 + fault-tolerance-3 + fault-tolerance-2 + fault-tolerance-7 + modifiability-2/3. Resultado: ≥5/12 rotas com check de papel; over-allocation eliminada; cogn. complexity da regra greedy ADR-0010 volta a ≤15.
4. **Semana 4 — destrancar Fase 3**: deployability-1 + integrability-1 + fault-tolerance-4. Resultado: contaminação dev↔prd encerrada; `services/conexos.ts` deletado; 5/5 POSTs mutativos com replay. **Fase 3 ganha luz verde** (cards integrability-8 + fault-tolerance-6 são L e merecem sprint dedicada).
5. **Continuamente — observabilidade primeiro**: agendar performance-7 + availability-2 + integrability-6 logo após week 1. Sem dashboard, todo card promete "p95 cai X%" é fé. Stack mais barata: Logtail (~$10/mês) + `prom-client` em /metrics (zero custo).

---

**Frase-chamada (para resposta ao usuário):** o foco recomendado para os próximos 30 dias é o pacote dos 5 P0 (3 de Security + axios sem timeout + coverage FE falso) e os 2 cards que matam o 429 reproduzido em produção (cc-auto-ingest-coalesce + availability-3); até a semana 4 o caminho fica desbloqueado para começar a Fase 3 (write-back `fin010`) com gates de segurança proporcionais ao impacto financeiro real.
