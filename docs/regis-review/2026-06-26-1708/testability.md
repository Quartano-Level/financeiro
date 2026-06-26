---
qa: Testability
qa_slug: testability
run_id: 2026-06-26-1708
agent: qa-testability
generated_at: 2026-06-26T17:18:00-03:00
scope: all
score: 6
findings_count: 11
cards_count: 9
---

# Testability — Regis-Review

> Run anterior `2026-06-26-0058` (score 5). Delta hoje: **CC-1** (frontend) extraiu 14 sub-componentes de `app/permutas/page.tsx`, adicionou **+14 testes** (`57 → 71`) e subiu a cobertura FE global de `20.82% → 28.83% lines`. **CC-2** (backend) decompôs `ConexosClient` (1956 LOC) em `ConexosBaseClient` + 4 sub-clients e levou `PermutaExecucaoRepository` de `51.42% → 100% lines` (`+16` testes, `480 → 496`). Re-score abaixo: **testability-2 RESOLVIDO**, **testability-1 rebaixado P0 → P1**, **testability-8 rebaixado P2 → P3**. Determinismo, integration tests e fixtures Conexos seguem **inalterados**.

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev mexendo na UI de Permutas (`page.tsx` 1026 LOC residual + `BorderosPanel.tsx` 711 LOC) ou em qualquer sub-client Conexos | Mudança de regra (novo gate de borderô, novo campo na baixa `fin010`, novo cálculo de % pago) precisa ser validada **antes** do deploy Render/Vercel | God-page React residual + tabela de idempotência da baixa (`permuta_alocacao_execucao`) + 5 clients Conexos | Desenvolvimento local + CI (`.github/workflows/ci.yml`) antes de PR merge para `main` | Suite (unit + componente + integração) cobre a mudança, falha em regressão de comportamento e só fica verde quando invariantes (idempotência da baixa, ordenação do painel, % pago, schema Conexos) seguem válidas | (a) BE lines ≥ 85 / branches ≥ 70 em `service+repository` (atual 89.78/68.77 ✅); (b) FE lines ≥ 60 / branches ≥ 40 em `app/permutas/` (atual 28.83/14.44 ❌); (c) tempo CI ≤ 5min (atual BE 7.6s + FE 2.3s ✅); (d) zero flakes em 30 dias (sem baseline) |

> Status pós-CC-1/CC-2: BE supera (a). FE evoluiu de catastrófico para **insuficiente** — `page.tsx` (1026) e `BorderosPanel.tsx` (711) seguem em 0/0/0/0; threshold do `jest.config.js` continua rebaseado em lines 20 / branches 9 / functions 14 (`src/frontend/jest.config.js:35-44`) apesar do real estar em 28.83/14.44/23.22 — gate está **mais frouxo que a realidade hoje**. Integração contra Postgres ou Conexos real (c+d): inexistente.

## 2. Métricas observadas

### Métrica observável #1 — Cobertura por camada (real, coletada agora — delta vs. 2026-06-26-0058)

| Camada | % Stmts | % Branch | % Funcs | % Lines | Δ Lines | Alvo Bass | Status | Fonte |
|---|---|---|---|---|---|---|---|---|
| **Backend (All files)** | 88.35 | 68.77 | 88.73 | **89.78** | +1.44 | 80 / 70 / 80 / 80 | ✅ | `npm test --coverage` (44 suites, **496** testes, 7.6s) |
| `backend/domain/service/permutas` | 94.59 | 75.46 | 96.78 | **96.14** | +0.15 | 90 / 75 / 90 / 90 | ✅ | mesmo |
| `backend/domain/service` (LogService) | 91.17 | 64.28 | 100 | **100** | = | 90 / 75 | ⚠️ branch | mesmo |
| `backend/domain/repository/permutas` (agregado) | 93.42 | 58.24 | 87.85 | **96.91** | **+10.58** | 85 / 70 / 85 | ⚠️ branch | mesmo |
| └ `PermutaExecucaoRepository.ts` (idempotência da baixa) | 96.20 | 65.38 | 89.28 | **100** | **+48.58** | 85 / 70 / 85 | ✅ (era ❌) | mesmo — **F-testability-2 RESOLVIDO via CC-2** |
| └ `PermutaRelationalRepository.ts` | 91.66 | 48.21 | 80 | 97.24 | +5.68 | 85 / 60 | ⚠️ branch | mesmo |
| └ `PermutaSnapshotRepository.ts` | 88.88 | 64.58 | 88.23 | 90.16 | ~ | 85 / 60 | ✅ | mesmo |
| `backend/domain/client` (agregado novo) | 87.40 | 70.05 | 85.29 | **88.81** | — | 85 / 70 | ✅ | mesmo |
| └ `ConexosBaseClient.ts` (auth/sessão) | 93.47 | 82.50 | 88.23 | **98.64** | NOVO | 90 | ✅ | CC-2 |
| └ `ConexosBaixaClient.ts` (write `fin010`) | 81.57 | **40.90** | 95.65 | 82.72 | NOVO | 85 / 70 | ⚠️ branch | CC-2 — alvo card 8b |
| └ `ConexosCadastroClient.ts` | 78.84 | 90.00 | 71.42 | **79.16** | NOVO | 85 | ⚠️ | CC-2 |
| └ `ConexosFinanceiroClient.ts` | 90.08 | 70.34 | 95.65 | **92.10** | NOVO | 85 | ✅ | CC-2 |
| └ `ConexosTitulosClient.ts` | 98.14 | 90.56 | 100 | **100** | NOVO | 85 | ✅ | CC-2 |
| └ `legacyConexosAdapter.ts` | 56.52 | 16.66 | 30.00 | **54.54** | — | 70 | ❌ | mesmo — F-testability-3 |
| `backend/domain/client/permutas` (Zod schemas) | 100 | 100 | 100 | 100 | = | 90 | ✅ | mesmo |
| `backend/domain/client/database` | 89.77 | 56.25 | 80.95 | 93.67 | = | 80 / 60 | ✅ | mesmo |
| `backend/routes/permutas.ts` | 70.97 | 43.84 | 67.85 | 70.97 | = | 75 / 60 | ⚠️ | mesmo |
| `backend/services/conexos.ts` (legado não-DDD) | **29.48** | **18.86** | 31.81 | **31.38** | = | 70 / 50 | ❌ | mesmo — F-testability-3 |
| `backend/domain/libs/handler` (ApiGateway) | 100 | 84.44 | 100 | 100 | = | 90 | ✅ | mesmo |
| `backend/http` (auth/middleware) | 97.18 | 90.52 | 100 | 96.89 | = | 90 | ✅ | mesmo |
| **Frontend (All files)** | **28.70** | **14.44** | **23.22** | **28.83** | **+8.01** | 60 / 40 / 50 | ❌ (era ❌) | `npm test --coverage` (12 suites, **71** testes, 2.3s) |
| `app/permutas/page.tsx` (god-page residual) | **0** | **0** | **0** | **0** | = | 50 mínimo | ❌ | F-testability-1 — LOC `2971 → 1026` mas teste **não foi escrito** |
| `app/permutas/BorderosPanel.tsx` | **0** | **0** | **0** | **0** | = | 50 mínimo | ❌ | F-testability-1 — LOC `683 → 711` (cresceu) |
| `app/permutas/components/` (agregado novo após CC-1) | **28.97** | 9.51 | 20.35 | **27.36** | NOVO | 50 | ⚠️ parcial | CC-1 |
| └ `AbaHistorico.tsx` | 100 | 62.5 | 100 | **100** | NOVO | 60 | ✅ | CC-1 |
| └ `PermutaPendenteTable.tsx` | 88.23 | 60 | 50 | **88.23** | NOVO | 60 | ✅ | CC-1 |
| └ `format.ts` (helpers puros) | 81.66 | 60 | 83.33 | **80.43** | NOVO | 80 | ✅ | CC-1 |
| └ `tabela-filtro.tsx` | 71.42 | 66.66 | 38.46 | **77.41** | NOVO | 60 | ✅ | CC-1 |
| └ `ui.tsx` (Moeda/Badge wrappers) | 42.30 | 8.16 | 25.00 | **40.00** | NOVO | 60 | ⚠️ | CC-1 |
| └ `AbaAutomaticas.tsx`, `AlocarDialog.tsx`, `IngestaoDialog.tsx`, `ReconciliarDialog.tsx`, `ConfirmarLoteDialog.tsx`, `ConfirmarProcessamentoDialog.tsx`, `VisaoGeralTable.tsx` | **0** | 0–100 | **0** | **0** | NOVO | 50 | ❌ | dialogs/abas extraídos mas **sem teste** — F-testability-1b |
| └ `useExportRelatorios.ts`, `useIngestao.ts`, `usePermutasData.ts` (hooks custom) | **0** | 0 | **0** | **0** | NOVO | 60 | ❌ | hooks extraídos sem teste — F-testability-1b |
| `app/permutas/clientes-filtro/page.tsx` | 0 | 0 | 0 | 0 | = | 50 | ❌ | F-testability-1 |
| `app/login/page.tsx` | 0 | 0 | 0 | 0 | = | 50 | ❌ | F-testability-1 |
| `lib/api.ts` (boundary HTTP) | 42.00 | 20.51 | 34.28 | **43.41** | = | 70 / 50 | ❌ | F-testability-7 |
| `lib/utils.ts` (lógica pura) | 95.65 | 93.75 | 87.50 | 94.87 | +2.57 | 90 | ✅ | mesmo |
| `lib/auth` (AuthProvider/token/env) | 28.57 | 37.14 | 36.36 | **25.37** | = | 70 | ❌ | F-testability-7 — `AuthProvider.tsx` ainda 0% |
| `components/ui` (primitivos Radix) | 70.46 | 57.83 | 59.42 | **72.90** | +22.71 | 60 | ✅ (era ⚠️) | melhora via `ui-primitives.test.tsx` |
| `components/auth` (AuthGuard+RouteGate+UserMenu) | 67.56 | 75 | 66.66 | **67.56** | NOVO | 60 | ✅ | CC-1 |

