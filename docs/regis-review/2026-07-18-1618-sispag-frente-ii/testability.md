---
qa: Testability
qa_slug: testability
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-testability
generated_at: 2026-07-18T16:35:00Z
scope: backend+frontend (SISPAG / Frente II only)
score: 6
findings_count: 8
cards_count: 7
---

# Testability — Regis-Review (SISPAG / Frente II)

## 1. Cenário Geral (Bass General Scenario)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev alterando regra da carteira SISPAG (ex.: janela de vencimento A5 "pagar hoje", máquina RASCUNHO→FINALIZADO→RETORNADO, modalidade A2, parser `.RET`/fin052) | Push/PR toca `domain/service/sispag/`, `routes/sispag.ts`, `app/sispag/page.tsx` ou o cliente Conexos | Backend service + repositório + rota + frontend Next.js do SISPAG | Dev/CI local; sem HML Conexos disponível em CI | Suite unitária cobre a lógica, tipa os erros esperados, força cenários de conflito de versão/lock ocupado, e o CI barra regressão de cobertura | Testes rodam em <10 s, cobertura ≥ 88% lines nos serviços SISPAG, 100% das invariantes I1–I6 asseguradas por `describe`/`it` nomeados, 0 vazamento de tempo/UUID real para dentro do teste, ≥ 1 teste por rota HTTP |

Bass ancora testabilidade em duas famílias: **Control & Observe System State** (Specialized Interfaces, Recordable Test Cases, Sandbox, Executable Assertions, Abstract Data Sources) e **Limit Complexity** (Limit Structural Complexity, Limit Non-Determinism). O SISPAG pontua bem na primeira família nos serviços/repos/clients (DI via tsyringe permite mocks limpos por construtor, os erros tipados são `Executable Assertions` de fato) e razoavelmente mal na segunda (`Date.now()` e `randomUUID()` sem clock/id injetável; nenhum `useFakeTimers`; page.tsx do frontend com 832 LOC sem qualquer teste; `routes/sispag.ts` com 361 LOC e 14 endpoints exercitados só indiretamente pelos testes de serviço).

## 2. Métricas observadas

### 2.1 Cobertura por camada — SISPAG (Jest --coverage, 2026-07-18)

Comando: `npm test -- --coverage --collectCoverageFrom='domain/service/sispag/**/*.ts' --collectCoverageFrom='domain/repository/sispag/**/*.ts' --collectCoverageFrom='domain/client/ConexosSispag*.ts' --testPathPatterns='sispag|ConexosSispag'` (10 suites / 97 tests, 3.22 s).

| Camada / arquivo | % Stmts | % Branch | % Funcs | % Lines | Alvo lines | Status |
|---|---|---|---|---|---|---|
| **Backend SISPAG (agregado)** | 88.29 | 66.66 | 90.71 | **89.02** | ≥ 80 | ✅ |
| domain/client/ConexosSispagClient.ts (332 LOC) | 92.55 | 68 | 100 | 98.79 | ≥ 80 | ✅ |
| domain/client/ConexosSispagRetornoClient.ts (285 LOC) | 84.88 | 52.54 | 91.66 | 85.52 | ≥ 80 | ✅ |
| domain/client/ConexosSispagWriteClient.ts (305 LOC, dormente) | 94.79 | 60.93 | 100 | 94.44 | ≥ 80 | ✅ |
| domain/service/sispag/FormacaoLotesService.ts (128 LOC) | 98.18 | 66.66 | 100 | 100 | ≥ 80 | ✅ |
| domain/service/sispag/IngestaoPagamentosService.ts (163 LOC) | 98.52 | 75 | 100 | 98.41 | ≥ 80 | ✅ |
| domain/service/sispag/LotePagamentoService.ts (405 LOC) | 97.65 | 94 | 100 | 97.52 | ≥ 80 | ✅ |
| domain/service/sispag/SispagPainelService.ts (247 LOC) | 99.09 | 70 | 100 | 98.94 | ≥ 80 | ✅ |
| **domain/service/sispag/RetornoOrquestracaoService.ts (198 LOC)** | **0** | **0** | **0** | **0** | ≥ 80 (quando wired) | ⚠️ dormente |
| domain/repository/sispag/LotePagamentoRepository.ts (420 LOC) | 71.26 | 68.91 | 62.5 | **70.66** | ≥ 80 | ⚠️ |
| domain/repository/sispag/PagamentoIngestaoRunRepository.ts (112 LOC) | 100 | 83.33 | 100 | 100 | ≥ 80 | ✅ |
| domain/repository/sispag/TituloAPagarRepository.ts (169 LOC) | 95.74 | 80 | 88.88 | 95.23 | ≥ 80 | ✅ |
| **routes/sispag.ts (361 LOC, 14 endpoints)** | **não medido** | — | — | **~0** | ≥ 50 | ❌ |
| **http/sispagGate.ts (21 LOC)** | **não medido** | — | — | **~0** | ≥ 80 | ❌ |
| **jobs/ingest-pagamentos.ts (34 LOC)** | **não medido** | — | — | **~0** | ≥ 60 | ❌ |
| **jobs/formar-lotes.ts (32 LOC)** | **não medido** | — | — | **~0** | ≥ 60 | ❌ |
| **Frontend `app/sispag/**` (1495 LOC executável) + `lib/sispag.ts` (339 LOC)** | — | — | — | **0** | ≥ 40 | ❌ |

