import 'reflect-metadata';
import { Router } from 'express';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import ConexosSessionResolver from '../domain/client/ConexosSessionResolver.js';
import { asyncHandler } from '../http/asyncHandler.js';

/**
 * Rotas do PRÓPRIO usuário autenticado (não-admin). Montado após o middleware de
 * auth. Hoje expõe só o status do vínculo Conexos, consumido pelo front logo após
 * o login para avisar quando o usuário está operando via robô (Fatia B).
 */
const router = Router();

// GET /me/conexos-status — { status: 'ok' | 'falha' | 'ausente' }.
//   ok      = a credencial Conexos do usuário logou (execuções saem no nome dele);
//   falha   = tem vínculo, mas a credencial não logou → opera via robô (avisar!);
//   ausente = sem vínculo → opera via robô (normal, sem alarde).
router.get(
    '/conexos-status',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const resolver = container.resolve(ConexosSessionResolver);
        const username = req.user?.sub;
        const status = username ? await resolver.testarVinculo(username) : 'ausente';
        res.json({ status });
    }),
);

export default router;
