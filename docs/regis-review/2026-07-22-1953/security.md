---
qa: Security
qa_slug: security
run_id: 2026-07-22-1953
agent: qa-security
generated_at: 2026-07-22T19:56:25Z
scope: frontend
score: 8
findings_count: 1
cards_count: 1
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Ator externo (analista logado ou atacante que consiga injetar dados em Conexos) | Nome de Cliente/Exportador contém payload malicioso (`<script>`, `"><img onerror=…`) e é renderizado pelos painéis de detalhe de Permutas via `Campo` (texto + atributo `title`) | Componente `Campo` (`src/frontend/app/permutas/components/ui.tsx`) e chamadores em `AbaAutomaticas`, `VisaoGeralTable`, `AlocarDialog` | Produção, usuário autenticado navegando na tela de Permutas | O valor é escapado por React tanto no text-node quanto no atributo `title` — nenhum HTML/JS é executado; o clamp corta visualmente, tooltip mostra a string literal | 0 execução de HTML/JS injetado; 0 novo uso de `dangerouslySetInnerHTML`; texto renderizado como texto puro em 100% dos call-sites |

Escopo do gate: mudança **puramente presentacional** (`line-clamp-2` + `title` nativo). Não altera autenticação, autorização, secrets, IAM ou boundaries de rede. Bloco de superfícies backend/infra/IAM/SSM/CORS/CSRF é declarado explicitamente **não medível** neste run (scope=frontend, delta CSS).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Novos usos de `dangerouslySetInnerHTML` no delta | 0 | 0 | ✅ | `git diff main -- src/frontend \| grep dangerouslySetInnerHTML` |
| Ocorrências totais de `dangerouslySetInnerHTML` no frontend | 0 | 0 | ✅ | `grep -rn "dangerouslySetInnerHTML\\|innerHTML" src/frontend` |
| Novos usos de `eval` / `new Function` / `setTimeout(string,…)` no delta | 0 | 0 | ✅ | `git diff main -- src/frontend \| grep -E "eval\\\|new Function"` |
| Sinks de string HTML crua no delta (title/text) | 2 sinks (atributo `title`, text-node em `<dd>`) — ambos escapados por React | 100% escapado | ✅ | Leitura `ui.tsx:207-216` (JSX text + JSX attr — escape automático) |
| Fontes dos dados exibidos (Cliente/Exportador) | Campos vindos do backend Conexos (`c.invoice.importador`, `c.invoice.exportador`, `alocandoAtual.exportador`, `inv.importador`, `p.importador`, …) — strings arbitrárias, não sanitizadas na origem | Tratar como untrusted no rendering | ✅ (React escapa) | `AbaAutomaticas.tsx:184-188`, `VisaoGeralTable.tsx:136-152,264-268`, `AlocarDialog.tsx:110-112` |
| Novos campos sensíveis expostos ao cliente | 0 (mesmos campos já renderizados antes; apenas ganharam `title=` com o mesmo valor) | 0 novos | ✅ | Diff `AbaAutomaticas.tsx`, `VisaoGeralTable.tsx`, `AlocarDialog.tsx` |
| Novas dependências npm introduzidas | 0 | 0 | ✅ | `git diff main -- src/frontend/package.json` (sem alteração) |
| Testes de regressão presentacional cobrindo o novo caminho | 2 novos casos (`permutas-components.test.tsx`) — validam presença do atributo `title` e classe `line-clamp-2` | ≥1 | ✅ | `_shared-metrics.md` (delta) + `git diff main -- src/frontend/__tests__/permutas-components.test.tsx` |
| Cobertura de auth/RBAC do endpoint que popula esses dados | ⚠️ Não medível | — | ⚠️ | Backend fora de escopo (scope=frontend) |
| SSM SecureString / IAM least-privilege / CORS / CloudTrail / GuardDuty | ⚠️ Não medível | — | ⚠️ | Não há `infra/`/Terraform hoje (estado Render/Vercel, ver `_shared-metrics.md`) — CLAUDE.md marca camada como **alvo** |
| Hardcoded secrets no delta | 0 | 0 | ✅ | Diff dos 5 arquivos alterados — apenas JSX/props |
| `.env` / `terraform.tfstate` versionados no delta | 0 | 0 | ✅ | `git diff main --stat` (só `.tsx` + 1 `.md` de inbox) |

