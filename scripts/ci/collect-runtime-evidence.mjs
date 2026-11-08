import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { redactRuntimeEvidence } from './runtime-evidence-redaction.mjs';

const exec = promisify(execFile);
const output = 'tmp/runtime-evidence';
await mkdir(output, { recursive: true });

const maxFile = 256 * 1024;
const maxTotal = 20 * 1024 * 1024;

let total = 0;

const manifest = [];

const credentials = ['WORKSPACE_AGENT_TOKEN_SECRET', 'WORKSPACE_MANAGER_SHARED_SECRET', 'PREVIEW_PROXY_SHARED_SECRET']
  .map((key) => process.env[key])
  .filter(Boolean);

async function save(name, data) {
  const buffer = Buffer.from(redactRuntimeEvidence(data, credentials));
  const bounded = buffer.subarray(Math.max(0, buffer.length - maxFile));

  if (total + bounded.length > maxTotal) {
    manifest.push({ name, omitted: 'total limit' });
    return;
  }

  await writeFile(path.join(output, name), bounded);
  total += bounded.length;
  manifest.push({ name, bytes: bounded.length, truncated: buffer.length > bounded.length });
}

for (const service of ['api', 'web', 'admin', 'manager', 'router', 'preview', 'gc']) {
  try {
    await save(`${service}.log`, await readFile(`/tmp/vibecore-${service}.log`, 'utf8'));
  } catch {
    manifest.push({ name: `${service}.log`, missing: true });
  }
}

for (const file of ['tmp/ide-panel-audit.json']) {
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
