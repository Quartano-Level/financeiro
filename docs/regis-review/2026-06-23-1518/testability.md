---
qa: Testability
qa_slug: testability
run_id: 2026-06-23-1518
agent: qa-testability
generated_at: 2026-06-23T18:00:00Z
scope: all
score: 7.5
findings_count: 6
cards_count: 6
---

# Testability — Regis-Review (Permutas Fase 3 — write-back fin010)

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/CI rodando a suite | Mudança nos write-paths Fase 3 (`ReconciliacaoPermutaService`, `ConexosClient` fin010, `PermutaExecucaoRepository`, modal Baixar) | Backend (service + client + repository + route) + Frontend (`app/permutas/page.tsx` modal Baixar) | Pre-merge no CI; local na máquina do dev (sem .env de produção); fin010 dry-run por padrão | Suite verde, com cobertura **garantida** dos guard-rails (dry-run forçado, anti-super-pagamento, idempotência, write-ahead) e do contrato de payload `bxaMnyJuros=conta 131` vs `bxaMnyDesconto`; sem flakes; sem dependência de relógio do host | Tempo de feedback < 10s (BE atual 7.6s, 40 suites/399 tests verdes); 100% das invariantes financeiras do write-path defendidas por teste; 0 não-determinismo nos write-paths Fase 3 |

> Cenário concreto observado nesta auditoria: `cd src/backend && npx jest Reconciliacao ConexosClient` → **40 suites, 399 testes, 7.6s, 0 falhas**. As 8 invariantes financeiras do `ReconciliacaoPermutaService` (dry-run default, dry-run forçado por flag, handshake 5-chamadas, anti-super-pay, idempotência skip, erro registrado, alocação vazia, DESCONTO) são todas defendidas. O risco residual está **fora** do service: (a) o repositório `PermutaExecucaoRepository` (write-ahead + idempotência) não tem teste algum; (b) o modal Baixar e o `lib/api.ts::reconciliarAdiantamento` no FE também não; (c) `todayUtcMidnightMs()` na rota lê `new Date()` direto.

## 2. Métricas observadas

### Tabela canônica de cobertura por superfície Fase 3 (Bass métrica obrigatória #1)

| Superfície Fase 3 | LOC | Test file | # `it()` | Cobertura observada | Status | Fonte |
|---|---|---|---|---|---|---|
| `domain/service/permutas/ReconciliacaoPermutaService.ts` | 352 | `ReconciliacaoPermutaService.test.ts` (235 LOC) | 8 | dry-run default, dry-run forçado por flag, handshake 5-call (settled+bxaCodSeq+payload assert), anti-super-pay (bxaMnyValor=0 → markError, sem gravar), idempotência (alreadySettled → skipped), erro final (markError, sem markSettled), alocação vazia (throw), DESCONTO (bxaMnyJuros=0, bxaMnyDesconto=150) | ✅ | `npx jest Reconciliacao` |
| `domain/client/ConexosClient.ts` (write methods §1344-1469) | 5 métodos write (criarBordero/validarTituloBaixa/validarTituloPermuta/atualizarValorLiquido/gravarBaixaPermuta) | `ConexosClient.test.ts` `describe('fin010 write methods')` | 6 | 5 happy-paths (path + body shape assertados) + 1 error-wrapping (ConexosError) | ✅ | `npx jest ConexosClient` |
| `domain/repository/permutas/PermutaExecucaoRepository.ts` | 206 | **AUSENTE** | **0** | **0% — nenhuma asserção sobre as 5 queries (`beginExecution`, `setRequestPayload`, `markSettled`, `markError`, `findByIdempotencyKey`, `listByAdiantamento`)** | ❌ P0 | `find ... -name PermutaExecucaoRepository.test.ts` (vazio) |
| `routes/permutas.ts` POST `/adiantamentos/:docCod/reconciliar` (linha 359-381) | 22 LOC | testado indiretamente pelo service test | n/a | controlador thin (resolve service + delega) | ⚠️ | grep linha 39-42 |
| `routes/permutas.ts::todayUtcMidnightMs()` (linhas 39-42) | 4 LOC | **AUSENTE** | **0** | `new Date()` direto → não-determinismo no default `dataMovto` (a rota cai em "hoje" do host, sem teste defendendo o cálculo de meia-noite UTC) | ⚠️ P2 | grep `Date.now\|new Date()` em src/backend |
| `frontend/lib/api.ts::reconciliarAdiantamento` (linhas 242-266) | 24 LOC | **AUSENTE** | **0** | request shape (path encode, body `{dryRun, dataMovto}`, error parsing) sem teste | ⚠️ P1 | `find src/frontend/__tests__ -name 'reconcil*'` (vazio) |
| `frontend/app/permutas/page.tsx` modal Baixar (linhas 705-742, 2174-2230, ~2311 LOC totais) | ~70 LOC do bloco modal | **AUSENTE** | **0** | preview (dry-run) → confirmação real, exibição de `borCod`/`bxaCodSeq`, parsing de `result.dryRun`/`resultados[].status` — toda lógica de UX da escrita financeira sem cobertura | ⚠️ P1 | `grep -rn reconciliar src/frontend/__tests__` (vazio) |

