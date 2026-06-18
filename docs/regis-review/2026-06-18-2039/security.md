---
qa: Security
qa_slug: security
run_id: 2026-06-18-2039
agent: qa-security
generated_at: 2026-06-18T20:42:02Z
scope: backend
score: 7.5
findings_count: 5
cards_count: 5
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Ator externo não-autenticado (ou usuário autenticado tentando manipular `docCod` arbitrário) | `POST /permutas/adiantamentos/:docCod/processar` com `docCod` malformado / inexistente / pertencente a outro tenant; ou ausência de `Authorization: Bearer` | Endpoint Express `routes/permutas.ts` + `PermutaProcessamentoRepository` (UPSERT em `permuta_processamento`) | Produção (estado-alvo: AWS Lambda + Postgres por tenant; hoje: Express + Supabase Postgres único) | 401 quando sem JWT válido (`buildAuthMiddleware` global); 400 quando body inválido (Zod `processarBodySchema`); UPSERT idempotente por chave natural com `processado_por` derivado de `req.user.sub`/`email`; SQL 100% parametrizado (`$name`) | 0% de UPSERT sem `processado_por` populado; 0% de requests sem JWT atingindo o repositório; 0 sites de SQL interpolada em `repository/permutas/*`; 100% dos endpoints com Zod no body |

> A frente Permutas hoje é **READ-ONLY** sobre o Conexos e não dispara remessa Nexxera. O `POST /processar` muta apenas o estado próprio do analista (status no Postgres). O risco "mover dinheiro" entra em cena nas frentes SISPAG/Popula GED — fora do escopo desta fatia, mas as decisões de auth/SQL/audit aqui ficam para fundação dessas frentes.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Hardcoded secrets nos arquivos da Fase B | 0 | 0 | ✅ | `grep -rEn "(password\|secret\|token\|api[_-]?key\|credential)\s*[:=]\s*['\"][^'\"]{8,}"` em `repository/permutas`, `service/permutas`, `routes/permutas.ts`, `jobs`, `migrations` |
| AWS access keys vazadas | 0 | 0 | ✅ | `grep -rEn "AKIA[0-9A-Z]{16}"` em `src/backend` e `src/frontend` |
| `.env` versionados | 0 | 0 | ✅ | `git check-ignore` confirma `src/backend/.env` + `src/frontend/.env.local` gitignored |
| Endpoints da Fase B com Zod no body | 1/1 (`POST /processar` → `processarBodySchema.safeParse`) | 100% | ✅ | `routes/permutas.ts:14-17,79-83` |
| Endpoints da Fase B com validação de path param | 0/1 (`docCod` apenas `String(req.params.docCod)`) | 100% | ⚠️ | `routes/permutas.ts:84` |
| Sites de SQL string-interpolada nos repositórios novos | 0 | 0 | ✅ | `grep -n` em `PermutaProcessamentoRepository.ts` / `PermutaRelationalRepository.ts` — só `$name` e índices `_${i}` em nomes de placeholder; valores via params |
| `markStale` com nome de tabela literal (não input-driven) | 3/3 statements OK | 100% literal | ✅ | `PermutaRelationalRepository.ts:393-407` — só `$runId` é parametrizado |
| Endpoints da Fase B com auth obrigatória | 2/2 (`GET /gestao`, `POST /processar`) | 100% | ✅ | `index.ts:63` (`app.use(buildAuthMiddleware(...))`) + `routes/permutas.test.ts:95-103,250-260` cobrem 401 |
| Endpoints com autorização (RBAC / tenant scope) além de autenticação | 0/2 | 2/2 | ❌ | Nenhum check de role/tenant em `routes/permutas.ts` — qualquer usuário Supabase com JWT `aud=authenticated` passa |
| Fail-fast em ambiente deployado quando `DEV_AUTH_BYPASS=true` | presente | presente | ✅ | `authEnv.ts:79-89` (lista `prd/stg/hml` derruba boot) |
| Audit trail do botão "Processar" | `processado_por` + `processado_em` UPSERTed | persistente | ✅ | `PermutaProcessamentoRepository.ts:33-60` + migration `0004_permuta_processamento.sql` |
| Histórico imutável de quem processou (append-only) | 0 (UPSERT sobrescreve `processado_por` no próximo POST sobre o mesmo `docCod`) | append-only | ⚠️ | `PermutaProcessamentoRepository.ts:44-50` (`ON CONFLICT DO UPDATE` sobrescreve) |
| Tamanho máximo do `docCod` validado | sem limite (TEXT no DB, sem regex/maxLength) | maxLength ≤ 64 | ⚠️ | `routes/permutas.ts:84`; coluna `TEXT PRIMARY KEY` em `0004` |
| Frontend com `localStorage`/`sessionStorage` ad-hoc para token | 0 (delegado ao Supabase SDK) | 0 ad-hoc | ✅ | `frontend/lib/auth/token.ts:13-23` usa `supabase.auth.getSession()` |
| `dangerouslySetInnerHTML` no app Permutas | 0 | 0 | ✅ | `grep` em `src/frontend/app/permutas` |
| `npm audit` (quick mode — não executado) | N/A | N/A | ⚠️ Não medível neste run | `--quick` no run_id; pendente para o run full |

