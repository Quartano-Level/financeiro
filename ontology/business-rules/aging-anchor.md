---
name: aging-anchor
type: business-rule
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-17
has_canonical_test: false
resolved-by:
  - "P0-8 — âncora do aging = DATA-BASE (data CI da D.I OU desembaraço da DUIMP) (Yuri, 2026-06-17)"
gated-by:
  - "P0-4 — regra do aging definida, mas a LEITURA do campo wire da data-base segue pendente de probe"
---

# Regra: aging-anchor

> **RESOLVIDO (P0-8, Yuri 2026-06-17).** A idade (aging) de uma `PermutaCandidata` conta a
> partir da **DATA-BASE** = data CI da **D.I** (`imp019`) **OU** data de desembaraço da
> **DUIMP** (`imp223`). **Porém**, o campo wire dessa data ainda é o **P0-4** (probe) — a
> coluna aging fica **gated no probe P0-4** (regra definida, leitura do campo pendente).

## Regra canônica (P0-8)

```
dataAncora = DeclaracaoImportacao.dataBase
           = (variante == 'DI')    ? data CI da D.I (imp019)
           : (variante == 'DUIMP') ? data de desembaraço da DUIMP (imp223)

aging = hoje − dataAncora   (em dias)
```

- A âncora é a **data-base** do borderô (a mesma declaração aduaneira do Gate 4 / I2 / `di-xor-duimp`).
- As outras candidatas a âncora (emissão do adiantamento, data do pagamento total) foram
  **descartadas** — a âncora canônica é a **data-base**.

## Dependência do P0-4 (leitura gated)

- A **regra** do aging está definida (âncora = data-base). A **leitura** da data-base depende do
  nome do campo wire em `imp019`/`imp223`, que continua `blocked-by: P0-4` (probe Conexos).
- **Consequência:** a coluna "aging" do painel fica **gated no probe P0-4** — definida porém
  não-populável até o campo wire ser capturado. Sem a data-base (gate 4 sem D.I nem DUIMP), a
  candidata é `bloqueada` (motivo `data-base-indisponivel`).

## Impacto

- Define a coluna "aging" do painel e o **ordenamento** do backlog (mais antigo primeiro,
  provavelmente). Enquanto P0-4 não for capturado, o painel lista candidatas mas a coluna aging
  fica pendente da leitura da data-base.

## Teste canônico (a escrever no TDD)

- `has_canonical_test: false` — `aging = hoje − dataBase`, com `dataBase` vinda da D.I (CI) ou
  da DUIMP (desembaraço). Fixado pelo TaskScoper/TDD após o probe P0-4. Âncora real: PDF
  processo `2048` (D.I `imp019`, "DI = CI").
