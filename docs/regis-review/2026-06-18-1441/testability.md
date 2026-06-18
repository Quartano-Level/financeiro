---
qa: Testability
qa_slug: testability
run_id: 2026-06-18-1441
agent: qa-testability
generated_at: 2026-06-18T14:41:00-03:00
scope: backend
score: 9
findings_count: 2
cards_count: 2
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Developer (este feature-tweak) | Mudança no contrato do client (`getMnyTitPermutar` → `getDetalheTitulos`, agora devolvendo `{valorPermutar?, pago?}`) e hidratação do `pago` no serviço antes dos gates | `ConexosClient.getDetalheTitulos`, `EleicaoPermutasService.buildCandidata` (Gate 3) | Dev / CI — jest unit suite | Testes determinísticos com mocks construtor-injetados pinam (a) o novo shape do client em quatro variantes (`pago=false`/`true`/`undefined`/quirk-400) e (b) o override do `pago` da lista pelo detalhe nos três regimes (>0, ===0, ausente) | 118/118 testes verdes nos diretórios tocados; 266/266 na suíte completa; regressão da bug do prod (`mnyTitAberto NULL → pago=false`) coberta por testes nomeados |

> Resumo do delta: bug de prod era que `com298/list` devolve `mnyTitAberto = NULL`, o que ligava o Gate 3 (TOTALMENTE_PAGO) a uma fonte mentirosa. O fix move a verdade do `pago` para o detalhe (`GET /com298/{docCod}`). O delta de testabilidade aqui é avaliar se os testes novos defendem essa invariante.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Testes passando nos dirs tocados | 118/118 | 100% | ✅ | `npx jest domain/client domain/service/permutas` (shared-metrics) |
| Testes passando na suíte completa | 266/266 (30 suites) | 100% | ✅ | `npm test` (shared-metrics) |
| Casos cobrindo as 3 regiões do oráculo `pago` (>0, ===0, undefined) no client | 3/3 | 3/3 | ✅ | `ConexosClient.test.ts:1186-1229` |
| Casos cobrindo o override list→detail no serviço (3 regimes) | 3/3 | 3/3 | ✅ | `EleicaoPermutasService.test.ts:241-356` |
| Caminho `getDetalheTitulos` falhando após retries → `ConexosError` | Coberto (assertion `toBeInstanceOf(ConexosError)`) | Coberto | ✅ | `ConexosClient.test.ts:1245-1255` |
| Retry-then-succeed do detalhe | Coberto (2 chamadas, valor correto) | Coberto | ✅ | `ConexosClient.test.ts:1231-1243` |
| Quirk Conexos `HTTP 400` com `responseData` em `data` | Coberto, sem retry adicional | Coberto | ✅ | `ConexosClient.test.ts:1257-1273` |
| Teste `DETAIL_INDISPONIVEL` migrado para `getDetalheTitulos` (novo nome) | Migrado | Migrado | ✅ | `EleicaoPermutasService.test.ts:205-239` |
| Fixtures = números reais do wire 2026-06-18 (doc 26471 NÃO pago, 24166 PAGO) | Sim | Sim (Recordable Test Cases) | ✅ | `ConexosClient.test.ts:1188-1217` (comentário "Wire real 2026-06-18, filCod=2") |
| Determinismo: mocks por `jest.fn()`, sem rede, sem `Date.now`, sem `Math.random` introduzidos pelo delta | 0 fontes não-determinísticas no delta | 0 | ✅ | grep do diff |
| Mocks via construtor-injection (CLAUDE.md service-layer guidance) | 100% no delta | 100% | ✅ | `new ConexosClient(legacy)`, `new EleicaoPermutasService(conexos, …)` em todos os casos |
| Assertion no estado de negócio do gate (`gate3Of(...).passed`) | Presente | Presente | ✅ | `EleicaoPermutasService.test.ts:247-248, 282, 318, 353` |
| Assertion no estado final da candidata (`ESTADO_ELEGIBILIDADE`) | Presente nos 3 casos | Presente | ✅ | `EleicaoPermutasService.test.ts:283, 319, 354` |
| Teste afirmando log/evento quando `pago` cai para `false` por override (e o run continua) | Ausente — caso de override silencioso (lista dizia `true`, detalhe disse `false`) não emite WARN observável nos testes | Ao menos `BUSINESS_WARN` registrado para divergência list↔detail (ou afirmação explícita de "sem warn por design") | ⚠️ | `EleicaoPermutasService.test.ts:250-284` (não há `expect` em `calls`) |
| Caso de detail rejeitado pelo serviço quando lista trazia `valorPermutar`/outros campos divergentes do detail | Não testado (delta foca em `pago`; `valorPermutar` é apenas configurado no mock, nunca asserido como override) | Pelo menos 1 caso afirma `valorPermutar` final na candidata vem do detail | ⚠️ | `EleicaoPermutasService.test.ts:264, 300, 335` (mock retorna `valorPermutar`, mas o teste não asserta no resultado) |
| LOC do arquivo de teste `EleicaoPermutasService.test.ts` | 652 | < 500 (heurística Bass de Limit Structural Complexity) | ⚠️ Pré-existente, não introduzido pelo delta — fora do escopo | `wc -l` (shared-metrics adjacent) |

