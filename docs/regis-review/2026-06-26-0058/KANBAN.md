---
type: regis-review-kanban
run_id: 2026-06-26-0058
total: 66
counts: { p0: 7, p1: 37, p2: 19, p3: 3 }
---

# Kanban — financeiro — 2026-06-26-0058

> Importável para o Kanban do time. Cada card abaixo tem Problema / Melhoria Proposta / Resultado Esperado.
> Ordem: P0 (S → XL), depois P1, P2, P3.
> Cards marcados **"[CONSOLIDÁVEL]"** podem ser executados como uma task force única — ver REPORT §3.

---

## P0 — Crítico

### [performance-1] Capar concorrência em `AlocacaoPermutasService.buscarInvoices` com `BoundedConcurrency`

**QA**: Performance
**Tactic alvo**: Increase Concurrency (bounded) + Limit Event Response
**Esforço**: S
**Findings**: F-performance-1

**Problema**
> `buscarInvoices` faz `Promise.all` uncapped sobre todas as invoices do processo (3 endpoints Conexos por invoice). Um processo com 30 invoices dispara 60+ chamadas simultâneas → risco real de `LOGIN_ERROR_MAX_SESSIONS`. A Eleição já resolveu o mesmo padrão com `BoundedConcurrency.map(...,10)`; este path foi esquecido.

**Melhoria Proposta**
> Injetar `BoundedConcurrency` em `AlocacaoPermutasService` e substituir o `Promise.all(todas.map(...))` por `boundedConcurrency.map(todas, worker, ADIANTAMENTOS_CONCURRENCY)`. Extrair a constante `ADIANTAMENTOS_CONCURRENCY=10` para um módulo compartilhado (`ConexosConcurrency.ts`).

**Resultado Esperado**
> Chamadas Conexos em voo no pior caso: `1 + 2N` → ≤ 10. Erros `LOGIN_ERROR_MAX_SESSIONS` originados da busca de invoices: indeterminado → 0.

**Métricas de sucesso**
- Chamadas Conexos em voo (pico): `1 + 2N` → ≤ 10
- Taxa de erro `MaxSessions` na rota `/permutas/invoices/buscar` em 7d: medir → 0

**Risco de não fazer**: Fase 2 (alocação manual cross-process, ADR-0008) inviável para processos com >15 invoices; analista volta ao ERP.
**Dependências**: Nenhuma.

---

### [deployability-1] Programar rollback one-command para o pipeline de escrita ERP (`fin010`)

**QA**: Deployability
**Tactic alvo**: Rollback
**Esforço**: L
**Findings**: F-deployability-1

**Problema**
> Após `v0.5.0`/`v0.6.0`/`v0.8.0`, o sistema escreve no `fin010` em produção. Não existe rollback programático: regressão de código exige `git revert` + rebuild Render (~5 min), e baixa errada exige estorno manual na UI do Conexos. `docs/runbooks/fin010-write-cutover.md:36-40` reconhece "não há rollback automático".

**Melhoria Proposta**
> 1) Workflow `rollback.yml` (`workflow_dispatch`) que aceita `commit_sha` e dispara Render Deploy Hook + verifica `/health.version`. 2) `EstornoLoteService` (`@injectable`) que itera `permuta_alocacao_execucao` por `bor_cod` recente e dispara `POST /fin010/estornar/{borCod}` (reusar `BorderoGestaoService`). 3) Runbook "Rollback de janela" (BE + estornos do período).

**Resultado Esperado**
> Rollback de código ≤ 2 min (one-command); rollback de baixas em lote ≤ 5 min/borderô (programático em vez de 30 min/par manual).

**Métricas de sucesso**
- MTTR rollback de código: ~5 min → ≤ 2 min
- MTTR rollback de baixa errada: >30 min/par → ≤ 5 min/borderô (lote)
- # de runbooks de rollback: 0 → 1

**Risco de não fazer**: incidente de dupla baixa ou borderô errado custa horas de operação + reconciliação manual + possível exposição contábil.
**Dependências**: Nenhuma — `BorderoGestaoService` (v0.6.0) já implementa o estorno individual.

---

### [performance-2] Eliminar fan-out quadrático no auto-alocar — passar invoices já buscadas para `alocar`

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: M
**Findings**: F-performance-2, F-performance-1

**Problema**
> `criarRascunhosAtomico` chama `alocar` em loop; cada `alocar` re-executa `buscarInvoices(priCod, filCod)` LIVE (que já é O(N) em chamadas Conexos). Para um adto com N invoices: `N × (1+2N)` chamadas — quadrático. N=10 → 210; N=30 → 1830. Estoura cap de sessão.

**Melhoria Proposta**
> Refatorar `alocar` em dois métodos: (a) `validarEAlocar(input, invoice)` puro (recebe a invoice já hidratada); (b) `alocar(input)` (legado: busca + valida). `autoAlocarSeElegivel` chama `buscarInvoices` uma vez e passa a invoice hidratada para `validarEAlocar` no loop.

**Resultado Esperado**
> Chamadas Conexos por auto-alocação de N=10: **210 → 21** (×10). Para N=30: **1830 → 61** (×30).

**Métricas de sucesso**
- Chamadas Conexos por auto-alocação (N=10): 210 → ≤ 21
- Taxa de falha `MaxSessions` em `POST /reconciliar` com auto-alocar: medir 7d → 0

**Risco de não fazer**: Regra "Baixar = auto-aloca múltipla automática" (2026-06-24) só funciona para processos com ≤ 3–4 invoices.
**Dependências**: idealmente após performance-1.

---

### [testability-2] Cobrir `PermutaExecucaoRepository` (idempotência da baixa Conexos) com pelo menos 1 teste por método público

**QA**: Testability
**Tactic alvo**: Executable Assertions + Specialized Interfaces
**Esforço**: M
**Findings**: F-testability-2

**Problema**
> 21 métodos públicos no único repositório que guarda o write-ahead da baixa no ERP `fin010` (`PermutaExecucaoRepository.ts:1-441`). 10 `it()` blocks → ~11 métodos sem assertion. Cobertura 49.36% stmts / 30.76% branches / 28.57% funcs / 51.42% lines. Métodos não-cobertos incluem `deleteByBorCod`, `updateBorderoCacheSituacao`, `replaceBorderoCache` — escrita destrutiva.

**Melhoria Proposta**
> Para cada método público sem teste: `it()` validando SQL parametrizado, mapeamento camelCase ↔ snake_case e retorno. Threshold por diretório `./domain/repository/`: lines 85 / branches 70 / functions 85.

**Resultado Esperado**
> Cobertura `PermutaExecucaoRepository.ts` 49.36% → ≥ 85% stmts; 30.76% → ≥ 70% branches.

**Métricas de sucesso**
- Stmts: 49.36% → ≥ 85%
- Branches: 30.76% → ≥ 70%
- Funcs: 28.57% → ≥ 85%
- `it()` blocks: 10 → ≥ 21

**Risco de não fazer**: bug de UPSERT em `permuta_alocacao_execucao` permite dupla-baixa no Conexos; auditoria contábil precisa reabrir exercício.
**Dependências**: Nenhuma.

---

### [modifiability-2] Quebrar `ConexosClient` em sub-clients por área de entidade  **[CONSOLIDÁVEL com integrability-1, testability-8 — CC-2]**

**QA**: Modifiability
**Tactic alvo**: Split Module · Increase Semantic Coherence · Use an Intermediary
**Esforço**: L
**Findings**: F-modifiability-2

**Problema**
> `ConexosClient.ts` tem 1956 LOC, 26 public methods cobrindo 9 áreas-entidade. Services injetam o cliente inteiro mesmo precisando de 1–2 métodos; testes do client são gigantescos; SISPAG vai adicionar 10–15 métodos e estourar a classe.

**Melhoria Proposta**
> Extrair `ConexosBorderoClient`, `ConexosBaixaClient`, `ConexosTituloClient`, `ConexosAdiantamentoClient`, `ConexosInvoiceClient`, `ConexosFinanceiroClient`, `ConexosProcessoClient`, `ConexosFilialClient`. Manter `ConexosClient` apenas como infra de sessão/transporte. Cada sub-client `@injectable`, ≤ 300 LOC.

**Resultado Esperado**
> Service injeta só o sub-client que usa (ISP); SISPAG nasce com `SispagPagamentoClient` próprio; risco arquitetural #1 isolado em `ConexosBaixaClient` + `ConexosBorderoClient`.

**Métricas de sucesso**
- LOC `ConexosClient.ts`: 1956 → ≤ 400 (só transport)
- Public methods por sub-client: 26 → ≤ 8
- Áreas-entidade por classe: 9 → 1

**Risco de não fazer**: 3000+ LOC quando SISPAG entrar; gargalo de review permanente.
**Dependências**: registrar tokens novos no `appContainer`.

---

### [modifiability-1] Quebrar `page.tsx` (2971 LOC) em rota raiz + sub-páginas por aba  **[CONSOLIDÁVEL com performance-5, testability-1 — CC-1]**

**QA**: Modifiability
**Tactic alvo**: Split Module · Increase Semantic Coherence
**Esforço**: XL
**Findings**: F-modifiability-1

**Problema**
> A página `/permutas` é um componente de 2971 LOC com 35 useState, 39 referências a Dialog/Modal e 25 referências a Tabs. Qualquer mudança em uma aba recarrega mentalmente o arquivo inteiro; testes de componente impraticáveis (cobertura frontend = 20% lines); merges de features paralelas (v0.7.0) conflitaram aqui.

**Melhoria Proposta**
> Extrair cada aba para `app/permutas/<tab>/page.tsx` (`automaticas`, `manual`, `ingestao`, `borderos`, `relatorios`), usar `app/permutas/layout.tsx` para o shell; isolar modais em `app/permutas/_modals/*`; hoistar estado de filtro para `PermutasFiltroProvider` (context). Cada sub-página ≤ 500 LOC.

**Resultado Esperado**
> Cada aba editável isoladamente; cobertura por componente sobe; conflito por merge → 1 arquivo por feature.

**Métricas de sucesso**
- LOC do maior `page.tsx`: 2971 → ≤ 500
- useState count: 35 → ≤ 10 por componente
- Modais inline: 39 → 0
- Cobertura de componente frontend (lines): 20% → ≥ 50%

