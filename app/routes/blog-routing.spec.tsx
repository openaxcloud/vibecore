/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlogRoute, { loader as blogLoader } from './blog';
import BlogDetailRoute, { loader as detailLoader } from './blog.$slug';
import type { MarketingPageDefinition } from '~/components/marketing/EcodeMarketingPages';
import { createI18nInstance } from '~/lib/i18n/runtime';

/*
 * Isolate the route outlet from the visual renderers. The real router, route
 * components and article loader run; these links do not certify the blog cards.
 */
vi.mock('~/components/marketing/ecode-exact/pages/Blog', () => ({
  default: () => (
    <main>
      <h1>Blog index fixture</h1>
      <Link to="/blog/introducing-e-code?lang=en">Known article fixture</Link>
    </main>
  ),
}));

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

function mount(path: string) {
  vi.stubGlobal('Request', FetchRequest);

  const router = createMemoryRouter(
    [
      {
        path: '/blog',
        Component: BlogRoute,
        loader: blogLoader,
        HydrateFallback: () => null,
        children: [{ path: ':slug', Component: BlogDetailRoute, loader: detailLoader }],
      },
    ],
    { initialEntries: [path] },
  );
  routers.push(router);
  render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );

  return router;
}

describe('nested blog route rendering', () => {
  it('renders the known article from its child loader on direct entry with one shell', async () => {
    mount('/blog/introducing-e-code?lang=en');
    expect(await screen.findByRole('heading', { name: 'Introducing E-Code AI Agent 2.0' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Blog index fixture' })).toBeNull();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('switches from index to child and restores the index through browser history', async () => {
    const router = mount('/blog?lang=en');
    await screen.findByRole('heading', { name: 'Blog index fixture' });
    fireEvent.click(screen.getByRole('link', { name: 'Known article fixture' }));
    expect(await screen.findByRole('heading', { name: 'Introducing E-Code AI Agent 2.0' })).toBeTruthy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    await act(async () => router.navigate(-1));
    expect(await screen.findByRole('heading', { name: 'Blog index fixture' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/blog');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
