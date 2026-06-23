---
qa: Security
qa_slug: security
run_id: 2026-06-22-1658
agent: qa-security
generated_at: 2026-06-22T16:58:00-03:00
scope: all
score: 5.5
findings_count: 9
cards_count: 9
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Usuário autenticado (analista, não-admin) | Clica "Ingestão Manual" em loop, dispara CRUD em `cliente-filtro` e mutações em `alocacoes` que não lhe pertencem | Endpoints novos do PR #4: `POST /permutas/ingestao`, `POST /permutas/cliente-filtro`, `DELETE /permutas/cliente-filtro/:pesCod`, `POST/DELETE /permutas/adiantamentos/:docCod/alocacoes` | Produção (Render+Vercel+Supabase), JWT HS256 próprio (12h), sem RBAC | Sistema deveria recusar a operação por **falta de papel** (authorize actors) e impor teto de custo no fan-out Conexos (limit exposure) — hoje aceita todas | 0 ações financeiras executadas por usuário não-admin; ≤ N runs de ingestão/hora/usuário; trilha (`triggered_by`, `criado_por`) com identidade real |

Cenário-irmão (insider/credencial vazada): contribuidor com acesso à máquina local
extrai `src/backend/.env` (Conexos prod `MPS_FRANCINEI/@Amarelo521`, DB pooler
Supabase, `AUTH_JWT_SECRET`), forja JWT HS256 com qualquer `sub`/`role` e chama
qualquer endpoint do backend como se fosse o analista — sem necessidade de logar.
A baixa fica auditada como o `sub` forjado.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Segredos hardcoded em código | 0 | 0 | ✅ | `grep -rE "(password\|secret\|token\|api[_-]?key\|credential)\s*[:=]\s*['\"][^'\"]{8,}" src/{backend,frontend} --include="*.ts" --include="*.tsx" --include="*.json"` (zero hits fora de `.env`/tests) |
| Arquivos `.env` no working tree | 4 (gitignored) | 4 gitignored | ✅ | `find . -name ".env*" -not -path "*/node_modules/*"` → `src/backend/.env`, `src/backend/.env.example`, `src/frontend/.env.local`, `src/frontend/.env.example`; `git ls-files \| grep ".env"` só lista `.env.example` |
| Credenciais de produção em `.env` local | 4 (Conexos user+pwd, DB connstring, AUTH_JWT_SECRET) | trocar para SSM/secret manager | ⚠️ | `src/backend/.env:1-10` (texto plano legível por qualquer processo na máquina) |
| Endpoints novos com Zod no boundary | 6/6 (`ingestao` sem body, demais com `safeParse`) | 100% | ✅ | `src/backend/routes/permutas.ts:21,31,36,44,51` + `safeParse` chamado nas linhas 139, 168, 215, 236, 305 |
| SQL parametrizado (Rule #5) nos repos do PR #4 | 100% (named params `$nome` via SqlBuilder) | 100% | ✅ | `src/backend/domain/repository/permutas/{PermutaAlocacao,ClienteFiltro,PermutaSnapshot}Repository.ts` — zero `${}` em strings SQL |
| Endpoints com checagem de papel (RBAC) | 0/12 do `/permutas` (qualquer JWT autenticado pode tudo) | mínimo `admin` em `cliente-filtro` CRUD, `ingestao`, `eleicao` | ❌ | `src/backend/routes/permutas.ts` — só usa `req.user?.sub` para auditoria, nunca testa `req.user?.role` |
| Rate-limit em `/permutas` (heavy) | 10 req/min/IP | mantém, mas adicionar quota por usuário | ⚠️ | `src/backend/index.ts:87` + `src/backend/http/rateLimit.ts:20-26`. Usuário já bateu 429 em produção → DoS/custo real validado. |
| Storage do JWT no frontend | `localStorage` (acessível a qualquer XSS) | cookie `httpOnly; SameSite=Strict; Secure` | ⚠️ | `src/frontend/lib/auth/AuthProvider.tsx:44,68`, `src/frontend/lib/auth/token.ts:5-19` |
| CSRF protection em mutating endpoints | ausente (token via header, mas sem `SameSite` enforcement) | irrelevante se token sai do localStorage; obrigatório se mover para cookie | N/A | `grep -rn "csrf\|sameSite" src` → 0 hits (ok pelo modelo atual de header `Authorization: Bearer`) |
| Vazamento de senha em logs | **request logger imprime `req.body` cru** → `POST /auth/login` loga `{"username":"…","password":"…"}` em texto plano no stdout | mascarar `password`, `token`, `Authorization` antes do log | ❌ | `src/backend/index.ts:44-45` (`if (body && Object.keys(body).length) console.log("[REQ] … body=" + JSON.stringify(body))`) — passa para Render log drains |
| Vazamento via error middleware | ✅ retorna `Internal server error` genérico; loga `err.message` + corpo Conexos só server-side | manter | ✅ | `src/backend/http/errorMiddleware.ts:22-35` |
| CORS wildcard | ❌ (whitelist por `ALLOWED_ORIGINS`, suporta `*.vercel.app` por sufixo) | manter | ✅ | `src/backend/http/cors.ts:31-55` |
| XSS surface (`dangerouslySetInnerHTML`/`innerHTML`) | 0 | 0 | ✅ | `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/frontend --include="*.tsx" --include="*.ts"` → 0 hits |
| Verificador JWT robusto | ✅ `jose` com `audience` + `issuer` + escolha de algoritmo por header; rejeita expirado | manter | ✅ | `src/backend/http/auth.ts:96-174` |
| Senha de app armazenada como hash | ✅ bcrypt comparação em `AuthService.login` | manter | ✅ | `src/backend/domain/service/auth/AuthService.ts:52`, `migrations/0007_app_user.sql:7` |
| `DEV_AUTH_BYPASS` permite anonimato | `true` → middleware vira no-op (warn) | enforced apenas localmente; FE também checa | ⚠️ | `src/backend/http/auth.ts:100-108`, `src/frontend/lib/auth/AuthProvider.tsx:9` (`assertAuthEnv` em build não-local) |
| npm audit backend (critical/high/moderate/low) | 0 / 0 / 20 / 1 (dev-deps: jest, ts-jest, axios `<1.13`) | crit=0, high=0, mod≤5 | ⚠️ | `cd src/backend && npm audit --json` → metadata.vulnerabilities |
| npm audit frontend (critical/high/moderate/low) | 0 / 1 / 21 / 1 (ws via jsdom — DEV ONLY) | crit=0, high=0, mod≤5 | ⚠️ | `cd src/frontend && npm audit --json`; `npm ls ws` → `jest-environment-jsdom@30.3.0 > jsdom > ws@8.20.0` (não vai a prod) |
| Audit trail em mutações financeiras | `triggered_by`/`criado_por`/`processado_por` preenchidos em runs, alocações, processamentos, cliente-filtro | manter; padronizar imutabilidade (P1 — ver Fault-Tolerance) | ✅ | `src/backend/migrations/0001:19`, `0004:17`, `0013:11`, `0014:24`; rotas em `permutas.ts:79,109,173,241,311` |

> ⚠️ **Não medível localmente**: CloudTrail/GuardDuty (não há infra AWS hoje — Render+Vercel+Supabase); detecção de tráfego anômalo (sem WAF/Cloudflare na frente do Render); falha de auth alarmada (sem Sentry/CloudWatch — `console.warn` em `auth.ts:167-170` fica só no log drain).

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Apenas `console.warn` em JWT inválido; sem alarme/agregação | ❌ ausente | `src/backend/http/auth.ts:167-170` |
| Detect Service Denial | Rate-limit Express por IP detecta flood, mas não emite alarme | ⚠️ parcial | `src/backend/http/rateLimit.ts` |
| Verify Message Integrity | JWT HS256 com `audience` + `issuer` + verificação por header de algoritmo | ✅ presente | `src/backend/http/auth.ts:136-153` |
| Detect Message Delay | N/A — sem mensageria nem mTLS interservico (Express monolito) | N/A | — |
| Identify Actors | `sub`/`email` do JWT propagados como `triggered_by`/`criado_por`/`processado_por` nas tabelas | ✅ presente | `routes/permutas.ts:79,109,173,241,311` |
| Authenticate Actors | `buildAuthMiddleware` (jose) cobre todas as rotas exceto `/health` e `/auth/login`; HS256 (próprio) + JWKS (Supabase legado) | ✅ presente | `src/backend/index.ts:63-75`, `src/backend/http/auth.ts:96-174` |
| Authorize Actors | **AUSENTE**. `role` é lido (`AuthUser.role`) e gravado no JWT, mas nenhuma rota faz `if (req.user.role !== 'admin')`. Qualquer JWT válido pode CRUD em `cliente-filtro`, disparar `ingestao`/`eleicao`, criar/remover alocações de qualquer adto | ❌ ausente | `grep -rn "role !==\|requireRole\|hasRole" src/backend/routes` → 0 hits |
| Limit Access | `bcrypt` em `app_user`; `DEV_AUTH_BYPASS` veda em build não-local (`assertAuthEnv`) | ⚠️ parcial | `src/backend/domain/service/auth/AuthService.ts:52`; `src/frontend/lib/auth/env.ts` |
| Limit Exposure | Rate-limit global (100/min) + heavy (10/min) por IP. **Sem cota por usuário** → `triggered_by` único pode esgotar quota Conexos compartilhada de outros usuários no mesmo IP NAT corporativo. Sem WAF/proxy gerenciado. | ⚠️ parcial | `src/backend/http/rateLimit.ts:11-26`, `src/backend/index.ts:30,80,87` |
| Encrypt Data | TLS em todos os egressos (Conexos `https://`, Supabase `pooler.supabase.com`, BCB). **Em repouso**: senha bcrypt; demais campos (CNPJ, valor, sub do JWT) sem criptografia ao nível de app — depende do disco do Postgres Supabase. | ⚠️ parcial | `src/backend/.env:1,5`; migrations `0007_app_user.sql:7` |
| Separate Entities | Multi-tenant é **estado-alvo** (uma conta AWS por cliente). Hoje: 1 backend Express + 1 DB Supabase compartilhado entre clientes futuros. O JWT não carrega `tenantId` e nenhum filtro em repo escopa por cliente. | ❌ ausente (vs. promessa SaaSo) | `CLAUDE.md` "Estado Atual vs. Alvo"; `src/backend/domain/repository/permutas/*` sem cláusula `WHERE tenant_id = $x` |
| Change Default Settings | `DEV_AUTH_BYPASS` default `false`; `npm_package_version` em `/health`; rate-limit ativo de fábrica | ✅ presente | `src/backend/http/authEnv.ts`, `src/backend/index.ts:62,30` |
| Validate Input | Zod no boundary em **6/6 endpoints novos** do PR #4 (corpo + query) | ✅ presente | `src/backend/routes/permutas.ts:21,31,36,44,51` |
| Revoke Access | **AUSENTE**. JWT HS256 com TTL=12h, `signOut` apenas remove do `localStorage` — **token continua válido server-side** até expirar. Sem revogação/blacklist. Trocar `AUTH_JWT_SECRET` é o único kill-switch (invalida TODAS as sessões). | ❌ ausente | `src/backend/domain/service/auth/AuthService.ts:24` (`TOKEN_EXPIRATION='12h'`), `src/frontend/lib/auth/AuthProvider.tsx:77-84` |
| Lock Computer | N/A — Express stateless, sem sessão server-side para travar | N/A | — |
| Inform Actors | UI mostra 429 / 409 / 422 (`AlocacaoSaldoError`, `IngestLockBusyError`); sem notificação por canal externo | ⚠️ parcial | `src/backend/routes/permutas.ts:120-129,258-268`, `src/frontend/lib/api.ts:118-133` |
| Restore | Postgres via Supabase (backup gerenciado, ver Availability/Fault-Tolerance). Sem teste de restore documentado neste repo. | ⚠️ parcial | (cross-QA: availability) |
| Audit Trail | `triggered_by`, `criado_por`, `processado_por` carimbados nas tabelas; `permuta_eleicao_run` registra cada execução. Sem flag de imutabilidade (UPDATE possível com mesma role do app). | ✅ presente (com débito) | `migrations/0001:19`, `0004:17`, `0013:11`, `0014:24` (cross-QA: fault-tolerance) |

## 4. Findings (achados)

### F-security-1: Sem RBAC — qualquer JWT válido executa CRUD financeiro e dispara fan-out Conexos pesado

- **Severidade**: P0
- **Tactic violada**: Authorize Actors
- **Localização**: `src/backend/routes/permutas.ts:73-323` (12 rotas), `src/backend/http/auth.ts:55-64` (lê `role` mas nunca exige)
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts — TODA rota só pega o sub p/ AUDITORIA; nunca testa role
  const triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown';
  // … nada como if (req.user?.role !== 'admin') res.status(403)
  ```
  ```bash
  $ grep -rn "role !==\|requireRole\|hasRole\|isAdmin" src/backend/routes
  # zero hits
  ```
  `AuthService.signToken` insere `role` no JWT (`AuthService.ts:68`), provando que a informação existe — só não é consumida.
- **Impacto técnico**: Qualquer analista (ou conta de teste) com login válido pode: (a) cadastrar/remover **cliente-filtro** mudando o roteamento da pipeline de outros usuários; (b) criar/sobrescrever **alocações N:M** em adiantamentos que não são seus (UPSERT por `(adto, invoice)`); (c) disparar `POST /permutas/ingestao` ou `/eleicao` arbitrariamente, esgotando a sessão pool do Conexos (`LOGIN_ERROR_MAX_SESSIONS`).
- **Impacto de negócio**: Multi-tenant SaaSo "promete" que cliente A não toca cliente B. Hoje, dentro do mesmo deploy, um *usuário* sem privilégio já não respeita o domínio do outro. Quando SISPAG (write-back de remessa) e baixa Conexos forem ligados, o mesmo gap = autorização indevida de pagamento.
- **Métrica de baseline**: 0/12 rotas do `/permutas` checam papel. Alvo: ≥ 5 (ingestao, eleicao, cliente-filtro POST+DELETE, alocação POST+DELETE) exigem `role='admin'` ou papel dedicado.

### F-security-2: `.env` local de desenvolvedor contém credenciais de produção em texto plano

- **Severidade**: P0
- **Tactic violada**: Limit Access · Encrypt Data
- **Localização**: `src/backend/.env:1-10`
- **Evidência (objetiva)**:
  ```
  CONEXOS_BASE_URL=https://columbiatrading.conexos.cloud/api
  CONEXOS_USERNAME=MPS_FRANCINEI
  CONEXOS_PASSWORD=@Amarelo521
  databaseConnectionString=postgresql://postgres.kngrpoqzaxtuzkcugsyl:KavexCLX%40CLC@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
  AUTH_JWT_SECRET=KsgFKoprJeDiMWZB2X6OwazzZdXCoxTqizrHH7gVSuxBwxT6EE4tNQJzySSrGYP/
  ```
  Está gitignored (`git check-ignore` confirma), portanto **não foi commitado** — o risco é outro: a senha do usuário Conexos `MPS_FRANCINEI` (que dispara baixas/permutas no ERP em produção) e o segredo HS256 do JWT vivem em texto plano no disco do desenvolvedor. Qualquer malware/leak local extrai e:
  1. Logar diretamente no Conexos como esse usuário (não há MFA na conta de serviço).
  2. **Forjar JWTs HS256 arbitrários** com `sub` e `role` de qualquer usuário do app (o middleware aceita qualquer token assinado com esse segredo, audience `authenticated`).
- **Impacto técnico**: Bypass total do login. Atacante não precisa nem chamar `/auth/login` — assina o token, manda para `/permutas/*` e a auditoria fica gravada com o `sub` que ele escolheu.
- **Impacto de negócio**: Quando os write-backs financeiros (baixa de permuta, remessa SISPAG) entrarem no ar (estado-alvo), esse mesmo segredo move dinheiro. Em SaaSo multi-tenant a única defesa arquitetural é segredo único por tenant + rotação automática — sem isso, comprometer a máquina de **um** dev compromete **todos** os tenants futuros.
- **Métrica de baseline**: 1 segredo HS256 simétrico, sem rotação automatizada, compartilhado entre todos os ambientes do contribuidor (não validado se Render usa um valor diferente; `EnvironmentProvider.readEnv('AUTH_JWT_SECRET')` consome o mesmo nome).

### F-security-3: Request logger imprime `req.body` cru → senha de `/auth/login` em log

- **Severidade**: P0
- **Tactic violada**: Limit Access · Encrypt Data (em trânsito-para-log) · Audit Trail (poluição)
- **Localização**: `src/backend/index.ts:44-45`
- **Evidência (objetiva)**:
  ```ts
  if (body && Object.keys(body).length)
      console.log(`[REQ] ${requestId} body=${JSON.stringify(body)}`);
  ```
  E em `routes/auth.ts:10-13` o `loginBodySchema` aceita `{ username, password }` que vai inteiro para `req.body`. Stack de execução: `app.use(express.json())` → `requestIdMiddleware` → **logger** → `/auth/login`. Resultado: cada login imprime `body={"username":"…","password":"<texto plano>"}` no stdout do Render, que vai para o log drain configurado (qualquer integração de logs — Logtail, Papertrail, etc. — recebe a senha).
- **Impacto técnico**: Senhas dos analistas vazam para qualquer destino agregador de logs. Logs de Render são retidos por padrão e visíveis a qualquer membro do workspace. Mesma rota também loga `body` de POSTs com `Authorization` em outros headers (esse não, mas o padrão é amplo demais).
- **Impacto de negócio**: Vazamento de senhas de operadores do financeiro = LGPD + invalidação de qualquer auditoria (não dá pra provar quem usou a senha após o vazamento). Em SaaSo multi-tenant a regra é simples: **senha nunca toca disco em texto plano nem em log**.
- **Métrica de baseline**: 100% dos POSTs (incluindo `/auth/login`) têm seu body logado integralmente. Alvo: 0% — sempre mascarar `password`, `token`, `secret`, `Authorization` antes do `JSON.stringify`.

### F-security-4: JWT no `localStorage` do frontend (vetor XSS direto)

- **Severidade**: P1
- **Tactic violada**: Limit Exposure
- **Localização**: `src/frontend/lib/auth/AuthProvider.tsx:44,68`; `src/frontend/lib/auth/token.ts:5,19`
- **Evidência (objetiva)**:
  ```ts
  // AuthProvider.tsx:68
  window.localStorage.setItem(TOKEN_STORAGE_KEY, body.token)
  // token.ts:19
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined
  ```
- **Impacto técnico**: Qualquer XSS — incluindo dependência transitiva comprometida (Next.js carrega ~hundreds via npm) — lê o token e o envia para um C2. O backend não distingue token roubado de token legítimo; com 12h de TTL e sem revogação (F-security-7), o atacante tem janela longa.
- **Impacto de negócio**: Operações financeiras assinadas com identidade roubada. Sem flag `HttpOnly` o time perde a defesa primária do navegador contra exfiltração.
- **Métrica de baseline**: 0% dos tokens em cookie `HttpOnly; Secure; SameSite=Strict`. Alvo: 100%.

### F-security-5: Endpoints novos do PR #4 sem cota por usuário — gatilho UI de ingestão é vetor de DoS/custo

- **Severidade**: P1
- **Tactic violada**: Limit Exposure · Detect Service Denial
- **Localização**: `src/backend/index.ts:87`, `src/backend/http/rateLimit.ts:20-26`, `src/backend/routes/permutas.ts:104-131`
- **Evidência (objetiva)**:
  ```ts
  // rateLimit.ts:20 — janela 60s, 10 req/IP
  export const heavyRouteLimiter: RateLimitRequestHandler = rateLimit({
      windowMs: 60_000, limit: 10, …
  });
  ```
  Confirmação operacional: usuário **bateu 429** em produção depois de poucos cliques no botão "Ingestão Manual" (ingestão dura ~1min e faz fan-out pesado a Conexos). O limiter é por IP — atrás de NAT corporativo (mesmo IP para vários analistas), um usuário ruim/curioso bloqueia o time todo. Não há cota por `sub`/`role` nem teto de custo absoluto (ex: máx N execuções/dia).
- **Impacto técnico**: DoS lateral entre analistas no mesmo escritório. Esgotamento da sessão pool do Conexos (`LOGIN_ERROR_MAX_SESSIONS`) → ingestão do cron também falha. Custo: cada ingestão = N páginas × M filiais de chamadas Conexos.
- **Impacto de negócio**: Botão de UI vira ferramenta de auto-DoS — exatamente o que o usuário relatou. Quando custo Conexos for cobrado por API call, vira custo direto.
- **Métrica de baseline**: 429 reproduzível com ≥ 10 cliques em 60s do mesmo IP corporativo. Alvo: cota por usuário (`sub`) de N runs/hora + lock 409 já existente (`IngestLockBusyError`); idealmente, botão na UI fica desabilitado por X minutos após disparo.

### F-security-6: Sem detecção/alarme de autenticação falha ou flood — Detect Intrusion ausente

- **Severidade**: P1
- **Tactic violada**: Detect Intrusion · Detect Service Denial
- **Localização**: `src/backend/http/auth.ts:166-172`, `src/backend/http/rateLimit.ts`
- **Evidência (objetiva)**:
  ```ts
  // auth.ts:167
  console.warn(`[auth] rejected request to ${req.method} ${req.originalUrl}:`, …);
  res.status(401).json(…);
  ```
  Nenhuma agregação, métrica, alarme. Tentativa de brute-force no `/auth/login` (não rate-limited por usuário, só por IP de 100/min) só aparece como linhas soltas no log do Render — sem Sentry/Datadog/CloudWatch ligado, ninguém vê.
- **Impacto técnico**: Atacante pode tentar 100 senhas/min/IP indefinidamente, sem alarme. Em pico, mistura com tráfego legítimo e some.
- **Impacto de negócio**: A proposta da Columbia (`docs/proposta/`) trata corporate login + RBAC como cross-cutting; "perceber que alguém está atacando" é o complemento natural disso. Sem isso, o time descobre o problema só depois do prejuízo.
- **Métrica de baseline**: 0 alarmes configurados. Alvo: alarme após N=20 falhas de auth em janela de 5min (por IP e por username) + métrica Prometheus/CloudWatch.

### F-security-7: Sem revogação server-side — `signOut` é puramente client-side; token vale 12h

- **Severidade**: P1
- **Tactic violada**: Revoke Access
- **Localização**: `src/backend/domain/service/auth/AuthService.ts:24`, `src/frontend/lib/auth/AuthProvider.tsx:77-84`
- **Evidência (objetiva)**:
  ```ts
  // AuthService.ts:24
  const TOKEN_EXPIRATION = '12h';
  // AuthProvider.tsx:77-84 — signOut só remove do localStorage
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  ```
  Não existe `app_session` table, denylist, ou rotação per-login. Mudar `AUTH_JWT_SECRET` revoga **tudo**.
- **Impacto técnico**: Demissão de um analista exige rotacionar o segredo (forçando re-login de todos) ou esperar 12h. Token roubado por XSS (F-security-4) dura 12h sem freio.
- **Impacto de negócio**: Risco de insider que sai com token ativo executando ações antes do `AUTH_JWT_SECRET` rotacionar.
- **Métrica de baseline**: TTL token = 12h; revogação granular = ausente. Alvo: revogação por `sub` ≤ 1min após `signOut`/desativação.

### F-security-8: Multi-tenant SaaSo — sem `tenantId` no JWT nem cláusula de escopo nos repos

- **Severidade**: P1
- **Tactic violada**: Separate Entities
- **Localização**: `src/backend/http/auth.ts:17-21`, `src/backend/domain/repository/permutas/*.ts`
- **Evidência (objetiva)**:
  ```ts
  // AuthUser sem tenantId
  export interface AuthUser { sub: string; email?: string; role?: string; }
  ```
  Repos consultam tabelas globais sem `WHERE tenant_id = $x` (ex: `ClienteFiltroRepository.listAtivos`, `PermutaAlocacaoRepository.listAtivas`). Estado atual: monocliente (Columbia). Quando vier o 2º cliente, o caminho de migração é grande — e qualquer feature que escrever entre lá sem refatorar quebra o isolamento.
- **Impacto técnico**: Promessa "uma conta AWS por cliente" do alvo SaaSo só funciona se a aplicação **também** souber filtrar. Hoje não sabe.
- **Impacto de negócio**: Maior risco arquitetural do produto. Vazamento entre tenants = perda de contrato.
- **Métrica de baseline**: 0/N queries com filtro por tenant. Alvo: 100% (quando o 2º cliente entrar).

### F-security-9: Dependências dev com vulnerabilidades moderate/high — limpeza pendente

- **Severidade**: P2
- **Tactic violada**: Limit Exposure (dev-side)
- **Localização**: `src/backend/package.json`, `src/frontend/package.json`
- **Evidência (objetiva)**:
  ```
  backend  : 0 crit · 0 high · 20 mod · 1 low  (jest, ts-jest, @istanbuljs/load-nyc-config, axios <1.13)
  frontend : 0 crit · 1 high · 21 mod · 1 low  (ws@8.20.0 via jest-environment-jsdom > jsdom — DEV ONLY)
  ```
  `ws@8.20.0` high (GHSA-96hv-2xvq-fx4p, DoS) é apenas dev — não sobe no bundle Vercel. Mas o ruído alto mascara CVEs de prod quando surgirem.
- **Impacto técnico**: Pipeline CI sem `npm audit --audit-level=high` não falha; novas vulns críticas passam despercebidas.
- **Impacto de negócio**: Custódia financeira não deveria depender de "alguém roda audit de vez em quando".
- **Métrica de baseline**: critical=0 (ok), high=1 dev (ok), moderate=41 total. Alvo: high=0, moderate≤5; `npm audit --audit-level=high` no CI.

## 5. Cards Kanban

### [security-1] Introduzir RBAC server-side (`requireRole('admin')`) em rotas de mutação e fan-out

- **Problema**
  > As 12 rotas em `src/backend/routes/permutas.ts` aceitam qualquer JWT válido. `req.user?.role` está disponível (vem do `AuthService.signToken`) mas nenhuma rota o consulta. Resultado: um analista comum dispara `POST /permutas/ingestao`, cria alocações em adtos alheios e remove `cliente-filtro` cadastrado por outro usuário sem qualquer verificação.
- **Melhoria Proposta**
  > Criar `requireRole('admin' | 'operator')` em `src/backend/http/authz.ts`; aplicar em `POST /permutas/ingestao`, `POST /permutas/eleicao`, `POST /permutas/cliente-filtro`, `DELETE /permutas/cliente-filtro/:pesCod`, `POST/DELETE /permutas/adiantamentos/:docCod/alocacoes`. Casos de leitura (`GET /gestao`, `/runs`, `/painel`, `/cliente-filtro`, `/importadores`, `/invoices/buscar`) continuam apenas autenticados. Tactic Bass: **Authorize Actors**.
- **Resultado Esperado**
  > Usuário não-admin recebe HTTP 403 em endpoints de mutação financeira. Métrica: 0/12 → ≥ 5/12 rotas com check de papel; teste de integração com JWT `role='viewer'` retorna 403 nessas rotas.
- **Tactic alvo**: Authorize Actors
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Rotas com check de papel: 0 → ≥ 5
  - Testes Jest com JWT `role='viewer'` recebendo 403: 0 → ≥ 5
- **Risco de não fazer**: Quando SISPAG/baixa Conexos entrar (write-back que move dinheiro), o mesmo gap autoriza qualquer analista a finalizar lotes de pagamento.
- **Dependências**: nenhuma (lê `role` já presente no JWT)

### [security-2] Mover credenciais reais para secret manager + rotacionar o `AUTH_JWT_SECRET` exposto

- **Problema**
  > `src/backend/.env` contém senha Conexos `MPS_FRANCINEI/@Amarelo521`, connection string do Postgres Supabase e o `AUTH_JWT_SECRET`. Qualquer dev com a máquina comprometida forja JWTs HS256 com qualquer `sub`/`role` e bypassa o login. O segredo é HS256 simétrico, sem rotação, igualmente capaz de assinar quanto verificar.
- **Melhoria Proposta**
  > (1) Rotacionar `AUTH_JWT_SECRET` em produção *hoje* (invalidando sessões — aceitar como custo). (2) Migrar credenciais sensíveis (Conexos, DB, JWT secret) do `.env` local para 1Password/Doppler/AWS SSM ParameterStore (alvo SaaSo: `/tenants/{env}/{client}/...`). (3) Trocar HS256 por chave assimétrica (ES256/EdDSA) — só o backend assina, qualquer leitor com a pública verifica, leak do verificador ≠ leak do assinador. Tactic Bass: **Limit Access · Encrypt Data**.
- **Resultado Esperado**
  > `.env` local contém apenas referências (`AUTH_JWT_SECRET_REF=op://vault/jwt`) que são resolvidas no boot. Métrica: # de credenciais de prod em texto plano em disco de dev = N → 0; algoritmo JWT = HS256 → ES256.
- **Tactic alvo**: Limit Access · Encrypt Data
- **Severidade**: P0
- **Esforço estimado**: M (2–5d) — rotação imediata + migração faseada
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - Senhas/segredos prod em `.env` dev: 4 → 0
  - Algoritmo JWT: HS256 → ES256
  - Rotação documentada: ad hoc → procedimento + agenda
- **Risco de não fazer**: Quando SISPAG/Nexxera entrar, o mesmo modelo de segredo move remessa bancária real. Insider/dev comprometido = remessa fraudulenta auditada com `sub` de terceiro.
- **Dependências**: nenhuma

### [security-3] Mascarar campos sensíveis no request logger antes do `JSON.stringify`

- **Problema**
  > `src/backend/index.ts:44-45` imprime o body cru de toda request. `POST /auth/login` recebe `{ username, password }` em JSON, então cada login envia `password=<texto plano>` para stdout do Render e seus log drains. Senhas dos analistas vazam para qualquer agregador conectado.
- **Melhoria Proposta**
  > Criar `redactBody(body, keys=['password','token','authorization','secret','api_key'])` que substitui valores por `'[REDACTED]'`. Aplicar no logger. Tactic Bass: **Limit Access**.
- **Resultado Esperado**
  > Log de `POST /auth/login` mostra `body={"username":"foo","password":"[REDACTED]"}`. Métrica: 100% → 0% de logs com senha em texto plano. Teste: snapshot do logger não contém valor de campo `password`.
- **Tactic alvo**: Limit Access
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Senhas em logs: presente → ausente (teste assertando)
  - Cobertura da lista de campos redacted: 0 → ≥ 5 chaves canônicas
- **Risco de não fazer**: 1 senha vazada = 1 conta de analista comprometida para uso fora de horário. LGPD: dado pessoal sensível em log indevido.
- **Dependências**: nenhuma

### [security-4] Migrar token de `localStorage` para cookie `HttpOnly; Secure; SameSite=Strict`

- **Problema**
  > O JWT vive em `localStorage` (`AuthProvider.tsx:44,68`). Qualquer XSS — incluindo via dependência transitiva — lê e exfiltra. Sem `HttpOnly`, o navegador não oferece defesa.
- **Melhoria Proposta**
  > Backend devolve o JWT como cookie `Set-Cookie: app_token=…; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` no `POST /auth/login`. Frontend deixa de manipular o token (`AuthProvider` lê só `username`). Middleware de auth lê o cookie OU o `Authorization: Bearer` (compatibilidade com clients server-to-server). Adicionar CSRF token (double-submit) para mutações, já que cookie auto-anexado abre superfície. Tactic Bass: **Limit Exposure**.
- **Resultado Esperado**
  > Token inacessível a JavaScript no navegador. Métrica: 0 → 100% dos tokens em cookie `HttpOnly`.
- **Tactic alvo**: Limit Exposure
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-4, F-security-7
- **Métricas de sucesso**:
  - Token em `localStorage`: presente → ausente
  - CSRF token em mutações: ausente → presente
- **Risco de não fazer**: 1 XSS = janela de 12h com identidade do usuário em prod financeiro.
- **Dependências**: nenhuma

### [security-5] Cota por usuário (`sub`) em `/permutas/ingestao` e `/eleicao` + lock visível na UI

- **Problema**
  > `heavyRouteLimiter` é por IP (10/min) — atrás de NAT corporativo, um usuário bloqueia o time todo (usuário **já hit 429 em produção** clicando o botão de ingestão). Sem cota por `sub` nem teto absoluto diário.
- **Melhoria Proposta**
  > Adicionar `userQuotaLimiter` (Redis ou tabela `request_quota` no Postgres) chaveado por `req.user.sub` para as rotas de ingestão/eleição: N=3 runs/hora/usuário. Já existe `IngestLockBusyError` (409); expor no FE como botão desabilitado com countdown enquanto a run estiver em andamento. Tactic Bass: **Limit Exposure**.
- **Resultado Esperado**
  > Usuário individual não consegue queimar fan-out Conexos do escritório inteiro. Métrica: cota = IP-only → IP + sub; 429 esperado por usuário > 3 runs/h.
- **Tactic alvo**: Limit Exposure · Detect Service Denial
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - Cota por `sub` ativa nas 2 rotas: 0 → 2
  - Botão de UI bloqueado por lock 409: não → sim (estado visível)
- **Risco de não fazer**: DoS lateral entre analistas + esgotamento do session pool Conexos (cron oficial passa a falhar).
- **Dependências**: nenhuma

### [security-6] Métricas + alarme de falha de autenticação e flood — Detect Intrusion

- **Problema**
  > `auth.ts:167` só faz `console.warn` em JWT inválido. Sem agregação, sem alarme, sem painel — brute-force passa despercebido. Não há contador por IP/username no `/auth/login`.
- **Melhoria Proposta**
  > Emitir métrica (`auth.rejection`) com tags `{reason:'expired'|'invalid', ip, username?}`. Quando subir Sentry/Datadog/CloudWatch, alarmar em ≥ 20 falhas/5min/IP **ou** ≥ 5 falhas/5min/username. Aplicar `loginAttemptLimiter` específico em `/auth/login` (mais restritivo que o global, ex: 5/min/IP). Tactic Bass: **Detect Intrusion**.
- **Resultado Esperado**
  > Tentativa de brute-force é detectada em ≤ 5min. Métrica: 0 → 1 alarme configurado; 100/min/IP no `/auth/login` → 5/min/IP.
- **Tactic alvo**: Detect Intrusion · Detect Service Denial
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — depende de ter stack de observabilidade contratada
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - Rate-limit dedicado de login: ausente → presente (5/min/IP)
  - Alarme de falha de auth: 0 → 1
- **Risco de não fazer**: Brute-force silenciosa em horário noturno; descoberta só pós-incidente.
- **Dependências**: stack de observabilidade (cross-QA: testability/availability)

### [security-7] Revogação server-side de token (`signOut` real + denylist por `sub`)

- **Problema**
  > `signOut` no frontend só apaga o `localStorage`. O JWT continua válido por até 12h. Não há revogação granular — só rotação global do `AUTH_JWT_SECRET` invalida tudo.
- **Melhoria Proposta**
  > Criar tabela `app_session` com `(jti, sub, issued_at, revoked_at)`. `AuthService.signToken` inclui `jti` (UUID); middleware verifica `revoked_at IS NULL`. `signOut` server-side faz `UPDATE app_session SET revoked_at = now() WHERE jti = $jti`. Frontend chama `POST /auth/logout` antes de limpar o `localStorage`. Reduzir `TOKEN_EXPIRATION` para `2h` com refresh token de 12h. Tactic Bass: **Revoke Access**.
- **Resultado Esperado**
  > Demissão/comprometimento revogados em ≤ 1min. Métrica: TTL efetivo 12h sem revogação → 2h com revogação ≤ 1min.
- **Tactic alvo**: Revoke Access
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-7, F-security-4
- **Métricas de sucesso**:
  - Token revogável por `sub`: não → sim
  - TTL nominal: 12h → 2h (+ refresh)
- **Risco de não fazer**: Insider que sai com token vivo executando ações até 12h.
- **Dependências**: F-security-4 (cookie HttpOnly) idealmente antes

### [security-8] Introduzir `tenantId` no JWT e cláusula de escopo nos repos — preparar SaaSo

- **Problema**
  > `AuthUser` (`http/auth.ts:17`) não carrega `tenantId`. Repos (`ClienteFiltroRepository`, `PermutaAlocacaoRepository`, …) consultam tabelas sem filtro de tenant. Estado atual: monocliente. Quando o 2º cliente vier, ou se converge para 1 conta AWS por cliente como promete o alvo, a aplicação não sabe filtrar — vazamento entre tenants é inevitável.
- **Melhoria Proposta**
  > Adicionar `tenant_id` (NOT NULL com default na migração inicial) em todas as tabelas mutáveis (`cliente_filtro`, `permuta_alocacao`, `permuta_processamento`, `permuta_eleicao_run`, `permuta_*`). Estender `AuthUser` com `tenantId` lido do JWT. Criar `withTenant(client, sub)` wrapper que injeta `WHERE tenant_id = $tenant` em todas as queries. PatternGuardian falha se um repo novo não usar `withTenant`. Tactic Bass: **Separate Entities**.
- **Resultado Esperado**
  > Aplicação multi-tenant-safe antes do 2º cliente. Métrica: 0/N queries com filtro de tenant → 100%.
- **Tactic alvo**: Separate Entities
- **Severidade**: P1
- **Esforço estimado**: L (1–2sem) — toca todos os repos e migrações
- **Findings relacionados**: F-security-8
- **Métricas de sucesso**:
  - Queries com `tenant_id` filtrado: 0% → 100%
  - JWT carregando `tenantId`: não → sim
- **Risco de não fazer**: 2º cliente entra e a refatoração vira urgente, com risco de descobrir leak depois da entrega.
- **Dependências**: alinhamento de roadmap (quando o 2º cliente entra)

### [security-9] CI gate `npm audit --audit-level=high` em backend e frontend

- **Problema**
  > `npm audit` revela: backend 20 moderate + 1 low; frontend 1 high (ws via jsdom — dev) + 21 moderate. O alto ruído de dev-deps esconde futuras vulns de prod; CI não falha em vuln nova.
- **Melhoria Proposta**
  > Adicionar step no GitHub Actions: `npm audit --omit=dev --audit-level=high` (falha se vuln high+ em prod). Para dev, rodar `--audit-level=critical` separadamente (warn). Atualizar `jest`, `ts-jest`, `axios` (backend) para reduzir o ruído moderate. Tactic Bass: **Limit Exposure**.
- **Resultado Esperado**
  > Pipeline falha em qualquer vuln high+ em deps de prod. Métrica: 0 gate → gate ativo; moderate prod ≤ 5.
- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-9
- **Métricas de sucesso**:
  - CI step `npm audit`: ausente → presente em backend e frontend
  - High em prod: monitorado e bloqueante
- **Risco de não fazer**: CVE crítica em axios/express/jose passa um ciclo sem ninguém notar.
- **Dependências**: nenhuma

## 6. Notas do agente

- Findings P0 são 3 (RBAC ausente, `.env` com credenciais reais incl. JWT secret, request logger imprimindo password). Cada um, sozinho, permite bypass do gate financeiro.
- Cross-QA: F-security-7 (Revoke Access) e F-security-4 (Limit Exposure) reforçam mutuamente; F-security-1 (Authorize Actors) tem ligação direta com Fault-Tolerance (audit trail útil só se quem está logado for de fato quem deveria) e Availability (DoS lateral via fan-out Conexos). F-security-8 (Separate Entities) é a tactic que mais aparecerá quando o `qa-consolidator` cruzar com modifiability e availability.
- `npm audit` rodou local — high em FE é jsdom>ws (dev-only), por isso não foi promovido a P0/P1; o gate de CI cobre regressão futura.
- Não medível localmente: WAF/CloudFront, CloudTrail/GuardDuty (sem AWS hoje), TLS termination (Render gerencia, não auditável daqui), brute-force agregado (sem stack de observabilidade contratada).
