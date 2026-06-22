---
qa: Testability
qa_slug: testability
run_id: 2026-06-22-1658
agent: qa-testability
generated_at: 2026-06-22T17:00:00Z
scope: all
score: 6.5
findings_count: 9
cards_count: 8
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/CI executando suite | Mudança em service/repository de permutas (PR #4 — distribuição greedy, eleição, alocação) | Backend (37 test files / 374 tests) + Frontend (11 test files / 51 tests) | Pre-merge no CI (GitHub Actions); local na máquina do dev | Suite verde, cobre invariantes de estado (`elegivel`/`bloqueada`/`permuta-manual`) e regras de saldo, sem flakes nem dependência de `.env` local | Tempo de feedback ≤ 10s (BE 7.3s ok, FE 1.1s ok); cobertura por camada com piso CI; 0 testes ambientais; 0 não-determinismo em src |

> Cenário concreto observado: na execução desta auditoria, `EnvironmentProvider.test.ts` falhou na máquina do dev (`expect(Number.isNaN(env.conexosFilCod)).toBe(true)` → recebeu `7` lido do `.env` local) — passou no CI porque CI não tem o `.env`. Isto é exatamente o anti-padrão Bass de **falta de Sandbox**: o resultado do teste depende do estado do filesystem do desenvolvedor, não da entrada controlada pelo teste.

## 2. Métricas observadas

### Tabela canônica de cobertura por camada (Bass exige: única métrica mais citada de testability)

| Camada | % Stmts | % Branch | % Funcs | % Lines | # test files / # source files | Status | Fonte |
|---|---|---|---|---|---|---|---|
| `backend` (global) | 89.97 | 70.94 | 88.74 | 91.58 | 37 / 77 (0.48) | ✅ | `npm test -- --coverage` |
| `backend/domain/service/permutas` (núcleo de negócio) | 96.40 | 79.01 | 97.91 | 97.34 | 9 / 9 (1.00) | ✅ | coverage table |
| `backend/domain/repository/permutas` | 92.59 | 55.68 | 87.34 | 96.00 | 5 / 5 (1.00) | ⚠️ branch | coverage table |
| `backend/domain/client` (Conexos/BCB/Postgres) | 89.08 | 77.85 | 85.71 | 90.38 | 4 / 6 (0.67) | ✅ | coverage table |
| `backend/domain/libs/handler` (ApiGatewayHandler) | 100 | 84.44 | 100 | 100 | 6 / 8 (0.75) | ✅ | coverage table |
| `backend/routes/permutas.ts` (Express handler) | 97.72 | 60.78 | 100 | 97.72 | 1 / 1 | ⚠️ branch | coverage table |
| `backend/services/conexos.ts` (legado Express) | 31.72 | 19.80 | 33.33 | 33.85 | 0 / 1 | ❌ | coverage table |
| `backend/domain/client/legacyConexosAdapter.ts` | 57.89 | 16.66 | 37.50 | 55.55 | 0 / 1 | ❌ | coverage table |
| `backend/jobs/*` | n/a | n/a | n/a | n/a | 0 / 2 | ❌ ausente | `find … jobs -name *.test.ts` |
| `frontend` (apenas arquivos importados pelos testes) | 82.19 | 54.10 | 69.44 | 83.70 | 11 / 196 (0.06) | ❌ | `npm test -- --coverage` |
| `frontend/app/permutas/page.tsx` (2127 LOC, core UX) | **0** | **0** | **0** | **0** | 0 testes a tocam | ❌ P0 | sem `collectCoverageFrom` no `jest.config.js` |
| `frontend/app/permutas/clientes-filtro/page.tsx` (270 LOC) | **0** | **0** | **0** | **0** | 0 testes a tocam | ❌ | idem |
| `frontend/lib/api.ts` (cliente HTTP) | 66.66 | 35.55 | 63.15 | 70.47 | 4 / 1 | ⚠️ | coverage table |

### Outras métricas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Testes BE / suites | 374 testes / 37 suites | crescer com features | ✅ | `npm test` |
| Testes FE / suites | 51 / 11 | ≥ 100 (FE tem 196 .tsx) | ⚠️ | `npm test` |
| Razão test files / source files (BE) | 37 / 77 = 0.48 | ≥ 0.5 | ⚠️ | `find` |
| Razão test files / source files (FE) | 11 / 196 = 0.06 | ≥ 0.20 | ❌ | `find` |
| Testes de integração (DB real) | 0 (`*.integration.test.ts` ignorados via `testPathIgnorePatterns`, nenhum arquivo) | ≥ 1 por repositório de SQL complexo (5) | ❌ | `jest.config.cjs` + `find` |
| Suites com `useFakeTimers` / `setSystemTime` | 0 | ≥ 1 onde `Date.now()` está em src | ❌ | `grep` |
| `new Date()` / `Date.now()` em src (BE, sem injeção de clock) | 10+ sítios em 5 services (`IngestaoPermutasService`, `EleicaoPermutasService`, `PainelService`, `AgingService`, `LogService`) | 0 (usar `ClockProvider` injetável) | ❌ | `grep -rn 'Date.now\|new Date()' src/backend` |
| `Math.random` / `crypto.randomUUID` em src (BE) | 1 (`RetryExecutor.ts`, jitter) | 0 não-abstraídos | ⚠️ | `grep` |
| Falhas ambientais (suite passa em CI mas falha local) | 1 (`EnvironmentProvider.test.ts` lê `.env` do dev via `dotenv.config()` dentro de `GetLocalEnvironmentVars`) | 0 | ❌ | execução observada nesta run |
| Property-based tests (fast-check) | 0 (e a dep **não está instalada** — `grep fast-check package.json` vazio em BE e FE) | ≥ 3 para invariantes monetários (soma de alocações = total adto) | ❌ | `package.json` |
| Coverage threshold gate no CI | BE: global 72/54/78, `domain/service` 88/60; FE: global 75/40/55, `lib/auth` 90 | ≥ 80/70/80 em service+repo | ⚠️ | `jest.config.cjs` / `jest.config.js` |
| `collectCoverageFrom` no FE | **ausente** | configurado para `app/**`+`lib/**`+`components/**` | ❌ | `jest.config.js` |
| Tempo de execução suite BE | 7.3s | ≤ 30s | ✅ | `npm test` |
| Tempo de execução suite FE | 1.1s | ≤ 30s | ✅ | `npm test` |
| Tests com chamadas HTTP loopback (`fetch(server.url)`) | 12 em `routes/permutas.test.ts` (Express in-process — aceitável) | aceitável; flagear se sair do loopback | ✅ | `grep` |
| Agentes Claude TDD-guide presentes | 0 (existem `pattern-guardian`, `qa-testability`; falta `tdd-guide`) | 1 | ⚠️ | `ls .claude/agents` |
| Maior test file (excl. node_modules) | `ConexosClient.test.ts` 1342 LOC; `EleicaoPermutasService.test.ts` 908 LOC; `routes/permutas.test.ts` 659 LOC | < 500 LOC | ⚠️ | `wc -l` |
| `describe` por método público em `AlocacaoPermutasService` (3 métodos públicos: `buscarInvoices`/`alocar`/`remover`) | 0 (apenas 1 `describe` top-level; 8 `it` planos) | 1 `describe` por método | ⚠️ | `grep describe` |
| `logService.*` asserções em testes (path de erro logado) | 6 ocorrências no BE inteiro | ≥ 1 por service com tratamento de erro (9 services) | ⚠️ | `grep -rn 'logService\.' --include *.test.ts` |
| Razão de tests via `container.registerInstance` (Bass: Specialized Interfaces) | 192 sítios em 37 test files vs. 1 `container.resolve` (em `ApiGatewayHandler.test.ts`) | ratio alto = bom seam | ✅ | `grep` |

> ⚠️ **Não medível localmente**: tempo de flake real (test was-green/now-red) em janelas de 30 dias — requer histórico de CI no GitHub Actions com `gh run list`. Recomendação: scriptar `gh run list --limit 100 --json conclusion,headBranch` para extrair taxa de flake e fazer a métrica entrar como gate.

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass & Clements) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | DI via `tsyringe`: testes injetam mocks por `container.registerInstance(SomeService, { method } as never)`. 192 chamadas em 37 test files; apenas 1 `container.resolve` em todo o BE de teste. | ✅ presente | `src/backend/routes/permutas.test.ts:81,128,150,166,216,235,283,305,328,343` |
| **Record/Playback (Recordable Test Cases)** | Ausente para `ConexosClient` (1979 LOC de client externo) — não há `__fixtures__/`. Único fixture é `frontend/lib/permutas-fixture.ts` (UX demo-only, não usado como contrato de teste). | ❌ ausente | `find src/backend -name '__fixtures__'` vazio |
| **Sandbox** | **Quebrada** em `EnvironmentProvider`: `GetLocalEnvironmentVars` chama `dotenv.config({ path: process.cwd() + '/.env' })` dentro do método; o teste tenta limpar `process.env.CONEXOS_FIL_COD` no `beforeEach`, mas `dotenv` preenche de volta a partir do disco. Resultado: passa no CI (sem `.env`), falha no dev (com `.env`). | ❌ violada | `src/backend/domain/libs/environment/EnvironmentProvider.ts:46-47`; falha observada nesta run |
| **Executable Assertions** | Zod nos boundaries do `EnvironmentVars` e dos clients — invariantes capturados como código executável e violações são erros explícitos. Mas não há `invariant()`/`assert()` runtime em services (ex.: somar `valorParcial` × alocações ≤ `adto.valorTotal`). | ⚠️ parcial | `src/backend/domain/libs/environment/model/EnvironmentVars.ts`; `AlocacaoPermutasService` valida em SQL/repo, não em assertion |
| **Abstract Data Sources** | `PostgreeDatabaseClient` é `@singleton @injectable` — repositórios o recebem por DI, e testes mockam `query`. Bom. | ✅ presente | `src/backend/domain/repository/permutas/*.test.ts` |
| **Limit Structural Complexity** | Bom no BE (services entre 100–700 LOC, repos < 600). **Ruim no FE**: `app/permutas/page.tsx` = 2127 LOC client component agregando 4 abas + greedy display + alocação modal + ingestão — é simultaneamente o que mais precisa de teste e o que menos pode ser testado por composição. | ⚠️ parcial | `wc -l src/frontend/app/permutas/page.tsx` |
| **Limit Non-Determinism** | **Violada** em 5 services: `Date.now()` / `new Date()` capturados direto, sem `ClockProvider`. `formatRunWhen` em FE faz a coisa certa (fixa `America/Sao_Paulo` por `Intl.DateTimeFormat`), mas: (a) não tem teste; (b) o problema BE-side persiste — `IngestaoPermutasService` grava `finishedAt: new Date()` em 4 sítios, impossível assertar `durationMs` sem fake timers. | ❌ ausente | `IngestaoPermutasService.ts:70,86,124,144,174`; `EleicaoPermutasService.ts:285,292,335`; `PainelService.ts:60`; `AgingService.ts:17` |
| **N/A — Build Monitoring Hooks** | Cobertura é coletada no CI; relatórios HTML em `src/{frontend,backend}/coverage/` mas não publicados como artifact. Sub-tactic de "Observe State". | ⚠️ parcial | `.github/workflows/ci.yml:27,46` (sem `actions/upload-artifact`) |

