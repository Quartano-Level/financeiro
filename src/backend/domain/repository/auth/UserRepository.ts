import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';

/** Linha de `app_user` mapeada para o domínio (camelCase). */
export interface AppUser {
    id: number;
    username: string;
    passwordHash: string;
    role: string;
    ativo: boolean;
}

/** Usuário para exibição/gestão (SEM o hash de senha — nunca sai do backend). */
export interface AppUserPublic {
    id: number;
    username: string;
    role: string;
    ativo: boolean;
    createdBy?: string;
    createdAt: string;
    /** Login Conexos vinculado (ex.: MARILYN_MUTAFCI). Ausente = sem vínculo (opera via robô). */
    conexosUsername?: string;
}

/** Vínculo Conexos do usuário — login + senha CIFRADA (nunca em claro). */
export interface ConexosVinculo {
    conexosUsername: string;
    conexosPasswordEnc: string;
}

/** Erro lançado quando o `username` (email) já existe — o route traduz para 409. */
export class UsernameAlreadyExistsError extends Error {
    constructor(username: string) {
        super(`CONFLICT: user with email ${username} already exists`);
        this.name = 'UsernameAlreadyExistsError';
    }
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
            ativo: boolean;
        }>(
            `SELECT id, username, password_hash, role, ativo
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
            ativo: Boolean(row.ativo),
        };
    };

    /** Lista todos os usuários (sem o hash) — mais recentes primeiro. Gestão pela UI. */
    public listAll = async (): Promise<AppUserPublic[]> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT id, username, role, ativo, created_by, created_at, conexos_username
             FROM app_user
             ORDER BY created_at DESC, id DESC`,
        );
        return rows.map((r) => ({
            id: Number(r.id),
            username: String(r.username),
            role: String(r.role),
            ativo: Boolean(r.ativo),
            ...(r.created_by != null ? { createdBy: String(r.created_by) } : {}),
            createdAt: new Date(r.created_at).toISOString(),
            ...(r.conexos_username != null ? { conexosUsername: String(r.conexos_username) } : {}),
        }));
    };

    /**
     * Cria um novo usuário. Lança `UsernameAlreadyExistsError` se o email já existe
     * (o `ON CONFLICT DO NOTHING` + `RETURNING` devolve zero linhas nesse caso).
     */
    public create = async (input: {
        username: string;
        passwordHash: string;
        role: string;
        createdBy?: string;
    }): Promise<AppUserPublic> => {
        const row = await this.databaseClient.selectFirst<{
            id: number;
            username: string;
            role: string;
            ativo: boolean;
            created_by: string | null;
            created_at: string;
        }>(
            `INSERT INTO app_user (username, password_hash, role, created_by)
             VALUES ($username, $passwordHash, $role, $createdBy)
             ON CONFLICT (username) DO NOTHING
             RETURNING id, username, role, ativo, created_by, created_at`,
            {
                username: input.username,
                passwordHash: input.passwordHash,
                role: input.role,
                createdBy: input.createdBy ?? null,
            },
        );
        if (!row) throw new UsernameAlreadyExistsError(input.username);
        return {
            id: Number(row.id),
            username: String(row.username),
            role: String(row.role),
            ativo: Boolean(row.ativo),
            ...(row.created_by != null ? { createdBy: String(row.created_by) } : {}),
            createdAt: new Date(row.created_at).toISOString(),
        };
    };

    /** Ativa/desativa o acesso de um usuário (soft-disable). Retorna false se o id não existe. */
    public setAtivo = async (id: number, ativo: boolean): Promise<boolean> => {
        const affected = await this.databaseClient.update(
            `UPDATE app_user SET ativo = $ativo WHERE id = $id`,
            { id, ativo },
        );
        return affected > 0;
    };

    /** Redefine a senha (hash) de um usuário. Retorna false se o id não existe. */
    public updatePassword = async (id: number, passwordHash: string): Promise<boolean> => {
        const affected = await this.databaseClient.update(
            `UPDATE app_user SET password_hash = $passwordHash WHERE id = $id`,
            { id, passwordHash },
        );
        return affected > 0;
    };

    /**
     * Vínculo Conexos de um usuário pelo `username` (email da plataforma) — usado
     * pelo resolver de sessão. `null` quando não há vínculo (ambas as colunas
     * preenchidas) ou o usuário está INATIVO (inativo nunca opera no ERP).
     */
    public getVinculoConexos = async (username: string): Promise<ConexosVinculo | null> => {
        const row = await this.databaseClient.selectFirst<{
            conexos_username: string | null;
            conexos_password_enc: string | null;
        }>(
            `SELECT conexos_username, conexos_password_enc
             FROM app_user
             WHERE username = $username AND ativo = true`,
            { username },
        );
        if (!row || row.conexos_username == null || row.conexos_password_enc == null) return null;
        return {
            conexosUsername: String(row.conexos_username),
            conexosPasswordEnc: String(row.conexos_password_enc),
        };
    };

    /**
     * Define (ou limpa, com `vinculo=null`) o vínculo Conexos de um usuário.
     * A senha JÁ chega CIFRADA (o service cifra). Retorna false se o id não existe.
     */
    public setVinculoConexos = async (
        id: number,
        vinculo: ConexosVinculo | null,
    ): Promise<boolean> => {
        const affected = await this.databaseClient.update(
            `UPDATE app_user
             SET conexos_username = $conexosUsername, conexos_password_enc = $conexosPasswordEnc
             WHERE id = $id`,
            {
                id,
                conexosUsername: vinculo?.conexosUsername ?? null,
                conexosPasswordEnc: vinculo?.conexosPasswordEnc ?? null,
            },
        );
        return affected > 0;
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
