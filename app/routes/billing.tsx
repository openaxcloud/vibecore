import type { MetaFunction } from '@remix-run/cloudflare';
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react';
import { CreditCard, FileText, TrendingUp } from 'lucide-react';
import { ActivityList, AppShell, LinkButton, StatGrid } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import {
  apiRequest,
  apiErrorMessage,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

type BillingData = {
  plan: { key: string; name: string; monthlyCents: number };
  subscription?: { status?: string } | null;
  usage: Array<{ id: string; type: string; quantity: number; createdAt?: string }>;
  upgradePrompts: Array<{ planKey: string; name: string }>;
};

type CreditsData = {
  creditsEnabled: boolean;
  shadow: boolean;
  balanceCents: number;
  packBalanceCents: number;
  totalAvailableCents: number;
  budgetCapCents: number | null;
  serviceShutdownCents: number | null;
  paygSpentCents?: number;
  spendAlertThresholds?: number[];
  checkpoints: Array<{
    id: string;
    creditCents: number;
    status: string;
    highPowerModel: boolean;
    extendedThinking: boolean;
    turboMode: boolean;
    buildTier: string;
    startedAt: string;
  }>;
};

const EMPTY_CREDITS: CreditsData = {
  creditsEnabled: false,
  shadow: false,
  balanceCents: 0,
  packBalanceCents: 0,
  totalAvailableCents: 0,
  budgetCapCents: null,
  serviceShutdownCents: null,
  paygSpentCents: 0,
  spendAlertThresholds: [50, 80, 100],
  checkpoints: [],
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type SpendTone = 'none' | 'ok' | 'warn' | 'critical' | 'reached';

/**
 * Pure: resolve the in-app spend-vs-cap state. Mirrors the server-side
 * 50/80/100% email-alert ladder so the UI and the emails agree. Exported for
 * unit testing. `capCents == null` → no cap configured.
 */
export function spendUsageState(
  spentCents: number,
  capCents: number | null | undefined,
): { tone: SpendTone; pct: number } {
  if (capCents == null || capCents <= 0) {
    return { tone: 'none', pct: 0 };
  }

  const pct = Math.min(100, Math.max(0, Math.round((spentCents / capCents) * 100)));
  const tone: SpendTone = pct >= 100 ? 'reached' : pct >= 80 ? 'critical' : pct >= 50 ? 'warn' : 'ok';

  return { tone, pct };
}

const SPEND_TONE_BAR: Record<SpendTone, string> = {
  none: 'bg-bolt-elements-borderColor',
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  critical: 'bg-red-500',
  reached: 'bg-red-600',
};

function SpendUsageIndicator({
  spentCents,
  capCents,
  thresholds,
}: {
  spentCents: number;
  capCents: number | null;
  thresholds: number[];
}) {
  const { tone, pct } = spendUsageState(spentCents, capCents);

  if (tone === 'none') {
    return (
      <p className="mb-3 text-xs text-bolt-elements-textSecondary">
        No usage limit set — usage-based spend is uncapped.
      </p>
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-bolt-elements-textSecondary">
        <span>
          {dollars(spentCents)} of {dollars(capCents ?? 0)} used
        </span>
        <span className={tone === 'ok' ? '' : 'text-bolt-elements-textPrimary'}>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1">
        <div className={`h-full ${SPEND_TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-bolt-elements-textSecondary">
        {tone === 'reached'
          ? 'Usage limit reached — usage-based services are paused until you raise it.'
          : `We'll email you at ${thresholds.join('% / ')}% of your limit.`}
      </p>
    </div>
  );
}

async function billingActionErrorMessage(error: Response, fallback: string) {
  const message = await apiErrorMessage(error, fallback);

  return message && message !== 'Internal server error' && message !== 'Request failed' ? message : fallback;
}

export const meta: MetaFunction = () => [{ title: 'Billing - VibeCore' }];
export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * Credits are a separate, lower-sensitivity read (member-level scope); never
   * let a credits failure break the billing page.
   */
  const creditsPromise = apiRequest<CreditsData>(request, `/orgs/${organization.id}/credits`).catch(
    () => EMPTY_CREDITS,
  );

  try {
    const billing = await apiRequest<BillingData>(request, `/orgs/${organization.id}/billing`);
    const credits = await creditsPromise;

    return json({ organization, billing, credits, billingAccessLimited: false });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({
        organization,
        billingAccessLimited: true,
        credits: await creditsPromise,
        billing: {
          plan: { key: 'unavailable', name: 'Unavailable', monthlyCents: 0 },
          subscription: null,
          usage: [],
          upgradePrompts: [],
        } satisfies BillingData,
      });
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'checkout');

  if (intent === 'set-limits') {
    // Pay-as-you-go spend cap (Usage Limit). Empty = no cap; "0.01" restricts to credits.
    const raw = String(form.get('budgetCapDollars') ?? '').trim();
    const budgetCapCents = raw === '' ? null : Math.round(Number(raw) * 100);

    if (budgetCapCents != null && (!Number.isFinite(budgetCapCents) || budgetCapCents < 0)) {
      return json({ error: 'Enter a valid spend limit in dollars (or leave blank for no cap).' }, { status: 400 });
    }

    try {
      await apiRequest(request, `/orgs/${organization.id}/credits/limits`, {
        method: 'POST',
        body: JSON.stringify({ budgetCapCents }),
      });
      return json({ ok: 'Spend limit updated.' });
    } catch (error) {
      const message = isApiResponse(error)
        ? await apiErrorMessage(error, 'Could not update the spend limit.')
        : 'Could not update the spend limit. Please try again.';
      return json({ error: message }, { status: isApiResponse(error) ? error.status : 503 });
    }
  }

  if (intent === 'portal') {
    try {
      const result = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: new URL('/billing', request.url).toString() }),
      });
      return redirect(result.portalUrl);
    } catch (error) {
      if (isApiResponse(error)) {
        const message = await billingActionErrorMessage(
          error,
          error.status >= 500
            ? 'The billing portal is temporarily unavailable. Please try again in a moment.'
            : 'You cannot manage billing for this organization.',
        );

        return json({ error: message }, { status: error.status });
      }

      /*
       * Non-Response error: the upstream fetch timed out (apiRequest's 30s
       * AbortSignal) or the billing service was unreachable. Re-throwing here
       * surfaced a raw 502 "Internal server error" on the portal button. Degrade
       * to a friendly message so the control always has a visible effect.
       */
      console.error('billing portal request failed:', error);

      return json(
        { error: 'The billing portal is temporarily unavailable. Please try again in a moment.' },
        { status: 503 },
      );
    }
  }

  try {
    const result = await apiRequest<{ checkoutUrl: string }>(request, `/orgs/${organization.id}/billing/checkout`, {
      method: 'POST',
      body: JSON.stringify({
        planKey: String(form.get('planKey') ?? 'pro'),
        successUrl: new URL('/billing', request.url).toString(),
        cancelUrl: new URL('/billing', request.url).toString(),
      }),
    });

    return redirect(result.checkoutUrl);
  } catch (error) {
    if (isApiResponse(error)) {
      /*
       * 4xx carries an actionable client message (already subscribed, free plan
       * has no checkout, …) so surface it. 5xx can also carry a specific Stripe
       * configuration error; keep that, but fall back when the upstream only
       * returns a generic internal error.
       */
      const message = await billingActionErrorMessage(
        error,
        error.status >= 500
          ? 'Billing checkout is temporarily unavailable. Please try again in a moment.'
          : 'Billing checkout is unavailable. Please try again later.',
      );

      return json({ error: message }, { status: error.status });
    }

    /*
     * Non-Response error: the upstream fetch timed out (apiRequest's 30s
     * AbortSignal) or the billing service was unreachable — e.g. the api hangs
     * creating the Stripe checkout session. Re-throwing here surfaced a raw 502
     * "Internal server error" on the Upgrade button. Degrade to a friendly
     * message so the button always has a visible effect instead of breaking.
     */
    console.error('billing checkout request failed:', error);

    return json(
      { error: 'Billing checkout is temporarily unavailable. Please try again in a moment.' },
      { status: 503 },
    );
  }
}

