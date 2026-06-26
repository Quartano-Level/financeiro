---
qa: Testability
qa_slug: testability
run_id: 2026-06-26-0058
agent: qa-testability
generated_at: 2026-06-26T01:18:00-03:00
scope: all
score: 5
findings_count: 11
cards_count: 9
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev tocando UI de Permutas (page.tsx, 2971 LOC) ou repo de execução (PermutaExecucaoRepository, 21 métodos públicos) | Mudança de regra (ex.: novo gate de borderô, novo formato de baixa Conexos) precisa ser validada **antes do deploy** | Componente React god-object + repositório de idempotência da baixa no ERP fin010 | Desenvolvimento local + CI (`.github/workflows/ci.yml`) antes de PR merge para `main` (deploy Render/Vercel) | Suite de testes (unit + componente + integração) cobre a mudança, falha em regressão de comportamento e dá sinal verde só quando invariantes do domínio (`permuta_alocacao_execucao` idempotente, ordenação do painel, % pago calculado) seguem válidos | (a) cobertura backend ≥ 85% lines / 70% branches na trilha `service+repository`; (b) cobertura frontend ≥ 60% lines / 50% branches em `app/permutas/`; (c) tempo de feedback do CI ≤ 5min; (d) zero "flakes" em 30 dias de execução |

> Hoje: BE cumpre (a) globalmente (88.34% lines, 67.79% branches); FE **falha catastroficamente** em (b) — `page.tsx` e `BorderosPanel.tsx` rodam com 0/0/0/0 e o threshold do `jest.config.js` foi rebaseado para lines 20 / branches 9 / functions 14 para manter o CI verde (`src/frontend/jest.config.js:35-44`). Integração contra Postgres ou Conexos real (c+d): inexistente.

## 2. Métricas observadas

### Métrica observável #1 — Cobertura por camada (real, coletada hoje)

| Camada | % Stmts | % Branch | % Funcs | % Lines | Alvo Bass | Status | Fonte |
|---|---|---|---|---|---|---|---|
| **Backend (All files)** | 86.96 | 67.79 | 85.83 | **88.34** | 80 / 70 / 80 / 80 | ✅ | `npm test --coverage` (44 suites, 480 testes) |
| `backend/domain/service/permutas` | 94.47 | 75.90 | 96.72 | **95.99** | 90 / 75 / 90 / 90 | ✅ | mesmo |
| `backend/domain/service` (LogService só) | 91.17 | 64.28 | 100 | **100** | 90 / 75 | ⚠️ branch | mesmo |
| `backend/domain/repository/permutas` (agregado) | 83.59 | 50.56 | 71.96 | **86.33** | 85 / 70 / 85 | ⚠️ branch/funcs | mesmo |
| └ `PermutaExecucaoRepository.ts` (idempotência da baixa) | **49.36** | **30.76** | **28.57** | **51.42** | 85 / 70 / 85 | ❌ | mesmo — F-testability-2 |
| `backend/domain/client/permutas` (Conexos schemas) | 100 | 100 | 100 | 100 | 90 | ✅ | mesmo |
| `backend/domain/client/database` | 89.77 | 56.25 | 80.95 | 93.67 | 80 / 60 | ✅ | mesmo |
| `backend/routes/permutas.ts` | 70.97 | 43.84 | 67.85 | 70.97 | 75 / 60 | ⚠️ | mesmo |
| `backend/services/conexos.ts` (legado) | **29.48** | **18.86** | 31.81 | **31.38** | 70 / 50 | ❌ | mesmo — F-testability-3 |
| `backend/domain/libs/handler` (ApiGateway) | 100 | 84.44 | 100 | 100 | 90 | ✅ | mesmo |
| `backend/http` (auth/middleware) | 97.16 | 90.10 | 100 | 96.87 | 90 | ✅ | mesmo |
| **Frontend (All files)** | **20.38** | **10.27** | **15.34** | **20.82** | 60 / 50 / 60 | ❌ | `npm test --coverage` (11 suites, 57 testes) |
| `app/permutas/page.tsx` (2971 LOC) | **0** | **0** | **0** | **0** | 50 mínimo | ❌ | F-testability-1 |
| `app/permutas/BorderosPanel.tsx` (683 LOC) | **0** | **0** | **0** | **0** | 50 mínimo | ❌ | F-testability-1 |
| `app/permutas/clientes-filtro/page.tsx` (255 LOC) | 0 | 0 | 0 | 0 | 50 mínimo | ❌ | F-testability-1 |
| `app/login/page.tsx` (125 LOC) | 0 | 0 | 0 | 0 | 50 mínimo | ❌ | F-testability-1 |
| `lib/api.ts` (boundary HTTP) | 42.00 | 20.51 | 34.28 | **43.41** | 70 / 50 | ❌ | F-testability-7 |
| `lib/utils.ts` (lógica pura) | 93.47 | 93.75 | 81.25 | 92.30 | 90 | ✅ | mesmo |
| `lib/auth` (AuthProvider/token/env) | 28.57 | 37.14 | 36.36 | 25.37 | 70 | ❌ | F-testability-7 |
| `components/ui` (primitivos Radix) | 47.68 | 46.98 | 39.13 | 50.19 | 60 | ⚠️ | mesmo |

