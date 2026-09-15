import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { hashPassword } from '@vibecore/auth';
import {
  StripeBillingClient,
  autoscaleUsageCents,
  egressCents,
  evaluateCreditGate,
  reservedVmCents,
} from '@vibecore/billing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from '../app.js';
import { applyPlanGrant, debitCredits, reportUsagePaygUsage } from '../credits-service.js';
import type { EmailProvider } from '../email.js';
import { meterDeployment } from '../metering-service.js';
import { nextSpendAlertPct, spendAlertEmailContent } from '../spend-alerts.js';
import { TestApiStore } from './test-api-store.js';

class QuietEmailProvider implements EmailProvider {
  async send() {}
}

function stripeSignature(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/*
 * Replit-parity usage billing (Effort-Based / pay-as-you-go + hosting) — full
 * cycle proof, Stripe TEST MODE, no real payment.
 *
 * Exercises the REAL shadow infra end to end: plan grant → consumption (deployment
 * metering for all four kinds + a credit debit) → exhaustion → automatic PAYG
 * overage → Stripe metered usage record (idempotent) → budget cap blocks → spend
 * alerts at 50/80/100%. The only fake is the external Stripe API (STRIPE_API_BASE_URL),
 * which captures the usage_records call. No billing logic is mocked.
 *
 * Deployment/credit amounts asserted here are Replit's published rates, verified
 * 2026-08-02 on docs.replit.com (see docs/BILLING_PAYG_DEPLOYMENTS_PLAN.md §8),
 * charged 1:1 in EUR.
 */

const NOW = 1_780_000_000_000;
const PAYG_PRICE = 'price_payg_usage_eur';

interface FakeStripe {
  server: Server;
  baseUrl: string;
  usageRecords: Array<{ subscriptionItemId: string; quantity: string; idempotencyKey?: string }>;
}

function startFakeStripe(): Promise<FakeStripe> {
  const usageRecords: FakeStripe['usageRecords'] = [];
  const seen = new Set<string>(); // Stripe dedups by idempotency key server-side.

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const url = req.url ?? '';
        res.setHeader('content-type', 'application/json');

        // getSubscription → expose the metered PAYG item so reportUsage can target it.
        if (req.method === 'GET' && url.startsWith('/v1/subscriptions/')) {
          res.end(JSON.stringify({ id: 'sub_payg', items: { data: [{ id: 'si_payg', price: { id: PAYG_PRICE } }] } }));
          return;
        }

        const usageMatch = url.match(/^\/v1\/subscription_items\/([^/]+)\/usage_records$/);
        if (req.method === 'POST' && usageMatch) {
          const params = new URLSearchParams(body);
          const idempotencyKey = (req.headers['idempotency-key'] as string | undefined) ?? undefined;
          if (!idempotencyKey || !seen.has(idempotencyKey)) {
            if (idempotencyKey) seen.add(idempotencyKey);
            usageRecords.push({
              subscriptionItemId: decodeURIComponent(usageMatch[1]),
              quantity: params.get('quantity') ?? '',
              idempotencyKey,
            });
          }
          res.end(JSON.stringify({ id: 'mbur_fake', quantity: params.get('quantity') }));
          return;
        }

        res.end('{}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, usageRecords });
    });
  });
}

const originalEnv = { ...process.env };
let fake: FakeStripe;

beforeEach(async () => {
  fake = await startFakeStripe();
  process.env.BILLING_CREDITS_ENABLED = 'true';
  process.env.STRIPE_PAYG_USAGE_PRICE_ID = PAYG_PRICE;
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await new Promise<void>((r) => fake.server.close(() => r()));
});

function stripeClient(): StripeBillingClient {
  return new StripeBillingClient({ apiKey: 'sk_test_fake', baseUrl: fake.baseUrl });
}

