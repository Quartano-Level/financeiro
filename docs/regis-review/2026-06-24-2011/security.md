---
qa: Security
qa_slug: security
run_id: 2026-06-24-2011
agent: qa-security
generated_at: 2026-06-24T20:11:00-03:00
scope: backend
score: 7.5
findings_count: 6
cards_count: 6
---

# Security — Regis-Review

> **Escopo**: delta `main...HEAD` (v0.7.0) — gestão de borderôs + ingestão de invoices.
> Foco nas 4 rotas novas (`GET /permutas/status`, `GET /permutas/borderos?live`,
> `GET /permutas/borderos/:borCod/baixas`, `DELETE /permutas/borderos/:borCod/trilha`) e
> nos novos repositórios (`replaceBorderoCache`, `listBorderoCache`, `upsertInvoices`).

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Insider com JWT válido (analista não-admin) ou atacante com token roubado de qualquer usuário autenticado | Tenta acionar `DELETE /permutas/borderos/:borCod/trilha` num borCod alheio para reabrir uma permuta já liquidada — ou simplesmente lê `GET /permutas/borderos` e `GET /permutas/status` para extrair o backlog financeiro (Σ R$, fornecedores, CNPJ-via-`exportador`) | Express layer (`routes/permutas.ts`) + `BorderoGestaoService` + cache local `permuta_bordero` (sem coluna `tenant_id`) | Produção (Render single-tenant Columbia, Supabase JWT HS256, `CONEXOS_WRITE_ENABLED=true`) | (a) DELETE/trilha exige `requireRole('admin')` E `requireOwnBorderoFilCod` (filCod vem da trilha, nunca do request) → 403 quando não é da trilha; (b) leituras `borderos`/`status` aceitam qualquer JWT autenticado (mesmo `role` ausente) → vazam o backlog completo | (a) 0 transições não-autorizadas de permuta `settled` → `pendente`; (b) **leituras-de-backlog sem RBAC**: 100% dos JWTs válidos veem 100% do financeiro. Sem `role` (Supabase default = `authenticated`) basta. |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Rotas novas (delta v0.7.0) com `requireRole('admin')` em mutação | 1/1 (DELETE `/trilha`) | 100% | ✅ | `src/backend/routes/permutas.ts:541-560` |
| Rotas novas de LEITURA sem RBAC (autz por role) | 3/3 (`/status`, `/borderos?live`, `/borderos/:borCod/baixas`) | 100% protegidas por role (ou justificadas) | ⚠️ | `src/backend/routes/permutas.ts:423-449, 600-607` |
| Mutações novas com guard server-side de tenancy (`requireOwnBorderoFilCod`) | 1/1 (DELETE `/trilha`) — chama `requireOwnBorderoFilCod` em `removerDaTrilha` | 100% | ✅ | `src/backend/domain/service/permutas/BorderoGestaoService.ts:199-212, 282-297` |
| Inputs Zod nos boundaries das rotas novas | 0/4 com Zod schema (todas usam `Number()` + `Number.isFinite` manual) | 100% Zod (regra CLAUDE.md "Validate external inputs with Zod at boundaries") | ⚠️ | `src/backend/routes/permutas.ts:440-444, 425-431` |
| SQL parametrizado (Rule #5) nos novos repos (`upsertInvoices`, `replaceBorderoCache`, `updateBorderoCacheSituacao`, `deleteBorderoCache`, `listBorderoCache`) | 5/5 — nomes de tabela/coluna são literais; **valores 100% via `$nome`**; `LIMIT` interpolado é coercido a `Math.min(Math.max(limit,1),20000)` antes de virar string | 100% parametrizado | ✅ | `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:305-389`, `PermutaRelationalRepository.ts:295-362` |
| Validação Zod nos mappers ERP novos (`listInvoicesFinalizadas`, `listBaixas`) | 0/2 — `listInvoicesFinalizadas` faz `mapDocPagar(row)` direto (sem `com298RowSchema.parse`); `listBaixas` mapeia rows do ERP com `Number(...)` sem Zod | 100% (vide `listAdiantamentosProforma` que usa `com298RowSchema.parse` na linha 679) | ⚠️ | `src/backend/domain/client/ConexosClient.ts:730-746, 1181-1193` |
| Hardcoded secrets / tokens / API-keys no diff v0.7.0 | 0 | 0 | ✅ | `git diff main...HEAD` (sem hits em "password\|secret\|token\|api[_-]?key\|credential") |
| `.env` / `.tfstate` adicionados | 0 | 0 | ✅ | `git diff --name-only main...HEAD` |
| `dangerouslySetInnerHTML` / `innerHTML` nos novos componentes (BorderosPanel.tsx, page.tsx) | 0 | 0 | ✅ | `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/frontend` (0 hits) |
| Rate-limiter na `DELETE /trilha` | `heavyRouteLimiter` (10/min/IP) presente | presente | ✅ | `src/backend/routes/permutas.ts:544` |
| Confused-deputy: `filCod` proveniente do request body/path em ações de borderô | 0 — `removerDaTrilha`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `excluirBaixa` derivam o `filCod` da trilha local (`requireOwnBorderoFilCod`) | 0 | ✅ | `BorderoGestaoService.ts:91, 154-181, 199-212, 218-234` |
| Tenancy isolation no novo cache `permuta_bordero` (coluna `tenant_id` / RLS) | ausente — tabela sem `tenant_id`, sem RLS; `replaceBorderoCache` apaga tudo que não está na lista corrente: `DELETE FROM permuta_bordero WHERE bor_cod NOT IN (...)` | n/a hoje (mono-tenant Columbia) — risco P1 quando o SaaSo virar | ⚠️ | `src/backend/migrations/0018_permuta_bordero_cache.sql:6-15`, `PermutaExecucaoRepository.ts:360-364` |
| `npm audit` (Backend) — críticas/altas | ⚠️ Não medível neste turno (sem rodar `npm audit` ao vivo) | 0 crit, 0 high | ⚠️ | requer `cd src/backend && npm audit --json` |

> ⚠️ **Não medível localmente**: `npm audit` por sessão; alertas de falha-de-autenticação no Supabase. Recomendação: capturar `npm audit --json` no CI e abrir issue se aparecer crit/high; instrumentar contador de 401 por IP no Express com alarme.

## 3. Tactics — Cobertura no financeiro (delta v0.7.0)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Identify Actors | JWT Supabase HS256/ES256 com `sub`/`email` extraído em `toAuthUser` → `req.user.sub` carimba `executadoPor`/`triggeredBy` em todas as mutações novas | ✅ presente | `src/backend/http/auth.ts:55-64`; `routes/permutas.ts:463, 485, 507, 529, 552, 576` |
| Authenticate Actors | `buildAuthMiddleware` global (`index.ts:77`); `/permutas/*` está ATRÁS do auth → 401 quando token ausente/inválido | ✅ presente | `src/backend/index.ts:77, 92`; `http/auth.ts:155-173` |
| Authorize Actors | RBAC server-side em mutações (`requireRole('admin')`) — 14 routes em `permutas.ts` (incluindo a nova `DELETE /trilha:541-543`). **Mas** 3 das 4 rotas novas (`/status`, `/borderos`, `/borderos/:borCod/baixas`) NÃO checam role → qualquer usuário com JWT válido lê o backlog financeiro completo. Sem RBAC ≠ sem autenticação, mas viola o princípio de "least privilege por role" estabelecido pela proposta | ⚠️ parcial | `routes/permutas.ts:423-449, 600-607` (sem `requireRole`) vs `541-543` (com) |
| Limit Access | `requireOwnBorderoFilCod` em `BorderoGestaoService` — guard server-side de "borderô da trilha": filCod vem da trilha (`permuta_alocacao_execucao`), NUNCA do request. Bloqueia confused-deputy mesmo com JWT de admin. Lança `FORBIDDEN:` → 403 | ✅ presente | `BorderoGestaoService.ts:282-297`; `routes/permutas.ts:65-74` |
| Limit Exposure | Cache `permuta_bordero` (novo) é **global** (sem tenant_id, sem RLS). Em ambiente single-tenant atual é OK; quando virar SaaSo (alvo CLAUDE.md), expõe blast radius cross-tenant. `replaceBorderoCache` faz `DELETE ... WHERE bor_cod NOT IN (...)` — em multi-tenant apagaria borderôs de outros tenants | ⚠️ parcial | `migrations/0018_permuta_bordero_cache.sql:6-15`; `PermutaExecucaoRepository.ts:360-364` |
| Encrypt Data | TLS no Render (transport); JWT HS256/ES256 verificado (`auth.ts:142-152`). DB Supabase com encryption-at-rest (default da plataforma). Sem `MaskService` para CNPJ/exportador nos logs | ✅ presente (transport+at-rest); ⚠️ parcial (logs) | `http/auth.ts`; `http/redact.ts` (existe — não revisei delta) |
| Separate Entities | Mono-tenant hoje (Render single-app). Multi-tenant é alvo — não implementado neste delta | N/A | CLAUDE.md "Tenants: sem tenants provisionados" |
| Change Default Settings | `DEV_AUTH_BYPASS` é opt-in via env (default OFF, com `console.warn` quando ON); `CONEXOS_WRITE_ENABLED` gate explícito em todas as escritas | ✅ presente | `http/auth.ts:100-108`; `BorderoGestaoService.ts:93-95, 275-280` |
| Validate Input | **Inputs HTTP novos NÃO usam Zod**: `borCod = Number(req.params.borCod)`, `filCod = Number(req.query.filCod)`, `req.query.live === 'true'`. Validação é só `Number.isFinite`. Já há padrão Zod no mesmo arquivo (`buscarInvoicesQuerySchema`, `reconciliarBodySchema`) — desvio recente. **ERP responses**: `listInvoicesFinalizadas` (nova) NÃO chama `com298RowSchema.parse` (`listAdiantamentosProforma` chama). Coerção `Number(row.xxx ?? 0)` silenciosamente vira `0` para `NaN`/string-lixo → invoice com valor zerado pode entrar no cache. | ⚠️ parcial | `routes/permutas.ts:425-431, 440-444`; `ConexosClient.ts:730-746` |
| Detect Intrusion | Logs de request/response (`index.ts:39-58`) — não há detector de bruteforce nem alarme | ⚠️ parcial | `src/backend/index.ts:39-58` |
| Detect Service Denial | `globalLimiter` (100/min/IP) + `heavyRouteLimiter` (10/min/IP) cobrem o router; novas rotas herdam o global, e `DELETE /trilha` aplica o heavy | ✅ presente | `http/rateLimit.ts`; `routes/permutas.ts:544, 567` |
| Verify Message Integrity | JWT signature verificada (HS256 com `SUPABASE_JWT_SECRET` ou JWKS); webhooks/SES — n/a aqui | ✅ presente | `http/auth.ts:136-153` |
| Detect Message Delay | n/a (sem fila SQS neste delta) | N/A | — |
| Revoke Access | Sem revogação server-side (JWT auto-expira; sem blacklist de `jti`). Atacante com token válido permanece válido até `exp` | ⚠️ parcial | `http/auth.ts` (sem `jti` blacklist) |
| Lock Computer | n/a (sem session lock por inatividade no backend) | N/A | — |
| Inform Actors | Logs `BUSINESS_INFO` em cada ação (`finalizarBordero`, `cancelarBordero`, `estornarBordero`, `excluirBordero`, `excluirBaixa`, `removerDaTrilha`) com `executadoPor` | ✅ presente | `BorderoGestaoService.ts:135-145, 184-188, 206-210, 228-232, 248-252, 266-270` |
| Audit Trail | Trilha `permuta_alocacao_execucao` (idempotency_key, status, executado_por, criado_em/atualizado_em) é a fonte. **A nova ação `removerDaTrilha` deleta linhas (`deleteByBorCod`) sem registrar antes em tabela de auditoria** — o `LogService.info` é o único rastro, e logs Render rotacionam | ⚠️ parcial | `BorderoGestaoService.ts:199-212`; `PermutaExecucaoRepository.ts:159-164` |
| Restore | overlap com Availability — não aplica diretamente | N/A | — |

## 4. Findings (achados)

### F-security-1: Leituras `/permutas/status` e `/permutas/borderos` sem RBAC vazam o backlog financeiro completo

- **Severidade**: P1 (alto — exposição de dados sensíveis a qualquer JWT válido)
- **Tactic violada**: Authorize Actors / Limit Exposure
- **Localização**: `src/backend/routes/permutas.ts:423-432, 600-607`
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts:423
  router.get(
      '/borderos',
      asyncHandler(async (req, res) => {           // sem requireRole
          await bootstrapAppContainer();
          const service = container.resolve(BorderoGestaoService);
          const live = req.query.live === 'true';
          const borderos = await service.listarBorderos({ live });
          res.json({ borderos, geradoEm: ..., requestId: req.requestId });
      }),
  );

  // routes/permutas.ts:600
  router.get('/status', asyncHandler(async (req, res) => {  // sem requireRole
      const service = container.resolve(BorderoGestaoService);
      res.json({ porAdiantamento: await service.statusPorAdiantamento() });
  }));
  ```
  Comparado às mutações vizinhas (`router.post('/borderos/:borCod/finalizar', requireRole('admin'), ...)` — `routes/permutas.ts:454`), as leituras adotam um modelo "qualquer-autenticado-vê-tudo".
- **Impacto técnico**: o JSON devolvido por `/borderos` inclui `borCod`, `filCod`, `totalBaixado` (R$), `criadoPor`, lista de baixas (`invoiceDocCod`, `adiantamentoDocCod`, `valorBaixado`, `juros`). `/status` devolve `borCod`+situação por adiantamento. Qualquer usuário Supabase válido (default `role = 'authenticated'`, sem privilégio especial) lê o backlog financeiro inteiro da Columbia, em moeda, com fornecedor identificável via JOIN com `permuta_invoice.exportador` exposto em `/permutas/gestao` (mesma classe de leitura).
- **Impacto de negócio**: vazamento de relacionamento comercial (quem a Columbia paga, quanto, quando) — informação concorrencialmente sensível. Em hipótese de credencial vazada de um usuário "leitor" (estagiário, ex-funcionário cuja sessão Supabase não foi explicitamente revogada — vide F-security-5), o atacante extrai o backlog em 2 chamadas curl. Não corrompe dados (read-only), mas falha o "least privilege" prometido pela proposta institucional (SSO + RBAC).
- **Métrica de baseline**: 3/3 rotas novas de leitura sem `requireRole` (`/status`, `/borderos`, `/borderos/:borCod/baixas`).

### F-security-2: Inputs HTTP das rotas novas sem validação Zod (regressão do padrão do arquivo)

- **Severidade**: P2 (médio — débito técnico defensável: validação manual existe, mas é frágil)
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/routes/permutas.ts:425-432, 437-449, 545-552`
- **Evidência (objetiva)**:
  ```ts
  // /borderos/:borCod/baixas — query parsing manual
  const borCod = Number(req.params.borCod);
  const filCod = Number(req.query.filCod);
  if (!Number.isFinite(borCod) || !Number.isFinite(filCod)) {
      res.status(400).json({ error: 'borCod/filCod inválido' });
      return;
  }

  // /borderos?live — query.live === 'true'
  const live = req.query.live === 'true';
  ```
  Compare com o padrão Zod do MESMO ARQUIVO (`buscarInvoicesQuerySchema`, `reconciliarBodySchema`, `runsQuerySchema`, `alocacaoBodySchema`, `clienteFiltroBodySchema`) — toda rota anterior valida com schema declarativo. As 4 rotas novas regrediram para `Number(...)` + boolean ad-hoc.
- **Impacto técnico**: `Number('')` = 0, `Number(null)` = 0, `Number.isFinite(0)` = true → `borCod=0`/`filCod=0` passariam a guard e chegariam ao service. `filCod` chega cru ao `ConexosClient.listBaixas`, podendo bater `fin010/baixas/list/0` no ERP (tentativa que o Conexos vai recusar, mas que polui logs e gasta sessão). `live` aceita só literal `'true'` (qualquer outro valor = false silencioso) — surpresa para o caller que passa `live=1`. Não é injeção, mas é boundary-fragility — viola a regra CLAUDE.md "Validate external inputs with Zod at boundaries".
- **Impacto de negócio**: nenhum dano direto hoje; mas baixa a barra do código novo e abre precedente para futuras rotas Permutas/SISPAG seguirem o mesmo atalho. Se uma rota assim virar mutação (parecida com a `DELETE /trilha` que felizmente tem `requireRole`), a porta para inputs malformados está aberta.
- **Métrica de baseline**: 0/4 rotas novas usam Zod (vs 8/8 das rotas pré-existentes em `routes/permutas.ts`).

### F-security-3: Mapper `listInvoicesFinalizadas` consome ERP sem `com298RowSchema.parse` (input não validado no boundary)

- **Severidade**: P2 (médio — divergência intencional de padrão estabelecido no mesmo arquivo)
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/domain/client/ConexosClient.ts:709-746`
- **Evidência (objetiva)**:
  ```ts
  // listInvoicesFinalizadas (novo, v0.7.0) — SEM com298RowSchema.parse
  const invoices = rows.map<InvoiceLancamento>((row) => {
      const mapped = this.mapDocPagar(row);
      ...
  });

  // listAdiantamentosProforma (existente) — COM Zod
  const validated = com298RowSchema.parse(row);   // linha 679
  ```
  O mesmo arquivo já tem o schema (`conexosPermutasSchemas.ts:28`), o usa em `listAdiantamentosProforma`, e o NOVO método de invoices não o aplica. Resultado: row do Conexos sem `docCod`/`priCod` vira `docCod=''`, `priCod=''` (via `String(row.docCod ?? '')` no `mapDocPagar`) — entra no `upsertInvoices` com PK string vazia, conflita na próxima ingestão.
- **Impacto técnico**: invoice malformada do ERP é silenciosamente persistida com identidade vazia/zerada (`valor=0`, `docCod=''`). Em produção esse caminho dispara o `replaceBorderoCache`/`upsertInvoices` que escrevem direto no banco — uma row tóxica polui o cache até a próxima ingestão. Não é vetor de injeção (SQL é parametrizado), mas é uma quebra de invariante alimentada pelo ERP — mesmo conjunto de riscos que motivou o `com298RowSchema` em primeiro lugar.
- **Impacto de negócio**: contagem de invoices na tela Gestão sai incorreta; busca de invoices por cliente-filtro vira nondeterminística. Recuperar exige rodar nova ingestão + investigar a row tóxica no Conexos. Não há perda financeira direta (a baixa real exige `bxaCodSeq` validado por `BAIXA_GRAVADA_SCHEMA`), mas a confiança no painel cai.
- **Métrica de baseline**: 0/2 mappers ERP novos com Zod (`listInvoicesFinalizadas`, `listBaixas`) vs 1/1 do método irmão (`listAdiantamentosProforma`).

### F-security-4: `permuta_bordero` (novo cache) sem coluna `tenant_id` — incompatível com SaaSo multi-tenant (alvo CLAUDE.md)

- **Severidade**: P2 (médio — risco materializado só quando o SaaSo virar; hoje single-tenant Render)
- **Tactic violada**: Limit Exposure / Separate Entities
- **Localização**: `src/backend/migrations/0018_permuta_bordero_cache.sql:6-15`, `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:331-365`
- **Evidência (objetiva)**:
  ```sql
  CREATE TABLE IF NOT EXISTS permuta_bordero (
      bor_cod             INTEGER PRIMARY KEY,        -- PK GLOBAL, sem tenant_id
      fil_cod             INTEGER NOT NULL,
      ...
  );
  ```
  ```ts
  // replaceBorderoCache — DELETE global
  await this.databaseClient.update(
      `DELETE FROM permuta_bordero WHERE bor_cod NOT IN (${inList})`,
      params,
  );
  ```
  O delta v0.7.0 segue o mesmo padrão das outras tabelas `permuta_*` (sem `tenant_id`). É consistente — mas amplifica o débito existente para mais uma tabela.
- **Impacto técnico**: quando o financeiro for replicado para um segundo tenant (proposta), o `replaceBorderoCache` do tenant A apagaria os borderôs do tenant B no banco compartilhado. PK `bor_cod` é global, mas `bor_cod=12345` do Conexos da Columbia ≠ `bor_cod=12345` do Conexos de outro cliente — colisão silenciosa. No modelo-alvo CLAUDE.md (conta AWS por tenant + DB próprio), o problema desaparece — mas se a primeira evolução for "multi-tenant no mesmo banco" (atalho comum), explode.
- **Impacto de negócio**: hoje, zero (single-tenant). Quando virar SaaSo: vazamento cross-tenant de dados financeiros (CIA-Confidentiality) + corrupção de cache cross-tenant. Cross-link com F-availability (blast radius).
- **Métrica de baseline**: 0 tabelas `permuta_*` com `tenant_id`; +1 com este delta (`permuta_bordero`).

### F-security-5: Falta camada de revogação de sessão (insider-threat para `DELETE /trilha`)

- **Severidade**: P2 (médio — superfície para insider; baixa probabilidade de exploração externa)
- **Tactic violada**: Revoke Access
- **Localização**: `src/backend/http/auth.ts:96-174` (sem `jti` blacklist), `src/backend/domain/service/permutas/BorderoGestaoService.ts:199-212`
- **Evidência (objetiva)**:
  ```ts
  const verify = async (token: string): Promise<JWTPayload> => {
      const { alg } = decodeProtectedHeader(token);
      // ... só valida assinatura + expiração + audience
      // SEM consulta a blacklist/revogação local
  };
  ```
  Não há `app_session` server-side que possa ser invalidada à força (rotação de chave Supabase é a única forma de matar tokens em campo, mas afeta todos os usuários).
- **Impacto técnico**: a nova `DELETE /permutas/borderos/:borCod/trilha` é uma operação destrutiva da fonte-da-verdade local da permuta — uma vez removida da trilha, a permuta volta a "pendente" e pode ser re-baixada (cria-se um SEGUNDO borderô no ERP para o mesmo adiantamento). Combina-se mal com:
  1. ausência de rotina de revogação para um admin desligado (token válido até `exp` original);
  2. ausência de tabela de auditoria persistente (só `LogService` em stdout — vide F-security-6).
  Um admin que saiu da empresa, com JWT válido por mais 1h, pode rodar `DELETE /trilha` em N borderôs e abrir N permutas re-executáveis antes que alguém perceba.
- **Impacto de negócio**: o pior caso é re-execução duplicada de baixa (super-pagamento ao ERP) ou re-abertura indevida de permutas já liquidadas para forjar trilha alternativa — auditoria interna depois reconstrói via logs Render, que rotacionam. Material para constatação de fraude interna fica frágil.
- **Métrica de baseline**: 0 mecanismos de revogação (blacklist `jti`, kill-switch por `sub`, tabela `app_session` server-side); JWT TTL = padrão Supabase (1h access + 7d refresh).

### F-security-6: `removerDaTrilha` faz DELETE sem persistir auditoria além do `LogService.info`

- **Severidade**: P1 (alto — operação destrutiva da fonte-da-verdade local sem trilha durável)
- **Tactic violada**: Audit Trail (overlap com Fault Tolerance)
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:199-212`, `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:159-164`
- **Evidência (objetiva)**:
  ```ts
  public removerDaTrilha = async (params: {
      borCod: number;
      executadoPor: string;
  }): Promise<{ borCod: number; linhasRemovidas: number }> => {
      const { borCod, executadoPor } = params;
      await this.requireOwnBorderoFilCod(borCod);
      const linhasRemovidas = await this.execucaoRepository.deleteByBorCod(borCod);  // DELETE físico
      await this.logService.info({ type: LOG_TYPE.BUSINESS_INFO, ... });  // só stdout
      return { borCod, linhasRemovidas };
  };
  ```
  ```ts
  public deleteByBorCod = async (borCod: number): Promise<number> => {
      return this.databaseClient.update(
          `DELETE FROM permuta_alocacao_execucao WHERE bor_cod = $borCod`, ...);
  };
  ```
  Não há `INSERT INTO permuta_alocacao_execucao_arquivo` ou tabela equivalente. Não há soft-delete (`deleted_at`). Não há trigger Postgres. O único rastro persistido é a re-baixa subsequente (que carrega `executado_por` novo).
- **Impacto técnico**: ação que **libera uma permuta `settled` para re-execução** apaga as N linhas que provariam o estado anterior. Combinada com a rotação de logs Render (~7d), em 1 semana não há como reconstituir quem removeu o quê. A regra de negócio é "saída de emergência" — exatamente o caso onde a auditoria é crítica. A proposta institucional ("ontology/_inbox", CLAUDE.md) diz: "every state-mutating / financial-write action lands in a persisted audit trail".
- **Impacto de negócio**: investigação de incidente fica cega. Se um analista usar essa rota para "desfazer" uma baixa legítima e re-baixar com valor adulterado, o forense só vê o resultado, não a ação intermediária. Conformidade SOX/auditoria-financeira recusa esse desenho.
- **Métrica de baseline**: 1 operação destrutiva server-side (`removerDaTrilha`) com 0 linhas de trilha persistida em tabela.

## 5. Cards Kanban

### [security-1] Aplicar RBAC nas leituras novas de borderôs/status (least-privilege)

- **Problema**
  > As 3 leituras novas (`GET /permutas/borderos`, `GET /permutas/borderos/:borCod/baixas`, `GET /permutas/status`) aceitam qualquer JWT autenticado e devolvem todo o backlog financeiro da Columbia (R$, fornecedores, CNPJ-derivável). A proposta institucional definiu SSO + RBAC como requisito transversal; as mutações vizinhas usam `requireRole('admin')`, mas as leituras regrediram para "qualquer-autenticado-vê-tudo".

- **Melhoria Proposta**
  > Definir 2 roles na ontologia: `admin` (mutações) e `analista` (leitura + mutações específicas). Aplicar `requireRole('admin','analista')` nas 3 leituras. Caso a Supabase emita só `authenticated`, materializar o role no JWT via custom claim (`app_metadata.role`) e validar em `toAuthUser`. Arquivos: `src/backend/routes/permutas.ts:423, 437, 600`; `src/backend/http/auth.ts:55-64`.

- **Resultado Esperado**
  > 3/3 rotas novas com `requireRole`; 0 vazamentos de backlog a JWTs sem role mapeada. JWT sem `role` → 403 (já implementado em `requireRole:183-200`).

- **Tactic alvo**: Authorize Actors / Limit Exposure
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) — backend trivial; FE precisa ler o role do token p/ esconder navegação
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - rotas novas com RBAC: 1/4 → 4/4
  - JWTs sem role conseguindo `GET /borderos`: 100% → 0%
