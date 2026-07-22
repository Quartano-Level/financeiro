---
type: regis-review-kanban
run_id: 2026-07-22-1953
scope: frontend
flag: --quick
trigger: /feature-tweak permutas "line-clamp-2 + tooltip no hover em Cliente/Exportador"
gate_verdict: GREEN
total: 16
counts: { p0: 0, p1: 0, p2: 9, p3: 7 }
---

# Kanban — financeiro — 2026-07-22-1953

> Gate **GREEN**: 0 P0, 0 P1 — nenhum destes é bloqueador do merge do delta clamp+tooltip.
> Importável para o Kanban do time. Cada card abaixo é copiado verbatim da seção QA de origem.
> Ordem: P0 (vazio) → P1 (vazio) → P2 (S → M → L → XL) → P3 (S → M → L → XL).

---

## P0 — Crítico

_(vazio — nenhum finding P0 nesta rodada)_

---

## P1 — Alto

_(vazio — nenhum finding P1 nesta rodada)_

---

## P2 — Médio

### [deployability-1] Adicionar `npm run build` ao job frontend do CI

**QA**: Deployability
**Tactic alvo**: Script Deployment Commands
**Esforço**: S (≤1d — 1 linha de YAML + validação)
**Findings**: F-deployability-1

**Problema**
> O job `frontend` no `.github/workflows/ci.yml` roda typecheck/lint/test mas **não** roda
> `npm run build`. Erros específicos do Next (SSR, edge runtime, tree-shaking, incompat de libs)
> só aparecem no build da Vercel, após o merge — feedback tardio, fora do PR.

**Melhoria Proposta**
> Adicionar `- run: npm run build` ao job `frontend` do `ci.yml`, espelhando o job `backend`.
> Manter o `cache: npm` já configurado para não regredir lead time do CI. Tactic Bass alvo:
> **Script Deployment Commands** + reforço de **Reproducible Builds**.

**Resultado Esperado**
> CI pega falhas de build Next antes do merge. Divergência entre "CI verde" e "Vercel deploy"
> eliminada.

**Métricas de sucesso**
- Steps automatizados no job frontend: 4 → 5
- Cobertura de build no CI (jobs FE+BE): 1/2 → 2/2

**Risco de não fazer**
> Quando o delta for maior que presentacional (rota nova, dynamic import, server component), erro
> de build só será descoberto em produção Vercel; rollback manual.

**Dependências**: Nenhuma

---

### [deployability-2] Adicionar `npm audit --audit-level=high` ao job frontend

**QA**: Deployability
**Tactic alvo**: Package Dependencies
**Esforço**: S (≤1d — 1 linha + eventual triagem)
**Findings**: F-deployability-2

**Problema**
> O job `backend` do CI executa `npm audit --audit-level=high`; o job `frontend` não tem
> equivalente. 40 dependências FE (Next 16, React 19, Radix, Zod, etc.) sem gate automático
> para CVEs `high`+.

**Melhoria Proposta**
> Adicionar `- run: npm audit --audit-level=high` após `npm ci` no job `frontend`. Se houver
> falso-positivo persistente, documentar exceção via `npm audit --production` ou allowlist
> (`.npmrc`), não remover o gate. Tactic Bass alvo: **Package Dependencies**.

**Resultado Esperado**
> CVEs high+ em deps do frontend viram falha de PR, não descoberta manual.

**Métricas de sucesso**
- Jobs com `npm audit` no CI: 1/2 → 2/2
- CVEs `high` detectadas em PR: 0 (via processo) → gate automático

**Risco de não fazer**
> CVEs high de deps FE em produção sem sinal, expondo o painel Financeiro da Columbia; auditoria
> manual só quando alguém lembrar.

**Dependências**: Nenhuma

---

### [integrability-1] Promover `Campo` para `src/frontend/components/ui/` quando a segunda feature precisar

**QA**: Integrability
**Tactic alvo**: Abstract Common Services
**Esforço**: S (≤1d — mecânico, cobertura de testes já existe)
**Findings**: F-integrability-1

**Problema**
> O átomo `Campo` (label/valor de painel de detalhe) vive em `app/permutas/components/ui.tsx` e é
> consumido por 46 call sites — todos em Permutas. Quando SISPAG ou Popula GED precisarem do
> mesmo padrão visual, três caminhos ruins se abrem: reimplementar (divergência visual), importar
> cross-feature (acoplamento entre features), ou mover no momento errado sob pressão.

