---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-22-1658
agent: qa-integrability
generated_at: 2026-06-22T16:58:00Z
scope: all
score: 6.0
findings_count: 8
cards_count: 8
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Equipe Yuri / nova frente (SISPAG ou Popula GED), ou Conexos publica v2 da API | Adicionar nova integração (Nexxera / SharePoint / GED) **ou** quebra de contrato em endpoint Conexos existente (e.g. renomeia `mnyTitAberto`, muda semântica de `moedaCod=220`) | `domain/client/*` + serviços que consomem (`EleicaoPermutasService`, `AlocacaoPermutasService`, `VariacaoCambialPermutaService`) | Backend Express em produção (Render), Frontend Next.js (Vercel), Postgres (Supabase). Permutas Fatia 1 com 410 adiantamentos reais carregando 3x/dia (cron) | (a) Nova integração ganha um `Client @singleton @injectable` em `domain/client/`, schemas Zod nos boundaries, fan-out típico; serviços a consomem via DI sem conhecer wire. (b) Mudança Conexos só toca `ConexosClient` + `conexosPermutasSchemas` — services não compilam errado | Marginal cost ≤ 1 dia para adicionar um Client read-only com fixture; ≤ 3 dias para um write-side. Mudança upstream → ≤ 3 arquivos tocados fora do `domain/client/`. % de falhas de wire isoladas no boundary ≥ 90%. |

