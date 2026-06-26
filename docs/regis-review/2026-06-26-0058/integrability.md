---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-26-0058
agent: qa-integrability
generated_at: 2026-06-26T01:05:00-03:00
scope: all
score: 5
findings_count: 8
cards_count: 8
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto (proposta v1) | Acrescentar **3 integrações net-new** (Nexxera remessa/retorno, GED upload, SharePoint PDF) e ampliar a **5ª escrita do fin010** (multi-título) sobre o `ConexosClient` (1956 LOC) | `src/backend/domain/client/` + `services/conexos.ts` legado + `EnvironmentProvider` + `appContainer.ts` | Produção Render/Vercel (sem AWS/Terraform), 1 tenant Columbia, escrita `fin010` gated por `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` | Cada integração nova reside num client `@singleton() @injectable()` próprio com Zod no boundary, retry tipado, segredos via `EnvironmentProvider`, contrato versionado em `ontology/integrations/<name>.md`. Substituir provedor (Nexxera→outro banco) muda 1 arquivo. | Marginal cost por nova integração ≤ 1 client + 1 schema Zod + 1 doc ontology; **0** arquivos de service/routes tocados para troca de provedor; 100% das respostas externas parseadas por Zod; 100% de credenciais via `EnvironmentProvider`. |

> Realidade hoje: o sistema só conhece **1** integração externa de domínio (Conexos) + **2** infra (Supabase Postgres, BCB SGS). As 3 net-new ainda não têm sequer um stub. Quando entrarem, vão pressionar exatamente o pior ponto (god-client + dupla camada de auth legada).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC do maior client | **1.956** (`ConexosClient.ts`) | ≤ 600 (1 client por endpoint-family) | ❌ | `wc -l src/backend/domain/client/ConexosClient.ts` |
| Públicos no `ConexosClient` | **28 métodos** cobrindo 5 famílias wire (com298, com299, com308, imp019/imp223, fin010) | ≤ 8 por client | ❌ | `grep -c '^\s*public ' src/backend/domain/client/ConexosClient.ts` |
| Clients de domínio implementados | `ConexosClient`, `BcbClient` (exemplo) | + Nexxera, GED, SharePoint | ❌ (3 ausentes) | `ls src/backend/domain/client/` + `ontology/_inbox/migration-debt.md:46` (O7) |
| Touchpoints serviço→`conexosClient.X` | **34** (4 serviços) — Eleicao 13, Bordero 11, Reconciliacao 6, Alocacao 4 | n/a; medir blast-radius | ⚠️ | `grep -rn "conexosClient\." src/backend/domain/service` |
| Camadas de auth Conexos | **2** paralelas: `ConexosClient` (DI) + `services/conexos.ts` legado (singleton solto) | 1 | ❌ | `legacyConexosAdapter.ts:22` + `services/conexos.ts:341` |
| Zod no boundary do `ConexosClient` | **4 de 28** métodos validam resposta (`com298RowSchema`, `declaracaoRowSchema`, `BORDERO_CRIADO_SCHEMA`, `BAIXA_GRAVADA_SCHEMA`) ≈ **14%** | ≥ 80% (todas as respostas mutáveis) | ❌ | `grep -n '\.parse(' src/backend/domain/client/ConexosClient.ts` |
| Endpoints externos versionados (URL/header) | **0/6** (Conexos `/api/...` sem `vN`; BCB SGS sem version; PostgreSQL N/A) | onde o provedor expor | ⚠️ (Conexos não tem v; BCB SGS não tem v) | `grep '/v[0-9]\|api-version' src/backend/domain/client src/backend/services` (0 hits) |
| Tests de client (suítes) | ConexosClient **81 it**, BcbClient **5**, Postgree **12**, `services/conexos.ts` **7** | n/a | ⚠️ todos com mocks `jest.fn()`; **0 fixtures gravadas** | `grep -c 'it(\|test(' src/backend/domain/client/*.test.ts` |
| Fixture-based contract tests | **0** | ≥ 1 por endpoint de escrita (fin010 5 passos) | ❌ | `grep -rn 'fixture\|recorded' src/backend/domain/client/*.test.ts` (0 hits) |
| `process.env.X` fora do `EnvironmentProvider` | **15 ocorrências** (config.ts, index.ts, services/conexos.ts, http/, BcbClient `BCB_CDI_FALLBACK`) | 0 em service/client | ❌ | `grep -rn 'process\.env\.' src/backend --include='*.ts'` (filtrado) |
| Hard-coded tenant URL | **2** (`EnvironmentProvider.ts:54` e `services/conexos.ts:80` → `https://columbiatrading.conexos.cloud/api`) | 0 | ❌ (viola Rule #2) | grep direto |
| `titCod: 1` hardcoded (ReconciliacaoPermutaService) | **4 ocorrências** — quebra invoice multi-título | 0 (iterar por título) | ❌ | `ontology/_inbox/permuta-multi-titulo-pendente.md:31` |
| Wrapper único frontend→backend | **1 arquivo** (`src/frontend/lib/api.ts`) com 22 fetch sites + `AuthProvider.tsx` (1 login) | 1 wrapper | ✅ | `grep -rn 'fetch(\|axios' src/frontend --include='*.ts*'` |
| Axios/fetch em service/repo/route | **0** (todo HTTP atravessa client/adapter) | 0 | ✅ | grep |
| SSM path convention `/tenants/{env}/{client}/{name}` | **0/0** (Lambda path não exercitado; deploy é Render+env vars) | 100% (alvo) | ⚠️ N/A hoje | `find infra` ausente |
| Observabilidade de falha por dependência | logs `[CONEXOS ✗]` apenas no `console.error` (sem métrica/contador) | per-dep error rate + p95 latency | ❌ | `services/conexos.ts:110` |

> ⚠️ **Não medível localmente**: per-dependency error rate, p95 de chamada Conexos, MTTR. Requer log shipping (Render→Datadog/Grafana) ou CloudWatch (não existe). Recomendação: instrumentar `LogService.metric(...)` que o `[CONEXOS →]/[← ✗]` já cobre semanticamente.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `ConexosClient` expõe métodos de domínio (`listAdiantamentosProforma`, `criarBordero`, `gravarBaixaPermuta` etc.) — não vaza `post/get` genérico para serviços | ⚠️ parcial | `ConexosClient.ts:444-1657` (nomes domínio OK); mas o LegacyAdapter expõe `postGeneric/getGeneric` (`legacyConexosAdapter.ts:94-105`) — encapsulamento depende de o autor do client NÃO chamar diretamente |
| Use an Intermediary | `LegacyConexosShape` (`ConexosClient.ts:75-108`) interpõe o legado `services/conexos.ts` permitindo trocar transporte sem mudar clients | ✅ presente | injetado via `LEGACY_CONEXOS_TOKEN` em `appContainer.ts:63` |
| Restrict Communication Paths | Serviços só dependem de `ConexosClient` (via `@inject`) — 0 importam axios/fetch | ✅ presente | `grep axios\|fetch src/backend/domain/service` → vazio |
| Adhere to Standards | HTTP/JSON puro; sem OpenAPI/JSON Schema do provedor; BCB SGS é REST público | ⚠️ parcial | Conexos é proprietário (não tem spec); `ontology/integrations/conexos.md` é o único contrato escrito |
| Abstract Common Services | `RetryExecutor`, `FallbackExecutor`, `PollExecutor` em `domain/libs/executor/`; `EnvironmentProvider` central | ✅ presente | `RetryExecutor` instanciado 3× (Conexos, Bcb, Postgree); cada client cria a SUA política — sem base class compartilhada |
| Discover Service | URLs por env (`CONEXOS_BASE_URL`, `databaseConnectionString`); sem registry dinâmico | ⚠️ parcial | `EnvironmentProvider.ts:52-54` (hardcoded fallback Columbia) — `discover` é estático no boot |
| Tailor Interface | Métodos do `ConexosClient` traduzem wire (`docCod` string vs number, `dpeNomPessoa→importador`, `parseDate` BR-noon-shift) para o domínio | ✅ presente | `ConexosClient.ts:484-498`, `parseDate :1797` |
| Configure Behavior | Toggles `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` (default seguro: dry-run on) | ✅ presente | `EnvironmentProvider.ts:69-70`; lido em `ReconciliacaoPermutaService.ts:122-125` |
| Manage Resources | Pool pg `max=5` + advisory lock; sessão Conexos com mutex de login + retry 401 + sessionToKill na MAX_SESSIONS | ✅ presente | `PostgreeDatabaseClient.ts:26-42`, `services/conexos.ts:76-197` |
| Orchestrate | `EleicaoPermutasService` (10 deps) orquestra ConexosClient + 8 outros — sincronamente | ⚠️ parcial | `EleicaoPermutasService.ts:104-115` (10 `@inject`) — choreography por eventos não existe |
| Manage Resource Coupling | Auth Conexos compartilhada via `getSid` (ADR-0007 fechou as 2 sessões paralelas) | ✅ presente | `services/conexos.ts:222-227`, `legacyConexosAdapter.ts:6-15` |
| **Contract Testing** | Mocks puros via `buildLegacy()` (`ConexosClient.test.ts:5-14`) — sem fixtures gravadas (HAR) | ❌ ausente | `grep fixture\|recorded src/backend/domain/client/*.test.ts` → 0 |
| **Versioning Strategy** | Nenhuma — Conexos sem `vN` no URL, BCB SGS idem | ❌ ausente | `grep /v[0-9]\|api-version src/backend/domain/client` → 0 |
| **Backward-compatibility Shims** | `legacyConexosAdapter` é em si o shim para o auth legado; sem mecanismo formal de versão de contrato | ⚠️ parcial | `legacyConexosAdapter.ts:1-15` |
| **Observability of Integration Failures** | Logs `[CONEXOS →/←/✗]` no console; sem contador por endpoint; `ConexosError` tipado (`statusCode 504`, `retryable`) | ⚠️ parcial | `services/conexos.ts:85-114`, `errors/ConexosError.ts:14-40` |

## 4. Findings (achados)

### F-integrability-1: God-client `ConexosClient` (1.956 LOC, 28 métodos públicos, 5 famílias wire)

- **Severidade**: P1
- **Tactic violada**: Encapsulate / Abstract Common Services
- **Localização**: `src/backend/domain/client/ConexosClient.ts:424-1957`
- **Evidência (objetiva)**:
  ```
  $ grep -c '^\s*public ' src/backend/domain/client/ConexosClient.ts
  28
  $ wc -l src/backend/domain/client/ConexosClient.ts
  1956
  ```
  Famílias: `com298` (proforma+invoice+detail), `com299` (crédito), `com308` (títulos+baixas), `imp019/imp223` (declaração), `fin010` (borderô + 5-step write + listas).
- **Impacto técnico**: alterar contrato wire em UMA família (ex.: `gerNum#IN`) força recompilar e re-testar TUDO; conflitos de merge em paralelo (já visíveis: 4 serviços tocam 34 vezes a mesma instância); risco de re-introduzir bug morto ao mover código vizinho.
- **Impacto de negócio**: cada `/feature-new` de Permutas/SISPAG precisa entrar nesse arquivo — pipeline serializa, time-to-first-call para nova feature aumenta. Para Nexxera/GED/SharePoint o instinto será replicar a "god-client" e o problema cresce 4×.
- **Métrica de baseline**: 1.956 LOC, 28 públicos, 4 serviços com média 8.5 chamadas/serviço.

### F-integrability-2: Camada dupla de autenticação Conexos (DI + legado `services/conexos.ts`)

- **Severidade**: P1
- **Tactic violada**: Use an Intermediary / Manage Resource Coupling
- **Localização**: `src/backend/services/conexos.ts:65-342` + `src/backend/domain/client/legacyConexosAdapter.ts:22-39` + `ConexosClient.ts:428`
- **Evidência**:
  ```
  // services/conexos.ts:341
  export const conexosService = new ConexosService();  // singleton solto, FORA do tsyringe
  // legacyConexosAdapter.ts:22
  const { conexosService } = (await import('../../services/conexos.js'))
  // services/conexos.ts:80
  baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api'
  // services/conexos.ts:144-145
  const username = process.env.CONEXOS_USERNAME;
  const password = process.env.CONEXOS_PASSWORD;
  ```
  Migration-debt B3 (`ontology/_inbox/migration-debt.md:19`) classifica como PARTIAL e v0.2 (ADR-0006) prometia substituir.
- **Impacto técnico**: 2 caminhos para mudar timeout, headers, retry, login mutex, redaction; o legado lê `process.env.CONEXOS_*` direto (viola Inviolable Rule #8), bypass-ando o `EnvironmentProvider` que SSM-resolve em prod (Lambda).
- **Impacto de negócio**: troca do tenant Columbia para outro cliente exige editar URL em 2 lugares + reaprender semântica do mutex; novos integradores não sabem qual é a "fonte da verdade".
- **Métrica de baseline**: 342 LOC no legado, 2 process.env reads (`CONEXOS_USERNAME/PASSWORD`), 1 fallback de URL hardcoded.

### F-integrability-3: Validação Zod na borda cobre 14% dos métodos do `ConexosClient`

- **Severidade**: P1
- **Tactic violada**: Contract Testing / Tailor Interface (validate inputs)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:679,733,793,1103,1491` (5 sites de `.parse`/`.safeParse`)
- **Evidência**:
  ```
  $ grep -n '\.parse(\|\.safeParse(' src/backend/domain/client/ConexosClient.ts
  679: com298RowSchema.parse(row)
  733: com298RowSchema.safeParse(row)
  793: declaracaoRowSchema.parse(row)
  1103: BORDERO_CRIADO_SCHEMA.parse(raw)
  1491: BAIXA_GRAVADA_SCHEMA.parse(raw)
  ```
  Métodos sem Zod: `listProcessos`, `listAdiantamentosProforma`, `listInvoicesFinalizadas`, `listFinanceiroAPagar`, `getDetalheTitulos`, `getBordero`, `listBaixas`, `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `listBaixasTitulo`, etc. — vários respondem com `Fin010ValidacaoResponse<TituloBaixaValidacao>` **cast** sem parse (`ConexosClient.ts:1374-1395`).
- **Impacto técnico**: o ERP pode mudar shape (ex.: `mnyTitAberto` virar string, `borCod` virar `null`) sem testes notarem; o erro vai aparecer 3 hops adiante como `NaN` em SQL ou cálculo silenciosamente errado. Os 5 passos do `fin010-write-contract.md` são justamente o caminho que o sistema NÃO valida (só passos 1 e 5).
- **Impacto de negócio**: probabilidade de "baixa fantasma" / over-payment cresce em silêncio. CLAUDE.md exige "validate external inputs … with Zod at boundaries" — regra hoje é decorativa.
- **Métrica de baseline**: 4/28 ≈ 14% (alvo 80%). Métodos write-side validados: 2/5 do handshake (passos 1 e 5).

### F-integrability-4: 3 integrações net-new (Nexxera, GED, SharePoint) sem client, sem config, sem ontologia

- **Severidade**: P1
- **Tactic violada**: Encapsulate / Discover Service
- **Localização**: ausência em `src/backend/domain/client/` + `EnvironmentProvider.ts` + `ontology/integrations/`
- **Evidência**:
  ```
  $ ls src/backend/domain/client/
  BcbClient.ts ConexosClient.ts database/ legacyConexosAdapter.ts permutas/
  $ ls ontology/integrations/
  conexos.md
  ```
  `ontology/_inbox/migration-debt.md:46` (O7): "Integrações Nexxera / GED / SharePoint inexistentes (sem client, sem config). Net-new por `/feature-new`."
- **Impacto técnico**: cada uma vai precisar repetir o padrão (`@singleton @injectable`, retry, Zod boundary, env via SSM, doc ontology). Sem template (base class / project conventions doc), cada `/feature-new` reinventa e diverge.
- **Impacto de negócio**: Frente II (SISPAG) e Frente III (Popula GED) são metade da proposta — não podem começar sem essa fundação. Marginal cost hoje = "ler ConexosClient inteiro para entender o padrão".
- **Métrica de baseline**: 0 clients, 0 docs `ontology/integrations/`, 0 entradas em `EnvironmentVars` para os 3 provedores.

### F-integrability-5: `titCod: 1` hardcoded em `ReconciliacaoPermutaService` quebra invoice multi-título

- **Severidade**: P1
- **Tactic violada**: Tailor Interface (modelar o contrato, não chumbar parcela)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` (4 ocorrências aproximadas linhas 254, 313, 401, 467) — documentado em `ontology/_inbox/permuta-multi-titulo-pendente.md:31`
- **Evidência (objetiva)**: `ontology/_inbox/permuta-multi-titulo-pendente.md:21-34`:
  ```
  ReconciliacaoPermutaService baixa com titCod: 1 HARDCODED (4 ocorrências)
  → só baixa o título 1 (bxaMnyValor = 116.159,22).
  Logo, alocamos a soma (117.237,36) contra o título 1 (116.159,22). A diferença =
  exatamente o título 2 (1.078,14) → anti-drift aborta.
  ```
- **Impacto técnico**: o write-side do contrato `fin010` (5-step handshake) ignora a multiplicidade real do ERP. Anti-drift (I-Write-1) escuda o problema, mas BLOQUEIA fluxo legítimo (invoice com N parcelas).
- **Impacto de negócio**: toda invoice com >1 título cai em `error` na reconciliação → analista precisa conciliar manualmente no Conexos. Hoje "minoria", mas vira norma em SISPAG.
- **Métrica de baseline**: 4 hardcodes; 1 caso real bloqueado documentado (invoice 4120 vs adto 4061); decisão de domínio (A vs B) pendente do Yuri.

### F-integrability-6: Zero versionamento de API externa + sem estratégia de back-compat

- **Severidade**: P2
- **Tactic violada**: Versioning Strategy / Backward-compatibility Shims
- **Localização**: `services/conexos.ts:80` (`/api` sem versão), `BcbClient.ts:11-72` (`/dados/serie/bcdata.sgs.{id}/dados`, sem `v`)
- **Evidência**:
  ```
  $ grep -rn '/v[0-9]\|version=\|api-version' src/backend/domain/client src/backend/services
  (sem hits)
  ```
- **Impacto técnico**: Conexos é tenant proprietário (sem versão pública), mas mudanças de shape JÁ aconteceram (probe 2026-06-01 doc 10649: HTTP 400 com `responseData` válido — coberto por workaround em `ConexosClient.ts:998-1019`). Sem pin formal, cada quirk vira código defensivo.
- **Impacto de negócio**: quando trocar para outro tenant (ou Conexos atualizar), não há cláusula de "API version supported" no client para alertar fail-fast.
- **Métrica de baseline**: 0/6 endpoints externos versionados.

### F-integrability-7: Contract tests só com mocks `jest.fn()` — 0 fixtures gravadas (HAR)

- **Severidade**: P2
- **Tactic violada**: Contract Testing
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts:5-14`
- **Evidência**:
  ```
  const buildLegacy = (): jest.Mocked<LegacyConexosShape> => ({
      ensureSid: jest.fn().mockResolvedValue(undefined),
      listGeneric: jest.fn(),
      listGenericPaginated: jest.fn().mockResolvedValue({ count: 0, rows: [] }),
      getGeneric: jest.fn().mockResolvedValue({ rows: [] }),
      postGeneric: jest.fn().mockResolvedValue({}),
      ...
  });
  $ grep -rn 'fixture\|recorded' src/backend/domain/client/*.test.ts
  (sem hits)
  ```
  81 `it()` na suite do Conexos validam **mapeamento** (entrada → saída sintética), não o **shape real** que o ERP devolve. Contra-prova: as HAR probes (2026-06-18, 2026-06-23, 2026-06-25) ficaram em `ontology/_inbox/` e em prosa nos comentários — nunca viraram fixtures de regressão.
- **Impacto técnico**: o contrato real do ERP NÃO está fixado em teste — só na cabeça do Yuri e nos comentários multi-linha do `ConexosClient`. Probe nova = re-derivar manualmente.
- **Impacto de negócio**: o sistema mais perto de quebrar com upgrade do Conexos não tem rede de segurança automatizada.
- **Métrica de baseline**: 0 fixture-based tests, 0 endpoints com shape ERP gravado.

### F-integrability-8: `process.env.X` lido fora do `EnvironmentProvider` em 15 locais (incl. `BcbClient`, `services/conexos.ts`)

- **Severidade**: P2
- **Tactic violada**: Configure Behavior / Discover Service
- **Localização**: `src/backend/services/conexos.ts:80,144-145`, `src/backend/domain/client/BcbClient.ts:123`, `src/backend/config.ts:9,24`, `src/backend/index.ts:27,64,99`, `src/backend/utils/index.ts:2`, `src/backend/http/rateLimit.ts:15`, `src/backend/jobs/seed-admin.ts:22-23`, `src/backend/domain/libs/handler/ApiGatewayHandler.ts:68-69`
- **Evidência**:
  ```
  $ grep -rn 'process\.env\.' src/backend --include='*.ts' | grep -v EnvironmentProvider | grep -v '\.test\.' | wc -l
  15
  ```
  Cito o pior caso (cliente externo lendo env direto):
  ```
  // src/backend/domain/client/BcbClient.ts:123
  const fallback = process.env.BCB_CDI_FALLBACK;
  ```
- **Impacto técnico**: alvo Lambda exige SSM via `EnvironmentProvider`; esses leak-points não vão funcionar quando o deploy migrar (e mesmo hoje, no Render, viram dupla fonte de verdade).
- **Impacto de negócio**: Inviolable Rule #8 violada de forma rastreável. Toda nova integração que copiar o padrão BCB herda o problema.
- **Métrica de baseline**: 15 ocorrências (alvo 0 em service/client; aceitáveis em `index.ts`/handlers de bootstrap).

## 5. Cards Kanban

### [integrability-1] Quebrar `ConexosClient` por família wire (com298, com308, imp, fin010) e introduzir base class

- **Problema**
  > O `ConexosClient.ts` tem 1.956 LOC e 28 métodos públicos cobrindo 5 famílias wire distintas (com298 proforma/invoice/detail, com299 crédito, com308 títulos, imp019/imp223 declarações, fin010 borderô + write 5-step). Toda `/feature-new` ou bug-fix toca o mesmo arquivo (4 serviços já fazem 34 chamadas), serializando o pipeline e elevando o risco de merge-conflict. Replicar esse padrão para Nexxera/GED/SharePoint multiplica o problema 4×.
- **Melhoria Proposta**
  > Aplicar Encapsulate + Abstract Common Services: extrair um `ConexosBaseClient` (auth ensure-sid, retry executor, error wrapping `ConexosError`) e dividir em `ConexosFinDocClient` (com298/com308/com299), `ConexosImportClient` (imp019/imp223), `ConexosBorderoClient` (fin010 read+write). Manter a interface usada hoje por re-export até o último `/feature-tweak` que tocar cada serviço migrar a injeção. Documentar o padrão em `ontology/integrations/_template.md`.
- **Resultado Esperado**
  > LOC do maior client ≤ 600 (3 clients ~600–700 LOC). Métodos públicos por client ≤ 10. Padrão reusável para os 3 net-new (Nexxera/GED/SharePoint).
- **Tactic alvo**: Encapsulate / Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: L (1–2 sem)
- **Findings relacionados**: F-integrability-1, F-integrability-4
- **Métricas de sucesso**:
  - LOC do maior client: 1.956 → ≤ 700
  - Métodos públicos por client: 28 → ≤ 10
  - Famílias por client: 5 → 1
- **Risco de não fazer**: ConexosClient atinge 3.000 LOC após `fin010` multi-título e SISPAG; merge-hell em paralelo entre permutas/SISPAG/popula-GED; novos integradores copiam o anti-pattern.
- **Dependências**: nenhuma — pode rodar em paralelo com [integrability-2]; **bloqueia conforto de [integrability-4]** (mas não bloqueia se for net-new isolado).

### [integrability-2] Eliminar a camada `services/conexos.ts` legada (auth via DI única)

- **Problema**
  > `services/conexos.ts` (342 LOC, singleton solto) duplica auth/timeout/login-mutex/redaction com o `ConexosClient` (DI/tsyringe). Lê `process.env.CONEXOS_USERNAME/PASSWORD/BASE_URL` direto, ignorando o `EnvironmentProvider` (Inviolable Rule #8). O `legacyConexosAdapter` é um pass-through dynamic-import que só existe por causa dessa dupla camada. ADR-0006 prometia remover na v0.2.
- **Melhoria Proposta**
  > Migrar `ConexosService` (axios + sid + mutex + 401-retry) para dentro do `ConexosBaseClient` (cf. card 1), consumindo `EnvironmentProvider` via `@inject`. Apagar `services/conexos.ts` e `legacyConexosAdapter.ts`. `appContainer.ts` registra direto o cliente DI sem `LEGACY_CONEXOS_TOKEN`.
- **Resultado Esperado**
  > 1 caminho de auth Conexos. `process.env.CONEXOS_*` deixa de ser lido fora de `EnvironmentProvider`.
- **Tactic alvo**: Use an Intermediary / Manage Resource Coupling
- **Severidade**: P1
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-integrability-2, F-integrability-8
- **Métricas de sucesso**:
  - Camadas de auth Conexos: 2 → 1
  - process.env.CONEXOS_* fora do EnvironmentProvider: 3 → 0
  - LOC eliminadas: ~342 (services/conexos.ts) + 120 (legacyConexosAdapter.ts) ≈ 462
- **Risco de não fazer**: ao migrar para Lambda + SSM, o legado lê env vazio → quebra em produção; 2 mutexes paralelos podem reaparecer; redaction divergir.
- **Dependências**: idealmente após [integrability-1] para ter onde encaixar o auth; ordem inversa também funciona.

### [integrability-3] Zod no boundary para 100% das respostas do `ConexosClient` (especialmente o handshake `fin010`)

- **Problema**
  > 4 de 28 métodos do `ConexosClient` validam a resposta com Zod (14%). Os passos 2/3/4 do handshake de escrita `fin010` (`validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`) usam `cast` (`postGeneric<Fin010ValidacaoResponse<TituloBaixaValidacao>>`) sem `.parse`. Uma mudança silenciosa de shape no ERP (ex.: `bxaMnyValor` virar string) propaga como `NaN` no SQL/cálculo. CLAUDE.md exige "validate external inputs … with Zod at boundaries".
- **Melhoria Proposta**
  > Criar schemas em `client/permutas/conexosFin010Schemas.ts` (BORDERO_DETALHE, BAIXA_LIST_ROW, FIN010_VALIDACAO_TITULO_BAIXA, FIN010_VALIDACAO_TITULO_PERMUTA, FIN010_ATUALIZA_LIQUIDO). Aplicar `.parse()` em todo retorno do `postGeneric/getGeneric/listGenericPaginated` no client. Falha de parse vira `ConexosError({code: 'CONEXOS_UPSTREAM_ERROR', message: 'schema_mismatch'})`.
- **Resultado Esperado**
  > 100% das respostas write-side validadas + ≥ 80% das read-side.
- **Tactic alvo**: Tailor Interface / Contract Testing (Validate Input)
- **Severidade**: P1
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Métodos com Zod no boundary: 4/28 → ≥ 22/28 (80%)
  - Passos write-side validados: 2/5 → 5/5
- **Risco de não fazer**: silent corruption no write path (over-payment, baixa fantasma); quirk-handlers proliferam sem disciplina (já há 1 em `ConexosClient.ts:998-1019`).
- **Dependências**: complementa [integrability-7]; melhor depois do [integrability-1] (schemas por família).

### [integrability-4] Modelar Nexxera/GED/SharePoint via `/feature-new` (clients + ontologia + EnvironmentVars)

- **Problema**
  > Frente II (SISPAG/Nexxera — remessa/retorno bancário) e Frente III (Popula GED — SharePoint→GED) são metade da proposta e hoje têm 0 código, 0 doc em `ontology/integrations/`, 0 entrada em `EnvironmentVars`. Sem template oficial, cada uma vai copiar o que houver de "exemplo" — hoje, o god-client Conexos.
- **Melhoria Proposta**
  > 1) Criar `ontology/integrations/_template.md` definindo o padrão (`@singleton @injectable`, Zod boundary, retry tipado, error class por integração, fixture HAR em `__fixtures__/`). 2) Para cada provedor, rodar `/feature-new` distinto que produz `NexxeraRemessaClient` + `NexxeraRetornoClient` (gateway bancário CNAB), `GedClient` (upload), `SharePointClient` (PDF source) + entradas SSM/`EnvironmentVars.ts`. 3) Bloquear merge sem doc `ontology/integrations/<name>.md`.