**Melhoria Proposta**
> Aplicar a tactic **Abstract Common Services** de forma **preguiçosa**: **não** promover agora.
> Deixar o card pronto e acionar quando o primeiro `/feature-new` de SISPAG ou Popula GED precisar
> do átomo. No momento da promoção, mover `Campo` para `src/frontend/components/ui/campo.tsx`,
> atualizar imports em `AbaAutomaticas.tsx`, `VisaoGeralTable.tsx`, `AlocarDialog.tsx`,
> `ConfirmarLoteDialog.tsx`, `ConfirmarProcessamentoDialog.tsx` (5 arquivos), rodar
> `npm run typecheck` + `npm test`.

**Resultado Esperado**
> `Campo` disponível como átomo shared. `grep -rn "<Campo" src/frontend | wc -l` continua em 46+N
> (novos consumidores), mas o path de importação passa a ser `@/components/ui/campo` para todos.
> 0 duplicações entre features.

**Métricas de sucesso**
- Duplicações de átomo `label + valor` entre features: 0 (baseline: 0 hoje; alvo: manter em 0 mesmo após SISPAG/GED entrarem)
- Path canônico de import: `@/components/ui/campo` (baseline: `./ui` scoped em Permutas)

**Risco de não fazer**
> Se ignorado por 6 meses e SISPAG/GED entrarem no meio do caminho, custo sobe de S para M —
> a promoção passa a exigir alinhamento entre features com PRs distintos em worktrees paralelos.

**Dependências**: **gatilho** é o próximo `/feature-new` fora de Permutas que precise do átomo.
Sem gatilho, card fica frio no inbox.

---

### [performance-1] Registrar baseline de First Load JS da rota `/permutas` no PR

**QA**: Performance
**Tactic alvo**: Reduce Overhead (observability sub-dimension)
**Esforço**: S (≤ 1h — só rodar build 2× e anotar)
**Findings**: F-performance-3

**Problema**
> Este delta é comprovadamente perf-neutro por inspeção estática (0 imports novos, 0 hooks, 0
> re-renders), mas o repo não tem baseline objetiva de bundle size para `/permutas`. Próximos
> tweaks presentacionais no painel (ex.: alguém trocar `title` nativo por Radix Tooltip por
> questão de UX) poderiam adicionar 5-15 KB gzip sem alarme.

**Melhoria Proposta**
> Rodar `npm run build` no branch e em `main`, capturar a linha `Route (app) /permutas → First
> Load JS` do output do Next 16 e anexar comparação ao PR desta feature. Bass: **Reduce Overhead**
> (dimensão observabilidade — instrumentação de perf estática). Arquivos: nenhum código — só uma
> nota no PR + eventualmente adicionar script `analyze` ao `src/frontend/package.json` como
> follow-up.

**Resultado Esperado**
> Baseline de bundle registrada. Delta esperado deste PR: 0 KB gzip (confirmação). PRs futuros
> na rota `/permutas` têm número contra o qual comparar.

**Métricas de sucesso**
- First Load JS `/permutas` no branch vs `main`: `?` → `0 KB de diferença` (esperado)
- Baseline registrada no PR: ausente → presente

**Risco de não fazer**
> Em 6 meses, regressões incrementais de bundle no painel de permutas viram invisíveis; time
> perde a habilidade de defender orçamento de perf frontend.

**Dependências**: Nenhuma

---

### [testability-1] Documentar limite do jsdom para `line-clamp` e formalizar o proxy adotado

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S (≤1d)
**Findings**: F-testability-1

**Problema**
> O teste de regressão do delta `permutas-clamp` verifica classe (`line-clamp-2`) e atributo
> (`title`), não o corte visual real. jsdom não tem layout engine — qualquer regressão que
> preserve a classe mas quebre o efeito (especificidade de CSS pai, `overflow: visible`, troca
> por `truncate`) passa despercebida. Sem essa documentação, o próximo dev que herdar o teste
> pode assumir que a assertiva mede o corte real.

**Melhoria Proposta**
> Aplicar tactic **Executable Assertions** de forma honesta: (1) adicionar comentário no topo do
> `describe('Campo — clamp + tooltip')` explicitando que a suíte valida contrato-de-classe e o
> efeito visual é verificado fora de jsdom; (2) atualizar
> `ontology/_inbox/permutas-clamp-followups.md` com a limitação e a próxima ação (card
> `testability-2`). Sem código de produção afetado.

