-- 0012_estado_permuta_manual.sql
-- Novo estado `permuta-manual` no modelo relacional (Fase 1 — permuta múltipla
-- manual cross-process). Adtos de "clientes filtro" (importador cadastrado) que
-- estão pagos e com saldo a permutar são roteados para este estado em vez de
-- `bloqueada` — a invoice vem de outro processo, escolhida manualmente (Fatia 2).
--
-- Estende a CHECK de `permuta_adiantamento.estado_elegibilidade` (mesma técnica da
-- 0005). NÃO toca o `permuta_candidata_snapshot` (0001), cuja CHECK segue
-- `elegivel|bloqueada` — `permuta-manual` colapsa para `bloqueada` no snapshot
-- (back-compat `/painel`). SQL idempotente.
ALTER TABLE permuta_adiantamento
    DROP CONSTRAINT IF EXISTS permuta_adiantamento_estado_elegibilidade_check;

ALTER TABLE permuta_adiantamento
    ADD CONSTRAINT permuta_adiantamento_estado_elegibilidade_check
        CHECK (estado_elegibilidade IN
            ('descoberta', 'elegivel', 'bloqueada', 'casamento-manual', 'permuta-manual'));
