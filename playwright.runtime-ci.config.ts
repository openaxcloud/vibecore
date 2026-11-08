import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests/runtime-ci',
  testMatch: '**/*.pw.ts',
  outputDir: 'tmp/runtime-ci-preflight-results',
  retries: 0,
  maxFailures: 0,
});
