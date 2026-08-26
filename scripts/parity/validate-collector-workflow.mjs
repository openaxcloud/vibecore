#!/usr/bin/env node
/**
 * Structural contract for the daily parity collector job.
 *
 * It prevents a workflow edit from silently restoring the original failure
 * mode: a collector launched without pinned local dependencies or Chromium,
 * followed by a successful commit containing RENDER_UNAVAILABLE entries.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const runtimePrefix = 'scripts/parity/collector-runtime';
const expectedDependencies = Object.freeze({ playwright: '1.59.1', yaml: '2.8.4' });

function extractJob(workflowSource, jobName) {
  const lines = workflowSource.split('\n');
  const start = lines.findIndex((line) => line === `  ${jobName}:`);
  if (start === -1) {
    return '';
  }

  const end = lines.findIndex((line, index) => index > start && /^  [a-zA-Z0-9_-]+:\s*$/.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function requirePattern(errors, source, pattern, message) {
  if (!pattern.test(source)) {
    errors.push(message);
  }
}

export function validateCollectorWorkflowContract({ workflowSource, runtimePackage, runtimeLock }) {
  const errors = [];
  const job = extractJob(workflowSource, 'collect-baseline');

  if (!job) {
    return ['workflow job collect-baseline is missing'];
  }

  const dependencyNames = Object.keys(runtimePackage.dependencies ?? {}).sort();
  const expectedNames = Object.keys(expectedDependencies).sort();
  if (JSON.stringify(dependencyNames) !== JSON.stringify(expectedNames)) {
    errors.push(`collector runtime dependencies must be exactly ${expectedNames.join(', ')}`);
  }

  const lockDependencyNames = Object.keys(runtimeLock.packages?.['']?.dependencies ?? {}).sort();
  if (JSON.stringify(lockDependencyNames) !== JSON.stringify(expectedNames)) {
    errors.push(`collector lockfile root dependencies must be exactly ${expectedNames.join(', ')}`);
  }

  for (const [name, version] of Object.entries(expectedDependencies)) {
    if (runtimePackage.dependencies?.[name] !== version) {
      errors.push(`collector runtime dependency ${name} must be pinned exactly to ${version}`);
    }

    if (runtimeLock.packages?.['']?.dependencies?.[name] !== version) {
      errors.push(`collector lockfile root dependency ${name} must resolve from exact pin ${version}`);
    }
  }

  requirePattern(errors, job, /timeout-minutes:\s*15\b/, 'collector job must keep a 15-minute job timeout');
  requirePattern(
    errors,
    job,
    /uses:\s*actions\/setup-node@v4[\s\S]*?cache:\s*npm[\s\S]*?cache-dependency-path:\s*scripts\/parity\/collector-runtime\/package-lock\.json/,
    'setup-node must cache npm from the isolated collector lockfile',
  );
  requirePattern(
    errors,
    job,
    /uses:\s*actions\/cache@v4[\s\S]*?path:\s*~\/\.cache\/ms-playwright[\s\S]*?hashFiles\('scripts\/parity\/collector-runtime\/package-lock\.json'\)/,
    'the Playwright browser cache must be keyed by the isolated collector lockfile',
  );
  requirePattern(
    errors,
    job,
    /timeout 2m npm ci --prefix scripts\/parity\/collector-runtime --ignore-scripts --no-audit --no-fund/,
    'collector dependencies must be installed locally with bounded npm ci',
  );
  requirePattern(
    errors,
    job,
    /timeout 8m scripts\/parity\/collector-runtime\/node_modules\/\.bin\/playwright install --with-deps chromium/,
    'Chromium must be installed explicitly through the pinned local Playwright binary with a timeout',
  );
  requirePattern(
    errors,
    job,
    /PARITY_PLAYWRIGHT_MODULE:\s*\$\{\{ github\.workspace \}\}\/scripts\/parity\/collector-runtime\/node_modules\/playwright\/index\.js/,
    'the collector must receive the explicit local Playwright module path',
  );
  requirePattern(
    errors,
    job,
    /timeout 10m node scripts\/parity\/collect-baseline\.mjs 2>&1 \| tee \/tmp\/collect\.log/,
    'the collector execution must be bounded and preserve stdout/stderr diagnostics',
  );
  requirePattern(
    errors,
    job,
    /timeout 1m node scripts\/parity\/assert-rendered-baseline\.mjs --manifest "\$\{\{ steps\.collect\.outputs\.snapshot_dir \}\}\/manifest\.json"/,
    'a fail-closed rendered-baseline gate must run before commit',
  );
  requirePattern(
    errors,
    job,
    /PARITY_DEPS="\$\{\{ github\.workspace \}\}\/scripts\/parity\/collector-runtime" node scripts\/parity\/validate-registries\.mjs/,
    'registry validation must use the explicit isolated yaml dependency',
  );
  requirePattern(
    errors,
    job,
    /if:\s*always\(\)[\s\S]*?uses:\s*actions\/upload-artifact@v4[\s\S]*?\/tmp\/collect\.log[\s\S]*?manifest\.json[\s\S]*?pricing\.rendered\.html[\s\S]*?gallery\.rendered\.html[\s\S]*?community\.rendered\.html/,
    'collector logs, manifest and rendered pages must be uploaded even on failure',
  );

  if (/\bnpx\b/.test(job) || /(^|\s)(pnpm|yarn)\s/.test(job)) {
    errors.push('collector job must not rely on an alternate or implicit package runner');
  }

  if (/\bnpm install\b/.test(job)) {
    errors.push('collector job must use npm ci, never mutable npm install');
  }

  const gateIndex = job.indexOf('assert-rendered-baseline.mjs');
  const commitIndex = job.indexOf("Commit the day's snapshot");
  if (gateIndex === -1 || commitIndex === -1 || gateIndex > commitIndex) {
    errors.push('rendered-baseline gate must execute before the snapshot commit step');
  }

  return errors;
}

export function loadCollectorWorkflowContract(root = repoRoot) {
  return {
    workflowSource: readFileSync(join(root, '.github', 'workflows', 'parity-registries.yml'), 'utf8'),
    runtimePackage: JSON.parse(readFileSync(join(root, runtimePrefix, 'package.json'), 'utf8')),
    runtimeLock: JSON.parse(readFileSync(join(root, runtimePrefix, 'package-lock.json'), 'utf8')),
  };
}

function main() {
  const errors = validateCollectorWorkflowContract(loadCollectorWorkflowContract());
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[parity-collector-workflow] ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('[parity-collector-workflow] pinned runtime, Chromium, timeouts, render gate and artifacts verified');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
