import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ObjectStorageQuotaError,
  assertObjectStorageQuota,
  checkObjectStorageQuota,
  objectStorageQuotaBytes,
} from './object-storage-quota.js';

/*
 * AUDX-020 — the quota must be decided BEFORE the URL is signed.
 *
 * Once a signed URL is handed out it is used directly against GCS: the api is no
 * longer on the path and can refuse nothing. Minting is the only moment a quota
 * can apply.
 *
 * Every test here fails on the pre-fix code, where no quota check existed at any
 * point in `createUploadUrl` and no measurement of real GCS usage existed to
 * compare against (AUDX-023).
 */
const ENV = ['OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT', 'OBJECT_STORAGE_QUOTA_MAX_AGE_MS'];
const ORIGINAL: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV) {
    ORIGINAL[key] = process.env[key];
    delete (process.env as Record<string, string | undefined>)[key];
  }
});

afterEach(() => {
  for (const key of ENV) {
    if (ORIGINAL[key] === undefined) {
      delete (process.env as Record<string, string | undefined>)[key];
    } else {
      process.env[key] = ORIGINAL[key];
    }
  }
});

const NOW = 1_700_000_000_000;

function storeWith(usage?: { bytes: number; objectCount: number; measuredAt: Date }) {
  return { async getProjectObjectStorageUsage() {
    return usage;
  } };
}

function storageWith(totalBytes: number | 'throws') {
  const calls: string[] = [];

  return {
    calls,
    async listAllObjects(projectId: string) {
      calls.push(projectId);

      if (totalBytes === 'throws') {
        throw new Error('This project has no object storage bucket yet');
      }

      return { objects: [], totalBytes, pages: 1 };
    },
  };
}

describe('AUDX-020 storage quota before signing an upload URL', () => {
  it('is disabled by default, so nothing changes until an operator sets a ceiling', () => {
    expect(objectStorageQuotaBytes()).toBe(0);
  });

  it('refuses an upload that would push the project past its ceiling', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    const decision = await checkObjectStorageQuota(
      storeWith({ bytes: 900, objectCount: 3, measuredAt: new Date(NOW) }),
      storageWith(900),
      { projectId: 'p1', requestedBytes: 500, nowMs: NOW },
    );

    expect(decision.allowed).toBe(false);
    expect(decision.usedBytes).toBe(900);
    expect(decision.quotaBytes).toBe(1000);
  });

  it('allows an upload that fits exactly', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    const decision = await checkObjectStorageQuota(
      storeWith({ bytes: 500, objectCount: 1, measuredAt: new Date(NOW) }),
      storageWith(500),
      { projectId: 'p1', requestedBytes: 500, nowMs: NOW },
    );

    expect(decision.allowed).toBe(true);
  });

  it('re-measures live when the stored figure is STALE instead of trusting it', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';
    process.env.OBJECT_STORAGE_QUOTA_MAX_AGE_MS = '1000';

    // Stored says 100 (well under), reality is 950. The inventory runs daily, so
    // trusting a day-old number lets a project overshoot for a whole day.
    const storage = storageWith(950);
    const decision = await checkObjectStorageQuota(
      storeWith({ bytes: 100, objectCount: 1, measuredAt: new Date(NOW - 60_000) }),
      storage,
      { projectId: 'p1', requestedBytes: 100, nowMs: NOW },
    );

    expect(storage.calls).toEqual(['p1']);
    expect(decision.source).toBe('live');
    expect(decision.usedBytes).toBe(950);
    expect(decision.allowed).toBe(false);
  });

  it('re-measures live when the stored figure is already NEAR the ceiling', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    // 920/1000 is past the 90% threshold: fresh, but too close to trust.
    const storage = storageWith(980);
    const decision = await checkObjectStorageQuota(
      storeWith({ bytes: 920, objectCount: 1, measuredAt: new Date(NOW) }),
      storage,
      { projectId: 'p1', requestedBytes: 50, nowMs: NOW },
    );

    expect(storage.calls).toEqual(['p1']);
    expect(decision.usedBytes).toBe(980);
    expect(decision.allowed).toBe(false);
  });

  it('does NOT re-list the bucket when the stored figure is fresh and far from the ceiling', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    // Listing a large bucket on every upload-URL request would be O(objects).
    const storage = storageWith(100);
    const decision = await checkObjectStorageQuota(
      storeWith({ bytes: 100, objectCount: 1, measuredAt: new Date(NOW) }),
      storage,
      { projectId: 'p1', requestedBytes: 10, nowMs: NOW },
    );

    expect(storage.calls).toEqual([]);
    expect(decision.source).toBe('stored');
    expect(decision.allowed).toBe(true);
  });

  it('fails OPEN when the bucket cannot be listed, and says so in the decision', async () => {
    /*
     * Deliberate and stated: a GCS hiccup must not block every upload on the
     * platform. The ceiling is a cost guard; the security boundaries are the
     * size signed into the URL (AUDX-021) and the token scopes (AUDX-022),
     * neither of which depends on this path.
     */
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    const decision = await checkObjectStorageQuota(storeWith(undefined), storageWith('throws'), {
      projectId: 'p1',
      requestedBytes: 10,
      nowMs: NOW,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.source).toBe('none');
  });

  it('throws a typed error carrying the numbers that justified the refusal', async () => {
    process.env.OBJECT_STORAGE_QUOTA_BYTES_PER_PROJECT = '1000';

    await expect(
      assertObjectStorageQuota(storeWith({ bytes: 999, objectCount: 1, measuredAt: new Date(NOW) }), storageWith(999), {
        projectId: 'p1',
        requestedBytes: 999,
        nowMs: NOW,
      }),
    ).rejects.toBeInstanceOf(ObjectStorageQuotaError);
  });
});
