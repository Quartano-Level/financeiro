# HANDOFF — Permutas Frente I, Fatia 1 (retomar aqui)

**Última sessão:** 2026-06-18 · **Status:** feature verde no PR, validada contra Conexos real.

## Coordenadas
- **Branch:** `feat/permutas-painel-elegiveis` · **PR:** #2 (https://github.com/Quartano-Level/financeiro/pull/2), base `main`, OPEN.
- **Worktree** (pode ter sido limpo): `/private/tmp/permutas-painel-wt`. Recriar se sumiu:
  `git worktree add /private/tmp/permutas-painel-wt feat/permutas-painel-elegiveis`
- **App version:** 0.2.0 (FE+BE) · **Ontologia:** v0.2.2.

## Feito (não refazer)
- Pipeline `/feature-new` completo: entrevista → ontologia (5 entidades, 5 ações, ADR-0004) → tasks → impl read-only → Regis-Review (7 P0 remediados) → probe real.
- Implementado: leitura Conexos (`listAdiantamentosProforma`, `listDeclaracaoByProcesso`), 6 services (elegibilidade 4-gates, casamento 1:1, variação cambial por taxa, aging, eleição, painel), Postgres (1ª migration + runner + transação atômica), endpoints `POST /permutas/eleicao` + `GET /permutas/painel`. **Sem escrita em `fin010`** (Fatia 2).
- **Validado contra dados reais** (probe 2026-06-18, filCod=2, 410 adiantamentos):
  - P0-3: filtro `docVldTipoAdto=1` (`FinDocCab`) — o placeholder `adiantamento#EQ:'S'` dava **HTTP 500**.
  - P0-4: data-base D.I=`cdiDtaCi` (`imp019`), DUIMP=`dioDtaDesembaraco` (`imp223`). Aging popula.
- Gates: typecheck ✅ · lint ✅ · 261 testes ✅ · PatternGuardian ✅.

## ➡️ PRÓXIMO PASSO (o que destrava a feature)
**`gate-3-pago-via-detail` (P1):** nos 410 reais, `com298/list` traz `mnyTitAberto`/`mnyTitPago` = null →
`isPago` retorna false p/ TODOS → o **Gate 3 (TOTALMENTE PAGO) bloquearia toda candidata**. O status
provavelmente mora no **endpoint de DETALHE** do adiantamento (`GET /com298/{docCod}`), igual ao
`mnyTitPermutar` (já hidratado via `getMnyTitPermutar`).
- **Plano:** (1) probe num adiantamento conhecido como pago → achar o campo wire do status pago no detalhe;
  (2) `/feature-tweak permutas "gate 3 pago via detalhe do com298"` → hidratar `pago` no `ElegibilidadeService`.

### Receita do probe (como foi feito hoje — reconstruir assim)
1. `.env` em `src/backend/` com `CONEXOS_USERNAME`/`CONEXOS_PASSWORD`/`CONEXOS_FIL_COD=2` (NÃO commitar; o EnvironmentProvider faz `dotenv.config`, então remova o `.env` antes de rodar `npm test`).
2. Script `tsx` standalone (throwaway, não commitar) que: `buildLegacyConexosAdapter` → registra `LEGACY_CONEXOS_TOKEN` → resolve `ConexosClient` → chama `adapter.getGeneric('com298/{docCod}', {filCod})` e dumpa as chaves do detalhe procurando `pago`/`mnyTitAberto`/`mnyTitPago`/`liquidad`.
3. Rodar: `cd src/backend && npx tsx scripts/<probe>.ts`. Filtrar ruído com `grep -v 'CONEXOS →\|Deprecation'`.

## Outras pendências (sem pressa)
- 🔬 build-probe `com308`: confirmar doc-fonte de `taxaAdiantamento`/`taxaInvoice`/`principalMoeda` (assunção `titFltTaxaMneg`/`titMnyValorMneg`).
- 📋 38 follow-ups do Regis-Review: `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md` (RBAC, PII-redact, probe-guard = **pré-requisitos da Fatia 2**).
- **Fatia 2** (escrita em `fin010` — borderô + baixa permuta): maior risco arquitetural (O3). Começar pelo spike do contrato de escrita. Fluxo manual completo no PDF `docs-contexto/Processo-Permutas-Adiantamento.pdf` (etapa 6).

## Onde está cada coisa
- Gaps + decisões P0: `ontology/_inbox/permutas-painel-elegiveis-interview.md`
- Tasks: `ontology/_inbox/permutas-painel-elegiveis-tasks.md`
- Follow-ups Regis: `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md`
- Relatório Regis: `docs/regis-review/2026-06-17-2340/{REPORT,KANBAN}.md`
- Regras juros/desconto + 4 gates: `ontology/business-rules/`, `ontology/entities/`
- Integração wire (campos confirmados): `ontology/integrations/conexos.md`