### Métrica observável #2 — Tactic e processo (delta vs. 2026-06-26-0058)

| Métrica | Valor atual | Δ | Alvo | Status | Fonte |
|---|---|---|---|---|---|
| BE arquivos de teste / fonte | 44 / 222 (**0.20**) | (denominador inclui Zod schemas e interfaces de tipo) | ≥ 0.5 do código com lógica | ⚠️ | `find src/backend -name '*.test.ts' \| wc -l` vs `*.ts` |
| BE testes (cases) | **496** | +16 | crescente | ✅ | `jest` output |
| FE arquivos de teste / fonte | 12 / 116 (**0.10**) | +1 / +9 | ≥ 0.5 | ❌ | `find src/frontend -name '*.test.ts*'` |
| FE testes (cases) | **71** | **+14** | crescente | ✅ | `jest` output |
| Testes que usam injeção por construtor (vs `container.resolve`) | **136 / 137** (99.3%) | +12 | ≥ 80% | ✅ | `grep "new .*Service(\|new .*Repository(\|new .*Client(" --include=*.test.ts` |
| `jest.useFakeTimers` no repo inteiro | **0 ocorrências** | = | ≥ 1 por feature time-sensitive | ❌ | `grep -rn useFakeTimers src/` — F-testability-4 |
| `new Date()/Date.now()` em código-fonte (não teste) | **22 sites** | = | 0 (via `ClockProvider`) | ❌ | `grep "new Date()\|Date.now()" --include=*.ts \| grep -v .test.ts` — F-testability-4 |
| `Math.random()` em código-fonte | **1 site** (`RetryExecutor.ts:53` jitter) | = | 0 ou injetado | ⚠️ | `grep Math.random` — F-testability-4 |
| Tests fazendo HTTP real (axios) | 0 reais (`BcbClient.test.ts:6` mocka) | = | 0 reais | ✅ | `grep axios. --include=*.test.ts` |
| Integration tests (`describe('integration:`) | **0** | = | ≥ 1 por repository com SQL complexo | ❌ | `grep "describe('integration"` — F-testability-5 |
| `docker-compose.test.yml` / Postgres de teste | **ausente** | = | presente | ❌ | `find . -name docker-compose*.yml` — F-testability-5 |
| Fixtures gravadas (Recordable Test Cases) Conexos | **0 arquivos** | = | ≥ 1 por endpoint usado | ❌ | `find */__fixtures__` — F-testability-6 |
| Tests assertando em `LogService` calls | 12 arquivos / 496 testes (~2%) | +2 | ≥ 30% em paths de erro | ⚠️ | F-testability-8 |
| `beforeAll/afterAll` (estado compartilhado) | 3 ocorrências em 2 arquivos | = | ≤ 5% dos arquivos | ✅ | mesmo |
| Frontend component tests (`render()`) | 5 arquivos (UI + auth + 2 novos componentes Permutas) | +2 | ≥ 1 por feature page | ⚠️ | mesmo |
| Threshold cobertura BE no CI | global lines 72 / branches 54 / functions 78; `domain/service/` lines 88 / branches 60 | = | global ≥ 80 / 70 / 80 + `domain/repository/` ≥ 85 / 70 | ⚠️ | `src/backend/jest.config.cjs:34-44` — **ainda sem chave para `domain/repository/` mesmo após CC-2 ter levado o dir a 96.91% lines** — F-testability-2b |
| Threshold cobertura FE no CI | global lines **20** / branches **9** / functions **14** | = | lines **≥ 28 imediato** (subir junto com cobertura real) | ❌ | `src/frontend/jest.config.js:35-44` — **threshold ficou para trás do real (28.83/14.44/23.22)**, gate inerte — F-testability-7 |
| CI roda `npm test --coverage` (BE+FE) bloqueando merge | sim (`.github/workflows/ci.yml:24,46`) | = | sim | ✅ | mesmo |
| Tempo total CI tests | BE 7.6s / FE 2.3s | ≈ | ≤ 30s | ✅ | `npm test` |
| Maior teste BE (LOC) | `ConexosSubClients.test.ts` **1657 LOC** | -1.7% (1628) | < 500 LOC por arquivo | ❌ | F-testability-9 — **CC-2 decompôs o SUT mas concentrou todos os 5 sub-clients num único arquivo de teste** |
| Maior `page.tsx` residual FE | `app/permutas/page.tsx` **1026 LOC** | **-65.5%** (2971) | < 400 LOC e ≥ 50% cov | ⚠️ progresso parcial | `wc -l` — F-testability-1 |
| `BorderosPanel.tsx` LOC | **711 LOC** (era 683) | +4% | extrair em sub-componentes testáveis | ❌ regressão minor | `wc -l` — F-testability-1 |
| Property-based testing (`fast-check`) | **0 usos / 0 deps diretas** | = | ≥ 1 por algoritmo numérico | ⚠️ | F-testability-10 |
| Agent `TDDGuide`/`TestabilityCoach` | **ausente** (só `qa-testability` para review pós-fato) | = | presente | ⚠️ | F-testability-11 |
| E2E (Playwright/Cypress) | **0** | = | ≥ 1 happy path baixa | ⚠️ | N/A neste run |

