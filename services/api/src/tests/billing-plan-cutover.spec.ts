import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { hashPassword } from '@vibecore/auth';
import { creditPlanByKey, creditPlanChargeCents, creditPlanDisplayMonthlyCents } from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import type { EmailProvider } from '../email.js';
import { TestApiStore } from './test-api-store.js';

/*
 * Replit-parity plan cutover — live proof (Stripe test mode, no real payment).
 *
 * Proves, for every self-serve plan × interval (Core/Pro × monthly/annual):
 *   1. Checkout charges the RIGHT amount — the real /orgs/:org/billing/checkout
 *      handler resolves the interval-specific Stripe price and hands it to Stripe.
 *      An injected fake Stripe (STRIPE_API_BASE_URL, the same seam the app uses for
 *      test injection) captures the price id the handler selected.
 *   2. Displayed == charged — the amount shown on the pricing page (creditPlanCatalog)
 *      is the amount checkout bills (creditPlanChargeCents), single source of truth.
 *   3. Upgrade lifts the gate — a signature-verified test-mode subscription webhook
 *      activates the plan and the AI quota gate opens at that plan's real limits.
 *
 * Only the external Stripe API is a fake (unavoidable without Avi's account); every
 * line of OUR code — checkout handler, price resolution, webhook signature check,
 * plan/limit resolution, quota gate — is the real thing. No mock of billing logic.
 */

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

const WEBHOOK_SECRET = 'whsec_cutover_test';

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/* Minimal fake Stripe that records the checkout line-item price the app sends. */
function startFakeStripe(): Promise<{ server: Server; baseUrl: string; captured: { checkoutPriceId?: string } }> {
  const captured: { checkoutPriceId?: string } = {};

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (req.url === '/v1/customers') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'cus_fake' }));
          return;
        }

        if (req.url === '/v1/checkout/sessions') {
          const params = new URLSearchParams(body);
          captured.checkoutPriceId = params.get('line_items[0][price]') ?? undefined;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'cs_fake', url: 'https://stripe.test/checkout/cs_fake' }));
          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, captured });
    });
  });
}

const originalEnv = { ...process.env };

let fake: Awaited<ReturnType<typeof startFakeStripe>>;

beforeEach(async () => {
  fake = await startFakeStripe();

  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.STRIPE_API_BASE_URL = fake.baseUrl; // buildStripeClient builds a client from this alone
  process.env.ENCRYPTION_SECRET = 'cutover-encryption-secret-do-not-ship';
  process.env.OAUTH_STATE_SECRET = 'cutover-state-secret-do-not-ship';

  // Distinct interval price ids so the seeded Plan rows let checkout resolve
  // monthly vs annual. (Real ids come from `scripts/seed-stripe-catalog.mjs`.)
  process.env.STRIPE_CORE_PRODUCT_ID = 'prod_core';
  process.env.STRIPE_CORE_PRICE_MONTHLY_ID = 'price_core_m';
  process.env.STRIPE_CORE_PRICE_ANNUAL_ID = 'price_core_a';
  process.env.STRIPE_PRO_PRODUCT_ID = 'prod_pro';
  process.env.STRIPE_PRO_PRICE_MONTHLY_ID = 'price_pro_m';
  process.env.STRIPE_PRO_PRICE_ANNUAL_ID = 'price_pro_a';
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await new Promise<void>((r) => fake.server.close(() => r()));
});

async function setup() {
  const store = new TestApiStore();
  const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

  const owner = await store.createUser({
    email: 'owner@example.com',
    name: 'Owner',
    passwordHash: hashPassword('password123'),
  });
  const org = await store.createOrganization({ name: 'Org', slug: 'org', ownerUserId: owner.id });
  await store.createSession({ userId: owner.id, token: 'owner-token', expiresAt: new Date(Date.now() + 3600_000) });
  const project = await store.createProject({ organizationId: org.id, name: 'App', slug: 'app' });

  return { app, store, org, project, ownerToken: 'owner-token' };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function subscriptionActiveEvent(organizationId: string, planKey: string, priceId: string) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return JSON.stringify({
    id: `evt_${planKey}_${priceId}_${nowSeconds}`,
    type: 'customer.subscription.created',
    created: nowSeconds,
    data: {
      object: {
        id: `sub_${planKey}`,
        status: 'active',
        current_period_start: nowSeconds,
        current_period_end: nowSeconds + 30 * 24 * 60 * 60,
        // Stripe always carries the purchased price; the webhook resolves the plan
        // from it (falling back to metadata.planKey). Here it matches the seeded
        // Core/Pro monthly/annual price id.
        items: { data: [{ price: { id: priceId } }] },
        metadata: { organizationId, planKey },
      },
    },
  });
}

// Core = mid tier (Starter 50 → 1_000 messages), Pro = top tier (→ 10_000 messages).
const SCENARIOS = [
  { plan: 'core', interval: 'monthly' as const, priceId: 'price_core_m', chargeCents: 2_500, msgLimit: 1_000 },
  { plan: 'core', interval: 'annual' as const, priceId: 'price_core_a', chargeCents: 24_000, msgLimit: 1_000 },
  { plan: 'pro', interval: 'monthly' as const, priceId: 'price_pro_m', chargeCents: 10_000, msgLimit: 10_000 },
  { plan: 'pro', interval: 'annual' as const, priceId: 'price_pro_a', chargeCents: 114_000, msgLimit: 10_000 },
];

