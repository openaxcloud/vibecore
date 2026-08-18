import { GitFork, Play, Search, SearchX, Sparkles, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  formatPublicGalleryCopy,
  formatPublicGalleryNumber,
  formatPublicGalleryPercent,
  getPublicGalleryCopy,
  type PublicGalleryCopy,
} from '~/lib/i18n/catalogs/public-gallery';
import { getPublicTemplateTagLabel } from '~/lib/i18n/catalogs/public-template-tags';
import { classNames } from '~/utils/classNames';

/*
 * Public "Explore" gallery — E-Code's community/showcase page (Replit Explore
 * parity). It renders real published projects from the E-Code catalog (fed by
 * the /explore loader over listEcodeTemplates) with live search + category
 * filtering. No mock data: every card is a real catalog entry, and its stats
 * (stars/forks/runs) come from the same catalog the templates gallery uses.
 */

export type PublicExploreProject = {
  id: number;
  slug: string;
  name: string;
  description: string;
  language: string;
  category: string;
  categoryName: string;
  tags: string[];
  stars: number;
  forks: number;
  runs: number;
  author: string;
};

export type PublicExploreCategory = {
  slug: string;
  name: string;
  count: number;
};

type ExplorePageProps = {
  projects: PublicExploreProject[];
  categories: PublicExploreCategory[];
};

/* A signed-out visitor picking a project is routed to sign-in, then to fork it. */
function projectReturnTo(slug: string): string {
  return `/login?returnTo=${encodeURIComponent(`/projects/new?template=${slug}`)}`;
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
  language,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  language: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={classNames(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition',
        active
          ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)] text-white'
          : 'border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text-secondary)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-text)]',
      )}
    >
      {label}
      {typeof count === 'number' ? (
        <span className={classNames('text-[11px]', active ? 'text-white/80' : 'text-[var(--ecode-text-muted)]')}>
          {formatPublicGalleryNumber(language, count)}
        </span>
      ) : null}
    </button>
  );
}

function ProjectStat({
  icon,
  value,
  label,
  language,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  language: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] text-[var(--ecode-text-muted)]"
      title={`${formatPublicGalleryNumber(language, value)} ${label}`}
    >
      {icon}
      {formatPublicGalleryNumber(language, value, true)}
    </span>
  );
}

