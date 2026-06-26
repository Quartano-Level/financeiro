---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-26-0058
agent: qa-modifiability
generated_at: 2026-06-26T01:05:00-03:00
scope: all
score: 5
findings_count: 9
cards_count: 9
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Yuri (PO Columbia) / dev de Permutas | Pedido recorrente: "muda a regra de elegibilidade", "novo tipo de borderô", "exibir o cliente em cada invoice", "expor write-back fin010 só p/ admin", "incluir novo `titCod` quando a invoice tem mais de um título" | Backend services de Permutas (`EleicaoPermutasService` 897, `GestaoPermutasService` 535, `BorderoGestaoService` 505, `ReconciliacaoPermutaService` 542), `ConexosClient` 1956, `routes/permutas.ts` 772, frontend `app/permutas/page.tsx` 2971 | Desenvolvimento — feature nova via `/feature-new` / tweak via `/feature-tweak`; rebase em `main` + Regis-Review gate antes do merge | Mudança fica **localizada** na fatia de domínio que muda (1 service + 1 página/aba + 1 migration), passa typecheck + lint + 480 testes, sem ripple para fora do domínio Permutas | Tempo de implementação ≤ 5 dias úteis p/ feature M; ≤ 1 dia p/ tweak; nº de arquivos tocados ≤ 8 por feature M; warnings de complexidade não crescem; nº de cross-layer imports não cresce |