describe('Replit-parity usage billing — per-deployment-type rates (EUR 1:1)', () => {
  it('matches Replit deployment-pricing exactly (verified docs.replit.com 2026-08-02)', () => {
    // Autoscale: €1/mo base + €3.20 / M compute units + €1.20 / M requests.
    expect(autoscaleUsageCents({ computeUnits: 1_000_000, includeBase: false })).toBe(320); // €3.20/M units
    expect(autoscaleUsageCents({ computeUnits: 0, requests: 1_000_000, includeBase: false })).toBe(120); // €1.20/M req
    expect(autoscaleUsageCents({ computeUnits: 0, includeBase: true })).toBe(100); // €1/mo base

    // Static: €0.10 / GiB egress.
    expect(egressCents(10)).toBe(100); // €1.00 for 10 GiB

    // Reserved VM: shared 0.5 = €20, dedicated 1/2/4 = €40/€80/€160 per month.
    expect(reservedVmCents('shared-0.5')).toBe(2000);
    expect(reservedVmCents('dedicated-1')).toBe(4000);
    expect(reservedVmCents('dedicated-2')).toBe(8000);
    expect(reservedVmCents('dedicated-4')).toBe(16000);
  });

  it('meters each deployment kind at the right cost and records a usage event', async () => {
    const store = new TestApiStore();
    const org = await store.createOrganization({ name: 'D', slug: 'd', ownerUserId: 'u' });
    // Fund the wallet generously so these are covered by credits (no overage here).
    await store.recordCreditEntry({ organizationId: org.id, deltaCents: 1_000_000, kind: 'GRANT', reason: 'seed' });

    const autoscale = await meterDeployment(store, {
      organizationId: org.id,
      kind: 'autoscale',
      computeUnits: 1_000_000,
      requests: 1_000_000,
      includeBase: true,
      nowMs: NOW,
    });
    expect(autoscale.costCents).toBe(320 + 120 + 100); // €5.40

    const reserved = await meterDeployment(store, {
      organizationId: org.id,
      kind: 'reserved-vm',
      reservedTier: 'dedicated-1',
      nowMs: NOW,
    });
    expect(reserved.costCents).toBe(4000); // €40/mo

    const staticDep = await meterDeployment(store, {
      organizationId: org.id,
      kind: 'static',
      egressGib: 5,
      nowMs: NOW,
    });
    expect(staticDep.costCents).toBe(50); // €0.50

    const scheduled = await meterDeployment(store, {
      organizationId: org.id,
      kind: 'scheduled',
      computeUnits: 2_000_000,
      includeBase: true,
      nowMs: NOW,
    });
    expect(scheduled.costCents).toBe(640 + 100); // €6.40 units + €1 base
  });
});

describe('Replit-parity usage billing — full cycle (grant → PAYG → Stripe)', () => {
  async function fundedOrg() {
    const store = new TestApiStore();
    const org = await store.createOrganization({ name: 'C', slug: 'c', ownerUserId: 'u' });
    // Active subscription with a Stripe id so PAYG usage can be reported against it.
    await store.upsertSubscription({
      organizationId: org.id,
      planKey: 'core',
      status: 'ACTIVE',
      externalId: 'sub_payg',
    });
    return { store, org };
  }

  it('grants Core €25, consumes it, and overage flows to PAYG + a Stripe metered usage record', async () => {
    const { store, org } = await fundedOrg();

    // (1) Monthly grant: Core = €25 = 2500 credits.
    const grant = await applyPlanGrant(store, { organizationId: org.id, planKey: 'core', nowMs: NOW });
    expect(grant.granted).toBe(2500);
    expect((await store.getCreditWallet(org.id))?.balanceCents).toBe(2500);

    // (2) Enable automatic PAYG with a €500 budget cap (Replit: $500 increments).
    await store.updateCreditWalletSettings({ organizationId: org.id, budgetCapCents: 50_000 });

    // (3) Consume more than the granted credits: a Reserved dedicated-4 (€160) deployment.
    const meter = await meterDeployment(store, {
      organizationId: org.id,
      kind: 'reserved-vm',
      reservedTier: 'dedicated-4',
      nowMs: NOW,
      paygReference: 'dep-reserved-1',
    });
    expect(meter.costCents).toBe(16_000);
    expect(meter.fromBalance).toBe(2_500); // the whole grant
    expect(meter.paygCents).toBe(13_500); // €135 overage → PAYG

    // The PAYG overage is tracked so the cap + alerts see it.
    expect(await store.sumPaygSpendSince(org.id, 0)).toBe(13_500);

    // (4) Report the overage to Stripe as a metered usage record (idempotent).
    const reported = await reportUsagePaygUsage(store, stripeClient(), {
      organizationId: org.id,
      reference: 'dep-reserved-1',
      paygChargeCents: meter.paygCents,
    });
    expect(reported.reported).toBe(true);
    expect(fake.usageRecords).toHaveLength(1);
    expect(fake.usageRecords[0].subscriptionItemId).toBe('si_payg');
    expect(fake.usageRecords[0].quantity).toBe('13500');
    expect(fake.usageRecords[0].idempotencyKey).toBe('usage:dep-reserved-1');

    // (5) A replay with the same reference is idempotent — Stripe dedups, no double charge.
    await reportUsagePaygUsage(store, stripeClient(), {
      organizationId: org.id,
      reference: 'dep-reserved-1',
      paygChargeCents: meter.paygCents,
    });
    expect(fake.usageRecords).toHaveLength(1);
  });

  it('a credit debit (Agent checkpoint) overflows to PAYG once the balance is gone', async () => {
    const { store, org } = await fundedOrg();
    await store.recordCreditEntry({ organizationId: org.id, deltaCents: 100, kind: 'GRANT', reason: 'seed' });

    const debit = await debitCredits(store, { organizationId: org.id, amountCents: 250, reason: 'checkpoint', nowMs: NOW });
    expect(debit.fromBalance).toBe(100);
    // 150 cents uncovered → overage handled by the caller as PAYG.
    expect(250 - debit.fromPacks - debit.fromBalance).toBe(150);
  });
});

