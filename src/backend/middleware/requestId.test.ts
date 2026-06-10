import 'reflect-metadata';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
// Ontology refs:
//   - ontology/integrations/api-error-contract.md
//   - ontology/ui-flows/frontend-observability.md

import { requestIdMiddleware } from './requestId.js';

interface ResponseSnapshot {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
}

const startServer = (): Promise<{ port: number; close: () => Promise<void> }> => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/x', (req, res) => {
        res.json({ requestId: req.requestId });
    });
    return new Promise((resolve) => {
        const server = app.listen(0, () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                port,
                close: () =>
                    new Promise<void>((done) => {
                        server.close(() => done());
                    }),
            });
        });
    });
};

const httpGet = (port: number, headers: Record<string, string> = {}): Promise<ResponseSnapshot> => {
    return new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/x', headers }, (res) => {
            let body = '';
            res.setEncoding('utf-8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode ?? 0,
                    headers: res.headers,
                    body,
                });
            });
        });
        req.on('error', reject);
    });
};

describe('requestIdMiddleware', () => {
    it('generates a server-side UUID when the client did not send X-Request-Id', async () => {
        const server = await startServer();
        try {
            const res = await httpGet(server.port);
            expect(res.statusCode).toBe(200);
            const echoed = res.headers['x-request-id'];
            expect(typeof echoed).toBe('string');
            expect((echoed as string).length).toBeGreaterThan(8);
            const parsed = JSON.parse(res.body);
            expect(parsed.requestId).toBe(echoed);
        } finally {
            await server.close();
        }
    });

    it('echoes the X-Request-Id supplied by the client', async () => {
        const server = await startServer();
        try {
            const res = await httpGet(server.port, { 'X-Request-Id': 'foo-123' });
            expect(res.statusCode).toBe(200);
            expect(res.headers['x-request-id']).toBe('foo-123');
            const parsed = JSON.parse(res.body);
            expect(parsed.requestId).toBe('foo-123');
        } finally {
            await server.close();
        }
    });

    it('falls back to generated UUID when client sends an empty/whitespace X-Request-Id', async () => {
        const server = await startServer();
        try {
            const res = await httpGet(server.port, { 'X-Request-Id': '   ' });
            expect(res.statusCode).toBe(200);
            const echoed = res.headers['x-request-id'];
            expect(typeof echoed).toBe('string');
            expect((echoed as string).trim().length).toBeGreaterThan(8);
            expect(echoed).not.toBe('   ');
        } finally {
            await server.close();
        }
    });
});
