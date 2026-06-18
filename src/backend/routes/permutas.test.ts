import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { container } from 'tsyringe';

// Neutralize the real bootstrap (no Conexos/DB) — handlers only need the
// container to resolve our mocked services.
jest.mock('../domain/appContainer.js', () => ({
    bootstrapAppContainer: jest.fn().mockResolvedValue(undefined),
}));

import EleicaoPermutasService from '../domain/service/permutas/EleicaoPermutasService.js';
import GestaoPermutasService from '../domain/service/permutas/GestaoPermutasService.js';
import PainelService from '../domain/service/permutas/PainelService.js';
import PermutaProcessamentoRepository from '../domain/repository/permutas/PermutaProcessamentoRepository.js';
import { errorMiddleware } from '../http/errorMiddleware.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import permutasRouter from './permutas.js';

interface TestServer {
    url: string;
    close: () => Promise<void>;
}

const readJson = async (res: Response): Promise<Record<string, any>> =>
    (await res.json()) as Record<string, any>;

// Mimics auth: attaches a fake user. Toggled per-test to simulate 401.
const buildApp = (opts: { authenticated: boolean }): express.Express => {
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use((req, res, next) => {
        if (!opts.authenticated) {
            res.status(401).json({ error: 'Missing or malformed Authorization header' });
            return;
        }
        req.user = { sub: 'user-abc', email: 'a@b.com' };
        next();
    });
    app.use('/permutas', permutasRouter);
    app.use(errorMiddleware);
    return app;
};

