---
name: PermutaCandidata
type: entity
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
properties:
  - priCod
  - adiantamento
  - invoiceCasada
  - declaracaoImportacao
  - variacaoCambial
  - aging
  - estadoElegibilidade
  - motivoBloqueio
  - gatesAvaliados
relationships:
  - "PermutaCandidata 1—1 Adiantamento (lado-débito)"
  - "PermutaCandidata 1—1 Invoice (lado-crédito, quando casada)"
  - "PermutaCandidata 1—1 DeclaracaoImportacao (data-base)"
  - "PermutaCandidata 1—1 VariacaoCambial (derivada)"
state_machine: elegibilidade-permuta-candidata
last_review: 2026-06-17
universality_evidence:
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I (backlog elegível com aging)"
  - "ontology/glossary.md — 'Backlog elegível' / 'Pendência bloqueada'"
  - "Interview permutas-painel-elegiveis Axis 1 — pendência elegível (NÃO executada nesta fatia)"
  - "Columbia (priCod=1153): PDF processo 2048"
---

# PermutaCandidata

> A **pendência elegível em si**: a composição (`Adiantamento` + `Invoice` casada +
> `DeclaracaoImportacao` + `VariacaoCambial` + `aging` + estado de elegibilidade) que o
> painel READ-ONLY expõe. É uma **candidata**, **NÃO** uma permuta consumada.

## Por que "candidata" e não "Permuta"

A `Permuta` **consumada** — a reconciliação efetiva escrita na `fin010` (baixa em BAIXAS
PERMUTAS, Etapa 6) — **NÃO nasce nesta fatia**. Ela pertence à **Fatia 2** (escrita no ERP,
caminho de write-back ainda não validado — risco arquitetural #1, ADR-0002/ADR-0003 O3).
Modelar a `Permuta` consumada aqui seria modelar uma entidade cujo caminho de execução não
existe. Esta fatia modela **apenas a candidata** (snapshot por execução do job, derivada,
não persistida no ERP). Quando a Fatia 2 chegar, ela introduz a entidade `Permuta` + a ação
`reconciliarPermuta` (`/feature-new permutas` Fatia 2).

## Definição de domínio

Uma `PermutaCandidata` é produzida pela cadeia de ações `elegerAdiantamentos` →
`avaliarElegibilidade` → `casarInvoice` → `calcularVariacaoCambial` → `exporNoPainel`.
Ela só é **elegível** quando passa nos **4 gates** **E** tem **INVOICE casada** (invariante
I3 / business-rule `elegibilidade-permuta`). Caso contrário, é **bloqueada** (reportada, não
contada como falha — ver glossary "Pendência bloqueada").

## Propriedades

| Propriedade | Tipo | Origem | Notas |
|-------------|------|--------|-------|
| `priCod` | string | `Adiantamento.priCod` | Chave do processo. |
| `filCod` | number | `Adiantamento.filCod` | **Invariante multi-filial I6** — filial da candidata. Persistido em `permuta_candidata_snapshot.fil_cod` (P0-2 RESOLVIDO; antes sempre `NULL`). |
| `adiantamento` | `Adiantamento` | composição | Lado-débito (carrega o `filCod` canônico). |
| `invoiceCasada` | `Invoice?` | `casarInvoice` | Lado-crédito = exatamente 1 invoice FINALIZADA (P0-6 RESOLVIDO; 0 → `sem-invoice`, >1 → `composto-nm`). |
| `declaracaoImportacao` | `DeclaracaoImportacao?` | Gate 4 | D.I XOR DUIMP (existência/XOR ok; leitura da data-base `blocked-by: P0-4`). |
| `variacaoCambial` | `VariacaoCambial?` | `calcularVariacaoCambial` | Classificação por TAXA de câmbio (P0-1 RESOLVIDO). |
| `aging` | number (dias) | derivado | Âncora = data-base (P0-8 RESOLVIDO); `aging = hoje − dataBase`. Leitura da data-base gated em P0-4. |
| `estadoElegibilidade` | enum | máquina de estado | `descoberta \| elegivel \| bloqueada` (ver state-machine). |
| `motivoBloqueio` | enum? | `casarInvoice` / `avaliarElegibilidade` | Quando `bloqueada`: `composto-nm \| sem-invoice \| multiplas-invoices \| falha-gate \| data-base-indisponivel` (ver state-machine). |
| `gatesAvaliados` | registro | `avaliarElegibilidade` | Resultado de cada um dos 4 gates (auditoria I5). |

## Cardinalidade — 1:1 vs N:M (P0-5/P0-6 — RESOLVIDO)

- Esta fatia modela e executa **SOMENTE o caso 1:1 (direto)**: 1 adiantamento PROFORMA ↔
  1 invoice FINALIZADA no processo. `PermutaCandidata` mantém **shape 1:1** — **NÃO** modelar
  alocação N:M agora.
- O caso **N:M (composto)** (várias proformas/invoices no mesmo processo) **EXISTE e é
  FREQUENTE**, mas nesta feature vai para **BACKLOG**: candidata `bloqueada` com motivo
  `composto-nm`, **reportada, não processada** (glossary "Pendência bloqueada"). Se/quando N:M
  for priorizado, o shape pode evoluir para coleções com alocação — fica no watchlist (Fatia
  futura). Yuri decidiu, nesta fatia, manter 1:1 e mandar N:M para backlog.

## Estado de elegibilidade

Ver `ontology/state-machines/elegibilidade-permuta-candidata.md`. Resumo:
`descoberta → elegivel` (passou 4 gates + INVOICE casada) **ou** `descoberta → bloqueada`
(falhou algum gate / sem INVOICE / anomalia XOR). O estado `executada` **pertence à Fatia 2**
(transição para a `Permuta` consumada) e **não** é modelado aqui.

## Invariantes aplicáveis

- **I1** human-in-the-loop · **I3** elegibilidade estrita · **I4** sem escrita ·
  **I5** auditoria por execução · **I6** multi-filial. Ver `business-rules/elegibilidade-permuta.md`.
