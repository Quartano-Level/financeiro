import type { RequestHandler } from 'express';
import { conexosRequestContext } from '../domain/libs/requestContext/ConexosRequestContext.js';

/**
 * Middleware de identidade Conexos (Fatia B) — roda APÓS o auth (já há
 * `req.user`) e envolve o restante da request num `AsyncLocalStorage` com o
 * `platformUsername` (o `sub` do JWT). O resolver de sessão lê esse contexto
 * para usar a sessão Conexos do usuário logado; sem usuário, cai no robô.
 *
 * Precisa envolver a cadeia inteira (via `run(...)` em volta do `next`) para que
 * as chamadas assíncronas ao ERP, lá adiante, ainda enxerguem o contexto.
 */
export const conexosIdentityMiddleware: RequestHandler = (req, _res, next) => {
    const platformUsername = req.user?.sub;
    conexosRequestContext.run(platformUsername ? { platformUsername } : {}, () => next());
};
