Entry point for adjusting an existing rule, fixing a bug, or modifying an existing entity. Optimized path: skips deep interview when no ontology change is needed.

## Usage

```
/feature-tweak <entity-or-rule> "<intent>"
/feature-tweak entities/permuta "add idadePendencia property"
/feature-tweak business-rules/permuta-match-1-1 "fix: query was using OR instead of AND"
/feature-tweak integrations/nexxera "schema change in the remessa file layout"
/feature-tweak integrations/conexos "schema change in com298 títulos query"
/feature-tweak --urgent <entity> "<intent>"   # hotfix: skip interview, retroactive ADR in 24h
/feature-tweak --high-risk <entity> "<intent>"
/feature-tweak --no-regis-review <entity> "<intent>"  # opt-out do gate Regis-Review pós-impl
/feature-tweak --base <branch> <entity> "<intent>"    # branch base p/ rebase antes do PR (default: main)
```

## Step 0 — Worktree obrigatório (antes de qualquer coisa)

**Inviolável.** Toda execução de `/feature-tweak` roda em um git worktree dedicado — nunca no checkout
principal. Isso evita conflitos entre desenvolvimentos paralelos.

1. Derive um `feature-slug` curto e kebab-case do entity + intent.
2. Crie a branch + worktree a partir da branch base (default `main`, ou `--base`):
   ```bash
   git worktree add -b fix/<feature-slug> "C:/tmp/<feature-slug>-wt" <base>
   ```
   - Caminho **curto** em `C:/tmp/` é obrigatório no Windows (limite MAX_PATH quebra o Turbopack/Next).
   - Se o frontend precisar rodar, rode-o a partir do checkout principal, não do worktree.
3. Todo o restante do pipeline acontece **dentro do worktree**.
4. Só pule o worktree se o usuário pedir explicitamente; confirme uma vez e prossiga. Caso contrário, é mandatório.

> Nota `--urgent`: mesmo no hotfix, o worktree continua obrigatório (isola o hotfix de outros WIP).

## Flow

1. **CodebaseNavigator** locates the entity/rule in `ontology/` and all related implementation files via `_index.json`.

2. **OfficeHoursInterviewer** (tweak mode) — surgical interview focused on delta:
   - What is the current behavior? (reads from ontology)
   - What is the desired behavior?
   - Is this a rule change or implementation bug?
   - Does this change any invariant?
   - Canonical test case that demonstrates the issue?

3. **Decision fork:**
   - **Implementation bug only** → skip OntologyCurator, go directly to TaskScoper
   - **Rule change or new property** → OntologyCurator proposes diff → you approve → TaskScoper
   - **Integration schema change** → OntologyCurator must update `integrations/*.md` (mandatory)

4. **TaskScoper** generates minimal task list (typically 1-3 tasks for a tweak).

5. **AutoLoopRunner** executes loop until green.

6. **Regis-Review gate (obrigatório)** — atingido o verde, rode `/regis-review` com escopo restrito aos
   diretórios tocados pelo tweak. Não é opcional, salvo `--no-regis-review` / `--urgent` / opt-out no prompt.

7. **Sub-loop de remediação P0** — cada finding **P0 (crítico)** re-entra no pipeline
   (OfficeHoursInterviewer surgical → OntologyCurator se necessário → TaskScoper → AutoLoopRunner), no
   **mesmo worktree**. **P1/P2/P3 não são implementados** — viram follow-ups no inbox.

8. **Bump de versão + Rebase + PR** — com P0 zerado: rebase da branch base, resolver conflitos, bumpar a versão
   do app (FE+BE lockstep) via `scripts/bump-version.ps1 -Execute` (semver por conventional-commit; `fix`→patch,
   no-op se o delta não tiver `feat`/`fix`/`perf`), commit `chore(release): vX.Y.Z`, e abrir o PR.

## Gate pós-implementação — Regis-Review (obrigatório)

Idêntico ao de `/feature-new`:

1. `/regis-review` com escopo restrito aos diretórios tocados (use `--quick` para focar no delta).
2. Leia o `KANBAN.md`; separe **P0 (Crítico)** / P1 / P2 / P3.
3. **Sub-loop P0:** cada P0 vira novo mini-ciclo OfficeHours → (Ontology se a regra mudar) → TaskScoper → AutoLoop,
   no mesmo worktree. **Anti-recursão:** o sub-loop **não** dispara outro Regis-Review (roda 1x por execução).
4. **P1/P2/P3** → `ontology/_inbox/[feature-slug]-regis-followups.md` (card-id, prioridade, finding, path do REPORT/KANBAN).
5. Opt-out: `--no-regis-review`, `--urgent`, ou pedido explícito no prompt — registre a dispensa no PR.

## Rebase obrigatório antes do PR

1. Branch base = `--base` (default `main`).
2. `git fetch origin <base>` → `git rebase origin/<base>`.
3. **Conflito trivial** → resolva, `git add`, `git rebase --continue`.
4. **Conflito não-trivial** (lógica de negócio sobreposta) → **pare e chame o Yuri**, salve o estado, descreva o conflito.
5. Rebase limpo + gates ainda verdes → abrir o PR.

## `--urgent` mode (hotfix)

Skips OfficeHoursInterviewer. AutoLoopRunner goes directly.
**Mandatory:** create retroactive ADR in `ontology/decisions/` within 24h explaining what was changed and why.

## For bugs that start with "fix:"

When intent starts with `"fix: ..."`:
- OfficeHoursInterviewer uses the `/investigate` flow first
- "Is the rule correct in the ontology, and only the implementation is wrong?"
- If yes → no ontology diff; fix implementation + add regression test
- If no → ontology diff needed (the rule itself was wrong or incomplete)

## What the Interviewer always asks for tweaks

1. Current behavior (confirmed against ontology)
2. Desired behavior (the delta)
3. Rule change or implementation bug?
4. Invariants affected?
5. Canonical test case / reproducer

## Checklist before you start

1. Entity or rule name (or keyword if unsure — CodebaseNavigator will find it)
2. Current behavior vs desired behavior in 2 sentences
3. Trigger: production bug, layout/integration change, new financial rule?
4. Reproducible test case (título/permuta id, lote id, payload, SQL query that demonstrates)
