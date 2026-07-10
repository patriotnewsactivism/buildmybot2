import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    // test/integration/** needs a real local Postgres on 127.0.0.1:5432 (the
    // parked Railway/Drizzle backend's DB) which neither this sandbox nor
    // CI has running. Exclude from the default run; use test:integration
    // locally against a real DB when actually working on that backend.
    exclude: ['**/node_modules/**', '**/test/integration/**'],
  },
});
