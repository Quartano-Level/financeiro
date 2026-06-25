---
qa: Testability
qa_slug: testability
run_id: 2026-06-25-1713
agent: qa-testability
generated_at: 2026-06-25T17:30:00-03:00
scope: backend,frontend
score: 8
findings_count: 4
cards_count: 4
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/CI ao mudar regra do "Executar todas" (dedup, continue-on-error, status agregado, gating de escrita) | Suite Jest dispara contra `ReconciliacaoLotePermutaService` + rota `POST /permutas/reconciliar-lote` com deps mockados via tsyringe (sem ERP, sem DB) | `ReconciliacaoLotePermutaService.ts`, `routes/permutas.ts` (handler), `app/permutas/page.tsx` (`executarLote` + diálogo) | Dev (jest jsdom + node), pré-PR | Cada cenário do agregado (settled/parcial/error/dry-run/skipped) executa em <2s, isolado, determinístico; auth/RBAC checados na rota | ≥95% branch coverage no service do lote; 0 chamadas de rede reais; tempo do arquivo <2s; 3 cenários de auth (200/401/403) na rota; ≥1 caso para o handler do front |

> Lote é **escrita financeira em massa**: testabilidade aqui não é nice-to-have — é o gate que evita regressão silenciosa na execução de 26+ borderôs reais por clique.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| **Coverage do `ReconciliacaoLotePermutaService.ts` (linhas / stmts / funcs / branches)** | 100 / 100 / 100 / **80.76%** | ≥95 / ≥95 / 100 / ≥80% | ✅ | `cd src/backend && npx jest ReconciliacaoLotePermutaService --coverage --collectCoverageFrom='domain/service/permutas/ReconciliacaoLotePermutaService.ts'` |
| Branches não cobertos no service (linhas) | `98, 110, 119-122, 161` (ramo `dryRunOverride!==undefined`, `priCod!==undefined`, branch `err instanceof Error`, `r.dryRun` curto-circuito antes de erros) | 0 | ⚠️ | mesmo comando acima |
| `# casos no service` / `# branches do statusDoAdto` (`settled`/`parcial`/`error`/`dry-run`/`skipped`) | 5 testes × 5/5 status exercidos | 5/5 | ✅ | `ReconciliacaoLotePermutaService.test.ts:106-225` |
| `# testes na rota nova` (200 / 401 / 403) | 3 (success + 401 + 403) | ≥3 + erro do service | ⚠️ | `routes/permutas.test.ts:697-764` |
| `# testes no handler `executarLote` do front (jsdom) | 0 | ≥1 (dry-run, falha de rede, confirm dialog → executa) | ❌ | `find src/frontend/app/permutas -name '*.test.*'` (vazio) |
| Tests injection style (constructor + mocks) vs container.resolve em testes | `new ReconciliacaoLotePermutaService(...)` (constructor) + `container.registerInstance` na rota | DI seam direto (CLAUDE.md) | ✅ | `ReconciliacaoLotePermutaService.test.ts:97-103` |
| Não-determinismo: chamadas reais de rede / `Date.now()` / `Math.random` no caminho do lote | 0 chamadas reais (fetch/axios mockados); `dataMovto` é parâmetro de entrada (clock injetado pelo caller) | 0 | ✅ | `service` recebe `dataMovto` no input — ver `ReconciliacaoLotePermutaService.ts:42` |
| Tempo da suite do service | 1.3s | <2s | ✅ | run de coverage acima |
| Suite backend total / verde | 460 testes / 43 suites — verdes | verde | ✅ | `_shared-metrics.md:34` |
| Suite frontend total / verde | 51 testes / 11 suites — verdes | verde | ✅ | `_shared-metrics.md:35` |
| Asserts em log de auditoria (`logService.info` com `borderos`/`totalSettled`/`totalErros`/`dryRun`) | 0 (log é emitido, nunca asseverado) | ≥1 | ⚠️ | grep `logService` em `ReconciliacaoLotePermutaService.test.ts` (vazio) |
| Tests com Conexos write fixture (Recorded Test Cases) | N/A — o gate `CONEXOS_WRITE_ENABLED` mora em `ReconciliacaoPermutaService` (não no lote). Lote mocka 100% via `reconciliar` stub. | herdar do service-pai | ✅ | `_shared-metrics.md:25` (decisão de herança) |

> ⚠️ **Não medível localmente / fora do escopo --quick**: coverage agregado do repo backend/frontend (rodar `--coverage` global é caro e este run é `--quick`). Coverage **do delta** foi medida e está em 100% linhas / 80.76% branches no service.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | Service depende de duas interfaces nominais (`GestaoPermutasService.exporGestao`, `ReconciliacaoPermutaService.reconciliar`) — testes substituem cada uma via constructor injection direto, sem precisar de subclasse/spy mágico. | ✅ presente | `ReconciliacaoLotePermutaService.test.ts:89-103` |
| **Recordable Test Cases** | Casamentos da imagem real (`491→9026`, `256→11821`, `255→[19019, 20149-processado]`, dup de `9026`) replicados como fixture inline → reproduz o caso observado em produção, inclusive a dedup. | ✅ presente | `ReconciliacaoLotePermutaService.test.ts:40-79` |
| **Sandbox** | Rota `/permutas/reconciliar-lote` testada com `jest.mock('../domain/appContainer.js')` neutralizando o bootstrap real (Conexos/DB), e `container.registerInstance` injetando o service mockado. App Express é levantado num port aleatório (`app.listen(0)`). | ✅ presente | `routes/permutas.test.ts:9-12, 712-714` |
| **Executable Assertions** | Asserts cobrem **agregados** (`totalCasos`, `totalSettled`, `totalErros`, `borderos.sort()`, `dryRun`, `writeEnabled`) **e** mapa por adto (`byDoc['9026']`, `byDoc['11821']`, `byDoc['19019']`) com `toMatchObject({ status, borCod, priCod })`. Status derivado (`statusDoAdto`) é asseverado nos 5 ramos. | ✅ presente | `ReconciliacaoLotePermutaService.test.ts:136-156, 188-191, 222-224` |
| **Abstract Data Sources** | Gestão é recebida via `exporGestao` mock — não há acoplamento com Postgres/Conexos no teste do lote. O `dataMovto` (clock) é parâmetro de entrada → clock injetado pelo caller, não lido com `Date.now()` dentro do service. | ✅ presente | `ReconciliacaoLotePermutaService.ts:42, 65-69` |
| **Limit Structural Complexity** | Service ≈100 LOC, 1 método público + 1 privado (`statusDoAdto`). Teste com 5 casos cada <30 linhas. Sem `beforeAll` global compartilhado. | ✅ presente | `ReconciliacaoLotePermutaService.ts` (167 LOC totais), `ReconciliacaoLotePermutaService.test.ts` (226 LOC) |
| **Limit Non-Determinism** | Sem `Date.now()`/`Math.random`/`setTimeout` no service. `requestId` e `dataMovto` vêm do caller. Iteração sequencial sobre `ordem: string[]` → ordem das chamadas é determinística (`expect(chamados).toEqual(['9026','11821','19019'])`). | ✅ presente | `ReconciliacaoLotePermutaService.test.ts:158-174` |

> Cobertura completa dos 7 tactics relevantes para Testability. **Nenhum N/A.**

## 4. Findings (achados)

### F-testability-1: handler `executarLote` do front e diálogo de confirmação sem teste

- **Severidade**: P2
- **Tactic violada**: Executable Assertions (Front)
- **Localização**: `src/frontend/app/permutas/page.tsx:751-776` (handler), `:2129-2160` (`Dialog` de confirmação)
- **Evidência (objetiva)**:
  ```
  $ find src/frontend/app/permutas -name '*.test.*'
  # (vazio — page.tsx, BorderosPanel.tsx, clientes-filtro/ sem testes)
  ```
  O handler ramifica 4 caminhos de toast (`dryRun`, `settled>0`, `erros>0`, `settled===0 && erros===0`) + `catch` de rede. Nenhum coberto.
- **Impacto técnico**: regressão silenciosa nas mensagens ao usuário ou no fluxo `setConfirmLoteOpen(false) → reconciliarLoteAutomaticas → load()` passa sem ser pega. O `setExecutandoLote(false)` no `finally` é o que destrava o botão — bug que esqueça esse cleanup vira UI travada em produção sem alarme nos gates.
- **Impacto de negócio**: o botão executa **escrita financeira em massa**. UI travada após erro = analista clicando 2× = pode disparar lote duplicado. Diálogo de confirmação sem teste = mudança que remova o `Dialog` por engano não é detectada.
- **Métrica de baseline**: 0 testes / 5 caminhos do handler.

### F-testability-2: rota `/reconciliar-lote` sem caso para erro do service (5xx fall-through)

- **Severidade**: P2
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/routes/permutas.test.ts:697-764`
- **Evidência (objetiva)**:
  ```
  $ grep -n "reconciliar-lote" src/backend/routes/permutas.test.ts
  697: describe('POST /permutas/reconciliar-lote', ...)
  # 3 casos: 200, 403, 401. Nenhum mockRejectedValue.
  ```
  Compare com `/ingestao`, que cobre 200/409/500/401 (`routes/permutas.test.ts:166-177` testa `mockRejectedValue(new Error('boom'))`).