> ⚠️ **Não medível localmente**: failed-auth alarming, CloudTrail/GuardDuty, IAM least-privilege per-Lambda, CORS efetivo em produção — dependem do estado-alvo (Lambda + Terraform) que ainda não existe. Tracked nos _inbox-followups de outras revisões; fora do delta da Fase B.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Logging request/response (`[REQ]`/`[RES]`) inclui `requestId`, método, URL, status; `buildAuthMiddleware` faz `console.warn` em token expirado/inválido. Sem agregação/alarme. | ⚠️ parcial | `src/backend/index.ts:32-50` + `src/backend/http/auth.ts:166-172` |
| Detect Service Denial | `globalLimiter` aplicado pré-auth, `heavyRouteLimiter` montado em `/permutas`. | ✅ presente | `src/backend/index.ts:24,75` |
| Verify Message Integrity | JWT Supabase com `audience: 'authenticated'` e `issuer: ${SUPABASE_URL}/auth/v1`; HS256 + JWKS (ES256/RS256) suportados via `decodeProtectedHeader`. | ✅ presente | `src/backend/http/auth.ts:111-152` |
| Detect Message Delay | Não há checagem de `iat`/`nbf` skew além do default de `jose`; sem replay-cache. Endpoint `POST /eleicao` tem `Idempotency-Key`; `POST /processar` não tem — UPSERT por chave natural absorve duplicado de boa-fé. | ⚠️ parcial | `routes/permutas.ts:42-49` (eleicao) vs `:75-98` (processar — sem idempotency key explícita) |
| Identify Actors | `req.user.sub` (Supabase user id) + `req.user.email` (opcional) propagados ao repositório (`processadoPor`). | ✅ presente | `routes/permutas.ts:85` + `PermutaProcessamentoRepository.ts:33-60` |
| Authenticate Actors | Middleware global JWT (HS256 + JWKS) com fail-fast em `prd/stg/hml` quando `DEV_AUTH_BYPASS=true`. | ✅ presente | `src/backend/http/auth.ts:96-174` + `src/backend/http/authEnv.ts:79-89` |
| Authorize Actors | Apenas autenticação — qualquer JWT válido com `aud=authenticated` pode chamar `POST /processar` em qualquer `docCod`. Sem RBAC, sem tenant scoping. | ❌ ausente | `routes/permutas.ts:75-98` — nenhum check de role; estado-alvo da proposta (RBAC + SSO) ainda não implementado |
| Limit Access | Auth global + rate-limit, mas todos endpoints `/permutas/*` aceitam qualquer usuário autenticado; sem segmentação por perfil. | ⚠️ parcial | `src/backend/index.ts:63,75` |
| Limit Exposure | Backend Express monolítico (atual); estado-alvo é Lambda-por-tenant em conta AWS isolada. `processar` não envia dinheiro — exposição limitada a alteração de status em Postgres único. | ⚠️ parcial | CLAUDE.md "Estado Atual vs. Alvo" — multi-tenant AWS ainda não materializado |
| Encrypt Data | Supabase Postgres (TLS in-flight, AES-256 at-rest pelo provedor); JWT signing (HS256/ES256). Coluna `processado_por` armazenada como TEXT sem criptografia adicional (PII de baixa sensibilidade — sub UUID ou email). | ✅ presente | infra Supabase (provedor) |
| Separate Entities | "Uma conta AWS por cliente" ainda **não existe** (estado-alvo). Hoje há um único Postgres e a tabela `permuta_processamento` não tem coluna `tenant_id`/`client_id`. | ❌ ausente | migration `0004_permuta_processamento.sql` — sem coluna de tenant; nenhuma claim Supabase consultada para filtrar |
| Change Default Settings | `DEV_AUTH_BYPASS` default off; CORS via whitelist `ALLOWED_ORIGINS`; fail-fast em deploy. | ✅ presente | `src/backend/http/authEnv.ts:67-103` + `src/backend/index.ts:20` |
| Validate Input | Body: Zod `processarBodySchema` no `POST /processar`. Path param `docCod`: somente `String()` — sem regex/maxLength/charset; persiste em SQL parametrizado, então não há SQLi, mas há risco de payload arbitrário entrar no DB. | ⚠️ parcial | `routes/permutas.ts:14-17,79-84` |
| Revoke Access | Delegado ao Supabase (revogar sessão por usuário no painel). Sem revogação granular por `docCod` ou por ação. | ⚠️ parcial | Supabase Auth (provedor) |
| Lock Computer | N/A — autenticação via SSO/Supabase; lock-screen é responsabilidade do dispositivo do analista. | N/A | — |
| Inform Actors | `errorMiddleware` retorna payload genérico ao cliente, detalhe server-side; toasts no frontend. Não há notificação ao usuário em caso de tentativa suspeita. | ⚠️ parcial | `src/backend/http/errorMiddleware.ts` + `src/frontend/app/permutas/page.tsx` (`sonner.toast`) |
| Restore | Fora do escopo Security (overlap com Availability/Fault Tolerance). | N/A | cross-QA |
| Audit Trail | `processado_por` + `processado_em` UPSERTed; cabeçalho de run `permuta_eleicao_run` (kind ∈ {eleicao, ingest}) traz `triggered_by`. **MAS**: UPSERT sobrescreve o `processado_por` anterior no próximo POST sobre o mesmo `docCod` → trilha não é append-only. | ⚠️ parcial | `PermutaProcessamentoRepository.ts:33-60` + `0004_permuta_processamento.sql` |

