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
last_review: 2026-06-17
endpoints_read:
  - com298 (PROFORMA tpdCod=99 / INVOICE tpdCod=128 / detail mnyTitPermutar)
  - imp019 (D.I — data CI)
  - imp223 (DUIMP — data desembaraço)
  - com308 (título a-pagar — taxa/valor negociado)
endpoints_write:
  - fin010 (FORA DE ESCOPO nesta fatia)
resolved-by:
  - "P0-3 — caminho = listFinanceiroAPagar(PROFORMA) + filtro booleano adiantamento=SIM (Yuri, 2026-06-17)"
  - "P0-7 — query lista TODAS via 3 filtros; sem janela incremental; multi-filial; rate-limit é nota de impl (Yuri, 2026-06-17)"
blocked-by:
  - "P0-4 — nome wire do campo de data-base (imp019/imp223) — único gap aberto (probe)"
build-probe:
  - "P0-3 — capturar o literal da chave wire do filtro 'adiantamento' (ex.: adiantamento#EQ:'S')"
---

# Integração: Conexos ERP (lado-LEITURA — Permutas Fatia 1)

> Contrato de **leitura** consumido pela Frente I, Fatia 1 (painel READ-ONLY). Reusa o
> `ConexosClient` já validado (mesmo tenant do `fechamento-processos`, `priCod=1153`).
> **Sem escrita** (`fin010` fora de escopo). Esta fatia **re-introduz** reads de D.I/DUIMP
> que o ADR-0003 podou (ver ADR-0004 e migration-debt O3).

## Endpoints de leitura

| Endpoint | Uso | Método `ConexosClient` | Wire | Notas |
|----------|-----|------------------------|------|-------|
| `com298/list` | PROFORMA finalizado (Adiantamento) | `listFinanceiroAPagar({docTip:'PROFORMA'})` + filtro booleano `adiantamento=SIM` | `tpdCod=99`, `vldStatus=['3']`, `adiantamento=SIM` (chave wire → build-probe) | P0-3 RESOLVIDO: 3 filtros (Adiantamento=SIM + Tipo=PROFORMA + Situação=FINALIZADO, Plano Financeiro VAZIO). Literal da chave → probe. |
| `com298/list` | INVOICE finalizada | `listFinanceiroAPagar({docTip:'INVOICE'})` | `tpdCod=128`, `vldStatus=['3']` | Casamento por `priCod`. |
| `GET com298/{docCod}` | `mnyTitPermutar` (saldo a permutar) | `getMnyTitPermutar({docCod})` | detail; `null` no list | Gate 2 (`> 0`). Fan-out por candidato. |
| `imp019/list` | D.I — **data CI** (data-base) | _re-introduzir_ | **`blocked-by: P0-4`** | Read podado (ADR-0003); nome do campo de data NÃO confirmado. |
| `imp223/list` | DUIMP — **data de desembaraço** (data-base) | _re-introduzir_ | **`blocked-by: P0-4`** | Read podado (ADR-0003); nome do campo de data NÃO confirmado. |
| `com308/financeiroAPagar/list/{docCod}` | taxa/valor negociado | `listTitulosAPagar({docCod})` | `titFltTaxaMneg`, `titMnyValorMneg`, `moeCodMneg`, `moeEspNome`, `titMnyValor`; `serviceName='com308.finTituloFin'` | Entrada da `VariacaoCambial` (fórmula = comparação de TAXA, P0-1 RESOLVIDO). |

## Constantes de tenant (Columbia, priCod=1153)

- `tpdCod`: 99 (PROFORMA), 128 (INVOICE). `tpdCod=143` (IMPLANTAÇÃO SALDO) era o caminho
  alternativo do P0-3 — **descartado** (caminho correto é PROFORMA + filtro `adiantamento=SIM`).
- `gerNum`: 198/210/233 — não usados na eleição (caminho `gerNum` descartado por P0-3); mantidos
  como referência de catálogo de tenant.
- `vldStatus`: `'3'` = FINALIZADO.
- **P6 / Inviolable Rule #2:** estes IDs são da instalação Columbia — manter como **constantes
  tipadas**, nunca hardcode de tenant em service. Outra trading (outro `priCod`) recalibra os IDs.

## Estado dos gaps

- **P0-3 — RESOLVIDO.** Caminho = `listFinanceiroAPagar({docTip:'PROFORMA'})` + filtro booleano
  `adiantamento=SIM` (3 filtros: Adiantamento=SIM + Tipo=PROFORMA + Situação=FINALIZADO; Plano
  Financeiro VAZIO). Caminho `listAdiantamentoFinanceiroAPagar`/`tpdCod=143`/`gerNum=198`
  **descartado**. `build-probe`: capturar o **literal** da chave wire (ex.: `adiantamento#EQ:'S'`).
- **P0-7 — RESOLVIDO.** Query lista **todas** via os 3 filtros, depois elege; **sem janela
  incremental**; multi-filial. Rate-limit (`PAGE_SIZE=500`, `MAX_PAGES=50`, paginate cap
  existente) é **nota de implementação não-bloqueante**.
- **`blocked-by: P0-4` (ÚNICO GAP ABERTO)** — nome dos campos wire de data-base em `imp019`
  (data CI) e `imp223` (data desembaraço). Gate 4 valida existência/XOR hoje; a **extração** da
  data fica pendente do **probe** (não chutar).

## Fora de escopo (Fatia 1)

- **`fin010` (ESCRITA)** — executar permuta / baixa em BAIXAS PERMUTAS. É a Fatia 2; o caminho
  de **write-back no ERP não existe e não foi validado** (risco arquitetural #1, ADR-0002/0003 O3).
  Esta integração documenta **só leitura**.