> ⚠️ **Não medível localmente (modo `--quick`):** coverage por arquivo/branch — `npm test -- --coverage` foi explicitamente pulado. Recomendação: rodar coverage no merge para confirmar que as três novas linhas de `buildCandidata` (override do `pago`) e as ramificações de `mapDetalheTitulos` estão 100% cobertas.

## 3. Tactics — Cobertura no delta

| Tactic (Bass) | Implementação atual no delta | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | `LegacyConexosShape` exposto pelo client permite mock-by-construction (`new ConexosClient(legacy)`); `EleicaoPermutasService` aceita `ConexosClient` por DI no construtor — o seam é amplo e foi usado em 100% do delta | ✅ | `ConexosClient.test.ts:5-12, 31, 1195`; `EleicaoPermutasService.test.ts:217-225` |
| Recordable Test Cases | Fixtures com números reais do wire-probe 2026-06-18, docs 26471 (NÃO pago) e 24166 (PAGO), com `mnyTitValor / mnyTitPago / mnyTitAberto / mnyTitPermutar` registrados — exatamente a tática "grava um caso real e replaya em CI" | ✅ | `ConexosClient.test.ts:1188-1217` (comentários "Wire real 2026-06-18, filCod=2") |
| Sandbox | Toda a chamada Conexos é simulada por `jest.Mocked<LegacyConexosShape>`/`jest.Mocked<ConexosClient>`; nenhum teste novo bate em rede | ✅ | grep `axios\|fetch` no delta = 0 |
| Executable Assertions | Asserts no shape do retorno do client (`pago`, `valorPermutar`) **e** no estado de negócio downstream (`gate3Of(candidata).passed`, `estadoElegibilidade`) — Bass pede ambos, este delta entrega ambos | ✅ | `EleicaoPermutasService.test.ts:282-283, 318-319, 353-354` |
| Abstract Data Sources | Construtor do `EleicaoPermutasService` recebe 8 dependências abstratas (incl. `ConexosClient`, `PermutaSnapshotRepository`); testes constroem todas como mocks. Sem `container.resolve` no delta | ✅ | `EleicaoPermutasService.test.ts:217-226` |
| Limit Structural Complexity | O fluxo `list → detail → buildCandidata → gates` foi quebrado de modo que cada caso testa **uma** decisão (Gate 3) com fixtures pequenas — boa decomposição | ✅ | escopo do `describe('Gate 3 (TOTALMENTE PAGO) hydrated from the DETAIL...')` |
| Limit Non-Determinism | Sem `Date.now()`, sem `Math.random`, sem `setTimeout` real introduzidos pelo delta; retries do `RetryExecutor` são exercitados de forma determinística (mock rejeita N vezes e depois resolve) | ✅ | `ConexosClient.test.ts:1231-1243` |

## 4. Findings

### F-testability-1: Override silencioso list→detail não emite/asserta sinal de divergência

