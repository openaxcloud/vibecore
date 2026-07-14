import { AlertTriangle, Chrome, Github, Link2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator, useSearchParams } from 'react-router';
import { StatusPill } from '~/components/dashboard/SaaSLayout';
import { ConfirmationDialog } from '~/components/ui/Dialog';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import {
  apiErrorMessage,
  apiRequest,
  formObject,
  isApiResponse,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { formatUserAreaDate } from '~/lib/i18n/user-area-locale';
import { isReauthRedirect } from '~/lib/route-reauth';
import { oauthErrorDisplayMessage, providerDisplayLabel } from '~/lib/user-facing-labels';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Connected accounts - E-Code' }];

/*
 * `integration` providers are wired through the connector OAuth flow that
 * mints encrypted, agent-usable `UserConnection` records (repository import,
 * push, PR creation). `identity` providers are sign-in/SSO links tracked in
 * the login `OAuthConnection` table. The two are read from different
 * endpoints because they answer different questions.
 */
type ProviderKind = 'integration' | 'identity';

type ProviderDescriptor = {
  key: string;
  apiProvider: string;
  title: string;
  detail: string;
  kind: ProviderKind;
  connectPath?: string;
  icon: typeof Github;
};

const PROVIDERS: ProviderDescriptor[] = [
  {
    key: 'github',
    apiProvider: 'github',
    title: 'GitHub',
    detail: 'Connected for repository import, push and pull request creation.',
    kind: 'integration',
    icon: Github,
  },
  {
    key: 'github-signin',
    apiProvider: 'github',
    title: 'GitHub (sign-in)',
    detail: 'Use GitHub to sign in to this account.',
    kind: 'identity',
    connectPath: '/auth/oauth/github?mode=link',
    icon: Github,
  },
  {
    key: 'google',
    apiProvider: 'google',
    title: 'Google',
    detail: 'Sign in with Google and verify enterprise domains.',
    kind: 'identity',
    connectPath: '/auth/oauth/google?mode=link',
    icon: Chrome,
  },
  {
    key: 'microsoft',
    apiProvider: 'microsoft',
    title: 'Microsoft Entra ID',
    detail: 'OIDC configuration can be enabled from enterprise SSO settings.',
    kind: 'identity',
    icon: Link2,
  },
];

type IntegrationConnection = {
  id: string;
  provider: string;
  externalAccountLabel: string;
  status: string;
  forAgentUse: boolean;
  revokedAt: string | null;
  createdAt: string;
};

type IdentityConnection = { provider: string; externalId: string; createdAt: string };

type ReconnectionAlert = {
  id: string;
  userConnectionId: string;
  provider: string;
  externalAccountLabel: string;
  reason: string;
  detectedAt: string;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  /*
   * Each endpoint answers a different question; if one is unavailable the other
   * should still render, so degrade each independently to an empty list.
   */
  const [integration, identity, reconnection] = await Promise.all([
    apiRequest<{ connections: IntegrationConnection[] }>(request, '/api/account/connections').catch(() => ({
      connections: [] as IntegrationConnection[],
    })),
    apiRequest<{ connections: IdentityConnection[] }>(request, '/auth/connections').catch(() => ({
      connections: [] as IdentityConnection[],
    })),
    apiRequest<{ alerts: ReconnectionAlert[] }>(request, '/api/account/reconnection-alerts').catch(() => ({
      alerts: [] as ReconnectionAlert[],
    })),
  ]);

  return {
    integrationConnections: integration.connections,
    identityConnections: identity.connections,
    reconnectionAlerts: reconnection.alerts,
  };
}

/*
 * Unlink a sign-in provider (identity) from this account. The API enforces the
 * anti-lockout rule (400 LAST_LOGIN_METHOD when it is the user's only sign-in
 * method) which we surface inline. Integration (connector) disconnects use their
 * own client button + route, not this action.
 */
export async function action({ request }: EnterpriseActionArgs) {
  const body = formObject(await request.formData()) as { intent?: string; provider?: string };

  if (body.intent !== 'unlink-identity' || !body.provider) {
    return json({ error: 'Unsupported action.' }, { status: 400 });
  }

  try {
    await apiRequest(request, `/auth/connections/${encodeURIComponent(body.provider)}`, {
      method: 'DELETE',
      redirectOn401: false,
    });

    return json({ ok: true });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json({ error: await apiErrorMessage(error, 'Could not unlink this provider.') }, { status: 400 });
    }

    throw error;
  }
}

/*
 * Human-readable copy for the machine reason recorded by the worker / proxy
 * (e.g. `token_revoked`). Unknown reasons fall back to a generic message.
 */
const RECONNECT_REASON_COPY: Record<string, string> = {
  token_revoked: 'the stored access token was revoked or expired',
};

function reconnectReasonText(reason: string) {
  return RECONNECT_REASON_COPY[reason] ?? 'the stored credential is no longer valid';
}

type ConnectionAction = 'connect' | 'reconnect' | 'dismiss' | 'disconnect';

