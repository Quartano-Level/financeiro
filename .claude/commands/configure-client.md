# Configure Client

Guided checklist for configuring credentials and parameters of an already-provisioned tenant. This command comes AFTER `/new-tenant` (which creates infrastructure) — it sets up the secrets and validates connectivity.

The user MUST provide the following. Ask for anything missing:
- **environment**: `dev` or `prd`
- **client_name**: The tenant name (e.g., `level`, `superia`, `cluster01`)

## Steps

### 1. Validate inputs and verify tenant exists

- `environment` must be exactly `dev` or `prd`
- `client_name` must match `^[a-z][a-z0-9]*$`
- Verify `infra/tenants/tenants-vars/{environment}/{client_name}/` exists with both `account-backend.hcl` and `account-vars.tfvars`
- If the directory doesn't exist:
  > "Tenant `{client_name}` in environment `{environment}` has not been provisioned yet. Run `/new-tenant` first to create the infrastructure."

Read `account-vars.tfvars` to extract `tenant_account_id`.

### 2. Check AWS credentials

```bash
aws sts get-caller-identity
```

Verify the active account matches `tenant_account_id`. If not:
> "⚠️ Active AWS account doesn't match tenant account {tenant_account_id}. Switch credentials before continuing."

### 3. Check SSM parameters

Check each of the 3 required SSM parameters. For each one, report whether it exists and when it was last modified.

**Parameter 1: Database connection string**
```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/database_connection_string" --query "Parameter.{Name:Name,LastModifiedDate:LastModifiedDate,Type:Type}" --output table 2>&1
```

**Parameter 2: Conexos credentials**
```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/conexos_credentials" --query "Parameter.{Name:Name,LastModifiedDate:LastModifiedDate,Type:Type}" --output table 2>&1
```

**Parameter 3: Nexxera credentials** (bank gateway — remessa/retorno for SISPAG)
```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/nexxera_credentials" --query "Parameter.{Name:Name,LastModifiedDate:LastModifiedDate,Type:Type}" --output table 2>&1
```

> If the tenant also runs the Popula GED front (SharePoint → GED), add the corresponding integration credentials the same way (e.g. `/tenants/{environment}/{client_name}/sharepoint_credentials` and `/tenants/{environment}/{client_name}/ged_credentials`). Provision only the parameters the contracted fronts require.

For each missing parameter, generate the `aws ssm put-parameter` command ready to run:

```
aws ssm put-parameter \
  --name "/tenants/{environment}/{client_name}/database_connection_string" \
  --value "postgresql://USER:PASSWORD@HOST:PORT/DBNAME" \
  --type "SecureString" \
  --overwrite
```

```
aws ssm put-parameter \
  --name "/tenants/{environment}/{client_name}/conexos_credentials" \
  --value '{"login":"YOUR_LOGIN","pass":"YOUR_PASSWORD","ApiUrl":"https://YOUR_INSTANCE.conexos.cloud"}' \
  --type "SecureString" \
  --overwrite
```

```
aws ssm put-parameter \
  --name "/tenants/{environment}/{client_name}/nexxera_credentials" \
  --value '{"directory":"YOUR_REMITTANCE_DIR","user":"YOUR_USER","pass":"YOUR_PASSWORD"}' \
  --type "SecureString" \
  --overwrite
```

Tell the user to replace the placeholder values with actual credentials and run the commands. **Do NOT run `aws ssm put-parameter` yourself** — the user must do it to avoid storing secrets in conversation history.

### 4. Verify Lambda functions exist

```bash
aws lambda list-functions --region us-east-1 --query "Functions[?starts_with(FunctionName, '{environment}-{client_name}')].[FunctionName,Runtime,LastModified]" --output table
```

Expected: 7+ Lambda functions. If zero:
> "No Lambda functions found. Terraform may not have been applied yet. Run `terraform apply -var-file=\"tenants-vars/{environment}/{client_name}/account-vars.tfvars\"` first."

### 5. Test connectivity (smoke test)

If all SSM parameters are present AND Lambda functions exist, run a quick smoke test:

```bash
aws lambda invoke --function-name "{environment}-{client_name}-hello1" --payload '{}' --region us-east-1 /dev/null --log-type Tail --query 'LogResult' --output text 2>&1 | base64 -d
```

Report:
- ✅ Lambda responds successfully
- ❌ Lambda invocation failed — check logs

### 6. Configuration report

Output a structured summary:

```
## Client Configuration Report: {environment}/{client_name}
Account ID: {tenant_account_id}

| Component | Status | Action |
|-----------|--------|--------|
| Terraform infrastructure | ✅/❌ | [status] |
| SSM: database_connection_string | ✅/❌ | [Set / Already configured] |
| SSM: conexos_credentials | ✅/❌ | [Set / Already configured] |
| SSM: nexxera_credentials | ✅/❌ | [Set / Already configured] |
| Lambda functions | ✅/❌ | Found: N functions |
| Smoke test (hello1) | ✅/❌ | [result] |

## Next Steps
[List only pending items]
- [ ] Set SSM parameter: {name} (command provided above)
- [ ] Create PostgreSQL database on Supabase
- [ ] Run `/diagnose-tenant {environment} {client_name}` for full health check
```

If everything is ✅:
> "Client `{environment}/{client_name}` is fully configured and ready for operation."
