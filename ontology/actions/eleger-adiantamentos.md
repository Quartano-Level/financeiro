---
name: elegerAdiantamentos
type: action
entity: Adiantamento
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-17
preconditions:
  - "Sessão Conexos ativa (ensureSid)."
  - "Escopo de filiais definido (multi-filial, I6)."
postconditions:
  - "Lista de Adiantamentos (PROFORMA FINALIZADO) candidatos, por processo/filial."
  - "Nenhuma escrita no ERP (I4)."
side_effects:
  - "Leitura paginada do com298 (rate-limit — nota de implementação, paginate cap existente)."
  - "Registro de auditoria da execução (I5)."
resolved-by:
  - "P0-3 — caminho = listFinanceiroAPagar(PROFORMA) + filtro booleano adiantamento=SIM (Yuri, 2026-06-17)"
  - "P0-7 — query lista TODAS via 3 filtros, depois elege; sem janela incremental; multi-filial (Yuri, 2026-06-17)"
build-probe:
  - "Capturar o nome EXATO da chave wire do filtro 'adiantamento' (ex.: adiantamento#EQ:'S') num probe de rede."
---

# elegerAdiantamentos (job diário)

> **Etapa 1.** Lista os adiantamentos (PROFORMA finalizados) em aberto, por processo/filial.
> Primeira ação da cadeia; produz o universo de candidatos a avaliar.

## Query-base (P0-3 + P0-7 — RESOLVIDO)

A eleição lista **TODAS** as candidatas via os **3 filtros** confirmados por screenshot na tela
`com298` (FILTROS), depois elege:

| Filtro | Valor | Wire |
|--------|-------|------|
| **Adiantamento** | `SIM` | filtro booleano dedicado (chave wire exata → build-probe) |
| **Tipo de Documento** | `PROFORMA` | `tpdCod=99` |
| **Situação** | `FINALIZADO` | `vldStatus=['3']` |
| **Plano Financeiro** | _(VAZIO)_ | — |

- Caminho correto: **`ConexosClient.listFinanceiroAPagar({ docTip: 'PROFORMA' })`**
  (`tpdCod=99`, `vldStatus=FINALIZADO`) **+ um filtro booleano `adiantamento` (=SIM)**.
- **NÃO** é o caminho `listAdiantamentoFinanceiroAPagar` / `tpdCod=143` / `gerNum=198` — esse
  caminho alternativo foi **descartado** (P0-3 resolvido).
- **Sem janela incremental** especificada: a query lista todas via os 3 filtros e elege as
  candidatas. **Multi-filial** (I6). Performance/rate-limit (paginate cap existente,
  `PAGE_SIZE=500`, `MAX_PAGES=50`) é **nota de implementação não-bloqueante**.

## Build-probe (NÃO bloqueia)

- O **nome EXATO da chave wire** do filtro `adiantamento` (ex.: `adiantamento#EQ:'S'`) ainda
  precisa ser capturado num **probe de rede** no build. O **caminho está resolvido**; só falta
  o literal da chave. Não é mais um P0 bloqueante.

## Idempotência

- Idempotente por design: recomputa o backlog a cada run, sem efeito colateral externo.
  Rodar 2× no mesmo dia produz o mesmo conjunto de candidatos.
