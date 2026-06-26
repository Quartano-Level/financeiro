---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-26-1708
agent: qa-integrability
generated_at: 2026-06-26T17:30:00-03:00
scope: all
score: 7
findings_count: 7
cards_count: 7
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto (proposta v1 — Frentes II SISPAG e III Popula GED) | Acrescentar **3 integrações net-new** (Nexxera remessa/retorno, GED upload, SharePoint PDF) + **escrita SISPAG** sobre `com298`/`fin010` reusando o padrão dos sub-clients que o CC-2 acabou de extrair | `src/backend/domain/client/` (`ConexosBaseClient` + `ConexosBaixaClient`/`…FinanceiroClient`/`…TitulosClient`/`…CadastroClient`), `EnvironmentProvider`, `appContainer.ts`, `ontology/integrations/` | Produção Render/Vercel (sem AWS/Terraform), 1 tenant Columbia, escrita `fin010` gated por `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`; legado `services/conexos.ts` (sessão) ainda em pé | Cada integração nova nasce em sub-client `@singleton() @injectable()` próprio com Zod no boundary, retry tipado via `ConexosBaseClient.runWithRetry`/`RetryExecutor`, segredos via `EnvironmentProvider`, contrato versionado em `ontology/integrations/<name>.md`. Substituir provedor (Nexxera→outro banco) muda 1 sub-client. | Marginal cost por nova família ≤ 1 sub-client (~250–500 LOC) + 1 schema Zod + 1 doc ontology; **0** arquivos de service tocados ao trocar provedor por trás do mesmo contrato; ≥80% das respostas externas parseadas por Zod; 100% de credenciais via `EnvironmentProvider`. |

> Realidade hoje: pós-CC-2, o god-client `ConexosClient` (1.956 LOC) foi **substituído** por 1 base + 4 sub-clients por família wire (com298, com308, imp/cadastro, fin010), com sub-client por composição (`@inject(ConexosBaseClient)`). O padrão para adicionar Nexxera/GED/SharePoint agora é **claro e referenciável**. Permanece como dívida o legado `services/conexos.ts` (341 LOC, lê `process.env.CONEXOS_*`) + `legacyConexosAdapter.ts` (120 LOC) — auth Conexos ainda em 2 camadas.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC do maior client | **703** (`ConexosFinanceiroClient.ts`) — era 1.956 (`ConexosClient.ts`) | ≤ 700 (1 client por endpoint-family) | ✅ no fio | `wc -l src/backend/domain/client/ConexosFinanceiroClient.ts` |
| Sub-clients Conexos | **4 family** (`Baixa`, `Financeiro`, `Titulos`, `Cadastro`) + **1 base** (`ConexosBaseClient`) | ≥ 1 por família wire | ✅ | `ls src/backend/domain/client/Conexos*.ts` |
| Famílias wire por sub-client | **1** cada (Baixa=fin010, Financeiro=com298, Titulos=com308, Cadastro=imp/filiais) | 1 | ✅ | leitura dos 4 arquivos |
| Métodos públicos por sub-client (domínio) | Baixa **13**, Financeiro **6**, Titulos **3**, Cadastro **4** | ≤ 10 por client | ⚠️ Baixa estoura (13: 5-step + 4 fluxo + 4 list) | `grep -c '^\s*public ' src/backend/domain/client/Conexos*.ts` |
| Métodos infra expostos pelo `ConexosBaseClient` | **13** (incl. `getGeneric/postGeneric/deleteGeneric/listGenericPaginated` + `paginate/callList/runWithRetry/parseDate/…`) | n/a (composição interna) | ⚠️ generics expostos como `public`; só usados por sub-clients (0 vazamentos para service) | `grep -rn 'conexosBaseClient' src/backend/domain/service` → 0 |
| Generics chamados fora do client layer | **0** (sub-clients consomem `base.getGeneric/postGeneric/…`; services injetam **só** sub-clients) | 0 | ✅ | `grep -rn '@inject(ConexosBaseClient)' src/backend/domain/service` → 0 |
| Clients de domínio implementados | `ConexosBaseClient` + 4 sub-clients + `BcbClient` | + Nexxera, GED, SharePoint | ⚠️ (3 ausentes — mas template agora existe na prática) | `ls src/backend/domain/client/` + `migration-debt.md:46` (O7) |
| Camadas de auth Conexos | **2** paralelas: sub-clients → `ConexosBaseClient` → `LegacyConexosShape` (DI) **+** `services/conexos.ts` (singleton solto, fonte da sessão real) | 1 | ❌ (segue dívida F-integrability-2 do run anterior) | `services/conexos.ts:341`, `legacyConexosAdapter.ts:22-39` |
| Zod no boundary (sub-clients Conexos) | **5 sites** em 5 métodos / **26 métodos de domínio** ≈ **19%** (era 4/28 = 14%) | ≥ 80% | ❌ ainda baixo, mas write-side gravada validada | `grep -n '\.parse(\|\.safeParse(' src/backend/domain/client/Conexos*Client.ts` |
| Zod no write-side `fin010` (5-step handshake) | **2 / 5** passos (passo 1 `criarBordero` + passo 5 `gravarBaixaPermuta`) | 5 / 5 | ⚠️ passos 2/3/4 (`validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`) seguem `cast` sem `.parse` | `grep -n 'SCHEMA.parse' src/backend/domain/client/ConexosBaixaClient.ts` |
| Endpoints externos versionados (URL/header) | **0 / 6** (Conexos `/api/...`, BCB `/dados/serie/.../dados` — sem `vN`) | onde o provedor expor | ⚠️ Conexos sem versão pública; BCB também | `grep '/v[0-9]\|api-version' src/backend/domain/client src/backend/services` → 0 hits |
| Touchpoints serviço→sub-client Conexos | **22** (4 serviços: Eleicao 7, Bordero 6, Alocacao 4, Reconciliacao 5) — era 34 contra `conexosClient` único | n/a; blast-radius por família | ⚠️ menor + distribuído | `grep -rn 'conexos\(Baixa\|Financeiro\|Titulos\|Cadastro\)Client\.' src/backend/domain/service` |
| Serviços que injetam ≥ 3 sub-clients | **3** (`EleicaoPermutasService`, `AlocacaoPermutasService`, `BorderoGestaoService`) — 12, 10, 6 @inject totais | ≤ 5 collaborators preferível | ⚠️ orquestradores com fan-out alto | `grep -c '^\s*@inject' src/backend/domain/service/permutas/*.ts` |
| Fixture-based contract tests | **0** (segue 0 — `ConexosSubClients.test.ts` tem 81 `it()` mockados via `jest.Mocked<LegacyConexosShape>`) | ≥ 1 por endpoint write-side (5 do fin010) | ❌ | `grep -rn 'fixture\|recorded' src/backend/domain/client/*.test.ts` → 0 hits |
| `titCod: 1` hardcoded em `ReconciliacaoPermutaService` | **0 no caminho principal** (era 4) — agora itera `titulos 1..N` via `listTitulosAPagar`; 1 fallback compat-título-único (`:322`) | 0 | ✅ resolvido (v0.9.0, decisão A — opção do Yuri + HAR multi-título) | `ontology/_inbox/permuta-multi-titulo-pendente.md` (status RESOLVIDO); `ReconciliacaoPermutaService.ts:299-345` |
| `process.env.X` fora do `EnvironmentProvider` em service/client | **5** (`BcbClient.ts:123` `BCB_CDI_FALLBACK`; `services/conexos.ts:80,144,145` `BASE_URL/USERNAME/PASSWORD`; `config.ts:9` `CONEXOS_FIL_COD`) — 12 ocorrências totais somando bootstrap aceitável | 0 em client/service | ❌ (segue dívida F-integrability-8 do run anterior) | `grep -rn 'process\.env\.' src/backend --include='*.ts' | grep -v EnvironmentProvider | grep -v test` |
| Hard-coded tenant URL | **1** (`services/conexos.ts:80` `https://columbiatrading.conexos.cloud/api`) — `EnvironmentProvider` resolve o resto | 0 | ❌ idem | grep direto |
| Wrapper único frontend→backend | **1 arquivo** (`src/frontend/lib/api.ts`) com 23 sites `fetch` | 1 wrapper | ✅ | `grep -rn 'fetch(\|axios' src/frontend --include='*.ts*'` |
| Axios/fetch em service/repo/route (não-teste) | **0** (todo HTTP atravessa client/adapter) | 0 | ✅ | grep |
| Doc `ontology/integrations/conexos.md` refletindo sub-clients | **0 menções** a `ConexosBaseClient/BaixaClient/…` (7 referências ao antigo `ConexosClient.ts`) | atualizado pós-CC-2 | ❌ doc divergiu do código | `grep -n 'ConexosBase\|ConexosBaixa\|sub-client' ontology/integrations/conexos.md` → 0 |
| Observabilidade de falha por dependência | logs `[CONEXOS →/←/✗]` em `services/conexos.ts:85-114` + `ConexosError` tipado (`statusCode`, `retryable`); sem contador per-endpoint | per-dep error rate + p95 latency | ⚠️ logs presentes, métricas ausentes | `services/conexos.ts:85-114`, `domain/errors/ConexosError.ts` |

