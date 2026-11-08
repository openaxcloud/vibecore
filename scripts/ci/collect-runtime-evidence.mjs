import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { summarizeRuntimeApi } from './runtime-api-evidence.mjs';
import { redactRuntimeEvidence } from './runtime-evidence-redaction.mjs';

const exec = promisify(execFile);

const output =
  process.env.RUNTIME_EVIDENCE_PHASE === 'preflight' ? 'tmp/runtime-preflight-evidence' : 'tmp/runtime-evidence';
await mkdir(output, { recursive: true });

const maxFile = 256 * 1024;

// Two phase artifacts, at most 10 MiB each, preserve the 20 MiB run budget.
const maxTotal = 10 * 1024 * 1024;

let total = 0;

const manifest = [];

const credentials = ['WORKSPACE_AGENT_TOKEN_SECRET', 'WORKSPACE_MANAGER_SHARED_SECRET', 'PREVIEW_PROXY_SHARED_SECRET']
  .map((key) => process.env[key])
  .filter(Boolean);

async function save(name, data) {
  const buffer = Buffer.from(redactRuntimeEvidence(data, credentials));
  const bounded = buffer.subarray(Math.max(0, buffer.length - maxFile));

  if (total + bounded.length > maxTotal - 64 * 1024) {
    manifest.push({ name, omitted: 'total limit' });
    return;
  }

  await writeFile(path.join(output, name), bounded);
  total += bounded.length;
  manifest.push({ name, bytes: bounded.length, truncated: buffer.length > bounded.length });
}

for (const service of ['api', 'web', 'admin', 'manager', 'router', 'preview', 'gc']) {
  try {
    const data = await readFile(`/tmp/vibecore-${service}.log`, 'utf8');
    await save(`${service}.log`, data);

    if (service === 'api') {
      await save('runtime-api-summary.json', JSON.stringify(summarizeRuntimeApi(data), null, 2));
    }
  } catch {
    manifest.push({ name: `${service}.log`, missing: true });
  }
}

for (const file of [
  'tmp/ide-panel-audit.json',
  'tmp/runtime-network-sentinel.json',
  'tmp/runtime-network-observer.json',
]) {
  try {
    await save(path.basename(file), await readFile(file, 'utf8'));
  } catch {
    manifest.push({ name: file, missing: true });
  }
}

try {
  await save('k3s.log', await readFile(`${process.env.RUNNER_TEMP}/vibecore-runtime/k3s.log`, 'utf8'));
} catch {
  manifest.push({ name: 'k3s.log', missing: true });
}

const evidenceDir = `${process.env.RUNNER_TEMP}/vibecore-runtime/evidence`;

for (const name of await readdir(evidenceDir).catch(() => [])) {
  if (/^[a-zA-Z0-9_.-]+$/.test(name)) {
    await save(name, await readFile(path.join(evidenceDir, name), 'utf8'));
  }
}

// Explicit safe projections only. No Secret, kubeconfig, pod env or raw trace export.
for (const [name, args] of [
  ['pods.txt', ['-n', 'workspaces', 'get', 'pods', '-o', 'wide']],
  ['storage.txt', ['-n', 'workspaces', 'get', 'pvc']],
  ['events.txt', ['-n', 'workspaces', 'get', 'events', '--sort-by=.lastTimestamp']],
]) {
  try {
    const { stdout, stderr } = await exec('kubectl', args, { timeout: 15000, maxBuffer: 512 * 1024 });
    await save(name, stdout + stderr);
  } catch (error) {
    await save(name, `${error.stdout ?? ''}\n${error.stderr ?? ''}\nDiagnostic exit: ${error.code}`);
  }
}

// Snapshots capture the current UI and test failure, not credentials in network traces.
async function snapshots(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await snapshots(file);
      continue;
    }

    if (entry.name === 'runtime-command-output.json') {
      // Only the preflight's bounded, redacted visible Server logs projection.
      await save(`command-output-${manifest.length}.json`, await readFile(file, 'utf8'));
    }

    if (entry.name === 'mobile-layout-evidence.json') {
      // Capture failing compact-shell geometry before its browser context closes.
      // This explicit projection still passes through redaction and byte budgets.
      await save(`mobile-layout-${manifest.length}.json`, await readFile(file, 'utf8'));
    }

    if (entry.name === 'desktop-layout-evidence.json') {
      // Structural hydration/layout evidence only, captured before teardown.
      await save(`desktop-layout-${manifest.length}.json`, await readFile(file, 'utf8'));
    }

    if (entry.name === 'error-context.md') {
      await save(`failure-${manifest.length}.md`, await readFile(file, 'utf8'));
    }
  }
}
await snapshots('test-results');
await snapshots('tmp/runtime-ci-preflight-results');
await writeFile(
  path.join(output, 'manifest.json'),
  JSON.stringify({ maxFile, maxTotal, total, files: manifest }, null, 2),
);