- **Impacto técnico**: se o service do lote lançar (ex.: `exporGestao` falha por DB fora do ar), o caminho do `errorMiddleware` não é exercitado. Pode vazar stack-trace, retornar 200 com `undefined`, ou nunca registrar o erro no auditor.
- **Impacto de negócio**: lote é admin-only + heavyRouteLimiter (10/min) — uma falha silenciosa significa o analista clicar de novo e gastar uma fatia do limit sem feedback claro.
- **Métrica de baseline**: 3 casos na rota (200/401/403) vs 4 análogos em `/ingestao`.

### F-testability-3: log de auditoria do lote não é asseverado

- **Severidade**: P3
- **Tactic violada**: Executable Assertions (Observability)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:129-141` (emite `LOG_TYPE.BUSINESS_INFO` com `requestId`/`executadoPor`/`totalCasos`/`totalSettled`/`totalErros`/`borderos`/`dryRun`)
- **Evidência (objetiva)**:
  ```
  $ grep -n "logService\|info" src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.test.ts
  9:  const buildLog = () => ({ info: jest.fn().mockResolvedValue(undefined) }) as unknown as LogService;
  # Mock criado, nunca asseverado.
  ```
- **Impacto técnico**: a auditoria de quem disparou o lote (`executadoPor`) e o agregado emitido são contratos com a observabilidade — um refactor que mude o shape do log passa silencioso.
- **Impacto de negócio**: lote é escrita financeira; o log é a única trilha forense pós-fato se o `resultados[]` for descartado. Perder o `executadoPor` no log = perder accountability.
- **Métrica de baseline**: 0 asserts sobre `logService.info`.

### F-testability-4: branches não-cobertos do service (linhas 98, 110, 119-122, 161)

- **Severidade**: P3
- **Tactic violada**: Limit Non-Determinism / Executable Assertions
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoLotePermutaService.ts |   100  |   80.76  |   100  |   100  | 98,110,119-122,161
  ```
  - L98 `...(dryRunOverride !== undefined ? { dryRunOverride } : {})` — nenhum teste passa `dryRunOverride` explícito (o caso "dry-run" mocka o `reconciliar` direto, não usa override).
  - L110 `priCod !== undefined` — não há caso onde o casamento existe sem `priCod` (esperado, mas o branch fica frio).
  - L119-122 `err instanceof Error ? err.message : String(err)` — o caso de continue-on-error sempre lança `Error`; nunca testou throw de string/objeto.
  - L161 `if (r.dryRun) return 'dry-run'` precede o ramo `erros > 0`; um cenário "dry-run com erros" não existe.
