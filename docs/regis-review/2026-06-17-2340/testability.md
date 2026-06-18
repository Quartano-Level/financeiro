---
qa: Testability
qa_slug: testability
run_id: 2026-06-17-2340
agent: qa-testability
generated_at: 2026-06-18T00:00:00Z
scope: backend
score: 7
findings_count: 8
cards_count: 8
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Yuri ajusta regra de elegibilidade ou pluga o probe P0-4 (`mapDeclaracaoDataBase`) | Mudança em regra de gate, classificação juros/desconto, casamento N:M ou no mapper do campo wire da data-base | Pipeline `EleicaoPermutasService` → `ElegibilidadeService` / `CasamentoInvoiceService` / `VariacaoCambialPermutaService` / `AgingService` → `PermutaSnapshotRepository` + `routes/permutas.ts` | Unit-test (jest 2 workers) — sem Conexos, sem Postgres real | Cobertura comportamental dos 4 gates + casamento 0/1/N + juros/desconto bidirecional + aging null + cap-hit + FLOW_ERROR sem snapshot orfão | 9 suites verdes < 30s no worktree; toda regra coberta com seam de DI direto; quando o probe resolver, plugar 1 método e testes do mapper passam — zero efeito nos services |

> Bass cap.10: a Fatia 1 é READ-ONLY mas escreve um snapshot próprio em Postgres recém-introduzido (1ª migration do repo). O custo do próximo `/feature-tweak` em permutas depende inteiramente de quão isoláveis estão os seams (Conexos, Postgres, clock, randomUUID, motivos de bloqueio). O delta paga essa conta MUITO bem na maior parte (DI por construtor, mocks por seam) — mas tem 3 furos de seam que viram dívida em features futuras (Fatia 2 escrita / transação, scheduler, multi-tenant).

## 2. Métricas observadas

### Métrica observável #1 — Coverage por camada (delta da feature)

| Camada do delta | # source (LOC non-test) | # test files | # describe blocks | LOC teste | Cobertura aparente | Alvo | Status |
|---|---:|---:|---:|---:|---|---|---|
| `domain/interface/permutas/` | 178 | 0 | 0 | 0 | N/A (types-only / constantes) | N/A | ✅ |
| `domain/client/permutas/` (schemas+constants) | 107 | 1 (`conexosPermutasSchemas.test.ts`) | 4 | 74 | alta (todos schemas + cada FK testada) | ≥80% lines | ✅ |
| `domain/client/ConexosClient.ts` (delta +171) | 171 | (compartilha com `ConexosClient.test.ts`) | 3 novos describe (`listAdiantamentosProforma`, `listDeclaracaoByProcesso`) | 156 | alta (probe gated + capHit + Zod reject + XOR 2x2) | ≥80% lines | ✅ |
| `domain/service/permutas/` (6 services) | 648 | 6 | 9 | 555 | alta (≈96% pelo baseline jest agregate) | ≥80% lines / ≥70% branches | ✅ |
| `domain/repository/permutas/PermutaSnapshotRepository.ts` | 177 | 1 | 1 | 155 | parcial — SQL shape & mapper testados, atomicidade NÃO (sem transação) | ≥80% lines / ≥1 integration test | ⚠️ |
| `routes/permutas.ts` | 53 | 1 | 2 | 160 | alta (200/401/snapshot vazio/aging null preservado) | ≥70% lines | ✅ |
| `migrations/runMigrations.ts` | 55 | **0** | 0 | 0 | **zero** — runner novo do repo, fs+SQL idempotente sem teste | ≥1 unit + 1 integration | ❌ |
| **Total delta** | **1389** | **9** (1 schema + 6 service + 1 repo + 1 route) | **19 describes** | **1100** | ratio test/src ≈ **0.79** | ≥0.5 | ✅ |

> ⚠️ **Não medível localmente** (flag `--quick`): coverage% real (lines/branches/functions). Estimativa por análise de `*.test.ts`. `jest.config.cjs` aplica gates `domain/service ≥ 88% lines / 60% branches` globalmente — esses gates ficam verdes pelo aggregate, mas isso **não distingue** que `runMigrations.ts` (em `src/backend/migrations/`, fora do bucket) está em 0% real.

