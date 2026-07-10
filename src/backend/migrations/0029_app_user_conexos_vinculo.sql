-- 0029_app_user_conexos_vinculo — vínculo do usuário @kavex ao seu acesso Conexos
-- (Fatia B). Quando o usuário loga na plataforma, as chamadas ao Conexos passam a
-- usar ESTE login (a baixa sai no nome dele); sem vínculo, cai no robô.
--   - `conexos_username`: o login do usuário no ERP (ex.: MARILYN_MUTAFCI).
--   - `conexos_password_enc`: a senha do ERP CIFRADA (AES-256-GCM, base64) — segredo
--     REVERSÍVEL, nunca hash (precisa ser reusada no login do Conexos).
-- Ambas NULL ⇒ usuário sem vínculo (opera via robô). Idempotente (IF NOT EXISTS).
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS conexos_username TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS conexos_password_enc TEXT;
