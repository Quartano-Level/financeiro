---
qa: Security
qa_slug: security
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-security
generated_at: 2026-07-18T16:18Z
scope: backend + frontend (SISPAG / Frente II only)
score: 7
findings_count: 8
cards_count: 8
---

# Security — Regis-Review (SISPAG / Frente II)

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Ator interno malicioso ou credencial de usuário @kavex comprometida (phishing/session-stealing) | Chama `POST /sispag/lotes/:id/finalizar` (gate de lote), `POST /sispag/lotes/:id/conta` (troca conta pagadora) ou dispara `POST /sispag/ingestao` fora da janela | Rotas mutantes de `routes/sispag.ts`, `LotePagamentoService`, `IngestaoPagamentosService`, e (dormentes) `ConexosSispagWriteClient` / `ConexosSispagRetornoClient.carregarArquivoRetorno` | Produção real (SISPAG habilitado por `SISPAG_ENABLED=true`), usuários @kavex autenticados via JWT HS256 do próprio app | Sistema deve: (a) rejeitar sem role `admin` (403); (b) validar corpo com Zod (400); (c) persistir o ato em trilha imutável atribuída ao usuário; (d) NUNCA disparar escrita real no Conexos sem `conexosWriteEnabled` + `conexosDryRun=false`; (e) manter dados sensíveis (banco/conta/CNPJ/PIX/barras) fora de logs abertos | 0 mutações sem `requireRole`; 0 mutações sem Zod; 100% das transições persistidas com `ator`; 0 chamadas de escrita a `fin015`/`fin052/carregar` sem gate; 0 números de conta/PIX/barras em stdout |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Rotas SISPAG mutantes (POST/PUT/DELETE) com `requireRole('admin')` | 11/11 | 100% | ✅ | `grep -cn "requireRole" src/backend/routes/sispag.ts` (11 hits, 11 rotas mutantes) |
| Rotas com corpo JSON validado com Zod `safeParse` | 6/6 | 100% | ✅ | `routes/sispag.ts` linhas 141, 158, 211, 254, 286, 110 (query listLotes) |
| Rotas SISPAG protegidas pelo `sispagGate` (403 em prod) | 14/14 | 100% | ✅ | `index.ts:107` — `app.use('/sispag', sispagGate, sispagRouter)` |
| SQL com interpolação de string controlada por usuário no repo SISPAG | 0 | 0 | ✅ | `grep -rEn "\`.*\\\$\{" repository/sispag` — os 2 hits (`LotePagamentoRepository:270-285`, `408-409`) interpolam apenas branches de enum interno (`setFinal`) ou nomes de parâmetros `$nome`, não valores de usuário |
| `process.env` cru em serviços/repositórios SISPAG | 0 | 0 | ✅ | `grep -rn "process\\.env" src/backend/domain/service/sispag src/backend/domain/repository/sispag src/backend/domain/client/ConexosSispag*.ts` |
| Segredos hardcoded (secret/token/password ≥ 8) em código SISPAG | 0 | 0 | ✅ | `grep -rEn "(password\|secret\|token\|apiKey).*=.*['\"][^'\"]{8,}"` na árvore SISPAG (não-teste) |
| `.env` versionado | 0 | 0 | ✅ | `.gitignore` linha `.env`; `git ls-files` só devolve `.env.example` |
| Transições de lote persistidas com `ator` em trilha auditável (não-log) | 2 / 8 tipos | ≥ 7 (todas as mutações) | ❌ | `migrations/0023_lote_pagamento.sql:19-21` cobre só `criado_por` + `finalizado_por`; `reabrir`/`cancelar`/`marcarRetorno`/`atualizarContaPagadora`/`atualizarModalidadeItem`/`incluirTitulo`/`removerTitulo` só emitem `LogService.info` (`LotePagamentoService.ts:394-404`) — stdout do Render, mutável/expira |
| Toolboxes de escrita com gate próprio (`conexosWriteEnabled`) | 0 / 3 | 3 / 3 (ou teste que garanta o gate no serviço) | ❌ | `ConexosSispagWriteClient.ts:52-56` explicita "NÃO é gated internamente"; `ConexosSispagRetornoClient.ts:26-29` idem; `RetornoOrquestracaoService.ts:74-77` checa a flag manualmente (esqueceu no futuro → escrita real) |
| Upload multipart `.RET` com validação de tamanho/MIME/layout antes do POST | 0 / 1 | 1 / 1 | ❌ | `ConexosSispagRetornoClient.carregarArquivoRetorno` (linhas 269-284): `form.append('file', new Blob([conteudo]))` sem `maxSize`, sem `contentType`, sem sanity check CNAB |
| Rotas de LEITURA `/sispag/*` protegidas por RBAC (além do JWT) | 0 / 5 (`/painel`, `/lotes`, `/lotes/:id`, `/retornos`, `/ingestao/runs`, `/modalidades-disponiveis`) | discussão de escopo (proposta: RBAC granular) | ⚠️ | por design — comentário em `http/auth.ts:181` ("Mantém as rotas de LEITURA abertas") |
| Campos sensíveis (`banco`, `conta`, `docCod`, `titCod`, `modalidade`) em `LogService.info` fora de `redactBody` | 6+ ocorrências | 0 | ⚠️ | `LotePagamentoService.ts:91-94, 141-144, 240-243, 270-273, 367`; `redact.ts` só cobre `password/token/secret/authorization` no request/response logger |
| `Idempotency-Key` validado (tamanho, formato) antes de virar chave em `pagamento_ingestao_idempotency` | 0 | ≤ 200 chars, alfanumérico | ⚠️ | `routes/sispag.ts:322` — `req.header('Idempotency-Key') ?? undefined` sem parse |
| `banco`/`conta`/`docCod`/`titCod` com `.max()` no Zod | 0 / 4 | 4 / 4 (≤ 32 chars) | ⚠️ | `routes/sispag.ts:80-103` — só `.trim().min(1)` |
| `DEV_AUTH_BYPASS` deny-by-default quando `environment` unset | ⚠️ trata `''`/unset como "local" (permite bypass) | crashar se `environment` vazio + bypass | ⚠️ | `http/authEnv.ts:93-101` — `envName === '' \|\| LOCAL_ENVIRONMENTS.includes(envName)`; `render.yaml` precisa setar `environment` para o guard fechar |
| Rate limit em `/sispag/ingestao` e `/sispag/lotes/formar` | ✅ `heavyRouteLimiter` (10/min) | presente | ✅ | `routes/sispag.ts:318, 337` |
| Endpoints com CORS wildcard | 0 | 0 | ✅ | `index.ts:32` usa `buildCorsOptions(process.env.ALLOWED_ORIGINS)` (allowlist) |

