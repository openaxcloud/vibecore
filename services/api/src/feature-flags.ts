import { createHash } from 'node:crypto';
import type { ApiStore, FeatureFlagRecord } from './store.js';

/*
 * Per-user feature flag evaluation + a route guard.
 *
 * Flags resolve org-override-over-global, honour their `enabled` bit, and
 * support a staged rollout (`rolloutPercent`, 0–100). Rollout bucketing is
 * deterministic per (flag key, user) so a user stays on a stable side of a
 * partial rollout instead of flickering per request.
 */

export interface FeatureFlagSubject {
  userId?: string;
  organizationId?: string;
}

/** Deterministic 0–99 bucket for a seed. */
export function featureFlagBucket(seed: string): number {
  return createHash('sha256').update(seed).digest().readUInt32BE(0) % 100;
}

/** Evaluate an already-resolved flag record for a specific user. */
export function flagEnabledForUser(flag: FeatureFlagRecord, userId?: string): boolean {
  if (!flag.enabled) {
    return false;
  }

  const rollout = flag.rolloutPercent ?? 100;

  if (rollout >= 100) {
    return true;
  }

  if (rollout <= 0) {
    return false;
  }

  return featureFlagBucket(`${flag.key}:${userId ?? 'anonymous'}`) < rollout;
}

/**
 * Resolve and evaluate a single flag for a subject (organization override beats
 * the global flag). Unknown flags evaluate to `false` (closed by default).
 */
export async function evaluateFeatureFlag(
  store: ApiStore,
  key: string,
  subject: FeatureFlagSubject,
): Promise<boolean> {
  const flag = await store.findFeatureFlag(key, subject.organizationId);

  return flag ? flagEnabledForUser(flag, subject.userId) : false;
}

export class FeatureDisabledError extends Error {
  readonly statusCode = 403;
  readonly code = 'FEATURE_DISABLED';

  constructor(key: string) {
    super(`Feature '${key}' is not enabled`);
    this.name = 'FeatureDisabledError';
  }
}

/**
 * Route guard / middleware: throws {@link FeatureDisabledError} (403
 * FEATURE_DISABLED) when the named flag is not enabled for the subject. Call at
 * the top of a handler to gate an endpoint behind a per-user feature flag:
 *
 *   await assertFeatureEnabled(store, 'my-flag', {
 *     userId: request.currentUser?.id,
 *     organizationId: orgIdFromRequest(request),
 *   });
 */
export async function assertFeatureEnabled(
  store: ApiStore,
  key: string,
  subject: FeatureFlagSubject,
): Promise<void> {
  if (!(await evaluateFeatureFlag(store, key, subject))) {
    throw new FeatureDisabledError(key);
  }
}
