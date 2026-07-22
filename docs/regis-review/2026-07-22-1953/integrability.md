---
qa: Integrability
qa_slug: integrability
run_id: 2026-07-22-1953
agent: qa-integrability
generated_at: 2026-07-22T19:56:00Z
scope: frontend
score: 8
findings_count: 3
cards_count: 2
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev de outra frente (SISPAG / Popula GED) | Reutilizar o átomo `Campo` (label/valor de painel de detalhe) num novo formulário/dialog, precisando de truncamento opcional em textos livres longos | `src/frontend/app/permutas/components/ui.tsx` (`Campo`) + consumidores em `AbaAutomaticas.tsx`, `VisaoGeralTable.tsx`, `AlocarDialog.tsx`, `ConfirmarLoteDialog.tsx`, `ConfirmarProcessamentoDialog.tsx` | Componente ainda co-localizado na feature Permutas (não promovido a `src/frontend/components/ui/`); pipeline verde (typecheck/lint/88 testes) | O consumidor importa `Campo` de `./ui`, ativa `clamp title={texto}` sem quebrar defaults (linhas 209–212 mantêm `break-words`); comportamento default preservado em 100% dos call sites pré-existentes | 0 breaking changes nos 6 call sites atuais; API adiciona 2 props opt-in (`clamp?`, `title?`) e mantém default; regression tests cobrem ambos os ramos (clamp on / clamp off) |

Contexto de escopo: este é um delta **puramente presentacional** (line-clamp-2 + `title` nativo). Integrabilidade de backend/Conexos/Nexxera/GED/SharePoint está **fora do escopo desta rodada** (declarado não medível abaixo). O que se avalia é a **integrabilidade do átomo `Campo`** como boundary de composição entre a feature Permutas e futuras features que reusarem o átomo.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Breaking changes na API de `Campo` | 0 (props novas são opt-in, default preservado) | 0 | ✅ | `src/frontend/app/permutas/components/ui.tsx:193-217` |
| Call sites de `Campo` no repo | 46 | — (linha de base) | ✅ | `grep -rn "<Campo" src/frontend \| wc -l` |
| Call sites que **quebrariam** com o delta (sem `clamp`) | 0 (default `clamp=false` mantém `break-words` como antes) | 0 | ✅ | Leitura de `ui.tsx:207-215` + inspeção dos 46 sites |
| Cobertura de teste da nova API (clamp on/off) | 2 testes novos (linhas 172, 185 do test file) cobrindo ambos os ramos | ≥ 1 por ramo | ✅ | `src/frontend/__tests__/permutas-components.test.tsx:168-192` |
| Localização do átomo `Campo` | co-localizado em `app/permutas/components/ui.tsx` (feature-scoped) | shared atom em `components/ui/` **se** consumido por >1 feature | ⚠️ | `grep -rn "from './ui'" src/frontend/app/permutas` — só Permutas consome hoje |
| Arquivos tocados pelo delta | 5 código + 1 inbox | proporcional (S) | ✅ | `git diff main --stat` |
| Frontend LOC (não-teste) | 27.331 | linha de base | ℹ️ | `_shared-metrics.md` |
| FE fetch/axios call sites | 2 arquivos | — | ℹ️ | `grep -rn "fetch(\|axios" src/frontend -l \| wc -l` |
| FE Zod boundary validation | 0 arquivos com Zod schemas em FE | ≥1 wrapper de API validando com Zod | ⚠️ | `grep -rn "z\.object\|z\.string" src/frontend -l \| wc -l` |

Métricas explicitamente **não medíveis** nesta rodada:

> ⚠️ **Não medível (fora de escopo)**: encapsulation de `ConexosClient`, tactics de "Discover Service" via SSM, versioning de API externa (Conexos v2), contract tests para Nexxera/GED/SharePoint, orchestrators de backend. Motivo: delta 100% frontend, presentacional; nenhum client, service ou repository do backend foi tocado. Requer scope=backend ou scope=all. Recomendação: reavaliar no próximo `/feature-new` que crie a integração Nexxera ou o write-side do Conexos.

> ⚠️ **Não medível localmente**: taxas de erro por integração externa, latência p95 por dependência. Requer CloudWatch/observabilidade que ainda não existe (estado atual roda em Render/Vercel — a stack de observabilidade AWS é alvo, não atual).

## 3. Tactics — Cobertura no nf-projects

