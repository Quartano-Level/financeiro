---
qa: Testability
qa_slug: testability
run_id: 2026-06-18-2158
agent: qa-testability
generated_at: 2026-06-19T00:05:00Z
scope: backend+frontend (scoped to `casamento-manual` tweak)
score: 7
findings_count: 2
cards_count: 2
---

# Testability — Regis-Review

> Escopo: tweak `casamento-manual` na branch `feat/permutas-painel-elegiveis` (ADR-0005). **NÃO** é
> um sweep do repo — só os testes adicionados/alterados para o novo estado e o que ficou de fora.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev altera regra do `casamento-manual` (refactor futuro) | Mudança em `ElegibilidadeService`, `GestaoPermutasService`, `IngestaoPermutasService`, `PermutaSnapshotRepository` ou `page.tsx` | Pipeline de eleição N:M → KPI `/gestao` + badge no FE + snapshot de back-compat (`/painel`) | CI (`npm test`) em branch antes do merge | Suíte falha em ≤1min apontando exatamente qual invariante do estado `casamento-manual` quebrou (4 gates verdes; N:M conta em `casamentoManual` e não em `bloqueadas`; relacional persiste `'casamento-manual'`; snapshot colapsa para `'bloqueada'` por design ADR-0005 §4) | 0% de regressão do estado `casamento-manual` chegar em main; tempo de detecção < 60s |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Testes do tweak `casamento-manual` (backend) | 8 asserts em 3 arquivos (ElegibilidadeService.test.ts L66-78, GestaoPermutasService.test.ts L97-135, IngestaoPermutasService.test.ts L217-235) | ≥1 por seam tocado | ⚠️ snapshot seam descoberto | grep `casamento-manual` (4+5+3=12 refs, 8 assertivas distintas) |
| Testes do tweak `casamento-manual` (frontend) | 0 | ≥1 (badge OU filtro) | ❌ ausente | `grep -rn "casamento-manual\|StatusBadge" src/frontend/__tests__` → vazio |
| Cobertura por camada do delta (services Permutas) | 100% dos services tocados têm `.test.ts` (3/3) | 100% | ✅ | `ls src/backend/domain/service/permutas/*.test.ts` |
| Cobertura por camada do delta (repository Permutas) | 1/2 do delta — `PermutaRelationalRepository` (migrado) tem test; `PermutaSnapshotRepository` (mapeamento `casamento-manual → bloqueada` ADR-0005 §4) **não tem assert do colapso** | 2/2 | ⚠️ | `grep -c casamento-manual src/backend/domain/repository/permutas/PermutaSnapshotRepository.test.ts` → 0 |
| Cobertura por camada do delta (frontend `page.tsx`) | 0/1 — não existe `app/permutas/page.test.tsx`. Gap **pré-existente**: o repo não testa `page.tsx` em nenhuma feature | ≥1 | ❌ | `find src/frontend/__tests__ -name "*page*"` → vazio |
| Estado `casamento-manual` — transições de máquina cobertas | 2/2 entradas testadas (N:M → CASAMENTO_MANUAL ok; sem-invoice → BLOQUEADA mantém) | 2/2 | ✅ | ElegibilidadeService.test.ts L66-78, L56-64 |
| Mocking via constructor-injection (sem `container.resolve` nos testes do delta) | 3/3 testes — `new ElegibilidadeService(new CasamentoInvoiceService())`, `new GestaoPermutasService(buildRelational(), …)`, `new IngestaoPermutasService(…)` | 100% | ✅ | conforme CLAUDE.md: "Test the service layer, not the handler directly" |
| Não-determinismo (clock/random) introduzido pelo tweak | 0 (estado é puro, deriva só de input do CasamentoInvoiceService) | 0 | ✅ | leitura de ElegibilidadeService.ts L54-127 |
| Backend suite (escopo Permutas) | 91 testes verde | verde | ✅ | reportado pelo usuário |
| Frontend suite | 34 testes verde | verde | ✅ | reportado pelo usuário |