describe('Replit-parity usage billing — budget cap + spend alerts', () => {
  it('PAYG is allowed under the cap and blocked once it would exceed it', () => {
    // Balance exhausted, €500 cap, €480 already spent PAYG.
    const under = evaluateCreditGate({
      balanceCents: 0,
      estimatedCents: 1_000, // €10 more
      budgetCapCents: 50_000,
      paygSpentCents: 48_000,
    });
    expect(under).toEqual({ ok: true, mode: 'payg' });

    const over = evaluateCreditGate({
      balanceCents: 0,
      estimatedCents: 5_000, // €50 more → 530 > 500 cap
      budgetCapCents: 50_000,
      paygSpentCents: 48_000,
    });
    expect(over).toEqual({ ok: false, mode: 'blocked', reason: 'budget_cap_reached' });

    // With no cap set, exhausting credits blocks (PAYG opt-out).
    const noPayg = evaluateCreditGate({ balanceCents: 0, estimatedCents: 100, budgetCapCents: null });
    expect(noPayg).toEqual({ ok: false, mode: 'blocked', reason: 'insufficient_credits' });
  });

  it('fires spend alerts once at 50%, 80%, 100% of the cap, de-duped per period', () => {
    const cap = 50_000; // €500
    const base = { budgetCapCents: cap, periodStartMs: NOW, lastAlertPeriodStartMs: NOW };

    expect(nextSpendAlertPct({ ...base, paygSpentCents: 25_000, lastAlertPct: null })).toBe(50);
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 40_000, lastAlertPct: 50 })).toBe(80);
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 50_000, lastAlertPct: 80 })).toBe(100);
    // Already alerted at this rung this period → no repeat.
    expect(nextSpendAlertPct({ ...base, paygSpentCents: 50_000, lastAlertPct: 100 })).toBeNull();

    const email = spendAlertEmailContent({ pct: 100, paygSpentCents: 50_000, budgetCapCents: cap });
    expect(email.subject.toLowerCase()).toContain('usage limit');
  });
});

describe('Replit-parity usage billing — grant TRIGGER (invoice.paid webhook)', () => {
  it('a signature-verified invoice.paid webhook grants the org its monthly plan credits', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_grant_test';

    const store = new TestApiStore();
    const app = await buildApiApp({ store, emailProvider: new QuietEmailProvider() });

    try {
      const owner = await store.createUser({
        email: 'grant@example.com',
        name: 'Owner',
        passwordHash: hashPassword('password123'),
      });
      const org = await store.createOrganization({ name: 'Grant Org', slug: 'grant-org', ownerUserId: owner.id });
      // A Core subscription that is currently PAST_DUE and recovers on payment.
      await store.upsertSubscription({
        organizationId: org.id,
        planKey: 'core',
        status: 'PAST_DUE',
        externalId: 'sub_grant',
      });
      expect((await store.getCreditWallet(org.id))?.balanceCents ?? 0).toBe(0);

      const payload = JSON.stringify({
        id: 'evt_invoice_paid_1',
        type: 'invoice.paid',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'in_1', subscription: 'sub_grant', customer: 'cus_grant', metadata: { organizationId: org.id } } },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/billing/stripe/webhook',
        headers: { 'stripe-signature': stripeSignature(payload, 'whsec_grant_test'), 'content-type': 'application/json' },
        payload: Buffer.from(payload),
      });
      expect(res.statusCode).toBe(200);

      // Subscription recovered to ACTIVE and the €25 Core monthly grant landed.
      expect((await store.getSubscription(org.id))?.status).toBe('ACTIVE');
      expect((await store.getCreditWallet(org.id))?.balanceCents).toBe(2_500);
    } finally {
      await app.close();
    }
  });
});
