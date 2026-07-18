---
name: lote-uniforme-nacional-internacional
type: business-rule
entity: LotePagamento
ontology_version: "0.7"
implementation_status: retired
status: retired
superseded_by: ADR-0020
invariant: I7
related_files:
  - src/backend/migrations/0025_titulo_internacional.sql
  - src/backend/migrations/0030_remove_internacional.sql
last_review: 2026-07-18
has_canonical_test: false
---

> ⚠️ **REGRA RETIRADA — invariante I7 aposentado por [ADR-0020](../decisions/0020-internacional-fora-do-escopo.md) (2026-07-18).**
> O SISPAG é **doméstico**: pagamento ao exterior é **câmbio manual da tesouraria** (Itaú→BB), tratado
> no Comércio Exterior (`log009`/`imp*`), **não** passa pela remessa SISPAG (`fin015`). Como títulos
> internacionais **nunca entram** na carteira SISPAG (agora **filtrados na ingestão** via
> `com298.ufEspSigla='EX'`), **não há mistura possível** — o invariante de uniformidade por classe
> perde objeto. Foram **removidos**: a propriedade `internacional` de `TituloAPagar`/`ItemLote`
> (migration `0030_remove_internacional.sql` purga o legado + dropa as colunas da migration 0025), o
> erro `LoteTipoConflitoError` (HTTP 422), o método autoritativo `isDocInternacional` e a reconfirmação
> de classe em `incluirTitulo`. `listExteriorDocCods` sobrevive, mas agora como **filtro-out** na
> ingestão. Este arquivo fica como **histórico** da regra anterior. Ver ADR-0020 e ADR-0017 (também
> superseded). As invariantes vigentes do lote são I2/I3/I4/I5/I6.

# [RETIRADO] Regra: lote-uniforme-nacional-internacional (um lote é 100% nacional OU 100% internacional)

> **Conteúdo histórico abaixo — não vale mais.** Mantido para rastreabilidade da decisão que o ADR-0020
> reverteu.

> **Invariante I7 — Lote uniforme nacional × internacional.** Todos os `ItemLote` de um
> `LotePagamento` têm a **mesma classe** — ou **todos nacionais** (boleto/PIX, UF brasileira) ou
> **todos internacionais** (câmbio/exterior, `ufEspSigla = 'EX'`). Um lote **nunca mistura** as duas
> classes: mistura = abre-se outro lote. Espelha a forma do I4 (uma filial por lote).

## Enunciado

```
∀ item ∈ lote.itens :  item.internacional = lote.internacional
```

- A **classe do lote** é fixada pelo **1º item incluído** (`incluirTitulo`, L2): o primeiro título
  define se o lote é nacional (`internacional = false`) ou internacional (`internacional = true`).
- Na inclusão dos títulos seguintes, `titulo.internacional ≠ lote.internacional` → **bloqueado** com
  o erro `LoteTipoConflitoError` (**HTTP 422**), mensagem ("este lote é nacional; o título é
  internacional — abra outro lote", e vice-versa).
- O frontend (`/sispag`) **antecipa** o bloqueio: o segmento de filtro (Todas / Nacionais /
  Internacionais) + o badge "internacional" no título impedem a seleção mista já no "Criar lote"; o
  backend é a rede autoritativa (defesa em profundidade).

## Discriminador: `ufEspSigla = 'EX'` (via `com298`)

A classe de um documento a pagar é decidida pela **UF do documento** no Conexos:

- `ufEspSigla = 'EX'` → **exterior** = **internacional** (pagamento por câmbio/exterior).
- Qualquer UF brasileira (`SP`/`RJ`/`ES`/…) → **nacional** (boleto/PIX).

O `fin064` (nossa fonte da carteira de títulos) **não carrega** `ufEspSigla` — por isso a
classificação é **enriquecida** via `com298`:

- **Autoritativo (single-doc):** `ConexosSispagClient.isDocInternacional(filCod, docCod)` lê o
  `com298` do documento e devolve se é `EX`. É o que `incluirTitulo` usa para validar o I7 na
  inclusão (anti-drift — a verdade do ERP no momento da inclusão manda).
- **Bulk (ingestão):** `ConexosSispagClient.listExteriorDocCods(filCod)` traz o **conjunto EX** da
  filial; `IngestaoPagamentosService` marca `internacional` em cada título (via o set) na ingestão →
  **persistido** em `titulo_a_pagar.internacional` para o filtro do painel. Ambos os métodos são
  **READ-ONLY** no Conexos (I1).

## Por que o lote é uniforme (trilhos de pagamento distintos)

Pagamentos **nacionais** (boleto/PIX) e **internacionais** (câmbio/exterior) usam **trilhos de
remessa diferentes** — a remessa SISPAG nativa **não mistura** os dois num mesmo arquivo. Modelar o
lote candidato como **uniforme** mantém o mapeamento 1:1 com o que a fatia de transporte vai dirigir
(cada lote vira uma remessa de um único trilho), sem ter que quebrar um lote misto na hora de gerar
o arquivo — exatamente o mesmo raciocínio de compatibilidade que sustenta o I4 (uma filial por lote).

## Persistência & anti-drift

- `titulo_a_pagar.internacional` (migration 0025) — a classe **persistida** na carteira, computada na
  ingestão (via o set EX bulk). Serve o **filtro** do painel (Todas / Nacionais / Internacionais).
- `lote_pagamento_item.internacional` (migration 0025) — a classe do item no lote (snapshot da
  inclusão), coerente com a classe do lote.
- **Anti-drift:** a validação do I7 na inclusão **não confia** só no valor persistido — reconfirma a
  classe **autoritativa** via `getTituloAPagar` → `com298` no momento do `incluirTitulo`, como o
  Gate 3 de elegibilidade (I2) reconfirma `aprovado`. O valor persistido é para o filtro/visão; a
  fronteira do agregado usa a verdade viva do ERP.

## Onde atua

- `LotePagamentoService.incluirTitulo` (L2): 1º item fixa a classe do lote; item de classe divergente
  → `LoteTipoConflitoError` (422).
- `IngestaoPagamentosService`: enriquece `internacional` em cada título na ingestão (set EX bulk).
- Frontend `/sispag`: filtro por classe + badge "internacional" + bloqueio da seleção mista no
  "Criar lote".

## Teste canônico

- `has_canonical_test: true` — caso canônico: lote vazio + incluir título nacional (`SP`) → **ok**
  (lote vira nacional); incluir título internacional (`EX`) no mesmo lote → **bloqueado**
  (`LoteTipoConflitoError`, 422). Simétrico: 1º item `EX` fixa lote internacional; título `SP`
  seguinte → **bloqueado**.

## Universalidade

Universal: pagamentos nacionais e internacionais correm por **meios/trilhos distintos** (boleto/PIX
doméstico × câmbio/exterior) e não se agrupam numa mesma remessa — separar o lote por natureza do
pagamento é padrão de qualquer contas-a-pagar de trading com comex, e é o que o motor nativo já
pressupõe. A **estrutura** (lote uniforme por classe nacional/internacional) é do domínio; o
**discriminador concreto** (`ufEspSigla = 'EX'` no `com298` do Conexos) é o mapeamento de valor do
tenant/ERP — recalibrável sem mudar a estrutura.
