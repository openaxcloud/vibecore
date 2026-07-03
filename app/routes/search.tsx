import { AppWindow, ArrowRight, BookOpen, LayoutTemplate, LifeBuoy, Search as SearchIcon } from 'lucide-react';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link, useLoaderData, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { makeMarketingMeta, marketingPages } from '~/components/marketing/EcodeMarketingPages';
import {
  filterHelpArticles,
  filterHelpTopics,
  normalizeHelpQuery,
  HELP_POPULAR_ARTICLES,
  HELP_TOPICS,
} from '~/components/marketing/ecode-exact/pages/help-search';
import { EmptyState } from '~/components/ui/EmptyState';
import { getEcodeTemplateCategories, listEcodeTemplates } from '~/lib/marketing/ecode-template-catalog.server';

export const meta = makeMarketingMeta(marketingPages.search);

export interface AppPageIndexEntry {
  title: string;
  description: string;
  path: string;
}

/*
 * Honest static index of the app's own user-facing pages. Every path below is
 * a real route in app/routes; titles mirror the navigation so search matches
 * what users actually see.
 */
export const APP_PAGE_INDEX: AppPageIndexEntry[] = [
  {
    title: 'Dashboard',
    path: '/dashboard',
    description: 'Workspace home with your recent projects and quick actions.',
  },
  {
    title: 'Projects',
    path: '/projects',
    description: 'All projects across your organizations, with search and filters.',
  },
  {
    title: 'New project',
    path: '/projects/new',
    description: 'Start a new project from a prompt, a template or an import.',
  },
  {
    title: 'Templates',
    path: '/templates',
    description: 'Starter template gallery for web apps, APIs, mobile and AI agents.',
  },
  {
    title: 'Deployments',
    path: '/deployments',
    description: 'Published deployments, domains and release status.',
  },
  {
    title: 'Usage',
    path: '/usage',
    description: 'Compute, storage and AI usage against your plan limits.',
  },
  {
    title: 'Billing',
    path: '/billing',
    description: 'Plan, payment method and subscription management.',
  },
  {
    title: 'Invoices',
    path: '/invoices',
    description: 'Invoice history and downloads.',
  },
  {
    title: 'Teams',
    path: '/team',
    description: 'Team plans, collaboration and enterprise controls.',
  },
  {
    title: 'Settings',
    path: '/settings',
    description: 'Account, workspace and notification settings.',
  },
  {
    title: 'Account settings',
    path: '/account-settings',
    description: 'Profile, security and account management.',
  },
  {
    title: 'API keys',
    path: '/api-keys',
    description: 'Create and manage API keys for programmatic access.',
  },
  {
    title: 'Support',
    path: '/support',
    description: 'Contact the support team and find support resources.',
  },
  {
    title: 'Docs',
    path: '/docs',
    description: 'Product documentation and guides.',
  },
  {
    title: 'Help Center',
    path: '/help-center',
    description: 'Browse help topics and popular articles.',
  },
  {
    title: 'Community',
    path: '/community',
    description: 'Community posts, examples and discussions.',
  },
  {
    title: 'Pricing',
    path: '/pricing',
    description: 'Plans for individuals, teams and enterprise deployments.',
  },
  {
    title: 'Marketplace',
    path: '/marketplace',
    description: 'Marketplace templates and community starters.',
  },
];

const MAX_RESULTS_PER_SOURCE = 8;

/**
 * Server-side search over the real corpora available without new backends:
 * the app's own page index, the canonical Help Center topics/articles and the
 * public template catalog. An empty query returns empty groups so the page
 * renders its "type to search" state instead of dumping every corpus.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = normalizeHelpQuery(url.searchParams.get('q') ?? '');

  if (query === '') {
    return {
      query,
      pages: [] as AppPageIndexEntry[],
      helpTopics: [] as typeof HELP_TOPICS,
      helpArticles: [] as string[],
      templates: [] as Array<{ slug: string; name: string; description: string; categoryName: string }>,
    };
  }

  const categoryNames = new Map(getEcodeTemplateCategories().map((category) => [category.slug, category.name]));

  return {
    query,
    pages: filterHelpTopics(APP_PAGE_INDEX, query).slice(0, MAX_RESULTS_PER_SOURCE),
    helpTopics: filterHelpTopics(HELP_TOPICS, query).slice(0, MAX_RESULTS_PER_SOURCE),
    helpArticles: filterHelpArticles(HELP_POPULAR_ARTICLES, query).slice(0, MAX_RESULTS_PER_SOURCE),
    templates: listEcodeTemplates({ query })
      .slice(0, MAX_RESULTS_PER_SOURCE)
      .map((template) => ({
        slug: template.slug,
        name: template.name,
        description: template.description,
        categoryName: categoryNames.get(template.category) ?? template.category,
      })),
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
          <span className="block text-[15px] font-semibold">{title}</span>
          {description ? (
            <span className="mt-1 block text-[13px] leading-5 text-[var(--ecode-text-secondary)]">{description}</span>
          ) : null}
          {metaText ? (
            <span className="mt-1 block text-[12px] text-[var(--ecode-text-secondary)]">{metaText}</span>
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

function SearchResultGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={title} data-testid={`search-group-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--ecode-text-secondary)]">
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
                Discovery
              </span>
              <h1 className="mkt-h1 mt-8 text-[var(--ecode-text)]">Search E-Code</h1>
              <p className="mkt-lead mt-6 text-[var(--ecode-text-secondary)]">
                Search app pages, Help Center topics and starter templates from one place.
              </p>

              <form
                className="relative mx-auto mt-8 max-w-xl"
                role="search"
                onSubmit={(event) => event.preventDefault()}
                data-testid="form-site-search"
              >
                <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--ecode-text-secondary)]" />
                <input
                  type="search"
                  placeholder="Search pages, help topics and templates..."
                  aria-label="Search E-Code"
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
              <EmptyState
                icon={SearchIcon}
                title="Search E-Code"
                description="Type above to search app pages, Help Center topics and starter templates."
              />
            )}

            {hasQuery && totalResults === 0 && (
              <EmptyState
                icon={SearchIcon}
                title={`No results for “${results.query}”`}
                description="Try a different search term, or browse the template gallery and Help Center directly."
                actionLabel="Browse templates"
                to="/templates"
                secondaryActionLabel="Open Help Center"
                secondaryTo="/help-center"
              />
            )}

            {hasQuery && totalResults > 0 && (
              <div className="flex flex-col gap-10">
                <p className="text-[14px] text-[var(--ecode-text-secondary)]" data-testid="text-search-summary">
                  {totalResults} {totalResults === 1 ? 'result' : 'results'} for &ldquo;{results.query}&rdquo;
                </p>

                {results.pages.length > 0 && (
                  <SearchResultGroup title="App pages" count={results.pages.length}>
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
                    title="Help Center"
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
                  <SearchResultGroup title="Templates" count={results.templates.length}>
                    {results.templates.map((template) => (
                      <SearchResultRow
                        key={template.slug}
                        to={`/templates?q=${encodeURIComponent(template.name)}`}
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
