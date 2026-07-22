---
qa: Testability
qa_slug: testability
run_id: 2026-07-22-1953
agent: qa-testability
generated_at: 2026-07-22T19:56:27Z
scope: frontend
score: 7
findings_count: 4
cards_count: 3
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev tweakando UI presentacional (delta `permutas` — clamp + tooltip em Cliente/Exportador) | Alteração de classe utilitária + prop opt-in em componente compartilhado (`Campo`) | `src/frontend/app/permutas/components/ui.tsx` + 3 call-sites (`AbaAutomaticas`, `VisaoGeralTable`, `AlocarDialog`) | Suíte Jest + Testing Library (`testEnvironment: 'jsdom'`) rodando em CI | Testes de regressão determinísticos falham se a classe `line-clamp-2` sumir ou se `title` deixar de expor o texto completo | 2 casos de regressão adicionados (com/sem clamp) executando em <1s; **truncamento visual real via CSS não observável em jsdom** (declarado explicitamente na seção 2) |

> Nota do Bass: o custo de regressão de um tweak presentacional é dominado pela cobertura de contrato-visual (classe + atributo), não pelo layout real. jsdom é o limite físico — a mitigação é aceitar o proxy (classe/atributo) e complementar em outro anel (Storybook/Chromatic ou Playwright), não fingir que jsdom mede clamp.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Frontend test files | 202 | mantém (não regride) | ✅ | `_shared-metrics.md` (`find src/frontend -name '*.test.ts*'`) |
| FE test suites executando | 17 | mantém | ✅ | `npm test` (17 suites / 88 casos) |
| FE casos de teste passando | 88/88 | 88/88 (delta +2) | ✅ | `npm test` |
| FE ratio test-files / source-files (`.tsx`) | 203 / (7267 - 203 tests) ≈ **1 test file por ~35 fontes** | ≥ 1/2 (Bass, folclore) | ❌ | `find src/frontend -name '*.tsx' -not -name '*.test.tsx' \| wc -l` |
| Coverage global FE — `lines` | 20% (piso CI) | 60% (razoável para features com lógica) | ⚠️ | `src/frontend/jest.config.js:37` |
| Coverage global FE — `branches` | 9% (piso CI) | 40% | ⚠️ | `src/frontend/jest.config.js:38` |
| Coverage global FE — `functions` | 14% (piso CI) | 50% | ⚠️ | `src/frontend/jest.config.js:39` |
| Coverage gate no CI | ✅ presente (`--coverage`), gates baixos porém enforced | mantém e sobe piso a cada tweak | ⚠️ | `.github/workflows/ci.yml:27,46` |
| Testes de regressão adicionados neste delta | 2 (`Campo — clamp + tooltip`) | ≥1 por comportamento novo | ✅ | `src/frontend/__tests__/permutas-components.test.tsx:169-192` |
| Uso de `fast-check` (property-based) no FE | 0 arquivos | oportunidade em `format.ts` (parseBrl/maskBrl/somaPorMoeda) | ⚠️ | `grep -rn "fast-check" src/frontend --include="*.test.ts*"` |
| Uso de `jest.useFakeTimers` no FE | 0 arquivos | injetar quando delta tocar tempo | N/A (delta) | `grep -rn "useFakeTimers" src/frontend/__tests__` |
| Tests FE com `jest.mock`/`jest.fn` | 10 arquivos | tática de sandbox correta | ✅ | `grep -rn "jest.mock\|jest.fn" src/frontend/__tests__ -l` |

