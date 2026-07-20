import { describe, expect, it } from 'vitest';
import {
  galleryFacetsFromApps,
  type GalleryAppRecord,
  type GalleryAppVersionRecord,
  type ProjectGalleryStore,
} from './project-gallery.js';
import { createGalleryPublishedAppResolver, galleryDemoRecords } from './project-gallery-resolver.js';

function readStore(
  input: {
    apps?: GalleryAppRecord[];
    versions?: GalleryAppVersionRecord[];
    engagement?: Record<string, { completedRemixCount: number; reportCount: number }>;
  } = {},
) {
  const apps = input.apps ?? [];
  const versions = input.versions ?? [];

  return {
    async getGalleryApp(id: string) {
      return apps.find((app) => app.id === id);
    },
    async getGalleryAppBySlug(slug: string) {
      return apps.find((app) => app.slug === slug);
    },
    async getGalleryAppVersion(id: string) {
      return versions.find((version) => version.id === id);
    },
    async getGalleryEngagementCounts(appIds: string[]) {
      return appIds.map((galleryAppId) => ({
        galleryAppId,
        completedRemixCount: input.engagement?.[galleryAppId]?.completedRemixCount ?? 0,
        reportCount: input.engagement?.[galleryAppId]?.reportCount ?? 0,
      }));
    },
    async listPublishedGalleryApps(options: { cursor?: string; limit: number }) {
      const start = options.cursor ? apps.findIndex((app) => app.id === options.cursor) + 1 : 0;
      const page = apps.slice(start, start + options.limit);
      return {
        apps: page,
        itemCursors: page.map((app) => app.id),
        ...(start + page.length < apps.length ? { nextCursor: page.at(-1)?.id } : {}),
      };
    },
    async listPublishedGalleryFacets() {
      return galleryFacetsFromApps(apps);
    },
  } as unknown as ProjectGalleryStore;
}

describe('Gallery published app resolver', () => {
  it('paginates the six working demos without repeating or dropping one', async () => {
    const resolver = createGalleryPublishedAppResolver(readStore());
    const first = await resolver.listPublishedApps({ sort: 'FEATURED', limit: 3 });
    const second = await resolver.listPublishedApps({ sort: 'FEATURED', limit: 3, cursor: first.nextCursor });

    expect(first.apps).toHaveLength(3);
    expect(second.apps).toHaveLength(3);
    expect(new Set([...first.apps, ...second.apps].map((app) => app.id)).size).toBe(6);
    expect(second.nextCursor).toBeUndefined();
  });

  it('resolves a demo to the immutable snapshot whose integrity hash Remix verifies', async () => {
    const resolver = createGalleryPublishedAppResolver(readStore());
    const resolved = await resolver.resolvePublishedApp({ slug: 'orbit-crm' });

    expect(resolved?.app.id).toBe('demo:react-saas');
    expect(resolved?.app.previewUrl).toBe('/gallery-apps/react-saas/preview/');
    expect(resolved?.version.files.some((file) => file.path === 'package.json')).toBe(true);
    expect(resolved?.version.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('projects persisted Remix and report engagement onto immutable demo cards', async () => {
    const resolver = createGalleryPublishedAppResolver(
      readStore({ engagement: { 'demo:react-saas': { completedRemixCount: 3, reportCount: 2 } } }),
    );
    const resolved = await resolver.resolvePublishedApp({ appId: 'demo:react-saas' });

    expect(resolved?.app.remixCount).toBe(431);
    expect(resolved?.app.reportCount).toBe(2);
  });

  it('returns global facets independently of cursor and active discovery filters', async () => {
    const [{ app }] = galleryDemoRecords();
    const community = {
      ...app,
      id: 'community-warehouse',
      slug: 'community-warehouse',
      category: 'warehouse',
      artifactType: 'INTERNAL_TOOL' as const,
      technologies: ['SolidJS', 'TypeScript'],
    };
    const resolver = createGalleryPublishedAppResolver(readStore({ apps: [community] }));

    const filtered = await resolver.listPublishedApps({
      sort: 'RECENT',
      limit: 1,
      category: 'sales',
      technology: 'react',
    });
    const nextPage = await resolver.listPublishedApps({
      sort: 'RECENT',
      limit: 1,
      category: 'sales',
      technology: 'react',
      cursor: filtered.nextCursor,
    });

    expect(filtered.facets).toEqual(nextPage.facets);
    expect(filtered.facets.categories).toContain('warehouse');
    expect(filtered.facets.artifactTypes).toContain('INTERNAL_TOOL');
    expect(filtered.facets.technologies).toContain('SolidJS');
  });

  it('refuses a corrupted latestVersionId pointing at another application', async () => {
    const [{ app, version }] = galleryDemoRecords();
    const community = {
      ...app,
      id: 'community-1',
      slug: 'community-one',
      latestVersionId: version.id,
    };
    const resolver = createGalleryPublishedAppResolver(readStore({ apps: [community], versions: [version] }));

    await expect(resolver.resolvePublishedApp({ appId: community.id })).resolves.toBeUndefined();
  });
});