### 2.2 Métricas complementares

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Test files backend SISPAG | 10 (7 sispag + 3 clients) | — | ✅ | baseline `_shared-metrics.md` |
| Test files frontend SISPAG | **0** de 5 fontes (~1834 LOC) | ≥ 3 | ❌ | baseline `_shared-metrics.md` |
| `it()` / `test()` blocks backend SISPAG | 97 tests em 10 suites | — | ✅ | `jest --testPathPatterns='sispag'` |
| Serviços com DI-por-construtor (não `container.resolve`) nos testes | 4/4 (Formacao, Ingestao, Lote, Painel) | 100% | ✅ | `LotePagamentoService.test.ts:81-90` (padrão CLAUDE.md) |
| Fixtures de resposta Conexos (`__fixtures__/` ou `*.fixture.json`) | **0** (todos os mocks são inline `jest.fn().mockResolvedValue(...)`) | ≥ 1 por endpoint crítico (fin064 títulos, fin015 lote, fin052 `.RET`) | ⚠️ | `find src/backend -name '__fixtures__' -o -name '*.fixture.*'` |
| Testes de integração (`*.integration.test.ts`) em SISPAG | **0** | ≥ 1 por repositório com SQL complexo | ❌ | `find src/backend -name '*.integration.test.ts'` (só matcher no jest.config, sem arquivos) |
| `jest.useFakeTimers()` / clock mockado em qualquer teste SISPAG | **0** ocorrências | ≥ 2 (janela A5 + timeouts do poller de retorno) | ❌ | `grep -rn 'useFakeTimers\|setSystemTime' src/backend --include='*.test.ts'` |
| Leituras de `Date.now()` em source SISPAG sem clock injetável | **2** (IngestaoPagamentos:74, SispagPainel:60) | 0 (usar `ClockProvider`) | ⚠️ | `grep -rn 'Date.now\|new Date()' src/backend/domain/**/sispag` |
| Chamadas a `randomUUID()` em source SISPAG sem provider | **2** (LotePagamentoRepository:98, PagamentoIngestaoRunRepository:41) | 0 (`IdProvider`) | ⚠️ | idem |
| Erros tipados em SISPAG (Executable Assertions) | 8 classes (`IngestLockBusy`, `LoteEstadoInvalido`, `LoteVersaoConflito`, `LoteFilial`, `ModalidadePendente`, `TituloEmOutroLote`, `TituloNaoElegivel`, `AlocacaoSaldo`) | — | ✅ | `ls src/backend/domain/errors/` |
| Testes que asseguram tipo de erro (`rejects.toBeInstanceOf(...)`) | ≥ 6 casos em `LotePagamentoService.test.ts` + 1 em `IngestaoPagamentosService.test.ts` | ≥ 1 por erro tipado | ✅ | `LotePagamentoService.test.ts:99-289`, `IngestaoPagamentosService.test.ts:139` |
| Testes de rota HTTP (`supertest` ou `request(app)`) para `/sispag/*` | **0** (14 endpoints não têm teste de rota) | ≥ 1 smoke por endpoint | ❌ | `grep -rn 'supertest\|request(app' src/backend --include='*.test.ts'` |
| Coverage floor CI backend (global) | lines 72 / branch 54 / func 78 | ≥ 80 lines domain | ⚠️ | `src/backend/jest.config.cjs:34-44` |
| Coverage floor CI backend por subdiretório `routes/` ou `jobs/` | **ausente** | ≥ 50 lines | ❌ | idem — só há floor em `./domain/service/` |
| Coverage floor CI frontend (global) | lines 20 / branch 9 / func 14 | ≥ 40 (curto prazo) | ❌ | `src/frontend/jest.config.js:35-42` (o próprio comentário admite "Potemkin"→real) |
| CI executa `npm test -- --coverage` bloqueando merge | sim (backend + frontend) | sim | ✅ | `.github/workflows/ci.yml:27,46` |
| Uso de `fast-check` em SISPAG (Property-Based) | **0** ocorrências | ≥ 2 (totais de valor em `LotePagamentoService`, saldos em títulos parciais) | ⚠️ | `grep -rn 'fast-check' src/{backend,frontend} --include='*.test.ts*'` |
| Maior teste SISPAG por LOC | `LotePagamentoService.test.ts` = 506 LOC (unit-under-test 405 LOC, ratio 1.25) | ≤ 500 LOC ou split por describe | ⚠️ | `wc -l` |

> ⚠️ **Não medível localmente**: cobertura efetiva das rotas/jobs SISPAG em produção (só `bxaCodSeq` real, `.RET` real do Nexxera, HAR real de `arquivosRetorno/processar`). Requer HML/produção. Recomendação: capturar HAR do fluxo em HML e converter em fixtures reutilizáveis por `ConexosSispagRetornoClient.test.ts` (Recordable Test Cases).

