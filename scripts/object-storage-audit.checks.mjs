import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  auditStorageBackendStatus,
  auditStorageUiCapability,
  matchesStorageStatusRequest,
  STORAGE_DISABLED_TEXT,
  STORAGE_ENABLE_TEXT,
  classifyStorageBackend,
  assertStorageProxy,
  StorageLifecycleUnverified,
  storageLifecycleEvidence,
} from './object-storage-audit.mjs';

const root = process.env.STORAGE_AUDIT_CONTRACT_SOURCE_ROOT ?? fileURLToPath(new URL('../', import.meta.url));
const source = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const audit = fs.readFileSync(new URL('./audit-ide-panels.mjs', import.meta.url), 'utf8');
const helper = fs.readFileSync(new URL('./object-storage-audit.mjs', import.meta.url), 'utf8');

test('disabled capability requires the real FEATURE_NOT_ENABLED response, not an arbitrary 404', () => {
  assert.deepEqual(classifyStorageBackend(404, { code: 'FEATURE_NOT_ENABLED' }), {
    enabled: false,
    provisioned: false,
  });

  for (const [status, body] of [
    [404, {}],
    [404, { code: 'BUCKET_NOT_PROVISIONED' }],
    [502, { code: 'FEATURE_NOT_ENABLED' }],
    [401, {}],
    [200, { enabled: false, provisioned: false }],
    [200, { enabled: true }],
    [200, { enabled: 'true', provisioned: false }],
    [200, { enabled: true, provisioned: false, error: 'failure' }],
  ]) {
    assert.throws(() => classifyStorageBackend(status, body));
  }
});

test('active backend status is distinguished without provisioning or claiming lifecycle success', () => {
  for (const provisioned of [false, true]) {
    assert.deepEqual(classifyStorageBackend(200, { enabled: true, provisioned }), { enabled: true, provisioned });
  }
});

test('disabled capability rejects contradictory flags even with FEATURE_NOT_ENABLED', () => {
  for (const fields of [{ enabled: true }, { provisioned: true }, { enabled: 'false' }, { provisioned: 1 }]) {
    assert.throws(() => classifyStorageBackend(404, { code: 'FEATURE_NOT_ENABLED', ...fields }));
  }
});

test('proxy must agree with independently checked backend, including status and boolean fields', () => {
  const disabled = { enabled: false, provisioned: false };
  assertStorageProxy(200, disabled, disabled);

  for (const [status, body] of [
    [502, disabled],
    [200, { enabled: false }],
    [200, { enabled: true, provisioned: false }],
    [200, { ...disabled, error: 'failure' }],
  ]) {
    assert.throws(() => assertStorageProxy(status, body, disabled));
  }
});

test('even a verified disabled or active UI state remains explicitly incomplete for acceptance', () => {
  for (const capability of [
    { enabled: false, provisioned: false },
    { enabled: true, provisioned: false },
    { enabled: true, provisioned: true },
  ]) {
    const evidence = storageLifecycleEvidence(capability, 2);
    const error = new StorageLifecycleUnverified(evidence);

    assert.equal(evidence.uiStateVerified, true);
    assert.equal(evidence.reloadVerified, true);
    assert.equal(evidence.activeLifecycle, 'not_verified');
    assert.equal(evidence.unverifiedOperations.length, 6);
    assert.match(error.message, /NOT VERIFIED/);
    assert.equal(storageLifecycleEvidence(capability, 1).reloadVerified, false);
  }

  assert.match(helper, /throw new StorageLifecycleUnverified\(storageLifecycleEvidence\(capability, 2\)\)/);
  assert.match(audit, /ok: false,\s*error: error instanceof Error[\s\S]*?storageEvidence: error.evidence/);
});

