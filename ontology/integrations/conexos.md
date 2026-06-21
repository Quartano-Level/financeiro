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
  - com298 (PROFORMA tpdCod=99 + docVldTipoAdto=1 / INVOICE tpdCod=128 / detail mnyTitPermutar + pago=mnyTitAberto===0)
  - imp019 (D.I — data CI = cdiDtaCi)
  - imp223 (DUIMP — data desembaraço = dioDtaDesembaraco)
  - com308 (título a-pagar — taxa/valor negociado)
endpoints_write:
  - fin010 (FORA DE ESCOPO nesta fatia)
resolved-by:
  - "P0-3 — caminho = listFinanceiroAPagar(PROFORMA) + filtro docVldTipoAdto=1 (FinDocCab); chave wire confirmada por probe de rede (dev tenant Columbia, 2026-06-18, filCod=2, 410 adiantamentos reais)"
  - "P0-4 — campos wire da data-base RESOLVIDOS: cdiDtaCi (imp019, D.I) / dioDtaDesembaraco (imp223, DUIMP); probe de rede 2026-06-18; XOR confirmado em dados reais"
  - "P0-7 — query lista TODAS via 3 filtros; sem janela incremental; multi-filial; rate-limit é nota de impl (Yuri, 2026-06-17)"
  - "gate-3-pago-via-detail — RESOLVIDO (probe de rede 2026-06-18, 408 detalhes): pago ⟺ mnyTitAberto === 0 (estrito); hidratado via getDetalheTitulos na mesma chamada do Gate 2"
open-gap:
  - "residual-pago-centavos (P2) — doc 8721 tem aberto=0,02 em título ~R$20M; Gate 3 estrito bloqueia. Confirmar c/ analistas se resíduo de centavos = totalmente pago e qual o teto"
  - "vc-permuta-parcial (Fatia 2) — variação cambial em permutas parciais deve usar o valor PARCIAL (mnyTitPermutar literal), não o integral do título"
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
| `GET com298/{docCod}` | `mnyTitPermutar` (saldo) **+** status pago **+** face/saldo-aberto | `getDetalheTitulos({docCod})` → `{ valorPermutar?, pago?, valorPermutado?, valorTotal?, valorAberto? }` | detail; todos `null` no list | Gate 2 (`valorPermutar > 0`) **e** Gate 3 (`pago`). `valorTotal` (`mnyTitValor`) + `valorAberto` (`mnyTitAberto`) → **progresso de pagamento** (% pago + quanto falta) dos bloqueados por `nao-pago` (ADR-0006, read-only). Uma única chamada de detalhe por candidato. |
| `GET com298/{docCod}` (detail) | status TOTALMENTE PAGO (Gate 3) | `getDetalheTitulos` → `pago = (mnyTitAberto === 0)` | `mnyTitAberto`/`mnyTitPago`/`mnyTitValor` = `null` no list, populados no detail | **RESOLVIDO (probe 2026-06-18):** `pago ⟺ mnyTitAberto === 0` (estrito). Confirmado nos dois polos (26471 NÃO PAGO `aberto=384119.95`; 24166 PAGO `aberto=0`). |
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
- **`gate-3-pago-via-detail` — RESOLVIDO (probe de rede 2026-06-18, varredura de 408/411 detalhes).**
  Status TOTALMENTE PAGO vem `null` no `com298/list`; mora no **detalhe** `GET /com298/{docCod}`.
  Regra: `pago ⟺ mnyTitAberto === 0` (estrito). Hidratado via `getDetalheTitulos` na **mesma**
  chamada de detalhe do Gate 2 (zero fan-out novo). `EleicaoPermutasService.buildCandidata` injeta
  `pago` no adiantamento antes de `avaliarElegibilidade`.

## Detalhe `com298/{docCod}` — agregados de títulos (probe 2026-06-18, 408 docs)

Campos do bloco **RESUMO DOS TÍTULOS** (todos `null` no `com298/list`, populados só no detalhe):
`mnyTitValor` (Valor dos Títulos), `mnyTitPago` (Valor Pago), `mnyTitAberto` (Valor em Aberto),
`mnyTitPermuta` (Valor **já** Permutado), `mnyTitPermutar` (Valor **a** Permutar / saldo).

**Identidade universal (0 violações em 408 docs):** `mnyTitValor = mnyTitPago + mnyTitAberto`.
⇒ funda o Gate 3 (`mnyTitAberto === 0` ⟺ totalmente pago).

**`mnyTitPermutar` é AUTORITATIVO — nunca derivar.** A aproximação `permutar ≈ mnyTitPago − mnyTitPermuta`
vale na maioria (ex.: doc 8520 `17.560.450,75 − 17.554.893,33 = 5.557,42` exato), mas **quebra** em
**permutas parciais**: adiantamento totalmente pago (`aberto=0`) que usará apenas valor **parcial** na
baixa/borderô. Reais: `3334` (pago=permutar? não: pago=462.227,29, permutar=168.052,99) e `11808`
(pago=193.460,42, permutar=1.672,99). **A Fatia 2 (baixa/`fin010`) deve usar o `mnyTitPermutar` LITERAL**,
nunca reconstruir de pago/permuta. **⚠️ Variação cambial:** calcular sobre o valor **parcial** efetivamente
permutado, não sobre o valor integral do título — risco em permutas parciais.

> **Terminologia (não confundir):** "permuta **parcial**" aqui = um adiantamento totalmente pago cujo
> `mnyTitPermutar` é menor que o valor integral (usa-se só parte do saldo na baixa). É o que está
> confirmado nos reais (3334, 11808). As regras de **permutagem múltipla** (1 adiantamento ↔ N invoices
> e variantes) são **distintas e ainda NÃO modeladas** — serão definidas em feature própria.

**Confirmação dos gates (dado real):** Gate 2 ⊋ Gate 3 — doc `21841` (pago=44.917,24, **aberto=1.621,34**,
permutar=44.917,24) passa Gate 2 mas **falha** Gate 3 (parcialmente pago). Os dois gates são necessários;
Gate 3 é o estrito. Distribuição: 70 NÃO PAGO · 332 TOTALMENTE PAGO · 6 PARCIALMENTE PAGO · 42 com permuta.

**Anomalia em aberto (`residual-pago-centavos`):** doc `8721` tem `aberto=0,02` em título de `~R$20M`
(`permutar=0`). Hoje o Gate 3 estrito o **BLOQUEIA**. Pendente: confirmar com os analistas se um resíduo
de centavos conta como TOTALMENTE PAGO e qual o teto de "residual". Ver follow-up no inbox.

## Fora de escopo (Fatia 1)

- **`fin010` (ESCRITA)** — executar permuta / baixa em BAIXAS PERMUTAS. É a Fatia 2; o caminho
  de **write-back no ERP não existe e não foi validado** (risco arquitetural #1, ADR-0002/0003 O3).
  Esta integração documenta **só leitura**.