## 3. Tactics — Cobertura no SISPAG

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | tsyringe com `@injectable()` / `@inject()` — todos os 5 serviços SISPAG recebem cliente Conexos, repo, DB e LogService por construtor. Tests fazem `new LotePagamentoService(repoMock, conexosMock, dbMock, logMock)`. | ✅ presente | `LotePagamentoService.ts:36-44`; `LotePagamentoService.test.ts:81-92` (fábrica `make(repo, titulo?)`) |
| **Recordable Test Cases** | Todos os mocks de resposta Conexos são inline (`jest.fn().mockResolvedValue({...})`). Nenhum arquivo `.fixture.json` / `__fixtures__/` — se a Conexos alterar o payload fin064/fin052, os testes continuam verdes com dados sintéticos. | ⚠️ parcial | `ConexosSispagClient.test.ts:1-183` (mocks inline); `ConexosSispagRetornoClient.test.ts` idem; ausência confirmada por `find … -name '__fixtures__'` |
| **Sandbox** | Testes exercitam DRY-RUN (`ConexosWriteClient` gated por `conexosWriteEnabled`/`conexosDryRun`); `sispagEnabled` flag no gate. Nenhum tenant real acionado. `EnvironmentProvider` mockável. **Não há** ambiente sandbox de Postgres (nenhum `docker-compose.test.yml`, nenhum `*.integration.test.ts`) — SQL do `LotePagamentoRepository` (advisory lock, versão otimista) só existe em unit tests que mockam o `PostgreeDatabaseClient`. | ⚠️ parcial | `RetornoOrquestracaoService.ts:75-77`; `sispagGate.ts:16-20`; ausência: `find … -name '*.integration.test.ts'` (0 arquivos) |
| **Executable Assertions** | 8 classes de erro tipadas em `domain/errors/` (`LoteEstadoInvalidoError`, `LoteVersaoConflitoError`, `ModalidadePendenteError`, `TituloEmOutroLoteError`, `IngestLockBusyError`, etc.) — tests asseguram `rejects.toBeInstanceOf(...)`. Excelente base de "assertivas executáveis" pelas invariantes I1–I6. | ✅ presente | `LotePagamentoService.test.ts:98-289`; `IngestaoPagamentosService.test.ts:139` |
| **Abstract Data Sources** | Repositórios abstraem Postgres via `PostgreeDatabaseClient` (com `withTransaction` e `withAdvisoryLock` mockáveis — ver `buildDb()` em `LotePagamentoService.test.ts:43-47`). Clients Conexos abstraem HTTP. **Time** e **UUID** NÃO são abstraídos: `Date.now()` e `randomUUID()` chamados diretamente. | ⚠️ parcial | `LotePagamentoService.test.ts:43-47`; contra-exemplo: `IngestaoPagamentosService.ts:74`, `LotePagamentoRepository.ts:98` |
| **Limit Structural Complexity** | Serviços SISPAG são unidades pequenas (128–405 LOC), coesos por responsabilidade (Ingestao, Formacao, Lote, Painel, Retorno). PatternGuardian ativo. Único vermelho: `page.tsx` do frontend com 832 LOC concentra painel + 4 abas + paginação RET + tabs — grande demais para testar de forma isolada. | ⚠️ parcial | `wc -l src/frontend/app/sispag/page.tsx` (832 LOC); serviços backend OK |
| **Limit Non-Determinism** | 2 usos de `Date.now()` em serviços (a janela A5 "-15/+45 dias" da ingestão é business logic; hoje não pode ser fixada por teste). 2 usos de `randomUUID()` em repositórios (id do lote e da run, criados em source — cross-test snapshotting fica não-determinístico). Nenhum `jest.useFakeTimers()` em suíte SISPAG. | ❌ ausente para tempo/UUID | `IngestaoPagamentosService.ts:74` (`const now = Date.now(); const minVencimento = now - 15 * DAY_MS`); `LotePagamentoRepository.ts:98` |

Total: 4 ✅, 3 ⚠️, 0 ❌ (as fraquezas ⚠️ são as duas últimas + Recordable Test Cases + Abstract Data Sources; a única categoria genuinamente ❌ é a sub-tactic "Time/UUID abstraction" dentro de Limit Non-Determinism e a cobertura da camada Frontend/routes).

## 4. Findings (achados)

### F-testability-1: Frontend SISPAG (`app/sispag/**` + `lib/sispag.ts`, ~1834 LOC) sem NENHUM teste

- **Severidade**: **P1**
- **Tactic violada**: Specialized Interfaces (test seams), Limit Structural Complexity
- **Localização**: `src/frontend/app/sispag/page.tsx` (832 LOC), `src/frontend/app/sispag/components/{IngestaoDialog,AdicionarTituloDialog,LoteCard}.tsx` (689 LOC), `src/frontend/lib/sispag.ts` (339 LOC)
- **Evidência (objetiva)**:
  ```
  # baseline
  frontend sispag test files: 0
  # e nenhuma referência a "sispag" nos __tests__ do frontend
  grep -rn 'sispag' src/frontend/__tests__/  → nenhum resultado
  # coverage floor global do FE hoje: 20/9/14 (o comentário no jest.config admite "Potemkin"→real)
  ```
- **Impacto técnico**: paginação/tab-switching de `.RET` recém-adicionada (commit `1859e64…` e derivados) não tem asserção — regressão no filtro de RET, na quebra de página ou na sincronização `abaAtiva ↔ estado do lote` só é detectável em produção. O componente é grande demais para testar sem quebrar em subcomponentes.
- **Impacto de negócio**: analista financeiro é o operador final; UX quebrada em RET (paginação/filial) atrasa reconciliação do lote e a baixa no fin010.
- **Métrica de baseline**: **0 test files / 5 source files**; cobertura frontend SISPAG **0%** (não há CollectFrom para `app/sispag/**` gerando cobertura contra a floor global 20%).