Escopo do mapeamento: **integrabilidade do átomo `Campo` como boundary de composição frontend**. Tactics de integração externa (Conexos, Nexxera, GED, SharePoint) ficam com `N/A — fora de escopo (frontend-only, presentational delta)` — o consolidator deve puxar essas do próximo review com scope backend.

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `Campo` encapsula label + valor + estilo (`min-w-0`, `space-y-0.5`, `break-words`); consumidores não conhecem detalhes de layout | ✅ presente | `src/frontend/app/permutas/components/ui.tsx:193-217` |
| Use an Intermediary | `Campo` já é o intermediário entre `dl>dt/dd` do DOM e o consumidor; não há segunda camada necessária para o delta | ✅ presente | idem |
| Restrict Communication Paths | Consumidores importam via `from './ui'` (path único, feature-local); nenhum consumidor toca DOM/CSS de `Campo` por fora | ✅ presente | `grep -rn "from './ui'" src/frontend/app/permutas` (11 imports, todos via barrel) |
| Adhere to Standards | `title` é atributo HTML nativo padrão (tooltip do browser); `line-clamp-2` é utilitário Tailwind padrão; nenhum widget custom | ✅ presente | `ui.tsx:210-211` |
| Abstract Common Services | `Campo` está co-localizado em Permutas; ainda não promovido a `src/frontend/components/ui/` (onde vivem `badge`, `button`, `card`, `dialog`, `input`, `tooltip`…). Se SISPAG/GED reusarem, precisa promoção | ⚠️ parcial | `ls src/frontend/components/ui` (21 atoms shared) vs `ui.tsx` em `app/permutas/components` |
| Discover Service | N/A — sem service discovery no escopo (delta presentacional) | N/A | — |
| Tailor Interface | Delta **é** um exemplo de Tailor Interface: `Campo` ganhou variação opt-in (`clamp`, `title`) sem alterar contrato existente. Consumidores antigos seguem funcionando; consumidores novos ativam a variação | ✅ presente | `ui.tsx:196-205` (props opcionais); default preservado em `ui.tsx:210-211` |
| Configure Behavior | `clamp` e `title` são configuração de comportamento em tempo de composição (props), não runtime — adequado ao contexto React | ✅ presente | `ui.tsx:207-215` |
| Manage Resources | N/A — sem gestão de recursos externos no escopo (nenhum handle, socket, conexão) | N/A | — |
| Orchestrate | N/A — átomo puro sem side effects | N/A | — |
| Manage Resource Coupling | N/A — sem recursos compartilhados no escopo | N/A | — |
| Contract testing | 2 regression tests novos (`__tests__/permutas-components.test.tsx:168-192`) validam o **contrato do átomo**: com `clamp` → aplica `line-clamp-2` + seta `title`; sem `clamp` → mantém default e não seta `title`. Cobre ambos os ramos da nova API | ✅ presente | test file linhas 168-192 |
| Versioning strategy | N/A para átomo React interno — não é API pública versionada. A extensão via props opt-in **é** a estratégia de versionamento equivalente (adição não-breaking) | N/A (com justificativa) | — |
| Backward-compatibility shims | Não necessário — `clamp` default `false` mantém 100% dos 46 call sites pré-existentes com comportamento idêntico ao anterior | ✅ presente (por design) | `ui.tsx:211` (`clamp && 'line-clamp-2'`) |
| Observability of integration failures | N/A — átomo presentacional sem falhas observáveis (tooltip nativo é responsabilidade do browser) | N/A | — |

Tactics de integração externa (backend clients, SSM, retry, auth refresh, schema-pinned responses) — **N/A nesta rodada por escopo**. Serão reavaliadas quando o próximo review rodar com scope backend/all.

## 4. Findings (achados)

### F-integrability-1: `Campo` ainda co-localizado em Permutas; risco de duplicação se SISPAG/GED precisarem do mesmo átomo