- **Resultado Esperado**
  > 3 novas integrações nasceram seguindo o padrão; marginal cost para a 4ª = 1 doc + 1 client + 1 schema.
- **Tactic alvo**: Encapsulate / Discover Service / Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: XL (>2sem por provedor — desenho + sondagem + idempotência); ESCOPO DESTE CARD = template + ordenação
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Integrações com client + ontology doc: 1 → 4
  - Template oficial: 0 → 1 (`ontology/integrations/_template.md`)
  - Padrão referenciado pelo `PatternGuardian`: não → sim
- **Risco de não fazer**: SISPAG e Popula GED entram com god-clients copiados/colados; débito multiplica.
- **Dependências**: idealmente após [integrability-1] (template extraído da divisão) — mas o template pode preceder a divisão e guiar.

### [integrability-5] Resolver `titCod: 1` hardcoded (invoice multi-título no `fin010` write)

- **Problema**
  > `ReconciliacaoPermutaService` baixa com `titCod: 1` em 4 lugares; invoice com >1 título cai em `error` com `anti-drift` (a alocação soma as N parcelas, o write toca só a 1ª). Documentado em `ontology/_inbox/permuta-multi-titulo-pendente.md`, com decisão de domínio (A: baixar todos / B: só os permutáveis) pendente do Yuri.