> ⚠️ **Não medível localmente / fora de escopo**: postura completa de secret-hygiene, autorização de backend, IAM per-Lambda, CORS de API Gateway, CloudTrail/GuardDuty, `npm audit` (flag `--quick`). Requerem scope=backend/infra e/ou credenciais AWS. Recomendação: rodar seção Security completa quando um `/feature-*` tocar backend ou (quando existir) `infra/`.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Fora do delta; não afetado — `Campo` não é ponto de detecção | N/A (delta CSS) | — |
| Detect Service Denial | Fora do delta | N/A | — |
| Verify Message Integrity | Fora do delta (payload do backend não é assinado; nenhuma mudança introduzida) | N/A | — |
| Detect Message Delay | Fora do delta | N/A | — |
| Identify Actors | Frontend usa `AuthProvider` (NextAuth+Supabase coexistem — dívida herdada, não tocada por este delta) | ⚠️ parcial (pré-existente) | `src/frontend/components/AuthProvider.tsx` (não alterado; lint-warning pré-existente citado em `_shared-metrics.md`) |
| Authenticate Actors | idem acima — sem mudança | ⚠️ parcial (pré-existente, fora de escopo) | idem |
| Authorize Actors | Sem RBAC granular por linha visível no frontend; delta não modifica gating | ⚠️ parcial (pré-existente, fora de escopo) | — |
| Limit Access | Fora do delta | N/A | — |
| Limit Exposure | Delta **não expõe novos campos**: os valores `importador` e `exportador` já eram exibidos como text-node antes; agora também aparecem no atributo `title` da mesma `<dd>`, com **conteúdo idêntico**. Superfície de exposição inalterada. | ✅ presente | `ui.tsx:210` (`title={clamp ? title : undefined}`) — só espelha o children |
| Encrypt Data | Fora do delta (TLS termina antes do FE) | N/A | — |
| Separate Entities | Fora do delta | N/A | — |
| Change Default Settings | `clamp` é opt-in (default `undefined` → comportamento antigo preservado); `title` só é setado quando `clamp` está ativo — nenhum default inseguro introduzido | ✅ presente | `ui.tsx:197-217` |
| Validate Input | Este delta **renderiza** dados vindos do backend Conexos; não é boundary de entrada. React escapa automaticamente o text-node e o valor do atributo `title` (ambos JSX values, não HTML crua). Nenhum `dangerouslySetInnerHTML` no delta nem no frontend. | ✅ presente (escape automático) | Grep `dangerouslySetInnerHTML` → 0 no `src/frontend` |
| Revoke Access | Fora do delta | N/A | — |
| Lock Computer | Fora do delta | N/A | — |
| Inform Actors | Fora do delta | N/A | — |
| Audit Trail | Fora do delta (não há ação state-mutating) | N/A | — |
| Restore | Fora do delta | N/A | — |

## 4. Findings (achados)

### F-security-1: Postura completa de secret-hygiene / IAM / CORS / auth backend não é medível neste run

- **Severidade**: P3 (informativo — declaração de escopo, não uma vulnerabilidade)
- **Tactic violada**: — (não é violação; é limite de medição)
- **Localização**: N/A
- **Evidência (objetiva)**:
  ```
  scope=frontend, flag=--quick, delta puramente presentacional (5 arquivos .tsx + 1 .md).
  Não há `infra/`/Terraform no repo (estado Render/Vercel — CLAUDE.md marca camada como alvo).
  Backend Express legado fora do delta.
  ```
