-- 0018_permuta_bordero_cache.sql
-- Cache local dos borderôs de permuta do Conexos (fin010 `borVldTipo=2`), para a tela de
-- Borderôs carregar do BANCO (rápido) em vez de bater no ERP a cada abertura. Atualizado pela
-- ingestão e pelo botão "Atualizar" (refresh ao vivo). Guarda os campos crus do ERP; a situação
-- (em cadastro/finalizado/cancelado/estornado) é derivada na leitura.
CREATE TABLE IF NOT EXISTS permuta_bordero (
    bor_cod             INTEGER PRIMARY KEY,
    fil_cod             INTEGER NOT NULL,
    bor_vld_finalizado  INTEGER,
    bor_cod_estornado   INTEGER,
    vlr_total_liquido   NUMERIC,
    bor_dta_mvto        BIGINT,
    usn_des_nome_cad    TEXT,
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);
