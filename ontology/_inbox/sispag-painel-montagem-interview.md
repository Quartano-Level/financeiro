# Feature spec — SISPAG Painel + Montagem de Lote + Gate (Fatia 1+2)

> **Pipeline:** `/feature-new` · **Modo:** entrevista consolidada (contexto já levantado em
> `sispag-briefing.md` + diagnóstico ao vivo). **Escopo confirmado (2026-07-07):** painel read-only +
> montagem assistida do lote + gate de finalização. **ZERO escrita no Conexos.**
> **`entity_changed = true`** (nova entidade `LotePagamento` + máquina de estados).
> **Branch:** `feat/sispag-painel-montagem`.

## Intenção de negócio (1–2 frases)
Dar à analista **visibilidade diária dos títulos a pagar aprovados** (a vencer + vencidos, com valor e
aging) e deixá-la **montar um lote candidato** (incluir/remover títulos) e **finalizá-lo** (gate). O lote
finalizado é o "pronto para processar" — o processamento real (remessa/pasta/baixa) é a **próxima
feature**, dependente de terceiros. Aqui nada toca o ERP: é leitura + estado local + auditoria.

## Eixo 1 — ENTIDADES

| Entidade | Papel | Persistência |
|---|---|---|
| **TituloAPagar** (read model) | título a pagar do ERP (credor, valor, vencimento, aprovado, banco). Fonte `fin064`. | **não** persistido (read-through Conexos) |
| **LotePagamento** *(NOVA)* | lote candidato montado pela analista. Agrupa títulos de **uma filial**. | **persistido** (`lote_pagamento`) |
| **ItemLote** *(NOVA)* | um título dentro de um lote (snapshot de valor/venc no momento da inclusão). | **persistido** (`lote_pagamento_item`) |
| LoteSispag / BorderoAPagar (nativos) | leitura de contexto (abas do painel) — já no spike. | não |

## Eixo 2 — AÇÕES

- **montarPainelPagamentos** (read) — expõe títulos a pagar (janela −15d..+45d) + KPIs + lotes nativos + borderôs. *(já no spike; formaliza)*
- **criarLoteCandidato** — abre um lote `RASCUNHO` para uma filial (opcional: banco/conta).
- **incluirTituloNoLote** / **removerTituloDoLote** — analista ajusta o lote (só título **aprovado + não pago**).
- **finalizarLote** *(GATE)* — marca o lote `FINALIZADO` (registra quem/quando). É o gatilho conceitual; **sem downstream nesta fatia**.
- **reabrirLote** — `FINALIZADO → RASCUNHO` (enquanto não houver processamento — que não existe aqui).
- **cancelarLote** — descarta um lote candidato.
- **listarLotesCandidatos** — lê os lotes nossos (com filtro por status/filial).

## Eixo 3 — INVARIANTES

- **I1 (read-only ERP):** nenhuma escrita no Conexos nesta fatia. O `ConexosSispagClient` continua só-leitura (nenhum verbo mutante importado).
- **I2 (elegibilidade do item):** um título só entra no lote se **aprovado** (`liberado` = alçada `titVld1/2/3libera`) e **não pago**. Título não-aprovado/pago é bloqueado com mensagem.
- **I3 (não-duplicação):** um mesmo título (`filCod:docCod:titCod`) **não pode estar em dois lotes RASCUNHO ao mesmo tempo**. UNIQUE parcial.
- **I4 (uma filial por lote):** todos os itens de um lote são da **mesma filial** (compatível com o `fin015` nativo, que é por filial/banco). Multi-filial = múltiplos lotes.
- **I5 (gate reversível):** `finalizarLote` é reversível por `reabrir` **enquanto** não houver etapa downstream (não há nesta fatia). Toda transição registra ator + timestamp (auditoria).
- **I6 (concorrência):** montagem/finalização são idempotentes e seguras a 2 analistas (advisory lock / versão otimista, espelhando Permutas).
- **RNF:** multi-filial, trilha de auditoria (quem incluiu/removeu/finalizou), autenticação + RBAC.

## Eixo 4 — INTEGRAÇÃO

- **Conexos:** **READ apenas** (`fin064` títulos, `fin015` lotes nativos, `fin010` borderôs) via `ConexosSispagClient` (já existe).
- **Postgres:** NOVAS tabelas `lote_pagamento` (id, fil_cod, banco?, conta?, status, criado_por, finalizado_por, finalizado_em, versão) + `lote_pagamento_item` (lote_id, fil_cod, doc_cod, tit_cod, credor, valor, vencimento, incluido_por) + UNIQUE parcial (I3). Migration nova.
- **Auth/RBAC:** leituras autenticadas (qualquer usuário); montar/incluir/finalizar/cancelar = `requireRole('admin')` (espelha Permutas). Auditoria persistida.
- **FORA DE ESCOPO (próxima feature):** gerar remessa (dirigir `fin015`), escrever/ler arquivo em **pasta de rede**, **Nexxera/VAN**, retorno + baixa (`fin052`/`fin010` write), **scheduler** de cadência diária. Riscos O4/O7 permanecem abertos.

## Máquina de estados — `LotePagamento`
```
        criarLoteCandidato
              │
              ▼
        ┌───────────┐  finalizarLote   ┌────────────┐
        │  RASCUNHO │ ───────────────▶ │ FINALIZADO │
        └───────────┘ ◀─────────────── └────────────┘
              │           reabrirLote          │
              │ cancelarLote                   │ cancelarLote
              ▼                                ▼
                         ┌───────────┐
                         │ CANCELADO │  (terminal)
                         └───────────┘
```
Status como constantes tipadas; cada transição = ação nomeada com regra + registro de vigência (P3 da ontologia).

## Definition of Done (desta fatia)
- Painel read-only servido por `GET /sispag/painel` (já verde) + formalizado na ontologia.
- CRUD de lote candidato (criar/incluir/remover/finalizar/reabrir/cancelar) via `/sispag/lotes*`, tudo com Zod no boundary, `requireRole('admin')` nas mutações, SQL parametrizado, auditoria.
- Tabelas + migration idempotente; UNIQUE parcial (I3).
- Frontend `/sispag`: painel + **seleção → criar/editar lote** + **finalizar (gate)** + lista de lotes candidatos, com banner "sem escrita no ERP".
- Gates verdes (typecheck/lint/test/PatternGuardian) + ontology diff (entity_changed) + DesignSystemReviewer (UI) + Regis-Review (P0 zerado).
- **Nenhuma** chamada de escrita ao Conexos em todo o delta.

## Perguntas em aberto (NÃO bloqueiam esta fatia — são da próxima)
- Caminho da pasta de rede (Flávia/Ricardo) · contrato Nexxera cobre pagamento (Ricardo) · acesso HML.
- Agrupamento do lote: por filial só, ou filial+banco+conta? (nesta fatia: filial; banco/conta opcionais como metadados).