## 3. Tactics — Cobertura no SISPAG (Bass canonical)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Nenhum SIEM/IDS/WAF; `[auth]` só warn no console em 401/403 | ❌ ausente | `http/auth.ts:167, 191` — `console.warn` sem sink centralizado |
| Detect Service Denial | `express-rate-limit` global 100/min + heavy 10/min por IP; `skipInTest` desliga em teste | ✅ presente (borda) | `http/rateLimit.ts:15-35`, `routes/sispag.ts:318,337` |
| Verify Message Integrity | JWT HS256 assinado; Zod nos bodies das mutações; enums para `modalidade`/`status` | ✅ presente | `authEnv.ts`, `routes/sispag.ts:80-103` |
| Detect Message Delay | Advisory lock + `IngestLockBusyError` (409); optimistic lock por `versao` (I6) | ✅ presente (concorrência) | `LotePagamentoRepository.transicionarStatus:392-419`; `IngestaoPagamentosService` |
| Identify Actors | `ator(req) = req.user.sub ?? req.user.email ?? 'unknown'`; JWT valida `sub`; login por `AUTH_JWT_SECRET` | ⚠️ parcial | `routes/sispag.ts:65`; fallback `'unknown'` mascara falha silenciosa quando o JWT não traz `sub` (só ocorreria com `DEV_AUTH_BYPASS`) |
| Authenticate Actors | `buildAuthMiddleware` valida JWT antes de `/sispag`; recusa expirado/inválido | ✅ presente | `index.ts:82`, `http/auth.ts:96-174` |
| Authorize Actors | `requireRole('admin')` em TODAS as 11 rotas mutantes; reads abertas | ✅ presente (mutações) / ⚠️ ausente (leituras) | `routes/sispag.ts:138,155,180,208,246,283,317,336` |
| Limit Access | `sispagGate` (403 em prod hoje); `requireRole` nas escritas; **leituras** expõem carteira inteira ao usuário autenticado | ⚠️ parcial | `http/sispagGate.ts`, `routes/sispag.ts` |
| Limit Exposure | Rotas de escrita ao ERP DORMENTES (I1); `ConexosSispagWriteClient` só é wired em harness HML; `RetornoOrquestracaoService` no-op | ✅ presente (hoje) / ⚠️ frágil (sem gate mecânico) | `ConexosSispagWriteClient.ts:52-56`, `RetornoOrquestracaoService.ts:79-84` |
| Encrypt Data | HTTPS termina no Render; Postgres via SSL (Supabase); JWT assinado (não criptografado) | ✅ presente (transporte) | infra Render/Supabase (fora do repo) |
| Separate Entities | Single-tenant hoje (Columbia); DDD isola SISPAG de Permutas; Postgres e Conexos separados | ⚠️ single-tenant | arquitetura |
| Change Default Settings | `CONTA_PAGADORA_DEFAULT` é Itaú (não credencial); `sispagEnabled` default `false` em prod | ✅ presente | `SispagInterface.ts`, `EnvironmentProvider.resolveSispagEnabled` |
| Validate Input | Zod nos bodies mutantes; enums `modalidade`/`status`; **sem** `.max()`; `Idempotency-Key` sem parse; upload multipart sem tamanho/MIME | ⚠️ parcial | `routes/sispag.ts:80-103`; `ConexosSispagRetornoClient.carregarArquivoRetorno` |
| Revoke Access | JWT HS256 stateless — revogar `role` NÃO invalida tokens ativos até expiração | ❌ ausente | `authEnv.ts`, sem denylist/refresh rotation |
| Lock Computer | N/A (SaaS backend, não estação) | N/A | — |
| Inform Actors | Ingestion returns 409 se busy; `LoteVersaoConflitoError` explica conflito | ✅ presente (parcial) | `respondLoteError` em `routes/sispag.ts:68-78` |
| Restore (overlap Availability) | Migrations `0023-0031` idempotentes; run de ingestão persistida (`pagamento_ingestao_run`); optimistic lock permite retry | ✅ presente (ingestão) / ⚠️ ausente (transições de lote — sem trilha imutável) | `migrations/0024_pagamento_ingestao.sql`; `migrations/0023_lote_pagamento.sql` (sem histórico) |
| Audit Trail | `pagamento_ingestao_run` persiste quem/quando/status da ingestão; `criado_por`/`finalizado_por` na raiz do lote; **transições** (`reabrir`, `cancelar`, `retorno`, `modalidade`, `conta`, `incluir/remover item`) SÓ em `LogService.info` (stdout Render) | ❌ parcial | `LotePagamentoService.audit()` (394-404) vs. ausência de `sispag_audit_log` |

