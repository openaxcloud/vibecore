import { defineConfig } from '@playwright/test';
import standard from './playwright.config';

export default defineConfig({
  ...standard,
  testMatch: 'ide-mobile-chrome.spec.ts',
  webServer: undefined,
  retries: 0,
  outputDir: '.vibecore/ux-qa/mobile-gate-results',
  reporter: [['list'], ['json', { outputFile: '.vibecore/ux-qa/mobile-gate-results.json' }]],
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
