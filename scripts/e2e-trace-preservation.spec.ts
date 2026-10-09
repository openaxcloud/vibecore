import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name?: string;
  run?: string;
  if?: string;
  with?: { path?: string };
}

interface Workflow {
  jobs: { e2e: { steps: Step[] } };
}

const workflow = parse(readFileSync('.github/workflows/e2e.yml', 'utf8')) as Workflow;
const steps = workflow.jobs.e2e.steps;
const tranche = steps.find((step) => step.name === 'Playwright auth, project, IDE, terminal, billing mock flows');
const responsive = steps.find((step) => step.name === 'Playwright mobile viewport tests');
const upload = steps.find((step) => step.name === 'Upload E2E traces');

function outputDirectory(step: Step | undefined): string {
  return step?.run?.match(/--output=([^\s]+)/)?.[1] ?? 'test-results';
}

describe('E2E retry evidence survives the following Playwright invocation', () => {
  it('keeps tranche and responsive outputs separate, both always uploaded', () => {
    expect(tranche).toBeDefined();
    expect(responsive).toBeDefined();
    expect(outputDirectory(tranche)).not.toBe(outputDirectory(responsive));
    expect(upload?.if).toBe('always()');

    const paths = upload?.with?.path?.trim().split(/\s+/) ?? [];
    expect(paths).toContain(outputDirectory(tranche));
    expect(paths).toContain(outputDirectory(responsive));
  });

  it('exercises the real runner: a failed tranche diagnostic survives a successful responsive run', () => {
    const root = mkdtempSync(join(tmpdir(), 'vibecore-trace-preservation-'));
    const require = createRequire(import.meta.url);
    const entry = require.resolve('@playwright/test');
    const cli = join(entry, '..', 'cli.js');
    const first = join(root, outputDirectory(tranche));
    const second = join(root, outputDirectory(responsive));
    const tests = join(root, 'specs');
    mkdirSync(tests);

    const config = join(root, 'playwright.config.mjs');

    try {
      writeFileSync(config, 'export default {testDir:"./specs", retries:0, workers:1, reporter:"list"};');
      writeFileSync(
        join(tests, 'diagnostics.spec.mjs'),
        `import playwright from ${JSON.stringify(pathToFileURL(entry).href)};
const {test,expect} = playwright;
import {writeFileSync} from 'node:fs';
test('failed tranche', async ({}, info) => {
  writeFileSync(info.outputPath('diagnostic.txt'), 'first-run evidence');
  expect(false).toBe(true);
});
test('responsive pass', async () => { expect(true).toBe(true); });`,
      );

      const run = (name: string, output: string) =>
        spawnSync(process.execPath, [cli, 'test', '--config', config, '--grep', name, '--output', output], {
          cwd: root,
          timeout: 30_000,
          encoding: 'utf8',
          env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
        });

      const failed = run('failed tranche', first);
      expect(failed.error, failed.stderr).toBeUndefined();
      expect(failed.status, failed.stdout + failed.stderr).toBe(1);

      const diagnostic = join(first, 'diagnostics-failed-tranche', 'diagnostic.txt');
      expect(existsSync(diagnostic), failed.stdout + failed.stderr).toBe(true);

      const passed = run('responsive pass', second);
      expect(passed.error, passed.stderr).toBeUndefined();
      expect(passed.status, passed.stdout + passed.stderr).toBe(0);
      expect(readFileSync(diagnostic, 'utf8')).toBe('first-run evidence');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains the aggregate verdict and the JSON report instead of weakening failures', () => {
    expect(tranche?.run).toContain('PLAYWRIGHT_JSON_OUTPUT_NAME=playwright-results.json');
    expect(tranche?.run).toContain('--reporter=list,json');
    expect(steps.find((step) => step.name === 'Rapport de la tranche')?.with?.path).toBe('playwright-results.json');
    expect(readFileSync('.github/workflows/e2e.yml', 'utf8')).toContain('node scripts/e2e-gate.mjs');
  });
});
