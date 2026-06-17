# Explain n8n Workflow

Reads an n8n workflow JSON file and explains what it does in clear language, then maps each part to the equivalent backend TypeScript component in this project.

Useful for FDEs who understand the n8n workflows but need to understand the TypeScript backend, and for the delta team planning migrations.

The user MUST provide:
- **workflow_file**: Path to the n8n JSON file (e.g., `Processa_NF.json` or a full path)

## Steps

### 1. Read the workflow file

Read the JSON file the user specified. If no path prefix is given, look for the file in the `level-nfse-workflows/` directory.

### 2. Parse the workflow structure

From the JSON, identify:
- **Workflow name** (`name` field)
- **Trigger node**: The node with no incoming connections (usually a Manual Trigger, Webhook, or Schedule)
- **All nodes**: Extract `name`, `type`, and key parameters for each node
- **Connection order**: Follow the connection graph to reconstruct the execution sequence

### 3. Plain-language explanation

Write a clear, non-technical summary of what this workflow does:

```
## What this workflow does

**Name:** {workflow_name}
**Trigger:** {how it starts}
**Purpose:** {1-2 sentence summary}

### Step-by-step flow
1. {plain language description of what happens first}
2. {next step}
3. ...

### What it produces / side effects
- {output or side effect 1}
- {output or side effect 2}

### Error handling
- {what happens when something fails}
```

### 4. Backend mapping

For each n8n node, map it to the backend equivalent:

```
## Backend Mapping

| n8n Node | n8n Type | Backend Equivalent | Status |
|----------|----------|-------------------|--------|
| Login | HTTP Request (POST /api/login) | ConexosClient.authenticate() | ✅ Exists |
| Get títulos | Supabase (SELECT titulo) | TituloRepository.findEligible() | ✅ Exists |
| Montar lote | Code (JavaScript) | LoteService.assemble() | ❓ Check |
| Send Email | Email | Check EmailClient | ❓ Check |
| Update Status | Supabase (UPDATE) | LoteRepository.updateStatus() | ❓ Check |
```

For "❓ Check" items, search the backend codebase:
```
Grep pattern in src/backend/: relevant class or method name
```

Then update status to ✅ Exists or ❌ Not implemented.

### 5. Migration status

```
## Migration Status

### Fully covered by backend
- {list of capabilities already implemented}

### Partially covered
- {list of capabilities with gaps}
  Gap: {what's missing}

### Not yet migrated
- {list of capabilities not in backend at all}
  Suggested: {what would need to be created}

## Recommendation
[If fully migrated]: This workflow's functionality is fully covered by the backend.
[If gaps exist]: Use the `/n8n-migrator` agent to plan the migration of the missing parts.
[If not migrated]: Use the `/n8n-migrator` agent to plan the full migration.
```
