# Regis-Review Follow-ups — permutas-painel-elegiveis

**Run:** `2026-06-17-2340` · **Fonte:** `docs/regis-review/2026-06-17-2340/{REPORT,KANBAN}.md`
**Regra do pipeline:** P0 re-entram no loop (remediados nesta feature); **P1/P2/P3 NÃO** — viram tickets a partir daqui.

## P1 — Alto (18)
Ver `KANBAN.md` §P1. Destaques pré-requisitos da **Fatia 2** (write `fin010`):
- `rbac-roles-permutas` (sec-1) — RBAC por perfil antes de qualquer rota de escrita.
- `pii-redact-logger` (sec-4) — logger global imprime body cru (vetor LGPD quando SISPAG/valores entrarem).
- `probe-placeholder-guard` (integ-4/mod-6/ft-7) — fail-loud se probe provisório chegar em prd.
  **Nota (2026-06-18):** a chave `adiantamento` foi **resolvida** pelo probe de rede (`docVldTipoAdto=1`,
  FinDocCab) — o placeholder anterior (`adiantamento#EQ:'S'`) era um BUG (HTTP 500). O guard de
  **runtime** ainda é **desejável** para futuros probes (ex.: `gate-3-pago-via-detail`).
- `com308-zod-boundary` (integ-1/sec-3) — aplicar `com308RowSchema` (hoje declarado, não usado).
- `status-partial-*` (avail-4/ft-4) — semântica `partial` real (capHit + falha de filial).
- `health-ready-deep` / `fail-fast-bootstrap-prd` / `down-migration-convention` — fechar o anel de deploy.
- `clock-provider` (test-3) — determinismo de aging/duração.
- `tenant-constants-ssm` (mod-3) — pré-requisito SaaSo 2º cliente.

## Novos follow-ups de domínio (descobertos pós-run)

- **`gate-3-pago-via-detail` (P1, descoberto no probe de rede 2026-06-18).** Confirmar a fonte wire
  do status **TOTALMENTE PAGO** (Gate 3) **antes** de a eleição produzir candidatas elegíveis. Nos
  **410 adiantamentos reais** (dev tenant Columbia, `filCod=2`), o `com298/list` traz
  `mnyTitAberto=null` / `mnyTitPago=null` → `isPago=false` p/ todos → Gate 3 bloquearia tudo. Fonte
  provável = **endpoint de detalhe** (modal financeiro), igual ao `mnyTitPermutar` (já hidratado via
  `getMnyTitPermutar` detail). **Bloqueante** para a feature produzir ALGUMA candidata elegível; NÃO
  foi escopo do probe. Casa com `probe-placeholder-guard` (P1) e `fixtures-conexos-wire` (P2).

## P2 — Médio (14)
Ver `KANBAN.md` §P2. Notáveis: `gateway-permutas-conexos` (anti-corruption), `fixtures-conexos-wire`
(casa com o probe P0-4 do Yuri), `multiplas-invoices-decidir` (resolver `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES`
órfão), `paginacao-painel`, `staging-environment`, `reaper-reconciliacao` (passivo da Fatia 2).

## P3 — Baixo (6)
Ver `KANBAN.md` §P3: ADR cutover do shim Conexos, readiness probe Conexos, alertamento FLOW_ERROR, etc.

## Cross-link com gaps de domínio ainda abertos
- **P0-4** (campo wire da data-base `imp019`/`imp223`) → ✅ **RESOLVIDO** (probe de rede 2026-06-18):
  `cdiDtaCi` (D.I) / `dioDtaDesembaraco` (DUIMP). Não mais aberto. `fixtures-conexos-wire` (P2) deve
  fixar esses campos reais.
- **`adiantamento` filter key** → ✅ **RESOLVIDO** (probe 2026-06-18): `docVldTipoAdto=1` (FinDocCab).
  O guard de runtime (`probe-placeholder-guard`, P1) segue desejável p/ futuros probes.
- **`gate-3-pago-via-detail`** (NOVO, P1) — único gap de domínio aberto remanescente (ver acima).
- Build-probe fonte `com308` — casa com `com308-zod-boundary` (P1).
