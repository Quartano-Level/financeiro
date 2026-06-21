---
adr_number: 0007
title: Cliente-filtro + estado `permuta-manual` (permuta múltipla manual cross-process)
date: 2026-06-20
status: accepted
type: addition
related_entities: [PermutaCandidata, Adiantamento]
related_actions: [avaliarElegibilidade, elegerAdiantamentos]
supersedes_decisions: []
---

# ADR 0007: Cliente-filtro + estado `permuta-manual` (Permutas, Frente I — Fase 1)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex)
**Relacionado:** ADR-0004 (modelagem Fatia 1), ADR-0005 (`casamento-manual`),
state-machine `elegibilidade-permuta-candidata`, exploração
`ontology/_inbox/permutas-nm-exploracao.md`
**Branch:** `feat/permutas-multiplas`

## Contexto

Validado com o time (2026-06-20): clientes como a **INOX-TECH** (processo 1153) têm adiantamentos que
**não casam com invoice no próprio processo** — a invoice vem de **outro processo**, escolhida
**manualmente** pelo analista (permuta múltipla cross-process). Probes no Conexos confirmaram: 1153 tem
290 adtos + 21 invoices, mas **0 D.I/DUIMP**. Hoje esses adtos caem como `bloqueada /
data-base-indisponivel` (57% do backlog), poluindo o painel.

Esses clientes são recorrentes e conhecidos — o analista quer **cadastrá-los** para a pipeline tratá-los
à parte.

## Decisão

### 1. Cadastro de "cliente filtro" (por IMPORTADOR)
Nova tabela/entidade de configuração `cliente_filtro` (chave = `pesCod` do importador, `imp021`),
mantida pelo analista no frontend. Filtro por **importador** (não por "sem D.I" — são coisas distintas:
"sem invoice no processo" ≠ "sem D.I"; e o mesmo importador pode ter vários processos).

### 2. Novo estado `PERMUTA_MANUAL` (`'permuta-manual'`)
Quinto estado da máquina de elegibilidade da `PermutaCandidata`:
`descoberta | elegivel | casamento-manual | permuta-manual | bloqueada`. Significa: adto de
cliente-filtro **pago e com saldo a permutar**, pronto para **permuta manual cross-process** (a invoice
vem de outro processo, escolhida pelo analista na Fatia 2). Motivo informativo: `cliente-filtro`.

### 3. Regra de roteamento (na eleição)
Para um adto cujo importador está no cadastro:
`BLOQUEADA && pago && saldoPermutar > 0` → **`permuta-manual`**. Os demais não são tocados:
`nao-pago`/`sem-saldo` continuam bloqueados (a manual exige pago + saldo); `elegivel`/`casamento-manual`/
`ja-permutado` ficam como estão. **Gate 4 (D.I) NÃO é exigido na manual** — a D.I/data-base virá da
**invoice escolhida** (confirmado com o analista: "o documento da invoice deve ter D.I"); na permuta
**automática** o Gate 4 segue obrigatório.

### 4. Cross-process é Fatia 2
Esta fase apenas **sinaliza e enfileira** (estado + KPI/filtro + cadastro). A **busca de invoice por
número de processo** (live no Conexos), a **alocação N:M** com valores parciais e a **escrita** ficam
para a Fatia 2.

### 5. Back-compat do snapshot (`/painel`)
A coluna `permuta_candidata_snapshot.status` (0001) segue `elegivel | bloqueada`; `permuta-manual`
colapsa para `bloqueada` no snapshot (igual ao `casamento-manual`, ADR-0005 §4). O modelo relacional
(`/gestao`) carrega o estado real (migration `0012` estende a CHECK).

## Consequências

- **Backlog honesto:** os adtos da INOX saem de "bloqueada" e viram fila "permuta manual" (KPI/filtro
  próprio, cor violeta distinta). 57% do backlog deixa de ser ruído.
- **Importador persistido:** `pes_cod`/`importador` hidratados na eleição (`imp021`) e gravados no fato
  (migrations `0011`), também úteis para o seletor do cadastro e exibição.
- **Sem escrita no ERP** (I4 intocado); risco #1 (write-back `fin010`) só na Fatia 3.

## Alternativas descartadas

- **Filtrar por "sem D.I":** rejeitado — pega 93 adtos que não são o caso e perde exceções; o traço
  definidor é o CLIENTE, não a ausência de D.I.
- **Reusar `casamento-manual`:** rejeitado — casamento-manual é N:M **no mesmo processo**; permuta-manual
  é **cross-process** com gates relaxados. Estados distintos.
- **Relaxar o Gate 4 globalmente:** rejeitado — a permuta automática continua exigindo D.I; só a manual
  (julgamento do analista + auditoria) dispensa.
