import 'reflect-metadata';

const ssmSendMock = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => ({
    SSMClient: jest.fn().mockImplementation(() => ({
        send: ssmSendMock,
    })),
    GetParameterCommand: jest.fn().mockImplementation((input) => input),
}));

// SANDBOX (testability-1): neutraliza o dotenv. Em produção o `GetLocalEnvironmentVars`
// chama `dotenv.config()` que recarrega o `.env` do dev — isso re-populava
// `process.env` e contaminava o teste (CONEXOS_FIL_COD do .env local sobrescrevia o
// cenário "ausente"). Com o config() no-op, o teste controla 100% o process.env.
jest.mock('dotenv', () => ({
    __esModule: true,
    default: { config: jest.fn() },
    config: jest.fn(),
}));

import EnvironmentProvider from './EnvironmentProvider.js';

describe('EnvironmentProvider', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        ssmSendMock.mockReset();
        // Reset env to a known baseline
        for (const key of Object.keys(process.env)) {
            if (
                key.startsWith('CONEXOS_') ||
                key.startsWith('SUPABASE_') ||
                key.startsWith('ssm_') ||
                key === 'client_name' ||
                key === 'environment' ||
                key === 'aws_region' ||
                key === 'databaseConnectionString'
            ) {
                delete process.env[key];
            }
        }
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('local mode', () => {
        beforeEach(() => {
            process.env.CONEXOS_USERNAME = 'local-user';
            process.env.CONEXOS_PASSWORD = 'local-pass';
            process.env.CONEXOS_BASE_URL = 'https://example.test/api';
            process.env.databaseConnectionString = 'postgres://localhost:5432/test';
        });

        it('reads from process.env when client_name is undefined', async () => {
            const provider = new EnvironmentProvider();
            const env = await provider.getEnvironmentVars();

            expect(env.conexosLogin).toBe('local-user');
            expect(env.conexosPassword).toBe('local-pass');
            expect(env.conexosApiUrl).toBe('https://example.test/api');
            expect(env.databaseConnectionString).toBe('postgres://localhost:5432/test');
            expect(env.clientName).toBe('local');
            expect(env.awsRegion).toBe('us-east-1');
            // ADR-0009: no hardcoded fallback for filCod; absent env → NaN.
            expect(Number.isNaN(env.conexosFilCod)).toBe(true);
        });

        it('parses CONEXOS_FIL_COD when explicitly set (no hardcoded default)', async () => {
            process.env.CONEXOS_FIL_COD = '7';
            const provider = new EnvironmentProvider();
            const env = await provider.getEnvironmentVars();

            expect(env.conexosFilCod).toBe(7);
        });

        it('reads from process.env when client_name is "local"', async () => {
            process.env.client_name = 'local';
            const provider = new EnvironmentProvider();
            const env = await provider.getEnvironmentVars();

            expect(env.clientName).toBe('local');
            expect(env.conexosLogin).toBe('local-user');
            expect(ssmSendMock).not.toHaveBeenCalled();
        });

        it('does not call SSM in local mode', async () => {
            const provider = new EnvironmentProvider();
            await provider.getEnvironmentVars();

            expect(ssmSendMock).not.toHaveBeenCalled();
        });

        it('caches env vars after first call', async () => {
            const provider = new EnvironmentProvider();

            const first = await provider.getEnvironmentVars();
            const second = await provider.getEnvironmentVars();

            expect(first).toBe(second);
        });
    });

    describe('Lambda mode', () => {
        beforeEach(() => {
            process.env.client_name = 'columbia';
            process.env.environment = 'dev';
            process.env.ssm_database_connection_string =
                '/tenants/dev/columbia/database_connection_string';
            process.env.ssm_conexos_credentials = '/tenants/dev/columbia/conexos_credentials';
        });

        it('reads database connection string from SSM as a plain string', async () => {
            ssmSendMock.mockImplementation(async (cmd: any) => {
                if (cmd.Name === '/tenants/dev/columbia/database_connection_string') {
                    return { Parameter: { Value: 'postgres://prod-host:5432/db' } };
                }
                if (cmd.Name === '/tenants/dev/columbia/conexos_credentials') {
                    return {
                        Parameter: {
                            Value: JSON.stringify({
                                login: 'ssm-user',
                                pass: 'ssm-pass',
                                ApiUrl: 'https://prod.api/api',
                            }),
                        },
                    };
                }
                return { Parameter: { Value: '' } };
            });

            const provider = new EnvironmentProvider();
            const env = await provider.getEnvironmentVars();

            expect(env.databaseConnectionString).toBe('postgres://prod-host:5432/db');
            expect(env.conexosLogin).toBe('ssm-user');
            expect(env.conexosPassword).toBe('ssm-pass');
            expect(env.conexosApiUrl).toBe('https://prod.api/api');
            expect(env.clientName).toBe('columbia');
            expect(env.environment).toBe('dev');
        });

        it('returns empty supabase fields when ssm_supabase_credentials is unset', async () => {
            ssmSendMock.mockImplementation(async () => ({ Parameter: { Value: '{}' } }));

            const provider = new EnvironmentProvider();
            const env = await provider.getEnvironmentVars();

            expect(env.supabaseUrl).toBeUndefined();
            expect(env.supabaseServiceRoleKey).toBeUndefined();
        });
    });
});
