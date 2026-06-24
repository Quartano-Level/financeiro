---
qa: Testability
qa_slug: testability
run_id: 2026-06-24-0039
agent: qa-testability
generated_at: 2026-06-24T00:39:00-03:00
scope: backend+frontend
score: 6.5
findings_count: 6
cards_count: 5
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado a financeiro Fase 3.1)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Engenheiro tocando a integração `fin010` (rota DELETE `/borderos/:borCod/baixas/:invoiceDocCod`, ConexosClient WRITE/LIST) | mudança de path/payload (ex.: bug docTip-vs-filCod já vivido neste diff) | `ConexosClient.excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `getBordero`, `listBorderos`, `listBaixas` + 6 rotas Express novas | dev (sandbox `CONEXOS_WRITE_ENABLED=false`) e prod (filCod=2) | falha do contrato deve quebrar `npm test` ANTES do deploy (gate Render); o operador nunca deve descobrir o erro de path/payload em produção | testes de contrato (assert do `path` + `body`) presentes para 100% dos métodos WRITE/LIST; falha de regressão observável < 8s (`npm test` BE = 7.4s) |

> Cenário operativo do diff: o bug que motivou a criação do template `ERP_MESSAGE_PT` (FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO) ocorreu porque o segundo segmento do path do DELETE `/fin010/baixas/{borCod}/{docTip}/...` foi inicialmente confundido com o filCod (coincidência na filial 2). **Esse bug só existiu porque não há teste de contrato do path**: o teste de serviço passa com qualquer string que o mock aceitar; o teste do client é onde o path nasce ou morre.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Cobertura por camada (test-files / source-files) — `domain/service` | 13/14 = 93% | ≥ 80% | ✅ | `find src/backend/domain/service -name '*.test.ts'` vs sources |
| Cobertura por camada — `domain/repository` | 6/7 = 86% | ≥ 50% | ✅ | idem |
| Cobertura por camada — `domain/client` | 4/6 = 67% | ≥ 50% | ✅ | idem |
| Cobertura por camada — `routes/` | 1/3 = 33% | ≥ 50% | ⚠️ | idem |
| FE test files (excluindo node_modules) | 11 | — | — | `find src/frontend -name "*.test.*"` |
| FE source files (tsx/ts excl. testes e .next) | 40 | — | — | idem |
| FE ratio | 11/40 = 27.5% | ≥ 40% | ⚠️ | derivado |
| Tests `it` em `BorderoGestaoService.test.ts` (NEW 298 LOC) | 14 | 12+ (1 por método público × cenários) | ✅ | `grep -cE "^\s*it\(" BorderoGestaoService.test.ts` |
| Tests `it` em `ReconciliacaoPermutaService.test.ts` (+118 LOC) | 13 | 10+ | ✅ | `grep -cE "^\s*it\(" ReconciliacaoPermutaService.test.ts` |
| Tests `it` em `ConexosClient.test.ts` (+1 LOC no diff) | 71 | — | — | `grep -cE "^\s*it\(" ConexosClient.test.ts` |
| Tests `it` em `routes/permutas.test.ts` (sem novos) | 28 | — | — | `grep -cE "^\s*it\(" routes/permutas.test.ts` |
| **Contract tests dos métodos NOVOS do `ConexosClient` (`excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `getBordero`, `listBorderos`, `listBaixas`)** | **0 de 8** | **8/8** | ❌ **P0** | `grep -nE "client\.(excluirBaixa\|excluirBordero\|finalizarBordero\|cancelarBordero\|estornarBordero\|getBordero\|listBorderos\|listBaixas)\b" ConexosClient.test.ts` |
| Route-level tests das 6 rotas novas de borderos (`GET /borderos`, `POST /:borCod/finalizar`, `/cancelar`, `/estornar`, `DELETE /:borCod`, `DELETE /:borCod/baixas/:invoiceDocCod`) | 0 de 6 | 6/6 com pelo menos um happy-path + um ERP-error | ❌ **P0** | `grep -nE "borderos\|finalizarBordero\|cancelarBordero\|estornarBordero\|excluirBaixa\|excluirBordero" routes/permutas.test.ts` (vazio) |
| Tests FE da página `app/permutas/borderos/page.tsx` (NEW 595 LOC) | 0 | ≥ 3 (render + 1 ação otimista + 1 cenário de erro do ERP) | ❌ **P1** | `grep -rE "borderos\|BorderosPage" src/frontend/__tests__/` (vazio) |
| Cobertura do mapa `ERP_MESSAGE_PT` (3 chaves: `FIN_014.DELETAR_REGISTRO_ESTORNO`, `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO`, `Generic.ERROR_MESSAGE`) | 0 chaves testadas | 3/3 | ❌ **P1** | `grep -nE "FIN_014\|FIN_IMPOSSIVEL\|ERP_MESSAGE_PT\|erpErrorMessage" routes/permutas.test.ts` (vazio) |
| Backend jest gates (medido) | 426 passed / 426 — typecheck PASS — lint 0 | manter | ✅ | `npm test` (7.4s) |
| Frontend jest gates (medido) | 51 passed / 51 — typecheck PASS | manter | ✅ | `npm test` (0.9s) |
| BE coverage floors (jest.config.cjs) | global lines 72/branches 54/functions 78; `./domain/service/` lines 88/branches 60 | manter; serviço novo (`BorderoGestaoService`) entra no agregado e SOBE o piso | ✅ | `src/backend/jest.config.cjs:33-43` |
| FE coverage floors | global lines 25/branches 12/functions 15 (post-`collectCoverageFrom` true-baseline) | subir conforme cards FE são entregues | ⚠️ | `src/frontend/jest.config.cjs:33-46` |
| `new Date()` não-injetado em código novo da Fase 3.1 | 2 sites em `routes/permutas.ts:65,416` (default do `dataMovto` + `geradoEm` na resposta) | aceitável: `dataMovto` é overridable pelo body do request; `geradoEm` é informacional | ⚠️ | `grep -nE "new Date\(\)" src/backend/routes/permutas.ts` |
| `Math.random` / `crypto.randomUUID` em código novo | 0 | 0 | ✅ | `grep -nE "Math.random\|crypto.randomUUID" BorderoGestaoService.ts ReconciliacaoPermutaService.ts permutas.ts` |
| Fixtures por external client (recordable test cases) | 0 (`__fixtures__` ausente em `domain/client/`) | ≥ 1 fixture wire-real por método WRITE do `fin010` | ❌ **P2** | `find src/backend -type d -name "__fixtures__"` (vazio) |
| Top BE test file (LOC) | `ConexosClient.test.ts` = 1490 LOC | < 800 (sinaliza classe-deus) | ⚠️ | `wc -l` |