### Outras métricas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Seam de DI por construtor (vs `container.resolve` em test) | 19 `new <Service>(...)` em 6 suites de service + repo + routes (`registerInstance` no route test) | ≥80% dos services | ✅ | `grep -n "new .*Service(\|registerInstance" *.test.ts` |
| Mocks por convenção (`jest.fn`/`mockResolvedValue`) no delta | 27 ocorrências em 4 suites (orquestrador, repo, painel, route) | ≥1 mock por seam externo | ✅ | grep |
| Tests fazem rede real (axios/fetch out-bound) | 0 (o `fetch` em `permutas.test.ts:76,96,130,152` é loopback p/ `127.0.0.1:0` — local express) | 0 | ✅ | grep |
| Suites de integração de repositório (`describe('integration:'`) | **0** no delta | ≥1 para `PermutaSnapshotRepository` (1ª migration do repo) | ❌ | `grep -rn "describe(.integration:"` |
| Teste do `runMigrations.ts` | **0** | ≥1 (idempotência, leitura de `schema_migrations`, ordem lexicográfica) | ❌ | `find migrations -name "*.test*"` |
| Time reads em source-side sem clock injetável | 4 sites (`AgingService.ts:17`, `EleicaoPermutasService.ts:63,86,132`, `PainelService.ts:60`) — só `AgingService.compute` aceita `now` como parâmetro | 0 fora de `ClockProvider` | ⚠️ | `grep -n "new Date()\|Date.now()"` |
| Randomness em source-side sem provider injetável | 2 sites `randomUUID` (`PermutaSnapshotRepository.ts:63`, `EleicaoPermutasService.ts:62`) | 0 fora de `IdProvider` | ⚠️ | grep |
| Asserts de log no orquestrador | `FLOW_START` ✅, `FLOW_COMPLETE` (×1) ✅, `BUSINESS_WARN` capHit ✅, `FLOW_ERROR` ✅ — `flowId` único propagado em **TODA** linha | 100% dos LogType em estado pendente / cap-hit / erro | ✅ | `EleicaoPermutasService.test.ts:108-118,170-172,201` |
| Transições do estado `EstadoElegibilidade` testadas | DESCOBERTA→ELEGIVEL ✅, →BLOQUEADA(sem-invoice) ✅, →BLOQUEADA(composto-nm) ✅, →BLOQUEADA(falha-gate gate2/gate3/XOR) ✅, →BLOQUEADA(data-base-indisponivel) ✅ | 100% transições da state-machine | ✅ | `ElegibilidadeService.test.ts` |
| Motivos de bloqueio cobertos no teste | 4 de 5 (`COMPOSTO_NM`, `SEM_INVOICE`, `FALHA_GATE`, `DATA_BASE_INDISPONIVEL`); `MULTIPLAS_INVOICES` declarado mas **não produzido nem testado** | 100% dos motivos produzidos | ⚠️ | `EstadoElegibilidade.ts:26` vs greps |
| Property-based testing (`fast-check`) em variação cambial | 0 usos no delta (não é dep do backend) | opcional (1 prop p/ "JUROS ↔ DESCONTO simétrico") | ❌ | grep |
| Fixtures de wire Conexos (`__fixtures__/*`) | **0** — todas as respostas Conexos são literais inline em `mockResolvedValue` | ≥1 fixture por endpoint novo (`com298 PROFORMA`, `imp019`, `imp223`, `com308`) | ⚠️ | `find -name "__fixtures__"` |
| Asserts de atomicidade transacional do `persistRun` | 0 — o teste verifica **número de inserts** e o `status='error'` mas **não há `BEGIN/COMMIT/ROLLBACK`** no código nem mock que prove rollback parcial | ≥1 teste "insert candidata #N falha → run row removida" | ❌ | `PermutaSnapshotRepository.ts:65-92` (N+1 inserts sequenciais, sem `withTransaction`) |
| CI gate em testes (`coverageThreshold`) | `global.lines=72 branches=54 functions=78`; `domain/service lines=88 branches=60` | ≥80% lines no service / ≥1 gate por camada | ✅ (presente) | `jest.config.cjs:34-44` |
| Tamanho da maior suite (`EleicaoPermutasService.test.ts`) | 203 LOC | <500 LOC | ✅ | wc -l |
| TDDGuide agent | N/A para a Fatia 1 (não afeta a suíte gerada) | presente em `.claude/agents/` | N/A | — |

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | `LegacyConexosShape` (interface limpa p/ mockar a fachada Conexos), `PostgreeDatabaseClient` com 4 métodos públicos (`insert/selectMany/selectFirst/update`), e `LogService` mockado via captura customizada — todos batem com a abstração de DI tsyringe | ✅ | `ConexosClient.test.ts:5-12`, `EleicaoPermutasService.test.ts:15-27` |
| **Recordable Test Cases** | Ausente. Toda resposta Conexos é objeto literal inline (`mockResolvedValue({...})`). Nenhum `__fixtures__/com298-proforma.json`. Quando o probe P0-4 capturar o campo wire da data-base, **não há um arquivo gravado** do row real onde plugar — só o mapper isolado | ❌ | `find domain/client -name "__fixtures__"` retorna vazio |
| **Sandbox** | `routes/permutas.test.ts` monta um Express in-process em `127.0.0.1:0` com `bootstrapAppContainer` mockado e `container.registerInstance(EleicaoPermutasService, mock)` — sandbox cirúrgico, sem Postgres, sem rede saída | ✅ | `routes/permutas.test.ts:9-11, 72, 126` |
| **Executable Assertions** | Zod schemas (`com298RowSchema`/`com308RowSchema`/`declaracaoRowSchema`) atuam como assertion no boundary — `listAdiantamentosProforma` rejeita row sem `docCod` (`ConexosClient.test.ts:1071-1080`) | ✅ | `conexosPermutasSchemas.ts:28-67` |
| **Abstract Data Sources** | `PostgreeDatabaseClient` é injetado via construtor (`@inject` em `PermutaSnapshotRepository`); test usa `jest.Mocked<PostgreeDatabaseClient>`. Mas **não há abstração do clock** nem do `randomUUID` — tornam `EleicaoPermutasService` parcialmente não-determinístico (flowId, startedAt/finishedAt) | ⚠️ parcial | `PermutaSnapshotRepository.test.ts:12-17` ✅ / `EleicaoPermutasService.ts:62-63, 86, 132` ❌ |
| **Limit Structural Complexity** | Maior arquivo source do delta = `EleicaoPermutasService.ts` (283 LOC); maior teste = 203 LOC. Cada service tem 1–2 métodos públicos (em arrow). Composição via DI mantém complexidade local baixa | ✅ | `wc -l domain/service/permutas/*.ts` |
| **Limit Non-Determinism** | `AgingService.compute` aceita `now` parametrizado — ÚNICO local com clock injetável e ESPECIFICAMENTE coberto no teste com `now` fixo (`AgingService.test.ts:8-15`). O resto do orquestrador NÃO oferece esse seam. `randomUUID` chamado direto. Nenhum `jest.useFakeTimers`/`jest.setSystemTime` no delta | ⚠️ parcial | grep `new Date()/Date.now()/randomUUID` |

