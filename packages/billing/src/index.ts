import { createHmac, timingSafeEqual } from 'node:crypto';
import { toCreditPlanKey, CREDIT_PACK_VALIDITY_DAYS, type CreditPlanKey } from './credits.js';

export * from './ai-pricing.js';
export * from './credits.js';
export * from './compute-pricing.js';
export * from './rate-card.js';
export * from './agent-routing.js';

/*
 * Pinned Stripe API version. Sent on every request so the request/webhook
 * payload shape is governed by this version (not the Stripe account's mutable
 * dashboard default). The webhook handler reads top-level current_period_* /
 * subscription fields, which later API versions relocate under items.data[].
 */
const STRIPE_API_VERSION = '2024-06-20';

// Legacy keys (free/pro/team) drive the CURRENT live flat-rate billing and must
// keep working. The Replit-parity keys (starter/core) are added to the union so
// the new catalog + migration can reference them; the two catalogs are kept
// separate (see `creditPlanCatalog`) because the `pro` key is reused with a new
// price/meaning (legacy team → new pro). See docs/REPLIT_PARITY_SPEC.md §2.A/§4.
export type PlanKey = 'free' | 'starter' | 'pro' | 'core' | 'team' | 'enterprise';

export type QuotaKey =
  | 'projects.count'
  | 'workspaces.active'
  | 'workspaces.runtimeMinutes'
  | 'workspace.cpuMillicores'
  | 'workspace.ramMb'
  | 'storage.gb'
  | 'snapshots.count'
  | 'snapshots.sizeMb'
  | 'ai.messages'
  | 'ai.inputTokens'
  | 'ai.outputTokens'
  | 'ai.toolCalls'
  | 'deployments.count'
  | 'previews.public'
  | 'team.members'
  | 'terminals.concurrent'
  | 'api.rateLimitPerMinute';

export type PlanLimits = Record<QuotaKey, number>;

export interface BillingPlan {
  key: PlanKey;
  name: string;
  monthlyCents: number;
  stripeProductEnv: string;
  stripePriceEnv: string;
  limits: PlanLimits;
  features: string[];
}

