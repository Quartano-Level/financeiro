# Shared Baseline Metrics — run 2026-06-25-1713

**Scope:** `backend,frontend` (--quick) · **Feature:** `permutas-executar-automaticas` — botão "Executar"
que cria os borderôs de TODAS as automáticas de uma vez (escrita financeira em LOTE no `fin010`).
**Worktree (CWD para todos os comandos):** `/Users/rizzi26/Documents/GitHub/pessoal/clonex/permutas-executar-wt`
· **Branch:** `feat/permutas-executar-automaticas`.

> Rodem comandos a partir do worktree acima (código da feature + `node_modules` instalados em
> `src/backend` e `src/frontend`). Foco no **delta** (quick), mas meçam de verdade. Esta é uma feature
> de **ESCRITA financeira em lote** — priorizem Fault Tolerance, Performance/Availability e Security.

## Arquivos tocados (delta)
| Arquivo | Papel |
|---|---|
| `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts` | NOVO service `@injectable` — orquestra em lote; reusa GestaoPermutasService + ReconciliacaoPermutaService; sequencial, continue-on-error |
| `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.test.ts` | testes do service (coleta/continue-on-error/agg/dry-run/idempotência) |
| `src/backend/routes/permutas.ts` | NOVA rota `POST /permutas/reconciliar-lote` (admin + heavyRouteLimiter) |
| `src/backend/routes/permutas.test.ts` | casos de rota (200/401/403) |
| `src/frontend/lib/api.ts` | `reconciliarLoteAutomaticas` |
| `src/frontend/lib/types.ts` | `ReconciliarLoteResult`/Item/Status |
| `src/frontend/app/permutas/page.tsx` | botão "Executar todas" + diálogo de confirmação + estado/handler |

## Design / invariantes herdadas (NÃO reimplementadas)
- O lote **reusa integralmente** `ReconciliacaoPermutaService.reconciliar` por adto. Herda:
  - Gate de escrita `CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN` (default dry-run) — o lote NÃO afrouxa.
  - Idempotência write-ahead por par adto↔invoice (`permuta_alocacao_execucao`) → retry seguro (skip).
  - Atomicidade por par + auto-alocação atômica de rascunho.
- **Continue-on-error:** falha de um adto não interrompe os demais; falhos seguem pendentes.
- **Mecanismo:** endpoint server-side (1 request) → evita estourar o `heavyRouteLimiter` (10/min) que um
  loop no front (26+ chamadas) estouraria. Iteração **sequencial** server-side.
- **Decisões de produto:** executa TODAS as automáticas (ignora filtros); continue-on-error; diálogo de confirmação.

## Baseline (medido nesta sessão)
- Backend suite: **460 tests / 43 suites — verdes** (inclui 5 do lote service + 3 da rota).
- Frontend suite: **51 tests / 11 suites — verdes**.
- `typecheck` BE e FE: ✅ limpos. `lint` (biome) nos arquivos tocados: ✅ limpo.
- PatternGuardian: rodado — P1 (identificadores em PT) MANTIDO por consistência com a camada de serviço
  existente (`reconciliar`/`exporGestao`/…); log message ajustado para inglês. Sem P0.
- DesignSystemReviewer: rodado — FULLY COMPLIANT, 0 P0 (2 notas de UX não-bloqueantes).

## Pontos de atenção esperados (para os agentes medirem)
- **Performance/Availability:** execução SÍNCRONA; N adtos × ~5 chamadas ERP sequenciais → request longo
  (≈26 casos hoje). Risco de timeout em proxy (Render). Sem streaming de progresso. heavyRouteLimiter no endpoint.
- **Fault tolerance:** continue-on-error + idempotência write-ahead (retry seguro). Validar que a falha
  parcial não deixa estado inconsistente (cada par é atômico; borderô EM CADASTRO aguarda aprovação manual).
- **Security:** admin-only + heavyRouteLimiter; ação poderosa (cria muitos borderôs reais). Gate de escrita inalterado.
- Infra: **sem `infra/`/Terraform** (Render/Vercel/Supabase) — tactics de IaC são N/A.
