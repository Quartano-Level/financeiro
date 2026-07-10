import { AsyncLocalStorage } from 'node:async_hooks';
import type { ConexosService } from '../../../services/conexos.js';

/**
 * Estado por-request para resolver QUAL sessão Conexos usar (Fatia B). O
 * middleware de identidade popula `platformUsername` (o `sub` do JWT) após a
 * autenticação; o resolver lê aqui e escolhe a sessão do usuário vinculado (ou
 * o robô). `resolved` cacheia a sessão escolhida para a request inteira, para
 * não repetir o lookup/login a cada chamada ao ERP.
 *
 * Fora de uma request (jobs, crons, scripts) o store é `undefined` → o resolver
 * cai no robô, exatamente como antes.
 */
export interface ConexosRequestState {
    platformUsername?: string;
    resolved?: ConexosService;
}

export const conexosRequestContext = new AsyncLocalStorage<ConexosRequestState>();
