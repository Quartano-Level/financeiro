---
name: executarPermutasAutomaticasEmLote
type: action
entity: Permuta
ontology_version: "0.4"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts
  - src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts
  - src/backend/domain/service/permutas/GestaoPermutasService.ts
  - src/backend/routes/permutas.ts
  - src/frontend/app/permutas/page.tsx
last_review: 2026-06-25
preconditions:
  - "Requer papel admin (requireRole('admin')) + heavyRouteLimiter."
  - "Conjunto = casamentos sugeridos (automáticas) com adiantamento ainda não processado."
  - "Escrita real gated por CONEXOS_WRITE_ENABLED + CONEXOS_DRY_RUN (default dry-run) — o lote NÃO afrouxa o gate."
postconditions:
  - "Cada adiantamento elegível vira seu borderô EM CADASTRO no fin010 (reusa reconciliarPermuta integralmente)."
  - "Continue-on-error: a falha de um adiantamento não interrompe os demais; falhos seguem pendentes para retry."
  - "Idempotência: par adto↔invoice já liquidado é pulado (status skipped) — sem dupla-baixa."
side_effects:
  - "Escrita no fin010 (via reconciliarPermuta) + trilha permuta_alocacao_execucao por par."
  - "Auto-alocação atômica de rascunhos quando o adto não tem alocação (herdado de reconciliarPermuta)."
---

# executarPermutasAutomaticasEmLote — botão "Executar" da aba Automáticas

> **Vigência:** 2026-06-25. Orquestra em LOTE a ação existente [`reconciliarPermuta`] sobre TODAS as
> automáticas (aba "Automáticas" = `gestao.casamentos`). NÃO é uma nova invariante: herda atomicidade
> por par, idempotência write-ahead e o gate de escrita. O "Processar" individual continua existindo
> para rodar uma a uma.

## Fluxo (file:line)

`POST /permutas/reconciliar-lote` (`routes/permutas.ts`, admin + heavyRouteLimiter)
→ `ReconciliacaoLotePermutaService.reconciliarLote`:

1. `GestaoPermutasService.exporGestao()` — lê o conjunto das automáticas (`casamentos`).
2. Coleta os `adiantamentoDocCod` únicos cujo `processamentoStatus !== 'processado'` (dedup: 1 adto → 1 borderô).
3. Itera **sequencial** (server-side; 1 request → não estoura o rate limit; pacing sobre o Conexos),
   chamando `ReconciliacaoPermutaService.reconciliar` por adto, com **continue-on-error**.
4. Agrega: `totalCasos`, `totalSettled`, `totalErros`, `borderos[]`, `resultados[]`
   (status por adto: `settled` / `parcial` / `error` / `dry-run` / `skipped`).

## Decisões (entrevista 2026-06-25)
- **Escopo:** roda as automáticas (ignora filtros Filial/Busca da tela).
- **Lotes de até `LOTE_MAX=10` por clique** (cap server-side autoritativo). A tela manda os "próximos 10"
  pendentes; ao recarregar, os baixados ganham borderô e somem → o analista clica de novo até zerar.
  O cap mantém o request curto (longe do timeout do proxy) e limita o blast radius por clique.
- **Falha parcial:** continua e reporta os que falharam.
- **Confirmação:** diálogo com resumo (lote atual, pendentes totais, total a ser usado) antes de disparar.

## Segurança / consistência
- Mesmo gate de escrita do `reconciliarPermuta` — em ambiente sem `CONEXOS_WRITE_ENABLED` o lote roda
  em dry-run (valida payloads, não baixa).
- Retry é seguro: a idempotência write-ahead por par garante que re-disparar o lote não dobra baixas
  (pares já `settled` viram `skipped`).
- **Follow-up conhecido:** execução síncrona; N adtos × handshake fin010 pode demorar com volume alto —
  candidato a job assíncrono se o conjunto crescer muito (ver `_inbox`).