### F-testability-2: `routes/sispag.ts` (361 LOC, 14 endpoints) sem teste de rota

- **Severidade**: **P1**
- **Tactic violada**: Specialized Interfaces (o adaptador HTTP é uma superfície testável distinta do service)
- **Localização**: `src/backend/routes/sispag.ts:1-361`
- **Evidência (objetiva)**:
  ```
  # 14 endpoints (grep 'router.(get|post|delete)')
  # 0 testes: find src/backend/routes -name '*.test.ts' → 0 arquivos
  # supertest / request(app) em qualquer teste do repo: 0 ocorrências
  ```
- **Impacto técnico**: a função `respondLoteError()` mapeia `HandlerError` (userMessage/code/statusCode/retryable) para JSON — se algum dos 8 erros tipados regredir para 500 genérico, os testes de serviço (que só asseguram o `throw`) continuam verdes. Zod schemas (`criarLoteSchema`, `incluirTituloSchema` etc.) também não são exercitados por testes.
- **Impacto de negócio**: o cliente HTTP é a linha de frente do analista — 409 vs 422 vs 500 muda o comportamento do frontend (retry, mensagem). Silencioso hoje.
- **Métrica de baseline**: **0 route tests / 14 endpoints**; `routes/sispag.ts` cobertura **~0%** (jest.config.cjs cobre por default, mas não há teste que importe o módulo).

### F-testability-3: `Date.now()` e `randomUUID()` chamados diretamente em source — ausência de `ClockProvider`/`IdProvider`

- **Severidade**: **P1**
- **Tactic violada**: Limit Non-Determinism (Abstract Data Sources)
- **Localização**:
  - `src/backend/domain/service/sispag/IngestaoPagamentosService.ts:74` — `const now = Date.now(); const minVencimento = now - 15 * DAY_MS; const maxVencimento = now + 45 * DAY_MS;`
  - `src/backend/domain/service/sispag/SispagPainelService.ts:60`
  - `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:1,98` — `import { randomUUID } from 'node:crypto'; … const id = randomUUID();`
  - `src/backend/domain/repository/sispag/PagamentoIngestaoRunRepository.ts:1,41`
- **Evidência (objetiva)**:
  ```
  grep -rn 'Date.now\|randomUUID' src/backend/domain/**/sispag | grep -v test
  → 4 hits (2 Date.now + 2 randomUUID)
  grep -rn 'useFakeTimers\|setSystemTime\|MockDate' src/backend --include='*.test.ts'
  → 0 hits
  ```
- **Impacto técnico**: a janela A5 "pagar hoje" (regra de negócio: `now-15d…now+45d`) não é testável a partir de um clock fixo — para validar a fronteira do "pagar hoje" hoje o teste teria que rodar em uma data específica. O `randomUUID()` em source acopla assertions a snapshots não-determinísticos e impede que o teste use um ID conhecido para comparar por igualdade.
- **Impacto de negócio**: mudança na janela (ex.: passar para `-7/+30`) exige revisão manual — não há teste que quebre. Regras de vencimento são business logic sensível a compliance.
- **Métrica de baseline**: 2 leituras de tempo + 2 gerações de UUID sem provider abstraído. Alvo: 0.

### F-testability-4: `RetornoOrquestracaoService` com 0% de cobertura e ainda dormente

- **Severidade**: **P2**
- **Tactic violada**: Executable Assertions (esqueleto sem contrato testável)
- **Localização**: `src/backend/domain/service/sispag/RetornoOrquestracaoService.ts:1-198`
- **Evidência (objetiva)**:
  ```
  service/sispag/RetornoOrquestracaoService.ts | 0 | 0 | 0 | 0 | 1-196
  ```
- **Impacto técnico**: quando o reader de SharePoint/`.RET` for wired (Fatia 3), o serviço já traz decisões (dry-run precedence, propagação de erro, contagem de `bxaCodSeq`) que não têm nenhum teste de esqueleto (`it.todo(...)` ou `it.skip(...)` como âncora). Fácil esquecer de cobrir na hora do wire.
- **Impacto de negócio**: hoje inerte (I1 preservado). Amanhã, quando wired, virará o único caminho de baixa automática — silenciosamente sem gate de testes.
- **Métrica de baseline**: **0% lines / 0 tests** para 198 LOC de esqueleto.

### F-testability-5: Repositórios SISPAG com SQL complexo sem teste de integração real