**Resultado Esperado**
> Ao ler o teste, qualquer dev entende o que é medido e o que **não** é. Reduz a chance de falsa
> segurança em revisões futuras.

**Métricas de sucesso**
- Comentário-de-cabeçalho no `describe('Campo — clamp + tooltip')`: ausente → presente
- Entrada em `ontology/_inbox/permutas-clamp-followups.md` sobre o limite de jsdom: ausente → presente

**Risco de não fazer**
> Em 6 meses um dev troca `line-clamp-2` por `truncate` para "simplificar", o teste passa e o
> overflow reincide.

**Dependências**: Nenhuma

---

### [testability-3] Ratchet no `coverageThreshold` do FE — subir piso a cada delta que aumente cobertura efetiva

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S (≤1d)
**Findings**: F-testability-3

**Problema**
> O piso de cobertura FE está em `lines: 20 / branches: 9 / functions: 14`. Documentado como
> "baseline REAL após corrigir o Potemkin" — é honesto, mas fica congelado. Sem uma política de
> ratchet, o gate perde força a cada tweak que sobe a cobertura efetiva sem subir o piso
> correspondente.

**Melhoria Proposta**
> Aplicar tactic **Executable Assertions**: definir política escrita em `docs/regis-review/_shared/`
> (ou no próprio `jest.config.js` como comentário-regra) — **todo `/feature-tweak` que suba a
> cobertura efetiva em ≥1pp deve subir o piso correspondente em ≥1pp**. Como este delta adiciona
> 2 casos sem alterar código de produção significativo, o efeito na cobertura é pequeno, então o
> ratchet aqui é opcional; mas a regra fica no lugar para o próximo tweak.

**Resultado Esperado**
> Piso de cobertura acompanha o real. Em 6 meses, `lines: 20 → 35+` sem esforço extra do time.

**Métricas de sucesso**
- Política de ratchet documentada: ausente → presente
- `coverageThreshold.global.lines` (12 meses): 20 → ≥ 40

**Risco de não fazer**
> Piso permanece decorativo, regressões silenciosas em módulos hoje bem cobertos passam pelo CI.

**Dependências**: Nenhuma

---

### [availability-1] Instrumentar RUM/Error Boundary no frontend (Sentry ou equivalente)

**QA**: Availability
**Tactic alvo**: Monitor + Exception Detection
**Esforço**: M (2–5d)
**Findings**: F-availability-1

**Problema**
> O frontend de Permutas (e demais rotas) não expõe métrica de erro em produção observável ao
> time. Falhas de render, exceções não capturadas e regressões visuais como a que motivou o delta
> atual (`line-clamp-2` + tooltip) só chegam por canal humano do analista da Columbia.

**Melhoria Proposta**
> Adicionar client de RUM (Sentry recomendado, alinhado ao stack Next.js + Vercel) com Error
> Boundary de rota em `src/frontend/app/permutas/layout.tsx` (e demais rotas críticas).
> Instrumentar `Monitor` (Bass) via `Sentry.init` + `Sentry.captureException` no boundary. Enviar
> release tag pareada com o bump lockstep FE/BE.

**Resultado Esperado**
> Após 1 semana em produção, dashboard Sentry exibe `% sessions with error` por rota. MTTR da UI
> passa a depender de alerta automático, não de reporte manual.

**Métricas de sucesso**
- `% sessions with JS error` em `/permutas`: **não medível hoje** → baseline coletado em ≤7d após deploy
- Tempo entre erro em produção e ciência do time: **desconhecido** → ≤5min via alerta Sentry

**Risco de não fazer**
> Seguir dependendo de reporte manual do analista; regressões visuais/JS podem passar
> despercebidas por dias, minando confiança na plataforma.

**Dependências**: definição de plano Sentry (custo) com o time de plataforma.

---

### [modifiability-3] Colocar `VisaoGeralTable.tsx` na fila de split preventivo

**QA**: Modifiability
**Tactic alvo**: Split Module
**Esforço**: M (2–5d)
**Findings**: F-modifiability-2

