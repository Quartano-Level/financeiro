---
qa: Availability
qa_slug: availability
run_id: 2026-07-22-1953
agent: qa-availability
generated_at: 2026-07-22T19:55:43Z
scope: frontend
score: 8
findings_count: 2
cards_count: 2
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Usuário analista (Frente I — Permutas) | Backend/API de Permutas indisponível ou lenta durante navegação nos painéis Cliente/Exportador (após o tweak de `line-clamp-2` + tooltip) | Frontend Next.js — componentes `Campo` (ui.tsx), `AbaAutomaticas`, `VisaoGeralTable`, `AlocarDialog` | Operação normal (produção Vercel), pico de fechamento mensal | UI mantém estado renderizado, exibe feedback de erro/loading, não trava a tela, não perde dados de seleção; tooltip nativo (`title`) continua acessível mesmo com dados parciais | 0 telas brancas por falha da API; degradação visível ao usuário (skeleton/erro) em ≤2s; nenhum estado local perdido em recarga parcial |

> Nota: o delta em revisão é **puramente presentacional** (line-clamp + tooltip nativo). Não altera fetch, cache, roteamento nem side-effects. O cenário acima é o cenário-guarda-chuva da UI de Permutas; a análise deve ser proporcional à mudança.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| FE typecheck | 0 erros | 0 erros | ✅ | `_shared-metrics.md` (`npm run typecheck`) |
| FE lint | 0 errors, 8 warnings (pré-existentes, fora do delta) | 0 errors | ✅ | `_shared-metrics.md` (`npm run lint`) |
| FE test | 88/88 (17 suites) | 100% pass | ✅ | `_shared-metrics.md` (`npm test`) |
| Testes de regressão do delta (`__tests__/permutas-components.test.tsx`) | 2 novos (clamp + tooltip) | ≥1 por prop opt-in | ✅ | `_shared-metrics.md` |
| Arquivos de código no delta | 4 (`ui.tsx`, `AbaAutomaticas.tsx`, `VisaoGeralTable.tsx`, `AlocarDialog.tsx`) | — | ℹ️ | `_shared-metrics.md` |
| Mudanças em fetch/side-effects/roteamento | 0 | 0 (delta presentacional) | ✅ | Inspeção do delta (`_shared-metrics.md`) |
| Frontend test files | 202 | — | ℹ️ | `_shared-metrics.md` |

Métricas não-medíveis no escopo deste gate:

> ⚠️ **Não medível localmente**: MTTR real da UI de Permutas em produção. Requer telemetria (Vercel Analytics + Sentry / RUM) que não faz parte do delta. Recomendação: instrumentar `window.onerror` + Error Boundary com envio a Sentry para medir taxa de tela branca (`% sessions with crash`) por rota (`/permutas`).

> ⚠️ **Não medível localmente**: uptime/erro-rate do backend que serve `/permutas` (fluxos de listagem automática, N:M, alocação). Requer CloudWatch/Render metrics — fora do scope=frontend deste gate.

> ⚠️ **Não medível localmente**: cobertura de retry/fallback/timeout em clients HTTP do frontend. Requer inspeção dos módulos `services/`/`lib/api` do FE, fora do delta. Recomendação: em gate futuro com scope=frontend mais amplo, mapear `% de chamadas fetch com timeout/AbortController explícito`.

> ⚠️ **Não medível localmente (fora de scope)**: DLQ SQS, idempotência, dashboards CloudWatch, blast radius multi-tenant — todos backend/infra. Estado atual do repo é Express + Render/Vercel (sem `infra/` Terraform, sem SQS, sem contas AWS por cliente), então tactics de Availability de backend não têm superfície mensurável neste gate.

## 3. Tactics — Cobertura no nf-projects

Contexto: escopo = **frontend**. Tactics de infraestrutura/servidor são avaliadas apenas para o que a UI observa/expõe; o restante é `N/A` com justificativa explícita.

### Detect Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | Ausente no delta e não visível no FE (não há healthcheck exposto ao usuário) | ⚠️ parcial | Delta presentacional; sem instrumentação nova |
| Heartbeat | Ausente no FE — sem polling de status de sessão/backend visível | ❌ ausente | Inspeção do delta |
| Monitor | Sem RUM/Sentry mapeado neste delta | ❌ ausente | `_shared-metrics.md` — nenhum client de telemetria adicionado |
| Timestamp | N/A para delta puramente presentacional (sem ordenação/consistência temporal introduzida) | N/A | — |
| Sanity Checking | `Campo` é robusto a `undefined`/string longa (clamp encobre, `title` opcional) | ✅ presente | `src/frontend/app/permutas/components/ui.tsx` (props `clamp?`, `title?` opt-in, default preservado) |
| Condition Monitoring | N/A no FE — não há watcher de invariantes | N/A | — |
| Voting | N/A (não há redundância de fonte na UI) | N/A | — |
| Exception Detection | Sem Error Boundary novo introduzido no delta; existência de boundary global não verificada neste scope reduzido | ⚠️ parcial | Delta não toca boundaries |
| Self-Test | N/A no FE de Permutas | N/A | — |