- **Melhoria Proposta**
  > Levantar decisão A vs B com o time (1 reunião). Implementar: se A, iterar `titCod 1..N` por invoice (cada um vira passo 2–5 do handshake no mesmo `borCod`, espelhando `I-Write-3 — um adto por vez`); se B, `AlocacaoPermutasService.somaValorNegociado` filtra só títulos com `moeCodMneg != null`. Em ambos os casos, remover hardcodes e cobrir com teste fixture (vide card 7).
- **Resultado Esperado**
  > Invoice de N títulos baixa sem `anti-drift` falso-positivo; nenhum hardcode `titCod: 1` no service.
- **Tactic alvo**: Tailor Interface
- **Severidade**: P1
- **Esforço estimado**: M (3–5d + homologação)
- **Findings relacionados**: F-integrability-5
- **Métricas de sucesso**:
  - Hardcodes `titCod: 1` em service: 4 → 0
  - Invoice multi-título: bloqueia/erro → baixa (modo A ou B definido)
- **Risco de não fazer**: cresce a fila de conciliação manual quando SISPAG entra (multi-título é regra lá); confiança no write-side cai.
- **Dependências**: depende da decisão de domínio do Yuri; **`--high-risk` + pair-review** obrigatórios (toca o write gated).

### [integrability-6] Fixtures HAR + contract tests dos endpoints write-side `fin010`