**Problema**
> `VisaoGeralTable.tsx` está em 500 LOC e 24 imports após o delta — 25% acima do p95 de tamanho
> do FE (~400 LOC) e 60% acima do alvo de fan-out (15). O delta em si só adicionou +14 linhas
> úteis, mas empurra o arquivo para uma faixa onde o próximo tweak em Permutas provavelmente
> cruza 550 LOC. Ainda não é P0/P1 porque não há métrica objetiva de degradação de mudança
> (velocidade, conflitos), só o proxy LOC.

**Melhoria Proposta**
> Agendar (não fazer agora) um split de `VisaoGeralTable.tsx` em: (a) `VisaoGeralTable` (grid +
> paginação) e (b) `VisaoGeralRowDetalhe` (o painel expandido, que hoje é ~40% do arquivo e
> concentra os `Campo`s tocados). Registrar como próxima `/feature-tweak` técnica quando qualquer
> tweak funcional voltar a esse arquivo. Tactic Bass alvo: **Split Module**.

**Resultado Esperado**
> Após o split: `VisaoGeralTable.tsx` ≤ 320 LOC, `VisaoGeralRowDetalhe.tsx` ≤ 200 LOC, fan-out
> de cada ≤ 15. Menos merge conflicts em features paralelas na frente Permutas.

**Métricas de sucesso**
- LOC de `VisaoGeralTable.tsx`: 500 → ≤ 320
- Imports em `VisaoGeralTable.tsx`: 24 → ≤ 15
- # arquivos que precisam ser abertos para tocar "detalhe expandido" (proxy de conflito): 1 → 1 (o novo, isolado)

**Risco de não fazer**
> Em 2–3 tweaks o arquivo cruza 600 LOC — split reativo sob pressão de deadline é mais caro e
> mais arriscado que agendar.

**Dependências**: Nenhuma. Fica no backlog até o próximo tweak que abra o arquivo.

---

### [testability-2] Introduzir anel de teste visual (snapshot/screenshot) para invariantes de layout

**QA**: Testability
**Tactic alvo**: Sandbox (defesa em camadas)
**Esforço**: M (2–5d) — setup Playwright + 3 casos-piloto + doc de update de snapshot
**Findings**: F-testability-1, F-testability-2

**Problema**
> O FE só tem um anel de teste (jsdom). Este delta é o **primeiro** que introduz um invariante
> puramente visual (clamp em 2 linhas). Não há ferramenta que exercite CSS real (Playwright
> screenshot, Chromatic, Storybook + play). O bug que este delta conserta (overflow invadindo
> coluna vizinha em Cliente/Exportador) só pode reincidir em outra tela sem detecção automática.

**Melhoria Proposta**
> Aplicar tactic **Sandbox** em camadas: escolher UMA ferramenta (proposta: Playwright com
> `toHaveScreenshot()` em 2-3 casos-chave — painel de detalhe do `AbaAutomaticas` com nome longo
> de exportador é o piloto natural). Rodar apenas em CI (não local), gate opcional inicialmente
> (não trava PR), snapshots versionados. **Não é um requisito deste tweak** — é a promoção do
> gate ao próximo degrau. Card fica em `ontology/_inbox/permutas-clamp-followups.md` para
> priorização.

**Resultado Esperado**
> Regressões visuais de layout viram detectáveis. Delta futuro que altere grid/clamp/overflow no
> `permutas` gera diff de screenshot.

**Métricas de sucesso**
- Anéis de teste FE: 1 (jsdom) → 2 (jsdom + Playwright visual)
- Casos de teste visual cobrindo `permutas/detalhe`: 0 → 3

**Risco de não fazer**
> 6 meses de features novas em `permutas` e `sispag` sem sinal de regressão visual — dívida
> acumula em silêncio.

**Dependências**: decisão de infra CI (tempo extra de pipeline aceitável).

---

## P3 — Baixo

### [availability-2] Reforçar contrato do `Campo` para acoplar `clamp` a `title` (ou fallback documentado)

**QA**: Availability
**Tactic alvo**: Degradation + Sanity Checking + Exception Prevention
**Esforço**: S (≤1d)
**Findings**: F-availability-2

**Problema**
> O componente `Campo` em `src/frontend/app/permutas/components/ui.tsx` aceita `clamp?` e `title?`
> como props independentes. Um call-site futuro pode ativar `clamp` sem `title`, truncando dado
> sem preservação semântica — regressão silenciosa da tactic Degradation.

