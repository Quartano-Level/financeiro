-- Migration 0006 — moeda NEGOCIADA dos fatos (correção financeira).
-- A coluna `moeda` dos fatos carrega a moeda do DOCUMENTO (`moeEspSigla` null →
-- 'BRL'), mas a coluna "Valor Moeda Negociada" da tela Gestão exibe o valor em
-- moeda ESTRANGEIRA do título (`com308`: `moedaCod` 220=USD / `moedaNome`).
-- `moeda_negociada` carrega essa sigla para que a tela rotule "1.100,00 USD"
-- em vez de "BRL". Distinta de `moeda` (doc) — não a substitui.
--
-- SQL idempotente (`ADD COLUMN IF NOT EXISTS`) — re-rodar é seguro. Aplicado em
-- ordem lexicográfica pelo `runMigrations.ts`.

ALTER TABLE permuta_adiantamento
    ADD COLUMN IF NOT EXISTS moeda_negociada TEXT;

ALTER TABLE permuta_invoice
    ADD COLUMN IF NOT EXISTS moeda_negociada TEXT;