## 4. Findings (achados)

### F-security-1: Endpoint `POST /processar` aceita qualquer usuário autenticado em qualquer `docCod` (sem RBAC nem tenant scoping)

- **Severidade**: P1 (alto — degrada QA mensurável)
- **Tactic violada**: Authorize Actors / Separate Entities
- **Localização**: `src/backend/routes/permutas.ts:75-98`
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts:75-98 — só checa req.user existe; nenhum check de role,
  // nenhum check de que o docCod pertence ao escopo do usuário.
  router.post('/adiantamentos/:docCod/processar', asyncHandler(async (req, res) => {
      ...
      const docCod = String(req.params.docCod);
      const processadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
      ...
      await repository.upsertProcessamento({ adiantamentoDocCod: docCod, ... });
  }));
  ```
- **Impacto técnico**: qualquer ator com sessão Supabase válida (`aud=authenticated`) pode marcar qualquer adiantamento como `processado` — inclusive `docCod` arbitrários que não existem (UPSERT cria a linha). Cross-tenant não acontece **hoje** porque há um único Postgres no estado atual; quando o estado-alvo (conta AWS por cliente) for materializado sem coluna `tenant_id` na tabela, a vulnerabilidade vira realidade.
- **Impacto de negócio**: um analista do cliente A consegue marcar "processado" o adiantamento do cliente B; pior ainda, um usuário com sessão Supabase de qualquer outro projeto que compartilhe o JWT secret/issuer pode atropelar o estado do analista real. Erosão da trilha de auditoria + retrabalho de operação.
- **Métrica de baseline**: 0/2 endpoints da Fase B aplicam autorização além de autenticação; 0 colunas `tenant_id`/`client_id` na tabela `permuta_processamento`.

### F-security-2: Path param `:docCod` não validado (sem maxLength/regex/charset)

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/routes/permutas.ts:84` + migration `0004_permuta_processamento.sql:11`
- **Evidência (objetiva)**:
  ```ts
  const docCod = String(req.params.docCod);  // sem .trim() / regex / maxLength
  // ...
  await repository.upsertProcessamento({ adiantamentoDocCod: docCod, ... });
  ```
  ```sql
  adiantamento_doc_cod    TEXT PRIMARY KEY,  -- sem CHECK de tamanho/charset
  ```
