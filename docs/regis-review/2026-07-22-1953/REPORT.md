---
type: regis-review-report
run_id: 2026-07-22-1953
generated_at: 2026-07-22T20:00:00Z
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
scope: frontend
flag: --quick
trigger: gate pós-impl de `/feature-tweak permutas "line-clamp-2 + tooltip no hover em Cliente/Exportador"`
branch: fix/permutas-clamp-cliente-exportador
total_cards: 16
total_p0: 0
total_p1: 0
total_p2: 9
total_p3: 7
overall_score: 7.97
gate_verdict: GREEN
---

# Regis-Review — financeiro — 2026-07-22-1953

> **Gate verdict: GREEN.** Este run é o gate pós-impl obrigatório de um `/feature-tweak`
> **puramente presentacional** (5 arquivos frontend + 1 inbox: `line-clamp-2` no `Campo` +
> tooltip nativo em Cliente/Exportador dos painéis de Permutas). **Nenhum dos 8 QAs emitiu P0
> ou P1.** Todos os 16 cards abaixo são **P2/P3 preventivos** ou **débitos pré-existentes
> registrados para follow-up** — **não são bloqueadores do merge desta feature**. A recomendação
> operacional é: **mergear o delta** e priorizar os P2 na próxima janela de planejamento (não
> re-entrar no loop AutoLoop com estes achados).

## 1. Executive scorecard

Pesos utilizados na média ponderada (calibrados para financeiro multi-tenant que executa escritas
que movem dinheiro):

| QA | Peso |
|---|---|
| Security | 1.5 |
| Fault Tolerance | 1.3 |
| Availability | 1.2 |
| Modifiability | 1.2 |
| Testability | 1.0 |
| Performance | 1.0 |
| Integrability | 0.9 |
| Deployability | 0.9 |
| **Total** | **9.0** |

| QA | Score (0–10) | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 8.0 | 0 | 0 | 1 | 1 | F-availability-1: Ausência de RUM/Error Boundary observável no FE de Permutas |
| Deployability | 7.0 | 0 | 0 | 2 | 1 | F-deployability-1: CI do frontend não executa `npm run build` |
| Integrability | 8.0 | 0 | 0 | 2 | 1 | F-integrability-1: `Campo` co-localizado em Permutas; risco de duplicação se SISPAG/GED reusarem |
| Modifiability | 8.0 | 0 | 0 | 2 | 2 | F-modifiability-2: `VisaoGeralTable.tsx` em 500 LOC / 24 imports (25% acima do p95) |
| Performance | 9.0 | 0 | 0 | 1 | 2 | F-performance-3: Baseline de First Load JS de `/permutas` não registrada no repo |
| Fault Tolerance | 8.5 | 0 | 0 | 1 | 1 | F-fault-tolerance-2: ErrorBoundary do painel de detalhe não verificado neste gate |
| Security | 8.0 | 0 | 0 | 0 | 1 | F-security-1: Postura backend/IAM/SSM/CORS não medível em `scope=frontend` |
| Testability | 7.0 | 0 | 0 | 3 | 1 | F-testability-1: Truncamento visual não é verificável em jsdom — teste valida só o proxy |
| **Overall (média ponderada)** | **7.97** | **0** | **0** | **9** | **7** | — |

Score interpretation:
- 0–3: risco estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais ← **posição atual**
- 9–10: estado-da-arte para o estágio atual

**Leitura em uma linha:** 7.97 ponderado, com Performance como QA mais forte (9.0, delta perf-neutro
por construção) e Deployability/Testability como os mais fracos (7.0, ambos por dívida de
instrumentação, não regressão introduzida por este delta).

## 2. Contexto: por que este gate é GREEN

Antes de olhar os riscos, o que precisa estar claro na sala:

1. **Escopo do delta:** 5 arquivos `.tsx` + 1 `.md` de inbox. Nenhum toque em backend, SQL,
   integração externa, secrets, infra ou lógica de negócio. É `Campo.tsx` ganhando duas props
   opt-in (`clamp?: boolean`, `title?: string`) + Cliente/Exportador em 4 call-sites de Permutas
   passando essas props.
