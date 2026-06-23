---
name: Permuta
type: entity
ontology_version: "0.2"
implementation_status: partial
status: draft
owners: [yuri]
related_files:
  - src/backend/migrations/0014_permuta_alocacao.sql
  - src/backend/domain/repository/permutas/PermutaAlocacaoRepository.ts
  - src/backend/domain/service/permutas/AlocacaoPermutasService.ts
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
  - src/backend/routes/permutas.ts
  - src/frontend/app/permutas/page.tsx
properties:
  - adiantamentoDocCod
  - invoiceDocCod
  - invoicePriCod
  - valorAlocado
  - moeda
  - variacaoClassificacao
  - variacaoResultado
  - variacaoDelta
  - taxaAdiantamento
  - taxaInvoice
  - criadoPor
relationships:
  - "Permuta N—1 Adiantamento (lado-débito, via adiantamentoDocCod — links livres, NÃO assume priCod igual)"
  - "Permuta N—1 Invoice (lado-crédito, via invoiceDocCod — pode ser de OUTRO processo, cross-process)"
  - "Permuta 1—1 VariacaoCambial (derivada pela taxa da invoice sobre o valor PARCIAL alocado)"
  - "Permuta *—1 PermutaCandidata (a candidata em permuta-manual/casamento-manual é a origem da alocação)"
last_review: 2026-06-22
universality_evidence:
  - "ADR-0008 — alocação manual N:M cross-process (a Permuta consumada nasce como ALOCAÇÃO)"
  - "ADR-0010 — o auto-casamento Simples também ficou PARCIAL (mesma semântica de teto/residual)"
  - "ADR-0004 — a Permuta consumada já era backlog explícito da Fatia 2 (Etapa 6 / BAIXAS PERMUTAS)"
  - "docs-contexto/03_ontologia_financeiro.md §2 Frente I — reconciliação PROFORMA × INVOICE"
  - "ontology/glossary.md — 'Permuta' (reconciliação adiantamento ↔ invoice)"
  - "Columbia + INOX-TECH (priCod=1153): cross-process N:M validado com o time (2026-06-20), 290 adtos + 21 invoices, 0 D.I no processo"
  - "Conceito universal de comex: abater o adiantamento (PROFORMA) contra a fatura (INVOICE) definitiva, com variação cambial"
---

# Permuta (consumada / alocação)

> A **Permuta consumada**: a reconciliação efetiva entre um `Adiantamento` (PROFORMA,
> lado-débito) e uma `Invoice` (lado-crédito). Materializada como uma **ALOCAÇÃO
> rascunho** (`permuta_alocacao`) — o analista monta quem-casa-com-quem e por quanto;
> a **baixa final no ERP** (`fin010`, ação `reconciliarPermuta`) é a **Fase 3** (ADR-0013),
> agora **implementada** (handshake de 5 chamadas, write-ahead em `permuta_alocacao_execucao`),
> mas **gated**: roda em **dry-run por padrão** e a escrita real exige `CONEXOS_WRITE_ENABLED`
> + `CONEXOS_DRY_RUN=false`, validada em homologação primeiro. Segue `implementation_status: partial`
> até a validação em produção do 1º caso real.

## Por que "Permuta" e não mais "candidata"

A `PermutaCandidata` modela a **pendência elegível** (a sugestão automática 1:1 e a
sinalização de N:M). A `Permuta` modela o **ato de reconciliar** — a decisão humana de
abater X do adiantamento A contra a invoice B. Desde **ADR-0008**, essa decisão é
persistida como **alocação** (`permuta_alocacao`), que **sobrevive à re-ingestão** (≠
`permuta_casamento`, recomputada por run). É a semente da baixa no ERP.

A `Permuta` nasce a partir de uma `PermutaCandidata` em estado **`permuta-manual`**
(cross-process, cliente-filtro, ADR-0007) **ou** **`casamento-manual`** (N:M no mesmo
processo, ADR-0005). Desde o adendo de **ADR-0009** (2026-06-21), os dois tipos usam o
**mesmo mecanismo de alocação** — a diferença é só o escopo de busca da invoice
(próprio processo vs outro processo).

## Definição de domínio

Uma `Permuta` é um **link adto↔invoice com valor parcial** em moeda negociada (USD). A
reconciliação é **N:M e incremental**: um adiantamento pode abater parte de várias
invoices; uma invoice pode ser composta por vários adiantamentos. O saldo pode ficar
**parcialmente em aberto** (alocação incremental — não exige fechamento exato).

> **Nota (ADR-0010):** a semântica **parcial + teto da invoice** deixou de ser exclusiva do fluxo
> manual (`permuta_alocacao`). O **auto-casamento Simples** (1 invoice : N adtos, `permuta_casamento`,
> recomputado por run) passou a distribuir o em-aberto vivo da invoice de forma **greedy** com teto e a
> deixar saldo residual em aberto — ver `entities/permuta-candidata.md` e
> `business-rules/distribuicao-simples-greedy`. Ambos os fluxos seguem **READ-ONLY** no ERP.

## Propriedades