- **Severidade**: P1
- **Tactic violada**: Executable Assertions (parcial) + Internal Monitoring (ausente)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.test.ts:250-284` (e o sítio de `buildCandidata` no service)
- **Evidência (objetiva)**:
  ```ts
  // Caso "lista dizia pago=true, detalhe diz pago=false":
  const adiantamentoListPagoTrue = { ...adiantamento, docCod: '26471', pago: true };
  // ...
  getDetalheTitulos: jest.fn().mockResolvedValue({ valorPermutar: 1000, pago: false }),
  // ...
  expect(gate3Of(result.candidatas[0])?.passed).toBe(false);
  expect(result.candidatas[0].estadoElegibilidade).toBe(ESTADO_ELEGIBILIDADE.BLOQUEADA);
  // ← nenhum expect em `calls` / logService: a divergência (que é exatamente
  // o sintoma do bug que motivou a feature) passa silenciosamente.
  ```
- **Impacto técnico**: O bug original em produção era invisível porque ninguém olhava o log: a lista mentia, o sistema acreditava, ninguém sabia. O fix corrige a verdade, mas ainda não cria observabilidade sobre o quão frequentemente a lista mente. Se o Conexos consertar o `com298/list` no futuro, o fan-out para o detail (uma chamada extra por candidata) continuará pago sem evidência de que ainda é necessário.
- **Impacto de negócio**: Sem métrica de "divergência list↔detail", o time fica cego para (a) decidir quando remover a hidratação extra e (b) detectar regressão se Conexos mudar a semântica do `mnyTitAberto` de novo.
- **Métrica de baseline**: 0 assertions de log/contador em casos de override; 3/3 casos do novo `describe` sem `expect` em `calls` ou contador.

### F-testability-2: `valorPermutar` do detail não é asserido como override no serviço

- **Severidade**: P1
- **Tactic violada**: Executable Assertions (parcial)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.test.ts:262-264, 298-300, 333-335`
- **Evidência (objetiva)**:
  ```ts
  // Mock devolve valorPermutar=1000 / 266350.43 / 1000, mas nenhum teste
  // novo asserta que esse número emergiu na candidata final — só `pago`
  // é asserido pelo `gate3Of(...).passed`.
  getDetalheTitulos: jest.fn().mockResolvedValue({ valorPermutar: 266350.43, pago: true }),
  // ...
  expect(gate3Of(result.candidatas[0])?.passed).toBe(true);
  expect(result.candidatas[0].estadoElegibilidade).toBe(ESTADO_ELEGIBILIDADE.ELEGIVEL);
  // ← nenhum `expect(result.candidatas[0].valorPermutar).toBe(266350.43)`.
  ```
  shared-metrics confirma que `buildCandidata` hidrata **ambos** `valorPermutar` e `pago` do detail (`+29` linhas). Apenas metade do contrato está pinada.
- **Impacto técnico**: Uma futura refatoração que coalesça o `valorPermutar` da lista por engano não falhará nenhum dos três novos testes — o regression test pinou só uma das duas variáveis hidratadas. Como `valorPermutar` é o que vai entrar no fechamento `fin010` (núcleo monetário da Frente I — Permutas), o gap é financeiramente sensível.
- **Impacto de negócio**: O delta nasceu para corrigir um Gate 3 que pisava em dado errado; o mesmo padrão (lista mente, detalhe é a verdade) aplica-se a `valorPermutar`. Se o teste não defende a fonte de verdade do número que vai para o ERP, o próximo PR pode regredir sem CI vermelho.
- **Métrica de baseline**: 0/3 casos novos asserindo `result.candidatas[0].valorPermutar` (campo hidratado em `+29` linhas do service no delta).

## 5. Cards Kanban

### [testability-1] Adicionar assertion de divergência (log/contador) no override list→detail

- **Problema**
  > Os três testes do novo `describe('Gate 3 ... hydrated from the DETAIL')` pinam o **resultado** do gate, mas não pinam o **fato** de que houve override quando a lista mentiu. O bug que motivou a feature em prod era invisível justamente porque ninguém media a divergência; o fix conserta a verdade, mas não cria o sinal — então a próxima vez que Conexos mudar o contrato do `mnyTitAberto` o time descobre pelo financeiro errado, não pelo log.

- **Melhoria Proposta**
  > Em `EleicaoPermutasService.buildCandidata` (Modifiability: Increase Cohesion + Testability: Internal Monitoring), emitir um `logService.warn` ou incrementar um contador estruturado quando `adiantamento.pago !== detalhe.pago`. Adicionar no `describe` existente um quarto caso "list disse `true`, detail disse `false`" que afirma `expect(calls.some(c => c.data?.divergencia === 'pago_list_vs_detail')).toBe(true)`. Reaproveitar `buildLogService()` (já tem `calls` capturados).

