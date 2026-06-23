# ADR-0012 — Coalescing da ingestão + escopo do rate limiter (Lote B dos P0 do Regis 2026-06-22-1658)

- **Status:** aceito
- **Data:** 2026-06-22
- **Contexto:** remediação do P0 `cc-auto-ingest-coalesce` (= performance-1) do Regis-Review `2026-06-22-1658`. O fluxo de cliente-filtro (add/remove) dispara uma re-ingestão PESADA síncrona; o operador reproduziu **HTTP 429**. READ-ONLY no Conexos; backend Express (legado).

## Causa-raiz (medida)
1. `app.use('/permutas', heavyRouteLimiter)` (`index.ts`) aplicava o limite estrito (**10 req/min/IP**) ao **router inteiro** — incluindo as LEITURAS (`/gestao`, `/painel`, `/cliente-filtro` GET, `/importadores`, `/invoices/buscar`). O `load()` da tela + o painel + a ingestão dividiam 10/min → 429.
2. Cliques em sequência no cliente-filtro disparavam ingestões concorrentes/redundantes (fan-out Conexos repetido).

## Decisão

### 1. Escopar o `heavyRouteLimiter` (mata o 429)
O limiter estrito (10/min) passa a ser aplicado **por-rota**, só nas pesadas: `POST /eleicao` e `POST /ingestao`. As demais (leituras + cliente-filtro/alocações) ficam no `globalLimiter` (**100/min**). Removido o `app.use('/permutas', heavyRouteLimiter)` global.

### 2. Coalescing in-process da ingestão
Novo `IngestaoCoalescerService` (`@singleton`) na frente do `IngestaoPermutasService`. Chamadas da MESMA instância:
- 1ª → roda; resolve assim que a SUA rodada conclui.
- quem chega DURANTE a rodada → não dispara outra; é satisfeito por **uma rodada-trailing** após a atual (que inclui a mudança dele, pois começa depois do request).
- mantém-se **SÍNCRONO** (caller aguarda) → preserva a UX do remover (spinner até concluir + compensação em falha, ADR/feature anterior).
- A rota `POST /ingestao` resolve o coalescer (`request()`) em vez do serviço direto.
- **Bass tactics:** Reduce Overhead / Bound Execution Times / Increase Resource Efficiency.

## Limites (consciente)
- O coalescer é **in-process** — serializa a mesma instância Render. A exclusão **cross-instância** (cron noutra instância) continua sendo o **advisory lock** do `IngestaoPermutasService` → `IngestLockBusyError` → **409** (o front já trata: mantém o filtro, "será aplicado na ingestão em andamento").
- Não é Lambda-ready por design (estado mutável em memória); no alvo Lambda isto vira dedup via SQS/EventBridge. Aceito como pragmático para o Express/Render legado.

## Fora deste lote
- `security-2` (rotação de segredos / secret manager), `deployability-1/2` (Supabase dev×prd, rollback) → ops.
- `testability-1/3` (sandbox de teste, coverage FE) → Lote C.
