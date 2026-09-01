import {
  ArrowRight,
  Award,
  BookOpen,
  Bookmark,
  Calendar,
  Code2,
  Heart,
  Layers,
  MessageSquare,
  Plus,
  Rocket,
  Search,
  SearchX,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import {
  SiAngular,
  SiAnthropic,
  SiAstro,
  SiExpo,
  SiFastify,
  SiFramer,
  SiJavascript,
  SiNextdotjs,
  SiNodedotjs,
  SiOpenai,
  SiPostgresql,
  SiPrisma,
  SiQwik,
  SiReact,
  SiRemix,
  SiShadcnui,
  SiSolid,
  SiSvelte,
  SiTailwindcss,
  SiTypescript,
  SiVite,
  SiVuedotjs,
} from 'react-icons/si';
import { Link, useSearchParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { resolveTechToken } from '~/components/marketing/template-tech-icon';
import { getMarketingPublicResourceCopy } from '~/lib/i18n/catalogs/marketing-public-resource';
import { getPublicTemplateTagLabel } from '~/lib/i18n/catalogs/public-template-tags';
import { classNames } from '~/utils/classNames';

export type PublicTemplateCard = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  categoryName: string;
  difficulty: string;
  featured: boolean;
  trending: boolean;
  technologies: string[];
  tags: string[];
  updatedAt: string;
};

export type PublicTemplateCategory = {
  slug: string;
  name: string;
  count: number;
};

export type PublicCommunityPost = {
  id: string;
  title: string;
  summary: string;
  content: string;
  authorName: string;
  authorHandle: string;
  authorInitials: string;
  authorReputation: number;
  category: string;
  categoryName: string;
  tags: string[];
  tagLabels?: string[];
  likes: number;
  comments: number;
  views: number;
  updatedAt: string;
};

export type PublicCommunityCategory = {
  id: string;
  name: string;
  postCount: number;
};

export type PublicCommunityChallenge = {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  participants: number;
  submissions: number;
  deadline: string;
};

export type PublicCommunityContributor = {
  id: string;
  name: string;
  handle: string;
  rank: number;
  score: number;
  badge: string;
};

export type PublicCommunityEvent = {
  id: string;
  title: string;
  description: string;
  date: string;
};

type TemplatesPageProps = {
  categories: PublicTemplateCategory[];
  templates: PublicTemplateCard[];
};

type CommunityPageProps = {
  posts: PublicCommunityPost[];
  categories: PublicCommunityCategory[];
  challenges: PublicCommunityChallenge[];
  contributors: PublicCommunityContributor[];
  events: PublicCommunityEvent[];
};

function loginReturnTo(returnTo: string) {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function templateProjectReturnTo(templateSlug: string) {
  return loginReturnTo(`/projects/new?template=${templateSlug}`);
}

function publicLocale(language?: string | null) {
  return language?.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-GB';
}

function formatPublicNumber(value: number, language?: string | null) {
  return new Intl.NumberFormat(publicLocale(language)).format(value);
}

function formatPublicDate(value: string, language?: string | null) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(publicLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** How many tag filter chips to derive from the catalog (most frequent tags first). */
const TEMPLATE_TAG_CHIP_LIMIT = 12;

const communityPillarIcons = {
  help: Rocket,
  showcases: Sparkles,
  challenges: Trophy,
} as const;

export function TemplatesMarketingPage({ categories, templates }: TemplatesPageProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingPublicResourceCopy(language).templates;
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const activeTag = (searchParams.get('tag') ?? '').trim().toLowerCase();

  /*
   * Keep ?q= in sync with the input, debounced 250ms so typing doesn't spam
   * history (replace) and shared URLs restore the same filtered gallery.
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
        { replace: true, preventScrollReset: true },
      );
    }, 250);

    return () => window.clearTimeout(handle);
  }, [query, setSearchParams]);

  const setActiveTag = (tag: string | null) => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);

        if (tag) {
          next.set('tag', tag);
        } else {
          next.delete('tag');
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
        next.delete('tag');

        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  // Chips come from the real tags present in the catalog, most frequent first.
  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();

    for (const template of templates) {
      for (const tag of template.tags) {
        const normalized = tag.trim().toLowerCase();

        if (normalized) {
          counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
        }
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TEMPLATE_TAG_CHIP_LIMIT)
      .map(([tag]) => tag);
  }, [templates]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      if (activeTag && !template.tags.some((tag) => tag.trim().toLowerCase() === activeTag)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableTags = template.tags.flatMap((tag) => [tag, getPublicTemplateTagLabel(tag, language)]);

      return [template.name, template.description, template.categoryName, ...template.technologies, ...searchableTags]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [templates, activeTag, normalizedQuery, language]);

  const isFiltering = Boolean(normalizedQuery) || Boolean(activeTag);
  const noMatches = isFiltering && filteredTemplates.length === 0;

  const featuredTemplates = filteredTemplates.filter((template) => template.featured).slice(0, 6);
  const remainingTemplates = filteredTemplates.filter((template) => !template.featured).slice(0, 6);

  // While filtering, show every match in one grid instead of the curated featured/secondary split.
  const visibleTemplates = isFiltering
    ? filteredTemplates
    : featuredTemplates.length > 0
      ? featuredTemplates
      : filteredTemplates.slice(0, 6);
  const secondaryTemplates = isFiltering
    ? []
    : remainingTemplates.length > 0
      ? remainingTemplates
      : filteredTemplates.slice(6, 12);

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-public-resource-page="templates">
        <ResourceHero
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          description={copy.hero.description}
          primaryAction={{ label: copy.hero.primary, to: '#featured-templates' }}
          secondaryAction={{ label: copy.hero.secondary, to: '/docs' }}
          metrics={[
            { label: copy.hero.metrics[0], value: formatPublicNumber(templates.length, language) },
            { label: copy.hero.metrics[1], value: formatPublicNumber(categories.length, language) },
            { label: copy.hero.metrics[2], value: '100%' },
          ]}
          icon={<Layers className="h-5 w-5" aria-hidden />}
        />

        <section id="featured-templates" className="container-responsive py-16 sm:py-24">
          <SectionHeader
            eyebrow={copy.gallery.eyebrow}
            title={copy.gallery.title}
            description={copy.gallery.description}
          />

          <div className="mt-8 flex flex-col gap-4">
            <label className="relative block max-w-xl">
              <span className="sr-only">{copy.searchLabel}</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ecode-text-muted)]"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                className="min-h-[48px] w-full rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-11 text-[15px] text-[var(--ecode-text)] outline-none transition placeholder:text-[var(--ecode-text-muted)] focus:border-[var(--ecode-accent)]"
                data-testid="input-search-templates"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={copy.clearSearch}
                  className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--ecode-text-muted)] transition hover:text-[var(--ecode-text)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </label>

            <div className="flex flex-wrap gap-2" role="group" aria-label={copy.tagFilterLabel}>
              <TemplateTagChip label={copy.all} active={!activeTag} onClick={() => setActiveTag(null)} />
              {availableTags.map((tag) => (
                <TemplateTagChip
                  key={tag}
                  label={getPublicTemplateTagLabel(tag, language)}
                  active={activeTag === tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                />
              ))}
            </div>
          </div>

          {noMatches ? (
            <div
              className="mt-10 rounded-lg border border-dashed border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-8 text-center"
              data-testid="templates-empty-state"
            >
              <SearchX className="mx-auto h-8 w-8 text-[var(--ecode-text-muted)]" aria-hidden />
              <h3 className="mt-4 text-lg font-bold text-[var(--ecode-text)]">
                {normalizedQuery
                  ? `${copy.noQueryMatchPrefix}${query.trim()}${copy.noQueryMatchSuffix}`
                  : copy.noTagMatch}
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
                {copy.noMatchDescription}
              </p>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--ecode-border)] bg-transparent px-5 py-3 text-[13px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]"
                >
                  {copy.clearFilters}
                </button>
              </div>
            </div>
          ) : (
            <>
              {isFiltering ? (
                <p className="mt-6 text-[13px] text-[var(--ecode-text-muted)]" aria-live="polite">
                  {formatPublicNumber(filteredTemplates.length, language)}{' '}
                  {filteredTemplates.length === 1 ? copy.matchSingular : copy.matchPlural} {copy.matchSuffix}
                </p>
              ) : null}
              <div className={classNames('grid gap-5 md:grid-cols-2 xl:grid-cols-3', isFiltering ? 'mt-5' : 'mt-10')}>
                {/* Filtering mixes featured and regular cards; the curated view keeps its featured styling. */}
                {visibleTemplates.map((template) => (
                  <TemplateMarketingCard
                    key={template.id}
                    template={template}
                    featured={isFiltering ? template.featured : true}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
          <div className="container-responsive grid gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--ecode-accent)]">
                {copy.foundations.eyebrow}
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
                {copy.foundations.title}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-[var(--ecode-text-secondary)]">
                {copy.foundations.description}
              </p>
              <ProductCapture
                src="/ecode-static/assets/product/ide.png"
                alt={copy.foundations.imageAlt}
                caption={copy.foundations.imageCaption}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {copy.foundations.assurances.map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-5"
                >
                  <ShieldCheck className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  <h3 className="mt-4 text-base font-semibold text-[var(--ecode-text)]">{title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {secondaryTemplates.length > 0 ? (
          <section className="container-responsive py-16 sm:py-24">
            <SectionHeader eyebrow={copy.more.eyebrow} title={copy.more.title} description={copy.more.description} />
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {secondaryTemplates.map((template) => (
                <TemplateMarketingCard key={template.id} template={template} />
              ))}
            </div>
          </section>
        ) : null}

        <ResourceCta
          title={copy.cta.title}
          description={copy.cta.description}
          primary={{ label: copy.cta.primary, to: loginReturnTo('/templates') }}
          secondary={{ label: copy.cta.secondary, to: '/pricing' }}
        />
      </main>
    </PublicShell>
  );
}

export function CommunityMarketingPage({ posts, categories, challenges, contributors, events }: CommunityPageProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingPublicResourceCopy(language).community;
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const lowerSearchQuery = searchQuery.trim().toLowerCase();

  const visiblePosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesCategory = activeCategory === 'all' || post.category === activeCategory;

      const matchesSearch =
        !lowerSearchQuery ||
        post.title.toLowerCase().includes(lowerSearchQuery) ||
        post.summary.toLowerCase().includes(lowerSearchQuery) ||
        post.tags.some((tag) => tag.toLowerCase().includes(lowerSearchQuery)) ||
        post.authorName.toLowerCase().includes(lowerSearchQuery);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, lowerSearchQuery, posts]);

  const activeChallenges = formatPublicNumber(challenges.length, language);
  const programCount = formatPublicNumber(events.length, language);

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-public-resource-page="community">
        <ResourceHero
          eyebrow={copy.hero.eyebrow}
          title={copy.hero.title}
          description={copy.hero.description}
          primaryAction={{ label: copy.hero.primary, to: loginReturnTo('/community') }}
          secondaryAction={{ label: copy.hero.secondary, to: '#community-feed' }}
          metrics={[
            { label: copy.hero.metrics[0], value: formatPublicNumber(posts.length, language) },
            { label: copy.hero.metrics[1], value: activeChallenges },
            { label: copy.hero.metrics[2], value: programCount },
          ]}
          icon={<Users className="h-5 w-5" aria-hidden />}
        />

        <section className="border-b border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
          <div className="container-responsive grid gap-6 py-10 md:grid-cols-3">
            {copy.pillars.map((item) => {
              const Icon = communityPillarIcons[item.id];

              return (
                <div
                  key={item.title}
                  className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-5"
                >
                  <Icon className="h-5 w-5 text-[var(--ecode-accent)]" aria-hidden />
                  <h2 className="mt-4 text-lg font-bold text-[var(--ecode-text)]">{item.title}</h2>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="community-feed" className="container-responsive py-16 sm:py-24">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <SectionHeader eyebrow={copy.feed.eyebrow} title={copy.feed.title} description={copy.feed.description} />

              <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <label className="relative block">
                  <span className="sr-only">{copy.searchLabel}</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ecode-text-muted)]" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    className="min-h-[48px] w-full rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-11 text-[15px] text-[var(--ecode-text)] outline-none transition placeholder:text-[var(--ecode-text-muted)] focus:border-[var(--ecode-accent)]"
                    data-testid="input-search-community"
                  />
                </label>

                <MarketingLinkButton to={loginReturnTo('/community')} variant="secondary">
                  <Plus className="-ml-1 mr-2 h-4 w-4" aria-hidden />
                  {copy.newPost}
                </MarketingLinkButton>
              </div>

              <div className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label={copy.categoryLabel}>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={classNames(
                      'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition',
                      activeCategory === category.id
                        ? 'border-[var(--ecode-accent)] bg-[var(--vc-action-primary-strong)] text-white'
                        : 'border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text-secondary)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]',
                    )}
                  >
                    {category.name}
                    <span
                      className={activeCategory === category.id ? 'text-white/75' : 'text-[var(--ecode-text-muted)]'}
                    >
                      {category.postCount}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-8 space-y-5">
                {visiblePosts.length > 0 ? (
                  visiblePosts.map((post) => <CommunityFeedCard key={post.id} post={post} />)
                ) : (
                  <div className="rounded-lg border border-dashed border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-8 text-center">
                    <MessageSquare className="mx-auto h-8 w-8 text-[var(--ecode-text-muted)]" aria-hidden />
                    <h3 className="mt-4 text-lg font-bold text-[var(--ecode-text)]">{copy.emptyTitle}</h3>
                    <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
                      {copy.emptyDescription}
                    </p>
                    <div className="mt-5">
                      <MarketingLinkButton to={loginReturnTo('/community')}>{copy.startDiscussion}</MarketingLinkButton>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
              <CommunitySidebarPanel title={copy.activeChallenges} icon={<Trophy className="h-4 w-4" aria-hidden />}>
                <div className="space-y-4">
                  {challenges.map((challenge) => (
                    <CommunityChallengeItem key={challenge.id} challenge={challenge} />
                  ))}
                </div>
                <MarketingLinkButton to={loginReturnTo('/community')} variant="secondary" fullWidth>
                  {copy.joinChallenge}
                </MarketingLinkButton>
              </CommunitySidebarPanel>

              <CommunitySidebarPanel title={copy.topContributors} icon={<Users className="h-4 w-4" aria-hidden />}>
                <div className="space-y-3">
                  {contributors.map((contributor) => (
                    <CommunityContributorRow key={contributor.id} contributor={contributor} />
                  ))}
                </div>
              </CommunitySidebarPanel>
            </aside>
          </div>
        </section>

        <section className="border-y border-[var(--ecode-border)] bg-[var(--ecode-surface)]">
          <div className="container-responsive grid gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--ecode-accent)]">
                {copy.events.eyebrow}
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
                {copy.events.title}
              </h2>
              <p className="mt-5 text-base leading-8 text-[var(--ecode-text-secondary)]">{copy.events.description}</p>
              <ProductCapture
                src="/ecode-static/assets/product/dashboard.png"
                alt={copy.events.imageAlt}
                caption={copy.events.imageCaption}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-5"
                >
                  <div className="flex items-center justify-between gap-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--ecode-accent)]">
                    <Calendar className="h-4 w-4" aria-hidden />
                    <span>{formatPublicDate(event.date, language)}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[var(--ecode-text)]">{event.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">{event.description}</p>
                  <Link
                    to={loginReturnTo('/community')}
                    className="mt-5 inline-flex items-center text-[13px] font-semibold text-[var(--ecode-accent)]"
                  >
                    {copy.events.register}
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <ResourceCta
          title={copy.cta.title}
          description={copy.cta.description}
          primary={{ label: copy.cta.primary, to: loginReturnTo('/community') }}
          secondary={{ label: copy.cta.secondary, to: '/templates' }}
        />
      </main>
    </PublicShell>
  );
}

function ResourceHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  metrics,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: { label: string; to: string };
  secondaryAction: { label: string; to: string };
  metrics: { label: string; value: string }[];
  icon: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
      <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
      <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
      <div className="container-responsive relative py-20 sm:py-28">
        <div className="max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
            {icon}
            {eyebrow}
          </span>
          <h1 className="mt-8 max-w-4xl mkt-h1 text-[var(--ecode-text)]">{title}</h1>
          <p className="mt-6 max-w-3xl mkt-lead text-[var(--ecode-text-secondary)]">{description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <MarketingLinkButton to={primaryAction.to}>{primaryAction.label}</MarketingLinkButton>
            <MarketingLinkButton to={secondaryAction.to} variant="secondary">
              {secondaryAction.label}
            </MarketingLinkButton>
          </div>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {metrics.map((metric) => (
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
  );
}

function ProductCapture({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="mt-8 overflow-hidden rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] shadow-[0_24px_80px_-48px_rgba(242,98,7,0.55)]">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
        sizes="(min-width: 1024px) 40vw, 100vw"
      />
      <figcaption className="border-t border-[var(--ecode-border)] px-4 py-3 text-[12px] text-[var(--ecode-text-muted)]">
        {caption}
      </figcaption>
    </figure>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-[13px] font-semibold uppercase tracking-[0.28em] text-[var(--ecode-accent)]">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">{title}</h2>
      <p className="mt-4 text-base leading-8 text-[var(--ecode-text-secondary)]">{description}</p>
    </div>
  );
}

type TechBrand = { icon: ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string };

/*
 * Real Simple Icons logos in their official brand colors, keyed by the exact
 * technology labels emitted by the E-Code template catalog (ecode-template-catalog.server.ts).
 */
const TECH_BRANDS: Record<string, TechBrand> = {
  React: { icon: SiReact, color: '#61DAFB' },
  Vite: { icon: SiVite, color: '#646CFF' },
  TypeScript: { icon: SiTypescript, color: '#3178C6' },
  'Next.js': { icon: SiNextdotjs, color: '#FFFFFF' },
  Prisma: { icon: SiPrisma, color: '#5A67D8' },
  'Tailwind CSS': { icon: SiTailwindcss, color: '#06B6D4' },
  'Node.js': { icon: SiNodedotjs, color: '#5FA04E' },
  Fastify: { icon: SiFastify, color: '#FFFFFF' },
  PostgreSQL: { icon: SiPostgresql, color: '#4169E1' },
  OpenAI: { icon: SiOpenai, color: '#FFFFFF' },
  Anthropic: { icon: SiAnthropic, color: '#D97757' },
  Remix: { icon: SiRemix, color: '#FFFFFF' },
  'Framer Motion': { icon: SiFramer, color: '#0055FF' },
  Expo: { icon: SiExpo, color: '#FFFFFF' },
  Angular: { icon: SiAngular, color: '#DD0031' },
  Astro: { icon: SiAstro, color: '#FF5D01' },
  Qwik: { icon: SiQwik, color: '#AC7EF4' },
  SolidJS: { icon: SiSolid, color: '#2C4F7C' },
  SvelteKit: { icon: SiSvelte, color: '#FF3E00' },
  'Vue.js': { icon: SiVuedotjs, color: '#4FC08D' },
  'shadcn/ui': { icon: SiShadcnui, color: '#FFFFFF' },
  JavaScript: { icon: SiJavascript, color: '#F7DF1E' },
};

function resolveTechBrand(technology: string): TechBrand | undefined {
  // Exact label first (rich local set: Anthropic, Framer, Angular, Qwik, …).
  if (TECH_BRANDS[technology]) {
    return TECH_BRANDS[technology];
  }

  // Case-insensitive match (catalog data may emit different casing).
  const ci = Object.keys(TECH_BRANDS).find((k) => k.toLowerCase() === technology.toLowerCase());

  if (ci) {
    return TECH_BRANDS[ci];
  }

  // Tolerant token fallback (handles "react-vite", "nextjs", etc.).
  const tb = resolveTechToken(technology);

  return tb ? { icon: tb.Icon, color: tb.brand } : undefined;
}

/**
 * Marketing-styled filter chip (single-select toggle). Mirrors the community
 * page's category pills so the templates gallery keeps the ecode-token visual
 * language instead of the app-surface FilterChip.
 */
function TemplateTagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={classNames(
        'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition',
        active
          ? 'border-[var(--ecode-accent)] bg-[var(--vc-action-primary-strong)] text-white'
          : 'border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text-secondary)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]',
      )}
    >
      {label}
    </button>
  );
}

function TemplateMarketingCard({ template, featured = false }: { template: PublicTemplateCard; featured?: boolean }) {
  const { i18n } = useTranslation();
  const copy = getMarketingPublicResourceCopy(i18n.resolvedLanguage ?? i18n.language).templates.card;
  const primaryBrand = template.technologies.map(resolveTechBrand).find(Boolean);
  const PrimaryIcon = primaryBrand?.icon ?? Code2;
  const difficulty = template.difficulty.toLowerCase();

  const difficultyLabel =
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
      ? copy.difficulty[difficulty]
      : template.difficulty;

  return (
    <article
      className={classNames(
        'flex min-h-[25rem] flex-col rounded-lg border bg-[var(--ecode-surface)] p-6 transition hover:-translate-y-1 hover:shadow-xl',
        featured
          ? 'border-[var(--ecode-accent)]/45 shadow-[0_18px_70px_-42px_rgba(242,98,7,0.85)]'
          : 'border-[var(--ecode-border)]',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface-secondary)]"
            aria-hidden
          >
            <PrimaryIcon
              className="h-6 w-6"
              style={primaryBrand ? { color: primaryBrand.color } : { color: 'var(--ecode-accent)' }}
            />
          </span>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--ecode-text-muted)]">
              {template.categoryName}
            </p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-[var(--ecode-text)]">{template.name}</h3>
          </div>
        </div>
        {template.trending ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--vc-action-primary-strong)] px-3 py-1 text-[11px] font-semibold text-white">
            <Zap className="h-3 w-3" aria-hidden />
            {copy.trending}
          </span>
        ) : (
          <span className="rounded-full border border-[var(--ecode-border)] px-3 py-1 text-[11px] font-semibold text-[var(--ecode-text-secondary)]">
            {difficultyLabel}
          </span>
        )}
      </div>
      <p className="mt-5 line-clamp-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">
        {template.description}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {template.technologies.slice(0, 4).map((technology) => {
          const brand = resolveTechBrand(technology);
          const TechIcon = brand?.icon;

          return (
            <span
              key={technology}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ecode-surface-secondary)] px-3 py-1 text-[12px] font-medium text-[var(--ecode-text-secondary)]"
            >
              {TechIcon ? <TechIcon className="h-3.5 w-3.5" style={{ color: brand?.color }} aria-hidden /> : null}
              {technology}
            </span>
          );
        })}
      </div>
      <div className="mt-auto pt-8">
        <div className="mb-4 flex items-center gap-4 text-[12px] text-[var(--ecode-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-4 w-4" aria-hidden />
            {copy.official}
          </span>
          <span className="inline-flex items-center gap-1">
            <Rocket className="h-4 w-4" aria-hidden />
            {copy.free}
          </span>
          <span className="inline-flex items-center gap-1">
            <Code2 className="h-4 w-4" aria-hidden />
            {copy.ideReady}
          </span>
        </div>
        <MarketingLinkButton to={templateProjectReturnTo(template.slug)} fullWidth>
          {copy.useTemplate}
        </MarketingLinkButton>
      </div>
    </article>
  );
}