- **Resultado Esperado**
  > Métrica observável: assertions de divergência list↔detail nos testes do `describe` de Gate 3: 0 → 1 (ou mais). Em produção, o log estruturado dá ao time o número que decide quando remover a hidratação extra (uma chamada de detail por candidata é custo de latência).

- **Tactic alvo**: Executable Assertions + Internal Monitoring (Bass)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Casos de override list→detail com assertion em `calls`: 0 → ≥1
  - Sinal de divergência presente no `LogService` em prod: ausente → presente (chave estruturada estável, ex. `divergencia: 'pago_list_vs_detail'`)
- **Risco de não fazer**: Se o Conexos consertar `com298/list` no futuro, ninguém saberá; a chamada extra ao detail vira custo permanente sem dado para defender remoção. Se o Conexos quebrar a semântica de `mnyTitAberto` de novo, o time descobre via auditoria financeira do `fin010`, não via alerta.
- **Dependências**: nenhuma (a infra de `buildLogService` já existe e é usada em outros casos como `DETAIL_INDISPONIVEL`).

### [testability-2] Pinar também `valorPermutar` do detail nos testes de Gate 3

- **Problema**
  > `buildCandidata` foi alterado para hidratar do detail **dois** campos: `pago` (foco da feature) e `valorPermutar`. Os três novos testes asseguram só o primeiro. Como `valorPermutar` é o número que entra no `fin010` (núcleo monetário da Frente I — Permutas), e a literatura é a mesma do bug original (lista mente, detalhe é verdade), o invariante precisa estar pinado pelo mesmo `describe`.

- **Melhoria Proposta**
  > Em cada um dos três casos do `describe('Gate 3 ... hydrated from the DETAIL')` adicionar `expect(result.candidatas[0].valorPermutar).toBe(<valor do mock do detail>)`. Custo marginal (uma linha por teste); o mock já carrega o número correto, só falta o assert. Bonus: variar o `valorPermutar` da lista vs. do detail num quarto caso explicitamente desenhado para verificar o override (mesmo padrão da técnica Recordable Test Cases que o delta já usa para `pago`).

- **Resultado Esperado**
  > Casos no `describe` de Gate 3 que afirmam `result.candidatas[0].valorPermutar` do detail: 0/3 → 3/3 (ou 4/4 com o caso de override explícito). Refatoração futura que regrida `valorPermutar` para a fonte da lista falha CI imediatamente.

- **Tactic alvo**: Executable Assertions (Bass)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) — alteração trivial nos testes, sem mudar produção.
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - Linhas de teste pinando `valorPermutar` no resultado da candidata: 0 → ≥3
  - Cobertura do contrato `{valorPermutar, pago}` do detail no serviço: parcial → total
- **Risco de não fazer**: Próxima refatoração no `buildCandidata` pode coalescer `valorPermutar` da lista por descuido — sem teste vermelho, o erro chega ao fechamento `fin010` no ERP.
- **Dependências**: nenhuma; todos os mocks já carregam `valorPermutar`, é só adicionar o `expect`.

## 6. Notas do agente

- Escopo estritamente restrito ao delta — débitos pré-existentes (LOC do `EleicaoPermutasService.test.ts` = 652, ausência de coverage gate no CI) NÃO entraram como findings.
- Não rodei `--coverage` (modo `--quick`); recomendo rodar no merge para fechar o número faltante (cobertura das ramificações novas).
- Cross-QA: F-testability-1 conecta com **Modifiability** (sinal estruturado vira evidência para remover a hidratação extra quando o `com298/list` for consertado) e com **Fault Tolerance** (divergência list↔detail é um sintoma upstream que merece monitoria). F-testability-2 conecta com **Security/Compliance** apenas indiretamente (números monetários divergentes do detail iriam para `fin010` — invariante de integridade financeira do domínio Permutas).
- Tática "Recordable Test Cases" foi muito bem aplicada (docs 26471 e 24166 com números do wire-probe 2026-06-18 documentados nos comentários do teste) — é o tipo de fixture que defende a invariante contra mudança de schema upstream.
