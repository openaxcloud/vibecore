import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createIdeCasEvidence } from './ide-cas-evidence.mjs';

function fixture(evidence = createIdeCasEvidence(), cohort) {
  const page = new EventEmitter();
  const frame = {};
  page.mainFrame = () => frame;
  evidence.trackPage(page, 'packages', cohort);

  const send = (method, status, expected, received, path = '/api/projects/PRIVATE/ide-state') => {
    const request = {
      url: () => 'http://localhost:5173' + path + '?token=PRIVATE',
      method: () => method,
      frame: () => frame,
      headers: () => ({ 'if-match': expected, authorization: 'PRIVATE' }),
      postData: () => {
        throw new Error('Must not read body');
      },
    };
    page.emit('request', request);

    const respond = () =>
      page.emit('response', {
        request: () => request,
        status: () => status,
        headers: () => ({ etag: received, 'set-cookie': 'PRIVATE' }),
        json: () => {
          throw new Error('Must not read body');
        },
      });

    return respond;
  };

  const immediate = (...args) => send(...args)();

  return { page, frame, send: immediate, start: send, evidence };
}

test('CAS captures version acknowledgement and subsequent read after real navigation without state data', () => {
  const { page, frame, send, evidence } = fixture();
  send('PUT', 412, '"1"', '"2"');
  send('PUT', 200, '"2"', '"3"');
  page.emit('framenavigated', frame);
  send('GET', 200, undefined, '"3"');
  assert.deepEqual(evidence.snapshot().records[0], {
    scenario: 'packages',
    scope: 'project',
    precondition: 'numeric',
    conflictVersion: 'numeric',
    acknowledged: true,
    laterRead: 'at-or-after-acknowledged',
    readAfterNavigation: true,
    readOnAnotherPage: false,
    laterFailure: false,
  });
  assert.doesNotMatch(JSON.stringify(evidence.snapshot()), /PRIVATE|token|cookie|authorization/);
});

test('unrelated scope/page, missing or stale ETag and failed PUT cannot become acknowledgement', () => {
  const { page, send, evidence } = fixture();
  send('PUT', 412, '"1"', '"2"');
  fixture(evidence).send('PUT', 200, '"2"', '"3"');
  send('PUT', 200, '"2"', '"3"', '/api/projects/OTHER/ide-state');
  send('PUT', 200, '"1"', '"3"');
  send('PUT', 200, '"2"', '"2"');
  send('PUT', 200, '"2"', 'W/"3"');
  send('PUT', 500, '"2"', '"3"');
  send('GET', 200, undefined, '"3"');
  assert.equal(evidence.snapshot().records[0].acknowledged, false);
  assert.equal(evidence.snapshot().records[0].laterRead, 'unconfirmed');
  assert.equal(evidence.snapshot().records[0].laterFailure, true);
  page.emit('close');
  assert.equal(page.listenerCount('response'), 0);
  send('PUT', 200, '"2"', '"3"');
  assert.equal(evidence.snapshot().records[0].acknowledged, false);
});

test('stale reload is evidence of older version, not successful persistence', () => {
  const { send, evidence } = fixture();
  send('PUT', 412, '"1"', '"2"');
  send('PUT', 200, '"2"', '"3"');
  send('GET', 200, undefined, '"2"');
  assert.equal(evidence.snapshot().records[0].laterRead, 'older-than-acknowledged');
  assert.equal(evidence.snapshot().records[0].readAfterNavigation, false);
});

test('CAS records are bounded, unknown versions remain unknown and snapshots cannot mutate evidence', () => {
  const { send, evidence } = fixture();

  for (let i = 0; i < 1000; i++) {
    send('PUT', 412, 'PRIVATE', '"999999999999999999999"');
  }

  const snapshot = evidence.snapshot();
  assert.equal(snapshot.total, 1000);
  assert.equal(snapshot.omitted, 936);
  assert.equal(snapshot.records.length, 64);
  assert.equal(snapshot.records[0].conflictVersion, 'unknown');
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 32768);
  snapshot.records[0].acknowledged = true;
  assert.equal(evidence.snapshot().records[0].acknowledged, false);
});

test('real audit observes all four page families and persists CAS alongside unchanged errors', () => {
  const source = readFileSync(new URL('../audit-ide-panels.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/ideCasDiagnostics.trackPage\(page,/g) ?? []).length, 4);
  assert.match(source, /ideCasDiagnostics: ideCasDiagnostics.snapshot\(\)/);
  assert.match(source, /const browserErrorResults = pageErrors.map/);

  const collector = readFileSync(new URL('./collect-runtime-evidence.mjs', import.meta.url), 'utf8');
  assert.match(collector, /summarizeRuntimeApi\(data\)/);
  assert.match(collector, /tmp\/ide-panel-audit.json/);

  const workflow = readFileSync(new URL('../../.github/workflows/e2e-runtime.yml', import.meta.url), 'utf8');
  assert.match(
    workflow,
    /node --test scripts\/ci\/browser-network-evidence.checks.mjs scripts\/ci\/ide-cas-evidence.checks.mjs/,
  );
});

test('an authorized audit cohort can observe later-page reads but never borrow another writer acknowledgement', () => {
  const evidence = createIdeCasEvidence();
  const cohort = {};
  const first = fixture(evidence, cohort);
  const next = fixture(evidence, cohort);
  first.send('PUT', 412, '"1"', '"2"');
  next.send('PUT', 200, '"2"', '"3"');
  assert.equal(evidence.snapshot().records[0].acknowledged, false);
  first.send('PUT', 200, '"2"', '"3"');
  first.page.emit('close');
  next.send('GET', 200, undefined, '"3"');

  const record = evidence.snapshot().records[0];
  assert.equal(record.acknowledged, true);
  assert.equal(record.laterRead, 'at-or-after-acknowledged');
  assert.equal(record.readOnAnotherPage, true);
  assert.equal(record.readAfterNavigation, false);
});

test('concurrent writers retain independent conflicts and failures', () => {
  const evidence = createIdeCasEvidence();
  const cohort = {};
  const first = fixture(evidence, cohort);
  const second = fixture(evidence, cohort);
  first.send('PUT', 412, '"1"', '"2"');
  second.send('PUT', 412, '"1"', '"2"');
  first.send('PUT', 200, '"2"', '"3"');
  first.send('PUT', 500, '"3"', undefined);

  const records = evidence.snapshot().records;
  assert.equal(records[0].acknowledged, true);
  assert.equal(records[1].acknowledged, false);
  assert.equal(records[0].laterFailure, true);
  assert.equal(records[1].laterFailure, false);
});

test('responses begun before conflict or acknowledgement are not subsequent proof', () => {
  const { send, start, evidence } = fixture();
  const priorWrite = start('PUT', 200, '"2"', '"3"');
  send('PUT', 412, '"1"', '"2"');
  priorWrite();
  assert.equal(evidence.snapshot().records[0].acknowledged, false);

  const priorRead = start('GET', 200, undefined, '"3"');
  send('PUT', 200, '"2"', '"3"');
  priorRead();
  assert.equal(evidence.snapshot().records[0].laterRead, 'unobserved');
  send('GET', 200, undefined, '"3"');
  assert.equal(evidence.snapshot().records[0].laterRead, 'at-or-after-acknowledged');
});
