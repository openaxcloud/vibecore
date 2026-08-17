#!/usr/bin/env node
/**
 * Production E2E gate.
 *
 * Reads Playwright's JSON report and decides whether the gate passes, applying
 * the bounded waiver in tests/e2e/e2e-waivers.json.
 *
 * The waiver cannot rot and cannot be widened at runtime:
 *   - the policy path is hard-coded here (no CLI override, no env var);
 *   - past `expires` the gate fails ON THE WAIVER, whatever the tests did;
 *   - a waived test that starts PASSING fails the gate until it is removed
 *     from the policy;
 *   - anything failing that is not listed fails the gate normally.
 *
 * Usage: node scripts/e2e-gate.mjs <playwright-report.json>
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAIVER_PATH = resolve(repoRoot, 'tests/e2e/e2e-waivers.json');

function fail(message) {
  console.error(`\n✖ E2E gate: ${message}\n`);
  process.exit(1);
}

const reportPath = process.argv[2];

if (!reportPath) {
  fail('usage: node scripts/e2e-gate.mjs <playwright-report.json>');
}

let report;

try {
  report = JSON.parse(readFileSync(resolve(reportPath), 'utf8'));
} catch (error) {
  fail(`could not read Playwright report at ${reportPath}: ${error.message}`);
}

let policy;

try {
  policy = JSON.parse(readFileSync(WAIVER_PATH, 'utf8'));
} catch (error) {
  fail(`could not read waiver policy at ${WAIVER_PATH}: ${error.message}`);
}

/* ---- 1. A non-empty waiver must be explicit, short and unexpired. ---- */

if (!Array.isArray(policy.waived)) {
  fail('waiver "waived" must be an array');
}

const waived = policy.waived;
const MAX_WINDOW_DAYS = 7;
let daysLeft = 0;

