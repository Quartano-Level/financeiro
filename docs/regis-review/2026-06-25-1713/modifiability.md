---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-25-1713
agent: qa-modifiability
generated_at: 2026-06-25T17:13:00-03:00
scope: backend,frontend
score: 7.5
findings_count: 4
cards_count: 4
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/PM da Columbia | Mudança na política do lote (e.g. parar no 1º erro, paralelizar 2 adtos, paginar resultado, expor progresso, mudar contrato do `ReconciliarLoteResult`) | `ReconciliacaoLotePermutaService` (BE) + tipos compartilhados (`types.ts` FE) + `page.tsx` (botão/handler/dialog) | Em desenvolvimento, sem downtime | Alteração se localiza no orquestrador BE; contrato FE↔BE permanece consistente sem retrabalho duplicado | ≤ 3 arquivos tocados para mudança na política do lote; 0 deriva de tipos FE↔BE em bumps de contrato; tempo de mudança ≤ 1 dia |

> O delta é um orquestrador fino reusando `reconciliar` por adto — boa localização para mudanças na política do lote. O risco modificacional reside em (a) duplicação manual de tipos FE↔BE e (b) crescimento contínuo do `page.tsx` (god-component pré-existente).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC `ReconciliacaoLotePermutaService.ts` | 166 | ≤ 400 (p95) | ✅ | `wc -l src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts` |
| LOC `ReconciliacaoPermutaService.ts` (dep direta) | 532 | ≤ 400 (p95) | ⚠️ | `wc -l` (pré-existente) |
| LOC `GestaoPermutasService.ts` (dep direta) | 535 | ≤ 400 (p95) | ⚠️ | `wc -l` (pré-existente) |
| LOC `src/frontend/app/permutas/page.tsx` | 2669 | ≤ 600 (max) | ❌ | `wc -l src/frontend/app/permutas/page.tsx` (god-component, pré-existente) |
| Imports (fan-out) no lote service | 5 | ≤ 15 | ✅ | `grep -c '^import ' …LotePermutaService.ts` |
| Fan-in `ReconciliacaoLotePermutaService` (src/) | 2 (rota + teste) | n/a | ✅ | `grep -rln …` |
| Cognitive-complexity warnings (Biome) no delta | 0 | 0 | ✅ | `_shared-metrics.md` (lint limpo nos arquivos tocados) |
| Métodos públicos do lote service | 1 (`reconciliarLote`) | ≤ 5 | ✅ | Inspeção `…LotePermutaService.ts:65` |
| Entidades de domínio mutadas pelo service | 0 (orquestra; delega 100% para `reconciliar`) | ≤ 2 | ✅ | Inspeção — não chama Repository diretamente |
| Magic numbers em business rules do lote | 0 | 0 | ✅ | `grep -nE "const.*= [0-9]{2,}" …LotePermutaService.ts` |
| Duplicação de tipos FE↔BE (`ReconciliarLoteResult`/`Item`/`Status`) | 3 tipos duplicados manualmente | 0 (gerado ou compartilhado) | ❌ | Comparar `…LotePermutaService.ts:10-36` vs `src/frontend/lib/types.ts:274-295` |
| Cross-layer violations (`lambda→domain` ou `route→repository`) introduzidas no delta | 0 | 0 | ✅ | Inspeção (`routes/permutas.ts` resolve só Service) |
| Dependências do lote service | 2 services + LogService (todos `@injectable`) | ≤ 5 | ✅ | `…LotePermutaService.ts:58-63` |