const listen = (app: express.Express): Promise<TestServer> =>
    new Promise((resolve) => {
        const server: Server = app.listen(0, () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });

describe('POST /permutas/eleicao', () => {
    afterEach(() => {
        container.clearInstances();
    });

    it('triggers the eleicao via container service and returns the run summary', async () => {
        const executar = jest.fn().mockResolvedValue({
            runId: 'run-1',
            flowId: 'flow-1',
            totalCandidatas: 3,
            totalElegiveis: 1,
            totalBloqueadas: 2,
            bloqueadasByMotivo: { 'sem-invoice': 2 },
            status: 'success',
            candidatas: [],
        });
        container.registerInstance(EleicaoPermutasService, { executar } as never);

        const server = await listen(buildApp({ authenticated: true }));
        try {
            const res = await fetch(`${server.url}/permutas/eleicao`, { method: 'POST' });
            const body = await readJson(res);
            expect(res.status).toBe(200);
            expect(body).toMatchObject({
                runId: 'run-1',
                totalCandidatas: 3,
                totalElegiveis: 1,
                totalBloqueadas: 2,
                status: 'success',
            });
            // triggered_by = authenticated user identity (audit O6).
            expect(executar).toHaveBeenCalledWith({ triggeredBy: 'user-abc' });
        } finally {
            await server.close();
        }
    });

    it('requires authentication (401 when unauthenticated)', async () => {
        const server = await listen(buildApp({ authenticated: false }));
        try {
            const res = await fetch(`${server.url}/permutas/eleicao`, { method: 'POST' });
            expect(res.status).toBe(401);
        } finally {
            await server.close();
        }
    });
});

describe('GET /permutas/painel', () => {
    afterEach(() => {
        container.clearInstances();
    });

    it('returns the latest snapshot payload', async () => {
        const exporNoPainel = jest.fn().mockResolvedValue({
            runId: 'run-9',
            snapshotAge: 1000,
            totalElegiveis: 1,
            totalBloqueadas: 1,
            items: [
                { docCod: 'A1', priCod: '2048', status: 'elegivel', aging: 10 },
                {
                    docCod: 'A2',
                    priCod: '3000',
                    status: 'bloqueada',
                    motivoBloqueio: 'sem-invoice',
                    aging: null,
                },
            ],
        });
        container.registerInstance(PainelService, { exporNoPainel } as never);

        const server = await listen(buildApp({ authenticated: true }));
        try {
            const res = await fetch(`${server.url}/permutas/painel`);
            const body = await readJson(res);
            expect(res.status).toBe(200);
            expect(body.totalElegiveis).toBe(1);
            expect(body.items).toHaveLength(2);
            // Blocked candidate is visible with its motivo (bloqueada ≠ falha).
            expect(body.items[1].motivoBloqueio).toBe('sem-invoice');
            // ⏸ GATED-P0-4 — aging null is preserved, not dropped.
            expect(body.items[1].aging).toBeNull();
        } finally {
            await server.close();
        }
    });

    it('returns an empty payload when no snapshot exists (not 500)', async () => {
        const exporNoPainel = jest
            .fn()
            .mockResolvedValue({ totalElegiveis: 0, totalBloqueadas: 0, items: [] });
        container.registerInstance(PainelService, { exporNoPainel } as never);

        const server = await listen(buildApp({ authenticated: true }));
        try {
            const res = await fetch(`${server.url}/permutas/painel`);
            const body = await readJson(res);
            expect(res.status).toBe(200);
            expect(body.items).toEqual([]);
        } finally {
            await server.close();
        }
    });
});

describe('GET /permutas/gestao', () => {
    afterEach(() => {
        container.clearInstances();
    });

    it('returns the relational gestao payload (fonte=banco)', async () => {
        const exporGestao = jest.fn().mockResolvedValue({
            fonte: 'banco',
            geradoEm: '2026-06-18T12:00:00.000Z',
            pendentes: [{ docCod: 'A1', status: 'elegivel' }],
            invoicesEmAberto: [],
            casamentos: [],
            totais: { pendentes: 1, invoicesEmAberto: 0, elegiveis: 1, bloqueadas: 0 },
        });
        container.registerInstance(GestaoPermutasService, { exporGestao } as never);

        const server = await listen(buildApp({ authenticated: true }));
        try {
            const res = await fetch(`${server.url}/permutas/gestao`);
            const body = await readJson(res);
            expect(res.status).toBe(200);
            expect(body.fonte).toBe('banco');
            expect(body.totais.elegiveis).toBe(1);
        } finally {
            await server.close();
        }
    });
});

describe('POST /permutas/adiantamentos/:docCod/processar', () => {
    afterEach(() => {
        container.clearInstances();
    });

    it('upserts status=processado with the authenticated user identity', async () => {
        const upsertProcessamento = jest.fn().mockResolvedValue(undefined);
        container.registerInstance(PermutaProcessamentoRepository, {
            upsertProcessamento,
        } as never);

        const server = await listen(buildApp({ authenticated: true }));
        try {
            const res = await fetch(`${server.url}/permutas/adiantamentos/A1/processar`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ invoiceDocCod: 'I1', observacao: 'casado' }),
            });
            const body = await readJson(res);
            expect(res.status).toBe(200);
            expect(body).toMatchObject({ adiantamentoDocCod: 'A1', status: 'processado' });
            expect(upsertProcessamento).toHaveBeenCalledWith({
                adiantamentoDocCod: 'A1',
                status: 'processado',
                processadoPor: 'user-abc',
                invoiceDocCod: 'I1',
                observacao: 'casado',
            });
        } finally {
            await server.close();
        }
    });

    it('accepts an empty body (invoiceDocCod/observacao optional)', async () => {
        const upsertProcessamento = jest.fn().mockResolvedValue(undefined);
        container.registerInstance(PermutaProcessamentoRepository, {
            upsertProcessamento,
        } as never);

        const server = await listen(buildApp({ authenticated: true }));
        try {
            const res = await fetch(`${server.url}/permutas/adiantamentos/A1/processar`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            });
            expect(res.status).toBe(200);
            expect(upsertProcessamento).toHaveBeenCalledWith({
                adiantamentoDocCod: 'A1',
                status: 'processado',
                processadoPor: 'user-abc',
            });
        } finally {
            await server.close();
        }
    });

    it('requires authentication (401 when unauthenticated)', async () => {
        const server = await listen(buildApp({ authenticated: false }));
        try {
            const res = await fetch(`${server.url}/permutas/adiantamentos/A1/processar`, {
                method: 'POST',
            });
            expect(res.status).toBe(401);
        } finally {
            await server.close();
        }
    });
});
