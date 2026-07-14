import { AlertTriangle, BarChart3, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Link, useFetcher, useLoaderData, useNavigate, useNavigation, useSearchParams } from 'react-router';
import { InfrastructurePanel } from '~/components/admin/InfrastructurePanel';
import { SupportTicketsPanel } from '~/components/admin/SupportTicketsPanel';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { ConfirmationDialog, Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Dropdown, DropdownItem, DropdownSeparator } from '~/components/ui/Dropdown';
import { FilterChip } from '~/components/ui/FilterChip';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiRequest,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
  json,
  redirect,
  requirePlatformAdmin,
  sessionCookie,
} from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime, formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { budgetTone, centsToUsd } from '~/utils/admin-cost-budget';
import { rowsToCsv } from '~/utils/admin-csv';
import { errorRateTone, moveItem } from '~/utils/admin-provider-metrics';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type AdminSectionConfig = {
  title: string;
  description: string;

  /* Sections whose panel fetches its own data (e.g. developer-tools) omit this. */
  endpoint?: string;
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
  monitoring: {
    title: 'Monitoring',
    description:
      'Platform monitoring dashboard — AI cost over time, cost/token breakdown by provider & model, cost by organization, and provider gateway health. Read-only; visualizes existing admin metrics.',

    // Self-combined in the loader from /admin/costs + /admin/provider-health.
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
  infrastructure: {
    title: 'Infrastructure',
    description:
      'Live cluster capacity: running workspaces, pods, CPU/RAM used vs reserved, node count vs autoscaling max, autoscaling state, idle-stopped workspaces. Alerts when the pool approaches its ceiling. Read-only.',

    // Self-loaded from /admin/capacity (workspace-manager kubectl + metrics-server).
  },
  terminals: {
    title: 'Terminals',
    description:
      'Estimated terminal activity — one entry per running workspace. The runtime exposes no per-session terminal enumeration, so these are derived, not real session ids.',
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
  'account-deletions': {
    title: 'Account deletions',
    description: 'Pending self-serve account deletions — grace period, ready-to-purge and purged.',
    endpoint: '/admin/account-deletions',
    primaryKey: 'deletions',
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
  'ops-controls': {
    title: 'Ops controls',
    description:
      'Platform-wide operational broadcasts — maintenance mode, user announcements and the incident banner. Step-up protected; changes take effect immediately.',

    // Reuses the system-settings read so the forms can prefill current state.
    endpoint: '/admin/system-settings',
    primaryKey: 'settings',
  },
  costs: {
    title: 'Costs',
    description: 'AI cost totals and usage records.',
    endpoint: '/admin/costs',
    primaryKey: 'aiCosts',
  },
  providers: {
    title: 'AI providers',
    description:
      'Platform-owned AI provider registry — enable/disable providers, set the fallback order, and set each provider’s platform API key (write-only, encrypted; runtime resolves it DB-first and falls back to the env var).',
    endpoint: '/admin/providers',
    primaryKey: 'providers',
  },
  models: {
    title: 'AI models',
    description: 'Platform model registry — users may only use models enabled here, gated by plan.',
    endpoint: '/admin/models',
    primaryKey: 'models',
  },
  'oauth-providers': {
    title: 'OAuth providers',
    description:
      'Git provider OAuth apps (GitHub/GitLab/Bitbucket). Set each app’s client id/secret so users can Connect — no env vars or redeploy needed.',
    endpoint: '/admin/connectors/oauth',
    primaryKey: 'connectors',
  },
  wallets: {
    title: 'Credit wallets',
    description: 'Per-organization credit balances, budget caps and service-shutdown limits.',
    endpoint: '/admin/wallets',
    primaryKey: 'wallets',
  },
  checkpoints: {
    title: 'Agent checkpoints',
    description: 'Effort-based checkpoints (one per Agent request) with cost and power-control flags.',
    endpoint: '/admin/checkpoints',
    primaryKey: 'checkpoints',
  },
  'stripe-health': {
    title: 'Stripe health',
    description: 'Stripe secret-key configuration and connectivity (live/test mode).',
    endpoint: '/admin/stripe-health',
  },
  'mcp-catalog': {
    title: 'MCP catalog',
    description:
      'Manage the MCP marketplace catalog — create, edit, feature/verify/unpublish and delete entries. Also set per-organization MCP policy (force-enable, allow-list or block a catalog entry for an org).',
    endpoint: '/admin/mcp/catalog',
    primaryKey: 'entries',
  },
  'developer-tools': {
    title: 'Developer tools',
    description:
      'Operational diagnostics (Debug, Local data, Service Status, Event Logs) — hidden from the user settings panel; reachable here by platform admins only.',
  },
};

/*
 * Admin nav in 6 labelled groups (design-handoff B6). Routes and the relative
 * order of entries WITHIN each group are unchanged from the historical flat
 * list — only the grouping and labels are new.
 */
const navGroups: Array<{ label: string; items: string[] }> = [
  {
    label: 'Platform',
    items: ['overview', 'health', 'monitoring', 'infrastructure', 'projects', 'workspaces', 'previews', 'deployments'],
  },
  {
    label: 'People',
    items: ['users', 'organizations', 'support-tickets', 'account-deletions'],
  },
  {
    label: 'Usage & billing',
    items: ['usage', 'ai-usage', 'quotas', 'costs', 'wallets', 'checkpoints', 'stripe-health'],
  },
  {
    label: 'Security',
    items: ['abuse-events', 'security-events', 'audit-logs', 'admin-audit-logs', 'oauth-providers'],
  },
  {
    label: 'AI',
    items: ['providers', 'models', 'mcp-catalog'],
  },
  {
    label: 'Ops',
    items: ['feature-flags', 'system-settings', 'ops-controls', 'developer-tools'],
  },
];

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.config.title} - E-Code` : 'Admin - E-Code' },
];

/*
 * Audit-log sections support a CSV/JSON file download via `?export=csv|json`.
 * The API base URL is server-only (can be an internal cluster host), so a raw
 * browser anchor to the API would not authenticate or resolve. Instead the
 * loader fetches the export over the session cookie and streams it back as a
 * downloadable attachment. CSV comes back from the API as text/csv (a string);
 * JSON comes back parsed, so we re-stringify it.
 */
const AUDIT_EXPORT_ENDPOINTS: Record<string, string> = {
  'audit-logs': '/admin/audit-logs',
  'admin-audit-logs': '/admin/admin-audit-logs',
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const section = params.section ?? 'overview';
  const config = adminSections[section];

  if (!config) {
    throw json({ error: 'Admin section is not available.' }, { status: 404 });
  }

  const url = new URL(request.url);
  const exportFormat = url.searchParams.get('export');

  if (exportFormat && AUDIT_EXPORT_ENDPOINTS[section]) {
    const format = exportFormat === 'csv' ? 'csv' : 'json';

    /*
     * Export exactly what the panel shows: fetch the JSON rows and apply the
     * same family/actor/period filters as the client view before serializing.
     */
    const result = (await apiRequest<Record<string, JsonValue>>(request, AUDIT_EXPORT_ENDPOINTS[section])) ?? {};
    const rows = (Object.values(result).find(Array.isArray) ?? []) as Array<Record<string, JsonValue>>;

    const filtered = filterAuditRows(rows, {
      family: url.searchParams.get('family') ?? undefined,
      actor: url.searchParams.get('actor') ?? undefined,
      sinceDays: Number(url.searchParams.get('period')) || undefined,
    });

    const body = format === 'csv' ? auditRowsToCsv(filtered) : JSON.stringify(filtered, null, 2);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return new Response(body, {
      headers: {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${section}-${stamp}.${format}"`,
        'cache-control': 'no-store',
      },
    });
  }

  /*
   * F24: account-deletions export. The purge queue is a small, self-contained set
   * of rows (userId / email / status / requestedAt / purgeDueAt) — stream it as a
   * CSV/JSON download over the session cookie, same pattern as the audit exports.
   */
  if (exportFormat && section === 'account-deletions') {
    const format = exportFormat === 'csv' ? 'csv' : 'json';
    const result = (await apiRequest<Record<string, JsonValue>>(request, '/admin/account-deletions')) ?? {};
    const rows = (Array.isArray(result.requests) ? result.requests : []) as Array<Record<string, JsonValue>>;
    const columns = ['userId', 'email', 'status', 'requestedAt', 'purgeDueAt'];
    const body = format === 'csv' ? rowsToCsv(rows, columns) : JSON.stringify(rows, null, 2);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    return new Response(body, {
      headers: {
        'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="account-deletions-${stamp}.${format}"`,
        'cache-control': 'no-store',
      },
    });
  }

  /*
   * F23: the count of unresolved security events powers a badge on the admin
   * sidebar's Security-events nav item — so it shows on every admin page, not
   * only that section. Fetched in parallel with the section payload and guarded
   * (never blocks/breaks the page). When we're already on the security-events
   * page we derive it from that section's payload instead of fetching twice.
   */
  const securityOpenCountPromise: Promise<number | undefined> =
    section === 'security-events'
      ? Promise.resolve(undefined)
      : apiRequest<{ openCount?: number }>(request, '/admin/security-events')
          .then((result) => (typeof result?.openCount === 'number' ? result.openCount : undefined))
          .catch(() => undefined);

  /*
   * Monitoring is a read-only dashboard that VISUALIZES several existing admin
   * JSON endpoints. The web's API base URL is server-only, so a client panel
   * can't hit /admin/* directly — instead we fan out the reads here (over the
   * same session cookie as every other admin loader) and hand the panel one
   * combined payload. No new backend: /admin/costs already returns aiCostCents +
   * the full aiCosts ledger + usage events; /admin/provider-health returns the
   * gateway status. allSettled so a single slow/failed probe doesn't blank the
   * whole dashboard.
   */
  if (section === 'monitoring') {
    /*
     * `?probe=1` opts into a real, bounded liveness probe of the non-gateway
     * providers (forwarded to the API). Default loads make no outbound provider
     * calls — the button below re-loads this route with the flag.
     */
    const liveProbe = url.searchParams.get('probe') === '1';
    const providerHealthPath = `/admin/provider-health${liveProbe ? '?probe=1' : ''}`;

    const [costs, providerHealth, platformMetrics] = await Promise.allSettled([
      apiRequest<Record<string, JsonValue>>(request, '/admin/costs'),
      apiRequest<Record<string, JsonValue>>(request, providerHealthPath),
      apiRequest<Record<string, JsonValue>>(request, '/admin/platform-metrics'),
    ]);

    const payload: Record<string, JsonValue> = {
      ...(costs.status === 'fulfilled' ? costs.value : {}),
      providers: providerHealth.status === 'fulfilled' ? (providerHealth.value.providers ?? []) : [],
      providerHealthError: providerHealth.status === 'rejected',
      costsError: costs.status === 'rejected',
      platformMetrics: platformMetrics.status === 'fulfilled' ? platformMetrics.value : null,
      platformMetricsError: platformMetrics.status === 'rejected',
      liveProbe,
    };

    return { section, config, payload, securityOpenCount: await securityOpenCountPromise };
  }

  /*
   * Infrastructure: the api combines the workspace-manager's live cluster
   * snapshot with configurable alert thresholds. Tolerant load — a momentary
   * manager/metrics outage renders the "unavailable" state, not a 500.
   */
  if (section === 'infrastructure') {
    const payload = await apiRequest<Record<string, JsonValue>>(request, '/admin/capacity').catch(() => ({
      available: false,
    }));

    return { section, config, payload, securityOpenCount: await securityOpenCountPromise };
  }

  /*
   * The users list is server-paginated/sorted/searched: pass the panel's URL
   * state straight through to the API.
   */
  if (section === 'users') {
    const passthrough = new URLSearchParams();

    for (const key of ['page', 'sort', 'dir', 'q'] as const) {
      const value = url.searchParams.get(key);

      if (value) {
        passthrough.set(key, value);
      }
    }

    const qs = passthrough.toString();
    const payload = await apiRequest<Record<string, JsonValue>>(request, `/admin/users${qs ? `?${qs}` : ''}`);

    return { section, config, payload, securityOpenCount: await securityOpenCountPromise };
  }

  /*
   * F18 providers: the panel is an ordered, actionable list, so it reads the
   * fallback-order endpoint (saved order first + per-provider enabled state +
   * p95/error thresholds) instead of the flat /admin/providers toggle list.
   */
  if (section === 'providers') {
    const payload = await apiRequest<Record<string, JsonValue>>(request, '/admin/providers/fallback-order');
    return { section, config, payload, securityOpenCount: await securityOpenCountPromise };
  }

  /*
   * F26 costs: the panel needs the 30-day-per-provider series + monthly budget
   * gauge, so it reads /admin/costs/summary (days × provider series, month-to-date
   * spend, budget + 80/100% alert level) rather than the raw /admin/costs ledger.
   */
  if (section === 'costs') {
    const payload = await apiRequest<Record<string, JsonValue>>(request, '/admin/costs/summary');
    return { section, config, payload, securityOpenCount: await securityOpenCountPromise };
  }

  // Sections without an endpoint (developer-tools) render self-fetching panels.
  const payload = config.endpoint
    ? await apiRequest<Record<string, JsonValue>>(request, config.endpoint)
    : ({} as Record<string, JsonValue>);

  // On the security-events page itself the count is in the payload (no 2nd fetch).
  const securityOpenCount =
    section === 'security-events' && typeof payload.openCount === 'number'
      ? payload.openCount
      : await securityOpenCountPromise;

  return { section, config, payload, securityOpenCount };
}

/*
 * Admin mutations (user management today) require BOTH platform-admin and a
 * recent (≤5 min) API re-authentication. We collect the admin's password with
 * the action, step the session up via /auth/reauth, then perform the mutation —
 * the same pattern as admin.billing.tsx. No hand-pasted token: auth rides the
 * session cookie like every other in-app admin request.
 */
async function reauthenticate(request: Request, password: string): Promise<string | undefined> {
  try {
    await apiRequest(request, '/auth/reauth', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({ password }),
    });

    return undefined;
  } catch (error) {
    if (error instanceof Response && error.status === 401) {
      return 'Incorrect password. Re-enter it to confirm this change.';
    }

    throw error;
  }
}

async function adminMutationError(error: unknown): Promise<string> {
  if (error instanceof Response) {
    const payload = (await error.json().catch(() => ({}))) as { error?: string; code?: string };

    if (payload.code === 'ADMIN_REAUTH_REQUIRED') {
      return 'Re-authentication expired. Enter your password and try again.';
    }

    if (payload.code === 'PLATFORM_ADMIN_REQUIRED') {
      return 'This action requires a platform administrator account.';
    }

    return payload.error ?? 'The change could not be applied.';
  }

  return 'The admin service is not reachable. Please try again in a moment.';
}

const USER_POST_INTENTS: Record<string, string> = {
  'force-logout': 'force-logout',
  'reset-mfa': 'reset-mfa',
};

