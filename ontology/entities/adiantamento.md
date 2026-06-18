---
name: Adiantamento
type: entity
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
properties:
  - docCod
  - priCod
  - filCod
  - dataEmissao
  - valor
  - moeda
  - pago
  - valorPermutar
  - exportador
relationships:
  - "Adiantamento 1—1 DeclaracaoImportacao (via priCod, D.I XOR DUIMP)"
  - "Adiantamento 1—N Invoice (mesmo priCod; casamento via casarInvoice)"
  - "Adiantamento 1—1 PermutaCandidata (lado-débito da candidata)"
last_review: 2026-06-17
universality_evidence:
  - "docs/proposta/Proposta_Kavex_Columbia_Financeiro.md — Frente I (adiantamento ↔ invoice)"
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I"
  - "ontology/glossary.md — 'Adiantamento / PROFORMA'"
  - "Columbia (priCod=1153): com298 tpdCod=99, exemplo PDF processo 2048"
  - "Conceito universal de comex: pagamento antecipado ao exportador antes da fatura definitiva"
---

# Adiantamento (PROFORMA)

> **Lado-débito** da permuta: valor pago antecipadamente ao exportador, antes da
> fatura (Invoice) definitiva. É o documento PROFORMA finalizado no ERP Conexos.

## Definição de domínio

Um `Adiantamento` é uma obrigação financeira a-pagar do tipo PROFORMA, vinculada a um
**processo de importação** (`priCod`). Representa dinheiro que a trading adiantou ao
exportador. Enquanto não for reconciliado contra a `Invoice` correspondente (a permuta
da Fatia 2), permanece "solto" no ERP — é a fonte do backlog de pendências.

Esta fatia (Fatia 1, READ-ONLY) apenas **lê e avalia** adiantamentos; não os modifica.

## Propriedades

| Propriedade | Tipo | Imutável | Origem (wire) | Notas |
|-------------|------|----------|---------------|-------|
| `docCod` | string | sim | `com298.docCod` | Identidade do documento. |
| `priCod` | string | sim | `com298.priCod` | Código do **processo** — chave de vínculo Adiantamento↔Invoice↔D.I. |
| `filCod` | number | sim | `com298.filCod` (fallback: filial consultada) | **Invariante multi-filial I6** — filial que originou o adiantamento. Propagado ponta-a-ponta até `permuta_candidata_snapshot.fil_cod` (P0-2). Nunca `null`. |
| `dataEmissao` | Date | sim | `com298.docDtaEmissao` | Data de emissão do documento. |
| `valor` | number | não | `com298.docMnyValor` | Valor de face. |
| `moeda` | string | sim | `com298.moeEspSigla` | Moeda do documento. |
| `pago` | boolean | não | derivado: `mnyTitAberto===0` ou `pago===1` | Gate 3 da elegibilidade (TOTALMENTE PAGO). |
| `valorPermutar` | number | não | `getMnyTitPermutar(docCod)` (detail `GET /com298/{docCod}`) | Saldo a permutar disponível. `null` no list — hidratar no detail. Gate 2 (`> 0`). |
| `exportador` | string? | não | `com298.dpeNomPessoa` (coalesce) | Exibição. |

## Discriminador de tipo (PROFORMA) — P0-3 RESOLVIDO

- `tpdCod = 99` (`TPD_PROFORMA`) + `vldStatus = '3'` (FINALIZADO) **+ filtro booleano
  `adiantamento = SIM`** (campo dedicado na tela `com298`, confirmado por screenshot — distingue
  um *adiantamento* de uma PROFORMA comum). Os 3 filtros: Adiantamento=SIM + Tipo=PROFORMA +
  Situação=FINALIZADO (Plano Financeiro vazio).
- O caminho `listAdiantamentoFinanceiroAPagar` (`tpdCod=143` / `gerNum=198`) foi **descartado**
  (P0-3). O **literal da chave wire** do filtro `adiantamento` (ex.: `adiantamento#EQ:'S'`) é um
  **build-probe** (não bloqueia a modelagem). Resolve também P1-A.

## Fonte de leitura (Conexos)

- `ConexosClient.listFinanceiroAPagar({ docTip: 'PROFORMA', priCods, filCod })` + filtro
  `adiantamento=SIM` → `tpdCod=99`, FINALIZADO.
- `ConexosClient.getMnyTitPermutar({ docCod, filCod })` → `valorPermutar` literal (detail).

## Fora de escopo (Fatia 1)

- Nenhuma escrita. O Adiantamento nunca é baixado/reconciliado aqui — isso é a Fatia 2 (`fin010`).
