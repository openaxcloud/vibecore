import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { packageInstallFailure } from './package-install-evidence.mjs';

const response = (body) => ({ status: () => 422, text: async () => JSON.stringify(body) });

test('retains a known failed exit and cause without retaining arbitrary response data', async () => {
  const error = await packageInstallFailure(
    response({
      code: 'PACKAGE_RUN_FAILED',
      run: { exitCode: 1, status: 'failed', id: 'PRIVATE' },
      error: 'npm error code EAI_AGAIN https://private.registry/path?token=SECRET',
      output: 'PRIVATE OUTPUT',
    }),
  );
  assert.match(error.message, /"exitCode":1/);
  assert.match(error.message, /"reportedErrorCode":"EAI_AGAIN"/);
  assert.match(error.message, /"outcome":"failed"/);
  assert.doesNotMatch(error.message, /SECRET|PRIVATE|https|registry/);
});

test('preserves an unknown outcome rather than claiming command failure', async () => {
  const error = await packageInstallFailure(response({ code: 'PACKAGE_RUN_OUTCOME_UNKNOWN', run: { exitCode: -1 } }));
  assert.match(error.message, /"outcome":"unknown"/);
  assert.match(error.message, /PACKAGE_RUN_OUTCOME_UNKNOWN/);
});

test('malformed or oversized bodies remain explicitly unavailable and never become success', async () => {
  for (const text of ['not json PRIVATE', JSON.stringify({ error: 'x'.repeat(70_000) })]) {
    const error = await packageInstallFailure({ status: () => 422, text: async () => text });
    assert.match(error.message, /"bodyRead":"unavailable"/);
    assert.doesNotMatch(error.message, /PRIVATE|xxx/);
  }
});

test('audit still fails non-ok installs with the same wait budget and no replay', () => {
  const source = readFileSync('scripts/audit-ide-panels.mjs', 'utf8');

  const flow = source.slice(
    source.indexOf("const packageName = 'is-odd'"),
    source.indexOf("'create_package_install_plan_visible_after_backend_reload'"),
  );
  assert.match(flow, /waitForPanelResponse\(page, 'packages', 'POST', 60_000\)/);
  assert.match(flow, /if \(!installed.ok\(\)\) \{\s*throw await packageInstallFailure\(installed\);/);
  assert.equal((flow.match(/name: 'Install package'/g) ?? []).length, 1);
});

test('a lost diagnostic body cannot replace the failed response with a thrown transport error', async () => {
  const error = await packageInstallFailure({
    status: () => 422,
    text: async () => {
      throw new Error('PRIVATE');
    },
  });
  assert.match(error.message, /"status":422/);
  assert.match(error.message, /"bodyRead":"unavailable"/);
  assert.doesNotMatch(error.message, /PRIVATE/);
});

test('diagnostic body capture is bounded when reading stalls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const pending = packageInstallFailure({ status: () => 422, text: () => new Promise(() => {}) });
  t.mock.timers.tick(1000);

  const error = await pending;
  assert.match(error.message, /"bodyRead":"unavailable"/);
});

test('numbers and response error codes are bounded, and arbitrary values are never retained', async () => {
  const error = await packageInstallFailure({
    status: () => 99999999,
    text: async () => JSON.stringify({ code: 'PRIVATE_CODE', run: { exitCode: 99999999 }, error: 'PRIVATE' }),
  });
  assert.match(error.message, /"status":null/);
  assert.match(error.message, /"exitCode":null/);
  assert.match(error.message, /"outcome":"unknown"/);
  assert.doesNotMatch(error.message, /PRIVATE|99999999/);
});

test('declared oversize bodies are skipped before requesting text', async () => {
  let reads = 0;

  const error = await packageInstallFailure({
    status: () => 422,
    headers: () => ({ 'content-length': '65537' }),
    text: async () => {
      reads++;
      throw new Error('must not read');
    },
  });
  assert.equal(reads, 0);
  assert.match(error.message, /"bodyRead":"declared-oversized"/);
  assert.ok(Buffer.byteLength(error.message, 'utf8') < 512);
});

test('absent or underestimated length still reads fully but oversized text is never parsed or retained', async () => {
  for (const headers of [{}, { 'content-length': '8', 'content-encoding': 'gzip' }]) {
    let reads = 0;

    const error = await packageInstallFailure({
      status: () => 422,
      headers: () => headers,
      text: async () => {
        reads++;
        return JSON.stringify({ error: 'PRIVATE'.repeat(12_000) });
      },
    });
    assert.equal(reads, 1);
    assert.match(error.message, /"bodyRead":"unavailable"/);
    assert.doesNotMatch(error.message, /PRIVATE/);
    assert.ok(Buffer.byteLength(error.message, 'utf8') < 512);
  }
});

test('waiting timeout does not imply cancellation, and a late response cannot modify retained evidence', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  let finish;

  const pending = packageInstallFailure({
    status: () => 422,
    text: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  t.mock.timers.tick(1000);

  const error = await pending;
  const retained = error.message;
  finish(JSON.stringify({ error: 'PRIVATE', code: 'PACKAGE_RUN_FAILED', run: { exitCode: 1 } }));
  await Promise.resolve();
  assert.equal(error.message, retained);
  assert.match(retained, /"bodyRead":"unavailable"/);
  assert.ok(Buffer.byteLength(retained, 'utf8') < 512);
});

test('maximum retained projection remains below 512 bytes independently of raw body text', async () => {
  const error = await packageInstallFailure(
    response({
      code: 'PACKAGE_RUN_OUTCOME_UNKNOWN',
      run: { exitCode: 255 },
      error: 'ECONNREFUSED ' + 'PRIVATE'.repeat(1000),
    }),
  );
  assert.ok(Buffer.byteLength(error.message, 'utf8') < 512);
  assert.doesNotMatch(error.message, /PRIVATE/);
});
