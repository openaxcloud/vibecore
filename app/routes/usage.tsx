import { Activity, Boxes, Database, Sparkles } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { apiRequest, firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type UsageEvent = { id: string; type: string; quantity: number; createdAt?: string };
type QuotaOverride = { id: string; key: string; limit: number; reason?: string; expiresAt?: string };
type UsageData = {
  usage: UsageEvent[];
  quotas: Record<string, number>;
  quotaUsage?: Record<string, number>;
  overrides?: QuotaOverride[];
  plan: { name: string };
};

export const meta: MetaFunction = () => [{ title: 'Usage - E-Code' }];
export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  return apiRequest<UsageData>(request, `/orgs/${organization.id}/usage`);
}

export default function UsagePage() {
  const data = useLoaderData<typeof loader>();

  const used = (key: string) =>
    data.quotaUsage?.[key] ??
    data.usage.filter((event) => event.type === key).reduce((sum, event) => sum + event.quantity, 0);

  const overrides = data.overrides ?? [];
  const overrideFor = (key: string) => overrides.find((override) => override.key === key);

  return (
    <AppShell
      title="Usage overview"
      description="Track backend-enforced quota usage across projects, workspaces, AI, storage, snapshots, previews and deployments."
    >
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

            return (
              <div
                key={quota}
                className="grid grid-cols-[1fr_120px_120px] border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm last:border-b-0"
              >
                <span className="min-w-0 truncate">
                  {quota}
                  {override ? (
                    <span className="ml-2 rounded-full border border-bolt-elements-borderColor px-1.5 py-0.5 text-[10px] uppercase text-bolt-elements-textTertiary">
                      override
                    </span>
                  ) : null}
                </span>
                <span className="text-right text-bolt-elements-textSecondary">{used(quota)}</span>
                <span className="text-right text-bolt-elements-textSecondary">{override ? override.limit : limit}</span>
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
    </AppShell>
  );
}
