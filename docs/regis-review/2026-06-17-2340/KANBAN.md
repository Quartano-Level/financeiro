# Regis-Review — KANBAN

**Run:** `2026-06-17-2340` · Feature Permutas Fatia 1 (READ-ONLY) · 45 cards após dedupe.
Ordem: prioridade (P0→P3), depois esforço (S→L).

---

## P0 — Crítico (7) — re-entram no loop `/feature-new` (remediar antes do PR)

| # | Card | Esf. | QAs | Ação / métrica |
|---|---|---|---|---|
| 1 | `migration-runner-orfao` | S | avail-1, deploy-1 | Wirar `MigrationRunner.run()` no bootstrap + `npm run migrate` + step CI pré-deploy. Refs 0→≥2. |
| 2 | `drift-fil-cod` | S | mod-1, deploy-5, ft-3 | Propagar `filCod` buildCandidata→snapshotRow→INSERT. Rows `fil_cod IS NULL` 100%→0%. |
| 3 | `retry-getmnytitpermutar` | S | ft-2 | Embrulhar `getMnyTitPermutar:830-858` em RetryExecutor; lançar `ConexosError` pós-retries (não `undefined`); +`MOTIVO_BLOQUEIO.DETAIL_INDISPONIVEL`. Retry 7/8→8/8. |
| 4 | `paralelismo-laco-conexos` | S | perf-2 | `for...of`→`Promise.all`+`p-limit` (5 filiais/10 adto) + `AbortController`. Speedup I/O ≥5×. |
| 5 | `persistrun-transacao-atomica` | M | avail-2, deploy-3, ft-1, perf-4, test-2 | `PostgreeDatabaseClient.withTransaction(fn)`; persistRun em 1 transação + multi-row (chunks 500) + teste rollback. BEGIN/COMMIT 0→1; round-trips N=200: 201→2. |
| 6 | `idempotencia-lock-eleicao` | M | avail-5, deploy-2, ft-5 | `Idempotency-Key` (tabela TTL 24h) + `pg_try_advisory_lock` + pool 1→≥3. Runs simultâneas ∞→1. |
| 7 | `fan-out-conexos-batching` | M | perf-1 | Coletar `priCodsUnicos`/filial → 3 chamadas batched + index em `Map`. Chamadas (A=200) 802→≤80; ~13min→≤2min. |

## P1 — Alto (18) — follow-ups inbox

| Card | Esf. | QAs | Ação |
|---|---|---|---|
| `com308-zod-boundary` | S | integ-1, sec-3 | Aplicar `com308RowSchema` em `listTitulosAPagar`. 2/3→3/3. |
| `probe-placeholder-guard` | S | integ-4, mod-6, ft-7 | Flags + BUSINESS_WARN + fail-loud em prd p/ probes provisórios. |
| `status-partial-caphit` | S | avail-4 | Emitir `RunStatus='partial'` em capHit + expor no `PainelResponse`. |
| `status-partial-filial-failure` | M | ft-4 | `Promise.allSettled` + tracking por filial + status partial. |
| `onCapHit-todos-fan-outs` | S | perf-3 | callback em 6/6 endpoints paginados (hoje 1/6). |
| `retry-conexos-melhorar` | S | avail-3 | `retries` 2→3 + `shouldRetry` filtra 4xx VALIDATION. |
| `health-ready-deep` | S | avail-6, deploy-6 | `/health/ready` testa pool + `schema_migrations`. |
| `fail-fast-bootstrap-prd` | S | avail-7, deploy-7 | Propagar erro de `init()` em prd (não `console.warn`). |
| `down-migration-convention` | S | deploy-4 | Pares `*.down.sql` + `migrate:rollback`. |
| `staleness-painel-flag` | S | ft-6 | `stale:boolean` + threshold 24h no painel. |
| `paginacao-painel` | M | perf-5 | `LIMIT/OFFSET`; payload 2MB→≤200KB. |
| `timeout-total-run` | S | perf-7 | `AbortController` + timeout 10min + status partial. |
| `rbac-roles-permutas` | M | sec-1 | `requireRole` antes da Fatia 2 (consome `AuthUser.role`). |
| `pii-redact-logger` | S | sec-4 | Redactor no logger global (body cru). |
| `test-runMigrations` | S | test-1 | Cobertura 0→≥4 unit + 1 integration. |
| `clock-provider` | S | test-3 | `ClockProvider` injetável em Eleicao/Painel. |
| `pagesize-maxpages-single-source` | S | mod-2 | Par literal 2→1 ocorrência. |
| `tenant-constants-ssm` | M | mod-3 | Constantes Columbia→SSM via EnvironmentProvider. |

## P2 — Médio (14)

| Card | Esf. | QAs |
|---|---|---|
| `gateway-permutas-conexos` | M | integ-2 |
| `versioning-conexos-fingerprint` | M | integ-3 |
| `fixtures-conexos-wire` | M | integ-5, test-6 |
| `candidata-assembly-extract` | M | mod-4 |
| `cleanup-defensive-null-pos-probe` | S | mod-5 |
| `multiplas-invoices-decidir` | S | mod-7, test-5 |
| `zod-boundary-http` | S | sec-2 |
| `errormiddleware-body-redact` | S | sec-5 |
| `cache-getmnytitpermutar` | S | perf-6 |
| `reaper-reconciliacao` | L | ft-8 |
| `id-provider` | S | test-4 |
| `test-rota-eleicao-erro` | S | test-7 |
| `staging-environment` | M | deploy-8 |
| `caphit-metric-dashboard` | M | perf (cross) |

## P3 — Baixo (6)

| Card | Esf. | QAs |
|---|---|---|
| `adr-shim-conexos-cutover` | S | integ-6 |
| `readiness-probe-conexos` | S | integ-6 |
| `bootstrap-fora-do-handler` | S | mod-8 |
| `alertamento-flow-error` | M | sec-6 |
| `cache-listFiliais` | S | perf-8 |
| `interface-iconexos-client` | M | test-8 |
