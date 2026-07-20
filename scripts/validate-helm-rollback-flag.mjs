#!/usr/bin/env node
/*
 * D2 (approved 2026-07-17) — mandatory Helm RENDER test for the rollback flag.
 *
 * Why this exists: SERVER_DEPLOY_ROLLBACK_FROM_DIGEST used to be set by a
 * `kubectl set env` on the api Deployment. The next `helm upgrade` wiped it,
 * silently reviving the fake URL-copy rollback (a READY row pointing at a
 * possibly-dead URL, nothing re-deployed). This script proves, BEFORE any
 * upgrade, that the chart itself renders the flag — under the default values,
 * under values-prod.yaml, and even when the release's stored values pre-date
 * the key (--reuse-values simulation via an empty runtime block). It also
 * proves the values.schema.json rejects a malformed value.
 *
 * Run: node scripts/validate-helm-rollback-flag.mjs   (requires `helm` in PATH)
 * Wired into .github/workflows/deploy-main.yml as a blocking pre-upgrade step.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHART = 'infra/helm/platform';
const KEY = 'SERVER_DEPLOY_ROLLBACK_FROM_DIGEST';

let failures = 0;

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`ok   - ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL - ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

function helmTemplate(args) {
  return execFileSync('helm', ['template', 'vibecore', CHART, ...args], { encoding: 'utf8' });
}

function renderedFlag(manifest) {
  const match = manifest.match(new RegExp(`^\\s*${KEY}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'));
  return match ? match[1] : undefined;
}

// 1. Default values render the flag ON.
check(`default values render ${KEY}: "1"`, renderedFlag(helmTemplate([])) === '1');

// 2. values-prod.yaml renders the flag ON.
check(
  `values-prod.yaml renders ${KEY}: "1"`,
  renderedFlag(helmTemplate(['--values', `${CHART}/values-prod.yaml`])) === '1',
);

// 3. --reuse-values simulation: a release whose stored values PRE-DATE the key
//    (runtime block present, key absent) must still render "1" via the
//    template's `default "1"` + chart-default coalescing.
const dir = mkdtempSync(join(tmpdir(), 'helm-rollback-flag-'));

try {
  const legacy = join(dir, 'legacy-values.yaml');
  writeFileSync(legacy, 'platformEnv:\n  runtime:\n    mode: remote-kubernetes\n');
  check(
    `legacy stored values (key absent) still render ${KEY}: "1"`,
    renderedFlag(helmTemplate(['--values', legacy])) === '1',
  );

  // 4. Schema rejects a malformed value ('' — e.g. a typoed --set) at render time.
  let rejected = false;

  try {
    helmTemplate(['--set-string', 'platformEnv.runtime.serverDeployRollbackFromDigest=']);
  } catch {
    rejected = true;
  }
  check("values.schema.json rejects serverDeployRollbackFromDigest=''", rejected);

  // 5. The explicit kill switch renders '0' (never silently coerced back to '1').
  check(
    `explicit kill switch renders ${KEY}: "0"`,
    renderedFlag(helmTemplate(['--set-string', 'platformEnv.runtime.serverDeployRollbackFromDigest=0'])) === '0',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed — the chart can lose the rollback flag. DO NOT deploy.`);
  process.exit(1);
}

console.log('\nAll rollback-flag render checks passed.');
