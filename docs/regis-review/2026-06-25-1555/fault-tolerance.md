---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-25-1555
agent: qa-fault-tolerance
generated_at: 2026-06-25T15:55:00-03:00
scope: backend,frontend
score: 9
findings_count: 1
cards_count: 1
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Exportar" no popover do painel de Permutas | Falha parcial na leitura: `GestaoPermutasService.exporGestao()` lança (Conexos 5xx/timeout) OU `ExcelJS.writeBuffer()` falha | `RelatorioExportService` (backend) + `exportarRelatorio()` (frontend) | Operação normal; rota READ-ONLY, sem efeitos colaterais (não escreve em `fin010`, Postgres ou GED) | Erro propaga pelo `asyncHandler` → `errorMiddleware` → HTTP 500 genérico; frontend captura no `try/catch`, `toast.error("Falha ao exportar …")` e limpa `setExportando(null)` no `finally` | 0 escritas executadas (READ-ONLY garante); 100% das falhas surfaceadas ao usuário; nenhum estado parcial residual no DB/ERP |

> Observação de escopo: o delta da feature é **estritamente READ-ONLY** (uma leitura via
> `GestaoPermutasService.exporGestao()` + geração de buffer xlsx em memória + `res.send(buffer)`).
> Não há `INSERT/UPDATE/DELETE`, não há chamada de baixa/permuta/remessa, não há upload externo.
> Toda a taxonomia clássica de fault-tolerance financeira (idempotência de write, dual-write atômico,
> compensating transaction, audit-trail pareado, reconciliação contra Conexos) é **inaplicável neste
> delta** por construção — a feature herda a posição de fault-tolerance do `GET /gestao` existente.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Escritas executadas pela feature (DB/ERP/GED) | 0 | 0 | ✅ | Leitura de `src/backend/domain/service/permutas/RelatorioExportService.ts:46-61` + `src/backend/routes/permutas.ts:371-386` (sem `INSERT/UPDATE`, sem `repository.upsert*`, sem `conexos.post`) |
| Idempotência necessária no novo endpoint | N/A (GET puro, sem efeito colateral) | N/A | ✅ | `src/backend/routes/permutas.ts:371` — método `GET`; HTTP semântica naturalmente idempotente |
| Validação de input (defesa contra fault de entrada) | Guard `isRelatorioTipo` antes de invocar service | enum strict | ✅ | `src/backend/routes/permutas.ts:375-379` (`if (!isRelatorioTipo(tipo)) { res.status(400)…; return; }`) |
| Erro async chega ao handler central | `asyncHandler` envolve a rota; `errorMiddleware` responde 500 genérico sem vazar `err.message` | propagação central | ✅ | `src/backend/routes/permutas.ts:373` (`asyncHandler(async …)`) + `src/backend/http/errorMiddleware.ts:12-36` |
| Frontend: erro de export tratado com rollback de UI + notify | `try { await exportarRelatorio } catch { toast.error(...) } finally { setExportando(null) }` | sempre presente em mutação async | ✅ | `src/frontend/app/permutas/page.tsx:682-694` |
| Frontend: distinção entre HTTP-ok e falha | `if (!res.ok) throw new Error(…)` antes de `res.blob()` | sempre | ✅ | `src/frontend/lib/api.ts:430-440` |
| Stuck-state detection / reaper | N/A (não há work item persistido — request síncrono) | N/A | ✅ | Inspeção: rota é request/response, sem job/fila |
| DLQ / outbox / compensação | N/A (sem fila, sem write, sem multi-step external+DB) | N/A | ✅ | Inspeção do delta |
| Audit-trail pareado a state-change | N/A (sem state-change; há um `logService.info` de telemetria do export) | N/A | ✅ | `src/backend/domain/service/permutas/RelatorioExportService.ts:55-59` (log informativo, não audit-trail de mutação) |
| Reentrada segura (clique duplo) — UI | Botões `disabled={exportando !== null}` enquanto a export está em curso | bloqueia clique duplo | ✅ | `src/frontend/app/permutas/page.tsx:1185, 1202` |

