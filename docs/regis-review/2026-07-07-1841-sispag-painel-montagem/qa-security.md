---
qa: Security
qa_slug: security
run_id: 2026-07-07-1841-sispag-painel-montagem
agent: qa-security
generated_at: 2026-07-07T18:41:00-03:00
scope: backend+frontend
score: 7
findings_count: 6
cards_count: 5
---

# Security — Regis-Review

> Escopo do delta: feature **SISPAG Painel + Montagem** (Escopo II, Fatia 1+2, ADR-0015) na branch
> `feat/sispag-painel-montagem`. Backend: `migrations/0023_lote_pagamento.sql`,
> `domain/client/ConexosSispagClient.ts`, `domain/repository/sispag/LotePagamentoRepository.ts`,
> `domain/service/sispag/LotePagamentoService.ts`, `domain/service/sispag/SispagPainelService.ts`,
> `routes/sispag.ts`. Frontend: `src/frontend/app/sispag/page.tsx`, `lib/sispag.ts`. Corte da revisão
> anterior = `2026-06-26-1708`.
>
> **Cabeça da análise**: esta fatia é **read-only ao ERP** por contrato — `ConexosSispagClient` só
> chama `listGenericPaginated` (`fin064/list`, `fin015/list`, `fin010/list` com `borVldTipo=2`) e a
> escrita/execução (remessa/pasta/Nexxera/baixa) fica para Fatia 3, gated como Permutas. Isso
> **remove risco write-side do Conexos** desta entrega. O que entra é (a) uma superfície de LEITURA
> nova exibindo valores de pagamento + credor via JWT autenticado; (b) uma máquina de estado
> **LOCAL/persistida** (`lote_pagamento` + `lote_pagamento_item`) com 8 novas rotas — 3 GET
> autenticadas e 5 mutações gated por `requireRole('admin')`. Zero P0 introduzido pelo delta; os
> gaps materializam pré-flags do inbox (`pii-redact-logger`) e propagam limites conhecidos do
> single-role RBAC. **Score do delta = 7** (isolada), overall do sistema segue puxado por
> F-security-1/2/3/7 do corte anterior.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| (a) Analista com sessão admin válida (JWT 12h em `localStorage`) monta um lote candidato; (b) atacante com JWT roubado (F-security-1) tenta abusar das novas rotas `POST /sispag/lotes*` para preparar remessa de terceiros; (c) operador legítimo digita um `filCod` que não é dele | Chamadas às 8 rotas novas (`GET /sispag/painel`, `GET/POST/DELETE /sispag/lotes[...]`) + persistência em `lote_pagamento` + re-leitura autoritativa em Conexos para I2 | `routes/sispag.ts`, `LotePagamentoService`, `LotePagamentoRepository`, `ConexosSispagClient` (READ-ONLY), tabelas `lote_pagamento` + `lote_pagamento_item`, painel Next.js `app/sispag/page.tsx` | Produção (`environment=production`, `CONEXOS_WRITE_ENABLED=false`, `CONEXOS_DRY_RUN=true`) — banner visual no painel confirma modo | (i) `buildAuthMiddleware` rejeita 401 antes de qualquer handler; (ii) mutações exigem `role='admin'` (5 handlers em `routes/sispag.ts:100, 117, 142, 170`); (iii) Zod valida body/query/params em 100% das rotas com input; (iv) `ator` extraído do JWT (`req.user.sub ?? email ?? 'unknown'`) em `routes/sispag.ts:38` — **nunca do body**; (v) I4 (uma filial por lote) enforçado no service (`LotePagamentoService.ts:74-79`); (vi) advisory-lock + transação p/ I3 (não-duplicação de título entre lotes RASCUNHO); (vii) optimistic lock `versao` em toda transição de status; (viii) **read-only-to-ERP** ausente de qualquer write path — anti-drift por re-leitura em `getTituloAPagar` (`ConexosSispagClient.ts:164-194`); (ix) audit business via `LogService.info` com `{loteId, ator, ...}` em toda mutação | 0 escritas no Conexos originadas por esta feature (contrato do client); 0 SQL não-parametrizado (100% `$name`); 0 rotas de mutação sem `requireRole('admin')` (5/5); 100% de rotas com input validado por Zod (7/7 boundaries); ator NUNCA vem do body em 100% das mutações; MAS trilha de auditoria de negócio SISPAG persistida em DB = **0** (só stdout — gap F-sispag-1); redação PII do logger global cobre credor/valor = **0** (gap F-sispag-2, pré-flag `pii-redact-logger`). |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Segredos hardcoded no delta (regex `password\|secret\|token\|api[_-]?key\|credential`) | **0** | 0 | ✅ | `grep -rEn "(password\|secret\|token\|api[_-]?key\|credential)\s*[:=]\s*['\"][^'\"]{8,}"` nos 8 arquivos do delta → vazio |
| Rotas SISPAG com mutação e `requireRole('admin')` | **5/5** (`POST /sispag/lotes`, `POST /sispag/lotes/:id/itens`, `DELETE /sispag/lotes/:id/itens/*`, `POST /sispag/lotes/:id/{finalizar\|reabrir\|cancelar}` — o loop cobre 3) | 5/5 | ✅ | `routes/sispag.ts:102, 119, 144, 172` |
| Rotas SISPAG de LEITURA autenticadas (herdam `buildAuthMiddleware`) | **3/3** (`GET /sispag/painel`, `GET /sispag/lotes`, `GET /sispag/lotes/:id`) | 3/3 | ✅ | `index.ts:78` monta o auth antes de `app.use('/sispag', ...)` na linha 98 |
| Validação Zod em rotas SISPAG com input livre (body/query) | **7/7** (`criarLote`, `listLotes`, `incluirTitulo`, `versaoSchema` ×3 no loop finalizar/reabrir/cancelar + `Number.isInteger` guard em `:filCod` do DELETE) | 100% | ✅ | `routes/sispag.ts:53-67, 74, 105, 122, 148, 175` |
| SQL não-parametrizado no delta (template literal com `${var}` em SELECT/INSERT/UPDATE/DELETE) | **0** (única interpolação em `LotePagamentoRepository.ts:247-248` seleciona entre 2 STRINGS FIXAS por `setFinal:boolean`; valores via `$name`) | 0 | ✅ | `grep -rEn '\\$\{' src/backend/domain/repository/sispag/LotePagamentoRepository.ts` → 2 hits, ambos falsos-positivos (SQL fragment seletor, não dado) |
| Escritas ao Conexos (endpoints POST/PUT/DELETE) originadas por esta feature | **0** | 0 | ✅ | `ConexosSispagClient` usa apenas `listGenericPaginated`; sem `postGeneric`/`postGenericOnce`/`deleteGeneric` (`grep -n "post\|delete" src/backend/domain/client/ConexosSispagClient.ts` → 0 hits) |
| Ator (`criado_por`, `incluido_por`, `finalizado_por`) originado da REQUISIÇÃO/body | **0** (100% do `ator` vem de `req.user.sub ?? req.user.email ?? 'unknown'`) | 0 | ✅ | `routes/sispag.ts:38` (helper `ator()`); usado em `:111, :132, :159, :187` |
| I4 (uma filial por lote) enforçado no service antes da persistência | **presente** | presente | ✅ | `LotePagamentoService.ts:73-79` (`if (lote.filCod !== input.filCod) throw LoteFilialError`) |
| Frontend XSS surface no delta (`dangerouslySetInnerHTML` / `.innerHTML`) | **0** | 0 | ✅ | `grep -rEn 'dangerouslySetInnerHTML\|\.innerHTML' src/frontend/app/sispag src/frontend/lib/sispag.ts` → vazio |
| Auditoria de negócio SISPAG **persistida em tabela** (paralelo ao `permuta_alocacao_execucao`) | **0** — `LogService.info` só grava em `process.stdout` (`LogService.ts:26`); nenhuma migration `sispag_lote_audit` ou similar | tabela persistida (SOX-like, retenção ≥1 ano) | ❌ | `LotePagamentoService.ts:283-293` (audit → `logService.info`); `LogService.ts:19-27` (writeLog → stdout); `grep -rn "sispag_.*_audit\|lote_pagamento_audit" src/backend` → 0 hits |
| Redação PII no logger global cobre credor/valor/CNPJ (chaves financeiras) | **0/N** (`DEFAULT_SENSITIVE_KEYS` = password/senha/token/authorization/secret/api_key/apikey/jwt/access/refresh — nenhum inclui credor/valor/cnpj/dpeNomPessoa) | inclui credor/valor/cnpj/nome | ❌ | `http/redact.ts:10-22`; concern pré-flagada em `ontology/_inbox/sispag-context-map.md:145-146` (`pii-redact-logger`) e `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md:9` (sec-4) — MATERIALIZA nesta fatia |
| Response body logging no error path do `errorMiddleware` / respondLoteError | logs no drain só se `res.statusCode >= 400` (`index.ts:53-54`); `respondLoteError` devolve `err.details` (identifiers, não PII) → seguro | seguro | ✅ | `routes/sispag.ts:41-51` + `index.ts:53-54` |
| Autorização escopada por FILIAL do usuário (user↔filCod mapping) | **ausente** — admin pode criar lote para qualquer `filCod` que o body traga | mapping user→filiais e gate por role | ⚠️ | `routes/sispag.ts:100-113` (POST /lotes usa `filCod` do body sem verificar direito do usuário sobre a filial) |
| GET /sispag/lotes/:id com gate de ownership/filial | **ausente** — qualquer usuário autenticado com o UUID acessa o lote | filtro server-side por `tenant`/user | ⚠️ | `routes/sispag.ts:85-97` (só depende de auth); UUID v4 mitiga enumeração mas não substitui gate |
| Fallback silencioso do `ator` para string `'unknown'` | **presente** (`req.user?.sub ?? req.user?.email ?? 'unknown'`) | falhar-fechado (401) se `req.user` ausente | ⚠️ | `routes/sispag.ts:38`; se `buildAuthMiddleware` alguma vez for bypass-ado ou seu contrato mudar, a mutação persiste como `unknown` sem auditor identificável |
| Idempotência da inclusão de item (mesma `(loteId, filCod, docCod, titCod)` re-enviada) | **presente** (UNIQUE + `ON CONFLICT DO NOTHING`) | presente | ✅ | `migrations/0023_lote_pagamento.sql:42` + `LotePagamentoRepository.ts:185` |
| Guard de estado em transições (não reabrir CANCELADO, não incluir em FINALIZADO) | **presente** (state-machine tipada, guarda por status antes de qualquer mutation) | presente | ✅ | `LotePagamentoService.ts:66-72, 156-162, 184-207, 216-221` |

