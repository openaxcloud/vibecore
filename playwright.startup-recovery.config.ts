import { defineConfig } from '@playwright/test';

// A local production web server must already be running. One Chromium engine.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['login-catalogue-recovery.spec.ts', 'platform-typography.spec.ts'],
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/startup-recovery/results.json' }]],
  outputDir: 'test-results/startup-recovery/artifacts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/usr/bin/chromium' },
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
  },
});
