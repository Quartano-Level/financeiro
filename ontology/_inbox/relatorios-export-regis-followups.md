# Regis-Review follow-ups — feature `relatorios-export`

**Run:** `docs/regis-review/2026-06-25-1555/` (REPORT.md + KANBAN.md) · **Score:** 7.62/10 · **P0:** 0
**Gate:** PASS (sem re-loop obrigatório — nenhum P0). Estes são P1/P2/P3 → viram tickets depois.

## Resolvido nesta fatia (não vira ticket)
- **performance-2 / availability-1 / security-3 (CC-1)** — ✅ FEITO: `heavyRouteLimiter` aplicado à
  rota `GET /permutas/relatorios/:tipo` (`routes/permutas.ts`), alinhando com `/eleicao`/`/ingestao`/`/reconciliar`.
- **security-1 (P1)** — ✅ DECIDIDO (Yuri, 2026-06-25): acesso ao export **mantém paridade com
  `/gestao`** (qualquer usuário autenticado). Racional: o dado já é visível na tela para o time; o
  export entrega o mesmo conteúdo. Não é gap — é decisão de produto. Reabrir só se o RBAC do painel mudar.

## Follow-ups (P1 restantes)
| Card | QA | Prioridade | Finding | Ação |
|---|---|---|---|---|
| `performance-1` | Performance | **P1** | Cada export reexecuta os reads do `/gestao` (sem cache); "painel + 6 exports" ≈ 49 reads no Supabase. | Cache curto / request-coalescing do `exporGestao()` por `last_ingest_finished_at` (já em `snapshotRepository`). Toca `GestaoPermutasService` (fora da superfície desta fatia). |

## Follow-ups (P2)
| Card | QA | Finding | Ação |
|---|---|---|---|
| `availability-3` | Availability | Handler sem timeout explícito | `Bound Execution Times` + log de `duracaoMs` no export. |
| `security-2` | Security | Log do export sem `triggeredBy` | Adicionar identidade autenticada ao `logService.info` (Audit Trail). |
| `integrability-2` | Integrability | Log de falha sem dimensão `tipo` | Incluir `tipo` no log de erro (MTTR mensurável). |
| `modifiability-1` / `integrability-1` (CC-2) | Modif./Integr. | `RelatorioTipo` duplicado FE↔BE (drift) | Teste de paridade FE↔BE ou pacote shared. |
| `deployability-1` | Deployability | Sem kill-switch para a rota nova | Feature flag para o botão/rota (MTTR de rollback). |
| `availability-2` / `performance-3` (CC-3) | Avail./Perf. | Workbook xlsx 100% em memória (`writeBuffer`) | Streaming (`workbook.xlsx.write(res)`) quando o dataset crescer (>~5k linhas). OK hoje (~509 adtos). |

## Follow-ups (P3)
- `performance-4` timeout no handler (par de availability-3) · `integrability-3` versionamento `/v1/` ·
  `integrability-4` limite de linhas no buffer · `fault-tolerance-1` toast com `err.message` cru ·
  `modifiability-2` registry no lugar do `switch(tipo)` (adiar até catálogo >10) ·
  `modifiability-3/4` consolidar rótulos BE/FE + extrair política de larguras ·
  `testability-1/2` smoke test do `exportarRelatorio` (FE) + do popover · `testability-3` 2 linhas
  defensivas (fixture N:M) · `deployability-2` smoke test post-deploy da rota.

> Kanban completo (25 cards verbatim) em `docs/regis-review/2026-06-25-1555/KANBAN.md`.
