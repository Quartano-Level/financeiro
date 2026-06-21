-- 0013_cliente_filtro.sql
-- Cadastro de "cliente filtro" (Fase 1): importadores cujos adiantamentos sempre
-- caem em permuta MANUAL cross-process (não há invoice no próprio processo). O
-- analista mantém essa lista no frontend; a pipeline roteia os adtos desses
-- importadores ao estado `permuta-manual`. PK = pes_cod (chave natural Conexos),
-- p/ o CRUD ser idempotente (UPSERT). SQL idempotente (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS cliente_filtro (
    pes_cod         TEXT PRIMARY KEY,
    importador      TEXT,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por      TEXT,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_filtro_ativo ON cliente_filtro (ativo);
