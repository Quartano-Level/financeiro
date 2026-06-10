# Diagnose Tenant

Verifies the health of a deployed tenant environment. Answers the question "does the deployment work?" by checking infrastructure, secrets, and connectivity — without needing to open the AWS Console.

The user MUST provide:
- **environment**: `dev` or `prd`
- **client_name**: The tenant name (e.g., `level`, `superia`, `dev`, `cluster01`)

## Steps

### 1. Validate inputs and check local config

Verify that `infra/tenants/tenants-vars/{environment}/{client_name}/` exists with both files:
- `account-backend.hcl`
- `account-vars.tfvars`

Read `account-vars.tfvars` to extract `tenant_account_id`.

If the directory doesn't exist, stop and tell the user:
> "No configuration found for tenant `{client_name}` in environment `{environment}`. Run `/new-tenant` to create it."

### 2. Check AWS credentials

```bash
aws sts get-caller-identity
```

Show the result. If it fails:
> "AWS CLI is not configured or credentials have expired. Configure credentials for account {tenant_account_id} before continuing."

Check if the active account matches `tenant_account_id` from the tfvars. If not, warn:
> "⚠️ Warning: Active AWS account ({active_id}) doesn't match expected tenant account ({expected_id}). Results may be for the wrong tenant."

### 3. Check Lambda functions

```bash
aws lambda list-functions --region us-east-1 --query "Functions[?starts_with(FunctionName, '{environment}-{client_name}')].[FunctionName,LastModified,Runtime]" --output table
```

Expected: 7+ Lambda functions matching `{environment}-{client_name}-*`

Report:
- ✅ Found N Lambda functions
- ❌ No functions found — Terraform may not have been applied

For each function, also check the last modified date to confirm it has recent code.

### 4. Check SSM secrets

Check all 3 required secrets:

```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/database_connection_string" --with-decryption --query "Parameter.{Name:Name,LastModified:LastModifiedDate}" --output table
```

```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/conexos_credentials" --with-decryption --query "Parameter.{Name:Name,LastModified:LastModifiedDate}" --output table
```

```bash
aws ssm get-parameter --name "/tenants/{environment}/{client_name}/nexxera_credentials" --with-decryption --query "Parameter.{Name:Name,LastModified:LastModifiedDate}" --output table
```

For each parameter:
- ✅ Present and has a value (don't print the actual secret value)
- ❌ Missing — SSM parameter was not set after terraform apply
- ⚠️ Value appears to be the Terraform placeholder — needs to be updated manually

### 5. Check API Gateway URL

```bash
aws apigateway get-rest-apis --region us-east-1 --query "items[?name=='{environment}-{client_name}-financeiro-api'].[id,name,createdDate]" --output table
```

If found, construct the URL:
`https://{api_id}.execute-api.us-east-1.amazonaws.com/{environment}`

Test the health endpoint:
```bash
aws lambda invoke --function-name "{environment}-{client_name}-hello1" --payload '{}' --region us-east-1 /tmp/lambda-response.json && cat /tmp/lambda-response.json
```

Report:
- ✅ API Gateway found at `{url}`
- ✅ hello1 Lambda responds with 200
- ❌ API Gateway not found
- ❌ Lambda invocation failed

### 6. Check S3 bucket

```bash
aws s3 ls s3://{environment}-{client_name}-financeiro 2>&1
```

Report:
- ✅ S3 bucket accessible
- ❌ Bucket not found or access denied

### 7. Final health report

Output a structured report:

```
## Tenant Health Report: {environment}/{client_name}
Account ID: {tenant_account_id}
Checked at: {timestamp}

| Component | Status | Details |
|-----------|--------|---------|
| AWS Credentials | ✅/❌ | Account: {id} |
| Lambda Functions | ✅/❌ | Found: N functions |
| SSM: DB Connection | ✅/❌ | Last updated: {date} |
| SSM: Conexos Creds | ✅/❌ | Last updated: {date} |
| SSM: Nexxera Creds | ✅/❌ | Last updated: {date} |
| API Gateway | ✅/❌ | URL: {url} |
| hello1 Lambda | ✅/❌ | Response: {status} |
| S3 Bucket | ✅/❌ | {details} |

Overall: ✅ HEALTHY / ⚠️ PARTIAL / ❌ NOT WORKING

## Required Actions
[List only if there are failures]
1. [item] — how to fix
2. [item] — how to fix
```

If everything is ✅:
> "Tenant `{environment}/{client_name}` is fully operational. All components healthy."
