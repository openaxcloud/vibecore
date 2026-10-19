import { createHmac } from 'node:crypto';
import { assertQuota } from '@vibecore/billing';
import { afterEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- The API service does not use the web ~/ alias.
import { buildApiApp } from '../app.js';
import { TestApiStore } from './test-api-store.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('monthly quota through the real webhook and usage routes (in-memory store)', () => {
  it.each(['annual', 'monthly', 'monthly-webhook-late'] as const)('%s subscription', async (interval) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T10:30:00.000Z'));

    const secret = 'local-monthly-allowance-test-only';
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    vi.stubEnv('STRIPE_PRO_PRICE_ID', 'price_local_pro_monthly');
    vi.stubEnv('STRIPE_PRO_PRICE_ANNUAL_ID', 'price_local_pro_annual');
    vi.stubEnv('BILLING_CREDITS_ENABLED', 'false');

    const store = new TestApiStore();

    const app = await buildApiApp({
      store,
      emailProvider: {
        async send() {
          return undefined;
        },
      },
    });

    try {
      const user = await store.createUser({ email: 'quota-period@example.com', passwordHash: 'unused' });
      const org = await store.createOrganization({ name: 'Quota period', slug: 'quota-period', ownerUserId: user.id });

      const project = await store.createProject({
        organizationId: org.id,
        name: 'Quota project',
        slug: 'quota-project',
      });
      await store.createSession({ userId: user.id, token: 'local-quota-period', expiresAt: new Date('2027-02-01') });

      const headers = { authorization: 'Bearer local-quota-period' };

      async function webhook(start: string, end: string) {
        const timestamp = Math.floor(Date.now() / 1000);

        const payload = JSON.stringify({
          id: `evt_period_${timestamp}`,
          created: timestamp,
          type: 'customer.subscription.updated',
          data: {
            object: {
              id: 'sub_local_period',
              status: 'active',
              items: {
                data: [{ price: { id: interval === 'annual' ? 'price_local_pro_annual' : 'price_local_pro_monthly' } }],
              },
              current_period_start: Date.parse(start) / 1000,
              current_period_end: Date.parse(end) / 1000,
              metadata: { organizationId: org.id, planKey: 'pro' },
            },
          },
        });

        const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

        const response = await app.inject({
          method: 'POST',
          url: '/billing/stripe/webhook',
          headers: { 'stripe-signature': `t=${timestamp},v1=${signature}`, 'content-type': 'application/json' },
          payload: Buffer.from(payload),
        });
        expect(response.statusCode).toBe(200);
      }

      async function usage() {
        await store.createSession({
          userId: user.id,
          token: 'local-quota-period',
          expiresAt: new Date(Date.now() + 3600_000),
        });

        const response = await app.inject({ method: 'GET', url: `/orgs/${org.id}/usage`, headers });
        expect(response.statusCode).toBe(200);
        expect(response.json().subscription).toMatchObject({ status: 'ACTIVE', planKey: 'pro' });

        return response.json();
      }

      async function checkQuota() {
        return app.inject({ method: 'POST', url: `/projects/${project.id}/ai/check-quota`, headers, payload: {} });
      }

      await webhook(
        '2026-01-15T10:30:00.000Z',
        interval === 'annual' ? '2027-01-15T10:30:00.000Z' : '2026-02-15T10:30:00.000Z',
      );
      vi.setSystemTime(new Date('2026-01-20'));

      const meteredKeys = ['ai.messages', 'ai.inputTokens', 'ai.outputTokens', 'ai.toolCalls', 'previews.public'];

      for (const type of meteredKeys) {
        await store.recordUsageEvent({ organizationId: org.id, type, quantity: 1000 });
      }

      for (let index = 0; index < 50; index += 1) {
        await store.createDeployment({ projectId: project.id, provider: 'local-fixture', status: 'READY' });
      }

      await store.createSnapshot({ projectId: project.id, label: 'January snapshot', manifest: {} });

      const checkpoint = await store.createAgentCheckpoint({
        organizationId: org.id,
        userId: user.id,
        buildTier: 'power',
      });
      await store.completeAgentCheckpoint({ id: checkpoint.id, status: 'COMPLETED', creditCents: 150 });
      await store.recordPaygCharge({ organizationId: org.id, checkpointId: checkpoint.id, cents: 150 });
      vi.setSystemTime(new Date('2026-02-15T10:29:59.999Z'));

      const before = await usage();
      expect(before.quotaUsage['ai.messages']).toBe(1000);
      expect(before.quotaUsage['deployments.count']).toBe(50);

      const blockedBefore = await checkQuota();
      expect(blockedBefore.statusCode).toBe(429);
      expect(blockedBefore.json().code).toBe('QUOTA_EXCEEDED');
      expect(() =>
        assertQuota({
          key: 'ai.messages',
          used: before.quotaUsage['ai.messages'],
          increment: 1,
          limit: before.quotas['ai.messages'],
        }),
      ).toThrow();
      expect(() =>
        assertQuota({
          key: 'deployments.count',
          used: before.quotaUsage['deployments.count'],
          increment: 1,
          limit: before.quotas['deployments.count'],
        }),
      ).toThrow();

      vi.setSystemTime(new Date('2026-02-15T10:30:00.000Z'));

      if (interval === 'monthly') {
        await webhook('2026-02-15T10:30:00.000Z', '2026-03-15T10:30:00.000Z');
      }

      const after = await usage();
      const renews = interval !== 'monthly-webhook-late';

      for (const key of meteredKeys) {
        expect(after.quotaUsage[key], key).toBe(renews ? 0 : 1000);
      }

      expect(after.quotaUsage['deployments.count']).toBe(renews ? 0 : 50);
      expect(after.quotaUsage['snapshots.count']).toBe(renews ? 0 : 1);
      expect(after.quotaUsage['projects.count']).toBe(1);

      const checkedAfter = await checkQuota();
      expect(checkedAfter.statusCode).toBe(renews ? 200 : 429);

      const credits = await app.inject({ method: 'GET', url: `/orgs/${org.id}/credits`, headers });
      expect(credits.statusCode).toBe(200);
      expect(credits.json()).toMatchObject({
        periodStart: interval === 'monthly' ? '2026-02-15T10:30:00.000Z' : '2026-01-15T10:30:00.000Z',
        periodEnd:
          interval === 'annual'
            ? '2027-01-15T10:30:00.000Z'
            : interval === 'monthly'
              ? '2026-03-15T10:30:00.000Z'
              : '2026-02-15T10:30:00.000Z',
        paygSpentCents: interval === 'monthly' ? 0 : 150,
      });

      if (interval === 'annual') {
        // Financial limits retain the annual billing window, independently of the monthly message allowance.
        await store.setUserSpendLimit({ organizationId: org.id, userId: user.id, limitCents: 100 });
        vi.stubEnv('BILLING_CREDITS_ENABLED', 'true');

        const financiallyBlocked = await checkQuota();
        expect(financiallyBlocked.statusCode).toBe(429);
        expect(financiallyBlocked.json().code).toBe('USER_SPEND_LIMIT_REACHED');
        vi.stubEnv('BILLING_CREDITS_ENABLED', 'false');
      }

      const checkMessage = () =>
        assertQuota({
          key: 'ai.messages',
          used: after.quotaUsage['ai.messages'],
          increment: 1,
          limit: after.quotas['ai.messages'],
        });
      const checkDeployment = () =>
        assertQuota({
          key: 'deployments.count',
          used: after.quotaUsage['deployments.count'],
          increment: 1,
          limit: after.quotas['deployments.count'],
        });

      if (renews) {
        expect(checkMessage).not.toThrow();
        expect(checkDeployment).not.toThrow();

        // The inclusive February boundary still consumes the full monthly allowance.
        await store.recordUsageEvent({ organizationId: org.id, type: 'ai.messages', quantity: 1000 });

        const exhausted = await usage();
        expect(exhausted.quotaUsage['ai.messages']).toBe(1000);

        const blockedAgain = await checkQuota();
        expect(blockedAgain.statusCode).toBe(429);
        expect(blockedAgain.json().code).toBe('QUOTA_EXCEEDED');
        expect(() =>
          assertQuota({
            key: 'ai.messages',
            used: exhausted.quotaUsage['ai.messages'],
            increment: 1,
            limit: exhausted.quotas['ai.messages'],
          }),
        ).toThrow();
      } else {
        expect(checkMessage).toThrow();
        expect(checkDeployment).toThrow();
      }
    } finally {
      await app.close();
    }
  });
});
