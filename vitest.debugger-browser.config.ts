import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config';
export default defineConfig(async (env) =>
  mergeConfig(typeof base === 'function' ? await base(env) : await base, {
    test: {
      include: ['tests/runtime/debugger-browser.real.ts'],
      exclude: ['node_modules/**'],
      fileParallelism: false,
      maxWorkers: 1,
    },
  }),
);
