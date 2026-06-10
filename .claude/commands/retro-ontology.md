Weekly ontology health review. Surfaces stale entities, open inbox items, uncovered business rules, and drift between ontology and code.

## Usage

```
/retro-ontology
```

## What it checks

### 1. Stale entities (no review in 30+ days)

Read all `ontology/entities/*.md` frontmatter. List any with `last_review` older than 30 days.

For each stale entity:
- Is its `implementation_status` still accurate?
- Are the `related_files` still correct paths?
- Are there new properties implemented that aren't in the ontology?

### 2. Open P0 inbox items

Read all `ontology/_inbox/*.md` files. List any with status OPEN and priority P0.

### 3. Business rules without tests

For each file in `ontology/business-rules/`:
- Is there a test in `src/backend/` that covers this rule?
- If not, flag for next sprint

### 4. Coverage drift

Read `ontology/_coverage.json`. Check if `implementation_status` fields are still accurate:
- Any entities marked `planned` that now have implementation files?
- Any entities marked `implemented` whose files no longer exist?

### 5. Actions without related_files

List actions in `ontology/actions/` with empty `related_files`. These are either:
- Genuinely not implemented (expected for planned items)
- Implemented but the index wasn't updated (a gap)

### 6. _index.json accuracy

Spot-check 3-5 entries in `_index.json`: do the listed files still exist?

## Output format

```markdown
# Ontology Retro — [date]

## Health score: [X/10]

## Stale entities (>30 days without review)
- entities/titulo.md — last review: 2026-03-15 (47 days ago)
  Action: update last_review after confirming accuracy

## Open P0 inbox items
- _inbox/permuta-match-gap.md — opened 2026-04-20 (13 days open)
  Question: [summary]

## Business rules without tests
- business-rules/sispag-lote-cutoff.md — no test found in src/backend/

## Coverage drift
- entities/remessa.md — marked 'planned' but may have partial implementation in TituloRepository
  Action: verify and update status

## Actions without files (unexpected)
- actions/permuta/executar-permuta-1-1.md — has files ✅
- actions/lote/finalizar-lote.md — has files ✅

## Recommendations
1. [highest priority action]
2. [second priority]
```

## Cadence

Run weekly (manually or via `/loop` schedule). Takes 5-10 minutes. Acts as the "heartbeat" of the ontology.
