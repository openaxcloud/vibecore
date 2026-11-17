import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { browserDestinationAllowed as allowed } from './baseline-policy.js';

it('permits only the fixed app and path-scoped preview loopback origins', () => {
  const app = 'http://127.0.0.1:5173';
  const preview = 'http://127.0.0.1:3020';
  expect(allowed(app + '/register', app, preview)).toBe(true);
  expect(allowed(preview + '/p/ws-one/5173/', app, preview)).toBe(true);
  expect(allowed('ws://127.0.0.1:3020/p/ws-one/5173/hmr', app, preview)).toBe(true);

  for (const target of [
    preview + '/admin',
    preview + '/api/chat',
    app + '/api/chat',
    'http://127.0.0.1:9999/p/w/1/',
    'https://example.test/p/w/1/',
  ]) {
    expect(allowed(target, app, preview)).toBe(false);
  }
  expect(allowed(preview + '/p/w/1/', app)).toBe(false);
  expect(() => allowed(app, app, 'http://example.test:3020')).toThrow();
});

it('reports canonical preservation only after a complete verified success', () => {
  const directory = mkdtempSync(join(tmpdir(), 'same-pvc-summary-'));
  const script = resolve('scripts/aster-browser/same-pvc-summary.mjs');
  const workflowSha = 'a'.repeat(40);
  const env = { GITHUB_WORKFLOW_SHA: workflowSha, RECIPE_OUTCOME: 'success', CLEANUP_OUTCOME: 'success' };

  const run = (overrides = {}) =>
    spawnSync(process.execPath, [script], {
      cwd: directory,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 10_000,
    });

  try {
    const absent = run();
    expect(absent.status).toBe(1);
    expect(absent.stdout).toContain('Canonical preservation was not verified.');
    expect(absent.stdout).not.toContain('Canonical file kept intact');
    mkdirSync(join(directory, 'private-runtime-evidence'));
    writeFileSync(
      join(directory, 'private-runtime-evidence/result.json'),
      JSON.stringify({
        ok: true,
        scope: 'authenticated-browser-same-pvc-reseed',
        volumeReplacement: 'same-pvc-new-pod',
        podBytes: 'canonical-and-orphan-witnesses-checked',
        sourceAttestation: { productSha: '5d352aaf354b6098b0a2ad4283b4ba48d76f9ad7', workflowSha },
      }),
    );

    const success = run();
    expect(success.status).toBe(0);
    expect(success.stdout).toContain('Canonical file kept intact');

    for (const overrides of [
      { RECIPE_OUTCOME: 'failure' },
      { CLEANUP_OUTCOME: 'failure' },
      { GITHUB_WORKFLOW_SHA: 'b'.repeat(40) },
    ]) {
      const failure = run(overrides);
      expect(failure.status).toBe(1);
      expect(failure.stdout).toContain('NOT VERIFIED');
      expect(failure.stdout).not.toContain('Canonical file kept intact');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
