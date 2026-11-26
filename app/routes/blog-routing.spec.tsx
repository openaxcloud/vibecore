/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlogRoute, { loader as blogLoader } from './blog';
import BlogDetailRoute, { loader as detailLoader } from './blog.$slug';
import type { MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import { getMarketingExactLegalBlogCopy } from '~/lib/i18n/catalogs/marketing-exact-legal-blog';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '~/lib/i18n/language';
import { createI18nInstance } from '~/lib/i18n/runtime';
import { getEcodeBlogPosts } from '~/lib/marketing/ecode-public-api-data.server';

vi.mock('~/components/marketing/EcodeMarketingPages', () => ({
  MarketingStaticPage: ({ page }: { page: MarketingPageDefinition }) => (
    <main>
      <h1>{page.title}</h1>
      <p>{page.description}</p>
      <Link to={page.secondaryAction[1]}>{page.secondaryAction[0]}</Link>
    </main>
  ),
}));

const routers: ReturnType<typeof createMemoryRouter>[] = [];

afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  vi.unstubAllGlobals();
});

function mount(path: string, language: SupportedLanguage = 'en') {
  vi.stubGlobal('Request', FetchRequest);

  const router = createMemoryRouter(
    [
      {
        path: '/blog',
        Component: BlogRoute,
        loader: blogLoader,
        HydrateFallback: () => null,
        children: [
          {
            path: ':slug',
            Component: BlogDetailRoute,
            loader: (args) => {
              args.request.headers.set('Accept-Language', language);
              return detailLoader(args);
            },
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  routers.push(router);
  render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );

  return router;
}

describe('nested blog route rendering', () => {
  it('renders the known article from its child loader on direct entry with one shell', async () => {
    mount('/blog/introducing-e-code?lang=en');
    expect(await screen.findByRole('heading', { name: 'Introducing E-Code AI Agent 2.0' })).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: getMarketingExactLegalBlogCopy('en').exactBlog.hero.title }),
    ).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it.each(SUPPORTED_LANGUAGES)(
    'opens the published featured article from the real %s index and returns',
    async (language) => {
      const copy = getMarketingExactLegalBlogCopy(language).exactBlog;
      const router = mount('/blog', language);
      const indexHeading = { name: copy.hero.title };

      await screen.findByRole('heading', indexHeading);

      const links = screen.getAllByRole('link', { name: copy.articles.readMore });
      expect(links).toHaveLength(1);

      const destination = links[0].getAttribute('href');
      const post = getEcodeBlogPosts(language).find((article) => article.featured && article.published);
      expect(destination).toBe(`/blog/${post?.slug}`);
      expect(post?.content).toBeTruthy();

      fireEvent.click(links[0]);
      await screen.findByRole('heading', { name: post!.title });
      expect(router.state.location.pathname).toBe(destination);
      expect(screen.getAllByRole('main')).toHaveLength(1);
      await act(async () => router.navigate(-1));
      await screen.findByRole('heading', indexHeading);
    },
  );
});
