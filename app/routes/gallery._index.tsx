import { GitFork, Eye, Search, SearchX, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { Form, Link, useLoaderData, useSearchParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { apiRequest } from '~/lib/enterprise-api.server';
import {
  formatPublicGalleryCopy,
  formatPublicGalleryNumber,
  getPublicGalleryCopy,
  type PublicGalleryCopy,
} from '~/lib/i18n/catalogs/public-gallery';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { classNames } from '~/utils/classNames';
import { socialMetaTags } from '~/utils/social-meta';

/*
 * Public Gallery (TPL-02) — a curated, DB-backed showcase of published community
 * apps that mirrors the CONFIRMED replit.com/gallery surface: browse, search,
 * categories, authors, public stats and a Remix CTA. Data comes from the API's
 * public GET /gallery (auth-exempt); submission stays a curated intake, never an
 * in-product self-service Publish (DEC-GALLERY-NO-SELF-PUBLISH).
 */

type GalleryCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  featured: boolean;
  author: string;
  appUrl: string | null;
  thumbnailUrl: string | null;
  views: number;
  uses: number;
};

type GalleryCategory = { id: string; count: number };

const GALLERY_CATEGORY_KEYS = {
  api: 'publicGallery.category.api',
  mobile: 'publicGallery.category.mobile',
  'ml-ai': 'publicGallery.category.mlAi',
  starter: 'publicGallery.category.starter',
  web: 'publicGallery.category.web',
} as const;

function galleryCategoryLabel(copy: PublicGalleryCopy, categoryId: string): string {
  const key = GALLERY_CATEGORY_KEYS[categoryId as keyof typeof GALLERY_CATEGORY_KEYS];

  return key ? copy[key] : categoryId;
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getPublicGalleryCopy(data?.language);
  const title = copy['publicGallery.gallery.seoTitle'];
  const description = copy['publicGallery.gallery.seoDescription'];

  return [
    { title },
    { name: 'description', content: description },
    ...socialMetaTags({
      title,
      description: copy['publicGallery.gallery.socialDescription'],
    }),
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const url = new URL(request.url);
  const category = url.searchParams.get('category') ?? '';
  const q = url.searchParams.get('q') ?? '';

  const search = new URLSearchParams();

  if (category && category !== 'all') {
    search.set('category', category);
  }

  if (q.trim()) {
    search.set('q', q.trim());
  }

  const qs = search.toString();

  const result = await apiRequest<{ results: GalleryCard[]; total: number; categories: GalleryCategory[] }>(
    request,
    `/gallery${qs ? `?${qs}` : ''}`,
    { redirectOn401: false },
  );

  return json(
    {
      results: result.results,
      total: result.total,
      categories: result.categories,
      activeCategory: category || 'all',
      query: q,
      language: localeResolution.language,
    },
    { headers: localeResponseHeaders(request, localeResolution) },
  );
}

function Stat({
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

function GalleryCardLink({ card, copy, language }: { card: GalleryCard; copy: PublicGalleryCopy; language: string }) {
  return (
    <Link
      to={`/gallery/${encodeURIComponent(card.slug)}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] transition hover:border-[var(--ecode-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
      data-testid={`gallery-card-${card.slug}`}
    >
      {card.thumbnailUrl ? (
        <img
          src={card.thumbnailUrl}
          alt={formatPublicGalleryCopy(copy['publicGallery.gallery.previewAlt'], { title: card.title })}
          loading="lazy"
          width={1200}
          height={675}
          className="aspect-[16/9] w-full border-b border-[var(--ecode-border)] bg-[var(--ecode-background)] object-cover"
          data-testid={`gallery-card-thumb-${card.slug}`}
        />
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ecode-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ecode-text-secondary)]">
            {card.category}
          </span>
          {card.featured ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ecode-accent)]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {copy['publicGallery.gallery.featured']}
            </span>
          ) : null}
        </div>

        <h3 className="mt-3 text-[16px] font-bold text-[var(--ecode-text)] group-hover:text-[var(--ecode-accent)]">
          {card.title}
        </h3>
        <p className="mt-1.5 line-clamp-3 flex-1 text-[13px] leading-6 text-[var(--ecode-text-secondary)]">
          {card.description}
        </p>

        {card.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--ecode-background)] px-2 py-0.5 text-[11px] text-[var(--ecode-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-[var(--ecode-border)] pt-3">
          <span className="min-w-0 break-words text-[12px] text-[var(--ecode-text-muted)]">
            {formatPublicGalleryCopy(copy['publicGallery.card.author'], { author: card.author })}
          </span>
          <span className="flex items-center gap-3">
            <Stat
              icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
              value={card.views}
              label={copy[`publicGallery.stat.views_${card.views === 1 ? 'one' : 'other'}`]}
              language={language}
            />
            <Stat
              icon={<GitFork className="h-3.5 w-3.5" aria-hidden />}
              value={card.uses}
              label={copy[`publicGallery.stat.remixes_${card.uses === 1 ? 'one' : 'other'}`]}
              language={language}
            />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function GalleryIndexRoute() {
  const { results, total, categories, activeCategory, query } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getPublicGalleryCopy(language);
  const [, setSearchParams] = useSearchParams();

  const setCategory = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);

      if (id === 'all') {
        next.delete('category');
      } else {
        next.set('category', id);
      }

      return next;
    });
  };

  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-public-resource-page="gallery">
        <section className="relative overflow-hidden border-b border-[var(--ecode-border)]">
          <div className="absolute inset-0 marketing-gradient opacity-70" aria-hidden />
          <div className="absolute inset-0 marketing-grid opacity-40" aria-hidden />
          <div className="container-responsive relative py-16 sm:py-24">
            <div className="max-w-4xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--ecode-border)] bg-[var(--ecode-surface)] px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.24em] text-[var(--ecode-accent)]">
                <Sparkles className="h-5 w-5" aria-hidden />
                {copy['publicGallery.gallery.badge']}
              </span>
              <h1 className="mt-8 max-w-4xl mkt-h1 text-[var(--ecode-text)]">{copy['publicGallery.gallery.title']}</h1>
              <p className="mt-6 max-w-3xl mkt-lead text-[var(--ecode-text-secondary)]">
                {copy['publicGallery.gallery.description']}
              </p>
            </div>

            <Form
              method="get"
              className="mt-10 flex max-w-xl flex-col items-stretch gap-2 sm:flex-row sm:items-center"
              role="search"
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ecode-text-muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder={copy['publicGallery.gallery.searchPlaceholder']}
                  aria-label={copy['publicGallery.gallery.searchAria']}
                  className="h-11 min-h-[44px] w-full rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] pl-9 pr-3 text-[14px] text-[var(--ecode-text)] outline-none focus:border-[var(--ecode-accent)]"
                />
                {activeCategory !== 'all' ? <input type="hidden" name="category" value={activeCategory} /> : null}
              </div>
              <button
                type="submit"
                className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-normal rounded-lg bg-[var(--vc-action-primary-strong)] px-5 py-2 text-center text-[14px] font-semibold text-white transition hover:opacity-90 sm:w-auto"
              >
                {copy['publicGallery.gallery.searchButton']}
              </button>
            </Form>
          </div>
        </section>

        <section className="container-responsive py-10">
          <div className="flex flex-wrap gap-2" role="group" aria-label={copy['publicGallery.gallery.categoriesAria']}>
            {[{ id: 'all', count: total }, ...categories].map((category) => {
              const active = category.id === activeCategory;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategory(category.id)}
                  aria-pressed={active}
                  className={classNames(
                    'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition',
                    active
                      ? 'border-[var(--ecode-accent)] bg-[var(--vc-action-primary-strong)] text-white'
                      : 'border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text-secondary)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-text)]',
                  )}
                >
                  {category.id === 'all' ? copy['publicGallery.gallery.all'] : galleryCategoryLabel(copy, category.id)}
                  <span
                    className={classNames('text-[11px]', active ? 'text-white/80' : 'text-[var(--ecode-text-muted)]')}
                  >
                    {formatPublicGalleryNumber(language, category.count)}
                  </span>
                </button>
              );
            })}
          </div>

          {results.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((card) => (
                <GalleryCardLink key={card.id} card={card} copy={copy} language={language} />
              ))}
            </div>
          ) : (
            <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
              <SearchX className="h-10 w-10 text-[var(--ecode-text-muted)]" aria-hidden />
              <p className="text-[15px] font-semibold text-[var(--ecode-text)]">
                {copy['publicGallery.gallery.emptyTitle']}
              </p>
              <p className="max-w-md text-[13px] text-[var(--ecode-text-secondary)]">
                {copy['publicGallery.gallery.emptyDescription']}
              </p>
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
