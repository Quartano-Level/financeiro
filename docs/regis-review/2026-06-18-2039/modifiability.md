---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-18-2039
agent: qa-modifiability
generated_at: 2026-06-18T20:39:00-03:00
scope: backend
score: 6.5
findings_count: 7
cards_count: 6
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor backend | Pedido para adicionar uma 5ª entidade ingerida (ex.: `RecebimentoExportacao`) com mesma mecânica de UPSERT chunked + sweep stale + recompute casamento | `PermutaRelationalRepository` + `IngestaoPermutasService` + `PermutaSnapshotRepository` (camada relacional + snapshot da Fase B) | Pós-merge da Fase B, código verde, suíte 88 testes passando, sem incidentes em produção | Adicionar a nova entidade com mudança localizada (1 novo método de UPSERT + 1 mapper) sem reescrever helpers de chunking nem mudar `IngestaoPermutasService.executar` | ≤ 1 arquivo de repositório tocado + 0 cópias do helper `chunked` + ≤ 50 LOC novos no Service de orquestração; tempo de implementação ≤ 1 dia |

> Aplicado ao escopo Fase B: a frente Permutas hoje aceita variações de **estado de elegibilidade** e **gates** sem ripple (tactic Encapsulate já em uso), mas mudanças na **forma de persistência** (nova entidade chunked, novo campo no UPSERT, mudança no `INSERT…ON CONFLICT`) custam mais do que deveriam porque o padrão *upsert chunk + tuples + params + ON CONFLICT* está **copiado por entidade** dentro de `PermutaRelationalRepository`.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC `PermutaRelationalRepository.ts` | 512 | ≤ 400 | ⚠️ | `wc -l src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` |
| LOC `EleicaoPermutasService.ts` | 599 | ≤ 400 | ⚠️ | `wc -l src/backend/domain/service/permutas/EleicaoPermutasService.ts` |
| LOC `IngestaoPermutasService.ts` | 287 | ≤ 400 | ✅ | `wc -l …/IngestaoPermutasService.ts` |
| LOC `GestaoPermutasService.ts` | 165 | ≤ 400 | ✅ | `wc -l …/GestaoPermutasService.ts` |
| LOC `PermutaSnapshotRepository.ts` | 294 | ≤ 400 | ✅ | `wc -l …/PermutaSnapshotRepository.ts` |
| Permutas service LOC total (não-teste) | 1419 | — | — | `_shared-metrics.md` |
| Permutas repository LOC total (não-teste) | 904 | — | — | `_shared-metrics.md` |
| Cópias do helper `chunked<T>(…)` no escopo | 2 (Relational + Snapshot) | 1 (lib comum) | ❌ | `grep -nE "const chunked" src/backend/domain/repository/permutas/*.ts` |
| Constantes de chunk duplicadas (`UPSERT_CHUNK`, `SNAPSHOT_INSERT_CHUNK`) | 2 com mesmo valor (500) | 1 nome único compartilhado | ❌ | `grep -nE "= 500" src/backend/domain/repository/permutas/*.ts` |
| Padrão `chunk + tuples + params + INSERT…ON CONFLICT` repetido em `PermutaRelationalRepository` | 4 vezes (`Adiantamento`, `Invoice`, `Declaracao`, `Casamento`) | 1 helper genérico + 4 specs declarativas | ❌ | `PermutaRelationalRepository.ts:182-383` |
| Mappers row→objeto em `PermutaRelationalRepository` | 3 com mesmo idioma `...(r.x != null ? { y: T(r.x) } : {})` | mecanismo único parametrizável | ⚠️ | `PermutaRelationalRepository.ts:459-511` |
| Mapeamento `PermutaCandidata` → 4 row shapes em `IngestaoPermutasService` | 4 funções (`toAdiantamentoRow`, `toInvoiceRows`, `toDeclaracaoRows`, `toCasamentoRows`) | 4 mappers OK, porém com idioma `...(x !== undefined ? { … } : {})` repetido ~30× | ⚠️ | `IngestaoPermutasService.ts:186-286` |
| Métodos públicos de `PermutaRelationalRepository` | 9 (`insertIngestRunHeader`, `persistIngestRun`, `upsertAdiantamentos`, `upsertInvoices`, `upsertDeclaracoes`, `replaceAutoCasamentos`, `markStale`, 3 reads, `findAdiantamento`) | ≤ 8, idealmente 2 colaboradores | ⚠️ | `grep "public " PermutaRelationalRepository.ts` |
| Entidades distintas tocadas por `PermutaRelationalRepository` | 4 (`adiantamento`, `invoice`, `declaracao`, `casamento`) | 1 por repositório (Increase Semantic Coherence) | ❌ | `PermutaRelationalRepository.ts` |
| Imports em `EleicaoPermutasService.ts` | 17 | ≤ 15 | ⚠️ | `grep -c '^import ' …/EleicaoPermutasService.ts` |
| Imports em `IngestaoPermutasService.ts` | 9 | ≤ 15 | ✅ | `grep -c '^import ' …/IngestaoPermutasService.ts` |
| Imports em `GestaoPermutasService.ts` | 8 | ≤ 15 | ✅ | `grep -c '^import ' …/GestaoPermutasService.ts` |
| Imports em `PermutaRelationalRepository.ts` | 3 | ≤ 15 | ✅ | `grep -c '^import ' …/PermutaRelationalRepository.ts` |
| Fan-in `EleicaoPermutasService` (arquivos non-test que importam) | 2 (`IngestaoPermutasService`, `routes/permutas.ts`) | — | ℹ️ | `grep -rln "from .*EleicaoPermutasService" src/backend` |
| Fan-in `PermutaRelationalRepository` (non-test) | 2 (`IngestaoPermutasService`, `GestaoPermutasService`) | — | ℹ️ | `grep -rln "from .*PermutaRelationalRepository" src/backend` |
| Fan-in `PermutaSnapshotRepository` (non-test) | 2 (`EleicaoPermutasService`, `IngestaoPermutasService`) | — | ℹ️ | `grep -rln "from .*PermutaSnapshotRepository" src/backend` |
| Density de controle de fluxo (`if/for/&&/\|\|/??`) em `PermutaRelationalRepository.ts` | 34 ocorrências em 512 LOC | < 50 / 400 LOC | ⚠️ | `grep -E "if \|else \|switch \|case \|for \|while \|\?\? \|&& \|\|\|" …` |
| Cross-layer violations (`domain/` importando `routes/lambda`, `routes/lambda` importando `repository` direto) | 0 no escopo Permutas Fase B | 0 | ✅ | `grep -rn "from '.*routes/" src/backend/domain/{service,repository}/permutas` |
| Lint Biome (`noExcessiveCognitiveComplexity ≥ 15`) no escopo Permutas | 0 warns (pré-existente `_doLogin` fora do escopo) | 0 | ✅ | `_shared-metrics.md` |
| Magic numbers de regra de negócio em `IngestaoPermutasService` | 1 (`INGEST_LOCK_KEY = 918273645`) — exportado, sem comentário de origem/colisão | constantes documentadas com critério de unicidade | ⚠️ | `IngestaoPermutasService.ts:37` |