**Melhoria Proposta**
> Duas opções: (a) tipar `clamp` como discriminated union exigindo `title` (`{ clamp: true; title: string } | { clamp?: false }`),
> OU (b) manter opcional mas, quando `clamp && !title`, usar o próprio `children` (string) como
> fallback de `title` dentro do componente. Adicionar teste de regressão que falhe se `clamp` for
> passado sem `title` no contrato tipado.

**Resultado Esperado**
> Impossível (via TypeScript) truncar texto em `Campo` sem preservar conteúdo acessível via
> tooltip. Contrato reforça Sanity Checking + Degradation em nível de tipo.

**Métricas de sucesso**
- Call-sites de `Campo` com `clamp` sem `title`: 0 atual → 0 garantido por tipo
- Testes de regressão: 2 atuais → 3 (novo caso: contrato tipado)

**Risco de não fazer**
> Baixo — contido a novos call-sites; risco cresce à medida que outras telas adotarem `clamp`.

**Dependências**: Nenhuma

---

### [integrability-2] Documentar contrato de `Campo`: `title` só é aplicado quando `clamp=true`

**QA**: Integrability
**Tactic alvo**: Tailor Interface
**Esforço**: S (≤1d — comentário TSDoc é minutos; discriminated union é 1h com ajuste de testes)
**Findings**: F-integrability-2

**Problema**
> A API de `Campo` aceita `title?: string` como prop independente, mas o átomo só aplica o
> atributo `title` no DOM quando `clamp` também é `true` (linha 210 de `ui.tsx`). Um consumidor
> futuro pode passar `title` sem `clamp` esperando tooltip; nada acontece. Comportamento é
> intencional (título só faz sentido quando o texto está truncado), mas não está expresso no tipo.

**Melhoria Proposta**
> Duas opções, ambas cheap. **Opção A (recomendada)**: refinar o tipo com discriminated union —
> `{ clamp: true; title?: string } | { clamp?: false }` para tornar impossível passar `title` sem
> `clamp`. **Opção B**: manter os tipos atuais e adicionar comentário TSDoc explícito acima da
> prop `title` no signature do `Campo` (`ui.tsx:198-205`), documentando que `title` é ignorado
> sem `clamp`. Custo B: 3 linhas de comentário.

**Resultado Esperado**
> Contrato do átomo auto-documentado (via tipo ou TSDoc). Consumidor futuro não é surpreendido.

**Métricas de sucesso**
- Ambiguidade documentada no tipo/JSDoc: sim (baseline: não)
- Novos testes cobrindo o edge case `title sem clamp`: 1 (baseline: 0 explícito; hoje o teste da linha 189-190 cobre "sem clamp não seta title" mas não como asserção intencional do contrato)

**Risco de não fazer**
> Fricção de DX marginal; sem impacto em produção.

**Dependências**: Nenhuma

---

### [modifiability-1] Prevenir crescimento do smell de prop-explosion no `Campo`

**QA**: Modifiability
**Tactic alvo**: Increase Semantic Coherence
**Esforço**: S (≤1d)
**Findings**: F-modifiability-4

**Problema**
> `Campo` acaba de ganhar 2 props opt-in (`clamp`, `title`) coerentes entre si. Um próximo tweak
> que adicione uma 3ª preocupação heterogênea (p.ex. `mono`, `dim`, `align`) começa a empurrar
> o atom para boolean-explosion. Ainda não é problema — é um guard-rail preventivo para o próximo
> `/feature-tweak` em Permutas.

**Melhoria Proposta**
> Registrar convenção no `docs/design-system/atoms.md` (ou no próprio JSDoc de `Campo`): "≥ 3
> preocupações visuais ortogonais → migrar de props booleanas para `variant`/composição de
> subcomponentes". Não migrar nada agora. Tactic Bass alvo: **Increase Semantic Coherence**.

**Resultado Esperado**
> Próximo dev que abrir `Campo` para adicionar uma 3ª preocupação lê o guard-rail e escolhe
> `variant` em vez de mais um `boolean`. Métrica: `# props opt-in em Campo` continua ≤ 2 até que
> um refactor consciente aconteça.

**Métricas de sucesso**
- # props opt-in em `Campo`: 2 → mantido em ≤ 2 (ou refactor para `variant` se subir)
- JSDoc do `Campo` referencia a convenção: ausente → presente