- **Risco de não fazer**: token de "leitor" vazado → backlog financeiro (relação comercial, valores) extraído em 2 requests sem deixar rastro de privilégio escalado.
- **Dependências**: definir o catálogo de roles na ontologia (`ontology/business-rules/rbac.md`)

### [security-2] Trilha de auditoria persistida para `removerDaTrilha` (DELETE com prova)

- **Problema**
  > `removerDaTrilha` é a saída-de-emergência que apaga linhas de `permuta_alocacao_execucao` para reabrir uma permuta. Hoje a única evidência é `LogService.info` em stdout (logs Render rotacionam). Investigação forense ≥ 7d depois fica cega — não há quem/quando/qual `bor_cod` recuperável.

- **Melhoria Proposta**
  > Adicionar tabela `permuta_execucao_audit_log` (`id`, `acao`, `bor_cod`, `payload_antigo jsonb`, `executado_por`, `criado_em`). `removerDaTrilha` faz `INSERT` ANTES do `DELETE`, dentro da mesma transação. Alternativa Postgres: trigger `AFTER DELETE ON permuta_alocacao_execucao` para qualquer DELETE. Tactic Bass: Audit Trail.

- **Resultado Esperado**
  > 100% dos DELETEs em `permuta_alocacao_execucao` (de qualquer origem) deixam linha durável com payload anterior. Retenção: ≥ 2 anos (compliance SOX).

