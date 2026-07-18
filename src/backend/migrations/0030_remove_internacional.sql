-- 0030_remove_internacional.sql
-- SISPAG — INTERNACIONAL FORA DO ESCOPO (ADR-0020, supersede ADR-0017).
-- Pagamento ao exterior é câmbio manual da tesouraria (Itaú→BB), não passa pelo SISPAG.
-- Remove a divisão nacional×internacional (e o invariante I7): purga o legado + dropa as colunas.
-- SQL idempotente. ⚠️ Destrutivo (apaga títulos/itens/lotes internacionais já ingeridos, dado dormente).

-- 1) PURGA do legado internacional (ordem: itens → lotes órfãos → títulos).
--    Só age se a coluna ainda existir (idempotência entre re-runs).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'lote_pagamento_item' AND column_name = 'internacional'
    ) THEN
        -- Remove itens internacionais dos lotes.
        DELETE FROM lote_pagamento_item WHERE internacional = TRUE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'titulo_a_pagar' AND column_name = 'internacional'
    ) THEN
        -- Remove os títulos internacionais da carteira.
        DELETE FROM titulo_a_pagar WHERE internacional = TRUE;
    END IF;
END $$;

-- Lotes que ficaram VAZIOS após a purga (eram 100% internacionais) — remove a raiz órfã.
DELETE FROM lote_pagamento l
WHERE NOT EXISTS (SELECT 1 FROM lote_pagamento_item i WHERE i.lote_id = l.id);

-- 2) DROP das colunas + índice (a divisão nacional×internacional deixou de existir).
DROP INDEX IF EXISTS idx_titulo_a_pagar_internacional;
ALTER TABLE titulo_a_pagar DROP COLUMN IF EXISTS internacional;
ALTER TABLE lote_pagamento_item DROP COLUMN IF EXISTS internacional;