> ⚠️ **Não medível localmente (quick)**: fan-in real de `GestaoPermutasService` e `ReconciliacaoPermutaService` em todo o repo (pré-existente, fora do delta). Recomendação: rodar `/retro-ontology` mensal e/ou `madge --circular src/backend`.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | Lote separado em service próprio em vez de inflar `ReconciliacaoPermutaService` (que já é grande, 532 LOC). Orquestrador fino. | ✅ presente | `…LotePermutaService.ts` (novo arquivo, 166 LOC) |
| Increase Semantic Coherence | Único método público `reconciliarLote`; única responsabilidade (orquestrar lote de automáticas reusando `reconciliar`); status agregação isolada em `statusDoAdto`. | ✅ presente | `…LotePermutaService.ts:65,155` |
| Encapsulate | Política de agregação (`statusDoAdto`), dedup por `docCod` e continue-on-error encapsulados no service; rota não sabe nada da regra. | ✅ presente | `…LotePermutaService.ts:73-82,155-165` |
| Use an Intermediary | Lote serve de intermediário entre rota e a baixa unitária; rota não chama `reconciliar` em loop. Frontend chama 1 endpoint (evita estourar `heavyRouteLimiter`). | ✅ presente | `_shared-metrics.md` (decisão arquitetural) |
| Restrict Dependencies | Service só depende de 2 outros services + LogService via `@inject`; não toca Repository nem Client diretamente. Respeita Lambda→Service→Repository→Client. | ✅ presente | `…LotePermutaService.ts:58-63` |
| Refactor | Tipos `LoteAdiantamentoStatus` e `ReconciliarLoteItem` extraídos como exports; `statusDoAdto` extraído como método privado em vez de inline ternário. | ✅ presente | `…LotePermutaService.ts:10-21,155` |
| Abstract Common Services | LogService reusado (`@singleton`); `ReconciliarResult` reusado (não foi redefinido). | ✅ presente | `…LotePermutaService.ts:1-7` |
| Defer Binding — DI/polymorphism | tsyringe `@injectable` com `@inject` dos services concretos (sem token/interface). Aceitável: 1 implementação por dependência hoje. | ⚠️ parcial | `…LotePermutaService.ts:56-63` |
| Defer Binding — Configuration | Lote NÃO tem nenhum knob configurável (sem `BATCH_MAX`, sem `BATCH_DELAY_MS`, sem `BATCH_PARALLELISM`, sem cut-off de erros). Política inteiramente hardcoded (sequential, all-or-none, no-cap). | ⚠️ parcial | `…LotePermutaService.ts` (busca por `EnvironmentProvider` — 0 hits) |
| Defer Binding — Plugin/Registry | N/A — política do lote é única; não há sentido em registry para uma única estratégia hoje. | N/A | — |
| Generalize Module | `statusDoAdto` poderia ser reusado pela `reconciliar` unitária (mesma derivação settled/parcial/error/dry-run/skipped). Hoje a regra existe duplicada de forma implícita. | ⚠️ parcial | `…LotePermutaService.ts:155-165` |

## 4. Findings (achados)

### F-modifiability-1: Tipos `ReconciliarLoteResult`/`Item`/`Status` duplicados manualmente FE↔BE

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services / Encapsulate
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:10-36` ↔ `src/frontend/lib/types.ts:274-295`
- **Evidência (objetiva)**:
  ```
  BE:  export type LoteAdiantamentoStatus = 'settled' | 'parcial' | 'error' | 'dry-run' | 'skipped';
  FE:  export type LoteAdiantamentoStatus = 'settled' | 'parcial' | 'error' | 'dry-run' | 'skipped'
  BE:  interface ReconciliarLoteResult { dryRun; writeEnabled; totalCasos; totalSettled; totalErros; borderos: number[]; resultados: ReconciliarLoteItem[] }
  FE:  interface ReconciliarLoteResult { dryRun; writeEnabled; totalCasos; totalSettled; totalErros; borderos: number[]; resultados: ReconciliarLoteItem[] }
  ```
- **Impacto técnico**: qualquer evolução do contrato (e.g. adicionar `totalSkipped`, `progressUrl`, renomear `priCod`) exige 2 edições sincronizadas. Falha silenciosa: TS compila em ambos os lados com tipos divergentes.
- **Impacto de negócio**: mais 1 caso na esteira de "FE quebrou em produção porque o BE mudou o contrato" — uma classe de bug recorrente em reviews anteriores (Permutas v0.6/v0.7). Em uma feature que escreve no ERP, divergência de status pode ocultar erros parciais no toast.
- **Métrica de baseline**: 3 tipos duplicados (1 union + 2 interfaces). Crescendo +3 por feature de escrita similar.

### F-modifiability-2: `page.tsx` cresce como god-component (2669 LOC) — pré-existente, agravado pelo delta

- **Severidade**: P1 (pré-existente; o delta agrava em estado+handler+dialog)
- **Tactic violada**: Split Module / Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx` (2669 LOC)
- **Evidência (objetiva)**:
  ```
  wc -l src/frontend/app/permutas/page.tsx → 2669
  delta adiciona: estado de loading do lote + handler `handleExecutarTodas` + diálogo de confirmação
  ```
- **Impacto técnico**: cada nova ação de painel (botão executar, alocação, ingestão, cliente-filtro, …) sedimenta no mesmo arquivo. Hot-reload lento, conflitos de merge em paralelo, testes E2E grossos.
- **Impacto de negócio**: tempo crescente para adicionar novas ações (próximas frentes do Painel: SISPAG, Popula GED tendem a inflar igual). Onboarding de devs degrada. **Não bloqueia esta feature**, mas custo de mudança cresce linearmente.
- **Métrica de baseline**: 2669 LOC (alvo p95 ≤ 600). Crescimento estimado +30~80 LOC por feature recente.

