import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';

/** Linha de `app_user` mapeada para o domínio (camelCase). */
export interface AppUser {
    id: number;
    username: string;
    passwordHash: string;
    role: string;
}

/**
 * UserRepository — acesso à tabela `app_user` (login simples usuário/senha).
 *
 * SQL 100% parametrizado (`$nome` via SqlBuilder — Rule #5, zero interpolação).
 */
@injectable()
export default class UserRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    /** Busca um usuário pelo `username`. `null` quando não existe. */
    public findByUsername = async (username: string): Promise<AppUser | null> => {
        const row = await this.databaseClient.selectFirst<{
            id: number;
            username: string;
            password_hash: string;
            role: string;
        }>(
            `SELECT id, username, password_hash, role
             FROM app_user
             WHERE username = $username`,
            { username },
        );
        if (!row) return null;
        return {
            id: Number(row.id),
            username: String(row.username),
            passwordHash: String(row.password_hash),
            role: String(row.role),
        };
    };

    /**
     * Cria ou atualiza o usuário admin (seed). UPSERT por `username` —
     * `ON CONFLICT DO UPDATE` atualiza o hash/role para re-seed idempotente.
     */
    public upsertAdmin = async (
        username: string,
        passwordHash: string,
        role: string,
    ): Promise<void> => {
        await this.databaseClient.insert(
            `INSERT INTO app_user (username, password_hash, role)
             VALUES ($username, $passwordHash, $role)
             ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role`,
            { username, passwordHash, role },
        );
    };
}
