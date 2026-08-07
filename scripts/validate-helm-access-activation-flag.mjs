#!/usr/bin/env node
/*
 * P104 / SEC-8 — mandatory Helm RENDER test for the password-activation interlock.
 *
 * Sibling of validate-helm-rollback-flag.mjs, with the DEFAULT INVERTED. The
 * rollback flag defaults to "1" because its safe state is "digest path on". This
 * one defaults to "0" because its safe state is "activation NOT yet open": until
 * the deploy workflow has proven every pre-cutover pod is gone and its last
 * `Cache-Control: public, max-age=60` response has aged out, activating password
 * protection is defeatable from a shared cache.
 *
 * What this proves BEFORE any upgrade touches prod:
 *   1. chart defaults render "0"                        (fail-closed out of the box)
 *   2. values-prod.yaml renders "0"                     (prod is not pre-armed)
 *   3. legacy stored values, key absent, render "0"     (--reuse-values simulation:
 *      an upgrade that forgets the key DISARMS, never silently arms)
 *   4. values.schema.json rejects a malformed value     (a typoed --set fails the
 *      deploy instead of rendering something ambiguous)
 *   5. an explicit --set-string ...=1 renders "1"       (phase 2 can actually arm it)
 *   6. the api Deployment consumes the platform-env configmap, so the rendered
 *      value genuinely reaches the process that enforces it
 *
 * Run: node scripts/validate-helm-access-activation-flag.mjs   (requires `helm`)
 * Wired into .github/workflows/deploy-main.yml as a blocking pre-upgrade step.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHART = 'infra/helm/platform';
const KEY = 'DEPLOYMENT_ACCESS_ACTIVATION_ENABLED';
const VALUE_PATH = 'platformEnv.runtime.deploymentAccessActivationEnabled';

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

// 1. Default values render the interlock CLOSED.
const defaultManifest = helmTemplate([]);
check(`default values render ${KEY}: "0" (fail-closed)`, renderedFlag(defaultManifest) === '0', `got '${renderedFlag(defaultManifest)}'`);

// 2. values-prod.yaml renders it CLOSED — prod must never ship pre-armed.
const prodManifest = helmTemplate(['--values', `${CHART}/values-prod.yaml`]);
check(`values-prod.yaml renders ${KEY}: "0"`, renderedFlag(prodManifest) === '0', `got '${renderedFlag(prodManifest)}'`);

const dir = mkdtempSync(join(tmpdir(), 'helm-access-activation-flag-'));

try {
  /*
   * 3. --reuse-values simulation. This is the case that matters most: a release
   *    whose stored values pre-date the key must render "0". If it rendered "1",
   *    an upgrade that merely forgot the key would arm activation without ever
   *    running the drain barrier — exactly the hole this whole change closes.
   */
  const legacy = join(dir, 'legacy-values.yaml');
  writeFileSync(legacy, 'platformEnv:\n  runtime:\n    mode: remote-kubernetes\n');
  check(
    `legacy stored values (key absent) render ${KEY}: "0" — an upgrade can only DISARM by accident`,
    renderedFlag(helmTemplate(['--values', legacy])) === '0',
  );

  // 4. Schema rejects a malformed value ('' — e.g. a typoed --set) at render time.
  let rejectedEmpty = false;

  try {
    helmTemplate(['--set-string', `${VALUE_PATH}=`]);
  } catch {
    rejectedEmpty = true;
  }
  check(`values.schema.json rejects ${VALUE_PATH}=''`, rejectedEmpty);

  // 4b. And rejects a plausible-looking wrong value ("true") rather than coercing.
  let rejectedTrue = false;

  try {
    helmTemplate(['--set-string', `${VALUE_PATH}=true`]);
  } catch {
    rejectedTrue = true;
  }
  check(`values.schema.json rejects ${VALUE_PATH}='true'`, rejectedTrue);

  // 5. Phase 2 can genuinely arm it.
  check(
    `explicit phase-2 --set renders ${KEY}: "1"`,
    renderedFlag(helmTemplate(['--set-string', `${VALUE_PATH}=1`])) === '1',
  );

  /*
   * 6. The rendered value has to REACH the api process. The chart wires every
   *    service to the platform-env configmap via envFrom; assert that for the api
   *    Deployment specifically, so a future template refactor that drops the
   *    envFrom fails here instead of silently disabling the interlock in prod.
   */
  const apiBlock = prodManifest.split(/^---$/m).find((doc) => /kind:\s*Deployment/.test(doc) && /name:\s*vibecore-vibecore-platform-api\b/.test(doc));
  check('api Deployment is rendered', Boolean(apiBlock));
  check(
    'api Deployment consumes the platform-env configmap (envFrom) so the flag reaches the process',
    Boolean(apiBlock && /configMapRef:\s*\n\s*name:\s*vibecore-vibecore-platform-platform-env/.test(apiBlock)),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed — the activation interlock is not trustworthy. DO NOT deploy.`);
  process.exit(1);
}

console.log('\nAll password-activation interlock render checks passed.');
