---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-24-2011
agent: qa-modifiability
generated_at: 2026-06-24T20:11:00-03:00
scope: all
score: 5.5
findings_count: 7
cards_count: 7
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista financeiro / Yuri (PO) | Pedido de mudança de regra de classificação de permuta (ex.: "tolerância de 1 USD vira 0,5"; "auto-elegível só se ≤ 80% do saldo"; nova aba "permuta-mista") | `GestaoPermutasService.exporGestao` + `toPendente` + `adtosQueUltrapassamInvoice` (+ `page.tsx` para refletir na UI) | Frente I em produção (v0.7.0), Express/Render, três tipos de permuta vivos (simples, multiplas, cross-over, cross-process) + reclassificação automática | Mudar a regra em ≤ 1 ponto do código, sem rippling para a UI nem para outros serviços; suites verdes em ≤ 5 min | Custo médio de tweak: ≤ 1 arquivo de serviço + ≤ 1 arquivo de UI tocados; ≤ 2 h end-to-end; 0 regressão em `*Service.test.ts` |

> Hoje: uma alteração nessa regra obriga editar `GestaoPermutasService.toPendente` (58 de cognitive complexity), `adtosQueUltrapassamInvoice`, `exporGestao` (28) e a derivação `tipoPermuta` em quatro pontos do `page.tsx` (2.562 LOC). O acoplamento BE↔FE no shape `tipoPermuta`/`autoElegivel` força commit cross-stack para qualquer ajuste. A tolerância de "+1 USD" e "+0,005" está duplicada literal em três sítios (`GestaoPermutasService.ts:243`, `:335`; `AlocacaoPermutasService.ts:225,239,337`).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC `GestaoPermutasService.ts` | 535 (Δ +172 = +47%) | ≤ 400 (alvo Bass: módulo de serviço) | ⚠️ | `wc -l src/backend/domain/service/permutas/GestaoPermutasService.ts` + `git diff main...HEAD --stat` |
| LOC `BorderoGestaoService.ts` | 527 (Δ +297 = +130%) | ≤ 400 | ⚠️ | idem |
| LOC `AlocacaoPermutasService.ts` | 394 (Δ +103 = +35%) | ≤ 400 | ✅ borderline | idem |
| LOC `IngestaoPermutasService.ts` | 477 (Δ +69) | ≤ 400 | ⚠️ | idem |
| LOC `EleicaoPermutasService.ts` | 889 (Δ +76) | ≤ 400 | ❌ | idem |
| LOC `routes/permutas.ts` | 620 (Δ +58) | ≤ 300 (router por feature) | ❌ | idem |
| LOC `frontend/app/permutas/page.tsx` | 2.562 (Δ +404) | ≤ 600 (page Next.js) | ❌ P0 | idem |
| LOC `frontend/app/permutas/BorderosPanel.tsx` | 678 (extraído de borderos/page.tsx, ✅ split) | ≤ 400 | ⚠️ | idem |
| Cognitive complexity `exporGestao` | **28** (max=15) | ≤ 15 | ❌ | `biome lint` (`GestaoPermutasService.ts:45`) |
| Cognitive complexity `toPendente` | **58** (max=15) | ≤ 15 | ❌ P1 | `biome lint` (`GestaoPermutasService.ts:262`) |
| Cognitive complexity `adtosQueUltrapassamInvoice` | 16 | ≤ 15 | ⚠️ | `biome lint` (`GestaoPermutasService.ts:222`) |
| Cognitive complexity `toCasamentos` | 23 | ≤ 15 | ❌ | `biome lint` (`GestaoPermutasService.ts:479`) |
| Cognitive complexity `statusPorAdiantamento` | 18 | ≤ 15 | ⚠️ | `biome lint` (`BorderoGestaoService.ts:451`) |
| Cognitive complexity `alocar` (AlocacaoPermutas) | 27 | ≤ 15 | ❌ | `biome lint` (`AlocacaoPermutasService.ts:167`) |
| Cognitive complexity `buscarInvoices` | 23 | ≤ 15 | ❌ | `biome lint` (`AlocacaoPermutasService.ts:106`) |
| Cognitive complexity `executar` (IngestaoPermutas) | 43 | ≤ 15 | ❌ | `biome lint` (`IngestaoPermutasService.ts:399`) |
| Cognitive complexity `executar` (EleicaoPermutas) | **65** (max=15) | ≤ 15 | ❌ P0 (pré-existente, agravado) | `biome lint` (`EleicaoPermutasService.ts:599`) |
| Funções backend > complex.15 (delta v0.7.0) | 14 (das 19 totais; +5 só neste PR: 3 em Gestao, 1 em Bordero, 1 em Alocacao) | ≤ 5 | ❌ | `npm run lint` agregado |
| Imports `page.tsx` (`from '@/lib/api'`) | 8 chamadas distintas no mesmo file (alocação, busca, ingestão, status, runs, gestão, reconciliar) | dividir por feature (hook por aba) | ❌ | grep `import { ... } from '@/lib/api'` |
| Public surface `BorderoGestaoService` | 9 métodos (excluirBaixa, excluirBordero, removerDaTrilha, finalizarBordero, cancelarBordero, estornarBordero, listarBorderos, listarBaixasErp, refreshCache, statusPorAdiantamento) | ≤ 5 por classe (Bass: módulo coeso) | ❌ | grep `public.*async` |
| Métodos de cache de `permuta_bordero` em `PermutaExecucaoRepository` | 4 (`listBorderoCache`, `replaceBorderoCache`, `updateBorderoCacheSituacao`, `deleteBorderoCache`) — tabela ≠ nome do repo | 0 (criar `PermutaBorderoCacheRepository`) | ❌ | `grep permuta_bordero` em `PermutaExecucaoRepository.ts` |
| Magic numbers (tolerância) em services modificados | 5 ocorrências (`+1` USD em 2 sítios; `+0.005` em 3 sítios) sem constante nomeada | 1 constante centralizada (ou config) | ❌ | grep `+ 1\|+ 0\.005` em `service/permutas/*.ts` |
| Magic numbers (paginação/limite) — Bordero | 4 (`limit=500`, `pageSize=1000`, `Math.max(limit,1),20000`, frontend `BORDEROS_MEMO_TTL=30_000`) sem documentação centralizada | 1 namespace de config (ou Defaults class) | ⚠️ | `BorderoGestaoService.ts:322,408`, `PermutaExecucaoRepository.ts:308`, `lib/api.ts:273` |
| Cross-layer violations (domain → routes/lambda) | 0 | 0 | ✅ | `grep -rn "from '.*routes\\|lambda/" src/backend/domain` |
| DDD/tsyringe nas mudanças (`@injectable`, `@inject`, arrow methods, modificadores explícitos) | 100% nos 3 services novos/alterados | 100% | ✅ | `grep '@injectable\\|public .* = async'` |
| Frontend setState-in-effect | 3 warnings (`page.tsx:172, 682`; `borderos/page.tsx:44`) | 0 | ⚠️ | `npm run lint --frontend` |

