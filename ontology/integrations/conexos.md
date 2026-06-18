---
name: conexos
type: integration
direction: read-only (esta fatia)
ontology_version: "0.2"
implementation_status: partial
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/client/ConexosClient.ts
last_review: 2026-06-18
endpoints_read:
  - com298 (PROFORMA tpdCod=99 + docVldTipoAdto=1 / INVOICE tpdCod=128 / detail mnyTitPermutar)
  - imp019 (D.I — data CI = cdiDtaCi)
  - imp223 (DUIMP — data desembaraço = dioDtaDesembaraco)
  - com308 (título a-pagar — taxa/valor negociado)
endpoints_write:
  - fin010 (FORA DE ESCOPO nesta fatia)
resolved-by:
  - "P0-3 — caminho = listFinanceiroAPagar(PROFORMA) + filtro docVldTipoAdto=1 (FinDocCab); chave wire confirmada por probe de rede (dev tenant Columbia, 2026-06-18, filCod=2, 410 adiantamentos reais)"
  - "P0-4 — campos wire da data-base RESOLVIDOS: cdiDtaCi (imp019, D.I) / dioDtaDesembaraco (imp223, DUIMP); probe de rede 2026-06-18; XOR confirmado em dados reais"
  - "P0-7 — query lista TODAS via 3 filtros; sem janela incremental; multi-filial; rate-limit é nota de impl (Yuri, 2026-06-17)"
open-gap:
  - "gate-3-pago-via-detail (NOVO, P1) — status TOTALMENTE PAGO vem null no com298/list (mnyTitAberto/mnyTitPago=null nos 410 reais); fonte provável = endpoint de detalhe (a confirmar por probe)"
---

# Integração: Conexos ERP (lado-LEITURA — Permutas Fatia 1)

> Contrato de **leitura** consumido pela Frente I, Fatia 1 (painel READ-ONLY). Reusa o
> `ConexosClient` já validado (mesmo tenant do `fechamento-processos`, `priCod=1153`).
> **Sem escrita** (`fin010` fora de escopo). Esta fatia **re-introduz** reads de D.I/DUIMP
> que o ADR-0003 podou (ver ADR-0004 e migration-debt O3).

## Endpoints de leitura

| Endpoint | Uso | Método `ConexosClient` | Wire | Notas |
|----------|-----|------------------------|------|-------|
| `com298/list` | PROFORMA finalizado (Adiantamento) | `listFinanceiroAPagar({docTip:'PROFORMA'})` + filtro `docVldTipoAdto=1` | `tpdCod=99`, `vldStatus=['3']`, `docVldTipoAdto=1` (FinDocCab) | **P0-3 RESOLVIDO (probe 2026-06-18):** 3 filtros (Adiantamento=SIM + Tipo=PROFORMA + Situação=FINALIZADO, Plano Financeiro VAZIO). Chave wire = `docVldTipoAdto=1`. |
| `com298/list` | INVOICE finalizada | `listFinanceiroAPagar({docTip:'INVOICE'})` | `tpdCod=128`, `vldStatus=['3']` | Casamento por `priCod`. |
| `GET com298/{docCod}` | `mnyTitPermutar` (saldo a permutar) | `getMnyTitPermutar({docCod})` | detail; `null` no list | Gate 2 (`> 0`). Fan-out por candidato. |
| `GET com298/{docCod}` (detail) | status TOTALMENTE PAGO (Gate 3) | _a confirmar (probe)_ | `mnyTitAberto`/`mnyTitPago` = `null` no list | **NOVO GAP `gate-3-pago-via-detail`:** status pago não vem no list; fonte provável = detalhe (como `mnyTitPermutar`). |
| `imp019/list` | D.I — **data CI** (data-base) | re-introduzido; `mapDeclaracaoDataBase` | `cdiDtaCi` (epoch-ms); acompanha `cdiEspNumci` (nº CI) | **P0-4 RESOLVIDO (probe 2026-06-18).** Campo wire confirmado. |
| `imp223/list` | DUIMP — **data de desembaraço** (data-base) | re-introduzido; `mapDeclaracaoDataBase` | `dioDtaDesembaraco` (epoch-ms) | **P0-4 RESOLVIDO (probe 2026-06-18).** Campo wire confirmado. |
| `com308/financeiroAPagar/list/{docCod}` | taxa/valor negociado | `listTitulosAPagar({docCod})` | `titFltTaxaMneg`, `titMnyValorMneg`, `moeCodMneg`, `moeEspNome`, `titMnyValor`; `serviceName='com308.finTituloFin'` | Entrada da `VariacaoCambial` (fórmula = comparação de TAXA, P0-1 RESOLVIDO). |

