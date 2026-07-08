---
name: lote-pagamento
type: state-machine
entity: LotePagamento
ontology_version: "0.9"
implementation_status: planned
status: draft
owners: [yuri]
related_files:
  - src/backend/migrations/0023_lote_pagamento.sql
  - src/backend/migrations/0026_lote_automatico.sql
  - src/backend/migrations/0027_lote_retornado.sql
  - src/backend/domain/service/sispag/SispagPainelService.ts
  - src/backend/domain/service/sispag/FormacaoLotesService.ts
  - src/backend/domain/service/sispag/LotePagamentoService.ts
  - src/backend/domain/repository/sispag/LotePagamentoRepository.ts
  - src/backend/jobs/formar-lotes.ts
  - src/backend/routes/sispag.ts
  - src/frontend/app/sispag/page.tsx
last_review: 2026-07-08
states: [RASCUNHO, FINALIZADO, RETORNADO, CANCELADO]
out_of_scope_states: [PROCESSANDO, ENVIADO, BAIXADO]
---

# Ciclo de vida — `LotePagamento` (lote candidato SISPAG)

> **Vigência:** 2026-07-07 (v0.5.0, ADR-0015); atualizada 2026-07-08 (v0.8.0, ADR-0018 — formação
> automática: L1 também disparada pelo cron `formarLotesAutomaticos`; nova transição L6 desfazer-vencidos
> dos auto-lotes RASCUNHO); atualizada 2026-07-08 (v0.9.0, ADR-0019 — novo status **RETORNADO** ("de
> volta do Nexxera") + transição **L7 `marcarRetorno`** `FINALIZADO → RETORNADO`, manual hoje / robô-poller
> na Fatia 3). Modela o estado do **lote candidato** que a analista
> monta e finaliza (Escopo II, Fatia 1+2). É estado **local/persistido** (`lote_pagamento.status`),
> não do ERP. O `FINALIZADO` deixou de ser só "pronto para processar": agora significa **"finalizado
> pelo analista, aguardando o retorno do Nexxera"**; o `RETORNADO` marca o **retorno recebido** e é
> **terminal por ora** (a baixa/conciliação — `fin052`→`fin010` — é a **próxima fatia**, Fatia 3). Os
> demais estados de processamento (`PROCESSANDO`/`ENVIADO`/`BAIXADO`) seguem fora de escopo (ver ADR-0015).

## Estados (constantes tipadas)

| Constante (TS) | Valor | Significado |
|----------------|-------|-------------|
| `RASCUNHO` | `RASCUNHO` | Lote em montagem — a analista inclui/remove títulos. Aberto para edição. Estado inicial. |
| `FINALIZADO` | `FINALIZADO` | A analista finalizou o lote (gate) — **"finalizado pelo analista, aguardando o retorno do Nexxera"**. Registra `finalizadoPor`/`finalizadoEm`. **Reversível** por `reabrirLote` (L4) enquanto o retorno não chegou (não há downstream que trave a reabertura nesta fatia). |
| `RETORNADO` | `RETORNADO` | **Retorno recebido** ("de volta do Nexxera"). Alcançado por `marcarRetorno` (L7) a partir de `FINALIZADO`. **Terminal por ora** — a baixa/conciliação (`fin052`→`fin010`) é a Fatia 3. |
| `CANCELADO` | `CANCELADO` | Lote descartado. **Terminal.** Libera os títulos (deixam de ocupar a chave UNIQUE de I3). |

Tipo: `LotePagamentoStatus = 'RASCUNHO' | 'FINALIZADO' | 'RETORNADO' | 'CANCELADO'`
(constantes tipadas — nunca strings cruas; Inviolable Rule análoga à P3 da ontologia).

> **Estados fora de escopo (próxima fatia):** `PROCESSANDO`/`ENVIADO`/`BAIXADO` modelariam o
> transporte (pasta de rede → VAN Nexxera → banco) e a baixa (`fin052`→`fin010`). **Não** existem
> nesta fatia; registrá-los agora seria modelar antes da hora (ver `out_of_scope_states`).

## Transições

Cada transição é uma **ação nomeada** com regra explícita e registro de vigência. Toda transição
grava ator + timestamp (auditoria, I5) e incrementa `versao` (concorrência, I6).

| # | De → Para | Ação (gatilho) | Regra | Vigência |
|---|-----------|----------------|-------|----------|
| L1 | `(novo) → RASCUNHO` | `criarLoteCandidato` (manual) / `formarLotesAutomaticos` (cron) | Abre um lote **RASCUNHO** para **uma** filial (`filCod`); banco/conta opcionais (metadado). Manual: analista abre vazio (`automatico=false`). Cron: `formarLotesAutomaticos` cria já preenchido (`automatico=true`) agrupando títulos a-vencer ≤7d por filial×classe×banco (I4/I7), para revisão. Ver `actions/sispag/gerenciar-lote-candidato.md` e `actions/sispag/formar-lotes-automaticos.md`. | 2026-07-08 |
| L2 | `RASCUNHO → RASCUNHO` | `incluirTituloNoLote` / `removerTituloDoLote` | Item só entra se **aprovado + não pago** (I2, `elegibilidade-titulo-lote`), da **mesma filial** (I4, `lote-uma-filial`) e **não em outro RASCUNHO** (I3, `nao-duplicacao-titulo-lote`). Auto-transição (edição do agregado). | 2026-07-07 |
| L3 | `RASCUNHO → FINALIZADO` | `finalizarLote` **(GATE)** | O lote tem ≥1 item; todos os itens ainda elegíveis. Registra `finalizadoPor`/`finalizadoEm`. **Sem downstream nesta fatia** — é o gatilho conceitual. Ver `actions/sispag/finalizar-lote.md`. | 2026-07-07 |
| L4 | `FINALIZADO → RASCUNHO` | `reabrirLote` | Reversão do gate — permitida **enquanto não houver etapa downstream** (não há nesta fatia; I5). Volta a permitir edição. | 2026-07-07 |
| L5 | `{RASCUNHO, FINALIZADO} → CANCELADO` | `cancelarLote` | Descarta o lote candidato (decisão da analista). Libera os títulos (saem da UNIQUE de I3). **Terminal.** | 2026-07-07 |
| L6 | `RASCUNHO → (deletado)` | `formarLotesAutomaticos` (desfazer-vencidos) | **Só lote `automatico=true` em RASCUNHO.** A cada rodada do cron, um auto-lote RASCUNHO que passou a conter **≥1 título VENCIDO** é **DESFEITO (deletado)** e seus títulos **liberados** (`desfazerAutomaticosVencidos`) — só a-vencer é elegível ao lote automático. **Distinto de `CANCELADO`** (que é escolha da analista e é um *estado* terminal): aqui a linha do lote some (é re-formável na mesma rodada). **Nunca** atinge lote **manual** (`automatico=false`) nem **FINALIZADO/CANCELADO**. Ver ADR-0018. | 2026-07-08 |
| L7 | `FINALIZADO → RETORNADO` | `marcarRetorno` | Marca o **retorno do Nexxera recebido** para um lote `FINALIZADO`. **Hoje é acionada MANUALMENTE** pela analista (botão "Marcar retorno recebido") — **simula** o retorno; o gatilho real será o **robô-poller** que lê o arquivo de retorno (`fin052`) na **Fatia 3**. Optimistic-lock (`versao`) + auditoria (ator + timestamp), como as demais transições (I6/I5). `RETORNADO` é **terminal por ora** (a baixa `fin010` é a Fatia 3). Ver `LotePagamentoService.marcarRetorno` (via `transicionar`, de:`[FINALIZADO]` para:`RETORNADO`), migration `0027_lote_retornado.sql` (recria o CHECK de status incluindo RETORNADO), `POST /sispag/lotes/:id/retorno`. | 2026-07-08 |

```
        criarLoteCandidato (L1)
              │
              ▼
        ┌───────────┐  finalizarLote (L3)   ┌────────────────────┐  marcarRetorno (L7)   ┌───────────┐
        │  RASCUNHO │ ────────────────────▶ │     FINALIZADO     │ ────────────────────▶ │ RETORNADO │
        │  (L2:     │ ◀──────────────────── │ (aguardando retorno│   (manual hoje /      │ (terminal │
        │  incluir/ │    reabrirLote (L4)   │    do Nexxera)     │   robô-poller Fatia 3)│  por ora) │
        │  remover) │                       └────────────────────┘                       └───────────┘
        └───────────┘                              │
              │  cancelarLote (L5)                 │  cancelarLote (L5)
              ▼                                     ▼
                        ┌───────────┐
                        │ CANCELADO │  (terminal)
                        └───────────┘
```

> **L7 hoje é uma simulação manual.** `marcarRetorno` existe para fechar o ciclo do lote de ponta a
> ponta (montar → finalizar → retorno) já nesta fatia, mas o **gatilho real** é o robô-poller do arquivo
> de retorno (`fin052`) da **Fatia 3**. A **baixa/conciliação** (`fin010`) que consome o `RETORNADO`
> também é Fatia 3 — por isso `RETORNADO` é **terminal por ora** (não é fim-de-linha do domínio, é o
> ponto de sutura da próxima fatia).

## Auto-lotes: criados e desfeitos pelo cron (ADR-0018)

A propriedade `automatico` particiona quem move o lote:

- **Lote automático** (`automatico=true`, criado por `formarLotesAutomaticos`): nasce **RASCUNHO** já
  preenchido e é **efêmero/re-formável** — a cada rodada o cron **desfaz** (L6, deleta) os auto-lotes
  RASCUNHO que contêm título vencido e **re-forma** a partir do pool a-vencer. A analista ainda o
  edita (L2), finaliza (L3), reabre (L4) ou cancela (L5) normalmente enquanto RASCUNHO — se ela
  finalizar, ele deixa de ser candidato do cron (só RASCUNHO auto é desfeito).
- **Lote manual** (`automatico=false`, criado por `criarLoteCandidato`): o cron **nunca** o toca — nem
  cria, nem desfaz. Só a analista o move.

**`DESFAZER` (L6) ≠ `CANCELADO` (L5):** `CANCELADO` é um **estado terminal** que a analista escolhe e
que fica registrado (auditoria). `DESFAZER` é o cron **deletando** a linha de um auto-lote efêmero cujo
título venceu — não é um estado, é a ausência do lote (será re-formado se ainda houver elegíveis). Não
se criou um status `VENCIDO`: modelar o vencimento como estado do lote seria modelar antes da hora — o
auto-lote é derivável a cada rodada.

## Decisões de modelagem (ADR-0015, ADR-0018)

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
