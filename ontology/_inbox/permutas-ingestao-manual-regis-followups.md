# Regis-Review — Permutas `ingestao-manual` (ADR-0006) — DISPENSADO (adiado)

**Branch:** `feat/permutas-multiplas` · **Data:** 2026-06-20 · **App:** v0.3.0 · **Ontologia:** v0.2.3

## Status do gate

O gate **Regis-Review (8-QA)** foi **adiado por decisão do Yuri** (opt-out explícito
nesta execução). Justificativa: mudança pequena, **read-only no ERP** (I4
preservado), reaproveita infra existente (`IngestaoPermutasService`,
`permuta_eleicao_run`, advisory lock), e já passou nas duas revisões direcionadas:

- **PatternGuardian:** 0 violações (SQL parametrizado, DI, modifiers explícitos,
  `IngestLockBusyError` não logado por ADR-0006).
- **DesignSystemReviewer:** 0 violações (2 warnings não-bloqueantes: opacidade `/40`
  deliberada na caixa de aviso; cor do spinner — ambos aceitos).

## Pendência

Rodar `/regis-review --quick` escopado ao delta **antes do merge para `main`**
(ou registrar dispensa definitiva no PR). Diretórios tocados:
`src/backend/{routes,domain/errors,domain/repository/permutas,domain/service/permutas}`,
`src/frontend/{app/permutas,lib}`.

## Delta entregue (para o reviewer)

- BE: `POST /permutas/ingestao`, `GET /permutas/runs`, `IngestLockBusyError`,
  `PermutaSnapshotRepository.listRecentRuns`, propagação do erro tipado no
  `persistIngestRun` + `IngestaoPermutasService.executar`.
- FE: botão + modal em `app/permutas/page.tsx`; `lib/api.ts`
  (`fetchPermutaRuns`/`runIngestaoManual`/`IngestaoEmAndamentoError`); `lib/types.ts`.
- Testes: `routes/permutas.test.ts`, `PermutaSnapshotRepository.test.ts`,
  `IngestaoPermutasService.test.ts`, `__tests__/permutas-ingestao-api.test.ts`.

## Possíveis focos do reviewer (hipóteses, não-findings)

- **Fault-Tolerance:** confirmar que `IngestLockBusyError` nunca grava run de erro
  (já coberto por teste) e que o 409 não deixa estado parcial.
- **Security:** `triggered_by` derivado do token verificado (não do cliente) — ok;
  conferir que `/ingestao` está sob a auth global + `heavyRouteLimiter` (está,
  `index.ts:87-88`).
- **Performance:** `/ingestao` é síncrono e espera o fan-out concluir (o modal
  aguarda) — aceitável para uso manual; avaliar timeout do proxy/Render se a
  ingestão for longa.