⚠️ **Não medível localmente** (quick mode): cyclic dependency check via `madge` — não rodado. Inspeção manual no escopo (Eleicao ↔ Ingestao ↔ Repos) **não revelou ciclos**: `IngestaoPermutasService → EleicaoPermutasService` é unidirecional; `EleicaoPermutasService` não conhece `IngestaoPermutasService`. Recomendação: rodar `npx madge --circular src/backend/domain` no próximo Regis-Review completo.

⚠️ **Não medível localmente** (quick mode): cobertura por método público de `PermutaRelationalRepository` — `_coverage.json` não foi atualizado pela Fase B (drift conhecido em `migration-debt.md`). Não bloqueia a leitura: a suíte tem 12 arquivos / 88 testes verdes no escopo.

### Apêndice A — Top arquivos por LOC no escopo (não-teste)

| Rank | Arquivo | LOC |
|---|---|---|
| 1 | `src/backend/domain/service/permutas/EleicaoPermutasService.ts` | 599 |
| 2 | `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` | 512 |
| 3 | `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts` | 294 |
| 4 | `src/backend/domain/service/permutas/IngestaoPermutasService.ts` | 287 |
| 5 | `src/backend/domain/service/permutas/ElegibilidadeService.ts` | 168 |
| 6 | `src/backend/domain/service/permutas/GestaoPermutasService.ts` | 165 |
| 7 | `src/backend/domain/repository/permutas/PermutaProcessamentoRepository.ts` | 98 |
| 8 | `src/backend/domain/service/permutas/PainelService.ts` | 91 |
| 9 | `src/backend/domain/service/permutas/VariacaoCambialPermutaService.ts` | 56 |
| 10 | `src/backend/domain/service/permutas/CasamentoInvoiceService.ts` | 31 |

