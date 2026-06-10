Entry point for building a new feature. Runs the full pipeline: interview → ontology diff (if needed) → tasks → autonomous loop until green → PR.

## Usage

```
/feature-new <intent in natural language>
/feature-new --high-risk <intent>
/feature-new --shotgun <intent>         # enables /design-shotgun for UI screens
/feature-new --no-regis-review <intent> # opt-out do gate Regis-Review pós-implementação
/feature-new --base <branch> <intent>   # branch base p/ rebase antes do PR (default: main)
```

## Step 0 — Worktree obrigatório (antes de qualquer coisa)

**Inviolável.** Toda execução de `/feature-new` roda em um git worktree dedicado — nunca no
checkout principal. Isso evita conflitos entre desenvolvimentos paralelos.

1. Derive um `feature-slug` curto e kebab-case do intent.
2. Crie a branch + worktree a partir da branch base (default `main`, ou o valor de `--base`):
   ```bash
   git worktree add -b feat/<feature-slug> "C:/tmp/<feature-slug>-wt" <base>
   ```
   - Caminho **curto** em `C:/tmp/` é obrigatório no Windows (o limite MAX_PATH quebra o Turbopack/Next).
   - Se o frontend precisar rodar, rode-o a partir do checkout principal, não do worktree (gotcha conhecido).
3. Todo o restante do pipeline (interview, ontology, código, gates, PR) acontece **dentro do worktree**.
4. Só pule o worktree se o usuário pedir explicitamente (prompt ou flag); confirme uma vez e prossiga no
   checkout atual. Caso contrário, worktree é mandatório.

## Flow

1. **OfficeHoursInterviewer** (new mode) — conducts structured interview across 4 axes: Entity, Action, Invariant, Integration. Stops when all axes are clear.

2. **You review** the interview transcript in `ontology/_inbox/[feature-slug]-interview.md`. Confirm `entity_changed` flag is correct.

3. **If `entity_changed = true`:** OntologyCurator proposes diff in `ontology/`. You approve/edit/reject before any code is written.

4. **If feature touches UI** and `--shotgun` flag: DesignConsultant researches landscape and proposes 2-3 creative directions before TaskScoper.

5. **TaskScoper** generates `ontology/_inbox/[feature-slug]-tasks.md` with acceptance criteria per task and Definition of Done.

6. **You confirm** the tasks.md looks right (scope, risks, files).

7. **AutoLoopRunner** executes: TDD → impl → typecheck → lint → tests → PatternGuardian → optional specialized reviews → green.

8. **Regis-Review gate (obrigatório)** — assim que os critérios de verde da AutoLoopRunner passam, rode
   `/regis-review` com escopo restrito aos diretórios tocados pela feature. **Não é opcional**, salvo
   `--no-regis-review` ou pedido explícito no prompt. Veja "Gate pós-implementação" abaixo.

9. **Sub-loop de remediação P0** — para cada finding **P0 (crítico)** do Regis-Review, re-entre no pipeline:
   OfficeHoursInterviewer → OntologyCurator (se entity_changed) → TaskScoper → AutoLoopRunner, dentro do
   **mesmo worktree**. Findings **P1/P2/P3 não são implementados pelo loop** — viram follow-ups no inbox.

10. **Bump de versão + Rebase + PR** — só depois de P0 zerado: rebase da branch base na branch local, resolver
    conflitos, bumpar a versão do app (FE+BE lockstep) via `scripts/bump-version.ps1 -Execute` (semver por
    conventional-commit; no-op se o delta não tiver `feat`/`fix`/`perf`), commit `chore(release): vX.Y.Z`, e abrir o PR.
    Veja "Rebase obrigatório antes do PR" abaixo.

11. **Human-in-the-loop gates** (pause loop):
    - InfoGapBroker P0 question → edit `ontology/_inbox/[feature-slug]-gap.md` to resume
    - QaCoach roteiro (features with new handler/job/UI) → execute in dev tenant
    - `--high-risk` flag → `/pair-review` before PR

## Gate pós-implementação — Regis-Review (obrigatório)

Depois que a AutoLoopRunner atinge verde (typecheck + lint + testes + PatternGuardian + acceptance criteria),
o pipeline **deve** rodar o Regis-Review antes de pensar em PR:

1. Rode `/regis-review` (ver `.claude/commands/regis-review.md`) com escopo restrito aos diretórios tocados
   pela feature (ex.: `backend`, `frontend`). Use `--quick` se o objetivo for só o delta da feature.
2. Leia o `KANBAN.md` gerado. Separe os cards por prioridade: **P0 (Crítico)**, P1, P2, P3.
3. **Sub-loop P0:** cada card P0 vira insumo de um novo ciclo
   OfficeHoursInterviewer (surgical) → OntologyCurator (se a regra/entidade mudar) → TaskScoper → AutoLoopRunner.
   - Roda no **mesmo worktree** da feature.
   - **Importante (anti-recursão):** o sub-loop **não** dispara outro Regis-Review. O Regis-Review roda **uma vez**
     por execução de feature; a remediação dos P0 fecha com os gates normais (typecheck/lint/test/PatternGuardian).
4. **P1/P2/P3 não entram no loop.** Grave-os como follow-ups em `ontology/_inbox/[feature-slug]-regis-followups.md`
   (com o card-id, prioridade, finding de origem e o caminho do REPORT/KANBAN), para virarem tickets depois.
5. Opt-out: se `--no-regis-review` foi passado, ou o usuário pediu explicitamente no prompt, pule este gate
   e registre no PR que o Regis-Review foi dispensado e por quê.

## Rebase obrigatório antes do PR

Antes de `gh pr create`, sincronize com a base para pegar conflitos cedo:

1. Determine a branch base (`--base`, default `main`).
2. `git fetch origin <base>` e então rebase da base na branch da feature:
   ```bash
   git fetch origin <base>
   git rebase origin/<base>
   ```
3. **Conflitos triviais** (imports, formatação, regiões disjuntas): resolva, `git add`, `git rebase --continue`.
4. **Conflitos não-triviais** (lógica de negócio sobreposta, mesma função reescrita dos dois lados):
   **pare e chame o Yuri** — não adivinhe a resolução. Salve o estado e descreva o conflito.
5. Só depois do rebase limpo e dos gates ainda verdes: abrir o PR.

## Checklist before you start

Have ready:
1. **Business intent in 1-2 sentences** (not technical solution)
2. **Concrete example**: payload, NF number, CNPJ — hides sensitive data
3. **Consumer**: API, batch job, event? Which tenant?
4. **Invariants NOT to break** (if you know them)

Without these, OfficeHoursInterviewer will extract them from you — but having them ready shortens the cycle.

## What NOT to do

- Do not skip the interview and jump straight to implementation
- Do not pre-decide the technical solution before the interview surfaces invariants
- Do not open a PR that touches `src/backend/domain/` with `entity_changed=true` but no ontology diff
- Do not run the pipeline in the main checkout — a dedicated worktree is mandatory (Step 0)
- Do not skip the Regis-Review gate unless `--no-regis-review` (or explicit prompt opt-out) was given
- Do not implement P1/P2/P3 findings in the loop — only P0 are remediated; the rest go to the inbox
- Do not open the PR before rebasing the base branch and confirming gates are still green
