---
qa: Security
qa_slug: security
run_id: 2026-06-26-1708
agent: qa-security
generated_at: 2026-06-26T17:08:00-03:00
scope: all
score: 6
findings_count: 11
cards_count: 9
---

# Security — Regis-Review

> Escopo: **all** (backend Express @ Render + frontend Next.js @ Vercel + Supabase Postgres).
> Run anterior = `2026-06-26-0058`. **Delta confirmado nesta sessão**: (a) F-security-1 do run anterior
> RESOLVIDO — `http/authEnv.ts:56,93-101` virou **deny-by-default** (allow-list local/dev/development/test),
> `'production'` agora CRASHA o boot com `DEV_AUTH_BYPASS=true` (testes em `authEnv.test.ts:66-118` cobrem
> `prd`/`stg`/`hml`/`production`/`prod`/`Production`); (b) `BorderoGestaoService.requireOwnBorderoFilCod`
> (`BorderoGestaoService.ts:268-277`) — autorização server-side server-side de borderô — `filCod` vem da
> TRILHA (`permuta_alocacao_execucao`), nunca do request, fechando o confused-deputy de uma credencial
> admin (ou JWT roubado) mexer em borderô de terceiro via filCod arbitrário. Splits **CC-1** (frontend
> `page.tsx` → componentes por aba) e **CC-2** (`ConexosClient` → `ConexosBaseClient` + 4 sub-clients)
> **NÃO regrediram**: auth do Conexos idêntica (`ConexosBaseClient.ensureSid` delega ao legado
> `services/conexos.ts:199-203` com a mesma `redactSensitive`; cookie/sid continua FORA dos logs de erro);
> SQL parametrizado preservado em todos os repos (única interpolação em
> `PermutaExecucaoRepository.ts:394` gera **NOMES** de placeholder `($fil_${i}, $bor_${i})`, valores via
> `params`). Os demais findings do run anterior **permanecem** — propagados/renumerados abaixo.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Atacante externo (credential stuffing) **ou** insider com sessão admin vazada (JWT extraído de `localStorage` por XSS / dump de browser / laptop comprometido) | Tenta autenticar/reusar token p/ disparar finalize-borderô, reconciliar-lote, ingestão, excluir borderô — tudo que escreve no `fin010` | API Express (`POST /auth/login`, `POST /permutas/reconciliar-lote`, `POST /permutas/borderos/:b/finalizar`, `POST /permutas/borderos/:b/estornar`, `DELETE /permutas/borderos/:b`, `POST /permutas/ingestao`), Postgres (`app_user`, `permuta_alocacao_execucao`, `permuta_bordero`), credenciais Conexos em env Render | Produção (`environment=production`, `CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`, `DEV_AUTH_BYPASS=false`) | bcrypt rounds=12 + JWT HS256 12h verificado em todo request fora de `/health`/`/auth/login`; mutações exigem `role='admin'` (18× `requireRole('admin')` em `routes/permutas.ts`); rate-limit 100/min global + 10/min nas rotas pesadas; default dry-run de escrita; logs estruturados (sem segredos via `redactBody`/`redactSensitive`) com `requestId` correlacionável; **autorização server-side de borderô** (`requireOwnBorderoFilCod`) — admin/JWT roubado só age sobre borderôs da TRILHA deste sistema; deny-by-default de `DEV_AUTH_BYPASS` em qualquer env != `local`/`dev`/`development`/`test` | 0 escritas no `fin010` sem `requestId`/`executadoPor` na trilha; 0 segredos no stdout dos drains; 0 boots com bypass em produção (FIXED, testes `authEnv.test.ts:66-118`); MTTD da credencial roubada < TTL do JWT (hoje **12h** — sem revogação server-side, P1); 0 borderôs de terceiros tocados via API (confused-deputy fechado). |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Segredos hardcoded no repo (regex `password\|secret\|token\|api[_-]?key`) | **0** | 0 | ✅ | `grep -rEn "(password\|secret\|token\|api[_-]?key\|credential)\s*[:=]\s*['\"][^'\"]{8,}" src/backend src/frontend` (vazio fora de `.test.ts`/dist) |
| AWS access keys no repo (`AKIA[0-9A-Z]{16}`) | **0** | 0 | ✅ | `grep -rEn "AKIA[0-9A-Z]{16}" src` (vazio) |
| `.env` git-tracked | **0** (só `.env.example`) | 0 | ✅ | `git ls-files \| grep -E "\.env\|\.tfstate"` → `src/backend/.env.example`, `src/frontend/.env.example` |
| Endpoints `routes/permutas.ts` com `requireRole('admin')` | **18/18 mutações** | 18/18 | ✅ | `grep -c requireRole routes/permutas.ts` = 18 (importação + 17 usos em rotas POST/DELETE + `/status` admin-only) |
| Endpoints atrás de auth global (`buildAuthMiddleware` antes dos routers de domínio) | **100%** | 100% | ✅ | `src/backend/index.ts:77` aplica `buildAuthMiddleware(loadAuthEnv())` antes de `/conexos`+`/permutas`; só `/health` e `/auth/*` ficam fora |
| Validação Zod nos boundaries (`safeParse` em corpo/query) | **7 sites em `routes/permutas.ts` + 1 em `routes/auth.ts`** (cobre 100% das rotas com input livre) | 100% | ✅ | `grep -n safeParse routes/permutas.ts` (linhas 283, 313, 361, 383, 489, 520, 548) + `routes/auth.ts:28` |
| SQL não-parametrizado (template literal com `${var}` em SELECT/INSERT/UPDATE/DELETE) | **0** (única interpolação em `PermutaExecucaoRepository.ts:394` é placeholder `($fil_${i}, $bor_${i})`; valores via `params` no `SqlBuilder`) | 0 | ✅ | `grep -rEn '(SELECT\|INSERT\|UPDATE\|DELETE).*\$\{[a-zA-Z_]+\}' src/backend/domain` → 1 hit, **falso positivo** (nome do placeholder, não valor) |
| `dangerouslySetInnerHTML` / `.innerHTML` no frontend | **0** | 0 | ✅ | `grep -rEn 'dangerouslySetInnerHTML\|\.innerHTML' src/frontend --include=*.tsx --include=*.ts` (vazio) |
| bcrypt rounds (hash de senha admin) | **12** | ≥10 (OWASP 2023) | ✅ | `jobs/seed-admin.ts:18` (não alterado) |
| TTL do JWT de login | **12h** | ≤4h + revogação server-side | ⚠️ | `domain/service/auth/AuthService.ts:24` (`TOKEN_EXPIRATION = '12h'`) — INALTERADO |
| Revogação server-side de token / denylist por `jti` | **ausente** | presente | ❌ | `signOut()` em `AuthProvider.tsx:77-84` só faz `localStorage.removeItem`; nenhum `jti` setado em `signToken` (`AuthService.ts:59-75`); nenhuma migration `app_token_revoked` |
| Storage do JWT no browser | `localStorage` (`auth_token` + `auth_username`) | cookie httpOnly+SameSite=strict | ⚠️ | `lib/auth/token.ts:5,19`; `AuthProvider.tsx:44,68` — INALTERADO |
| Audit trail das ações `fin010` (write) | **persistido** (`permuta_alocacao_execucao`: status, payload, erp_response, `executado_por`) + **borderô-actions** logam `executadoPor` em `LOG_TYPE.BUSINESS_INFO` (`BorderoGestaoService.ts:186-190,208-213,228-232,246-250`) | presente | ✅ | `migrations/0015_permuta_alocacao_execucao.sql` + `BorderoGestaoService` (finalize/cancel/estorna/exclui) |
| Audit trail dos eventos de auth (login OK/falha, logout) | **ausente** (só stdout do Render) | tabela `app_audit_auth` persistida | ❌ | `routes/auth.ts:25-43` sem `LogService` nem persistência; middleware `http/auth.ts:167-170` só `console.warn`. `grep -rn "app_audit\|auth_audit\|login_event" src/backend` → 0 hits |
| Falha de auth com lockout/back-off por conta | **ausente** | lockout após N tentativas | ❌ | `AuthService.login` (`AuthService.ts:48-57`) devolve `null` em falha sem contador; rate-limit é por IP (botnet contorna). `grep failed_attempts\|locked_until` → 0 hits |
| Autorização **server-side por borderô** (filCod da TRILHA, não do request — confused-deputy) | **presente** (NEW) | presente | ✅ | `BorderoGestaoService.ts:268-277` (`requireOwnBorderoFilCod`); chamado em `excluirBordero:162`, `guardAcaoBordero:285` (finalize/cancel/estorna); `excluirBaixa:110` lê `row.filCod` da trilha |
| Defense-in-depth: rejeitar `DEV_AUTH_BYPASS=true` fora de local/dev/development/test | **deny-by-default** (FIX desta sessão) | rejeitar sempre que env != local | ✅ | `http/authEnv.ts:56` `LOCAL_ENVIRONMENTS = ['local','dev','development','test']`; teste `http/authEnv.test.ts:69-82` cobre 6 nomes deployed (incl. `'production'` que o Render seta) |
| `DEV_AUTH_BYPASS` default em produção (Render blueprint) | `'false'` explicito | `'false'` ou ausente | ✅ | `render.yaml:29-30` |
| CORS allow-list (não-wildcard) | sim — comma-sep `ALLOWED_ORIGINS` (suporte a `*.vercel.app` por sufixo) | sim | ✅ | `http/cors.ts:31-55`, `index.ts:27` |
| Rate-limit global / rota pesada | 100/min e 10/min por IP | presente | ✅ | `http/rateLimit.ts:17-35`; aplicado em `index.ts:31,82` + por-rota em `routes/permutas.ts:213,248,466,517,545,604,631,658,685,713` |
| Security headers (helmet: HSTS / X-Frame-Options / CSP) | **ausente** | helmet + CSP estrito | ❌ | `grep -rn "helmet" src/backend` → 0 hits |
| `credentials: true` no CORS (sem cookie real ativo) | sim — Bearer no header, mas CORS libera cookie | desligar até cookie httpOnly existir | ⚠️ | `http/cors.ts:49` |
| Body redaction em logs de request/response | presente (`redactBody` cobre `password`/`token`/`authorization`/`secret`/`api_key`/`jwt`) | presente | ✅ | `http/redact.ts:10-22,25-44` + `index.ts:46-54` |
| Conexos `/login` body com password redigido no log do Axios | sim (`redactSensitive` cobre `password`/`senha`/`token`/`authorization`/`sid`/`username`) | sim | ✅ | `services/conexos.ts:14-25, 41-63, 88` |
| Conexos `sid`/Cookie logado no erro do ERP (preservado pós-CC-2) | **NÃO** — `routes/permutas.ts:131-141` loga `erpStatus`/`erpKey`/`erpData` (response.data), nunca `err.cause` (Axios config carrega o Cookie); base client interceptor de erro só loga `body=response.data` (`services/conexos.ts:110-112`) | NÃO | ✅ | `routes/permutas.ts:75-93,123-145` + `services/conexos.ts:106-114` |
| `npm audit --audit-level=high` backend | **0 crit / 0 high** (1 low + 20 moderate, todos em devDeps: jest/ts-jest/exceljs/uuid) | 0 high / 0 critical | ✅ | `cd src/backend && npm audit` → exit=0; gate em `.github/workflows/ci.yml:24` |
| `npm audit --audit-level=high` frontend | **0 crit / 1 high** (`ws` 8.0.0-8.20.1 — GHSA-96hv-2xvq-fx4p + GHSA-58qx-3vcg-4xpx, DoS + uninitialized memory) + 21 moderate + 1 low | 0 high / 0 critical | ❌ | `cd src/frontend && npm audit` → `ws` chega via `jest-environment-jsdom@30 → jsdom@26.1.0 → ws@8.20.0` (DEV-only — não embarca no `next build`), mas **CI do frontend NÃO roda `npm audit`** (`.github/workflows/ci.yml:30-46`) — INALTERADO |
| Frontend XSS surface | 0 | 0 | ✅ | grep vazio em `src/frontend/{app,components,lib}` |
| Tenant isolation (multi-tenant) | **single-tenant hoje** (1 Supabase + 1 Render + 1 conjunto credenciais Conexos) | 1 conta AWS por cliente (alvo SaaSo) | ❌ | `EnvironmentProvider.ts:21-26` único path = `GetLocalEnvironmentVars`; `render.yaml:27-28` `client_name=local` |
| CloudTrail / GuardDuty | N/A (sem AWS hoje) | per-tenant quando migrar | N/A | sem `infra/` |

