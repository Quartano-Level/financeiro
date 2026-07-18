---
adr_number: 0020
title: SISPAG — INTERNACIONAL FORA DO ESCOPO; pagamento ao exterior é câmbio manual da tesouraria (Itaú→BB), não passa pelo SISPAG; aposenta o invariante I7 (lote uniforme nacional × internacional), a coluna `internacional`, o `LoteTipoConflitoError` e a classificação na inclusão; a classe vira filtro-out na ingestão
date: 2026-07-18
status: accepted
type: change
related_entities: [TituloAPagar, LotePagamento, ItemLote]
related_actions: [ingerirPagamentos, formarLotesAutomaticos, gerenciarLoteCandidato]
supersedes_decisions: [ADR-0017]
---

# ADR 0020: SISPAG — internacional fora do escopo (supersede ADR-0017 / aposenta I7)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/sispag-ingestao-pagamentos`
**Relacionado:** ADR-0015 (SISPAG Fatia 1+2 — painel + montagem de lote + gate; invariantes I2/I3/I4),
ADR-0016 (ingestão de pagamentos — carteira `TituloAPagar` persistida), ADR-0017 (**SUPERSEDIDO** por
este — lote uniforme nacional × internacional / I7), ADR-0018 (formação automática de lotes). **Fonte:**
`ontology/_inbox/sispag-fin015-exploration.md` — seção **"A4 — INTERNACIONAL FORA DO ESCOPO"**
(INTERNACIONAL = CÂMBIO, rail separado — NÃO é SISPAG), decisão do Yuri. **`entity_changed = true`**
(remoção da propriedade `internacional` de `TituloAPagar`/`ItemLote`; aposentadoria da regra de negócio
I7; remoção do erro `LoteTipoConflitoError`; a classificação nacional × internacional deixa de ser
propriedade/invariante e vira **filtro-out** na ingestão).

## Contexto

O ADR-0017 modelou a divisão **nacional × internacional** como uma quarta invariante de uniformidade do
lote (I7): um `LotePagamento` seria 100% nacional **ou** 100% internacional, com a classe persistida em
`titulo_a_pagar.internacional`/`lote_pagamento_item.internacional`, reconfirmada ao vivo via `com298` na
inclusão (anti-drift) e bloqueada por `LoteTipoConflitoError` (HTTP 422) quando um item de classe
divergente entrasse no lote.

A exploração do `fin015` (geração de lotes/remessa SISPAG) — seção **A4** — confirmou, contra os módulos
do Conexos, que **pagamento ao exterior é câmbio**, no **Comércio Exterior**, e **não passa pelo fin015**:
é **contrato de câmbio + SWIFT** em moeda estrangeira (`log009/validaBotaoFechamentoCambio`,
`imp059/contratoCambioProf`, `imp113/117/120/cambioVinc`, `imp194/dtaFechCambio`), sem CNAB/boleto. Na
Columbia esse câmbio é **manual, feito pela tesouraria** (Itaú → BB), fora de qualquer remessa nossa. A
prova empírica em HML fechou a questão: o único título a-vencer era o doc 520 (MOLIBDENOS Y METALES,
INVOICE/internacional, sem código de barras e sem modalidade) — **não importa** num lote SISPAG.

Consequência: o SISPAG (Frente II) é, por definição, **doméstico**. Um título internacional **nunca**
deveria ter entrado na carteira SISPAG. A divisão nacional × internacional dentro do lote (I7) foi, na
prática, modelar uma linha que o domínio **exclui** — não uma que ele **particiona**. A estrutura correta
não é "lote uniforme por classe", é "internacional não é insumo do SISPAG".

## Decisões

### D1 — Internacional está FORA do escopo do SISPAG (supersede a premissa do ADR-0017)
Pagamento ao exterior é **câmbio manual da tesouraria** (Itaú → BB), tratado no Comércio Exterior (rail
`log009`/`imp*`), **não** pela remessa SISPAG. O SISPAG cuida **só do nacional** (boleto/PIX/TED,
CNAB via `fin015`). A automação do câmbio, se um dia for feita, é uma **frente separada** (projeto
próprio, maior) — não este escopo. Isso **supersede o ADR-0017**, cuja premissa era conviver com os dois
trilhos dentro do mesmo agregado de lote.

### D2 — Aposentar o invariante I7 (lote uniforme nacional × internacional)
Sem títulos internacionais na carteira, **não há mistura possível** — a invariante de uniformidade por
classe perde objeto. O I7 é **RETIRADO** (não deletado do histórico): `business-rules/lote-uniforme-
nacional-internacional.md` fica marcado como retirado/superseded por este ADR. As invariantes que
permanecem são I2 (elegibilidade), I3 (não-duplicação), I4 (uma filial por lote), I5 (gate reversível +
auditoria) e I6 (concorrência).

