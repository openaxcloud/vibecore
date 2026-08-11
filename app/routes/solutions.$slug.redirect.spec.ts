import { describe, expect, it } from 'vitest';

import { loader, meta } from './solutions.$slug';

/*
 * BUG-SOL-001: `/solutions/internal-ai` used to 404 because only the canonical
 * `internal-ai-builder` page exists in `solutionPages`. The loader now issues a
 * permanent (308) redirect for the legacy short slug so inbound links and search
 * engines settle on the canonical URL instead of hitting a dead page.
 */

function callLoader(slug: string) {
  return loader({
    params: { slug },
    request: new Request(`https://e-code.ai/solutions/${slug}`),
    context: {},
  } as never);
}

describe('solutions.$slug loader — legacy slug redirects', () => {
  it('308-redirects /solutions/internal-ai to /solutions/internal-ai-builder', () => {
    let thrown: unknown;

    try {
      callLoader('internal-ai');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);

    const response = thrown as Response;
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('/solutions/internal-ai-builder');
  });

  it('still serves the canonical internal-ai-builder page (no redirect)', () => {
    const result = callLoader('internal-ai-builder') as { data: { title: string } };
    expect(result).not.toBeInstanceOf(Response);
    expect(result.data.title).toContain('Internal');
  });

  it('still 404s a genuinely unknown slug', () => {
    let thrown: unknown;

    try {
      callLoader('definitely-not-a-solution');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });

  /*
   * The 404 body used to read "Solution page not found". The boundary never
   * displays it — it renders its own localized copy — but React Router still
   * serialized it into the ErrorResponse payload, so an English string was
   * shipped to French visitors' browsers. Verified live before the fix:
   * GET /solutions/<unknown> with Accept-Language: fr-FR returned a page
   * titled « Cette page est introuvable » whose HTML nonetheless contained
   * the English literal.
   */
  it('404s without shipping an untranslated body to the client', async () => {
    let thrown: unknown;

    try {
      callLoader('definitely-not-a-solution');
    } catch (error) {
      thrown = error;
    }

    expect(await (thrown as Response).text()).toBe('');
  });
});

/*
 * Each of the six known slugs currently has its own static route file, which
 * React Router matches ahead of this dynamic one — so these fallbacks are the
 * safety net for the next slug added without one. They used to be hardcoded
 * English ('Solutions — E-Code' and an English description), which would have
 * emitted English metadata to a French visitor.
 */
describe('solutions.$slug meta — localized fallbacks', () => {
  it('serves French metadata to a French visitor and English to an English one', () => {
    const fr = callLoader('app-builder') as { data: { language: string } };
    expect(fr.data.language).toBeDefined();

    const french = meta({ data: { language: 'fr' } } as never) as Array<Record<string, unknown>>;
    const english = meta({ data: { language: 'en' } } as never) as Array<Record<string, unknown>>;

    const frDescription = french.find((entry) => entry.name === 'description')?.content as string;
    const enDescription = english.find((entry) => entry.name === 'description')?.content as string;

    expect(frDescription).toMatch(/Découvrez les solutions E-Code/);
    expect(enDescription).toMatch(/^Explore E-Code solutions/);
    expect(frDescription).not.toBe(enDescription);
  });

  it('keeps the resolved page title when the loader supplied one', () => {
    const tags = meta({ data: { title: 'App Builder', language: 'fr' } } as never) as Array<Record<string, unknown>>;
    expect(tags[0].title).toBe('App Builder — E-Code');
  });
});
