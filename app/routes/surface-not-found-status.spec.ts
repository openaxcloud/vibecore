/**
 * @vitest-environment jsdom
 *
 * Regression test for the soft-404 bug: the dynamic "surface" routes used to
 * throw their 404 Response from the React component during render, which Remix
 * cannot translate into an HTTP status (the document status is already committed
 * to 200 by the time the component runs). Unknown URLs therefore returned
 * HTTP 200 with a "not found" body, which search engines index as real pages.
 *
 * Each route now throws the 404 from its loader, which runs before the status is
 * committed. These tests assert that contract: unknown slug -> thrown 404
 * Response; known slug -> no throw.
 */

import { describe, expect, it } from 'vitest';

import { loader as rootSurfaceLoader } from './$slug';
import { loader as advancedLoader } from './advanced.$section';
import { loader as compareLoader } from './compare.$slug';
import { loader as marketingLoader } from './marketing.$slug';
import { loader as solutionsLoader } from './solutions.$slug';

type Loader = (args: { params: Record<string, string | undefined> }) => unknown;

function runLoader(loader: Loader, params: Record<string, string | undefined>): { threw: boolean; status?: number } {
  try {
    loader({ params });

    return { threw: false };
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
  {
    name: 'solutions.$slug',
    loader: solutionsLoader as Loader,
    knownParams: { slug: 'app-builder' },
    unknownParams: { slug: 'definitely-not-a-real-solution-xyz' },
  },
  {
    name: 'compare.$slug',
    loader: compareLoader as Loader,
    knownParams: { slug: 'heroku' },
    unknownParams: { slug: 'definitely-not-a-real-compare-xyz' },
  },
  {
    name: 'marketing.$slug',
    loader: marketingLoader as Loader,
    knownParams: { slug: 'teams' },
    unknownParams: { slug: 'definitely-not-a-real-campaign-xyz' },
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
