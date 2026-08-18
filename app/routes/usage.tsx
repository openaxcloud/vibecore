import { Activity, Boxes, Database, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
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
  billingEn,
  billingFr,
  formatBillingCurrency,
  formatBillingDate,
  formatBillingNumber,
  type BillingMessageKey,
} from '~/lib/i18n/catalogs/billing';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

type MemberLimit = { userId: string; limitCents: number };
type OrgMember = { userId: string; role?: string; email?: string; name?: string };
type MemberLimitsData = { limits: MemberLimit[]; members: OrgMember[] } | null;
type UsageEvent = { id: string; type: string; quantity: number; createdAt?: string };
type QuotaOverride = { id: string; key: string; limit: number; reason?: string; expiresAt?: string };
type BreakdownCategory = { key: string; label: string; unit: string; quantity: number; costCents: number };
type Breakdown = {
  creditsEnabled: boolean;
  shadow: boolean;
  periodStart: string;
  periodEnd: string;
  categories: BreakdownCategory[];
  totalCents: number;
  runtimeMinutes: number;
  dbActiveHours: number;
} | null;
type UsageData = {
  usage: UsageEvent[];
  quotas: Record<string, number>;
  quotaUsage?: Record<string, number>;
  overrides?: QuotaOverride[];
  plan: { name: string };
};
type UsageFeedback = { errorKey?: BillingMessageKey; successKey?: BillingMessageKey };

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? billingFr : billingEn)['usage.meta.title'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);
  const { language } = resolveRequestLocale(request);

  if (!organization) {
    return redirect('/');
  }

  const breakdownPromise = apiRequest<Breakdown>(request, `/orgs/${organization.id}/usage/breakdown`).then(
    (breakdown) => ({ breakdown, unavailable: false as const }),
    () => ({ breakdown: null as Breakdown, unavailable: true as const }),
  );
  const memberLimitsPromise = apiRequest<MemberLimitsData>(request, `/orgs/${organization.id}/usage/limits`).then(
    (memberLimits) => ({ memberLimits, unavailable: false as const }),
    (error) => ({ memberLimits: null as MemberLimitsData, unavailable: !isForbiddenApiResponse(error) }),
  );

  try {
    const data = await apiRequest<UsageData>(request, `/orgs/${organization.id}/usage`);
    const [breakdownResult, memberLimitsResult] = await Promise.all([breakdownPromise, memberLimitsPromise]);

    return {
      ...data,
      language,
      breakdown: breakdownResult.breakdown,
      breakdownUnavailable: breakdownResult.unavailable,
      memberLimits: memberLimitsResult.memberLimits,
      memberLimitsUnavailable: memberLimitsResult.unavailable,
      usageAccessLimited: false,
    };
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      const [breakdownResult, memberLimitsResult] = await Promise.all([breakdownPromise, memberLimitsPromise]);

      return {
        language,
        usage: [],
        quotas: {},
        quotaUsage: {},
        overrides: [],
        plan: { name: 'unavailable' },
        breakdown: breakdownResult.breakdown,
        breakdownUnavailable: breakdownResult.unavailable,
        memberLimits: memberLimitsResult.memberLimits,
        memberLimitsUnavailable: memberLimitsResult.unavailable,
        usageAccessLimited: true,
      };
    }

    throw error;
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const organization = await firstOrganization(request);
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '').trim();

  if (!userId) {
    return json<UsageFeedback>({ errorKey: 'usage.feedback.chooseMember' }, { status: 400 });
  }

  const raw = String(form.get('limitDollars') ?? '').trim();
  const limitCents = raw === '' ? null : Math.round(Number(raw) * 100);

  if (limitCents != null && (!Number.isFinite(limitCents) || limitCents < 0)) {
    return json<UsageFeedback>({ errorKey: 'usage.feedback.invalidLimit' }, { status: 400 });
  }

  try {
    await apiRequest(request, `/orgs/${organization.id}/usage/limits/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ limitCents }),
    });
    return json<UsageFeedback>({
      successKey: limitCents == null ? 'usage.feedback.limitCleared' : 'usage.feedback.limitSaved',
    });
  } catch (error) {
    return json<UsageFeedback>(
      { errorKey: 'usage.feedback.limitFailed' },
      { status: isApiResponse(error) ? error.status : 503 },
    );
  }
}

export default function UsagePage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();

  const used = (key: string) =>
    data.quotaUsage?.[key] ??
    data.usage.filter((event) => event.type === key).reduce((sum, event) => sum + event.quantity, 0);

  const overrides = data.overrides ?? [];
  const overrideFor = (key: string) => overrides.find((override) => override.key === key);
  const effectiveLimitFor = (key: string) => overrideFor(key)?.limit ?? data.quotas[key] ?? 0;
  const breakdown = data.breakdown;
  const memberLimits = data.memberLimits;
  const hasQuotaData = data.usage.length > 0 || Object.keys(data.quotas).length > 0;
  const actionData = useActionData<typeof action>() as UsageFeedback | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const savingLimit = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'member-limit';
  const money = (cents: number) => formatBillingCurrency(cents, 'EUR', data.language);
  const limitFor = (userId: string) => memberLimits?.limits.find((limit) => limit.userId === userId)?.limitCents;
  const actionSuccess = actionData?.successKey ? t(actionData.successKey) : undefined;
  const actionError = actionData?.errorKey ? t(actionData.errorKey) : undefined;

  const label = (value: string, fallback: BillingMessageKey = 'billing.label.recordedActivity') =>
    billingDisplayName(value, data.language, fallback);
  const memberLabel = (member: OrgMember, index: number) =>
    member.name?.trim() || member.email?.trim() || t('usage.members.memberNumber', { count: index + 1 });
  const quantityWithUnit = (quantity: number, unit: string) => {
    const value = formatBillingNumber(quantity, data.language);

    switch (unit.trim().toLowerCase()) {
      case 'minute':
      case 'minutes':
        return t('billing.unit.minute', { count: quantity, value });
      case 'hour':
      case 'hours':
        return t('billing.unit.hour', { count: quantity, value });
      case 'request':
      case 'requests':
        return t('billing.unit.request', { count: quantity, value });
      case 'token':
      case 'tokens':
        return t('billing.unit.token', { count: quantity, value });
      case 'checkpoint':
      case 'checkpoints':
        return t('billing.unit.checkpoint', { count: quantity, value });
      case 'compute unit':
      case 'compute units':
        return t('billing.unit.computeUnit', { count: quantity, value });
      case 'deploy':
      case 'deploys':
        return t('billing.unit.deployment', { count: quantity, value });
      case 'gib-month':
      case 'gib-months':
        return t('billing.unit.gibMonth', { count: quantity, value });
      case 'gb':
        return `${value} ${data.language === 'fr' ? 'Go' : 'GB'}`;
      case 'mb':
        return `${value} ${data.language === 'fr' ? 'Mo' : 'MB'}`;
      default:
        return value;
    }
  };

  const iconFor: Record<string, typeof Sparkles> = {
    agent: Sparkles,
    compute: Activity,
    deployments: Boxes,
    objectStorage: Database,
    database: Database,
  };

  return (
    <AppShell title={t('usage.page.title')} description={t('usage.page.description')}>
      {data.breakdownUnavailable ? (
        retrying ? (
          <AsyncPanelSkeleton label={t('usage.breakdown.loading')} rows={4} className="mb-6" />
        ) : (
          <AsyncPanelError
            title={t('usage.breakdown.errorTitle')}
            description={t('usage.breakdown.errorDescription')}
            onRetry={revalidator.revalidate}
            className="mb-6"
          />
        )
      ) : breakdown && breakdown.categories.length ? (
        <section className="mb-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-bolt-elements-textPrimary">{t('usage.breakdown.title')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              {breakdown.shadow || !breakdown.creditsEnabled ? (
                <span className="rounded-full bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-medium text-[var(--status-warning-text)]">
                  {t('usage.breakdown.projected')}
                </span>
              ) : null}
              <span className="text-sm font-semibold text-bolt-elements-textPrimary">
                {money(breakdown.totalCents)}
              </span>
            </div>
          </div>
          <p className="mb-4 text-xs text-bolt-elements-textSecondary">
            {t('usage.breakdown.period', {
              start: breakdown.periodStart
                ? formatBillingDate(breakdown.periodStart, data.language)
                : t('billing.common.dateUnavailable'),
              end: breakdown.periodEnd
                ? formatBillingDate(breakdown.periodEnd, data.language)
                : t('billing.common.dateUnavailable'),
            })}
          </p>
          <ul className="flex flex-col gap-3">
            {breakdown.categories.map((category) => {
              const Icon = iconFor[category.key] ?? Activity;

              const percent =
                breakdown.totalCents > 0 ? Math.round((category.costCents / breakdown.totalCents) * 100) : 0;

              return (
                <li key={category.key} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 break-words text-bolt-elements-textPrimary">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--vc-ide-accent-action)]" />
                      {label(category.key || category.label)}
                    </span>
                    <span className="text-bolt-elements-textSecondary">
                      {quantityWithUnit(category.quantity, category.unit)} ·{' '}
                      <span className="font-medium text-bolt-elements-textPrimary">{money(category.costCents)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
                    <div
                      className="h-full rounded-full bg-[var(--vc-ide-accent-action)]"
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <EmptyState
          icon={Activity}
          title={t('usage.breakdown.emptyTitle')}
          description={t('usage.breakdown.emptyDescription')}
          className="mb-6"
          variant="compact"
        />
      )}
      {data.usageAccessLimited ? (
        <AsyncPanelError
          title={t('usage.access.title')}
          description={t('usage.access.description')}
          onRetry={revalidator.revalidate}
          retrying={retrying}
          tone="warning"
        />
      ) : !hasQuotaData ? (
        <EmptyState
          icon={Activity}
          title={t('usage.empty.title')}
          description={t('usage.empty.description')}
          variant="compact"
        />
      ) : (
        <>
          <StatGrid
            stats={[
              {
                label: t('usage.stats.projects'),
                value: `${formatBillingNumber(used('projects.count'), data.language)} / ${formatBillingNumber(effectiveLimitFor('projects.count'), data.language)}`,
                detail: t('usage.stats.projectsDetail'),
                icon: Boxes,
              },
              {
                label: t('usage.stats.aiTokens'),
                value: formatBillingNumber(used('ai.inputTokens') + used('ai.outputTokens'), data.language),
                detail: t('usage.stats.aiTokensDetail'),
                icon: Sparkles,
              },
              {
                label: t('usage.stats.storage'),
                value: formatBillingNumber(used('snapshots.sizeMb'), data.language),
                detail: t('usage.stats.storageDetail'),
                icon: Database,
              },
              {
                label: t('usage.stats.runtimeStarts'),
                value: formatBillingNumber(used('workspaces.active'), data.language),
                detail: t('billing.common.plan', {
                  plan: label(data.plan.name, 'billing.label.planAllowance'),
                }),
                icon: Activity,
              },
            ]}
          />
          <div className="mt-6 overflow-x-auto rounded-lg border border-bolt-elements-borderColor">
            {/*
             * Le plancher de 420px ne s'applique qu'à partir de `sm`. En dessous
             * il forçait un défilement horizontal dans un écran de 390px, et le
             * message d'alerte de quota comme son bouton « Augmenter les limites »
             * sortaient du cadre visible : on ne voyait plus QUE la partie gauche
             * du tableau. Les deux colonnes de chiffres se resserrent au lieu de
             * pousser le contenu hors de l'écran.
             */}
            <div className="min-w-0 sm:min-w-[420px]">
              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-4 py-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary sm:grid-cols-[1fr_120px_120px]">
                <span>{t('usage.table.quota')}</span>
                <span className="text-right">{t('usage.table.used')}</span>
                <span className="text-right">{t('usage.table.limit')}</span>
              </div>
              {Object.entries(data.quotas).map(([quota]) => {
                const override = overrideFor(quota);
                const effectiveLimit = effectiveLimitFor(quota);
                const usedValue = used(quota);
                const percent = effectiveLimit > 0 ? Math.round((usedValue / effectiveLimit) * 100) : 0;
                const tone = percent >= 100 ? 'error' : percent >= 80 ? 'warning' : 'ok';
                const quotaLabel = label(quota, 'billing.label.planAllowance');

                return (
                  <div
                    key={quota}
                    className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] sm:grid-cols-[1fr_120px_120px]">
                      <span className="min-w-0 break-words">
                        {quotaLabel}
                        {override ? (
                          <span className="ml-2 inline-flex rounded-full border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] uppercase text-bolt-elements-textTertiary">
                            {t('usage.table.customLimit')}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right text-bolt-elements-textSecondary">
                        {formatBillingNumber(usedValue, data.language)}
                      </span>
                      <span className="text-right text-bolt-elements-textSecondary">
                        {formatBillingNumber(effectiveLimit, data.language)}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={t('usage.table.progressAria', { quota: quotaLabel })}
                      aria-valuemin={0}
                      aria-valuemax={effectiveLimit}
                      aria-valuenow={Math.min(usedValue, effectiveLimit)}
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, percent)}%`,
                          background:
                            tone === 'error'
                              ? 'var(--vc-ide-accent-error)'
                              : tone === 'warning'
                                ? 'var(--vc-ide-accent-warning)'
                                : 'var(--vc-ide-accent-action)',
                        }}
                      />
                    </div>
                    {tone !== 'ok' ? (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span
                          style={{
                            color: tone === 'error' ? 'var(--status-error-text)' : 'var(--status-warning-text)',
                          }}
                        >
                          {t('usage.table.allowanceUsed', { percent, quota: quotaLabel.toLocaleLowerCase() })}
                        </span>
                        {tone === 'error' ? (
                          <Link
                            to="/upgrade"
                            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--vc-action-primary)] px-3 text-xs font-medium text-[var(--vc-action-primary-foreground)] transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                          >
                            {t('usage.table.increaseLimits')}
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {overrides.length > 0 ? (
            <div className="mt-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary">{t('usage.overrides.title')}</h3>
              <p className="mb-3 text-xs text-bolt-elements-textSecondary">{t('usage.overrides.description')}</p>
              <ul className="flex flex-col gap-2">
                {overrides.map((override) => (
                  <li key={override.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="text-bolt-elements-textPrimary">
                      {label(override.key, 'billing.label.planAllowance')}
                    </span>
                    <span className="text-bolt-elements-textSecondary">
                      {t('usage.overrides.limit', {
                        limit: formatBillingNumber(override.limit, data.language),
                      })}
                      {override.reason ? ` · ${override.reason}` : ''}
                      {override.expiresAt
                        ? ` · ${t('usage.overrides.until', {
                            date: formatBillingDate(override.expiresAt, data.language),
                          })}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {data.memberLimitsUnavailable ? (
        retrying ? (
          <AsyncPanelSkeleton label={t('usage.members.loading')} rows={3} compact className="mt-6" />
        ) : (
          <AsyncPanelError
            title={t('usage.members.errorTitle')}
            description={t('usage.members.errorDescription')}
            onRetry={revalidator.revalidate}
            compact
            className="mt-6"
          />
        )
      ) : memberLimits && memberLimits.members.length ? (
        <div className="mt-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">{t('usage.members.title')}</h3>
          <p className="mb-3 text-xs text-bolt-elements-textSecondary">{t('usage.members.description')}</p>
          {actionSuccess ? (
            <div className="mb-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-2 text-xs text-[var(--status-success-text)]">
              {actionSuccess}
            </div>
          ) : null}
          {actionError ? (
            <div className="mb-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-2 text-xs text-[var(--status-error-text)]">
              {actionError}
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {memberLimits.members.map((member, memberIndex) => {
              const current = limitFor(member.userId);
              const displayMember = memberLabel(member, memberIndex);

              return (
                <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words text-sm text-bolt-elements-textPrimary">
                    {displayMember}
                    {member.role ? (
                      <span className="ml-2 text-[11px] uppercase text-bolt-elements-textTertiary">
                        {label(member.role, 'billing.label.member')}
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-bolt-elements-textSecondary">
                      {current != null
                        ? t('usage.members.currentLimit', { amount: money(current) })
                        : t('usage.members.noLimit')}
                    </span>
                  </span>
                  <Form method="post" className="flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="intent" value="member-limit" />
                    <input type="hidden" name="userId" value={member.userId} />
                    <span className="text-sm text-bolt-elements-textSecondary">€</span>
                    <input
                      type="number"
                      name="limitDollars"
                      min="0"
                      step="any"
                      defaultValue={current != null ? (current / 100).toString() : ''}
                      placeholder={t('usage.members.placeholder')}
                      aria-label={t('usage.members.limitAria', { member: displayMember })}
                      className="min-h-[44px] w-32 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-[16px] text-bolt-elements-textPrimary sm:text-sm"
                    />
                    <Button type="submit" variant="outline" disabled={savingLimit} className="min-h-[44px]">
                      {t(savingLimit ? 'billing.common.saving' : 'billing.common.save')}
                    </Button>
                  </Form>
                </li>
              );
            })}
          </ul>
        </div>
      ) : memberLimits ? (
        <EmptyState
          icon={Activity}
          title={t('usage.members.emptyTitle')}
          description={t('usage.members.emptyDescription')}
          variant="compact"
          className="mt-6"
        />
      ) : null}
    </AppShell>
  );
}
