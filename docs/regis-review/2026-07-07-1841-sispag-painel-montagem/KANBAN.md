# KANBAN — Regis-Review SISPAG Painel+Montagem (Fatia 1+2)

Ordem: P0 (bloqueante) → P1 → P2 → P3. Detalhe por card nas 8 seções `qa-*.md`.

## P0 — bloqueantes (TODOS remediados nesta feature ✅)

| id | título | QA | ação | status |
|----|--------|----|------|--------|
| testability-1 | CI coverage-gate vermelho (funcs 77.72% < 78%) | testability | +4 suites (repo/client/painel/service) → 89.29% | ✅ done |
| performance-1 | fan-out ~21 chamadas Conexos sem bound | performance/availability | `BoundedConcurrency` (limite 4) no painel | ✅ done |
| deployability-sispag-1 | bump de versão não aplicado | deployability | 0.11.0→0.12.0 FE+BE + CHANGELOG | ✅ done |
| availability-sispag-3 | pool-hold durante re-leitura no include (P1↑) | availability | mover leitura Conexos p/ fora do advisory-lock | ✅ done |

## P1 — follow-ups (não bloqueiam; → inbox)

| id | título | QA | file:line | effort |
|----|--------|----|-----------|--------|
| performance-2 | include sequencial N× round-trips (~26s p/ 20) → endpoint batch `docCod#IN` | performance/fault-tol/avail | `page.tsx` criarLoteComSelecionados; `ConexosSispagClient.getTituloAPagar` | M |
| availability-sispag-1 | reads SISPAG sem `runWithRetry` (paridade perdida) | availability | `ConexosSispagClient.ts` list* | S |
| availability-sispag-2 | painel parcial-silencioso (sem sinal de filial faltante) | availability/integr | `SispagInterface`+`page.tsx` | S |
| integrability-1 | `catch{}` mudo no `listTitulosAPagar` engole 500/timeout → fallback sem filtro (18k rows) | integrability | `ConexosSispagClient.ts` | S |
| fault-tolerance-3 | loop multi-título não-atômico deixa lote parcial/vazio sem reaper | fault-tol | `page.tsx` | M |
| security-sispag-1 / fault-tolerance-1 | audit só em stdout (sem tabela persistida) | security/fault-tol | `LotePagamentoService.audit` | M |
| testability-2 | rotas mutadoras + `requireRole` + mapping 409/422 sem teste | testability | `routes/sispag.ts` | M |
| testability-3 | `criarLote`/`listarLotes` sem teste dedicado (cobertos via outros) | testability | — | S |
| modifiability-1 | `page.tsx` 685 LoC/4 abas inline → split `Aba*.tsx` (padrão Permutas) | modifiability | `app/sispag/page.tsx` | M |
| integrability-5 / security | seam Fatia 3 não materializado (`CONEXOS_WRITE_ENABLED` compartilhado; sem `nexxera.md`/client) | integr | — | M |

## P2 — melhorias (inbox)

| id | título | QA |
|----|--------|----|
| security-sispag-2 | redigir PII (`credor`/`valor`/`cnpj`) em `redactBody` ANTES da Fatia 3 | security |
| security-sispag-3 | `filCod` do body sem checar filial do usuário (RBAC de filial) | security |
| fault-tolerance-6 | I3 sem constraint no banco (defense-in-depth) — **bomba Fatia 3** | fault-tol |
| fault-tolerance-7 | sem Idempotency-Key no fluxo (relevante Fatia 3) | fault-tol |
| performance-cache | painel sem cache (Conexos-fora = tela toda dark, inclusive aba local) | performance/avail |
| performance-listlotes | `listLotes` sem LIMIT + índice `criado_em DESC` | performance |
| performance-cap | `TITULOS_CAP=400` (BE) vs `slice(0,200)` (FE) — desalinhado | performance |
| integrability-2 | `SispagPainelService` injeta `ConexosBaseClient` só p/ `getFiliais` | integr |
| integrability-3 | `fin010/list` duplicado (SispagClient vs BaixaClient) | integr |
| integrability-4 | zero client-test exercitando `tituloRowSchema` (mitigado nesta feature: +`ConexosSispagClient.test.ts`) | integr |
| modifiability-2 | `transicionarStatus` SQL dinâmico (ternário+CASE) → tabela declarativa | modifiability |
| modifiability-3 | policy hardcoded (janela, CAP, page sizes) → `SispagPolicy` injetável | modifiability |
| deployability-3 | `/sispag` sem `NEXT_PUBLIC_SISPAG_ENABLED`/canary | deployability |
| deployability-5 | sem `DELETE /sispag/lotes/:id` (purge de estado ruim exige DBA) | deployability |
| single-page-pagination | `listGenericPaginated` single-page ignora `count` (truncamento silencioso) | performance/avail |

## P3 — nice-to-have (inbox)

| id | título | QA |
|----|--------|----|
| deployability-2 | probes `jobs/probe-sispag*.ts` commitados sem npm script (dead code em `dist/`) | deployability/security |
| deployability-4 | migration `0023` sem `*_down.sql` (risco zero neste delta) | deployability |
| security-sispag-4 | fail-closed em `req.user` ausente (`ator='unknown'`) | security |
| security-sispag-5 | `tenant_id` (nullable) nas 2 tabelas novas | security |
| fault-tolerance-9 | TTL de posse do advisory lock ausente | fault-tol |
| modifiability-5/6 | split `SispagInterface.ts`; fan-out de imports no `page.tsx` | modifiability |
| ds-* (7) | deep-link do filtro, notify(), DateFormatter, tooltips de disabled, DataTable, KPI-clicável, aria em ícones | design-system |

> **Bombas para a Fatia 3** (escalar prioridade quando a escrita ao ERP entrar): `fault-tolerance-6`
> (I3 constraint DB → duplo pagamento), `fault-tolerance-1`/`security-sispag-1` (audit persistida),
> `fault-tolerance-7` (Idempotency-Key), `security-sispag-2` (PII redact).
