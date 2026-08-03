import { describe, expect, it } from 'vitest';

import { loader } from './solutions.$slug';

/*
 * BUG-SOL-001: `/solutions/internal-ai` used to 404 because only the canonical
 * `internal-ai-builder` page exists in `solutionPages`. The loader now issues a
 * permanent (308) redirect for the legacy short slug so inbound links and search
 * engines settle on the canonical URL instead of hitting a dead page.
 */

function callLoader(slug: string, search = '') {
  return loader({
    params: { slug },
    request: new Request(`https://e-code.ai/solutions/${slug}${search}`),
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

  it('preserves the complete query string when redirecting the internal-ai alias', () => {
    let thrown: unknown;

    try {
      callLoader('internal-ai', '?lang=fr&utm_source=legacy');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);

    const response = thrown as Response;
    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe('/solutions/internal-ai-builder?lang=fr&utm_source=legacy');
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
});
