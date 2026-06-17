One-time command to (re)generate the ontology/ structure from docs-contexto/03_ontologia.md. Used for the initial bootstrap or to refresh the ontology from the source document.

## Usage

```
/bootstrap-ontology
/bootstrap-ontology --dry-run    # shows what would be created/updated without writing
/bootstrap-ontology --update     # updates existing files (preserves implementation_status)
```

## What it does

Reads `docs-contexto/03_ontologia.md` v0.1 and generates/updates `ontology/`:

1. **README.md** — from principles P1-P7 (section 3.1) and I1-I6 (section 3.2)
2. **CHANGELOG.md** — from roadmap section 9
3. **glossary.md** — from vocabulary in section 5 (object names + descriptions)
4. **entities/** — one file per object in section 5 (20 objects in v0.1)
5. **relationships.md** — from section 6 table
6. **state-machines/** — extracted from status enums in entities
7. **actions/** — one file per action in section 7 (25 actions in v0.1)
8. **workflows/** — from section 7.3 (workflow compositions)
9. **ADR 0001** — bootstrap decision record

## Behavior

### Default mode (first run or forced regeneration)

- Creates all files from scratch
- Sets `implementation_status: planned` for all entities/actions (conservative)
- You then manually update `implementation_status` to reflect current reality

### `--update` mode

- Reads existing files
- Updates descriptions and relationships from the source document
- PRESERVES: `implementation_status`, `related_files`, `last_review` — these are hand-maintained
- Bumps `ontology_version` if source document version changed

### `--dry-run` mode

- Shows a list of files that WOULD be created/updated
- Shows a diff preview for files that would change
- Does not write anything

## After running

1. Review the generated files for accuracy
2. Update `implementation_status` in entities that are already implemented
3. Update `related_files` with actual TypeScript file paths
4. Update `ontology/_index.json` with entity → files mapping
5. Run `/retro-ontology` to check coverage

## Note

This command was run once on 2026-05-03 to produce the initial bootstrap from `docs-contexto/03_ontologia.md` v0.1.
The ADR is at `ontology/decisions/0001-bootstrap-from-03-ontologia.md`.

Running it again will regenerate from the latest version of `docs-contexto/03_ontologia.md`.
