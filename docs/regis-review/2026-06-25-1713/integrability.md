---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-25-1713
agent: qa-integrability
generated_at: 2026-06-25T17:13:00-03:00
scope: backend,frontend
score: 8
findings_count: 4
cards_count: 4
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto pede "executar todas as automáticas em 1 clique" | Nova rota `POST /permutas/reconciliar-lote` agregando N adtos sobre o ERP Conexos (`fin010`) | `ReconciliacaoLotePermutaService` (novo) + `routes/permutas.ts` (delta) + `lib/api.ts`/`lib/types.ts` (FE) | Run-time prod (Render/Vercel/Supabase), Conexos ERP read+write, escrita gated por `CONEXOS_WRITE_ENABLED` | Compor serviços existentes (`GestaoPermutasService` + `ReconciliacaoPermutaService`) sem tocar no `ConexosClient`, reusar contrato `reconciliarBodySchema`, expor agregado tipado FE/BE | Δ LOC novo BE ≤ 170 (1 service novo + 1 rota); 0 mudanças em `ConexosClient`; 0 reimplementação de handshake ERP; tipo `ReconciliarLoteResult` espelhado FE/BE com drift = 0 strings divergentes |

> Feature de **escrita financeira em lote** que não abre nenhuma integração nova: tudo é
> composição em cima da camada de Service já existente, com o `ConexosClient` intocado.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Clients tocados pelo delta | 0 (zero) | 0 (composição pura) | ✅ | `grep -rn "ConexosClient\|axios\|fetch(" src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts` → vazio |
| Services reusados pelo novo orchestrator | 2 (`GestaoPermutasService`, `ReconciliacaoPermutaService`) + `LogService` | ≤ 3 colaboradores antes de considerar event-driven | ✅ | `ReconciliacaoLotePermutaService.ts:58-63` |
| Duplicação do contrato Zod do body HTTP | 0 — `/reconciliar-lote` reusa o `reconciliarBodySchema` definido p/ `/reconciliar` | 0 | ✅ | `routes/permutas.ts:33-38, 426-447` |
| Boundary validation (Zod) na nova rota | Presente — `safeParse(req.body)` antes de chamar o service | 100% das rotas com body | ✅ | `routes/permutas.ts:432-436` |
| Tipos `ReconciliarLoteResult`/Item/Status duplicados FE↔BE | Espelhados manualmente (2 arquivos, sem geração) | Single source com generator (zod→ts ou OpenAPI) OU teste de espelhamento | ⚠️ | `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:10-36` vs `src/frontend/lib/types.ts:275-295` |
| Strings de `LoteAdiantamentoStatus` espelhadas | 5 valores (`settled\|parcial\|error\|dry-run\|skipped`) idênticos nos dois lados | drift = 0 | ✅ (hoje) | mesma fonte acima |
| Versionamento da API HTTP do próprio backend | Sem prefixo `/v1` em `/permutas/*`; sem header `Accept-Version` | Pinning explícito quando houver cliente externo | ⚠️ | `routes/permutas.ts:130-628` |
| Versionamento da API Conexos consumida | Não tocado pelo delta (herdado do `ConexosClient`) | N/A no delta | N/A | — |
| Wrapper FE único p/ chamadas HTTP | 1 wrapper (`src/frontend/lib/api.ts`) — call site usa só `reconciliarLoteAutomaticas` | 1 wrapper / N call sites | ✅ | `src/frontend/app/permutas/page.tsx:27, 755` |
| Contract test (resposta parseável) FE↔BE para `/reconciliar-lote` | Ausente — testes de rota validam só status code (200/401/403); FE testa via mock | ≥1 contract/fixture test do shape JSON | ⚠️ | `routes/permutas.test.ts` (delta), `__tests__/clientes-filtro-api.test.ts` |
| Generic HTTP methods vazando do `ConexosClient` | 0 (não tocado neste delta) | 0 | ✅ | inspeção do delta |

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | Novo service só consome **outros services** (`GestaoPermutasService`, `ReconciliacaoPermutaService`); `ConexosClient` permanece encapsulado uma camada abaixo | ✅ | `ReconciliacaoLotePermutaService.ts:58-63` |
| Use an Intermediary | `ReconciliacaoLotePermutaService` **é** o intermediário entre a rota HTTP de lote e o serviço per-adto — boa anti-corruption layer p/ não vazar lógica de batch p/ rota | ✅ | `ReconciliacaoLotePermutaService.ts:65-152` |
| Restrict Communication Paths | Rota só fala com o lote service; lote só fala com gestão+reconciliação; só o `ReconciliacaoPermutaService` toca o `ConexosClient` (não alterado) | ✅ | `routes/permutas.ts:438-446` |
| Adhere to Standards | Reusa o **mesmo Zod schema** (`reconciliarBodySchema`) do `/reconciliar` individual — corpo `{dryRun?, dataMovto?}` idêntico; mesmo `requireRole('admin') + heavyRouteLimiter` | ✅ | `routes/permutas.ts:33-38, 398-447` |
| Abstract Common Services | `LogService` é compartilhado; gating de escrita (`CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`) **não** é reimplementado, é herdado do service individual | ✅ | `ReconciliacaoLotePermutaService.ts:54, 94-99` |
| Discover Service | N/A no delta — nenhuma nova integração externa; SSM/discover já cablado no `ConexosClient` | N/A | — |
| Tailor Interface | Lote expõe agregado **derivado** (`statusDoAdto` → `settled\|parcial\|error\|dry-run\|skipped`) em cima do `ReconciliarResult` per-adto — interface tailor-made p/ a UX de lote sem mudar o service base | ✅ | `ReconciliacaoLotePermutaService.ts:155-165` |
| Configure Behavior | `dryRunOverride` e `dataMovto` passam pelo lote sem reinterpretação; default safe (dry-run gated) preservado | ✅ | `ReconciliacaoLotePermutaService.ts:94-99` |
| Manage Resources | Iteração **sequencial** server-side; 1 request HTTP evita estourar `heavyRouteLimiter` (10/min) que um fan-out FE de 26+ chamadas estouraria | ✅ | `_shared-metrics.md` §"Mecanismo"; `routes/permutas.ts:426-447` |
| Orchestrate | `reconciliarLote` orquestra leitura (gestão) → loop continue-on-error → log agregado; orquestração **linear e síncrona** (sem SQS/EventBridge) — aceitável p/ 26 casos mas é hotspot futuro | ⚠️ | `ReconciliacaoLotePermutaService.ts:65-152` |
| Manage Resource Coupling | Acoplado a 2 services + 1 log. <3 colaboradores → dentro do limite. Sem write-back direto pra DB próprio → herda repos do service base | ✅ | `ReconciliacaoLotePermutaService.ts:58-63` |
| **Contract testing** | Testes do service cobrem coleta/continue-on-error/agg/dry-run/idempotência (5 casos) e da rota cobrem 200/401/403 (3 casos), mas **não há fixture do JSON wire-shape compartilhado** validando FE↔BE | ⚠️ | `_shared-metrics.md` baseline; ausência de `*.contract.test.ts` |
| **Versioning strategy** | Rota `/permutas/reconciliar-lote` sem prefixo de versão; quebra de contrato exigiria coordenar deploy FE+BE em lockstep (hoje já é o padrão via `bump-version`) | ⚠️ | `routes/permutas.ts:427` |
| **Backward-compatibility shims** | Não aplicável — endpoint nasce agora; tipo nasce alinhado FE/BE | N/A | — |
| **Observability of integration failures** | `logService.info` agrega `totalCasos/totalSettled/totalErros/borderos` ao fim do lote; **por-adto** o erro vai no `resultados[].erro` (devolvido na resposta) mas **não é logado individualmente** com tipo (transient ERP vs validation vs network) | ⚠️ | `ReconciliacaoLotePermutaService.ts:115-141` |