> ⚠️ **Não medível localmente**: MTTD de credencial vazada em produção, taxa de 401/403 por IP, taxa de
> login inválido, presença de WAF na borda do Render. Requer painel central (atualmente só
> `console.log` nos drains do Render, retenção ~7d no plano Starter).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | `http/auth.ts:167-170` (`console.warn` 401), `http/auth.ts:192-194` (`console.warn` 403). Sem agregação/alarme, sem lockout por conta | ⚠️ parcial | `http/auth.ts:167-170, 192-194` |
| Detect Service Denial | `globalLimiter` 100/min + `heavyRouteLimiter` 10/min devolvem 429; sem alarme paging-grade | ⚠️ parcial | `http/rateLimit.ts:17-35` |
| Verify Message Integrity | JWT HS256 assinado/verificado via `jose` (`http/auth.ts:136-153`); `audience='authenticated'` enforçado; idempotência write-ahead `permuta_alocacao_execucao` valida `bxa_cod_seq` antes de gravar `settled` | ✅ presente | `http/auth.ts:136-153`, `PermutaExecucaoRepository` |
| Detect Message Delay | N/A (sem fila/canal assíncrono crítico no caminho de auth) | N/A | — |
| Identify Actors | `req.user.sub`/`email` extraído do JWT verificado e propagado como `executadoPor`/`criadoPor` em 100% das mutações | ✅ presente | `http/auth.ts:55-64`, `routes/permutas.ts:219,253,318,388,495,526,553,612,639,666,693,722` |
| Authenticate Actors | bcrypt (rounds=12) + JWT HS256 obrigatório em todo request fora de `/health` e `/auth/login`; `buildAuthMiddleware` rejeita 401 expirado/inválido | ✅ presente | `AuthService.ts:48-57`, `http/auth.ts:155-173`, `jobs/seed-admin.ts:18` |
| Authorize Actors | `requireRole('admin')` em 17 endpoints de mutação + 1 de leitura sensível (`/status`); **+ autorização server-side por borderô** (`requireOwnBorderoFilCod` — filCod da trilha, não do request) fecha o confused-deputy; **mas** único role (`admin`) — sem maker/checker | ⚠️ parcial | `http/auth.ts:183-200`, `BorderoGestaoService.ts:268-277,285`, `migrations/0007_app_user.sql:8` |
| Limit Access | Auth global + RBAC mutações + rate-limit + gate de escrita (`CONEXOS_WRITE_ENABLED`/`DRY_RUN`); autorização ESCOPADA por borderô (trilha) | ✅ presente | `index.ts:77,82`, `BorderoGestaoService.ts:268-277` |
| Limit Exposure | CORS allow-list, Bearer no header, credenciais Conexos no env, default dry-run, redact em logs. **MAS**: JWT em `localStorage` (XSS = roubo direto, 12h sem revogação), sem helmet/CSP, `npm audit` frontend não no CI (1 high `ws`), `credentials: true` desnecessário | ⚠️ parcial | `http/cors.ts:49`, `lib/auth/token.ts:5,19`, `index.ts` (helmet ausente), `.github/workflows/ci.yml:30-46` |
| Encrypt Data | TLS no Render/Vercel/Supabase (herdado); senhas bcrypt rounds=12; JWT assinado; Postgres com pooler Supabase TLS; secrets fora do repo (`sync:false` em `render.yaml:36-57`) | ✅ presente (single-tenant) | `jobs/seed-admin.ts:18`, `render.yaml:36-57` |
| Separate Entities | **Ausente** — single-tenant Express/Supabase compartilhado; promessa SaaSo "1 conta AWS por cliente" é alvo, não realidade | ❌ ausente | `EnvironmentProvider.ts:21-26` |
| Change Default Settings | Escrita `fin010` desligada por default (`CONEXOS_WRITE_ENABLED=false`, `CONEXOS_DRY_RUN=true`); `DEV_AUTH_BYPASS=false` em `render.yaml`; **deny-by-default no guard de bypass** (FIX desta sessão); `ALLOWED_ORIGINS` exige whitelist explícita | ✅ presente | `EnvironmentVars`, `http/authEnv.ts:56,93-101`, `render.yaml:29-40` |
| Validate Input | Zod no boundary de toda rota com input (body + query + params coercion explícita); `safeParse` → 400 com `details` | ✅ presente | `routes/permutas.ts:32-49,169-186,283,313,361,383,489,520,548`, `routes/auth.ts:10-13,28`, `http/validate.ts` |
| Revoke Access | **Ausente** — logout só `localStorage.removeItem`; token válido até `exp` (12h); sem `jti` denylist, sem rotação de chave automática | ❌ ausente | `AuthProvider.tsx:77-84`, `AuthService.ts:23-24` |
| Lock Computer | **Ausente** — sem lockout por conta após N falhas; rate-limit é por IP (botnet contorna) | ❌ ausente | `AuthService.ts:48-57`, `http/rateLimit.ts` |
| Inform Actors | Falhas de auth devolvem 401 com `{error}` discriminado (`Token expired` / `Invalid token` / `Missing or malformed Authorization header`); CORS rejeitado loga origin; sem notificação ao usuário de tentativa anômala | ⚠️ parcial | `http/auth.ts:158,165-172`, `http/cors.ts:47` |
| Restore | DB Supabase com PITR (provider-managed); deploy reversível via Render (rollback de imagem); idempotência write-ahead em `permuta_alocacao_execucao` permite reprocessar com mesma `idempotency_key` | ✅ presente | `migrations/0015_permuta_alocacao_execucao.sql`, cross-ref Availability |
| Audit Trail | **Parcial**: ações `fin010` (write) e **borderô-actions** (finalize/cancel/estorna/exclui) persistidas com `executadoPor`; **mas** eventos de auth (login OK/falha, logout) NÃO persistem em tabela — só `console.warn` no drain | ⚠️ parcial | `BorderoGestaoService.ts:186-190,208-213,228-232,246-250`; vs `routes/auth.ts:25-43` (sem audit) |

