-- 0023_lote_pagamento.sql
-- Escopo II (SISPAG) — Fatia 2: LOTE CANDIDATO local (montagem assistida + gate de finalização).
-- ADR-0015. Estado LOCAL/persistido — NÃO toca o ERP (I1). A analista monta o lote (inclui/remove
-- títulos a pagar aprovados) e o finaliza (gate). O processamento real (remessa/pasta/Nexxera/baixa)
-- é a PRÓXIMA feature; aqui `FINALIZADO` é só o gatilho conceitual. SQL idempotente.
--
-- Agregado: lote_pagamento (raiz) 1—N lote_pagamento_item (membro). Invariantes na fronteira do
-- agregado (service): I2 (só título liberado+não-pago), I3 (título não em 2 lotes RASCUNHO),
-- I4 (uma filial por lote). `versao` = optimistic lock (I6). `status` = constantes tipadas.
CREATE TABLE IF NOT EXISTS lote_pagamento (
    id                  UUID PRIMARY KEY,
    fil_cod             INTEGER NOT NULL,
    -- banco/conta: metadado opcional nesta fatia (agrupamento é por filial, ADR-0015).
    banco               TEXT,
    conta               TEXT,
    -- RASCUNHO: em montagem | FINALIZADO: gate aplicado (pronto p/ processar) | CANCELADO: descartado.
    status              TEXT NOT NULL DEFAULT 'RASCUNHO'
                        CHECK (status IN ('RASCUNHO', 'FINALIZADO', 'CANCELADO')),
    criado_por          TEXT NOT NULL,
    finalizado_por      TEXT,
    finalizado_em       TIMESTAMPTZ,
    -- optimistic concurrency (I6 — 2 analistas). Incrementa a cada transição.
    versao              INTEGER NOT NULL DEFAULT 1,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lote_pagamento_item (
    id                  BIGSERIAL PRIMARY KEY,
    lote_id             UUID NOT NULL REFERENCES lote_pagamento(id) ON DELETE CASCADE,
    fil_cod             INTEGER NOT NULL,
    doc_cod             TEXT NOT NULL,
    tit_cod             TEXT NOT NULL,
    -- snapshot no momento da inclusão (estabilidade da tela + auditoria); o valor autoritativo
    -- p/ o pagamento real volta do ERP na fatia de escrita (anti-drift, doutrina de Permutas).
    credor              TEXT,
    valor               NUMERIC,
    vencimento          TIMESTAMPTZ,
    incluido_por        TEXT NOT NULL,
    incluido_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- não repetir o mesmo título dentro do MESMO lote.
    UNIQUE (lote_id, fil_cod, doc_cod, tit_cod)
);

-- Apoio ao I3 (título não pode estar em 2 lotes RASCUNHO): busca por identidade do título.
-- A unicidade entre lotes RASCUNHO é garantida no serviço (transação + advisory lock), pois o
-- `status` vive na raiz (lote), não no item — um UNIQUE parcial exigiria denormalizar o status.
CREATE INDEX IF NOT EXISTS idx_lote_pagamento_item_titulo
    ON lote_pagamento_item (fil_cod, doc_cod, tit_cod);

CREATE INDEX IF NOT EXISTS idx_lote_pagamento_status
    ON lote_pagamento (status);
