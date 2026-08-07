import { AppWindow, ArrowRight, BookOpen, LayoutTemplate, LifeBuoy, Search as SearchIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { getHelpSearchContent, normalizeHelpQuery } from '~/components/marketing/ecode-exact/pages/help-search';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  formatSearchDataSettingsPlural,
  getSearchCopy,
  interpolateSearchDataSettingsCopy,
  resolveSearchDataSettingsLanguage,
  type SearchCopy,
} from '~/lib/i18n/catalogs/search-data-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { getEcodeTemplateCategories, listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';
import { DEFAULT_OG_IMAGE, MARKETING_SITE_URL } from '~/utils/social-meta';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const seo = getSearchCopy(data?.language).seo;
  const canonical = `${MARKETING_SITE_URL}/search`;

  return [
    { title: seo.title },
    { name: 'description', content: seo.description },
    { name: 'robots', content: 'noindex,follow' },
    { property: 'og:title', content: seo.title },
    { property: 'og:description', content: seo.description },
    { property: 'og:image', content: DEFAULT_OG_IMAGE },
    { property: 'og:image:alt', content: seo.imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: seo.title },
    { name: 'twitter:description', content: seo.description },
    { name: 'twitter:image', content: DEFAULT_OG_IMAGE },
    { name: 'twitter:image:alt', content: seo.imageAlt },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};

export interface AppPageIndexEntry {
  title: string;
  description: string;
  path: string;
}

type AppPageKey = keyof SearchCopy['appPages'];

const APP_PAGE_DEFINITIONS: ReadonlyArray<{ key: AppPageKey; path: string }> = [
  { key: 'dashboard', path: '/dashboard' },
  { key: 'projects', path: '/projects' },
  { key: 'newProject', path: '/projects/new' },
  { key: 'templates', path: '/templates' },
  { key: 'deployments', path: '/deployments' },
  { key: 'usage', path: '/usage' },
  { key: 'billing', path: '/billing' },
  { key: 'invoices', path: '/invoices' },
  { key: 'teams', path: '/team' },
  { key: 'settings', path: '/settings' },
  { key: 'accountSettings', path: '/account-settings' },
  { key: 'apiKeys', path: '/api-keys' },
  { key: 'support', path: '/support' },
  { key: 'docs', path: '/docs' },
  { key: 'helpCenter', path: '/help-center' },
  { key: 'community', path: '/community' },
  { key: 'pricing', path: '/pricing' },
  { key: 'marketplace', path: '/marketplace' },
];

function buildAppPageIndex(copy: SearchCopy): AppPageIndexEntry[] {
  return APP_PAGE_DEFINITIONS.map(({ key, path }) => ({ path, ...copy.appPages[key] }));
}

export const APP_PAGE_INDEX: AppPageIndexEntry[] = buildAppPageIndex(getSearchCopy('en'));

const MAX_RESULTS_PER_SOURCE = 8;

