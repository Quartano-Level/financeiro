---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-modifiability
generated_at: 2026-07-18T16:18Z
scope: all
score: 7
findings_count: 7
cards_count: 7
---

# Modifiability — Regis-Review (SISPAG / Frente II)

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto / analista financeira | Muda uma regra de política (ex.: janela de horizonte de formação de 7d → 3d; teto por lote de 25 → 50; nova modalidade de pagamento; nova conta pagadora; migração para escrita real Fatia 3) | Serviços SISPAG (`sispag/*Service`), rotas (`routes/sispag.ts`), painel FE (`app/sispag/page.tsx`), clients Conexos SISPAG (fin064/fin015/fin052) | Fatia 1+2 em produção (read-only + montagem local); Fatia 3 (escrita fin015/.REM + retorno fin052) DORMENTE mas com toolboxes prontos | Alteração cabe em **1 serviço + 1 componente** sem tocar rota nem contrato do Conexos; regras de política mudam por config, não por deploy | ≤ 3 arquivos tocados por mudança de política; ≤ 8 arquivos por mudança de fluxo; 0 mudanças no client Conexos para adicionar uma modalidade |

Cenário aplicado: **"O analista pede janela de horizonte de 3d em vez de 7d na formação automática"**. Hoje: editar `FormacaoLotesService.HORIZONTE_DIAS` (constante hardcoded) + `SispagPainelService.calcularKpis` (janelas `≤ 7`/`≤ 30` também hardcoded no cálculo de KPIs), commit, release lockstep FE/BE (0.17.6 → 0.17.7), deploy Render — **4+ arquivos, 1 deploy full**. Alvo: uma tabela de política com defaults (`ontology/business-rules/*.md` ↔ tabela config) + hot-reload por SSM/env — 0 arquivos + 0 deploy.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC max — serviço SISPAG | 405 (`LotePagamentoService.ts`) | ≤ 400 | ⚠️ | `wc -l src/backend/domain/service/sispag/*.ts` |
| LOC max — repository SISPAG | 420 (`LotePagamentoRepository.ts`) | ≤ 400 | ⚠️ | `wc -l src/backend/domain/repository/sispag/*.ts` |
| LOC max — client SISPAG | 332 (`ConexosSispagClient.ts`) | ≤ 400 | ✅ | `wc -l src/backend/domain/client/ConexosSispag*.ts` |
| LOC max — frontend SISPAG | 832 (`app/sispag/page.tsx`) | ≤ 400 | ❌ | `wc -l src/frontend/app/sispag/*.tsx` |
| # tabs no `SispagPanel` | 5 (`titulos`, `lotes-candidatos`, `lotes-finalizados`, `lotes` nativos, `retornos`) | ≤ 3 por página | ⚠️ | `grep -c TabsTrigger page.tsx` |
| # `React.useState` no `SispagPanel` | 15 | ≤ 6 (regra de bolso para split) | ❌ | grep no `page.tsx` |
| # `React.useCallback`+`useEffect`+`useMemo` no `SispagPanel` | 4 + 1 + 1 | não-diretivo (proxy de acoplamento) | ⚠️ | grep no `page.tsx` |
| Cognitive complexity warnings SISPAG (backend) | 1 (`ConexosSispagRetornoClient.listDetalhe`, complexidade 36 vs. max 15) | 0 | ❌ | `npm run lint` |
| Cognitive complexity warnings SISPAG (frontend) | 0 diretos; 2 lint warnings `noNestedFunctionInEffect` correlatos (`AdicionarTituloDialog:48`, `page.tsx:199`) | 0 | ⚠️ | `cd src/frontend && npm run lint` |
| Cross-layer violations (domain → routes/http) | 0 | 0 | ✅ | `grep -rn "from '.*routes/\|http/'" src/backend/domain/**/sispag/` |
| Cross-layer violations (routes → repository sem passar por service) | 1 uso direto legítimo (`PagamentoIngestaoRunRepository` na rota `/ingestao/runs` — trilha de auditoria pura) | ≤ 1 justificado | ⚠️ | `routes/sispag.ts:356` |
| `@injectable/@singleton/@inject` no perímetro SISPAG | 47 anotações em 11 classes | 100% das classes de domínio | ✅ | `grep -c @injectable\|@singleton\|@inject src/backend/domain/**/sispag/ ConexosSispag*.ts` |
| Uso de `process.env` cru em service SISPAG | 0 (só em comentário justificando `EnvironmentProvider`) | 0 | ✅ | `grep -rn 'process.env' src/backend/domain/service/sispag/` |
| Testes backend SISPAG | 7 (`FormacaoLotesService`, `IngestaoPagamentosService`, `LotePagamentoService`, `SispagPainelService`, `LotePagamentoRepository`, `PagamentoIngestaoRunRepository`, `TituloAPagarRepository`) + 3 client tests | ≥ 1 por serviço | ✅ | `find src/backend -path '*sispag*.test.ts'` |
| Testes frontend SISPAG | 0 (page 832 LOC, 3 componentes, `lib/sispag.ts` 339 LOC — nenhum teste) | ≥ smoke em `SispagPanel` e `LoteCard` | ❌ | shared-metrics.md |
| Magic numbers de política em serviços | 8 constantes hardcoded (`HORIZONTE_DIAS=7`, `MAX_TITULOS_POR_LOTE=25`, `TITULOS_CAP=400`, `CONEXOS_FANOUT_LIMIT=4`, `FANOUT_LIMIT=4`, janela ingestão `15/45 DAY_MS`, janelas KPI `7/30`) | 0 no service; todos externalizados | ❌ | `grep -rEn 'const [A-Z_]+ = [0-9]{2,}' src/backend/domain/service/sispag/` |
| Advisory-lock keys mágicos | 3 (`726354819`, `615243789`, `528417963`) — únicos por domínio e documentados | 3 (aceitável se documentados) | ✅ | mesmo grep |
| Fan-in max (SISPAG) | `LotePagamentoRepository` = 3 chamadores (LotePagamento, Formacao, Painel) | ≤ 5 | ✅ | `grep -rln LotePagamentoRepository src/backend` |
| Coverage ontology (SISPAG relevante) | `state-machines/lote-pagamento` marcado `partial` mesmo com 4 status + 6 transições implementadas em `LotePagamentoService` | `implemented` | ⚠️ | `ontology/_coverage.json` |

