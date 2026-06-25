# Regis-Review follow-ups — feature `permutas-executar-automaticas`

**Run:** `docs/regis-review/2026-06-25-1713/` (REPORT.md + KANBAN.md) · **Score:** 6.9/10 · **P0:** 0
**Gate:** PASS (sem re-loop obrigatório — nenhum P0). 35 cards: P1=9, P2=19, P3=7.
**Resolvido nesta fatia:** log message → inglês (PatternGuardian). Identificadores em PT mantidos por
consistência com a camada de serviço (`reconciliar`/`exporGestao`/…).

### ✅ Mitigação adicionada (2026-06-25): cap de lote `LOTE_MAX=10`
Decisão do Yuri: o "Executar" roda em **lotes de até 10 por clique** (cap server-side autoritativo em
`ReconciliacaoLotePermutaService.LOTE_MAX`; a tela manda os "próximos 10" pendentes; o analista clica de
novo até zerar). Impacto nos P1:
- **`security-1` (cap blast radius) → RESOLVIDO.** Cap server-side de 10 por requisição.
- **`performance-1` / `availability-1` → MUITO MITIGADOS.** Cada request agora é ≤10 casos × ~5 chamadas
  ERP ≈ ≤25s — confortavelmente abaixo do timeout do proxy (~100s). Job assíncrono deixa de ser urgente
  (só volta a ser relevante se quiserem 1-clique-roda-tudo). **Rebaixar `performance-1`/`availability-1` para P2/P3.**
- **`fault-tolerance-1/2/3` (re-fire órfão) → menos expostos** (request curto = janela de timeout/órfão menor),
  mas o risco de fundo (par `reconciling` no `reconciliar`) permanece — segue como follow-up.

> ⚠️ Esta é uma feature de ESCRITA financeira. Os P1 abaixo NÃO bloqueiam (a escrita é gated por
> `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`, cada par é idempotente write-ahead e o borderô fica EM
> CADASTRO aguardando aprovação humana), mas o cluster de risco merece priorização antes de escala.

## Top riscos (P1)
| Card | QA | Esf. | Risco | Ação |
|---|---|---|---|---|
| `performance-1` | Performance | M | Lote SÍNCRONO+SEQUENCIAL: ~26 casos × ~5 chamadas ERP ≈ 39s p50 / 195s p95 → estoura proxy Render (~100s). Analista pode ver "Falha" com sucesso PARCIAL real. | Job assíncrono (background) + endpoint de progresso (poll/SSE — `SseProgressReporter` já existe ocioso). |
| `availability-1` | Availability | M | Mesma request longa sem `Bound Execution Times` nem streaming/heartbeat. | Deadline por-request + SSE de progresso; `AbortController` no front. |
| `fault-tolerance-1` | Fault Tol. | M | Re-fire pós-timeout: par em estado `reconciling` órfão pode re-POSTAR a baixa (idempotência só pula `settled`). **Pré-existente no `reconciliar`**, amplificado pelo lote. | Tratar `reconciling` como possivelmente-liquidado (reconciliar com o ERP antes de re-POST). Fix vive no `ReconciliacaoPermutaService` (fora da superfície desta fatia). |
| `fault-tolerance-2` | Fault Tol. | M | Rota não honra `Idempotency-Key` (padrão já existe em `/eleicao`). | Idempotency-Key no `/reconciliar-lote` → retry do cliente coalesce. |
| `fault-tolerance-3` | Fault Tol. | M | Sem reaper de execuções `reconciling` órfãs (carry-over do inbox anterior). | Job de varredura que reconcilia órfãos com o ERP. |
| `security-1` | Security | S | Sem cap server-side no tamanho do lote (blast radius). **Conflita com a decisão de produto "executar TODAS"** — avaliar cap alto (ex.: aviso/limite > N) sem quebrar o caso de uso. | Decisão do Yuri: cap defensivo vs "todas". |
| `deployability-1` | Deploy | S | Botão "Executar" sem kill-switch granular sem redeploy (hoje o martelo é `CONEXOS_WRITE_ENABLED`). | Feature-flag do botão. |
| `modifiability-1` | Modif. | M | `ReconciliarLote*` espelhado FE↔BE (drift). | Contrato compartilhado / teste de paridade. |
| `modifiability-2` | Modif. | L | `page.tsx` 2669 LOC (god-component, pré-existente, agravado). | Quebrar em subcomponentes por aba. |

## P2/P3
Ver KANBAN completo. Destaques P2: instrumentação `duration_ms` no `ConexosClient`, `req.on('close')`
deadline+cancel, paralelismo controlado (p-limit), log per-adto estruturado, contract test do wire-shape,
gate humano no deploy prd + runbook, testes do `executarLote`/diálogo (front) e caso 5xx/422 da rota.
P3: paginação de `resultados[]`, versionamento HTTP, branches frios de `dryRunOverride`.

> KANBAN completo (35 cards verbatim) em `docs/regis-review/2026-06-25-1713/KANBAN.md`.
