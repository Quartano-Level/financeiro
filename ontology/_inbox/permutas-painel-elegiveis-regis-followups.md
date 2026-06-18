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
- **`gate-3-pago-via-detail`** → ✅ **RESOLVIDO** (2026-06-18, feature-tweak impl-only). Gate 3 agora
  hidrata `pago` do DETALHE (`getDetalheTitulos`, `mnyTitAberto === 0`) em vez da row do `com298/list`
  (que vinha NULL→false p/ todas). Os P1 residuais de robustez dessa fatia estão na nova seção abaixo.
- Build-probe fonte `com308` — casa com `com308-zod-boundary` (P1).

---

## Run `2026-06-18-1441` — follow-ups de gate-3-pago-via-detail (impl-only, scoped --quick)

**Fonte:** `docs/regis-review/2026-06-18-1441/{integrability,fault-tolerance,modifiability,testability}.md`
**Gate:** **0 P0 introduzidos pelo delta** → sem re-loop. P1/P2/P3 viram tickets a partir daqui (não implementados nesta fatia).
**Scorecard (scoped):** Integrability 8 · Fault-Tolerance 8.5 · Modifiability 8 · Testability 9.
(Availability/Deployability/Performance/Security não rodaram — delta read-only, sem infra/auth/SQL novo.)

### P1 — Alto
- **[integrability-1 / fault-tolerance-1] Zod no boundary do detalhe (S).** `mapDetalheTitulos`
  (`ConexosClient.ts:~902`) consome `Record<string, unknown>` sem schema. Drift de `mnyTitAberto`
  (rename/tipo) → `pago=undefined` → `false` → reprovação em massa do Gate 3, **silenciosa**. Casa com
  `com308-zod-boundary` (P1) já fichado. Adicionar `com298DetalheSchema` + log de coerção-falha.
- **[integrability-2] Fixtures reais do detalhe (S).** Os 5 cenários de `getDetalheTitulos` usam
  literais inline; o payload real (sonda 2026-06-18, docs 26471/24166, filCod=2) foi probe throwaway.
  Comitar snapshot em `__fixtures__/com298-detalhe-*.json`. Consolidar com `fixtures-conexos-wire` (P2).
- **[fault-tolerance-2] Contador run-level de DETAIL_INDISPONIVEL (S).** Há `BUSINESS_WARN` por
  candidata mas nenhum agregado; regime degradado prolongado fica invisível. Somar
  `detailIndisponivelCount` no resumo `FLOW_COMPLETE`. Tactic: Condition Monitoring.
- **[testability-1] Observar divergência list-pago vs detail-pago (S).** O caso-bug literal (list=true,
  detail=false) não asserta `calls`; a divergência é silenciosa. Emitir/assertar log estruturado
  `divergencia: 'pago_list_vs_detail'` (insumo p/ futuramente defender remoção do fan-out extra).
- **[testability-2] Assertar `valorPermutar` na candidata (S).** `buildCandidata` hidrata DOIS campos
  do detalhe; os três testes novos de service fixam só `pago`. Adicionar
  `expect(...adiantamento.valorPermutar).toBe(<detail value>)` nos três casos.

### P3 — Baixo
- **[modifiability-1] Comentário stale (trivial).** `EleicaoPermutasService.test.ts:~441` ainda cita
  `getMnyTitPermutar`. Atualizar para `getDetalheTitulos`. Cosmético; não bloqueia.

## Novos follow-ups de domínio (varredura de 408 detalhes, 2026-06-18)

Fonte: probe throwaway `probe-permutar-formula.ts` (deletado) — varreu os 411 PROFORMA reais via detalhe
`com298/{docCod}`. Identidade `mnyTitValor = mnyTitPago + mnyTitAberto` = **universal (0/408)**.
Buckets: 70 NÃO PAGO · 332 TOTALMENTE PAGO · 6 PARCIALMENTE PAGO · 42 com permuta · 3 erros HTTP 500.

- **`residual-pago-centavos` (P2 — decisão de domínio, c/ analistas).** Doc **8721** tem `aberto=0,02`
  em título de `~R$20.373.009` (`permutar=0`). Gate 3 estrito (`=== 0`) o **BLOQUEIA**. Confirmar com os
  analistas Columbia: (a) resíduo de centavos conta como TOTALMENTE PAGO? (b) qual o teto de "residual"
  (epsilon)? Se sim → vira mudança de regra (ADR + OntologyCurator: `pago ⟺ mnyTitAberto < ε`).
  Yuri decidiu em 2026-06-18: **manter estrito por ora**, tratar 8721 como caso anômalo a confirmar.
- **`vc-permuta-parcial` (Fatia 2 — pré-requisito de escrita).** Docs **3334** (pago=462.227,29 /
  permutar=168.052,99) e **11808** (pago=193.460,42 / permutar=1.672,99) são **permutas parciais**:
  totalmente pagos (`aberto=0` → elegíveis no Gate 3) mas que usam só valor **parcial** na baixa/borderô.
  A baixa em `fin010` **deve** usar o `mnyTitPermutar` LITERAL (nunca reconstruir de pago/permuta — a
  aproximação `pago−permuta` quebra nesses casos). **⚠️ A variação cambial deve ser calculada sobre o
  valor PARCIAL efetivamente permutado, não sobre o valor integral do título** — revisar
  `computeVariacao` / `VariacaoCambialService` antes da Fatia 2.
