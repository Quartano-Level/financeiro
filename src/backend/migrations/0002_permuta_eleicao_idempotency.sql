-- Migration 0002 — Idempotência da eleição de permutas (P0-6).
-- Evita que um duplo-clique / retry do trigger `POST /permutas/eleicao` dispare
-- DOIS fan-outs Conexos e grave DOIS cabeçalhos `success` no mesmo segundo.
--
-- Uma `Idempotency-Key` (header) mapeia para a run que ela produziu. Um segundo
-- request com a MESMA key (dentro do TTL de 24h) retorna a run existente em vez
-- de re-executar. SQL idempotente (`IF NOT EXISTS`) — re-rodar é seguro.

CREATE TABLE IF NOT EXISTS permuta_eleicao_idempotency (
    idempotency_key  TEXT PRIMARY KEY,
    run_id           UUID NOT NULL REFERENCES permuta_eleicao_run (id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suporte à varredura por TTL (24h): keys mais antigas que a janela podem ser
-- reaproveitadas/limpas. A expiração é aplicada na leitura (created_at > now()-24h).
CREATE INDEX IF NOT EXISTS idx_permuta_eleicao_idempotency_created
    ON permuta_eleicao_idempotency (created_at);
