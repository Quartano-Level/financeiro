---
adr_number: 0013
title: Write-back fin010 (Fase 3) — baixa/permuta efetiva no ERP, homologação-first + write-ahead
date: 2026-06-23
status: accepted
type: change
related_entities: [Permuta, Adiantamento, Invoice, VariacaoCambial]
related_actions: [reconciliarPermuta]
supersedes_decisions: []
---

# ADR 0013: Write-back `fin010` (Fase 3) — a primeira ESCRITA do sistema no Conexos

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/permutas-reconciliacao`
**Relacionado:** ADR-0002/0003 (risco arquitetural #1 — write-back não validado), ADR-0008 (alocação N:M),
`business-rules/fin010-write-contract.md`, `business-rules/idempotencia-reconciliacao.md`.

## Contexto

Até aqui o sistema era **READ-ONLY no Conexos** (`ConexosClient`: 13 métodos de leitura, 0 de escrita). A
alocação (`permuta_alocacao`) é um rascunho que vive só no nosso Postgres; o botão "Processar" apenas grava
`status='processado'`. A **baixa efetiva** da permuta no ERP (`fin010`, BAIXAS PERMUTAS) nunca foi feita nem
validada — o **risco arquitetural #1** (ADR-0002/0003 O3).

O contrato de escrita foi obtido por **engenharia reversa de um HAR real** (uma baixa/permuta manual de um
analista, 2026-06-23). Descoberta-chave: a baixa **não é um POST único**, é um **handshake de 5 chamadas**
(criar borderô → validar título da invoice → validar título da permuta → recalcular líquido → gravar baixa).
Detalhe completo em `fin010-write-contract.md`.

## Decisão

Modelar e implementar a ação **`reconciliarPermuta`** (`ReconciliacaoPermutaService`), que consome as
alocações de um adiantamento e executa a baixa/permuta no `fin010` — **adto a adto** (um borderô, N pares
adto→invoice), espelhando o fluxo manual. Decisões travadas:

1. **Homologação-first.** Nenhuma escrita em produção antes de validada em
   `https://columbiatrading-hml.conexos.cloud` (mesmas credenciais/`filCod`). `CONEXOS_BASE_URL` aponta o
   ambiente; o resto do código não muda.
2. **Guard-rails por omissão.** Duas flags: `CONEXOS_WRITE_ENABLED` (default `false`) e `CONEXOS_DRY_RUN`
   (default `true`). Escrita real exige **ambas** ligadas (`writeEnabled=true` E `dryRun=false`). Sem isso,
   o serviço roda em **dry-run**: monta e loga o payload **sem POST** (gate de validação humano).
3. **Write-ahead + auditoria.** Tabela `permuta_alocacao_execucao`: a intenção é gravada (`reconciling`)
   **antes** do POST; vira `settled` só com a confirmação (`bxaCodSeq`) do ERP; falha vira `error` com a
   resposta crua, para reconciliação manual. (Endereça os cards de fault-tolerance "alocar sem transação"
   e "reconciliação".)
4. **Idempotência por par adto↔invoice** (`idempotency_key = permuta:{adto}:{invoice}`). Par já `settled`
   é **pulado**; retry após `error` reusa a mesma chave. Ver `idempotencia-reconciliacao.md`.
5. **Anti-super-pagamento delegado ao ERP.** O valor a baixar (`bxaMnyValor`) **vem do passo 2** (em-aberto
   vivo do Conexos), não do nosso `valor_alocado`. Se o ERP devolve em-aberto ≤ 0 → **aborta** (provável já
   baixado). Não fazemos aritmética de moeda arriscada: o ERP é a fonte da verdade do valor.
6. **Conta de juros = 131** (VARIAÇÃO CAMBIAL PASSIVA REALIZADA) para `JUROS`; `DESCONTO` vai em
   `bxaMnyDesconto` com a conta gerencial que o ERP devolve. Ver `classificacao-juros-desconto.md`.

## Consequências

- O estado **`EXECUTADA`** entra na máquina de estados da permuta (sai de `out_of_scope_states`); a ação
  `reconciliarPermuta` sai de `planned` → `partial`.
- Novo endpoint `POST /permutas/adiantamentos/:docCod/reconciliar` (admin + heavyRouteLimiter) e
  `GET .../execucoes` (trilha de status). Novo `ConexosClient`: `criarBordero`, `validarTituloBaixa`,
  `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta` (reusam `postGeneric` →
  `authenticatedPost`: sid + cnx-filcod + cnx-usncod + retry-em-401).
- O risco #1 deixa de ser "intocado": passa a **validado-em-homologação, dry-run-por-padrão**. A escrita em
  produção continua **gated** (flags) e exige uma execução real controlada, com o analista capaz de estornar.

## Pontos abertos (validar em campo)
- **Invoice compartilhada / baixa parcial.** O HAR cobriu 1 adto → 1 invoice cheia. O comportamento do
  `fin010` para baixa **parcial** (invoice N:M) ainda não foi observado; tratado como follow-up.
- **Finalização do borderô.** O HAR ficou com `borVldFinalizado:0` (borderô aberto); confirmar se a permuta
  exige um passo explícito de "finalizar".
- **DESCONTO.** O HAR demonstrou `JUROS` (conta 131). O caminho de `DESCONTO` (conta gerencial 94) está
  implementado por simetria mas ainda não validado contra o ERP.

## Alternativas descartadas
- **Um único POST inferido do DOM:** rejeitado — o DOM Angular esconde o handshake; só o HAR revelou as 5
  chamadas e a ordem de dependência (o `borCod` do passo 1 encadeia os demais).
- **Transação de banco abrangendo o POST do ERP:** impossível (o ERP não participa do nosso commit). O
  **write-ahead** é o substituto: registra intenção antes, concilia depois.
- **Escrever direto em produção para "testar rápido":** rejeitado — risco #1; homologação-first + dry-run.
