import { defineConfig, devices } from '@playwright/test';

import baseConfig from './playwright.config';

/**
 * Exhaustive EN/FR proof matrix. Kept separate from the everyday E2E config so
 * normal feature suites do not pay for four full responsive crawls.
 */
export default defineConfig({
  ...baseConfig,
  workers: 1,
  projects: [
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'desktop-1024',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 900 },
      },
    },
    {
      name: 'tablet-768',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile-390',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
