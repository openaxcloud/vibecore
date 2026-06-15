import { describe, expect, it } from 'vitest';

import { loader as communityLoader } from './community';
import { loader as marketplaceTemplatesLoader } from './marketplace.templates';
import { loader as templatesLoader } from './templates';

function loaderArgs(url: string): Parameters<typeof templatesLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url),
  };
}

describe('public resource marketing routes', () => {
  it('serves /templates as Remix data for the marketing page instead of the E-Code app shell', async () => {
    const response = await templatesLoader(loaderArgs('http://app.e-code.ai/templates'));
    const payload = (await response.json()) as { categories: unknown[]; templates: unknown[] };

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-vibecore-marketing-shell')).toBeNull();
    expect(payload.categories.length).toBeGreaterThan(0);
    expect(payload.templates.length).toBeGreaterThan(0);
  });

  it('serves /marketplace/templates with the same public template marketing data', async () => {
    const response = await marketplaceTemplatesLoader(loaderArgs('http://app.e-code.ai/marketplace/templates'));
    const payload = (await response.json()) as { templates: Array<{ name: string }> };

    expect(payload.templates.some((template) => template.name.toLowerCase().includes('agent'))).toBe(true);
  });

  it('serves /community as public marketing data without authenticated workspace chrome', async () => {
    const response = await communityLoader(loaderArgs('http://app.e-code.ai/community'));

    const payload = (await response.json()) as {
      posts: Array<{ authorName?: string; templateSlug?: string }>;
      categories: unknown[];
      challenges: unknown[];
      contributors: unknown[];
      events: unknown[];
    };

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-vibecore-marketing-shell')).toBeNull();
    expect(payload.posts.length).toBeGreaterThan(0);
    expect(payload.posts[0].authorName).toBeTruthy();
    expect(payload.posts[0].templateSlug).toBeUndefined();
    expect(payload.categories.length).toBeGreaterThan(0);
    expect(payload.challenges.length).toBeGreaterThan(0);
    expect(payload.contributors.length).toBeGreaterThan(0);
    expect(payload.events.length).toBeGreaterThan(0);
  });
});