export const billingPlans: BillingPlan[] = [
  {
    key: 'free',
    name: 'Free',
    monthlyCents: 0,
    stripeProductEnv: 'STRIPE_FREE_PRODUCT_ID',
    stripePriceEnv: 'STRIPE_FREE_PRICE_ID',
    limits: {
      'projects.count': 3,
      'workspaces.active': 1,
      'workspaces.runtimeMinutes': 300,
      /*
       * 500m throttled vite's startup (esbuild dep optimization is a multi-second
       * CPU burst): the workspace-agent on the same container got starved, missed
       * its liveness probe, and the pod was SIGTERM-restarted (exit 143) mid dev
       * server boot — so generated apps' previews never came up. 1500m gives vite
       * + the agent enough headroom to start comfortably. Pod CPU REQUEST is
       * limit/4 = 375m (see resolveWorkspaceResources), so scheduling stays light.
       */
      'workspace.cpuMillicores': 1500,
      'workspace.ramMb': 1024,
      'storage.gb': 1,
      'snapshots.count': 5,
      'snapshots.sizeMb': 512,
      'ai.messages': 50,
      'ai.inputTokens': 100_000,
      'ai.outputTokens': 50_000,
      'ai.toolCalls': 100,
      'deployments.count': 0,
      'previews.public': 1,
      'team.members': 1,
      'terminals.concurrent': 1,
      'api.rateLimitPerMinute': 120,
    },
    features: ['public templates'],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyCents: 2900,
    stripeProductEnv: 'STRIPE_PRO_PRODUCT_ID',
    stripePriceEnv: 'STRIPE_PRO_PRICE_ID',
    limits: {
      'projects.count': 25,
      'workspaces.active': 4,
      'workspaces.runtimeMinutes': 5_000,
      'workspace.cpuMillicores': 2000,
      'workspace.ramMb': 4096,
      'storage.gb': 25,
      'snapshots.count': 100,
      'snapshots.sizeMb': 10_240,
      'ai.messages': 1_000,
      'ai.inputTokens': 5_000_000,
      'ai.outputTokens': 2_000_000,
      'ai.toolCalls': 3_000,
      'deployments.count': 50,
      'previews.public': 10,
      'team.members': 1,
      'terminals.concurrent': 4,
      'api.rateLimitPerMinute': 600,
    },
    features: ['stronger models', 'private previews', 'deployments'],
  },
  {
    key: 'team',
    name: 'Team',
    monthlyCents: 9900,
    stripeProductEnv: 'STRIPE_TEAM_PRODUCT_ID',
    stripePriceEnv: 'STRIPE_TEAM_PRICE_ID',
    limits: {
      'projects.count': 100,
      'workspaces.active': 15,
      'workspaces.runtimeMinutes': 30_000,
      'workspace.cpuMillicores': 4000,
      'workspace.ramMb': 8192,
      'storage.gb': 250,
      'snapshots.count': 1_000,
      'snapshots.sizeMb': 102_400,
      'ai.messages': 10_000,
      'ai.inputTokens': 50_000_000,
      'ai.outputTokens': 20_000_000,
      'ai.toolCalls': 50_000,
      'deployments.count': 500,
      'previews.public': 100,
      'team.members': 25,
      'terminals.concurrent': 20,
      'api.rateLimitPerMinute': 2_000,
    },
    features: ['org members', 'collaboration', 'shared billing', 'audit logs'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyCents: 0,
    stripeProductEnv: 'STRIPE_ENTERPRISE_PRODUCT_ID',
    stripePriceEnv: 'STRIPE_ENTERPRISE_PRICE_ID',
    limits: {
      'projects.count': 10_000,
      'workspaces.active': 1_000,
      'workspaces.runtimeMinutes': 10_000_000,
      'workspace.cpuMillicores': 16_000,
      'workspace.ramMb': 65_536,
      'storage.gb': 10_000,
      'snapshots.count': 1_000_000,
      'snapshots.sizeMb': 10_000_000,
      'ai.messages': 10_000_000,
      'ai.inputTokens': 10_000_000_000,
      'ai.outputTokens': 5_000_000_000,
      'ai.toolCalls': 50_000_000,
      'deployments.count': 1_000_000,
      'previews.public': 10_000,
      'team.members': 100_000,
      'terminals.concurrent': 10_000,
      'api.rateLimitPerMinute': 100_000,
    },
    features: [
      'SSO/SAML/OIDC',
      'SCIM',
      'custom quotas',
      'audit export',
      'IP allowlist',
      'premium support',
      'private deployment option',
    ],
  },
];

/** Strict lookup: returns undefined on an unknown key so callers can detect a
 * miss instead of silently downgrading a paying customer to the Free plan. */
export function findPlanByKey(key: string | undefined): BillingPlan | undefined {
  return billingPlans.find((plan) => plan.key === key);
}

export function planByKey(key: string | undefined): BillingPlan {
  return findPlanByKey(key) ?? billingPlans[0];
}

// ===========================================================================
// Replit-parity plan catalog (starter/core/pro/enterprise, monthly + annual,
// included credits). Separate from `billingPlans` (legacy) during migration —
// not seeded into the Plan table until the P7 cutover. Drives the new pricing
// page and credit grants. See docs/REPLIT_PARITY_SPEC.md.
// ===========================================================================

export type PublishRegions = 'single' | 'all' | 'custom';

export interface CreditBillingPlan {
  key: CreditPlanKey; // 'starter' | 'core' | 'pro' | 'enterprise'
  name: string;
  /** Monthly price in cents (0 = free / custom). */
  monthlyCents: number;
  /** Total annual price in cents billed once (0 = free / custom). */
  annualCents: number;
  /** Effective monthly price when paying annually, in cents (display helper). */
  annualMonthlyCents: number;
  /** Monthly credit grant in cents (0 for Starter, which grants daily). */
  includedCreditCents: number;
  /** Daily credit grant in cents (Starter only). */
  dailyCreditCents: number;
  collaborators: number;
  /** Read-only viewers (Pro+). 0 = none. */
  viewers: number;
  /** Concurrent agents allowed per request fan-out. */
  parallelAgents: number;
  /** Database point-in-time rollback window in days (0 = none). */
  dbRollbackDays: number;
  /** Can remove the "Made with VibeCore" badge. */
  badgeRemovable: boolean;
  publishRegions: PublishRegions;
  /** Access to the most powerful models (Pro/Enterprise). */
  topModels: boolean;
  features: string[];
  /** Compute/storage guard-rails (reused quota dimensions). */
  limits: PlanLimits;
  stripeProductEnv: string;
  stripePriceMonthlyEnv: string;
  stripePriceAnnualEnv: string;
}

// Sentinel for "effectively unlimited" guard-rail dimensions on paid plans.
const UNLIMITED = 1_000_000;

export const creditPlanCatalog: CreditBillingPlan[] = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyCents: 0,
    annualCents: 0,
    annualMonthlyCents: 0,
    includedCreditCents: 0,
    dailyCreditCents: 25,
    collaborators: 1,
    viewers: 0,
    parallelAgents: 1,
    dbRollbackDays: 0,
    badgeRemovable: false,
    publishRegions: 'single',
    topModels: false,
    features: ['Daily free Agent credits', 'Built-in database', 'Publish 1 project', 'Private / password deploys'],
    limits: planByKey('free').limits,
    stripeProductEnv: 'STRIPE_STARTER_PRODUCT_ID',
    stripePriceMonthlyEnv: 'STRIPE_STARTER_PRICE_MONTHLY_ID',
    stripePriceAnnualEnv: 'STRIPE_STARTER_PRICE_ANNUAL_ID',
  },
  {
    key: 'core',
    name: 'Core',
    monthlyCents: 2500,
    annualCents: 24_000, // $240/yr → $20/mo effective (~20% off)
    annualMonthlyCents: 2000,
    includedCreditCents: 2500,
    dailyCreditCents: 0,
    collaborators: 5,
    viewers: 0,
    parallelAgents: 2,
    dbRollbackDays: 0,
    badgeRemovable: true,
    publishRegions: 'all',
    topModels: false,
    features: [
      '$25/mo of credits',
      '5 collaborators',
      '2 parallel agents',
      'Unlimited workspaces',
      'Publish to any region',
      'Remove "Made with" badge',
      'AI integrations',
    ],
    limits: { ...planByKey('pro').limits, 'workspaces.active': UNLIMITED, 'projects.count': UNLIMITED },
    stripeProductEnv: 'STRIPE_CORE_PRODUCT_ID',
    stripePriceMonthlyEnv: 'STRIPE_CORE_PRICE_MONTHLY_ID',
    stripePriceAnnualEnv: 'STRIPE_CORE_PRICE_ANNUAL_ID',
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyCents: 10_000,
    annualCents: 114_000, // $1140/yr → $95/mo effective (~5% off)
    annualMonthlyCents: 9500,
    includedCreditCents: 10_000,
    dailyCreditCents: 0,
    collaborators: 15,
    viewers: 50,
    parallelAgents: 10,
    dbRollbackDays: 28,
    badgeRemovable: true,
    publishRegions: 'all',
    topModels: true,
    features: [
      '$100/mo of credits',
      '15 collaborators',
      '50 viewers',
      '10 parallel agents',
      'Most powerful models',
      '28-day database rollbacks',
      'Premium support',
    ],
    limits: { ...planByKey('team').limits, 'workspaces.active': UNLIMITED, 'projects.count': UNLIMITED },
    stripeProductEnv: 'STRIPE_PRO_PRODUCT_ID',
    stripePriceMonthlyEnv: 'STRIPE_PRO_PRICE_MONTHLY_ID',
    stripePriceAnnualEnv: 'STRIPE_PRO_PRICE_ANNUAL_ID',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    monthlyCents: 0, // custom / sales-led
    annualCents: 0,
    annualMonthlyCents: 0,
    includedCreditCents: 0, // granted per-contract
    dailyCreditCents: 0,
    collaborators: UNLIMITED,
    viewers: UNLIMITED,
    parallelAgents: 50,
    dbRollbackDays: 28,
    badgeRemovable: true,
    publishRegions: 'custom',
    topModels: true,
    features: [
      'Custom seats',
      'SSO / SAML',
      'Privacy controls',
      'Design system',
      'Data warehouse',
      'Groups',
      'Dedicated support',
      'Single-tenant',
      'Region selection',
      'Static outbound IPs',
      'VPC peering',
    ],
    limits: planByKey('enterprise').limits,
    stripeProductEnv: 'STRIPE_ENTERPRISE_PRODUCT_ID',
    stripePriceMonthlyEnv: 'STRIPE_ENTERPRISE_PRICE_MONTHLY_ID',
    stripePriceAnnualEnv: 'STRIPE_ENTERPRISE_PRICE_ANNUAL_ID',
  },
];