- **Impacto técnico**: 80.76% de branch é o piso — o ramo do `dryRunOverride` é o **contrato com a rota**, que sempre encaminha `dryRun` do body. Mudar a semântica do override sem teste passa.
- **Impacto de negócio**: `dryRunOverride` é a alavanca de "preview sem POST" do lote — o caminho que permite o analista validar antes de comitar 26 borderôs. Sem teste explícito, a alavanca pode silenciar.
- **Métrica de baseline**: branch coverage 80.76% → alvo ≥95%.

## 5. Cards Kanban

### [testability-1] Cobrir o handler `executarLote` e o diálogo de confirmação no front (Testing Library)

- **Problema**
  > O botão "Executar todas" dispara escrita financeira em massa (≈26 borderôs reais). O handler `executarLote` e o `Dialog` de confirmação em `app/permutas/page.tsx` (~750-776, 2129-2160) não têm um único teste. Os 4 ramos de `toast` (`dryRun` / `settled>0` / `erros>0` / `nada a executar`) + o `catch` + o `finally` que destrava o botão estão a uma mudança de regressão silenciosa de virar bug em produção.

- **Melhoria Proposta**
  > Criar `src/frontend/app/permutas/page.test.tsx` com Testing Library + jsdom: 4 cenários estimulando o handler com `reconciliarLoteAutomaticas` mockada (`jest.mock('@/lib/api')`) — cobre dry-run, sucesso parcial, erro de rede e "nada a executar". Asseverar `screen.getByRole('alert')` (toast/sonner) e que `setExecutandoLote(false)` libera o botão. Aproveitar `fast-check` para gerar combinações `(totalSettled, totalErros)` se vier baixo custo. Bass tactic: **Executable Assertions** + **Limit Non-Determinism**.