**Risco de não fazer**: a v0.9.x (SISPAG vai querer aba própria) vira ramo conflituoso por padrão; tempo de PR review > 1 dia útil.
**Dependências**: Nenhuma.

---

### [testability-1] Quebrar `app/permutas/page.tsx` e testar os sub-componentes  **[CONSOLIDÁVEL com modifiability-1, performance-5 — CC-1]**

**QA**: Testability
**Tactic alvo**: Limit Structural Complexity + Specialized Interfaces
**Esforço**: XL
**Findings**: F-testability-1, F-testability-7

**Problema**
> Um único componente React de 2971 LOC com 36 hooks (`page.tsx:1-2971`) e `BorderosPanel.tsx:1-683` concentra toda a UI da feature crítica em produção. Cobertura: 0/0/0/0. Threshold do CI rebaseado para 20 lines / 9 branches / 14 functions admitindo o problema.

**Melhoria Proposta**
> Extrair em componentes testáveis: `PermutasTable`, `IngestaoModal`, `AlocacaoModal`, `RelatoriosPanel`, `RunsAuditModal`, `BorderoCard`. Lógica fora de JSX vira hook custom. `__tests__/permutas/<componente>.test.tsx` com Testing Library. Subir threshold para lines 50 / branches 30 / functions 40 ao final.

**Resultado Esperado**
> Cobertura `app/permutas/` 0% → 50% lines; `page.tsx` reduzido de 2971 para < 800 LOC; ≥ 6 arquivos de teste de componente novos.

**Métricas de sucesso**
- `page.tsx` LOC: 2971 → < 800
- Cobertura lines `app/permutas/`: 0% → ≥ 50%
- Threshold `jest.config.js` lines: 20 → 50
- Arquivos de teste de componente novos: 0 → ≥ 6

**Risco de não fazer**: regressão silenciosa em fluxos de baixa, alocação N:M e finalização de borderô (vide caso `borderô-finalizar` Stage B ainda aberto).
**Dependências**: Nenhuma; primeiro passo do plano FE.

---

## P1 — Alto

### [availability-1] Hardenizar `/health` com probe real de DB e prontidão (`/ready` separado)

**QA**: Availability
**Tactic alvo**: Ping/Echo + Self-Test
**Esforço**: S
**Findings**: F-availability-1, F-availability-5

**Problema**
> `/health` é um stub estático que sempre retorna 200, mas Render usa esse endpoint como liveness probe. Backend com pool Postgres morto, cookie Conexos expirado ou bootstrap falho continua roteando tráfego — operador só descobre por queixa do usuário.

**Melhoria Proposta**
> Separar liveness (`/health`, mantém estático) de readiness (`/ready` novo, `SELECT 1` no pool + valida `EnvironmentProvider`). `/ready` retorna 503 em qualquer falha; Render passa a apontar `healthCheckPath: /ready`.

**Resultado Esperado**
> Em incidente de Supabase, Render para de rotear tráfego ao backend em ≤ 30s. Métrica: número de deps probadas no readiness = 0 → 2 (DB + EnvironmentProvider).

**Métricas de sucesso**
- Dependências probadas pelo healthcheck: 0 → 2
- Janela de tráfego em backend com DB morto: indeterminada → ≤ 30s

**Risco de não fazer**: incidente futuro de Supabase = janela indefinida de 500 visíveis sem reação automatizada.
**Dependências**: Nenhuma.

---

### [availability-2] Adotar Sentry (ou equivalente) no backend + cron com alerta em incremento de erro

**QA**: Availability
**Tactic alvo**: Monitor + Predictive Model
**Esforço**: S
**Findings**: F-availability-2, F-availability-6

**Problema**
> Toda telemetria de erro vive em `console.error` para stdout do Render (Logger.ts). Sem dashboard, sem alerta, sem agregação. MTTD depende do operador estar olhando ou de o usuário reclamar.

**Melhoria Proposta**
> Instalar `@sentry/node` no backend, inicializar no `index.ts` antes de `app.use`, configurar captura no `errorMiddleware` e adicionar `Sentry.captureCheckIn` no `jobs/ingest-permutas.ts`. Criar alerta "erros 500 > 5/min por 5min" + "cron falhou 2× consecutivas".

**Resultado Esperado**
> MTTD para qualquer regressão produzida no backend cai de >30min para <5min (alerta Slack).

**Métricas de sucesso**
- Deps de APM no backend: 0 → 1
- Alertas com regra automática: 0 → ≥ 2
- Retenção/busca de erros: 7d stdout sem search → 30d+ com search e dedup

**Risco de não fazer**: regressões silenciosas chegam à retro do mês seguinte sem dado quantitativo.
**Dependências**: Nenhuma (Sentry tem plano free suficiente).

---

### [availability-3] Graceful shutdown (SIGTERM) com drenagem de reconciliações em curso

**QA**: Availability
**Tactic alvo**: Escalating Restart
**Esforço**: S
**Findings**: F-availability-3

**Problema**
> `src/backend/index.ts` não trata `SIGTERM`. Render mata o container em auto-deploy; se chegar entre `criarBordero` e `gravarBaixaPermuta`, o borderô fica órfão "EM CADASTRO" no ERP — exige conciliação manual.

**Melhoria Proposta**
> Implementar handler de `SIGTERM`/`SIGINT` que: (a) marca `app.locals.shuttingDown = true`; (b) faz `/ready` retornar 503 imediatamente; (c) aguarda in-flight requests por até 25s; (d) fecha o pool Postgres limpo; (e) `process.exit(0)`.

**Resultado Esperado**
> Render tira o backend do balanceador antes de matar; reconciliações em curso terminam o handshake.

**Métricas de sucesso**
- Handlers de SIGTERM/SIGINT: 0 → 1
- Borderôs órfãos esperados por deploy: indeterminado → ~0

**Risco de não fazer**: cada deploy em horário comercial = potencial de 1–5 borderôs órfãos.
**Dependências**: availability-1 (precisa de `/ready`).

---

### [deployability-2] Adicionar smoke test pós-deploy no CI assertando `/health.version`

**QA**: Deployability
**Tactic alvo**: Manage Deployment Pipeline (post-deployment validation)
**Esforço**: S
**Findings**: F-deployability-2, F-deployability-9

**Problema**
> CI atual só roda gates pré-merge. Depois do `autoDeploy` do Render não há job que verifique se a versão promovida é a que o commit esperava. Bug de runtime no `dist/index.js` pode ficar invisível até o 1º usuário reportar.

**Melhoria Proposta**
> Job `smoke` em `.github/workflows/ci.yml` (após `Tag Release`, com `needs: [tag-release]`): (a) `curl -fsS $RENDER_URL/health` com retry/backoff por até 8 min; (b) compara `version` retornado com `node -p "require('./src/frontend/package.json').version"`; (c) falha o run se divergir.

**Resultado Esperado**
> MTTD de "deploy não promovido" ou "deploy promoveu versão errada" passa de "primeiro usuário reporta" → ≤ 10 min.

**Métricas de sucesso**
- # jobs de smoke pós-deploy: 0 → 1
- Asserção `health.version == tag`: ausente → presente

**Risco de não fazer**: regressão fica em prd por horas até alguém usar a rota afetada.
**Dependências**: secret `RENDER_PRODUCTION_URL` no GitHub Actions.

---

### [deployability-3] Pinar Node em `.nvmrc` + `engines` e unificar workflows em 1 versão

**QA**: Deployability
**Tactic alvo**: Reproducible builds / Package Dependencies
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> CI roda `node 24` (`ci.yml:20,40`), workflow de ingestão diária roda `node 22` (`ingest-permutas.yml:41`), Render herda o default do plan, e não há `.nvmrc` nem `engines` em `package.json`. Reproducibilidade quebrada.

**Melhoria Proposta**
> 1) `.nvmrc` na raiz (ex.: `22.13.0` LTS). 2) `"engines": {"node": ">=22.13 <23"}` em ambos `package.json`. 3) Atualizar workflows para `node-version-file: .nvmrc`. 4) Documentar em `DEPLOY.md`.

**Resultado Esperado**
> 1 versão de Node em todos os pontos (CI BE, CI FE, ingest cron, Render, dev local).

**Métricas de sucesso**
- # versões de Node distintas no repo: 2 → 1
- `.nvmrc` presente: não → sim
- `engines.node` declarado: não → sim

**Risco de não fazer**: bug Node-only em cron de ingestão = painel stale por 24h.
**Dependências**: Nenhuma.

---

### [security-1] Alinhar `DEPLOYED_ENVIRONMENTS` ao valor real de `environment` em produção

**QA**: Security
**Tactic alvo**: Change Default Settings / Limit Exposure
**Esforço**: S
**Findings**: F-security-1

**Problema**
> `loadAuthEnv()` em `http/authEnv.ts:52` só rejeita `DEV_AUTH_BYPASS=true` quando `environment` é `prd|stg|hml`, mas o `render.yaml:26` define `environment=production`. O guard nunca dispara em produção real — basta um operador setar `DEV_AUTH_BYPASS=true` no dashboard para o backend subir SEM auth.

**Melhoria Proposta**
> Inverter a lógica: marcar APENAS `local` como ambiente seguro. Teste de boot: `environment=production` + `DEV_AUTH_BYPASS=true` → throw. Padronizar vocabulário em `render.yaml`, `.env.example`, `DEPLOY.md` e código.

**Resultado Esperado**
> Qualquer ambiente que não seja `local` rejeita o bypass no startup.

**Métricas de sucesso**
- Boots com `DEV_AUTH_BYPASS=true` em `environment != local`: indeterminado → 0 (crash)
- Testes regression: 0 → ≥ 3

**Risco de não fazer**: latente — uma config errada no dashboard Render derruba todo o resto da defesa.
**Dependências**: Nenhuma.

---

### [security-6] Adicionar `npm audit --audit-level=high` no job frontend do CI

**QA**: Security
**Tactic alvo**: Limit Exposure (supply chain)
**Esforço**: S
**Findings**: F-security-6

**Problema**
> `.github/workflows/ci.yml:30-46` (job `frontend`) NÃO chama `npm audit`. Hoje há 1 high (`ws` GHSA-96hv-2xvq-fx4p, CVSS 7.5) escondido em dep transitiva dev-only — passou despercebido porque o gate não existe.

