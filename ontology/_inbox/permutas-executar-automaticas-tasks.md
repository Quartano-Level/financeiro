# Feature: Permutas — botão "Executar" (lote das automáticas)

**Slug:** `permutas-executar-automaticas` · **Branch:** `feat/permutas-executar-automaticas` · **Base:** `main`
**entity_changed:** `false` — nova **ação** (`executarPermutasAutomaticasEmLote`) que orquestra a ação
existente `reconciliarPermuta` sobre o conjunto das automáticas. Sem nova entidade/estado/invariante;
herda atomicidade por par, idempotência write-ahead e gating de escrita. Doc de ação em
`ontology/actions/permuta/executar-automaticas-lote.md`.

## Intenção
Botão **"Executar"** na aba **Automáticas** do painel de Permutas que cria os borderôs de TODAS as
automáticas de uma vez (baixa real no `fin010`, gated). Mantém o **"Processar" individual** intacto
para quem quiser rodar uma a uma.

## Decisões (entrevista 2026-06-25)
- **Escopo:** executa **sempre TODAS as automáticas** (ignora os filtros Filial/Busca da tela).
- **Falha parcial:** **continua e reporta** os que falharam (cada caso é idempotente/atômico por par;
  os que falham seguem pendentes para retry).
- **Confirmação:** **diálogo com resumo** antes de disparar (X automáticas, Y borderôs, total USD;
  aviso de baixa real irreversível no ERP).
- **Mecanismo:** **endpoint de lote no backend** (1 request) — evita estourar o `heavyRouteLimiter`
  (10/min) que um loop no front com 26+ chamadas estouraria; pacing sequencial server-side.

## Conjunto "automáticas"
São os `gestao.casamentos` (`CasamentoSugerido[]`) — casamentos simples + múltiplas automáticas, já
pré-distribuídos. O lote reconcilia cada **adiantamento** desses casamentos com
`processamentoStatus !== 'processado'` (mesmo critério do "Processar" individual). Cada adto → seu borderô.

## Tarefas + Acceptance Criteria
1. **`ReconciliacaoLotePermutaService`** (`domain/service/permutas/`)
   - `@injectable`, injeta `GestaoPermutasService` + `ReconciliacaoPermutaService` + `LogService`; métodos arrow; modificadores explícitos.
   - `reconciliarLote({ executadoPor, dataMovto, dryRunOverride?, requestId }): Promise<ReconciliarLoteResult>`.
   - Coleta os adto docCods únicos das automáticas (não-processados), itera **sequencial**, **continue-on-error**.
   - Agrega: `totalCasos`, `totalSettled`, `totalErros`, `borderos[]`, `resultados[]` (status por adto: settled/parcial/error/dry-run/skipped + erro + priCod).
   - **AC:** coleta correta (ignora processados); um erro num adto não interrompe os demais; dry-run propaga; agrega contagens.
2. **Rota** `POST /permutas/reconciliar-lote` — admin + `heavyRouteLimiter`, Zod `{ dryRun?, dataMovto? }`, `executadoPor` da auth.
   - **AC:** 200 com `ReconciliarLoteResult`; 401 sem auth; 403 sem admin; dryRun passthrough.
3. **Testes backend** — service (coleta/continue-on-error/agg/dry-run) + rota; mantém piso de cobertura.
4. **Frontend** — `api.ts` `reconciliarLoteAutomaticas(opts)`; `types.ts` `ReconciliarLoteResult`; `page.tsx`
   botão **Executar** na aba Automáticas (roda todas, ignora filtros) + diálogo de confirmação com resumo +
   loading + toast agregado + refresh. **Processar** individual permanece.
   - **AC:** confirma → executa lote → toast "X executadas, Y borderôs, Z falharam"; dry-run vira info; DesignSystemReviewer verde.
5. **Gates** — typecheck/lint/test verdes; PatternGuardian; DesignSystemReviewer; doc de ação na ontologia; Regis-Review (só P0); bump + PR.

## Riscos / notas
- **Escrita financeira em lote** — protegida pelo gate `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`
  (default dry-run). O lote NÃO afrouxa o gate; reusa `reconciliar` integralmente.
- **Timeout:** N adtos × ~5 chamadas ERP sequenciais pode demorar (~26 casos hoje). Síncrono é aceitável
  nesta fatia; mover para job assíncrono é follow-up se o volume crescer. Retry é seguro (idempotência write-ahead).

## Definition of Done
- Botão Executar cria os borderôs das automáticas em lote (gated); Processar individual intacto;
  gates verdes; Regis-Review rodado (P0 zerado); versão bumpada (FE==BE) e PR aberto após rebase de `main`.
