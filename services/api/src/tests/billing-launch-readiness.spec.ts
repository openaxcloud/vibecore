import { createHmac } from 'node:crypto';

import { hashPassword } from '@vibecore/auth';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Launch-readiness proof for the billing/quota gate (deliverables #1 and #2).
 *
 * These tests exercise the REAL server (buildApiApp), the REAL Stripe webhook
 * signature verification (verifyStripeSignature, HMAC-SHA256 exactly as Stripe
 * signs), and the REAL quota chokepoint (ensureQuota -> assertQuota, the same
 * path the live /projects/:id/ai/check-quota gate runs). Only the persistence
 * layer is the standard in-memory TestApiStore used across the whole suite —
 * the billing/quota LOGIC is not stubbed.
 *
 * No real payment: the upgrade is delivered as a signature-verified Stripe
 * *test-mode* webhook event (STRIPE_WEBHOOK_SECRET = a whsec_ test secret),
 * the shape Stripe delivers after a Checkout in test mode. There is no
 * Stripe-hosted checkout UI and no card charge in this proof.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

/** Sign a payload exactly like Stripe: HMAC-SHA256 over `${t}.${payload}`. */
function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const WEBHOOK_SECRET = 'whsec_launch_readiness_test';

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const owner = await store.createUser({
    email: 'owner@example.com',
    name: 'Org Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Launch Org', slug: 'launch-org', ownerUserId: owner.id });
  await store.createSession({ userId: owner.id, token: 'owner-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'App', slug: 'app' });

  return { app, store, owner, org, project, ownerToken: 'owner-token' };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Build the signature-verified Stripe test-mode subscription event that a
 *  Checkout completion produces (customer.subscription.created, status active). */
function subscriptionActiveEvent(organizationId: string, planKey: 'pro' | 'team') {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    id: `evt_${planKey}_${nowSeconds}`,
    type: 'customer.subscription.created',
    created: nowSeconds,
    data: {
      object: {
        id: `sub_${planKey}_test`,
        status: 'active',
        current_period_start: nowSeconds,
        current_period_end: nowSeconds + 30 * 24 * 60 * 60,
        // No stored price id matches in the test env, so the webhook falls back
        // to metadata.planKey — the same resolution real Checkout metadata uses.
        metadata: { organizationId, planKey },
        items: { data: [{ price: { id: `price_${planKey}_test` } }] },
      },
    },
  });
}

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.ENCRYPTION_SECRET = 'launch-readiness-encryption-secret-do-not-ship';
  process.env.OAUTH_STATE_SECRET = 'launch-readiness-state-secret-do-not-ship';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Billing launch-readiness #1 — a paid upgrade lifts the AI quota gate', () => {
  it('exhausted Free org is gated (429), a signature-verified Stripe test webhook upgrades it to Pro, generation is unblocked (200)', async () => {
    const { app, store, org, project, ownerToken } = await setup();

    try {
      // Free plan grants 50 ai.messages/period. Consume all 50.
      await store.recordUsageEvent({ organizationId: org.id, type: 'ai.messages', quantity: 50 });

      // The live pre-flight chat gate: the 51st message trips QUOTA_EXCEEDED.
      const gated = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: {},
      });
      expect(gated.statusCode).toBe(429);
      expect(gated.json().code).toBe('QUOTA_EXCEEDED');

      // Upgrade via a real, signature-verified Stripe *test-mode* webhook.
      const payload = subscriptionActiveEvent(org.id, 'pro');
      const upgraded = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: { 'stripe-signature': stripeSignature(payload, WEBHOOK_SECRET), 'content-type': 'application/json' },
        payload: Buffer.from(payload),
      });
      expect(upgraded.statusCode).toBe(200);

      // The subscription row is now ACTIVE on Pro — the entitlement that lifts the gate.
      const subscription = await store.getSubscription(org.id);
      expect(subscription?.status).toBe('ACTIVE');
      expect(subscription?.planKey).toBe('pro');

      // Same gate, now unblocked, and the reported message ceiling is the Pro limit.
      const allowed = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: {},
      });
      expect(allowed.statusCode).toBe(200);
      const body = allowed.json();
      expect(body.ok).toBe(true);
      expect(body.byok.plan).toBe('pro');
      // Pro is the top self-serve tier (Replit parity): Starter 50 -> Pro 10_000 messages.
      expect(body.ai.messages.limit).toBe(10_000);
      expect(body.ai.messages.remaining).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  it('a webhook with an INVALID Stripe signature is rejected and does NOT lift the gate (proves real verification)', async () => {
    const { app, store, org, project, ownerToken } = await setup();

    try {
      await store.recordUsageEvent({ organizationId: org.id, type: 'ai.messages', quantity: 50 });

      const payload = subscriptionActiveEvent(org.id, 'pro');
      const forged = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: {
          // Signature computed with the WRONG secret — a forged event.
          'stripe-signature': stripeSignature(payload, 'whsec_attacker_secret'),
          'content-type': 'application/json',
        },
        payload: Buffer.from(payload),
      });
      expect(forged.statusCode).not.toBe(200);

      // No subscription was written; the org is still Free and still gated.
      expect(await store.getSubscription(org.id)).toBeUndefined();

      const stillGated = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: {},
      });
      expect(stillGated.statusCode).toBe(429);
      expect(stillGated.json().code).toBe('QUOTA_EXCEEDED');
    } finally {
      await app.close();
    }
  });
});