export function findCreditPlan(key: string | undefined): CreditBillingPlan | undefined {
  return creditPlanCatalog.find((plan) => plan.key === key);
}

/** Resolve any plan key (incl. legacy free/pro/team) to a Replit-parity plan. */
export function creditPlanByKey(key: string | undefined): CreditBillingPlan {
  return findCreditPlan(toCreditPlanKey(key)) ?? creditPlanCatalog[0];
}

// ===========================================================================
// Canonical Replit-parity plan surface (Starter/Core/Pro/Enterprise).
// After the P7 cutover these are the ONLY plan keys used from the pricing page
// through checkout, the Subscription row, and the AI gateway. `billingPlans`
// above survives only as the internal limit/resource tiers that each credit
// plan's `.limits` derive from — it is never a user-facing or stored plan key.
// ===========================================================================

export type BillingInterval = 'monthly' | 'annual';

/** The credit plans that go through Stripe self-serve checkout. Starter is free
 * (no checkout) and Enterprise is sales-led (contact-sales). */
export const SELF_SERVE_CHECKOUT_PLAN_KEYS: readonly CreditPlanKey[] = ['core', 'pro'];

export function isSelfServeCheckoutPlan(key: string | undefined): key is 'core' | 'pro' {
  return key === 'core' || key === 'pro';
}

