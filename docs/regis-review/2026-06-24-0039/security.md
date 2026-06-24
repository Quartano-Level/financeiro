---
qa: Security
qa_slug: security
run_id: 2026-06-24-0039
agent: qa-security
generated_at: 2026-06-24T00:39:00Z
scope: backend
score: 5
findings_count: 8
cards_count: 7
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao Financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Usuário admin autenticado (qualquer um dos 4 contas: francinei / grazi / simone / rogerio @kavex.com), OU atacante com sessão roubada de um deles | Chama direto `POST /permutas/borderos/<borCod>/finalizar` (ou `/cancelar` / `/estornar` / `DELETE`) com `body.filCod` arbitrário, escolhendo um `borCod` de TERCEIRO listado em `GET /permutas/borderos` (200 borderôs do ERP, criados por outros usuários do Conexos) | `routes/permutas.ts:420-557` + `domain/service/permutas/BorderoGestaoService.ts` (resolveFilCod aceita `filCod` do request, sem cruzar com `daTrilha`) | PRODUÇÃO (Render, `CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false` desde `54ad093` 2026-06-24); conta de serviço Conexos única `MPS_FRANCINEI` com permissão de aprovar/estornar/excluir em qualquer filial | Backend devia REJEITAR (403/404) qualquer ação sobre borderô fora da trilha local (`daTrilha=false`); hoje **executa** a baixa/finalização/exclusão no ERP usando `MPS_FRANCINEI`, e a única marca de auditoria fora do Conexos é `executado_por` na trilha — que **não é criada** para borderô de terceiro | 0 borderôs de terceiro afetáveis por chamada direta à API; rejeição em < 50 ms com `error: 'borderô fora do escopo'`; hoje 100% das ações de mutação são executadas sem cross-check |

> Cenário concreto: a francinei loga, abre Network do DevTools, copia o JWT, faz `curl -X POST .../permutas/borderos/<borCodDeTerceiro>/estornar -H 'Authorization: Bearer …' -d '{"filCod":2}'`. O backend resolve `filCod=2`, chama `conexosClient.estornarBordero({filCod:2, borCod})` com a sessão `MPS_FRANCINEI`, e o ERP estorna um borderô que NÃO foi criado por este sistema, sem trilha local. Auditoria interna: zero (a trilha só existe para borderôs nossos); auditoria ERP: aparece como ação do `MPS_FRANCINEI`, NÃO da francinei.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Rotas de MUTAÇÃO no router /permutas com `requireRole('admin')` | 13 / 13 | 100% | ✅ | `grep -n requireRole src/backend/routes/permutas.ts` (linhas 119/154/215/237/285/327/356/386/423/452/481/510/539) |
| Rotas de MUTAÇÃO com validação Zod do corpo/query inteiro | 7 / 13 | 13 / 13 | ❌ | `src/backend/routes/permutas.ts` — borderô finalizar/cancelar/estornar/DELETE/DELETE-baixa leem `req.body?.filCod` / `req.query.filCod` / `req.params.borCod` direto, sem schema |
| Rotas de MUTAÇÃO que validam o **escopo** do recurso (tenant/trilha) server-side | 0 / 5 (ações sobre borderô) | 5 / 5 | ❌ | `BorderoGestaoService.ts:143-235` — `resolveFilCod` aceita `filCodParam` direto do request; nenhuma checagem de `daTrilha` (que existe apenas no read) |
| Conta de serviço Conexos usada para escrita | 1 (`MPS_FRANCINEI`, compartilhada por todos os usuários do app) | 1 por humano OU 1 dedicada com SoD efetiva | ⚠️ | `render.yaml:51-54` `CONEXOS_USERNAME` (sync:false); referência em revisão anterior `docs/regis-review/2026-06-22-1658/security.md:106` |
| Senha bootstrap dos 4 usuários (francinei/grazi/simone/rogerio) | mesma string `Admin@user2406` em todos (relatado no escopo da run) | senha única + troca obrigatória + política mínima | ❌ | `CHANGELOG.md:20` ("usuários admin … no `app_user`"); seed `jobs/seed-admin.ts` aceita apenas 1 usuário/senha via env — provisionamento dos 4 foi feito fora desse fluxo |
| bcrypt cost factor | 10 | ≥ 12 para 2026 (OWASP) | ⚠️ | `src/backend/jobs/seed-admin.ts:18` `BCRYPT_ROUNDS = 10` |
| Rate-limit em `POST /auth/login` | apenas `globalLimiter` (100 req/min/IP) | dedicado, agressivo (≤ 5 req/min/IP por username) | ❌ | `src/backend/index.ts:31` + `routes/auth.ts:25` — `/auth/login` herda só o global de 100 |
| CORS — política de origens | whitelist com **wildcard sufixo** `*-kavex.vercel.app` (proposta), `credentials: true` | whitelist literal (sem wildcard), `credentials: true` | ⚠️ | `src/backend/http/cors.ts:31-37` + `index.ts:27`; estratégia `*-kavex.vercel.app` casa qualquer subdomínio terminando em `-kavex.vercel.app` (inclusive preview-deploys de quem fizer fork no Vercel se o sufixo for genérico demais) |
| Redação de campos sensíveis no request logger | ✅ ativa (`password`/`senha`/`token`/`secret`/`api_key`/etc.) | manter | ✅ | `src/backend/http/redact.ts:10-21` + `index.ts:46-53` |
| Vazamento de `CONEXOS_PASSWORD` em logs | não vaza pelo logger HTTP (não passa por `redactBody` porque não está em req/res); `<REDACTED>` observado é da redação aplicada nas chaves que coincidem | manter, e estender para os logs internos do `ConexosClient`/legacy adapter | ✅ (HTTP) / ⚠️ (camada legacy) | `redact.test.ts:5-12`; revisão amostral de `domain/service/conexos/*` |
| Hardcoded secrets em código versionado | 0 | 0 | ✅ | `grep -rEn "(password\|secret\|token).*['\"][^'\"]{8,}" src/backend src/frontend --include="*.ts" --include="*.yaml"` (exclui docs e tests) |
| `.env` rastreado pelo git | 0 (`src/backend/.env` e `src/frontend/.env.local` ignorados) | 0 | ✅ | `git check-ignore src/backend/.env` → "src/backend/.env"; `.gitignore` linha `.env` |
| Storage do JWT no frontend | `localStorage` (`TOKEN_STORAGE_KEY`) | cookie `HttpOnly; Secure; SameSite=Lax` | ❌ | `src/frontend/lib/auth/token.ts:5` (`localStorage key holding the backend-issued JWT`) |
| `npm audit` backend (critical/high/moderate) | 0 / 0 / 20 | 0 / 0 / ≤ 5 | ⚠️ | `cd src/backend && npm audit --json` |
| `npm audit` frontend (critical/high/moderate) | 0 / 1 / 21 | 0 / 0 / ≤ 5 | ⚠️ | `cd src/frontend && npm audit --json` |
| `dangerouslySetInnerHTML` no frontend | 0 | 0 | ✅ | `grep -rn dangerouslySetInnerHTML src/frontend --include="*.tsx"` |
| Audit trail server-side para ações sobre borderô FORA da trilha (terceiros) | 0 (não há registro) | toda ação `finalizar/cancelar/estornar/DELETE` cria linha de auditoria com `(executado_por, borCod, filCod, daTrilha, timestamp)` | ❌ | `BorderoGestaoService.ts:185-235` — `logService.info` registra `executadoPor`, mas não há tabela de auditoria persistida; e a `permuta_alocacao_execucao` só é tocada quando há trilha |