describe('Billing launch-readiness #2 — /admin/quotas override lifts the gate', () => {
  /** A platform admin whose session passed step-up reauth, as the admin route requires. */
  async function platformAdmin(store: TestApiStore) {
    const admin = await store.createUser({
      email: 'admin@example.com',
      name: 'Platform Admin',
      passwordHash: hashPassword('password123'),
      platformAdmin: true,
    });
    await store.updateUser({ userId: admin.id, mfaEnabled: true }); // /admin/* requires MFA-enabled admins
    const session = await store.createSession({
      userId: admin.id,
      token: 'admin-token',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await store.markSessionReauthenticated(session.id); // satisfies requireRecentAdminReauth
    return { admin, adminToken: 'admin-token' };
  }

  it('admin raises the ai.messages ceiling for an exhausted Free org and generation is unblocked', async () => {
    const { app, store, org, project, ownerToken } = await setup();
    const { adminToken } = await platformAdmin(store);

    try {
      await store.recordUsageEvent({ organizationId: org.id, type: 'ai.messages', quantity: 50 });

      const gated = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: {},
      });
      expect(gated.statusCode).toBe(429);
      expect(gated.json().code).toBe('QUOTA_EXCEEDED');

      const override = await app.inject({
        method: 'POST',
        url: '/admin/quota-overrides',
        headers: auth(adminToken),
        payload: { organizationId: org.id, key: 'ai.messages', limit: 1_000_000, reason: 'launch unblock' },
      });
      expect(override.statusCode).toBe(201);

      const allowed = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: {},
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json().ai.messages.limit).toBe(1_000_000);
    } finally {
      await app.close();
    }
  });

  it('admin raises the ai.inputTokens ceiling for a token-exhausted Free org and generation is unblocked', async () => {
    const { app, store, org, project, ownerToken } = await setup();
    const { adminToken } = await platformAdmin(store);

    try {
      // Free plan grants 100_000 input tokens/period; a 200k-token prompt trips the token gate.
      const bigPrompt = { estimatedInputTokens: 200_000 };

      const gated = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: bigPrompt,
      });
      expect(gated.statusCode).toBe(429);
      expect(gated.json().code).toBe('QUOTA_EXCEEDED');

      const override = await app.inject({
        method: 'POST',
        url: '/admin/quota-overrides',
        headers: auth(adminToken),
        payload: { organizationId: org.id, key: 'ai.inputTokens', limit: 10_000_000, reason: 'launch unblock' },
      });
      expect(override.statusCode).toBe(201);

      const allowed = await app.inject({
        method: 'POST',
        url: `/projects/${project.id}/ai/check-quota`,
        headers: auth(ownerToken),
        payload: bigPrompt,
      });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json().ai.inputTokens.limit).toBe(10_000_000);
    } finally {
      await app.close();
    }
  });

  it('rejects a quota override from a non-admin caller (the gate cannot be lifted without platform admin)', async () => {
    const { app, org, ownerToken } = await setup();

    try {
      const denied = await app.inject({
        method: 'POST',
        url: '/admin/quota-overrides',
        headers: auth(ownerToken), // org owner, but NOT a platform admin
        payload: { organizationId: org.id, key: 'ai.messages', limit: 1_000_000, reason: 'nope' },
      });
      expect(denied.statusCode).toBeGreaterThanOrEqual(401);
      expect(denied.statusCode).toBeLessThan(404);
    } finally {
      await app.close();
    }
  });
});