### D3 — Remover a coluna `internacional` (migration 0030 — purga + drop)
A propriedade `internacional` sai de `TituloAPagar` e de `ItemLote`. A migration
`0030_remove_internacional.sql` (idempotente, destrutiva) **purga** o legado internacional já ingerido
(ordem: `lote_pagamento_item` → lotes órfãos → `titulo_a_pagar`) e **dropa** as colunas
`titulo_a_pagar.internacional` e `lote_pagamento_item.internacional`. Reverte estruturalmente a migration
0025 do ADR-0017.

### D4 — Classificação vira FILTRO-OUT na ingestão (não mais propriedade/inclusão)
A ingestão (`IngestaoPagamentosService`) continua lendo o conjunto EX da filial via
`ConexosSispagClient.listExteriorDocCods(filCod)` (`com298`, `ufEspSigla='EX'`) — mas agora para
**excluir** esses docs da carteira SISPAG, em vez de marcá-los com um booleano. Internacional é
**filtrado na entrada** e nunca vira `TituloAPagar`. O método autoritativo single-doc
`isDocInternacional` (usado no ADR-0017 para reconfirmar a classe na inclusão do lote) **deixa de existir**
— sem classe no agregado, não há o que reconfirmar.

### D5 — Remover o `LoteTipoConflitoError` e a classificação na inclusão
Sem I7, não há bloqueio de classe divergente: o erro tipado `LoteTipoConflitoError` (HTTP 422) e a
reconfirmação de classe em `LotePagamentoService.incluirTitulo` são **removidos**. A formação automática
(`formarLotesAutomaticos`) agrupa agora **só por FILIAL** (I4) — a dimensão "classe" some da chave de
agrupamento (filial × classe × banco → filial). Ver `actions/sispag/formar-lotes-automaticos.md` e ADR-0018.

### D6 — READ-ONLY no ERP (I1) mantido
`listExteriorDocCods` segue **só-leitura** no `com298`. A única escrita desta mudança é **LOCAL**
(Postgres: purga + `DROP COLUMN`, migration 0030). Nenhuma escrita no Conexos.

## Consequências

- O SISPAG fica **coerente com o domínio real**: carteira, lote, formação automática e remessa são
  **100% nacionais**. Internacional nunca entra na carteira (filtro-out na ingestão) — some do painel,
  dos lotes e do arquivo de remessa.
- O agregado de lote perde uma dimensão que não existia de fato: **um invariante a menos** (I7 retirado),
  **uma coluna a menos** (`internacional`), **um erro a menos** (`LoteTipoConflitoError`), **um método de
  client a menos** (`isDocInternacional`). O modelo fica mais enxuto e mais fiel.
- O painel perde o filtro/segmento "Nacionais / Internacionais" e o badge "internacional" — não há mais
  classe a exibir (é tudo nacional). (Ajuste de UI, não modela domínio.)
- A formação automática agrupa **só por filial** (I4). O caveat do banco-null (ADR-0018) segue: hoje o
  agrupamento é efetivamente **por filial**.
- **Dado dormente:** a migration 0030 apaga títulos/itens/lotes internacionais já ingeridos. Como o
  internacional nunca deveria ter entrado, é limpeza de legado, não perda de dado operacional.
- A **automação do câmbio ao exterior** fica registrada como possível **frente futura separada**
  (`log009`/`imp*`), fora deste escopo.

## Universalidade

A separação em si (doméstico via boleto/PIX/TED × exterior via câmbio/SWIFT) **continua universal** em
qualquer contas-a-pagar de trading com comex — o que muda é **onde** ela cai: o exterior corre por um
**rail inteiramente distinto** (câmbio manual/Comex), não por uma partição interna do mesmo lote de
remessa. Modelar o internacional como classe do lote SISPAG foi um **excesso de modelagem** (o SISPAG é
doméstico por natureza); a estrutura correta é **excluir** o internacional da carteira de pagamento
doméstico. O discriminador concreto (`ufEspSigla='EX'` no `com298`) segue sendo o mapeamento de valor do
tenant/ERP Conexos — agora usado como **filtro de entrada**, recalibrável por config.

## Índice / coverage a regenerar

Esta mudança **reduz** as contagens de business-rules (uma regra retirada, com teste canônico):
`business_rules_total` 12 → **11**, `business_rules_implemented` 9 → **8**, `business_rules_with_tests`
5 → **4**. `ontology/_index.json` e `ontology/_coverage.json` foram atualizados nesta curadoria (entrada
`lote-uniforme-nacional-internacional` marcada como `retired`/superseded por ADR-0020; notas de versão
ADR-0020 adicionadas; referências a `internacional` nas entidades `TituloAPagar`/`LotePagamento` e à ação
`formarLotesAutomaticos` reescritas). Se algum contador divergir de uma regeneração automática futura,
esta é a fonte da verdade da retirada.

## Reuso / linhagem

Supersede o ADR-0017 (do qual herda o discriminador `com298.ufEspSigla='EX'`, agora como filtro-out).
Mantém as invariantes I2/I3/I4 (ADR-0015), a doutrina READ-ONLY no ERP (I1), a ingestão persistida
(ADR-0016) e a formação automática (ADR-0018, agora só por filial). Não reinventa nada — **remove** o que
o domínio real não sustentava.