- **Problema**
  > Os 81 testes do `ConexosClient` usam mocks `jest.fn()` que devolvem shape sintético. As HARs reais (probes 2026-06-18 / -06-23 / -06-25) ficaram em `ontology/_inbox/` em prosa e nos comentários multi-linha do código. Não há regressão automatizada para o **shape real** que o Conexos devolve, especialmente nos 5 passos de escrita.
- **Melhoria Proposta**
  > Adicionar `src/backend/domain/client/__fixtures__/conexos/` com JSON respostas reais (sanitizadas) por endpoint: `com298-list-proforma.json`, `com298-detail.json`, `fin010-bordero-criado.json`, `fin010-baixas-validacao-tituloBaixa.json`, etc. Os testes do client passam a usar essas fixtures contra os schemas Zod do card 3 — assim cobrem ao mesmo tempo o parser e o contrato.
- **Resultado Esperado**
  > Cada endpoint crítico tem ≥ 1 fixture; mudança de shape ERP quebra teste **na hora**.
- **Tactic alvo**: Contract Testing
- **Severidade**: P2
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-integrability-3, F-integrability-7
- **Métricas de sucesso**:
  - Fixtures gravadas: 0 → ≥ 10 (5 passos do fin010 + 5 reads core)
  - Testes que validam shape ERP real: 0 → ≥ 10
