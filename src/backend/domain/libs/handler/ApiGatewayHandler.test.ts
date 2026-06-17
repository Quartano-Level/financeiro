import 'reflect-metadata';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { container } from 'tsyringe';
import { BcbUnavailableError } from '../../errors/BcbUnavailableError.js';
import ConexosError from '../../errors/ConexosError.js';
import LogService from '../../service/LogService.js';
import ApiGatewayHandler from './ApiGatewayHandler.js';
import BadRequestError from './BadRequestError.js';

const buildEvent = (): APIGatewayProxyEvent =>
    ({
        body: '{}',
        headers: {},
        httpMethod: 'POST',
        path: '/x',
    }) as unknown as APIGatewayProxyEvent;

const buildContext = (awsRequestId = 'req-123'): Context =>
    ({
        functionName: 'fn',
        functionVersion: '$LATEST',
        awsRequestId,
    }) as unknown as Context;

describe('ApiGatewayHandler', () => {
    let logService: LogService;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        container.clearInstances();
        logService = container.resolve(LogService);
        errorSpy = jest
            .spyOn(logService, 'error')
            .mockResolvedValue(undefined as unknown as undefined);
        warnSpy = jest
            .spyOn(logService, 'warn')
            .mockResolvedValue(undefined as unknown as undefined);
    });

    it('returns 200 + JSON body on success', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => ({ ok: true, value: 42 }));
        const res = await handler(buildEvent(), buildContext());
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ ok: true, value: 42 });
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('returns 500 + INTERNAL envelope when callback throws an unstructured error', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new Error('boom');
        });
        const res = await handler(buildEvent(), buildContext('req-internal'));
        expect(res.statusCode).toBe(500);
        const parsed = JSON.parse(res.body);
        expect(parsed.error.code).toBe('INTERNAL');
        expect(parsed.error.message).toBe('Internal');
        expect(parsed.error.userMessage).toMatch(/inesperado/i);
        expect(parsed.error.retryable).toBe(false);
        expect(parsed.error.requestId).toBe('req-internal');
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('returns 400 + BAD_REQUEST envelope when callback throws BadRequestError', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new BadRequestError('dataBase missing', 400, { field: 'dataBase' });
        });
        const res = await handler(buildEvent(), buildContext('req-bad'));
        expect(res.statusCode).toBe(400);
        const parsed = JSON.parse(res.body);
        expect(parsed.error.code).toBe('BAD_REQUEST');
        expect(parsed.error.message).toBe('dataBase missing');
        expect(parsed.error.userMessage).toBeTruthy();
        expect(parsed.error.requestId).toBe('req-bad');
        expect(parsed.error.retryable).toBe(false);
        expect(parsed.error.details).toEqual({ field: 'dataBase' });
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('returns 504 + CONEXOS_UPSTREAM_ERROR envelope when callback throws ConexosError', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new ConexosError({ endpoint: 'imp059' });
        });
        const res = await handler(buildEvent(), buildContext('req-conexos'));
        expect(res.statusCode).toBe(504);
        const parsed = JSON.parse(res.body);
        expect(parsed.error.code).toBe('CONEXOS_UPSTREAM_ERROR');
        expect(parsed.error.userMessage).toMatch(/Conexos/i);
        expect(parsed.error.retryable).toBe(true);
        expect(parsed.error.requestId).toBe('req-conexos');
    });

    it('returns 504 + CONEXOS_UPSTREAM_TIMEOUT when caller picks that code', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new ConexosError({ endpoint: 'imp059', code: 'CONEXOS_UPSTREAM_TIMEOUT' });
        });
        const res = await handler(buildEvent(), buildContext());
        expect(res.statusCode).toBe(504);
        expect(JSON.parse(res.body).error.code).toBe('CONEXOS_UPSTREAM_TIMEOUT');
    });

    it('returns 502 + BCB_UPSTREAM_UNAVAILABLE envelope when callback throws BcbUnavailableError', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new BcbUnavailableError('bcb down');
        });
        const res = await handler(buildEvent(), buildContext('req-bcb'));
        expect(res.statusCode).toBe(502);
        const parsed = JSON.parse(res.body);
        expect(parsed.error.code).toBe('BCB_UPSTREAM_UNAVAILABLE');
        expect(parsed.error.userMessage).toMatch(/Banco Central/i);
        expect(parsed.error.retryable).toBe(true);
        expect(parsed.error.requestId).toBe('req-bcb');
    });

    it('honors __statusCode override on success result', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => ({ __statusCode: 201, created: true }));
        const res = await handler(buildEvent(), buildContext());
        expect(res.statusCode).toBe(201);
    });

    it('passes raw __body buffer (xlsx) base64-encoded with isBase64Encoded=true', async () => {
        const wrapper = new ApiGatewayHandler();
        const buf = Buffer.from('PKfake');
        const handler = wrapper.handle(async () => ({
            __body: buf,
            __headers: { 'Content-Type': 'application/vnd.openxmlformats' },
        }));
        const res = await handler(buildEvent(), buildContext());
        expect(res.statusCode).toBe(200);
        expect(res.isBase64Encoded).toBe(true);
        expect(res.body).toBe(buf.toString('base64'));
        expect(res.headers?.['Content-Type']).toContain('openxmlformats');
    });

    it('echoes X-Request-Id on success responses', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => ({ ok: true }));
        const res = await handler(buildEvent(), buildContext('req-success'));
        expect(res.headers?.['X-Request-Id']).toBe('req-success');
    });

    it('echoes X-Request-Id on failure responses', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new Error('boom');
        });
        const res = await handler(buildEvent(), buildContext('req-fail'));
        expect(res.headers?.['X-Request-Id']).toBe('req-fail');
    });

    it('does not double-log: error path logs exactly once', async () => {
        const wrapper = new ApiGatewayHandler();
        const handler = wrapper.handle(async () => {
            throw new Error('once');
        });
        await handler(buildEvent(), buildContext());
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });
});
