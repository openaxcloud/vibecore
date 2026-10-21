#!/bin/sh
set -eu

# Explicit, no-skip PostgreSQL proof. Provision and migrate a disposable local
# database named panel_proof first. This script does not create infrastructure.
: "${DATABASE_URL:?DATABASE_URL is required for the PostgreSQL proof}"
proof_dir=${1:?Pass an absolute output directory for the evidence}
case "$proof_dir" in /*) ;; *) echo 'Evidence directory must be absolute' >&2; exit 1 ;; esac
mkdir -p "$proof_dir"
cd "$(dirname "$0")/.."
export SCHEDULE_POSTGRES_PROOF=1
set +e
../../node_modules/.bin/vitest run \
  src/scheduled-task-persistence.integration.spec.ts \
  src/scheduled-tasks.spec.ts \
  src/scheduled-tasks-cron.spec.ts \
  --reporter=json --outputFile="$proof_dir/tests.json" > "$proof_dir/tests.log" 2>&1
test_exit=$?
set -e
node --input-type=module - "$proof_dir" "$test_exit" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';
const directory = process.argv[2];
const result = JSON.parse(readFileSync(`${directory}/tests.json`, 'utf8'));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '';
const testExitCode = Number(process.argv[3]);
const sourcePaths = [
  'src/app.ts', 'src/prisma-store.ts', 'src/scheduled-tasks-repository.ts',
  'src/scheduled-task-persistence.integration.spec.ts', 'src/scheduled-tasks.ts',
  'src/scheduled-tasks.spec.ts', 'src/scheduled-tasks-cron.spec.ts',
  'scripts/verify-scheduled-task-postgres.sh', '../../.github/workflows/scheduled-task-postgres.yml',
];
const detailed = {
  sha, dirty, testExitCode,
  total: result.numTotalTests, passed: result.numPassedTests,
  failed: result.numFailedTests, skipped: result.numPendingTests, todo: result.numTodoTests,
  sources: sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') })),
  suites: result.testResults.map(file => ({
    file: relative(process.cwd(), file.name), status: file.status,
    durationMs: file.endTime - file.startTime,
    tests: file.assertionResults.map(test => ({ name: test.fullName, status: test.status, durationMs: test.duration ?? null })),
  })),
};
const detailedJson = `${JSON.stringify(detailed, null, 2)}\n`;
writeFileSync(`${directory}/tests-summary.json`, detailedJson);
const testReportSha256 = createHash('sha256').update(detailedJson).digest('hex');
// Preserve the detailed report before rejecting any failed or skipped run.
assert.equal(testExitCode, 0);
assert.equal(result.success, true);
assert.equal(result.numFailedTests, 0);
assert.equal(result.numPendingTests, 0);
assert.equal(result.numTodoTests, 0);
assert.equal(result.numPassedTests, result.numTotalTests);
assert.equal(result.numTotalTests, 59);
const postgres = result.testResults.filter(file => /scheduled-task-persistence\.integration\.spec\.ts$/.test(file.name));
assert.equal(postgres.length, 1);
assert.equal(postgres.flatMap(file => file.assertionResults).length, 7);
for (const file of postgres) {
  for (const test of file.assertionResults) assert.equal(test.status, 'passed', test.fullName);
}
const receipt = {
  sha, dirty, testExitCode, testReportSha256,
  postgresTests: 7,
  schedulerRegressionTests: result.numPassedTests - 7,
  skipped: result.numPendingTests,
  todo: result.numTodoTests,
  failed: result.numFailedTests,
  total: result.numTotalTests,
  passed: result.numPassedTests,
  completedAt: new Date().toISOString(),
};
writeFileSync(`${directory}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
JS
