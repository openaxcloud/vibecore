import { describe, expect, it } from 'vitest';

import { TestApiStore } from './test-api-store.js';

describe('TestApiStore.markUserConnectionStatus', () => {
  it('scrubs encrypted tokens when clearTokens is passed (mirrors prisma-store)', async () => {
    const store = new TestApiStore();

    const created = await store.upsertUserConnection({
      userId: 'user-1',
      provider: 'github',
      externalAccountId: 'acct-1',
      externalAccountLabel: 'octocat',
      accessTokenEncrypted: 'enc-access',
      refreshTokenEncrypted: 'enc-refresh',
      apiKeyFieldsEncrypted: { token: 'enc-pat' },
      scopes: ['repo'],
      createdByUserId: 'user-1',
    });

    const updated = await store.markUserConnectionStatus({
      id: created.id,
      status: 'revoked',
      revokedAt: new Date(),
      clearTokens: true,
    });

    expect(updated).toBeDefined();
    expect(updated?.status).toBe('revoked');
    expect(updated?.revokedAt).toBeDefined();
    expect(updated?.accessTokenEncrypted).toBeUndefined();
    expect(updated?.refreshTokenEncrypted).toBeUndefined();
    expect(updated?.apiKeyFieldsEncrypted).toBeUndefined();

    // Persisted record must also be scrubbed, not just the returned copy.
    const reloaded = await store.getUserConnectionById(created.id);
    expect(reloaded?.accessTokenEncrypted).toBeUndefined();
    expect(reloaded?.refreshTokenEncrypted).toBeUndefined();
  });

  it('retains encrypted tokens when clearTokens is not set', async () => {
    const store = new TestApiStore();

    const created = await store.upsertUserConnection({
      userId: 'user-2',
      provider: 'gitlab',
      externalAccountId: 'acct-2',
      externalAccountLabel: 'tanuki',
      accessTokenEncrypted: 'enc-access',
      refreshTokenEncrypted: 'enc-refresh',
      scopes: ['api'],
      createdByUserId: 'user-2',
    });

    const updated = await store.markUserConnectionStatus({
      id: created.id,
      status: 'needs_reconnect',
    });

    expect(updated?.status).toBe('needs_reconnect');
    expect(updated?.accessTokenEncrypted).toBe('enc-access');
    expect(updated?.refreshTokenEncrypted).toBe('enc-refresh');
  });
});

describe('TestApiStore.listAbuseEvents', () => {
  it('filters by organizationId and orders most-recent-first', async () => {
    const store = new TestApiStore();

    const orgA1 = await store.createAbuseEvent({ organizationId: 'org-a', type: 'rate_limit', severity: 'low' });
    const orgA2 = await store.createAbuseEvent({ organizationId: 'org-a', type: 'spam', severity: 'high' });
    await store.createAbuseEvent({ organizationId: 'org-b', type: 'rate_limit', severity: 'low' });

    const scoped = await store.listAbuseEvents({ organizationId: 'org-a' });

    expect(scoped.map((e) => e.id).sort()).toEqual([orgA1.id, orgA2.id].sort());
    expect(scoped.every((e) => e.organizationId === 'org-a')).toBe(true);

    // Most-recent-first ordering.
    expect(scoped[0].createdAt >= scoped[scoped.length - 1].createdAt).toBe(true);
  });

  it('filters by type and honours take', async () => {
    const store = new TestApiStore();

    await store.createAbuseEvent({ organizationId: 'org-a', type: 'rate_limit', severity: 'low' });
    await store.createAbuseEvent({ organizationId: 'org-a', type: 'spam', severity: 'high' });
    await store.createAbuseEvent({ organizationId: 'org-a', type: 'spam', severity: 'high' });

    const byType = await store.listAbuseEvents({ organizationId: 'org-a', type: 'spam' });
    expect(byType).toHaveLength(2);
    expect(byType.every((e) => e.type === 'spam')).toBe(true);

    const capped = await store.listAbuseEvents({ organizationId: 'org-a', take: 1 });
    expect(capped).toHaveLength(1);
  });

  it('returns all events when no filter is given', async () => {
    const store = new TestApiStore();

    await store.createAbuseEvent({ organizationId: 'org-a', type: 'rate_limit', severity: 'low' });
    await store.createAbuseEvent({ organizationId: 'org-b', type: 'spam', severity: 'high' });

    const all = await store.listAbuseEvents();
    expect(all).toHaveLength(2);
  });
});
