---
name: aging-anchor
type: business-rule
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-18
has_canonical_test: false
resolved-by:
  - "P0-8 — âncora do aging = DATA-BASE (data CI da D.I OU desembaraço da DUIMP) (Yuri, 2026-06-17)"
  - "P0-4 — leitura do campo wire da data-base RESOLVIDA (cdiDtaCi imp019 / dioDtaDesembaraco imp223); probe de rede 2026-06-18, filCod=2, 410 adiantamentos reais; a coluna aging agora popula"
---

# Regra: aging-anchor

> **RESOLVIDO (P0-8, Yuri 2026-06-17 + P0-4, probe 2026-06-18).** A idade (aging) de uma
> `PermutaCandidata` conta a partir da **DATA-BASE** = data CI da **D.I** (`imp019.cdiDtaCi`)
> **OU** data de desembaraço da **DUIMP** (`imp223.dioDtaDesembaraco`). O campo wire dessa data
> foi **confirmado por probe de rede** (2026-06-18) — a **coluna aging agora popula** (não mais
> gated).

## Regra canônica (P0-8)

```
dataAncora = DeclaracaoImportacao.dataBase
           = (variante == 'DI')    ? data CI da D.I (imp019.cdiDtaCi, epoch-ms)
           : (variante == 'DUIMP') ? data de desembaraço da DUIMP (imp223.dioDtaDesembaraco, epoch-ms)

aging = hoje − dataAncora   (em dias)
```

- A âncora é a **data-base** do borderô (a mesma declaração aduaneira do Gate 4 / I2 / `di-xor-duimp`).
- As outras candidatas a âncora (emissão do adiantamento, data do pagamento total) foram
  **descartadas** — a âncora canônica é a **data-base**.

## Leitura da data-base — RESOLVIDA (P0-4, probe 2026-06-18)

- A **regra** do aging está definida (âncora = data-base) e a **leitura** está disponível: campos
  wire `cdiDtaCi` (D.I, `imp019`) e `dioDtaDesembaraco` (DUIMP, `imp223`), ambos epoch-ms, plugados
  em `ConexosClient.mapDeclaracaoDataBase`.
- **Consequência:** a coluna "aging" do painel **popula** (não mais gated). Sem a data-base
  (gate 4 sem D.I nem DUIMP), a candidata é `bloqueada` (motivo `data-base-indisponivel`).

## Impacto

- Define a coluna "aging" do painel e o **ordenamento** do backlog (mais antigo primeiro,
  provavelmente). Com o campo wire resolvido, a coluna aging é populável diretamente.

## Teste canônico (a escrever no TDD)

- `has_canonical_test: false` — `aging = hoje − dataBase`, com `dataBase` vinda da D.I
  (`cdiDtaCi`) ou da DUIMP (`dioDtaDesembaraco`). Fixado pelo TaskScoper/TDD. Âncora real: PDF
  processo `2048` (D.I `imp019`, "DI = CI").
