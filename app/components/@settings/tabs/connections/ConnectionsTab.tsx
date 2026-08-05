import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import RequestIntegrationCard from './RequestIntegrationCard';
import {
  formatConnectionsTabProviderSummary,
  getConnectionsTabCopy,
  getConnectionsTabSafeError,
  interpolateConnectionsTabCopy,
} from '~/lib/i18n/catalogs/connections-tab';
import type { ConnectionsTabKey } from '~/lib/i18n/catalogs/connections-tab';
import { classNames } from '~/utils/classNames';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

type ProviderLoadState = 'loading' | 'success' | 'error';

const serviceLinks = [
  { id: 'github', labelKey: 'connectionsTab.service.github', href: '/settings/github' },
  { id: 'gitlab', labelKey: 'connectionsTab.service.gitlab', href: '/settings/gitlab' },
  { id: 'netlify', labelKey: 'connectionsTab.service.netlify', href: '/settings/netlify' },
  { id: 'vercel', labelKey: 'connectionsTab.service.vercel', href: '/settings/vercel' },
  { id: 'supabase', labelKey: 'connectionsTab.service.supabase', href: '/settings/supabase' },
  { id: 'cloud-providers', labelKey: 'connectionsTab.service.cloudProviders', href: '/settings/providers' },
  { id: 'local-providers', labelKey: 'connectionsTab.service.localProviders', href: '/settings/local-providers' },
  { id: 'mcp', labelKey: 'connectionsTab.service.mcpServers', href: '/settings/mcp' },
] as const satisfies ReadonlyArray<{ id: string; labelKey: ConnectionsTabKey; href: string }>;

function parseConfiguredProviders(payload: unknown): ConfiguredProvider[] {
  if (!payload || typeof payload !== 'object' || !('providers' in payload) || !Array.isArray(payload.providers)) {
    throw new TypeError();
  }

  if (
    !payload.providers.every(
      (provider): provider is ConfiguredProvider =>
        Boolean(provider) &&
        typeof provider === 'object' &&
        'name' in provider &&
        typeof provider.name === 'string' &&
        provider.name.trim().length > 0 &&
        'isConfigured' in provider &&
        typeof provider.isConfigured === 'boolean' &&
        'configMethod' in provider &&
        (provider.configMethod === 'environment' || provider.configMethod === 'none'),
    )
  ) {
    throw new TypeError();
  }

  return payload.providers;
}

export default function ConnectionsTab() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getConnectionsTabCopy(language);
  const [providers, setProviders] = useState<ConfiguredProvider[]>([]);
  const [loadState, setLoadState] = useState<ProviderLoadState>('loading');
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoadState('loading');

    void fetch('/api/configured-providers', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        return parseConfiguredProviders(await response.json());
      })
      .then((nextProviders) => {
        if (!controller.signal.aborted) {
          setProviders(nextProviders);
          setLoadState('success');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProviders([]);
          setLoadState('error');
        }
      });

    return () => controller.abort();
  }, [retryNonce]);

  const configuredCount = useMemo(() => providers.filter((provider) => provider.isConfigured).length, [providers]);

  const providerSummary =
    loadState === 'loading'
      ? copy['connectionsTab.providers.loading']
      : loadState === 'error'
        ? copy['connectionsTab.providers.unavailable']
        : formatConnectionsTabProviderSummary(configuredCount, providers.length, language);

  return (
    <div className="min-w-0 space-y-6">
      <section
        className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
        aria-labelledby="connections-provider-keys-title"
      >
        <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h3
              id="connections-provider-keys-title"
              className="break-words text-sm font-medium text-bolt-elements-textPrimary"
            >
              {copy['connectionsTab.providers.title']}
            </h3>
            <p
              className={classNames(
                'break-words text-sm',
                loadState === 'error' ? 'text-red-500 dark:text-red-400' : 'text-bolt-elements-textSecondary',
              )}
              role={loadState === 'loading' ? 'status' : undefined}
              aria-live="polite"
              aria-busy={loadState === 'loading'}
            >
              {providerSummary}
            </p>
          </div>
          <Link
            to="/settings/providers"
            className="inline-flex min-h-11 max-w-full shrink-0 items-center justify-center rounded-md px-3 py-2 text-center text-sm whitespace-normal text-[var(--vc-ide-accent-action)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)]"
          >
            {copy['connectionsTab.providers.open']}
          </Link>
        </div>

        {loadState === 'loading' ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-lg bg-bolt-elements-background-depth-1" />
            ))}
          </div>
        ) : loadState === 'error' ? (
          <div
            className="mt-4 flex min-w-0 flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20 sm:flex-row sm:justify-between"
            role="alert"
          >
            <div className="flex min-w-0 items-start gap-2">
              <span className="i-ph:warning-circle mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-red-800 dark:text-red-200">
                  {copy['connectionsTab.providers.errorTitle']}
                </p>
                <p className="mt-1 break-words text-sm text-red-800 dark:text-red-200">
                  {getConnectionsTabSafeError(language)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRetryNonce((current) => current + 1)}
              className="inline-flex min-h-11 max-w-full shrink-0 items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-center text-sm font-medium whitespace-normal text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-900/40"
            >
              {copy['connectionsTab.providers.retry']}
            </button>
          </div>
        ) : providers.length === 0 ? (
          <div className="mt-4 flex min-w-0 items-start gap-3 rounded-lg bg-bolt-elements-background-depth-1 p-4">
            <span className="i-ph:key mt-0.5 h-4 w-4 shrink-0 text-bolt-elements-textTertiary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-bolt-elements-textPrimary">
                {copy['connectionsTab.providers.emptyTitle']}
              </p>
              <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
                {copy['connectionsTab.providers.emptyDescription']}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {providers.map((provider) => {
              const status = provider.isConfigured
                ? copy['connectionsTab.provider.set']
                : copy['connectionsTab.provider.notSet'];

              return (
                <div
                  key={provider.name}
                  className="flex min-w-0 flex-col items-start justify-between gap-2 rounded-lg bg-bolt-elements-background-depth-1 px-3 py-2 min-[360px]:flex-row min-[360px]:items-center"
                >
                  <span className="min-w-0 break-all text-sm text-bolt-elements-textPrimary">{provider.name}</span>
                  <span
                    className={classNames(
                      'shrink-0 text-xs font-medium',
                      provider.isConfigured ? 'text-green-600 dark:text-green-400' : 'text-bolt-elements-textTertiary',
                    )}
                    aria-label={interpolateConnectionsTabCopy(copy['connectionsTab.provider.status'], {
                      provider: provider.name,
                      status,
                    })}
                  >
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="min-w-0" aria-labelledby="connections-services-title">
        <h3
          id="connections-services-title"
          className="mb-3 break-words text-sm font-medium text-bolt-elements-textPrimary"
        >
          {copy['connectionsTab.services.title']}
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {serviceLinks.map((service) => {
            const label = copy[service.labelKey];

            return (
              <Link
                key={service.id}
                to={service.href}
                aria-label={interpolateConnectionsTabCopy(copy['connectionsTab.services.openAria'], {
                  service: label,
                })}
                className="flex min-h-14 min-w-0 items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 transition-colors hover:bg-bolt-elements-background-depth-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)]"
              >
                <span className="min-w-0 break-words text-sm font-medium text-bolt-elements-textPrimary">{label}</span>
                <span className="i-ph:arrow-right shrink-0 text-bolt-elements-textSecondary" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <RequestIntegrationCard />
    </div>
  );
}
