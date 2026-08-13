import { useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
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
import { shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction = () => [{ title: 'Downgrade - E-Code' }];

/*
 * Statuses for which the org already has a live Stripe subscription. While one
 * is live the checkout endpoint 409s (it refuses to open a second overlapping
 * subscription), so EVERY plan change — including a downgrade — has to go
 * through the billing portal, which schedules/prorates the change at the end of
 * the current period. Only an org with no active subscription (e.g. still on
 * free) starts a paid plan via checkout.
 */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);

// Plan keys the checkout endpoint accepts ('free'/'enterprise' are rejected there).
const CHECKOUTABLE_PLAN_KEYS = new Set(['pro', 'team']);

// Prices are shown in euros with the same figures as the billing/upgrade pages.
const euros = (cents: number) => `€${(cents / 100).toFixed(0)}`;

interface CatalogPlan {
  key: string;
  name: string;
  monthlyCents: number;
  limits: Record<string, number>;
}

/*
 * Real, quota-enforced limit keys (the same records the api enforces) with a
 * human label — used to show exactly which quotas shrink on the target plan.
 */
const LIMIT_LABELS: Array<[string, string]> = [
  ['projects.count', 'Projects'],
  ['workspaces.active', 'Active workspaces'],
  ['team.members', 'Team members'],
  ['ai.messages', 'AI messages / month'],
  ['storage.gb', 'Storage (GB)'],
];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    /*
     * Real data, the same sources the billing and upgrade pages use:
     *  - GET /orgs/:orgId/billing → the org's CURRENT (status-gated) plan + subscription.
     *  - GET /billing/:orgId      → the DB Plan catalog rows (real monthlyCents + limits).
     */
    const [billing, catalog] = await Promise.all([
      apiRequest<{
        plan: { key: string; name: string; monthlyCents: number };
        subscription?: { status?: string } | null;
      }>(request, `/orgs/${organization.id}/billing`),
      apiRequest<{
        plans: Array<{ key: string; name: string; monthlyCents: number; limits?: Record<string, number> }>;
      }>(request, `/billing/${organization.id}`),
    ]);

    const plans: CatalogPlan[] = catalog.plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      monthlyCents: plan.monthlyCents,
      limits: plan.limits ?? {},
    }));

    return json({
      plans,
      currentPlanKey: billing.plan.key,
      hasActiveSubscription: ACTIVE_SUBSCRIPTION_STATUSES.has(billing.subscription?.status ?? ''),
      billingAccessLimited: false,
    });
  } catch (error) {
    /*
     * Members without billing:read cannot see plan/price state; degrade to an
     * explanatory message instead of a hard 403. Re-auth redirects propagate.
     */
    if (isForbiddenApiResponse(error)) {
      return json({
        plans: [] as CatalogPlan[],
        currentPlanKey: null,
        hasActiveSubscription: false,
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
  const intent = String(form.get('intent') ?? '');
  const planKey = String(form.get('planKey') ?? 'free');

  try {
    /*
     * Downgrade-to-free and any change for an org with a live subscription go
     * through the Stripe billing portal (the checkout endpoint 409s otherwise).
     * Stripe schedules the downgrade at the end of the current billing period.
     */
    if (intent === 'portal' || planKey === 'free') {
      const portal = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: new URL('/billing', request.url).toString() }),
      });

      return redirect(portal.portalUrl);
    }

    // No active subscription: moving onto a paid plan goes through checkout.
    if (!CHECKOUTABLE_PLAN_KEYS.has(planKey)) {
      return json({ error: 'Choose a plan that supports self-serve checkout.' }, { status: 400 });
    }

    const checkout = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey,
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/downgrade', request.url).toString(),
      }),
    });

    return redirect(checkout.checkoutUrl);
  } catch (error) {
    /*
     * apiRequest throws a real 3xx redirect Response when the session expired or
     * MFA is required mid-action; those (and 5xx server errors) must be re-thrown
     * so the framework / error boundary handles them instead of the action
     * swallowing the redirect into a broken inline error.
     */
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'The subscription change is unavailable right now.') },
        { status: error.status },
      );
    }

    throw error;
  }
}

/* Limits that strictly shrink from the current plan to the target plan. */
function quotaReductions(current: CatalogPlan | undefined, target: CatalogPlan | undefined) {
  if (!current || !target) {
    return [] as Array<{ label: string; from: number; to: number }>;
  }

  return LIMIT_LABELS.flatMap(([key, label]) => {
    const from = current.limits[key];
    const to = target.limits[key];

    if (typeof from === 'number' && typeof to === 'number' && to < from) {
      return [{ label, from, to }];
    }

    return [];
  });
}