### Métricas observáveis #2 — Tactic e processo

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| BE arquivos de teste / fonte | 44 / 87 (**0.51**) | ≥ 0.5 | ✅ | `find src/backend -name '*.test.ts'` vs `*.ts` |
| FE arquivos de teste / fonte | 11 / 41 (**0.27**) | ≥ 0.5 | ❌ | `find src/frontend ...` |
| Testes que usam injeção por construtor (vs `container.resolve`) | **124 / 125** (99%) | ≥ 80% | ✅ | `grep "new .*Service(" --include=*.test.ts` |
| `jest.useFakeTimers` no repo inteiro | **0 ocorrências** | ≥ 1 por feature time-sensitive | ❌ | `grep -rn useFakeTimers src/` — F-testability-4 |
| `new Date()/Date.now()` em código-fonte (não teste) | **22 sites** | 0 (via `ClockProvider` injetável) | ❌ | `grep "new Date()" --include=*.ts ` excluindo testes — F-testability-4 |
| `Math.random()` em código-fonte | **1 site** (`RetryExecutor.ts:53` jitter) | 0 ou injetado | ⚠️ | `grep Math.random` — F-testability-4 |
| Tests fazendo HTTP real (axios direto) | 1 arquivo *mockado* (`BcbClient.test.ts:6 jest.mock('axios')`) + 0 reais | 0 reais | ✅ | `grep axios. --include=*.test.ts` |
| Integration tests (`describe('integration:`) | **0** | ≥ 1 por repository com SQL complexo | ❌ | `grep "describe('integration"` — F-testability-5 |
| `docker-compose.test.yml` / setup Postgres de teste | **ausente** | presente | ❌ | `find . -name docker-compose*` — F-testability-5 |
| Fixtures gravadas (Recordable Test Cases) de Conexos | **0 arquivos** | ≥ 1 por endpoint usado | ⚠️ | `find */__fixtures__ -name '*.json'` — F-testability-6 |
| Tests que asserting em `LogService` calls | 10 arquivos / 480 testes (~2%) | ≥ 30% em paths de erro | ⚠️ | `grep -l logService.error --include=*.test.ts` — F-testability-8 |
| `beforeAll/afterAll` (estado compartilhado entre `it()`) | 3 ocorrências em 2 arquivos | ≤ 5% dos arquivos | ✅ | `grep -l beforeAll --include=*.test.ts` |
| Frontend component tests (`render()`) | 3 arquivos (UI primitives + 2 auth) | ≥ 1 por feature page | ⚠️ | `grep -l render( --include=*.test.tsx` |
| Threshold de cobertura no CI (BE) | global lines 72 / branches 54 / functions 78; `domain/service/` lines 88 / branches 60 | global ≥ 80 / 70 / 80 | ⚠️ | `src/backend/jest.config.cjs:34-44` |
| Threshold de cobertura no CI (FE) | global lines **20** / branches **9** / functions **14** | lines ≥ 60 | ❌ | `src/frontend/jest.config.js:35-44` — F-testability-1 |
| CI roda `npm test` em BE+FE? | Sim (`.github/workflows/ci.yml:27,46`), bloqueia merge | sim | ✅ | mesmo |
| Suite tempo total | BE 8.5s / FE 1.9s | ≤ 30s para feedback rápido | ✅ | output `npm test` |
| Maior teste (LOC) | `ConexosClient.test.ts` **1628 LOC** | < 500 LOC (SUT muito grande) | ❌ | `wc -l --sort` — F-testability-9 |
| Property-based testing (`fast-check`) | **0 usos** (não é nem dep direta) | ≥ 1 por algoritmo numérico (% pago, ordenação, alocação N:M) | ⚠️ | `grep -l "fast-check" package.json` — F-testability-10 |
| Agent `TDDGuide`/`TestabilityCoach` no pipeline | **ausente** (só PatternGuardian) | presente | ⚠️ | `ls .claude/agents/` — F-testability-11 |
| E2E tests (Playwright/Cypress) | **0** | ≥ 1 happy path do fluxo de baixa | ⚠️ | `find . -name 'playwright*'` — declarado N/A neste run (alvo: futura história) |

> ⚠️ **Não medível localmente**: flake rate em 30 dias, tempo MTTR para diagnosticar bug detectado em prod (sem testes E2E não há baseline), cobertura runtime no fluxo real Conexos (não há sandbox/staging do ERP cabeado em CI). Recomendação: instrumentar `CI: re-run on flake` no GitHub Actions e medir; gravar respostas Conexos reais em `__fixtures__` durante QaCoach.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | tsyringe permite injetar mocks em construtor; testes de serviço usam `new SomeService(mockDep as any)` (recomendação CLAUDE.md) — 124 ocorrências confirmam adoção | ✅ presente | `src/backend/domain/service/permutas/EleicaoPermutasService.test.ts:35-41`, `ConexosClient.test.ts:5-14` (builder `buildLegacy()` retornando `jest.Mocked<LegacyConexosShape>`) |
| **Recordable Test Cases** | Nenhuma resposta real do Conexos gravada como fixture — mocks são literais inline (`legacy.listGenericPaginated.mockResolvedValue({...})`). Quando o schema do ERP mudar, descobre-se em prod, não em teste | ❌ ausente | `find src/backend -path '*/__fixtures__/*'` → vazio; `ConexosClient.test.ts` define dados inline em cada `it()` |
| **Sandbox** | Não há sandbox Postgres (`docker-compose.test.yml` ausente); zero `describe('integration:')`; nenhum modo Conexos sandbox cabeado | ❌ ausente | `find . -name 'docker-compose*.yml'` → vazio; `grep "describe('integration" -r src/backend` → vazio |
| **Executable Assertions** | Zod nos boundaries (HTTP — `src/backend/http/schemas.ts` 100% cov) age como executable assertion sobre payloads externos. Falta o mesmo no boundary Conexos: `conexosPermutasSchemas.ts` existe mas validação acontece apenas em alguns endpoints | ✅ parcial | `src/backend/http/schemas.test.ts` (100% cov); ConexosClient ainda retorna `unknown` em ~30% dos paths |
| **Abstract Data Sources** | `PostgreeDatabaseClient` é injetado; `ConexosClient` é injetado via `LegacyConexosShape`. Boa abstração — testes nunca tocam DB ou rede real | ✅ presente | `appContainer.ts`, todos repositórios recebem `db` no construtor |
| **Limit Structural Complexity** | Backend disciplinado (services 90–96% cov, arquivos < 900 LOC). **Frontend viola brutalmente**: `app/permutas/page.tsx` 2971 LOC, 36 hooks `useState/useEffect`, ZERO cobertura. O componente é o SUT, não há como testar a unidade porque a unidade é o app inteiro | ❌ ausente (FE) / ✅ presente (BE) | `wc -l src/frontend/app/permutas/page.tsx` → 2971; `grep -c useState src/frontend/app/permutas/page.tsx` → 36 |
| **Limit Non-Determinism** | 22 chamadas `new Date()/Date.now()` em código-fonte BE (`IngestaoPermutasService.ts:73,89,127,159,189`, `PainelService.ts:60`, `PermutaProcessamentoRepository.ts:35`, etc.). 1 `Math.random()` em `RetryExecutor.ts:53` para jitter. Zero `jest.useFakeTimers()` em todo o repo. `AgingService.compute` é exemplo positivo: aceita `now: Date = new Date()` como param, permitindo override em teste — padrão único | ⚠️ parcial | `grep -n "new Date()" src/backend` → 22 hits; `grep -rn useFakeTimers src/` → 0 hits; `AgingService.ts:17` (boa prática isolada) |

