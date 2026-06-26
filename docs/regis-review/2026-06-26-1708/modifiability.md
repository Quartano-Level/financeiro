---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-26-1708
agent: qa-modifiability
generated_at: 2026-06-26T17:30:00-03:00
scope: all
score: 7
findings_count: 10
cards_count: 10
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Yuri (PO Columbia) / dev de Permutas | Pedido recorrente: "muda a regra de elegibilidade", "novo tipo de borderô", "expor write-back fin010 só p/ admin", "novo `titCod` quando a invoice tem mais de um título", "abre uma nova aba (SISPAG)" | Backend services de Permutas (`EleicaoPermutasService` 911, `ReconciliacaoPermutaService` 662, `GestaoPermutasService` 537, `BorderoGestaoService` 508), sub-clients Conexos (`ConexosFinanceiroClient` 703, `ConexosBaixaClient` 481), `routes/permutas.ts` 772, frontend `app/permutas/page.tsx` 1026 + 5 abas + 5 modais extraídos | Desenvolvimento — feature nova via `/feature-new` / tweak via `/feature-tweak`; rebase em `main` + Regis-Review gate antes do merge | Mudança fica **localizada** na fatia de domínio que muda (1 service + 1 aba/modal + 1 migration), passa typecheck + lint + 188 testes backend + 12 testes frontend, sem ripple para fora do domínio Permutas | Tempo de implementação ≤ 5 dias úteis p/ feature M; ≤ 1 dia p/ tweak; nº de arquivos tocados ≤ 8 por feature M; warnings de complexidade não crescem; nº de cross-layer imports não cresce |