### Apêndice B — Fan-in dos componentes-chave do escopo

| Componente | Fan-in non-test | Importadores |
|---|---|---|
| `EleicaoPermutasService` | 2 | `IngestaoPermutasService.ts`, `routes/permutas.ts` |
| `PermutaSnapshotRepository` | 2 | `EleicaoPermutasService.ts`, `IngestaoPermutasService.ts` |
| `PermutaRelationalRepository` | 2 | `IngestaoPermutasService.ts`, `GestaoPermutasService.ts` |
| `PermutaProcessamentoRepository` | 2 | `GestaoPermutasService.ts`, `routes/permutas.ts` |
| `IngestaoPermutasService` | 1 | `jobs/ingest-permutas.ts` |
| `GestaoPermutasService` | 1 | `routes/permutas.ts` |

Fan-in baixo é esperado (frente nova, ramificação ainda enxuta) — significa que **agora** é o momento barato para consolidar duplicação antes que mais consumidores cristalizem a forma atual.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | `PermutaRelationalRepository` concentra 4 entidades (adiantamento/invoice/declaracao/casamento) + run header + sweep stale + reads em 512 LOC | ❌ ausente | `PermutaRelationalRepository.ts:100-512` |
| Increase Semantic Coherence | `PermutaRelationalRepository` mistura responsabilidades de ingestão (UPSERT/stale), recompute de casamento e reads da Gestão; `IngestaoPermutasService` cumpre só ingestão (coeso) | ⚠️ parcial | `PermutaRelationalRepository.ts:411-511` (reads convivem com writes); `IngestaoPermutasService.ts:64-184` |
| Encapsulate | `PostgreeDatabaseClient.withTransaction` + `withAdvisoryLock` encapsulam tx/lock; `persistIngestRun` encapsula o ciclo header+write+commit; mapeadores row→obj privados | ✅ presente | `PermutaRelationalRepository.ts:153-170`, `:459-511` |
| Use an Intermediary | `IngestaoPermutasService` é o intermediário entre `EleicaoPermutasService.computeCandidatas` e os 2 repositórios; `persistIngestRun(header, lockKey, write)` é intermediário para tx+lock | ✅ presente | `IngestaoPermutasService.ts:92-114`; `PermutaRelationalRepository.ts:153-170` |
| Restrict Dependencies | DDD respeitado (Service→Repository→Client); 0 violations no escopo; rotas não pulam Service; jobs chamam só Service | ✅ presente | `grep -rn "from '.*routes" src/backend/domain/{service,repository}/permutas` → 0 |
| Refactor | `EleicaoPermutasService.computeCandidatas` foi extraído da `executar` e **reusado** por `IngestaoPermutasService` — Refactor já entregue na Fase B | ✅ presente | `EleicaoPermutasService.ts:190-250`; `IngestaoPermutasService.ts:70` |
| Abstract Common Services | helper `chunked<T>(…)` duplicado entre `PermutaRelationalRepository` e `PermutaSnapshotRepository`; constante de chunk-size duplicada (`UPSERT_CHUNK`=`SNAPSHOT_INSERT_CHUNK`=500); padrão `tuples + params + INSERT…ON CONFLICT` reescrito 4× sem helper; mappers `...(r.x != null ? { y: T(r.x) } : {})` reescritos 3× | ❌ ausente | `PermutaRelationalRepository.ts:82-87`, `PermutaSnapshotRepository.ts:54-59`; padrão repetido em `PermutaRelationalRepository.ts:182-383` |
| Defer Binding (DI / configuration / polymorphism / runtime registration) | `tsyringe @injectable()` em todas as classes; `persistIngestRun` aceita `write(tx, runId)` como continuation (polymorphism leve por função); chunk-size é constante de módulo (não configurável) | ⚠️ parcial | `PermutaRelationalRepository.ts:100-170`; chunk-size hardcoded |

