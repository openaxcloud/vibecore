/** Real physical recovery in fresh socket-only clusters inside CI's disposable PG16 service. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const expectedImage =
  'pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b';
export function validatePhysicalCiTarget(env) {
  assert.equal(env.CI, 'true', 'PHYSICAL_RESTORE_CI_REQUIRED');
  assert.match(env.RESTORE_CI_POSTGRES_CONTAINER ?? '', /^[a-f0-9]{64}$/, 'PHYSICAL_RESTORE_SERVICE_REQUIRED');

  return env.RESTORE_CI_POSTGRES_CONTAINER;
}
export function validatePhysicalReceipt(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'PHYSICAL_RESTORE_RECEIPT_INVALID');

  for (const key of [
    'physicalBackupVerified',
    'tamperedBackupRejected',
    'walRecoveryVerified',
    'postTargetWriteExcluded',
    'targetRestartVerified',
  ]) {
    assert.equal(value[key], true, 'PHYSICAL_RESTORE_PROOF_MISSING');
  }
  assert.equal(value.networkListeners, false, 'PHYSICAL_RESTORE_NETWORK_UNEXPECTED');
  assert.match(value.postgresVersion ?? '', /^16[0-9]{4}$/, 'PHYSICAL_RESTORE_VERSION_INVALID');
  assert.match(value.manifestSha256 ?? '', /^[a-f0-9]{64}$/, 'PHYSICAL_RESTORE_MANIFEST_INVALID');

  return {
    physicalBackupVerified: true,
    tamperedBackupRejected: true,
    walRecoveryVerified: true,
    postTargetWriteExcluded: true,
    targetRestartVerified: true,
    networkListeners: false,
    postgresVersion: value.postgresVersion,
    manifestSha256: value.manifestSha256,
    production: false,
  };
}

/** No shell interpolation, inherited credentials or unbounded child output. */
function docker(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH } });

    let output = '';
    let failed = false;

    const stop = () => {
      failed = true;
      child.kill('SIGKILL');
    };

    const timeout = setTimeout(stop, 300_000);
    child.stdout.on('data', (data) => {
      output += data.toString();

      if (Buffer.byteLength(output) > 64 * 1024) {
        stop();
      }
    });
    child.stdin.on('error', stop);
    child.once('error', () => {
      clearTimeout(timeout);
      reject(new Error('PHYSICAL_RESTORE_COMMAND_FAILED'));
    });
    child.once('close', (code) => {
      clearTimeout(timeout);

      if (failed || code !== 0) {
        reject(new Error('PHYSICAL_RESTORE_COMMAND_FAILED'));
      } else {
        resolve(output.trim());
      }
    });
    child.stdin.end(input);
  });
}

export async function runPhysicalCi(env = process.env, run = docker) {
  const container = validatePhysicalCiTarget(env);
  const image = await run(['inspect', '--format', '{{.Config.Image}}', container]);
  assert.equal(image, expectedImage, 'PHYSICAL_RESTORE_SERVICE_IDENTITY_MISMATCH');

  const script = await readFile(new URL('./database-restore-existing-postgres.sh', import.meta.url), 'utf8');

  const output = await run(
    [
      'exec',
      '--interactive',
      '--user',
      'postgres',
      '--env',
      'VIBECORE_SYNTHETIC_PHYSICAL_RESTORE=1',
      container,
      'timeout',
      '--signal=TERM',
      '--kill-after=15s',
      '240s',
      'bash',
      '-s',
    ],
    script,
  );

  // Only one machine receipt is permitted; shell chatter must not hide failures.
  return validatePhysicalReceipt(JSON.parse(output));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const proof = await runPhysicalCi();
    console.log(JSON.stringify({ event: 'ISOLATED_PHYSICAL_RESTORE_CI', ...proof }));
  } catch {
    console.error('ISOLATED_PHYSICAL_RESTORE_CI_FAILED');
    process.exitCode = 1;
  }
}
