# Regis-Review — Permutas `cliente-filtro` + `permuta-manual` (Fase 1, ADR-0007) — DISPENSADO (adiado)

**Branch:** `feat/permutas-multiplas` · **Data:** 2026-06-20 · **App:** v0.3.0 · **Ontologia:** v0.2.5

## Status do gate

Gate **Regis-Review (8-QA) adiado por decisão do Yuri** (opt-out; usar `/plan` por fase). READ-ONLY no
ERP (I4 intocado). Passou nas duas revisões direcionadas:

- **PatternGuardian:** 0 violações (SQL parametrizado em `ClienteFiltroRepository` e no upsert; DI/@inject;
  modifiers; Zod nas rotas; sem `!`/process.env em services).
- **DesignSystemReviewer:** finding único (badge `permuta-manual` usava `bg-primary` sólido) **resolvido** —
  criado token próprio `--permuta`/`--permuta-subtle`/`--permuta-foreground` (violeta, distinto, legível),
  badge `bg-permuta-subtle text-permuta-foreground`, KPI `color="permuta"`.

## Pendência

Rodar `/regis-review --quick` escopado ao delta antes do merge para `main` (ou dispensa definitiva no PR).
Diretórios: `src/backend/{domain/interface/permutas,domain/repository/permutas,domain/service/permutas,routes,migrations}`,
`src/frontend/{app/permutas,app/permutas/clientes-filtro,components/ui/kpi-card,lib}`.

## Delta entregue (Fase 1)

- BE: `EstadoElegibilidade` (+PERMUTA_MANUAL/+CLIENTE_FILTRO), `Adiantamento`/`Gestao`/`AdiantamentoRow`
  (+pesCod/importador, +status/total), `ClienteFiltroRepository` (NOVO), `EleicaoPermutasService`
  (injeta repo + fetchProcessosBatched + override em buildCandidata), `IngestaoPermutasService`
  (toEstadoRow/toAdiantamentoRow), `GestaoPermutasService` (status+total), `listImportadores`,
  rotas CRUD `/cliente-filtro` + `/importadores`, migrations 0011-0013.
- FE: status `permuta-manual` (KPI/badge/filtro/token), tela `/permutas/clientes-filtro`, api + types.

## Próximas fases (NÃO neste escopo)
- **Fase 2:** busca de invoice cross-process (live por nº de processo) + entidade de **alocação** N:M
  (links livres, valores parciais) + UI de alocação (read-only no ERP). Variação/aging pela D.I da invoice.
- **Fase 3:** write-back `fin010` (risco arquitetural #1).
