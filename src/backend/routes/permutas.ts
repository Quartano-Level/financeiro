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
import PermutaExecucaoRepository from '../domain/repository/permutas/PermutaExecucaoRepository.js';
import PermutaRelationalRepository from '../domain/repository/permutas/PermutaRelationalRepository.js';
import PermutaSnapshotRepository from '../domain/repository/permutas/PermutaSnapshotRepository.js';
import EleicaoPermutasService from '../domain/service/permutas/EleicaoPermutasService.js';
import GestaoPermutasService from '../domain/service/permutas/GestaoPermutasService.js';
import IngestaoCoalescerService from '../domain/service/permutas/IngestaoCoalescerService.js';
import PainelService from '../domain/service/permutas/PainelService.js';
import ReconciliacaoPermutaService from '../domain/service/permutas/ReconciliacaoPermutaService.js';
import ReconciliacaoLotePermutaService from '../domain/service/permutas/ReconciliacaoLotePermutaService.js';
import BorderoGestaoService from '../domain/service/permutas/BorderoGestaoService.js';
import { asyncHandler } from '../http/asyncHandler.js';
import { requireRole } from '../http/auth.js';
import { heavyRouteLimiter } from '../http/rateLimit.js';

/** Zod no boundary — corpo do POST /processar (Rule: validar inputs externos). */
const processarBodySchema = z.object({
    invoiceDocCod: z.string().trim().min(1).optional(),
    observacao: z.string().trim().min(1).optional(),
});

/** Zod no boundary — corpo do POST /reconciliar (Fase 3 — baixa no ERP). */
const reconciliarBodySchema = z.object({
    /** Data de movimento do borderô (epoch-ms). Default: meia-noite UTC de hoje. */
    dataMovto: z.number().int().positive().optional(),
    /** Força dry-run (preview sem POST), mesmo com escrita habilitada. */
    dryRun: z.boolean().optional(),
});

/**
 * Extrai uma mensagem AMIGÁVEL de um erro vindo do ERP (Conexos). As validações do `fin010`
 * voltam em `cause.response.data.messages[*].message` (ex.: FIN_IMPOSSIVEL_ALTERAR_REGISTRO
 * quando o borderô está finalizado). Fallback: a mensagem do próprio Error.
 */
const ERP_MESSAGE_PT: Record<string, string> = {
    'FIN_014.DELETAR_REGISTRO_ESTORNO':
        'Não é possível excluir: este borderô tem um estorno vinculado no ERP.',
    'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO':
        'Não é possível alterar: borderô finalizado. Estorne antes de mexer.',
    'Generic.ERROR_MESSAGE':
        'O ERP recusou esta operação para o borderô (estado incompatível com a ação).',
};

const erpErrorMessage = (err: unknown): string => {
    const cause = (err as { cause?: unknown })?.cause;
    const data = (cause as { response?: { data?: unknown } })?.response?.data as
        | { messages?: Array<{ message?: string }> }
        | undefined;
    const key = data?.messages?.[0]?.message;
    if (key) return ERP_MESSAGE_PT[key] ?? String(key);
    return err instanceof Error ? err.message : 'erro ao executar a ação no Conexos';
};

/**
 * Mapeia erro de ação de borderô para a resposta HTTP. `FORBIDDEN:` (autorização — borderô não é da
 * trilha deste sistema) → 403; demais (recusa do ERP, validação) → 400 com mensagem traduzida.
 */
const respondActionError = (res: import('express').Response, err: unknown): void => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('FORBIDDEN:')) {
        res.status(403).json({ error: msg.replace(/^FORBIDDEN:\s*/, '') });
        return;
    }
    res.status(400).json({ error: erpErrorMessage(err) });
};

/** Meia-noite UTC do dia atual em epoch-ms (default do borDtaMvto). */
const todayUtcMidnightMs = (): number => {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

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

// POST /permutas/adiantamentos/:docCod/reconciliar — Fase 3 (risco #1): executa a BAIXA
// efetiva no ERP (fin010) a partir das alocações. heavyRouteLimiter (fan-out Conexos) +
// admin. Guard-rails de escrita (CONEXOS_WRITE_ENABLED/DRY_RUN) vivem no serviço; default
// é dry-run (monta/loga o payload, sem POST). Ver business-rules/fin010-write-contract.md.
router.post(
    '/adiantamentos/:docCod/reconciliar',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = reconciliarBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
            return;
        }
        const docCod = String(req.params.docCod);
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(ReconciliacaoPermutaService);
        const result = await service.reconciliar({
            adiantamentoDocCod: docCod,
            executadoPor,
            dataMovto: parsed.data.dataMovto ?? todayUtcMidnightMs(),
            ...(parsed.data.dryRun !== undefined ? { dryRunOverride: parsed.data.dryRun } : {}),
        });
        res.json(result);
    }),
);

// POST /permutas/reconciliar-lote — Fase 3: executa a BAIXA de TODAS as automáticas de uma vez
// (cada adiantamento dos casamentos sugeridos → seu borderô). Server-side e sequencial (1 request,
// continue-on-error). admin + heavyRouteLimiter. Mesmo gating de escrita do /reconciliar individual
// (CONEXOS_WRITE_ENABLED/DRY_RUN) — o lote reusa o ReconciliacaoPermutaService integralmente.
router.post(
    '/reconciliar-lote',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const parsed = reconciliarBodySchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            res.status(400).json({ error: 'invalid body', details: parsed.error.flatten() });
            return;
        }
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(ReconciliacaoLotePermutaService);
        const result = await service.reconciliarLote({
            executadoPor,
            dataMovto: parsed.data.dataMovto ?? todayUtcMidnightMs(),
            requestId: req.requestId,
            ...(parsed.data.dryRun !== undefined ? { dryRunOverride: parsed.data.dryRun } : {}),
        });
        res.json(result);
    }),
);

