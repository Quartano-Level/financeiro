---
name: avaliarElegibilidade
type: action
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-18
preconditions:
  - "Adiantamento eleito por elegerAdiantamentos."
  - "Sessão Conexos ativa."
postconditions:
  - "Cada Adiantamento marcado como aprovado-nos-4-gates ou bloqueado, com o detalhe por gate (auditoria I5)."
  - "Estado da PermutaCandidata transita descoberta → (elegivel | bloqueada) conforme gates + INVOICE casada."
  - "Nenhuma escrita no ERP (I4)."
side_effects:
  - "Leitura detail com298 (getMnyTitPermutar) por candidato — fan-out."
  - "Leitura imp019/imp223 para o Gate 4 (existência/XOR + extração da data-base via cdiDtaCi/dioDtaDesembaraco — P0-4 RESOLVIDO)."
resolved-by:
  - "P0-4 — campo wire da data-base RESOLVIDO (cdiDtaCi imp019 / dioDtaDesembaraco imp223); probe de rede 2026-06-18, filCod=2, 410 adiantamentos reais"
blocked-by:
  - "gate-3-pago-via-detail (NOVO, P1) — fonte wire do status TOTALMENTE PAGO no list vem null (mnyTitAberto/mnyTitPago=null nos 410 reais); provável endpoint de detalhe. Bloqueante p/ a eleição produzir ALGUMA candidata elegível."
---

# avaliarElegibilidade (4 gates)

> **Etapa 2.** Aplica os **4 gates** de elegibilidade a cada `Adiantamento` eleito.
> A elegibilidade só se completa quando, além dos 4 gates, há **INVOICE casada**
> (invariante I3 — feito em conjunto com `casarInvoice`).

## Os 4 gates

| Gate | Regra | Origem (wire) | Notas |
|------|-------|---------------|-------|
| Gate 1 | tipo = PROFORMA | `tpdCod=99` + filtro `docVldTipoAdto=1` (FinDocCab) | P0-3 RESOLVIDO (ação `elegerAdiantamentos`; chave wire confirmada por probe 2026-06-18). |
| Gate 2 | `valorPermutar > 0` | `getMnyTitPermutar(docCod)` | Saldo a permutar disponível (detail endpoint). |
| Gate 3 | TOTALMENTE PAGO | `mnyTitAberto===0` / `pago===1` (`isPago`) | **NOVO GAP `gate-3-pago-via-detail`:** no `com298/list`, `mnyTitAberto`/`mnyTitPago`=`null` (410 reais) → `isPago=false` p/ todos. Fonte real provável = endpoint de **detalhe** (modal financeiro, igual a `mnyTitPermutar`). |
| Gate 4 | D.I **XOR** DUIMP atrelada | `imp019.cdiDtaCi` / `imp223.dioDtaDesembaraco` pelo `priCod` | **P0-4 RESOLVIDO** (probe 2026-06-18): existência/XOR **e** extração da data-base disponíveis. |

## Reuso do ConexosClient

- Gate 2: `ConexosClient.getMnyTitPermutar({ docCod, filCod })`.
- Gate 3: derivado do payload do `com298` já lido (`isPago`) — **porém o list não traz o status
  pago populável** (ver gap `gate-3-pago-via-detail` abaixo).
- Gate 4: `imp019/list` (D.I, `cdiDtaCi`) e `imp223/list` (DUIMP, `dioDtaDesembaraco`) —
  re-introduzidos (ADR-0004); **campo da data-base RESOLVIDO (P0-4, probe 2026-06-18)**.

## Gate 4 — XOR e data-base RESOLVIDOS (P0-4, probe 2026-06-18)

- O **Gate 4 valida a existência/XOR** da declaração (D.I `imp019` **XOR** DUIMP `imp223` pelo
  `priCod`) **e** extrai a **data-base**: `cdiDtaCi` (D.I, epoch-ms) ou `dioDtaDesembaraco` (DUIMP,
  epoch-ms). XOR confirmado em dados reais (cada processo tem uma OU outra). Já plugado em
  `ConexosClient.mapDeclaracaoDataBase`. **A coluna aging agora popula.**
- Sem D.I **nem** DUIMP → `bloqueada` com motivo `data-base-indisponivel`; ambas → anomalia XOR →
  `bloqueada` (`falha-gate` / ver `di-xor-duimp`).
- A âncora do aging (P0-8) está definida como a data-base e a **leitura está disponível** — ver
  `business-rules/aging-anchor.md`. **P0-4 deixa de ser `blocked-by`.**

## NOVO GAP — Gate 3 (TOTALMENTE PAGO) via detalhe (P1, descoberto no probe 2026-06-18)

- No `com298/list`, `mnyTitAberto`/`mnyTitPago` vêm **`null`** nos **410 adiantamentos reais**, então
  `isPago` retorna **`false` para TODOS** — o Gate 3 **bloquearia tudo**. O status "TOTALMENTE PAGO"
  provavelmente mora no **endpoint de detalhe** (modal financeiro do adiantamento), igual ao
  `mnyTitPermutar` (já hidratado via `getMnyTitPermutar` detail).
- Gap **`gate-3-pago-via-detail`**: confirmar a fonte wire do status pago (detail vs list) **antes**
  de a eleição produzir candidatas elegíveis. **Bloqueante** para a feature produzir ALGUMA
  candidata elegível, mas **não** foi escopo do probe de 2026-06-18.

## Motivos de bloqueio (taxonomia)

- `falha-gate` (gates 1–4), `data-base-indisponivel` (gate 4 sem D.I nem DUIMP). Casamento de
  invoice (0/múltiplas → `sem-invoice` / `composto-nm` / `multiplas-invoices`) é de `casarInvoice`.
  Ver `state-machines/elegibilidade-permuta-candidata.md`.

## Postcondição (garantia)

- Toda candidata exposta como **elegível** satisfaz os 4 gates **E** tem INVOICE casada.
  Quem falha qualquer gate (ou tem anomalia XOR / sem declaração) → **bloqueada** com `motivoBloqueio`
  (reportada, não falha).
