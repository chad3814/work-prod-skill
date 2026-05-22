import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      'semi': ['error', 'always'],
      'indent': ['error', 2, { SwitchCase: 1 }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSUnknownKeyword',
          message: 'unknown is banned by project policy. Use a named generic or a zod-inferred type instead.',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
