---
qa: Testability
qa_slug: testability
run_id: 2026-06-18-2346
agent: qa-testability
generated_at: 2026-06-19T00:00:00Z
scope: backend+frontend (paths em _shared-metrics.md)
score: 7.5
findings_count: 5
cards_count: 5
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev tocando a regra de motivo de bloqueio do Gate 2 (sem-saldo vs. já-permutado) | Mudança em `ElegibilidadeService.motivoDoGateFalho` e em `ConexosClient.getDetalheTitulos` (novo campo `valorPermutado` ⇐ `mnyTitPermuta`) | Service de elegibilidade + Client Conexos + UI `StatusBadge` (`app/permutas/page.tsx`) | Pre-merge local (`npm test`); pré-CI | Suíte cobre as duas pernas do gate 2 reprovado, a propagação do campo do client até o snapshot, e a prioridade `nao-pago > ja-permutado` SEM tocar rede e SEM ler relógio | 91/91 testes do escopo verde; 0 chamadas reais de rede no unit; 0 leituras de `Date.now` em código novo; cobertura do branch `ja-permutado` no `StatusBadge` ≥ 1 caso |

Tradução para o caso real: o doc real `8266` (pago E 100% permutado) chegava como BLOQUEADA(sem-saldo), induzindo o analista a tratar como erro o que era na verdade um estado terminal correto. A defesa contra regressão é uma matriz de testes que (a) congela o payload do Conexos, (b) congela a árvore de decisão do motivo, e (c) prova prioridade do gate 3 sobre o gate 2.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Testes verdes no escopo da feature | 91/91 | 100% | ✅ | `_shared-metrics.md` (rodada de baseline) |
| `describe` blocks por método público em `ElegibilidadeService` | 2 describes / 1 método público (`avaliarElegibilidade`) cobrindo 11 caminhos | ≥ 1 describe / método público + ≥ 1 caso/motivo de bloqueio | ✅ | `src/backend/domain/service/permutas/ElegibilidadeService.test.ts:38,147` |
| Casos cobrindo o branch `ja-permutado` (back-end) | 2 (positivo doc 8266 + prioridade `nao-pago > ja-permutado`) | ≥ 2 | ✅ | `ElegibilidadeService.test.ts:104,119` |
| Casos cobrindo a propagação `mnyTitPermuta → valorPermutado` (client) | 2 (presente / ausente) | ≥ 2 | ✅ | `ConexosClient.test.ts:1280,1302` |
| Casos cobrindo o branch `ja-permutado` do `StatusBadge` no front-end | **0** | ≥ 1 (badge variante info + título correto) | ❌ | `src/frontend/app/permutas/page.tsx:73-82`; `grep -rn "ja-permutado" src/frontend/__tests__` → vazio |
| LOC do arquivo de teste mais pesado tocado | `ConexosClient.test.ts` = 1333 LOC | ≤ 500 LOC | ⚠️ | `wc -l src/backend/domain/client/ConexosClient.test.ts` |
| Fontes de não-determinismo introduzidas pelo escopo | 0 (`Date.now`, `Math.random`, `crypto.random` zero hits no diff novo) | 0 | ✅ | `grep -n "new Date\|Date.now\|Math.random" src/backend/domain/service/permutas/ElegibilidadeService.ts` → 0 hits novos |
| Chamadas reais de rede em unit tests do escopo | 0 (todos via `buildLegacy()` + `mockResolvedValue`) | 0 | ✅ | `grep -n "axios\|fetch(" src/backend/domain/client/ConexosClient.test.ts` (apenas no source) |
| Construtor com DI manual nos testes (tactic *Specialized Interfaces*) | 2/2 nos arquivos tocados (`new ElegibilidadeService(new CasamentoInvoiceService())`, `new ConexosClient(legacy)`) | 100% | ✅ | `ElegibilidadeService.test.ts:39`; `ConexosClient.test.ts:1218` |
| Compartilhamento de estado entre `it()` (flake-risk) | 0 `beforeAll` mutável; cada `it` constrói o adiantamento via factory `buildAdiantamento`/`buildLegacy` | 0 | ✅ | `ElegibilidadeService.test.ts:13`; `ConexosClient.test.ts:1210` |