> ⚠️ **Não medível localmente**: flake rate em 30 dias, MTTR de bug detectado em prod (sem histórico CI agregado nem E2E), cobertura de runtime no fluxo Conexos real (não há sandbox ERP cabeado em CI). Recomendação: instrumentar `CI: re-run on flake` e gravar respostas reais Conexos em `__fixtures__/` na próxima sessão QaCoach.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | tsyringe + injeção por construtor: 136/137 testes (99.3%) instanciam o SUT com mocks via `new` em vez de `container.resolve` (CLAUDE.md). CC-2 reforçou: cada sub-client Conexos (`ConexosBaixaClient`, `ConexosTitulosClient`, etc.) recebe `LegacyConexosShape` no construtor; teste isola o sub-client | ✅ presente | `ConexosSubClients.test.ts:1-1657`; `EleicaoPermutasService.test.ts:35-41`; `PermutaExecucaoRepository.test.ts` (agora cobrindo todas as 21 mensagens públicas) |
| **Recordable Test Cases** | Mantém **zero** fixtures gravadas. Todos os 5 sub-clients Conexos testam com `mockResolvedValue({...})` inline. Mudança de schema no ERP segue sendo detectada apenas em produção | ❌ ausente | `find src/backend -path '*/__fixtures__/*'` → vazio; `ConexosSubClients.test.ts` define dados literal em cada `it()` — F-testability-6 |
| **Sandbox** | Sem `docker-compose.test.yml`; zero `describe('integration:')`. Mesmo após CC-2 dobrar a cobertura de `PermutaExecucaoRepository` a 100% lines, **nenhuma asserção roda contra Postgres real** — repos seguem mockando `db.query` literal | ❌ ausente | `find . -name 'docker-compose*.yml'` → vazio; `grep "describe('integration"` → vazio — F-testability-5 |
| **Executable Assertions** | Zod 100% cov em `http/schemas.ts` e em `domain/client/permutas/conexosPermutasSchemas.ts` (boundary HTTP e leitura Conexos). `ConexosBaixaClient.ts` (write `fin010`) em **40.9% branches** — caminhos de erro do POST de baixa não têm assertion executável | ✅ parcial | `src/backend/http/schemas.test.ts`; cobertura `ConexosBaixaClient.ts:107-131` (branches sem teste — F-testability-2b) |
| **Abstract Data Sources** | `PostgreeDatabaseClient` (`db` injetado em todo repository), `ConexosBaseClient` (sessão SID encapsulada, injetado em todos os 4 sub-clients). Testes nunca tocam DB ou rede real | ✅ presente | `ConexosBaseClient.ts` 98.64% lines; todos os sub-clients recebem `ConexosBaseClient` via construtor |
| **Limit Structural Complexity** | **Backend melhorou:** `ConexosClient` (1956 LOC, god-client) decomposto em `ConexosBaseClient` + 4 sub-clients (~250-650 LOC cada) via CC-2. **Frontend melhorou parcialmente:** `app/permutas/page.tsx` `2971 → 1026 LOC` via CC-1; 12 sub-componentes + 3 hooks custom extraídos para `app/permutas/components/`. **Resíduo:** `page.tsx` (1026) e `BorderosPanel.tsx` (711) seguem em 0% cov; `ConexosSubClients.test.ts` (1657 LOC) concentrou os 5 sub-clients num único teste — SUT foi quebrado, **teste não foi** | ⚠️ parcial (melhora) | `wc -l app/permutas/page.tsx` → 1026; `ls app/permutas/components/` → 18 arquivos; `wc -l ConexosSubClients.test.ts` → 1657 |
| **Limit Non-Determinism** | **Inalterado.** 22 sites de `new Date()/Date.now()` em código-fonte BE (`IngestaoPermutasService.ts:73,89,127`, `EleicaoPermutasService.ts:336,343,386`, `PainelService.ts:60`, `Logger.ts:3,7,11`, `LogService.ts:23`); 1 `Math.random()` em `RetryExecutor.ts:53`; **zero** `jest.useFakeTimers()` no repo inteiro. `AgingService.compute(dataBase?, now: Date = new Date())` segue como exemplo positivo isolado | ❌ ausente (BE) / ⚠️ parcial (FE — `utils.test.ts` força `process.env.TZ`) | `grep -rn "new Date()" src/backend --include=*.ts \| grep -v test \| wc -l` → 22; `grep -rn useFakeTimers src/` → 0 — F-testability-4 |

## 4. Findings

### F-testability-1: God-component da feature Permutas ainda em 0% após CC-1 (residual `page.tsx` 1026 + `BorderosPanel.tsx` 711)