## 4. Findings

### F-testability-1: God-component da feature Permutas com 0% de cobertura

- **Severidade**: P0
- **Tactic violada**: Limit Structural Complexity + Specialized Interfaces
- **Localização**: `src/frontend/app/permutas/page.tsx:1-2971`, `src/frontend/app/permutas/BorderosPanel.tsx:1-683`
- **Evidência (objetiva)**:
  ```
   app/permutas
    BorderosPanel.tsx           |       0 |        0 |       0 |       0 | 3-661
    page.tsx                    |       0 |        0 |       0 |       0 | 3-2965
  ```
  Componente concentra 36 `useState/useEffect`, importa 14 endpoints distintos de `@/lib/api`, renderiza tabela, modais de ingestão, alocação N:M, exportação Excel, runs, snapshot — todos os fluxos de Permutas. O `jest.config.js:35-44` foi rebaseado para lines 20 / branches 9 / functions 14 admitindo o problema: "page.tsx (2971 LOC) sem teste de componente — não-coberto é o JSX/handlers do componente gigante".
- **Impacto técnico**: qualquer alteração em ordenação, paginação, modal de alocação ou na máquina de estados do borderô pode quebrar UX sem nenhum sinal — só será percebida em produção pelos analistas. CI passa por desígnio (threshold rebaseado).
- **Impacto de negócio**: feature crítica (única em produção); falsa-confiança de "verde" no CI; bug que impede analista de aprovar borderô (caso já observado, ver `/feature-tweak` borderô-finalizar do MEMORY) leva ao Stage B "ler HAR manual" — sintoma direto de falta de teste de componente.
- **Métrica de baseline**: lines = **0%** em 3654 LOC de componente; threshold do CI artificialmente em 20% para acomodar o problema (deveria ser ≥ 60% lines / 40% branches para `app/`).

### F-testability-2: Repositório de idempotência da baixa Conexos com 49% lines / 30% branches

