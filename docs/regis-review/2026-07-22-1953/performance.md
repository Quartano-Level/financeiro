---
qa: Performance
qa_slug: performance
run_id: 2026-07-22-1953
agent: qa-performance
generated_at: 2026-07-22T19:56:10Z
scope: frontend
score: 9
findings_count: 3
cards_count: 2
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista financeiro navegando o painel de Permutas | Expande uma linha da `VisaoGeralTable`/`AbaAutomaticas` (ou abre `AlocarDialog`) com invoice cujo `importador`/`exportador` tem 60+ chars | Componente `Campo` renderizado com `clamp` + `title` (delta desta feature); DOM da grid `dl` no painel expandido | Produção, cliente com dezenas de invoices por página (paginação server-side já existente), Next 16 + React 19 no browser | Layout se estabiliza em 2 linhas por célula, tooltip nativo do browser mostra texto integral no hover, sem re-render extra da árvore acima | Tempo de expansão do detalhe permanece imperceptível (< 16ms de reflow, dentro do frame de 60fps); First Load JS da rota `/permutas` inalterado (delta 0 KB gzip); nenhum re-render adicional causado pelo `title` |

Cenário complementar (linha de base do QA neste scope): a página `/permutas` orquestra `VisaoGeralTable` (500 LOC), `AbaAutomaticas` (`React.memo`, 249 LOC), `PermutaPendenteTable`, `AbaHistorico` e diálogos, todos client components. O ponto de pressão de perf frontend do painel é o volume de linhas + expansão de detalhe, não este delta.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC do arquivo tocado (`ui.tsx`) | 249 | ≤ 400 (componentes de apresentação) | ✅ | `wc -l src/frontend/app/permutas/components/ui.tsx` |
| Delta em bytes (código-fonte) do PR | +99 / −10 linhas em 6 arquivos, ~0.4 KB líquido | Delta ≤ 5 KB para tweak presentacional | ✅ | `git diff main --stat` |
| Novos imports adicionados no bundle | 0 (só usa `cn` já importado + prop nativa `title`) | 0 para tweak CSS | ✅ | `git diff main -- src/frontend/app/permutas/components/ui.tsx` |
| Novos hooks / effects / fetches | 0 | 0 para tweak CSS | ✅ | `git diff main` (ver `Campo` sem `useEffect`/`useMemo`) |
| `React.memo` preservado em `AbaAutomaticas` | ✅ mantido (linha 26) | Manter | ✅ | `grep -n React.memo AbaAutomaticas.tsx` |
| FE build / bundle size analyzer | ⚠️ Não medível neste run (`--quick`; `.next/` ausente e `npm run build` fora do budget quick) | Baseline em run full | ⚠️ | `ls src/frontend/.next` (ausente) |
| FE tests | ✅ 88/88 (17 suites), incluindo 2 novos de regressão `permutas-components` | 100% | ✅ | `_shared-metrics.md` |
| FE typecheck / lint | ✅ 0 erros / 0 errors (8 warnings pré-existentes fora do escopo) | 0 | ✅ | `_shared-metrics.md` |
| Backend / Lambda cold start / RDS pool | ⚠️ Fora de escopo (`scope=frontend`; delta não toca backend) | — | ⚠️ | escopo declarado |

> ⚠️ **Não medível localmente**: variação de First Load JS por rota (`/permutas`). Requer `next build` completo + comparação de manifest com `main` (fora do budget `--quick`). Recomendação: quando fizerem run full, capturar `Route (app) /permutas → First Load JS` do output do `next build` no PR e no `main` e anexar a diferença ao PR (esperado: 0 KB — só props opcionais e classes Tailwind já existentes em outras rotas).

## 3. Tactics — Cobertura no nf-projects

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — UI de painel, sem stream de eventos amostráveis | N/A | — |
| Limit Event Response | Paginação server-side já existente nas tabelas de permutas (fora do delta); expansão de linha é on-demand | ✅ presente | `VisaoGeralTable.tsx` (padrão de expansão por linha; delta preserva) |
| Prioritize Events | N/A — não há filas de eventos no frontend | N/A | — |
| Reduce Overhead | Delta reduz overhead visual (`line-clamp-2` corta reflow por linhas longas) sem adicionar JS. `title` nativo evita bibliotecas de tooltip (Radix Tooltip existe mas não foi importado) | ✅ presente | `ui.tsx:210-212` |
| Bound Execution Times | N/A no delta (tweak CSS); painel geral herda timeouts do fetch layer, fora do escopo | N/A | — |
| Increase Resource Efficiency | `Campo` continua um SFC leve; `clamp`/`title` são opt-in (default inalterado, `break-words` como antes) — sem regressão para consumidores não migrados | ✅ presente | `ui.tsx:193-217` |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | N/A — client-side rendering, sem provisionamento aqui | N/A | — |
| Increase Concurrency | N/A no delta | N/A | — |
| Maintain Multiple Copies of Computations | `React.memo` em `AbaAutomaticas` preservado; `Campo` é puro (sem estado) — memoização de subárvore continua válida | ✅ presente | `AbaAutomaticas.tsx:26` |
| Maintain Multiple Copies of Data | N/A — sem cache client-side novo | N/A | — |
| Bound Queue Sizes | N/A — sem filas no frontend | N/A | — |
| Schedule Resources | N/A no delta | N/A | — |

