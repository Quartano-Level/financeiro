/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['ts', 'js', 'json'],
    testMatch: ['<rootDir>/**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
    // Limit parallel workers to avoid OOM on Windows (default = CPU count - 1
    // hits 5+ workers and trips heap on ts-jest type-checks). 2 workers run
    // the suite faster than --runInBand without OOM.
    maxWorkers: 2,
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    // CI gate: fail the build if coverage regresses below these floors.
    //
    // Jest subtracts files matched by a path/glob key from the "global"
    // bucket and applies each key's thresholds independently. Because the
    // high-coverage domain/service files are pulled into their own (stricter)
    // key, the "global" floors below are measured against the REMAINING files
    // (clients, repositories, handlers, legacy services). Measured baseline
    // for that remaining bucket: ~74.16% lines, ~55.8% branches, ~79.14%
    // functions; for domain/service (aggregate): ~96.71% lines, ~79.33%
    // branches, ~95.28% functions. Floors are set just below current so this
    // PR stays green while any future regression trips CI.
    //
    // The './domain/service/' key is a DIRECTORY path (no glob), so jest
    // enforces it on the AGGREGATE of that directory, not file-by-file.
    coverageThreshold: {
        global: {
            lines: 72,
            branches: 54,
            functions: 78,
        },
        './domain/service/': {
            lines: 90,
            branches: 75,
        },
    },
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: {
                    module: 'CommonJS',
                    moduleResolution: 'node',
                    esModuleInterop: true,
                    experimentalDecorators: true,
                    emitDecoratorMetadata: true,
                    useDefineForClassFields: false,
                },
            },
        ],
    },
};
