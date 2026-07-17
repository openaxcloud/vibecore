import { GitFork, Eye, Search, SearchX, Sparkles } from 'lucide-react';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { Form, Link, useLoaderData, useSearchParams } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { apiRequest } from '~/lib/enterprise-api.server';
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
  views: number;
  uses: number;
};

type GalleryCategory = { id: string; count: number };

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const meta: MetaFunction = () => [
  { title: 'Gallery - E-Code' },
  {
    name: 'description',
    content:
      'Browse apps the E-Code community has published. Open one, or remix it into your own workspace in a click.',
  },
  ...socialMetaTags({
    title: 'Gallery - E-Code',
    description: 'Browse apps the E-Code community has published. Remix one to start instantly.',
  }),
];

export async function loader({ request }: LoaderFunctionArgs) {
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

  return json({
    results: result.results,
    total: result.total,
    categories: result.categories,
    activeCategory: category || 'all',
    query: q,
  });
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] text-[var(--ecode-text-muted)]"
      title={`${value.toLocaleString('en-US')} ${label}`}
    >
      {icon}
      {compact.format(value)}
    </span>
  );
}

function GalleryCardLink({ card }: { card: GalleryCard }) {
  return (
    <Link
      to={`/gallery/${encodeURIComponent(card.slug)}`}
      className="group flex flex-col rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-5 transition hover:border-[var(--ecode-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
      data-testid={`gallery-card-${card.slug}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ecode-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ecode-text-secondary)]">
          {card.category}
        </span>
        {card.featured ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ecode-accent)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Featured
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
        <span className="truncate text-[12px] text-[var(--ecode-text-muted)]">by {card.author}</span>
        <span className="flex items-center gap-3">
          <Stat icon={<Eye className="h-3.5 w-3.5" aria-hidden />} value={card.views} label="views" />
          <Stat icon={<GitFork className="h-3.5 w-3.5" aria-hidden />} value={card.uses} label="remixes" />
        </span>
      </div>
    </Link>
  );
}

export default function GalleryIndexRoute() {
  const { results, total, categories, activeCategory, query } = useLoaderData<typeof loader>();
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
                Gallery
              </span>
              <h1 className="mt-8 max-w-4xl mkt-h1 text-[var(--ecode-text)]">
                Apps the community built — remix one to start
              </h1>
              <p className="mt-6 max-w-3xl mkt-lead text-[var(--ecode-text-secondary)]">
                Browse published projects, open the live app, or remix it into your own workspace in a click. New apps
                are added through a curated review.
              </p>
            </div>

            <Form method="get" className="mt-10 flex max-w-xl items-center gap-2" role="search">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ecode-text-muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Search apps, authors, tags…"
                  aria-label="Search the gallery"
                  className="h-11 w-full rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-surface)] pl-9 pr-3 text-[14px] text-[var(--ecode-text)] outline-none focus:border-[var(--ecode-accent)]"
                />
                {activeCategory !== 'all' ? <input type="hidden" name="category" value={activeCategory} /> : null}
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-lg bg-[var(--ecode-accent)] px-5 text-[14px] font-semibold text-white transition hover:opacity-90"
              >
                Search
              </button>
            </Form>
          </div>
        </section>

        <section className="container-responsive py-10">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
            {[{ id: 'all', count: total }, ...categories].map((category) => {
              const active = category.id === activeCategory;

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategory(category.id)}
                  aria-pressed={active}
                  className={classNames(
                    'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition',
                    active
                      ? 'border-[var(--ecode-accent)] bg-[var(--ecode-accent)] text-white'
                      : 'border-[var(--ecode-border)] bg-[var(--ecode-surface)] text-[var(--ecode-text-secondary)] hover:border-[var(--ecode-accent)] hover:text-[var(--ecode-text)]',
                  )}
                >
                  {category.id === 'all' ? 'All' : category.id}
                  <span
                    className={classNames('text-[11px]', active ? 'text-white/80' : 'text-[var(--ecode-text-muted)]')}
                  >
                    {category.count}
                  </span>
                </button>
              );
            })}
          </div>

          {results.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((card) => (
                <GalleryCardLink key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
              <SearchX className="h-10 w-10 text-[var(--ecode-text-muted)]" aria-hidden />
              <p className="text-[15px] font-semibold text-[var(--ecode-text)]">No apps match your search</p>
              <p className="max-w-md text-[13px] text-[var(--ecode-text-secondary)]">
                Try another category or a different search term.
              </p>
            </div>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
