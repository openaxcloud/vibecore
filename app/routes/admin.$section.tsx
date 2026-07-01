import { AlertTriangle, BarChart3, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Link, useFetcher, useLoaderData, useNavigate } from 'react-router';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
  json,
  redirect,
  requirePlatformAdmin,
  sessionCookie,
} from '~/lib/enterprise-api.server';

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
    description: 'Platform-owned AI provider registry — admin enables providers and supplies keys.',
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
      'Operational diagnostics (Debug, Task Manager, Service Status, Updates, Event Logs) — hidden from the user settings panel; reachable here by platform admins only.',
  },
};

const navItems = [
  'overview',
  'health',
  'monitoring',
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
  'account-deletions',
  'feature-flags',
  'system-settings',
  'ops-controls',
  'costs',
  'providers',
  'models',
  'oauth-providers',
  'wallets',
  'checkpoints',
  'stripe-health',
  'mcp-catalog',
  'developer-tools',
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
    const result = await apiRequest<unknown>(request, `${AUDIT_EXPORT_ENDPOINTS[section]}?format=${format}`);

    const body =
      format === 'csv' ? (typeof result === 'string' ? result : String(result ?? '')) : JSON.stringify(result, null, 2);

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
    const [costs, providerHealth] = await Promise.allSettled([
      apiRequest<Record<string, JsonValue>>(request, '/admin/costs'),
      apiRequest<Record<string, JsonValue>>(request, '/admin/provider-health'),
    ]);

    const payload: Record<string, JsonValue> = {
      ...(costs.status === 'fulfilled' ? costs.value : {}),
      providers: providerHealth.status === 'fulfilled' ? (providerHealth.value.providers ?? []) : [],
      providerHealthError: providerHealth.status === 'rejected',
      costsError: costs.status === 'rejected',
    };

    return { section, config, payload };
  }

  // Sections without an endpoint (developer-tools) render self-fetching panels.
  const payload = config.endpoint
    ? await apiRequest<Record<string, JsonValue>>(request, config.endpoint)
    : ({} as Record<string, JsonValue>);

  return { section, config, payload };
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
  suspend: 'suspend',
  unsuspend: 'unsuspend',
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

      if (!id || !['featured', 'verified', 'featuredForIdePanel'].includes(field)) {
        return json({ ok: false, error: 'Invalid toggle.' }, { status: 400 });
      }

      await apiRequest(request, `/admin/mcp/catalog/${id}`, {
        method: 'PATCH',
        redirectOn401: false,
        body: JSON.stringify({ [field]: value }),
      });

      return json({ ok: true, rowId: id, message: `${field} ${value ? 'enabled' : 'disabled'}.` });
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

  return (
    <AppShell
      title={config.title}
      description={config.description}
      actions={<LinkButton to="/admin/billing">Billing admin</LinkButton>}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[232px_1fr]">
        <AdminNav active={section} />
        <div className="grid gap-6">
          {section === 'overview' ? <OverviewPanel payload={payload} /> : null}
          {section === 'health' ? <HealthPanel payload={payload} /> : null}
          {section === 'monitoring' ? <MonitoringPanel payload={payload} /> : null}
          {section === 'users' ? <UsersPanel payload={payload} /> : null}
          {section === 'providers' ? <ToggleListPanel payload={payload} kind="providers" /> : null}
          {section === 'models' ? <ToggleListPanel payload={payload} kind="models" /> : null}
          {section === 'feature-flags' ? <ToggleListPanel payload={payload} kind="feature-flags" /> : null}
          {section === 'oauth-providers' ? <OauthProvidersPanel payload={payload} /> : null}
          {section === 'quotas' ? <QuotaOverridePanel /> : null}
          {section === 'system-settings' ? <SystemSettingUpsertPanel /> : null}
          {section === 'ops-controls' ? <OpsControlsPanel payload={payload} /> : null}
          {section === 'workspaces' ? <WorkspacesPanel payload={payload} /> : null}
          {section === 'abuse-events' ? <AbuseEventsPanel payload={payload} /> : null}
          {section === 'organizations' ? <OrganizationsPanel payload={payload} /> : null}
          {section === 'support-tickets' ? <SupportTicketsPanel payload={payload} /> : null}
          {section === 'audit-logs' || section === 'admin-audit-logs' ? <AuditExportPanel section={section} /> : null}
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
            'abuse-events',
            'organizations',
            'support-tickets',
            'developer-tools',
            'ops-controls',
            'mcp-catalog',
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
const DevUpdateTab = React.lazy(() => import('~/components/@settings/tabs/update/UpdateTab'));

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
};

