# BPMN Analyze

Reads existing code, workflows, or documentation and generates a BPMN 2.0 XML diagram that maps the actual process flow. Useful for reverse-engineering undocumented processes or visualizing complex service interactions.

Generic-purpose but context-aware: understands the DDD architecture, service layers, Express route handlers (current) / Lambda handlers (target), and Conexos/Nexxera/SharePoint integrations of this project.

## Usage

```
/bpmn-analyze <file path, service name, or process description>
/bpmn-analyze src/backend/domain/service/LogService.ts
/bpmn-analyze "fluxo de pagamento SISPAG"
/bpmn-analyze ontology/workflows/reconciliacao-permutas.md
```

## Steps

### 1. Identify the scope

Determine what to analyze based on the argument:

- **File path**: Read the file and trace its call graph (imports, injected dependencies, downstream calls)
- **Service name**: Find the service via `ontology/_index.json` or Grep, then trace as above
- **Process/workflow name**: Check `ontology/workflows/`, `ontology/actions/`, `docs-contexto/03_ontologia_financeiro.md`, and related service files
- **Ontology entity**: Read the entity definition and find all actions/rules that reference it

### 2. Trace the process flow

Read the relevant files and extract:

- **Entry point**: What triggers the flow? (Express route / API call, EventBridge, SQS, schedule, user action)
- **Participants**: Which systems/services are involved? (Frontend, Backend service, Conexos API, Nexxera, SharePoint, GED, S3, etc.)
- **Sequential steps**: Follow the code execution path, noting:
  - Method calls and their purpose
  - External API calls (Conexos `fin010`/`com298` endpoints, Nexxera, etc.)
  - Data transformations
  - Error handling / fallback paths
- **Decision points**: Conditionals that branch the flow (if/switch/ternary with business meaning)
- **Parallel execution**: `Promise.all`, concurrent fetches, fan-out patterns
- **Loops/iterations**: Per-process, per-filial, per-document, per-invoice iterations
- **Error/retry paths**: RetryExecutor usage, fault-tolerant degradation, DLQ

### 3. Map to BPMN elements

| Code pattern | BPMN element |
|---|---|
| Express route handler / Lambda handler / API endpoint | Start Event (message) |
| Service method call | Task (service task) |
| Conexos / Nexxera API call | Task in the respective integration lane |
| `if`/`switch` with business logic | Exclusive Gateway |
| `Promise.all` / bounded concurrency | Parallel Gateway |
| `RetryExecutor` | Loop marker on task |
| `try/catch` with fallback | Error boundary event |
| `logService.warn` + continue | Intermediate event (warning) |
| Final response/return | End Event |

### 4. Generate BPMN 2.0 XML

Follow the same BPMN generation rules as `/bpmn-generate`:

- Use `bpmn2:` prefix (`xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"`) for Red Hat/jBPM extension compatibility
- Meaningful IDs and Portuguese names
- Proper sequence flows connecting all elements
- **Include `bpmndi:BPMNDiagram`** with grid-based coordinates (see `/bpmn-generate` Step 4 layout rules). Same interactive refinement options available ("compactar", "dispersar", "fix overlaps", "reorganizar lane X").

### 5. Present summary + save

Show a text summary of the discovered process:

```
## Processo analisado: {nome}

### Fonte: {arquivo(s) lido(s)}

### Participantes (Lanes)
- {lane1}: {sistema/servico}
- {lane2}: {sistema/servico}

### Fluxo descoberto
1. [Start] {trigger}
2. [Task] {step} — {arquivo:linha}
3. [Gateway] {decisao} — {arquivo:linha}
4. ...
N. [End] {resultado}

### Observacoes
- {pontos de atencao, gaps, fluxos nao cobertos}

### Arquivo: docs/bpmn/{slug}.bpmn
```

Ask the user to confirm before writing. Write to `docs/bpmn/`.

### 6. Cross-reference with ontology

After generating, check if the discovered process aligns with the ontology:
- Are all steps documented in `ontology/workflows/` or `ontology/actions/`?
- Are there undocumented decision points that should become business rules?
- Are there integrations not listed in `ontology/integrations/`?

Report discrepancies as suggestions (don't auto-fix).

## What NOT to do

- Do not generate a BPMN from just the function signature — read the implementation
- Do not include internal implementation details (variable names, loop counters) as BPMN tasks — keep it at the business/integration level
- Do not guess flows for code you haven't read — trace the actual execution path
- Do not modify any source code — this is a read-only analysis skill
