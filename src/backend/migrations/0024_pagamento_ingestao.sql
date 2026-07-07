-- 0024_pagamento_ingestao.sql
-- SISPAG — Ingestão de Pagamentos (carteira persistida + cadência diária).
-- Espelha o modelo de Permutas (permuta_eleicao_run + relacional): a ingestão (cron ou manual)
-- lê os títulos a pagar do Conexos e persiste os DADOS BÁSICOS aqui; o DETALHE de remessa
-- (banco/conta/modalidade/barras/PIX/CNPJ) é lido AO VIVO só no envio (Fatia 3, anti-drift).
-- SQL idempotente.

-- Run de auditoria da ingestão (quem/quando/status/contagens). ADR-0016.
CREATE TABLE IF NOT EXISTS pagamento_ingestao_run (
    id                  UUID PRIMARY KEY,
    flow_id             TEXT,
    -- 'cron' | 'manual' | <usuário> — origem do disparo.
    triggered_by        TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'success', 'error')),
    total_titulos       INTEGER NOT NULL DEFAULT 0,
    total_inativados    INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pagamento_ingestao_run_finished
    ON pagamento_ingestao_run (finished_at DESC);

-- Idempotência da ingestão manual por Idempotency-Key (TTL lógico via started_at).
CREATE TABLE IF NOT EXISTS pagamento_ingestao_idempotency (
    idempotency_key     TEXT PRIMARY KEY,
    run_id              UUID NOT NULL,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Carteira de títulos a pagar (DADOS BÁSICOS — sem o detalhe pesado de remessa).
-- Chave natural = (fil_cod, doc_cod, tit_cod). UPSERT a cada ingestão.
CREATE TABLE IF NOT EXISTS titulo_a_pagar (
    fil_cod                 INTEGER NOT NULL,
    doc_cod                 TEXT NOT NULL,
    tit_cod                 TEXT NOT NULL,
    credor                  TEXT,
    pes_cod                 TEXT,
    valor                   NUMERIC,
    moeda                   TEXT,
    vencimento              TIMESTAMPTZ,
    -- aprovado = liberado por alçada (titVld1/2/3libera); pago = vldPago.
    aprovado                BOOLEAN NOT NULL DEFAULT FALSE,
    pago                    BOOLEAN NOT NULL DEFAULT FALSE,
    banco                   TEXT,
    num_remessa             TEXT,
    tpd_cod                 TEXT,
    -- flag INFORMATIVO (heurística da ingestão): tem modalidade + destino (banco/conta, barras
    -- ou PIX)? A validação AUTORITATIVA acontece no envio, ao vivo. Ver ADR-0016.
    pronto_para_remessa     BOOLEAN NOT NULL DEFAULT FALSE,
    -- anti-fantasma: título que some da run mais recente vira inativo (some do painel).
    ativo                   BOOLEAN NOT NULL DEFAULT TRUE,
    ingestao_run_id         UUID,
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fil_cod, doc_cod, tit_cod)
);

CREATE INDEX IF NOT EXISTS idx_titulo_a_pagar_ativo_venc
    ON titulo_a_pagar (ativo, vencimento);
CREATE INDEX IF NOT EXISTS idx_titulo_a_pagar_run
    ON titulo_a_pagar (ingestao_run_id);
