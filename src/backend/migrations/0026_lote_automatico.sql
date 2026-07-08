-- 0026_lote_automatico.sql
-- Formação AUTOMÁTICA de lotes (cron pós-ingestão). Um lote automático nasce RASCUNHO,
-- agrupado por (filial × classe nacional/internacional × banco), só com títulos A VENCER
-- (≤7 dias). O cron NÃO mexe em lotes manuais nem finalizados. Lote automático que contém
-- título já VENCIDO é DESFEITO no run seguinte (libera os títulos). SQL idempotente.
ALTER TABLE lote_pagamento
    ADD COLUMN IF NOT EXISTS automatico BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_lote_pagamento_auto_status
    ON lote_pagamento (automatico, status);
