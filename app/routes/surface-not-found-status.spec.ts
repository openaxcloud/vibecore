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
 * Public E-Code imports such as /compare/:slug, /solutions/:slug and
 * /marketing/:slug intentionally serve the copied E-Code static shell for both
 * known and unknown slugs so client-side routing matches the source app.
 */

import { describe, expect, it } from 'vitest';

import { loader as rootSurfaceLoader } from './$slug';
import { loader as advancedLoader } from './advanced.$section';
import { loader as compareLoader } from './compare.$slug';
import { loader as marketingLoader } from './marketing.$slug';
import { loader as solutionsLoader } from './solutions.$slug';

type Loader = (args: {
  request: Request;
  params: Record<string, string | undefined>;
  context: Record<string, never>;
}) => unknown;

function runLoader(
  loader: Loader,
  params: Record<string, string | undefined>,
  pathname = '/',
): { response?: Response; threw: boolean; status?: number } {
  try {
    const response = loader({
      request: new Request(`http://app.e-code.ai${pathname}`),
      params,
      context: {},
    });

    return { response: response instanceof Response ? response : undefined, threw: false };
  } catch (thrown) {
    if (thrown instanceof Response) {
      return { threw: true, status: thrown.status };
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
  {
    name: 'marketing.$slug',
    loader: marketingLoader as Loader,
    params: { slug: 'teams' },
    pathname: '/marketing/teams',
  },
];

describe('dynamic surface routes return a true HTTP 404 for unknown slugs', () => {
  for (const { name, loader, knownParams, unknownParams } of cases) {
    it(`${name}: throws a 404 Response for an unknown slug`, () => {
      const result = runLoader(loader, unknownParams);

      expect(result.threw).toBe(true);
      expect(result.status).toBe(404);
    });

    it(`${name}: does not throw for a known slug`, () => {
      const result = runLoader(loader, knownParams);

      expect(result.threw).toBe(false);
    });
  }

  it('also throws a 404 when the slug param is entirely absent', () => {
    expect(runLoader(rootSurfaceLoader as Loader, {}).status).toBe(404);
  });
});

describe('imported E-Code public dynamic routes serve the static shell', () => {
  for (const { name, loader, params, pathname } of publicMarketingCases) {
    it(`${name}: returns the E-Code shell for public routing`, () => {
      const result = runLoader(loader, params, pathname);

      expect(result.threw).toBe(false);
      expect(result.response?.status).toBe(200);
      expect(result.response?.headers.get('x-vibecore-marketing-shell')).toBe('ecode-static');
    });
  }
});
