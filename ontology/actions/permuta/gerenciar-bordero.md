---
name: gerenciarBordero
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
  - "Borderô EXISTE no fin010 e foi CRIADO POR ESTE SISTEMA (presente na trilha permuta_alocacao_execucao) — autorização server-side por filial."
  - "Escrita habilitada (CONEXOS_WRITE_ENABLED=true) — toda ação é gated."
  - "Estado compatível com a transição: finalizar/cancelar/excluir exigem EM CADASTRO; o ERP recusa transições inválidas com mensagem clara."
  - "Requer papel admin (requireRole('admin'))."
postconditions:
  - "finalizar → borVldFinalizado=1 no ERP; cache permuta_bordero atualizado na hora (AGUARDANDO_FINALIZACAO → FINALIZADO, B2)."
  - "cancelar → borVldFinalizado=2 (CANCELADO) no ERP; a permuta reabre (B3 → PENDENTE)."
  - "excluir baixa → baixa removida no ERP + trilha; se foi a última, apaga o borderô vazio (best-effort)."
  - "excluir borderô → todas as baixas + o próprio borderô removidos no ERP + trilha; a permuta reabre (B3)."
side_effects:
  - "Escrita no fin010 (finalizarBordero/cancelarBordero/excluirBaixa/excluirBordero do ConexosClient)."
  - "Atualização do cache local permuta_bordero (migration 0018)."
  - "Trilha permuta_alocacao_execucao: delete da baixa/borderô removido."
---

# gerenciarBordero — ciclo de vida do borderô no `fin010`

> **Vigência:** Fase 3.1 (v0.6.0) consolidada e ajustada em v0.7.0 (2026-06-24, ADR-0014). Agrupa as
> ações de ciclo de vida do **borderô** que efetivou a permuta no `fin010` (a baixa em si é a ação
> `reconciliarPermuta`; aqui é o que se faz com o borderô **depois**).

## Operações (file:line)

Serviço `BorderoGestaoService` (`src/backend/domain/service/permutas/BorderoGestaoService.ts`):

| Operação | Método (file:line) | Rota (`routes/permutas.ts`) |
|---|---|---|
| Finalizar / aprovar | `finalizarBordero` `:196-212` | `POST /permutas/borderos/:borCod/finalizar` `:454-470` |
| Cancelar (em cadastro) | `cancelarBordero` `:217-232` | `POST /permutas/borderos/:borCod/cancelar` `:476-492` |
| Excluir UMA baixa | `excluirBaixa` `:81-147` | `DELETE /permutas/borderos/:borCod/baixas/:invoiceDocCod` `:543-560` |
| Excluir o borderô INTEIRO | `excluirBordero` `:154-194` | `DELETE /permutas/borderos/:borCod` `:520-538` |
| (estorno — ver nota) | `estornarBordero` `:238-250` | `POST /permutas/borderos/:borCod/estornar` `:498-517` |

A **listagem** dos borderôs vem do cache local (`listarBorderos` `:295-356`, `?live=true` força
`refreshCache` `:381-418`); o detalhe das baixas de um borderô vem do ERP (`listarBaixasErp` `:363-379`).

## Gating + autorização server-side

- **Gate de escrita:** toda ação chama `assertWriteEnabled` (`:253-258`) — falha se
  `CONEXOS_WRITE_ENABLED=false`.
- **Autorização por filial (anti confused-deputy, Regis-Review P0 security):**
  `requireOwnBorderoFilCod` (`:266-275`) deriva o `filCod` da **trilha** (`permuta_alocacao_execucao`),
  **nunca** do request — um borderô não criado por este sistema lança `FORBIDDEN:` (→ 403). Aprovar /
  cancelar / estornar passam por `guardAcaoBordero` (`:282-283`, = `assertWriteEnabled` +
  `requireOwnBorderoFilCod`); excluir borderô chama `requireOwnBorderoFilCod` direto (`:160`).
- Todas as rotas são `requireRole('admin')`.

## Efeito no status PERMUTA → BORDERÔ

Estas operações disparam as transições da state-machine `state-machines/status-permuta-bordero.md`:
finalizar = **B2** (`AGUARDANDO_FINALIZACAO → FINALIZADO`); cancelar / excluir baixa / excluir borderô
= **B3** (nenhum borderô válido sobra ⇒ a permuta volta a `PENDENTE`). O cache `permuta_bordero` é
atualizado na hora (`updateBorderoCacheSituacao` / `deleteBorderoCache`) para não esperar o próximo
`refreshCache`.

## NB — estorno removido da UI (endpoint backend mantido)

A **ação de estornar** e a saída "Liberar" foram **removidas da UI** em v0.7.0 (decisão Yuri). O método
`estornarBordero` (`:238-250`) e a rota `POST /permutas/borderos/:borCod/estornar` (`:498-517`)
**continuam existindo no backend** (Fase 3.1). O endpoint `removerDaTrilha` / `DELETE /trilha` foi
**removido** (era código morto + risco de dupla-baixa — Regis-Review 2026-06-24-2011 R-1, P0). Um
borderô estornado direto no ERP é tratado por B3 (a permuta reabre). Distinção registrada para não
confundir "removido da UI" com "removido do backend".

## Por que está na ontologia (universalidade)

Universal no domínio: depois que uma permuta é baixada via borderô no ERP, o domínio precisa de
operações de ciclo de vida sobre esse borderô (aprovar / cancelar / desfazer). A estrutura (finalizar,
cancelar, excluir baixa, excluir borderô) é do domínio; os valores (`borCod`, `filCod`) são instâncias
do tenant. A autorização por filial derivada da trilha é invariante de segurança do domínio.
