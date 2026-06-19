# BPMN Generate

Generates a BPMN 2.0 XML diagram of a **business process** through a guided interview. The focus is on the real-world process (who does what, when, why) — not the technical implementation.

Generic-purpose but context-aware: knows the financial automation processes of this project (Permutas, SISPAG, Popula GED) and can reference them when relevant.

## Usage

```
/bpmn-generate <process name or area>
/bpmn-generate "pagamento SISPAG (lote → remessa → retorno)"
/bpmn-generate "reconciliação de permutas PROFORMA × INVOICE"
/bpmn-generate "popular GED com NC/ND a partir do SharePoint"
```

## Steps

### 1. Guided Interview (mandatory — never skip)

Conduct a structured BPM interview to extract the process from the user. Ask questions in rounds, building understanding progressively. Use AskUserQuestion for structured choices and follow-up in text for open-ended clarification.

#### Round 1 — Scope & Trigger
- **What process are we mapping?** (name, area, department)
- **What triggers this process?** (event, request, schedule, another process ending)
- **What is the deliverable/outcome?** (document, decision, payment, report)
- **How often does it happen?** (daily, weekly, monthly, per-shipment, on-demand)

#### Round 2 — Participants & Roles
- **Who are the actors?** (people, departments, systems, external parties)
  - Examples for the financial domain: Analista Financeiro, Tesouraria, Contador, Fornecedor, Conexos (`fin010`/`com298`), Banco/Nexxera, SharePoint, GED
- **Who is responsible for each major step?** (RACI: Responsible, Accountable, Consulted, Informed)
- **Are there external parties or systems involved?** (ERPs, banks, government, document repositories)

#### Round 3 — Happy Path (main flow)
Walk through the process step by step:
- **"What happens first?"**
- **"Then what?"**
- **"Who does that?"**
- **"What do they need to do it?" (inputs)**
- **"What do they produce?" (outputs)**
- **"What happens next?"**

Keep going until the process ends. Number each step.

#### Round 4 — Decision Points & Exceptions
For each step in the happy path, ask:
- **"Can this step fail or be rejected?"**
- **"Are there conditions that change the path?"** (approval needed, value threshold, document type, 1:1 vs N:M match)
- **"What happens when it goes wrong?"** (retry, escalate, cancel, alternative path)
- **"Are there timeouts or SLAs?"** (wait for approval, deadline for payment, bank return window)

#### Round 5 — Confirmation
Present a text summary of the discovered process (see Step 3) and ask:
- **"Is this complete?"**
- **"Anything missing?"**
- **"Any step I got wrong?"**

Iterate until the user confirms.

### 2. Design the process model

From the interview, identify and classify:

- **Pools**: Different organizations (e.g., "Columbia Trading", "Fornecedor Internacional", "Banco/Nexxera")
- **Lanes**: Roles within the same org (e.g., "Analista Financeiro", "Tesouraria", "Contador")
- **Start Event(s)**: The trigger identified in Round 1
- **Tasks**: Each step from Round 3, named as verb+noun in Portuguese (e.g., "Montar Lote de Pagamento", "Gerar Remessa CNAB", "Conciliar Retorno")
- **Gateways**: Decision points from Round 4
- **Intermediate Events**: Timers (SLAs), messages (emails, notificações), signals
- **End Event(s)**: The outcome from Round 1
- **Artifacts**: Documents, data objects that flow between steps (e.g., "PROFORMA", "INVOICE", "Remessa CNAB", "Retorno bancário", "NC/ND")

### 3. Present summary for confirmation

Before generating XML, show:

```
## Processo: {nome}

### Trigger
{o que inicia o processo}

### Participantes
| Pool/Lane | Quem | Responsabilidades |
|-----------|------|-------------------|
| {lane1}   | {quem} | {o que faz} |
| {lane2}   | {quem} | {o que faz} |

### Fluxo Principal (Happy Path)
1. [Start] {evento inicial}
2. [Task] {atividade} — {lane responsável}
3. [Gateway] {decisão}?
   - Sim → {próximo passo}
   - Não → {caminho alternativo}
4. [Task] {atividade} — {lane responsável}
...
N. [End] {resultado final}

### Exceções / Caminhos Alternativos
- {exceção 1}: {o que acontece}
- {exceção 2}: {o que acontece}

### Documentos / Artefatos
- {documento 1}: {quem produz} → {quem consome}
- {documento 2}: {quem produz} → {quem consome}
```

Ask the user to confirm. Iterate if needed.

### 4. Generate BPMN 2.0 XML

Produce a valid BPMN 2.0 XML file following these rules:

**Semantic rules:**
- Use the `bpmn2:` prefix for all BPMN elements (`xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"`) — required by the Red Hat/jBPM VS Code extension
- Use meaningful `id` attributes (e.g., `Task_GerarRemessaCNAB`, not `Task_1`)
- Use meaningful `name` attributes in Portuguese (matching the user's domain language)
- Include proper `sequenceFlow` connections between all elements
- Include `dataObject` elements for key documents/artifacts
- Use `userTask` for human activities, `serviceTask` for system activities
- Use `messageFlow` for cross-pool communication (e.g., company → bank)

**Layout rules (grid-based `bpmndi:BPMNDiagram`):**

Always include a `bpmndi:BPMNDiagram` section with coordinates calculated by the grid algorithm below. This ensures fast rendering in VS Code extensions and bpmn.io without relying on auto-layout (which hangs on large diagrams).

Grid layout algorithm:
1. **Pools**: stack vertically, full width. Each pool height = (number of lanes) × `LANE_H`. Gap between pools = `POOL_GAP`.
   - `LANE_H = 150` (height per lane)
   - `POOL_GAP = 80` (vertical gap between pools)
   - `POOL_W = (max tasks in any lane across all pools) × CELL_W + 200` (ensure all pools same width)

2. **Lanes**: horizontal bands within each pool, stacked top to bottom.

3. **Elements within a lane**: placed left-to-right in a grid.
   - `CELL_W = 200` (horizontal spacing between element centers)
   - `CELL_H = LANE_H` (vertical center of the lane)
   - Element index = order of appearance in the sequence flow (topological sort from start event)
   - `x = POOL_X + 80 + (index × CELL_W)`
   - `y = lane_top + (LANE_H / 2) - (element_height / 2)`
   - Standard sizes: tasks = `160×80`, gateways = `50×50`, events = `36×36`

4. **Cross-lane flows**: when a sequence flow crosses lanes, the target element is placed at the next available x-position in its lane (never overlapping horizontally with elements in the same lane).

5. **Generous spacing**: prefer too much whitespace over any overlap. When in doubt, add `CELL_W` of extra space.

### 5. Save the file

Write the BPMN XML to `docs/bpmn/{slug}.bpmn` where `{slug}` is a kebab-case derivation of the process name.

Create the `docs/bpmn/` directory if it doesn't exist.

### 6. Layout refinement (interactive)

After the user opens the diagram, they may request adjustments. Support these commands in follow-up messages:

- **"compactar"** — reduce `CELL_W` to `150` and `LANE_H` to `120`, regenerate coordinates
- **"dispersar"** — increase `CELL_W` to `280` and `LANE_H` to `200`, regenerate coordinates
- **"fix overlaps"** — scan for elements whose bounding boxes overlap (within 10px margin), shift the rightmost one by `CELL_W` to the right, cascade subsequent elements
- **"reorganizar lane X"** — recalculate only the elements in lane X, re-spacing them evenly

When adjusting, rewrite only the `bpmndi:BPMNDiagram` section — never change the process logic.

### 6. Validate

After writing, confirm:
- The XML is well-formed (no unclosed tags)
- All `sequenceFlow` source/target refs point to existing element IDs
- Every task/gateway has at least one incoming and one outgoing flow (except start/end events)
- The diagram section (`bpmndi:BPMNDiagram`) covers all elements
- All lanes mentioned in the summary are represented
- All decision points from Round 4 are modeled as gateways

## Interview Tips

- **Start broad, then drill down.** Don't ask about exceptions before understanding the happy path.
- **Use the user's language.** If they say "dar baixa na PROFORMA", use that as the task name — don't translate to technical jargon.
- **One question at a time when clarifying.** Batched questions are OK for initial scope (AskUserQuestion), but follow-ups should be conversational.
- **Draw from known context.** If the user mentions "SISPAG" or "permutas", check `ontology/workflows/` and `docs-contexto/03_ontologia_financeiro.md` first and confirm what you already know — don't re-ask everything.
- **Flag assumptions.** If you infer a step (e.g., "I assume a remessa CNAB is sent to the bank before the retorno is conciliado..."), state it and ask for confirmation.

## Context: Known processes in this project

When the user mentions processes related to this project, check these sources first:
- `ontology/workflows/` — documented workflow steps (may be empty at bootstrap)
- `ontology/entities/` — domain entities and their state machines
- `ontology/actions/` — actions and their triggers
- `ontology/business-rules/` — invariants and constraints
- `docs-contexto/03_ontologia_financeiro.md` — domain narrative (Permutas, SISPAG, Popula GED)
- `docs/proposta/` — original proposal scope

Use existing documentation to pre-populate the interview — avoid re-asking what's already known. Show the user what you found and ask them to confirm/correct.

## BPMN 2.0 Quick Reference

| Element | XML Tag | Use when |
|---------|---------|----------|
| Pool | `participant` + `process` | Different organizations/systems |
| Lane | `lane` inside `laneSet` | Different roles within same org |
| Start Event | `startEvent` | Process trigger |
| End Event | `endEvent` | Process conclusion |
| User Task | `userTask` | Human performs an action |
| Service Task | `serviceTask` | System/API performs an action |
| Send Task | `sendTask` | Send message/document to external party |
| Receive Task | `receiveTask` | Wait for message/document from external party |
| Exclusive Gateway | `exclusiveGateway` | XOR decision (one path) |
| Parallel Gateway | `parallelGateway` | AND split/join (all paths) |
| Inclusive Gateway | `inclusiveGateway` | OR decision (one or more paths) |
| Timer Event | `timerEventDefinition` | Wait for time/schedule/SLA |
| Message Event | `messageEventDefinition` | Wait for/send message |
| Error Event | `errorEventDefinition` | Handle failure/exception |
| Data Object | `dataObjectReference` | Document or artifact flowing through the process |