**Melhoria Proposta**
> Adicionar `- run: npm audit --audit-level=high` no job frontend. Resolver/justificar o `ws` atual (atualizar `jest-environment-jsdom` ou `overrides`). Documentar processo de exceção (issue + label `security:waiver`).

**Resultado Esperado**
> Gate equivalente nos dois lados. Vulns `high+` em frontend: 1 → 0.

**Métricas de sucesso**
- Frontend high vulns no CI: 1 (silencioso) → 0 (bloqueia merge)
- Cobertura de `npm audit` no CI: 1/2 jobs → 2/2

**Risco de não fazer**: vuln crítica em prod descoberta por notícia, não por CI.
**Dependências**: Nenhuma.

---

### [modifiability-5] Encapsular `titCod` da invoice — remover hardcode `titCod: 1` (5 pontos)  **[CONSOLIDÁVEL com integrability-5, fault-tolerance-5 — CC-3]**

**QA**: Modifiability
**Tactic alvo**: Encapsulate · Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-5

**Problema**
> 5 lugares em produção fixam `titCod: 1` ao montar payloads do fin010 (`ReconciliacaoPermutaService` 4×, `BorderoGestaoService` 1×). Quando invoice tiver mais de um título, os 5 lugares vão dar baixa no título errado.

**Melhoria Proposta**
> Introduzir `Invoice.tituloAlvoTitCod()` (ou `resolveTituloBaixa(invoice)`) no domínio — derivar a partir do detalhe do título, com fallback explícito a `1` + log de aviso. Substituir os 5 literais; teste de regressão multi-título com fixture sintética. Atualizar `business-rules/fin010-write-contract.md`.

**Resultado Esperado**
> 0 literais `titCod: 1` em production; risco arquitetural #1 sai com a invariante explícita.

**Métricas de sucesso**
- Literais `titCod: 1` em production: 5 → 0
- Testes cobrindo multi-título: 0 → ≥ 1

**Risco de não fazer**: baixa em título errado no fin010 — inconsistência financeira só descoberta em produção.
**Dependências**: aguardar 1º caso real para refinar a regra (mas refactor defensivo já pode ser feito).

---

### [modifiability-6] Externalizar contas gerenciais (130/131) e regras numéricas do plano de contas

**QA**: Modifiability
**Tactic alvo**: Defer Binding — configuration files · Use an Intermediary
**Esforço**: S
**Findings**: F-modifiability-6

**Problema**
> `CONTA_GER_JUROS = 131` e `CONTA_GER_DESCONTO = 130` vivem como `const` em `ReconciliacaoPermutaService.ts:16,23`. Decisão Columbia (P1-2). Se reclassificar contas, ou se um 2º cliente (SaaSo target) usar outro plano, exige redeploy.

**Melhoria Proposta**
> Mover para `EnvironmentVars` (`columbiaContasGerenciais: { juros, desconto }`) lidos via `EnvironmentProvider`. Em SSM (alvo) ficam por-tenant; localmente, vêm de `.env`.

**Resultado Esperado**
> Trocar plano de contas vira mudança de configuração; SaaSo multi-tenant viável sem fork; cumpre Rule #8 100%.

**Métricas de sucesso**
- Regras de negócio numéricas hardcoded em service: 2 → 0
- Override por tenant: impossível → suportado

**Risco de não fazer**: cada cliente novo (alvo SaaSo) força fork.
**Dependências**: Nenhuma.

---

### [performance-3] Substituir `listAtivas` por queries indexadas — `findByAdiantamento(docCod)` + LIMIT

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: S
**Findings**: F-performance-3

**Problema**
> `PermutaAlocacaoRepository.listAtivas()` carrega a tabela inteira para o caller filtrar 1 adto em memória. É chamada em `ReconciliacaoPermutaService.reconciliar` (linha 98 e 113) — dentro do loop do `reconciliar-lote` (LOTE_MAX=6). Custo cresce linearmente.

**Melhoria Proposta**
> `findByAdiantamento(adtoDocCod: string)` ao repo, com `WHERE adiantamento_doc_cod = $docCod` (usa `idx_permuta_alocacao_adto`). Substituir 4 call-sites. Manter `listAtivas` só para `GestaoPermutasService.exporGestao`.

**Resultado Esperado**
> Linhas lidas por baixa no lote: `|alocacoes_total|` → ≤ N (alocações do adto). Para 1000 alocações na trilha: 12000 rows lidas → ≤ 60.

**Métricas de sucesso**
- Rows lidas por `reconciliar-lote` (n=6, trilha 1000): 12000 → ≤ 60

**Risco de não fazer**: P1 hoje, vira P0 quando trilha passar de ~10k linhas.
**Dependências**: Nenhuma.

---

### [integrability-1] Quebrar `ConexosClient` por família wire e introduzir base class  **[CONSOLIDÁVEL com modifiability-2, testability-8 — CC-2]**

**QA**: Integrability
**Tactic alvo**: Encapsulate / Abstract Common Services
**Esforço**: L
**Findings**: F-integrability-1, F-integrability-4

**Problema**
> `ConexosClient.ts` tem 1956 LOC e 28 métodos públicos cobrindo 5 famílias wire. Toda `/feature-new` toca o mesmo arquivo (4 serviços fazem 34 chamadas). Replicar para Nexxera/GED/SharePoint multiplica o problema 4×.

**Melhoria Proposta**
> Extrair `ConexosBaseClient` (auth ensure-sid, retry, error wrapping) e dividir em `ConexosFinDocClient` (com298/com308/com299), `ConexosImportClient` (imp019/imp223), `ConexosBorderoClient` (fin010 read+write). Documentar padrão em `ontology/integrations/_template.md`.

**Resultado Esperado**
> LOC do maior client ≤ 700; métodos públicos por client ≤ 10; padrão reusável para 3 net-new.

**Métricas de sucesso**
- LOC do maior client: 1956 → ≤ 700
- Métodos públicos por client: 28 → ≤ 10
- Famílias por client: 5 → 1

**Risco de não fazer**: ConexosClient atinge 3.000 LOC após fin010 multi-título + SISPAG.
**Dependências**: pode rodar em paralelo com integrability-2.

---

### [integrability-2] Eliminar a camada `services/conexos.ts` legada (auth via DI única)  **[CONSOLIDÁVEL com modifiability-7, integrability-8 — CC-5]**

**QA**: Integrability
**Tactic alvo**: Use an Intermediary / Manage Resource Coupling
**Esforço**: M
**Findings**: F-integrability-2, F-integrability-8

**Problema**
> `services/conexos.ts` (342 LOC, singleton solto) duplica auth/timeout/login-mutex/redaction com o `ConexosClient` (DI/tsyringe). Lê `process.env.CONEXOS_*` direto, ignorando o `EnvironmentProvider` (Inviolable Rule #8). ADR-0006 prometia remover na v0.2.

**Melhoria Proposta**
> Migrar `ConexosService` (axios + sid + mutex + 401-retry) para dentro do `ConexosBaseClient`, consumindo `EnvironmentProvider`. Apagar `services/conexos.ts` e `legacyConexosAdapter.ts`. `appContainer.ts` registra direto sem `LEGACY_CONEXOS_TOKEN`.

**Resultado Esperado**
> 1 caminho de auth Conexos. `process.env.CONEXOS_*` deixa de ser lido fora de `EnvironmentProvider`.

**Métricas de sucesso**
- Camadas de auth Conexos: 2 → 1
- process.env.CONEXOS_* fora do EnvironmentProvider: 3 → 0
- LOC eliminadas: ~462

**Risco de não fazer**: ao migrar para Lambda + SSM, o legado lê env vazio → quebra em produção.
**Dependências**: idealmente após integrability-1.

---

### [integrability-3] Zod no boundary para 100% das respostas do `ConexosClient` (especialmente handshake `fin010`)  **[CONSOLIDÁVEL com testability-5 — CC-6]**

**QA**: Integrability
**Tactic alvo**: Tailor Interface / Contract Testing (Validate Input)
**Esforço**: M
**Findings**: F-integrability-3

**Problema**
> 4 de 28 métodos do `ConexosClient` validam a resposta com Zod (14%). Os passos 2/3/4 do handshake `fin010` (`validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`) usam `cast` sem `.parse`. Uma mudança silenciosa de shape no ERP propaga como `NaN` no SQL/cálculo.

**Melhoria Proposta**
> Criar schemas em `client/permutas/conexosFin010Schemas.ts` (BORDERO_DETALHE, BAIXA_LIST_ROW, FIN010_VALIDACAO_TITULO_BAIXA, FIN010_VALIDACAO_TITULO_PERMUTA, FIN010_ATUALIZA_LIQUIDO). Aplicar `.parse()` em todo retorno do `postGeneric/getGeneric/listGenericPaginated`. Falha de parse vira `ConexosError({code: 'CONEXOS_UPSTREAM_ERROR', message: 'schema_mismatch'})`.

**Resultado Esperado**
> 100% das respostas write-side validadas + ≥ 80% das read-side.

**Métricas de sucesso**
- Métodos com Zod no boundary: 4/28 → ≥ 22/28 (80%)
- Passos write-side validados: 2/5 → 5/5

**Risco de não fazer**: silent corruption no write path (over-payment, baixa fantasma).
**Dependências**: complementa testability-5; melhor depois do integrability-1.

---

### [integrability-4] Modelar Nexxera/GED/SharePoint via `/feature-new` (clients + ontologia + EnvironmentVars)

**QA**: Integrability
**Tactic alvo**: Encapsulate / Discover Service / Abstract Common Services
**Esforço**: XL
**Findings**: F-integrability-4

**Problema**
> Frente II (SISPAG/Nexxera) e Frente III (Popula GED) são metade da proposta e hoje têm 0 código, 0 doc em `ontology/integrations/`, 0 entrada em `EnvironmentVars`. Sem template oficial, cada uma vai copiar o god-client Conexos.

**Melhoria Proposta**
> 1) `ontology/integrations/_template.md` definindo o padrão (`@singleton @injectable`, Zod boundary, retry tipado, error class, fixture HAR em `__fixtures__/`). 2) Para cada provedor, `/feature-new` distinto que produz client + entradas SSM/EnvironmentVars. 3) Bloquear merge sem doc `ontology/integrations/<name>.md`.