### Apêndice A — Top-10 arquivos SISPAG por LOC (não-teste)

| # | Arquivo | LOC |
|---|---|---|
| 1 | `src/frontend/app/sispag/page.tsx` | 832 |
| 2 | `src/backend/domain/repository/sispag/LotePagamentoRepository.ts` | 420 |
| 3 | `src/backend/domain/service/sispag/LotePagamentoService.ts` | 405 |
| 4 | `src/frontend/app/sispag/components/LoteCard.tsx` | 362 |
| 5 | `src/backend/routes/sispag.ts` | 361 |
| 6 | `src/frontend/lib/sispag.ts` | 339 |
| 7 | `src/backend/domain/client/ConexosSispagClient.ts` | 332 |
| 8 | `src/backend/domain/client/ConexosSispagWriteClient.ts` (DORMANT) | 305 |
| 9 | `src/backend/domain/client/ConexosSispagRetornoClient.ts` (DORMANT-write) | 285 |
| 10 | `src/backend/domain/service/sispag/SispagPainelService.ts` | 247 |

### Apêndice B — Fan-in por módulo SISPAG (top-10)

| # | Módulo | Fan-in (chamadores não-teste) | Chamadores |
|---|---|---|---|
| 1 | `LotePagamentoRepository` | 3 | LotePagamentoService, FormacaoLotesService, SispagPainelService |
| 2 | `ConexosSispagClient` | 3 | LotePagamentoService, IngestaoPagamentosService, SispagPainelService |
| 3 | `TituloAPagarRepository` | 3 | IngestaoPagamentosService, FormacaoLotesService, SispagPainelService |
| 4 | `PagamentoIngestaoRunRepository` | 3+1 rota | IngestaoPagamentosService, RetornoOrquestracaoService (dormant), SispagPainelService, `routes/sispag.ts` |
| 5 | `SispagPainelService` | 2 | `routes/sispag.ts`, `jobs/probe-sispag-painel.ts` |
| 6 | `LotePagamentoService` | 1 | `routes/sispag.ts` |
| 7 | `IngestaoPagamentosService` | 1+1 job | `routes/sispag.ts`, `jobs/ingest-pagamentos.ts` |
| 8 | `FormacaoLotesService` | 1+1 job | `routes/sispag.ts`, `jobs/formar-lotes.ts` |
| 9 | `ConexosSispagRetornoClient` | 2 | SispagPainelService, RetornoOrquestracaoService (dormant) + 2 probes |
| 10 | `ConexosSispagWriteClient` | 0 (produção) | apenas `jobs/validate-fin015-tools.ts` (harness HML guardado) |

