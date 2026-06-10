import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { container } from 'tsyringe';
import LogService from '../../service/LogService.js';
import BadRequestError from './BadRequestError.js';
import { isHandlerError } from './HandlerError.js';

interface HandlerContext {
    event: APIGatewayProxyEvent;
    context: Context;
}

type HandlerCallback<T> = (ctx: HandlerContext) => Promise<T>;

interface SuccessEnvelope {
    __statusCode?: number;
    __headers?: Record<string, string>;
    __body?: string | Buffer;
    [key: string]: unknown;
}

interface ErrorEnvelopeBody {
    error: {
        code: string;
        message: string;
        userMessage: string;
        requestId: string;
        retryable: boolean;
        details?: unknown;
    };
}

/**
 * Wrapper for API Gateway lambdas. Responsibilities:
 *   1. Configure LogService metadata (functionName, awsRequestId).
 *   2. Run the callback inside try/catch.
 *   3. On uncaught throw → log once + return mapped error envelope.
 *      - `HandlerError` instances (BadRequestError, ConexosError, etc.) →
 *        their declared `statusCode` + envelope `{ code, message, userMessage,
 *        requestId, retryable, details? }`.
 *      - Unknown throws → 500 + `{ code: 'INTERNAL', message: 'Internal',
 *        userMessage: 'Erro inesperado.', requestId, retryable: false }`.
 *   4. On success → 200 (or `result.__statusCode` override) with JSON body.
 *      If `result.__body` is provided (e.g. Buffer for xlsx), use it raw
 *      and let `__headers` override Content-Type.
 *   5. ALWAYS echo `X-Request-Id` on the response (success + failure) so
 *      the client can quote it in a support ticket.
 *
 * Convention: handler callback never logs the failure path itself —
 * the wrapper does that to avoid double-logs.
 *
 * Ontology refs:
 *   - ontology/integrations/api-error-contract.md
 *   - ontology/ui-flows/frontend-observability.md
 */
export default class ApiGatewayHandler {
    public handle = <T>(callback: HandlerCallback<T>) => {
        return async (
            event: APIGatewayProxyEvent,
            context: Context,
        ): Promise<APIGatewayProxyResult> => {
            const logService = container.resolve(LogService);
            const requestId = context.awsRequestId ?? 'local';
            logService.setMetadata({
                service: 'closing-reports',
                lambdaContext: context.functionVersion ?? 'unknown',
                lambdaName: context.functionName ?? 'unknown',
                requestId,
                environment: process.env.environment ?? 'local',
                clientName: process.env.client_name ?? 'local',
            });

            try {
                const result = await callback({ event, context });
                return this.buildSuccess(result, requestId);
            } catch (error) {
                return this.buildFailure(error, logService, requestId);
            }
        };
    };

    private buildSuccess = <T>(result: T, requestId: string): APIGatewayProxyResult => {
        const envelope = result as unknown as SuccessEnvelope | null | undefined;
        const statusCode = envelope?.__statusCode ?? 200;
        const baseHeaders = envelope?.__headers ?? { 'Content-Type': 'application/json' };
        const headers = { ...baseHeaders, 'X-Request-Id': requestId };

        if (envelope?.__body !== undefined) {
            const rawBody = envelope.__body;
            const body = Buffer.isBuffer(rawBody) ? rawBody.toString('base64') : rawBody;
            return {
                statusCode,
                headers,
                body,
                isBase64Encoded: Buffer.isBuffer(rawBody),
            };
        }

        return {
            statusCode,
            headers,
            body: JSON.stringify(result ?? {}),
        };
    };

    private buildFailure = async (
        error: unknown,
        logService: LogService,
        requestId: string,
    ): Promise<APIGatewayProxyResult> => {
        if (isHandlerError(error)) {
            const isClientError = error.statusCode >= 400 && error.statusCode < 500;
            const logPayload = {
                type: isClientError ? 'VALIDATION_ERROR' : 'SYSTEM_ERROR',
                message: error.message,
                statusCode: error.statusCode,
                error,
                data: {
                    code: error.code,
                    details: error.details,
                    retryable: error.retryable,
                },
            };
            // BadRequest-like (4xx, not retryable) gets warn; others get error.
            // ConexosError is 504 but retryable from the user POV — still log as
            // error because it's an upstream failure the operator should see.
            if (error instanceof BadRequestError) {
                await logService.warn(logPayload);
            } else {
                await logService.error(logPayload);
            }
            const body: ErrorEnvelopeBody = {
                error: {
                    code: error.code,
                    message: error.message,
                    userMessage: error.userMessage,
                    requestId,
                    retryable: error.retryable,
                    ...(error.details !== undefined ? { details: error.details } : {}),
                },
            };
            return {
                statusCode: error.statusCode,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-Id': requestId,
                },
                body: JSON.stringify(body),
            };
        }

        const err = error as Error & { statusCode?: number };
        const statusCode = err?.statusCode ?? 500;
        await logService.error({
            type: 'SYSTEM_ERROR',
            message: err?.message ?? 'Unhandled error',
            statusCode,
            error,
        });

        const body: ErrorEnvelopeBody = {
            error: {
                code: 'INTERNAL',
                message: 'Internal',
                userMessage:
                    'Erro inesperado. Tente novamente em alguns minutos e, se persistir, reporte com o ID abaixo.',
                requestId,
                retryable: false,
            },
        };
        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Id': requestId,
            },
            body: JSON.stringify(body),
        };
    };
}
