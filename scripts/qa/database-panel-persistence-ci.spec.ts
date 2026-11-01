import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it as test } from 'vitest';
import {
  validateCiDatabaseTarget,
  dedicatedDatabaseUrl,
  assertDatabaseAbsent,
  cleanupIdentityMatches,
  summarizeCiTestReport,
} from './database-panel-persistence-ci.js';

const service = 'postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore';
test('exact disposable service only; query/fragment/host overrides rejected before any client', () => {
  for (const good of [service, service.replace('postgresql:', 'postgres:')]) {
    assert.equal(validateCiDatabaseTarget({ CI: 'true', DATABASE_URL: good }).port, '55432');
  }

  for (const bad of [
    undefined,
    '',
    service + '?host=remote',
    service + '?host=127.0.0.1',
    service + '?port=5432',
    service + '?options=-csearch_path=public',
    service + '?service=prod',
    service + '#fragment',
    service.replace('127.0.0.1', 'localhost'),
    service.replace('55432', '5432'),
    service.replace('/vibecore', '/database_audit'),
    service.replace(':vibecore@', ':other@'),
    ' ' + service,
    service + '/',
  ]) {
    assert.throws(() => validateCiDatabaseTarget({ CI: 'true', DATABASE_URL: bad }), /CONFIGURATION_REFUSED/);
  }

  for (const ci of [undefined, 'false', '1']) {
    assert.throws(() => validateCiDatabaseTarget({ CI: ci, DATABASE_URL: service }), /CONFIGURATION_REFUSED/);
  }
  assert.equal(dedicatedDatabaseUrl(), 'postgresql://vibecore:vibecore@127.0.0.1:55432/database_audit');
});
test('pre-existing database is refused rather than reused or dropped', () => {
  assert.doesNotThrow(() => assertDatabaseAbsent([]));
  assert.throws(() => assertDatabaseAbsent([{ exists: 1 }]), /DATABASE_ALREADY_EXISTS/);
});
test('cleanup needs acknowledged create, original OID, expected owner and exact run marker', () => {
  const marker = 'persistence-ci-' + 'a'.repeat(32),
    identity = { oid: '12345', owner: 'vibecore', marker: null },
    owned = { ...identity, marker };
  assert.equal(cleanupIdentityMatches(true, identity, [owned], marker), true);
  assert.equal(cleanupIdentityMatches(false, identity, [owned], marker), false);
  assert.equal(cleanupIdentityMatches(true, undefined, [owned], marker), false);

  for (const bad of [
    [],
    [owned, owned],
    [{ ...owned, oid: '54321' }],
    [{ ...owned, owner: 'other' }],
    [{ ...owned, marker: null }],
    [{ ...owned, marker: 'persistence-ci-' + 'b'.repeat(32) }],
  ]) {
    assert.equal(cleanupIdentityMatches(true, identity, bad, marker), false);
  }
  assert.equal(cleanupIdentityMatches(true, { ...identity, marker: 'existing' }, [owned], marker), false);
  assert.equal(cleanupIdentityMatches(true, { ...identity, owner: 'other' }, [owned], marker), false);
  assert.equal(cleanupIdentityMatches(true, { ...identity, oid: '' }, [{ ...owned, oid: '' }], marker), false);
  assert.equal(cleanupIdentityMatches(true, identity, [owned], 'arbitrary marker'), false);
});

const spec = fileURLToPath(new URL('../../services/api/src/tests/database-panel.postgres.spec.ts', import.meta.url));

// script lives at scripts/qa: API root is two levels up, followed by services/api.
function report() {
  return {
    success: true,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numTotalTests: 12,
    numPassedTests: 12,
    testResults: [
      {
        name: resolve(spec),
        status: 'passed',
        assertionResults: Array.from({ length: 12 }, (_, i) => ({
          fullName: `persistence scenario ${i}`,
          status: 'passed',
        })),
      },
    ],
  };
}
test('requires exactly 12 passing tests in the only expected file', () => {
  assert.equal(summarizeCiTestReport(report()).valid, true);
});
test('rejects zero, skipped, todo, failed, duplicate, extra file and missing or extra scenario counts', () => {
  for (const status of ['pending', 'skipped', 'todo', 'failed']) {
    const r = report();
    r.testResults[0].assertionResults[0].status = status;
    assert.equal(summarizeCiTestReport(r).valid, false);
  }

  for (const n of [0, 8, 9, 11, 13]) {
    const r = report();
    r.numTotalTests = n;
    r.numPassedTests = n;
    r.testResults[0].assertionResults = Array.from({ length: n }, () => ({
      fullName: 'scenario',
      status: 'passed',
    }));
    assert.equal(summarizeCiTestReport(r).valid, false);
  }

  const duplicate = report();
  duplicate.testResults.push(duplicate.testResults[0]);
  assert.equal(summarizeCiTestReport(duplicate).valid, false);

  const wrong = report();
  wrong.testResults[0].name += '.other';
  assert.equal(summarizeCiTestReport(wrong).valid, false);

  const failed = report();
  failed.success = false;
  assert.equal(summarizeCiTestReport(failed).valid, false);

  const pending = report();
  pending.numPendingTests = 1;
  assert.equal(summarizeCiTestReport(pending).valid, false);
});
test('receipt omits raw output and redacts suspicious dynamic test titles', () => {
  const r = report();
  r.testResults[0].assertionResults[0] = {
    fullName: 'postgresql://user:secret@host/db',
    status: 'failed',
  };

  const summary = summarizeCiTestReport({
    ...r,
    message: 'private-raw-response',
  });
  assert.equal(JSON.stringify(summary).includes('private-raw-response'), false);
  assert.equal(JSON.stringify(summary).includes('secret@host'), false);
});
