import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workflows = [
  {
    path: '.github/workflows/e2e.yml',
    diagnostics: '/tmp/vibecore-e2e-dependencies.log',
  },
  {
    path: '.github/workflows/e2e-runtime.yml',
    diagnostics: '/tmp/vibecore-e2e-runtime-dependencies.log',
  },
  {
    path: '.github/workflows/i18n-live-audit.yml',
    diagnostics: '/tmp/vibecore-i18n-dependencies-${{ matrix.project }}.log',
  },
] as const;

describe('Playwright local-stack workflow contracts', () => {
  for (const workflow of workflows) {
    const source = readFileSync(resolve(workflow.path), 'utf8');

    it(`${workflow.path} waits for healthy dependencies before migrations`, () => {
      expect(source).toContain(
        'docker compose --env-file .env -f docker-compose.dev.yml up -d --wait --wait-timeout 180 postgres redis mailpit',
      );

      const startIndex = source.indexOf('- name: Start local dependencies');
      const migrateIndex = source.indexOf('- name: Prepare database');

      expect(startIndex).toBeGreaterThan(-1);
      expect(migrateIndex).toBeGreaterThan(startIndex);
    });

    it(`${workflow.path} uploads dependency diagnostics even before Playwright produces results`, () => {
      expect(source).toContain('- name: Collect local stack diagnostics');
      expect(source).toContain('if: always()');
      expect(source.split(workflow.diagnostics)).toHaveLength(4);
      expect(source).toContain('logs --no-color postgres redis mailpit');
    });
  }
});