2. **Retrocompatibilidade 100%:** default do `Campo` preservado (`break-words`, sem `line-clamp`);
   46 call-sites pré-existentes não regridem.
3. **Sinais verdes:** typecheck 0 erros, lint 0 errors (8 warnings pré-existentes fora do delta),
   88/88 testes passando com 2 novos casos de regressão para o contrato `clamp`/`title`.
4. **DesignSystemReviewer** já rodou e passou com 2 P1 endereçados como follow-ups em
   `ontology/_inbox/permutas-clamp-followups.md` — não são achados de arquitetura.
5. **Regra 7 do template Regis-Review:** P0/P1 exigem baseline numérico de impacto. Nenhum dos 8
   agents conseguiu construir esse baseline neste escopo (`scope=frontend`, `--quick`, sem CloudWatch,
   sem Sentry em produção, sem Terraform, sem tenants) — logo, por definição, nenhum P0/P1 foi emitido.
   Isso **não é conveniência**; é a aplicação correta da regra.

**Conclusão operacional:** o delta merge-a como está. Os 16 cards abaixo são para o backlog
técnico, não para o loop AutoLoop.

## 3. Top 10 follow-ups consolidados (cross-QA)

Ranking por composto = severidade × business impact × leverage. Nenhum destes é blocker; são
**os que rendem mais retorno por unidade de esforço** na próxima janela.

### R-1: Sem observabilidade de erro em produção no frontend (RUM / Error Boundary)
- **QA(s) afetados:** Availability, Fault Tolerance, Testability (transversal)
- **Findings de origem:** F-availability-1 (`availability.md#4`), F-fault-tolerance-2
  (`fault-tolerance.md#4`), F-testability-2 (`testability.md#4`)
- **Evidência sintetizada:** 0 clients de telemetria no `package.json` do FE; 0 ErrorBoundary
  auditado na rota `/permutas`; 202 test files todos em jsdom (sem anel de browser real).
- **Impacto técnico:** falha de render em produção fica invisível até o analista reportar; MTTR
  da UI depende de canal humano.
- **Impacto de negócio:** analista da Frente I pode operar minutos ou horas com tela quebrada;
  risco (baixa frequência, alto custo) de decidir permuta com dado parcial que não observamos.
- **Card(s) Kanban relacionados:** availability-1 (M), testability-2 (M)
- **Custo de inação em 6 meses:** cada incidente de UI em produção → +30–120 min de MTTR e ruído
  no canal do time; se acumular 3 incidentes, credibilidade da automação junto ao Financeiro cai
  antes do time saber que caiu. Premissa: incidentes de UI ocorrem em algum ritmo natural conforme
  o FE cresce; sem sinal, ninguém sabe qual é o ritmo.

### R-2: Gate de qualidade do frontend no CI está incompleto (sem `npm run build`, sem `npm audit`)
- **QA(s) afetados:** Deployability, Security
- **Findings de origem:** F-deployability-1, F-deployability-2 (`deployability.md#4`)
- **Evidência sintetizada:** job `backend` do `ci.yml` roda `npm run build` + `npm audit --audit-level=high`;
  job `frontend` roda **nenhum dos dois**. 40 deps FE (Next 16, React 19, Radix, Zod) sem gate SCA.
- **Impacto técnico:** erros de build específicos do Next (SSR, edge, tree-shaking) só aparecem
  na Vercel, pós-merge; CVEs high em deps FE não travam PR.
- **Impacto de negócio:** deploy falha em produção depois do merge → rollback manual + janela cega
  para o cliente. CVE high no bundle FE que serve o Financeiro passa silenciosa.
- **Cards:** deployability-1 (S), deployability-2 (S)
- **Custo de inação em 6 meses:** 1–2 rollbacks manuais de deploy Vercel + auditoria manual
  reativa de CVEs. Premissa: com 40 deps FE, ao menos 1 CVE `high` aparece em 6 meses.

