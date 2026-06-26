-- 0021_referencia_externa.sql
-- "Referência Externa" do PROCESSO (cliente) — Conexos `priEspRefcliente` (ex.: "0052INX/26"), igual
-- para todos os documentos do processo. Distinta do nº do documento (`referencia`/docEspNumero). A tela
-- (Adiantamentos pendentes / Invoices em aberto) passa a exibi-la na coluna. Preenchida na próxima
-- ingestão; null para linhas antigas até o re-ingest. Idempotente.
ALTER TABLE permuta_adiantamento ADD COLUMN IF NOT EXISTS referencia_externa TEXT;
ALTER TABLE permuta_invoice ADD COLUMN IF NOT EXISTS referencia_externa TEXT;
