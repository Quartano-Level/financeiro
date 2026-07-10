import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { inject, injectable } from 'tsyringe';
import EnvironmentProvider from '../environment/EnvironmentProvider.js';

/** AES-256-GCM: 12-byte IV (nonce) + 16-byte auth tag (padrão GCM). */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const ALGO = 'aes-256-gcm';

/** Lançado quando a chave-mestra não está configurada — o vínculo Conexos exige. */
export class MissingEncryptionKeyError extends Error {
    constructor() {
        super(
            'CONEXOS_CRED_ENC_KEY is not configured — cannot store Conexos credentials. ' +
                'Set CONEXOS_CRED_ENC_KEY (base64, 32 bytes) in the backend environment.',
        );
        this.name = 'MissingEncryptionKeyError';
    }
}

/**
 * SecretCipher — cifra/decifra segredos REVERSÍVEIS (a senha Conexos de cada
 * usuário) com AES-256-GCM. NÃO é hash: a senha precisa ser reusada no login do
 * ERP, então tem de ser recuperável. A chave-mestra vem do ambiente
 * (`CONEXOS_CRED_ENC_KEY`, base64, 32 bytes) via `EnvironmentProvider`.
 *
 * Formato do texto cifrado (base64 de `iv || tag || ciphertext`): auto-contido,
 * cada cifragem usa um IV aleatório novo (nunca reutiliza nonce).
 */
@injectable()
export default class SecretCipher {
    constructor(
        @inject(EnvironmentProvider)
        private environmentProvider: EnvironmentProvider,
    ) {}

    /** True quando a chave-mestra está configurada (habilita o vínculo Conexos). */
    public isEnabled = async (): Promise<boolean> => {
        const env = await this.environmentProvider.getEnvironmentVars();
        return Boolean(env.conexosCredEncKey);
    };

    /** Cifra `plaintext` → base64 (`iv||tag||ciphertext`). Lança se não houver chave. */
    public encrypt = async (plaintext: string): Promise<string> => {
        const key = await this.resolveKey();
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv(ALGO, key, iv);
        const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, ciphertext]).toString('base64');
    };

    /** Decifra o base64 produzido por `encrypt`. Lança se a chave/tag não conferir. */
    public decrypt = async (payload: string): Promise<string> => {
        const key = await this.resolveKey();
        const raw = Buffer.from(payload, 'base64');
        const iv = raw.subarray(0, IV_BYTES);
        const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
        const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
        const decipher = createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    };

    /** Resolve e valida a chave-mestra (32 bytes) a partir do ambiente. */
    private resolveKey = async (): Promise<Buffer> => {
        const env = await this.environmentProvider.getEnvironmentVars();
        if (!env.conexosCredEncKey) throw new MissingEncryptionKeyError();
        const key = Buffer.from(env.conexosCredEncKey, 'base64');
        if (key.length !== KEY_BYTES) {
            throw new Error(
                `CONEXOS_CRED_ENC_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}) — ` +
                    "generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
            );
        }
        return key;
    };
}
