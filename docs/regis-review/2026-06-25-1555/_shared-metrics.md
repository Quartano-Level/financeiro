# Shared Baseline Metrics — run 2026-06-25-1555

**Scope:** `backend,frontend` (--quick) · **Feature:** `relatorios-export` (export READ-ONLY dos
KPIs do painel de Permutas para Excel/.xlsx via exceljs; novo endpoint `GET /permutas/relatorios/:tipo`).
**Worktree (CWD para todos os comandos):** `/tmp/relatorios-export-wt` · **Branch:** `feat/relatorios-export`.

> Todos os agentes: rodem comandos a partir de `/tmp/relatorios-export-wt` (lá estão o código da
> feature + `node_modules` instalados em `src/backend` e `src/frontend`). Foco no **delta da feature**
> (quick mode), mas meçam de verdade.

## Arquivos tocados pela feature (delta)
| Arquivo | LOC | Papel |
|---|---|---|
| `src/backend/domain/service/permutas/RelatorioExportService.ts` | 398 | Service `@injectable` — projeção + serialização xlsx (exceljs) |
| `src/backend/domain/service/permutas/RelatorioExportService.test.ts` | — | Testes do service (projeções + buffer) |
| `src/backend/domain/interface/permutas/Relatorio.ts` | 46 | Tipos + `isRelatorioTipo` guard |
| `src/backend/routes/permutas.ts` | +~20 | Nova rota `GET /permutas/relatorios/:tipo` |
| `src/backend/routes/permutas.test.ts` | +~55 | 3 casos de rota (200/400/401) |
| `src/frontend/lib/api.ts` | 488 | `exportarRelatorio(tipo)` (fetch+blob download) + helper |
| `src/frontend/lib/types.ts` | 393 | `RelatorioTipo`, `RelatorioDescritor`, `RELATORIOS_DISPONIVEIS` |
| `src/frontend/app/permutas/page.tsx` | 2622 | Popover "Exportar" no header + estado `exportando` |

## Baseline (medido)
- Backend test files: **187** · Backend suite (full): **463 tests / 43 suites — todos verdes** (medido nesta sessão).
- Frontend suite: **51 tests / 11 suites — verdes**.
- Backend `typecheck`: ✅ limpo. Backend `lint` (biome) nos arquivos tocados: ✅ limpo.
- Frontend `typecheck`: ✅ limpo. Frontend `lint`: 0 erros, 3 warnings PRE-EXISTENTES (auth token effect — fora do delta).
- exceljs: já presente em `src/backend/package.json` (`exceljs ^4.4.0`) — sem dependência nova.
- PatternGuardian: rodado — 1 P0 (mensagem de erro em PT) **já remediado** (→ inglês).
- DesignSystemReviewer: rodado — 1 P1 (focus-ring no menu) **já remediado** (focus-visible + aria-labelledby).

## Notas de contexto (estado-alvo vs atual)
- Infra: **sem `infra/`/Terraform** (deploy Render/Vercel/Supabase). QAs de infra (deployability/availability)
  devem tratar Terraform/Lambda/SSM como **não-aplicável ao código atual** (alvo, não presente).
- A feature é **READ-ONLY**: não escreve no ERP (Conexos) nem no Postgres. Reusa `GestaoPermutasService.exporGestao()`.
- Acesso ao endpoint: paridade com `/gestao` (auth global, sem `requireRole`).