- **Severidade**: **P2**
- **Tactic violada**: Sandbox (nenhum ambiente Postgres controlado); Abstract Data Sources incompleta
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:266-282,314-319,338,373` (linhas não cobertas — advisory lock cross-processo + concorrência otimista)
- **Evidência (objetiva)**:
  ```
  # repos SISPAG têm testes unitários (mockando pg.Pool) mas
  # LotePagamentoRepository.ts | % Lines 70.66 (uncovered 122,132-137,146,266-282,314-319,338,373)
  find src/backend -name '*.integration.test.ts' → 0 arquivos
  # jest.config.cjs:7 ignora '\.integration\.test\.ts$' → estrutura preparada, mas nenhum arquivo
  ```
- **Impacto técnico**: o comportamento real do `SELECT … FOR UPDATE`, do advisory lock cross-processo (`pg_try_advisory_lock`) e da versão otimista (`WHERE versao = $N`) só existe no Postgres. Um bug em locking (deadlock, ordem de UPDATE) passa despercebido — não é reproduzível com mock de `withTransaction(fn) => fn({})`.
- **Impacto de negócio**: dois analistas mexendo no mesmo lote (cenário A4 real) — se o lock não segurar, um dos dois perde a versão sem que ninguém saiba.
- **Métrica de baseline**: **0 integration tests** sobre 420 LOC de SQL do `LotePagamentoRepository`; branches descobertos: 4 blocos (advisory lock busy, race entre optimistic-lock e transição, adopt vira manual, tocarLote em concorrência).

### F-testability-6: Sem fixtures reais de Conexos (`fin064`, `fin015`, `fin052`) — todos mocks inline

- **Severidade**: **P2**
- **Tactic violada**: Recordable Test Cases
- **Localização**: `src/backend/domain/client/ConexosSispagClient.test.ts`, `ConexosSispagRetornoClient.test.ts`, `ConexosSispagWriteClient.test.ts`
- **Evidência (objetiva)**:
  ```
  # 0 arquivos __fixtures__ ou *.fixture.* em domain/client (fora node_modules)
  find src/backend/domain/client -name '__fixtures__' -o -name '*.fixture.*' → 0
  ```
- **Impacto técnico**: se a Conexos alterar campo (ex.: `titulosRejeitados` virar `titulos_rejeitados`, ou `bxaCodSeq` virar `bxaCod`), os mocks sintéticos continuam alinhados aos tipos internos e o teste passa — a regressão só aparece em HML/prod. Recordable Test Cases é o antídoto explícito de Bass para "contrato de terceiro".
- **Impacto de negócio**: SISPAG está READ-ONLY em prod hoje (I1); qualquer drift no fin052 quebra o parser do `.RET` silenciosamente quando a Fatia 3 ligar.
- **Métrica de baseline**: **0 fixtures capturadas** (HAR/JSON snapshot) para 3 clients (`fin064` títulos, `fin015` lote/borderô, `fin052` retornos). Alvo mínimo: 1 fixture por endpoint crítico (≥ 6 fixtures).

### F-testability-7: Coverage floor CI não protege `routes/`, `jobs/`, `http/` nem `app/sispag/`

- **Severidade**: **P2**
- **Tactic violada**: Executable Assertions (o gate de CI é a assertiva mais forte de todas)
- **Localização**: `src/backend/jest.config.cjs:34-44`, `src/frontend/jest.config.js:35-42`
- **Evidência (objetiva)**:
  ```
  # backend: só há floor por diretório em ./domain/service/ (88 lines / 60 branches).
  # routes/sispag.ts, http/sispagGate.ts, jobs/*.ts caem só no bucket global (72/54/78)
  # que se dilui pela massa de código de outras frentes — SISPAG pode adicionar rota
  # sem teste sem tripar o CI.
  # frontend: global 20 lines / 9 branches / 14 functions (o próprio comentário do
  # arquivo admite que o número anterior era "Potemkin" e este é o real, muito baixo).
  ```
- **Impacto técnico**: uma nova rota SISPAG sem teste não faz o CI vermelho; um novo componente frontend sem teste também não. O gate existe mas é frouxo para as camadas onde o SISPAG mais cresce agora (frontend + rotas).
- **Impacto de negócio**: falso senso de segurança — o time acha que "o CI trava merge" quando na verdade só trava em serviço.
- **Métrica de baseline**: **0 sub-directory thresholds** para `./routes/`, `./jobs/`, `./http/` no backend; **0** para `./app/sispag/` no frontend.

### F-testability-8: `page.tsx` do SISPAG (832 LOC) concentra demais para ser testável em unidades

- **Severidade**: **P3**
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/frontend/app/sispag/page.tsx` (832 LOC — painel + 4 abas + paginação RET + `useTabelaFiltro` + orquestração de fetch)
- **Evidência (objetiva)**:
  ```
  wc -l src/frontend/app/sispag/page.tsx → 832
  # subcomponentes já existem (LoteCard, IngestaoDialog, AdicionarTituloDialog)
  # mas o painel principal segue monolítico
  ```
- **Impacto técnico**: mesmo com uma rodada de "testar `page.tsx`", o setup necessário (mock `fetchSispagPainel`, `fetchLotes`, `fetchRetornos`, `useAuth`, `useTabelaFiltro`, `useToast`) é tão pesado que o próximo dev vai pular. O antídoto de Bass para "difícil de testar" é *reduzir estrutura*, não *reforçar teste*.
- **Impacto de negócio**: acumula débito — cada nova feature (RET foi a última) empilha código não-coberto no mesmo arquivo.
- **Métrica de baseline**: 832 LOC em 1 componente vs. teto sugerido de 300 LOC.

## 5. Cards Kanban

### [testability-1] Extrair `SispagPainelClient`/`RetornoTabela` do `page.tsx` e cobrir com Testing Library