- **Severidade**: P1 (era P0 — rebaixado por progresso parcial real)
- **Tactic violada**: Limit Structural Complexity + Specialized Interfaces
- **Localização**: `src/frontend/app/permutas/page.tsx:1-1026`, `src/frontend/app/permutas/BorderosPanel.tsx:1-711`, `src/frontend/app/permutas/components/{AbaAutomaticas,AlocarDialog,IngestaoDialog,ReconciliarDialog,VisaoGeralTable,ConfirmarLoteDialog,ConfirmarProcessamentoDialog,useExportRelatorios,useIngestao,usePermutasData}.{tsx,ts}`
- **Evidência (objetiva)**:
  ```
  app/permutas
   page.tsx                              |   0   |   0   |   0   |   0   | 3-1020
   BorderosPanel.tsx                     |   0   |   0   |   0   |   0   | 3-689
  app/permutas/components               |  28.97 |  9.51 | 20.35 | 27.36 |
   AbaAutomaticas.tsx                    |   0   |   0   |   0   |   0   | 3-217
   AlocarDialog.tsx                      |   0   |   0   |   0   |   0   | 3-269
   ConfirmarProcessamentoDialog.tsx      |   0   |   0   |   0   |   0   | 4-128
   IngestaoDialog.tsx                    |   0   |   0   |   0   |   0   | 3-124
   ReconciliarDialog.tsx                 |   0   |   0   |   0   |   0   | 3-155
   VisaoGeralTable.tsx                   |   0   |   0   |   0   |   0   | 3-477
   useExportRelatorios.ts                |   0   |   0   |   0   |   0   | 3-29
   useIngestao.ts                        |   0   |   0   |   0   |   0   | 3-56
   usePermutasData.ts                    |   0   |   0   |   0   |   0   | 3-55
  ```
  `useState/useEffect` em `page.tsx` agora = **24** (era 36); em `BorderosPanel.tsx` = **15** (novo dado). Helpers puros extraídos (`format.ts` 80%, `AbaHistorico` 100%, `PermutaPendenteTable` 88%) — sinal de que o padrão de extração funciona, **mas só foi exercitado em 4 dos ~14 componentes/hooks novos**.
- **Impacto técnico**: dialogs críticos (`AlocarDialog` para alocação N:M cross-process, `IngestaoDialog` para upload manual de PROFORMA, `ReconciliarDialog`, `ConfirmarProcessamentoDialog`) e os 3 hooks que orquestram dados (`useExportRelatorios`, `useIngestao`, `usePermutasData`) seguem sem nenhum teste. Qualquer alteração na máquina de borderô ou no fluxo de baixa continua entrando cega.
- **Impacto de negócio**: feature crítica e única em produção (Permutas/Borderô); CI verde por threshold rebaseado dá falsa-confiança; bug `borderô-finalizar` aberto (Stage B requer captura HAR em prod, ver MEMORY) é sintoma direto desse gap.
- **Métrica de baseline**: `page.tsx` `2971 → 1026` (-65.5% LOC, ✅); `app/permutas/` lines `0% → 27.36%` (no agregado do `components/`, ainda **0% em page.tsx/BorderosPanel.tsx e em 9 dos 18 novos arquivos**). Threshold CI ainda em 20% lines apesar do real estar em 28.83%.

### F-testability-2: PermutaExecucaoRepository RESOLVIDO via CC-2 (de 49.36% → 100% lines)

- **Severidade**: ✅ **RESOLVIDO** (era P0)
- **Tactic restaurada**: Executable Assertions + Specialized Interfaces
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts`
- **Evidência (objetiva)**:
  ```
   PermutaExecucaoRepository.ts | 96.2 | 65.38 | 89.28 | 100 | 152,252-327,340-359,370,412,433-440
  ```
  Cobertura `49.36% → 96.2% stmts`, `30.76% → 65.38% branches`, `28.57% → 89.28% funcs`, `51.42% → 100% lines`. As 21 mensagens públicas (`findByIdempotencyKey`, `deleteByBorCod`, `replaceBorderoCache`, `markSettled`, `markError`, ...) agora têm pelo menos uma assertion.
- **Resíduo**: branches em 65.38% (alvo 70) — caminhos de erro do `UPSERT` ainda parciais. Promovido a follow-up **F-testability-2b** abaixo (P2) em vez de manter como P0 aberto.
- **Métrica de baseline**: 100% lines (alvo ≥ 85 ✅).

### F-testability-2b: `domain/repository/` ainda sem chave de threshold no `jest.config.cjs` apesar de CC-2 estabelecer baseline alto

- **Severidade**: P2
- **Tactic violada**: Executable Assertions (gate de qualidade)
- **Localização**: `src/backend/jest.config.cjs:34-44`
- **Evidência (objetiva)**:
  ```js
  coverageThreshold: {
      global: { lines: 72, branches: 54, functions: 78 },
      './domain/service/': { lines: 88, branches: 60 },
  },
  ```
  Não há chave para `./domain/repository/` apesar do dir agora estar em 96.91% lines (`PermutaExecucaoRepository` em 100%). Sem gate específico, regressão para 70% lines não falha o CI (passa pelo bucket `global` em 72).
- **Impacto técnico**: ganho da CC-2 não é defendido pelo CI; PR pode reverter cobertura do repo crítico sem alarme.
- **Impacto de negócio**: dupla-baixa em `fin010` continua sendo o pior caso (auditoria contábil reabre exercício); CI deve travar qualquer queda nessa camada.
- **Métrica de baseline**: threshold `domain/repository/` = **ausente**. Alvo: `lines ≥ 90, branches ≥ 60, functions ≥ 85`.

### F-testability-3: Layer `backend/services/conexos.ts` legado em 31% lines (inalterado)

- **Severidade**: P1
- **Tactic violada**: Specialized Interfaces (legado não migrado)
- **Localização**: `src/backend/services/conexos.ts` (linhas não cobertas: 86-89, 94-226, 247-307, 325) + `src/backend/domain/client/legacyConexosAdapter.ts` (54.54% lines, 16.66% branches)
- **Evidência (objetiva)**:
  ```
   backend/services |   29.48 |    18.86 |   31.81 |   31.38
   legacyConexosAdapter.ts | 56.52 | 16.66 | 30 | 54.54 | 69-76,86,99,104,108-115
  ```
- **Impacto técnico**: o adapter legado SID + paginação fica abaixo dos novos sub-clients (`ConexosBaixaClient` etc.); regressão de autenticação não é detectada localmente.
- **Impacto de negócio**: erro de auth Conexos paralisa toda a Permutas (ingestão, alocação, baixa).
- **Métrica de baseline**: `conexos.ts` 31.38% lines / 18.86% branches; `legacyConexosAdapter.ts` 54.54% / 16.66%. Alvo pragmático: ≥ 70% lines (legado em migração).

### F-testability-4: Não-determinismo abundante — 22 `new Date()` em código-fonte, zero `useFakeTimers` (inalterado)

- **Severidade**: P1
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `IngestaoPermutasService.ts:73,89,127,159,189`, `EleicaoPermutasService.ts:336,343,386`, `PainelService.ts:60`, `PermutaProcessamentoRepository.ts:35`, `routes/permutas.ts:160,578`, `Logger.ts:3,7,11`, `LogService.ts:23`, `RetryExecutor.ts:53` (`Math.random()` jitter)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "new Date()\|Date.now()" src/backend --include='*.ts' | grep -v .test.ts | wc -l
  22
  $ grep -rn "useFakeTimers" src/ --include='*.ts' --include='*.tsx'
  (vazio)
  ```
  `AgingService.ts:17` (`compute(dataBase?, now: Date = new Date())`) segue como exemplo positivo isolado.
