-- 0008_adiantamento_taxa.sql
-- Taxa de câmbio negociada (com308 titFltTaxaMneg) do PRÓPRIO adiantamento,
-- persistida na linha do fato para exibir a taxa no detalhe de QUALQUER status
-- (inclusive não-pago / bloqueado), não só nos casados (permuta_casamento).
ALTER TABLE permuta_adiantamento ADD COLUMN IF NOT EXISTS taxa NUMERIC;
