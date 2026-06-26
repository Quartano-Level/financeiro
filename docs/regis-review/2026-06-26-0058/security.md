---
qa: Security
qa_slug: security
run_id: 2026-06-26-0058
agent: qa-security
generated_at: 2026-06-26T00:58:00-03:00
scope: all
score: 5
findings_count: 12
cards_count: 10
---

# Security — Regis-Review

> Escopo: **all** (backend Express em Render + frontend Next.js em Vercel + Supabase Postgres). Sem
> `infra/` Terraform — multi-tenant SaaSo é alvo, não realidade. Auth = **JWT HS256 próprio**
> (`AUTH_JWT_SECRET`) validando contra `app_user` (bcrypt rounds=12), `requireRole('admin')` nas
> mutações. Escrita financeira (`fin010` permuta/baixa) gated por `CONEXOS_WRITE_ENABLED`+`CONEXOS_DRY_RUN`.
> Foco em CIA + blast radius de uma SaaSo financeira que move dinheiro no ERP.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Atacante externo (credential stuffing) **ou** insider com sessão admin vazada (JWT roubado via XSS / laptop comprometido) | Tenta autenticar/reusar token p/ disparar finalize-borderô, reconciliar-lote, ingestão Conexos (fan-out + escritas no `fin010`) | API Express (`POST /auth/login`, `POST /permutas/reconciliar-lote`, `POST /permutas/borderos/:b/finalizar`, `POST /permutas/ingestao`), Postgres (`app_user`, `permuta_alocacao_execucao`), credenciais Conexos no env Render | Produção (`CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`) | bcrypt rounds=12 + JWT 12h verificado em todo request; mutações exigem `role='admin'`; rate-limit 100/min global + 10/min nas rotas pesadas; default dry-run de escrita; logs estruturados (sem segredos via `redactBody`) com `requestId` correlacionável; borderô nasce "em cadastro" (não auto-finaliza) | 0 escritas no `fin010` sem `requestId`/`executadoPor` na trilha; 0 segredos no stdout dos drains; MTTD da credencial roubada < tempo de vida do JWT (hoje **12h** — sem revogação server-side, P1); 0 boots com `DEV_AUTH_BYPASS=true` em ambiente deploy. |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Segredos hardcoded no repo (regex `password\|secret\|token\|api[_-]?key`) | 0 | 0 | ✅ | `grep -rEn "...=\\s*['\"][...]{8,}" src/backend src/frontend` (sem matches reais) |
| AWS access keys no repo (`AKIA[0-9A-Z]{16}`) | 0 | 0 | ✅ | `grep -rEn "AKIA[0-9A-Z]{16}" src` (vazio) |
| `.env` committados (git-tracked) | 0 | 0 | ✅ | `git ls-files \| grep .env` → só `.env.example` |
| `.env` ignored corretamente | sim | sim | ✅ | `git check-ignore src/backend/.env src/frontend/.env.local` → ambos `src/backend/.env`/`src/frontend/.env.local` |
| Endpoints de MUTAÇÃO com `requireRole('admin')` | 14/14 | 14/14 | ✅ | `routes/permutas.ts:214,249,310,332,380,422,486,516,544,603,630,657,684,712` (todos POST/DELETE financeiros) |
| Endpoints de LEITURA atrás de auth global | 100% | 100% | ✅ | `index.ts:77` (`buildAuthMiddleware` aplicado antes dos routers de domínio) |
| Validação Zod nos boundaries (corpo/query) | todos endpoints com input (10/10) | 100% | ✅ | `routes/permutas.ts` (`safeParse` em 32-49, 169-186, 489, 520, 548); `routes/auth.ts:10-13,28-32` |
| SQL não-parametrizado (template literal com `${var}`) | 0 (interpolação restante é placeholder `$bor_${i}`, não valor) | 0 | ✅ | `grep -rEn "(SELECT\|INSERT\|UPDATE\|DELETE).*\\\$\\{[a-z]" src/backend/domain` → único hit é `permuta_bordero WHERE bor_cod NOT IN ($bor_0,$bor_1,…)` em `PermutaExecucaoRepository.ts:394` — gera **nomes de placeholder**, valores via `params` (`SqlBuilder.$name`) |
| `dangerouslySetInnerHTML` / `innerHTML` no frontend | 0 | 0 | ✅ | `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/frontend` → só comments do `AuthProvider` (`localStorage` doc) |
| bcrypt rounds (hash de senha admin) | **12** | ≥10 (OWASP 2023) | ✅ | `jobs/seed-admin.ts:18` |
| TTL do JWT de login | **12h** | ≤8h ideal; revogável server-side | ⚠️ | `AuthService.ts:24` (`TOKEN_EXPIRATION = '12h'`) |
| Revogação server-side de token / blacklist / rotation | **ausente** | presente | ❌ | `signOut()` em `AuthProvider.tsx:77-84` só faz `localStorage.removeItem` — backend não sabe que o token foi "revogado"; sem `jti` registrado em DB |
| Storage do JWT no browser | `localStorage` (`auth_token`) | cookie httpOnly+SameSite=strict (idealmente) | ⚠️ | `lib/auth/token.ts:5,19`, `AuthProvider.tsx:44,68` |
| Logout = invalidação real | só client-side | server-side ack + denylist | ❌ | `AuthProvider.tsx:77-84` (apenas remoção do `localStorage`) |
| Audit trail das ações financeiras (`fin010` write) | tabela `permuta_alocacao_execucao` (status, payload, erp_response, `executado_por`) | presente, persistido | ✅ | `migrations/0015_permuta_alocacao_execucao.sql:11-36` + `PermutaExecucaoRepository.ts:268-330` |
| Audit trail dos eventos de auth (login/logout/falha) | **ausente** (só stdout do Render) | tabela `app_audit` persistida | ❌ | `routes/auth.ts:25-43` — sem chamada ao `LogService` nem persistência; somente o middleware `auth.ts:167-170` faz `console.warn` |
| Falha de auth com lockout/back-off por conta | **ausente** | lockout após N tentativas | ❌ | `AuthService.login` (`AuthService.ts:48-57`) sempre devolve `null` em falha; sem contador por `username`. Rate-limit é por IP (atacante distribuído contorna). |
| CORS allow-list (não-wildcard) | sim — comma-sep `ALLOWED_ORIGINS` (suporte a `*.vercel.app` por sufixo) | sim | ✅ | `http/cors.ts:31-55`, `index.ts:27` |
| Rate-limit global / rota pesada | 100/min e 10/min por IP | presente | ✅ | `http/rateLimit.ts:17-35`, `index.ts:31,82,88` |
| Security headers (helmet: HSTS / X-Frame-Options / CSP) | **ausente** | helmet + CSP estrito | ❌ | `grep -rn "helmet\|csp\|hsts" src/backend` → 0 hits |
| CSRF token (state-mutating endpoints) | implicitamente coberto (Bearer no `Authorization`, FE anexa via `withAuthHeaders`, **não** via cookie auto-anexado) — porém CORS está `credentials: true` (cookies viajam se setados) | manter Bearer-only, remover `credentials: true` ou adicionar `SameSite=strict` quando migrar p/ cookie | ⚠️ | `http/cors.ts:49` `credentials: true`; `lib/auth/token.ts:27-32` (Bearer no header, não cookie) |
| Body redaction em logs (request/response) | presente (`redactBody`, lista de chaves sensíveis) | presente | ✅ | `http/redact.ts:10-44`, `index.ts:46-54` |
| Conexos `/login` body com password redigido no log | sim (`redactSensitive`) | sim | ✅ | `services/conexos.ts:41-63,88` |
| Conexos `sid`/Cookie logado no erro do ERP | NÃO (comentário explícito em `routes/permutas.ts:110-156` evita logar `Error.cause`) | NÃO | ✅ | `routes/permutas.ts:131-141` (loga `erpStatus`/`erpKey`/`erpData`, não a config Axios) |
| Frontend XSS surface (`dangerouslySetInnerHTML`) | 0 | 0 | ✅ | grep vazio em `src/frontend/{app,components,lib}` |
| `npm audit --audit-level=high` backend | **0 high / 0 critical** (1 low + 20 moderate, todos em devDeps: jest/ts-jest/esbuild/exceljs) | 0 high / 0 critical | ✅ | `cd src/backend && npm audit` → exit=0; CI `ci.yml:24` reforça |
| `npm audit --audit-level=high` frontend | **1 high** (`ws` 8.20.0 — GHSA-96hv-2xvq-fx4p, DoS memory-exhaustion) + 21 moderate + 1 low | 0 high / 0 critical | ❌ | `cd src/frontend && npm audit` → `ws` chega via `jest-environment-jsdom → jsdom@26.1.0 → ws@8.20.0` (DEV-only — não embarca no build Next), mas o **CI do frontend NÃO roda `npm audit`** (`.github/workflows/ci.yml:30-46`) |
| Defense-in-depth: rejeitar `DEV_AUTH_BYPASS=true` em prod | **quebrado** | rejeitar sempre que `environment != local` | ❌ | `http/authEnv.ts:52` (`DEPLOYED_ENVIRONMENTS = ['prd','stg','hml']`) vs `render.yaml:26` (`environment=production`) — guarda nunca dispara em produção real |
| Tenant isolation (multi-tenant) | **single-tenant hoje** — 1 Supabase + 1 Render + 1 Conexos | conta AWS por cliente (alvo) | ❌ | `CLAUDE.md` (estado atual vs alvo); `EnvironmentProvider.ts:44-72` (`GetLocalEnvironmentVars` é o único path em uso) |
| CloudTrail / GuardDuty | N/A (sem AWS hoje) | per-tenant quando migrar | N/A | sem `infra/` |

