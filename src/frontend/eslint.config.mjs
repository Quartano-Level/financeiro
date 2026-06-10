import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
    ...nextCoreWebVitals,
    ...nextTypescript,
    {
        ignores: ['.next/**', 'node_modules/**', 'tsconfig.tsbuildinfo'],
    },
    {
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'react-hooks/set-state-in-effect': 'warn',
        },
    },
];

export default eslintConfig;
