Gracefully pauses the AutoLoopRunner for a feature, saving state so it can resume later.

## Usage

```
/stop-loop <feature-slug>
/stop-loop nota-fiscal-chave-acesso
```

## What it does

1. **Signals AutoLoopRunner** to finish the current atomic operation (do not stop mid-file-write)
2. **Saves loop state** to `ontology/_inbox/[feature-slug]-loop-state.md`:

```markdown
# Loop State — [feature-slug]

**Stopped at:** [timestamp]
**Reason:** manual stop by Yuri
**Last completed task:** Task N — [description]
**Next step on resume:** [what to do next]

## Gate status
- typecheck: ✅ / ❌ / ⏳
- lint: ✅ / ❌ / ⏳  
- tests: ✅ / ❌ / ⏳
- PatternGuardian: ✅ / ❌ / ⏳
- ontology diff: ✅ / not needed / ⏳

## Files changed so far
- [list of files modified]

## Uncommitted work
[summary of what's done but not committed]
```

3. **Reports** to Yuri: "Loop stopped for [feature-slug]. State saved. Resume with `/feature-tweak [entity] 'resume: [feature-slug]'`."

## How to resume

```
/feature-tweak entities/[entity] "resume: [feature-slug]"
```

AutoLoopRunner reads `ontology/_inbox/[feature-slug]-loop-state.md` and continues from where it left off.

## Notes

- Stopping does NOT revert any code changes already made
- If you want to discard progress: `git checkout -- .` (manual)
- Loop state files are cleaned up automatically when the feature ships
