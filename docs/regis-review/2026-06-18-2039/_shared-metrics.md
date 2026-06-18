# Shared Metrics — Regis-Review (quick) 2026-06-18-2039

**Scope:** Permutas Fase B touched dirs — `src/backend/domain/{service,repository}/permutas`,
`src/backend/jobs`, `src/backend/migrations`, `src/backend/routes/permutas.ts`,
`src/backend/domain/interface/permutas`, `src/frontend/{app/permutas,lib}`.
**Mode:** `--quick` (no coverage/terraform/deep-audit).

| Metric | Value |
|---|---|
| Permutas service LOC (non-test) | 1419 |
| Permutas repository LOC (non-test) | 904 |
| Test files in scope | 12 |
| Permutas test suites / tests | 13 suites / 88 tests — all green |
| Backend typecheck | PASS |
| Backend lint (Biome) | PASS (1 pre-existing warning: legacy `_doLogin` complexity 17) |
| Frontend typecheck / lint / build | PASS / PASS / PASS |
| Frontend tests | 8 suites / 34 tests green |
| Known pre-existing failing test | `EnvironmentProvider.test.ts` (local `.env` pollution; not in scope) |

## New components (Fase B)
- Migrations 0003 (relational model + auto casamento) / 0004 (processamento).
- `PermutaRelationalRepository`, `PermutaProcessamentoRepository` (tx + advisory lock + chunked UPSERT, $name SQL).
- `IngestaoPermutasService` (reuses `EleicaoPermutasService.computeCandidatas`), `GestaoPermutasService`.
- Job `jobs/ingest-permutas.ts` (cron-ready, not scheduled).
- Endpoints `GET /permutas/gestao`, `POST /permutas/adiantamentos/:docCod/processar` (Zod body).
- VC sign fix (`taxaAdiantamento - taxaInvoice`), frontend real `processarAdiantamento` + status badges.