> ⚠️ **Não medível localmente**: per-dependency error rate, p95 de chamada Conexos, MTTR. Requer log shipping (Render→Datadog/Grafana) ou CloudWatch (não existe). Recomendação: instrumentar `LogService.metric(...)` que o `[CONEXOS →]/[← ✗]` já cobre semanticamente.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | Pós-CC-2: cada família wire tem sub-client com métodos de domínio (`criarBordero`, `gravarBaixaPermuta`, `listInvoicesFinalizadas`, `getDetalheTitulos`, `listProcessos`, `listDeclaracaoByProcesso`). `ConexosBaseClient` ainda **expõe `getGeneric/postGeneric/deleteGeneric/listGenericPaginated` como `public`** — mas, na prática, NENHUM service do `domain/service/**` injeta `ConexosBaseClient` (0 hits). Sub-clients consomem por composição. Adapter legado `legacyConexosAdapter` ainda vaza `postGeneric/getGeneric` (`legacyConexosAdapter.ts:94-105`) por interface. | ✅ presente (subiu de ⚠️) | `ls src/backend/domain/client/Conexos*Client.ts`; `grep -rn '@inject(ConexosBaseClient)' src/backend/domain/service` → 0 |
| Use an Intermediary | `LegacyConexosShape` (`ConexosBaseClient.ts:37-70`) interpõe o legado `services/conexos.ts` permitindo trocar transporte sem mudar sub-clients; sub-clients interpostos entre service e base. | ✅ presente | `appContainer.ts:5,63`; `LEGACY_CONEXOS_TOKEN` em `ConexosBaseClient.ts:5` |
| Restrict Communication Paths | Services só dependem de sub-clients (via `@inject`); 0 importam axios/fetch. Sub-clients só dependem do `ConexosBaseClient`. | ✅ presente | `grep -rn axios\\|fetch src/backend/domain/service src/backend/domain/repository` → 0 (fora de tests) |
| Adhere to Standards | HTTP/JSON puro; sem OpenAPI/JSON Schema do provedor; BCB SGS é REST público sem versão. | ⚠️ parcial | Conexos é proprietário; `ontology/integrations/conexos.md` é o único contrato escrito (e desatualizado pós-CC-2) |
| Abstract Common Services | `ConexosBaseClient.runWithRetry/callList/paginate/parseDate/parseOptionalNumber/isPago` centraliza retry/paginate/coerção; `RetryExecutor`, `FallbackExecutor`, `PollExecutor` em `domain/libs/executor/`. CC-2 zerou a duplicação de auth/retry entre sub-clients. | ✅ presente (subiu) | `ConexosBaseClient.ts:166-318` |
| Discover Service | URLs/credenciais por env (`conexosApiUrl`, `conexosLogin`, `conexosPassword`, `conexosFilCod` resolvidos em `EnvironmentProvider`); sem registry dinâmico. Hardcode tenant residual em `services/conexos.ts:80`. | ⚠️ parcial | `appContainer.ts:54-61`; `services/conexos.ts:80` |
| Tailor Interface | Sub-clients traduzem wire (`docCod` string vs number, `dpeNomPessoa→importador`, `parseDate` BR-noon-shift) para o domínio; `BORDERO_CRIADO_SCHEMA`/`BAIXA_GRAVADA_SCHEMA` exigem `borCod`/`bxaCodSeq` numéricos válidos. | ✅ presente | `ConexosBaixaClient.ts:20-35,88,476`; `ConexosBaseClient.parseDate:281` |
| Configure Behavior | Toggles `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` (default seguro: dry-run on) lidos via `EnvironmentProvider`; consumidos em `ReconciliacaoPermutaService`. | ✅ presente | `ReconciliacaoPermutaService.ts:122-125` (gate write) |
| Manage Resources | Pool pg `max=5` + advisory lock; sessão Conexos via mutex de login + retry 401 + sessionToKill na MAX_SESSIONS (legado `services/conexos.ts:76-197`). | ✅ presente | `PostgreeDatabaseClient.ts:26-42`, `services/conexos.ts:76-197` |
| Orchestrate | `EleicaoPermutasService` (12 `@inject`), `AlocacaoPermutasService` (10), `BorderoGestaoService` (6) orquestram sub-clients + repositórios sincronamente. Choreography por eventos não existe. | ⚠️ parcial | `EleicaoPermutasService.ts:104-117` (12 deps) |
| Manage Resource Coupling | Auth Conexos compartilhada via `getSid` (ADR-0007 fechou as 2 sessões paralelas em sub-clients); mas legado `services/conexos.ts` segue **a** fonte da sessão real — toda a sessão vive lá. | ⚠️ parcial (legado em pé) | `services/conexos.ts:222-227`, `legacyConexosAdapter.ts:6-15` |
| **Contract Testing** | Mocks `jest.Mocked<LegacyConexosShape>` em `ConexosSubClients.test.ts` (81 `it()`) — sem fixtures HAR gravadas. Probes (2026-06-18/-23/-25) ficaram em prosa nos comentários. | ❌ ausente | `grep fixture\|recorded src/backend/domain/client/*.test.ts` → 0 |
| **Versioning Strategy** | Nenhuma — Conexos `/api` sem `vN`; BCB SGS idem. | ❌ ausente | `grep /v[0-9]\|api-version src/backend/domain/client src/backend/services` → 0 |
| **Backward-compatibility Shims** | `legacyConexosAdapter` é o shim do auth legado; quirk em `ConexosFinanceiroClient` (porta do `responseData` 400→200 herdado) sem rastro de versão observada. | ⚠️ parcial | `legacyConexosAdapter.ts:1-15` |
| **Observability of Integration Failures** | Logs `[CONEXOS →/←/✗]` no console (`services/conexos.ts:85-114`); `ConexosError` tipado (`statusCode 504`, `retryable`); sem contador per-endpoint. | ⚠️ parcial | `services/conexos.ts:85-114`, `domain/errors/ConexosError.ts:14-40` |