## 4. Findings (achados)

### F-security-1: JWT armazenado em `localStorage` sem revogação server-side (12h de credencial viva pós-roubo)

- **Severidade**: P1
- **Tactic violada**: Limit Exposure + Revoke Access
- **Localização**: `src/frontend/lib/auth/token.ts:5,19`, `src/frontend/lib/auth/AuthProvider.tsx:44,68,77-84`, `src/backend/domain/service/auth/AuthService.ts:24,59-75`
- **Evidência (objetiva)**:
  ```
  src/frontend/lib/auth/token.ts:5    export const TOKEN_STORAGE_KEY = 'auth_token'
  src/frontend/lib/auth/token.ts:19   return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined
  src/frontend/lib/auth/AuthProvider.tsx:77-84  signOut → window.localStorage.removeItem(...)
  src/backend/domain/service/auth/AuthService.ts:24  const TOKEN_EXPIRATION = '12h';
  src/backend/domain/service/auth/AuthService.ts:59-75  signToken — não emite `jti`
  ```
  Sem `jti` registrado em DB, sem denylist consultada no middleware, sem rotação automática de `AUTH_JWT_SECRET`. `signOut()` no FE não fala com backend.
- **Impacto técnico**: token roubado (XSS, dump de `localStorage`, backup de browser sincronizado) permanece válido por até **12h**. Logout NÃO invalida nada server-side. Para "revogar de verdade" hoje é preciso rotacionar `AUTH_JWT_SECRET` (derruba TODOS os usuários — disruptivo, então não se faz).
- **Impacto de negócio**: janela de 12h para um JWT comprometido executar `POST /permutas/borderos/:b/finalizar` / `POST /permutas/reconciliar-lote` (baixa em massa no `fin010`). O confused-deputy fix (`requireOwnBorderoFilCod`) limita o blast radius a borderôs DA TRILHA — mas isso é exatamente o universo que o sistema cria, então não fecha o risco; só impede mexer em borderôs externos.
- **Métrica de baseline**: TTL do token = **12h**; capacidade de revogação server-side = **0**; testes cobrindo invalidação de token = **0**.