/** Amount actually charged for a plan at a billing interval, in cents. Monthly =
 * the per-month price; Annual = the single yearly charge (annualCents). This is
 * the single source of truth the pricing page displays AND checkout charges. */
export function creditPlanChargeCents(plan: CreditBillingPlan, interval: BillingInterval): number {
  return interval === 'annual' ? plan.annualCents : plan.monthlyCents;
}

/** Per-month figure to DISPLAY for an interval (annual shows the discounted
 * effective monthly, monthly shows the sticker price). */
export function creditPlanDisplayMonthlyCents(plan: CreditBillingPlan, interval: BillingInterval): number {
  return interval === 'annual' ? plan.annualMonthlyCents : plan.monthlyCents;
}

/** Map a Replit-parity plan key to the AI gateway's model-tier key. Starter uses
 * base models (gateway `free`), Core the mid tier (`pro`), Pro the most powerful
 * models (`business` — Pro has `topModels: true`), Enterprise everything. Any
 * legacy key is normalised first, so `team` → `pro` → `business`. */
export function creditPlanToGatewayTier(key: string | undefined): 'free' | 'pro' | 'business' | 'enterprise' {
  switch (toCreditPlanKey(key)) {
    case 'core':
      return 'pro';
    case 'pro':
      return 'business';
    case 'enterprise':
      return 'enterprise';
    case 'starter':
    default:
      return 'free';
  }
}

// --- Credit packs (one-time purchases, Replit parity) ----------------------
//
// Replit sells four pre-paid credit packs at a volume discount; the credits
// expire 6 months after purchase and never roll over past expiry
// (consumed earliest-expiry-first — see planPackConsumption in credits.ts).
// Prices/values transcribed from replit.com/pricing (verified 2026-06-29):
//   $100 → $100   ·   $300 → $290   ·   $500 → $480   ·   $1000 → $950

export interface CreditPackSku {
  /** Stable SKU id used by checkout and Stripe price-env resolution. */
  id: string;
  /** Display label (the credit value as a dollar string). */
  label: string;
  /** Credit value granted to the wallet, in cents. */
  creditCents: number;
  /** Amount charged at purchase, in cents (≤ creditCents; the gap is the discount). */
  priceCents: number;
  /** Validity window from purchase, in days (Replit: 6 months). */
  validityDays: number;
  /** Env var holding the Stripe one-time Price id for this pack. */
  stripePriceEnv: string;
}

export const creditPackCatalog: CreditPackSku[] = [
  {
    id: 'pack-100',
    label: '$100',
    creditCents: 10_000,
    priceCents: 10_000,
    validityDays: CREDIT_PACK_VALIDITY_DAYS,
    stripePriceEnv: 'STRIPE_CREDIT_PACK_100_PRICE_ID',
  },
  {
    id: 'pack-300',
    label: '$300',
    creditCents: 30_000,
    priceCents: 29_000,
    validityDays: CREDIT_PACK_VALIDITY_DAYS,
    stripePriceEnv: 'STRIPE_CREDIT_PACK_300_PRICE_ID',
  },
  {
    id: 'pack-500',
    label: '$500',
    creditCents: 50_000,
    priceCents: 48_000,
    validityDays: CREDIT_PACK_VALIDITY_DAYS,
    stripePriceEnv: 'STRIPE_CREDIT_PACK_500_PRICE_ID',
  },
  {
    id: 'pack-1000',
    label: '$1,000',
    creditCents: 100_000,
    priceCents: 95_000,
    validityDays: CREDIT_PACK_VALIDITY_DAYS,
    stripePriceEnv: 'STRIPE_CREDIT_PACK_1000_PRICE_ID',
  },
];

