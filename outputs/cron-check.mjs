/*
 * Throwaway verifier: vitest cannot run in this sandbox (node_modules holds
 * darwin-arm64 native binaries), so the pure cron engine is exercised directly
 * with Node's type-stripping loader. CI runs the real vitest suite.
 */
import assert from 'node:assert/strict';
import { describeCron, minIntervalMinutes, nextCronRun, parseCron, zonedWallTimeToUtc } from '../services/api/src/scheduled-tasks-cron.ts';

let passed = 0;

const check = (label, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${label}`);
  } catch (error) {
    console.log(`  FAIL ${label}\n       ${error.message}`);
    process.exitCode = 1;
  }
};

const iso = (value) => value?.toISOString() ?? null;

check('parses steps, ranges, lists, names', () => {
  assert.deepEqual(parseCron('0,30 9-17/4 * jan-mar mon,fri').fields.hours, [9, 13, 17]);
  assert.deepEqual(parseCron('0 0 * * 7').fields.daysOfWeek, [0]);
  assert.equal(parseCron('@daily').normalized, '0 0 * * *');
  assert.equal(parseCron('60 * * * *').valid, false);
  assert.equal(parseCron('* * *').valid, false);
  assert.equal(parseCron('*/0 * * * *').valid, false);
});

check('next run is strictly after `from`', () => {
  assert.equal(iso(nextCronRun('*/5 * * * *', new Date('2026-07-14T10:05:00.000Z'))), '2026-07-14T10:10:00.000Z');
  assert.equal(iso(nextCronRun('0 * * * *', new Date('2026-07-14T10:00:00.000Z'))), '2026-07-14T11:00:00.000Z');
});

check('rolls across day/month/year', () => {
  assert.equal(iso(nextCronRun('30 23 * * *', new Date('2026-12-31T23:45:00.000Z'))), '2027-01-01T23:30:00.000Z');
  assert.equal(iso(nextCronRun('0 0 1 * *', new Date('2026-07-14T10:00:00.000Z'))), '2026-08-01T00:00:00.000Z');
});

check('day-of-week + the classic dom/dow UNION rule', () => {
  assert.equal(iso(nextCronRun('0 9 * * mon', new Date('2026-07-14T10:00:00.000Z'))), '2026-07-20T09:00:00.000Z');
  assert.equal(iso(nextCronRun('0 0 20 * 5', new Date('2026-07-14T00:00:00.000Z'))), '2026-07-17T00:00:00.000Z');
});

check('leap day / impossible date', () => {
  assert.equal(iso(nextCronRun('0 0 29 2 *', new Date('2026-07-14T00:00:00.000Z'))), '2028-02-29T00:00:00.000Z');
  assert.equal(nextCronRun('0 0 30 2 *', new Date('2026-07-14T00:00:00.000Z')), null);
});

check('timezone: cron fields are local, result is UTC', () => {
  assert.equal(iso(nextCronRun('0 9 * * *', new Date('2026-07-14T00:00:00.000Z'), 'Europe/Paris')), '2026-07-14T07:00:00.000Z');
});

check('DST fall-back shifts the UTC instant', () => {
  assert.equal(iso(nextCronRun('0 9 * * *', new Date('2026-10-20T00:00:00.000Z'), 'Europe/Paris')), '2026-10-20T07:00:00.000Z');
  assert.equal(iso(nextCronRun('0 9 * * *', new Date('2026-10-26T00:00:00.000Z'), 'Europe/Paris')), '2026-10-26T08:00:00.000Z');
});

check('DST spring-forward gap is skipped, not shifted', () => {
  assert.equal(zonedWallTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Paris'), null);
  assert.equal(iso(nextCronRun('30 2 * * *', new Date('2026-03-28T23:00:00.000Z'), 'Europe/Paris')), '2026-03-30T00:30:00.000Z');
});

check('unknown timezone falls back to UTC instead of never firing', () => {
  assert.equal(iso(nextCronRun('0 9 * * *', new Date('2026-07-14T00:00:00.000Z'), 'Mars/Olympus')), '2026-07-14T09:00:00.000Z');
});

check('minIntervalMinutes drives the per-plan frequency guard', () => {
  const from = new Date('2026-07-14T00:00:00.000Z');
  assert.equal(minIntervalMinutes('* * * * *', 'UTC', from), 1);
  assert.equal(minIntervalMinutes('*/15 * * * *', 'UTC', from), 15);
  assert.equal(minIntervalMinutes('0 3 * * *', 'UTC', from), 1440);
  assert.equal(minIntervalMinutes('* 3 * * *', 'UTC', from), 1);
});

check('describeCron', () => {
  assert.deepEqual(describeCron('0 3 * * *', 'UTC', new Date('2026-07-14T10:00:00.000Z')), {
    valid: true,
    normalized: '0 3 * * *',
    nextRunAt: '2026-07-15T03:00:00.000Z',
  });
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
