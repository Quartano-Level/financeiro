---
qa: Testability
qa_slug: testability
run_id: 2026-07-07-1841-sispag-painel-montagem
agent: qa-testability
generated_at: 2026-07-07T18:41:00-03:00
scope: backend
score: 5.0
findings_count: 11
cards_count: 7
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/QA revisando a Fatia 2 do SISPAG (montagem+gate) | Mudança em qualquer camada nova (`routes/sispag.ts`, `LotePagamentoRepository`, `ConexosSispagClient`, `LotePagamentoService`) precisa ser validada antes do merge | Novo agregado `lote_pagamento` + máquina de estados (RASCUNHO → FINALIZADO → CANCELADO/RASCUNHO) + optimistic lock (I6) + advisory lock (I3) | Feature branch `feat/sispag-painel-montagem` prestes a virar PR, CI (`npm test -- --coverage`) obrigatório | Cada invariante (I2/I3/I4/I5/I6) e cada rota mutadora tem um teste que quebra ao regredir; SQL do optimistic lock é exercitado ao menos uma vez; contrato `fin064` é congelado num fixture | Coverage por camada ≥ alvo (svc 88% lines; repo 70%; routes 60%); 100% das transições da SM cobertas; CI verde na branch |

Bass: o custo de mudar essa Fatia amanhã é multiplicado por quão bem os testes prendem os invariantes hoje. A Fatia 2 introduz WRITE em Postgres próprio + máquina de estados + concorrência (dois analistas) — a barra de testabilidade sobe em relação à Fatia 1 (read-only), e não subiu com ela.

## 2. Métricas observadas

### 2.1 Cobertura por camada — MÉTRICA #1 (Bass)

Coleta: `cd src/backend && npm test -- --coverage --collectCoverageFrom='routes/sispag.ts' --collectCoverageFrom='domain/repository/sispag/**' --collectCoverageFrom='domain/service/sispag/**' --collectCoverageFrom='domain/client/ConexosSispagClient.ts'`