## 4. Findings (achados)

### F-security-1: Trilha de auditoria das transições de lote é apenas log, não persistida

- **Severidade**: P1 (alto — domínio de pagamento sem trilha imutável)
- **Tactic violada**: Audit Trail
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:394-404`; `src/backend/migrations/0023_lote_pagamento.sql:10-26`
- **Evidência (objetiva)**:
  ```typescript
  private audit = (
      acao: string,
      loteId: string,
      ator: string,
      extra: Record<string, unknown>,
  ): Promise<void> =>
      this.logService.info({
          type: LOG_TYPE.BUSINESS_INFO,
          message: `SISPAG lote: ${acao}`,
          data: { loteId, ator, ...extra },
      });
  ```
  Chamado em 6 pontos (`criarLote`, `atualizarContaPagadora`, `atualizarModalidadeItem`, `incluirTitulo`, `removerTitulo`, `transicionar`). O único registro persistido é `lote_pagamento.criado_por` + `finalizado_por` — o cancelamento, reabertura, marcação de retorno, troca de modalidade, troca de conta pagadora e inclusão/remoção de item somem para stdout do Render (rotacionado, mutável, sem query estruturada).
- **Impacto técnico**: perícia forense pós-incidente ("quem trocou a conta pagadora do lote LT-42 duas horas antes de finalizar?") só existe enquanto o log estiver no drain. Analise de padrões (usuário que sempre desfaz gate de outro) impossível.
- **Impacto de negócio**: em um domínio que **move dinheiro** e onde o auditor externo (compliance/fisco) pergunta "quem autorizou este pagamento", "só temos no stdout do Render dos últimos 7 dias" não sobrevive à auditoria; contradiz o requisito não-negociável "trilha persistida por ação, atribuída ao usuário" da proposta.
- **Métrica de baseline**: 2/8 tipos de mutação com registro persistido (25%).

### F-security-2: Ferramentas de escrita `fin015`/`fin052/carregar` não têm gate próprio, dependem de comentário no código

- **Severidade**: P1 (alto — blast radius = remessa/baixa real)
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/domain/client/ConexosSispagWriteClient.ts:52-56`; `src/backend/domain/client/ConexosSispagRetornoClient.ts:26-29`; `src/backend/domain/service/sispag/RetornoOrquestracaoService.ts:74-77`
- **Evidência (objetiva)**:
  ```typescript
  // ConexosSispagWriteClient.ts:52-56
  // ⚠️ FERRAMENTA, não fluxo: este client NÃO é gated internamente (como o
  // `ConexosBaixaClient`). O gating de produção (`conexosWriteEnabled`/`conexosDryRun`),
  // a idempotência (ledger write-ahead) e a auditoria persistida são responsabilidade
  // do SERVIÇO de orquestração — que será modelado com o analista (...).
  ```
  Nenhum teste falha se um novo serviço resolver `ConexosSispagWriteClient` e chamar `criarLote`/`gerarRemessa`/`importarTitulos` diretamente sem consultar `env.conexosWriteEnabled`. `postGenericOnce` (tentativa única) dispara sobre o ERP real em qualquer container que rode com as credenciais Conexos de produção.
