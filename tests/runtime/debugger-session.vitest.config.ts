import base from '../../vite.config';
import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig(async (env) =>
  mergeConfig(typeof base === 'function' ? await base(env) : await base, {
    test: {
      include: ['tests/runtime/debugger-session.real.ts'],
      exclude: ['node_modules/**'],
      fileParallelism: false,
      maxWorkers: 1,
    },
  }),
);
