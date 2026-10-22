import { defineConfig } from '@playwright/test';
import standard from '../../playwright.config';
export default defineConfig({
  ...standard,
  testDir: '../../tests/e2e',
  testMatch: ['ide-mobile-file-restore.spec.ts', 'ide-floating-file-tabs.spec.ts'],
  webServer: undefined,
  retries: 0,
  workers: 1,
  outputDir: '/tmp/vibecore-final-4ec/files/results',
  reporter: [['list'], ['json', { outputFile: '/tmp/vibecore-final-4ec/files/results.json' }]],
  projects: [{name:'chromium',use:{...standard.projects?.find(p=>p.name==='chromium')?.use,launchOptions:{executablePath:'/usr/bin/chromium'}}}],
});