**Resultado Esperado**
> 3 novas integrações nasceram seguindo o padrão; marginal cost para a 4ª = 1 doc + 1 client + 1 schema.

**Métricas de sucesso**
- Integrações com client + ontology doc: 1 → 4
- Template oficial: 0 → 1
- Padrão referenciado pelo `PatternGuardian`: não → sim

**Risco de não fazer**: SISPAG e Popula GED entram com god-clients copiados/colados.
**Dependências**: idealmente após integrability-1.

---

### [integrability-5] Resolver `titCod: 1` hardcoded (invoice multi-título no `fin010` write)  **[CONSOLIDÁVEL com modifiability-5, fault-tolerance-5 — CC-3]**

**QA**: Integrability
**Tactic alvo**: Tailor Interface
**Esforço**: M
**Findings**: F-integrability-5

**Problema**
> `ReconciliacaoPermutaService` baixa com `titCod: 1` em 4 lugares; invoice com >1 título cai em `error` com `anti-drift`. Decisão de domínio (A vs B) pendente do Yuri.

**Melhoria Proposta**
> Levantar decisão A vs B (1 reunião). Se A, iterar `titCod 1..N` por invoice; se B, `AlocacaoPermutasService.somaValorNegociado` filtra só títulos com `moeCodMneg != null`. Remover hardcodes; cobrir com teste fixture.

**Resultado Esperado**
> Invoice de N títulos baixa sem `anti-drift` falso-positivo; nenhum hardcode `titCod: 1`.

**Métricas de sucesso**
- Hardcodes `titCod: 1` em service: 4 → 0
- Invoice multi-título: bloqueia/erro → baixa

**Risco de não fazer**: cresce a fila de conciliação manual quando SISPAG entrar.
**Dependências**: decisão de domínio Yuri; `--high-risk` + pair-review obrigatórios.

---

### [modifiability-3] Reduzir as 20 funções acima de cognitive-complexity 15 — top-4 primeiro

**QA**: Modifiability
**Tactic alvo**: Refactor
**Esforço**: M
**Findings**: F-modifiability-3

**Problema**
> Biome reporta 20 funções acima de complexity 15; quatro estão acima de 30 (65 em `buildCandidata`, 58 em `toPendente`, 43 em `toCasamentoRows`, 33 em outra). Funções com complexidade > 30 são impossíveis de cobrir 100% por teste.

**Melhoria Proposta**
> Extrair funções puras (`buildCandidataGate1`, `Gate2Hidratacao`, `Gate3Pago`), aplicar early-return; mover branches de apresentação para `selectors/permutaPresenter.ts`. Ratchet no CI: warning count atual = 20; PR só passa se ≤ atual.

**Resultado Esperado**
> Warnings: 20 → ≤ 5; pior complexity: 65 → ≤ 15.

**Métricas de sucesso**
- `npm run lint` warnings de `noExcessiveCognitiveComplexity`: 20 → ≤ 5
- Pior complexity: 65 → ≤ 15

**Risco de não fazer**: drift contínuo; regressões em elegibilidade-permuta.
**Dependências**: Nenhuma.

---

### [modifiability-4] Bloquear cross-layer imports no Biome (`noRestrictedImports`)

**QA**: Modifiability
**Tactic alvo**: Restrict Dependencies · Use an Intermediary · Encapsulate
**Esforço**: M
**Findings**: F-modifiability-4, F-modifiability-9

**Problema**
> `routes/permutas.ts:13-17` importa 5 repositórios e `routes/conexos.ts:4` importa o `ConexosClient` — burlando DDD. PatternGuardian não bloqueou e Biome não tem `noRestrictedImports`.

**Melhoria Proposta**
> Ativar `lint.style.noRestrictedImports` no `biome.json`: `src/backend/routes/** !-> src/backend/domain/repository/**`, `routes/** !-> domain/client/**`. Encapsular os 6 usos em services novos (`PermutaTrilhaService`, `ConexosHealthService`).

**Resultado Esperado**
> 0 cross-layer imports; lint vira gate; preparação para alvo Lambda.

**Métricas de sucesso**
- Cross-layer imports rota→repo/client: 6 → 0
- Regras `noRestrictedImports`: 0 → ≥ 2

**Risco de não fazer**: drift compounding; cada `/feature-new` pode adicionar mais imports proibidos.
**Dependências**: rodar antes do modifiability-2.

---

### [performance-4] Migrar `reconciliar-lote` para job assíncrono com endpoint de status

**QA**: Performance
**Tactic alvo**: Bound Execution Times + Schedule Resources
**Esforço**: L
**Findings**: F-performance-4

**Problema**
> `LOTE_MAX=6` síncrono em request HTTP roda 6 adtos × ~6 chamadas `fin010` = ~36 calls sequenciais, ~10–25s wall-clock. Render proxy expira em 30–60s. Risco anotado em `permutas-executar-lote-resume`.

**Melhoria Proposta**
> `POST /permutas/reconciliar-lote` apenas enfileira (`pg-boss`/tabela `permuta_lote_job`) e devolve `202 Accepted + { jobId }`; worker processa cada lote. Frontend faz polling em `GET /permutas/lote/:jobId`.

**Resultado Esperado**
> Timeouts 502 do proxy em `/reconciliar-lote`: indeterminado → 0. Tempo de resposta HTTP: 10–25s → < 500ms.

**Métricas de sucesso**
- Latência p95 HTTP `POST /reconciliar-lote`: 10–25s → < 500ms
- Timeouts 502 em 30 dias: medir antes/depois (alvo 0)

**Risco de não fazer**: O sistema fica refém do plano Render; quando migrar para Lambda, API Gateway tem teto de 29s.
**Dependências**: decidir job runner (in-process vs pg-boss vs SQS).

---

### [performance-5] Quebrar `page.tsx` em sub-rotas/componentes com `React.memo` + dynamic import  **[CONSOLIDÁVEL com modifiability-1, testability-1 — CC-1]**

**QA**: Performance
**Tactic alvo**: Reduce Overhead + Bundle leanness
**Esforço**: L
**Findings**: F-performance-5

**Problema**
> `page.tsx` tem 2971 LOC, 35 `useState`, 18 `useMemo/useCallback`, tudo num único `'use client'`. Bundle de rota único; qualquer setState re-renderiza a árvore inteira.

**Melhoria Proposta**
> 1) Extrair sub-componentes por aba; 2) estado COMPARTILHADO em `useReducer` ou context fino; 3) `next/dynamic(() => import('./BorderosPanel'), { ssr: false })` para code-split; 4) `React.memo` nas linhas de tabela.

**Resultado Esperado**
> LOC do arquivo principal: 2971 → ≤ 600. First Load JS da rota `/permutas`: reduzir ≥ 30%.

**Métricas de sucesso**
- LOC `page.tsx`: 2971 → ≤ 600
- useState/useMemo no raiz: 35/18 → ≤ 10/≤ 8
- First Load JS: medir baseline → -30%

**Risco de não fazer**: toda feature nova herda o débito.
**Dependências**: Nenhuma.

---

### [fault-tolerance-1] Bloquear re-POST de baixa quando a execução está em `reconciling` órfã  **[CONSOLIDÁVEL com fault-tolerance-3 — CC-7]**

**QA**: Fault Tolerance
**Tactic alvo**: Idempotent Replay + Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-1, F-fault-tolerance-3, F-fault-tolerance-6

**Problema**
> Re-fire do lote após proxy cortar entre `setBorCod` e `markSettled` faz `beginExecution` reabrir o par em `reconciling`; o serviço segue para `executarBaixa` e re-POSTA `gravarBaixaPermuta` → segunda baixa no MESMO título. Idempotência viva (`borderoAindaValido`) só cobre `settled`.

**Melhoria Proposta**
> Em `ReconciliacaoPermutaService.reconciliar`, ANTES de `executarBaixa`: detectar linha pré-existente com `status='reconciling' AND bor_cod IS NOT NULL AND bxa_cod_seq IS NULL`. (a) reaproveitar `borCod`; (b) consultar `ConexosClient.listBaixas({borCod})`; (c) se caiu, `markSettled`; (d) se NÃO caiu, prosseguir do passo 4 reutilizando o borderô.

**Resultado Esperado**
> Re-fire pós-timeout NUNCA cria baixa duplicada para par órfão.

**Métricas de sucesso**
- # de baixas duplicadas em re-fire pós-timeout: indefinido → 0
- Cobertura "reconciling órfão + re-fire": 0 → ≥ 1

**Risco de não fazer**: super-pagamento contábil no fin010 cada vez que o proxy cortar.
**Dependências**: convive com fault-tolerance-3.

---

### [fault-tolerance-2] Honrar `Idempotency-Key` em `POST /reconciliar-lote` e `POST /adiantamentos/:docCod/reconciliar`  **[CONSOLIDÁVEL — CC-7]**

**QA**: Fault Tolerance
**Tactic alvo**: Idempotent Replay
**Esforço**: M
**Findings**: F-fault-tolerance-2

**Problema**
> 1/3 rotas de escrita financeira aceita `Idempotency-Key` hoje (`/eleicao`); `/reconciliar-lote` e o reconciliar individual NÃO leem o header. Duplo-fetch (retry HTTP, F5, dois tabs) dispara dois lotes para os mesmos adtos.

**Melhoria Proposta**
> Replicar o padrão de `/eleicao` em `/reconciliar-lote` e `/adiantamentos/:docCod/reconciliar`. Persistir `(idempotency_key, payload_hash, response_json, created_at)` em tabela curta com TTL 24h.

**Resultado Esperado**
> 3/3 rotas de escrita financeira honram `Idempotency-Key`; duplo-clique cross-tab não dispara dois lotes.

**Métricas de sucesso**
- % rotas state-mutating de escrita fin010 com `Idempotency-Key`: 33% → 100%
- Teste e2e cobrindo "duplo POST mesma key responde idem-cache": 0 → 1

**Risco de não fazer**: incidentes recorrentes de "executei 2× sem querer".
**Dependências**: Nenhuma.

---

### [fault-tolerance-3] Stuck-state reaper para execuções `reconciling` órfãs (3ª re-priorização)  **[CONSOLIDÁVEL — CC-7]**

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring + Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-3, F-fault-tolerance-1

