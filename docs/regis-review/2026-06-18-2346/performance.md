---
qa: Performance
qa_slug: performance
run_id: 2026-06-18-2346
agent: qa-performance
generated_at: 2026-06-19T00:00:00-03:00
scope: backend
score: 9
findings_count: 3
cards_count: 2
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Job diário "eleição de permutas" (EventBridge — alvo / cron Render — atual) varrendo `N` PROFORMAs por filial | Necessidade de distinguir `JA_PERMUTADO` vs `SEM_SALDO_PERMUTAR` ao reprovar Gate 2 (saldo == 0) | `EleicaoPermutasService.fetchDetailAndEvaluate` hidratando `valorPermutado` a partir do MESMO `getDetalheTitulos` já chamado para `valorPermutar`/`pago` | Estado normal: Conexos saudável, fan-out 1 detail-fetch/PROFORMA já existente (ADR-0020 Add. #8) | Ler `mnyTitPermuta` do payload retornado, mapear e propagar para `Adiantamento.valorPermutado` SEM nova chamada HTTP | Round-trips por PROFORMA permanece em **1** (não +1); p95 latência do job inalterada (Δ ≤ 1ms por candidata por parsing extra de `parseOptionalNumber`) |

> Em uma frase: o stimulus "preciso saber se já permutou" foi resolvido **dentro do payload existente** — zero novo I/O. O Bass tactic dominante exercido é **Reduce Overhead** (reaproveitar payload em curso).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Novas chamadas HTTP introduzidas pela feature por PROFORMA | 0 | 0 | ✅ | `EleicaoPermutasService.ts:461-500` (apenas leitura de campo já existente no `detalhe`) |
| Novas queries SQL introduzidas pela feature | 0 | 0 | ✅ | `git diff` no escopo backend — nenhum arquivo em `domain/repository/` tocado |
| Round-trips Conexos/PROFORMA no job (antes vs. depois) | 1 → 1 | sem regressão | ✅ | `ConexosClient.getDetalheTitulos` chamado uma vez por candidata (l.881-931); `mapDetalheTitulos` retorna agora 3 campos do MESMO objeto (l.941-952) |
| Custo adicional por candidata (parsing) | +1 `parseOptionalNumber` (string → number) | desprezível | ✅ | `ConexosClient.ts:945` — `parseOptionalNumber(detail.mnyTitPermuta)` |
| Custo adicional de payload (bytes) | 0 — Conexos já entregava `mnyTitPermuta` no `GET /com298/{docCod}` | 0 | ✅ | Probe real 2026-06-18 doc 8266 (comentário em `ConexosClient.ts:938-940`) |
| LOC tocadas em hot-path | ~12 (3 backend + 1 frontend label + spread no hydrate) | mínimo cirúrgico | ✅ | `_shared-metrics.md` diff stat |
| Bundle frontend (rota `/permutas`) — Δ | +1 entrada no `MOTIVO_LABEL` + ramo `if (motivo === 'ja-permutado')` no `StatusBadge` | First Load JS sem regressão | ✅ | `page.tsx:41,73-82` (≤ 30 bytes gzip a mais) |
| Cold-start backend — Δ | 0 (nenhum import novo, nenhuma dep adicionada em `package.json`) | 0 | ✅ | `_shared-metrics.md` — sem alteração de deps |
| p95 latência job (CloudWatch) | ⚠️ Não medível localmente | sem regressão vs. baseline pré-feature | ⚠️ | Requer CloudWatch — recomendação na §6 |

> Veredito: a mudança é **performance-neutral by design**. Toda métrica de demanda de recurso (I/O, DB, CPU, bundle) está em 0 ou desprezível. Nada novo a otimizar; o score reflete a higiene do diff, não uma nova carga.

## 3. Tactics — Cobertura no nf-projects

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — feature reativa a snapshot diário, não amostragem contínua | N/A | — |
| Limit Event Response | Não aplicável a este delta — feature lê um campo a mais, não responde a eventos novos | N/A | — |
| Prioritize Events | N/A para este delta — não introduz nova classe de evento | N/A | — |
| Reduce Overhead | Reaproveitamento integral do payload `getDetalheTitulos` para extrair `mnyTitPermuta` — zero chamada extra. Exemplar do tactic. | ✅ presente | `ConexosClient.ts:941-952`, `EleicaoPermutasService.ts:461-500` |
| Bound Execution Times | Já coberto antes do delta: `RetryExecutor` envelopa a chamada detail (`ConexosClient.ts:890`) e `signal.aborted` aborta cooperativamente o fan-out de filiais (`EleicaoPermutasService.ts:447-449`) | ✅ presente | `ConexosClient.ts:881-931`, `EleicaoPermutasService.ts:445-449` |
| Increase Resource Efficiency | Mapping enxuto — `mapDetalheTitulos` faz um único parse por campo, retorno é objeto pequeno com spreads condicionais (não cria entradas com `undefined`) | ✅ presente | `ConexosClient.ts:944-952`; `EleicaoPermutasService.ts:484-500` |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Increase Resources | N/A para este delta — não muda dimensionamento de Lambda/pool | N/A | — |
| Increase Concurrency | Já existente fora do delta: `Promise.all` no fan-out por filial (não tocado) | ✅ presente (pré-existente) | `EleicaoPermutasService.ts` (estrutura geral, fora do trecho do delta) |
| Maintain Multiple Copies of Computations | N/A — não há computação caching-eligible introduzida | N/A | — |
| Maintain Multiple Copies of Data | N/A — `valorPermutado` é leitura point-in-time, não cacheável (vide regra `valor-permutar-ponto-no-tempo` referenciada em `ConexosClient.ts:852`) | N/A | — |
| Bound Queue Sizes | N/A para este delta (sem SQS no caminho da feature) | N/A | — |
| Schedule Resources | N/A para este delta — agendamento (EventBridge) é alvo, não é exercido pela feature | N/A | — |

### Modern facets

| Faceta | Status | Evidência |
|---|---|---|
| Cold-start budget | ✅ inalterado — zero novo `import`, zero nova dep | `package.json` não foi tocado (_shared-metrics.md, diff stat) |
| Cache strategy | ✅ doc já recomenda cache por `docCod` por execução (`ConexosClient.ts:870-872`); delta não regride esse contrato | `ConexosClient.ts:870-872` |
| Index discipline (SQL) | N/A — nenhuma query SQL adicionada/alterada | — |
| Bundle leanness (FE) | ✅ Δ ≈ 1 chave em `Record<string, string>` + 1 ramo condicional curto | `page.tsx:38-90` |

## 4. Findings

### F-performance-1: leitura de `mnyTitPermuta` reutiliza payload existente — zero overhead novo (POSITIVO)

- **Severidade**: P3 (registro positivo — nenhuma ação requerida)
- **Tactic alvo**: Reduce Overhead
- **Localização**: `src/backend/domain/client/ConexosClient.ts:941-952`, `src/backend/domain/service/permutas/EleicaoPermutasService.ts:461-500`
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:944-945
  const valorPermutar = this.parseOptionalNumber(detail.mnyTitPermutar);
  const valorPermutado = this.parseOptionalNumber(detail.mnyTitPermuta);
  ```
  ```ts
  // EleicaoPermutasService.ts:491-493 — propagação sem nova call
  ...(detalhe.valorPermutado !== undefined
      ? { valorPermutado: detalhe.valorPermutado }
      : {}),
  ```
- **Impacto técnico**: nenhum negativo. A feature exercita o tactic Reduce Overhead corretamente — extrai informação adicional do mesmo round-trip já pago pela hidratação de `valorPermutar`/`pago`. Round-trips por PROFORMA por execução de job permanecem em 1.
- **Impacto de negócio**: estado "já permutado" (CONCLUÍDO, não erro) é identificável a custo computacional zero — habilita UX correto na tela sem aumentar custo Lambda/Conexos.
- **Métrica de baseline**: chamadas HTTP/PROFORMA antes do delta = 1; depois do delta = 1. Δ custo Conexos = 0.

### F-performance-2: p95 do job de eleição não é medível localmente (gap de observabilidade pré-existente)

- **Severidade**: P3 (débito de observabilidade pré-existente; não causado por esta feature)
- **Tactic alvo**: Bound Execution Times (verificação ex-post)
- **Localização**: ambiente — runtime atual roda em Render (Express), sem CloudWatch; alvo Lambda ainda não em produção.
- **Evidência (objetiva)**:
  ```
  _shared-metrics.md: "terraform plan (no infra/ in repo — target-state only)"
  ```
- **Impacto técnico**: não é possível confirmar empiricamente que a feature manteve p95/p99 do job (apenas argumento formal: zero novo I/O ⇒ Δ desprezível). Caso a hipótese "Conexos retorna sempre `mnyTitPermuta` no `com298/{docCod}`" se prove falsa para algum tenant, sentinela de p95 seria a primeira a detectar.
- **Impacto de negócio**: risco extremamente baixo — payload validado por probe real 2026-06-18 doc 8266 (comentário em código).
- **Métrica de baseline**: p95 latência do detail-fetch — não disponível em ambiente atual.

### F-performance-3: ausência de cache por `docCod` durante a execução continua sendo apenas contratual, não enforçada

- **Severidade**: P3 (pré-existente, não regredido por esta feature; mantido em radar)
- **Tactic alvo**: Maintain Multiple Copies of Computations (memoização intra-job)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:870-872` (recomendação no doc) vs. `EleicaoPermutasService.ts:461-500` (chamada direta sem memo).
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:870-872
  // **Consumers:** `EleicaoPermutasService` (Gate 2 `valorPermutar > 0` +
  // Gate 3 `pago`). One call per PROFORMA candidate. Caller is expected to
  // cache by `docCod` per execution to avoid redundant calls.
  ```
- **Impacto técnico**: se algum caller futuro chamar `getDetalheTitulos` para o mesmo `docCod` duas vezes na mesma run (ex.: re-avaliação após N:M), haverá round-trip duplicado. Hoje o caller único (`fetchDetailAndEvaluate`) executa uma vez por candidata — cache não estritamente necessário; risco é de regressão futura silenciosa.
- **Impacto de negócio**: baixo enquanto o consumidor for único; cresce se a feature `valorPermutado` motivar leitura adicional em outro fluxo (ex.: tela Gestão querer mostrar "permutado em..." sob demanda).
- **Métrica de baseline**: chamadas `com298/{docCod}` por `(docCod, runId)` = 1 hoje. Sem instrumentação para enforçar.

## 5. Cards Kanban

### [performance-1] Instrumentar contador `conexos.com298.detail.calls_per_doccod_per_run` para enforçar contrato "1 call por PROFORMA por execução"

- **Problema**
  > O comentário em `ConexosClient.ts:870-872` declara que o caller deve cachear `getDetalheTitulos` por `docCod` na execução, mas o contrato não é mensurado. Hoje só há um consumer (`EleicaoPermutasService.fetchDetailAndEvaluate`) e ele cumpre. Qualquer caller futuro (telas Gestão / N:M / GED) pode regredir o contrato sem alarme.

- **Melhoria Proposta**
  > Adicionar contador no `ConexosClient.getDetalheTitulos` chaveado por `(runId, docCod)` (passar `runId` pelo `flowId` que o caller já carrega — ver `EleicaoPermutasService.ts:441`). Emitir `logService.warn` quando o counter exceder 1 (tactic Bass: Maintain Multiple Copies of Computations via memoização intra-run). Quando a infra-alvo (CloudWatch EMF) entrar, publicar como métrica. Tocar `ConexosClient.ts:881-931`.

- **Resultado Esperado**
  > Visibilidade de regressões silenciosas onde calls duplicados/PROFORMA/run aparecem. Hoje contagem auditada = não-instrumentada → futura contagem auditada ≤ 1 com warn em caso contrário.

- **Tactic alvo**: Maintain Multiple Copies of Computations (memoização) + Reduce Overhead (observabilidade)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - `com298.detail.calls_per_doccod_per_run` p95: não medido → ≤ 1
  - Warns por run com chamadas duplicadas: não medido → 0
- **Risco de não fazer**: se uma feature futura (ex.: re-hidratação na tela Gestão) reler o detail por PROFORMA, Conexos será sobrecarregado silenciosamente. Detecção via logs custaria grep ad-hoc em incidente.
- **Dependências**: nenhuma; pode ser feito antes da migração para Lambda. Cross-QA: alinhar com `availability-*` (mesma log/metric pipeline) e `integrability-*` (controle de demanda no Conexos).

### [performance-2] Publicar p95 do `getDetalheTitulos` por filial quando a stack Lambda/CloudWatch entrar (deferred)

- **Problema**
  > Hoje não há sentinela em produção que detecte regressão de p95 no detail-fetch — argumentamos formalmente que esta feature não regride latência (zero novo I/O), mas não confirmamos com número. Em Render, métricas por endpoint são limitadas.

- **Melhoria Proposta**
  > Quando o handler migrar para Lambda (alvo), emitir EMF com `endpoint=com298_detail`, `filCod`, `duration_ms`. Publicar dashboard com p50/p95/p99 e alarme em desvio > 30% vs. baseline 7d. Tactic Bass: Bound Execution Times (verificação ex-post). Diferido até a migração — entra no follow-up do bootstrap Lambda.

- **Resultado Esperado**
  > p95 `com298_detail` observável. Baseline atual ⚠️ não medível → alvo: p95 ≤ 1500ms com alarme em +30%.

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P3
- **Esforço estimado**: M (2–5d) — depende da existência da stack alvo
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - p95 `com298_detail`: não medido → ≤ 1500ms
  - Cobertura de alarme p95 em endpoint Conexos: 0/8 → 8/8
- **Risco de não fazer**: cegueira a degradação Conexos. Hipóteses como "Conexos sempre retorna `mnyTitPermuta` no detail" não ganham confirmação empírica continuada.
- **Dependências**: migração para Lambda + EventBridge + CloudWatch (target architecture). Cross-QA: `availability-*` e `deployability-*` provavelmente já têm cards equivalentes — consolidar em um único item de "observability foundations".

## 6. Notas do agente

- Escopo cirúrgico aplicado: a feature lê `mnyTitPermuta` do mesmo payload já fetched por `getDetalheTitulos`. Confirmei manualmente em `ConexosClient.ts:944-952` e `EleicaoPermutasService.ts:461-500` que **zero novo round-trip** é introduzido — performance é neutra by design, score reflete higiene do diff.
- Métricas não-medíveis localmente (p95 job, latência Conexos) deferidas para `performance-2`; ambiente atual é Render/Supabase sem CloudWatch (vide `_shared-metrics.md`).
- Cross-QA detectado para o consolidator: F-performance-3 e card `performance-1` sobrepõem com Integrability (controle de fan-out no Conexos) e Availability (mesmo log pipeline). Card `performance-2` sobrepõe com Deployability (target Lambda/CloudWatch). Apenas `performance-1` é P3-acionável agora; o restante é registro defensivo do estado neutro do delta.