> Hoje a v0.7.0 (cliente em invoice + borderô-cache + múltipla automática) tocou 6 entidades de ontologia e mais de 20 arquivos de produção, com 4 dos 5 hotspots de tamanho (page.tsx, ConexosClient, GestaoPermutasService, BorderoGestaoService) crescendo em LOC. O custo de mudança *está medível* e *está acelerando*.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC src (backend + frontend, não-teste) | 13.228 + 6.980 = **20.208** | — | ℹ️ | `_shared-metrics.md` |
| p50 LOC por arquivo de produção | **46** | ≤ 150 | ✅ | `find … -exec wc -l` (128 arquivos) |
| p95 LOC por arquivo de produção | **535** | ≤ 400 | ⚠️ | idem |
| max LOC por arquivo de produção | **2971** (`src/frontend/app/permutas/page.tsx`) | ≤ 600 | ❌ | idem |
| Arquivos > 600 LOC (Split Module candidates) | **6** (page.tsx 2971, ConexosClient 1956, EleicaoPermutasService 897, routes/permutas 772, BorderosPanel 683, PermutaRelationalRepository 629) | 0 | ❌ | apêndice A2 |
| Funções acima de cognitive complexity 15 (Biome `noExcessiveCognitiveComplexity`) | **20 warnings** (pior = 65 em `EleicaoPermutasService.ts:607`; 58 em `GestaoPermutasService.ts:262`; 43 em `IngestaoPermutasService.ts:399`; 33; 30; 28; 27; 24×2; 23×3; 20×2; 18; 17×2; 16×3) | 0 ou ≤ 5 (apenas casos justificados) | ❌ | `npm run lint` |
| Cross-layer imports (route/lambda → repository/client diretamente) | **6** em `routes/permutas.ts` (5 repos: `ClienteFiltroRepository`, `PermutaProcessamentoRepository`, `PermutaExecucaoRepository`, `PermutaRelationalRepository`, `PermutaSnapshotRepository`) + **1** em `routes/conexos.ts` (`ConexosClient`) | 0 (DDD: route → service → repo → client) | ❌ | `grep -rn 'from .*domain/(repository\|client)' src/backend/routes` |
| Domain importing from routes/lambda | 0 | 0 | ✅ | `grep -rn "from .*lambda/\\|routes/" src/backend/domain` |
| `process.env` fora de `EnvironmentProvider` (não-teste) | **25 ocorrências** (`index.ts`, `config.ts`, `http/auth.ts`, `http/authEnv.ts`, `http/rateLimit.ts`, `jobs/seed-admin.ts`, `domain/libs/handler/ApiGatewayHandler.ts`, `BcbClient.ts`, **`services/conexos.ts` ×4** — Rule #8 violations) | só em `EnvironmentProvider` + bootstrap | ⚠️ | `grep -rn process.env src/backend --include="*.ts"` |
| Hardcoded `titCod: 1` em production code (não-teste) | **5** ocorrências (4 em `ReconciliacaoPermutaService.ts:254/313/401/467`, 1 em `BorderoGestaoService.ts:111`) | 0 (extrair como invariante derivado da invoice) | ❌ | `grep -rn "titCod:\s*1\b"` |
| Magic numbers em domain/service (regras de negócio embutidas) | **8** (`CONTA_GER_JUROS=131`, `CONTA_GER_DESCONTO=130`, `INGEST_LOCK_KEY=918273645`, `PAGE_SIZE=500`, `MAX_PAGES=50`, `ADIANTAMENTOS_CONCURRENCY=10`, `LARGURA_PADRAO=18`, `MAX_NOME_ABA=31`) | regras-chave (juros/desconto, lock-key) configuráveis via `EnvironmentProvider`; constantes técnicas (page, concurrency) toleráveis | ⚠️ | `grep -rnE "const [A-Z_]+ = [0-9]{2,}" src/backend/domain/service` |
| Frontend `page.tsx` — useState count | **35** | ≤ 10 por componente | ❌ | `grep -c useState src/frontend/app/permutas/page.tsx` |
| Frontend `page.tsx` — referências a Dialog/Modal | **39** | ≤ 3 modais por componente | ❌ | `grep -c "Dialog\|Modal" page.tsx` |
| `ConexosClient.ts` — public methods | **26** (entidades distintas: borderô 2, baixa 40 menções, invoice, financeiro, titulo, adiantamento, filial, processo, declaração) | ≤ 12 / classe; 1 entidade por classe | ❌ | `grep -cE "^\s*public " src/backend/domain/client/ConexosClient.ts` |
| `BorderoGestaoService.ts` — public methods | **9** (criar/listar/excluir/finalizar/estornar/cancelar/remover-baixa/statusPorAdiantamento/refreshCache) | ≤ 5 / service | ⚠️ | idem |
| `routes/permutas.ts` — rotas + imports | **25 rotas, 29 imports** | rotas ≤ 10/arquivo, imports ≤ 15 | ❌ | `grep -cE "router\.(get\|post\|put\|delete)"; grep -c '^import '` |
| Ontologia — `_index.json` accuracy (12 paths amostrados) | **12/12 (100%)** | 100% | ✅ | check manual `[ -f path ]` |
| Ontologia — `_coverage.json` drift (entities 7, actions 11, business-rules 8) | v0.4.0 / 2026-06-24 — última sync ADR-0014; `entities_coverage_pct=93`, `actions_coverage_pct=95`, 4/8 business-rules sem teste canônico | sync ≤ 1 feature de atraso; coverage ≥ 90% | ✅ | `ontology/_coverage.json` |
| Polimorfismo / interfaces com múltiplas impls (Defer Binding) | **0** interfaces com mais de uma implementação registrada via tsyringe; **0** tokens `register` (só `resolve`/`@injectable`) | aceitável para domínio bem-acoplado | ℹ️ | `grep -rn "container\.register\|TOKEN" src/backend` |
| Feature-flags de runtime para regras críticas | **2** (`CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) — ambos via `EnvironmentProvider`, citados em 9 pontos do código | ≥ 1 por integração de escrita | ✅ | `EnvironmentProvider.ts:69,70,96,97` + uso em services |
| ADRs por feature (binding history) | **14 ADRs** (`ontology/decisions/`) cobrindo 5 milestones de Permutas (Fatia 1 → v0.7.0) | ≥ 1 por feature M | ✅ | `ls ontology/decisions/` |

> ⚠️ **Não medível localmente sem ferramenta dedicada**:
> - Acoplamento estrutural (LCOM4, Ca/Ce, cyclic deps): requer `madge` ou `dependency-cruiser` (não instalados). Aproximação por grep neste relatório.
> - Time-to-change real por feature: requer instrumentação de `/feature-new` → PR merge. Recomendação: registrar `start_at`/`merged_at` em `ontology/_coverage.json#_meta.last_feature`.

### Apêndice A1 — Top-10 maiores arquivos (insumo do cross-cutting risk map)

| Arquivo | LOC | Tipo | Sinal |
|---|---:|---|---|
| `src/frontend/app/permutas/page.tsx` | **2971** | god-component (35 useState, 39 menções a Dialog/Modal, 25 Tabs) | P0 — Split Module |
| `src/backend/domain/client/ConexosClient.ts` | **1956** | god-client (26 public methods, 9 áreas de entidade) | P0 — Split Module + Increase Semantic Coherence |
| `src/backend/domain/service/permutas/EleicaoPermutasService.ts` | 897 | complexity 65 em `buildCandidata`; complexity 20 em outra | P1 — Refactor |
| `src/backend/routes/permutas.ts` | 772 | 25 rotas, 29 imports, 6 imports de repository (layer-skip) | P1 — Split + Restrict Dependencies |
| `src/frontend/app/permutas/BorderosPanel.tsx` | 683 | sub-página de borderô; complexity 58 noutra função relacionada | P2 — Split Module |
| `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` | 629 | 2 funções complexity 17 / 16; SQL bruto | P2 — Refactor (extrair queries) |
| `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` | 542 | complexity 28; 4× `titCod:1` hardcoded; CONTA_GER literals | P1 — Encapsulate + Defer Binding |
| `src/backend/domain/service/permutas/GestaoPermutasService.ts` | 535 | complexities 58/28/23/16 (4 warnings num único arquivo) | P1 — Refactor |
| `src/frontend/lib/api.ts` | 523 | API client monolítico do frontend | P3 — Split por domínio |
| `src/backend/domain/service/permutas/BorderoGestaoService.ts` | 505 | 9 public methods (broadest service); complexity 18 | P2 — Split |

### Apêndice A2 — Top serviços por fan-in (quem rompe quando muda)

| Service | Fan-in (arquivos prod que importam, excl. testes) | Risco se mudar contrato |
|---|---:|---|
| `VariacaoCambialPermutaService` | 6 | composta dentro do Eleição/Gestão; mudar interface vaza para 6 pontos |
| `GestaoPermutasService` | 4 | usado por painel + reconciliação lote + relatórios |
| `EleicaoPermutasService` | 4 | jobs + rotas + reconciliação |
| `IngestaoPermutasService` | 3 | jobs cron + rota manual + coalescer |
| `AlocacaoPermutasService` | 3 | rotas (rascunho, finalizar, cancelar) |
| `ReconciliacaoPermutaService` | 2 | rotas (singular + lote) |
| `PainelService`, `ElegibilidadeService`, `CasamentoInvoiceService`, `BorderoGestaoService`, `AgingService` | 2 cada | acoplamento sob controle |
| `RelatorioExportService`, `ReconciliacaoLotePermutaService`, `IngestaoCoalescerService` | 1 cada | ponto único — barato modificar |

> Fan-in baixo (≤ 6) por toda a fatia de Permutas. **Surpresa positiva**: o que dói não é fan-in lateral entre services — é o tamanho intra-arquivo (page.tsx, ConexosClient) e o cognitive-complexity intra-função.

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | Pendente em 6 arquivos > 600 LOC; pior caso `page.tsx` 2971 LOC e `ConexosClient.ts` 1956 LOC | ❌ ausente nos hotspots | `find -exec wc -l` + apêndice A1 |
| **Increase Semantic Coherence** | `ConexosClient` mistura 9 áreas-entidade (filial, processo, declaração, financeiro, adiantamento, invoice, borderô, baixa, título); `page.tsx` mistura listas + modais + abas + relatórios + ingestão + status; `BorderoGestaoService` une CRUD de borderô + status PERMUTA→BORDERÔ + cache | ❌ ausente nos hotspots | `ConexosClient.ts:444-1956`; `page.tsx:609-2960` |
| **Encapsulate** | `titCod: 1` vaza detalhe ERP em 5 pontos do service (deveria ser invariante interna da Invoice); CONTA_GER_JUROS/DESCONTO viram literal no service; `routes/permutas.ts` injeta 5 repositories diretamente, pulando a fronteira do Service | ⚠️ parcial | `ReconciliacaoPermutaService.ts:254,313,401,467`, `BorderoGestaoService.ts:111`, `routes/permutas.ts:13-17` |
| **Use an Intermediary** | DI via `tsyringe` está em todo o backend (`@injectable`/`@singleton`); `EnvironmentProvider` intermedeia config; `ConexosClient` é o único ponto contra o ERP (bom). Falta intermediário entre `routes` e `repository` quando o service deveria ser obrigatório | ⚠️ parcial | `appContainer.ts`; `EnvironmentProvider.ts`; rota `routes/permutas.ts` skipping |
| **Restrict Dependencies** | Convenção DDD documentada (CLAUDE.md "Lambda → Service → Repository → Client") + `PatternGuardian` agent declarado, mas Biome não tem `noRestrictedImports` configurado; PatternGuardian **não bloqueou** os 6 imports route→repository hoje vivos | ❌ ausente como gate automatizado | `biome.json` (sem `noRestrictedImports`); violations em `routes/permutas.ts:13-17` e `routes/conexos.ts:4` |
| **Refactor** | 20 warnings de cognitive-complexity abertos (pior = 65); 4 acima de 30 (regras de domínio); aceitos como warning, sem ratchet decrescente | ❌ pisos crescentes (drift) | `npm run lint` (20 warnings) |
| **Abstract Common Services** | `RetryExecutor`, `FallbackExecutor`, `PollExecutor`, `ApiGatewayHandler`, `LogService`, `EnvironmentProvider` — abstrações genéricas presentes e usadas. Sem extração ainda para "conta-gerencial" e "titCod da invoice" (replicado N vezes) | ⚠️ parcial | `domain/libs/executor/*`, `domain/libs/handler/*`; ausência: titCod/CONTA_GER |
| **Defer Binding — configuration files** | `EnvironmentProvider` + 2 feature flags (`CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) cobrindo o ponto mais crítico (write-back fin010). 8 magic numbers em services — 3 deles são regras de negócio (contas gerenciais 130/131, lock-key 918273645) | ⚠️ parcial — bom no write-gate, fraco em regras numéricas | `EnvironmentProvider.ts:69,96`; `ReconciliacaoPermutaService.ts:16,23`; `IngestaoPermutasService.ts:41` |
| **Defer Binding — polymorphism** | 0 interfaces com múltiplas impls; 0 tokens `container.register`; tudo é resolução por classe concreta | ℹ️ aceitável (domínio mono-cliente, mono-ERP); virar restrição quando o 2º cliente entrar (multi-tenant target) | `grep "container.register" src/backend` |
| **Defer Binding — plugin / runtime registration** | Não aplicável hoje — domínio mono-tenant. ADR-0014 e o status-machine de borderô são versionados por ADR (binding via dados, não via plugin) | N/A | — |

## 4. Findings (achados)

### F-modifiability-1: God-component `page.tsx` (2971 LOC) na home de Permutas

- **Severidade**: P0
- **Tactic violada**: Split Module · Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx:1-2971`
- **Evidência (objetiva)**:
  ```
  src/frontend/app/permutas/page.tsx:2971 LOC
  35 useState · 39 menções a Dialog/Modal · 25 menções a TabsContent/TabsTrigger · 23 imports
  componente raiz `GestaoPermutasPage` começa na linha 609 e segue até 2960
  ```
- **Impacto técnico**: qualquer tweak na aba (Automáticas, Manual, Ingestão, Borderôs, Relatórios) força ler e re-renderizar mentalmente o mesmo arquivo; testes de componente são impraticáveis (frontend cobre só 20% de linhas hoje — `_shared-metrics`); merge conflicts cruzam features paralelas; cognitive complexity ≥ 50 em handlers de filtro.
- **Impacto de negócio**: cada feature visível p/ o Yuri custa 2-3× mais (review longo, regressão fácil); a v0.7.0 já mostrou — a ingestão manual e o borderô-cache mergeram em PRs sequenciais por conflito de arquivo.
- **Métrica de baseline**: 2971 LOC (alvo ≤ 600); 35 useState (alvo ≤ 10); 39 modais (alvo ≤ 3).

### F-modifiability-2: `ConexosClient.ts` (1956 LOC) — 1 classe, 9 áreas de entidade, 26 public methods

- **Severidade**: P0
- **Tactic violada**: Split Module · Increase Semantic Coherence · Encapsulate
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1-1956`
- **Evidência (objetiva)**:
  ```
  public methods agrupados por entidade:
    filial (2)   processo (1)   declaração (2)   financeiro/adiantamento (5)
    invoice (1)  borderô (7)    baixa (4)        titulo (3)   genéricos (1)
  Métodos de mais alta complexidade: 24 (linha 899), 20 (linha 485)
  ```
- **Impacto técnico**: cada endpoint novo do Conexos infla a mesma classe; testes do client são gigantes (`ConexosClient.test.ts` é o maior arquivo de teste); mock parcial é difícil — os serviços recebem o `ConexosClient` inteiro mesmo precisando de só 2 métodos (LSP/ISP).
- **Impacto de negócio**: a próxima frente (SISPAG vai adicionar pagamentos + retorno bancário) vai puxar mais 10–15 métodos para a mesma classe — atingirá ~3000 LOC e cravará o gargalo arquitetural #1 (write-back) em débito permanente.
- **Métrica de baseline**: 1956 LOC (alvo ≤ 600), 26 public methods (alvo ≤ 12), 9 áreas-entidade (alvo 1 por classe).

### F-modifiability-3: 20 warnings de cognitive-complexity, com 4 funções acima de 30

- **Severidade**: P1
- **Tactic violada**: Refactor
- **Localização**: múltiplos — top hits abaixo:
  - `domain/service/permutas/EleicaoPermutasService.ts:607` — **complexity 65** (`buildCandidata`)
  - `domain/service/permutas/GestaoPermutasService.ts:262` — **complexity 58** (`toPendente`)
  - `domain/service/permutas/IngestaoPermutasService.ts:399` — **complexity 43** (`toCasamentoRows`)
  - `domain/service/permutas/IngestaoPermutasService.ts:290` — **complexity 33**
  - `domain/service/permutas/ReconciliacaoLotePermutaService.ts:80` — **complexity 30**
- **Evidência (objetiva)**:
  ```
  $ cd src/backend && npm run lint
  …
  Found 20 warnings. (max permitido = 15)
  ```
- **Impacto técnico**: funções com complexity > 30 são impossíveis de cobrir 100% por teste unitário (CC ≈ # caminhos); cada `if`/`switch` novo nelas multiplica casos não-testados; PRs param em revisão (já anotado pelo Regis 2026-06-24-2011 como follow-up de `toPendente`).
- **Impacto de negócio**: regressões silenciosas em regras de elegibilidade — exatamente onde a Columbia depende de precisão (PROFORMA × INVOICE).
- **Métrica de baseline**: 20 warnings (alvo ≤ 5); pior função = 65 (alvo ≤ 15).

### F-modifiability-4: `routes/permutas.ts` importa repositórios diretamente — layer skip

- **Severidade**: P1
- **Tactic violada**: Restrict Dependencies · Use an Intermediary · Encapsulate
- **Localização**: `src/backend/routes/permutas.ts:13-17` e `src/backend/routes/conexos.ts:4`
- **Evidência (objetiva)**:
  ```
  routes/permutas.ts:13: import ClienteFiltroRepository ...
  routes/permutas.ts:14: import PermutaProcessamentoRepository ...
  routes/permutas.ts:15: import PermutaExecucaoRepository ...
  routes/permutas.ts:16: import PermutaRelationalRepository ...
  routes/permutas.ts:17: import PermutaSnapshotRepository ...
  routes/conexos.ts:4:   import ConexosClient ...
  ```
  CLAUDE.md (Inviolable § "DDD Layers"): **Lambda → Service → Repository → Client**. Hoje a rota fala direto com 5 repositórios e 1 client, contornando a fronteira do Service. PatternGuardian não bloqueou — `biome.json` não tem `noRestrictedImports`.
- **Impacto técnico**: cada mudança de schema (SQL) ou de protocolo Conexos pode obrigar tocar `routes/permutas.ts` além do service — quebra o "uma alteração, um arquivo". Esconde regras de negócio em handlers HTTP.
- **Impacto de negócio**: a meta de migração para Lambda (CLAUDE.md "alvo") fica mais cara — os handlers Lambda terão de absorver lógica que deveria estar em services; refatoração proporcional do `/feature-tweak` falha porque o ponto de injeção está errado.
- **Métrica de baseline**: 6 imports cross-layer (alvo 0).

### F-modifiability-5: `titCod: 1` hardcoded em 5 pontos de produção (multi-título não suportado)

- **Severidade**: P1
- **Tactic violada**: Encapsulate · Abstract Common Services
- **Localização**:
  - `domain/service/permutas/ReconciliacaoPermutaService.ts:254, 313, 401, 467`
  - `domain/service/permutas/BorderoGestaoService.ts:111`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:254:            titCod: 1,
  ReconciliacaoPermutaService.ts:313:            titCod: 1,
  ReconciliacaoPermutaService.ts:401:        titCod: 1,
  ReconciliacaoPermutaService.ts:467:            titCod: 1,
  BorderoGestaoService.ts:111:                titCod: 1,
  ```
  Já existe comentário interno reconhecendo "vc-multi-titulo" em `ConexosClient.ts:283` e `ConexosClient.test.ts:233`, indicando que o time **sabe** que invoice pode ter mais de um título.
- **Impacto técnico**: o dia que a Columbia tiver invoice com múltiplos títulos (cenário previsto pelo próprio nome `vc-multi-titulo`), 5 lugares vão dar baixa no título errado — risco de inconsistência financeira no ERP.
- **Impacto de negócio**: estouro silencioso no `fin010` (risco arquitetural #1 ainda em validação); cada `/feature-new` que tocar reconciliação precisa replicar o literal — defer-binding miss compounding.
- **Métrica de baseline**: 5 ocorrências (alvo 0; o `titCod` deve vir da invoice — campo já modelado em `Fin010Baixa.ts:95`).

### F-modifiability-6: Regras numéricas de domínio (contas gerenciais 130/131) hardcoded em service

- **Severidade**: P1
- **Tactic violada**: Defer Binding — configuration files
- **Localização**: `domain/service/permutas/ReconciliacaoPermutaService.ts:16,23`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:16: const CONTA_GER_JUROS = 131;
  ReconciliacaoPermutaService.ts:23: const CONTA_GER_DESCONTO = 130;
  ```
  Confirmado por `P1-2 (contas 131=PASSIVA=juros / 130=ATIVA=desconto)` no `_coverage.json#health_flags.p0_inbox_resolved` — é uma decisão do plano de contas Columbia. Hoje o número está dentro do código.
- **Impacto técnico**: se a Columbia reclassificar o plano de contas (ou se a SaaSo entrar em produção com outro cliente que usa outras contas), exige redeploy. Não há override por ambiente.
- **Impacto de negócio**: cada cliente novo (SaaSo alvo do CLAUDE.md) força fork do code-path; release de versão do app só para mudar um número.
- **Métrica de baseline**: 2 constantes de regra-de-negócio em service (alvo: 0 — devem viver em `EnvironmentVars` ou em tabela `plano_contas`).

### F-modifiability-7: Legacy `services/conexos.ts` ainda lê `process.env` cru — Rule #8 violation

- **Severidade**: P2
- **Tactic violada**: Use an Intermediary (EnvironmentProvider) · Encapsulate
- **Localização**: `src/backend/services/conexos.ts:80, 142, 144, 145` (+ 1 complexity-17 warning em `_doLogin`)
- **Evidência (objetiva)**:
  ```
  services/conexos.ts:80:  baseURL: process.env.CONEXOS_BASE_URL || 'https://...'
  services/conexos.ts:144: const username = process.env.CONEXOS_USERNAME;
  services/conexos.ts:145: const password = process.env.CONEXOS_PASSWORD;
  ```
  CLAUDE.md Inviolable Rule #8: "Always `EnvironmentProvider` — never raw `process.env` in services." `migration-debt.md` B3 marca este arquivo como `PARTIAL`.
- **Impacto técnico**: configura sessão e credenciais fora do EnvironmentProvider — divergência de fonte de verdade; teste do client é frágil (mock de env global).
- **Impacto de negócio**: bloqueia a meta multi-tenant (cada tenant precisa de SSM path próprio que o EnvironmentProvider já sabe formar; o legado não).
- **Métrica de baseline**: 4 `process.env` em service legado (alvo 0); 1 função `_doLogin` complexity 17.

### F-modifiability-8: `routes/permutas.ts` — 25 rotas + 29 imports em um único módulo

- **Severidade**: P2
- **Tactic violada**: Split Module
- **Localização**: `src/backend/routes/permutas.ts:1-772`
- **Evidência (objetiva)**:
  ```
  router.get|post|put|delete count: 25
  imports count: 29 (sendo 6 cross-layer — F-modifiability-4)
  ```
  Rotas misturam eleição, gestão, alocação, borderô, reconciliação, ingestão, status, relatórios.
- **Impacto técnico**: dois devs em features distintas (e.g., ingestão vs. borderô) conflitam no mesmo arquivo; review difícil de focar.
- **Impacto de negócio**: paralelismo entre frentes (Permutas-tweak vs SISPAG-new) ficará prejudicado quando a SISPAG entrar — vão querer adicionar rotas e o ponto de entrada vira gargalo.
- **Métrica de baseline**: 25 rotas / 772 LOC (alvo ≤ 10 rotas e ≤ 300 LOC por arquivo de rota).

### F-modifiability-9: Sem `noRestrictedImports` no Biome — PatternGuardian é "honor system"

- **Severidade**: P3
- **Tactic violada**: Restrict Dependencies (como gate automatizado)
- **Localização**: `src/backend/biome.json` (sem regra) + dependência implícita no agent `PatternGuardian`
- **Evidência (objetiva)**: nenhuma regra de path-restriction no Biome; as 6 violações de F-modifiability-4 existem porque nada bloqueou no CI.
- **Impacto técnico**: PatternGuardian roda fora do compilador (no autoloop); humano pode mergear no main bypassando-o. F-modifiability-4 é a prova viva.
- **Impacto de negócio**: invariantes arquiteturais entram em deriva sem aviso, e a aplicação de DDD vira convenção social.
- **Métrica de baseline**: 0 regras de `noRestrictedImports` (alvo: ≥ 1 — `routes/** !-> domain/repository/**`, `routes/** !-> domain/client/**`).

## 5. Cards Kanban

### [modifiability-1] Quebrar `page.tsx` (2971 LOC) em rota raiz + sub-páginas por aba

- **Problema**
  > A página `/permutas` é um componente de 2971 LOC com 35 useState, 39 referências a Dialog/Modal e 25 referências a Tabs. Qualquer mudança em uma aba (Automáticas, Manual, Ingestão, Borderôs, Relatórios) recarrega mentalmente o arquivo inteiro; testes de componente são impraticáveis (cobertura frontend = 20% lines); merges de features paralelas (v0.7.0 ingestão + borderô-cache) conflitaram aqui.
- **Melhoria Proposta**
  > Split Module + Increase Semantic Coherence: extrair cada aba para `app/permutas/<tab>/page.tsx` (`automaticas`, `manual`, `ingestao`, `borderos`, `relatorios`), usar `app/permutas/layout.tsx` para o shell de navegação/filtros; isolar modais em `app/permutas/_modals/*` colocados onde são usados; hoistar estado de filtro p/ context dedicado (`PermutasFiltroProvider`); cada sub-página ≤ 500 LOC.
- **Resultado Esperado**
  > Cada aba editável isoladamente; cobertura por componente sobe; conflito por merge → 1 arquivo por feature. LOC max do conjunto: 2971 → ≤ 500 por sub-página.
- **Tactic alvo**: Split Module · Increase Semantic Coherence
- **Severidade**: P0
- **Esforço estimado**: XL (>2sem)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - LOC do maior `page.tsx`: **2971 → ≤ 500**
  - useState count: **35 → ≤ 10 por componente**
  - Modais inline: **39 → 0** (todos via portal/módulo dedicado)
  - Cobertura de componente frontend (lines): **20% → ≥ 50%** dos sub-arquivos
- **Risco de não fazer**: a v0.9.x (SISPAG vai querer aba própria) vira ramo conflituoso por padrão; tempo de PR review > 1 dia útil; bugs visuais aumentam.
- **Dependências**: nenhuma (greenfield interno ao frontend).

### [modifiability-2] Quebrar `ConexosClient` em sub-clients por área de entidade

- **Problema**
  > `ConexosClient.ts` tem 1956 LOC, 26 public methods cobrindo 9 áreas-entidade do ERP (filial, processo, declaração, financeiro, adiantamento, invoice, borderô, baixa, título). Services injetam o cliente inteiro mesmo precisando de 1–2 métodos; testes do client são gigantescos; a próxima frente (SISPAG) vai adicionar mais 10–15 métodos e estourar a classe.
- **Melhoria Proposta**
  > Split Module + Increase Semantic Coherence: extrair `ConexosBorderoClient`, `ConexosBaixaClient`, `ConexosTituloClient`, `ConexosAdiantamentoClient`, `ConexosInvoiceClient`, `ConexosFinanceiroClient`, `ConexosProcessoClient`, `ConexosFilialClient`. Manter `ConexosClient` apenas como infra de sessão/transporte (`callList`, `paginate`, `parseDate`, mapeadores genéricos) — `@singleton`. Cada sub-client `@injectable`, reusa o transport por composição. Cada sub-client ≤ 300 LOC.
- **Resultado Esperado**
  > Service injeta só o sub-client que usa (Interface Segregation); SISPAG nasce com `SispagPagamentoClient` próprio; testes por área; risco arquitetural #1 (write-back fin010) isolado em `ConexosBaixaClient` + `ConexosBorderoClient`.
- **Tactic alvo**: Split Module · Increase Semantic Coherence · Use an Intermediary
- **Severidade**: P0
- **Esforço estimado**: L (1–2 sem)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - LOC `ConexosClient.ts`: **1956 → ≤ 400** (só transport)
  - Public methods por sub-client: **26 (1 classe) → ≤ 8 (por classe)**
  - Áreas-entidade por classe: **9 → 1**
- **Risco de não fazer**: 3000+ LOC quando SISPAG entrar; gargalo de review permanente.
- **Dependências**: registrar tokens novos no `appContainer`; PatternGuardian precisa aceitar a nova convenção.

### [modifiability-3] Reduzir as 20 funções acima de cognitive-complexity 15 — top-4 primeiro

- **Problema**
  > Biome reporta 20 funções acima de complexity 15; quatro estão acima de 30 (65 em `buildCandidata`, 58 em `toPendente`, 43 em `toCasamentoRows`, 33 em outra de `IngestaoPermutasService`). Funções com complexidade > 30 são impossíveis de cobrir 100% por teste e concentram bugs de regra de negócio.
- **Melhoria Proposta**
  > Refactor: extrair funções puras (`buildCandidataGate1`, `buildCandidataGate2Hidratacao`, `buildCandidataGate3Pago`, etc.) seguindo o próprio comentário do código (já fala em gates); aplicar early-return; mover branches de apresentação (toPendente) para `selectors/permutaPresenter.ts` no frontend ou em `_view` helpers. Adicionar ratchet no CI: warning count atual = 20; PR só passa se ≤ atual.
- **Resultado Esperado**
  > Warnings: **20 → ≤ 5**; pior complexity: **65 → ≤ 15**; tempo de revisão dessas funções cai pela metade.
- **Tactic alvo**: Refactor
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) para top-4; L para os 20
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - `npm run lint` warnings de `noExcessiveCognitiveComplexity`: **20 → ≤ 5**
  - Pior complexity: **65 → ≤ 15**
- **Risco de não fazer**: drift contínuo (Regis 2026-06-24-2011 já anotou esse follow-up); regressões em elegibilidade-permuta (P1).
- **Dependências**: nenhuma.

### [modifiability-4] Bloquear cross-layer imports no Biome (`noRestrictedImports`)

- **Problema**
  > `routes/permutas.ts:13-17` importa 5 repositórios e `routes/conexos.ts:4` importa o `ConexosClient` — burlando a regra DDD do CLAUDE.md ("Lambda → Service → Repository → Client"). PatternGuardian não bloqueou e Biome não tem `noRestrictedImports` configurado. Cada mudança de schema agora pode ter de tocar a rota também.
- **Melhoria Proposta**
  > Restrict Dependencies: ativar `lint.style.noRestrictedImports` no `biome.json` com regras: `src/backend/routes/** !-> src/backend/domain/repository/**`, `src/backend/routes/** !-> src/backend/domain/client/**`, `src/backend/lambda/** !-> idem` (preparando o alvo). Encapsular os 6 usos atuais em services novos: `PermutaTrilhaService` (wrap dos 5 repos da rota), `ConexosHealthService` (wrap do client em `routes/conexos.ts`).
- **Resultado Esperado**
  > 0 cross-layer imports; PatternGuardian + Biome convergem (lint vira gate); preparação para o alvo Lambda — handlers só sabem de services.
- **Tactic alvo**: Restrict Dependencies · Use an Intermediary · Encapsulate
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — regra Biome (1h) + criação dos 2 services (resto)
- **Findings relacionados**: F-modifiability-4, F-modifiability-9
- **Métricas de sucesso**:
  - Cross-layer imports rota→repo/client: **6 → 0**
  - Regras `noRestrictedImports`: **0 → ≥ 2**
- **Risco de não fazer**: drift compounding; cada `/feature-new` pode adicionar mais imports proibidos.
- **Dependências**: precisa do card `modifiability-4` rodar **antes** do `modifiability-2` (assim o ConexosClient já é injetado só via service).

### [modifiability-5] Encapsular `titCod` da invoice — remover hardcode `titCod: 1` (5 pontos)

- **Problema**
  > 5 lugares em produção fixam `titCod: 1` ao montar payloads do fin010 (`ReconciliacaoPermutaService` 4×, `BorderoGestaoService` 1×). O próprio time já anotou o cenário "vc-multi-titulo" em comentários — sabe que invoice pode ter mais de um título. Quando isso ocorrer, 5 lugares vão dar baixa no título errado.
- **Melhoria Proposta**
  > Encapsulate + Abstract Common Services: introduzir `Invoice.tituloAlvoTitCod()` (ou `resolveTituloBaixa(invoice)`) no domínio — derivar a partir do detalhe do título quando disponível, com fallback explícito a `1` + log de aviso. Substituir os 5 literais; adicionar teste de regressão multi-título com fixture sintética. Atualizar `business-rules/fin010-write-contract.md` declarando a invariante.
- **Resultado Esperado**
  > 0 literais `titCod: 1` em production; risco arquitetural #1 (write-back) sai com a invariante explícita; quando a Columbia tiver invoice multi-título, o sistema dá baixa correta na 1ª execução.
- **Tactic alvo**: Encapsulate · Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) para o refactor + teste
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - Literais `titCod: 1` em production: **5 → 0**
  - Testes cobrindo multi-título: **0 → ≥ 1**
- **Risco de não fazer**: baixa em título errado no fin010 — inconsistência financeira que **só será descoberta em produção** quando a Columbia tiver a 1ª invoice multi-título.
- **Dependências**: aguardar 1º caso real para refinar a regra (mas o refactor *defensivo* já pode ser feito hoje).

### [modifiability-6] Externalizar contas gerenciais (130/131) e regras numéricas do plano de contas

- **Problema**
  > `CONTA_GER_JUROS = 131` e `CONTA_GER_DESCONTO = 130` vivem como `const` em `ReconciliacaoPermutaService.ts:16,23`. Já são uma decisão Columbia (P1-2 no `_coverage.json`). Se a Columbia reclassificar contas, ou se um 2º cliente (SaaSo target) usar outro plano, exige redeploy.
- **Melhoria Proposta**
  > Defer Binding — configuration files: mover para `EnvironmentVars` (`columbiaContasGerenciais: { juros, desconto }`) lidos via `EnvironmentProvider`. Em SSM (alvo) ficam por-tenant; localmente, vêm de `.env`. Para o `INGEST_LOCK_KEY = 918273645` e `PAGE_SIZE = 500`, manter como constantes técnicas (sem necessidade de tunar por cliente), mas documentar como tal em `EnvironmentVars` se houver dúvida.
- **Resultado Esperado**
  > Trocar plano de contas vira mudança de configuração; SaaSo multi-tenant fica viável sem fork de código; cumpre Rule #8 100%.
- **Tactic alvo**: Defer Binding — configuration files · Use an Intermediary
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - Regras de negócio numéricas hardcoded em service: **2 (CONTA_GER) → 0**
  - Override por tenant: **impossível → suportado**
- **Risco de não fazer**: cada cliente novo (alvo SaaSo) força fork; cada release que altera o plano queima ciclo de deploy completo (overlap com **Deployability**).
- **Dependências**: nenhuma; alinhamento de naming com `EnvironmentVars` schema (Zod).

### [modifiability-7] Migrar `services/conexos.ts` legado para `EnvironmentProvider`

- **Problema**
  > `services/conexos.ts:80,142-145` lê `CONEXOS_BASE_URL`, `CONEXOS_USERNAME`, `CONEXOS_PASSWORD` direto de `process.env` — Rule #8 violation. `migration-debt.md` B3 marca como PARTIAL. Também tem 1 função `_doLogin` complexity 17.
- **Melhoria Proposta**
  > Use an Intermediary: substituir leituras por `EnvironmentProvider.get('conexos.baseUrl' / 'conexos.username' / 'conexos.password')` (adicionar campos ao `EnvironmentVars` se ainda não tiverem). Estender ratchet `process.env outside EnvironmentProvider` no CI: contagem atual = 25; bloquear crescimento.
- **Resultado Esperado**
  > 100% das credenciais do Conexos via EnvironmentProvider; preparação para SSM (alvo Lambda). Migration debt B3 sai de PARTIAL para CLOSED quando o adapter for podado.
- **Tactic alvo**: Use an Intermediary · Encapsulate
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - `process.env.CONEXOS_*` em service legado: **4 → 0**
  - Função `_doLogin` complexity: **17 → ≤ 15**
- **Risco de não fazer**: alvo SaaSo (CLAUDE.md) inviável; secret rotation precisa de dois lugares.
- **Dependências**: precisa rodar antes da poda do adapter (ADR-0003 manteve só o transport).

### [modifiability-8] Quebrar `routes/permutas.ts` (25 rotas) por área de domínio

- **Problema**
  > 25 rotas e 29 imports em um único `routes/permutas.ts:1-772`. Mistura eleição, gestão, alocação, borderô, reconciliação, ingestão, status, relatórios. Duas features paralelas conflitam mesmo sem tocar a mesma área.
- **Melhoria Proposta**
  > Split Module: criar `routes/permutas/index.ts` (composer) + sub-routers `eleicao.ts`, `gestao.ts`, `alocacao.ts`, `bordero.ts`, `reconciliacao.ts`, `ingestao.ts`, `relatorios.ts`. Cada sub-router ≤ 10 rotas, ≤ 300 LOC. Reaproveita os services existentes (não muda DI).
- **Resultado Esperado**
  > Maior arquivo de rota cai para ≤ 300 LOC; conflito por merge entre frentes some; preparação direta para o `lambda/api/permutas/*` do alvo (cada sub-router vira uma pasta).
- **Tactic alvo**: Split Module
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-8
- **Métricas de sucesso**:
  - LOC maior `routes/*.ts`: **772 → ≤ 300**
  - Rotas por arquivo: **25 → ≤ 10**
- **Risco de não fazer**: ramo permanente de conflito ao ligar SISPAG/GED; tempo de PR review estabiliza alto.
- **Dependências**: rodar **depois** do `modifiability-4` (assim os repos saem da rota antes do split).

### [modifiability-9] Ratchet de qualidade no CI — congelar warnings, exigir queda

- **Problema**
  > Hoje o lint roda mas warnings não bloqueiam merge. Cognitive-complexity warnings cresceram de 20 sem aviso; cross-layer imports (F-modifiability-4) entraram sem bloqueio. Não há contadores monitorados.
- **Melhoria Proposta**
  > Adicionar script `scripts/lint-ratchet.ts` que conta: (a) warnings `noExcessiveCognitiveComplexity`; (b) ocorrências de `process.env` fora do EnvironmentProvider; (c) imports cross-layer (rota→repo/client). PR falha se qualquer contagem **subir**. Rodar no GitHub Actions junto com `npm test`.
- **Resultado Esperado**
  > Não-aumento monotônico de débito; cada feature paga ou mantém. Sinaliza dívida no PR description.
- **Tactic alvo**: Refactor · Restrict Dependencies (como gate)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-9 (relacionado a F-3, F-4, F-7)
- **Métricas de sucesso**:
  - Warnings em ratchet: **livres → monotonicamente não-crescentes**
  - Cross-layer violations detectadas no CI: **0 hoje → 100% detectadas no PR**
- **Risco de não fazer**: drift silencioso continua; Regis-Review vira a única defesa, atuando depois do código merged.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Surpresa positiva**: fan-in lateral entre services está sob controle (max = 6, em `VariacaoCambialPermutaService`). O custo de mudança **não está no acoplamento entre módulos** — está dentro de poucos arquivos gigantes (page.tsx, ConexosClient) e em funções com complexity > 30. Isso muda o roteiro: refactor mais lucrativo = Split de 2 arquivos + Refactor de 4 funções, não revisão de DI.
- **Cross-QA — Integrability**: F-modifiability-2 (ConexosClient split) e F-modifiability-5 (titCod) movem a fronteira de integração com o ERP — alinhar com qa-integrability (o ConexosClient é o único ponto contra o Conexos, e o write-back fin010 é o risco arquitetural #1).
- **Cross-QA — Testability**: F-modifiability-1 (page.tsx 2971 LOC) bloqueia cobertura de componente (frontend está em 20% lines). Hard-to-modify e hard-to-test são o mesmo nó. F-modifiability-3 (complexity 65) também — caminhos não testáveis.
- **Cross-QA — Deployability**: F-modifiability-6 (CONTA_GER hardcoded) e F-modifiability-7 (`process.env` em service legado) implicam que cada mudança de regra numérica = release de versão do app. Defer-binding miss vira custo de deploy. Conectar com qa-deployability.
- **Métricas não coletadas**: cyclic dependency analysis (sem `madge`/`dependency-cruiser` instalado) — recomendar `npm i -D dependency-cruiser` no backend e rodar `depcruise --validate` no CI. Time-to-change real por feature não medido — sugerido instrumentar via campos `started_at`/`merged_at` em `_coverage.json#_meta.last_feature`.