**Problema**
> Aberto há 3 runs (`2026-06-23-1518:ft-2`, `2026-06-24-2011:F-7`, `2026-06-25-1713:F-3`). Sem job que detecte `status='reconciling' AND atualizado_em < now()-interval '30 min'` AND `bor_cod IS NOT NULL`.

**Melhoria Proposta**
> (1) `PermutaExecucaoRepository.listStuckReconciling(thresholdMinutes)`. (2) `StuckReconciliacaoReaperService`. (3) Provisório (sem cron): rota admin `POST /permutas/reconciliar-orfaos`. (4) Alvo Lambda: EventBridge a cada 10 min.

**Resultado Esperado**
> MTTD de par órfão cai de "indefinido" para ≤ 10 min (com cron) ou ≤ 1 clique admin.

**Métricas de sucesso**
- Jobs/rotas detectores: 0 → 1
- MTTD: indefinido → ≤ 10 min

**Risco de não fazer**: 4ª re-priorização na próxima run; drift permanente.
**Dependências**: convive com fault-tolerance-1.

---

### [fault-tolerance-4] Persistir audit-trail DB das ações de borderô  **[CONSOLIDÁVEL com security-4 — CC-4]**

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring + Quarantine
**Esforço**: M
**Findings**: F-fault-tolerance-4

**Problema**
> As 5 ações de gestão de borderô em `BorderoGestaoService` (finalizar, cancelar, estornar, excluir borderô, excluir baixa) só escrevem via `LogService.info → process.stdout.write`. Sem tabela DB. Render rotaciona logs por TTL.

**Melhoria Proposta**
> Migration `0020_bordero_acao_log.sql` com `(id, bor_cod, fil_cod, acao, invoice_doc_cod, executado_por, payload_request JSONB, erp_response JSONB, erro_mensagem, criado_em)`. Cada método registra ANTES (write-ahead) e atualiza após.

**Resultado Esperado**
> 5/5 ações de borderô têm trilha DB consultável.

**Métricas de sucesso**
- Ações de borderô com trilha DB: 0/5 → 5/5
- Cobertura de testes asserindo a gravação: 0 → 5

**Risco de não fazer**: compliance fraca em contestação ("não fui eu que finalizei essa baixa").
**Dependências**: Nenhuma.

---

### [fault-tolerance-5] Implementar baixa de invoice multi-título (decisão A vs B + iteração `titCod`)  **[CONSOLIDÁVEL com modifiability-5, integrability-5 — CC-3]**

**QA**: Fault Tolerance
**Tactic alvo**: Increase Competence Set
**Esforço**: M
**Findings**: F-fault-tolerance-5

**Problema**
> Toda invoice com >1 parcela é bloqueada hoje. Anti-drift contém a corrupção, mas o par fica permanentemente em `error`. Documentado em `ontology/_inbox/permuta-multi-titulo-pendente.md`.

**Melhoria Proposta**
> (1) Decisão de domínio (Yuri): A = iterar `titCod` 1..N / B = só permutáveis. (2) Refletir em `AlocacaoPermutasService.somaValorNegociado` E em `ReconciliacaoPermutaService`. (3) Validar em homologação; `--high-risk` / pair-review.

**Resultado Esperado**
> Invoices multi-título seguem o lote sem erro.

**Métricas de sucesso**
- `titCod: 1` hardcoded: 4 → 0
- Teste unitário cobrindo invoice multi-título: 0 → ≥ 1

**Risco de não fazer**: cada caso novo polui *Borderôs* com `error`.
**Dependências**: decisão de domínio Yuri.

---

### [fault-tolerance-6] Reconciliação periódica trilha ↔ fin010 (drift detection)  **[CONSOLIDÁVEL — CC-7]**

**QA**: Fault Tolerance
**Tactic alvo**: Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-6, F-fault-tolerance-3

**Problema**
> Sem job/rota que confronte `permuta_alocacao_execucao` + `permuta_bordero` com o `fin010` real. Aberto desde `2026-06-23-1518`. Borderô estornado externamente só é "visto" quando alguém abre a tela.

**Melhoria Proposta**
> `DriftReconciliacaoService` que para cada `settled` consulta o estado vivo do borderô; se CANCELADO/ESTORNADO externamente, marca como `error` "divergência detectada" e libera relançamento; gera relatório de drift. Provisório: rota admin `POST /permutas/conferir-drift`.

**Resultado Esperado**
> Divergência cross-system detectada em ≤ 24h.

**Métricas de sucesso**
- Jobs/rotas de drift: 0 → 1
- Tempo máximo de detecção: humano → ≤ 24h

**Risco de não fazer**: dashboard "mente passivamente"; descoberta tardia atrasa fechamento contábil mensal.
**Dependências**: convive com fault-tolerance-3.

---

### [security-2] Revogação server-side de JWT (denylist por `jti`) + reduzir TTL

**QA**: Security
**Tactic alvo**: Revoke Access
**Esforço**: M
**Findings**: F-security-2

**Problema**
> Hoje o JWT (HS256, 12h) vive em `localStorage`, o logout só faz `localStorage.removeItem`, e o backend não sabe que o token foi revogado. Token roubado permanece válido por 12h — suficiente para finalizar dezenas de borderôs no `fin010`.

**Melhoria Proposta**
> `jti` no `signToken`, tabela `app_token_revoked (jti, revoked_at)`. `signOut()` chama `POST /auth/logout` que insere o `jti`. `buildAuthMiddleware` faz `selectFirst` por `jti` (cache 60s). Reduzir TTL para 4h.

**Resultado Esperado**
> Logout efetivo server-side; revogação manual de sessão suspeita.

**Métricas de sucesso**
- TTL de token: 12h → 4h
- Latência de revogação: ∞ → ≤60s

**Risco de não fazer**: JWT comprometido = 12h de baixa autorizada no `fin010`.
**Dependências**: idealmente após security-4.

---

### [security-3] Granularidade RBAC: separar `analyst`, `approver`, `viewer` e exigir 4-eyes

**QA**: Security
**Tactic alvo**: Authorize Actors (granularidade)
**Esforço**: L
**Findings**: F-security-3

**Problema**
> Único role `admin` — toda mutação financeira está autorizada pelo mesmo nível. Sem maker/checker. Uma credencial comprometida abre toda a superfície destrutiva.

**Melhoria Proposta**
> Modelo: `viewer` / `analyst` / `approver` / `admin`. Exigir 2 pessoas distintas para `POST /permutas/borderos/:b/finalizar` (analyst cria, approver finaliza). Atualizar `requireRole` em 14 endpoints.

**Resultado Esperado**
> Compromisso de credencial isolada por papel; nenhuma única conta capaz de fechar o ciclo.

**Métricas de sucesso**
- Roles distintas: 1 → ≥3
- Endpoints com aprovação independente: 0 → 2

**Risco de não fazer**: única credencial vazada = dano máximo. Bloqueia compliance financeiro.
**Dependências**: security-4.

---

### [security-4] Tabela de audit trail de auth (login OK/falha, logout, revogação)  **[CONSOLIDÁVEL com fault-tolerance-4 — CC-4]**

**QA**: Security
**Tactic alvo**: Audit Trail / Detect Intrusion
**Esforço**: M
**Findings**: F-security-4, F-security-5

**Problema**
> Eventos de auth não persistem (`routes/auth.ts:25-43` não chama `LogService`, `http/auth.ts:167-170` só `console.warn`). Drain do Render tem retenção curta.

**Melhoria Proposta**
> Migration `app_audit_auth (id, ts, event_type, username, ip, user_agent, request_id, success, reason)`. `AuthService.login` grava `LOGIN_OK`/`LOGIN_FAIL`. Middleware grava `TOKEN_REJECTED`. `signOut()` grava `LOGOUT`.

**Resultado Esperado**
> Forense de incidente em SQL (não em logs de drain).

**Métricas de sucesso**
- Tabela `app_audit_auth`: 0 → 1
- Cobertura de eventos: 0% → 100%
- Retenção: ~7d → ≥365d

**Risco de não fazer**: investigação de incidente vira reconstrução de log esfumaçado.
**Dependências**: Nenhuma.

---

### [security-5] Lockout por conta + alerting de burst de falha de login

**QA**: Security
**Tactic alvo**: Lock Computer + Detect Intrusion
**Esforço**: M
**Findings**: F-security-5, F-security-12

**Problema**
> `AuthService.login` aceita tentativas ilimitadas no mesmo username desde que cada IP fique abaixo de 100/min. bcrypt rounds=12 retarda mas não trava. Credential stuffing distribuído viável.

**Melhoria Proposta**
> Coluna `app_user.failed_attempts` + `locked_until`. 5 falhas consecutivas → bloqueio temporário (backoff exponencial: 1→5→30 min). Dummy bcrypt no fast-path (fecha timing-attack F-security-12).

**Resultado Esperado**
> Brute-force distribuído fica inviável; alerta de tentativa anômala.

**Métricas de sucesso**
- Tentativas máximas antes de lock: ∞ → 5
- Diferença de timing user-exists vs not-exists: ~100× → ≤1.2×

**Risco de não fazer**: credential stuffing dirigido contra `admin`/usuários conhecidos.
**Dependências**: security-4.

---

### [security-7] Endurecer tenant isolation — começar pelo `EnvironmentProvider` e DB schema multi-tenant

**QA**: Security
**Tactic alvo**: Separate Entities
**Esforço**: XL
**Findings**: F-security-8, F-security-9

**Problema**
> Promessa central da proposta SaaSo ("compromisso em A não vaza para B") não está cumprida. Hoje 1 Supabase + 1 Render + 1 conjunto de credenciais Conexos.

**Melhoria Proposta**
> Roadmap em 3 passos: (1) coluna `tenant_id` em toda tabela de domínio + filtro `WHERE tenant_id = $tenant` (validar via `PatternGuardian`). (2) `EnvironmentProvider.GetLambdaEnvironmentVars` ativo via `client_name != local` lendo SSM `/tenants/{env}/{client}/...`. (3) primeiro tenant real provisionado via Terraform.

**Resultado Esperado**
> Cada cliente isolado por env/SSM/DB schema.

**Métricas de sucesso**
- Tenants isolados: 0 → N
- Queries com `tenant_id`: 0% → 100%
- PatternGuardian gate "query sem tenant_id": ausente → presente

**Risco de não fazer**: bloqueia onboarding do segundo cliente.
**Dependências**: ADR estratégico (chamar Yuri).