> ⚠️ **Não medível em `--quick`**: percentual de cobertura por linha/branch nos arquivos do escopo (skip por `--quick`). Recomendação: rodar `cd src/backend && npm test -- --coverage --collectCoverageFrom='src/domain/service/permutas/**' --collectCoverageFrom='src/domain/client/ConexosClient.ts'` em um run não-quick e gravar o número em `_shared-metrics.md` para baseline.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | DI por construtor em ambos os serviços/cliente do escopo, mockando dependência única (`CasamentoInvoiceService` real, `LegacyConexosAdapter` mockado) — exatamente o seam recomendado em CLAUDE.md ("Test the service layer") | ✅ presente | `ElegibilidadeService.test.ts:39`; `ConexosClient.test.ts:1218` |
| Recordable Test Cases | Payloads reais do Conexos (docs 8266, 26471, 24166, 21841) embutidos inline como fixtures, com rastreabilidade no comentário ("Print real Conexos doc 8266 …") | ⚠️ parcial — fixtures **inline**, não em `__fixtures__/`; risco de duplicação se outra suíte precisar do mesmo payload (no escopo: nenhuma, mas é a tendência conforme integrações Nexxera/GED entrarem) | `ConexosClient.test.ts:1280-1300` |
| Sandbox | Unit-tests cortam externamente: `LegacyConexosAdapter` mockado, sem rede; nenhum hit a Postgres/Supabase no escopo | ✅ presente | `ConexosClient.test.ts:1210` (`buildLegacy()`) |
| Executable Assertions | Asserts ricos em estado terminal (`estadoElegibilidade`, `motivoBloqueio`) **e** em auditoria intermediária (`gatesAvaliados`, `gate2?.passed`, `gate3?.passed`) — capturam a árvore de decisão, não só a folha | ✅ presente | `ElegibilidadeService.test.ts:52,90,115,142` |
| Abstract Data Sources | `Adiantamento.valorPermutado?: number` é construído via factory `buildAdiantamento(overrides)`; nenhuma data source real é tocada | ✅ presente | `ElegibilidadeService.test.ts:13-23` |
| Limit Structural Complexity | `ConexosClient.test.ts` cresceu para **1333 LOC** sobre um source de **1414 LOC** — o teste é praticamente do mesmo tamanho do código sob teste; describe `getDetalheTitulos` já tem 8 it’s. Aglutina retry, 400-quirk, `mnyTitPermuta`, `pago`, `valorPermutar`. Boa coesão temática mas extrapola o heuristic de ≤ 500 LOC | ⚠️ parcial | `wc -l src/backend/domain/client/ConexosClient.test.ts` → 1333 |
| Limit Non-Determinism | Nenhuma `new Date()`/`Math.random` introduzida no diff do escopo. `AgingService.compute` já recebe `now` como parâmetro (clock-injection local). Demais services do permutas (`Ingestao`, `Eleicao`) ainda usam `new Date()` direto, mas **fora do escopo** desta feature | ✅ presente para o diff; ⚠️ herdado fora do escopo | `grep -n "new Date" src/backend/domain/service/permutas/ElegibilidadeService.ts` → 0 |

## 4. Findings (achados)

### F-testability-1: Branch `ja-permutado` do `StatusBadge` (front-end) sem teste unitário