- **Problema**
  > Frontend SISPAG (`app/sispag/**` + `lib/sispag.ts`, ~1834 LOC) não tem NENHUM teste. `page.tsx` cresceu para 832 LOC com paginação de `.RET` recém-adicionada, 4 abas, filtro por filial e `useTabelaFiltro`. Qualquer regressão de UX (paginação, filtro, tab-switching) só vai aparecer em produção com analista financeiro reclamando.
- **Melhoria Proposta**
  > Aplicar **Specialized Interfaces + Limit Structural Complexity**: quebrar `page.tsx` em `RetornosTab.tsx`, `LotesTab.tsx`, `TitulosTab.tsx` (subcomponentes puros, props-in) + hook `useSispagPainel()`. Escrever 3 test files iniciais: `RetornosTab.test.tsx` (paginação, filtro por filial, estado vazio), `LotesTab.test.tsx` (tabs RASCUNHO vs FINALIZADO/RETORNADO), `lib/sispag.test.ts` (parse do JSON do backend, tratamento de 403 do gate). Mockar `apiFetch` com jest.mock. Depois subir o floor `./app/sispag/` no jest.config para `lines: 40, branches: 25`.
- **Resultado Esperado**
  > SISPAG frontend passa de **0 test files / 0% cobertura** para **≥ 3 test files** e **≥ 40% lines** na pasta `app/sispag/`. Regressão em paginação `.RET` ou filtro de filial passa a ser detectável no CI (não em prod).
- **Tactic alvo**: Specialized Interfaces + Limit Structural Complexity
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-1, F-testability-8
- **Métricas de sucesso**:
  - Test files frontend SISPAG: **0 → ≥ 3**
  - Cobertura `app/sispag/` (lines): **~0% → ≥ 40%**
  - LOC do maior arquivo `app/sispag/`: **832 → ≤ 400**
- **Risco de não fazer**: a próxima feature de frontend (baixa manual, edição de modalidade inline, atalhos por analista) empilha em `page.tsx` e vira intratável — nenhum teste segura invariantes de UX.
- **Dependências**: —

### [testability-2] Adicionar testes de rota (supertest) para `routes/sispag.ts` — 14 endpoints

- **Problema**
  > `routes/sispag.ts` (361 LOC, 14 endpoints, incluindo criar/finalizar/reabrir/cancelar lote e atualizar conta pagadora/modalidade) não tem teste. O `respondLoteError()` mapeia 8 erros tipados para HTTP (409 vs 422 vs 500); se qualquer mapping regredir, os tests de serviço passam sem detectar. Zod schemas (`criarLoteSchema`, `incluirTituloSchema`) também não são exercitados.
- **Melhoria Proposta**
  > Aplicar **Specialized Interfaces (adapter HTTP)**: instalar `supertest` (já indireto via `@types/express`?); criar `src/backend/routes/sispag.test.ts` com fábrica que monta um `express()` mínimo, injeta service mocks via `container.register(SispagPainelService, { useValue: mock })`, e testa: (a) 200 no happy-path de cada endpoint (smoke), (b) 400 no Zod-fail dos POST/DELETE, (c) mapping de `LoteVersaoConflitoError → 409`, `LoteEstadoInvalidoError → 422`, `IngestLockBusyError → 429`. Adicionar floor por subdiretório `./routes/` no `jest.config.cjs`.
- **Resultado Esperado**
  > Cobertura de `routes/sispag.ts` passa de **~0% → ≥ 70% lines**; os 14 endpoints têm pelo menos 1 smoke test cada; o mapping erro → HTTP passa a ser verificável. CI trava merge se algum novo endpoint SISPAG não tiver teste (`./routes/` floor 60 lines).
- **Tactic alvo**: Specialized Interfaces
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-2, F-testability-7
- **Métricas de sucesso**:
  - Route tests SISPAG: **0 → ≥ 14 smoke + 8 mapping**
  - Cobertura `routes/sispag.ts` (lines): **~0% → ≥ 70%**
  - Jest coverage floor `./routes/` (lines): **ausente → 60**
- **Risco de não fazer**: regressão silenciosa no contrato HTTP do SISPAG — o frontend passa a receber 500 em lugar de 409, retry loop indevido, analista bloqueado no lote.
- **Dependências**: —

### [testability-3] Introduzir `ClockProvider` e `IdProvider` (@singleton, @injectable) e mockar via DI

- **Problema**
  > `Date.now()` (2 hits, incluindo a janela A5 `now-15d…now+45d` em `IngestaoPagamentosService`) e `randomUUID()` (2 hits em repositórios) são chamados diretamente em source. Nenhum `jest.useFakeTimers()` na suíte SISPAG. Consequência: (a) a fronteira "pagar hoje" não pode ser fixada por teste; (b) IDs de lote/run em snapshots são não-determinísticos, forçando `expect.any(String)` no lugar de igualdade exata.
- **Melhoria Proposta**
  > Aplicar **Limit Non-Determinism + Abstract Data Sources**: criar `ClockProvider` e `IdProvider` em `domain/libs/`, `@injectable() @singleton()`, com implementação padrão (`Date.now()`, `randomUUID()`) e substitutos de teste (`FakeClockProvider(fixedTs)`, `FakeIdProvider(seed)`). Injetar em `IngestaoPagamentosService`, `SispagPainelService`, `LotePagamentoRepository`, `PagamentoIngestaoRunRepository`. Reescrever ao menos 2 testes para pinar `now = 1_700_000_000_000` e assertar que a janela `[minVencimento, maxVencimento]` é exatamente `[now-15d, now+45d]`.