---

### [deployability-4] Reescrever `bump-version.ps1` em Node/bash e mover bump para o CI

**QA**: Deployability
**Tactic alvo**: Script Deployment Commands
**Esforço**: M
**Findings**: F-deployability-4

**Problema**
> `scripts/bump-version.ps1` é PowerShell-only — não roda em mac/Linux/CI Ubuntu. Gate #10 do AutoLoopRunner exige bump lockstep; devs em mac rodam manualmente.

**Melhoria Proposta**
> Reimplementar em Node ESM (`scripts/bump-version.mjs`) — `simple-git` + `semver` + parse de conventional-commits. Job opcional `bump` no CI (`workflow_dispatch`). Manter `.ps1` como wrapper.

**Resultado Esperado**
> Bump funciona em mac/Linux/Windows/CI; tags GitHub deixam de depender de dev em Windows.

**Métricas de sucesso**
- Plataformas suportadas: 1 → 3
- # PRs com bump manual via `.ps1`: ~todos → 0

**Risco de não fazer**: tags faltando para releases shipados de mac; auditoria histórica degradada.
**Dependências**: Nenhuma.

---

### [deployability-5] Criar Render service de staging apontando para banco Supabase de staging

**QA**: Deployability
**Tactic alvo**: Scale Rollouts
**Esforço**: M
**Findings**: F-deployability-5

**Problema**
> Não há ambiente de staging. "Homologação" do fin010 é flip manual de `CONEXOS_BASE_URL` no MESMO container de produção.

**Melhoria Proposta**
> 1) Acrescentar `financeiro-backend-staging` no `render.yaml` (branch `staging`/`develop`), banco Supabase separado. 2) Vercel deploy preview já gera URL por PR — encadear via `vercel.json` ou env conditional. 3) Workflow `promote.yml`.

**Resultado Esperado**
> Validação de escrita ERP em staging permanente, sem flip de flag em prd.

**Métricas de sucesso**
- # ambientes permanentes: 1 → 2
- # incidentes "esqueceu de flipar a flag em prd": rastrear → 0/trimestre

**Risco de não fazer**: à medida que SISPAG e Popula GED entram, o risco de regressão triplica sem leito de testes.
**Dependências**: novo banco Supabase staging; revisão de envs Render.

---

### [deployability-6] Adotar política expand-then-contract + migrations down ou `node-pg-migrate`

**QA**: Deployability
**Tactic alvo**: Rollback (data layer)
**Esforço**: M
**Findings**: F-deployability-6

**Problema**
> Runner forward-only; 19 migrations UP, 0 DOWN. Qualquer rename/drop futuro inviabiliza rollback do código.

**Melhoria Proposta**
> 1) Documentar política expand-then-contract no `CLAUDE.md`. 2) Médio prazo: migrar para `node-pg-migrate` ou `drizzle-kit`. 3) `npm run migrate:dry-run`.

**Resultado Esperado**
> Rollback de código continua possível mesmo após release com schema delta.

**Métricas de sucesso**
- Política expand-then-contract documentada: não → sim
- # migrations com pair UP/DOWN: 0/19 → 100% das novas

**Risco de não fazer**: rename/drop futuro vira incidente; reconciliar com dados em prd = horas.
**Dependências**: Nenhuma para a política.

---

### [testability-3] Introduzir integration tests contra Postgres real (docker-compose)

**QA**: Testability
**Tactic alvo**: Sandbox
**Esforço**: L
**Findings**: F-testability-5

**Problema**
> Zero `describe('integration:')` em todo o backend. Nenhum `docker-compose.test.yml`. `PermutaRelationalRepository.ts` (47.5% branches), `PermutaExecucaoRepository.ts` (51.42% lines) executam SQL complexo (CTE, JOIN, JSONB, UPSERT) nunca validado contra Postgres real.

**Melhoria Proposta**
> `docker-compose.test.yml` com Postgres 16 + script de schema (reusar `migrations/`). `npm run test:integration` que sobe o container, roda `.integration.test.ts` e tira. 5 integration tests por repositório complexo.

**Resultado Esperado**
> Integration tests: 0 → ≥ 15 (5 cases × 3 repositórios).

**Métricas de sucesso**
- Integration test files: 0 → ≥ 3
- Integration test cases: 0 → ≥ 15

**Risco de não fazer**: SQL quebrado merge-ado verde; bug aparece no analista.
**Dependências**: Nenhuma.

---

### [testability-4] Introduzir `ClockProvider` e `RandomProvider` injetáveis

**QA**: Testability
**Tactic alvo**: Limit Non-Determinism
**Esforço**: M
**Findings**: F-testability-4

**Problema**
> 22 chamadas `new Date()/Date.now()` em código-fonte BE. 1 `Math.random()` em `RetryExecutor.ts:53` para jitter. Zero `jest.useFakeTimers()` em todo o repo.

**Melhoria Proposta**
> `domain/libs/clock/ClockProvider.ts` (`@singleton @injectable`) com `now()/nowMillis()`. `domain/libs/random/RandomProvider.ts` com `next()`. Refatorar serviços; em testes registrar `FakeClock`/`FixedRandom`.

**Resultado Esperado**
> Sites de `new Date()` em código-fonte: 22 → 0. `Math.random()`: 1 → 0. ≥ 5 testes novos com `FakeClock`.

**Métricas de sucesso**
- `new Date()/Date.now()` em código-fonte (não-teste): 22 → 0
- `Math.random()` em código-fonte: 1 → 0
- Testes usando `FakeClock`: 0 → ≥ 5

**Risco de não fazer**: bug de timezone em relatórios; idempotência por janela de tempo não-testável.
**Dependências**: overlap com Modifiability.

---

### [testability-5] Gravar fixtures reais de Conexos como Recordable Test Cases  **[CONSOLIDÁVEL com integrability-3 — CC-6]**

**QA**: Testability
**Tactic alvo**: Recordable Test Cases + Executable Assertions
**Esforço**: M
**Findings**: F-testability-6

**Problema**
> `ConexosClient.test.ts` (1628 LOC, 100 `mockResolvedValue`) inventa o shape da resposta em cada teste. Zero fixtures gravadas. Quando o ERP muda campo, testes seguem verdes; só prod falha.

**Melhoria Proposta**
> Durante sessão QaCoach no ambiente dev, capturar 1 JSON real por endpoint Conexos e gravar em `src/backend/domain/client/__fixtures__/conexos/<endpoint>.json` (sanitizar dados). 1 teste por fixture validando via Zod.

**Resultado Esperado**
> Fixtures gravadas: 0 → ≥ 10. Detecção de breaking change Conexos via CI ao invés de prod.

**Métricas de sucesso**
- Fixtures Conexos: 0 → ≥ 10
- Testes `<endpoint>.fixture.test.ts`: 0 → ≥ 10

**Risco de não fazer**: tempo de detecção de breaking change Conexos = tempo de chegar a prod.
**Dependências**: sessão QaCoach com acesso ao dev Conexos.

---

### [testability-6] Repor threshold de cobertura frontend rumo a 60 / 40 / 50

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-7, F-testability-1

**Problema**
> `src/frontend/jest.config.js:35-44` está em lines 20 / branches 9 / functions 14. Gate só pega remoção massiva de testes; qualquer adição de `if/else` em qualquer componente passa.

**Melhoria Proposta**
> Após testability-1, subir thresholds em 3 etapas: (1) lines 35 / branches 18 / functions 25 (30 dias); (2) lines 50 / branches 30 / functions 40 (60 dias); (3) lines 60 / branches 40 / functions 50 (90 dias).

**Resultado Esperado**
> Threshold FE em 90 dias: lines 20→60, branches 9→40, functions 14→50.

**Métricas de sucesso**
- Threshold lines FE: 20 → 60
- Threshold branches FE: 9 → 40
- Threshold functions FE: 14 → 50

**Risco de não fazer**: time confia em verde falso; débito de testes cresce sem freio.
**Dependências**: testability-1.

---

## P2 — Médio

### [deployability-7] Adicionar `npm audit --audit-level=high` no job Frontend do CI

**QA**: Deployability
**Tactic alvo**: Package Dependencies
**Esforço**: S
**Findings**: F-deployability-7

**Problema**
> `ci.yml:24` roda audit no BE; `ci.yml:30-46` (Frontend) NÃO roda. 39 deps de FE entram em prd sem alerta de vulnerabilidade.

**Melhoria Proposta**
> `- run: npm audit --audit-level=high` após `npm ci` no job Frontend.

**Resultado Esperado**
> Paridade de gating de vulnerabilidades entre BE e FE.

**Métricas de sucesso**
- # jobs com `npm audit`: 1 → 2

**Risco de não fazer**: CVE em radix/next entra em prd sem alarme.
**Dependências**: Nenhuma.

---

### [deployability-9] Implementar `/ready` no backend que valide Postgres + Conexos + última migration

**QA**: Deployability
**Tactic alvo**: Deployment observability
**Esforço**: S
**Findings**: F-deployability-9, F-deployability-2

**Problema**
> `/health` retorna 200 sem checar Postgres, Conexos ou se a última migration aplicou. Render usa esse 200 para promover tráfego.

**Melhoria Proposta**
> `app.get('/ready', ...)` que faz: (a) `SELECT 1 FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`; (b) `HEAD $CONEXOS_BASE_URL` timeout 2s; (c) retorna 503 se qualquer falhar. `healthCheckPath: /ready`.

**Resultado Esperado**
> Promoção de tráfego só ocorre quando o container realmente serve.

**Métricas de sucesso**
- # probes (liveness/readiness): 1 → 2
- Tempo médio de promoção com dependência caída: "imediato" → 0

**Risco de não fazer**: deploys "verdes" servindo 500 silenciosamente.
**Dependências**: Nenhuma.

---

### [availability-5] Self-test no boot — validar Postgres e Conexos antes de `app.listen`

**QA**: Availability
**Tactic alvo**: Self-Test
**Esforço**: S
**Findings**: F-availability-5

**Problema**
> `init()` do pool Postgres e `ensureSid()` do Conexos são lazy. Configuração errada só aparece quando a 1ª request real chega. Render marca deploy como sucesso indevidamente.

**Melhoria Proposta**
> Antes do `app.listen`, fazer `await bootstrapAppContainer(); await postgreeDatabaseClient.init(); await conexosService.ensureSid()` em try/catch que loga e `process.exit(1)` em falha.