## 4. Findings (achados)

### F-integrability-1: God-client `ConexosClient` ELIMINADO; resta micro-polimento nos sub-clients (BaixaClient com 13 públicos)

- **Severidade**: P3 (era P1 — rebaixado: o estrutural foi resolvido)
- **Tactic violada**: Encapsulate (anti-monolítico)
- **Localização**: `src/backend/domain/client/ConexosBaixaClient.ts:52-478` (única família que estoura ≤10 públicos)
- **Evidência (objetiva)**:
  ```
  $ wc -l src/backend/domain/client/Conexos*.ts | sort
        263 ConexosCadastroClient.ts
        319 ConexosBaseClient.ts
        338 ConexosTitulosClient.ts
        481 ConexosBaixaClient.ts
        703 ConexosFinanceiroClient.ts
  # maior agora = 703 LOC (era 1.956 no monolítico ConexosClient.ts)

  $ grep -c '^\s*public ' src/backend/domain/client/Conexos*.ts
      Base: 13 (infra: ensureSid, getFiliais, getFilCodDefault, getGeneric, postGeneric, deleteGeneric, listGenericPaginated, runWithRetry, callList, paginate, parseDate, parseOptionalNumber, isPago)
      Baixa: 13 (criarBordero + 5-step + 4 lifecycle borderô + listBaixas/listBorderos/excluirBaixa/getBordero)
      Financeiro: 6 (com298 + sub-variants)
      Titulos: 3 (com308)
      Cadastro: 4 (filiais + processos + declaracoes)
  ```
  CC-2 cumpriu o card `integrability-1` do run 0058: famílias por client `5 → 1`, LOC do maior `1.956 → 703`, métodos de domínio distribuídos por família. Resta apenas `ConexosBaixaClient` com 13 públicos (acima do alvo ≤10) — porque a família `fin010` inclui o handshake 5-step + 5 lifecycle (excluir/finalizar/cancelar/estornar/listBorderos) + 3 leituras. Aceitável (todos do mesmo wire; agrupar a sub-família "lifecycle" em um Borderô-only client seria sobre-engenharia).
