import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import RequestIntegrationCard from './RequestIntegrationCard';
import { classNames } from '~/utils/classNames';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

const serviceLinks = [
  { id: 'github', label: 'GitHub', href: '/settings/github' },
  { id: 'gitlab', label: 'GitLab', href: '/settings/gitlab' },
  { id: 'netlify', label: 'Netlify', href: '/settings/netlify' },
  { id: 'vercel', label: 'Vercel', href: '/settings/vercel' },
  { id: 'supabase', label: 'Supabase', href: '/settings/supabase' },
  { id: 'cloud-providers', label: 'Cloud Providers', href: '/settings/providers' },
  { id: 'local-providers', label: 'Local Providers', href: '/settings/local-providers' },
  { id: 'mcp', label: 'MCP Servers', href: '/settings/mcp' },
];

export default function ConnectionsTab() {
  const [providers, setProviders] = useState<ConfiguredProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/configured-providers')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.statusText))))
      .then((data) => {
        const responseData = data as { providers?: ConfiguredProvider[] };

        if (!cancelled) {
          setProviders(Array.isArray(responseData.providers) ? responseData.providers : []);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Surface the failure instead of rendering a misleading "0/0 configured".
          setProviders([]);
          setError('Could not load configured providers. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const configuredCount = useMemo(() => providers.filter((provider) => provider.isConfigured).length, [providers]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Provider Keys</h3>
            <p
              className={classNames('text-sm', error ? 'text-red-500' : 'text-bolt-elements-textSecondary')}
              role={error ? 'alert' : undefined}
            >
              {loading
                ? 'Checking configured providers...'
                : error
                  ? error
                  : `${configuredCount}/${providers.length} providers configured`}
            </p>
          </div>
          <Link to="/settings/providers" className="text-sm text-[var(--vc-ide-accent-action)] hover:opacity-80">
            Open providers
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.map((provider) => (
            <div
              key={provider.name}
              className="flex items-center justify-between rounded-lg bg-bolt-elements-background-depth-1 px-3 py-2"
            >
              <span className="text-sm text-bolt-elements-textPrimary">{provider.name}</span>
              <span
                className={classNames(
                  'text-xs font-medium',
                  provider.isConfigured ? 'text-green-500' : 'text-bolt-elements-textTertiary',
                )}
              >
                {provider.isConfigured ? 'Set' : 'Not set'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {serviceLinks.map((service) => (
          <Link
            key={service.id}
            to={service.href}
            className="flex items-center justify-between rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 hover:bg-bolt-elements-background-depth-3"
          >
            <span className="text-sm font-medium text-bolt-elements-textPrimary">{service.label}</span>
            <span className="i-ph:arrow-right text-bolt-elements-textSecondary" />
          </Link>
        ))}
      </section>

      <RequestIntegrationCard />
    </div>
  );
}
