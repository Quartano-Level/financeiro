Systematic root cause investigation before any fix. Used by /feature-tweak when the intent starts with "fix:". Enforces "no fix without investigation" — inspired by the gstack /investigate tool.

## Usage

```
/investigate <symptom>
/investigate "permuta 1:1 não disparou na fin010 para o processo X"
/investigate "lote SISPAG falhou ao gerar a remessa para o diretório Nexxera"
```

## Investigation protocol

### Step 1: Reproduce

- Identify the specific failing case (título/permuta id, lote id, tenant, timestamp, error message)
- Find the exact log entry / error in CloudWatch or test output
- Reproduce locally in a test if possible — do not fix what you cannot reproduce

### Step 2: Trace backward

- Start from the symptom (wrong output, error, failure)
- Trace backward through the call stack:
  - Which Lambda handler processed this?
  - Which service method was called?
  - Which repository query ran?
  - What was the input to the failing function?

Use CodebaseNavigator + grep to follow the data flow.

### Step 3: Identify root cause

Ask at each layer:
- Is the data wrong (bad input)?
- Is the query wrong (wrong SQL)?
- Is the business logic wrong (wrong rule applied)?
- Is the config wrong (SSM param, mapeamento incorreto)?
- Is the ontology wrong (the rule as documented is incorrect)?

### Step 4: Document findings

Before proposing any fix, produce a findings report:

```markdown
## Investigation: [symptom]

**Reproducer:** [test case or log entry]
**Root cause:** [specific line/function/query that is wrong]
**Category:** data | query | business-logic | config | ontology

**Trace:**
1. handler X → 
2. service Y.method() →
3. repository Z.query() →
4. [where it goes wrong]

**Why it went wrong:** [explanation]

**Proposed fix:** [minimal change to fix root cause]
**Risk:** [blast radius — what else might break?]
**Regression test:** [test case that must pass after fix]
```

### Step 5: Confirm scope

Before fixing:
- Is the rule correct in `ontology/business-rules/` and only the implementation is wrong? → fix code only
- Is the rule itself wrong or incomplete in the ontology? → ontology diff needed + fix code
- Is this a one-off data issue? → fix data, add guard, consider if ontology needs update

### Step 6: Hand off

Pass findings to `/feature-tweak` with:
- Root cause identified
- Category (rule change vs implementation bug)
- Proposed fix
- Regression test

## Principles

- **Never fix what you cannot reproduce** — if you can't reproduce it, the investigation is incomplete
- **Never fix without understanding why** — "it was using OR instead of AND" tells you what, not why
- **Document the chain** — from symptom to root cause, not just the final answer
- **Smallest possible fix** — only change what is causing the issue, nothing more
