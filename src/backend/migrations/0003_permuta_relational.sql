-- Migration 0003 — Permutas Fase B: modelo relacional (fatos + casamento auto).
-- Fase A servia a tela com fixture/snapshot (`/painel`); a Fase B persiste os
-- FATOS (adiantamentos, invoices, declarações) e o CASAMENTO automático 1:1,
-- alimentados pela ingestão diária (`IngestaoPermutasService`). A tela
-- `/gestao` lê deste modelo. Aditivo: o `permuta_candidata_snapshot` (0001)
-- segue existindo para o `/painel` (back-compat PR#2).
--
-- SQL idempotente (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) — re-rodar é
-- seguro. Aplicado em ordem lexicográfica pelo `runMigrations.ts`.

-- A run agora cobre DOIS tipos: a eleição (snapshot, 0001) e a ingestão
-- relacional (Fase B). `kind` discrimina; os totais relacionais ficam aqui.
ALTER TABLE permuta_eleicao_run
    ADD COLUMN IF NOT EXISTS kind                 TEXT NOT NULL DEFAULT 'eleicao'
        CHECK (kind IN ('eleicao', 'ingest'));
ALTER TABLE permuta_eleicao_run
    ADD COLUMN IF NOT EXISTS total_adiantamentos  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE permuta_eleicao_run
    ADD COLUMN IF NOT EXISTS total_invoices       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE permuta_eleicao_run
    ADD COLUMN IF NOT EXISTS total_casamentos     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE permuta_eleicao_run
    ADD COLUMN IF NOT EXISTS total_stale          INTEGER NOT NULL DEFAULT 0;

-- Fato: Adiantamento (PROFORMA). PK = doc_cod (chave natural Conexos), para
-- que o UPSERT-in-place preserve o status do analista (soft-ref em 0004) e o
-- `stale` marque os que sumiram do ERP sem nunca deletar.
CREATE TABLE IF NOT EXISTS permuta_adiantamento (
    doc_cod                 TEXT PRIMARY KEY,
    pri_cod                 TEXT NOT NULL,
    fil_cod                 INTEGER,
    referencia              TEXT,
    exportador              TEXT,
    data_emissao            TIMESTAMPTZ,
    valor                   NUMERIC,
    valor_moeda_negociada   NUMERIC,
    moeda                   TEXT,
    pago                    BOOLEAN NOT NULL DEFAULT FALSE,
    valor_permutar          NUMERIC,
    estado_elegibilidade    TEXT NOT NULL
        CHECK (estado_elegibilidade IN ('descoberta', 'elegivel', 'bloqueada')),
    motivo_bloqueio         TEXT,
    aging_days              INTEGER,
    last_ingest_run_id      UUID REFERENCES permuta_eleicao_run (id) ON DELETE SET NULL,
    last_seen_at            TIMESTAMPTZ,
    stale                   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permuta_adiantamento_pri
    ON permuta_adiantamento (pri_cod);
CREATE INDEX IF NOT EXISTS idx_permuta_adiantamento_fil_estado_ativo
    ON permuta_adiantamento (fil_cod, estado_elegibilidade)
    WHERE NOT stale;

-- Fato: Invoice (FINALIZADA). Em aberto = NOT pago.
CREATE TABLE IF NOT EXISTS permuta_invoice (
    doc_cod                 TEXT PRIMARY KEY,
    pri_cod                 TEXT NOT NULL,
    fil_cod                 INTEGER,
    referencia              TEXT,
    exportador              TEXT,
    data_emissao            TIMESTAMPTZ,
    valor                   NUMERIC,
    valor_moeda_negociada   NUMERIC,
    moeda                   TEXT,
    pago                    BOOLEAN NOT NULL DEFAULT FALSE,
    last_ingest_run_id      UUID REFERENCES permuta_eleicao_run (id) ON DELETE SET NULL,
    last_seen_at            TIMESTAMPTZ,
    stale                   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permuta_invoice_pri
    ON permuta_invoice (pri_cod);
CREATE INDEX IF NOT EXISTS idx_permuta_invoice_fil_aberto
    ON permuta_invoice (fil_cod)
    WHERE NOT pago AND NOT stale;

-- Fato: Declaração de importação (D.I XOR DUIMP). PK composto (pri_cod, variante)
-- — um processo pode ter no máximo uma de cada variante (o XOR é regra de
-- negócio avaliada no compute, não constraint).
CREATE TABLE IF NOT EXISTS permuta_declaracao_importacao (
    pri_cod                 TEXT NOT NULL,
    variante                TEXT NOT NULL CHECK (variante IN ('DI', 'DUIMP')),
    data_base               TIMESTAMPTZ,
    last_ingest_run_id      UUID REFERENCES permuta_eleicao_run (id) ON DELETE SET NULL,
    last_seen_at            TIMESTAMPTZ,
    stale                   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pri_cod, variante)
);

CREATE INDEX IF NOT EXISTS idx_permuta_declaracao_pri
    ON permuta_declaracao_importacao (pri_cod);

-- Casamento AUTOMÁTICO 1:1 (recomputado a cada run de ingestão: DELETE + INSERT).
-- FKs ON DELETE CASCADE para os fatos — se um fato é apagado (não acontece na
-- ingestão, que só faz stale), o casamento cai junto. UNIQUE garante 1:1 por par.
CREATE TABLE IF NOT EXISTS permuta_casamento (
    id                      BIGSERIAL PRIMARY KEY,
    invoice_doc_cod         TEXT NOT NULL
        REFERENCES permuta_invoice (doc_cod) ON DELETE CASCADE,
    adiantamento_doc_cod    TEXT NOT NULL
        REFERENCES permuta_adiantamento (doc_cod) ON DELETE CASCADE,
    pri_cod                 TEXT NOT NULL,
    valor_a_ser_usado       NUMERIC,
    moeda                   TEXT,
    variacao_classificacao  TEXT,
    variacao_resultado      NUMERIC,
    variacao_delta          NUMERIC,
    taxa_adiantamento       NUMERIC,
    taxa_invoice            NUMERIC,
    last_ingest_run_id      UUID REFERENCES permuta_eleicao_run (id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (invoice_doc_cod, adiantamento_doc_cod)
);

CREATE INDEX IF NOT EXISTS idx_permuta_casamento_invoice
    ON permuta_casamento (invoice_doc_cod);
CREATE INDEX IF NOT EXISTS idx_permuta_casamento_adiantamento
    ON permuta_casamento (adiantamento_doc_cod);
