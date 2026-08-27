import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_SECRET = 'account-purge-test-internal-secret';
const ENV_KEYS = ['INTERNAL_API_SHARED_SECRET', 'ACCOUNT_PURGE_ENABLED', 'ACCOUNT_PURGE_USER_ALLOWLIST'] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof ENV_KEYS)[number],
  string | undefined
>;

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function setup(
  accountPurgeBillingCanceler = vi.fn(async () => ({ canceled: true, providerStatus: 'canceled' })),
) {
  process.env.INTERNAL_API_SHARED_SECRET = INTERNAL_SECRET;
  delete process.env.ACCOUNT_PURGE_ENABLED;
  delete process.env.ACCOUNT_PURGE_USER_ALLOWLIST;

  const store = new TestApiStore();
  const created = await store.createUser({
    email: `purge-${Date.now()}@example.test`,
    passwordHash: 'test-password-hash',
  });
  const user = store.users.get(created.id)!;
  const requestedAt = new Date(Date.now() - 15 * DAY_MS).toISOString();
  user.preferences = { accountDeletion: { requestedAt } };
  await store.mutateSystemSettingIds('account.pendingDeletionUserIds', { add: user.id });

  const accountStoragePurger = vi.fn(async (_inventory, _userId, lease) => {
    await lease.executeEffect(
      { key: 'test-provider-effect', resourceType: 'gcs_bucket', resourceId: 'none' },
      async () => ({ verifiedAbsent: true }),
    );
    return { classes: [], verified: true };
  });
  const accountPurgeWorkspaceReconciler = vi.fn(async () => ({
    scanned: 0,
    reconciled: 0,
    workspaceIds: [] as string[],
  }));
  const app = await buildApiApp({
    store,
    accountStoragePurger,
    accountPurgeBillingCanceler,
    accountPurgeWorkspaceReconciler,
  });
  const headers = { authorization: `Bearer ${INTERNAL_SECRET}` };

  return {
    app,
    store,
    user,
    headers,
    accountStoragePurger,
    accountPurgeBillingCanceler,
    accountPurgeWorkspaceReconciler,
  };
}

describe('internal account purge safety gates', () => {
  it('defaults to a read-only dry-run and invokes no reconciler or physical purger', async () => {
    const runtime = await setup();
    try {
      const response = await runtime.app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: runtime.headers,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ mode: 'dry-run', scanned: 1, purged: 0, failed: 0 });
      expect(response.json().results[0]).toMatchObject({ userId: runtime.user.id, status: 'ready_to_purge' });
      expect(runtime.accountStoragePurger).not.toHaveBeenCalled();
      expect(runtime.accountPurgeWorkspaceReconciler).not.toHaveBeenCalled();
      expect(await runtime.store.hasPurgeReceipt(runtime.user.id)).toBe(false);
    } finally {
      await runtime.app.close();
    }
  });

  it('rejects execution unless flag, exact confirmation and exact allowlist all agree', async () => {
    const runtime = await setup();
    try {
      process.env.ACCOUNT_PURGE_ENABLED = 'true';
      process.env.ACCOUNT_PURGE_USER_ALLOWLIST = '*';
      const wildcard = await runtime.app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: runtime.headers,
        payload: { mode: 'execute', confirm: 'PURGE_ACCOUNT_DATA', userId: runtime.user.id },
      });
      expect(wildcard.statusCode).toBe(409);
      expect(wildcard.json()).toMatchObject({ code: 'ACCOUNT_PURGE_EXECUTION_NOT_AUTHORIZED' });

      process.env.ACCOUNT_PURGE_USER_ALLOWLIST = 'different-user';
      const exactMismatch = await runtime.app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: runtime.headers,
        payload: { mode: 'execute', confirm: 'PURGE_ACCOUNT_DATA', userId: runtime.user.id },
      });
      expect(exactMismatch.statusCode).toBe(200);
      expect(exactMismatch.json()).toMatchObject({ purged: 0, refused: 1 });
      expect(runtime.accountStoragePurger).not.toHaveBeenCalled();
    } finally {
      await runtime.app.close();
    }
  });

  it('executes only the exact allowlisted subject and persists an idempotent receipt', async () => {
    const runtime = await setup();
    try {
      process.env.ACCOUNT_PURGE_ENABLED = 'true';
      process.env.ACCOUNT_PURGE_USER_ALLOWLIST = runtime.user.id;
      const response = await runtime.app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: runtime.headers,
        payload: { mode: 'execute', confirm: 'PURGE_ACCOUNT_DATA', userId: runtime.user.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ mode: 'execute', scanned: 1, purged: 1, failed: 0, refused: 0 });
      expect(runtime.accountPurgeWorkspaceReconciler).toHaveBeenCalledOnce();
      expect(runtime.accountStoragePurger).toHaveBeenCalledOnce();
      expect(await runtime.store.hasPurgeReceipt(runtime.user.id)).toBe(true);
      expect(runtime.store.purgeEffects.get(`purge-${runtime.user.id}:test-provider-effect`)).toEqual({
        verifiedAbsent: true,
      });
    } finally {
      await runtime.app.close();
    }
  });

  it('cancels a sole-owner external subscription before stamping the purge complete', async () => {
    const runtime = await setup();
    try {
      const organization = await runtime.store.createOrganization({
        name: 'Purge billing org',
        slug: `purge-billing-${Date.now()}`,
        ownerUserId: runtime.user.id,
      });
      const subscription = await runtime.store.upsertSubscription({
        organizationId: organization.id,
        planKey: 'pro',
        externalId: 'sub_account_purge_test',
        status: 'ACTIVE',
      });
      process.env.ACCOUNT_PURGE_ENABLED = 'true';
      process.env.ACCOUNT_PURGE_USER_ALLOWLIST = runtime.user.id;

      const response = await runtime.app.inject({
        method: 'POST',
        url: '/internal/account-purge',
        headers: runtime.headers,
        payload: { mode: 'execute', confirm: 'PURGE_ACCOUNT_DATA', userId: runtime.user.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ purged: 1, failed: 0 });
      expect(runtime.accountPurgeBillingCanceler).toHaveBeenCalledOnce();
      expect(runtime.accountPurgeBillingCanceler).toHaveBeenCalledWith(
        'sub_account_purge_test',
        expect.stringMatching(/^account-purge-purge-.+-/),
      );
      expect(runtime.store.subscriptions.get(subscription.id)).toMatchObject({
        status: 'CANCELED',
        cancelAtPeriodEnd: true,
      });
      expect(
        runtime.store.purgeEffects.get(`purge-${runtime.user.id}:billing-subscription:${subscription.id}`),
      ).toEqual({
        canceled: true,
        providerStatus: 'canceled',
      });
    } finally {
      await runtime.app.close();
    }
  });
});