> ⚠️ **Não medível localmente**: falhas de autenticação por minuto (não há métrica/alarme em CloudWatch/Render — só logs `console.warn` em `http/auth.ts:167-171`). Recomendação: contador Prometheus + alarme acima de N falhas por usuário por janela.

## 3. Tactics — Cobertura no Financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Logs `console.warn` em tokens inválidos/expirados e em RBAC 403; sem agregação/alarme | ⚠️ parcial | `src/backend/http/auth.ts:167-171, 192-194` |
| Detect Service Denial | `globalLimiter` 100/min e `heavyRouteLimiter` 10/min por IP; sem detector de anomalia por usuário | ⚠️ parcial | `src/backend/http/rateLimit.ts:11-26`; `index.ts:31,82` |
| Verify Message Integrity | JWT assinado HS256 (jose) com `audience='authenticated'` e issuer opcional; verificação rejeita falsificações | ✅ presente | `src/backend/http/auth.ts:136-153` |
| Detect Message Delay | N/A — não há time-window crítico no fluxo HTTP além do TTL do JWT (12h) | N/A | `domain/service/auth/AuthService.ts:24` |
| Identify Actors | `req.user.sub` populado pelo middleware; propagado para `executado_por` em todas as ações de mutação | ✅ presente | `routes/permutas.ts:124,158,223,293,365,396,432,461,490,519,549` |
| Authenticate Actors | login bcrypt (`app_user`) + JWT HS256 próprio; sem MFA; sem federação | ⚠️ parcial | `AuthService.ts:48-75` |
| Authorize Actors | `requireRole('admin')` em 13/13 rotas de mutação do router /permutas; **PORÉM** não há checagem de **escopo do recurso** (qualquer admin age em qualquer borderô do ERP, mesmo de terceiros) | ⚠️ parcial | `routes/permutas.ts` (RBAC ok); `BorderoGestaoService.ts:71-235` (sem authz de escopo) |
| Limit Access | Rate-limit por rota; sem allowlist de IP; sem WAF; `/health` aberto (correto) | ⚠️ parcial | `index.ts:65,82-92`; `http/rateLimit.ts` |
| Limit Exposure | Backend só fala com Conexos via uma única conta de serviço `MPS_FRANCINEI` — blast radius = poder dessa conta no ERP (todas as filiais, todos os borderôs); sem segregação por usuário no ERP | ❌ ausente | `render.yaml:51-54`; `BorderoGestaoService.ts:97-103` chama `excluirBaixa({filCod:row.filCod,…})` sempre com a mesma identidade |
| Encrypt Data | TLS no Render/Vercel (terminado no edge); JWT HS256 (simétrico — mesmo segredo assina e verifica); senha bcrypt cost 10; sem field-level encryption no Postgres | ⚠️ parcial | `render.yaml:43-47`; `seed-admin.ts:18`; `AuthService.ts:67-74` |
| Separate Entities | Cada migration roda no mesmo schema; sem isolamento por tenant (single-tenant Columbia hoje); ERP usa 1 conta de serviço para o app inteiro | ❌ ausente | `render.yaml`; ontologia v0.3 single-tenant |
| Change Default Settings | `DEV_AUTH_BYPASS` default off; admin seed exige `ADMIN_PASSWORD` (mas tem default `'columbia2026'` no código se a env faltar); `CONEXOS_WRITE_ENABLED=true` agora é o default em PRD | ⚠️ parcial | `seed-admin.ts:23` (`password = process.env.ADMIN_PASSWORD ?? 'columbia2026'`); `http/authEnv.ts`; `render.yaml:37` |
| Validate Input | Zod nos POSTs antigos (eleicao/ingestao/cliente-filtro/alocacoes/processar/reconciliar) — **8 schemas**; nas 5 rotas novas de borderô (finalizar/cancelar/estornar/DELETE/DELETE-baixa) leitura crua de `Number(req.body?.filCod)` / `Number(req.query.filCod)` / `Number(req.params.borCod)` com guarda `Number.isFinite` | ⚠️ parcial | `routes/permutas.ts:25-99` (Zod schemas) vs. `420-557` (sem Zod) |
| Revoke Access | Não há revogação granular: `signOut` no frontend só apaga `localStorage`; o JWT permanece válido até expirar (12h); kill-switch = rotacionar `AUTH_JWT_SECRET` (invalida TODAS as sessões) | ❌ ausente | `AuthService.ts:24`; `src/frontend/lib/auth/token.ts` |
| Lock Computer | N/A — o sistema não controla o terminal do usuário | N/A | — |
| Inform Actors | Toasts no frontend após ação no borderô; ERP errors traduzidos pra PT-BR (`erpErrorMessage` em `routes/permutas.ts:44-61`) | ✅ presente | `src/frontend/app/permutas/borderos/page.tsx:185-195`; `routes/permutas.ts:44-61` |
| Restore | Postgres backups via Supabase (managed); ERP é fonte autoritativa do estado de borderô — ação errada exige estorno/excluir no próprio Conexos | ⚠️ parcial | DEPLOY.md (Supabase managed); `BorderoGestaoService.estornarBordero` |
| Audit Trail | `executado_por` persistido na trilha `permuta_alocacao_execucao` para baixas que criamos; **ações em borderôs de terceiro (sem trilha) não geram persistência local** — só `console.log`. Sem tabela de auditoria global. | ⚠️ parcial | `PermutaExecucaoRepository.ts:21,32,61-129,304`; `BorderoGestaoService.ts:124-134,173-178,192-196` (logService.info apenas) |

