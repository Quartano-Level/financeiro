# Regis-Review — REPORT

**Run:** `2026-06-17-2340` · **Escopo:** backend (delta da feature) · **Modo:** `--quick`
**Feature:** Permutas Frente I — Fatia 1 "Painel de pendências elegíveis" (READ-ONLY)
**Branch:** `feat/permutas-painel-elegiveis` · **Base:** `feat/bootstrap-template`
**Audiência:** arquitetos / tech lead — evidência-first.

---

## 1. Veredito

**Score geral: 6.1/10** (média ponderada dos 8 QAs). A feature tem fundação de design sólida
(DDD/tsyringe limpos, PatternGuardian ✅, SQL 100% parametrizado, audit trail completo, probes
gated exemplarmente isolados), mas carrega **7 P0** concentrados em **3 causas-raiz cross-QA** que
tornam a Fatia 1 quebrada no 1º deploy em ambiente novo e que são **pré-requisitos não-negociáveis
para a Fatia 2** (escrita em `fin010`).

Como a fatia é **READ-ONLY**, o blast-radius está contido hoje (nada é escrito no ERP). O risco real
é dobrado para a Fatia 2: cada P0 de consistência/idempotência/retry vira baixa duplicada ou
indevida em `fin010` se não for resolvido antes.

## 2. Scorecard

| QA | Peso | Score | Contribuição |
|---|---:|---:|---:|
| Security | 1.5 | 6.5 | 9.75 |
| Fault Tolerance | 1.3 | 6.0 | 7.80 |
| Availability | 1.2 | 5.0 | 6.00 |
| Modifiability | 1.2 | 7.5 | 9.00 |
| Testability | 1.0 | 7.0 | 7.00 |
| Performance | 1.0 | 5.0 | 5.00 |
| Integrability | 0.9 | 7.5 | 6.75 |
| Deployability | 0.9 | 4.0 | 3.60 |
| **Overall (54.90 / 9.0)** | | | **6.10** |

## 3. Top 5 riscos cross-QA

### R-1 — `persistRun` N+1 sem transação atômica  ·  P0  ·  5 QAs
Availability F2 · Deployability F3 · Fault-Tolerance F1 · Performance F4 · Testability F2.
`PermutaSnapshotRepository.persistRun:65-94` faz INSERT cabeçalho + N INSERTs em loop (`pool.query`
separados). `PostgreeDatabaseClient` não expõe `withTransaction()`. A docstring declara atomicidade
que o código não entrega. Crash/SIGTERM no meio deixa cabeçalho `status='success'` com snapshot
truncado — servido como "última run boa". **Bloqueador absoluto da Fatia 2.**

### R-2 — `MigrationRunner` órfão  ·  P0  ·  2 QAs
Availability F1 · Deployability F1. `grep -rn MigrationRunner src/backend` → só a definição. Nada
em `index.ts`/`appContainer.ts`/`package.json`/`ci.yml` invoca. 1ª chamada em ambiente novo:
`relation "permuta_eleicao_run" does not exist` → catch tenta gravar erro na mesma tabela
inexistente → 500 sem auditoria. Feature inutilizável em D+0.

### R-3 — Drift `fil_cod` schema↔código  ·  P0  ·  3 QAs
Deployability F5 · Fault-Tolerance F3 · Modifiability F1. Migration `0001:30` declara `fil_cod`;
INSERT do repo (`:137-156`) omite; SELECT (`:116`) lê (sempre `NULL`). 100% das linhas nascem com
`fil_cod=NULL` → multi-filial (invariante I6) quebrado silenciosamente; auditoria O6 entrega 2/3.

### R-4 — Trigger sem idempotência nem advisory lock  ·  P0  ·  4 QAs
Availability F5 · Deployability F2 · Fault-Tolerance F5 · Security (DoS). `POST /permutas/eleicao`
sem `Idempotency-Key`, sem `pg_try_advisory_lock`, pool `max=1`. Duplo-clique dobra o fan-out
Conexos + 2 cabeçalhos `success` no mesmo segundo; `/painel` paralelo trava. **Padrão deve estar
provado antes da Fatia 2** (senão, baixa duplicada em `fin010`).

