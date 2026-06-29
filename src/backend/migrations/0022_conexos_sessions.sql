-- 0022_conexos_sessions — shared Conexos ERP session (sid) store.
-- Portado do projeto fechamento-processos (Task 10 / CC-3). Cada processo
-- (Render, dev server, scripts) rodava seu próprio POST /login, brigando pelos
-- ~3 slots de MAX_SESSIONS da conta Conexos e disparando kill-oldest em cascata.
-- Esta tabela guarda UM sid compartilhado por chave lógica; escritores usam
-- concorrência otimista (coluna version) para que dois processos nunca mantenham
-- dois logins concorrentes — o perdedor da corrida re-lê e adota o sid vencedor.
--
-- Acesso: SOMENTE pela conexão direta do backend (role dona da tabela). RLS é
-- habilitada SEM policies, então clientes anon/authenticated do PostgREST nunca
-- leem o sid (é uma credencial viva do ERP). O backend (dono da tabela) ignora
-- RLS por padrão (sem FORCE), então continua lendo/escrevendo normalmente.
CREATE TABLE IF NOT EXISTS conexos_sessions (
    -- Chave lógica — uma linha por conta/tenant Conexos. Default do backend: 'columbia-default'.
    key TEXT PRIMARY KEY,
    sid TEXT NOT NULL,
    -- usnCod capturado da resposta do /login (necessário para o header cnx-usncod).
    usn_cod TEXT,
    -- Payload do /login (filiais + filCodDefault) para quem adota o sid servir
    -- getFiliais()/getFilCodDefault() sem novo login.
    login_payload JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Concorrência otimista: UPDATE ... WHERE version = expected.
    version INTEGER NOT NULL DEFAULT 1,
    -- Metadado de debug: qual processo gravou este sid.
    holder TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conexos_sessions ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: só o dono da tabela (conexão direta do backend)
-- lê/escreve. O sid é credencial viva do ERP.