- **Impacto técnico**: testes usam matchers frouxos (`expect.any(Date)`); idempotência por janela de tempo (coalescer ingestão) não-testável; jitter de retry não-determinístico em CI.
- **Impacto de negócio**: bug de timezone em relatórios; impossível garantir comportamento exato de coalescing.
- **Métrica de baseline**: 22 sites + 1 random. Alvo: 0 (via `ClockProvider`/`RandomProvider`).

### F-testability-5: Zero integration tests; nenhum docker-compose de teste (inalterado)

- **Severidade**: P1
- **Tactic violada**: Sandbox
- **Localização**: convenção CLAUDE.md prevê `describe('integration:')` — não há nenhuma instância em `src/backend`.
- **Evidência (objetiva)**:
  ```
  $ grep -rn "describe(.integration:" src/backend --include='*.test.ts'
  (vazio)
  $ find . -name 'docker-compose*.yml' -not -path '*/node_modules/*'
  (vazio)
  ```
  Mesmo após CC-2 levar `PermutaExecucaoRepository` a 100% lines, o SQL real (com `RETURNING`, `ON CONFLICT`, `CASCADE`) **nunca é executado contra Postgres**. `PermutaRelationalRepository` (629 LOC, **48.21% branches** — CTE/CASE/JOIN) idem.
- **Impacto técnico**: SQL inválido (typo de coluna, JOIN ambíguo, `$N` faltando) só estoura em prod no Render.
- **Impacto de negócio**: PR pode mergear "verde" e quebrar painel em prod.
- **Métrica de baseline**: 0 integration tests / ~10 repositórios. Alvo mínimo: ≥ 5 cases em `PermutaRelationalRepository` + ≥ 5 em `PermutaExecucaoRepository` (proteger o ganho da CC-2 com SQL real).

### F-testability-6: Sem fixtures gravadas de Conexos — schema do ERP é assumido (inalterado mesmo com CC-2)

- **Severidade**: P1
- **Tactic violada**: Recordable Test Cases
- **Localização**: `ConexosBaseClient.ts`, `ConexosBaixaClient.ts`, `ConexosCadastroClient.ts`, `ConexosFinanceiroClient.ts`, `ConexosTitulosClient.ts`; testes em `ConexosSubClients.test.ts:1-1657`
- **Evidência (objetiva)**:
  ```
  $ find src/backend -path '*/__fixtures__/*' -o -name '*.fixture.*'
  (vazio)
  $ grep -c "mockResolvedValue" src/backend/domain/client/ConexosSubClients.test.ts
  > 100
  ```
  CC-2 decompôs o cliente, mas cada teste continua inventando o shape da resposta. Nenhum JSON gravado de chamada real.
- **Impacto técnico**: mudança de nome de campo Conexos (`docCod → docCodigo`, hipotético) segue invisível — mocks também usam o nome antigo.
- **Impacto de negócio**: tempo de detecção de breaking change Conexos = tempo de chegar a prod. Risco N°1 para uma ferramenta de ERP integration.
- **Métrica de baseline**: 0 fixtures / ~15 endpoints Conexos. Alvo: ≥ 1 fixture JSON real por endpoint usado.

### F-testability-7: Threshold do CI frontend ficou para trás do real (gate **mais frouxo que a realidade hoje**)

- **Severidade**: P1
- **Tactic violada**: Executable Assertions
- **Localização**: `src/frontend/jest.config.js:35-44`
- **Evidência (objetiva)**:
  ```js
  coverageThreshold: {
      global: { lines: 20, branches: 9, functions: 14 },
      './lib/auth/': { lines: 24 },
  },
  // Comentário admite que foi rebaseado por causa do god-component em v0.8.1.
  ```
  Cobertura real hoje (pós-CC-1): **lines 28.83 / branches 14.44 / functions 23.22**. Threshold deveria ter sido bumpado para `lines 28 / branches 14 / functions 23` no MESMO PR da CC-1 — não foi. Hoje **uma regressão para 21% lines passaria pelo gate**. `lib/api.ts` segue em 43.41% lines (boundary HTTP — todos os fetches do app); `AuthProvider.tsx` em 0%.
- **Impacto técnico**: gate de cobertura é ruído — qualquer remoção de até 8 pontos percentuais de lines passa. Ganho da CC-1 não é defendido.
- **Impacto de negócio**: time confia em "verde" do CI como sinal de qualidade. Sinal está falso.
- **Métrica de baseline**: threshold lines 20 vs. real 28.83 (8 pp de folga gratuita). Alvo imediato: bumpar para lines 28 / branches 14 / functions 23; rumo a 60/40/50 em 90 dias.

### F-testability-8: Paths de erro raramente assertam log estruturado (inalterado em proporção)

- **Severidade**: P2
- **Tactic violada**: Executable Assertions
- **Localização**: 12/44 arquivos de teste BE referenciam `LogService` — quase todos para mocá-lo e ignorar
- **Evidência (objetiva)**:
  ```
  $ grep -rln "logService\.\|LogService" src/backend --include='*.test.ts' | wc -l
  12
  ```
  `EleicaoPermutasService.test.ts:23-32` mantém o único `buildLogService()` que captura calls num array.
- **Impacto técnico**: erro em prod chega ao log sem `LOG_TYPE`, sem `requestId`, sem contexto (`borCod`, `priCod`).
- **Impacto de negócio**: MTTR de investigação cresce.
- **Métrica de baseline**: < 5% dos testes verificam shape do log. Alvo: 100% de catch/throw com assertion.

### F-testability-9: Teste dos sub-clients Conexos concentrado em 1657 LOC após CC-2 (SUT quebrado, teste não)

