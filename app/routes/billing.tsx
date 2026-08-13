import { CreditCard, FileText, TrendingUp } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
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
import { userFacingLabel } from '~/lib/user-facing-labels';

type BillingData = {
  plan: { key: string; name: string; monthlyCents: number };
  subscription?: { status?: string; currentPeriodEnd?: string | null } | null;
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
  monthlyGrantCents?: number;
  blockExternalAi?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
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
  activePacks?: Array<{ id: string; remainingCents: number; expiresAt?: string | null }>;
  ledger?: Array<{ id: string; deltaCents: number; kind: string; reason?: string | null; createdAt?: string }>;
  packCatalog?: Array<{ id: string; label: string; creditCents: number; priceCents: number; validityDays: number }>;
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
  activePacks: [],
  ledger: [],
  packCatalog: [],
};

const BILLING_LOCALE = 'en-GB';
const BILLING_TIME_ZONE = 'UTC';

const euroFormatter = new Intl.NumberFormat(BILLING_LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const billingDateFormatter = new Intl.DateTimeFormat(BILLING_LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: BILLING_TIME_ZONE,
});

const billingDateTimeFormatter = new Intl.DateTimeFormat(BILLING_LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: BILLING_TIME_ZONE,
  timeZoneName: 'short',
});

export function formatEuro(cents: number): string {
  return euroFormatter.format(cents / 100);
}

export function billingDisplayLabel(value: string): string {
  return userFacingLabel(value);
}

const billingStatusLabel = (status?: string | null) => (status ? billingDisplayLabel(status) : 'No subscription');
const formatBillingDate = (value: string) => billingDateFormatter.format(new Date(value));
const formatBillingDateTime = (value: string) => billingDateTimeFormatter.format(new Date(value));

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

  /*
   * Derive the tone from the *raw* ratio using the same `>=` thresholds the
   * server enforces (evaluateSpendLimits: `spent >= cap`). Rounding first made
   * the UI claim 'limit reached / services paused' across the whole 99.5–99.99%
   * band (Math.round(99.5%) → 100) while the server had not actually paused
   * anything, and similarly mis-fired 'critical'/'warn' a half-percent early.
   * The rounded `pct` is used only for the bar width and the displayed label.
   */
  const ratio = spentCents / capCents;
  const tone: SpendTone = ratio >= 1 ? 'reached' : ratio >= 0.8 ? 'critical' : ratio >= 0.5 ? 'warn' : 'ok';
  const pct = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  return { tone, pct };
}

