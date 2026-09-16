import rawMetadataCopy from './metadata.copy.json' with { type: 'json' };
import type { GalleryDemoAppSummary } from './types.js';

export const GALLERY_DEMO_APP_LOCALES = ['en', 'fr'] as const;
export type GalleryDemoAppLocale = (typeof GALLERY_DEMO_APP_LOCALES)[number];

type LocalizedSummaryCopy = Readonly<{ name: string; description: string }>;
type SummarySeed = Omit<GalleryDemoAppSummary, 'author' | 'description' | 'name' | 'previewUrl' | 'thumbnailUrl'>;

const DEFAULT_LOCALE: GalleryDemoAppLocale = 'en';

const METADATA_COPY = rawMetadataCopy as Readonly<
  Record<GalleryDemoAppLocale, Readonly<Record<string, LocalizedSummaryCopy>>>
>;

const ECODE_AUTHOR = Object.freeze({
  id: 'ecode-studio',
  displayName: 'E-Code Studio',
  handle: 'ecode',
  verified: true,
});

const SUMMARY_SEEDS = Object.freeze([
  {
    id: 'docs-copilot',
    key: 'demo-docs-copilot',
    slug: 'docs-copilot',
    artifactType: 'productivity-app',
    category: 'productivity',
    technologies: ['React', 'TypeScript', 'Vite', 'Document Retrieval'],
    publishedAt: '2026-08-24T10:00:00.000Z',
    remixCount: 41,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'neon-trivia-arena',
    key: 'demo-neon-trivia-arena',
    slug: 'neon-trivia-arena',
    artifactType: 'game',
    category: 'gaming',
    technologies: ['React', 'TypeScript', 'Vite', 'Web Storage'],
    publishedAt: '2026-08-24T09:00:00.000Z',
    remixCount: 34,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'vendor-risk-review',
    key: 'demo-vendor-risk-review',
    slug: 'vendor-risk-review',
    artifactType: 'business-app',
    category: 'compliance',
    technologies: ['React', 'TypeScript', 'Express', 'SQLite', 'Vite'],
    publishedAt: '2026-07-17T09:00:00.000Z',
    remixCount: 96,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'field-service-inspector',
    key: 'demo-field-service-inspector',
    slug: 'field-service-inspector',
    artifactType: 'mobile-app',
    category: 'field-service',
    technologies: ['Expo', 'React Native', 'TypeScript', 'Metro'],
    publishedAt: '2026-07-17T08:30:00.000Z',
    remixCount: 74,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'revenue-cohort-explorer',
    key: 'demo-revenue-cohort-explorer',
    slug: 'revenue-cohort-explorer',
    artifactType: 'data-viz',
    category: 'analytics',
    technologies: ['React', 'TypeScript', 'Vite', 'SVG'],
    publishedAt: '2026-07-16T17:45:00.000Z',
    remixCount: 61,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'qbr-generator',
    key: 'demo-qbr-generator',
    slug: 'qbr-generator',
    artifactType: 'slide-deck',
    category: 'reporting',
    technologies: ['React', 'TypeScript', 'Express', 'Vite'],
    publishedAt: '2026-07-16T15:20:00.000Z',
    remixCount: 43,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'incident-postmortem-explainer',
    key: 'demo-incident-postmortem-explainer',
    slug: 'incident-postmortem-explainer',
    artifactType: 'animation',
    category: 'incident-response',
    technologies: ['React', 'TypeScript', 'Vite', 'Web Animations'],
    publishedAt: '2026-07-15T14:10:00.000Z',
    remixCount: 38,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'warehouse-layout-planner',
    key: 'demo-warehouse-layout-planner',
    slug: 'warehouse-layout-planner',
    artifactType: 'three-d',
    category: 'logistics',
    technologies: ['Three.js', 'React', 'TypeScript', 'Vite'],
    publishedAt: '2026-07-15T11:00:00.000Z',
    remixCount: 52,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'pipeline-crm',
    key: 'demo-pipeline-crm',
    slug: 'pipeline-crm',
    artifactType: 'crm',
    category: 'sales',
    technologies: ['React', 'TypeScript', 'Vite'],
    publishedAt: '2026-07-14T16:40:00.000Z',
    remixCount: 87,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'storefront',
    key: 'demo-storefront',
    slug: 'storefront',
    artifactType: 'ecommerce',
    category: 'commerce',
    technologies: ['React', 'TypeScript', 'Express', 'Stripe', 'SQLite', 'Vite'],
    publishedAt: '2026-07-14T10:15:00.000Z',
    remixCount: 69,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'react-saas',
    key: 'demo-react-saas-crm',
    slug: 'orbit-crm',
    artifactType: 'business-app',
    category: 'sales',
    technologies: ['React', 'Vite', 'TypeScript'],
    publishedAt: '2026-07-10T09:00:00.000Z',
    remixCount: 428,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'next-dashboard',
    key: 'demo-next-operations-dashboard',
    slug: 'northstar-operations',
    artifactType: 'dashboard',
    category: 'operations',
    technologies: ['Next.js', 'React', 'TypeScript'],
    publishedAt: '2026-07-09T14:30:00.000Z',
    remixCount: 316,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'fastify-api',
    key: 'demo-fastify-api-monitor',
    slug: 'pulse-api-monitor',
    artifactType: 'developer-tool',
    category: 'developer-tools',
    technologies: ['Fastify', 'Node.js', 'TypeScript'],
    publishedAt: '2026-07-08T11:15:00.000Z',
    remixCount: 207,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'ai-agent',
    key: 'demo-ai-launch-planner',
    slug: 'launchline-planner',
    artifactType: 'productivity-app',
    category: 'productivity',
    technologies: ['OpenAI', 'Anthropic', 'TypeScript'],
    publishedAt: '2026-07-07T16:45:00.000Z',
    remixCount: 265,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'landing-page',
    key: 'demo-booking-customer-app',
    slug: 'kindred-booking',
    artifactType: 'customer-app',
    category: 'booking',
    technologies: ['Vite', 'JavaScript', 'CSS'],
    publishedAt: '2026-07-06T10:20:00.000Z',
    remixCount: 391,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
  {
    id: 'mobile-starter',
    key: 'demo-field-service-pwa',
    slug: 'relay-field-service',
    artifactType: 'pwa',
    category: 'field-service',
    technologies: ['React', 'Vite', 'TypeScript', 'PWA'],
    publishedAt: '2026-07-05T08:10:00.000Z',
    remixCount: 184,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  },
] satisfies readonly SummarySeed[]);

export function normalizeGalleryDemoAppLocale(locale?: string | null): GalleryDemoAppLocale {
  return locale?.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : DEFAULT_LOCALE;
}

function buildSummaries(locale: GalleryDemoAppLocale): readonly GalleryDemoAppSummary[] {
  return Object.freeze(
    SUMMARY_SEEDS.map((value) => {
      const copy = METADATA_COPY[locale][value.id] ?? METADATA_COPY.en[value.id];

      if (!copy) {
        throw new Error(`Missing gallery metadata copy: ${value.id}`);
      }

      return Object.freeze({
        ...value,
        ...copy,
        author: ECODE_AUTHOR,
        technologies: Object.freeze([...value.technologies]),
        thumbnailUrl: `/gallery-apps/${value.id}/thumbnail.png`,
        previewUrl: `/gallery-apps/${value.id}/preview/`,
      });
    }),
  );
}

const SUMMARIES_BY_LOCALE = Object.freeze({
  en: buildSummaries('en'),
  fr: buildSummaries('fr'),
}) satisfies Readonly<Record<GalleryDemoAppLocale, readonly GalleryDemoAppSummary[]>>;

/** Backward-compatible English catalogue for consumers that do not negotiate a locale. */
export const GALLERY_DEMO_APP_SUMMARIES = SUMMARIES_BY_LOCALE.en;

function buildLookup(summaries: readonly GalleryDemoAppSummary[]): ReadonlyMap<string, GalleryDemoAppSummary> {
  const lookup = new Map<string, GalleryDemoAppSummary>();

  for (const item of summaries) {
    lookup.set(item.id, item);
    lookup.set(item.key, item);
    lookup.set(item.slug, item);
  }

  return lookup;
}

const SUMMARY_LOOKUPS = Object.freeze({
  en: buildLookup(SUMMARIES_BY_LOCALE.en),
  fr: buildLookup(SUMMARIES_BY_LOCALE.fr),
}) satisfies Readonly<Record<GalleryDemoAppLocale, ReadonlyMap<string, GalleryDemoAppSummary>>>;

export function listGalleryDemoAppSummaries(locale?: string | null): readonly GalleryDemoAppSummary[] {
  return SUMMARIES_BY_LOCALE[normalizeGalleryDemoAppLocale(locale)];
}

export function getGalleryDemoAppSummary(
  idKeyOrSlug: string,
  locale?: string | null,
): GalleryDemoAppSummary | undefined {
  return SUMMARY_LOOKUPS[normalizeGalleryDemoAppLocale(locale)].get(idKeyOrSlug.trim().toLowerCase());
}