- **Impacto técnico**: um `/feature-new sispag "wire the write path"` que esqueça uma linha (`if (!env.conexosWriteEnabled) return dryRun()`) manda `.REM` real para o banco. Não-idempotente → não dá para desfazer chamando de novo.
- **Impacto de negócio**: remessa de pagamento (`.REM` CNAB 240) executada em produção sem consentimento — o banco pode debitar a conta antes de qualquer detecção. Reconciliação manual, risco jurídico de pagamento indevido.
- **Métrica de baseline**: 0/3 toolboxes de escrita com gate interno; 0 testes automatizados que garantam `conexosWriteEnabled=false → 0 chamadas para postGenericOnce`.

### F-security-3: Upload multipart `.RET` (`carregarArquivoRetorno`) sem validação de tamanho, MIME ou sanidade CNAB

- **Severidade**: P1 (alto — pipeline futuro processa retornos bancários)
- **Tactic violada**: Validate Input, Limit Exposure
- **Localização**: `src/backend/domain/client/ConexosSispagRetornoClient.ts:263-284`
- **Evidência (objetiva)**:
  ```typescript
  public carregarArquivoRetorno = async (params: CarregarRetornoParams) => {
      const { filCod, bncCod, gtbCodSeq, fileName, conteudo } = params;
      const path = `fin052/arquivosRetorno/carregar/${bncCod}/${gtbCodSeq}?fileName=${encodeURIComponent(fileName)}`;
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(conteudo)]), fileName);
      // ...postMultipartOnce (tentativa única, não-idempotente)
  };
  ```
  Sem `maxSize`, sem `contentType`, sem checagem de layout CNAB240/400 antes do POST. `bncCod`/`gtbCodSeq` são inferidos do NOME do arquivo (TODO no `RetornoOrquestracaoService.ts:79-81`) — um arquivo malformado com nome enganoso é roteado para o banco errado.
- **Impacto técnico**: quando wired (Fatia 3), um retorno adulterado (ou colocado por engano na pasta do SharePoint por outra automação Kavex) é aceito, o ERP parsea o que dá, e a baixa cai em títulos errados (`bxaCodSeq` → fin010). `postMultipartOnce` é não-idempotente → duplicar o `.RET` cria arquivos duplicados no fin052.
- **Impacto de negócio**: baixa em título errado = fornecedor A recebe crédito de pagamento que foi para o fornecedor B; reconciliação manual + risco de o financeiro pagar em dobro.
- **Métrica de baseline**: 0 validações de tamanho/MIME/CNAB antes do upload.

### F-security-4: Rotas de leitura SISPAG expõem carteira inteira a qualquer usuário autenticado (sem RBAC de leitura)

- **Severidade**: P2 (médio — modelo single-tenant hoje, mas viola proposta)
- **Tactic violada**: Limit Access, Authorize Actors
- **Localização**: `src/backend/routes/sispag.ts:29-133`, `350-359`
- **Evidência (objetiva)**:
  `GET /sispag/painel`, `GET /sispag/lotes`, `GET /sispag/lotes/:id`, `GET /sispag/retornos`, `GET /sispag/ingestao/runs`, `GET /sispag/lotes/:id/modalidades-disponiveis` — NENHUMA carrega `requireRole`. O comentário em `http/auth.ts:181` ("Mantém as rotas de LEITURA abertas a qualquer usuário autenticado") é explícito.
  A carteira contém: nomes de credores, valores, vencimentos, banco/conta pagadora, `docCod`/`titCod` — PII financeira da Columbia inteira, visível para qualquer conta @kavex ativa.
- **Impacto técnico**: um usuário @kavex de outra área (que precisa apenas de Permutas) vê a carteira completa de pagamentos.
- **Impacto de negócio**: a proposta comercial exige "SSO corporativo + RBAC granular"; o modelo atual é binário (admin/user) com reads open — não passa em revisão de LGPD/compliance para o segundo cliente da SaaSo (multi-tenant).
- **Métrica de baseline**: 0/6 rotas de leitura com RBAC além de "autenticado".

### F-security-5: `LogService.info` de auditoria vaza número de conta pagadora e identidade de títulos em stdout