const USER_INTENT_OK: Record<string, string> = {
  'platform-admin-grant': 'Promoted to platform admin.',
  'platform-admin-revoke': 'Revoked platform admin.',
  suspend: 'User suspended.',
  unsuspend: 'User reactivated.',
  'force-logout': 'All sessions revoked.',
  'reset-mfa': 'MFA reset for the user.',
  'quota-override': 'Quota override created.',
};

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const userId = String(form.get('userId') ?? '');
  const password = String(form.get('password') ?? '');

  if (!password) {
    return json({ ok: false, userId, error: 'Enter your password to apply this change.' }, { status: 400 });
  }

  let reauthError: string | undefined;

  try {
    reauthError = await reauthenticate(request, password);
  } catch (error) {
    /*
     * reauthenticate() only returns a string for 401; non-401 (API 500/timeout/
     * network) re-throws. Catch it so a transient failure surfaces inline instead
     * of crashing the whole admin panel to the root ErrorBoundary.
     */
    return json({ ok: false, userId, error: await adminMutationError(error) }, { status: 502 });
  }

  if (reauthError) {
    return json({ ok: false, userId, error: reauthError }, { status: 401 });
  }

  try {
    // Registry / feature-flag toggles (no userId).
    if (intent === 'provider-toggle') {
      const enabled = String(form.get('value')) === 'true';
      const provider = String(form.get('provider') ?? '');
      await apiRequest(request, '/admin/providers/toggle', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ provider, displayName: String(form.get('displayName') ?? provider), enabled }),
      });

      return json({ ok: true, rowId: provider, message: `Provider ${enabled ? 'enabled' : 'disabled'}.` });
    }

    /*
     * Set a provider's platform API key (write-only). The backend
     * (POST /admin/providers/:provider/credentials) encrypts it into
     * ProviderConfig.apiKeyEnc and the runtime resolves it DB-first. This is the UI
     * that was missing — without it an admin could enable a provider but never give
     * it a key, so every keyless provider stayed dead.
     */
    if (intent === 'provider-credentials') {
      const provider = String(form.get('provider') ?? '');
      const apiKey = String(form.get('apiKey') ?? '').trim();

      if (!apiKey) {
        return json({ ok: false, rowId: provider, error: 'Enter an API key.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/providers/${encodeURIComponent(provider)}/credentials`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ apiKey }),
      });

      return json({ ok: true, rowId: provider, message: `${provider} platform key saved.` });
    }

    // F18: persist a new provider fallback order (the full reordered name list).
    if (intent === 'provider-reorder') {
      let order: string[];

      try {
        const parsed = JSON.parse(String(form.get('order') ?? '[]'));
        order = Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return json({ ok: false, rowId: 'fallback-order', error: 'Invalid order.' }, { status: 400 });
      }

      if (order.length === 0) {
        return json({ ok: false, rowId: 'fallback-order', error: 'Order is empty.' }, { status: 400 });
      }

      await apiRequest(request, '/admin/providers/fallback-order', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ order }),
      });

      return json({ ok: true, rowId: 'fallback-order', message: 'Fallback order updated.' });
    }

    if (intent === 'model-toggle') {
      const enabled = String(form.get('value')) === 'true';
      const provider = String(form.get('provider') ?? '');
      const modelId = String(form.get('modelId') ?? '');
      await apiRequest(request, '/admin/models/toggle', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ provider, modelId, enabled }),
      });

      return json({ ok: true, rowId: `${provider}:${modelId}`, message: `Model ${enabled ? 'enabled' : 'disabled'}.` });
    }

    if (intent === 'feature-flag') {
      const enabled = String(form.get('value')) === 'true';
      const key = String(form.get('key') ?? '');
      await apiRequest(request, '/admin/feature-flags', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ key, enabled }),
      });

      return json({ ok: true, rowId: key, message: `Flag ${enabled ? 'enabled' : 'disabled'}.` });
    }

    if (intent === 'connector-oauth') {
      const provider = String(form.get('provider') ?? '');
      const secret = String(form.get('clientSecret') ?? '');

      const body: Record<string, unknown> = {
        provider,
        clientId: String(form.get('clientId') ?? ''),
        enabled: String(form.get('enabled')) === 'true',
      };

      // Only send the secret when the admin typed a new one — blank keeps the stored one.
      if (secret) {
        body.clientSecret = secret;
      }

      await apiRequest(request, '/admin/connectors/oauth', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify(body),
      });

      return json({ ok: true, rowId: provider, message: `${provider} OAuth credentials saved.` });
    }

    if (intent === 'quota-override') {
      const organizationId = String(form.get('organizationId') ?? '');
      const key = String(form.get('key') ?? '');
      const reason = String(form.get('reason') ?? '');

      if (!organizationId || !key) {
        return json({ ok: false, error: 'Organization ID and quota key are required.' }, { status: 400 });
      }

      const limit = Number(form.get('limit'));

      if (!Number.isFinite(limit) || limit < 0) {
        return json({ ok: false, error: 'Invalid quota limit.' }, { status: 400 });
      }

      await apiRequest(request, '/admin/quota-overrides', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({
          organizationId,
          key,
          limit,
          reason: reason || 'Admin quota override',
        }),
      });

      return json({ ok: true, rowId: `${organizationId}:${key}`, message: USER_INTENT_OK['quota-override'] });
    }

    if (intent === 'system-setting') {
      const key = String(form.get('key') ?? '').trim();

      if (!key) {
        return json({ ok: false, error: 'Setting key is required.' }, { status: 400 });
      }

      const rawValue = String(form.get('value') ?? '');

      // Store real JSON when the admin typed a boolean/number/object; otherwise keep the string.
      let value: unknown = rawValue;

      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }

      await apiRequest(request, '/admin/system-settings', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ key, value }),
      });

      return json({ ok: true, rowId: key, message: `Saved system setting "${key}".` });
    }

    // Ops controls — platform-wide operational broadcasts.
    if (intent === 'maintenance-mode') {
      const enabled = String(form.get('enabled')) === 'true';
      const message = String(form.get('message') ?? '').trim();

      // adminMaintenanceSchema: { enabled: boolean, message?: string }
      const body: Record<string, unknown> = { enabled };

      if (message) {
        body.message = message;
      }

      await apiRequest(request, '/admin/maintenance-mode', {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify(body),
      });

      return json({
        ok: true,
        rowId: 'maintenance-mode',
        message: enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.',
      });
    }

    if (intent === 'announcement') {
      const message = String(form.get('message') ?? '').trim();
      const severity = String(form.get('severity') ?? 'info');
      const active = String(form.get('active')) === 'true';

      // adminAnnouncementSchema requires a non-empty message even when clearing.
      if (!message) {
        return json({ ok: false, rowId: 'announcement', error: 'Enter an announcement message.' }, { status: 400 });
      }

      await apiRequest(request, '/admin/announcements', {
        method: 'POST',
        redirectOn401: false,

        // adminAnnouncementSchema: { message, severity: info|warning|critical, active }
        body: JSON.stringify({ message, severity, active }),
      });

      return json({
        ok: true,
        rowId: 'announcement',
        message: active ? 'Announcement published.' : 'Announcement cleared.',
      });
    }

    if (intent === 'incident-banner') {
      const message = String(form.get('message') ?? '').trim();
      const status = String(form.get('status') ?? 'investigating');
      const active = String(form.get('active')) === 'true';

      // adminIncidentSchema requires a non-empty message even when clearing.
      if (!message) {
        return json({ ok: false, rowId: 'incident-banner', error: 'Enter an incident message.' }, { status: 400 });
      }

      await apiRequest(request, '/admin/incident-banner', {
        method: 'POST',
        redirectOn401: false,

        // adminIncidentSchema: { message, status: investigating|identified|monitoring|resolved, active }
        body: JSON.stringify({ message, status, active }),
      });

      return json({
        ok: true,
        rowId: 'incident-banner',
        message: active ? 'Incident banner published.' : 'Incident banner cleared.',
      });
    }

    // Workspace lifecycle actions (Stop / Restart / Delete).
    if (intent === 'workspace-stop' || intent === 'workspace-restart' || intent === 'workspace-delete') {
      const workspaceId = String(form.get('workspaceId') ?? '');

      if (!workspaceId) {
        return json({ ok: false, error: 'Missing workspace.' }, { status: 400 });
      }

      if (intent === 'workspace-delete') {
        await apiRequest(request, `/admin/workspaces/${workspaceId}`, { method: 'DELETE', redirectOn401: false });
        return json({ ok: true, rowId: workspaceId, message: 'Workspace deleted (pod + storage reclaimed).' });
      }

      const verb = intent === 'workspace-stop' ? 'stop' : 'restart';
      await apiRequest(request, `/admin/workspaces/${workspaceId}/${verb}`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({}),
      });

      return json({
        ok: true,
        rowId: workspaceId,
        message: verb === 'stop' ? 'Workspace stopped.' : 'Workspace restarted.',
      });
    }

    // Kill a preview (stops the workspace pod that serves it).
    if (intent === 'preview-kill') {
      const workspaceId = String(form.get('workspaceId') ?? '');

      if (!workspaceId) {
        return json({ ok: false, error: 'Missing preview.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/previews/${workspaceId}/kill`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({}),
      });

      return json({ ok: true, rowId: workspaceId, message: 'Preview killed (workspace pod stopped).' });
    }

    // Abuse event resolve.
    if (intent === 'abuse-resolve') {
      const abuseEventId = String(form.get('abuseEventId') ?? '');

      if (!abuseEventId) {
        return json({ ok: false, error: 'Missing abuse event.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/abuse-events/${abuseEventId}/resolve`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({}),
      });

      return json({ ok: true, rowId: abuseEventId, message: 'Abuse event resolved.' });
    }

    // F22: abuse event Dismiss / Warn / Suspend.
    if (intent === 'abuse-dismiss' || intent === 'abuse-warn' || intent === 'abuse-suspend') {
      const abuseEventId = String(form.get('abuseEventId') ?? '');

      if (!abuseEventId) {
        return json({ ok: false, error: 'Missing abuse event.' }, { status: 400 });
      }

      if (intent === 'abuse-dismiss') {
        await apiRequest(request, `/admin/abuse-events/${abuseEventId}/dismiss`, {
          method: 'POST',
          redirectOn401: false,
          body: JSON.stringify({}),
        });

        return json({ ok: true, rowId: abuseEventId, message: 'Event dismissed.' });
      }

      if (intent === 'abuse-warn') {
        await apiRequest(request, `/admin/abuse-events/${abuseEventId}/warn`, {
          method: 'POST',
          redirectOn401: false,
          body: JSON.stringify({}),
        });

        return json({ ok: true, rowId: abuseEventId, message: 'Warning emailed to the user.' });
      }

      // abuse-suspend — mandatory reason, persisted in the admin audit log.
      const reason = String(form.get('reason') ?? '').trim();

      if (!reason) {
        return json({ ok: false, rowId: abuseEventId, error: 'A reason is required to suspend.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/abuse-events/${abuseEventId}/suspend`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ reason }),
      });

      return json({ ok: true, rowId: abuseEventId, message: 'User suspended.' });
    }

    // F23: mark a security event resolved with an optional operator note.
    if (intent === 'security-event-resolve') {
      const securityEventId = String(form.get('securityEventId') ?? '');
      const note = String(form.get('note') ?? '').trim();

      if (!securityEventId) {
        return json({ ok: false, error: 'Missing security event.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/security-events/${securityEventId}/resolve`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify(note ? { note } : {}),
      });

      return json({ ok: true, rowId: securityEventId, message: 'Security event resolved.' });
    }

    // F24: admin cancels a user's pending account deletion during the grace window.
    if (intent === 'account-deletion-cancel') {
      const deletionUserId = String(form.get('deletionUserId') ?? '');

      if (!deletionUserId) {
        return json({ ok: false, error: 'Missing user.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/account-deletions/${deletionUserId}/cancel`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({}),
      });

      return json({ ok: true, rowId: deletionUserId, message: 'Deletion cancelled.' });
    }

    // Organization suspend. (No unsuspend endpoint exists server-side today.)
    if (intent === 'org-suspend') {
      const organizationId = String(form.get('organizationId') ?? '');

      if (!organizationId) {
        return json({ ok: false, error: 'Missing organization.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/orgs/${organizationId}/suspend`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({}),
      });

      return json({ ok: true, rowId: organizationId, message: 'Organization suspended.' });
    }

    // Support ticket respond (status + response body).
    if (intent === 'support-respond') {
      const ticketId = String(form.get('ticketId') ?? '');
      const response = String(form.get('response') ?? '').trim();
      const status = String(form.get('status') ?? 'PENDING');

      if (!ticketId) {
        return json({ ok: false, error: 'Missing ticket.' }, { status: 400 });
      }

      if (!response) {
        return json({ ok: false, rowId: ticketId, error: 'Enter a response message.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/support-tickets/${ticketId}/respond`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ status, response }),
      });

      return json({ ok: true, rowId: ticketId, message: `Response sent (${status}).` });
    }

    // Support ticket assignee (platform admin, empty string unassigns).
    if (intent === 'support-assign') {
      const ticketId = String(form.get('ticketId') ?? '');
      const assigneeUserId = String(form.get('assigneeUserId') ?? '').trim();

      if (!ticketId) {
        return json({ ok: false, error: 'Missing ticket.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/support-tickets/${ticketId}/assign`, {
        method: 'POST',
        redirectOn401: false,

        // adminSupportAssignSchema: { assigneeUserId: string | null } — null unassigns.
        body: JSON.stringify({ assigneeUserId: assigneeUserId || null }),
      });

      return json({ ok: true, rowId: ticketId, message: assigneeUserId ? 'Ticket assigned.' : 'Ticket unassigned.' });
    }

    // --- MCP catalog management (no userId) ---
    if (intent === 'mcp-catalog-create' || intent === 'mcp-catalog-update') {
      let entryPayload: Record<string, unknown>;

      try {
        entryPayload = JSON.parse(String(form.get('entry') ?? '{}')) as Record<string, unknown>;
      } catch {
        return json({ ok: false, error: 'Entry must be valid JSON.' }, { status: 400 });
      }

      if (intent === 'mcp-catalog-create') {
        const created = await apiRequest<{ entry: { id: string; slug: string } }>(request, '/admin/mcp/catalog', {
          method: 'POST',
          redirectOn401: false,
          body: JSON.stringify(entryPayload),
        });

        return json({ ok: true, rowId: created.entry.id, message: `Catalog entry "${created.entry.slug}" created.` });
      }

      const id = String(form.get('id') ?? '');

      if (!id) {
        return json({ ok: false, error: 'Missing catalog entry id.' }, { status: 400 });
      }

      const updated = await apiRequest<{ entry: { id: string; slug: string } }>(request, `/admin/mcp/catalog/${id}`, {
        method: 'PATCH',
        redirectOn401: false,
        body: JSON.stringify(entryPayload),
      });

      return json({ ok: true, rowId: updated.entry.id, message: `Catalog entry "${updated.entry.slug}" saved.` });
    }

    if (intent === 'mcp-catalog-toggle') {
      const id = String(form.get('id') ?? '');
      const field = String(form.get('field') ?? '');
      const value = String(form.get('value')) === 'true';

      if (!id || !['featured', 'verified', 'featuredForIdePanel', 'enabled'].includes(field)) {
        return json({ ok: false, error: 'Invalid toggle.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/mcp/catalog/${id}`, {
        method: 'PATCH',
        redirectOn401: false,
        body: JSON.stringify({ [field]: value }),
      });

      const toggleMessage =
        field === 'enabled'
          ? value
            ? 'Server enabled globally — existing installs restored.'
            : 'Server disabled globally — hidden, un-installable, existing installs turned off.'
          : `${field} ${value ? 'enabled' : 'disabled'}.`;

      return json({ ok: true, rowId: id, message: toggleMessage });
    }

    if (intent === 'mcp-catalog-delete') {
      const id = String(form.get('id') ?? '');

      if (!id) {
        return json({ ok: false, error: 'Missing catalog entry id.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/mcp/catalog/${id}`, { method: 'DELETE', redirectOn401: false });

      return json({ ok: true, rowId: id, message: 'Catalog entry deleted.' });
    }

    // --- Org MCP policy ---
    if (intent === 'mcp-policy-set' || intent === 'mcp-policy-clear') {
      const orgId = String(form.get('organizationId') ?? '').trim();
      const slug = String(form.get('slug') ?? '').trim();

      if (!orgId || !slug) {
        return json({ ok: false, error: 'Organization ID and catalog slug are required.' }, { status: 400 });
      }

      if (intent === 'mcp-policy-set') {
        const mode = String(form.get('mode') ?? '');

        await apiRequest(request, `/admin/orgs/${orgId}/mcp-policy`, {
          method: 'POST',
          redirectOn401: false,
          body: JSON.stringify({ slug, mode }),
        });

        return json({ ok: true, rowId: `${orgId}:${slug}`, message: `Policy set: ${slug} → ${mode}.` });
      }

      await apiRequest(request, `/admin/orgs/${orgId}/mcp-policy`, {
        method: 'DELETE',
        redirectOn401: false,
        body: JSON.stringify({ slug }),
      });

      return json({ ok: true, rowId: `${orgId}:${slug}`, message: `Policy cleared for ${slug}.` });
    }

    // --- Global (platform-wide) MCP policy ---
    if (intent === 'mcp-global-policy-set' || intent === 'mcp-global-policy-clear') {
      const slug = String(form.get('slug') ?? '').trim();

      if (!slug) {
        return json({ ok: false, error: 'Catalog slug is required.' }, { status: 400 });
      }

      if (intent === 'mcp-global-policy-set') {
        const mode = String(form.get('mode') ?? '');

        await apiRequest(request, '/admin/mcp/global-policy', {
          method: 'POST',
          redirectOn401: false,
          body: JSON.stringify({ slug, mode }),
        });

        return json({ ok: true, rowId: `global:${slug}`, message: `Global policy set: ${slug} → ${mode}.` });
      }

      await apiRequest(request, '/admin/mcp/global-policy', {
        method: 'DELETE',
        redirectOn401: false,
        body: JSON.stringify({ slug }),
      });

      return json({ ok: true, rowId: `global:${slug}`, message: `Global policy cleared for ${slug}.` });
    }

    if (!userId) {
      return json({ ok: false, error: 'Missing user.' }, { status: 400 });
    }

    if (intent === 'platform-admin') {
      const grant = String(form.get('value')) === 'true';
      await apiRequest(request, `/admin/users/${userId}/platform-admin`, {
        method: 'PATCH',
        redirectOn401: false,
        body: JSON.stringify({ platformAdmin: grant }),
      });

      return json({
        ok: true,
        userId,
        message: USER_INTENT_OK[grant ? 'platform-admin-grant' : 'platform-admin-revoke'],
      });
    }

    if (intent === 'impersonate') {
      const result = await apiRequest<{ token: string }>(request, `/admin/users/${userId}/impersonate`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({}),
      });

      /*
       * Become the impersonation session in this browser → the persistent
       * ImpersonationBanner renders and Stop revokes it.
       */
      return redirect('/dashboard', { headers: { 'Set-Cookie': sessionCookie(result.token) } });
    }

    if (intent === 'strike') {
      const severity = String(form.get('severity') ?? 'minor');
      await apiRequest(request, `/admin/users/${userId}/strikes`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ severity, reason: 'Issued from admin console' }),
      });

      return json({ ok: true, userId, message: `Strike issued (${severity}).` });
    }

    if (intent === 'clear-strikes') {
      await apiRequest(request, `/admin/users/${userId}/strikes`, { method: 'DELETE', redirectOn401: false });
      return json({ ok: true, userId, message: 'Strikes cleared.' });
    }

    /*
     * Suspend / Reactivate require a reason: it is persisted server-side in the
     * admin audit event (admin.user.suspend / admin.user.unsuspend metadata).
     */
    if (intent === 'suspend' || intent === 'unsuspend') {
      const reason = String(form.get('reason') ?? '').trim();

      if (!reason) {
        return json({ ok: false, userId, error: 'A reason is required for this action.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/users/${userId}/${intent}`, {
        method: 'POST',
        redirectOn401: false,
        body: JSON.stringify({ reason }),
      });

      return json({ ok: true, userId, message: USER_INTENT_OK[intent] });
    }

    const endpoint = USER_POST_INTENTS[intent];

    if (!endpoint) {
      return json({ ok: false, userId, error: 'Unknown action.' }, { status: 400 });
    }

    await apiRequest(request, `/admin/users/${userId}/${endpoint}`, {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify({}),
    });

    return json({ ok: true, userId, message: USER_INTENT_OK[intent] });
  } catch (error) {
    return json({ ok: false, userId, error: await adminMutationError(error) }, { status: 400 });
  }
}

export default function AdminSectionPage() {
  const data = useLoaderData<typeof loader>();

  /*
   * The loader returns a downloadable `Response` for `?export=…` (the browser
   * handles it as a file download, the component never renders with it). Narrow
   * to the page-data shape for normal navigations.
   */
  if (!data || !('config' in data)) {
    return null;
  }

  const { section, config, payload } = data;
  const securityOpenCount = 'securityOpenCount' in data ? data.securityOpenCount : undefined;

  return (
    <AppShell
      title={config.title}
      description={config.description}
      actions={<LinkButton to="/admin/billing">Billing admin</LinkButton>}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[232px_1fr]">
        <AdminNav active={section} securityOpenCount={securityOpenCount} />
        <div className="grid gap-6">
          {section === 'overview' ? <OverviewPanel payload={payload} /> : null}
          {section === 'health' ? <HealthPanel payload={payload} /> : null}
          {section === 'monitoring' ? <MonitoringPanel payload={payload} /> : null}
          {section === 'infrastructure' ? <InfrastructurePanel payload={payload as never} /> : null}
          {section === 'users' ? <UsersPanel payload={payload} /> : null}
          {section === 'providers' ? <ProvidersPanel payload={payload} /> : null}
          {section === 'models' ? <ToggleListPanel payload={payload} kind="models" /> : null}
          {section === 'feature-flags' ? <ToggleListPanel payload={payload} kind="feature-flags" /> : null}
          {section === 'oauth-providers' ? <OauthProvidersPanel payload={payload} /> : null}
          {section === 'quotas' ? <QuotaOverridePanel /> : null}
          {section === 'system-settings' ? <SystemSettingUpsertPanel /> : null}
          {section === 'ops-controls' ? <OpsControlsPanel payload={payload} /> : null}
          {section === 'workspaces' ? <WorkspacesPanel payload={payload} /> : null}
          {section === 'previews' ? <PreviewsPanel payload={payload} /> : null}
          {section === 'abuse-events' ? <AbuseEventsPanel payload={payload} /> : null}
          {section === 'security-events' ? <SecurityEventsPanel payload={payload} /> : null}
          {section === 'organizations' ? <OrganizationsPanel payload={payload} /> : null}
          {section === 'account-deletions' ? <AccountDeletionsPanel payload={payload} /> : null}
          {section === 'costs' ? <CostsPanel payload={payload} /> : null}
          {section === 'support-tickets' ? <SupportTicketsPanel payload={payload} /> : null}
          {section === 'audit-logs' || section === 'admin-audit-logs' ? (
            <AuditLogsPanel payload={payload} section={section} />
          ) : null}
          {section === 'mcp-catalog' ? <McpCatalogPanel payload={payload} /> : null}
          {section === 'developer-tools' ? <DeveloperToolsPanel /> : null}
          {![
            'overview',
            'health',
            'monitoring',
            'users',
            'providers',
            'models',
            'feature-flags',
            'oauth-providers',
            'workspaces',
            'previews',
            'abuse-events',
            'security-events',
            'organizations',
            'account-deletions',
            'costs',
            'support-tickets',
            'developer-tools',
            'ops-controls',
            'mcp-catalog',
            'audit-logs',
            'admin-audit-logs',
          ].includes(section) ? (
            <DataPanel config={config} payload={payload} />
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

/*
 * Developer / ops tabs inherited from the bolt @settings modal. They are marked
 * window:'developer' (hidden from the user ControlPanel) but were hosted nowhere,
 * so they were unreachable. We surface them here, platform-admin-gated. The tab
 * components are self-contained (they fetch their own data) and lazy-loaded.
 */
const DevDebugTab = React.lazy(() => import('~/components/@settings/tabs/debug/DebugTab'));
const DevTaskManagerTab = React.lazy(() => import('~/components/@settings/tabs/task-manager/TaskManagerTab'));
const DevServiceStatusTab = React.lazy(() => import('~/components/@settings/tabs/service-status/ServiceStatusTab'));

const DevEventLogsTab = React.lazy(() =>
  import('~/components/@settings/tabs/event-logs/EventLogsTab').then((m) => ({ default: m.EventLogsTab })),
);

/*
 * Provider config tabs are also window:'developer' (hidden from the user ControlPanel)
 * and per constants.tsx §11 are a platform-admin responsibility, so they belong here.
 */
const DevCloudProvidersTab = React.lazy(() => import('~/components/@settings/tabs/providers/cloud/CloudProvidersTab'));
const DevLocalProvidersTab = React.lazy(() => import('~/components/@settings/tabs/providers/local/LocalProvidersTab'));

/*
 * Chart.js / react-chartjs-2 live in a lazy chunk so they only load when the
 * Monitoring section is opened, keeping them out of the rest of the admin bundle.
 */
const MonitoringCharts = {
  CostOverTimeChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.CostOverTimeChart })),
  ),
  CostByCategoryChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.CostByCategoryChart })),
  ),
  TokensByProviderChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.TokensByProviderChart })),
  ),
  CostByOrgChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.CostByOrgChart })),
  ),
  CategoryBarChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.CategoryBarChart })),
  ),
  GroupedBarChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.GroupedBarChart })),
  ),
  HistogramBucketChart: React.lazy(() =>
    import('~/components/admin/MonitoringCharts').then((m) => ({ default: m.HistogramBucketChart })),
  ),
};