> Hoje a Frente I (Permutas) tem **3 services** consumindo `ConexosClient` (Eleição, Alocação, VariacaoCambialPermuta).
> SISPAG/Nexxera e Popula GED/SharePoint **ainda não foram modelados**: nascerão via `/feature-new` e cada um exigirá um `domain/client/<Name>Client.ts` + entrada em `ontology/integrations/<name>.md`. A baseline mede o que JÁ foi construído (Conexos read-only) — o cenário não é hipotético: PR #4 adicionou MAIS acoplamento (per-invoice `getDetalheTitulos` para INVOICE casáveis), e o write-side da `fin010` permanece risco arquitetural #1 (`migration-debt.md` O3).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| # de clients em `domain/client/` | 3 (`ConexosClient`, `BcbClient`, `PostgreeDatabaseClient`) | — (baseline) | ℹ️ | `find src/backend/domain/client -type f -name "*.ts" -not -name "*.test.ts"` |
| Métodos públicos genéricos (`get`/`post`/`request`/`call`) em clients | 0 (todos domain-shaped: `listAdiantamentosProforma`, `getDetalheTitulos`, `listTitulosAPagar`, `listBaixasTitulo`, `listDeclaracaoByProcesso`, …) | 0 | ✅ | `grep "public " src/backend/domain/client/ConexosClient.ts` (13 métodos, todos domain) |
| Services com **>2** dependências de Client distintas | 1 — `EleicaoPermutasService` injeta `ConexosClient` + `PostgreeDatabaseClient` (=2) | ≤ 2 | ✅ | `grep "@inject" src/backend/domain/service/permutas/EleicaoPermutasService.ts:103-114` |
| `axios`/`fetch` fora de `domain/client/` no backend | **1 violação crítica** — `src/backend/services/conexos.ts:1` (`import axios`) | 0 | ❌ | `grep -rn "import axios" src/backend --include="*.ts" \| grep -v test` (BcbClient é client legítimo; `services/conexos.ts` é o **runtime real** de transporte do Conexos — fora de `domain/client/`) |
| `process.env.*` raw fora de `EnvironmentProvider` / `lambda/index.ts` | 14 ocorrências (`services/conexos.ts` 3, `config.ts` 2, `index.ts` 3, `seed-admin.ts` 2, `handler` 2, `BcbClient` 1, `authEnv` 1, `utils` 1) — sendo **3 de credenciais Conexos lidas no transporte legado** | ≤ 5 (apenas bootstrap) | ⚠️ | `grep -rn "process\.env\." src/backend --include="*.ts" \| grep -v test \| grep -v EnvironmentProvider \| wc -l` |
| Files com Zod usado para validação de boundary externo (Conexos wire) | 2 (`domain/client/permutas/conexosPermutasSchemas.ts`, `domain/interface/closing-reports/AdiantamentoFinanceiro.ts`) | ≥ 1 por integração ativa | ⚠️ | `grep -rln "z\.object\|z\.union" src/backend/domain/client src/backend/domain/interface` — Zod existe SÓ no caminho permutas; `BcbClient` e os demais readers do `ConexosClient` NÃO validam wire |
| % de endpoints Conexos cobertos por fixture-based response tests | 8/13 métodos públicos têm teste com fixture-shape (probes reais: `dpeNomPessoa`, `mnyTitAberto`, `cdiDtaCi`, …) ≈ **62%** | ≥ 80% | ⚠️ | `wc -l src/backend/domain/client/ConexosClient.test.ts` (1342 linhas, 80 `it(`/`describe`); contado pelos sub-`describe` por método |
| External API version pinning (URL `/v1`, header `x-api-version`) | 0 — `https://columbiatrading.conexos.cloud/api` (raiz), BCB SGS sem versão; Conexos endpoints `com298/list`, `imp019/list` são planilha de produto, não versionados | ≥ 1 (header opcional) | ❌ | `grep -n "/v[0-9]\|version" src/backend/services/conexos.ts src/backend/domain/client/*.ts` |
| Wire-field semantics hardcoded em CLIENT (isolado) | 7 constantes (`TPD_PROFORMA=99`, `TPD_INVOICE=128`, `GER_ADTO_FORN_INT=198`, `GER_PERMUTA_ARECEBER=9`, `GER_PERMUTA_APAGAR=21`, `GER_CLIENTES_DIVERSOS_OP_PROPRIA=4`, `VLD_STATUS_FINALIZADO='3'`) em `ConexosClient.ts:290-356`; `MOEDA_COD_SIGLA: {1:'BRL', 220:'USD'}` em `:222` | Isolar no client (não no service) | ✅ no client / ⚠️ exporta `siglaMoedaNegociada` consumido por 3 services | `grep -n "TPD_\|GER_\|MOEDA_COD" src/backend/domain/client/ConexosClient.ts` |
| Wire-field semantics vazados em services (`docCod`, `priCod`, `filCod`, `mnyTit*`, `tpdCod`, `gerNum`, `vldStatus`) | 109 ocorrências em `domain/service/**/*.ts` (não-teste) — `docCod`, `priCod`, `filCod` viajam como identidade de domínio (aceitável); `mnyTit*`/`tpdCod`/`gerNum` aparecem só em comentários no service | ≤ 0 wire-puro (`mnyTit*`/`gerNum`/`tpdCod`) no service | ✅ campos numéricos Conexos só em comentário; identidade (`docCod`/`priCod`/`filCod`) propaga | `grep -rn "moedaCod\|priCod\|filCod\|tpdCod\|gerNum\|vldStatus\|mnyTit" src/backend/domain/service --include="*.ts" \| grep -v test \| wc -l` |
| Auth/refresh duplicado entre clients | 1 implementação centralizada — `services/conexos.ts` (login mutex, 401-retry, `LOGIN_ERROR_MAX_SESSIONS` retry, `defaultHeaders` com `cnx-filcod`/`cnx-usncod`). `BcbClient` é stateless (sem auth). `PostgreeDatabaseClient` usa `RetryExecutor` próprio (pattern não compartilhado, mas custom: detecção `MaxClientsInSessionMode`) | Base abstrata ou mixin compartilhado | ⚠️ | `grep -rn "RetryExecutor\|ensureSid\|tryAcquireLock" src/backend/domain/client` |
| Wrapper único frontend → backend | 1 — `src/frontend/lib/api.ts` (13 chamadas `fetch`) + `AuthProvider.tsx` (1 `fetch /auth/login`) | 1 wrapper, todos os call-sites usam | ⚠️ | `grep -rn "fetch(" src/frontend --include="*.ts" --include="*.tsx" \| grep -v lib/api.ts \| grep -v node_modules` (1 vazamento) |
| Dual-auth FE (Supabase + NextAuth) | NÃO — backend emite JWT próprio (`/auth/login`); `AuthProvider.tsx` guarda em localStorage; Supabase só é mencionado em `EnvironmentProvider` (opcional) e no shared-metrics como DB; `AuthProvider.tsx:5` importa `TOKEN_STORAGE_KEY` próprio | 1 sistema de auth | ✅ | `grep -n "Supabase\|NextAuth" src/frontend/lib/auth/AuthProvider.tsx` (0 hits) |
| Contract tests / fixture coverage (PR #4) | `ConexosClient.test.ts` 1342 linhas, 80 `it`/`describe`; `conexosPermutasSchemas.test.ts` 73 linhas; `BcbClient.test.ts` 71 linhas. Fixture-shape com wire real (`docCod`, `dpeNomPessoa`, `mnyTitAberto`, `cdiDtaCi`) confirmada | manter ≥ 80% por método público | ⚠️ | `grep -c "it(" src/backend/domain/client/ConexosClient.test.ts` |
| Ontology integrations doc por integração | 1/1 viva (`ontology/integrations/conexos.md`); `ontology/integrations/` só tem `conexos.md`; SISPAG/Nexxera/SharePoint/GED ainda inexistentes (esperado: nascem com `/feature-new`) | 1 por integração ativa | ✅ | `ls ontology/integrations/` |

> ⚠️ **Não medível localmente**: per-dependency error rates (CloudWatch / observability). Backend Express atual loga `[CONEXOS ✗] ... → status` em stdout (`services/conexos.ts:106-113`); sem agregação por endpoint, sem dashboard. Recomendação: instrumentar `LogService.error({ integration:'conexos', endpoint })` ao migrar para Lambda + CloudWatch, OU expor `/metrics` Prometheus enquanto Express.

## 3. Tactics — Cobertura no nf-projects

### Limit Dependencies

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `ConexosClient` expõe 13 métodos domain-shaped (`listAdiantamentosProforma`, `getDetalheTitulos`, `listBaixasTitulo`, …); 0 métodos genéricos `get`/`post`/`request`. Wire-strings (`com298/list`, `mnyTitPermutar`, `tpdCod=99`) ficam dentro do client. Schemas Zod (`com298RowSchema`, `declaracaoRowSchema`) rejeitam rows sem identidade no boundary. | ✅ presente (parcial) | `src/backend/domain/client/ConexosClient.ts:398-1163`; `src/backend/domain/client/permutas/conexosPermutasSchemas.ts:28-66` |
| Use an Intermediary | `legacyConexosAdapter.ts` é o intermediary entre `ConexosClient` (DI/`@singleton`) e o antigo `services/conexos.ts` (singleton de módulo, axios+sessão). Trade-off documentado em ADR-0007 (não duplicar sessão). `LEGACY_CONEXOS_TOKEN` injeta o adapter — desacopla teste de auth real. | ⚠️ parcial — anti-corruption layer existe, mas o transporte real (`services/conexos.ts`) está FORA do `domain/client/`, viola Rule #8 (`process.env.CONEXOS_*`) e Rule #4 (axios direto). É o nó da migração. | `src/backend/domain/client/legacyConexosAdapter.ts:16-93`; `src/backend/services/conexos.ts:80,144-145` |
| Restrict Communication Paths | DI obrigatório (`@inject(ConexosClient)`) em 2 services (`Eleicao`, `Alocacao`); nenhum service importa `axios` direto. `appContainer.ts` é o ponto único de bootstrap (`container.resolve(ConexosClient)` eager warm). | ✅ presente | `src/backend/domain/appContainer.ts:64`; `grep "import axios" src/backend/domain/service` retorna 0 |
| Adhere to Standards | Conexos NÃO usa OpenAPI/JSONSchema, sem versão de API, sem padrão REST (POST para "list"). HTTP transport via axios; sem cliente gerado. BCB SGS é REST padrão `bcdata.sgs.<id>/dados`. Postgres via `pg` Pool (padrão SQL). | ⚠️ parcial — limitação do fornecedor Conexos; mitigado pelos schemas Zod | `src/backend/services/conexos.ts:79-82`; `src/backend/domain/client/BcbClient.ts:11` |
| Abstract Common Services | `RetryExecutor` (`domain/libs/executor/`) é compartilhado entre `ConexosClient` e `BcbClient` e `PostgreeDatabaseClient`. `BoundedConcurrency` (`domain/libs/concurrency/`) compartilhado. **Mas** `services/conexos.ts` tem auth/login/mutex/401-retry **próprios** que não foram extraídos para uma base abstrata (`AbstractAuthenticatedHttpClient`). | ⚠️ parcial — Executors abstraídos; auth/login não | `src/backend/domain/libs/executor/RetryExecutor.ts`; `src/backend/services/conexos.ts:65-313` |

### Adapt

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Discover Service | `EnvironmentProvider` busca credenciais Conexos em SSM (caminho alvo, `ssm_conexos_credentials`) OU em `.env` local. Não há service registry em runtime — URL hardcoded com fallback `https://columbiatrading.conexos.cloud/api`. | ⚠️ parcial — SSM no caminho alvo; runtime atual (Express/Render) usa env vars diretos | `src/backend/domain/libs/environment/EnvironmentProvider.ts:50-93`; `src/backend/services/conexos.ts:80` |
| Tailor Interface | `ConexosClient.mapDocPagar` / `mapDeclaracaoDataBase` / `mapDetalheTitulos` / `mapAdiantamentoDebito` / `mapAdiantamentoCredito` traduzem o wire shape do Conexos para interfaces de domínio (`Adiantamento`, `InvoiceLancamento`, `DocFinanceiroAPagar`, `AdiantamentoFinanceiroInterface`). `siglaMoedaNegociada(titulo)` é a tactic Tailor Interface aplicada a um sub-tipo (moeda 220→USD). | ✅ presente | `src/backend/domain/client/ConexosClient.ts:234-246,727-734,947-971,1299-1341,1365-1430` |
| Configure Behavior | `RetryExecutor({retries:2, delayMs:500, jitterMs:200})` configurável; `MAX_PAGES=50`, `PAGE_SIZE=500`, `CHUNK_SIZE=50` são consts no client (não config externa). `BCB_CDI_FALLBACK` env var no `BcbClient` para outage prolongada. | ⚠️ parcial — knobs de retry/page expostos só em construtor, não via SSM/config | `src/backend/domain/client/ConexosClient.ts:303-320,384-389`; `src/backend/domain/client/BcbClient.ts:123-132` |
| Manage Resources | `PostgreeDatabaseClient` pool max=5, idleTimeout=10s, connectionTimeout=5s; `BoundedConcurrency` limita fan-out Conexos (`FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10`) para não estourar `LOGIN_ERROR_MAX_SESSIONS`. Login com mutex (`loginPromise`) evita logins paralelos. Idempotency-key + advisory-lock no Postgres. | ✅ presente | `src/backend/domain/client/database/PostgreeDatabaseClient.ts:26-43,137-158`; `src/backend/domain/service/permutas/EleicaoPermutasService.ts:86-87,140-185`; `src/backend/services/conexos.ts:73-77,125-140` |

### Coordinate

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Orchestrate | `EleicaoPermutasService.executar` orquestra cadeia sincrona: `listAdiantamentosProforma → listProcessos → listDeclaracaoByProcesso → listFinanceiroAPagar(INVOICE) → para cada candidato: getDetalheTitulos → listTitulosAPagar → casamentoInvoice → variacaoCambial → aging → snapshot`. 10 chamadas Conexos por candidato em pior caso. | ⚠️ parcial — orquestrador único com >5 colaboradores; replace de qualquer client cascateia | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:103-114,238,363,413,442,465,556,702,746,747` (10 hits de `conexosClient.`) |
| Manage Resource Coupling | `BoundedConcurrency` limita fan-out por dimensão; advisory-lock serializa runs por `Idempotency-Key`; `pg_try_advisory_lock` sobre hash djb2 da key. `RetryExecutor` por chamada (não global) — falha transitória em página N não mata a run. | ✅ presente | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:58-64,140-185`; `src/backend/domain/client/database/PostgreeDatabaseClient.ts:137-158` |

### Facetas modernas

| Tactic (modern) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Contract testing | 80 `it`/`describe` em `ConexosClient.test.ts` com fixtures wire-shape (`docCod`, `dpeNomPessoa`, `mnyTitAberto`, `cdiDtaCi`, `dioDtaDesembaraco`) capturadas de probe real (2026-06-18, dev tenant Columbia). Sem consumer-driven contract — não há producer test do lado Conexos. | ⚠️ parcial — fixture-based, sem CDC | `src/backend/domain/client/ConexosClient.test.ts:101-141`; `ontology/integrations/conexos.md:13-16` |
| Versioning strategy | NENHUMA — Conexos não oferece header/URL de versão; código depende de probes empíricos datados ("2026-06-18", "2026-06-01"). Quebra de contrato no upstream é detectada SÓ em runtime (Zod parse error) ou via teste manual. | ❌ ausente | `grep "/v[0-9]\|api-version" src/backend/services/conexos.ts src/backend/domain/client/*.ts` retorna 0 |
| Backward-compatibility shims | `mapDocPagar` aceita aliases (`row.dataEmissao ?? row.docDtaEmissao`, `row.valor ?? row.docMnyValor`, `row.exportador ?? row.dpeNomPessoa`); `parseDate` aceita `number`, `string`, `Date`; `isPago` aceita 3 shapes (`mnyTitAberto`, `pago=1`, `pago=true`). Esses shims **misturam** "wire pode mudar" e "endpoints diferentes têm shapes diferentes" — sem comentário deixa ambíguo se é defensive ou compat. | ⚠️ parcial — defensivos no client; ausentes ao redor de novos campos críticos (`mnyTitPermutar` `null` no list vs detail é caso tratado, mas via fan-out, não via shim) | `src/backend/domain/client/ConexosClient.ts:1273-1354` |
| Observability de integration failures | `services/conexos.ts:85-114` loga por chamada (`[CONEXOS →]`/`[CONEXOS ←]`/`[CONEXOS ✗]`) com método/URL/status/count; `redactSensitive` mascara credenciais. `ConexosError` carrega `endpoint` + `priCod` + `cause`. **Sem** agregação por endpoint, sem error budget, sem dashboard, sem alerta de mudança de shape. | ⚠️ parcial — logs estruturados existem; sem métrica | `src/backend/services/conexos.ts:41-114`; `src/backend/domain/errors/ConexosError.ts:14-32` |

## 4. Findings (achados)

### F-integrability-1: `services/conexos.ts` é o **runtime real** de transporte do Conexos, fora de `domain/client/`, com axios direto e `process.env.CONEXOS_*` (Rule #4 + Rule #8)

- **Severidade**: P1
- **Tactic violada**: Encapsulate / Use an Intermediary / Restrict Communication Paths
- **Localização**: `src/backend/services/conexos.ts:1,79-82,144-145,235-283,289-312`; bridge `src/backend/domain/client/legacyConexosAdapter.ts:22-35`
- **Evidência (objetiva)**:
  ```
  src/backend/services/conexos.ts:1   import axios, { type AxiosInstance } from 'axios';
  src/backend/services/conexos.ts:80              baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api',
  src/backend/services/conexos.ts:144         const username = process.env.CONEXOS_USERNAME;
  src/backend/services/conexos.ts:145         const password = process.env.CONEXOS_PASSWORD;
  src/backend/services/conexos.ts:315 export const conexosService = new ConexosService();   # singleton de módulo, NÃO @injectable
  ```
- **Impacto técnico**: O `ConexosClient` (`@singleton @injectable`) **delega** o transporte para um singleton de módulo legado que (a) lê credenciais Conexos via `process.env` em vez de `EnvironmentProvider`/SSM, (b) tem auth/mutex/`LOGIN_ERROR_MAX_SESSIONS` retry hardcoded fora do mecanismo de DI, (c) não pode ser substituído por um mock injetável em testes integration (só os testes unitários do `ConexosClient` mocam via `LEGACY_CONEXOS_TOKEN`). Trocar a base URL ou rodar contra um tenant diferente exige sobrescrever env var de processo, não config injetada.
- **Impacto de negócio**: bloqueia a migração para Lambda multi-tenant (cada tenant precisará de credenciais Conexos por SSM, não env globais); um deploy errado vaza credenciais do tenant A para o B. Bloqueia também o write-side `fin010` (risco #1), porque o caminho de mutação herda esses pecados.
- **Métrica de baseline**: 3 `process.env.CONEXOS_*` raw no transporte legado; 0 testes integration substituem o singleton de módulo.

### F-integrability-2: Conexos não tem versão pinned — quebra de contrato upstream só é detectada em runtime

- **Severidade**: P1
- **Tactic violada**: Versioning strategy / Adhere to Standards
- **Localização**: `src/backend/services/conexos.ts:79-82`; `src/backend/domain/client/ConexosClient.ts` (todos endpoints)
- **Evidência (objetiva)**:
  ```
  baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api'
  # endpoints: com298/list, com298/{docCod}, imp019/list, imp223/list, com308/financeiroAPagar/list/{docCod}, ...
  # nenhum carrega /v1 nem header x-api-version
  ```
- **Impacto técnico**: O Conexos pode renomear `mnyTitAberto`, mudar a semântica de `moeCodMneg=220` (USD→outro), ou parar de aceitar `serviceName: 'com308.finTituloFin'` (já houve mudança documentada: ADR-0009 `usnCod` capturado em runtime; ADR-0020 Addendum #12 `PTAX removida em favor de cmn156`). Cada um desses eventos disparou um bug em produção ou um curl de probe em campo. Sem versão pinned, é impossível distinguir "tenant Columbia ainda na v1" de "outro tenant futuro na v2".
- **Impacto de negócio**: cada upgrade do ERP do cliente é um risco-cego — você descobre que quebrou quando o cron de 06:00 BRT zera as runs. Custo de detecção amador (alguém vê a tela vazia) e MTTR alto (precisa probe novo). Para SaaSo multi-tenant (alvo), nunca poderá garantir que dois clientes na mesma versão da Kavex apontam para a mesma minor do Conexos.
- **Métrica de baseline**: 0 endpoints versionados; 13 datas de probe nos comentários (`2026-06-01`, `2026-06-18`, `2026-05-12`, `2026-05-28`, `2026-05-29`, `2026-05-11`, `2026-05-07`, `2026-05-06`, `2026-05-08`, `2026-06-05`, `2026-06-07`, `2026-06-08`).

### F-integrability-3: `EleicaoPermutasService.executar` orquestra 5+ chamadas Conexos por candidato em série; substituição do client cascateia

- **Severidade**: P2
- **Tactic violada**: Orchestrate / Manage Resource Coupling
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:238,363,413,424,442,465,556,702,746,747`
- **Evidência (objetiva)**:
  ```
  conexosClient.listFiliais()                         :238
  conexosClient.listAdiantamentosProforma({filCod})    :363
  conexosClient.listProcessos({priCods, filCod})       :413
  conexosClient.listDeclaracaoByProcesso(...)          :424
  conexosClient.listFinanceiroAPagar({INVOICE,...})    :442
  conexosClient.listTitulosAPagar({invoice})            :465  ← PR #4: NOVO (per-invoice casável)
  conexosClient.getDetalheTitulos({adto})               :556
  conexosClient.listTitulosAPagar({adto})               :702
  conexosClient.listTitulosAPagar({adto, invoice})      :746-747
  ```
- **Impacto técnico**: 10 hits do `conexosClient.` num service só. PR #4 (`feat(permutas): permuta múltipla manual`) adicionou MAIS dois hits (`listTitulosAPagar` por invoice casável + `getDetalheTitulos` por candidato). Substituir o Conexos por outro ERP (ou particionar em dois clients — leitura + escrita) força reescrita do orquestrador. `BoundedConcurrency` mitiga, mas a topologia é "anel": qualquer alteração de assinatura no client toca o service.
- **Impacto de negócio**: tornar o painel multi-ERP (Sankhya, Protheus, …) — caso a Kavex venda para uma trading não-Columbia — exige refatoração do `EleicaoPermutasService`, não só plugar outro client. Cost-of-change cresce linearmente com features novas.
- **Métrica de baseline**: 10 call-sites de `conexosClient.*` em 1 service; orquestrador tem 7 colaboradores `@inject`.

### F-integrability-4: Zod no boundary só cobre 2 endpoints (com298 + imp019/imp223); 5 outros endpoints validam ad-hoc via `parseOptionalNumber`/`String(... ?? '')`

- **Severidade**: P2
- **Tactic violada**: Encapsulate (validate at boundary) / Backward-compatibility shims
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasSchemas.ts:28-66`; `src/backend/domain/client/ConexosClient.ts:1108-1123,1153-1162,1299-1341,1365-1430`
- **Evidência (objetiva)**:
  ```
  schemas Zod definidos: com298RowSchema (com298), declaracaoRowSchema (imp019/imp223)
  schemas Zod usados:    listAdiantamentosProforma (com298), listDeclaracaoByProcesso (imp019/imp223)
  SEM Zod boundary:      listFinanceiroAPagar (mapDocPagar), getDetalheTitulos (mapDetalheTitulos),
                          listTitulosAPagar, listBaixasTitulo, listFinanceiroAPagarByGerNum,
                          listAdiantamentoFinanceiroAPagar, listAdiantamentoFinanceiroAReceber,
                          listProcessos (normalise)
  ```
  CLAUDE.md (§Conventions) diz: *"Validate external inputs (API events, DB nullables, SSM) with Zod at boundaries"*. O schema `com308RowSchema` está **definido** em `conexosPermutasSchemas.ts:41-52` mas **nunca é importado** (grep `com308RowSchema` no service → 0 hits fora do schema/test).
- **Impacto técnico**: um Conexos que comece a devolver `docCod: null` em INVOICE quebra `String(row.docCod ?? '')` silenciosamente (`docCod=''`), e o casamento bate em registro vazio em vez de gritar. PR #4 introduziu `getDetalheTitulos` por INVOICE casável — todo o dado novo passa por `mapDetalheTitulos` SEM Zod.
- **Impacto de negócio**: corrupção silenciosa de dados de eleição. Um run com 410 adiantamentos pode incluir um candidato fantasma com `docCod=''` e o analista executa permuta sobre nada. Detectável só por inspeção manual.
- **Métrica de baseline**: 2/9 readers usam Zod (~22%). Schema `com308RowSchema` definido mas órfão (0 uses).

### F-integrability-5: `services/conexos.ts` duplica auth/refresh/retry/mutex sem abstração compartilhada — futuros clients (Nexxera/SharePoint/GED) reinventarão a roda

- **Severidade**: P2
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/services/conexos.ts:65-313` (310 linhas só de auth/login/mutex/401-retry/redact); `src/backend/domain/client/BcbClient.ts:50-138` (stateless); `src/backend/domain/client/database/PostgreeDatabaseClient.ts:30-43` (transient pattern detection)
- **Evidência (objetiva)**:
  ```
  services/conexos.ts:
    - loginPromise mutex (76)
    - LOGIN_ERROR_MAX_SESSIONS retry (175-194)
    - sid expiration (66-67, 199-203)
    - 401 retry on every authenticated{Post,Get} (244-254, 271-282)
    - redactSensitive (15-63)
  PostgreeDatabaseClient.ts:
    - transientErrorPatterns custom (30-35) — diferente padrão de erro
  Nenhuma classe abstrata AbstractAuthenticatedHttpClient existe.
  ```
- **Impacto técnico**: a primeira `/feature-new` de Nexxera vai precisar de: login stateful (sessão SFTP/REST), upload-retry, idempotência (não disparar a remessa duas vezes), redaction de credenciais bancárias. Hoje cada uma dessas concerns é reimplementada — copy-paste do `services/conexos.ts` ou reinvenção. Estimativa: ~150 LOC reescritas por client novo, vs ~30 LOC se houvesse um `AbstractAuthenticatedHttpClient`.
- **Impacto de negócio**: SISPAG (Nexxera) e Popula GED (SharePoint+GED) somam **3 novas integrações stateful** previstas. Cada uma vai pagar a duplicação. Custo extra estimado: 5–8 dias de engenharia divididos por 3 features.
- **Métrica de baseline**: 310 linhas de auth/retry/mutex em `services/conexos.ts`; 0 linhas em base/mixin compartilhado.

### F-integrability-6: Observabilidade de integration failures é stdout (`console.log [CONEXOS ✗]`) — sem agregação por endpoint, sem error rate, sem alerta

- **Severidade**: P2
- **Tactic violada**: Observability of integration failures (modern facet)
- **Localização**: `src/backend/services/conexos.ts:85-114` (logger inline); `src/backend/domain/errors/ConexosError.ts:14-32` (typed error sem dispatch)
- **Evidência (objetiva)**:
  ```
  services/conexos.ts:105    console.log(`[CONEXOS ←] ${...} → ${resp.status}${countStr}`);
  services/conexos.ts:110    console.error(`[CONEXOS ✗] ${...} → ${status}`);
  services/conexos.ts:111    if (body) console.error(`[CONEXOS ✗] body=${JSON.stringify(body)}`);
  domain/errors/ConexosError.ts:14   export default class ConexosError extends Error implements HandlerError {
                                       # 'CONEXOS_UPSTREAM_TIMEOUT' | 'CONEXOS_UPSTREAM_ERROR' — código existe, sem dispatch
  ```
- **Impacto técnico**: hoje, para saber a taxa de falha do `getDetalheTitulos` (10× mais chamado depois do PR #4), você precisa `grep` no log do Render. Não há `/metrics`, não há CloudWatch (Render), não há alerta proativo. Quando Conexos quebra um shape, você só descobre por relato de analista.
- **Impacto de negócio**: outage upstream tipo "Conexos rejeita `serviceName:'com308.finTituloFin'`" → MTTD ~horas. Cron de 06:00 BRT grava run com `status='error'` mas ninguém é notificado. Permutas Fatia 1 entra em produção sem visibilidade.
- **Métrica de baseline**: 0 dashboards; 0 alertas configurados; estimar error budget impossível sem instrumentação.

### F-integrability-7: Frontend tem 1 vazamento `fetch()` fora do wrapper `lib/api.ts`

- **Severidade**: P3
- **Tactic violada**: Restrict Communication Paths
- **Localização**: `src/frontend/lib/auth/AuthProvider.tsx:53`
- **Evidência (objetiva)**:
  ```
  src/frontend/lib/auth/AuthProvider.tsx:53      const res = await fetch(`${API}/auth/login`, {
  src/frontend/lib/api.ts:13                     const API = (process.env.NEXT_PUBLIC_API_URL || ...).replace(/\/$/, '')
  src/frontend/lib/auth/AuthProvider.tsx:12      const API = (process.env.NEXT_PUBLIC_API_URL || ...).replace(/\/$/, '')
  ```
- **Impacto técnico**: `lib/api.ts` concentra 12 chamadas `fetch` (todas para `${API}/...`); `AuthProvider.tsx` faz a 13ª (`/auth/login`) por conta própria, duplicando a constante `API` e bypassando o wrapper. Mudar header padrão (e.g. adicionar `X-Tenant-Id`) precisa lembrar dos dois lugares.
- **Impacto de negócio**: pequeno hoje (1 endpoint), mas o padrão acaba de quebrar — qualquer dev novo copia `AuthProvider` e cria um terceiro call-site.
- **Métrica de baseline**: 12/13 (~92%) call-sites no wrapper.

### F-integrability-8: Write-side do Conexos (`fin010`) inexiste — risco arquitetural #1 não tem provador de conceito

- **Severidade**: P0
- **Tactic violada**: Use an Intermediary / Tailor Interface (lado-escrita)
- **Localização**: `ontology/_inbox/migration-debt.md:42` (O3); `ontology/integrations/conexos.md:18` (`endpoints_write: fin010 (FORA DE ESCOPO nesta fatia)`); ausência total em `src/backend/domain/client/ConexosClient.ts` (0 métodos `executePermuta`/`writeBaixa`/`postFin010`)
- **Evidência (objetiva)**:
  ```
  grep -n "fin010\|executePermuta\|writeBaixa" src/backend/domain/client/ConexosClient.ts
  → 0 hits
  ontology/integrations/conexos.md:18  endpoints_write:
                                         - fin010 (FORA DE ESCOPO nesta fatia)
  migration-debt.md:42 ... "caminho de escrita no ERP que NÃO existe e nunca foi validado" ...
                       ... "Risco arquitetural #1" ...
  ```
- **Impacto técnico**: Permutas Fatia 2 (`alocacao manual N:M` da branch `feat/permutas-multiplas`, PR #4) PRECISA escrever na `fin010` para sair do read-only. Não há contrato wire validado, não há erro tipado, não há idempotência de escrita, não há shim de rollback. Quando a feature pousar, ela vai inflar `ConexosClient` em ~200 LOC sem o benefício do anti-corruption layer já planejado. SISPAG (Nexxera retorno → conciliar baixa no Conexos) sofre do mesmo risco.
- **Impacto de negócio**: feature Permutas Fatia 2 não vai a produção até alguém modelar+probar o write side; sem ele a entrega da Frente I trava no painel read-only. ROI da automação cai (analista continua executando permuta manualmente no portal Conexos).
- **Métrica de baseline**: 13/13 métodos públicos do `ConexosClient` são read-only; 0 métodos de escrita; 0 testes de write contract.

## 5. Cards Kanban

### [integrability-1] Internalizar o transporte Conexos no `domain/client/` (eliminar `services/conexos.ts`)

- **Problema**
  > O transporte real (`services/conexos.ts`) vive fora de `domain/client/`, importa axios direto, lê `process.env.CONEXOS_*` em vez de `EnvironmentProvider` e expõe um singleton de módulo que viola DI. Bloqueia migração Lambda multi-tenant (cada tenant precisa de credenciais via SSM, não env vars globais) e bloqueia o desenho do write-side `fin010`.

- **Melhoria Proposta**
  > Promover o transporte para `src/backend/domain/client/conexos/ConexosTransport.ts` `@singleton @injectable`. Mover `process.env.CONEXOS_*` para `EnvironmentProvider.conexosLogin/conexosPassword/conexosApiUrl` (já existem em `EnvironmentVars`). Deletar `services/conexos.ts` e `legacyConexosAdapter.ts` (mover `listGeneric`/`listGenericPaginated`/`getGeneric` para método privado do `ConexosClient`). Substituir `LEGACY_CONEXOS_TOKEN` por `@inject(ConexosTransport)`.

- **Resultado Esperado**
  > 0 imports `axios` fora de `domain/client/`; 0 `process.env.CONEXOS_*` fora de `EnvironmentProvider`. Testes integration podem mockar o transporte por DI normal. Caminho aberto para o write-side `fin010` (card integrability-8).

- **Tactic alvo**: Encapsulate / Use an Intermediary / Restrict Communication Paths
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-integrability-1, F-integrability-5
- **Métricas de sucesso**:
  - Arquivos `services/conexos.ts` (existente): existe → deletado
  - `grep "import axios" src/backend --include="*.ts" \| grep -v "domain/client" \| wc -l`: 2 → 0
  - `process.env.CONEXOS_*` outside `EnvironmentProvider`: 3 → 0
- **Risco de não fazer**: cada nova integração stateful (Nexxera, GED) copia o anti-pattern; SaaSo multi-tenant fica inviável; write-side `fin010` herda 310 linhas de débito.
- **Dependências**: nenhuma; é pré-requisito de integrability-8.

### [integrability-2] Adicionar contract probe + alerta de drift de shape para Conexos

- **Problema**
  > Conexos não versiona a API; quebras de contrato (renaming `mnyTitAberto`, mudança de `serviceName`, novo wrapper de resposta) são detectadas só por relato de analista, em produção. PR #4 já adicionou 2 novos pontos de contato (`getDetalheTitulos` por INVOICE, `listTitulosAPagar` por casável) sem versionamento upstream.

- **Melhoria Proposta**
  > Criar `scripts/conexos-probe.ts` que executa em CI nightly contra o dev tenant: chama os 13 endpoints públicos do `ConexosClient`, valida com `com298RowSchema`/`com308RowSchema`/`declaracaoRowSchema` E **diffs** contra fixtures JSON em `src/backend/__fixtures__/conexos/` (último probe conhecido). Alerta no Slack/email quando o diff inclui campo novo/removido/tipo-trocado. Bumpa um `CONEXOS_PROBE_DATE` no `ontology/integrations/conexos.md` automaticamente.

- **Resultado Esperado**
  > MTTD de quebra de contrato: dias → minutos. Probes empíricos datados nos comentários passam de "lembrança de campo" para "fixture que CI compara". Schemas órfãos (`com308RowSchema`) ganham uso.

- **Tactic alvo**: Versioning strategy / Contract testing / Adhere to Standards
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-integrability-2, F-integrability-4
- **Métricas de sucesso**:
  - % de endpoints com fixture pinned em `__fixtures__/conexos/`: 0 → 100%
  - Schemas Zod usados / definidos: 2/3 → 3/3 (`com308RowSchema` adotado)
  - CI nightly job: ausente → presente, com alerta SOP
- **Risco de não fazer**: Frente II (SISPAG) e III (Popula GED) entram em produção com o mesmo blind spot; cada upgrade do ERP cliente é um surto.
- **Dependências**: nenhuma.

### [integrability-3] Quebrar `EleicaoPermutasService.executar` em sub-orquestradores por etapa do funil

- **Problema**
  > Um service único orquestra 10 call-sites do `conexosClient.*` em sequência. Substituir o Conexos por outro ERP ou particionar leitura/escrita (cards 1 e 8) cascateia em 7 colaboradores. PR #4 piora o quadro: adicionou `getDetalheTitulos` por INVOICE casável dentro do mesmo loop.

- **Melhoria Proposta**
  > Extrair sub-serviços por fase do funil: `CandidatoFetcher` (Gate 1: listAdiantamentos + listProcessos), `ElegibilidadeFetcher` (Gate 2/3: detalhe + titulos + declaracao + invoice casável), `VariacaoCambialFetcher` (titulos + baixas para FIFO). Cada um recebe `conexosClient` por DI e expõe interface estável (`fetchCandidatos(params)`, `fetchElegibilidadeBundle(candidato)`). `EleicaoPermutasService` vira composição linear sobre as 3 interfaces.

- **Resultado Esperado**
  > Service principal cai de 7 → 3 colaboradores; trocar `ConexosClient` por outro ERP toca apenas os 3 fetchers, não a orquestração. PR #4-style ampliação (mais 1 hit Conexos por candidato) fica restrita a 1 fetcher.

- **Tactic alvo**: Orchestrate / Manage Resource Coupling
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Hits `conexosClient.` em `EleicaoPermutasService.ts`: 10 → 0 (movidos para fetchers)
  - Colaboradores `@inject` do `EleicaoPermutasService`: 7 → 4
- **Risco de não fazer**: Permutas Fatia 2 (write-side) duplica a orquestração; tornar o painel multi-ERP custa rewrite.
- **Dependências**: idealmente após integrability-1 (transporte limpo).

### [integrability-4] Universalizar Zod no boundary de TODOS os readers Conexos

- **Problema**
  > Apenas 2 dos 9 readers Conexos validam o wire com Zod (`listAdiantamentosProforma`, `listDeclaracaoByProcesso`). Os outros 7 (incluindo `getDetalheTitulos`, intensificado no PR #4) confiam em `String(row.docCod ?? '')` — corrupção silenciosa quando o upstream devolve `null`/tipo trocado. `com308RowSchema` está definido (`conexosPermutasSchemas.ts:41-52`) e nunca importado.

- **Melhoria Proposta**
  > Adicionar schemas Zod faltantes (`com308DetailSchema`, `com298DetailSchema`, `com308BaixaSchema`, `imp021RowSchema`) em `domain/client/permutas/conexosPermutasSchemas.ts` e plugar `.parse(row)` no início de cada mapper (`mapDocPagar`, `mapDetalheTitulos`, `mapAdiantamentoDebito`, `mapAdiantamentoCredito`, `normalise` em `listProcessos`). Falha de parse → `ConexosError('CONEXOS_SCHEMA_DRIFT', {endpoint, docCod})` (novo code).

- **Resultado Esperado**
  > Drift de shape vira erro tipado loud, não corrupção silenciosa. `com308RowSchema` deixa de ser órfão.

- **Tactic alvo**: Encapsulate (validate at boundary) / Contract testing
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - % readers com Zod no boundary: 22% (2/9) → 100% (9/9)
  - `ConexosError` codes: 2 → 3 (`CONEXOS_SCHEMA_DRIFT`)
  - Schemas órfãos: 1 → 0
- **Risco de não fazer**: PR-style ampliações (PR #4 adicionou `getDetalheTitulos` por INVOICE) propagam o problema; um Conexos lento devolve `docCod: undefined` e o painel mostra candidatos fantasma.
- **Dependências**: nenhuma.

### [integrability-5] Extrair `AbstractAuthenticatedHttpClient` (mixin/base) para reuso por Nexxera/SharePoint/GED

- **Problema**
  > `services/conexos.ts` tem 310 linhas de auth/login/mutex/401-retry/redaction sem abstração. Toda nova integração stateful (Nexxera SFTP, SharePoint Graph, GED upload) vai reimplementar do zero ou copy-paste.

- **Melhoria Proposta**
  > Criar `src/backend/domain/client/AbstractAuthenticatedHttpClient.ts` `@injectable abstract class` com: (1) `protected ensureAuth()` template-method, (2) `protected request(path, body, opts)` com 401-retry + `RetryExecutor` injetado, (3) `protected redactSensitive()` reutilizável, (4) `loginPromise` mutex genérico. `ConexosClient` (após card-1) herda. Documentar em `ontology/integrations/_template.md` como esqueleto para Nexxera/SharePoint/GED.

- **Resultado Esperado**
  > Criar um Client stateful novo custa ~30 LOC + schemas, não 150+. Política de redaction de credenciais centralizada.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-integrability-5, F-integrability-1
- **Métricas de sucesso**:
  - LOC de auth/retry/mutex em `services/conexos.ts`: 310 → 0 (deletado pelo card-1) + ~80 LOC em `AbstractAuthenticatedHttpClient`
  - LOC estimado por novo client stateful: 150 → 30
- **Risco de não fazer**: 3 integrações novas previstas (Nexxera, SharePoint, GED) pagam o débito 3 vezes — ~450 LOC extras evitáveis.
- **Dependências**: integrability-1 (transporte interno) primeiro.

### [integrability-6] Instrumentar métricas de integration health (por endpoint, por erro tipado)

- **Problema**
  > Falhas de integração são logadas em stdout (`console.log [CONEXOS ✗]`); zero agregação por endpoint, zero alerta proativo, MTTD de outage upstream é horas. PR #4 multiplicou chamadas Conexos por candidato — risco de pressão acima do `LOGIN_ERROR_MAX_SESSIONS` silenciado.

- **Melhoria Proposta**
  > (a) Trocar `console.log [CONEXOS ✗]` por `logService.error({type:'INTEGRATION_FAILURE', integration:'conexos', endpoint, status, durationMs, priCod})`. (b) Expor `/metrics` Prometheus no Express (lib `prom-client`) com counters `conexos_requests_total{endpoint,status}` e histogram `conexos_request_duration_seconds`. (c) Alerta no Slack em `error_rate > 5% por 5min`. Quando migrar para Lambda → CloudWatch Metrics + Alarm.

- **Resultado Esperado**
  > MTTD de drift Conexos: horas → minutos. Dashboard de cada endpoint na Frente I.

- **Tactic alvo**: Observability of integration failures (modern facet)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Endpoints com counter Prometheus: 0 → 13
  - Alerta error-rate configurado: ausente → presente
  - `console.log [CONEXOS *]` calls: ~5 → 0 (substituídos por `logService`)
- **Risco de não fazer**: Permutas Fatia 1 em produção sem visibilidade; SISPAG (Nexxera) e Popula GED nascem cegos.
- **Dependências**: idealmente após integrability-1.

### [integrability-7] Consolidar `AuthProvider.tsx:53` no wrapper `lib/api.ts`

- **Problema**
  > 12/13 chamadas frontend → backend usam `lib/api.ts`; a 13ª (`AuthProvider.tsx:53` `/auth/login`) duplica a constante `API` e bypassa o wrapper.

- **Melhoria Proposta**
  > Mover a chamada `/auth/login` para uma função `signIn(username, password)` em `lib/api.ts`; `AuthProvider` importa.

- **Resultado Esperado**
  > 100% das chamadas FE→BE no wrapper; mudança de header default acontece em 1 lugar.

- **Tactic alvo**: Restrict Communication Paths
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-7
- **Métricas de sucesso**:
  - `grep "fetch(" src/frontend --include="*.tsx" --include="*.ts" \| grep -v lib/api.ts \| wc -l`: 1 → 0
- **Risco de não fazer**: padrão quebrado convida réplicas; baixo risco, mas alta facilidade de cura.
- **Dependências**: nenhuma.

### [integrability-8] Modelar e probar o write-side `fin010` antes de Permutas Fatia 2

- **Problema**
  > `ConexosClient` é 100% read-only. Frente I Fatia 2 (alocação manual N:M → executar permuta) e Frente II (SISPAG → conciliar baixa) ambas precisam escrever no Conexos (`fin010`). Não há contrato wire validado, não há erro tipado, não há idempotência de escrita, não há rollback shim. Documentado como risco arquitetural #1 em `migration-debt.md:42`.

- **Melhoria Proposta**
  > Disparar `/feature-new permutas-write "executar permuta na fin010 do Conexos via ConexosClient.executePermuta"`. OfficeHoursInterviewer deve cobrir: (1) endpoint wire exato e método HTTP, (2) payload mínimo de execução, (3) shape do response (sucesso/falha tipada), (4) chave de idempotência (Conexos aceita request-id?), (5) reversão / chamada inversa. Probe contra dev tenant com docCod sintético. Saída: novo método `executePermuta({docCodAdto, docCodInvoice, valor, filCod, idempotencyKey})` no `ConexosClient`, schema Zod do response, fixture pinned (card integrability-2).

- **Resultado Esperado**
  > Métodos públicos de escrita: 0 → 1 (`executePermuta`); erros tipados de escrita: 0 → ≥2 (`CONEXOS_WRITE_REJECTED`, `CONEXOS_WRITE_CONFLICT`). Permutas Fatia 2 destrava.

- **Tactic alvo**: Tailor Interface (lado-escrita) / Use an Intermediary / Manage Resource Coupling
- **Severidade**: P0
- **Esforço estimado**: L (1–2sem) — inclui investigação wire + probes empíricos
- **Findings relacionados**: F-integrability-8, F-integrability-3
- **Métricas de sucesso**:
  - Métodos write em `ConexosClient`: 0 → 1
  - Schemas Zod de write: 0 → 1
  - Fixture de write pinned em `__fixtures__/conexos/`: ausente → presente
  - Erros tipados de write: 0 → ≥2
- **Risco de não fazer**: Frente I Fatia 2 e Frente II (SISPAG) bloqueadas; ROI da Frente I parado no painel read-only; analista mantém execução manual no portal Conexos. Risco arquitetural #1 segue aberto.
- **Dependências**: integrability-1 (transporte interno) MUITO recomendado antes; integrability-4 (Zod universal) recomendado depois — o método de write nasce com schema próprio desde o dia 1.

## 6. Notas do agente

- Score 6.0 reflete: o lado-leitura está bem desenhado (domain-shaped, Zod nos pontos novos, fixtures realistas, anti-corruption via `legacyConexosAdapter`), mas o **transporte** vive em `services/conexos.ts` fora do `domain/client/` (raiz dos P1 #1, #2 e #5) e o **write-side** inexiste (P0 #8). Os 2 P0/P1 críticos vetam meta acima de 7.
- Cross-QA: **Modifiability** — F-integrability-1 (transporte fora do client) e F-integrability-3 (orquestrador acoplado) são os mesmos offenders que o consolidador deve flagger lá. **Security** — `services/conexos.ts:144-145` lê senha Conexos via `process.env` (fora do `EnvironmentProvider`) e usa `redactSensitive` para mascarar; F-integrability-1 sobrepõe-se ao card de Security sobre vazamento de credenciais. **Fault Tolerance** — F-integrability-6 (observabilidade) e F-integrability-4 (Zod no boundary) costuram com cards de detecção/contenção de falhas externas. **Testability** — F-integrability-4 (Zod) e F-integrability-2 (contract probe) compõem o card de fixtures recorded de produção.
- Métrica não-medível registrada: per-endpoint error-rate / p95 latência. Recomendação dentro do card integrability-6.
- Escopo: lido o PR #4 (`feat(permutas): permuta múltipla manual`) onde o acoplamento Conexos amplificou (`EleicaoPermutasService.ts:465,556`); o número "10 hits de conexosClient.*" no F-3 inclui as 2 chamadas novas.
