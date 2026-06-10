/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
    testPathIgnorePatterns: ['/node_modules/', '/.next/'],
    setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    // CI gate: fail the build if coverage regresses below these floors.
    //
    // Jest subtracts files matched by a path key from the "global" bucket and
    // applies each key independently. lib/auth is small and ~100% covered, so
    // pulling it into its own (stricter) key barely moves global. Measured
    // baselines: whole repo ~81.55% lines / 60% branches / 77.38% functions;
    // global-minus-auth ~81.33% lines / 59.73% branches / 77.03% functions;
    // lib/auth (aggregate) 100% lines / 88.88% branches. Floors sit just below
    // current so this PR stays green while regressions trip CI.
    //
    // './lib/auth/' is a DIRECTORY path (no glob), so jest enforces it on the
    // AGGREGATE of that directory, not file-by-file.
    coverageThreshold: {
        global: {
            lines: 75,
            branches: 55,
            functions: 70,
        },
        './lib/auth/': {
            lines: 90,
        },
    },
    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            {
                tsconfig: {
                    module: 'CommonJS',
                    moduleResolution: 'node',
                    esModuleInterop: true,
                    jsx: 'react-jsx',
                    target: 'ES2020',
                    lib: ['DOM', 'DOM.Iterable', 'ESNext'],
                },
            },
        ],
    },
};
