---
name: avaliarElegibilidade
type: action
entity: PermutaCandidata
ontology_version: "0.2"
implementation_status: planned
status: draft
owners: [yuri]
related_files: []
last_review: 2026-06-17
preconditions:
  - "Adiantamento eleito por elegerAdiantamentos."
  - "Sessão Conexos ativa."
postconditions:
  - "Cada Adiantamento marcado como aprovado-nos-4-gates ou bloqueado, com o detalhe por gate (auditoria I5)."
  - "Estado da PermutaCandidata transita descoberta → (elegivel | bloqueada) conforme gates + INVOICE casada."
  - "Nenhuma escrita no ERP (I4)."
side_effects:
  - "Leitura detail com298 (getMnyTitPermutar) por candidato — fan-out."
  - "Leitura imp019/imp223 para o Gate 4 (existência/XOR ok; extração da data-base blocked-by P0-4)."
blocked-by:
  - "P0-4 — campo wire da data-base (D.I/DUIMP): Gate 4 valida XOR; EXTRAÇÃO da data fica pendente do probe"
---

# avaliarElegibilidade (4 gates)

> **Etapa 2.** Aplica os **4 gates** de elegibilidade a cada `Adiantamento` eleito.
> A elegibilidade só se completa quando, além dos 4 gates, há **INVOICE casada**
> (invariante I3 — feito em conjunto com `casarInvoice`).

## Os 4 gates

| Gate | Regra | Origem (wire) | Notas |
|------|-------|---------------|-------|
| Gate 1 | tipo = PROFORMA | `tpdCod=99` + filtro `adiantamento=SIM` | P0-3 RESOLVIDO (ação `elegerAdiantamentos`; literal da chave = build-probe). |
| Gate 2 | `valorPermutar > 0` | `getMnyTitPermutar(docCod)` | Saldo a permutar disponível (detail endpoint). |
| Gate 3 | TOTALMENTE PAGO | `mnyTitAberto===0` / `pago===1` (`isPago`) | Adiantamento liquidado. |
| Gate 4 | D.I **XOR** DUIMP atrelada | `imp019` / `imp223` pelo `priCod` | Existência/XOR validável hoje; **extração** da data-base segue `blocked-by: P0-4` (probe). |

## Reuso do ConexosClient

- Gate 2: `ConexosClient.getMnyTitPermutar({ docCod, filCod })`.
- Gate 3: derivado do payload do `com298` já lido (`isPago`).
- Gate 4: `imp019/list` (D.I) e `imp223/list` (DUIMP) — re-introduzidos (ADR-0004);
  **campo da data-base `blocked-by: P0-4`**.

## Gate 4 — XOR resolvido, data-base ainda gated (P0-4)

- O **Gate 4 valida a existência/XOR** da declaração (D.I `imp019` **XOR** DUIMP `imp223` pelo
  `priCod`) **hoje** — isso não depende de P0-4. Sem D.I **nem** DUIMP → `bloqueada` com motivo
  `data-base-indisponivel`; ambas → anomalia XOR → `bloqueada` (`falha-gate` / ver `di-xor-duimp`).
- **`blocked-by: P0-4` (extração da data):** o nome **wire** dos campos de data-base ("data CI"
  da D.I `imp019`; "data de desembaraço" da DUIMP `imp223`) ainda **não** está confirmado — os
  reads foram podados (ADR-0003) e precisam ser re-introduzidos com o nome correto via **probe**.
  **Não chutar.** A âncora do aging já está definida como a data-base (P0-8), mas a **leitura**
  do valor fica pendente do probe — ver `business-rules/aging-anchor.md`.

## Motivos de bloqueio (taxonomia)

- `falha-gate` (gates 1–4), `data-base-indisponivel` (gate 4 sem D.I nem DUIMP). Casamento de
  invoice (0/múltiplas → `sem-invoice` / `composto-nm` / `multiplas-invoices`) é de `casarInvoice`.
  Ver `state-machines/elegibilidade-permuta-candidata.md`.

## Postcondição (garantia)

- Toda candidata exposta como **elegível** satisfaz os 4 gates **E** tem INVOICE casada.
  Quem falha qualquer gate (ou tem anomalia XOR / sem declaração) → **bloqueada** com `motivoBloqueio`
  (reportada, não falha).