### R-3: `Campo` co-localizado; duplicação iminente quando SISPAG/GED entrarem
- **QA(s) afetados:** Integrability, Modifiability
- **Findings de origem:** F-integrability-1 (`integrability.md#4`), F-modifiability-3
- **Evidência sintetizada:** 46 call-sites de `<Campo>`, **todos em `app/permutas/`**; 21 átomos
  shared em `components/ui/`, `Campo` não está lá.
- **Impacto técnico:** quando SISPAG (favorecido) ou Popula GED (fornecedor) forem construídos,
  três caminhos ruins se abrem: reimplementar (divergência visual), importar cross-feature
  (acoplamento), ou mover sob pressão de deadline.
- **Impacto de negócio:** fricção para as próximas frentes; risco de UX divergente entre painéis
  Permutas/SISPAG/GED — analista percebe.
- **Cards:** integrability-1 (S, gatilhado), modifiability-2 (M)
- **Custo de inação em 6 meses:** se SISPAG entrar antes da promoção, custo sobe de S para M
  (2–3 PRs de sincronização entre worktrees paralelos).

### R-4: `VisaoGeralTable.tsx` cruzando o p95 de tamanho de arquivo
- **QA(s) afetados:** Modifiability, Testability
- **Findings de origem:** F-modifiability-2
- **Evidência sintetizada:** 500 LOC (p95 FE = 400), 24 imports (alvo = 15), 24 usos de `Campo`;
  o delta em si só adicionou +14 linhas úteis, mas empurra o arquivo para faixa onde o próximo
  tweak facilmente cruza 550.
- **Impacto técnico:** merge conflicts em features paralelas na frente Permutas ficam mais
  frequentes; cobertura de teste do arquivo mais cara de manter.
- **Impacto de negócio:** velocidade de tweak em Permutas cai progressivamente.
- **Cards:** modifiability-3 (M)
- **Custo de inação em 6 meses:** 2–3 tweaks e o arquivo cruza 600 LOC; split reativo sob pressão
  custa 5× o preventivo.

### R-5: Piso de cobertura FE é decorativo (`lines: 20`, `branches: 9`, `functions: 14`)
- **QA(s) afetados:** Testability
- **Findings de origem:** F-testability-3
- **Evidência sintetizada:** `src/frontend/jest.config.js:37-39`. Um dev pode remover 30% dos
  casos de teste e o CI ainda passa.
- **Impacto técnico:** regressões silenciosas em módulos hoje bem cobertos (`format.ts`,
  `tabela-filtro.ts`) — deletar `format.test` não trava CI.
- **Impacto de negócio:** o piso não trava dívida técnica; quanto mais tempo baixo, mais fácil
  aceitá-lo como normal.
- **Cards:** testability-3 (S)
- **Custo de inação em 6 meses:** cobertura efetiva descolando do piso, sem ratchet automático.

### R-6: Ausência de anel de teste visual (jsdom é o único ring do FE)
- **QA(s) afetados:** Testability, Fault Tolerance
- **Findings de origem:** F-testability-1, F-testability-2
- **Evidência sintetizada:** 202 test files, todos jsdom; 0 configs Playwright/Cypress/Chromatic/
  Storybook. O `line-clamp-2` deste delta é o **primeiro invariante puramente visual** — jsdom
  valida a classe (proxy), não o corte real.
- **Impacto técnico:** trocar `line-clamp-2` por `truncate` mantém teste verde mas regride o UX;
  `overflow: visible !important` em um pai quebra clamp sem alarme.
- **Impacto de negócio:** o próprio bug que este tweak conserta (nome longo invadindo coluna)
  pode reincidir em outra tela sem detecção automática.
- **Cards:** testability-1 (S, doc do proxy), testability-2 (M, Playwright piloto)
- **Custo de inação em 6 meses:** 1–2 regressões visuais chegando ao analista antes do time.