- **Tactic alvo**: Audit Trail
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — migration + trigger + cobertura nos serviços
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - DELETEs em `permuta_alocacao_execucao` com linha de auditoria: 0% → 100%
  - tempo p/ reconstituir quem-removeu-borCod-X: indefinido → 1 SELECT
- **Risco de não fazer**: incidente de uso indevido de `removerDaTrilha` (insider abrindo permuta `settled` para re-baixar) fica impossível de auditar após rotação dos logs Render (~7d).
- **Dependências**: nenhuma

### [security-3] Migrar inputs HTTP das 4 rotas novas para Zod (boundary regression-fix)

- **Problema**
  > As 4 rotas novas (`/status`, `/borderos?live`, `/borderos/:borCod/baixas`, `/trilha` DELETE) validam params/query com `Number(...)` + `Number.isFinite` manual, regredindo o padrão Zod estabelecido no MESMO arquivo (8 schemas existentes). `Number('')`/`Number(null)` = 0 e passam a guard. `live === 'true'` aceita só literal e ignora `1`/`yes`/etc. silenciosamente.

- **Melhoria Proposta**
  > Criar e usar `borCodPathSchema = z.object({ borCod: z.coerce.number().int().positive() })`, `filCodQuerySchema = z.object({ filCod: z.coerce.number().int().positive() })`, `borderosQuerySchema = z.object({ live: z.coerce.boolean().optional() })`. Aplicar `safeParse` no início de cada handler novo. Arquivos: `src/backend/routes/permutas.ts:423-449, 545-552, 600-607`.

