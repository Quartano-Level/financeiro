# BPMN Edit

Edits an existing BPMN diagram based on user feedback. Handles both content changes (process logic) and layout adjustments (visual arrangement).

Use this skill when the user has an existing `.bpmn` file and wants to modify it — whether to fix the process flow, add/remove steps, adjust the layout, or refine after reviewing in bpmn.io / Camunda Modeler.

## Usage

```
/bpmn-edit <file path> "<what to change>"
/bpmn-edit docs/bpmn/pagamento-sispag.bpmn "adicionar etapa de aprovação da tesouraria antes de gerar a remessa"
/bpmn-edit docs/bpmn/reconciliacao-permutas.bpmn "compactar"
/bpmn-edit docs/bpmn/pagamento-sispag.bpmn "remover a lane Contador"
/bpmn-edit docs/bpmn/pagamento-sispag.bpmn "trocar a ordem: conciliar retorno vem antes de notificar fornecedor"
```

If no file path is given, list the `.bpmn` files in `docs/bpmn/` and ask the user which one to edit.

## Types of edits

### Content edits (process logic)

These change the `bpmn2:process` section — the actual flow:

| User says | Action |
|-----------|--------|
| "adicionar etapa X antes de Y" | Insert new task, rewire sequence flows |
| "remover etapa X" | Delete task, reconnect predecessor → successor |
| "trocar a ordem de X e Y" | Swap sequence flow connections |
| "adicionar gateway após X" | Insert exclusive/parallel gateway with branches |
| "adicionar lane Z" | Create new lane, move/add elements |
| "remover lane Z" | Move elements to another lane or delete, remove lane |
| "renomear X para Y" | Change `name` attribute |
| "adicionar pool Banco" | Create new pool + process + message flows |
| "adicionar message flow entre X e Y" | Add cross-pool message flow |
| "X deveria ser um service task, não user task" | Change element type |

**Rules for content edits:**
- Read the existing file first — never regenerate from scratch
- Preserve all existing IDs (tools may have bookmarks/references)
- Only change what was requested — don't reorganize untouched parts
- After adding/removing elements, update `flowNodeRef` in lanes
- After adding/removing elements, recalculate layout coordinates for affected lane(s)
- Validate: all sequence flows must have valid sourceRef/targetRef

### Layout edits (visual arrangement)

These change only the `bpmndi:BPMNDiagram` section — coordinates, no logic change:

| User says | Action |
|-----------|--------|
| "compactar" | Reduce CELL_W to 150, LANE_H to 120, recalculate all coordinates |
| "dispersar" | Increase CELL_W to 280, LANE_H to 200, recalculate all coordinates |
| "fix overlaps" | Scan for overlapping bounding boxes, shift rightmost elements |
| "reorganizar lane X" | Re-space elements in lane X evenly left-to-right |
| "aumentar espaço entre pools" | Increase POOL_GAP, shift lower pools down |
| "alinhar elementos" | Snap all elements to grid (nearest CELL_W/CELL_H) |

**Rules for layout edits:**
- Never change the process logic — only `bpmndi:BPMNDiagram`
- Recalculate edge waypoints after moving shapes
- Run overlap check after any layout change

## Steps

### 1. Read the existing file

Read the `.bpmn` file. Parse and understand:
- Current pools, lanes, and their elements
- Current sequence/message flows
- Current layout coordinates

### 2. Understand the request

Classify the edit:
- **Content edit** → modify process + update layout
- **Layout edit** → modify only diagram coordinates
- **Mixed** → do content first, then layout

If the request is ambiguous, ask the user to clarify.

### 3. Show the change plan

Before editing, show what will change:

```
## Edição: {descrição}

### Mudanças no processo
- [ADD] Task "Aprovar Lote" na lane "Tesouraria" (após "Montar Lote de Pagamento")
- [REWIRE] F_04: MontarLote → GerarRemessa  ⟶  MontarLote → AprovarLote
- [ADD] F_04b: AprovarLote → GerarRemessa

### Mudanças no layout
- [SHIFT] Elementos após "Montar Lote" na lane Tesouraria: +200px horizontal
- Pool width: 1800 → 2000

Confirma?
```

### 4. Apply the edit

Edit the file preserving:
- XML declaration and namespace prefixes
- All existing element IDs (unless explicitly removing)
- Comments
- Overall structure/indentation

### 5. Validate

After editing, run the same checks:
- XML well-formed
- All sequenceFlow sourceRef/targetRef point to existing IDs
- All BPMNShape bpmnElement refs exist
- No overlapping element bounding boxes
- All lanes contain their elements in `flowNodeRef`

Report any issues found.

### 6. Copy to Downloads

After a successful edit, copy the updated file to `~/Downloads/` so the user can open it in bpmn.io.

## Version control

When the user asks to "salvar versão" or "criar v2":
- Copy current file to `{slug}-v1.bpmn` (or next available version number)
- Continue editing the original file
- Mention: "Versão anterior salva em `docs/bpmn/{slug}-v1.bpmn`"
