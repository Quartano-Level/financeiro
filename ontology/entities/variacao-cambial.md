---
name: VariacaoCambial
type: entity
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
properties:
  - moeda
  - principalMoeda
  - taxaAdiantamento
  - taxaInvoice
  - dataBase
  - delta
  - resultado
  - classificacao
  - contaContabil
relationships:
  - "VariacaoCambial 1—1 PermutaCandidata (derivada do par Adiantamento×Invoice)"
last_review: 2026-06-18
universality_evidence:
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I (divergência cambial — analista decide)"
  - "Interview permutas-painel-elegiveis Axis 1 — moeda/valor/taxa → juros|desconto"
  - "Columbia (priCod=1153): com308.finTituloFin (titFltTaxaMneg, titMnyValorMneg, moeCodMneg)"
  - "Conceito universal de comex: diferença cambial entre adiantamento e fatura gera juros ou desconto"
---

# VariacaoCambial

> Resultado **derivado** do cálculo cambial sobre o par `Adiantamento` × `Invoice`:
> o **mesmo principal em moeda estrangeira** é revalorizado em **duas taxas** (a do
> adiantamento e a do invoice); a diferença (`delta`) classifica a pendência como **juros**
> ou **desconto**. **Não persistida** nesta fatia (computada por execução do job).

## Definição de domínio

A `VariacaoCambial` modela a diferença cambial entre o valor adiantado (PROFORMA) e o valor
da fatura (INVOICE) **pela comparação de TAXA de câmbio** (regra canônica resolvida em P0-1,
não mais por comparação de valor). O mesmo principal em moeda estrangeira é revalorizado na
taxa do adiantamento e na taxa do invoice; o sinal/valor do `delta` classifica a pendência em
**juros** (passiva, conta 131) ou **desconto** (ativo, conta 130). É o que permite à
controladoria ler o backlog de permutas sobre base confiável.

## Fórmula canônica (P0-1 — RESOLVIDO)

```
reais_adiantamento = principalMoeda × taxaAdiantamento
reais_invoice      = principalMoeda × taxaInvoice
delta = reais_invoice − reais_adiantamento = principalMoeda × (taxaInvoice − taxaAdiantamento)
```

- `delta > 0` (`taxaInvoice > taxaAdiantamento`) → `classificacao = JUROS`, `resultado = delta`, conta **131**.
- `delta < 0` (`taxaInvoice < taxaAdiantamento`) → `classificacao = DESCONTO`, `resultado = |delta|`, conta **130**.
- `delta = 0` → sem juros/desconto.

Detalhe completo (incl. nota histórica da heurística de valor superada) em
`business-rules/classificacao-juros-desconto.md`.

## Propriedades

| Propriedade | Tipo | Origem (wire) | Notas |
|-------------|------|---------------|-------|
| `moeda` | string | `com308.moeEspNome` / `moeCodMneg` | v0.5 do legado só suporta USD (220). |
| `principalMoeda` | number | `com308.titMnyValorMneg` | Principal em moeda estrangeira (mesmo p/ as duas taxas). |
| `taxaAdiantamento` | number | `TituloAPagar.taxa` (`com308.titFltTaxaMneg`) | Câmbio fechado/contratado no adiantamento (build-probe: confirmar doc-fonte). |
| `taxaInvoice` | number | `TituloAPagar.taxa` (`com308.titFltTaxaMneg`) | Câmbio do invoice / nova taxa (build-probe: confirmar doc-fonte). |
| `dataBase` | Date | `DeclaracaoImportacao.dataBase` (`cdiDtaCi`/`dioDtaDesembaraco`; P0-4 RESOLVIDO, probe 2026-06-18) | Data de referência da variação; campo wire confirmado. |
| `delta` | number | derivado | `principalMoeda × (taxaInvoice − taxaAdiantamento)`. |
| `resultado` | number | derivado | `JUROS → delta`; `DESCONTO → |delta|`. |
| `classificacao` | `'JUROS' \| 'DESCONTO'` | derivado | `taxaInvoice > taxaAdiantamento → JUROS`; `<` → `DESCONTO`. |
| `contaContabil` | `'130' \| '131'` | derivado | `JUROS → 131` (passiva); `DESCONTO → 130` (ativa). |

## Nota de implementação (build-probe — NÃO bloqueia)

- A regra/fórmula está **definida**. Confirmar no build **qual documento** fornece
  `taxaAdiantamento`, `taxaInvoice` e `principalMoeda` (`com308.titFltTaxaMneg` /
  `com308.titMnyValorMneg`). É confirmação de fonte, não um P0.

## Fonte de leitura (Conexos)

- `ConexosClient.listTitulosAPagar({ docCod, filCod })` → `com308/financeiroAPagar/list/{docCod}`
  (`titFltTaxaMneg`, `titMnyValorMneg`, `moeCodMneg`, `moeEspNome`, `titMnyValor`).
- Referência de cálculo: `VariacaoCambialService` (legado) — fórmula desta fatia conforme P0-1 acima.

## Contas contábeis (P1-2 — RESOLVIDO junto de P0-1)

- **131 = VAR. CAMBIAL PASSIVA REALIZADA = JUROS** (taxa subiu).
- **130 = VAR. CAMBIAL ATIVA REALIZADA = DESCONTO** (taxa caiu).
- O PDF rotulava ambas "juros" (typo); a regra de TAXA resolve o mapeamento. P1-2 RESOLVIDO.