- **Resultado Esperado**
  > Coverage do handler `executarLote` 0% → 100% linhas / ≥80% branches; 0 → ≥4 testes do front no diálogo de confirmação; regressão na mensagem ao analista é detectada pelo CI.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Testes do front em `permutas/page.tsx`: 0 → ≥4
  - Branches cobertos do handler `executarLote`: 0/5 → 5/5
- **Risco de não fazer**: refactor da UI (ou troca de `sonner` por outro toast) quebra silenciosamente o feedback do lote; analista clica 2× achando que não disparou, gera lote duplicado (mitigado por idempotência do service, mas trilha de auditoria fica suja).
- **Dependências**: nenhuma.

### [testability-2] Adicionar caso de erro do service na rota `/reconciliar-lote` (5xx + 422)

- **Problema**
  > A rota `POST /permutas/reconciliar-lote` (`routes/permutas.test.ts:697-764`) testa 200/401/403. Nenhum `mockRejectedValue` — se `ReconciliacaoLotePermutaService.reconciliarLote` lançar (DB de gestão fora, validador de input falha, race), o caminho do `errorMiddleware` não é exercitado. A rota irmã `/ingestao` cobre esse cenário (`mockRejectedValue(new Error('boom'))` → 500).

- **Melhoria Proposta**
  > Adicionar 2 casos no `describe('POST /permutas/reconciliar-lote')`: (1) service lança `Error` genérico → 500 + body com `error`; (2) body inválido (ex.: `dryRun: "not-a-bool"`) → 400 do Zod. Espelhar o padrão dos casos `/ingestao` (`routes/permutas.test.ts:166-177`). Bass tactic: **Executable Assertions**.

- **Resultado Esperado**
  > Casos na rota `/reconciliar-lote` 3 → 5; cobertura do `errorMiddleware` pelo caminho do lote 0 → 1; contrato do Zod do body é defendido por teste.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤0.5d)
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - Casos na rota: 3 → 5
  - Status HTTP cobertos: {200, 401, 403} → {200, 400, 401, 403, 500}
- **Risco de não fazer**: regressão no shape do erro vaza stack-trace para o front; troca do Zod schema passa silenciosa.
- **Dependências**: nenhuma.

