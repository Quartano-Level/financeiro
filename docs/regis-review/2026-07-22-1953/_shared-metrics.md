# Shared Metrics — Regis-Review 2026-07-22-1953

- **Scope:** frontend
- **Flag:** --quick (skip coverage/terraform/npm audit deep)
- **Trigger:** gate pós-impl de `/feature-tweak permutas "line-clamp-2 + tooltip no hover em Cliente/Exportador"`
- **Branch:** `fix/permutas-clamp-cliente-exportador` (base: `main`)

## Baseline (coletado do repo)

| Métrica | Valor | Fonte |
|---|---|---|
| Frontend LOC (não-teste) | 27.331 | `find src/frontend -name '*.ts*' \| grep -v test \| xargs wc -l` |
| Frontend test files | 202 | `find src/frontend -name '*.test.ts*' \| wc -l` |
| Frontend deps / devDeps | 23 / 17 | `src/frontend/package.json` |
| FE typecheck | ✅ 0 erros | `npm run typecheck` |
| FE lint | ✅ 0 errors, 8 warnings (pré-existentes em `usuarios/page.tsx`, `AuthProvider.tsx`) | `npm run lint` |
| FE test | ✅ 88 passed / 88 (17 suites) | `npm test` |
| Backend | ⚠️ Fora de escopo (scope=frontend) | — |
| Terraform / Tenants | ⚠️ Não medível: não há `infra/` (estado atual Render/Vercel) | — |

## Delta em revisão (o que este gate deve focar)

5 arquivos de código + 1 inbox. Mudança **puramente presentacional**:
- `src/frontend/app/permutas/components/ui.tsx` — `Campo` ganha props opt-in `clamp?: boolean`
  (`line-clamp-2`) e `title?: string` (tooltip nativo). Default inalterado (`break-words`).
- `AbaAutomaticas.tsx`, `VisaoGeralTable.tsx` (2x), `AlocarDialog.tsx` — Cliente/Exportador passam `clamp title`.
- `__tests__/permutas-components.test.tsx` — 2 testes de regressão novos.

Sem mudança de lógica de negócio, dados, SQL, integração ou infra. DesignSystemReviewer já rodou: PASS, 2 P1 (→ `ontology/_inbox/permutas-clamp-followups.md`).

> Agents: leiam este arquivo primeiro. Como o delta é presentacional e o scope é frontend, foquem
> a análise no frontend e no delta; declarem explicitamente as métricas não-medíveis (backend/infra).
