-- 0027_lote_retornado.sql
-- Novo status RETORNADO ("de volta do Nexxera") no ciclo do lote:
-- RASCUNHO → FINALIZADO (aguardando retorno do Nexxera) → RETORNADO (retorno recebido).
-- Recria o CHECK de status incluindo o novo valor. Idempotente.
ALTER TABLE lote_pagamento DROP CONSTRAINT IF EXISTS lote_pagamento_status_check;
ALTER TABLE lote_pagamento
    ADD CONSTRAINT lote_pagamento_status_check
    CHECK (status IN ('RASCUNHO', 'FINALIZADO', 'CANCELADO', 'RETORNADO'));