### Recover from Faults — Preparation & Repair

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | N/A (frontend estático servido por Vercel — redundância é responsabilidade do provider) | N/A | — |
| Passive Redundancy | N/A (idem) | N/A | — |
| Spare | N/A | N/A | — |
| Exception Handling | Delta não introduz try/catch; não regride handling existente | ⚠️ parcial | Delta presentacional |
| Rollback | Rollback do delta é trivial (revert 4 arquivos + testes); Vercel mantém deploys anteriores | ✅ presente | Vercel deploys imutáveis (padrão da plataforma) |
| Software Upgrade | N/A no delta | N/A | — |
| Retry | Não introduzido; `RetryExecutor` é primitivo de backend (fora de scope) | ⚠️ parcial | `src/backend/domain/libs/executor/` — não usado no FE |
| Ignore Faulty Behavior | Tooltip nativo (`title`) é tolerante: se o dado vier vazio, o browser simplesmente não exibe tooltip — não quebra render | ✅ presente | `src/frontend/app/permutas/components/ui.tsx` — `title?` opcional |
| Degradation | Com `clamp` ativo, texto excedente é truncado visualmente mas preserva conteúdo semântico via `title` — degradação graciosa | ✅ presente | `ui.tsx` (`line-clamp-2` + `title`) |
| Reconfiguration | N/A no FE | N/A | — |

### Recover from Faults — Reintroduction

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | N/A | N/A | — |
| State Resynchronization | N/A — delta não altera estado local; se houver reload, componentes re-hidratam a partir de props do servidor | N/A | Delta presentacional |
| Escalating Restart | N/A no FE | N/A | — |
| Non-Stop Forwarding | N/A | N/A | — |

### Prevent Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | N/A no FE | N/A | — |
| Transactions | N/A no FE (transações ficam no backend) | N/A | — |
| Predictive Model | N/A | N/A | — |
| Exception Prevention | `Campo` com props opt-in e default preservado (`break-words`) evita regressão em call-sites antigos → previne quebra visual em telas não migradas | ✅ presente | `ui.tsx` — props `clamp?`, `title?` são opt-in |
| Increase Competence Set | Testes de regressão (`__tests__/permutas-components.test.tsx`, +2 casos) travam o contrato clamp/tooltip | ✅ presente | `_shared-metrics.md` — 2 testes novos, 88/88 verde |

## 4. Findings (achados)

### F-availability-1: Ausência de instrumentação RUM/Error Boundary observável no frontend de Permutas

- **Severidade**: P2 (débito técnico defensável — não bloqueia o delta presentacional; sem baseline numérico de tela branca em produção coletável localmente, não pode subir para P1)
- **Tactic violada**: Monitor / Exception Detection
- **Localização**: escopo geral do FE — nenhum arquivo do delta introduz nem depende de RUM; sem evidência de Sentry/DataDog RUM no `package.json` do FE (`src/frontend/package.json`, 23 deps / 17 devDeps, ver `_shared-metrics.md`)
- **Evidência (objetiva)**:
  ```
  _shared-metrics.md: "Frontend deps / devDeps | 23 / 17"
  Nenhum client de telemetria de erro visível no delta.
  ```
- **Impacto técnico**: falhas de render (ex.: props inesperadas em `Campo`, erros em componentes irmãos) ficam invisíveis até um usuário reportar — MTTR de UI depende de canal humano.
- **Impacto de negócio**: analista da Frente I pode operar com tela quebrada por horas antes do time saber; risco de decisão de Permuta baseada em dado parcial não observado.
- **Métrica de baseline**: `% sessions with JS error` = **não medível localmente** (requer Sentry/RUM em produção). Sem baseline, severidade fica em P2 por regra do template.

### F-availability-2: `Campo` com `clamp` esconde texto sem garantia semântica quando `title` não é passado

- **Severidade**: P3 (melhoria opcional — o delta manteve default seguro e passou `title` em todos os 4 call-sites migrados)
- **Tactic violada**: Degradation / Sanity Checking
- **Localização**: `src/frontend/app/permutas/components/ui.tsx` (componente `Campo`, props `clamp?` e `title?`)
- **Evidência (objetiva)**:
  ```
  Props são independentes: um call-site futuro pode passar `clamp` sem `title`,
  truncando visualmente sem preservar o conteúdo original em nenhum lugar acessível.
  Delta atual não regride (todos os 4 call-sites migrados passam ambas as props),
  mas o contrato do componente permite o uso degradado.
  ```