- **Risco de não fazer**: probe nova = re-derivar tudo na cabeça; comentários inline envelhecem.
- **Dependências**: melhor após [integrability-3] (precisa dos schemas).

### [integrability-7] Versionamento + back-compat shim doc para integrações

- **Problema**
  > Conexos `/api` sem versão; quirks (HTTP 400 com `responseData` válido em `ConexosClient.ts:998-1019`) já estão sendo silenciosamente compensados sem rastro formal de "qual versão de contrato". BCB SGS idem. Quando trocar provedor (Nexxera→outro banco) não há cláusula declarada.
- **Melhoria Proposta**
  > 1) Adicionar campo `wire_contract_observed_at` em cada `ontology/integrations/<name>.md` (frontmatter) — referência à HAR/probe. 2) Para cada quirk-handler no client, exigir comentário `// QUIRK: <provider>@<observed-at>` + link para fixture (vinculado ao card 6). 3) Doc curto `docs/integrations/upgrade-playbook.md` com passos para "provedor mudou shape".
- **Resultado Esperado**
  > Quirks rastreáveis; upgrade do Conexos vira playbook executável.
- **Tactic alvo**: Versioning Strategy / Backward-compatibility Shims
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Endpoints com `wire_contract_observed_at`: 0 → 100% dos documentados
  - Quirks anotados: 0 → 100% (≥ 1 em `ConexosClient.ts:998-1019`)
