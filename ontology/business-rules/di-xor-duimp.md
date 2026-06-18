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
last_review: 2026-06-17
has_canonical_test: false
blocked-by:
  - "P0-4 — campo wire da data-base (não bloqueia a regra XOR em si)"
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

## Relação com P0-4 (único gap aberto)

- A **regra XOR está plenamente aplicável hoje** — a verificação de existência/XOR é
  independente de P0-4. A **leitura da data-base** (`DeclaracaoImportacao.dataBase`) é que
  depende do campo wire **`blocked-by: P0-4`** (probe). Ou seja: o Gate 4 valida XOR e bloqueia
  candidatas sem declaração (motivo `data-base-indisponivel`), mas a coluna data-base/aging do
  painel só popula após o probe P0-4.

## Teste canônico (a escrever)

- `has_canonical_test: false` — casos: só D.I → válido; só DUIMP → válido; ambas → bloqueada;
  nenhuma → bloqueada. Fixado no TDD. Âncora real: PDF processo `2048` tem D.I (`imp019`, "DI = CI").