> ⚠️ **Não medível localmente**: MTTD de credencial vazada em produção, taxa de tentativas de login inválido, taxa de 401/403 por IP, presença de WAF / DDoS protection na borda do Render. Requer painel central (atualmente só `console.log` no drain do Render, sem agregador).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | `auth.ts:167-170` (`console.warn` 401), `auth.ts:192-194` (`console.warn` 403) — **sem agregação/alarme**; nenhum lockout por conta | ⚠️ parcial | `http/auth.ts:167-170, 192-194` |
| Detect Service Denial | `globalLimiter` 100/min + `heavyRouteLimiter` 10/min devolvem 429; sem alarme paging-grade | ⚠️ parcial | `http/rateLimit.ts:17-35` |
| Verify Message Integrity | JWT HS256 assinado/verificado via `jose` (`jwtVerify` em `auth.ts:142-152`); `audience='authenticated'` enforçado; Conexos write valida resposta (`bxa_cod_seq`) antes de gravar `settled` | ✅ presente | `http/auth.ts:136-153`, `PermutaExecucaoRepository.ts:277-310` |
| Detect Message Delay | N/A (sem fila/canal assíncrono crítico no caminho de auth) | N/A | — |
| Identify Actors | `req.user.sub`/`email` extraído do JWT verificado e propagado como `executadoPor`/`criadoPor` em todas as mutações (audit-friendly) | ✅ presente | `http/auth.ts:55-64`, `routes/permutas.ts:219,253,318,388,495,526,553,612,639,666,693,722` |
| Authenticate Actors | bcrypt (rounds=12) + JWT HS256 obrigatório em todo request fora de `/health` e `/auth/login`; `buildAuthMiddleware` rejeita 401 expirado/inválido | ✅ presente | `domain/service/auth/AuthService.ts:48-57`, `http/auth.ts:155-173`, `jobs/seed-admin.ts:18-24` |
| Authorize Actors | `requireRole('admin')` em 14 endpoints de mutação financeira; teste cobre 403 p/ role fora da lista; **único** role hoje (`admin`) — sem separação maker/checker (P1) | ⚠️ parcial | `http/auth.ts:183-200`, `migrations/0007_app_user.sql:8` (`role DEFAULT 'admin'`), `routes/permutas.ts` |
| Limit Access | Auth global + RBAC mutações + rate-limit + gate de escrita por env (`CONEXOS_WRITE_ENABLED`/`DRY_RUN`); read-only routes abertas a qualquer autenticado | ✅ presente | `index.ts:77,82`, `domain/service/permutas/ReconciliacaoPermutaService.ts:116-118` |
| Limit Exposure | CORS allow-list (não `*`), Bearer no header (não cookie), credenciais Conexos no env do Render (não no repo), default dry-run; **MAS**: JWT em `localStorage` (XSS = roubo direto), TTL 12h sem revogação, sem helmet/CSP, `npm audit` frontend não no CI, sem WAF | ⚠️ parcial | `http/cors.ts`, `lib/auth/token.ts:5,19`, `index.ts` (helmet ausente), `.github/workflows/ci.yml:30-46` |
| Encrypt Data | TLS no Render/Vercel/Supabase (herdado); senhas bcrypt rounds=12; JWT assinado; Postgres com pooler Supabase TLS; **secrets em SSM** ainda é alvo (hoje env vars do Render) | ✅ presente (single-tenant) | `jobs/seed-admin.ts:18`, `render.yaml:42-57` (`sync:false` força entrada manual) |
| Separate Entities | **Ausente** — single-tenant Express/Supabase compartilhado por todos os clientes da Columbia; o promessa SaaSo "1 conta AWS por cliente" é alvo, não realidade | ❌ ausente | `CLAUDE.md` (Estado Atual vs Alvo), `EnvironmentProvider.ts:21-26` |
| Change Default Settings | Escrita `fin010` desligada por default (`CONEXOS_WRITE_ENABLED=false`, `CONEXOS_DRY_RUN=true`); `DEV_AUTH_BYPASS=false` por default; `ALLOWED_ORIGINS` exige whitelist explícita | ✅ presente | `EnvironmentVars.ts:30-36`, `http/authEnv.ts:30-46`, `render.yaml:29-40` |
| Validate Input | Zod no boundary de toda rota com input (body + query + params coercion explícita); `safeParse` retorna 400 com detalhes | ✅ presente | `routes/permutas.ts:32-49,169-186,313,361,383,489,520,548`, `routes/auth.ts:10-13`, `http/validate.ts` |
| Revoke Access | **Ausente** — logout só `localStorage.removeItem`; token válido até `exp` (12h); sem `jti` denylist, sem rotação de chave automática | ❌ ausente | `AuthProvider.tsx:77-84`, `AuthService.ts:23-24` |
| Lock Computer | **Ausente** — sem lockout por conta após N tentativas; rate-limit é por IP (atacante distribuído contorna) | ❌ ausente | `AuthService.ts:48-57`, `http/rateLimit.ts` |
| Inform Actors | Falhas de auth devolvem 401 com `{error: 'Token expired'}`/`{error: 'Invalid token'}`; CORS rejeitado loga origin; **sem** e-mail / notificação ao usuário de tentativa anômala | ⚠️ parcial | `http/auth.ts:158,165-172`, `http/cors.ts:47` |
| Restore | DB Supabase com PITR (provider-managed); deploy reversível via Render (rollback de imagem); idempotência write-ahead em `permuta_alocacao_execucao` permite reprocessar com mesma `idempotency_key` | ✅ presente | `migrations/0015_permuta_alocacao_execucao.sql`, cross-ref Availability |
| Audit Trail | **Parcial**: ações `fin010` (write) persistidas em `permuta_alocacao_execucao` com `executado_por` + payload + resposta crua do ERP. **Mas**: eventos de auth (login OK/falha, logout) **NÃO** persistem em tabela — só `console.warn` no drain | ⚠️ parcial | `migrations/0015_*.sql`, `PermutaExecucaoRepository.ts:268-330` (write financeiro) vs `routes/auth.ts:25-43` (sem audit) e `http/auth.ts:167-170` (só console) |

