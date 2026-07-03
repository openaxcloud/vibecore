import { Activity, Boxes, Database, Sparkles } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation } from 'react-router';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { Button } from '~/components/ui/Button';
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

/** 'ai.inputTokens' -> 'ai input tokens' for the threshold notes. */
function humanizeQuotaKey(key: string): string {
  return key
    .replace(/\./g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  /*
   * Per-resource spend breakdown is a lower-sensitivity read; never let it break
   * the usage page (missing on older API pods → null → section simply hidden).
   */
  const breakdownPromise = apiRequest<Breakdown>(request, `/orgs/${organization.id}/usage/breakdown`).catch(
    () => null as Breakdown,
  );

  // Per-user (Enterprise) spend limits — best-effort (hidden if unavailable).
  const memberLimitsPromise = apiRequest<MemberLimitsData>(request, `/orgs/${organization.id}/usage/limits`).catch(
    () => null as MemberLimitsData,
  );

  try {
    const data = await apiRequest<UsageData>(request, `/orgs/${organization.id}/usage`);
    return { ...data, breakdown: await breakdownPromise, memberLimits: await memberLimitsPromise };
  } catch (error) {
    /*
     * A member without `usage:read` gets 403; render a friendly empty state
     * instead of crashing the page to the root error view (mirrors billing.tsx).
     */
    if (isForbiddenApiResponse(error)) {
      return {
        usage: [],
        quotas: {},
        quotaUsage: {},
        overrides: [],
        plan: { name: 'Unavailable' },
        breakdown: null as Breakdown,
        memberLimits: null as MemberLimitsData,
      } satisfies UsageData & { breakdown: Breakdown; memberLimits: MemberLimitsData };
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
  const breakdown = data.breakdown;
  const memberLimits = data.memberLimits;
  const actionData = useActionData<typeof action>() as { ok?: string; error?: string } | undefined;
  const navigation = useNavigation();
  const savingLimit = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'member-limit';
  const dollars = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const limitFor = (userId: string) => memberLimits?.limits.find((l) => l.userId === userId)?.limitCents;
  const memberLabel = (m: OrgMember) => m.email || m.name || m.userId;

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
      description="Track backend-enforced quota usage across projects, workspaces, AI, storage, snapshots, previews and deployments."
    >
      {breakdown && breakdown.categories.length ? (
        <section className="mb-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-bolt-elements-textPrimary">Spend by resource</h2>
            <div className="flex items-center gap-2">
              {breakdown.shadow || !breakdown.creditsEnabled ? (
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
                  Projected (not charged)
                </span>
              ) : null}
              <span className="text-sm font-semibold text-bolt-elements-textPrimary">
                {dollars(breakdown.totalCents)}
              </span>
            </div>
          </div>
          <p className="mb-4 text-xs text-bolt-elements-textSecondary">
            This billing period ({new Date(breakdown.periodStart).toLocaleDateString()} –{' '}
            {new Date(breakdown.periodEnd).toLocaleDateString()}) at the metered rates, broken down by resource.
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
                      {category.quantity.toLocaleString()} {category.unit} ·{' '}
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
      ) : null}
      <StatGrid
        stats={[
          {
            label: 'Projects',
            value: `${used('projects.count')} / ${data.quotas['projects.count'] ?? 0}`,
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
          {Object.entries(data.quotas).map(([quota, limit]) => {
            const override = overrideFor(quota);
            const effectiveLimit = override ? override.limit : limit;
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
                    {quota}
                    {override ? (
                      <span className="ml-2 rounded-full border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] uppercase text-bolt-elements-textTertiary">
                        override
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right text-bolt-elements-textSecondary">{usedValue}</span>
                  <span className="text-right text-bolt-elements-textSecondary">{effectiveLimit}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${humanizeQuotaKey(quota)} usage`}
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
                      {`You've used ${pct}% of your ${humanizeQuotaKey(quota)}`}
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
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Active quota overrides</h3>
          <p className="mb-3 text-xs text-bolt-elements-textSecondary">
            Custom limits applied to your organization (e.g. Enterprise allowances).
          </p>
          <ul className="flex flex-col gap-2">
            {overrides.map((override) => (
              <li key={override.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-bolt-elements-textPrimary">{override.key}</span>
                <span className="text-bolt-elements-textSecondary">
                  limit {override.limit}
                  {override.reason ? ` · ${override.reason}` : ''}
                  {override.expiresAt ? ` · until ${new Date(override.expiresAt).toLocaleDateString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {memberLimits && memberLimits.members.length ? (
        <div className="mt-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Member spend limits (Enterprise)</h3>
          <p className="mb-3 text-xs text-bolt-elements-textSecondary">
            Cap an individual member&apos;s usage-based spend below the organization default. A per-member limit
            overrides the org budget for that member. Leave the field blank and save to clear a limit.
          </p>
          {actionData?.ok ? (
            <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-300">
              {actionData.ok}
            </div>
          ) : null}
          {actionData?.error ? (
            <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {actionData.error}
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {memberLimits.members.map((member) => {
              const current = limitFor(member.userId);

              return (
                <li key={member.userId} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-bolt-elements-textPrimary">
                    {memberLabel(member)}
                    {member.role ? (
                      <span className="ml-2 text-[11px] uppercase text-bolt-elements-textTertiary">{member.role}</span>
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
                      aria-label={`Spend limit for ${memberLabel(member)} in euros`}
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
      ) : null}
    </AppShell>
  );
}
