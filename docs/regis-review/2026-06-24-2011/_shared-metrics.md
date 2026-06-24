# Shared metrics — run 2026-06-24-2011 (escopo: PR v0.7.0 / permutas desta sessão)

## Baseline
- Backend LOC (service): 4002 · (repository): 1820 · (client): 2511
- Backend test files: 186 · suites 42 · **447 testes ✅**
- Frontend LOC (app+lib): 5028 · test files: 196 · **51 testes ✅** · build ✅
- Infra: **nenhuma** (sem infra/ Terraform — estado Express/Render/Supabase)
- Lint BE: 0 erros · Typecheck BE: ✅ · Lint FE: 0 erros · Typecheck FE: ✅

## Escopo da revisão (diff main...HEAD — v0.7.0)
 CHANGELOG.md                                       |  22 +
 src/backend/domain/client/ConexosClient.test.ts    |  19 +
 src/backend/domain/client/ConexosClient.ts         |  60 +-
 src/backend/domain/interface/permutas/Gestao.ts    |  10 +
 .../permutas/PermutaExecucaoRepository.ts          | 101 +++
 .../permutas/PermutaRelationalRepository.ts        |  13 +-
 .../service/permutas/AlocacaoPermutasService.ts    | 103 ++++
 .../service/permutas/BorderoGestaoService.test.ts  | 146 ++++-
 .../service/permutas/BorderoGestaoService.ts       | 297 +++++++--
 .../permutas/EleicaoPermutasService.test.ts        |   1 +
 .../service/permutas/EleicaoPermutasService.ts     |  76 +++
 .../service/permutas/GestaoPermutasService.test.ts |  69 ++-
 .../service/permutas/GestaoPermutasService.ts      | 172 +++++-
 .../permutas/IngestaoPermutasService.test.ts       |  36 +-
 .../service/permutas/IngestaoPermutasService.ts    |  69 ++-
 .../permutas/ReconciliacaoPermutaService.test.ts   |  15 +-
 .../permutas/ReconciliacaoPermutaService.ts        |  24 +-
 src/backend/migrations/0017_invoice_importador.sql |   7 +
 .../migrations/0018_permuta_bordero_cache.sql      |  15 +
 src/backend/package-lock.json                      |   4 +-
 src/backend/package.json                           | 104 ++--
 src/backend/routes/permutas.ts                     |  58 +-
 src/frontend/app/permutas/BorderosPanel.tsx        | 678 +++++++++++++++++++++
 src/frontend/app/permutas/borderos/page.tsx        | 594 +-----------------
 src/frontend/app/permutas/page.tsx                 | 404 ++++++++----
 src/frontend/lib/api.ts                            |  67 +-
 src/frontend/lib/types.ts                          |  21 +
 src/frontend/package-lock.json                     |   4 +-
 src/frontend/package.json                          |   2 +-
 29 files changed, 2302 insertions(+), 889 deletions(-)

## Arquivos-chave tocados (permutas)
- backend/domain/service/permutas/{GestaoPermutasService,BorderoGestaoService,EleicaoPermutasService,IngestaoPermutasService,AlocacaoPermutasService,ReconciliacaoPermutaService}.ts
- backend/domain/repository/permutas/{PermutaExecucaoRepository,PermutaRelationalRepository}.ts
- backend/domain/client/ConexosClient.ts (listInvoicesFinalizadas, listBorderos borCods, +)
- backend/routes/permutas.ts (GET /status, GET /borderos?live, GET /borderos/:borCod/baixas, DELETE /borderos/:borCod/trilha)
- backend/migrations/{0017_invoice_importador,0018_permuta_bordero_cache}.sql
- frontend/app/permutas/{page.tsx, BorderosPanel.tsx, borderos/page.tsx}, lib/{api,types}.ts