### R-7: FE não valida shape de resposta HTTP em boundary (0 arquivos com Zod no FE)
- **QA(s) afetados:** Integrability, Security, Fault Tolerance (transversal, pré-existente)
- **Findings de origem:** F-integrability-3 (registrado, sem card na rodada)
- **Evidência sintetizada:** `grep -rn "z.object\|z.string\|from 'zod'" src/frontend -l | wc -l` = **0**;
  2 arquivos fazem `fetch`/`axios`. CLAUDE.md recomenda Zod nos boundaries; FE ainda não adotou.
- **Impacto técnico:** mudança de shape na API backend passa silenciosa para o React até `undefined.foo`
  em runtime.
- **Impacto de negócio:** risco marginal enquanto FE+BE evoluem lockstep; sobe quando a independência
  de deploy virar realidade.
- **Cards:** **nenhum nesta rodada** (não é regressão do delta; deve ser tratado em `/feature-new`
  que introduza validação como cross-cutting).
- **Custo de inação em 6 meses:** invisível hoje; primeira feature FE que consumir endpoint
  independente do BE paga o preço.

### R-8: Sem baseline objetivo de First Load JS por rota
- **QA(s) afetados:** Performance, Deployability
- **Findings de origem:** F-performance-3
- **Evidência sintetizada:** `.next/` ausente, sem script `analyze` no `package.json`, sem
  comparação de bundle em PR. Este delta é perf-neutro **por inspeção estática** (0 novos imports,
  0 hooks), mas o próximo PR que trocar `title` nativo por Radix Tooltip pode inflar 5–15 KB gzip
  sem alarme.
- **Impacto técnico:** perf FE revisada ad hoc por diff, não medição contínua.
- **Impacto de negócio:** cada 100 KB extras na First Load JS custa ~150–250ms em 3G/hotel.
- **Cards:** performance-1 (S — 2 builds e uma nota no PR), performance-2 (S, follow-up)
- **Custo de inação em 6 meses:** invisível até virar visível; então caro corrigir.

### R-9: Observabilidade de deploy Vercel desconectada do pipeline
- **QA(s) afetados:** Deployability, Availability
- **Findings de origem:** F-deployability-3
- **Evidência sintetizada:** `ci.yml` termina em `tag-release`; nenhum hook Vercel→Slack; deploy
  status só visível no dashboard.
- **Impacto técnico:** lead time real commit→prd não é medível pelo time; falha de build Vercel
  não gera alerta automático.
- **Impacto de negócio:** aceitável enquanto não há SLA formal; atrita quando tenants começarem
  a existir.
- **Cards:** **nenhum nesta rodada** (F-deployability-3 registrado como P3 sem card acionável
  no escopo do delta).
- **Custo de inação em 6 meses:** baixo hoje; crítico quando o primeiro tenant for provisionado.

### R-10: Contrato de `Campo` permite `clamp` sem `title` (regressão silenciosa possível)
- **QA(s) afetados:** Availability, Integrability, Fault Tolerance
- **Findings de origem:** F-availability-2, F-integrability-2, F-fault-tolerance-1
- **Evidência sintetizada:** props independentes; um call-site futuro pode ativar `clamp` sem
  `title` — trunca visualmente sem preservar conteúdo. Todos os 4 call-sites atuais passam ambas;
  baseline = 0 uso degradado. `title` sem `clamp` é silenciosamente descartado (intencional, não
  documentado no tipo).
- **Impacto técnico:** regressão futura em outro painel pode truncar CNPJ/razão social sem tooltip.
- **Impacto de negócio:** contido; risco cresce à medida que `clamp` se espalhar.
- **Cards:** availability-2 (S), integrability-2 (S), fault-tolerance-1 (S)
- **Custo de inação em 6 meses:** baixo se `clamp` ficar em Permutas; sobe se propagar sem contrato
  reforçado.

## 4. Cross-cutting findings