> ⚠️ **Não medível localmente**: tempo real de "ciclo de tweak" (interview → impl → green). Recomendação: instrumentar `/feature-tweak` para gravar `duration_minutes` no front-matter da entrada do `ontology/_inbox` e medir a tendência.

## 3. Tactics — Cobertura no nf-projects (delta v0.7.0)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | `BorderosPanel` foi extraído de `borderos/page.tsx` (594 → 0 LOC úteis; +678 LOC no painel reutilizável). Movimento certo. Backend NÃO foi splitado: `BorderoGestaoService` virou um "deus-painel" (cache + ações + status + baixas-ERP); `GestaoPermutasService.toPendente` segue de fora coeso mas explodiu para 58 de complexidade. | ⚠️ parcial | FE: `BorderosPanel.tsx:1-678` + import em `page.tsx:66`. BE: `BorderoGestaoService.ts:67-528` (9 métodos públicos); `GestaoPermutasService.ts:262-362` |
| **Increase Semantic Coherence** | `BorderoGestaoService` mistura **leitura de cache local** + **CRUD de borderô no ERP** + **status vivo cross-permuta** + **refresh do ERP**. Quatro responsabilidades distintas numa classe. `PermutaExecucaoRepository` ficou com 4 métodos de cache `permuta_bordero` (tabela diferente do nome do repo) — vazamento de responsabilidade direto. | ❌ ausente | `BorderoGestaoService.ts:67-528`; `PermutaExecucaoRepository.ts:305-389` (métodos `*BorderoCache*` numa repo chamada "Execucao") |
| **Encapsulate** | Os caps de saldo (`+ 0.005` p/ centavos; `+ 1` p/ ruído USD) estão soltos no corpo de cada método; a regra "auto-elegível ⇔ saldoNeg + 1 ≥ Σ invoices" está espalhada em `GestaoPermutasService:330-335` e `AlocacaoPermutasService:337`. Sem `class ToleranciaPermutaPolicy` / `class AutoElegibilidadePolicy`. | ❌ ausente | `GestaoPermutasService.ts:243,335`; `AlocacaoPermutasService.ts:225,239,337` |
| **Use an Intermediary** | `routes/permutas.ts` chama 6 services diferentes (`Eleicao, Ingestao, Gestao, Alocacao, Reconciliacao, BorderoGestao, PainelService, PermutaSnapshotRepository, PermutaExecucaoRepository, ClienteFiltroRepository, PermutaProcessamentoRepository, PermutaRelationalRepository`) — 12 dependências resolvidas direto do `container`. Sem facade "Permutas". | ⚠️ parcial | `routes/permutas.ts:9-23` |
| **Restrict Dependencies** | DDD layers respeitadas (0 violações domain → routes). Imports de page.tsx para `@/lib/api` agrupados em 1 import block (8 funções). Mas o page.tsx **importa serviços-de-aplicação distintos** (alocação, busca, ingestão, reconciliação, status) numa mesma camada — não há hook coeso (`useGestaoPermutas`, `useAlocacao`). | ⚠️ parcial | `page.tsx:17-28`; `grep "from '.*routes" src/backend/domain` = 0 |
| **Refactor** | Biome `noExcessiveCognitiveComplexity` warn=15; este PR **introduziu/agravou 5 violações novas** (`toPendente=58`, `exporGestao=28`, `toCasamentos=23`, `statusPorAdiantamento=18`, `adtosQueUltrapassamInvoice=16`) sem nenhum refactor compensatório. `EleicaoPermutasService.executar=65` segue intocado (dívida pré-existente). | ❌ ausente | `npm run lint` no backend (14 funções > 15 de complexidade) |
| **Abstract Common Services** | `IngestaoCoalescerService` é exatamente isso (intermediário coeso entre `routes` e `IngestaoPermutasService`) — ✅. **Falta análoga** entre `routes/permutas.ts` e o trio Eleicao/Gestao/Alocacao. Auth + audit (`req.user?.sub ?? req.user?.email ?? 'unknown'`) duplicado em 9 rotas (DRY). | ⚠️ parcial | `routes/permutas.ts:137,171,236,306,378,409,463,485,507,529,552,576` |
| **Configuration files** | `LIMIT 500` (default da listagem de borderôs), `pageSize: 1000` (refresh por filial), `LIMIT 20000` (sanity), `BORDEROS_MEMO_TTL = 30_000`, `CONTA_GER_JUROS = 131` — magic numbers sem `EnvironmentProvider`/SSM. Cada mudança = redeploy. | ❌ ausente | `BorderoGestaoService.ts:322,408`; `PermutaExecucaoRepository.ts:308`; `lib/api.ts:273`; `ReconciliacaoPermutaService.ts:16` |
| **Polymorphism** | Não usado para os 4 tipos de permuta (simples/multiplas/cross-over/cross-process): cada tipo é distinguido por `string union` + ifs aninhados em `toPendente` (linhas 269–320 = 51 LOC de discriminação manual). Uma `interface PermutaTipoStrategy` + 4 implementações tornaria adicionar "permuta-mista" um drop-in. | ❌ ausente | `GestaoPermutasService.ts:262-320` |
| **Runtime registration** | tsyringe presente; `container.resolve()` em `routes`. Nenhum factory/token nomeado p/ permitir trocar `BorderoGestaoService` por uma implementação stub em testes (hoje os testes usam construtor manual). | ⚠️ parcial (acceptable scope) | `routes/permutas.ts:135,170,...` |
| **Plugin patterns** | N/A — domínio de negócio fechado, sem necessidade de plugins externos. | N/A | — |