### R-5 — Fan-out N+1 Conexos sem batching real  ·  P0  ·  Performance
Performance F1+F2. `chunked(priCods=[adto.priCod], 50)` recebe array de 1 → batching efetivo zero;
laços de filiais e adiantamentos sequenciais (`for...of` + `await`). Regime (A=200): **802 chamadas
Conexos/run (~13 min)**. Backlog inicial (P0-7 sem janela): **5.703 chamadas**, não completa no
timeout do Express nem do Lambda futuro.

## 4. Causas-raiz cross-cutting (mesma origem, múltiplos QAs)

| ID | Causa-raiz | QAs | Resolvido por |
|---|---|---|---|
| CC-1 | Sem camada transacional no `PostgreeDatabaseClient` | 5 | Card P0-5 |
| CC-2 | Pipeline de deploy não fecha o anel da 1ª migration | Avail+Deploy | Cards P0-1 + P1 health/fail-fast |
| CC-3 | Idempotency-Key + advisory lock + pool size 1 | Avail+Deploy+FT+Sec | Card P0-6 |
| CC-4 | Zod boundary parcial (`com308RowSchema` não aplicado) | Integ+Sec | Card P1-1 |
| CC-5 | Probes/placeholders sem guard de runtime fail-loud | Integ+Mod+FT | Card P1-2 |
| CC-6 | `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES` órfão | Mod+Test | Card P2 |
| CC-7 | Constantes em código (PAGE_SIZE/MAX_PAGES + tenant) | Mod+Deploy | Cards P1-17/18 |

## 5. O que está bem (âncora de credibilidade)

1. DDD layering + tsyringe limpos; PatternGuardian ✅ 0 violações; SQL parametrizado 100%.
2. `Encapsulate` exemplar nos probes (`mapDeclaracaoDataBase`, `ADIANTAMENTO_FILTER_*`) — plugar o
   valor real do probe é `≤8 LOC, ≤2 arquivos`.
3. Audit trail completo (`flow_id`, `triggered_by`, `status`, `error_message`, FK cascade).
4. `EnvironmentProvider` 100% para credenciais — 0 secrets hardcoded.
5. Job idempotente por design no nível da run.
6. CI baseline sólido (lockfile, audit, lockstep version FE/BE, tag-release).
7. Test/source ratio 0.79 (1.100 / 1.389 LOC) em 9 suites.
8. Snapshot Postgres = cópia materializada do cômputo (decisão arquitetural correta).

## 6. Contagem de cards (após dedupe cross-QA)

- Antes: 59 findings. Depois: **45 cards** — **P0: 7 · P1: 18 · P2: 14 · P3: 6**.
- Detalhe completo em `KANBAN.md`.

## 7. Plano recomendado (30 dias)

- **Sprint 0 (semana 1) — bloqueia feature nova:** os 7 P0 (cards 1-4 esforço S; 5-7 esforço M). ~10 dias úteis.
- **Sprint 1 (semana 2-3) — fecha anel de deploy + observabilidade:** P1 health-ready, fail-fast,
  down-migration, test-runMigrations, staleness, onCapHit, status-partial.
- **Sprint 2 (semana 3-4) — pré-requisitos da Fatia 2:** `rbac-roles-permutas`, `pii-redact-logger`,
  `probe-placeholder-guard`, `com308-zod-boundary`, `clock-provider`, `staging-environment`.
- **Reservado p/ Fatia 2:** gateway Conexos, tenant-constants-SSM, paginação painel, fixtures wire.

## 8. Limitações da análise

Não-medíveis em `--quick`: latência real Conexos (p50/p95), MTTR, coverage % (estimado por ratio),
`npm audit` deep, `% capHit` em prod, terraform plan. Fora do pipe: chaos, threat modeling formal,
custo cloud, UX/acessibilidade. Snapshot de 2026-06-18 — refazer trimestralmente.
