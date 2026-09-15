import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Upgrade - E-Code' }];

/*
 * Plan keys the checkout endpoint actually accepts (billingCheckoutSchema minus
 * the server-rejected ones: 'starter' → 400 STRIPE_FREE_NO_CHECKOUT, 'enterprise'
 * → 400 STRIPE_ENTERPRISE_CONTACT_SALES).
 */
const CHECKOUTABLE_PLAN_KEYS = new Set(['core', 'pro']);

/*
 * Entitled statuses mirrored from the api's billingState/checkout guard: while
 * one of these is live, POST /billing/checkout 409s and changes go via portal.
 */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);

// Prices are shown in euros with the same figures as the billing page (no conversion).
const euros = (cents: number) => `€${(cents / 100).toFixed(0)}`;

/*
 * The public pricing page links here with the canonical plan key. Core and Pro
 * are the two self-serve checkout tiers; any legacy alias (team/teams → pro,
 * free → core) is normalised so the right plan card is preselected. Core is the
 * default when nothing recognisable is passed.
 */
function normalizePlanKey(raw: string | null): 'core' | 'pro' {
  const key = (raw ?? '').toLowerCase();

  if (key === 'pro' || key === 'team' || key === 'teams') {
    return 'pro';
  }

  // core (and anything else) → 'core'
  return 'core';
}

interface UpgradePlan {
  key: string;
  name: string;
  monthlyCents: number;
  annualAvailable: boolean;
  limits: Record<string, number>;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const url = new URL(request.url);
  const suggestedPlan = normalizePlanKey(url.searchParams.get('plan'));

  const interval =
    url.searchParams.get('interval') === 'annual' || url.searchParams.get('interval') === 'yearly'
      ? 'annual'
      : 'monthly';

  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    /*
     * Real data, same sources the billing page uses:
     *  - GET /orgs/:orgId/billing → the org's CURRENT (status-gated) plan + subscription.
     *  - GET /billing/:orgId     → the DB Plan catalog rows — the exact records the
     *    checkout endpoint resolves Stripe prices from, with their real monthlyCents.
     */
    const [billing, catalog] = await Promise.all([
      apiRequest<{
        plan: { key: string; name: string; monthlyCents: number };
        subscription?: { status?: string } | null;
      }>(request, `/orgs/${organization.id}/billing`),
      apiRequest<{
        plans: Array<{
          key: string;
          name: string;
          monthlyCents: number;
          limits?: Record<string, number>;
          stripePriceAnnualId?: string | null;
        }>;
      }>(request, `/billing/${organization.id}`),
    ]);

