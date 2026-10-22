import { defineConfig } from '@playwright/test';
import standard from '../../playwright.config';

export default defineConfig({
  ...standard,
  testDir: '../../tests/e2e',
  testMatch: 'ide-mobile-chrome.spec.ts',
  webServer: undefined,
  retries: 0,
  outputDir: '/tmp/vibecore-final-4ec/mobile-confirmed',
  reporter: [['list'], ['json', { outputFile: '/tmp/vibecore-final-4ec/mobile-confirmed.json' }]],
  projects: standard.projects
    ?.filter((project) => project.name === 'chromium')
    .map((project) => ({
      ...project,
      use: {
        ...project.use,
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
          : undefined,
      },
    })),
});
