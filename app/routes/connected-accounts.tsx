import { Chrome, Github, Link2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';
import { useConnectorPopup } from '~/lib/chat/use-connector-popup';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Connected accounts - E-Code' }];

type ProviderKey = 'github' | 'google' | 'microsoft';

/*
 * `integration` providers are wired through the connector OAuth flow that
 * mints encrypted, agent-usable `UserConnection` records (repository import,
 * push, PR creation). `identity` providers are sign-in/SSO links tracked in
 * the login `OAuthConnection` table. The two are read from different
 * endpoints because they answer different questions.
 */
type ProviderKind = 'integration' | 'identity';

type ProviderDescriptor = {
  key: ProviderKey;
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
    key: 'google',
    apiProvider: 'google',
    title: 'Google',
    detail: 'Sign in with Google and verify enterprise domains.',
    kind: 'identity',
    connectPath: '/auth/oauth/google',
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  const [integration, identity] = await Promise.all([
    apiRequest<{ connections: IntegrationConnection[] }>(request, '/api/account/connections'),
    apiRequest<{ connections: IdentityConnection[] }>(request, '/auth/connections'),
  ]);

  return {
    integrationConnections: integration.connections,
    identityConnections: identity.connections,
  };
}

const dateFormat: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

export default function ConnectedAccountsPage() {
  const { integrationConnections, identityConnections } = useLoaderData<typeof loader>();

  const integrationByProvider = new Map(
    integrationConnections
      .filter((connection) => !connection.revokedAt)
      .map((connection) => [connection.provider, connection]),
  );

  const identityByProvider = new Map(identityConnections.map((connection) => [connection.provider, connection]));

  return (
    <AppShell
      title="Connected accounts"
      description="Manage OAuth connections for source control, identity and deployment providers."
    >
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        {PROVIDERS.map((provider, index) => {
          const Icon = provider.icon;

          const integration =
            provider.kind === 'integration' ? integrationByProvider.get(provider.apiProvider) : undefined;

          const identity = provider.kind === 'identity' ? identityByProvider.get(provider.apiProvider) : undefined;

          const needsReconnect = integration?.status === 'needs_reconnect';
          const isConnected = Boolean(integration && integration.status === 'active') || Boolean(identity);

          const createdAt = integration?.createdAt ?? identity?.createdAt ?? null;
          const connectedSince = createdAt ? new Date(createdAt).toLocaleDateString(undefined, dateFormat) : null;

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
                    Connect
                  </Link>
                ) : isConnected && provider.kind === 'integration' && integration ? (
                  <IntegrationDisconnectButton connectionId={integration.id} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
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
      setError(state.result.errorMessage ?? 'Connection failed.');
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
        const parsed = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(parsed.error ?? `Failed to start connection (HTTP ${response.status})`);
      }

      const result = (await response.json()) as { provider: string; authorizationUrl: string };
      launch({ authorizationUrl: result.authorizationUrl, provider: result.provider });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start the connection.');
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
        <span role="alert" className="max-w-[16rem] text-right text-xs text-red-500">
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

  const disconnect = useCallback(async () => {
    if (!window.confirm('Disconnect this integration? You will need to reconnect via OAuth to restore access.')) {
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/account/connections/${connectionId}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(parsed.error ?? `Failed to disconnect (HTTP ${response.status})`);
      }

      revalidator.revalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to disconnect.');
    } finally {
      setBusy(false);
    }
  }, [connectionId, revalidator]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={busy}
        className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 disabled:opacity-60"
      >
        {busy ? 'Disconnecting…' : 'Disconnect'}
      </button>
      {error ? (
        <span role="alert" className="max-w-[16rem] text-right text-xs text-red-500">
          {error}
        </span>
      ) : null}
    </div>
  );
}
