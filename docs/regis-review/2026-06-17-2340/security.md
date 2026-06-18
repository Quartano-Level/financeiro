---
qa: Security
qa_slug: security
run_id: 2026-06-17-2340
agent: qa-security
generated_at: 2026-06-18T00:00:00Z
scope: backend
score: 6.5
findings_count: 6
cards_count: 6
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Usuário autenticado interno (sem perfil/RBAC) ou ator com token Supabase válido obtido lateralmente | Dispara `POST /permutas/eleicao` repetidamente / envia payload arbitrário no body / lê `GET /permutas/painel` sem filtro | Express financeiro: middleware Supabase JWT → `routes/permutas.ts` → `EleicaoPermutasService` (fan-out Conexos `com298`/`imp019`/`imp223`/`com308` em todas as filiais) → `PermutaSnapshotRepository` (Postgres) | Produção multi-filial Columbia, READ-ONLY no ERP mas WRITE no Postgres próprio (snapshot + auditoria); cap `MAX_PAGES=50`, `PAGE_SIZE=500`, fan-out N filiais × M priCods | Sistema autentica (JWT obrigatório), aplica `heavyRouteLimiter` (10 req/min/IP), audita `triggered_by` por run, persiste com SQL parametrizado; resposta do painel revela `docCod`/`priCod`/`variacaoResultado` apenas para usuário autenticado | 0 SQL interpolado · 100% inserts parametrizados · 100% rotas mutadoras com autenticação · `triggered_by` ≠ `'unknown'` em runs reais · ≤10 disparos/min/IP · 0 leak de body/credencial em log

> Tradução de negócio: a Fatia 1 é READ-ONLY no Conexos (nenhuma `permuta`/`baixa` é executada), o que reduz drasticamente o blast-radius monetário desta entrega. O risco principal residual é (a) qualquer usuário autenticado disparar `eleicao` (custo: fan-out Conexos pesado + uma run gravada com `triggered_by` falsificável socialmente) e (b) leak de campos financeiros do painel se a auditoria de acesso/RBAC não for adicionada antes da Fatia 2 — quando a mesma rota passar a executar `permuta` real em `fin010`.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Secrets hardcoded no delta | 0 | 0 | ✅ | `grep -rEn "(password\|secret\|token\|api[_-]?key\|credential)\s*[:=]\s*['\"][^'\"]{4,}"` em `src/backend/domain/{service,repository,client}/permutas`, `routes/permutas.ts`, `migrations/` |
| Uso de `process.env` cru no delta | 0 | 0 | ✅ | `grep -rn "process.env" src/backend/domain/{service,repository,client}/permutas src/backend/routes/permutas.ts src/backend/migrations` |
| SQL interpolado (template-literal com `${}` em SELECT/INSERT) no delta | 0 | 0 | ✅ | `grep -rEn "\`[^\`]*(SELECT\|INSERT\|UPDATE\|DELETE\|CREATE)[^\`]*\\\$\{" src/backend/domain/repository src/backend/migrations` |
| Inserts/Selects do `PermutaSnapshotRepository` usando `$nome` parametrizado | 4/4 (100%) | 100% | ✅ | `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:65-122,137-156` |
| Rotas mutadoras autenticadas (`POST /permutas/eleicao`) | 1/1 (100%) | 100% | ✅ | `src/backend/index.ts:63` (`buildAuthMiddleware` antes do mount); teste `routes/permutas.test.ts:93-101` cobre 401 |
| Rotas com validação Zod de `req.body`/`req.query` | 0/2 (0%) | 2/2 (100%) | ❌ | `grep "z\.\|safeParse" src/backend/routes/permutas.ts` → 0 hits |
| Schemas Zod nos boundaries Conexos efetivamente usados | 2/3 (67%) | 3/3 (100%) | ⚠️ | `com298RowSchema` e `declaracaoRowSchema` chamam `.parse(...)` (`ConexosClient.ts:601,663`); `com308RowSchema` está definido mas `listTitulosAPagar` mapeia row direto sem parse (`ConexosClient.ts:995-1009`) |
| RBAC enforcement por perfil (analista vs. admin) | 0 (apenas authN) | ≥1 ponto de check | ❌ | `grep -rn "role\|permission" src/backend/routes/permutas.ts src/backend/domain/service/permutas` → 0 hits funcionais; `AuthUser.role` decodificado mas nunca lido (`src/backend/http/auth.ts:20,62`) |
| Audit trail por run (`triggered_by`, `flow_id`, `started_at`, `finished_at`, `status`, `error_message`) persistido | presente | presente | ✅ | `src/backend/migrations/0001_permuta_eleicao.sql:9-21` + `EleicaoPermutasService.ts:88-99,127-142` |
| Rate-limit em `POST /permutas/eleicao` | `heavyRouteLimiter` (10 req/min/IP) | ativo | ✅ | `src/backend/index.ts:74` + `http/rateLimit.ts:22-28` |
| Logger de request imprime `body` cru de TODA requisição autenticada | sim (todas as rotas) | apenas em DEBUG / com PII-redact | ❌ | `src/backend/index.ts:38-40` (`console.log(\`[REQ] ... body=${JSON.stringify(body)}\`)`) |
| Tenant ids Columbia hardcoded em service/route | 0 (apenas em test + comentário) | 0 | ✅ | `grep "1153\|columbia" src/backend/domain/service/permutas src/backend/routes/permutas.ts` → só `conexosPermutasSchemas.test.ts` e comentário em `conexosPermutasConstants.ts:2` |
| Credenciais Conexos via `EnvironmentProvider` (sem `process.env` em service) | 100% | 100% | ✅ | `src/backend/domain/appContainer.ts:19-26` resolve via `EnvironmentProvider`; SSM JSON em prod, `.env` em local (`EnvironmentProvider.ts:46-89`) |
| `npm audit` deep (CVE high/critical) | não medível | 0 críticas | ⚠️ N/A | `--quick` mode (decisão do run) |