> ⚠️ **Não medível localmente**: truncamento visual real (`-webkit-line-clamp: 2`). jsdom não tem layout engine — `getComputedStyle(dd).webkitLineClamp` retorna a string CSS declarada, mas não há box model, nem cálculo de altura, nem overflow real. Portanto o teste `expect(dd).toHaveClass('line-clamp-2')` é um **proxy de contrato**, não uma verificação de renderização. Recomendação: para os próximos deltas com risco de layout, adicionar snapshot visual (Chromatic/Playwright screenshot) — está fora do escopo `--quick`.
>
> ⚠️ **Não medível localmente com `--quick`**: cobertura FE completa por diretório (`--coverage` deliberadamente pulado pelo flag). Baseline persistido dos `coverageThreshold` no `jest.config.js` cumpre a função de gate.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces | `Campo` expõe seams via props (`clamp`, `title`) — testes controlam comportamento via prop, não via mock de DOM | ✅ presente | `src/frontend/app/permutas/components/ui.tsx:193-217` |
| Recordable Test Cases | FE não usa gravação (network-mock/fixtures em disco). Componentes puros/presentacionais não exigem | N/A | delta é presentacional, sem I/O |
| Sandbox | jsdom é a sandbox padrão do Testing Library; render isolado por caso | ✅ presente | `src/frontend/jest.config.js:4` (`testEnvironment: 'jsdom'`) |
| Executable Assertions | `expect(dd).toHaveClass(...)`, `expect(dd).toHaveAttribute('title', NOME_LONGO)` — asserção sobre invariante de contrato-visual | ✅ presente | `src/frontend/__tests__/permutas-components.test.tsx:179-183` |
| Abstract Data Sources | Componentes recebem dados via props (não fetch interno) — teste alimenta direto | ✅ presente | `Campo` puro; `PermutaPendenteTable`, `AbaHistorico` recebem lista via prop |
| Limit Structural Complexity | `Campo` é ~25 LOC, uma responsabilidade (rótulo/valor). Cardinalidade de props (5) baixa | ✅ presente | `src/frontend/app/permutas/components/ui.tsx:193-217` |
| Limit Non-Determinism | Nenhum `Date.now()`, `Math.random()` no delta; testes não usam `fakeTimers` porque não há tempo | ✅ presente (no delta) | `grep -n "Date\|Math.random" src/frontend/app/permutas/components/ui.tsx` → 0 hits |

## 4. Findings (achados)

### F-testability-1: Truncamento visual (`-webkit-line-clamp: 2`) não é verificável em jsdom — teste valida apenas o contrato-de-classe

- **Severidade**: P2 (débito técnico defensável — proxy é aceitável, mas é um proxy)
- **Tactic violada**: Executable Assertions (parcial: assertiva sobre o proxy, não sobre o efeito visual)
- **Localização**: `src/frontend/__tests__/permutas-components.test.tsx:179-183`
- **Evidência (objetiva)**:
  ```tsx
  const dd = screen.getByText(NOME_LONGO)
  expect(dd).toHaveClass('line-clamp-2')          // proxy: classe está aplicada
  expect(dd).toHaveAttribute('title', NOME_LONGO) // proxy: tooltip está armado
  // NÃO verificado: se o texto é REALMENTE cortado em 2 linhas na tela
  ```
  jsdom não implementa layout — o `line-clamp` é uma propriedade CSS que depende de altura de linha, largura do container e ellipsis do WebKit. Nenhum desses é calculado pelo jsdom (`element.offsetHeight` retorna 0 em jsdom sem workaround). Verificado: 0 usos de `getComputedStyle`/`getBoundingClientRect` na suíte FE (`grep -rn`).
- **Impacto técnico**: se alguém trocar `line-clamp-2` por, por exemplo, `truncate` (1 linha) mantendo a classe válida do Tailwind, o teste passa mas o comportamento visual regride. Ou se um pai adicionar `overflow: visible !important`, o clamp deixa de funcionar e o teste continua passando.
- **Impacto de negócio**: baixo neste delta específico (nomes de clientes exportadores no painel de detalhe). Alto em uma feature futura que dependa criticamente de layout (ex.: layout de remessa SISPAG, tela impressa, exportação PDF).
- **Métrica de baseline**: 0 anéis de teste visual reais (snapshot/pixel). CI executa apenas jsdom.

### F-testability-2: FE não tem sinal de defesa acima de `render + query` — nenhum snapshot visual e nenhum browser-real ring

- **Severidade**: P2
- **Tactic violada**: Sandbox (parcial: só existe uma sandbox, não há defesa em camadas)
- **Localização**: `src/frontend/jest.config.js` (única layer); ausência de `playwright.config.*`, `chromatic`, `storybook`, `cypress.config.*`.
- **Evidência (objetiva)**:
  ```
  $ find src/frontend -maxdepth 3 -name 'playwright*' -o -name 'cypress*' -o -name 'chromatic*' -o -name 'storybook*'
  (vazio)
  ```
- **Impacto técnico**: qualquer bug que dependa de layout real (CSS grid colapsando, clamp não renderizando por especificidade, tokens dark-mode inválidos) escapa dos gates. Este delta é o **primeiro** que introduz um invariante puramente visual (clamp) — é o momento certo de discutir o segundo anel.
- **Impacto de negócio**: reincidência do próprio bug que este tweak conserta (overflow invadindo coluna vizinha) em outra rota, sem detecção automática. Regressão volta pela porta de casos-limite (cliente com nome de 90 caracteres em um estado).
- **Métrica de baseline**: 0 arquivos de config para ferramentas de teste visual. 202 arquivos `.test.ts*` — todos jsdom.