## 4. Findings (achados)

### F-modifiability-1: helper `chunked<T>` e constante de chunk-size duplicados entre os dois repositórios da Fase B

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:80-87` e `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:52-59`
- **Evidência (objetiva)**:
  ```ts
  // PermutaRelationalRepository.ts:80-87
  const UPSERT_CHUNK = 500;
  const chunked = <T>(items: readonly T[], size: number): T[][] => {
      if (items.length === 0) return [];
      const out: T[][] = [];
      for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
      return out;
  };

  // PermutaSnapshotRepository.ts:52-59
  const SNAPSHOT_INSERT_CHUNK = 500;
  const chunked = <T>(items: readonly T[], size: number): T[][] => {
      if (items.length === 0) return [];
      const out: T[][] = [];
      for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
      return out;
  };
  ```
- **Impacto técnico**: qualquer ajuste do teto de placeholders do wire Postgres (ex.: descobrir que 500 × 14 cols já estoura em algum driver) exige tocar 2 arquivos. Risco de divergência silenciosa (um sobe, o outro fica) — bug latente de chunking.
- **Impacto de negócio**: pequeno hoje (rate de mudança baixo), porém é o **vetor mais barato de evitar** dívida que cresce em cada nova entidade ingerida (SISPAG, Popula GED replicarão o mesmo padrão se nada mudar).
- **Métrica de baseline**: 2 cópias do helper / 2 constantes com mesmo valor `500`.

### F-modifiability-2: `PermutaRelationalRepository` repete 4× o idioma "chunk → tuples → params → INSERT…ON CONFLICT"

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services + Split Module
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:172-383`
- **Evidência (objetiva)**:
  ```
  upsertAdiantamentos / upsertAdiantamentoChunk  → linhas 172-238 (67 LOC)
  upsertInvoices / upsertInvoiceChunk            → linhas 240-296 (57 LOC)
  upsertDeclaracoes / upsertDeclaracaoChunk      → linhas 298-333 (36 LOC)
  replaceAutoCasamentos / insertCasamentoChunk   → linhas 340-383 (44 LOC)
  ```
  Cada par segue o mesmo template: `for (chunk of chunked(...))` → build `params[`{key}_${i}`]` → `tuples.push("($k_i, …)")` → `tx.insert("INSERT … VALUES " + tuples.join(', ') + " ON CONFLICT … DO UPDATE …")`.
- **Impacto técnico**: adicionar uma nova entidade ingerida (já previsto na frente Popula GED) **força copy-paste** de ~50 LOC + atualizar a constante de chunk. Mudança transversal (ex.: trocar `now()` por `$ingestedAt`, ou adicionar `tenant_id`) toca 4 lugares; chance de erro humano alta.
- **Impacto de negócio**: encarece cada feature de ingestão futura (Fase C/SISPAG/GED) em ~1 dia de copy-paste + revisão. Dobra esforço de testes (cada par tem seu test caso).
- **Métrica de baseline**: 4 funções com mesmo template; `PermutaRelationalRepository` saltou para 512 LOC.

### F-modifiability-3: `PermutaRelationalRepository` viola Increase Semantic Coherence — 4 entidades + reads + sweep + run header num único módulo

