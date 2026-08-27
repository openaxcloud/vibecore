/*
 * P104 / SEC-8 — replayable proof of the phase 1 -> phase 2 barrier.
 *
 * The whole point of the barrier is a TIMING guarantee, so testing it against a
 * real cluster would be both slow and unfalsifiable. Instead the state machine is
 * pure (pods, clock and sleep are injected) and driven here with a fake clock:
 * every assertion below is about the exact instant activation becomes allowed,
 * measured in simulated milliseconds, and reruns identically forever.
 *
 * Run: pnpm vitest --run scripts/deploy-cache-window.spec.mjs
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SAFETY_MARGIN_SECONDS,
  LEGACY_PUBLIC_MAX_AGE_SECONDS,
  parsePodList,
  waitForCacheWindowDrain,
} from './deploy-cache-window.mjs';

const NEW = 'europe-west9-docker.pkg.dev/p/r/api:newsha1234';
const OLD = 'europe-west9-docker.pkg.dev/p/r/api:oldsha9999';

/**
 * Fake clock. `sleep` does not wait — it advances the clock, so a 90s barrier is
 * exercised in microseconds while the arithmetic stays exact.
 */
function fakeClock(startMs = 1_000_000) {
  let nowMs = startMs;

  return {
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
    advance: (ms) => {
      nowMs += ms;
    },
  };
}

/** Pod list that returns a scripted sequence, repeating its last entry forever. */
function scriptedPods(frames) {
  let i = 0;

  return async () => {
    const frame = frames[Math.min(i, frames.length - 1)];
    i += 1;

    return frame;
  };
}

const pod = (name, image, extra = {}) => ({ name, image, phase: 'Running', ...extra });