## 4. Findings (achados)

### F-security-1: Defesa em profundidade quebrada — `DEV_AUTH_BYPASS=true` é aceito em produção real (`environment=production`)

- **Severidade**: P1
- **Tactic violada**: Change Default Settings / Limit Exposure
- **Localização**: `src/backend/http/authEnv.ts:52, 89-99` ↔ `render.yaml:25-26`
- **Evidência (objetiva)**:
  ```
  src/backend/http/authEnv.ts:52   DEPLOYED_ENVIRONMENTS = ['prd', 'stg', 'hml'] as const;
  src/backend/http/authEnv.ts:89   const isDeployedEnvironment = DEPLOYED_ENVIRONMENTS.includes(parsed.environment as ...);
  src/backend/http/authEnv.ts:92   if (parsed.DEV_AUTH_BYPASS && isDeployedEnvironment) { throw new Error(...) }
  render.yaml:25-26                - key: environment
                                     value: production
  ```
  Render define `environment=production`, mas o guard só dispara para `prd|stg|hml`. Em produção real a string `'production'` falha o `.includes()` e o crash de boot **não acontece** se `DEV_AUTH_BYPASS=true`.
- **Impacto técnico**: a única salvaguarda de boot contra desabilitar a auth foi neutralizada por divergência de nomes. Se um operador setar `DEV_AUTH_BYPASS=true` no dashboard Render (ou um deploy futuro herdar essa env), o backend sobe **sem qualquer validação de JWT**.
- **Impacto de negócio**: API financeira (finaliza borderô, dispara baixa no `fin010`, executa lote) ficaria pública. Qualquer pessoa com a URL `onrender.com` poderia mover dinheiro.
- **Métrica de baseline**: 1/1 environment names divergem entre código e config; 0 testes de boot cobrindo o caminho `environment=production` + bypass=true.

### F-security-2: JWT armazenado em `localStorage` sem revogação server-side (12h de credencial viva pós-roubo)

- **Severidade**: P1
- **Tactic violada**: Limit Exposure + Revoke Access
- **Localização**: `src/frontend/lib/auth/token.ts:5,19`, `src/frontend/lib/auth/AuthProvider.tsx:44,68,77-84`, `src/backend/domain/service/auth/AuthService.ts:23-24`
- **Evidência (objetiva)**:
  ```
  src/frontend/lib/auth/token.ts:5   export const TOKEN_STORAGE_KEY = 'auth_token'
  src/frontend/lib/auth/token.ts:19  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined
  src/frontend/lib/auth/AuthProvider.tsx:77-84  signOut → window.localStorage.removeItem(...)
  src/backend/domain/service/auth/AuthService.ts:24  const TOKEN_EXPIRATION = '12h';
  ```
  Sem `jti` registrado em DB, sem denylist consultada no middleware, sem rotação automática de `AUTH_JWT_SECRET`. `signOut()` no FE não fala com backend.