    const plans: UpgradePlan[] = catalog.plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      monthlyCents: plan.monthlyCents,
      annualAvailable: Boolean(plan.stripePriceAnnualId),
      limits: plan.limits ?? {},
    }));

    return json({
      suggestedPlan,
      interval,
      plans,
      currentPlanKey: billing.plan.key,
      subscriptionStatus: billing.subscription?.status ?? null,
      billingAccessLimited: false,
    });
  } catch (error) {
    /*
     * Members without billing:read cannot see plan/price state; degrade to an
     * explanatory message instead of a hard 403 page. Anything else (including
     * re-auth redirect Responses) propagates.
     */
    if (isForbiddenApiResponse(error)) {
      return json({
        suggestedPlan,
        interval,
        plans: [] as UpgradePlan[],
        currentPlanKey: null,
        subscriptionStatus: null,
        billingAccessLimited: true,
      });
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: 'No organization found for your account.' }, { status: 400 });
  }

  const form = await request.formData();

  if (String(form.get('intent') ?? '') === 'portal') {
    /*
     * Plan changes for an org with a live subscription go through the Stripe
     * billing portal (the checkout endpoint 409s to prevent a second overlapping
     * subscription). Stripe prorates the plan change with its default behaviour.
     */
    try {
      const result = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: new URL('/upgrade', request.url).toString() }),
      });

      return redirect(result.portalUrl);
    } catch (error) {
      if (isReauthRedirect(error)) {
        throw error;
      }

      if (isApiResponse(error)) {
        return json(
          { error: await apiErrorMessage(error, 'The billing portal is unavailable right now. Please try again.') },
          { status: error.status },
        );
      }

      console.error('Failed to open the billing portal:', error);

      return json({ error: 'The billing portal is temporarily unavailable. Please try again later.' });
    }
  }

  const rawPlanKey = String(form.get('planKey') ?? '');

  if (!CHECKOUTABLE_PLAN_KEYS.has(rawPlanKey)) {
    return json({ error: 'Choose a plan that supports self-serve checkout.' }, { status: 400 });
  }

  const interval = String(form.get('interval') ?? 'monthly') === 'annual' ? 'annual' : 'monthly';

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey: rawPlanKey,
        interval,
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/upgrade', request.url).toString(),
      }),
    });

    return redirect(result.checkoutUrl);
  } catch (error) {
    /*
     * A 3xx redirect Response thrown mid-checkout is a session-expiry login or
     * MFA_REQUIRED re-auth navigation (see enterprise-api.server.ts). It is still
     * `instanceof Response`, so it must be re-thrown BEFORE the isApiResponse
     * branch — otherwise the redirect's Location is discarded and the user gets a
     * bogus json error with a 3xx status instead of reaching the re-auth page.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Checkout is unavailable right now. Please try again later.') },
        { status: error.status },
      );
    }

    /*
     * Non-Response failures (e.g. AbortSignal.timeout or a hung api pod) would
     * otherwise crash the page; surface a friendly message instead.
     */
    console.error('Failed to start checkout:', error);

    return json({ error: 'Checkout is temporarily unavailable. Please try again later.' });
  }
}

/*
 * Real, quota-enforced plan limits (the same records the api enforces) rendered
 * as the card's feature summary — no marketing copy invented here.
 */
function planHighlights(limits: Record<string, number>): string[] {
  const rows: Array<[string, (n: number) => string]> = [
    ['projects.count', (n) => `${formatUserAreaNumber(n)} projects`],
    ['workspaces.active', (n) => `${formatUserAreaNumber(n)} active workspace${n === 1 ? '' : 's'}`],
    ['team.members', (n) => (n === 1 ? '1 member' : `${formatUserAreaNumber(n)} team members`)],
    ['ai.messages', (n) => `${formatUserAreaNumber(n)} AI messages / month`],
    ['storage.gb', (n) => `${formatUserAreaNumber(n)} GB storage`],
  ];

  return rows.filter(([key]) => typeof limits[key] === 'number').map(([key, format]) => format(limits[key]));
}

const ACTION_CTA_CLASS =
  'inline-flex h-9 w-full items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

const OUTLINE_CTA_CLASS =
  'inline-flex h-9 w-full items-center justify-center rounded-md border border-bolt-elements-borderColor px-4 text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