const DEV_TOOLS = [
  { id: 'cloud-providers', label: 'Cloud Providers', Component: DevCloudProvidersTab },
  { id: 'local-providers', label: 'Local Providers', Component: DevLocalProvidersTab },
  { id: 'debug', label: 'Debug', Component: DevDebugTab },
  { id: 'task-manager', label: 'Task Manager', Component: DevTaskManagerTab },
  { id: 'service-status', label: 'Service Status', Component: DevServiceStatusTab },
  { id: 'update', label: 'Updates', Component: DevUpdateTab },
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

function AdminNav({ active }: { active: string }) {
  const navigate = useNavigate();

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
          {navItems.map((item) => (
            <option key={item} value={item}>
              {adminSections[item].title}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop (lg+): sticky vertical sidebar; content scrolls independently. */}
      <nav
        aria-label="Admin sections"
        className="hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-sm lg:block lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto"
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
      {Object.entries(payload).map(([key, value]) => (
        <SectionCard key={key} title={labelize(key)} icon="health">
          <KeyValueGrid value={asRecord(value)} />
        </SectionCard>
      ))}
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
  statusCode?: number;
  error?: string;
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

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
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-300">
          <span className="i-ph:warning-circle text-base" aria-hidden />
          Cost metrics are temporarily unavailable. Provider health below is unaffected.
        </div>
      ) : null}

      {/* KPI cards — collapse 4 → 2 → 1 col on narrower viewports. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total AI cost" value={usd(totalCostCents)} />
        <MetricCard label="Total tokens" value={totalTokens.toLocaleString()} />
        <MetricCard label="Cost records" value={aiCosts.length.toLocaleString()} />
        <MetricCard label="Usage events" value={totalUsage.toLocaleString()} />
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
            <p className="mb-3 text-xs text-bolt-elements-textTertiary">
              Config readiness from the admin provider registry (enabled + platform key); rows marked “live” also
              reflect the AI gateway’s real upstream probe.
            </p>
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
 * Per-provider readiness card. Maps the backend status onto a tone + dot +
 * label. `ready`/`healthy` are good; `degraded`/`unreachable` are problems
 * (the provider is enabled+keyed but the live probe failed); `no_key` is a
 * config gap (amber, actionable); `disabled` is intentionally off (muted).
 */
const PROVIDER_HEALTH_META: Record<string, { label: string; tone: 'ok' | 'danger' | 'muted'; dot: string }> = {
  ready: { label: 'Ready', tone: 'ok', dot: 'bg-green-500' },
  healthy: { label: 'Ready', tone: 'ok', dot: 'bg-green-500' },
  degraded: { label: 'Degraded', tone: 'danger', dot: 'bg-amber-500' },
  unreachable: { label: 'Unreachable', tone: 'danger', dot: 'bg-red-500' },
  no_key: { label: 'No key', tone: 'muted', dot: 'bg-amber-500' },
  disabled: { label: 'Disabled', tone: 'muted', dot: 'bg-bolt-elements-textTertiary' },
  unknown: { label: 'Unknown', tone: 'muted', dot: 'bg-bolt-elements-textTertiary' },
};

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
        {typeof provider.statusCode === 'number' ? ` · HTTP ${provider.statusCode}` : ''}
      </p>
      {provider.error ? (
        <p className="mt-1.5 break-words text-xs text-red-600 dark:text-red-400">{provider.error}</p>
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
};

/*
 * Operational user-management panel for the in-app /admin. Every action is wired
 * to the real backend over the session cookie (no hand-pasted token). The admin
 * types their password once (step-up); each row action reuses it. The promote /
 * revoke platform-admin button is the one that unblocks everything else.
 */
function UsersPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const users = (Array.isArray(payload.users) ? payload.users : []) as AdminUser[];
  const suspendedIds = new Set((Array.isArray(payload.suspendedUserIds) ? payload.suspendedUserIds : []).map(String));
  const [password, setPassword] = useState('');

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

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">User</th>
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
    </div>
  );
}

function UserRow({ user, suspended, password }: { user: AdminUser; suspended: boolean; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';

  const run = (fields: Record<string, string>) => {
    fetcher.submit({ ...fields, userId: user.id, password }, { method: 'post' });
  };

  const btn =
    'inline-flex items-center rounded-md border border-bolt-elements-borderColor px-2.5 py-1 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50';

  const danger = `${btn} border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400`;

  return (
    <tr className="border-b border-bolt-elements-borderColor align-top last:border-b-0">
      <td className="px-4 py-3">
        <div className="font-medium text-bolt-elements-textPrimary">{user.email ?? user.id}</div>
        {user.name ? <div className="text-xs text-bolt-elements-textSecondary">{user.name}</div> : null}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {user.platformAdmin ? <StatusPill tone="accent">platform-admin</StatusPill> : null}
          {suspended ? <StatusPill tone="danger">suspended</StatusPill> : <StatusPill tone="ok">active</StatusPill>}
          {user.mfaEnabled ? <StatusPill tone="muted">MFA on</StatusPill> : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {user.platformAdmin ? (
            <button
              type="button"
              className={danger}
              disabled={busy}
              data-testid={`user-demote-${user.id}`}
              onClick={() => run({ intent: 'platform-admin', value: 'false' })}
            >
              Revoke admin
            </button>
          ) : (
            <button
              type="button"
              className={btn}
              disabled={busy}
              data-testid={`user-promote-${user.id}`}
              onClick={() => run({ intent: 'platform-admin', value: 'true' })}
            >
              Promote to admin
            </button>
          )}

          {suspended ? (
            <button type="button" className={btn} disabled={busy} onClick={() => run({ intent: 'unsuspend' })}>
              Reactivate
            </button>
          ) : (
            <button type="button" className={danger} disabled={busy} onClick={() => run({ intent: 'suspend' })}>
              Suspend
            </button>
          )}

          <button type="button" className={btn} disabled={busy} onClick={() => run({ intent: 'force-logout' })}>
            Force logout
          </button>

          {user.mfaEnabled ? (
            <button type="button" className={btn} disabled={busy} onClick={() => run({ intent: 'reset-mfa' })}>
              Reset MFA
            </button>
          ) : null}

          {!user.platformAdmin ? (
            <>
              <button
                type="button"
                className={danger}
                disabled={busy}
                data-testid={`user-strike-${user.id}`}
                onClick={() => run({ intent: 'strike', severity: 'minor' })}
              >
                Strike
              </button>
              <button type="button" className={btn} disabled={busy} onClick={() => run({ intent: 'clear-strikes' })}>
                Clear strikes
              </button>
            </>
          ) : null}

          {!user.platformAdmin && !suspended ? (
            <button
              type="button"
              className={btn}
              disabled={busy}
              data-testid={`user-impersonate-${user.id}`}
              onClick={() => run({ intent: 'impersonate' })}
            >
              Impersonate
            </button>
          ) : null}
        </div>
        {fetcher.data?.message ? (
          <p className="mt-1.5 text-xs text-green-600 dark:text-green-400">{fetcher.data.message}</p>
        ) : null}
        {fetcher.data?.error ? (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fetcher.data.error}</p>
        ) : null}
      </td>
    </tr>
  );
}

function StatusPill({ tone, children }: { tone: 'ok' | 'danger' | 'accent' | 'muted'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    ok: 'border-green-500/30 text-green-600 dark:text-green-400',
    danger: 'border-red-500/30 text-red-600 dark:text-red-400',
    accent: 'border-bolt-elements-borderColorActive text-bolt-elements-textPrimary',
    muted: 'border-bolt-elements-borderColor text-bolt-elements-textSecondary',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
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
        {localError ? <span className="text-xs text-rose-400">{localError}</span> : null}
        {fetcher.data?.message ? <span className="text-xs text-emerald-400">{fetcher.data.message}</span> : null}
        {fetcher.data?.error ? <span className="text-xs text-rose-400">{fetcher.data.error}</span> : null}
      </div>
    </div>
  );
}

function McpCatalogRow({ entry, password }: { entry: Record<string, JsonValue>; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const id = String(entry.id ?? '');
  const [editing, setEditing] = useState(false);

  const featured = entry.featured === true;
  const verified = entry.verified === true;
  const idePanel = entry.featuredForIdePanel === true;

  const toggle = (field: 'featured' | 'verified' | 'featuredForIdePanel', current: boolean) => {
    fetcher.submit({ intent: 'mcp-catalog-toggle', id, field, value: String(!current), password }, { method: 'post' });
  };

  const remove = () => {
    if (!window.confirm(`Delete "${String(entry.slug)}"? This also removes all installs of it.`)) {
      return;
    }

    fetcher.submit({ intent: 'mcp-catalog-delete', id, password }, { method: 'post' });
  };

  const flagBtn = (active: boolean) =>
    active
      ? 'rounded-md bg-bolt-elements-item-contentAccent px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50'
      : 'rounded-md border border-bolt-elements-borderColor px-2 py-1 text-[11px] text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 disabled:opacity-50';

  return (
    <>
      <tr className="border-b border-bolt-elements-borderColor align-top">
        <td className="px-4 py-3 text-bolt-elements-textPrimary">{String(entry.name ?? '')}</td>
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
              onClick={() => setEditing((v) => !v)}
              className="rounded-md border border-bolt-elements-borderColor px-2 py-1 text-[11px] text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            >
              {editing ? 'Close' : 'Edit'}
            </button>
            <button
              type="button"
              disabled={busy || !password}
              onClick={remove}
              className="rounded-md border border-rose-500/40 px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          {fetcher.data?.message ? (
            <div className="mt-1 text-[11px] text-emerald-400">{fetcher.data.message}</div>
          ) : null}
          {fetcher.data?.error ? <div className="mt-1 text-[11px] text-rose-400">{fetcher.data.error}</div> : null}
        </td>
      </tr>
      {editing ? (
        <tr className="border-b border-bolt-elements-borderColor">
          <td colSpan={6} className="px-4 py-3">
            <McpCatalogEditForm entry={entry} password={password} onDone={() => setEditing(false)} />
          </td>
        </tr>
      ) : null}
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
        {localError ? <span className="text-xs text-rose-400">{localError}</span> : null}
        {fetcher.data?.error ? <span className="text-xs text-rose-400">{fetcher.data.error}</span> : null}
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
        {fetcher.data?.message ? <span className="text-emerald-400">{fetcher.data.message}</span> : null}
        {fetcher.data?.error ? <span className="text-rose-400">{fetcher.data.error}</span> : null}
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
          Client Secret {hasSecret ? <span className="text-emerald-400">• configured</span> : null}
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
        {fetcher.data?.message ? <span className="text-xs text-emerald-400">{fetcher.data.message}</span> : null}
        {fetcher.data?.error ? <span className="text-xs text-rose-400">{fetcher.data.error}</span> : null}
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
        {fetcher.data?.message ? <span className="text-xs text-emerald-400">{fetcher.data.message}</span> : null}
        {fetcher.data?.error ? <span className="text-xs text-rose-400">{fetcher.data.error}</span> : null}
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
        {fetcher.data?.message ? <span className="text-xs text-emerald-400">{fetcher.data.message}</span> : null}
        {fetcher.data?.error ? <span className="text-xs text-rose-400">{fetcher.data.error}</span> : null}
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
              ? 'rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400'
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
              ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'
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
              ? 'rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-400'
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

const ROW_DANGER = `${ROW_BTN} border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400`;

function RowFeedback({ data }: { data?: { message?: string; error?: string } }) {
  return (
    <>
      {data?.message ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
          <span className="i-ph:check-circle-fill" aria-hidden />
          {data.message}
        </p>
      ) : null}
      {data?.error ? (
        <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
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

  const confirmDelete = () => {
    if (
      window.confirm(
        `Delete workspace "${workspace.name ?? workspace.id}"? This reclaims its pod and storage and cannot be undone.`,
      )
    ) {
      run('workspace-delete');
    }
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
  createdAt?: string;
};

/*
 * Abuse-event review panel: per-row Resolve wired to POST
 * /admin/abuse-events/:id/resolve. The Resolve button hides once the row is
 * resolved (the loader payload may omit `resolved`; we hide on the fetcher's
 * success too, so a just-resolved row stops offering the action).
 */
function AbuseEventsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const events = (Array.isArray(payload.abuseEvents) ? payload.abuseEvents : []) as AdminAbuseEvent[];
  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Resolving an abuse event is step-up protected. Enter your password once, then Resolve events below."
      />

      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-bolt-elements-borderColor text-left text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-bolt-elements-textSecondary" colSpan={3}>
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
  const resolved = event.resolved === true || fetcher.data?.ok === true;
  const severity = String(event.severity ?? 'unknown');
  const tone = severity === 'critical' || severity === 'high' ? 'danger' : 'muted';

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
        <StatusPill tone={tone}>{severity}</StatusPill>
      </td>
      <td className="px-4 py-3">
        {resolved ? (
          <StatusPill tone="ok">resolved</StatusPill>
        ) : (
          <>
            <button
              type="button"
              className={ROW_BTN}
              disabled={busy || !password}
              data-testid={`abuse-resolve-${event.id}`}
              onClick={() =>
                fetcher.submit({ intent: 'abuse-resolve', abuseEventId: event.id, password }, { method: 'post' })
              }
            >
              {busy ? 'Resolving…' : 'Resolve'}
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

type AdminSupportTicket = {
  id: string;
  organizationId?: string;
  userId?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
};

const TICKET_STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;

/*
 * Support-ticket panel: per-ticket Respond form (status select + response
 * textarea) wired to POST /admin/support-tickets/:id/respond. Step-up protected.
 */
function SupportTicketsPanel({ payload }: { payload: Record<string, JsonValue> }) {
  const tickets = (Array.isArray(payload.tickets) ? payload.tickets : []) as AdminSupportTicket[];
  const [password, setPassword] = useState('');

  return (
    <div className="grid gap-4">
      <ReauthHeader
        password={password}
        onChange={setPassword}
        hint="Responding to a ticket is step-up protected. Enter your password once, then respond to tickets below."
      />

      <div className="grid gap-4">
        {tickets.length === 0 ? (
          <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-sm text-bolt-elements-textSecondary shadow-sm">
            No support tickets found.
          </div>
        ) : (
          tickets.map((ticket) => <SupportTicketCard key={ticket.id} ticket={ticket} password={password} />)
        )}
      </div>
    </div>
  );
}

function SupportTicketCard({ ticket, password }: { ticket: AdminSupportTicket; password: string }) {
  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string }>();
  const busy = fetcher.state !== 'idle';
  const [status, setStatus] = useState<string>(ticket.status ?? 'PENDING');
  const [response, setResponse] = useState('');

  const inputClass =
    'mt-1 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive';

  const submit = () => {
    fetcher.submit({ intent: 'support-respond', ticketId: ticket.id, status, response, password }, { method: 'post' });
    setResponse('');
  };

  const currentTone =
    ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'ok' : ticket.status === 'OPEN' ? 'danger' : 'muted';

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">{ticket.subject ?? ticket.id}</h3>
          <p className="mt-0.5 text-xs text-bolt-elements-textSecondary">
            {[
              ticket.organizationId ? `org ${ticket.organizationId}` : null,
              ticket.userId ? `user ${ticket.userId}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || ticket.id}
            {ticket.createdAt ? ` · ${ticket.createdAt}` : ''}
          </p>
        </div>
        <StatusPill tone={currentTone}>{String(ticket.status ?? 'unknown').toLowerCase()}</StatusPill>
      </div>

      <div className="mt-3 grid gap-3">
        <label className="block text-xs text-bolt-elements-textSecondary sm:max-w-xs">
          New status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            data-testid={`ticket-status-${ticket.id}`}
            className={inputClass}
          >
            {TICKET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-bolt-elements-textSecondary">
          Response
          <textarea
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            rows={3}
            placeholder="Write your response to the customer…"
            data-testid={`ticket-response-${ticket.id}`}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !password || !response.trim()}
          onClick={submit}
          data-testid={`ticket-respond-${ticket.id}`}
          className="inline-flex items-center rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send response'}
        </button>
        {!password ? (
          <span className="text-xs text-bolt-elements-textTertiary">Enter your password above first.</span>
        ) : null}
        {fetcher.data?.message ? <span className="text-xs text-emerald-400">{fetcher.data.message}</span> : null}
        {fetcher.data?.error ? <span className="text-xs text-rose-400">{fetcher.data.error}</span> : null}
      </div>
    </div>
  );
}

/*
 * Audit-log export header (sits above the read-only DataPanel table). Each
 * button is an anchor to `?export=csv|json`, which the loader serves as a
 * downloadable attachment over the session cookie — no client token handling.
 */
function AuditExportPanel({ section }: { section: string }) {
  const linkClass =
    'inline-flex items-center gap-1.5 rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3';

  return (
    <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Export</h3>
      <p className="mt-1 text-xs text-bolt-elements-textSecondary">
        Download the full audit trail. The export is generated server-side over your admin session.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          className={linkClass}
          href={`/admin/${section}?export=csv`}
          download
          data-testid={`audit-export-csv-${section}`}
        >
          <span className="i-ph:file-csv" aria-hidden />
          Export CSV
        </a>
        <a
          className={linkClass}
          href={`/admin/${section}?export=json`}
          download
          data-testid={`audit-export-json-${section}`}
        >
          <span className="i-ph:file-text" aria-hidden />
          Export JSON
        </a>
      </div>
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
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
            <span className="i-ph:check-circle-fill" aria-hidden />
            {fetcher.data.message}
          </p>
        ) : null}
        {fetcher.data?.error ? (
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
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
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300"
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