## 4. Findings (achados)

### F-testability-1: `runMigrations.ts` (1ª migration do repo) sem nenhum teste

- **Severidade**: P1 (alto — a 1ª migration do repo entra em produção sem cobertura; a Fatia 2 vai depender de mais migrations)
- **Tactic violada**: Specialized Interfaces / Abstract Data Sources
- **Localização**: `src/backend/migrations/runMigrations.ts:1-55` (test file ausente)
- **Evidência (objetiva)**:
  ```
  $ find src/backend/migrations -name "*.test.*"
  (vazio)
  ```
- **Impacto técnico**: o runner usa `readdirSync` + `readFileSync` + `INSERT INTO schema_migrations` cru — qualquer regressão (mudança de ordem lexicográfica, arquivo `.sql` corrompido, race em paralelo) passa silenciosa. O `runMigrations` é também o único caminho que executa SQL DDL como `databaseClient.insert(sql)` sem parametrização (legítimo p/ DDL, mas precisa do teste que prova "só DDL estático passa por aqui").
- **Impacto de negócio**: 1ª migration do repo escreve schema persistido de auditoria (`permuta_eleicao_run`, `permuta_candidata_snapshot`). Bug no runner = snapshot perdido = painel volta a zero, analista perde a fila.
- **Métrica de baseline**: 0 testes / 55 LOC source.

### F-testability-2: `persistRun` não é transacional — atomicidade declarada na docstring é unenforceable