### F-modifiability-3: Política do lote 100% hardcoded — nenhum knob configurável

- **Severidade**: P2
- **Tactic violada**: Defer Binding (Configuration)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:91-127`
- **Evidência (objetiva)**:
  ```
  for (const docCod of ordem) { ... }   ← sequencial, sem cap, sem early-abort, sem delay
  // Sem BATCH_MAX, sem BATCH_DELAY_MS, sem BATCH_ABORT_AFTER_N_ERRORS, sem BATCH_PARALLELISM.
  ```
- **Impacto técnico**: mudança operacional típica (e.g. "abortar lote após 5 erros consecutivos para evitar dano colateral", "limitar a 50 adtos por chamada para caber no timeout do proxy Render", "aplicar delay entre adtos para o Conexos") exige PR + deploy. Política impossível de virar runtime knob.
- **Impacto de negócio**: incidente operacional vira correção via redeploy em vez de SSM/env flip. Cross-link com Deployability: cada ajuste de cadência = 1 deploy.
- **Métrica de baseline**: 0 parâmetros configuráveis no lote (alvo ≥ 2 — pelo menos `BATCH_MAX` e `BATCH_ABORT_AFTER_N_ERRORS`).

### F-modifiability-4: Derivação `statusDoAdto` espelha implicitamente a derivação da `reconciliar` unitária — risco de drift

- **Severidade**: P3
- **Tactic violada**: Generalize Module / Abstract Common Services
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:155-165`
- **Evidência (objetiva)**:
  ```
  if (r.dryRun) return 'dry-run';
  if (erros > 0) return settled > 0 ? 'parcial' : 'error';
  if (settled > 0) return 'settled';
  return 'skipped';
  ```
- **Impacto técnico**: se `ReconciliacaoPermutaService.reconciliar` ganhar um novo `status` (e.g. `'partial-skipped'`, `'rate-limited'`), o lote silenciosamente vai cair no `else → 'skipped'` em vez de surfaceá-lo. A regra de derivação não está colocalizada com a fonte (`ResultadoAlocacao.status`).
- **Impacto de negócio**: status novo do unitário não aparece no toast/relatório do lote — analista interpreta erro como sucesso.
- **Métrica de baseline**: 1 ponto de derivação duplicada (1 no unitário implícito, 1 no lote explícito).

## 5. Cards Kanban

### [modifiability-1] Compartilhar contrato `ReconciliarLote*` entre BE e FE (não duplicar à mão)

- **Problema**
  > Os tipos `ReconciliarLoteResult`/`ReconciliarLoteItem`/`LoteAdiantamentoStatus` estão definidos manualmente nos dois lados (BE `…LotePermutaService.ts:10-36` e FE `types.ts:274-295`). Já é a 4ª iteração de Permutas em que reviews anteriores apontam drift FE↔BE no contrato. Em feature de escrita financeira em lote, divergência de status pode mascarar erros parciais.

- **Melhoria Proposta**
  > Adotar uma das opções (decisão do Yuri): (a) extrair `src/contracts/permutas.ts` consumido pelos dois package.json via path alias; (b) gerar tipos FE a partir de schemas Zod do BE (`z.infer`); (c) snapshot test que garante shape-equality entre os tipos. Aplica tactic **Abstract Common Services**. Tocar `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts`, `src/frontend/lib/types.ts`, e (se opção a/b) configurar paths/tsconfig.

- **Resultado Esperado**
  > 1 única definição do contrato do lote (e dos contratos análogos existentes). Mudanças de contrato passam a quebrar typecheck em ambos lados.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - Tipos duplicados FE↔BE em rotas Permutas: 3 (lote) + N (existentes) → 0
  - Bugs por drift de contrato Permutas nos últimos 90d (registro no inbox): N → 0
- **Risco de não fazer**: cada nova rota de Permutas/SISPAG/GED adiciona +3~5 tipos duplicados. Drift silencioso continua aparecendo em prod.
- **Dependências**: decisão do Yuri sobre estratégia (path alias × Zod-derived × snapshot).

### [modifiability-2] Quebrar `page.tsx` (2669 LOC) em sub-componentes por aba do painel

- **Problema**
  > `src/frontend/app/permutas/page.tsx` tem 2669 LOC. A cada feature (cliente-filtro, alocação, ingestão, executar-lote) o arquivo ganha mais estado/handler/dialog. Sintoma de god-component. **Pré-existente**, mas o delta deste run agrava (botão "Executar" + estado + dialog).