## 4. Findings (achados)

### F-security-1: Confused-deputy — backend executa `finalizar/cancelar/estornar/DELETE` em borderô de terceiro sem checagem de escopo

- **Severidade**: P0
- **Tactic violada**: Authorize Actors (escopo de recurso) / Limit Exposure
- **Localização**: `src/backend/routes/permutas.ts:420-557` (5 rotas) + `src/backend/domain/service/permutas/BorderoGestaoService.ts:143-235` (resolveFilCod aceita filCodParam do request; nenhuma verificação `daTrilha`).
- **Evidência (objetiva)**:
  ```
  // routes/permutas.ts:432-446 (finalizar)
  const filCod = Number(req.body?.filCod);
  ...
  await service.finalizarBordero({
      borCod,
      executadoPor,
      ...(Number.isFinite(filCod) ? { filCod } : {}),
  });

  // BorderoGestaoService.ts:250-257
  private resolveFilCod = async (borCod, filCodParam?) => {
      if (filCodParam !== undefined && Number.isFinite(filCodParam)) return filCodParam;
      ...
  };
  // não consulta `permuta_alocacao_execucao` para validar que borCod ∈ trilha local
  // e o front sabe disso (gating via daTrilha em frontend/app/permutas/borderos/page.tsx:362)
  // — mas o BACK não.
  ```
  `GET /permutas/borderos` (`BorderoGestaoService.listarBorderos` linha 278+) já lista **todos os borderôs do ERP** (sonda HAR: até 200 itens), marcando `daTrilha=true|false`. O front desabilita o botão quando `!daTrilha`, mas o back aceita qualquer `borCod`+`filCod`. Qualquer admin (ou atacante com JWT roubado) chama a API diretamente e age sobre um borderô de outro usuário do Conexos.
