---
name: elegibilidade-permuta-candidata
type: state-machine
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: partial
status: draft
owners: [yuri]
related_files:
  - src/backend/migrations/0005_estado_casamento_manual.sql
  - src/backend/migrations/0012_estado_permuta_manual.sql
  - src/backend/domain/service/permutas/EleicaoPermutasService.ts
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
last_review: 2026-06-23
states: [DESCOBERTA, ELEGIVEL, CASAMENTO_MANUAL, PERMUTA_MANUAL, BLOQUEADA, EXECUTADA]
out_of_scope_states: []
---

# Estado de Elegibilidade — PermutaCandidata

> Ciclo de vida do **estado de elegibilidade** de uma `PermutaCandidata` nesta fatia
> READ-ONLY. Estados como **constantes tipadas** (nunca strings cruas — P3 / Domain State
> Machines). Cada transição é uma **ação nomeada** com regra explícita e vigência.

## Estados (constantes tipadas)

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `DESCOBERTA` | `'descoberta'` | Adiantamento eleito; ainda não avaliado. |
| `ELEGIVEL` | `'elegivel'` | Passou nos 4 gates **E** tem exatamente 1 INVOICE casada (I3) — auto 1:1. |
| `CASAMENTO_MANUAL` | `'casamento-manual'` | Passou nos **4 gates**, mas o casamento é **N:M** (>1 INVOICE FINALIZADA) **no mesmo processo**: falta **só o analista escolher/alocar a invoice**. **Não é reprovação** (≠ BLOQUEADA). Escopo: motivos `composto-nm` / `multiplas-invoices` (ADR-0005). Mantém o motivo informativo. |
| `PERMUTA_MANUAL` | `'permuta-manual'` | Adto de **cliente-filtro** (importador cadastrado, `ClienteFiltro`/ADR-0007) **pago e com saldo a permutar**, pronto para **permuta manual CROSS-PROCESS** (a invoice vem de OUTRO processo, escolhida pelo analista). **Gate 4 (D.I) NÃO é exigido** — a D.I/data-base virá da invoice escolhida. Motivo informativo: `cliente-filtro`. **Não é reprovação** (≠ BLOQUEADA). |
| `BLOQUEADA` | `'bloqueada'` | Falhou ≥1 gate, sem INVOICE casada (0), ou data-base indisponível. Reportada **com motivo** (taxonomia abaixo), não é falha. **N:M deixou de cair aqui** (→ `CASAMENTO_MANUAL`, ADR-0005); adto de cliente-filtro pago+saldo também sai daqui (→ `PERMUTA_MANUAL`, ADR-0007). |

## Taxonomia de motivos do estado `BLOQUEADA` (P0-5/P0-6/P0-8 — RESOLVIDO)

Toda candidata `bloqueada` carrega um **motivo** (`PermutaCandidata.motivoBloqueio`):

| Motivo | Valor | Origem | Significado |
|--------|-------|--------|-------------|
| Composto N:M | `'composto-nm'` | `casarInvoice` | Várias proformas/invoices no processo — N:M. **Desde ADR-0005, NÃO é mais bloqueio: leva a `CASAMENTO_MANUAL`** (motivo informativo). A escrita final (escolha da invoice) é Fatia 2. |
| Sem invoice | `'sem-invoice'` | `casarInvoice` | 0 INVOICE FINALIZADA no processo (aguardando emissão). **Segue `BLOQUEADA`.** |
| Múltiplas invoices | `'multiplas-invoices'` | `casarInvoice` | >1 INVOICE FINALIZADA (mesma família N:M de `composto-nm`). **Desde ADR-0005 → `CASAMENTO_MANUAL`**, não bloqueio. |
| Falha de gate | `'falha-gate'` | `avaliarElegibilidade` | Falhou algum dos gates 1–4 (tipo / valorPermutar>0 / TOTALMENTE PAGO / D.I XOR DUIMP). |
| Data-base indisponível | `'data-base-indisponivel'` | `avaliarElegibilidade` (Gate 4) | Gate 4 sem D.I **nem** DUIMP — sem âncora de data-base. |
| Detalhe indisponível | `'detail-indisponivel'` | `elegerAdiantamentos` (Gate 2, `getMnyTitPermutar`) | **Blip transiente** do Conexos — a leitura do DETALHE da PROFORMA (`getMnyTitPermutar`) falhou após retries e lançou `ConexosError`. **NÃO é reprovação legítima** (`falha-gate`): a candidata pode ser elegível; ficou bloqueada porque não conseguimos ler o valor a permutar. Re-avaliável na próxima run (idempotente). Introduzido em P0-3. |