- **Resultado Esperado**
  > 4 sites de non-determinism em source **→ 0**; testes passam a assertar sobre valores exatos de vencimento e IDs de lote; a regra A5 "pagar hoje" ganha 1 teste explícito de fronteira. Padrão fica disponível para `RetornoOrquestracaoService` quando ele acordar.
- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - `Date.now()` / `randomUUID()` em source SISPAG: **4 → 0**
  - Testes com clock/ID pinado em SISPAG: **0 → ≥ 4**
  - Casos explícitos de fronteira da janela A5: **0 → ≥ 2** (dia D-15 borderline, dia D+45 borderline)
- **Risco de não fazer**: mudar a janela de vencimento (regra de negócio sensível) sem cair nenhum teste; snapshots com UUID batendo em `expect.any(String)` mascara refactor errado.
- **Dependências**: —

### [testability-4] Ancorar contrato do `RetornoOrquestracaoService` com `it.todo()` e testes de esqueleto para dry-run/erro

- **Problema**
  > `RetornoOrquestracaoService.ts` (198 LOC) tem **0% de cobertura** e nenhum teste — é esqueleto dormente (Fatia 3). Quando for wired ao reader de SharePoint, é fácil esquecer de cobrir as decisões que JÁ estão no código: dry-run precedence, propagação de erro por arquivo, contagem de `bxaCodSeq` do detalhe.
- **Melhoria Proposta**
  > Aplicar **Executable Assertions**: criar `RetornoOrquestracaoService.test.ts` com (a) 1 caso happy de dry-run (mock de `listarRetNaPasta` retornando 2 arquivos → status `dry-run` em ambos, nenhuma chamada a `carregarArquivoRetorno`), (b) 1 caso happy pós-write (mock de `carregarArquivoRetorno`/`listDetalhe`/`listErros`, assertar `garCodSeq` e `baixas`), (c) 1 caso de erro por arquivo (mock rejeita, assertar status `error` e que os outros arquivos continuam), (d) `it.todo(...)` para os TODOs (advisory lock, ledger, status BAIXADO, reader real). Isso ativa o gate mesmo antes da Fatia 3.
- **Resultado Esperado**
  > `RetornoOrquestracaoService.ts` sobe de **0% → ≥ 60% lines** (o que estiver wired hoje); TODOs viram `it.todo(...)` visíveis no relatório de testes. Ao ligar a Fatia 3, o dev vê os todos no `--verbose` e é forçado a cobrir cada um.
- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - Cobertura `RetornoOrquestracaoService.ts` (lines): **0% → ≥ 60%**
  - `it.todo` ancorados em decisões pendentes: **0 → ≥ 5** (reader, advisory lock, ledger, status BAIXADO, rejeitado)
- **Risco de não fazer**: Fatia 3 vai wire, o serviço vira caminho crítico de baixa automática, e ninguém percebe que a única lógica testada é "no-op".
- **Dependências**: (bloqueia a Fatia 3 se combinada com `--no-regis-review`)

### [testability-5] Criar `LotePagamentoRepository.integration.test.ts` contra Postgres local (docker-compose)

- **Problema**
  > `LotePagamentoRepository.ts` (420 LOC) está em **70.66% lines** — os 30% descobertos são exatamente advisory lock cross-processo, `SELECT … FOR UPDATE`, versão otimista (`WHERE versao = $N`), e o path adopt-vira-manual. O mock de `withTransaction(fn) => fn({})` e `withAdvisoryLock(k, onA, onB) => onA()` não reproduz o comportamento real do Postgres.
- **Melhoria Proposta**
  > Aplicar **Sandbox**: adicionar `docker-compose.test.yml` com Postgres 15 (schema por migração), script `npm run test:integration` que sobe o container, aplica `migrations/0023..0031`, roda `*.integration.test.ts` (o matcher já está em `jest.config.cjs:7`) e derruba. Cobrir 3 cenários: (a) advisory lock: 2 workers competindo pelo mesmo lote → 1 rejeita com `LoteVersaoConflitoError`, (b) versão otimista: 2 UPDATEs concorrentes → 1 falha, (c) `adicionarItem` em lote AUTOMÁTICO adota (vira MANUAL) atômico. Rodar em job separado do CI (não bloqueia PR, mas trava merge para main).
- **Resultado Esperado**
  > Cobertura `LotePagamentoRepository.ts` sobe de **70.66% → ≥ 88% lines** (bate o floor `./domain/service/` atual); comportamento real de locking passa a ter defesa numérica; regressão em SQL de transição é detectável.
- **Tactic alvo**: Sandbox
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - Integration test files SISPAG: **0 → ≥ 3**
  - Cobertura `LotePagamentoRepository.ts` (lines): **70.66% → ≥ 88%**
  - Cenários de concorrência A4 cobertos: **0 → 3** (advisory lock, optimistic lock, adopt atômico)
- **Risco de não fazer**: dois analistas mexendo no mesmo lote em produção — race condition invisível, um perde a versão sem notícia; regressão em advisory lock passa despercebida.
- **Dependências**: infra de docker no CI (compartilhável com Permutas — cross-frente).