- **Severidade**: P1
- **Tactic violada**: Executable Assertions (na camada de UI) / Specialized Interfaces
- **Localização**: `src/frontend/app/permutas/page.tsx:73-82`; ausência confirmada em `src/frontend/__tests__/**`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "ja-permutado" src/frontend/__tests__
  (vazio)
  $ grep -rn "StatusBadge" src/frontend/__tests__
  (vazio)
  ```
  O branch é uma variante visual distinta (`bg-info-subtle`, `CheckCircle2`) deliberadamente diferente do vermelho das demais bloqueadas. A documentação no comentário do componente reforça que **confundir esse badge com `bloqueada` engana o operador** — e nada na suíte de testes defende essa distinção.
- **Impacto técnico**: qualquer refactor do `StatusBadge` (ex.: troca de tokens do design system, reordenação dos `if`s) pode silenciosamente cair na cláusula `return` final e renderizar como bloqueada vermelha sem alarme.
- **Impacto de negócio**: o analista pode reabrir como erro um adiantamento que está em estado terminal correto; retrabalho operacional + risco de reconciliação dupla de uma permuta já consumida.
- **Métrica de baseline**: testes cobrindo o branch `motivo === 'ja-permutado'` = **0**; cobertura de `app/permutas/page.tsx` (680 LOC) = **0 testes**.

### F-testability-2: `MOTIVO_LABEL` do front-end é `Record<string,string>` solto, sem amarração tipada ao enum `MOTIVO_BLOQUEIO` do back-end

- **Severidade**: P2
- **Tactic violada**: Limit Structural Complexity (acoplamento implícito) / Executable Assertions
- **Localização**: `src/frontend/app/permutas/page.tsx:37-49`
- **Evidência (objetiva)**:
  ```ts
  const MOTIVO_LABEL: Record<string, string> = {
    'nao-pago': 'Não totalmente pago',
    'sem-saldo-permutar': 'Sem saldo a permutar',
    'ja-permutado': 'Já permutado',
    ...
  }
  ```
  A tabela é uma string-literal duplicada do enum back-end (`MOTIVO_BLOQUEIO` em `interface/permutas/EstadoElegibilidade.ts:44`). Não há nada que reprove um motivo novo no back-end que não tenha entrada aqui — fallback silencioso para o valor cru.
- **Impacto técnico**: drift entre enum back-end e label front-end fica invisível até o usuário ver `'ja-permutado'` em vez de `'Já permutado'`.
- **Impacto de negócio**: badges com `motivoBloqueio` cru exposto ao operador (label técnico vazando para a UI).
- **Métrica de baseline**: 0 testes garantindo que cada chave de `MOTIVO_BLOQUEIO` tem entrada em `MOTIVO_LABEL`.

### F-testability-3: `ConexosClient.test.ts` chegou a 1333 LOC — file-level structural complexity acima do heurístico

- **Severidade**: P2
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts` (1333 LOC), em particular o `describe('getDetalheTitulos … valorPermutar + pago')` (linhas 1208–1332, 8 it’s)
- **Evidência (objetiva)**: `wc -l src/backend/domain/client/ConexosClient.test.ts` → `1333`. Os 2 novos casos `valorPermutado` somam ~35 LOC ao mesmo describe que já mistura retry, ConexosError, 400-quirk e `pago`/`valorPermutar`.
- **Impacto técnico**: file size > 500 LOC degrada o `time-to-locate` em falhas; é o file que mais cresce a cada nova quirk da API Conexos (com 4 integrações pendentes: Nexxera retorno, GED, SharePoint, banco SISPAG).
- **Impacto de negócio**: custo crescente por mudança no client Conexos; testes ficam caros de atualizar (taxa-de-modificabilidade direta).
- **Métrica de baseline**: 1333 LOC no arquivo; describe único com 8 it’s e 5 facetas (retry + quirk + permutado + permutar + pago).

### F-testability-4: Fixtures Conexos vivem inline em vez de `__fixtures__/`

- **Severidade**: P3
- **Tactic violada**: Recordable Test Cases
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts:1212,1229,1245,1286,1304` (payloads docs 26471/24166/21841/8266 inline em `mockResolvedValue`)
- **Evidência (objetiva)**: nenhum diretório `src/backend/domain/client/__fixtures__/` ou `*.fixture.ts` existe (`ls src/backend/domain/client/` → `BcbClient.ts`, `ConexosClient.ts`, `database`, `legacyConexosAdapter.ts`, `permutas`).
- **Impacto técnico**: à medida que mais consumidores (eg. `EleicaoPermutasService.test`, futuro `SispagPagamentoService`) precisarem dos mesmos payloads "doc real", a duplicação inline cresce; mudança de schema do `getGeneric` exige varrer N arquivos.
- **Impacto de negócio**: tempo de manutenção crescente com cada nova integração — sintoma de débito que só dói depois das frentes II/III entrarem.
- **Métrica de baseline**: 0 fixtures dedicadas; 4 payloads inline duplicáveis.

### F-testability-5: Não-determinismo (Clock) em `EleicaoPermutasService`/`IngestaoPermutasService` (cross-QA com Modifiability) — fora do escopo desta feature

- **Severidade**: P3
- **Tactic violada**: Limit Non-Determinism
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:257,264,307`; `IngestaoPermutasService.ts:66,82,120,140,163`
- **Evidência (objetiva)**:
  ```
  EleicaoPermutasService.ts:257: const startedAt = new Date();
  IngestaoPermutasService.ts:66:  const startedAt = new Date();
  ```
  `AgingService.compute(dataBase, now = new Date())` já demonstra o padrão correto (clock injetado). Os services de orquestração ainda não seguem.
- **Impacto técnico**: testes que precisem assertar `durationMs` ou `startedAt` precisarão de `jest.useFakeTimers()` em vez de injeção limpa; flake-risk em CI lento.
- **Impacto de negócio**: nenhum imediato — flagging como dívida acumulada para a frente II (SISPAG) que terá janelas temporais.
- **Métrica de baseline**: 8 leituras de `new Date()` em serviços de permutas (fora do escopo do diff "já permutado", mas tocados pela superfície).

## 5. Cards Kanban

### [testability-1] Adicionar teste do `StatusBadge` cobrindo o branch `ja-permutado`

