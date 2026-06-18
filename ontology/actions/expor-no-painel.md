---
name: exporNoPainel
type: action
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-17
preconditions:
  - "Candidatas avaliadas (gates + casamento + variação quando disponível)."
postconditions:
  - "Endpoint de leitura retorna o backlog elegível + bloqueadas, com aging e estado."
  - "Nenhuma escrita no ERP (I4)."
side_effects:
  - "Persistência de snapshot/auditoria do backlog (Postgres — migration-debt O5, I5)."
resolved-by:
  - "P0-8 — aging conta da DATA-BASE (CI da D.I / desembaraço da DUIMP) (Yuri, 2026-06-17)"
gated-by:
  - "P0-4 — leitura do campo wire da data-base (coluna aging gated no probe)"
---

# exporNoPainel

> **Etapa 5.** Agrega as `PermutaCandidata` (elegíveis e bloqueadas) com **aging** e expõe
> no endpoint de leitura do painel READ-ONLY.

## Comportamento

- Elegíveis (4 gates + INVOICE casada) e bloqueadas (com motivo) são ambas expostas — as
  bloqueadas como visibilidade, **não** como falha (glossary "Pendência bloqueada"). Motivos de
  bloqueio reportados conforme a taxonomia (`composto-nm`, `sem-invoice`, `multiplas-invoices`,
  `falha-gate`, `data-base-indisponivel` — ver state-machine).
- READ-ONLY: nenhuma ação de execução é oferecida aqui (a execução é a Fatia 2, I1/I4).

## Aging (P0-8 — RESOLVIDO; leitura gated em P0-4)

- A idade da pendência conta a partir da **DATA-BASE** = data CI da D.I (`imp019`) **OU** data
  de desembaraço da DUIMP (`imp223`). `aging = hoje − dataBase`. Define a coluna "aging" e o
  ordenamento do backlog (mais antigo primeiro). Ver `business-rules/aging-anchor.md`.
- **Gated em P0-4:** a **regra** do aging está definida; a **leitura** do campo wire da
  data-base segue pendente do probe P0-4. Enquanto não capturado, o painel lista candidatas mas
  a coluna aging fica pendente da leitura da data-base.

## Auditoria (I5)

- Toda execução do job e leitura sensível é registrada/persistida (quem/quando/o quê).
  Persistência via Postgres (migration-debt O5; modelagem da tabela → TaskScoper/infra).
