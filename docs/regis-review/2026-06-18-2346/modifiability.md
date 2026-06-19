---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-18-2346
agent: qa-modifiability
generated_at: 2026-06-19T00:00:00Z
scope: backend+frontend
score: 7
findings_count: 4
cards_count: 4
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Negócio (Columbia) / produto | Nova taxonomia de motivo de bloqueio (ex.: `JA_PERMUTADO` distinguir-se de `SEM_SALDO_PERMUTAR`) precisa aparecer no painel com rótulo e cor próprios | `EstadoElegibilidade.ts` (enum), `ElegibilidadeService.motivoDoGateFalho`, `frontend/app/permutas/page.tsx` (`MOTIVO_LABEL`, `StatusBadge`), `frontend/lib/types.ts` | Desenvolvimento (Fatia 1, READ-ONLY) | A mudança deve ser localizada: 1 entrada no const enum + 1 branch na regra + 1 label + (idealmente) 1 entrada na union do tipo `MotivoBloqueio` do frontend | ≤ 4 arquivos tocados, 0 strings cruas duplicadas entre backend/frontend, typecheck pega motivo desconhecido no `MOTIVO_LABEL` |

Aplicado a esta mudança ("já permutado"): a feature evolui um único enum + uma branch determinística (`valorPermutado > 0 ? JA_PERMUTADO : SEM_SALDO_PERMUTAR`) + 1 label + 1 caso especial no `StatusBadge`. **Mas** a propagação backend → frontend é por *string crua*, não por tipo compartilhado — então o "≤ 4 arquivos com type-safety end-to-end" não está plenamente garantido.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Arquivos tocados pela feature "já permutado" (no escopo desta review) | 4 (EstadoElegibilidade, Adiantamento, ElegibilidadeService, page.tsx) + types.ts/fixture | ≤ 6 | ✅ | `_shared-metrics.md` diff stat |
| LOC `EstadoElegibilidade.ts` (enum + tipos) | 61 | ≤ 150 (módulo único, alta coesão) | ✅ | shared metrics |
| LOC `ElegibilidadeService.ts` | 208 | ≤ 400 (p95 alvo) | ✅ | shared metrics |
| LOC `page.tsx` (frontend permutas) | 680 | ≤ 400 (p95 alvo) | ⚠️ | shared metrics — pré-existente, não introduzido por esta mudança |
| Cognitive-complexity warnings introduzidos por esta mudança | 0 (7 pré-existentes inalterados) | 0 | ✅ | `_shared-metrics.md` (lint baseline) |
| Magic numbers em `motivoDoGateFalho` / `EstadoElegibilidade` | 0 (apenas comparações com `0` para "ausência de valor", semanticamente justificado e documentado no JSDoc) | 0 | ✅ | `ElegibilidadeService.ts:152` |
| Fan-in de `MOTIVO_BLOQUEIO` (const enum) no backend | 34 referências em service/interface (não-test) | ≥ 1 — é a regra. Todas via símbolo, não string. | ✅ | `grep -rn "motivoBloqueio\|MOTIVO_BLOQUEIO"` no backend |
| **Duplicação backend ↔ frontend do enum `MOTIVO_BLOQUEIO`** | 10/10 chaves duplicadas como string literal em `frontend/app/permutas/page.tsx:38-49` (+ literal `'ja-permutado'` em `page.tsx:73,77` + 3 strings cruas em `permutas-fixture.ts`) | 0 strings cruas; rótulos derivados de uma SSOT ou de uma union compartilhada | ❌ | `grep` em frontend (ver §4 F-modifiability-1) |
| Tipagem de `motivoBloqueio` no `PermutaPendente` (frontend) | `motivoBloqueio?: string` (free string) | `motivoBloqueio?: MotivoBloqueio` (union literal) | ❌ | `src/frontend/lib/types.ts:40` |
| Branches em `motivoDoGateFalho` | 4 retornos (NAO_PAGO → JA_PERMUTADO/SEM_SALDO_PERMUTAR → DI_DUIMP_AMBOS → FALHA_GATE), prioridade documentada | ≤ 6, prioridade explícita | ✅ | `ElegibilidadeService.ts:144-158` |
| Coesão de `ElegibilidadeService` (entidades referenciadas no public surface) | 1 (PermutaCandidata; gate inputs derivados) | ≤ 2 | ✅ | leitura do service |
| Cobertura de teste das 2 novas branches (`JA_PERMUTADO`, prioridade NAO_PAGO > JA_PERMUTADO) | 2 testes dedicados (`ja-permutado` doc 8266 + `nao-pago tem prioridade sobre ja-permutado`) | ≥ 2 | ✅ | `ElegibilidadeService.test.ts:104,119` |

