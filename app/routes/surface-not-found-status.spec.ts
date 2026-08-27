/**
 * @vitest-environment jsdom
 *
 * Regression test for the soft-404 bug: the dynamic product "surface" routes used to
 * throw their 404 Response from the React component during render, which Remix
 * cannot translate into an HTTP status (the document status is already committed
 * to 200 by the time the component runs). Unknown URLs therefore returned
 * HTTP 200 with a "not found" body, which search engines index as real pages.
 *
 * The internal product surface routes still throw the 404 from their loaders.
 * Public E-Code imports such as /compare/:slug and /solutions/:slug use their
 * in-repo SSR loaders. The /marketing/:slug route is only a namespace catch-all
 * because every supported marketing page has a more specific route module.
 */

import { describe, expect, it } from 'vitest';

import { loader as rootSurfaceLoader } from './$slug';
import { loader as advancedLoader } from './advanced.$section';
import { loader as compareLoader } from './compare.$slug';
import { loader as marketingLoader } from './marketing.$slug';
import { loader as solutionsLoader } from './solutions.$slug';
import { toResponse } from '~/lib/test/rr7-data';

type Loader = (args: {
  request: Request;
  params: Record<string, string | undefined>;
  context: Record<string, never>;
}) => unknown | Promise<unknown>;

async function runLoader(
  loader: Loader,
  params: Record<string, string | undefined>,
  pathname = '/',
): Promise<{ response?: Response; threw: boolean; status?: number }> {
  try {
    /*
     * RR7: loaders that previously returned a Remix `json()` Response now
     * return a `data()` sentinel; normalize both that and a raw `Response`
     * back to a real `Response` so the `.status`/`.headers` assertions below
     * keep working. Routes that 404 still `throw new Response(...)`.
     */
    const raw = await loader({
      request: new Request(`http://app.e-code.ai${pathname}`),
      params,
      context: {},
    });

    const response = toResponse(raw);

    return { response: response instanceof Response ? response : undefined, threw: false };
  } catch (thrown) {
    const normalized = thrown instanceof Response ? thrown : toResponse(thrown);

    if (normalized instanceof Response) {
      return { threw: true, status: normalized.status };
    }

    throw thrown;
  }
}

const cases: Array<{
  name: string;
  loader: Loader;
  knownParams: Record<string, string>;
  unknownParams: Record<string, string>;
}> = [
  {
    name: '$slug (root surface)',
    loader: rootSurfaceLoader as Loader,
    knownParams: { slug: 'home' },
    unknownParams: { slug: 'definitely-not-a-real-surface-xyz' },
  },
  {
    name: 'advanced.$section',
    loader: advancedLoader as Loader,
    knownParams: { section: 'mobile' },
    unknownParams: { section: 'definitely-not-a-real-section-xyz' },
  },
];

const publicMarketingCases: Array<{
  name: string;
  loader: Loader;
  params: Record<string, string>;
  pathname: string;
}> = [
  {
    name: 'solutions.$slug',
    loader: solutionsLoader as Loader,
    params: { slug: 'app-builder' },
    pathname: '/solutions/app-builder',
  },
  {
    name: 'compare.$slug',
    loader: compareLoader as Loader,
    params: { slug: 'heroku' },
    pathname: '/compare/heroku',
  },
];

describe('dynamic surface routes return a true HTTP 404 for unknown slugs', () => {
  for (const { name, loader, knownParams, unknownParams } of cases) {
    it(`${name}: yields a 404 Response for an unknown slug`, async () => {
      const result = await runLoader(loader, unknownParams);

      /*
       * Two valid shapes of a TRUE 404 (BUG-MKT-005): either the loader throws a
       * 404 Response, or it RETURNS a data() response carrying status 404 (the
       * root $slug surface does the latter so React Router still runs its own
       * ErrorBoundary-free branded not-found page). Both commit HTTP 404 before
       * the document status is sealed — what this regression test locks.
       */
      const status = result.threw ? result.status : result.response?.status;

      expect(status).toBe(404);
    });

    it(`${name}: does not throw for a known slug`, async () => {
      const result = await runLoader(loader, knownParams);

      expect(result.threw).toBe(false);
    });
  }

  it('also yields a 404 when the slug param is entirely absent', async () => {
    const result = await runLoader(rootSurfaceLoader as Loader, {});

    expect(result.threw ? result.status : result.response?.status).toBe(404);
  });
});

describe('imported E-Code public dynamic routes resolve for public routing', () => {
  for (const { name, loader, params, pathname } of publicMarketingCases) {
    it(`${name}: serves real in-repo SSR`, async () => {
      const result = await runLoader(loader, params, pathname);

      expect(result.threw).toBe(false);
      expect(result.response?.status).toBe(200);
      expect(result.response?.headers.get('x-e-code-marketing-shell')).toBeNull();
    });
  }
});

describe('marketing namespace catch-all', () => {
  it('returns the localized HTTP 404 instead of the retired English static shell', async () => {
    const result = await runLoader(
      marketingLoader as Loader,
      { slug: 'definitely-not-a-real-marketing-page-xyz' },
      '/marketing/definitely-not-a-real-marketing-page-xyz',
    );

    expect(result.threw).toBe(false);
    expect(result.response?.status).toBe(404);
    expect(result.response?.headers.get('x-e-code-marketing-shell')).toBeNull();
  });
});
