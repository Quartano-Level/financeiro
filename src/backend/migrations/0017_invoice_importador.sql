-- 0017_invoice_importador.sql
-- Importador (cliente Columbia) do PROCESSO da invoice, hidratado na ingestão via
-- imp021 (listProcessos) para TODAS as invoices finalizadas — não só as casadas com
-- adiantamento. Permite buscar/contar invoices por cliente no universo completo.
-- `pes_cod` (chave) + `importador` (nome). READ-ONLY no ERP.
ALTER TABLE permuta_invoice ADD COLUMN IF NOT EXISTS pes_cod    TEXT;
ALTER TABLE permuta_invoice ADD COLUMN IF NOT EXISTS importador TEXT;
