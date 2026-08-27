import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateRenderedBaseline } from './assert-rendered-baseline.mjs';
import {
  classifyRenderedCapture,
  createWarcResponseRecord,
  validateWarcResponseRecord,
} from './collector-integrity.mjs';
import { loadCollectorWorkflowContract, validateCollectorWorkflowContract } from './validate-collector-workflow.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function replaceRequired(source, from, to) {
  assert.ok(source.includes(from), `mutation target not found: ${from}`);
  return source.replace(from, to);
}

test('the committed collector workflow satisfies its deterministic browser contract', () => {
  const contract = loadCollectorWorkflowContract(repoRoot);
  assert.deepEqual(validateCollectorWorkflowContract(contract), []);
});

test('mutation proofs reject every liveness regression in the collector workflow', async (t) => {
  const baseline = loadCollectorWorkflowContract(repoRoot);
  const mutations = [
    {
      name: 'mutable dependency install',
      workflowSource: replaceRequired(baseline.workflowSource, 'timeout 2m npm ci', 'timeout 2m npm install'),
      expected: /npm ci|npm install/,
    },
    {
      name: 'implicit global browser runner',
      workflowSource: replaceRequired(
        baseline.workflowSource,
        'timeout 8m scripts/parity/collector-runtime/node_modules/.bin/playwright',
        'timeout 8m playwright',
      ),
      expected: /pinned local Playwright/,
    },
    {
      name: 'browser cache removed',
      workflowSource: replaceRequired(
        baseline.workflowSource,
        'path: ~/.cache/ms-playwright',
        'path: ~/.cache/disabled-playwright-cache',
      ),
      expected: /browser cache/,
    },
    {
      name: 'explicit Playwright module removed',
      workflowSource: replaceRequired(
        baseline.workflowSource,
        'PARITY_PLAYWRIGHT_MODULE:',
        'PARITY_PLAYWRIGHT_GLOBAL:',
      ),
      expected: /explicit local Playwright module/,
    },
    {
      name: 'unbounded browser installation',
      workflowSource: replaceRequired(baseline.workflowSource, 'timeout 8m scripts/parity', 'scripts/parity'),
      expected: /timeout/,
    },
    {
      name: 'render gate removed',
      workflowSource: replaceRequired(
        baseline.workflowSource,
        'timeout 1m node scripts/parity/assert-rendered-baseline.mjs',
        'timeout 1m node scripts/parity/collect-baseline.mjs',
      ),
      expected: /rendered-baseline gate|before the snapshot commit/,
    },
    {
      name: 'failure diagnostics no longer retained',
      workflowSource: replaceRequired(
        baseline.workflowSource,
        '- name: Preserve collector artifacts and diagnostics\n        if: always()',
        '- name: Preserve collector artifacts and diagnostics\n        if: success()',
      ),
      expected: /uploaded even on failure/,
    },
    {
      name: 'only the manifest is uploaded',
      workflowSource: replaceRequired(
        baseline.workflowSource,
        '            ${{ steps.collect.outputs.snapshot_dir }}\n      - name: Commit',
        '            ${{ steps.collect.outputs.snapshot_dir }}/manifest.json\n      - name: Commit',
      ),
      expected: /complete snapshot directory/,
    },
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, () => {
      const errors = validateCollectorWorkflowContract({ ...baseline, workflowSource: mutation.workflowSource });
      assert.ok(
        errors.some((error) => mutation.expected.test(error)),
        errors.join('\n'),
      );
    });
  }
});

