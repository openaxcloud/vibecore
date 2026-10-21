import { defineConfig } from '@playwright/test';
import standard from './playwright.config';

/*
 * Use the repository's standard profiles when requested. Only the local browser
 * binary and already-running compiled server differ from the normal runner.
 */
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  : undefined;

export default defineConfig({
  ...standard,
  testMatch: 'snapshot-cancel-focus.spec.ts',
  outputDir: '.vibecore/ux-qa/review-results',
  webServer: undefined,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '.vibecore/ux-qa/review-results.json' }]],
  projects:
    process.env.UX_STANDARD_CONFIG === '1'
      ? standard.projects?.map((project) => ({
          ...project,
          use: {
            ...project.use,
            ...(project.use?.browserName !== 'webkit' ? { launchOptions } : {}),
          },
        }))
      : [
          { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, launchOptions } },
          { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, hasTouch: true, launchOptions } },
          {
            name: 'mobile',
            use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, launchOptions },
          },
        ],
});