- **Impacto técnico**: token roubado (XSS em qualquer página do app; cópia do `localStorage` de uma sessão aberta; backup de browser sincronizado) permanece válido por até 12h. Logout NÃO invalida nada server-side. Para "revogar de verdade" hoje é preciso rotacionar `AUTH_JWT_SECRET` (derruba TODOS os usuários — disruptivo, então ninguém faz).
- **Impacto de negócio**: janela de 12h para um JWT comprometido executar `POST /permutas/borderos/:b/finalizar` / `POST /permutas/reconciliar-lote` (baixa em massa no `fin010`). Em ataque dirigido, isso é tempo de sobra para emitir múltiplos borderôs.
- **Métrica de baseline**: TTL do token = **12h**; capacidade de revogação server-side = **0**; testes cobrindo invalidação de token = **0**.

### F-security-3: Único role `admin` para toda mutação — sem separação maker/checker em ação financeira destrutiva

- **Severidade**: P1
- **Tactic violada**: Authorize Actors (granularidade) / Limit Exposure (blast radius)
- **Localização**: `src/backend/migrations/0007_app_user.sql:8`, `src/backend/routes/permutas.ts` (14 endpoints `requireRole('admin')`), `src/backend/jobs/seed-admin.ts:27`
- **Evidência (objetiva)**:
  ```
  migrations/0007_app_user.sql:8   role TEXT NOT NULL DEFAULT 'admin'
  jobs/seed-admin.ts:27            await repository.upsertAdmin(username, passwordHash, 'admin');
  routes/permutas.ts                14× requireRole('admin') — não há 'analyst', 'approver', 'viewer'
  ```
- **Impacto técnico**: o sistema autoriza **a mesma role** para criar alocação, executar reconciliação (escreve no `fin010`), finalizar borderô, estornar, excluir e lote. Não há 4-eyes, não há separação por filial/cliente, não há leitura privilegiada vs escrita. Qualquer credencial comprometida = toda a superfície destrutiva.
- **Impacto de negócio**: um único insider/credencial vazada pode finalizar borderôs sem aprovação independente. A proposta da Columbia coloca controle financeiro como diferencial — single-role é incompatível com a promessa de compliance/SOC.
- **Métrica de baseline**: distinct roles em `app_user` = **1** (`admin`); endpoints exigindo 2-pessoas = **0**; usuários do sistema hoje = **1** (seed admin via env).

### F-security-4: Eventos de autenticação (login/logout/falha) sem audit trail persistente

- **Severidade**: P1
- **Tactic violada**: Audit Trail / Detect Intrusion
- **Localização**: `src/backend/routes/auth.ts:25-43`, `src/backend/http/auth.ts:167-170`
- **Evidência (objetiva)**:
  ```
  routes/auth.ts:25-43           POST /auth/login — não chama LogService, não persiste em tabela
  http/auth.ts:167-170           rejeições 401 → console.warn (stdout do Render, sem agregação)
  ```
  `grep "audit\|login_event\|app_audit" src/backend/migrations` → 0 matches relacionados a auth.
- **Impacto técnico**: impossível responder "quem tentou logar com `marco` nas últimas 24h?", "quem teve sessão ativa quando o borderô X foi finalizado?", "houve burst de 401 antes do login OK suspeito?". Drain do Render expira (retenção curta), sem SIEM.
- **Impacto de negócio**: detectar e investigar credential-stuffing / sessão sequestrada vira reconstrução manual de logs com tempo de retenção limitado. Em uma SaaSo financeira o compliance (SOX-like, LGPD trilha de acesso) exige trilha persistida.
- **Métrica de baseline**: linhas de `app_audit_login` = **N/A (tabela não existe)**; ferramenta de busca de evento de auth = **`grep` no drain do Render** (retenção ~7d no plano Starter).

### F-security-5: Sem lockout por conta após N falhas — rate-limit é por IP (atacante distribuído contorna)

- **Severidade**: P1
- **Tactic violada**: Lock Computer / Detect Intrusion
- **Localização**: `src/backend/domain/service/auth/AuthService.ts:48-57`, `src/backend/http/rateLimit.ts:17-26`
- **Evidência (objetiva)**:
  ```
  AuthService.ts:48-57   if (!user) return null;
                         const passwordMatches = await bcrypt.compare(password, user.passwordHash);
                         if (!passwordMatches) return null;       // sem contador / sem lockout
  http/rateLimit.ts:17-26  globalLimiter = 100/min por IP        // por IP — botnet contorna
  ```
- **Impacto técnico**: `POST /auth/login` aceita tentativas ilimitadas pelo mesmo `username` desde que cada IP fique abaixo de 100/min. bcrypt rounds=12 retarda (~100-300ms/tentativa) mas não trava. Sem alarme de "N falhas no mesmo username".
- **Impacto de negócio**: credential stuffing distribuído contra `admin` ou usuários conhecidos. Combinado com F-security-4 (sem audit) → time não detecta.
- **Métrica de baseline**: tentativas/min permitidas no mesmo username por IPs distintos = **ilimitado**; lockout time = **0s**.

### F-security-6: Frontend sem gate `npm audit` no CI — `ws` HIGH (DoS memory-exhaustion) passa

- **Severidade**: P1
- **Tactic violada**: Limit Exposure (supply chain)
- **Localização**: `.github/workflows/ci.yml:30-46`, `src/frontend/node_modules/ws@8.20.0` (via `jest-environment-jsdom@30.3.0` → `jsdom@26.1.0`)
- **Evidência (objetiva)**:
  ```
  cd src/frontend && npm audit --audit-level=high → 1 high (ws GHSA-96hv-2xvq-fx4p, CVSS 7.5)
  ci.yml:30-46  frontend job NÃO chama `npm audit` (backend chama em ci.yml:24)
  ```
  `ws` é dev-only (não embarca no build Next), mas isso é coincidência — qualquer high futuro em dep direta passa sem ser pego.