test('selectors and read-only probe match the existing component instead of the removed configuration form', () => {
  const component = source('app/components/chat/BaseChat.tsx');
  const copy = source('app/lib/i18n/catalogs/chat.ts');

  assert.ok(copy.includes(`'${STORAGE_DISABLED_TEXT}'`));
  assert.ok(copy.includes(`'${STORAGE_ENABLE_TEXT}'`));
  assert.match(component, /postIntent\(\{ intent: 'status' \}\)/);
  assert.match(component, /if \(enabled === false\)/);
  assert.match(component, /if \(provisioned === false\)/);
  assert.match(component, /bolt-project-object-storage-panel/);
  assert.doesNotMatch(audit, /getByPlaceholder\('vibecore-project-assets'\)|Save storage config/);
  assert.match(audit, /\['object-storage', form\(\{ intent: 'status' \}\)\]/);
  assert.match(helper, /page.reload\(\{ waitUntil: 'domcontentloaded' \}\)/);
  assert.match(helper, /page.request.get\(backendUrl/);
  assert.doesNotMatch(helper, /\.click\(|\.setInputFiles\(|\.route\(|\.fulfill\(/);
  assert.doesNotMatch(helper, /intent: '(?:ensure-bucket|upload-url|delete-bucket|delete-object|move)'/);
});

test('production storage is GCS, while disposable workflow does not configure it', () => {
  const storage = source('services/api/src/object-storage.ts');
  const workflow = source('.github/workflows/e2e-runtime.yml');

  assert.match(storage, /process.env.OBJECT_STORAGE_ENABLED === 'true'/);
  assert.match(storage, /new GcsObjectStorage\(new Storage\(\)/);
  assert.doesNotMatch(workflow, /OBJECT_STORAGE_ENABLED:\s*['"]?true|GOOGLE_APPLICATION_CREDENTIALS:/);
});

test('HTTP errors and existing audit failure gates remain intact', () => {
  assert.equal(audit.split("page.on('response', (response) => browserHttpDiagnostics.capture").length - 1, 4);
  assert.match(audit, /const browserErrorResults = pageErrors.map/);
  assert.match(audit, /browserHttpDiagnostics: browserHttpDiagnostics.snapshot\(\)/);
  assert.match(audit, /process.exitCode = 1/);
  assert.match(audit, /await auditMcpUiLifecycle/);
});

test('the actual unchanged report validator rejects a capability-only Storage result', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-audit-contract-'));

  try {
    fs.mkdirSync(path.join(temp, 'docs'));
    fs.writeFileSync(path.join(temp, 'docs/IDE_PANEL_AUDIT.md'), source('docs/IDE_PANEL_AUDIT.md'));
    const report = {
      summary: { total: 81, passed: 80, failed: 1 },
      groupCounts: {
        panel_get: 18,
        panel_action: 12,
        security_guard: 1,
        panel_render: 24,
        ui_interaction: 14,
        workspace_interaction: 6,
        responsive_viewport: 6,
      },
      networkEvidence: { serviceInteractions: 14, serviceInteractionsWithBackendCalls: 14, missingBackendMethods: 0 },
      pageErrors: [],
      results: [
        {
          kind: 'ui_interaction',
          panel: 'object-storage',
          ok: false,
          storageEvidence: storageLifecycleEvidence({ enabled: false, provisioned: false }, 2),
        },
      ],
    };
    const reportPath = path.join(temp, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report));
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/validate-ide-panel-audit-report.mjs')], {
      cwd: temp,
      env: { ...process.env, IDE_PANEL_AUDIT_OUT: reportPath },
      encoding: 'utf8',
    });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /audit report has 1 failed checks/);
    assert.match(run.stderr, /1 result entries are failing/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Controlled request/page doubles are contract evidence, not live browser/GCS evidence.
const panelUrl = 'https://app.test/api/projects/test/ide-panel/object-storage';
const statusRequest = (overrides = {}) => ({
  url: () => panelUrl,
  method: () => 'POST',
  headers: () => ({ 'content-type': 'multipart/form-data; boundary=test' }),
  postData: () => '--test\r\nContent-Disposition: form-data; name="intent"\r\n\r\nstatus\r\n--test--',
  ...overrides,
});

test('status request matching requires exact origin/resource, POST and actual status intent', () => {
  assert.equal(matchesStorageStatusRequest(statusRequest(), panelUrl), true);
  assert.equal(matchesStorageStatusRequest(statusRequest({
    url: () => `${panelUrl}?workspaceId=test`,
    headers: () => ({ 'content-type': 'application/x-www-form-urlencoded' }),
    postData: () => 'intent=status',
  }), panelUrl), true);
  for (const url of [panelUrl.replace('app.test', 'wrong.test'), `${panelUrl}.data`, `${panelUrl}/extra`,
    panelUrl.replace('https:', 'http:'), panelUrl.replace('app.test', 'user@app.test')]) {
    assert.equal(matchesStorageStatusRequest(statusRequest({ url: () => url }), panelUrl), false);
  }
  for (const overrides of [{ method: () => 'GET' }, { postData: () => 'intent=list' },
    { headers: () => ({ 'content-type': 'application/json' }), postData: () => '{"intent":"status"}' }]) {
    assert.equal(matchesStorageStatusRequest(statusRequest(overrides), panelUrl), false);
  }
});

test('backend probe reads API then posts only status, rejecting contradictory proxy', async () => {
  for (const disagree of [false, true]) {
    const calls = [];
    const http = async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? { response: { status: 404 }, body: { code: 'FEATURE_NOT_ENABLED' } }
        : { response: { status: 200 }, body: { enabled: disagree, provisioned: false } };
    };
    const run = auditStorageBackendStatus(http, panelUrl, 'https://api.test/status', 'test-token', 'test-cookie');
    if (disagree) {
      await assert.rejects(run, /does not match/);
    } else {
      await run;
    }
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.method, undefined);
    assert.equal(calls[1].options.body.toString(), 'intent=status');
  }
});

for (const capability of [
  { enabled: false, provisioned: false },
  { enabled: true, provisioned: false },
  { enabled: true, provisioned: true },
]) {
  test(`read-only UI reload proof stays incomplete for ${JSON.stringify(capability)}`, async () => {
    let reads = 0;
    let reloads = 0;
    let waits = 0;
    const visible = { waitFor: async () => {}, count: async () => 0 };
    const page = {
      request: { get: async () => {
        reads += 1;
        return { status: () => capability.enabled ? 200 : 404,
          json: async () => capability.enabled ? capability : { code: 'FEATURE_NOT_ENABLED' } };
      } },
      reload: async () => { reloads += 1; },
      waitForRequest: async (predicate) => {
        waits += 1;
        const request = statusRequest({ response: async () => ({ status: () => 200, json: async () => capability }) });
        assert.equal(predicate(request), true);
        return request;
      },
      locator: () => ({ ...visible, getByText: () => visible, getByRole: () => visible }),
    };
    await assert.rejects(auditStorageUiCapability(page, panelUrl, 'https://api.test/status', 'test-token'), (error) => {
      assert.ok(error instanceof StorageLifecycleUnverified);
      assert.equal(error.evidence.reloadVerified, true);
      assert.equal(error.evidence.activeLifecycle, 'not_verified');
      return true;
    });
    assert.deepEqual([reads, reloads, waits], [2, 2, 2]);
  });
}

test('runtime harness mandates the Node checks immediately after MCP checks', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node --test scripts\/mcp-extension-audit.checks.mjs\n\s+node --test scripts\/object-storage-audit.checks.mjs/);
  assert.doesNotMatch(workflow, /object-storage-audit.spec.mjs/);
});