- **Problema**
  > A nova variante visual `ja-permutado` (badge info + `CheckCircle2`) só é defendida hoje pela revisão de design. Qualquer refactor do `StatusBadge` em `app/permutas/page.tsx:51-91` pode cair no `return` final e renderizar como bloqueada vermelha, induzindo o analista a tratar como erro um estado concluído (doc 8266 real).
- **Melhoria Proposta**
  > Extrair `StatusBadge` para `src/frontend/app/permutas/StatusBadge.tsx` (já estaria importado pelo page sem mudar a UX) e adicionar `src/frontend/app/permutas/StatusBadge.test.tsx` (React Testing Library) com 4 casos: `elegivel`, `casamento-manual`, `bloqueada + motivo='ja-permutado'`, `bloqueada + motivo='sem-saldo-permutar'`. Assertar role do `Badge`, presença do ícone (`CheckCircle2` vs `Ban`) e `title` esperado. Tactic alvo: *Specialized Interfaces* + *Executable Assertions* na camada UI.
- **Resultado Esperado**
  > Refactors futuros do `StatusBadge` falham na suíte se o branch `ja-permutado` cair de volta no vermelho. Métrica: testes cobrindo `StatusBadge['ja-permutado']` **0 → ≥ 1**; testes em `src/frontend/app/permutas/` **0 → ≥ 4**.
- **Tactic alvo**: Specialized Interfaces / Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Testes cobrindo o branch `ja-permutado`: 0 → ≥ 1
  - Componentes da rota `app/permutas` com teste: 0 → 1 (`StatusBadge`)
- **Risco de não fazer**: em 6 meses, com novas variantes (`ProcessamentoBadge`, futuros motivos de SISPAG/GED), o `StatusBadge` vira lugar de regressão silenciosa; primeira reclamação vem via suporte com print do badge errado.
- **Dependências**: nenhuma

### [testability-2] Travar `MOTIVO_LABEL` no front-end ao enum `MOTIVO_BLOQUEIO` do back-end

- **Problema**
  > `src/frontend/app/permutas/page.tsx:37-49` declara `MOTIVO_LABEL: Record<string, string>`. Um motivo novo no back-end (próxima feature) pode chegar à UI como string crua (`'ja-permutado'` em vez de `'Já permutado'`) sem nada reprovar — drift invisível.
- **Melhoria Proposta**
  > Compartilhar um tipo `MotivoBloqueio` (já existe em `src/backend/domain/interface/permutas/EstadoElegibilidade.ts`) com o front via export pelo pacote de tipos (ou colocar `MOTIVO_LABEL: Record<MotivoBloqueio, string>` no front). Adicionar teste `MOTIVO_LABEL.test.ts` que itera as chaves do enum e exige label não-vazio. Tactic alvo: *Executable Assertions* + *Limit Structural Complexity* (corta acoplamento implícito).
- **Resultado Esperado**
  > Adicionar um motivo no back sem espelhar no front quebra typecheck **ou** teste. Métrica: cobertura exhaustiva motivos × label **parcial (string-loose) → 100% tipada**.
- **Tactic alvo**: Executable Assertions / Limit Structural Complexity
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - Chaves `MOTIVO_LABEL` cobertas por enum tipado: 0/10 → 10/10
  - Testes garantindo bijeção motivo↔label: 0 → 1
- **Risco de não fazer**: cada nova frente (SISPAG, GED) trará motivos novos; drift acumulado entre back-end e front-end de UX.
- **Dependências**: nenhuma

### [testability-3] Quebrar `ConexosClient.test.ts` por capability

- **Problema**
  > `ConexosClient.test.ts` chegou a 1333 LOC (quase 1:1 com o source de 1414 LOC). O describe `getDetalheTitulos` agrega retry, ConexosError, 400-quirk, `valorPermutar`, `pago` e agora `valorPermutado` — 5 facetas em 8 it’s. Em 3 sprints, com Nexxera/GED, tende a explodir.
- **Melhoria Proposta**
  > Fatiar em `ConexosClient.list.test.ts`, `ConexosClient.detalheTitulos.test.ts`, `ConexosClient.retryAndErrors.test.ts` mantendo o factory `buildLegacy()` compartilhado em `ConexosClient.testUtils.ts`. Cada arquivo ≤ 500 LOC. Tactic alvo: *Limit Structural Complexity*.
- **Resultado Esperado**
  > Diff de novas quirks toca apenas um arquivo de teste. Métrica: maior arquivo de teste em `domain/client/` 1333 LOC → ≤ 500 LOC; nº de facetas por describe ≤ 2.
