---
adr_number: 0015
title: SISPAG (Escopo II) Fatia 1+2 — painel read-only + montagem assistida de lote + gate de finalização; escrita/remessa/Nexxera DEFERIDAS
date: 2026-07-07
status: accepted
type: addition
related_entities: [TituloAPagar, LotePagamento, ItemLote]
related_actions: [montarPainelPagamentos, gerenciarLoteCandidato, finalizarLote]
supersedes_decisions: []
---

# ADR 0015: SISPAG Fatia 1+2 — painel, montagem de lote e gate (read-only)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/sispag-painel-montagem`
**Escopo confirmado (2026-07-07):** painel read-only + montagem assistida do lote + gate de finalização.
**`entity_changed = true`** (novas entidades `TituloAPagar`, `LotePagamento`/`ItemLote` + state-machine).
**Fontes:** `_inbox/sispag-painel-montagem-interview.md`, `_inbox/sispag-briefing.md`,
`_inbox/sispag-native-vs-nexxera.md`, `_inbox/sispag-context-map.md`.

## Contexto

O Escopo II (SISPAG) automatiza pagamentos de importação para que **nenhum pagamento aprovado deixe
de sair no prazo** (evitar multa/juros). A sondagem read-only do Conexos PRD
(`sispag-native-vs-nexxera.md`) mostrou que **o ERP já executa o fluxo SISPAG nativamente** — monta
lote (`fin015`), gera remessa CNAB (`PG*.REM`), ingere retorno (`fin052`) e grava baixa (`fin010`) —
**exceto o transporte do arquivo banco⇄Conexos** (passos 6–7: entregar a remessa ao banco e trazer o
retorno). O valor da Kavex é **orquestração + visibilidade + cadência** sobre o motor nativo, não um
gerador de arquivo paralelo.

Esta fatia entrega a **base de valor que vale em qualquer cenário** (independe do contrato Nexxera):
visibilidade diária + montagem assistida + gate. Nada toca o ERP (leitura + estado local + auditoria).

## Decisões

### D1 — Entidade `TituloAPagar` (read model, `fin064`)
Read-through da carteira de pagamentos (`fin064` + alçada `com308`), **não persistido**. Campos:
`docCod`, `titCod`, `filCod`, `credor`, `valor`, `moeda`, `vencimento`, `liberado` (AND das flags de
alçada `titVld1/2/3libera`), `pago`, `banco?`. → `entities/titulo-a-pagar.md`.

### D2 — Agregado `LotePagamento` + `ItemLote` (local, persistido)
Lote candidato montado pela analista (`lote_pagamento` + `lote_pagamento_item`), **local** — espelha
a doutrina de rascunho persistido de `permuta_alocacao` (sobrevive à re-leitura). `ItemLote` guarda
**snapshot** de valor/venc/credor na inclusão. → `entities/lote-pagamento.md`.

### D3 — State-machine `RASCUNHO → FINALIZADO → CANCELADO`
Transições = ações nomeadas com regra + vigência: `criarLoteCandidato` (L1),
`incluir/removerTituloNoLote` (L2), `finalizarLote` (L3, gate), `reabrirLote` (L4), `cancelarLote`
(L5). Status como **constantes tipadas**. Estados de processamento
(`PROCESSANDO`/`ENVIADO`/`BAIXADO`) ficam **fora de escopo** (out_of_scope_states). →
`state-machines/lote-pagamento.md`.

### D4 — Três invariantes do agregado
- **I2 (elegibilidade):** só título `liberado` (aprovado) + não `pago` entra →
  `business-rules/elegibilidade-titulo-lote.md`.
- **I4 (uma filial por lote):** compatível com o `fin015` nativo (por filial/banco) →
  `business-rules/lote-uma-filial.md`.
- **I3 (não-duplicação):** título não em dois lotes RASCUNHO — UNIQUE parcial →
  `business-rules/nao-duplicacao-titulo-lote.md`.

### D5 — READ-ONLY total: ZERO escrita no Conexos (I1)
O `ConexosSispagClient` é **só-leitura** nesta fatia (nenhum verbo mutante importado). Toda escrita é
**local** (Postgres): `lote_pagamento`/`lote_pagamento_item` + auditoria. As reads são autenticadas;
as mutações de lote exigem `requireRole('admin')` (espelha Permutas). Ver
`integrations/conexos.md` (superfície SISPAG READ: `fin064`/`fin015`/`fin010` via `ConexosSispagClient`).

