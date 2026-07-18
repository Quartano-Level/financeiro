# Shared baseline metrics — Regis-Review SISPAG (Frente II)

run_id: 2026-07-18-1618-sispag-frente-ii
scope: SISPAG domain (Frente II) — backend + frontend, cross-layer
generated: 2026-07-18T16:18Z UTC

## SISPAG backend LOC by layer (non-test)
```
domain/service :     1141 total
domain/repository :      701 total
domain/client : 
domain/interface :      439 total
routes/sispag.ts :      361
http/sispagGate.ts :       21
jobs (ingest-pagamentos+formar-lotes) :       66 total
```

## SISPAG test files
```
backend sispag test files: 7
backend sispag client tests: 3
frontend sispag test files: 0
```

## SISPAG frontend LOC (non-test)
```
    1834 total
```

## SISPAG migrations
```
src/backend/migrations/0023_lote_pagamento.sql
src/backend/migrations/0024_pagamento_ingestao.sql
src/backend/migrations/0025_titulo_internacional.sql
src/backend/migrations/0026_lote_automatico.sql
src/backend/migrations/0027_lote_retornado.sql
src/backend/migrations/0028_app_user_gestao.sql
src/backend/migrations/0029_app_user_conexos_vinculo.sql
src/backend/migrations/0030_remove_internacional.sql
src/backend/migrations/0031_sispag_modalidade.sql
```

## Baseline gates (whole repo — SISPAG shares the pipeline)
```
# backend typecheck

> financeiro-backend@0.17.5 typecheck
> tsc --noEmit

# backend lint (summary)
Diagnostics not shown: 8.
Checked 197 files in 79ms. No fixes applied.
Found 28 warnings.
# frontend typecheck
> financeiro-frontend@0.17.5 typecheck
> tsc --noEmit

# frontend lint (summary)
✖ 11 problems (0 errors, 11 warnings)
  0 errors and 3 warnings potentially fixable with the `--fix` option.

```

## App version
- FE: 0.17.5  BE: 0.17.5

## Feature flags (SISPAG)
- Backend: SISPAG_ENABLED (render.yaml → true em prod). Gate: src/backend/http/sispagGate.ts
- Frontend: NEXT_PUBLIC_SISPAG_ENABLED (Vercel build-time)

## Notes for QA agents
- SCOPE = SISPAG (Frente II) ONLY. Ignore Permutas/auth except where SISPAG depends on them (shared ConexosClient.base, auth middleware, EnvironmentProvider).
- I1 invariant: SISPAG is READ-ONLY to Conexos in prod. Write toolboxes (ConexosSispagWriteClient/fin015, RetornoOrquestracaoService/fin052 carregarArquivoRetorno) are DORMANT/gated — nothing calls them in the request path. Verify this before flagging write-risk.
- Reads: ConexosSispagClient (fin064 títulos, fin015 lotes/borderô), ConexosSispagRetornoClient (fin052 .RET). Anti-drift: ingestion persists only BÁSICO; remessa DETAIL hydrated live at send-time.
