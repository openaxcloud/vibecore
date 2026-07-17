import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Eye,
  Flag,
  GitFork,
  Grid2X2,
  ImageOff,
  List,
  LoaderCircle,
  Search,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';

export type GalleryModerationStatus = 'approved' | 'pending' | 'rejected';
export type GallerySort = 'featured' | 'newest' | 'most-remixed' | 'name';
export type TemplateGalleryView = 'grid' | 'list';

export type GalleryAuthor = {
  id?: string;
  name: string;
  username?: string;
  avatarUrl?: string | null;
  verified?: boolean;
};

export type GalleryRemixProvenance = {
  sourceAppId: string;
  sourceAppName: string;
  sourceAppSlug: string;
  sourceAuthorName?: string;
};

/**
 * Browser-safe projection of a published application. Files, secrets and
 * private project metadata deliberately do not belong in this model.
 */
export type GalleryApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  author: GalleryAuthor;
  artifactType: string;
  category: string;
  technologies: readonly string[];
  publishedAt: string;
  remixCount: number;
  reportCount: number;
  featured: boolean;
  remixAllowed: boolean;
  moderationStatus: GalleryModerationStatus;
  provenance?: GalleryRemixProvenance | null;
};

export type TemplateGalleryItem = GalleryApp;

type GalleryFilters = {
  artifactType: string;
  category: string;
  featuredOnly: boolean;
  includeUnapproved: boolean;
  query: string;
  technology?: string;
};

type TemplateGalleryProps = {
  apps?: readonly GalleryApp[];
  compact?: boolean;
  error?: string | null;
  firstPageHref?: string | null;
  getRemixHref?: (app: GalleryApp) => string;
  getSourceHref?: (app: GalleryApp) => string;
  getViewHref?: (app: GalleryApp) => string;
  includeUnapproved?: boolean;
  onRemix?: (app: GalleryApp) => Promise<void> | void;
  onReport?: (app: GalleryApp) => Promise<void> | void;
  onRetry?: () => void;
  onView?: (app: GalleryApp) => void;
  nextPageHref?: string | null;
  remixingAppId?: string | null;
  status?: 'loading' | 'ready' | 'error';
};

const compactNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, notation: 'compact' });
const publishedDate = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export function filterTemplateGallery(apps: readonly GalleryApp[], filters: GalleryFilters) {
  const normalizedArtifactType = normalize(filters.artifactType);
  const normalizedCategory = normalize(filters.category);
  const normalizedQuery = normalize(filters.query);
  const normalizedTechnology = normalize(filters.technology ?? '');

  return apps.filter((app) => {
    if (!filters.includeUnapproved && app.moderationStatus !== 'approved') {
      return false;
    }

    if (normalizedArtifactType && normalize(app.artifactType) !== normalizedArtifactType) {
      return false;
    }

    if (normalizedCategory && normalize(app.category) !== normalizedCategory) {
      return false;
    }

    if (
      normalizedTechnology &&
      !app.technologies.some((technology) => normalize(technology) === normalizedTechnology)
    ) {
      return false;
    }

    if (filters.featuredOnly && !app.featured) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return [
      app.name,
      app.description,
      app.author.name,
      app.author.username ?? '',
      app.artifactType,
      app.category,
      app.provenance?.sourceAppName ?? '',
      ...app.technologies,
    ].some((value) => normalize(value).includes(normalizedQuery));
  });
}

export function sortTemplateGallery(apps: readonly GalleryApp[], sort: GallerySort) {
  return [...apps].sort((left, right) => {
    if (sort === 'name') {
      return left.name.localeCompare(right.name, 'en');
    }

    if (sort === 'most-remixed') {
      return right.remixCount - left.remixCount || compareNewest(left, right);
    }

    if (sort === 'newest') {
      return compareNewest(left, right);
    }

    return (
      Number(right.featured) - Number(left.featured) || right.remixCount - left.remixCount || compareNewest(left, right)
    );
  });
}

export function templateGalleryFacets(apps: readonly GalleryApp[], includeUnapproved = false) {
  const visibleApps = includeUnapproved ? apps : apps.filter((app) => app.moderationStatus === 'approved');

  return {
    artifactTypes: uniqueSorted(visibleApps.map((app) => app.artifactType)),
    categories: uniqueSorted(visibleApps.map((app) => app.category)),
    technologies: uniqueSorted(visibleApps.flatMap((app) => [...app.technologies])),
  };
}

