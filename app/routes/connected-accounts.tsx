import type { MetaFunction } from '@remix-run/cloudflare';
import { Link, useLoaderData } from '@remix-run/react';
import { Chrome, Github, Link2 } from 'lucide-react';
import { AppShell, StatusPill } from '~/components/dashboard/SaaSLayout';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { classNames } from '~/utils/classNames';

export const meta: MetaFunction = () => [{ title: 'Connected accounts - VibeCore' }];

type ProviderKey = 'github' | 'google' | 'microsoft';

type ProviderDescriptor = {
  key: ProviderKey;
  apiProvider: string;
  title: string;
  detail: string;
  connectPath?: string;
  icon: typeof Github;
};

const PROVIDERS: ProviderDescriptor[] = [
  {
    key: 'github',
    apiProvider: 'github',
    title: 'GitHub',
    detail: 'Connected for repository import, push and pull request creation.',
    connectPath: '/auth/oauth/github',
    icon: Github,
  },
  {
    key: 'google',
    apiProvider: 'google',
    title: 'Google',
    detail: 'Sign in with Google and verify enterprise domains.',
    connectPath: '/auth/oauth/google',
    icon: Chrome,
  },
  {
    key: 'microsoft',
    apiProvider: 'microsoft',
    title: 'Microsoft Entra ID',
    detail: 'OIDC configuration can be enabled from enterprise SSO settings.',
    icon: Link2,
  },
];

type ConnectionRecord = { provider: string; externalId: string; createdAt: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const { connections } = await apiRequest<{ connections: ConnectionRecord[] }>(request, '/auth/connections');
  return { connections };
}

export default function ConnectedAccountsPage() {
  const { connections } = useLoaderData<typeof loader>();
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));

  return (
    <AppShell
      title="Connected accounts"
      description="Manage OAuth connections for source control, identity and deployment providers."
    >
      <div className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
        {PROVIDERS.map((provider, index) => {
          const Icon = provider.icon;
          const connection = byProvider.get(provider.apiProvider);
          const isConnected = Boolean(connection);

          const connectedSince = connection
            ? new Date(connection.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : null;

          return (
            <div
              key={provider.key}
              className={classNames(
                'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between',
                index > 0 && 'border-t border-bolt-elements-borderColor',
              )}
            >
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium">{provider.title}</p>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">{provider.detail}</p>
                  {connectedSince ? (
                    <p className="mt-1 text-xs text-bolt-elements-textTertiary">Linked since {connectedSince}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3 sm:shrink-0">
                <StatusPill label={isConnected ? 'Connected' : 'Not connected'} />
                {!isConnected && provider.connectPath ? (
                  <Link
                    to={provider.connectPath}
                    reloadDocument
                    className="inline-flex h-8 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
                  >
                    Connect
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