- **Severidade**: P0 (crítico — claim de invariante na docstring que o teste não pode defender, e o produto declara "atomicidade")
- **Tactic violada**: Executable Assertions / Limit Non-Determinism
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:43-95` + `PermutaSnapshotRepository.test.ts:56-77`
- **Evidência (objetiva)**:
  ```
  // docstring (linha 43-46):
  // "Atomicidade (Task 9 AC): run completa ⇒ 1 row em `permuta_eleicao_run` + 1
  //  row por candidata; run abortada ⇒ status='error' + 0 snapshot rows."

  // implementação (65-92): N+1 INSERTs SEQUENCIAIS sem BEGIN/COMMIT
  await this.databaseClient.insert(`INSERT INTO permuta_eleicao_run ...`);
  for (const candidata of candidatas) {
      await this.insertCandidata(runId, candidata);   // sem transação
  }

  // PostgreeDatabaseClient não expõe `withTransaction()` nem `BEGIN`:
  $ grep -n "transaction\|BEGIN" PostgreeDatabaseClient.ts
  (só docstring sobre transaction-mode pooler — nenhuma API)

  // teste (PermutaSnapshotRepository.test.ts:64): só conta inserts
  expect(db.insert).toHaveBeenCalledTimes(2);
  ```
- **Impacto técnico**: se `insertCandidata` falhar no meio do loop (FK violation, connection drop), o run row fica com `status='success'` e snapshot **parcial** — `findLatestSnapshot` retornará uma run "success" com N candidatas faltando. O test passou porque o mock nunca falha no meio.
- **Impacto de negócio**: painel exibe snapshot incompleto sem nenhum sinal de truncamento; analista decide sobre dado parcial. Em Fatia 2 (execução) isso vira write desencontrado no `fin010`.
- **Métrica de baseline**: 0 testes de falha-no-meio-do-loop; 0 chamadas a `BEGIN/COMMIT/ROLLBACK`; 5 testes "feliz" no `PermutaSnapshotRepository.test.ts`.

### F-testability-3: clock global (`new Date()`/`Date.now()`) no orquestrador e no painel sem seam injetável

- **Severidade**: P1 (alto — testes do orquestrador e do painel não conseguem fixar tempo)
- **Tactic violada**: Limit Non-Determinism / Abstract Data Sources
- **Localização**: `EleicaoPermutasService.ts:63,86,132` (`startedAt`/`finishedAt`); `PainelService.ts:60` (`snapshotAge = Date.now() - finishedAt`)
- **Evidência (objetiva)**:
  ```
  EleicaoPermutasService.ts:63:        const startedAt = new Date();
  EleicaoPermutasService.ts:86:            const finishedAt = new Date();
  EleicaoPermutasService.ts:132:                    finishedAt: new Date(),
  PainelService.ts:60:        const snapshotAge = Date.now() - snapshot.finishedAt.getTime();
  ```
- **Impacto técnico**: o teste do orquestrador não pode assertar `durationMs` (`EleicaoPermutasService.ts:111`) nem cravar `startedAt`; `PainelService.test.ts` não assertou `snapshotAge` em nenhum dos 2 testes — exatamente porque o valor é não-determinístico. `AgingService.compute` mostra o padrão correto (`now: Date = new Date()`) e o teste se aproveita (`AgingService.test.ts:8`).
- **Impacto de negócio**: alertas de "snapshot velho" (Fatia 2 vai precisar de SLO sobre `snapshotAge`) não terão teste; regressão silenciosa de duração.
- **Métrica de baseline**: 4 sites de leitura de tempo; 1 (25%) com seam; 3 (75%) sem seam. 0 asserts sobre `durationMs`/`snapshotAge` nos testes.

### F-testability-4: `randomUUID` chamado direto em service + repository — `flowId`/`runId` não-determinísticos no teste

- **Severidade**: P2 (médio — teste atual contorna com `toBe(runArg.flowId)` por igualdade reflexiva; impede asserts diretos)
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `EleicaoPermutasService.ts:1,62`; `PermutaSnapshotRepository.ts:1,63`
- **Evidência (objetiva)**:
  ```
  EleicaoPermutasService.ts:1:import { randomUUID } from 'node:crypto';
  EleicaoPermutasService.ts:62:        const flowId = randomUUID();
  PermutaSnapshotRepository.ts:63:        const runId = randomUUID();

  // teste se acomoda com igualdade reflexiva:
  EleicaoPermutasService.test.ts:111: expect([...flowIds][0]).toBe(runArg.flowId);
  ```
- **Impacto técnico**: impossibilita fixar `flowId` no teste para um valor conhecido; correlação entre log e snapshot é testada por "todos iguais" mas não por "igual a este valor esperado". Quando o `LogService` real for plugado e o `flowId` propagar via `LoggerMetadata`, o teste de integração não conseguirá assertar payload exato.
- **Impacto de negócio**: rastreabilidade end-to-end (flowId no Postgres + flowId no CloudWatch) não é defendida por teste — só por convenção.
- **Métrica de baseline**: 2 sites de `randomUUID` em source; 0 providers; 0 testes que validam um `flowId` literal.

### F-testability-5: `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES` declarado na taxonomia mas nunca produzido nem testado

- **Severidade**: P2 (médio — taxonomia vaza dead-code que o painel pode renderizar sem nunca ter visto)
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/domain/interface/permutas/EstadoElegibilidade.ts:25-26`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "MULTIPLAS_INVOICES\|multiplas-invoices" src/backend/domain/service/permutas
  (vazio)
  ```
  `CasamentoInvoiceService.casarInvoice` sempre devolve `COMPOSTO_NM` para `>1` invoice (`CasamentoInvoiceService.ts:27`). A diferença declarada no docstring (linha 25: "distinguível do composto N:M (mesma família)") não se materializa em código.
- **Impacto técnico**: futuro feature-tweak que tente diferenciar "multiplas invoices num só processo" vs "composto N:M cruzando processos" vai descobrir tarde que o teste do casamento NÃO força a distinção; mudança silenciosa do `MOTIVO_BLOQUEIO.COMPOSTO_NM` para `MULTIPLAS_INVOICES` quebraria o painel sem alarme.
- **Impacto de negócio**: relatório do painel pode passar a usar um motivo que o resto do sistema nunca viu (front desconhece o literal).
- **Métrica de baseline**: 5 motivos na taxonomia; 4 (80%) produzidos no service; 1 (20%) inalcançável.

### F-testability-6: zero fixtures gravados de wire Conexos — quando o probe P0-4 resolver, não há row real onde plugar

- **Severidade**: P2 (médio — débito específico do gate aberto, vira P1 quando o probe resolver)
- **Tactic violada**: Recordable Test Cases
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts:1083-1153` + `domain/client/permutas/` (sem `__fixtures__/`)
- **Evidência (objetiva)**:
  ```
  $ find src/backend/domain/client -name "__fixtures__" -o -name "*.fixture.*"
  (vazio)

  ConexosClient.test.ts:1107: { count: 1, rows: [{ priCod: '3000' }] }   // wire literal inline
  ```