**Resultado Esperado**
> Deploy com credencial quebrada falha em ≤ 10s sem promover ao tráfego.

**Métricas de sucesso**
- Dependências probadas no boot: 0 → 2
- Deploy com config inválida promovido: possível → 0

**Risco de não fazer**: deploy noturno aparenta sucesso; falha vira incidente do dia seguinte.
**Dependências**: Nenhuma.

---

### [availability-6] Alerta de falha do cron de ingestão (workflow_run + Sentry/Discord)

**QA**: Availability
**Tactic alvo**: Monitor + Retry
**Esforço**: S
**Findings**: F-availability-6

**Problema**
> `.github/workflows/ingest-permutas.yml` falha silenciosamente. Próxima oportunidade só em 6h. Painel `/permutas` exibe dados defasados sem aviso.

**Melhoria Proposta**
> Step `if: failure()` com `actions/github-script` postando para webhook (Slack/Discord) ou `sentry-cli`. Retry interno via `nick-fields/retry@v3` (2 tentativas, 5min).

**Resultado Esperado**
> MTTD do cron quebrado cai de "próximo operador acessar painel" para ≤ 5min.

**Métricas de sucesso**
- Alertas automáticos em falha do cron: 0 → 1
- Tentativas por janela: 1 → 3

**Risco de não fazer**: snapshot defasado vira norma silenciosa.
**Dependências**: idealmente compartilha canal com availability-2.

---

### [integrability-7] Versionamento + back-compat shim doc para integrações

**QA**: Integrability
**Tactic alvo**: Versioning Strategy / Backward-compatibility Shims
**Esforço**: S
**Findings**: F-integrability-6

**Problema**
> Conexos `/api` sem versão; quirks (HTTP 400 com `responseData` válido em `ConexosClient.ts:998-1019`) silenciosamente compensados sem rastro formal de versão.

**Melhoria Proposta**
> 1) Campo `wire_contract_observed_at` em cada `ontology/integrations/<name>.md`. 2) Para cada quirk-handler: comentário `// QUIRK: <provider>@<observed-at>` + link para fixture. 3) `docs/integrations/upgrade-playbook.md`.

**Resultado Esperado**
> Quirks rastreáveis; upgrade do Conexos vira playbook executável.

**Métricas de sucesso**
- Endpoints com `wire_contract_observed_at`: 0 → 100% dos documentados
- Quirks anotados: 0 → 100%

**Risco de não fazer**: quirk-creep silencioso continua.
**Dependências**: Nenhuma.

---

### [integrability-8] Banir `process.env.X` em service/client  **[CONSOLIDÁVEL com integrability-2, modifiability-7 — CC-5]**

**QA**: Integrability
**Tactic alvo**: Configure Behavior / Discover Service
**Esforço**: S
**Findings**: F-integrability-8

**Problema**
> 15 leituras de `process.env.X` fora do `EnvironmentProvider`, incluindo `BcbClient.ts:123` (`BCB_CDI_FALLBACK`) e auth legado Conexos. Viola Inviolable Rule #8.

**Melhoria Proposta**
> Estender `EnvironmentVars` com `bcbCdiFallback` (e demais). Lint custom (`PatternGuardian`) bloqueia `process\.env\.` em `client/**` e `service/**`. Exceções aceitáveis (bootstrap/handler) declaradas.

**Resultado Esperado**
> 0 leituras de `process.env` em client/service.

**Métricas de sucesso**
- `process.env.X` em client/service: 3 → 0
- Regra ativa no PatternGuardian: não → sim

**Risco de não fazer**: cresce com cada `/feature-new`.
**Dependências**: complementa integrability-2.

---

### [integrability-6] Fixtures HAR + contract tests dos endpoints write-side `fin010`  **[CONSOLIDÁVEL com testability-5 — CC-6]**

**QA**: Integrability
**Tactic alvo**: Contract Testing
**Esforço**: M
**Findings**: F-integrability-3, F-integrability-7

**Problema**
> Os 81 testes do `ConexosClient` usam mocks `jest.fn()`. As HARs reais ficaram em `ontology/_inbox/`. Não há regressão automatizada para o shape real, especialmente nos 5 passos de escrita.

**Melhoria Proposta**
> `src/backend/domain/client/__fixtures__/conexos/` com JSON respostas reais (sanitizadas) por endpoint. Testes do client passam a usar essas fixtures contra os schemas Zod do integrability-3.

**Resultado Esperado**
> Cada endpoint crítico tem ≥ 1 fixture; mudança de shape ERP quebra teste na hora.

**Métricas de sucesso**
- Fixtures gravadas: 0 → ≥ 10
- Testes que validam shape ERP real: 0 → ≥ 10

**Risco de não fazer**: probe nova = re-derivar tudo na cabeça.
**Dependências**: melhor após integrability-3.

---

### [modifiability-7] Migrar `services/conexos.ts` legado para `EnvironmentProvider`  **[CONSOLIDÁVEL com integrability-2, integrability-8 — CC-5]**

**QA**: Modifiability
**Tactic alvo**: Use an Intermediary · Encapsulate
**Esforço**: S
**Findings**: F-modifiability-7

**Problema**
> `services/conexos.ts:80,142-145` lê `CONEXOS_BASE_URL`, `CONEXOS_USERNAME`, `CONEXOS_PASSWORD` direto de `process.env`. Rule #8 violation.

**Melhoria Proposta**
> Substituir leituras por `EnvironmentProvider.get('conexos.baseUrl' / 'conexos.username' / 'conexos.password')`. Estender ratchet `process.env outside EnvironmentProvider` no CI.

**Resultado Esperado**
> 100% das credenciais do Conexos via EnvironmentProvider; preparação para SSM.

**Métricas de sucesso**
- `process.env.CONEXOS_*` em service legado: 4 → 0
- Função `_doLogin` complexity: 17 → ≤ 15

**Risco de não fazer**: alvo SaaSo inviável.
**Dependências**: precisa rodar antes da poda do adapter.

---

### [modifiability-8] Quebrar `routes/permutas.ts` (25 rotas) por área de domínio

**QA**: Modifiability
**Tactic alvo**: Split Module
**Esforço**: M
**Findings**: F-modifiability-8

**Problema**
> 25 rotas e 29 imports em `routes/permutas.ts:1-772`. Mistura eleição, gestão, alocação, borderô, reconciliação, ingestão, status, relatórios.

**Melhoria Proposta**
> `routes/permutas/index.ts` (composer) + sub-routers `eleicao.ts`, `gestao.ts`, `alocacao.ts`, `bordero.ts`, `reconciliacao.ts`, `ingestao.ts`, `relatorios.ts`. Cada sub-router ≤ 10 rotas, ≤ 300 LOC.

**Resultado Esperado**
> Maior arquivo de rota cai para ≤ 300 LOC; preparação para `lambda/api/permutas/*`.

**Métricas de sucesso**
- LOC maior `routes/*.ts`: 772 → ≤ 300
- Rotas por arquivo: 25 → ≤ 10

**Risco de não fazer**: ramo permanente de conflito ao ligar SISPAG/GED.
**Dependências**: rodar depois do modifiability-4.

---

### [performance-6] Habilitar HTTP keep-alive no axios do Conexos

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-6

**Problema**
> `services/conexos.ts:79-82` cria axios sem `httpsAgent`. Cada chamada paga handshake TCP+TLS (~90–150ms a 30ms RTT). Eleição/Ingestão fazem centenas de chamadas/run → 45–75s de overhead desperdiçado.

**Melhoria Proposta**
> `httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20, maxFreeSockets: 10 })`. `maxSockets=20` casa com `FILIAIS_CONCURRENCY × ADIANTAMENTOS_CONCURRENCY`.

**Resultado Esperado**
> Overhead por chamada: 90–150ms → ~5–10ms.

**Métricas de sucesso**
- axios clients com keep-alive agent: 0 → 1
- duração média de uma Eleição: baseline → -10–20%

**Risco de não fazer**: aceitável hoje; vira mais sensível conforme volume cresce.
**Dependências**: Nenhuma.

---

### [performance-7] Adicionar `LIMIT` defensivo + paginação aos hot reads de `permuta_*`

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-8

**Problema**
> 7 `selectMany` em hot paths sem `LIMIT` (`listAdiantamentosAtivos`, `listInvoicesEmAberto`, `listDeclaracoes`, `listCasamentos`, `listImportadores`, `listComBordero`, `listAtivas`). Escala linear sem teto.

**Melhoria Proposta**
> 1) Cada read recebe `LIMIT $limit` parametrizado (default 5000; 500 para `listComBordero`). 2) `rowCount == limit` → `LogService.warn(BUSINESS_WARN, 'limit hit')`. 3) Cardinalidade > 10k → paginação cursor-based.

**Resultado Esperado**
> Reads sem `LIMIT` em hot paths: 7 → 0.

**Métricas de sucesso**
- # selectMany sem LIMIT em rotas HTTP: 7 → 0
- Warn "limit hit" como alarme: ausente → presente

**Risco de não fazer**: P2 hoje, vira P0 silenciosamente se a operação dobrar de volume.
**Dependências**: Nenhuma.

---

### [performance-8] Cobrir `fetch` do frontend com `AbortController` + timeout

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-9

**Problema**
> Nenhuma das ~25 chamadas `fetch` em `src/frontend/lib/api.ts` tem timeout ou `signal`. Se backend/Conexos travar, spinner é eterno; setState após unmount = leak.

**Melhoria Proposta**
> `fetchWithTimeout(url, opts, timeoutMs = 15_000)` com `AbortController` interno. Substituir call-sites; 60_000ms para `runIngestaoManual`. Componentes que disparam fetch em `useEffect` passam o `signal`.

**Resultado Esperado**
> Spinner infinito → erro pt-BR amigável em ≤ 15s (60s ingestão).

**Métricas de sucesso**
- fetches sem timeout em `lib/api.ts`: 25 → 0
- tickets "tela travada": medir antes/depois

**Risco de não fazer**: UX ruim em pico/erro; warnings React de "setState after unmount".
**Dependências**: Nenhuma.

---

### [availability-4] Circuit breaker no ConexosClient (fail-fast quando Conexos cai)