### F-security-2: Único role `admin` para toda mutação — sem separação maker/checker em ação financeira destrutiva

- **Severidade**: P1
- **Tactic violada**: Authorize Actors (granularidade) / Limit Exposure (blast radius)
- **Localização**: `src/backend/migrations/0007_app_user.sql:8`, `src/backend/routes/permutas.ts` (17 endpoints `requireRole('admin')`), `src/backend/jobs/seed-admin.ts:27`
- **Evidência (objetiva)**:
  ```
  migrations/0007_app_user.sql:8   role TEXT NOT NULL DEFAULT 'admin'
  jobs/seed-admin.ts:27            await repository.upsertAdmin(username, passwordHash, 'admin');
  routes/permutas.ts               17× requireRole('admin') — não há 'analyst', 'approver', 'viewer'
  ```
- **Impacto técnico**: a MESMA role autoriza criar alocação, executar reconciliação (escreve no `fin010`), **finalizar borderô**, **estornar**, **excluir** e lote. Não há 4-eyes; uma credencial comprometida cobre toda a superfície destrutiva.
- **Impacto de negócio**: uma credencial vazada pode finalizar borderôs sem aprovação independente. A confused-deputy auth (`requireOwnBorderoFilCod`) impede tocar borderô de terceiro, mas dentro do universo da trilha **não há separação maker/checker** — incompatível com a promessa de compliance financeiro (SoD SOX-like).
- **Métrica de baseline**: distinct roles em `app_user` = **1** (`admin`); endpoints exigindo 2-pessoas = **0**; usuários do sistema hoje = **1-N** (seed via env).

### F-security-3: Eventos de autenticação (login/logout/falha) sem audit trail persistente

- **Severidade**: P1
- **Tactic violada**: Audit Trail / Detect Intrusion
- **Localização**: `src/backend/routes/auth.ts:25-43`, `src/backend/http/auth.ts:167-170`
- **Evidência (objetiva)**:
  ```
  routes/auth.ts:25-43           POST /auth/login — sem LogService, sem persistência em tabela
  http/auth.ts:167-170           rejeições 401 → console.warn (stdout do Render)
  grep -rn "app_audit\|auth_audit\|login_event" src/backend  → 0 hits
  ```
- **Impacto técnico**: impossível responder forense ("quem tentou logar com `admin` nas últimas 24h?", "quem tinha sessão ativa quando o borderô X foi finalizado?", "houve burst de 401 antes do login OK suspeito?"). Drain do Render tem retenção curta (~7d Starter), sem SIEM.
- **Impacto de negócio**: detectar e investigar credential-stuffing / sessão sequestrada vira reconstrução manual de logs com janela limitada. SaaSo financeira exige trilha persistida (SOX-like, LGPD trilha de acesso). Compounding com F-security-4 (lockout ausente) e F-security-1 (sem revogação) torna ataque dirigido invisível.
- **Métrica de baseline**: linhas em `app_audit_auth` = **N/A (tabela não existe)**; ferramenta atual de busca de evento de auth = **`grep` no drain do Render** (retenção ~7d).

### F-security-4: Sem lockout por conta após N falhas — rate-limit é por IP (atacante distribuído contorna)

- **Severidade**: P1
- **Tactic violada**: Lock Computer / Detect Intrusion
- **Localização**: `src/backend/domain/service/auth/AuthService.ts:48-57`, `src/backend/http/rateLimit.ts:17-26`
- **Evidência (objetiva)**:
  ```
  AuthService.ts:48-57   if (!user) return null;
                         const passwordMatches = await bcrypt.compare(password, user.passwordHash);
                         if (!passwordMatches) return null;        // sem contador, sem lockout
  http/rateLimit.ts:17-26  globalLimiter = 100/min por IP         // por IP — botnet contorna
  grep -rEn "failed_attempts|locked_until|lockout" src/backend → 0 hits
  ```
- **Impacto técnico**: `POST /auth/login` aceita tentativas ilimitadas pelo mesmo `username` desde que cada IP fique abaixo de 100/min. bcrypt rounds=12 retarda (~100-300ms/tentativa) mas não trava. Sem alarme "N falhas no mesmo username em M minutos".
- **Impacto de negócio**: credential stuffing distribuído contra `admin` ou usuários conhecidos. Combinado com F-security-3 (sem audit), time não detecta.
- **Métrica de baseline**: tentativas/min permitidas no mesmo username por IPs distintos = **ilimitado**; lockout time = **0s**.

