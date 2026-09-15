import { CreditCard, FileText, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { ActivityList, AppShell, LinkButton, StatGrid } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  billingDisplayName,
  billingLedgerReason,
  billingEn,
  billingFr,
  formatBillingCurrency,
  formatBillingDate,
  formatBillingNumber,
  type BillingMessageKey,
} from '~/lib/i18n/catalogs/billing';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

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

export function formatEuro(cents: number, language: SupportedLanguage = 'en'): string {
  return formatBillingCurrency(cents, 'EUR', language);
}

export function billingDisplayLabel(value: string, language: SupportedLanguage = 'en'): string {
  return billingDisplayName(value, language);
}

type BillingFeedback = { errorKey?: BillingMessageKey; successKey?: BillingMessageKey };

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
  language,
}: {
  spentCents: number;
  capCents: number | null;
  thresholds: number[];
  language: SupportedLanguage;
}) {
  const { t } = useTranslation();
  const { tone, pct } = spendUsageState(spentCents, capCents);

  if (tone === 'none') {
    return <p className="mb-3 text-xs text-bolt-elements-textSecondary">{t('billing.spend.uncapped')}</p>;
  }

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-bolt-elements-textSecondary">
        <span>
          {t('billing.spend.used', {
            spent: formatEuro(spentCents, language),
            cap: formatEuro(capCents ?? 0, language),
          })}
        </span>
        <span className={tone === 'ok' ? '' : 'text-bolt-elements-textPrimary'}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('billing.spend.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-1"
      >
        <div className={`h-full ${SPEND_TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-bolt-elements-textSecondary">
        {t(tone === 'reached' ? 'billing.spend.reached' : 'billing.spend.alertThresholds', {
          thresholds: thresholds.join('% / '),
        })}
      </p>
    </div>
  );
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? billingFr : billingEn)['billing.meta.title'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);
  const { language } = resolveRequestLocale(request);

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
      language,
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
        language,
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
      return json<BillingFeedback>({
        successKey: blockExternalAi ? 'billing.feedback.aiBlocked' : 'billing.feedback.aiAllowed',
      });
    } catch (error) {
      return json<BillingFeedback>(
        { errorKey: 'billing.feedback.aiFailed' },
        { status: isApiResponse(error) ? error.status : 503 },
      );
    }
  }

  if (intent === 'set-limits') {
    // Pay-as-you-go spend cap (Usage Limit). Empty = no cap; "0.01" restricts to credits.
    const raw = String(form.get('budgetCapDollars') ?? '').trim();
    const budgetCapCents = raw === '' ? null : Math.round(Number(raw) * 100);

    if (budgetCapCents != null && (!Number.isFinite(budgetCapCents) || budgetCapCents < 0)) {
      return json<BillingFeedback>({ errorKey: 'billing.feedback.invalidSpendLimit' }, { status: 400 });
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
      return json<BillingFeedback>({ errorKey: 'billing.feedback.zeroSpendLimit' }, { status: 400 });
    }

    // Service Shutdown Limit (hard stop — suspends usage-based services when hit).
    const rawShutdown = String(form.get('serviceShutdownDollars') ?? '').trim();
    const serviceShutdownCents = rawShutdown === '' ? null : Math.round(Number(rawShutdown) * 100);

    if (serviceShutdownCents != null && (!Number.isFinite(serviceShutdownCents) || serviceShutdownCents < 0)) {
      return json<BillingFeedback>({ errorKey: 'billing.feedback.invalidShutdownLimit' }, { status: 400 });
    }

    try {
      await apiRequest(request, `/orgs/${organization.id}/credits/limits`, {
        method: 'POST',
        body: JSON.stringify({ budgetCapCents, serviceShutdownCents }),
      });
      return json<BillingFeedback>({ successKey: 'billing.feedback.limitUpdated' });
    } catch (error) {
      return json<BillingFeedback>(
        { errorKey: 'billing.feedback.limitFailed' },
        { status: isApiResponse(error) ? error.status : 503 },
      );
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
      return json<BillingFeedback>({ errorKey: 'billing.feedback.choosePack' }, { status: 400 });
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
      return json<BillingFeedback>(
        {
          errorKey:
            isApiResponse(error) && error.status === 503
              ? 'billing.feedback.packsUnavailable'
              : 'billing.feedback.packCheckoutFailed',
        },
        { status: isApiResponse(error) ? error.status : 503 },
      );
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
      if (!isApiResponse(error)) {
        console.error('billing portal request failed:', error);
      }

      return json<BillingFeedback>(
        {
          errorKey:
            isApiResponse(error) && error.status < 500
              ? 'billing.feedback.portalForbidden'
              : 'billing.feedback.portalUnavailable',
        },
        { status: isApiResponse(error) ? error.status : 503 },
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
    if (!isApiResponse(error)) {
      console.error('billing checkout request failed:', error);
    }

    return json<BillingFeedback>(
      {
        errorKey:
          isApiResponse(error) && error.status < 500
            ? 'billing.feedback.checkoutForbidden'
            : 'billing.feedback.checkoutUnavailable',
      },
      { status: isApiResponse(error) ? error.status : 503 },
    );
  }
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { language, billing, credits, creditsUnavailable, billingAccessLimited } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as BillingFeedback | undefined;
  const revalidator = useRevalidator();
  const retryingCredits = revalidator.state !== 'idle';
  const actionError = actionData?.errorKey ? t(actionData.errorKey) : undefined;
  const actionSuccess = actionData?.successKey ? t(actionData.successKey) : undefined;
  const money = (cents: number) => formatEuro(cents, language);
  const date = (value: string) => formatBillingDate(value, language);
  const dateTime = (value: string) => formatBillingDate(value, language, true);
  const planName = billingDisplayLabel(billing.plan.key || billing.plan.name, language);

  const subscriptionStatus = billing.subscription?.status
    ? billingDisplayLabel(billing.subscription.status, language)
    : t('billing.label.noSubscription');

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
    credits.periodStart && credits.periodEnd ? `${date(credits.periodStart)} – ${date(credits.periodEnd)} (UTC)` : null;
  const overviewStats = [
    {
      label: t('billing.stats.currentPlan'),
      value: planName,
      detail: t('billing.stats.currentPlanDetail', { amount: money(billing.plan.monthlyCents) }),
      icon: CreditCard,
    },
    {
      label: t('billing.stats.billingState'),
      value: subscriptionStatus,
      detail: billing.subscription?.currentPeriodEnd
        ? t('billing.stats.periodEnds', { date: date(billing.subscription.currentPeriodEnd) })
        : t('billing.stats.subscriptionStatus'),
      icon: TrendingUp,
    },
    {
      label: t('billing.stats.usageEvents'),
      value: formatBillingNumber(billing.usage.length, language),
      detail: t('billing.stats.usageEventsDetail'),
      icon: TrendingUp,
    },
    {
      label: t('billing.stats.upgradeOptions'),
      value: formatBillingNumber(billing.upgradePrompts.length, language),
      detail: t(billing.upgradePrompts.length ? 'billing.stats.plansAvailable' : 'billing.stats.currentPlanFits'),
      icon: FileText,
    },
  ];
  const creditStats = [
    {
      label: t('billing.stats.creditBalance'),
      value: money(credits.balanceCents),
      detail:
        monthlyGrantCents > 0
          ? t('billing.stats.includedUsed', { used: money(includedUsedCents), total: money(monthlyGrantCents) })
          : t('billing.stats.monthlyCredits'),
      icon: CreditCard,
    },
    {
      label: t('billing.stats.creditPacks'),
      value: money(credits.packBalanceCents),
      detail: t('billing.stats.packsDetail'),
      icon: CreditCard,
    },
    {
      label: t('billing.stats.totalAvailable'),
      value: money(credits.totalAvailableCents),
      detail: t('billing.stats.totalDetail'),
      icon: TrendingUp,
    },
    {
      label: t('billing.stats.budgetCap'),
      value: credits.budgetCapCents != null ? money(credits.budgetCapCents) : t('billing.common.none'),
      detail: t('billing.stats.budgetCapDetail'),
      icon: FileText,
    },
  ];
  const mobileFinancialSummary = [
    {
      label: t('billing.stats.currentPlan'),
      value: planName,
      detail: subscriptionStatus,
    },
    {
      label: t('billing.mobile.monthlyPrice'),
      value: money(billing.plan.monthlyCents),
      detail: t('billing.common.perMonth'),
    },
    {
      label: t('billing.mobile.availableBalance'),
      value: creditsUnavailable ? t('billing.common.unavailable') : money(credits.totalAvailableCents),
      detail: t(creditsUnavailable ? 'billing.mobile.balanceUnavailable' : 'billing.mobile.creditsAndPacks'),
    },
    {
      label: t('billing.mobile.spendLimit'),
      value: creditsUnavailable
        ? t('billing.common.unavailable')
        : credits.budgetCapCents != null
          ? money(credits.budgetCapCents)
          : t('billing.common.noLimit'),
      detail: t(creditsUnavailable ? 'billing.mobile.limitUnavailable' : 'billing.mobile.payg'),
    },

    /*
     * Parité mobile/desktop : ces valeurs n'existaient qu'à travers les
     * StatGrid `hidden sm:block` — invisibles sous 640px alors qu'aucun
     * substitut ne les reprenait dans ce résumé.
     */
    {
      label: t('billing.stats.creditPacks'),
      value: creditsUnavailable ? t('billing.common.unavailable') : money(credits.packBalanceCents),
      detail: t('billing.stats.packsDetail'),
    },
    {
      label: t('billing.stats.usageEvents'),
      value: formatBillingNumber(billing.usage.length, language),
      detail: t('billing.stats.usageEventsDetail'),
    },
  ];

  return (
    <AppShell
      title={t('billing.page.title')}
      description={t('billing.page.description')}
      actions={
        <>
          <LinkButton to="/upgrade">{t('billing.page.upgrade')}</LinkButton>
          <LinkButton to="/payment-method" variant="outline">
            {t('billing.page.paymentMethod')}
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
              <p className="font-semibold">{t('billing.alert.paymentFailed')}</p>
              {billing.subscription?.currentPeriodEnd ? (
                <p className="mt-0.5 text-xs">
                  {t('billing.alert.servicesPause', { date: date(billing.subscription.currentPeriodEnd) })}
                </p>
              ) : null}
            </div>
            <Link
              to="/payment-method"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-md bg-[var(--vc-cta-accent,var(--vc-ide-accent-action))] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              {t('billing.alert.updatePayment')}
            </Link>
          </div>
        ) : null}
        {/*
          Deux bandeaux distincts : une erreur d'action est une ERREUR (tokens
          error), l'accès limité un avertissement — et l'un ne doit plus
          écraser l'autre quand les deux surviennent.
        */}
        {actionError ? (
          <div
            role="alert"
            className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)]"
          >
            {actionError}
          </div>
        ) : null}
        {billingAccessLimited ? (
          <div className="rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-sm text-[var(--status-warning-text)]">
            {t('billing.alert.accessLimited')}
          </div>
        ) : null}
        <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 sm:hidden">
          {mobileFinancialSummary.map((item, index) => (
            <div
              key={item.label}
              className={`min-w-0 p-4 ${index % 2 === 0 ? 'border-r border-bolt-elements-borderColor' : ''} ${
                index < mobileFinancialSummary.length - 2 ? 'border-b border-bolt-elements-borderColor' : ''
              }`}
            >
              <dt className="text-xs text-bolt-elements-textSecondary">{item.label}</dt>
              <dd
                className="mt-1 break-words text-base font-semibold text-bolt-elements-textPrimary"
                title={item.value}
              >
                {item.value}
              </dd>
              <dd className="mt-0.5 break-words text-[11px] text-bolt-elements-textSecondary" title={item.detail}>
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
        <div className="hidden sm:block">
          <StatGrid stats={overviewStats} />
        </div>
        <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-bolt-elements-textPrimary">{t('billing.credits.title')}</h2>
              <p className="text-sm text-bolt-elements-textSecondary">{t('billing.credits.description')}</p>
            </div>
            {!creditsUnavailable && credits.shadow ? (
              <span className="shrink-0 rounded-full bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-medium text-[var(--status-warning-text)]">
                {t('billing.credits.preview')}
              </span>
            ) : null}
          </div>
          {creditsUnavailable ? (
            retryingCredits ? (
              <AsyncPanelSkeleton label={t('billing.credits.loading')} rows={4} compact />
            ) : (
              <AsyncPanelError
                title={t('billing.credits.errorTitle')}
                description={t('billing.credits.errorDescription')}
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
                  <h3 className="text-sm font-medium text-bolt-elements-textPrimary">{t('billing.spend.title')}</h3>
                  {cycleLabel ? (
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {t('billing.spend.period', { period: cycleLabel })}
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-bolt-elements-textSecondary">{t('billing.spend.description')}</p>
                {!credits.creditsEnabled ? (
                  <p className="mb-3 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-2 text-xs text-[var(--status-warning-text)]">
                    {t('billing.spend.disabled')}
                  </p>
                ) : null}
                <SpendUsageIndicator
                  spentCents={credits.paygSpentCents ?? 0}
                  capCents={credits.budgetCapCents}
                  thresholds={credits.spendAlertThresholds ?? [50, 80, 100]}
                  language={language}
                />
                {actionSuccess ? (
                  <div className="mb-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-2 text-xs text-[var(--status-success-text)]">
                    {actionSuccess}
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
                    placeholder={t('billing.spend.noCapPlaceholder')}
                    aria-label={t('billing.spend.limitAria')}
                    title={t('billing.spend.limitTitle')}
                    className="h-[44px] w-40 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-[16px] text-bolt-elements-textPrimary sm:text-sm"
                  />
                  <span className="w-full text-[11px] text-bolt-elements-textSecondary sm:w-auto">
                    {t('billing.spend.incrementHint')}
                  </span>
                  <span className="w-full text-sm text-bolt-elements-textSecondary sm:ml-2 sm:w-auto">
                    {t('billing.spend.hardStop')}
                  </span>
                  <input
                    type="number"
                    name="serviceShutdownDollars"
                    min="0"
                    step="any"
                    defaultValue={
                      credits.serviceShutdownCents != null ? (credits.serviceShutdownCents / 100).toString() : ''
                    }
                    placeholder={t('billing.spend.noHardStopPlaceholder')}
                    aria-label={t('billing.spend.shutdownAria')}
                    title={t('billing.spend.shutdownTitle')}
                    className="h-[44px] w-40 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-[16px] text-bolt-elements-textPrimary sm:text-sm"
                  />
                  <Button type="submit" variant="outline" disabled={submitting} className="min-h-[44px]">
                    {t(
                      submitting && navigation.formData?.get('intent') === 'set-limits'
                        ? 'billing.common.saving'
                        : 'billing.spend.save',
                    )}
                  </Button>
                </Form>
              </div>
              <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-bolt-elements-textPrimary">{t('billing.ai.title')}</h3>
                    <p className="text-xs text-bolt-elements-textSecondary">
                      {t(credits.blockExternalAi ? 'billing.ai.blocked' : 'billing.ai.allowed')}
                    </p>
                  </div>
                  <Form method="post">
                    <input type="hidden" name="intent" value="ai-policy" />
                    <input type="hidden" name="blockExternalAi" value={credits.blockExternalAi ? 'false' : 'true'} />
                    <Button type="submit" variant="outline" disabled={submitting} className="min-h-[44px]">
                      {t(
                        submitting && navigation.formData?.get('intent') === 'ai-policy'
                          ? 'billing.common.saving'
                          : credits.blockExternalAi
                            ? 'billing.ai.allow'
                            : 'billing.ai.block',
                      )}
                    </Button>
                  </Form>
                </div>
              </div>
              <div className="mt-4 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-bolt-elements-textPrimary">{t('billing.packs.title')}</h3>
                  {credits.activePacks && credits.activePacks.length ? (
                    <span className="text-xs text-bolt-elements-textSecondary">
                      {t('billing.packs.active', { count: credits.activePacks.length })}
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 text-xs text-bolt-elements-textSecondary">{t('billing.packs.description')}</p>
                {!credits.creditsEnabled ? (
                  <p className="mb-3 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-2 text-xs text-[var(--status-warning-text)]">
                    {t('billing.packs.disabled')}
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
                          aria-label={t('billing.packs.buyAria', {
                            credits: money(pack.creditCents),
                            price: money(pack.priceCents),
                            count: pack.validityDays,
                          })}
                          className="flex min-h-[44px] flex-col items-start gap-1 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 text-left transition-colors hover:border-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="text-base font-semibold text-bolt-elements-textPrimary">
                            {money(pack.creditCents)}
                          </span>
                          <span className="text-xs text-bolt-elements-textSecondary">
                            {discount > 0 ? (
                              <>
                                {t('billing.packs.pay', { amount: money(pack.priceCents) })}{' '}
                                <span className="text-[var(--status-success-text)]">
                                  {t('billing.packs.save', { amount: money(discount) })}
                                </span>
                              </>
                            ) : (
                              <>{t('billing.packs.pay', { amount: money(pack.priceCents) })}</>
                            )}
                          </span>
                          <span className="text-[11px] text-bolt-elements-textSecondary">
                            {t('billing.packs.validity', { count: pack.validityDays })}
                          </span>
                          <span className="mt-1 text-[11px] font-medium text-[var(--vc-ide-accent-action)]">
                            {t(submittingPackId === pack.id ? 'billing.common.redirecting' : 'billing.packs.buy')}
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
                        className="flex flex-wrap items-center justify-between gap-2 text-xs text-bolt-elements-textSecondary"
                      >
                        <span>{t('billing.packs.remaining', { amount: money(pack.remainingCents) })}</span>
                        <span>
                          {pack.expiresAt
                            ? t('billing.packs.expires', { date: date(pack.expiresAt) })
                            : t('billing.packs.expiryUnavailable')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {credits.ledger && credits.ledger.length ? (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">
                    {t('billing.history.title')}
                  </h3>
                  <ActivityList
                    items={credits.ledger.slice(0, 8).map((entry) => ({
                      title: `${entry.deltaCents >= 0 ? '+' : '-'}${money(Math.abs(entry.deltaCents))} — ${billingDisplayLabel(entry.kind, language)}`,
                      detail: `${entry.reason ? billingLedgerReason(entry.reason, language) : ''}${
                        entry.createdAt ? ` · ${dateTime(entry.createdAt)}` : ''
                      }`,
                      icon: CreditCard,
                    }))}
                  />
                </div>
              ) : null}
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-medium text-bolt-elements-textPrimary">
                  {t('billing.checkpoints.title')}
                </h3>
                {credits.checkpoints.length ? (
                  <ActivityList
                    items={credits.checkpoints.slice(0, 8).map((cp) => ({
                      title: `${money(cp.creditCents)} — ${billingDisplayLabel(cp.buildTier, language)}${
                        cp.highPowerModel ? ` · ${t('billing.label.highPowerModel')}` : ''
                      }${cp.extendedThinking ? ` · ${t('billing.label.extendedThinking')}` : ''}${
                        cp.turboMode ? ` · ${t('billing.label.turbo')}` : ''
                      }`,
                      detail: `${billingDisplayLabel(cp.status, language)} · ${dateTime(cp.startedAt)}`,
                      icon: TrendingUp,
                    }))}
                  />
                ) : (
                  <EmptyState
                    variant="compact"
                    icon={TrendingUp}
                    title={t('billing.checkpoints.emptyTitle')}
                    description={t('billing.checkpoints.emptyDescription')}
                  />
                )}
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
                  {t(submittingPlanKey === plan.planKey ? 'billing.common.redirecting' : 'billing.actions.upgradeTo', {
                    plan: billingDisplayLabel(plan.planKey || plan.name, language),
                  })}
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
                {t(submittingPortal ? 'billing.common.redirecting' : 'billing.actions.openPortal')}
              </Button>
            </Form>
          </div>
        ) : null}
        {billing.usage.length ? (
          <ActivityList
            items={billing.usage.slice(0, 8).map((event) => ({
              title: billingDisplayLabel(event.type, language),
              detail: `${formatBillingNumber(event.quantity, language)} · ${
                event.createdAt ? dateTime(event.createdAt) : t('billing.common.recorded')
              }`,
              icon: TrendingUp,
            }))}
          />
        ) : (
          <EmptyState
            variant="compact"
            icon={TrendingUp}
            title={t('billing.activity.emptyTitle')}
            description={t('billing.activity.emptyDescription')}
          />
        )}
      </div>
    </AppShell>
  );
}