> ⚠️ **Não medível localmente**: cobertura `lines/branches/functions` por arquivo (não foi rodado
> `jest --coverage` neste escopo — o user pediu *quick*, escopo do tweak; rodar coverage do repo
> inteiro estouraria o escopo). Recomendação: rodar `npm test -- --coverage --collectCoverageFrom='**/permutas/**'`
> só sobre o delta antes do PR para fixar uma baseline numérica do tweak.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Specialized Interfaces (test seams) | Constructors aceitam mocks (`new ElegibilidadeService(new CasamentoInvoiceService())`); tsyringe `@inject` permite injeção direta sem `container.resolve` em test | ✅ presente | ElegibilidadeService.test.ts:39; GestaoPermutasService.test.ts:80-94 (`buildRelational`/`buildProcessamento` factories tipadas como `jest.Mocked<Repo>`) |
| Recordable Test Cases | Não há fixture gravada para o novo cenário N:M no nível de Conexos; os testes usam `buildAdiantamento`/`buildInvoice` factories | ⚠️ parcial | ElegibilidadeService.test.ts:13-33. Aceitável para tweak puramente lógico (gates), mas N:M end-to-end não tem fixture do `getDetalheTitulos` |
| Sandbox | `IngestaoPermutasService.test.ts` simula `persistIngestRun` rodando o `write(tx,…)` callback contra um `tx` mockado (L132-141) — efetivo sandbox transacional | ✅ presente | IngestaoPermutasService.test.ts:131-141 |
| Executable Assertions | Assertivas duras no shape do KPI (`totais` exato) + status mapping linha-a-linha (`A1='elegivel'`, `A2='bloqueada'`, `A3='casamento-manual'`) | ✅ presente | GestaoPermutasService.test.ts:112-118, 130-134 |
| Abstract Data Sources | `PermutaRelationalRepository` é mockado como interface (`jest.Mocked<PermutaRelationalRepository>`), não via DB real — tweak não exige DB | ✅ presente | GestaoPermutasService.test.ts:85-89 |
| Limit Structural Complexity | Service `ElegibilidadeService` continua coeso (1 método público, 4 gates explícitos); o novo branch adicionou 9 linhas (L107-115) — não inflou complexidade | ✅ presente | ElegibilidadeService.ts:101-117 (3 linhas de decisão por sabor) |
| Limit Non-Determinism | Tweak não introduz clock/random; estado é determinístico em função de `{adiantamento, declaracoes, invoices}` | ✅ presente | ElegibilidadeService.ts:54-127 |

## 4. Findings (achados)