describe('waitForCacheWindowDrain', () => {
  it('waits the FULL legacy max-age + margin after the last old pod disappears', async () => {
    const clock = fakeClock();
    const listPods = scriptedPods([
      [pod('api-old-1', OLD), pod('api-new-1', NEW)],
      [pod('api-old-1', OLD), pod('api-new-1', NEW), pod('api-new-2', NEW)],
      [pod('api-new-1', NEW), pod('api-new-2', NEW)], // last old pod gone here
    ]);

    const result = await waitForCacheWindowDrain({
      listPods,
      expectedImage: NEW,
      now: clock.now,
      sleep: clock.sleep,
      pollIntervalSeconds: 5,
    });

    const requiredQuietMs = (LEGACY_PUBLIC_MAX_AGE_SECONDS + DEFAULT_SAFETY_MARGIN_SECONDS) * 1000;

    // The clock starts on the poll that observed zero old pods (the 3rd poll,
    // i.e. after two 5s sleeps), never on the start of the rollout.
    expect(result.drainedAtMs).toBe(1_000_000 + 2 * 5_000);
    expect(result.clearedAtMs - result.drainedAtMs).toBeGreaterThanOrEqual(requiredQuietMs);
    expect(result.rearmCount).toBe(0);
  });

  it('does not clear one poll early — 85s of quiet is not enough for a 60+30s window', async () => {
    const clock = fakeClock();
    const listPods = scriptedPods([[pod('api-new-1', NEW)]]);
    let clearedAfterMs;

    const result = await waitForCacheWindowDrain({
      listPods,
      expectedImage: NEW,
      now: clock.now,
      sleep: clock.sleep,
      pollIntervalSeconds: 5,
    });

    clearedAfterMs = result.clearedAtMs - result.drainedAtMs;

    expect(clearedAfterMs).toBeGreaterThanOrEqual(90_000);
    expect(clearedAfterMs).toBeLessThan(95_000); // cleared at the first poll past 90s, not later
  });

  it('RE-ARMS: an old pod reappearing mid-window restarts the full wait', async () => {
    const clock = fakeClock();
    // Quiet for 3 polls (15s), then an old pod returns (HPA scaling the previous
    // ReplicaSet / partial rollback), then quiet again.
    const listPods = scriptedPods([
      [pod('api-new-1', NEW)],
      [pod('api-new-1', NEW)],
      [pod('api-new-1', NEW)],
      [pod('api-new-1', NEW), pod('api-old-zombie', OLD)],
      [pod('api-new-1', NEW)],
    ]);

    const result = await waitForCacheWindowDrain({
      listPods,
      expectedImage: NEW,
      now: clock.now,
      sleep: clock.sleep,
      pollIntervalSeconds: 5,
    });

    expect(result.rearmCount).toBe(1);
    // The clock was reset to the poll AFTER the zombie vanished (poll 5 = t+20s),
    // so the 15s of quiet before it counts for nothing.
    expect(result.drainedAtMs).toBe(1_000_000 + 4 * 5_000);
    expect(result.clearedAtMs - result.drainedAtMs).toBeGreaterThanOrEqual(90_000);
  });

  it('counts a TERMINATING old pod as still present — it serves through its preStop drain', async () => {
    const clock = fakeClock();
    const listPods = scriptedPods([
      [pod('api-new-1', NEW), pod('api-old-1', OLD, { deletionTimestamp: '2026-08-07T10:00:00Z' })],
      [pod('api-new-1', NEW)],
    ]);

    const result = await waitForCacheWindowDrain({
      listPods,
      expectedImage: NEW,
      now: clock.now,
      sleep: clock.sleep,
      pollIntervalSeconds: 5,
    });

    // Drain starts on poll 2, NOT poll 1: `rollout status` would have returned at
    // poll 1 while that terminating pod could still mint a max-age=60 response.
    expect(result.drainedAtMs).toBe(1_000_000 + 5_000);
  });

  it('refuses to treat an EMPTY pod list as drained (bad selector / transient read)', async () => {
    const clock = fakeClock();
    const listPods = scriptedPods([[], [], [pod('api-new-1', NEW)]]);

    const result = await waitForCacheWindowDrain({
      listPods,
      expectedImage: NEW,
      now: clock.now,
      sleep: clock.sleep,
      pollIntervalSeconds: 5,
    });

    // Blind polls 1-2 did not start the clock; poll 3 did.
    expect(result.drainedAtMs).toBe(1_000_000 + 2 * 5_000);
  });

  it('FAILS CLOSED on timeout rather than letting the deploy activate', async () => {
    const clock = fakeClock();
    const listPods = scriptedPods([[pod('api-old-1', OLD)]]); // never drains

    await expect(
      waitForCacheWindowDrain({
        listPods,
        expectedImage: NEW,
        now: clock.now,
        sleep: clock.sleep,
        pollIntervalSeconds: 5,
        maxWaitSeconds: 60,
      }),
    ).rejects.toThrow(/timed out.*DEPLOYMENT_ACCESS_ACTIVATION_ENABLED=0 \(fail-closed\)/s);
  });

  it('requires an expectedImage — an empty one would classify every pod as current', async () => {
    await expect(
      waitForCacheWindowDrain({
        listPods: async () => [],
        expectedImage: '',
        now: () => 0,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/expectedImage is required/);
  });

  it('honours an explicitly larger legacy max-age', async () => {
    const clock = fakeClock();
    const result = await waitForCacheWindowDrain({
      listPods: scriptedPods([[pod('api-new-1', NEW)]]),
      expectedImage: NEW,
      now: clock.now,
      sleep: clock.sleep,
      pollIntervalSeconds: 10,
      legacyMaxAgeSeconds: 300,
      safetyMarginSeconds: 0,
    });

    expect(result.clearedAtMs - result.drainedAtMs).toBeGreaterThanOrEqual(300_000);
  });
});

describe('parsePodList', () => {
  it('extracts name, image and deletionTimestamp from kubectl JSON', () => {
    const parsed = parsePodList(
      JSON.stringify({
        items: [
          {
            metadata: { name: 'api-abc', deletionTimestamp: '2026-08-07T10:00:00Z' },
            spec: { containers: [{ image: OLD }] },
            status: { phase: 'Running' },
          },
          {
            metadata: { name: 'api-def' },
            spec: { containers: [{ image: NEW }] },
            status: { phase: 'Running' },
          },
        ],
      }),
    );

    expect(parsed).toEqual([
      { name: 'api-abc', image: OLD, phase: 'Running', deletionTimestamp: '2026-08-07T10:00:00Z' },
      { name: 'api-def', image: NEW, phase: 'Running', deletionTimestamp: null },
    ]);
  });

  it('returns [] for an empty item list rather than throwing', () => {
    expect(parsePodList('{"items":[]}')).toEqual([]);
  });
});
