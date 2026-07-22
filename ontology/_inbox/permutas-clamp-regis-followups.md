# Regis-Review follow-ups — permutas clamp Cliente/Exportador

Origem: gate pós-impl de `/feature-tweak permutas "line-clamp-2 + tooltip no hover em Cliente/Exportador"`
Run: `2026-07-22-1953` (scope=frontend, --quick)
REPORT: `docs/regis-review/2026-07-22-1953/REPORT.md`
KANBAN: `docs/regis-review/2026-07-22-1953/KANBAN.md` (lista completa dos 16 cards)

## Verdict: GREEN — 0 P0, 0 P1

Nenhum finding bloqueia o merge deste delta presentacional. Overall ponderado **7.97**.
Scorecard: Availability 8.0 · Deployability 7.0 · Integrability 8.0 · Modifiability 8.0 ·
Performance 9.0 · Fault Tolerance 8.5 · Security 8.0 · Testability 7.0.

Cards por prioridade: **P0=0 · P1=0 · P2=9 · P3=7** (total 16). Todos são preventivos/escopo —
**não implementados neste loop** (regra do pipeline: só P0 re-entra). Viram tickets de backlog.

## Top follow-ups consolidados (cross-QA, não bloqueadores)

1. **R-1 — Observabilidade zero no FE em produção** (Availability + Fault Tolerance + Testability):
   0 RUM, ErrorBoundary não auditado, único anel de teste é jsdom.
   Cards: `availability-1` (M), `testability-2` (M — Playwright screenshot p/ validar o truncamento visual).
2. **R-2 — Gate de CI do frontend incompleto**: sem `npm run build` e sem `npm audit` no CI do FE
   (backend tem ambos). Quick wins: `deployability-1` (S), `deployability-2` (S).
3. **R-3 — `Campo` co-localizado em Permutas** (46 call-sites, 0 fora): duplicação iminente quando
   SISPAG/GED pedirem o mesmo padrão de truncamento → promover a `TruncatedText` no DS.
   Cards: `integrability-1` (S, gatilhado), `modifiability-2` (M — split de `VisaoGeralTable.tsx`, ~500 LOC).

> Ver KANBAN.md para os 16 cards com Problema / Melhoria Proposta / Resultado Esperado / métricas.
> Relacionado: [[permutas-clamp-followups]] (2 P1 do DesignSystemReviewer sobre `Tooltip` do DS vs `title`
> nativo e o princípio "never hide data behind clicks").