function CommunityFeedCard({ post }: { post: PublicCommunityPost }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getMarketingPublicResourceCopy(language).community.post;

  return (
    <article className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 transition hover:border-[var(--ecode-accent)]/60 hover:shadow-xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--ecode-surface-secondary)] text-[13px] font-bold text-[var(--ecode-accent)]">
          {post.authorInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/community/post/${post.id}`}
              className="text-xl font-bold tracking-tight text-[var(--ecode-text)] hover:text-[var(--ecode-accent)]"
            >
              {post.title}
            </Link>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ecode-surface-secondary)] px-3 py-1 text-[11px] font-semibold text-[var(--ecode-text-secondary)]">
              <BookOpen className="h-3.5 w-3.5 text-[var(--ecode-accent)]" aria-hidden />
              {post.categoryName}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--ecode-text-muted)]">
            {copy.by} <span className="font-semibold text-[var(--ecode-text-secondary)]">{post.authorName}</span> @
            {post.authorHandle} · <time dateTime={post.updatedAt}>{formatPublicDate(post.updatedAt, language)}</time>
          </p>
          <p className="mt-4 text-[15px] leading-7 text-[var(--ecode-text-secondary)]">{post.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {post.tags.slice(0, 5).map((tag, index) => (
              <span key={tag} className="rounded-full border border-[var(--ecode-border)] px-3 py-1 text-[12px]">
                {post.tagLabels?.[index] ?? tag}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-4 border-t border-[var(--ecode-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--ecode-text-muted)]">
              <ActionMetric
                href={loginReturnTo(`/community/post/${post.id}`)}
                icon={<Heart className="h-4 w-4" aria-hidden />}
                label={copy.like}
              />
              <ActionMetric
                href={`/community/post/${post.id}`}
                icon={<MessageSquare className="h-4 w-4" aria-hidden />}
                label={copy.discuss}
              />
              <ActionMetric
                href={loginReturnTo(`/community/post/${post.id}`)}
                icon={<Bookmark className="h-4 w-4" aria-hidden />}
                label={copy.save}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/community/post/${post.id}`}
                className="inline-flex items-center text-[13px] font-semibold text-[var(--ecode-accent)]"
              >
                {copy.read}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
              <Link
                to={loginReturnTo(`/community/post/${post.id}`)}
                className="inline-flex items-center text-[13px] font-semibold text-[var(--ecode-text-secondary)] hover:text-[var(--ecode-accent)]"
              >
                {copy.reply}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ActionMetric({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={href}
      className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 transition hover:bg-[var(--ecode-surface-secondary)] hover:text-[var(--ecode-accent)]"
    >
      {icon}
      {label}
    </Link>
  );
}

function CommunitySidebarPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--ecode-text)]">
        <span className="text-[var(--ecode-accent)]">{icon}</span>
        {title}
      </h2>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function CommunityChallengeItem({ challenge }: { challenge: PublicCommunityChallenge }) {
  const { i18n } = useTranslation();
  const copy = getMarketingPublicResourceCopy(i18n.resolvedLanguage ?? i18n.language).community.challenge;
  const difficultyAccent = challenge.difficulty === 'hard';

  return (
    <div className="border-b border-[var(--ecode-border)] pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-[var(--ecode-text)]">{challenge.title}</h3>
        <span
          className={classNames(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]',
            difficultyAccent
              ? 'border-[var(--ecode-accent)] text-[var(--ecode-accent)]'
              : 'border-[var(--ecode-border)] text-[var(--ecode-text-muted)]',
          )}
        >
          {copy.difficulty[challenge.difficulty]}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">{challenge.description}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-[var(--ecode-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-4 w-4" aria-hidden />
          {copy.guidedBuild}
        </span>
        <span className="inline-flex items-center gap-1">
          <Target className="h-4 w-4" aria-hidden />
          {copy.openToMembers}
        </span>
      </div>
      <Link
        to={loginReturnTo('/community')}
        className="mt-3 inline-flex text-[13px] font-semibold text-[var(--ecode-accent)]"
      >
        {copy.participate}
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

function CommunityContributorRow({ contributor }: { contributor: PublicCommunityContributor }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--ecode-surface-secondary)] text-[12px] font-bold text-[var(--ecode-text)]">
        {contributor.rank}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-[var(--ecode-text)]">{contributor.name}</p>
        <p className="truncate text-[12px] text-[var(--ecode-text-muted)]">@{contributor.handle}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--ecode-surface-secondary)] px-2.5 py-1 text-[11px] text-[var(--ecode-text-secondary)]">
        <Award className="h-3.5 w-3.5 text-[var(--ecode-accent)]" aria-hidden />
        {contributor.badge}
      </span>
    </div>
  );
}