- **Impacto técnico**: nenhum imediato — `BaixaClient` ainda cabe na cabeça (481 LOC). Adicionar SISPAG vira `ConexosPagamentoClient` novo (com298 escrita), sem inflar nenhum existente.
- **Impacto de negócio**: integrability marginal restaurada; pipeline desserializou (cada `/feature-new` toca seu sub-client). Não há mais merge-hell no único arquivo Conexos.
- **Métrica de baseline**: 4 sub-clients de família + 1 base; LOC do maior `703` (alvo ≤ 700 — no fio); 1 sub-client estoura `≤10` públicos (Baixa = 13).

### F-integrability-2: Camada dupla de auth Conexos persiste — `services/conexos.ts` (341 LOC) + `legacyConexosAdapter.ts` (120 LOC) seguem em pé

- **Severidade**: P1 (sem mudança — estrutural intocado pelo CC-2)
- **Tactic violada**: Use an Intermediary / Manage Resource Coupling
- **Localização**: `src/backend/services/conexos.ts:65-342` + `src/backend/domain/client/legacyConexosAdapter.ts:22-39` + `src/backend/domain/appContainer.ts:56-63`
- **Evidência**:
  ```
  $ wc -l src/backend/services/conexos.ts src/backend/domain/client/legacyConexosAdapter.ts
       341 src/backend/services/conexos.ts
       120 src/backend/domain/client/legacyConexosAdapter.ts
       461 total

  # services/conexos.ts:80
  baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api'
  # services/conexos.ts:144-145
  const username = process.env.CONEXOS_USERNAME;
  const password = process.env.CONEXOS_PASSWORD;
  ```
  Após CC-2, a tubulação é: `service → @inject(ConexosBaixaClient) → @inject(ConexosBaseClient) → LegacyConexosShape (DI) → services/conexos.ts singleton solto`. O sub-client é DI puro; o LEGADO segue carregando a sessão e lendo `process.env.CONEXOS_*`. Migration-debt B3 (`ontology/_inbox/migration-debt.md:19`) classifica como PARTIAL — não houve avanço na auth.