> ⚠️ **Não medível localmente**: comportamento real do logger em prod (drain do Render) — só reproduzimos localmente; taxa de 401/403 no `/sispag/*`; presença de WAF entre Vercel e Render. Precisa CloudWatch/Datadog ou equivalente.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Herdado do run anterior (`http/auth.ts:167-170` `console.warn` 401/403). Delta não regride nem adiciona. | ⚠️ parcial | herdado |
| Detect Service Denial | Delta herda `globalLimiter` (100/min por IP) via `app.use('/sispag', ...)` após `app.use(globalLimiter)` no `index.ts:32`. Sem limiter estrito próprio (não é rota de fan-out ao ERP na leitura de painel; a agregação já é `Promise.allSettled` interna). | ✅ presente (herdado) | `index.ts:32, 98` |
| Verify Message Integrity | JWT HS256/JWKS verificado por request (`buildAuthMiddleware`); optimistic lock `versao` em `transicionarStatus` fecha race entre 2 analistas (I6); advisory lock por `(filCod:docCod:titCod)` fecha race na inclusão do MESMO título em lotes concorrentes (I3) | ✅ presente | `LotePagamentoRepository.ts:231-258`, `LotePagamentoService.ts:60-152` |
| Detect Message Delay | N/A (fluxo síncrono request/response; sem fila crítica nesta fatia) | N/A | — |
| Identify Actors | `req.user.sub`/`email` propagado como `ator` em 100% das mutações e persistido em `criado_por`/`incluido_por`/`finalizado_por` | ✅ presente | `routes/sispag.ts:38, 111, 132, 159, 187`; `migrations/0023_lote_pagamento.sql:19-21, 39` |
| Authenticate Actors | Rotas SISPAG montadas APÓS `buildAuthMiddleware` (`index.ts:78, 98`). Sem exceção. | ✅ presente | `index.ts:78, 98` |
| Authorize Actors | Toda mutação com `requireRole('admin')` (5/5). LEITURAS abertas a qualquer autenticado (política do sistema). **MAS** único role `admin` (herdado F-security-2) — sem maker/checker, e sem gate por filial do usuário | ⚠️ parcial | `routes/sispag.ts:102, 119, 144, 172`; F-sispag-3 |
| Limit Access | Auth global + RBAC nas mutações + I4 (agregado uma-filial) + I3 (não-duplicação entre lotes RASCUNHO). MAS gate de FILIAL do usuário ausente. | ⚠️ parcial | idem |
| Limit Exposure | Contrato READ-ONLY do `ConexosSispagClient` elimina risco write-side do ERP nesta fatia. **MAS** o response do painel carrega credor + valor + doc — se ativado o log de body 200 no futuro (hoje só ≥400), vaza sem redação. Redator não cobre credor/valor (`http/redact.ts:10-22`). | ⚠️ parcial | `ConexosSispagClient.ts` (só `listGenericPaginated`); `http/redact.ts:10-22`; F-sispag-2 |
| Encrypt Data | TLS ambiente (Render/Vercel/Supabase); segredos fora do repo (herdado); DB Supabase com TLS pooler | ✅ presente (herdado) | herdado |
| Separate Entities | Herdado — single-tenant hoje. Delta adiciona 2 tabelas (`lote_pagamento`, `lote_pagamento_item`) SEM coluna `tenant_id` — quando o 2º cliente for onboardado, este é MAIS um site que precisa refatoração para multi-tenant. | ❌ ausente | `migrations/0023_lote_pagamento.sql` — sem `tenant_id`; cross-ref F-security-7 |
| Change Default Settings | `CONEXOS_WRITE_ENABLED=false`/`DRY_RUN=true` refletidos no banner do painel (`SispagPainelService.ts:73-78`); status default `RASCUNHO` (não-executável); versao default 1 | ✅ presente | `migrations/0023_lote_pagamento.sql:17-23`; `page.tsx:249-263` |
| Validate Input | Zod em body/query/params (`criarLoteSchema`, `listLotesSchema`, `incluirTituloSchema`, `versaoSchema`) + guard `Number.isInteger` no `:filCod` do DELETE + trim/min(1) em strings. `.strict()` NÃO aplicado — passthrough de campos extra é ignorado (safe: valores extras não se propagam ao SQL) | ✅ presente | `routes/sispag.ts:53-67, 148` |
| Revoke Access | Herdado — logout FE-only, sem denylist `jti` (F-security-1). Aplicável integralmente a `/sispag/*`. | ❌ ausente | herdado |
| Lock Computer | Herdado — sem lockout por conta (F-security-4). | ❌ ausente | herdado |
| Inform Actors | `respondLoteError` devolve `err.code`, `err.userMessage`, `err.details`, `requestId` — mensagens categorizadas por erro de domínio (`LoteEstadoInvalidoError`, `LoteFilialError`, `LoteVersaoConflitoError`, `TituloEmOutroLoteError`, `TituloNaoElegivelError`). Toast pt-BR no FE (`page.tsx:201-217, 227-232`) | ✅ presente | `routes/sispag.ts:41-51`; `page.tsx` toasts |
| Restore | Optimistic lock permite reprocessar transições sem duplicar efeito; PITR Supabase (herdado). Fatia read-only ao ERP = zero necessidade de compensating write | ✅ presente | `LotePagamentoRepository.ts:231-258` |
| Audit Trail | Toda ação de negócio (`criarLote`, `incluirTitulo`, `removerTitulo`, `finalizar`/`reabrir`/`cancelar`) chama `LogService.info` com `{loteId, ator, ...ids}`. **MAS**: destino final é `process.stdout` (`LogService.ts:26`) — retenção ~7d Render Starter. Não há tabela persistida `sispag_lote_audit` paralela a `permuta_alocacao_execucao`. As colunas `finalizado_por`/`finalizado_em` na raiz cobrem o gate final (I5), mas não a trilha completa de eventos intermediários (inclusões/remoções/reaberturas) | ⚠️ parcial | `LotePagamentoService.ts:283-293`; `LogService.ts:19-27`; F-sispag-1 |