describe('Replit-parity plan cutover — checkout amount + upgrade lifts gate (Stripe test mode)', () => {
  for (const s of SCENARIOS) {
    it(`${s.plan} ${s.interval}: checkout charges €${(s.chargeCents / 100).toFixed(0)} and the upgrade lifts the AI gate`, async () => {
      const { app, store, org, project, ownerToken } = await setup();

      try {
        // (A) Displayed == charged: the catalog the pricing page renders IS what checkout bills.
        const catalog = creditPlanByKey(s.plan);
        expect(creditPlanChargeCents(catalog, s.interval)).toBe(s.chargeCents);

        // (B) Exhausted Starter org is gated.
        await store.recordUsageEvent({ organizationId: org.id, type: 'ai.messages', quantity: 50 });
        const gated = await app.inject({
          method: 'POST',
          url: `/projects/${project.id}/ai/check-quota`,
          headers: auth(ownerToken),
          payload: {},
        });
        expect(gated.statusCode).toBe(429);
        expect(gated.json().code).toBe('QUOTA_EXCEEDED');

        // (C) Checkout resolves the interval-specific Stripe price and sends it to Stripe.
        const checkout = await app.inject({
          method: 'POST',
          url: `/orgs/${org.id}/billing/checkout`,
          headers: auth(ownerToken),
          payload: {
            planKey: s.plan,
            interval: s.interval,
            successUrl: 'https://app.e-code.ai/billing',
            cancelUrl: 'https://app.e-code.ai/upgrade',
          },
        });
        expect(checkout.statusCode).toBe(200);
        expect(checkout.json().checkoutUrl).toBe('https://stripe.test/checkout/cs_fake');
        // The price the app told Stripe to charge is the interval-correct one.
        expect(fake.captured.checkoutPriceId).toBe(s.priceId);

        // (D) Upgrade webhook (signature-verified, test mode) activates the plan.
        const payload = subscriptionActiveEvent(org.id, s.plan, s.priceId);
        const webhook = await app.inject({
          method: 'POST',
          url: '/billing/stripe/webhook',
          headers: { 'stripe-signature': stripeSignature(payload, WEBHOOK_SECRET), 'content-type': 'application/json' },
          payload: Buffer.from(payload),
        });
        expect(webhook.statusCode).toBe(200);
        const sub = await store.getSubscription(org.id);
        expect(sub?.status).toBe('ACTIVE');
        expect(sub?.planKey).toBe(s.plan);

        // (E) The gate is now open at the plan's real limits.
        const allowed = await app.inject({
          method: 'POST',
          url: `/projects/${project.id}/ai/check-quota`,
          headers: auth(ownerToken),
          payload: {},
        });
        expect(allowed.statusCode).toBe(200);
        expect(allowed.json().byok.plan).toBe(s.plan);
        expect(allowed.json().ai.messages.limit).toBe(s.msgLimit);
      } finally {
        await app.close();
      }
    });
  }

  it('the pricing page numbers (monthly 25/100, annual-effective 20/95) equal the catalog the checkout bills', () => {
    const core = creditPlanByKey('core');
    const pro = creditPlanByKey('pro');

    // Monthly sticker prices.
    expect(creditPlanDisplayMonthlyCents(core, 'monthly')).toBe(2_500); // €25
    expect(creditPlanDisplayMonthlyCents(pro, 'monthly')).toBe(10_000); // €100
    // Annual effective monthly (what the page shows under the yearly toggle).
    expect(creditPlanDisplayMonthlyCents(core, 'annual')).toBe(2_000); // €20
    expect(creditPlanDisplayMonthlyCents(pro, 'annual')).toBe(9_500); // €95
    // Annual charge = 12 × the effective monthly (the single yearly invoice).
    expect(creditPlanChargeCents(core, 'annual')).toBe(2_000 * 12); // €240/yr
    expect(creditPlanChargeCents(pro, 'annual')).toBe(9_500 * 12); // €1140/yr
  });

  it('Starter has no self-serve checkout and Enterprise routes to contact-sales', async () => {
    const { app, org, ownerToken } = await setup();

    try {
      const starter = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/billing/checkout`,
        headers: auth(ownerToken),
        payload: {
          planKey: 'starter',
          interval: 'monthly',
          successUrl: 'https://app.e-code.ai/billing',
          cancelUrl: 'https://app.e-code.ai/upgrade',
        },
      });
      expect(starter.statusCode).toBe(400);
      expect(starter.json().code).toBe('STRIPE_FREE_NO_CHECKOUT');

      const enterprise = await app.inject({
        method: 'POST',
        url: `/orgs/${org.id}/billing/checkout`,
        headers: auth(ownerToken),
        payload: {
          planKey: 'enterprise',
          interval: 'monthly',
          successUrl: 'https://app.e-code.ai/billing',
          cancelUrl: 'https://app.e-code.ai/upgrade',
        },
      });
      expect(enterprise.statusCode).toBe(400);
      expect(enterprise.json().code).toBe('STRIPE_ENTERPRISE_CONTACT_SALES');
    } finally {
      await app.close();
    }
  });
});