- **Impacto técnico**: 2 caminhos para mudar timeout, headers, retry, login mutex, redaction; o legado lê `process.env.CONEXOS_*` direto (viola Inviolable Rule #8), bypass-ando o `EnvironmentProvider` que SSM-resolve em prod (Lambda).
- **Impacto de negócio**: troca do tenant Columbia para outro cliente exige editar URL em 2 lugares; novos integradores (Nexxera/GED) não sabem qual é a "fonte da verdade" do padrão de auth.
- **Métrica de baseline**: 461 LOC de legado (341 + 120); 3 `process.env.CONEXOS_*` (`BASE_URL/USERNAME/PASSWORD`); 1 hardcode de tenant.

### F-integrability-3: Zod no boundary cobre 19% dos sub-clients (5/26 métodos de domínio); passos 2/3/4 do handshake `fin010` seguem com `cast` sem `.parse`

- **Severidade**: P1 (sem mudança — passos write críticos validados ainda são 2 de 5)
- **Tactic violada**: Tailor Interface / Contract Testing (Validate Input)
- **Localização**: `src/backend/domain/client/ConexosBaixaClient.ts:88,476` (passos 1 e 5 — `BORDERO_CRIADO_SCHEMA`, `BAIXA_GRAVADA_SCHEMA`); `…FinanceiroClient.ts:286,343` (`com298RowSchema`); `…CadastroClient.ts:227` (`declaracaoRowSchema`). Sem Zod: `validarTituloBaixa` (`:351-383`), `validarTituloPermuta` (`:385-412`), `atualizarValorLiquido` (`:414-462`) — todos `postGeneric<Fin010ValidacaoResponse<...>>` por `cast`.
- **Evidência**:
  ```
  $ grep -n '\.parse(\|\.safeParse(' src/backend/domain/client/Conexos*Client.ts
  ConexosBaixaClient.ts:88: BORDERO_CRIADO_SCHEMA.parse(raw)
  ConexosBaixaClient.ts:476: BAIXA_GRAVADA_SCHEMA.parse(raw)
  ConexosFinanceiroClient.ts:286: com298RowSchema.parse(row)
  ConexosFinanceiroClient.ts:343: com298RowSchema.safeParse(row)
  ConexosCadastroClient.ts:227: declaracaoRowSchema.parse(row)
  # 5 sites / 26 métodos de domínio = 19% (era 14%)
  # Write-side fin010 validado: 2 de 5 passos (criarBordero, gravarBaixaPermuta) — IDs persistidos.
  ```
- **Impacto técnico**: o ERP pode mudar shape dos 3 passos intermediários (`mnyTitAberto`, `bxaMnyValor`, juros calculado pelo ERP) sem testes notarem; o erro vai aparecer 1 hop adiante como `NaN` em SQL ou cálculo silenciosamente errado. CC-2 melhorou pouco aqui (foi cirúrgico: focado na divisão estrutural).
- **Impacto de negócio**: probabilidade de "baixa fantasma" / over-payment em passos intermediários cresce em silêncio. CLAUDE.md exige "validate external inputs … with Zod at boundaries".
- **Métrica de baseline**: 5/26 ≈ 19% (alvo ≥ 80%); write-side `fin010`: 2/5 passos.

### F-integrability-4: 3 integrações net-new (Nexxera, GED, SharePoint) seguem com 0 client / 0 ontology doc / 0 config — mas template existe na prática

- **Severidade**: P1 (sem mudança — domínio intocado; o que mudou é que agora há **referência** boa)
- **Tactic violada**: Encapsulate / Discover Service
- **Localização**: ausência em `src/backend/domain/client/` (sem `NexxeraClient`/`GedClient`/`SharePointClient`) + `EnvironmentProvider.ts` + `ontology/integrations/`
- **Evidência**:
  ```
  $ ls src/backend/domain/client/
  BcbClient.ts ConexosBaixaClient.ts ConexosBaseClient.ts ConexosCadastroClient.ts \
    ConexosFinanceiroClient.ts ConexosTitulosClient.ts database/ legacyConexosAdapter.ts permutas/

  $ ls ontology/integrations/
  conexos.md
  ```
  `ontology/_inbox/migration-debt.md:46` (O7): "Integrações Nexxera / GED / SharePoint inexistentes (sem client, sem config). Net-new por `/feature-new`." **Avanço lateral**: o padrão concreto a copiar agora é claro (sub-client por família + `ConexosBaseClient`-style por composição + Zod em IDs persistidos). Falta apenas formalizar em `ontology/integrations/_template.md`.
- **Impacto técnico**: cada uma vai precisar repetir o padrão (`@singleton @injectable`, retry, Zod boundary, env via SSM, doc ontology). O risco de copiar o god-client antigo foi eliminado pelo CC-2.
- **Impacto de negócio**: Frente II (SISPAG) e Frente III (Popula GED) seguem bloqueadas. Marginal cost agora ≈ "ler 1 sub-client de ~500 LOC" (antes era "ler 1956 LOC"). Pipe `/feature-new` para Nexxera/GED tem onde se ancorar.
- **Métrica de baseline**: 0 clients, 0 docs `ontology/integrations/`, 0 entradas em `EnvironmentVars` para os 3 provedores. Sub-clients Conexos viraram referência implícita.

### F-integrability-5: Doc `ontology/integrations/conexos.md` ficou para trás pós-CC-2 (7 menções ao `ConexosClient` morto)

- **Severidade**: P2 (novo achado)
- **Tactic violada**: Adhere to Standards (doc-of-record desincronizado)
- **Localização**: `ontology/integrations/conexos.md` (frontmatter + tabela de endpoints) — 7 referências a `ConexosClient.ts:NNN` (`ConexosClient.ts:709+`, `:467+`, `:1301+`, `:1155+`, etc.) E zero menção a `ConexosBaseClient`/`ConexosBaixaClient`/`ConexosFinanceiroClient`/`ConexosTitulosClient`/`ConexosCadastroClient` nem ao CC-2.
- **Evidência**:
  ```
  $ grep -n 'ConexosClient\.' ontology/integrations/conexos.md | wc -l
  7
  $ grep -n 'ConexosBase\|ConexosBaixa\|ConexosFinanceiro\|ConexosTitulos\|ConexosCadastro\|sub-client\|CC-2' \
        ontology/integrations/conexos.md
  (sem hits)
  ```
- **Impacto técnico**: o `_index.json` / `_coverage.json` da ontologia pode estar referenciando arquivos que não existem mais (`ConexosClient.ts` foi REMOVIDO conforme `_shared-metrics.md:14`). Próximo `/feature-new` que ler `conexos.md` para se ancorar vai bater em link morto.
- **Impacto de negócio**: divergência code↔doc sufoca a vantagem do CC-2 — o padrão extraído fica invisível para quem ler a doc. Próximo integrador (Nexxera/GED) chega à mesma confusão.
- **Métrica de baseline**: 7 menções a arquivo removido; 0 menções aos 5 novos arquivos; 1 ADR (?) sobre CC-2 ainda não amarrado à doc.

### F-integrability-6: Zero versionamento de API externa + zero fixture HAR (sem mudança vs run anterior)

- **Severidade**: P2 (sem mudança)
- **Tactic violada**: Versioning Strategy / Backward-compatibility Shims / Contract Testing
- **Localização**: `services/conexos.ts:80` (`/api` sem versão), `BcbClient.ts:11-72` (sem `v`); `ConexosSubClients.test.ts:1-1657` (81 `it()` mockados, sem fixtures)
- **Evidência**:
  ```
  $ grep -rn '/v[0-9]\|version=\|api-version' src/backend/domain/client src/backend/services
  (sem hits)

  $ grep -rn 'fixture\|recorded' src/backend/domain/client/*.test.ts
  (sem hits)
  ```
  As HARs reais (probes 2026-06-18/-23/-25, mais a nova de 2026-06-26 confirmando multi-título) ficaram em `ontology/_inbox/` em prosa. Mudanças de shape JÁ aconteceram (probe 2026-06-01 doc 10649: HTTP 400 com `responseData` válido). Sem fixtures, cada quirk vira código defensivo sem rastro de "qual versão do contrato observamos".
- **Impacto técnico**: o contrato real do ERP NÃO está fixado em teste — só na cabeça do Yuri e nos comentários multi-linha dos sub-clients. Próxima probe = re-derivar manualmente. Trocar provedor (Nexxera→outro banco) sem fixture é trocar no escuro.
- **Impacto de negócio**: o sistema mais perto de quebrar com upgrade do Conexos não tem rede de segurança automatizada.
- **Métrica de baseline**: 0 fixture-based tests, 0/6 endpoints externos versionados.

### F-integrability-7: `process.env.X` em service/client persiste em 5 locais (BcbClient + `services/conexos.ts`) — vinculado a F-integrability-2

- **Severidade**: P2 (sem mudança)
- **Tactic violada**: Configure Behavior / Discover Service
- **Localização**: `src/backend/domain/client/BcbClient.ts:123` (`BCB_CDI_FALLBACK`), `src/backend/services/conexos.ts:80,144-145` (`CONEXOS_BASE_URL/USERNAME/PASSWORD`), `src/backend/config.ts:9` (`CONEXOS_FIL_COD`). Excluídos os bootstrap/handler aceitáveis (`index.ts`, `ApiGatewayHandler.ts`, `jobs/seed-admin.ts`, `http/rateLimit.ts`, `http/authEnv.ts`).
- **Evidência**:
  ```
  $ grep -rn 'process\.env\.' src/backend --include='*.ts' \
       | grep -v EnvironmentProvider | grep -v '\.test\.' | wc -l
  12   # total; 5 em service/client de fato
  ```
  Cito o pior caso (cliente externo lendo env direto):
  ```
  // src/backend/domain/client/BcbClient.ts:123
  const fallback = process.env.BCB_CDI_FALLBACK;
  ```
- **Impacto técnico**: alvo Lambda exige SSM via `EnvironmentProvider`; esses leak-points não vão funcionar quando o deploy migrar (e mesmo hoje, no Render, viram dupla fonte de verdade). Bloqueia o ganho do CC-2: o sub-client `Baixa` é DI puro, mas a sessão dele depende do legado que lê env direto.
- **Impacto de negócio**: Inviolable Rule #8 violada de forma rastreável. Toda nova integração que copiar o padrão `BcbClient` herda o problema.
- **Métrica de baseline**: 5 ocorrências em service/client (alvo 0); 1 hardcode de tenant URL.

## 5. Cards Kanban

### [integrability-1] Eliminar a camada `services/conexos.ts` legada — mover sessão Conexos para dentro do `ConexosBaseClient`

- **Problema**
  > Com o CC-2 feito, sobra um único bottleneck estrutural: `services/conexos.ts` (341 LOC, singleton solto) ainda detém a sessão Conexos (login mutex, cookie, retry-401, redaction) e lê `process.env.CONEXOS_USERNAME/PASSWORD/BASE_URL` direto, violando Inviolable Rule #8. O `legacyConexosAdapter.ts` (120 LOC) é um pass-through dynamic-import que só existe para essa dupla camada. Migração para Lambda+SSM esbarra aqui.
- **Melhoria Proposta**
  > Mover axios + sid + mutex + 401-retry para dentro do `ConexosBaseClient`, consumindo `EnvironmentProvider` via `@inject`. Apagar `services/conexos.ts` e `legacyConexosAdapter.ts`. `appContainer.ts` registra `ConexosBaseClient` direto, sem `LEGACY_CONEXOS_TOKEN`. Os 4 sub-clients seguem intocados (a interface `getGeneric/postGeneric/…` do base permanece).
- **Resultado Esperado**
  > 1 caminho de auth Conexos. `process.env.CONEXOS_*` deixa de ser lido fora de `EnvironmentProvider`. ~461 LOC removidas.
- **Tactic alvo**: Use an Intermediary / Manage Resource Coupling
- **Severidade**: P1
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-integrability-2, F-integrability-7
- **Métricas de sucesso**:
  - Camadas de auth Conexos: 2 → 1
  - process.env.CONEXOS_* fora do EnvironmentProvider: 3 → 0
  - LOC de legado eliminadas: ~461 (`services/conexos.ts` + `legacyConexosAdapter.ts`)
  - `LEGACY_CONEXOS_TOKEN`: presente → removido
- **Risco de não fazer**: ao migrar para Lambda + SSM, o legado lê env vazio → quebra em produção; 2 mutexes paralelos podem reaparecer; redaction divergir; pipe `/feature-new Nexxera` copia o padrão sujo.
- **Dependências**: nenhuma técnica — ordem inversa do CC-2 (que cuidou da família de endpoints; este card cuida da fonte da sessão).

### [integrability-2] Zod no boundary para 100% das respostas dos sub-clients (especialmente passos 2/3/4 do `fin010`)

- **Problema**
  > 5 de 26 métodos de domínio dos sub-clients validam a resposta com Zod (19%; era 14% pré-CC-2 → CC-2 era estrutural, não tocou contratos). Os passos 2/3/4 do handshake `fin010` (`validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido` — `ConexosBaixaClient.ts:351-462`) usam `cast` (`postGeneric<Fin010ValidacaoResponse<TituloBaixaValidacao>>`) sem `.parse`. Uma mudança silenciosa de shape no ERP (ex.: `bxaMnyValor` virar string) propaga como `NaN` no SQL/cálculo. CLAUDE.md exige "validate external inputs … with Zod at boundaries".
- **Melhoria Proposta**
  > Criar `client/permutas/conexosFin010Schemas.ts` com `FIN010_VALIDACAO_TITULO_BAIXA`, `FIN010_VALIDACAO_TITULO_PERMUTA`, `FIN010_ATUALIZA_LIQUIDO` (todos coercivos + `.passthrough()`). Estender `conexosPermutasSchemas.ts` com `com308RowSchema` real (já existe; aplicar nos métodos `getDetalheTitulos`/`listTitulosAPagar`/`listBaixasTitulo` do `ConexosTitulosClient`). Aplicar `.parse()` em todo retorno `postGeneric/getGeneric/listGenericPaginated`. Falha de parse vira `ConexosError({code: 'CONEXOS_UPSTREAM_ERROR', message: 'schema_mismatch'})`.
- **Resultado Esperado**
  > 100% das respostas write-side validadas + ≥ 80% das read-side.
- **Tactic alvo**: Tailor Interface / Contract Testing (Validate Input)
- **Severidade**: P1
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-integrability-3, F-integrability-6
- **Métricas de sucesso**:
  - Métodos de domínio com Zod no boundary: 5/26 → ≥ 21/26 (≥ 80%)
  - Passos write-side `fin010` validados: 2/5 → 5/5
  - Schemas centralizados em `client/permutas/`: 3 → ≥ 8
- **Risco de não fazer**: silent corruption no write path (over-payment, baixa fantasma) nos 3 passos intermediários; quirks proliferam sem disciplina; primeira `/feature-new` de SISPAG copia o padrão `cast`.
- **Dependências**: complementa [integrability-3] (fixtures). Pode rodar paralelo ao [integrability-1].

### [integrability-3] Fixtures HAR + contract tests dos endpoints write-side `fin010` (e dos reads críticos)

- **Problema**
  > Os 81 `it()` em `ConexosSubClients.test.ts` (1.657 LOC) usam mocks `jest.Mocked<LegacyConexosShape>` que devolvem shape sintético. As HARs reais (probes 2026-06-18/-23/-25/-26) ficaram em `ontology/_inbox/` em prosa e nos comentários multi-linha do código. Não há regressão automatizada para o shape real que o Conexos devolve, especialmente nos 5 passos de escrita.
- **Melhoria Proposta**
  > Adicionar `src/backend/domain/client/__fixtures__/conexos/` com JSON respostas reais (sanitizadas) por endpoint: `com298-list-proforma.json`, `com298-detail.json`, `fin010-bordero-criado.json`, `fin010-baixas-validacao-tituloBaixa.json`, `fin010-baixas-validacao-tituloPermuta.json`, `fin010-baixas-atualizaLiquido.json`, `fin010-baixa-gravada.json`. Os testes dos sub-clients passam a usar essas fixtures contra os schemas Zod do card 2 — cobrem ao mesmo tempo o parser e o contrato.
- **Resultado Esperado**
  > Cada endpoint crítico tem ≥ 1 fixture; mudança de shape ERP quebra teste na hora.
- **Tactic alvo**: Contract Testing
- **Severidade**: P2
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-integrability-3, F-integrability-6
- **Métricas de sucesso**:
  - Fixtures gravadas: 0 → ≥ 10 (5 passos do fin010 + 5 reads core)
  - Testes que validam shape ERP real: 0 → ≥ 10
  - Probes de `ontology/_inbox/` materializadas em fixture: 0 → ≥ 4
- **Risco de não fazer**: probe nova = re-derivar tudo na cabeça; comentários inline envelhecem; o ganho do CC-2 (sub-clients pequenos) é desperdiçado sem rede de segurança no contrato.
- **Dependências**: melhor após [integrability-2] (precisa dos schemas para os fixtures atravessarem).

### [integrability-4] Modelar Nexxera/GED/SharePoint via `/feature-new` (clients + ontologia + `EnvironmentVars`), com `ontology/integrations/_template.md` formalizado

- **Problema**
  > Frente II (SISPAG/Nexxera — remessa/retorno bancário CNAB) e Frente III (Popula GED — SharePoint→GED) seguem com 0 código / 0 doc / 0 config. Pós-CC-2 o padrão a copiar é claro (sub-client por família + `ConexosBaseClient`-style por composição + Zod em IDs persistidos), mas não está documentado em template oficial — cada `/feature-new` vai reaprender do código.
- **Melhoria Proposta**
  > 1) Criar `ontology/integrations/_template.md` cristalizando o padrão CC-2 (`@singleton @injectable`, sub-client por família wire, `ClientBase` por composição com retry/paginate/parseDate, Zod boundary em IDs persistidos, fixture HAR em `__fixtures__/`, error class por integração tipo `ConexosError`). 2) Atualizar `ontology/integrations/conexos.md` referenciando o template (resolve F-integrability-5). 3) Para cada provedor, rodar `/feature-new` distinto que produz `NexxeraRemessaClient`/`NexxeraRetornoClient` (CNAB), `GedClient` (upload), `SharePointClient` (PDF source) + entradas SSM/`EnvironmentVars.ts`. 4) `PatternGuardian` bloqueia merge sem doc `ontology/integrations/<name>.md`.
