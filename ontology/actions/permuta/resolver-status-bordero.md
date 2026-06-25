---
name: resolverStatusBordero
type: action
entity: Permuta
ontology_version: "0.4"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/BorderoGestaoService.ts
  - src/backend/routes/permutas.ts
  - src/backend/migrations/0018_permuta_bordero_cache.sql
last_review: 2026-06-25
preconditions:
  - "Existe pelo menos um adiantamento com baixa na trilha permuta_alocacao_execucao."
  - "Requer papel admin (requireRole('admin'))."
postconditions:
  - "Devolve, por adiantamento, o vínculo PERMUTA→BORDERÔ com o status derivado (pendente | aguardando-finalizacao | finalizado)."
  - "Não escreve no ERP nem no banco — consulta READ-ONLY (status vivo do fin010)."
side_effects:
  - "Leitura da trilha (status settled por adiantamento) + leitura viva do fin010 (listBorderos borCod#IN, 1 chamada por filial)."
---

# resolverStatusBordero — status PERMUTA → BORDERÔ por adiantamento

> **Vigência:** 2026-06-24 (v0.7.0, ADR-0014). Consulta **lazy**, separada do `/gestao` (que segue
> rápido, sem ERP): enriquece os badges da tela depois do load. Deriva o status definido na
> state-machine `state-machines/status-permuta-bordero.md`.

## Operação (file:line)

- `BorderoGestaoService.statusPorAdiantamento`
  (`src/backend/domain/service/permutas/BorderoGestaoService.ts:429-487`).
- Rota `GET /permutas/status` (`src/backend/routes/permutas.ts:579-587`), `requireRole('admin')`.

## Derivação

Resumo (detalhe completo em `state-machines/status-permuta-bordero.md`):

1. Coleta, por adiantamento, todos os `borCod` de baixas `status === 'settled'` na trilha
   (`permuta_alocacao_execucao`) — `:435-443`. Um adto pode ter vários borderôs (re-baixa após
   cancelar/estornar).
2. Resolve a situação **viva** de cada borderô no ERP, 1 chamada por filial filtrada por `borCod#IN`
   (`listBorderos({ filCod, borCods })`) — `:447-464` (busca precisa, não perde por paginação).
3. Escolhe, por adto, o borderô **VÁLIDO** mais recente (maior `borCod` FINALIZADO ou EM_CADASTRO)
   — `:467-478`. **Cancelado / estornado / removido é ignorado.**
4. Mapeia situação → status (`:479-485`): `FINALIZADO → finalizado`; `EM_CADASTRO →
   aguardando-finalizacao`. Se nenhum borderô válido sobra, o adto é **omitido** ⇒ a permuta volta a
   `pendente` (reabre para novo lançamento). A situação viva vem de `situacaoDoItem` (`:496-504`).

## Resultado para o domínio

`pendente` (ausência no mapa) → permuta aberta para (re)lançamento; `aguardando-finalizacao` → baixada,
borderô EM CADASTRO; `finalizado` → borderô finalizado no ERP. Um borderô cancelado / estornado /
removido **reabre** a permuta (transição B3 da state-machine). É a forma de o sistema reconciliar com o
estado vivo do ERP sem persistir estado próprio (idempotência viva).

## Por que está na ontologia (universalidade)

Universal: o status de uma permuta consumada é função do estado do borderô que a efetivou no ERP — e
esse estado é a fonte da verdade. Derivar o status do estado vivo (em vez de persistir um espelho que
pode divergir) é invariante de domínio. A estrutura (status PERMUTA→BORDERÔ + reabertura no
cancelamento) é do domínio; os valores são do tenant.
