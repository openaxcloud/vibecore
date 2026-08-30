import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
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
  billingDisplayName,
  billingEn,
  billingFr,
  formatBillingCurrency,
  formatBillingNumber,
  type BillingMessageKey,
} from '~/lib/i18n/catalogs/billing';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { shouldRethrowActionError } from '~/lib/route-reauth';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? billingFr : billingEn)['downgrade.meta.title'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE']);
const CHECKOUTABLE_PLAN_KEYS = new Set(['pro', 'team']);
const LIMIT_KEYS = ['projects.count', 'workspaces.active', 'team.members', 'ai.messages', 'storage.gb'] as const;

interface CatalogPlan {
  key: string;
  name: string;
  monthlyCents: number;
  limits: Record<string, number>;
}

type DowngradeFeedback = { errorKey?: BillingMessageKey };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);
  const { language } = resolveRequestLocale(request);

  if (!organization) {
    return redirect('/');
  }

  try {
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
      language,
      plans,
      currentPlanKey: billing.plan.key,
      hasActiveSubscription: ACTIVE_SUBSCRIPTION_STATUSES.has(billing.subscription?.status ?? ''),
      billingAccessLimited: false,
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({
        language,
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
    return json<DowngradeFeedback>({ errorKey: 'downgrade.feedback.noOrganization' }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const planKey = String(form.get('planKey') ?? 'free');

  try {
    if (intent === 'portal' || planKey === 'free') {
      const portal = await apiRequest<{ portalUrl: string }>(request, `/orgs/${organization.id}/billing/portal`, {
        method: 'POST',
        body: JSON.stringify({ returnUrl: new URL('/billing', request.url).toString() }),
      });

      return redirect(portal.portalUrl);
    }

    if (!CHECKOUTABLE_PLAN_KEYS.has(planKey)) {
      return json<DowngradeFeedback>({ errorKey: 'downgrade.feedback.invalidPlan' }, { status: 400 });
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
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    return json<DowngradeFeedback>(
      { errorKey: 'downgrade.feedback.unavailable' },
      { status: isApiResponse(error) ? error.status : 503 },
    );
  }
}

function quotaReductions(current: CatalogPlan | undefined, target: CatalogPlan | undefined) {
  if (!current || !target) {
    return [] as Array<{ key: string; from: number; to: number }>;
  }

  return LIMIT_KEYS.flatMap((key) => {
    const from = current.limits[key];
    const to = target.limits[key];

    return typeof from === 'number' && typeof to === 'number' && to < from ? [{ key, from, to }] : [];
  });
}

export default function DowngradePage() {
  const { t } = useTranslation();
  const actionData = useActionData<typeof action>() as DowngradeFeedback | undefined;
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';
  const actionError = actionData?.errorKey ? t(actionData.errorKey) : undefined;
  const money = (cents: number) => formatBillingCurrency(cents, 'EUR', data.language, 0);

  const planName = (plan: CatalogPlan) =>
    billingDisplayName(plan.key || plan.name, data.language, 'billing.label.planAllowance');

  const current = useMemo(
    () => data.plans.find((plan) => plan.key === data.currentPlanKey),
    [data.plans, data.currentPlanKey],
  );
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
        title={t('downgrade.page.title')}
        description={t('downgrade.page.description')}
        error={actionError}
      >
        <p className="text-sm text-bolt-elements-textSecondary">
          {t('downgrade.access.description')}{' '}
          <Link to="/billing" className="underline">
            {t('downgrade.billingPage')}
          </Link>
          .
        </p>
      </EnterpriseFormPage>
    );
  }

  if (targets.length === 0) {
    const currentSuffix = current ? ` (${planName(current)})` : '';

    return (
      <EnterpriseFormPage
        title={t('downgrade.page.title')}
        description={t('downgrade.page.description')}
        error={actionError}
      >
        <p className="text-sm text-bolt-elements-textSecondary">
          {t('downgrade.lowest', { plan: currentSuffix })}{' '}
          <Link to="/billing" className="underline">
            {t('downgrade.billingPage')}
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
      title={t('downgrade.page.title')}
      description={t('downgrade.page.catalogDescription')}
      error={actionError}
    >
      <Form method="post" reloadDocument className="space-y-5">
        <label className="grid gap-1.5 text-sm font-medium">
          <span className="text-bolt-elements-textPrimary">{t('downgrade.to')}</span>
          <select
            name="planKey"
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.currentTarget.value)}
            className="min-h-[44px] w-full max-w-xs rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none focus:border-bolt-elements-focus"
          >
            {targets.map((plan) => (
              <option key={plan.key} value={plan.key}>
                {planName(plan)} —{' '}
                {plan.monthlyCents === 0
                  ? t('downgrade.free')
                  : t('downgrade.monthlyPrice', { amount: money(plan.monthlyCents) })}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
          {current && target ? (
            <>
              <p className="break-words text-sm text-bolt-elements-textPrimary">
                <span className="font-medium">{planName(current)}</span>
                <span className="text-bolt-elements-textTertiary"> → </span>
                <span className="font-medium">{planName(target)}</span>
              </p>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                {toFree
                  ? t('downgrade.freePriceChange', { current: money(current.monthlyCents) })
                  : t('downgrade.priceChange', {
                      target: money(target.monthlyCents),
                      current: money(current.monthlyCents),
                      saving: priceDelta < 0 ? t('downgrade.saving', { amount: money(Math.abs(priceDelta)) }) : '',
                    })}
              </p>

              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
                  {t('downgrade.losses')}
                </p>
                {reductions.length > 0 ? (
                  <ul className="mt-1.5 space-y-1 text-sm text-bolt-elements-textSecondary">
                    {reductions.map((row) => (
                      <li key={row.key} className="break-words">
                        {t('downgrade.reduction', {
                          label: billingDisplayName(row.key, data.language, 'billing.label.planAllowance'),
                          from: formatBillingNumber(row.from, data.language),
                          to: formatBillingNumber(row.to, data.language),
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-bolt-elements-textSecondary">{t('downgrade.noReductions')}</p>
                )}
                {toFree ? (
                  <p className="mt-2 text-sm text-bolt-elements-textSecondary">{t('downgrade.paidFeaturesEnd')}</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-bolt-elements-textSecondary">{t('downgrade.selectPreview')}</p>
          )}
        </div>

        <p className="text-sm text-bolt-elements-textSecondary">
          {t(data.hasActiveSubscription ? 'downgrade.activeSubscription' : 'downgrade.noActiveSubscription')}
        </p>

        {data.hasActiveSubscription || toFree ? (
          <button
            type="submit"
            name="intent"
            value="portal"
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-[var(--vc-ide-text-on-accent)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(submitting ? 'downgrade.openingPortal' : 'downgrade.schedule')}
          </button>
        ) : (
          <button
            type="submit"
            name="planKey"
            value={selectedKey}
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-4 text-sm font-medium text-[var(--vc-ide-text-on-accent)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(submitting ? 'downgrade.openingCheckout' : 'downgrade.checkout')}
          </button>
        )}
      </Form>
    </EnterpriseFormPage>
  );
}
