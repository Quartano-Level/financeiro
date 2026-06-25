---
type: regis-review-report
run_id: 2026-06-25-1555
generated_at: 2026-06-25T18:05:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
feature: relatorios-export (READ-ONLY xlsx export — GET /permutas/relatorios/:tipo)
total_cards: 25
total_p0: 0
total_p1: 3
total_p2: 10
total_p3: 12
overall_score: 7.62
---

# Regis-Review — financeiro — 2026-06-25-1555

> **Gate**: Regis-Review pós-impl da feature `relatorios-export` (delta READ-ONLY: novo endpoint
> `GET /permutas/relatorios/:tipo` que reusa `GestaoPermutasService.exporGestao()` e serializa via
> `exceljs`). Nenhum P0 levantado pelos 8 agentes — gate passa para CI/PR sem re-loop obrigatório.

## 1. Executive scorecard

**Pesos (perfil financeiro):** Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 ·
Testability 1.0 · Performance 1.0 · Integrability 0.9 · Deployability 0.9 (Σ = 9.0).

**Overall score:** `(7×1.2 + 8×0.9 + 8×0.9 + 8×1.2 + 6×1.0 + 9×1.3 + 7×1.5 + 8×1.0) / 9.0` = **7.62 / 10**.

| QA | Score | P0 | P1 | P2 | P3 | Top finding |
|---|---:|---:|---:|---:|---:|---|
| Availability | 7 | 0 | 0 | 3 | 1 | export sem `heavyRouteLimiter` (única rota pesada de Permutas fora do padrão) |
| Deployability | 8 | 0 | 0 | 1 | 1 | sem feature flag / kill-switch para a rota nova |
| Integrability | 8 | 0 | 0 | 2 | 2 | `RelatorioTipo` duplicado FE↔BE (drift silencioso) |
| Modifiability | 8 | 0 | 0 | 1 | 3 | mesma raiz — `RelatorioTipo` em duas fontes da verdade |
| Performance | 6 | 0 | 2 | 2 | 0 | cada export re-executa os reads do `/gestao` (sem cache) |
| Fault Tolerance | 9 | 0 | 0 | 0 | 1 | toast concatena `err.message` cru |
| Security | 7 | 0 | 1 | 1 | 1 | export bulk sem `requireRole`, divergente de `/borderos`/`/status` |
| Testability | 8 | 0 | 0 | 0 | 3 | `exportarRelatorio` (FE) sem unit test (download blob) |
| **Overall** | **7.62** | **0** | **3** | **10** | **12** | — |

**Veredicto:** READ-ONLY + reuso do compute do `/gestao` + encapsulamento limpo de `exceljs` +
testabilidade alta (service 98% lines / 86% branches) sustentam a aprovação no gate. Os 3 P1 não
bloqueiam o merge; configuram um pacote coeso e barato de remediação.

## 2. Top P1 risks (cross-QA)

- **R-1 `[security-1]`** — Export bulk de KPIs financeiros sem decisão explícita de role gate
  (`routes/permutas.ts`). 3/10 GETs de `/permutas/*` usam `requireRole('admin')`; o export nasce sem
  gate por paridade com `/gestao`. Decisão de produto pendente (default sugerido: admin-only).
- **R-2 `[performance-1]`** — Export reexecuta os reads do `/gestao` por clique; "abrir painel +
  baixar 6 tipos" ≈ 49 reads no Supabase. Cache curto por `last_ingest_finished_at` → ~7 reads.
- **R-3 `[performance-2]`** — Export sem `heavyRouteLimiter` (100/min vs 10/min das rotas pesadas
  irmãs). Diff de uma linha; fecha também `availability-1` e `security-3` (CC-1).

## 3. Cross-cutting
- **CC-1** rate-limit ausente: `performance-2` resolve `availability-1` + `security-3`.
- **CC-2** `RelatorioTipo` duplicado FE↔BE: `modifiability-1` resolve `integrability-1`.
- **CC-3** xlsx em memória + sem timeout: `performance-3` + `performance-4` resolvem `availability-2/3` + `integrability-4`.

## 4. O que está bem
1. READ-ONLY puro — zero write a Conexos/GED/Nexxera (Fault Tolerance 9/10).
2. `exceljs` confinado a 1 arquivo (Encapsulate).
3. Projeção × serialização separadas — seam testado (Specialized Interfaces).
4. Reuso 1:1 do compute do painel (Abstract Common Services).
5. Validação no boundary via `isRelatorioTipo` (Exception Prevention).
6. Zero novas deps/env/migração.
7. Suite verde — 463 BE / 51 FE; buffer xlsx validado por re-leitura.

## 5. Limitações da análise
- Não medíveis localmente: peak memory do `writeBuffer` em prod, p95 do export, latência Supabase real.
- Estado-alvo vs atual: tactics de `infra/`/Terraform/Lambda/SSM marcadas N/A (não há IaC hoje).
- Janela: snapshot 2026-06-25, branch `feat/relatorios-export`, modo `--quick` (delta apenas).

## 6. Ações recomendadas
1. Decidir o role gate (`security-1`, P1) — admin-only vs paridade com `/gestao`.
2. Empacotar `performance-1` (cache) + `performance-2` (rate-limit) num PR de hardening.
3. P2 de observabilidade: `availability-3` (timeout/log de duração), `security-2` (`triggeredBy`), `integrability-2` (log por tipo).
4. CC-2 via `modifiability-1` (teste de paridade FE↔BE).

**Sumário**: 3 P1 endereçáveis em ≤3 dias (1 com decisão de produto), zero P0, score 7.62 — feature aprovada.
