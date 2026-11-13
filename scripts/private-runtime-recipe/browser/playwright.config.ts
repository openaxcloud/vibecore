import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'journey.pw.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 480_000,
  globalTimeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: [['./reporter.ts']],
  outputDir: `${process.env.RUNNER_TEMP ?? '/tmp'}/private-browser-results`,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    locale: 'en-US',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'node_modules/.bin/react-router-serve ./build/server/index.js',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:5173/login',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'ignore',
    env: {
      HOST: '127.0.0.1',
      PORT: '5173',
      NODE_ENV: 'production',
      SAAS_API_URL: 'http://127.0.0.1:3001',
      API_BASE_URL: 'http://127.0.0.1:3001',
    },
  },
});
