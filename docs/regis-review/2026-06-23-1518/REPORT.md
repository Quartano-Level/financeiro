---
type: regis-review-report
run_id: 2026-06-23-1518
generated_at: 2026-06-23
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice
scope: Permutas Fase 3 — write-back fin010 (branch feat/permutas-reconciliacao)
total_cards: 59
total_p0: 10
total_p1: 26
total_p2: 17
total_p3: 6
overall_score: 5.9
remediated_in_branch: 10
remediation_rate_p0: 100%
---

# Regis-Review — financeiro — 2026-06-23-1518

> Escopo: delta da Fase 3 — primeiro caminho de escrita irreversível-por-nós no ERP Conexos (handshake
> `fin010` de 5 POSTs). Branch `feat/permutas-reconciliacao`. Auditoria do risco arquitetural #1.

## 1. Executive scorecard

Pesos (perfil financeiro multi-tenant que move dinheiro): Security 1.5; Fault Tolerance 1.3;
Availability 1.2; Modifiability 1.2; Testability 1.0; Performance 1.0; Integrability 0.9; Deployability 0.9.

| QA | Score | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 6.5 | 3 | 3 | 2 | 0 | borderô órfão sem rollback (✅ REMEDIADO via write-ahead do `borCod`) |
| Deployability | 6.5 | 2 | 3 | 1 | 0 | flags `CONEXOS_WRITE_*` ausentes de `render.yaml`/`.env.example` (✅ REMEDIADO) |
| Integrability | 5.5 | 2 | 6 | 1 | 0 | contrato `fin010` vem de 1 HAR — 3 caminhos não observados |
| Modifiability | 5.0 | 0 | 4 | 2 | 1 | `ConexosClient.ts` 1608 LOC mistura read e write |
| Performance | 5.0 | 1 | 3 | 2 | 1 | caminho de escrita sem bound de execução (✅ vetor retry remediado) |
| Fault Tolerance | 5.0 | 1 | 3 | 3 | 0 | retry no POST não-idempotente — double-write vector (✅ REMEDIADO) |
| Security | 6.5 | 2 | 2 | 4 | 2 | anti-drift I-Write-1 ausente (✅ REMEDIADO) |
| Testability | 7.5 | 1 | 2 | 2 | 1 | `PermutaExecucaoRepository` sem teste (✅ REMEDIADO) |
| **Overall (ponderado)** | **5.9** | **10** | **26** | **17** | **6** | — |

Interpretação: 5.9 = "dívida defensável". O design tem invariantes corretas (default-deny dual-flag,
write-ahead, idempotência por par, RBAC, SQL parametrizado); o débito é de operacionalização (runbook,
observability, contratos não observados em HML, limites de execução) e de SaaSo (esquema multi-tenant,
hardcodes contábeis). É a transição de READ-ONLY para WRITE com lacunas conhecidas, não código ruim.

## 2. P0 remediados nesta branch (10/10 = 100%)

| # | Finding(s) | Mudança | Tactic restaurada |
|---|---|---|---|
| 1 | fault-tolerance-1, availability-2, performance-2/3 | Write POSTs (`criarBordero`, `gravarBaixaPermuta`) removidos do `RetryExecutor` — passo não-idempotente não retenta | Idempotent Replay |
| 2 | security-4, fault-tolerance-4, integrability-2 | I-Write-1 anti-drift em `ReconciliacaoPermutaService` — aborta se o ERP quer baixar > alocado esperado | Sanity Checking / Validate Input |
| 3 | availability-1/3 | `borCod` persistido em write-ahead ANTES do handshake | Rollback / State Resynchronization |
| 4 | integrability-3 | envelope `messages` lido; `valid='ERRO'` em 200 OK aborta | Use an Intermediary (anti-corruption) |
| 5 | testability-1 | `PermutaExecucaoRepository.test.ts` (idempotência CASE WHEN, mapeamento) | Executable Assertions |
| 6 | deployability-1/2 | flags em `render.yaml` + `.env.example`; runbook `docs/runbooks/fin010-write-cutover.md` | Logical Grouping / Scale Rollouts |

Risco de incidente catastrófico (double-write no ERP fiscal) ao ligar `CONEXOS_WRITE_ENABLED=true` mitigado.

## 3. Top riscos ABERTOS pós-remediação (P1/P2/P3 → inbox)

1. **R-1 (P1, Integrability):** contrato `fin010` veio de **1 HAR** — baixa parcial, DESCONTO e finalização
   do borderô **não observados**. `integrability-1` é **pré-requisito do `WRITE_ENABLED=true` em produção**.
2. **R-2 (P1, Security):** esquema multi-tenant da `permuta_alocacao_execucao` não decidido (`security-9` /
   ADR futura) — bloqueador absoluto do 2º cliente SaaSo.
3. **R-3 (P1, Performance/Availability):** rota `/reconciliar` síncrona sem `server.timeout`/cap de N — N>3
   fura o proxy Render. `listAtivas()` full-scan filtrado em JS (ignora índice existente).
4. **R-4 (P1, Modifiability):** `ConexosClient` 1608 LOC read+write; recomenda-se `ConexosFin010WriteClient`
   separado antes de habilitar prod (isolar blast-radius).
5. **R-5 (P1, Fault Tolerance):** sem detector de `reconciling` presa nem conciliação periódica DB↔ERP.
6. **R-6 (P1, Modifiability/Testability):** `page.tsx` 2311 LOC; extrair `ReconciliacaoModal` + testá-lo.
7. **R-7 (P2, Security/Availability):** kill-switch exige restart (EnvironmentProvider @singleton cache).
8. **R-8 (P2, Security):** log do interceptor vaza `dpeNomPessoa`/`pesCod`/valores no payload de escrita.

## 4. Ações recomendadas (30 dias)
1. Aceitar o PR — 10/10 P0 remediados; branch defensável para merge.
2. Antes de `CONEXOS_WRITE_ENABLED=true` em produção: executar `docs/runbooks/fin010-write-cutover.md` e
   completar `integrability-1` (capturar HARs de homologação dos 3 caminhos não observados).
3. Sprint de endurecimento (quick-wins): integrability-4/5, performance-1, security-2/3, testability-3.
4. ADR multi-tenant (`security-9`) — destrava SaaSo.
5. Deadline + observability do write path (CC-3/CC-4).

## 5. O que está bem
Default-deny dual-flag · write-ahead (incl. `borCod`) · idempotência por par com CASE WHEN · RBAC em 100%
das mutações · SQL parametrizado + Zod nos boundaries · suíte verde (410 testes) · DI seam limpa
(`LEGACY_CONEXOS_TOKEN`) · tipos wire encapsulados (`Fin010Baixa.ts`).

## 6. Limitações
p50/p95 reais do `fin010` e MTTR do "borderô órfão" não medíveis localmente (exigem logs/CloudWatch).
Snapshot da branch em 2026-06-23 — re-rodar antes do flip de produção. Findings herdados de
`2026-06-22-1658` (CI sem deploy job; transporte legado) não re-listados.