function connectionActionError(action: ConnectionAction, status?: number): string {
  if (status === 401) {
    return 'Your session expired. Sign in again and retry.';
  }

  if (status === 403) {
    return 'You do not have permission to change this connection.';
  }

  if (status === 429) {
    return 'Too many attempts. Wait a moment and try again.';
  }

  const copy: Record<ConnectionAction, string> = {
    connect: 'Unable to start the connection. Try again.',
    reconnect: 'Unable to start the reconnection. Try again.',
    dismiss: 'Unable to dismiss this alert. Try again.',
    disconnect: 'Unable to disconnect this account. Try again.',
  };

  return copy[action];
}

const dateFormat: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

export default function ConnectedAccountsPage() {
  const { integrationConnections, identityConnections, reconnectionAlerts } = useLoaderData<typeof loader>();

  /*
   * The sweep can raise more than one alert over a connection's lifetime; show
   * at most one banner per connection (the most recent, loader-ordered) so the
   * user is not nagged twice for the same broken connection.
   */
  const alertsByConnection = new Map<string, ReconnectionAlert>();

  for (const alert of reconnectionAlerts) {
    if (!alertsByConnection.has(alert.userConnectionId)) {
      alertsByConnection.set(alert.userConnectionId, alert);
    }
  }

  const dedupedAlerts = Array.from(alertsByConnection.values());

  const integrationByProvider = new Map(
    integrationConnections
      .filter((connection) => !connection.revokedAt)
      .map((connection) => [connection.provider, connection]),
  );

  const identityByProvider = new Map(identityConnections.map((connection) => [connection.provider, connection]));

  const actionData = useActionData<typeof action>() as { error?: string; ok?: boolean } | undefined;
  const [searchParams] = useSearchParams();
  const linked = searchParams.get('linked');
  const linkError = searchParams.get('linkError');
  const linkErrorDetail = searchParams.get('detail');
  const linkedProviderLabel = linked ? providerDisplayLabel(linked) : null;
  const failedProviderLabel = linkError ? providerDisplayLabel(linkError) : null;

  return (
    <>
      {linkedProviderLabel ? (
        <div className="mb-3 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-sm text-bolt-elements-textPrimary">
          Linked {linkedProviderLabel} to your account.
        </div>
      ) : null}
      {failedProviderLabel ? (
        <div className="mb-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]">
          Could not link {failedProviderLabel}. {oauthErrorDisplayMessage(linkErrorDetail)}
        </div>
      ) : null}
      {actionData?.error ? (
        <div className="mb-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-sm text-[var(--status-error-text)]">
          {actionData.error}
        </div>
      ) : null}
      {dedupedAlerts.length > 0 ? <ReconnectionAlertsBanner alerts={dedupedAlerts} /> : null}

      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        {PROVIDERS.map((provider, index) => {
          const Icon = provider.icon;

          const integration =
            provider.kind === 'integration' ? integrationByProvider.get(provider.apiProvider) : undefined;

          const identity = provider.kind === 'identity' ? identityByProvider.get(provider.apiProvider) : undefined;

          const needsReconnect = integration?.status === 'needs_reconnect';
          const isConnected = Boolean(integration && integration.status === 'active') || Boolean(identity);

          const createdAt = integration?.createdAt ?? identity?.createdAt ?? null;
          const connectedSince = createdAt ? formatUserAreaDate(createdAt, dateFormat) : null;

          const statusLabel = needsReconnect ? 'Needs reconnect' : isConnected ? 'Connected' : 'Not connected';

          return (
            <div
              key={provider.key}
              className={classNames(
                'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                index > 0 && 'border-t border-bolt-elements-borderColor',
              )}
            >
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{provider.title}</p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{provider.detail}</p>
                  {integration?.externalAccountLabel ? (
                    <p className="mt-1 break-all text-xs text-bolt-elements-textTertiary">
                      Account {integration.externalAccountLabel}
                    </p>
                  ) : null}
                  {connectedSince ? (
                    <p className="mt-1 text-xs text-bolt-elements-textTertiary">Linked since {connectedSince}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                <StatusPill label={statusLabel} />
                {!isConnected && provider.kind === 'integration' ? (
                  <IntegrationConnectButton provider={provider.apiProvider} />
                ) : !isConnected && provider.connectPath ? (
                  <Link
                    to={provider.connectPath}
                    reloadDocument
                    className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                  >
                    {provider.kind === 'identity' ? 'Link' : 'Connect'}
                  </Link>
                ) : isConnected && provider.kind === 'integration' && integration ? (
                  <IntegrationDisconnectButton connectionId={integration.id} />
                ) : isConnected && provider.kind === 'identity' ? (
                  <IdentityUnlinkButton provider={provider.apiProvider} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/*
 * Inline warning surfacing open ReconnectionAlert rows raised by the background
 * token-health sweep / connector-proxy. Each row offers a Reconnect action
 * (relaunches the connector OAuth flow for that provider) and a Dismiss action
 * (resolves the alert via POST /api/account/reconnection-alerts/:id/resolve).
 */
function ReconnectionAlertsBanner({ alerts }: { alerts: ReconnectionAlert[] }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4 text-bolt-elements-textPrimary shadow-sm"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning-text)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {alerts.length === 1 ? '1 connection needs reconnecting' : `${alerts.length} connections need reconnecting`}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {alerts.map((alert) => (
              <ReconnectionAlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ReconnectionAlertRow({ alert }: { alert: ReconnectionAlert }) {
  const { state, launch, reset } = useConnectorPopup();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (state.phase === 'succeeded') {
      revalidator.revalidate();
      reset();
    } else if (state.phase === 'failed') {
      setError(connectionActionError('reconnect'));
      reset();
    }
  }, [state, revalidator, reset]);

  const reconnect = useCallback(async () => {
    setError(null);
    setReconnecting(true);

    try {
      const response = await fetch(`/api/integrations/oauth/${alert.provider}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(connectionActionError('reconnect', response.status));
      }

      const result = (await response.json()) as { provider: string; authorizationUrl: string };
      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : connectionActionError('reconnect'));
    } finally {
      setReconnecting(false);
    }
  }, [alert.provider, launch]);

  const dismiss = useCallback(async () => {
    setError(null);
    setDismissing(true);

    try {
      const response = await fetch(`/api/account/reconnection-alerts/${alert.id}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(connectionActionError('dismiss', response.status));
      }

      revalidator.revalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : connectionActionError('dismiss'));
    } finally {
      setDismissing(false);
    }
  }, [alert.id, revalidator]);

  const reconnectBusy = reconnecting || state.phase === 'launching';
  const providerLabel = providerDisplayLabel(alert.provider);

  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 break-words text-sm text-bolt-elements-textSecondary">
        <span className="font-medium text-bolt-elements-textPrimary">{providerLabel}</span>
        {alert.externalAccountLabel ? <span className="break-all"> ({alert.externalAccountLabel})</span> : null} —{' '}
        {reconnectReasonText(alert.reason)}.
        {error ? <span className="mt-1 block text-[var(--status-error-text)]">{error}</span> : null}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void reconnect()}
          disabled={reconnectBusy}
          className="inline-flex h-8 items-center justify-center rounded-md bg-bolt-elements-button-primary-background px-3 text-xs font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-60"
        >
          {reconnectBusy ? 'Reconnecting…' : 'Reconnect'}
        </button>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={dismissing}
          className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
        >
          {dismissing ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </li>
  );
}

/*
 * Launches the connector OAuth flow for integration providers (GitHub) via
 * POST /api/integrations/oauth/:provider/connect, which mints the encrypted,
 * agent-usable UserConnection on callback — unlike the login OAuth flow that
 * only records an OAuthConnection for sign-in. The connect happens in a popup
 * (the callback page postMessages back); once it resolves we revalidate the
 * loader so the row flips to "Connected".
 */
function IntegrationConnectButton({ provider }: { provider: string }) {
  const { state, launch, reset } = useConnectorPopup();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (state.phase === 'succeeded') {
      revalidator.revalidate();
      reset();
    } else if (state.phase === 'failed') {
      setError(connectionActionError('connect'));
      reset();
    }
  }, [state, revalidator, reset]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);

    try {
      const response = await fetch(`/api/integrations/oauth/${provider}/connect`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(connectionActionError('connect', response.status));
      }

      const result = (await response.json()) as { provider: string; authorizationUrl: string };
      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : connectionActionError('connect'));
    } finally {
      setStarting(false);
    }
  }, [launch, provider]);

  const busy = starting || state.phase === 'launching';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
      >
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      {error ? (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-[var(--status-error-text)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/*
 * Disconnects an integration connection via POST
 * /api/account/connections/:id/revoke, then revalidates so the row flips back
 * to "Not connected" and offers Connect again.
 */
function IntegrationDisconnectButton({ connectionId }: { connectionId: string }) {
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const disconnect = useCallback(async () => {
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/account/connections/${connectionId}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(connectionActionError('disconnect', response.status));
      }

      revalidator.revalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : connectionActionError('disconnect'));
    } finally {
      setBusy(false);
    }
  }, [connectionId, revalidator]);

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmationDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void disconnect();
        }}
        title="Disconnect this integration?"
        description="You will need to reconnect via OAuth to restore access."
        confirmLabel="Disconnect"
        variant="destructive"
      />
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
      >
        {busy ? 'Disconnecting…' : 'Disconnect'}
      </button>
      {error ? (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-[var(--status-error-text)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/*
 * Unlink a sign-in (identity) provider via this route's action. The anti-lockout
 * guard lives server-side (400 LAST_LOGIN_METHOD) and is surfaced by the page's
 * action-error banner.
 */
function IdentityUnlinkButton({ provider }: { provider: string }) {
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle' && navigation.formData?.get('provider') === provider;

  return (
    <Form method="post">
      <input type="hidden" name="intent" value="unlink-identity" />
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
      >
        {busy ? 'Unlinking…' : 'Unlink'}
      </button>
    </Form>
  );
}
