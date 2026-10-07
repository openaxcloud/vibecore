import type { LoaderFunctionArgs } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loader as blogCategoriesLoader } from './api.blog.categories.$category';
import { loader as blogFeaturedLoader } from './api.blog.featured';
import { loader as blogPostsLoader } from './api.blog.posts';
import { loader as blogPostLoader } from './api.blog.posts.$slug';
import { loader as paymentPlansLoader } from './api.payments.plans';
import { toResponse } from '~/lib/test/rr7-data';

function loaderArgs(params: LoaderFunctionArgs['params']): LoaderFunctionArgs {
  return {
    request: new Request('http://localhost/'),
    context: {},
    params,
  };
}

describe('E-Code public marketing API compatibility', () => {
  it('serves the E-Code pricing plans required by the imported pricing page', async () => {
    const response = toResponse(await paymentPlansLoader());
    const plans = await response.json();

    expect(response.status).toBe(200);
    expect(plans).toHaveLength(7);
    expect(plans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'free', tier: 'free', price: 0, interval: 'month' }),
        expect.objectContaining({ id: 'price_core_monthly', tier: 'core', price: 25, interval: 'month' }),
        expect.objectContaining({ id: 'price_core_yearly', tier: 'core', price: 20, interval: 'year' }),
        expect.objectContaining({ id: 'price_pro_monthly', tier: 'pro', price: 100, interval: 'month' }),
        expect.objectContaining({ id: 'price_pro_yearly', tier: 'pro', price: 95, interval: 'year' }),
        expect.objectContaining({ id: 'price_enterprise_yearly', tier: 'enterprise', price: 200, interval: 'year' }),
      ]),
    );
  });

  it('serves the E-Code blog list, featured list, detail, and categories', async () => {
    const postsResponse = toResponse(await blogPostsLoader());
    const posts = await postsResponse.json();

    expect(postsResponse.status).toBe(200);
    expect(posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'introducing-e-code',
          title: 'Introducing E-Code AI Agent 2.0',
          featured: true,
        }),
      ]),
    );

    const featuredResponse = toResponse(await blogFeaturedLoader());
    const featured = await featuredResponse.json();

    expect(featuredResponse.status).toBe(200);
    expect(featured.every((post: { featured: boolean }) => post.featured)).toBe(true);

    const detailResponse = toResponse(await blogPostLoader(loaderArgs({ slug: 'introducing-e-code' })));
    const detail = await detailResponse.json();

    expect(detailResponse.status).toBe(200);
    expect(detail).toMatchObject({ slug: 'introducing-e-code', author: 'E-Code Team' });

    const categoryResponse = toResponse(await blogCategoriesLoader(loaderArgs({ category: 'Product' })));
    const categoryPosts = await categoryResponse.json();

    expect(categoryResponse.status).toBe(200);
    expect(categoryPosts).toEqual([expect.objectContaining({ slug: 'introducing-e-code' })]);
  });

  it('returns the E-Code 404 contract for unknown blog posts', async () => {
    const response = toResponse(await blogPostLoader(loaderArgs({ slug: 'missing-post' })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Blog post not found' });
  });
});
