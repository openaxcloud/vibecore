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

/* ---- 1. The waiver must carry a valid, short, unexpired date. ---- */

const expires = policy.expires;

if (typeof expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
  fail(`waiver "expires" must be an ISO date (YYYY-MM-DD); got ${JSON.stringify(expires)}`);
}

const expiryMs = Date.parse(`${expires}T23:59:59Z`);

if (Number.isNaN(expiryMs)) {
  fail(`waiver "expires" is not a real date: ${expires}`);
}

const now = Date.now();
const MAX_WINDOW_DAYS = 30;
const daysLeft = Math.ceil((expiryMs - now) / 86_400_000);

if (expiryMs < now) {
  fail(`the E2E waiver expired on ${expires}. Fix the tests below or re-scope the waiver — it does not renew itself.`);
}

if (daysLeft > MAX_WINDOW_DAYS) {
  fail(`waiver window is ${daysLeft} days; the maximum is ${MAX_WINDOW_DAYS}. Shorten "expires".`);
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
      const line = spec.line ?? 0;
      const column = spec.column ?? 0;
      const titlePath = [...here.slice(1), spec.title].filter(Boolean).join(' › ');
      const key = `${file}:${line}:${column} › ${titlePath}`;

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
const waived = policy.waived ?? [];

/** Normalise a policy entry to the same basename-keyed shape as the report. */
function normaliseKey(key) {
  const [location, ...rest] = key.split(' › ');
  const [path, line, column] = location.split(':');

  return [`${basename(path)}:${line}:${column}`, ...rest].join(' › ');
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

console.log(`E2E gate — waiver expires ${expires} (${daysLeft} day(s) left)`);
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

if (staleWaivers.length || unwaivedFailures.length) {
  process.exit(1);
}

console.log(`\n✔ gate passes: ${failed.length} failure(s), all covered by the waiver expiring ${expires}.`);