export default function DowngradePage() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const submitting = navigation.state === 'submitting';

  const current = useMemo(
    () => data.plans.find((plan) => plan.key === data.currentPlanKey),
    [data.plans, data.currentPlanKey],
  );

  /*
   * Downgrade targets: every catalog plan cheaper than the current one, plus the
   * free plan (cancellation). Sorted priciest-first so the closest downgrade is
   * on top.
   */
  const targets = useMemo(() => {
    const currentCents = current?.monthlyCents ?? Number.POSITIVE_INFINITY;

    return data.plans
      .filter((plan) => plan.key !== data.currentPlanKey && plan.monthlyCents < currentCents)
      .sort((a, b) => b.monthlyCents - a.monthlyCents);
  }, [data.plans, data.currentPlanKey, current]);

  const [selectedKey, setSelectedKey] = useState(() => targets[0]?.key ?? 'free');
  const target = useMemo(() => data.plans.find((plan) => plan.key === selectedKey), [data.plans, selectedKey]);

  if (data.billingAccessLimited) {
    return (
      <EnterpriseFormPage
        title="Downgrade"
        description="Review a lower plan before scheduling a subscription change."
        error={actionData?.error}
      >
        <p className="text-sm text-bolt-elements-textSecondary">
          Plan and price details are available to organization owners and billing administrators only. Ask an owner to
          change the plan, or check your role on the{' '}
          <Link to="/billing" className="underline">
            billing page
          </Link>
          .
        </p>
      </EnterpriseFormPage>
    );
  }

  if (targets.length === 0) {
    return (
      <EnterpriseFormPage
        title="Downgrade"
        description="Review a lower plan before scheduling a subscription change."
        error={actionData?.error}
      >
        <p className="text-sm text-bolt-elements-textSecondary">
          You&rsquo;re already on the lowest available plan
          {current ? <> ({current.name})</> : null}. There&rsquo;s nothing lower to move to. Manage your subscription on
          the{' '}
          <Link to="/billing" className="underline">
            billing page
          </Link>
          .
        </p>
      </EnterpriseFormPage>
    );
  }

  const priceDelta = current && target ? target.monthlyCents - current.monthlyCents : 0;
  const reductions = quotaReductions(current, target);
  const toFree = target?.key === 'free' || target?.monthlyCents === 0;

  return (
    <EnterpriseFormPage
      title="Downgrade"
      description="Prices and limits below come from the live billing catalog — the same records Stripe charges against."
      error={actionData?.error}
    >
      <Form method="post" reloadDocument className="space-y-5">
        <label className="grid gap-1.5 text-sm font-medium">
          <span className="text-bolt-elements-textPrimary">Downgrade to</span>
          <select
            name="planKey"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.currentTarget.value)}
            className="h-10 w-full max-w-xs rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
          >
            {targets.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {plan.name} — {plan.monthlyCents === 0 ? 'Free' : `${euros(plan.monthlyCents)}/mo`}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          {current && target ? (
            <>
              <p className="text-sm text-bolt-elements-textPrimary">
                <span className="font-medium">{current.name}</span>
                <span className="text-bolt-elements-textTertiary"> → </span>
                <span className="font-medium">{target.name}</span>
              </p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                {toFree ? (
                  <>You&rsquo;ll pay nothing, down from {euros(current.monthlyCents)}/mo.</>
                ) : (
                  <>
                    {euros(target.monthlyCents)}/mo, down from {euros(current.monthlyCents)}/mo
                    {priceDelta < 0 ? <> — you save {euros(Math.abs(priceDelta))}/mo</> : null}.
                  </>
                )}
              </p>

              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
                  What you lose
                </p>
                {reductions.length > 0 ? (
                  <ul className="mt-1.5 space-y-1 text-sm text-bolt-elements-textSecondary">
                    {reductions.map((row) => (
                      <li key={row.label}>
                        {row.label}: {formatUserAreaNumber(row.from)} → {formatUserAreaNumber(row.to)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-bolt-elements-textSecondary">
                    No quota reductions versus your current plan.
                  </p>
                )}
                {toFree ? (
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">
                    Paid-only features (priority support, higher limits) end when the change takes effect.
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-bolt-elements-textSecondary">Select a plan to preview the change.</p>
          )}
        </div>

        <p className="text-sm text-bolt-elements-textSecondary">
          {data.hasActiveSubscription ? (
            <>
              This opens the Stripe billing portal to confirm. Your current plan&rsquo;s features stay until the end of
              the current billing cycle, then the downgrade and any proration take effect.
            </>
          ) : (
            <>
              You don&rsquo;t have an active paid subscription, so starting a plan opens Stripe Checkout and begins
              immediately at the price shown.
            </>
          )}
        </p>

        {/* Active subscription (or moving to free) → billing portal; otherwise
            paid checkout. This mirrors the upgrade page so a downgrade never hits
            the checkout endpoint's 409-on-active-subscription guard. */}
        {data.hasActiveSubscription || toFree ? (
          <button
            type="submit"
            name="intent"
            value="portal"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Opening billing portal…' : 'Schedule change in billing portal'}
          </button>
        ) : (
          <button
            type="submit"
            name="planKey"
            value={selectedKey}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Opening checkout…' : 'Continue to checkout'}
          </button>
        )}
      </Form>
    </EnterpriseFormPage>
  );
}
