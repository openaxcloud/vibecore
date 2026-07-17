import { Sparkles } from 'lucide-react';
import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { TemplateGallery, type GalleryApp } from '~/components/dashboard/TemplateGallery';
import { apiRequest } from '~/lib/enterprise-api.server';
import { socialMetaTags } from '~/utils/social-meta';

/*
 * Community Gallery (option B, 2026-07-17): our PROVEN backend (GalleryListing,
 * GET /gallery — immutable snapshot pin + secrets:[] on remix) rendered through
 * the RICH TemplateGallery UI grafted from the other session (full cards with
 * thumbnail + View/Remix/Report buttons, search, category/technology/artifact-type
 * filters, sort, grid AND list view, pagination, loading/empty/error states).
 * See DEC-GALLERY-OPTION-B. The thumbnail slot uses aspect-[16/10] + object-cover
 * (centred, cropped, WITHOUT changing the container width) with a graceful
 * placeholder when a preview image is not yet available. Submission stays a
 * curated intake, never an in-product self-service Publish (DEC-GALLERY-NO-SELF-PUBLISH).
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
  thumbnailUrl?: string | null;
  publishedAt?: string | null;
  views: number;
  uses: number;
};

type GalleryCategory = { id: string; count: number };

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

  return json({ results: result.results, total: result.total, categories: result.categories });
}

/** Map our browser-safe GalleryCard to the rich UI's GalleryApp contract. */
function toGalleryApp(card: GalleryCard): GalleryApp {
  return {
    id: card.id,
    slug: card.slug,
    name: card.title,
    description: card.description,
    thumbnailUrl: card.thumbnailUrl ?? null,
    previewUrl: card.appUrl ?? null,
    author: { name: card.author },
    artifactType: card.category || 'app',
    category: card.category || 'app',
    technologies: card.tags ?? [],
    publishedAt: card.publishedAt || new Date(0).toISOString(),
    remixCount: card.uses ?? 0,
    reportCount: 0,
    featured: Boolean(card.featured),
    remixAllowed: true,
    moderationStatus: 'approved',
    provenance: null,
  };
}

export default function GalleryIndex() {
  const { results } = useLoaderData<typeof loader>();
  const apps = results.map(toGalleryApp);

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
          </div>
        </section>

        <section className="container-responsive py-10">
          <TemplateGallery
            apps={apps}
            status="ready"
            getViewHref={(app) => app.previewUrl ?? `/gallery/${encodeURIComponent(app.slug)}`}
            getRemixHref={(app) => `/gallery/${encodeURIComponent(app.slug)}`}
            getSourceHref={(app) => `/gallery/${encodeURIComponent(app.slug)}`}
          />
        </section>
      </main>
    </PublicShell>
  );
}