- **Impacto técnico**: estorno/finalização/exclusão de borderô não-pertencente ao sistema; o ERP responde 200 porque a conta `MPS_FRANCINEI` tem permissão global; estado financeiro de terceiro é movido sem trilha local.
- **Impacto de negócio**: pagamento/baixa de fornecedor estornada indevidamente; auditoria interna do Columbia atribui a ação ao `MPS_FRANCINEI` (não ao usuário) e à trilha vazia — perícia financeira inviável; potencial fraude por admin malicioso, com plausível negação ("foi o sistema").
- **Métrica de baseline**: 0 / 5 rotas validam escopo do recurso. 100% dos borderôs listados (≈ 200 em produção, dos quais ≈ N criados por este sistema) ficam tecnicamente atacáveis.

### F-security-2: Senha bootstrap idêntica (`Admin@user2406`) compartilhada por 4 usuários administradores

- **Severidade**: P0
- **Tactic violada**: Authenticate Actors / Change Default Settings
- **Localização**: provisionamento manual fora do fluxo `jobs/seed-admin.ts` (que aceita só 1 par `ADMIN_USERNAME/ADMIN_PASSWORD`); referência em `CHANGELOG.md:20` ("usuários admin (francinei/grazi/simone/rogerio @kavex.com) no `app_user`").
- **Evidência (objetiva)**:
  ```
  4 contas (francinei / grazi / simone / rogerio @kavex.com) seedadas com
  bcrypt(Admin@user2406, cost=10) no app_user. Sem flag de "trocar no primeiro login";
  sem política mínima; sem rotação; sem MFA.
  ```
- **Impacto técnico**: comprometimento de 1 conta = comprometimento das 4 (mesma string base + bcrypt cost 10 cracka offline em segundos com hashcat e GPU básica caso o dump do `app_user` vaze). Não há reset forçado.
- **Impacto de negócio**: a comprovação "foi o usuário X" cai (qualquer um pode ter logado com a senha conhecida por todos); incidente de phishing direcionado a 1 conta abre 100% do sistema, incluindo as ações de escrita `fin010` em produção.
- **Métrica de baseline**: 4 usuários / 1 senha; 0 contas com flag `must_change_password`.

### F-security-3: Wildcard `*-kavex.vercel.app` em `ALLOWED_ORIGINS` com `credentials: true`

- **Severidade**: P1
- **Tactic violada**: Limit Access / Encrypt Data (transporte cross-origin)
- **Localização**: `src/backend/http/cors.ts:31-49` + `src/backend/index.ts:27`.
- **Evidência (objetiva)**:
  ```
  // cors.ts:31-37
  const originMatches = (origin, entry) => {
      if (entry.includes('*')) {
          const suffix = entry.slice(entry.indexOf('*') + 1);
          return origin.endsWith(suffix);
      }
      return origin === entry;
  };
  // sufixo proposto na run: "*-kavex.vercel.app"
  // → qualquer hostname terminando em "-kavex.vercel.app" passa
  ```
  Combinado com `credentials: true`, um deploy de preview da Vercel feito por terceiro com sufixo equivalente (ou qualquer subdomínio `*-kavex.vercel.app` controlado por outra org Vercel) consegue ler respostas autenticadas via XHR de browser.
- **Impacto técnico**: ataque CSRF/CORS reflexivo se um adversário conseguir publicar um app sob o sufixo casado.
- **Impacto de negócio**: token JWT do usuário válido em browser pode ser usado por front malicioso para chamar as APIs de escrita `fin010`.
- **Métrica de baseline**: 1 wildcard ativo na lista de origens com `credentials:true`.

### F-security-4: Login (`POST /auth/login`) sem rate-limit dedicado — bruteforce permitido