> ⚠️ **Não medível localmente**: comportamento real de timeout do Conexos sob 5xx persistente durante
> o export (cenário em produção). Recomendação: validar via cenário de QaCoach quando houver smoke em
> dev tenant — o `GET /gestao` (de quem o export herda a leitura) já carrega o mesmo risco, e o ônus
> de mitigação (timeout + retry no `ConexosClient`) é compartilhado com aquele endpoint, não nasce neste
> delta.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A — sem componente substituível neste delta READ-ONLY | N/A | escopo da feature |
| Replacement | N/A — idem | N/A | — |
| Predictive Model | N/A — idem | N/A | — |
| Increase Competence Set | Guard `isRelatorioTipo` reduz superfície de input inválido a 400 antes do service | ✅ | `src/backend/routes/permutas.ts:375-379` |
| Sanity Checking | Validação de `:tipo` contra enum; frontend valida `res.ok` antes de `blob()` | ✅ | `routes/permutas.ts:375-379`, `frontend/lib/api.ts:433-440` |
| Comparison | N/A — sem voting/redundância para comparar | N/A | — |
| Timestamp | N/A — sem evento ordenado/replay neste delta | N/A | — |
| Timeout | Herdado de `ConexosClient` (não tocado); o export não introduz timeout próprio (a leitura é síncrona via service existente) | ⚠️ parcial (herdado, não-medível neste delta) | inspeção: `RelatorioExportService.exportar` não envolve em `RetryExecutor`/`PollExecutor` |
| Condition Monitoring | `logService.info` registra `tipo` + `linhas` no sucesso; `console.error` central no erro | ✅ | `RelatorioExportService.ts:55-59`, `errorMiddleware.ts:22-29` |
| Self-Test | N/A — sem health-check específico deste endpoint | N/A | — |
| Voting | N/A | N/A | — |
| Redundancy | N/A — sem réplica/standby aplicável a um GET puro | N/A | — |
| Recovery (forward / backward) | Forward: usuário re-clica o botão "Exportar" (operação idempotente por ser GET puro). Não há estado a reverter | ✅ | semântica do endpoint |
| Reintroduction (Shadow / State Resync / Escalating Restart) | N/A — sem componente stateful a reintroduzir | N/A | — |
| Rollback | UI: `finally { setExportando(null) }` libera o spinner e reabilita os botões mesmo em falha | ✅ | `frontend/app/permutas/page.tsx:691-693` |
| Repair State | N/A — sem estado persistido a reparar (nada foi escrito) | N/A | — |
| Idempotent Replay | Aplicável trivialmente: GET puro é naturalmente seguro de re-executar | ✅ | `routes/permutas.ts:371` |
| Compensating Transaction | N/A — sem write a compensar | N/A | — |
| Reconcile | N/A — sem estado divergente a reconciliar (leitura derivada do mesmo `GestaoPermutasService` do painel) | N/A | — |
| Quarantine | N/A — sem item a quarentenar (sem fila, sem persistência de falha) | N/A | — |

## 4. Findings (achados)

### F-fault-tolerance-1: Erro de export inclui `err.message` no toast — sem PII no caminho atual, mas acopla UX a detalhe interno

- **Severidade**: P3 (baixo — melhoria opcional)
- **Tactic violada**: Sanity Checking (na fronteira UI ↔ erro de servidor)
- **Localização**: `src/frontend/app/permutas/page.tsx:687-690`
- **Evidência (objetiva)**:
  ```tsx
  } catch (err) {
    toast.error(
      `Falha ao exportar "${label}"${err instanceof Error ? ` — ${err.message}` : ''}.`,
    )
  }
  ```
  O `err.message` vem de `exportarRelatorio` em `frontend/lib/api.ts:439`
  (`throw new Error(\`API ${res.status}${detail}\`)`) — `detail` extrai apenas o campo `error` do JSON,
  e o `errorMiddleware` retorna `{ error: 'Internal server error' }` (já saneado em
  `errorMiddleware.ts:35`). Logo, **não há vazamento real hoje**, mas se um futuro 400 enriquecer
  `error` com detalhe técnico, o toast exibirá string crua ao usuário final.
- **Impacto técnico**: baixo — risco apenas se a forma do payload de erro mudar.
- **Impacto de negócio**: nenhum no estado atual; potencial confusão UX se mensagem técnica futura escapar.
- **Métrica de baseline**: 1 callsite de `toast.error` na export que concatena `err.message` cru
  (`page.tsx:688-690`).

## 5. Cards Kanban

### [fault-tolerance-1] Sanitizar mensagem de erro do toast de exportação

- **Problema**
  > O `catch` da exportação concatena `err.message` direto no toast (`page.tsx:687-690`). Hoje o
  > `errorMiddleware` devolve sempre `{ error: 'Internal server error' }`, então não há vazamento;
  > mas o acoplamento UX ↔ payload técnico é frágil: qualquer evolução no contrato de erro do backend
  > pode passar a expor detalhe interno ao analista.

- **Melhoria Proposta**
  > Mapear no helper `exportarRelatorio` (e/ou na função `exportar` da página) os status HTTP
  > conhecidos para mensagens humanas estáveis em pt-BR ("Sessão expirada", "Falha temporária no
  > serviço, tente novamente", "Tipo de relatório inválido"), e omitir o sufixo técnico quando não
  > houver mensagem de domínio. Tactic alvo: **Sanity Checking** na fronteira UI.

- **Resultado Esperado**
  > Toasts de export passam a exibir 100% mensagens curadas em pt-BR; nenhum `err.message` cru
  > visível ao usuário final.

- **Tactic alvo**: Sanity Checking
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - `toast.error` exibindo `err.message` cru no fluxo de export: 1 → 0
  - Códigos HTTP mapeados explicitamente (401/400/500): 0 → 3
- **Risco de não fazer**: baixo — apenas regressão de UX se um futuro endpoint de relatório passar
  a devolver erros mais detalhados sem sanitização.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Delta READ-ONLY confirmado por leitura direta de `RelatorioExportService.ts` e da rota
  `GET /permutas/relatorios/:tipo`: zero `INSERT/UPDATE`, zero chamada de write a Conexos/GED/Nexxera,
  zero fila SQS, zero outbox. Toda a taxonomia "Avoid/Detect/Contain/Recover" para escrita financeira
  está marcada N/A com justificativa por linha (seção 3).
- Decisão de escopo: timeout e retry no `ConexosClient` são herdados do caminho `/gestao` existente —
  o export não tem caminho próprio para esse risco, então **não levanto finding** sobre isso neste
  QA (seria duplicado e fora do delta).
- Cross-QA detectado: a sanitização do toast (card `fault-tolerance-1`) toca também
  **Security** (não-vazamento de detalhe técnico) e **Usability**; sinalizar ao consolidator.
- O `logService.info` no sucesso do export é telemetria, **não** audit-trail de mutação — neste
  delta não há mutação para auditar; o invariant "audit pareado a state-change" continua válido
  para futuras features de write.