### F-testability-1: Snapshot `casamento-manual → bloqueada` é design-contract sem teste-de-fechadura

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:247-250`
  e `:281` (`mapSnapshotRow.status`); `src/backend/domain/repository/permutas/PermutaSnapshotRepository.test.ts` (0 ocorrências de `casamento-manual`)
- **Evidência (objetiva)**:
  ```ts
  // PermutaSnapshotRepository.ts:247-250 — colapso ELEGIVEL/else → 'elegivel'/'bloqueada'
  const status =
      candidata.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL
          ? 'elegivel'
          : 'bloqueada';
  ```
  ```
  $ grep -c "casamento-manual\|CASAMENTO_MANUAL" PermutaSnapshotRepository.test.ts
  0
  ```
  ADR-0005 §4 (linhas 48-53) **documenta** este colapso como decisão (back-compat de `/painel` PR#2,
  CHECK da migration 0001 inalterada). Logo NÃO é bug — é contrato.
- **Impacto técnico**: contrato de back-compat documentado sem assert. Um refactor de
  `insertCandidataChunk` ou uma "limpeza" da ternária (ex.: alguém adicionando um terceiro caso
  esperando que o snapshot ganhasse a coluna) quebraria silenciosamente o `/painel` legado e/ou
  violaria o CHECK do schema (`permuta_candidata_snapshot.status` aceita só `'elegivel'|'bloqueada'`,
  migration 0001) — a suíte ficaria verde porque ninguém asserta o colapso.
- **Impacto de negócio**: enquanto `/painel` (rota legada em `routes/permutas.ts:102`) estiver
  vivo, a contagem `totalBloqueadas` lá inclui N:M por design — quebrar o colapso poderia gerar 500
  no `/painel` (CHECK constraint violation) sem CI dar sinal. Pré-existente: o usuário já notou
  ("works via the existing collapse").
- **Métrica de baseline**: 0 testes asserindo `estadoElegibilidade='casamento-manual'` → `status='bloqueada'`
  no row gravado por `insertCandidataChunk`. Esperado: ≥1.

### F-testability-2: `StatusBadge('casamento-manual')` e KPI filter não têm teste de UI

- **Severidade**: P3 (baixo — melhoria opcional, gap pré-existente)
- **Tactic violada**: Executable Assertions (FE)
- **Localização**: `src/frontend/app/permutas/page.tsx:47-56` (branch `casamento-manual` do StatusBadge),
  `:217-225` (KPI clicável que seta filtro `'casamento-manual'`), `:107-111` (`FILTRO_VAZIO_LABEL`).
  Nenhum `*.test.tsx` cobre `page.tsx` em qualquer rota do projeto.
- **Evidência (objetiva)**:
  ```
  $ find src/frontend/__tests__ -name "*page*" -o -name "*permutas*"
  (vazio)
  $ grep -rn "StatusBadge\|casamento-manual" src/frontend/__tests__
  (vazio)
  ```
  Os 34 testes FE cobrem `lib/utils`, primitives de UI, auth — nenhum cobre a `page.tsx` da feature.
- **Impacto técnico**: o tipo `StatusElegibilidade = 'elegivel' | 'bloqueada' | 'casamento-manual'`
  (`src/frontend/lib/types.ts:25`) trava o shape em compile-time, então um typo no FE (`'casamento_manual'`)
  é pego pelo `tsc`. O que NÃO é pego: regressão do CSS class (`bg-warning-subtle`), do ícone
  (`Layers`), ou do filtro KPI (`filtro === 'casamento-manual'`) — refactors visuais.
- **Impacto de negócio**: badge errado/sumido na tela do analista degrada UX, mas não é
  invariante financeira (o número está correto via `totais.casamentoManual`, vindo do backend
  testado). Detectável manualmente em smoke. Gap é **sistêmico** (nenhuma página tem test), não
  específico do tweak.
- **Métrica de baseline**: 0 testes FE para `app/permutas/page.tsx`; tweak adicionou 3 caminhos
  novos (badge, KPI clicável, label vazio) sem teste correspondente.

## 5. Cards Kanban

### [testability-1] Fechar o contrato de back-compat do snapshot com um asserção mínima

- **Problema**
  > `PermutaSnapshotRepository.insertCandidataChunk` (L247-250) colapsa `casamento-manual → 'bloqueada'`
  > por design (ADR-0005 §4) para manter a CHECK da migration 0001 do snapshot. Esse colapso é um
  > contrato documentado, mas **não tem teste**. Refactor futuro da ternária quebra silenciosamente
  > o `/painel` legado (CHECK violation) sem a suíte avisar.

- **Melhoria Proposta**
  > Adicionar 1 caso em `PermutaSnapshotRepository.test.ts`: persistir uma `PermutaCandidata` com
  > `estadoElegibilidade=CASAMENTO_MANUAL` + `motivoBloqueio=COMPOSTO_NM` e asserir que
  > (a) o parâmetro `status_0` enviado ao `tx.insert` é `'bloqueada'`, (b) `motivoBloqueio_0` é
  > `'composto-nm'`. Tactic Bass: **Executable Assertions** — transformar a decisão escrita no ADR
  > num assert executável. Arquivo único, mock do `tx.insert` já está construído (`buildDb()` L16-38).

- **Resultado Esperado**
  > Contrato ADR-0005 §4 verificado em CI. Asserções `casamento-manual → 'bloqueada'` no snapshot:
  > 0 → 1. Suíte do `PermutaSnapshotRepository`: 10 → 11 testes. Risco de regressão silenciosa do
  > `/painel`: indetectável → bloqueado em CI.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S (≤1d — ~30 min, um único `it()`)
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - asserts cobrindo o colapso `casamento-manual → 'bloqueada'` no snapshot: 0 → ≥1
  - testes de `PermutaSnapshotRepository.test.ts` referenciando `CASAMENTO_MANUAL`: 0 → ≥1
- **Risco de não fazer**: refactor inocente da ternária (ex.: ao migrar o snapshot para aceitar o
  novo status na Fatia 2) quebra `/painel` em produção com CHECK violation; ou pior, passa a gravar
  `'casamento-manual'` no snapshot e quem consome `PainelService` (`PainelItem.status` é `'elegivel'|'bloqueada'`)
  passa a receber um status que não está no tipo.
- **Dependências**: nenhuma — pode entrar no mesmo PR do tweak.

### [testability-2] Pilot de teste de componente para o `StatusBadge` do casamento-manual

- **Problema**
  > A página `app/permutas/page.tsx` ganhou um branch novo de `StatusBadge` (L47-56), um KPI
  > clicável (L217-225) e um label vazio (L107-111) para o estado `casamento-manual`. **Nenhuma
  > rota** do projeto tem testes de componente hoje, então o tweak segue o padrão local — mas o
  > acúmulo dessa lacuna significa que qualquer regressão visual (classe Tailwind trocada, ícone
  > sumido, filtro KPI quebrado) só é pega em smoke manual.

- **Melhoria Proposta**
  > Extrair `StatusBadge` para `src/frontend/components/permutas/StatusBadge.tsx` (componente puro
  > recebendo `status` + `motivo`) e criar `__tests__/permutas/StatusBadge.test.tsx` com 3 casos:
  > `elegivel` (CheckCircle2), `casamento-manual` (Layers + label "Casamento manual (N:M)"),
  > `bloqueada` (Ban). Usa React Testing Library, padrão dos `__tests__/auth/*.test.tsx` já
  > existentes. Tactic Bass: **Specialized Interfaces** — extrair o componente puro também melhora
  > testabilidade do resto da página.

- **Resultado Esperado**
  > Pilot de teste de componente para Permutas estabelecido; branch `casamento-manual` do
  > `StatusBadge` defendido. Testes de UI da feature Permutas: 0 → 3. Estabelece padrão para
  > outras páginas migrarem (`SISPAG`, `GED`).

- **Tactic alvo**: Specialized Interfaces + Executable Assertions
- **Severidade**: P3
- **Esforço estimado**: S (≤1d — ~1h: extrair componente + 3 testes)
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - testes de componente para Permutas: 0 → 3
  - cobertura visual do `casamento-manual` no FE: 0 caminhos → 3 caminhos (badge, KPI label, empty-state label)
- **Risco de não fazer**: baixo no curto prazo (typo é pego por `tsc`, o número correto vem do BE
  testado). No médio prazo, `page.tsx` continua sendo bloco-monolito intestável; cada feature
  futura herda o débito.
- **Dependências**: nenhuma. Recomendado para o follow-up inbox (`ontology/_inbox/permutas-casamento-manual-regis-followups.md`),
  não para o PR atual.

## 6. Notas do agente

- Escopo respeitado: só o delta `casamento-manual`. Não rodei coverage do repo nem auditei
  outras features.
- **Por que F-testability-1 é P2 e não P0/P1**: o colapso é design-contract documentado em
  ADR-0005 §4 (linhas 48-53), e a rota live (`/permutas/gestao`) está coberta pelos 3 novos testes
  + tipo `StatusElegibilidade` em `lib/types.ts:25`. O `/painel` legado já mostrava N:M como
  bloqueada **antes** deste tweak (a ternária pré-existia) — o tweak não regressou nada. O risco é
  futuro (refactor), não atual.
- **Por que F-testability-2 é P3**: gap é sistêmico (nenhuma `page.tsx` é testada no repo),
  resolver só para este branch seria sliver. Padrão `page.tsx` intestável é cross-QA com
  Modifiability (página monolítica de 437 linhas mistura data-fetching, filtro, render).
- Cross-QA: F-testability-1 toca **Integrability** (contrato `/painel` legacy ↔ schema) e
  **Modifiability** (Fatia 2 vai precisar evoluir o snapshot para aceitar `casamento-manual` —
  o teste de fechadura ajuda a virar o contrato com segurança).
