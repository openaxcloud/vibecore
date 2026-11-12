import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedImage,
  runPhysicalCi,
  validatePhysicalCiTarget,
  validatePhysicalReceipt,
} from './database-restore-physical-ci.js';

const env = { CI: 'true', RESTORE_CI_POSTGRES_CONTAINER: 'a'.repeat(64) };

const walHeader = Buffer.alloc(40);
walHeader.writeUInt16LE(0xd113, 0);
walHeader.writeUInt16LE(2, 2);
walHeader.writeUInt32LE(1, 4);
walHeader.writeBigUInt64LE(42n, 24);
walHeader.writeUInt32LE(1024 * 1024, 32);
walHeader.writeUInt32LE(8192, 36);

const receipt = {
  walHeaderBase64: walHeader.toString('base64'),
  walSegment: '000000010000000000000000',
  walSegmentSizeBytes: 1024 * 1024,
  systemIdentifier: '42',
  physicalBackupVerified: true,
  tamperedBackupRejected: true,
  walRecoveryVerified: true,
  archivedWalRecordsVerified: true,
  corruptArchivedWalRejected: true,
  missingArchivedWalRejected: true,
  postTargetWriteExcluded: true,
  targetRestartVerified: true,
  networkListeners: false,
  production: false,
  postgresVersion: '160004',
  manifestSha256: 'b'.repeat(64),
};
test('fails before any command outside exact CI service target', async () => {
  for (const target of [{}, { ...env, CI: 'false' }, { ...env, RESTORE_CI_POSTGRES_CONTAINER: 'production' }]) {
    let calls = 0;
    await assert.rejects(
      runPhysicalCi(target, async () => {
        calls++;
        return '';
      }),
    );
    assert.equal(calls, 0);
  }
  assert.equal(validatePhysicalCiTarget(env), env.RESTORE_CI_POSTGRES_CONTAINER);
});
test('refuses a different image before executing the recipe', async () => {
  let calls = 0;
  await assert.rejects(
    runPhysicalCi(env, async () => {
      calls++;
      return 'other';
    }),
  );
  assert.equal(calls, 1);
});
test('checks every physical proof field and never promotes fixture evidence to production', () => {
  for (const invalid of [
    null,
    undefined,
    [],
    true,
    'receipt',
    1,
    { ...receipt, postgresVersion: 160004 },
    { ...receipt, manifestSha256: 123 },
  ]) {
    assert.throws(() => validatePhysicalReceipt(invalid));
  }

  for (const key of Object.keys(receipt)) {
    const copy: Record<string, unknown> = { ...receipt };
    delete copy[key];
    assert.throws(() => validatePhysicalReceipt(copy));

    if (receipt[key as keyof typeof receipt] === true) {
      assert.throws(() => validatePhysicalReceipt({ ...receipt, [key]: false }));
    }
  }
  assert.throws(() => validatePhysicalReceipt({ ...receipt, networkListeners: true }));
  assert.throws(() => validatePhysicalReceipt({ ...receipt, production: true }));
  assert.throws(() => validatePhysicalReceipt({ ...receipt, postgresVersion: '170001' }));
  assert.throws(() => validatePhysicalReceipt({ ...receipt, systemIdentifier: '43' }));

  const proof = validatePhysicalReceipt({ ...receipt, providerSecret: 'must not echo' });
  assert.equal(proof.production, false);
  assert.equal(proof.walHeaderIdentityVerified, true);
  assert.equal('providerSecret' in proof, false);
  assert.equal('walHeaderBase64' in proof, false);
});
test('executes only the existing service as postgres, bounded, using socket-only synthetic recipe', async () => {
  const calls: string[][] = [];

  const proof = await runPhysicalCi(env, async (args, script) => {
    calls.push(args);

    if (args[0] === 'inspect') {
      return expectedImage;
    }

    assert.ok(script?.includes("listen_addresses=''"));
    assert.ok(script?.includes('pg_verifybackup'));
    assert.ok(script?.includes('recovery_target_time'));

    return JSON.stringify(receipt);
  });
  assert.deepEqual(calls[1], [
    'exec',
    '--interactive',
    '--user',
    'postgres',
    '--env',
    'VIBECORE_SYNTHETIC_PHYSICAL_RESTORE=1',
    env.RESTORE_CI_POSTGRES_CONTAINER,
    'timeout',
    '--signal=TERM',
    '--kill-after=15s',
    '240s',
    'bash',
    '-s',
  ]);
  assert.equal(proof.production, false);
});
