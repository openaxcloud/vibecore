import { describe, it, expect } from 'vitest';
import { splitRepos, DEFAULT_REPO_PREVIEW_COUNT } from './github-repos-display';

const makeRepos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('splitRepos', () => {
  it('puts everything in the preview when count <= previewCount (no toggle)', () => {
    const repos = makeRepos(12);
    const { preview, remaining, hasMore, hiddenCount } = splitRepos(repos);

    expect(preview).toHaveLength(12);
    expect(remaining).toHaveLength(0);
    expect(hasMore).toBe(false);
    expect(hiddenCount).toBe(0);
  });

  it('splits preview from remaining and reports a reachable toggle when count > previewCount', () => {
    const repos = makeRepos(20);
    const { preview, remaining, hasMore, hiddenCount } = splitRepos(repos);

    /*
     * Regression: the old code rendered the preview/Show-more inside CollapsibleContent
     * (only mounted when expanded) so neither was ever reachable. The split must expose
     * a visible preview AND a positive hidden count so the toggle can render.
     */
    expect(preview).toHaveLength(DEFAULT_REPO_PREVIEW_COUNT);
    expect(remaining).toHaveLength(8);
    expect(hasMore).toBe(true);
    expect(hiddenCount).toBe(8);

    // preview + remaining reconstruct the full list, in order, with no duplication.
    expect([...preview, ...remaining]).toEqual(repos);
  });

  it('honors a custom preview count', () => {
    const repos = makeRepos(10);
    const { preview, remaining, hasMore, hiddenCount } = splitRepos(repos, 3);

    expect(preview).toHaveLength(3);
    expect(remaining).toHaveLength(7);
    expect(hasMore).toBe(true);
    expect(hiddenCount).toBe(7);
  });

  it('handles empty / nullish input without throwing', () => {
    for (const input of [[], undefined, null]) {
      const { preview, remaining, hasMore, hiddenCount } = splitRepos(input as never);
      expect(preview).toEqual([]);
      expect(remaining).toEqual([]);
      expect(hasMore).toBe(false);
      expect(hiddenCount).toBe(0);
    }
  });

  it('treats a non-positive or invalid preview count as zero (everything hidden behind toggle)', () => {
    const repos = makeRepos(5);

    for (const bad of [0, -3, Number.NaN, Infinity]) {
      const { preview, remaining, hasMore } = splitRepos(repos, bad);
      expect(preview).toHaveLength(0);
      expect(remaining).toHaveLength(5);
      expect(hasMore).toBe(true);
    }
  });
});
