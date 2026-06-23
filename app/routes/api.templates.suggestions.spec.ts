import { describe, expect, it } from 'vitest';

import { loader } from './api.templates.suggestions';
import { getEcodeTemplateSuggestions } from '~/lib/marketing/ecode-template-catalog.server';

function buildRequest(query: string) {
  return new Request(`http://localhost/api/templates/suggestions${query}`);
}

async function loadSuggestions(query: string): Promise<string[]> {
  /*
   * The route's `json` helper is React Router's `data()`, which returns a
   * serialized-data wrapper rather than a Response, so read `.data`.
   */
  const result = (await loader({
    request: buildRequest(query),
    params: {},
    context: {} as never,
  })) as { data: { suggestions: string[] } };

  return result.data.suggestions;
}

describe('api.templates.suggestions loader', () => {
  it('defaults to 5 suggestions when no limit is provided', async () => {
    const suggestions = await loadSuggestions('');
    expect(suggestions.length).toBe(5);
  });

  it('does not drop trailing suggestions for a negative limit', async () => {
    /*
     * Regression: a negative ?limit used to reach slice(0, negative) and silently
     * drop the last N suggestions instead of returning a bounded list.
     */
    const full = getEcodeTemplateSuggestions(null, 50);

    const negativeTwo = await loadSuggestions('?limit=-2');
    expect(negativeTwo).toEqual([]);

    // The bug would have returned full.slice(0, -2) (all but the last two).
    expect(negativeTwo).not.toEqual(full.slice(0, -2));
  });

  it('returns an empty list for limit=0', async () => {
    const suggestions = await loadSuggestions('?limit=0');
    expect(suggestions).toEqual([]);
  });

  it('clamps oversized limits to the maximum bound', async () => {
    const all = getEcodeTemplateSuggestions(null, Number.MAX_SAFE_INTEGER);
    const clamped = await loadSuggestions('?limit=99999');
    expect(clamped.length).toBe(Math.min(50, all.length));
  });

  it('falls back to the default when limit is not a finite number', async () => {
    const suggestions = await loadSuggestions('?limit=abc');
    expect(suggestions.length).toBe(5);
  });

  it('truncates fractional limits', async () => {
    const suggestions = await loadSuggestions('?limit=3.9');
    expect(suggestions.length).toBe(3);
  });
});