export default function UpgradePage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const data = useLoaderData<typeof loader>();

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>(
    data.interval === 'annual' ? 'annual' : 'monthly',
  );

  if (data.billingAccessLimited) {
    return (
      <EnterpriseFormPage
        title="Upgrade"
        description="Move your organization to a higher plan."
        error={actionData?.error}
      >
        <p className="text-sm text-bolt-elements-textSecondary">
          Plan and price details are available to organization owners and billing administrators only. Ask an owner to
          upgrade, or check your role on the{' '}
          <Link to="/billing" className="underline">
            billing page
          </Link>
          .
        </p>
      </EnterpriseFormPage>
    );
  }

  const hasActiveSubscription = ACTIVE_SUBSCRIPTION_STATUSES.has(data.subscriptionStatus ?? '');
  const annualAvailable = data.plans.some((plan) => CHECKOUTABLE_PLAN_KEYS.has(plan.key) && plan.annualAvailable);

  return (
    <EnterpriseFormPage
      title="Upgrade"
      description="Plans and prices below come from the live billing catalog — the same records Stripe checkout charges against."
      error={actionData?.error}
    >
      <Form method="post" reloadDocument className="space-y-4">
        {hasActiveSubscription ? (
          <p className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textSecondary">
            Your organization already has an active subscription. Plan changes (including downgrades) are made in the
            Stripe billing portal and are prorated by Stripe.
          </p>
        ) : (
          <p className="text-sm text-bolt-elements-textSecondary">
            Starting a plan opens Stripe Checkout; your subscription begins immediately at the price shown.
          </p>
        )}
        {!hasActiveSubscription && annualAvailable ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-bolt-elements-textPrimary">Billing interval</legend>
            <div className="flex gap-4 text-sm text-bolt-elements-textSecondary">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="interval"
                  value="monthly"
                  checked={billingInterval === 'monthly'}
                  onChange={() => setBillingInterval('monthly')}
                />
                Monthly
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="interval"
                  value="annual"
                  checked={billingInterval === 'annual'}
                  onChange={() => setBillingInterval('annual')}
                />
                Annual — the discounted annual amount is shown at Stripe checkout
              </label>
            </div>
          </fieldset>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {data.plans.map((plan) => {
            const isCurrent = plan.key === data.currentPlanKey;
            const isEnterprise = plan.key === 'enterprise';
            const isCheckoutable = CHECKOUTABLE_PLAN_KEYS.has(plan.key);
            const isSuggested = !isCurrent && !hasActiveSubscription && plan.key === data.suggestedPlan;

            return (
              <div
                key={plan.key}
                className={`flex flex-col gap-3 rounded-lg border p-4 ${
                  isSuggested
                    ? 'border-[var(--vc-ide-accent-action)]'
                    : isCurrent
                      ? 'border-bolt-elements-focus'
                      : 'border-bolt-elements-borderColor'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-bolt-elements-textPrimary">{plan.name}</h2>
                  {isCurrent ? (
                    <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary">
                      Your plan
                    </span>
                  ) : isSuggested ? (
                    <span className="rounded-full bg-[var(--vc-ide-accent-action)] px-2 py-0.5 text-xs font-medium text-white">
                      Suggested
                    </span>
                  ) : null}
                </div>
                <p className="text-2xl font-bold text-bolt-elements-textPrimary">
                  {isEnterprise ? (
                    'Custom'
                  ) : (
                    <>
                      {euros(plan.monthlyCents)}
                      <span className="text-sm font-normal text-bolt-elements-textSecondary"> / month</span>
                    </>
                  )}
                </p>
                {billingInterval === 'annual' && isCheckoutable && !hasActiveSubscription && !plan.annualAvailable ? (
                  <p className="text-xs text-bolt-elements-textSecondary">
                    No annual price is configured for this plan — it bills monthly.
                  </p>
                ) : null}
                <ul className="flex-1 space-y-1 text-xs text-bolt-elements-textSecondary">
                  {isEnterprise ? (
                    <li>Custom quotas, SSO/SAML, premium support</li>
                  ) : (
                    planHighlights(plan.limits).map((highlight) => <li key={highlight}>{highlight}</li>)
                  )}
                </ul>
                {isCurrent ? (
                  <button type="button" disabled className={OUTLINE_CTA_CLASS}>
                    Current plan
                  </button>
                ) : isEnterprise ? (
                  <Link to="/contact-sales" className={OUTLINE_CTA_CLASS}>
                    Talk to sales
                  </Link>
                ) : hasActiveSubscription ? (
                  <button type="submit" name="intent" value="portal" className={OUTLINE_CTA_CLASS}>
                    {plan.monthlyCents === 0 ? 'Downgrade in billing portal' : 'Change in billing portal'}
                  </button>
                ) : isCheckoutable ? (
                  <button type="submit" name="planKey" value={plan.key} className={ACTION_CTA_CLASS}>
                    Upgrade to {plan.name}
                  </button>
                ) : (
                  <button type="button" disabled className={OUTLINE_CTA_CLASS}>
                    No checkout needed
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Form>
      <p className="mt-4 text-sm text-bolt-elements-textSecondary">
        Need Enterprise (SSO/SAML, custom quotas, premium support)?{' '}
        <Link to="/contact-sales" className="underline">
          Talk to sales
        </Link>
        .
      </p>
    </EnterpriseFormPage>
  );
}