**Risco de não fazer**
> Em 3–4 tweaks, `Campo` vira `{ clamp, title, mono, dim, align, dense }` e o atom deixa de ser
> semanticamente coerente — refactor tardio custa L em vez de S hoje.

**Dependências**: Nenhuma

---

### [performance-2] Adicionar script `analyze` + baseline recorrente no CI (follow-up)

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S (≤ 1d)
**Findings**: F-performance-3

**Problema**
> `src/frontend/package.json` não tem script de bundle analysis nem integração com
> `@next/bundle-analyzer`. Perf frontend é revisada ad hoc por inspeção de diff, não por medição
> contínua. Escala mal à medida que o painel de permutas cresce (já 4 componentes principais +
> diálogos, ~1300 LOC só nesse subpath).

**Melhoria Proposta**
> Adicionar `@next/bundle-analyzer` em devDependencies, script `"analyze": "ANALYZE=true next build"`,
> e opcionalmente um step de CI que falhe se First Load JS de rotas críticas (`/permutas`, `/sispag`)
> subir mais que X% sem justificativa. Bass: **Reduce Overhead** + **Bound Execution Times**
> (aplicado ao tempo de download/parse do bundle). Arquivos: `src/frontend/package.json`,
> `next.config.mjs` (wrapper `withBundleAnalyzer`), `.github/workflows/*` (opcional).

**Resultado Esperado**
> Time consegue rodar `npm run analyze` localmente e obter breakdown por chunk. Regressões de
> bundle detectadas antes do merge, não em produção.

**Métricas de sucesso**
- Script `analyze` disponível: ausente → presente
- First Load JS por rota reportado em cada PR: manual/ad hoc → automático (opcional CI)

**Risco de não fazer**
> Em 6-12 meses, com painéis novos (Popula GED), o bundle FE cresce sem visibilidade;
> troubleshooting de perf reativo, não preventivo.

**Dependências**: `performance-1` (baseline primeiro, ferramenta depois).

---

### [fault-tolerance-1] Manter o padrão `?? '—'` + `?? undefined` como convenção do `Campo`

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking (Bass — Detect Faults)
**Esforço**: S (≤1d — 3 linhas de JSDoc ou 5 linhas de normalização + 1 teste)
**Findings**: F-fault-tolerance-1

**Problema**
> O delta introduziu um padrão robusto de coerção defensiva (`children ?? '—'` no valor,
> `title ?? undefined` no tooltip) em 3 consumidores, mas isso é convenção de callsite, não do
> componente. Se um consumidor futuro passar um campo null-able ao `Campo` sem coagir, o `title`
> pode virar `null` e o valor pode renderizar `""`.

**Melhoria Proposta**
> Documentar no JSDoc do `Campo` (`ui.tsx:192-205`) que:
> 1. `children` deve ser string/número já coagido — quando o valor pode ser `null | undefined`,
>    o callsite usa `?? '—'`;
> 2. `title` aceita `string | undefined` (não `null`) — quando o valor pode ser `null`, coagir
>    com `?? undefined`.
> Alternativa: apertar o tipo de `title` no próprio `Campo` para aceitar `string | null | undefined`
> e normalizar internamente. Tactic Bass alvo: **Sanity Checking** (deslocar a validação para o
> boundary do componente, não do chamador).

**Resultado Esperado**
> Novo consumidor de `Campo` não consegue introduzir `title="null"` ou render de `"null"` sem
> passar pelo padrão documentado. Sem regressão nos 88 testes atuais.

**Métricas de sucesso**
- Callsites de `Campo` com valor null-able que emitem `title="null"` ou `"null"` no DOM: 0 (atual: 0) → 0 (mantido)
- Doc do contrato do `Campo` cobre `null | undefined`: ausente → presente

**Risco de não fazer**
> Em 6 meses, um consumidor novo passa `campo.opcional` cru e reintroduz o bug de `title="null"`
> — pequeno impacto visual, mas contradiz o padrão que este PR estabeleceu.

**Dependências**: Nenhuma

---

### [security-1] Rodar Regis-Review Security em scope=backend na próxima feature que tocar handlers/SSM/IAM

**QA**: Security
**Tactic alvo**: Limit Exposure (blast radius multi-tenant)
**Esforço**: S (é orquestração de gate, não implementação)
**Findings**: F-security-1

