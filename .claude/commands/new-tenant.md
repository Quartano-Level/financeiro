# New Tenant Onboarding

> **(alvo)** Este comando provisiona um tenant em **AWS Lambda + Terraform** — o estado-alvo. **Atual:**
> não há `infra/`/Terraform nem nenhum tenant provisionado; a infra roda em **Render/Vercel/Supabase**
> (ver CLAUDE.md §"Estado Atual vs. Alvo"). Só execute depois que o scaffold de infra existir
> (`/feature-new infra "terraform tenant scaffold para financeiro"`).

Create the infrastructure configuration for a new tenant in the Financeiro platform.

The user MUST provide the following arguments. If they didn't, ask for them:
- **client_name**: Lowercase alphanumeric name for the tenant (regex: `^[a-z][a-z0-9]*$`)
- **environment**: `dev` or `prd`
- **tenant_account_id**: 12-digit AWS account ID

## Steps

### 1. Validate inputs
- `client_name` must match `^[a-z][a-z0-9]*$`
- `environment` must be exactly `dev` or `prd`
- `tenant_account_id` must be exactly 12 digits
- If any validation fails, explain the issue and ask the user to correct it

### 2. Check tenant doesn't already exist
Verify that `infra/tenants/tenants-vars/{environment}/{client_name}/` does NOT already exist. If it does, inform the user and stop.

### 3. Create tenant variable files

Create directory `infra/tenants/tenants-vars/{environment}/{client_name}/` with two files:

**`account-backend.hcl`**:
```hcl
bucket = "terraform-state.nf"
key    = "infra/{environment}/{client_name}/state.tfstate"
```

**`account-vars.tfvars`**:
```hcl
environment       = "{environment}"
client_name       = "{client_name}"
tenant_account_id = "{tenant_account_id}"

has_project_nf_service_structure = true
has_project_nf_inventory_management_strucure = true
```

Note: `has_project_nf_inventory_management_strucure` has an intentional typo (missing 't' in 'structure'). Do NOT fix this — it matches the existing Terraform variable name and changing it would require a state migration.

### 4. Run Terraform validation
```bash
cd infra/tenants
terraform init -backend-config="tenants-vars/{environment}/{client_name}/account-backend.hcl" -reconfigure
terraform validate
terraform plan -var-file="tenants-vars/{environment}/{client_name}/account-vars.tfvars"
```

Show the full plan output to the user and ask them to review it carefully before proceeding.

### 5. Remind user of manual steps
After validation succeeds, inform the user that these steps must be done manually:

1. **Apply Terraform** (must be done by the engineer, Claude cannot run `terraform apply`):
   ```bash
   terraform apply -var-file="tenants-vars/{environment}/{client_name}/account-vars.tfvars"
   ```

2. **Set SSM secrets** in the AWS Console for the tenant account:
   - `/tenants/{environment}/{client_name}/database_connection_string`
   - `/tenants/{environment}/{client_name}/conexos_credentials` (JSON: `{"login":"...","pass":"...","ApiUrl":"..."}`)
   - `/tenants/{environment}/{client_name}/nexxera_credentials` (JSON: `{"directory":"...","user":"...","pass":"..."}`) — bank gateway for SISPAG remessa/retorno
   - For the Popula GED front, also set the integration credentials it needs (e.g. `/tenants/{environment}/{client_name}/sharepoint_credentials` and `/tenants/{environment}/{client_name}/ged_credentials`). Provision only the parameters the contracted fronts require.

3. **Create and configure PostgreSQL database** for the tenant

4. **Update CI/CD** if needed (new workflow files in `.github/workflows/`)

### 6. Update documentation
Add the new tenant to the tenants table in the root `CLAUDE.md` file:
```
| {environment} | {client_name} | {tenant_account_id} |
```

### 7. Verify
Suggest the user run:
- `terraform plan` — should show no changes after apply
- Test Lambda invocation via the API Gateway URL
- Verify SSM parameter access works (Lambda connects to DB)
