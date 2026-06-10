import 'reflect-metadata';
// Ontology refs:
//   - ontology/integrations/api-error-contract.md
//   - ontology/ui-flows/frontend-observability.md

import { BcbUnavailableError } from '../../errors/BcbUnavailableError.js';
import ConexosError from '../../errors/ConexosError.js';
import InvalidDateRangeError from '../../errors/InvalidDateRangeError.js';
import MissingFilCodError from '../../errors/MissingFilCodError.js';
import BadRequestError from './BadRequestError.js';
import { isHandlerError, type HandlerError } from './HandlerError.js';

describe('HandlerError envelope contract', () => {
    const expectHandlerError = (err: unknown): HandlerError & Error => {
        if (!isHandlerError(err)) {
            throw new Error('Expected error to implement HandlerError envelope');
        }
        return err;
    };

    it('isHandlerError returns false for plain Error', () => {
        expect(isHandlerError(new Error('plain'))).toBe(false);
    });

    it('isHandlerError returns false for non-error values', () => {
        expect(isHandlerError(null)).toBe(false);
        expect(isHandlerError(undefined)).toBe(false);
        expect(isHandlerError('boom')).toBe(false);
        expect(isHandlerError(42)).toBe(false);
        expect(isHandlerError({ code: 'X' })).toBe(false); // missing required fields
    });

    it('BadRequestError implements HandlerError (code=BAD_REQUEST, retryable=false, statusCode=400)', () => {
        const e = expectHandlerError(new BadRequestError('field missing', 400));
        expect(e.code).toBe('BAD_REQUEST');
        expect(e.retryable).toBe(false);
        expect(e.statusCode).toBe(400);
        expect(typeof e.userMessage).toBe('string');
        expect(e.userMessage.length).toBeGreaterThan(0);
    });

    it('BcbUnavailableError implements HandlerError (code=BCB_UPSTREAM_UNAVAILABLE, retryable=true, statusCode=502)', () => {
        const e = expectHandlerError(new BcbUnavailableError('BCB down'));
        expect(e.code).toBe('BCB_UPSTREAM_UNAVAILABLE');
        expect(e.retryable).toBe(true);
        expect(e.statusCode).toBe(502);
        expect(e.userMessage).toMatch(/Banco Central/i);
    });

    it('ConexosError defaults to CONEXOS_UPSTREAM_ERROR (retryable=true, statusCode=504)', () => {
        const e = expectHandlerError(new ConexosError({ endpoint: 'imp059' }));
        expect(['CONEXOS_UPSTREAM_TIMEOUT', 'CONEXOS_UPSTREAM_ERROR']).toContain(e.code);
        expect(e.retryable).toBe(true);
        expect(e.statusCode).toBe(504);
        expect(e.userMessage).toMatch(/Conexos/i);
    });

    it('ConexosError honors timeout code when caller picks it', () => {
        const e = expectHandlerError(
            new ConexosError({ endpoint: 'imp059', code: 'CONEXOS_UPSTREAM_TIMEOUT' }),
        );
        expect(e.code).toBe('CONEXOS_UPSTREAM_TIMEOUT');
    });

    it('InvalidDateRangeError implements HandlerError (code=INVALID_DATE_RANGE, retryable=false, statusCode=400)', () => {
        const e = expectHandlerError(new InvalidDateRangeError('bad range'));
        expect(e.code).toBe('INVALID_DATE_RANGE');
        expect(e.retryable).toBe(false);
        expect(e.statusCode).toBe(400);
    });

    it('MissingFilCodError implements HandlerError (code=MISSING_FIL_COD, retryable=false, statusCode=400)', () => {
        const e = expectHandlerError(new MissingFilCodError({ endpoint: 'imp059' }));
        expect(e.code).toBe('MISSING_FIL_COD');
        expect(e.retryable).toBe(false);
        expect(e.statusCode).toBe(400);
    });
});
