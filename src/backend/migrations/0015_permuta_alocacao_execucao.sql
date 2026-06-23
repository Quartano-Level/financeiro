-- 0015_permuta_alocacao_execucao.sql
-- Fase 3 (risco arquitetural #1) — auditoria/idempotência da BAIXA efetiva no ERP (`fin010`).
-- A alocação (permuta_alocacao) é o rascunho READ-ONLY; ESTA tabela registra cada tentativa de
-- EXECUÇÃO da baixa/permuta no Conexos. Write-ahead: a intenção é gravada (status='reconciling')
-- ANTES do POST; vira 'settled' só após a confirmação (bxa_cod_seq) do ERP; em falha vira 'error'
-- com a resposta crua, para reconciliação manual. SQL idempotente.
--
-- Idempotência: `idempotency_key` é UNIQUE — uma re-execução com a mesma chave NÃO cria novo
-- borderô nem nova baixa (curto-circuita para a linha existente). Granularidade = par adto↔invoice
-- (espelha a UNIQUE de permuta_alocacao).
CREATE TABLE IF NOT EXISTS permuta_alocacao_execucao (
    id                      BIGSERIAL PRIMARY KEY,
    idempotency_key         TEXT NOT NULL,
    adiantamento_doc_cod    TEXT NOT NULL,
    invoice_doc_cod         TEXT NOT NULL,
    fil_cod                 INTEGER NOT NULL,
    -- pending: criada mas ainda não iniciada | reconciling: write-ahead, POST em voo
    -- settled: confirmada pelo ERP (bxa_cod_seq) | error: falhou (ver erp_response)
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'reconciling', 'settled', 'error')),
    -- TRUE quando a execução rodou em dry-run (montou/logou o payload, sem POST real).
    dry_run                 BOOLEAN NOT NULL DEFAULT TRUE,
    bor_cod                 BIGINT,
    bxa_cod_seq             BIGINT,
    valor_baixado           NUMERIC,
    juros                   NUMERIC,
    conta_juros             INTEGER,
    -- payload enviado (redigido) + resposta do ERP (ou erro) — trilha de auditoria.
    request_payload         JSONB,
    erp_response            JSONB,
    erro_mensagem           TEXT,
    executado_por           TEXT,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_adto
    ON permuta_alocacao_execucao (adiantamento_doc_cod);
CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_status
    ON permuta_alocacao_execucao (status);
