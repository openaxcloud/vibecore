import assert from 'node:assert/strict';
import test from 'node:test';
import { runLocalhostGuard } from './runtime-localhost-deadline.mjs';

const never = () => new Promise(() => {});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test('normal guard closes and cancels its watchdog', async () => {
  let closed = false;
  let exits = 0;
  await runLocalhostGuard({
    run: async () => {},
    cleanup: async () => {
      closed = true;
    },
    forceExit: () => exits++,
    hardMs: 200,
  });
  await sleep(250);
  assert.equal(closed, true);
  assert.equal(exits, 0);
});
test('blocked newPage fails functional deadline but still closes handles', async () => {
  let closed = false;
  let exit;
  await assert.rejects(
    runLocalhostGuard({
      run: never,
      cleanup: async () => {
        closed = true;
      },
      forceExit: (code) => {
        exit = code;
      },
      workMs: 5,
      cleanupMs: 5,
      hardMs: 200,
    }),
    /localhost_guard_deadline/,
  );
  assert.equal(closed, true);
  await sleep(250);
  assert.equal(exit, 1);
});
test('blocked close fails and leaves bounded fail-closed watchdog armed', async () => {
  let exit;
  await assert.rejects(
    runLocalhostGuard({
      run: async () => {},
      cleanup: never,
      forceExit: (code) => {
        exit = code;
      },
      cleanupMs: 5,
      hardMs: 200,
    }),
    /localhost_guard_cleanup_deadline/,
  );
  await sleep(250);
  assert.equal(exit, 1);
});
test('assertion failure remains failure after successful cleanup', async () => {
  await assert.rejects(
    runLocalhostGuard({
      run: async () => {
        throw new Error('assertion');
      },
      cleanup: async () => {},
      forceExit: () => assert.fail('unexpected exit'),
    }),
    /assertion/,
  );
});

test('late work completion after cleanup does not disarm the fail-closed watchdog', async () => {
  let finish;
  let exit;
  await assert.rejects(
    runLocalhostGuard({
      run: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      cleanup: async () => {},
      forceExit: (code) => {
        exit = code;
      },
      workMs: 5,
      hardMs: 200,
    }),
    /localhost_guard_deadline/,
  );
  finish();
  await sleep(250);
  assert.equal(exit, 1);
});

test('work settling during cleanup after deadline cannot disarm watchdog', async () => {
  let finish;
  let exit;
  await assert.rejects(
    runLocalhostGuard({
      run: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      cleanup: async () => {
        finish();
        await Promise.resolve();
      },
      forceExit: (code) => {
        exit = code;
      },
      workMs: 5,
      hardMs: 200,
    }),
    /localhost_guard_deadline/,
  );
  await sleep(250);
  assert.equal(exit, 1);
});
