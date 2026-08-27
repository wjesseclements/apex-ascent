// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PURITY_MSG =
  'src/engine/ is pure and headless (CLAUDE.md app rule 4): no React, DOM, canvas, store or component imports.';

/**
 * Engine-purity rule. Everything under src/engine/ must be plain TypeScript
 * that could run in Node or a Worker: no UI framework, no DOM/canvas globals,
 * no imports from the app layers. Tripwired by src/test/engine-purity.test.ts.
 */
const enginePurity = {
  files: ['src/engine/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { name: 'react', message: PURITY_MSG },
          { name: 'react-dom', message: PURITY_MSG },
          { name: 'zustand', message: PURITY_MSG },
        ],
        patterns: [
          {
            group: [
              'react/*',
              'react-dom/*',
              'react-*',
              'zustand/*',
              '@testing-library/*',
              // App layers that engine/ must never reach back into:
              '**/components/**',
              '**/store/**',
              '**/render/**',
              '**/canvas/**',
              '**/hooks/**',
              '**/App',
              '**/App.tsx',
              '**/main',
              '**/main.tsx',
            ],
            message: PURITY_MSG,
          },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      ...[
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Image',
        'Path2D',
        'OffscreenCanvas',
        'HTMLCanvasElement',
        'CanvasRenderingContext2D',
      ].map((name) => ({ name, message: PURITY_MSG })),
    ],
  },
};

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  enginePurity,
  prettier,
]);
