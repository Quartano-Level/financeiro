-- 0009_invoice_taxa.sql
-- Taxa de câmbio negociada (com308 titFltTaxaMneg) da invoice, persistida na
-- linha do fato para exibir a taxa no detalhe das invoices em aberto.
ALTER TABLE permuta_invoice ADD COLUMN IF NOT EXISTS taxa NUMERIC;