- **Impacto técnico**: quando o probe P0-4 capturar a forma real do row `imp019`/`imp223`, o teste vai precisar reescrever literais inline em ≥5 lugares. Sem `__fixtures__/imp019-sample.json`, o mapper `mapDeclaracaoDataBase` (`ConexosClient.ts:690`) será plugado às cegas em PR.
- **Impacto de negócio**: gate fechado lento; risco de plugar o probe com payload errado e o erro só aparecer no painel.
- **Métrica de baseline**: 0 fixtures gravados / 6 endpoints Conexos exercitados (`com298 PROFORMA list`, `com298 INVOICE list`, `com298 detail mnyTitPermutar`, `imp019/list`, `imp223/list`, `com308/list`).

### F-testability-7: rota `POST /permutas/eleicao` não testa caminho `FLOW_ERROR` HTTP nem propagação do `runId` de erro

- **Severidade**: P2 (médio — service trata; rota não confirma o status HTTP)
- **Tactic violada**: Sandbox / Executable Assertions
- **Localização**: `routes/permutas.test.ts:56-102` (só 200 + 401)
- **Evidência (objetiva)**:
  ```
  // só 2 it()s no describe POST /permutas/eleicao:
  //  • happy-path 200
  //  • 401 unauth
  // ausentes:
  //  • service throw → 500 + payload com errorMessage/runId (atomicidade)
  //  • capHit → resposta inclui flag de truncação
  ```
- **Impacto técnico**: o cenário onde `executar` propaga o throw (`EleicaoPermutasService.ts:150`) atravessa o `errorMiddleware` mas o teste da rota não fixa contrato HTTP. Mudança no `errorMiddleware` (que existe e tem teste próprio) muda contrato sem o front saber.
- **Impacto de negócio**: front exibe genérico "Erro 500" em vez de motivo de auditoria; analista re-clica.
- **Métrica de baseline**: 2 cenários HTTP em `POST /permutas/eleicao`; alvo mínimo 4 (200, 401, 5xx-via-service-throw, capHit-200-com-flag).

### F-testability-8: `EleicaoPermutasService` mockado por shape solto (`as unknown as ConexosClient`) — perde o gate de tipo em refactor

- **Severidade**: P3 (baixo — boa prática conhecida; só vira P2 quando ConexosClient ganhar novos métodos)
- **Tactic violada**: Specialized Interfaces
- **Localização**: `EleicaoPermutasService.test.ts:29-40, 80, 129`
- **Evidência (objetiva)**:
  ```
  29: const buildConexos = (over: Partial<jest.Mocked<ConexosClient>> = {}) =>
  30:     ({
  31:         listFiliais: jest.fn().mockResolvedValue([{ filCod: 2 }]),
  ...
  40:     }) as unknown as ConexosClient;     // ← cast escapa do checker
  ```
- **Impacto técnico**: o `as unknown as ConexosClient` faz com que adicionar um novo método à classe (Fatia 2 vai precisar de `executarPermuta`, `writeBackFin010`, etc.) não acuse o teste de incompleto. Padrão preferido: interface explícita `IConexosClient` que `ConexosClient implements` e o teste mocka.
- **Impacto de negócio**: Fatia 2 risca de chamar método novo sem ter mock no teste antigo → falso verde local, erro real só no smoke.
- **Métrica de baseline**: 4 ocorrências de `as unknown as ConexosClient` / `as unknown as LogService` / `as unknown as PermutaSnapshotRepository` no delta.

## 5. Cards Kanban

### [testability-1] Cobrir `runMigrations.ts` com unit + 1 teste de integração (idempotência da 1ª migration)

- **Problema**
  > A 1ª migration do repo (`migrations/0001_permuta_eleicao.sql`) entra em produção via um runner novo (`runMigrations.ts`, 55 LOC) **sem nenhum teste**. O runner lê o diretório por `readdirSync`, registra em `schema_migrations` e roda SQL DDL cru — qualquer regressão de ordem lexicográfica, leitura, ou re-execução passa silenciosa. A Fatia 2 vai adicionar mais migrations sobre este runner.