Leitura: o **repo do lote** e o **client Conexos** são os hubs — qualquer refactor neles precisa cobrir 3 chamadores. `LotePagamentoService` é ponto único, então split dele é isolado. `ConexosSispagWriteClient` tem fan-in **zero** em produção (Fatia 3 ainda dormente) — janela ideal para reformar antes de acoplar.

## 3. Tactics — Cobertura no SISPAG

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | `LotePagamentoService` foi o único service quebrado (`LotePagamento*` errors + `Repository` + `Service`); `SispagPage` continua um único componente com 5 tabs | ⚠️ parcial | `page.tsx` 832 LOC; `LotePagamentoService` 11 métodos públicos coesos |
| Increase Semantic Coherence | `LotePagamentoService` = agregado lote (bom); `SispagPainelService` mistura 3 leituras heterogêneas (painel, retornos, modalidadesDisponiveisDoLote) — screen-composer | ⚠️ parcial | `SispagPainelService.ts:54,139,198` — 3 métodos públicos, 3 responsabilidades |
| Encapsulate | Cada cliente Conexos encapsula um sub-domínio (fin064 leitura, fin015 escrita, fin052 retorno); Zod no boundary de cada `.list`/`.post` | ✅ presente | `ConexosSispagClient.ts:42-95`, `ConexosSispagWriteClient.ts:20-35` |
| Use an Intermediary | `ConexosBaseClient` é o único intermediário Conexos (auth, sessão, retry, paginação); todos os `Sispag*Client` compõem via `runWithRetry`/`listGenericPaginated`/`postGenericOnce` | ✅ presente | `ConexosSispagClient.ts:11,100`; `ConexosSispagRetornoClient.ts:34` |
| Restrict Dependencies | Zero violação de camada (domain nunca importa `routes/http`); 47 anotações DI; único acesso repo direto na rota é `PagamentoIngestaoRunRepository` para trilha de auditoria (`routes/sispag.ts:356`) — justificável | ✅ presente | `grep` cross-layer = 0 |
| Refactor | `LotePagamentoService.incluirTitulo` (81 LOC, aninhamento profundo: guard → get Conexos → lock → transaction → 4 branches internos) — refactor pendente; `ConexosSispagRetornoClient.listDetalhe` complexidade 36 | ⚠️ parcial | `LotePagamentoService.ts:159-245`; lint warning `ConexosSispagRetornoClient.ts:164:46` |
| Abstract Common Services | `describeConexosValidation` **duplicado** entre `ConexosSispagWriteClient.ts:68` e `ConexosSispagRetornoClient.ts:53` (comentário confessa "duplicado por ora") | ❌ ausente | ver comentário `ConexosSispagRetornoClient.ts:52` |
| Defer Binding — configuration file | `SISPAG_ENABLED` (backend gate) + `NEXT_PUBLIC_SISPAG_ENABLED` (frontend) + `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` já em SSM/env — **feature-flags de release** deferred; políticas de negócio (janelas, teto) ainda **não** | ⚠️ parcial | `render.yaml`; `EnvironmentProvider`; hardcoded em `FormacaoLotesService.ts:17,19`, `SispagPainelService.ts:23,28`, `IngestaoPagamentosService.ts:75-76` |
| Defer Binding — polymorphism | tsyringe container everywhere; nenhum token nomeado com múltiplas implementações no SISPAG (não há strategy pluggable por modalidade/banco) | N/A | domínio bound (uma implementação por client); aceitável hoje |
| Defer Binding — runtime registration | Registro estático via `appContainer.ts`; sem plugin loading | N/A | domínio fechado, sem terceiros |

## 4. Findings

### F-modifiability-1: `SispagPanel` é god-component (832 LOC, 5 tabs, 15 estados, fetch+orquestração+render num arquivo)