### [testability-6] Capturar fixtures HAR de Conexos (fin064/fin015/fin052) e alimentar testes de client

- **Problema**
  > Nenhum arquivo `__fixtures__/` ou `*.fixture.json` — os 3 clients (`ConexosSispagClient`, `ConexosSispagRetornoClient`, `ConexosSispagWriteClient`) são testados com `jest.fn().mockResolvedValue({...})` sintético. Se a Conexos alterar payload (`bxaCodSeq` vira `bxaCod`, `titulosRejeitados` snake_case), o teste passa com dados fictícios.
- **Melhoria Proposta**
  > Aplicar **Recordable Test Cases**: capturar 1 HAR real por endpoint em HML (a proposta menciona que já foram capturados alguns durante a exploração fin015/fin052 — `ontology/_inbox/sispag-fin052-exploration.md`). Salvar em `src/backend/domain/client/__fixtures__/{fin064-titulos.json, fin015-lote.json, fin052-arquivo-ret.json, ...}`. Reescrever testes de client para carregar a fixture (`readFileSync`) como resposta mockada — o teste passa a validar que o parser sobrevive ao shape REAL, não ao shape que o dev inventou.
- **Resultado Esperado**
  > Fixtures capturadas: **0 → ≥ 6** (2 por client). Regressão de shape do Conexos passa a quebrar teste em vez de quebrar produção. Custa 1 nova captura por endpoint (via job `probe-*.ts` já existente).
- **Tactic alvo**: Recordable Test Cases
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) para captura + wiring (dados de HML já explorados)
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - Fixtures HAR/JSON: **0 → ≥ 6**
  - Endpoints Conexos com fixture real: **0 → ≥ 6** (fin064 titulos, fin015 lote/borderô/tools, fin052 arquivo/detalhe/erros)
- **Risco de não fazer**: Fatia 3 wire, Conexos altera schema em um patch, parser do `.RET` quebra silenciosamente na primeira execução real de baixa.
- **Dependências**: acesso HML Conexos (já existe para os `probe-*.ts`).

### [testability-7] Adicionar coverage floor por subdiretório para `routes/`, `jobs/`, `http/` (backend) e `app/sispag/` (frontend)

- **Problema**
  > `jest.config.cjs` só tem floor granular em `./domain/service/`. Rotas, jobs e http caem no bucket global `72/54/78`, que se dilui com a massa das outras frentes — dá para adicionar rota SISPAG sem teste sem tripar CI. Frontend está pior (global 20/9/14, próprio comentário admite que o valor real era "Potemkin").
- **Melhoria Proposta**
  > Aplicar **Executable Assertions (CI gate)**: no `src/backend/jest.config.cjs`, adicionar chaves `./routes/`, `./jobs/`, `./http/` com floors calibrados ao baseline pós-testability-2 (ex.: `./routes/` lines 60, `./jobs/` lines 40, `./http/` lines 70). No `src/frontend/jest.config.js`, adicionar `./app/sispag/` com lines 40 pós-testability-1. O padrão vira: qualquer novo módulo cai imediatamente na floor de sua camada.
- **Resultado Esperado**
  > Coverage floors por subdiretório: backend **1 → ≥ 4**; frontend **1 → ≥ 2**. CI trava merge em regressão SISPAG (frontend e rotas), não só em serviço.
- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) — só depois de testability-1 e testability-2 rolarem
- **Findings relacionados**: F-testability-7
- **Métricas de sucesso**:
  - Backend `coverageThreshold` chaves por diretório: **1 → ≥ 4**
  - Frontend `coverageThreshold` chaves por diretório: **1 → ≥ 2**
- **Risco de não fazer**: as melhorias de testability-1/2 são reversíveis silenciosamente na próxima feature — sem gate, cobertura regride sem alarme.
- **Dependências**: testability-1, testability-2

## 6. Notas do agente

- Escopo mantido em SISPAG (Frente II) — a suíte SISPAG isolada tem 97 testes verdes em 3.22 s com **89.02% lines** (backend serviços/repos/clients), o que coloca a testabilidade da **frente na média-alta** da indústria; a nota `6/10` reflete os buracos de camada (frontend 0%, rotas ~0%, não-determinismo de tempo/UUID), não a qualidade dos testes de serviço.
- Métrica única mais citada (por conselho Bass): **cobertura por camada da tabela 2.1** — a foto é clara: gap concentrado em **frontend + adaptadores HTTP + jobs**, com serviços/repos/clients bem defendidos.
- Cross-QA cues para o consolidator:
  - **testability-3 (ClockProvider/IdProvider) ↔ Modifiability** — clock injetável é a mesma abstração que Modifiability pede para permitir migrar cron de "hoje" para "trader window".
  - **testability-5 (integration tests) ↔ Fault-Tolerance** — testar advisory lock/otimistic lock é o mesmo bloco que Fault-Tolerance precisa para validar a máquina de estados do lote SISPAG (A4).
  - **testability-6 (fixtures) ↔ Integrability** — fixtures HAR são o contrato registrado da integração Conexos; overlap direto com "contract tests" da Integrability.
  - **testability-7 (CI gate por diretório) ↔ Deployability** — todo bump `chore(release)` cruza o CI, e sem floor por diretório o pipeline libera regressões.
