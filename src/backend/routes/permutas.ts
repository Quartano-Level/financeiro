import 'reflect-metadata';
import { Router } from 'express';
import { container } from 'tsyringe';
import { z } from 'zod';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import AlocacaoSaldoError from '../domain/errors/AlocacaoSaldoError.js';
import IngestLockBusyError from '../domain/errors/IngestLockBusyError.js';
import { PROCESSAMENTO_STATUS } from '../domain/interface/permutas/Processamento.js';
import AlocacaoPermutasService from '../domain/service/permutas/AlocacaoPermutasService.js';
import ClienteFiltroRepository from '../domain/repository/permutas/ClienteFiltroRepository.js';
import PermutaProcessamentoRepository from '../domain/repository/permutas/PermutaProcessamentoRepository.js';
import PermutaRelationalRepository from '../domain/repository/permutas/PermutaRelationalRepository.js';
import PermutaSnapshotRepository from '../domain/repository/permutas/PermutaSnapshotRepository.js';
import EleicaoPermutasService from '../domain/service/permutas/EleicaoPermutasService.js';
import GestaoPermutasService from '../domain/service/permutas/GestaoPermutasService.js';
import IngestaoCoalescerService from '../domain/service/permutas/IngestaoCoalescerService.js';
import PainelService from '../domain/service/permutas/PainelService.js';
import { asyncHandler } from '../http/asyncHandler.js';
import { requireRole } from '../http/auth.js';
import { heavyRouteLimiter } from '../http/rateLimit.js';

/** Zod no boundary — corpo do POST /processar (Rule: validar inputs externos). */
const processarBodySchema = z.object({
    invoiceDocCod: z.string().trim().min(1).optional(),
    observacao: z.string().trim().min(1).optional(),
});

/** Quantas runs o modal de auditoria mostra por padrão / no máximo. */
const RUNS_DEFAULT_LIMIT = 10;
const RUNS_MAX_LIMIT = 50;

/** Zod no boundary — query `?limit=` do GET /runs (saneado 1..50). */
const runsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(RUNS_MAX_LIMIT).optional(),
});

/** Zod no boundary — corpo do POST /cliente-filtro (cadastro de importador). */
const clienteFiltroBodySchema = z.object({
    pesCod: z.string().trim().min(1),
    importador: z.string().trim().min(1).optional(),
});

/** Zod no boundary — query `?priCod=&filCod=&adtoDocCod=` da busca de invoice
 * (escopada à filial). `adtoDocCod` (opcional) exclui o próprio adiantamento do
 * `jaAlocado` de cada invoice → disponível real da invoice compartilhada (N:M). */
const buscarInvoicesQuerySchema = z.object({
    priCod: z.string().trim().min(1),
    filCod: z.coerce.number().int().positive(),
    adtoDocCod: z.string().trim().min(1).optional(),
});

/** Zod no boundary — corpo do POST /alocacoes (alocação manual N:M). */
const alocacaoBodySchema = z.object({
    invoiceDocCod: z.string().trim().min(1),
    invoicePriCod: z.string().trim().min(1),
    valorAlocado: z.number().positive(),
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
    heavyRouteLimiter,
    requireRole('admin'),
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

// POST /permutas/ingestao — dispara a ingestão MANUAL (ADR-0006). Roda o MESMO
// compute do cron, alimentando o modelo relacional (`/gestao`) + snapshot. Espera
// terminar e devolve os totais (a UI aguarda no modal). `triggered_by` = username
// autenticado (auditoria O6/I5). Passa pelo `IngestaoCoalescerService` (ADR-0012):
// cliques em sequência (cliente-filtro add/remove) coalescem numa rodada +
// rerun-trailing em vez de disparar fan-out redundante / estourar o rate limit.
// Contenção CROSS-instância (cron) ainda lança `IngestLockBusyError` → 409.
router.post(
    '/ingestao',
    heavyRouteLimiter,
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(IngestaoCoalescerService);
        const triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown';
        try {
            const result = await service.request({ triggeredBy });
            res.json({
                runId: result.runId,
                status: result.status,
                totalAdiantamentos: result.totalAdiantamentos,
                totalInvoices: result.totalInvoices,
                totalCasamentos: result.totalCasamentos,
                totalStale: result.totalStale,
            });
        } catch (error) {
            if (error instanceof IngestLockBusyError) {
                res.status(error.statusCode).json({
                    error: error.code,
                    message: error.userMessage,
                });
                return;
            }
            throw error;
        }
    }),
);

