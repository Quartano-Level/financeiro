---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-22-1658
agent: qa-modifiability
generated_at: 2026-06-22T17:00:00Z
scope: all
score: 5
findings_count: 9
cards_count: 9
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista financeiro / Yuri (PO) | Pedido de mudança de regra de permuta (ex.: novo critério de desempate na distribuição greedy; novo gate de elegibilidade; segunda frente — SISPAG) | Módulos de domínio de Permutas (services + repository + página `permutas/page.tsx`) | Desenvolvimento (pre-prod, ainda Express/Render) | Equipe localiza a mudança, ajusta, faz green nos gates (typecheck/lint/test/PatternGuardian/Regis-Review P0) e libera em ≤ 1 dia para regras tópicas e ≤ 1 semana para uma nova frente | Time-to-change ≤ 1d para tweak de regra; ≤ 5d para uma nova entidade dentro da Frente I; arquivos tocados por feature ≤ 6; nenhum arquivo com cognitive complexity > 25 |

> A leitura comportamental: a Frente I (Permutas) já é o "grande corpo de regras" do financeiro. PR #4 (v0.4.0) materializou a regra de distribuição greedy + alocação N:M, e o custo desse delta apareceu em três pontos: (1) `page.tsx` virou um god-component de 2127 linhas, (2) `IngestaoPermutasService.toCasamentoRows` saltou para cognitive complexity 43 (Biome limite 15), (3) a fórmula `valorPermutar/taxa` (saldo em moeda negociada) foi reimplementada em 4 lugares. Frentes II (SISPAG) e III (Popula GED) ainda não existem — se nascerem replicando o padrão de Permutas, a dívida cresce em N.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC backend (src, não-teste) | 9331 / 77 arquivos | n/a (baseline) | ✓ | `_shared-metrics.md` |
| LOC frontend (src, não-teste) | 4984 | n/a (baseline) | ✓ | `_shared-metrics.md` |
| Maior arquivo backend (LOC) | 1432 — `ConexosClient.ts` | ≤ 600 | ❌ | `wc -l src/backend/domain/client/ConexosClient.ts` |
| Maior arquivo frontend (LOC) | 2127 — `src/frontend/app/permutas/page.tsx` | ≤ 400 (componente de página) | ❌ | `wc -l src/frontend/app/permutas/page.tsx` |
| Backend p95 LOC por arquivo | ≈ 526 (sexta linha do ranking ainda é `.d.ts`; em código-fonte real, ≈ 418 — `IngestaoPermutasService`) | ≤ 400 | ⚠ | `find src/backend ... \| sort -rn` |
| Backend max LOC service | 813 — `EleicaoPermutasService.ts` | ≤ 600 | ❌ | top-files |
| Backend max LOC repository | 618 — `PermutaRelationalRepository.ts` | ≤ 600 | ⚠ | top-files |
| Funções com cognitive complexity > 15 (Biome) | **14** warnings | 0 (limite configurado é 15) | ❌ | `cd src/backend && npm run lint` |
| Maior cognitive complexity de uma função | **65** — `EleicaoPermutasService.ts:523` (computeVariacao/computeCandidatas branch) | ≤ 15 | ❌ | Biome lint output |
| 2ª maior cognitive complexity | **43** — `IngestaoPermutasService.ts:340 toCasamentoRows` (greedy N:1 PR #4) | ≤ 15 | ❌ | Biome lint output |
| 3ª maior cognitive complexity | **42** — `GestaoPermutasService.ts:171 toPendente` | ≤ 15 | ❌ | Biome lint output |
| `ConexosClient._doLogin` complexity | **20** — `ConexosClient.ts:439` | ≤ 15 | ❌ | Biome lint output |
| `ConexosClient.mapDocPagar` complexity | **24** — `ConexosClient.ts:805` | ≤ 15 | ❌ | Biome lint output |
| `AlocacaoPermutasService.buscarInvoices`/`alocar` complexity | **23** / **26** — `AlocacaoPermutasService.ts:106/167` | ≤ 15 | ❌ | Biome lint output |
| Imports em `page.tsx` | 26 | ≤ 15 | ❌ | `grep -c '^import ' page.tsx` |
| Componentes definidos em `page.tsx` (`function X`) | **9** + 1 `export default` (10 components em 1 arquivo) | ≤ 1 por página + extrair para `components/` | ❌ | grep `^function [A-Z]` page.tsx |
| `useState` em `page.tsx` | **26** | ≤ 8 por componente | ❌ | `grep -oE useState page.tsx \| wc -l` |
| `useCallback` em `page.tsx` | 9 | — | ⚠ | `grep -oE useCallback page.tsx` |
| Duplicação da fórmula `valorPermutar / taxa` (saldo em moeda negociada) | **4 cópias** (`IngestaoPermutasService:324`, `GestaoPermutasService:204`, `GestaoPermutasService:396`, `AlocacaoPermutasService:219`) | 1 helper compartilhado | ❌ | grep abaixo |
| Layer-skipping (routes importando repositórios sem service) | **4 repositórios** importados em `routes/permutas.ts` (linhas 10–13) — chamadas reais em `routes/permutas.ts:145, 156, 174, 190, 202, 312` | 0 (deveria ir sempre via service) | ❌ | grep abaixo |
| Layer-skipping (routes importando client direto) | 1 — `routes/conexos.ts:4` imports `ConexosClient` | 0 | ❌ | grep |
| Tactics de Defer Binding em uso (named DI tokens, polymorphism, plug-in) | 1 token (`LEGACY_CONEXOS_TOKEN`) — todo o resto é resolução por classe | ≥ 1 ponto de variabilidade declarado por capability | ⚠ | `grep container.register src/backend` |
| Magic numbers em services (constantes top-level com valor numérico) | 6 (`MS_PER_DAY`, `INGEST_LOCK_KEY=918273645`, `PAGE_SIZE=500`, `MAX_PAGES=50`, `FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10`) — nenhuma vinda de `EnvironmentProvider` | ≤ 2 (constantes verdadeiramente físicas) | ⚠ | `grep '^const [A-Z_]\+ ?='` |
| Ontology drift (`_coverage.json` vs `_index.json`) | 0 entidades planned com impl_files; 1 entidade `partial` (Permuta — write-back fin010 = Fase 3); coverage entidades 93%, ações 88% | ≤ 5 entradas drift | ✓ | `ontology/_coverage.json` |
| `_index.json` accuracy (amostra de 5 entradas) | 5/5 arquivos existem | 100% | ✓ | inspeção manual |
| Cross-QA (Testability): regra `distribuicao-simples-greedy` é a 1ª com testes canônicos | `business_rules_with_tests = 1/5` | 5/5 | ⚠ | `_coverage.json:summary` |

> ⚠ **Não medível localmente**: cyclomatic complexity per file (sem ferramenta dedicada — Biome só reporta `noExcessiveCognitiveComplexity` por função, que é o que importa aqui). Aproximação via Biome cobre o sinal real.
> ⚠ **Não medível localmente**: fan-in inter-módulos com precisão de `madge` (sem madge instalado). Substituído por contagem de imports `from .*service/X` por nome — suficiente para o top-10.

### Apêndice — Top-10 maiores arquivos backend (source-only, excluindo `dist/` e `.test.ts`)

| # | Arquivo | LOC |
|---|---|---|
| 1 | `src/backend/domain/client/ConexosClient.ts` | 1432 |
| 2 | `src/backend/domain/service/permutas/EleicaoPermutasService.ts` | 813 |
| 3 | `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` | 618 |
| 4 | `src/backend/domain/service/permutas/IngestaoPermutasService.ts` | 418 |
| 5 | `src/backend/domain/service/permutas/GestaoPermutasService.ts` | 413 |
| 6 | `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts` | 367 |
| 7 | `src/backend/routes/permutas.ts` | 337 |
| 8 | `src/backend/services/conexos.ts` (legacy) | 315 |
| 9 | `src/backend/domain/service/permutas/AlocacaoPermutasService.ts` | 289 |
| 10 | `src/backend/domain/service/permutas/ElegibilidadeService.ts` | 212 |

### Apêndice — Top fan-in services (quantos arquivos não-teste fazem `import … from '…service/X'`)

| # | Service | Fan-in (não-teste) |
|---|---|---|
| 1 | `IngestaoPermutasService` | 2 |
| 2 | `EleicaoPermutasService` | 1 |
| 3 | `GestaoPermutasService` | 1 |
| 4 | `AlocacaoPermutasService` | 1 |
| 5 | `PainelService` | 1 |
| 6 | `LogService` | 1 |
| 7 | `AuthService` | 1 |
| 8 | `VariacaoCambialService` | 0 (privado a `EleicaoPermutasService`) |
| 9 | `ElegibilidadeService` | 0 (privado a `EleicaoPermutasService`) |
| 10 | `ClienteFiltroService` (não existe — só Repository) | n/a |

> Leitura: fan-in baixíssimo porque o consumidor de todos os services hoje é apenas `routes/permutas.ts` (Express monolítico). O grafo é em formato de "estrela com 1 hub" — quando a Frente II (SISPAG) chegar, o hub vira gargalo de modifiability (próximo finding **F-modifiability-9**).

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | Parcialmente: services são `Eleicao` / `Ingestao` / `Gestao` / `Alocacao` / `Elegibilidade` (boa decomposição). MAS `page.tsx` (2127 LOC, 10 componentes) e `ConexosClient.ts` (1432 LOC) violam a tactic — agregam responsabilidades demais num único módulo. | ⚠ parcial | `src/frontend/app/permutas/page.tsx`; `src/backend/domain/client/ConexosClient.ts` |
| **Increase Semantic Coherence** | `EleicaoPermutasService` (813 LOC) faz: fetch Conexos → elegibilidade gate → variação cambial → snapshot run → distribuição greedy. Isso mistura "calcular candidata" com "orquestrar run/persistência". `GestaoPermutasService` mistura leitura+derivação (toPendente cogn. 42) com mapeamento de detalhe. | ⚠ parcial | `EleicaoPermutasService.ts:523` (cogn. 65); `GestaoPermutasService.ts:171` (cogn. 42) |
| **Encapsulate** | Bom: ZodSchema no boundary (`routes/permutas.ts:21–55`); EnvironmentProvider para process.env; Repository encapsula SQL. Ruim: `routes/permutas.ts` resolve **4 repositórios direto** (`PermutaSnapshotRepository`, `ClienteFiltroRepository`, `PermutaRelationalRepository`, `PermutaProcessamentoRepository`) — quebra a encapsulação do domain. | ⚠ parcial | `routes/permutas.ts:145, 156, 174, 190, 202, 312` |
| **Use an Intermediary** | tsyringe atua como intermediary de instanciação (DI). Não há facade entre service e repository (cada service compõe seus repos). Aceitável dado o tamanho atual; **escala mal** quando SISPAG/GED chegarem. | ✓ parcial | `appContainer.ts:63` |
| **Restrict Dependencies** | PatternGuardian (DDD layers, no layer-skip) é a barreira declarada. Funciona para `domain/` → `lambda/` mas **não está pegando** rota Express → repository (provavelmente porque a regra mira lambda/, não routes/). | ⚠ parcial | `routes/permutas.ts:10-13` + `CLAUDE.md` — handler→service→repository→client |
| **Refactor** | 14 warnings de cogn. complexity ativas no Biome (config warn, não error). PR #4 introduziu 3 novas (toCasamentoRows 43, AlocacaoPermutasService 23/26). Tactics teoricamente aplicada via Regis-Review P0, mas threshold complacente (warn) deixa débito acumular. | ❌ ausente (deferido) | Biome lint output: 14 warnings |
| **Abstract Common Services** | Fórmula `valorPermutar(BRL) / taxa = saldo em moeda negociada` está **duplicada em 4 lugares** (`IngestaoPermutasService:324` no helper `saldoDisponivelNeg`, `GestaoPermutasService:204` e `:396` inline, `AlocacaoPermutasService:219` inline). Sem helper compartilhado — cada lugar tem sua própria guarda de divisão-por-zero. | ❌ ausente | `grep "valorPermutar / .*taxa"` |
| **Defer Binding — Configuration files** | `EnvironmentProvider` cobre conexão (DB/JWT/CONEXOS_BASE_URL). Não cobre **regras de negócio configuráveis**: `ADIANTAMENTOS_CONCURRENCY=10`, `FILIAIS_CONCURRENCY=5`, `PAGE_SIZE=500`, `MAX_PAGES=50`, `INGEST_LOCK_KEY=918273645` são literais em código. Cada ajuste = deploy. | ❌ ausente | `EleicaoPermutasService.ts:66-87`; `IngestaoPermutasService.ts:39` |
| **Defer Binding — Polymorphism** | Existe 1 named token (`LEGACY_CONEXOS_TOKEN`) — usado para o adapter Express→Lambda. Bom indício, mas pontual. Não há interfaces com múltiplas implementações no domínio (ex.: estratégia de distribuição greedy vs FIFO — hoje hardcoded greedy em `toCasamentoRows`). | ⚠ parcial | `appContainer.ts:63`; `ConexosClient.ts` (export `LEGACY_CONEXOS_TOKEN`) |
| **Defer Binding — Plugin / runtime registration** | tsyringe permite, mas o repo nunca registra um plugin externo. N/A para o porte atual (single-tenant Render). Justificativa: read-only no ERP, sem extension points exigidos pelo negócio. | N/A | — |
| **Defer Binding — Resource files / i18n** | UI estática em pt-BR; sem i18n. N/A para o escopo atual. | N/A | — |

## 4. Findings (achados)

### F-modifiability-1: `permutas/page.tsx` é god-component de 2127 LOC com 10 componentes, 26 useStates e 9 useCallbacks num único arquivo

- **Severidade**: P1
- **Tactic violada**: Split Module / Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx:1-2127`
- **Evidência (objetiva)**:
  ```
  wc -l                → 2127
  grep '^function [A-Z]' page.tsx
    120: RunStatusBadge
    142: StatusBadge
    202: ProcessamentoBadge
    232: Moeda
    260: Campo
    313: KpiFooter
    420: FiltroBarra
    459: Paginacao
    494: export default GestaoPermutasPage  ← container raiz
    2116: LoadingSkeleton
  grep -oE useState     → 26 ocorrências
  grep -oE useCallback  → 9 ocorrências
  grep -oE useMemo      → 3 ocorrências
  imports               → 26
  ```
- **Impacto técnico**: Qualquer feature que toque a aba "Múltiplas", "Cross-over", "Cross-process" ou os modais de auditoria/alocação edita o mesmo arquivo, gerando conflito de merge em PRs paralelos (caso já vivido: `permutas-multiplas` + `permutas-alocacao-resume` na memória do usuário). Render re-disparado em todas as abas a cada `setState` (26 useStates no mesmo componente).
- **Impacto de negócio**: tempo de implementação de uma 5ª aba/feature em Permutas cresce não-linearmente; risco de regressão silenciosa entre abas (Simples quebra ao mexer em Múltiplas). Quando Frente II/III precisar de página análoga, o pattern será copiado — duplicação multiplicada por 3.
- **Métrica de baseline**: 2127 LOC / arquivo (alvo ≤ 400 para uma page de Next.js).

### F-modifiability-2: `IngestaoPermutasService.toCasamentoRows` cognitive complexity 43 (>15) — greedy N:1 introduzido no PR #4 não foi decomposto

- **Severidade**: P1
- **Tactic violada**: Refactor / Split Module
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:340-413` (assinatura linha 340; corpo até ~413)
- **Evidência (objetiva)**:
  ```
  domain/service/permutas/IngestaoPermutasService.ts:340:80
    lint/complexity/noExcessiveCognitiveComplexity
    ! Excessive complexity of 43 detected (max: 15).
  ```
  Função faz: agrupar por invoice → calcular teto → ordenar por saldo+aging+dataEmissao → loop greedy com `restante`/`usado` → recalcular variação cambial parcial → construir CasamentoRow com 7 campos opcionais. Tudo num único método privado.
- **Impacto técnico**: a regra greedy é central para a permuta automática Simples (1408 ZNSHINE — ADR-0010); qualquer ajuste futuro (ex.: troca do critério de desempate, novo "teto soft" por exportador, kill-switch de greedy) toca um corpo de 70 linhas com 4 fluxos de decisão entrelaçados. Testes existem (`distribuicao-simples-greedy` é a 1ª regra com tests canônicos — coverage.json `with_tests: 1`), o que mitiga, mas não cobre todas as combinações.
- **Impacto de negócio**: ADR-0010 fixou o bug de super-permuta de R$ 743k → R$ 260k; uma regressão silenciosa nesse método volta o bug. Cognitive 43 = risco P1 de introduzir bug ao iterar a regra.
- **Métrica de baseline**: cognitive complexity 43 (alvo 15).

### F-modifiability-3: Fórmula `valorPermutar/taxa` (saldo do adiantamento em moeda negociada) duplicada em 4 lugares — sem helper compartilhado

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services
- **Localização**:
  - `src/backend/domain/service/permutas/IngestaoPermutasService.ts:321-327` (`saldoDisponivelNeg` — helper privado)
  - `src/backend/domain/service/permutas/GestaoPermutasService.ts:202-205` (inline em `toPendente`)
  - `src/backend/domain/service/permutas/GestaoPermutasService.ts:394-397` (inline em `toCasamentoComputed`)
  - `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:215-219` (inline em `alocar`, sob nome `saldoAdtoNeg`)
- **Evidência (objetiva)**:
  ```
  grep -n "valorPermutar / .*taxa" src/backend/domain/service/permutas/*.ts
  AlocacaoPermutasService.ts:219:    ? adto.valorPermutar / taxaAdto
  IngestaoPermutasService.ts:324:    return a.valorPermutar / a.taxa;
  GestaoPermutasService.ts:204:    ? a.valorPermutar / a.taxa
  GestaoPermutasService.ts:396:    ? adto.valorPermutar / adto.taxa
  ```
  Cada cópia tem sua própria guarda: `taxa !== undefined && taxa > 0` (Ingestao, Gestao); `taxaAdto !== undefined && taxaAdto > 0` (Alocacao). Comportamento de fallback diverge: `IngestaoPermutasService.saldoDisponivelNeg` faz fallback para `valorMoedaNegociada ?? 0`; `GestaoPermutasService` retorna `undefined`; `AlocacaoPermutasService` retorna `undefined` mas só usado se ambos definidos.
- **Impacto técnico**: A semântica de "saldo permutável do adiantamento em moeda negociada" é UMA — mas vive em 4 lugares. Qualquer mudança contratual (ex.: ADR futuro: "se taxa < 0.5 considerar moeda igual"; "arredondar para 2 casas") exige editar 4 sítios. Risco real de divergência: o fallback do Ingestao (`?? 0`) é diferente dos demais — se alguém corrigir 3 e esquecer 1, a permuta passa a divergir entre as telas e a ingestão.
- **Impacto de negócio**: divergência de centavos entre o que a tela mostra e o que a ingestão grava no `permuta_casamento` é cliente-bug sério (Yuri costuma conferir). Cada novo desenvolvedor terá que descobrir esse encanamento — onboarding lento.
- **Métrica de baseline**: 4 cópias da mesma fórmula (alvo: 1 método em ex.: `AdiantamentoSaldoCalculator` ou helper estático).

### F-modifiability-4: `EleicaoPermutasService` 813 LOC + uma função com cognitive complexity 65 (4.3× o limite)

- **Severidade**: P1
- **Tactic violada**: Split Module / Increase Semantic Coherence / Refactor
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:1-813`; warning principal em `:523`
- **Evidência (objetiva)**:
  ```
  domain/service/permutas/EleicaoPermutasService.ts:523:34
    lint/complexity/noExcessiveCognitiveComplexity
    ! Excessive complexity of 65 detected (max: 15).
  ```
  O service mistura: idempotency-key, advisory lock, paginate Conexos (PAGE_SIZE/MAX_PAGES), boundedConcurrency, persistir snapshot, persistir relational, marcar stale, computar variação. 8 responsabilidades em um arquivo.
- **Impacto técnico**: Mudanças em qualquer dessas 8 dimensões (ex.: trocar idempotency de `runId` para `Idempotency-Key` header; mudar fan-out de filiais) ressoam num arquivo de 813 LOC. Testar é caro: o test file precisa mockar 7+ collaborators.
- **Impacto de negócio**: Eleição é o coração da Frente I (cron 3x/dia). MTTR para qualquer bug aqui = horas, não minutos.
- **Métrica de baseline**: 813 LOC arquivo (alvo 600); cognitive 65 em uma função (alvo 15).

### F-modifiability-5: `ConexosClient` 1432 LOC com `_doLogin` (cogn. 20) e `mapDocPagar` (cogn. 24) — single point of fan-in para todo o domínio

- **Severidade**: P1
- **Tactic violada**: Split Module / Refactor
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1-1432`, warnings em `:439` (_doLogin) e `:805` (mapDocPagar/listFinanceiroAPagar block)
- **Evidência (objetiva)**:
  ```
  wc -l ConexosClient.ts                                   → 1432
  domain/client/ConexosClient.ts:439:28  complexity 20 (_doLogin)
  domain/client/ConexosClient.ts:805:52  complexity 24 (mapDocPagar)
  ```
  Endpoints distintos do Conexos (imp021, com298, com308, fin010 detalhe, etc.) coexistem no mesmo client class.
- **Impacto técnico**: Cada novo endpoint Conexos (write-back fin010 da Fase 3; SISPAG `com298` write; GED?) cresce esse arquivo. Refactors de auth (`_doLogin`) tocam o mesmo arquivo de read endpoints (imp021).
- **Impacto de negócio**: Conexos é a única fonte do ERP. Bug em `_doLogin` (cogn. 20) cai tudo. A Fase 3 (write-back `reconciliarPermuta`) vai adicionar mais 200+ LOC nesse arquivo.
- **Métrica de baseline**: 1432 LOC (alvo ≤ 600 por client; quebrar em `ConexosAuthClient` + `ConexosReadClient` + `ConexosWriteClient` ou por bounded context — read-processos, read-financeiro, write-financeiro).

### F-modifiability-6: `AlocacaoPermutasService.alocar` cognitive complexity 26 + `buscarInvoices` 23 — coração da Fase 2 (N:M cross-process)

- **Severidade**: P1
- **Tactic violada**: Refactor / Split Module
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:106` (buscarInvoices) e `:167` (alocar)
- **Evidência (objetiva)**:
  ```
  AlocacaoPermutasService.ts:106:65  complexity 23  (buscarInvoices)
  AlocacaoPermutasService.ts:167:63  complexity 26  (alocar)
  ```
  `alocar` faz: validate input → re-find adto → check casamento-manual scope → buscarInvoices LIVE → validar D.I → calcular saldoAdtoNeg (3ª cópia da fórmula F-modifiability-3) → invariantes de saldo (2 lados) → recalcular variação → upsert. Misturado num único método.
- **Impacto técnico**: Fase 3 (write-back fin010 — `reconciliarPermuta`) vai inserir um passo a mais dentro de `alocar`. Cognitive 26 vira 30+. Caminho crítico do produto.
- **Impacto de negócio**: Fase 3 é o risco arquitetural #1 declarado em `_coverage.json`. Iniciar Fase 3 com `alocar` já em cogn. 26 = empilhar dívida no caminho mais crítico.
- **Métrica de baseline**: cogn. 26 em `alocar`, 23 em `buscarInvoices` (alvo 15).

### F-modifiability-7: `routes/permutas.ts` resolve 4 repositórios e 1 client direto — layer-skipping ativo

- **Severidade**: P2
- **Tactic violada**: Restrict Dependencies
- **Localização**: `src/backend/routes/permutas.ts:10-13` (imports), chamadas em `:145, 156, 174, 190, 202, 312`; `src/backend/routes/conexos.ts:4` (import `ConexosClient`)
- **Evidência (objetiva)**:
  ```
  routes/permutas.ts:10  import ClienteFiltroRepository ...
  routes/permutas.ts:11  import PermutaProcessamentoRepository ...
  routes/permutas.ts:12  import PermutaRelationalRepository ...
  routes/permutas.ts:13  import PermutaSnapshotRepository ...
  routes/permutas.ts:145 container.resolve(PermutaSnapshotRepository) → listRecentRuns
  routes/permutas.ts:156 container.resolve(ClienteFiltroRepository)   → listAtivos
  routes/permutas.ts:174 container.resolve(ClienteFiltroRepository)   → upsertClienteFiltro
  routes/permutas.ts:190 container.resolve(ClienteFiltroRepository)   → deleteByPesCod
  routes/permutas.ts:202 container.resolve(PermutaRelationalRepository) → listImportadores
  routes/permutas.ts:312 container.resolve(PermutaProcessamentoRepository) → list
  routes/conexos.ts:4    import ConexosClient ...
  ```
- **Impacto técnico**: Quando uma regra de domínio for adicionada a "listar cliente-filtro" ou "registrar importador" (ex.: filtrar por filCod do usuário, auditar quem viu), o handler de rota tem que ganhar a regra inline — porque não há service entre o handler e o repository. PatternGuardian (que CLAUDE.md diz policiar layer-skipping) **não está pegando** isso — é configurado para `domain/` → `lambda/`, não `routes/` → `repository/`.
- **Impacto de negócio**: Regra de negócio futura sobre cliente-filtro (ex.: SLA: importador inativo > 90d → ocultar) precisará ser implementada ad-hoc em route OU exigir refactor — cada um dos 6 sítios vira um candidato.
- **Métrica de baseline**: 6 chamadas de rota → repository direto (alvo 0); 1 chamada de rota → client direto (alvo 0).

### F-modifiability-8: 6 magic numbers em services controlam fan-out/lock/cron — sem Defer Binding via Environment

- **Severidade**: P2
- **Tactic violada**: Defer Binding (configuration files)
- **Localização**:
  - `src/backend/domain/service/permutas/EleicaoPermutasService.ts:66` `PAGE_SIZE = 500`
  - `:67` `MAX_PAGES = 50`
  - `:86` `FILIAIS_CONCURRENCY = 5`
  - `:87` `ADIANTAMENTOS_CONCURRENCY = 10`
  - `src/backend/domain/service/permutas/IngestaoPermutasService.ts:39` `INGEST_LOCK_KEY = 918273645`
  - `src/backend/domain/service/permutas/AgingService.ts:3` `MS_PER_DAY` (físico — OK)
- **Evidência (objetiva)**:
  ```
  grep '^const [A-Z_]\+ = [0-9]' src/backend/domain/service/permutas/*.ts
  ```
  Nenhum desses valores vem de `EnvironmentProvider`. Cada ajuste exige redeploy. Quando a Frente I crescer (volume Conexos sobe), tunar `ADIANTAMENTOS_CONCURRENCY=10` → 20 = redeploy completo.
- **Impacto técnico**: Performance tuning preso ao deploy lifecycle. Pior: o Render hook é o único deploy path — não há feature flag/config server.
- **Impacto de negócio**: Operador (Yuri) não consegue mexer no cron sem dev. Em uma janela de fechamento mensal apertada, ajustar fan-out exige time-de-dev.
- **Métrica de baseline**: 6 constantes ajustáveis hardcoded (alvo: ≤ 2 — só as físicas como MS_PER_DAY).

### F-modifiability-9: Grafo de dependência em "estrela com 1 hub" (`routes/permutas.ts`) — fan-in vai escalar pior do que linearmente quando SISPAG/GED chegarem

- **Severidade**: P3
- **Tactic violada**: Use an Intermediary / Restrict Dependencies
- **Localização**: `src/backend/routes/permutas.ts:1-337` (hub único de toda a Frente I)
- **Evidência (objetiva)**:
  Fan-in (services não-teste): cada service tem fan-in ≤ 2, e o consumidor é sempre o mesmo handler de rota. `EleicaoPermutasService`, `IngestaoPermutasService`, `GestaoPermutasService`, `AlocacaoPermutasService`, `PainelService` → todos consumidos por `routes/permutas.ts`. Frente II (SISPAG) e Frente III (GED) ainda não existem.
- **Impacto técnico**: Sem facade/controller per-bounded-context, Frente II vai naturalmente acabar em `routes/permutas.ts` ou copiar a estrutura — replicando os 6 layer-skips do finding F-modifiability-7. **Não há padrão de modularização entre frentes** declarado.
- **Impacto de negócio**: Time-to-market da Frente II maior porque cada frente vai pagar o setup arquitetural do zero.
- **Métrica de baseline**: 1 hub (alvo: 1 controller/router por bounded context — `routes/permutas/`, `routes/sispag/`, `routes/ged/`).

## 5. Cards Kanban

### [modifiability-1] Quebrar `permutas/page.tsx` em sub-componentes por aba e modal

- **Problema**
  > `src/frontend/app/permutas/page.tsx` tem 2127 LOC, 10 componentes locais, 26 useStates e 9 useCallbacks num único arquivo. Cada aba (Simples, Múltiplas, Cross-over, Cross-process) e cada modal (auditoria de runs, alocação manual, cliente-filtro) re-renderiza a página inteira. Já houve conflito de merge entre branches paralelas tocando abas distintas.

- **Melhoria Proposta**
  > Aplicar **Split Module**: criar `src/frontend/app/permutas/_components/` e mover (1) cada aba como `<TabaSimples/>`, `<TabaMultiplas/>`, `<TabaCrossOver/>`, `<TabaCrossProcess/>`; (2) cada modal como `<ModalAuditoriaRuns/>`, `<ModalAlocacaoManual/>`; (3) badges (`StatusBadge`, `RunStatusBadge`, `ProcessamentoBadge`) e formatters (`Moeda`, `Campo`) para `src/frontend/components/permutas/`. A página raiz fica como orquestrador de tabs + dispatcher de modal (alvo: ≤ 400 LOC). Cada aba detém seu próprio `useState` local; estado compartilhado fica em um hook `usePermutasState`.

- **Resultado Esperado**
  > `page.tsx` ≤ 400 LOC; máximo de 1 componente por arquivo `_components/`; nenhum arquivo > 300 LOC em `_components/`. Conflito de merge entre features de abas independentes vai a zero. Render escopo: trocar de aba não re-renderiza outras abas.

- **Tactic alvo**: Split Module
- **Severidade**: P1
- **Esforço estimado**: M (3–5d, com testes de aba intactos)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - LOC `page.tsx`: 2127 → ≤ 400
  - Componentes por arquivo: 10 → 1
  - useStates por arquivo: 26 → ≤ 8 por arquivo
- **Risco de não fazer**: Em 6 meses, qualquer feature em Permutas é gargalo de merge; quando SISPAG ganhar página análoga, o pattern (2k+ LOC) é replicado.
- **Dependências**: nenhuma

### [modifiability-2] Extrair helper `AdiantamentoSaldoCalculator` para eliminar as 4 cópias de `valorPermutar/taxa`

- **Problema**
  > A fórmula "saldo do adiantamento em moeda negociada = `valorPermutar(BRL) / taxa`" está reimplementada em 4 sítios (`IngestaoPermutasService:324`, `GestaoPermutasService:204` e `:396`, `AlocacaoPermutasService:219`), com semânticas de fallback divergentes (`?? 0` no Ingestao vs `undefined` nos demais). Qualquer ajuste contratual (arredondamento, tratamento de taxa zero, nova fórmula para BRL→BRL) exige edição em 4 lugares — risco real de divergência entre tela e ingestão.

- **Melhoria Proposta**
  > Aplicar **Abstract Common Services**: criar `src/backend/domain/service/permutas/AdiantamentoSaldoCalculator.ts` (`@injectable()`) com método único `saldoEmMoedaNegociada(adto: { valorPermutar?: number; taxa?: number; valorMoedaNegociada?: number }, opts?: { fallback: 'zero' | 'undefined' }): number | undefined`. Substituir as 4 cópias por chamadas ao helper. Adicionar teste canônico para os edge cases (taxa=0, valorPermutar=0, taxa undefined, ambos undefined).

- **Resultado Esperado**
  > 1 definição da regra "saldo em moeda negociada" no domínio. Mudança contratual = 1 PR, 1 arquivo. Testes consolidam o comportamento de fallback.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (1d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Cópias da fórmula `valorPermutar/taxa`: 4 → 1
  - `business_rules.saldo-em-moeda-negociada.has_test`: false → true (canônico)
- **Risco de não fazer**: 5ª cópia aparece na Fase 3 (write-back fin010); divergência silenciosa de centavos entre Ingestão e Alocação Manual.
- **Dependências**: nenhuma — pré-requisito para [modifiability-3] e Fase 3.

### [modifiability-3] Decompor `IngestaoPermutasService.toCasamentoRows` (cogn. 43) em métodos por etapa

- **Problema**
  > `toCasamentoRows` (linha 340) carrega 4 responsabilidades entrelaçadas: agrupar candidatas por invoice, calcular teto, ordenar (saldo→aging→dataEmissao), distribuir greedy com `restante`/`usado` e recalcular variação cambial. Cognitive complexity = 43 (Biome max: 15). Foi introduzido no PR #4 (ADR-0010) e implementa a regra de negócio mais sensível da Frente I (fix do bug 1408 ZNSHINE).

- **Melhoria Proposta**
  > Aplicar **Refactor + Split Module**: extrair 4 métodos privados — `agruparPorInvoice(candidatas)`, `calcularTetoInvoice(invoice)`, `ordenarParaGreedy(grupo)`, `distribuirGreedy({ ordenado, teto, calcularVariacao })`. `toCasamentoRows` vira o orquestrador (≈ 15 LOC). Usar o helper de [modifiability-2] para `saldoDisponivelNeg`. Manter o teste `distribuicao-simples-greedy` (já é a 1ª regra com test canônico).

- **Resultado Esperado**
  > `toCasamentoRows` cogn. 43 → ≤ 15; 4 métodos privados de cogn. ≤ 8 cada. Mudança no critério de desempate edita 1 método (`ordenarParaGreedy`), não o orquestrador.

- **Tactic alvo**: Refactor
- **Severidade**: P1
- **Esforço estimado**: S (1d)
- **Findings relacionados**: F-modifiability-2, F-modifiability-3
- **Métricas de sucesso**:
  - Cogn. complexity `toCasamentoRows`: 43 → ≤ 15
  - Cobertura de teste da regra greedy mantida em 100%
- **Risco de não fazer**: Bug de super-permuta (ADR-0010) retorna via regressão silenciosa quando alguém ajustar desempate sem entender o fluxo completo.
- **Dependências**: [modifiability-2]

### [modifiability-4] Decompor `EleicaoPermutasService.computeCandidatas` (cogn. 65) e quebrar service em 3

- **Problema**
  > `EleicaoPermutasService` tem 813 LOC e uma função em cogn. 65 (`:523`) — 4.3× o limite. Mistura paginate Conexos, idempotency-key, advisory lock, fan-out de filiais e adiantamentos, snapshot relacional, marca stale. É o coração do cron 3x/dia.

- **Melhoria Proposta**
  > Aplicar **Split Module + Increase Semantic Coherence**: extrair (1) `ConexosEleicaoFetcher` (paginate + boundedConcurrency Conexos), (2) `EleicaoRunCoordinator` (idempotency-key + advisory lock + persistencia run), (3) `EleicaoCandidatasComputer` (loop por filial → ElegibilidadeService → VariacaoCambialService). `EleicaoPermutasService` vira facade fino. Função cogn. 65 fica decomposta no `EleicaoCandidatasComputer`.

- **Resultado Esperado**
  > Nenhum arquivo > 400 LOC nessa cadeia; cogn. máxima ≤ 15. Trocar idempotency strategy ou cron interval = 1 arquivo.

- **Tactic alvo**: Split Module + Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: M (3–5d, com testes ajustados)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - LOC `EleicaoPermutasService.ts`: 813 → ≤ 250 (facade)
  - Cogn. complexity máxima: 65 → ≤ 15
- **Risco de não fazer**: Toda mudança no cron diário toca um arquivo gigante; MTTR cresce.
- **Dependências**: nenhuma

### [modifiability-5] Quebrar `ConexosClient` (1432 LOC) em clients por bounded context

- **Problema**
  > `ConexosClient` agrega auth (`_doLogin` cogn. 20), read-processos (imp021), read-financeiro (com298), read-titulos (com308), parse de moedas/datas, helpers. 1432 LOC. Cogn. complexity 24 em `mapDocPagar`. Fase 3 (write-back fin010) e Frente II (SISPAG via com298 write) vão crescer esse arquivo.

- **Melhoria Proposta**
  > Aplicar **Split Module**: extrair `ConexosAuthClient` (`@singleton @injectable`, mantém o lock de _doLogin), `ConexosProcessosClient` (imp021 read), `ConexosFinanceiroReadClient` (com298/com308 read + parse + mapDocPagar), `ConexosFinanceiroWriteClient` (placeholder para Fase 3). `ConexosClient` mantido como facade backward-compat (para o adapter legacy) ou eliminado se nada externo o resolve. Manter `LEGACY_CONEXOS_TOKEN` apontando para a facade.

- **Resultado Esperado**
  > Nenhum client > 500 LOC. Auth e read-financeiro evoluem independentes. Fase 3 ganha um arquivo dedicado (`ConexosFinanceiroWriteClient`) ao invés de inflar mais o god-class.

- **Tactic alvo**: Split Module
- **Severidade**: P1
- **Esforço estimado**: L (1 semana, alta superfície de teste)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - LOC max client: 1432 → ≤ 500
  - Cogn. complexity max: 24 → ≤ 15
- **Risco de não fazer**: Fase 3 fica ainda mais cara; toda mudança em auth carrega risco de quebrar reads.
- **Dependências**: nenhuma; idealmente antes da Fase 3 começar.

### [modifiability-6] Decompor `AlocacaoPermutasService.alocar` (cogn. 26) antes da Fase 3

- **Problema**
  > `alocar` (linha 167, cogn. 26) faz validação → re-find → escopo casamento-manual → buscarInvoices LIVE → validar D.I → calcular saldoAdtoNeg (3ª cópia da fórmula) → invariantes de saldo → recalcular variação → upsert. Fase 3 (`reconciliarPermuta` — write-back fin010, risco arquitetural #1) vai inserir mais um passo aqui.

- **Melhoria Proposta**
  > Aplicar **Refactor + Split Module**: extrair `AlocacaoInvariantsService` (valida saldo dos 2 lados, escopo casamento-manual, D.I obrigatória); reaproveitar helper de [modifiability-2] para saldoAdto; `alocar` vira orquestrador linear (input → invariants.check(...) → variacao.calcular(...) → repo.upsert(...)). Mesmo tratamento para `buscarInvoices` (cogn. 23): extrair `InvoiceHydrator` que combina detalhe + tit + jaAlocado.

- **Resultado Esperado**
  > `alocar` cogn. 26 → ≤ 15; `buscarInvoices` cogn. 23 → ≤ 15. Fase 3 entra como passo isolado (`reconciliacaoService.reconciliar(...)`) sem inflar o orquestrador.

- **Tactic alvo**: Refactor
- **Severidade**: P1
- **Esforço estimado**: M (2–3d)
- **Findings relacionados**: F-modifiability-6, F-modifiability-3
- **Métricas de sucesso**:
  - Cogn. `alocar`: 26 → ≤ 15
  - Cogn. `buscarInvoices`: 23 → ≤ 15
  - Caminho crítico Fase 3 mensurável em LOC (alvo: < 50 LOC adicionados ao service)
- **Risco de não fazer**: Fase 3 (risco arquitetural #1) começa com débito acumulado no caminho crítico; bugs de write-back ficam mais difíceis de diagnosticar.
- **Dependências**: [modifiability-2]

### [modifiability-7] Introduzir camada de service para rotas que hoje chamam repositório/client direto

- **Problema**
  > `routes/permutas.ts` resolve 4 repositórios direto (linhas 145, 156, 174, 190, 202, 312) e `routes/conexos.ts:4` importa `ConexosClient`. Quando uma regra de negócio for adicionada a "listar cliente-filtro" ou "registrar importador" (ex.: auditar quem cadastrou, validar SLA), o handler de rota vai ter que carregar a regra inline. PatternGuardian (CLAUDE.md) policia DDD `domain→lambda` mas não `routes→repository`.

- **Melhoria Proposta**
  > Aplicar **Restrict Dependencies + Use an Intermediary**: criar `ClienteFiltroService` (envolve `ClienteFiltroRepository` + adiciona telemetria + valida importador existe em backlog), `PermutaImportadoresService` (envolve `PermutaRelationalRepository.listImportadores`), `PermutaSnapshotQueryService` (envolve `PermutaSnapshotRepository.listRecentRuns` + truncamento por janela), `PermutaProcessamentoQueryService` (envolve `PermutaProcessamentoRepository.list`). `routes/permutas.ts` passa a só falar com services. Atualizar PatternGuardian para também policiar `routes/ → domain/repository|client` (regra é DDD: rota é boundary, repositório é interno).

- **Resultado Esperado**
  > 0 imports diretos de repositório/client em `routes/`. Cada rota tem 1 ponto canônico de regra de negócio.

- **Tactic alvo**: Restrict Dependencies
- **Severidade**: P2
- **Esforço estimado**: S (1d, mecânico)
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - Imports `routes → repository`: 4 → 0
  - Imports `routes → client`: 1 → 0
  - Regra PatternGuardian acionável sobre o legado Express
- **Risco de não fazer**: Regras de negócio acumulam em routes (anti-DDD), e Frente II copia o pattern.
- **Dependências**: nenhuma

### [modifiability-8] Externalizar magic numbers de fan-out/lock via `EnvironmentProvider`

- **Problema**
  > 5 constantes top-level (`PAGE_SIZE=500`, `MAX_PAGES=50`, `FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10`, `INGEST_LOCK_KEY=918273645`) são hardcoded em services. Qualquer tuning operacional (volume Conexos varia, janela de fechamento mensal aperta) exige novo deploy via Render hook. Não há feature flag/config server.

- **Melhoria Proposta**
  > Aplicar **Defer Binding (configuration files)**: estender `EnvironmentProvider` com `getPermutasIngestConfig(): { pageSize: number; maxPages: number; filiaisConcurrency: number; adiantamentosConcurrency: number; lockKey: number }` (defaults atuais; lê de env var `PERMUTAS_PAGE_SIZE`, `PERMUTAS_MAX_PAGES`, etc.). Injetar nos services via construtor. Documentar em `docs-contexto/configuracao.md`. `INGEST_LOCK_KEY` pode ficar como constante derivada do ambiente (mesmo lock por tenant; trocar valor = uma migração explícita).

- **Resultado Esperado**
  > Tuning operacional possível sem redeploy via variável de ambiente Render. Operador (Yuri) pode pedir ajuste sem time-de-dev.

- **Tactic alvo**: Defer Binding (configuration files)
- **Severidade**: P2
- **Esforço estimado**: S (1d)
- **Findings relacionados**: F-modifiability-8
- **Métricas de sucesso**:
  - Magic numbers configuráveis hardcoded: 5 → 0
  - Documentação `configuracao.md`: nova entrada
- **Risco de não fazer**: Cada janela de fechamento apertada exige redeploy não-trivial.
- **Dependências**: nenhuma

### [modifiability-9] Estabelecer padrão de modularização por bounded context antes de SISPAG/GED nascerem

- **Problema**
  > Hoje tudo da Frente I é hub-and-spoke em `routes/permutas.ts`. Não há padrão arquitetural declarado para como Frente II (SISPAG) e Frente III (GED) vão coexistir. Sem essa decisão, cada frente paga o setup do zero ou clona estrutura de Permutas (incluindo os 6 layer-skips e o god-component).

- **Melhoria Proposta**
  > Aplicar **Use an Intermediary + Restrict Dependencies**: criar ADR-0011 "Modularização por bounded context (Permutas / SISPAG / Popula GED)" decidindo (1) `src/backend/routes/<frente>/index.ts` por frente, (2) `src/backend/domain/service/<frente>/`, `domain/repository/<frente>/` (já é a convenção), (3) o que é compartilhado fica em `src/backend/domain/shared/` (ex.: `AdiantamentoSaldoCalculator`, `ConexosAuthClient`). Espelhar no frontend: `src/frontend/app/<frente>/`. PatternGuardian ganha regra: imports só dentro do bounded context ou via `shared/`.

- **Resultado Esperado**
  > Quando SISPAG começar, há padrão claro. Cross-frente compartilha apenas via `shared/`; o resto é isolado.

- **Tactic alvo**: Use an Intermediary + Restrict Dependencies
- **Severidade**: P3
- **Esforço estimado**: S (1d — ADR + esqueleto)
- **Findings relacionados**: F-modifiability-9
- **Métricas de sucesso**:
  - ADR-0011 publicado e validado
  - Regra PatternGuardian: imports cross-frente fora de `shared/` = 0
- **Risco de não fazer**: Time-to-market da Frente II maior; débito arquitetural se propaga por 3 frentes.
- **Dependências**: [modifiability-7] (helper de bounded context só faz sentido com a camada de service entre rotas e repositórios)

## 6. Notas do agente

- Cross-QA **Testability**: cogn. complexity 65/43/26 em métodos privados é também sinal de testabilidade ruim (cada teste precisa mockar muito). A regra `distribuicao-simples-greedy` é a 1ª das 5 business-rules com testes canônicos (`_coverage.json`); todas as outras (`elegibilidade-permuta`, `di-xor-duimp`, `classificacao-juros-desconto`, `aging-anchor`) seguem com `has_test: false` — encaminhar para o qa-testability.
- Cross-QA **Deployability**: magic numbers em [modifiability-8] = cada tuning vira redeploy via Render hook. Encaminhar para o qa-deployability avaliar pipeline de config.
- Cross-QA **Integrability**: `ConexosClient` (1432 LOC, 2 funções > cogn. 20) é também o único ponto de integração com o ERP — qualquer instabilidade do Conexos vira problema de Integrability. Encaminhar [modifiability-5] para o qa-integrability validar.
- Decisão de escopo: não inspecionei legado Express puro fora dos serviços que mudaram em PR #4 (sustentou-se em `_shared-metrics.md`). `services/conexos.ts:142` (cogn. 17) é debt de bootstrap, não escopo deste PR.
- Score 5/10: DDD layers + tsyringe + ontology + Biome com noExcessiveCognitiveComplexity ativo são fundamentos sólidos. Penalidades: 14 warnings ativos, 4 cópias da fórmula central, god-component frontend, layer-skipping não policiado em `routes/`. A arquitetura tem o esqueleto certo; o esforço dos cards é tópico, não estrutural.