## 3. Tactics — Cobertura no nf-projects

### Detect Attacks

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Logger global imprime `[REQ]`/`[RES]` com `requestId`; sem IDS/WAF; sem detecção de assinatura de payload | ⚠️ parcial | `src/backend/index.ts:33-49` |
| Detect Service Denial | `globalLimiter` (100 req/min/IP) + `heavyRouteLimiter` (10 req/min/IP) em `/permutas` | ✅ presente | `src/backend/http/rateLimit.ts:11-28`; `index.ts:25,74` |
| Verify Message Integrity | JWT Supabase verificado com `jwtVerify` (HS256 secret ou JWKS assimétrico) | ✅ presente | `src/backend/http/auth.ts` (verificador `jose` por `alg`) |
| Detect Message Delay | N/A — fluxo síncrono request/response; sem fila/SQS na Fatia 1 (job manual via POST) | N/A | — |

### Resist Attacks

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Identify Actors | `req.user.sub` extraído do JWT; propagado a `triggered_by` no audit row | ✅ presente | `routes/permutas.ts:30`; `migrations/0001_permuta_eleicao.sql:19` |
| Authenticate Actors | `buildAuthMiddleware` aplicado ANTES de `app.use('/permutas')` → toda rota `/permutas/*` exige Bearer JWT válido; teste cobre 401 | ✅ presente | `src/backend/index.ts:63,75-76`; `routes/permutas.test.ts:93-101` |
| Authorize Actors | **Apenas authN; sem RBAC.** `role` é decodificado em `AuthUser.role` mas nenhum service/route checa. Qualquer usuário autenticado pode disparar `POST /permutas/eleicao` (READ-ONLY hoje, mas a MESMA rota executará `permuta`/`baixa` na Fatia 2) | ❌ ausente | `src/backend/http/auth.ts:20,62`; `routes/permutas.ts:24-40` (sem guard de role) |
| Limit Access | `heavyRouteLimiter` (10 req/min/IP) na rota; sem allowlist de IP; CORS com origem por whitelist | ✅ presente | `src/backend/index.ts:74`; `http/cors.ts:26-43` |
| Limit Exposure | Painel responde apenas o último snapshot `success`; `errorMiddleware` retorna `'Internal server error'` genérico ao cliente; mas Conexos error body é logado server-side em texto cru | ⚠️ parcial | `routes/permutas.ts:46-50`; `http/errorMiddleware.ts:24-29` |
| Encrypt Data | TLS terminado upstream (não no Express); Supabase JWT secret em SSM; Conexos credenciais em SSM JSON; em local via `.env` (Rule #1 protege commit) | ✅ presente | `EnvironmentProvider.ts:71-89` |
| Separate Entities | Camadas DDD (route → service → repository → client); `PermutaSnapshotRepository` recebe `PostgreeDatabaseClient` via DI; Conexos via `LEGACY_CONEXOS_TOKEN` | ✅ presente | `PermutaSnapshotRepository.ts:48-53`; `appContainer.ts:28` |
| Change Default Settings | Default CORS é whitelist (não `*`); `globalLimiter` 100 req/min é default conservador | ✅ presente | `http/cors.ts:26-43`; `http/rateLimit.ts:11-18` |
| Validate Input | **Zod no boundary Conexos parcial** (com298 ✅, declaracao ✅, com308 ❌ definido-mas-não-usado); **Zod no boundary HTTP ausente** (`POST /permutas/eleicao` não valida `req.body`, `GET /permutas/painel` não valida `req.query`) | ⚠️ parcial | `ConexosClient.ts:601,663` (parse usado); `ConexosClient.ts:995-1009` (com308 sem parse); `routes/permutas.ts` (0 chamadas Zod) |

### React to Attacks

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Revoke Access | Não há revogação ativa; depende de Supabase invalidar a sessão. Sem denylist de `sub` no backend | ❌ ausente | grep `revoke\|denylist` em `src/backend/http` → 0 hits |
| Lock Computer | N/A — backend stateless, sem conceito de session lock | N/A | — |
| Inform Actors | Sem alarme/notificação a administradores quando `heavyRouteLimiter` dispara repetidamente ou quando `FLOW_ERROR` é registrado; só log local | ❌ ausente | `EleicaoPermutasService.ts:144-149` apenas grava log |

### Recover from Attacks

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Restore | `EleicaoPermutasService` é idempotente (recomputa do zero a cada run); `permuta_eleicao_run` persiste o histórico para replay/diagnóstico | ✅ presente | `EleicaoPermutasService.ts:36-46,125-151` |
| Audit Trail | `permuta_eleicao_run` grava `flow_id`, `started_at`, `finished_at`, `status`, `triggered_by`, `total_*`, `bloqueadas_by_motivo` (JSONB), `error_message`. Linkado a `permuta_candidata_snapshot` por `run_id` (FK ON DELETE CASCADE) | ✅ presente | `migrations/0001_permuta_eleicao.sql:9-42`; `PermutaSnapshotRepository.ts:65-95` |

## 4. Findings

### F-security-1: RBAC ausente — qualquer usuário autenticado dispara `POST /permutas/eleicao`

- **Severidade**: P1 (alto — degrada um requisito NFR §6 da proposta e fica P0 no momento que a Fatia 2 mudar a rota para READ-WRITE)
- **Tactic violada**: Authorize Actors
- **Localização**: `src/backend/routes/permutas.ts:24-40`; `src/backend/http/auth.ts:20,62`
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts — nenhum guard de role
  router.post('/eleicao', asyncHandler(async (req, res) => {
      await bootstrapAppContainer();
      const service = container.resolve(EleicaoPermutasService);
      const triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown';
      const result = await service.executar({ triggeredBy });
      ...
  });

  // http/auth.ts — role é decodificado mas nunca consumido a jusante
  return { sub: String(payload.sub), email: ..., role: typeof payload.role === 'string' ? payload.role : undefined };
  ```
  `grep -rn "req.user.role\|hasRole\|canExecute" src/backend/routes src/backend/domain` → 0 hits.
- **Impacto técnico**: na Fatia 1 (READ-ONLY) o blast-radius é fan-out Conexos pesado + 1 run de auditoria gravada por requisição autenticada. Na Fatia 2 a MESMA rota executará `permuta`/`baixa` em `fin010` (write monetário). Sem RBAC, qualquer JWT válido (inclusive de um perfil "leitor") fará a permuta acontecer.
- **Impacto de negócio**: violação direta do NFR §6 (RBAC por perfil) — a auditoria interna do banco/empresa pode reprovar a entrega, e um usuário sem responsabilidade financeira poderia disparar fan-out de produção sobre o Conexos. Após Fatia 2, vira risco monetário direto.
- **Métrica de baseline**: 0 checks de `role` no caminho `route → service`; `AuthUser.role` é lido em 1 lugar (decode) e usado em 0 lugares.

### F-security-2: rotas `permutas` não validam `req.body`/`req.query` com Zod

- **Severidade**: P2 (médio — hoje sem campo consumido, vira P1 quando query/body params forem adicionados)
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/routes/permutas.ts:24-51`
- **Evidência (objetiva)**:
  ```
  $ grep -n "z\.\|safeParse\|\.parse(" src/backend/routes/permutas.ts
  (zero hits)
  ```
  Ambas as rotas (`POST /eleicao`, `GET /painel`) chamam `service.executar(...)` / `service.exporNoPainel(req.requestId)` ignorando `req.body` e `req.query`. Não há `schema.parse(req.body)` no boundary HTTP, contrariando a convenção CLAUDE.md "validate external inputs (API events, ...) with Zod at boundaries".
- **Impacto técnico**: enquanto o body/query não é consumido o risco é cosmético, mas a rota aceita silenciosamente payloads arbitrários (até `Content-Length` limite do `express.json()` default = 100KB) — qualquer adição futura de filtro (`?filCod=`, `?priCod=`) entra direto no service sem coerção/validação, com chance de SQL/Conexos-injection se o param chegar a um filtro `priCod#IN`.
- **Impacto de negócio**: débito técnico que vira incidente na Fatia 2 quando o painel precisar de filtro por filial/usuário; também impede que a equipe encare validação como "sempre presente" — coloca uma exceção à regra invariante.
- **Métrica de baseline**: 0/2 rotas com Zod no boundary HTTP; padrão alvo do repo (`ConexosClient.listAdiantamentosProforma` chama `com298RowSchema.parse(row)`) está disponível mas não replicado nas rotas.

### F-security-3: `com308RowSchema` definido mas não usado em `listTitulosAPagar`

- **Severidade**: P2 (médio — boundary Conexos sem coerção numérica defensiva)
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasSchemas.ts:41-52`; `src/backend/domain/client/ConexosClient.ts:995-1009`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "com308RowSchema" src/backend
  src/backend/domain/client/permutas/conexosPermutasSchemas.ts:41
  src/backend/domain/client/permutas/conexosPermutasSchemas.ts:52
  src/backend/domain/client/permutas/conexosPermutasSchemas.test.ts:1,47,60
  (NENHUM uso em ConexosClient.listTitulosAPagar)
  ```
  `listTitulosAPagar` mapeia `r.titMnyValorMneg`, `r.titFltTaxaMneg`, `r.moeCodMneg` direto via `parseOptionalNumber` sem `.parse()`, enquanto seu irmão `listAdiantamentosProforma` chama `com298RowSchema.parse(row)`.
- **Impacto técnico**: `taxa`/`valorNegociado` entram no cálculo de `VariacaoCambialPermutaService`. Um Conexos com payload corrompido (string numérica malformada, NaN encoded como `"NaN"`) chega ao service sem ser barrado no boundary — `parseOptionalNumber` devolve `undefined` e o caminho passa silenciosamente como "sem variação".
- **Impacto de negócio**: variação cambial poderia exibir `undefined` em vez de erro explícito quando o Conexos retorna lixo, omitindo valor da auditoria. Em vez disso, o schema rejeitaria a row e logaria `VALIDATION_ERROR`.
- **Métrica de baseline**: 2 de 3 schemas plugados (com298 ✅, declaracao ✅, com308 ❌); fonte: `grep -n "Schema.parse" src/backend/domain/client/ConexosClient.ts` → 2 hits para com298/declaracao, 0 para com308.

### F-security-4: logger global imprime `body` cru de toda requisição autenticada

- **Severidade**: P1 (alto — vaza payload sensível para CloudWatch/log local sem PII-redact)
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/index.ts:36-40`
- **Evidência (objetiva)**:
  ```ts
  app.use((req, res, next) => {
      const start = Date.now();
      const { method, url, query, body, requestId } = req;
      console.log(`[REQ] ${requestId} ${method} ${url}${...}`);
      if (body && Object.keys(body).length)
          console.log(`[REQ] ${requestId} body=${JSON.stringify(body)}`);
      ...
  });
  ```
  Aplicado ANTES das rotas, sem allowlist/denylist de campos. Não há PII-redact nem nível DEBUG-guarded.
- **Impacto técnico**: para a Fatia 1 o impacto é baixo (rotas `permutas` não recebem body útil), mas o middleware é GLOBAL — atinge todas as rotas existentes (`/conexos/*`) e todas as futuras (`POST /permutas/finalizar`, futura `POST /sispag/lote`). Body de `POST /sispag/lote` carrega CNPJs, valores e dados bancários; vão para o log em texto cru e ficam retidos pela retention do CloudWatch/sistema operacional.
- **Impacto de negócio**: violação direta da política de tratamento de PII/dados financeiros e da LGPD para CNPJs/valores; em incidente, auditor consegue listar exatamente quais valores cada usuário tentou movimentar a partir do log — e o mesmo é potencialmente acessível a qualquer engenheiro com acesso à console AWS.
- **Métrica de baseline**: 1/1 logger global imprime body sem PII-redact; 0 campos com mask.

### F-security-5: `errorMiddleware` loga `Conexos body` cru no servidor

- **Severidade**: P2 (médio — server-side only; cliente já recebe payload genérico)
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/http/errorMiddleware.ts:27-29`
- **Evidência (objetiva)**:
  ```ts
  if (conexosBody !== undefined) {
      console.error('[error] Conexos body:', JSON.stringify(conexosBody));
  }
  ```
  O cliente recebe apenas `{ error: 'Internal server error' }`, então não há leak HTTP. O log do servidor, porém, materializa a resposta inteira do Conexos (que em vários endpoints inclui `responseData` com identidades de documentos e exportador).
- **Impacto técnico**: depois da Fatia 2 a remessa Nexxera (com dados bancários reais) pode entrar nesse caminho. Sem mask por campo, vaza para o log.
- **Impacto de negócio**: mesmo cenário do F-security-4 — exposição em log de auditoria à equipe de engenharia.
- **Métrica de baseline**: 1 caminho de log de body Conexos não-redact em `errorMiddleware`.

### F-security-6: ausência de alertamento ativo em `FLOW_ERROR` / rate-limit hit

- **Severidade**: P3 (baixo — observabilidade reativa hoje, mas o run é auditado)
- **Tactic violada**: Inform Actors
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:144-149`; `src/backend/http/rateLimit.ts:11-28`
- **Evidência (objetiva)**: `EleicaoPermutasService` grava `FLOW_ERROR` via `logService.error(...)` e `permuta_eleicao_run` com `status='error'`. Nenhum dispatch para canal humano (e-mail/Slack/SNS). `rateLimit` responde 429 ao cliente mas não emite contador agregado nem alerta de spike.
- **Impacto técnico**: tentativa de bruteforce do `POST /permutas/eleicao` (saturando `heavyRouteLimiter`) não chega à atenção humana até alguém abrir o log.
- **Impacto de negócio**: Mean-Time-to-Detect (MTTD) de abuso fica indefinido; depende de revisão manual.
- **Métrica de baseline**: 0 canais de alerta ativos; 1 stream de log passivo (CloudWatch/stdout).

## 5. Cards Kanban

### [security-1] Introduzir RBAC por perfil em `routes/permutas.ts` antes da Fatia 2

- **Problema**
  > Hoje qualquer usuário com JWT Supabase válido dispara `POST /permutas/eleicao` (fan-out Conexos pesado + 1 row de auditoria). A MESMA rota será reusada na Fatia 2 para executar `permuta`/`baixa` em `fin010` (write monetário). `AuthUser.role` é decodificado em `http/auth.ts:62` mas nunca consultado em route/service, contrariando NFR §6 da proposta.

- **Melhoria Proposta**
  > Adicionar um middleware/guard `requireRole('financeiro:analista' | 'financeiro:admin')` que lê `req.user.role` e devolve 403 quando ausente/insuficiente. Aplicar em `POST /permutas/eleicao` (e como gate explícito também em `GET /permutas/painel` para sustentar privilege separation). Mapear a role no Supabase (claim ou JOIN no `auth.users`). Tactic Bass: **Authorize Actors**. Arquivos: `src/backend/http/auth.ts` (helper), `src/backend/routes/permutas.ts` (apply).

- **Resultado Esperado**
  > 100% das rotas mutadoras de `/permutas/*` exigem uma role explícita; um JWT válido sem role devida → 403. Antes da Fatia 2 ligar write em `fin010`, o caminho monetário está atrás de RBAC.

- **Tactic alvo**: Authorize Actors
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Rotas mutadoras com `requireRole`: 0/1 → 1/1
  - JWT sem role devida → 403 (hoje 200)
- **Risco de não fazer**: na Fatia 2 a rota vira write monetário; qualquer usuário interno com JWT executa permuta. Auditoria do banco e auditor interno reprovam a entrega; possível incidente financeiro.
- **Dependências**: definição da taxonomia de roles com Yuri/Columbia (`analista`, `aprovador`, `admin`) — deve sair antes da Fatia 2.

### [security-2] Plugar Zod no boundary HTTP das rotas `permutas`

- **Problema**
  > `POST /permutas/eleicao` e `GET /permutas/painel` não chamam `schema.parse(req.body/req.query)` — `grep "z\." src/backend/routes/permutas.ts` retorna 0. A rota aceita silenciosamente payload arbitrário e ignora; é uma exceção à convenção CLAUDE.md "validate external inputs with Zod at boundaries" e abre brecha quando query params forem introduzidos (`?filCod=`).

- **Melhoria Proposta**
  > Criar `eleicaoRequestSchema = z.object({}).strict()` (body vazio é o contrato hoje) e `painelQuerySchema = z.object({ filCod?: z.coerce.number().int().positive() }).strict()`. Aplicar `.parse(req.body)` / `.parse(req.query)` antes do `service.executar(...)`. Tactic Bass: **Validate Input**.

- **Resultado Esperado**
  > Boundary HTTP rejeita payload com chave inesperada (`.strict()`) e devolve 400 com erro tipado; quando filtros forem adicionados na Fatia 2, a validação já estará no caminho.

- **Tactic alvo**: Validate Input
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - Rotas com Zod no boundary HTTP: 0/2 → 2/2
  - Payload arbitrário em `POST /permutas/eleicao` → 400 (hoje 200)
- **Risco de não fazer**: na Fatia 2, a primeira query param (ex.: `?filCod=` ou `?priCod=`) entra direto no fan-out Conexos sem coerção/validação, replicando o vetor que `com298RowSchema` evita.
- **Dependências**: nenhuma.

### [security-3] Aplicar `com308RowSchema.parse(row)` em `ConexosClient.listTitulosAPagar`

- **Problema**
  > `com308RowSchema` está definido em `conexosPermutasSchemas.ts:41-52` (e testado em `conexosPermutasSchemas.test.ts:45-65`), mas `ConexosClient.listTitulosAPagar` em `ConexosClient.ts:995-1009` mapeia row direto via `parseOptionalNumber` — sem barrar `taxa`/`valorNegociado` no boundary. Inconsistência com `listAdiantamentosProforma` (que parsea com `com298RowSchema`) e `listDeclaracaoByProcesso` (parsea com `declaracaoRowSchema`).

- **Melhoria Proposta**
  > Adicionar `const validated = com308RowSchema.parse(r);` no `rows.map<TituloAPagar>` e mapear a partir do `validated`. Tactic Bass: **Validate Input**.

- **Resultado Esperado**
  > Boundary Conexos uniforme: 3/3 schemas plugados; row com `titCod` ausente ou `titFltTaxaMneg` lixo é rejeitada no client e logada como `VALIDATION_ERROR` em vez de se propagar como `undefined` ao `VariacaoCambialPermutaService`.

- **Tactic alvo**: Validate Input
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Schemas Zod nos boundaries Conexos efetivamente usados: 2/3 → 3/3
  - Linhas Conexos malformadas barradas no client: hoje 0 → todas
- **Risco de não fazer**: variação cambial fica `undefined` em vez de erro explícito quando o Conexos devolve payload corrompido — esconde regressão em produção.
- **Dependências**: nenhuma.

### [security-4] PII-redact no logger global de request (`index.ts`)

- **Problema**
  > `src/backend/index.ts:38-40` imprime `body=${JSON.stringify(body)}` para TODAS as requisições autenticadas, sem allowlist/denylist de campos. Aplicado antes das rotas — atinge `/conexos/*`, `/permutas/*`, e qualquer rota futura. A Fatia 1 não envia body útil, mas a Fatia 2 (e a frente SISPAG) vai postar lote de pagamento com CNPJs/valores/dados bancários, que ficarão em log retido (CloudWatch/stdout).

- **Melhoria Proposta**
  > Substituir o `JSON.stringify(body)` cru por um redactor (`redactPii(body, ['cnpj','password','token','valor','contaCorrente','agencia'])`) e/ou guard por `LOG_LEVEL=debug`. Tactic Bass: **Limit Exposure**. Arquivo: `src/backend/index.ts:33-49`.

- **Resultado Esperado**
  > Log de produção imprime `[REQ] <reqId> POST /sispag/lote body=<redacted 412 bytes>` em vez de payload cru; campos sensíveis substituídos por `***`. Hash/sha do body opcional para troubleshoot sem expor conteúdo.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - Campos sensíveis em log: hoje 100% expostos → 0% expostos
  - PII-redact aplicado em 1/1 logger global
- **Risco de não fazer**: violação contínua de tratamento de PII/dados financeiros; LGPD para CNPJs de fornecedor; em incidente, qualquer engenheiro com acesso ao log lista valores movimentados por usuário.
- **Dependências**: nenhuma; o redactor é trivial e pode ser adicionado nesta fatia.

### [security-5] Reduzir log de `Conexos body` no `errorMiddleware` para mensagem sumária

- **Problema**
  > `src/backend/http/errorMiddleware.ts:27-29` faz `console.error('[error] Conexos body:', JSON.stringify(conexosBody))` em todo erro com `response.data`. O cliente já recebe payload genérico, mas o servidor persiste a resposta inteira do Conexos no log — que costuma incluir `responseData` com identidades de documento (`docCod`, `priCod`, `dpeNomPessoa`).

- **Melhoria Proposta**
  > Trocar o `JSON.stringify(conexosBody)` integral por um resumo (`status`, `type`, `message`, hash do body) e gravar o body completo só se `LOG_LEVEL=debug`. Tactic Bass: **Limit Exposure**. Pode reusar o redactor do card `security-4`.

- **Resultado Esperado**
  > Erro de produção loga `[error] Conexos HTTP 400 type=VALIDATION docCod=*** (body redacted)` em vez de payload cru; debug ainda acessível via `LOG_LEVEL=debug`.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - Bytes médios de log por erro Conexos: medir antes/depois (alvo: redução ≥80%)
  - Caminhos de log com body cru: 1 → 0
- **Risco de não fazer**: log retém dados de auditoria potencialmente sensíveis (especialmente quando a Fatia 2 acrescentar remessa Nexxera ao caminho).
- **Dependências**: card `security-4` para reusar o helper de redact.

### [security-6] Alertar `FLOW_ERROR` e spikes de `heavyRouteLimiter` para canal humano

- **Problema**
  > `EleicaoPermutasService` grava `FLOW_ERROR` em `logService.error` e o `rateLimit` responde 429 ao cliente, mas nada dispara alerta para Slack/SNS/email. Tempo médio para detectar abuso ou cadeia Conexos quebrada depende de revisão manual de log.

- **Melhoni Proposta**
  > Plugar uma rota de alerta (CloudWatch Alarm sobre métrica de `FLOW_ERROR` count, ou um `SnsClient` invocado pelo `LogService` em `ERROR`; e contador de 429 do `rateLimit` com alarme em `≥3 / min`). Tactic Bass: **Inform Actors**.

- **Resultado Esperado**
  > MTTD de `FLOW_ERROR` ≤ 5 min; spike de 429 (heavyRouteLimiter) ≥ 3/min em produção dispara notificação humana.

- **Tactic alvo**: Inform Actors
- **Severidade**: P3
- **Esforço estimado**: M
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - Canais de alerta ativos: 0 → ≥1
  - MTTD `FLOW_ERROR`: indefinido → ≤5 min
- **Risco de não fazer**: incidente de Conexos / bruteforce no `/permutas/eleicao` passa despercebido até alguém abrir o painel; sem trilha proativa.
- **Dependências**: discussão sobre canal preferido (SNS+SES vs. Slack webhook) e quem é on-call.

## 6. Notas do agente

- Escopo confinado ao delta de `feat/permutas-painel-elegiveis` no worktree `/private/tmp/permutas-painel-wt`. Não revisei `src/frontend`, `infra/`, nem código fora do delta — `services/conexos.ts` legacy permanece como migration-debt (CLAUDE.md).
- `--quick` desabilita `npm audit` deep e `terraform plan`; ambos marcados explicitamente como não-medíveis em §2.
- Cross-QA detectado para o consolidator: (a) F-security-1 (RBAC) ecoa em Modifiability/Integrability (NFR §6 — auth corporativa SSO); (b) F-security-2 e F-security-3 (Zod) sobrepõem Fault Tolerance/Integrability; (c) Audit Trail (tactic Recover) atende também Fault Tolerance — o card lá deve referenciar `permuta_eleicao_run`/`triggered_by` como já presentes; (d) F-security-4/5 (log PII) cruzam Observabilidade.
- Pontos positivos do delta para registrar: 100% de SQL parametrizado, 0 secrets/hardcode tenant em service, audit trail (`triggered_by`+`flow_id`+`status`+`error_message`) completo e atômico, fan-out Conexos com cap (`MAX_PAGES`, `PAGE_SIZE`) emitindo `BUSINESS_WARN`, e `EnvironmentProvider` 100% adotado para credenciais Conexos/Postgres.
