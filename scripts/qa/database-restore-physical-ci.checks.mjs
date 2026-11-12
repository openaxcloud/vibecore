import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedImage,
  runPhysicalCi,
  validatePhysicalCiTarget,
  validatePhysicalReceipt,
} from './database-restore-physical-ci.mjs';

const env = { CI: 'true', RESTORE_CI_POSTGRES_CONTAINER: 'a'.repeat(64) };

const receipt = {
  physicalBackupVerified: true,
  tamperedBackupRejected: true,
  walRecoveryVerified: true,
  postTargetWriteExcluded: true,
  targetRestartVerified: true,
  networkListeners: false,
  postgresVersion: '160004',
  manifestSha256: 'b'.repeat(64),
};
test('fails before any command outside exact CI service target', async () => {
  for (const target of [{}, { ...env, CI: 'false' }, { ...env, RESTORE_CI_POSTGRES_CONTAINER: 'production' }]) {
    let calls = 0;
    await assert.rejects(
      runPhysicalCi(target, async () => {
        calls++;
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
  for (const key of Object.keys(receipt)) {
    const copy = { ...receipt };
    delete copy[key];
    assert.throws(() => validatePhysicalReceipt(copy));
  }
  assert.throws(() => validatePhysicalReceipt({ ...receipt, networkListeners: true }));
  assert.throws(() => validatePhysicalReceipt({ ...receipt, postgresVersion: '170001' }));
  assert.deepEqual(validatePhysicalReceipt({ ...receipt, providerSecret: 'must not echo' }), {
    ...receipt,
    production: false,
  });
});
test('executes only the existing service as postgres, bounded, using socket-only synthetic recipe', async () => {
  const calls = [];

  const proof = await runPhysicalCi(env, async (args, script) => {
    calls.push(args);

    if (args[0] === 'inspect') {
      return expectedImage;
    }

    assert.ok(script.includes("listen_addresses=''"));
    assert.ok(script.includes('pg_verifybackup'));
    assert.ok(script.includes('recovery_target_time'));

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