- **Resultado Esperado**
  > 4/4 rotas novas validam inputs com Zod (alinha com 8/8 das pré-existentes). Inputs malformados respondem 400 estruturado em vez de chegarem ao service.

- **Tactic alvo**: Validate Input
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - rotas novas com Zod: 0/4 → 4/4
  - rotas com `Number()`+`isFinite` ad-hoc: 4 → 0
- **Risco de não fazer**: precedente de "ignorar Zod para rotas simples" se propaga; quando aparecer uma rota "simples-mas-mutadora", a porta de inputs malformados está aberta.
- **Dependências**: nenhuma

### [security-4] Validar com Zod as respostas do `com298/list` em `listInvoicesFinalizadas` e do `fin010/baixas/list` em `listBaixas`

- **Problema**
  > Novos mappers ERP (`ConexosClient.listInvoicesFinalizadas:730`, `listBaixas:1181`) consomem rows do Conexos sem `com298RowSchema.parse`. O mesmo cliente JÁ usa Zod em `listAdiantamentosProforma:679`. Rows sem `docCod`/`priCod` viram identidade vazia (`String(row.docCod ?? '')`) e entram silenciosamente em `permuta_invoice`/`permuta_bordero` via `upsertInvoices`/`replaceBorderoCache`.

- **Melhoria Proposta**
  > Em `listInvoicesFinalizadas`: aplicar `com298RowSchema.parse(row)` antes do `mapDocPagar`, espelhando o irmão `listAdiantamentosProforma`. Em `listBaixas`: criar `fin010BaixaRowSchema` (exigir `docCod`, `titCod`, `bxaCodSeq` como wireNumber positivo). Tactic: Validate Input.