### F-testability-3: Piso de cobertura FE é muito baixo (`lines: 20`, `branches: 9`, `functions: 14`) — gate quase não trava regressão

- **Severidade**: P2 (não é P1 porque o gate **existe** e o próprio `jest.config.js` documenta que os pisos foram ajustados a partir do baseline real após `collectCoverageFrom` corrigir o Potemkin; não é fault de arquitetura, é dívida planejada)
- **Tactic violada**: Executable Assertions (o gate assertivo está fraco)
- **Localização**: `src/frontend/jest.config.js:35-44`
- **Evidência (objetiva)**:
  ```js
  coverageThreshold: {
      global: { lines: 20, branches: 9, functions: 14 },
      './lib/auth/': { lines: 24 },
  }
  ```
  Um dev pode remover 30% dos casos de teste e o CI ainda passa.
- **Impacto técnico**: regressões silenciosas em módulos hoje bem cobertos (ex.: `format.ts`, `tabela-filtro.ts`, `utils.ts`) — se alguém deletar `format.test`, o piso global não detecta.
- **Impacto de negócio**: risco médio prazo — quanto mais tempo o piso ficar baixo, mais fácil é convivê-lo como aceitável.
- **Métrica de baseline**: `lines: 20` / `branches: 9` / `functions: 14`. Meta razoável para uma app Next.js de 27k LOC: `lines: 40` / `branches: 25` / `functions: 30` como próximo degrau (ratchet).

### F-testability-4: `fast-check` é dep declarada mas não usada no FE — `format.ts` é o candidato natural

- **Severidade**: P3
- **Tactic violada**: Limit Non-Determinism (por reforço — property-based amplia o espaço de amostra e reduz o overfitting dos exemplos)
- **Localização**: `src/frontend/package.json` (dep) vs `src/frontend/__tests__/**` (0 imports).
- **Evidência (objetiva)**:
  ```
  $ grep -rn "fast-check\|import fc" src/frontend --include="*.test.ts*" -l
  (vazio)
  ```
- **Impacto técnico**: `parseBrl`/`maskBrl`/`somaPorMoeda` são funções puras determinísticas com espaço de entrada grande — hoje há 1-3 exemplos por função. Property-based (`fc.integer`, `fc.stringOf`) exercitaria milhares de casos por rodada e blindaria contra regressões em edge-cases de milhar/decimal.
- **Impacto de negócio**: baixo hoje. Preventivo.
- **Métrica de baseline**: 0 usos de `fast-check` em 202 arquivos de teste FE.

## 5. Cards Kanban

### [testability-1] Documentar limite do jsdom para `line-clamp` e formalizar o proxy adotado

- **Problema**
  > O teste de regressão do delta `permutas-clamp` verifica classe (`line-clamp-2`) e atributo (`title`), não o corte visual real. jsdom não tem layout engine — qualquer regressão que preserve a classe mas quebre o efeito (especificidade de CSS pai, `overflow: visible`, troca por `truncate`) passa despercebida. Sem essa documentação, o próximo dev que herdar o teste pode assumir que a assertiva mede o corte real.

- **Melhoria Proposta**
  > Aplicar tactic **Executable Assertions** de forma honesta: (1) adicionar comentário no topo do `describe('Campo — clamp + tooltip')` explicitando que a suíte valida contrato-de-classe e o efeito visual é verificado fora de jsdom; (2) atualizar `ontology/_inbox/permutas-clamp-followups.md` com a limitação e a próxima ação (card `testability-2`). Sem código de produção afetado.

- **Resultado Esperado**
  > Ao ler o teste, qualquer dev entende o que é medido e o que **não** é. Reduz a chance de falsa segurança em revisões futuras.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - Comentário-de-cabeçalho no `describe('Campo — clamp + tooltip')`: ausente → presente
  - Entrada em `ontology/_inbox/permutas-clamp-followups.md` sobre o limite de jsdom: ausente → presente
- **Risco de não fazer**: em 6 meses um dev troca `line-clamp-2` por `truncate` para "simplificar", o teste passa e o overflow reincide.
- **Dependências**: nenhuma.