## 4. Findings (achados)

### F-modifiability-1: `GestaoPermutasService.toPendente` com cognitive complexity 58 (max=15) — discriminação manual de 4 tipos de permuta

- **Severidade**: P1
- **Tactic violada**: Reduce Size of Module / Polymorphism / Refactor
- **Localização**: `src/backend/domain/service/permutas/GestaoPermutasService.ts:262-362`
- **Evidência (objetiva)**:
  ```
  domain/service/permutas/GestaoPermutasService.ts:262:24 lint/complexity/noExcessiveCognitiveComplexity
  ! Excessive complexity of 58 detected (max: 15).
  ```
  Bloco de 51 LOC (linhas 269–320) decide `status`/`tipoPermuta`/`autoElegivel`/`candidatas`/`alocacoes`/`saldoRestante` com 7 ifs ternários aninhados sobre `estadoElegibilidade × adtosReclassificadosManual × adtosCasamentoPorPriCod`. Adicionar um quinto tipo ("permuta-mista") obriga revisitar 3 ramos deste ternário + a derivação em `page.tsx:1009`.
- **Impacto técnico**: cada nova regra de classificação custa 1–3 ramos no ternário + risco de erro de ordem (a precedência `casamento-manual` → `permuta-manual` é implícita). Já há um aviso explícito do Biome — qualquer próxima PR que tocar o método será forçada a refatorar.
- **Impacto de negócio**: Yuri sinalizou 3 regras novas previstas em backlog (limite de tolerância por moeda, prioridade por aging do adto, exclusão de filiais piloto). Cada uma vira 1+ dia de leitura+teste antes de chegar a 1 hora de implementação.
- **Métrica de baseline**: complexidade cognitiva 58 (alvo 15) → 4× acima do teto. LOC do método: 100.

