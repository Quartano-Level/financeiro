# Check Tenant Health

Proactive health check for a deployed tenant. Unlike `/diagnose-tenant` (which troubleshoots a broken tenant), this command is meant to run routinely — before issues arise — to confirm everything is operational.

The user MUST provide:
- **environment**: `dev` or `prd`
- **client_name**: The tenant name (e.g., `level`, `superia`, `cluster01`)

## Steps

### 1. Validate inputs and verify local config

- `environment` must be exactly `dev` or `prd`
- `client_name` must match `^[a-z][a-z0-9]*$`
- Verify `infra/tenants/tenants-vars/{environment}/{client_name}/` exists
- Read `account-vars.tfvars` to extract `tenant_account_id`

If config not found:
> "No configuration found for `{client_name}` in `{environment}`. Run `/new-tenant` to provision it."

### 2. Verify AWS identity

```bash
aws sts get-caller-identity
```

Check that the active account matches `tenant_account_id`. If not:
> "⚠️ Active account doesn't match expected tenant account {tenant_account_id}. Results may be for the wrong tenant."

### 3. Check Lambda functions

```bash
aws lambda list-functions --region us-east-1 \
  --query "Functions[?starts_with(FunctionName, '{environment}-{client_name}')].[FunctionName,LastModified,State]" \
  --output table
```

Report count and flag any function in non-Active state.

### 4. Check recent Lambda errors (last 24h)

For the first 3 Lambda functions found, query recent error count:

```bash
aws logs filter-log-events \
  --log-group-name "/aws/lambda/{environment}-{client_name}-{function_alias}" \
  --start-time $(date -d '24 hours ago' +%s000) \
  --filter-pattern "ERROR" \
  --query "events[].message" \
  --output text 2>&1 | head -20
```

Report:
- ✅ No errors in the last 24h
- ⚠️ N errors found — show the last error message

### 5. Check SSM parameters exist

Verify all 3 required parameters are present (without decrypting values):

```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/database_connection_string" --query "Parameter.LastModifiedDate" --output text 2>&1
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/conexos_credentials" --query "Parameter.LastModifiedDate" --output text 2>&1
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/nexxera_credentials" --query "Parameter.LastModifiedDate" --output text 2>&1
```

### 6. Check API Gateway

```bash
aws apigateway get-rest-apis --region us-east-1 \
  --query "items[?name=='{environment}-{client_name}-financeiro-api'].[id,name,createdDate]" \
  --output table
```

### 7. Invoke a Lambda (quick smoke test)

```bash
aws lambda invoke \
  --function-name "{environment}-{client_name}-hello1" \
  --payload '{}' \
  --region us-east-1 \
  /tmp/health-check-response.json \
  --query 'StatusCode' \
  --output text
```

Report the HTTP status code. Expected: 200.

### 8. Health report

```
## Tenant Health Report: {environment}/{client_name}
Account: {tenant_account_id} | Checked at: {timestamp}

| Component | Status | Detail |
|-----------|--------|--------|
| AWS Identity | ✅/⚠️ | Account: {id} |
| Lambda functions | ✅/❌ | Found: N — All active |
| Errors (24h) | ✅/⚠️ | N errors found |
| SSM: DB connection | ✅/❌ | Last updated: {date} |
| SSM: Conexos creds | ✅/❌ | Last updated: {date} |
| SSM: Nexxera creds | ✅/❌ | Last updated: {date} |
| API Gateway | ✅/❌ | {url or not found} |
| Smoke test | ✅/❌ | Status: {code} |

Overall: ✅ HEALTHY / ⚠️ DEGRADED / ❌ NOT WORKING

## Actions Required
[Only if issues found]
- {issue} → {suggested fix}
```

If all green:
> "Tenant `{environment}/{client_name}` is healthy. No issues detected."