- **Resultado Esperado**
  > Rows tóxicas do ERP → erro Zod logado e descartadas (não entram no cache). Mappers ERP cobertos 3/3 (em vez de 1/3) com Zod no boundary.

- **Tactic alvo**: Validate Input
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - mappers ERP novos com Zod: 0/2 → 2/2
  - rows com identidade vazia entrando em `permuta_invoice`: silencioso → 0 (descartadas com warn)
- **Risco de não fazer**: cache poluído por uma row tóxica do ERP corrompe a busca por cliente; depuração exige rodar nova ingestão + investigar manualmente.
- **Dependências**: nenhuma

### [security-5] Reservar `tenant_id` em `permuta_bordero` antes da expansão multi-tenant

- **Problema**
  > Nova tabela `permuta_bordero` (cache de borderôs) é global (`bor_cod` como PK única). No alvo SaaSo (CLAUDE.md "cada cliente = isolated AWS account"), o single-account é solução; mas se a evolução for "multi-tenant mesmo banco" (atalho frequente), `replaceBorderoCache` apagaria os borderôs do tenant B ao rodar a ingestão do tenant A, e `bor_cod=X` do Conexos da Columbia colidiria com `bor_cod=X` de outro cliente.

- **Melhoria Proposta**
  > Adicionar coluna `tenant_id TEXT NOT NULL DEFAULT 'columbia'` em `permuta_bordero` (migration nova). Mudar PK para `(tenant_id, bor_cod)`. Atualizar `replaceBorderoCache`/`listBorderoCache`/`updateBorderoCacheSituacao`/`deleteBorderoCache` para receber `tenantId` (via `EnvironmentProvider.getTenantId()`) e filtrar WHERE. Aplicar à `permuta_invoice`, `permuta_adiantamento`, `permuta_alocacao_execucao` em ondas (separar do escopo deste card). Habilitar RLS no Supabase (`USING (tenant_id = current_setting('app.tenant_id'))`).

