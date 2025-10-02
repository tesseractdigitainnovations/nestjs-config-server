// eslint configuration

import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint as any,
    },
    rules: {
      // Custom rules can be added here
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
] as const;