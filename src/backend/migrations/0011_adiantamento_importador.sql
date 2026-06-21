-- 0011_adiantamento_importador.sql
-- Importador (cliente Columbia) do PROCESSO do adiantamento, hidratado na eleição
-- via imp021 (listProcessos): `pes_cod` (chave) + `importador` (nome). Usado para
-- rotear adtos de "clientes filtro" ao estado `permuta-manual` e para o seletor de
-- importadores no cadastro. READ-ONLY no ERP.
ALTER TABLE permuta_adiantamento ADD COLUMN IF NOT EXISTS pes_cod    TEXT;
ALTER TABLE permuta_adiantamento ADD COLUMN IF NOT EXISTS importador TEXT;
