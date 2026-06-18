---
name: classificacao-juros-desconto
type: business-rule
entity: VariacaoCambial
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-17
has_canonical_test: false
resolved-by:
  - "P0-1 — regra canônica = comparação de TAXA de câmbio (Yuri, 2026-06-17)"
  - "P1-2 — mapeamento de contas 130/131 (resolvido junto de P0-1)"
build-probe:
  - "Confirmar no build qual documento fornece taxa_adiantamento, taxa_invoice e principal_moeda (com308: titFltTaxaMneg / titMnyValorMneg)."
---

# Regra: classificacao-juros-desconto

> **RESOLVIDO (P0-1, Yuri 2026-06-17).** A regra canônica que classifica a `VariacaoCambial`
> em **juros** ou **desconto** é a **comparação de TAXA de câmbio** (não de valor). A heurística
> secundária do PDF ("adiantamento > invoice → juros") foi **superada** pela regra de TAXA.

## Regra canônica (P0-1) — comparação de TAXA de câmbio

O **mesmo principal em moeda estrangeira** (USD ou outra) é revalorizado em **DUAS taxas**:

```
reais_adiantamento = principal_moeda × taxa_adiantamento   (câmbio fechado/contratado no adiantamento)
reais_invoice      = principal_moeda × taxa_invoice        (taxa do invoice / nova taxa)

delta = reais_invoice − reais_adiantamento
      = principal_moeda × (taxa_invoice − taxa_adiantamento)
```

### Classificação

| Condição | Resultado | Valor | Conta contábil |
|----------|-----------|-------|----------------|
| `taxa_invoice > taxa_adiantamento` (delta > 0) | **JUROS** | `delta` | **131 — VAR. CAMBIAL PASSIVA REALIZADA** |
| `taxa_invoice < taxa_adiantamento` (delta < 0) | **DESCONTO** | `|delta|` | **130 — VAR. CAMBIAL ATIVA REALIZADA** |
| `taxa_invoice = taxa_adiantamento` (delta = 0) | sem juros/desconto | `0` | — |

### Entradas

- `principal_moeda` — principal em moeda estrangeira (`com308.titMnyValorMneg`).
- `taxa_adiantamento` — taxa de câmbio fechada/contratada no adiantamento (`TituloAPagar.taxa` = `com308.titFltTaxaMneg`).
- `taxa_invoice` — taxa de câmbio do invoice / nova taxa (`TituloAPagar.taxa` = `com308.titFltTaxaMneg`).

## Mapeamento de contas (P1-2 — RESOLVIDO junto de P0-1)

- **131 = VAR. CAMBIAL PASSIVA REALIZADA = JUROS** (taxa subiu).
- **130 = VAR. CAMBIAL ATIVA REALIZADA = DESCONTO** (taxa caiu).
- O PDF rotulava ambas como "juros" (typo); a regra de TAXA resolve o mapeamento: passiva=juros,
  ativa=desconto. **P1-2 marcado RESOLVIDO.**

## Nota histórica — heurística de VALOR superada

- O PDF "Processo-Permutas-Adiantamento" oferecia uma heurística secundária de **valor**
  ("adiantamento > invoice → juros; adiantamento < invoice → desconto"). Essa heurística foi
  **superada** pela regra de **TAXA** (acima). Mantida aqui apenas como nota histórica — a regra
  canônica é a comparação de taxa de câmbio sobre o mesmo principal.

## Nota de implementação (build-probe — NÃO bloqueia)

- Confirmar no build **qual documento** fornece cada taxa/principal: `taxa_adiantamento` e
  `taxa_invoice` vêm de `TituloAPagar.taxa` (`com308.titFltTaxaMneg`); o principal é
  `com308.titMnyValorMneg`. A leitura existe (`com308`); o probe só confirma a correspondência
  documento→taxa. Não é um P0.

## Teste canônico (a escrever no TDD)

- `has_canonical_test: false` — casos canônicos:
  - `taxa_invoice > taxa_adiantamento` → JUROS, valor = delta, conta 131.
  - `taxa_invoice < taxa_adiantamento` → DESCONTO, valor = |delta|, conta 130.
  - taxas iguais → sem juros/desconto.
  Fixados pelo TaskScoper/TDD. Âncora real: PDF processo `2048` (priCod=1153).
