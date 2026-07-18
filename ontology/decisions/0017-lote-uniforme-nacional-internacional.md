---
adr_number: 0017
title: SISPAG — Lote uniforme nacional × internacional (I7); discriminador com298 ufEspSigla='EX' (fin064 não carrega), classificação autoritativa na inclusão + persistida para o filtro
date: 2026-07-08
status: superseded
superseded_by: ADR-0021
type: change
related_entities: [TituloAPagar, LotePagamento, ItemLote]
related_actions: [ingerirPagamentos, gerenciarLoteCandidato]
supersedes_decisions: []
---

> ⚠️ **SUPERSEDIDO por [ADR-0021](./0021-internacional-fora-do-escopo.md) (2026-07-18).** O SISPAG é
> **doméstico**: pagamento ao exterior é **câmbio manual da tesouraria** (Itaú→BB), não passa pelo
> SISPAG. A divisão nacional × internacional (invariante **I7**), a coluna `internacional`, o
> `LoteTipoConflitoError` e a classificação autoritativa na inclusão foram **aposentados**; a classe
> virou **filtro-out na ingestão** (internacional nunca entra na carteira). A migration 0030 purga o
> legado e dropa as colunas. Este ADR fica como **histórico** da decisão anterior. Ver ADR-0021.

# ADR 0017: Lote de pagamento uniforme — nacional × internacional (I7)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/sispag-ingestao-pagamentos`
**Relacionado:** ADR-0015 (SISPAG Fatia 1+2 — painel + montagem de lote + gate; invariantes I2/I3/I4),
ADR-0016 (ingestão de pagamentos — carteira `TituloAPagar` persistida). **`entity_changed = true`**
(nova propriedade `internacional` em `TituloAPagar`/`ItemLote`; nova regra de negócio I7; novo erro
`LoteTipoConflitoError`). **Fontes:** implementação da Fatia 2 (montagem de lote) + sondagem `com298`.

## Contexto

O ADR-0015 modelou o lote candidato (`LotePagamento`) com três invariantes de agregado — I2
(elegibilidade), I3 (não-duplicação), I4 (uma filial por lote). A montagem assistida do lote expôs
uma quarta restrição do domínio: **pagamentos nacionais** (boleto/PIX, UF brasileira) e
**internacionais** (câmbio/exterior) correm por **trilhos de remessa distintos** — a remessa SISPAG
nativa **não mistura** os dois num mesmo arquivo. Um lote misto não teria como virar **uma** remessa
na fatia de transporte. Isso é a mesma natureza do I4 (uma filial por lote, compatível com o `fin015`
por filial/banco): uma restrição de **uniformidade** que mantém o lote candidato mapeável 1:1 ao
arquivo nativo.

O obstáculo prático: a **fonte da carteira** (`fin064`, ADR-0016) **não carrega** o discriminador de
nacionalidade. Quem carrega é o `com298` (via `ufEspSigla`).

## Decisões

### D1 — Lote uniforme por classe nacional × internacional (invariante I7)
Um `LotePagamento` é **100% nacional OU 100% internacional** — nunca misto. A **classe é fixada pelo
1º item incluído**; um item de classe divergente é **bloqueado** na inclusão
(`LotePagamentoService.incluirTitulo`) com o erro **`LoteTipoConflitoError` (HTTP 422)**. Espelha a
forma do I4 (uma filial por lote). → `business-rules/lote-uniforme-nacional-internacional.md`.

### D2 — Discriminador `com298.ufEspSigla='EX'` (fin064 não carrega → enriquecer)
A classe do documento é a **UF do documento** no `com298`: **`ufEspSigla='EX'` = exterior =
internacional**; qualquer UF brasileira = nacional. Como o `fin064` (nossa fonte da carteira) **não**
carrega `ufEspSigla`, a classe é **enriquecida** via `com298`, com dois acessos READ-ONLY no
`ConexosSispagClient`:
- `listExteriorDocCods(filCod)` — o **conjunto EX** (bulk) da filial, usado na **ingestão**.
- `isDocInternacional(filCod, docCod)` — a classe **autoritativa single-doc**, usada na **inclusão**.