- **Tactic alvo**: Limit Structural Complexity
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - LOC do maior teste do client: 1333 → ≤ 500
  - Facetas por describe: 5 → ≤ 2
- **Risco de não fazer**: cada nova integração de cliente externo (Nexxera, GED, banco SISPAG) tende a copiar esse padrão monolítico — débito que escala linearmente com frentes.
- **Dependências**: nenhuma

### [testability-4] Promover payloads reais do Conexos para `__fixtures__/`

- **Problema**
  > Payloads dos docs reais 8266, 26471, 24166, 21841 vivem inline em `mockResolvedValue` espalhados pelo teste. Outros consumidores (services de permutas, futuro SISPAG) vão duplicar.
- **Melhoria Proposta**
  > Criar `src/backend/domain/client/__fixtures__/conexos/detalheTitulos.ts` com `export const detalheTitulosDoc8266 = { ... }` (e companheiros) e referenciar tanto em `ConexosClient.test.ts` quanto em `ElegibilidadeService.test.ts` quando precisar simular o adiantamento com `valorPermutado`. Tactic alvo: *Recordable Test Cases*.
- **Resultado Esperado**
  > Schema change do `getGeneric` toca **um** lugar. Métrica: payloads "doc real" centralizados 0 → 4; sites de duplicação inline 4 → 0.
- **Tactic alvo**: Recordable Test Cases
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-4, F-testability-3
- **Métricas de sucesso**:
  - Fixtures centralizadas em `__fixtures__/`: 0 → 4
  - Duplicações inline do payload Conexos: 4 → 0
- **Risco de não fazer**: cada frente (II SISPAG, III GED) replica o padrão inline; débito de manutenção cresce.
- **Dependências**: testability-3 (faz sentido juntar com o fatiamento do test file)

### [testability-5] Injetar `ClockProvider` em `IngestaoPermutasService` / `EleicaoPermutasService`

- **Problema**
  > `IngestaoPermutasService` e `EleicaoPermutasService` leem `new Date()` direto em 8 sites (incluindo `durationMs`, `startedAt`, `finishedAt`). `AgingService.compute` já demonstrou o padrão correto recebendo `now` como parâmetro. A frente II (SISPAG) terá janelas temporais (lote do dia, retorno, conciliação) — entrar nelas com clock implícito é débito conhecido.
- **Melhoria Proposta**
  > Criar `domain/libs/ClockProvider.ts` (`@singleton() @injectable()`) com `now(): Date`, injetar nos services e usar nos testes via mock. Tactic alvo: *Limit Non-Determinism* + cross-QA Modifiability.
- **Resultado Esperado**
  > Tests de duração e timestamps determinísticos sem `jest.useFakeTimers` global. Métrica: leituras de `new Date()` em `service/permutas/` 8 → 0; services com clock injetado 1/4 → 4/4.
- **Tactic alvo**: Limit Non-Determinism
- **Severidade**: P3
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-5
- **Métricas de sucesso**:
  - Sites `new Date()` em services permutas: 8 → 0
  - Services com clock injetado: 1 (`AgingService`) → 4
- **Risco de não fazer**: ao chegar SISPAG/Nexxera com janelas temporais e D+1, débito vira flake recorrente; cross-QA com Modifiability (mudar política de timeout exige reescrever testes).
- **Dependências**: idealmente combinado com a primeira `/feature-new` que tocar `IngestaoPermutasService` ou `EleicaoPermutasService`.

## 6. Notas do agente

- Modo `--quick`: cobertura por linha/branch dos arquivos do escopo **não** foi medida — declarada explicitamente em Métricas, com comando de coleta para a próxima rodada não-quick. P0/P1 com baseline numérica vêm da inspeção estática (LOC, contagem de `it()`, ausência de testes UI), não de % coverage.
- Decisão de escopo: tratei `IngestaoPermutasService`/`EleicaoPermutasService` clock como P3 (cross-QA flag para Modifiability) porque os arquivos não foram tocados nesta feature — Bass: testability custa o que o futuro vai cobrar, e a primeira frente que precisar (SISPAG) é o melhor gatilho.
- Cross-QA para o `qa-consolidator`:
  - F-testability-2 ↔ Modifiability (tipos compartilhados back↔front cortam acoplamento).
  - F-testability-4 ↔ Integrability (fixtures reais como contrato implícito do Conexos — espelham contract tests).
  - F-testability-5 ↔ Modifiability + Fault-Tolerance (clock injetado vira pré-requisito para testar timeouts/SLAs do SISPAG).
  - O test gap do `StatusBadge ja-permutado` cruza com a próxima revisão de Modifiability do front-end (componente está embedded na page com 680 LOC — extração não testada).
