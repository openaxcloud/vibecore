import type { MetaFunction } from '@remix-run/cloudflare';
import { Link, useLoaderData } from '@remix-run/react';
import { AlertTriangle, BarChart3, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import type React from 'react';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type AdminSectionConfig = {
  title: string;
  description: string;
  endpoint: string;
  primaryKey?: string;
};

const adminSections: Record<string, AdminSectionConfig> = {
  overview: {
    title: 'Admin overview',
    description: 'Platform control plane for health, usage, security and operational counts.',
    endpoint: '/admin/overview',
  },
  health: {
    title: 'System health',
    description: 'Runtime, queue, database and Redis configuration status.',
    endpoint: '/admin/health',
  },
  users: {
    title: 'Users',
    description: 'Platform user accounts and suspension state.',
    endpoint: '/admin/users',
    primaryKey: 'users',
  },
  organizations: {
    title: 'Organizations',
    description: 'Tenant organizations and platform suspension state.',
    endpoint: '/admin/organizations',
    primaryKey: 'organizations',
  },
  projects: {
    title: 'Projects',
    description: 'Projects created across all organizations.',
    endpoint: '/admin/projects',
    primaryKey: 'projects',
  },
  workspaces: {
    title: 'Workspaces',
    description: 'Runtime workspace sessions and current states.',
    endpoint: '/admin/workspaces',
    primaryKey: 'workspaces',
  },
  terminals: {
    title: 'Terminals',
    description: 'Active terminal sessions associated with running workspaces.',
    endpoint: '/admin/terminals',
    primaryKey: 'terminals',
  },
  previews: {
    title: 'Previews',
    description: 'Workspace preview endpoints and statuses.',
    endpoint: '/admin/previews',
    primaryKey: 'previews',
  },
  deployments: {
    title: 'Deployments',
    description: 'Deployment records across projects.',
    endpoint: '/admin/deployments',
    primaryKey: 'deployments',
  },
  usage: {
    title: 'Usage',
    description: 'Usage events recorded across the platform.',
    endpoint: '/admin/usage',
    primaryKey: 'usage',
  },
  'ai-usage': {
    title: 'AI usage',
    description: 'AI cost and usage records across providers.',
    endpoint: '/admin/ai-usage',
    primaryKey: 'usage',
  },
  'provider-health': {
    title: 'Provider health',
    description: 'AI provider gateway health checks.',
    endpoint: '/admin/provider-health',
    primaryKey: 'providers',
  },
  quotas: {
    title: 'Quotas',
    description: 'Organization quota state, billing plans and overrides.',
    endpoint: '/admin/quotas',
    primaryKey: 'quotas',
  },
  'abuse-events': {
    title: 'Abuse events',
    description: 'Abuse events requiring review or resolution.',
    endpoint: '/admin/abuse-events',
    primaryKey: 'abuseEvents',
  },
  'security-events': {
    title: 'Security events',
    description: 'Authentication, MFA and security audit activity.',
    endpoint: '/admin/security-events',
    primaryKey: 'events',
  },
  'audit-logs': {
    title: 'Audit logs',
    description: 'Organization-scoped audit trail.',
    endpoint: '/admin/audit-logs',
    primaryKey: 'auditLogs',
  },
  'admin-audit-logs': {
    title: 'Admin audit logs',
    description: 'Platform administrator action trail.',
    endpoint: '/admin/admin-audit-logs',
    primaryKey: 'adminAuditLogs',
  },
  'support-tickets': {
    title: 'Support tickets',
    description: 'Customer support requests and response state.',
    endpoint: '/admin/support-tickets',
    primaryKey: 'tickets',
  },
  'feature-flags': {
    title: 'Feature flags',
    description: 'Feature flag rollout configuration.',
    endpoint: '/admin/feature-flags',
    primaryKey: 'flags',
  },
  'system-settings': {
    title: 'System settings',
    description: 'Platform configuration settings stored by the API.',
    endpoint: '/admin/system-settings',
    primaryKey: 'settings',
  },
  costs: {
    title: 'Costs',
    description: 'AI cost totals and usage records.',
    endpoint: '/admin/costs',
    primaryKey: 'aiCosts',
  },
};

const navItems = [
  'overview',
  'health',
  'users',
  'organizations',
  'projects',
  'workspaces',
  'previews',
  'deployments',
  'usage',
  'ai-usage',
  'quotas',
  'abuse-events',
  'security-events',
  'audit-logs',
  'admin-audit-logs',
  'support-tickets',
  'feature-flags',
  'system-settings',
  'costs',
];

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.config.title} - VibeCore` : 'Admin - VibeCore' },
];

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const section = params.section ?? 'overview';
  const config = adminSections[section];

  if (!config) {
    throw json({ error: 'Admin section is not available.' }, { status: 404 });
  }

  const payload = await apiRequest<Record<string, JsonValue>>(request, config.endpoint);

  return { section, config, payload };
}

export default function AdminSectionPage() {
  const { section, config, payload } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title={config.title}
      description={config.description}
      actions={<LinkButton to="/admin/billing">Billing admin</LinkButton>}
    >
      <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
        <AdminNav active={section} />
        <div className="grid gap-6">
          {section === 'overview' ? <OverviewPanel payload={payload} /> : null}
          {section === 'health' ? <HealthPanel payload={payload} /> : null}
          {section !== 'overview' && section !== 'health' ? <DataPanel config={config} payload={payload} /> : null}
        </div>
      </div>
    </AppShell>
  );
}

function AdminNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Admin sections"
      className="h-max rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-sm"
    >
      {navItems.map((item) => (
        <Link
          key={item}
          to={`/admin/${item}`}
          className={[
            'flex min-h-8 items-center rounded-md px-2 text-sm transition-colors',
            active === item
              ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
              : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
          ].join(' ')}
        >
          {adminSections[item].title}
        </Link>
      ))}
    </nav>
  );
}

function OverviewPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const counts = asRecord(payload.counts);
  const cost = asRecord(payload.cost);
  const health = asRecord(payload.health);

  const countCards = Object.entries(counts).map(([key, value]) => ({
    label: labelize(key),
    value: String(value ?? 0),
  }));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {countCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cost summary" icon="cost">
          <KeyValueGrid value={cost} />
        </SectionCard>
        <SectionCard title="Health summary" icon="health">
          <StatusGrid value={health} />
        </SectionCard>
      </div>
    </>
  );
}

function HealthPanel({ payload }: { payload: Record<string, JsonValue> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Object.entries(payload).map(([key, value]) => (
        <SectionCard key={key} title={labelize(key)} icon="health">
          <KeyValueGrid value={asRecord(value)} />
        </SectionCard>
      ))}
    </div>
  );
}

function DataPanel({ config, payload }: { config: AdminSectionConfig; payload: Record<string, JsonValue> }) {
  const primary = getPrimaryCollection(payload, config.primaryKey);

  if (primary.length > 0) {
    return (
      <SectionCard title={`${config.title} records`} icon="table">
        <DataTable rows={primary} />
      </SectionCard>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Object.entries(payload).map(([key, value]) => (
        <SectionCard key={key} title={labelize(key)} icon="table">
          {Array.isArray(value) ? <DataTable rows={value} /> : <KeyValueGrid value={asRecord(value)} />}
        </SectionCard>
      ))}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <p className="text-sm text-bolt-elements-textSecondary">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-bolt-elements-textPrimary">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: 'cost' | 'health' | 'table';
  children: React.ReactNode;
}) {
  const Icon = icon === 'health' ? ShieldCheck : icon === 'cost' ? BarChart3 : Database;

  return (
    <section className="overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      <header className="flex min-h-11 items-center gap-2 border-b border-bolt-elements-borderColor px-4">
        <Icon className="h-4 w-4 text-bolt-elements-textSecondary" aria-hidden />
        <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function StatusGrid({ value }: { value: Record<string, JsonValue> }) {
  return (
    <div className="grid gap-3">
      {Object.entries(value).map(([key, entry]) => {
        const record = asRecord(entry);
        const status = String(record.status ?? 'unknown');
        const healthy = ['healthy', 'configured', 'ok', 'active'].includes(status);
        const Icon = healthy ? CheckCircle2 : AlertTriangle;

        return (
          <div
            key={key}
            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
          >
            <div className="flex items-center gap-2">
              <Icon className={healthy ? 'h-4 w-4 text-green-500' : 'h-4 w-4 text-yellow-500'} aria-hidden />
              <strong className="text-sm text-bolt-elements-textPrimary">{labelize(key)}</strong>
              <span className="ml-auto rounded-md border border-bolt-elements-borderColor px-2 py-0.5 text-xs text-bolt-elements-textSecondary">
                {status}
              </span>
            </div>
            <KeyValueGrid value={record} compact />
          </div>
        );
      })}
    </div>
  );
}

function KeyValueGrid({ value, compact = false }: { value: Record<string, JsonValue>; compact?: boolean }) {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return <p className="text-sm text-bolt-elements-textSecondary">No data available.</p>;
  }

  return (
    <dl className={compact ? 'mt-3 grid gap-2 text-sm' : 'grid gap-3 text-sm'}>
      {entries.map(([key, entry]) => (
        <div key={key} className="grid gap-1 sm:grid-cols-[180px_1fr]">
          <dt className="text-bolt-elements-textSecondary">{labelize(key)}</dt>
          <dd className="min-w-0 break-words font-medium text-bolt-elements-textPrimary">{formatValue(entry)}</dd>
        </div>
      ))}
    </dl>
  );
}

function DataTable({ rows }: { rows: JsonValue[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-bolt-elements-textSecondary">No records found.</p>;
  }

  const objects = rows.map((row) => asRecord(row));
  const columns = Array.from(new Set(objects.flatMap((row) => Object.keys(row)))).slice(0, 8);

  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-bolt-elements-borderColor text-bolt-elements-textPrimary">
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-semibold">
                {labelize(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {objects.slice(0, 100).map((row, index) => (
            <tr key={String(row.id ?? index)} className="border-b border-bolt-elements-borderColor last:border-b-0">
              {columns.map((column) => (
                <td key={column} className="max-w-[260px] px-3 py-2 text-bolt-elements-textSecondary">
                  <span className="line-clamp-3 break-words">{formatValue(row[column])}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {objects.length > 100 ? (
        <p className="mt-3 text-xs text-bolt-elements-textSecondary">Showing first 100 of {objects.length} records.</p>
      ) : null}
    </div>
  );
}

function getPrimaryCollection(payload: Record<string, JsonValue>, primaryKey?: string) {
  if (primaryKey && Array.isArray(payload[primaryKey])) {
    return payload[primaryKey] as JsonValue[];
  }

  const firstArray = Object.values(payload).find(Array.isArray);

  return (firstArray ?? []) as JsonValue[];
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function formatValue(value: JsonValue | undefined): string {
  if (value === null || typeof value === 'undefined') {
    return 'not set';
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  if (typeof value === 'string') {
    return value || 'not set';
  }

  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }

  return JSON.stringify(value);
}

function labelize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