- **Severidade**: P2 (médio — depende do drain de logs)
- **Tactic violada**: Limit Access, Encrypt Data (logs em claro)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:91-94, 141-144, 240-243, 270-273, 367`
- **Evidência (objetiva)**:
  ```typescript
  await this.audit('atualizarContaPagadora', input.loteId, input.ator, {
      banco: input.banco,
      conta: input.conta,          // ← número de conta bancária corporativa em stdout
  });
  // ...
  await this.audit('incluirTitulo', input.loteId, input.ator, {
      docCod: input.docCod,        // ← identidade de título
      titCod: input.titCod,
  });
  ```
  `redactBody` em `src/backend/http/redact.ts` só cobre `password/token/secret/authorization/api_key/jwt` — e é aplicado APENAS ao request/response logger em `index.ts:44-63`. `LogService.info` vai direto para `console.log`.
- **Impacto técnico**: drain de logs (Render → LogDNA/Datadog/S3) leva números de conta pagadora e docCod/titCod em claro; um leitor de logs com acesso ao drain vê a agenda de pagamentos.
- **Impacto de negócio**: conta corrente corporativa em log externo = superfície de social engineering (falso boleto direcionado); pauta de LGPD se drain sair da jurisdição.
- **Métrica de baseline**: 6+ pontos de log com dados sensíveis; 0 aplicação de `redactBody` nos logs de negócio.

### F-security-6: `DEV_AUTH_BYPASS` fail-fast trata `environment` vazio como "local" — bypass silencioso se render.yaml esquecer a var

- **Severidade**: P2 (médio — mutações ainda 401 pelo `requireRole`, mas leituras + `sispagGate` desabilitadas)
- **Tactic violada**: Authenticate Actors, Change Default Settings (deny-by-default)
- **Localização**: `src/backend/http/authEnv.ts:93-101`
- **Evidência (objetiva)**:
  ```typescript
  const envName = (parsed.environment ?? '').trim().toLowerCase();
  const isLocalEnvironment = envName === '' || LOCAL_ENVIRONMENTS.includes(envName);
  if (parsed.DEV_AUTH_BYPASS && !isLocalEnvironment) {
      throw new Error(...);
  }
  ```
  Se `environment` NÃO for setada no Render (config drift, novo tenant) E `DEV_AUTH_BYPASS=true` vazar (herdado do exemplo), o boot NÃO crasha — o comentário diz "deny-by-default", mas a implementação trata `""` como local.
- **Impacto técnico**: sob bypass, `req.user` fica `undefined`; `requireRole` cai em 401 (mutações seguras), mas as leituras SISPAG (sem role) — quando `SISPAG_ENABLED=true` — passam sem auth. Painel de pagamentos exposto ao mundo enquanto ninguém vê o warning `[auth] DEV_AUTH_BYPASS is enabled` no stdout.
- **Impacto de negócio**: em uma janela de missetup (rollout do primeiro cliente multi-tenant), a carteira de pagamentos de um cliente fica pública. Precisa de duas config drifts simultâneas — mas o custo do guard mais estrito é uma linha.
- **Métrica de baseline**: 1 caminho onde `environment=''` e `DEV_AUTH_BYPASS=true` bootam sem auth.

### F-security-7: `Idempotency-Key` e strings `banco`/`conta`/`docCod`/`titCod` sem `.max()` — Zod aceita payload ilimitado

- **Severidade**: P3 (baixo — rate limiter mitiga)
- **Tactic violada**: Validate Input
- **Localização**: `src/backend/routes/sispag.ts:80-103, 322`
- **Evidência (objetiva)**:
  ```typescript
  const criarLoteSchema = z.object({
      filCod: z.coerce.number().int().positive(),
      banco: z.string().trim().min(1).optional(),   // ← sem .max()
      conta: z.string().trim().min(1).optional(),
  });
  // ...
  const idempotencyKey = req.header('Idempotency-Key') ?? undefined;  // ← sem parse
  ```
  `idempotency_key` vai como PK em `pagamento_ingestao_idempotency`; TEXT sem limite. Um chamador com role admin pode encher a tabela.
- **Impacto técnico**: superfície de DoS por payload grande (rate limiter cobre volume mas não tamanho por request).
- **Impacto de negócio**: baixo hoje (rate-limited); hardening barato antes do rollout multi-tenant.
- **Métrica de baseline**: 0/5 campos string com `.max()`; 0 validação em `Idempotency-Key`.

### F-security-8: JWT HS256 stateless — revogar `role` (demissão, comprometimento) não invalida tokens ativos

- **Severidade**: P2 (médio)
- **Tactic violada**: Revoke Access
- **Localização**: `src/backend/http/auth.ts:96-174`; `src/backend/http/authEnv.ts:30-46`
- **Evidência (objetiva)**:
  Sem denylist server-side, sem `jti` gravado em tabela, sem refresh rotation. Se um admin @kavex é comprometido e a role é revogada em `app_user`, o JWT emitido continua válido até a expiração natural.
- **Impacto técnico**: janela de exposição = TTL do token. Todas as rotas SISPAG mutantes (incluindo `POST /lotes/:id/finalizar`) permanecem operáveis até o token expirar.
- **Impacto de negócio**: em um domínio de pagamentos, revogação imediata é requisito de continuidade; hoje precisa esperar o TTL.
- **Métrica de baseline**: 0 mecanismos de revogação server-side.

## 5. Cards Kanban

### [security-1] Persistir trilha de auditoria de todas as transições de lote em tabela imutável

- **Problema**
  > Só `criado_por` e `finalizado_por` na raiz do lote são persistidos; as demais transições (`reabrir`, `cancelar`, `retorno`, `atualizarConta`, `atualizarModalidade`, `incluir/remover item`) e a formação automática só emitem `LogService.info`. Em stdout do Render, os logs expiram e não são queryable — perícia forense pós-incidente ("quem cancelou o lote LT-42?") depende do drain estar quente. Para um domínio que move dinheiro, é insustentável.

- **Melhoria Proposta**
  > Criar migração `00XX_sispag_audit_log.sql` com tabela `sispag_audit_log` (id, lote_id, acao, ator, ocorrido_em, detalhes JSONB, request_id). Substituir `LotePagamentoService.audit()` por um `SispagAuditRepository.registrar()` chamado dentro da mesma transação da mutação (mesma `tx` que muda o estado — atômico com o `transicionarStatus`). Manter o log estruturado para tail; a tabela é a fonte de verdade. Escrever para `IngestaoPagamentosService` e `FormacaoLotesService` (que hoje também só logam) o mesmo padrão.

- **Resultado Esperado**
  > 100% das mutações SISPAG rastreadas em tabela imutável, com `ator` (username) e `request_id` (correlacionável ao log). Consulta "quem tocou este lote e quando" vira `SELECT * FROM sispag_audit_log WHERE lote_id = $1 ORDER BY ocorrido_em`. Cobertura: 2/8 → 8/8 tipos de transição.

- **Tactic alvo**: Audit Trail
- **Severidade**: P1
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Tipos de mutação com registro persistido: 2/8 → 8/8
  - Consulta forense "quem cancelou lote X": impossível (stdout) → 1 query SQL
- **Risco de não fazer**: auditoria externa/compliance pergunta "quem autorizou o pagamento" e a resposta é "stdout dos últimos 7 dias" — inaceitável em contrato SaaSo financeiro.
- **Dependências**: alinhar com `fault-tolerance` — o audit trail também é um forensics tool. Este card resolve as duas frentes.

### [security-2] Blindar toolboxes de escrita SISPAG (`fin015`, `fin052/carregar`) com gate interno + teste ratchet

- **Problema**
  > `ConexosSispagWriteClient.criarLote`/`gerarRemessa`/`importarTitulos` e `ConexosSispagRetornoClient.carregarArquivoRetorno` são "ferramentas dormentes" que dependem do serviço de orquestração futuro chamar `env.conexosWriteEnabled` ANTES do POST. Um `/feature-new sispag` mal-executado que esqueça essa checagem dispara `.REM` real para o banco — não-idempotente, sem desfazer. Hoje o único guardião é um comentário no código.

- **Melhoria Proposta**
  > Duas camadas: (a) internalizar o gate na base — cada método de escrita desses clients recebe o `EnvironmentProvider` injetado e, se `conexosWriteEnabled=false || conexosDryRun=true`, retorna um resultado stub e loga `WRITE_SKIPPED`; (b) escrever um teste PatternGuardian que reprova qualquer serviço que resolva o WriteClient/RetornoClient sem antes chamar `getEnvironmentVars().conexosWriteEnabled` (grep AST). Espelhar a doutrina que `ConexosBaixaClient` já usa em Permutas.

- **Resultado Esperado**
  > `WRITE_SKIPPED` como default; escrita real só quando duas flags concordam. Bug de wiring nunca chega ao banco. Toolboxes com gate interno: 0/3 → 3/3.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P1
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - Toolboxes com gate interno: 0/3 → 3/3
  - Teste ratchet que reprova wiring sem gate: 0 → 1 (falha o CI)
- **Risco de não fazer**: primeira feature de escrita SISPAG em produção pode disparar `.REM` real por descuido — dinheiro sai da conta antes que alguém veja o log.
- **Dependências**: coordenar com o card `deployability` de feature-flag por tenant (mesma raiz de config).

### [security-3] Validar `.RET` (tamanho, MIME, layout CNAB) antes do upload multipart

- **Problema**
  > `carregarArquivoRetorno` aceita `Buffer` de qualquer tamanho, `fileName` arbitrário e nenhuma verificação de layout. Quando wired (Fatia 3), um arquivo malformado ou nomeado errado é roteado para `(bncCod, gtbCodSeq)` pelo NOME (TODO em `RetornoOrquestracaoService:79-81`) — baixa cai em títulos errados. `postMultipartOnce` é não-idempotente.

- **Melhoria Proposta**
  > Adicionar `Zod` no boundary de `CarregarRetornoParams`: `conteudo.length ≤ 5MB`, `fileName` com regex de nome de retorno (`^[A-Z0-9_.-]+\.RET$` ou padrão Nexxera), header CNAB240 checado (primeiros 240 bytes começam com o código do banco esperado). Rejeitar `contentType` diferente de `application/octet-stream` ou `text/plain`. Blindar antes de qualquer `postMultipartOnce`.

- **Resultado Esperado**
  > Uploads malformados falham no cliente com 400 explicativo antes de tocar o ERP. `postMultipartOnce` só executa com `.RET` sane. Validações antes do upload: 0 → 3 (tamanho, nome, header CNAB).

- **Tactic alvo**: Validate Input
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Validações antes do upload: 0 → 3
  - `.RET` para banco errado (produção): não-medível pré-wiring → 0 após teste dedicado
- **Risco de não fazer**: quando a Fatia 3 sair, um retorno adulterado ou colocado por engano na pasta dispara baixa cruzada — dinheiro do fornecedor A creditado para fornecedor B. Reconciliação manual + risco de pagamento em dobro.

### [security-4] RBAC granular nas leituras SISPAG (papel `sispag:read` ou tenant-scoping)

- **Problema**
  > `GET /sispag/painel`, `GET /sispag/lotes`, `GET /sispag/retornos`, `GET /sispag/ingestao/runs` e `GET /sispag/lotes/:id/modalidades-disponiveis` são abertas a qualquer usuário autenticado. A carteira contém credores, valores, contas pagadoras — visível para qualquer @kavex ativo. A proposta comercial exige "SSO corporativo + RBAC granular" — o modelo binário admin/user não passa em multi-tenant.

- **Melhoria Proposta**
  > Introduzir role `sispag:read` (e `sispag:write` = superset). Aplicar `requireRole('sispag:read', 'admin')` em todas as rotas GET de `/sispag/*`. Quando multi-tenant chegar (SaaSo), acrescentar `tenantId` no JWT e filtrar no `LotePagamentoRepository` (`WHERE tenant_id = $tenantId`).

- **Resultado Esperado**
  > Leituras SISPAG só para quem tem role explícita. Rotas de leitura com RBAC: 0/6 → 6/6. Preparação para multi-tenant.

- **Tactic alvo**: Limit Access, Authorize Actors
- **Severidade**: P2
- **Esforço estimado**: M (2-5d) — inclui migration `app_user_role` para role granular
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - Rotas de leitura SISPAG com RBAC: 0/6 → 6/6
  - Usuários sem `sispag:read` que veem carteira: potencialmente toda base @kavex → 0
- **Risco de não fazer**: LGPD/compliance do primeiro cliente SaaSo exige separação de leitura por área; sem RBAC granular, não fecha contrato.

### [security-5] Redigir campos sensíveis (banco, conta, docCod, titCod) nos logs de auditoria de negócio

- **Problema**
  > `LotePagamentoService.audit()` chama `LogService.info({ data: { banco, conta, docCod, titCod, ... } })` sem passar por `redactBody`. O `redact.ts` só cobre `password/token/secret/authorization` no request/response logger. Drain de logs (Render → S3/Datadog) leva número de conta corporativa e identidade de títulos em claro.

- **Melhoria Proposta**
  > Estender `redactBody` (ou criar `redactBusinessLog`) com uma segunda lista para chaves financeiras (`banco`, `conta`, `contaCorrente`, `pix`, `barCode`, `linhaDigitavel`, `cnpj`, `cpf`) — mascarar mantendo os últimos 4 dígitos (`****4242`). Aplicar em `LogService` para todos os `type = BUSINESS_INFO/BUSINESS_WARN`. Preservar `docCod`/`titCod` no audit trail persistido (F-security-1) — logs ficam com hash.

- **Resultado Esperado**
  > Nenhum número de conta bancária ou identidade completa de título no drain de logs. Ocorrências de dados sensíveis não-mascarados em stdout: 6+ → 0.

- **Tactic alvo**: Limit Access
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - Chaves financeiras em stdout sem máscara: 6+ pontos → 0
  - Cobertura de `redactBody`: 6 chaves → 15+ chaves
- **Risco de não fazer**: um leaked drain (credencial Datadog vazada em log de outro projeto @kavex) expõe agenda de pagamentos da Columbia; falso boleto direcionado.

### [security-6] Fechar deny-by-default em `DEV_AUTH_BYPASS` — exigir `environment` explícita

- **Problema**
  > `authEnv.ts:93-101` trata `environment=''` (unset) como "local", permitindo `DEV_AUTH_BYPASS=true` a passar em qualquer container onde a var falte. Um render.yaml de um novo tenant que esqueça `environment` + herança do `.env.example` liga o bypass — leituras SISPAG (sem `requireRole`) ficam abertas ao mundo (quando `SISPAG_ENABLED=true`).

- **Melhoria Proposta**
  > Inverter o guard: `DEV_AUTH_BYPASS=true` exige `environment ∈ {local, dev, development, test}` — se `environment` estiver vazia, CRASHA no boot. O único caminho seguro de bypass é setar EXPLICITAMENTE `environment=local`. Adicionar teste que garante isso.

- **Resultado Esperado**
  > Bypass silencioso em prod = impossível. Bootar sem `environment` + bypass = crash. Caminhos de missetup para auth-off: 1 → 0.

- **Tactic alvo**: Authenticate Actors, Change Default Settings
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - Caminhos de config drift → bypass silencioso: 1 → 0
- **Risco de não fazer**: durante o rollout do primeiro cliente SaaSo, uma janela de missetup expõe carteira de pagamentos sem auth.

### [security-7] Adicionar `.max()` nas strings do Zod e validar `Idempotency-Key`

- **Problema**
  > `banco`, `conta`, `docCod`, `titCod` usam `z.string().trim().min(1)` sem teto. `Idempotency-Key` chega como `req.header(...)` sem parse e vira PK em `pagamento_ingestao_idempotency`. Um admin malicioso pode encher o body/tabela com strings enormes.

- **Melhoria Proposta**
  > `banco.max(32)`, `conta.max(32)`, `docCod.max(32)`, `titCod.max(16)`. Criar `idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)` aplicado na route `/ingestao`. Rejeitar 400 quando exceder.

- **Resultado Esperado**
  > Todo string boundary com limite. Superfície de body-flood zerada.

- **Tactic alvo**: Validate Input
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-7
- **Métricas de sucesso**:
  - Campos string com `.max()`: 0/5 → 5/5
  - `Idempotency-Key` validado: não → sim
- **Risco de não fazer**: baixo hoje (rate limiter); melhor fechar antes do multi-tenant.

### [security-8] Habilitar revogação server-side de token (denylist ou refresh rotation)

- **Problema**
  > JWT HS256 é stateless — revogar `role` em `app_user` NÃO invalida tokens já emitidos. Se um admin @kavex é comprometido, ele continua podendo `POST /sispag/lotes/:id/finalizar` até o TTL expirar. Sem `jti` gravado, sem denylist.

- **Melhoria Proposta**
  > Duas opções (pick one): (a) reduzir TTL para 15 min + refresh token rotacionado (mais mudança de fluxo); (b) tabela `revoked_tokens (jti PRIMARY KEY, revoked_at, expires_at)` — `AuthService` inclui `jti` na emissão; `buildAuthMiddleware` faz SELECT em cada request; entrada expira por vacuum agendado. Opção (b) é mais simples.

- **Resultado Esperado**
  > Revogação de admin propaga em segundos, não em horas. MTTR de credencial comprometida = TTL (hoje) → <1min (revogação instantânea).

- **Tactic alvo**: Revoke Access
- **Severidade**: P2
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-security-8
- **Métricas de sucesso**:
  - Janela de exposição pós-revogação: TTL (horas) → <1min
- **Risco de não fazer**: credencial de admin comprometida (phishing) tem janela livre para finalizar lotes durante todo o TTL do token.

## 6. Notas do agente

- Cross-QA: F-security-1 (Audit Trail persistido) sobrepõe com `fault-tolerance` — a mesma tabela `sispag_audit_log` é insumo forense pós-incidente; consolidator: contar UMA vez.
- Cross-QA: F-security-2 (gate interno das toolboxes) sobrepõe com `availability` (blast radius) e `deployability` (feature-flag por tenant); o card `security-2` menciona a raiz de config compartilhada.
- Escopo: revisei EXCLUSIVAMENTE `routes/sispag.ts`, `http/sispagGate.ts`, `domain/service/sispag/*`, `domain/repository/sispag/*`, `domain/client/ConexosSispag*.ts`. Auth global (`http/auth.ts`, `http/authEnv.ts`, `http/rateLimit.ts`, `http/redact.ts`) só na parte que gate/redige SISPAG.
- Métrica não medida: nenhum ambiente de produção acessível daqui — não posso executar `curl` contra o Render para validar `sispagGate` retornando 403 na URL real. Recomendação: adicionar teste E2E que dispara `GET https://<render-url>/sispag/painel` sem JWT e espera 401 (ou 403 se SISPAG_ENABLED=false).
- Métrica não medida: número real de tokens ativos com role `admin` (Bass: janela de exposição em F-security-8) — requer query no `app_user_session` ou similar (não há sessão server-side hoje, e é justamente o findings).
