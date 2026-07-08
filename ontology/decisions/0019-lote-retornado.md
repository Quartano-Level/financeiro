---
adr_number: 0019
title: SISPAG — status RETORNADO ("de volta do Nexxera") + transição marcarRetorno (FINALIZADO→RETORNADO); FINALIZADO = "aguardando o retorno do Nexxera"; manual hoje / robô-poller fin052 na Fatia 3
date: 2026-07-08
status: accepted
type: addition
related_entities: [LotePagamento]
related_actions: [finalizarLote, marcarRetorno]
supersedes_decisions: []
---

# ADR 0019: Status RETORNADO no ciclo de vida do lote SISPAG

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/sispag-ingestao-pagamentos`
**Relacionado:** ADR-0015 (Fatia 1+2 — painel + montagem + gate; ciclo `RASCUNHO|FINALIZADO|CANCELADO`,
`PROCESSANDO/ENVIADO/BAIXADO` deferidos), ADR-0018 (formação automática — transição L6). **`entity_changed
= true`** (novo status `RETORNADO` em `LotePagamento`; nova transição L7 `marcarRetorno`; ressignificação
de `FINALIZADO`). **Fonte:** implementação da Fatia 2.6 (fechar o ciclo do lote de ponta a ponta antes do
transporte real da Fatia 3).

## Contexto

Até aqui o `FINALIZADO` era o **fim-de-linha desta fatia** — "pronto para processar", sem downstream. Mas
o ciclo real do lote SISPAG não termina na finalização: o lote finalizado vira **remessa enviada ao
Nexxera**, e o Nexxera devolve um **retorno** (`fin052`) que confirma o processamento. Modelar o lote sem
o passo de "retorno recebido" deixa o ciclo de vida incompleto e força a analista a controlar fora do
sistema quais lotes já voltaram.

O **transporte real** (gerar remessa `fin015`, pasta de rede, VAN Nexxera, leitura do arquivo de retorno,
baixa `fin010`) segue **deferido para a Fatia 3** (gates de contrato Nexxera/pasta/HML ainda abertos —
ver watchlist do `_coverage.json`). Esta fatia introduz **apenas o estado** `RETORNADO` e uma transição
**manual** que o simula, para que o modelo já represente o ciclo completo e o FE exiba os lotes que
"voltaram".

## Decisões

### D1 — Novo status `RETORNADO` ("de volta do Nexxera"), terminal por ora
O ciclo passa a ser `RASCUNHO → FINALIZADO → RETORNADO` (+ `CANCELADO`). `RETORNADO` marca o **retorno do
Nexxera recebido**. É **terminal nesta fatia** — a baixa/conciliação (`fin052`→`fin010`) que o consome é
a Fatia 3. Não é fim-de-linha do domínio: é o **ponto de sutura** da próxima fatia (mesma doutrina do
`FINALIZADO` como gatilho conceitual em ADR-0015).

### D2 — `FINALIZADO` ressignificado: "aguardando o retorno do Nexxera"
`FINALIZADO` deixa de ser "pronto para processar" e passa a significar **"finalizado pelo analista,
aguardando o retorno do Nexxera"**. `reabrirLote` (L4) segue reversível enquanto o retorno não chegou
(sem downstream que trave a reabertura nesta fatia).

### D3 — Transição L7 `marcarRetorno` MANUAL hoje, simulando o robô-poller da Fatia 3
`marcarRetorno` (`FINALIZADO → RETORNADO`) é acionada **manualmente** pela analista (botão "Marcar retorno
recebido"). Ela **simula** o retorno; o **gatilho real** será o **robô-poller** que lê o arquivo de retorno
(`fin052`) na Fatia 3 — quando existir, herda esta mesma transição sem mudar o modelo. Optimistic-lock por
`versao` (I6) + auditoria ator/timestamp (I5), como as demais transições. `LotePagamentoService.marcarRetorno`
(via `transicionar`, de:`[FINALIZADO]` para:`RETORNADO`); `POST /sispag/lotes/:id/retorno`; migration
`0027_lote_retornado.sql` recria o CHECK de `lote_pagamento.status` incluindo `RETORNADO`.

### D4 — READ-only no ERP mantido (I1)
Nenhuma escrita no Conexos: `marcarRetorno` é escrita **local** (Postgres). A leitura real do retorno e a
baixa seguem deferidas (Fatia 3).

## Escopo de UI (não modela domínio)
Os lotes `FINALIZADO` **saem** da aba "Lotes candidatos" e vão para uma nova aba **"Finalizados"**
(`FINALIZADO` = aguardando retorno + `RETORNADO` = de volta), ambas com filtros (filial,
nacional/internacional, status) e paginação; botão "Marcar retorno recebido" nos `FINALIZADO`. É
apresentação — registrado aqui para rastreabilidade, mas não entra na ontologia como conceito.

## Consequências

- Ciclo de vida do lote completo de ponta a ponta já nesta fatia; a Fatia 3 pluga o gatilho real (robô-poller)
  e a baixa sem redesenhar a máquina de estados.
- Contagens da ontologia inalteradas: `marcarRetorno` é uma **transição** do grupo de ações do lote (não uma
  ação nova de contagem); a state-machine `lote-pagamento` segue `planned`.
- **Aberto (Fatia 3):** leitura real do `fin052` (substitui a simulação manual), baixa `fin010` a partir do
  `RETORNADO`, e o que fazer com um retorno **rejeitado/parcial** (hoje só o caminho feliz FINALIZADO→RETORNADO
  é modelado).
