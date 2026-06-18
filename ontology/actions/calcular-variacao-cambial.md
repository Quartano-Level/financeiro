---
name: calcularVariacaoCambial
type: action
entity: VariacaoCambial
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-18
preconditions:
  - "PermutaCandidata com Adiantamento + Invoice casada."
  - "Taxa/valor negociado lidos do com308."
postconditions:
  - "VariacaoCambial derivada (delta + resultado + classificacao + contaContabil) anexada à PermutaCandidata."
  - "Nenhuma escrita no ERP (I4); resultado não persistido no ERP."
side_effects:
  - "Leitura com308 (titFltTaxaMneg, titMnyValorMneg, moeCodMneg)."
resolved-by:
  - "P0-1 — regra canônica = comparação de TAXA de câmbio (Yuri, 2026-06-17)"
build-probe:
  - "Confirmar no build qual documento fornece taxaAdiantamento, taxaInvoice e principalMoeda (com308)."
note:
  - "dataBase é insumo de exibição/aging, não da fórmula de classificação; sua leitura segue blocked-by P0-4."
---

# calcularVariacaoCambial

> **Etapa 4.** Calcula a variação cambial do par `Adiantamento` × `Invoice` e classifica
> em **juros** ou **desconto** pela **comparação de TAXA de câmbio** (regra canônica P0-1,
> RESOLVIDA). **Desbloqueada.**

## Fórmula canônica (P0-1 — RESOLVIDO)

```
reais_adiantamento = principalMoeda × taxaAdiantamento
reais_invoice      = principalMoeda × taxaInvoice
delta = reais_invoice − reais_adiantamento = principalMoeda × (taxaInvoice − taxaAdiantamento)
```

- `delta > 0` (`taxaInvoice > taxaAdiantamento`) → **JUROS**, `resultado = delta`, conta **131**.
- `delta < 0` (`taxaInvoice < taxaAdiantamento`) → **DESCONTO**, `resultado = |delta|`, conta **130**.
- `delta = 0` → sem juros/desconto.

Detalhe completo em `business-rules/classificacao-juros-desconto.md` e entidade
`entities/variacao-cambial.md`. A heurística de **valor** do PDF foi **superada** pela de TAXA.

## Reuso do ConexosClient

- `ConexosClient.listTitulosAPagar({ docCod, filCod })`
  → `com308/financeiroAPagar/list/{docCod}` (`titFltTaxaMneg`, `titMnyValorMneg`,
  `moeCodMneg`, `moeEspNome`, `titMnyValor`).
- Referência de cálculo legado: `VariacaoCambialService`.

## Nota de implementação (build-probe — NÃO bloqueia)

- Confirmar no build **qual documento** fornece `taxaAdiantamento`, `taxaInvoice` e
  `principalMoeda` (`com308.titFltTaxaMneg` / `com308.titMnyValorMneg`). É confirmação de
  fonte, não um P0.

## Relação com a data-base (P0-4 — RESOLVIDO, probe 2026-06-18)

- A `dataBase` (D.I/DUIMP) **não** entra na fórmula de classificação (que é só taxa × principal);
  ela é insumo de **exibição** e **aging**. A leitura do campo wire da data-base foi **resolvida**
  (`cdiDtaCi` `imp019` / `dioDtaDesembaraco` `imp223`; ver `avaliarElegibilidade` /
  `declaracao-importacao`) — não bloqueava o cálculo de juros/desconto de qualquer modo.