### F-modifiability-2: `BorderoGestaoService` virou "deus-painel" com 9 métodos públicos e 4 responsabilidades distintas

- **Severidade**: P1
- **Tactic violada**: Increase Semantic Coherence / Split Module
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:67-528`
- **Evidência (objetiva)**:
  ```
  9 métodos públicos:
    excluirBaixa, excluirBordero, removerDaTrilha, finalizarBordero, cancelarBordero,
    estornarBordero, listarBorderos, listarBaixasErp, refreshCache, statusPorAdiantamento
  4 grupos coesos distintos:
    (a) CRUD ERP de borderô (5 ações de escrita)
    (b) Listagem + cache (listarBorderos, refreshCache)
    (c) Status vivo cross-permuta (statusPorAdiantamento) — consumido pelo painel de permutas, não de borderôs
    (d) Leitura on-demand do ERP (listarBaixasErp)
  Δ neste PR: +297 LOC (de 230 para 527).
  ```
- **Impacto técnico**: testes ficam pesados (BorderoGestaoService.test.ts cresceu +146 LOC); mock surface explode (5 deps em `constructor`). Qualquer mudança em uma das 4 responsabilidades pode regredir as outras 3.
- **Impacto de negócio**: `statusPorAdiantamento` é consumido pela tela de **Permutas** (não de Borderôs); um bug ali quebra duas telas ao mesmo tempo. Aumenta MTTR.
- **Métrica de baseline**: 527 LOC (alvo ≤ 400); 9 métodos públicos (alvo ≤ 5); 4 responsabilidades (alvo: 1 por classe).

### F-modifiability-3: Vazamento de responsabilidade — `PermutaExecucaoRepository` opera a tabela `permuta_bordero`

- **Severidade**: P2
- **Tactic violada**: Increase Semantic Coherence / Restrict Dependencies
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:301-389`
- **Evidência (objetiva)**:
  ```
  PermutaExecucaoRepository.ts:305  public listBorderoCache       // tabela permuta_bordero
  PermutaExecucaoRepository.ts:332  public replaceBorderoCache    // tabela permuta_bordero
  PermutaExecucaoRepository.ts:368  public updateBorderoCacheSituacao
  PermutaExecucaoRepository.ts:385  public deleteBorderoCache

  4 dos 12 métodos públicos (33%) operam OUTRA tabela. O nome do repo promete `permuta_alocacao_execucao`.
  ```
- **Impacto técnico**: regra "mudar SQL de uma tabela = abrir 1 arquivo" quebra. Quem busca por "permuta_bordero" no projeto recebe falsos negativos. PatternGuardian não pega — não é violação de DDD, é violação de coesão.
- **Impacto de negócio**: dívida silenciosa — cresce a cada feature que tocar o cache (e a Fase 3.2 já prevê histórico de borderôs).
- **Métrica de baseline**: 4 métodos públicos órfãos (33% do repo); migration `0018_permuta_bordero_cache.sql` ficou sem repo dedicado.

### F-modifiability-4: Constantes mágicas espalhadas — tolerâncias de centavo/USD duplicadas em 3 sítios

