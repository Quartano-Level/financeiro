-- Migration 0005 — novo estado `casamento-manual` no modelo relacional (Fase B).
--
-- Regra de elegibilidade (ADR-0005): os casos N:M (>1 INVOICE FINALIZADA no
-- processo, motivos `composto-nm` / `multiplas-invoices`) DEIXAM de ser
-- `bloqueada` e passam a um estado próprio `casamento-manual` — passaram os 4
-- gates, só falta o analista escolher a invoice. Os demais motivos de bloqueio
-- (`sem-invoice`, `data-base-indisponivel`, `falha-gate`, `detail-indisponivel`)
-- continuam `bloqueada`.
--
-- Esta migration estende a CHECK de `permuta_adiantamento.estado_elegibilidade`
-- (criada inline na 0003) para aceitar o novo valor. NÃO toca o
-- `permuta_candidata_snapshot` (0001), cuja CHECK segue `elegivel|bloqueada` —
-- o `casamento-manual` é mapeado para `bloqueada` no snapshot (back-compat
-- `/painel` do PR#2).
--
-- SQL idempotente (`DROP CONSTRAINT IF EXISTS` + re-`ADD`). Nome da constraint =
-- padrão Postgres p/ CHECK inline de coluna: `<tabela>_<coluna>_check`.

ALTER TABLE permuta_adiantamento
    DROP CONSTRAINT IF EXISTS permuta_adiantamento_estado_elegibilidade_check;

ALTER TABLE permuta_adiantamento
    ADD CONSTRAINT permuta_adiantamento_estado_elegibilidade_check
        CHECK (estado_elegibilidade IN ('descoberta', 'elegivel', 'bloqueada', 'casamento-manual'));
