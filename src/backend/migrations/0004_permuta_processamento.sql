-- Migration 0004 — Permutas Fase B: estado do analista (sobrevive à ingestão).
-- O botão "Processar" da tela grava aqui o status que o analista atribuiu a um
-- adiantamento. PK = adiantamento_doc_cod (chave natural Conexos), SOFT-REF
-- (sem FK) ao `permuta_adiantamento`: o UPSERT-in-place dos fatos preserva o
-- doc_cod, então o status permanece anexado através da re-ingestão diária.
-- Um doc_cod que sumir do Conexos vira `stale` no fato (nunca deletado), e o
-- processamento continua existindo.
--
-- SQL idempotente (`IF NOT EXISTS`) — re-rodar é seguro.

CREATE TABLE IF NOT EXISTS permuta_processamento (
    adiantamento_doc_cod    TEXT PRIMARY KEY,
    status                  TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'processando', 'processado', 'erro')),
    invoice_doc_cod         TEXT,
    observacao              TEXT,
    processado_por          TEXT,
    processado_em           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permuta_processamento_status
    ON permuta_processamento (status);