- **Severidade**: P0
- **Tactic violada**: Executable Assertions + Specialized Interfaces
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:1-441`, teste em `PermutaExecucaoRepository.test.ts:1-174`
- **Evidência (objetiva)**:
  ```
   PermutaExecucaoRepository.ts | 49.36 | 30.76 | 28.57 | 51.42 | 81-90,127-135,143-152,160,169-178,183-187,192,200,211,269,340-348,365-393,404,418
  ```
  21 métodos públicos (`findByIdempotencyKey`, `listByAdiantamento`, `borderoDoPar`, `listComBordero`, `findByBorCodInvoice`, `deleteByBorCodInvoice`, `listByBorCod`, `countByBorCod`, `deleteByBorCod`, `deleteByKey`, `renameKey`, `beginExecution`, `setBorCod`, `setRequestPayload`, `markSettled`, `markError`, `listBorderoCache`, `replaceBorderoCache`, `updateBorderoCacheSituacao`, `deleteBorderoCache`); 10 `it()` blocks no teste — **~11 métodos públicos sem nenhuma assertion**.
- **Impacto técnico**: este é o único guard contra dupla-baixa no `fin010` do Conexos (write-ahead `permuta_alocacao_execucao`). Métodos como `deleteByBorCod`, `updateBorderoCacheSituacao`, `replaceBorderoCache` mexem em estado financeiro sem nenhuma cobertura — uma regressão de UPSERT, RETURNING ou cláusula WHERE silenciosamente corrompe a tabela de idempotência.
- **Impacto de negócio**: dupla-baixa significa duplicar lançamento financeiro no ERP da Columbia. Auditoria contábil reabre o exercício; impossível distinguir "Nexxera devolveu duplicado" de "nosso sistema duplicou".
- **Métrica de baseline**: cobertura 51.42% lines / 30.76% branches no repositório mais crítico do produto; threshold do diretório (`./domain/service/` lines 88) **não cobre `domain/repository/`** — o repo escapa do gate por inteiro.

### F-testability-3: Layer `backend/services/conexos.ts` legado com 31% lines / 19% branches

- **Severidade**: P1
- **Tactic violada**: Specialized Interfaces (legado não migrado)
- **Localização**: `src/backend/services/conexos.ts` (linhas não cobertas: 86-89, 94-226, 247-307, 325)
- **Evidência (objetiva)**:
  ```
   backend/services |   29.48 |    18.86 |   31.81 |   31.38
    conexos.ts      |   29.48 |    18.86 |   31.81 |   31.38 | 86-89,94-226,247-307,325
  ```
  Único arquivo na pasta legada `services/` (não-DDD). 130+ linhas consecutivas sem teste (94-226).
- **Impacto técnico**: o adapter Conexos legado (autenticação SID + retry) está abaixo do `ConexosClient` novo via `legacyConexosAdapter.ts`. Qualquer regressão na sessão ou paginação não é detectada localmente.
- **Impacto de negócio**: erro de autenticação Conexos paraliza toda a feature Permutas (ingestão, alocação, baixa) — não há sinal de teste para forçar retest desse path quando dependência for atualizada.
- **Métrica de baseline**: 31.38% lines, com 70% lines como alvo pragmático para legado em migração.

### F-testability-4: Não-determinismo abundante — 22 `new Date()` em código-fonte, zero `useFakeTimers` em todo o repo

- **Severidade**: P1
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:73,89,127,159,189`, `EleicaoPermutasService.ts:336,343,386`, `PainelService.ts:60`, `PermutaProcessamentoRepository.ts:35`, `routes/permutas.ts:160,578`, `Logger.ts:3,7,11`, `LogService.ts:23`, `RetryExecutor.ts:53` (`Math.random()` para jitter)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "new Date()\|Date.now()" src/backend --include='*.ts' | grep -v .test.ts | wc -l
  22
  $ grep -rn "useFakeTimers" src/ --include='*.ts' --include='*.tsx'
  (vazio — 0 ocorrências em todo o repo)
  ```
  `AgingService.ts:17` é o único exemplo positivo: `public compute = (dataBase?: Date, now: Date = new Date())` — aceita override. Os demais leem `new Date()` direto.
- **Impacto técnico**: tests não conseguem assertar `startedAt`/`finishedAt` exato; precisam usar matchers frouxos (`expect.any(Date)`). Bug de timezone (já corrigido em `formatDate`, ver `src/frontend/lib/utils.test.ts:124-138` que testa em 3 TZs) só foi capturado porque alguém pensou em chamar `process.env.TZ` — não há `ClockProvider` que padronize isso.
- **Impacto de negócio**: relatórios podem virar dia errado (timezone) em produção; idempotência por janela de tempo fica não-testável (ex.: "duas ingestões em 5 min coalescem em 1 run" — sem clock fake não dá pra testar).
- **Métrica de baseline**: 22 sites de `Date()` + 1 `Math.random()` sem injeção. Alvo: 0 (todos via `ClockProvider`/`RandomProvider` `@injectable()`).

### F-testability-5: Zero integration tests; nenhum docker-compose de teste; Postgres real nunca exercitado

- **Severidade**: P1
- **Tactic violada**: Sandbox
- **Localização**: convenção CLAUDE.md prevê `describe('integration: ...')` — não há nenhuma instância em `src/backend`. `find . -name 'docker-compose*.yml' -not -path '*/node_modules/*'` retorna vazio.
- **Evidência (objetiva)**:
  ```
  $ grep -rn "describe(.integration:" src/backend --include='*.test.ts'
  (vazio)
  $ find . -name 'docker-compose*.yml' -not -path '*/node_modules/*'
  (vazio)
  ```
  `PermutaRelationalRepository.ts` (629 LOC, 91.56% lines mas **47.5% branches** — SQL complexo com vários CASE/JOIN/CTE) é testado só com `db: { query: jest.fn() }`. Nenhum teste valida que o SQL realmente roda no Postgres.
- **Impacto técnico**: SQL inválido (typo em coluna, JOIN ambíguo, `$N` faltando) só estoura em runtime no Render. Mock devolve o que o teste prescreveu; o teste passa, o SQL quebra em produção.
- **Impacto de negócio**: PR pode mergear "verde" e quebrar o painel em produção em features-tweak de relatório.
- **Métrica de baseline**: 0 integration tests / ~10 repositórios + 1 client database. Alvo mínimo: 1 integration test por repositório com SQL não-trivial (≥ 5 cases no `PermutaRelationalRepository`, ≥ 5 no `PermutaExecucaoRepository`).

### F-testability-6: Sem fixtures gravadas de Conexos — schema do ERP é assumido, nunca validado contra resposta real

- **Severidade**: P1
- **Tactic violada**: Recordable Test Cases
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (1956 LOC), `src/backend/domain/client/ConexosClient.test.ts` (1628 LOC — 100 `describe`/`it` blocks com mocks inline)
- **Evidência (objetiva)**:
  ```
  $ find src/backend -path '*/__fixtures__/*' -o -name '*.fixture.*'
  (vazio)
  $ grep -n "mockResolvedValue" src/backend/domain/client/ConexosClient.test.ts | wc -l
  > 100
  ```
  Cada teste reinventa o shape da resposta. Não há um único JSON gravado de chamada real ao Conexos.
- **Impacto técnico**: quando Conexos muda nome de campo (`docCod` → `docCodigo`, hipotético), os testes seguem verdes (porque os mocks também usam o nome antigo); só prod falha. Não há "contract test" entre o que pensamos que o ERP retorna e o que ele retorna de fato.
- **Impacto de negócio**: tempo de detecção de breaking change Conexos = tempo de chegar a prod. Para uma ferramenta de **ERP integration**, é o risco N°1.
- **Métrica de baseline**: 0 fixtures gravadas / ~15 endpoints Conexos usados. Alvo: ≥ 1 fixture JSON real por endpoint (gravada via QaCoach uma vez, versionada em `__fixtures__/conexos/<endpoint>.json`).

### F-testability-7: Threshold do CI frontend rebaseado para 20% lines — CI verde por construção

- **Severidade**: P1
- **Tactic violada**: Executable Assertions (gate de qualidade)
- **Localização**: `src/frontend/jest.config.js:35-44`
- **Evidência (objetiva)**:
  ```js
  coverageThreshold: {
      global: {
          lines: 20,
          branches: 9,
          functions: 14,
      },
      './lib/auth/': {
          lines: 24,
      },
  },
  ```
  Comentário explícito (linha 28-34) admite que o número "antigo" de 82% era Potemkin e que a nova base reflete o god-component sem cobertura. `lib/api.ts` (boundary HTTP, todos os fetches) está em 43.41% lines.
- **Impacto técnico**: gate de cobertura serve para flagrar regressão. Em 9% branches isso é ruído — qualquer adição de `if/else` em qualquer componente passa. O gate só pega remoção massiva de testes.
- **Impacto de negócio**: time confia no "verde" do CI como sinal de qualidade. Sinal é falso.
- **Métrica de baseline**: lines 20 / branches 9 / functions 14. Alvo: lines 60 / branches 40 / functions 50 em 90 dias, com plano de carga (F-testability-1).

### F-testability-8: Paths de erro raramente assertam log estruturado

- **Severidade**: P2
- **Tactic violada**: Executable Assertions
- **Localização**: 10/44 arquivos de teste no BE referenciam `LogService` — quase todos para mocá-lo e ignorar
- **Evidência (objetiva)**:
  ```
  $ grep -rln "logService\.\|LogService" src/backend --include='*.test.ts' | wc -l
  10
  ```
  `EleicaoPermutasService.test.ts:23-32` cria um `buildLogService()` que captura calls num array — bom padrão isolado, **só usado nesse arquivo**. Demais testes apenas declaram `const logService = { info: jest.fn(), error: jest.fn() }` e nunca verificam o conteúdo do erro.
- **Impacto técnico**: erro em produção chega ao log sem `LOG_TYPE`, sem `requestId`, sem contexto do domínio (`borCod`, `priCod`). Quem investiga incidente fica cego.
- **Impacto de negócio**: MTTR de investigação cresce; engenheiro precisa ler código-fonte para entender o erro.
- **Métrica de baseline**: < 5% dos testes verificam shape do log. Alvo: 100% dos `catch`/`throw` ter teste que assegure `logService.error` chamado com `LOG_TYPE.<algo>` e contexto.

### F-testability-9: `ConexosClient.test.ts` em 1628 LOC — SUT monolítico, teste reflete

- **Severidade**: P2
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (1956 LOC), `ConexosClient.test.ts` (1628 LOC)
- **Evidência (objetiva)**:
  ```
  $ find src/backend -name '*.test.ts' -not -path '*/node_modules/*' -exec wc -l {} \; | sort -rn | head -3
  1628 src/backend/domain/client/ConexosClient.test.ts
   921 src/backend/routes/permutas.test.ts
   909 src/backend/domain/service/permutas/EleicaoPermutasService.test.ts
  ```
  Cobertura 100% — disciplina é exemplar. Mas o tamanho denuncia que o SUT é grande demais para ser uma unidade.
- **Impacto técnico**: adicionar um endpoint Conexos requer ler ~2k LOC para saber onde encaixar; risco de duplicação de lógica de chunking, paginação e retry.
- **Impacto de negócio**: tempo de onboarding cresce; refactor fica adiado por medo do teste enorme.
- **Métrica de baseline**: maior teste = 1628 LOC. Alvo: ≤ 500 LOC por arquivo de teste, via decomposição do `ConexosClient` em sub-clients (`ConexosFinanceiroClient`, `ConexosBordereauClient`, etc.).

### F-testability-10: `fast-check` não é dep direta — property-based testing zerado

- **Severidade**: P3
- **Tactic violada**: Limit Non-Determinism (PBT é exploração não-determinística sistemática)
- **Localização**: `src/backend/package.json` (sem `fast-check`), `src/frontend/package.json` (sem `fast-check`)
- **Evidência (objetiva)**:
  ```
  $ grep '"fast-check"' src/backend/package.json src/frontend/package.json
  (vazio — só aparece transitivamente via zod em package-lock.json)
  ```
- **Impacto técnico**: lógica numérica crítica (`progressoPagamento` com taxa de câmbio em `lib/utils.ts`, ordenação `ordenarBorderosPainel`, alocação N:M em `AlocacaoPermutasService`) é testada com 3-5 example-based cases. Property-based pegaria edge-cases que ninguém pensou (overflow de centavos, ordenação instável, alocação que soma negativa).
- **Impacto de negócio**: bugs sutis de arredondamento em valores financeiros — exatamente o que financeiro não tolera.
- **Métrica de baseline**: 0 usos `fast-check`. Alvo: ≥ 3 properties em `lib/utils.ts` (`progressoPagamento`, `ordenarBorderosPainel`, `bucketEtapaPermuta`) e ≥ 1 em `AlocacaoPermutasService`.

### F-testability-11: Sem agent `TDDGuide`/`TestabilityCoach` no pipeline

- **Severidade**: P3
- **Tactic violada**: Specialized Interfaces (governança)
- **Localização**: `.claude/agents/` lista 19 agents — nenhum `tdd-*` / `test-*` / `testability-*`
- **Evidência (objetiva)**:
  ```
  $ ls .claude/agents/ | grep -E "tdd|test|coach"
  (vazio — só qa-testability.md, que é review)
  ```
  CLAUDE.md menciona "TDD → impl" no AutoLoopRunner, mas não há agent que verifique:
  - existem testes ANTES da implementação?
  - testes seguem padrão de injeção por construtor (não `container.resolve`)?
  - paths de erro têm assertion de log?
  - novo `Date.now()`/`Math.random()` é flagrado?
- **Impacto técnico**: PatternGuardian valida DDD/tsyringe/SQL mas não testability. Decisões de testabilidade caem entre cadeiras.
- **Impacto de negócio**: dívida cresce silenciosamente PR a PR (caso real: `app/permutas/page.tsx` chegou a 2971 LOC sem ninguém puxar freio).
- **Métrica de baseline**: 0 agents de testabilidade. Alvo: 1 agent que rode pré-`green` checklist (testes pré-impl + injeção construtor + log assertion + clock/random injetável).

## 5. Cards Kanban

### [testability-1] Quebrar `app/permutas/page.tsx` e testar os sub-componentes

- **Problema**
  > Um único componente React de 2971 LOC com 36 hooks (`src/frontend/app/permutas/page.tsx:1-2971`) e `BorderosPanel.tsx:1-683` concentra toda a UI da feature crítica em produção. Cobertura: 0/0/0/0. Threshold do CI foi rebaseado para 20 lines / 9 branches / 14 functions (`jest.config.js:35-44`) admitindo o problema. Qualquer mudança de UX entra cega.

- **Melhoria Proposta**
  > Extrair em componentes testáveis seguindo Limit Structural Complexity: `PermutasTable`, `IngestaoModal`, `AlocacaoModal`, `RelatoriosPanel`, `RunsAuditModal`, `BorderoCard`. Lógica fora de JSX vira hook custom (`useGestaoPermutas`, `useBorderoActions`). Adicionar `__tests__/permutas/<componente>.test.tsx` com Testing Library cobrindo: renderização vazia, renderização com dados, click → ação, erro toast. Subir threshold para lines 50 / branches 30 / functions 40 ao final da carga. Mover lógica pura derivada do estado para `lib/permutas-selectors.ts` (puro, fácil de testar).

- **Resultado Esperado**
  > Cobertura `app/permutas/` 0% → 50% lines; `page.tsx` reduzido de 2971 para < 800 LOC; ≥ 6 arquivos de teste de componente novos; threshold do CI (frontend `jest.config.js`) subido para lines 50 / branches 30 / functions 40.

- **Tactic alvo**: Limit Structural Complexity + Specialized Interfaces
- **Severidade**: P0
- **Esforço estimado**: XL (>2sem)
- **Findings relacionados**: F-testability-1, F-testability-7
- **Métricas de sucesso**:
  - `app/permutas/page.tsx` LOC: **2971 → < 800**
  - Cobertura lines `app/permutas/`: **0% → ≥ 50%**
  - Threshold `jest.config.js` lines: **20 → 50** / branches **9 → 30** / functions **14 → 40**
  - Arquivos de teste de componente novos: **0 → ≥ 6**
- **Risco de não fazer**: regressão silenciosa em fluxos de baixa, alocação N:M e finalização de borderô, com bug chegando a analista da Columbia antes do dev (vide caso `borderô-finalizar` ainda aberto, Stage B requer captura HAR manual em prod — sintoma direto da ausência de teste de componente).
- **Dependências**: nenhuma; é o primeiro passo do plano de testabilidade FE.

### [testability-2] Cobrir `PermutaExecucaoRepository` (idempotência da baixa Conexos) com pelo menos 1 teste por método público

- **Problema**
  > 21 métodos públicos no único repositório que guarda o write-ahead da baixa no ERP `fin010` (`src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:1-441`). 10 `it()` blocks no teste → ~11 métodos sem assertion. Cobertura 49.36% stmts / 30.76% branches / 28.57% funcs / 51.42% lines. Métodos não-cobertos incluem `deleteByBorCod`, `updateBorderoCacheSituacao`, `replaceBorderoCache` — escrita destrutiva em tabela financeira.

- **Melhoria Proposta**
  > Para cada método público sem teste (linhas não-cobertas: 81-90, 127-135, 143-152, 160, 169-178, 183-187, 192, 200, 211, 269, 340-348, 365-393, 404, 418): adicionar um `it()` que valida SQL parametrizado (verificar `db.query.mock.calls[0]` recebe `($1, $2, ...)` certo), mapeamento camelCase ↔ snake_case e retorno. Adicionar `jest.config.cjs` threshold por diretório `./domain/repository/`: lines 85 / branches 70 / functions 85 (atualmente sem gate específico). Apply tactic Specialized Interfaces.

- **Resultado Esperado**
  > Cobertura `PermutaExecucaoRepository.ts` 49.36% → ≥ 85% stmts, 30.76% → ≥ 70% branches. CI passa a falhar se cobertura do diretório `domain/repository/` cair.

- **Tactic alvo**: Executable Assertions + Specialized Interfaces
- **Severidade**: P0
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - `PermutaExecucaoRepository.ts` stmts: **49.36% → ≥ 85%**
  - `PermutaExecucaoRepository.ts` branches: **30.76% → ≥ 70%**
  - `PermutaExecucaoRepository.ts` funcs: **28.57% → ≥ 85%**
  - Threshold `domain/repository/` no `jest.config.cjs` adicionado (era ausente)
  - `it()` blocks: **10 → ≥ 21** (1 por método público)
- **Risco de não fazer**: bug de UPSERT na tabela `permuta_alocacao_execucao` permite dupla-baixa no Conexos; auditoria contábil precisa reabrir exercício.
- **Dependências**: nenhuma; teste continua mockando `db.query` (não é integration test).

### [testability-3] Introduzir integration tests contra Postgres real (docker-compose) para repos com SQL não-trivial

- **Problema**
  > Zero `describe('integration:')` em todo o backend. Nenhum `docker-compose.test.yml`. `PermutaRelationalRepository.ts` (629 LOC, 47.5% branches), `PermutaExecucaoRepository.ts` (51.42% lines) e `PermutaSnapshotRepository.ts` (64.58% branches) executam SQL complexo (CTE, JOIN, JSONB, UPSERT) que nunca é validado contra um Postgres de verdade. SQL inválido só estoura em runtime no Render.

- **Melhoria Proposta**
  > Criar `src/backend/docker-compose.test.yml` com Postgres 16 + script de schema (reusar `migrations/`). Adicionar `npm run test:integration` que sobe o container, roda só arquivos com sufixo `.integration.test.ts` (já ignorado pelo `jest.config.cjs:7`) e tira no fim. Escrever 5 integration tests por repositório complexo (foco em: query principal, edge case de UPSERT, comportamento de CASCADE, ORDER BY com `NULLS LAST`, query com JOIN ambíguo). Aplicar tactic Sandbox.

- **Resultado Esperado**
  > Integration tests: 0 → ≥ 15 (5 cases × 3 repositórios). `docker-compose.test.yml` presente e documentado no README do backend. CI roda integration tests em job separado (não bloqueia PR inicialmente, sinaliza após 30 dias).

- **Tactic alvo**: Sandbox
- **Severidade**: P1
- **Esforço estimado**: L (1–2sem)
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - Integration test files: **0 → ≥ 3**
  - Integration test cases: **0 → ≥ 15**
  - `docker-compose.test.yml` presente: **não → sim**
  - SQL bugs detectados antes de prod (proxy: bugs SQL em prod nos últimos 90 dias) — começar a medir
- **Risco de não fazer**: SQL quebrado merge-ado verde; bug aparece no analista, não no dev.
- **Dependências**: nenhuma.

### [testability-4] Introduzir `ClockProvider` e `RandomProvider` injetáveis; banir `new Date()`/`Math.random()` em código-fonte

- **Problema**
  > 22 chamadas `new Date()/Date.now()` em código-fonte BE (`IngestaoPermutasService.ts:73,89,127`, `EleicaoPermutasService.ts:336,343,386`, `PainelService.ts:60`, etc.). 1 `Math.random()` em `RetryExecutor.ts:53` para jitter. Zero `jest.useFakeTimers()` em todo o repo. Testes precisam usar matchers frouxos (`expect.any(Date)`), e features dependentes de janela de tempo (coalescer de ingestão, snapshot age) não conseguem testar comportamento exato.

- **Melhoria Proposta**
  > Criar `domain/libs/clock/ClockProvider.ts` (`@singleton() @injectable()`) com `now(): Date` e `nowMillis(): number`. Criar `domain/libs/random/RandomProvider.ts` com `next(): number`. Refatorar serviços/repositórios para injetar essas dependências em vez de `new Date()` direto. Em testes, registrar `FakeClock`/`FixedRandom` no container. Aplicar tactic Limit Non-Determinism. Estende-se também ao FE: `formatDate` já mostra o caminho (`utils.test.ts:124-138` força `process.env.TZ` em 3 zonas — bom padrão).

- **Resultado Esperado**
  > Sites de `new Date()` em código-fonte BE: **22 → 0** (todos via `ClockProvider`). `Math.random()` em código-fonte: **1 → 0**. Pelo menos 5 testes novos usando `useFakeTimers`/`FakeClock` para validar comportamento time-sensitive (coalescer ingestão, snapshot age, jitter de retry).

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - `new Date()/Date.now()` em código-fonte (não-teste): **22 → 0**
  - `Math.random()` em código-fonte: **1 → 0**
  - Testes usando `FakeClock`/`useFakeTimers`: **0 → ≥ 5**
- **Risco de não fazer**: bug de timezone em relatórios (data virada para o dia anterior); idempotência por janela de tempo não-testável; jitter de retry não-determinístico em CI.
- **Dependências**: ver overlap em Modifiability (clock/random como injetáveis é também tactic Modifiability — Encapsulate).

### [testability-5] Gravar fixtures reais de Conexos como Recordable Test Cases

- **Problema**
  > `ConexosClient.test.ts` (1628 LOC, 100 `mockResolvedValue`) inventa o shape da resposta Conexos em cada teste. Zero fixtures gravadas (`find src/backend -path '*__fixtures__*'` vazio). Quando o ERP muda campo (`docCod` → `docCodigo`, hipotético), testes seguem verdes; só prod falha.

- **Melhoria Proposta**
  > Durante uma sessão QaCoach no ambiente dev da Columbia, capturar 1 JSON real por endpoint Conexos usado (listFinanceiroAPagar, listInvoicesFinalizadas, listAdiantamentosProforma, postBordero, etc.) e gravar em `src/backend/domain/client/__fixtures__/conexos/<endpoint>.json` (sem dados sensíveis — sanitize CNPJs/valores). Adicionar 1 teste por fixture que valida via Zod (`conexosPermutasSchemas.ts`) que o JSON parseia. Quando Conexos muder o schema, atualizar a fixture passa a ser parte do PR de adaptação — visibilidade explícita. Tactic: Recordable Test Cases.

- **Resultado Esperado**
  > Fixtures gravadas: 0 → ≥ 10 (1 por endpoint Conexos usado). Schemas Zod cobertos por teste contra payload real: 0 → ≥ 10. Detecção de breaking change Conexos via CI ao invés de prod.

- **Tactic alvo**: Recordable Test Cases + Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - Fixtures Conexos: **0 → ≥ 10**
  - Testes `<endpoint>.fixture.test.ts` validando contra Zod: **0 → ≥ 10**
- **Risco de não fazer**: tempo de detecção de breaking change Conexos = tempo de chegar a prod (catastrófico para feature de integração ERP).
- **Dependências**: requer sessão QaCoach com acesso ao ambiente dev Conexos.

### [testability-6] Repor threshold de cobertura frontend rumo a 60 / 40 / 50 (lines/branches/functions)

- **Problema**
  > `src/frontend/jest.config.js:35-44` está em lines 20 / branches 9 / functions 14 — números rebaseados em v0.8.1 para acomodar o god-component (`F-testability-1`). Gate só pega remoção massiva de testes; qualquer adição de `if/else` em qualquer componente passa.

- **Melhoria Proposta**
  > Após executar `testability-1` (quebra do god-component), subir thresholds em 3 etapas: (1) lines 20→35 / branches 9→18 / functions 14→25 (em 30 dias); (2) lines 35→50 / branches 18→30 / functions 25→40 (em 60 dias); (3) lines 50→60 / branches 30→40 / functions 40→50 (em 90 dias). Comentar a justificativa de cada passo no `jest.config.js`.

- **Resultado Esperado**
  > Threshold FE em 90 dias: lines **20 → 60**, branches **9 → 40**, functions **14 → 50**. CI passa a flagar regressão de cobertura, não só remoção.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) por bump, distribuído
- **Findings relacionados**: F-testability-7, F-testability-1
- **Métricas de sucesso**:
  - Threshold lines FE: **20 → 60**
  - Threshold branches FE: **9 → 40**
  - Threshold functions FE: **14 → 50**
- **Risco de não fazer**: time confia em verde falso; débito de testes cresce sem freio.
- **Dependências**: `testability-1` (precisa do código quebrado em sub-componentes para ser testável).

### [testability-7] Padronizar log assertions em paths de erro (helper `buildLogService()` no `tests/utils/`)

- **Problema**
  > 10/44 arquivos de teste BE referenciam `LogService`; quase todos só para mocar e ignorar. Apenas `EleicaoPermutasService.test.ts:23-32` captura calls num array via `buildLogService()`. Erros em produção chegam sem `LOG_TYPE` correto e sem contexto (`borCod`, `priCod`).

- **Melhoria Proposta**
  > Extrair `buildLogService()` para `src/backend/tests/utils/buildLogService.ts` e usar em todos os testes de service/repository. Em cada teste de path de erro (`.rejects.toThrow(...)`), adicionar `expect(logCalls).toContainEqual({ type: LOG_TYPE.<algo>, data: expect.objectContaining({ requestId, ... }) })`. Tactic: Executable Assertions.

- **Resultado Esperado**
  > Arquivos de teste com log assertion em paths de erro: **~2 → ≥ 20**. Helper `buildLogService()` exportado em `tests/utils/`. Pelo menos 1 teste por catch/throw assegura shape do log.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-testability-8
- **Métricas de sucesso**:
  - Testes assertando log shape em path de erro: **~2 → ≥ 20**
  - Helper compartilhado em `tests/utils/buildLogService.ts`: **não existe → existe**
- **Risco de não fazer**: MTTR de investigação cresce; engenheiro lê código-fonte para entender erro de produção.
- **Dependências**: nenhuma.

### [testability-8] Decompor `ConexosClient` em sub-clients por bounded context

- **Problema**
  > `ConexosClient.ts` em 1956 LOC, teste em 1628 LOC (`ConexosClient.test.ts`). Cobertura 100%, mas tamanho denuncia SUT monolítico — viola Limit Structural Complexity. Adicionar endpoint requer ler ~2k LOC.

- **Melhoria Proposta**
  > Decompor em `ConexosFinanceiroClient` (a-pagar, adiantamentos, invoices), `ConexosBordereauClient` (borderô e baixa), `ConexosCadastroClient` (filiais, parceiros). Cada um `@singleton() @injectable()`, recebendo `LegacyConexosShape` no construtor. Mover testes 1:1 para cada sub-client. Manter `ConexosClient` como fachada deprecada que delega, até remover.

- **Resultado Esperado**
  > `ConexosClient.ts` 1956 LOC → < 200 LOC (fachada). Sub-clients: 3 arquivos < 700 LOC cada. Sub-tests: 3 arquivos < 600 LOC cada. Cobertura preservada em ≥ 95%.

- **Tactic alvo**: Limit Structural Complexity
- **Severidade**: P2
- **Esforço estimado**: L (1–2sem)
- **Findings relacionados**: F-testability-9
- **Métricas de sucesso**:
  - `ConexosClient.ts` LOC: **1956 → < 200**
  - Maior teste BE: **1628 → < 600**
  - Sub-clients criados: **0 → 3**
- **Risco de não fazer**: onboarding cresce; refactor adiado por medo do teste enorme; duplicação de chunking/paginação.
- **Dependências**: `testability-5` (fixtures viram úteis nessa decomposição).

### [testability-9] Adicionar `fast-check` e ≥ 4 properties cobrindo lógica numérica de Permutas

- **Problema**
  > `fast-check` nem é dep direta. Lógica numérica crítica (`progressoPagamento` com câmbio em `lib/utils.ts`, `ordenarBorderosPainel`, `bucketEtapaPermuta`, alocação N:M cross-process em `AlocacaoPermutasService`) é testada com 3-5 example-based cases. Edge-cases de arredondamento de centavos, ordenação instável e alocação somando errado escapam.

- **Melhoria Proposta**
  > `npm i -D fast-check` em backend e frontend. Adicionar properties: (1) `progressoPagamento(face, aberto, taxa)` ⇒ `percentPago ∈ [0,99]` sempre, `faltaUsd = faltaBrl/taxa` quando taxa>0 (FE); (2) `bucketEtapaPermuta(etapas)` ⇒ resultado em `{0,1,2}` para qualquer combinação válida (FE); (3) `ordenarBorderosPainel(rows)` ⇒ idempotente (ordenar 2x = ordenar 1x), estável e não-mutante (FE); (4) `AlocacaoPermutasService.alocar(invoice, adiantamentos)` ⇒ soma das alocações == valor invoice (BE).

- **Resultado Esperado**
  > `fast-check` dep direta: ausente → presente (BE+FE). Properties: 0 → ≥ 4. Bugs de borda capturados na PRÓXIMA execução em CI (sample: rodar 100 inputs aleatórios cada).

- **Tactic alvo**: Limit Non-Determinism (exploração sistemática)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-10
- **Métricas de sucesso**:
  - `fast-check` em `package.json` (BE+FE): **não → sim**
  - Properties no repo: **0 → ≥ 4**
- **Risco de não fazer**: bug sutil de arredondamento em valor financeiro — exatamente o que financeiro não tolera.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Score 5/10**: BE genuinamente bom (88.34% lines, 480 testes, injeção por construtor disciplinada, 99% dos testes usam `new Service(mock)` em vez de `container.resolve`); FE catastrófico (god-component zero-coverage com threshold do CI rebaseado para esconder). Repositório de idempotência da baixa (`PermutaExecucaoRepository`) em 49% stmts/30% branches é o segundo P0. Zero integration tests + zero fixtures Conexos = invariantes do produto **não** estão defendidas pelo CI verde.
- **Métricas que tentei coletar e falharam**: flake rate em 30 dias e MTTR de investigação (não há histórico de runs CI agregado); cobertura runtime no fluxo Conexos real (sem sandbox ERP cabeado em CI).
- **Cross-QA detectado para o `qa-consolidator`**:
  - `testability-4` (ClockProvider/RandomProvider) ↔ **Modifiability** (Encapsulate / Use an Intermediary).
  - `testability-5` (fixtures Conexos) ↔ **Integrability** (contract tests = boundary tactic).
  - `testability-3` + `testability-6` (integration tests, threshold) ↔ **Deployability** (gate antes do deploy Render).
  - `testability-2` (idempotência cobre estados `pending/settled/error`) ↔ **Fault Tolerance** (state-machine transitions = Recovery / Reintroduction tactic).
  - `testability-1` (god-component) ↔ **Modifiability** (Reduce Size of a Module).