### Motivo informativo do estado `PERMUTA_MANUAL` (ADR-0007)

| Motivo | Valor | Origem | Significado |
|--------|-------|--------|-------------|
| Cliente-filtro | `'cliente-filtro'` | `EleicaoPermutasService` (override de roteamento) | O importador (`pesCod`) do adto está no cadastro `ClienteFiltro` **ativo**, e o adto está **pago + com saldo a permutar**. Roteado para permuta manual cross-process em vez de `BLOQUEADA`. A invoice (de outro processo) é escolhida na alocação (`Permuta`/ADR-0008). |

> Nota: `composto-nm` e `multiplas-invoices` pertencem à mesma família (mais de 1 invoice).
> Use `multiplas-invoices` se quiser distinguir do composto N:M de proformas; senão `composto-nm`
> cobre o caso geral de N:M. **ADR-0005 (Yuri, 2026-06-18):** N:M deixou de ser `BLOQUEADA` e
> passou ao estado `CASAMENTO_MANUAL` — os 4 gates passaram; falta só a escolha da invoice pelo
> analista (a baixa/escrita final é Fatia 2). Os motivos `composto-nm`/`multiplas-invoices` viram
> **informativos** (qual sabor de N:M), não bloqueio.

> **`EXECUTADA` agora está EM ESCOPO (Fase 3, ADR-0013).** A alocação rascunho
> (`permuta_alocacao`, ADR-0008) é **consumida** pela ação `reconciliarPermuta`
> (`ReconciliacaoPermutaService`), que executa a **baixa efetiva na `fin010`** via o handshake
> de 5 chamadas (`fin010-write-contract.md`). A escrita é **gated** (flags
> `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`, homologação-first) e idempotente por par adto↔invoice
> (`permuta_alocacao_execucao`, `idempotencia-reconciliacao.md`). O risco #1 deixa de estar intocado.

## Transições

| # | De → Para | Ação (nomeada) | Regra | Vigência |
|---|-----------|----------------|-------|----------|
| T1 | `DESCOBERTA → ELEGIVEL` | `avaliarElegibilidade` + `casarInvoice` | 4 gates satisfeitos **E** exatamente 1 INVOICE casada (I3) — auto 1:1. Gate 4 valida XOR + data-base (`cdiDtaCi`/`dioDtaDesembaraco`; P0-4 RESOLVIDO, probe 2026-06-18). | 2026-06-18 |
| T2 | `DESCOBERTA → BLOQUEADA` | `avaliarElegibilidade` / `casarInvoice` | Qualquer gate falho (`falha-gate`), 0 invoice (`sem-invoice`), sem D.I nem DUIMP (`data-base-indisponivel`), ou detalhe da PROFORMA indisponível após retries (`detail-indisponivel`, P0-3 — blip transiente, não reprovação). Anota `motivoBloqueio`. **N:M NÃO entra mais aqui (→ T3).** | 2026-06-18 |
| T3 | `DESCOBERTA → CASAMENTO_MANUAL` | `avaliarElegibilidade` + `casarInvoice` | **4 gates satisfeitos** mas casamento **N:M** (>1 INVOICE FINALIZADA → `composto-nm` / `multiplas-invoices`) **no mesmo processo**. Falta só o analista alocar a invoice; a baixa é Fase 3. Anota `motivoBloqueio` informativo. **ADR-0005.** | 2026-06-18 |
| T4 | `DESCOBERTA → PERMUTA_MANUAL` | `elegerAdiantamentos` (override `ClienteFiltro`) | Importador do adto está no cadastro `ClienteFiltro` ativo **E** adto `pago && saldoPermutar > 0` (seria `BLOQUEADA`, mas é cliente-filtro). Gate 4 (D.I) dispensado — a invoice cross-process traz a data-base. Motivo informativo `cliente-filtro`. **ADR-0007.** | 2026-06-20 |
| T5 | `{ELEGIVEL, CASAMENTO_MANUAL, PERMUTA_MANUAL} → EXECUTADA` | `reconciliarPermuta` | Alocação(ões) do adto baixadas no ERP `fin010` (handshake de 5 chamadas). Por par adto↔invoice; idempotente (par `settled` é pulado). **Gated** por `CONEXOS_WRITE_ENABLED`+`CONEXOS_DRY_RUN`; dry-run não transiciona. **ADR-0013.** | 2026-06-23 |

