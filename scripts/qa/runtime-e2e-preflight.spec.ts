import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { test } from 'node:test';
import { summarizeRuntimeLog, tailLimit, collectRuntimeDiagnostics } from './runtime-e2e-diagnostics.js';
import { checkRuntimeServices } from './runtime-e2e-preflight.js';

const healthy = (async () => new Response(JSON.stringify({ status: 'ok' }))) as typeof fetch;
test('checks both local services without mutating or following redirects', async () => {
  const calls: string[] = [];

  const request = (async (input: URL, init: RequestInit) => {
    calls.push(input.href);
    assert.equal(init.redirect, 'error');
    assert.equal(init.method, undefined);
    assert.ok(init.signal);

    return new Response('{"status":"ok"}');
  }) as typeof fetch;
  assert.equal((await checkRuntimeServices({}, request)).length, 2);
  assert.deepEqual(calls, ['http://127.0.0.1:3001/health', 'http://127.0.0.1:3010/health']);
});
test('missing manager fails with sanitized actionable code', async () => {
  let count = 0;

  const request = (async () => {
    if (++count === 2) {
      throw new Error('secret-transport-content');
    }

    return new Response('{"status":"ok"}');
  }) as typeof fetch;
  await assert.rejects(
    checkRuntimeServices({}, request),
    /^Error: RUNTIME_E2E_PREFLIGHT_WORKSPACE_MANAGER_UNAVAILABLE$/,
  );
});

for (const body of ['not-json', '{"status":"starting"}']) {
  test(`rejects invalid health ${body}`, async () => {
    await assert.rejects(
      checkRuntimeServices({}, (async () => new Response(body)) as typeof fetch),
      /API_UNAVAILABLE$/,
    );
  });
}
test('rejects unsuccessful HTTP even with an ok body', async () => {
  await assert.rejects(
    checkRuntimeServices({}, (async () => new Response('{"status":"ok"}', { status: 503 })) as typeof fetch),
    /API_UNAVAILABLE$/,
  );
});

for (const endpoint of [
  'https://api.e-code.ai',
  'http://user:secret@127.0.0.1:3010',
  'http://127.0.0.1:3010/?secret=x',
  'not-url',
]) {
  test(`rejects nonlocal or credentialed configuration ${endpoint.split('@').at(-1)}`, async () => {
    await assert.rejects(checkRuntimeServices({ WORKSPACE_MANAGER_URL: endpoint }, healthy), /LOCAL_URL_REQUIRED$/);
  });
}
test('workflow runs preflight before expensive tests and keeps diagnostic files separate', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('runtime-e2e-preflight.ts') < workflow.indexOf('name: Playwright @runtime suite'));
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /name: runtime-diagnostics-light/);
  assert.match(workflow, /runtime-e2e-diagnostics.ts/);
  assert.doesNotMatch(
    workflow.split('name: runtime-diagnostics-light')[1].split('name: Upload E2E traces')[0],
    /error-context/,
  );
});

test('diagnostics export closed-vocabulary codes only, never arbitrary secrets or user text', () => {
  const value = JSON.stringify(
    summarizeRuntimeLog(
      'secret=abc123 password=hidden bearerToken=xxx postgres://user:pwd@host private customer input ECONNREFUSED {"statusCode":502}',
    ),
  );
  assert.match(value, /ECONNREFUSED/);
  assert.match(value, /502/);

  for (const secret of ['abc123', 'hidden', 'xxx', 'postgres', 'customer', 'pwd']) {
    assert.ok(!value.includes(secret));
  }
  assert.equal(tailLimit, 1048576);
});

test('collector reads bounded tail, includes manager, and refuses symlinks', async () => {
  const root = await mkdtemp('/tmp/runtime-diagnostics-test-');

  try {
    await writeFile(`${root}/vibecore-api.log`, 'ENOTFOUND' + 'x'.repeat(tailLimit) + 'ECONNREFUSED');
    await writeFile(`${root}/vibecore-workspace-manager.log`, 'ETIMEDOUT private-value');
    await symlink(`${root}/vibecore-workspace-manager.log`, `${root}/vibecore-web.log`);
    await collectRuntimeDiagnostics(`${root}/out`, root);

    const result = JSON.parse(await readFile(`${root}/out/services.json`, 'utf8'));
    const api = result.services.find((entry: { service: string }) => entry.service === 'api');
    assert.equal(api.bytesInspected, tailLimit);
    assert.equal(api.truncated, true);
    assert.deepEqual(api.codes, [{ code: 'ECONNREFUSED', occurrences: 1 }]);
    assert.equal(result.services.find((entry: { service: string }) => entry.service === 'web').available, false);
    assert.equal(
      result.services.find((entry: { service: string }) => entry.service === 'workspace-manager').available,
      true,
    );
    assert.ok(!JSON.stringify(result).includes('private-value'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
