---
qa: Testability
qa_slug: testability
run_id: 2026-06-25-1555
agent: qa-testability
generated_at: 2026-06-25T15:55:00Z
scope: backend,frontend
score: 8
findings_count: 3
cards_count: 3
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/QA | Mudança em regra de projeção de relatório (ex: nova coluna em `clientes`, novo bucket em `reconciliacao-processo`) | `RelatorioExportService` (projeção + serialização xlsx) e rota `GET /permutas/relatorios/:tipo` | Dev local (Jest, ts-jest, jsdom no FE) com `GestaoPermutasService` mockado por construtor (tsyringe) | Tests cobrem cada `tipo` (6 branches do switch) afirmando colunas/valores direto na definição estruturada **e** validam o buffer xlsx relendo via `ExcelJS.Workbook.xlsx.load()` (Executable Assertion sobre formato binário) | `service` coverage ≥ 96% lines / ≥ 80% branches; defeito introduzido em projeção é capturado em < 2s de `jest --watch`; rota cobre 200/400/401 sem subir Conexos/DB |

> Bass: "testability is the cost-multiplier of every other QA". A feature `relatorios-export`
> **paga pouco imposto de teste**: a separação `montarDefinicao` (puro, sem I/O) → `serializar`
> (xlsx) é o caso-livro de **Limit Structural Complexity** + **Specialized Interfaces** — a
> projeção é asserted via objetos JS, e o buffer é validado relendo no mesmo `exceljs`.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Coverage `RelatorioExportService.ts` — lines | **98.31 %** | ≥ 80 % | ✅ | `npx jest RelatorioExportService --coverage --collectCoverageFrom='domain/service/permutas/RelatorioExportService.ts'` |
| Coverage `RelatorioExportService.ts` — statements | **97.70 %** | ≥ 80 % | ✅ | idem |
| Coverage `RelatorioExportService.ts` — branches | **85.86 %** | ≥ 70 % | ✅ | idem |
| Coverage `RelatorioExportService.ts` — functions | **100 %** | ≥ 80 % | ✅ | idem |
| Linhas não cobertas | 233, 369 (defaults defensivos: `importador` ausente em invoice; rótulo `N:M`) | 0 críticas | ✅ | coverage table |
| Branches do `switch(tipo)` cobertos | **6/6** (adiantamentos, ja-permutado, bloqueadas, invoices, reconciliacao-processo, clientes) | 6/6 | ✅ | `RelatorioExportService.test.ts:135-237` |
| Casos rota `GET /permutas/relatorios/:tipo` | **3** (200 ok + content-disposition; 400 tipo inválido; 401 sem auth) | ≥ 3 | ✅ | `routes/permutas.test.ts:697-750` |
| Buffer xlsx validado por re-leitura (Executable Assertion) | ✅ presente (`wb.xlsx.load(buffer)` + `getWorksheet/getRow/getCell`) | sim | ✅ | `RelatorioExportService.test.ts:248-255` |
| Suite full backend (regressão) | **463 tests / 43 suites verdes** | verdes | ✅ | `_shared-metrics.md` |
| Suite full frontend | **51 tests / 11 suites verdes** | verdes | ✅ | `_shared-metrics.md` |
| Tests para `exportarRelatorio` (FE `api.ts:429`) | **0** (download blob não-coberto) | ≥ 1 | ⚠️ | `find src/frontend -name 'api.test.*'` → ausente |
| Tests para popover "Exportar" em `page.tsx` (estado `exportando`, disable durante request) | **0** | ≥ 1 (smoke) | ⚠️ | `find src/frontend -name '*page.test*'` → ausente |

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | `montarDefinicao(tipo, gestao)` exposta como **API pública pura** (sem I/O, sem exceljs) — testes batem direto nela, não passam por `exportar()`. Separação `definição × serialização` é o seam | ✅ presente | `RelatorioExportService.ts:montarDefinicao` + `RelatorioExportService.test.ts:135-237` |
| Recordable Test Cases | Fixture única `gestao: GestaoPermutasResponse` cobre **todos** os status (elegivel/bloqueada/ja-permutado/permuta-manual) + invoice sem importador/taxa — replays determinísticos | ✅ presente | `RelatorioExportService.test.ts:11-121` |
| Sandbox | `GestaoPermutasService` mockado via construtor (`new RelatorioExportService(gestaoService, log)` com `jest.fn().mockResolvedValue(gestao)`); rota usa `container.registerInstance(RelatorioExportService, …)` para isolar do `appContainer` real (que requer Conexos/DB) | ✅ presente | `RelatorioExportService.test.ts:123-129` + `routes/permutas.test.ts:9-11,707` |
| Executable Assertions | Buffer xlsx **relido** por `ExcelJS.Workbook.xlsx.load()` e validado nas células (header + `rowCount`) — não é só "tem bytes", é "é um xlsx válido com a planilha esperada" | ✅ presente | `RelatorioExportService.test.ts:248-255` |
| Abstract Data Sources | A única fonte (`GestaoPermutasService`) é injetada por DI — sem `import` rígido de repo. Padrão idêntico ao resto do `domain/service/permutas/` | ✅ presente | `RelatorioExportService.ts` (construtor) |
| Limit Structural Complexity | `montarDefinicao` (puro) ≠ `serializar` (efeito colateral xlsx) ≠ `nomeArquivo` (puro). Test file 268 LOC, dentro do esperado (longe dos > 500 que indicariam SUT inflado) | ✅ presente | `RelatorioExportService.ts:montarDefinicao`/`serializar`/`nomeArquivo` |
| Limit Non-Determinism | Sem `Date.now()`/`Math.random()`/`new Date()` no service — a data de ingestão vem de `gestao.geradoEm` (input), e o fallback é literal `'snapshot'`. Teste exercita ambos os ramos | ✅ presente | `RelatorioExportService.ts:nomeArquivo` + test "snapshot no filename quando não há data" (l. 257-266) |

