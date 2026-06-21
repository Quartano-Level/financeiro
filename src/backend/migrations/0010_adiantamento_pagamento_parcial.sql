-- 0010_adiantamento_pagamento_parcial.sql
-- Progresso de pagamento do adiantamento (ADR-0006 / Gate 3 `nao-pago`): face e
-- saldo em aberto do título (com298 detail `mnyTitValor` / `mnyTitAberto`, em BRL).
-- Identidade: valor_total = valor_pago + valor_aberto. O frontend deriva o % pago
-- e quanto falta (valor_aberto) — sem coluna derivada. READ-ONLY no ERP.
ALTER TABLE permuta_adiantamento ADD COLUMN IF NOT EXISTS valor_total  NUMERIC;
ALTER TABLE permuta_adiantamento ADD COLUMN IF NOT EXISTS valor_aberto NUMERIC;