- **Impacto técnico**: SQLi está mitigado (`$adiantamentoDocCod` é placeholder parametrizado), mas o endpoint aceita qualquer string — inclusive `docCod` de 10 MB, com bytes nulos, ou com caracteres de controle. Cresce a tabela com lixo arbitrário; complica logs (`[REQ] body=...`) e dashboards.
- **Impacto de negócio**: poluição da tabela `permuta_processamento` (PK natural), latência futura de queries e relatórios, dificultar mapping com o Conexos cujos `doc_cod` reais têm formato bem definido (numérico, ≤ 20 chars na prática). Em cenário extremo, payloads gigantes inflam o disco do tenant.
- **Métrica de baseline**: maxLength validado = ∞ (TEXT sem CHECK + sem Zod no path).

### F-security-3: Audit trail do "Processar" não é append-only — UPSERT sobrescreve `processado_por`/`processado_em` anterior

- **Severidade**: P2 (médio)
- **Tactic violada**: Audit Trail
- **Localização**: `src/backend/domain/repository/permutas/PermutaProcessamentoRepository.ts:33-60`
- **Evidência (objetiva)**:
  ```sql
  INSERT INTO permuta_processamento (...) VALUES (...)
  ON CONFLICT (adiantamento_doc_cod) DO UPDATE SET
      ...
      processado_por = EXCLUDED.processado_por,
      processado_em = EXCLUDED.processado_em,
      updated_at = now()
  ```
- **Impacto técnico**: se o analista A processa o `docCod` X e o analista B o re-processa amanhã (ou se um agente automatizado reprocessa), o registro de quem foi A é perdido. A coluna `processado_por` reflete apenas o ÚLTIMO ator, não a sequência.
- **Impacto de negócio**: investigação ex-post de "quem aprovou esse adiantamento?" passa a depender apenas dos logs Express (`[REQ] ... body=...`) — que hoje vivem em stdout do Render, com retenção limitada. Para frentes futuras (SISPAG, Popula GED) que de fato movem dinheiro, esse mesmo padrão de UPSERT-on-conflict para o estado do analista é uma trilha falsa.
- **Métrica de baseline**: 0 linhas append-only escritas por POST; 1 linha mutada in-place por `docCod` independente de quantas vezes for processada.

### F-security-4: Frontend `processarAdiantamento` não envia `Idempotency-Key` (UPSERT idempotente mascara, mas perde a defesa)

- **Severidade**: P3 (baixo — melhoria opcional)
- **Tactic violada**: Detect Message Delay
- **Localização**: `src/frontend/lib/api.ts:72-92` + `src/backend/routes/permutas.ts:75-98`
- **Evidência (objetiva)**:
  ```ts
  // frontend
  const res = await fetch(`${API}/permutas/adiantamentos/${encodeURIComponent(docCod)}/processar`, {
      method: 'POST',
      headers: await withAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(invoiceDocCod ? { invoiceDocCod } : {}),
  });
  // backend — nenhum req.header('Idempotency-Key') é lido neste handler.
  ```