Nenhuma tactic foi pulada. Não há gaps de tactic na feature.

## 4. Findings

### F-testability-1: `exportarRelatorio` do frontend não tem unit test (blob download via DOM)

- **Severidade**: P3 (baixo — débito opcional)
- **Tactic violada**: Specialized Interfaces (FE) — a função `exportarRelatorio` existe como
  seam isolado (fetch + `URL.createObjectURL` + `<a download>`) mas não tem cobertura
- **Localização**: `src/frontend/lib/api.ts:429-456` (sem `api.test.ts` correspondente)
- **Evidência (objetiva)**:
  ```bash
  find src/frontend -name 'api.test.*'   # → 0 resultados
  ```
- **Impacto técnico**: regressões em parsing de Content-Disposition, em `URL.revokeObjectURL`
  (vazamento de blob), ou no fallback `permutas-${tipo}.xlsx` só serão capturadas
  manualmente. O caminho já é defensivo (try/finally) e o backend tem o filename canônico
  testado, então o risco é baixo
- **Impacto de negócio**: usuário pode receber um arquivo sem nome ou com vazamento de
  memória após múltiplas exportações — incômodo, não bloqueio
- **Métrica de baseline**: 0 testes para `exportarRelatorio` (1 função pública não coberta)

### F-testability-2: Popover "Exportar" em `page.tsx` não tem smoke test (estado `exportando` / disable)

- **Severidade**: P3
- **Tactic violada**: Observability (FE) — a interação `click → setExportando(tipo) → disable
  do botão durante request → reset no finally` não é asserted
- **Localização**: `src/frontend/app/permutas/page.tsx:680-1212` (estado `exportando`,
  handler `executarExportacao`, popover) — sem `page.test.tsx`
- **Evidência (objetiva)**:
  ```bash
  find src/frontend -name '*page.test*'   # → 0 resultados (consistente com toda a página de 2622 LOC)
  ```
- **Impacto técnico**: dois cliques concorrentes (race) ou erro de download que não reseta
  `exportando` (atualmente protegido por try/finally em `executarExportacao`) só seriam
  pegos manualmente
- **Impacto de negócio**: usuário pode ver o botão "Exportar" travado em loading se um
  erro silencioso ocorrer no fetch
- **Métrica de baseline**: cobertura de `page.tsx` permanece em 0 — débito pré-existente,
  não introduzido pela feature

### F-testability-3: Linhas 233 e 369 (defaults defensivos) ficam fora da cobertura

- **Severidade**: P3
- **Tactic violada**: nenhuma; nota informativa para o consolidator
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:233,369`
- **Evidência (objetiva)**:
  ```
   RelatorioExportService.ts | 97.7 | 85.86 | 100 | 98.31 | 233,369
  ```
  Linha 233: `g.importador = i.importador` quando o adto não trouxe importador mas a invoice
  trouxe (o teste exercita o caso simétrico). Linha 369: retorno `'N:M'` da cardinalidade —
  fixture não tem processo com adtos > 1 **e** invoices > 1 simultaneamente
- **Impacto técnico**: branches defensivas; comportamento documentado mas não asserted
- **Impacto de negócio**: nenhum imediato; é polimento
- **Métrica de baseline**: 2 linhas / ~398 LOC = 0.5 % gap

## 5. Cards Kanban

### [testability-1] Adicionar smoke test ao `exportarRelatorio` (FE) cobrindo download blob + erro HTTP

- **Problema**
  > A função `exportarRelatorio(tipo)` em `src/frontend/lib/api.ts:429` orquestra
  > `fetch → blob → URL.createObjectURL → <a download> click → revokeObjectURL` sem
  > nenhum teste. Regressão em parsing de Content-Disposition ou em `revokeObjectURL` só é
  > capturada manualmente.

- **Melhoria Proposta**
  > Criar `src/frontend/lib/api.test.ts` (jsdom) com dois casos: (a) sucesso — mock de
  > `fetch` retornando `Response` com header `content-disposition`, mock de
  > `URL.createObjectURL/revokeObjectURL`, asserts em `anchor.download === filename` e em
  > `revokeObjectURL` chamado no finally; (b) erro — `res.ok=false` lança `Error('API
  > 500…')`. Tactic Bass alvo: **Specialized Interfaces** (a função já é o seam, falta
  > exercitá-lo).