- **Impacto técnico**: gates futuros de features que toquem backend/infra precisam rodar Security com scope apropriado — este run **não** cobre secret-hygiene, IAM least-privilege, CORS, CloudTrail/GuardDuty ou `npm audit`.
- **Impacto de negócio**: nenhum imediato; apenas evita falsa sensação de cobertura total do QA Security no roadmap.
- **Métrica de baseline**: 0 métricas de backend/infra coletadas neste run (esperado — scope=frontend).

## 5. Cards Kanban

### [security-1] Rodar Regis-Review Security em scope=backend na próxima feature que tocar handlers/SSM/IAM

- **Problema**
  > Este gate ficou legitimamente restrito a scope=frontend porque o delta é CSS + atributo `title`. As categorias-alvo do QA Security no financeiro (SSM SecureString discipline, IAM per-Lambda, CORS de API Gateway, CloudTrail/GuardDuty, `npm audit` profundo, autz server-side de writes que movem dinheiro) permanecem **não medidas** no run 2026-07-22-1953. Como o financeiro é multi-tenant e executa remessas SISPAG e permutas em Conexos, uma feature futura que toque esses caminhos deve fechar essa lacuna com um Regis-Review Security dedicado, não com este.

- **Melhoria Proposta**
  > Quando o próximo `/feature-new` ou `/feature-tweak` tocar `src/backend/`, uma integração externa (Conexos/Nexxera/GED/SharePoint) ou (quando existir) `infra/tenants/`, o Regis-Review deve rodar com `scope=backend` (ou `scope=all`) e **sem** `--quick`, para exercitar as tactics **Authenticate Actors**, **Authorize Actors**, **Limit Access**, **Limit Exposure**, **Validate Input** e **Audit Trail** com as métricas de secret-hygiene, IAM, CORS e `npm audit` que estão ausentes aqui.

- **Resultado Esperado**
  > Cobertura Security do financeiro deixa de ser apenas presentacional. Métricas mínimas cobertas na próxima janela: `# hardcoded secrets` (target 0), `% credential params em SecureString` (target 100%), `# routes com authorizer explícito` (target 100% exceto `/health`), `# IAM policies com Action:"*"/Resource:"*"` (target 0), `npm audit` critical=0 / high=0.

- **Tactic alvo**: Limit Exposure (blast radius multi-tenant)
- **Severidade**: P3
- **Esforço estimado**: S (é orquestração de gate, não implementação)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Métricas de Secret Hygiene / IAM / CORS coletadas neste run: 0 → ≥6 no run scope=backend
  - `dangerouslySetInnerHTML` no `src/frontend`: 0 → 0 (manter)
- **Risco de não fazer**: postura de segurança do multi-tenant continua sem baseline auditável; um incidente (credencial Conexos ou Nexxera vazando via IAM larga, ou payload não validado atingindo o gerador de remessa) fica descoberto até o próximo pen-test.
- **Dependências**: existência de uma feature backend/infra no próximo ciclo (organicamente disparada pelo pipeline).

## 6. Notas do agente

- **Escopo consciente**: o delta é CSS (`line-clamp-2`) + tooltip nativo (`title=`). Os dois novos sinks (text-node no `<dd>` e valor do atributo `title`) são JSX values — React aplica escape automático em ambos, e o grep confirmou zero `dangerouslySetInnerHTML` no frontend inteiro. Não fabriquei achado de XSS onde não há: o valor exibido no `title` é **o mesmo** já exibido como children antes do delta, então a superfície de exposição é rigorosamente igual.
- **Downgrade explícito**: F-security-1 é P3 (não P0/P1) porque, conforme regra do template, P0/P1 exigem baseline numérico e este achado é declaração de escopo, não vulnerabilidade.
- **Cross-QA**: nada de segurança flui daqui para Fault Tolerance/Availability/Integrability/Deployability neste run — o consolidator pode marcar Security como "PASS sem achados acionáveis; débito de cobertura registrado como card informativo".
- **Métrica não coletada por --quick**: `npm audit` do frontend não foi executado (flag `--quick` no `_shared-metrics.md`). Sem impacto para o delta CSS, mas registrar para o próximo run scope=frontend sem `--quick`.