- **Impacto técnico**: duplo-clique / replay do mesmo POST reaproveita a chave natural (`adiantamentoDocCod`) e UPSERTa o mesmo estado, então não há corrupção. Porém, o handler **não distingue** entre "mesmo usuário clicou duas vezes" e "ator hostil replayou request capturado em rede" — o `POST /eleicao` ao lado já implementa `Idempotency-Key`, então a Fase B regrediu a higiene.
- **Impacto de negócio**: zero hoje (UPSERT absorve). Risco futuro quando o handler crescer para chamar Conexos / Nexxera — replay vira side-effect.
- **Métrica de baseline**: 1/2 endpoints com tratamento explícito de `Idempotency-Key` (eleicao sim; processar não).

### F-security-5: Logger Express dumpa `req.body` inteiro em stdout — `processadoPor` (email/sub) vaza para logs

- **Severidade**: P3 (baixo)
- **Tactic violada**: Encrypt Data / Inform Actors (princípio: minimizar PII em log)
- **Localização**: `src/backend/index.ts:32-50`
- **Evidência (objetiva)**:
  ```ts
  if (body && Object.keys(body).length)
      console.log(`[REQ] ${requestId} body=${JSON.stringify(body)}`);
  ```
- **Impacto técnico**: o body do `POST /processar` traz `invoiceDocCod` e `observacao` (livre — analista pode escrever PII do exportador). `req.user.email` não está no body (vem do JWT), mas é capturado em `[auth]` warns quando o token é rejeitado, e `processadoPor` é serializado no response (`[RES]`) quando há erro. Em produção, sem redaction, esses logs vão para stdout do Render (retenção limitada, mas acessível a quem tem acesso ao deploy).
- **Impacto de negócio**: vazamento de PII de baixa sensibilidade hoje (sub UUID, email corporativo). Em frentes futuras (SISPAG: número de conta, CNPJ; Popula GED: dados do exportador), o mesmo logger expõe dados regulados sem redaction.
- **Métrica de baseline**: 0 campos com mask/redaction no logger; 100% do body do POST persistido em stdout.

## 5. Cards Kanban

### [security-1] Adicionar autorização (RBAC/tenant) no `POST /processar` e na tabela `permuta_processamento`

- **Problema**
  > Hoje, qualquer JWT Supabase válido com `aud=authenticated` consegue marcar qualquer `docCod` como `processado`. Não há check de role, perfil ou tenant. No estado-alvo (uma conta AWS por cliente) sem coluna `tenant_id`, a primeira fatia multi-tenant herda um ator A capaz de mexer no fato do ator B. O endpoint UPSERTa em chave natural compartilhada por todos os clientes.

- **Melhoria Proposta**
  > Tactic: **Authorize Actors** + **Separate Entities**. Adicionar (a) claim de role/perfil no JWT Supabase (`role`/`app_metadata.permutas_role`); (b) middleware `requirePermutasRole(['analista','supervisor'])` aplicado ao `POST /processar`; (c) coluna `tenant_id`/`client_id` em `permuta_processamento` (e nos fatos), populada a partir do JWT, validada server-side antes do UPSERT. Arquivos: `routes/permutas.ts`, novo `http/authz.ts`, migration `0005_*_tenant_scope.sql`.

- **Resultado Esperado**
  > Endpoints com autorização: 0/2 → 2/2. UPSERT no `permuta_processamento` falha (403/404) quando o `docCod` não pertence ao tenant do JWT. Trilha de auditoria distingue ator legítimo de ator transversal.

- **Tactic alvo**: Authorize Actors, Separate Entities
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Endpoints da Fase B com check de role: 0/2 → 2/2
  - Colunas de tenant nos fatos da Fase B: 0/4 tabelas → 4/4
- **Risco de não fazer**: na primeira fatia multi-tenant, um analista do cliente A consegue alterar o estado do cliente B. O incidente vira ticket P0 retroativo + reescrita do schema sob pressão.
- **Dependências**: alinhar com a decisão de SSO/RBAC da proposta (institucional) — pode ser pré-requisito.