- **Severidade**: P2
- **Tactic violada**: Encapsulate / Configuration files
- **Localização**: `GestaoPermutasService.ts:243, 335` · `AlocacaoPermutasService.ts:225, 239, 337`
- **Evidência (objetiva)**:
  ```
  GestaoPermutasService.ts:243   if (g.saldo - g.usado <= 1) continue;   // tolerância USD
  GestaoPermutasService.ts:335   saldoNeg + 1 >= somaInvoicesProcesso;   // mesma tolerância
  AlocacaoPermutasService.ts:225 valorAlocado > saldoAdtoNeg - jaAdto + 0.005;  // tol. centavo
  AlocacaoPermutasService.ts:239 valorAlocado > saldoInvoiceNeg - jaInvoice + 0.005;
  AlocacaoPermutasService.ts:337 if (somaInvoices <= 0 || saldoNeg + 1 < somaInvoices) return false;
  ```
- **Impacto técnico**: pedido típico ("ajuste a tolerância p/ 0,5 USD") = grep + 3 edições + cuidado p/ não trocar `+ 1` que não é tolerância (ex.: `adtosCasamentoPorPriCod + 1` na linha 102, que é contagem). Errar a 4ª ocorrência (sumirá `>= 0.5`) gera bug silencioso de auto-elegibilidade.
- **Impacto de negócio**: cada ajuste fino de regra contábil = redeploy + risco de regressão. Vira flag de tolerância: `EnvironmentProvider.tolerancePermutaUsd` (defer-binding).
- **Métrica de baseline**: 5 ocorrências; 0 constantes nomeadas; 0 testes parametrizando a tolerância.

### F-modifiability-5: `frontend/app/permutas/page.tsx` atingiu 2.562 LOC (Δ +404, +18%) — page monolítica

