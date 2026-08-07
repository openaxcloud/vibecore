#!/usr/bin/env node
/*
 * P104 / SEC-8 — phase 1 -> phase 2 barrier for deployment password protection.
 *
 * WHAT IT PROVES BEFORE LETTING THE DEPLOY CONTINUE
 * -------------------------------------------------
 * An api build from BEFORE the P104 cutover answered a PUBLIC static deployment
 * with `Cache-Control: public, max-age=60`. A shared cache may reuse that entry
 * for 60s after it was emitted, with NO revalidation against the origin, and the
 * origin has no way to purge it. So if an owner activates password protection
 * inside that window, an anonymous visitor is still served the pre-protection
 * PUBLIC copy — the protection is real at the origin and useless at the edge.
 *
 * Post-cutover the origin emits `public, no-cache, must-revalidate`, so every
 * reuse revalidates through the gate and the window is closed permanently. But
 * that only holds once BOTH are true:
 *
 *   1. no pre-cutover pod is running any more (nothing can still MINT a
 *      `max-age=60` response), and
 *   2. the full legacy max-age has elapsed since the last one could have been
 *      minted (every already-minted entry has gone stale).
 *
 * `kubectl rollout status` proves NEITHER: it returns as soon as the new
 * ReplicaSet is complete, while old pods can still be terminating (and still
 * serving, through their preStop drain). This barrier waits for the real thing.
 *
 * The wait is armed from the instant the LAST old pod disappears — not from the
 * start of the rollout — and it RE-ARMS if an old pod ever reappears (HPA
 * scaling the previous ReplicaSet, a partial rollback, a manual scale). A single
 * observation of "old pod present" resets the clock to zero.
 *
 * `waitForCacheWindowDrain` is pure: pod listing, sleeping and the clock are all
 * injected, so scripts/deploy-cache-window.spec.mjs drives the whole state
 * machine deterministically with a fake clock and no cluster. The CLI at the
 * bottom is the only part that touches kubectl.
 *
 * CLI:  node scripts/deploy-cache-window.mjs
 *   env: HELM_NAMESPACE, HELM_RELEASE, EXPECTED_IMAGE (required — the image the
 *        Deployment now wants; anything else is "old"), LEGACY_MAX_AGE_SECONDS
 *        (default 60), SAFETY_MARGIN_SECONDS (default 30), POLL_INTERVAL_SECONDS
 *        (default 5), MAX_WAIT_SECONDS (default 900), KUBECTL_BIN (default kubectl).
 * Exit 0 = drained and aged out (safe to activate). Exit 1 = timed out.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The `max-age` a PRE-CUTOVER api emitted on a public static deployment. This is
 * the number the barrier has to outlast; it is a property of the OLD code, so it
 * is a historical constant and must not be "kept in sync" with anything current.
 */
export const LEGACY_PUBLIC_MAX_AGE_SECONDS = 60;

/**
 * Added on top of the legacy max-age. Covers the things that make "60s" not
 * exactly 60s in practice: clock skew between the pod that stamped the response
 * and this runner, an `Age` already accrued in an intermediate cache, and the
 * poll granularity below (we can observe the last old pod leaving up to one poll
 * interval late — which is conservative in the right direction, but the margin
 * makes it unconditional).
 */
export const DEFAULT_SAFETY_MARGIN_SECONDS = 30;

/**
 * Wait until (a) no pod outside `expectedImage` is present, and (b) that has been
 * continuously true for `legacyMaxAgeSeconds + safetyMarginSeconds`.
 *
 * @param {object}   o
 * @param {() => Promise<Array<{name: string, image: string, phase?: string, deletionTimestamp?: string|null}>>} o.listPods
 *        Every api pod currently known to the API server, INCLUDING terminating
 *        ones — a pod with a deletionTimestamp is still able to serve.
 * @param {string}   o.expectedImage        Post-cutover image; any other image is "old".
 * @param {(ms: number) => Promise<void>} o.sleep
 * @param {() => number} o.now              Epoch ms.
 * @param {number}   [o.legacyMaxAgeSeconds]
 * @param {number}   [o.safetyMarginSeconds]
 * @param {number}   [o.pollIntervalSeconds]
 * @param {number}   [o.maxWaitSeconds]
 * @param {(msg: string) => void} [o.log]
 * @returns {Promise<{drainedAtMs: number, clearedAtMs: number, waitedMs: number, rearmCount: number, polls: number}>}
 */
