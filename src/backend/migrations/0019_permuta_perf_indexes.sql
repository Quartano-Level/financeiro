-- 0019_permuta_perf_indexes.sql
-- Índices do hot path de borderôs (Regis-Review P1 performance):
--  - permuta_bordero: a tela lê ORDER BY bor_dta_mvto DESC, bor_cod DESC LIMIT 500.
--  - permuta_alocacao_execucao(bor_cod): listComBordero (WHERE bor_cod IS NOT NULL) + enriquecimento
--    da trilha por borderô + deleteByBorCod. Evita full scan ao crescer a trilha.
CREATE INDEX IF NOT EXISTS idx_permuta_bordero_recentes
    ON permuta_bordero (bor_dta_mvto DESC, bor_cod DESC);

CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_bor_cod
    ON permuta_alocacao_execucao (bor_cod)
    WHERE bor_cod IS NOT NULL;
