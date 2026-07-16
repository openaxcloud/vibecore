import type { GalleryDemoAppSummary } from './types.js';

const ECODE_AUTHOR = Object.freeze({
  id: 'ecode-studio',
  displayName: 'E-Code Studio',
  handle: 'ecode',
  verified: true,
});

const app = (value: Omit<GalleryDemoAppSummary, 'author' | 'thumbnailUrl' | 'previewUrl'>): GalleryDemoAppSummary =>
  Object.freeze({
    ...value,
    author: ECODE_AUTHOR,
    technologies: Object.freeze([...value.technologies]),
    thumbnailUrl: `/gallery-apps/${value.id}/thumbnail.png`,
    previewUrl: `/gallery-apps/${value.id}/preview/`,
  });

/** Six working applications published to seed the remix Gallery. */
export const GALLERY_DEMO_APP_SUMMARIES = Object.freeze([
  app({
    id: 'react-saas',
    key: 'demo-react-saas-crm',
    slug: 'orbit-crm',
    name: 'Orbit CRM',
    description: 'A working sales workspace for contacts, pipeline stages, follow-ups and revenue visibility.',
    artifactType: 'business-app',
    category: 'sales',
    technologies: ['React', 'Vite', 'TypeScript'],
    publishedAt: '2026-07-10T09:00:00.000Z',
    remixCount: 428,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  }),
  app({
    id: 'next-dashboard',
    key: 'demo-next-operations-dashboard',
    slug: 'northstar-operations',
    name: 'Northstar Operations',
    description: 'An incident and service operations dashboard with live health, ownership and resolution workflows.',
    artifactType: 'dashboard',
    category: 'operations',
    technologies: ['Next.js', 'React', 'TypeScript'],
    publishedAt: '2026-07-09T14:30:00.000Z',
    remixCount: 316,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  }),
  app({
    id: 'fastify-api',
    key: 'demo-fastify-api-monitor',
    slug: 'pulse-api-monitor',
    name: 'Pulse API Monitor',
    description: 'A self-contained API monitoring tool that runs endpoint checks and surfaces latency and failures.',
    artifactType: 'developer-tool',
    category: 'developer-tools',
    technologies: ['Fastify', 'Node.js', 'TypeScript'],
    publishedAt: '2026-07-08T11:15:00.000Z',
    remixCount: 207,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  }),
  app({
    id: 'ai-agent',
    key: 'demo-ai-launch-planner',
    slug: 'launchline-planner',
    name: 'Launchline Planner',
    description: 'A collaborative launch planner that turns milestones into a focused, executable release checklist.',
    artifactType: 'productivity-app',
    category: 'productivity',
    technologies: ['React', 'Vite', 'TypeScript'],
    publishedAt: '2026-07-07T16:45:00.000Z',
    remixCount: 265,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  }),
  app({
    id: 'landing-page',
    key: 'demo-booking-customer-app',
    slug: 'kindred-booking',
    name: 'Kindred Booking',
    description: 'A customer booking experience with real time-slot selection, contact capture and confirmation.',
    artifactType: 'customer-app',
    category: 'booking',
    technologies: ['Vite', 'JavaScript', 'CSS'],
    publishedAt: '2026-07-06T10:20:00.000Z',
    remixCount: 391,
    featured: true,
    remixAllowed: true,
    moderationStatus: 'approved',
  }),
  app({
    id: 'mobile-starter',
    key: 'demo-field-service-pwa',
    slug: 'relay-field-service',
    name: 'Relay Field Service',
    description: 'An installable field-service PWA for daily jobs, technician notes and offline-ready status updates.',
    artifactType: 'pwa',
    category: 'field-service',
    technologies: ['React', 'Vite', 'TypeScript', 'PWA'],
    publishedAt: '2026-07-05T08:10:00.000Z',
    remixCount: 184,
    featured: false,
    remixAllowed: true,
    moderationStatus: 'approved',
  }),
] satisfies readonly GalleryDemoAppSummary[]);

const summariesByKey = new Map<string, GalleryDemoAppSummary>();
for (const item of GALLERY_DEMO_APP_SUMMARIES) {
  summariesByKey.set(item.id, item);
  summariesByKey.set(item.key, item);
  summariesByKey.set(item.slug, item);
}

export function listGalleryDemoAppSummaries(): readonly GalleryDemoAppSummary[] {
  return GALLERY_DEMO_APP_SUMMARIES;
}

export function getGalleryDemoAppSummary(idKeyOrSlug: string): GalleryDemoAppSummary | undefined {
  return summariesByKey.get(idKeyOrSlug.trim().toLowerCase());
}