export async function waitForCacheWindowDrain({
  listPods,
  expectedImage,
  sleep,
  now,
  legacyMaxAgeSeconds = LEGACY_PUBLIC_MAX_AGE_SECONDS,
  safetyMarginSeconds = DEFAULT_SAFETY_MARGIN_SECONDS,
  pollIntervalSeconds = 5,
  maxWaitSeconds = 900,
  log = () => {},
}) {
  if (!expectedImage) {
    throw new Error('waitForCacheWindowDrain: expectedImage is required');
  }

  const requiredQuietMs = (legacyMaxAgeSeconds + safetyMarginSeconds) * 1000;
  const startedAtMs = now();
  const deadlineMs = startedAtMs + maxWaitSeconds * 1000;

  /** Instant the last old pod was observed GONE; null whenever one is present. */
  let drainedAtMs = null;
  let rearmCount = 0;
  let polls = 0;

  log(
    `barrier: expectedImage=${expectedImage} quiet=${legacyMaxAgeSeconds}s+${safetyMarginSeconds}s ` +
      `poll=${pollIntervalSeconds}s timeout=${maxWaitSeconds}s`,
  );

  for (;;) {
    const pods = await listPods();
    polls += 1;

    const old = pods.filter((p) => p.image !== expectedImage);
    const current = pods.filter((p) => p.image === expectedImage);

    if (old.length > 0) {
      /*
       * Re-arm. Anything on a pre-cutover image can still mint a `max-age=60`
       * response — including a pod that is already Terminating, which keeps
       * serving through its preStop drain. Only a full disappearance counts.
       */
      if (drainedAtMs !== null) {
        rearmCount += 1;
        log(
          `barrier: RE-ARMED — ${old.length} pre-cutover pod(s) reappeared after the quiet period started ` +
            `(${old.map((p) => `${p.name}@${p.image}${p.deletionTimestamp ? ' [terminating]' : ''}`).join(', ')})`,
        );
      } else {
        log(
          `barrier: waiting — ${old.length} pre-cutover pod(s) still present ` +
            `(${old.map((p) => `${p.name}${p.deletionTimestamp ? ' [terminating]' : ''}`).join(', ')})`,
        );
      }

      drainedAtMs = null;
    } else if (current.length === 0) {
      /*
       * No old pods AND no new pods: the selector matched nothing. That is not a
       * drained cluster, it is a blind one (bad label, wrong namespace, a
       * transient API read). Refuse to start the clock on an empty observation.
       */
      log('barrier: waiting — no api pods visible at all (not treating an empty read as drained)');
      drainedAtMs = null;
    } else if (drainedAtMs === null) {
      drainedAtMs = now();
      log(`barrier: all ${current.length} api pod(s) are post-cutover — starting the ${requiredQuietMs / 1000}s quiet period`);
    }

    if (drainedAtMs !== null) {
      const quietMs = now() - drainedAtMs;

      if (quietMs >= requiredQuietMs) {
        const clearedAtMs = now();
        log(`barrier: CLEARED — ${Math.round(quietMs / 1000)}s elapsed with zero pre-cutover pods; activation is safe`);

        return { drainedAtMs, clearedAtMs, waitedMs: clearedAtMs - startedAtMs, rearmCount, polls };
      }

      log(`barrier: quiet ${Math.round(quietMs / 1000)}s / ${requiredQuietMs / 1000}s`);
    }

    if (now() >= deadlineMs) {
      throw new Error(
        `Cache-window barrier timed out after ${maxWaitSeconds}s without a clean ${requiredQuietMs / 1000}s quiet period ` +
          `(re-arms: ${rearmCount}). Password protection was NOT activated; the release stays at ` +
          `DEPLOYMENT_ACCESS_ACTIVATION_ENABLED=0 (fail-closed).`,
      );
    }

    await sleep(pollIntervalSeconds * 1000);
  }
}

/** Map `kubectl get pods -o json` onto the shape waitForCacheWindowDrain wants. */
export function parsePodList(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;

  return (parsed.items ?? []).map((item) => ({
    name: item.metadata?.name ?? '<unnamed>',
    image: item.spec?.containers?.[0]?.image ?? '<no-image>',
    phase: item.status?.phase,
    deletionTimestamp: item.metadata?.deletionTimestamp ?? null,
  }));
}

async function main() {
  const namespace = process.env.HELM_NAMESPACE || 'vibecore';
  const release = process.env.HELM_RELEASE || 'vibecore';
  const expectedImage = process.env.EXPECTED_IMAGE;
  const kubectl = process.env.KUBECTL_BIN || 'kubectl';

  if (!expectedImage) {
    console.error('EXPECTED_IMAGE is required (the image the api Deployment now wants).');
    process.exit(1);
  }

  const num = (name, fallback) => {
    const raw = process.env[name];

    if (raw === undefined || raw === '') {
      return fallback;
    }

    const value = Number(raw);

    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative number, got '${raw}'`);
    }

    return value;
  };

  const result = await waitForCacheWindowDrain({
    expectedImage,
    legacyMaxAgeSeconds: num('LEGACY_MAX_AGE_SECONDS', LEGACY_PUBLIC_MAX_AGE_SECONDS),
    safetyMarginSeconds: num('SAFETY_MARGIN_SECONDS', DEFAULT_SAFETY_MARGIN_SECONDS),
    pollIntervalSeconds: num('POLL_INTERVAL_SECONDS', 5),
    maxWaitSeconds: num('MAX_WAIT_SECONDS', 900),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (msg) => console.log(`${new Date().toISOString()} ${msg}`),
    listPods: async () => {
      const { stdout } = await execFileAsync(kubectl, [
        '-n',
        namespace,
        'get',
        'pods',
        '-l',
        `app.kubernetes.io/name=api,app.kubernetes.io/instance=${release}`,
        '-o',
        'json',
      ]);

      return parsePodList(stdout);
    },
  });

  console.log(
    `Barrier cleared after ${Math.round(result.waitedMs / 1000)}s ` +
      `(${result.polls} polls, ${result.rearmCount} re-arm(s)). Safe to activate password protection.`,
  );
}

// Only run the CLI when executed directly, so the spec can import the pure part.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
