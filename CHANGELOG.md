# Columbia Financeiro — Changelog

## v0.2.0 (2026-06-18) — permutas: painel de elegíveis (Frente I, Fatia 1)

- feat(permutas): painel de pendências elegíveis read-only — automação das etapas 1–5 do fluxo manual.
  - Leitura Conexos: `listAdiantamentosProforma`, `listDeclaracaoByProcesso` (D.I/DUIMP).
  - Domínio: elegibilidade (4 gates), casamento 1:1, variação cambial (juros/desconto por taxa), aging, eleição, painel.
  - Persistência: 1ª migration do repo + runner; snapshot + auditoria com transação atômica.
  - Endpoints: `POST /permutas/eleicao` (trigger manual), `GET /permutas/painel`.
  - Ontologia v0.2.1 (5 entidades, 5 ações, ADR-0004); Regis-Review `2026-06-17-2340` + 7 P0 remediados.
  - Em aberto (não-bloqueante): probe P0-4 (campo wire da data-base) liga a coluna *aging* depois.

## v0.1.0 (2026-06-10) — bootstrap

- chore(bootstrap): template virgem porém rodável a partir de `fechamento-processos` v0.10.2
  - Meta-camada: `.claude/` (19 agentes + 13 comandos), `ontology/` (charter + estrutura, domínio vazio), `CLAUDE.md`, configs (biome/tsconfig/CI).
  - Backend Express/DDD rodável: `/health`, auth Supabase, container tsyringe, libs, `ConexosClient` (mesmo tenant), rota de exemplo `GET /conexos/filiais`.
  - Frontend Next.js rodável: shell autenticado, login Microsoft (Supabase), Design System, página inicial placeholder.
  - Sem features de domínio (modeladas depois via `/feature-new`). Ver ADR `ontology/decisions/0001-bootstrap-financeiro.md`.
  - Gates verdes no bootstrap: backend (typecheck/lint/232 testes/build), frontend (typecheck/lint/34 testes/build).

> Versão **do app** (frontend + backend em **lockstep** — mesmo número nos dois `package.json`).
> Exibida na UI (badge/título, `src/frontend/app/layout.tsx`) e no `/health` do backend.
> Mantida pelo `scripts/bump-version.ps1` na fase Ship do pipeline (semver por conventional-commit).
>
> NÃO confundir com `ontology/CHANGELOG.md`, que versiona a **ontologia** (domínio/regras).
