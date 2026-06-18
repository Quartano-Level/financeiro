---
name: di-xor-duimp
type: business-rule
entity: DeclaracaoImportacao
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
invariant: I2
related_files: []
last_review: 2026-06-18
has_canonical_test: false
resolved-by:
  - "P0-4 — campo wire da data-base RESOLVIDO (cdiDtaCi imp019 / dioDtaDesembaraco imp223); XOR confirmado em dados reais; probe de rede 2026-06-18, filCod=2, 410 adiantamentos reais"
---

# Regra: di-xor-duimp

> **Invariante I2 — D.I XOR DUIMP.** Todo processo de um `Adiantamento` elegível tem
> **exatamente uma** declaração aduaneira: **D.I** (`imp019`) **XOR** **DUIMP** (`imp223`).
> Nunca as duas; nunca nenhuma.

## Enunciado

```
valido(processo) ⇔ exists(DI) XOR exists(DUIMP)

exists(DI) ∧ exists(DUIMP)   → ANOMALIA → candidata BLOQUEADA
¬exists(DI) ∧ ¬exists(DUIMP) → ANOMALIA → candidata BLOQUEADA
```

## Por que é XOR

Uma importação corre sob um regime (D.I clássica ou DUIMP nova), nunca ambos no mesmo
processo. A declaração é a âncora temporal: carrega a **data-base** do borderô. Sem
declaração, não há data-base — não dá para reconciliar (Fatia 2); com as duas, há
inconsistência de dado a investigar.

## Tratamento de anomalia

- Ambas ou nenhuma → `PermutaCandidata` → `BLOQUEADA` (Gate 4 falha). Reportada para
  supervisão, não contada como falha do job.

## Relação com P0-4 (RESOLVIDO — probe de rede 2026-06-18)

- A **regra XOR está plenamente aplicável** — a verificação de existência/XOR é independente do
  campo de data. O **XOR foi confirmado em dados reais** (410 adiantamentos reais, `filCod=2`):
  cada processo tem uma D.I OU uma DUIMP, nunca ambas.
- A **leitura da data-base** (`DeclaracaoImportacao.dataBase`) também foi **resolvida**: campos
  wire `cdiDtaCi` (`imp019`) e `dioDtaDesembaraco` (`imp223`), epoch-ms. O Gate 4 valida XOR e
  bloqueia candidatas sem declaração (motivo `data-base-indisponivel`); a coluna data-base/aging
  do painel **popula** (não mais gated).

## Teste canônico (a escrever)

- `has_canonical_test: false` — casos: só D.I → válido; só DUIMP → válido; ambas → bloqueada;
  nenhuma → bloqueada. Fixado no TDD. Âncora real: PDF processo `2048` tem D.I (`imp019`, "DI = CI").