- **Severidade**: P3 (era P2 — rebaixado porque SUT foi decomposto)
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/backend/domain/client/ConexosSubClients.test.ts:1-1657`
- **Evidência (objetiva)**:
  ```
  $ find src/backend -name '*.test.ts' -not -path '*/node_modules/*' -exec wc -l {} \; | sort -rn | head -3
  1657 src/backend/domain/client/ConexosSubClients.test.ts
   944 src/backend/domain/service/permutas/EleicaoPermutasService.test.ts
   921 src/backend/routes/permutas.test.ts
  ```
  Os 5 sub-clients (`ConexosBaseClient`, `ConexosBaixaClient`, `ConexosCadastroClient`, `ConexosFinanceiroClient`, `ConexosTitulosClient`) foram criados como arquivos `~250-650 LOC cada` — mas os testes ficaram num único arquivo de 1657 LOC. O ganho de Limit Structural Complexity foi pela metade.
- **Impacto técnico**: navegar o teste para entender a especificação de um sub-client específico exige scroll por 1.6k linhas.
- **Impacto de negócio**: onboarding ainda alto; refactor de um único sub-client carrega o risco percebido de mexer no arquivo grande.
- **Métrica de baseline**: 1 teste de 1657 LOC. Alvo: 5 arquivos `Conexos<Sub>Client.test.ts` ≤ 500 LOC cada.

### F-testability-10: `fast-check` não é dep direta — property-based testing zerado (inalterado)

- **Severidade**: P3
- **Tactic violada**: Limit Non-Determinism (PBT é exploração sistemática)
- **Localização**: `src/backend/package.json`, `src/frontend/package.json` (sem `fast-check`)
- **Evidência (objetiva)**: `grep '"fast-check"' src/backend/package.json src/frontend/package.json` → vazio.
- **Impacto técnico**: `progressoPagamento` (cambio), `ordenarBorderosPainel`, `bucketEtapaPermuta`, `AlocacaoPermutasService.alocar` (N:M cross-process) testados com 3-5 example-based cases.
- **Impacto de negócio**: bugs sutis de arredondamento em valor financeiro — o que financeiro não tolera.
- **Métrica de baseline**: 0 usos. Alvo: ≥ 3 properties em `lib/utils.ts` + ≥ 1 em `AlocacaoPermutasService`.

### F-testability-11: Sem agent `TDDGuide`/`TestabilityCoach` no pipeline (inalterado)

- **Severidade**: P3
- **Tactic violada**: Specialized Interfaces (governança)
- **Localização**: `.claude/agents/` (só `qa-testability.md` para review pós-fato)
- **Evidência (objetiva)**: `ls .claude/agents/ | grep -E "tdd|test|coach"` → só `qa-testability`.
- **Impacto técnico**: PatternGuardian valida DDD/tsyringe/SQL mas não testability. Caso concreto desta run: a CC-1 extraiu 18 arquivos novos em `app/permutas/components/` mas só escreveu testes para 4 deles — nenhum agent puxou o freio.
- **Impacto de negócio**: dívida cresce silenciosamente PR a PR.
- **Métrica de baseline**: 0 agents de testability. Alvo: 1 agent pré-`green` checklist (test-first + injeção construtor + log assertion + clock/random injetável + `coverage drift ≤ 0`).

## 5. Cards Kanban

### [testability-1] Cobrir os dialogs e hooks extraídos pela CC-1 (`AlocarDialog`, `IngestaoDialog`, `ReconciliarDialog`, `usePermutasData`, `useIngestao`, `useExportRelatorios`) e atacar `page.tsx`/`BorderosPanel.tsx` residuais

- **Problema**
  > CC-1 extraiu 18 arquivos em `app/permutas/components/` mas só 4 receberam teste (`AbaHistorico` 100%, `PermutaPendenteTable` 88%, `format.ts` 80%, `tabela-filtro.tsx` 77%). Dialogs críticos (`AlocarDialog` para alocação N:M cross-process, `IngestaoDialog` para upload PROFORMA, `ReconciliarDialog`, `ConfirmarLoteDialog`, `ConfirmarProcessamentoDialog`, `VisaoGeralTable`, `AbaAutomaticas`) e os 3 hooks (`useExportRelatorios`, `useIngestao`, `usePermutasData`) continuam em 0%. `page.tsx` (1026 LOC) e `BorderosPanel.tsx` (711 LOC) também seguem em 0%. Threshold do CI continua em 20 lines / 9 branches / 14 functions (`jest.config.js:35-44`) — gate hoje **mais frouxo que o real (28.83/14.44/23.22)**.

- **Melhoria Proposta**
  > Tactic Limit Structural Complexity + Specialized Interfaces. (1) escrever um `<componente>.test.tsx` para cada dialog/aba/hook em `app/permutas/components/` cobrindo: renderização vazia, renderização com dados, click → callback chamado com payload certo, erro toast — usar Testing Library + `userEvent`. (2) Iniciar quebra de `BorderosPanel.tsx` (extrair `BorderoRow`, `BorderoActionsModal`, hooks `useBorderoActions`). (3) Bumpar `jest.config.js` para `lines 28 / branches 14 / functions 23` IMEDIATAMENTE para travar o ganho da CC-1; depois progressivamente 40/20/30 (em 30d), 55/30/45 (em 60d), 60/40/50 (em 90d).

- **Resultado Esperado**
  > Cobertura `app/permutas/components/` `27.36% → ≥ 60% lines`; `app/permutas/page.tsx` `0% → ≥ 30% lines` (cobertura via hooks extraídos); `BorderosPanel.tsx` `0% → ≥ 50% lines`. Testes de componente novos: 4 → ≥ 14. Threshold FE: `lines 20 → 60`, `branches 9 → 40`, `functions 14 → 50` (em 90d, com bump imediato para 28/14/23).

- **Tactic alvo**: Limit Structural Complexity + Specialized Interfaces + Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: L (1–2sem)
- **Findings relacionados**: F-testability-1, F-testability-7
- **Métricas de sucesso**:
  - Componentes/hooks novos em `app/permutas/components/` com teste: **4 → 14**
  - Cobertura lines `app/permutas/components/`: **27.36% → ≥ 60%**
  - Cobertura lines `app/permutas/BorderosPanel.tsx`: **0% → ≥ 50%**
  - Threshold FE `jest.config.js` lines: **20 → 28 (imediato) → 60 (90d)**
- **Risco de não fazer**: regressão silenciosa em alocação N:M / ingestão manual / reconciliação; bug chega ao analista da Columbia antes do dev (vide `borderô-finalizar` Stage B aberto, MEMORY).
- **Dependências**: nenhuma — CC-1 já entregou a quebra estrutural; falta cobertura.

### [testability-2] Adicionar threshold `./domain/repository/` no `jest.config.cjs` para defender o ganho da CC-2

- **Problema**
  > CC-2 levou `PermutaExecucaoRepository` de 51.42% → 100% lines e o agregado `domain/repository/permutas` para 96.91% lines. Mas o `jest.config.cjs` **não tem chave** para esse diretório — o ganho está protegido apenas pelo bucket `global` (lines 72). Uma regressão para 75% lines no repo crítico passaria silenciosamente.

- **Melhoria Proposta**
  > Tactic Executable Assertions. Adicionar em `src/backend/jest.config.cjs:34-44`:
  > ```js
  > './domain/repository/': { lines: 90, branches: 60, functions: 85 },
  > ```
  > Comentar a justificativa (`CC-2 levou PermutaExecucaoRepository a 100% — gate defende contra regressão de UPSERT/RETURNING/CASCADE`).

- **Resultado Esperado**
  > Threshold `domain/repository/` definido. CI passa a falhar se cobertura cair abaixo de 90 lines / 60 branches / 85 functions na camada.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-2b
- **Métricas de sucesso**:
  - Chave `./domain/repository/` no `jest.config.cjs`: **ausente → presente**
  - Branches `PermutaExecucaoRepository`: **65.38% → ≥ 70%** (adicionar 3-4 testes de path de erro do UPSERT para fechar o branch coverage também)
- **Risco de não fazer**: dupla-baixa em `fin010` reintroduzida sem alarme; ganho da CC-2 evapora no próximo refactor.
- **Dependências**: nenhuma.

### [testability-3] Introduzir integration tests contra Postgres real (docker-compose) para defender o SQL da CC-2

- **Problema**
  > Zero `describe('integration:')` em todo o backend. Nenhum `docker-compose.test.yml`. Mesmo após CC-2 levar `PermutaExecucaoRepository` a 100% lines, **nenhum byte de SQL roda contra Postgres** — repos seguem mockando `db.query` literal. `PermutaRelationalRepository.ts` (629 LOC, 48.21% branches: CTE/JOIN/CASE), `PermutaExecucaoRepository.ts` (UPSERT/RETURNING/CASCADE) e `PermutaSnapshotRepository.ts` (64.58% branches) podem ter SQL inválido que só estoura no Render.

- **Melhoria Proposta**
  > Tactic Sandbox. Criar `src/backend/docker-compose.test.yml` (Postgres 16 + script de schema). Adicionar `npm run test:integration` que sobe container, roda só `*.integration.test.ts` (já ignorado por `jest.config.cjs:7`) e tira no fim. Escrever ≥ 5 integration tests por repo complexo (foco: query principal, edge case de UPSERT, CASCADE, `ORDER BY NULLS LAST`, JOIN ambíguo).

- **Resultado Esperado**
  > Integration tests: 0 → ≥ 15. `docker-compose.test.yml` presente e documentado. Job separado no CI (não bloqueia PR inicialmente; bloqueia após 30 dias de estabilidade).

- **Tactic alvo**: Sandbox
- **Severidade**: P1
- **Esforço estimado**: L (1–2sem)
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - Integration test files: **0 → ≥ 3**
  - Integration test cases: **0 → ≥ 15**
  - `docker-compose.test.yml`: **não → sim**
- **Risco de não fazer**: SQL quebrado merge-ado verde; bug aparece no analista.
- **Dependências**: nenhuma.

### [testability-4] Introduzir `ClockProvider` e `RandomProvider` injetáveis; banir `new Date()`/`Math.random()` em código-fonte

- **Problema**
  > 22 `new Date()/Date.now()` em código-fonte BE; 1 `Math.random()` em `RetryExecutor.ts:53`; **zero** `jest.useFakeTimers()` no repo inteiro. Testes precisam usar `expect.any(Date)`; coalescer de ingestão (janela de tempo) não-testável.

- **Melhoria Proposta**
  > Tactic Limit Non-Determinism. Criar `domain/libs/clock/ClockProvider.ts` (`@singleton() @injectable()`) com `now(): Date` e `nowMillis(): number`. Criar `domain/libs/random/RandomProvider.ts` com `next(): number`. Refatorar todos os 22 sites + jitter para injetar. Em testes, registrar `FakeClock`/`FixedRandom` no container ou injetar via construtor (padrão `AgingService` já mostra o caminho — `compute(dataBase?, now: Date = new Date())`).

- **Resultado Esperado**
  > Sites de `new Date()` em código-fonte BE: **22 → 0**. `Math.random()` em código-fonte: **1 → 0**. ≥ 5 testes novos usando `FakeClock`/`useFakeTimers` para validar coalescer ingestão, snapshot age, jitter de retry.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - `new Date()/Date.now()` em código-fonte (não-teste): **22 → 0**
  - `Math.random()` em código-fonte: **1 → 0**
  - Testes usando `FakeClock`/`useFakeTimers`: **0 → ≥ 5**
- **Risco de não fazer**: bug de timezone em relatórios; idempotência por janela de tempo não-testável; flake em CI por jitter.
- **Dependências**: overlap em **Modifiability** (Encapsulate / Use an Intermediary).

### [testability-5] Gravar fixtures reais de Conexos como Recordable Test Cases (em todos os 4 sub-clients da CC-2)

- **Problema**
  > CC-2 decompôs `ConexosClient` em 5 sub-clients mas o teste `ConexosSubClients.test.ts` (1657 LOC) continua inventando o shape com `mockResolvedValue({...})` em cada `it()`. Zero fixtures gravadas. Quando o ERP mudar campo (`docCod → docCodigo`, hipotético), testes seguem verdes; só prod falha.

- **Melhoria Proposta**
  > Tactic Recordable Test Cases. Durante sessão QaCoach no dev da Columbia, capturar 1 JSON real por endpoint usado por cada sub-client (`ConexosFinanceiroClient.listFinanceiroAPagar`, `ConexosTitulosClient.listInvoicesFinalizadas`, `ConexosBaixaClient.postBordero`, `ConexosCadastroClient.listFiliais`, ...) e gravar em `src/backend/domain/client/__fixtures__/conexos/<endpoint>.json` (sanitize CNPJ/valores). Adicionar 1 teste por fixture que valida via Zod (`conexosPermutasSchemas.ts`).

- **Resultado Esperado**
  > Fixtures gravadas: **0 → ≥ 10** (1 por endpoint usado). Schemas Zod cobertos contra payload real: **0 → ≥ 10**. Detecção de breaking change Conexos via CI ao invés de prod.

- **Tactic alvo**: Recordable Test Cases + Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - Fixtures Conexos: **0 → ≥ 10**
  - Testes `<endpoint>.fixture.test.ts`: **0 → ≥ 10**
- **Risco de não fazer**: tempo de detecção de breaking change Conexos = tempo de chegar a prod (risco N°1 de ferramenta de ERP integration).
- **Dependências**: sessão QaCoach com acesso ao dev Conexos.

### [testability-6] Bumpar threshold FE para `lines 28 / branches 14 / functions 23` IMEDIATAMENTE e plano de subida a 60/40/50 em 90 dias

- **Problema**
  > `src/frontend/jest.config.js:35-44` em `lines 20 / branches 9 / functions 14` apesar de o real ser `28.83 / 14.44 / 23.22` pós-CC-1. Gate hoje está **mais frouxo que a realidade** — qualquer regressão de até 8 pp de lines passa sem alarme. CC-1 não atualizou o threshold no mesmo PR que entregou a cobertura.

- **Melhoria Proposta**
  > Tactic Executable Assertions. (1) PR imediato: bumpar para `lines 28 / branches 14 / functions 23` (apenas trava o real). (2) Em 30 dias, junto com testability-1: bumpar para `lines 40 / branches 20 / functions 30`. (3) Em 60 dias: `lines 55 / branches 30 / functions 45`. (4) Em 90 dias: `lines 60 / branches 40 / functions 50`. Cada bump comentado no `jest.config.js` com a justificativa da run de Regis correspondente.

- **Resultado Esperado**
  > Threshold lines FE em 90 dias: **20 → 60**, branches **9 → 40**, functions **14 → 50**. CI passa a flagar regressão de cobertura, não só remoção massiva.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) imediato + S por bump
- **Findings relacionados**: F-testability-7, F-testability-1
- **Métricas de sucesso**:
  - Threshold lines FE: **20 → 28 (imediato) → 60 (90d)**
  - Threshold branches FE: **9 → 14 (imediato) → 40 (90d)**
  - Threshold functions FE: **14 → 23 (imediato) → 50 (90d)**
- **Risco de não fazer**: ganho da CC-1 evapora; time confia em verde falso.
- **Dependências**: bumps acima de 40/20/30 dependem de `testability-1`.

### [testability-7] Padronizar log assertions em paths de erro (helper `buildLogService()` em `tests/utils/`)

- **Problema**
  > 12/44 arquivos de teste BE referenciam `LogService`; quase todos só para mocá-lo e ignorar. Apenas `EleicaoPermutasService.test.ts:23-32` captura calls num array via `buildLogService()`. Erros em produção chegam sem `LOG_TYPE` correto e sem contexto (`borCod`, `priCod`).

- **Melhoria Proposta**
  > Tactic Executable Assertions. Extrair `buildLogService()` para `src/backend/tests/utils/buildLogService.ts`. Em cada `.rejects.toThrow(...)`, adicionar `expect(logCalls).toContainEqual({ type: LOG_TYPE.<algo>, data: expect.objectContaining({ requestId, ... }) })`.

- **Resultado Esperado**
  > Arquivos de teste com log assertion em paths de erro: **~2 → ≥ 20**. Helper `buildLogService()` exportado em `tests/utils/`. ≥ 1 teste por catch/throw assegura shape do log.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-8
- **Métricas de sucesso**:
  - Testes assertando log shape: **~2 → ≥ 20**
  - Helper compartilhado: **não → sim**
- **Risco de não fazer**: MTTR de investigação cresce.
- **Dependências**: nenhuma.

### [testability-8] Quebrar `ConexosSubClients.test.ts` (1657 LOC) em um arquivo por sub-client (terminar a CC-2 no lado do teste)

- **Problema**
  > CC-2 decompôs `ConexosClient` em 5 sub-clients (`ConexosBaseClient`, `ConexosBaixaClient`, `ConexosCadastroClient`, `ConexosFinanceiroClient`, `ConexosTitulosClient`) — bom. Mas os testes ficaram concentrados num único `ConexosSubClients.test.ts` de 1657 LOC. O ganho de Limit Structural Complexity é pela metade: navegar a especificação de um sub-client específico ainda exige scroll por 1.6k linhas. Adicionalmente, `ConexosBaixaClient.ts` (write `fin010`) está em **40.9% branches** — caminhos de erro do POST de baixa precisam de mais cobertura.

- **Melhoria Proposta**
  > Tactic Limit Structural Complexity. Quebrar `ConexosSubClients.test.ts` em 5 arquivos co-localizados (`ConexosBaseClient.test.ts`, `ConexosBaixaClient.test.ts`, `ConexosCadastroClient.test.ts`, `ConexosFinanceiroClient.test.ts`, `ConexosTitulosClient.test.ts`). Aproveitar para adicionar 5+ testes de path de erro no `ConexosBaixaClient` (timeout, 4xx/5xx do `/baixa`, payload inválido) para subir branches 40.9 → 70+. Combina com `testability-5` (fixtures aterrissam um arquivo por sub-client).

- **Resultado Esperado**
  > `ConexosSubClients.test.ts` deletado; 5 arquivos novos ≤ 500 LOC cada. `ConexosBaixaClient.ts` branches `40.9% → ≥ 70%`. Maior teste BE: **1657 → < 600**.

- **Tactic alvo**: Limit Structural Complexity + Executable Assertions
- **Severidade**: P3 (era P2)
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-9, F-testability-2b
- **Métricas de sucesso**:
  - Maior teste BE: **1657 → < 600 LOC**
  - Arquivos de teste co-localizados por sub-client: **0 → 5**
  - `ConexosBaixaClient.ts` branches: **40.9% → ≥ 70%**
- **Risco de não fazer**: onboarding alto; refactor de um sub-client carrega risco percebido do teste enorme; branches do POST de baixa seguem fracos.
- **Dependências**: combinar com `testability-5` (fixtures) faz sentido.

### [testability-9] Adicionar `fast-check` e ≥ 4 properties cobrindo lógica numérica de Permutas

- **Problema**
  > `fast-check` nem é dep direta. `progressoPagamento` (câmbio), `ordenarBorderosPainel`, `bucketEtapaPermuta`, `AlocacaoPermutasService.alocar` testados com 3-5 example-based cases. Edge-cases de arredondamento de centavos, ordenação instável, alocação somando errado escapam.

- **Melhoria Proposta**
  > Tactic Limit Non-Determinism (exploração sistemática). `npm i -D fast-check` em BE e FE. Properties: (1) `progressoPagamento(face, aberto, taxa)` ⇒ `percentPago ∈ [0,99]`, `faltaUsd = faltaBrl/taxa` quando taxa>0 (FE); (2) `bucketEtapaPermuta(etapas)` ⇒ resultado em `{0,1,2}` para qualquer combinação válida (FE); (3) `ordenarBorderosPainel(rows)` ⇒ idempotente, estável, não-mutante (FE); (4) `AlocacaoPermutasService.alocar(invoice, adiantamentos)` ⇒ soma das alocações == valor invoice (BE).

- **Resultado Esperado**
  > `fast-check` dep direta: ausente → presente (BE+FE). Properties: **0 → ≥ 4**. Cada property roda 100 inputs aleatórios em CI.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-10
- **Métricas de sucesso**:
  - `fast-check` em `package.json` (BE+FE): **não → sim**
  - Properties no repo: **0 → ≥ 4**
- **Risco de não fazer**: bug sutil de arredondamento em valor financeiro.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Score 5 → 6/10**: CC-1 (frontend) e CC-2 (backend) resolveram um P0 inteiro (`PermutaExecucaoRepository` 51% → 100% lines) e fizeram progresso material no outro (page.tsx 2971 → 1026 LOC; FE global 20.82 → 28.83 lines). Mas o threshold do CI **não foi bumpado junto** com o ganho, e 10 dos 18 sub-componentes/hooks novos da CC-1 estão em 0% — o padrão de extração funcionou, a disciplina de escrever teste durante a extração não. Determinismo, integration tests e fixtures Conexos seguem **inalterados** — três cards P1 que não dependem de nada.
- **Métricas que tentei coletar e falharam**: flake rate em 30 dias e MTTR de bug detectado em prod (sem histórico CI agregado nem E2E); cobertura runtime no fluxo Conexos real (sem sandbox ERP cabeado em CI).
- **Cross-QA detectado para o `qa-consolidator`**:
  - `testability-4` (ClockProvider/RandomProvider) ↔ **Modifiability** (Encapsulate / Use an Intermediary).
  - `testability-5` (fixtures Conexos) ↔ **Integrability** (contract tests = boundary tactic).
  - `testability-3` + `testability-6` (integration tests + threshold) ↔ **Deployability** (gate antes do deploy Render).
  - `testability-2` (idempotência da baixa) ↔ **Fault Tolerance** (state-machine transitions = Recovery / Reintroduction tactic).
  - `testability-1` (god-component residual) ↔ **Modifiability** (Reduce Size of a Module).