### D6 — Finalização REVERSÍVEL (decisão registrada) + agrupamento por FILIAL
Duas escolhas de modelagem que a spec deixou em aberto, decididas aqui:
- **Finalização reversível** via `reabrirLote` **enquanto não houver downstream** (não há nesta
  fatia). *(Alternativa: finalização irreversível — adiada; sem downstream não há risco em reabrir e
  a operação diária pede correção rápida. Quando a fatia de transporte plugar o processamento, a
  reabertura passa a ser gated pelo estado do envio.)*
- **Agrupamento por filial só**; `banco`/`conta` = metadados opcionais. *(Alternativa: agrupar por
  filial+banco+conta como o `fin015`. Pergunta em aberto `agrupamento-banco-conta` com a Flávia —
  adiada para a fatia de transporte, quando banco/conta vira chave do arquivo de remessa. Registrar
  como metadado agora deixa a promoção barata, sem reseed.)*

## Decisão explícita de DEFERIR (fora de escopo — próxima fatia)

**Gerar remessa (dirigir `fin015`), escrever/ler arquivo na pasta de rede, VAN Nexxera, retorno +
baixa (`fin052`/`fin010` write) e o scheduler de cadência diária ficam FORA desta fatia.**

**Motivo:** dependências de terceiros ainda **abertas** —
- **Contrato Nexxera:** pela leitura do Ricardo (TI Columbia, 2026-07-07), hoje é **SÓ EXTRATO**
  (bate com `fin143` = importador de extratos); ele vai **agendar reunião com a Nexxera** para
  confirmar se o contrato cobre **pagamento** (remessa). Gate da última milha.
- **Pasta de rede / mecanismo da VAN:** caminho da pasta (Flávia/Ricardo) e se a VAN faz o *pickup*
  da pasta sozinha ou precisa de RPA — **não confirmados**.
- **Bancos + arquivo-vs-digitação:** quais bancos usam remessa de fato e se hoje sobem arquivo ou
  digitam — pendente (Flávia, via Yuri).
- **Riscos herdados (migration-debt):** **O4** (não há runtime de scheduler para a cadência diária +
  polling do retorno) e **O7** (client/config Nexxera inexistentes) permanecem **abertos**.

Construir o valor todo (painel + montagem + gate) **antes** e plugar o transporte quando o
contrato/VAN estiver pronto é a estratégia deliberada — o "Nexxera é ruim de retorno" (suporte lento)
reforça tratá-la como **última milha**.

## Arquitetura-alvo do transporte (contexto — NÃO implementado aqui)

Registrada para orientar a próxima fatia (hipótese validada com o Ricardo,
`sispag-native-vs-nexxera.md` §4.2 / `sispag-briefing.md` §4.2):

```
Conexos (fin015 gera PG*.REM) ──▶ PASTA DE REDE ──▶ VAN Nexxera pega ──▶ banco processa
                                                                              │
        baixa no Conexos (fin052) ◀── PASTA DE REDE ◀── arquivo de retorno ◀─┘
```

- **Pasta de rede é o mecanismo preferido**; a VAN Nexxera pega o arquivo da pasta, envia ao banco e
  devolve o retorno na mesma pasta. Um **RPA** entra só se a VAN não fizer o pickup sozinha.
- **NÃO reconstruir CNAB/remessa/retorno/baixa** — o Conexos já faz nativo (homologação bancária já
  paga: há remessa gerada + envio confirmado em produção). Falta só a **ponte de arquivo** +
  orquestração/cadência. A escrita real (fatia futura) reusa o **gating de Permutas**
  (`CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN`, homologação-first).

## Consequências

- Entrega de valor **independente de terceiros**: painel + montagem + gate valem em qualquer cenário
  (envio manual, automático ou baixa direta) — zero risco de escrita.
- O `LotePagamento` FINALIZADO é o **ponto de sutura** limpo para a fatia de transporte: ela lê o
  gate e dirige o `fin015`, sem refazer a montagem.
- A ontologia ganha a **Frente II** (Escopo II) sem contaminar a Frente I; o `ConexosSispagClient`
  isola a superfície SISPAG (read-only) do `ConexosClient` de Permutas.
- Decisões de modelagem abertas (reversibilidade, agrupamento banco/conta) ficam **registradas com
  alternativa** — recalibráveis na fatia futura sem reseed.

## Reuso da Frente I (Permutas)

Doutrina de rascunho persistido (`permuta_alocacao` → `lote_pagamento`), auth/RBAC/auditoria,
concorrência otimista (`versao`), padrão de lote e — na fatia futura — o gating dry-run/HML-first da
escrita irreversível. Não se reinventa nada.