test('dependency mutations reject ranges and undeclared collector packages', async (t) => {
  const baseline = loadCollectorWorkflowContract(repoRoot);

  await t.test('Playwright version range', () => {
    const runtimePackage = structuredClone(baseline.runtimePackage);
    runtimePackage.dependencies.playwright = '^1.59.1';
    const errors = validateCollectorWorkflowContract({ ...baseline, runtimePackage });
    assert.ok(
      errors.some((error) => /pinned exactly/.test(error)),
      errors.join('\n'),
    );
  });

  await t.test('extra runtime dependency', () => {
    const runtimePackage = structuredClone(baseline.runtimePackage);
    runtimePackage.dependencies.axios = '1.0.0';
    const errors = validateCollectorWorkflowContract({ ...baseline, runtimePackage });
    assert.ok(
      errors.some((error) => /dependencies must be exactly/.test(error)),
      errors.join('\n'),
    );
  });

  await t.test('extra lockfile root dependency', () => {
    const runtimeLock = structuredClone(baseline.runtimeLock);
    runtimeLock.packages[''].dependencies.axios = '1.0.0';
    const errors = validateCollectorWorkflowContract({ ...baseline, runtimeLock });
    assert.ok(
      errors.some((error) => /lockfile root dependencies must be exactly/.test(error)),
      errors.join('\n'),
    );
  });
});

test('render gate verifies all three HTML artifacts and their manifest hashes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'parity-render-gate-'));
  const sources = {};

  for (const sourceId of ['pricing', 'gallery', 'community']) {
    const file = `${sourceId}.rendered.html`;
    const body = Buffer.from(`<html><body>${sourceId}${'x'.repeat(1_100)}</body></html>`, 'utf8');
    const renderedTextFile = `${sourceId}.rendered.txt`;
    const renderedText = Buffer.from(`${sourceId} ${'rendered product copy '.repeat(20)}`, 'utf8');
    const archiveFile = `${sourceId}.warc`;
    const url = `https://replit.com/${sourceId}`;
    const archive = createWarcResponseRecord({
      url,
      capturedAt: '2026-08-27T00:00:00.000Z',
      httpStatus: 200,
      contentType: 'text/html; charset=utf-8',
      body,
    });
    writeFileSync(join(directory, file), body);
    writeFileSync(join(directory, renderedTextFile), renderedText);
    writeFileSync(join(directory, archiveFile), archive);
    sources[sourceId] = {
      url,
      finalUrl: url,
      family: 'product-route',
      status: 'OK',
      rendered: true,
      httpStatus: 200,
      file,
      bytes: body.length,
      sha256: sha256(body),
      renderedTextFile,
      renderedTextBytes: renderedText.length,
      renderedTextSha256: sha256(renderedText),
      archiveFormat: 'WARC/1.1',
      archiveFile,
      archiveSha256: sha256(archive),
    };
  }

  const manifestPath = join(directory, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ sources }));
  assert.deepEqual(validateRenderedBaseline(manifestPath), []);

  writeFileSync(join(directory, 'pricing.rendered.html'), '<html><body>tampered</body></html>');
  assert.match(validateRenderedBaseline(manifestPath).join('\n'), /pricing: manifest bytes .* do not match/);

  const pricingBody = Buffer.from(`<html><body>pricing${'x'.repeat(1_100)}</body></html>`, 'utf8');
  writeFileSync(join(directory, 'pricing.rendered.html'), pricingBody);
  const pricingArchivePath = join(directory, 'pricing.warc');
  const corruptedArchive = Buffer.from(readFileSync(pricingArchivePath));
  const pricingPayloadOffset = corruptedArchive.indexOf('pricingxxxxxxxx');
  assert.ok(pricingPayloadOffset > 0);
  corruptedArchive[pricingPayloadOffset] ^= 1;
  writeFileSync(pricingArchivePath, corruptedArchive);
  assert.match(validateRenderedBaseline(manifestPath).join('\n'), /pricing: WARC.*digest mismatch/);

  const unavailable = JSON.parse(readFileSync(manifestPath, 'utf8'));
  unavailable.sources.community = {
    status: 'RENDER_UNAVAILABLE',
    error: 'playwright not installed',
  };
  writeFileSync(manifestPath, JSON.stringify(unavailable));
  assert.match(validateRenderedBaseline(manifestPath).join('\n'), /community: expected status OK/);
});