- **Resultado Esperado**
  > 3 novas integrações nasceram seguindo o padrão; marginal cost para a 4ª = 1 doc + 1 client + 1 schema.
- **Tactic alvo**: Encapsulate / Discover Service / Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: XL (>2sem por provedor — desenho + sondagem + idempotência); ESCOPO DESTE CARD = template + ordenação
- **Findings relacionados**: F-integrability-4, F-integrability-5
- **Métricas de sucesso**:
  - Integrações com client + ontology doc: 1 → 4
  - Template oficial: 0 → 1 (`ontology/integrations/_template.md`)
  - Referência ao padrão no `PatternGuardian`: não → sim
- **Risco de não fazer**: SISPAG e Popula GED entram sem padrão referenciável; débito multiplica; o ganho do CC-2 evapora na próxima frente.
- **Dependências**: ortogonal a [integrability-1]/[2]/[3]; o template pode citar o estado atual e ir refinando.

### [integrability-5] Atualizar `ontology/integrations/conexos.md` para refletir os 5 arquivos pós-CC-2

- **Problema**
  > A doc `ontology/integrations/conexos.md` tem 7 menções ao `ConexosClient.ts` (arquivo REMOVIDO) e zero menção aos novos `ConexosBaseClient`/`…BaixaClient`/`…FinanceiroClient`/`…TitulosClient`/`…CadastroClient`. Próximo `/feature-new` que ler a doc vai bater em link morto — anula a melhoria estrutural do CC-2.