### [testability-3] Asseverar o log de auditoria do lote (executadoPor + agregado)

- **Problema**
  > `ReconciliacaoLotePermutaService` emite `logService.info({ type: BUSINESS_INFO, message: 'permuta batch reconciliation', data: { requestId, executadoPor, totalCasos, totalSettled, totalErros, borderos, dryRun } })` como única trilha forense pós-fato. O mock de log existe em `test:9` mas nunca é asseverado. Um refactor que troque `executadoPor` por `userId` quebra a auditoria sem alarme.

- **Melhoria Proposta**
  > Adicionar `expect(logSpy.info).toHaveBeenCalledWith(expect.objectContaining({ type: LOG_TYPE.BUSINESS_INFO, data: expect.objectContaining({ executadoPor, totalSettled, totalErros, borderos }) }))` em pelo menos 2 dos 5 cenários do `describe` (sucesso + continue-on-error). Bass tactic: **Executable Assertions** (Observability).

- **Resultado Esperado**
  > Asserts em `logService.info` no lote 0 → ≥2; mudança no shape do log (campo dropado/renomeado) é detectada pelo CI; trilha forense de quem disparou o lote é contrato testado.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S (≤0.25d)
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - Asserts sobre `logService.info`: 0 → ≥2
- **Risco de não fazer**: drift entre o log e o dashboard de auditoria; em incidente real, o `executadoPor` some e a investigação fica cega.
- **Dependências**: nenhuma.

### [testability-4] Fechar branches frios do service (`dryRunOverride`, fallback de erro não-Error)

- **Problema**
  > Branch coverage do `ReconciliacaoLotePermutaService` em 80.76%. Linhas frias: `L98` (`dryRunOverride !== undefined`, a alavanca de "preview sem POST" do lote) e `L119-122` (`err instanceof Error ? err.message : String(err)`, o fallback para throws não-Error). O `dryRunOverride` é o contrato com a rota — sem teste, mudar a semântica passa silenciosamente.

- **Melhoria Proposta**
  > Adicionar 2 casos no `describe`: (1) `reconciliarLote({ ..., dryRunOverride: true })` → verificar que o spy `reconciliar` recebeu `dryRunOverride: true`; (2) um adto onde o stub `throw 'string-cru'` → verificar que `resultados[0].erro === 'string-cru'` (cobre o branch `String(err)`). Bass tactic: **Executable Assertions** + **Limit Non-Determinism**.

- **Resultado Esperado**
  > Branch coverage de `ReconciliacaoLotePermutaService.ts` 80.76% → ≥95%; contrato do `dryRunOverride` (alavanca de preview) defendido por teste 0 → 1.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S (≤0.25d)
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - Branch coverage no service: 80.76% → ≥95%
  - Casos no `describe`: 5 → 7
- **Risco de não fazer**: refactor que troque a interface de `dryRunOverride` (renomeia, vira `mode: 'preview'`) passa verde; perde-se a alavanca de preview do lote em produção sem ninguém notar até o próximo dry-run real.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Coverage medida com `npx jest ReconciliacaoLotePermutaService --coverage --collectCoverageFrom=...` → 100% linhas / 80.76% branches. Run `--quick`, não rodei coverage global do repo.
- **Cross-QA**: F-testability-3 (asserts no log de auditoria) alimenta também **Security** (`executadoPor` no log é evidência de RBAC) e **Fault-Tolerance** (log é a trilha de retry/continue-on-error). F-testability-1 (testes do diálogo de confirmação) alimenta **Availability** (botão travado pós-erro = degradação) e **Security** (confirm dialog é a barreira humana antes da escrita em massa).
- O service do lote é um **exemplar** de testabilidade no codebase: DI por constructor, deps mockados como objetos planos, clock (`dataMovto`) injetado, 0 não-determinismo. Cards P2/P3 fecham gaps periféricos — não há P0/P1.
- Não tentei rodar coverage do front (`page.tsx` é monolítico; sem fixtures de teste a coverage seria 0). O card-1 endereça diretamente.
