-- 0016_permuta_alocacao_data_base.sql
-- Fase 3: a Data do borderô (borDtaMvto) na baixa fin010 deve ser a DATA-BASE da D.I/DUIMP da
-- invoice (não a data de hoje). A data-base já é conhecida no momento da alocação (vem da
-- declaração do processo); persistimos aqui para a reconciliação usá-la ao criar o borderô.
-- Aditivo e idempotente.
ALTER TABLE permuta_alocacao ADD COLUMN IF NOT EXISTS data_base TIMESTAMPTZ;
