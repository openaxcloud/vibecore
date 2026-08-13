import { createHmac } from 'node:crypto';

import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

class TestEmailProvider implements EmailProvider {
  async send() {}
}

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new TestEmailProvider() });

  const user = await store.createUser({
    email: 'packs@example.com',
    name: 'Pack User',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Pack Org', slug: 'pack-org', ownerUserId: user.id });
  await store.createSession({ userId: user.id, token: 'pack-token', expiresAt: new Date(Date.now() + 3600_000) });

  return { app, store, org, token: 'pack-token' };
}

describe('Credit-pack purchase (Replit parity)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OAUTH_STATE_SECRET = 'packs-state-secret-do-not-ship';
    process.env.ENCRYPTION_SECRET = 'packs-encryption-secret-do-not-ship';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('POST /orgs/:orgId/credits/packs/checkout', () => {
    it('503s while the credit model is dormant (BILLING_CREDITS_ENABLED unset)', async () => {
      delete (process.env as Record<string, string | undefined>).BILLING_CREDITS_ENABLED;
      const { app, org, token } = await setup();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/credits/packs/checkout`,
          headers: { authorization: `Bearer ${token}` },
          payload: { packId: 'pack-300', successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/no' },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().code).toBe('CREDIT_PACKS_DISABLED');
      } finally {
        await app.close();
      }
    });

    it('400s for an unknown pack when enabled', async () => {
      process.env.BILLING_CREDITS_ENABLED = 'true';
      const { app, org, token } = await setup();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/credits/packs/checkout`,
          headers: { authorization: `Bearer ${token}` },
          payload: { packId: 'pack-999', successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/no' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('CREDIT_PACK_UNKNOWN');
      } finally {
        await app.close();
      }
    });

    it('503s when the pack Stripe price id is not configured', async () => {
      process.env.BILLING_CREDITS_ENABLED = 'true';
      delete (process.env as Record<string, string | undefined>).STRIPE_CREDIT_PACK_300_PRICE_ID;
      const { app, org, token } = await setup();
      try {
        const res = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/credits/packs/checkout`,
          headers: { authorization: `Bearer ${token}` },
          payload: { packId: 'pack-300', successUrl: 'https://app.example/ok', cancelUrl: 'https://app.example/no' },
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().code).toBe('CREDIT_PACK_PRICE_NOT_CONFIGURED');
      } finally {
        await app.close();
      }
    });
  });

  describe('checkout.session.completed (mode=payment) webhook', () => {
    it('grants the pack credit value with a 6-month expiry and skips the subscription path', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_pack_grant';
      const { app, store, org } = await setup();

      const payload = JSON.stringify({
        id: 'evt_pack_grant',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_pack',
            mode: 'payment',
            customer: 'cus_pack',
            payment_status: 'paid',
            payment_intent: 'pi_pack',
            metadata: { organizationId: org.id, creditPackSku: 'pack-300' },
          },
        },
      });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/billing/stripe/webhook',
          headers: {
            'stripe-signature': stripeSignature(payload, 'whsec_pack_grant'),
            'content-type': 'application/json',
          },
          payload: Buffer.from(payload),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().creditPack).toBe(true);

        const packs = await store.listCreditPacks(org.id);
        expect(packs).toHaveLength(1);
        // $290 pack grants $300 of spendable credit (the $10 gap is the discount).
        expect(packs[0].remainingCents).toBe(30_000);
        const days = (new Date(packs[0].expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
        expect(days).toBeGreaterThan(170);
        expect(days).toBeLessThan(190);

        // a payment-mode session must NOT have created a subscription row
        expect(await store.getSubscription(org.id)).toBeUndefined();
      } finally {
        await app.close();
      }
    });

    it('does not grant a pack when the session is unpaid', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_pack_unpaid';
      const { app, store, org } = await setup();

      const payload = JSON.stringify({
        id: 'evt_pack_unpaid',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_pack_unpaid',
            mode: 'payment',
            customer: 'cus_pack_unpaid',
            payment_status: 'unpaid',
            metadata: { organizationId: org.id, creditPackSku: 'pack-300' },
          },
        },
      });

      try {
        const res = await app.inject({
          method: 'POST',
          url: '/billing/stripe/webhook',
          headers: {
            'stripe-signature': stripeSignature(payload, 'whsec_pack_unpaid'),
            'content-type': 'application/json',
          },
          payload: Buffer.from(payload),
        });
        expect(res.statusCode).toBe(200);
        expect(await store.listCreditPacks(org.id)).toHaveLength(0);
      } finally {
        await app.close();
      }
    });
  });

  describe('concurrent published-app cap (20) on publish', () => {
    async function seedPublishedApps(store: TestApiStore, organizationId: string, count: number) {
      for (let index = 0; index < count; index += 1) {
        const project = await store.createProject({
          organizationId,
          name: `App ${index}`,
          slug: `app-${index}`,
        });
        await store.createDeployment({
          projectId: project.id,
          provider: 'static',
          environment: 'production',
          status: 'READY',
          url: `https://app-${index}.example/`,
        });
      }
    }

    it('blocks publishing the 21st app when the credit model is live', async () => {
      process.env.BILLING_CREDITS_ENABLED = 'true';
      const { app, store, org, token } = await setup();
      try {
        await seedPublishedApps(store, org.id, 20);

        const project = await store.createProject({ organizationId: org.id, name: 'App 21', slug: 'app-21' });
        const source = await store.createDeployment({
          projectId: project.id,
          provider: 'static',
          environment: 'preview',
          status: 'READY',
          url: 'https://preview-21.example/',
        });

        const res = await app.inject({
          method: 'POST',
          url: `/projects/${project.id}/deployments/${source.id}/publish`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(429);
        expect(res.json().code).toBe('APP_LIMIT_EXCEEDED');
      } finally {
        await app.close();
      }
    });

    it('still allows re-publishing an already-published app at the cap', async () => {
      process.env.BILLING_CREDITS_ENABLED = 'true';
      const { app, store, org, token } = await setup();
      try {
        // 19 other apps + this one already published = 20 at the cap.
        await seedPublishedApps(store, org.id, 19);
        const project = await store.createProject({ organizationId: org.id, name: 'App 20', slug: 'app-20' });
        await store.createDeployment({
          projectId: project.id,
          provider: 'static',
          environment: 'production',
          status: 'READY',
          url: 'https://app-20.example/',
        });
        const source = await store.createDeployment({
          projectId: project.id,
          provider: 'static',
          environment: 'preview',
          status: 'READY',
          url: 'https://preview-20.example/',
        });

        const res = await app.inject({
          method: 'POST',
          url: `/projects/${project.id}/deployments/${source.id}/publish`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(201);
      } finally {
        await app.close();
      }
    });

    it('does not enforce the cap while the credit model is dormant', async () => {
      delete (process.env as Record<string, string | undefined>).BILLING_CREDITS_ENABLED;
      const { app, store, org, token } = await setup();
      try {
        await seedPublishedApps(store, org.id, 25);

        const project = await store.createProject({ organizationId: org.id, name: 'App 26', slug: 'app-26' });
        const source = await store.createDeployment({
          projectId: project.id,
          provider: 'static',
          environment: 'preview',
          status: 'READY',
          url: 'https://preview-26.example/',
        });

        const res = await app.inject({
          method: 'POST',
          url: `/projects/${project.id}/deployments/${source.id}/publish`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(201);
      } finally {
        await app.close();
      }
    });
  });
});