Pontos onde a mesma causa-raiz aparece em múltiplos QAs. Um card bem escolhido resolve para todos.

### CC-1: Observabilidade zero em produção do frontend
- **Aparece em:** Availability (F-availability-1), Fault Tolerance (F-fault-tolerance-2),
  Testability (F-testability-2)
- **Diagnóstico unificado:** o FE não tem RUM (Sentry ou equivalente), não tem ErrorBoundary de
  rota auditado, e o único anel de teste é jsdom. As três lacunas compartilham a mesma raiz:
  falhas de render/JS em produção são invisíveis para o time até o analista reportar.
- **Recomendação consolidada:** **availability-1** (Sentry + ErrorBoundary em `/permutas/layout.tsx`)
  entrega o primeiro andar de observabilidade. **testability-2** (Playwright piloto) adiciona o
  anel preventivo. Fazer os dois na próxima janela reduz o R-1 para nível gerenciável.

### CC-2: Gate de CI do frontend divergente do backend
- **Aparece em:** Deployability (F-deployability-1, F-deployability-2), Security (paralelo com
  security-1 no espírito de "não medir é aceitar")
- **Diagnóstico unificado:** o job `frontend` do `ci.yml` roda 3 steps (typecheck, lint, test);
  o job `backend` roda 5 (adiciona `build` e `audit`). A divergência não é justificada — é
  histórica. Ambos os steps custam < 1 min no cache atual.
- **Recomendação consolidada:** **deployability-1** (`npm run build`) + **deployability-2**
  (`npm audit --audit-level=high`). Junto = ~5 linhas de YAML, esforço combinado S. Fecha R-2.

### CC-3: `Campo` como átomo do domínio Permutas com pressão para promoção iminente
- **Aparece em:** Integrability (F-integrability-1), Modifiability (F-modifiability-3)
- **Diagnóstico unificado:** `Campo` é o átomo mais reutilizado do domínio (46 call-sites, 6
  fan-in interno). Quando SISPAG ou GED entrarem, a promoção para `components/ui/` vira urgente.
  Fazer preventivamente hoje é over-engineering (Rule of Three); esperar demais custa mais.
- **Recomendação consolidada:** **integrability-1** como card "frio" no backlog, gatilhado pelo
  próximo `/feature-new` fora de Permutas que consuma o átomo. **modifiability-2** promove o
  molecule `TruncatedText` no mesmo momento.

### CC-4: Ausência de baselines objetivas (bundle size, cobertura efetiva, MTTR)
- **Aparece em:** Performance (F-performance-3), Testability (F-testability-3),
  Availability (F-availability-1), Deployability (F-deployability-3)
- **Diagnóstico unificado:** o repo tem gates (typecheck, lint, test, cobertura piso), mas os
  pisos estão desconectados do real. Não há bundle size registrado, cobertura piso é 20%, MTTR
  de produção não é medido. Isso não é vulnerabilidade — é **cegueira quantitativa**: cada regressão
  passa até virar visível qualitativamente.
- **Recomendação consolidada:** **performance-1** (baseline no PR, S) + **testability-3** (ratchet
  de cobertura, S) juntos custam ≤1 dia e dobram a força dos gates atuais. Follow-up:
  **performance-2** (bundle analyzer), **availability-1** (Sentry para MTTR).

## 5. Quick wins (≤5 dias úteis, S+P2)

Cards de esforço S e severidade ≥ P2 com alta razão impacto/esforço. **Estes são os candidatos
óbvios para primeira sprint pós-aprovação — não são bloqueadores desta feature.**

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| deployability-1 | Deployability | S | P2 | CI do FE roda `npm run build`; erros de build Next travam PR, não Vercel |
| deployability-2 | Deployability | S | P2 | CI do FE roda `npm audit --audit-level=high`; CVE high vira falha de PR |
| integrability-1 | Integrability | S | P2 | `Campo` promovido a `components/ui/` quando SISPAG/GED consumir (card frio, gatilhado) |
| performance-1 | Performance | S | P2 | Baseline First Load JS `/permutas` registrada no PR; 0 KB diff confirmado |
| testability-1 | Testability | S | P2 | Doc explícita do proxy `line-clamp-2` em jsdom; próximo dev não é enganado |
| testability-3 | Testability | S | P2 | Política de ratchet documentada; piso de cobertura acompanha o real |