export function findCreditPack(id: string | undefined): CreditPackSku | undefined {
  return creditPackCatalog.find((pack) => pack.id === id);
}

/** Discount (credit value − price) for a pack SKU, in cents. */
export function creditPackDiscountCents(pack: CreditPackSku): number {
  return Math.max(0, pack.creditCents - pack.priceCents);
}

// --- Concurrent published-app cap (Replit parity) --------------------------
/**
 * Hard limit on simultaneously-published apps per account, matching Replit's
 * documented 20-app concurrency cap. Enforced at publish time.
 */
export const MAX_CONCURRENT_PUBLISHED_APPS = 20;

/**
 * Throw a 429 if publishing one more app would exceed the concurrent cap.
 * Mirrors `assertQuota`'s shape so callers can treat it the same way.
 */
export function assertConcurrentPublishedApps(input: { active: number; cap?: number }): void {
  const cap = input.cap ?? MAX_CONCURRENT_PUBLISHED_APPS;
  if (input.active >= cap) {
    throw Object.assign(new Error(`Concurrent published-app limit reached (${cap}).`), {
      statusCode: 429,
      code: 'APP_LIMIT_EXCEEDED',
    });
  }
}

export function assertQuota(input: { key: QuotaKey; used: number; limit: number; increment?: number }) {
  /*
   * This is the single chokepoint that gates every quota in the app, so it must
   * be defensive against non-finite inputs. `NaN > limit` / Infinity arithmetic
   * evaluate falsy, which would silently bypass the cap and let a caller exceed
   * (or infinitely exceed) the limit. Coerce defensively: an unusable `used`
   * counts as already-over, and an unusable `limit` is treated as a hard block.
   */
  const increment = Number.isFinite(input.increment) ? (input.increment as number) : 1;
  const used = Number.isFinite(input.used) ? input.used : Number.POSITIVE_INFINITY;
  const limit = Number.isFinite(input.limit) ? input.limit : 0;

  if (limit >= 0 && used + increment > limit) {
    throw Object.assign(new Error(`Quota exceeded for ${input.key}`), {
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      quotaKey: input.key,
      used,
      limit,
      increment,
    });
  }
}

export function verifyStripeSignature(input: {
  payload: string;
  signatureHeader?: string;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}) {
  if (!input.signatureHeader) {
    throw Object.assign(new Error('Missing Stripe signature'), { statusCode: 400, code: 'STRIPE_SIGNATURE_MISSING' });
  }

  // A Stripe-Signature header can carry MULTIPLE `v1=` signatures (one per active signing
  // secret during a secret rotation). Collapsing them with Object.fromEntries kept only
  // the last, so a legitimate event signed by our secret was rejected if it wasn't the
  // final v1. Collect every v1 and accept if any matches.
  const parts = input.signatureHeader.split(',').map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), part.slice(index + 1)];
  });
  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    throw Object.assign(new Error('Invalid Stripe signature header'), {
      statusCode: 400,
      code: 'STRIPE_SIGNATURE_INVALID',
    });
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;

  if (Math.abs(now - timestamp) > tolerance) {
    throw Object.assign(new Error('Expired Stripe signature'), { statusCode: 400, code: 'STRIPE_SIGNATURE_EXPIRED' });
  }

  const expected = createHmac('sha256', input.secret).update(`${timestamp}.${input.payload}`).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const matched = signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  });

  if (!matched) {
    throw Object.assign(new Error('Invalid Stripe signature'), { statusCode: 400, code: 'STRIPE_SIGNATURE_INVALID' });
  }
}

export interface StripeInvoice {
  id: string;
  number?: string | null;
  status?: string | null;
  amount_due?: number;
  amount_paid?: number;
  currency?: string;
  created?: number;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
}