### [testability-2] Introduzir anel de teste visual (snapshot/screenshot) para invariantes de layout

- **Problema**
  > O FE só tem um anel de teste (jsdom). Este delta é o **primeiro** que introduz um invariante puramente visual (clamp em 2 linhas). Não há ferramenta que exercite CSS real (Playwright screenshot, Chromatic, Storybook + play). O bug que este delta conserta (overflow invadindo coluna vizinha em Cliente/Exportador) só pode reincidir em outra tela sem detecção automática.

- **Melhoria Proposta**
  > Aplicar tactic **Sandbox** em camadas: escolher UMA ferramenta (proposta: Playwright com `toHaveScreenshot()` em 2-3 casos-chave — painel de detalhe do `AbaAutomaticas` com nome longo de exportador é o piloto natural). Rodar apenas em CI (não local), gate opcional inicialmente (não trava PR), snapshots versionados. **Não é um requisito deste tweak** — é a promoção do gate ao próximo degrau. Card fica em `ontology/_inbox/permutas-clamp-followups.md` para priorização.

- **Resultado Esperado**
  > Regressões visuais de layout viram detectáveis. Delta futuro que altere grid/clamp/overflow no `permutas` gera diff de screenshot.

- **Tactic alvo**: Sandbox (defesa em camadas)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) — setup Playwright + 3 casos-piloto + doc de update de snapshot
- **Findings relacionados**: F-testability-1, F-testability-2
- **Métricas de sucesso**:
  - Anéis de teste FE: 1 (jsdom) → 2 (jsdom + Playwright visual)
  - Casos de teste visual cobrindo `permutas/detalhe`: 0 → 3
- **Risco de não fazer**: 6 meses de features novas em `permutas` e `sispag` sem sinal de regressão visual — dívida acumula em silêncio.
- **Dependências**: decisão de infra CI (tempo extra de pipeline aceitável).

### [testability-3] Ratchet no `coverageThreshold` do FE — subir piso a cada delta que aumente cobertura efetiva

- **Problema**
  > O piso de cobertura FE está em `lines: 20 / branches: 9 / functions: 14`. Documentado como "baseline REAL após corrigir o Potemkin" — é honesto, mas fica congelado. Sem uma política de ratchet, o gate perde força a cada tweak que sobe a cobertura efetiva sem subir o piso correspondente.

- **Melhoria Proposta**
  > Aplicar tactic **Executable Assertions**: definir política escrita em `docs/regis-review/_shared/` (ou no próprio `jest.config.js` como comentário-regra) — **todo `/feature-tweak` que suba a cobertura efetiva em ≥1pp deve subir o piso correspondente em ≥1pp**. Como este delta adiciona 2 casos sem alterar código de produção significativo, o efeito na cobertura é pequeno, então o ratchet aqui é opcional; mas a regra fica no lugar para o próximo tweak.

- **Resultado Esperado**
  > Piso de cobertura acompanha o real. Em 6 meses, `lines: 20 → 35+` sem esforço extra do time.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - Política de ratchet documentada: ausente → presente
  - `coverageThreshold.global.lines` (12 meses): 20 → ≥ 40
- **Risco de não fazer**: piso permanece decorativo, regressões silenciosas em módulos hoje bem cobertos passam pelo CI.
- **Dependências**: nenhuma. Card `testability-4` de property-based fica em backlog (F-testability-4 sem card dedicado — capturado como oportunidade em `ontology/_inbox/permutas-clamp-followups.md`, justificativa: escopo `--quick` e delta presentacional não justifica esforço agora).

## 6. Notas do agente

- Escopo respeitado: `--quick` significa não rodar `--coverage` fresco; usei o piso persistido no `jest.config.js` como baseline defensável. Backend fora de escopo (scope=frontend).
- Métrica `line-clamp` real (`-webkit-line-clamp: 2` visualmente aplicado): tentei via `getComputedStyle`, mas em jsdom o valor da propriedade é a string CSS declarada, não o efeito; declarei explicitamente como não-medível na seção 2.
- F-testability-4 (fast-check ausente) não virou card dedicado — proporcionalidade com o delta e severidade P3 justificam capturar como follow-up em `ontology/_inbox/permutas-clamp-followups.md`.
- Cross-QA: `[testability-2]` (Sandbox/Playwright) conversa com `deployability` (tempo de CI) e `modifiability` (custo de manter snapshots). `[testability-3]` (ratchet) conversa com `deployability` (gate antes do deploy). Alertar o consolidator.
