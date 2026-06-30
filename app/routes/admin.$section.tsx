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
  'developer-tools': {
    title: 'Developer tools',
    description:
      'Operational diagnostics (Debug, Task Manager, Service Status, Updates, Event Logs) — hidden from the user settings panel; reachable here by platform admins only.',
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
  'account-deletions',
  'feature-flags',
  'system-settings',
  'costs',
  'providers',
  'models',
  'oauth-providers',
  'wallets',
  'checkpoints',
  'stripe-health',
  'developer-tools',
];

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.config.title} - E-Code` : 'Admin - E-Code' },
];

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const section = params.section ?? 'overview';
  const config = adminSections[section];

  if (!config) {
    throw json({ error: 'Admin section is not available.' }, { status: 404 });
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
  const { section, config, payload } = useLoaderData<typeof loader>();

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
          {section === 'users' ? <UsersPanel payload={payload} /> : null}
          {section === 'providers' ? <ToggleListPanel payload={payload} kind="providers" /> : null}
          {section === 'models' ? <ToggleListPanel payload={payload} kind="models" /> : null}
          {section === 'feature-flags' ? <ToggleListPanel payload={payload} kind="feature-flags" /> : null}
          {section === 'oauth-providers' ? <OauthProvidersPanel payload={payload} /> : null}
          {section === 'quotas' ? <QuotaOverridePanel /> : null}
          {section === 'system-settings' ? <SystemSettingUpsertPanel /> : null}
          {section === 'developer-tools' ? <DeveloperToolsPanel /> : null}
          {![
            'overview',
            'health',
            'users',
            'providers',
            'models',
            'feature-flags',
            'oauth-providers',
            'developer-tools',
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
