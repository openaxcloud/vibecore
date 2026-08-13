import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';

const MCP_DOMAINS = [
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

type McpDomain = (typeof MCP_DOMAINS)[number];

const DOMAIN_LABELS: Record<McpDomain, string> = {
  AI_AGENTS: 'AI Agents',
  CODE_EXECUTION: 'Code Execution',
  DATABASES: 'Databases',
  DEVOPS: 'DevOps',
  DEVELOPER_TOOLS: 'Developer Tools',
  COMMUNICATION: 'Communication',
  PRODUCTIVITY: 'Productivity',
  KNOWLEDGE: 'Knowledge',
  WEB_BROWSING: 'Web Browsing',
  SEARCH: 'Search',
  CLOUD: 'Cloud',
  SECURITY: 'Security',
  FILESYSTEM: 'Filesystem',
  VERSION_CONTROL: 'Version Control',
  MONITORING: 'Monitoring',
  OTHER: 'Other',
};

interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  domain: McpDomain;
  tags: string[];
  author: string;
  homepageUrl: string | null;
  iconUrl: string | null;
  version: string;
  transport: 'STDIO' | 'SSE' | 'STREAMABLE_HTTP';
  configTemplate: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  installCount: number;
  featured: boolean;
  verified: boolean;
}

interface InstallView {
  id: string;
  alias: string;
  enabled: boolean;
  configJson: Record<string, unknown>;
  catalogEntry: CatalogEntry;
  installedAt: string;
  organizationId: string | null;
}

interface DomainCount {
  domain: McpDomain;
  count: number;
}

interface ConfigSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  format?: string;
  minLength?: number;
  default?: unknown;
}