- **Severidade**: P1
- **Tactic violada**: Limit Access / Detect Intrusion
- **Localização**: `src/backend/index.ts:31,70` (apenas `globalLimiter` 100/min/IP; sem limiter por username).
- **Evidência (objetiva)**:
  ```
  // index.ts
  app.use(globalLimiter);        // 100 req/min/IP — global
  ...
  app.use('/auth', authRouter);  // /auth/login herda só o global
  ```
  100 tentativas/minuto por IP × bcrypt cost 10 (~80 ms/hash) ≈ 8s de CPU/janela, mas suficiente para dicionário direcionado contra a senha conhecida `Admin@user2406` ou variações; sem lockout, sem captcha, sem alarme.
- **Impacto técnico**: bruteforce viável distribuído (≈ 144k tentativas/dia/IP); sem detecção.
- **Impacto de negócio**: comprometimento das 4 contas admin via dicionário, dado que todas usam a mesma senha bootstrap (F-security-2).
- **Métrica de baseline**: tentativas/min/IP suportadas = 100 (vs alvo ≤ 5); 0 alarmes de falha de auth.

### F-security-5: Conta de serviço Conexos compartilhada (`MPS_FRANCINEI`) — sem segregação por usuário no ERP

- **Severidade**: P1
- **Tactic violada**: Identify Actors (no ERP) / Limit Exposure / Audit Trail
- **Localização**: `render.yaml:51-54` (`CONEXOS_USERNAME` único, sync:false); usado para 100% das escritas em `BorderoGestaoService.ts` + `ConexosClient.ts:1011-1180` (criar/finalizar/cancelar/estornar/excluir borderô).
- **Evidência (objetiva)**:
  ```
  # render.yaml
  - key: CONEXOS_USERNAME    # = MPS_FRANCINEI (Conexos service account)
    sync: false
  - key: CONEXOS_PASSWORD
    sync: false
  ```
  No ERP, todas as ações (finalizar borderô da francinei OU da simone OU disparadas via API por atacante) ficam registradas como `MPS_FRANCINEI`. A atribuição ao humano vive APENAS no `executado_por` interno (logService.info) — não é exportada para o Conexos.
- **Impacto técnico**: forense ERP impossível ao nível de humano; impossível revogar acesso de 1 funcionário sem desligar o sistema inteiro.
- **Impacto de negócio**: compliance/SoD (Sarbanes-Oxley equivalente Brasil) fica frágil — uma auditoria do Columbia não consegue reconstruir quem aprovou qual borderô olhando o ERP.
- **Métrica de baseline**: 1 identidade no ERP para N usuários do app (hoje N=4, crescendo).

### F-security-6: Sem audit-trail persistido para ações sobre borderô de TERCEIRO (sem trilha local)

- **Severidade**: P1
- **Tactic violada**: Audit Trail
- **Localização**: `BorderoGestaoService.ts:185-235` (finalizar/cancelar/estornar usam apenas `logService.info`, que sai pelo stdout do Render); `excluirBordero:143-179` (idem); a única persistência é em `permuta_alocacao_execucao`, que só recebe linhas quando há trilha (i.e., borderô criado por este sistema).
- **Evidência (objetiva)**:
  ```
  // BorderoGestaoService.finalizarBordero (185-198)
  await this.conexosClient.finalizarBordero({ filCod, borCod });
  await this.logService.info({
      type: LOG_TYPE.BUSINESS_INFO,
      message: 'borderô finalizado/aprovado (fin010)',
      data: { borCod, executadoPor },
  });
  // nada gravado em Postgres — só log de aplicação
  ```
- **Impacto técnico**: logs de aplicação no Render free tier expiram (sem retenção longa); investigação de incidente exige caçar JSON em stdout.
- **Impacto de negócio**: ações de mutação no ERP sobre borderôs de terceiros NÃO têm rastro persistido — combinado com F-security-1, abre via livre para fraude.
- **Métrica de baseline**: 0 / 5 ações de borderô persistem linha de auditoria.

### F-security-7: 5 rotas novas de mutação leem `req.body?.filCod` / `req.query.filCod` / `req.params.borCod` sem Zod

