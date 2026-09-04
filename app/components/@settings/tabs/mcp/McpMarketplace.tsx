import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const DOMAIN_LABEL_KEYS: Record<McpDomain, string> = {
  AI_AGENTS: 'settings.mcp.domain.aiAgents',
  CODE_EXECUTION: 'settings.mcp.domain.codeExecution',
  DATABASES: 'settings.mcp.domain.databases',
  DEVOPS: 'settings.mcp.domain.devOps',
  DEVELOPER_TOOLS: 'settings.mcp.domain.developerTools',
  COMMUNICATION: 'settings.mcp.domain.communication',
  PRODUCTIVITY: 'settings.mcp.domain.productivity',
  KNOWLEDGE: 'settings.mcp.domain.knowledge',
  WEB_BROWSING: 'settings.mcp.domain.webBrowsing',
  SEARCH: 'settings.mcp.domain.search',
  CLOUD: 'settings.mcp.domain.cloud',
  SECURITY: 'settings.mcp.domain.security',
  FILESYSTEM: 'settings.mcp.domain.filesystem',
  VERSION_CONTROL: 'settings.mcp.domain.versionControl',
  MONITORING: 'settings.mcp.domain.monitoring',
  OTHER: 'settings.mcp.domain.other',
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

const marketplaceLocale = (language: string | undefined): 'en' | 'fr' =>
  language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';

const withMarketplaceLocale = (path: string, locale: 'en' | 'fr') =>
  `${path}${path.includes('?') ? '&' : '?'}locale=${locale}`;

export default function McpMarketplace() {
  const { t, i18n } = useTranslation();
  const locale = marketplaceLocale(i18n.resolvedLanguage);

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
      params.set('locale', locale);

      if (domainFilter !== 'ALL') {
        params.set('domain', domainFilter);
      }

      if (search.trim()) {
        params.set('search', search.trim());
      }

      const [catalogResp, domainsResp, installsResp] = await Promise.all([
        fetch(`/api/mcp/catalog?${params.toString()}`),
        fetch('/api/mcp/catalog/domains'),
        fetch(withMarketplaceLocale('/api/mcp/installs', locale)),
      ]);

      if (!catalogResp.ok) {
        throw new Error(t('settings.mcp.marketplace.loadFailed'));
      }

      if (!domainsResp.ok) {
        throw new Error(t('settings.mcp.marketplace.loadFailed'));
      }

      if (!installsResp.ok) {
        throw new Error(t('settings.mcp.marketplace.loadFailed'));
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

      console.error('Failed to load MCP marketplace', e);
      setError(t('settings.mcp.marketplace.loadFailed'));
    } finally {
      if (token === requestTokenRef.current) {
        setLoading(false);
      }
    }
  }, [domainFilter, locale, search, t]);

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
        const response = await fetch(withMarketplaceLocale(`/api/mcp/installs/${install.id}`, locale), {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(t('settings.mcp.uninstallFailed'));
        }

        toast.success(t('settings.mcp.uninstalled', { alias: install.alias }));
        await loadAll();
      } catch (e) {
        console.error('Failed to uninstall MCP server', e);
        toast.error(t('settings.mcp.uninstallFailed'));
      }
    },
    [loadAll, locale, t],
  );

  const handleToggleEnabled = useCallback(
    async (install: InstallView) => {
      try {
        const response = await fetch(withMarketplaceLocale(`/api/mcp/installs/${install.id}`, locale), {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: !install.enabled }),
        });

        if (!response.ok) {
          throw new Error(t('settings.mcp.toggleFailed'));
        }

        toast.success(
          install.enabled
            ? t('settings.mcp.serverDisabled', { alias: install.alias })
            : t('settings.mcp.serverEnabled', { alias: install.alias }),
        );
        await loadAll();
      } catch (e) {
        console.error('Failed to toggle MCP server', e);
        toast.error(t('settings.mcp.toggleFailed'));
      }
    },
    [loadAll, locale, t],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('settings.copy.searchMcpServers_e94500ed')}
          aria-label={t('settings.copy.searchMcpServers_e9813443')}
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
          {t('settings.copy.refresh_0e916101')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Sum true per-domain totals; `entries` is the filtered/paginated slice. */}
        <DomainChip
          active={domainFilter === 'ALL'}
          label={t('settings.copy.all_a52ace42')}
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
              label={t(DOMAIN_LABEL_KEYS[domain])}
              count={count}
              onClick={() => setDomainFilter(domain)}
            />
          );
        })}
      </div>

      {installs.length > 0 && (
        <section aria-labelledby="installed-heading" className="space-y-3">
          <h3 id="installed-heading" className="text-base font-medium text-bolt-elements-textPrimary">
            {t('settings.copy.installed_fa99e2a0')}
            {installs.length})
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
          {t('settings.copy.marketplace_470b10c7')}
          {entries.length})
        </h3>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary">
            <div className="i-svg-spinners:90-ring-with-bg w-4 h-4 animate-spin" />
            {t('settings.copy.loadingMarketplace_22739be9')}
          </div>
        ) : error ? (
          <p className="text-sm text-bolt-elements-icon-error">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-bolt-elements-textSecondary">
            {t('settings.copy.noMcpServersMatchYourFilters_75b78004')}
          </p>
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
  const { t } = useTranslation();

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
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {t('settings.copy.featured_5af7ed5a')}
              </span>
            )}
            {entry.verified && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {t('settings.copy.verified_8766e017')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-bolt-elements-textTertiary mt-0.5">
            {t(DOMAIN_LABEL_KEYS[entry.domain])} {t('settings.copy.v_0bb917d8')}
            {entry.version} · {entry.transport.toLowerCase().replace('_', '-')} · {entry.author}
          </p>
        </div>
      </header>
      <p className="text-xs text-bolt-elements-textSecondary leading-relaxed mb-3">{entry.description}</p>
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-bolt-elements-textTertiary">
          {t('settings.mcp.installCount', { count: entry.installCount })}
        </span>
        <div className="flex items-center gap-2">
          {entry.homepageUrl && (
            <a
              href={entry.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-bolt-elements-link hover:underline inline-flex items-center gap-1"
            >
              {t('settings.copy.source_0e570ca6')}
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
            {installed ? t('settings.mcp.installed') : t('settings.copy.install_569ca49f')}
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
  const { t } = useTranslation();

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
            {t('settings.copy.alias_c25bf3e6')} <code className="font-mono">{install.alias}</code> ·{' '}
            {t(DOMAIN_LABEL_KEYS[install.catalogEntry.domain])} {t('settings.copy.v_0bb917d8')}
            {install.catalogEntry.version}
          </p>
        </div>
        <span
          className={classNames(
            'text-[11px] font-medium px-1.5 py-0.5 rounded',
            install.enabled
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-zinc-500/10 text-zinc-500',
          )}
        >
          {install.enabled ? t('settings.mcp.enabled') : t('settings.mcp.disabled')}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="px-2.5 py-1 rounded-md text-xs bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 text-bolt-elements-textPrimary"
        >
          {install.enabled ? t('settings.mcp.disable') : t('settings.mcp.enable')}
        </button>
        <button
          type="button"
          onClick={onUninstall}
          className="px-2.5 py-1 rounded-md text-xs bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400"
        >
          {t('settings.copy.uninstall_fe199528')}
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
  const { t, i18n } = useTranslation();
  const locale = marketplaceLocale(i18n.resolvedLanguage);

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
      setError(t('settings.mcp.missingRequiredFields', { fields: missing.join(', ') }));
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

      const response = await fetch(withMarketplaceLocale('/api/mcp/installs', locale), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          catalogEntrySlug: entry.slug,
          alias,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error(t('settings.mcp.installFailed'));
      }

      toast.success(t('settings.mcp.installedAs', { name: entry.name, alias }));
      await onInstalled();
    } catch (e) {
      console.error('Failed to install MCP server', e);
      setError(t('settings.mcp.installFailed'));
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
            <h3 className="text-base font-medium text-bolt-elements-textPrimary">
              {t('settings.copy.install_569ca49f')} {entry.name}
            </h3>
            <p className="text-[11px] text-bolt-elements-textTertiary">
              v{entry.version} · {entry.author}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.copy.closeInstallDialog_1bd3a671')}
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            <div className="i-ph:x w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-bolt-elements-textSecondary mb-4">{entry.description}</p>

        <div className="space-y-3">
          <div>
            <label htmlFor="mcp-install-alias" className="block text-[11px] text-bolt-elements-textSecondary mb-1">
              {t('settings.copy.alias_b19e02e9')}{' '}
              <span className="text-bolt-elements-textTertiary">
                {t('settings.copy.usedAsTheServerNameInYourMcp_6ecc8e83')}
              </span>
            </label>
            <input
              id="mcp-install-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-md text-sm bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-focus"
            />
          </div>

          {fields.length === 0 ? (
            <p className="text-xs text-bolt-elements-textTertiary">
              {t('settings.copy.noAdditionalConfigurationRequired_5fbdb4de')}
            </p>
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
                  <p className="text-[11px] text-bolt-elements-textTertiary mt-1">{prop.description}</p>
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
            {t('settings.copy.cancel_19766ed6')}
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
            {submitting ? t('settings.mcp.installing') : t('settings.copy.install_569ca49f')}
          </button>
        </div>
      </div>
    </div>
  );
}
