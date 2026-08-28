/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // tracks/*.json are imported from the repo root at build time (one source of truth)
    fs: { allow: ['..'] },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      // The pure engine is held to a per-file gate (CLAUDE.md app rule 4, adopted
      // from f1-telemetry-replay): a new untested module fails on its own.
      enabled: true,
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      exclude: ['src/engine/**/*.test.ts', 'src/engine/**/__fixtures__/**'],
      thresholds: { perFile: true, lines: 90, branches: 90, functions: 90, statements: 90 },
      reporter: ['text-summary'],
    },
  },
});