6 quick wins somam ≤4 dias de trabalho combinado. Endereçam R-2, R-3, R-5, R-6, R-8. **Alta
alavancagem, baixa fricção.**

## 6. Strategic moves (M / L / XL)

Cards de maior fôlego. Cada linha "Por que vale" amarrada a um número, não a "melhor prática".

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| availability-1 | Availability, Fault Tolerance | M | Monitor + Exception Detection | Único caminho para medir MTTR de UI (hoje = "quando o analista liga"). Fecha R-1 e CC-1 no primeiro dia útil de observabilidade. |
| modifiability-3 | Modifiability, Testability | M | Split Module | `VisaoGeralTable.tsx` em 500 LOC (25% acima do p95=400); em 2–3 tweaks cruza 600; split reativo custa 5× o preventivo. |
| testability-2 | Testability, Fault Tolerance | M | Sandbox (defesa em camadas) | Adiciona 2º anel de teste (Playwright screenshot) para invariantes visuais; regressões de layout que jsdom não vê ganham gate automático. Fecha R-6. |
| modifiability-2 | Modifiability, Integrability | M | Abstract Common Services / Use an Intermediary | Ao 2º domínio (SISPAG/GED), promover `TruncatedText` unifica UX de truncamento cross-feature; sem isso, cada frente reinventa com variação sutil. |

Nenhum L ou XL emitido nesta rodada — o delta é presentacional e os débitos descobertos são
proporcionais.

## 7. O que está bem (e por quê)

Oito pontos onde o sistema **acerta** — âncora de credibilidade para o resto do relatório.

1. **Delta é aditivo puro com retrocompatibilidade 100%.** `Campo` ganhou `clamp?`/`title?` como
   opt-in; default `break-words` preservado; 46 call-sites pré-existentes intocados.
   *Tactic Bass:* **Refactor** + **Defer Binding** (Modifiability).
2. **Coerção defensiva em 3/3 call-sites: `?? '—'` no children e `?? undefined` no title.**
   O `Campo` só emite `title` quando `clamp` está ativo — nada de `title="null"` no DOM.
   *Tactic:* **Sanity Checking** + **Substitution** (Fault Tolerance).
3. **Segurança por escape automático de React.** Os dois sinks (text-node e atributo `title`)
   são JSX values; `dangerouslySetInnerHTML` = 0 em todo o `src/frontend`. Payload malicioso em
   nome de cliente sai como texto puro. *Tactic:* **Validate Input** / **Limit Exposure** (Security).
4. **Delta perf-neutro por construção.** +99/−10 linhas em 5 arquivos, 0 novos imports, 0 hooks,
   0 fetch. `React.memo(AbaAutomaticas)` continua efetivo (props do `title` reutilizam identidade
   referencial de `c.invoice.exportador`). *Tactic:* **Reduce Overhead** + **Maintain Multiple
   Copies of Computations** (Performance).
5. **2 testes de regressão determinísticos travam o contrato.** `line-clamp-2` aplicado + `title`
   presente com clamp; `break-words` + sem `title` sem clamp. Cobre ambos os ramos da nova API.
   *Tactic:* **Executable Assertions** + **Specialized Interfaces** (Testability).
6. **CI cacheia npm e pin de Node 24 no repo.** Build reproduzível para o job frontend, lockfile
   commitado. *Tactic:* **Reproducible Builds** (Deployability).
7. **Rollback do delta é trivial:** revert de 4 arquivos + testes; Vercel mantém deploys anteriores
   imutáveis. *Tactic:* **Rollback** (Deployability).
