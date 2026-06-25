---
qa: Performance
qa_slug: performance
run_id: 2026-06-25-1555
agent: qa-performance
generated_at: 2026-06-25T15:55:00Z
scope: backend,frontend
score: 6
findings_count: 4
cards_count: 4
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista no painel de Permutas | Clica "Exportar" 1..N vezes em sequência (6 tipos disponíveis no popover) | `GET /permutas/relatorios/:tipo` → `RelatorioExportService.exportar()` → `GestaoPermutasService.exporGestao()` (7 reads paralelos no Postgres) + serialização xlsx em memória | Operação normal (deploy Render single-instance, Postgres Supabase) | Backend devolve o `.xlsx` sem degradar `/gestao` para outros usuários e sem estourar memória da instância | p95 do export ≤ 1.5× p95 de `/gestao`; pico de heap < 256MB; sem 429 espúrios |

> Nota: a feature é READ-ONLY e reusa o mesmo compute do painel; o risco realista é
> **amplificação de carga** (cada clique = 1 load completo do painel) e **memória do workbook**
> (todo o `.xlsx` é bufferizado antes do `res.send`).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Reads paralelos no Postgres por export | 7 (mesmos do `/gestao`) | ≤ 7 (compartilhar resultado quando possível) | ⚠️ | `src/backend/domain/service/permutas/GestaoPermutasService.ts:46-62` |
| Cache de `exporGestao()` reaproveitado entre `/gestao` e `/relatorios/:tipo` | Inexistente — cada chamada é independente | TTL curto (≥ 5s) ou request-coalescing por `requestId` | ❌ | `RelatorioExportService.ts:51` |
| Rate-limit no endpoint de export | Apenas `globalLimiter` (100 req/min/IP); SEM `heavyRouteLimiter` | `heavyRouteLimiter` (10 req/min/IP), igual `/eleicao`, `/ingestao`, `/reconciliar` | ❌ | `src/backend/routes/permutas.ts:371-386` vs `:131-156` |
| Estratégia de envio do `.xlsx` | Buffer 100% em memória via `workbook.xlsx.writeBuffer()` + `res.send(buffer)` | Stream para o `res` via `workbook.xlsx.write(stream)` | ⚠️ | `RelatorioExportService.ts:382-396` |
| Linhas máximas previstas hoje | ~509 adiantamentos + ~126 invoices (baseline histórico do shared-metrics) | n/a | ✅ baixo, mas escala | `docs/regis-review/2026-06-25-1555/_shared-metrics.md` + comentário do service |
| Estimativa de pico de memória por export ("adiantamentos", ~509 linhas × 27 colunas) | ~5–15 MB transitórios (xlsx + JS heap) por requisição concorrente | < 50 MB por concurrent | ✅ (hoje) / ⚠️ (a 5k linhas) | inferência pelo schema do `defAdiantamentos` em `RelatorioExportService.ts:95-163` |
| Custo extra de re-execução do painel ao exportar logo após carregar | 7 reads adicionais por export (duplicação total do compute) | 0 reads se servido do mesmo snapshot da request anterior (TTL curto / share) | ❌ | `RelatorioExportService.ts:51` + `routes/permutas.ts:357-365` |
| Front-end: import de exceljs / dependência pesada nova | Nenhuma (somente `fetch` + blob no `api.ts`) | n/a | ✅ | `_shared-metrics.md` |

> ⚠️ **Não medível localmente:** latência real do `exporGestao()` em produção (depende de pool/Supabase),
> peak heap por concorrência simultânea, custo de CPU do `writeBuffer()`. Recomendação: instrumentar
> com métricas `permutas.relatorios.duration_ms`, `permutas.relatorios.bytes_out` e contador por `tipo`.

