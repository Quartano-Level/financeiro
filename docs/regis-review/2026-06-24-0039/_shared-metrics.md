# Shared baseline metrics — run 2026-06-24-0039
_Escopo: Fase 3.1 (gestão de borderôs) — sessão 2026-06-24. Foco nos arquivos do diff 30d5700..HEAD._

## Tamanho / contagem
- Backend LOC (não-teste): 11528
- Backend test files: 42
- Frontend LOC (não-teste): 6025
- Frontend test files: 11
- Infra: sem Terraform (deploy Render Blueprint render.yaml + Vercel). Tenants: n/a.

## Arquivos da sessão (diff 30d5700..HEAD)
 CHANGELOG.md                                       |  19 +
 render.yaml                                        |  12 +-
 src/backend/domain/client/ConexosClient.test.ts    |   1 +
 src/backend/domain/client/ConexosClient.ts         | 236 ++++++++
 src/backend/domain/client/legacyConexosAdapter.ts  |  10 +
 .../domain/interface/permutas/Fin010Baixa.ts       |  26 +
 .../permutas/PermutaAlocacaoRepository.ts          |  17 +-
 .../permutas/PermutaExecucaoRepository.ts          |  92 ++++
 .../service/permutas/AlocacaoPermutasService.ts    |   2 +
 .../service/permutas/BorderoGestaoService.test.ts  | 298 +++++++++++
 .../service/permutas/BorderoGestaoService.ts       | 366 +++++++++++++
 .../service/permutas/GestaoPermutasService.test.ts |   2 +
 .../permutas/ReconciliacaoPermutaService.test.ts   | 118 +++-
 .../permutas/ReconciliacaoPermutaService.ts        | 203 +++++--
 .../migrations/0016_permuta_alocacao_data_base.sql |   6 +
 src/backend/package.json                           |   2 +-
 src/backend/routes/permutas.ts                     | 176 ++++++
 src/backend/services/conexos.ts                    |  26 +
 src/frontend/app/permutas/borderos/page.tsx        | 595 +++++++++++++++++++++
 src/frontend/app/permutas/page.tsx                 | 126 ++++-
 src/frontend/lib/api.ts                            |  73 +++
 src/frontend/lib/types.ts                          |  36 ++
 src/frontend/package.json                          |   2 +-
 23 files changed, 2348 insertions(+), 96 deletions(-)

## Backend deps
- deps: 14 | devDeps: 13 | version: 0.6.0
- FE deps: 22 | devDeps: 17 | version: 0.6.0

## Gates baseline (medidos no setup)
- Backend: typecheck PASS · lint 0 findings · jest **426 passed / 426**
- Frontend: typecheck PASS · jest: Tests:       51 passed, 51 total
- Backend health (prod Render): {"status":"ok","version":"0.6.0"} (v0.6.0 live)
- Deploy: Vercel (frontend, alias kavex-financeiro.vercel.app) + Render (backend free tier, spin-down após inatividade)
