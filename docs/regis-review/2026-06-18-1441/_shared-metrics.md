# Shared Metrics — Regis-Review 2026-06-18-1441 (--quick, scoped)

**Scope:** feature-tweak gate, restricted to `src/backend/domain/client` + `src/backend/domain/service/permutas`.
**Feature:** Permutas Frente I, Fatia 1 — gate-3-pago-via-detail (Gate 3 TOTALMENTE PAGO hydrated from com298 detail).
**Mode:** `--quick` (no coverage run, no terraform, no npm audit).

## Delta under review (git diff --stat)
- `domain/client/ConexosClient.ts` — +87/-… : `getMnyTitPermutar` → `getDetalheTitulos`, returns `{ valorPermutar?, pago? }`; new private `mapDetalheTitulos`.
- `domain/service/permutas/EleicaoPermutasService.ts` — +29/-… : `buildCandidata` hydrates `pago` (and `valorPermutar`) from the detail before gate evaluation; `pago: detalhe.pago ?? false`.
- `domain/interface/permutas/{Adiantamento,EstadoElegibilidade,PermutaCandidata}.ts` — comment/docstring only.
- Test files updated: `ConexosClient.test.ts`, `EleicaoPermutasService.test.ts`.

## Baseline metrics (scoped)
| Métrica | Valor | Fonte |
|---|---|---|
| Test files in touched dirs | 10 | `find domain/client domain/service/permutas -name '*.test.ts' \| wc -l` |
| Tests passing in touched dirs | 118/118 | `npx jest domain/client domain/service/permutas` |
| Full backend suite | 266/266 (30 suites) | `npm test` |
| Typecheck | PASS | `npm run typecheck` |
| Lint | exit 0 (4 pre-existing warnings, 0 errors) | `npm run lint` |
| ConexosClient.ts LOC | 1361 | `wc -l` |
| EleicaoPermutasService.ts LOC | 527 | `wc -l` |
| PatternGuardian | PASS, 0 P0 | agent run |

Note: external-network metrics (real Conexos latency, prod NULL-rate of mnyTitAberto) are **not medíveis localmente** — confirmed via the throwaway probe (deleted, not committed) on 2026-06-18 filCod=2.
