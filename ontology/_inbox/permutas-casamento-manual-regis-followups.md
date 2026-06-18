# Regis-Review follow-ups — Permutas `casamento-manual` (ADR-0005)

**Run:** `docs/regis-review/2026-06-18-2158/` · **Branch:** `feat/permutas-painel-elegiveis`
**Gate result:** **0 P0** — PR não bloqueado. P1/P2/P3 abaixo (não implementados nesta execução,
por política do gate: só P0 re-entra no loop).

Scope da review (quick, escopado ao diff): Modifiability 7.5/10 · Fault-Tolerance · Testability 7/10.

---

## P1 — Divergência total-da-run × contagem-do-snapshot (Fault-Tolerance F-1)

**Problema.** `EleicaoPermutasService.computeCandidatas` (`src/backend/domain/service/permutas/EleicaoPermutasService.ts:226-228`)
computa `totalBloqueadas` / `bloqueadasByMotivo` filtrando **só** por `ESTADO_ELEGIBILIDADE.BLOQUEADA`
— após ADR-0005, isso **exclui** os N:M (agora `casamento-manual`). Mas a gravação do snapshot
(`PermutaSnapshotRepository.insertCandidataChunk`, `:247-250`) mapeia `casamento-manual → 'bloqueada'`
na coluna `status`. Resultado, por run R:
- `permuta_eleicao_run.total_bloqueadas = B`
- `COUNT(permuta_candidata_snapshot WHERE run_id=R AND status='bloqueada') = B + N`
- `bloqueadas_by_motivo` perde `composto-nm` / `multiplas-invoices`.
- `PainelService.exporNoPainel` (`:59`) re-conta o snapshot → mostra `B+N`, contradizendo o
  cabeçalho da própria run.

**Por que não é P0.** Nenhum dinheiro se move, nenhuma escrita dupla, nenhuma perda silenciosa de
linha (todas as candidatas N:M continuam persistidas, com o motivo). É uma inconsistência de
**auditoria/relato** entre o cabeçalho da run e o snapshot — e o `/painel` mostra N:M como bloqueada
**por design** (ADR-0005 §4). Mas o cabeçalho de auditoria fica "mentindo" sobre o próprio snapshot.

**Melhoria proposta (escolher uma).**
- (a) Estender o cabeçalho de run com `total_casamento_manual` + ajustar `countByMotivo` para
  segregar N:M, **ou**
- (b) unificar a regra de contagem: contar `total_bloqueadas` no cabeçalho com o **mesmo** critério
  que o snapshot grava (incluir N:M), documentando que o snapshot é a fonte de verdade do `/painel`.
- Adicionar teste de invariante: `total_bloqueadas(run) == COUNT(snapshot status='bloqueada')`.

**Resultado esperado.** Cabeçalho da run e contagem do snapshot concordam; o KPI de bloqueadas do
`/painel` deixa de divergir do `/gestao` de forma não-explicada.

---

## P2 — Mapeamento estado→string duplicado em 4+ sítios (Modifiability F-1)

**Problema.** A tradução `EstadoElegibilidade → string da coluna/UI` está espalhada:
`IngestaoPermutasService.toEstadoRow`, `GestaoPermutasService.toPendente`,
`PermutaSnapshotRepository.insertCandidataChunk`/`mapSnapshotRow`, e `StatusBadge` no frontend.
Mitigado por `as const` + unions TS (pegam typo) e por testes diretos do novo estado em cada sítio.

**Melhoria proposta.** Extrair um codec único (`estadoElegibilidadeToRow` / `rowToEstado`) no
backend e centralizar o mapa de badge no frontend.

**Resultado esperado.** Adicionar um 5º estado no futuro toca 1 lugar por camada, não 4.

---

## P2 — Contrato de tipo backend↔frontend espelhado à mão (Modifiability F-2 / Integrability)

**Problema.** `Gestao.ts` (backend) e `lib/types.ts` (frontend) declaram `StatusElegibilidade` e
`totais.casamentoManual` manualmente, sem teste de paridade.

**Melhoria proposta.** Teste de contrato (ou gerador) que falhe se os shapes divergirem.

**Resultado esperado.** Drift de contrato vira erro de teste, não bug de runtime na tela.

---

## P2 — Migration 0005 assume o nome da constraint (Fault-Tolerance F-2)

**Problema.** `0005_estado_casamento_manual.sql` faz `DROP CONSTRAINT IF EXISTS
permuta_adiantamento_estado_elegibilidade_check` assumindo o nome default do Postgres p/ CHECK
inline (criada na 0003). Se o nome real diferir, o `DROP IF EXISTS` no-opa e o `ADD` falha por
duplicidade. `runMigrations.ts` não tem tratamento de erro/repair nem down-migration.

**Mitigação atual.** Nome bate com o default Postgres (`<tabela>_<coluna>_check`) — happy path OK.
Rebaixado a P2: o Yuri NÃO roda migrate contra DB real agora (re-semeia depois) e `Tenants:` está
vazio.

**Melhoria proposta.** Usar bloco `DO $$ ... lookup em pg_constraint por (conrelid, contype='c',
coluna) ... $$` para ser robusto ao nome; considerar down-migration.

**Resultado esperado.** Migration idempotente independente do nome gerado pelo Postgres.

---

## P2 — Sem teste do mapeamento snapshot `casamento-manual → bloqueada` (Testability F-1)

**Problema.** `PermutaSnapshotRepository.test.ts` não referencia `casamento-manual`; o colapso
para `'bloqueada'` (`:247-250`) funciona via o ternário pré-existente, sem teste que fixe o contrato
do ADR-0005 §4.

**Melhoria proposta.** 1 `it()` afirmando que uma candidata `CASAMENTO_MANUAL` grava `status_0 ===
'bloqueada'` no snapshot (e que `motivo_bloqueio` informativo é preservado).

**Resultado esperado.** O contrato de back-compat do `/painel` fica protegido contra regressão.

---

## P3 — Sem teste de UI do badge/KPI `casamento-manual` (Testability F-2)

**Problema.** `page.tsx` (StatusBadge branch + KPI filter) não tem teste — mas **nenhum** `page.tsx`
do repo é testado; débito sistêmico pré-existente, herdado, não introduzido por este tweak. Shape
travado por TS (`lib/types.ts:25`).

**Melhoria proposta.** Extrair `StatusBadge` para componente próprio + 3 testes RTL (elegivel /
bloqueada / casamento-manual).

**Resultado esperado.** Apresentação visual do novo estado coberta.

---

## P3 — Union `StatusElegibilidade` redeclarada vs `EstadoElegibilidade` (Modifiability F-3)

Pequeno: o union de UI repete os literais do `ESTADO_ELEGIBILIDADE`. Derivar um do outro quando
conveniente.

---

## Observações de design (não-findings, DesignSystemReviewer)

- Fallback silencioso para fixture quando o backend cai: considerar `toast.warning` mais explícito
  (hoje só o badge `fonte: fixture`). P2 não-bloqueante.
- `totais` do fixture são hardcoded (seed de demo, não auto-computado) — documentar.