## Constantes de tenant (Columbia, priCod=1153)

- `tpdCod`: 99 (PROFORMA), 128 (INVOICE). `tpdCod=143` (IMPLANTAÇÃO SALDO) era o caminho
  alternativo do P0-3 — **descartado** (caminho correto é PROFORMA + filtro `docVldTipoAdto=1`).
- `docVldTipoAdto`: `1` = adiantamento (modelo `FinDocCab`). Chave wire confirmada por probe
  (2026-06-18). Plugado em `conexosPermutasConstants.ts`.
- `gerNum`: 198 (ADTO FORNECEDOR INTERNACIONAIS — confirmado nos 410 reais carregando
  `docVldTipoAdto=1` / `gcdDesNome="ADIANTAMENTO PROFORMA"`), 210/233 — não usados como *caminho* de
  eleição (path `gerNum` descartado por P0-3); mantidos como referência de catálogo de tenant.
- `vldStatus`: `'3'` = FINALIZADO.
- **P6 / Inviolable Rule #2:** estes IDs são da instalação Columbia — manter como **constantes
  tipadas**, nunca hardcode de tenant em service. Outra trading (outro `priCod`) recalibra os IDs.

## Estado dos gaps

- **P0-3 — RESOLVIDO (probe de rede 2026-06-18).** Caminho = `listFinanceiroAPagar({docTip:'PROFORMA'})`
  + filtro **`docVldTipoAdto=1`** (FinDocCab) (3 filtros: Adiantamento=SIM + Tipo=PROFORMA +
  Situação=FINALIZADO; Plano Financeiro VAZIO). Caminho `listAdiantamentoFinanceiroAPagar`/`tpdCod=143`/`gerNum=198`
  (path) **descartado**. O placeholder anterior (`adiantamento#EQ`/`'S'`) era um **BUG** (HTTP 500
  `adiantamento (FinDocCab)`, campo inexistente). **Não é mais build-probe.**
- **P0-4 — RESOLVIDO (probe de rede 2026-06-18).** Campos wire de data-base: `cdiDtaCi` (`imp019`,
  D.I, data CI, epoch-ms; acompanha `cdiEspNumci`) e `dioDtaDesembaraco` (`imp223`, DUIMP, epoch-ms).
  XOR DI/DUIMP confirmado em dados reais. Plugado em `ConexosClient.mapDeclaracaoDataBase`. A coluna
  aging agora popula. **Não é mais `blocked-by`.**
- **P0-7 — RESOLVIDO.** Query lista **todas** via os 3 filtros, depois elege; **sem janela
  incremental**; multi-filial. Rate-limit (`PAGE_SIZE=500`, `MAX_PAGES=50`, paginate cap
  existente) é **nota de implementação não-bloqueante**.
- **NOVO GAP — `gate-3-pago-via-detail` (P1, descoberto no probe).** Status TOTALMENTE PAGO (Gate 3)
  vem **`null`** no `com298/list` (`mnyTitAberto`/`mnyTitPago` = `null` nos 410 reais) → `isPago=false`
  p/ todos. Fonte provável = **endpoint de detalhe** (igual a `mnyTitPermutar`). Confirmar antes de a
  eleição produzir candidatas elegíveis.

## Fora de escopo (Fatia 1)

- **`fin010` (ESCRITA)** — executar permuta / baixa em BAIXAS PERMUTAS. É a Fatia 2; o caminho
  de **write-back no ERP não existe e não foi validado** (risco arquitetural #1, ADR-0002/0003 O3).
  Esta integração documenta **só leitura**.
