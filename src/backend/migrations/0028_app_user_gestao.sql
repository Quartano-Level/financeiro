-- 0028_app_user_gestao — suporte à gestão de usuários pela plataforma (Fatia A).
-- Até aqui os usuários @kavex eram criados manualmente (INSERT/seed). Esta migration
-- adiciona os campos necessários para gerir usuários pela UI:
--   - `ativo`: desativa o acesso sem apagar a linha (soft-disable). O login recusa
--     usuários inativos; a trilha de auditoria (executado_por) permanece íntegra.
--   - `created_by`: quem cadastrou o usuário (username do admin), para auditoria.
-- Idempotente (IF NOT EXISTS). Usuários existentes ficam ativos por default.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS created_by TEXT;