### Outras métricas — testabilidade Fase 3

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Testes BE rodando para o escopo (`jest Reconciliacao ConexosClient`) | 40 suites / 399 tests / 7.6s / 0 falhas | verde | ✅ | execução desta auditoria |
| Razão test files / source files no service de permutas Fase 3 | 1 / 1 (`Reconciliacao*`) | 1 | ✅ | `find` |
| Razão test files / source files no repositório de permutas | 5 / 6 (falta `PermutaExecucaoRepository`) | 6 / 6 | ❌ | `ls src/backend/domain/repository/permutas/` |
| Controllability dos guard-rails (`conexosWriteEnabled`/`conexosDryRun`) | injetados via `EnvironmentProvider` mockado (test linhas 4-5, 59-64) — `envFlags` mutável por teste | injetáveis | ✅ | `ReconciliacaoPermutaService.test.ts:4-80` |
| Pattern de construção em test (constructor injection vs container.resolve) | constructor injection (linha 65-72 do service test; idem ConexosClient.test:1346,1353) — segue CLAUDE.md ("Test the service layer, not the handler directly") | constructor injection | ✅ | grep `new ReconciliacaoPermutaService\|new ConexosClient` no test |
| `new Date()` / `Date.now()` em src Fase 3 sem clock injetável | 1 sítio: `routes/permutas.ts:39-42 todayUtcMidnightMs()` (default do `dataMovto` quando body não envia) | 0 (usar ClockProvider) | ⚠️ | grep |
| `Math.random` / `crypto.randomUUID` em src Fase 3 | 0 | 0 | ✅ | grep |
| Network/IO em testes unitários do escopo | 0 — todos os calls do `ConexosClient` são mockados via `legacy.postGeneric: jest.fn()` (test linha 10); service mocka 100% das 6 deps via `as never` | 0 | ✅ | `ConexosClient.test.ts:10`, `ReconciliacaoPermutaService.test.ts:65-72` |
| Asserts sobre **payload final do passo 5** (contrato de escrita financeira) | 1 (`payload.toMatchObject({docCod:5078, bxaDocCod:2767, bxaMnyValor:40879.9, bxaMnyJuros:220, bxaCodGerJuros:131, gerNumPermuta:198, bxaVldAdto:1})` — service test:133-142) | ≥ 1 + DESCONTO (já feito) | ✅ | service test:115-150, 217-234 |
| Assertion sobre `markSettled` (write-ahead → confirmação) | 1 (service test:144-147: `markSettled` com `borCod:1999, bxaCodSeq:1, valorBaixado:40879.9`) | ≥ 1 | ✅ | service test |
| Assertion sobre `markError` (write-ahead → falha sem regressão) | 2 (anti-super-pay test:165; erro final test:201-204) — verifica que `markSettled NÃO é chamado` | ≥ 1 | ✅ | service test |
| Property-based tests sobre invariantes monetárias do payload (juros+desconto = variacao, juros XOR desconto, soma das alocações × N pares) | 0 (e `fast-check` não está nas deps do BE — `grep fast-check src/backend/package.json` vazio) | ≥ 1 invariante monetária Fase 3 (e.g., `for all alocações, payload.bxaMnyJuros + payload.bxaMnyDesconto === aloc.variacaoResultado`) | ❌ P3 | `package.json` BE |
| Component test do modal Baixar (preview → confirmação real, toast de borCod/bxaCodSeq) | 0 | ≥ 1 | ❌ P1 | grep `__tests__` |
| Snapshot/contract test do payload fin010 (dry-run = real, garantindo que preview e payload final são equivalentes em estrutura) | 0 (`buildPreviewPayload` e `buildFinalPayload` são funções separadas, com risco de drift) | ≥ 1 | ⚠️ P2 | service.ts:265-340 |