export class StripeBillingClient {
  constructor(
    private readonly input: {
      apiKey: string;
      baseUrl?: string;
    },
  ) {}

  async createCheckoutSession(input: {
    customerId: string;
    priceId: string;
    planKey: PlanKey;
    successUrl: string;
    cancelUrl: string;
    organizationId: string;
    trialDays?: number;
  }) {
    return this.postForm('/v1/checkout/sessions', {
      mode: 'subscription',
      customer: input.customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': '1',
      'metadata[organizationId]': input.organizationId,
      'metadata[planKey]': input.planKey,
      'metadata[priceId]': input.priceId,
      'subscription_data[metadata][organizationId]': input.organizationId,
      'subscription_data[metadata][planKey]': input.planKey,
      'subscription_data[metadata][priceId]': input.priceId,
      ...(input.trialDays ? { 'subscription_data[trial_period_days]': String(input.trialDays) } : {}),
    });
  }

  /**
   * Create a one-time-payment Checkout Session for a credit pack purchase
   * (Replit-parity pre-paid credit packs). Unlike `createCheckoutSession`
   * (subscription mode), this uses `mode: 'payment'` and carries a
   * `creditPackSku` in metadata so the `checkout.session.completed` webhook can
   * branch on it and grant the pack instead of touching the subscription row.
   */
  async createCreditPackCheckoutSession(input: {
    customerId: string;
    priceId: string;
    creditPackSku: string;
    successUrl: string;
    cancelUrl: string;
    organizationId: string;
  }) {
    return this.postForm('/v1/checkout/sessions', {
      mode: 'payment',
      customer: input.customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': '1',
      'metadata[organizationId]': input.organizationId,
      'metadata[creditPackSku]': input.creditPackSku,
      'metadata[priceId]': input.priceId,
      // Mirror metadata onto the resulting PaymentIntent so a refund/dispute
      // webhook can also resolve back to the org + pack without a session lookup.
      'payment_intent_data[metadata][organizationId]': input.organizationId,
      'payment_intent_data[metadata][creditPackSku]': input.creditPackSku,
    });
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    return this.postForm('/v1/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
  }

  async listInvoices(input: { customerId: string; limit?: number }) {
    const params = new URLSearchParams({
      customer: input.customerId,
      limit: String(Math.min(Math.max(input.limit ?? 20, 1), 100)),
    });
    const response = await this.getJson(`/v1/invoices?${params.toString()}`);

    return (response as { data?: StripeInvoice[] }).data ?? [];
  }

  async createCustomer(input: { organizationId: string; name: string; email?: string }) {
    return this.postForm('/v1/customers', {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      'metadata[organizationId]': input.organizationId,
    });
  }

  async createProduct(input: { name: string; planKey: PlanKey; description?: string }) {
    return this.postForm('/v1/products', {
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      'metadata[planKey]': input.planKey,
    });
  }

  async createRecurringPrice(input: { productId: string; planKey: PlanKey; unitAmountCents: number; currency?: string; interval?: 'month' | 'year' }) {
    return this.postForm('/v1/prices', {
      product: input.productId,
      currency: input.currency ?? 'eur',
      unit_amount: String(input.unitAmountCents),
      'recurring[interval]': input.interval ?? 'month',
      'metadata[planKey]': input.planKey,
    });
  }

  /**
   * Create a one-time (non-recurring) price for a credit pack SKU. Used by the
   * admin pack-provisioning flow to mint the 4 Stripe Prices whose ids feed the
   * `STRIPE_CREDIT_PACK_*_PRICE_ID` env vars consumed by
   * `createCreditPackCheckoutSession`.
   */
  async createOneTimePrice(input: {
    productId: string;
    creditPackSku: string;
    unitAmountCents: number;
    currency?: string;
    nickname?: string;
  }) {
    return this.postForm('/v1/prices', {
      product: input.productId,
      currency: input.currency ?? 'eur',
      unit_amount: String(input.unitAmountCents),
      ...(input.nickname ? { nickname: input.nickname } : {}),
      'metadata[creditPackSku]': input.creditPackSku,
    });
  }

  /**
   * Create a usage-metered recurring price for pay-as-you-go (AI / compute
   * overage beyond included credits). `unitAmountCents` is the price per unit
   * (e.g. per credit or per 1k credits); usage is reported via `reportUsage`.
   */
  async createMeteredPrice(input: {
    productId: string;
    nickname: string;
    unitAmountCents: number;
    currency?: string;
    interval?: 'month' | 'year';
  }) {
    return this.postForm('/v1/prices', {
      product: input.productId,
      currency: input.currency ?? 'eur',
      unit_amount: String(input.unitAmountCents),
      nickname: input.nickname,
      'recurring[interval]': input.interval ?? 'month',
      'recurring[usage_type]': 'metered',
      'recurring[aggregate_usage]': 'sum',
    });
  }

  /**
   * Report metered usage for a subscription item (pay-as-you-go draw-down).
   * `action: 'increment'` adds to the period total; `'set'` overwrites it.
   */
  async reportUsage(input: {
    subscriptionItemId: string;
    quantity: number;
    timestampSeconds?: number;
    action?: 'increment' | 'set';
    idempotencyKey?: string;
  }) {
    const fields: Record<string, string> = {
      /*
       * Round metered usage UP, not down. Math.floor silently dropped the
       * fractional remainder of every metered report (e.g. 4.9 units billed as
       * 4) — systematic under-billing across all metered usage. Ceil is the
       * conservative direction: the platform never charges less than was used.
       */
      quantity: String(Math.max(0, Math.ceil(input.quantity))),
      action: input.action ?? 'increment',
    };
    if (input.timestampSeconds) {
      fields.timestamp = String(input.timestampSeconds);
    }
    return this.postForm(
      `/v1/subscription_items/${encodeURIComponent(input.subscriptionItemId)}/usage_records`,
      fields,
      input.idempotencyKey,
    );
  }

  /** Health check: confirms the secret key works by reading the account balance. */
  async ping(): Promise<{ ok: boolean; livemode?: boolean; error?: string }> {
    try {
      const balance = (await this.getJson('/v1/balance')) as { livemode?: boolean };
      return { ok: true, livemode: balance.livemode };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? 'Stripe ping failed' };
    }
  }

