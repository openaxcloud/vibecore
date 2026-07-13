import { describe, expect, it, vi } from 'vitest';

/*
 * `google.ts` -> `base-provider.ts` -> `manager.ts` -> `registry.ts` -> every
 * provider -> `base-provider.ts` is a circular import. Stubbing the manager
 * severs the cycle so the real provider class loads cleanly for a unit test
 * that only inspects the static model list.
 */
vi.mock('../manager', () => ({ LLMManager: class {} }));

const googleModule = await import('./google');

describe('GoogleProvider.staticModels', () => {
  const provider = new googleModule.default();

  it('uses gemini-2.5-flash as the index-0 fallback (GA/stable, not a removed 1.5 alias)', () => {
    expect(provider.staticModels[0].name).toBe('gemini-2.5-flash');
  });

  it('contains no bare gemini-1.5-* ids (Google removed them; they 404 under v1beta)', () => {
    const stale = provider.staticModels.filter((m) => /^gemini-1\.5/.test(m.name));
    expect(stale).toEqual([]);
  });

  it('exposes the canonical GA Gemini set with 1M context and 64k output', () => {
    const names = provider.staticModels.map((m) => m.name);
    expect(names).toContain('gemini-2.5-flash');
    expect(names).toContain('gemini-2.5-pro');
    expect(names).toContain('gemini-3.5-flash');

    // Retired by Google (hard-errors on generateContent) — must not resurface.
    expect(names).not.toContain('gemini-2.5-flash-lite');

    for (const model of provider.staticModels) {
      expect(model.maxTokenAllowed).toBe(1048576);
      expect(model.maxCompletionTokens).toBe(65536);
    }
  });
});