> ⚠️ **Não medível em `--quick`**: fan-in real do enum no frontend a partir de uma SSOT (a SSOT não existe). Recomendação: criar um pacote/módulo `@shared/permutas` (ou um arquivo `src/frontend/lib/permutas-motivo.ts` gerado a partir do backend ou copiado por contrato) e medir importação por símbolo.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | `EstadoElegibilidade.ts` (61 LOC) isola enum + types; `ElegibilidadeService` mantém `motivoDoGateFalho` como helper privado pequeno (14 LOC). Não foi necessário splittar. | ✅ presente | `EstadoElegibilidade.ts`, `ElegibilidadeService.ts:144-158` |
| **Increase Semantic Coherence** | `MOTIVO_BLOQUEIO` agrupa toda a taxonomia de reprovação num único módulo com JSDoc apontando para a state-machine; cada motivo descreve o gate de origem. Backend bem coeso. **Frontend duplica a taxonomia sem importar de uma fonte única.** | ⚠️ parcial | `EstadoElegibilidade.ts:27-61` (bom) vs. `page.tsx:38-49` (cópia) |
| **Encapsulate** | `motivoDoGateFalho` encapsula a regra de prioridade (gate 3 → gate 2 → gate 4 → fallback) num método privado, com JSDoc explicando a causa-raiz. O caller (`avaliarElegibilidade`) não vê o branching. | ✅ presente | `ElegibilidadeService.ts:144-158` |
| **Use an Intermediary** | A distinção `JA_PERMUTADO` vs `SEM_SALDO_PERMUTAR` flui via campo opcional `Adiantamento.valorPermutado` — Adiantamento serve de DTO intermediário entre Conexos e a regra. | ✅ presente | `Adiantamento.ts:31-36` |
| **Restrict Dependencies** | `ElegibilidadeService` depende só de `CasamentoInvoiceService` + interfaces. Nenhum import cross-layer; `motivoDoGateFalho` é puro (sem I/O). | ✅ presente | `ElegibilidadeService.ts:1-13` |
| **Refactor** | Mudança aproveitou refactor anterior: assinatura de `motivoDoGateFalho` passou a aceitar `adiantamento` para abrir o branch — refactor mínimo, escopo cirúrgico. | ✅ presente | `ElegibilidadeService.ts:144-147` |
| **Abstract Common Services** | Nenhuma abstração compartilhada entre backend (enum tipado) e frontend (Record + literal). É exatamente a tactic ausente. | ❌ ausente | F-modifiability-1 |
| **Defer Binding — configuration files / polymorphism / runtime registration** | Motivos são **decisões de design** (state-machine canônica), não config de runtime. Defer-binding via const tipado + DI já presente no service (tsyringe). Magic numbers ausentes. Não há regra de negócio configurável escondida nesta feature. | ✅ presente (no nível certo) | `ESTADO_ELEGIBILIDADE`/`MOTIVO_BLOQUEIO` como `as const`; `@injectable()` no service |

## 4. Findings (achados)