- **Severidade**: P1
- **Tactic violada**: Split Module + Increase Semantic Coherence
- **Localização**: `src/frontend/app/sispag/page.tsx:102-832`
- **Evidência (objetiva)**:
  ```
  wc -l app/sispag/page.tsx           → 832
  grep -c 'React.useState' page.tsx   → 15
  grep -c 'TabsTrigger' page.tsx      → 5
  imports: 20 (top-1 do SISPAG)
  ```
  A função `SispagPanel` orquestra ingestão (`ingerir`), formação (`formar`), montagem de lote (`criarLoteComSelecionados`), transições de lote (`acaoLote`), leitura de retornos (`carregarRetornos`), 3 sistemas de filtro paralelos (`useTabelaFiltro` × 4), e 5 tabs de render — tudo num único componente client.
- **Impacto técnico**: qualquer alteração num tab (ex.: nova coluna em "Retornos") força re-render/replay-test das outras 4; conflict-hotspot para PRs paralelos; sem tests frontend, refactor é 100% manual.
- **Impacto de negócio**: quando a Fatia 3 (envio real + tela de retorno) chegar, a tela crescerá para ~1.100+ LOC — mudança de política para uma tab exige regressão manual das outras 4. Estima-se 30–40% do tempo de cada `/feature-tweak` SISPAG gasto neste arquivo.
- **Métrica de baseline**: 832 LOC; 15 useStates; 5 tabs; 4 `useTabelaFiltro`; 0 tests.

### F-modifiability-2: constantes de política de negócio hardcoded nos services (defer-binding miss)

- **Severidade**: P1
- **Tactic violada**: Defer Binding (configuration file)
- **Localização**: `src/backend/domain/service/sispag/FormacaoLotesService.ts:17,19`, `SispagPainelService.ts:23,28`, `IngestaoPagamentosService.ts:20,75-76`
- **Evidência (objetiva)**:
  ```
  const HORIZONTE_DIAS = 7;              // FormacaoLotesService
  const MAX_TITULOS_POR_LOTE = 25;       // FormacaoLotesService
  const TITULOS_CAP = 400;               // SispagPainelService
  const CONEXOS_FANOUT_LIMIT = 4;        // SispagPainelService
  const FANOUT_LIMIT = 4;                // IngestaoPagamentosService (duplicado, nome diferente)
  const minVencimento = now - 15 * DAY_MS;   // janela de ingestão hardcoded
  const maxVencimento = now + 45 * DAY_MS;
  KPI aVencer7d/aVencer30d               // 7 e 30 literais em SispagPainelService.calcularKpis
  ```
- **Impacto técnico**: mudança de janela pede recompile + deploy; janelas 7d/30d aparecem em 2 lugares (painel + label da UI) — drift silencioso possível.
- **Impacto de negócio**: analista financeira já pediu ajustes de horizonte em conversas informais (memory `sispag-escopo2-context`). Cada ajuste = release lockstep FE+BE (bump semver + deploy Render+Vercel). Se produção precisar de janela diferente por filial, o design atual não sustenta.
- **Métrica de baseline**: 8 constantes de política em 3 services; 0 exposição via `EnvironmentProvider`; 100% dos ajustes hoje = deploy.

### F-modifiability-3: `ConexosSispagRetornoClient.listDetalhe` — cognitive complexity 36 (max 15) num mapping de 20 campos

- **Severidade**: P2
- **Tactic violada**: Refactor + Reduce Size of Module
- **Localização**: `src/backend/domain/client/ConexosSispagRetornoClient.ts:140-189` (linha reportada pelo lint: 164:46)
- **Evidência (objetiva)**:
  ```
  domain/client/ConexosSispagRetornoClient.ts:164:46 lint/complexity/noExcessiveCognitiveComplexity
  ! Excessive complexity of 36 detected (max: 15).
  ```
  O corpo é uma cadeia de 20 `r.X != null ? Number(r.X) : undefined` inline no `.map()`. É o mapping da ponte `bxaCodSeq → fin010` — o coração da baixa da Fatia 3.
- **Impacto técnico**: qualquer novo campo do detalhe do retorno = +2 ternários no mesmo bloco; sem tabela de mapping, impossível reutilizar em `listErros`/`mapArquivo`; a duplicação `describeConexosValidation` entre `ConexosSispagWriteClient` e `ConexosSispagRetornoClient` (confessada em comentário `ConexosSispagRetornoClient.ts:52`) confirma o padrão "duplicar por ora".
- **Impacto de negócio**: este client é o seam da Fatia 3 (poller de retorno). Refactor **antes** de wire-up custa 1 dia; **depois**, custa 3 dias porque `RetornoOrquestracaoService` está esqueleto (198 LOC, 100% TODO).
- **Métrica de baseline**: 1 warning cognitivo (o único do SISPAG backend), grau 36; duplicação `describeConexosValidation` = 42 LOC × 2 arquivos.

