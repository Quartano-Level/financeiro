# Shared Metrics — Regis-Review (--quick, scoped)

**run_id:** 2026-06-18-2346
**mode:** `--quick` (skip coverage, terraform plan, deep npm audit)
**scope (paths):**
- `src/backend/domain/service/permutas/`
- `src/backend/domain/client/ConexosClient.ts`
- `src/backend/domain/interface/permutas/`
- `src/frontend/app/permutas/`

## Feature under review
"Já permutado" — distinguish a fully-paid advance whose permuta balance was
already consumed (`mnyTitPermuta` / `valorPermutado > 0` → `MOTIVO_BLOQUEIO.JA_PERMUTADO`)
from one that never had a balance (`SEM_SALDO_PERMUTAR`).

## Scoped LOC (non-test)
| File | LOC |
|---|---|
| ConexosClient.ts | 1414 |
| EleicaoPermutasService.ts | 656 |
| ElegibilidadeService.ts | 208 |
| Adiantamento.ts | 58 |
| EstadoElegibilidade.ts | 61 |
| frontend/app/permutas/page.tsx | 680 |

## Tests in scope
- 9 test files (`permutas/*.test.ts` + `ConexosClient.test.ts`).
- Affected suites this change: ConexosClient.test (3 suites), ElegibilidadeService.test, EleicaoPermutasService.test → 91 passed.

## Baseline gate status (this change)
- Backend typecheck: ✅ clean (`tsc --noEmit`)
- Frontend typecheck: ✅ clean
- Backend lint: ✅ exit 0 — 7 pre-existing `noExcessiveCognitiveComplexity` warnings (unchanged from baseline; NONE introduced by this change)
- Frontend lint (eslint): ✅ clean
- Backend tests: 311/312 pass; 1 pre-existing failure in `EnvironmentProvider.test.ts` (env-var leakage between tests, unrelated to this change — confirmed failing on clean baseline)
- Frontend tests: 34/34 pass
- Frontend build: ✅ static export OK

## Diff stat (full branch working tree)
13 files changed, +507 / -35. The "já permutado" change touches: ConexosClient(.test), Adiantamento, EstadoElegibilidade, ElegibilidadeService(.test), EleicaoPermutasService, frontend page.tsx (+ types.ts free string, fixture). The Gestao/GestaoPermutasService deltas are from a prior commit on the same branch, not this change.

## Not measurable in --quick
- Coverage % (skipped per --quick)
- terraform plan (no infra/ in repo — target-state only)
- deep npm audit (skipped per --quick)