## 4. Findings (achados)

### F-sispag-1: Auditoria de negócio SISPAG não persistida em tabela — vive só em stdout (retenção ~7d)

- **Severidade**: P1
- **Tactic violada**: Audit Trail / Detect Intrusion (correlação forense)
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:283-293` (5 sites chamando `this.audit(...)`), `src/backend/domain/service/LogService.ts:19-27` (writeLog → `process.stdout.write`), `src/backend/migrations/0023_lote_pagamento.sql` (não há tabela audit)
- **Evidência (objetiva)**:
  ```
  LotePagamentoService.ts:283-293
    private audit = (acao, loteId, ator, extra) =>
        this.logService.info({ type: LOG_TYPE.BUSINESS_INFO,
                               message: `SISPAG lote: ${acao}`,
                               data: { loteId, ator, ...extra } });

  LogService.ts:19-27
    private writeLog = async (input) => {
        process.stdout.write(`${JSON.stringify(logBody)}\n`);   // ← stdout, sem DB
    }

  grep -rn "sispag_.*_audit\|lote_pagamento_audit" src/backend  → 0 hits
  ```
  Permutas TEM tabela persistida (`permuta_alocacao_execucao` — migration 0015) para o mesmo tipo de ação. SISPAG não tem paralelo.
- **Impacto técnico**: reconstruir "quem incluiu o título T no lote L em D-30" depende do drain do Render (retenção ~7d Starter). Reabrir/cancelar um lote candidato depois de FINALIZADO é uma ação sensível e reversa — sem trilha persistida, um operador legítimo (ou credencial vazada, F-security-1) pode reverter o gate sem rastro persistente após uma semana.
- **Impacto de negócio**: SISPAG é o pré-estágio da remessa bancária. Ainda que a fatia atual não escreva no ERP, o lote FINALIZADO **é o gatilho conceitual** para a próxima fatia (remessa/pagamento). Um regulator/auditor (SOX-like, LGPD trilha de acesso) exige rastro persistente de "quem incluiu X no lote que virou remessa Y". Compliance financeiro fica descoberto.
- **Métrica de baseline**: rotas SISPAG com auditoria persistida em DB = **0/5** mutações; tabela `sispag_*_audit` = **0**; retenção da trilha = **~7d (drain Render)** vs alvo ≥365d.

### F-sispag-2: Logger global sem redação de PII financeira (credor/valor/cnpj) — pré-flag `pii-redact-logger` materializa com SISPAG

- **Severidade**: P2 (LATENTE nesta fatia; vira P1 quando o response body 200 for logado ou quando Fatia 3 trouxer dados bancários)
- **Tactic violada**: Limit Exposure / Encrypt Data (data-at-log)
- **Localização**: `src/backend/http/redact.ts:10-22` (DEFAULT_SENSITIVE_KEYS), `src/backend/index.ts:40-58` (request/response logger), `ontology/_inbox/sispag-context-map.md:145-146` (pré-flag), `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md:9` (sec-4)
- **Evidência (objetiva)**:
  ```
  http/redact.ts:10-22
    DEFAULT_SENSITIVE_KEYS = ['password','senha','token','accesstoken',
                              'refreshtoken','authorization','secret',
                              'api_key','apikey','jwt']
    // ↑ NÃO inclui credor, valor, dpeNomPessoa, cnpj, doc_federal, pesCod

  index.ts:53-54  // response body só é logado em statusCode >= 400 (OK — mitiga hoje)
                    if (res.statusCode >= 400) console.log(`[RES] ... body=...`)

  sispag-context-map.md:145
    "LGPD: o logger global imprime body cru — pré-sinalizado (pii-redact-logger, sec-4)
     como vetor QUANDO valores/dados bancários do SISPAG entrarem."
  ```
- **Impacto técnico**: hoje a superfície é atenuada porque (a) request bodies em `/sispag/*` só carregam identifiers (`filCod`, `docCod`, `titCod`, `banco`, `conta`), sem PII de credor/valor, e (b) response bodies só são logados em erro (4xx/5xx). A Fatia 3 (remessa/pagamento) vai trazer **valores + CNPJ + dados bancários no request** (payload da remessa a enviar). Um refactor de logging (e.g., alterar `>=400` para sempre logar) faria vazar credor/valor do painel imediatamente. A pré-flag no inbox já sinalizava que este é o momento de endurecer.
- **Impacto de negócio**: LGPD — o drain do Render passa a conter dados de pagamento identificáveis. Terceiros com acesso ao Render (operações, suporte, ex-devs com token válido) veem sem controle formal.
- **Métrica de baseline**: chaves financeiras redigidas hoje = **0** (`credor`, `valor`, `dpeNomPessoa`, `cnpj`); risco materializa em **T-0 dias** assim que Fatia 3 fluir com body de remessa; alvo = redator estendido antes da Fatia 3 mergear.

### F-sispag-3: Autorização não escopada por filial do usuário — admin cria lote para qualquer `filCod` do body

- **Severidade**: P2 (herda F-security-2; a Fatia adiciona superfície nova onde o gap se manifesta)
- **Tactic violada**: Authorize Actors (granularidade) / Limit Access
- **Localização**: `src/backend/routes/sispag.ts:100-113` (POST /sispag/lotes), `src/backend/routes/sispag.ts:117-139` (POST /sispag/lotes/:id/itens), `src/backend/migrations/0007_app_user.sql:8` (único role `admin`, sem coluna de filiais permitidas)
- **Evidência (objetiva)**:
  ```
  routes/sispag.ts:53-57
    const criarLoteSchema = z.object({
        filCod: z.coerce.number().int().positive(),  // ← vem do body, sem gate
        banco: z.string().trim().min(1).optional(),
        conta: z.string().trim().min(1).optional(),
    });

  routes/sispag.ts:100-113
    router.post('/lotes', requireRole('admin'), ...  // só valida role, não filial

  migrations/0007_app_user.sql:8
    role TEXT NOT NULL DEFAULT 'admin'   // sem app_user_filial ou similar
  ```
- **Impacto técnico**: `admin` da filial X pode criar/finalizar lote para filCod=Y só passando Y no body. O I4 do agregado (uma filial por lote) impede MISTURAR filiais dentro de UM lote, mas não impede um usuário de operar em filial que não é sua. O confused-deputy fix de Permutas (`requireOwnBorderoFilCod` — F-security-2 do run anterior mitigou lá) NÃO tem paralelo em SISPAG porque o `filCod` do lote vem do body, não de uma trilha pré-existente.
- **Impacto de negócio**: quando o SaaSo evoluir para múltiplos operadores em múltiplas filiais (do mesmo cliente OU de tenants diferentes), qualquer conta admin fecha o ciclo em qualquer filial. Bloqueia SoD por filial.
- **Métrica de baseline**: user→filiais mapping table = **0**; mutações SISPAG com gate por filial = **0/5**; roles distintos com filiais restritas = **0** (herda F-security-2 = 1 role global).

### F-sispag-4: GET /sispag/lotes/:id sem gate de ownership — qualquer autenticado com o UUID vê o lote

- **Severidade**: P3 (mitigado por UUID v4 randomUUID — ~10^38 combinações, enumeração inviável; mas defesa-em-profundidade ausente)
- **Tactic violada**: Limit Access
- **Localização**: `src/backend/routes/sispag.ts:85-97`
- **Evidência (objetiva)**:
  ```
  routes/sispag.ts:85-97
    router.get('/lotes/:id', asyncHandler(async (req, res) => {
        // sem requireRole, sem filter por criador/filial do req.user
        const lote = await service.getLote(String(req.params.id));
        if (!lote) { res.status(404).json({ error: 'lote not found' }); return; }
        res.json({ lote });   // ← devolve credor+valor de todos os itens
    }))
  ```
  UUID v4 (`randomUUID` em `LotePagamentoRepository.ts:87`) mitiga enumeração probabilística. Mas qualquer forma de vazamento de UUID (email, log, tela compartilhada) permite acesso lateral.
- **Impacto técnico**: um analista da filial X que consiga o UUID de um lote da filial Y (via captura de tela, log copiado) lê credor + valor snapshot dos itens. GET /sispag/lotes (list) também não tem tenant filter — hoje é single-tenant, portanto retorna tudo.
- **Impacto de negócio**: baixo hoje (single-tenant, poucas contas). Vira P1 no momento em que o 2º tenant entra ou quando existirem >2 filiais com times distintos.
- **Métrica de baseline**: filtros server-side na query da lista de lotes = **0** (só `status` e `filCod` OPCIONAIS por query, não FORÇADOS por usuário); UUID guessing feasibility = **~0** (2^122 espaço), mas a defesa não é gate.

### F-sispag-5: Fallback silencioso do `ator` para string literal `'unknown'` — se auth quebrar, mutação persiste sem auditor

- **Severidade**: P3
- **Tactic violada**: Identify Actors (falha-aberto para o audit)
- **Localização**: `src/backend/routes/sispag.ts:38`
- **Evidência (objetiva)**:
  ```
  routes/sispag.ts:38
    const ator = (req: Request): string =>
        req.user?.sub ?? req.user?.email ?? 'unknown';
  ```
  Hoje `buildAuthMiddleware` garante `req.user` presente (rejeita 401 antes). Mas se um dia (a) `DEV_AUTH_BYPASS=true` for setado em algum env pós-fix, (b) uma rota future for montada ANTES do middleware, ou (c) o contrato de `req.user` mudar (e.g., `role` sem `sub`/`email`), a persistência aceita `'unknown'` como ator legítimo e o audit fica sem identidade.
- **Impacto técnico**: silent audit-poisoning. Row com `criado_por='unknown'` ou `finalizado_por='unknown'` passa como se fosse um usuário real chamado "unknown" — cortex forense fica cego.
- **Impacto de negócio**: se o fluxo de auth quebrar em produção, o sistema continua aceitando lotes sem trilha auditável — pior que fail-closed.
- **Métrica de baseline**: fallback fail-open no ator = **1 site**; alvo = **0** (rejeitar com 401 se `req.user` ausente).

### F-sispag-6: Tabelas `lote_pagamento` / `lote_pagamento_item` sem coluna `tenant_id` — mais 2 sites p/ refatorar no roadmap SaaSo

- **Severidade**: P3 (débito arquitetural conhecido; ainda single-tenant)
- **Tactic violada**: Separate Entities
- **Localização**: `src/backend/migrations/0023_lote_pagamento.sql:10-53`
- **Evidência (objetiva)**:
  ```
  migrations/0023_lote_pagamento.sql
    CREATE TABLE IF NOT EXISTS lote_pagamento (
        id UUID PRIMARY KEY, fil_cod INTEGER NOT NULL, ...
        -- SEM tenant_id
    );
    CREATE TABLE IF NOT EXISTS lote_pagamento_item (
        ... fil_cod INTEGER NOT NULL, ...
        -- SEM tenant_id
    );
  ```
- **Impacto técnico**: acresce ao inventário de tabelas que precisarão de coluna `tenant_id` + `WHERE tenant_id = $tenant` em toda query no dia da migração multi-tenant (card [security-6] do run anterior).
- **Impacto de negócio**: cada tabela nova single-tenant aumenta o escopo (e o risco) da migração futura. Se prevermos SaaSo real em prazo <6 meses, endereçar isso *antes* dos dados escalarem é mais barato.
- **Métrica de baseline**: novas tabelas SISPAG sem `tenant_id` = **2** (`lote_pagamento`, `lote_pagamento_item`); alvo = **0** (adicionar já como NULLABLE + backfill quando o 2º tenant chegar) OU aceitar como parte de [security-6].

## 5. Cards Kanban

### [security-sispag-1] Persistir audit trail de negócio SISPAG em tabela dedicada

- **Problema**
  > `LotePagamentoService.audit` (`LotePagamentoService.ts:283-293`) chama `LogService.info` que grava só em `process.stdout` (`LogService.ts:26`). Não há tabela paralela ao `permuta_alocacao_execucao` para SISPAG. Retenção da trilha depende do drain do Render (~7d Starter). Um regulator/auditor pedindo "quem incluiu o título T no lote que virou remessa Y há 3 meses" fica sem resposta. Compliance financeiro (SOX-like) exige rastro persistido.

- **Melhoria Proposta**
  > Migration `0024_sispag_lote_audit(id, ts, lote_id, acao, ator, request_id, extra JSONB)` com índices `(lote_id, ts)` e `(ts)`. `LotePagamentoService.audit` grava linha na tabela DENTRO da mesma transação da mutação (para não perder evento em crash pós-mutation). Manter `LogService.info` em paralelo (drain como fallback rápido). Tactic Bass: Audit Trail.

- **Resultado Esperado**
  > Toda ação SISPAG rastreável em SQL por ≥365d. **Métrica**: linhas persistidas por ação = 0 → 1; retenção efetiva = ~7d → **≥365d** (Supabase).

- **Tactic alvo**: Audit Trail
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-sispag-1
- **Métricas de sucesso**:
  - Ações SISPAG com row persistida em `sispag_lote_audit`: 0/5 → **5/5**
  - Retenção: ~7d (drain) → **≥365d** (DB)
  - Tempo para responder "quem finalizou o lote L em D-30": grep em drain (impossível) → SQL (segundos)
- **Risco de não fazer**: Fatia 3 (remessa) herda esse mesmo padrão só-stdout; auditor externo bloqueia certificação; incidente de sessão vazada (F-security-1) reverte lote sem rastro.
- **Dependências**: alinha com card `[security-3]` do run anterior (audit de auth); ideal fazer as duas tabelas juntas.

### [security-sispag-2] Estender `redactBody` com chaves financeiras (credor, valor, cnpj, dpeNomPessoa, pesCod, doc_federal) antes de Fatia 3

- **Problema**
  > `http/redact.ts:10-22` só cobre chaves de credencial (`password`, `token`, `authorization`, ...). Hoje o response body só é logado em `≥400` (`index.ts:53-54`), o que MITIGA a fatia atual. Mas a Fatia 3 (remessa/pagamento) vai carregar valor + CNPJ + dados bancários no request body (payload de remessa), e um refactor futuro do logger pode inverter a política de log de body 200. A pré-flag `pii-redact-logger` (sec-4) do inbox marca este exato momento como o que endurecer.

- **Melhoria Proposta**
  > Adicionar em `DEFAULT_SENSITIVE_KEYS`: `credor`, `valor`, `valorTotal`, `dpeNomPessoa`, `dpeNomPessoaFor`, `cnpj`, `cpf`, `docFederal`, `filDocFederal`, `pesCod`, `contaCorrente`, `agencia`. Cobrir também variações camelCase/snake_case (já é case-insensitive por design). Adicionar teste unitário com um payload sintético de remessa. Documentar no ADR-0011 (`ontology/decisions/0011-api-hardening-rbac-log-redaction.md`) o novo escopo. Tactic Bass: Limit Exposure.

- **Resultado Esperado**
  > Body de request/response em rota financeira, quando logado, jamais expõe credor/valor/CNPJ. **Métrica**: chaves financeiras cobertas por `redactBody`: 0 → **≥8**.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2 (proativo — sobe para P1 no dia que Fatia 3 mergear sem isso)
- **Esforço estimado**: S
- **Findings relacionados**: F-sispag-2
- **Métricas de sucesso**:
  - Chaves financeiras em DEFAULT_SENSITIVE_KEYS: 0 → **≥8**
  - Teste unitário cobrindo payload de remessa sintético: 0 → **1**
- **Risco de não fazer**: Fatia 3 vaza valor + CNPJ + dados bancários no drain do Render assim que uma remessa real subir. LGPD violado.
- **Dependências**: nenhuma — deve ser aterrissado ANTES da Fatia 3 mergear.

### [security-sispag-3] Escopar autorização de mutações SISPAG por filial do usuário

- **Problema**
  > `POST /sispag/lotes` (`routes/sispag.ts:100-113`) e `POST /sispag/lotes/:id/itens` (`:117-139`) aceitam `filCod` do body sem checar se o usuário tem direito de operar naquela filial. `requireRole('admin')` só verifica a role, não a filial. Uma vez que existam múltiplos operadores em múltiplas filiais, admin de X pode montar/finalizar lote de Y. Herda F-security-2 do run anterior mas em superfície nova.

- **Melhoria Proposta**
  > Migration `app_user_filial(user_id, fil_cod)` (many-to-many). Helper `requireUserFilCod(req, filCod): void` que valida `req.user.sub ∈ app_user_filial[fil_cod]` — 403 se não. Aplicar em toda mutação SISPAG que aceite `filCod` do request. Roles adicionais (`analyst`, `approver`) do card `[security-2]` do run anterior herdam este mesmo gate. Tactic Bass: Authorize Actors (escopo).

- **Resultado Esperado**
  > Usuário não pode operar em filial que não é dele mesmo com role `admin`. **Métrica**: mutações SISPAG com gate por filial: 0/5 → **5/5**.

- **Tactic alvo**: Authorize Actors (escopo)
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-sispag-3, F-security-2 (herdado)
- **Métricas de sucesso**:
  - Mutações SISPAG com gate por filial: 0/5 → **5/5**
  - Tabela `app_user_filial` criada e populada: 0 → 1
  - Endpoints devolvendo 403 quando user opera fora da filial (teste): 0 → **≥3 casos**
- **Risco de não fazer**: SoD por filial fica descoberto; qualquer conta admin fecha o ciclo em qualquer filial. Bloqueia expansão do produto para múltiplos operadores.
- **Dependências**: alinhamento com card `[security-2]` do run anterior (roles granulares) — os dois avançam juntos.

### [security-sispag-4] Fail-closed no `ator`: 401 se `req.user` ausente em vez de literal `'unknown'`

- **Problema**
  > `routes/sispag.ts:38` fallback silencioso `req.user?.sub ?? req.user?.email ?? 'unknown'`. Se o auth quebrar (bypass acidental, refactor, mudança de contrato do JWT), lote persiste com `criado_por='unknown'` — audit-poisoning silencioso.

- **Melhoria Proposta**
  > Helper `requireAtor(req): string` que devolve `sub`/`email` OU lança `HandlerError(401)` explícito. Trocar as 5 chamadas de `ator(req)` em `routes/sispag.ts`. Aplicar mesmo padrão nas próximas rotas de escrita da Fatia 3. Tactic Bass: Identify Actors.

- **Resultado Esperado**
  > Nenhuma mutação persiste com identidade `'unknown'`. **Métrica**: rotas com fallback silencioso do ator: 5 → **0**.

- **Tactic alvo**: Identify Actors
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-sispag-5
- **Métricas de sucesso**:
  - Rotas SISPAG com fail-closed no ator: 0/5 → **5/5**
  - Testes cobrindo `req.user` ausente devolvendo 401: 0 → **≥1**
- **Risco de não fazer**: quebra de auth pontual gera audit sem identidade real; investigação forense fica cega.
- **Dependências**: nenhuma.

### [security-sispag-5] Adicionar `tenant_id` (nullable) em `lote_pagamento` + `lote_pagamento_item` — preparação p/ multi-tenant

- **Problema**
  > `migrations/0023_lote_pagamento.sql` não cria coluna `tenant_id`. Mais 2 sites que precisarão refatoração no dia D do onboarding do 2º cliente. Compõe com F-security-7 do run anterior.

- **Melhoria Proposta**
  > Migration incremental `0024_sispag_tenant_id(tenant_id TEXT NULL)` nas duas tabelas + índice `(tenant_id, fil_cod)`. Repository preenche `tenant_id` a partir de `EnvironmentProvider.getEnvironmentVars().clientName`. Adicionar ao `PatternGuardian` verificação futura de "toda query SISPAG contém filtro tenant_id" quando o gate multi-tenant for ativado (parte de [security-6] do run anterior). Tactic Bass: Separate Entities.

- **Resultado Esperado**
  > Superfície SISPAG pronta para o cutover multi-tenant sem migration em big-bang. **Métrica**: tabelas novas do delta sem `tenant_id`: 2 → **0**.

- **Tactic alvo**: Separate Entities
- **Severidade**: P3
- **Esforço estimado**: S (delta atual) — o gate global é XL e faz parte de [security-6]
- **Findings relacionados**: F-sispag-6, F-security-7 (herdado)
- **Métricas de sucesso**:
  - Tabelas SISPAG com `tenant_id` disponível: 0/2 → **2/2**
  - Queries repository com filtro por tenant: 0 → preparadas (dormente até o gate ligar)
- **Risco de não fazer**: soma 2 tabelas ao big-bang do cutover multi-tenant, aumentando esforço/risco.
- **Dependências**: card `[security-6]` do run anterior (decisão macro sobre timing SaaSo).

## 6. Notas do agente

- **Decisões de escopo**: revisão focada nos 8 arquivos do delta + o mount no `index.ts:98` + interações com `LogService`, `redactBody`, `buildAuthMiddleware`, `requireRole`. Não re-audito o resto do sistema — assumo o baseline do run `2026-06-26-1708` (score 6, F-security-1..11). Os cards deste run **NÃO reabrem** o inbox de segurança do run anterior — só levantam achados específicos da fatia SISPAG.
- **Read-only-to-ERP confirmado**: `ConexosSispagClient` só usa `listGenericPaginated` (`fin064/list`, `fin015/list`, `fin010/list`); `grep -n "post\|delete\|put" src/backend/domain/client/ConexosSispagClient.ts` → 0 hits. Contrato explícito no docstring (`Escrita FICA FORA deste client — Fatia 3, gated`). Isso remove por construção o risco write-side do ERP nesta entrega.
- **SQL injection**: única interpolação de template literal em `LotePagamentoRepository.ts:247-248` é um **seletor de fragmento SQL FIXO** por `setFinal:boolean` (não interpola dado do usuário). Os valores continuam vindo por `$name` (`SqlBuilder`). Sem risco.
- **PII-redact-logger materializa aqui**: o inbox (`sispag-context-map.md:145-146`, `permutas-painel-elegiveis-regis-followups.md:9`) já sinalizava. A fatia atual **NÃO expõe PII** por acidente (response body só logado em ≥400, request body não carrega PII sensível), mas **essa é exatamente a hora** de endurecer o redator antes da Fatia 3 chegar com CNPJ + valores no request de remessa. Card `[security-sispag-2]` é proativo — P2 hoje, P1 no PR da Fatia 3 se não for feito.
- **Cross-QA**:
  - **Fault Tolerance** — F-sispag-1 (audit trail persistente) é COMPARTILHADA: a mesma tabela `sispag_lote_audit` alimenta forense de segurança E recovery de fault tolerance. Consolidar num único card.
  - **Availability** — F-sispag-6 (tenant_id) compõe com F-security-7 do run anterior (blast radius cross-tenant). Consolidar como parte do card `[security-6]` do run anterior.
  - **Integrability** — validação Zod nos boundaries (100%) cross-checa contrato Conexos (fin064/fin015/fin010 via `passthrough()` — tolerante a novos campos). Sem regressão de segurança por schema evolution.
  - **Deployability** — banner de modo no painel (`page.tsx:249-263`) mostra `conexosWriteEnabled` + `conexosDryRun` — defesa em profundidade para o operador visualizar que a Fatia atual é read-only. Cross-ref card `[deployability-*]` (banners de env).
- **Score do delta = 7/10**: sobe 1 ponto vs baseline (6) porque a fatia é **read-only ao ERP** (elimina risco write-side por construção) e **100% dos boundaries têm Zod + RBAC**. Não sobe mais porque (a) F-sispag-1 (audit em stdout) é um GAP novo em superfície de escrita local, (b) F-sispag-2 (pii-redact) precisa endurecer AGORA para não vazar na Fatia 3, e (c) herda os débitos de F-security-1/2/7 do run anterior sem mitigar nenhum deles.