- **Melhoria Proposta**
  > Reescrever a tabela de endpoints amarrando cada wire endpoint ao novo sub-client + método + faixa de linhas. Acrescentar seção "Arquitetura CC-2" explicando o pattern composição (Base + 4 family clients). Sincronizar `ontology/_index.json` e `ontology/_coverage.json`. Atualizar `ontology/_inbox/migration-debt.md:42` (O3) removendo a referência ao "ConexosClient" como objeto único.
- **Resultado Esperado**
  > Doc reflete o código; novo integrador encontra o padrão sem precisar ler 5 arquivos.
- **Tactic alvo**: Adhere to Standards
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-5
- **Métricas de sucesso**:
  - Menções a `ConexosClient.ts` (arquivo morto) na doc: 7 → 0
  - Menções aos novos sub-clients: 0 → ≥ 5 (1 por arquivo)
  - `_index.json` aponta para arquivos existentes: ?? → 100%
- **Risco de não fazer**: `/feature-new` para Nexxera lê `conexos.md`, encontra padrão morto, replica god-client por engano.
- **Dependências**: ortogonal; pode ser feito imediatamente.

### [integrability-6] Banir `process.env.X` em service/client (BcbClient + 4 demais) + lint

- **Problema**
  > 5 leituras de `process.env.X` fora do `EnvironmentProvider` em service/client: `BcbClient.ts:123` (`BCB_CDI_FALLBACK`), `services/conexos.ts:80,144-145` (`BASE_URL/USERNAME/PASSWORD`), `config.ts:9` (`CONEXOS_FIL_COD`). Viola Inviolable Rule #8; deixa o caminho Lambda+SSM impraticável.
