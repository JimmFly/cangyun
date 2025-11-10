import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import { readFileSync } from 'node:fs';

const ignoreList = readFileSync('.prettierignore', 'utf-8')
  .split('\n')
  .filter(line => line.trim() && !line.startsWith('#'));

const typeScriptExtensions = ['.ts', '.tsx', '.cts', '.mts'];

export default tseslint.config(
  {
    ignores: [
      ...ignoreList,
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      '**/*.config.ts',
      'eslint.config.mjs',
      '**/test/**/*.js',
      '**/test/**/*.js.map',
      '**/test/**/*.d.ts',
      '**/dist/**/*',
    ],
  },
  {
    settings: {
      react: {
        version: 'detect',
      },
      'import-x/parsers': {
        '@typescript-eslint/parser': typeScriptExtensions,
      },
      'import-x/resolver': {
        typescript: true,
      },
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
      'import-x': importX,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import-x/no-extraneous-dependencies': [
        'error',
        { includeInternal: true },
      ],
    },
  },
  {
    files: [
      '**/__tests__/**/*',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/scripts/**/*',
    ],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      'import-x/no-extraneous-dependencies': 'off',
    },
  },
  eslintConfigPrettier
);
