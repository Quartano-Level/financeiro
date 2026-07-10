import { inject, injectable, singleton } from 'tsyringe';
import type { ConexosService } from '../../services/conexos.js';
import SecretCipher from '../libs/crypto/SecretCipher.js';
import { conexosRequestContext } from '../libs/requestContext/ConexosRequestContext.js';
import UserRepository from '../repository/auth/UserRepository.js';
import ConexosSessionRegistry from './ConexosSessionRegistry.js';

/** Resultado do teste explícito de credencial (usado no aviso do login). */
export type VinculoStatus = 'ok' | 'falha' | 'ausente';

/**
 * ConexosSessionResolver — decide, POR REQUEST, qual sessão Conexos usar (Fatia B).
 *
 * Regra: se a request é de um usuário logado COM vínculo Conexos válido, usa a
 * sessão dele (a baixa sai no nome dele); senão, cai no ROBÔ. Casos de fallback:
 *   - sem request (job/cron) ou sem usuário no contexto → robô;
 *   - usuário sem vínculo → robô;
 *   - senha não decifra (chave trocada/corrompida) → robô;
 *   - login Conexos do usuário falha (credencial inválida/expirada) → robô.
 * O aviso ao usuário de que ele está operando via robô é dado no LOGIN
 * (`testarVinculo`), não a cada chamada — em runtime o fallback é silencioso.
 *
 * A sessão resolvida é cacheada no contexto da request (`resolved`) para não
 * repetir lookup+login a cada chamada ao ERP dentro da mesma request.
 */
@singleton()
@injectable()
export default class ConexosSessionResolver {
    constructor(
        @inject(UserRepository) private userRepository: UserRepository,
        @inject(SecretCipher) private secretCipher: SecretCipher,
        @inject(ConexosSessionRegistry) private registry: ConexosSessionRegistry,
    ) {}

    /** Resolve a sessão Conexos ativa para a request corrente (robô fora de request). */
    public resolve = async (): Promise<ConexosService> => {
        const state = conexosRequestContext.getStore();
        if (!state?.platformUsername) return this.registry.robot();
        if (state.resolved) return state.resolved;
        const service = await this.resolveForUser(state.platformUsername);
        state.resolved = service;
        return service;
    };

    /**
     * Testa EXPLICITAMENTE a credencial Conexos de um usuário (usado no login p/
     * o aviso). `ausente` = sem vínculo; `ok`/`falha` = login de teste no ERP.
     * Nunca lança — qualquer erro vira `falha`.
     */
    public testarVinculo = async (platformUsername: string): Promise<VinculoStatus> => {
        const vinculo = await this.userRepository.getVinculoConexos(platformUsername);
        if (!vinculo) return 'ausente';
        try {
            const password = await this.secretCipher.decrypt(vinculo.conexosPasswordEnc);
            const service = this.registry.forUser(vinculo.conexosUsername, password);
            await service.ensureSid();
            return 'ok';
        } catch {
            return 'falha';
        }
    };

    /** Resolve a sessão do usuário; qualquer falha degrada para o robô. */
    private resolveForUser = async (platformUsername: string): Promise<ConexosService> => {
        const vinculo = await this.userRepository.getVinculoConexos(platformUsername);
        if (!vinculo) return this.registry.robot();
        let password: string;
        try {
            password = await this.secretCipher.decrypt(vinculo.conexosPasswordEnc);
        } catch {
            return this.registry.robot();
        }
        const service = this.registry.forUser(vinculo.conexosUsername, password);
        try {
            await service.ensureSid();
            return service;
        } catch {
            return this.registry.robot();
        }
    };
}
