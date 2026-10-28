#!/bin/sh
set -eu
# Existing disposable localhost database only. Never provisions or drops a DB.
: "${DATABASE_URL:?DATABASE_URL is required for the PostgreSQL proof}"
proof_dir=${1:?Pass an absolute output directory for evidence}
case "$proof_dir" in /*) ;; *) echo 'Evidence directory must be absolute' >&2; exit 1 ;; esac
mkdir -p "$proof_dir"
cd "$(dirname "$0")/.."
export EXPLICIT_RUN_POSTGRES_PROOF=1
export NODE_ENV=test
set +e
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  src/explicit-run-postgres.integration.spec.ts \
  --reporter=json --outputFile="$proof_dir/tests.json" > "$proof_dir/tests.log" 2>&1
test_exit=$?
set -e
node --input-type=module - "$proof_dir" "$test_exit" <<'JS'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [directory, exitCode] = process.argv.slice(2);
const report = JSON.parse(readFileSync(`${directory}/tests.json`, 'utf8'));
const match = readFileSync(`${directory}/tests.log`, 'utf8').match(/EXPLICIT_RUN_POSTGRES_OBSERVATIONS (\[[^\n]*\])/);
const summary = {
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  exitCode: Number(exitCode), passed: report.numPassedTests, failed: report.numFailedTests,
  skipped: report.numPendingTests, todo: report.numTodoTests,
  observations: match ? JSON.parse(match[1]) : [],
  sources: ['src/prisma-store.ts', '../../packages/billing/src/explicit-run.ts', 'src/explicit-run-postgres.integration.spec.ts']
    .map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })),
};
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
if (process.env.EXPECTED_SHA) {
  assert.equal(summary.sha, process.env.EXPECTED_SHA);
  assert.equal(summary.dirty, false);
}
assert.equal(Number(exitCode), 0);
assert.equal(report.success, true);
assert.equal(report.numTotalTests, 4);
assert.equal(report.numPassedTests, 4);
assert.equal(report.numPendingTests, 0);
assert.equal(report.numTodoTests, 0);
assert.equal(report.numFailedTests, 0);
assert(match, 'Missing real PostgreSQL observations');
console.log(JSON.stringify(summary));
JS
