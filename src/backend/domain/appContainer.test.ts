import 'reflect-metadata';

const getEnvironmentVars = jest.fn();
const buildLegacyConexosAdapter = jest.fn();
const dbInit = jest.fn();
const migrationRun = jest.fn();

jest.mock('./libs/environment/EnvironmentProvider.js', () => ({
    __esModule: true,
    default: class {
        public getEnvironmentVars = (...a: unknown[]) => getEnvironmentVars(...a);
    },
}));

jest.mock('./client/legacyConexosAdapter.js', () => ({
    __esModule: true,
    buildLegacyConexosAdapter: (...a: unknown[]) => buildLegacyConexosAdapter(...a),
}));

jest.mock('./client/ConexosClient.js', () => ({
    __esModule: true,
    default: class ConexosClient {},
    LEGACY_CONEXOS_TOKEN: Symbol('LegacyConexosShape'),
}));

jest.mock('./client/database/PostgreeDatabaseClient.js', () => ({
    __esModule: true,
    default: class PostgreeDatabaseClient {
        public init = (...a: unknown[]) => dbInit(...a);
    },
}));

jest.mock('../migrations/runMigrations.js', () => ({
    __esModule: true,
    default: class MigrationRunner {
        public run = (...a: unknown[]) => migrationRun(...a);
    },
}));

describe('bootstrapAppContainer — migration wiring (P0-1)', () => {
    beforeEach(() => {
        jest.resetModules();
        getEnvironmentVars.mockResolvedValue({
            conexosApiUrl: 'http://erp',
            conexosLogin: 'u',
            conexosPassword: 'p',
            conexosFilCod: 2,
            environment: 'production',
        });
        buildLegacyConexosAdapter.mockResolvedValue({});
        dbInit.mockResolvedValue(undefined);
        migrationRun.mockResolvedValue(['0001_permuta_eleicao.sql']);
    });

    it('runs MigrationRunner.run() during bootstrap, before serving traffic', async () => {
        const { bootstrapAppContainer } = await import('./appContainer.js');
        await bootstrapAppContainer();
        expect(dbInit).toHaveBeenCalledTimes(1);
        expect(migrationRun).toHaveBeenCalledTimes(1);
    });

    it('fails loud in production when migrations fail', async () => {
        migrationRun.mockRejectedValueOnce(new Error('relation does not exist'));
        const { bootstrapAppContainer } = await import('./appContainer.js');
        await expect(bootstrapAppContainer()).rejects.toThrow('relation does not exist');
    });
});
