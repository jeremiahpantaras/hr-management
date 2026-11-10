import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Layering rules from planning/SYSTEM_ARCHITECTURE.md §2:
 *   - Only src/lib, src/services (and tests) may import Firebase.
 *   - src/domain is pure TypeScript: no React, no Firebase, no UI/service imports.
 *   - src/services never imports React, features, components or hooks.
 *   - src/components never imports services or features.
 * Each block below targets a disjoint set of files, because a later `no-restricted-imports`
 * entry replaces (does not merge with) an earlier one for the same file.
 */
// Patterns use gitignore syntax. A bare name (e.g. 'firebase') would match a file of that name
// at ANY depth — including our own '@/lib/firebase' — so package names are anchored with '/'.
const FIREBASE_IMPORTS = ['/firebase', '/firebase/*', '/@firebase/*'];
const REACT_IMPORTS = ['/react', '/react-*', '/@tanstack/*'];
const SERVICE_IMPORTS = ['**/services', '**/services/**'];
const FEATURE_IMPORTS = ['**/features', '**/features/**'];
const COMPONENT_IMPORTS = ['**/components', '**/components/**'];
const HOOK_IMPORTS = ['**/hooks', '**/hooks/**'];

const restrict = (message, ...groups) => ({
  'no-restricted-imports': ['error', { patterns: groups.map((group) => ({ group, message })) }],
});

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules', '.firebase', 'planning', '.claude']),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // ── Architecture layering (see header comment) ──────────────────────────────────────────
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: restrict(
      'src/domain is pure TypeScript: no React, Firebase, services, features, components or hooks (Architecture §2).',
      [...FIREBASE_IMPORTS, ...REACT_IMPORTS],
      [...SERVICE_IMPORTS, ...FEATURE_IMPORTS, ...COMPONENT_IMPORTS, ...HOOK_IMPORTS],
    ),
  },
  {
    files: ['src/services/**/*.{ts,tsx}'],
    rules: restrict(
      'src/services must not import React, features, components or hooks (Architecture §2).',
      REACT_IMPORTS,
      [...FEATURE_IMPORTS, ...COMPONENT_IMPORTS, ...HOOK_IMPORTS],
    ),
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: restrict(
      'Import Firebase only in src/lib or src/services; use a typed service function instead (Architecture §2).',
      FIREBASE_IMPORTS,
    ),
  },
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/utils/**/*.{ts,tsx}'],
    rules: restrict(
      'Shared components and utils must not import Firebase, services or features (Architecture §2).',
      FIREBASE_IMPORTS,
      [...SERVICE_IMPORTS, ...FEATURE_IMPORTS],
    ),
  },

  // ── Node-side TypeScript (config files and emulator-backed tests) ───────────────────────
  {
    files: ['tests/**/*.ts', 'vite.config.ts', 'vitest.config.ts', 'vitest.rules.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // ── Plain JavaScript (this file) ────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  prettier,
]);