## 4. Findings

### F-testability-1: `EnvironmentProvider.test.ts` depende do `.env` do desenvolvedor

- **Severidade**: P0 (crítico — passa no CI mas falha local; corrompe o sinal "verde local = verde CI")
- **Tactic violada**: Sandbox (Limit Non-Determinism)
- **Localização**: `src/backend/domain/libs/environment/EnvironmentProvider.ts:43-47` + `src/backend/domain/libs/environment/EnvironmentProvider.test.ts:36-58`
- **Evidência (objetiva)**:
  ```
  FAIL domain/libs/environment/EnvironmentProvider.test.ts
    ● EnvironmentProvider › local mode › reads from process.env when client_name is undefined
      Expected: true
      Received: false
        56 |             expect(env.awsRegion).toBe('us-east-1');
        58 |             expect(Number.isNaN(env.conexosFilCod)).toBe(true);
  ```
  Causa: `GetLocalEnvironmentVars` chama `dotenv.config({ path: path.resolve(process.cwd(), '.env') })` dentro do próprio método. O `beforeEach` do teste limpa `CONEXOS_FIL_COD` de `process.env`, mas `dotenv` lê de novo do disco e re-popula com `7` (valor do `.env` do dev).
- **Impacto técnico**: qualquer teste que dependa de variáveis ausentes pode passar no CI e quebrar localmente (ou vice-versa). O contrato "test = especificação executável" é quebrado — a especificação agora depende do filesystem.
- **Impacto de negócio**: dev gasta horas debugando "fantasma" (test vermelho que parece bug, é configuração local). Pior, mascara regressões reais ("ah é só meu .env", e era um bug).
- **Métrica de baseline**: 1 / 374 testes (0.27%) com dependência ambiental. Alvo: 0.

