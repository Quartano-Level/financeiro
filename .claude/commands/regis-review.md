Regis-Review — Architecture Review (Bass & Clements 8-QA pipeline).

> **Naming:** este comando antes se chamava `/arch-review`. Foi renomeado para **Regis-Review**
> em homenagem ao professor que ensinou arquitetura de software, requisitos funcionais e não
> funcionais. `/arch-review` permanece como **alias deprecado** apontando para este mesmo pipeline.

Generates a defensible, metrics-backed report covering all eight Quality Attributes for use in technical review meetings. Each QA gets a dedicated specialist agent that runs in parallel, collects real measurements, maps findings to Bass tactics, and emits Kanban-ready cards. A consolidator agent then synthesizes the master REPORT and KANBAN files.

> **Invocação automática:** além do uso manual abaixo, o Regis-Review é chamado **obrigatoriamente**
> ao final de toda execução de `/feature-new` e `/feature-tweak` (após impl + testes verdes), salvo
> opt-out explícito (`--no-regis-review` ou instrução no prompt). Ver a seção "Gate pós-implementação"
> nesses comandos. Quando chamado pelo pipeline de feature, o escopo default é restrito aos diretórios
> tocados pela feature, e os findings **P0 (crítico)** retornados re-entram em um ciclo
> Office-Hours → Ontology → TaskScoper → AutoLoopRunner.

## Usage

```
/regis-review                 # full review across backend + frontend + infra
/regis-review backend         # backend-only scope
/regis-review frontend        # frontend-only scope
/regis-review infra           # infra-only scope
/regis-review --quick         # skip heavy commands (no coverage, no terraform plan, no npm audit deep)
```

`$ARGUMENTS` is parsed by the orchestrator below.

## Pipeline

You are the orchestrator of an 8-QA architecture review based on Bass & Clements (Software Architecture in Practice). Execute the pipeline below **without skipping steps**. Robustez é mandatória — não economize execução.

### Step 0 — Setup

1. Determine scope from `$ARGUMENTS`. Default: `all`. Recognize `--quick` as a flag.
2. Compute `run_id = YYYY-MM-DD-HHMM` (UTC) from system time.
3. Create output directory: `docs/regis-review/{run_id}/`. If it exists already (rerun within same minute), append `-r2`, `-r3`, etc.
4. Read the template at `docs/regis-review/_template/qa-section.md` and confirm it exists. If missing, abort with a clear message — the schema is load-bearing.
5. Pre-collect shared baseline metrics (cached for all agents to avoid redundant work). Run from repo root and persist to `docs/regis-review/{run_id}/_shared-metrics.md`:

   | Metric | Command | Notes |
   |---|---|---|
   | Backend LOC by layer | `find src/backend -name '*.ts' -not -name '*.test.ts' \| xargs wc -l` | Group by `domain/service`, `domain/repository`, `domain/client`, `lambda/api`, `lambda/job` |
   | Backend test count | `find src/backend -name '*.test.ts' \| wc -l` | |
   | Frontend LOC | `find src/frontend -name '*.ts' -o -name '*.tsx' \| grep -v test \| xargs wc -l` | |
   | Frontend test count | `find src/frontend -name '*.test.ts' -o -name '*.test.tsx' \| wc -l` | |
   | Terraform module count | `ls infra/tenants/modules \| wc -l` | |
   | Tenant count | `ls infra/tenants/tenants-vars/*/* -d 2>/dev/null \| wc -l` | |
   | Backend deps | parse `backend/package.json` | dependencies + devDependencies counts |
   | Frontend deps | parse `frontend/package.json` | |
   | Backend lint baseline | `cd backend && npm run lint 2>&1 \| tail -50` | capture summary |
   | Backend typecheck baseline | `cd backend && npm run typecheck 2>&1 \| tail -50` | |

   Each agent reads `_shared-metrics.md` first, then collects QA-specific metrics on top.

### Step 1 — Fan out QA agents (parallel)

Launch all eight agents **in a single message with parallel Task tool calls**. Each receives:

- `run_id` and the absolute path of `docs/regis-review/{run_id}/`
- `scope` (all/backend/frontend/infra)
- `--quick` flag if set
- The **mandatory output path**: `docs/regis-review/{run_id}/{qa-slug}.md`
- A reminder to follow `docs/regis-review/_template/qa-section.md` exactly (schema is enforced by consolidator)
- Instruction to read `_shared-metrics.md` before doing their own collection

The eight agents (subagent_type names exactly as below):

| # | Subagent type | Output file |
|---|---|---|
| 1 | `qa-availability` | `availability.md` |
| 2 | `qa-deployability` | `deployability.md` |
| 3 | `qa-integrability` | `integrability.md` |
| 4 | `qa-modifiability` | `modifiability.md` |
| 5 | `qa-performance` | `performance.md` |
| 6 | `qa-fault-tolerance` | `fault-tolerance.md` |
| 7 | `qa-security` | `security.md` |
| 8 | `qa-testability` | `testability.md` |

If any agent fails or produces malformed output (missing frontmatter, missing required sections), **rerun that agent with explicit feedback about the missing fields** — do not let the consolidator face partial inputs.

### Step 2 — Verify all 8 outputs

Before invoking the consolidator:

1. List `docs/regis-review/{run_id}/`. Confirm all 8 expected files exist.
2. Read the frontmatter of each. Confirm presence of: `qa`, `qa_slug`, `score`, `findings_count`, `cards_count`.
3. If any file is missing or malformed, rerun the corresponding agent. Do not proceed with gaps.

### Step 3 — Consolidator

Launch `qa-consolidator` (subagent_type) with:

- The path `docs/regis-review/{run_id}/`
- Instruction to produce two outputs:
  - `docs/regis-review/{run_id}/REPORT.md` — narrative for the technical meeting
  - `docs/regis-review/{run_id}/KANBAN.md` — flat list of all cards, ordered by priority then effort
- Audience: full technical, business-aware (architects, senior devs, tech lead). Tone: defendable, evidence-first, no fluff.

### Step 4 — Surface results

After consolidator finishes, output to the user (in pt-BR):

1. Path to `REPORT.md` and `KANBAN.md`
2. **Health scorecard** (table of 8 QAs with scores 0–10)
3. **Top 5 risks** (highest-severity findings, cross-QA)
4. **Total cards generated** broken down by P0/P1/P2/P3
5. Suggested next action (e.g., "P0 cards devem virar tickets esta sprint")

## Failure modes to handle

- **Comando falha** (npm install missing, terraform not initialized): registrar no shared-metrics como ⚠️ "Não medível: <razão>" e instruir os agents a continuarem com o que conseguirem coletar. Não abortar o pipe.
- **Agent não respeita schema**: rerun com diff explícito do que faltou. Máximo 2 retries por agent; após isso, registrar como `qa.md.PARCIAL` e seguir.
- **Repo não tem `node_modules`**: avisar usuário que análises dinâmicas (test, build, audit) ficarão como "não medíveis". Oferecer rodar `npm install` antes de prosseguir.

## Princípios não-negociáveis

1. **Métricas reais ou explícitas como não-medíveis** — nunca chutar um número.
2. **Toda finding P0/P1 precisa de baseline numérico** — caso contrário rebaixar para P2.
3. **Tactics nomeadas exatamente como no Bass & Clements** (inglês, capitalização canônica).
4. **Cards em pt-BR** com Problema / Melhoria Proposta / Resultado Esperado.
5. **Paralelismo é mandatório** no Step 1 — sequencial duplica wall-time.
6. **Não interpretar — medir.** Se uma tactic parece bem implementada, validar com evidência (file:line, métrica) antes de marcar ✅.