function ExploreProjectCard({
  project,
  copy,
  language,
}: {
  project: PublicExploreProject;
  copy: PublicGalleryCopy;
  language: string;
}) {
  return (
    <Link
      to={projectReturnTo(project.slug)}
      className="group flex flex-col rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 transition hover:border-[var(--ecode-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
      data-testid={`explore-project-${project.slug}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ecode-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ecode-text-secondary)]">
          {project.language}
        </span>
        <span className="text-[12px] text-[var(--ecode-text-muted)]">{project.categoryName}</span>
      </div>

      <h3 className="mt-3 text-[16px] font-bold text-[var(--ecode-text)] group-hover:text-[var(--ecode-accent-text)]">
        {project.name}
      </h3>
      <p className="mt-1.5 line-clamp-3 flex-1 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
        {project.description}
      </p>

      {project.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--ecode-background)] px-2 py-0.5 text-[11px] text-[var(--ecode-text-muted)]"
            >
              {getPublicTemplateTagLabel(tag, language)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-[var(--ecode-border)] pt-3">
        <span className="min-w-0 break-words text-[12px] text-[var(--ecode-text-muted)]">
          {formatPublicGalleryCopy(copy['publicGallery.card.author'], { author: project.author })}
        </span>
        <span className="flex items-center gap-3">
          <ProjectStat
            icon={<Star className="h-3.5 w-3.5" aria-hidden />}
            value={project.stars}
            label={copy[`publicGallery.stat.stars_${project.stars === 1 ? 'one' : 'other'}`]}
            language={language}
          />
          <ProjectStat
            icon={<GitFork className="h-3.5 w-3.5" aria-hidden />}
            value={project.forks}
            label={copy[`publicGallery.stat.forks_${project.forks === 1 ? 'one' : 'other'}`]}
            language={language}
          />
          <ProjectStat
            icon={<Play className="h-3.5 w-3.5" aria-hidden />}
            value={project.runs}
            label={copy[`publicGallery.stat.runs_${project.runs === 1 ? 'one' : 'other'}`]}
            language={language}
          />
        </span>
      </div>
    </Link>
  );
}

export function ExploreMarketingPage({ projects, categories }: ExplorePageProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getPublicGalleryCopy(language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const activeCategory = (searchParams.get('category') ?? 'all').trim().toLowerCase();

  // Keep ?q= in sync with the input, debounced so typing doesn't spam history.
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
        { replace: true, preventScrollReset: true },
      );
    }, 250);

    return () => window.clearTimeout(handle);
  }, [query, setSearchParams]);

  const setCategory = (slug: string) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);

        if (slug && slug !== 'all') {
          next.set('category', slug);
        } else {
          next.delete('category');
        }

        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const clearFilters = () => {
    setQuery('');
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        next.delete('q');
        next.delete('category');

        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const normalizedQuery = query.trim().toLowerCase();

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (activeCategory !== 'all' && project.category.toLowerCase() !== activeCategory) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableTags = project.tags.flatMap((tag) => [tag, getPublicTemplateTagLabel(tag, language)]);

      return [project.name, project.description, project.categoryName, project.language, ...searchableTags]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [projects, activeCategory, normalizedQuery, language]);

  const isFiltering = Boolean(normalizedQuery) || activeCategory !== 'all';
  const noMatches = filteredProjects.length === 0;

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-public-resource-page="explore">
        <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
          <div className="container-responsive relative py-20 sm:py-28">
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent-text)]">
                <Sparkles className="h-5 w-5" aria-hidden />
                {copy['publicGallery.explore.badge']}
              </span>
              <h1 className="mt-8 max-w-4xl mkt-h1 text-[var(--ecode-text)]">{copy['publicGallery.explore.title']}</h1>
              <p className="mt-6 max-w-3xl mkt-lead text-[var(--ecode-text-secondary)]">
                {copy['publicGallery.explore.description']}
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                {
                  label: copy['publicGallery.explore.metric.publicProjects'],
                  value: formatPublicGalleryNumber(language, projects.length),
                },
                {
                  label: copy['publicGallery.explore.metric.categories'],
                  value: formatPublicGalleryNumber(language, categories.length),
                },
                {
                  label: copy['publicGallery.explore.metric.forkReady'],
                  value: formatPublicGalleryPercent(language, 1),
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5"
                >
                  <p className="text-3xl font-bold text-[var(--ecode-text)]">{metric.value}</p>
                  <p className="mt-2 text-[13px] uppercase tracking-[0.18em] text-[var(--ecode-text-muted)]">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container-responsive py-16 sm:py-24">
          <div className="flex flex-col gap-4">
            <label className="relative block max-w-xl">
              <span className="sr-only">{copy['publicGallery.explore.searchLabel']}</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ecode-text-muted)]"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy['publicGallery.explore.searchPlaceholder']}
                className="min-h-[48px] w-full rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-11 text-[15px] text-[var(--ecode-text)] outline-none transition placeholder:text-[var(--ecode-text-muted)] focus:border-[var(--ecode-accent)]"
                data-testid="input-search-explore"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={copy['publicGallery.explore.clearSearch']}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--ecode-text-muted)] transition hover:text-[var(--ecode-text)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </label>

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={copy['publicGallery.explore.categoryFilter']}
            >
              <CategoryChip
                label={copy['publicGallery.explore.all']}
                active={activeCategory === 'all'}
                onClick={() => setCategory('all')}
                language={language}
              />
              {categories.map((category) => (
                <CategoryChip
                  key={category.slug}
                  label={category.name}
                  count={category.count}
                  active={activeCategory === category.slug.toLowerCase()}
                  onClick={() => setCategory(activeCategory === category.slug.toLowerCase() ? 'all' : category.slug)}
                  language={language}
                />
              ))}
            </div>
          </div>

          {noMatches ? (
            <div
              className="mt-10 rounded-lg border border-dashed border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-8 text-center"
              data-testid="explore-empty-state"
            >
              <SearchX className="mx-auto h-8 w-8 text-[var(--ecode-text-muted)]" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-[var(--ecode-text)]">
                {normalizedQuery
                  ? formatPublicGalleryCopy(copy['publicGallery.explore.emptyQuery'], { query: query.trim() })
                  : copy['publicGallery.explore.emptyCategory']}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
                {copy['publicGallery.explore.emptyDescription']}
              </p>
              {isFiltering ? (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--ecode-border)] bg-transparent px-5 py-3 text-[13px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent-text)]"
                  >
                    {copy['publicGallery.explore.clearFilters']}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {isFiltering ? (
                <p className="mt-6 text-[13px] text-[var(--ecode-text-muted)]" aria-live="polite">
                  {formatPublicGalleryCopy(
                    copy[`publicGallery.explore.matches_${filteredProjects.length === 1 ? 'one' : 'other'}`],
                    { count: formatPublicGalleryNumber(language, filteredProjects.length) },
                  )}
                </p>
              ) : null}
              <div className={classNames('grid gap-5 md:grid-cols-2 xl:grid-cols-3', isFiltering ? 'mt-5' : 'mt-10')}>
                {filteredProjects.map((project) => (
                  <ExploreProjectCard key={project.id} project={project} copy={copy} language={language} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