export function TemplateGallery({
  apps = [],
  compact = false,
  error = null,
  firstPageHref = null,
  getRemixHref = (app) => `/gallery/${encodeURIComponent(app.slug)}/remix`,
  getSourceHref = (app) =>
    app.provenance
      ? `/gallery/${encodeURIComponent(app.provenance.sourceAppSlug)}`
      : `/gallery/${encodeURIComponent(app.slug)}`,
  getViewHref = (app) => `/gallery/${encodeURIComponent(app.slug)}`,
  includeUnapproved = false,
  onRemix,
  onReport,
  onRetry,
  onView,
  nextPageHref = null,
  remixingAppId = null,
  status = 'ready',
}: TemplateGalleryProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = compact ? '' : (searchParams.get('q') ?? '');
  const [query, setQuery] = useState(queryParam);
  const category = compact ? '' : (searchParams.get('category') ?? '');
  const artifactType = compact ? '' : (searchParams.get('type') ?? '');
  const technology = compact ? '' : (searchParams.get('tech') ?? '');
  const sort = compact ? 'featured' : gallerySort(searchParams.get('sort'));
  const featuredOnly = compact ? false : searchParams.get('featured') === 'true';
  const view = compact ? 'grid' : galleryView(searchParams.get('view'));
  const [pendingRemixId, setPendingRemixId] = useState<string | null>(null);
  const [pendingReportId, setPendingReportId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

  useEffect(() => {
    if (compact) {
      return undefined;
    }

    const handle = window.setTimeout(() => {
      const trimmed = query.trim();

      if (trimmed === queryParam) {
        return;
      }

      setSearchParams((current) => withoutCursor(withSearchParam(current, 'q', trimmed)), {
        preventScrollReset: true,
        replace: true,
      });
    }, 120);

    return () => window.clearTimeout(handle);
  }, [compact, query, queryParam, setSearchParams]);

  const facets = useMemo(() => templateGalleryFacets(apps, includeUnapproved), [apps, includeUnapproved]);

  const visibleApps = useMemo(
    () =>
      sortTemplateGallery(
        filterTemplateGallery(apps, {
          artifactType,
          category,
          featuredOnly,
          includeUnapproved,
          query,
          technology,
        }),
        sort,
      ),
    [apps, artifactType, category, featuredOnly, includeUnapproved, query, sort, technology],
  );

  const hasFilters = Boolean(query.trim() || category || artifactType || technology || featuredOnly);
  const activeRemixId = remixingAppId ?? pendingRemixId;

  const setParam = (key: 'category' | 'featured' | 'sort' | 'tech' | 'type' | 'view', value: string) => {
    setSearchParams(
      (current) => {
        const next = withSearchParam(current, key, value, key === 'sort' ? 'featured' : key === 'view' ? 'grid' : '');

        return key === 'view' ? next : withoutCursor(next);
      },
      { preventScrollReset: true, replace: true },
    );
  };

  const resetFilters = () => {
    setQuery('');
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);

        for (const key of ['q', 'category', 'tech', 'type', 'featured', 'cursor']) {
          next.delete(key);
        }

        return next;
      },
      { preventScrollReset: true, replace: true },
    );
  };

  const remix = async (app: GalleryApp) => {
    if (!onRemix || !app.remixAllowed || activeRemixId) {
      return;
    }

    setActionError(null);
    setPendingRemixId(app.id);

    try {
      await onRemix(app);
    } catch (caughtError) {
      setActionError(errorMessage(caughtError, `Could not remix ${app.name}.`));
    } finally {
      setPendingRemixId(null);
    }
  };

  const report = async (app: GalleryApp) => {
    if (!onReport || pendingReportId) {
      return;
    }

    setActionError(null);
    setPendingReportId(app.id);

    try {
      await onReport(app);
    } catch (caughtError) {
      setActionError(errorMessage(caughtError, `Could not report ${app.name}.`));
    } finally {
      setPendingReportId(null);
    }
  };

  if (status === 'loading') {
    return <GalleryLoadingState compact={compact} />;
  }

  if (status === 'error') {
    return <GalleryErrorState error={error} onRetry={onRetry} />;
  }

  return (
    <section
      data-testid="template-gallery"
      data-view={view}
      aria-label="Community application gallery"
      className="min-w-0"
    >
      {!compact ? (
        <GalleryToolbar
          artifactType={artifactType}
          artifactTypes={facets.artifactTypes}
          categories={facets.categories}
          category={category}
          featuredOnly={featuredOnly}
          hasFilters={hasFilters}
          query={query}
          resultCount={visibleApps.length}
          sort={sort}
          technologies={facets.technologies}
          technology={technology}
          view={view}
          onClearQuery={() => setQuery('')}
          onQueryChange={setQuery}
          onReset={resetFilters}
          onSetParam={setParam}
        />
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error-text)]"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss gallery error"
            className="shrink-0 rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {visibleApps.length === 0 ? (
        <GalleryEmptyState filtered={hasFilters} onReset={resetFilters} />
      ) : (
        <>
          <div className={classNames(view === 'grid' ? 'grid gap-4 sm:grid-cols-2 2xl:grid-cols-3' : 'grid gap-3')}>
            {visibleApps.map((app, index) => (
              <GalleryAppCard
                key={app.id}
                app={app}
                eagerThumbnail={index < 3}
                getRemixHref={getRemixHref}
                getSourceHref={getSourceHref}
                getViewHref={getViewHref}
                list={view === 'list'}
                onRemix={onRemix ? remix : undefined}
                onReport={onReport ? report : undefined}
                onView={onView}
                remixPending={activeRemixId === app.id}
                remixLocked={Boolean(activeRemixId)}
                reportPending={pendingReportId === app.id}
              />
            ))}
          </div>
          {!compact && (firstPageHref || nextPageHref) ? (
            <nav
              aria-label="Gallery pages"
              className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-3"
            >
              <p className="text-xs text-bolt-elements-textTertiary">Showing {visibleApps.length} apps on this page</p>
              <div className="flex items-center gap-2">
                {firstPageHref ? (
                  <Button variant="outline" className="min-h-11 px-4" _asChild>
                    <Link to={firstPageHref} preventScrollReset>
                      First page
                    </Link>
                  </Button>
                ) : null}
                {nextPageHref ? (
                  <Button variant="primary" className="min-h-11 px-4" _asChild>
                    <Link to={nextPageHref} preventScrollReset>
                      Next page
                    </Link>
                  </Button>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}

function GalleryToolbar({
  artifactType,
  artifactTypes,
  categories,
  category,
  featuredOnly,
  hasFilters,
  query,
  resultCount,
  sort,
  technologies,
  technology,
  view,
  onClearQuery,
  onQueryChange,
  onReset,
  onSetParam,
}: {
  artifactType: string;
  artifactTypes: readonly string[];
  categories: readonly string[];
  category: string;
  featuredOnly: boolean;
  hasFilters: boolean;
  query: string;
  resultCount: number;
  sort: GallerySort;
  technologies: readonly string[];
  technology: string;
  view: TemplateGalleryView;
  onClearQuery: () => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSetParam: (key: 'category' | 'featured' | 'sort' | 'tech' | 'type' | 'view', value: string) => void;
}) {
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
      <div className="grid gap-3 border-b border-bolt-elements-borderColor p-3 sm:p-4 lg:grid-cols-2 2xl:grid-cols-[minmax(18rem,1.5fr)_minmax(8rem,.72fr)_minmax(8rem,.72fr)_minmax(8rem,.72fr)_minmax(8rem,.72fr)]">
        <label className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-bolt-elements-textTertiary">
            Search the gallery
          </span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bolt-elements-textTertiary"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="App, creator or technology"
              className="h-11 w-full appearance-none rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 pl-10 pr-11 text-sm text-bolt-elements-textPrimary outline-none transition-colors placeholder:text-bolt-elements-textTertiary hover:border-bolt-elements-borderColorActive focus-visible:border-[var(--vc-ide-accent-action)] focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
              aria-label="Search published apps"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={onClearQuery}
                aria-label="Clear app search"
                className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-md text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vc-ide-accent-action)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </span>
        </label>

        <GallerySelect
          label="Category"
          value={category}
          options={categories}
          emptyLabel="All categories"
          onChange={(value) => onSetParam('category', value)}
        />
        <GallerySelect
          label="Artifact type"
          value={artifactType}
          options={artifactTypes}
          emptyLabel="All artifact types"
          onChange={(value) => onSetParam('type', value)}
        />
        <GallerySelect
          label="Technology"
          value={technology}
          options={technologies}
          emptyLabel="All technologies"
          onChange={(value) => onSetParam('tech', value)}
        />
        <GallerySelect
          label="Sort by"
          value={sort}
          options={['featured', 'newest', 'most-remixed', 'name']}
          optionLabels={{ featured: 'Featured', name: 'Name', newest: 'Newest', 'most-remixed': 'Most remixed' }}
          onChange={(value) => onSetParam('sort', value)}
        />
      </div>

      <div className="flex min-h-[54px] flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p aria-live="polite" aria-atomic="true" className="mr-1 text-xs text-bolt-elements-textTertiary">
            <span className="font-semibold text-bolt-elements-textPrimary">{resultCount}</span>{' '}
            {resultCount === 1 ? 'published app' : 'published apps'}
          </p>
          <button
            type="button"
            aria-pressed={featuredOnly}
            onClick={() => onSetParam('featured', featuredOnly ? '' : 'true')}
            className={classNames(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]',
              featuredOnly
                ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]'
                : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Featured only
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <div
            className="inline-flex rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-0.5"
            role="group"
            aria-label="Application gallery view"
          >
            <ViewButton
              label="Grid view"
              active={view === 'grid'}
              onClick={() => onSetParam('view', 'grid')}
              icon={Grid2X2}
            />
            <ViewButton
              label="List view"
              active={view === 'list'}
              onClick={() => onSetParam('view', 'list')}
              icon={List}
            />
          </div>
          <button
            type="button"
            onClick={onReset}
            disabled={!hasFilters}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm font-medium text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}

function GallerySelect({
  emptyLabel,
  label,
  onChange,
  optionLabels,
  options,
  value,
}: {
  emptyLabel?: string;
  label: string;
  onChange: (value: string) => void;
  optionLabels?: Readonly<Record<string, string>>;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-bolt-elements-textTertiary">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="h-11 w-full appearance-none truncate rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 pl-3 pr-9 text-sm text-bolt-elements-textPrimary outline-none transition-colors hover:border-bolt-elements-borderColorActive focus-visible:border-[var(--vc-ide-accent-action)] focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]"
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {optionLabels?.[option] ?? displayFacet(option)}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bolt-elements-textTertiary"
          aria-hidden
        />
      </span>
    </label>
  );
}

function GalleryAppCard({
  app,
  eagerThumbnail,
  getRemixHref,
  getSourceHref,
  getViewHref,
  list,
  onRemix,
  onReport,
  onView,
  remixLocked,
  remixPending,
  reportPending,
}: {
  app: GalleryApp;
  eagerThumbnail: boolean;
  getRemixHref: (app: GalleryApp) => string;
  getSourceHref: (app: GalleryApp) => string;
  getViewHref: (app: GalleryApp) => string;
  list: boolean;
  onRemix?: (app: GalleryApp) => Promise<void> | void;
  onReport?: (app: GalleryApp) => Promise<void> | void;
  onView?: (app: GalleryApp) => void;
  remixLocked: boolean;
  remixPending: boolean;
  reportPending: boolean;
}) {
  return (
    <article
      data-testid="template-card"
      data-gallery-app-id={app.id}
      data-moderation-status={app.moderationStatus}
      aria-busy={remixPending || undefined}
      className={classNames(
        'group min-w-0 overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-background-depth-3 hover:shadow-[var(--vc-ui-shadow-md)] motion-reduce:transform-none',
        list
          ? 'flex flex-col md:grid md:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(12rem,14rem)]'
          : 'flex flex-col',
      )}
    >
      <GalleryThumbnail app={app} eager={eagerThumbnail} list={list} />

      <div className={classNames('flex min-w-0 flex-1 flex-col p-4', list && 'md:p-5')}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-bolt-elements-textTertiary">
              <span>{displayFacet(app.artifactType)}</span>
              <span aria-hidden>•</span>
              <span>{displayFacet(app.category)}</span>
            </div>
            <h2 className="mt-1.5 line-clamp-1 text-lg font-semibold text-bolt-elements-textPrimary" title={app.name}>
              {app.name}
            </h2>
          </div>
          <GalleryStatusBadge app={app} />
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-bolt-elements-textTertiary">
          <AuthorAvatar author={app.author} />
          <span className="truncate">
            by <span className="font-medium text-bolt-elements-textSecondary">{app.author.name}</span>
            {app.author.username ? <span> @{app.author.username}</span> : null}
          </span>
        </div>

        <p
          className={classNames(
            'mt-3 text-sm leading-6 text-bolt-elements-textSecondary',
            list ? 'line-clamp-2' : 'line-clamp-3 min-h-[72px]',
          )}
        >
          {app.description}
        </p>

        {app.provenance ? (
          <p className="mt-3 min-w-0 text-xs text-bolt-elements-textTertiary">
            <GitFork className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            Remixed from{' '}
            <Link
              to={getSourceHref(app)}
              className="font-medium text-bolt-elements-textSecondary underline-offset-2 hover:text-bolt-elements-textPrimary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              {app.provenance.sourceAppName}
            </Link>
            {app.provenance.sourceAuthorName ? ` by ${app.provenance.sourceAuthorName}` : null}
          </p>
        ) : null}

        <div
          className="mt-auto flex flex-wrap gap-1.5 pt-4"
          aria-label={`Technologies: ${app.technologies.join(', ')}`}
        >
          {app.technologies.slice(0, list ? 8 : 5).map((technology) => (
            <span
              key={technology}
              className="inline-flex min-h-7 items-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-[11px] font-medium text-bolt-elements-textSecondary"
            >
              {technology}
            </span>
          ))}
          {app.technologies.length > (list ? 8 : 5) ? (
            <span className="inline-flex min-h-7 items-center px-1 text-[11px] font-medium text-bolt-elements-textTertiary">
              +{app.technologies.length - (list ? 8 : 5)}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={classNames(
          'flex flex-col justify-between gap-3 border-t border-bolt-elements-borderColor px-4 py-3',
          list && 'md:border-l md:border-t-0 md:px-4 md:py-5',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-bolt-elements-textTertiary md:justify-start">
          <span
            className="inline-flex items-center gap-1.5"
            title={`Published ${formatPublishedDate(app.publishedAt)}`}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {formatPublishedDate(app.publishedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5" title={`${app.remixCount.toLocaleString()} remixes`}>
            <GitFork className="h-3.5 w-3.5" aria-hidden />
            {compactNumber.format(app.remixCount)}
          </span>
          {app.reportCount > 0 ? (
            <span className="inline-flex items-center gap-1.5" title={`${app.reportCount.toLocaleString()} reports`}>
              <Flag className="h-3.5 w-3.5" aria-hidden />
              {compactNumber.format(app.reportCount)}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          <ViewAction app={app} getViewHref={getViewHref} onView={onView} />
          <RemixAction
            app={app}
            getRemixHref={getRemixHref}
            locked={remixLocked}
            onRemix={onRemix}
            pending={remixPending}
          />
        </div>

        {onReport ? (
          <button
            type="button"
            onClick={() => void onReport(app)}
            disabled={reportPending}
            aria-busy={reportPending || undefined}
            aria-label={reportPending ? `Reporting ${app.name}` : `Report ${app.name}`}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-1 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] disabled:cursor-wait disabled:opacity-60"
          >
            {reportPending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Flag className="h-3.5 w-3.5" aria-hidden />
            )}
            {reportPending ? 'Reporting…' : 'Report'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function GalleryThumbnail({ app, eager, list }: { app: GalleryApp; eager: boolean; list: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={classNames(
        'relative aspect-[16/10] min-w-0 overflow-hidden border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
        list && 'md:h-full md:min-h-52 md:self-stretch md:border-b-0 md:border-r',
      )}
    >
      {app.thumbnailUrl && !loaded && !failed ? (
        <div
          className="absolute inset-0 animate-pulse bg-bolt-elements-background-depth-3 motion-reduce:animate-none"
          aria-label={`Loading preview for ${app.name}`}
          role="status"
        />
      ) : null}
      {!app.thumbnailUrl || failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,var(--bolt-elements-background-depth-3),var(--bolt-elements-background-depth-1)_70%)] text-bolt-elements-textTertiary">
          <ImageOff className="h-5 w-5" aria-hidden />
          <span className="text-xs">Preview unavailable</span>
        </div>
      ) : null}
      {app.thumbnailUrl ? (
        <img
          data-testid="template-thumbnail"
          src={app.thumbnailUrl}
          alt={`Preview of ${app.name}`}
          width={1280}
          height={800}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={classNames(
            'h-full w-full object-cover transition-[opacity,transform] duration-300 motion-reduce:transition-none',
            loaded && !failed ? 'opacity-100 group-hover:scale-[1.02] motion-reduce:transform-none' : 'opacity-0',
          )}
        />
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/[0.04]"
        aria-hidden
      />
      <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
          <Eye className="h-3 w-3" aria-hidden />
          Live app
        </span>
        {!app.remixAllowed ? (
          <span className="rounded-md border border-white/15 bg-black/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            View only
          </span>
        ) : null}
      </div>
    </div>
  );
}

function GalleryStatusBadge({ app }: { app: GalleryApp }) {
  if (app.moderationStatus === 'pending') {
    return (
      <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 text-[11px] font-semibold text-[var(--status-warning-text)]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        Review
      </span>
    );
  }

  if (app.moderationStatus === 'rejected') {
    return (
      <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2 text-[11px] font-semibold text-[var(--status-error-text)]">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        Hidden
      </span>
    );
  }

  if (app.featured) {
    return (
      <span className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 text-[11px] font-semibold text-[var(--status-warning-text)]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Featured
      </span>
    );
  }

  if (app.author.verified) {
    return (
      <span
        aria-label="Verified creator"
        title="Verified creator"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]"
      >
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  }

  return (
    <span
      aria-label="Moderation approved"
      title="Moderation approved"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textTertiary"
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

function AuthorAvatar({ author }: { author: GalleryAuthor }) {
  if (author.avatarUrl) {
    return (
      <img
        src={author.avatarUrl}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-[10px] font-bold text-bolt-elements-textSecondary"
    >
      {initials(author.name)}
    </span>
  );
}

function ViewAction({
  app,
  getViewHref,
  onView,
}: {
  app: GalleryApp;
  getViewHref: (app: GalleryApp) => string;
  onView?: (app: GalleryApp) => void;
}) {
  if (onView) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => onView(app)}
        aria-label={`View ${app.name}`}
        className="min-h-11 w-full gap-2 px-3"
      >
        <Eye className="h-4 w-4" aria-hidden />
        View
      </Button>
    );
  }

  return (
    <Button variant="outline" className="min-h-11 w-full gap-2 px-3" _asChild>
      <Link to={getViewHref(app)} aria-label={`View ${app.name}`}>
        <Eye className="h-4 w-4" aria-hidden />
        View
      </Link>
    </Button>
  );
}

function RemixAction({
  app,
  getRemixHref,
  locked,
  onRemix,
  pending,
}: {
  app: GalleryApp;
  getRemixHref: (app: GalleryApp) => string;
  locked: boolean;
  onRemix?: (app: GalleryApp) => Promise<void> | void;
  pending: boolean;
}) {
  const disabled = !app.remixAllowed || locked;
  const label = !app.remixAllowed ? 'Remix disabled' : pending ? 'Remixing…' : 'Remix';

  if (onRemix || disabled) {
    return (
      <Button
        type="button"
        variant="primary"
        onClick={onRemix ? () => void onRemix(app) : undefined}
        disabled={disabled}
        aria-label={
          !app.remixAllowed
            ? `${app.name} cannot be remixed by its creator settings`
            : pending
              ? `Remixing ${app.name}`
              : `Remix ${app.name}`
        }
        aria-busy={pending || undefined}
        title={!app.remixAllowed ? 'The creator disabled remixing for this app.' : undefined}
        className="min-h-11 w-full gap-2 px-3"
      >
        {pending ? (
          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <GitFork className="h-4 w-4" aria-hidden />
        )}
        {label}
      </Button>
    );
  }

  return (
    <Button variant="primary" className="min-h-11 w-full gap-2 px-3" _asChild>
      <Link to={getRemixHref(app)} aria-label={`Remix ${app.name}`}>
        <GitFork className="h-4 w-4" aria-hidden />
        Remix
      </Link>
    </Button>
  );
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Grid2X2;
  label: string;
  onClick: () => void;
}) {
  const ViewIcon = icon;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={classNames(
        'inline-flex h-10 w-10 items-center justify-center rounded-[5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vc-ide-accent-action)]',
        active
          ? 'bg-bolt-elements-background-depth-3 text-[var(--vc-ide-accent-action)] shadow-sm'
          : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary',
      )}
    >
      <ViewIcon className="h-4 w-4" aria-hidden />
    </button>
  );
}

function GalleryLoadingState({ compact }: { compact: boolean }) {
  return (
    <section
      data-testid="template-gallery"
      role="status"
      aria-busy="true"
      aria-label="Loading published applications"
      className="min-w-0"
    >
      <span className="sr-only">Loading published applications</span>
      {!compact ? (
        <div
          className="mb-5 h-40 animate-pulse rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3" aria-hidden>
        {Array.from({ length: compact ? 3 : 6 }, (_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
          >
            <div className="aspect-[16/10] animate-pulse bg-bolt-elements-background-depth-3 motion-reduce:animate-none" />
            <div className="space-y-3 p-4">
              <div className="h-3 w-2/5 rounded bg-bolt-elements-background-depth-3" />
              <div className="h-5 w-3/4 rounded bg-bolt-elements-background-depth-3" />
              <div className="h-14 rounded bg-bolt-elements-background-depth-3" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GalleryErrorState({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  return (
    <section
      data-testid="template-gallery"
      role="alert"
      className="rounded-xl border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-5 py-10 text-center"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--status-error-border)] text-[var(--status-error-text)]">
        <ShieldAlert className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">The Gallery could not load</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-bolt-elements-textSecondary">
        {error || 'Published applications are temporarily unavailable. Your projects are not affected.'}
      </p>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-5 min-h-11 px-4">
          Try again
        </Button>
      ) : null}
    </section>
  );
}

function GalleryEmptyState({ filtered, onReset }: { filtered: boolean; onReset: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-5 py-12 text-center sm:px-8">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textTertiary">
        <SearchX className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-bolt-elements-textPrimary">
        {filtered ? 'No published apps match' : 'No apps have been published yet'}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-bolt-elements-textSecondary">
        {filtered
          ? 'Try a broader search, another category, or include apps outside the featured collection.'
          : 'Approved community apps will appear here when they are ready to view and remix.'}
      </p>
      {filtered ? (
        <Button type="button" variant="outline" onClick={onReset} className="mt-5 min-h-11 px-4">
          Reset filters
        </Button>
      ) : null}
    </div>
  );
}

function compareNewest(left: GalleryApp, right: GalleryApp) {
  return dateValue(right.publishedAt) - dateValue(left.publishedAt) || left.name.localeCompare(right.name, 'en');
}

function dateValue(value: string) {
  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPublishedDate(value: string) {
  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : publishedDate.format(parsed);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function gallerySort(value: string | null): GallerySort {
  return value === 'newest' || value === 'most-remixed' || value === 'name' ? value : 'featured';
}

function galleryView(value: string | null): TemplateGalleryView {
  return value === 'list' ? 'list' : 'grid';
}

function withSearchParam(current: URLSearchParams, key: string, value: string, defaultValue = '') {
  const next = new URLSearchParams(current);

  if (value && value !== defaultValue) {
    next.set(key, value);
  } else {
    next.delete(key);
  }

  return next;
}

function withoutCursor(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  next.delete('cursor');

  return next;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values.filter((value) => value.trim()))].sort((left, right) => left.localeCompare(right, 'en'));
}

function displayFacet(value: string) {
  const labels: Readonly<Record<string, string>> = {
    ai: 'AI',
    crm: 'CRM',
    saas: 'SaaS',
    ui: 'UI',
  };

  const normalized = normalize(value);

  if (labels[normalized]) {
    return labels[normalized];
  }

  return value
    .trim()
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function initials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}
