-- 0007_app_user — tabela de usuários para o login simples (usuário/senha).
-- Substitui o auth Supabase: o backend assina seu próprio JWT HS256 após
-- validar a senha (bcrypt) contra esta tabela. Idempotente (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