- **Risco de não fazer**: quirk-creep silencioso continua; o próximo `/feature-new` reaprende do zero.
- **Dependências**: nenhuma; ortogonal.

### [integrability-8] Banir `process.env.X` em service/client (mover para `EnvironmentProvider`)

- **Problema**
  > 15 leituras de `process.env.X` fora do `EnvironmentProvider`, incluindo um cliente externo (`BcbClient.ts:123` lê `BCB_CDI_FALLBACK`) e o auth legado Conexos (`services/conexos.ts:80,144,145`). Viola Inviolable Rule #8 e deixa o caminho Lambda+SSM (alvo) impraticável.
- **Melhoria Proposta**
  > Estender `EnvironmentVars` com `bcbCdiFallback` (e demais leituras de client). Lint custom (`PatternGuardian`) bloqueia `process\.env\.` em `src/backend/domain/client/**` e `src/backend/domain/service/**`. Exceções aceitáveis (bootstrap/handler) ficam declaradas em `appContainer.ts`, `index.ts`, handlers.
- **Resultado Esperado**
  > 0 leituras de `process.env` em client/service.
- **Tactic alvo**: Configure Behavior / Discover Service
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-8
- **Métricas de sucesso**:
  - `process.env.X` em client/service: 3 (BcbClient + 2 em services/conexos) → 0
  - Regra ativa no PatternGuardian: não → sim
