# Regis-Review Follow-ups — feature "já permutado"

**run_id:** 2026-06-18-2346 (`docs/regis-review/2026-06-18-2346/`)
**mode:** `--quick`, scoped (permutas eligibility)
**branch:** `feat/permutas-painel-elegiveis`
**P0 (Crítico):** 0 — remediation loop did NOT re-enter. Feature ships clean.
**Breakdown:** P0=0 · P1=3 · P2=11 · P3=9 · 23 cards total · overall 7.96/10

> Política do gate: apenas P0 re-entra no loop. Os P1/P2/P3 abaixo NÃO foram
> implementados nesta fatia — ficam registrados aqui como backlog. Detalhe
> completo (Problema / Melhoria / Resultado Esperado) em
> `docs/regis-review/2026-06-18-2346/KANBAN.md` e `REPORT.md`.

## P1 (alta — sugeridos para a 1ª sprint pós-feature; não bloqueiam merge)

1. **modifiability-1 — Enum `MOTIVO_BLOQUEIO` duplicado no frontend.**
   Backend tem o SSOT tipado (`EstadoElegibilidade.ts`); `app/permutas/page.tsx:38-49`
   reduplica os 10 slugs como `Record<string, string>` e `lib/types.ts:40` usa
   `motivoBloqueio?: string` (string livre). Tactic: *Abstract Common Services*.
   Risco: drift BE↔FE invisível ao typecheck (esta fatia já introduziu mais 1
   literal `'ja-permutado'` solto). Propor SSOT compartilhado / union exaustivo.

2. **testability-1 — Branch `ja-permutado` do `StatusBadge` sem teste unitário.**
   O valor da feature é justamente o badge VISUALMENTE DISTINTO (info vs. danger),
   hoje defendido só por design review. `app/permutas/page.tsx` (680 LOC) tem 0
   testes de componente. Propor teste de render do `StatusBadge` cobrindo
   `motivo='ja-permutado'` (tom info + ícone check + label "Já permutado").

3. **deployability-1 — Skew BE↔FE no deploy de novos literais de status.**
   Render (BE) e Vercel (FE) deployam independentes (~5min de janela); novos
   literais de union (`casamento-manual`, e agora o label `ja-permutado`) podem
   renderizar antes/depois do par. Propor fallback defensivo no FE para
   status/motivo desconhecido + ordenação de deploy.

## P2 (média — backlog)

- **integrability-1 / security-1** (overlap): detail `com298/{docCod}` consumido
  como `Record<string, unknown>` sem Zod, enquanto o `list` já tem `com298RowSchema`.
  `mnyTitPermutar`/`mnyTitPermuta`/`mnyTitAberto` só protegidos por `parseOptionalNumber`
  → cego a rename de campo upstream. Propor `com298DetailSchema`.
- **modifiability-2** — `StatusBadge` mistura mapeamento de status com if's de
  exceção de motivo; propor tabela data-driven.
- **modifiability-3** — `page.tsx` em 680 LOC (pré-existente; *Split Module*).
- **modifiability-4 / testability-3** — `MOTIVO_LABEL` como `Record<string,string>`
  perde exaustividade no typecheck.
- **deployability-2** — smoke só cobre `/health`; sem assert de contrato sobre
  `GestaoPermutasResponse` (novo campo + literais). Propor smoke Zod no dry-run.
- **deployability-3** — `RENDER_BACKEND_URL` ausente faz o smoke `exit 0` (warning).
- **fault-tolerance-2** — falta teste de borda dedicado para o caminho integrado
  `DETAIL_INDISPONIVEL` (o motivo isolado tem teste; o e2e do ramo não).
- **testability-2** — `ConexosClient.test.ts` em 1333 LOC; describe de
  `getDetalheTitulos` mistura 5 facetas.

## P3 (baixa — radar)

- availability-1/2 (instrumentar log p/ distinguir `valorPermutado=undefined` de `0`;
  agregar contagem de motivos por run/filial → futuro alarme CloudWatch).
- performance-1/2 (counter `calls_per_doccod_per_run`; dashboard p95 quando o stack
  Lambda/CloudWatch existir — estado-alvo).
- integrability-2 (type-alias do agregado `{valorPermutar?,pago?,valorPermutado?}`
  declarado literal em 3 sites).
- security-2 (audit trail da decisão `JA_PERMUTADO` vs `SEM_SALDO_PERMUTAR` — débito
  de plataforma, rastreado em `migration-debt.md`).
- testability-4/5 (fixtures inline sem `__fixtures__/`; clock não injetado).

## Não medível em `--quick`
Coverage %, `terraform plan` (sem `infra/` — estado-alvo), deep `npm audit`.
