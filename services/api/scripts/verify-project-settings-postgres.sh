#!/bin/sh
set -eu

# Explicit, no-skip PostgreSQL proof. Provision and migrate a disposable local
# database named panel_proof first. This script does not create infrastructure.
: "${DATABASE_URL:?DATABASE_URL is required for the PostgreSQL proof}"
proof_dir=${1:?Pass an absolute output directory for the evidence}
case "$proof_dir" in /*) ;; *) echo 'Evidence directory must be absolute' >&2; exit 1 ;; esac
mkdir -p "$proof_dir"
cd "$(dirname "$0")/.."
export SETTINGS_POSTGRES_PROOF=1 PANEL_POSTGRES_PROOF=1
../../node_modules/.bin/vitest run \
  src/project-settings-atomic.integration.spec.ts \
  src/panel-persistence.integration.spec.ts \
  src/tests/project-slug-rename-redirect.spec.ts \
  src/tests/project-collaborator-roles.spec.ts \
  --reporter=json --outputFile="$proof_dir/tests.json" > "$proof_dir/tests.log" 2>&1
node --input-type=module - "$proof_dir" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const directory = process.argv[2];
const result = JSON.parse(readFileSync(`${directory}/tests.json`, 'utf8'));
assert.equal(result.success, true);
assert.equal(result.numFailedTests, 0);
assert.equal(result.numPendingTests, 0);
const postgres = result.testResults.filter(file => /(?:project-settings-atomic|panel-persistence)\.integration\.spec\.ts$/.test(file.name));
assert.equal(postgres.length, 2);
assert.equal(postgres.flatMap(file => file.assertionResults).length, 11);
for (const file of postgres) {
  for (const test of file.assertionResults) assert.equal(test.status, 'passed', test.fullName);
}
const receipt = {
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
  postgresTests: 11,
  memoryContractTests: result.numPassedTests - 11,
  skipped: result.numPendingTests,
  passed: result.numPassedTests,
  completedAt: new Date().toISOString(),
};
writeFileSync(`${directory}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
JS
