---
adr_number: 0016
title: SISPAG — Ingestão de Pagamentos (carteira PERSISTIDA, cadência diária; detalhe de remessa hidratado AO VIVO no envio)
date: 2026-07-08
status: accepted
type: change
related_entities: [TituloAPagar]
related_actions: [ingerirPagamentos, montarPainelPagamentos]
supersedes_decisions: []
---

# ADR 0016: Ingestão de Pagamentos — carteira SISPAG persistida

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex) · **Branch:** `feat/sispag-ingestao-pagamentos`
**Relacionado:** ADR-0015 (SISPAG Fatia 1+2 — painel read-through + montagem de lote), ADR-0006
(ingestão manual de Permutas), migration-debt **O4** (sem scheduler próprio), **O5/O6** (Postgres +
auditoria). **`entity_changed = true`** (entidade `TituloAPagar` evolui read model → persistida; nova
ação `ingerirPagamentos`). **Fontes:** briefing SISPAG (`_inbox/sispag-briefing.md`), ADR-0015.

## Contexto

No ADR-0015 (spike), a carteira de títulos a pagar (`TituloAPagar`, `fin064` + alçada `com308`) era
um **read model *read-through*** — o painel lia a carteira **ao vivo** do Conexos a cada request. Isso
serviu para validar o painel, mas tem os mesmos limites que a ingestão de Permutas resolveu na Frente
I: sem persistência não há cadência auditável, o painel fica acoplado à latência/disponibilidade do
ERP a cada carga, e não há base estável para a montagem de lote nem para a operação diária.

A Frente I (Permutas) já resolveu exatamente esse problema com a **ingestão** (`elegerAdiantamentos` +
ADR-0006): cron + trigger manual, run de auditoria, advisory-lock/idempotência, snapshot com
anti-fantasma. Esta fatia **aplica o mesmo padrão ao SISPAG** — nada se reinventa.

## Decisões

### D1 — PERSISTIR os dados básicos da carteira (cadência diária)
A ingestão (`ingerirPagamentos`) passa a **persistir** os dados básicos dos títulos a pagar em
`titulo_a_pagar` (migration 0024), chave natural `(fil_cod, doc_cod, tit_cod)`, via **UPSERT** a cada
rodada. Cadência **diária** (cron `job:ingest-pagamentos`) + **trigger manual** (`POST
/sispag/ingestao`), espelhando Permutas. O painel (`montarPainelPagamentos`) passa a **ler do banco**
(`TituloAPagarRepository.listAtivos`); lotes/borderôs nativos seguem lidos **ao vivo** como contexto.

### D2 — Hidratar o DETALHE de remessa AO VIVO, só no envio (anti-drift)
Apenas os **dados básicos** (credor, valor, venc, `aprovado`, `pago`, banco, aging) são persistidos. O
**detalhe pesado de remessa** (modalidade, código de barras, PIX, CNPJ, conta) **NÃO** é persistido —
será lido **ao vivo no envio** (Fatia 3 de transporte). *(Alternativa: persistir o detalhe completo —
rejeitada: o detalhe muda no ERP entre a ingestão e o envio; persistir arriscaria gerar remessa a
partir de dado **stale** (drift). Hidratar no envio garante que o arquivo bancário use a verdade do
ERP no momento.)*

### D3 — `pronto_para_remessa` é heurística INFORMATIVA (não-autoritativa)
A ingestão grava `pronto_para_remessa` como um **palpite** de completude (tem modalidade + destino?),
para dar visibilidade no painel. **Não** é gate de elegibilidade (isso é `aprovado + não pago`, I2) e
**não** substitui a validação de envio. A validação **autoritativa** ocorre **no envio, ao vivo**
(Fatia 3). *(Alternativa: tratar como autoritativo agora — rejeitada: sem o detalhe live não há como
afirmar que a remessa é válida; um falso "pronto" persistido enganaria a operação.)*

### D4 — Anti-fantasma (`ativo`) — espelha o snapshot/stale de Permutas
Títulos que **somem** da run de ingestão mais recente (pagos/cancelados/removidos no ERP) são marcados
`ativo = false` (`TituloAPagarRepository.marcarInativosForaDaRun`) e desaparecem do painel
(`listAtivos`). Evita títulos-fantasma persistidos indefinidamente.

### D5 — Cadência/concorrência/auditoria — reuso de Permutas (ADR-0006)
- **Run de auditoria** por rodada (`pagamento_ingestao_run`: quem/quando/status/`total_titulos`/
  `total_inativados`).
- **Advisory lock** (`IngestLockBusyError` → **HTTP 409**) bloqueia rodada concorrente **sem** gravar
  run de erro (contenção ≠ falha).
- **Idempotência** manual por `Idempotency-Key` (`pagamento_ingestao_idempotency`).
- **Fan-out LIMITADO** (BoundedConcurrency) sobre filiais/páginas do `fin064` — respeita o rate-limit
  do Conexos.

### D6 — READ-ONLY no ERP (I1) mantido
`ConexosSispagClient` segue **só-leitura** (nenhum verbo mutante). Toda a escrita desta fatia é
**LOCAL** (Postgres). A escrita no ERP (remessa/baixa) permanece **deferida** para a Fatia de
transporte, gated como em Permutas.

## Consequências

- O painel diário lê do **banco** — rápido, estável e desacoplado da latência/disponibilidade do ERP
  por request; a carteira ganha **cadência auditável** (quem rodou, quando, quantos títulos/inativados).
- A base persistida é o insumo limpo para a **montagem de lote** (ADR-0015) e para a Fatia de
  transporte, que hidrata o **detalhe** ao vivo no envio — sem risco de drift.
- `aprovado` deixa de ser derivado a cada leitura e passa a ser **persistido** (recalculado na
  ingestão); recalibrável por config (níveis de alçada) sem mudar a estrutura.
- Migration-debt **O4** segue **parcialmente** mitigada: sem scheduler próprio (o cron diário é
  externo), mas com trigger manual cobrindo a necessidade operacional imediata — igual a Permutas.

## Reuso da Frente I (Permutas)

Doutrina de ingestão (`permuta_eleicao_run` → `pagamento_ingestao_run`), snapshot com anti-fantasma
(`permuta_casamento` stale → `titulo_a_pagar.ativo`), advisory-lock/idempotência (ADR-0006),
run de auditoria (I5/O6), auth/RBAC. Não se reinventa nada — o padrão de ingestão validado na Frente I
é transplantado para o SISPAG.
