---
name: DeclaracaoImportacao
type: entity
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
properties:
  - variante
  - priCod
  - dataBase
relationships:
  - "DeclaracaoImportacao 1—1 Adiantamento (via priCod; exatamente uma por candidata elegível)"
  - "DeclaracaoImportacao 1—1 PermutaCandidata (fornece a data-base do borderô)"
last_review: 2026-06-17
universality_evidence:
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I (cadência diária, base confiável)"
  - "Interview permutas-painel-elegiveis Axis 1 — D.I XOR DUIMP carrega a data-base"
  - "Columbia (priCod=1153): imp019 (D.I, data CI) / imp223 (DUIMP, data desembaraço)"
  - "Conceito universal de comex: toda importação tem D.I OU DUIMP (regime varia, conceito não)"
---

# DeclaracaoImportacao (D.I XOR DUIMP)

> Carrega a **data-base** do borderô da permuta. Existe em duas variantes mutuamente
> exclusivas: **D.I** (Declaração de Importação, regime clássico) **XOR** **DUIMP**
> (Declaração Única de Importação, regime novo). **Nunca as duas, nunca nenhuma** —
> ver invariante I2 e a business-rule `di-xor-duimp`.

## Definição de domínio

Toda importação que sustenta um `Adiantamento` elegível tem uma declaração aduaneira
atrelada pelo **código do processo** (`priCod`). Essa declaração é a âncora temporal do
processo: a **data-base** (data CI da D.I, ou data de desembaraço da DUIMP). Nesta Fatia 1
a data-base já precisa ser **lida e exibida** no painel (vira a data-base do borderô na
Fatia 2). É o **Gate 4** da elegibilidade: D.I **XOR** DUIMP atrelada.

> **Re-introdução de leitura podada (ADR-0003 / migration-debt O3):** os reads de D.I/DUIMP
> (`listDiByProcess`, `getDiPlanilhaTaxa`, `listDuimpByProcess`, `getDuimpTaxa`) foram
> **podados** do `ConexosClient` por serem só-fechamento sem reuso. Esta entidade **re-introduz**
> o lado-leitura necessário (D.I data-CI / DUIMP data-desembaraço) — escopo restrito à
> data-base e à existência (XOR), não aos campos de taxa/variação de fechamento. Ver ADR-0004.

## Propriedades

| Propriedade | Tipo | Imutável | Origem (wire) | Notas |
|-------------|------|----------|---------------|-------|
| `variante` | `'DI' \| 'DUIMP'` | sim | derivado da fonte (`imp019` vs `imp223`) | Discriminador XOR. |
| `priCod` | string | sim | `imp019/imp223 .priCod` | Vínculo com o processo. |
| `dataBase` | Date | sim após registro | leitura **`blocked-by: P0-4`** | D.I: "data CI" (`imp019`). DUIMP: "data de desembaraço" (`imp223`). **Nome do campo wire NÃO confirmado** — pendente de probe (não chutar). |

## Gap aberto — leitura da data-base wire (P0-4 — ÚNICO GAP ABERTO)

- **`blocked-by: P0-4`** (vira **probe de diagnóstico**): de onde sai, no payload, a **"data CI"**
  da D.I (`imp019`) e a **"data de desembaraço"** da DUIMP (`imp223`)? O Yuri **não sabe os nomes
  dos campos wire** — então isto vira um **probe** no build. Os reads foram podados (ADR-0003) e
  precisam ser re-introduzidos com o nome correto.
- **Gate 4 valida existência/XOR** (D.I XOR DUIMP) **hoje** — isso **não** depende de P0-4. A
  **EXTRAÇÃO da data** (`dataBase`) é que fica pendente do probe: a propriedade fica **declarada
  mas não populável** até o campo ser capturado.
- A **âncora do aging** já está definida como esta `dataBase` (P0-8 RESOLVIDO) — porém a coluna
  aging fica **gated no probe P0-4** (regra definida, leitura pendente). Ver `aging-anchor.md`.
- **P0-4 é o único gap P0 ainda aberto** desta fatia.

## Fonte de leitura (Conexos)

- D.I: `imp019/list` (re-introduzir — campo data-base `blocked-by: P0-4`).
- DUIMP: `imp223/list` (re-introduzir — campo data-base `blocked-by: P0-4`).

## Invariante (I2 / `di-xor-duimp`)

- Exatamente **uma** variante por processo elegível. Ambas ou nenhuma → **anomalia** →
  candidata **bloqueada** (não conta como elegível, é reportada). Ver `business-rules/di-xor-duimp.md`.