## 4. Findings

### F-integrability-1: Tipos `ReconciliarLoteResult` espelhados manualmente FE/BE (drift risk)

- **Severidade**: P2
- **Tactic violada**: Adhere to Standards / Contract testing
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:10-36` ↔ `src/frontend/lib/types.ts:275-295`
- **Evidência (objetiva)**:
  ```
  BE: export type LoteAdiantamentoStatus = 'settled' | 'parcial' | 'error' | 'dry-run' | 'skipped';
  FE: export type LoteAdiantamentoStatus = 'settled' | 'parcial' | 'error' | 'dry-run' | 'skipped'
  BE: export interface ReconciliarLoteResult { dryRun; writeEnabled; totalCasos; totalSettled; totalErros; borderos: number[]; resultados }
  FE: export interface ReconciliarLoteResult { dryRun; writeEnabled; totalCasos; totalSettled; totalErros; borderos: number[]; resultados }
  ```
- **Impacto técnico**: alteração no shape do BE (ex.: novo `status='partial-retry'`, ou renomear `borderos`→`borCods`) compila no BE mas o FE silenciosamente passa a renderizar `undefined` no diálogo de "Executar todas". Sem teste de espelhamento, o drift só é detectado em prod.
- **Impacto de negócio**: ação **de escrita financeira em lote** com feedback enganoso ao analista (parece sucesso, sumiu erro). Retrabalho de auditoria.
- **Métrica de baseline**: 2 arquivos com a mesma definição literal, 0 teste de espelhamento, 0 gerador (zod→ts / OpenAPI).

### F-integrability-2: Sem contract test do wire-shape `/permutas/reconciliar-lote`

- **Severidade**: P2
- **Tactic violada**: Contract testing
- **Localização**: `src/backend/routes/permutas.test.ts` (delta) — só status code; `src/frontend/__tests__/clientes-filtro-api.test.ts` — modelo existente para FE
- **Evidência (objetiva)**:
  ```
  _shared-metrics.md baseline: "casos de rota (200/401/403)" — nenhum caso assertando shape
  ```
- **Impacto técnico**: o teste do service usa mocks tipados (compile-time); o teste da rota só vê status; o FE só vê o tipo TS. Nenhum teste prova que o JSON real bate com o tipo do FE.
- **Impacto de negócio**: regressões silenciosas no contrato (mesmo que internas BE+FE), só pegáveis em smoke test pós-deploy.
- **Métrica de baseline**: 0 testes assertando o JSON shape de `/reconciliar-lote`; FE só tem `clientes-filtro-api.test.ts` como modelo.

### F-integrability-3: Sem prefixo de versão na API HTTP interna (`/permutas/*`)

- **Severidade**: P3
- **Tactic violada**: Versioning strategy
- **Localização**: `src/backend/routes/permutas.ts:130-628` (todas as rotas; `/reconciliar-lote` é a nova)
- **Evidência (objetiva)**:
  ```
  router.post('/reconciliar-lote', requireRole('admin'), heavyRouteLimiter, ...)
  ```
- **Impacto técnico**: hoje FE+BE deployam lockstep via `bump-version.ps1` → o risco é baixo. Cresce quando a app abrir API p/ terceiros (SISPAG/Nexxera, GED) ou um app mobile interno.
- **Impacto de negócio**: futura quebra de contrato sem como anunciar deprecation.
- **Métrica de baseline**: 0 rotas com `/v1` ou header `Accept-Version`.

### F-integrability-4: Observabilidade per-adto do lote — erros não taxonomizados no log

- **Severidade**: P2
- **Tactic violada**: Observability of integration failures
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:115-141`
- **Evidência (objetiva)**:
  ```typescript
  } catch (err) {
      totalErros += 1;
      const mensagem = err instanceof Error ? err.message : String(err);
      resultados.push({ adiantamentoDocCod: docCod, ... status: 'error', erro: mensagem });
  }
  // ... await this.logService.info({ ... totalCasos, totalSettled, totalErros, borderos: borderos.size ... })
  ```
  Log final é **agregado**; erro per-adto só sai no body da resposta. Sem `logService.error` ou `LOG_TYPE.INTEGRATION_ERROR` por falha.
- **Impacto técnico**: dashboards/alertas de integração com Conexos não veem o pico de erros do lote. Distinguir transient (5xx ERP, timeout) vs validation (saldo, filial) vs sistema (lock) exige cavar o response body persistido.
- **Impacto de negócio**: degrada o MTTR de incidentes de integração e a curva de aprendizado sobre falhas reais do `fin010` na execução em massa.
- **Métrica de baseline**: 1 log agregado por execução de lote; 0 logs estruturados por adto falho.

## 5. Cards Kanban

### [integrability-1] Garantir paridade do shape `ReconciliarLoteResult` entre FE e BE

- **Problema**
  > Tipos `ReconciliarLoteResult`/`ReconciliarLoteItem`/`LoteAdiantamentoStatus` são definidos manualmente nos dois lados (BE `ReconciliacaoLotePermutaService.ts:10-36`, FE `lib/types.ts:275-295`). Risco de drift silencioso em uma ação de escrita financeira em lote.
- **Melhoria Proposta**
  > Opção S (preferida agora): extrair os tipos do lote para um Zod schema no BE e gerar (ou exportar) o tipo TS consumido pelo FE — ou ao menos adicionar 1 contract test que valide via Zod a resposta real contra o tipo do FE (`safeParse` no fixture). Tactic Bass: Adhere to Standards. Arquivos: `ReconciliacaoLotePermutaService.ts` (extrair schema), `routes/permutas.ts:426-447` (parse na borda de saída se viável), `frontend/lib/types.ts:275-295` (importar/regerar).
- **Resultado Esperado**
  > Adicionar campo no shape do lote requer mudança em 1 lugar canônico ou quebra teste de espelhamento. Métrica: arquivos com a definição literal de `LoteAdiantamentoStatus` 2 → 1 (ou 2 com teste de paridade green).
- **Tactic alvo**: Adhere to Standards / Contract testing
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-1, F-integrability-2
- **Métricas de sucesso**:
  - Definições literais do tipo: 2 → 1 (ou 0 drift sob teste)
  - Contract test cobrindo `/permutas/reconciliar-lote`: 0 → 1
- **Risco de não fazer**: regressão silenciosa no diálogo "Executar todas" — analista lê feedback errado sobre baixa real.
- **Dependências**: nenhuma.

### [integrability-2] Adicionar fixture/contract test do wire-shape `/permutas/reconciliar-lote`

- **Problema**
  > Testes da rota validam só status code (200/401/403); testes do service usam mocks tipados; FE usa o tipo TS por contrato. Nenhum teste prova que o JSON serializado bate com o tipo consumido. (Cross-QA: Testability.)
- **Melhoria Proposta**
  > Adicionar 1 caso em `routes/permutas.test.ts` (ou novo `*.contract.test.ts`) que monta um cenário com 2 adtos (1 settled, 1 erro) e valida o body via Zod schema da Card 1. Tactic Bass: Contract testing.
- **Resultado Esperado**
  > Quebrar o shape do lote no BE causa teste vermelho local antes do PR.
- **Tactic alvo**: Contract testing
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-2, F-integrability-1
- **Métricas de sucesso**:
  - Contract tests p/ `/reconciliar-lote`: 0 → ≥1
- **Risco de não fazer**: drift FE/BE só capturado em prod / smoke manual.
- **Dependências**: idealmente roda depois ou junto com Card 1.

### [integrability-3] Pinning de versão na API HTTP interna (rastrear, não bloquear)

- **Problema**
  > Nenhuma rota `/permutas/*` (incluindo a nova `/reconciliar-lote`) tem prefixo `/v1` ou header `Accept-Version`. Hoje FE+BE deployam lockstep — risco baixo, mas o débito cresce quando 3ª frente (SISPAG/Nexxera, GED) compartilhar a API ou integrar app mobile interno.
- **Melhoria Proposta**
  > Registrar a decisão (manter sem versão enquanto FE/BE lockstep) numa ADR curta ou nota em `migration-debt.md`. Quando abrir consumidor externo, introduzir `/v1` retroativo + alias. Tactic Bass: Versioning strategy.
- **Resultado Esperado**
  > Decisão documentada; gatilho explícito para introdução de versão.
- **Tactic alvo**: Versioning strategy
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - 1 ADR/nota referenciando a decisão sobre versionamento.
- **Risco de não fazer**: quando precisar versionar, vira retrabalho retroativo.
- **Dependências**: nenhuma.

### [integrability-4] Log estruturado per-adto falho no lote

- **Problema**
  > `ReconciliacaoLotePermutaService` loga só o agregado (`totalCasos/totalSettled/totalErros/borderos`); erros per-adto saem só no body da resposta. Sem taxonomia, dashboards/alertas de integração com Conexos não enxergam o pico do lote nem distinguem transient vs validation vs lock.
- **Melhoria Proposta**
  > Adicionar 1 `logService.warn` (ou `error` com `LOG_TYPE.INTEGRATION_*`) por adto falho com `{requestId, adiantamentoDocCod, priCod, kind: 'transient|validation|lock|unknown', message}`. Manter o agregado final. Tactic Bass: Observability of integration failures.
- **Resultado Esperado**
  > Para cada lote, N falhas geram N linhas de log estruturadas, queryáveis por `requestId`. Métrica: erros per-adto logados / erros per-adto na resposta = 100%.
- **Tactic alvo**: Observability of integration failures
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Cobertura de log per-adto: 0% → 100% dos falhos
  - Campos taxonomizados (`kind`) presentes em 100% dos logs de erro do lote.
- **Risco de não fazer**: degrada MTTR e dificulta aprendizado sobre falhas reais do `fin010` em escala.
- **Dependências**: nenhuma. Cross-QA: Fault Tolerance (observability per-failure) e Testability.

## 6. Notas do agente

- Composição é o ponto forte do delta: 0 mudanças em `ConexosClient`, 0 reimplementação de handshake ERP, gating de escrita herdado integralmente do service individual — integrability **alta** para este recorte.
- Métricas "não medíveis localmente" não se aplicam aqui — todas as métricas relevantes vêm de `grep`/leitura de arquivo no worktree.
- Cross-QA: F-integrability-1/2 conversam com **Testability** (cobertura de contrato) e **Modifiability** (single source of truth para shapes); F-integrability-4 conversa com **Fault Tolerance** e **Observability/Availability** — sinalizar ao consolidator para evitar cards duplicados.