*(Alternativa: derivar a classe de um campo já presente no `fin064` — rejeitada: o `fin064` não
expõe a UF/natureza do documento de forma confiável; a fonte correta é o `com298`. Alternativa:
inferir por moeda — rejeitada: moeda ≠ trilho de pagamento; um título em moeda estrangeira pode ter
liquidação doméstica e vice-versa. A UF do documento (`EX`) é o discriminador que o ERP usa.)*

### D3 — Classificação AUTORITATIVA na inclusão (anti-drift)
Na fronteira do agregado (`incluirTitulo`), a classe do título é reconfirmada **ao vivo** via
`getTituloAPagar` → `com298` (`isDocInternacional`) — **não** confia apenas no `internacional`
persistido. Espelha o Gate 3 de elegibilidade (I2), que reconfirma `aprovado` na inclusão. O valor
persistido serve a **visão** (filtro); a **decisão** de bloqueio usa a verdade viva do ERP.

*(Alternativa: validar o I7 só pelo booleano persistido — rejeitada: a carteira muda entre a ingestão
e a montagem; validar por dado stale arriscaria montar um lote misto que a remessa rejeitaria.)*

### D4 — `internacional` PERSISTIDO na carteira para o filtro do painel
A ingestão (`IngestaoPagamentosService`) marca `internacional` em cada título (via o set EX bulk) e
**persiste** em `titulo_a_pagar.internacional` (migration 0025). Isso alimenta o **filtro** do painel
`/sispag` (segmento Todas / Nacionais / Internacionais) + o **badge** "internacional" no título, e o
frontend **antecipa** o bloqueio (impede a seleção mista já no "Criar lote"). `lote_pagamento_item`
ganha `internacional` (snapshot da inclusão, coerente com a classe do lote). O backend é a rede
autoritativa (defesa em profundidade), o filtro é a UX.

### D5 — READ-ONLY no ERP (I1) mantido
Os dois novos acessos (`isDocInternacional`, `listExteriorDocCods`) são **só-leitura** no `com298`.
Nenhuma escrita no Conexos. A única escrita desta mudança é **LOCAL** (Postgres: coluna
`internacional` em `titulo_a_pagar` e `lote_pagamento_item`, migration 0025).

## Consequências

- O lote candidato ganha a **quarta invariante de uniformidade** (I7), coerente com o I4 — cada lote
  vira **uma** remessa de um único trilho na fatia de transporte, sem quebrar lote misto no envio.
- A carteira ganha uma **dimensão de classificação** (nacional/internacional) útil já no painel
  (filtro/badge), sem custo de leitura por request (persistida na ingestão).
- Anti-drift preservado: a decisão de bloqueio na inclusão usa a classe **viva** do `com298`, como o
  detalhe de remessa (ADR-0016) é hidratado ao vivo — o persistido é para visão, não para a fronteira.
- Novo erro tipado `LoteTipoConflitoError` (422) entra no vocabulário de erros do SISPAG, ao lado dos
  bloqueios de I2/I3/I4.

## Universalidade

A **estrutura** (lote uniforme por natureza nacional/internacional do pagamento) é universal em
qualquer contas-a-pagar de trading com comex — meios de pagamento doméstico (boleto/PIX) e externo
(câmbio) não se agrupam numa mesma remessa, e o motor nativo já pressupõe isso. O **discriminador
concreto** (`ufEspSigla='EX'` no `com298`) é o mapeamento de valor do tenant/ERP Conexos —
recalibrável por config sem mudar a estrutura da regra.

## Reuso da Frente I + Fatia anterior

Doutrina anti-drift (classe autoritativa na inclusão = Gate 3 de Permutas / detalhe de remessa live
do ADR-0016), snapshot no item do agregado (`ItemLote`, como `permuta_alocacao`), forma do invariante
de uniformidade (I7 espelha I4), enriquecimento via `com298` na ingestão (mesma superfície READ-ONLY
do ADR-0015/0016). Não se reinventa nada.
