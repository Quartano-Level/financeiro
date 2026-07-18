-- 0031_sispag_modalidade.sql
-- SISPAG A2 — forma de pagamento (modalidade) por título + auto-detecção de boleto.
-- Decisão do analista: a modalidade é escolha do analista na revisão; boleto é
-- auto-detectado por CÓDIGO DE BARRAS. Persistimos só a CLASSIFICAÇÃO (é boleto?)
-- na ingestão — não o detalhe de remessa (barras/PIX/conta seguem só ao vivo no envio).
-- SQL idempotente.

-- Carteira: sinal "tem código de barras" (= candidato a boleto), derivado do fin064
-- na ingestão. Deixa o default boleto disponível offline nos lotes automáticos e manuais.
ALTER TABLE titulo_a_pagar
    ADD COLUMN IF NOT EXISTS tem_boleto BOOLEAN NOT NULL DEFAULT FALSE;

-- Item do lote: forma de pagamento escolhida/revisada pelo analista. NULL = "a definir"
-- (bloqueia a finalização até o analista escolher). Boleto pré-selecionado quando o
-- título tem código de barras.
ALTER TABLE lote_pagamento_item
    ADD COLUMN IF NOT EXISTS modalidade TEXT
    CHECK (modalidade IS NULL OR modalidade IN ('BOLETO', 'TED', 'PIX', 'CREDITO_CONTA'));