- **Impacto técnico**: ausência de gate no CI permite que uma vuln high em dep direta de runtime (Next, React, zod, sonner, etc.) entre em prod sem ser sinalizada.
- **Impacto de negócio**: descoberta tardia de CVE em prod (via news, não via CI) → janela de exposição maior que o necessário.
- **Métrica de baseline**: backend high = **0** (gate ativo); frontend high = **1** (sem gate); frontend total = **23 vulns** (1 high / 21 moderate / 1 low).

### F-security-7: Sem `helmet` / security headers (HSTS, X-Frame-Options, CSP)

- **Severidade**: P2
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/index.ts:16-97` (sem `app.use(helmet())`)
- **Evidência (objetiva)**:
  ```
  grep -rn "helmet\|content-security-policy\|x-frame-options\|hsts" src/backend → 0 matches
  ```
- **Impacto técnico**: respostas sem `Strict-Transport-Security`, sem `X-Content-Type-Options: nosniff`, sem `Referrer-Policy`. Frontend Vercel já adiciona alguns, mas o backend (alvo direto de XHR) não.
- **Impacto de negócio**: hardening de browser ausente; downgrade attacks e clickjacking dependem só do FE/CDN.
- **Métrica de baseline**: security headers padrão setados pelo backend = **0**; alvo = **≥5** (helmet defaults).

### F-security-8: Single-tenant hoje vs promessa SaaSo "conta AWS por cliente" — blast radius compartilhado

- **Severidade**: P1
- **Tactic violada**: Separate Entities
- **Localização**: `CLAUDE.md` (Estado Atual vs Alvo), `src/backend/domain/libs/environment/EnvironmentProvider.ts:21-26`, `render.yaml`, `DEPLOY.md:1-15`
- **Evidência (objetiva)**:
  ```
  CLAUDE.md           "Atual: Express (src/backend) + Next.js (...), deploy Render + Vercel, auth/DB Supabase"
                      "Alvo: AWS Lambda + Terraform multi-tenant (NÃO existe ainda)"
  EnvironmentProvider.ts:21-22  if (!process.env.client_name || process.env.client_name === 'local') {
                                    return this.GetLocalEnvironmentVars();   // ÚNICO path executado hoje
  render.yaml:27-28  - key: client_name
                       value: local
  ```
- **Impacto técnico**: 1 Supabase + 1 Render + 1 conjunto de credenciais Conexos hoje. Não há isolamento criptográfico, de rede ou de IAM entre clientes. Adicionar cliente B significa compartilhar tudo com cliente A.
- **Impacto de negócio**: a promessa central do contrato SaaSo ("compromisso em A não vaza para B") **não está cumprida** — é débito arquitetural conhecido (migration-debt). Ao onboarding do segundo cliente, isto vira P0.
- **Métrica de baseline**: contas AWS provisionadas = **0**; tenants em SSM = **0**; isolamento Postgres por cliente = **0** (single Supabase project); promessa SaaSo cumprida = **N/A** (single-tenant pilot).

### F-security-9: `.env` local aponta para Supabase e Conexos de produção — laptop do dev = vetor de PROD

- **Severidade**: P1
- **Tactic violada**: Limit Access / Separate Entities
- **Localização**: `src/backend/.env` (não-versionado; conteúdo descrito no prompt do reviewer), `EnvironmentProvider.ts:44-72`
- **Evidência (objetiva)**:
  ```
  src/backend/.env  CONEXOS_BASE_URL=<prd>
                    CONEXOS_USERNAME=<prd>
                    CONEXOS_PASSWORD=<prd>
                    databaseConnectionString=<prd Supabase pooler>
                    AUTH_JWT_SECRET=<...>
  EnvironmentProvider.ts:44-72  GetLocalEnvironmentVars() lê direto do dotenv
  ```
  `.env` está em `.gitignore` (confirmado) — mas vive no disco do dev e no histórico de shell.
- **Impacto técnico**: roubo/compromisso do laptop do desenvolvedor = acesso direto às credenciais Conexos de produção (escrita habilitada por env se ele rodar `CONEXOS_WRITE_ENABLED=true`) e à conexão do Postgres Supabase de produção (leitura + escrita sem IP restriction se o Supabase pooler estiver aberto a `0.0.0.0/0`).
- **Impacto de negócio**: um dev = uma chave-mestra do ambiente real. Não há separação dev/hml/prd em Conexos (não existe HML para Permutas hoje) — então a alternativa "aponte local para HML" não está disponível.
- **Métrica de baseline**: ambientes Conexos distintos disponíveis = **1** (PRD); separação dev↔prod = **0**; uso de OS-keychain para secrets locais (em vez de `.env` flat) = **0**.

### F-security-10: `credentials: true` no CORS sem uso real de cookies — superfície CSRF latente se um cookie for adicionado no futuro

- **Severidade**: P2
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/http/cors.ts:49`, `src/frontend/lib/auth/token.ts:27-32`
- **Evidência (objetiva)**:
  ```
  http/cors.ts:49     credentials: true,
  lib/auth/token.ts:27-32   Authorization: `Bearer ${token}`   // header, não cookie
  ```
- **Impacto técnico**: hoje o token vai por `Authorization` (não-CSRF-vulnerável, browser não auto-anexa cross-origin). Mas `credentials: true` autoriza envio de cookies — se um dia alguém setar um cookie de sessão (e.g. para mitigar F-security-2 movendo para httpOnly cookie), CSRF vira problema sem proteção atual (token CSRF / `SameSite=strict`).
- **Impacto de negócio**: armadilha para refactor futuro — quem implementar o cookie httpOnly precisa lembrar de adicionar CSRF token + `SameSite=strict`.
- **Métrica de baseline**: defesa CSRF presente = **0**; uso real de cookie sessão = **0** (Bearer-only).

### F-security-11: Errormiddleware não inclui `requestId` na resposta de 500 — quebra correlação no incidente

- **Severidade**: P3
- **Tactic violada**: Audit Trail (corelacionar usuário↔log)
- **Localização**: `src/backend/http/errorMiddleware.ts:35`
- **Evidência (objetiva)**:
  ```
  errorMiddleware.ts:35  res.status(500).json({ error: 'Internal server error' });
  ```
  Resposta sem `requestId` — o `requestIdMiddleware` (que adiciona o header `X-Request-Id`) ainda funciona, mas o usuário relatando um bug não consegue ler o ID do payload (só do header).
- **Impacto técnico**: triagem de incident por suporte fica mais lenta.
- **Métrica de baseline**: % de respostas 500 com `requestId` no body = **0**; alvo = **100%**.

### F-security-12: Ausência de proteção contra timing-attack na resposta "usuário não existe" vs "senha errada"

- **Severidade**: P3
- **Tactic violada**: Limit Exposure (info-leak)
- **Localização**: `src/backend/domain/service/auth/AuthService.ts:48-57`
- **Evidência (objetiva)**:
  ```
  AuthService.ts:50  if (!user) return null;                          // retorno IMEDIATO (sem bcrypt)
  AuthService.ts:52  const passwordMatches = await bcrypt.compare(...) // ~100-300ms bcrypt
  AuthService.ts:53  if (!passwordMatches) return null;
  ```
  Path "usuário inexistente" é ~100× mais rápido que "senha errada" — enumeração de usernames via timing.
- **Impacto técnico**: atacante consegue distinguir usuários existentes de inexistentes medindo latência. Combinado com F-security-5 (sem lockout) torna credential stuffing dirigido.
- **Impacto de negócio**: hoje 1 usuário (`admin`) — risco baixo. Vira P2 quando o sistema crescer para múltiplos analistas.
- **Métrica de baseline**: dummy bcrypt no fast-path = **0**; tempo médio de resposta `usuário inexistente` ≈ **<10ms** vs `senha errada` ≈ **150-300ms**.

## 5. Cards Kanban

### [security-1] Alinhar `DEPLOYED_ENVIRONMENTS` ao valor real de `environment` em produção

- **Problema**
  > `loadAuthEnv()` em `http/authEnv.ts:52` só rejeita `DEV_AUTH_BYPASS=true` quando `environment` é `prd|stg|hml`, mas o `render.yaml:26` define `environment=production`. O guard nunca dispara em produção real — basta um operador setar `DEV_AUTH_BYPASS=true` no dashboard Render para o backend subir SEM auth e expor todas as rotas financeiras.

- **Melhoria Proposta**
  > Inverter a lógica: marcar APENAS `local` como ambiente seguro (paridade com o frontend `assertAuthEnv` em `lib/auth/env.ts:20-39`). Adicionar teste de boot que prova: `environment=production` + `DEV_AUTH_BYPASS=true` → throw. Padronizar o vocabulário (`production` ou `prd`) em `render.yaml`, `.env.example`, `DEPLOY.md` e código.

- **Resultado Esperado**
  > Qualquer ambiente que não seja `local` rejeita o bypass no startup. **Métrica**: testes cobrindo `environment ∈ {production, prd, stg, hml, dev}` + bypass → 0 hoje, alvo 5/5.

- **Tactic alvo**: Change Default Settings / Limit Exposure
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Boots com `DEV_AUTH_BYPASS=true` em `environment != local`: indeterminado → **0 (crash)**
  - Testes regression: 0 → **≥3**
- **Risco de não fazer**: latente — uma config errada no dashboard Render derruba todo o resto da defesa.
- **Dependências**: nenhuma.

### [security-2] Revogação server-side de JWT (denylist por `jti`) + reduzir TTL

- **Problema**
  > Hoje o JWT (HS256, 12h, `AuthService.ts:24`) vive em `localStorage` (`lib/auth/token.ts:5`), o logout só faz `localStorage.removeItem`, e o backend não sabe que o token foi revogado. Um token roubado por XSS / dump de localStorage / laptop comprometido permanece válido por até 12h — janela suficiente para finalizar dezenas de borderôs no `fin010`.

- **Melhoria Proposta**
  > Adicionar `jti` no `signToken` (`AuthService.ts:59-75`), tabela `app_session` ou `app_token_revoked (jti, revoked_at)`. `signOut()` chama `POST /auth/logout` que insere o `jti`. `buildAuthMiddleware` (`http/auth.ts:155-173`) faz `selectFirst` por `jti` antes de aceitar (cache de 60s em memória). Reduzir TTL para 4h. Bass: Revoke Access.

- **Resultado Esperado**
  > Logout efetivo server-side; revogação manual de sessão suspeita; auditoria de "quem estava logado quando". **Métrica**: tempo entre `signOut()` e token recusado pelo backend = `setTimeout` indefinido (12h) → **≤ 60s** (TTL do cache). TTL: 12h → 4h.

- **Tactic alvo**: Revoke Access
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - TTL de token: 12h → **4h**
  - Latência de revogação: ∞ → **≤60s**
  - Linhas de `app_token_revoked` consultadas no middleware: 0 → 100% requests
- **Risco de não fazer**: JWT comprometido = 12h de baixa autorizada no `fin010`. Em ataque dirigido, dezenas de borderôs finalizados.
- **Dependências**: nenhuma (mas idealmente vem depois de security-4 — audit trail — para enriquecer o "quem revogou").

### [security-3] Granularidade RBAC: separar `analyst`, `approver`, `viewer` e exigir 4-eyes para ações destrutivas

- **Problema**
  > Único role `admin` (`migrations/0007_app_user.sql:8`, `seed-admin.ts:27`) — toda mutação financeira (finalizar borderô, executar lote, estornar, excluir baixa) está autorizada pelo mesmo nível. Sem maker/checker, sem separação por filial. Uma credencial comprometida abre toda a superfície destrutiva, e a promessa de compliance "financeiro tem controles" não se sustenta.

- **Melhoria Proposta**
  > Modelo de roles: `viewer` (só `/gestao`, `/painel`, `/runs`), `analyst` (cria/edita alocação, processa, executa baixa individual), `approver` (finaliza borderô, executa lote, estorna), `admin` (gerência de usuários, override). Exigir 2 pessoas distintas para `POST /permutas/borderos/:b/finalizar` (analyst cria, approver finaliza). Atualizar `requireRole` em `routes/permutas.ts` (14 endpoints).

- **Resultado Esperado**
  > Compromisso de credencial isolada por papel; nenhuma única conta capaz de fechar o ciclo. **Métrica**: distinct roles em `app_user` = 1 → **≥3**; endpoints com 4-eyes = 0 → **≥2** (finalizar borderô, executar lote).

- **Tactic alvo**: Authorize Actors (granularidade)
- **Severidade**: P1
- **Esforço estimado**: L
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Roles distintas: 1 → **≥3**
  - Endpoints com aprovação independente: 0 → **2** (finalizar borderô, reconciliar-lote)
  - Auditoria de "quem aprovou X criado por Y": ausente → presente
- **Risco de não fazer**: única credencial vazada = dano máximo. Bloqueia compliance financeiro (SOX-like, ISO27001 SoD).
- **Dependências**: security-4 (audit) para registrar pares maker/checker.

### [security-4] Tabela de audit trail de auth (login OK/falha, logout, revogação)

- **Problema**
  > Eventos de auth não persistem (`routes/auth.ts:25-43` não chama `LogService`, `http/auth.ts:167-170` só `console.warn`). Drain do Render tem retenção curta — impossível responder forenses ("quem tentou logar com `marco` nas últimas 24h?", "houve burst antes do login OK suspeito?"). Compliance LGPD/financeiro exige trilha persistida.

- **Melhoria Proposta**
  > Migration `app_audit_auth (id, ts, event_type, username, ip, user_agent, request_id, success, reason)`. `AuthService.login` grava `LOGIN_OK`/`LOGIN_FAIL` (com motivo: `user_not_found`/`bad_password`). Middleware `auth.ts` grava `TOKEN_REJECTED` (motivo: expirado/inválido). `signOut()` grava `LOGOUT`. Índice por `(username, ts)` e `(ts)`.

- **Resultado Esperado**
  > Forense de incidente em SQL (não em logs de drain). **Métrica**: linhas/dia em `app_audit_auth` em prod = 0 → ~100-500 (login/logout normais). Tempo de "quem logou às 14:23?": grep manual no drain → SELECT em segundos.

- **Tactic alvo**: Audit Trail / Detect Intrusion
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-4, F-security-5
- **Métricas de sucesso**:
  - Tabela `app_audit_auth` existente: 0 → **1**
  - Cobertura de eventos: 0% → 100% (login/logout/token_rejected/revoked)
  - Retenção de auditoria: ~7d (drain Render) → **≥365d** (Supabase)
- **Risco de não fazer**: investigação de incidente vira reconstrução de log esfumaçado. Compliance falha.
- **Dependências**: nenhuma.

### [security-5] Lockout por conta + alerting de burst de falha de login

- **Problema**
  > `AuthService.login` (`AuthService.ts:48-57`) aceita tentativas ilimitadas no mesmo username desde que cada IP fique abaixo de 100/min. bcrypt rounds=12 retarda mas não trava. Credential stuffing distribuído (botnet com IPs rotativos) é viável; sem alarme, ninguém detecta.

- **Melhoria Proposta**
  > Coluna `app_user.failed_attempts` + `locked_until`. 5 falhas consecutivas no mesmo username → bloqueio temporário (backoff exponencial: 1min → 5min → 30min). Métrica/alarme: "N falhas em M min" agregado. Bass: Lock Computer. Adicionar dummy bcrypt no caminho `user not found` para fechar o timing-attack (F-security-12) na mesma feature.

- **Resultado Esperado**
  > Brute-force distribuído fica inviável; analyst recebe alerta de tentativa anômala. **Métrica**: tentativas/min permitidas no mesmo username = ∞ → **≤10 antes do lock**.

- **Tactic alvo**: Lock Computer + Detect Intrusion
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-5, F-security-12
- **Métricas de sucesso**:
  - Tentativas máximas antes de lock: ∞ → **5**
  - Tempo de lock após 5 falhas: 0s → **1min (exponencial)**
  - Diferença de timing user-exists vs not-exists: ~100× → **≤1.2×**
- **Risco de não fazer**: credential stuffing dirigido contra `admin`/usuários conhecidos. Combinado com F-security-2 (12h JWT) = mover dinheiro.
- **Dependências**: security-4 (audit trail) para alimentar o counter.

### [security-6] Adicionar `npm audit --audit-level=high` no job frontend do CI

- **Problema**
  > `.github/workflows/ci.yml:30-46` (job `frontend`) NÃO chama `npm audit`. Hoje há **1 high** (`ws` GHSA-96hv-2xvq-fx4p, CVSS 7.5) escondido em dep transitiva dev-only — passou despercebido porque o gate não existe. Qualquer high futuro em dep direta de runtime (Next, React, sonner, zod) entrará em prod sem alarme.

- **Melhoria Proposta**
  > Adicionar `- run: npm audit --audit-level=high` no job frontend (espelhar `ci.yml:24`). Resolver/justificar o `ws` atual (atualizar `jest-environment-jsdom` ou suprimir via `overrides` se for confirmado dev-only). Documentar processo de exceção (issue + label `security:waiver`).

- **Resultado Esperado**
  > Gate equivalente nos dois lados. **Métrica**: vulns `high+` em frontend: **1 → 0**; PRs bloqueados automaticamente por novas vulns: 0 → mecanismo presente.

- **Tactic alvo**: Limit Exposure (supply chain)
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - Frontend high vulns no CI: 1 (silencioso) → **0 (bloqueia merge)**
  - Cobertura de `npm audit` no CI: 1/2 jobs → **2/2**
- **Risco de não fazer**: vuln crítica em prod descoberta por notícia, não por CI.
- **Dependências**: nenhuma.

### [security-7] Endurecer tenant isolation — começar pelo path do `EnvironmentProvider` e DB schema multi-tenant

- **Problema**
  > Promessa central da proposta SaaSo ("compromisso em A não vaza para B") **não está cumprida**. Hoje 1 Supabase + 1 Render + 1 conjunto de credenciais Conexos atende `client_name=local`. Adicionar o 2º cliente (Columbia + outro) vira P0 de imediato — sem isolamento criptográfico, de rede ou de IAM.

- **Melhoria Proposta**
  > Roadmap em 3 passos: (1) coluna `tenant_id` em toda tabela de domínio (`permuta_*`, `app_user`, `permuta_alocacao_execucao`) + filtro `WHERE tenant_id = $tenant` em toda query (validar via `PatternGuardian`). (2) `EnvironmentProvider.GetLambdaEnvironmentVars` (já existe; ativar via `client_name != local`) lendo SSM `/tenants/{env}/{client}/...`. (3) primeiro tenant real provisionado via Terraform (`infra/tenants/` — não existe hoje). Bass: Separate Entities.

- **Resultado Esperado**
  > Cada cliente isolado por env/SSM/DB schema; compromisso em A não atinge B. **Métrica**: tenants isolados: 0 → **N**; queries com `tenant_id`: 0% → **100%**.

- **Tactic alvo**: Separate Entities
- **Severidade**: P1
- **Esforço estimado**: XL
- **Findings relacionados**: F-security-8, F-security-9
- **Métricas de sucesso**:
  - Contas/projetos isolados por cliente: 1 (compartilhado) → **N (1 por cliente)**
  - Queries com filtro tenant explícito: 0/N → **100%**
  - PatternGuardian gate "query sem tenant_id": ausente → presente
- **Risco de não fazer**: bloqueia onboarding do segundo cliente; qualquer incidente em tenant A vaza para B. Bloqueio comercial da SaaSo.
- **Dependências**: ADR estratégico (compra de migração agora vs ao 2º cliente) — chamar Yuri.

### [security-8] Helmet + security headers no Express

- **Problema**
  > `src/backend/index.ts:16-97` não monta `helmet()` — respostas backend saem sem `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. Frontend Vercel adiciona alguns, mas o backend (alvo direto de XHR) não.

- **Melhoria Proposta**
  > `npm i helmet`; `app.use(helmet())` antes do CORS em `index.ts`. Customizar CSP se necessário (provavelmente desnecessário porque o backend só serve JSON, sem HTML).

- **Resultado Esperado**
  > Hardening browser-level via header. **Métrica**: security headers padrão setados pelo backend: 0 → **≥5** (helmet defaults).

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-7
- **Métricas de sucesso**:
  - Headers de segurança presentes (medido com curl -I): 0 → **≥5**
- **Risco de não fazer**: hardening fraco em browser; ferramentas tipo securityheaders.com dão nota F.
- **Dependências**: nenhuma.

### [security-9] Limpar `credentials: true` do CORS enquanto não houver cookie real

- **Problema**
  > `http/cors.ts:49` libera `credentials: true` (cookies cross-origin) sem que o sistema use cookie — Bearer no header (`lib/auth/token.ts:27-32`). Cria armadilha: um refactor futuro que adicione cookie de sessão (e.g. para mitigar F-security-2 via httpOnly cookie) herda essa flag e abre CSRF sem proteção.

- **Melhoria Proposta**
  > Remover `credentials: true` agora (validar que nada quebra). Adicionar comentário forte: "se voltar a usar cookie de sessão, RE-LIGAR e implementar CSRF token + SameSite=strict". Alternativa: implementar já o esquema cookie httpOnly + SameSite + CSRF token e migrar o JWT para lá (resolve F-security-2 também).

- **Resultado Esperado**
  > Sem superfície CSRF latente. **Métrica**: `Access-Control-Allow-Credentials` no response: `true` → **(removido)**.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-10, F-security-2
- **Métricas de sucesso**:
  - CORS `credentials` setting: `true` → **`false`** (até cookie real existir)
- **Risco de não fazer**: armadilha para próximo refactor.
- **Dependências**: idealmente coordenar com security-2 (decisão sobre cookie httpOnly).

### [security-10] `requestId` na resposta 500 + 4xx do `errorMiddleware`

- **Problema**
  > `http/errorMiddleware.ts:35` devolve `{error: 'Internal server error'}` sem `requestId`. O header `X-Request-Id` está presente (graças ao `requestIdMiddleware`), mas usuário relatando um bug copia o body — não vê o ID e suporte demora para correlacionar.

- **Melhoria Proposta**
  > `res.status(500).json({ error: 'Internal server error', requestId: req.requestId });` (padrão já adotado em `respondActionError` em `routes/permutas.ts:117-155`). Idem para validações Zod (`{error: 'invalid body', details: ..., requestId: req.requestId}`).

- **Resultado Esperado**
  > Triagem de incidente mais rápida. **Métrica**: respostas de erro com `requestId` no body: 0% → **100%**.

- **Tactic alvo**: Audit Trail (correlação)
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-security-11
- **Métricas de sucesso**:
  - % respostas 4xx/5xx com `requestId`: ~50% (só as do `respondActionError`) → **100%**
- **Risco de não fazer**: tempo de suporte aumenta; baixa prioridade.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Decisão de escopo**: escopo `all` cobriu backend + frontend + CI; sem `infra/` porque não existe (Render/Vercel/Supabase). `npm audit` rodado nos dois lados; backend exit=0 (no high), frontend tem 1 high (`ws` via jsdom devDep) — não bloqueia hoje porque é dev-only, mas o gate não existe.
- **Métricas não coletadas**: MTTD de credencial vazada, taxa de 401/403 por IP em produção, presença de WAF (Render Starter não documenta). Pediria instrumentação em CloudWatch/Datadog ou similar (alvo, hoje só `console.log` no drain).
- **Cross-QA**:
  - **Fault Tolerance** — Audit Trail compartilhado (F-security-4 alimenta a trilha de baixa do `fin010` que Fault Tolerance também usa para recovery); idempotência write-ahead já cobre Restore.
  - **Availability** — Limit Exposure / Separate Entities (F-security-8) é também o maior risco de blast radius cross-tenant; F-security-5 (lockout) impacta DoS de auth.
  - **Integrability** — Validate Input (Zod) cross-checa contratos Conexos com Integrability; cobertura 100% nos boundaries.
  - **Deployability** — F-security-1 (defesa em profundidade quebrada por desalinhamento `production` vs `prd|stg|hml`) é um defeito de Deployability (config drift entre código e Render).
- Score 5/10: fundações sólidas (Zod, bcrypt-12, SQL parametrizado, RBAC mutações, redact logs, rate-limit, CORS allow-list, idempotência write-ahead) mas gaps significativos em revogação de credencial, audit de auth, defesa em profundidade (env naming), single-role/single-tenant e supply-chain gate frontend — incompatível com a promessa SaaSo financeira em multi-tenant.