## 3. Tactics — Cobertura no Fase 3

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | Service constrói deps via constructor; `LEGACY_CONEXOS_TOKEN = Symbol(...)` no ConexosClient permite injetar um `LegacyConexosShape` mock sem tocar HTTP — exatamente a "interface especializada para teste" | ✅ presente | `ConexosClient.ts:34`, `ConexosClient.ts:401`, `ConexosClient.test.ts:10` |
| Record/Playback (Recordable Test Cases) | `ReconciliacaoPermutaService.test.ts` usa payload com valores do probe real (`bxaMnyValor: 40879.9`, `gerNumPermuta: 198`, `pesCod: 2658`, `bxaMnyValorPermuta: 41175.97`) — fixtures de probe embutidas como mock values. Não há `__fixtures__/` separado mas o dado é rastreável | ⚠️ parcial | service test:23-42 |
| Separate Interfaces from Implementation (DI seam) | tsyringe + `@injectable()` em todas as 6 deps do service; mock by passar `as never` | ✅ presente | service.ts:57-69 |
| Specialize Access Routes/Interfaces (test-only flag) | `dryRunOverride?: boolean` no `ReconciliarInput` — caminho dedicado para forçar dry-run em teste (e UX), distinto do env flag | ✅ presente | service.ts:24 |
| Executable Assertions | `expect(...).toMatchObject({bxaCodGerJuros:131, gerNumPermuta:198, bxaVldAdto:1})` — invariantes do contrato fin010 expressas como asserts | ✅ presente | service test:133-142 |
| Sandbox | Guard-rails (`conexosWriteEnabled=false` por default na test setup `beforeEach` linhas 77-80) + `EnvironmentProvider` mockado isolam o teste do ambiente do dev. Nenhuma leitura de `.env` no caminho Fase 3 | ✅ presente | service test:4-5, 77-80, 59-64 |
| Abstract Data Sources | `PermutaExecucaoRepository` injetado; service não toca DB direto. Porém o repositório **em si** não tem teste — sua abstração só vale quando o lado dele também é defensável | ⚠️ parcial | service.ts:64-65 + repo sem test |
| Limit Structural Complexity | `ReconciliacaoPermutaService` 352 LOC, `executarBaixa` privada extraída (linha 168-262), `buildFinalPayload`/`buildPreviewPayload` separados. Teste do service tem 235 LOC para 8 cases — proporção saudável | ✅ presente | service.ts wc |
| Limit Non-Determinism | (a) `EnvironmentProvider` injetado e mockado — não-determinismo de env eliminado. (b) **`todayUtcMidnightMs()` na rota lê `new Date()` direto** (linha 40) — default do `dataMovto` é não-determinístico se body do client não enviar (UX manda, mas defesa em profundidade falha). (c) Nenhuma randomness no caminho Fase 3 | ⚠️ parcial | routes/permutas.ts:39-42 |
| Built-in Monitors | `LogService` mockado (`info`, `error`, `warn`) — chamadas dos dois log-points (`'permuta reconciliacao DRY-RUN'` linha 115, `'permuta reconciliacao SETTLED'` linha 250, `'permuta reconciliacao FALHOU'` linha 145) podem ser asseridas. Os tests **não asseridam o conteúdo do log de SETTLED/FALHOU** — só mockam para silenciar | ⚠️ parcial | service test:58 (`info: jest.fn()` sem assert) |

## 4. Findings

### F-testability-1: `PermutaExecucaoRepository` sem teste unitário — write-ahead + idempotência indefendidos