### Facetas modernas

| Faceta | Implementação atual | Status | Evidência |
|---|---|---|---|
| Cold start budget (Lambda) | Fora de escopo (`scope=frontend`) | ⚠️ N/A neste run | — |
| Cache strategy | N/A no delta (nenhum cache tocado) | N/A | — |
| Index discipline (SQL) | Fora de escopo | ⚠️ N/A neste run | — |
| Bundle leanness (FE) | Delta não adiciona dep nem import; painel `/permutas` já usa `lucide-react` (fonte de 21 arquivos) e `date-fns` (compartilhados). Nenhuma regressão introduzida | ✅ presente (para este delta) | `git diff main -- src/frontend/app/permutas/components/ui.tsx` (sem novos `import`) |

## 4. Findings (achados)

### F-performance-1: Delta é puramente presentacional — impacto de perf runtime ~nulo

- **Severidade**: P3 (nota informativa — nenhum problema; documenta a linha de base)
- **Tactic violada**: nenhuma (Reduce Overhead reforçada)
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:193-217`; consumidores em `AbaAutomaticas.tsx:184-189`, `VisaoGeralTable.tsx:136-149,264-266`, `AlocarDialog.tsx:110-112`
- **Evidência (objetiva)**:
  ```
  git diff main --stat  → 5 arquivos de código, +99/-10 linhas (~0.4 KB líquido)
  ui.tsx: apenas duas props opcionais (`clamp?`, `title?`) + classes Tailwind `line-clamp-2`
  Nenhum novo hook, useEffect, useMemo, useCallback, fetch, subscription, event listener
  Nenhum novo `import` (usa `cn` já importado)
  `title` é atributo HTML nativo (tooltip do browser, zero JS)
  ```
- **Impacto técnico**: ~0. `line-clamp-2` é composto por `-webkit-line-clamp` + `-webkit-box-orient` + `overflow: hidden` — três propriedades CSS que o browser já implementa em fast path, sem reflow adicional além do trabalho de layout que a célula faria de qualquer forma. `title` HTML nativo tem custo ~0 no render tree.
- **Impacto de negócio**: positivo — analistas passam a ver a lista sem células estouradas na altura, reduzindo scroll vertical no painel (produtividade). Sem regressão.
- **Métrica de baseline**: delta 0 KB gzip esperado no bundle da rota `/permutas`; 0 novos re-renders; 0 novas requisições HTTP.

### F-performance-2: `Campo` continua um SFC puro após o delta — memoização de pais preservada

- **Severidade**: P3 (positivo — documenta que `React.memo(AbaAutomaticas)` não foi invalidado)
- **Tactic violada**: nenhuma (Maintain Multiple Copies of Computations reforçada)
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:193-217`; `AbaAutomaticas.tsx:26`
- **Evidência (objetiva)**:
  ```
  Campo permanece função sem estado, sem hooks. Props novas são opt-in (default: undefined).
  Consumidores passam a prop `title` com valor derivado da própria linha (c.invoice.exportador etc.)
  — mesma identidade referencial que já entrava na comparação do React.memo do pai.
  Não há closure/callback nova sendo criada por render.
  ```
- **Impacto técnico**: memoização de `AbaAutomaticas` continua efetiva; nenhum re-render extra da árvore.
- **Impacto de negócio**: N/A (não regressão).
- **Métrica de baseline**: 0 re-renders adicionais em cenário de expansão de linha.

### F-performance-3: Bundle size da rota `/permutas` não medido neste run (`--quick`)

- **Severidade**: P2 (dívida de instrumentação — baseline ausente, não pode virar P0/P1 sem número)
- **Tactic violada**: Reduce Overhead (dimensão observabilidade — não temos linha de base do FE bundle registrada no repo)
- **Localização**: `src/frontend/package.json` (sem script `analyze`); `.next/` ausente
- **Evidência (objetiva)**:
  ```
  ls src/frontend/.next → not found
  package.json → sem "analyze" nem @next/bundle-analyzer
  Este PR está seguro por inspeção estática (0 novos imports), mas próximos tweaks precisam
  de baseline objetivo para defender / recusar regressões de bundle.
  ```
- **Impacto técnico**: sem baseline, PRs futuros que casualmente inflem `/permutas` (ex.: importar Radix Tooltip para substituir `title` nativo) passariam despercebidos até produção.
- **Impacto de negócio**: cada 100 KB extras na First Load JS custa ~150-250ms em conexões 3G/hotel — analistas em viagem sentem. Sem número atual, não conseguimos precificar.
- **Métrica de baseline**: **desconhecida** — daí a severidade P2 (não P0/P1 por regra do template).