- **Resultado Esperado**
  > Função `exportarRelatorio` passa de 0 → ≥ 2 casos. Cobertura de `src/frontend/lib/api.ts`
  > sobe na linha da função (pelo menos +1 % no arquivo). Regressão de filename / leak de
  > blob é detectada em CI.

- **Tactic alvo**: Specialized Interfaces · Sandbox
- **Severidade**: P3
- **Esforço estimado**: S (≤ 1d, ~1h)
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Testes para `exportarRelatorio`: 0 → 2
  - Frontend suite: 51 → 53 testes
- **Risco de não fazer**: regressão silenciosa no fluxo de download (nome errado, blob
  vazado) percebida só pelo usuário final
- **Dependências**: nenhuma

### [testability-2] Smoke test do popover "Exportar" em `page.tsx` (estado `exportando` + disable concorrente)

- **Problema**
  > O popover de exportação introduz estado `exportando: RelatorioTipo | null` e desabilita
  > o botão durante o request (`page.tsx:680, 1184-1212`). Não há teste; dois cliques
  > concorrentes ou erro que escape do try/finally só seriam vistos em produção.

- **Melhoria Proposta**
  > Criar `src/frontend/app/permutas/page.test.tsx` (jsdom + Testing Library + msw OU
  > mock de `exportarRelatorio`) com 1 caso mínimo: abrir popover, clicar item, asserir
  > que botão fica `disabled` durante a promise pendente e volta a habilitar no resolve.
  > Tactic Bass alvo: **Observability** (asserir transição de estado UI).

- **Resultado Esperado**
  > Página de Permutas ganha sua primeira página-test (smoke). Cobertura de `page.tsx` sai
  > de 0 → > 0 % (apenas no fluxo do popover). Race de duplo-clique no Exportar fica
  > defendida em CI.

- **Tactic alvo**: Observability · Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S (≤ 1d, ~2h — montar o harness vale mais que o teste em si)
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - Testes para popover Exportar: 0 → 1
  - `page.tsx` deixa de ser 100 % untested
- **Risco de não fazer**: débito de testabilidade da página principal continua (a feature
  não piorou nada; só não consertou)
- **Dependências**: nenhuma; precedente útil para futuras features na mesma página

### [testability-3] Fechar gap de cobertura nas linhas 233 e 369 do `RelatorioExportService`

- **Problema**
  > Branches defensivos (`importador` vindo só da invoice; cardinalidade `N:M` com
  > múltiplos adtos **e** múltiplas invoices) não estão na fixture. Coverage 98.31 % lines /
  > 85.86 % branches.

- **Melhoria Proposta**
  > Acrescentar 1 invoice extra ao processo `2048` na fixture do
  > `RelatorioExportService.test.ts` (para forçar N:M) e remover o `importador` do
  > adto `A2` (para forçar a linha 233 — herdar de invoice). Adicionar 1 expect em
  > `reconciliacao-processo` para `cardinalidade === 'N:M'`. Tactic Bass alvo:
  > **Recordable Test Cases** (enriquecer a fixture canônica).

- **Resultado Esperado**
  > `RelatorioExportService.ts`: branches 85.86 % → ≥ 92 %; lines 98.31 % → 100 %.

- **Tactic alvo**: Recordable Test Cases · Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S (≤ 30min)
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - Lines uncovered no service: 2 → 0
  - Branch coverage: 85.86 % → ≥ 92 %
- **Risco de não fazer**: nenhum — é polimento; a feature já está bem coberta
- **Dependências**: nenhuma

## 6. Notas do agente

- Coverage rodado direto: `cd src/backend && npx jest RelatorioExportService --coverage
  --collectCoverageFrom='domain/service/permutas/RelatorioExportService.ts'` → 97.7 % stmts /
  85.86 % branches / 100 % funcs / 98.31 % lines. **Acima do floor do projeto** (~96 % lines
  em `domain/service`).
- Cross-QA: o seam `montarDefinicao` (puro) ↔ `serializar` (xlsx) é também um ganho de
  **Modifiability** (trocar exceljs sem mexer nos asserts de projeção) — alertar
  `qa-modifiability`. A re-leitura do buffer xlsx por `ExcelJS.xlsx.load()` é um caso
  exemplar de Executable Assertion sobre formato binário — pode ser citado pelo
  `qa-integrability` como contract test do output xlsx.
- Decisão de escopo: F-testability-1 e -2 são P3 porque (a) o backend já testa o filename
  canônico e os 6 tipos, (b) page.tsx era 100 % untested antes da feature — a feature não
  introduziu o débito. Subir para P2 só se a política do projeto exigir cobertura mínima
  no FE (hoje não exige).
- Não há `coverageThreshold` no `backend/jest.config.*` para travar regressão de coverage —
  fica como menção (não é card desta feature; é débito de plataforma para o
  `qa-deployability` avaliar).