interface ConfigSchema {
  type?: string;
  properties?: Record<string, ConfigSchemaProperty>;
  required?: string[];
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'mcp';

export default function McpMarketplace() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [installs, setInstalls] = useState<InstallView[]>([]);
  const [domains, setDomains] = useState<DomainCount[]>([]);
  const [domainFilter, setDomainFilter] = useState<McpDomain | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeInstall, setActiveInstall] = useState<CatalogEntry | null>(null);

  // Monotonic token so a slow earlier fetch can't clobber a newer one's results.
  const requestTokenRef = useRef(0);

  const loadAll = useCallback(async () => {
    const token = ++requestTokenRef.current;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', '100');

      if (domainFilter !== 'ALL') {
        params.set('domain', domainFilter);
      }

      if (search.trim()) {
        params.set('search', search.trim());
      }

      const [catalogResp, domainsResp, installsResp] = await Promise.all([
        fetch(`/api/mcp/catalog?${params.toString()}`),
        fetch('/api/mcp/catalog/domains'),
        fetch('/api/mcp/installs'),
      ]);

      if (!catalogResp.ok) {
        throw new Error(`Catalog request failed (${catalogResp.status})`);
      }

      if (!domainsResp.ok) {
        throw new Error(`Domains request failed (${domainsResp.status})`);
      }

      if (!installsResp.ok) {
        throw new Error(`Installs request failed (${installsResp.status})`);
      }

      const catalogJson = (await catalogResp.json()) as { items: CatalogEntry[] };
      const domainsJson = (await domainsResp.json()) as { domains: DomainCount[] };
      const installsJson = (await installsResp.json()) as { installs: InstallView[] };

      // A newer request started while we were awaiting; drop this stale result.
      if (token !== requestTokenRef.current) {
        return;
      }

      setEntries(catalogJson.items);
      setDomains(domainsJson.domains);
      setInstalls(installsJson.installs);
    } catch (e) {
      if (token !== requestTokenRef.current) {
        return;
      }

      setError(e instanceof Error ? e.message : 'Failed to load marketplace');
    } finally {
      if (token === requestTokenRef.current) {
        setLoading(false);
      }
    }
  }, [domainFilter, search]);

  useEffect(() => {
    /*
     * Debounce: loadAll depends on `search`, so binding it directly fired a
     * fresh triple-fetch (catalog + domains + installs) on every keystroke.
     */
    const id = setTimeout(() => {
      loadAll().catch(() => {
        // already surfaced in setError
      });
    }, 250);

    return () => clearTimeout(id);
  }, [loadAll]);

  const installedSlugs = useMemo(() => new Set(installs.map((i) => i.catalogEntry.slug)), [installs]);

  const domainCountBySlug = useMemo(() => {
    const map = new Map<McpDomain, number>();

    for (const row of domains) {
      map.set(row.domain, row.count);
    }

    return map;
  }, [domains]);

  const handleUninstall = useCallback(
    async (install: InstallView) => {
      try {
        const response = await fetch(`/api/mcp/installs/${install.id}`, { method: 'DELETE' });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Uninstall failed (${response.status})`);
        }

        toast.success(`Uninstalled '${install.alias}'`);
        await loadAll();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Uninstall failed');
      }
    },
    [loadAll],
  );

  const handleToggleEnabled = useCallback(
    async (install: InstallView) => {
      try {
        const response = await fetch(`/api/mcp/installs/${install.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: !install.enabled }),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Toggle failed (${response.status})`);
        }

        toast.success(`'${install.alias}' ${install.enabled ? 'disabled' : 'enabled'}`);
        await loadAll();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Toggle failed');
      }
    },
    [loadAll],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search MCP servers..."
          aria-label="Search MCP servers"
          className={classNames(
            'flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm',
            'bg-bolt-elements-background-depth-2',
            'border border-bolt-elements-borderColor',
            'text-bolt-elements-textPrimary',
            'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
          )}
        />
        <button
          type="button"
          onClick={() => loadAll()}
          className={classNames(
            'px-3 py-2 rounded-lg text-sm flex items-center gap-1',
            'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
            'text-bolt-elements-textPrimary border border-bolt-elements-borderColor',
          )}
        >
          <div className="i-ph:arrow-counter-clockwise w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Sum true per-domain totals; `entries` is the filtered/paginated slice. */}
        <DomainChip
          active={domainFilter === 'ALL'}
          label="All"
          count={domains.reduce((sum, d) => sum + d.count, 0)}
          onClick={() => setDomainFilter('ALL')}
        />
        {MCP_DOMAINS.map((domain) => {
          const count = domainCountBySlug.get(domain) ?? 0;

          if (count === 0 && domainFilter !== domain) {
            return null;
          }

          return (
            <DomainChip
              key={domain}
              active={domainFilter === domain}
              label={DOMAIN_LABELS[domain]}
              count={count}
              onClick={() => setDomainFilter(domain)}
            />
          );
        })}
      </div>

      {installs.length > 0 && (
        <section aria-labelledby="installed-heading" className="space-y-3">
          <h3 id="installed-heading" className="text-base font-medium text-bolt-elements-textPrimary">
            Installed ({installs.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {installs.map((install) => (
              <InstalledCard
                key={install.id}
                install={install}
                onToggle={() => handleToggleEnabled(install)}
                onUninstall={() => handleUninstall(install)}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="catalog-heading" className="space-y-3">
        <h3 id="catalog-heading" className="text-base font-medium text-bolt-elements-textPrimary">
          Marketplace ({entries.length})
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
            <div className="i-svg-spinners:90-ring-with-bg w-4 h-4 animate-spin" />
            Loading marketplace...
          </div>
        ) : error ? (
          <p className="text-sm text-bolt-elements-icon-error">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">No MCP servers match your filters.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entries.map((entry) => (
              <CatalogCard
                key={entry.id}
                entry={entry}
                installed={installedSlugs.has(entry.slug)}
                onInstall={() => setActiveInstall(entry)}
              />
            ))}
          </div>
        )}
      </section>

      {activeInstall && (
        <InstallDialog
          key={activeInstall.id}
          entry={activeInstall}
          onClose={() => setActiveInstall(null)}
          onInstalled={async () => {
            setActiveInstall(null);
            await loadAll();
          }}
        />
      )}
    </div>
  );
}

interface DomainChipProps {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}

function DomainChip({ active, label, count, onClick }: DomainChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 border transition-colors',
        active
          ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent border-transparent'
          : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-3',
      )}
    >
      <span>{label}</span>
      <span className="opacity-70">{count}</span>
    </button>
  );
}

interface CatalogCardProps {
  entry: CatalogEntry;
  installed: boolean;
  onInstall: () => void;
}

function CatalogCard({ entry, installed, onInstall }: CatalogCardProps) {
  return (
    <article
      className={classNames(
        'rounded-lg p-3 border transition-colors',
        'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor',
        'hover:border-bolt-elements-focus',
      )}
    >
      <header className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="truncate text-sm font-medium text-bolt-elements-textPrimary" title={entry.name}>
              {entry.name}
            </h4>
            {entry.featured && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                FEATURED
              </span>
            )}
            {entry.verified && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                VERIFIED
              </span>
            )}
          </div>
          <p className="text-[11px] text-bolt-elements-textTertiary mt-0.5">
            {DOMAIN_LABELS[entry.domain]} · v{entry.version} · {entry.transport.toLowerCase().replace('_', '-')} ·{' '}
            {entry.author}
          </p>
        </div>
      </header>
      <p className="text-xs text-bolt-elements-textSecondary leading-relaxed mb-3">{entry.description}</p>
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-bolt-elements-textTertiary">
          {entry.installCount} install{entry.installCount === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-2">
          {entry.homepageUrl && (
            <a
              href={entry.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-bolt-elements-link hover:underline inline-flex items-center gap-1"
            >
              Source
              <div className="i-ph:arrow-square-out w-3 h-3" />
            </a>
          )}
          <button
            type="button"
            onClick={onInstall}
            disabled={installed}
            className={classNames(
              'px-2.5 py-1 rounded-md text-xs',
              installed
                ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-not-allowed'
                : 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:bg-bolt-elements-item-backgroundActive',
            )}
          >
            {installed ? 'Installed' : 'Install'}
          </button>
        </div>
      </div>
    </article>
  );
}

interface InstalledCardProps {
  install: InstallView;
  onToggle: () => void;
  onUninstall: () => void;
}

function InstalledCard({ install, onToggle, onUninstall }: InstalledCardProps) {
  return (
    <article
      className={classNames(
        'rounded-lg p-3 border',
        'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-medium text-bolt-elements-textPrimary" title={install.catalogEntry.name}>
            {install.catalogEntry.name}
          </h4>
          <p className="break-all text-[11px] text-bolt-elements-textTertiary mt-0.5">
            alias: <code className="font-mono">{install.alias}</code> · {DOMAIN_LABELS[install.catalogEntry.domain]} · v
            {install.catalogEntry.version}
          </p>
        </div>
        <span
          className={classNames(
            'text-[10px] font-medium px-1.5 py-0.5 rounded',
            install.enabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-zinc-500/10 text-zinc-500',
          )}
        >
          {install.enabled ? 'ENABLED' : 'DISABLED'}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="px-2.5 py-1 rounded-md text-xs bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 text-bolt-elements-textPrimary"
        >
          {install.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          type="button"
          onClick={onUninstall}
          className="px-2.5 py-1 rounded-md text-xs bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400"
        >
          Uninstall
        </button>
      </div>
    </article>
  );
}

interface InstallDialogProps {
  entry: CatalogEntry;
  onClose: () => void;
  onInstalled: () => void | Promise<void>;
}

function InstallDialog({ entry, onClose, onInstalled }: InstallDialogProps) {
  const schema = entry.configSchema as ConfigSchema;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const [alias, setAlias] = useState(slugify(entry.slug));

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};

    for (const [key, prop] of Object.entries(properties)) {
      initial[key] = typeof prop.default === 'string' ? prop.default : '';
    }

    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = async () => {
    /*
     * Block submit when a required field is blank instead of POSTing an empty
     * string and round-tripping to a server-side error.
     */
    const missing = [...required].filter((k) => !(values[k] ?? '').trim());

    if (missing.length > 0) {
      setError(`Missing required field(s): ${missing.join(', ')}`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const config: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(values)) {
        if (value !== '' || required.has(key)) {
          config[key] = value;
        }
      }

      const response = await fetch('/api/mcp/installs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogEntrySlug: entry.slug,
          alias,
          config,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Install failed (${response.status})`);
      }

      toast.success(`Installed '${entry.name}' as '${alias}'`);
      await onInstalled();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fields = Object.entries(properties);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">Install {entry.name}</h3>
            <p className="text-[11px] text-bolt-elements-textTertiary">
              v{entry.version} · {entry.author}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install dialog"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            <div className="i-ph:x w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-bolt-elements-textSecondary mb-4">{entry.description}</p>

        <div className="space-y-3">
          <div>
            <label htmlFor="mcp-install-alias" className="block text-[11px] text-bolt-elements-textSecondary mb-1">
              Alias{' '}
              <span className="text-bolt-elements-textTertiary">(used as the server name in your MCP config)</span>
            </label>
            <input
              id="mcp-install-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus"
            />
          </div>

          {fields.length === 0 ? (
            <p className="text-xs text-bolt-elements-textTertiary">No additional configuration required.</p>
          ) : (
            fields.map(([key, prop]) => (
              <div key={key}>
                <label
                  htmlFor={`mcp-install-${key}`}
                  className="block text-[11px] text-bolt-elements-textSecondary mb-1"
                >
                  {prop.title ?? key}
                  {required.has(key) && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  id={`mcp-install-${key}`}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                  type={prop.format === 'password' ? 'password' : 'text'}
                  placeholder={typeof prop.default === 'string' ? prop.default : ''}
                  className="w-full px-2.5 py-1.5 rounded-md text-sm font-mono bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus"
                />
                {prop.description && (
                  <p className="text-[10px] text-bolt-elements-textTertiary mt-1">{prop.description}</p>
                )}
              </div>
            ))
          )}

          {error && <p className="text-xs text-bolt-elements-icon-error">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInstall}
            disabled={submitting}
            className={classNames(
              'px-3 py-1.5 rounded-md text-xs flex items-center gap-1',
              'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent',
              'hover:bg-bolt-elements-item-backgroundActive',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {submitting && <div className="i-svg-spinners:90-ring-with-bg w-3 h-3 animate-spin" />}
            {submitting ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}
