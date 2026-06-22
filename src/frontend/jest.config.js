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
    // testability-3: medir cobertura de TODO o código-fonte, não só dos arquivos
    // importados por testes (antes o número era "Potemkin" — ~10 de 34 fontes). Exclui
    // testes, type-defs e o `types.ts` (só tipos, sem código executável).
    collectCoverageFrom: [
        'app/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        '!**/*.test.{ts,tsx}',
        '!**/*.d.ts',
        '!lib/types.ts',
    ],
    // CI gate: fail the build if coverage regresses below these floors.
    //
    // testability-3 (Regis 2026-06-22): com `collectCoverageFrom` acima, a cobertura
    // passou a medir TODO o código-fonte (não só os ~10 arquivos importados por testes).
    // O número antigo (~82%) era "Potemkin"; o baseline REAL é bem menor — a maior parte
    // do `app/` (ex.: `permutas/page.tsx`, 2127 LOC) e vários `components/` não têm teste.
    // Baseline medido: global ~26.8% lines / 13.56% branches / 18.18% functions;
    // './lib/auth/' (agregado, inclui AuthProvider.tsx) ~25.37% lines.
    // Floors sentam JUST BELOW o real → CI verde agora, mas qualquer regressão trava.
    // SUBIR conforme testes forem adicionados (cards de testability no Regis cobrem
    // page.tsx e componentes). './lib/auth/' é path de DIRETÓRIO (agregado, não file-by-file).
    coverageThreshold: {
        global: {
            lines: 25,
            branches: 12,
            functions: 15,
        },
        './lib/auth/': {
            lines: 24,
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
