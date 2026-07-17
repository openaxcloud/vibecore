import { describe, expect, it } from 'vitest';

import { loader as communityLoader } from './community';
import { loader as marketplaceTemplatesLoader } from './marketplace.templates';
import { loader as templatesLoader } from './templates';
import { toResponse } from '~/lib/test/rr7-data';

function loaderArgs(url: string): Parameters<typeof templatesLoader>[0] {
  return {
    context: {},
    params: {},
    request: new Request(url),
  };
}

describe('public resource marketing routes', () => {
  it('redirects /templates to the canonical in-product community Gallery', async () => {
    const response = toResponse(await templatesLoader(loaderArgs('http://app.e-code.ai/templates')));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/templates');
  });

  it('redirects the legacy marketplace alias to the same canonical Gallery', async () => {
    const response = toResponse(
      await marketplaceTemplatesLoader(loaderArgs('http://app.e-code.ai/marketplace/templates')),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/templates');
  });

  it('serves /community as public marketing data without authenticated workspace chrome', async () => {
    const response = toResponse(await communityLoader(loaderArgs('http://app.e-code.ai/community')));

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
