import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateRenderedBaseline } from './assert-rendered-baseline.mjs';
import {
  loadCollectorWorkflowContract,
  validateCollectorWorkflowContract,
} from './validate-collector-workflow.mjs';

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
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, () => {
      const errors = validateCollectorWorkflowContract({ ...baseline, workflowSource: mutation.workflowSource });
      assert.ok(errors.some((error) => mutation.expected.test(error)), errors.join('\n'));
    });
  }
});

test('dependency mutations reject ranges and undeclared collector packages', async (t) => {
  const baseline = loadCollectorWorkflowContract(repoRoot);

  await t.test('Playwright version range', () => {
    const runtimePackage = structuredClone(baseline.runtimePackage);
    runtimePackage.dependencies.playwright = '^1.59.1';
    const errors = validateCollectorWorkflowContract({ ...baseline, runtimePackage });
    assert.ok(errors.some((error) => /pinned exactly/.test(error)), errors.join('\n'));
  });

  await t.test('extra runtime dependency', () => {
    const runtimePackage = structuredClone(baseline.runtimePackage);
    runtimePackage.dependencies.axios = '1.0.0';
    const errors = validateCollectorWorkflowContract({ ...baseline, runtimePackage });
    assert.ok(errors.some((error) => /dependencies must be exactly/.test(error)), errors.join('\n'));
  });

  await t.test('extra lockfile root dependency', () => {
    const runtimeLock = structuredClone(baseline.runtimeLock);
    runtimeLock.packages[''].dependencies.axios = '1.0.0';
    const errors = validateCollectorWorkflowContract({ ...baseline, runtimeLock });
    assert.ok(errors.some((error) => /lockfile root dependencies must be exactly/.test(error)), errors.join('\n'));
  });
});

test('render gate verifies all three HTML artifacts and their manifest hashes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'parity-render-gate-'));
  const sources = {};

  for (const sourceId of ['pricing', 'gallery', 'community']) {
    const file = `${sourceId}.rendered.html`;
    const body = Buffer.from(`<html><body>${sourceId}${'x'.repeat(1_100)}</body></html>`, 'utf8');
    writeFileSync(join(directory, file), body);
    sources[sourceId] = {
      family: 'product-route',
      status: 'OK',
      rendered: true,
      file,
      bytes: body.length,
      sha256: sha256(body),
    };
  }

  const manifestPath = join(directory, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ sources }));
  assert.deepEqual(validateRenderedBaseline(manifestPath), []);

  writeFileSync(join(directory, 'pricing.rendered.html'), '<html><body>tampered</body></html>');
  assert.match(validateRenderedBaseline(manifestPath).join('\n'), /pricing: manifest bytes .* do not match/);

  const unavailable = JSON.parse(readFileSync(manifestPath, 'utf8'));
  unavailable.sources.community = {
    status: 'RENDER_UNAVAILABLE',
    error: 'playwright not installed',
  };
  writeFileSync(manifestPath, JSON.stringify(unavailable));
  assert.match(validateRenderedBaseline(manifestPath).join('\n'), /community: expected status OK/);
});
