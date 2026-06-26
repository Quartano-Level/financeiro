-- 0020_permuta_bordero_filial_pk.sql
-- BUG (Regis investigação 2026-06-26): o número do borderô no Conexos é POR FILIAL — cada filial
-- numera os seus. A PK de `permuta_bordero` era só `bor_cod`, então borderôs de filiais diferentes com
-- o MESMO número COLIDIAM no cache (um sobrescrevia o outro no refresh/upsert) e sumiam da aba Borderôs.
-- Caso real: borderô 1824 existe na filial 1 (adto 3569) E na filial 4 — o da filial 1 sumia.
-- As faixas de número se sobrepõem muito entre filiais (1/4/5/7), então a perda era ampla.
--
-- Correção: chave = (fil_cod, bor_cod). Os dados existentes têm bor_cod único (PK antiga), logo
-- (fil_cod, bor_cod) também é único → a troca de PK não conflita. O próximo refreshCache repovoa os
-- borderôs que tinham sido perdidos pela colisão.
ALTER TABLE permuta_bordero DROP CONSTRAINT IF EXISTS permuta_bordero_pkey;
ALTER TABLE permuta_bordero ADD CONSTRAINT permuta_bordero_pkey PRIMARY KEY (fil_cod, bor_cod);