- **Melhoria Proposta**
  > Estender `EnvironmentVars` com `bcbCdiFallback` (e mover `CONEXOS_FIL_COD` para lá). Lint custom (`PatternGuardian` ou Biome rule) bloqueia `process\.env\.` em `src/backend/domain/client/**` e `src/backend/domain/service/**`. Exceções aceitáveis (bootstrap/handler) ficam declaradas em `appContainer.ts`, `index.ts`, handlers.
- **Resultado Esperado**
  > 0 leituras de `process.env` em client/service.
- **Tactic alvo**: Configure Behavior / Discover Service
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-7
- **Métricas de sucesso**:
  - `process.env.X` em client/service: 5 → 0
  - Regra ativa no PatternGuardian: não → sim
  - Hardcode `https://columbiatrading.conexos.cloud/api`: presente → ausente (resolvido em sub-card [integrability-1])
- **Risco de não fazer**: cresce com cada `/feature-new`; debugging "por que a env não pegou em SSM?" vira recorrente.
- **Dependências**: complementa [integrability-1] (mata a maior fonte hoje em uma tacada só).

### [integrability-7] Versionamento + back-compat shim doc para integrações

- **Problema**
  > Conexos `/api` sem versão; BCB SGS idem. Quirks (HTTP 400 com `responseData` válido) já estão sendo silenciosamente compensados sem rastro formal de "qual versão de contrato". Quando trocar provedor (Nexxera→outro banco) não há cláusula declarada.
- **Melhoria Proposta**
  > 1) Adicionar campo `wire_contract_observed_at` em cada `ontology/integrations/<name>.md` (frontmatter) — referência à HAR/probe. 2) Para cada quirk-handler no sub-client, exigir comentário `// QUIRK: <provider>@<observed-at>` + link para fixture (vinculado ao card 3). 3) Doc curto `docs/integrations/upgrade-playbook.md` com passos para "provedor mudou shape".
- **Resultado Esperado**
  > Quirks rastreáveis; upgrade do Conexos vira playbook executável.
- **Tactic alvo**: Versioning Strategy / Backward-compatibility Shims
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Endpoints com `wire_contract_observed_at`: 0 → 100% dos documentados
  - Quirks anotados: 0 → 100%
- **Risco de não fazer**: quirk-creep silencioso continua; o próximo `/feature-new` reaprende do zero.
- **Dependências**: nenhuma; ortogonal.

## 6. Notas do agente

- **Score 7/10** (subiu de 5/10 no run anterior `2026-06-26-0058`). Justificativa: o CC-2 entregou estruturalmente o card `integrability-1` mais pesado (god-client `ConexosClient` 1.956 LOC → 4 sub-clients por família + 1 base, todos com composição limpa, 0 vazamentos para services); e a v0.9.0 resolveu o card `integrability-5` (titCod=1 hardcoded → iteração 1..N). Não chega a 8/9 porque 4 cards P1/P2 originais seguem OPEN: legado `services/conexos.ts` em pé, Zod ainda 19%, 0 fixtures HAR, 3 net-new sem template. Cards renumerados: [integrability-1] (legacy auth) é agora o P1 mais alto; [integrability-2]/[3] (Zod + fixtures) seguem; [integrability-4] (Nexxera/GED/SharePoint) com escopo de **template + ordenação** porque o padrão concreto já existe. Novo achado [integrability-5] (doc desatualizado) cunhado por causa do CC-2.
- **Findings arquivados desde o run 0058**: (a) `F-integrability-1` rebaixado a P3 (estrutura resolvida; resta micro-polimento em `BaixaClient` com 13 públicos). (b) `F-integrability-5` (`titCod: 1`) **resolvido em v0.9.0** (`ontology/_inbox/permuta-multi-titulo-pendente.md` status RESOLVIDO; `ReconciliacaoPermutaService.ts:299-345` itera `titulos 1..N`).
- **Cross-QA — sinalizar ao consolidator**:
  - **Encapsulate** (cards 1, 4) overlap com **Modifiability**: a divisão CC-2 melhora os dois QAs simultaneamente (mesmo offender, mesmo fix); reportar ganho coordenado.
  - **Zod no boundary** (card 2) overlap com **Security** (validar input externo = defesa contra payload malicioso/malformado) e com **Fault Tolerance** (anti-drift no write fin010 já fala disso em `business-rules/fin010-write-contract.md`).
  - **Doc desatualizada** (card 5) overlap com **Modifiability/Testability** — o `_index.json`/`_coverage.json` pode estar referenciando arquivos mortos (`ConexosClient.ts` foi removido), impactando navegação do `CodebaseNavigator`.
- Métricas runtime (per-dep error rate, p95 latency, MTTR de Conexos) não medíveis localmente; declaradas explicitamente na seção 2.