### F-testability-2: `app/permutas/page.tsx` com 2127 LOC e 0% de cobertura, contendo lógica de domínio

- **Severidade**: P0 (crítico — feature core do PR #4 sem rede de proteção)
- **Tactic violada**: Limit Structural Complexity + Specialized Interfaces (não há separação testável)
- **Localização**: `src/frontend/app/permutas/page.tsx` (2127 LOC, 1 arquivo)
- **Evidência (objetiva)**:
  ```
  $ find src/frontend -name '*.tsx' -not -name '*.test.tsx' | xargs wc -l | sort -rn | head -3
      2127 src/frontend/app/permutas/page.tsx
       270 src/frontend/app/permutas/clientes-filtro/page.tsx
       171 src/frontend/app/login/page.tsx
  $ grep -rn "permutas/page" src/frontend/__tests__/  # vazio
  ```
  O arquivo concentra: `useTabelaFiltro` (hook genérico, linha 376), `formatRunWhen` (timezone-aware, linha 107), 4 abas (`abaSimples`/`abaMultiplas`/`abaCrossOver`/`abaCrossProcess`), modal de alocação com cálculo de `jaAlocadoInvoice` (linha 719), exibição de `saldoRestante`. Nenhum teste o importa.
- **Impacto técnico**: regressões visuais ou de regra (ex.: cálculo de `saldoRestante`, exibição de `jaAlocado`) só são detectadas por QA manual no demo. O coverage report omite o arquivo inteiro porque `jest.config.js` não tem `collectCoverageFrom` — o 82.19% reportado é enganoso.
- **Impacto de negócio**: feature de permuta múltipla manual (Fase 2/3, ADR-0007/0008) é onde o analista mais erra; sem teste, cada PR de ajuste é roleta russa de UI.
- **Métrica de baseline**: 2127 LOC sem teste; `useTabelaFiltro` 0 testes; `formatRunWhen` 0 testes; `jaAlocadoInvoice` 0 testes. Alvo: extrair pelo menos `useTabelaFiltro` e `formatRunWhen` para `lib/` e cobrir 100%.

### F-testability-3: Falta `collectCoverageFrom` no frontend — coverage é um espelho mentiroso

- **Severidade**: P0 (crítico — métrica de gate é falsa)
- **Tactic violada**: Executable Assertions (o gate de CI não assegura o que diz)
- **Localização**: `src/frontend/jest.config.js`
- **Evidência (objetiva)**:
  ```
  $ grep -n "collectCoverageFrom" src/frontend/jest.config.js
  (nenhum match)
  ```
  Sem `collectCoverageFrom`, Jest mede cobertura **apenas dos arquivos importados pelos testes**. O FE tem 196 `.tsx` mas o coverage table cita ~10 arquivos (todos de `components/ui` ou `lib/`). O 82.19% reportado mede 10 arquivos curados — não a aplicação.
- **Impacto técnico**: o gate `coverageThreshold.global` é satisfeito por um subconjunto arbitrário. Adicionar 1000 LOC sem teste a `app/` não move a métrica.
- **Impacto de negócio**: gerência crê que FE tem 82% de cobertura; realidade efetiva ≈ 16% (`(82.19% × 10) / 196`). Decisões de risco baseadas em métrica falsa.
- **Métrica de baseline**: cobertura efetiva FE ~16% (10/196 arquivos amostrados a 82%) vs. 82.19% reportado. Alvo: configurar `collectCoverageFrom: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}']` e recalibrar floor.

### F-testability-4: Não-determinismo temporal vazando em 5 services (sem `ClockProvider`)

- **Severidade**: P1 (alto — bloqueia tests de `durationMs`, snapshots de `finishedAt`)
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `IngestaoPermutasService.ts:70,86,124,144,174` · `EleicaoPermutasService.ts:285,292,335` · `PainelService.ts:60` · `AgingService.ts:17` · `LogService.ts`
- **Evidência (objetiva)**:
  ```ts
  // IngestaoPermutasService.ts:70-144
  const startedAt = new Date();
  // ...
  finishedAt: new Date(),
  durationMs: Date.now() - startedAt.getTime(),
  ```
  Nenhum teste do BE usa `jest.useFakeTimers()` (`grep` retornou 0). Logo, asserções sobre `durationMs`, `finishedAt`, `geradoEm` são reduzidas a `expect.any(Number)` / `expect.any(Date)` — perda de poder.
- **Impacto técnico**: bug de cálculo de duração ("snapshot fresco ≤ 24h" em `PainelService.ts:60`) não pode ser testado de forma exata. Mudanças que afetam `finishedAt` (timezone, formato) passam despercebidas.
- **Impacto de negócio**: tela "Gestão de Permutas" mostra "snapshot stale" baseado em `Date.now() - finishedAt`. Bug aqui = analista trabalha com dado velho achando que é fresco. Sem teste exato, regressão é detectada em produção.
- **Métrica de baseline**: 10 leituras de tempo em src/ não abstraídas; 0 testes com `useFakeTimers`. Alvo: 1 `ClockProvider @injectable`, 10 sítios refatorados, ≥ 5 testes assertando `durationMs` exato.

### F-testability-5: `ConexosClient` (1979 LOC, integração crítica) sem fixtures gravadas

- **Severidade**: P1 (alto — Recordable Test Cases ausente para a única integração externa real)
- **Tactic violada**: Recordable Test Cases (Record/Playback)
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (1979 LOC) + `ConexosClient.test.ts` (1342 LOC, sem `__fixtures__`)
- **Evidência (objetiva)**:
  ```
  $ find src/backend -name '__fixtures__'  # vazio
  $ grep -n "fixture" src/backend/domain/client/ConexosClient.ts
  1086: // call above. Confirmed against Yuri's curl fixture (interview ...
  ```
  O teste de 1342 LOC monta payloads inline (`legacy.get.mockResolvedValueOnce({ data: { ... } })`). Quando o schema do `fin010` ou `com298` mudar no Conexos, **nada quebra automaticamente** — só descobrimos quando o run de produção falha.
- **Impacto técnico**: Contratos do Conexos não são versionáveis nem comparáveis. Adicionar um campo ao payload força edição de N lugares no teste sem referência canônica.
- **Impacto de negócio**: SISPAG e Popula GED (próximas frentes) terão a mesma dor multiplicada por 3 integrações. Custo de manutenção do client cresce linearmente; deveria ser logarítmico (mude o fixture, todo o resto se ajusta).
- **Métrica de baseline**: 0 fixtures gravadas; 1342 LOC de mock inline. Alvo: ≥ 3 fixtures (`fin010-pendentes.json`, `fin010-baixados.json`, `com298-titulos.json`) e ConexosClient.test.ts reduzido a ≤ 800 LOC.

### F-testability-6: 0 testes de integração com Postgres real para repositórios com SQL complexo

- **Severidade**: P1 (alto — `PermutaRelationalRepository` 524 LOC de SQL parametrizado nunca executado contra Postgres real no CI)
- **Tactic violada**: Sandbox (test environment que se parece com produção)
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:524-540` (linhas uncovered: 524-529, 533-540) · `PermutaSnapshotRepository.ts:184-204, 261-268`
- **Evidência (objetiva)**:
  ```
  jest.config.cjs: testPathIgnorePatterns: ['\\.integration\\.test\\.ts$']
  $ find src/backend -name '*.integration.test.ts'  # vazio
  ```
  CLAUDE.md menciona `describe('integration: …')` como convenção, mas: (a) o pattern é proativamente ignorado pelo jest config; (b) nenhum arquivo `*.integration.test.ts` existe; (c) não há `docker-compose.test.yml` nem script de Postgres efêmero.
- **Impacto técnico**: SQL ricos (JOINs N:M com agregação de `saldoRestante`, queries de `listAtivos` com filtro composto) só são validados via mock do pool — sintaxe pode estar quebrada e o teste passa.
- **Impacto de negócio**: bug de SQL ("`WHERE` esquecido no `UPDATE` da alocação") = data loss financeiro. Sem teste contra Postgres real, o gate é falso.
- **Métrica de baseline**: 0 testes de integração; 5 repositórios com SQL. Alvo: 1 integration test por repositório (5 cases mínimo), rodando contra `postgres:16` em GH Actions service container.

### F-testability-7: Test files gigantes — sintoma de complexidade do SUT

- **Severidade**: P2 (médio — débito que arrasta esforço de manutenção)
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `ConexosClient.test.ts` (1342 LOC) · `EleicaoPermutasService.test.ts` (908 LOC) · `routes/permutas.test.ts` (659 LOC) · `GestaoPermutasService.test.ts` (568 LOC) · `IngestaoPermutasService.test.ts` (487 LOC)
- **Evidência (objetiva)**:
  ```
  $ find src/backend -name '*.test.ts' -not -path '*/node_modules/*' -exec wc -l {} \; | sort -rn | head -5
      1342 src/backend/domain/client/ConexosClient.test.ts
       908 src/backend/domain/service/permutas/EleicaoPermutasService.test.ts
       659 src/backend/routes/permutas.test.ts
       568 src/backend/domain/service/permutas/GestaoPermutasService.test.ts
       487 src/backend/domain/service/permutas/IngestaoPermutasService.test.ts
  ```
- **Impacto técnico**: tempo de leitura/edição do test file vira o gargalo. `EleicaoPermutasService` tem 25 `it()` em um único `describe` — sem agrupamento por método público.
- **Impacto de negócio**: novo dev leva 2 dias para entender o teste antes de mexer no service; deveria levar 2 horas.
- **Métrica de baseline**: 5 test files > 500 LOC. Alvo: 0 test files > 500 LOC (split por método público ou por sub-comportamento).

### F-testability-8: Public methods sem `describe` dedicado

- **Severidade**: P2 (médio — viola convenção CLAUDE.md "test the service layer")
- **Tactic violada**: Specialized Interfaces (teste reflete a interface pública)
- **Localização**: `AlocacaoPermutasService.test.ts` (1 `describe` top-level para 3 métodos públicos: `buscarInvoices`, `alocar`, `remover`)
- **Evidência (objetiva)**:
  ```
  $ grep "describe(" src/backend/domain/service/permutas/AlocacaoPermutasService.test.ts
  describe('AlocacaoPermutasService', () => {
  $ grep -c "public " src/backend/domain/service/permutas/AlocacaoPermutasService.ts
  3
  ```
  Padrão preferível: `describe('AlocacaoPermutasService.alocar', …)` etc., para que falhas batam direto no método.
- **Impacto técnico**: `--testNamePattern "alocar"` filtra mal; rastreabilidade do failure → método é manual.
- **Impacto de negócio**: tempo de triagem de falha aumenta. Não crítico, mas multiplica por todas as suites grandes.
- **Métrica de baseline**: 1 `describe` por suite; 3 métodos públicos sem `describe` dedicado em `AlocacaoPermutasService`. Repetido em outros services. Alvo: ratio 1:1 `describe` por método público.

### F-testability-9: `fast-check` declarado como dep mas não instalado / não usado

- **Severidade**: P3 (baixo — oportunidade de invariante monetário forte perdida)
- **Tactic violada**: Executable Assertions (property-based como amplificador)
- **Localização**: `src/backend/package.json` + `src/frontend/package.json`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "fast-check" src/{backend,frontend}/package.json  # nada
  $ grep -rn "fc\." src/backend --include='*.test.ts'  # nada
  ```
  Briefing mencionava fast-check como dep; não consta. Invariantes naturais para PBT: (a) Σ alocações ≤ adto.valor; (b) greedy(N) é idempotente; (c) `jaAlocado` + `saldoRestante` = `valorTotal` para qualquer permutação de entradas.
- **Impacto técnico**: regras financeiras (greedy, alocação N:M) testadas só por casos curados — gaps de cobertura combinatória.
- **Impacto de negócio**: bug de arredondamento ou off-by-one em `saldoRestante` (afeta dinheiro) escaparia. PBT pegaria.
- **Métrica de baseline**: 0 PBT. Alvo: ≥ 3 propriedades para `AlocacaoPermutasService` + `IngestaoPermutasService` (greedy).

## 5. Cards Kanban

### [testability-1] Sandboxar `EnvironmentProvider.test.ts` (zerar dependência do `.env` local)

- **Problema**
  > A suite passa no CI e falha no dev (`expect(Number.isNaN(env.conexosFilCod)).toBe(true)` recebe `7` do `.env` local). Causa: `GetLocalEnvironmentVars` chama `dotenv.config()` que re-popula `process.env` depois do `beforeEach` limpar. O teste perde o significado: dois ambientes, dois resultados.

- **Melhoria Proposta**
  > Mover `dotenv.config()` para o boot do app (`index.ts`), fora de `EnvironmentProvider`. No teste, monkey-patch `dotenv.config` para no-op (`jest.mock('dotenv', () => ({ config: jest.fn() }))`). Alternativa equivalente: injetar um `DotenvLoader` no construtor de `EnvironmentProvider` e mockar nos testes. Aplica a Bass tactic **Sandbox**.

- **Resultado Esperado**
  > Suite verde em qualquer máquina, com ou sem `.env`. Sinal "verde local = verde CI" restaurado.

- **Tactic alvo**: Sandbox (Limit Non-Determinism)
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Testes ambientais: 1/374 → 0/374
  - `EnvironmentProvider.test.ts` passa em máquina com `CONEXOS_FIL_COD` setado no `.env`: ❌ → ✅
- **Risco de não fazer**: dev gasta dia debugando teste fantasma; pior, mascara regressão real assumindo ser problema local.
- **Dependências**: nenhuma

### [testability-2] Extrair lógica testável de `app/permutas/page.tsx` (2127 LOC) para `lib/`

- **Problema**
  > O arquivo monstro contém `useTabelaFiltro` (hook genérico filtro+paginação), `formatRunWhen` (timezone-aware), cálculo de `jaAlocadoInvoice`, distribuição greedy display — tudo testável, nada testado. Coverage real do arquivo: 0% (e o jest config nem o instrumenta).

- **Melhoria Proposta**
  > (1) Mover `formatRunWhen` para `lib/dates.ts` + teste com `Intl` fixado em UTC/BRT/JST (espelhar `lib/utils.test.ts` que já faz `describe.each(['UTC','America/Sao_Paulo','Asia/Tokyo'])`). (2) Mover `useTabelaFiltro` para `lib/hooks/useTabelaFiltro.ts` + teste com `@testing-library/react`'s `renderHook` cobrindo filtro/busca/paginação. (3) Mover cálculo de `jaAlocadoInvoice` para `lib/permutas/alocacaoMath.ts` puro. Aplica tactic **Limit Structural Complexity** (decompor para tornar testável).

- **Resultado Esperado**
  > `app/permutas/page.tsx`: 2127 LOC → ≤ 1400 LOC. Lógica extraída coberta a 100%. Bug de paginação ou de saldo capturado em milissegundos.

- **Tactic alvo**: Limit Structural Complexity + Specialized Interfaces
- **Severidade**: P0
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-2, F-testability-3
- **Métricas de sucesso**:
  - LOC do `page.tsx`: 2127 → ≤ 1400
  - Testes para `useTabelaFiltro`/`formatRunWhen`/`jaAlocadoInvoice`: 0 → ≥ 12 cases
  - Cobertura efetiva de FE (após card-3 também): 16% → ≥ 50%
- **Risco de não fazer**: cada `/feature-tweak` que tocar permutas vira deploy às cegas; bug visual passa por code review e quebra no demo do cliente.
- **Dependências**: testability-3 (precisa do `collectCoverageFrom` para medir o ganho)

### [testability-3] Configurar `collectCoverageFrom` no frontend e recalibrar `coverageThreshold`

- **Problema**
  > `src/frontend/jest.config.js` não tem `collectCoverageFrom`. Jest mede só o que os testes importam (~10 arquivos), reportando 82.19%. Cobertura efetiva do FE é ~16% (10/196 `.tsx`). O gate de CI é satisfeito por um subconjunto arbitrário — gerência decide risco com número falso.

- **Melhoria Proposta**
  > Adicionar `collectCoverageFrom: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', '!**/*.d.ts', '!**/node_modules/**']`. Rodar coverage, recalibrar `coverageThreshold.global` para o baseline real (ex.: 20/15/20) e tratar como floor a subir. Aplica tactic **Executable Assertions** ao próprio gate de CI.

- **Resultado Esperado**
  > Coverage reportada = coverage real. Floors significam algo. Adicionar 100 LOC sem teste passa a *baixar* o número.

- **Tactic alvo**: Executable Assertions (no gate de CI)
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - `collectCoverageFrom` configurado: ❌ → ✅
  - % lines reportado vs. real: 82.19% (10 arquivos) → ~16-20% (196 arquivos), com plano de subir
  - Floors atuais (75/40/55) → calibrados ao real (provavelmente 18/10/15 inicial), subindo a cada PR
- **Risco de não fazer**: decisão de risco baseada em métrica falsa por mais 6 meses; cobertura efetiva continua sumindo enquanto reportada parece estável.
- **Dependências**: nenhuma (mas habilita testability-2 medir ganho)

### [testability-4] Introduzir `ClockProvider` injetável e usar `jest.useFakeTimers` nos services

- **Problema**
  > 10 sítios em 5 services usam `new Date()` / `Date.now()` direto. Asserções sobre `durationMs`, `finishedAt`, "snapshot ≤ 24h" não podem ser exatas — só `expect.any(Number)`. Bug de cálculo de duração escapa.

- **Melhoria Proposta**
  > Criar `domain/libs/clock/ClockProvider.ts` (`@singleton @injectable`, método `now(): Date`). Refatorar `IngestaoPermutasService`, `EleicaoPermutasService`, `PainelService`, `AgingService`, `LogService` para receberem `ClockProvider` via DI. Nos testes, mockar com `{ now: () => new Date('2026-06-22T17:00:00Z') }`. Aplica tactic **Limit Non-Determinism**. Cross-QA: também melhora **Modifiability** (todo código fica preparado para timezone e relógio configurável por tenant).

- **Resultado Esperado**
  > Asserções exatas de `durationMs` e `finishedAt`. Testes de "snapshot stale" determinísticos.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - `new Date()`/`Date.now()` em src/ (BE): 10 → 0
  - Testes assertando `durationMs` exato: 0 → ≥ 5
  - Suites com `useFakeTimers`: 0 → ≥ 5
- **Risco de não fazer**: bug em `PainelService.ts:60` (snapshot age) só descoberto quando analista trabalhar com dado velho em produção; impacto financeiro direto.
- **Dependências**: nenhuma

### [testability-5] Gravar fixtures de payload do Conexos (Recordable Test Cases)

- **Problema**
  > `ConexosClient.test.ts` (1342 LOC) monta payloads inline a cada teste. Sem `__fixtures__/`, mudanças de schema do `fin010` / `com298` só são percebidas em produção. Não há contrato versionável.

- **Melhoria Proposta**
  > Criar `domain/client/__fixtures__/conexos/` com `fin010-pendentes.json`, `fin010-baixados.json`, `com298-titulos.json` (sanitizados, ≤ 10 registros cada). Refatorar testes para `const fixture = require('./__fixtures__/conexos/fin010-pendentes.json')`. Adicionar script `scripts/refresh-fixtures.ts` que regrava contra Conexos de dev (com flag manual). Aplica tactic **Recordable Test Cases**. Cross-QA: também serve de **contract test** para Integrability.

- **Resultado Esperado**
  > Quando Conexos mudar um campo, atualizar 1 fixture quebra N testes na mesma direção → mudança óbvia. ConexosClient.test.ts encolhe.

- **Tactic alvo**: Recordable Test Cases
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - Fixtures gravadas: 0 → ≥ 3
  - `ConexosClient.test.ts` LOC: 1342 → ≤ 800
  - Tempo de adaptar a uma mudança de schema do Conexos: dias → ≤ 1h
- **Risco de não fazer**: SISPAG e Popula GED replicam o anti-padrão; custo de manutenção do client cresce linearmente.
- **Dependências**: nenhuma

### [testability-6] Reativar integration tests com Postgres real para repositórios

- **Problema**
  > `jest.config.cjs` ignora `*.integration.test.ts`, e nenhum arquivo existe. SQL ricos de `PermutaRelationalRepository` (524 LOC) e `PermutaSnapshotRepository` (320 LOC) só são validados via mock do pool. Sintaxe pode estar quebrada e o teste passa.

- **Melhoria Proposta**
  > (1) Criar `docker-compose.test.yml` com `postgres:16` (porta efêmera). (2) Adicionar `npm run test:integration` que faz: `compose up → migrations → jest --testPathPattern='integration'` → `compose down`. (3) GH Actions job paralelo (`backend-integration`) usando `services: { postgres: image: postgres:16 }`. (4) Escrever 1 `*.integration.test.ts` por repository (5 mínimo) exercitando os queries mais complexos (alocação N:M, listAtivos). Aplica tactic **Sandbox**. Cross-QA: também alimenta **Fault Tolerance** (testa rollback de tx).

- **Resultado Esperado**
  > Bug de SQL pego no CI antes do merge.

- **Tactic alvo**: Sandbox
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - Integration tests: 0 → ≥ 5 (1 por repository)
  - SQL bugs detectados em CI vs. prod (proxy: número de hotfixes de SQL): linha de base a coletar
  - Job CI `backend-integration` verde: ❌ → ✅
- **Risco de não fazer**: bug em `UPDATE` da alocação (data loss financeiro) escapa para produção.
- **Dependências**: testability-3 (config de CI já está em forma quase pronta para receber mais jobs)

### [testability-7] Quebrar test files > 500 LOC por método público

- **Problema**
  > 5 test files > 500 LOC. `ConexosClient.test.ts` (1342), `EleicaoPermutasService.test.ts` (908), `routes/permutas.test.ts` (659) etc. `AlocacaoPermutasService.test.ts` tem 1 único `describe` para 3 métodos públicos. Triagem de falha é manual.

- **Melhoria Proposta**
  > Para cada service com > 1 método público, criar 1 `describe` por método (`describe('AlocacaoPermutasService.alocar', …)` etc.). Quando o test file passar de 500 LOC, splittar por método em arquivos separados (`AlocacaoPermutasService.alocar.test.ts`). Combinar com card testability-5 (fixtures) que automaticamente encolhe `ConexosClient.test.ts`. Aplica tactic **Limit Structural Complexity** no próprio teste.

- **Resultado Esperado**
  > `--testNamePattern "alocar"` filtra com precisão. Triagem de failure → método é instantânea.

- **Tactic alvo**: Limit Structural Complexity
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-7, F-testability-8
- **Métricas de sucesso**:
  - Test files > 500 LOC: 5 → 0
  - `describe`/método público ratio: ~0.3 → 1.0
- **Risco de não fazer**: onboarding de novo dev fica em 2 dias por feature; deveria ser 2 horas.
- **Dependências**: testability-5 ajuda no `ConexosClient.test.ts`

### [testability-8] Property-based testing para invariantes monetários (instalar fast-check)

- **Problema**
  > Regras financeiras críticas testadas só por casos curados: greedy de `IngestaoPermutasService` (1408 case), alocação N:M com `saldoRestante`. Bug de arredondamento / off-by-one (afeta dinheiro) escaparia. `fast-check` não está sequer instalado.

- **Melhoria Proposta**
  > `npm i -D fast-check`. Escrever ≥ 3 properties: (a) `∀ alocações: Σ valorParcial ≤ adto.valorTotal`; (b) `∀ runs greedy(N): jaAlocado + saldoRestante = valorTotal`; (c) `∀ permutações de invoices: greedy é idempotente`. Aplica tactic **Executable Assertions** amplificada. Cross-QA: também melhora **Security** (invariante = controle integridade).

- **Resultado Esperado**
  > Bug aritmético em dinheiro detectado por geração automática de cases.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-9
- **Métricas de sucesso**:
  - Properties escritas: 0 → ≥ 3
  - `fast-check` instalado: ❌ → ✅
- **Risco de não fazer**: bug financeiro detectável estatisticamente passa por casos curados; impacto direto em conciliação.
- **Dependências**: nenhuma

## 6. Notas do agente

- **Conexões cross-QA**: testability-4 (ClockProvider) é Modifiability-também; testability-5 (fixtures) é Integrability-também (contract tests); testability-6 (integration tests) é Fault-Tolerance-também (testa rollback de tx). testability-3 (collectCoverageFrom) afeta Deployability porque hoje o gate de cobertura é falso e qualquer regressão passa silenciosa para o deploy hook do Render.
- **Métrica que tentei medir e falhei**: taxa de flake em CI. Requer `gh run list --limit 100 --json conclusion,headSha,workflowName` em janela móvel. Recomendação: adicionar como Deployability metric.
- **Decisão de escopo**: tratei o legado `backend/services/conexos.ts` (33% lines) como débito documentado em `migration-debt.md` — não abri card próprio porque a substituição já está em curso pelo `domain/client/ConexosClient.ts`. Mantive como evidência de gradação realista da nota geral (6.5).
- **Falha observada nesta run**: a suite BE *de fato* falhou 1/374 nesta máquina por causa da F-testability-1 — esta é evidência viva, não hipotética.
- **Nota geral 6.5**: BE service+repo está em excelente forma (96/79); FE e Sandbox/Non-Determinism puxam para baixo. Com cards testability-1/2/3/4 implementados, nota subiria para ~8.5.
