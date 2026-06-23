---
qa: Security
qa_slug: security
run_id: 2026-06-23-1518
agent: qa-security
generated_at: 2026-06-23T18:18:00-03:00
scope: backend
score: 6.5
findings_count: 9
cards_count: 9
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

Fase 3 introduz o **primeiro caminho de escrita do sistema no ERP Conexos** (`fin010` — baixa/permuta de adiantamento). É a primeira mutação irreversível-por-nós que sai do produto (estorno só na UI do `fin010`). O cenário canônico:

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Ator interno (analista logado) ou ator hostil de posse de credenciais válidas | `POST /permutas/adiantamentos/:docCod/reconciliar` com `dryRun:false` | `ReconciliacaoPermutaService` + `ConexosClient` (handshake fin010 de 5 chamadas) + `permuta_alocacao_execucao` | Produção multi-tenant, escrita para o ERP destino do cliente (Columbia Trading), default-deny via flags de env (`CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) | Confirma identidade (JWT), confirma role (`admin`), confirma write enabled, registra intenção (`reconciling`) ANTES do POST, gravata baixa só após `bxaCodSeq` do ERP, registra trilha completa em `permuta_alocacao_execucao` (idempotency_key UNIQUE) | 0 baixas duplicadas; 0 baixas sem confirmação `bxaCodSeq`; 0 escritas reais sem `CONEXOS_WRITE_ENABLED=true E CONEXOS_DRY_RUN=false`; 100% dos POSTs `/reconciliar` autenticados + role-checked; nenhum segredo do Conexos vazado em log |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| `# rotas mutacionais com requireRole('admin')` | 8/8 (incluindo `/reconciliar`) | 100% das mutações | ✅ | `src/backend/routes/permutas.ts:91,129,190,212,260,302,331,361` |
| `# rotas `/reconciliar` validadas com Zod no body` | 1/1 | 100% | ✅ | `src/backend/routes/permutas.ts:31-36,365` |
| `# SQL com interpolação de string em PermutaExecucaoRepository` | 0 (100% parametrizado, named-params) | 0 | ✅ | `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:57-186` |
| `# segredos hardcoded no diff` | 0 | 0 | ✅ | `git diff HEAD~1 HEAD -- src/backend/` |
| `# flags de guarda do write` | 2 (`CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN`) | ≥2 default-deny | ✅ | `src/backend/domain/libs/environment/model/EnvironmentVars.ts:35-36`; `EnvironmentProvider.ts:69-70,96-97` |
| Default-deny: write ligada por default? | NÃO (default writeEnabled=false E dryRun=true) | NÃO | ✅ | `EnvironmentProvider.ts:69-70` |
| `# campos sensíveis logados em REQ/RES global` | 0 — `redactBody` cobre password/token/etc | 0 | ✅ | `src/backend/http/redact.ts:10-21`; `index.ts:39-58` |
| `# pontos onde `request_payload` (com `pesCod`, `dpeNomPessoa` do fornecedor) é logado fora do DB | 1 (`logService.info` no dry-run, payload inteiro como `data`) | 0 — logar só identificadores | ⚠️ | `ReconciliacaoPermutaService.ts:114-118` |
| `# pontos onde `erpResponse` cru é gravado em log estruturado | 0 (gravado em JSONB no banco; logService recebe só `mensagem` no error path) | 0 | ✅ | `ReconciliacaoPermutaService.ts:143-147` |
| `# pontos onde o body completo da chamada Conexos é logado em stdout | 1 — `console.log('[CONEXOS →] body=…')`, com `redactSensitive`; payload do fin010/baixas (sem chaves sensíveis) sai EM CLARO | n/a — ver finding F-security-2 | ⚠️ | `src/backend/services/conexos.ts:88` |
| RBAC server-side aplicado a `/reconciliar` | ✅ `requireRole('admin')` | obrigatório | ✅ | `src/backend/routes/permutas.ts:361` |
| Idempotency-Key como trust boundary no POST `/reconciliar` | NÃO usada — chave derivada server-side (`permuta:{adto}:{invoice}`) | server-side derivada | ✅ | `ReconciliacaoPermutaService.ts:342-343`; `routes/permutas.ts:359-381` (não há leitura de header) |
| Coupling do `executadoPor` com identidade autenticada | `req.user?.sub ?? req.user?.email ?? 'unknown'` | identidade autenticada | ✅ | `routes/permutas.ts:371` |
| Tenant scoping nos writes | `filCod` derivado do `adto` em Postgres (não do request) | server-side | ✅ | `ReconciliacaoPermutaService.ts:76-79` |
| Anti-super-pagamento (valor da baixa vem do ERP, não do request) | `bxaMnyValor` lido do passo 2 do handshake; aborta se ≤ 0 | I-Recon-3 | ✅ | `ReconciliacaoPermutaService.ts:185-192` |
| Anti-drift (passo 2 vs alocação local) — invariante I-Write-1 | ⚠️ AUSENTE: não há check `|bxaMnyValor − valorAlocado| ≤ tolerância`; o serviço aceita o valor do ERP cegamente | < 0.005 BRL | ❌ | `ReconciliacaoPermutaService.ts:179-192` (vs `business-rules/fin010-write-contract.md:75`) |
| `# campos do payload com `null` injetável (DESCONTO sem `bxaCodGerDesconto`) | Não-bloqueante (passo 2 devolve `bxaCodGerDesconto`); caso `undefined`, payload vai `null` ao ERP | `null` defensivo | ⚠️ | `ReconciliacaoPermutaService.ts:301-302` |

> ⚠️ **Não medível localmente**: tentativa de baixa real contra `https://columbiatrading-hml.conexos.cloud` para confirmar o handshake e o anti-drift. Requer credenciais HML + dia de homologação. Recomendação: rodar o suite de teste de homologação descrito em I-Write-5 antes de ligar `CONEXOS_WRITE_ENABLED=true` em produção.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | console.warn em rejeição 401 / 403 (auth/RBAC); sem agregação/alarme | ⚠️ parcial | `http/auth.ts:167-170,192-194` |
| Detect Service Denial | `globalLimiter` (100/min) global + `heavyRouteLimiter` (10/min) no `/reconciliar` | ✅ presente | `routes/permutas.ts:362`; `http/rateLimit.ts:11-26`; `index.ts:31` |
| Verify Message Integrity | JWT (HS256 ou JWKS) com `audience='authenticated'` em todas as rotas | ✅ presente | `http/auth.ts:111-114,142-152` |
| Detect Message Delay | n/a — interação síncrona; sem timestamps de sequência | N/A | — |
| Identify Actors | `req.user.sub`/`email` capturado do JWT; `executadoPor` propagado ao DB | ✅ presente | `routes/permutas.ts:371`; `PermutaExecucaoRepository.ts:108-114` |
| Authenticate Actors | `buildAuthMiddleware` (JOSE jwtVerify) global pré-rotas | ✅ presente | `index.ts:77`; `http/auth.ts:96-174` |
| Authorize Actors | `requireRole('admin')` em todas as 8 rotas de mutação, inclusive `/reconciliar` | ✅ presente | `routes/permutas.ts:361`; `http/auth.ts:183-200` |
| Limit Access | Default-deny dual-flag (`CONEXOS_WRITE_ENABLED=false`+`CONEXOS_DRY_RUN=true`); `dryRunOverride` do request só FORÇA mais dry-run, nunca menos | ✅ presente | `ReconciliacaoPermutaService.ts:88-91` |
| Limit Exposure | `dpeNomPessoa` (nome do fornecedor), `pesCod` e o payload bruto vão no `logService.info({...,data:{preview}})` em dry-run — exposição via log central | ⚠️ parcial | `ReconciliacaoPermutaService.ts:114-118`; `routes/permutas.ts` (não há filtro a jusante) |
| Encrypt Data | TLS via Render+Vercel (transport); Postgres at-rest (Supabase/Render); credenciais Conexos lidas de SSM SecureString no alvo, de `process.env` hoje (legacy) | ⚠️ parcial — alvo OK, estado atual é env-vars Render | `EnvironmentProvider.ts:74-99` |
| Separate Entities | Cada par adto↔invoice executa num `idempotency_key` separado; `markSettled` é por par; falha de um par não regride outro | ✅ presente | `PermutaExecucaoRepository.ts:88-121`; `ReconciliacaoPermutaService.ts:96-156` |
| Change Default Settings | Default-deny das duas flags (write OFF, dryRun ON) — escolha ativa do operador para ligar | ✅ presente | `EnvironmentProvider.ts:69-70,96-97` |
| Validate Input | Zod no body do `/reconciliar` (`dataMovto`, `dryRun`); identificadores numéricos coergidos via `Number()` antes do POST ao ERP | ✅ presente | `routes/permutas.ts:31-36,365-369`; `ReconciliacaoPermutaService.ts:175-176` |
| Revoke Access | JWT TTL; `requireRole` derruba imediatamente se a claim mudar; sem revogation list server-side | ⚠️ parcial | `http/auth.ts:142-152,183-200` |
| Lock Computer | n/a — server-side | N/A | — |
| Inform Actors | Resultados (`status: 'settled'|'error'|'dry-run'|'skipped'`) devolvidos ao FE; FE faz toast e `await load()`; sem notificação out-of-band | ⚠️ parcial | `app/permutas/page.tsx:728-748`; `ReconciliacaoPermutaService.ts:71-165` |
| Restore | Falha pós-POST → linha `reconciling` exige reconciliação manual no `fin010`; sem endpoint automático de reconciliação | ⚠️ parcial — ver Fault Tolerance overlap | `idempotencia-reconciliacao.md:36-55` |
| Audit Trail | `permuta_alocacao_execucao` registra: idempotency_key, adto/invoice/filCod, status, executado_por, request_payload, erp_response (cru), bor_cod, bxa_cod_seq, juros, conta_juros, mensagem, criado_em/atualizado_em | ✅ presente | `migrations/0015_permuta_alocacao_execucao.sql:11-42`; `PermutaExecucaoRepository.ts:132-186` |

## 4. Findings (achados)

### F-security-1: Default-deny dual-flag é correto mas a flag-flip é singleton e cacheada — flip em runtime exige restart

- **Severidade**: P2
- **Tactic violada**: Limit Access (parcial — operacional)
- **Localização**: `src/backend/domain/libs/environment/EnvironmentProvider.ts:10-26`
- **Evidência (objetiva)**:
  ```typescript
  // EnvironmentProvider — @singleton, cacheia em this.environmentVars
  public getEnvironmentVars = async (): Promise<EnvironmentVars> => {
      if (!this.environmentVars) {
          this.environmentVars = await this.generateEnvironmentVars();
      }
      return this.environmentVars as EnvironmentVars;
  };
  // Flags lidas APENAS na primeira chamada:
  conexosWriteEnabled: this.readEnv('CONEXOS_WRITE_ENABLED') === 'true',
  conexosDryRun: this.readEnv('CONEXOS_DRY_RUN') !== 'false',
  ```
- **Impacto técnico**: Para ligar `CONEXOS_WRITE_ENABLED=true` em produção, é preciso restart do processo Render. Para DESLIGAR rapidamente em incidente (kill-switch), idem — não é instantâneo. Numa janela de incidente onde precisamos parar a escrita, esperar o restart é tempo a mais com baixas potencialmente errôneas.
- **Impacto de negócio**: Não consigo "fechar a torneira" em segundos. Numa baixa errônea em curso, o operador precisa de um deploy (mesmo trivial) para desativar.
- **Métrica de baseline**: tempo p/ flip da flag em prod = tempo de restart (segundos a minutos no Render). Alvo: < 5s sem restart (flag dinâmica ou param SSM relido).

### F-security-2: Payload do `fin010/baixas` é logado em stdout pelo `axios` interceptor com redação apenas de chaves de auth — `dpeNomPessoa` (nome do fornecedor), `pesCod`, `bxaMnyValorPermuta` saem em claro

- **Severidade**: P2
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/services/conexos.ts:84-90`, `domain/client/legacyConexosAdapter.ts:90-96`, `domain/service/permutas/ReconciliacaoPermutaService.ts:285-318`
- **Evidência (objetiva)**:
  ```typescript
  // conexos.ts:84-90 — interceptor global em toda chamada axios:
  this.client.interceptors.request.use((config) => {
      const { method, url, data } = config;
      console.log(`[CONEXOS →] ${(method ?? 'GET').toUpperCase()} ${url}`);
      if (data) console.log(`[CONEXOS →] body=${redactSensitive(data)}`);
      return config;
  });
  // redactSensitive (services/conexos.ts:32-63) cobre password/username/token/etc — NÃO cobre dpeNomPessoa/pesCod.
  // O payload do passo 5 inclui dpeNomPessoa ("TOP GLOBAL PARTS CO LTD"), pesCod (2658), bxaMnyValorPermuta (41175.97).
  ```
- **Impacto técnico**: O fluxo do `/reconciliar` em produção emite no Render stdout, para cada baixa, o payload completo do fin010 incluindo o nome do fornecedor e seu pesCod. Os drains do Render alimentam o coletor de logs do operador — qualquer terceiro com acesso ao painel Render vê fornecedor + valor.
- **Impacto de negócio**: Dado regulado (cadeia de suprimentos e relação comercial Columbia ↔ fornecedor) sai do bound de "DB com RLS" para "log central" — superfície maior para insider/leak. Não é um vazamento crítico no sentido de credencial (Bass: Limit Exposure, não Encrypt Data), mas reduz CIA.
- **Métrica de baseline**: 1 fornecedor + 1 valor de permuta por baixa, em texto plano no stdout — projeção ~50 baixas/mês × 365 dias = ~600 nomes de fornecedor/ano sumarizados em log retido.

### F-security-3: `logService.info` em dry-run carrega o `preview` (payload inteiro) no campo `data` — expõe `bxaDocCod`, `taxaAdiantamento`, `taxaInvoice` no canal de log central

- **Severidade**: P2
- **Tactic violada**: Limit Exposure
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:114-118`
- **Evidência (objetiva)**:
  ```typescript
  await this.logService.info({
      type: LOG_TYPE.BUSINESS_INFO,
      message: 'permuta reconciliacao DRY-RUN (payload montado, sem POST)',
      data: { adiantamentoDocCod, invoiceDocCod: aloc.invoiceDocCod, preview },
  });
  // `preview` (buildPreviewPayload) contém: docCod, bxaDocCod, valorAlocadoNegociado,
  // taxaAdiantamento, taxaInvoice, bxaMnyJuros, classificacao.
  ```
- **Impacto técnico**: O log central (qualquer agregador onde `logService` joga) recebe valores numéricos de operações financeiras e taxas de câmbio negociadas, não-redigidos. Acesso ao log = acesso aos preços/taxas internos.
- **Impacto de negócio**: Visibilidade indevida para perfis sem necessidade de saber (devs com acesso ao log mas sem acesso ao DB financeiro). Mesmo problema do F-security-2, em outro canal.
- **Métrica de baseline**: ≈ 10 entradas dry-run/dia por analista; cada uma carrega 9 campos do payload.

### F-security-4: Ausência de invariante I-Write-1 (anti-drift) — o serviço aceita `bxaMnyValor` do ERP cegamente, sem comparar com o `valorAlocado` local

- **Severidade**: P1
- **Tactic violada**: Validate Input (output da integração tratado como input do nosso domínio)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:179-192` vs `ontology/business-rules/fin010-write-contract.md:75`
- **Evidência (objetiva)**:
  ```typescript
  const val2 = await this.conexosClient.validarTituloBaixa({ filCod, borCod, invoiceDocCod, titCod: 1 });
  const bxaMnyValor = val2.responseData?.bxaMnyValor;
  if (bxaMnyValor === undefined || !(bxaMnyValor > 0)) {
      throw new Error(`título ${invoiceDocCod} sem valor em aberto no ERP …`);
  }
  // → segue direto para passo 3/4/5 com bxaMnyValor "vivo" do ERP.
  // FALTA: |bxaMnyValor - aloc.valorAlocado| ≤ 0.005 (ver business-rule fin010-write-contract.md:75 — I-Write-1).
  ```
  A regra ontológica `fin010-write-contract.md:75` é explícita: "antes do passo 5, `|bxaMnyValor(passo 2) − valorEsperadoDaAlocacao|` deve estar dentro da tolerância (≤ 0,005 na moeda do título); divergência ⇒ **abortar** (em-aberto mudou no ERP)".
- **Impacto técnico**: Se o em-aberto da invoice mudou no ERP entre a alocação (rascunho) e a execução (analista clica "baixar" no dia seguinte), o sistema baixa o valor NOVO sem alertar o analista. Em particular, se outra baixa parcial entrou no ERP fora do sistema, o sistema baixa o resto sem checagem — coerente com a "fonte da verdade do ERP", mas viola a invariante de domínio.
- **Impacto de negócio**: Risco de "execução fantasma" — o analista vê o valor X no rascunho, clica baixar, e o ERP recebe Y. Auditoria fica ok (`valor_baixado=Y` corresponde ao `bxaCodSeq`), mas o controle interno (rascunho vs execução) está rompido. Em um cliente cético, isso é a quebra do princípio de WYSIWYG numa operação de pagamento.
- **Métrica de baseline**: incidência esperada de drift ainda não medida em produção (pois Fase 3 não foi ligada). Alvo: 100% das execuções com `|drift| ≤ 0.005` OU abort visível ao analista. **Baseline: 0% de checagem hoje** (invariante I-Write-1 não implementada).

### F-security-5: `dryRunOverride` força MAIS dry-run, nunca menos — corretamente um one-way ratchet, mas merece teste explícito de não-bypass

- **Severidade**: P3
- **Tactic violada**: Limit Access (defesa em profundidade)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:88-91`; `routes/permutas.ts:374-378`
- **Evidência (objetiva)**:
  ```typescript
  const writeEnabled = env.conexosWriteEnabled;
  const dryRun = !writeEnabled || env.conexosDryRun || input.dryRunOverride === true;
  ```
  A lógica é: dry-run = TRUE se ANY-OF (write desligada, env dryRun ligado, override do request). Logo, `input.dryRunOverride = false` não consegue desligar dry-run quando `env.conexosDryRun === true`. ✅ Correto.
- **Impacto técnico**: Comportamento correto (cliente NÃO consegue ligar a escrita real se a env diz dryRun=true). Risco residual: regressão silenciosa numa refatoração futura. Falta teste unitário que assere "dryRunOverride=false não bypassa env.dryRun=true".
- **Impacto de negócio**: Sem teste, uma refatoração tipo "deixar o request decidir" pode reintroduzir um caminho de bypass. Adicionar 1 teste é trivial.
- **Métrica de baseline**: cobertura do teste do guard-rail = 0 (não há teste específico). Alvo: 100%.

### F-security-6: Idempotency-Key não usada como trust boundary no `/reconciliar` — chave derivada server-side (correto, mas inconsistente com `/eleicao`/`/ingestao`)

- **Severidade**: P3
- **Tactic violada**: Separate Entities (consistência de padrão entre rotas mutacionais)
- **Localização**: `src/backend/routes/permutas.ts:359-381` (sem leitura de header); `ReconciliacaoPermutaService.ts:342-343`
- **Evidência (objetiva)**:
  ```typescript
  // /eleicao e /ingestao leem Idempotency-Key do header (cliente-driven):
  const rawKey = req.header('Idempotency-Key');
  // /reconciliar NÃO lê o header. A chave é derivada server-side:
  private idempotencyKey = (adtoDocCod, invoiceDocCod) => `permuta:${adtoDocCod}:${invoiceDocCod}`;
  ```
- **Impacto técnico**: Para `/reconciliar` a chave server-side é **mais segura** (cliente não pode injetar uma chave que colida com outra execução por engano ou malícia). Boa decisão de design. O problema é apenas consistência de padrão entre rotas (`/eleicao` e `/ingestao` aceitam header; `/reconciliar` não).
- **Impacto de negócio**: Confusão para o cliente (FE/integração externa): "por que o header funciona aqui e não ali?". Não é um bug de segurança propriamente — é débito de documentação. Recomendação: documentar explicitamente que `/reconciliar` ignora o header (por design) e que a chave é `permuta:{adto}:{invoice}`.
- **Métrica de baseline**: documentação do padrão = ausente. Alvo: 1 nota no ADR-0013 e no swagger/comentário da rota.

### F-security-7: Default-deny depende de variáveis de env passadas pelo Render — sem assert no boot que checa as flags antes de aceitar tráfego

- **Severidade**: P2
- **Tactic violada**: Change Default Settings (defesa em profundidade)
- **Localização**: `src/backend/index.ts:1-100` (sem boot-check); `EnvironmentProvider.ts:69-70,96-97`
- **Evidência (objetiva)**:
  ```typescript
  // Default em código está correto:
  conexosWriteEnabled: this.readEnv('CONEXOS_WRITE_ENABLED') === 'true',  // default false
  conexosDryRun: this.readEnv('CONEXOS_DRY_RUN') !== 'false',              // default true
  // MAS — o boot do app NÃO loga em qual estado entrou ("write ON" / "write OFF"),
  // e não há banner de inicialização do tipo:
  //   "[Fase 3] CONEXOS_WRITE_ENABLED=true CONEXOS_DRY_RUN=false — escrita LIVE no ERP."
  ```
- **Impacto técnico**: Um operador que ligou `CONEXOS_WRITE_ENABLED=true` em produção via Render não tem confirmação visível no log de que o app entrou em modo write. A próxima baixa é o feedback. Para um caminho de escrita irreversível, isso é tarde demais para detectar erro de configuração (ex.: deixou ligado num env errado).
- **Impacto de negócio**: Em incidente, demora a perceber "esquecemos de desligar write em staging". Boot-banner explícito + métrica de "estado da flag" reduz o MTTR.
- **Métrica de baseline**: banner de boot com estado das flags = ausente. Alvo: 1 linha de log no boot + 1 entrada em `/health` (opcional) declarando `writeEnabled` e `dryRun`.

### F-security-8: `executadoPor` cai em string literal `'unknown'` quando o JWT não tem `sub` nem `email` — quebra a auditoria sem alertar

- **Severidade**: P2
- **Tactic violada**: Audit Trail
- **Localização**: `src/backend/routes/permutas.ts:371`
- **Evidência (objetiva)**:
  ```typescript
  const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
  ```
  Se `req.user` existir mas sem `sub` (cenário improvável — `toAuthUser` lança se sem `sub`) ou se um futuro middleware popular `req.user` de outra fonte, cai em `'unknown'`. A `permuta_alocacao_execucao.executado_por` então grava a string `'unknown'` na trilha.
- **Impacto técnico**: A baixa é executada e gravada com `executado_por='unknown'` — auditável (consegue rastrear o `bxaCodSeq`), mas não dá pra atribuir o ato a uma pessoa. A defesa atual (`toAuthUser` lança quando `sub` falta) impede o caminho em produção; o risco é uma refatoração futura que tolere `sub` ausente.
- **Impacto de negócio**: Conformidade — uma baixa de pagamento sem ator nomeado num caso de auditoria do cliente é um achado. Defesa robusta: rejeitar com 401 quando `req.user?.sub` falta, em vez de aceitar `'unknown'`.
- **Métrica de baseline**: hoje o caminho `'unknown'` é inalcançável na prática (auth middleware barra), mas a coluna `executado_por` na tabela é nullable e a cadeia aceita o literal — uma migração defensiva deveria adicionar `CHECK (executado_por <> 'unknown')`.

### F-security-9: `request_payload` (JSONB) inclui `pesCod` e `dpeNomPessoa` do fornecedor — em uma database compartilhada multi-tenant, esses dados precisam de RLS ou criptografia at-rest específica

- **Severidade**: P1
- **Tactic violada**: Encrypt Data + Separate Entities
- **Localização**: `src/backend/migrations/0015_permuta_alocacao_execucao.sql:29`; `ReconciliacaoPermutaService.ts:285-318`
- **Evidência (objetiva)**:
  ```sql
  -- migration 0015
  request_payload         JSONB,
  erp_response            JSONB,
  ```
  ```typescript
  // ReconciliacaoPermutaService.ts:285-318 — campos persistidos no JSONB:
  pesCod, dpeNomPessoa, bxaMnyValor, bxaMnyValorPermuta, gerNumPermuta, ...
  ```
  No estado **atual** (single-tenant Render+Supabase), o database é único e não há outro tenant — o RLS multi-tenant é problema do estado-alvo Lambda+Terraform (1 conta AWS por cliente). Hoje só Columbia Trading. Mas a tabela já guarda dado de fornecedor + valor, e não tem coluna `client_name` / `tenant_id`. Quando a SaaSo for ligada e a tabela for replicada (ou movida para um schema compartilhado), o isolamento por tenant fica a cargo de quem fizer a migração — risco que vale fica explícito agora.
- **Impacto técnico**: Migração futura para multi-tenant precisa ou (a) RLS na tabela com `tenant_id` no row, ou (b) schema-per-tenant. Sem decisão registrada, o caminho de menor esforço (compartilhar a tabela sem tenant_id) cria um risco de cross-tenant leak.
- **Impacto de negócio**: Em SaaSo financeira, vazamento de fornecedor + valor entre tenants é o pior tipo de incidente (Columbia vê dados do concorrente). Decidir o esquema multi-tenant ANTES do scale-out reduz custo de migração.
- **Métrica de baseline**: tabelas de auditoria com `tenant_id` no diff = 0. Tabelas no alvo multi-tenant ainda não definidas. Alvo: decisão de schema documentada em ADR antes do bootstrap multi-tenant.

## 5. Cards Kanban

### [security-1] Implementar invariante I-Write-1 (anti-drift) antes do passo 5 do fin010

- **Problema**
  > O `ReconciliacaoPermutaService.executarBaixa` aceita `bxaMnyValor` do ERP (passo 2) sem compará-lo com `aloc.valorAlocado`. A regra `fin010-write-contract.md:75` (I-Write-1) exige `|bxaMnyValor(passo 2) − valorEsperadoDaAlocacao| ≤ 0.005`. Quando o em-aberto da invoice mudar entre o rascunho e a execução, o sistema baixa o valor novo silenciosamente — quebra do WYSIWYG do analista numa operação financeira irreversível.

- **Melhoria Proposta**
  > Em `ReconciliacaoPermutaService.executarBaixa`, após `val2.responseData?.bxaMnyValor`, comparar com `aloc.valorAlocado` convertido para BRL (`valorAlocado × taxaInvoice`) com tolerância 0.005. Divergência ⇒ `throw new Error('drift: ERP em-aberto mudou')` e `markError(key, ...)` com `erro_mensagem` explícita. Adicionar teste no `ReconciliacaoPermutaService.test.ts` para os 3 cenários: dentro da tolerância, fora (acima), fora (abaixo). Validate Input — tratar a resposta da integração como input externo.

- **Resultado Esperado**
  > Toda baixa real ou aborta com mensagem de drift visível ao analista, ou prossegue dentro de 0.005 BRL de tolerância. Métrica: 0 execuções com `|drift| > 0.005` em produção. Cobertura de teste do branch anti-drift: 100%.

- **Tactic alvo**: Validate Input
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - `# execuções com drift fora de tolerância sem abort`: hoje N/A (não medido) → 0
  - cobertura de teste do anti-drift: 0% → 100%
- **Risco de não fazer**: baixa silenciosa de valor diferente do rascunho do analista — quebra de controle interno auditável.
- **Dependências**: nenhuma.

### [security-2] Redigir `dpeNomPessoa`/`pesCod`/valores nos logs do payload fin010 (axios interceptor)

- **Problema**
  > O interceptor de request do `axios` (`src/backend/services/conexos.ts:84-90`) loga `body=${redactSensitive(data)}` em todo POST. O `redactSensitive` cobre password/username/token, mas NÃO cobre `dpeNomPessoa` (nome do fornecedor), `pesCod` e `bxaMnyValorPermuta`. No fluxo `/reconciliar` ligado, esses campos saem em texto plano no stdout do Render para cada baixa.

- **Melhoria Proposta**
  > Estender a lista de chaves redigidas em `redactSensitive` (`services/conexos.ts:24-25`) para incluir, OPCIONALMENTE quando o `url` matchar `/fin010`, os campos `dpeNomPessoa`, `pesCod`, `bxaMnyValor*` (substituir por `<MASKED>` deixando só o gerNum e os IDs). Alternativa: criar um redactor específico `redactFin010Payload(body)` chamado quando `config.url?.includes('fin010')`. Limit Exposure.

- **Resultado Esperado**
  > Nome do fornecedor e CNPJ-like (pesCod) não saem em log de stdout em produção. Métrica: 0 nomes de fornecedor em log de `/reconciliar` em produção (grep amostral em log de 1 dia). Hoje: ≈ 50/mês.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-security-2, F-security-3
- **Métricas de sucesso**:
  - `# nomes de fornecedor em log/dia`: ≈ 2/dia → 0
  - chaves redigidas no fin010: 3 (password/username/token) → 6+ (+dpeNomPessoa/pesCod/bxaMny*)
- **Risco de não fazer**: vazamento de cadeia de suprimentos via log central de operação. Quem tem acesso ao painel Render vê fornecedor + valor.
- **Dependências**: nenhuma.

### [security-3] Substituir `data:{preview}` em `logService.info` por identificadores compactos

- **Problema**
  > `ReconciliacaoPermutaService.ts:114-118` loga o `preview` (payload inteiro com `taxaAdiantamento`, `taxaInvoice`, `bxaMnyJuros`, `bxaDocCod`) no campo `data` do `logService.info`. Esses números são confidenciais — taxa de câmbio negociada, valor da variação — e vão pro log central na trilha BUSINESS_INFO.

- **Melhoria Proposta**
  > Trocar para `data: { adiantamentoDocCod, invoiceDocCod, classificacao, valorAlocado, moeda }`. O `request_payload` completo já é persistido em `permuta_alocacao_execucao.request_payload` (JSONB) — o log central não precisa repetir. Limit Exposure.

- **Resultado Esperado**
  > Log central tem suficiente para responder "quem fez o quê quando" sem expor as taxas. Métrica: log entry de dry-run cabe em < 200 caracteres → contra ≈ 600 hoje.

- **Tactic alvo**: Limit Exposure
- **Severidade**: P2
- **Esforço estimado**: S (≤ 0.5d)
- **Findings relacionados**: F-security-3, F-security-2
- **Métricas de sucesso**:
  - tamanho médio do log de dry-run: ≈ 600 chars → ≤ 200 chars
  - campos confidenciais em log: 9 → 0 (todos em DB JSONB only)
- **Risco de não fazer**: trilha de log central vira corpus de inteligência financeira para qualquer perfil com acesso ao agregador (devs, ops, vendor de logging).
- **Dependências**: nenhuma.

### [security-4] Boot-banner explícito declarando estado das flags do fin010 + métrica em `/health`

- **Problema**
  > Não há boot-log do tipo "[Fase 3] CONEXOS_WRITE_ENABLED=true, CONEXOS_DRY_RUN=false — escrita LIVE no ERP". Operador que sobe um deploy com escrita ligada por engano (env errado) só descobre na próxima baixa.

- **Melhoria Proposta**
  > No bootstrap (`src/backend/index.ts` antes do `app.listen`), resolver `EnvironmentProvider` e logar uma linha clara em estado warn quando `writeEnabled=true && dryRun=false`. Opcional: adicionar `writeMode: 'live' | 'dry-run' | 'disabled'` em `/health` (resposta pública limitada ao status sem leak de credencial). Change Default Settings.

- **Resultado Esperado**
  > Toda inicialização emite "modo de escrita ativo". Métrica: 100% dos boots de produção emitem a linha. Falha de configuração detectada em < 1 minuto após restart.

- **Tactic alvo**: Change Default Settings + Inform Actors
- **Severidade**: P2
- **Esforço estimado**: S (≤ 0.5d)
- **Findings relacionados**: F-security-1, F-security-7
- **Métricas de sucesso**:
  - boots com banner do modo de escrita: 0% → 100%
  - tempo até detectar config errada: agora "primeira baixa" → < 1 min de boot
- **Risco de não fazer**: ligar escrita LIVE em ambiente errado sem alerta de boot.
- **Dependências**: nenhuma.

### [security-5] Kill-switch dinâmico para `CONEXOS_WRITE_ENABLED` (releitura sem restart)

- **Problema**
  > `EnvironmentProvider` é singleton com cache; as flags são lidas uma vez no primeiro `getEnvironmentVars`. Para desligar a escrita em incidente, precisa restart do processo Render — janela de segundos a minutos com baixas potencialmente erradas em curso.

- **Melhoria Proposta**
  > Caminho A (cheap): expor um sub-getter `getWriteFlags()` em `EnvironmentProvider` que relê `process.env.CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` a cada chamada (ignora cache só para essas duas keys). Caminho B (correto, futuro): SSM Parameter Store + cache curto (TTL 30s) — alinhado com o alvo Lambda+SSM. Limit Access.

- **Resultado Esperado**
  > Operador pode desligar a escrita em < 5s flippando a variável (Render UI / SSM); o próximo `/reconciliar` já não escreve. Métrica: tempo p/ kill-switch < 5s.

- **Tactic alvo**: Limit Access + Revoke Access
- **Severidade**: P2
- **Esforço estimado**: M (1-2d para caminho A; M para SSM)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - tempo p/ flippar a flag em produção: restart-time → < 5s
- **Risco de não fazer**: incidente com baixa erronea exige deploy para parar — minutos extras de exposição.
- **Dependências**: depende do estado-alvo SSM se for caminho B.

### [security-6] Teste explícito do guard-rail dry-run no `ReconciliacaoPermutaService.test.ts`

- **Problema**
  > `dryRun = !writeEnabled || env.conexosDryRun || input.dryRunOverride === true` é um one-way ratchet correto, mas não há teste assertando "input.dryRunOverride=false NÃO bypassa env.dryRun=true". Uma refatoração futura pode reintroduzir um caminho de bypass silenciosamente.

- **Melhoria Proposta**
  > Adicionar 3 testes ao `ReconciliacaoPermutaService.test.ts`: (1) writeEnabled=false → dry-run sempre TRUE; (2) writeEnabled=true, dryRun=true, dryRunOverride=false → ainda TRUE; (3) writeEnabled=true, dryRun=false, dryRunOverride=true → TRUE; (4) writeEnabled=true, dryRun=false, dryRunOverride=undefined → FALSE. Limit Access (regressão).

- **Resultado Esperado**
  > Regressão do guard-rail detectada em CI. Métrica: cobertura dos 4 caminhos = 100%.

- **Tactic alvo**: Limit Access (defesa em profundidade)
- **Severidade**: P3
- **Esforço estimado**: S (≤ 0.5d)
- **Findings relacionados**: F-security-5
- **Métricas de sucesso**:
  - cobertura dos 4 caminhos do dryRun gate: 0% → 100%
- **Risco de não fazer**: refatoração futura pode abrir bypass acidental sem CI pegar.
- **Dependências**: nenhuma.

### [security-7] Documentar no ADR-0013 que `/reconciliar` derivada `idempotencyKey` server-side (não usa o header)

- **Problema**
  > Inconsistência entre rotas: `/eleicao` e `/ingestao` aceitam header `Idempotency-Key` do cliente; `/reconciliar` ignora o header (chave derivada server-side como `permuta:{adto}:{invoice}`). É a decisão MAIS segura, mas não está documentada — risco de um cliente FE/integração externa enviar o header esperando ser respeitado.

- **Melhoria Proposta**
  > Atualizar `ontology/decisions/0013-write-back-fin010-fase3.md` com nota explícita: "/reconciliar ignora `Idempotency-Key` por design — a chave de execução é derivada do par adto↔invoice no server, garantindo unicidade impossível de colidir por engano do cliente". Repetir comentário no top do handler em `routes/permutas.ts:359`. Separate Entities (consistência de padrão entre rotas).

- **Resultado Esperado**
  > Padrão documentado. Métrica: 1 nota no ADR + 1 comentário JSDoc na rota.

- **Tactic alvo**: Separate Entities
- **Severidade**: P3
- **Esforço estimado**: S (≤ 0.2d)
- **Findings relacionados**: F-security-6
- **Métricas de sucesso**:
  - documentação do padrão: ausente → presente em 2 lugares
- **Risco de não fazer**: confusão de integração futura.
- **Dependências**: nenhuma.

### [security-8] Endurecer `executadoPor`: rejeitar com 401 quando `req.user?.sub` ausente, em vez de gravar `'unknown'`

- **Problema**
  > `routes/permutas.ts:371`: `const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';`. Hoje o middleware impede o caminho `'unknown'` (`toAuthUser` lança), mas o fallback no código aceita a string — uma refatoração futura do auth path pode reintroduzir o gap silenciosamente.

- **Melhoria Proposta**
  > Em `/reconciliar` (e idealmente nas outras mutações), substituir `?? 'unknown'` por um guard explícito: `if (!req.user?.sub) { res.status(401).json({error:'No subject'}); return; }`. Em paralelo, adicionar `CHECK (executado_por <> 'unknown' AND executado_por <> '')` na próxima migration. Audit Trail.

- **Resultado Esperado**
  > Toda baixa é executada com ator nomeado ou rejeitada com 401. Métrica: 0 linhas em `permuta_alocacao_execucao` com `executado_por='unknown'`.

- **Tactic alvo**: Audit Trail + Identify Actors
- **Severidade**: P2
- **Esforço estimado**: S (≤ 0.5d)
- **Findings relacionados**: F-security-8
- **Métricas de sucesso**:
  - linhas com `executado_por='unknown'`: 0 hoje (defesa do middleware) → 0 garantido por constraint
- **Risco de não fazer**: baixa de pagamento sem ator nomeado num caso de auditoria.
- **Dependências**: nenhuma.

### [security-9] Decidir esquema multi-tenant da `permuta_alocacao_execucao` antes do scale-out

- **Problema**
  > A migration `0015_permuta_alocacao_execucao.sql` não tem coluna `tenant_id`/`client_name`. No estado atual (single-tenant Render/Supabase) está OK — só Columbia. Mas a tabela guarda `dpeNomPessoa` (fornecedor) e valores monetários em JSONB; quando a SaaSo for ligada (alvo Lambda+Terraform, 1 conta AWS por cliente), o esquema de isolamento por tenant precisa estar decidido (RLS por `tenant_id` vs schema-per-tenant vs DB-per-tenant). Sem ADR, o caminho de menor esforço da migração pode misturar tenants.

- **Melhoria Proposta**
  > Registrar em `ontology/decisions/0014-tenant-isolation-permuta-execucao.md` qual padrão multi-tenant será usado para todas as tabelas de auditoria de escrita (incluindo `permuta_alocacao_execucao`). Recomendação: schema-per-tenant alinhado com o alvo "1 conta AWS por cliente" (1 banco por cliente). Mesmo no estado-atual single-tenant, registrar a decisão evita débito quando a Fase SaaSo começar. Separate Entities + Encrypt Data.

- **Resultado Esperado**
  > ADR aprovada documentando o padrão; próxima migration multi-tenant já nasce coerente. Métrica: 1 ADR aceita; 0 tabelas de write-audit sem coluna/schema de tenant.

- **Tactic alvo**: Separate Entities
- **Severidade**: P1
- **Esforço estimado**: M (2-3d — decisão de design + ADR)
- **Findings relacionados**: F-security-9
- **Métricas de sucesso**:
  - ADR registrada: 0 → 1
  - tabelas de write-audit com plano multi-tenant explícito: 0/N → N/N
- **Risco de não fazer**: cross-tenant leak no scale-out (Columbia vê outro cliente / vice-versa). Pior incidente possível em SaaSo financeira.
- **Dependências**: alinhamento com o estado-alvo do `infra/` (Terraform + AWS multi-account).

## 6. Notas do agente

- Escopo restrito ao diff `git diff HEAD~1 HEAD` (24ae540) + os arquivos referenciados pela superfície de escrita. Não revisei o caminho de leitura existente nem outras Frentes (SISPAG, GED), por estarem fora do diff da Fase 3.
- O design de guarda dual (`writeEnabled` + `dryRun`) é a melhor parte da feature do ponto de vista de segurança: default-deny, override-só-para-mais-restrito, e o serviço falha aberto (dry-run) em vez de falhar fechado (silêncio). Score 6.5 reflete: forte no design (write-ahead, default-deny, audit trail, RBAC, parametrização SQL), médio na operação (logs do payload em stdout, kill-switch lento, anti-drift ausente, esquema multi-tenant não decidido).
- **Cross-QA**: F-security-4 (anti-drift) cruza com Fault Tolerance (recuperação de drift) e com Integrability (contrato do ERP); F-security-9 cruza com Modifiability + Deployability (esquema multi-tenant impacta a estratégia de deploy); F-security-1 e F-security-5 cruzam com Availability (kill-switch lento = MTTR maior).
- **Não medível localmente**: o handshake fin010 real contra HML — só dia de homologação Columbia. Recomendação: I-Write-5 (homologação-first) deve ser pré-requisito de ligar `CONEXOS_WRITE_ENABLED=true`.
