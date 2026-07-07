---
name: lote-pagamento
type: state-machine
entity: LotePagamento
ontology_version: "0.5"
implementation_status: planned
status: draft
owners: [yuri]
related_files:
  - src/backend/migrations/0023_lote_pagamento.sql
  - src/backend/domain/service/sispag/SispagPainelService.ts
  - src/backend/routes/sispag.ts
last_review: 2026-07-07
states: [RASCUNHO, FINALIZADO, CANCELADO]
out_of_scope_states: [PROCESSANDO, ENVIADO, BAIXADO]
---

# Ciclo de vida — `LotePagamento` (lote candidato SISPAG)

> **Vigência:** 2026-07-07 (v0.5.0, ADR-0015). Modela o estado do **lote candidato** que a analista
> monta e finaliza (Escopo II, Fatia 1+2). É estado **local/persistido** (`lote_pagamento.status`),
> não do ERP. O `FINALIZADO` é o **gatilho conceitual** ("pronto para processar"); o processamento
> real (remessa/pasta/Nexxera/baixa) e seus estados (`PROCESSANDO`/`ENVIADO`/`BAIXADO`) são a
> **próxima feature** — fora de escopo aqui (ver ADR-0015).

## Estados (constantes tipadas)

| Constante (TS) | Valor | Significado |
|----------------|-------|-------------|
| `RASCUNHO` | `RASCUNHO` | Lote em montagem — a analista inclui/remove títulos. Aberto para edição. Estado inicial. |
| `FINALIZADO` | `FINALIZADO` | A analista finalizou o lote (gate). "Pronto para processar". Registra `finalizadoPor`/`finalizadoEm`. **Reversível** por `reabrirLote` enquanto não houver downstream (não há nesta fatia). |
| `CANCELADO` | `CANCELADO` | Lote descartado. **Terminal.** Libera os títulos (deixam de ocupar a chave UNIQUE de I3). |

Tipo: `LotePagamentoStatus = 'RASCUNHO' | 'FINALIZADO' | 'CANCELADO'`
(constantes tipadas — nunca strings cruas; Inviolable Rule análoga à P3 da ontologia).

> **Estados fora de escopo (próxima fatia):** `PROCESSANDO`/`ENVIADO`/`BAIXADO` modelariam o
> transporte (pasta de rede → VAN Nexxera → banco) e a baixa (`fin052`→`fin010`). **Não** existem
> nesta fatia; registrá-los agora seria modelar antes da hora (ver `out_of_scope_states`).

## Transições

Cada transição é uma **ação nomeada** com regra explícita e registro de vigência. Toda transição
grava ator + timestamp (auditoria, I5) e incrementa `versao` (concorrência, I6).

| # | De → Para | Ação (gatilho) | Regra | Vigência |
|---|-----------|----------------|-------|----------|
| L1 | `(novo) → RASCUNHO` | `criarLoteCandidato` | Abre um lote vazio para **uma** filial (`filCod`); banco/conta opcionais (metadado). Ver `actions/sispag/gerenciar-lote-candidato.md`. | 2026-07-07 |
| L2 | `RASCUNHO → RASCUNHO` | `incluirTituloNoLote` / `removerTituloDoLote` | Item só entra se **aprovado + não pago** (I2, `elegibilidade-titulo-lote`), da **mesma filial** (I4, `lote-uma-filial`) e **não em outro RASCUNHO** (I3, `nao-duplicacao-titulo-lote`). Auto-transição (edição do agregado). | 2026-07-07 |
| L3 | `RASCUNHO → FINALIZADO` | `finalizarLote` **(GATE)** | O lote tem ≥1 item; todos os itens ainda elegíveis. Registra `finalizadoPor`/`finalizadoEm`. **Sem downstream nesta fatia** — é o gatilho conceitual. Ver `actions/sispag/finalizar-lote.md`. | 2026-07-07 |
| L4 | `FINALIZADO → RASCUNHO` | `reabrirLote` | Reversão do gate — permitida **enquanto não houver etapa downstream** (não há nesta fatia; I5). Volta a permitir edição. | 2026-07-07 |
| L5 | `{RASCUNHO, FINALIZADO} → CANCELADO` | `cancelarLote` | Descarta o lote candidato. Libera os títulos (saem da UNIQUE de I3). **Terminal.** | 2026-07-07 |

```
        criarLoteCandidato (L1)
              │
              ▼
        ┌───────────┐  finalizarLote (L3)   ┌────────────┐
        │  RASCUNHO │ ────────────────────▶ │ FINALIZADO │
        │  (L2:     │ ◀──────────────────── │            │
        │  incluir/ │    reabrirLote (L4)   └────────────┘
        │  remover) │                              │
        └───────────┘                              │
              │  cancelarLote (L5)                 │  cancelarLote (L5)
              ▼                                     ▼
                        ┌───────────┐
                        │ CANCELADO │  (terminal)
                        └───────────┘
```

## Decisões de modelagem (ADR-0015)

- **Finalização reversível:** `finalizarLote` é reversível via `reabrirLote` (L4) **porque não há
  downstream nesta fatia**. Quando a próxima fatia plugar o transporte (pasta/Nexxera), a
  reversibilidade passará a ser condicionada ao estado do processamento — o que hoje é livre
  ficará gated. Registrado aqui para não confundir "reversível agora" com "reversível sempre".
  *(Alternativa considerada e adiada: finalização irreversível — rejeitada por ora, pois sem
  downstream não há risco em reabrir e a operação diária pede correção rápida.)*
- **Agrupamento por filial (I4), banco/conta como metadado opcional:** o lote é escopado por
  `filCod` (compatível com o `fin015` nativo, que é por filial/banco). Agrupar também por
  banco+conta é uma **pergunta em aberto** (Flávia) — adiada para a fatia de transporte, quando o
  banco/conta vira chave do arquivo de remessa. Nesta fatia banco/conta é metadado informativo.
- **`CANCELADO` terminal:** um lote cancelado não volta; a analista abre um novo. Simplifica I3
  (só `RASCUNHO` ocupa a UNIQUE).

## Relação com o painel e o ERP

Esta máquina é **puramente local** — não reflete nem espelha o estado do lote nativo do `fin015`
(que só passa a existir na próxima fatia, quando finalizarLote dirigir o ERP). O painel de leitura
(`montarPainelPagamentos`) mostra os lotes nativos como **contexto**, mas eles não participam
deste ciclo de vida.
