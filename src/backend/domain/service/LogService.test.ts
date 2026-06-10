import 'reflect-metadata';
import LogService from './LogService.js';

describe('LogService', () => {
    let logService: LogService;
    let stdoutSpy: jest.SpyInstance;

    beforeEach(() => {
        logService = new LogService();
        logService.setMetadata({
            service: 'test',
            lambdaContext: 'test-ctx',
            lambdaName: 'test-fn',
            requestId: 'req-123',
            environment: 'test',
            clientName: 'columbia',
        });
        stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutSpy.mockRestore();
    });

    it('writes a JSON-formatted INFO log to stdout', async () => {
        await logService.info({ type: 'CONEXOS_DEBUG', message: 'hi' });

        expect(stdoutSpy).toHaveBeenCalledTimes(1);
        const written = stdoutSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(written.trim());

        expect(parsed.level).toBe('INFO');
        expect(parsed.type).toBe('CONEXOS_DEBUG');
        expect(parsed.message).toBe('hi');
        expect(parsed.requestId).toBe('req-123');
        expect(parsed.clientName).toBe('columbia');
        expect(typeof parsed.timestamp).toBe('string');
        expect(parsed.caller).toBeDefined();
    });

    it('defaults statusCode to 500 for ERROR level when omitted', async () => {
        await logService.error({ type: 'SYSTEM_ERROR', message: 'oops' });

        const written = stdoutSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(written.trim());

        expect(parsed.level).toBe('ERROR');
        expect(parsed.statusCode).toBe(500);
    });

    it('preserves the explicit statusCode for non-ERROR levels', async () => {
        await logService.warn({ type: 'VALIDATION_ERROR', message: 'bad', statusCode: 400 });

        const written = stdoutSpy.mock.calls[0][0] as string;
        const parsed = JSON.parse(written.trim());

        expect(parsed.level).toBe('WARN');
        expect(parsed.statusCode).toBe(400);
    });

    it('propagates metadata across subsequent logs', async () => {
        await logService.info({ type: 'INFO_GENERIC', message: 'one' });
        await logService.success({ type: 'INFO_GENERIC', message: 'two' });

        expect(stdoutSpy).toHaveBeenCalledTimes(2);
        const first = JSON.parse((stdoutSpy.mock.calls[0][0] as string).trim());
        const second = JSON.parse((stdoutSpy.mock.calls[1][0] as string).trim());

        expect(first.requestId).toBe('req-123');
        expect(second.requestId).toBe('req-123');
        expect(second.level).toBe('SUCCESS');
    });
});