- **Severidade**: P1
- **Tactic violada**: Split Module / Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx:1-2562`
- **Evidência (objetiva)**:
  ```
  wc -l: 2562 (era 2158 antes deste PR; alvo Next.js page = 600).
  No mesmo arquivo:
    - MoneyInput (componente de input)
    - StatusBadge, ProcessamentoBadge, PermutaBorderoBadge, RunStatusBadge (4 badges)
    - Campo (atom de detalhe)
    - useTabelaFiltro (hook genérico)
    - FiltroBarra, Paginacao (componentes de filtro)
    - GestaoPermutasPage (orquestrador) com ~10 useState + 8 useCallback
    - 4 modais inline (confirmação, alocação, ingestão, reconciliação)
    - 6 derivações de listas filtradas
  ```
- **Impacto técnico**: 3 warnings de `setState-in-effect` (`page.tsx:172, 682`; `borderos/page.tsx:44`). Cargas de re-render escondidas. Build do Next.js fica lento (re-checa o file inteiro). Diff de UI cresce mais que a regra de negócio que a motivou.
- **Impacto de negócio**: cada ajuste de UI exige varrer 2,5k linhas. Designer-handoff demora; testes E2E quebram em features adjacentes.
- **Métrica de baseline**: 2.562 LOC (alvo ≤ 600); 4× acima do teto razoável de page Next.js. 3 setState-in-effect warnings.

### F-modifiability-6: `routes/permutas.ts` resolve 12 dependências distintas do container — sem facade

- **Severidade**: P2
- **Tactic violada**: Use an Intermediary / Restrict Dependencies
- **Localização**: `src/backend/routes/permutas.ts:9-23, 135-606`
- **Evidência (objetiva)**:
  ```
  imports do domain:
    AlocacaoPermutasService, ClienteFiltroRepository, PermutaProcessamentoRepository,
    PermutaExecucaoRepository, PermutaRelationalRepository, PermutaSnapshotRepository,
    EleicaoPermutasService, GestaoPermutasService, IngestaoCoalescerService,
    PainelService, ReconciliacaoPermutaService, BorderoGestaoService
  = 12 deps. Padrão "auditoria `executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown'`"
    duplicado em 9 handlers.
  ```
- **Impacto técnico**: trocar a fonte do "executadoPor" (ex.: passar a vir do header `X-Forwarded-User`) custa 9 edições. Adicionar uma rota nova obriga decidir entre 12 services.
- **Impacto de negócio**: routes/permutas.ts é o ponto onde a Lambda-ready será materializada — quanto mais inchado, mais caro o split em handlers `lambda/api/permutas/*` na fase de migração.
- **Métrica de baseline**: 620 LOC (alvo ≤ 300 para router); 12 deps (alvo ≤ 5); 9 cópias do trecho de auditoria.

### F-modifiability-7: `exporGestao` carrega 7 fontes em paralelo e monta o response — single point de churn

- **Severidade**: P2
- **Tactic violada**: Reduce Size of Module / Refactor
- **Localização**: `src/backend/domain/service/permutas/GestaoPermutasService.ts:45-210`
- **Evidência (objetiva)**:
  ```
  Biome: cognitive complexity 28 (max 15) em exporGestao.
  Dependências: 4 repositories + LogService.
  Promise.all com 7 entries (adiantamentos, invoices, casamentos, processamentos,
  declaracoes, alocacoes, ultimaIngestao).
  Constrói 6 Maps + 1 Set ad-hoc + filtra/mapeia 4 listas + invoca 2 helpers privados.
  166 LOC numa função.
  ```
- **Impacto técnico**: qualquer dado novo no payload de `/gestao` aterrissa aqui (8 inserções em 6 meses pela trajetória atual). O método se aproxima rapidamente de `EleicaoPermutasService.executar` (65 — o pior caso do projeto).
- **Impacto de negócio**: cada KPI/aba novo na tela de Gestão = mexer neste único método ⇒ risco crescente de regressão na composição do payload.
- **Métrica de baseline**: complexidade 28; 166 LOC; 7 fontes; 6 Maps + 1 Set; 2 helpers privados invocados.

## 5. Cards Kanban

### [modifiability-1] Extrair `PermutaClassificadorService` (regras de tipo/elegibilidade)

- **Problema**
  > `GestaoPermutasService.toPendente` (cog complexity 58, 100 LOC) e `adtosQueUltrapassamInvoice` (16) concentram a decisão de status × tipoPermuta × autoElegivel num único ternário aninhado. O `page.tsx` espelha a mesma derivação. Toda regra de classificação nova fica espalhada em 2 lugares.
- **Melhoria Proposta**
  > Criar `PermutaClassificadorService` com métodos `classificarTipoPermuta(adto, contexto)`, `reclassificarSeUltrapassa(...)`, `isAutoElegivel(...)`. `toPendente` passa a delegar. **Tactic: Encapsulate + Polymorphism**. Opcional Fase 2: `interface PermutaTipoStrategy` com 4 impls (simples/multiplas/cross-over/cross-process) registradas no tsyringe via token `PERMUTA_TIPO_STRATEGIES`. O FE consome via `tipoPermuta` no payload (já existe) — sem mudança de contrato.
- **Resultado Esperado**
  > `toPendente` cai para ≤ 15 de complexidade; adicionar um 5º tipo de permuta = 1 arquivo novo + 1 registro no token. Suites verdes.
- **Tactic alvo**: Encapsulate / Polymorphism
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-1, F-modifiability-7
- **Métricas de sucesso**:
  - Cog complexity `toPendente`: 58 → ≤ 15
  - Cog complexity `exporGestao`: 28 → ≤ 15
  - Funções backend > 15: 14 → 11
- **Risco de não fazer**: cada feature de classificação (3 previstas em backlog) custará 1–2 dias a mais; em 6 meses o método passa de 60 → 80+ e vira intratável (como `EleicaoPermutasService.executar=65`).
- **Dependências**: nenhuma

### [modifiability-2] Split `BorderoGestaoService` em 3 services coesos

- **Problema**
  > `BorderoGestaoService` mistura 4 responsabilidades (CRUD ERP, leitura+cache, status vivo cross-permuta, leitura on-demand de baixas ERP) em 527 LOC e 9 métodos públicos. Testes pesados; bug em uma responsabilidade arrisca as outras três.
- **Melhoria Proposta**
  > Split em: (a) `BorderoErpActionService` — 5 ações de escrita + guards; (b) `BorderoListagemService` — `listarBorderos` + `refreshCache` + `listarBaixasErp`; (c) `PermutaBorderoStatusService` — `statusPorAdiantamento` (movido para junto de `GestaoPermutasService`). **Tactic: Split Module + Increase Semantic Coherence**. Manter um `BorderoGestaoFacade` no `routes/` se preciso preservar o caminho atual.
- **Resultado Esperado**
  > Cada service ≤ 250 LOC, ≤ 4 métodos públicos. Suites separadas. Mock surface por teste cai.
- **Tactic alvo**: Split Module
- **Severidade**: P1
- **Esforço estimado**: M (3–5d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - LOC `BorderoGestaoService`: 527 → ≤ 250 (split em 3)
  - Métodos públicos por classe: 9 → ≤ 4
  - Testes: `BorderoGestaoService.test.ts` (421) → 3 suites menores
- **Risco de não fazer**: Fase 3.2 (histórico de borderôs, relatórios) cairá no mesmo arquivo; em 6 meses passa de 527 → 900+ LOC.
- **Dependências**: nenhuma

### [modifiability-3] Criar `PermutaBorderoCacheRepository` e tirar a tabela `permuta_bordero` de `PermutaExecucaoRepository`

- **Problema**
  > 4 métodos públicos de `PermutaExecucaoRepository` operam a tabela `permuta_bordero` (≠ `permuta_alocacao_execucao`). 33% do repo está fora do seu escopo declarado. Quem busca por "permuta_bordero" precisa adivinhar onde está.
- **Melhoria Proposta**
  > Extrair `PermutaBorderoCacheRepository` (`@injectable`, mesmo padrão DDD) com `list`, `replace`, `updateSituacao`, `delete`. Re-injetar em `BorderoGestaoService` (ou `BorderoListagemService` após split). **Tactic: Increase Semantic Coherence**.
- **Resultado Esperado**
  > 0 referência a `permuta_bordero` fora do novo repo. `PermutaExecucaoRepository` volta a 12 → 8 métodos. Grep por nome de tabela = 1 arquivo.
- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Métodos `*BorderoCache*` em `PermutaExecucaoRepository`: 4 → 0
  - Arquivos que tocam `permuta_bordero`: 2 → 1
- **Risco de não fazer**: dívida cresce com Fase 3.2 (histórico, relatórios) — mais métodos `*BorderoCache*` no repo errado.
- **Dependências**: nenhuma

### [modifiability-4] Centralizar tolerâncias de saldo em `PermutaTolerancePolicy` + expor via `EnvironmentProvider`

- **Problema**
  > Tolerâncias "+1 USD" e "+0,005 BRL" estão duplicadas literal em 5 sítios (Gestao + Alocacao). Qualquer ajuste contábil = 5 edições + risco de bug silencioso (auto-elegibilidade descalibrada). Cada mudança = redeploy.
- **Melhoria Proposta**
  > Criar `class PermutaTolerancePolicy` (`@singleton @injectable`) com `excedeSaldoCentavos(disp, pedido)` e `cobreSomaUsd(saldo, soma)`. Valores default em código (`0.005`, `1`); override via `EnvironmentProvider` (`permutaToleranceUsd`, `permutaToleranceCentavos`) lidos no boot. **Tactic: Encapsulate + Configuration files**. Testes parametrizam.
- **Resultado Esperado**
  > 5 ocorrências → 1 classe. Ajustar tolerância = 1 var de ambiente, sem redeploy do código.
- **Tactic alvo**: Encapsulate / Configuration files
- **Severidade**: P2
- **Esforço estimado**: S (1d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Magic numbers de tolerância em services: 5 → 0
  - Cobertura de teste da policy: ≥ 90%
- **Risco de não fazer**: cada pedido contábil de "ajusta a tolerância" vai vir com bug colateral pela divergência das 5 ocorrências.
- **Dependências**: nenhuma; cross-link com Deployability (config externalizada).

### [modifiability-5] Split `frontend/app/permutas/page.tsx` em hooks + componentes por aba

- **Problema**
  > Page atingiu 2.562 LOC (Δ +404 só neste PR). Concentra 4 modais, 4 badges, 1 hook genérico, 6 derivações de lista filtrada e o orquestrador. 3 warnings `setState-in-effect` ainda abertos.
- **Melhoria Proposta**
  > Extrair: `components/permutas/{MoneyInput, StatusBadge, ProcessamentoBadge, PermutaBorderoBadge, RunStatusBadge, Campo, FiltroBarra, Paginacao}.tsx`; `hooks/{useGestaoPermutas, useAlocacao, useReconciliacao, useIngestaoManual, useStatusBordero}.ts`; `app/permutas/{AlocacaoModal, ReconciliacaoModal, IngestaoModal, ConfirmacaoModal}.tsx`. **Tactic: Split Module + Restrict Dependencies**. Manter a page como orquestrador ≤ 600 LOC. Resolver os 3 warnings de setState-in-effect no caminho.
- **Resultado Esperado**
  > `page.tsx` ≤ 600 LOC; cada modal ≤ 250 LOC; cada hook testável isoladamente. 0 warning de setState-in-effect.
- **Tactic alvo**: Split Module
- **Severidade**: P1
- **Esforço estimado**: L (1 sem)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - LOC `page.tsx`: 2.562 → ≤ 600
  - setState-in-effect warnings: 3 → 0
  - Componentes reutilizáveis extraídos: 0 → ≥ 8
- **Risco de não fazer**: a tela é o "espelho" da regra de negócio; cada nova aba/modal exigirá visita de ~2,5k LOC. Em 6 meses, beira 4k LOC.
- **Dependências**: idealmente após [modifiability-1] (classificador) para os hooks consumirem um shape estável.

### [modifiability-6] Introduzir `PermutaActionsFacade` + middleware `executadoPor`

- **Problema**
  > `routes/permutas.ts` resolve 12 services do container e duplica `executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown'` em 9 handlers. 620 LOC só de roteamento.
- **Melhoria Proposta**
  > (a) Criar middleware `withExecutadoPor` que injeta `req.executadoPor`. (b) Agrupar as 5 ações de borderô + reconciliar num `PermutaActionsFacade` (`@injectable`) que recebe `executadoPor` e roteia para o service certo. **Tactic: Use an Intermediary + Abstract Common Services**. Mantém compat de rota.
- **Resultado Esperado**
  > 9 cópias de `executadoPor` → 1; `routes/permutas.ts` ≤ 400 LOC; deps do `container.resolve` neste router: 12 → ≤ 5.
- **Tactic alvo**: Use an Intermediary / Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: M (2–3d)
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - LOC `routes/permutas.ts`: 620 → ≤ 400
  - Cópias do trecho `executadoPor`: 9 → 1
  - Deps resolvidas em routes/permutas.ts: 12 → ≤ 5
- **Risco de não fazer**: na migração Lambda (alvo), cada handler API Gateway precisará repetir o middleware → 9× retrabalho.
- **Dependências**: após [modifiability-2] (split do BorderoGestaoService) para evitar facade sobre service inchado.

### [modifiability-7] Externalizar constantes de paginação/cache de borderôs

- **Problema**
  > `limit=500` (default da listagem), `pageSize=1000` (refresh por filial), `Math.min(limit, 20000)` (sanity), `BORDEROS_MEMO_TTL=30_000` ms (frontend) — todas literais. Trocar TTL = redeploy do FE; trocar default = redeploy do BE.
- **Melhoria Proposta**
  > Mover para `EnvironmentProvider` (BE) e `lib/config.ts` (FE) com defaults nomeados (`BORDERO_DEFAULT_LIMIT`, `BORDERO_REFRESH_PAGE_SIZE`, `BORDERO_LIMIT_MAX`, `BORDEROS_MEMO_TTL_MS`). **Tactic: Configuration files**. Documentar em `ontology/business-rules/`.
- **Resultado Esperado**
  > Magic numbers de paginação/cache: 4 → 0. TTL ajustável via env. Trade-off documentado.
- **Tactic alvo**: Configuration files / Defer Binding
- **Severidade**: P3
- **Esforço estimado**: S (½ dia)
- **Findings relacionados**: F-modifiability-4 (parcial)
- **Métricas de sucesso**:
  - Magic numbers de paginação/cache: 4 → 0 (em 4 arquivos)
  - Vars de env documentadas no README/ontology: +4
- **Risco de não fazer**: dor mínima hoje; cresce se houver instâncias multi-tenant com volumes muito diferentes (alvo SaaSo).
- **Dependências**: nenhuma

## 6. Notas do agente

- Escopo: foco no delta v0.7.0; `EleicaoPermutasService.executar=65` (pré-existente) ficou fora — citado apenas como baseline.
- DDD/tsyringe: todos os services novos/alterados estão corretos (`@injectable`, `@inject`, arrow methods, modificadores explícitos). Esse é o ativo positivo do PR — a deterioração é exclusivamente de coesão e tamanho.
- Cross-QA links para o consolidator:
  - **F-modifiability-1, 2, 5** ↔ **Testability**: alta complexidade/LOC = setups de teste maiores e mais frágeis.
  - **F-modifiability-2, 6** ↔ **Integrability**: facade + split reduzem custo da migração Lambda (alvo) e dos contratos com o ERP.
  - **F-modifiability-4, 7** ↔ **Deployability**: tolerâncias/TTLs em código = cada mudança contábil/operacional é um redeploy.
  - **F-modifiability-3** ↔ **Modifiability ↔ Performance**: cache numa repo errada esconde a presença do cache em buscas de hotspots de perf.
- Métrica não coletada localmente: dependency graph (madge não instalado). Recomendação: adicionar `madge --circular src/backend` ao CI.
