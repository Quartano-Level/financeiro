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
last_review: 2026-06-18
universality_evidence:
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I (cadência diária, base confiável)"
  - "Interview permutas-painel-elegiveis Axis 1 — D.I XOR DUIMP carrega a data-base"
  - "Columbia (priCod=1153): imp019 (D.I, data CI = cdiDtaCi) / imp223 (DUIMP, data desembaraço = dioDtaDesembaraco)"
  - "Probe de rede dev tenant Columbia (2026-06-18, filCod=2, 410 adiantamentos reais): XOR DI/DUIMP confirmado em dados reais; campos wire cdiDtaCi / dioDtaDesembaraco capturados"
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
| `dataBase` | Date | sim após registro | D.I: `cdiDtaCi` (`imp019`, epoch-ms). DUIMP: `dioDtaDesembaraco` (`imp223`, epoch-ms). | **P0-4 RESOLVIDO (probe 2026-06-18).** Campos wire confirmados; coluna aging agora popula. |

## P0-4 RESOLVIDO — leitura da data-base wire (probe de rede 2026-06-18)

- **RESOLVIDO** com evidência empírica real (dev tenant Columbia, 2026-06-18, `filCod=2`, validado
  contra **410 adiantamentos reais**). Os campos wire da data-base são:
  - **D.I (`imp019`):** `cdiDtaCi` — data "CI" (epoch-ms). Acompanha `cdiEspNumci` (nº da CI).
    Confere com o PDF "DI = CI".
  - **DUIMP (`imp223`):** `dioDtaDesembaraco` — data de desembaraço (epoch-ms).
- **XOR DI/DUIMP confirmado em dados reais:** cada processo tem **uma OU outra**, nunca ambas.
- Já plugado em `ConexosClient.mapDeclaracaoDataBase`. A **coluna aging agora popula**.
- Deixa de ser **`blocked-by: P0-4`**. A **âncora do aging** (P0-8) está definida como esta
  `dataBase` e a leitura está disponível — ver `aging-anchor.md`.

## Fonte de leitura (Conexos)

- D.I: `imp019/list` (re-introduzido) — data-base = `cdiDtaCi` (epoch-ms).
- DUIMP: `imp223/list` (re-introduzido) — data-base = `dioDtaDesembaraco` (epoch-ms).

## Invariante (I2 / `di-xor-duimp`)

- Exatamente **uma** variante por processo elegível. Ambas ou nenhuma → **anomalia** →
  candidata **bloqueada** (não conta como elegível, é reportada). Ver `business-rules/di-xor-duimp.md`.