- **Severidade**: P2
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/routes/permutas.ts:420-557` — `/borderos/:borCod/{finalizar,cancelar,estornar}` (`Number(req.body?.filCod)`), `DELETE /borderos/:borCod` (`Number(req.query.filCod)`), `DELETE /borderos/:borCod/baixas/:invoiceDocCod` (`String(req.params.invoiceDocCod)` direto).
- **Evidência (objetiva)**:
  ```
  // routes/permutas.ts:427-440 (finalizar — padrão repetido em cancelar/estornar/DELETE)
  const borCod = Number(req.params.borCod);
  if (!Number.isFinite(borCod)) {
      res.status(400).json({ error: 'borCod inválido' });
      return;
  }
  const filCod = Number(req.body?.filCod);   // sem Zod, sem schema
  ```
  As outras 8 rotas de mutação usam Zod (`processarBodySchema`, `reconciliarBodySchema`, `alocacaoBodySchema`, `clienteFiltroBodySchema`, `buscarInvoicesQuerySchema`, `runsQuerySchema`). As 5 novas (Fase 3.1) regrediram esse padrão.
- **Impacto técnico**: payload com `filCod: -1` ou `filCod: 99999` passa pelo guard `Number.isFinite`; rejeição cai no ERP, com mensagem opaca.
- **Impacto de negócio**: erros HTTP 400 menos legíveis para o usuário; risco aumenta quando combinado com F-security-1 (atacante consegue iterar valores de filCod por brute-force se a regra de escopo continuar ausente).
- **Métrica de baseline**: 6 rotas sem Zod (5 borderô + 1 DELETE alocação na linha 326, sem schema do corpo) / 13 mutadoras = 46% sem cobertura completa.

### F-security-8: JWT do usuário guardado em `localStorage` (XSS = sequestro de sessão de 12h)

- **Severidade**: P2
- **Tactic violada**: Encrypt Data (transporte/repouso da sessão) / Limit Exposure
- **Localização**: `src/frontend/lib/auth/token.ts:5` (`localStorage key holding the backend-issued JWT`); confirmado em `__tests__/auth/token.test.ts:11-42`.
- **Evidência (objetiva)**:
  ```
  // src/frontend/lib/auth/token.ts
  /** localStorage key holding the backend-issued JWT. */
  export const TOKEN_STORAGE_KEY = 'financeiro.auth.token';
  ```
  TTL do token = 12h (`AuthService.ts:24`). Qualquer XSS bem-sucedido (ainda que improvável dado `dangerouslySetInnerHTML` = 0) entrega 12h de sessão admin.
- **Impacto técnico**: vetor clássico de XSS-to-account-takeover.
- **Impacto de negócio**: combinado com F-security-1, a tomada de conta libera execução de qualquer ação `fin010` em produção.
- **Métrica de baseline**: 100% dos tokens em `localStorage`; 0 em cookie `HttpOnly`.

## 5. Cards Kanban

### [security-1] Validar escopo do borderô server-side antes de qualquer ação (finalizar/cancelar/estornar/DELETE)

- **Problema**
  > A lista `GET /permutas/borderos` traz todos os ~200 borderôs do ERP (inclusive criados por outros usuários do Conexos). O gating "ações só nos nossos" hoje vive APENAS no front (`daTrilha` desabilita o botão). O backend aceita qualquer `borCod`+`filCod` no body e executa a ação no ERP usando a conta de serviço `MPS_FRANCINEI`. Qualquer admin (ou JWT roubado) chama via `curl` e age sobre borderô de terceiro.

- **Melhoria Proposta**
  > Adicionar guard em `BorderoGestaoService` (antes de `finalizar/cancelar/estornar/excluirBordero/excluirBaixa`): consultar `permuta_alocacao_execucao` por `borCod`; se NÃO houver trilha local, rejeitar com `403 'borderô fora do escopo deste sistema'` (a menos que uma role nova `superadmin` autorize, registrando o motivo). Não confiar no `filCod` enviado pelo cliente — derivar **apenas** da trilha (`row.filCod`) ou da env. Persistir cada decisão (allow/deny) em uma tabela de auditoria nova `bordero_acao_audit(borCod, filCod, acao, executado_por, da_trilha, decisao, motivo, ts)`.

- **Resultado Esperado**
  > 0% das chamadas de mutação de borderô executam sobre `borCod` fora da trilha local (sem opt-in explícito). Linha de auditoria persistida em TODA ação. Tactic Bass: Authorize Actors + Audit Trail.

- **Tactic alvo**: Authorize Actors / Audit Trail
- **Severidade**: P0
- **Esforço estimado**: M (2-3d)
- **Findings relacionados**: F-security-1, F-security-6
- **Métricas de sucesso**:
  - Rotas de mutação de borderô com check de escopo: 0/5 → 5/5
  - Ações persistidas em `bordero_acao_audit`: 0% → 100%
- **Risco de não fazer**: estorno/finalização indevida de borderô de terceiro → desconciliação financeira não rastreável; fraude por admin malicioso plausível em < 1 minuto.
- **Dependências**: nova migration `bordero_acao_audit` + decisão de produto sobre `superadmin` (opcional).

### [security-2] Forçar senha única por usuário no bootstrap + troca obrigatória + política mínima

- **Problema**
  > Os 4 usuários novos (francinei/grazi/simone/rogerio @kavex.com) foram seedados com a mesma string `Admin@user2406`. Sem flag de troca no primeiro login, sem MFA, sem política mínima. Comprometer 1 conta = comprometer as 4. Combinado com login sem rate-limit dedicado (F-security-4), basta phishing direcionado.

- **Melhoria Proposta**
  > (1) Estender `app_user` com `must_change_password BOOLEAN DEFAULT FALSE` e middleware que bloqueia qualquer rota não-`/auth/change-password` enquanto `true`. (2) Gerar 4 senhas aleatórias distintas (24+ chars) entregues fora-de-banda (1Password compartilhado individual por pessoa) e rodar reset agora. (3) Aplicar política de senha no `AuthService` (mínimo 12 chars, 1 número, 1 símbolo) usando zxcvbn ou regex. (4) Roadmap: SSO Microsoft (Kavex usa @kavex.com) + MFA — eliminar `app_user` como source-of-truth.

- **Resultado Esperado**
  > 4 contas com senhas distintas, flag de troca limpa após reset, política mínima ativa. Tactic Bass: Authenticate Actors + Change Default Settings.

- **Tactic alvo**: Authenticate Actors
- **Severidade**: P0
- **Esforço estimado**: S (1d para flag/política; M para SSO no roadmap)
- **Findings relacionados**: F-security-2, F-security-4
- **Métricas de sucesso**:
  - Contas com senha única + must_change_password=false após reset: 4/4
  - Contas pendentes de troca: 4 → 0
  - bcrypt cost 10 → 12 (`seed-admin.ts:18`)
- **Risco de não fazer**: phishing de 1 conta = comprometer 4 admins simultaneamente, todos com poder de finalizar/estornar `fin010` em PRD.
- **Dependências**: comunicação coordenada com os 4 usuários.

### [security-3] Rate-limit dedicado e agressivo em `/auth/login` + alarme de falhas

- **Problema**
  > `POST /auth/login` herda apenas o `globalLimiter` (100/min/IP). Não há lockout, captcha, nem alarme em N falhas. Combinado com F-security-2, é convite a dicionário direcionado contra a senha conhecida.

- **Melhoria Proposta**
  > Criar `loginRateLimiter` em `http/rateLimit.ts` (windowMs=60_000, limit=5, key generator por IP+`username`); aplicar diretamente em `routes/auth.ts`. Contador Prometheus `auth_login_failures_total{username,outcome}` e alarme acima de 10 falhas/usuário/hora — drenado pelo Render para um sink externo (Better Stack, Datadog, Slack webhook).

- **Resultado Esperado**
  > 5 tentativas/min/IP+user (vs 100/min/IP hoje); 1 alarme por escalada. Tactic Bass: Limit Access + Detect Intrusion.

- **Tactic alvo**: Limit Access / Detect Intrusion
- **Severidade**: P1
- **Esforço estimado**: S (≤1d limiter; S adicional para o alarme)
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - Tentativas/min permitidas por usuário: 100 → 5
  - Alarmes de bruteforce: 0 → 1 ativo
- **Risco de não fazer**: bruteforce silencioso com 144k tentativas/dia/IP indetectado.

### [security-4] Substituir wildcard CORS por whitelist literal + revisar `credentials:true`

- **Problema**
  > `ALLOWED_ORIGINS` aceita entradas com `*` (proposto `*-kavex.vercel.app`) e ainda envia `credentials: true`. Qualquer subdomínio Vercel com sufixo correspondente consegue navegar com cookies/credenciais.

- **Melhoria Proposta**
  > Limitar `originMatches` a casamento exato; manter no máximo 1-2 entradas explícitas (produção + 1 alias de preview controlado por env). Documentar em `DEPLOY.md` o procedimento de adicionar nova URL Vercel à lista literal. Considerar política mais estrita: `SameSite=Strict` + cookie HttpOnly (depende de [security-6]).

- **Resultado Esperado**
  > 0 wildcards em `ALLOWED_ORIGINS` com `credentials:true`. Tactic Bass: Limit Access.

- **Tactic alvo**: Limit Access
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Entradas wildcard em produção: 1 → 0
- **Risco de não fazer**: CSRF/CORS reflexivo + sessão admin = ações fin010 disparadas por front malicioso.

### [security-5] Persistir audit-trail de mutação de borderô em tabela dedicada

- **Problema**
  > As 5 ações novas (`finalizar/cancelar/estornar/DELETE bordero/DELETE baixa`) usam apenas `logService.info` (stdout do Render free tier, sem retenção longa). Para borderôs de terceiro (sem trilha) NÃO há nenhuma linha em Postgres. Investigação forense impossível.

- **Melhoria Proposta**
  > Migration `bordero_acao_audit(id, bor_cod, fil_cod, acao, executado_por, da_trilha, request_id, request_body_redacted, erp_response_summary, ts)`. Repositório dedicado. `BorderoGestaoService` grava ANTES da chamada ao ERP (pre-commit row, status `requested`) e ATUALIZA depois (`status: settled|failed` + erro). Combina com [security-1].

- **Resultado Esperado**
  > 100% das ações têm linha persistida com `before`/`after`. Tactic Bass: Audit Trail + Recover (Restore).

- **Tactic alvo**: Audit Trail
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-security-1, F-security-5, F-security-6
- **Métricas de sucesso**:
  - Ações persistidas: 0% → 100%
  - Retenção: stdout Render → Postgres Supabase (≥ 90 dias)
- **Risco de não fazer**: incidente em produção sem rastro acionável; auditoria interna do Columbia sem evidência.
- **Dependências**: combina com [security-1] (mesma tabela).

### [security-6] Cobrir as 5 rotas de borderô com schemas Zod (`borCod`, `filCod`, params)

- **Problema**
  > As novas rotas regrediram o padrão Zod estabelecido: `/borderos/:borCod/finalizar|cancelar|estornar` leem `Number(req.body?.filCod)` sem schema; `DELETE /borderos/:borCod` lê `Number(req.query.filCod)`; `DELETE /borderos/:borCod/baixas/:invoiceDocCod` aceita `String(req.params.invoiceDocCod)` direto.

- **Melhoria Proposta**
  > Criar `borderoAcaoBodySchema = z.object({ filCod: z.coerce.number().int().positive() })` e `borderoActionParamsSchema = z.object({ borCod: z.coerce.number().int().positive() })`. Helper `parseOrReject(schema, value, res)` para reduzir boilerplate. Aplicar nas 5 rotas + na DELETE de alocação (linha 326) que também não tem schema.

- **Resultado Esperado**
  > 13/13 rotas de mutação com Zod completo (corpo + query + params). Tactic Bass: Validate Input.

- **Tactic alvo**: Validate Input
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-7
- **Métricas de sucesso**:
  - Cobertura Zod nas rotas de mutação: 7/13 → 13/13
- **Risco de não fazer**: payload malformado vira erro opaco no ERP; reforça [security-1] como única defesa.

### [security-7] Mover JWT do `localStorage` para cookie `HttpOnly; Secure; SameSite=Lax`

- **Problema**
  > Token JWT (TTL 12h, role=admin) vive em `localStorage` no frontend Next.js. Qualquer XSS futuro (mesmo via dependência transitiva — `npm audit` FE: 1 high, 21 moderate) entrega sessão admin completa. Não há revogação granular (`signOut` só limpa `localStorage`).

- **Melhoria Proposta**
  > Backend: `POST /auth/login` devolve `Set-Cookie: financeiro_auth=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`. Middleware lê do cookie OU do `Authorization: Bearer` (compat backwards 1 release). Frontend: remover `TOKEN_STORAGE_KEY` + adaptar `apiFetch` para `credentials: 'include'`. CSRF: token double-submit OU verificar `Origin` na rota (depende de [security-4] estar tight). Roadmap: refresh-token + revogação server-side (lista de jti negada).

- **Resultado Esperado**
  > 0 tokens em `localStorage`; XSS deixa de virar account-takeover. Tactic Bass: Limit Exposure + Revoke Access (parcial via cookie expiry).

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-security-8
- **Métricas de sucesso**:
  - JWT acessível via `document.cookie` ou `localStorage`: SIM → NÃO (HttpOnly)
  - High/moderate vulns FE relevantes: monitoradas e mitigadas
- **Risco de não fazer**: 1 XSS = 12h de sessão admin com poder de finalizar `fin010`.

## 6. Notas do agente

- Escopo declarado: Fase 3.1 (gestão de borderôs) + chave de escrita ligada em PRD (commits `47f2cf0` + `54ad093`). Os findings cobertos pelo run anterior `2026-06-22-1658` (security-1..security-7 daquela leva) foram remediados em commits `538a351` (RBAC server-side) e `0277688` (sandbox/coverage). NOVOS findings desta run focam no que entrou com Fase 3.1: cross-tenant de borderô, regressão Zod, 4 users compartilhando senha, escrita ligada em PRD sem alarme de auth.
- Métrica de falhas-de-auth/min não foi medível localmente (Render free tier sem CloudWatch); coletada via leitura de código.
- Cross-QA para o consolidator:
  - **Audit Trail (security)** ⇄ **Fault Tolerance** — F-security-6 e F-fault-tolerance pareiam; a falta de tabela de auditoria também impede reconstrução pós-falha.
  - **Limit Exposure (security)** ⇄ **Availability** — conta de serviço única `MPS_FRANCINEI` é blast-radius compartilhado (F-security-5); rate-limit também é defesa contra DoS.
  - **Validate Input** ⇄ **Integrability / Fault Tolerance** — Zod faltante nas 5 rotas novas (F-security-7) também é finding de Integrability.
  - **Restore** ⇄ **Availability + Deployability** — sem audit-trail persistido, rollback de uma ação errada no `fin010` depende 100% do ERP (Conexos).
