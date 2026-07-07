# Regis-Review — SISPAG Painel + Montagem de Lote + Gate (Escopo II, Fatia 1+2)

**Data:** 2026-07-07 · **Branch:** `feat/sispag-painel-montagem` · **Overall:** **6.47/10** (peso 9.0)
**Cards:** 54 (P0: 3 · P1: 14 · P2: 25 · P3: 12) · **P0 residual após remediação: 0**

> Síntese das 8 seções QA (Bass & Clements) deste diretório. Feature **read-only ao ERP (I1)** e
> persistência **local** — nenhuma escrita financeira possível nesta fatia. Isso limita o raio de
> impacto e é a razão de vários "worst-case" ficarem P1/P2 (viram P0 só na fatia de escrita).

## Scores por atributo

| QA | Score | P0 | Nota |
|----|-------|----|------|
| Integrability | 7.5 | 0 | superfície read-only compõe bem o `ConexosBaseClient`; seam da Fatia 3 a materializar |
| Modifiability | 7.4 | 0 | backend Bass-clean; débito no frontend (`page.tsx` 685 LoC) |
| Security | 7.0 | 0 | 100% Zod/RBAC, `ator` do JWT, SQL param; audit só em stdout (P1) |
| Fault Tolerance | 7.0 | 0 | advisory-lock+tx **validado correto**; loop multi-título não-atômico (P1) |
| Deployability | 7.0 | 0 | migration aditiva idempotente, rotas aditivas, zero env nova |
| Availability | 6.0 | 0 | reads sem retry (P1); painel parcial-silencioso (P1); pool-hold no include (P1→remediado) |
| Testability | 5.0 | **1** | **CI coverage-gate vermelho** (funcs 77.72% < 78%) — P0 |
| Performance | 4.5 | **1** | fan-out ~21 chamadas Conexos sem bound (P0); include sequencial N× (P1) |

## P0 (bloqueantes) — os 3 que re-entraram no loop, TODOS remediados

1. **`testability-1` — CI coverage-gate vermelho.** Arquivos novos a 0% derrubavam funções globais para
   77.72% (< 78%); `npm test -- --coverage` falhava. → **Remediado:** +4 suites (repository, client,
   painel-service, service estendido) → **funções 89.29% global**, `domain/service` 98.88% linhas. Exit 0.
2. **`performance-1` — fan-out sem bound.** Painel disparava `3×N_filiais` (~21) chamadas Conexos
   simultâneas (`Promise.all`) → risco `LOGIN_ERROR_MAX_SESSIONS`. → **Remediado:** pool único via
   `BoundedConcurrency` (limite 4) em `SispagPainelService`.
3. **`deployability-sispag-1` — bump de versão.** Gate #10 exige FE==BE lockstep. → **Remediado:**
   `0.11.0 → 0.12.0` (ambos `package.json`) + CHANGELOG.

**Bônus (P1 relacionado, remediado junto):** `availability-sispag-3` / pool-starvation — a re-leitura
Conexos no `incluirTitulo` foi movida para **fora** do advisory-lock (não segura mais conexão do pool
durante a rede).

## Temas transversais

- **Cobertura/observabilidade** (testability × availability): reads sem retry + sem sinal de parcial-
  silencioso + suites faltando. Coverage resolvido; retry e sinal-de-parcial → follow-ups P1.
- **Concorrência** (fault-tolerance × availability × performance): o padrão de lock foi **confirmado
  correto**; o custo era segurar conexão do pool (remediado) e o burst do fan-out (remediado).
- **Auditoria** (security × fault-tolerance): hoje só stdout; persistir vira necessidade **dura na
  Fatia 3** (SOX). P1 follow-up.

## ⚠️ Bombas armadas para a Fatia 3 (write/transport) — hoje P1/P2, viram P0

- **I3 sem constraint no banco** (`fault-tolerance-6`): a não-duplicação é garantida só no serviço
  (advisory-lock). Um writer alheio ao serviço poderia colocar um título em 2 lotes → **duplo
  pagamento** quando a escrita ao ERP entrar. Adicionar constraint/estratégia antes da Fatia 3.
- **Audit não persistida** (`fault-tolerance-1`/`security-sispag-1`): "quem enviou a remessa" precisa
  ser incontestável.
- **Sem Idempotency-Key** no fluxo de execução (`fault-tolerance-7`).
- **Redação de PII** (`security-sispag-2`): endurecer `redactBody` antes do payload de remessa.

## Veredito

Feature **aprovada para merge** após remediação dos 3 P0. Delta read-only+local é sólido: invariantes
testadas na fronteira do agregado, contrato read-only ao ERP confirmado (PatternGuardian + qa-security +
qa-integrability), deploy-safe. Os P1/P2/P3 estão em
`ontology/_inbox/sispag-painel-montagem-regis-followups.md`; as bombas da Fatia 3 estão marcadas para
entrar no escopo da próxima feature.

> Seções detalhadas (métricas + cards por QA): os 8 arquivos `qa-*.md` neste diretório.