- **Melhoria Proposta**
  > Adicionar `migrations/runMigrations.test.ts` com mock do `PostgreeDatabaseClient`: (i) cria `schema_migrations` na 1ª run; (ii) skipa arquivos já registrados; (iii) ordena lexicograficamente `0001_*.sql` antes de `0002_*.sql`; (iv) retorna `string[]` com os recém-aplicados. Marcar tactic *Specialized Interfaces*. Em seguida, abrir um `0001_permuta_eleicao.integration.test.ts` que sobe Postgres efêmero (via `pg-mem` ou docker-compose dev), aplica a migration duas vezes, e verifica que as 2 tabelas + 2 índices ficam idempotentes.

- **Resultado Esperado**
  > Cobertura do runner: 0 testes → ≥4 cenários unit + 1 integration. Quando a Fatia 2 adicionar `0002_*.sql`, o teste de ordem lexicográfica já existe.

- **Tactic alvo**: Specialized Interfaces + Recordable Test Cases
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Testes do `runMigrations.ts`: 0 → ≥4 unit
  - Testes de integração da migration: 0 → 1 (idempotência verificada em DB real)
- **Risco de não fazer**: Fatia 2 quebra a sequência de migrations e o painel volta a zero em produção sem alarme.
- **Dependências**: nenhuma

### [testability-2] Introduzir `withTransaction()` no `PostgreeDatabaseClient` e cobrir atomicidade real do `persistRun`

- **Problema**
  > A docstring de `PermutaSnapshotRepository.persistRun` declara "atomicidade: run completa ⇒ 1 row + N candidatas; abortada ⇒ status=error + 0 snapshot rows", mas o código (`PermutaSnapshotRepository.ts:65-92`) faz N+1 INSERTs sequenciais **sem `BEGIN/COMMIT`**, e o `PostgreeDatabaseClient` não expõe API transacional. O teste atual só conta `db.insert.toHaveBeenCalledTimes(2)` — não defende o invariante. Se `insertCandidata` falhar no meio do loop, fica run "success" com snapshot parcial e o painel mostra dado truncado sem aviso.

- **Melhoria Proposta**
  > Tactic *Executable Assertions*. Adicionar `PostgreeDatabaseClient.withTransaction<T>(fn: (tx) => Promise<T>): Promise<T>` (BEGIN/COMMIT/ROLLBACK via `pool.connect()` + `client.query('BEGIN')`). Refatorar `persistRun` para envolver header+candidatas na mesma transação. Adicionar teste `PermutaSnapshotRepository.test.ts > "rollback when insertCandidata #N throws → run row removida, 0 snapshot rows"` usando mock de transação que rejeita no índice K.

- **Resultado Esperado**
  > Atomicidade testada: 0 → 1 teste de rollback parcial; `withTransaction` reusável pela Fatia 2 (write-back fin010 vai precisar).