- **Resultado Esperado**
  > Modelo de dados pronto para multi-tenant antes que a primeira filial-cliente entre. Blast radius isolado por `tenant_id` em SELECT/UPDATE/DELETE.

- **Tactic alvo**: Limit Exposure / Separate Entities
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) p/ `permuta_bordero` isolada; XL p/ propagar a todas as tabelas
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - tabelas `permuta_*` com `tenant_id`: 0 → ≥1 (cache) → todas (futuro)
  - queries `BorderoGestaoService` filtrando por `tenant_id`: 0 → 100%
- **Risco de não fazer**: quando o financeiro for vendido para o 2º cliente, retrabalho de migration + risco de leak cross-tenant durante a janela de implantação.
- **Dependências**: decisão arquitetural "1 banco multi-tenant" vs "1 banco por tenant" (alinha com OntologyCurator + AwsInfraArchitect)

### [security-6] Implementar revogação server-side de sessão (kill-switch por `sub`/`jti`)

- **Problema**
  > A nova `DELETE /trilha` é destrutiva e a única defesa para "admin desligado com JWT válido" é esperar `exp`. Sem mecanismo de revogação imediata por `sub`/`jti`, um admin recém-removido do Supabase mantém poder de mutação por até 1h (access) + 7d (refresh, default Supabase).

