/** Real physical recovery in fresh socket-only clusters inside CI's disposable PG16 service. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line no-restricted-imports -- Isolated CI reuses the API native header verifier, not the web alias.
import { verifyPostgres16WalHeader } from '../../services/api/src/database-restore-wal-header.js';

export const expectedImage =
  'pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b';
export type CommandRunner = (args: string[], input?: string) => Promise<string>;
export interface PhysicalReceipt {
  physicalBackupVerified: true;
  walHeaderIdentityVerified: true;
  tamperedBackupRejected: true;
  walRecoveryVerified: true;
  archivedWalRecordsVerified: true;
  corruptArchivedWalRejected: true;
  missingArchivedWalRejected: true;
  postTargetWriteExcluded: true;
  targetRestartVerified: true;
  networkListeners: false;
  postgresVersion: string;
  manifestSha256: string;
  production: false;
}

export function validatePhysicalCiTarget(env: NodeJS.ProcessEnv): string {
  assert.equal(env.CI, 'true', 'PHYSICAL_RESTORE_CI_REQUIRED');

  const container = env.RESTORE_CI_POSTGRES_CONTAINER ?? '';
  assert.match(container, /^[a-f0-9]{64}$/, 'PHYSICAL_RESTORE_SERVICE_REQUIRED');

  return container;
}
export function validatePhysicalReceipt(input: unknown): PhysicalReceipt {
  const value = input as Record<string, unknown>;
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'PHYSICAL_RESTORE_RECEIPT_INVALID');

  for (const key of [
    'physicalBackupVerified',
    'tamperedBackupRejected',
    'walRecoveryVerified',
    'archivedWalRecordsVerified',
    'corruptArchivedWalRejected',
    'missingArchivedWalRejected',
    'postTargetWriteExcluded',
    'targetRestartVerified',
  ]) {
    assert.equal(value[key], true, 'PHYSICAL_RESTORE_PROOF_MISSING');
  }
  assert.equal(value.networkListeners, false, 'PHYSICAL_RESTORE_NETWORK_UNEXPECTED');
  assert.equal(value.production, false, 'PHYSICAL_RESTORE_PRODUCTION_FORBIDDEN');
  assert.ok(typeof value.postgresVersion === 'string', 'PHYSICAL_RESTORE_VERSION_INVALID');
  assert.ok(typeof value.manifestSha256 === 'string', 'PHYSICAL_RESTORE_MANIFEST_INVALID');
  assert.match(value.postgresVersion, /^16[0-9]{4}$/, 'PHYSICAL_RESTORE_VERSION_INVALID');
  assert.match(value.manifestSha256, /^[a-f0-9]{64}$/, 'PHYSICAL_RESTORE_MANIFEST_INVALID');

  assert.ok(typeof value.walHeaderBase64 === 'string', 'PHYSICAL_RESTORE_HEADER_MISSING');
  assert.match(value.walHeaderBase64, /^[A-Za-z0-9+/]{54}==$/, 'PHYSICAL_RESTORE_HEADER_INVALID');
  assert.ok(typeof value.walSegment === 'string', 'PHYSICAL_RESTORE_SEGMENT_MISSING');
  assert.match(value.walSegment, /^[0-9A-F]{24}$/, 'PHYSICAL_RESTORE_SEGMENT_INVALID');
  assert.ok(typeof value.walSegmentSizeBytes === 'number', 'PHYSICAL_RESTORE_SEGMENT_SIZE_INVALID');
  assert.ok(typeof value.systemIdentifier === 'string', 'PHYSICAL_RESTORE_SYSTEM_MISSING');
  verifyPostgres16WalHeader(
    Buffer.from(value.walHeaderBase64, 'base64'),
    {
      bucket: 'synthetic-backups',
      projectId: 'synthetic',
      environment: 'development',
      sourceName: 'db-synthetic',
      sourceUid: 'isolated-ci',
      provenanceId: 'isolated-ci',
      firstSegment: value.walSegment,
      lastSegment: value.walSegment,
      walSegmentSizeBytes: value.walSegmentSizeBytes,
    },
    `db/synthetic/db-synthetic/wals/${value.walSegment.slice(0, 16)}/${value.walSegment}.gz`,
    {
      systemIdentifier: value.systemIdentifier,
      walBlockSizeBytes: 8192,
    },
  );

  return {
    physicalBackupVerified: true,
    walHeaderIdentityVerified: true,
    tamperedBackupRejected: true,
    walRecoveryVerified: true,
    archivedWalRecordsVerified: true,
    corruptArchivedWalRejected: true,
    missingArchivedWalRejected: true,
    postTargetWriteExcluded: true,
    targetRestartVerified: true,
    networkListeners: false,
    postgresVersion: value.postgresVersion,
    manifestSha256: value.manifestSha256,
    production: false,
  };
}

/** No shell interpolation, inherited credentials or unbounded child output. */
const docker: CommandRunner = (args, input = '') => {
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
};

export async function runPhysicalCi(
  env: NodeJS.ProcessEnv = process.env,
  run: CommandRunner = docker,
): Promise<PhysicalReceipt> {
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