// GET /permutas/runs — trilha de auditoria das últimas rodadas (cron + manuais)
// para o modal de ingestão manual (ADR-0006). READ-ONLY.
router.get(
    '/runs',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = runsQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid query', details: parsed.error.flatten() });
            return;
        }
        const limit = parsed.data.limit ?? RUNS_DEFAULT_LIMIT;
        const repository = container.resolve(PermutaSnapshotRepository);
        const runs = await repository.listRecentRuns(limit);
        res.json({ runs });
    }),
);

// GET /permutas/cliente-filtro — lista os clientes-filtro (importadores) ativos.
router.get(
    '/cliente-filtro',
    asyncHandler(async (_req, res) => {
        await bootstrapAppContainer();
        const repository = container.resolve(ClienteFiltroRepository);
        const clientes = await repository.listAtivos();
        res.json({ clientes });
    }),
);

// POST /permutas/cliente-filtro — cadastra/atualiza um cliente-filtro (importador).
// UPSERT por pesCod; `criado_por` = username autenticado (auditoria O6).
router.post(
    '/cliente-filtro',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = clienteFiltroBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
            return;
        }
        const criadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const repository = container.resolve(ClienteFiltroRepository);
        await repository.upsertClienteFiltro({
            pesCod: parsed.data.pesCod,
            ...(parsed.data.importador !== undefined ? { importador: parsed.data.importador } : {}),
            criadoPor,
        });
        res.json({ pesCod: parsed.data.pesCod });
    }),
);

// DELETE /permutas/cliente-filtro/:pesCod — remove um cliente-filtro.
router.delete(
    '/cliente-filtro/:pesCod',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const pesCod = String(req.params.pesCod);
        const repository = container.resolve(ClienteFiltroRepository);
        await repository.deleteByPesCod(pesCod);
        res.json({ pesCod });
    }),
);

// GET /permutas/importadores — importadores distintos do backlog (seletor do
// cadastro de cliente-filtro). READ-ONLY.
router.get(
    '/importadores',
    asyncHandler(async (_req, res) => {
        await bootstrapAppContainer();
        const repository = container.resolve(PermutaRelationalRepository);
        const importadores = await repository.listImportadores();
        res.json({ importadores });
    }),
);

// GET /permutas/invoices/buscar?priCod=&filCod= — busca LIVE invoices de um processo
// NA FILIAL dada (priCod não é único entre filiais), p/ a alocação manual (Fase 2).
// READ-ONLY no ERP.
router.get(
    '/invoices/buscar',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = buscarInvoicesQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid query', details: parsed.error.flatten() });
            return;
        }
        const service = container.resolve(AlocacaoPermutasService);
        const invoices = await service.buscarInvoices(
            parsed.data.priCod,
            parsed.data.filCod,
            parsed.data.adtoDocCod,
        );
        res.json({ invoices });
    }),
);

// POST /permutas/adiantamentos/:docCod/alocacoes — cria/atualiza uma alocação
// manual N:M cross-process (rascunho). 422 quando excede o saldo de algum lado.
router.post(
    '/adiantamentos/:docCod/alocacoes',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = alocacaoBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
            return;
        }
        const criadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(AlocacaoPermutasService);
        try {
            await service.alocar({
                adiantamentoDocCod: String(req.params.docCod),
                invoiceDocCod: parsed.data.invoiceDocCod,
                invoicePriCod: parsed.data.invoicePriCod,
                valorAlocado: parsed.data.valorAlocado,
                criadoPor,
                ...(parsed.data.observacao !== undefined
                    ? { observacao: parsed.data.observacao }
                    : {}),
            });
            res.json({
                adiantamentoDocCod: String(req.params.docCod),
                invoiceDocCod: parsed.data.invoiceDocCod,
            });
        } catch (error) {
            if (error instanceof AlocacaoSaldoError) {
                res.status(error.statusCode).json({
                    error: error.code,
                    message: error.userMessage,
                    details: error.details,
                });
                return;
            }
            throw error;
        }
    }),
);

// DELETE /permutas/adiantamentos/:docCod/alocacoes/:invoiceDocCod — remove alocação.
router.delete(
    '/adiantamentos/:docCod/alocacoes/:invoiceDocCod',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(AlocacaoPermutasService);
        await service.remover(String(req.params.docCod), String(req.params.invoiceDocCod));
        res.json({
            adiantamentoDocCod: String(req.params.docCod),
            invoiceDocCod: String(req.params.invoiceDocCod),
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
    requireRole('admin'),
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