| Arquivo (camada) | % Stmts | % Branch | % Funcs | % Lines | Uncovered | Precedente Permutas |
|---|---|---|---|---|---|---|
| `routes/sispag.ts` (route) | **0** | **0** | **0** | **0** | 1-204 | `routes/permutas.ts`: 70.97% lines |
| `domain/repository/sispag/LotePagamentoRepository.ts` | **12.5** | **0** | **0** | **10.86** | 52-242 | `repository/permutas/`: 93.42% lines / 87.85% funcs |
| `domain/client/ConexosSispagClient.ts` | 20.96 | **0** | **0** | 20 | 30,35,87-238 | outros `Conexos*Client`: 100% funcs em `ConexosSubClients.test.ts` |
| `domain/service/sispag/LotePagamentoService.ts` | 82.65 | 83.33 | **66.66** | 82.97 | 44-51, 55, 149, 155-179, 186, 250, 263 | `service/permutas`: 94.59% lines / 96.78% funcs |
| `domain/service/sispag/SispagPainelService.ts` | **0** | **0** | **0** | **0** | 1-140 | `service/permutas/PainelService.ts`: 93.93% lines |
| `frontend/app/sispag/page.tsx` (685 LOC) | — | — | — | — | não medível | app/permutas/**: tem componentes testados |

O único artefato SISPAG com defesa real via testes é o `LotePagamentoService` (13 casos, 82.65% lines) — todos os outros estão abaixo de 21%. O que hoje passa por "verde" no service é apenas 3 de 8 métodos públicos com `describe`.

### 2.2 Métricas de execução

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Testes backend totais | 518 (46 suites, 9.2s) | ≥518, tempo <60s | ✅ | `npm test` |
| Ratio testes/fonte backend | 46 / 237 = **19.4%** | ≥50% | ⚠️ | `find src/backend -name '*.test.ts' \| wc -l` |
| Ratio testes/fonte SISPAG | 1 / 5 = **20%** (só o service) | ≥60% no service+repo+client+route | ❌ | `ls src/backend/**/sispag/` |
| Ratio testes/serviços SISPAG | 1 / 2 = **50%** (falta `SispagPainelService`) | 100% | ❌ | `ls domain/service/sispag/` |
| Ratio testes/repositórios SISPAG | 0 / 1 = **0%** | 100% | ❌ | `ls domain/repository/sispag/` |
| Ratio testes/clients SISPAG | 0 / 1 = **0%** | 100% | ❌ | `ls domain/client/ConexosSispag*` |
| Ratio testes/rotas SISPAG | 0 / 1 = **0%** | 100% | ❌ | `ls src/backend/routes/sispag*` |
| Métodos públicos do `LotePagamentoService` com `describe` | **3 / 8** (`incluirTitulo`, `finalizarLote`, `reabrir/cancelar` compartilham block) | 8 / 8 | ⚠️ | `LotePagamentoService.test.ts` |
| Transições da SM cobertas | 3 / 4 (falta `FINALIZADO→CANCELADO`, e rejeição de `reabrir/cancelar` em estado terminal ou versão conflitante) | 4/4 + 4 rejeições | ⚠️ | `ontology/state-machines/lote-pagamento.md` vs test file |
| CI coverage gate (global) | **functions 77.72% < 78%** | ≥78% | ❌ **CI red** | `src/backend/jest.config.cjs:38` |
| DI seam / constructor injection | ✅ (`new LotePagamentoService(repo, conexos, db, log)`) | mesmo padrão | ✅ | `LotePagamentoService.test.ts:76-81` |
| Fixtures Conexos (`fin064` row para `getTituloAPagar`) | ❌ ausente | ≥1 fixture por endpoint | ❌ | `find src/backend -path '*sispag*fixture*'` (vazio) |
| Integration tests contra Postgres (advisory-lock, tx) | 0 | ≥1 para `incluirTitulo` concorrente | ❌ | `grep -rn "describe(.integration:" src/backend` (vazio) |
| Non-determinism no serviço SISPAG | `Date.now()` em `SispagPainelService.ts:42`; `randomUUID()` em `LotePagamentoRepository.ts:87` — ambos não injetáveis | 0 | ⚠️ | `grep -n "Date.now\|randomUUID" domain/{service,repository}/sispag/**` |
| CI gate coverage por camada | não configurado — só `global` + `./domain/service/` | thresholds por `repository/`, `client/`, `routes/` | ⚠️ | `src/backend/jest.config.cjs:34-44` |

> ⚠️ **Não medível localmente**: cobertura visual do modal de montagem (frontend `app/sispag/page.tsx`). Nenhum teste `.test.tsx` foi criado. Recomendação: `@testing-library/react` + mock de `apiFetch` (mesmo padrão de `app/permutas/**`).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** — testar via DI seam | Constructor injection direto (`new LotePagamentoService(repo, conexos, db, log)`), sem `container.resolve` no teste | ✅ presente no service | `LotePagamentoService.test.ts:76-81` |
| **Specialized Interfaces** — mocks tipados | `buildRepo()` retorna `RepoMock` com `jest.Mock` por método; mesma abordagem de `PermutaExecucaoRepository.test.ts:5-11` | ✅ presente no service | `LotePagamentoService.test.ts:48-70` |
| **Recordable Test Cases** — fixtures para o cliente Conexos | Sem fixture do payload `fin064/list` que alimente `getTituloAPagar` num teste; nenhum snapshot de linha crua | ❌ ausente | `find src/backend -path '*sispag*fixture*'` (vazio); precedente Permutas: `siglaMoedaNegociada` testado em `ConexosSubClients.test.ts:46-64` |
| **Sandbox** — DB isolado para exercer SQL | `LotePagamentoRepository` não tem NENHUM teste — SQL do optimistic lock (`WHERE id=$id AND versao=$versaoEsperada AND status=ANY($de)`) nunca é executado em nenhum teste | ❌ ausente | `LotePagamentoRepository.ts:243-258`; precedente Permutas usa mock do `PostgreeDatabaseClient` em `PermutaExecucaoRepository.test.ts` |
| **Sandbox** — advisory-lock + transação | O mock `buildDb()` sempre "adquire" o lock e a `withTransaction` roda inline. A defesa contra a race de I3 (dois analistas incluindo o MESMO título simultaneamente) não é exercitada nem em unit nem em integração | ❌ ausente | `LotePagamentoService.test.ts:42-46`; o path `onBusy` (`LotePagamentoService.ts:147-150`) fica sem cobertura |
| **Executable Assertions** — invariantes I2/I3/I4/I5/I6 no service | Cada invariante tem ≥1 caso negativo; I5 tem "vazio"; I6 tem "conflito de versão" | ✅ presente (parcial) | `LotePagamentoService.test.ts:89-134,179-211` |
| **Executable Assertions** — cobertura completa das transições da SM | 3 de 4 transições ativas (falta assertar que `cancelarLote` de `FINALIZADO` funciona — o test só verifica `para: 'CANCELADO'`, sem cobrir `de: [RASCUNHO, FINALIZADO]` na prática de uma execução real) e 2 de ≥5 rejeições | ⚠️ parcial | `LotePagamentoService.test.ts:214-236` |
| **Abstract Data Sources** — ERP (Conexos) abstraído no service | `ConexosSispagClient` injetado; `getTituloAPagar` mockado por caso | ✅ presente | `LotePagamentoService.test.ts:72-83` |
| **Abstract Data Sources** — Clock/ID injetáveis | `Date.now()` inline em `SispagPainelService.ts:42`; `randomUUID()` inline em `LotePagamentoRepository.ts:87`. Nenhum `ClockProvider` no repo (mesmo débito de `EleicaoPermutasService.ts:233`) | ❌ ausente | `grep -n "Date.now\|randomUUID" src/backend/domain/{service,repository}/sispag/**` |
| **Limit Structural Complexity** — arquivos pequenos e coesos | `LotePagamentoService` 294 LOC (bom); `LotePagamentoRepository` 259 LOC (bom); `routes/sispag.ts` 204 LOC (bom); `frontend/app/sispag/page.tsx` **685 LOC** (grande — mesma comorbidade que `app/permutas/**` teve antes do split CC-1) | ⚠️ parcial | `wc -l` |
| **Limit Non-Determinism** — Time freezing | Não há `jest.useFakeTimers` em nenhum teste SISPAG; o `SispagPainelService.montarPainel` lê `Date.now()` para KPIs — impossível testar valores exatos de "a vencer 7d" sem congelar o clock | ❌ ausente | `SispagPainelService.ts:42` + ausência de teste |
| **Limit Non-Determinism** — Randomness | `randomUUID()` no repositório é ok para o SQL mas o valor retornado do lote é opaco — a fixture do lote nos testes usa `id: 'L1'` fixo (bom) | ✅ ok no service | `LotePagamentoService.test.ts:14-22` |
| **Limit Non-Determinism** — Network in unit tests | Nenhum `axios`/`fetch` real; `ConexosSispagClient.getTituloAPagar` mockado | ✅ presente | `LotePagamentoService.test.ts:72-75` |
| **CI Coverage Gate** | `coverageThreshold.global.functions = 78` — **hoje: 77.72% (❌ red)**; sem threshold por-camada em `repository/` ou `routes/` | ❌ regressão | `src/backend/jest.config.cjs:34-44` + run atual do `npm test -- --coverage` |

## 4. Findings (achados)

### F-testability-1: `LotePagamentoRepository` sem teste — 12.5% lines, 0% branches, 0% functions

- **Severidade**: **P0**
- **Tactic violada**: Sandbox / Specialized Interfaces
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:52-242` (uncovered range de todos os métodos exceto o construtor)
- **Evidência (objetiva)**:
  ```
  backend/domain/repository/sispag  |    12.5 |        0 |       0 |   10.86 |
    LotePagamentoRepository.ts       |    12.5 |        0 |       0 |   10.86 | 52-242
  ```
  Precedente: `backend/domain/repository/permutas | 93.42 | 58.24 | 87.85 | 96.91` (`ClienteFiltroRepository.test.ts`, `PermutaAlocacaoRepository.test.ts`, `PermutaExecucaoRepository.test.ts`, `PermutaProcessamentoRepository.test.ts`, `PermutaRelationalRepository.test.ts`, `PermutaSnapshotRepository.test.ts`).
- **Impacto técnico**: NENHUM teste exercita o SQL de:
  1. `transicionarStatus` (linhas 231-258) — o UPDATE que enforça o **optimistic lock (I6)** (`WHERE id = $id AND versao = $versaoEsperada AND status = ANY($de)`). Uma alteração no SQL (ex: remover `AND versao = $versaoEsperada` por acidente) passa CI **sem quebrar nada** — o `LotePagamentoService.test.ts` mocka `transicionarStatus.mockResolvedValue(0)` para o caso de conflito, então não vê o SQL.
  2. `loteRascunhoComTitulo` (linhas 152-166) — a query que detecta I3 (título já em outro lote RASCUNHO). Uma quebra aqui devolve `null` sempre → **I3 furada silenciosamente**.
  3. `adicionarItem` (linhas 168-197) — `ON CONFLICT (lote_id, fil_cod, doc_cod, tit_cod) DO NOTHING` — se o UNIQUE constraint sumir, o serviço-idempotente-por-lote também some.
  4. `contarItens`, `tocarLote`, `criarLote`, `getLoteComItens`, `listLotes` — todos os reads/writes de estado.
- **Impacto de negócio**: Regressão silenciosa em I6 = dois analistas conseguem finalizar o mesmo lote (dupla dispatch para SISPAG na Fatia 3). Regressão em I3 = dois lotes RASCUNHO com o mesmo título → duplicação do pagamento quando os dois forem processados. Ambos são cenários de **perda financeira direta** — a razão de a feature existir é evitar exatamente isso.
- **Métrica de baseline**: LotePagamentoRepository **0% branches / 0% functions** vs alvo 70% branches / 80% functions do precedente Permutas.

### F-testability-2: `routes/sispag.ts` sem teste de rota — 0% (204 linhas)

- **Severidade**: **P1**
- **Tactic violada**: Specialized Interfaces (Handler seam) / Executable Assertions
- **Localização**: `src/backend/routes/sispag.ts:1-204`
- **Evidência (objetiva)**:
  ```
   routes                        |       0 |        0 |       0 |       0 |
    sispag.ts                    |       0 |        0 |       0 |       0 | 1-204
  ```
  Precedente: `src/backend/routes/permutas.test.ts` (921 LOC, 37 casos) cobre auth, requireRole, Zod, mapping de HandlerError.
- **Impacto técnico**:
  - `requireRole('admin')` (linhas 102, 119, 144, 171) sem teste → uma queda desse decorador em qualquer rota abre write endpoints para role `analista`/`user`.
  - `respondLoteError` (linhas 41-51) mapeia `HandlerError` → HTTP (409 versão-conflito, 422 estado inválido, 409 título em outro lote). Nenhum teste garante que `LoteVersaoConflitoError.retryable=true` é serializado; o front lê `retryable` para decidir se re-tenta.
  - Zod schemas (`criarLoteSchema`, `incluirTituloSchema`, `versaoSchema`) rejeitam entradas inválidas — o comportamento 400 não é fixado; regressões silenciosas em `z.coerce.number().int().positive()` viram vulnerabilidade (ex: aceitar `filCod=0`).
  - `ator(req)` (linha 38) — se o middleware de auth falhar em popular `req.user`, o audit log persiste `'unknown'` como ator. Não há teste.
- **Impacto de negócio**: Escalada de privilégio (rota mutadora abrindo para não-admin), regressão de UX (retry loop no front por 409 mal mapeado), audit-trail podre (`ator = 'unknown'`) em compliance.
- **Métrica de baseline**: `routes/sispag.ts` **0% lines** vs `routes/permutas.ts` **70.97% lines** e 37 casos de teste.

### F-testability-3: `LotePagamentoService` — 4 de 8 métodos públicos sem `describe`, `removerTitulo` 100% descoberto

- **Severidade**: **P1**
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:43-58, 154-180`; teste: `LotePagamentoService.test.ts` (13 casos, 3 `describe`)
- **Evidência (objetiva)**:
  ```
  LotePagamentoService.ts | 82.65 | 83.33 | 66.66 | 82.97 | 44-51,55,149,155-179,186,250,263
  ```
  Métodos públicos: `criarLote`, `listarLotes`, `getLote`, `incluirTitulo`, `removerTitulo`, `finalizarLote`, `reabrirLote`, `cancelarLote` (**8**). Métodos com `describe` ou `it` dedicado: `incluirTitulo`, `finalizarLote`, `reabrirLote`, `cancelarLote` — mas `criarLote` (44-51), `listarLotes` (55), **`removerTitulo` inteiro (155-179)** e o guarda `removerTitulo` em não-RASCUNHO (186) estão sem qualquer caso de teste.
  - Linha 149 (`onBusy` do `withAdvisoryLock`) — o path de conflito da race de I3 — está descoberta.
  - Linha 250 (`LoteEstadoInvalidoError` após transição rejeitada com versão correta) — o path que distingue conflito-de-versão de estado-errado — está descoberta.
  - Linha 263 (`exigirLote` → "inexistente") — está descoberta.
- **Impacto técnico**: `removerTitulo` chama `db.withTransaction(tx → repo.removerItem + repo.tocarLote)` e `audit`. Um refactor que trocar a ordem (audit antes de commit) passa CI. O usuário remove um título, a UI re-lê o lote e o item ainda está lá até o commit — sem teste que force esse cenário.
- **Impacto de negócio**: `removerTitulo` é o dual de `incluirTitulo` no fluxo da analista — um analista que remove um título aprovado por engano, se a operação falhar silenciosamente ou for parcialmente aplicada, executa o pagamento na Fatia 3.
- **Métrica de baseline**: `LotePagamentoService` **66.66% functions** vs alvo 80% e precedente `service/permutas` **96.78% functions**. Métodos com describe: **3/8 = 37.5%** vs alvo 100%.

### F-testability-4: CI coverage gate RED — `functions 77.72% < 78%`

- **Severidade**: **P1**
- **Tactic violada**: CI Gate / Deployability crossover
- **Localização**: `src/backend/jest.config.cjs:38` (`global.functions: 78`); run atual: `Jest: Coverage for functions (77.72%) does not meet "global" threshold (78%)`
- **Evidência (objetiva)**:
  ```
  Jest: Coverage for functions (77.72%) does not meet "global" threshold (78%)
  Test Suites: 46 passed, 46 total
  Tests:       518 passed, 518 total
  ```
  Antes da branch: `global.functions ≥ 78%` (o próprio jest.config comenta a calibração). A introdução de 5 arquivos com 0-20% de funções cobertas puxou a média para baixo do gate.
- **Impacto técnico**: `.github/workflows/ci.yml` roda `npm test -- --coverage` (linhas 27 e 46). O gate estoura em CI → **PR não pode ser mergeada com verdes** sem drop do threshold OU sem novos testes.
- **Impacto de negócio**: a proteção que o time acredita ter (a base de "cada função da linha crítica tem pelo menos uma chamada em teste") deixa de existir. Este é o número que o Bass exige como cardinal.
- **Métrica de baseline**: **77.72% funções globais** vs floor 78% (delta -0.28pp). Especificamente, `LotePagamentoRepository` contribui com **0/N** funções cobertas, `SispagPainelService` **0/N**, `ConexosSispagClient` **0/N** — todo o novo código.

### F-testability-5: `ConexosSispagClient` — nenhum teste, fallback try/catch dead code

- **Severidade**: **P2**
- **Tactic violada**: Recordable Test Cases (fixtures) / Executable Assertions
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:30, 35, 87-238`; especialmente o fallback em `listTitulosAPagar` (linhas 120-135)
- **Evidência (objetiva)**:
  ```
  ConexosSispagClient.ts | 20.96 | 0 | 0 | 20 | 30,35,87-238
  ```
  Nenhum fixture de payload `fin064/list`, `fin015/list` ou `fin010/list` existe em `src/backend/**/__fixtures__/` ou `**/*.fixture.*`. O precedente é `ConexosSubClients.test.ts` que constrói um `LegacyConexosShape` mockado e valida cada método público.
- **Impacto técnico**:
  - `getTituloAPagar` é a **fonte de verdade autoritativa para I2** (elegibilidade) — se o schema Zod ficar tolerante demais (o código usa `.catch(undefined)` e `.catch(false)` em quase todos os campos), um payload malformado passa como "título liberado" silenciosamente. Nenhum teste prende esse comportamento.
  - O fallback try/catch em `listTitulosAPagar` (linhas 120-135) — retentativa sem filtros quando o Conexos rejeita o filtro server-side — é um caminho de recuperação NÃO exercitado; se ele quebrar, o painel do dia ainda funciona mas com stragglers.
- **Impacto de negócio**: I2 pode ser furada por payload malformado (título "não liberado" tratado como liberado por Zod `.catch(false)` em `vldLib`), levando pagamento indevido; o fallback do painel pode degradar silenciosamente.
- **Métrica de baseline**: ConexosSispagClient **0% functions** vs precedente 100% em `ConexosSubClients.test.ts`.

### F-testability-6: `SispagPainelService` — 0% coverage, KPIs deterministas puros sem teste

- **Severidade**: **P2**
- **Tactic violada**: Executable Assertions / Limit Non-Determinism
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:1-140`
- **Evidência (objetiva)**:
  ```
  SispagPainelService.ts | 0 | 0 | 0 | 0 | 1-140
  ```
  Funções puras candidatas a teste direto: `prepararTitulos` (linhas 108-118), `calcularKpis` (linhas 123-143), `ordenarLotes` (linhas 120-121). Todas determinísticas dado o input.
  `Date.now()` inline em linha 42 (`const now = Date.now()`) → `diasAteVencimento` e KPIs `titulosAVencer7d/30d/vencidos` não podem ser testados com valor exato sem congelar o clock (`jest.useFakeTimers`).
- **Impacto técnico**: KPIs errados em algum edge case (título com `vencimento` no dia zero, `liberado=false && !pago`) passam despercebidos. O painel é o input do analista para decidir quais títulos incluir no lote.
- **Impacto de negócio**: analista prioriza pagamentos errado (título "urgente" em vermelho quando não é, ou não vê um vencido) — o painel deixa de defender o valor que promete entregar.
- **Métrica de baseline**: `SispagPainelService` **0%** vs precedente `PainelService.ts` (Permutas) **93.93% lines**.

### F-testability-7: Advisory-lock + transação (I3) — testabilidade estruturalmente impossível hoje

- **Severidade**: **P1**
- **Tactic violada**: Sandbox / Executable Assertions
- **Localização**: `src/backend/domain/service/sispag/LotePagamentoService.ts:60-152` (`incluirTitulo`); `src/backend/domain/service/sispag/LotePagamentoService.test.ts:42-46` (`buildDb()` sempre adquire o lock)
- **Evidência (objetiva)**: O mock atual:
  ```typescript
  withTransaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  withAdvisoryLock: jest.fn((_k: number, onAcquired: () => Promise<unknown>) => onAcquired()),
  ```
  → o `onBusy` NUNCA é chamado; a `withTransaction` é uma passagem inline. A defesa que o serviço promete contra a race de I3 (dois analistas incluindo o MESMO título no MESMO instante) não é testada em unit **nem** em integração. Nenhum teste `describe('integration:')` no repo (`grep -rn "describe(.integration:" src/backend --include='*.test.ts'` → vazio); nenhum `docker-compose.test.yml` sob `scripts/`.
- **Impacto técnico**: se `withAdvisoryLock` for refatorado para lançar em vez de chamar `onBusy` (ou vice-versa), o service continua verde. O SQL `pg_try_advisory_lock` do `PostgreeDatabaseClient` (linhas 137-158) não é exercitado no fluxo SISPAG por nenhum teste.
- **Impacto de negócio**: I3 é o único guarda contra duplicação de pagamento entre lotes RASCUNHO simultâneos. Se a defesa quebrar, dois lotes finalizados ao mesmo tempo pagam o mesmo título → **duplo pagamento** ao fornecedor no processamento da Fatia 3.
- **Métrica de baseline**: **0 testes de integração** vs alvo ≥1 (incluir o mesmo título com dois "atores" concorrentes → um sucesso + um `TituloEmOutroLoteError`).

### F-testability-8: Transições e rejeições da SM — cobertura ~3/7

- **Severidade**: **P2**
- **Tactic violada**: Executable Assertions
- **Localização**: `ontology/state-machines/lote-pagamento.md` vs `LotePagamentoService.test.ts:176-236`
- **Evidência (objetiva)**: A máquina modela 4 transições:
  1. RASCUNHO → FINALIZADO ✅ testada happy (`LotePagamentoService.test.ts:189-200`)
  2. FINALIZADO → RASCUNHO ✅ testada (linhas 215-226)
  3. RASCUNHO → CANCELADO ✅ testada (linhas 228-235) — mas o `de: [RASCUNHO, FINALIZADO]` NÃO tem execução com estado inicial `FINALIZADO`
  4. FINALIZADO → CANCELADO ❌ nenhum teste força `initial=FINALIZADO`
  E rejeições:
  - Finalizar vazio ✅ (I5)
  - Finalizar com versão errada ✅ (I6)
  - Reabrir de estado errado (RASCUNHO ou CANCELADO) ❌ — linha 250 uncovered
  - Cancelar de CANCELADO (terminal) ❌
  - Reabrir/cancelar com versão errada (I6 em transições não-finalizar) ❌
- **Impacto técnico**: 4 de ≥7 casos verificáveis testados. A distinção "versão-conflito vs. estado-errado" (linhas 241-254) só é exercitada pelo caminho de conflito de versão — o outro path é morto do ponto de vista dos testes.
- **Impacto de negócio**: transições ilegais (ex: reabrir um lote CANCELADO) passariam despercebidas — mesma família de "duplo pagamento" via lote inconsistente.
- **Métrica de baseline**: 3 / 4 transições + 2 / ≥5 rejeições = **~50% da SM** vs alvo 100%.

### F-testability-9: `frontend/app/sispag/page.tsx` (685 LOC) sem teste — grande, com fluxos otimistas

- **Severidade**: **P2**
- **Tactic violada**: Limit Structural Complexity / Executable Assertions
- **Localização**: `src/frontend/app/sispag/page.tsx:1-685`; `src/frontend/lib/sispag.ts:126-189`
- **Evidência (objetiva)**: 685 LOC num arquivo `page.tsx` (`wc -l`) — não há `.test.tsx` associado. O front tem 201 arquivos de teste (`find src/frontend -name '*.test.tsx' | wc -l`) mas zero cobrem SISPAG. Precedente `app/permutas/**` teve o mesmo problema e sofreu split CC-1 (commit `46773fe`).
- **Impacto técnico**: fluxo de montagem (checkbox → incluir → optimistic UI update → tratamento de 409 versão-conflito → recarrega) é a superfície visível para a analista. `loteRequest` em `lib/sispag.ts:126` lança `Error(j.error)` sem preservar `code`/`retryable` — a UI hoje não distingue "409 versão-conflito" (retryable) de "422 estado inválido" (não-retryable). Sem teste, essa perda passa despercebida.
- **Impacto de negócio**: UX ruim em edge cases de concorrência (dois analistas), com toast genérico "algo deu errado" em vez de "recarregue e tente de novo".
- **Métrica de baseline**: 0 testes vs precedente `app/permutas/**` com componentes cobertos.

### F-testability-10: Non-determinism — `Date.now()` e `randomUUID()` inline, sem Clock/UUID providers

- **Severidade**: **P3**
- **Tactic violada**: Limit Non-Determinism (cross-QA: Modifiability — clock/UUID como injetáveis)
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:42`; `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:87`
- **Evidência (objetiva)**:
  ```
  SispagPainelService.ts:42:        const now = Date.now();
  LotePagamentoRepository.ts:87:        const id = randomUUID();
  ```
  Nenhum `ClockProvider` no repo (mesmo débito de `EleicaoPermutasService.ts:233` e `PermutaSnapshotRepository.ts:96`). O time já convive com essa dívida; a Fatia 2 não a piorou nem melhorou.
- **Impacto técnico**: KPIs do painel (`diasAteVencimento`, `titulosAVencer7d`, etc.) dependem de `now`; sem `jest.useFakeTimers` nem `ClockProvider`, testes que asseram valores concretos são frágeis. O `randomUUID` do repositório é opaco no service (ID é usado só como referência), então não bloqueia unit — mas bloqueia round-trip de integração determinista.
- **Impacto de negócio**: baixo hoje (dívida herdada), mas cresce com a Fatia 3 (baixa/reconciliação por data).
- **Métrica de baseline**: 2 sites de não-determinismo em SISPAG + 3 pré-existentes em Permutas = **5** injetáveis por abstrair.

### F-testability-11: Coverage thresholds sem partição por camada nova

- **Severidade**: **P3**
- **Tactic violada**: CI Gate
- **Localização**: `src/backend/jest.config.cjs:34-44`
- **Evidência (objetiva)**: Hoje o `coverageThreshold` tem `global` + `./domain/service/`. Não há floor em `./domain/repository/`, `./domain/client/`, `./routes/`. Consequência: mesmo que se corrijam os P0/P1 acima, uma futura feature pode reintroduzir `repository/*.ts` a 0% sem quebrar CI (a diluição no `global` mascara).
- **Impacto técnico**: perda de sinal de regressão local por camada. `LotePagamentoRepository` a 0% + 10 outros repos a 90% dá um `global.functions` ainda ≥ 78%.
- **Impacto de negócio**: erosão silenciosa do gate.
- **Métrica de baseline**: 1 threshold por-diretório (`./domain/service/`) vs alvo ≥4 (`service`, `repository`, `client`, `routes`).

## 5. Cards Kanban

### [testability-1] Cobrir `LotePagamentoRepository` com teste unitário de SQL (mesmo padrão dos repos de Permutas)

- **Problema**
  > `LotePagamentoRepository` está a **12.5% lines / 0% branches / 0% functions** (F-testability-1). Nenhum teste exercita o SQL do optimistic lock em `transicionarStatus` nem a query de I3 em `loteRascunhoComTitulo`. Um refactor que remova acidentalmente `AND versao = $versaoEsperada` passa CI e destrói silenciosamente a defesa contra dupla-finalização (I6). Precedente `PermutaExecucaoRepository.test.ts` mostra como asserir o SQL parametrizado sem Postgres real.

- **Melhoria Proposta**
  > Criar `LotePagamentoRepository.test.ts` seguindo o padrão de `PermutaExecucaoRepository.test.ts:5-11` — `buildDb()` mocka `{ insert, update, selectMany, selectFirst }` com `jest.fn`; cada teste inspeciona `(db.update as jest.Mock).mock.calls[0]` para asserir o SQL (`.toContain('WHERE id = $id AND versao = $versaoEsperada AND status = ANY($de)')`) e os params. Cobrir: `criarLote`, `getLoteComItens` (com/sem itens), `listLotes` (filtro por status/filCod), `loteRascunhoComTitulo` (com hit e miss), `adicionarItem` (com `ON CONFLICT DO NOTHING`), `removerItem`, `contarItens`, `tocarLote`, `transicionarStatus` (FINALIZAR seta `finalizado_por/em`; RASCUNHO os zera; CANCELAR preserva; branch `versaoEsperada` no WHERE).

- **Resultado Esperado**
  > `LotePagamentoRepository` sobe para ≥88% lines / ≥60% branches / ≥80% functions. CI global functions passa de 77.72% para ≥78% (F-testability-4 verde). Regressão no SQL do optimistic lock passa a quebrar CI.

- **Tactic alvo**: Sandbox / Executable Assertions
- **Severidade**: P0
- **Esforço estimado**: M (2–3d)
- **Findings relacionados**: F-testability-1, F-testability-4
- **Métricas de sucesso**:
  - `LotePagamentoRepository` lines coverage: **10.86% → ≥88%**
  - `LotePagamentoRepository` functions coverage: **0% → ≥80%**
  - CI global functions: **77.72% → ≥78%**
- **Risco de não fazer**: em 6 meses, uma alteração inocente no SQL (formatar linhas, extrair helper) remove o guard de I6 sem que qualquer teste perceba → primeiro incidente de dupla-finalização em produção quando a Fatia 3 (write no ERP) entrar.
- **Dependências**: nenhuma.

### [testability-2] Criar `routes/sispag.test.ts` (auth, requireRole, Zod, mapping de HandlerError)

- **Problema**
  > `routes/sispag.ts` está a **0% em 204 linhas** (F-testability-2). `requireRole('admin')` protege 4 rotas mutadoras sem teste. `respondLoteError` mapeia `LoteVersaoConflitoError → 409`, `TituloEmOutroLoteError → 409`, `LoteEstadoInvalidoError → 422`, `TituloNaoElegivelError → 422` — o front lê `code`/`retryable` do payload para decidir se recarrega e re-tenta. Sem teste, uma regressão no mapping (statusCode 409 → 500) degrada UX sem quebrar nada.

- **Melhoria Proposta**
  > Replicar o padrão de `src/backend/routes/permutas.test.ts:1-100` (Express real via `app.listen(0)`, mock de `bootstrapAppContainer`, injeção de `LotePagamentoService` mockado no `container`). Cobrir: 401 sem auth; 403 sem role admin em cada rota mutadora; 400 para body inválido (`filCod: -1`, `docCod: ''`); 200/201 happy; 409 com `code: 'LOTE_VERSAO_CONFLITO'` e `retryable: true` quando o service lança `LoteVersaoConflitoError`; 422 com `code: 'LOTE_ESTADO_INVALIDO'`; `ator` = `req.user.email` no audit.

- **Resultado Esperado**
  > `routes/sispag.ts` sobe para ≥70% lines. Mapping de `HandlerError → HTTP` fica congelado como contrato para o front (`code`, `retryable`, `statusCode`).

- **Tactic alvo**: Executable Assertions / Specialized Interfaces
- **Severidade**: P1
- **Esforço estimado**: M (2d)
- **Findings relacionados**: F-testability-2, F-testability-4
- **Métricas de sucesso**:
  - `routes/sispag.ts` lines coverage: **0% → ≥70%**
  - Casos cobrindo 401/403/400/409/422/happy: **0 → ≥15**
  - Verificações de `requireRole('admin')` por rota: **0 → 4/4**
- **Risco de não fazer**: escalada de privilégio (remover `requireRole` de uma rota por acidente) ou regressão silenciosa no mapping 409/422 → UX quebrada + audit trail com `ator = 'unknown'`.
- **Dependências**: nenhuma.

### [testability-3] Completar o `LotePagamentoService.test.ts` — `removerTitulo`, `criarLote`, `listarLotes`, `onBusy`, path de estado errado

- **Problema**
  > `LotePagamentoService` está a **66.66% functions** com **4 de 8 métodos públicos sem `describe`** (F-testability-3). `removerTitulo` (linhas 155-179) está 100% descoberto — inclui `db.withTransaction(removerItem + tocarLote)` e audit. O `onBusy` do `withAdvisoryLock` (linha 149) e o path "estado incompatível após transição" (linha 250) também estão descobertos.

- **Melhoria Proposta**
  > Adicionar `describe` para `criarLote`, `listarLotes`, `removerTitulo`. Casos mínimos:
  > - `criarLote`: happy + `audit('criarLote', ...)` invocado com `{filCod}`.
  > - `listarLotes`: delega para `repo.listLotes(filtro)`.
  > - `removerTitulo`: happy (chama `removerItem` + `tocarLote` + `audit`); rejeita em lote não-RASCUNHO (linha 186).
  > - `incluirTitulo` — path `onBusy`: refatorar `buildDb` para expor `withAdvisoryLock` retornando `onBusy()` num teste específico → asserir `LoteVersaoConflitoError` com `versaoEsperada: -1`.
  > - `transicionar` — path "estado incompatível": `transicionarStatus.mockResolvedValue(0)` + relê com versão IGUAL → `LoteEstadoInvalidoError` (linha 250).
  > - Transições faltantes: `cancelarLote` a partir de FINALIZADO (happy); `reabrir` de RASCUNHO (rejeita); `cancelar` de CANCELADO (rejeita).

- **Resultado Esperado**
  > `LotePagamentoService` sobe para ≥95% lines / ≥90% functions. Métodos com `describe` **3/8 → 8/8**. Transições da SM cobertas **3/4 → 4/4** + rejeições **2/≥5 → ≥5**.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: S (1d)
- **Findings relacionados**: F-testability-3, F-testability-8
- **Métricas de sucesso**:
  - Cobertura de `LotePagamentoService.ts`: **82.65% → ≥95% lines; 66.66% → ≥90% functions**
  - Métodos públicos com `describe`: **3/8 → 8/8**
  - Transições SM cobertas: **3/4 → 4/4**
  - Rejeições SM cobertas: **2 → ≥5** (finalizar vazio, finalizar versão, reabrir estado errado, cancelar terminal, reabrir versão, cancelar versão)
- **Risco de não fazer**: `removerTitulo` racha silenciosamente numa Fatia 3 que executar a baixa; transições ilegais passariam despercebidas (reabrir cancelado). Cross-QA: **Fault Tolerance** (state machine defense).
- **Dependências**: nenhuma.

### [testability-4] Teste de integração para o advisory-lock (I3): incluirTitulo concorrente contra Postgres real

- **Problema**
  > A defesa contra a race de I3 (dois analistas incluindo o MESMO título no MESMO instante em lotes diferentes RASCUNHO) só existe via `withAdvisoryLock` + `pg_try_advisory_lock` + transação (F-testability-7). O mock atual "sempre adquire o lock" e o `withTransaction` roda inline — **nem unit nem integração exercitam o path real**. Sem isso, I3 depende de um comentário no código.

- **Melhoria Proposta**
  > Introduzir infraestrutura de integration test (mesma modalidade que o CLAUDE.md sugere: `describe('integration: LotePagamento', ...)`), com Postgres via `testcontainers` OU `docker-compose.test.yml` sob `src/backend/scripts/`. `testPathIgnorePatterns` do `jest.config.cjs:7` já ignora `\\.integration\\.test\\.ts$` — criar um segundo run `npm run test:integration` que **inclui** esses arquivos. Casos:
  > 1. Dois `incluirTitulo` do MESMO título em lotes RASCUNHO diferentes, concorrentes (Promise.all): um deles deve lançar `TituloEmOutroLoteError` ou `LoteVersaoConflitoError` (via `onBusy`); a tabela `lote_pagamento_item` deve ter EXATAMENTE 1 linha para aquele `(fil_cod, doc_cod, tit_cod)`.
  > 2. `transicionarStatus` real: finalizar duas vezes o mesmo lote em paralelo → apenas uma passa (`rowCount = 1`), a outra recebe `rowCount = 0` e o service traduz para `LoteVersaoConflitoError`.
  > 3. `ON CONFLICT` do `adicionarItem`: chamada dupla é idempotente na tabela.

- **Resultado Esperado**
  > 1º integration test SISPAG existe: `LotePagamentoRepository.integration.test.ts` com ≥3 cenários concorrentes. `pg_try_advisory_lock` deixa de ser "comentário no código" e vira defesa exercitada.

- **Tactic alvo**: Sandbox
- **Severidade**: P1
- **Esforço estimado**: L (1–2 sem — precisa infra de testcontainers + convenção de suite integration)
- **Findings relacionados**: F-testability-7
- **Métricas de sucesso**:
  - Integration tests SISPAG: **0 → ≥3**
  - Cenários concorrentes cobertos (incluir mesmo título; finalizar em paralelo; ON CONFLICT): **0 → 3/3**
  - Novo target no `package.json`: `npm run test:integration`
- **Risco de não fazer**: quando a Fatia 3 processar o lote, uma race real em produção paga o mesmo título 2x. Cross-QA: **Fault Tolerance**, **Integrability** (contrato Postgres).
- **Dependências**: escolha da infra (testcontainers vs docker-compose) — decidir com AwsInfraArchitect/QaCoach.

### [testability-5] Cobrir `SispagPainelService` e `ConexosSispagClient` com fixture de payload `fin064`

- **Problema**
  > `SispagPainelService` está a 0% (F-testability-6); `ConexosSispagClient` a 20.96% stmts / 0% branches / 0% functions (F-testability-5). Sem fixture do payload cru de `fin064/list`, o Zod schema (`.catch(false)` em `vldLib`, `.catch(undefined)` em quase tudo) pode aceitar payload malformado como "título liberado" — furando I2 silenciosamente. `prepararTitulos`/`calcularKpis` são funções puras determinísticas com KPIs de negócio.

- **Melhoria Proposta**
  > 1. Criar `src/backend/domain/client/__fixtures__/fin064-titulo.json` (uma linha real capturada do probe `jobs/probe-sispag.ts`, sanitizada).
  > 2. `ConexosSispagClient.test.ts`: mockar `ConexosBaseClient` como em `ConexosSubClients.test.ts:9-19`; asserir `getTituloAPagar` retorna `TituloAPagar` bem-formado para a fixture, retorna `null` quando `docCod` não bate; asserir que Zod REJEITA payload com `vldLib: 'garbage'` (e não vira `false` silenciosamente) — recomenda-se remover `.catch(false)` e propagar erro.
  > 3. `SispagPainelService.test.ts`: mockar `ConexosSispagClient` e `ConexosBaseClient.getFiliais`; congelar `Date.now` com `jest.useFakeTimers({now: <fixed-date>})`; testar `prepararTitulos` (aging correto), `calcularKpis` (contas), `ordenarLotes`, fallback de filial que falha (`Promise.allSettled` → warn + continua), e o guard-rail `modo` no response.

- **Resultado Esperado**
  > `SispagPainelService` sobe para ≥90% lines. `ConexosSispagClient` sobe para ≥85% lines / ≥70% branches / ≥90% functions. Fixture `fin064` congela o contrato: mudança de schema pelo Conexos quebra CI antes de furar I2 em produção. Cross-QA: **Integrability** (contract test).

- **Tactic alvo**: Recordable Test Cases / Abstract Data Sources / Limit Non-Determinism
- **Severidade**: P2
- **Esforço estimado**: M (2d)
- **Findings relacionados**: F-testability-5, F-testability-6
- **Métricas de sucesso**:
  - `ConexosSispagClient` functions: **0% → ≥90%**
  - `SispagPainelService` lines: **0% → ≥90%**
  - Fixture files `fin064|fin015|fin010`: **0 → 3**
  - `jest.useFakeTimers` usage no SISPAG: **0 → 1** (KPIs deterministas)
- **Risco de não fazer**: I2 furada por payload malformado; KPIs errados; painel degrada sem sinal.
- **Dependências**: precisa de payload sanitizado (extrair do probe `jobs/probe-sispag.ts`).

### [testability-6] Teste do modal de montagem SISPAG (`app/sispag/page.tsx`) + preservar `code`/`retryable` em `loteRequest`

- **Problema**
  > `app/sispag/page.tsx` (685 LOC) sem teste (F-testability-9). O fluxo optimista de inclusão/remoção + o tratamento de 409 versão-conflito não é validado. `loteRequest` em `lib/sispag.ts:126-141` reduz `HandlerError` a `Error(j.error)` — perde `code` e `retryable`; a UI não distingue "recarregue e tente de novo" (409) de "estado inválido, aborta" (422).

- **Melhoria Proposta**
  > 1. Refatorar `loteRequest` para lançar um erro tipado (`class LoteApiError extends Error { code?: string; retryable?: boolean; statusCode: number }`) preservando o payload.
  > 2. Adicionar testes React Testing Library para `app/sispag/page.tsx`:
  >    - checkbox → clica "Incluir" → chama `incluirTitulo` → atualiza a lista;
  >    - resposta 409 com `retryable: true` → toast "Este lote foi alterado por outra pessoa" + refetch;
  >    - resposta 422 → toast "estado inválido" (não retryable);
  >    - versão conflict no `finalizarLote` → mesma UX.
  > 3. Considerar split do arquivo (mesma doutrina do CC-1 em Permutas): extrair `LoteMontagemModal.tsx`, `LoteFinalizarButton.tsx`, `SispagTable.tsx` para caber sob 300 LOC/arquivo.

- **Resultado Esperado**
  > `app/sispag/page.tsx` ≤300 LOC (via split); ≥3 componentes com teste; `loteRequest` propaga `code/retryable` com teste que trava o contrato. UX de conflito de versão passa a distinguir retryable de não-retryable.

- **Tactic alvo**: Limit Structural Complexity / Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: M (3d)
- **Findings relacionados**: F-testability-9
- **Métricas de sucesso**:
  - LOC do `app/sispag/page.tsx`: **685 → ≤300**
  - Componentes SISPAG com `.test.tsx`: **0 → ≥3**
  - Preservação de `code`/`retryable` em `loteRequest`: **não → sim** (teste que trava)
- **Risco de não fazer**: UX ruim em conflitos de versão + arquivo grande impedindo evolução. Cross-QA: **Modifiability**.
- **Dependências**: nenhuma; alinhado com o padrão CC-1 já aplicado a Permutas.

### [testability-7] Endurecer o CI gate: thresholds por-camada em `repository/`, `client/`, `routes/`

- **Problema**
  > A introdução dos 5 arquivos novos do SISPAG (0-20% coverage) baixou o gate de 78% → 77.72% em `global.functions` (F-testability-4). O `coverageThreshold` do `jest.config.cjs:34-44` tem `global` + `./domain/service/` mas não impede que uma futura feature reintroduza `repository/*.ts` a 0% (dilui no global). Ao mesmo tempo, quando os cards testability-1/2/5 forem entregues, os floors precisam subir para o novo baseline — senão o teto vira teto de vidro.

- **Melhoria Proposta**
  > Após entregar os cards testability-1/2/5, adicionar em `src/backend/jest.config.cjs`:
  > ```javascript
  > coverageThreshold: {
  >   global: { lines: 80, branches: 60, functions: 82 },
  >   './domain/service/': { lines: 90, branches: 75, functions: 90 },
  >   './domain/repository/': { lines: 85, branches: 55, functions: 80 },
  >   './domain/client/': { lines: 75, branches: 55, functions: 80 },
  >   './routes/': { lines: 65, branches: 45, functions: 65 },
  > }
  > ```
  > Também documentar o rationale (mesma abordagem do comentário em linhas 15-33). Adicionar target `npm run test:integration` (dependência do card testability-4).

- **Resultado Esperado**
  > CI passa a bloquear regressão camada-a-camada. Novo `LotePagamentoRepository` a 0% na próxima feature quebra CI localmente, não silenciosamente no `global`.

- **Tactic alvo**: CI Gate (cross-QA: **Deployability**)
- **Severidade**: P3
- **Esforço estimado**: S (0.5d)
- **Findings relacionados**: F-testability-11, F-testability-4
- **Métricas de sucesso**:
  - Diretórios com threshold próprio: **1 → 4** (`service`, `repository`, `client`, `routes`)
  - `global.functions` floor: **78 → 82**
  - `npm run test:integration` disponível: **não → sim**
- **Risco de não fazer**: mesmo cenário de erosão silenciosa; novos módulos reintroduzem 0%-coverage sem sinal.
- **Dependências**: cards testability-1, testability-2, testability-5 (para que os novos floors sejam alcançáveis).

## 6. Notas do agente

- **Escopo**: auditei apenas o delta `feat/sispag-painel-montagem` (5 arquivos novos + `routes/sispag.ts` + página FE). Métricas de baseline foram comparadas contra o precedente Permutas via coverage report do `npm test -- --coverage`.
- **Métrica que tentei coletar e falhou**: `LoteVersaoConflitoError.retryable=true` já chegando ao front — precisaria de teste E2E; declarei como parte do card testability-6 (fix em `loteRequest`).
- **Cross-QA para o consolidator**:
  - testability-1 (Repository SQL) e testability-4 (integration test do advisory-lock) **overlap Fault Tolerance** (state-transition tests).
  - testability-5 (fixture Conexos) **overlap Integrability** (Recordable Test Cases = contract test).
  - testability-7 (CI gate) **overlap Deployability** (gate before deploy).
  - F-testability-10 (Date.now/randomUUID inline) **overlap Modifiability** (Clock/UUID como injetáveis).
- **Avaliação dos 13 testes existentes**: sim, prendem os invariantes I2/I3/I4/I5/I6 no fronte do agregado; mas prendem apenas o service — a defesa não sobrevive a uma regressão no repositório (SQL do optimistic lock) nem na rota (mapping HandlerError). O que o time acredita defender ≠ o que a suíte hoje defende.
