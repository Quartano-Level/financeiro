import { injectable, singleton } from 'tsyringe';
import { ConexosService, conexosService } from '../../services/conexos.js';
import { conexosSessionStore } from '../../services/conexosSessionStore.js';

/** Prefixo da chave lógica de sessão por usuário Conexos (uma linha por login). */
const USER_KEY_PREFIX = 'columbia:user:';

/**
 * ConexosSessionRegistry — fabrica sessões Conexos (Fatia B).
 *
 * `robot()` devolve a sessão compartilhada do robô (o singleton histórico).
 * `forUser()` cria uma `ConexosService` com as credenciais do usuário vinculado
 * e um store derivado (`columbia:user:<login>`), de modo que o `sid` de cada
 * usuário seja compartilhado entre processos pela sua própria chave — cada
 * usuário Conexos tem os seus ~3 slots de MAX_SESSIONS, sem brigar com os outros.
 *
 * NÃO cacheia instâncias: o `sid` já é compartilhado pelo store (por chave), então
 * uma instância nova apenas ADOTA o sid vigente sem novo login — e a senha usada
 * é sempre a atual (decifrada na hora), evitando cache de credencial obsoleta.
 */
@singleton()
@injectable()
export default class ConexosSessionRegistry {
    /** A sessão do robô (acesso compartilhado) — o comportamento histórico. */
    public robot = (): ConexosService => conexosService;

    /** Sessão para um usuário Conexos vinculado (credenciais dele + chave própria). */
    public forUser = (conexosUsername: string, plainPassword: string): ConexosService =>
        new ConexosService({
            username: conexosUsername,
            password: plainPassword,
            sessionStore: conexosSessionStore.withKey(`${USER_KEY_PREFIX}${conexosUsername}`),
        });
}