  async findProductByPlanKey(planKey: PlanKey) {
    const response = await this.getJson(`/v1/products/search?query=${encodeURIComponent(`metadata['planKey']:'${planKey}' AND active:'true'`)}`);
    return (response as { data?: Array<{ id: string; name: string }> }).data?.[0];
  }

  async findActivePriceForProduct(productId: string, planKey: PlanKey) {
    const response = await this.getJson(`/v1/prices/search?query=${encodeURIComponent(`product:'${productId}' AND metadata['planKey']:'${planKey}' AND active:'true'`)}`);
    return (response as { data?: Array<{ id: string; unit_amount: number; currency: string }> }).data?.[0];
  }

  /**
   * Fetch a subscription with its line items — used to locate the PAYG metered
   * subscription item by its price id so usage can be reported against it.
   * Returns undefined on any error (best-effort; never throws into the caller).
   */
  async getSubscription(
    subscriptionId: string,
  ): Promise<{ id: string; items?: { data?: Array<{ id: string; price?: { id?: string } }> } } | undefined> {
    try {
      return (await this.getJson(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`)) as {
        id: string;
        items?: { data?: Array<{ id: string; price?: { id?: string } }> };
      };
    } catch {
      return undefined;
    }
  }

  private async postForm(path: string, fields: Record<string, string>, idempotencyKey?: string) {
    const response = await fetch(`${this.input.baseUrl ?? 'https://api.stripe.com'}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.input.apiKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        // Pin the API version so payload/webhook shape doesn't drift with the
        // account's dashboard default (the webhook reads top-level
        // current_period_* / subscription fields that newer versions relocate).
        'stripe-version': STRIPE_API_VERSION,
        // Safe retries for metered usage reporting (avoid double-charging on retry).
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Object.assign(new Error(`Stripe request failed: ${response.status}`), {
        statusCode: 502,
        code: 'STRIPE_REQUEST_FAILED',
        stripeError: body,
      });
    }

    return body as { id: string; url?: string };
  }

  private async getJson(path: string) {
    const response = await fetch(`${this.input.baseUrl ?? 'https://api.stripe.com'}${path}`, {
      headers: {
        authorization: `Bearer ${this.input.apiKey}`,
        'stripe-version': STRIPE_API_VERSION,
      },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Object.assign(new Error(`Stripe request failed: ${response.status}`), {
        statusCode: 502,
        code: 'STRIPE_REQUEST_FAILED',
        stripeError: body,
      });
    }

    return body;
  }
}
