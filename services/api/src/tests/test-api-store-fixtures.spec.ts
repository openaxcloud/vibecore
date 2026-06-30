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

describe('TestApiStore integration feature requests', () => {
  it('createIntegrationFeatureRequest persists a row scoped to the requesting user', async () => {
    const store = new TestApiStore();

    const created = await store.createIntegrationFeatureRequest({
      userId: 'user-1',
      integrationName: 'Notion',
      useCaseDescription: 'Sync project docs into Notion.',
    });

    expect(created.id).toBeTruthy();
    expect(created.userId).toBe('user-1');
    expect(created.integrationName).toBe('Notion');
    expect(created.useCaseDescription).toBe('Sync project docs into Notion.');
    expect(created.status).toBe('pending');
    expect(created.organizationId).toBeUndefined();
    expect(created.createdAt).toBeTruthy();
  });

  it("listIntegrationFeatureRequests returns only the user's own requests when no org is given", async () => {
    const store = new TestApiStore();

    await store.createIntegrationFeatureRequest({
      userId: 'user-1',
      integrationName: 'Notion',
      useCaseDescription: 'Docs sync.',
    });
    await store.createIntegrationFeatureRequest({
      userId: 'user-2',
      integrationName: 'Stripe',
      useCaseDescription: 'Billing.',
    });

    const mine = await store.listIntegrationFeatureRequests({ userId: 'user-1' });

    expect(mine).toHaveLength(1);
    expect(mine[0].integrationName).toBe('Notion');
    expect(mine.every((request) => request.userId === 'user-1')).toBe(true);
  });

  it("listIntegrationFeatureRequests surfaces the user's own + org-scoped requests when an org is given", async () => {
    const store = new TestApiStore();

    // user-1's own request, no org.
    await store.createIntegrationFeatureRequest({
      userId: 'user-1',
      integrationName: 'Notion',
      useCaseDescription: 'Docs sync.',
    });

    // a teammate's request in the same org.
    await store.createIntegrationFeatureRequest({
      userId: 'user-2',
      organizationId: 'org-a',
      integrationName: 'Stripe',
      useCaseDescription: 'Billing.',
    });

    // an unrelated org's request must not leak.
    await store.createIntegrationFeatureRequest({
      userId: 'user-3',
      organizationId: 'org-b',
      integrationName: 'Twilio',
      useCaseDescription: 'SMS.',
    });

    const scoped = await store.listIntegrationFeatureRequests({ userId: 'user-1', organizationId: 'org-a' });

    expect(scoped.map((request) => request.integrationName).sort()).toEqual(['Notion', 'Stripe']);
    expect(scoped.some((request) => request.integrationName === 'Twilio')).toBe(false);

    // Most-recent-first ordering.
    expect(scoped[0].createdAt >= scoped[scoped.length - 1].createdAt).toBe(true);
  });
});