### F-security-5: Frontend sem gate `npm audit` no CI — `ws` HIGH (DoS + uninitialized memory) passa silenciosamente

- **Severidade**: P1
- **Tactic violada**: Limit Exposure (supply chain)
- **Localização**: `.github/workflows/ci.yml:30-46`, `src/frontend/node_modules/ws@8.20.0` (via `jest-environment-jsdom@30 → jsdom@26.1.0`)
- **Evidência (objetiva)**:
  ```
  cd src/frontend && npm audit → 1 high (ws GHSA-96hv-2xvq-fx4p + GHSA-58qx-3vcg-4xpx, CVSS 7.5)
  cd src/frontend && npm audit --json | metadata.vulnerabilities = {crit:0, high:1, mod:21, low:1}
  ci.yml:23-24  backend job: `- run: npm audit --audit-level=high`   (gate ativo)
  ci.yml:30-46  frontend job: NÃO chama `npm audit`                  (sem gate)
  ```
  `ws` é dev-only (não embarca no `next build`), mas isso é COINCIDÊNCIA — qualquer high futuro em dep direta de runtime (Next, React, sonner, zod) entra em prod sem ser sinalizada.
- **Impacto técnico**: ausência de gate equivalente nos dois lados permite que vulns críticas em deps de runtime passem.
- **Impacto de negócio**: descoberta tardia de CVE em prod (via news, não via CI) → janela de exposição maior que o necessário.
- **Métrica de baseline**: backend high+crit = **0** (gate ativo); frontend high+crit = **1+0** (sem gate); frontend total = **23 vulns** (1 high / 21 moderate / 1 low).

### F-security-6: Sem `helmet` / security headers (HSTS, X-Frame-Options, CSP, X-Content-Type-Options)