> Após o **split CC-1** (page.tsx 2.981 → 1.026 LOC, 5 abas em `components/Aba*.tsx`, 5 modais em `components/*Dialog.tsx` lazy-loaded, 4 hooks em `components/use*.ts`) e o **split CC-2** (ConexosClient 1.972 → removido; substituído por `ConexosBaseClient` 319 + 4 sub-clients @injectable), o cenário melhorou de forma materialmente mensurável. O custo de mudança das próximas features (SISPAG aba; Popula GED) cai porque a fronteira de extensão é uma pasta de sub-client + uma sub-página, não um god-object.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC src (backend + frontend, não-teste, 153 arquivos) | **25.831** total (era 20.208 em 2026-06-26-0058) | — | ℹ️ crescimento de 28% em uma semana | `find … -exec wc -l` (script no scratchpad) |
| p50 LOC por arquivo de produção | **64** (era 46) | ≤ 150 | ✅ | idem |
| p95 LOC por arquivo de produção | **537** (era 535) | ≤ 400 | ⚠️ pisado | idem |
| max LOC por arquivo de produção | **1026** (`src/frontend/app/permutas/page.tsx`) — era 2971 | ≤ 600 | ❌ ainda acima, mas **−65%** | idem |
| Arquivos > 600 LOC | **7** (page.tsx 1026, EleicaoPermutasService 911, routes/permutas 772, BorderosPanel 711, ConexosFinanceiroClient 703, ReconciliacaoPermutaService 662, PermutaRelationalRepository 641) | 0 | ❌ era 6 (CC-1/CC-2 caíram; surgiu ReconciliacaoPermutaService) | apêndice A1 |
| Funções acima de cognitive complexity 15 (Biome) | **22 warnings** (era 20) — pior = 65 em `EleicaoPermutasService.ts:621`; 59 em `GestaoPermutasService.ts:262`; 43 em `IngestaoPermutasService.ts:408`; 35; 31; 30; 28×2; 26; 24; 23×2; 20×2; 18×3; 17×3; 16×2 | ≤ 5 (apenas casos justificados) | ❌ + 2 vs. previous | `cd src/backend && npm run lint --max-diagnostics=200` |
| Cross-layer imports (routes → repository/client) | **6** em `routes/permutas.ts` (5 repositórios) + **1** em `routes/conexos.ts` (1 client) | 0 | ❌ inalterado vs. run anterior | `grep -n "from '\\.\\./domain/(repository\\|client)/" src/backend/routes/*.ts` |
| Domain importando de routes/lambda | 0 | 0 | ✅ | `grep -rn "from '.*lambda/\\|routes/" src/backend/domain` |
| `process.env` fora de `EnvironmentProvider` (não-teste) | **18 ocorrências** (era 25); 3 ainda em `services/conexos.ts:80,144,145` — Rule #8 violations | só em `EnvironmentProvider` + bootstrap | ⚠️ caiu 28% | `grep -rn process.env src/backend --include="*.ts" \| grep -v EnvironmentProvider \| grep -v test` |
| Hardcoded `titCod: 1` em production code | **3** ocorrências (era 5) — `ReconciliacaoPermutaService.ts:322,587` + `BorderoGestaoService.ts:113` | 0 (extrair da invoice — campo `Fin010Baixa.ts:95`) | ⚠️ caiu 40%, mas ainda viva | `grep -rn "titCod:\s*1\b" src/backend --include="*.ts" \| grep -v test` |
| Magic numbers em domain/service | **8** (`CONTA_GER_JUROS=131`, `CONTA_GER_DESCONTO=130`, `INGEST_LOCK_KEY=918273645`, `PAGE_SIZE=500`, `MAX_PAGES=50`, `ADIANTAMENTOS_CONCURRENCY=10`, `LARGURA_PADRAO=18`, `MAX_NOME_ABA=31`) | regras-chave configuráveis via `EnvironmentProvider` | ⚠️ inalterado | `grep -rnE "const [A-Z_]+ = [0-9]{2,}" src/backend/domain/service` |
| Frontend `page.tsx` — useState count | **24** (era 35) | ≤ 10 por componente | ⚠️ caiu 31%, mas ainda acima | `grep -c useState src/frontend/app/permutas/page.tsx` |
| Frontend `page.tsx` — referências a Dialog/Modal | **19** (era 39) | ≤ 3 modais por componente | ⚠️ caiu 51%, e os 5 modais agora são `dynamic()` imports — code-splitting funciona | `grep -cE "Dialog\\|Modal" src/frontend/app/permutas/page.tsx` |
| `ConexosClient.ts` (god-client antigo) | **REMOVIDO** — substituído por 1 base + 4 sub-clients | n/a | ✅ split executado | `ls src/backend/domain/client/Conexos*.ts` |
| Sub-clients Conexos (max LOC / total) | max=703 (`ConexosFinanceiroClient`), total=2228 LOC em 5 classes (era 1.956 em 1 classe) | max ≤ 400 por sub-client | ⚠️ split aconteceu; LOC max ainda 703 + 1 sub-client mistura 3 áreas (borderô+baixa+título) | `wc -l src/backend/domain/client/Conexos*.ts` |
| Sub-clients Conexos — public methods | 13 (Base, transport) + 4 (Cadastro) + 3 (Títulos) + 13 (Baixa) + 6 (Financeiro) = **39 distribuídos** (era 26 num único arquivo) | ≤ 8 por sub-client; 1 área-entidade por classe | ⚠️ ConexosBaixaClient tem 13 públicos / 3 áreas | `grep -cE "^\\s*public " src/backend/domain/client/Conexos*.ts` |
| `BorderoGestaoService.ts` — public methods | **9** (criar/listar/excluir/finalizar/estornar/cancelar/remover-baixa/statusPorAdiantamento/refreshCache) | ≤ 5 / service | ⚠️ inalterado | idem |
| `routes/permutas.ts` — rotas + imports | **25 rotas, 29 imports** (inalterado) | ≤ 10 rotas/arquivo, ≤ 15 imports | ❌ inalterado | `grep -cE "router\\.(get\\|post\\|put\\|delete)"; grep -c '^import '` |
| Ontologia — `_index.json` accuracy | 100% (sample 5/5) | 100% | ✅ | check manual |
| Ontologia — `_coverage.json` drift | v0.4.0 / 2026-06-24 — `entities_coverage_pct=93`, `actions_coverage_pct=95`, 8/8 business-rules implementadas (4 com teste) | sync ≤ 1 feature de atraso | ✅ inalterado | `ontology/_coverage.json` |
| Polimorfismo / DI tokens (Defer Binding) | **1 token** (`LEGACY_CONEXOS_TOKEN`, `Symbol('LegacyConexosShape')` em `ConexosBaseClient.ts:5`, registrado em `appContainer.ts` via `useValue`) — antes 0 | aceitável para domínio mono-cliente | ✅ **melhoria real** (1ª vez que tsyringe token entra em produção) | `grep -rn "container\\.register\\|TOKEN" src/backend` |
| Feature-flags de runtime para regras críticas | **2** (`CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) | ≥ 1 por integração de escrita | ✅ inalterado | `EnvironmentProvider.ts` |
| ADRs por feature (binding history) | **14 ADRs** (`ontology/decisions/`) cobrindo 5 milestones de Permutas | ≥ 1 por feature M | ✅ inalterado | `ls ontology/decisions/` |

> ⚠️ **Não medível localmente sem ferramenta dedicada**:
> - Acoplamento estrutural (LCOM4, Ca/Ce, cyclic deps): requer `madge`/`dependency-cruiser` — não instalado. Aproximação por grep aqui.
> - Time-to-change real por feature: requer instrumentação `start_at`/`merged_at` em `_coverage.json`.

### Apêndice A1 — Top-10 maiores arquivos de produção (insumo do cross-cutting risk map)

| # | Arquivo | LOC | Δ vs. 2026-06-26-0058 | Tipo / Sinal |
|---|---|---:|---:|---|
| 1 | `src/frontend/app/permutas/page.tsx` | **1026** | **−65% (2971→1026)** | god-component **reduzido**; ainda 24 useState · 19 Dialog refs · 25 Tabs — segue P2 |
| 2 | `src/backend/domain/service/permutas/EleicaoPermutasService.ts` | 911 | +14 (+1.6%) | complexity-65 (`buildCandidata` linha 621) — pior função do repo |
| 3 | `src/backend/routes/permutas.ts` | 772 | 0 | 25 rotas, 29 imports, **6 cross-layer** (5 repos + intent de ser composer) |
| 4 | `src/frontend/app/permutas/BorderosPanel.tsx` | 711 | +28 (+4%) | sub-página borderô cresceu; 13 useState, 20 Dialog/Modal refs, 17 imports |
| 5 | `src/backend/domain/client/ConexosFinanceiroClient.ts` | **703** | **NOVO (era parte do god 1956)** | sub-client emergiu acima do alvo 600; 6 public methods (1 área = financeiro/invoice/adiantamento — coeso); complexity-24 + complexity-18 |
| 6 | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` | **662** | **+120 (+22%)** | cresceu pós-write-back fin010; **ganhou complexity-31** em `:90`; 3× titCod:1 hardcoded |
| 7 | `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` | 641 | +12 | 2 funções complexity 18/17; SQL raw em queries longas |
| 8 | `src/backend/domain/service/permutas/GestaoPermutasService.ts` | 537 | +2 | 4 warnings (complexity 59 em `toPendente`, 28, 23, 16) |
| 9 | `src/frontend/lib/api.ts` | 523 | 0 | API client monolítico do frontend |
| 10 | `src/backend/domain/service/permutas/BorderoGestaoService.ts` | 508 | +3 | 9 public methods (broadest service); 1× titCod:1 hardcoded |

### Apêndice A2 — Top serviços/clients por fan-in (quem rompe quando muda)

| Componente | Fan-in (arquivos prod, excl. testes) | Risco se mudar contrato |
|---|---:|---|
| `EleicaoPermutasService` | **4** | composto em IngestaoPermutasService, AlocacaoPermutasService, GestaoPermutasService, RelatorioExportService — mudar contrato vaza |
| `VariacaoCambialPermutaService` | 3 | composto em Eleição/Gestão/Reconciliação |
| `GestaoPermutasService` | 3 | painel + reconciliação + relatórios |
| `ConexosBaseClient` (transport) | 5 (4 sub-clients + legacyAdapter) | base do split CC-2; contrato `paginate/callList/parseDate` é blast-radius máximo |
| `ConexosFinanceiroClient` | 2 (EleicaoPermutasService, GestaoPermutasService) | endpoint de invoice/adiantamento |
| `ConexosBaixaClient` | 2 (ReconciliacaoPermutaService, BorderoGestaoService) | risco arquitetural #1 (write-back fin010) concentrado aqui |
| `ConexosTitulosClient` | 1 (AlocacaoPermutasService) | acoplamento sob controle |
| `ReconciliacaoPermutaService`, `IngestaoPermutasService`, `AlocacaoPermutasService`, `BorderoGestaoService`, `ElegibilidadeService` | 2 cada | acoplamento sob controle |
| `RelatorioExportService`, `ReconciliacaoLotePermutaService`, `IngestaoCoalescerService`, `PainelService`, `CasamentoInvoiceService`, `AgingService` | 1 cada | ponto único — barato modificar |

> Fan-in lateral entre services continua sob controle (max=4 em EleicaoPermutasService). O **novo** ponto de fan-in alto é o `ConexosBaseClient` (5) — esperado pelo split CC-2 (centraliza transport+auth). É a fronteira certa para concentrar coesão, mas é onde uma mudança quebradora rebota em todos os sub-clients — instrumentar bem (testes do BaseClient são o gate desse split).

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | **CC-1 e CC-2 executados** (page.tsx 2971→1026; ConexosClient 1956→removido; sub-clients + abas). Sobram 7 arquivos > 600 LOC (page.tsx 1026, EleicaoPermutasService 911, routes/permutas 772, BorderosPanel 711, ConexosFinanceiroClient 703, ReconciliacaoPermutaService 662, PermutaRelationalRepository 641) | ⚠️ parcial — grandes splits feitos; tier 2 ainda pendente | `find -exec wc -l` + A1 |
| **Increase Semantic Coherence** | Sub-clients novos são quase 1:1 com área-entidade (Financeiro, Títulos, Cadastro, Base/transport). **Exceção**: `ConexosBaixaClient` (481 LOC) une borderô + baixa + título-validate (13 públicos, 3 áreas). `page.tsx` agora coordena 5 abas (Automáticas, Múltiplas, CrossOver, CrossProcess, Histórico) — coesão do orquestrador ainda aceitável. `BorderoGestaoService` continua misturando CRUD borderô + status PERMUTA→BORDERÔ + cache | ⚠️ parcial — grande melhoria, restam 2 violações | `ConexosBaixaClient.ts:67-464`; `BorderoGestaoService.ts:1-508` |
| **Encapsulate** | `titCod: 1` ainda vaza em 3 pontos (era 5; melhora 40%). `CONTA_GER_JUROS/DESCONTO` (130/131) literais em `ReconciliacaoPermutaService.ts:17,24`. `routes/permutas.ts` injeta 5 repositórios diretamente — fronteira do Service ignorada. **Positivo**: sub-clients Conexos encapsulam contratos de endpoint em classes coesas (`gravarBaixaPermuta`, `criarBordero`, etc.) | ⚠️ parcial — split CC-2 ajudou; hardcodes seguem | `ReconciliacaoPermutaService.ts:322,587`, `BorderoGestaoService.ts:113`, `routes/permutas.ts:13-17`, `ReconciliacaoPermutaService.ts:17,24` |
| **Use an Intermediary** | DI via `tsyringe` (`@injectable`/`@singleton`) em todo o backend; `EnvironmentProvider` intermedeia config; `LEGACY_CONEXOS_TOKEN` agora intermedeia o adapter Conexos (1ª aparição real de token). Falta intermediário entre `routes` e `repository`: 6 imports route→repo/client diretos | ✅ progrediu (token novo) ⚠️ parcial (route skipping persiste) | `appContainer.ts:62-65`; `ConexosBaseClient.ts:5,125`; `routes/permutas.ts:13-17` |
| **Restrict Dependencies** | Convenção DDD documentada (CLAUDE.md "Lambda → Service → Repository → Client"); `PatternGuardian` agent declarado, mas Biome **ainda não tem** `noRestrictedImports`; PatternGuardian segue não bloqueando os 6 imports route→repo/client hoje vivos | ❌ ausente como gate automatizado (inalterado vs. run anterior) | `biome.json` (sem `noRestrictedImports`); violations em `routes/permutas.ts:13-17`, `routes/conexos.ts:4` |
| **Refactor** | **22 warnings** de cognitive-complexity abertos (era 20; **regrediu**). Pior função = 65 (`buildCandidata`) inalterada; `toPendente` 58→59; **nova** function complexity-31 em `ReconciliacaoPermutaService:90`. Não há ratchet decrescente | ❌ pisos crescentes (drift acelerou) | `npm run lint` (22 warnings) |
| **Abstract Common Services** | `RetryExecutor`, `FallbackExecutor`, `PollExecutor`, `ApiGatewayHandler`, `LogService`, `EnvironmentProvider` presentes e usados. **Novo**: `ConexosBaseClient` (transport, paginate, parseDate, isPago) emergiu como camada compartilhada entre sub-clients via composição (`@inject(ConexosBaseClient)`). Ausente ainda: abstração `Invoice.tituloAlvoTitCod()`, plano de contas Columbia | ⚠️ parcial (Base emergiu; domínio ainda falta) | `ConexosBaseClient.ts:120-321`; faltas em `ReconciliacaoPermutaService` |
| **Defer Binding — configuration files** | `EnvironmentProvider` + 2 feature flags (`CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN`) cobrindo o gate crítico. 8 magic numbers em services — 3 deles são regras de negócio (contas 130/131, lock-key 918273645) ainda hardcoded | ⚠️ parcial (bom no write-gate, fraco em regras numéricas — inalterado) | `EnvironmentProvider.ts:69,96`; `ReconciliacaoPermutaService.ts:17,24` |
| **Defer Binding — polymorphism** | **1 token novo** (`LEGACY_CONEXOS_TOKEN`) com `container.register(..., { useValue: adapter })` — 1ª aparição real de polimorfismo via tsyringe. Demais classes seguem resolvendo por construtor concreto | ✅ progrediu (era 0) | `appContainer.ts:62`; `ConexosBaseClient.ts:5,125` |
| **Defer Binding — plugin / runtime registration** | Não aplicável hoje — domínio mono-tenant. ADR-0014 versionou binding via dados | N/A — irrelevante até multi-tenant entrar | — |

## 4. Findings (achados)

### F-modifiability-1: Split CC-1 (page.tsx) executado — **resolvido com follow-up P2 residual**

- **Severidade**: P2 (era P0)
- **Tactic violada**: Split Module · Increase Semantic Coherence (parcialmente recuperadas)
- **Localização**: `src/frontend/app/permutas/page.tsx:1-1026` + `src/frontend/app/permutas/components/{AbaAutomaticas,AbaMultiplas,AbaCrossOver,AbaCrossProcess,AbaHistorico,VisaoGeralTable,ConfirmarProcessamentoDialog,ConfirmarLoteDialog,IngestaoDialog,AlocarDialog,ReconciliarDialog,useIngestao,usePermutasData,useExportRelatorios,tabela-filtro,format,ui}.{ts,tsx}`
- **Evidência (objetiva)**:
  ```
  page.tsx LOC: 2971 → 1026 (−65%)
  5 abas extraídas: AbaAutomaticas (245), AbaMultiplas (45), AbaCrossOver (44), AbaCrossProcess (45), AbaHistorico (98)
  5 modais agora `dynamic(() => import(...))` lazy-loaded (page.tsx:78-91): ConfirmarProcessamentoDialog (137), ConfirmarLoteDialog (72), IngestaoDialog (139), AlocarDialog (308), ReconciliarDialog (210)
  4 hooks: useIngestao (65), usePermutasData (56), useExportRelatorios (30), useTabelaFiltro (em tabela-filtro.tsx)
  useState count: 35 → 24 (−31%)
  Dialog/Modal refs: 39 → 19 (−51%)
  TabsContent/TabsTrigger refs: 25 (inalterado; orquestrador segue dirigindo as 5 abas)
  VisaoGeralTable extraído (486 LOC) — segue grande mas é leaf component
  ```
- **Impacto técnico**: cobertura por componente agora viável (frontend tem 12 arquivos de teste vs. ~baixo pré-split). Conflito por merge entre features paralelas cai (cada aba vive em arquivo próprio). Modais code-split: bundle inicial menor.
- **Impacto de negócio**: feature SISPAG (aba nova) tem precedente arquitetural para nascer em `components/AbaSispag.tsx` sem tocar page.tsx grande; velocity esperada +30% em UI nova.
- **Métrica de baseline (residual)**: page.tsx 1026 LOC (alvo ≤ 600); 24 useState (alvo ≤ 10); 19 Dialog refs (alvo ≤ 3). VisaoGeralTable 486 LOC (alvo ≤ 400).

### F-modifiability-2: Split CC-2 (ConexosClient) executado — **resolvido com follow-up P2 residual em ConexosBaixaClient**

- **Severidade**: P2 (era P0)
- **Tactic violada**: Split Module · Increase Semantic Coherence (parcialmente recuperadas)
- **Localização**: `src/backend/domain/client/ConexosBaseClient.ts:1-319` + `ConexosCadastroClient.ts:1-263` + `ConexosTitulosClient.ts:1-338` + `ConexosBaixaClient.ts:1-481` + `ConexosFinanceiroClient.ts:1-703` + `legacyConexosAdapter.ts:1-124`
- **Evidência (objetiva)**:
  ```
  ConexosClient.ts (1956 LOC): REMOVIDO
  Substituído por:
    ConexosBaseClient.ts       319  13 publics  (transport: paginate, callList, parseDate, isPago)
    ConexosCadastroClient.ts   263   4 publics  (filial/cadastro)
    ConexosTitulosClient.ts    338   3 publics  (títulos)
    ConexosBaixaClient.ts      481  13 publics  (borderô + baixa + título-validate — 3 áreas!)
    ConexosFinanceiroClient.ts 703   6 publics  (financeiro/invoice/adiantamento — 1 área coesa)
    legacyConexosAdapter.ts    124   0 publics  (pass-through axios legacy)
  Total: 2228 LOC em 6 arquivos (vs. 1956 em 1)
  1º uso real de tsyringe token: LEGACY_CONEXOS_TOKEN (Symbol em ConexosBaseClient.ts:5; useValue register em appContainer.ts:62)
  Sub-clients consomem o base por composição: `@inject(ConexosBaseClient)` (ConexosBaseClient.ts:111)
  ```
- **Impacto técnico**: services injetam só o sub-client que precisam (Interface Segregation). Próxima frente SISPAG pode nascer com `SispagPagamentoClient` próprio reusando `ConexosBaseClient` (transport + auth + paginação). Write-back fin010 (risco arquitetural #1) concentra-se em `ConexosBaixaClient.gravarBaixaPermuta` (linha 464).
- **Impacto de negócio**: gargalo de review do client desbloqueado; SISPAG pode entrar em paralelo sem conflito de arquivo.
- **Métrica de baseline (residual)**:
  - `ConexosFinanceiroClient.ts` = 703 LOC (alvo ≤ 600).
  - `ConexosBaixaClient.ts` mistura 3 áreas (borderô + baixa + título-validate) e 13 publics (alvo ≤ 8 e 1 área/classe) — viola Increase Semantic Coherence; extrair `ConexosTituloValidationClient` (validarTituloBaixa, validarTituloPermuta).
  - Complexity em sub-clients: 24 em `ConexosFinanceiroClient.ts:433`, 18 em `ConexosFinanceiroClient.ts:165`, 20 em `ConexosCadastroClient.ts:113` — herdadas do código original; refatorar como parte do follow-up.

### F-modifiability-3: 22 warnings de cognitive-complexity (era 20) — drift acelerou, 1 nova função complexity-31

- **Severidade**: P1
- **Tactic violada**: Refactor
- **Localização**: múltiplos — top hits:
  - `domain/service/permutas/EleicaoPermutasService.ts:621` — **complexity 65** (`buildCandidata`) — **inalterado** vs. run anterior
  - `domain/service/permutas/GestaoPermutasService.ts:262` — **complexity 59** (`toPendente`) — era 58
  - `domain/service/permutas/IngestaoPermutasService.ts:408` — **complexity 43** (`toCasamentoRows`) — inalterado
  - `domain/service/permutas/IngestaoPermutasService.ts:293` — **complexity 35** — era 33
  - `domain/service/permutas/ReconciliacaoPermutaService.ts:90` — **complexity 31** — **NOVO** (regressão pós-crescimento do arquivo +120 LOC)
  - `domain/service/permutas/ReconciliacaoLotePermutaService.ts:80` — 30
- **Evidência (objetiva)**:
  ```
  $ cd src/backend && npm run lint --max-diagnostics=200
  Found 22 warnings.
  (top-6 acima; 22 totais inclui complexity 24, 23×2, 20×2, 18×3, 17×3, 16×2)
  ```
- **Impacto técnico**: 22 funções acima de 15 = 22 superfícies onde cada `if`/`switch` novo multiplica caminhos não-testados. As 6 funções > 30 são intratáveis por teste unitário 100%. **Drift confirmado** (era 20, agora 22) — sem ratchet, o número só cresce.
- **Impacto de negócio**: regressões silenciosas em regras de elegibilidade-permuta e reconciliação — exatamente o nó onde a precisão importa para o write-back fin010.
- **Métrica de baseline**: 22 warnings (alvo ≤ 5); pior função = 65 (alvo ≤ 15); novas funções P1 (ReconciliacaoPermutaService:90) = 1.

### F-modifiability-4: `routes/permutas.ts` importa repositórios diretamente — layer skip inalterado

- **Severidade**: P1
- **Tactic violada**: Restrict Dependencies · Use an Intermediary · Encapsulate
- **Localização**: `src/backend/routes/permutas.ts:13-17` + `src/backend/routes/conexos.ts:4`
- **Evidência (objetiva)**:
  ```
  routes/permutas.ts:13: import ClienteFiltroRepository ...
  routes/permutas.ts:14: import PermutaProcessamentoRepository ...
  routes/permutas.ts:15: import PermutaExecucaoRepository ...
  routes/permutas.ts:16: import PermutaRelationalRepository ...
  routes/permutas.ts:17: import PermutaSnapshotRepository ...
  routes/conexos.ts:4:   import ConexosCadastroClient ...
  ```
  Inalterado vs. 2026-06-26-0058 — nenhum dos cards modifiability-4/-9 foi executado. CLAUDE.md DDD: **Lambda → Service → Repository → Client**.
- **Impacto técnico**: cada mudança de schema (SQL) ou de contrato de sub-client pode obrigar tocar a rota também — quebra o "uma alteração, um arquivo".
- **Impacto de negócio**: meta migração para Lambda fica mais cara — handlers Lambda terão de absorver lógica que deveria estar em services.
- **Métrica de baseline**: 6 imports cross-layer (alvo 0); regras `noRestrictedImports` no Biome = 0.

### F-modifiability-5: `titCod: 1` ainda hardcoded em 3 pontos (era 5)

- **Severidade**: P1
- **Tactic violada**: Encapsulate · Abstract Common Services
- **Localização**:
  - `domain/service/permutas/ReconciliacaoPermutaService.ts:322` (`titulos = [{ titCod: 1, … }]` no fallback)
  - `domain/service/permutas/ReconciliacaoPermutaService.ts:587`
  - `domain/service/permutas/BorderoGestaoService.ts:113`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "titCod:\s*1\b" src/backend --include="*.ts" | grep -v test
  ReconciliacaoPermutaService.ts:322:            titulos = [{ titCod: 1, usd: aloc.valorAlocado, taxa: aloc.taxaInvoice }];
  ReconciliacaoPermutaService.ts:587:            titCod: 1,
  BorderoGestaoService.ts:113:                titCod: 1,
  ```
  Melhora vs. 5 ocorrências anteriores, mas a invariante `Invoice.tituloAlvoTitCod()` continua não centralizada. Inbox `ontology/_inbox/permuta-multi-titulo-pendente.md` segue aberto.
- **Impacto técnico**: quando invoice multi-título aparecer, 3 lugares vão dar baixa no título errado.
- **Impacto de negócio**: estouro silencioso no `fin010` (risco arquitetural #1 ainda em validação); cada `/feature-new` que tocar reconciliação ainda pode replicar.
- **Métrica de baseline**: 3 ocorrências (alvo 0); inbox `permuta-multi-titulo-pendente.md` ainda aberto.

### F-modifiability-6: Regras numéricas de domínio (contas 130/131) hardcoded em service — inalterado

- **Severidade**: P1
- **Tactic violada**: Defer Binding — configuration files
- **Localização**: `domain/service/permutas/ReconciliacaoPermutaService.ts:17,24`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:17: const CONTA_GER_JUROS = 131;
  ReconciliacaoPermutaService.ts:24: const CONTA_GER_DESCONTO = 130;
  ```
  Inalterado vs. run anterior.
- **Impacto técnico**: reclassificação do plano de contas exige redeploy. Não há override por ambiente nem por tenant.
- **Impacto de negócio**: meta SaaSo (CLAUDE.md) bloqueada — cada cliente novo força fork de code-path.
- **Métrica de baseline**: 2 constantes hardcoded (alvo 0).

### F-modifiability-7: Legacy `services/conexos.ts` ainda lê `process.env` — Rule #8 violation persistente

- **Severidade**: P2
- **Tactic violada**: Use an Intermediary (EnvironmentProvider) · Encapsulate
- **Localização**: `src/backend/services/conexos.ts:80,144,145` (+ função `_doLogin` complexity-17)
- **Evidência (objetiva)**:
  ```
  $ grep -n "process\.env" src/backend/services/conexos.ts
  80:        baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api',
  144:        const username = process.env.CONEXOS_USERNAME;
  145:        const password = process.env.CONEXOS_PASSWORD;
  ```
  Caiu de 4 para 3 (uma var deixou de ser usada), mas Rule #8 segue violada. Total `process.env` fora do EnvironmentProvider no backend: 18 (era 25) — debt diminui mas linha de defesa zero ainda não foi atingida.
- **Impacto técnico**: configura sessão e credenciais fora do EnvironmentProvider — fonte de verdade divergente.
- **Impacto de negócio**: meta multi-tenant inviável sem migrar.
- **Métrica de baseline**: 3 `process.env` em service legado (alvo 0); 1 função `_doLogin` complexity 17.

### F-modifiability-8: `routes/permutas.ts` 25 rotas / 29 imports — split por área pendente

- **Severidade**: P2
- **Tactic violada**: Split Module
- **Localização**: `src/backend/routes/permutas.ts:1-772`
- **Evidência (objetiva)**:
  ```
  router.get|post|put|delete count: 25 (inalterado)
  imports count: 29 (inalterado; 6 cross-layer)
  ```
- **Impacto técnico**: dois devs em features distintas (e.g., SISPAG nova vs. tweak Borderô) ainda vão conflitar no mesmo arquivo de rota.
- **Impacto de negócio**: paralelismo entre frentes (Permutas-tweak vs SISPAG-new vs Popula GED) emperra no entrypoint.
- **Métrica de baseline**: 25 rotas / 772 LOC (alvo ≤ 10 rotas e ≤ 300 LOC).

### F-modifiability-9: Sem `noRestrictedImports` no Biome — PatternGuardian segue honor-system

- **Severidade**: P3
- **Tactic violada**: Restrict Dependencies (como gate automatizado)
- **Localização**: `src/backend/biome.json` (regra ausente) + dependência implícita no agent `PatternGuardian`
- **Evidência (objetiva)**: `biome.json` (raiz) não declara `lint.style.noRestrictedImports`; as 6 violações de F-modifiability-4 existem e persistem porque nada bloqueia no CI.
- **Impacto técnico**: PatternGuardian roda fora do compilador; humano pode mergear no main bypassando-o (e mergeou — F-4 continua).
- **Impacto de negócio**: invariantes arquiteturais entram em deriva sem aviso.
- **Métrica de baseline**: 0 regras de `noRestrictedImports` (alvo: ≥ 1 — `routes/** !-> domain/repository/**`, `routes/** !-> domain/client/**`).

### F-modifiability-10: `ConexosBaixaClient` (481 LOC) mistura borderô + baixa + título-validate — split residual do CC-2

- **Severidade**: P2 (novo, derivado do CC-2)
- **Tactic violada**: Increase Semantic Coherence · Split Module
- **Localização**: `src/backend/domain/client/ConexosBaixaClient.ts:67-464`
- **Evidência (objetiva)**:
  ```
  Public methods em ConexosBaixaClient (13 totais, 3 áreas):
    BORDERÔ (7):   criarBordero, getBordero, listBorderos, excluirBordero,
                   finalizarBordero, cancelarBordero, estornarBordero
    BAIXA (3):     listBaixas, excluirBaixa, atualizarValorLiquido
    TÍTULO (3):    validarTituloBaixa, validarTituloPermuta, gravarBaixaPermuta
  Risco arquitetural #1 (write-back fin010) concentrado em gravarBaixaPermuta (linha 464)
  ```
  O resto dos sub-clients é coeso (Financeiro = 1 área; Cadastro = 1 área; Títulos = 1 área; Base = transport). Só este viola 1 classe = 1 área.
- **Impacto técnico**: services que precisam só de validação de título recebem também o blast-radius de borderô; testes do sub-client são grandes (`ConexosSubClients.test.ts` = 70k bytes).
- **Impacto de negócio**: a próxima iteração do write-back (validar 1º caso real, refinar invariante `titCod`) vai pressionar este arquivo — ele tende a virar god-client 2.0 se não for re-particionado.
- **Métrica de baseline**: 481 LOC, 13 publics, 3 áreas (alvo: ≤ 8 publics e 1 área/classe).

## 5. Cards Kanban

### [modifiability-1] Reduzir `page.tsx` (1026 LOC) abaixo de 600 — completar o split CC-1

- **Problema**
  > Pós-split CC-1, `page.tsx` caiu de 2971 para 1026 LOC (−65%) — ganho enorme. Ainda assim ultrapassa o alvo ≤ 600 LOC; segue com 24 useState e 19 referências a Dialog/Modal. `VisaoGeralTable.tsx` (486 LOC) é o maior leaf component e merece um sub-split por seção.
- **Melhoria Proposta**
  > Split Module + Increase Semantic Coherence (continuação): mover o estado dos 5 modais para `usePermutasModals()` hook; agrupar filtros em `PermutasFiltroProvider` (context) para reduzir useState do orquestrador; particionar `VisaoGeralTable` em `VisaoGeralHeader` + `VisaoGeralRow` + `VisaoGeralFooter`. Considerar mover cada aba para `app/permutas/<tab>/page.tsx` (Next.js route segments) — usar `layout.tsx` para o shell de KPIs/filtros.
- **Resultado Esperado**
  > `page.tsx` ≤ 500 LOC; useState ≤ 10; Dialog refs ≤ 5 (já são lazy-loaded). Cobertura por componente continua subindo.
- **Tactic alvo**: Split Module · Increase Semantic Coherence
- **Severidade**: P2 (rebaixado de P0 após CC-1)
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - LOC `page.tsx`: **1026 → ≤ 500**
  - useState count: **24 → ≤ 10**
  - Dialog/Modal refs: **19 → ≤ 5** (ou portal único)
  - LOC `VisaoGeralTable.tsx`: **486 → ≤ 300**
- **Risco de não fazer**: SISPAG aba nova vai estabilizar `page.tsx` em ~1200 LOC; conflito de merge entre frentes volta.
- **Dependências**: nenhuma.

### [modifiability-2] Extrair `ConexosTituloValidationClient` de `ConexosBaixaClient` (split residual CC-2)

- **Problema**
  > Pós-split CC-2, `ConexosBaixaClient.ts` (481 LOC, 13 publics) é o **único** sub-client que mistura 3 áreas-entidade (7 publics de borderô + 3 de baixa + 3 de título-validate). Os outros sub-clients são 1:1 com área. `ConexosFinanceiroClient.ts` segue acima do alvo (703 LOC > 600), embora coeso (1 área).
- **Melhoria Proposta**
  > Increase Semantic Coherence + Split Module: extrair `ConexosTituloValidationClient` (`validarTituloBaixa`, `validarTituloPermuta`, `gravarBaixaPermuta`) — 3 publics centrais para o risco #1 (write-back fin010), fica testável e auditável em isolamento. Considerar separar `ConexosBorderoClient` (7 publics de borderô) de `ConexosBaixaPagamentoClient` (3 publics de baixa). Para `ConexosFinanceiroClient`, refatorar a função complexity-24 (linha 433) reduzindo o arquivo em ~80 LOC.
- **Resultado Esperado**
  > Cada sub-client = 1 área-entidade; max LOC por sub-client ≤ 400; risco arquitetural #1 isolado em `ConexosTituloValidationClient`.
- **Tactic alvo**: Increase Semantic Coherence · Split Module
- **Severidade**: P2 (rebaixado de P0 após CC-2)
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-2, F-modifiability-10
- **Métricas de sucesso**:
  - Áreas-entidade por sub-client: **3 (Baixa) → 1**
  - Public methods por sub-client: max **13 → ≤ 8**
  - LOC `ConexosFinanceiroClient.ts`: **703 → ≤ 600**
  - LOC `ConexosBaixaClient.ts`: **481 → ≤ 300** (após extrair Tit.Validation)
- **Risco de não fazer**: o sub-client Baixa vira novo god-client à medida que a frente Reconciliação amadurece (já cresceu +120 LOC no Reconciliação adjacente).
- **Dependências**: nenhuma (DI tokens já existem).

### [modifiability-3] Reduzir as 22 funções acima de cognitive-complexity 15 — top-6 primeiro

- **Problema**
  > `npm run lint` reporta 22 warnings (era 20 — drift de +2 na semana). Seis estão acima de 30: 65 (`buildCandidata`), 59 (`toPendente`), 43 (`toCasamentoRows`), 35 (sub-função do mesmo), 31 (nova em `ReconciliacaoPermutaService:90`), 30 (`ReconciliacaoLotePermutaService:80`). Sem ratchet, o número só cresce.
- **Melhoria Proposta**
  > Refactor: extrair funções puras (`buildCandidataGate1`, `Gate2Hidratacao`, `Gate3Pago` — o próprio código já fala em gates); aplicar early-return; mover branches de apresentação (`toPendente`) para `selectors/permutaPresenter.ts`. Adicionar ratchet no CI (ver card `modifiability-9`): warning atual = 22; PR só passa se ≤ atual.
- **Resultado Esperado**
  > Warnings: **22 → ≤ 5**; pior complexity: **65 → ≤ 15**; tempo de review dessas funções cai pela metade.
- **Tactic alvo**: Refactor
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) para top-6; L para os 22
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - `noExcessiveCognitiveComplexity` warnings: **22 → ≤ 5**
  - Pior complexity: **65 → ≤ 15**
- **Risco de não fazer**: regressões em elegibilidade-permuta e reconciliação fin010 — exatamente o nó onde Columbia depende de precisão.
- **Dependências**: nenhuma; sinérgico com `modifiability-9` (ratchet).

### [modifiability-4] Bloquear cross-layer imports no Biome (`noRestrictedImports`)

- **Problema**
  > `routes/permutas.ts:13-17` importa 5 repositórios e `routes/conexos.ts:4` importa `ConexosCadastroClient` — burlando a regra DDD do CLAUDE.md ("Lambda → Service → Repository → Client"). PatternGuardian não bloqueou; Biome não tem `noRestrictedImports` configurado. **Inalterado** vs. run anterior — sem gate, debt persiste.
- **Melhoria Proposta**
  > Restrict Dependencies: ativar `lint.style.noRestrictedImports` no `biome.json` raiz com regras `src/backend/routes/** !-> src/backend/domain/repository/**` e `src/backend/routes/** !-> src/backend/domain/client/**` (preparando o alvo Lambda). Encapsular os 6 usos atuais em `PermutaTrilhaService` (wrap dos 5 repos) e `ConexosHealthService` (wrap do client em `routes/conexos.ts`).
- **Resultado Esperado**
  > 0 cross-layer imports; PatternGuardian + Biome convergem (lint vira gate); preparação para o alvo Lambda — handlers só sabem de services.
- **Tactic alvo**: Restrict Dependencies · Use an Intermediary · Encapsulate
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-4, F-modifiability-9
- **Métricas de sucesso**:
  - Cross-layer imports rota→repo/client: **6 → 0**
  - Regras `noRestrictedImports`: **0 → ≥ 2**
- **Risco de não fazer**: drift compounding; cada `/feature-new` pode adicionar mais imports proibidos.
- **Dependências**: nenhuma.

### [modifiability-5] Encapsular `titCod` da invoice — remover hardcode `titCod: 1` (3 pontos)

- **Problema**
  > 3 lugares em produção (era 5) ainda fixam `titCod: 1` ao montar payloads do fin010 (`ReconciliacaoPermutaService:322,587`; `BorderoGestaoService:113`). Inbox `permuta-multi-titulo-pendente.md` aberto; cenário "vc-multi-titulo" já anotado no código.
- **Melhoria Proposta**
  > Encapsulate + Abstract Common Services: introduzir `Invoice.tituloAlvoTitCod()` (ou `resolveTituloBaixa(invoice)`) no domínio — derivar do detalhe do título quando disponível, fallback explícito a `1` + log de aviso. Substituir os 3 literais; adicionar teste de regressão multi-título com fixture sintética. Atualizar `business-rules/fin010-write-contract.md`.
- **Resultado Esperado**
  > 0 literais `titCod: 1` em production; risco arquitetural #1 sai com invariante explícita.
- **Tactic alvo**: Encapsulate · Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - Literais `titCod: 1` em production: **3 → 0**
  - Inbox `permuta-multi-titulo-pendente.md`: **aberto → fechado** (com teste canônico)
- **Risco de não fazer**: baixa em título errado no fin010 quando 1ª invoice multi-título aparecer em produção.
- **Dependências**: alinhamento com `qa-integrability` (mesma fronteira).

### [modifiability-6] Externalizar contas gerenciais (130/131) e regras numéricas do plano de contas

- **Problema**
  > `CONTA_GER_JUROS = 131` e `CONTA_GER_DESCONTO = 130` vivem como `const` em `ReconciliacaoPermutaService.ts:17,24`. Decisão Columbia (P1-2 no `_coverage.json`). **Inalterado** vs. run anterior. Se a Columbia reclassificar contas ou se um 2º cliente entrar (alvo SaaSo), exige redeploy.
- **Melhoria Proposta**
  > Defer Binding — configuration files: mover para `EnvironmentVars` (`columbiaContasGerenciais: { juros, desconto }`) via `EnvironmentProvider`. Em SSM (alvo) ficam por-tenant; localmente, via `.env`. Para `INGEST_LOCK_KEY` e `PAGE_SIZE`, manter como constantes técnicas, mas documentar como tal.
- **Resultado Esperado**
  > Trocar plano de contas vira mudança de configuração; SaaSo multi-tenant fica viável sem fork de código.
- **Tactic alvo**: Defer Binding — configuration files · Use an Intermediary
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - Regras de negócio numéricas hardcoded em service: **2 → 0**
  - Override por tenant: **impossível → suportado**
- **Risco de não fazer**: cada release que altera o plano queima ciclo de deploy completo (overlap com **Deployability**).
- **Dependências**: nenhuma.

### [modifiability-7] Migrar `services/conexos.ts` legado para `EnvironmentProvider`

- **Problema**
  > `services/conexos.ts:80,144,145` lê `CONEXOS_BASE_URL`, `CONEXOS_USERNAME`, `CONEXOS_PASSWORD` direto de `process.env` — Rule #8 violation. Caiu de 4 para 3 mas o adapter persiste. Função `_doLogin` ainda complexity 17.
- **Melhoria Proposta**
  > Use an Intermediary: substituir leituras por `EnvironmentProvider.getEnvironmentVars()` (campos `conexosApiUrl`, `conexosLogin`, `conexosPassword` já existem — usados em `appContainer.ts:57-60`). Estender ratchet `process.env outside EnvironmentProvider` no CI: contagem atual = 18 backend; bloquear crescimento.
- **Resultado Esperado**
  > 100% credenciais Conexos via EnvironmentProvider; preparação para SSM (alvo). Migration debt B3 sai de PARTIAL para CLOSED.
- **Tactic alvo**: Use an Intermediary · Encapsulate
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - `process.env.CONEXOS_*` em service legado: **3 → 0**
  - Função `_doLogin` complexity: **17 → ≤ 15**
- **Risco de não fazer**: meta SaaSo (CLAUDE.md) inviável; secret rotation precisa de dois lugares.
- **Dependências**: rodar antes da poda total do adapter (ADR-0003 manteve só o transport).

### [modifiability-8] Quebrar `routes/permutas.ts` (25 rotas) por área de domínio

- **Problema**
  > 25 rotas e 29 imports em um único `routes/permutas.ts:1-772`. Mistura eleição, gestão, alocação, borderô, reconciliação, ingestão, status, relatórios. **Inalterado** vs. run anterior.
- **Melhoria Proposta**
  > Split Module: criar `routes/permutas/index.ts` (composer) + sub-routers `eleicao.ts`, `gestao.ts`, `alocacao.ts`, `bordero.ts`, `reconciliacao.ts`, `ingestao.ts`, `relatorios.ts`. Cada sub-router ≤ 10 rotas, ≤ 300 LOC. Reaproveita os services existentes (não muda DI).
- **Resultado Esperado**
  > Maior arquivo de rota cai para ≤ 300 LOC; conflito por merge entre frentes some; preparação para `lambda/api/permutas/*` do alvo.
- **Tactic alvo**: Split Module
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-8
- **Métricas de sucesso**:
  - LOC maior `routes/*.ts`: **772 → ≤ 300**
  - Rotas por arquivo: **25 → ≤ 10**
- **Risco de não fazer**: ramo permanente de conflito ao ligar SISPAG/GED.
- **Dependências**: rodar depois do `modifiability-4` (assim os repos saem da rota antes do split).

### [modifiability-9] Ratchet de qualidade no CI — congelar warnings, exigir queda

- **Problema**
  > Lint roda mas warnings não bloqueiam merge. Cognitive-complexity warnings subiram 20→22 sem aviso (drift confirmado); cross-layer imports (F-modifiability-4) seguem; `process.env` debt caiu organicamente mas não por gate. Não há contadores monitorados.
- **Melhoria Proposta**
  > Adicionar `scripts/lint-ratchet.ts` que conta: (a) warnings `noExcessiveCognitiveComplexity`; (b) ocorrências de `process.env` fora do EnvironmentProvider; (c) imports cross-layer; (d) ocorrências de `titCod: 1`. PR falha se qualquer contagem **subir**. Rodar no GitHub Actions junto com `npm test`.
- **Resultado Esperado**
  > Não-aumento monotônico de débito; cada feature paga ou mantém. Sinaliza dívida no PR description.
- **Tactic alvo**: Refactor · Restrict Dependencies (como gate)
- **Severidade**: P2 (subido de P3 — drift acelerou)
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-3, F-modifiability-4, F-modifiability-5, F-modifiability-7, F-modifiability-9
- **Métricas de sucesso**:
  - Warnings em ratchet: **livres → monotonicamente não-crescentes**
  - Cross-layer violations detectadas no PR: **0 → 100%**
  - Hardcode `titCod: 1` em PR: **livre → bloqueado se crescer**
- **Risco de não fazer**: drift silencioso continua; Regis-Review vira a única defesa, atuando depois do merge.
- **Dependências**: nenhuma.

### [modifiability-10] Refatorar `ReconciliacaoPermutaService` (+22% LOC, +1 complexity-31)

- **Problema**
  > `ReconciliacaoPermutaService.ts` cresceu 542 → 662 LOC (+22%) pós-write-back fin010 e ganhou uma função complexity-31 em `:90` (nova). Concentra 2 dos 3 hardcodes `titCod: 1` e as 2 constantes `CONTA_GER_*`. É o nó central do risco arquitetural #1 — e está se concentrando ali em vez de se distribuir.
- **Melhoria Proposta**
  > Refactor + Split Module + Increase Semantic Coherence: extrair `Fin010BaixaBuilder` (pure function: monta payload completo da baixa a partir de invoice+alocação) e `Fin010TituloResolver` (encapsula a regra `titCod`). Mover a função complexity-31 (`:90`) para um helper privado fatorado em early-returns. Re-rodar o `qa-fault-tolerance` depois — o `gravarBaixaPermuta` deve receber sempre payload validado.
- **Resultado Esperado**
  > LOC `ReconciliacaoPermutaService.ts` ≤ 500; 0 funções > complexity 15 no arquivo; `titCod: 1` removido junto com `modifiability-5`; `Fin010BaixaBuilder` testável isoladamente.
- **Tactic alvo**: Refactor · Split Module · Encapsulate
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-3, F-modifiability-5, F-modifiability-6
- **Métricas de sucesso**:
  - LOC: **662 → ≤ 500**
  - Funções > complexity 15: **2 → 0** no arquivo
  - Hardcodes (titCod + CONTA_GER): **4 → 0** no arquivo
- **Risco de não fazer**: o serviço mais crítico do write-back fin010 (risco arquitetural #1) está em rota de crescimento e complexidade — próxima feature SISPAG ou tweak vai puxá-lo acima de 800 LOC e estabilizar a complexidade.
- **Dependências**: sinérgico com `modifiability-5` (titCod) e `modifiability-6` (CONTA_GER).

## 6. Notas do agente

- **Veredito sobre os splits CC-1 e CC-2**: ambos foram executados com qualidade — não foi só "mover linhas", mas refatoração com tactics Bass corretas (lazy `dynamic()` para modais, composição por `@inject(ConexosBaseClient)` nos sub-clients, 1º uso real de tsyringe token via `LEGACY_CONEXOS_TOKEN`). O score sobe de **5 → 7**. Os cards `modifiability-1` e `modifiability-2` foram **rebaixados para P2** com follow-ups específicos (page.tsx ainda > 600; ConexosBaixaClient mistura 3 áreas; ConexosFinanceiroClient ainda 703 LOC).
- **Surpresa negativa — drift de complexity acelerou**: 20 → 22 warnings em uma semana; nova função complexity-31 em `ReconciliacaoPermutaService:90`; o serviço cresceu +22% LOC. Sem ratchet (card `modifiability-9` agora P2), o trade-off "feature rápida vs. complexity" tende ao lado errado.
- **Cross-QA — Integrability**: o split CC-2 cria 4 fronteiras de integração (`ConexosFinanceiroClient`, `ConexosBaixaClient`, `ConexosCadastroClient`, `ConexosTitulosClient`) onde antes havia 1; alinhar com `qa-integrability` para mapear contratos de cada sub-client (especialmente `gravarBaixaPermuta` em `ConexosBaixaClient`).
- **Cross-QA — Testability**: page.tsx desbloqueou cobertura por componente — `qa-testability` deve revisar o pulo de 0 → 12 arquivos de teste frontend e medir cobertura por sub-componente extraído. As 22 funções complexity > 15 são teto duro para cobertura unitária.
- **Cross-QA — Deployability**: F-modifiability-6 (`CONTA_GER_*` hardcoded) e F-modifiability-7 (`process.env` em service legado) implicam que cada mudança de regra numérica continua = release de versão do app. Defer-binding miss vira custo de deploy — conectar com `qa-deployability`.
