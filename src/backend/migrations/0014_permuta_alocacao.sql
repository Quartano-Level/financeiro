-- 0014_permuta_alocacao.sql
-- Alocação manual N:M cross-process (Fase 2 — permuta múltipla manual). O analista,
-- a partir de um adiantamento `permuta-manual`, casa-o com invoices de QUALQUER
-- processo (links livres) distribuindo valores parciais. Rascunho editável; a
-- baixa no ERP (fin010) é a Fase 3. Esta tabela SOBREVIVE à re-ingestão (≠
-- permuta_casamento, que é recomputada por run) — por isso NÃO referencia
-- permuta_eleicao_run nem é tocada pela ingestão.
--
-- Invariantes (validados em serviço): Σ(valor_alocado por adto) ≤ saldo a permutar
-- do adto; Σ(valor_alocado por invoice) ≤ valor em aberto da invoice. Valor em
-- moeda NEGOCIADA (USD), como o modal de casamento manual. SQL idempotente.
CREATE TABLE IF NOT EXISTS permuta_alocacao (
    id                      BIGSERIAL PRIMARY KEY,
    adiantamento_doc_cod    TEXT NOT NULL,
    invoice_doc_cod         TEXT NOT NULL,
    invoice_pri_cod         TEXT,
    valor_alocado           NUMERIC NOT NULL,
    moeda                   TEXT,
    variacao_classificacao  TEXT,
    variacao_resultado      NUMERIC,
    variacao_delta          NUMERIC,
    taxa_adiantamento       NUMERIC,
    taxa_invoice            NUMERIC,
    criado_por              TEXT,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    observacao              TEXT,
    UNIQUE (adiantamento_doc_cod, invoice_doc_cod)
);

CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_adto
    ON permuta_alocacao (adiantamento_doc_cod);
CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_invoice
    ON permuta_alocacao (invoice_doc_cod);
