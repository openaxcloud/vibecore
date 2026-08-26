import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