## 3. Tactics — Cobertura no financeiro

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A — feature é trigger humano, sem amostragem contínua | N/A | — |
| Limit Event Response | `globalLimiter` aplicado (heranço do app), mas SEM `heavyRouteLimiter` neste endpoint apesar de ele disparar o mesmo fan-out do painel | ⚠️ parcial | `routes/permutas.ts:371-386` |
| Prioritize Events | Sem fila/priorização — exports concorrem direto com `/gestao` no mesmo pool de conexões Postgres | ❌ ausente | mesma fonte |
| Reduce Overhead | Projeção (`montarDefinicao`) separada da serialização (testável, ok). Mas o `gestaoService.exporGestao()` é chamado novamente mesmo quando `/gestao` acabou de servir o cliente | ⚠️ parcial | `RelatorioExportService.ts:47-62` |
| Bound Execution Times | Sem timeout explícito por request (axios padrão do Express). Um export "travado" segura uma conexão até o ERP/DB destravar | ❌ ausente | `routes/permutas.ts:371-386` |
| Increase Resource Efficiency | exceljs é OK p/ esta escala; reaproveitamento do mesmo compute do painel não é feito | ⚠️ parcial | `RelatorioExportService.ts:51` |
| Increase Resources | Render single-instance; nenhum dial específico para export | ❌ ausente | infra Render (estado atual) |
| Increase Concurrency | `Promise.all` dos 7 reads já existe no `exporGestao` (herdado, ok) | ✅ presente | `GestaoPermutasService.ts:46-62` |
| Maintain Multiple Copies of Computations | Cache do snapshot do painel poderia servir 1 painel + N exports do mesmo analista | ❌ ausente | `RelatorioExportService.ts:51` |
| Maintain Multiple Copies of Data | Snapshot relacional já materializa a ingestão (read-side preparado), mas o export não usa um snapshot serializável reutilizável | ⚠️ parcial | `PermutaSnapshotRepository` referenciado em `GestaoPermutasService.ts:61` |
| Bound Queue Sizes | N/A — não há fila SQS no caminho | N/A | — |
| Schedule Resources | N/A — request síncrono | N/A | — |
| Cold start budget | N/A no estado atual (Express em Render, não Lambda) | N/A | CLAUDE.md "Estado Atual vs. Alvo" |
| Cache strategy | Inexistente para `exporGestao()` (`/gestao` e `/relatorios/:tipo` recomputam) | ❌ ausente | `GestaoPermutasService.ts:45-62` |
| Index discipline | Não tocada pela feature; ler/agregar usa o mesmo SQL do painel | N/A | — |
| Bundle leanness | exceljs já estava no `package.json`; sem nova dep | ✅ presente | `_shared-metrics.md` |

## 4. Findings

### F-performance-1: Export dispara `exporGestao()` completo a cada clique, sem cache nem coalescing

- **Severidade**: P1 (alto)
- **Tactic violada**: Reduce Overhead / Maintain Multiple Copies of Computations / Cache strategy
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:51` (`await this.gestaoService.exporGestao(requestId)`) + `src/backend/routes/permutas.ts:371-386`
- **Evidência (objetiva)**:
  ```ts
  // RelatorioExportService.ts:47-61
  public exportar = async (tipo: RelatorioTipo, requestId: string) => {
      const gestao = await this.gestaoService.exporGestao(requestId); // 7 reads paralelos
      const definicao = this.montarDefinicao(tipo, gestao);
      ...
  }
  // GestaoPermutasService.ts:46-62 — 7 queries por chamada
  const [adiantamentos, invoices, casamentos, processamentos, declaracoes, alocacoes, ultimaIngestao]
      = await Promise.all([...sete reads...]);
  ```
- **Impacto técnico**: cada clique em "Exportar" reexecuta exatamente o mesmo compute do `/gestao` que o analista acabou de ver. O popover lista 6 tipos — um analista que baixa todos faz **6 × 7 = 42 queries** no Postgres em segundos, todas servindo o MESMO snapshot lógico.
- **Impacto de negócio**: amplifica carga no Supabase (cota Supabase tem limite de conexões), e quando o painel demorar (snapshot grande), exportar todos os relatórios multiplicará o tempo de espera percebido pelo analista.
- **Métrica de baseline**: 7 reads por export × 6 tipos = até 42 reads/analista para gerar a "pasta completa" do dia; com 4 analistas simultâneos em fechamento = 168 reads em ~1 min, **todos redundantes em relação ao último `/gestao`**.

### F-performance-2: Endpoint `/relatorios/:tipo` SEM `heavyRouteLimiter` apesar de ter o mesmo custo dos rotas que o têm

- **Severidade**: P1 (alto)
- **Tactic violada**: Limit Event Response
- **Localização**: `src/backend/routes/permutas.ts:371-386` (sem middleware) vs `:131-156` (`/eleicao` usa `heavyRouteLimiter`), `:166-195` (`/ingestao` idem), `:420-442` (`/reconciliar` idem)
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts:371-386 — sem rate limiter específico
  router.get('/relatorios/:tipo', asyncHandler(async (req, res) => { ... }));

  // routes/permutas.ts:131-134 — padrão da casa para rotas caras
  router.post('/eleicao', heavyRouteLimiter, requireRole('admin'), ...);
  ```
- **Impacto técnico**: um analista (ou um script de teste, ou um duplo-clique reativo do popover) pode disparar 100 req/min no endpoint (limite global), cada um custando o mesmo que `/gestao`. Não há proteção contra burst específico.
- **Impacto de negócio**: risco de esgotar conexões do pool Postgres do Supabase durante fechamento mensal; mesmo cenário que motivou o `heavyRouteLimiter` no fan-out Conexos.
- **Métrica de baseline**: limite atual efetivo no endpoint = 100 req/min (globalLimiter). Padrão da casa para fan-out caro = 10 req/min (`heavyRouteLimiter`). **10× mais permissivo do que rotas equivalentes.**