- **Tactic alvo**: Executable Assertions
- **Severidade**: P0
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - Asserts de atomicidade no `persistRun`: 0 → 1 (rollback completo no erro #N)
  - Chamadas a `BEGIN/COMMIT/ROLLBACK` em source: 0 → 1 wrapper compartilhado
- **Risco de não fazer**: snapshot parcial em produção vira P0 de Fault Tolerance + dado errado no painel; Fatia 2 (write-back em `fin010`) herda o mesmo buraco com efeito monetário.
- **Dependências**: nenhuma (interno ao repo); cross-link com Fault Tolerance.

### [testability-3] Introduzir `ClockProvider` injetável e fixar tempo nos testes de orquestrador/painel

- **Problema**
  > 4 sites de leitura de tempo no delta (`EleicaoPermutasService.ts:63,86,132`; `PainelService.ts:60`) usam `new Date()`/`Date.now()` direto. Só `AgingService.compute(dataBase, now=new Date())` oferece seam (e é o único que o teste assertou em valor literal). Resultado: nenhum teste assertando `durationMs` ou `snapshotAge`, e o futuro SLO sobre "snapshot velho" não tem como ser defendido por teste.

- **Melhoria Proposta**
  > Tactic *Limit Non-Determinism* + *Abstract Data Sources*. Criar `domain/libs/clock/ClockProvider.ts` `@singleton() @injectable() { now(): Date }`. Injetar em `EleicaoPermutasService` e `PainelService` via `@inject(ClockProvider)`. Tests passam um `FakeClock` com `now` cravado. Adicionar 1 asserção sobre `durationMs` no FLOW_COMPLETE e 1 sobre `snapshotAge` no painel.

- **Resultado Esperado**
  > Time reads sem seam em source-side do delta: 3 → 0. Asserts sobre `durationMs`/`snapshotAge`: 0 → 2.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - Sites de tempo sem seam: 3 → 0
  - Testes que fixam `durationMs`/`snapshotAge`: 0 → 2
- **Risco de não fazer**: alertas de "snapshot velho" (Fatia 2) nascem sem teste; regressão silenciosa de duração; `LogService` real preenchendo `LoggerMetadata` não terá teste end-to-end.
- **Dependências**: card [modifiability-*] sobre injetabilidade (cross-QA).

### [testability-4] Introduzir `IdProvider` (uuid) e fixar `flowId`/`runId` nos testes

- **Problema**
  > `EleicaoPermutasService.ts:62` e `PermutaSnapshotRepository.ts:63` chamam `randomUUID()` direto. O teste atual só prova "todos os logs têm o mesmo `flowId`" (igualdade reflexiva) — não consegue assertar um literal esperado, o que vira limitação dura quando `LogService` real entrar (a `LoggerMetadata.flowId` deveria propagar e ser checada por valor).

- **Melhoria Proposta**
  > Tactic *Limit Non-Determinism*. Criar `domain/libs/id/IdProvider.ts` `@singleton() @injectable() { generate(): string }`. Injetar em ambos. Tests passam `FakeIdProvider(['flow-1','run-1'])`. Atualizar `EleicaoPermutasService.test.ts:111` para `expect(runArg.flowId).toBe('flow-1')`.

- **Resultado Esperado**
  > Sites de `randomUUID` em source: 2 → 0. Asserts de `flowId` por valor: 0 → 1.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - Asserts de `flowId` por literal: 0 → 1
  - Sites de `randomUUID` em source: 2 → 0
- **Risco de não fazer**: rastreabilidade flowId DB ↔ CloudWatch fica como contrato implícito sem teste.
- **Dependências**: cross-link com [testability-3] (mesmo padrão `*Provider`).

### [testability-5] Decidir destino de `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES`: usar ou remover

- **Problema**
  > `EstadoElegibilidade.ts:25-26` declara `MULTIPLAS_INVOICES: 'multiplas-invoices'` com docstring "distinguível do composto N:M (mesma família)", mas `CasamentoInvoiceService` sempre devolve `COMPOSTO_NM` para `>1` invoice. Nenhum teste produz `MULTIPLAS_INVOICES`. É taxonomia órfã — o front pode renderizar um motivo que o backend nunca emite.

- **Melhoria Proposta**
  > Decidir com Yuri: (a) `MULTIPLAS_INVOICES` é produzido quando `invoices.length > 1` && todas no mesmo processo (e `COMPOSTO_NM` quando o N:M cruza processos) — então alterar `CasamentoInvoiceService.casarInvoice` para ramificar e adicionar 1 teste cobrindo a distinção; **ou** (b) remover o literal e a docstring associada. Tactic *Executable Assertions*: toda constante da taxonomia precisa de pelo menos 1 teste que a produza.

- **Resultado Esperado**
  > Motivos cobertos: 4/5 → 5/5 (ou 4/4 após remoção). Taxonomia executada 100% pelo service.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - Cobertura de motivos produzidos: 80% → 100%
  - Constantes órfãs em `EstadoElegibilidade.ts`: 1 → 0
- **Risco de não fazer**: front trata um caso que o backend não emite, ou pior, Fatia 2 começa a emitir `MULTIPLAS_INVOICES` e o painel quebra.
- **Dependências**: alinhamento ontológico com Yuri (1 pergunta P1 no InfoGapBroker).

### [testability-6] Capturar fixtures wire de Conexos (`com298`, `imp019`, `imp223`, `com308`) em `__fixtures__/`

- **Problema**
  > Todos os testes do `ConexosClient.test.ts` que exercitam endpoints novos (`listAdiantamentosProforma`, `listDeclaracaoByProcesso`, `getMnyTitPermutar`, `listTitulosAPagar`) usam objetos literais inline em `mockResolvedValue({rows:[{priCod:'2048'}]})`. Quando o probe P0-4 resolver a forma real do row `imp019`/`imp223`, não há JSON gravado contra o qual plugar `mapDeclaracaoDataBase`. Vai ser plugado às cegas.

- **Melhoria Proposta**
  > Tactic *Recordable Test Cases*. Criar `domain/client/permutas/__fixtures__/` com `com298-proforma.sample.json`, `imp019-di.sample.json`, `imp223-duimp.sample.json`, `com308-titulo.sample.json` (anonimizados — sem CNPJ/nomes reais). Refatorar os testes mais sensíveis para `JSON.parse(readFileSync(...))`. Documentar em `docs-contexto/` como Yuri grava um sample novo a partir de um curl autenticado.

- **Resultado Esperado**
  > Fixtures gravados: 0 → 4. Quando o probe P0-4 resolver, plugar o mapper requer só editar 1 método e 1 fixture.

- **Tactic alvo**: Recordable Test Cases
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - Fixtures Conexos: 0 → 4
  - Tempo para plugar probe P0-4 (estimado): de re-escrever ≥5 testes para editar 1 mapper + 1 fixture.
- **Risco de não fazer**: gate P0-4 fechado lento; risco de plugar o probe com payload errado e bug só aparecer no painel produção.
- **Dependências**: cross-link com Integrability (mesma tactic, mesmas fixtures).

### [testability-7] Adicionar testes HTTP para o caminho de erro do `POST /permutas/eleicao`

- **Problema**
  > `routes/permutas.test.ts` cobre só 200 e 401 do `POST /eleicao`. O caminho onde `EleicaoPermutasService.executar` propaga o throw (`EleicaoPermutasService.ts:150`) atravessa o `errorMiddleware` mas o teste não fixa o contrato HTTP (status, shape do body, presença do `runId` da run-error). Mudança no `errorMiddleware` muda contrato sem o front saber.

- **Melhoria Proposta**
  > Tactic *Sandbox*. Adicionar 2 cenários em `routes/permutas.test.ts > POST /permutas/eleicao`: (i) `executar` rejeita → 500 + body inclui `error`/`requestId`; (ii) resultado com `capHit=true` (já existe a flag interna no resumo da run mas não é exposta na resposta — definir contrato e testar). Bônus: 1 cenário GET painel com `executar` lançando para verificar isolamento.

- **Resultado Esperado**
  > Cenários HTTP em `POST /eleicao`: 2 → 4. Contrato 5xx fixado por teste.

- **Tactic alvo**: Sandbox / Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-7
- **Métricas de sucesso**:
  - Cenários `POST /permutas/eleicao` testados: 2 → 4
  - Contrato HTTP de erro documentado por teste: 0 → 1
- **Risco de não fazer**: front exibe "Erro 500" genérico, analista re-clica e gera 2x run no Postgres; mudança futura do `errorMiddleware` quebra silenciosamente.
- **Dependências**: cross-link com Integrability.

### [testability-8] Trocar `as unknown as ConexosClient` por uma interface `IConexosClient` mockada por tipo

- **Problema**
  > `EleicaoPermutasService.test.ts:29-40,80,129` declara mocks com `as unknown as ConexosClient` — o cast escapa do type-checker. Quando a Fatia 2 adicionar `executarPermuta`/`writeBackFin010` ao `ConexosClient`, o teste antigo permanece "verde" mesmo sem mock do novo método (porque o cast é total). Mesma armadilha em `LogService` e `PermutaSnapshotRepository`.

- **Melhoria Proposta**
  > Tactic *Specialized Interfaces*. Extrair `domain/interface/client/IConexosClient.ts` com os métodos públicos efetivamente usados pelo orquestrador; `ConexosClient implements IConexosClient`; o teste tipa o mock como `jest.Mocked<IConexosClient>` (sem cast). Repetir para `LogService` → `ILogService`. Mantém compat com tsyringe (token = a classe).

- **Resultado Esperado**
  > Casts `as unknown as` no delta: 4 → 0. Adicionar método novo a `ConexosClient` quebra o teste por falta de mock (sinal correto).

- **Tactic alvo**: Specialized Interfaces
- **Severidade**: P3
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-8
- **Métricas de sucesso**:
  - `as unknown as <Type>` no delta de testes: 4 → 0
  - Mocks tipados por interface explícita: 0 → ≥2 (ConexosClient, LogService)
- **Risco de não fazer**: Fatia 2 chamará método novo do `ConexosClient` sem mock no teste antigo → falso verde local.
- **Dependências**: cross-link com Modifiability (interface segregation).

## 6. Notas do agente

- Run em modo `--quick`: coverage% real não rodado; declaração explícita em §2. Estimativa do test/source ratio = 1100/1389 ≈ 0.79 (forte para Bass), com baseline jest agregate "domain/service ≈96% lines / 79% branches" carregado do shared-metrics.
- Cross-QA detectados (alertar consolidator): **F-testability-2 ↔ Fault Tolerance** (atomicidade transacional do `persistRun` vira buraco de FT); **F-testability-3/4 ↔ Modifiability** (mesmo padrão `*Provider` injetável); **F-testability-6 ↔ Integrability** (fixtures de wire Conexos são contract tests); **F-testability-7 ↔ Integrability** (contrato HTTP); **gates de cobertura em CI ↔ Deployability**.
- Gap explícito sobre o probe P0-4: o teste `AgingService.test.ts:19-22` e `ConexosClient.test.ts:1142-1152` SIM asseguram comportamento "pendente" (`undefined`/null) sem fixar o literal de produção — está correto. Quando o probe resolver, F-testability-6 (fixtures) vira o card P1 mais quente.