- **Risco de não fazer**: cresce com cada `/feature-new`; debugging "por que a env não pegou em SSM?" vira recorrente.
- **Dependências**: complementa [integrability-2] (mata a maior fonte hoje).

## 6. Notas do agente

- Score 5/10: o único client de domínio implementado (`ConexosClient`) tem boas tactics presentes (RetryExecutor, `ConexosError` tipado, métodos domínio, write gated por toggle, Zod nos 2 pontos críticos do write) — mas a soma de 1956 LOC + dupla camada de auth + Zod a 14% + 0 fixture + 3 integrações net-new sem fundação rebaixa fortemente a integrability marginal. A nota subiria a 7+ se os cards 1–4 forem entregues antes de Nexxera/GED/SharePoint.
- Cross-QA — sinalizar ao consolidator:
  - **Encapsulate** (cards 1, 2, 4) overlap com **Modifiability**: god-client é o mesmo offender ("módulo grande = blast radius grande").
  - **Zod no boundary** (card 3) overlap com **Security** (validar input externo = defesa contra payload malicioso/malformado) e com **Fault Tolerance** (anti-drift no write fin010 já fala disso em `business-rules/fin010-write-contract.md:75-77`).
  - **Idempotência write-ahead** (`ReconciliacaoPermutaService.ts:152`) overlap com **Fault Tolerance** — replicar a mesma disciplina em Nexxera/GED é pré-requisito.
- Métricas runtime (per-dep error rate, p95 latency, MTTR de Conexos) não medíveis localmente; declaradas explicitamente na seção 2.