- **Severidade**: P2 (débito técnico defensável; sem baseline numérico de reuso cross-feature)
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:193-217` (definição); `src/frontend/components/ui/` (onde deveria viver se compartilhado)
- **Evidência (objetiva)**:
  ```
  $ ls src/frontend/components/ui
  badge.tsx button.tsx card.tsx checkbox.tsx collapsible.tsx date-picker.tsx
  dialog.tsx empty-state.tsx input.tsx kpi-card.tsx label.tsx multi-select.tsx
  page-header.tsx popover.tsx select.tsx skeleton.tsx spinner.tsx switch.tsx
  table.tsx tabs.tsx tooltip.tsx
  # (21 atoms shared, mas Campo NÃO está aqui)

  $ grep -rn "<Campo" src/frontend | wc -l
  46   # todos em app/permutas/components/*.tsx
  ```
- **Impacto técnico**: quando a frente SISPAG ou Popula GED construir seu painel de detalhe (label/valor), o dev vai (a) reimplementar um `Campo` local, (b) importar de `@/app/permutas/components/ui` criando dependência cruzada entre features, ou (c) mover no momento errado sob pressão de deadline. Nenhuma opção é boa; a promoção proativa evita as três.
- **Impacto de negócio**: fricção marginal para desenvolver as próximas frentes (SISPAG, Popula GED) — semanas de work, não meses. Risco de divergência visual entre painéis se cada frente reimplementar.
- **Métrica de baseline**: 0 features consumindo `Campo` fora de Permutas hoje → não há divergência mensurável **ainda**. Por isso P2 e não P1: o problema é potencial, não atual.

### F-integrability-2: API de `Campo` não valida `title` vs `clamp` — combinação `title` sem `clamp` é silenciosamente ignorada

- **Severidade**: P3 (melhoria opcional; edge case de DX)
- **Tactic violada**: Tailor Interface (contrato levemente ambíguo)
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:210` (`title={clamp ? title : undefined}`)
- **Evidência (objetiva)**:
  ```tsx
  // ui.tsx:210
  title={clamp ? title : undefined}
  // Se o dev passar <Campo title="foo"> sem clamp, o title é descartado silenciosamente.
  ```
- **Impacto técnico**: desenvolvedor pode passar `title` sem `clamp` esperando ver tooltip; nada acontece; debug demora até ler o código do átomo. Testado no test file (linha 189-190 valida o não-set do title sem clamp — comportamento é intencional, mas não documentado no tipo).
- **Impacto de negócio**: fricção de DX interna; sem impacto externo. Marginal.
- **Métrica de baseline**: 0 ocorrências hoje (todos os 4 call sites com `title` também têm `clamp`) — inspeção manual dos grep hits em VisaoGeralTable/AbaAutomaticas/AlocarDialog. Sem regressão atual.

### F-integrability-3: FE não valida shape de resposta HTTP em boundary (0 arquivos com Zod no frontend)