### F-modifiability-4: `SispagPainelService` mistura 3 leituras heterogêneas (weak semantic coherence)

- **Severidade**: P2
- **Tactic violada**: Increase Semantic Coherence
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:54,139,198`
- **Evidência (objetiva)**: 3 métodos públicos, 3 propósitos distintos:
  - `montarPainel()` — agrega TituloAPagar (repo local) + LoteSispag (fin015 ao vivo) + KPIs.
  - `listRetornos()` — fan-out fin052 (arquivos `.RET` de retorno).
  - `modalidadesDisponiveisDoLote()` — leitura pontual per-item (fin064 hidratado).

  9 dependências injetadas (3 clients Conexos, 4 repositórios, `EnvironmentProvider`, `LogService`) — sinal de que o serviço é um agregador de leituras, não um agregado de domínio.
- **Impacto técnico**: qualquer serviço novo de leitura tende a ir para cá por gravidade; a próxima Fatia 3 (baixa de lote + reconciliação) inflaria isto de 247 → 400+ LOC.
- **Impacto de negócio**: a modelagem sugere que **cada tab do painel** deveria ter seu próprio read-model (mesmo padrão do Painel de Permutas, que evoluiu para vários `*QueryService` no `/relatorios-export`).
- **Métrica de baseline**: 3 métodos públicos, 9 dependências, 247 LOC.

### F-modifiability-5: zero testes frontend SISPAG (bloqueia refactor seguro do god-component)

- **Severidade**: P2
- **Tactic violada**: Refactor (não há guard-net que permita reformar)
- **Localização**: `src/frontend/app/sispag/` (3 componentes + `page.tsx` + `lib/sispag.ts` = 1.860 LOC)
- **Evidência (objetiva)**:
  ```
  frontend sispag test files: 0    (shared-metrics)
  ```
- **Impacto técnico**: refactor do `SispagPanel` (F-1) só é reversível via QA manual — o preço de um bug de estado silencioso (ex.: `selecionados: Set` perde items ao filtrar) é alto.
- **Impacto de negócio**: cada `/feature-tweak` SISPAG-frontend passa por revisão manual em dev tenant (QaCoach roteiro obrigatório). Ciclo de release cresce ~1d por mudança.
- **Métrica de baseline**: 0 testes / 1.860 LOC de frontend SISPAG. Alvo mínimo defensável: 2 smoke tests (`SispagPanel` render OK + `LoteCard` transições habilitadas por status).

### F-modifiability-6: 2 warnings `setState-in-effect` no SISPAG frontend (React canonical smell)

- **Severidade**: P3
- **Tactic violada**: Refactor
- **Localização**: `src/frontend/app/sispag/page.tsx:199`, `src/frontend/app/sispag/components/AdicionarTituloDialog.tsx:48`
- **Evidência (objetiva)**:
  ```
  page.tsx:199 → void carregar() em useEffect (bootstrap de dados via state setter)
  AdicionarTituloDialog:48 → setSel(new Set()) direto no useEffect
  ```
- **Impacto técnico**: cascading renders documentados na regra Biome; hoje benignos, mas escondem race quando o filtro/lote muda rápido (memory `bordero-finalizar-investigacao` lembra que investigações desse tipo custam tempo).
- **Impacto de negócio**: baixo direto; alto se algum dia a Fatia 3 introduzir polling.
- **Métrica de baseline**: 2/11 warnings do frontend são SISPAG (18%).

### F-modifiability-7: state-machine `lote-pagamento` marcada `partial` no ontology mesmo com 4 status + 6+ transições implementadas

- **Severidade**: P3
- **Tactic violada**: Defer Binding (proxy — ontology é o binding de contratos com o time)
- **Localização**: `ontology/_coverage.json` → `state_machines: partial=1, implemented=1`; `LotePagamentoService.ts` implementa `finalizarLote`, `reabrirLote`, `cancelarLote`, `marcarRetorno` + gate de finalização + optimistic lock.
- **Evidência (objetiva)**:
  ```
  state_machines_total: 3
  state_machines_partial: 1     ← lote-pagamento
  state_machines_implemented: 1
  ```
  Enquanto o code path já cobre `RASCUNHO/FINALIZADO/CANCELADO/RETORNADO` (ADR-0019).
- **Impacto técnico**: drift ontológico faz o próximo `/feature-tweak` "descobrir" que já existe. Blast radius pequeno hoje; grande quando o Fatia 3 abrir `BAIXADO`.
- **Impacto de negócio**: baixo, mas o `PatternGuardian` e o `OntologyCurator` dependem desse mapa para não repetir trabalho.
- **Métrica de baseline**: 1 state-machine `partial` que deveria estar `implemented`; drift ≈ 1/3 = 33% no bucket.

## 5. Cards Kanban

### [modifiability-1] Fatiar o `SispagPanel` em componentes por tab

- **Problema**
  > `src/frontend/app/sispag/page.tsx` é um god-component de 832 LOC, 5 tabs e 15 useStates que mistura fetch, orquestração de negócio e render. Cada nova coluna/filtro obriga a re-testar as 5 tabs manualmente (não há testes frontend). Frente III (Popula GED) tende a repetir o padrão se este continuar de referência.
- **Melhoria Proposta**
  > Aplicar **Split Module** + **Increase Semantic Coherence**: extrair 5 componentes irmãos (`TitulosTab`, `LotesCandidatosTab`, `LotesFinalizadosTab`, `LotesNativosTab`, `RetornosTab`), cada um dono do próprio state local e do próprio `useTabelaFiltro`. `SispagPanel` fica só com shell (header + KPIs + `<Tabs>`) e uma hook `useSispagData()` (React Query ou reducer) que expõe `painel`, `lotes`, `refetch()` aos filhos. Mover `criarLoteComSelecionados`/`acaoLote`/`ingerir`/`formar` para hooks nomeados (`useCriarLote`, `useLoteActions`, `useIngestao`).
- **Resultado Esperado**
  > page.tsx ≤ 200 LOC; cada tab-componente ≤ 250 LOC; useState do shell ≤ 6.
- **Tactic alvo**: Split Module + Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: L
- **Findings relacionados**: F-modifiability-1, F-modifiability-5, F-modifiability-6
- **Métricas de sucesso**:
  - `page.tsx` LOC: 832 → ≤ 200
  - useStates no shell: 15 → ≤ 6
  - Warnings `setState-in-effect` SISPAG: 2 → 0
- **Risco de não fazer**: com Fatia 3 (envio + retorno reais + tela de baixa) o arquivo cresce para 1.100+ LOC; ciclo de PR sobe > 1d por mudança.
- **Dependências**: modifiability-5 (tests) antes ou lockstep — sem net, o split é uma refactor às cegas.

### [modifiability-2] Externalizar constantes de política SISPAG (janelas, teto, fan-out)

- **Problema**
  > 8 constantes de política de negócio (horizonte de formação, teto de títulos/lote, janela de ingestão 15/45d, teto de resposta do painel, fan-out Conexos, janelas KPI 7d/30d) estão hardcoded em 3 services. Qualquer ajuste pedido pela analista financeira exige release lockstep FE+BE + deploy Render.
- **Melhoria Proposta**
  > Aplicar **Defer Binding (configuration file)**: criar `SispagPolicyProvider` (`@singleton()`) que lê de `EnvironmentProvider` (SSM em prod) com defaults tipados. Migrar `FormacaoLotesService.HORIZONTE_DIAS`, `MAX_TITULOS_POR_LOTE`, `SispagPainelService.TITULOS_CAP`, `CONEXOS_FANOUT_LIMIT`, `FANOUT_LIMIT` (unificar nome), `IngestaoPagamentosService` janela 15/45d, KPIs `aVencer7d/30d`. Documentar cada valor em `ontology/business-rules/` (P3 do ontology). Chaves SSM: `/financeiro/{env}/sispag/policy/*`.
- **Resultado Esperado**
  > Mudança de janela de 7d → 3d = update em 1 valor no SSM, `restart` do serviço (ou hot-reload no próximo `getEnvironmentVars()`), 0 deploys de código.
- **Tactic alvo**: Defer Binding (configuration file)
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - Magic policy numbers em `service/sispag/`: 8 → 0
  - Deploys por mudança de política: 1 full lockstep → 0
  - Ontology `business-rules` com valor default versionado: +3 (janela, teto, fan-out)
- **Risco de não fazer**: continuar bumpando versão do app por parâmetro de tuning. Cross-QA: cada bump = ciclo Vercel + Render = **~10 min de janela de indisponibilidade parcial** (Deployability).
- **Dependências**: nenhuma; pode rodar em paralelo com Integrability.

### [modifiability-3] Refatorar `ConexosSispagRetornoClient.listDetalhe` (complexidade 36) antes de wire-up da Fatia 3

- **Problema**
  > `ConexosSispagRetornoClient.listDetalhe` tem cognitive complexity 36 (o único warning cognitivo SISPAG — max 15) por causa de 20 ternários inline no `.map()`. Além disso, `describeConexosValidation` está **duplicado** entre `ConexosSispagRetornoClient` e `ConexosSispagWriteClient` (o próprio código admite em comentário). Este é o seam da Fatia 3 (poller de retorno) e hoje tem fan-in zero em produção — janela ideal.
- **Melhoria Proposta**
  > **Refactor** + **Abstract Common Services**: (a) extrair `mapArquivoRetornoDetalhe(r, fallback)` para módulo próprio ou tabela `[campo, coercer]`; reutilizar em `listErros` e `mapArquivo`. (b) mover `describeConexosValidation` para `ConexosBaseClient` (junto do `postGenericOnce`/`getGeneric`) ou para um `ConexosErrorMapper` compartilhado — os 3 clients SISPAG usam a mesma lógica.
- **Resultado Esperado**
  > `listDetalhe` complexidade ≤ 15; duplicação `describeConexosValidation` = 0; toolbox pronto antes de `RetornoOrquestracaoService` sair do dormant.
- **Tactic alvo**: Refactor + Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Warnings cognitivos SISPAG backend: 1 → 0
  - Duplicação `describeConexosValidation`: 2 arquivos × ~42 LOC → 1 arquivo × 42 LOC
- **Risco de não fazer**: fazer o mesmo refactor **depois** que o `RetornoOrquestracaoService` acordar custa ~3× mais (5 arquivos, teste E2E do poller).
- **Dependências**: nenhuma; deve preceder qualquer PR que ligue o poller.

### [modifiability-4] Fatiar `SispagPainelService` em serviços por intenção

- **Problema**
  > `SispagPainelService` tem 3 métodos públicos com propósitos distintos (painel diário, arquivos de retorno, modalidades disponíveis) e 9 dependências. Screen-composer disfarçado de service.
- **Melhoria Proposta**
  > **Increase Semantic Coherence** + **Split Module**: quebrar em `PainelPagamentoQueryService` (só `montarPainel`), `RetornoQueryService` (só `listRetornos`, alinhado com o futuro `RetornoOrquestracaoService`) e mover `modalidadesDisponiveisDoLote` para `LotePagamentoService` (é uma leitura por lote, pertence ao agregado).
- **Resultado Esperado**
  > Cada novo `*QueryService` ≤ 150 LOC, ≤ 5 dependências, 1 método público por intenção. Alinha com o padrão de `permutas/*QueryService` já em uso.
- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - LOC de `SispagPainelService`: 247 → ≤ 150
  - Deps injetadas no serviço de painel: 9 → ≤ 5
- **Risco de não fazer**: com Fatia 3 (baixa + reconciliação), o serviço vira ≥ 400 LOC e vira o novo hub de leituras. Deve ser feito antes de modifiability-3 aterrissar o `RetornoOrquestracaoService`.
- **Dependências**: nenhuma (repos são estáveis).

### [modifiability-5] Cobrir SISPAG frontend com smoke tests (`SispagPanel` + `LoteCard`)

- **Problema**
  > 0 testes frontend para 1.860 LOC SISPAG. Qualquer refactor (F-1, F-6) é feito no escuro. QaCoach manual em dev tenant já é obrigatório após alteração de UI.
- **Melhoria Proposta**
  > **Refactor** (habilitador): usar `@testing-library/react` (já usado em Permutas via `abaFiltro`?) para: (a) `SispagPanel.test.tsx` — renderiza com mock de `fetchSispagPainel`, valida 5 tabs, valida `formar` desabilitado quando `formando=true`; (b) `LoteCard.test.tsx` — renderiza RASCUNHO/FINALIZADO/RETORNADO e valida botões condicionalmente habilitados; (c) `lib/sispag.test.ts` — valida `IngestaoPagamentosEmAndamentoError` em 409.
- **Resultado Esperado**
  > Test files SISPAG frontend: 0 → 3; ficha branca antes de fatiar `SispagPanel`.
- **Tactic alvo**: Refactor (habilitador)
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - Testes SISPAG frontend: 0 → 3+
  - Regressões em `LoteCard` transições capturadas por CI antes do PR
- **Risco de não fazer**: modifiability-1 vira uma **refactor manual sem net** — probabilidade de introduzir regressão em botões condicionais (`faltaModalidade`, `busy`, `isRascunho`, `isFinalizado`) alta.
- **Dependências**: precede modifiability-1.

### [modifiability-6] Eliminar warnings `setState-in-effect` no SISPAG frontend

- **Problema**
  > 2 warnings React canônicos (`page.tsx:199`, `AdicionarTituloDialog:48`) sobre `setState` sincronizado em `useEffect`. Hoje benigno; futuros polls (Fatia 3) podem exibir cascading renders.
- **Melhoria Proposta**
  > **Refactor**: (a) em `page.tsx`, mover `void carregar()` para o `onOpenChange` do tab ou usar hook `useSispagData()` (ver modifiability-1); (b) em `AdicionarTituloDialog`, redefinir a chave do dialog no parent (`key={lote.id}`) e derivar `sel`/`busca` como estado inicial via `useState(() => …)`.
- **Resultado Esperado**
  > 2 warnings frontend SISPAG → 0.
- **Tactic alvo**: Refactor
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - Warnings frontend SISPAG: 2 → 0
- **Risco de não fazer**: latente; visibilidade zero em produção.
- **Dependências**: cai naturalmente dentro do modifiability-1.

### [modifiability-7] Sincronizar state-machine `lote-pagamento` no ontology (`partial` → `implemented`)

- **Problema**
  > `ontology/_coverage.json` marca `state-machines/lote-pagamento` como `partial`, mas o código já implementa 4 status e 6+ transições (RASCUNHO/FINALIZADO/CANCELADO/RETORNADO, ADR-0019). Drift ontológico atrapalha o próximo `/feature-new` (BAIXADO da Fatia 3).
- **Melhoria Proposta**
  > `/retro-ontology` focado em SISPAG: atualizar `ontology/state-machines/lote-pagamento.md` com as 6 transições reais + `ontology/_coverage.json` (`state_machines_implemented: 1 → 2`). Referenciar `LotePagamentoService.finalizarLote/reabrirLote/cancelarLote/marcarRetorno/transicionar` como `resolved_by`.
- **Resultado Esperado**
  > `ontology/_coverage.json.state_machines_partial: 1 → 0`; `implemented: 1 → 2`.
- **Tactic alvo**: Defer Binding (contract with team via ontology)
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - Drift SISPAG em `_coverage.json`: 1 → 0
- **Risco de não fazer**: o próximo `OntologyCurator` "descobre" o que já existe e cria diff duplicado.
- **Dependências**: nenhuma; roda em qualquer `/retro-ontology`.

## 6. Notas do agente

- **Escopo aplicado**: só arquivos SISPAG (`*sispag*` em backend e `app/sispag/**` no frontend). `ConexosBaseClient`, `EnvironmentProvider`, `PostgreeDatabaseClient` são shared infra e não entraram no LOC-cap.
- **Cross-QA**:
  - **modifiability-1 + modifiability-5 ↔ Testability**: sem testes frontend, o split é refactor-às-cegas — Testability precisa fornecer a rede antes.
  - **modifiability-2 ↔ Deployability**: cada magic-number hoje = um deploy lockstep FE+BE + bump semver — Deployability herda o pull.
  - **modifiability-3 + modifiability-4 ↔ Integrability**: `describeConexosValidation` duplicado e `SispagPainelService` como screen-composer são a mesma dor de "quem é dono do contrato Conexos SISPAG?" — Integrability deve escalar.
  - **F-modifiability-2** overlaps com Security se algum limite (fan-out, teto) vira vetor de DoS quando configurado errado — a mudança para SSM deve manter guardrails (min/max defensáveis).
- **Não medido**: fan-out real de mudanças (git churn por arquivo nos últimos N PRs) — não coletado; recomenda-se `git log --numstat -- src/backend/domain/service/sispag src/frontend/app/sispag` no próximo Regis para calibrar hotspots reais.
- **Positivo destacado**: disciplina DDD+DI é exemplar (0 cross-layer, 47 anotações, 0 `process.env` cru) — o débito é de granularidade (Split/SemanticCoherence/DeferBinding), não de arquitetura estrutural.