- **Severidade**: P1
- **Tactic violada**: Increase Semantic Coherence / Split Module
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:100-512`
- **Evidência (objetiva)**: 9 métodos públicos cobrindo 4 entidades distintas (`adiantamento`, `invoice`, `declaracao`, `casamento`) + cabeçalho de run (`insertIngestRunHeader`, `persistIngestRun`) + sweep (`markStale`) + reads da tela Gestão (`listAdiantamentosAtivos`, `listInvoicesEmAberto`, `listCasamentos`, `findAdiantamento`).
- **Impacto técnico**: o repositório passou a ser ponto de costura entre **ingestão** e **gestão**. Mudanças na forma de leitura da Gestão (ex.: paginação, filtro por filial) e mudanças no shape do UPSERT compartilham o mesmo arquivo — risco de regressão cruzada.
- **Impacto de negócio**: o time perde a localização do "onde mexer". Um PR de ingestão e um PR de gestão tendem a colidir no mesmo arquivo, reduzindo throughput paralelo.
- **Métrica de baseline**: 512 LOC / 9 métodos públicos / 4 entidades / 2 axes de mudança (writes vs. reads).

### F-modifiability-4: mapeamento `PermutaCandidata` → 4 row shapes em `IngestaoPermutasService` com idioma `...(x !== undefined ? { … } : {})` repetido

- **Severidade**: P2
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:186-286`
- **Evidência (objetiva)**:
  ```ts
  // 4 mappers (toAdiantamentoRow, toInvoiceRows, toDeclaracaoRows, toCasamentoRows)
  // repetem o idioma ...(c.x !== undefined ? { y: c.x } : {}) ~30 vezes.
  ...(c.adiantamento.referencia !== undefined ? { referencia: c.adiantamento.referencia } : {}),
  ...(c.adiantamento.exportador !== undefined ? { exportador: c.adiantamento.exportador } : {}),
  ...(c.adiantamento.dataEmissao !== undefined ? { dataEmissao: c.adiantamento.dataEmissao } : {}),
  // … e os mesmos para invoice/declaracao/casamento
  ```
  E os mappers row→obj em `PermutaRelationalRepository.ts:459-511` repetem o idioma simétrico `...(r.x != null ? { y: T(r.x) } : {})` mais 3 vezes.
- **Impacto técnico**: dobra superfície ao adicionar um novo campo nullable (precisa ser inserido em 2 lugares: mapeador candidata→row e mapeador row→objeto), aumentando chance de drift de schema vs. tipo TS.
- **Impacto de negócio**: cada novo campo (ex.: `tenant_id` quando multi-tenant chegar; `taxaConexos`) custa ~30 min extras de copy-paste cuidadoso.
- **Métrica de baseline**: ~30 ocorrências do idioma `...(x !== undefined ? { y: x } : {})` em `IngestaoPermutasService.ts`; ~25 ocorrências do simétrico em `PermutaRelationalRepository.ts`.

### F-modifiability-5: `EleicaoPermutasService` em 599 LOC concentra fan-out + idempotency + persist + replay + observability

- **Severidade**: P2
- **Tactic violada**: Split Module
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:1-599`
- **Evidência (objetiva)**: única classe com `executar`, `computeCandidatas`, `runEleicao`, `loadRunAsResult`, `processFilial`, `fetchDeclaracoesBatched`, `fetchInvoicesBatched`, `buildCandidata`, `countByMotivo`, `advisoryLockKey`, mais helpers. A Refactor que extraiu `computeCandidatas` é positiva, mas a classe segue acima do alvo de 400 LOC.
- **Impacto técnico**: o serviço acumulará mais responsabilidades à medida que SISPAG/GED também precisem de `computeCandidatas`-like + idempotency replay. Custos de teste sobem (652 LOC de teste).
- **Impacto de negócio**: ponto único de fricção para mudanças concorrentes (eleição vs. ingestão evoluem juntas).
- **Métrica de baseline**: 599 LOC / 17 imports / 32 ocorrências de controle de fluxo.

### F-modifiability-6: `INGEST_LOCK_KEY = 918273645` é magic number exportado sem critério de unicidade documentado

- **Severidade**: P3
- **Tactic violada**: Defer Binding (configuration externalization)
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:37`
- **Evidência (objetiva)**:
  ```ts
  export const INGEST_LOCK_KEY = 918273645;
  ```
  Vizinho `EleicaoPermutasService` gera lock-key por `advisoryLockKey(idempotencyKey)` (djb2 hash). Convivem duas convenções no mesmo subsistema; sem documento que garanta a unicidade de `918273645` em relação ao espaço usado pela idempotency-key.
- **Impacto técnico**: risco baixo hoje (probabilidade de colisão djb2 com `918273645` é desprezível para keys conhecidas), porém quando outros jobs (SISPAG, GED) adicionarem suas próprias `*_LOCK_KEY` o esquema vira "tribal knowledge".
- **Impacto de negócio**: dívida de configuração que cresce no SaaS multi-tenant (cada tenant terá seu espaço de lock-keys; sem registry, colisão silenciosa = bloqueio cruzado de jobs).
- **Métrica de baseline**: 1 constante mágica documentada como comentário, sem registry central.

### F-modifiability-7: chunk-size de UPSERT é constante de módulo, não configurável