**QA**: Availability
**Tactic alvo**: Removal from Service + Ignore Faulty Behavior
**Esforço**: M
**Findings**: F-availability-4

**Problema**
> Sem breaker, falha sustentada do Conexos = cada chamada espera 40s × 2 retries × 4 chamadas × 6 adtos = até ~990s. Render proxy mata em ~100s, gerando 502 com side-effects parciais.

**Melhoria Proposta**
> Envolver `ConexosClient` em um breaker tipo Opossum (`npm install opossum`): abre após 5 falhas consecutivas em 30s, half-open após 60s. Quando aberto, lança `ConexosUnavailableError` imediatamente.

**Resultado Esperado**
> Tempo máximo de espera durante incidente Conexos cai de ~990s/lote para ~5s + breaker aberto.

**Métricas de sucesso**
- Breakers configurados: 0 → 1
- Tempo máximo de hold em incidente upstream: ~990s → ~5s

**Risco de não fazer**: incidente longo do Conexos = inutilização total do backend.
**Dependências**: idealmente após availability-2.

---

### [availability-7] Implementar `FallbackExecutor` e aplicar em `GET /permutas/borderos`

**QA**: Availability
**Tactic alvo**: Passive Redundancy + Degradation
**Esforço**: M
**Findings**: F-availability-8, F-availability-4

**Problema**
> `FallbackExecutor` citado no CLAUDE.md mas não existe. `GET /permutas/borderos` cai quando o Conexos cai, mesmo havendo cache local `permuta_bordero` maduro.

**Melhoria Proposta**
> (a) `FallbackExecutor implements IExecutor`: tenta `primary`, se lança usa `fallback`, marca `stale=true`. (b) Aplicar em `BorderoGestaoService.listarBorderos({ live: true })` — se `refreshCache` falhar, lê do cache + header `X-Cache-Stale: true`.

**Resultado Esperado**
> Em incidente Conexos, tela de gestão continua mostrando borderôs (com aviso).

**Métricas de sucesso**
- Rotas com fallback configurado: 0 → 1
- Implementações de `IExecutor`: 1 → 2

**Risco de não fazer**: cada minuto de Conexos fora = minuto sem gestão visível.
**Dependências**: ideal após availability-4.

---

### [deployability-8] Sincronizar deploy FE+BE (sem version-skew) via promote workflow

**QA**: Deployability
**Tactic alvo**: Scale Rollouts
**Esforço**: M
**Findings**: F-deployability-8

**Problema**
> BE deploya automaticamente no Render quando `main` é atualizada; FE deploya pela integração Vercel (independente) ou manual. Versão lockstep no `package.json` não garante deploy lockstep.

**Melhoria Proposta**
> 1) Job `deploy-frontend` que roda `vercel deploy --prod --token=$VERCEL_TOKEN` somente após `Tag Release` E após o smoke test do BE passar. 2) Smoke test cross-version: meta tag com a versão; se divergir, falha + alerta.

**Resultado Esperado**
> FE e BE sobem em sequência controlada, com asserção de version-match.

**Métricas de sucesso**
- Janela de version-skew FE/BE pós-merge: indeterminada → ≤ 2 min
- # de deploys FE no CI: 0 → 100% dos pós-merge em main

**Risco de não fazer**: bug FE-BE "API mudou contrato" toda vez que FE for redeployado fora de ordem.
**Dependências**: `VERCEL_TOKEN` como secret.

---

### [security-8] Helmet + security headers no Express

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: S
**Findings**: F-security-7

**Problema**
> `src/backend/index.ts:16-97` não monta `helmet()` — respostas saem sem HSTS, X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy.

**Melhoria Proposta**
> `npm i helmet`; `app.use(helmet())` antes do CORS.

**Resultado Esperado**
> Hardening browser-level via header.

**Métricas de sucesso**
- Headers de segurança presentes (curl -I): 0 → ≥5

**Risco de não fazer**: ferramentas tipo securityheaders.com dão nota F.
**Dependências**: Nenhuma.

---

### [security-9] Limpar `credentials: true` do CORS enquanto não houver cookie real

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: S
**Findings**: F-security-10, F-security-2

**Problema**
> `http/cors.ts:49` libera `credentials: true` (cookies cross-origin) sem que o sistema use cookie — Bearer no header. Cria armadilha para refactor futuro que adicione cookie de sessão.

**Melhoria Proposta**
> Remover `credentials: true` agora. Adicionar comentário: "se voltar a usar cookie de sessão, RE-LIGAR e implementar CSRF token + SameSite=strict". Alternativa: implementar já cookie httpOnly + SameSite + CSRF (resolve F-security-2 também).

**Resultado Esperado**
> Sem superfície CSRF latente.

**Métricas de sucesso**
- `Access-Control-Allow-Credentials`: `true` → (removido)

**Risco de não fazer**: armadilha para próximo refactor.
**Dependências**: coordenar com security-2.

---

### [testability-7] Padronizar log assertions em paths de erro (helper `buildLogService()`)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: M
**Findings**: F-testability-8

**Problema**
> 10/44 arquivos de teste BE referenciam `LogService`; quase todos só para mocar. Apenas `EleicaoPermutasService.test.ts` captura calls num array via `buildLogService()`. Erros chegam sem `LOG_TYPE` correto e sem contexto.

**Melhoria Proposta**
> Extrair `buildLogService()` para `src/backend/tests/utils/buildLogService.ts`. Em cada teste de path de erro: `expect(logCalls).toContainEqual({ type: LOG_TYPE.<algo>, data: expect.objectContaining({ requestId, ... }) })`.

**Resultado Esperado**
> Arquivos de teste com log assertion em paths de erro: ~2 → ≥ 20.

**Métricas de sucesso**
- Testes assertando log shape em path de erro: ~2 → ≥ 20
- Helper compartilhado em `tests/utils/buildLogService.ts`: não existe → existe

**Risco de não fazer**: MTTR de investigação cresce.
**Dependências**: Nenhuma.

---

### [testability-8] Decompor `ConexosClient` em sub-clients por bounded context  **[CONSOLIDÁVEL com modifiability-2, integrability-1 — CC-2]**

**QA**: Testability
**Tactic alvo**: Limit Structural Complexity
**Esforço**: L
**Findings**: F-testability-9

**Problema**
> `ConexosClient.ts` em 1956 LOC, teste em 1628 LOC. Cobertura 100%, mas tamanho denuncia SUT monolítico.

**Melhoria Proposta**
> Decompor em `ConexosFinanceiroClient`, `ConexosBordereauClient`, `ConexosCadastroClient`. Cada um `@singleton @injectable`. Mover testes 1:1. Manter `ConexosClient` como fachada deprecada.

**Resultado Esperado**
> `ConexosClient.ts` < 200 LOC (fachada). Sub-clients: 3 arquivos < 700 LOC cada.

**Métricas de sucesso**
- `ConexosClient.ts` LOC: 1956 → < 200
- Maior teste BE: 1628 → < 600
- Sub-clients criados: 0 → 3

**Risco de não fazer**: onboarding cresce; refactor adiado por medo do teste enorme.
**Dependências**: testability-5.

---

## P3 — Baixo

### [modifiability-9] Ratchet de qualidade no CI — congelar warnings, exigir queda

**QA**: Modifiability
**Tactic alvo**: Refactor · Restrict Dependencies (como gate)
**Esforço**: S
**Findings**: F-modifiability-9

**Problema**
> Hoje o lint roda mas warnings não bloqueiam merge. Cognitive-complexity warnings cresceram de 20 sem aviso; cross-layer imports entraram sem bloqueio.

**Melhoria Proposta**
> `scripts/lint-ratchet.ts` que conta: (a) warnings `noExcessiveCognitiveComplexity`; (b) `process.env` fora de EnvironmentProvider; (c) imports cross-layer. PR falha se qualquer contagem subir.

**Resultado Esperado**
> Não-aumento monotônico de débito; cada feature paga ou mantém.

**Métricas de sucesso**
- Warnings em ratchet: livres → monotonicamente não-crescentes
- Cross-layer violations detectadas no CI: 0 hoje → 100% detectadas no PR

**Risco de não fazer**: drift silencioso continua.
**Dependências**: Nenhuma.

---

### [security-10] `requestId` na resposta 500 + 4xx do `errorMiddleware`

**QA**: Security
**Tactic alvo**: Audit Trail (correlação)
**Esforço**: S
**Findings**: F-security-11

**Problema**
> `http/errorMiddleware.ts:35` devolve `{error: 'Internal server error'}` sem `requestId`. Header `X-Request-Id` está presente, mas usuário copia o body — não vê o ID.

**Melhoria Proposta**
> `res.status(500).json({ error: 'Internal server error', requestId: req.requestId });`. Idem para validações Zod.

**Resultado Esperado**
> Triagem de incidente mais rápida.

**Métricas de sucesso**
- % respostas 4xx/5xx com `requestId`: ~50% → 100%

**Risco de não fazer**: tempo de suporte aumenta.
**Dependências**: Nenhuma.

---

### [testability-9] Adicionar `fast-check` e ≥ 4 properties cobrindo lógica numérica de Permutas

**QA**: Testability
**Tactic alvo**: Limit Non-Determinism (exploração sistemática)
**Esforço**: S
**Findings**: F-testability-10

**Problema**
> `fast-check` nem é dep direta. Lógica numérica crítica (`progressoPagamento`, `ordenarBorderosPainel`, `bucketEtapaPermuta`, alocação N:M) é testada com 3-5 example-based cases. Edge-cases de centavos/ordenação/alocação escapam.

**Melhoria Proposta**
> `npm i -D fast-check` em BE+FE. Properties: (1) `progressoPagamento(face, aberto, taxa)` ⇒ `percentPago ∈ [0,99]`; (2) `bucketEtapaPermuta(etapas)` ⇒ `{0,1,2}`; (3) `ordenarBorderosPainel(rows)` ⇒ idempotente e estável; (4) `AlocacaoPermutasService.alocar` ⇒ soma == valor invoice.

**Resultado Esperado**
> Properties: 0 → ≥ 4. Bugs de borda capturados em CI.

**Métricas de sucesso**
- `fast-check` em `package.json` (BE+FE): não → sim
- Properties no repo: 0 → ≥ 4

**Risco de não fazer**: bug sutil de arredondamento em valor financeiro.
**Dependências**: Nenhuma.