- **Severidade**: P2 (débito pré-existente, **não introduzido por este delta**)
- **Tactic violada**: Contract testing / schema validation at boundary
- **Localização**: `src/frontend/` (transversal; heurística agregada)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "z\.object\|z\.string\|from 'zod'" src/frontend -l | wc -l
  0
  $ grep -rn "fetch(\|axios" src/frontend -l | wc -l
  2
  ```
- **Impacto técnico**: mudanças de shape na API backend (Conexos, endpoints Express atuais) passam silenciosamente para o React até o primeiro `undefined.foo` em runtime. CLAUDE.md recomenda Zod nos boundaries; frontend ainda não adotou.
- **Impacto de negócio**: risco de UI quebrada em produção quando backend evoluir. Marginal enquanto FE+BE forem mono-repo e evoluírem em lockstep — mas o roadmap prevê independência.
- **Métrica de baseline**: 0 arquivos FE com validação Zod de payload de API. Delta atual não piora nem melhora; é linha de base pré-existente. Registrado aqui para cross-QA (Security / Fault Tolerance devem ver o mesmo número).

## 5. Cards Kanban

### [integrability-1] Promover `Campo` para `src/frontend/components/ui/` quando a segunda feature precisar

- **Problema**
  > O átomo `Campo` (label/valor de painel de detalhe) vive em `app/permutas/components/ui.tsx` e é consumido por 46 call sites — todos em Permutas. Quando SISPAG ou Popula GED precisarem do mesmo padrão visual, três caminhos ruins se abrem: reimplementar (divergência visual), importar cross-feature (acoplamento entre features), ou mover no momento errado sob pressão.

- **Melhoria Proposta**
  > Aplicar a tactic **Abstract Common Services** de forma **preguiçosa**: **não** promover agora. Deixar o card pronto e acionar quando o primeiro `/feature-new` de SISPAG ou Popula GED precisar do átomo. No momento da promoção, mover `Campo` para `src/frontend/components/ui/campo.tsx`, atualizar imports em `AbaAutomaticas.tsx`, `VisaoGeralTable.tsx`, `AlocarDialog.tsx`, `ConfirmarLoteDialog.tsx`, `ConfirmarProcessamentoDialog.tsx` (5 arquivos), rodar `npm run typecheck` + `npm test`.

- **Resultado Esperado**
  > `Campo` disponível como átomo shared. `grep -rn "<Campo" src/frontend | wc -l` continua em 46+N (novos consumidores), mas o path de importação passa a ser `@/components/ui/campo` para todos. 0 duplicações entre features.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤1d — mecânico, cobertura de testes já existe)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - Duplicações de átomo `label + valor` entre features: 0 (baseline: 0 hoje; alvo: manter em 0 mesmo após SISPAG/GED entrarem)
  - Path canônico de import: `@/components/ui/campo` (baseline: `./ui` scoped em Permutas)
- **Risco de não fazer**: se ignorado por 6 meses e SISPAG/GED entrarem no meio do caminho, custo sobe de S para M — a promoção passa a exigir alinhamento entre features com PRs distintos em worktrees paralelos.
- **Dependências**: **gatilho** é o próximo `/feature-new` fora de Permutas que precise do átomo. Sem gatilho, card fica frio no inbox.

### [integrability-2] Documentar contrato de `Campo`: `title` só é aplicado quando `clamp=true`

- **Problema**
  > A API de `Campo` aceita `title?: string` como prop independente, mas o átomo só aplica o atributo `title` no DOM quando `clamp` também é `true` (linha 210 de `ui.tsx`). Um consumidor futuro pode passar `title` sem `clamp` esperando tooltip; nada acontece. Comportamento é intencional (título só faz sentido quando o texto está truncado), mas não está expresso no tipo.

- **Melhoria Proposta**
  > Duas opções, ambas cheap. **Opção A (recomendada)**: refinar o tipo com discriminated union — `{ clamp: true; title?: string } | { clamp?: false }` para tornar impossível passar `title` sem `clamp`. **Opção B**: manter os tipos atuais e adicionar comentário TSDoc explícito acima da prop `title` no signature do `Campo` (`ui.tsx:198-205`), documentando que `title` é ignorado sem `clamp`. Custo B: 3 linhas de comentário.

- **Resultado Esperado**
  > Contrato do átomo auto-documentado (via tipo ou TSDoc). Consumidor futuro não é surpreendido.

- **Tactic alvo**: Tailor Interface
- **Severidade**: P3
- **Esforço estimado**: S (≤1d — comentário TSDoc é minutos; discriminated union é 1h com ajuste de testes)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - Ambiguidade documentada no tipo/JSDoc: sim (baseline: não)
  - Novos testes cobrindo o edge case `title sem clamp`: 1 (baseline: 0 explícito; hoje o teste da linha 189-190 cobre "sem clamp não seta title" mas não como asserção intencional do contrato)
- **Risco de não fazer**: fricção de DX marginal; sem impacto em produção.
- **Dependências**: nenhuma.

**Findings sem card (justificados)**:
- F-integrability-3 (0 Zod no FE) **não vira card nesta rodada** porque: (a) é pré-existente, não introduzido pelo delta; (b) o escopo do gate é o delta line-clamp; (c) o problema é transversal e melhor tratado num `/feature-new` que introduza validação de payload como cross-cutting. Registrado como **cross-QA para Security e Fault Tolerance** — o consolidator deve considerar se esses agentes levantarem o mesmo número (0 arquivos com Zod no FE).

## 6. Notas do agente

- Escopo declarado (frontend, delta presentacional) foi respeitado: tactics de encapsulate/discover/adapt de backend clients (Conexos, futuros Nexxera/GED/SharePoint) declaradas explicitamente como **N/A — fora de escopo** conforme instrução do orquestrador.
- Nenhum finding P0/P1 levantado — coerente com a diretriz do prompt (P0/P1 exigem baseline numérico; o delta não introduz problema com baseline numérico crítico).
- **Cross-QA para o consolidator**:
  - F-integrability-1 (Abstract Common Services / promoção do `Campo`) sobrepõe-se com **Modifiability** (mesmo átomo, mesma decisão de reuso). Sugerir card único se qa-modifiability levantar o mesmo ponto.
  - F-integrability-3 (Zod nos boundaries FE) sobrepõe-se com **Security** (validate input) e **Fault Tolerance** (tolerar payload malformado). Consolidar se aparecer nos três.
- Métrica que tentei coletar e não fez sentido no escopo: retry/backoff em clients externos — código de backend não foi tocado; declarei explicitamente como não medível.
