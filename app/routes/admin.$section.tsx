import type { MetaFunction } from '@remix-run/cloudflare';
import { Link, useFetcher, useLoaderData, useNavigate } from '@remix-run/react';
import { AlertTriangle, BarChart3, CheckCircle2, Database, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
  json,
  redirect,
  sessionCookie,
} from '~/lib/enterprise-api.server';

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
  'wallets',
  'checkpoints',
  'stripe-health',
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
};

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const userId = String(form.get('userId') ?? '');
  const password = String(form.get('password') ?? '');

  if (!password) {
    return json({ ok: false, userId, error: 'Enter your password to apply this change.' }, { status: 400 });
  }

  const reauthError = await reauthenticate(request, password);

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
          {!['overview', 'health', 'users', 'providers', 'models', 'feature-flags'].includes(section) ? (
            <DataPanel config={config} payload={payload} />
          ) : null}
        </div>
      </div>
    </AppShell>
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
          Enter your password once, then enable or disable each {noun}. Sent only with the action.
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
          disabled={busy}
          data-testid={`toggle-${kind}-${toggleRowId(row, kind)}`}
          onClick={toggle}
        >
          {enabled ? 'Disable' : 'Enable'}
        </button>
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