- **Impacto técnico**: regressão futura em outro painel pode truncar CNPJ/razão social sem tooltip → dado inacessível ao analista.
- **Impacto de negócio**: risco baixo, contido a novos call-sites; testes de regressão do delta atual travam Cliente/Exportador em Permutas.
- **Métrica de baseline**: 0 call-sites atuais em uso degradado (todos passam `title` junto com `clamp`). Baseline = 0 → severidade P3.

## 5. Cards Kanban

### [availability-1] Instrumentar RUM/Error Boundary no frontend (Sentry ou equivalente)

- **Problema**
  > O frontend de Permutas (e demais rotas) não expõe métrica de erro em produção observável ao time. Falhas de render, exceções não capturadas e regressões visuais como a que motivou o delta atual (`line-clamp-2` + tooltip) só chegam por canal humano do analista da Columbia.

- **Melhoria Proposta**
  > Adicionar client de RUM (Sentry recomendado, alinhado ao stack Next.js + Vercel) com Error Boundary de rota em `src/frontend/app/permutas/layout.tsx` (e demais rotas críticas). Instrumentar `Monitor` (Bass) via `Sentry.init` + `Sentry.captureException` no boundary. Enviar release tag pareada com o bump lockstep FE/BE.

- **Resultado Esperado**
  > Após 1 semana em produção, dashboard Sentry exibe `% sessions with error` por rota. MTTR da UI passa a depender de alerta automático, não de reporte manual.

- **Tactic alvo**: Monitor + Exception Detection
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-availability-1
- **Métricas de sucesso**:
  - `% sessions with JS error` em `/permutas`: **não medível hoje** → baseline coletado em ≤7d após deploy
  - Tempo entre erro em produção e ciência do time: **desconhecido** → ≤5min via alerta Sentry
- **Risco de não fazer**: seguir dependendo de reporte manual do analista; regressões visuais/JS podem passar despercebidas por dias, minando confiança na plataforma.
- **Dependências**: definição de plano Sentry (custo) com o time de plataforma.

### [availability-2] Reforçar contrato do `Campo` para acoplar `clamp` a `title` (ou fallback documentado)

- **Problema**
  > O componente `Campo` em `src/frontend/app/permutas/components/ui.tsx` aceita `clamp?` e `title?` como props independentes. Um call-site futuro pode ativar `clamp` sem `title`, truncando dado sem preservação semântica — regressão silenciosa da tactic Degradation.

- **Melhoria Proposta**
  > Duas opções: (a) tipar `clamp` como discriminated union exigindo `title` (`{ clamp: true; title: string } | { clamp?: false }`), OU (b) manter opcional mas, quando `clamp && !title`, usar o próprio `children` (string) como fallback de `title` dentro do componente. Adicionar teste de regressão que falhe se `clamp` for passado sem `title` no contrato tipado.

- **Resultado Esperado**
  > Impossível (via TypeScript) truncar texto em `Campo` sem preservar conteúdo acessível via tooltip. Contrato reforça Sanity Checking + Degradation em nível de tipo.

- **Tactic alvo**: Degradation + Sanity Checking + Exception Prevention
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-availability-2
- **Métricas de sucesso**:
  - Call-sites de `Campo` com `clamp` sem `title`: 0 atual → 0 garantido por tipo
  - Testes de regressão: 2 atuais → 3 (novo caso: contrato tipado)
- **Risco de não fazer**: baixo — contido a novos call-sites; risco cresce à medida que outras telas adotarem `clamp`.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo do gate é `frontend` e o delta é puramente presentacional — a análise de Availability foi mantida proporcional. Tactics de infra/backend foram marcadas `N/A` com justificativa ou declaradas não-medíveis, não inventadas.
- Nenhum P0/P1 foi emitido: não há baseline numérico de produção coletável neste gate (`--quick`, scope=frontend, sem CloudWatch/Sentry). Pela regra 7 do template, P0/P1 sem número deve ser rebaixado — foi.
- Cross-QA: `availability-1` (Monitor/RUM) tem sobreposição natural com `qa-testability` (observabilidade em produção) e `qa-security` (captura de erros pode vazar PII — precisa `beforeSend` scrub). Sinalizar ao `qa-consolidator`.
- Delta em si (line-clamp + tooltip) é neutro-a-positivo para Availability: adiciona Degradation graciosa e Ignore Faulty Behavior (tooltip vazio não quebra), sem regressão de fluxo.
