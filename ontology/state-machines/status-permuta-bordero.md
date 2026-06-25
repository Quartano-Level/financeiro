---
name: status-permuta-bordero
type: state-machine
entity: Permuta
ontology_version: "0.4"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/service/permutas/BorderoGestaoService.ts
  - src/backend/routes/permutas.ts
  - src/backend/migrations/0018_permuta_bordero_cache.sql
last_review: 2026-06-24
states: [PENDENTE, AGUARDANDO_FINALIZACAO, FINALIZADO]
out_of_scope_states: []
---

# Status PERMUTA → BORDERÔ (ciclo de vida do borderô que baixou a permuta)

> **Vigência:** 2026-06-24 (v0.7.0, ADR-0014). Modela o status de uma permuta **em relação ao
> borderô do `fin010`** que a baixou. É consulta **lazy** (`GET /permutas/status`), separada do
> `/gestao` (que segue rápido, sem ERP) — enriquece os badges da tela depois do load.

## Estados (constantes tipadas)

| Constante (TS) | Valor | Significado |
|----------------|-------|-------------|
| (omitido) | `pendente` | Sem borderô **válido** vinculado — a permuta está aberta para (re)lançamento. **Não é um valor explícito**: resulta da ausência do adto no mapa retornado por `statusPorAdiantamento`. |
| `AGUARDANDO_FINALIZACAO` | `aguardando-finalizacao` | Existe baixa `settled` na trilha e o borderô vinculado está **EM CADASTRO** no ERP (baixado, falta finalizar). |
| `FINALIZADO` | `finalizado` | O borderô vinculado está **FINALIZADO** no ERP (permuta concluída; continua aparecendo). |

Tipo: `PermutaStatus = 'aguardando-finalizacao' | 'finalizado'`
(`src/backend/domain/service/permutas/BorderoGestaoService.ts:21`); `pendente` é a ausência.

## Derivação (por adiantamento) — file:line

`BorderoGestaoService.statusPorAdiantamento`
(`src/backend/domain/service/permutas/BorderoGestaoService.ts:429-487`):

1. Coleta, por adiantamento, **todos** os `borCod` de baixas `status === 'settled'` na trilha
   (`permuta_alocacao_execucao`) — `:435-443`. Um adto pode ter vários borderôs (re-baixa após
   cancelar/estornar).
2. Resolve a situação **viva** de cada borderô no ERP por filial, 1 chamada por filial filtrada por
   `borCod#IN` (`listBorderos({ filCod, borCods })`) — `:447-464`. Busca PRECISA (não perde por
   paginação do `fin010/list`).
3. Para cada adto, escolhe o borderô **VÁLIDO** mais recente (maior `borCod` em `FINALIZADO` ou
   `EM_CADASTRO`) — `:467-478`. **Cancelado/estornado/removido é ignorado.**
4. Mapeia situação → status: `FINALIZADO → finalizado`; `EM_CADASTRO → aguardando-finalizacao` —
   `:479-485`. Se nenhum borderô válido sobra, o adto é **omitido** ⇒ a permuta volta a `pendente`
   (reabre para novo lançamento).

A situação viva do borderô vem de `situacaoDoItem`
(`:496-504`): `borCodEstornado != null ⇒ ESTORNADO`; `borVldFinalizado === 1 ⇒ FINALIZADO`;
`=== 2 ⇒ CANCELADO`; `0/undefined ⇒ EM_CADASTRO`.

## Transições

| # | De → Para | Gatilho | Regra | Vigência |
|---|-----------|---------|-------|----------|
| B1 | `PENDENTE → AGUARDANDO_FINALIZACAO` | baixa `settled` cria/atualiza o borderô (`reconciliarPermuta`) | há `settled` na trilha e o borderô está **EM CADASTRO** no ERP | 2026-06-24 |
| B2 | `AGUARDANDO_FINALIZACAO → FINALIZADO` | `finalizarBordero` (aprovar) | borderô passa a `borVldFinalizado === 1` | 2026-06-24 |
| B3 | `{AGUARDANDO_FINALIZACAO, FINALIZADO} → PENDENTE` | borderô CANCELADO / ESTORNADO / REMOVIDO no ERP | nenhum borderô válido sobra para o adto → **reabre** a permuta (idempotência viva) | 2026-06-24 |

```
            reconciliarPermuta (baixa settled, borderô EM CADASTRO)
                          │  B1
                          ▼
   ┌──────────┐   B1   ┌─────────────────────────┐   B2   ┌────────────┐
   │ PENDENTE │ ─────► │ AGUARDANDO_FINALIZACAO   │ ─────► │ FINALIZADO │
   └──────────┘        └─────────────────────────┘        └────────────┘
        ▲   ▲                        │  B3                       │  B3
        │   └────────────────────────┘                          │
        └───────────────────────────────────────────────────────┘
                cancelado / estornado / removido ⇒ reabre (PENDENTE)
```

## Decisão (2026-06-24): estorno REMOVIDO da UI

`situacaoDoItem` ainda reconhece `ESTORNADO` (um borderô estornado é beco-sem-saída no ERP — não
cancela/exclui), mas a **ação** de estornar e a saída "Liberar" foram **removidas da UI** (decisão
Yuri, comentário em `BorderoGestaoService.ts:489-495`): sem estorno na UI não há borderô travado, e o
endpoint `removerDaTrilha`/"Liberar" (`DELETE /borderos/:borCod/trilha`) foi **removido** (era código
morto + risco de dupla-baixa — Regis-Review 2026-06-24-2011 R-1, P0). Um borderô estornado direto no
ERP é tratado por B3 (a permuta reabre).

> **Nota:** o método de serviço `estornarBordero`
> (`BorderoGestaoService.ts:238-250`) e a rota `POST /borderos/:borCod/estornar`
> (`routes/permutas.ts:498-517`) ainda **existem** no backend (Fase 3.1, v0.6.0). O que a v0.7.0
> removeu foi a **exposição na UI** + o endpoint/trilha `removerDaTrilha`. Distinção registrada para
> não confundir "removido da UI" com "removido do backend".

## Relação com a state-machine de elegibilidade

Esta máquina é **ortogonal** a `state-machines/elegibilidade-permuta-candidata.md`: aquela modela o
estado da **candidata** (descoberta→elegível/manual/bloqueada→executada); esta modela o status do
**borderô** que efetivou a baixa. `EXECUTADA` (T5) é o ponto em que B1 passa a valer.