| Propriedade | Tipo | Origem (wire/coluna) | Notas |
|-------------|------|----------------------|-------|
| `adiantamentoDocCod` | string | `permuta_alocacao.adiantamento_doc_cod` | Lado-débito (PROFORMA). Parte da UNIQUE `(adto, invoice)`. |
| `invoiceDocCod` | string | `permuta_alocacao.invoice_doc_cod` | Lado-crédito (INVOICE). Parte da UNIQUE `(adto, invoice)`. |
| `invoicePriCod` | string? | `permuta_alocacao.invoice_pri_cod` | Processo da invoice — **pode diferir** do processo do adto (cross-process). Para `casamento-manual` DEVE igualar o priCod do adto (trava de escopo, ADR-0009). |
| `valorAlocado` | number | `permuta_alocacao.valor_alocado` | Valor PARCIAL em **moeda negociada (USD)**. Σ por adto ≤ saldo a permutar; Σ por invoice ≤ valor em aberto. |
| `moeda` | string? | `permuta_alocacao.moeda` | Moeda negociada — **igual** nos dois lados (trava de moeda, ADR-0009; não permuta USD × BRL). |
| `variacaoClassificacao` | enum? | `permuta_alocacao.variacao_classificacao` | `juros \| desconto` (ver `business-rules/classificacao-juros-desconto`). |
| `variacaoResultado` | number? | `permuta_alocacao.variacao_resultado` | Resultado da variação cambial sobre o valor parcial. |
| `variacaoDelta` | number? | `permuta_alocacao.variacao_delta` | `valorAlocado × (taxaAdiantamento − taxaInvoice)`. |
| `taxaAdiantamento` | number? | `permuta_alocacao.taxa_adiantamento` | Taxa de câmbio do adiantamento. |
| `taxaInvoice` | number? | `permuta_alocacao.taxa_invoice` | Taxa de câmbio da invoice (data-base = D.I da invoice). |
| `criadoPor` | string? | `permuta_alocacao.criado_por` | Auditoria (I5): analista que montou a alocação. |

## Invariantes aplicáveis

- **I-Permuta-1 (saldo do adto):** `Σ(valorAlocado por adiantamento) ≤ saldo a permutar do adto`
  (moeda negociada = `saldoPermutar(BRL) / taxa`). Excesso → `AlocacaoSaldoError` (HTTP 422).
- **I-Permuta-2 (saldo da invoice):** `Σ(valorAlocado por invoice) ≤ valor em aberto da invoice`.
  Excesso → `AlocacaoSaldoError` (HTTP 422).
- **I-Permuta-3 (mesma filial):** adto e invoice na **mesma filial** — o `priCod` não é único
  entre filiais; a busca é escopada por `filCod` do adiantamento (ADR-0009, correção crítica).
- **I-Permuta-4 (mesma moeda):** moeda negociada **igual** nos dois lados (ADR-0009).
- **I-Permuta-5 (invoice com D.I):** a invoice escolhida DEVE ter **D.I/DUIMP em aberto** — a
  data-base/variação cambial vem dela (o adto do cliente-filtro não tem D.I). Invoice sem D.I é
  omitida da busca (ADR-0007/0008).
- **I4 (sem escrita no ERP):** a alocação é rascunho na tabela própria; **nenhuma** baixa no
  `fin010` ainda. Ver "Fora de escopo".

## Cardinalidade

N:M com valores parciais. Cada linha de `permuta_alocacao` é **um** par adto↔invoice (UNIQUE);
a permuta completa de um adiantamento é o **conjunto** de suas alocações. `GestaoPermutasService`
calcula `saldoRestante` (saldo − Σ alocado) e expõe as `alocacoes` por adiantamento.

## Fonte de leitura (Conexos)

- `AlocacaoPermutasService.buscarInvoices(priCod, filCod)` — busca LIVE de invoices por processo
  (escopada à filial), enriquece valor/taxa negociada (`com308`), valida D.I (`imp019`/`imp223`).
- A alocação em si é persistida **localmente** (`permuta_alocacao`), não no ERP.

## Fase 3 — write-back `fin010` (implementado, gated)

- A **baixa/reconciliação efetiva** no ERP Conexos (`fin010`, BAIXAS PERMUTAS, Etapa 6) é a
  **Fase 3** (ADR-0013) — o risco arquitetural #1. Antes "intocado"; agora **implementado e
  validado-em-homologação**, ainda **gated** por flags (`CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN`).
- A ação **`reconciliarPermuta`** (`ReconciliacaoPermutaService`) consome as alocações de um
  adiantamento e executa a baixa **adto a adto** via o **handshake de 5 chamadas** do `fin010`
  (`fin010-write-contract.md`). Write-ahead + idempotência em `permuta_alocacao_execucao`
  (`idempotencia-reconciliacao.md`).
- **Anti-super-pagamento:** o valor a baixar vem do **em-aberto vivo do ERP** (passo 2), não do
  rascunho local; em-aberto ≤ 0 → aborta.
- **Pendente de validação em produção:** o 1º caso real controlado (reversível, com o analista
  acompanhando). Casos ainda não observados no ERP: baixa **parcial** (invoice N:M), finalização do
  borderô, `DESCONTO`.
