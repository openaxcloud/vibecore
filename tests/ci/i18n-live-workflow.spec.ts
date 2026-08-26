import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const workflowPath = resolve('.github/workflows/i18n-live-audit.yml');

describe('French i18n live audit CI contract', () => {
  it('protects pull requests and the integrated main branch', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/on:\n\s+pull_request:\n\s+push:\n\s+branches: \[main\]\n\s+workflow_dispatch:/u);
  });

  it('runs the exhaustive collector once so retries cannot multiply its proof set', async () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('--retries=0');

    vi.resetModules();
    const { default: config } = await import('../../playwright.i18n.config');

    expect(config.retries).toBe(0);
    expect(config.preserveOutput).toBe('always');
  });
});