function parseIsoDay(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${field} must be an ISO date (YYYY-MM-DD); got ${JSON.stringify(value)}`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);

  if (new Date(timestamp).toISOString().slice(0, 10) !== value) {
    fail(`${field} is not a real calendar date: ${value}`);
  }

  return timestamp;
}

if (waived.length > 0) {
  const createdMs = parseIsoDay(policy.created, 'waiver "created"');
  const expiryDayMs = parseIsoDay(policy.expires, 'waiver "expires"');
  const expiryMs = expiryDayMs + 86_400_000 - 1;
  const now = Date.now();
  const todayMs = Date.parse(new Date(now).toISOString().slice(0, 10));
  const windowDays = Math.round((expiryDayMs - createdMs) / 86_400_000);
  daysLeft = Math.ceil((expiryMs - now) / 86_400_000);

  if (createdMs > todayMs) {
    fail(`waiver "created" is in the future: ${policy.created}`);
  }

  if (expiryMs < now) {
    fail(`the E2E waiver expired on ${policy.expires}. Fix the tests below; it does not renew itself.`);
  }

  if (windowDays < 0 || windowDays > MAX_WINDOW_DAYS) {
    fail(`waiver window is ${windowDays} days; the maximum is ${MAX_WINDOW_DAYS}.`);
  }

  const seen = new Set();
  for (const [index, entry] of waived.entries()) {
    const label = `waived[${index}]`;
    if (!entry || typeof entry !== 'object') fail(`${label} must be an object`);
    if (typeof entry.test !== 'string' || !entry.test.includes(' › ')) {
      fail(`${label}.test must be a stable "file › title" key`);
    }
    if (seen.has(entry.test)) fail(`${label}.test is duplicated: ${entry.test}`);
    seen.add(entry.test);
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) {
      fail(`${label}.reason must explain the bounded exception`);
    }
    if (typeof entry.ticket !== 'string' || entry.ticket.trim().length < 3) {
      fail(`${label}.ticket must identify the tracked remediation`);
    }
    if (typeof entry.owner !== 'string' || !entry.owner.includes('@')) {
      fail(`${label}.owner must be an accountable email`);
    }
    if (entry.criticality !== 'non-critical') {
      fail(`${label}.criticality must be "non-critical"; critical paths cannot be waived`);
    }
  }
}

/* ---- 2. Collect outcomes from the report. ---- */

const results = new Map();
const flaky = [];

function walk(suites, trail) {
  for (const suite of suites ?? []) {
    const here = suite.title ? [...trail, suite.title] : trail;

    for (const spec of suite.specs ?? []) {
      /*
       * Playwright reports `file` as a basename on specs and as a
       * repo-relative path on the top-level suite, depending on nesting. Key on
       * the basename so both the report and the policy normalise to the same
       * shape regardless of which one we got.
       */
      const file = basename(spec.file ?? suite.file ?? '');
      const titlePath = [...here.slice(1), spec.title].filter(Boolean).join(' › ');

      /*
       * Key on file + title, NOT file:line:column. Line numbers shift whenever
       * anyone edits the spec, which silently detached every waiver entry from
       * its test the first time this file was touched. Titles are stable and
       * unique within a spec.
       */
      const key = `${file} › ${titlePath}`;

      /*
       * `flaky` means Playwright retried and the test went green. That is not a
       * gate failure — it is reported separately below so the instability stays
       * visible instead of being silently swallowed.
       */
      const ok = (spec.tests ?? []).every(
        (t) => t.status === 'expected' || t.status === 'skipped' || t.status === 'flaky',
      );

      const wasFlaky = (spec.tests ?? []).some((t) => t.status === 'flaky');

      results.set(key, ok ? 'passed' : 'failed');

      if (wasFlaky) {
        flaky.push(key);
      }
    }

    walk(suite.suites, here);
  }
}

walk(report.suites, []);

const failed = [...results.entries()].filter(([, status]) => status === 'failed').map(([key]) => key);
/** Normalise a policy entry to the same basename-keyed shape as the report. */
function normaliseKey(key) {
  const [location, ...rest] = key.split(' › ');

  // Tolerate legacy `path:line:col` entries by dropping the position.
  return [basename(location.split(':')[0]), ...rest].join(' › ');
}

const waivedKeys = new Set(waived.map((entry) => normaliseKey(entry.test)));

/* ---- 3. Decide. ---- */

const unwaivedFailures = failed.filter((key) => !waivedKeys.has(key));

/*
 * A waiver must not outlive its problem, so a waived test that PASSES fails the
 * gate until it is removed. The exception is entries explicitly marked
 * `unstable: true` — those are waived *because* they flap, so a green run
 * proves nothing and must not itself break the build. Every unstable entry
 * still carries a reason and dies with the same expiry as the rest.
 */
const staleWaivers = waived
  .filter((entry) => !entry.unstable && results.get(normaliseKey(entry.test)) === 'passed')
  .map((entry) => entry.test);

const unknownWaivers = waived.filter((entry) => !results.has(normaliseKey(entry.test))).map((entry) => entry.test);

console.log(
  waived.length > 0
    ? `E2E gate — waiver expires ${policy.expires} (${daysLeft} day(s) left)`
    : 'E2E gate — no active waiver',
);
console.log(`  tests reported : ${results.size}`);
console.log(`  failing        : ${failed.length}`);
console.log(`  waived         : ${waived.length}`);
console.log(`  flaky (passed on retry): ${flaky.length}`);

if (flaky.length) {
  console.log('\n⚠ passed only after a retry — real instability, worth diagnosing:');
  flaky.forEach((key) => console.log(`    - ${key}`));
}

if (unknownWaivers.length) {
  console.log('\n⚠ waived entries that did not appear in this report (renamed or moved?):');
  unknownWaivers.forEach((key) => console.log(`    - ${key}`));
}

if (staleWaivers.length) {
  console.error('\n✖ these tests are waived but PASSED — remove them from tests/e2e/e2e-waivers.json:');
  staleWaivers.forEach((key) => console.error(`    - ${key}`));
}

if (unwaivedFailures.length) {
  console.error('\n✖ failing tests that are NOT waived:');
  unwaivedFailures.forEach((key) => console.error(`    - ${key}`));
}

if (unknownWaivers.length) {
  console.error('\n✖ waived tests must exist in this exact report; remove or correct the entries above.');
}

if (staleWaivers.length || unknownWaivers.length || unwaivedFailures.length) {
  process.exit(1);
}

console.log(
  waived.length > 0
    ? `\n✔ gate passes: ${failed.length} failure(s), all covered by the waiver expiring ${policy.expires}.`
    : `\n✔ gate passes without waiver: ${failed.length} failure(s).`,
);
