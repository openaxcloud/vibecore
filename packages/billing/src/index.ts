import { createHmac, timingSafeEqual } from 'node:crypto';

export type PlanKey = 'free' | 'pro' | 'team' | 'enterprise';

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
      'workspace.cpuMillicores': 500,
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
    features: ['SSO/SAML/OIDC', 'SCIM', 'custom quotas', 'audit export', 'IP allowlist', 'premium support', 'private deployment option'],
  },
];

export function planByKey(key: string | undefined): BillingPlan {
  return billingPlans.find((plan) => plan.key === key) ?? billingPlans[0];
}

export function assertQuota(input: { key: QuotaKey; used: number; limit: number; increment?: number }) {
  const increment = input.increment ?? 1;

  if (input.limit >= 0 && input.used + increment > input.limit) {
    throw Object.assign(new Error(`Quota exceeded for ${input.key}`), {
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      quotaKey: input.key,
      used: input.used,
      limit: input.limit,
      increment,
    });
  }
}

export function verifyStripeSignature(input: { payload: string; signatureHeader?: string; secret: string; toleranceSeconds?: number; nowSeconds?: number }) {
  if (!input.signatureHeader) {
    throw Object.assign(new Error('Missing Stripe signature'), { statusCode: 400, code: 'STRIPE_SIGNATURE_MISSING' });
  }

  const values = Object.fromEntries(
    input.signatureHeader.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    }),
  );
  const timestamp = Number(values.t);
  const signature = values.v1;

  if (!timestamp || !signature) {
    throw Object.assign(new Error('Invalid Stripe signature header'), { statusCode: 400, code: 'STRIPE_SIGNATURE_INVALID' });
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;

  if (Math.abs(now - timestamp) > tolerance) {
    throw Object.assign(new Error('Expired Stripe signature'), { statusCode: 400, code: 'STRIPE_SIGNATURE_EXPIRED' });
  }

  const expected = createHmac('sha256', input.secret).update(`${timestamp}.${input.payload}`).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw Object.assign(new Error('Invalid Stripe signature'), { statusCode: 400, code: 'STRIPE_SIGNATURE_INVALID' });
  }
}

export class StripeBillingClient {
  constructor(
    private readonly input: {
      apiKey: string;
      baseUrl?: string;
    },
  ) {}

  async createCheckoutSession(input: { customerId: string; priceId: string; successUrl: string; cancelUrl: string; organizationId: string; trialDays?: number }) {
    return this.postForm('/v1/checkout/sessions', {
      mode: 'subscription',
      customer: input.customerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][price]': input.priceId,
      'line_items[0][quantity]': '1',
      'metadata[organizationId]': input.organizationId,
      ...(input.trialDays ? { 'subscription_data[trial_period_days]': String(input.trialDays) } : {}),
    });
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    return this.postForm('/v1/billing_portal/sessions', {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
  }

  async createCustomer(input: { organizationId: string; name: string; email?: string }) {
    return this.postForm('/v1/customers', {
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      'metadata[organizationId]': input.organizationId,
    });
  }

  private async postForm(path: string, fields: Record<string, string>) {
    const response = await fetch(`${this.input.baseUrl ?? 'https://api.stripe.com'}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.input.apiKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw Object.assign(new Error(`Stripe request failed: ${response.status}`), { statusCode: 502, code: 'STRIPE_REQUEST_FAILED', stripeError: body });
    }

    return body as { id: string; url?: string };
  }
}
