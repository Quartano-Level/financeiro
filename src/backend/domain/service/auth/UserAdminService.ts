import bcrypt from 'bcryptjs';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import SecretCipher from '../../libs/crypto/SecretCipher.js';
import UserRepository, { type AppUserPublic } from '../../repository/auth/UserRepository.js';

/** Custo do bcrypt — espelha o `seed-admin` (BCRYPT_ROUNDS = 12). */
const BCRYPT_ROUNDS = 12;

/** Papéis válidos na plataforma. `admin` gere usuários; `operador` só opera. */
export const USER_ROLES = ['admin', 'operador'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Vínculo Conexos no boundary: login + senha em CLARO (o service cifra). Ambos
 * juntos, ou nenhum. `conexosPassword` vazio no PATCH = manter a senha atual.
 */
export const vinculoConexosSchema = z.object({
    conexosUsername: z.string().trim().min(1),
    conexosPassword: z.string().min(1),
});

/** Zod no boundary — criação de usuário (email + senha + papel + vínculo opcional). */
export const createUserSchema = z.object({
    username: z.string().trim().toLowerCase().email('email inválido'),
    password: z.string().min(8, 'a senha deve ter ao menos 8 caracteres'),
    role: z.enum(USER_ROLES).default('operador'),
    conexosUsername: z.string().trim().min(1).optional(),
    conexosPassword: z.string().min(1).optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Zod no boundary — redefinição de senha. */
export const resetPasswordSchema = z.object({
    password: z.string().min(8, 'a senha deve ter ao menos 8 caracteres'),
});

/**
 * UserAdminService — gestão de usuários da plataforma (Fatia A).
 *
 * Encapsula as regras de cadastro: valida o input (Zod), gera o hash bcrypt da
 * senha (nunca guarda a senha em claro) e delega a persistência ao
 * `UserRepository`. A AUTORIZAÇÃO (só admin) é feita no route (guard de papel);
 * este service assume que o chamador já foi autorizado.
 */
@injectable()
export default class UserAdminService {
    constructor(
        @inject(UserRepository)
        private userRepository: UserRepository,
        @inject(SecretCipher)
        private secretCipher: SecretCipher,
    ) {}

    /** Lista todos os usuários (sem hash de senha). */
    public list = async (): Promise<AppUserPublic[]> => this.userRepository.listAll();

    /**
     * Cria um usuário. `createdBy` = username do admin (auditoria). Se o input
     * trouxer `conexosUsername` + `conexosPassword`, grava o vínculo Conexos já
     * na criação (senha cifrada). Ambos juntos, ou nenhum.
     */
    public create = async (input: CreateUserInput, createdBy?: string): Promise<AppUserPublic> => {
        const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
        const created = await this.userRepository.create({
            username: input.username,
            passwordHash,
            role: input.role,
            ...(createdBy !== undefined ? { createdBy } : {}),
        });
        if (input.conexosUsername && input.conexosPassword) {
            await this.setVinculo(created.id, {
                conexosUsername: input.conexosUsername,
                conexosPassword: input.conexosPassword,
            });
            return { ...created, conexosUsername: input.conexosUsername };
        }
        return created;
    };

    /**
     * Define (ou limpa, com `vinculo=null`) o vínculo Conexos de um usuário. A
     * senha é CIFRADA (AES-GCM) antes de persistir — nunca em claro. Lança se a
     * chave de cripto não estiver configurada (`MissingEncryptionKeyError`) ou o
     * id não existir.
     */
    public setVinculo = async (
        id: number,
        vinculo: { conexosUsername: string; conexosPassword: string } | null,
    ): Promise<void> => {
        if (vinculo === null) {
            const ok = await this.userRepository.setVinculoConexos(id, null);
            if (!ok) throw new Error(`NOT_FOUND: user ${id} not found`);
            return;
        }
        const conexosPasswordEnc = await this.secretCipher.encrypt(vinculo.conexosPassword);
        const ok = await this.userRepository.setVinculoConexos(id, {
            conexosUsername: vinculo.conexosUsername,
            conexosPasswordEnc,
        });
        if (!ok) throw new Error(`NOT_FOUND: user ${id} not found`);
    };

    /** True quando a cripto está configurada (habilita o cadastro de vínculo na UI). */
    public vinculoDisponivel = async (): Promise<boolean> => this.secretCipher.isEnabled();

    /** Ativa/desativa o acesso de um usuário. Lança se o id não existir. */
    public setAtivo = async (id: number, ativo: boolean): Promise<void> => {
        const ok = await this.userRepository.setAtivo(id, ativo);
        if (!ok) throw new Error(`NOT_FOUND: user ${id} not found`);
    };

    /** Redefine a senha de um usuário. Lança se o id não existir. */
    public resetPassword = async (id: number, password: string): Promise<void> => {
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const ok = await this.userRepository.updatePassword(id, passwordHash);
        if (!ok) throw new Error(`NOT_FOUND: user ${id} not found`);
    };
}
