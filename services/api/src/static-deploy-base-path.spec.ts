import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { snapshotStaticBuild } from './deployments.js';

/*
 * BUG-DEPLOY-LIVE — "quand je déploie, ça marche pas".
 *
 * Reproduced live on the audit test env (2026-08-12), static deployment
 * `cmspyoxst000l0na32v10bj3n`:
 *   - the deployment HTML served 200 on its dedicated origin
 *     `s-<id>.preview.<domain>/`
 *   - but referenced `/static-deployments/<id>/assets/index-*.js`, which
 *     returned 404 `STATIC_DEPLOY_FILE_NOT_FOUND`
 *   - while the very same asset at `/assets/index-*.js` returned 200 (142 KB)
 * => the document loads, every asset fails, `<div id="root">` stays empty:
 *    a blank deployed app.
 *
 * Cause: `snapshotStaticBuild` rewrote root-absolute URLs with the
 * `/static-deployments/<id>/` prefix unconditionally. That prefix only fits the
 * LEGACY path-based serving mode; when `PREVIEW_DOMAIN` is set the snapshot is
 * served at the ROOT of a dedicated origin, so the prefixed path is resolved as
 * a file inside the snapshot and cannot exist.
 */

const DEPLOYMENT_ID = 'cmspyoxst000l0na32v10bj3n';

const INDEX_HTML = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <title>QA Panels Sweep</title>',
  '    <script type="module" crossorigin src="/assets/index-CZ8Vosv_.js"></script>',
  '    <link rel="stylesheet" crossorigin href="/assets/index-BzjJVwsc.css">',
  '  </head>',
  '  <body><div id="root"></div></body>',
  '</html>',
].join('\n');

let workDir: string;
let outputDir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'vc-static-deploy-'));
  outputDir = join(workDir, 'dist');
  await mkdir(outputDir, { recursive: true });
  await mkdir(join(outputDir, 'assets'), { recursive: true });
  await writeFile(join(outputDir, 'index.html'), INDEX_HTML, 'utf8');
  await writeFile(join(outputDir, 'assets', 'index-CZ8Vosv_.js'), '/* bundle */', 'utf8');

  savedEnv.PREVIEW_DOMAIN = process.env.PREVIEW_DOMAIN;
  savedEnv.STATIC_DEPLOY_STORAGE_DIR = process.env.STATIC_DEPLOY_STORAGE_DIR;
  process.env.STATIC_DEPLOY_STORAGE_DIR = join(workDir, 'snapshots');
});

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  await rm(workDir, { recursive: true, force: true });
});

async function snapshotIndexHtml() {
  const indexPath = await snapshotStaticBuild(DEPLOYMENT_ID, outputDir);
  expect(indexPath).toBeTruthy();

  return readFile(indexPath!, 'utf8');
}

describe('snapshotStaticBuild — base path vs serving mode', () => {
  it('keeps root-absolute asset URLs when the deployment has a dedicated origin', async () => {
    // Production shape: PREVIEW_DOMAIN set => served at the ROOT of s-<id>.preview.<domain>
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';

    const html = await snapshotIndexHtml();

    // This is the assertion that FAILS before the fix (the prefix was injected).
    expect(html).toContain('src="/assets/index-CZ8Vosv_.js"');
    expect(html).toContain('href="/assets/index-BzjJVwsc.css"');
    expect(html).not.toContain(`/static-deployments/${DEPLOYMENT_ID}/`);
  });

  it('still prefixes for the legacy path-based mode when no dedicated origin exists', async () => {
    delete process.env.PREVIEW_DOMAIN;

    const html = await snapshotIndexHtml();

    expect(html).toContain(`src="/static-deployments/${DEPLOYMENT_ID}/assets/index-CZ8Vosv_.js"`);
    expect(html).toContain(`href="/static-deployments/${DEPLOYMENT_ID}/assets/index-BzjJVwsc.css"`);
  });

  it('copies the asset tree so the root-absolute paths resolve at the snapshot root', async () => {
    process.env.PREVIEW_DOMAIN = 'preview.e-code.ai';
    await snapshotIndexHtml();

    const snapshotAsset = join(
      process.env.STATIC_DEPLOY_STORAGE_DIR!,
      DEPLOYMENT_ID,
      'assets',
      'index-CZ8Vosv_.js',
    );

    await expect(readFile(snapshotAsset, 'utf8')).resolves.toContain('bundle');
  });
});
