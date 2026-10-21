import { defineConfig } from '@playwright/test';
import original from './playwright.ux-audit.config';

const output = process.env.UX_INTEGRATION_REPORT_DIR ?? '/tmp/vibecore-ux-combined';

export default defineConfig({
  ...original,
  testMatch: ['snapshot-cancel-focus.spec.ts', 'agent-header-menu-keyboard.spec.ts'],
  outputDir: `${output}/results`,
  reporter: [['list'], ['json', { outputFile: `${output}/results.json` }]],
});
