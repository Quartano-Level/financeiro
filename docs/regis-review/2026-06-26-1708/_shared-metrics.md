# Shared Metrics — Regis-Review 2026-06-26-1708
_Coletado 2026-06-26T17:08Z · branch main @ 7d853fd · app v0.9.2_
> Run anterior p/ comparação: `2026-06-26-0058` (antes dos splits CC-1/CC-2).

## Tamanho (LOC, sem testes)
```
Backend total:   443025 total
  service:        4800 total
  repository:     1867 total
  client:         2675 total
  routes:          846 total
Frontend total:    35080 total
  page.tsx:         1026 (era 2.981 pré-CC-1)
  ConexosClient: REMOVIDO (era 1.972) → base + 4 sub-clients
      3761 total
```

## Maiores arquivos backend (top 8, sem teste)
```
   39429 src/backend/node_modules/typescript/lib/lib.dom.d.ts
   13150 src/backend/node_modules/typescript/lib/lib.webworker.d.ts
   11437 src/backend/node_modules/typescript/lib/typescript.d.ts
   10900 src/backend/node_modules/@aws-sdk/client-ssm/dist-types/models/models_0.d.ts
    6478 src/backend/node_modules/@aws-sdk/client-ssm/dist-types/models/models_1.d.ts
    5136 src/backend/node_modules/zod/src/v3/types.ts
    4601 src/backend/node_modules/typescript/lib/lib.es5.d.ts
    4590 src/backend/node_modules/@types/node/crypto.d.ts
```
## Maiores arquivos frontend (top 8, sem teste)
```
   39429 src/frontend/node_modules/typescript/lib/lib.dom.d.ts
   37844 total
   27626 src/frontend/node_modules/lucide-react/dynamicIconImports.d.ts
   22569 src/frontend/node_modules/csstype/index.d.ts
   21521 src/frontend/node_modules/lucide-react/dist/lucide-react.d.ts
   19045 src/frontend/node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts
   13150 src/frontend/node_modules/typescript/lib/lib.webworker.d.ts
   11437 src/frontend/node_modules/typescript/lib/typescript.d.ts
```

## Testes
- Backend: **188** arquivos de teste
- Frontend: **12** arquivos de teste (era ~baixo pré-CC-1; +14 componentes)

## Infra
- Terraform modules: 0 (alvo — não existe hoje)
- Tenants: 0

## Deps
- Backend: 14 deps + 13 dev
- Frontend: 22 deps + 17 dev
