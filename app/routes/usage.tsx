import type { MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Activity, Boxes, Database, Sparkles } from 'lucide-react';
import { AppShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import { apiRequest, firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type UsageEvent = { id: string; type: string; quantity: number; createdAt?: string };
type UsageData = {
  usage: UsageEvent[];
  quotas: Record<string, number>;
  quotaUsage?: Record<string, number>;
  plan: { name: string };
};

export const meta: MetaFunction = () => [{ title: 'Usage - VibeCore' }];
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
          {Object.entries(data.quotas).map(([quota, limit]) => (
            <div
              key={quota}
              className="grid grid-cols-[1fr_120px_120px] border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">{quota}</span>
              <span className="text-right text-bolt-elements-textSecondary">{used(quota)}</span>
              <span className="text-right text-bolt-elements-textSecondary">{limit}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