**Problema**
> Este gate ficou legitimamente restrito a scope=frontend porque o delta é CSS + atributo `title`.
> As categorias-alvo do QA Security no financeiro (SSM SecureString discipline, IAM per-Lambda,
> CORS de API Gateway, CloudTrail/GuardDuty, `npm audit` profundo, autz server-side de writes que
> movem dinheiro) permanecem **não medidas** no run 2026-07-22-1953. Como o financeiro é
> multi-tenant e executa remessas SISPAG e permutas em Conexos, uma feature futura que toque
> esses caminhos deve fechar essa lacuna com um Regis-Review Security dedicado, não com este.

**Melhoria Proposta**
> Quando o próximo `/feature-new` ou `/feature-tweak` tocar `src/backend/`, uma integração externa
> (Conexos/Nexxera/GED/SharePoint) ou (quando existir) `infra/tenants/`, o Regis-Review deve
> rodar com `scope=backend` (ou `scope=all`) e **sem** `--quick`, para exercitar as tactics
> **Authenticate Actors**, **Authorize Actors**, **Limit Access**, **Limit Exposure**,
> **Validate Input** e **Audit Trail** com as métricas de secret-hygiene, IAM, CORS e `npm audit`
> que estão ausentes aqui.

**Resultado Esperado**
> Cobertura Security do financeiro deixa de ser apenas presentacional. Métricas mínimas cobertas
> na próxima janela: `# hardcoded secrets` (target 0), `% credential params em SecureString`
> (target 100%), `# routes com authorizer explícito` (target 100% exceto `/health`), `# IAM
> policies com Action:"*"/Resource:"*"` (target 0), `npm audit` critical=0 / high=0.

**Métricas de sucesso**
- Métricas de Secret Hygiene / IAM / CORS coletadas neste run: 0 → ≥6 no run scope=backend
- `dangerouslySetInnerHTML` no `src/frontend`: 0 → 0 (manter)

**Risco de não fazer**
> Postura de segurança do multi-tenant continua sem baseline auditável; um incidente (credencial
> Conexos ou Nexxera vazando via IAM larga, ou payload não validado atingindo o gerador de
> remessa) fica descoberto até o próximo pen-test.

**Dependências**: existência de uma feature backend/infra no próximo ciclo (organicamente
disparada pelo pipeline).

---

### [modifiability-2] Promover `TruncatedText` para o Design System quando surgir 2º domínio

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services / Use an Intermediary
**Esforço**: M (2–5d)
**Findings**: F-modifiability-1, F-modifiability-3

**Problema**
> O padrão `<Campo clamp title={…}>` para nome longo de entidade aparece em 6 call-sites de 3
> arquivos, todos dentro do domínio Permutas. Se SISPAG (favorecido) ou GED (fornecedor) pedirem
> o mesmo comportamento, replicar mais uma vez começa a duplicar a decisão de UX (que atributo é
> o texto completo, quando o tooltip aparece, comportamento de teclado). Já está registrado como
> FUP-1 no inbox.

**Melhoria Proposta**
> Quando um 2º domínio (SISPAG ou GED) pedir o mesmo padrão, criar
> `src/frontend/components/ui/TruncatedText.tsx` que encapsule `line-clamp-*` + `Tooltip` do DS
> (Radix, com gating por overflow real e suporte a `:focus`). Migrar os 6 call-sites de Permutas
> + os novos. Manter a prop `clamp`/`title` do `Campo` como delegação para o novo molecule.
> Tactic Bass alvo: **Abstract Common Services** + **Use an Intermediary**.

**Resultado Esperado**
> 1 fonte única para "truncar texto de entidade com tooltip acessível"; `Campo.clamp` vira
> delegação; call-sites em ≥ 2 domínios apontando para o mesmo molecule. Métrica: `# lugares com
> line-clamp de nome de entidade`: 6 (todos em Permutas) → 1 molecule + N consumers.

**Métricas de sucesso**
- Domínios usando o padrão: 1 (Permutas) → 2+
- Molecule `TruncatedText` em `components/ui/`: ausente → presente
- Acessibilidade por teclado (`:focus` mostra o texto completo): não → sim

**Risco de não fazer**
> Cada domínio novo reimplementa o padrão com variações sutis (title vs Tooltip, com/sem overflow
> gating) — divergência de UX + auditoria WCAG mais cara.

**Dependências**: `docs/design-system/feedback.md` (`Tooltip`), FUP-1 e FUP-2 em
`ontology/_inbox/permutas-clamp-followups.md`

---