- **Severidade**: P3
- **Tactic violada**: Defer Binding (configuration files)
- **Localização**: `PermutaRelationalRepository.ts:80`, `PermutaSnapshotRepository.ts:52`
- **Evidência (objetiva)**: `const UPSERT_CHUNK = 500;` / `const SNAPSHOT_INSERT_CHUNK = 500;` — fixos no código. Mudar exige redeploy (overlap com Deployability).
- **Impacto técnico**: ajustar o teto para um tenant com driver Postgres distinto exige nova versão.
- **Impacto de negócio**: cada novo cliente AWS (estado-alvo) que precise de ajuste fino paga redeploy.
- **Métrica de baseline**: 2 constantes hardcoded, ambas `500`.

## 5. Cards Kanban

### [modifiability-1] Extrair `chunked<T>` e `UPSERT_CHUNK` para uma lib compartilhada de repositório

- **Problema**
  > O helper `chunked<T>(items, size)` e a constante de chunk-size (500) estão duplicados literalmente entre `PermutaRelationalRepository.ts:80-87` e `PermutaSnapshotRepository.ts:52-59`. Qualquer ajuste de teto do wire Postgres exige tocar 2 arquivos com risco de divergência silenciosa.

- **Melhoria Proposta**
  > Criar `src/backend/domain/libs/db/chunked.ts` com a função `chunked<T>` (Abstract Common Services) e a constante `DEFAULT_UPSERT_CHUNK_SIZE` (com comentário explicando o cálculo `500 × cols ≈ placeholders` e o teto wire Postgres). Importar nos dois repositórios; remover as duas cópias locais. Manter a possibilidade de cada repo passar um override de tamanho ao chamar o helper.

- **Resultado Esperado**
  > 1 única definição de `chunked` no codebase. Constante única, comentada. Próxima entidade ingerida (Popula GED) reusa sem copy-paste.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-1, F-modifiability-7
- **Métricas de sucesso**:
  - Cópias do helper `chunked`: 2 → 1
  - Constantes de chunk-size duplicadas: 2 → 1
- **Risco de não fazer**: cada nova entidade ingerida copia a função; chance de divergência cresce com o número de repositórios.
- **Dependências**: nenhuma.

### [modifiability-2] Introduzir helper `bulkUpsert` declarativo e reduzir 4 funções de upsert chunk a especificações

- **Problema**
  > `PermutaRelationalRepository` repete 4× o idioma "build tuples → build params nomeados `$col_i` → `INSERT…ON CONFLICT…DO UPDATE`" para Adiantamento, Invoice, Declaracao e Casamento (linhas 172-383). Cada nova entidade da ingestão (Fase C, SISPAG, GED) força ~50 LOC de copy-paste, e mudanças transversais (ex.: adicionar `tenant_id`, trocar `now()` por timestamp explícito) precisam ser feitas em 4 lugares.