const DEV_TOOLS = [
  { id: 'cloud-providers', label: 'Cloud Providers', Component: DevCloudProvidersTab },
  { id: 'local-providers', label: 'Local Providers', Component: DevLocalProvidersTab },
  { id: 'debug', label: 'Debug', Component: DevDebugTab },
  { id: 'task-manager', label: 'Local data', Component: DevTaskManagerTab },
  { id: 'service-status', label: 'Service Status', Component: DevServiceStatusTab },
  { id: 'event-logs', label: 'Event Logs', Component: DevEventLogsTab },
] as const;

function DeveloperToolsPanel() {
  const [active, setActive] = useState<(typeof DEV_TOOLS)[number]['id']>('debug');
  const Active = DEV_TOOLS.find((t) => t.id === active)?.Component ?? DevDebugTab;

  return (
    <div className="grid gap-4">
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-1">
        {DEV_TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={
              active === t.id
                ? 'rounded-md bg-bolt-elements-item-contentAccent px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md px-3 py-1.5 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
        <React.Suspense fallback={<p className="text-sm text-bolt-elements-textTertiary">Loading {active}…</p>}>
          <Active />
        </React.Suspense>
      </div>
    </div>
  );
}

function AdminNav({ active, securityOpenCount }: { active: string; securityOpenCount?: number }) {
  const navigate = useNavigate();

  // F23: badge count per nav item (today only unresolved security events).
  const badgeFor = (item: string): number | undefined =>
    item === 'security-events' && typeof securityOpenCount === 'number' && securityOpenCount > 0
      ? securityOpenCount
      : undefined;

  return (
    <>
      {/*
       * Mobile / tablet (< lg): a compact section picker instead of a tall
       * vertical nav, so the active tab's content is visible immediately without
       * scrolling past ~25 links.
       */}
      <div className="lg:hidden">
        <label htmlFor="admin-section-picker" className="sr-only">
          Admin section
        </label>
        <select
          id="admin-section-picker"
          value={active}
          onChange={(event) => navigate(`/admin/${event.target.value}`)}
          data-testid="admin-section-picker"
          className="w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
        >
          {navGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item} value={item}>
                  {adminSections[item].title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop (lg+): sticky vertical sidebar; content scrolls independently. */}
      <nav
        aria-label="Admin sections"
        className="hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-sm lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto"
      >
        {navGroups.map((group) => (
          <div key={group.label} className="mb-2 last:mb-0">
            <p className="vc-sidebar-group-label px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.5px] text-bolt-elements-textTertiary">
              {group.label}
            </p>
            {group.items.map((item) => {
              const badge = badgeFor(item);

              return (
                <Link
                  key={item}
                  to={`/admin/${item}`}
                  className={[
                    'flex min-h-8 items-center justify-between gap-2 rounded-md px-2 text-sm transition-colors',
                    active === item
                      ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
                      : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
                  ].join(' ')}
                >
                  <span className="truncate">{adminSections[item].title}</span>
                  {badge !== undefined ? (
                    <span
                      data-testid={`admin-nav-badge-${item}`}
                      aria-label={`${badge} unresolved`}
                      className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--status-error-text)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
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
      {Object.entries(payload).map(([key, value]) => {
        const record = asRecord(value);

        return (
          <SectionCard key={key} title={labelize(key)} icon="health">
            <KeyValueGrid value={record} />
            {key === 'kubernetes' && record.status === 'not-configured' ? (
              <div
                role="note"
                className="mt-3 rounded-md px-3 py-2 text-sm text-bolt-elements-textPrimary"
                style={{
                  background: 'color-mix(in srgb, var(--vc-ide-accent-warning) 12%, transparent)',
                  borderLeft: '3px solid var(--vc-ide-accent-warning)',
                }}
              >
                Workspace runtimes need a Kubernetes pod. Local dev runs shell-only.
                <span className="mt-1 block text-xs">
                  <a
                    href="https://github.com/openaxcloud/vibecore/blob/main/docs/ACTIVATION_RUNBOOK.md"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Runbook
                  </a>
                  {' · '}
                  <Link to="/admin/system-settings" className="font-medium underline">
                    Configure
                  </Link>
                </span>
              </div>
            ) : null}
          </SectionCard>
        );
      })}
    </div>
  );
}

/*
 * Read-only platform monitoring dashboard. Every number/series here is derived
 * CLIENT-SIDE (pure reduce/group) from the combined loader payload built out of
 * two EXISTING endpoints — no new backend, no mocks:
 *   /admin/costs           → { aiCostCents, aiCosts: AiCostLedgerRecord[], usage: UsageEventRecord[] }
 *   /admin/provider-health → { providers: [{ provider, status, statusCode?, error? }] }
 *
 * AiCostLedgerRecord (verified, services/api/src/store.ts:501): id, organizationId,
 * projectId?, conversationId?, messageId?, provider, model, inputTokens,
 * outputTokens, costCents, reason, createdAt.
 *
 * The aggregations below (cost by day, by provider, by model, by org; tokens by
 * provider) are NOT returned pre-grouped by the API, so we compute them here from
 * the aiCosts list. Provider health is rendered as-is.
 */
type AiCost = {
  organizationId?: string;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  createdAt?: string;
};

type ProviderHealthRow = {
  provider?: string;
  status?: string;
  enabled?: boolean;
  keyConfigured?: boolean;
  liveChecked?: boolean;
  latencyMs?: number;
  statusCode?: number;
  error?: string;
};

const euros = (cents: number) =>
  formatUserAreaNumber(cents / 100, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/*
 * Structured shape returned by GET /admin/platform-metrics, which reads the SAME
 * live Prometheus registry that /metrics exposes (packages/observability
 * registry.toJSON()). Every series here is a real recorded metric — workspace
 * lifecycle, queue depth, error counters, request-latency histograms, AI tokens.
 */
type PlatformMetricSample = { labels: Record<string, string>; value: number };
type PlatformHistogramSample = {
  labels: Record<string, string>;
  count: number;
  sum: number;
  buckets: Array<{ le: number; count: number }>;
  p50?: number;
  p95?: number;
  p99?: number;
  avg?: number;
};
type PlatformMetric = {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  empty: boolean;
  total?: number;
  samples?: PlatformMetricSample[];
  histograms?: PlatformHistogramSample[];
};
type PlatformMetricsSnapshot = { generatedAt: string; metrics: PlatformMetric[] };

/** Human-readable value for a single label set (drops empties, joins the rest). */
function labelKey(labels: Record<string, string>, preferred?: string): string {
  if (preferred && labels[preferred]) {
    return labels[preferred];
  }

  const parts = Object.entries(labels)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${value}`);

  return parts.length > 0 ? parts.join(', ') : '(no labels)';
}

/** Find a metric by name in the snapshot; undefined when the registry never defined it. */
function findMetric(snapshot: PlatformMetricsSnapshot | null, name: string): PlatformMetric | undefined {
  return snapshot?.metrics.find((metric) => metric.name === name);
}

/** True when the metric exists and has at least one recorded observation. */
function hasData(metric: PlatformMetric | undefined): boolean {
  return Boolean(metric && !metric.empty);
}

/** Turn a counter/gauge metric's per-label samples into a {labels, values} series. */
function metricSeries(metric: PlatformMetric | undefined, preferredLabel?: string, limit = 12): Labeled {
  if (!metric?.samples) {
    return { labels: [], values: [] };
  }

  const sorted = [...metric.samples].sort((a, b) => b.value - a.value).slice(0, limit);

  return {
    labels: sorted.map((sample) => labelKey(sample.labels, preferredLabel)),
    values: sorted.map((sample) => sample.value),
  };
}

/** Sum a metric's series values (headline number for counters/gauges). */
function metricTotal(metric: PlatformMetric | undefined): number {
  if (typeof metric?.total === 'number') {
    return metric.total;
  }

  return (metric?.samples ?? []).reduce((accumulator, sample) => accumulator + sample.value, 0);
}

type Labeled = { labels: string[]; values: number[] };

/** Group a list into { key → summed number } via a value selector, returning the top N descending. */
function topGroups<T>(
  rows: T[],
  keyOf: (row: T) => string,
  valueOf: (row: T) => number,
  limit = 10,
): { labels: string[]; values: number[] } {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const key = keyOf(row) || 'unknown';
    totals.set(key, (totals.get(key) ?? 0) + (Number.isFinite(valueOf(row)) ? valueOf(row) : 0));
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

  return { labels: sorted.map(([k]) => k), values: sorted.map(([, v]) => v) };
}

function MonitoringPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const aiCosts = (Array.isArray(payload.aiCosts) ? payload.aiCosts : []) as AiCost[];
  const usageEvents = (Array.isArray(payload.usage) ? payload.usage : []) as Array<{ quantity?: number }>;
  const providers = (Array.isArray(payload.providers) ? payload.providers : []) as ProviderHealthRow[];
  const liveProbe = payload.liveProbe === true;

  const platformMetrics =
    payload.platformMetrics && typeof payload.platformMetrics === 'object' && !Array.isArray(payload.platformMetrics)
      ? (payload.platformMetrics as unknown as PlatformMetricsSnapshot)
      : null;

  const totalCostCents =
    typeof payload.aiCostCents === 'number'
      ? payload.aiCostCents
      : aiCosts.reduce((sum, c) => sum + (c.costCents ?? 0), 0);

  const totalTokens = aiCosts.reduce((sum, c) => sum + (c.inputTokens ?? 0) + (c.outputTokens ?? 0), 0);
  const totalUsage = usageEvents.reduce((sum, e) => sum + (e.quantity ?? 0), 0);
  const hasCostData = aiCosts.length > 0;

  // Cost (USD) by day, chronological — group by the date part of createdAt.
  const byDay = (() => {
    const totals = new Map<string, number>();

    for (const c of aiCosts) {
      const day = (c.createdAt ?? '').slice(0, 10) || 'unknown';
      totals.set(day, (totals.get(day) ?? 0) + (c.costCents ?? 0));
    }

    const sorted = [...totals.entries()].filter(([day]) => day !== 'unknown').sort((a, b) => a[0].localeCompare(b[0]));

    return { labels: sorted.map(([d]) => d), values: sorted.map(([, cents]) => Number((cents / 100).toFixed(2))) };
  })();

  // Cost (USD) by model, by provider; tokens by provider; cost (USD) by org.
  const byModel = topGroups(
    aiCosts,
    (c) => c.model ?? 'unknown',
    (c) => (c.costCents ?? 0) / 100,
    8,
  );
  const byProviderCost = topGroups(
    aiCosts,
    (c) => c.provider ?? 'unknown',
    (c) => (c.costCents ?? 0) / 100,
    8,
  );
  const tokensByProvider = topGroups(
    aiCosts,
    (c) => c.provider ?? 'unknown',
    (c) => (c.inputTokens ?? 0) + (c.outputTokens ?? 0),
    8,
  );
  const byOrg = topGroups(
    aiCosts,
    (c) => c.organizationId ?? 'unknown',
    (c) => (c.costCents ?? 0) / 100,
    10,
  );

  const chartFallback = (
    <div className="flex h-full items-center justify-center text-sm text-bolt-elements-textTertiary">
      Loading chart…
    </div>
  );

  return (
    <>
      {payload.costsError ? (
        <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--status-warning-text)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning-text)_10%,transparent)] px-4 py-3 text-sm font-medium text-[var(--status-warning-text)]">
          <span className="i-ph:warning-circle text-base" aria-hidden />
          Cost metrics are temporarily unavailable. Provider health below is unaffected.
        </div>
      ) : null}

      {/* Real platform observability from the live Prometheus registry. */}
      <PlatformMetricsSection
        snapshot={platformMetrics}
        errored={payload.platformMetricsError === true}
        chartFallback={chartFallback}
      />

      {/* KPI cards — collapse 4 → 2 → 1 col on narrower viewports. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total AI cost" value={euros(totalCostCents)} />
        <MetricCard label="Total tokens" value={formatUserAreaNumber(totalTokens)} />
        <MetricCard label="Cost records" value={formatUserAreaNumber(aiCosts.length)} />
        <MetricCard label="Usage events" value={formatUserAreaNumber(totalUsage)} />
      </div>

      {/* Charts — each in a height-bounded, responsive wrapper (charts use maintainAspectRatio:false). */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="AI cost over time (USD/day)" icon="cost">
          {hasCostData && byDay.labels.length > 0 ? (
            <div className="h-56 w-full sm:h-64">
              <React.Suspense fallback={chartFallback}>
                <MonitoringCharts.CostOverTimeChart labels={byDay.labels} values={byDay.values} />
              </React.Suspense>
            </div>
          ) : (
            <MonitoringEmpty />
          )}
        </SectionCard>

        <SectionCard title="Cost by model (USD)" icon="cost">
          {hasCostData && byModel.labels.length > 0 ? (
            <div className="h-56 w-full sm:h-64">
              <React.Suspense fallback={chartFallback}>
                <MonitoringCharts.CostByCategoryChart
                  labels={byModel.labels}
                  values={byModel.values}
                  axisLabel="Cost (USD)"
                />
              </React.Suspense>
            </div>
          ) : (
            <MonitoringEmpty />
          )}
        </SectionCard>

        <SectionCard title="Tokens by provider" icon="cost">
          {hasCostData && tokensByProvider.labels.length > 0 ? (
            <div className="h-56 w-full sm:h-64">
              <React.Suspense fallback={chartFallback}>
                <MonitoringCharts.TokensByProviderChart
                  labels={tokensByProvider.labels}
                  values={tokensByProvider.values}
                />
              </React.Suspense>
            </div>
          ) : (
            <MonitoringEmpty />
          )}
        </SectionCard>

        <SectionCard title="Cost by organization (USD)" icon="cost">
          {hasCostData && byOrg.labels.length > 0 ? (
            <div className="h-56 w-full sm:h-64">
              <React.Suspense fallback={chartFallback}>
                <MonitoringCharts.CostByOrgChart labels={byOrg.labels} values={byOrg.values} />
              </React.Suspense>
            </div>
          ) : (
            <MonitoringEmpty />
          )}
        </SectionCard>
      </div>

      {/* Secondary cost-by-provider as a compact bar (complements the doughnut). */}
      <SectionCard title="Cost by provider (USD)" icon="cost">
        {hasCostData && byProviderCost.labels.length > 0 ? (
          <div className="h-52 w-full">
            <React.Suspense fallback={chartFallback}>
              <MonitoringCharts.CostByCategoryChart
                labels={byProviderCost.labels}
                values={byProviderCost.values}
                axisLabel="Cost (USD)"
              />
            </React.Suspense>
          </div>
        ) : (
          <MonitoringEmpty />
        )}
      </SectionCard>

      {/* Per-provider readiness — status pills, not a chart. */}
      <SectionCard title="Provider health" icon="health">
        {payload.providerHealthError ? (
          <p className="text-sm text-bolt-elements-textSecondary">Provider health check is temporarily unavailable.</p>
        ) : providers.length === 0 ? (
          <MonitoringEmpty />
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-xs text-bolt-elements-textTertiary sm:max-w-[70%]">
                Config readiness from the admin provider registry (enabled + platform key); rows marked “live” reflect a
                real upstream probe — the AI gateway’s health check plus, on demand, a direct models-list probe of the
                remaining configured providers.
              </p>
              <ProviderProbeButton liveProbe={liveProbe} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {providers.map((p, index) => (
                <ProviderHealthCard key={`${p.provider ?? 'provider'}-${index}`} provider={p} />
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </>
  );
}

/*
 * Real platform observability, sourced from the live Prometheus registry via
 * GET /admin/platform-metrics (which reads the SAME registry objects /metrics
 * renders — no re-scrape, no mocks). We surface the operationally important
 * families the dashboard previously collected but never visualized: workspace
 * lifecycle (starts vs failures + cold-start latency), queue depth per queue,
 * error rates by type, request-latency histogram (p50/p95/p99), and AI tokens.
 *
 * Only metrics that ACTUALLY have recorded data render a chart; anything the
 * registry defines but has never observed is shown as an explicit "no data"
 * card, so an operator can tell "healthy/idle" apart from "not wired".
 */
function PlatformMetricsSection({
  snapshot,
  errored,
  chartFallback,
}: {
  snapshot: PlatformMetricsSnapshot | null;
  errored: boolean;
  chartFallback: React.ReactNode;
}) {
  if (errored || !snapshot) {
    return (
      <SectionCard title="Platform metrics" icon="health">
        <p className="text-sm text-bolt-elements-textSecondary">
          Live platform metrics are temporarily unavailable (the /admin/platform-metrics probe did not respond). Cost
          and provider health below are unaffected.
        </p>
      </SectionCard>
    );
  }

  // --- Workspace lifecycle -------------------------------------------------
  const starts = findMetric(snapshot, 'workspace_starts_total');
  const failures = findMetric(snapshot, 'workspace_failures_total');
  const startLatency = findMetric(snapshot, 'workspace_start_latency_seconds');
  const activeWorkspaces = findMetric(snapshot, 'active_workspaces');
  const startsTotal = metricTotal(starts);
  const failuresTotal = metricTotal(failures);
  const startLatencyHist = startLatency?.histograms?.[0];
  const successRate = startsTotal > 0 ? ((startsTotal - failuresTotal) / startsTotal) * 100 : undefined;

  // Grouped starts-vs-failures per outcome/reason label bucket (union of labels).
  const lifecycleSeries = (() => {
    if (!hasData(starts) && !hasData(failures)) {
      return null;
    }

    const startsByLabel = new Map((starts?.samples ?? []).map((s) => [labelKey(s.labels), s.value]));
    const failsByLabel = new Map((failures?.samples ?? []).map((s) => [labelKey(s.labels), s.value]));
    const labels = [...new Set([...startsByLabel.keys(), ...failsByLabel.keys()])].slice(0, 10);

    return {
      labels,
      datasets: [
        { label: 'Starts', values: labels.map((l) => startsByLabel.get(l) ?? 0), colorIndex: 2 },
        { label: 'Failures', values: labels.map((l) => failsByLabel.get(l) ?? 0), colorIndex: 4 },
      ],
    };
  })();

  // --- Queue depth ---------------------------------------------------------
  const queueDepth = findMetric(snapshot, 'queue_depth');
  const queueSeries = metricSeries(queueDepth, 'queue');

  // --- Error rates by type -------------------------------------------------
  const apiErrors = findMetric(snapshot, 'api_errors_total');
  const errorSeries = metricSeries(apiErrors, 'type');
  const jobFailures = findMetric(snapshot, 'job_failures_total');
  const podFailures = findMetric(snapshot, 'kubernetes_pod_failures_total');
  const aiErrors = findMetric(snapshot, 'ai_provider_errors_total');
  const authFailures = findMetric(snapshot, 'auth_failures_total');

  // --- Request latency histogram ------------------------------------------
  const requestLatency = findMetric(snapshot, 'api_request_duration_seconds');
  const latencyHist = requestLatency?.histograms?.[0];

  const latencyBuckets = latencyHist
    ? {
        labels: latencyHist.buckets.map((b) => (b.le >= 1 ? `${b.le}s` : `${Math.round(b.le * 1000)}ms`)),
        values: latencyHist.buckets.map((b) => b.count),
      }
    : { labels: [], values: [] };

  // --- AI tokens -----------------------------------------------------------
  const aiTokens = findMetric(snapshot, 'ai_tokens_total');
  const aiTokensSeries = metricSeries(aiTokens, 'provider');

  const secs = (value: number | undefined) =>
    typeof value === 'number' ? (value >= 1 ? `${value.toFixed(2)}s` : `${Math.round(value * 1000)}ms`) : 'no data';

  return (
    <SectionCard title="Platform metrics (live registry)" icon="health">
      <p className="mb-3 text-xs text-bolt-elements-textTertiary">
        Real observability from the in-cluster Prometheus registry (the same series exposed at{' '}
        <code className="rounded bg-bolt-elements-background-depth-3 px-1 py-0.5">/metrics</code>). Snapshot at{' '}
        {formatUserAreaDateTime(snapshot.generatedAt) ?? 'date unavailable'}. Metrics with no recorded observations are
        labelled “no data”.
      </p>

      {/* Headline stat cards. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PlatformStatCard
          label="Workspace starts"
          value={hasData(starts) ? formatUserAreaNumber(startsTotal) : 'no data'}
          available={hasData(starts)}
        />
        <PlatformStatCard
          label="Workspace failures"
          value={hasData(failures) ? formatUserAreaNumber(failuresTotal) : 'no data'}
          available={hasData(failures)}
          tone={failuresTotal > 0 ? 'danger' : 'default'}
        />
        <PlatformStatCard
          label="Start success rate"
          value={typeof successRate === 'number' ? `${successRate.toFixed(1)}%` : 'no data'}
          available={typeof successRate === 'number'}
        />
        <PlatformStatCard
          label="Active workspaces"
          value={hasData(activeWorkspaces) ? formatUserAreaNumber(metricTotal(activeWorkspaces)) : 'no data'}
          available={hasData(activeWorkspaces)}
        />
        <PlatformStatCard
          label="Cold-start p50"
          value={secs(startLatencyHist?.p50)}
          available={Boolean(startLatencyHist && startLatencyHist.count > 0)}
        />
        <PlatformStatCard
          label="Cold-start p95"
          value={secs(startLatencyHist?.p95)}
          available={Boolean(startLatencyHist && startLatencyHist.count > 0)}
        />
        <PlatformStatCard
          label="Request latency p50"
          value={secs(latencyHist?.p50)}
          available={Boolean(latencyHist && latencyHist.count > 0)}
        />
        <PlatformStatCard
          label="Request latency p95"
          value={secs(latencyHist?.p95)}
          available={Boolean(latencyHist && latencyHist.count > 0)}
          tone={typeof latencyHist?.p95 === 'number' && latencyHist.p95 > 1 ? 'danger' : 'default'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PlatformChartCard title="Workspace starts vs failures" available={Boolean(lifecycleSeries)}>
          {lifecycleSeries ? (
            <React.Suspense fallback={chartFallback}>
              <MonitoringCharts.GroupedBarChart labels={lifecycleSeries.labels} datasets={lifecycleSeries.datasets} />
            </React.Suspense>
          ) : null}
        </PlatformChartCard>

        <PlatformChartCard title="Queue depth by queue" available={hasData(queueDepth)}>
          <React.Suspense fallback={chartFallback}>
            <MonitoringCharts.CategoryBarChart
              labels={queueSeries.labels}
              values={queueSeries.values}
              axisLabel="Depth"
              colorOffset={6}
            />
          </React.Suspense>
        </PlatformChartCard>

        <PlatformChartCard title="API errors by type" available={hasData(apiErrors)}>
          <React.Suspense fallback={chartFallback}>
            <MonitoringCharts.CategoryBarChart
              labels={errorSeries.labels}
              values={errorSeries.values}
              axisLabel="Errors"
              colorOffset={4}
            />
          </React.Suspense>
        </PlatformChartCard>

        <PlatformChartCard
          title="Request latency distribution"
          available={Boolean(latencyHist && latencyHist.count > 0)}
        >
          <React.Suspense fallback={chartFallback}>
            <MonitoringCharts.HistogramBucketChart labels={latencyBuckets.labels} values={latencyBuckets.values} />
          </React.Suspense>
        </PlatformChartCard>

        <PlatformChartCard title="AI tokens by provider" available={hasData(aiTokens)}>
          <React.Suspense fallback={chartFallback}>
            <MonitoringCharts.CategoryBarChart
              labels={aiTokensSeries.labels}
              values={aiTokensSeries.values}
              axisLabel="Tokens"
              colorOffset={0}
            />
          </React.Suspense>
        </PlatformChartCard>

        {lifecycleSeries ? null : (
          <PlatformChartCard title="Workspace lifecycle" available={false}>
            {null}
          </PlatformChartCard>
        )}
      </div>

      {/* Other error counters as compact stat chips (no chart needed for a single number). */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PlatformStatCard
          label="Background job failures"
          value={hasData(jobFailures) ? formatUserAreaNumber(metricTotal(jobFailures)) : 'no data'}
          available={hasData(jobFailures)}
          tone={metricTotal(jobFailures) > 0 ? 'danger' : 'default'}
        />
        <PlatformStatCard
          label="AI provider errors"
          value={hasData(aiErrors) ? formatUserAreaNumber(metricTotal(aiErrors)) : 'no data'}
          available={hasData(aiErrors)}
          tone={metricTotal(aiErrors) > 0 ? 'danger' : 'default'}
        />
        <PlatformStatCard
          label="K8s pod failures"
          value={hasData(podFailures) ? formatUserAreaNumber(metricTotal(podFailures)) : 'no data'}
          available={hasData(podFailures)}
          tone={metricTotal(podFailures) > 0 ? 'danger' : 'default'}
        />
        <PlatformStatCard
          label="Auth failures"
          value={hasData(authFailures) ? formatUserAreaNumber(metricTotal(authFailures)) : 'no data'}
          available={hasData(authFailures)}
          tone={metricTotal(authFailures) > 0 ? 'danger' : 'default'}
        />
      </div>
    </SectionCard>
  );
}

/** Compact stat chip for a platform metric; muted styling + "no data" when absent. */
function PlatformStatCard({
  label,
  value,
  available,
  tone = 'default',
}: {
  label: string;
  value: string;
  available: boolean;
  tone?: 'default' | 'danger';
}) {
  const valueClass = !available
    ? 'text-bolt-elements-textTertiary'
    : tone === 'danger'
      ? 'text-[var(--status-error-text)]'
      : 'text-bolt-elements-textPrimary';

  return (
    <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <p className="text-xs text-bolt-elements-textSecondary">{label}</p>
      <p className={['mt-1 text-xl font-semibold tabular-nums', valueClass].join(' ')}>{value}</p>
    </div>
  );
}

/** Height-bounded, responsive chart wrapper; renders a "no data" state when empty. */
function PlatformChartCard({
  title,
  available,
  children,
}: {
  title: string;
  available: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{title}</h4>
        {available ? null : <StatusPill tone="muted">no data</StatusPill>}
      </div>
      {available ? (
        <div className="h-56 w-full sm:h-64">{children}</div>
      ) : (
        <div className="flex h-56 items-center justify-center text-sm text-bolt-elements-textTertiary sm:h-64">
          No observations recorded yet.
        </div>
      )}
    </div>
  );
}

/*
 * Per-provider readiness card. Maps the backend status onto a tone + dot +
 * label. `ready`/`healthy` are good; `degraded`/`unreachable` are problems
 * (the provider is enabled+keyed but the live probe failed); `no_key` is a
 * config gap (amber, actionable); `disabled` is intentionally off (muted).
 */
const PROVIDER_HEALTH_META: Record<string, { label: string; tone: 'ok' | 'danger' | 'muted'; dot: string }> = {
  ready: { label: 'Ready', tone: 'ok', dot: 'bg-[var(--status-success-text)]' },
  healthy: { label: 'Ready', tone: 'ok', dot: 'bg-[var(--status-success-text)]' },
  degraded: { label: 'Degraded', tone: 'danger', dot: 'bg-[var(--status-warning-text)]' },
  unreachable: { label: 'Unreachable', tone: 'danger', dot: 'bg-[var(--status-error-text)]' },
  no_key: { label: 'No key', tone: 'muted', dot: 'bg-[var(--status-warning-text)]' },
  disabled: { label: 'Disabled', tone: 'muted', dot: 'bg-bolt-elements-textTertiary' },
  unknown: { label: 'Unknown', tone: 'muted', dot: 'bg-bolt-elements-textTertiary' },
};

/*
 * Opt-in trigger for the direct liveness probe. Navigates this same monitoring
 * route with `?probe=1`, which the loader forwards to the API — a plain link so
 * the probe is an explicit, bounded action (never on default load). While the
 * navigation is in flight we show a "Probing…" label; once probed, the link
 * offers a re-run and a way back to the fast (no-outbound-call) view.
 */
function ProviderProbeButton({ liveProbe }: { liveProbe: boolean }) {
  const navigation = useNavigation();
  const isProbing = navigation.state !== 'idle' && (navigation.location?.search ?? '').includes('probe=1');

  return (
    <div className="flex shrink-0 items-center gap-2">
      {liveProbe ? (
        <Link
          to="/admin/monitoring"
          className="whitespace-nowrap text-xs text-bolt-elements-textTertiary underline-offset-2 hover:text-bolt-elements-textSecondary hover:underline"
        >
          Clear probe
        </Link>
      ) : null}
      <Link
        to="/admin/monitoring?probe=1"
        aria-disabled={isProbing}
        className={[
          'inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium transition-colors',
          isProbing
            ? 'cursor-progress bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary'
            : 'bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-1.5 w-1.5 rounded-full',
            isProbing ? 'animate-pulse bg-[var(--status-warning-text)]' : 'bg-[var(--status-success-text)]',
          ].join(' ')}
          aria-hidden
        />
        {isProbing ? 'Probing…' : liveProbe ? 'Re-run live probe' : 'Run live probe'}
      </Link>
    </div>
  );
}

function ProviderHealthCard({ provider }: { provider: ProviderHealthRow }) {
  const status = String(provider.status ?? 'unknown');
  const meta = PROVIDER_HEALTH_META[status] ?? PROVIDER_HEALTH_META.unknown;

  return (
    <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
      <div className="flex items-center gap-2">
        <span className={['inline-block h-2.5 w-2.5 shrink-0 rounded-full', meta.dot].join(' ')} aria-hidden />
        <strong className="truncate text-sm text-bolt-elements-textPrimary">{provider.provider ?? 'provider'}</strong>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {provider.liveChecked ? <StatusPill tone="accent">live</StatusPill> : null}
          <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
        </span>
      </div>
      <p className="mt-1.5 text-xs text-bolt-elements-textSecondary">
        {provider.enabled ? 'Enabled' : 'Disabled'}
        {' · '}
        {provider.keyConfigured ? 'Platform key set' : 'No platform key'}
        {typeof provider.latencyMs === 'number' ? ` · ${provider.latencyMs}ms` : ''}
        {typeof provider.statusCode === 'number' ? ` · HTTP ${provider.statusCode}` : ''}
      </p>
      {provider.error ? (
        <p className="mt-1.5 break-words text-xs text-[var(--status-error-text)]">{provider.error}</p>
      ) : null}
    </div>
  );
}

function MonitoringEmpty() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-bolt-elements-textTertiary">
      No data recorded yet.
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

type AdminUser = {
  id: string;
  email?: string;
  name?: string | null;
  platformAdmin?: boolean;
  mfaEnabled?: boolean;
  createdAt?: string;

  /* Tenant membership (id/name/slug only), provided by GET /admin/users. */
  organizations?: { id: string; name?: string; slug?: string }[];
};

/*
 * Operational user-management panel for the in-app /admin. Every action is wired
 * to the real backend over the session cookie (no hand-pasted token). The admin
 * types their password once (step-up); each row action reuses it. The promote /
 * revoke platform-admin button is the one that unblocks everything else.
 */
type AdminUsersSort = 'name' | 'email' | 'createdAt';

function UsersPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const users = (Array.isArray(payload.users) ? payload.users : []) as AdminUser[];
  const suspendedIds = new Set((Array.isArray(payload.suspendedUserIds) ? payload.suspendedUserIds : []).map(String));
  const [password, setPassword] = useState('');

  const [searchParams, setSearchParams] = useSearchParams();
  const total = typeof payload.total === 'number' ? payload.total : users.length;
  const page = typeof payload.page === 'number' ? payload.page : 1;
  const pageSize = typeof payload.pageSize === 'number' ? payload.pageSize : 50;
  const sort = (searchParams.get('sort') as AdminUsersSort) || 'createdAt';
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  /* Debounced (250ms) server search via ?q= — the loader forwards it to the API. */
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          const trimmed = query.trim();

          if (trimmed) {
            next.set('q', trimmed);
          } else {
            next.delete('q');
          }

          next.delete('page');

          return next;
        },
        { replace: true },
      );
    }, 250);

    return () => window.clearTimeout(handle);
  }, [query, setSearchParams]);

  const setSort = (column: AdminUsersSort) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        const nextDir = sort === column && dir === 'asc' ? 'desc' : 'asc';

        next.set('sort', column);
        next.set('dir', nextDir);
        next.delete('page');

        return next;
      },
      { replace: true },
    );
  };

  const setPage = (nextPage: number) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);

        if (nextPage > 1) {
          next.set('page', String(nextPage));
        } else {
          next.delete('page');
        }

        return next;
      },
      { replace: true },
    );
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  const sortableHeader = (label: string, column: AdminUsersSort) => (
    <th
      className="px-4 py-3 font-medium"
      aria-sort={sort === column ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => setSort(column)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-bolt-elements-textPrimary"
      >
        {label}
        {sort === column ? <span aria-hidden>{dir === 'asc' ? '▲' : '▼'}</span> : null}
      </button>
    </th>
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Confirm changes with your password</h3>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Admin actions are step-up protected. Enter your password once, then apply changes below. It is sent only with
          the action and never stored.
        </p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
          data-testid="admin-reauth-password"
          className="mt-3 w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
        />
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search users by name or email"
        aria-label="Search users"
        className="w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
      />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              {sortableHeader('User', 'name')}
              {sortableHeader('Email', 'email')}
              {sortableHeader('Created', 'createdAt')}
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <UserRow key={user.id} user={user} suspended={suspendedIds.has(user.id)} password={password} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-bolt-elements-textSecondary">
        <span>
          {from}–{to} of {total}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={!hasPrev}
            className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={!hasNext}
            className="rounded-md border border-bolt-elements-borderColor px-2.5 py-1 font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </span>
      </div>
    </div>
  );
}

function UserRow({ user, suspended, password }: { user: AdminUser; suspended: boolean; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const navigate = useNavigate();
  const busy = fetcher.state !== 'idle';

  /* Suspend / Reactivate go through a mandatory-reason confirmation dialog. */
  const [confirmKind, setConfirmKind] = useState<'suspend' | 'unsuspend' | null>(null);

  const run = (fields: Record<string, string>) => {
    fetcher.submit({ ...fields, userId: user.id, password }, { method: 'post' });
  };

  const organizations = user.organizations ?? [];
  const canImpersonate = !user.platformAdmin && !suspended;

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{user.name ?? '—'}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-bolt-elements-textSecondary">{user.email ?? user.id}</div>
      </td>
      <td className="px-4 py-3">
        <div className="text-bolt-elements-textSecondary">
          {user.createdAt ? <RelativeTime value={user.createdAt} /> : '—'}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {user.platformAdmin ? <StatusPill tone="accent">platform-admin</StatusPill> : null}
          {suspended ? <StatusPill tone="danger">suspended</StatusPill> : <StatusPill tone="ok">active</StatusPill>}
          {user.mfaEnabled ? <StatusPill tone="muted">MFA on</StatusPill> : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <Dropdown
          trigger={
            <button
              type="button"
              disabled={busy}
              aria-label={`Actions for ${user.email ?? user.id}`}
              data-testid={`user-actions-${user.id}`}
              className="inline-flex h-7 w-8 items-center justify-center rounded-md border border-bolt-elements-borderColor text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden>⋯</span>
            </button>
          }
        >
          {canImpersonate ? (
            <DropdownItem onSelect={() => run({ intent: 'impersonate' })}>
              <span className="text-[var(--vc-ide-accent-action)]" data-testid={`user-impersonate-${user.id}`}>
                View as
              </span>
            </DropdownItem>
          ) : null}

          {organizations.map((org) => (
            <DropdownItem key={org.id} onSelect={() => navigate('/admin/organizations')}>
              Organization: {org.name ?? org.slug ?? org.id}
            </DropdownItem>
          ))}

          {canImpersonate || organizations.length > 0 ? <DropdownSeparator /> : null}

          {user.platformAdmin ? (
            <DropdownItem onSelect={() => run({ intent: 'platform-admin', value: 'false' })}>
              <span className="text-[var(--status-error-text)]" data-testid={`user-demote-${user.id}`}>
                Revoke admin
              </span>
            </DropdownItem>
          ) : (
            <DropdownItem onSelect={() => run({ intent: 'platform-admin', value: 'true' })}>
              <span data-testid={`user-promote-${user.id}`}>Promote to admin</span>
            </DropdownItem>
          )}

          <DropdownItem onSelect={() => run({ intent: 'force-logout' })}>Force logout</DropdownItem>

          {user.mfaEnabled ? (
            <DropdownItem onSelect={() => run({ intent: 'reset-mfa' })}>Reset MFA</DropdownItem>
          ) : null}

          {!user.platformAdmin ? (
            <>
              <DropdownItem onSelect={() => run({ intent: 'strike', severity: 'minor' })}>
                <span className="text-[var(--status-error-text)]" data-testid={`user-strike-${user.id}`}>
                  Strike
                </span>
              </DropdownItem>
              <DropdownItem onSelect={() => run({ intent: 'clear-strikes' })}>Clear strikes</DropdownItem>
            </>
          ) : null}

          <DropdownSeparator />

          {suspended ? (
            <DropdownItem onSelect={() => setConfirmKind('unsuspend')}>
              <span data-testid={`user-unsuspend-${user.id}`}>Reactivate…</span>
            </DropdownItem>
          ) : (
            <DropdownItem onSelect={() => setConfirmKind('suspend')}>
              <span className="text-[var(--status-error-text)]" data-testid={`user-suspend-${user.id}`}>
                Suspend…
              </span>
            </DropdownItem>
          )}
        </Dropdown>

        {fetcher.data?.message ? (
          <p className="mt-1.5 text-xs text-[var(--status-success-text)]">{fetcher.data.message}</p>
        ) : null}
        {fetcher.data?.error ? (
          <p className="mt-1.5 text-xs text-[var(--status-error-text)]">{fetcher.data.error}</p>
        ) : null}

        <UserActionReasonDialog
          kind={confirmKind}
          user={user}
          busy={busy}
          onCancel={() => setConfirmKind(null)}
          onConfirm={(reason) => {
            if (confirmKind) {
              run({ intent: confirmKind, reason });
            }

            setConfirmKind(null);
          }}
        />
      </td>
    </tr>
  );
}

/*
 * Mandatory-reason confirmation for Suspend / Reactivate. Mirrors the
 * ConfirmationDialog idiom (ui/Dialog primitives) but adds a required reason
 * textarea — confirm stays disabled until a reason is typed. The reason is
 * persisted server-side in the admin audit event.
 */
function UserActionReasonDialog({
  kind,
  user,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: 'suspend' | 'unsuspend' | null;
  user: AdminUser;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const open = kind !== null;

  /* A fresh dialog never inherits the previous action's reason. */
  useEffect(() => {
    if (!open) {
      setReason('');
    }
  }, [open]);

  const destructive = kind === 'suspend';
  const label = destructive ? 'Suspend' : 'Reactivate';

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <Dialog showCloseButton={false} onBackdrop={onCancel}>
        <div className="p-6">
          <DialogTitle>
            {label} {user.email ?? user.id}?
          </DialogTitle>
          <DialogDescription>
            {destructive
              ? 'The user is signed out everywhere and blocked from signing in until reactivated.'
              : 'The user can sign in again immediately.'}{' '}
            The reason below is written to the admin audit log.
          </DialogDescription>
          <label
            htmlFor={`user-action-reason-${user.id}`}
            className="mt-4 block text-xs font-medium text-bolt-elements-textSecondary"
          >
            Reason{' '}
            <span aria-hidden className="text-[var(--status-error-text)]">
              *
            </span>
          </label>
          <textarea
            id={`user-action-reason-${user.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            required
            placeholder={
              destructive ? 'Why is this account being suspended?' : 'Why is this account being reactivated?'
            }
            data-testid="user-action-reason"
            className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || reason.trim().length === 0}
              onClick={() => onConfirm(reason.trim())}
              data-testid="user-action-confirm"
              className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
                destructive ? 'bg-[var(--status-error-text)]' : 'bg-[var(--vc-ide-accent-action)]'
              }`}
            >
              {label}
            </button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'ok' | 'danger' | 'warn' | 'accent' | 'muted';
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    ok: 'border-[color-mix(in_srgb,var(--status-success-text)_30%,transparent)] text-[var(--status-success-text)]',
    danger: 'border-[color-mix(in_srgb,var(--status-error-text)_30%,transparent)] text-[var(--status-error-text)]',
    warn: 'border-[color-mix(in_srgb,var(--status-warning-text)_35%,transparent)] text-[var(--status-warning-text)]',
    accent: 'border-bolt-elements-borderColorActive text-bolt-elements-textPrimary',
    muted: 'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

type AdminProviderRow = {
  provider: string;
  displayName: string;
  enabled: boolean;
  keyConfigured?: boolean;
  p95Ms?: number;
  errorPct?: number;
};

type ProviderThresholds = { warnErrorPct: number; errorErrorPct: number };

/*
 * F18: AI providers panel. Replaces the flat provider toggle with an ordered,
 * actionable list. Each row can be enabled/disabled (real /admin/providers/toggle)
 * and reordered ↑/↓ — the reorder persists the whole name list to the
 * `providers.fallbackOrder` system setting (POST /admin/providers/fallback-order),
 * which the gateway's enabled-provider resolution (/providers/enabled) honors.
 * p95 latency and 24h error-rate render with warn (≥2%) / error (≥5%) thresholds;
 * they show “no data” until per-request provider instrumentation lands (the API
 * reports metricsAvailable:false rather than fabricating numbers). Step-up
 * protected like the other operational panels.
 */
function ProvidersPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const providers = (Array.isArray(payload.providers) ? payload.providers : []) as AdminProviderRow[];
  const metricsAvailable = payload.metricsAvailable === true;

  const thresholds: ProviderThresholds =
    payload.thresholds && typeof payload.thresholds === 'object' && !Array.isArray(payload.thresholds)
      ? {
          warnErrorPct: Number((payload.thresholds as Record<string, JsonValue>).warnErrorPct) || 2,
          errorErrorPct: Number((payload.thresholds as Record<string, JsonValue>).errorErrorPct) || 5,
        }
      : { warnErrorPct: 2, errorErrorPct: 5 };

  const [password, setPassword] = useState('');
  const reorder = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const reordering = reorder.state !== 'idle';

  const order = providers.map((provider) => provider.provider);

  const move = (index: number, dir: -1 | 1) => {
    const next = moveItem(order, index, dir);

    if (next === order) {
      return;
    }

    reorder.submit({ intent: 'provider-reorder', order: JSON.stringify(next), password }, { method: 'post' });
  };

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Provider changes are step-up protected. Enter your password once, then enable/disable a provider or reorder the fallback priority below. The gateway tries enabled providers top-to-bottom."
      />

      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-bolt-elements-textPrimary">24h error-rate thresholds</span>
          <StatusPill tone="warn">warn ≥ {thresholds.warnErrorPct}%</StatusPill>
          <StatusPill tone="danger">error ≥ {thresholds.errorErrorPct}%</StatusPill>
        </div>
        {!metricsAvailable ? (
          <p className="mt-2 text-xs text-bolt-elements-textTertiary">
            Per-request provider metrics are not recorded yet, so p95 latency and 24h error-rate show “no data”.
            Fallback order below is fully live.
          </p>
        ) : null}
        <RowFeedback data={reorder.data} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">p95 latency</th>
              <th className="px-4 py-3 font-medium">24h errors</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={5}>
                  No providers found.
                </td>
              </tr>
            ) : (
              providers.map((row, index) => (
                <ProviderRow
                  key={row.provider}
                  row={row}
                  index={index}
                  count={providers.length}
                  password={password}
                  metricsAvailable={metricsAvailable}
                  thresholds={thresholds}
                  reordering={reordering}
                  onMove={move}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProviderRow({
  row,
  index,
  count,
  password,
  metricsAvailable,
  thresholds,
  reordering,
  onMove,
}: {
  row: AdminProviderRow;
  index: number;
  count: number;
  password: string;
  metricsAvailable: boolean;
  thresholds: ProviderThresholds;
  reordering: boolean;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const toggle = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const toggling = toggle.state !== 'idle';
  const enabled = row.enabled;

  // Platform-key entry (write-only). Was entirely missing from the UI.
  const saveKey = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const savingKey = saveKey.state !== 'idle';
  const [keyDraft, setKeyDraft] = useState('');

  const p95Label = metricsAvailable && typeof row.p95Ms === 'number' ? `${row.p95Ms} ms` : '—';
  const errPct = metricsAvailable && typeof row.errorPct === 'number' ? row.errorPct : undefined;
  const errTone = errPct === undefined ? 'muted' : errorRateTone(errPct, thresholds);

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="w-5 text-xs font-medium text-bolt-elements-textSecondary">{index + 1}</span>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              className={ROW_BTN}
              disabled={reordering || !password || index === 0}
              aria-label={`Move ${row.displayName} up`}
              data-testid={`provider-up-${row.provider}`}
              onClick={() => onMove(index, -1)}
            >
              <span className="i-ph:arrow-up" aria-hidden />
            </button>
            <button
              type="button"
              className={ROW_BTN}
              disabled={reordering || !password || index === count - 1}
              aria-label={`Move ${row.displayName} down`}
              data-testid={`provider-down-${row.provider}`}
              onClick={() => onMove(index, 1)}
            >
              <span className="i-ph:arrow-down" aria-hidden />
            </button>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{row.displayName}</div>
        <div className="text-xs text-bolt-elements-textSecondary">{row.provider}</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={enabled ? 'ok' : 'muted'}>{enabled ? 'enabled' : 'disabled'}</StatusPill>
          <button
            type="button"
            className={ROW_BTN}
            disabled={toggling || !password}
            data-testid={`provider-toggle-${row.provider}`}
            onClick={() =>
              toggle.submit(
                {
                  intent: 'provider-toggle',
                  provider: row.provider,
                  displayName: row.displayName,
                  value: String(!enabled),
                  password,
                },
                { method: 'post' },
              )
            }
          >
            {toggling ? '…' : enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
        {!password ? (
          <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above first.</p>
        ) : null}
        <RowFeedback data={toggle.data} />

        {/* Platform API key entry — the piece that was missing so no key could ever be set. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            type="password"
            value={keyDraft}
            onChange={(event) => setKeyDraft(event.target.value)}
            disabled={!password || savingKey}
            autoComplete="off"
            placeholder={row.keyConfigured ? 'Replace platform key' : 'Set platform key'}
            aria-label={`${row.displayName} platform API key`}
            data-testid={`provider-key-input-${row.provider}`}
            className="min-h-8 w-44 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-xs text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary"
          />
          <button
            type="button"
            className={ROW_BTN}
            disabled={!password || savingKey || !keyDraft.trim()}
            data-testid={`provider-save-key-${row.provider}`}
            onClick={() => {
              saveKey.submit(
                { intent: 'provider-credentials', provider: row.provider, apiKey: keyDraft, password },
                { method: 'post' },
              );
              setKeyDraft('');
            }}
          >
            {savingKey ? '…' : 'Save key'}
          </button>
          <StatusPill tone={row.keyConfigured ? 'ok' : 'muted'}>{row.keyConfigured ? 'key set' : 'no key'}</StatusPill>
        </div>
        <RowFeedback data={saveKey.data} />
      </td>
      <td className="px-4 py-3 text-bolt-elements-textSecondary">{p95Label}</td>
      <td className="px-4 py-3">
        {errPct === undefined ? (
          <span className="text-bolt-elements-textTertiary">—</span>
        ) : (
          <StatusPill tone={errTone}>{errPct.toFixed(1)}%</StatusPill>
        )}
      </td>
    </tr>
  );
}

type ToggleKind = 'providers' | 'models' | 'feature-flags';

/*
 * Operational enable/disable panel for the registry + feature-flag admin
 * sections. Same session-auth + password step-up as the users panel: the admin
 * confirms once, then flips providers/models/flags on or off (real backend
 * toggle, reflected on revalidate).
 */
function ToggleListPanel({ payload, kind }: { payload: Record<string, JsonValue>; kind: ToggleKind }) {
  const collectionKey = kind === 'feature-flags' ? 'flags' : kind;

  const rows = (Array.isArray(payload[collectionKey]) ? payload[collectionKey] : []) as Array<
    Record<string, JsonValue>
  >;

  const [password, setPassword] = useState('');

  const noun = kind === 'providers' ? 'provider' : kind === 'models' ? 'model' : 'flag';

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Confirm changes with your password</h3>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Step 1: enter your password below. Step 2: click <strong>Enable</strong> or <strong>Disable</strong> on a{' '}
          {noun} row to apply the change — that button is the confirm. Your password is sent only with the action.
        </p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
          data-testid="admin-reauth-password"
          className="mt-3 w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">{kind === 'feature-flags' ? 'Flag' : noun}</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <ToggleRow key={toggleRowId(row, kind) || index} row={row} kind={kind} password={password} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/*
 * MCP marketplace catalog management. Lists every catalog entry with its
 * install count and feature/verify flags; each row can be featured / verified /
 * IDE-featured toggled, edited (full JSON entry), or deleted. A create form adds
 * a new entry, and an org-policy form force-enables / allow-lists / blocks an
 * entry for a specific organization. Every write is step-up protected (password
 * confirm → /auth/reauth) exactly like the other admin panels.
 */
const MCP_DOMAIN_OPTIONS = [
  'AI_AGENTS',
  'CODE_EXECUTION',
  'DATABASES',
  'DEVOPS',
  'DEVELOPER_TOOLS',
  'COMMUNICATION',
  'PRODUCTIVITY',
  'KNOWLEDGE',
  'WEB_BROWSING',
  'SEARCH',
  'CLOUD',
  'SECURITY',
  'FILESYSTEM',
  'VERSION_CONTROL',
  'MONITORING',
  'OTHER',
] as const;

const MCP_TRANSPORT_OPTIONS = ['STDIO', 'SSE', 'STREAMABLE_HTTP'] as const;

const mcpInputClass =
  'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

function McpCatalogPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const entries = (Array.isArray(payload.entries) ? payload.entries : []) as Array<Record<string, JsonValue>>;
  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Confirm changes with your password</h3>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Enter your password once. Every create / edit / toggle / delete below re-authenticates (≤5 min) before it is
          applied. Your password is sent only with the action and never stored.
        </p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
          data-testid="admin-reauth-password"
          className="mt-3 w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
        />
      </div>

      <McpCatalogCreateForm password={password} />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Domain</th>
              <th className="px-4 py-3 font-medium">Installs</th>
              <th className="px-4 py-3 font-medium">Flags</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-bolt-elements-textTertiary">
                  No catalog entries yet. Use the form above to create one.
                </td>
              </tr>
            ) : (
              entries.map((entry) => <McpCatalogRow key={String(entry.id)} entry={entry} password={password} />)
            )}
          </tbody>
        </table>
      </div>

      <McpGlobalPolicyForm entries={entries} password={password} />

      <McpOrgPolicyForm entries={entries} password={password} />
    </div>
  );
}

function McpCatalogCreateForm({ password }: { password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [domain, setDomain] = useState<(typeof MCP_DOMAIN_OPTIONS)[number]>('OTHER');
  const [transport, setTransport] = useState<(typeof MCP_TRANSPORT_OPTIONS)[number]>('STREAMABLE_HTTP');
  const [tags, setTags] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [configSchema, setConfigSchema] = useState('{}');
  const [configTemplate, setConfigTemplate] = useState('{}');
  const [localError, setLocalError] = useState('');

  const create = () => {
    setLocalError('');

    let schema: unknown;
    let template: unknown;

    try {
      schema = JSON.parse(configSchema || '{}');
      template = JSON.parse(configTemplate || '{}');
    } catch {
      setLocalError('Config schema and template must be valid JSON.');
      return;
    }

    const entry: Record<string, unknown> = {
      slug,
      name,
      description,
      author,
      version,
      domain,
      transport,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      configSchema: schema,
      configTemplate: template,
    };

    if (homepageUrl.trim()) {
      entry.homepageUrl = homepageUrl.trim();
    }

    fetcher.submit({ intent: 'mcp-catalog-create', entry: JSON.stringify(entry), password }, { method: 'post' });
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Create catalog entry</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Slug
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-server"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Server"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Author
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Vendor"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Version
          <input value={version} onChange={(e) => setVersion(e.target.value)} className={mcpInputClass} />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Domain
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as (typeof MCP_DOMAIN_OPTIONS)[number])}
            className={mcpInputClass}
          >
            {MCP_DOMAIN_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Transport
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as (typeof MCP_TRANSPORT_OPTIONS)[number])}
            className={mcpInputClass}
          >
            {MCP_TRANSPORT_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2 lg:col-span-3">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this MCP server does"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="db, sql"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2">
          Homepage URL
          <input
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="https://example.com"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2 lg:col-span-3">
          Config schema (JSON)
          <textarea
            value={configSchema}
            onChange={(e) => setConfigSchema(e.target.value)}
            rows={3}
            className={`${mcpInputClass} font-mono`}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2 lg:col-span-3">
          Config template (JSON)
          <textarea
            value={configTemplate}
            onChange={(e) => setConfigTemplate(e.target.value)}
            rows={3}
            className={`${mcpInputClass} font-mono`}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !password || !slug || !name}
          onClick={create}
          className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create entry'}
        </button>
        {localError ? <span className="text-xs text-[var(--status-error-text)]">{localError}</span> : null}
        {fetcher.data?.message ? (
          <span className="text-xs text-[var(--status-success-text)]">{fetcher.data.message}</span>
        ) : null}
        {fetcher.data?.error ? (
          <span className="text-xs text-[var(--status-error-text)]">{fetcher.data.error}</span>
        ) : null}
      </div>
    </div>
  );
}

function McpCatalogRow({ entry, password }: { entry: Record<string, JsonValue>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const id = String(entry.id ?? '');
  const [editing, setEditing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const featured = entry.featured === true;
  const verified = entry.verified === true;
  const idePanel = entry.featuredForIdePanel === true;
  const enabled = entry.enabled !== false;

  const toggle = (field: 'featured' | 'verified' | 'featuredForIdePanel' | 'enabled', current: boolean) => {
    fetcher.submit({ intent: 'mcp-catalog-toggle', id, field, value: String(!current), password }, { method: 'post' });
  };

  const remove = () => {
    setConfirmDeleteOpen(true);
  };

  const flagBtn = (active: boolean) =>
    active
      ? 'rounded-md bg-bolt-elements-item-contentAccent px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50'
      : 'rounded-md border border-bolt-elements-borderColor px-2 py-1 text-[11px] text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 disabled:opacity-50';

  return (
    <>
      <tr className={`border-b border-bolt-elements-borderColor align-top${enabled ? '' : ' opacity-60'}`}>
        <td className="px-4 py-3 text-bolt-elements-textPrimary">
          {String(entry.name ?? '')}
          {!enabled ? (
            <span className="ml-2 rounded-full border border-[color-mix(in_srgb,var(--status-error-text)_40%,transparent)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--status-error-text)]">
              Disabled
            </span>
          ) : null}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-bolt-elements-textSecondary">{String(entry.slug ?? '')}</td>
        <td className="px-4 py-3 text-xs text-bolt-elements-textSecondary">{String(entry.domain ?? '')}</td>
        <td className="px-4 py-3 text-bolt-elements-textSecondary">{Number(entry.installCount ?? 0)}</td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy || !password}
              onClick={() => toggle('featured', featured)}
              className={flagBtn(featured)}
            >
              Featured
            </button>
            <button
              type="button"
              disabled={busy || !password}
              onClick={() => toggle('verified', verified)}
              className={flagBtn(verified)}
            >
              Verified
            </button>
            <button
              type="button"
              disabled={busy || !password}
              onClick={() => toggle('featuredForIdePanel', idePanel)}
              className={flagBtn(idePanel)}
            >
              IDE panel
            </button>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !password}
              onClick={() => toggle('enabled', enabled)}
              title={
                enabled
                  ? 'Disable globally: hide from the catalog, block new installs and turn off existing installs (reversible).'
                  : 'Re-enable globally: restore visibility, installs and the previously-disabled installs.'
              }
              className={
                enabled
                  ? 'rounded-md border border-[color-mix(in_srgb,var(--status-error-text)_40%,transparent)] px-2 py-1 text-[11px] text-[var(--status-error-text)] hover:bg-[color-mix(in_srgb,var(--status-error-text)_10%,transparent)] disabled:opacity-50'
                  : 'rounded-md bg-[var(--status-success-text)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50'
              }
            >
              {enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-[11px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            >
              {editing ? 'Close' : 'Edit'}
            </button>
            <button
              type="button"
              disabled={busy || !password}
              onClick={remove}
              className="rounded-md border border-[color-mix(in_srgb,var(--status-error-text)_40%,transparent)] px-2 py-1 text-[11px] text-[var(--status-error-text)] hover:bg-[color-mix(in_srgb,var(--status-error-text)_10%,transparent)] disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          {fetcher.data?.message ? (
            <div className="mt-1 text-[11px] text-[var(--status-success-text)]">{fetcher.data.message}</div>
          ) : null}
          {fetcher.data?.error ? (
            <div className="mt-1 text-[11px] text-[var(--status-error-text)]">{fetcher.data.error}</div>
          ) : null}
        </td>
      </tr>
      {editing ? (
        <tr className="border-b border-bolt-elements-borderColor">
          <td colSpan={6} className="px-4 py-3">
            <McpCatalogEditForm entry={entry} password={password} onDone={() => setEditing(false)} />
          </td>
        </tr>
      ) : null}
      <ConfirmationDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          setConfirmDeleteOpen(false);
          fetcher.submit({ intent: 'mcp-catalog-delete', id, password }, { method: 'post' });
        }}
        title={`Delete "${String(entry.slug)}"?`}
        description="This also removes all installs of it. This cannot be undone."
        confirmLabel="Delete entry"
        variant="destructive"
      />
    </>
  );
}

function McpCatalogEditForm({
  entry,
  password,
  onDone,
}: {
  entry: Record<string, JsonValue>;
  password: string;
  onDone: () => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const id = String(entry.id ?? '');

  const [name, setName] = useState(String(entry.name ?? ''));
  const [description, setDescription] = useState(String(entry.description ?? ''));
  const [author, setAuthor] = useState(String(entry.author ?? ''));
  const [version, setVersion] = useState(String(entry.version ?? ''));
  const [domain, setDomain] = useState(String(entry.domain ?? 'OTHER'));
  const [transport, setTransport] = useState(String(entry.transport ?? 'STREAMABLE_HTTP'));
  const [tags, setTags] = useState(Array.isArray(entry.tags) ? entry.tags.join(', ') : '');
  const [homepageUrl, setHomepageUrl] = useState(String(entry.homepageUrl ?? ''));
  const [configSchema, setConfigSchema] = useState(JSON.stringify(entry.configSchema ?? {}, null, 2));
  const [localError, setLocalError] = useState('');

  const save = () => {
    setLocalError('');

    let schema: unknown;

    try {
      schema = JSON.parse(configSchema || '{}');
    } catch {
      setLocalError('Config schema must be valid JSON.');
      return;
    }

    const patch: Record<string, unknown> = {
      name,
      description,
      author,
      version,
      domain,
      transport,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      homepageUrl: homepageUrl.trim() ? homepageUrl.trim() : null,
      configSchema: schema,
    };

    fetcher.submit({ intent: 'mcp-catalog-update', id, entry: JSON.stringify(patch), password }, { method: 'post' });
    onDone();
  };

  return (
    <div className="grid gap-3 rounded-md bg-bolt-elements-background-depth-1 p-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="block text-xs text-bolt-elements-textSecondary">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={mcpInputClass} />
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary">
        Author
        <input value={author} onChange={(e) => setAuthor(e.target.value)} className={mcpInputClass} />
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary">
        Version
        <input value={version} onChange={(e) => setVersion(e.target.value)} className={mcpInputClass} />
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary">
        Domain
        <select value={domain} onChange={(e) => setDomain(e.target.value)} className={mcpInputClass}>
          {MCP_DOMAIN_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary">
        Transport
        <select value={transport} onChange={(e) => setTransport(e.target.value)} className={mcpInputClass}>
          {MCP_TRANSPORT_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary">
        Tags (comma-separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={mcpInputClass} />
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2 lg:col-span-3">
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} className={mcpInputClass} />
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2">
        Homepage URL
        <input value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} className={mcpInputClass} />
      </label>
      <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2 lg:col-span-3">
        Config schema (JSON)
        <textarea
          value={configSchema}
          onChange={(e) => setConfigSchema(e.target.value)}
          rows={4}
          className={`${mcpInputClass} font-mono`}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button
          type="button"
          disabled={busy || !password}
          onClick={save}
          className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {localError ? <span className="text-xs text-[var(--status-error-text)]">{localError}</span> : null}
        {fetcher.data?.error ? (
          <span className="text-xs text-[var(--status-error-text)]">{fetcher.data.error}</span>
        ) : null}
      </div>
    </div>
  );
}

function McpOrgPolicyForm({ entries, password }: { entries: Array<Record<string, JsonValue>>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [organizationId, setOrganizationId] = useState('');
  const [slug, setSlug] = useState(entries.length > 0 ? String(entries[0].slug ?? '') : '');
  const [mode, setMode] = useState<'forced' | 'allowed' | 'blocked'>('allowed');

  const apply = (intent: 'mcp-policy-set' | 'mcp-policy-clear') => {
    fetcher.submit({ intent, organizationId, slug, mode, password }, { method: 'post' });
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Organization MCP policy</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Govern which catalog entries an organization may install. <strong>Forced</strong> and <strong>allowed</strong>{' '}
        entries form the org allow-list — once any exist, org members can install only those. <strong>Blocked</strong>{' '}
        denies a single entry. Clear removes the policy for that entry (back to default-open). Step-up protected and
        audited.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Organization ID
          <input
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            placeholder="org_…"
            data-testid="mcp-policy-org"
            className={mcpInputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Catalog entry
          <select value={slug} onChange={(e) => setSlug(e.target.value)} className={mcpInputClass}>
            {entries.length === 0 ? <option value="">No entries</option> : null}
            {entries.map((entry) => (
              <option key={String(entry.slug)} value={String(entry.slug)}>
                {String(entry.name ?? entry.slug)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'forced' | 'allowed' | 'blocked')}
            className={mcpInputClass}
          >
            <option value="allowed">Allow-list</option>
            <option value="forced">Force-enable</option>
            <option value="blocked">Block</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            disabled={busy || !password || !organizationId || !slug}
            onClick={() => apply('mcp-policy-set')}
            className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
          <button
            type="button"
            disabled={busy || !password || !organizationId || !slug}
            onClick={() => apply('mcp-policy-clear')}
            className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 min-h-[1rem] text-xs">
        {fetcher.data?.message ? (
          <span className="text-[var(--status-success-text)]">{fetcher.data.message}</span>
        ) : null}
        {fetcher.data?.error ? <span className="text-[var(--status-error-text)]">{fetcher.data.error}</span> : null}
      </div>
    </div>
  );
}

function McpGlobalPolicyForm({ entries, password }: { entries: Array<Record<string, JsonValue>>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [slug, setSlug] = useState(entries.length > 0 ? String(entries[0].slug ?? '') : '');
  const [mode, setMode] = useState<'forced' | 'allowed' | 'blocked'>('allowed');

  const apply = (intent: 'mcp-global-policy-set' | 'mcp-global-policy-clear') => {
    fetcher.submit({ intent, slug, mode, password }, { method: 'post' });
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Global MCP policy</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Platform-wide governance, one tier ABOVE the org policy — resolved global-first, then org (a server must clear
        both). <strong>Forced</strong> and <strong>allowed</strong> entries form the global allow-list; once any exist,
        only those are installable anywhere. <strong>Blocked</strong> denies an entry platform-wide. Clear removes the
        global policy (back to default-open). This is distinct from the per-row global <em>Disable</em> kill-switch,
        which also hides the entry and turns off existing installs. Step-up protected and audited.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Catalog entry
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            data-testid="mcp-global-policy-slug"
            className={mcpInputClass}
          >
            {entries.length === 0 ? <option value="">No entries</option> : null}
            {entries.map((entry) => (
              <option key={String(entry.slug)} value={String(entry.slug)}>
                {String(entry.name ?? entry.slug)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'forced' | 'allowed' | 'blocked')}
            className={mcpInputClass}
          >
            <option value="allowed">Allow-list</option>
            <option value="forced">Force-enable</option>
            <option value="blocked">Block</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            disabled={busy || !password || !slug}
            onClick={() => apply('mcp-global-policy-set')}
            className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Applying…' : 'Apply'}
          </button>
          <button
            type="button"
            disabled={busy || !password || !slug}
            onClick={() => apply('mcp-global-policy-clear')}
            className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs font-medium text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-2 min-h-[1rem] text-xs">
        {fetcher.data?.message ? (
          <span className="text-[var(--status-success-text)]">{fetcher.data.message}</span>
        ) : null}
        {fetcher.data?.error ? <span className="text-[var(--status-error-text)]">{fetcher.data.error}</span> : null}
      </div>
    </div>
  );
}

/*
 * Self-service OAuth provider config (GitHub/GitLab/Bitbucket). The admin enters
 * their password once (step-up), then sets each provider's client id/secret and
 * enable flag. The secret is write-only — the loader only reports `hasSecret`, so
 * a blank secret field keeps the stored one.
 */
function OauthProvidersPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const connectors = (Array.isArray(payload.connectors) ? payload.connectors : []) as Array<Record<string, JsonValue>>;

  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Confirm changes with your password</h3>
        <p className="mt-1 text-xs text-bolt-elements-textSecondary">
          Enter your password once, then save each provider. Sent only with the action.
        </p>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Your password"
          data-testid="admin-reauth-password"
          className="mt-3 w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
        />
      </div>

      <div className="grid gap-4">
        {connectors.map((connector) => (
          <OauthProviderCard key={String(connector.provider)} connector={connector} password={password} />
        ))}
      </div>
    </div>
  );
}

function OauthProviderCard({ connector, password }: { connector: Record<string, JsonValue>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const provider = String(connector.provider ?? '');
  const hasSecret = connector.hasSecret === true;
  const callbackUrl = String(connector.callbackUrl ?? '');
  const scopes = Array.isArray(connector.scopes) ? connector.scopes.join(' ') : '';

  const [clientId, setClientId] = useState(String(connector.clientId ?? ''));
  const [clientSecret, setClientSecret] = useState('');
  const [enabled, setEnabled] = useState(connector.enabled === true);

  const inputClass =
    'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

  const save = () => {
    fetcher.submit(
      { intent: 'connector-oauth', provider, clientId, clientSecret, enabled: String(enabled), password },
      { method: 'post' },
    );
    setClientSecret('');
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">
          {String(connector.displayName ?? provider)}
        </h3>
        <label className="inline-flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Enabled
        </label>
      </div>

      <div className="mt-3 grid gap-3">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Client ID
          <input
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="OAuth app client id"
            data-testid={`oauth-clientid-${provider}`}
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Client Secret {hasSecret ? <span className="text-[var(--status-success-text)]">• configured</span> : null}
          <input
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={hasSecret ? '•••••••• (leave blank to keep current)' : 'OAuth app client secret'}
            autoComplete="new-password"
            data-testid={`oauth-secret-${provider}`}
            className={inputClass}
          />
        </label>

        <div className="rounded-md bg-bolt-elements-background-depth-1 p-2 text-xs text-bolt-elements-textSecondary">
          <div>Set this Callback URL in the provider’s OAuth app:</div>
          <code className="break-all text-bolt-elements-textPrimary">{callbackUrl}</code>
          {scopes ? (
            <div className="mt-1">
              Scopes: <code className="break-all">{scopes}</code>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !password}
          onClick={save}
          className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {fetcher.data?.message ? (
          <span className="text-xs text-[var(--status-success-text)]">{fetcher.data.message}</span>
        ) : null}
        {fetcher.data?.error ? (
          <span className="text-xs text-[var(--status-error-text)]">{fetcher.data.error}</span>
        ) : null}
      </div>
    </div>
  );
}

/*
 * Actionable quota-override grant form for the Quotas admin section. Same
 * session-auth + password step-up as the other panels: the admin supplies the
 * org id, quota key, limit and reason plus their password, and the action
 * re-authenticates before POSTing to /admin/quota-overrides. This sits above the
 * read-only quota records rendered by DataPanel.
 */
function QuotaOverridePanel() {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [organizationId, setOrganizationId] = useState('');
  const [key, setKey] = useState('projects.count');
  const [limit, setLimit] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');

  const inputClass =
    'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

  const grant = () => {
    fetcher.submit({ intent: 'quota-override', organizationId, key, limit, reason, password }, { method: 'post' });
    setPassword('');
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Grant quota override</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Create an audited per-organization quota override. Step-up protected — your password is sent only with the
        action and never stored.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Organization ID
          <input
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            placeholder="org_…"
            data-testid="quota-override-org"
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Quota key
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="projects.count"
            data-testid="quota-override-key"
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Limit
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="e.g. 50"
            data-testid="quota-override-limit"
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Reason
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="contract expansion"
            data-testid="quota-override-reason"
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2">
          Confirm with your password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Your password"
            data-testid="quota-override-password"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !organizationId || !key || !password}
          onClick={grant}
          className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Granting…' : 'Grant override'}
        </button>
        {fetcher.data?.message ? (
          <span className="text-xs text-[var(--status-success-text)]">{fetcher.data.message}</span>
        ) : null}
        {fetcher.data?.error ? (
          <span className="text-xs text-[var(--status-error-text)]">{fetcher.data.error}</span>
        ) : null}
      </div>
    </div>
  );
}

/*
 * Upsert a platform system setting. Step-up protected like QuotaOverridePanel —
 * the password is sent only with the action. The read-only DataPanel below still
 * lists existing settings; this panel writes via POST /admin/system-settings.
 */
function SystemSettingUpsertPanel() {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');

  const inputClass =
    'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

  const save = () => {
    fetcher.submit({ intent: 'system-setting', key, value, password }, { method: 'post' });
    setPassword('');
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Set system setting</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Create or update a platform system setting by key. The value is stored as JSON when it parses (true / 42 / {'{'}
        …{'}'}), otherwise as a string. Step-up protected — your password is sent only with the action and never stored.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Setting key
          <input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="e.g. signup.enabled"
            data-testid="system-setting-key"
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Value
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder='e.g. true, 100, or "text"'
            data-testid="system-setting-value"
            className={inputClass}
          />
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2">
          Confirm with your password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Your password"
            data-testid="system-setting-password"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || !key || !password}
          onClick={save}
          className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save setting'}
        </button>
        {fetcher.data?.message ? (
          <span className="text-xs text-[var(--status-success-text)]">{fetcher.data.message}</span>
        ) : null}
        {fetcher.data?.error ? (
          <span className="text-xs text-[var(--status-error-text)]">{fetcher.data.error}</span>
        ) : null}
      </div>
    </div>
  );
}

/*
 * Ops controls — three platform-wide operational broadcasts, each wired to an
 * existing API endpoint (no new backend). Step-up protected: the admin types
 * their password once in the shared header and every card submits it with its
 * intent so the route action re-authenticates (≤5 min) before mutating.
 *
 * Current state is read from /admin/system-settings (the section endpoint) so
 * each card prefills from its stored key:
 *   admin.maintenanceMode → { enabled, message }
 *   admin.announcement    → { message, severity, active }
 *   admin.incidentBanner  → { message, status, active }
 */
type SystemSettingRow = { key: string; value: JsonValue };

function readSetting(payload: Record<string, JsonValue>, key: string): Record<string, JsonValue> {
  const rows = (Array.isArray(payload.settings) ? payload.settings : []) as SystemSettingRow[];
  const row = rows.find((item) => item && item.key === key);

  return row && typeof row.value === 'object' && row.value !== null && !Array.isArray(row.value)
    ? (row.value as Record<string, JsonValue>)
    : {};
}

const OPS_INPUT =
  'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

const OPS_PRIMARY_BTN =
  'inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50';

function OpsControlsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const [password, setPassword] = useState('');

  const maintenance = readSetting(payload, 'admin.maintenanceMode');
  const announcement = readSetting(payload, 'admin.announcement');
  const incident = readSetting(payload, 'admin.incidentBanner');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="These are platform-wide broadcasts that take effect immediately. Enter your password once, then publish or clear maintenance mode, an announcement or the incident banner below."
      />

      <MaintenanceModeCard current={maintenance} password={password} />
      <AnnouncementCard current={announcement} password={password} />
      <IncidentBannerCard current={incident} password={password} />
    </div>
  );
}

function MaintenanceModeCard({ current, password }: { current: Record<string, JsonValue>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [enabled, setEnabled] = useState(current.enabled === true);
  const [message, setMessage] = useState(typeof current.message === 'string' ? current.message : '');

  const submit = (next: boolean) => {
    setEnabled(next);
    fetcher.submit({ intent: 'maintenance-mode', enabled: String(next), message, password }, { method: 'post' });
  };

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Maintenance mode</h3>
        <span
          className={
            enabled
              ? 'rounded-full bg-[color-mix(in_srgb,var(--status-warning-text)_10%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--status-warning-text)]'
              : 'rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary'
          }
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        When on, the platform signals maintenance to users. The optional message is shown alongside the maintenance
        state.
      </p>

      <label className="mt-3 block text-xs text-bolt-elements-textSecondary">
        Message (optional)
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. Scheduled maintenance until 18:00 UTC"
          data-testid="ops-maintenance-message"
          className={OPS_INPUT}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {enabled ? (
          <button
            type="button"
            disabled={busy || !password}
            onClick={() => submit(false)}
            data-testid="ops-maintenance-disable"
            className={OPS_PRIMARY_BTN}
          >
            {busy ? 'Saving…' : 'Disable maintenance'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !password}
            onClick={() => submit(true)}
            data-testid="ops-maintenance-enable"
            className={OPS_PRIMARY_BTN}
          >
            {busy ? 'Saving…' : 'Enable maintenance'}
          </button>
        )}
        <RowFeedback data={fetcher.data} />
      </div>
    </div>
  );
}

function AnnouncementCard({ current, password }: { current: Record<string, JsonValue>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [message, setMessage] = useState(typeof current.message === 'string' ? current.message : '');
  const [severity, setSeverity] = useState(typeof current.severity === 'string' ? current.severity : 'info');

  const submit = (active: boolean) => {
    fetcher.submit({ intent: 'announcement', message, severity, active: String(active), password }, { method: 'post' });
  };

  const active = current.active === true;

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Announcement</h3>
        <span
          className={
            active
              ? 'rounded-full bg-[color-mix(in_srgb,var(--status-success-text)_15%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--status-success-text)]'
              : 'rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary'
          }
        >
          {active ? 'Live' : 'Inactive'}
        </span>
      </div>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Broadcast a banner message to all users. Clearing it publishes the same message with an inactive flag so the
        banner is dismissed.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Severity
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            data-testid="ops-announcement-severity"
            className={OPS_INPUT}
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={2}
            placeholder="e.g. New features just shipped — check the changelog."
            data-testid="ops-announcement-message"
            className={OPS_INPUT}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !password || !message.trim()}
          onClick={() => submit(true)}
          data-testid="ops-announcement-publish"
          className={OPS_PRIMARY_BTN}
        >
          {busy ? 'Saving…' : 'Publish announcement'}
        </button>
        <button
          type="button"
          disabled={busy || !password || !message.trim()}
          onClick={() => submit(false)}
          data-testid="ops-announcement-clear"
          className={OPS_PRIMARY_BTN}
        >
          {busy ? 'Saving…' : 'Clear announcement'}
        </button>
        <RowFeedback data={fetcher.data} />
      </div>
    </div>
  );
}

function IncidentBannerCard({ current, password }: { current: Record<string, JsonValue>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const [message, setMessage] = useState(typeof current.message === 'string' ? current.message : '');
  const [status, setStatus] = useState(typeof current.status === 'string' ? current.status : 'investigating');

  const submit = (active: boolean) => {
    fetcher.submit(
      { intent: 'incident-banner', message, status, active: String(active), password },
      { method: 'post' },
    );
  };

  const active = current.active === true;

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Incident banner</h3>
        <span
          className={
            active
              ? 'rounded-full bg-[color-mix(in_srgb,var(--status-error-text)_15%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--status-error-text)]'
              : 'rounded-full bg-bolt-elements-background-depth-3 px-2 py-0.5 text-xs font-medium text-bolt-elements-textSecondary'
          }
        >
          {active ? 'Live' : 'Inactive'}
        </span>
      </div>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Surface an active incident to all users with a status. Mark it resolved and clear to take the banner down.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            data-testid="ops-incident-status"
            className={OPS_INPUT}
          >
            <option value="investigating">Investigating</option>
            <option value="identified">Identified</option>
            <option value="monitoring">Monitoring</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Message
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={2}
            placeholder="e.g. Elevated error rates on preview deploys — we're investigating."
            data-testid="ops-incident-message"
            className={OPS_INPUT}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !password || !message.trim()}
          onClick={() => submit(true)}
          data-testid="ops-incident-publish"
          className={OPS_PRIMARY_BTN}
        >
          {busy ? 'Saving…' : 'Publish incident'}
        </button>
        <button
          type="button"
          disabled={busy || !password || !message.trim()}
          onClick={() => submit(false)}
          data-testid="ops-incident-clear"
          className={OPS_PRIMARY_BTN}
        >
          {busy ? 'Saving…' : 'Clear incident'}
        </button>
        <RowFeedback data={fetcher.data} />
      </div>
    </div>
  );
}

/*
 * Shared password step-up header used by the operational panels below. The
 * admin types their password once; each row action submits it with the intent
 * and the route action re-authenticates (≤5 min) before mutating — identical to
 * UsersPanel. The password is sent only with the action and never stored.
 */
function ReauthHeader({
  password,
  onChange,
  hint,
}: {
  password: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Confirm changes with your password</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">{hint}</p>
      <input
        type="password"
        value={password}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="current-password"
        placeholder="Your password"
        data-testid="admin-reauth-password"
        className="mt-3 w-full max-w-sm rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
      />
    </div>
  );
}

const ROW_BTN =
  'inline-flex items-center rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50';

const ROW_DANGER = `${ROW_BTN} border-[color-mix(in_srgb,var(--status-error-text)_40%,transparent)] text-[var(--status-error-text)] hover:bg-[color-mix(in_srgb,var(--status-error-text)_10%,transparent)]`;

function RowFeedback({ data }: { data?: { message?: string; error?: string } }) {
  return (
    <>
      {data?.message ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--status-success-text)]">
          <span className="i-ph:check-circle-fill" aria-hidden />
          {data.message}
        </p>
      ) : null}
      {data?.error ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--status-error-text)]">
          <span className="i-ph:warning-circle-fill" aria-hidden />
          {data.error}
        </p>
      ) : null}
    </>
  );
}

type AdminWorkspace = {
  id: string;
  name?: string;
  projectId?: string;
  status?: string;
  runtimeMode?: string;
  environment?: string;
};

/*
 * Operational workspace panel: per-row Stop / Restart / Delete wired to the
 * existing POST/DELETE /admin/workspaces/:id endpoints. Delete is destructive →
 * an explicit confirm gate plus the password step-up (the action re-auths too).
 */
function WorkspacesPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const workspaces = (Array.isArray(payload.workspaces) ? payload.workspaces : []) as AdminWorkspace[];
  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Workspace actions are step-up protected. Enter your password once, then Stop / Restart / Delete a workspace below. Delete reclaims the pod and storage and cannot be undone."
      />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Workspace</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={3}>
                  No workspaces found.
                </td>
              </tr>
            ) : (
              workspaces.map((workspace) => (
                <WorkspaceRow key={workspace.id} workspace={workspace} password={password} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkspaceRow({ workspace, password }: { workspace: AdminWorkspace; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const status = String(workspace.status ?? 'UNKNOWN');
  const running = ['PENDING', 'STARTING', 'RUNNING'].includes(status);

  const run = (intent: string) => {
    fetcher.submit({ intent, workspaceId: workspace.id, password }, { method: 'post' });
  };

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const confirmDelete = () => {
    setConfirmDeleteOpen(true);
  };

  const statusTone = status === 'FAILED' ? 'danger' : running ? 'ok' : 'muted';

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{workspace.name ?? workspace.id}</div>
        <div className="text-xs text-bolt-elements-textSecondary">{workspace.id}</div>
        {workspace.runtimeMode || workspace.environment ? (
          <div className="text-xs text-bolt-elements-textTertiary">
            {[workspace.runtimeMode, workspace.environment].filter(Boolean).join(' · ')}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={statusTone}>{status.toLowerCase()}</StatusPill>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={ROW_BTN}
            disabled={busy || !password}
            data-testid={`workspace-stop-${workspace.id}`}
            onClick={() => run('workspace-stop')}
          >
            Stop
          </button>
          <button
            type="button"
            className={ROW_BTN}
            disabled={busy || !password}
            data-testid={`workspace-restart-${workspace.id}`}
            onClick={() => run('workspace-restart')}
          >
            Restart
          </button>
          <button
            type="button"
            className={ROW_DANGER}
            disabled={busy || !password}
            data-testid={`workspace-delete-${workspace.id}`}
            onClick={confirmDelete}
          >
            Delete
          </button>
        </div>
        {!password && !busy ? (
          <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above to enable actions.</p>
        ) : null}
        <RowFeedback data={fetcher.data} />
        {/* Renders via portal, so it is valid inside the table cell. */}
        <ConfirmationDialog
          isOpen={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            run('workspace-delete');
          }}
          title={`Delete workspace "${workspace.name ?? workspace.id}"?`}
          description="This reclaims its pod and storage and cannot be undone."
          confirmLabel="Delete workspace"
          variant="destructive"
        />
      </td>
    </tr>
  );
}

type AdminPreview = {
  workspaceId: string;
  url?: string;
  status?: string;
  createdAt?: string;
  expiresAt?: string;
};

/*
 * Remaining TTL for a preview, derived from its server-computed expiresAt
 * (createdAt + the configured default TTL). Warn tone within the last 10 min,
 * danger once expired.
 */
function remainingTtl(expiresAt?: string): { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  if (!expiresAt) {
    return { label: '—', tone: 'muted' };
  }

  const ms = new Date(expiresAt).getTime() - Date.now();

  if (!Number.isFinite(ms)) {
    return { label: '—', tone: 'muted' };
  }

  if (ms <= 0) {
    return { label: 'expired', tone: 'danger' };
  }

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const human = hours > 0 ? `${hours}h ${minutes}m` : totalMinutes > 0 ? `${totalMinutes}m` : '<1m';

  return { label: `expires in ${human}`, tone: totalMinutes <= 10 ? 'warn' : 'ok' };
}

/*
 * F25 previews panel: shows each preview's remaining TTL, a per-row Kill button
 * (POST /admin/previews/:id/kill — stops the workspace pod serving the preview),
 * and a default-TTL editor that writes the `preview.defaultTtlMinutes` system
 * setting via the shared system-setting upsert. Step-up protected: the admin
 * types their password once in the shared header and every action submits it.
 */
function PreviewsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const previews = (Array.isArray(payload.previews) ? payload.previews : []) as AdminPreview[];
  const defaultTtlMinutes = typeof payload.defaultTtlMinutes === 'number' ? payload.defaultTtlMinutes : 120;
  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Preview actions are step-up protected. Enter your password once, then set the default TTL or Kill a preview below. Killing a preview stops the workspace pod serving it; the preview goes blank until the workspace is restarted."
      />

      <DefaultTtlEditor password={password} currentTtlMinutes={defaultTtlMinutes} />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Preview</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Remaining TTL</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {previews.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={4}>
                  No previews found.
                </td>
              </tr>
            ) : (
              previews.map((preview) => <PreviewRow key={preview.workspaceId} preview={preview} password={password} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/*
 * Default-TTL editor — a focused wrapper over the generic system-setting upsert.
 * It writes the fixed `preview.defaultTtlMinutes` key so ops never have to know
 * the key name, prefilled with the currently-effective value.
 */
function DefaultTtlEditor({ password, currentTtlMinutes }: { password: string; currentTtlMinutes: number }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const [value, setValue] = useState(String(currentTtlMinutes));

  const save = () => {
    fetcher.submit(
      { intent: 'system-setting', key: 'preview.defaultTtlMinutes', value: String(Number(value)), password },
      { method: 'post' },
    );
  };

  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Default preview TTL</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        How long a preview stays alive after its workspace is created. Stored as the{' '}
        <code className="rounded bg-bolt-elements-background-depth-1 px-1 py-0.5">preview.defaultTtlMinutes</code>{' '}
        system setting. Currently{' '}
        <span className="font-medium text-bolt-elements-textPrimary">{currentTtlMinutes} min</span>.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Minutes
          <input
            type="number"
            min={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            data-testid="preview-default-ttl"
            className="mt-1 w-32 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
          />
        </label>
        <button
          type="button"
          disabled={busy || !valid || !password}
          onClick={save}
          data-testid="preview-default-ttl-save"
          className="inline-flex items-center rounded-md border border-[var(--vc-ide-accent-action)] px-3 py-2 text-xs font-medium text-[var(--vc-ide-accent-action)] transition-colors hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save default TTL'}
        </button>
      </div>
      {!password ? (
        <p className="mt-2 text-xs text-bolt-elements-textTertiary">Enter your password above to save.</p>
      ) : null}
      <RowFeedback data={fetcher.data} />
    </div>
  );
}

function PreviewRow({ preview, password }: { preview: AdminPreview; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const killed = fetcher.data?.ok === true;
  const status = String(preview.status ?? 'UNKNOWN');
  const running = ['PENDING', 'STARTING', 'RUNNING'].includes(status);
  const effectiveStatus = killed ? 'STOPPED' : status;
  const statusTone = effectiveStatus === 'FAILED' ? 'danger' : running && !killed ? 'ok' : 'muted';
  const ttl = killed ? { label: '—', tone: 'muted' as const } : remainingTtl(preview.expiresAt);

  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{preview.workspaceId}</div>
        {preview.url ? <div className="text-xs text-bolt-elements-textSecondary">{preview.url}</div> : null}
        {preview.createdAt ? (
          <div className="text-xs text-bolt-elements-textTertiary">created {preview.createdAt}</div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={statusTone}>{effectiveStatus.toLowerCase()}</StatusPill>
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={ttl.tone}>{ttl.label}</StatusPill>
      </td>
      <td className="px-4 py-3">
        {killed || !running ? (
          <StatusPill tone="muted">killed</StatusPill>
        ) : (
          <>
            <button
              type="button"
              className={ROW_DANGER}
              disabled={busy || !password}
              data-testid={`preview-kill-${preview.workspaceId}`}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? 'Killing…' : 'Kill'}
            </button>
            {!password && !busy ? (
              <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above first.</p>
            ) : null}
          </>
        )}
        <RowFeedback data={fetcher.data} />
        {/* Renders via portal, so it is valid inside the table cell. */}
        <ConfirmationDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            fetcher.submit({ intent: 'preview-kill', workspaceId: preview.workspaceId, password }, { method: 'post' });
          }}
          title={`Kill preview for "${preview.workspaceId}"?`}
          description="This stops the workspace pod serving the preview. The preview goes blank until the workspace is restarted."
          confirmLabel="Kill preview"
          variant="destructive"
        />
      </td>
    </tr>
  );
}

type AdminAbuseEvent = {
  id: string;
  organizationId?: string;
  userId?: string;
  type?: string;
  severity?: string;
  resolved?: boolean;
  disposition?: string;
  createdAt?: string;
};

/*
 * F22: abuse-event review panel. Each row shows a status badge (open / warned /
 * dismissed / suspended / resolved) and offers Dismiss, Warn and Suspend actions
 * on top of the legacy Resolve — all wired to the real backend:
 *   Dismiss  → POST /admin/abuse-events/:id/dismiss  (resolves, no user action)
 *   Warn     → POST /admin/abuse-events/:id/warn      (emails the user, stays open)
 *   Suspend  → POST /admin/abuse-events/:id/suspend   (blocks the user, reason req.)
 * Step-up protected (password header). Suspend is destructive → a reason dialog.
 */
function abuseStatus(event: AdminAbuseEvent): { label: string; tone: 'ok' | 'danger' | 'warn' | 'muted' } {
  if (event.disposition === 'suspended') {
    return { label: 'suspended', tone: 'danger' };
  }

  if (event.disposition === 'warned') {
    return { label: 'warned', tone: 'warn' };
  }

  if (event.disposition === 'dismissed') {
    return { label: 'dismissed', tone: 'muted' };
  }

  if (event.resolved === true) {
    return { label: 'resolved', tone: 'ok' };
  }

  return { label: 'open', tone: 'warn' };
}

function AbuseEventsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const events = (Array.isArray(payload.abuseEvents) ? payload.abuseEvents : []) as AdminAbuseEvent[];
  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Abuse actions are step-up protected. Enter your password once, then Dismiss, Warn (emails the user) or Suspend the offender. Suspend blocks the account and requires a reason."
      />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={4}>
                  No abuse events found.
                </td>
              </tr>
            ) : (
              events.map((event) => <AbuseEventRow key={event.id} event={event} password={password} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbuseEventRow({ event, password }: { event: AdminAbuseEvent; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const severity = String(event.severity ?? 'unknown');
  const severityTone = severity === 'critical' || severity === 'high' ? 'danger' : 'muted';

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');

  /*
   * The loader payload reflects the persisted disposition; after a successful
   * fetcher action the row shows the just-applied status until revalidation lands.
   */
  const optimistic = fetcher.data?.ok ? fetcher.data.message : undefined;
  const status = abuseStatus(event);
  const terminal = event.disposition === 'suspended' || event.disposition === 'dismissed' || event.resolved === true;

  const run = (intent: string, extra?: Record<string, string>) =>
    fetcher.submit({ intent, abuseEventId: event.id, password, ...extra }, { method: 'post' });

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{event.type ?? event.id}</div>
        <div className="text-xs text-bolt-elements-textSecondary">
          {[event.organizationId ? `org ${event.organizationId}` : null, event.userId ? `user ${event.userId}` : null]
            .filter(Boolean)
            .join(' · ') || event.id}
        </div>
        {event.createdAt ? <div className="text-xs text-bolt-elements-textTertiary">{event.createdAt}</div> : null}
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={severityTone}>{severity}</StatusPill>
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </td>
      <td className="px-4 py-3">
        {terminal ? (
          <span className="text-xs text-bolt-elements-textTertiary">{optimistic ?? 'No further action.'}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={ROW_BTN}
              disabled={busy || !password}
              data-testid={`abuse-dismiss-${event.id}`}
              onClick={() => run('abuse-dismiss')}
            >
              Dismiss
            </button>
            <button
              type="button"
              className={ROW_BTN}
              disabled={busy || !password || !event.userId}
              title={event.userId ? undefined : 'No user attached to this event.'}
              data-testid={`abuse-warn-${event.id}`}
              onClick={() => run('abuse-warn')}
            >
              Warn
            </button>
            <button
              type="button"
              className={ROW_DANGER}
              disabled={busy || !password || !event.userId}
              title={event.userId ? undefined : 'No user attached to this event.'}
              data-testid={`abuse-suspend-${event.id}`}
              onClick={() => setSuspendOpen(true)}
            >
              Suspend
            </button>
          </div>
        )}
        {!password && !busy && !terminal ? (
          <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above first.</p>
        ) : null}
        <RowFeedback data={fetcher.data} />

        <DialogRoot open={suspendOpen} onOpenChange={(next) => (next ? null : setSuspendOpen(false))}>
          <Dialog showCloseButton={false} onBackdrop={() => setSuspendOpen(false)}>
            <div className="p-6">
              <DialogTitle>Suspend the offending user?</DialogTitle>
              <DialogDescription>
                The user is signed out everywhere and blocked from signing in until reactivated. This event is marked
                “suspended”. The reason below is written to the admin audit log.
              </DialogDescription>
              <label
                htmlFor={`abuse-suspend-reason-${event.id}`}
                className="mt-4 block text-xs font-medium text-bolt-elements-textSecondary"
              >
                Reason{' '}
                <span aria-hidden className="text-[var(--status-error-text)]">
                  *
                </span>
              </label>
              <textarea
                id={`abuse-suspend-reason-${event.id}`}
                value={reason}
                onChange={(inputEvent) => setReason(inputEvent.target.value)}
                rows={3}
                required
                data-testid={`abuse-suspend-reason-${event.id}`}
                className="mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSuspendOpen(false)}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || reason.trim().length === 0}
                  data-testid={`abuse-suspend-confirm-${event.id}`}
                  onClick={() => {
                    setSuspendOpen(false);
                    run('abuse-suspend', { reason: reason.trim() });
                    setReason('');
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--status-error-text)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Suspend user
                </button>
              </div>
            </div>
          </Dialog>
        </DialogRoot>
      </td>
    </tr>
  );
}

type AdminSecurityEvent = {
  id: string;
  action: string;
  severity?: string;
  resolved?: boolean;
  note?: string;
  resolvedAt?: string;
  actorUserId?: string;
  organizationId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  createdAt?: string;
};

/* F23: map the API's derived severity (low/medium/high) to a labelled tone. */
function securitySeverity(severity?: string): { label: string; tone: 'danger' | 'warn' | 'muted' } {
  if (severity === 'high') {
    return { label: 'critical', tone: 'danger' };
  }

  if (severity === 'medium') {
    return { label: 'warning', tone: 'warn' };
  }

  return { label: 'info', tone: 'muted' };
}

/*
 * F23: security-events panel. Renders the derived-severity audit stream as a
 * chronological timeline, shows the unresolved open count, and lets an admin
 * « Mark resolved » with an optional note (persisted via the SecurityEventResolution
 * overlay from migration 0062 — the immutable audit row is never mutated). The
 * sidebar badge (see AdminNav) mirrors the same open count. Step-up protected.
 */
function SecurityEventsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const events = (Array.isArray(payload.events) ? payload.events : []) as AdminSecurityEvent[];

  const openCount =
    typeof payload.openCount === 'number' ? payload.openCount : events.filter((e) => !e.resolved).length;

  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Resolving a security event is step-up protected. Enter your password once, then Mark resolved (with an optional note) below. Resolutions are recorded separately — the audit trail itself is never changed."
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-xs shadow-sm">
        <span className="font-semibold text-bolt-elements-textPrimary">Unresolved</span>
        <StatusPill tone={openCount > 0 ? 'danger' : 'ok'}>{openCount} open</StatusPill>
        <span className="text-bolt-elements-textTertiary">of {events.length} recent security events</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        {events.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No security events found.</p>
        ) : (
          <ol className="relative ml-2 min-w-[520px] border-l border-bolt-elements-borderColor pl-5">
            {events.map((event) => (
              <SecurityEventItem key={event.id} event={event} password={password} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function SecurityEventItem({ event, password }: { event: AdminSecurityEvent; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const resolved = event.resolved === true || fetcher.data?.ok === true;
  const severity = securitySeverity(event.severity);
  const [note, setNote] = useState('');

  const meta = [
    event.actorUserId ? `actor ${event.actorUserId}` : null,
    event.organizationId ? `org ${event.organizationId}` : null,
    event.ipAddress ? `ip ${event.ipAddress}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="relative pb-6 last:pb-0">
      {/* timeline dot */}
      <span
        aria-hidden
        className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-bolt-elements-background-depth-2 bg-[var(--vc-ide-accent-action)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-bolt-elements-textPrimary">{event.action}</span>
        <StatusPill tone={severity.tone}>{severity.label}</StatusPill>
        {resolved ? <StatusPill tone="ok">resolved</StatusPill> : <StatusPill tone="warn">open</StatusPill>}
      </div>
      {event.createdAt ? <div className="mt-0.5 text-xs text-bolt-elements-textTertiary">{event.createdAt}</div> : null}
      {meta ? <div className="mt-0.5 text-xs text-bolt-elements-textSecondary">{meta}</div> : null}

      {resolved ? (
        event.note ? (
          <p className="mt-1.5 text-xs text-bolt-elements-textSecondary">
            <span className="font-medium">Note:</span> {event.note}
          </p>
        ) : null
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="block text-xs text-bolt-elements-textSecondary">
            Resolution note (optional)
            <input
              value={note}
              onChange={(inputEvent) => setNote(inputEvent.target.value)}
              placeholder="e.g. investigated — false positive"
              data-testid={`security-note-${event.id}`}
              className="mt-1 w-72 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
            />
          </label>
          <button
            type="button"
            className={ROW_BTN}
            disabled={busy || !password}
            data-testid={`security-resolve-${event.id}`}
            onClick={() =>
              fetcher.submit(
                { intent: 'security-event-resolve', securityEventId: event.id, note, password },
                { method: 'post' },
              )
            }
          >
            {busy ? 'Resolving…' : 'Mark resolved'}
          </button>
        </div>
      )}
      {!password && !resolved ? (
        <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above first.</p>
      ) : null}
      <RowFeedback data={fetcher.data} />
    </li>
  );
}

type AdminDeletionRequest = {
  userId: string;
  email?: string | null;
  status?: string;
  requestedAt?: string | null;
  purgeDueAt?: string | null;
};

/* F24: purge-queue status → labelled tone. */
function deletionStatusTone(status?: string): { label: string; tone: 'ok' | 'danger' | 'warn' | 'muted' } {
  if (status === 'ready_to_purge') {
    return { label: 'ready to purge', tone: 'danger' };
  }

  if (status === 'grace_period') {
    return { label: 'grace period', tone: 'warn' };
  }

  if (status === 'purged') {
    return { label: 'purged', tone: 'muted' };
  }

  return { label: status ?? 'unknown', tone: 'muted' };
}

/*
 * F24: account-deletions admin panel. Completes the previously read-only section:
 * the J+14 purge queue (status + purge-due date), a per-row « Cancel deletion »
 * (POST /admin/account-deletions/:userId/cancel — clears the user's pending
 * deletion + drops them from the purge index, gated + reauth + audited) and a
 * CSV/JSON export served by the loader (?export=). Step-up protected.
 */
function AccountDeletionsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const requests = (Array.isArray(payload.requests) ? payload.requests : []) as AdminDeletionRequest[];
  const gracePeriodDays = typeof payload.gracePeriodDays === 'number' ? payload.gracePeriodDays : 14;
  const readyToPurge = typeof payload.readyToPurge === 'number' ? payload.readyToPurge : 0;
  const [password, setPassword] = useState('');
  const [searchParams] = useSearchParams();

  const exportHref = (format: 'csv' | 'json') => {
    const params = new URLSearchParams(searchParams);
    params.set('export', format);

    return `/admin/account-deletions?${params.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint={`Cancelling a deletion is step-up protected. Enter your password once, then Cancel a user's pending deletion during the ${gracePeriodDays}-day grace window. Cancel clears their scheduled purge immediately.`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-bolt-elements-textPrimary">Purge queue</span>
          <StatusPill tone={readyToPurge > 0 ? 'danger' : 'ok'}>{readyToPurge} ready to purge</StatusPill>
          <span className="text-bolt-elements-textTertiary">
            {requests.length} pending · grace {gracePeriodDays}d
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={ROW_BTN} href={exportHref('csv')} download data-testid="account-deletions-export-csv">
            Export CSV
          </a>
          <a className={ROW_BTN} href={exportHref('json')} download data-testid="account-deletions-export-json">
            Export JSON
          </a>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Requested</th>
              <th className="px-4 py-3 font-medium">Purge due</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={5}>
                  No pending account deletions.
                </td>
              </tr>
            ) : (
              requests.map((request) => <DeletionRow key={request.userId} request={request} password={password} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeletionRow({ request, password }: { request: AdminDeletionRequest; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const status = deletionStatusTone(request.status);
  const cancelled = fetcher.data?.ok === true;
  const purged = request.status === 'purged';
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{request.email ?? request.userId}</div>
        <div className="text-xs text-bolt-elements-textSecondary">{request.userId}</div>
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={cancelled ? 'ok' : status.tone}>{cancelled ? 'cancelled' : status.label}</StatusPill>
      </td>
      <td className="px-4 py-3 text-bolt-elements-textSecondary">{request.requestedAt ?? '—'}</td>
      <td className="px-4 py-3 text-bolt-elements-textSecondary">{request.purgeDueAt ?? '—'}</td>
      <td className="px-4 py-3">
        {purged || cancelled ? (
          <span className="text-xs text-bolt-elements-textTertiary">{cancelled ? 'Cancelled.' : 'Purged.'}</span>
        ) : (
          <>
            <button
              type="button"
              className={ROW_BTN}
              disabled={busy || !password}
              data-testid={`deletion-cancel-${request.userId}`}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? 'Cancelling…' : 'Cancel deletion'}
            </button>
            {!password && !busy ? (
              <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above first.</p>
            ) : null}
          </>
        )}
        <RowFeedback data={fetcher.data} />
        <ConfirmationDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            fetcher.submit(
              { intent: 'account-deletion-cancel', deletionUserId: request.userId, password },
              { method: 'post' },
            );
          }}
          title={`Cancel deletion for ${request.email ?? request.userId}?`}
          description="The user's scheduled account purge is cleared and they are removed from the queue. This is audited."
          confirmLabel="Cancel deletion"
        />
      </td>
    </tr>
  );
}

/*
 * F26: costs panel. Renders cost/day per provider over the last 30 days as a
 * stacked bar (from /admin/costs/summary — grouped server-side by day × provider)
 * and a monthly-budget gauge with 80% (warn) / 100% (over) alert thresholds vs
 * month-to-date spend. The budget is a platform system setting
 * (costs.monthlyBudgetCents) editable inline via the shared system-setting upsert
 * (step-up protected). Read-only charts; only the budget write mutates state.
 */
function CostsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const days = (Array.isArray(payload.days) ? payload.days : []) as string[];
  const providers = (Array.isArray(payload.providers) ? payload.providers : []) as string[];

  const series = (payload.series && typeof payload.series === 'object' ? payload.series : {}) as Record<
    string,
    number[]
  >;

  const monthToDateCents = typeof payload.monthToDateCents === 'number' ? payload.monthToDateCents : 0;
  const windowTotalCents = typeof payload.windowTotalCents === 'number' ? payload.windowTotalCents : 0;
  const monthlyBudgetCents = typeof payload.monthlyBudgetCents === 'number' ? payload.monthlyBudgetCents : null;
  const budgetUsedPct = typeof payload.budgetUsedPct === 'number' ? payload.budgetUsedPct : null;

  const tone = budgetTone(budgetUsedPct);

  const toneVar =
    tone === 'over'
      ? 'var(--status-error-text)'
      : tone === 'warn'
        ? 'var(--status-warning-text)'
        : 'var(--status-success-text)';

  // Chart wants dollars; the summary series is in cents.
  const datasets = providers.map((provider, index) => ({
    label: provider,
    values: (series[provider] ?? []).map((cents) => cents / 100),
    colorIndex: index,
  }));

  const chartFallback = (
    <div className="flex h-full items-center justify-center text-sm text-bolt-elements-textTertiary">
      Loading chart…
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Month to date" value={centsToUsd(monthToDateCents)} />
        <MetricCard label="Last 30 days" value={centsToUsd(windowTotalCents)} />
        <MetricCard
          label="Monthly budget"
          value={monthlyBudgetCents != null ? centsToUsd(monthlyBudgetCents) : 'Not set'}
        />
      </div>

      {/* Budget gauge */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Monthly budget</h3>
          {budgetUsedPct != null ? (
            <StatusPill tone={tone === 'over' ? 'danger' : tone === 'warn' ? 'warn' : 'ok'}>
              {budgetUsedPct}% used{tone === 'over' ? ' — over budget' : tone === 'warn' ? ' — nearing limit' : ''}
            </StatusPill>
          ) : (
            <span className="text-xs text-bolt-elements-textTertiary">Set a budget to enable 80% / 100% alerts.</span>
          )}
        </div>

        {budgetUsedPct != null ? (
          <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-bolt-elements-background-depth-3">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.min(budgetUsedPct, 100)}%`, backgroundColor: toneVar }}
            />
            {/* 80% threshold marker */}
            <span
              aria-hidden
              className="absolute top-0 h-full w-px bg-[var(--status-warning-text)]"
              style={{ left: '80%' }}
            />
          </div>
        ) : null}
        {budgetUsedPct != null ? (
          <p className="mt-2 text-xs text-bolt-elements-textSecondary">
            {centsToUsd(monthToDateCents)} of {monthlyBudgetCents != null ? centsToUsd(monthlyBudgetCents) : '—'} this
            month. Alerts: warn ≥ 80%, over ≥ 100%.
          </p>
        ) : null}

        <MonthlyBudgetEditor currentBudgetCents={monthlyBudgetCents} />
      </div>

      {/* Cost/day per provider over 30 days */}
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Cost per day by provider (30 days)</h3>
        {providers.length === 0 ? (
          <p className="mt-2 text-sm text-bolt-elements-textSecondary">No AI cost recorded in the last 30 days.</p>
        ) : (
          <div className="mt-3 h-80">
            <React.Suspense fallback={chartFallback}>
              <MonitoringCharts.GroupedBarChart
                labels={days.map((day) => day.slice(5))}
                datasets={datasets}
                stacked
                valueFormat={(value) => `$${value.toFixed(2)}`}
              />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

function MonthlyBudgetEditor({ currentBudgetCents }: { currentBudgetCents: number | null }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const [usd, setUsd] = useState(currentBudgetCents != null ? String(currentBudgetCents / 100) : '');
  const [password, setPassword] = useState('');

  const save = () => {
    const dollars = Number(usd);

    if (!Number.isFinite(dollars) || dollars < 0) {
      return;
    }

    const cents = Math.round(dollars * 100);
    fetcher.submit(
      { intent: 'system-setting', key: 'costs.monthlyBudgetCents', value: String(cents), password },
      { method: 'post' },
    );
    setPassword('');
  };

  const inputClass =
    'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

  return (
    <div className="mt-4 border-t border-bolt-elements-borderColor pt-4">
      <p className="text-xs text-bolt-elements-textSecondary">
        Set the platform monthly budget (USD). Stored as <code>costs.monthlyBudgetCents</code>. Step-up protected — your
        password is sent only with the change.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-bolt-elements-textSecondary">
          Monthly budget (USD)
          <input
            type="number"
            min={0}
            step="0.01"
            value={usd}
            onChange={(event) => setUsd(event.target.value)}
            placeholder="e.g. 5000"
            data-testid="cost-budget-usd"
            className={inputClass}
          />
        </label>
        <label className="block text-xs text-bolt-elements-textSecondary sm:col-span-2">
          Confirm with your password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Your password"
            data-testid="cost-budget-password"
            className={inputClass}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" disabled={busy || !usd || !password} onClick={save} className={ROW_BTN}>
          {busy ? 'Saving…' : 'Save budget'}
        </button>
        <RowFeedback data={fetcher.data} />
      </div>
    </div>
  );
}

type AdminOrganization = {
  id: string;
  name?: string;
  slug?: string;
  createdAt?: string;
};

/*
 * Organization panel: per-row Suspend wired to POST /admin/orgs/:id/suspend.
 * The suspended state is derived from the loader's `suspendedOrganizationIds`.
 * NOTE: the API exposes only suspend today (no unsuspend endpoint), so a
 * suspended org shows a disabled "Suspended" state rather than a reactivate
 * action — wiring an Unsuspend button to a non-existent endpoint would 404.
 */
function OrganizationsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const organizations = (Array.isArray(payload.organizations) ? payload.organizations : []) as AdminOrganization[];

  const suspendedIds = new Set(
    (Array.isArray(payload.suspendedOrganizationIds) ? payload.suspendedOrganizationIds : []).map(String),
  );

  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Suspending an organization is step-up protected. Enter your password once, then suspend organizations below."
      />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {organizations.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={3}>
                  No organizations found.
                </td>
              </tr>
            ) : (
              organizations.map((org) => (
                <OrganizationRow key={org.id} org={org} suspended={suspendedIds.has(org.id)} password={password} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrganizationRow({
  org,
  suspended,
  password,
}: {
  org: AdminOrganization;
  suspended: boolean;
  password: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const isSuspended = suspended || fetcher.data?.ok === true;

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{org.name ?? org.id}</div>
        <div className="text-xs text-bolt-elements-textSecondary">{org.slug ?? org.id}</div>
      </td>
      <td className="px-4 py-3">
        {isSuspended ? <StatusPill tone="danger">suspended</StatusPill> : <StatusPill tone="ok">active</StatusPill>}
      </td>
      <td className="px-4 py-3">
        {isSuspended ? (
          <span className="text-xs text-bolt-elements-textTertiary">Suspended</span>
        ) : (
          <>
            <button
              type="button"
              className={ROW_DANGER}
              disabled={busy || !password}
              data-testid={`org-suspend-${org.id}`}
              onClick={() =>
                fetcher.submit({ intent: 'org-suspend', organizationId: org.id, password }, { method: 'post' })
              }
            >
              {busy ? 'Suspending…' : 'Suspend'}
            </button>
            {!password && !busy ? (
              <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">Enter your password above first.</p>
            ) : null}
          </>
        )}
        <RowFeedback data={fetcher.data} />
      </td>
    </tr>
  );
}

/*
 * Support tickets: the panel (SLA column + assignee + sortable table) lives in
 * ~/components/admin/SupportTicketsPanel (design handoff E27). Its mutations
 * post the 'support-respond' / 'support-assign' intents to this route's action.
 */

/*
 * Audit-log export header (sits above the read-only DataPanel table). Each
 * button is an anchor to `?export=csv|json`, which the loader serves as a
 * downloadable attachment over the session cookie — no client token handling.
 */
type AuditRow = Record<string, JsonValue>;

/**
 * Shared by the panel (client view) and the loader export branch so a CSV
 * download always matches the filtered table. Families are the first dotted
 * segment of the action (api_key.create -> api_key).
 */
function filterAuditRows(
  rows: AuditRow[],
  filters: { family?: string; actor?: string; sinceDays?: number },
  now: Date = new Date(),
): AuditRow[] {
  const actor = filters.actor?.trim().toLowerCase();
  const cutoff = filters.sinceDays ? now.getTime() - filters.sinceDays * 24 * 60 * 60 * 1000 : null;

  return rows.filter((row) => {
    if (filters.family && String(row.action ?? '').split('.')[0] !== filters.family) {
      return false;
    }

    if (
      actor &&
      !String(row.actorUserId ?? '')
        .toLowerCase()
        .includes(actor)
    ) {
      return false;
    }

    if (cutoff !== null) {
      const timestamp = Date.parse(String(row.createdAt ?? ''));

      if (!Number.isFinite(timestamp) || timestamp < cutoff) {
        return false;
      }
    }

    return true;
  });
}

const AUDIT_CSV_COLUMNS = [
  'createdAt',
  'action',
  'actorUserId',
  'organizationId',
  'resourceType',
  'resourceId',
  'ipAddress',
] as const;

function auditRowsToCsv(rows: AuditRow[]): string {
  const escape = (value: JsonValue | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  return [
    AUDIT_CSV_COLUMNS.join(','),
    ...rows.map((row) => AUDIT_CSV_COLUMNS.map((column) => escape(row[column])).join(',')),
  ].join('\n');
}

const AUDIT_PERIODS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;

function AuditLogsPanel({ payload, section }: { payload: Record<string, JsonValue>; section: string }) {
  const rows = (Object.values(payload).find(Array.isArray) ?? []) as AuditRow[];
  const [searchParams, setSearchParams] = useSearchParams();

  const family = searchParams.get('family') ?? '';
  const period = Number(searchParams.get('period')) || 0;
  const [actor, setActor] = useState(searchParams.get('actor') ?? '');

  /* Debounced actor filter into the URL so the export link sees it too. */
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          const trimmed = actor.trim();

          if (trimmed) {
            next.set('actor', trimmed);
          } else {
            next.delete('actor');
          }

          return next;
        },
        { replace: true },
      );
    }, 250);

    return () => window.clearTimeout(handle);
  }, [actor, setSearchParams]);

  const setParam = (key: 'family' | 'period', value: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);

        if (value && next.get(key) !== value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }

        return next;
      },
      { replace: true },
    );
  };

  /*
   * Families come from the REAL action prefixes present in the loaded window
   * (api_key, connector, audit, ...) rather than a hardcoded list that could
   * drift from the backend's action names.
   */
  const families = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of rows) {
      const prefix = String(row.action ?? '').split('.')[0];

      if (prefix) {
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([prefix]) => prefix);
  }, [rows]);

  const filtered = useMemo(
    () => filterAuditRows(rows, { family: family || undefined, actor, sinceDays: period || undefined }),
    [rows, family, actor, period],
  );

  const exportParams = new URLSearchParams();
  exportParams.set('export', 'csv');

  if (family) {
    exportParams.set('family', family);
  }

  if (actor.trim()) {
    exportParams.set('actor', actor.trim());
  }

  if (period) {
    exportParams.set('period', String(period));
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by action family">
            {families.map((prefix) => (
              <FilterChip
                key={prefix}
                label={prefix}
                active={family === prefix}
                onClick={() => setParam('family', prefix)}
              />
            ))}
          </div>
          <a
            className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--vc-ide-accent-action)] px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            href={`/admin/${section}?${exportParams.toString()}`}
            download
            data-testid={`audit-export-csv-${section}`}
          >
            Export CSV
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            placeholder="Filter by actor id"
            aria-label="Filter by actor"
            className="w-full max-w-xs rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-1.5 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
          />
          <span className="flex gap-2" role="group" aria-label="Filter by period">
            {AUDIT_PERIODS.map((option) => (
              <FilterChip
                key={option.days}
                label={option.label}
                active={period === option.days}
                onClick={() => setParam('period', String(option.days))}
              />
            ))}
          </span>
          <span className="text-xs text-bolt-elements-textTertiary">
            {filtered.length} of {rows.length} events
          </span>
        </div>
      </div>
      <SectionCard title="Audit events" icon="table">
        <DataTable rows={filtered} />
      </SectionCard>
    </div>
  );
}

function toggleRowId(row: Record<string, JsonValue>, kind: ToggleKind): string {
  if (kind === 'feature-flags') {
    return String(row.key ?? '');
  }

  if (kind === 'models') {
    return `${row.provider ?? ''}:${row.modelId ?? ''}`;
  }

  return String(row.provider ?? '');
}

function ToggleRow({ row, kind, password }: { row: Record<string, JsonValue>; kind: ToggleKind; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const enabled = row.enabled === true;

  const label =
    kind === 'feature-flags' ? String(row.key ?? '') : String(row.displayName ?? row.modelId ?? row.provider ?? '');

  const sub = kind === 'models' ? String(row.provider ?? '') : '';

  const toggle = () => {
    const fields: Record<string, string> = {
      intent: kind === 'providers' ? 'provider-toggle' : kind === 'models' ? 'model-toggle' : 'feature-flag',
      value: String(!enabled),
      password,
    };

    if (kind === 'providers') {
      fields.provider = String(row.provider ?? '');
      fields.displayName = String(row.displayName ?? row.provider ?? '');
    } else if (kind === 'models') {
      fields.provider = String(row.provider ?? '');
      fields.modelId = String(row.modelId ?? '');
    } else {
      fields.key = String(row.key ?? '');
    }

    fetcher.submit(fields, { method: 'post' });
  };

  const btn =
    'inline-flex items-center rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{label}</div>
        {sub ? <div className="text-xs text-bolt-elements-textSecondary">{sub}</div> : null}
      </td>
      <td className="px-4 py-3">
        {enabled ? <StatusPill tone="ok">enabled</StatusPill> : <StatusPill tone="muted">disabled</StatusPill>}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          className={btn}
          disabled={busy || !password}
          title={
            !password
              ? 'Enter your password above first'
              : `${enabled ? 'Disable' : 'Enable'} this ${kind === 'feature-flags' ? 'flag' : kind.replace(/s$/, '')}`
          }
          data-testid={`toggle-${kind}-${toggleRowId(row, kind)}`}
          onClick={toggle}
        >
          {busy ? (
            <>
              <span className="i-svg-spinners:90-ring-with-bg mr-1.5" aria-hidden />
              Applying…
            </>
          ) : enabled ? (
            'Disable'
          ) : (
            'Enable'
          )}
        </button>
        {!password && !busy ? (
          <p className="mt-1.5 text-xs text-bolt-elements-textTertiary">
            Enter your password above, then click to apply.
          </p>
        ) : null}
        {fetcher.data?.message ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--status-success-text)]">
            <span className="i-ph:check-circle-fill" aria-hidden />
            {fetcher.data.message}
          </p>
        ) : null}
        {fetcher.data?.error ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--status-error-text)]">
            <span className="i-ph:warning-circle-fill" aria-hidden />
            {fetcher.data.error}
          </p>
        ) : null}
      </td>
    </tr>
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
              <Icon
                className={
                  healthy ? 'h-4 w-4 text-[var(--status-success-text)]' : 'h-4 w-4 text-[var(--status-warning-text)]'
                }
                aria-hidden
              />
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
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--status-warning-text)_30%,transparent)] bg-[color-mix(in_srgb,var(--status-warning-text)_10%,transparent)] px-3 py-2 text-xs font-medium text-[var(--status-warning-text)]"
        >
          <span className="i-ph:warning-circle text-sm" aria-hidden="true" />
          <span>
            Showing the first 100 of {objects.length} records — this view is truncated. Use search/filters to find rows
            beyond the first 100.
          </span>
        </div>
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
    return formatUserAreaNumber(value);
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
