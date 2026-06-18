-- Migration 0001 — Permutas Frente I, Fatia 1 (snapshot + auditoria).
-- Fecha migration-debt O5 (Postgres cablado mas sem uso) e O6 (auditoria).
-- READ-ONLY no Conexos; a ÚNICA escrita desta fatia é este snapshot próprio.
--
-- Convenção (1ª migration do repo): arquivos `NNNN_descricao.sql` aplicados em
-- ordem lexicográfica pelo runner `runMigrations.ts`. SQL idempotente
-- (`IF NOT EXISTS`) — re-rodar é seguro.

CREATE TABLE IF NOT EXISTS permuta_eleicao_run (
    id                  UUID PRIMARY KEY,
    flow_id             TEXT NOT NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    finished_at         TIMESTAMPTZ NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
    total_candidatas    INTEGER NOT NULL DEFAULT 0,
    total_elegiveis     INTEGER NOT NULL DEFAULT 0,
    total_bloqueadas    INTEGER NOT NULL DEFAULT 0,
    bloqueadas_by_motivo JSONB NOT NULL DEFAULT '{}'::jsonb,
    triggered_by        TEXT NOT NULL,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_permuta_eleicao_run_status_finished
    ON permuta_eleicao_run (status, finished_at DESC);

CREATE TABLE IF NOT EXISTS permuta_candidata_snapshot (
    id                      BIGSERIAL PRIMARY KEY,
    run_id                  UUID NOT NULL REFERENCES permuta_eleicao_run (id) ON DELETE CASCADE,
    doc_cod                 TEXT NOT NULL,
    fil_cod                 INTEGER,
    pri_cod                 TEXT NOT NULL,
    status                  TEXT NOT NULL CHECK (status IN ('elegivel', 'bloqueada')),
    motivo_bloqueio         TEXT,
    aging_days              INTEGER,             -- NULL = ⏸ GATED-P0-4 (pendente)
    invoice_doc_cod         TEXT,
    variacao_classificacao  TEXT,
    variacao_resultado      NUMERIC,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permuta_candidata_snapshot_run
    ON permuta_candidata_snapshot (run_id);