### F-modifiability-1: Enum `MOTIVO_BLOQUEIO` duplicado como strings cruas no frontend

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services + Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx:38-49` (MOTIVO_LABEL), `:73,77` (literal `'ja-permutado'`); `src/frontend/lib/types.ts:40` (`motivoBloqueio?: string`); `src/frontend/lib/permutas-fixture.ts:79,90,103`.
- **Evidência (objetiva)**:
  ```ts
  // backend (SSOT):
  // src/backend/domain/interface/permutas/EstadoElegibilidade.ts:27-59
  export const MOTIVO_BLOQUEIO = { COMPOSTO_NM: 'composto-nm', ..., JA_PERMUTADO: 'ja-permutado', ... } as const;
  export type MotivoBloqueio = (typeof MOTIVO_BLOQUEIO)[keyof typeof MOTIVO_BLOQUEIO];

  // frontend (cópia não tipada):
  // src/frontend/app/permutas/page.tsx:38
  const MOTIVO_LABEL: Record<string, string> = { 'nao-pago': '...', 'ja-permutado': 'Já permutado', ... }
  // page.tsx:73
  if (motivo === 'ja-permutado') { ... }
  // lib/types.ts:40
  motivoBloqueio?: string   // free string — sem union
  ```
- **Impacto técnico**: adicionar/remover/renomear um motivo no backend não causa erro de compilação no frontend. A próxima feature que introduzir um motivo (ex.: backlog do `COMPOSTO_NM` virar uma state real) precisa de **edição manual em ≥ 3 lugares** sem rede de segurança. O fallback `?? motivo` em `StatusBadge` mascara o problema mostrando o slug cru ao operador.
- **Impacto de negócio**: rótulo errado/ausente no painel da Frente I (operadores Columbia) → operador interpreta "Já permutado" (estado concluído, badge info) como "Bloqueada" (badge vermelha) → ruído operacional, retrabalho, perda de confiança no painel. Custo de cada futura mudança de taxonomia ≈ 1,5× (3 arquivos editados manualmente em vez de 1 + propagação tipo).
- **Métrica de baseline**: 10/10 chaves do enum duplicadas; 1 literal `'ja-permutado'` adicional em código de render; tipo `motivoBloqueio: string` (cardinalidade ∞ vs. cardinalidade 10 do backend).

### F-modifiability-2: `StatusBadge` mistura mapeamento (status → variante) com regra de exceção (`motivo === 'ja-permutado'`)

- **Severidade**: P2
- **Tactic violada**: Increase Semantic Coherence (uma função, uma responsabilidade)
- **Localização**: `src/frontend/app/permutas/page.tsx:51-91`
- **Evidência (objetiva)**:
  ```tsx
  function StatusBadge({ status, motivo }: ...) {
    if (status === 'elegivel') return <Badge .../>          // mapping por status
    if (status === 'casamento-manual') return <Badge .../>  // mapping por status
    if (motivo === 'ja-permutado') return <Badge .../>      // exceção por motivo (cor INFO, não DANGER)
    return <Badge .../>                                      // fallback bloqueada (DANGER)
  }
  ```
- **Impacto técnico**: cada novo motivo "estado-concluído-não-erro" (ex.: amanhã `COMPOSTO_NM_RESOLVIDO`, ou `PERMUTA_EXPIRADA` benigno) vai pedir mais um `if (motivo === '…')` empilhado. Crescimento O(n) em ifs aninhados, sem tabela. Em ~5 motivos benignos, vira a próxima warning de `noExcessiveCognitiveComplexity`.
- **Impacto de negócio**: dificulta evoluir a "linguagem visual" do painel — cada cor/ícone novo precisa de revisão de código no único hot-spot.
- **Métrica de baseline**: 3 ramos heterogêneos em `StatusBadge` (2 por status + 1 por motivo); complexidade cognitiva atual estimada ~6 (folga ainda); cresce para 9+ com 3 motivos benignos novos.

### F-modifiability-3: `page.tsx` em 680 LOC concentra render, paginação, filtros e tabelas N:M

- **Severidade**: P2
- **Tactic violada**: Split Module + Reduce Size of Module
- **Localização**: `src/frontend/app/permutas/page.tsx` (todo o arquivo, 680 LOC)
- **Evidência (objetiva)**: arquivo único contém: `MOTIVO_LABEL`, `StatusBadge`, `PROCESSAMENTO_LABEL`, `ProcessamentoBadge`, `Moeda`, `FILTRO_VAZIO_LABEL`, `STATUS_OPCOES`, `GestaoPermutasPage` (com 3 useStates + paginação + 3 tabelas em JSX) e `LoadingSkeleton`. Pré-existente — esta mudança apenas **mantém o arquivo crescendo** (adicionou 12 linhas no `MOTIVO_LABEL` + nova branch no `StatusBadge`).
- **Impacto técnico**: cada mudança no painel (filtros, nova coluna, novo motivo, novo card N:M) precisa ler o arquivo inteiro para entender o blast radius. P95 alvo de 400 LOC ultrapassado em 70%.
- **Impacto de negócio**: PRs no painel demoram review mais longa; risco de regressão silenciosa quando dois engenheiros tocam o mesmo arquivo (alta probabilidade neste arquivo dado o roadmap das Fatias 2/3).
- **Métrica de baseline**: 680 LOC vs. alvo p95 de 400 (+70%); 8 símbolos top-level no arquivo.

### F-modifiability-4: `MOTIVO_LABEL` tipado como `Record<string, string>` perde exhaustividade

- **Severidade**: P2
- **Tactic violada**: Defer Binding (polymorphism via union) — empurrar a validação para compile-time
- **Localização**: `src/frontend/app/permutas/page.tsx:38`
- **Evidência (objetiva)**:
  ```ts
  const MOTIVO_LABEL: Record<string, string> = { /* 10 chaves */ }
  // → TypeScript não exige que TODAS as chaves de MotivoBloqueio estejam presentes;
  // → TypeScript não rejeita uma chave nova/typo.
  ```
- **Impacto técnico**: se um novo motivo for adicionado no backend e propagado por `types.ts`, `MOTIVO_LABEL[motivo]` retorna `undefined`, e o componente cai no fallback (`?? motivo`) mostrando o slug cru ao operador. Sem erro de compilação.
- **Impacto de negócio**: a próxima feature de taxonomia provavelmente vai parar em QA manual (operador reportando "tá aparecendo `composto-nm` em vez do rótulo"), em vez de no `tsc`.
- **Métrica de baseline**: tipo do índice = `string` (∞); tipo correto = `MotivoBloqueio` (10) com `Record<MotivoBloqueio, string>` exigindo exhaustividade.

## 5. Cards Kanban

### [modifiability-1] Compartilhar o enum `MotivoBloqueio` entre backend e frontend (SSOT)

- **Problema**
  > Backend define `MOTIVO_BLOQUEIO` como const-enum tipado (10 entradas), mas o frontend duplica os 10 slugs em `MOTIVO_LABEL` e usa `motivoBloqueio?: string` no DTO `PermutaPendente`. Qualquer mudança na taxonomia exige edição manual em ≥ 3 lugares sem rede de segurança do TypeScript — exatamente a feature "já permutado" desta review já pagou esse custo (label adicionado à mão).

- **Melhoria Proposta**
  > Aplicar **Abstract Common Services**: criar um módulo compartilhado de tipos para o domínio Permutas no frontend (ex.: `src/frontend/lib/permutas-domain.ts`) que **espelhe** `MOTIVO_BLOQUEIO` com a mesma forma `as const` + `type MotivoBloqueio`, e tipar `PermutaPendente.motivoBloqueio?: MotivoBloqueio` em `lib/types.ts`. Ideal: extrair backend `EstadoElegibilidade.ts` para um pacote `@shared/permutas` consumido por ambos (long-term). Substituir o literal `'ja-permutado'` em `page.tsx:73,77` por `MOTIVO_BLOQUEIO.JA_PERMUTADO`.

- **Resultado Esperado**
  > 0 strings cruas de motivo em código de render; `tsc` rejeita qualquer slug fora da union de 10; adicionar um motivo novo no backend produz erro de compilação no frontend até que o `MOTIVO_LABEL` ganhe a entrada.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-1, F-modifiability-4
- **Métricas de sucesso**:
  - Slugs duplicados frontend ↔ backend: 10 → 0 (via SSOT)
  - Tipo de `motivoBloqueio` no DTO: `string` → `MotivoBloqueio` (cardinalidade ∞ → 10)
  - Compile-time error ao adicionar motivo sem label: ausente → presente (`Record<MotivoBloqueio, string>` exige exhaustividade)
- **Risco de não fazer**: nas Fatias 2/3 (write-back + N:M resolvido), a taxonomia vai crescer; cada mudança gera 1 incidente potencial de "slug cru na tela" em produção até alguém notar visualmente.
- **Dependências**: nenhuma.

### [modifiability-2] Refatorar `StatusBadge` para tabela `motivo → variante visual`

- **Problema**
  > `StatusBadge` mistura mapping por status (`elegivel`, `casamento-manual`) com regra de exceção por motivo (`if (motivo === 'ja-permutado')`). Cada novo "motivo benigno" empilha mais um `if`, em vez de uma entrada de tabela.

- **Melhoria Proposta**
  > Aplicar **Increase Semantic Coherence**: extrair `const MOTIVO_VARIANT: Record<MotivoBloqueio, {variant, icon, label}>` (junto com `MOTIVO_LABEL` do card #1) e fazer `StatusBadge` ser data-driven. A regra "JA_PERMUTADO = info + check" vira uma linha de tabela, não uma branch.

- **Resultado Esperado**
  > `StatusBadge` reduzido a um único lookup + fallback; complexidade cognitiva permanece ≤ 5 mesmo com 5 motivos benignos futuros.

- **Tactic alvo**: Increase Semantic Coherence (com Defer Binding via polymorphism leve)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - Ramos `if` em `StatusBadge`: 3 → 1 (status mapping) + 1 (fallback) (-33%)
  - Custo de adicionar novo motivo benigno: edição de função → 1 linha em tabela
- **Risco de não fazer**: vira warning de `noExcessiveCognitiveComplexity` em 2–3 motivos novos; manutenção do painel desacelera.
- **Dependências**: card `modifiability-1` (precisa da union `MotivoBloqueio` para tipar a tabela).

### [modifiability-3] Quebrar `app/permutas/page.tsx` em sub-componentes coesos

- **Problema**
  > Página única com 680 LOC concentrando: rótulos, badges (Status + Processamento), tabelas (pendentes, casamento manual, casamento sugerido), filtros, paginação e skeleton. Excede em 70% o alvo p95 de 400 LOC. Cada mudança do painel exige ler o arquivo inteiro.

- **Melhoria Proposta**
  > Aplicar **Split Module**: extrair `PendentesTable`, `CasamentoManualTable`, `CasamentoSugeridoTable`, `PermutasFiltros` (filial+status+exportador+paginação) para `src/frontend/app/permutas/_components/`. `MOTIVO_LABEL`/`StatusBadge`/`Moeda` para um módulo de apresentação local. `page.tsx` fica como composer (≤ 200 LOC).

- **Resultado Esperado**
  > `page.tsx` ≤ 200 LOC; cada sub-componente ≤ 200 LOC; PRs futuros tocam 1–2 arquivos focados em vez do mega-arquivo.

- **Tactic alvo**: Split Module + Reduce Size of Module
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - LOC `page.tsx`: 680 → ≤ 200
  - p95 LOC do diretório `app/permutas/`: 680 → ≤ 300
  - Símbolos top-level em `page.tsx`: 8 → ≤ 3 (composer + skeleton + page export)
- **Risco de não fazer**: Fatias 2/3 vão empurrar para ~900–1100 LOC; conflitos de merge ficam frequentes entre PRs paralelos no painel.
- **Dependências**: idealmente depois do card `modifiability-1` para não migrar literais durante o split.

### [modifiability-4] Tipar `MOTIVO_LABEL` como `Record<MotivoBloqueio, string>` (exhaustividade)

- **Problema**
  > `MOTIVO_LABEL: Record<string, string>` perde a verificação de exhaustividade. Um motivo novo no backend produz `undefined` em produção, não erro de compilação. O fallback `?? motivo` mascara o problema, mostrando o slug cru ao operador.

- **Melhoria Proposta**
  > Aplicar **Defer Binding via polymorphism (compile-time)**: trocar tipo para `Record<MotivoBloqueio, string>` (depende do card `modifiability-1` ter exposto a union no frontend). O `tsc` passa a exigir que cada novo motivo tenha rótulo antes do build verde.

- **Resultado Esperado**
  > Esquecer de adicionar o label para um motivo novo deixa de ser bug de runtime e vira erro de typecheck.

- **Tactic alvo**: Defer Binding (compile-time polymorphism)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) — trivial após o card 1
- **Findings relacionados**: F-modifiability-4, F-modifiability-1
- **Métricas de sucesso**:
  - Tipo do índice de `MOTIVO_LABEL`: `string` → `MotivoBloqueio`
  - Detecção de label faltando: runtime (operador relata) → compile-time (CI bloqueia)
- **Risco de não fazer**: a próxima taxonomia silenciosamente cai no fallback `?? motivo`; UX degrada sem alerta.
- **Dependências**: card `modifiability-1`.

## 6. Notas do agente

- Escopo cirúrgico: somente a feature "já permutado". Não auditei `EleicaoPermutasService` (656 LOC) nem `ConexosClient` (1414 LOC) — fora do delta desta mudança, mas ambos seriam P1/P2 num review full.
- Cross-QA: F-modifiability-1/4 (slugs duplicados sem tipo) é também finding de **Integrability** (contrato backend↔frontend) e **Testability** (sem union, snapshot tests do painel não capturam motivo novo). F-modifiability-3 (page.tsx grande) é tambem **Testability** (mais difícil de cobrir por componente). Nenhum magic-number em business rules → **Deployability** não impactada por este delta.
- Decisão de severidade: F-1 marcado P1 (não P0) porque há baseline numérico (10 chaves duplicadas, fallback silencioso), mas o risco é "ruído operacional/UX", não "incidente de produção/corrupção de dados" — Bass exigiria P0 só se a divergência pudesse causar um processamento errado, o que NÃO é o caso aqui (o backend é a fonte da decisão; o frontend só rotula).
- Backend desta feature é exemplar: `motivoDoGateFalho` é compacto, documentado, com 2 testes para a nova branch e 1 para a prioridade (gate 3 > gate 2). Score 7/10 puxado para baixo pelo lado frontend.
