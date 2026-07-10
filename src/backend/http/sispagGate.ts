import type { RequestHandler } from 'express';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import EnvironmentProvider from '../domain/libs/environment/EnvironmentProvider.js';
import { asyncHandler } from './asyncHandler.js';

/**
 * Bloqueio do SISPAG (Frente II) via URL. Quando `sispagEnabled` é false
 * (produção, por padrão), qualquer `/sispag/*` responde 403 — o backend nega o
 * acesso direto à API, não só o frontend. Habilitado fora de produção para o
 * desenvolvimento seguir. Ver `EnvironmentProvider.resolveSispagEnabled`.
 */
export const sispagGate: RequestHandler = asyncHandler(async (_req, res, next) => {
    await bootstrapAppContainer();
    const env = await container.resolve(EnvironmentProvider).getEnvironmentVars();
    if (!env.sispagEnabled) {
        res.status(403).json({ error: 'SISPAG indisponível.' });
        return;
    }
    next();
});