- **Severidade**: P0 (crítico — risco de incidente em produção)
- **Tactic violada**: Abstract Data Sources / Specialized Interfaces (a abstração é inerte se o lado abstraído não tem teste)
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts` (206 LOC) — não há `PermutaExecucaoRepository.test.ts` no diretório (`ls src/backend/domain/repository/permutas/` confirma 5 test files para 6 sources)
- **Evidência (objetiva)**:
  ```
  $ find /tmp/permutas-reconciliacao-wt/src/backend/domain/repository/permutas -name '*.test.ts'
  → ClienteFiltroRepository.test.ts, PermutaAlocacaoRepository.test.ts, PermutaProcessamentoRepository.test.ts,
    PermutaRelationalRepository.test.ts, PermutaSnapshotRepository.test.ts
  (sem PermutaExecucaoRepository.test.ts)
  ```
  Esse repositório carrega:
  - **`beginExecution`** (linha 88-121) — o coração da idempotência (`INSERT ... ON CONFLICT (idempotency_key) DO UPDATE SET status = CASE WHEN ... = 'settled' THEN ... ELSE EXCLUDED.status END`). Se essa expressão CASE/WHEN regredir, um par já settled volta a `reconciling` e o service tenta gravar **um segundo borderô para o mesmo par** (perda de invariante de idempotência — super-pagamento).
  - **`markSettled`** (linha 132-165) — única transição válida para `settled`.
  - **`markError`** (linha 167-186) — `bor_cod = COALESCE($borCod, bor_cod)` (preserva borCod prévio em erros tardios).
- **Impacto técnico**: regressão silenciosa no `CASE WHEN` da idempotência ou nas colunas mapeadas (`mapRow` linha 188-205) não dispara teste. O service `ReconciliacaoPermutaService` mocka o repo (test linhas 44-52), então **um bug no SQL do repo passa pelos 8 tests do service**. Sibling repos (`PermutaAlocacaoRepository.test.ts:13`) já demonstram que o pattern de teste é viável sem DB real — `toContain('$key')`, `not.toMatch(/'+|\${/)`, `toEqual({...})` sobre a mock do `PostgreeDatabaseClient`.
- **Impacto de negócio**: o write-back fin010 escreve diretamente no Conexos (risco arquitetural #1 da Fase 3). Uma idempotência quebrada = gravação dupla no ERP financeiro = duplicação de baixa de pagamento, exigindo estorno manual com SISPAG e reconciliação contábil. Caminho de regressão **não defendido** por nenhum teste.
- **Métrica de baseline**: 0 testes / 5 métodos públicos no repositório (`findByIdempotencyKey`, `listByAdiantamento`, `beginExecution`, `setRequestPayload`, `markSettled`, `markError`); 0% asserções sobre SQL parametrizado (Rule #5 inviolável); 0% asserções sobre o CASE WHEN de idempotência.

### F-testability-2: Modal Baixar do frontend (page.tsx 705-742, 2174-2230) sem component test — toda a UX da escrita financeira indefendida

- **Severidade**: P1 (alto — degrada QA mensurável)
- **Tactic violada**: Sandbox / Limit Structural Complexity (file gigante sem isolamento testável)
- **Localização**: `src/frontend/app/permutas/page.tsx:705-742` (handlers `handlePreview` / `handleBaixar`), `:2174-2230` (Dialog `Baixar permuta no ERP (fin010)`), `:939-943` (botão "Baixar"). 2311 LOC totais no arquivo.
- **Evidência (objetiva)**:
  ```
  $ find src/frontend/__tests__ -name '*.test.tsx' -o -name '*.test.ts' \
      | grep -iE 'reconcili|baix|permuta-modal' → vazio
  $ grep -rn 'reconciliarAdiantamento\|reconcili' src/frontend/__tests__ → vazio
  ```
  Bloco do modal (linhas 705-742):
  ```typescript
  const handlePreview = async (p: AdiantamentoElegivelOut) => { ... reconciliarAdiantamento(p.docCod, { dryRun: true }) ... }
  const handleBaixar = async () => { const result = await reconciliarAdiantamento(reconcilAdto.docCod, { dryRun: false })
    if (result.dryRun) { ... } else {
      const ok = result.resultados.filter((r) => r.status === 'settled').length
      if (ok > 0) toast.success(`${ok} baixa(s) gravada(s) no fin010 (borderô ${result.borCod}).`)
    }
  ```
- **Impacto técnico**: a única UX que dispara escrita real no ERP (depois do guard-rail backend) não tem teste. Cenários não defendidos: (a) modal **preview** (dry-run) renderiza juros local sem chamar o ERP; (b) modal **execução** distingue `result.dryRun=true` vs `false`; (c) contagem de `status === 'settled'` e renderização do borCod; (d) caminho de erro (`status === 'error'`) na lista de `resultados`. Uma renomeação de campo (`bxaCodSeq` → `bxa_cod_seq`) ou um early-return errado no handler passa typecheck/lint sem detecção.
- **Impacto de negócio**: a Fase 3 escreve no fin010 controlando pagamentos a fornecedores internacionais. Bug de UX que envia `dryRun: undefined` em vez de `false` faz o usuário "confirmar" mas o backend cai em dry-run silencioso (porque o env-default é dry-run), e o analista pensa que baixou — descobre na conciliação bancária dias depois.
- **Métrica de baseline**: 0% cobertura do modal; 0 testes assertando `reconciliarAdiantamento` foi chamado com `{dryRun: false}`; arquivo de 2311 LOC sem qualquer teste de unidade que o toque.

### F-testability-3: `lib/api.ts::reconciliarAdiantamento` (linhas 242-266) sem teste de contrato HTTP

- **Severidade**: P1 (alto)
- **Tactic violada**: Specialized Interfaces (boundary HTTP)
- **Localização**: `src/frontend/lib/api.ts:242-266`
- **Evidência (objetiva)**: o repo tem precedente para esse padrão de teste — `src/frontend/__tests__/alocacao-api.test.ts`, `permutas-ingestao-api.test.ts`, `clientes-filtro-api.test.ts` testam outras funções do `lib/api.ts` mockando `fetch`. **Não há equivalente para `reconciliarAdiantamento`**. O contrato testável é claro:
  ```typescript
  // espera: fetch chamado com path encodeURIComponent(docCod), method POST,
  // body JSON.stringify com {dryRun?, dataMovto?} e header content-type
  ```
- **Impacto técnico**: mudança no path (`/permutas/adiantamentos/...`) ou no shape do body (`{dryRun}` vs `{dry_run}`) quebra o write e nenhum teste detecta antes de produção.
- **Impacto de negócio**: idem F-2 — escrita financeira silenciosamente quebrada.
- **Métrica de baseline**: 3 funções de `lib/api.ts` testadas; `reconciliarAdiantamento` (a única função write-back) e `fetchExecucoes` sem teste.

### F-testability-4: `todayUtcMidnightMs()` em `routes/permutas.ts:39-42` é não-determinístico e sem teste

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `src/backend/routes/permutas.ts:39-42`
- **Evidência (objetiva)**:
  ```typescript
  const todayUtcMidnightMs = (): number => {
      const now = new Date();
      return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };
  ```
  Usado no default da rota: `dataMovto: parsed.data.dataMovto ?? todayUtcMidnightMs()` (linha 376). Nenhum `useFakeTimers`/`setSystemTime` ataca esse caminho. O service test sempre passa `dataMovto: 1782172800000` explícito (cenário do client OK), deixando o default da rota indefendido.
- **Impacto técnico**: se a função evoluir (e.g., shift BR/UTC), regride sem teste pegar. Em testes futuros do route handler, o resultado depende do relógio da CI.
- **Impacto de negócio**: o `borDtaMvto` é a data contábil do borderô no Conexos. Erro de fuso = baixa no dia errado = relatório fechado errado.
- **Métrica de baseline**: 1 sítio não-determinístico em src Fase 3 / alvo 0 (clock injetável ou teste com `setSystemTime`).

### F-testability-5: Log assertions ausentes nos caminhos de sucesso/erro do write-back

- **Severidade**: P2
- **Tactic violada**: Executable Assertions / Built-in Monitors
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:114-118, 143-148, 248-252`; test `:58, 165, 200-204`
- **Evidência (objetiva)**: o test mocka `logService = { info: jest.fn(), error: jest.fn(), warn: jest.fn() }` mas **nunca** chama `expect(logService.info).toHaveBeenCalledWith(...)` ou `expect(logService.error).toHaveBeenCalledWith(...)`. Os três log-points são audit-trail do Fase 3 (DRY-RUN, SETTLED, FALHOU), com `type: LOG_TYPE.BUSINESS_INFO`/`BUSINESS_WARN` e payload `{adiantamentoDocCod, invoiceDocCod, borCod, bxaCodSeq}`. Se a forma desses logs degradar (e.g., perder `bxaCodSeq` no SETTLED), nenhuma observação automatizada captura.
- **Impacto técnico**: observability runtime depende desses logs; regressão silenciosa.
- **Impacto de negócio**: trilha de auditoria financeira incompleta em produção — perda de evidence pack para conciliação manual após falha.
- **Métrica de baseline**: 0 `expect(logService.*).toHaveBeenCalledWith` em todo o `ReconciliacaoPermutaService.test.ts` vs 3 sítios de log no service.

### F-testability-6: `buildPreviewPayload` e `buildFinalPayload` separados sem invariante "preview ⊆ final" testada

- **Severidade**: P3 (baixo)
- **Tactic violada**: Executable Assertions (invariante cross-function)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:265-340`
- **Evidência (objetiva)**: o preview (dry-run) é mostrado ao analista no modal Baixar como prévia do que será gravado. Mas as duas funções (`buildPreviewPayload` 320-340, `buildFinalPayload` 265-318) são código separado — o preview pode silenciosamente divergir do payload final (e.g., `bxaCodGerJuros: 131` em ambos hoje, mas se o final mudar para 132 e o preview não, o usuário vê um número e o ERP recebe outro). Os 8 tests do service não têm propriedade comparando os dois.
- **Impacto técnico**: drift entre preview e wire silencioso.
- **Impacto de negócio**: analista aprova baseado em preview que não bate com o que vai pro ERP — risco de auditoria contábil.
- **Métrica de baseline**: 0 testes assertando `buildPreviewPayload` e `buildFinalPayload` têm os mesmos `bxaMnyJuros / bxaMnyDesconto / bxaCodGerJuros / docCod / bxaDocCod` para a mesma alocação.

## 5. Cards Kanban

### [testability-1] Adicionar teste unitário ao `PermutaExecucaoRepository` (write-ahead + idempotência)

- **Problema**
  > O repositório que carrega o write-ahead da Fase 3 (`beginExecution` com `INSERT ... ON CONFLICT (idempotency_key) DO UPDATE SET status = CASE WHEN ... settled ... END`) e as transições terminais (`markSettled` / `markError`) não tem nenhum teste. O service que o usa mocka 100% — um bug no CASE WHEN da idempotência (regressão de `settled` → `reconciling`) passaria pelos 8 testes do service e levaria a uma **segunda gravação de baixa no fin010 para o mesmo par adto↔invoice** (super-pagamento). Sibling repos (`PermutaAlocacaoRepository.test.ts:13`) já demonstram que dá pra testar sem DB real, mockando `PostgreeDatabaseClient` e assertando SQL parametrizado.

- **Melhoria Proposta**
  > Criar `src/backend/domain/repository/permutas/PermutaExecucaoRepository.test.ts` seguindo o pattern do `PermutaAlocacaoRepository.test.ts`: (a) `beginExecution` — assertar SQL contém `ON CONFLICT (idempotency_key)`, `CASE WHEN ... = 'settled'`, `alreadySettled=true` quando mock retorna `{status:'settled'}`; (b) `setRequestPayload` — assertar parametrização `$payload::jsonb`; (c) `markSettled` — assertar 6 colunas + `status='settled'` + `erro_mensagem = NULL`; (d) `markError` — assertar `bor_cod = COALESCE($borCod, bor_cod)`; (e) `findByIdempotencyKey` / `listByAdiantamento` — assertar shape do `mapRow`. Bonus: 1 teste de integração com `*.integration.test.ts` opcional (DB real), mas o gap P0 fecha com os unit-tests parametrizados. Tactic Bass: Abstract Data Sources + Executable Assertions.

- **Resultado Esperado**
  > `PermutaExecucaoRepository.ts` coberto (0 → 6 testes, cobrindo as 6 operações públicas); a invariante de idempotência do `CASE WHEN` defendida; razão test/source no diretório `repository/permutas` 5/6 → 6/6 = 1.0.

- **Tactic alvo**: Abstract Data Sources / Executable Assertions
- **Severidade**: P0
- **Esforço estimado**: S (≤1d — pattern já existe no sibling)
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - # testes em `PermutaExecucaoRepository.test.ts`: 0 → ≥ 6
  - Razão test/source em `domain/repository/permutas`: 5/6 → 6/6
  - Asserções sobre `ON CONFLICT (idempotency_key)` e `CASE WHEN ... 'settled'`: 0 → ≥ 2
- **Risco de não fazer**: super-pagamento em produção (segunda baixa no fin010 para o mesmo par) detectado só na conciliação bancária dias depois; estorno manual com SISPAG + ajuste contábil.
- **Dependências**: nenhuma

### [testability-2] Component test do modal Baixar (`app/permutas/page.tsx`)

- **Problema**
  > O modal de baixa (linhas 705-742 dos handlers, 2174-2230 do Dialog) é a única UX que dispara escrita real no fin010 e não tem nenhum teste. Cenário não defendido: usuário clica "Baixar" mas a flag `dryRun: false` é enviada como `undefined` por bug de UX → backend cai no dry-run silencioso (default conservador) → analista pensa que executou. Detecção só ocorre na conciliação contábil dias depois.

- **Melhoria Proposta**
  > Extrair o modal Baixar para um componente isolado `frontend/components/permutas/ReconciliarModal.tsx` (`Limit Structural Complexity` — page.tsx tem 2311 LOC) e criar `__tests__/permutas-reconciliar-modal.test.tsx` com Testing Library: (a) abrir modal → renderiza preview (mock `reconciliarAdiantamento({dryRun:true})`); (b) "Confirmar baixa" → chama `reconciliarAdiantamento` com `{dryRun: false}` exatamente; (c) `result.dryRun === false && resultados[0].status === 'settled'` → toast com `borCod` e `bxaCodSeq`; (d) `status === 'error'` → renderiza mensagem com `erro`. Tactic Bass: Sandbox + Specialized Interfaces.

- **Resultado Esperado**
  > Modal Baixar testado (0 → 4+ testes); page.tsx reduzido (~2311 LOC → ~2240 LOC) com o modal isolado; cobertura do bloco modal 0% → ≥ 70%.

- **Tactic alvo**: Sandbox / Limit Structural Complexity
- **Severidade**: P1
- **Esforço estimado**: M (2–3d — exige extração do componente)
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - # testes do modal Baixar: 0 → ≥ 4
  - LOC do `page.tsx`: 2311 → ≤ 2250
  - Assert "Confirmar dispara `reconciliarAdiantamento({dryRun: false})`": ausente → presente
- **Risco de não fazer**: dry-run silencioso interpretado como execução; analista assina "baixa feita" sem efeito no ERP; falha de processo financeiro detectada tardiamente.
- **Dependências**: nenhuma

### [testability-3] Teste HTTP contract de `reconciliarAdiantamento` em `lib/api.ts`

- **Problema**
  > `reconciliarAdiantamento` (lib/api.ts:242-266) é a função de boundary que envia o write para o backend. Sibling functions (alocacao-api, ingestao-api, clientes-filtro-api) têm testes mockando `fetch`; a função write-back **mais crítica** da Fase 3 não tem. Renomeação de campo ou mudança de path quebra a escrita silenciosamente.

- **Melhoria Proposta**
  > Criar `src/frontend/__tests__/permutas-reconciliar-api.test.ts` seguindo o pattern de `alocacao-api.test.ts`: mockar `global.fetch`, chamar `reconciliarAdiantamento('2767', {dryRun:false, dataMovto: 1782172800000})`, assertar fetch chamado com (a) path `/permutas/adiantamentos/2767/reconciliar` (com `encodeURIComponent`), (b) method `POST`, (c) header `content-type: application/json`, (d) body `JSON.stringify({dryRun:false, dataMovto:1782172800000})`. Bonus: error path (`!res.ok` → throw com `API ${status} — ${error}`). Tactic Bass: Specialized Interfaces.

- **Resultado Esperado**
  > Boundary HTTP do write-back coberto; 0 → ≥ 3 testes; contrato wire defendido contra renomeações.

- **Tactic alvo**: Specialized Interfaces
- **Severidade**: P1
- **Esforço estimado**: S (≤1d — pattern já existe)
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - # testes de `reconciliarAdiantamento`: 0 → ≥ 3
  - Cobertura `lib/api.ts` (recorte Fase 3): 0% → 100% da função
- **Risco de não fazer**: bug de wire (path/body) detectado em produção.
- **Dependências**: nenhuma

### [testability-4] Abstrair `todayUtcMidnightMs` para um `ClockProvider` (ou injetar via parâmetro)

- **Problema**
  > `routes/permutas.ts:39-42` lê `new Date()` direto para calcular o default do `dataMovto`. É um sítio de não-determinismo (Bass: **Limit Non-Determinism**) que (a) inviabiliza teste do default da rota sem `useFakeTimers`, (b) significa que a invariante "borDtaMvto = meia-noite UTC do dia corrente" só vale enquanto a função não regredir — sem teste defendendo. O `setRequestPayload` e `markSettled` também usam `now()` (SQL-side), mas o caminho HTTP é o único non-deterministic em src/backend Fase 3.

- **Melhoria Proposta**
  > Opção A (mínima): manter a função na rota, adicionar `src/backend/routes/permutas.test.ts` com `jest.useFakeTimers()` + `jest.setSystemTime(new Date('2026-06-23T10:00:00Z'))` assertando `todayUtcMidnightMs() === Date.UTC(2026,5,23)`. Opção B (estrutural): mover para `domain/libs/clock/ClockProvider.ts` `@singleton() @injectable()` com `nowUtcMidnightMs()`, injetar no service (não na rota). Tactic Bass: Limit Non-Determinism.

- **Resultado Esperado**
  > `new Date()` em src Fase 3: 1 → 0 (Opção B) **OU** 1 sítio defendido por `setSystemTime` (Opção A); test de `todayUtcMidnightMs()` cobrindo virada de mês/ano em UTC.

- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P2
- **Esforço estimado**: S (Opção A) / M (Opção B — toca service + container)
- **Findings relacionados**: F-testability-4
- **Métricas de sucesso**:
  - # `new Date()` não-abstraídos em caminho Fase 3: 1 → 0
  - # testes com `setSystemTime` ou `ClockProvider` mock no caminho Fase 3: 0 → ≥ 1
- **Risco de não fazer**: regressão silenciosa no cálculo de meia-noite UTC; bug de fuso na contabilidade.
- **Dependências**: cross-link com **Modifiability** (`ClockProvider` injetável é Modifiability tactic clássica)

### [testability-5] Adicionar assertions sobre os log-points do `ReconciliacaoPermutaService`

- **Problema**
  > O service tem 3 log-points (DRY-RUN linha 114-118, SETTLED 248-252, FALHOU 143-148) com `type: LOG_TYPE.BUSINESS_INFO/BUSINESS_WARN` e payload de auditoria (`adiantamentoDocCod`, `invoiceDocCod`, `borCod`, `bxaCodSeq`). O test mocka `logService` mas nunca chama `expect(logService.*).toHaveBeenCalledWith(...)`. Se a forma desses logs degradar (perda do `bxaCodSeq` no SETTLED), a trilha de auditoria fica incompleta sem detecção.

- **Melhoria Proposta**
  > Em cada um dos 3 cases relevantes do `ReconciliacaoPermutaService.test.ts`, adicionar `expect(logService.info).toHaveBeenCalledWith(expect.objectContaining({ type: LOG_TYPE.BUSINESS_INFO, message: expect.stringContaining('SETTLED'), data: expect.objectContaining({ adiantamentoDocCod, invoiceDocCod, borCod, bxaCodSeq }) }))`. Tactic Bass: Built-in Monitors / Executable Assertions.

- **Resultado Esperado**
  > 0 → 3 `expect(logService.*).toHaveBeenCalledWith` no test; trilha de auditoria defendida.

- **Tactic alvo**: Built-in Monitors / Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤0.5d)
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - # asserts de log no service test: 0 → 3
- **Risco de não fazer**: trilha de auditoria contábil incompleta em produção.
- **Dependências**: cross-link com **Fault Tolerance** (logs são o evidence pack do recovery manual)

### [testability-6] Invariante "preview ⊆ final" entre `buildPreviewPayload` e `buildFinalPayload` (property-based)

- **Problema**
  > Preview (dry-run) e payload final são funções separadas (linhas 320-340 vs 265-318). O analista aprova baseado no preview; o ERP recebe o final. Sem teste de invariante cross-function, os dois podem divergir silenciosamente (e.g., `bxaCodGerJuros: 131` muda em um e não no outro). Bonus: `fast-check` não está nas deps do backend — `grep fast-check src/backend/package.json` vazio (FE tem, BE não), enquanto a auditoria 2026-06-22 da branch principal já apontava que o backend deveria usar property-based para invariantes monetárias.

- **Melhoria Proposta**
  > (a) Adicionar `fast-check` a `src/backend/package.json` como devDep; (b) escrever 1 property test em `ReconciliacaoPermutaService.test.ts` gerando alocações arbitrárias `{variacaoClassificacao: 'JUROS'|'DESCONTO', variacaoResultado: fc.float({min:0, max:10000})}` e assertando que `preview.bxaMnyJuros === final.bxaMnyJuros`, `preview.bxaMnyDesconto === final.bxaMnyDesconto`, `preview.bxaCodGerJuros === final.bxaCodGerJuros`, `preview.docCod === final.docCod`, `preview.bxaDocCod === final.bxaDocCod` para a mesma `aloc`. Tactic Bass: Executable Assertions (property-based).

- **Resultado Esperado**
  > `fast-check` instalado no BE; 1 property test (default 100 runs) defendendo "preview ⊆ final" para os 5 campos críticos.

- **Tactic alvo**: Executable Assertions / Specialized Interfaces
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - # property-based tests em src/backend: 0 → ≥ 1
  - # invariantes preview↔final assertadas: 0 → ≥ 5 campos
- **Risco de não fazer**: drift silencioso entre o que o analista vê e o que o ERP recebe (risco de auditoria contábil).
- **Dependências**: card [testability-1] (recomendado fazer antes pra fechar a base)

## 6. Notas do agente

- Suite executada para o escopo Fase 3 fechou verde: **40 suites / 399 tests / 7.6s** (`cd src/backend && npx jest Reconciliacao ConexosClient`). Service tem 8 testes (8 invariantes financeiras independentes), ConexosClient write methods têm 6 (5 happy + 1 error wrapping). Esse é o **ponto forte** da feature; o débito mora fora do service.
- Decisão de escopo: P0 é só o `PermutaExecucaoRepository` porque (a) é o único caminho de write-ahead/idempotência sem teste; (b) o sibling `PermutaAlocacaoRepository.test.ts` mostra que o pattern de teste é trivial (não precisa de DB real). Modal+lib/api ficaram P1 porque o backend já tem guard-rail Sandbox (dry-run default), suavizando o blast-radius — mas ainda assim a UX da escrita não pode ficar 0% testada.
- Cross-QA: F-testability-4 (`ClockProvider`) é também **Modifiability** (tactic clássica). F-testability-1 e F-testability-5 são **Fault Tolerance** (idempotência+audit-trail = evidence pack de recovery). F-testability-2 e F-testability-3 são **Integrability** (boundary HTTP testado = contract test). Sinalizar ao consolidator.
- Não tentei medir coverage % global (sem `--coverage` rodado aqui) — o run 2026-06-22-1658 já tem essa tabela; este foco é Fase 3 e não há mudança esperada que justifique re-rodar 7+ minutos de coverage para a mesma resposta agregada.
