import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import {
  apiRequest,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatUpgradeAmount,
  formatUpgradeCopy,
  getUpgradeCopy,
  resolveUpgradeLanguage,
  upgradeLimitLabel,
  type UpgradeCopy,
} from '~/lib/i18n/catalogs/upgrade';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;

  return [{ title: getUpgradeCopy(rootData?.language)['upgrade.metaTitle'] }];
};

/*
 * Plan keys the checkout endpoint actually accepts (billingCheckoutSchema minus
 * the server-rejected ones: 'free' → 400 STRIPE_FREE_NO_CHECKOUT, 'enterprise'
 * → 400 STRIPE_ENTERPRISE_CONTACT_SALES).
 */
const CHECKOUTABLE_PLAN_KEYS = new Set(['pro', 'team']);

/*
 * Entitled statuses mirrored from the api's billingState/checkout guard: while
 * one of these is live, POST /billing/checkout 409s and changes go via portal.
 */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);

/*
 * The public pricing page links here with display-tier keys (free/core/teams);
 * map them to the legacy checkout enum so the right plan card is suggested.
 * core → 'pro' (cheapest paid tier), teams → 'team'.
 */
function normalizePlanKey(raw: string | null): 'pro' | 'team' {
  const key = (raw ?? '').toLowerCase();

  if (key === 'team' || key === 'teams') {
    return 'team';
  }

  // core/pro (and anything else) → 'pro'
  return 'pro';
}

interface UpgradePlan {
  key: string;
  name: string;
  monthlyCents: number;
  annualAvailable: boolean;
  limits: Record<string, number>;
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveUpgradeLanguage(resolveRequestLocale(request).language);
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
      language,
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
        language,
      });
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const copy = getUpgradeCopy(resolveRequestLocale(request).language);
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return json({ error: copy['upgrade.errors.organization'] }, { status: 400 });
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
        return json({ error: copy['upgrade.errors.portal'] }, { status: error.status });
      }

      console.error(error);

      return json({ error: copy['upgrade.errors.portalTemporary'] });
    }
  }

  const rawPlanKey = String(form.get('planKey') ?? '');

  if (!CHECKOUTABLE_PLAN_KEYS.has(rawPlanKey)) {
    return json({ error: copy['upgrade.errors.invalidPlan'] }, { status: 400 });
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
      return json({ error: copy['upgrade.errors.checkout'] }, { status: error.status });
    }

    /*
     * Non-Response failures (e.g. AbortSignal.timeout or a hung api pod) would
     * otherwise crash the page; surface a friendly message instead.
     */
    console.error(error);

    return json({ error: copy['upgrade.errors.checkoutTemporary'] });
  }
}

/*
 * Real, quota-enforced plan limits (the same records the api enforces) rendered
 * as the card's feature summary — no marketing copy invented here.
 */
function planHighlights(limits: Record<string, number>, copy: UpgradeCopy, language: 'en' | 'fr'): string[] {
  const numberFormatter = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US');

  const rows: Array<[string, (count: number) => string]> = [
    ['projects.count', (count) => upgradeLimitLabel(copy, language, 'projects', count)],
    ['workspaces.active', (count) => upgradeLimitLabel(copy, language, 'workspaces', count)],
    ['team.members', (count) => upgradeLimitLabel(copy, language, 'members', count)],
    ['ai.messages', (count) => upgradeLimitLabel(copy, language, 'messages', count)],
    [
      'storage.gb',
      (count) =>
        formatUpgradeCopy(copy['upgrade.limit.storage'], {
          count: numberFormatter.format(count),
        }),
    ],
  ];

  return rows.filter(([key]) => typeof limits[key] === 'number').map(([key, format]) => format(limits[key]));
}

const ACTION_CTA_CLASS =
  'inline-flex min-h-9 w-full items-center justify-center whitespace-normal rounded-md bg-[var(--vc-action-primary)] px-4 py-2 text-center text-sm font-medium text-[var(--vc-action-primary-foreground)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

const OUTLINE_CTA_CLASS =
  'inline-flex min-h-9 w-full items-center justify-center whitespace-normal rounded-md border border-bolt-elements-borderColor px-4 py-2 text-center text-sm font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60';