function normalizeSearchText(value: string): string {
  return normalizeHelpQuery(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function includesQuery(values: readonly string[], query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  return values.some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function filterLocalizedRecords<T>(
  localized: readonly T[],
  english: readonly T[],
  query: string,
  searchableText: (value: T) => readonly string[],
): T[] {
  return localized.filter((value, index) => {
    const fallback = english[index];
    const values = [...searchableText(value), ...(fallback ? searchableText(fallback) : [])];

    return includesQuery(values, query);
  });
}

/**
 * Server-side search over the real corpora available without new backends:
 * the app's own page index, the canonical Help Center topics/articles and the
 * public template catalog. An empty query returns empty groups so the page
 * renders its "type to search" state instead of dumping every corpus.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = normalizeHelpQuery(url.searchParams.get('q') ?? '');
  const language = resolveRequestLocale(request).language;
  const copy = getSearchCopy(language);
  const englishCopy = getSearchCopy('en');
  const help = getHelpSearchContent(language);
  const englishHelp = getHelpSearchContent('en');

  if (query === '') {
    return {
      language,
      query,
      pages: [] as AppPageIndexEntry[],
      helpTopics: [] as Array<{ title: string; description: string }>,
      helpArticles: [] as string[],
      templates: [] as Array<{
        slug: string;
        name: string;
        description: string;
        categoryName: string;
        lookupName: string;
      }>,
    };
  }

  const categoryNames = new Map(getEcodeTemplateCategories().map((category) => [category.slug, category.name]));
  const localizedPages = buildAppPageIndex(copy);
  const englishPages = buildAppPageIndex(englishCopy);

  const templates = listEcodeTemplates()
    .map((template) => {
      const localized = copy.templates.records[template.slug as keyof typeof copy.templates.records];
      const english = englishCopy.templates.records[template.slug as keyof typeof englishCopy.templates.records];
      const localizedCategory = copy.templates.categories[template.category as keyof typeof copy.templates.categories];

      const englishCategory =
        englishCopy.templates.categories[template.category as keyof typeof englishCopy.templates.categories] ??
        categoryNames.get(template.category) ??
        template.category;

      return {
        slug: template.slug,
        name: localized?.name ?? template.name,
        description: localized?.description ?? template.description,
        categoryName: localizedCategory ?? categoryNames.get(template.category) ?? template.category,
        lookupName: template.name,
        searchable: [
          localized?.name ?? template.name,
          localized?.description ?? template.description,
          localizedCategory ?? template.category,
          english?.name ?? template.name,
          english?.description ?? template.description,
          englishCategory,
          ...template.tags,
          ...template.technologies,
        ],
      };
    })
    .filter((template) => includesQuery(template.searchable, query))
    .slice(0, MAX_RESULTS_PER_SOURCE)
    .map(({ searchable: _searchable, ...template }) => template);

  return {
    language,
    query,
    pages: filterLocalizedRecords(localizedPages, englishPages, query, (page) => [page.title, page.description]).slice(
      0,
      MAX_RESULTS_PER_SOURCE,
    ),
    helpTopics: filterLocalizedRecords(help.topics, englishHelp.topics, query, (topic) => [
      topic.title,
      topic.description,
    ]).slice(0, MAX_RESULTS_PER_SOURCE),
    helpArticles: filterLocalizedRecords(help.popularArticles, englishHelp.popularArticles, query, (article) => [
      article,
    ]).slice(0, MAX_RESULTS_PER_SOURCE),
    templates,
  };
}

function SearchResultRow({
  to,
  icon,
  title,
  description,
  meta: metaText,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  meta?: string;
}) {
  const Icon = icon;

  return (
    <li>
      <Link
        to={to}
        className="group flex items-start gap-4 p-4 text-[var(--ecode-text)] no-underline transition hover:bg-[var(--ecode-surface-secondary)] sm:p-5"
      >
        <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[var(--ecode-surface-secondary)] text-[var(--ecode-accent)]">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-semibold">{title}</span>
          {description ? (
            <span className="mt-1 block break-words text-[13px] leading-5 text-[var(--ecode-text-secondary)]">
              {description}
            </span>
          ) : null}
          {metaText ? (
            <span className="mt-1 block break-all text-[12px] text-[var(--ecode-text-secondary)]">{metaText}</span>
          ) : null}
        </span>
        <ArrowRight
          className="mt-1 h-4 w-4 flex-shrink-0 text-[var(--ecode-text-secondary)] transition group-hover:translate-x-1 group-hover:text-[var(--ecode-accent)]"
          aria-hidden
        />
      </Link>
    </li>
  );
}

function SearchResultGroup({
  id,
  title,
  count,
  children,
}: {
  id: 'pages' | 'help' | 'templates';
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} data-testid={`search-group-${id}`}>
      <h2 className="mb-3 break-words text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--ecode-text-secondary)]">
        {title}
        <span className="ml-2 font-normal normal-case tracking-normal">({count})</span>
      </h2>
      <ul className="divide-y divide-[var(--ecode-border)] rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
        {children}
      </ul>
    </section>
  );
}

export default function SearchRoute() {
  const results = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = resolveSearchDataSettingsLanguage(i18n.resolvedLanguage ?? i18n.language ?? results.language);
  const copy = getSearchCopy(language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  /*
   * Keep ?q= in sync with the input, debounced 150ms (replace) so typing
   * doesn't spam history and shared URLs restore the same results. Each URL
   * change re-runs the loader, so the search itself stays server-side.
   */
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          const trimmed = query.trim();

          if (trimmed) {
            next.set('q', trimmed);
          } else {
            next.delete('q');
          }

          return next;
        },
        { replace: true },
      );
    }, 150);

    return () => window.clearTimeout(handle);
  }, [query, setSearchParams]);

  const hasQuery = results.query !== '';

  const totalResults =
    results.pages.length + results.helpTopics.length + results.helpArticles.length + results.templates.length;

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page="search">
        <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
          <div className="container-responsive relative py-16 sm:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
                {copy.ui.eyebrow}
              </span>
              <h1 className="mkt-h1 mt-8 break-words text-[var(--ecode-text)]">{copy.ui.title}</h1>
              <p className="mkt-lead mt-6 text-[var(--ecode-text-secondary)]">{copy.ui.lead}</p>

              <form
                className="relative mx-auto mt-8 max-w-xl"
                role="search"
                onSubmit={(event) => event.preventDefault()}
                data-testid="form-site-search"
              >
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--ecode-text-secondary)]" />
                <input
                  type="search"
                  placeholder={copy.ui.placeholder}
                  aria-label={copy.ui.ariaLabel}
                  className="w-full min-h-[48px] rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-surface)] pl-12 pr-4 text-[15px] text-[var(--ecode-text)] focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{ ['--tw-ring-color' as string]: 'var(--ecode-accent)' }}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  data-testid="input-site-search"
                />
              </form>
            </div>
          </div>
        </section>

        <section className="container-responsive py-12 sm:py-16">
          <div className="mx-auto max-w-3xl">
            {!hasQuery && (
              <EmptyState icon={SearchIcon} title={copy.ui.emptyTitle} description={copy.ui.emptyDescription} />
            )}

            {hasQuery && totalResults === 0 && (
              <EmptyState
                icon={SearchIcon}
                title={interpolateSearchDataSettingsCopy(copy.ui.noResultsTitle, { query: results.query })}
                description={copy.ui.noResultsDescription}
                actionLabel={copy.ui.browseTemplates}
                to="/templates"
                secondaryActionLabel={copy.ui.openHelpCenter}
                secondaryTo="/help-center"
              />
            )}

            {hasQuery && totalResults > 0 && (
              <div className="flex flex-col gap-10">
                <p className="text-[14px] text-[var(--ecode-text-secondary)]" data-testid="text-search-summary">
                  {formatSearchDataSettingsPlural(
                    language,
                    totalResults,
                    {
                      one: copy.ui.summary_one,
                      other: copy.ui.summary_other,
                    },
                    { query: results.query },
                  )}
                </p>

                {results.pages.length > 0 && (
                  <SearchResultGroup id="pages" title={copy.ui.appPages} count={results.pages.length}>
                    {results.pages.map((page) => (
                      <SearchResultRow
                        key={page.path}
                        to={page.path}
                        icon={AppWindow}
                        title={page.title}
                        description={page.description}
                        meta={page.path}
                      />
                    ))}
                  </SearchResultGroup>
                )}

                {(results.helpTopics.length > 0 || results.helpArticles.length > 0) && (
                  <SearchResultGroup
                    id="help"
                    title={copy.ui.helpCenter}
                    count={results.helpTopics.length + results.helpArticles.length}
                  >
                    {results.helpTopics.map((topic) => (
                      <SearchResultRow
                        key={topic.title}
                        to="/help-center"
                        icon={LifeBuoy}
                        title={topic.title}
                        description={topic.description}
                      />
                    ))}
                    {results.helpArticles.map((article) => (
                      <SearchResultRow key={article} to="/help-center" icon={BookOpen} title={article} />
                    ))}
                  </SearchResultGroup>
                )}

                {results.templates.length > 0 && (
                  <SearchResultGroup id="templates" title={copy.ui.templates} count={results.templates.length}>
                    {results.templates.map((template) => (
                      <SearchResultRow
                        key={template.slug}
                        to={`/templates?q=${encodeURIComponent(template.lookupName)}`}
                        icon={LayoutTemplate}
                        title={template.name}
                        description={template.description}
                        meta={template.categoryName}
                      />
                    ))}
                  </SearchResultGroup>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