### [security-2] Validar `:docCod` no boundary (Zod + CHECK no schema)

- **Problema**
  > `POST /permutas/adiantamentos/:docCod/processar` aceita qualquer string como `docCod` — `String(req.params.docCod)` sem regex, sem maxLength. SQL está parametrizado, então não há SQLi, mas o endpoint UPSERTa lixo arbitrário na tabela (PK natural `TEXT` sem `CHECK`). Em log, body inteiro é serializado, então um `docCod` gigante polui stdout.

- **Melhoria Proposta**
  > Tactic: **Validate Input**. (a) Definir `docCodSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/)` e validar no handler antes de chamar o repositório; (b) adicionar `CHECK (length(adiantamento_doc_cod) BETWEEN 1 AND 64 AND adiantamento_doc_cod ~ '^[A-Za-z0-9._-]+$')` em migration nova; (c) responder 400 com mensagem clara quando inválido. Arquivos: `routes/permutas.ts`, `migrations/0006_*_docCod_check.sql`.

- **Resultado Esperado**
  > `docCod` validado em 2 camadas (HTTP + DB). Tentativa de UPSERT com payload >64 bytes ou charset inválido é rejeitada antes de tocar o repositório.

- **Tactic alvo**: Validate Input
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - Endpoints da Fase B com validação de path param: 0/1 → 1/1
  - Linhas com `docCod` fora do padrão Conexos: ? → 0 (CHECK garante)
- **Risco de não fazer**: poluição silenciosa da tabela; relatórios futuros precisam filtrar lixo; debugging de "porque há linhas com `docCod` UUID v4 aleatório?" consome ciclos de operação.
- **Dependências**: nenhuma.

### [security-3] Trilha de auditoria do "Processar" como append-only (`permuta_processamento_audit`)

- **Problema**
  > `upsertProcessamento` faz `ON CONFLICT DO UPDATE` em `processado_por` e `processado_em`. Quando o `docCod` é re-processado, a coluna passa a refletir apenas o último ator. O histórico de quem aprovou primeiro é descartado — a única trilha sobrevivente está nos logs Express stdout do Render, com retenção limitada e sem grep estruturado.

- **Melhoria Proposta**
  > Tactic: **Audit Trail**. (a) Manter o UPSERT em `permuta_processamento` como "estado atual" (necessário para o tela `/gestao`); (b) adicionar `permuta_processamento_audit (id SERIAL, adiantamento_doc_cod, status, processado_por, processado_em, observacao, created_at)` com INSERT a cada POST — append-only, sem UPDATE/DELETE; (c) `GET /permutas/adiantamentos/:docCod/historico` opcional para consultar. Arquivos: `PermutaProcessamentoRepository.ts`, `migrations/0007_*_processamento_audit.sql`, `routes/permutas.ts`.

- **Resultado Esperado**
  > Cada POST escreve 2 linhas: 1 UPSERT no estado atual + 1 INSERT no audit. Histórico de actor é recuperável sem depender de stdout. Aplica-se o mesmo padrão preventivamente para frentes futuras (SISPAG/Popula GED).

- **Tactic alvo**: Audit Trail
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Eventos `processar` capturados em DB: 0% → 100%
  - Retenção de trilha: stdout Render (~30d) → DB persistente (ilimitado)
- **Risco de não fazer**: investigação ex-post (auditoria interna, contestação de cliente) sem evidência objetiva de quem aprovou. Quando SISPAG entrar em produção, o mesmo gap vira P0.
- **Dependências**: nenhuma.

### [security-4] Honrar `Idempotency-Key` também no `POST /processar` (paridade com `/eleicao`)

- **Problema**
  > `POST /eleicao` já lê `Idempotency-Key` do header e dedupe a run. `POST /processar` regrediu — não lê o header, depende apenas da chave natural do UPSERT. Hoje não causa dano (UPSERT é idempotente), mas o handler vai crescer (ex.: disparar permuta no Conexos), e nesse momento o replay vira side-effect.