// GET /permutas/borderos — gestão de borderôs (Fase 3.1). Lê do CACHE local (rápido); `?live=true`
// (botão Atualizar) faz refresh ao vivo no ERP antes de ler. Enriquece com a trilha local.
router.get(
    '/borderos',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(BorderoGestaoService);
        const live = req.query.live === 'true';
        const borderos = await service.listarBorderos({ live });
        res.json({ borderos, geradoEm: new Date().toISOString(), requestId: req.requestId });
    }),
);

// GET /permutas/borderos/:borCod/baixas?filCod= — baixas DO ERP de um borderô (p/ ver o detalhe de
// borderôs lançados direto no Conexos, sem trilha local). On-demand ao expandir.
router.get(
    '/borderos/:borCod/baixas',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const borCod = Number(req.params.borCod);
        const filCod = Number(req.query.filCod);
        if (!Number.isFinite(borCod) || !Number.isFinite(filCod)) {
            res.status(400).json({ error: 'borCod/filCod inválido' });
            return;
        }
        const service = container.resolve(BorderoGestaoService);
        res.json({ baixas: await service.listarBaixasErp({ borCod, filCod }) });
    }),
);

// POST /permutas/borderos/:borCod/finalizar — finaliza/aprova o borderô no ERP (admin, gated).
router.post(
    '/borderos/:borCod/finalizar',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const borCod = Number(req.params.borCod);
        if (!Number.isFinite(borCod)) {
            res.status(400).json({ error: 'borCod inválido' });
            return;
        }
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(BorderoGestaoService);
        try {
            res.json(await service.finalizarBordero({ borCod, executadoPor }));
        } catch (err) {
            respondActionError(res, err);
        }
    }),
);

// POST /permutas/borderos/:borCod/cancelar — cancela o borderô (em cadastro) no ERP (admin, gated).
router.post(
    '/borderos/:borCod/cancelar',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const borCod = Number(req.params.borCod);
        if (!Number.isFinite(borCod)) {
            res.status(400).json({ error: 'borCod inválido' });
            return;
        }
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(BorderoGestaoService);
        try {
            res.json(await service.cancelarBordero({ borCod, executadoPor }));
        } catch (err) {
            respondActionError(res, err);
        }
    }),
);

// POST /permutas/borderos/:borCod/estornar — estorna o borderô finalizado (volta p/ em cadastro).
router.post(
    '/borderos/:borCod/estornar',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const borCod = Number(req.params.borCod);
        if (!Number.isFinite(borCod)) {
            res.status(400).json({ error: 'borCod inválido' });
            return;
        }
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(BorderoGestaoService);
        try {
            res.json(await service.estornarBordero({ borCod, executadoPor }));
        } catch (err) {
            respondActionError(res, err);
        }
    }),
);

// DELETE /permutas/borderos/:borCod — exclui o borderô INTEIRO (em cadastro) + todas as baixas.
router.delete(
    '/borderos/:borCod',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const borCod = Number(req.params.borCod);
        if (!Number.isFinite(borCod)) {
            res.status(400).json({ error: 'borCod inválido' });
            return;
        }
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(BorderoGestaoService);
        try {
            res.json(await service.excluirBordero({ borCod, executadoPor }));
        } catch (err) {
            respondActionError(res, err);
        }
    }),
);

// DELETE /permutas/borderos/:borCod/baixas/:invoiceDocCod — exclui UMA baixa do borderô (Fase 3.1)
// antes de aprovar. Escreve no ERP (fin010) + remove da trilha. Admin + gated por CONEXOS_WRITE_ENABLED.
router.delete(
    '/borderos/:borCod/baixas/:invoiceDocCod',
    requireRole('admin'),
    heavyRouteLimiter,
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const borCod = Number(req.params.borCod);
        if (!Number.isFinite(borCod)) {
            res.status(400).json({ error: 'borCod inválido' });
            return;
        }
        const invoiceDocCod = String(req.params.invoiceDocCod);
        const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
        const service = container.resolve(BorderoGestaoService);
        try {
            res.json(await service.excluirBaixa({ borCod, invoiceDocCod, executadoPor }));
        } catch (err) {
            respondActionError(res, err);
        }
    }),
);

// GET /permutas/adiantamentos/:docCod/execucoes — trilha de execução da baixa (status por par).
router.get(
    '/adiantamentos/:docCod/execucoes',
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const docCod = String(req.params.docCod);
        const repository = container.resolve(PermutaExecucaoRepository);
        const execucoes = await repository.listByAdiantamento(docCod);
        res.json({ adiantamentoDocCod: docCod, execucoes });
    }),
);

// GET /permutas/status — status PERMUTA→BORDERÔ por adiantamento (consulta lazy, status vivo do
// fin010). Mantém o /gestao rápido (sem ERP) e enriquece os badges da tela depois do load.
router.get(
    '/status',
    requireRole('admin'),
    asyncHandler(async (req, res) => {
        await bootstrapAppContainer();
        const service = container.resolve(BorderoGestaoService);
        res.json({ porAdiantamento: await service.statusPorAdiantamento() });
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
