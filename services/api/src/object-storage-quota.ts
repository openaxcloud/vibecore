import { ObjectStorageError, type ObjectStorage } from './object-storage.js';
import type { ApiStore } from './store.js';

/*
 * AUDX-020 — refuse an upload URL BEFORE signing it when the project is over its
 * storage quota.
 *
 * Why this has to happen before signing: a signed URL is used DIRECTLY against
 * GCS. Once it is handed out, the api is no longer on the path and cannot refuse
 * anything. The only moment a quota can be enforced is the moment the URL is
 * minted — after that the bytes land whatever the platform thinks.
 *
 * Why this could not exist before AUDX-023: there was no measurement of a
 * project's real GCS usage at all (metering summed a PostgreSQL archive table),
 * so there was no number to compare a quota against.
 */

/**
 * Per-project ceiling in bytes. `0` (the default) disables enforcement.
 *
 * ⚠️ This is a SAFETY ceiling, not a plan tier. Per-plan storage entitlements are
 * a pricing decision (D-03 = Avi) and are deliberately not invented here; when
 * they exist, `resolveProjectQuotaBytes` is the one place to read them.
 */
export function objectStorageQuotaBytes(): number {
  const raw = Number(process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT);

  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * How stale a persisted measurement may be before the check re-measures live.
 * Defaults to 6 h: the inventory runs daily, so without this a project could
 * overshoot for a whole day between sweeps.
 */
export function quotaMeasurementMaxAgeMs(): number {
  const raw = Number(process.env.OBJECT_STORAGE_QUOTA_MAX_AGE_MS);

  return Number.isFinite(raw) && raw > 0 ? raw : 6 * 60 * 60 * 1000;
}

/**
 * Fraction of the quota above which the check stops trusting the stored number
 * and re-lists the bucket. Cheap in the common case, exact where it matters.
 */
const LIVE_RECHECK_THRESHOLD = 0.9;

export interface QuotaDecision {
  allowed: boolean;
  quotaBytes: number;
  usedBytes: number;
  requestedBytes: number;
  /** 'stored' = persisted inventory, 'live' = bucket listed during this check. */
  source: 'stored' | 'live' | 'none';
  measuredAt?: Date;
}

export class ObjectStorageQuotaError extends ObjectStorageError {
  constructor(readonly decision: QuotaDecision) {
    super(
      `Project object storage quota exceeded: ${decision.usedBytes} + ${decision.requestedBytes} > ${decision.quotaBytes} bytes`,
      'OBJECT_STORAGE_QUOTA_EXCEEDED',
    );
  }
}

/**
 * Decide whether a project may be handed an upload URL for up to
 * `requestedBytes` more bytes.
 *
 * The measurement is read from the persisted inventory first. It is re-measured
 * LIVE when the stored figure is stale, missing, or already close to the ceiling
 * — the three cases where trusting it would let a project sail past the quota.
 *
 * ⚠️ Stated limitation: between two checks, several URLs can be minted
 * concurrently and each is judged against the same stored usage. The ceiling is
 * therefore approached, not enforced to the byte, under concurrency. Making it
 * exact requires reserving the bytes at mint time and reconciling on upload
 * completion — which the signed-URL flow never reports back. Refusing to sign
 * past the ceiling is a bound; it is not a transaction, and it is not claimed to
 * be one.
 */
export async function checkObjectStorageQuota(
  store: Pick<ApiStore, 'getProjectObjectStorageUsage'>,
  objectStorage: Pick<ObjectStorage, 'listAllObjects'>,
  input: { projectId: string; requestedBytes: number; nowMs: number },
): Promise<QuotaDecision> {
  const quotaBytes = objectStorageQuotaBytes();

  if (quotaBytes <= 0) {
    return {
      allowed: true,
      quotaBytes: 0,
      usedBytes: 0,
      requestedBytes: input.requestedBytes,
      source: 'none',
    };
  }

  const stored = await store.getProjectObjectStorageUsage(input.projectId);
  const ageMs = stored ? input.nowMs - stored.measuredAt.getTime() : Number.POSITIVE_INFINITY;
  const stale = ageMs > quotaMeasurementMaxAgeMs();
  const nearLimit = stored ? stored.bytes >= quotaBytes * LIVE_RECHECK_THRESHOLD : false;

  let usedBytes = stored?.bytes ?? 0;
  let source: QuotaDecision['source'] = stored ? 'stored' : 'live';
  let measuredAt = stored?.measuredAt;

  if (!stored || stale || nearLimit) {
    try {
      const inventory = await objectStorage.listAllObjects(input.projectId);
      usedBytes = inventory.totalBytes;
      source = 'live';
      measuredAt = new Date(input.nowMs);
    } catch {
      /*
       * The bucket could not be listed (not provisioned yet, or GCS refused).
       * Fall back to whatever was stored — and to 0 when nothing was.
       *
       * This is a deliberate FAIL-OPEN, and it is the right call only because
       * the consequence of the alternative is worse: a GCS hiccup would block
       * every upload on the platform. The ceiling is a cost guard, not a
       * security boundary — the security boundaries here are AUDX-021 (size
       * signed into the URL) and AUDX-022 (token scopes), and neither depends on
       * this path. Recorded plainly rather than left for a reader to discover.
       */
      source = stored ? 'stored' : 'none';
    }
  }

  return {
    allowed: usedBytes + input.requestedBytes <= quotaBytes,
    quotaBytes,
    usedBytes,
    requestedBytes: input.requestedBytes,
    source,
    ...(measuredAt ? { measuredAt } : {}),
  };
}

/** Throws `ObjectStorageQuotaError` when the project is over its ceiling. */
export async function assertObjectStorageQuota(
  store: Pick<ApiStore, 'getProjectObjectStorageUsage'>,
  objectStorage: Pick<ObjectStorage, 'listAllObjects'>,
  input: { projectId: string; requestedBytes: number; nowMs: number },
): Promise<QuotaDecision> {
  const decision = await checkObjectStorageQuota(store, objectStorage, input);

  if (!decision.allowed) {
    throw new ObjectStorageQuotaError(decision);
  }

  return decision;
}