export default function UpgradePage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const data = useLoaderData<typeof loader>();
  const language = resolveUpgradeLanguage(data.language);
  const copy = getUpgradeCopy(language);

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>(
    data.interval === 'annual' ? 'annual' : 'monthly',
  );

  if (data.billingAccessLimited) {
    const [accessBefore, accessAfter] = copy['upgrade.access.restricted'].split('{billingPage}');

    return (
      <EnterpriseFormPage
        title={copy['upgrade.title']}
        description={copy['upgrade.access.description']}
        error={actionData?.error}
      >
        <p className="break-words text-sm text-bolt-elements-textSecondary">
          {accessBefore}
          <Link to="/billing" className="underline">
            {copy['upgrade.access.billingPage']}
          </Link>
          {accessAfter}
        </p>
      </EnterpriseFormPage>
    );
  }

  const hasActiveSubscription = ACTIVE_SUBSCRIPTION_STATUSES.has(data.subscriptionStatus ?? '');
  const annualAvailable = data.plans.some((plan) => CHECKOUTABLE_PLAN_KEYS.has(plan.key) && plan.annualAvailable);

  return (
    <EnterpriseFormPage
      title={copy['upgrade.title']}
      description={copy['upgrade.description']}
      error={actionData?.error}
    >
      <Form method="post" reloadDocument className="space-y-4">
        {hasActiveSubscription ? (
          <p className="break-words rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textSecondary">
            {copy['upgrade.subscription.active']}
          </p>
        ) : (
          <p className="break-words text-sm text-bolt-elements-textSecondary">{copy['upgrade.subscription.new']}</p>
        )}
        {!hasActiveSubscription && annualAvailable ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-bolt-elements-textPrimary">
              {copy['upgrade.interval.legend']}
            </legend>
            <div className="flex flex-col gap-3 text-sm text-bolt-elements-textSecondary sm:flex-row sm:flex-wrap sm:gap-4">
              <label className="flex min-h-[44px] items-center gap-1.5">
                <input
                  type="radio"
                  name="interval"
                  value="monthly"
                  checked={billingInterval === 'monthly'}
                  onChange={() => setBillingInterval('monthly')}
                />
                {copy['upgrade.interval.monthly']}
              </label>
              <label className="flex min-h-[44px] items-center gap-1.5">
                <input
                  type="radio"
                  name="interval"
                  value="annual"
                  checked={billingInterval === 'annual'}
                  onChange={() => setBillingInterval('annual')}
                />
                <span className="break-words">{copy['upgrade.interval.annual']}</span>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="break-words text-base font-semibold text-bolt-elements-textPrimary">{plan.name}</h2>
                  {isCurrent ? (
                    <span className="rounded-full border border-bolt-elements-borderColor px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary">
                      {copy['upgrade.badge.current']}
                    </span>
                  ) : isSuggested ? (
                    <span className="rounded-full bg-[var(--vc-action-primary)] px-2 py-0.5 text-xs font-medium text-[var(--vc-action-primary-foreground)]">
                      {copy['upgrade.badge.suggested']}
                    </span>
                  ) : null}
                </div>
                <p className="text-2xl font-bold text-bolt-elements-textPrimary">
                  {isEnterprise ? (
                    copy['upgrade.price.custom']
                  ) : (
                    <>
                      {formatUpgradeAmount(plan.monthlyCents, language)}
                      <span className="text-sm font-normal text-bolt-elements-textSecondary">
                        {copy['upgrade.price.month']}
                      </span>
                    </>
                  )}
                </p>
                {billingInterval === 'annual' && isCheckoutable && !hasActiveSubscription && !plan.annualAvailable ? (
                  <p className="break-words text-xs text-bolt-elements-textSecondary">
                    {copy['upgrade.price.noAnnual']}
                  </p>
                ) : null}
                <ul className="flex-1 space-y-1 text-xs text-bolt-elements-textSecondary">
                  {isEnterprise ? (
                    <li>{copy['upgrade.enterprise.features']}</li>
                  ) : (
                    planHighlights(plan.limits, copy, language).map((highlight) => <li key={highlight}>{highlight}</li>)
                  )}
                </ul>
                {isCurrent ? (
                  <button type="button" disabled className={OUTLINE_CTA_CLASS}>
                    {copy['upgrade.actions.current']}
                  </button>
                ) : isEnterprise ? (
                  <Link to="/contact-sales" className={OUTLINE_CTA_CLASS}>
                    {copy['upgrade.actions.sales']}
                  </Link>
                ) : hasActiveSubscription ? (
                  <button type="submit" name="intent" value="portal" className={OUTLINE_CTA_CLASS}>
                    {plan.monthlyCents === 0
                      ? copy['upgrade.actions.downgradePortal']
                      : copy['upgrade.actions.changePortal']}
                  </button>
                ) : isCheckoutable ? (
                  <button type="submit" name="planKey" value={plan.key} className={ACTION_CTA_CLASS}>
                    {formatUpgradeCopy(copy['upgrade.actions.upgrade'], { plan: plan.name })}
                  </button>
                ) : (
                  <button type="button" disabled className={OUTLINE_CTA_CLASS}>
                    {copy['upgrade.actions.noCheckout']}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Form>
      <p className="mt-4 break-words text-sm text-bolt-elements-textSecondary">
        {copy['upgrade.enterprise.prompt']}{' '}
        <Link to="/contact-sales" className="underline">
          {copy['upgrade.actions.sales']}
        </Link>
        .
      </p>
    </EnterpriseFormPage>
  );
}