```
                  elegerAdiantamentos
                          │
                          ▼
                    ┌───────────┐
                    │ DESCOBERTA│
                    └─────┬─────┘
     ┌──────────┬────────┼──────────────┬─────────────┐
T1 ✓ │     T3 ◐ │   T4 ◓ │         T2 ✗ │             │
(4 gates  (4 gates,  (cliente-filtro   (gate falho /  │
 + 1 INV)  N:M >1 INV  pago + saldo,    0 INVOICE /    │
   │       mesmo proc)  D.I dispensada,  XOR /         │
   │           │        cross-process)   data-base)    │
   ▼           ▼            ▼                ▼          │
┌─────────┐ ┌──────────────────┐ ┌────────────────┐ ┌──────────┐
│ ELEGIVEL│ │ CASAMENTO_MANUAL │ │ PERMUTA_MANUAL │ │ BLOQUEADA│
└─────────┘ └──────────────────┘ └────────────────┘ └──────────┘
   ┊             ┊                     ┊
   ┊             └──────── alocação N:M (Permuta) ───────┘
   ┊                  (distribui saldo em invoices,
   ┊                   ADR-0008/0009 — Fase 2)
   ▼                       ┊
   └────────── T5: reconciliarPermuta (baixa fin010, ADR-0013) ──────────┐
                                                                          ▼
                                                                    ┌──────────┐
                                                                    │ EXECUTADA│  (gated: dry-run ≠ executa)
                                                                    └──────────┘
```

> **CASAMENTO_MANUAL** e **PERMUTA_MANUAL** convergem na **alocação** (entidade `Permuta`,
> `permuta_alocacao`): desde o adendo de **ADR-0009** ambos usam o mesmo mecanismo de
> distribuir o saldo de 1 adiantamento em VÁRIAS invoices (parcial). Diferença: casamento-manual
> busca **o próprio processo** (mesma filial); permuta-manual busca **outro processo**.

## Classificação derivada `tipoPermuta` (apresentação — ADR-0009)

`tipoPermuta` **NÃO é um estado** (não persiste no banco, sem migration). É um rótulo
**derivado** calculado em `GestaoPermutasService` a partir do estado + cardinalidade do
processo, só para as **abas** da área de trabalho:

| Rótulo | Deriva de | Cardinalidade |
|--------|-----------|---------------|
| `simples` | `ELEGIVEL` | 1:1 (auto-casável). |
| `multiplas` | `CASAMENTO_MANUAL` com **1** adto no `priCod` | 1 adto → N invoices (mesmo processo). |
| `cross-over` | `CASAMENTO_MANUAL` com **>1** adto no `priCod` | N adtos ↔ M invoices (mesmo processo). |
| `cross-process` | `PERMUTA_MANUAL` | invoice em OUTRO processo (cliente-filtro). |

Regra de corte (casamento-manual): `nº de adtos casamento-manual no priCod > 1 → cross-over,
senão multiplas`. Por ser derivado, mudar a regra é ajuste de derivação — sem reseed.

## Notas

- Idempotência: re-rodar o job recomputa o estado do zero a cada execução (não há
  persistência de transição no ERP). O snapshot/auditoria por execução é persistido em
  Postgres (I5 / migration-debt O5).
- Aging (âncora = data-base, P0-8 RESOLVIDO; leitura gated em P0-4) é propriedade da candidata,
  não estado — não cria transição.