export default function BillingPage() {
  const { billing, credits, billingAccessLimited } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string; ok?: string } | undefined;

  /*
   * Disable every checkout/portal button while any submission is in flight so a
   * slow redirect to Stripe can't be double-clicked into duplicate sessions, and
   * surface a pending label on the specific button the user pressed.
   */
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';
  const submittingPlanKey = submitting ? navigation.formData?.get('planKey') : null;
  const submittingPortal = submitting && navigation.formData?.get('intent') === 'portal';

  return (
    <AppShell
      title="Billing overview"
      description="Manage subscription state, checkout, customer portal access, invoices and metered usage."
      actions={
        <>
          <LinkButton to="/upgrade">Upgrade</LinkButton>
          <LinkButton to="/payment-method" variant="outline">
            Payment method
          </LinkButton>
        </>
      }
    >
      <div className="grid gap-6">
        {billingAccessLimited || actionData?.error ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {actionData?.error ?? 'Billing is available only to organization owners or billing administrators.'}
          </div>
        ) : null}
        <StatGrid
          stats={[
            {
              label: 'Current plan',
              value: billing.plan.name,
              detail: `$${(billing.plan.monthlyCents / 100).toFixed(0)} per month`,
              icon: CreditCard,
            },
            {
              label: 'Billing state',
              value: billing.subscription?.status ?? 'No subscription',
              detail: 'Loaded from backend billing state',
              icon: TrendingUp,
            },
            {
              label: 'Usage events',
              value: String(billing.usage.length),
              detail: 'Metered usage ledger records actions',
              icon: TrendingUp,
            },
            {
              label: 'Upgrade options',
              value: String(billing.upgradePrompts.length),
              detail: 'Plan access controlled by backend',
              icon: FileText,
            },
          ]}
        />
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Credits &amp; usage</h2>
              <p className="text-sm text-bolt-elements-textSecondary">
                Your included credits, purchased packs and effort-based agent usage.
              </p>
            </div>
            {credits.shadow ? (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
                Preview (not charged)
              </span>
            ) : null}
          </div>
          <StatGrid
            stats={[
              {
                label: 'Credit balance',
                value: dollars(credits.balanceCents),
                detail: 'Included monthly credits',
                icon: CreditCard,
              },
              {
                label: 'Credit packs',
                value: dollars(credits.packBalanceCents),
                detail: 'Purchased, earliest-expiry first',
                icon: CreditCard,
              },
              {
                label: 'Total available',
                value: dollars(credits.totalAvailableCents),
                detail: 'Balance + active packs',
                icon: TrendingUp,
              },
              {
                label: 'Budget cap',
                value: credits.budgetCapCents != null ? dollars(credits.budgetCapCents) : 'None',
                detail: 'Pay-as-you-go spend limit',
                icon: FileText,
              },
            ]}
          />
          <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Spend limit (pay-as-you-go)</h3>
            <p className="mb-3 text-xs text-bolt-elements-textSecondary">
              Cap usage-based spend beyond your included credits. Leave blank for no cap; set $0.01 to restrict to
              credits only. Org limits are set in $500 increments.
            </p>
            <SpendUsageIndicator
              spentCents={credits.paygSpentCents ?? 0}
              capCents={credits.budgetCapCents}
              thresholds={credits.spendAlertThresholds ?? [50, 80, 100]}
            />
            {actionData?.ok ? (
              <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-300">
                {actionData.ok}
              </div>
            ) : null}
            <Form method="post" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="intent" value="set-limits" />
              <span className="text-sm text-bolt-elements-textSecondary">$</span>
              <input
                type="number"
                name="budgetCapDollars"
                min="0"
                step="0.01"
                defaultValue={credits.budgetCapCents != null ? (credits.budgetCapCents / 100).toString() : ''}
                placeholder="No cap"
                aria-label="Spend limit in dollars"
                className="w-32 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-sm text-bolt-elements-textPrimary"
              />
              <Button type="submit" variant="outline" disabled={submitting}>
                {submitting && navigation.formData?.get('intent') === 'set-limits' ? 'Saving…' : 'Save limit'}
              </Button>
            </Form>
          </div>
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Recent agent checkpoints</h3>
            <ActivityList
              items={
                credits.checkpoints.length
                  ? credits.checkpoints.slice(0, 8).map((cp) => ({
                      title: `${dollars(cp.creditCents)} — ${cp.buildTier}${cp.highPowerModel ? ' · high-power' : ''}${
                        cp.extendedThinking ? ' · extended-thinking' : ''
                      }${cp.turboMode ? ' · turbo' : ''}`,
                      detail: `${cp.status} · ${new Date(cp.startedAt).toLocaleString()}`,
                      icon: TrendingUp,
                    }))
                  : [
                      {
                        title: 'No agent checkpoints yet',
                        detail: 'Each agent request records one effort-based checkpoint with its credit cost.',
                        icon: TrendingUp,
                      },
                    ]
              }
            />
          </div>
        </section>
        {!billingAccessLimited ? (
          <div className="flex flex-wrap gap-3">
            {billing.upgradePrompts.map((plan) => (
              <Form key={plan.planKey} method="post" reloadDocument>
                <input type="hidden" name="planKey" value={plan.planKey} />
                <Button type="submit" disabled={submitting} aria-busy={submittingPlanKey === plan.planKey}>
                  {submittingPlanKey === plan.planKey ? 'Redirecting…' : `Upgrade to ${plan.name}`}
                </Button>
              </Form>
            ))}
            <Form method="post" reloadDocument>
              <input type="hidden" name="intent" value="portal" />
              <Button type="submit" variant="outline" disabled={submitting} aria-busy={submittingPortal}>
                {submittingPortal ? 'Redirecting…' : 'Open customer portal'}
              </Button>
            </Form>
          </div>
        ) : null}
        <ActivityList
          items={
            billing.usage.length
              ? billing.usage.slice(0, 8).map((event) => ({
                  title: event.type,
                  detail: `${event.quantity} - ${event.createdAt ? new Date(event.createdAt).toLocaleString() : 'recorded'}`,
                  icon: TrendingUp,
                }))
              : [
                  {
                    title: 'No usage events yet',
                    detail: 'Backend usage events will appear here after quota-protected actions.',
                    icon: TrendingUp,
                  },
                ]
          }
        />
      </div>
    </AppShell>
  );
}
