import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { test } from 'vitest';
import { browserFixtureArchive, originalMarker, editedMarker, fixtureHtml } from './fixture.js';
import { assertBrowserRecipeEnvironment, browserValidationRef, browserBuildEnvironment } from './guards.js';

test('browser recipe accepts only its explicit mode and exact isolated push', () => {
  const env = { PRIVATE_RUNTIME_BROWSER_RECIPE: '1', GITHUB_EVENT_NAME: 'push', GITHUB_REF: browserValidationRef };
  assertBrowserRecipeEnvironment(env);

  for (const update of [
    { GITHUB_REF: browserValidationRef + '-other' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { PRIVATE_RUNTIME_BROWSER_RECIPE: '0' },
    { ANTHROPIC_API_KEY: 'not-a-real-key' },
    { GOOGLE_APPLICATION_CREDENTIALS: '/not-a-real-credential-file' },
  ]) {
    assert.throws(() => assertBrowserRecipeEnvironment({ ...env, ...update }));
  }
  assertBrowserRecipeEnvironment({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' });
});

test('imported fixture contains real static content and a dependency-free Node server', async () => {
  const zip = await JSZip.loadAsync(await browserFixtureArchive());
  assert.match(await zip.file('index.html')!.async('string'), new RegExp(originalMarker));

  const pkg = JSON.parse(await zip.file('package.json')!.async('string'));
  assert.equal(pkg.scripts.dev, 'node server.cjs');
  assert.equal(pkg.dependencies, undefined);
  assert.match(await zip.file('server.cjs')!.async('string'), /readFileSync\('index.html'\)/);
});

test('browser workflow is isolated and preserves the existing recipe workflow', () => {
  const workflow = readFileSync('.github/workflows/private-runtime-browser.yml', 'utf8');
  assert.match(workflow, /branches: \[validation\/private-runtime-browser-20261113\]/);
  assert.ok(!/secrets\.|id-token:|pull_request:|workflow_run:/.test(workflow));
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /PRIVATE_RUNTIME_BROWSER_RECIPE: '1'/);

  const previous = readFileSync('.github/workflows/private-runtime-recipe.yml', 'utf8');
  assert.ok(!previous.includes('PRIVATE_RUNTIME_BROWSER_RECIPE'));
});

test('controlled imported app really serves edited file bytes over HTTP', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vc-browser-fixture-'));
  const archive = await JSZip.loadAsync(await browserFixtureArchive());

  for (const name of ['server.cjs', 'index.html']) {
    writeFileSync(join(directory, name), await archive.file(name)!.async('nodebuffer'));
  }

  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: directory,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Fixture server did not start')), 10_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.stdout.on('data', (chunk: Buffer) => {
        const match = chunk.toString().match(/localhost:(\d+)/);

        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), fixtureHtml(originalMarker));
    writeFileSync(join(directory, 'index.html'), fixtureHtml(editedMarker));
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), fixtureHtml(editedMarker));
  } finally {
    child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('browser build is pinned to the real local API rather than WebContainer', () => {
  assert.equal(browserBuildEnvironment.RUNTIME_MODE, 'remote-kubernetes');
  assert.equal(browserBuildEnvironment.RUNTIME_API_BASE_URL, 'http://127.0.0.1:3001/api/runtime');
});