- **Melhoria Proposta**
  > Extrair um helper `bulkUpsert(tx, { table, columns, conflictTarget, updateColumns, rows, toParams })` em `src/backend/domain/libs/db/bulkUpsert.ts` (Abstract Common Services + Encapsulate). Cada método público de `PermutaRelationalRepository` vira uma chamada declarativa: declara a tabela, as colunas, o `ON CONFLICT`, a função que extrai params do row, e invoca o helper — o helper cuida do chunking, da montagem de tuples e do SQL final. Mantém SQL parametrizado (Rule #5) e o teste atual continua válido.

- **Resultado Esperado**
  > `PermutaRelationalRepository.ts` cai de 512 LOC para ~250 LOC. Adicionar uma 5ª entidade vira ~30 LOC (1 spec + 1 mapper). Mudanças transversais (auditoria, multi-tenant) tocam 1 lugar.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — inclui suíte de testes do helper + porte das 4 chamadas
- **Findings relacionados**: F-modifiability-2, F-modifiability-3
- **Métricas de sucesso**:
  - LOC `PermutaRelationalRepository.ts`: 512 → ≤ 300
  - Cópias do padrão "tuples + params + INSERT…ON CONFLICT": 4 → 0 (1 helper)
  - Esforço para adicionar uma nova entidade ingerida: ~50 LOC → ~30 LOC
- **Risco de não fazer**: dívida endurece quando SISPAG/GED replicarem o template; cada feature futura paga ~1d a mais.
- **Dependências**: idealmente após [modifiability-1] (o `bulkUpsert` usa o `chunked` extraído).

### [modifiability-3] Dividir `PermutaRelationalRepository` em writes (ingestão) e reads (gestão)

- **Problema**
  > `PermutaRelationalRepository.ts:100-512` mistura 4 entidades, sweep stale, recompute de casamento e leituras da tela Gestão. PRs de ingestão e PRs de gestão colidem no mesmo arquivo; localização de mudança é difusa.

- **Melhoria Proposta**
  > Dividir em dois repositórios coesos (Split Module + Increase Semantic Coherence): (1) `PermutaIngestaoRepository` — `persistIngestRun`, `insertIngestRunHeader`, `upsert*`, `replaceAutoCasamentos`, `markStale`; (2) `PermutaGestaoReadRepository` — `listAdiantamentosAtivos`, `listInvoicesEmAberto`, `listCasamentos`, `findAdiantamento` + mappers row→obj. Os tipos de row (Row interfaces) podem ficar num arquivo `types.ts` compartilhado.

- **Resultado Esperado**
  > Mudanças em writes não tocam reads. Cada repositório vira mais simples de testar isoladamente. Localização do "onde mexer" fica óbvia pela URL do PR.

- **Tactic alvo**: Split Module, Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — inclui dividir testes em 2 suítes + atualizar DI nos services consumidores
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Maior arquivo do escopo Permutas Fase B: 512 LOC → ≤ 300 LOC
  - Entidades por repositório: 4 → ≤ 2 (writes) e ≤ 0 entidades de write no repo de reads
  - Colisões de merge esperadas entre PRs de ingestão vs. gestão: alta → baixa
- **Risco de não fazer**: o arquivo continua crescendo cada vez que a Gestão pede uma nova view ou a ingestão ganha uma entidade.
- **Dependências**: melhor após [modifiability-2] (a divisão fica mais clara depois que cada UPSERT vira spec declarativa).

### [modifiability-4] Consolidar mappers `*Row` ↔ objeto num utilitário `pickDefined`

- **Problema**
  > O idioma `...(x !== undefined ? { y: x } : {})` aparece ~30× em `IngestaoPermutasService.ts:186-286` (objeto→row) e o simétrico `...(r.x != null ? { y: T(r.x) } : {})` aparece ~25× em `PermutaRelationalRepository.ts:459-511` (row→objeto). Cada novo campo nullable é adicionado em 2 lugares com risco de drift entre TS e schema.

- **Melhoria Proposta**
  > Extrair um helper `pickDefined<T>(spec)` em `src/backend/domain/libs/object/pickDefined.ts` (Abstract Common Services) que recebe um mapa `{ chave: valor | undefined }` e devolve só os pares definidos. Reescrever os mappers em 1-3 linhas cada. Opcional: helper análogo `pickNonNull` para o lado row→obj.

- **Resultado Esperado**
  > Cada mapper vira ~10 LOC em vez de ~30. Adicionar campo nullable toca 1 linha no spec.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Repetições do idioma `...(x !== undefined ? { y: x } : {})`: ~55 → ≤ 10
- **Risco de não fazer**: cada novo campo da ontologia adiciona ~30 min de copy-paste.
- **Dependências**: nenhuma.

### [modifiability-5] Externalizar `INGEST_LOCK_KEY` e chunk-size via `EnvironmentProvider` com defaults

- **Problema**
  > `INGEST_LOCK_KEY = 918273645` está hardcoded em `IngestaoPermutasService.ts:37` sem registry central de lock-keys. O chunk-size de UPSERT é `const = 500` em 2 lugares (`PermutaRelationalRepository.ts:80`, `PermutaSnapshotRepository.ts:52`). Mudar qualquer um exige redeploy (overlap com Deployability).

- **Melhoria Proposta**
  > (1) Criar `src/backend/domain/libs/locks/AdvisoryLockRegistry.ts` com constantes nomeadas e comentário garantindo unicidade no namespace; manter `INGEST_LOCK_KEY` lá, com espaço pra `SISPAG_LOCK_KEY` etc. (2) Permitir override do chunk-size via `EnvironmentProvider` com default 500 (Defer Binding via configuration files). Não precisa mudar para SSM já; pode viver como env.

- **Resultado Esperado**
  > Adicionar novo lock-key documentado em 1 lugar; ajustar chunk-size por ambiente sem release.

- **Tactic alvo**: Defer Binding (configuration files + runtime registration)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-6, F-modifiability-7
- **Métricas de sucesso**:
  - Magic numbers de regra de coordenação em services: 1 → 0
  - Constantes de chunk-size com valor hardcoded: 2 → 0 (vira default no provider)
- **Risco de não fazer**: namespace de lock-keys vira tribal knowledge quando SISPAG/GED entram; ajuste de chunk vira release.
- **Dependências**: melhor depois de [modifiability-1] (constante única antes de externalizar).

### [modifiability-6] Quebrar `EleicaoPermutasService` em orquestrador (executar/runEleicao/replay) + colaborador `PermutaFanoutService` (computeCandidatas/processFilial/batches)

- **Problema**
  > `EleicaoPermutasService.ts` está em 599 LOC reunindo idempotency-replay (`executar`, `loadRunAsResult`, `advisoryLockKey`), persistência de run (`runEleicao`), fan-out Conexos (`computeCandidatas`, `processFilial`, `fetchDeclaracoesBatched`, `fetchInvoicesBatched`, `buildCandidata`) e auxiliares. À medida que SISPAG/GED replicarem o padrão `computeCandidatas`-like, o serviço continuará crescendo.

- **Melhoria Proposta**
  > Extrair um `PermutaFanoutService` (Split Module) com `computeCandidatas`, `processFilial`, `fetchDeclaracoesBatched`, `fetchInvoicesBatched`, `buildCandidata`, `countByMotivo`. O `EleicaoPermutasService` fica apenas com `executar` / `runEleicao` / `loadRunAsResult` / `advisoryLockKey`. `IngestaoPermutasService` passa a depender do `PermutaFanoutService` diretamente (a relação `Ingestao → Eleicao` some — ela já é só para reusar `computeCandidatas`).

- **Resultado Esperado**
  > `EleicaoPermutasService` cai de 599 → ~280 LOC. Acoplamento direto `Ingestao → Eleicao` (semanticamente estranho — ingestão não depende de eleição, depende do fan-out) some.

- **Tactic alvo**: Split Module, Increase Semantic Coherence
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - LOC `EleicaoPermutasService.ts`: 599 → ≤ 300
  - Fan-in de `EleicaoPermutasService` em código non-test: 2 → 1 (só `routes/permutas.ts`)
  - Fan-in de novo `PermutaFanoutService`: 2 (Eleicao + Ingestao)
- **Risco de não fazer**: o serviço continua ganhando massa; testes de Eleicao já estão em 652 LOC, vão ficar mais lentos e quebradiços.
- **Dependências**: nenhuma; pode rodar em paralelo aos cards de repositório.

## 6. Notas do agente

- Escopo deliberadamente fechado nos artefatos da Fase B do escopo (`EleicaoPermutasService`, `Ingestao/GestaoPermutasService`, `PermutaRelational/Snapshot/ProcessamentoRepository`). Quick mode → não rodei `madge`, não recoletei coverage; declarei como não-medíveis.
- Cross-QA — **Abstract Common Services + Split Module** (cards 1, 2, 3) reduzem superfície de mudança e portanto **diminuem custo de testar** (overlap com Testability: cada novo cenário de UPSERT chunked hoje exige test setup repetido).
- Cross-QA — **Defer Binding via configuration** (card 5, `INGEST_LOCK_KEY` + chunk-size) é também ganho de **Deployability**: qualquer ajuste hoje exige redeploy; externalizar elimina release por tuning.
- Cross-QA — **Encapsulate de tx+lock em `persistIngestRun`** (já feito; positivo) sobrepõe-se a Integrability (a forma como o Service consome o Repository fica desacoplada do detalhe de transação/advisory lock). Bom precedente para replicar.
- Decisão de scoping — não abri cards para `EleicaoPermutasService.executar`/idempotency replay (mantive como F-modifiability-5 + card 6 enxuto), porque o ciclo está coberto por testes e a Refactor de `computeCandidatas` já entregou o ganho principal de reuso.
