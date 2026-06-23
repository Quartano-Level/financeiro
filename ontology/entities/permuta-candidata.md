---
name: PermutaCandidata
type: entity
ontology_version: "0.2"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/EleicaoPermutasService.ts
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
  - src/backend/domain/service/permutas/IngestaoPermutasService.ts
  - src/backend/domain/repository/permutas/PermutaRelationalRepository.ts
  - src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts
  - src/backend/domain/interface/permutas/PermutaCandidata.ts
  - src/backend/migrations/0012_estado_permuta_manual.sql
  - src/backend/domain/interface/permutas/Gestao.ts
  - src/frontend/app/permutas/page.tsx
properties:
  - priCod
  - adiantamento
  - invoiceCasada
  - declaracaoImportacao
  - variacaoCambial
  - aging
  - estadoElegibilidade
  - motivoBloqueio
  - tipoPermuta
  - gatesAvaliados
relationships:
  - "PermutaCandidata 1—1 Adiantamento (lado-débito)"
  - "PermutaCandidata 1—1 Invoice (lado-crédito, quando casada)"
  - "PermutaCandidata 1—1 DeclaracaoImportacao (data-base)"
  - "PermutaCandidata 1—1 VariacaoCambial (derivada)"
  - "PermutaCandidata 1—* Permuta (alocação consumada; permuta-manual/casamento-manual originam alocações, ADR-0008)"
state_machine: elegibilidade-permuta-candidata
last_review: 2026-06-22
universality_evidence:
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I (backlog elegível com aging)"
  - "ontology/glossary.md — 'Backlog elegível' / 'Pendência bloqueada'"
  - "Interview permutas-painel-elegiveis Axis 1 — pendência elegível (NÃO executada nesta fatia)"
  - "Columbia (priCod=1153): PDF processo 2048"
  - "ADR-0010 — auto-casamento Simples N:1 parcial (greedy + teto da invoice); caso 1408 ZNSHINE"
---

# PermutaCandidata

> A **pendência elegível em si**: a composição (`Adiantamento` + `Invoice` casada +
> `DeclaracaoImportacao` + `VariacaoCambial` + `aging` + estado de elegibilidade) que o
> painel READ-ONLY expõe. É uma **candidata**, **NÃO** uma permuta consumada.

## Por que "candidata" e não "Permuta"

A `PermutaCandidata` é a **pendência** (a sugestão automática + sinalização de N:M); a
`Permuta` é o **ato de reconciliar** (a alocação adto↔invoice). Desde **ADR-0008**, a
entidade `Permuta` consumada **já existe** como **alocação** rascunho (`permuta_alocacao`) —
ver `entities/permuta.md`. O que ainda **não** existe é a **baixa efetiva na `fin010`** (ação
`reconciliarPermuta`, write-back no ERP, Etapa 6 / BAIXAS PERMUTAS) — risco arquitetural #1
(ADR-0002/0003 O3), que é a **Fase 3**. Uma candidata em `permuta-manual` ou `casamento-manual`
é a **origem** das alocações `Permuta` (o analista distribui o saldo em invoices).

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
| `invoiceCasada` | `Invoice?` | `casarInvoice` | Lado-crédito = exatamente 1 invoice FINALIZADA (P0-6 RESOLVIDO; 0 → `sem-invoice`/bloqueada, >1 → `casamento-manual` com motivo `composto-nm`, ADR-0005). |
| `declaracaoImportacao` | `DeclaracaoImportacao?` | Gate 4 | D.I XOR DUIMP (existência/XOR + data-base via `cdiDtaCi`/`dioDtaDesembaraco`; P0-4 RESOLVIDO, probe 2026-06-18). |
| `variacaoCambial` | `VariacaoCambial?` | `calcularVariacaoCambial` | Classificação por TAXA de câmbio (P0-1 RESOLVIDO). |
| `aging` | number (dias) | derivado | Âncora = data-base (P0-8 RESOLVIDO); `aging = hoje − dataBase`. Leitura da data-base RESOLVIDA (P0-4, probe 2026-06-18) — coluna aging popula. |
| `estadoElegibilidade` | enum | máquina de estado | `descoberta \| elegivel \| casamento-manual \| permuta-manual \| bloqueada` (ver state-machine; `casamento-manual` = N:M pós-4-gates mesmo processo, ADR-0005; `permuta-manual` = cliente-filtro cross-process, ADR-0007). |
| `motivoBloqueio` | enum? | `casarInvoice` / `avaliarElegibilidade` / `EleicaoPermutasService` | Motivo informativo. Para `bloqueada`: `sem-invoice \| falha-gate \| data-base-indisponivel \| detail-indisponivel`. Para `casamento-manual`: `composto-nm \| multiplas-invoices` (N:M, ADR-0005). Para `permuta-manual`: `cliente-filtro` (ADR-0007). |
| `tipoPermuta` | enum (derivado) | `GestaoPermutasService` | **Não persiste** (apresentação/abas). `simples \| multiplas \| cross-over \| cross-process`, derivado do estado + cardinalidade do processo (ADR-0009). |
| `gatesAvaliados` | registro | `avaliarElegibilidade` | Resultado de cada um dos 4 gates (auditoria I5). |

## Cardinalidade — 1:1 vs N:M (P0-5/P0-6 — RESOLVIDO)

- O auto-casamento (`tipoPermuta = simples`) executa o **1:1 (direto)** **e** o
  **1 invoice : N adiantamentos**. Desde **ADR-0010**, o N:1 distribui o **em-aberto vivo da invoice**
  (`Invoice.valorAbertoNegociado`) entre os adtos casados — **greedy** (maior saldo primeiro; desempate
  por aging), com **teto** = em-aberto da invoice; o adto consumido em parte mantém o saldo restante em
  aberto (auto-casamento ficou **parcial**, como o manual). O casamento expõe `saldoRestante`
  (`CasamentoAdiantamento.saldoRestante`, coluna "Saldo restante" na aba Simples). Ver
  `business-rules/distribuicao-simples-greedy`. READ-ONLY (só o snapshot `permuta_casamento`).
- O caso **N:M (composto)** (várias proformas/invoices no mesmo processo) **EXISTE e é
  FREQUENTE**. **ADR-0005:** como passa os 4 gates, deixou de ser `bloqueada` e passou ao estado
  **`casamento-manual`** (motivo informativo `composto-nm` / `multiplas-invoices`) — pronto para o
  analista **escolher a invoice**. A **alocação/escrita final é Fatia 2**: o shape pode evoluir
  para coleções com alocação (watchlist). Nesta fatia, sinalizamos o N:M sem executá-lo.

## Estado de elegibilidade

Ver `ontology/state-machines/elegibilidade-permuta-candidata.md`. Resumo:
`descoberta → elegivel` (4 gates + 1 INVOICE casada, auto 1:1); `descoberta → casamento-manual`
(4 gates + N:M >1 INVOICE mesmo processo — falta o analista alocar a invoice, ADR-0005);
`descoberta → permuta-manual` (cliente-filtro pago + saldo, D.I dispensada, cross-process,
ADR-0007); `descoberta → bloqueada` (falhou algum gate / 0 INVOICE / anomalia XOR / data-base
indisponível). O estado `executada` (baixa na `fin010`) é a **Fase 3** e **não** é modelado aqui.

## Invariantes aplicáveis

- **I1** human-in-the-loop · **I3** elegibilidade estrita · **I4** sem escrita ·
  **I5** auditoria por execução · **I6** multi-filial. Ver `business-rules/elegibilidade-permuta.md`.
