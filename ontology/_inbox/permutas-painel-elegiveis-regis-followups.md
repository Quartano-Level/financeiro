# Regis-Review Follow-ups — permutas-painel-elegiveis

**Run:** `2026-06-17-2340` · **Fonte:** `docs/regis-review/2026-06-17-2340/{REPORT,KANBAN}.md`
**Regra do pipeline:** P0 re-entram no loop (remediados nesta feature); **P1/P2/P3 NÃO** — viram tickets a partir daqui.

## P1 — Alto (18)
Ver `KANBAN.md` §P1. Destaques pré-requisitos da **Fatia 2** (write `fin010`):
- `rbac-roles-permutas` (sec-1) — RBAC por perfil antes de qualquer rota de escrita.
- `pii-redact-logger` (sec-4) — logger global imprime body cru (vetor LGPD quando SISPAG/valores entrarem).
- `probe-placeholder-guard` (integ-4/mod-6/ft-7) — fail-loud se probe provisório chegar em prd.
- `com308-zod-boundary` (integ-1/sec-3) — aplicar `com308RowSchema` (hoje declarado, não usado).
- `status-partial-*` (avail-4/ft-4) — semântica `partial` real (capHit + falha de filial).
- `health-ready-deep` / `fail-fast-bootstrap-prd` / `down-migration-convention` — fechar o anel de deploy.
- `clock-provider` (test-3) — determinismo de aging/duração.
- `tenant-constants-ssm` (mod-3) — pré-requisito SaaSo 2º cliente.

## P2 — Médio (14)
Ver `KANBAN.md` §P2. Notáveis: `gateway-permutas-conexos` (anti-corruption), `fixtures-conexos-wire`
(casa com o probe P0-4 do Yuri), `multiplas-invoices-decidir` (resolver `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES`
órfão), `paginacao-painel`, `staging-environment`, `reaper-reconciliacao` (passivo da Fatia 2).

## P3 — Baixo (6)
Ver `KANBAN.md` §P3: ADR cutover do shim Conexos, readiness probe Conexos, alertamento FLOW_ERROR, etc.

## Cross-link com gaps de domínio ainda abertos
- **P0-4** (campo wire da data-base `imp019`/`imp223`) permanece probe de diagnóstico — casa com `fixtures-conexos-wire` (P2).
- Build-probes (`adiantamento` filter key, fonte `com308`) — casam com `probe-placeholder-guard` (P1) e `com308-zod-boundary` (P1).
