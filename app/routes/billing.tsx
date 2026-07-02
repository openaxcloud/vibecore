import { CreditCard, FileText, TrendingUp } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, useActionData, useLoaderData, useNavigation } from 'react-router';
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
  monthlyGrantCents?: number;
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

export const meta: MetaFunction = () => [{ title: 'Billing - E-Code' }];
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
            'A $0 cap blocks all usage-based spend. Leave blank for no cap, or enter $0.01 to restrict to credits.',
        },
        { status: 400 },
      );
    }

    // Service Shutdown Limit (hard stop — suspends usage-based services when hit).
    const rawShutdown = String(form.get('serviceShutdownDollars') ?? '').trim();
    const serviceShutdownCents = rawShutdown === '' ? null : Math.round(Number(rawShutdown) * 100);

    if (serviceShutdownCents != null && (!Number.isFinite(serviceShutdownCents) || serviceShutdownCents < 0)) {
      return json({ error: 'Enter a valid service-shutdown limit in dollars (or leave blank).' }, { status: 400 });
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

  const submittingPackId =
    submitting && navigation.formData?.get('intent') === 'buy-credits' ? navigation.formData?.get('packId') : null;

  // Included-credit burndown ("$X of $Y used this cycle") + the billing-cycle window.
  const monthlyGrantCents = credits.monthlyGrantCents ?? 0;

  const includedUsedCents =
    monthlyGrantCents > 0 ? Math.max(0, Math.min(monthlyGrantCents, monthlyGrantCents - credits.balanceCents)) : 0;
  const cycleLabel =
    credits.periodStart && credits.periodEnd
      ? `${new Date(credits.periodStart).toLocaleDateString()} – ${new Date(credits.periodEnd).toLocaleDateString()}`
      : null;

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
                detail:
                  monthlyGrantCents > 0
                    ? `${dollars(includedUsedCents)} of ${dollars(monthlyGrantCents)} included used`
                    : 'Included monthly credits',
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
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Spend limit (pay-as-you-go)</h3>
              {cycleLabel ? (
                <span className="text-xs text-bolt-elements-textSecondary">Billing period: {cycleLabel}</span>
              ) : null}
            </div>
            <p className="mb-3 text-xs text-bolt-elements-textSecondary">
              Cap usage-based spend beyond your included credits. Leave blank for no cap; set $0.01 to restrict to
              credits only. Org limits are set in $500 increments.
            </p>
            {!credits.creditsEnabled ? (
              <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
                Usage-based billing isn&apos;t enabled for this organization yet — limits you set here apply once it is.
              </p>
            ) : null}
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
                step="any"
                defaultValue={credits.budgetCapCents != null ? (credits.budgetCapCents / 100).toString() : ''}
                placeholder="No cap"
                aria-label="Spend limit in dollars"
                title="Set in $500 increments, or $0.01 to cap spend at your current credits."
                className="w-32 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-sm text-bolt-elements-textPrimary"
              />
              <span className="w-full text-[11px] text-bolt-elements-textSecondary sm:w-auto">
                $500 increments (or $0.01 to cap at credits)
              </span>
              <span className="w-full text-sm text-bolt-elements-textSecondary sm:ml-2 sm:w-auto">Hard stop $</span>
              <input
                type="number"
                name="serviceShutdownDollars"
                min="0"
                step="any"
                defaultValue={
                  credits.serviceShutdownCents != null ? (credits.serviceShutdownCents / 100).toString() : ''
                }
                placeholder="No hard stop"
                aria-label="Service shutdown limit in dollars"
                title="Service Shutdown Limit — suspends usage-based services when reached (no grace)."
                className="w-32 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-sm text-bolt-elements-textPrimary"
              />
              <Button type="submit" variant="outline" disabled={submitting}>
                {submitting && navigation.formData?.get('intent') === 'set-limits' ? 'Saving…' : 'Save limit'}
              </Button>
            </Form>
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
              Pre-paid credit packs never expire for 6 months and are spent earliest-expiry-first, before your monthly
              credits run to pay-as-you-go.
            </p>
            {!credits.creditsEnabled ? (
              <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
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
                      aria-label={`Buy ${dollars(pack.creditCents)} credit pack for ${dollars(pack.priceCents)}`}
                      className="flex flex-col items-start gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-left transition-colors hover:border-[var(--ecode-accent,#F26207)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="text-base font-semibold text-bolt-elements-textPrimary">
                        {dollars(pack.creditCents)}
                      </span>
                      <span className="text-xs text-bolt-elements-textSecondary">
                        {discount > 0 ? (
                          <>
                            Pay {dollars(pack.priceCents)}{' '}
                            <span className="text-green-400">save {dollars(discount)}</span>
                          </>
                        ) : (
                          <>Pay {dollars(pack.priceCents)}</>
                        )}
                      </span>
                      <span className="mt-1 text-[11px] font-medium text-[var(--ecode-accent,#F26207)]">
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
                    <span>{dollars(pack.remainingCents)} remaining</span>
                    <span>
                      {pack.expiresAt ? `Expires ${new Date(pack.expiresAt).toLocaleDateString()}` : 'No expiry'}
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
                  title: `${entry.deltaCents >= 0 ? '+' : '-'}${dollars(Math.abs(entry.deltaCents))} — ${entry.kind.toLowerCase()}`,
                  detail: `${entry.reason ?? ''}${entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ''}`,
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