> ⚠️ **Não medível localmente**: cobertura de mutantes (mutation testing) — não há Stryker/`@stryker-mutator` no projeto. Métricas de linha/ramo escondem que um teste pode passar com payload **errado** se ele só assertar o tipo de retorno. Recomendação: ver Card `testability-5` (executable assertions de path/payload).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | DI por tsyringe + `@injectable`, dependências passadas via construtor; testes injetam mocks como `new BorderoGestaoService(mockClient as never, mockEnv as never, ...)` | ✅ presente | `BorderoGestaoService.test.ts:22-54`; `ReconciliacaoPermutaService.test.ts:77-86` |
| Record/Playback | ConexosClient mocka `LegacyConexosShape` mas NÃO recorda payloads reais do Conexos por endpoint. Há comentários "wire real 2026-06-18 doc 26471" porém os payloads ficam **inline** no teste, não em fixtures versionadas — não há `__fixtures__/` | ❌ ausente | `find src/backend -name __fixtures__` vazio; ex. inline em `ConexosClient.test.ts:1213-1217` |
| Localize State Storage | `PermutaExecucaoRepository` é o único repo de mutação da trilha; mocks recebem `findByBorCodInvoice/deleteByBorCodInvoice/countByBorCod/listByBorCod/deleteByBorCod` — estado isolado | ✅ presente | `BorderoGestaoService.test.ts:38-45` |
| Abstract Data Sources | `EnvironmentProvider` mockado (Rule #8 do CLAUDE.md), `ConexosClient` injeta `LegacyConexosShape` (não chama `services/conexos.ts` direto), `LogService` mockado | ✅ presente | `BorderoGestaoService.test.ts:33-36, 46`; `ConexosClient.test.ts:5-14` |
| Sandbox | `CONEXOS_WRITE_ENABLED=false` é o gate em runtime; teste `'bloqueia quando a escrita está desabilitada'` confirma a guarda; `dryRun` em `ReconciliacaoPermutaService` força preview sem POST | ✅ presente | `BorderoGestaoService.test.ts:277-287`; `BorderoGestaoService.ts:82-85, 238-243`; `ReconciliacaoPermutaService.test.ts:94-112` |
| Executable Assertions | Serviços **sim** (asserts em chamadas, payloads e estados de retorno); mas **falha total** no nível do client para os NOVOS métodos: `excluirBaixa`/`excluirBordero`/`finalizar/cancelar/estornarBordero`/`getBordero`/`listBorderos`/`listBaixas` não têm `expect(legacy.deleteGeneric).toHaveBeenCalledWith(path, ...)` — exatamente o ponto onde o bug docTip-vs-filCod nasceu | ⚠️ parcial | `grep -nE "client\.(excluirBaixa\|listBaixas\b)" ConexosClient.test.ts` retorna apenas `listBaixasTitulo` (método diferente, do `com308`) |
| Limit Structural Complexity | `BorderoGestaoService` 366 LOC com 7 métodos públicos; `ReconciliacaoPermutaService` 512 LOC; `routes/permutas.ts` 582 LOC com 21 handlers; `ConexosClient` 1856 LOC (classe-deus do diff). FE `borderos/page.tsx` 595 LOC monolítico. Test file `ConexosClient.test.ts` 1490 LOC | ⚠️ parcial | `wc -l` |
| Limit Non-Determinism | `Date.UTC(...)` no `todayUtcMidnightMs` é controlável (o request override via `dataMovto`); `new Date()` informacional no `geradoEm`; sem `Math.random` / `crypto.randomUUID` no diff; testes usam datas fixas (`new Date('2026-06-23T...')`); `jest.useFakeTimers` não é necessário porque o tempo é parametrizado | ✅ presente | `routes/permutas.ts:63-67, 416`; `BorderoGestaoService.test.ts:17`; `ReconciliacaoPermutaService.test.ts:8-9` |

## 4. Findings

### F-testability-1: ConexosClient — zero contract tests nos 8 métodos novos (path/payload do `fin010`)

- **Severidade**: P0 (crítico — exatamente a categoria do bug docTip-vs-filCod que JÁ ocorreu nesta sessão)
- **Tactic violada**: Executable Assertions; Specialized Interfaces (mocking o adapter mas não asserindo o que se envia por ele)
- **Localização**:
  - `src/backend/domain/client/ConexosClient.ts:1081-1265` (todos os 8 métodos novos: `listBaixas`, `excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `getBordero`, `listBorderos`)
  - `src/backend/domain/client/ConexosClient.test.ts:1-1490` (não há nenhum `client.excluirBaixa/excluirBordero/finalizarBordero/cancelarBordero/estornarBordero/getBordero/listBorderos/listBaixas`)
- **Evidência (objetiva)**:
  ```
  $ grep -nE "client\.(excluirBaixa\b|excluirBordero\b|finalizarBordero\b|cancelarBordero\b|estornarBordero\b|getBordero\b|listBorderos\b)" \
        src/backend/domain/client/ConexosClient.test.ts
  (vazio)
  ```
  Note-se que `grep client.listBaixas` retorna **só `listBaixasTitulo`** (método antigo do `com308`, não do `fin010`).
  Path crítico em risco — exemplo `excluirBaixa`:
  ```ts
  // ConexosClient.ts:1146
  const path = `fin010/baixas/${borCod}/${docTip}/${invoiceDocCod}/${titCod}/${bxaCodSeq}`;
  ```
  Se alguém trocar `docTip` por `filCod` outra vez (regressão idêntica ao bug já vivido), o teste de serviço `BorderoGestaoService.test.ts:191-210` continua **verde** — ele assere `excluirBaixa` foi chamado com `{filCod, ...}`, mas o argumento `filCod` jamais entra no path do HTTP (vai no header).
- **Impacto técnico**: regressão silenciosa no path do `fin010` (DELETE, POST `finalizar/cancelar/estornar`) passa por todos os 426 testes; só é detectada quando o ERP retorna `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` em produção (e o operador abre o suporte).
- **Impacto de negócio**: borderô finaliza-se em produção como se fosse OK (resposta HTTP 200), mas o ERP rejeita silenciosamente uma das tentativas e a operação fica em estado inconsistente (baixa removida na nossa trilha, mas o borderô vazio no ERP segue lá); analista revisa um quadro divergente; **tempo médio de diagnóstico observado nesta sessão: ~1 dia de loop com Yuri**.
- **Métrica de baseline**: **0 de 8 métodos novos** com contract test do path; 0 de 8 com assertion explícito do `legacy.deleteGeneric/postGeneric/listGenericPaginated` call args.

### F-testability-2: Routes — 6 rotas novas de borderos sem teste integrado

- **Severidade**: P0 (a tradução do erro do ERP — `ERP_MESSAGE_PT` — só EXISTE na route, não no service; se o mapa quebrar, o operador vê "Generic.ERROR_MESSAGE" cru)
- **Tactic violada**: Executable Assertions; Sandbox (route é o ponto de entrada onde a sandbox `requireRole('admin')` é validada)
- **Localização**:
  - `src/backend/routes/permutas.ts:410-557` (6 handlers novos: `GET /borderos`, `POST /:borCod/finalizar`, `POST /:borCod/cancelar`, `POST /:borCod/estornar`, `DELETE /:borCod`, `DELETE /:borCod/baixas/:invoiceDocCod`)
  - `src/backend/routes/permutas.test.ts` (sem cobertura — `grep borderos` vazio)
- **Evidência (objetiva)**:
  ```
  $ grep -nE "borderos|finalizarBordero|cancelarBordero|estornarBordero|excluirBaixa|excluirBordero" \
        src/backend/routes/permutas.test.ts
  (vazio)
  ```
- **Impacto técnico**: três pontos quebráveis ignorados por testes:
  1. `requireRole('admin')` + `heavyRouteLimiter` aplicados (ou removidos por engano).
  2. `Number(req.params.borCod)` + `Number(req.query.filCod)` + `Number.isFinite(...)` (rota retorna 400 quando inválido).
  3. `erpErrorMessage(err)` traduz códigos `FIN_014.*` → mensagens pt-BR amigáveis (mapa hardcoded; sem teste).
- **Impacto de negócio**: regressão na guarda de role permite analista comum cancelar/estornar borderô finalizado; regressão no mapa de erros faz o operador ver `Generic.ERROR_MESSAGE` cru (perda de confiança na UI exatamente quando algo dá errado).
- **Métrica de baseline**: **0 de 6 rotas** com teste; **0 de 3 chaves de `ERP_MESSAGE_PT`** com teste.

### F-testability-3: Frontend — página `borderos/page.tsx` (595 LOC NEW) sem testes

- **Severidade**: P1 (UI complexa com 4 ações de mutação + estado otimista)
- **Tactic violada**: Executable Assertions; Limit Structural Complexity (monolito sem decomposição)
- **Localização**: `src/frontend/app/permutas/borderos/page.tsx` (595 linhas, sem qualquer arquivo `*.test.tsx` companion)
- **Evidência (objetiva)**:
  ```
  $ grep -rE "borderos|BorderosPage|BorderoCard" src/frontend/__tests__/
  (vazio)
  $ find src/frontend -name "*.test.*" -not -path "*node_modules*" | xargs grep -l borderos
  (vazio)
  ```
- **Impacto técnico**: chamadas otimistas via `lib/api.ts` (`finalizarBordero`/`cancelarBordero`/`estornarBordero`/`excluirBaixa`/`excluirBordero`) podem regredir contra o backend sem teste pegar; a UX de erro (mostrar a mensagem traduzida pelo `erpErrorMessage` do backend) é o ponto onde o usuário interage com a falha — não testado.
- **Impacto de negócio**: regressão silenciosa em produção (UX só é validada manualmente pelo Yuri); o coverage gate FE não pega porque o piso é `lines 25%` (página inteira aumentando o denominador sem teste reduz a média global — gate trava regressões mas não exige nova cobertura).
- **Métrica de baseline**: 0 testes FE para borderos; FE ratio 11/40 = **27.5%**.

### F-testability-4: Routes — `erpErrorMessage` (mapa `ERP_MESSAGE_PT`) sem teste

- **Severidade**: P1 (é a TRADUÇÃO do erro ERP para mensagem amigável — toda a UX da Fase 3.1 sob falha depende dela)
- **Tactic violada**: Executable Assertions (mensagens que mudam por chave invisível)
- **Localização**: `src/backend/routes/permutas.ts:44-61`
- **Evidência (objetiva)**:
  ```
  $ grep -nE "FIN_014|FIN_IMPOSSIVEL|ERP_MESSAGE_PT|erpErrorMessage" \
        src/backend/routes/permutas.test.ts \
        src/backend/domain/service/permutas/BorderoGestaoService.test.ts \
        src/backend/domain/service/permutas/ReconciliacaoPermutaService.test.ts
  (vazio)
  ```
- **Impacto técnico**: se a chave ERP mudar (ex.: `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` → outra versão no upgrade do Conexos), o fallback `String(key)` aparece para o usuário; nenhuma assertion de regressão.
- **Impacto de negócio**: o operador vê uma mensagem técnica em vez do hint sobre como prosseguir ("Estorne antes de mexer").
- **Métrica de baseline**: 0 de 3 chaves do `ERP_MESSAGE_PT` testadas; 0 testes do `erpErrorMessage()` extractor (parsing de `cause.response.data.messages[*].message`).

### F-testability-5: Sem fixtures versionados (Record/Playback) para wire do `fin010`

- **Severidade**: P2 (débito; agrava findings 1-2 mas não isolado)
- **Tactic violada**: Record/Playback
- **Localização**: ausente em `src/backend/domain/client/__fixtures__/` (diretório não existe). Payloads "wire real" vivem como literais em `ConexosClient.test.ts:1213-1217, 1233-1238`, etc.
- **Evidência (objetiva)**:
  ```
  $ find src/backend -type d -name __fixtures__ -not -path "*node_modules*"
  (vazio)
  $ find src/backend -name "*.fixture.*" -not -path "*node_modules*"
  (vazio)
  ```
- **Impacto técnico**: o probe HAR de Yuri (que descobriu o formato real do `DELETE /fin010/baixas/{borCod}/{docTip}/...`) não é versionado; quem refatorar amanhã não tem um arquivo `delete-baixa.fixture.json` para comparar contra o request emitido.
- **Impacto de negócio**: cada bug de path no `fin010` (já tivemos 1 nesta sessão) precisa do Yuri re-rodar o HAR para confirmar; sem fixture, o teste é só "o que o autor lembrou que era".
- **Métrica de baseline**: 0 fixtures wire-real para os 5 endpoints novos do `fin010` (POST `/fin010`, GET `/fin010/{filCod}/{borCod}`, DELETE `/fin010/baixas/...`, DELETE `/fin010/{borCod}`, POST `/fin010/finalizar|cancelar|estornar/{borCod}`).

### F-testability-6: `ConexosClient.ts` é classe-deus (1856 LOC) — testes seguem (1490 LOC)

- **Severidade**: P2 (estrutura; eleva o custo marginal de cada novo teste)
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (1856 LOC, ~30 métodos públicos misturando read/write para `imp019`, `imp021`, `imp223`, `com298`, `com299`, `com308`, `fin010`)
- **Evidência (objetiva)**:
  ```
  $ wc -l src/backend/domain/client/ConexosClient.ts
  1856
  $ wc -l src/backend/domain/client/ConexosClient.test.ts
  1490
  ```
- **Impacto técnico**: o test file é o maior do repo (1490 LOC); adicionar contract tests dos 8 métodos novos requer ~150 LOC adicionais, empurrando para >1600 — sintoma claro de que `ConexosClient` deveria ser quebrado em `Fin010Client`, `Com298Client`, `Imp021Client`, etc.
- **Impacto de negócio**: refactor adiado vira cost-multiplier de toda mudança futura — qualquer feature nova no Conexos paga o pedágio do test-file gigante.
- **Métrica de baseline**: 1 classe / 30+ métodos / 1490 LOC de teste (target: < 800 LOC por test file).

## 5. Cards Kanban

### [testability-1] Adicionar contract tests aos 8 métodos novos do `ConexosClient` (path + payload do `fin010`)

- **Problema**
  > O bug docTip-vs-filCod nasceu porque os métodos novos do `ConexosClient` (`excluirBaixa`, `excluirBordero`, `finalizar/cancelar/estornarBordero`, `getBordero`, `listBorderos`, `listBaixas`) NÃO têm teste assertando o `path` HTTP nem o `opts.filCod` enviados ao `legacy.deleteGeneric/postGeneric/listGenericPaginated`. O test de serviço (`BorderoGestaoService.test.ts:191-210`) assere apenas que `excluirBaixa` foi chamado com `{filCod, ...}` no shape do CLIENT, então pode passar com qualquer reordenação do path interno.

- **Melhoria Proposta**
  > Em `src/backend/domain/client/ConexosClient.test.ts`, criar `describe('fin010 write/list (Fase 3.1)')` com 1 teste por método: cada um faz a chamada e assere o `expect(legacy.X).toHaveBeenCalledWith(EXPECTED_PATH, EXPECTED_BODY, { filCod })`. Especialmente para `excluirBaixa`, fixar `path === 'fin010/baixas/14707/2/18780/1/1'` (com `docTip` no 2º segmento — protege contra a regressão concreta já vivida). Tactic Bass: **Executable Assertions** + **Record/Playback** (path/body literal copiado do HAR do Yuri).

- **Resultado Esperado**
  > Contract tests para 100% dos 8 métodos novos. Qualquer regressão de path (ex.: trocar `docTip` por `filCod` na URL) quebra o `npm test` em < 8s, **antes** do deploy Render.

- **Tactic alvo**: Executable Assertions, Record/Playback
- **Severidade**: P0
- **Esforço estimado**: S (≤ 1 dia — ~150 LOC de teste, padrão já estabelecido em `ConexosClient.test.ts:1345-1489`)
- **Findings relacionados**: F-testability-1, F-testability-5
- **Métricas de sucesso**:
  - Contract tests dos novos métodos do `ConexosClient`: 0 → 8
  - Tests `it` em `ConexosClient.test.ts`: 71 → 79+
  - Bugs de path em `fin010` em produção (proxy: incidentes no log do Render por `FIN_014.*` causados por path errado): histórico-baseline 1 → 0
- **Risco de não fazer**: próximo método WRITE/LIST adicionado em qualquer endpoint do `fin010` herda o mesmo gap; cada bug consome ~1 dia de loop com Yuri + suporte ao operador.
- **Dependências**: nenhuma (o pattern já existe em `ConexosClient.test.ts:1345-1489`).

### [testability-2] Cobrir as 6 rotas novas de borderos com supertest + asserir `requireRole('admin')` e a tradução de erro

- **Problema**
  > Seis endpoints novos foram adicionados em `routes/permutas.ts:410-557` (`GET /borderos`, `POST /:borCod/finalizar|cancelar|estornar`, `DELETE /:borCod`, `DELETE /:borCod/baixas/:invoiceDocCod`) sem nenhuma cobertura. O middleware `requireRole('admin')` + `heavyRouteLimiter` e o tradutor `erpErrorMessage` (mapa `ERP_MESSAGE_PT` com 3 chaves) podem regredir silenciosamente. O `Number(req.params.borCod)` + `Number.isFinite` (rota retorna 400) também não tem teste.

- **Melhoria Proposta**
  > Em `src/backend/routes/permutas.test.ts`, criar `describe('borderos (Fase 3.1)')` cobrindo: (1) happy-path por rota (200 com payload esperado, mock do `BorderoGestaoService`); (2) `requireRole('admin')` retorna 403 sem role; (3) `borCod` inválido retorna 400; (4) erro do ERP com `cause.response.data.messages[0].message === 'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO'` retorna 400 com a mensagem pt-BR amigável. Tactic Bass: **Executable Assertions** (sandbox + extractor).

- **Resultado Esperado**
  > 6/6 rotas com pelo menos 1 happy-path + 1 cenário de erro ERP; mapa `ERP_MESSAGE_PT` exercitado nas 3 chaves; `requireRole('admin')` defendido.

- **Tactic alvo**: Executable Assertions, Sandbox
- **Severidade**: P0
- **Esforço estimado**: M (2-3 dias — padrão de teste com supertest precisa ser estabelecido se ainda não existir; `routes/permutas.test.ts` já tem 28 testes, então o cenário básico existe)
- **Findings relacionados**: F-testability-2, F-testability-4
- **Métricas de sucesso**:
  - Rotas de borderos cobertas: 0/6 → 6/6
  - Chaves de `ERP_MESSAGE_PT` testadas: 0/3 → 3/3
  - Tests `it` em `routes/permutas.test.ts`: 28 → 42+
  - Cobertura por camada `routes/`: 33% → 50%+
- **Risco de não fazer**: regressão na guarda `requireRole('admin')` permite analista comum cancelar/estornar borderô finalizado — auditoria do ERP vai apontar Yuri como executor (campo `executadoPor` cai num fallback `'unknown'` quando a sessão não tem `req.user`).
- **Dependências**: pattern de teste com `supertest` (verificar se já é usado em `routes/permutas.test.ts`; se não, montar o setup uma vez).

### [testability-3] Adicionar teste FE para `app/permutas/borderos/page.tsx` (render + 1 ação + 1 erro)

- **Problema**
  > A página `borderos/page.tsx` (595 LOC NEW) é uma UI complexa com 4 ações de mutação (finalizar/cancelar/estornar/excluir) + estado otimista, sem nenhum teste. O coverage gate FE (lines 25%) não força cobertura — apenas trava regressão. A UX de erro (mostrar a mensagem traduzida pelo backend) é o ponto onde o usuário interage com falha e não tem assertion.

- **Melhoria Proposta**
  > Criar `src/frontend/app/permutas/borderos/page.test.tsx` com pelo menos 3 cenários usando Testing Library + jest-environment-jsdom (já disponível): (1) render inicial com mock da `api.listBorderos()` mostra borderô FINALIZADO + ação Estornar visível; (2) clique em "Estornar" chama `api.estornarBordero()` e atualiza otimisticamente; (3) erro do backend (`fetch` mock rejeitando com mensagem traduzida) é mostrado para o usuário. Tactic Bass: **Executable Assertions** + **Specialized Interfaces** (mock do `lib/api.ts`).

- **Resultado Esperado**
  > FE ratio sobe (27.5% → 30%+); página crítica ganha rede de regressão; bug em `lib/api.ts` (URL/método HTTP errado) é pego no teste FE antes do operador.

- **Tactic alvo**: Executable Assertions, Specialized Interfaces
- **Severidade**: P1
- **Esforço estimado**: M (2-4 dias — provavelmente requer decompor `page.tsx` em sub-componentes; o file de 595 LOC é difícil de testar inteiro)
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - Tests FE para borderos: 0 → 3+
  - FE test files: 11 → 12+
  - FE ratio (test/source): 27.5% → 30%+
  - FE coverage floor pode ser elevado (lines 25 → 28+)
- **Risco de não fazer**: regressão de URL/método HTTP em `lib/api.ts` passa pelo CI e quebra a UI em prod silenciosamente (operador não consegue executar a ação).
- **Dependências**: idealmente quebrar `page.tsx` em sub-componentes (`<BorderoCard>`, `<AcoesBordero>`) — fora deste card, mas facilita.

### [testability-4] Versionar fixtures HAR-real do `fin010` em `domain/client/__fixtures__/`

- **Problema**
  > Os payloads "wire real 2026-06-18" do Conexos vivem como literais inline nos testes (`ConexosClient.test.ts:1213-1217, 1233-1238`). O HAR original que Yuri usou para descobrir o formato do `DELETE /fin010/baixas/{borCod}/{docTip}/...` não está versionado — quem refatorar amanhã não consegue confirmar o request emitido contra "o que o ERP de fato aceita".

- **Melhoria Proposta**
  > Criar `src/backend/domain/client/__fixtures__/fin010/` com 5 arquivos `*.json`: `criar-bordero.req.json`, `delete-baixa.req.json`, `delete-bordero.req.json`, `finalizar-bordero.req.json`, `get-bordero.res.json` (mínimo: o que o probe HAR capturou). Os contract tests do card `testability-1` passam a `expect(legacy.X).toHaveBeenCalledWith(JSON.parse(readFileSync(fixture)))`. Tactic Bass: **Record/Playback**.

- **Resultado Esperado**
  > Fixtures versionados por endpoint do `fin010`; o "wire real" deixa de ser memória do autor e vira artefato auditável.

- **Tactic alvo**: Record/Playback
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1 dia — extrair os literais dos testes para JSON; Yuri pode complementar com HAR adicional)
- **Findings relacionados**: F-testability-5, F-testability-1
- **Métricas de sucesso**:
  - Fixtures wire-real para `fin010`: 0 → 5
  - Pasta `domain/client/__fixtures__/`: ausente → presente
- **Risco de não fazer**: cada bug de path/payload no `fin010` ainda exige re-correr o HAR.
- **Dependências**: card `testability-1` aproveita os fixtures.

### [testability-5] Quebrar `ConexosClient` em sub-clients por módulo Conexos (`Fin010Client`, `Com298Client`, ...)

- **Problema**
  > `ConexosClient.ts` (1856 LOC, ~30 métodos públicos, 6 módulos Conexos misturados — `imp019`, `imp021`, `imp223`, `com298`, `com299`, `com308`, `fin010`) virou classe-deus. O test file espelhou: 1490 LOC. Cada feature nova paga o cost-multiplier de ler o arquivo gigante e localizar o método relevante.

- **Melhoria Proposta**
  > Refatorar `ConexosClient` em 5-6 sub-clients (`Fin010Client`, `Com298Client`, `Com308Client`, `Imp021Client`, `ImpDeclaracaoClient`). O `ConexosClient` atual vira um façade `@singleton @injectable` que compõe os sub-clients (DI). Cada sub-client tem seu próprio `*.test.ts` < 500 LOC. Tactic Bass: **Limit Structural Complexity**.

- **Resultado Esperado**
  > 1 classe-deus (1856 LOC) → 5-6 sub-clients (< 400 LOC cada); 1 test file (1490 LOC) → 5-6 test files (< 500 LOC cada).

- **Tactic alvo**: Limit Structural Complexity
- **Severidade**: P2
- **Esforço estimado**: L (1-2 semanas — refactor mecânico mas largo; alto risco se não houver os contract tests do card `testability-1` antes)
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - LOC do maior arquivo de teste BE: 1490 → < 600
  - LOC do maior client: 1856 → < 400
  - Test files em `domain/client/`: 4 → 9-10
- **Risco de não fazer**: cost-multiplier cresce — cada feature na frente de SISPAG (provedor Nexxera) ou GED vai herdar o "monolito de client" como padrão; consolidator vai re-citar este achado em todas as próximas reviews.
- **Dependências**: card `testability-1` PRIMEIRO (precisa de rede de contract tests antes do refactor para garantir comportamento preservado).

## 6. Notas do agente

- Cobertura por camada está **excelente** (`domain/service` 93%, `domain/repository` 86%, `domain/client` 67%) — o problema NÃO é volume de testes, é **especificidade** dos testes nos pontos de risco. O bug docTip-vs-filCod desta sessão é o exemplo canônico de um teste verde defendendo a coisa errada.
- Não rodei coverage report agregado por arquivo (`npm test -- --coverage`) — a base de evidência (1490 LOC do `ConexosClient.test.ts` com `grep` mostrando zero menções aos 8 métodos novos) já é suficiente para qualificar P0; coverage% só lavava em verde o que sabemos vermelho.
- Conexões cross-QA: F-testability-1/2 sobrepõe com **Fault-Tolerance** (path errado = silent failure no `fin010`, mesmo cenário do `criarBordero` sem retry); F-testability-4 (fixtures) sobrepõe com **Integrability** (contrato versionado com o Conexos); F-testability-3 (FE) sobrepõe com **Modifiability** (decompor `borderos/page.tsx`); F-testability-5 (split do `ConexosClient`) sobrepõe com **Modifiability**.
- A **única classe de não-determinismo nova** é o `new Date()` em `routes/permutas.ts:65` (`todayUtcMidnightMs` para default de `dataMovto`), e o request override pelo body já dá controle ao caller — aceito como ⚠️, não P-rated.
