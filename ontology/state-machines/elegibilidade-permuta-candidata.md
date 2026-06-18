---
name: elegibilidade-permuta-candidata
type: state-machine
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-18
states: [DESCOBERTA, ELEGIVEL, BLOQUEADA]
out_of_scope_states: [EXECUTADA]
---

# Estado de Elegibilidade — PermutaCandidata

> Ciclo de vida do **estado de elegibilidade** de uma `PermutaCandidata` nesta fatia
> READ-ONLY. Estados como **constantes tipadas** (nunca strings cruas — P3 / Domain State
> Machines). Cada transição é uma **ação nomeada** com regra explícita e vigência.

## Estados (constantes tipadas)

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `DESCOBERTA` | `'descoberta'` | Adiantamento eleito; ainda não avaliado. |
| `ELEGIVEL` | `'elegivel'` | Passou nos 4 gates **E** tem INVOICE casada (I3). |
| `BLOQUEADA` | `'bloqueada'` | Falhou ≥1 gate, sem INVOICE casada (0/múltiplas), caso N:M, ou data-base indisponível. Reportada **com motivo** (taxonomia abaixo), não é falha. |

## Taxonomia de motivos do estado `BLOQUEADA` (P0-5/P0-6/P0-8 — RESOLVIDO)

Toda candidata `bloqueada` carrega um **motivo** (`PermutaCandidata.motivoBloqueio`):

| Motivo | Valor | Origem | Significado |
|--------|-------|--------|-------------|
| Composto N:M | `'composto-nm'` | `casarInvoice` | Várias proformas/invoices no processo — N:M existe e é frequente, mas é **backlog** nesta fatia (não processado). |
| Sem invoice | `'sem-invoice'` | `casarInvoice` | 0 INVOICE FINALIZADA no processo (aguardando emissão). |
| Múltiplas invoices | `'multiplas-invoices'` | `casarInvoice` | >1 INVOICE FINALIZADA quando se quer distinguir de `composto-nm` (mesma família N:M). |
| Falha de gate | `'falha-gate'` | `avaliarElegibilidade` | Falhou algum dos gates 1–4 (tipo / valorPermutar>0 / TOTALMENTE PAGO / D.I XOR DUIMP). |
| Data-base indisponível | `'data-base-indisponivel'` | `avaliarElegibilidade` (Gate 4) | Gate 4 sem D.I **nem** DUIMP — sem âncora de data-base. |
| Detalhe indisponível | `'detail-indisponivel'` | `elegerAdiantamentos` (Gate 2, `getMnyTitPermutar`) | **Blip transiente** do Conexos — a leitura do DETALHE da PROFORMA (`getMnyTitPermutar`) falhou após retries e lançou `ConexosError`. **NÃO é reprovação legítima** (`falha-gate`): a candidata pode ser elegível; ficou bloqueada porque não conseguimos ler o valor a permutar. Re-avaliável na próxima run (idempotente). Introduzido em P0-3. |

> Nota: `composto-nm` e `multiplas-invoices` pertencem à mesma família (mais de 1 invoice).
> Use `multiplas-invoices` se quiser distinguir do composto N:M de proformas; senão `composto-nm`
> cobre o caso geral de N:M. Yuri (P0-5/P0-6) fixou que **N:M é backlog nesta fatia**.

> **`EXECUTADA` está FORA DE ESCOPO.** A transição para uma `Permuta` consumada (baixa na
> `fin010`) pertence à **Fatia 2** e **não** é modelada aqui — incluí-la exigiria o caminho
> de escrita no ERP, que não existe/não foi validado (ADR-0002/0003 O3). Listada apenas como
> `out_of_scope_states` para sinalizar a continuidade.

## Transições

| # | De → Para | Ação (nomeada) | Regra | Vigência |
|---|-----------|----------------|-------|----------|
| T1 | `DESCOBERTA → ELEGIVEL` | `avaliarElegibilidade` + `casarInvoice` | 4 gates satisfeitos **E** INVOICE casada (I3). Gate 4 valida XOR + data-base (`cdiDtaCi`/`dioDtaDesembaraco`; P0-4 RESOLVIDO, probe 2026-06-18). | 2026-06-18 |
| T2 | `DESCOBERTA → BLOQUEADA` | `avaliarElegibilidade` / `casarInvoice` | Qualquer gate falho (`falha-gate`), 0 invoice (`sem-invoice`), >1 invoice / N:M (`composto-nm` / `multiplas-invoices`), sem D.I nem DUIMP (`data-base-indisponivel`), ou detalhe da PROFORMA indisponível após retries (`detail-indisponivel`, P0-3 — blip transiente, não reprovação). Anota `motivoBloqueio`. | 2026-06-18 |

```
        elegerAdiantamentos
                │
                ▼
          ┌───────────┐
          │ DESCOBERTA│
          └─────┬─────┘
       T1 ✓     │     T2 ✗
   (4 gates +   │   (gate falho /
   INVOICE)     │    sem INVOICE /
                │    anomalia XOR)
        ┌───────┴────────┐
        ▼                ▼
   ┌─────────┐     ┌──────────┐
   │ ELEGIVEL│     │ BLOQUEADA│
   └─────────┘     └──────────┘
        ┊
        ┊  (Fatia 2 — FORA DE ESCOPO)
        ▼
   [ EXECUTADA → Permuta consumada / fin010 ]
```

## Notas

- Idempotência: re-rodar o job recomputa o estado do zero a cada execução (não há
  persistência de transição no ERP). O snapshot/auditoria por execução é persistido em
  Postgres (I5 / migration-debt O5).
- Aging (âncora = data-base, P0-8 RESOLVIDO; leitura gated em P0-4) é propriedade da candidata,
  não estado — não cria transição.