## 5. Cards Kanban

### [performance-1] Registrar baseline de First Load JS da rota `/permutas` no PR

- **Problema**
  > Este delta é comprovadamente perf-neutro por inspeção estática (0 imports novos, 0 hooks, 0 re-renders), mas o repo não tem baseline objetiva de bundle size para `/permutas`. Próximos tweaks presentacionais no painel (ex.: alguém trocar `title` nativo por Radix Tooltip por questão de UX) poderiam adicionar 5-15 KB gzip sem alarme.
- **Melhoria Proposta**
  > Rodar `npm run build` no branch e em `main`, capturar a linha `Route (app) /permutas → First Load JS` do output do Next 16 e anexar comparação ao PR desta feature. Bass: **Reduce Overhead** (dimensão observabilidade — instrumentação de perf estática). Arquivos: nenhum código — só uma nota no PR + eventualmente adicionar script `analyze` ao `src/frontend/package.json` como follow-up.
- **Resultado Esperado**
  > Baseline de bundle registrada. Delta esperado deste PR: 0 KB gzip (confirmação). PRs futuros na rota `/permutas` têm número contra o qual comparar.
- **Tactic alvo**: Reduce Overhead (observability sub-dimension)
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1h — só rodar build 2× e anotar)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - First Load JS `/permutas` no branch vs `main`: `?` → `0 KB de diferença` (esperado)
  - Baseline registrada no PR: ausente → presente
- **Risco de não fazer**: em 6 meses, regressões incrementais de bundle no painel de permutas viram invisíveis; time perde a habilidade de defender orçamento de perf frontend.
- **Dependências**: nenhuma.

### [performance-2] Adicionar script `analyze` + baseline recorrente no CI (follow-up)

- **Problema**
  > `src/frontend/package.json` não tem script de bundle analysis nem integração com `@next/bundle-analyzer`. Perf frontend é revisada ad hoc por inspeção de diff, não por medição contínua. Escala mal à medida que o painel de permutas cresce (já 4 componentes principais + diálogos, ~1300 LOC só nesse subpath).
- **Melhoria Proposta**
  > Adicionar `@next/bundle-analyzer` em devDependencies, script `"analyze": "ANALYZE=true next build"`, e opcionalmente um step de CI que falhe se First Load JS de rotas críticas (`/permutas`, `/sispag`) subir mais que X% sem justificativa. Bass: **Reduce Overhead** + **Bound Execution Times** (aplicado ao tempo de download/parse do bundle). Arquivos: `src/frontend/package.json`, `next.config.mjs` (wrapper `withBundleAnalyzer`), `.github/workflows/*` (opcional).
- **Resultado Esperado**
  > Time consegue rodar `npm run analyze` localmente e obter breakdown por chunk. Regressões de bundle detectadas antes do merge, não em produção.
- **Tactic alvo**: Reduce Overhead
- **Severidade**: P3
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Script `analyze` disponível: ausente → presente
  - First Load JS por rota reportado em cada PR: manual/ad hoc → automático (opcional CI)
- **Risco de não fazer**: em 6-12 meses, com painéis novos (Popula GED), o bundle FE cresce sem visibilidade; troubleshooting de perf reativo, não preventivo.
- **Dependências**: `performance-1` (baseline primeiro, ferramenta depois).

> **Findings sem card**: F-performance-1 e F-performance-2 são explicitamente informativos (P3 positivos, documentando que o delta é perf-neutro). Não geram card porque não há ação — a "ação" já é o próprio commit `4ef16df`. Registrados como evidência para o `qa-consolidator` no REPORT.

## 6. Notas do agente

- Escopo respeitado: analisei somente o frontend e o delta desta feature; backend/Lambda/RDS/Terraform declarados fora de escopo (scope=frontend + estado atual Express/Render, sem infra Terraform).
- Não rodei `next build` (budget `--quick` + `.next/` ausente); daí F-performance-3 ser P2 (dívida de instrumentação) e não uma tentativa de fabricar número.
- Cross-QA para o `qa-consolidator`:
  - **Deployability**: `performance-2` (script `analyze`) sobrepõe-se a testabilidade de bundle no CI — coordenar se `qa-deployability` propuser algo similar.
  - **Modifiability / Testability**: os 2 testes novos em `__tests__/permutas-components.test.tsx` já cobrem regressão da API `clamp`/`title` do `Campo` — perf-relevante porque garante que a prop continua opt-in (default sem `line-clamp-2`), evitando degradação de layout em consumidores futuros.
- Conclusão executiva: delta é perf-neutro por construção. Único débito real é ausência de baseline objetiva do bundle — endereçado por `performance-1` (S) e `performance-2` (S, follow-up).
