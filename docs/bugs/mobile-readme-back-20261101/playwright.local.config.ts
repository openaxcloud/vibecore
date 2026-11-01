import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
// eslint-disable-next-line no-restricted-imports -- The repository config is outside the app alias.
import base from '../../../playwright.config';

const engine = process.env.README_ENGINE === 'webkit' ? 'webkit' : 'chromium';

export default defineConfig({
  ...base,
  testDir: fileURLToPath(new URL('../../../tests/e2e', import.meta.url)),
  webServer: undefined,
  retries: 0,
  outputDir: process.env.README_EVIDENCE_DIR ?? '/workspace/readme-repro-final',
  use: { ...base.use, baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:18210', trace: 'on' },
  projects: [
    {
      name: engine,
      use: {
        ...base.projects![0].use,
        browserName: engine,
        launchOptions: {
          executablePath:
            process.env.README_BROWSER ??
            (engine === 'webkit' ? '/workspace/.cache/ms-playwright/webkit-2272/pw_run.sh' : '/usr/bin/chromium'),
        },
      },
    },
  ],
});