- **Severidade**: P2
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/index.ts:16-97` (sem `app.use(helmet())`)
- **Evidência (objetiva)**:
  ```
  grep -rn "helmet" src/backend  → 0 hits (incluso package.json)
  src/backend/index.ts           sem import / sem use de helmet
  ```
- **Impacto técnico**: respostas saem sem `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`. Frontend Vercel já adiciona alguns, mas o backend (alvo direto de XHR) não.
- **Impacto de negócio**: hardening de browser ausente; downgrade attacks e clickjacking dependem só do FE/CDN.
- **Métrica de baseline**: security headers padrão setados pelo backend = **0**; alvo = **≥5** (helmet defaults).

### F-security-7: Single-tenant hoje vs promessa SaaSo "conta AWS por cliente" — blast radius compartilhado

- **Severidade**: P1
- **Tactic violada**: Separate Entities
- **Localização**: `CLAUDE.md` (Estado Atual vs Alvo), `src/backend/domain/libs/environment/EnvironmentProvider.ts:21-26`, `render.yaml`, `DEPLOY.md`
- **Evidência (objetiva)**:
  ```
  CLAUDE.md           "Atual: Express (src/backend) + Next.js, deploy Render + Vercel, auth/DB Supabase"
                      "Alvo: AWS Lambda + Terraform multi-tenant (NÃO existe ainda)"
  EnvironmentProvider.ts:21-26  if (!process.env.client_name || process.env.client_name === 'local') {
                                    return this.GetLocalEnvironmentVars();   // ÚNICO path executado hoje
  render.yaml:27-28  - key: client_name
                       value: local
  ```
- **Impacto técnico**: 1 Supabase + 1 Render + 1 conjunto de credenciais Conexos atendendo `client_name=local`. Sem isolamento criptográfico, de rede ou de IAM entre clientes. Adicionar cliente B significa compartilhar tudo com cliente A.
- **Impacto de negócio**: a promessa central do contrato SaaSo ("compromisso em A não vaza para B") **não está cumprida** — débito arquitetural conhecido (migration-debt). Ao onboarding do 2º cliente, isto vira P0.
- **Métrica de baseline**: contas AWS provisionadas = **0**; tenants em SSM = **0**; isolamento Postgres por cliente = **0** (single Supabase project); promessa SaaSo cumprida = **N/A** (single-tenant pilot).

### F-security-8: `.env` local aponta para Supabase e Conexos de produção — laptop do dev = vetor de PROD

- **Severidade**: P1
- **Tactic violada**: Limit Access / Separate Entities
- **Localização**: `src/backend/.env` (não-versionado), `EnvironmentProvider.ts:44-72`
- **Evidência (objetiva)**:
  ```
  src/backend/.env (gitignored)  CONEXOS_BASE_URL=<prd>
                                 CONEXOS_USERNAME=<prd>
                                 CONEXOS_PASSWORD=<prd>
                                 databaseConnectionString=<prd Supabase pooler>
                                 AUTH_JWT_SECRET=<...>
  EnvironmentProvider.ts:44-72   GetLocalEnvironmentVars lê direto do dotenv
  ```
  `.env` está em `.gitignore` (confirmado: `git ls-files | grep -E "\.env"` → só `.env.example`) — mas vive no disco do dev e no histórico de shell.
- **Impacto técnico**: roubo/compromisso do laptop do desenvolvedor = acesso direto às credenciais Conexos de produção (escrita habilitada por env se ele setar `CONEXOS_WRITE_ENABLED=true`) e à conexão do Postgres Supabase de produção.
- **Impacto de negócio**: um dev = uma chave-mestra do ambiente real. Não há HML separada para Permutas hoje, então "aponte local para HML" não está disponível como alternativa.
- **Métrica de baseline**: ambientes Conexos distintos disponíveis = **1** (PRD); separação dev↔prod = **0**; uso de OS-keychain para secrets locais = **0**.

### F-security-9: `credentials: true` no CORS sem uso real de cookies — armadilha CSRF latente

- **Severidade**: P2
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/http/cors.ts:49`, `src/frontend/lib/auth/token.ts:27-32`
- **Evidência (objetiva)**:
  ```
  http/cors.ts:49           credentials: true,
  lib/auth/token.ts:27-32   Authorization: `Bearer ${token}`   // header, não cookie
  ```
- **Impacto técnico**: hoje o token vai por `Authorization` (não-CSRF-vulnerável). Mas `credentials: true` autoriza envio de cookies cross-origin — se um dia alguém setar um cookie de sessão (e.g. para mitigar F-security-1 via httpOnly cookie), CSRF vira problema sem proteção atual (token CSRF / `SameSite=strict`).
- **Impacto de negócio**: armadilha para refactor futuro — quem implementar o cookie httpOnly precisa lembrar de adicionar CSRF token + `SameSite=strict`.
- **Métrica de baseline**: defesa CSRF presente = **0**; uso real de cookie sessão = **0** (Bearer-only).

### F-security-10: `errorMiddleware` 500 sem `requestId` no body — quebra correlação no incidente

- **Severidade**: P3
- **Tactic violada**: Audit Trail (correlação)
- **Localização**: `src/backend/http/errorMiddleware.ts:35`
- **Evidência (objetiva)**:
  ```
  errorMiddleware.ts:35  res.status(500).json({ error: 'Internal server error' });
  ```
  Resposta sem `requestId` — o `requestIdMiddleware` ainda adiciona o header `X-Request-Id`, mas usuário relatando bug copia o body. As validações Zod (400) também devolvem `{error: 'invalid body', details: ...}` sem `requestId` (`routes/permutas.ts:284,315,362,385,491,522,550`).
- **Impacto técnico**: triagem de incident por suporte fica mais lenta. Padrão de `respondActionError` (`routes/permutas.ts:117-155`) já inclui `requestId` — falta espalhar.
- **Métrica de baseline**: % de respostas 500/400 com `requestId` no body = **~50%** (só `respondActionError` faz); alvo = **100%**.

### F-security-11: Ausência de proteção contra timing-attack na resposta "usuário não existe" vs "senha errada"

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
- **Impacto técnico**: atacante consegue distinguir usuários existentes de inexistentes medindo latência. Combinado com F-security-4 (sem lockout) habilita credential stuffing dirigido.
- **Impacto de negócio**: hoje 1-N usuários (`admin`) — risco baixo. Vira P2 quando o sistema crescer para múltiplos analistas.
- **Métrica de baseline**: dummy bcrypt no fast-path = **0**; tempo médio `usuário inexistente` ≈ **<10ms** vs `senha errada` ≈ **150-300ms**.

## 5. Cards Kanban

### [security-1] Revogação server-side de JWT (denylist por `jti`) + reduzir TTL para ≤4h

- **Problema**
  > Hoje o JWT (HS256, 12h, `AuthService.ts:24`) vive em `localStorage` (`lib/auth/token.ts:5`), o logout só faz `localStorage.removeItem`, e o backend não sabe que o token foi revogado. Um token roubado por XSS / dump de localStorage / laptop comprometido permanece válido por até 12h — janela suficiente para finalizar dezenas de borderôs no `fin010`. O confused-deputy fix recente limita a borderôs DA TRILHA, mas é exatamente onde o sistema atua.

- **Melhoria Proposta**
  > Adicionar `jti` no `signToken` (`AuthService.ts:59-75`); migration `app_token_revoked (jti, revoked_at)`. `signOut()` chama `POST /auth/logout` que insere o `jti`. `buildAuthMiddleware` (`http/auth.ts:155-173`) consulta a denylist (cache em memória 60s) antes de aceitar. Reduzir `TOKEN_EXPIRATION` para `'4h'`. Tactic Bass: Revoke Access.

- **Resultado Esperado**
  > Logout efetivo server-side; revogação manual de sessão suspeita; trilha forense de "quem estava logado quando". **Métrica**: tempo entre `signOut()` e token recusado pelo backend = ∞ (12h) → **≤60s** (TTL do cache). TTL: 12h → 4h.

- **Tactic alvo**: Revoke Access
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - TTL de token: 12h → **4h**
  - Latência de revogação: ∞ → **≤60s**
  - % requests com check de denylist: 0% → **100%**
- **Risco de não fazer**: JWT comprometido = 12h de baixa autorizada no `fin010`. Em ataque dirigido, dezenas de borderôs finalizados antes da expiração natural.
- **Dependências**: idealmente vem depois de [security-3] (audit trail) para enriquecer "quem revogou".

### [security-2] Granularidade RBAC: `analyst`, `approver`, `viewer` + 4-eyes em ações destrutivas

- **Problema**
  > Único role `admin` (`migrations/0007_app_user.sql:8`) — toda mutação (finalizar borderô, executar lote, estornar, excluir baixa) está autorizada pelo mesmo nível. Sem maker/checker. O confused-deputy fix (`requireOwnBorderoFilCod`) impede mexer em borderô de terceiro, mas dentro da trilha **uma única credencial fecha o ciclo**, contradiando o pitch de compliance financeiro.

- **Melhoria Proposta**
  > Modelo de roles: `viewer` (só `/gestao`, `/painel`, `/runs`), `analyst` (cria/edita alocação, processa, executa baixa individual), `approver` (finaliza borderô, executa lote, estorna), `admin` (gerência de usuários). Exigir 2 pessoas distintas em `POST /permutas/borderos/:b/finalizar` e `POST /permutas/reconciliar-lote` (analyst cria, approver finaliza). Atualizar 17 `requireRole` em `routes/permutas.ts`. Tactic Bass: Authorize Actors (granularidade).

- **Resultado Esperado**
  > Credencial comprometida fica isolada por papel; nenhuma única conta capaz de fechar o ciclo financeiro. **Métrica**: distinct roles em `app_user` = 1 → **≥3**; endpoints com 4-eyes = 0 → **≥2**.

- **Tactic alvo**: Authorize Actors (granularidade)
- **Severidade**: P1
- **Esforço estimado**: L
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - Roles distintas: 1 → **≥3**
  - Endpoints com aprovação independente: 0 → **2** (finalizar borderô, reconciliar-lote)
  - Auditoria de "quem aprovou X criado por Y": ausente → presente
- **Risco de não fazer**: única credencial vazada = dano máximo dentro do universo da trilha. Bloqueia compliance financeiro (SOX-like, ISO27001 SoD).
- **Dependências**: [security-3] (audit) para registrar pares maker/checker.

### [security-3] Tabela de audit trail de auth (login OK/falha, logout, revogação)

- **Problema**
  > Eventos de auth não persistem (`routes/auth.ts:25-43` sem `LogService`, `http/auth.ts:167-170` só `console.warn`). Drain do Render tem retenção ~7d — impossível responder forense ("quem tentou logar com `admin` nas últimas 24h?", "houve burst antes do login OK suspeito?"). Compliance LGPD/financeiro exige trilha persistida.

- **Melhoria Proposta**
  > Migration `app_audit_auth (id, ts, event_type, username, ip, user_agent, request_id, success, reason)`. `AuthService.login` grava `LOGIN_OK`/`LOGIN_FAIL` (motivo: `user_not_found`/`bad_password`). Middleware `http/auth.ts` grava `TOKEN_REJECTED` (motivo: expirado/inválido). `signOut()` (após [security-1]) grava `LOGOUT`. Índices por `(username, ts)` e `(ts)`. Tactic Bass: Audit Trail / Detect Intrusion.

- **Resultado Esperado**
  > Forense de incidente em SQL (não em logs de drain). **Métrica**: linhas/dia em prod = 0 → ~100-500 (login/logout normais). Tempo de "quem logou às 14:23?": grep manual → SELECT em segundos.

- **Tactic alvo**: Audit Trail / Detect Intrusion
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-3, F-security-4
- **Métricas de sucesso**:
  - Tabela `app_audit_auth` existente: 0 → **1**
  - Cobertura de eventos: 0% → **100%** (login/logout/token_rejected/revoked)
  - Retenção de auditoria: ~7d (drain Render) → **≥365d** (Supabase)
- **Risco de não fazer**: investigação de incidente vira reconstrução de log esfumaçado. Compliance falha.
- **Dependências**: nenhuma.

### [security-4] Lockout por conta + alerting de burst de falha de login

- **Problema**
  > `AuthService.login` (`AuthService.ts:48-57`) aceita tentativas ilimitadas no mesmo username desde que cada IP fique abaixo de 100/min. bcrypt rounds=12 retarda mas não trava. Credential stuffing distribuído (botnet com IPs rotativos) é viável; sem alarme, ninguém detecta.

- **Melhoria Proposta**
  > Colunas `app_user.failed_attempts` + `locked_until`. 5 falhas consecutivas no mesmo username → bloqueio temporário (backoff exponencial: 1min → 5min → 30min). Métrica/alarme: "N falhas em M min" agregado. Adicionar dummy bcrypt no caminho `user not found` para fechar o timing-attack (F-security-11) na MESMA feature. Tactic Bass: Lock Computer.

- **Resultado Esperado**
  > Brute-force distribuído fica inviável; analyst recebe alerta de tentativa anômala. **Métrica**: tentativas/min permitidas no mesmo username = ∞ → **≤5 antes do lock**.

- **Tactic alvo**: Lock Computer + Detect Intrusion
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-4, F-security-11
- **Métricas de sucesso**:
  - Tentativas máximas antes de lock: ∞ → **5**
  - Tempo de lock após 5 falhas: 0s → **1min (exponencial)**
  - Diferença de timing user-exists vs not-exists: ~100× → **≤1.2×**
- **Risco de não fazer**: credential stuffing dirigido contra `admin`/usuários conhecidos. Combinado com F-security-1 (12h JWT) = mover dinheiro.
- **Dependências**: [security-3] (audit trail) para alimentar o counter.

### [security-5] Adicionar `npm audit --audit-level=high` no job frontend do CI

- **Problema**
  > `.github/workflows/ci.yml:30-46` (job `frontend`) NÃO chama `npm audit`. Hoje há **1 high** (`ws` GHSA-96hv-2xvq-fx4p + GHSA-58qx-3vcg-4xpx, CVSS 7.5) escondido em dep transitiva dev-only — passou despercebido porque o gate não existe. Qualquer high futuro em dep direta de runtime (Next, React, sonner, zod) entrará em prod sem alarme.

- **Melhoria Proposta**
  > Adicionar `- run: npm audit --audit-level=high` no job frontend (espelhar `ci.yml:24`). Resolver/justificar o `ws` atual (atualizar `jest-environment-jsdom` ou suprimir via `overrides` se confirmado dev-only). Documentar processo de exceção (issue + label `security:waiver`). Tactic Bass: Limit Exposure (supply chain).

- **Resultado Esperado**
  > Gate equivalente nos dois lados. **Métrica**: vulns high+ em frontend: 1 (silencioso) → **0 (bloqueia merge)**; cobertura de `npm audit` no CI: 1/2 jobs → **2/2**.

- **Tactic alvo**: Limit Exposure (supply chain)
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - Frontend high vulns no CI: 1 (silencioso) → **0 (bloqueia merge)**
  - Cobertura `npm audit` no CI: 1/2 jobs → **2/2**
- **Risco de não fazer**: vuln crítica em prod descoberta por notícia, não por CI.
- **Dependências**: nenhuma.

### [security-6] Endurecer tenant isolation — coluna `tenant_id` no DB + EnvironmentProvider via SSM

- **Problema**
  > Promessa central da proposta SaaSo ("compromisso em A não vaza para B") **não está cumprida**. Hoje 1 Supabase + 1 Render + 1 conjunto de credenciais Conexos atende `client_name=local`. Adicionar o 2º cliente vira P0 de imediato — sem isolamento criptográfico, de rede ou de IAM.

- **Melhoria Proposta**
  > Roadmap em 3 passos: (1) coluna `tenant_id` em toda tabela de domínio (`permuta_*`, `app_user`, `permuta_alocacao_execucao`) + filtro `WHERE tenant_id = $tenant` em toda query (validar via `PatternGuardian`); (2) ativar `EnvironmentProvider.GetLambdaEnvironmentVars` (já existe; ativar via `client_name != local`) lendo SSM `/tenants/{env}/{client}/...`; (3) primeiro tenant real provisionado via Terraform (`infra/tenants/`). Tactic Bass: Separate Entities.

- **Resultado Esperado**
  > Cada cliente isolado por env/SSM/DB schema; compromisso em A não atinge B. **Métrica**: tenants isolados: 0 → **N**; queries com `tenant_id`: 0% → **100%**.

- **Tactic alvo**: Separate Entities
- **Severidade**: P1
- **Esforço estimado**: XL
- **Findings relacionados**: F-security-7, F-security-8
- **Métricas de sucesso**:
  - Contas/projetos isolados por cliente: 1 (compartilhado) → **N (1 por cliente)**
  - Queries com filtro tenant explícito: 0/N → **100%**
  - PatternGuardian gate "query sem tenant_id": ausente → presente
- **Risco de não fazer**: bloqueia onboarding do 2º cliente; qualquer incidente em tenant A vaza para B. Bloqueio comercial da SaaSo.
- **Dependências**: ADR estratégico (compra de migração agora vs ao 2º cliente) — chamar Yuri.

### [security-7] Helmet + security headers no Express

- **Problema**
  > `src/backend/index.ts:16-97` não monta `helmet()` — respostas backend saem sem `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. Frontend Vercel adiciona alguns, mas o backend (alvo direto de XHR) não.

- **Melhoria Proposta**
  > `npm i helmet`; `app.use(helmet())` antes do CORS em `index.ts`. CSP provavelmente desnecessária porque o backend só serve JSON. Tactic Bass: Limit Exposure.

- **Resultado Esperado**
  > Hardening browser-level via header. **Métrica**: security headers padrão setados pelo backend: 0 → **≥5** (helmet defaults).

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - Headers de segurança presentes (medido com `curl -I`): 0 → **≥5**
- **Risco de não fazer**: hardening fraco em browser; ferramentas tipo securityheaders.com dão nota F.
- **Dependências**: nenhuma.

### [security-8] Limpar `credentials: true` do CORS enquanto não houver cookie real

- **Problema**
  > `http/cors.ts:49` libera `credentials: true` (cookies cross-origin) sem que o sistema use cookie — Bearer no header (`lib/auth/token.ts:27-32`). Cria armadilha: um refactor futuro que adicione cookie de sessão (e.g. para mitigar F-security-1 via httpOnly cookie) herda essa flag e abre CSRF sem proteção.

- **Melhoria Proposta**
  > Remover `credentials: true` agora (validar que nada quebra). Adicionar comentário forte: "se voltar a usar cookie de sessão, RE-LIGAR e implementar CSRF token + SameSite=strict". Alternativa: implementar já o esquema cookie httpOnly + SameSite + CSRF token e migrar o JWT para lá (resolve F-security-1 também).

- **Resultado Esperado**
  > Sem superfície CSRF latente. **Métrica**: `Access-Control-Allow-Credentials` no response: `true` → **(removido)**.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-9, F-security-1
- **Métricas de sucesso**:
  - CORS `credentials` setting: `true` → **`false`** (até cookie real existir)
- **Risco de não fazer**: armadilha para próximo refactor.
- **Dependências**: idealmente coordenar com [security-1] (decisão sobre cookie httpOnly).

### [security-9] `requestId` em todo response 4xx/5xx do `errorMiddleware` + validações Zod

- **Problema**
  > `http/errorMiddleware.ts:35` devolve `{error: 'Internal server error'}` sem `requestId`. As validações Zod nas rotas (`routes/permutas.ts:284,315,362,385,491,522,550`) devolvem `{error: 'invalid body', details: ...}` também sem `requestId`. O header `X-Request-Id` está presente, mas usuário relatando um bug copia o body — não vê o ID e suporte demora para correlacionar.

- **Melhoria Proposta**
  > `res.status(500).json({ error: 'Internal server error', requestId: req.requestId });` (padrão já adotado em `respondActionError` em `routes/permutas.ts:117-155`). Idem para validações Zod: helper `respondZodError(res, parsed.error, req.requestId)`. Tactic Bass: Audit Trail (correlação).

- **Resultado Esperado**
  > Triagem de incidente mais rápida. **Métrica**: respostas de erro 4xx/5xx com `requestId` no body: ~50% → **100%**.

- **Tactic alvo**: Audit Trail (correlação)
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-security-10
- **Métricas de sucesso**:
  - % respostas 4xx/5xx com `requestId`: ~50% → **100%**
- **Risco de não fazer**: tempo de suporte aumenta; baixa prioridade.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Decisões de escopo**: escopo `all` cobriu backend + frontend + CI (sem `infra/` — não existe). Verifiquei explicitamente os deltas pedidos: F-security-1 do run anterior (DEV_AUTH_BYPASS deny-by-default) **FIXED** e testado em `authEnv.test.ts:66-118`; `requireOwnBorderoFilCod` (`BorderoGestaoService.ts:268-277`) **PRESENTE** e cobre `excluirBordero`/`finalizarBordero`/`cancelarBordero`/`estornarBordero`/`excluirBaixa` (filCod sempre da trilha, nunca do request); splits CC-1 e CC-2 não regrediram nada (auth do `ConexosBaseClient` delega ao `ConexosService.ensureSid` legado com `redactSensitive` intacto; SQL parametrizado preservado em todos os repos).
- **Métricas coletadas**: `npm audit` rodado nos dois lados — backend: 0 crit/0 high/20 mod/1 low (gate em CI); frontend: 0 crit/**1 high (`ws` dev-only)**/21 mod/1 low (SEM gate em CI). Nenhum hardcoded secret / AWS key / SQL não-parametrizado / `dangerouslySetInnerHTML` / `.env` commitado.
- **Métricas NÃO medíveis localmente**: MTTD de credencial vazada em prod, taxa de 401/403 por IP, WAF na borda do Render. Pediria instrumentação (CloudWatch/Datadog ou equivalente).
- **Cross-QA**:
  - **Fault Tolerance** — Audit Trail compartilhado (F-security-3 alimenta a trilha que Fault Tolerance também usa para recovery); idempotência write-ahead já cobre Restore.
  - **Availability** — Limit Exposure / Separate Entities (F-security-7) é o maior risco de blast radius cross-tenant; F-security-4 (lockout) impacta DoS de auth.
  - **Integrability** — Validate Input (Zod) cross-checa contratos Conexos; cobertura 100% nos boundaries.
  - **Deployability** — F-security-1 do run anterior (defesa em profundidade quebrada por nome do env) já FECHADO; `render.yaml` (`sync:false` para secrets) reduz risco de drift.
- **Score 6/10** (era 5): subiu 1 ponto pelos dois fixes desta sessão (deny-by-default no bypass + confused-deputy fechado em borderô). Continua puxado para baixo por revogação de credencial (12h em `localStorage`), audit de auth ausente, single-role/single-tenant e gate `npm audit` frontend faltando — incompatível com a promessa SaaSo financeira em multi-tenant.
