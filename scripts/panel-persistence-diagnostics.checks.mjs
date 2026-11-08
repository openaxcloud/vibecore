import assert from 'node:assert/strict';
import test from 'node:test';
import { createPanelPersistenceDiagnostics } from './panel-persistence-diagnostics.mjs';

const response = (method, body, status = 200) => ({
  request: () => ({ method: () => method, postData: () => body }),
  status: () => status,
  text: async () => body,
});

test('records only statuses and synthetic marker presence, including absent and rejected requests', async () => {
  const diagnostics = createPanelPersistenceDiagnostics();
  diagnostics.capture('settings', response('GET', 'private account value'));
  diagnostics.expect('settings', 'IDE Panel Audit UI 123');
  diagnostics.capture('settings', response('POST', 'IDE Panel Audit UI 123 and a secret', 400));
  diagnostics.capture('settings', response('GET', 'old value and a secret'));
  diagnostics.capture('settings', response('GET', 'IDE Panel Audit UI 123 and a secret'));
  await diagnostics.flush();

  const rows = diagnostics.snapshot();
  assert.equal(rows[0].expectedMarkerRegistered, false);
  assert.equal(rows[1].status, 400);
  assert.equal(rows[1].requestContainsExpectedMarker, true);
  assert.equal(rows[2].responseContainsExpectedMarker, false);
  assert.equal(rows[3].responseContainsExpectedMarker, true);
  assert.doesNotMatch(JSON.stringify(rows), /secret|private account|IDE Panel Audit UI|old value/);
});

test('allowlists panels and generated marker shapes, limits each panel to twelve records', async () => {
  const diagnostics = createPanelPersistenceDiagnostics();
  diagnostics.expect('settings', 'private name');
  diagnostics.capture('secrets', response('GET', 'sensitive'));
  diagnostics.capture('settings', response('PUT', 'sensitive'));

  for (let i = 0; i < 50; i++) {
    diagnostics.capture('settings', response('GET', 'private name'));
  }
  diagnostics.expect('snapshots', 'Panel audit UI checkpoint 123');

  for (let i = 0; i < 50; i++) {
    diagnostics.capture('snapshots', response('GET', 'x'.repeat(262145)));
  }
  await diagnostics.flush();

  const rows = diagnostics.snapshot();
  assert.equal(rows.length, 24);
  assert.equal(rows[0].expectedMarkerRegistered, false);
  assert.equal(rows[12].bodyRead, 'unavailable-or-oversized');
  assert.ok(JSON.stringify(rows).length < 6000);
});

test('stalled or failed body reads cannot block or alter verdicts', async () => {
  const diagnostics = createPanelPersistenceDiagnostics();
  diagnostics.expect('snapshots', 'Panel audit UI checkpoint 123');
  diagnostics.capture('snapshots', { ...response('GET', ''), text: () => new Promise(() => {}) });
  diagnostics.capture('snapshots', {
    ...response('GET', ''),
    text: async () => {
      throw new Error('secret');
    },
  });
  await diagnostics.flush();
  assert.deepEqual(
    diagnostics.snapshot().map((row) => row.bodyRead),
    ['unavailable-or-oversized', 'unavailable-or-oversized'],
  );
});

test('the 256 KiB bound counts UTF-8 bytes rather than UTF-16 string units', async () => {
  const diagnostics = createPanelPersistenceDiagnostics();
  diagnostics.expect('snapshots', 'Panel audit UI checkpoint 123');

  const body = 'é'.repeat(131073);
  assert.ok(body.length < 262144);
  assert.ok(Buffer.byteLength(body, 'utf8') > 262144);
  diagnostics.capture('snapshots', response('GET', body));
  await diagnostics.flush();
  assert.equal(diagnostics.snapshot()[0].bodyRead, 'unavailable-or-oversized');
  assert.equal(diagnostics.snapshot()[0].responseContainsExpectedMarker, undefined);
});