- **Melhoria Proposta**
  > Extrair em sub-componentes por responsabilidade: `PermutasAbaAutomaticas`, `PermutasAbaCasamentoManual`, `PermutasAbaPermutaManual`, `PermutasAbaBloqueadas`, `PermutasBarraDeAcoes` (onde mora "Executar todas"). Aplica tactic **Split Module** + **Increase Semantic Coherence**. Mover estado local de cada aba para o sub-componente.

- **Resultado Esperado**
  > `page.tsx` ≤ 400 LOC (orquestra layout/tabs e providers); cada sub-componente ≤ 500 LOC.

- **Tactic alvo**: Split Module
- **Severidade**: P1
- **Esforço estimado**: L (1–2sem) — exige refator com testes E2E
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - LOC `page.tsx`: 2669 → ≤ 400
  - Conflitos de merge em `page.tsx` por mês: alto → ≤ 1
- **Risco de não fazer**: feature SISPAG/GED reusará o mesmo padrão → god-component multiplica. Modificar UI vira tarefa de 1d para 3d em 6 meses.
- **Dependências**: Cobertura de testes da página antes do refator (cross-link Testability).

### [modifiability-3] Expor knobs de política do lote (cap, abort-on-N-errors, opcional delay)

- **Problema**
  > A política do lote (sequencial, sem cap, sem early-abort) é hardcoded em `…LotePermutaService.ts:91-127`. Mudança operacional típica ("abortar após 5 erros consecutivos", "limitar a 50 por chamada para caber no timeout do proxy Render") exige PR + deploy.

- **Melhoria Proposta**
  > Adicionar campos no `ReconciliarLoteInput` (ou no `EnvironmentProvider`) para `batchMax`, `abortAfterConsecutiveErrors`, `delayBetweenAdtosMs`. Aplica tactic **Defer Binding (Configuration)**. Defaults conservadores; admin pode sobrescrever via body do POST (preferível a env, porque é decisão operacional do analista).

- **Resultado Esperado**
  > Ajustes de cadência/segurança do lote possíveis sem redeploy. Operador pode rodar `executar` com `abortAfterConsecutiveErrors=3` em emergência.

- **Tactic alvo**: Defer Binding (Configuration)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Knobs configuráveis do lote: 0 → 3
  - Deploys necessários para ajuste de política do lote: 1 → 0
- **Risco de não fazer**: incidente operacional (ERP lento, falha em cascata) vira correção por deploy. Cross-link Deployability/Fault Tolerance.
- **Dependências**: Card de Fault Tolerance sobre circuit-breaker (se existir) precede este.

### [modifiability-4] Colocalizar derivação `statusDoAdto` com o `ResultadoAlocacao.status` (fonte da verdade)

- **Problema**
  > A função `statusDoAdto` em `…LotePermutaService.ts:155-165` deriva o status agregado a partir do `ReconciliarResult`. Se o unitário ganhar um novo status, o lote silenciosamente caí no `'skipped'` em vez de propagar o novo valor.

- **Melhoria Proposta**
  > Mover `statusDoAdto` para `ReconciliacaoPermutaService` (ou um helper colocalizado com `ReconciliarResult`), exigir exhaustiveness check com `never` no `switch`. Aplica tactic **Generalize Module** / **Abstract Common Services**. Test: novo status no unitário deve quebrar TS no lote.

- **Resultado Esperado**
  > Adicionar status novo a `ResultadoAlocacao` força atualização explícita no lote (typecheck quebra). Zero drift silencioso.

- **Tactic alvo**: Generalize Module
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Pontos de derivação de status duplicados: 2 → 1
  - Exhaustiveness check (`never`) presente no switch: não → sim
- **Risco de não fazer**: bug latente quando o unitário evoluir; analista vê "skipped" em vez do status real.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo `--quick`: medi o delta. Não recalibrei p95/p99 do repo inteiro; valores ≥ 400 LOC pré-existentes (`ReconciliacaoPermutaService`/`GestaoPermutasService`) são herança, não regressão deste delta.
- Cross-QA: **F-modifiability-1** (drift FE↔BE) toca **Integrability** (contrato) e **Testability** (snapshot). **F-modifiability-2** (god-component) toca **Testability** (cobertura E2E grossa). **F-modifiability-3** (knobs hardcoded) toca **Deployability** (cada ajuste = redeploy) e **Fault Tolerance** (sem abort-on-errors).
- O service do lote em si é exemplar: 166 LOC, 1 método público, fan-out 5, fan-in 2, 0 magic numbers, 0 cross-layer violations. Pontos altos: encapsulamento da agregação, reuso integral do unitário e do gate de escrita. Score 7.5 ponderado pela duplicação de contrato e pelo god-component da página.
