import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('~/lib/enterprise-api.server', () => ({
  apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
}));

import { loader as exploreLoader, meta as exploreMeta } from './explore';
import { loader as galleryLoader, meta as galleryMeta } from './gallery._index';

function frenchRequest(path: string) {
  return new Request(`https://e-code.ai${path}`, {
    headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.7' },
  });
}

function dataOf<T>(result: unknown): T {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: T }).data;
  }

  return result as T;
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe('public gallery SSR i18n', () => {
  it('serves localized Explore data and metadata from Accept-Language', async () => {
    const result = await exploreLoader({ request: frenchRequest('/explore'), params: {}, context: {} } as never);

    const data = dataOf<{
      language: string;
      projects: Array<{ id: number; name: string; description: string }>;
    }>(result);

    const tags = exploreMeta({ data } as never);

    expect(data.language).toBe('fr');
    expect(data.projects.find((project) => project.name === 'SaaS React')?.description).toContain(
      'Modèle SaaS de production',
    );
    expect(tags).toContainEqual({ title: 'Explorer - E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('communauté E-Code'),
      }),
    );
  });

  it('serves localized Gallery metadata while preserving API-authored card content', async () => {
    mocks.apiRequest.mockResolvedValue({
      results: [
        {
          id: 'published-1',
          slug: 'customer-app',
          title: 'Customer-authored title',
          description: 'Customer-authored description',
          category: 'web',
          tags: [],
          featured: false,
          author: 'octocat',
          appUrl: null,
          thumbnailUrl: null,
          views: 2,
          uses: 1,
        },
      ],
      total: 1,
      categories: [{ id: 'web', count: 1 }],
    });

    const result = await galleryLoader({
      request: frenchRequest('/gallery?q=customer'),
      params: {},
      context: {},
    } as never);

    const data = dataOf<{ language: string; results: Array<{ title: string }> }>(result);

    const tags = galleryMeta({ data } as never);

    expect(data.language).toBe('fr');
    expect(data.results[0]?.title).toBe('Customer-authored title');
    expect(tags).toContainEqual({ title: 'Galerie - E-Code' });
    expect(tags).toContainEqual(
      expect.objectContaining({
        name: 'description',
        content: expect.stringContaining('espace de travail'),
      }),
    );
  });
});