- **Melhoria Proposta**
  > Tactic: **Detect Message Delay**. Ler `req.header('Idempotency-Key')` no handler; quando presente, persistir em tabela `permuta_processamento_idempotency (key, doc_cod, response_hash)` para curto-circuitar replays. Frontend (`processarAdiantamento`) gera UUID v4 a cada clique. Arquivos: `routes/permutas.ts`, `frontend/lib/api.ts`, migration nova.

- **Resultado Esperado**
  > Replays do mesmo `Idempotency-Key` retornam a mesma resposta sem re-executar side-effects. Padrão alinhado com `POST /eleicao`.

- **Tactic alvo**: Detect Message Delay
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - Endpoints mutantes com Idempotency-Key: 1/2 → 2/2
- **Risco de não fazer**: quando o handler `/processar` evoluir para tocar Conexos/Nexxera, o replay deixa de ser inofensivo. Refatorar sob pressão depois é mais caro.
- **Dependências**: card security-3 (audit) define o canal para registrar replays detectados.

### [security-5] Redaction de PII no middleware de log (`req.body`)

- **Problema**
  > O middleware Express em `index.ts:32-50` faz `console.log('[REQ] ... body=' + JSON.stringify(body))` sem mascarar campos. O body do `POST /processar` carrega `invoiceDocCod` e `observacao` (livre — analista pode escrever PII do exportador). Em produção (Render stdout), qualquer pessoa com acesso ao deploy lê. Frentes futuras (SISPAG: conta, CNPJ; GED: dados do exportador) vão herdar o mesmo logger.

- **Melhoria Proposta**
  > Tactic: **Encrypt Data** (princípio: minimizar PII em logs em claro). Substituir o `console.log` por um logger estruturado com lista de campos sensíveis a redactar (`email`, `observacao`, `cnpj`, `accountNumber`, `body.processadoPor`); truncar bodies >2KB; aplicar `pino` ou expandir o `LogService` já existente. Arquivos: `src/backend/index.ts`, `src/backend/middleware/requestLogger.ts` (novo).

- **Resultado Esperado**
  > Campos sensíveis aparecem como `[REDACTED]` em stdout; `requestId` continua presente para correlação. Auditoria continua via `permuta_processamento_audit` (card security-3).

- **Tactic alvo**: Encrypt Data
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - Campos sensíveis vazando em stdout: vários → 0
  - Tamanho médio de log por request: ? → ≤2KB
- **Risco de não fazer**: cresce a superfície de exposição à medida que SISPAG/Popula GED entram. Compliance/regulação financeira (LGPD) torna isso uma multa potencial.
- **Dependências**: nenhuma; é pré-requisito antes das frentes que carregam CNPJ/conta.

## 6. Notas do agente

- Modo `--quick`: pulei `npm audit` profundo e varreduras infra/Terraform (não há `infra/` no estado atual; vide CLAUDE.md "Estado Atual vs. Alvo").
- Higiene de SQL na Fase B está sólida: `PermutaProcessamentoRepository` e `PermutaRelationalRepository` usam exclusivamente `$name`; o único "literal" são nomes de placeholder gerados por loop (`$docCod_${i}`) — esses **não** misturam input externo; os valores entram via `params[key] = r.docCod`. `markStale` usa nomes de tabela literais (hard-coded), nunca input.
- Cross-QA: **F-security-3** (audit append-only) sobrepõe com **Fault Tolerance** (durabilidade da trilha) e parcialmente com **Modifiability** (padrão reaproveitável para SISPAG/GED); **F-security-1** (RBAC + tenant) sobrepõe com **Modifiability** (decisão arquitetural do SSO) e com **Availability** (blast radius). **F-security-5** (redaction) overlaps com **Integrability** (logs estruturados como contrato externo).
- O JWT Supabase é o único gate hoje; não há autorização em camada — quando a fatia multi-tenant chegar (estado-alvo), o card security-1 vira P0 retroativo se ignorado.
