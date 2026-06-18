import 'reflect-metadata';
import { Router } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import { PROCESSAMENTO_STATUS } from '../domain/interface/permutas/Processamento.js';
import PermutaProcessamentoRepository from '../domain/repository/permutas/PermutaProcessamentoRepository.js';
import EleicaoPermutasService from '../domain/service/permutas/EleicaoPermutasService.js';
import GestaoPermutasService from '../domain/service/permutas/GestaoPermutasService.js';
import PainelService from '../domain/service/permutas/PainelService.js';
import { asyncHandler } from '../http/asyncHandler.js';

/** Zod no boundary — corpo do POST /processar (Rule: validar inputs externos). */
const processarBodySchema = z.object({
    invoiceDocCod: z.string().trim().min(1).optional(),
    observacao: z.string().trim().min(1).optional(),
});

/**
 * Permutas Frente I — Fatia 1 (painel de pendências elegíveis, READ-ONLY).
 *
 * Segue o padrão de `routes/conexos.ts`: resolve services do container tsyringe
 * (nunca `new`), `bootstrapAppContainer()` no início. READ-ONLY no ERP — a única
 * escrita é o snapshot próprio em Postgres.
 *
 * NOTA (O4): EventBridge/cron diário é DÍVIDA DO ALVO. Esta rota
 * `POST /permutas/eleicao` é o trigger PROVISÓRIO (manual) enquanto o Express
 * puro não tem job runner. Ver migration-debt O4.
 */
const router = Router();

// POST /permutas/eleicao — dispara a eleição (job manual). Protegida pela auth
// middleware global + heavyRouteLimiter (fan-out Conexos pesado).
router.post(
    '/eleicao',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(EleicaoPermutasService);
        // `triggered_by` = identidade do usuário autenticado (auditoria O6).
        const triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown';
        // Idempotency-Key (P0-6) — duplo-clique/retry com a mesma key reaproveita
        // a run existente em vez de disparar outro fan-out Conexos.
        const rawKey = req.header('Idempotency-Key');
        const idempotencyKey =
            typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : undefined;
        const result = await service.executar({
            triggeredBy,
            ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        });
        res.json({
            runId: result.runId,
            totalCandidatas: result.totalCandidatas,
            totalElegiveis: result.totalElegiveis,
            totalBloqueadas: result.totalBloqueadas,
            status: result.status,
        });
    }),
);

// GET /permutas/gestao — lê o modelo relacional (Fase B). READ-ONLY. É o
// endpoint que o frontend (`fetchGestaoPermutas`) já consome com fallback ao
// fixture quando o backend não responde.
router.get(
    '/gestao',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(GestaoPermutasService);
        const gestao = await service.exporGestao(req.requestId);
        res.json(gestao);
    }),
);

// POST /permutas/adiantamentos/:docCod/processar — registra o estado do analista
// (botão "Processar"). UPSERT status='processado'; sobrevive à re-ingestão.
router.post(
    '/adiantamentos/:docCod/processar',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = processarBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
            return;
        }
        const docCod = String(req.params.docCod);
        const processadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const repository = container.resolve(PermutaProcessamentoRepository);
        await repository.upsertProcessamento({
            adiantamentoDocCod: docCod,
            status: PROCESSAMENTO_STATUS.PROCESSADO,
            processadoPor,
            ...(parsed.data.invoiceDocCod !== undefined
                ? { invoiceDocCod: parsed.data.invoiceDocCod }
                : {}),
            ...(parsed.data.observacao !== undefined ? { observacao: parsed.data.observacao } : {}),
        });
        res.json({ adiantamentoDocCod: docCod, status: PROCESSAMENTO_STATUS.PROCESSADO });
    }),
);

// GET /permutas/painel — lê o último snapshot (READ-ONLY). Sem ação de execução.
router.get(
    '/painel',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(PainelService);
        const painel = await service.exporNoPainel(req.requestId);
        res.json(painel);
    }),
);

export default router;