test('collector failure contracts classify every P1-A2-13 outage fail-closed', async (t) => {
  const hydratedHtml = `<html><body>${'usable product content '.repeat(40)}</body></html>`;
  const hydratedText = 'usable product content '.repeat(40);

  await t.test('bot blocking', () => {
    assert.deepEqual(
      classifyRenderedCapture({
        requestedUrl: 'https://replit.com/gallery',
        finalUrl: 'https://replit.com/gallery',
        httpStatus: 200,
        html: hydratedHtml,
        text: 'Please verify that you are human before continuing.',
      }),
      { status: 'BLOCKED', httpStatus: 200, error: 'bot-detection block' },
    );
  });

  await t.test('incomplete JavaScript render', () => {
    assert.equal(
      classifyRenderedCapture({
        requestedUrl: 'https://replit.com/pricing',
        finalUrl: 'https://replit.com/pricing',
        httpStatus: 200,
        html: `<html><body><div id="root"></div>${'<script></script>'.repeat(100)}</body></html>`,
        text: '',
      }).status,
      'INCOMPLETE_RENDER',
    );
    assert.equal(
      classifyRenderedCapture({
        sourceId: 'gallery',
        requestedUrl: 'https://replit.com/gallery',
        finalUrl: 'https://replit.com/gallery',
        httpStatus: 200,
        html: hydratedHtml,
        text: 'navigation chrome without the required route content '.repeat(20),
      }).status,
      'INCOMPLETE_RENDER',
    );
  });

  await t.test('route changed to authenticated access', () => {
    assert.equal(
      classifyRenderedCapture({
        requestedUrl: 'https://replit.com/community',
        finalUrl: 'https://replit.com/login?next=%2Fcommunity',
        httpStatus: 200,
        html: hydratedHtml,
        text: hydratedText,
      }).status,
      'AUTH_REQUIRED',
    );
    assert.equal(
      classifyRenderedCapture({
        requestedUrl: 'https://replit.com/community',
        finalUrl: 'https://replit.com/community',
        httpStatus: 200,
        html: '<html><body><form><input type="password"></form></body></html>',
        text: 'Sign in to continue',
      }).status,
      'AUTH_REQUIRED',
    );
    assert.equal(
      classifyRenderedCapture({
        requestedUrl: 'https://replit.com/community',
        finalUrl: 'https://replit.com/community',
        httpStatus: 200,
        html: `${hydratedHtml}<input type="password" hidden>`,
        text: `${hydratedText.repeat(3)} Sign in`,
      }).status,
      'OK',
    );
  });

  await t.test('route removed', () => {
    assert.deepEqual(
      classifyRenderedCapture({
        requestedUrl: 'https://replit.com/gallery',
        finalUrl: 'https://replit.com/gallery',
        httpStatus: 404,
        html: hydratedHtml,
        text: hydratedText,
      }),
      { status: 'ROUTE_REMOVED', httpStatus: 404, error: 'route returned HTTP 404' },
    );
  });

  await t.test('invalid WARC archive', () => {
    const payload = Buffer.from('<html><body>archive-payload</body></html>');
    const archive = createWarcResponseRecord({
      url: 'https://replit.com/pricing',
      capturedAt: '2026-08-27T00:00:00.000Z',
      httpStatus: 200,
      contentType: 'text/html; charset=utf-8',
      body: payload,
      recordId: '01234567-89ab-4def-8123-456789abcdef',
    });
    assert.deepEqual(
      validateWarcResponseRecord(archive, {
        url: 'https://replit.com/pricing',
        httpStatus: 200,
        body: payload,
      }),
      [],
    );

    const corrupted = Buffer.from(archive);
    const payloadOffset = corrupted.indexOf('archive-payload');
    assert.ok(payloadOffset > 0);
    corrupted[payloadOffset] ^= 1;
    assert.match(validateWarcResponseRecord(corrupted).join('\n'), /digest mismatch/);
  });
});
