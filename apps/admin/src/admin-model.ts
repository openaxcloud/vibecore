export interface AdminSection {
  id: string;
  label: string;
  endpoint: string;
  collectionKey: string;
  description: string;
  exportable?: boolean;
}

export const adminSections: AdminSection[] = [
  { id: 'overview', label: 'Overview', endpoint: '/admin/overview', collectionKey: 'overview', description: 'Global platform health and operating metrics.' },
  { id: 'users', label: 'Users', endpoint: '/admin/users', collectionKey: 'users', description: 'Platform users, MFA state, sessions and suspension status.' },
  { id: 'organizations', label: 'Organizations', endpoint: '/admin/organizations', collectionKey: 'organizations', description: 'Tenant organizations and suspension controls.' },
  { id: 'projects', label: 'Projects', endpoint: '/admin/projects', collectionKey: 'projects', description: 'Project metadata across tenants. Secrets are never shown.' },
  { id: 'workspaces', label: 'Workspaces', endpoint: '/admin/workspaces', collectionKey: 'workspaces', description: 'Workspace lifecycle, runtime mode and operator controls.' },
  { id: 'terminals', label: 'Active terminals', endpoint: '/admin/terminals', collectionKey: 'terminals', description: 'Live terminal sessions by workspace.' },
  { id: 'previews', label: 'Previews', endpoint: '/admin/previews', collectionKey: 'previews', description: 'Preview routes exposed by workspaces.' },
  { id: 'deployments', label: 'Deployments', endpoint: '/admin/deployments', collectionKey: 'deployments', description: 'Deployment history and current status.' },
  { id: 'billing', label: 'Billing', endpoint: '/admin/billing', collectionKey: 'plans', description: 'Billing plans, subscriptions and manual markers.' },
  { id: 'usage', label: 'Usage', endpoint: '/admin/usage', collectionKey: 'usage', description: 'Usage events across organizations.' },
  { id: 'ai-usage', label: 'AI usage', endpoint: '/admin/ai-usage', collectionKey: 'usage', description: 'AI token and cost ledger.' },
  { id: 'credit-wallets', label: 'Credit wallets', endpoint: '/admin/wallets', collectionKey: 'wallets', description: 'Org credit balances, signed adjustments (reason required) and movement history.' },
  { id: 'agent-routing', label: 'Agent routing', endpoint: '/admin/agent-routing', collectionKey: 'lines', description: 'Mode → model routing card: cost of revenue, billed multiplier, live margins (negative blocks), 30-day volume, versioned history and the per-call log.' },
  { id: 'ai-models', label: 'AI models', endpoint: '/admin/models', collectionKey: 'models', description: 'Plan × model access matrix, cost per 1M tokens, and enable/disable (≥1 active per plan).' },
  { id: 'agent-checkpoints', label: 'Agent checkpoints', endpoint: '/admin/checkpoints/storage', collectionKey: 'byOrg', description: 'Per-org checkpoint storage footprint, retention rule and manual purge with estimate.' },
  { id: 'provider-health', label: 'Provider health', endpoint: '/admin/provider-health', collectionKey: 'providers', description: 'AI gateway and provider status.' },
  { id: 'quotas', label: 'Quotas', endpoint: '/admin/quotas', collectionKey: 'quotas', description: 'Plan limits, usage and quota overrides.' },
  { id: 'abuse-events', label: 'Abuse events', endpoint: '/admin/abuse-events', collectionKey: 'abuseEvents', description: 'Abuse queue and resolution flow.' },
  { id: 'security-events', label: 'Security events', endpoint: '/admin/security-events', collectionKey: 'events', description: 'Authentication, MFA and security-relevant events.' },
  { id: 'account-deletions', label: 'Account deletions', endpoint: '/admin/account-deletions', collectionKey: 'requests', description: 'Pending self-serve deletions: 14-day purge queue, TTL and cancel.' },
  { id: 'audit-logs', label: 'Audit logs', endpoint: '/admin/audit-logs', collectionKey: 'auditLogs', description: 'Tenant audit trail.', exportable: true },
  { id: 'admin-audit-logs', label: 'Admin audit logs', endpoint: '/admin/admin-audit-logs', collectionKey: 'adminAuditLogs', description: 'Operator action timeline.', exportable: true },
  { id: 'support-tickets', label: 'Support tickets', endpoint: '/admin/support-tickets', collectionKey: 'tickets', description: 'Support queue and admin responses.' },
  { id: 'feature-flags', label: 'Feature flags', endpoint: '/admin/feature-flags', collectionKey: 'flags', description: 'Create and roll out flags safely.' },
  { id: 'system-settings', label: 'System settings', endpoint: '/admin/system-settings', collectionKey: 'settings', description: 'Global platform settings.' },
  { id: 'kubernetes-health', label: 'Kubernetes health', endpoint: '/admin/health', collectionKey: 'kubernetes', description: 'Cluster runtime and sandbox configuration.' },
  { id: 'queue-health', label: 'Queue health', endpoint: '/admin/health', collectionKey: 'queues', description: 'Queue connectivity.' },
  { id: 'database-health', label: 'Database health', endpoint: '/admin/health', collectionKey: 'database', description: 'PostgreSQL connectivity.' },
  { id: 'redis-health', label: 'Redis health', endpoint: '/admin/health', collectionKey: 'redis', description: 'Redis connectivity.' },
  { id: 'costs', label: 'Cost dashboard', endpoint: '/admin/costs', collectionKey: 'aiCosts', description: 'AI and platform cost signals.' },
  { id: 'announcements', label: 'Announcements', endpoint: '/admin/system-settings', collectionKey: 'settings', description: 'Global announcements.' },
  { id: 'incident-banner', label: 'Incident banner/status', endpoint: '/admin/system-settings', collectionKey: 'settings', description: 'Incident banner and status page controls.' },
];

export const dangerousActions = new Set([
  'suspend-user',
  'unsuspend-user',
  'suspend-org',
  'stop-workspace',
  'restart-workspace',
  'delete-workspace',
  'force-logout',
  'reset-mfa',
  'quota-override',
  'plan-override',
  'refund-note',
  'redact-logs',
  'resolve-abuse',
  'respond-ticket',
  'create-flag',
  'maintenance',
  'announcement',
  'incident',
]);

export function collectionFromResponse(response: unknown, section: AdminSection) {
  const source = response as Record<string, unknown>;

  if (section.collectionKey === 'overview') {
    return [source];
  }

  const direct = source[section.collectionKey];

  if (Array.isArray(direct)) {
    return direct as Record<string, unknown>[];
  }

  if (direct && typeof direct === 'object') {
    return [direct as Record<string, unknown>];
  }

  return [];
}

export function searchableText(row: Record<string, unknown>) {
  return Object.values(row)
    .map((value) => (typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')))
    .join(' ')
    .toLowerCase();
}

export function sortRows(rows: Record<string, unknown>[], key: string, direction: 'asc' | 'desc') {
  return [...rows].sort((left, right) => {
    const a = String(left[key] ?? '');
    const b = String(right[key] ?? '');
    return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  });
}

