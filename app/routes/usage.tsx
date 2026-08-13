import { Activity, Boxes, Database, Sparkles } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  apiErrorMessage,
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
import { formatUserAreaDate, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { memberDisplayLabel, quotaDisplayLabel, userFacingLabel } from '~/lib/user-facing-labels';

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

export const meta: MetaFunction = () => [{ title: 'Usage - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * Per-resource spend breakdown is a lower-sensitivity read; never let it break
   * the usage page (missing on older API pods → null → section simply hidden).
   */
  const breakdownPromise = apiRequest<Breakdown>(request, `/orgs/${organization.id}/usage/breakdown`).then(
    (breakdown) => ({ breakdown, unavailable: false as const }),
    () => ({ breakdown: null as Breakdown, unavailable: true as const }),
  );

  // Per-user (Enterprise) spend limits — best-effort (hidden if unavailable).
  const memberLimitsPromise = apiRequest<MemberLimitsData>(request, `/orgs/${organization.id}/usage/limits`).then(
    (memberLimits) => ({ memberLimits, unavailable: false as const }),
    (error) => ({
      memberLimits: null as MemberLimitsData,
      unavailable: !isForbiddenApiResponse(error),
    }),
  );

  try {
    const data = await apiRequest<UsageData>(request, `/orgs/${organization.id}/usage`);
    const [breakdownResult, memberLimitsResult] = await Promise.all([breakdownPromise, memberLimitsPromise]);

    return {
      ...data,
      breakdown: breakdownResult.breakdown,
      breakdownUnavailable: breakdownResult.unavailable,
      memberLimits: memberLimitsResult.memberLimits,
      memberLimitsUnavailable: memberLimitsResult.unavailable,
      usageAccessLimited: false,
    };
  } catch (error) {
    /*
     * A member without `usage:read` gets 403; render a friendly empty state
     * instead of crashing the page to the root error view (mirrors billing.tsx).
     */
    if (isForbiddenApiResponse(error)) {
      const [breakdownResult, memberLimitsResult] = await Promise.all([breakdownPromise, memberLimitsPromise]);

      return {
        usage: [],
        quotas: {},
        quotaUsage: {},
        overrides: [],
        plan: { name: 'Unavailable' },
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
    return json({ error: 'Choose a member.' }, { status: 400 });
  }

  // Empty limit clears the per-user override (falls back to the org default).
  const raw = String(form.get('limitDollars') ?? '').trim();
  const limitCents = raw === '' ? null : Math.round(Number(raw) * 100);

  if (limitCents != null && (!Number.isFinite(limitCents) || limitCents < 0)) {
    return json({ error: 'Enter a valid limit in euros (or leave blank to clear).' }, { status: 400 });
  }

  try {
    await apiRequest(request, `/orgs/${organization.id}/usage/limits/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ limitCents }),
    });
    return json({ ok: limitCents == null ? 'Member limit cleared.' : 'Member limit saved.' });
  } catch (error) {
    const message = isApiResponse(error)
      ? await apiErrorMessage(error, 'Could not update the member limit.')
      : 'Could not update the member limit. Please try again.';
    return json({ error: message }, { status: isApiResponse(error) ? error.status : 503 });
  }
}

export default function UsagePage() {
  const data = useLoaderData<typeof loader>();

  const used = (key: string) =>
    data.quotaUsage?.[key] ??
    data.usage.filter((event) => event.type === key).reduce((sum, event) => sum + event.quantity, 0);

  const overrides = data.overrides ?? [];
  const overrideFor = (key: string) => overrides.find((override) => override.key === key);

  /*
   * The enforced limit for a quota = its override when one exists, else the base
   * plan quota. Both the summary cards and the quota table must read this same
   * value; the "Projects" card previously showed the raw base (e.g. 10000) while
   * the table showed the override (e.g. 100), so they disagreed on the same key.
   */
  const effectiveLimitFor = (key: string) => overrideFor(key)?.limit ?? data.quotas[key] ?? 0;
  const breakdown = data.breakdown;
  const memberLimits = data.memberLimits;
  const hasQuotaData = data.usage.length > 0 || Object.keys(data.quotas).length > 0;
  const actionData = useActionData<typeof action>() as { ok?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const savingLimit = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'member-limit';
  const dollars = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const limitFor = (userId: string) => memberLimits?.limits.find((l) => l.userId === userId)?.limitCents;

  const iconFor: Record<string, typeof Sparkles> = {
    agent: Sparkles,
    compute: Activity,
    deployments: Boxes,
    objectStorage: Database,
    database: Database,
  };

  return (
    <AppShell
      title="Usage overview"
      description="See how your plan allowances are being used across projects, workspaces, AI, storage and deployments."
    >
      {data.breakdownUnavailable ? (
        retrying ? (
          <AsyncPanelSkeleton label="Loading spend by resource" rows={4} className="mb-6" />
        ) : (
          <AsyncPanelError
            title="Resource spend could not load"
            description="Quota totals remain available, but the resource breakdown is hidden to avoid showing incomplete costs."
            onRetry={revalidator.revalidate}
            className="mb-6"
          />
        )
      ) : breakdown && breakdown.categories.length ? (
        <section className="mb-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Spend by resource</h2>
            <div className="flex items-center gap-2">
              {breakdown.shadow || !breakdown.creditsEnabled ? (
                <span className="rounded-full bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-medium text-[var(--status-warning-text)]">
                  Projected (not charged)
                </span>
              ) : null}
              <span className="text-sm font-semibold text-bolt-elements-textPrimary">
                {dollars(breakdown.totalCents)}
              </span>
            </div>
          </div>
          <p className="mb-4 text-xs text-bolt-elements-textSecondary">
            This billing period ({formatUserAreaDate(breakdown.periodStart) ?? 'date unavailable'} –{' '}
            {formatUserAreaDate(breakdown.periodEnd) ?? 'date unavailable'}) at the metered rates, broken down by
            resource.
          </p>
          <ul className="flex flex-col gap-3">
            {breakdown.categories.map((category) => {
              const Icon = iconFor[category.key] ?? Activity;

              const pct = breakdown.totalCents > 0 ? Math.round((category.costCents / breakdown.totalCents) * 100) : 0;

              return (
                <li key={category.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-bolt-elements-textPrimary">
                      <Icon className="h-4 w-4 text-[var(--vc-ide-accent-action)]" />
                      {category.label}
                    </span>
                    <span className="text-bolt-elements-textSecondary">
                      {formatUserAreaNumber(category.quantity)} {category.unit} ·{' '}
                      <span className="font-medium text-bolt-elements-textPrimary">{dollars(category.costCents)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
                    <div
                      className="h-full rounded-full bg-[var(--vc-ide-accent-action)]"
                      style={{ width: `${Math.min(100, pct)}%` }}
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
          title="No metered spend yet"
          description="Resource costs will appear after this organization records billable usage."
          className="mb-6"
          variant="compact"
        />
      )}
      {data.usageAccessLimited ? (
        <AsyncPanelError
          title="Usage details are restricted"
          description="Your role does not include organization usage access. Ask an organization administrator if you need these totals."
          onRetry={revalidator.revalidate}
          retrying={retrying}
          tone="warning"
        />
      ) : !hasQuotaData ? (
        <EmptyState
          icon={Activity}
          title="No usage recorded yet"
          description="Quota totals and activity will appear after this organization starts using projects and AI resources."
          variant="compact"
        />
      ) : (
        <>
          <StatGrid
            stats={[
              {
                label: 'Projects',
                value: `${used('projects.count')} / ${effectiveLimitFor('projects.count')}`,
                detail: 'Project creation is checked before action',
                icon: Boxes,
              },
              {
                label: 'AI tokens',
                value: String(used('ai.inputTokens') + used('ai.outputTokens')),
                detail: 'Input and output token usage recorded',
                icon: Sparkles,
              },
              {
                label: 'Storage MB',
                value: String(used('snapshots.sizeMb')),
                detail: 'Snapshot storage tracked by usage events',
                icon: Database,
              },
              {
                label: 'Runtime starts',
                value: String(used('workspaces.active')),
                detail: `Plan: ${data.plan.name}`,
                icon: Activity,
              },
            ]}
          />
          <div className="mt-6 overflow-x-auto rounded-lg border border-bolt-elements-borderColor">
            <div className="min-w-[420px]">
              <div className="grid grid-cols-[1fr_120px_120px] border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-3 px-4 py-2 text-xs font-medium uppercase tracking-wide text-bolt-elements-textTertiary">
                <span>Quota</span>
                <span className="text-right">Used</span>
                <span className="text-right">Limit</span>
              </div>
              {Object.entries(data.quotas).map(([quota]) => {
                const override = overrideFor(quota);
                const effectiveLimit = effectiveLimitFor(quota);
                const usedValue = used(quota);
                const pct = effectiveLimit > 0 ? Math.round((usedValue / effectiveLimit) * 100) : 0;
                const tone = pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'ok';

                return (
                  <div
                    key={quota}
                    className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm last:border-b-0"
                  >
                    <div className="grid grid-cols-[1fr_120px_120px]">
                      <span className="min-w-0 truncate">
                        {quotaDisplayLabel(quota)}
                        {override ? (
                          <span className="ml-2 rounded-full border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] uppercase text-bolt-elements-textTertiary">
                            Custom limit
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right text-bolt-elements-textSecondary">{usedValue}</span>
                      <span className="text-right text-bolt-elements-textSecondary">{effectiveLimit}</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${quotaDisplayLabel(quota)} usage`}
                      aria-valuemin={0}
                      aria-valuemax={effectiveLimit}
                      aria-valuenow={Math.min(usedValue, effectiveLimit)}
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, pct)}%`,
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
                          {`You've used ${pct}% of your ${quotaDisplayLabel(quota).toLowerCase()} allowance`}
                        </span>
                        {tone === 'error' ? (
                          <Link
                            to="/upgrade"
                            className="inline-flex h-7 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                          >
                            Increase limits
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
              <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Custom plan limits</h3>
              <p className="mb-3 text-xs text-bolt-elements-textSecondary">
                Limits tailored to this organization replace the standard plan allowance.
              </p>
              <ul className="flex flex-col gap-2">
                {overrides.map((override) => (
                  <li key={override.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="text-bolt-elements-textPrimary">{quotaDisplayLabel(override.key)}</span>
                    <span className="text-bolt-elements-textSecondary">
                      Limit {formatUserAreaNumber(override.limit)}
                      {override.reason ? ` · ${override.reason}` : ''}
                      {override.expiresAt
                        ? ` · until ${formatUserAreaDate(override.expiresAt) ?? 'date unavailable'}`
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
          <AsyncPanelSkeleton label="Loading member spend limits" rows={3} compact className="mt-6" />
        ) : (
          <AsyncPanelError
            title="Member spend limits could not load"
            description="Organization usage remains visible. Member-specific limits are hidden until the request succeeds."
            onRetry={revalidator.revalidate}
            compact
            className="mt-6"
          />
        )
      ) : memberLimits && memberLimits.members.length ? (
        <div className="mt-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Member spend limits (Enterprise)</h3>
          <p className="mb-3 text-xs text-bolt-elements-textSecondary">
            Cap an individual member&apos;s usage-based spend below the organization default. A per-member limit
            overrides the org budget for that member. Leave the field blank and save to clear a limit.
          </p>
          {actionData?.ok ? (
            <div className="mb-3 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-2 text-xs text-[var(--status-success-text)]">
              {actionData.ok}
            </div>
          ) : null}
          {actionData?.error ? (
            <div className="mb-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-2 text-xs text-[var(--status-error-text)]">
              {actionData.error}
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {memberLimits.members.map((member, memberIndex) => {
              const current = limitFor(member.userId);
              const memberLabel = memberDisplayLabel(member, memberIndex);

              return (
                <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-bolt-elements-textPrimary">
                    {memberLabel}
                    {member.role ? (
                      <span className="ml-2 text-[11px] uppercase text-bolt-elements-textTertiary">
                        {userFacingLabel(member.role, 'Member')}
                      </span>
                    ) : null}
                    <span className="ml-2 text-xs text-bolt-elements-textSecondary">
                      {current != null ? `limit ${dollars(current)}` : 'no member limit'}
                    </span>
                  </span>
                  <Form method="post" className="flex items-center gap-1.5">
                    <input type="hidden" name="intent" value="member-limit" />
                    <input type="hidden" name="userId" value={member.userId} />
                    <span className="text-sm text-bolt-elements-textSecondary">€</span>
                    <input
                      type="number"
                      name="limitDollars"
                      min="0"
                      step="any"
                      defaultValue={current != null ? (current / 100).toString() : ''}
                      placeholder="No limit"
                      aria-label={`Spend limit for ${memberLabel} in euros`}
                      className="w-28 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-sm text-bolt-elements-textPrimary"
                    />
                    <Button type="submit" variant="outline" disabled={savingLimit}>
                      Save
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
          title="No members available for individual limits"
          description="Member-specific spend controls will appear after members join this organization."
          variant="compact"
          className="mt-6"
        />
      ) : null}
    </AppShell>
  );
}
