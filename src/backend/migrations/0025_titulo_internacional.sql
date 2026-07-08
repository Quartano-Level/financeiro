-- 0025_titulo_internacional.sql
-- SISPAG — classificação Nacional × Internacional (exterior).
-- Discriminador: `ufEspSigla` no com298 — 'EX' = exterior (internacional); UF BR = nacional.
-- Regra de negócio (I7): um lote é 100% nacional OU 100% internacional — nunca misto
-- (rails de pagamento distintos: boleto/PIX nacional vs. câmbio/exterior).
-- SQL idempotente.

-- Carteira: cada título carrega sua classe (enriquecida na ingestão via com298).
ALTER TABLE titulo_a_pagar
    ADD COLUMN IF NOT EXISTS internacional BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_titulo_a_pagar_internacional
    ON titulo_a_pagar (ativo, internacional);

-- Item do lote: snapshot da classe no momento da inclusão (base do enforcement I7).
ALTER TABLE lote_pagamento_item
    ADD COLUMN IF NOT EXISTS internacional BOOLEAN NOT NULL DEFAULT FALSE;