8. **Componente `Campo` respeita Rule of Three — não foi promovido prematuramente para o DS.**
   Só será promovido quando 2º domínio consumir (evita over-engineering hoje, evita duplicação
   amanhã). *Tactic:* **Abstract Common Services (diferida)** (Integrability).

## 8. Limitações da análise

Explicitadas para não vender cobertura que não temos:

- **Métricas declaradas não-medíveis localmente por 4+ agents:**
  - MTTR real da UI de Permutas em produção (requer Sentry/RUM que não existe).
  - `% sessions with JS error` em `/permutas` (mesmo).
  - Uptime / error-rate do backend Express (requer Render/CloudWatch, fora de scope=frontend).
  - Lead time real commit→prd Vercel (requer webhook Vercel + observabilidade externa).
  - First Load JS por rota (requer `next build` completo, fora do `--quick`).
  - Cobertura FE efetiva por diretório (`--coverage` pulado pelo `--quick`).
  - Truncamento visual real de `line-clamp-2` (jsdom não tem layout engine).
  - Distribuição real de tamanhos de `importador`/`exportador` em produção (requer amostra do Conexos).
  - Postura completa de Security backend (SSM, IAM, CORS, CloudTrail, GuardDuty, `npm audit`
    profundo) — declarada explicitamente fora de `scope=frontend`.
- **O que este pipe não cobre nesta rodada:**
  - Chaos engineering / injeção de falha em produção.
  - Threat modeling formal (STRIDE, LINDDUN).
  - Custo cloud (não há infra AWS provisionada — estado atual é Render + Vercel + Supabase).
  - Acessibilidade WCAG completa (DesignSystemReviewer capturou parcialmente em FUPs).
  - UX qualitativo além do que os testes de regressão travam.
- **Escopo declarado:** `scope=frontend`, `--quick`, `trigger=/feature-tweak permutas` puramente
  presentacional. Isto **não é** um audit completo do repo; é o gate proporcional a este delta.
  A regra 7 do template (P0/P1 exige baseline numérico) foi aplicada com rigor: nenhum P0/P1 foi
  emitido porque nenhum baseline numérico de impacto em produção pôde ser coletado neste escopo.
- **Janela temporal:** snapshot de `2026-07-22`. Refazer trimestralmente ou quando o scope mudar
  materialmente (ex.: primeiro `/feature-*` que toque backend / infra / SISPAG / GED).
- **Cards copiados verbatim das seções QA no KANBAN.md.** Nenhum foi renomeado ou reeditado
  pelo consolidator.

## 9. Ações recomendadas (30 dias)

Em ordem de execução. Nenhuma delas bloqueia o merge do delta clamp+tooltip.

1. **Mergear o delta.** Gate GREEN, 0 P0/P1, retrocompatibilidade 100%, testes verdes.
2. **Fechar os 3 quick wins de CI/pipeline (esforço combinado ~1 dia):** cards
   **deployability-1** (`npm run build` no job FE), **deployability-2** (`npm audit --audit-level=high`
   no job FE), **performance-1** (baseline First Load JS registrada em PR). Fecha R-2 e R-8 e
   passa a ter medição contínua de bundle e SCA no PR.
3. **Documentar o proxy do jsdom para `line-clamp` — card testability-1 (S).** Evita que o próximo
   dev troque `line-clamp-2` por `truncate` pensando que o teste blinda o corte.
4. **Endereçar CC-1 (observabilidade FE) no próximo `/feature-new` de qualquer frente:** cards
   **availability-1** (Sentry + ErrorBoundary, M) + **testability-2** (Playwright piloto, M).
   Juntos entregam MTTR mensurável + 2º anel de teste.
5. **Colocar `modifiability-3` (split preventivo do `VisaoGeralTable.tsx`) na fila:** dispara na
   próxima `/feature-tweak` que toque o arquivo. Não fazer agora; agendar.

Cards restantes (P3 e S/M gatilhados por 2º domínio) ficam em backlog frio até haver gatilho
natural.