- **Melhoria Proposta**
  > Tabela `app_session_revoked` (`jti TEXT PRIMARY KEY`, `sub TEXT`, `revoked_at TIMESTAMPTZ`). Em `buildAuthMiddleware`, após `jwtVerify`, consultar a tabela (cache 60s em memória) — se `jti` ou `sub` revogado → 401. Endpoint `POST /admin/sessions/revoke` (admin-only) para revogar por `sub`. Quando o IdP virar SSO corporativo (proposta), integrar com SCIM/desprovisioning.

- **Resultado Esperado**
  > Token de admin desligado pode ser killed em ≤60s pelo time-de-segurança, sem esperar `exp` natural.

- **Tactic alvo**: Revoke Access
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - tempo p/ matar token comprometido: até 1h+7d → ≤60s
  - revogações disponíveis: 0 → 1 endpoint admin
- **Risco de não fazer**: insider desligado com poder de mutação até `exp`; CIA-Integrity vulnerável durante a janela de offboarding.
- **Dependências**: nenhuma (preferencialmente alinhar com migração para SSO institucional)

## 6. Notas do agente

- Escopo restrito ao delta v0.7.0 conforme pedido — não revisei rotas pré-existentes (`/eleicao`, `/ingestao`, `/adiantamentos/.../reconciliar`) salvo p/ comparar padrão (Zod, requireRole, guard de filCod).
- Métrica `npm audit` não foi medida neste turno (sem rodar `cd src/backend && npm audit --json`) — recomendação no QA Testability.
- Cross-QA detectados (alertar o consolidator): **F-security-6** (Audit Trail de `removerDaTrilha`) overlap com Fault Tolerance; **F-security-4** (tenant_id em `permuta_bordero`) overlap com Availability (blast radius) e Modifiability (custo de retro-fit); **F-security-3** (Zod no boundary ERP) overlap com Integrability e Fault Tolerance.
- Achado positivo de destaque: o guard `requireOwnBorderoFilCod` (`BorderoGestaoService.ts:282-297`) bloqueia confused-deputy mesmo com JWT de admin — `filCod` SEMPRE vem da trilha local, nunca do request. Padrão a replicar nas próximas rotas.