const SPEND_TONE_BAR: Record<SpendTone, string> = {
  none: 'bg-bolt-elements-borderColor',
  ok: 'bg-[var(--status-success-text)]',
  warn: 'bg-[var(--status-warning-text)]',
  critical: 'bg-[var(--status-error-text)]',
  reached: 'bg-[var(--status-error-bg)]',
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
          {formatEuro(spentCents)} of {formatEuro(capCents ?? 0)} used
        </span>
        <span className={tone === 'ok' ? '' : 'text-bolt-elements-textPrimary'}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Pay-as-you-go spend"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
      >
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

export const meta: MetaFunction = () => [{ title: 'Billing - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * Credits are a separate, lower-sensitivity read (member-level scope); never
   * let a credits failure break the billing page.
   */
  const creditsPromise = apiRequest<CreditsData>(request, `/orgs/${organization.id}/credits`).then(
    (credits) => ({ credits, unavailable: false as const }),
    () => ({ credits: EMPTY_CREDITS, unavailable: true as const }),
  );

  try {
    const billing = await apiRequest<BillingData>(request, `/orgs/${organization.id}/billing`);
    const creditsResult = await creditsPromise;

    return json({
      organization,
      billing,
      credits: creditsResult.credits,
      creditsUnavailable: creditsResult.unavailable,
      billingAccessLimited: false,
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      const creditsResult = await creditsPromise;

      return json({
        organization,
        billingAccessLimited: true,
        credits: creditsResult.credits,
        creditsUnavailable: creditsResult.unavailable,
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

  if (intent === 'ai-policy') {
    // Org admin toggle: block external AI-model integrations (BYOK) org-wide.
    const blockExternalAi = String(form.get('blockExternalAi') ?? '') === 'true';

    try {
      await apiRequest(request, `/orgs/${organization.id}/credits/ai-policy`, {
        method: 'POST',
        body: JSON.stringify({ blockExternalAi }),
      });
      return json({
        ok: blockExternalAi ? 'External AI integrations are now blocked.' : 'External AI integrations are allowed.',
      });
    } catch (error) {
      const message = isApiResponse(error)
        ? await apiErrorMessage(error, 'Could not update the AI policy.')
        : 'Could not update the AI policy. Please try again.';
      return json({ error: message }, { status: isApiResponse(error) ? error.status : 503 });
    }
  }

  if (intent === 'set-limits') {
    // Pay-as-you-go spend cap (Usage Limit). Empty = no cap; "0.01" restricts to credits.
    const raw = String(form.get('budgetCapDollars') ?? '').trim();
    const budgetCapCents = raw === '' ? null : Math.round(Number(raw) * 100);

    if (budgetCapCents != null && (!Number.isFinite(budgetCapCents) || budgetCapCents < 0)) {
      return json({ error: 'Enter a valid spend limit in euros (or leave blank for no cap).' }, { status: 400 });
    }

    /*
     * Reject a literal $0 cap. The server treats `spent >= budgetCapCents` so a
     * 0 cap silently blocks ALL pay-as-you-go spend, yet the billing UI renders
     * cap<=0 as 'uncapped / no limit set' — a direct contradiction. There is no
     * UI affordance for 0: 'no cap' is the blank field (→ null) and the
     * documented minimum is $0.01 (restrict to credits). Force the user to pick
     * one instead of POSTing a value the page then misreports.
     */
    if (budgetCapCents === 0) {
      return json(
        {
          error:
            'A €0 cap blocks all usage-based spend. Leave blank for no cap, or enter €0.01 to restrict to credits.',
        },
        { status: 400 },
      );
    }

    // Service Shutdown Limit (hard stop — suspends usage-based services when hit).
    const rawShutdown = String(form.get('serviceShutdownDollars') ?? '').trim();
    const serviceShutdownCents = rawShutdown === '' ? null : Math.round(Number(rawShutdown) * 100);

    if (serviceShutdownCents != null && (!Number.isFinite(serviceShutdownCents) || serviceShutdownCents < 0)) {
      return json({ error: 'Enter a valid service-shutdown limit in euros (or leave blank).' }, { status: 400 });
    }

    try {
      await apiRequest(request, `/orgs/${organization.id}/credits/limits`, {
        method: 'POST',
        body: JSON.stringify({ budgetCapCents, serviceShutdownCents }),
      });
      return json({ ok: 'Spend limit updated.' });
    } catch (error) {
      const message = isApiResponse(error)
        ? await apiErrorMessage(error, 'Could not update the spend limit.')
        : 'Could not update the spend limit. Please try again.';
      return json({ error: message }, { status: isApiResponse(error) ? error.status : 503 });
    }
  }

  if (intent === 'buy-credits') {
    /*
     * Replit-parity credit-pack purchase → one-time Stripe Checkout. The pack is
     * granted by the checkout.session.completed webhook. 503 CREDIT_PACKS_DISABLED
     * while the credit model is dormant is surfaced as a friendly message.
     */
    const packId = String(form.get('packId') ?? '').trim();

    if (!packId) {
      return json({ error: 'Choose a credit pack to purchase.' }, { status: 400 });
    }

    try {
      const result = await apiRequest<{ checkoutUrl: string }>(
        request,
        `/orgs/${organization.id}/credits/packs/checkout`,
        {
          method: 'POST',
          body: JSON.stringify({
            packId,
            successUrl: new URL('/billing?purchase=success', request.url).toString(),
            cancelUrl: new URL('/billing', request.url).toString(),
          }),
        },
      );
      return redirect(result.checkoutUrl);
    } catch (error) {
      const message = isApiResponse(error)
        ? await apiErrorMessage(
            error,
            error.status === 503
              ? 'Credit-pack purchases are not available yet.'
              : 'Could not start the credit-pack purchase.',
          )
        : 'Could not start the credit-pack purchase. Please try again.';
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
  const { billing, credits, creditsUnavailable, billingAccessLimited } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string; ok?: string } | undefined;
  const revalidator = useRevalidator();
  const retryingCredits = revalidator.state !== 'idle';

  /*
   * Disable every checkout/portal button while any submission is in flight so a
   * slow redirect to Stripe can't be double-clicked into duplicate sessions, and
   * surface a pending label on the specific button the user pressed.
   */
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle';
  const submittingPlanKey = submitting ? navigation.formData?.get('planKey') : null;
  const submittingPortal = submitting && navigation.formData?.get('intent') === 'portal';

  const submittingPackId =
    submitting && navigation.formData?.get('intent') === 'buy-credits' ? navigation.formData?.get('packId') : null;

  // Included-credit burndown and the billing-cycle window.
  const monthlyGrantCents = credits.monthlyGrantCents ?? 0;

  const includedUsedCents =
    monthlyGrantCents > 0 ? Math.max(0, Math.min(monthlyGrantCents, monthlyGrantCents - credits.balanceCents)) : 0;
  const cycleLabel =
    credits.periodStart && credits.periodEnd
      ? `${formatBillingDate(credits.periodStart)} - ${formatBillingDate(credits.periodEnd)} (UTC)`
      : null;
  const overviewStats = [
    {
      label: 'Current plan',
      value: billing.plan.name,
      detail: `${formatEuro(billing.plan.monthlyCents)} per month`,
      icon: CreditCard,
    },
    {
      label: 'Billing state',
      value: billingStatusLabel(billing.subscription?.status),
      detail: billing.subscription?.currentPeriodEnd
        ? `Current period ends ${formatBillingDate(billing.subscription.currentPeriodEnd)} (UTC)`
        : 'Subscription and renewal status',
      icon: TrendingUp,
    },
    {
      label: 'Usage events',
      value: String(billing.usage.length),
      detail: 'Actions counted in this billing period',
      icon: TrendingUp,
    },
    {
      label: 'Upgrade options',
      value: String(billing.upgradePrompts.length),
      detail: billing.upgradePrompts.length ? 'Plans available for your organization' : 'Your current plan fits',
      icon: FileText,
    },
  ];
  const creditStats = [
    {
      label: 'Credit balance',
      value: formatEuro(credits.balanceCents),
      detail:
        monthlyGrantCents > 0
          ? `${formatEuro(includedUsedCents)} of ${formatEuro(monthlyGrantCents)} included used`
          : 'Included monthly credits',
      icon: CreditCard,
    },
    {
      label: 'Credit packs',
      value: formatEuro(credits.packBalanceCents),
      detail: 'Purchased, earliest-expiry first',
      icon: CreditCard,
    },
    {
      label: 'Total available',
      value: formatEuro(credits.totalAvailableCents),
      detail: 'Balance + active packs',
      icon: TrendingUp,
    },
    {
      label: 'Budget cap',
      value: credits.budgetCapCents != null ? formatEuro(credits.budgetCapCents) : 'None',
      detail: 'Pay-as-you-go spend limit',
      icon: FileText,
    },
  ];
  const mobileFinancialSummary = [
    {
      label: 'Current plan',
      value: billing.plan.name,
      detail: billingStatusLabel(billing.subscription?.status),
    },
    {
      label: 'Monthly price',
      value: formatEuro(billing.plan.monthlyCents),
      detail: 'per month',
    },
    {
      label: 'Available balance',
      value: creditsUnavailable ? 'Unavailable' : formatEuro(credits.totalAvailableCents),
      detail: creditsUnavailable ? 'Could not load credit balance' : 'credits and packs',
    },
    {
      label: 'Spend limit',
      value: creditsUnavailable
        ? 'Unavailable'
        : credits.budgetCapCents != null
          ? formatEuro(credits.budgetCapCents)
          : 'No limit',
      detail: creditsUnavailable ? 'Could not load spend limit' : 'pay as you go',
    },
  ];

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
        {['PAST_DUE', 'UNPAID', 'past_due', 'unpaid'].includes(billing.subscription?.status ?? '') ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 text-sm"
            style={{
              background: 'color-mix(in srgb, var(--vc-ide-accent-error) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--vc-ide-accent-error) 40%, transparent)',
            }}
          >
            <div style={{ color: 'var(--status-error-text)' }}>
              <p className="font-semibold">
                Your last payment failed. Update your payment method to keep services running.
              </p>
              {billing.subscription?.currentPeriodEnd ? (
                <p className="mt-0.5 text-xs">
                  Services pause on {formatBillingDate(billing.subscription.currentPeriodEnd)} (UTC).
                </p>
              ) : null}
            </div>
            <Link
              to="/payment-method"
              className="inline-flex h-[44px] shrink-0 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              Update payment method
            </Link>
          </div>
        ) : null}
        {billingAccessLimited || actionData?.error ? (
          <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-text)]">
            {actionData?.error ?? 'Billing is available only to organization owners or billing administrators.'}
          </div>
        ) : null}
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 sm:hidden">
          {mobileFinancialSummary.map((item, index) => (
            <div
              key={item.label}
              className={`min-w-0 p-4 ${index % 2 === 0 ? 'border-r border-bolt-elements-borderColor' : ''} ${
                index < 2 ? 'border-b border-bolt-elements-borderColor' : ''
              }`}
            >
              <dt className="text-xs text-bolt-elements-textSecondary">{item.label}</dt>
              <dd className="mt-1 truncate text-base font-semibold text-bolt-elements-textPrimary" title={item.value}>
                {item.value}
              </dd>
              <dd className="mt-0.5 truncate text-[11px] text-bolt-elements-textSecondary" title={item.detail}>
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
        <div className="hidden sm:block">
          <StatGrid stats={overviewStats} />
        </div>
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Credits &amp; usage</h2>
              <p className="text-sm text-bolt-elements-textSecondary">
                Your included credits, purchased packs and effort-based agent usage.
              </p>
            </div>
            {!creditsUnavailable && credits.shadow ? (
              <span className="shrink-0 whitespace-nowrap rounded-full bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-medium text-[var(--status-warning-text)]">
                Preview (not charged)
              </span>
            ) : null}
          </div>
          {creditsUnavailable ? (
            retryingCredits ? (
              <AsyncPanelSkeleton label="Loading credits and usage" rows={4} compact />
            ) : (
              <AsyncPanelError
                title="Credits and usage could not load"
                description="Subscription details remain available, but balances and spend controls are hidden to avoid showing stale values."
                onRetry={revalidator.revalidate}
                compact
              />
            )
          ) : (
            <>
              <div className="hidden sm:block">
                <StatGrid stats={creditStats} />
              </div>
              <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Spend limit (pay-as-you-go)</h3>
                  {cycleLabel ? (
                    <span className="text-xs text-bolt-elements-textSecondary">Billing period: {cycleLabel}</span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-bolt-elements-textSecondary">
                  Cap usage-based spend beyond your included credits. Leave blank for no cap; set €0.01 to restrict to
                  credits only. Org limits are set in €500 increments.
                </p>
                {!credits.creditsEnabled ? (
                  <p className="mb-3 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-2 text-xs text-[var(--status-warning-text)]">
                    Usage-based billing isn&apos;t enabled for this organization yet — limits you set here apply once it
                    is.
                  </p>
                ) : null}
                <SpendUsageIndicator
                  spentCents={credits.paygSpentCents ?? 0}
                  capCents={credits.budgetCapCents}
                  thresholds={credits.spendAlertThresholds ?? [50, 80, 100]}
                />
                {actionData?.ok ? (
                  <div className="mb-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-2 text-xs text-[var(--status-success-text)]">
                    {actionData.ok}
                  </div>
                ) : null}
                <Form method="post" className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="intent" value="set-limits" />
                  <span className="text-sm text-bolt-elements-textSecondary">€</span>
                  <input
                    type="number"
                    name="budgetCapDollars"
                    min="0"
                    step="any"
                    defaultValue={credits.budgetCapCents != null ? (credits.budgetCapCents / 100).toString() : ''}
                    placeholder="No cap"
                    aria-label="Spend limit in euros"
                    title="Set in €500 increments, or €0.01 to cap spend at your current credits."
                    className="h-[44px] w-36 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary"
                  />
                  <span className="w-full text-[11px] text-bolt-elements-textSecondary sm:w-auto">
                    €500 increments (or €0.01 to cap at credits)
                  </span>
                  <span className="w-full text-sm text-bolt-elements-textSecondary sm:ml-2 sm:w-auto">Hard stop €</span>
                  <input
                    type="number"
                    name="serviceShutdownDollars"
                    min="0"
                    step="any"
                    defaultValue={
                      credits.serviceShutdownCents != null ? (credits.serviceShutdownCents / 100).toString() : ''
                    }
                    placeholder="No hard stop"
                    aria-label="Service shutdown limit in euros"
                    title="Service Shutdown Limit — suspends usage-based services when reached (no grace)."
                    className="h-[44px] w-36 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm text-bolt-elements-textPrimary"
                  />
                  <Button type="submit" variant="outline" disabled={submitting} className="min-h-[44px]">
                    {submitting && navigation.formData?.get('intent') === 'set-limits' ? 'Saving…' : 'Save limit'}
                  </Button>
                </Form>
              </div>
              <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-bolt-elements-textPrimary">External AI integrations</h3>
                    <p className="text-xs text-bolt-elements-textSecondary">
                      {credits.blockExternalAi
                        ? 'Blocked — members use managed keys only; bring-your-own OpenAI/Anthropic keys are disabled org-wide.'
                        : 'Allowed — eligible members may use their own external AI-model keys.'}
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="intent" value="ai-policy" />
                    <input type="hidden" name="blockExternalAi" value={credits.blockExternalAi ? 'false' : 'true'} />
                    <Button type="submit" variant="outline" disabled={submitting} className="min-h-[44px]">
                      {submitting && navigation.formData?.get('intent') === 'ai-policy'
                        ? 'Saving…'
                        : credits.blockExternalAi
                          ? 'Allow external AI'
                          : 'Block external AI'}
                    </Button>
                  </Form>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Buy credits</h3>
                  {credits.activePacks && credits.activePacks.length ? (
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {credits.activePacks.length} active pack{credits.activePacks.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-bolt-elements-textSecondary">
                  Pre-paid credit packs remain available for the validity period shown below. Packs with the nearest
                  expiry are used first, before pay-as-you-go charges apply.
                </p>
                {!credits.creditsEnabled ? (
                  <p className="mb-3 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-2 text-xs text-[var(--status-warning-text)]">
                    Credit-pack purchases are not enabled for this organization yet.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(credits.packCatalog ?? []).map((pack) => {
                    const discount = Math.max(0, pack.creditCents - pack.priceCents);

                    return (
                      <Form key={pack.id} method="post" reloadDocument className="contents">
                        <input type="hidden" name="intent" value="buy-credits" />
                        <input type="hidden" name="packId" value={pack.id} />
                        <button
                          type="submit"
                          disabled={submitting || !credits.creditsEnabled}
                          aria-label={`Buy ${formatEuro(pack.creditCents)} credit pack for ${formatEuro(pack.priceCents)}, valid for ${pack.validityDays} days`}
                          className="flex flex-col items-start gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-left transition-colors hover:border-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="text-base font-semibold text-bolt-elements-textPrimary">
                            {formatEuro(pack.creditCents)}
                          </span>
                          <span className="text-xs text-bolt-elements-textSecondary">
                            {discount > 0 ? (
                              <>
                                Pay {formatEuro(pack.priceCents)}{' '}
                                <span className="text-[var(--status-success-text)]">save {formatEuro(discount)}</span>
                              </>
                            ) : (
                              <>Pay {formatEuro(pack.priceCents)}</>
                            )}
                          </span>
                          <span className="text-[11px] text-bolt-elements-textSecondary">
                            Valid for {pack.validityDays} days
                          </span>
                          <span className="mt-1 text-[11px] font-medium text-[var(--vc-ide-accent-action)]">
                            {submittingPackId === pack.id ? 'Redirecting…' : 'Buy credits'}
                          </span>
                        </button>
                      </Form>
                    );
                  })}
                </div>
                {credits.activePacks && credits.activePacks.length ? (
                  <ul className="mt-3 space-y-1">
                    {credits.activePacks.map((pack) => (
                      <li
                        key={pack.id}
                        className="flex items-center justify-between text-xs text-bolt-elements-textSecondary"
                      >
                        <span>{formatEuro(pack.remainingCents)} remaining</span>
                        <span>
                          {pack.expiresAt
                            ? `Expires ${formatBillingDate(pack.expiresAt)} (UTC)`
                            : 'Expiration date unavailable'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {credits.ledger && credits.ledger.length ? (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Credit history</h3>
                  <ActivityList
                    items={credits.ledger.slice(0, 8).map((entry) => ({
                      title: `${entry.deltaCents >= 0 ? '+' : '-'}${formatEuro(Math.abs(entry.deltaCents))} - ${billingDisplayLabel(entry.kind)}`,
                      detail: `${entry.reason ?? ''}${entry.createdAt ? ` · ${formatBillingDateTime(entry.createdAt)}` : ''}`,
                      icon: CreditCard,
                    }))}
                  />
                </div>
              ) : null}
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">Recent agent checkpoints</h3>
                <ActivityList
                  items={
                    credits.checkpoints.length
                      ? credits.checkpoints.slice(0, 8).map((cp) => ({
                          title: `${formatEuro(cp.creditCents)} - ${billingDisplayLabel(cp.buildTier)}${cp.highPowerModel ? ' · High-power model' : ''}${
                            cp.extendedThinking ? ' · Extended thinking' : ''
                          }${cp.turboMode ? ' · Turbo' : ''}`,
                          detail: `${billingDisplayLabel(cp.status)} · ${formatBillingDateTime(cp.startedAt)}`,
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
            </>
          )}
        </section>
        {!billingAccessLimited ? (
          <div className="flex flex-wrap gap-3">
            {billing.upgradePrompts.map((plan) => (
              <Form key={plan.planKey} method="post" reloadDocument>
                <input type="hidden" name="planKey" value={plan.planKey} />
                <Button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submittingPlanKey === plan.planKey}
                  className="min-h-[44px]"
                >
                  {submittingPlanKey === plan.planKey ? 'Redirecting…' : `Upgrade to ${plan.name}`}
                </Button>
              </Form>
            ))}
            <Form method="post" reloadDocument>
              <input type="hidden" name="intent" value="portal" />
              <Button
                type="submit"
                variant="outline"
                disabled={submitting}
                aria-busy={submittingPortal}
                className="min-h-[44px]"
              >
                {submittingPortal ? 'Redirecting…' : 'Open customer portal'}
              </Button>
            </Form>
          </div>
        ) : null}
        <ActivityList
          items={
            billing.usage.length
              ? billing.usage.slice(0, 8).map((event) => ({
                  title: billingDisplayLabel(event.type),
                  detail: `${new Intl.NumberFormat(BILLING_LOCALE).format(event.quantity)} · ${
                    event.createdAt ? formatBillingDateTime(event.createdAt) : 'Recorded'
                  }`,
                  icon: TrendingUp,
                }))
              : [
                  {
                    title: 'No usage events yet',
                    detail: 'Your billable activity will appear here as it is recorded.',
                    icon: TrendingUp,
                  },
                ]
          }
        />
      </div>
    </AppShell>
  );
}