### F-performance-3: Workbook xlsx 100% em memória (`writeBuffer`) — sem streaming

- **Severidade**: P2 (médio)
- **Tactic violada**: Bound Execution Times / Increase Resource Efficiency
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:382-396`
- **Evidência (objetiva)**:
  ```ts
  // RelatorioExportService.ts:395-396
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
  // ...e a rota faz res.send(buffer) — buffer inteiro em RAM antes de qualquer byte sair.
  ```
- **Impacto técnico**: para a escala atual (~509 adtos × 27 colunas, ~126 invoices) o pico é baixo (~5–15 MB transitórios por request). Em concorrência (N analistas × 6 tipos) o pico multiplica linearmente e cresce com o backlog. Render free/single-instance tem heap limitado.
- **Impacto de negócio**: hoje aceitável; vira problema quando o painel crescer (backlog represado, mais filiais, novas frentes Permuta) ou em concorrência durante fechamento.
- **Métrica de baseline**: ~509 linhas × 27 colunas hoje. Se o backlog dobrar (1k+ adtos), `writeBuffer` ainda funciona mas dobra heap por request. Sem alarme.

### F-performance-4: Sem timeout/deadline explícito no handler — export que trave por DB lento segura conexão indefinidamente

- **Severidade**: P2 (médio)
- **Tactic violada**: Bound Execution Times
- **Localização**: `src/backend/routes/permutas.ts:371-386`
- **Evidência (objetiva)**:
  ```ts
  // Não há AbortController, sem timeout no handler, sem timeout no pg pool específico do export.
  router.get('/relatorios/:tipo', asyncHandler(async (req, res) => {
      ...
      const { filename, buffer } = await service.exportar(tipo, req.requestId);
      ...
  }));
  ```
- **Impacto técnico**: se o Supabase ficar lento (CPU saturado), o request pendura sem limite máximo; usuário aborta no navegador mas o Node continua serializando o xlsx.
- **Impacto de negócio**: degrada o pool de conexões e a percepção de "travou" sem mensagem de erro útil — analista clica de novo (pior).
- **Métrica de baseline**: 0 timeouts configurados no caminho do export. Padrão razoável p/ export pesado = 30s.

## 5. Cards Kanban

### [performance-1] Cachear o snapshot do `exporGestao()` por curta janela (request-coalescing) compartilhado entre `/gestao` e `/relatorios/:tipo`

- **Problema**
  > Cada clique em "Exportar" reexecuta os 7 reads paralelos do `/gestao` — mesmo quando o painel ACABOU de ser carregado. Baixar os 6 tipos do popover gera 42 queries idênticas em segundos. Em fechamento, 4 analistas simultâneos = ~168 reads redundantes/min no Supabase.

- **Melhoria Proposta**
  > Adicionar um cache curto (TTL 5–10s ou key por `last ingest_finished_at`) em `GestaoPermutasService.exporGestao()`. Alternativa equivalente: request-coalescing por `last ingest run_id` (memoiza o resultado até o próximo run de ingestão chegar). Reaproveita o já existente `snapshotRepository.findLatestIngestFinishedAt()` como cache key. Tactic alvo: **Maintain Multiple Copies of Computations** + **Reduce Overhead**.

- **Resultado Esperado**
  > Sequência "carregar painel + exportar todos os 6 tipos" passa de **49 reads (1 + 6×7×1)** para **7 reads** no Postgres dentro de uma janela curta. Latência percebida da pasta completa cai de ~6× para ~1×.

- **Tactic alvo**: Maintain Multiple Copies of Computations / Cache strategy
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - Reads no Postgres por "pasta completa" (6 exports): **42 → 7** (≥85% redução)
  - Hit-rate do cache quando painel é exportado logo após carregar: alvo ≥ 90%
- **Risco de não fazer**: durante fechamento mensal, exports concorrentes podem saturar conexões Supabase e degradar o `/gestao` para todos os analistas simultaneamente.
- **Dependências**: nenhuma (cache local ao processo basta para Render single-instance hoje)

### [performance-2] Aplicar `heavyRouteLimiter` ao endpoint `GET /permutas/relatorios/:tipo`

- **Problema**
  > A nova rota custa o MESMO que o `/gestao` (7 reads paralelos), mas só herda o `globalLimiter` (100 req/min/IP). Rotas equivalentes em fan-out (`/eleicao`, `/ingestao`, `/reconciliar`) já usam `heavyRouteLimiter` (10 req/min/IP). O endpoint de export está **10× mais permissivo** do que o padrão da casa.

- **Melhoria Proposta**
  > Adicionar `heavyRouteLimiter` ao middleware do `router.get('/relatorios/:tipo', ...)` em `src/backend/routes/permutas.ts:371-386`, alinhando ao padrão `/eleicao` (linha 131-134). Tactic alvo: **Limit Event Response**.

- **Resultado Esperado**
  > Burst máximo no endpoint: **100 → 10 req/min/IP** (alinhado ao padrão de rotas pesadas). Risco de saturar pool Postgres por export controlado.

- **Tactic alvo**: Limit Event Response
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) — 1 linha de middleware + teste de rota
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - Limit per-IP no endpoint: **100 req/min → 10 req/min**
  - Cobertura do padrão "heavy route" no router de permutas: 3/4 → **4/4** rotas pesadas com `heavyRouteLimiter`
- **Risco de não fazer**: um script descuidado ou popover com bug pode disparar exports em loop e esgotar conexões do Supabase, derrubando `/gestao` para todos.
- **Dependências**: nenhuma

### [performance-3] Migrar serialização xlsx para streaming (`workbook.xlsx.write(res)`)

- **Problema**
  > Hoje o workbook é totalmente bufferizado em memória (`workbook.xlsx.writeBuffer()` + `res.send(buffer)`). Na escala atual (~509 adtos × 27 colunas) o pico é baixo (~5–15 MB por request), mas em concorrência durante fechamento e à medida que o backlog cresce (novas filiais/frentes) o heap escala linearmente.

- **Melhoria Proposta**
  > Substituir `writeBuffer()` por `workbook.xlsx.write(res)` (API streaming do exceljs), escrevendo direto no `Response` do Express após setar os headers. Manter `montarDefinicao` separado para preservar testes. Tactic alvo: **Increase Resource Efficiency** + **Bound Execution Times**.

- **Resultado Esperado**
  > Pico de heap por request de export: estabiliza independente do tamanho do dataset (overhead constante do exceljs writer). Bytes começam a fluir antes da última linha ser projetada. Hoje (~509 linhas): impacto baixo. Cenário 5k linhas: heap por request **~50 MB → ~5 MB** (estimativa exceljs).

- **Tactic alvo**: Increase Resource Efficiency / Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Pico de heap por export concorrente: estável em função do dataset (não-linear → linear→constante)
  - Time-to-first-byte do download: cai de "tempo total da serialização" para "tempo da 1ª chunk"
- **Risco de não fazer**: à medida que o backlog crescer (mais filiais, mais frentes), N exports concorrentes podem saturar heap da instância Render.
- **Dependências**: nenhuma; teste atual do service valida `montarDefinicao` (projeção) — não quebra ao trocar a serialização.

### [performance-4] Definir deadline explícito (timeout) para o handler de export

- **Problema**
  > Não há timeout no handler nem cancelamento via `AbortController` quando o cliente desiste. Se o Postgres ficar lento, o request pendura até o handler concluir naturalmente, ocupando conexão e potencialmente sendo retriado pelo analista (efeito tempestade).

- **Melhoria Proposta**
  > Envolver `service.exportar(...)` em um `Promise.race` com timeout (~30s) ou usar `req.on('close')` + `AbortController` para cancelar a serialização quando o cliente desconectar. Retornar 504 com mensagem clara em caso de timeout. Tactic alvo: **Bound Execution Times**.

- **Resultado Esperado**
  > p99 do handler limitado por construção a 30s (vs ilimitado hoje). Conexões Postgres liberadas se o cliente abortar. Mensagem clara para o analista em vez de "spinner infinito".

- **Tactic alvo**: Bound Execution Times
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - Timeout máximo do handler: **∞ → 30s**
  - Conexões pg vazadas por exports abandonados: alvo 0
- **Risco de não fazer**: durante incidente no Supabase, exports pendurados agravam a saturação do pool e pioram o sintoma para todos.
- **Dependências**: idealmente após F-performance-1 (cache) para reduzir a chance de timeout legítimo.

## 6. Notas do agente

- Escopo limitado ao delta da feature (`RelatorioExportService` + rota `/relatorios/:tipo` + popover no FE) — não revalidei tactics de performance do `GestaoPermutasService` em si (herança da v0.7.0).
- Métricas não-medíveis localmente: latência real do Supabase, peak heap por concorrência, time-to-first-byte. Recomendo instrumentar `permutas.relatorios.duration_ms` + `bytes_out` + contador por `tipo` antes do próximo fechamento.
- **Cross-QA**: F-performance-2 (rate-limit) sobrepõe-se a **Availability/Security** (proteção do pool Postgres é também tactic de availability). F-performance-4 (timeout) sobrepõe-se a **Fault Tolerance** (Bound Execution Times é tactic compartilhada). F-performance-1 (cache) sobrepõe-se a **Modifiability** se o cache for invalidado por `last ingest_finished_at` (acopla ao schema do snapshot). Alertar o consolidator.
- FE: sem dep nova, sem aumento de bundle (verificado em `_shared-metrics.md`).