function ResourceCta({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description: string;
  primary: { label: string; to: string };
  secondary: { label: string; to: string };
}) {
  return (
    <section className="container-responsive pb-20 sm:pb-28">
      <div className="rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-8 text-center sm:p-12">
        <Sparkles className="mx-auto h-8 w-8 text-[var(--ecode-accent)]" aria-hidden />
        <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-bold tracking-tight text-[var(--ecode-text)] sm:text-5xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[var(--ecode-text-secondary)]">{description}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <MarketingLinkButton to={primary.to}>{primary.label}</MarketingLinkButton>
          <MarketingLinkButton to={secondary.to} variant="secondary">
            {secondary.label}
          </MarketingLinkButton>
        </div>
      </div>
    </section>
  );
}

function MarketingLinkButton({
  children,
  fullWidth = false,
  to,
  variant = 'primary',
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
  to: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Link
      to={to}
      className={classNames(
        'inline-flex min-h-[44px] items-center justify-center rounded-md px-5 py-3 text-[13px] font-semibold transition',
        fullWidth ? 'w-full' : '',
        variant === 'primary'
          ? 'bg-[var(--vc-action-primary-strong)] text-white hover:brightness-90'
          : 'border border-[var(--ecode-border)] bg-transparent text-[var(--ecode-text)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-accent)]',
      )}
    >
      {children}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
    </Link>
  );
}
