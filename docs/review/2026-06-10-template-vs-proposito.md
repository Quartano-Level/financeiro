# Revisão de Fitness — Template `financeiro` vs. Propósito (Kavex × Columbia)

**Data:** 2026-06-10 · **Método:** 4 agentes de revisão em paralelo (backend, frontend, NFRs, coerência domínio/docs)
**Fonte do propósito:** [`docs/proposta/`](../proposta/) · **Domínio:** [`../../03_ontologia_financeiro.md`](../../03_ontologia_financeiro.md)
**Status pós-revisão:** correções de docs (P1+P2) aplicadas; **mudanças estruturais NÃO aplicadas** (são trabalho de construção via `/feature-new`).

> Esta revisão avalia se o template virgem (bootstrapped de `fechamento-processos`) serve ao propósito
> agora conhecido. Não é a revisão 8-QA do `/regis-review` — é uma análise de *fitness-for-purpose*.

## Veredito geral

A fundação é **sólida como encanamento** (auth, resiliência Conexos, DDD, Design System base), mas foi
herdada de um sistema de **leitura/relatórios** — e o propósito financeiro é de **escrita/execução +
cadência diária/batch + auditoria persistida**. As capacidades que *definem* as 3 frentes são
**net-new**, não migração. Não é defeito do bootstrap; a revisão mapeia o que a construção terá de adicionar.

## 1. Achado central: orientação leitura → escrita (RISCO #1)

`ConexosClient` é **100% read-only** — 24 métodos `list*`/`get*`, transporte só `getGeneric`; os `post`
são o protocolo de *query* do Conexos, **não mutação**. Não há insert/update/baixa. Mas:
- **Permutas** precisa **executar** permuta na `fin010` (escrita).
- **SISPAG** precisa gerar/enviar remessa e **conciliar baixa** (escrita).
- **Popula GED** precisa **upload** no GED (escrita, integração nova).

➡️ A primeira `/feature-new` de Permutas/SISPAG esbarra num **caminho de escrita no Conexos inexistente
e não validado**. Capturado em `_inbox/migration-debt.md` O3 e ADR-0002.

## 2. Backend — fitness & gaps

| Front | Reaproveitável | Net-new |
|---|---|---|
| I. Permutas | leitura forte, RetryExecutor, BoundedConcurrency | escrita `fin010`, idempotência, persistência (backlog/aging/auditoria), scheduler, endpoints N:M |
| II. SISPAG | leitura `com298`, roteamento rate-limited | filtro "aprovado p/ baixa", máquina de estado do lote, gate de finalização, **cliente Nexxera (CNAB)**, monitor de retorno, baixa-write, idempotência |
| III. Popula GED | RetryExecutor, logging, leitura NC/ND | watcher SharePoint, cliente GED (upload), matching PDF↔NC/ND, fila de exceções persistida |

**P0:** sem escrita no ERP · sem runtime de job/scheduler (Express-only) · Postgres cablado mas morto · sem Nexxera · sem GED/SharePoint.
**P1:** sem idempotência/no-double-execution · sem padrão de gate de finalização · sem monitoramento inbound.

## 3. Frontend — fitness & gaps

| Precisa | Tem hoje |
|---|---|
| Data-grid (paginação server + sort + seleção) | ❌ `table.tsx` é HTML burro; `@tanstack/react-table` não instalado |
| Camada de dados (polling/cache/mutation/otimista) | ❌ só `fetch`+Zod cru |
| Confirm-and-execute (gate, 1-clique) | ❌ sem `alert-dialog`/ConfirmDialog |
| Navegação multi-seção (sidebar) | ❌ só header único |
| Reusáveis | ✅ dialog, multi-select, checkbox, kpi-card, empty-state, skeleton, filtros |

**⚠️ Armadilha:** os `docs/design-system/*` descrevem um sistema muito mais rico do que o implementado
(spec herdada, não realidade) — estimar pelos docs subdimensiona.
**Fit:** I ~25% · II ~20% · III ~25%. **P1:** sem RBAC no route-gate · sem estado multi-filial · sonner não montado · sem superfície de auditoria.

## 4. NFRs transversais — scorecard

| NFR | Status | Nota |
|---|---|---|
| Autenticação | ✅ Forte | Supabase/Azure AD, HS256/JWKS, fail-fast anti-bypass |
| **RBAC por perfil** | ❌ Ausente | só authN; `role` é o role Postgres do Supabase, nunca aplicado |
| **Auditoria persistida** | ❌ Ausente | exigida pelas 3 frentes; só log em console; Postgres morto. **Maior gap NFR.** |
| Conexos resiliente | ✅ Forte (production-grade) | login mutex, recuperação de sessão, retry+jitter, bounded concurrency, rate-limit, redação |
| Observabilidade | 🟡 Parcial | logs + request-id; sem métricas/tracing/alertas |
| Multi-filial | 🟡 Parcial | `filCod` first-class (ADR-0009); falta fluxo "todas as filiais" |
| Padronização | ✅ Forte | Biome/TS strict/DDD/tsyringe/lockstep |

## 5. Coerência domínio/docs

✅ Docs de propósito fiéis à proposta, consistentes e pipeline-ready.
✅ (pós-revisão) Risco leitura→escrita agora capturado em `migration-debt.md` O3, ADR-0002, README e seed.
✅ (pós-revisão) "duplicidade" removido do seed; corte bancário SISPAG inline na frente II.

## 6. O que já está forte
Resiliência Conexos de nível produção · autenticação endurecida · multi-filial com fundação correta ·
padronização consistente · docs de propósito precisos. **A fundação não precisa ser refeita — estendida.**

## 7. Riscos top
1. Mismatch de gênero (leitura/compute → escrita/execução/batch).
2. Correção financeira sem idempotência/transação (permuta/baixa movem dinheiro, são retryáveis).
3. Três integrações novas em cronograma de terceiros (Nexxera/GED/SharePoint).

## 8. Itens de construção (NÃO feitos hoje — entram no roadmap futuro)
escrita no ERP · runtime de job/scheduler · clientes Nexxera/GED/SharePoint · persistência (auditoria,
backlog, lote, fila) · RBAC por perfil · data-grid + camada de query no frontend · observabilidade
(métricas/alertas). Rastreados em `ontology/_inbox/migration-debt.md` (O3–O7).
